'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, Stethoscope, Trash2, CheckCircle, XCircle, AlertCircle, RefreshCw, Star, Bell, BellOff, ChevronDown, ChevronUp, Plus, CalendarClock, X } from 'lucide-react';

const RATING_CATEGORIES = [
  { key: 'cleanliness',    label: 'نظافة العيادة',                                      emoji: '🏥' },
  { key: 'welcome',        label: 'الترحيب والاستقبال',                                  emoji: '🤝' },
  { key: 'diagnosis',      label: 'دقة التشخيص',                                        emoji: '🔍' },
  { key: 'treatment',      label: 'جودة العلاج والوصفة',                                 emoji: '💊' },
  { key: 'communication',  label: 'مهارة التواصل والشرح',                                emoji: '💬' },
  { key: 'punctuality',    label: 'الالتزام بالمواعيد',                                  emoji: '⏰' },
  { key: 'queue_fairness', label: 'الالتزام بالدور وعدم تقديم الحجز الأبعد على الأقرب', emoji: '🔢' },
];

const AUTH_API  = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const APPT_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/appointments/doctors';
const NOTIF_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/portal-notifications';

const PT_RESCHEDULE_REASONS = ['ظرف طارئ', 'تعارض مع موعد آخر', 'سفر', 'طلب الطبيب', 'أخرى'];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'بانتظار التأكيد', confirmed: 'مؤكد', cancelled: 'ملغي', completed: 'منتهي',
};
const STATUS_ICON: Record<string, any> = {
  pending: AlertCircle, confirmed: CheckCircle, cancelled: XCircle, completed: CheckCircle,
};

function getReminders(): any[] { return JSON.parse(localStorage.getItem('mediflow-appt-reminders') || '[]'); }
function saveReminders(r: any[]) { localStorage.setItem('mediflow-appt-reminders', JSON.stringify(r)); }

export default function AppointmentsPage() {
  const router = useRouter();
  const [bookings, setBookings]   = useState<any[]>([]);
  const [filter, setFilter]       = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [syncing, setSyncing]     = useState(false);
  const [ratingFor, setRatingFor] = useState<any>(null);
  const [ratings, setRatings]     = useState<Record<string, number>>({});
  const [ratingNote, setRatingNote] = useState('');
  const [ratingDone, setRatingDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<{ b: any; newDate: string; reason: string; customReason: string } | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [reminderMap, setReminderMap] = useState<Record<string, { h24: boolean; h6: boolean; custom: boolean }>>({});
  // customMin per booking id (default 30 min)
  const [customMin, setCustomMin] = useState<Record<string, number>>({});

  // Load reminder state for all bookings
  useEffect(() => {
    const stored = getReminders();
    const map: Record<string, { h24: boolean; h6: boolean; custom: boolean }> = {};
    const mins: Record<string, number> = {};
    for (const r of stored) {
      if (!map[r.id]) map[r.id] = { h24: false, h6: false, custom: false };
      if (r.hoursBeforeTarget === 24) map[r.id].h24 = !r.sent;
      if (r.hoursBeforeTarget === 6)  map[r.id].h6  = !r.sent;
      if (r.minutesBeforeTarget != null && r.minutesBeforeTarget !== 120) {
        map[r.id].custom = !r.sent;
        mins[r.id] = r.minutesBeforeTarget;
      }
    }
    setReminderMap(map);
    setCustomMin(prev => ({ ...prev, ...mins }));
  }, []);

  const toggleReminder = (b: any, key: 'h24' | 'h6' | 'custom') => {
    const apptMs = new Date(`${b.date}T${b.prefTime || '09:00'}:00`).getTime();
    const current = reminderMap[b.id] || { h24: false, h6: false, custom: false };
    const newVal = !current[key];

    if (key === 'custom') {
      const mins = customMin[b.id] ?? 30;
      const stored = getReminders().filter((r: any) => !(r.id === b.id && r.minutesBeforeTarget != null));
      if (newVal) {
        stored.push({ id: b.id, doctorName: b.doctorName, date: b.date, time: b.prefTime, minutesBeforeTarget: mins, fireAt: apptMs - mins * 60000, sent: false });
      }
      saveReminders(stored);
    } else {
      const hours = key === 'h24' ? 24 : 6;
      const stored = getReminders().filter((r: any) => !(r.id === b.id && r.hoursBeforeTarget === hours));
      if (newVal) {
        stored.push({ id: b.id, doctorName: b.doctorName, date: b.date, time: b.prefTime, hoursBeforeTarget: hours, fireAt: apptMs - hours * 3600000, sent: false });
      }
      saveReminders(stored);
    }
    setReminderMap(prev => ({ ...prev, [b.id]: { ...current, [key]: newVal } }));
  };

  const updateCustomMin = (b: any, mins: number) => {
    setCustomMin(prev => ({ ...prev, [b.id]: mins }));
    // If already enabled, update the stored reminder fireAt
    if (reminderMap[b.id]?.custom) {
      const apptMs = new Date(`${b.date}T${b.prefTime || '09:00'}:00`).getTime();
      const stored = getReminders().filter((r: any) => !(r.id === b.id && r.minutesBeforeTarget != null));
      stored.push({ id: b.id, doctorName: b.doctorName, date: b.date, time: b.prefTime, minutesBeforeTarget: mins, fireAt: apptMs - mins * 60000, sent: false });
      saveReminders(stored);
    }
  };

  const getRated = (): string[] => JSON.parse(localStorage.getItem('mediflow-rated-bookings') || '[]');

  const openRating = (b: any) => {
    setRatingFor(b);
    setRatings({});
    setRatingNote('');
    setRatingDone(false);
  };

  const submitRating = async () => {
    if (!ratingFor) return;
    const allFilled = RATING_CATEGORIES.every(c => (ratings[c.key] || 0) > 0);
    if (!allFilled) return;
    setSubmitting(true);
    const avg = Math.round(RATING_CATEGORIES.reduce((s, c) => s + (ratings[c.key] || 0), 0) / RATING_CATEGORIES.length * 10) / 10;
    // Save locally
    const stored = JSON.parse(localStorage.getItem('mediflow-doctor-ratings') || '[]');
    stored.push({ bookingId: ratingFor.id, doctorName: ratingFor.doctorName, date: ratingFor.date, ratings, avg, note: ratingNote, createdAt: new Date().toISOString() });
    localStorage.setItem('mediflow-doctor-ratings', JSON.stringify(stored));
    // Mark as rated
    const rated = getRated();
    rated.push(ratingFor.id);
    localStorage.setItem('mediflow-rated-bookings', JSON.stringify(rated));
    setSubmitting(false);
    setRatingDone(true);
  };

  const loadLocal = () => {
    return JSON.parse(localStorage.getItem('mediflow-my-bookings') || '[]');
  };

  const syncFromAPI = async () => {
    setSyncing(true);
    try {
      // Get patient identity from auth + localStorage
      const authRaw = localStorage.getItem('mediflow-auth');
      const authState = authRaw ? JSON.parse(authRaw).state : null;
      const patientEmail = (authState?.user?.email || localStorage.getItem('patient-email') || '').toLowerCase();
      const patientName = (localStorage.getItem('patient-name') || '').toLowerCase();
      const patientPhone = localStorage.getItem('patient-phone') || '';

      // Fetch all approved doctors
      const [reqRes, authRes] = await Promise.all([
        fetch(`${PHARM_API}/admin-requests`, { headers: (() => { try { const t = JSON.parse(localStorage.getItem('mediflow-auth')||'{}').state?.accessToken||''; return {'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})}; } catch { return {'Content-Type':'application/json'}; } })() }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`${AUTH_API}/auth/users/doctors`).then(r => r.json()).catch(() => ({ data: [] })),
      ]);
      const authUsers: any[] = authRes.data || authRes.users || [];
      const approvedDoctors = (reqRes.data || [])
        .filter((d: any) => ['approved','used'].includes(d.status) && d.portal_type === 'doctor')
        .map((d: any) => {
          const au = authUsers.find((u: any) => u.email?.toLowerCase() === d.employee_email?.toLowerCase());
          return { name: d.employee_name, specialization: d.employee_role || 'طب عام', authId: au?.id || null };
        })
        .filter((d: any) => d.authId);

      // Fetch all bookings from each doctor (no date filter)
      const allApiBookings: any[] = [];
      await Promise.all(approvedDoctors.map(async (doc: any) => {
        const r = await fetch(`${APPT_API}/${doc.authId}/bookings`).then(r => r.json()).catch(() => ({ data: [] }));
        for (const b of (r.data || [])) {
          const bName  = (b.patient_name  || '').toLowerCase();
          const bPhone = (b.patient_phone || '');
          const bEmail = (b.patient_email || '').toLowerCase();
          // Match by email, phone, or name — if none stored just show all (single-user device)
          const hasFilter = patientEmail || patientPhone || patientName;
          if (hasFilter) {
            const emailMatch = patientEmail && bEmail && bEmail === patientEmail;
            const phoneMatch = patientPhone && bPhone && bPhone === patientPhone;
            const nameMatch  = patientName  && bName  && bName.includes(patientName);
            if (!emailMatch && !phoneMatch && !nameMatch) continue;
          }
          allApiBookings.push({
            id: b.id,
            doctorName: doc.name,
            doctorAuthId: doc.authId || doc.id || '',
            specialization: doc.specialization,
            date: (b.appointment_date || '').slice(0, 10),
            prefTime: b.appointment_time?.slice(0, 5) || b.notes?.match(/الوقت المفضل: (\d{2}:\d{2})/)?.[1] || '',
            patientName: b.patient_name,
            notes: b.notes || '',
            status: b.status || 'pending',
            createdAt: b.created_at,
            fromAPI: true,
          });
        }
      }));

      // Deduplicate API bookings: same doctor+date → keep only the latest (highest createdAt), prefer non-cancelled
      const apiDeduped: any[] = [];
      for (const bk of allApiBookings) {
        const key = `${bk.doctorAuthId}__${bk.date}`;
        const existing = apiDeduped.findIndex(x => `${x.doctorAuthId}__${x.date}` === key);
        if (existing === -1) {
          apiDeduped.push(bk);
        } else {
          const ex = apiDeduped[existing];
          // Prefer non-cancelled; if tie prefer newer createdAt
          const exCancelled = ex.status === 'cancelled';
          const bkCancelled = bk.status === 'cancelled';
          if (exCancelled && !bkCancelled) { apiDeduped[existing] = bk; }
          else if (!exCancelled && bkCancelled) { /* keep ex */ }
          else if (new Date(bk.createdAt || 0) > new Date(ex.createdAt || 0)) { apiDeduped[existing] = bk; }
        }
      }

      // Merge: API bookings are authoritative.
      // Drop local entries that match an API booking by doctorName+date+patientName
      // (they have different IDs so ID-only check would duplicate them).
      const local = loadLocal();
      const merged = [...apiDeduped];
      for (const lb of local) {
        if (lb.fromAPI) continue; // old API-sourced entry, skip
        const isDuplicate = merged.some(a =>
          (a.date || '').slice(0,10) === (lb.date || '').slice(0,10) &&
          (a.doctorName || '') === (lb.doctorName || '') &&
          (a.patientName || '').trim().toLowerCase() === (lb.patientName || '').trim().toLowerCase()
        );
        if (!isDuplicate) merged.push(lb);
      }
      merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      localStorage.setItem('mediflow-my-bookings', JSON.stringify(merged));
      setBookings(merged);
    } catch {}
    setSyncing(false);
  };

  useEffect(() => {
    const local = loadLocal();
    setBookings(local);
    syncFromAPI();
  }, []);

  const cancelBooking = async (id: string, b?: any) => {
    // Update locally first (instant feedback)
    const target  = b || bookings.find(item => item.id === id);
    const updated = bookings.map(b => b.id === id ? { ...b, status: 'cancelled' } : b);
    setBookings(updated);
    localStorage.setItem('mediflow-my-bookings', JSON.stringify(updated));

    if (!target) return;

    // For API-sourced bookings: patch the backend + notify doctor
    if (target.fromAPI && target.doctorAuthId) {
      const tok = (() => { try { const s = JSON.parse(localStorage.getItem('mediflow-auth') || '{}'); return s.state?.accessToken || s.accessToken || ''; } catch { return ''; } })();
      const hdrs = { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
      // Patch appointment status to cancelled
      await fetch(`${APPT_API}/${target.doctorAuthId}/bookings/${id}`, {
        method: 'PATCH',
        headers: hdrs,
        body: JSON.stringify({ status: 'cancelled' }),
      }).catch(() => {});

      // Notify doctor
      await fetch(NOTIF_API, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          portalType: 'doctor',
          recipientId: target.doctorAuthId,
          senderName: target.patientName || 'المريض',
          message: [
            `❌ إلغاء موعد`,
            `المريض: ${target.patientName || '—'}`,
            `التاريخ: ${target.date}`,
            target.prefTime ? `الوقت: ${target.prefTime}` : '',
          ].filter(Boolean).join('\n'),
        }),
      }).catch(() => {});
    }
  };

  const deleteBooking = (id: string) => {
    const updated = bookings.filter(b => b.id !== id);
    setBookings(updated);
    localStorage.setItem('mediflow-my-bookings', JSON.stringify(updated));
    // Also remove from reminders
    const reminders = JSON.parse(localStorage.getItem('mediflow-appt-reminders') || '[]');
    localStorage.setItem('mediflow-appt-reminders', JSON.stringify(reminders.filter((r: any) => r.id !== id)));
  };

  const doReschedule = async () => {
    if (!rescheduleFor) return;
    const { b, newDate, reason, customReason } = rescheduleFor;
    const finalReason = reason === 'أخرى' ? customReason.trim() : reason;
    if (!newDate || !finalReason) return;
    setRescheduleSaving(true);
    const oldDate = b.date;
    const updatedNotes = [b.notes, `[طلب المريض تغيير الموعد من ${oldDate} إلى ${newDate} — السبب: ${finalReason}]`].filter(Boolean).join('\n');
    // Helper to get patient auth token
    const patientToken = (() => { try { const s = JSON.parse(localStorage.getItem('mediflow-auth') || '{}'); return s.state?.accessToken || s.state?.token || s.accessToken || s.token || ''; } catch { return ''; } })();
    const authHeaders = (extra?: Record<string, string>) => ({ 'Content-Type': 'application/json', ...(patientToken ? { Authorization: `Bearer ${patientToken}` } : {}), ...extra });

    // Patch API for API-sourced bookings
    if (b.fromAPI && b.doctorAuthId && b.id) {
      await fetch(`${APPT_API}/${b.doctorAuthId}/bookings/${b.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ appointment_date: newDate, status: 'pending', notes: updatedNotes }),
      }).catch(() => {});
      // Notify doctor
      await fetch(NOTIF_API, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          portalType: 'doctor',
          recipientId: b.doctorAuthId,
          senderName: b.patientName || 'المريض',
          message: `📅 طلب تغيير موعد\nالمريض: ${b.patientName || 'المريض'}\nمن: ${oldDate}\nإلى: ${newDate}\nالسبب: ${finalReason}\n\nيرجى مراجعة المواعيد وتأكيد الموعد الجديد.`,
        }),
      }).catch(() => {});
    }
    // Update localStorage immediately for instant feedback
    const all = JSON.parse(localStorage.getItem('mediflow-my-bookings') || '[]');
    const updated = all.map((item: any) => item.id === b.id ? { ...item, date: newDate, status: 'pending', notes: updatedNotes } : item);
    localStorage.setItem('mediflow-my-bookings', JSON.stringify(updated));
    setBookings(updated);
    setRescheduleSaving(false);
    setRescheduleFor(null);
    // Re-sync from API so the list reflects the backend's updated date
    setTimeout(() => syncFromAPI(), 800);
  };

  const today = new Date().toISOString().slice(0, 10);

  const filtered = bookings.filter(b => {
    if (filter === 'upcoming') return b.date >= today && b.status !== 'cancelled';
    if (filter === 'past')     return b.date < today || b.status === 'cancelled' || b.status === 'completed';
    return true;
  });

  const grouped: Record<string, any[]> = {};
  for (const b of filtered) {
    if (!grouped[b.date]) grouped[b.date] = [];
    grouped[b.date].push(b);
  }
  const sortedDates = Object.keys(grouped).sort((a, z) =>
    filter === 'past' ? z.localeCompare(a) : a.localeCompare(z)
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-sky-500 px-4 py-6 pt-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">مواعيدي</h1>
            <p className="text-sky-100 text-sm mt-1">جميع حجوزاتك مع الأطباء</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/search?tab=doctor')}
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold px-3 py-2 rounded-xl transition-colors">
              <Plus className="w-4 h-4" /> حجز موعد
            </button>
            <button onClick={syncFromAPI} disabled={syncing}
              className="p-2 bg-sky-400/50 rounded-xl text-white hover:bg-sky-400 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-3">
        <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
          {([['upcoming','القادمة'],['past','السابقة'],['all','الكل']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${filter === key ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-4 space-y-4">
        {filtered.length === 0 ? (
          <div className="pt-16 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-sky-100 rounded-full flex items-center justify-center mb-4">
              <CalendarDays className="w-10 h-10 text-sky-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-700 mb-2">لا توجد مواعيد</h2>
            <p className="text-sm text-gray-400 mb-6">
              {filter === 'upcoming' ? 'ليس لديك مواعيد قادمة حالياً.' : 'لا توجد مواعيد سابقة.'}
            </p>
            {filter === 'upcoming' && (
              <button onClick={() => router.push('/search?tab=doctor')}
                className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-white font-bold px-6 py-3 rounded-2xl transition-colors shadow-md">
                <Plus className="w-5 h-5" /> احجز موعد مع طبيب
              </button>
            )}
          </div>
        ) : sortedDates.map(date => {
          const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const isToday = date === today;
          return (
            <div key={date}>
              {/* Date header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isToday ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {isToday ? 'اليوم' : dateLabel}
                </span>
              </div>

              {/* Bookings for this date */}
              <div className="space-y-3">
                {grouped[date].map(b => {
                  const Icon = STATUS_ICON[b.status] || AlertCircle;
                  const isPast = b.date < today || b.status === 'completed';
                  return (
                    <div key={b.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <button className="w-full p-4 text-right" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
                      <div className="flex items-start gap-3">
                        {/* Doctor avatar */}
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-lg font-bold">
                            {(b.doctorName || 'د')[0]}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{b.doctorName}</p>
                              <p className="text-xs text-sky-600 mt-0.5 flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" />{b.specialization || 'طب عام'}
                              </p>
                            </div>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${STATUS_STYLE[b.status] || STATUS_STYLE.pending}`}>
                              <Icon className="w-3 h-3" />
                              {STATUS_LABEL[b.status] || b.status}
                            </span>
                          </div>

                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-gray-500 flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                              {new Date(b.date + 'T00:00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                            {b.prefTime && (
                              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                الوقت المفضل: {b.prefTime}
                              </p>
                            )}
                            {(() => {
                              const cleanNotes = (b.notes || '')
                                .split('\n')
                                .filter((l: string) => !l.startsWith('الوقت المفضل') && !l.startsWith('وقت الانتهاء') && !l.startsWith('نوع الزيارة') && !l.startsWith('التشخيص') && !l.startsWith('رقم الوصفة') && !l.startsWith('عمر المريض') && !l.startsWith('جنس المريض') && !l.startsWith('رقم الملف'))
                                .join('\n').trim();
                              return cleanNotes ? (
                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{cleanNotes}</p>
                              ) : null;
                            })()}
                          </div>

                          {/* Actions */}
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            {!isPast && (b.status === 'pending' || b.status === 'confirmed') && (
                              <button onClick={(e) => { e.stopPropagation(); const nextDay = new Date(b.date + 'T00:00:00'); nextDay.setDate(nextDay.getDate() + 1); const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); const defaultDate = fmt(nextDay > tomorrow ? nextDay : tomorrow); setRescheduleFor({ b, newDate: defaultDate, reason: PT_RESCHEDULE_REASONS[0], customReason: '' }); }}
                                className="text-xs font-semibold border border-amber-300 text-amber-600 px-3 py-1.5 rounded-xl hover:bg-amber-50 transition-colors flex items-center gap-1">
                                <CalendarClock className="w-3.5 h-3.5" /> تغيير الموعد
                              </button>
                            )}
                            {!isPast && b.status === 'pending' && (
                              <button onClick={(e) => { e.stopPropagation(); cancelBooking(b.id, b); }}
                                className="text-xs text-red-500 font-medium border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
                                إلغاء الموعد
                              </button>
                            )}
                            {b.status === 'completed' && !getRated().includes(b.id) && (
                              <button onClick={(e) => { e.stopPropagation(); openRating(b); }}
                                className="text-xs font-semibold bg-amber-400 hover:bg-amber-500 text-white px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors">
                                <Star className="w-3.5 h-3.5 fill-white" /> قيّم الطبيب
                              </button>
                            )}
                            {b.status === 'completed' && getRated().includes(b.id) && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> تم التقييم
                              </span>
                            )}
                            {(isPast || b.status === 'cancelled') && (
                              <button onClick={(e) => { e.stopPropagation(); deleteBooking(b.id); }}
                                className="text-xs text-gray-400 flex items-center gap-1 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" /> حذف
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Expand indicator */}
                        <div className="mt-2 flex justify-center">
                          {expandedId === b.id
                            ? <ChevronUp className="w-4 h-4 text-gray-300" />
                            : <ChevronDown className="w-4 h-4 text-gray-300" />}
                        </div>
                      </div>
                      </button>

                      {/* Expanded: Notification boxes */}
                      {expandedId === b.id && !isPast && b.status !== 'cancelled' && (
                        <div className="border-t px-4 py-3 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-600 mb-2.5 flex items-center gap-1.5">
                            <Bell className="w-3.5 h-3.5 text-amber-500" /> تذكيرات الموعد
                          </p>
                          {/* Fixed reminder boxes row */}
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            {([['h24','٢٤ س','قبل ٢٤ ساعة'],['h6','٦ س','قبل ٦ ساعات']] as const).map(([key, short, label]) => {
                              const on = reminderMap[b.id]?.[key] ?? false;
                              return (
                                <button key={key} onClick={() => toggleReminder(b, key)}
                                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all ${on ? 'bg-amber-400 border-amber-400 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-200'}`}>
                                  {on ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                                  <span className="text-xs font-bold">{short}</span>
                                  <span className="text-[10px] opacity-75 leading-none text-center">{label}</span>
                                </button>
                              );
                            })}
                            {/* Custom reminder box */}
                            <button onClick={() => toggleReminder(b, 'custom')}
                              className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all ${reminderMap[b.id]?.custom ? 'bg-amber-400 border-amber-400 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-200'}`}>
                              {reminderMap[b.id]?.custom ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                              <span className="text-xs font-bold">{customMin[b.id] ?? 30} د</span>
                              <span className="text-[10px] opacity-75 leading-none">مخصص</span>
                            </button>
                          </div>
                          {/* Slider shown only when custom is active */}
                          {reminderMap[b.id]?.custom && (
                            <div className="bg-white rounded-2xl border border-amber-200 px-3 pt-2 pb-3">
                              <p className="text-xs text-amber-700 font-medium mb-1.5 text-center">قبل {customMin[b.id] ?? 30} دقيقة</p>
                              <input type="range" min={5} max={120} step={5}
                                value={customMin[b.id] ?? 30}
                                onChange={e => updateCustomMin(b, Number(e.target.value))}
                                onClick={e => e.stopPropagation()}
                                className="w-full accent-amber-400" />
                              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                                <span>٥ د</span><span>٦٠ د</span><span>١٢٠ د</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reschedule modal */}
      {rescheduleFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end pb-16" onClick={() => !rescheduleSaving && setRescheduleFor(null)}>
          <div className="bg-white rounded-t-3xl w-full max-h-[85vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mt-4 mb-4 flex-shrink-0" />
            <div className="flex items-center justify-between px-5 pb-3 border-b flex-shrink-0">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-amber-500" />
                <p className="font-bold text-gray-900">تغيير الموعد</p>
              </div>
              <button onClick={() => setRescheduleFor(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-800">
                الموعد الحالي: <span className="font-bold">{new Date(rescheduleFor.b.date + 'T00:00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <span className="mx-2">·</span>{rescheduleFor.b.doctorName}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">التاريخ الجديد</label>
                <input type="date" value={rescheduleFor.newDate} min={fmt(new Date())}
                  onChange={e => setRescheduleFor(r => r ? { ...r, newDate: e.target.value } : r)}
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${rescheduleFor.newDate === rescheduleFor.b.date ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                {rescheduleFor.newDate === rescheduleFor.b.date && (
                  <p className="text-xs text-red-500 mt-1">يجب اختيار تاريخ مختلف عن الموعد الحالي</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">سبب التغيير</label>
                <div className="flex flex-wrap gap-2">
                  {PT_RESCHEDULE_REASONS.map(r => (
                    <button key={r} onClick={() => setRescheduleFor(prev => prev ? { ...prev, reason: r } : prev)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${rescheduleFor.reason === r ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                {rescheduleFor.reason === 'أخرى' && (
                  <input value={rescheduleFor.customReason} onChange={e => setRescheduleFor(r => r ? { ...r, customReason: e.target.value } : r)}
                    placeholder="اكتب سبب التغيير..."
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                )}
              </div>
            </div>
            <div className="px-5 pb-10 pt-3 flex gap-3 border-t flex-shrink-0">
              <button onClick={() => setRescheduleFor(null)}
                className="flex-1 border border-gray-300 py-3 rounded-2xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={doReschedule} disabled={rescheduleSaving || !rescheduleFor.newDate || rescheduleFor.newDate === rescheduleFor.b.date || (rescheduleFor.reason === 'أخرى' && !rescheduleFor.customReason.trim())}
                className="flex-1 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-white py-3 rounded-2xl text-sm font-bold transition-colors">
                {rescheduleSaving ? 'جاري...' : 'تأكيد التغيير'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rating modal */}
      {ratingFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => !submitting && setRatingFor(null)}>
          <div className="bg-white rounded-t-3xl w-full max-h-[92vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mt-4 mb-4" />

            {ratingDone ? (
              <div className="p-6 pb-16 text-center">
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star className="w-10 h-10 fill-amber-400 text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">شكراً على تقييمك!</h2>
                <p className="text-sm text-gray-500 mb-6">رأيك يساعد في تحسين الخدمة الطبية</p>
                <button onClick={() => setRatingFor(null)}
                  className="w-full bg-sky-500 text-white py-3 rounded-2xl font-semibold text-sm">
                  إغلاق
                </button>
              </div>
            ) : (
              <div className="p-5 pb-16">
                {/* Doctor info */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-lg font-bold">{(ratingFor.doctorName || 'د')[0]}</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">تقييم {ratingFor.doctorName}</h2>
                    <p className="text-xs text-gray-400">{new Date(ratingFor.date + 'T00:00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  </div>
                </div>

                {/* Categories */}
                <div className="space-y-4 mb-5">
                  {RATING_CATEGORIES.map(cat => (
                    <div key={cat.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                          <span>{cat.emoji}</span>{cat.label}
                        </span>
                        {ratings[cat.key] > 0 && (
                          <span className="text-xs font-bold text-amber-500">{ratings[cat.key]}/5</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {[1,2,3,4,5].map(star => (
                          <button key={star} onClick={() => setRatings(r => ({ ...r, [cat.key]: star }))}
                            className="flex-1 py-2 rounded-xl transition-colors border"
                            style={{ background: star <= (ratings[cat.key] || 0) ? '#f59e0b' : '#f9fafb', borderColor: star <= (ratings[cat.key] || 0) ? '#f59e0b' : '#e5e7eb' }}>
                            <Star className={`w-4 h-4 mx-auto ${star <= (ratings[cat.key] || 0) ? 'fill-white text-white' : 'text-gray-300'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Overall average preview */}
                {RATING_CATEGORIES.every(c => ratings[c.key] > 0) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">التقييم الإجمالي</p>
                    <div className="flex items-center justify-center gap-1">
                      {[1,2,3,4,5].map(s => {
                        const avg = RATING_CATEGORIES.reduce((sum, c) => sum + (ratings[c.key] || 0), 0) / RATING_CATEGORIES.length;
                        return <Star key={s} className={`w-5 h-5 ${s <= Math.round(avg) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />;
                      })}
                      <span className="text-sm font-bold text-amber-600 mr-1">
                        {(RATING_CATEGORIES.reduce((s,c) => s+(ratings[c.key]||0),0)/RATING_CATEGORIES.length).toFixed(1)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Optional note */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظة (اختياري)</label>
                  <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)}
                    placeholder="أضف تعليقاً أو ملاحظة..."
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setRatingFor(null)}
                    className="flex-1 border border-gray-300 py-3 rounded-2xl text-sm font-medium text-gray-700">
                    إلغاء
                  </button>
                  <button onClick={submitRating}
                    disabled={submitting || !RATING_CATEGORIES.every(c => ratings[c.key] > 0)}
                    className="flex-1 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-white py-3 rounded-2xl text-sm font-bold transition-colors">
                    {submitting ? 'جاري الإرسال...' : 'إرسال التقييم'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
