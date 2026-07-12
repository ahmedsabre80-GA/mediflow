'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Calendar, Clock, Users, CheckCircle, XCircle, Trash2, Plus, X, RefreshCw,
  ChevronLeft, ChevronRight, ClipboardCheck, FileText, PlusCircle, Phone, CalendarPlus,
  UserCheck, Stethoscope, AlertCircle, Eye, CalendarClock } from 'lucide-react';
import { PrescriptionPreview } from '@/components/PrescriptionPreview';

const API        = 'https://mediflow-production-d815.up.railway.app/api/v1/appointments/doctors';
const NOTIF_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/portal-notifications';
const PHARM_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/active';
const AUTH_API   = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const EV_KEY     = 'mediflow-expected-visitors';

function drToken(): string {
  try { return localStorage.getItem('doctor-token') || ''; } catch { return ''; }
}
function notifHeaders(): Record<string, string> {
  const t = drToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

const DAYS     = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'معلق', confirmed: 'مؤكد', cancelled: 'ملغي', completed: 'منتهي',
};

interface ExpectedVisitor {
  id: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  revisitDate: string;   // YYYY-MM-DD
  prescriptionId: string;
  diagnosis: string;
  createdAt: string;
  called: boolean;
  calledAt?: string;
  booked: boolean;
}

function getEV(): ExpectedVisitor[] { return JSON.parse(localStorage.getItem(EV_KEY) || '[]'); }
function saveEV(ev: ExpectedVisitor[]) { localStorage.setItem(EV_KEY, JSON.stringify(ev)); }

const PT_RX_KEY  = 'doctor-patient-rx-history';
const STATE_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/user-state';
interface PatientRxRecord { patientName: string; rxId: string; date: string; rxText: string; }
function getPatientRxHistory(): PatientRxRecord[] { try { return JSON.parse(localStorage.getItem(PT_RX_KEY) || '[]'); } catch { return []; } }

async function pushRxHistory(list: PatientRxRecord[]) {
  try {
    const token  = localStorage.getItem('doctor-token') || '';
    const userId = localStorage.getItem('doctor-user-id') || '';
    if (!token || !userId) return;
    await fetch(`${STATE_API}/${userId}/rx-history`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ value: list }),
    });
  } catch {}
}

async function pullRxHistory(): Promise<PatientRxRecord[]> {
  try {
    const token  = localStorage.getItem('doctor-token') || '';
    const userId = localStorage.getItem('doctor-user-id') || '';
    if (!token || !userId) return [];
    const r = await fetch(`${STATE_API}/${userId}/rx-history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (d.success && Array.isArray(d.data) && d.data.length > 0) return d.data;
  } catch {}
  return [];
}

function savePatientRx(record: PatientRxRecord) {
  const list = getPatientRxHistory();
  list.unshift(record);
  const next = list.slice(0, 500);
  localStorage.setItem(PT_RX_KEY, JSON.stringify(next));
  pushRxHistory(next);
}
function getHistoryForPatient(patientName: string) {
  return getPatientRxHistory().filter(r => r.patientName.trim().toLowerCase() === patientName.trim().toLowerCase());
}

function weekDates(offset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offset * 7);
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function prescriptionId(patientName: string) {
  const now = new Date();
  const dd   = String(now.getDate()).padStart(2,'0');
  const mm   = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2,'0');
  const min  = String(now.getMinutes()).padStart(2,'0');
  const ss   = String(now.getSeconds()).padStart(2,'0');
  return `${patientName}_${dd}-${mm}-${yyyy}_${hh}:${min}:${ss}`;
}

function AppointmentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initTab = (searchParams.get('tab') as any) || 'calendar';
  const [doctorId, setDoctorId]   = useState('');
  const [tab, setTab]             = useState<'calendar'|'all'|'schedule'|'patients'|'expected'>(initTab);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [allLoading, setAllLoading]   = useState(false);
  // email → patient auth user ID — built from bookings that have patient_id
  const [patientIdMap, setPatientIdMap] = useState<Record<string, string>>({});
  const [weekOffset, setWeekOffset]   = useState(0);
  const [selectedDate, setSelectedDate] = useState(fmt(new Date()));
  const [bookings, setBookings]   = useState<any[]>([]);
  const [schedule, setSchedule]   = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [loading, setLoading]     = useState(false);
  const [toast, setToast]         = useState('');

  // Expected visitors
  const [expectedVisitors, setExpectedVisitors] = useState<ExpectedVisitor[]>([]);

  // Schedule editor
  const [editDay, setEditDay]   = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ start_time: '09:00', end_time: '17:00', max_patients: '10', is_active: true });
  const [saving, setSaving]     = useState(false);

  // Template
  const [template, setTemplate]           = useState({ start_time: '09:00', end_time: '17:00', max_patients: '10' });
  const [templateDays, setTemplateDays]   = useState<boolean[]>([true,true,true,true,true,false,false]);
  const [templateMode, setTemplateMode]   = useState<'weekly'|'monthly'>('weekly');
  const [templateMonth, setTemplateMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [disabledDates, setDisabledDates] = useState<Set<string>>(new Set());
  const [templateSaving, setTemplateSaving] = useState(false);

  // Prescription modal
  const [rxBooking, setRxBooking]     = useState<any>(null);
  const [rxDrugs, setRxDrugs]         = useState([{ name:'', dose:'', times:'', duration:'', notes:'' }]);
  const [rxDiagnosis, setRxDiagnosis] = useState('');
  const [rxSaving, setRxSaving]       = useState(false);
  const [enableRevisit, setEnableRevisit] = useState(false);
  const [revisitDate, setRevisitDate]     = useState('');
  const [savedRx, setSavedRx]         = useState<Record<string, string>>({});
  const [rxTab, setRxTab]             = useState<'edit'|'preview'>('edit');
  const [rxDrProfile, setRxDrProfile] = useState({ name:'', degree:'', specialty:'', address:'', phone:'', social:'', certNumber:'', clinicName:'', themeColor:'#2d6b5e', fontSize:'md' });
  const [rxCertificates, setRxCertificates] = useState<string[]>([]);
  const [rxClinicLogo, setRxClinicLogo] = useState('');
  const [rxHandToPatient, setRxHandToPatient] = useState(true);
  const [rxSendToPharmacy, setRxSendToPharmacy] = useState(false);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(false);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
  const [pharmSearch, setPharmSearch] = useState('');
  // Per-booking arrived map: bookingId → true when doctor marks patient as arrived & paid
  const [arrivedMap, setArrivedMap] = useState<Record<string, boolean>>({});
  // Per-booking history choice: null = not chosen yet, 'show' = view history, 'skip' = skip
  const [historyChoice, setHistoryChoice] = useState<Record<string, 'show'|'skip'>>({});
  // Patient history modal
  const [patientHistoryModal, setPatientHistoryModal] = useState<{name: string; records: {rxId:string; date:string; rxText:string}[]} | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Reschedule modal
  const [rescheduleFor, setRescheduleFor] = useState<{ b: any; newDate: string; reason: string; customReason: string } | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  // Booking open time setting
  const [bookingOpenMode, setBookingOpenMode] = useState<'general'|'per-day'|'always'>('general');
  const [bookingOpenGeneral, setBookingOpenGeneral] = useState('08:00');
  const [bookingOpenPerDay, setBookingOpenPerDay] = useState<Record<number,string>>({0:'08:00',1:'08:00',2:'08:00',3:'08:00',4:'08:00',5:'08:00',6:'08:00'});
  const [bookingOpenSaved, setBookingOpenSaved] = useState(false);

  // Booking modal (add / complete expected visitor)
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ patient_name:'', patient_phone:'', patient_email:'', appointment_date: fmt(new Date()), appointment_time:'', notes:'' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError]   = useState('');
  const [fromEV, setFromEV]       = useState<string|null>(null); // expectedVisitor id if booking from EV

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Load expected visitors from localStorage
  const loadEV = useCallback(() => { setExpectedVisitors(getEV()); }, []);

  useEffect(() => {
    const id = localStorage.getItem('doctor-id') || '';
    setDoctorId(id);
    loadEV();
    // Load arrived map
    try { const a = localStorage.getItem('doctor-patient-arrived'); if (a) setArrivedMap(JSON.parse(a)); } catch {}
    // Load booking open time settings
    const raw = localStorage.getItem('doctor-booking-open-times');
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.mode) setBookingOpenMode(saved.mode);
      if (saved.generalTime) setBookingOpenGeneral(saved.generalTime);
      if (saved.perDay) setBookingOpenPerDay(saved.perDay);
    }
    // Sync rx history from backend (cross-device)
    pullRxHistory().then(remote => {
      if (remote.length > 0) {
        const local = getPatientRxHistory();
        // Merge: remote wins, deduplicate by rxId
        const merged = [...remote, ...local].filter(
          (r, i, arr) => arr.findIndex(x => x.rxId === r.rxId) === i
        ).slice(0, 500);
        localStorage.setItem(PT_RX_KEY, JSON.stringify(merged));
      }
    });
  }, [loadEV]);

  // Check if any expected visitor needs a call reminder (1-2 days before revisit)
  useEffect(() => {
    if (!doctorId) return;
    const doctorName = localStorage.getItem('doctor-name') || 'الطبيب';
    const userId = localStorage.getItem('doctor-user-id') || '';
    if (!userId) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const ev = getEV();
    const due = ev.filter(v => {
      if (v.called || v.booked) return false;
      const revisit = new Date(v.revisitDate + 'T00:00:00');
      const daysLeft = Math.ceil((revisit.getTime() - today.getTime()) / 86400000);
      return daysLeft === 1 || daysLeft === 2;
    });
    if (due.length === 0) return;
    // Send one notification for all due
    const names = due.map(v => v.patientName).join('، ');
    fetch(NOTIF_API, {
      method: 'POST',
      headers: notifHeaders(),
      body: JSON.stringify({
        portalType: 'doctor',
        recipientId: userId,
        senderName: 'ميديفلو',
        message: `📞 تذكير بالاتصال بالمرضى\nيوجد ${due.length} مريض يحتاج اتصال قبل موعد مراجعته:\n${names}\nاضغط هنا للذهاب إلى قائمة الزيارات المتوقعة`,
      }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  const loadSchedule = useCallback(async () => {
    if (!doctorId) return;
    const r = await fetch(`${API}/${doctorId}/schedule`).then(r => r.json()).catch(() => ({ data:[] }));
    setSchedule(r.data || []);
  }, [doctorId]);

  const buildPatientIdMap = (bks: any[]) => {
    const map: Record<string, string> = {};
    for (const b of bks) {
      const email = b.patient_email || b.patientEmail || '';
      const pid   = b.patient_id   || b.patientId   || '';
      if (email && pid) map[email.toLowerCase()] = String(pid);
    }
    setPatientIdMap(prev => ({ ...prev, ...map }));
  };

  const loadBookings = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    const r  = await fetch(`${API}/${doctorId}/bookings?date=${selectedDate}`).then(r => r.json()).catch(() => ({ data:[] }));
    const bks = r.data || [];
    setBookings(bks);
    buildPatientIdMap(bks);
    const av = await fetch(`${API}/${doctorId}/availability?date=${selectedDate}`).then(r => r.json()).catch(() => null);
    setAvailability(av?.data || null);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, selectedDate]);

  useEffect(() => { if (doctorId) { loadSchedule(); loadBookings(); } }, [doctorId, loadSchedule, loadBookings]);

  const week = weekDates(weekOffset);

  // Prescription button is active if: booking date is today (within 1h of start) or past
  const toggleArrived = (id: string) => {
    setArrivedMap(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem('doctor-patient-arrived', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const saveBookingOpenTimes = () => {
    localStorage.setItem('doctor-booking-open-times', JSON.stringify({
      mode: bookingOpenMode,
      generalTime: bookingOpenGeneral,
      perDay: bookingOpenPerDay,
    }));
    setBookingOpenSaved(true);
    setTimeout(() => setBookingOpenSaved(false), 2000);
  };

  const openRx = (b: any) => {
    setRxBooking(b);
    setRxDrugs([{ name:'', dose:'', times:'', duration:'', notes:'' }]);
    setRxDiagnosis('');
    setEnableRevisit(false);
    setRevisitDate('');
    setRxSaving(false);
    setRxTab('edit');
    setRxHandToPatient(true);
    setRxSendToPharmacy(false);
    setSelectedPharmacyId('');
    setPharmSearch('');
    // Load doctor prescription profile from settings
    const raw = localStorage.getItem('doctor-rx-profile');
    if (raw) {
      const rx = JSON.parse(raw);
      setRxDrProfile({
        name:       rx.name       || localStorage.getItem('doctor-name')      || '',
        degree:     rx.degree     || '',
        specialty:  rx.specialty  || localStorage.getItem('doctor-specialty') || '',
        address:    rx.address    || '',
        phone:      rx.phone      || localStorage.getItem('doctor-phone')     || '',
        social:     rx.social     || '',
        certNumber: rx.certNumber || '',
        clinicName: rx.clinicName  || '',
        themeColor: rx.themeColor  || '#2d6b5e',
        fontSize:   rx.fontSize    || 'md',
      });
      setRxCertificates(rx.certificates || []);
      setRxClinicLogo(rx.clinicLogo || '');
    } else {
      setRxDrProfile({
        name:       localStorage.getItem('doctor-name')      || '',
        degree:     '',
        specialty:  localStorage.getItem('doctor-specialty') || '',
        address:    '',
        phone:      localStorage.getItem('doctor-phone')     || '',
        social:     '',
        certNumber: '',
        clinicName: '',
        themeColor: '#2d6b5e',
        fontSize:   'md',
      });
      setRxCertificates([]);
      setRxClinicLogo('');
    }
  };

  const loadPharmacies = async () => {
    setPharmaciesLoading(true);
    try {
      const t = drToken();
      const res = await fetch(PHARM_API, t ? { headers: { Authorization: `Bearer ${t}` } } : undefined);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data || data.pharmacies || []);
      setPharmacies(list.filter((p: any) => p.status === 'active' || !p.status));
    } catch { setPharmacies([]); }
    setPharmaciesLoading(false);
  };

  const savePdf = (rxId: string) => {
    const el = document.getElementById('rx-print-area');
    if (!el) return;
    const html = el.innerHTML;
    const w = window.open('', '_blank', 'width=860,height=1000');
    if (!w) return;
    w.document.title = rxId;
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
      <title>${rxId}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body{margin:0;padding:24px;font-family:'Cairo','Segoe UI',sans-serif;background:#fff}
        @media print{body{padding:0}@page{size:A4;margin:15mm}}
      </style>
      </head><body>${html}<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);})<\/script></body></html>`);
    w.document.close();
  };

  const saveRx = async () => {
    if (!rxBooking) return;
    setRxSaving(true);

    // Build prescription ID and text
    const rxId = prescriptionId(rxBooking.patient_name || 'مريض');
    const lines = [
      `رقم الوصفة: ${rxId}`,
      `التشخيص: ${rxDiagnosis || '—'}`,
      '',
      'الأدوية:',
      ...rxDrugs
        .filter(d => d.name.trim())
        .map((d, i) =>
          `${i+1}. ${d.name}${d.dose?' - '+d.dose+'mg':''}${d.times?' - '+d.times+' مرة/يوم':''}${d.duration?' - '+d.duration+' يوم':''}${d.notes?' ('+d.notes+')':''}`
        ),
      ...(enableRevisit && revisitDate ? ['', `موعد المراجعة: ${new Date(revisitDate+'T00:00:00').toLocaleDateString('ar-IQ',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`] : []),
    ];
    const rxText = lines.join('\n');
    const doctorName = localStorage.getItem('doctor-name') || 'الطبيب';
    const patientId  = rxBooking.patient_id || rxBooking.patientId || '';

    // 1. Mark booking as completed
    try { await updateStatus(rxBooking.id, 'completed'); } catch {}

    // 2. Notify patient with prescription
    if (patientId) {
      try {
        await fetch(NOTIF_API, {
          method: 'POST',
          headers: notifHeaders(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: patientId,
            senderName: doctorName,
            message: `📋 وصفتك الطبية\nمن الدكتور: ${doctorName}\n\n${rxText}`,
          }),
        });
      } catch {}

      // 3. Send rating request to patient
      try {
        await fetch(NOTIF_API, {
          method: 'POST',
          headers: notifHeaders(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: patientId,
            senderName: doctorName,
            message: `⭐ كيف كانت تجربتك مع ${rxDrProfile.name ? `د. ${rxDrProfile.name}` : 'الطبيب'}؟\nنرجو تقييم زيارتك من 1 إلى 5 نجوم عبر بوابة المريض.`,
          }),
        });
      } catch {}
    }

    // 4. Save expected visitor if revisit enabled
    if (enableRevisit && revisitDate) {
      const ev = getEV();
      ev.push({
        id: rxId,
        patientName:  rxBooking.patient_name  || '',
        patientPhone: rxBooking.patient_phone || '',
        patientEmail: rxBooking.patient_email || '',
        revisitDate,
        prescriptionId: rxId,
        diagnosis: rxDiagnosis,
        createdAt: new Date().toISOString(),
        called: false,
        booked: false,
      });
      saveEV(ev);
      loadEV();
    }

    // 5. Send to pharmacy if selected
    if (rxSendToPharmacy && selectedPharmacyId) {
      try {
        const pharm = pharmacies.find(p => String(p.id || p._id) === selectedPharmacyId);
        // Use owner_id as recipientId — that's what the pharmacy portal polls with
        const pharmRecipientId = pharm?.owner_id || selectedPharmacyId;
        await fetch(NOTIF_API, {
          method: 'POST',
          headers: notifHeaders(),
          body: JSON.stringify({
            portalType: 'pharmacy',
            recipientId: pharmRecipientId,
            senderName: rxDrProfile.name ? `د. ${rxDrProfile.name}` : 'الطبيب',
            message: `💊 وصفة طبية جديدة\nالمريض: ${rxBooking.patient_name || '—'}\nمن الدكتور: ${rxDrProfile.name || 'الطبيب'}\n\n${rxText.split('\n').filter(l => !l.startsWith('موعد المراجعة')).join('\n').trimEnd()}`,
          }),
        });
        showToast(`✅ تم إرسال الوصفة إلى ${pharm?.name_ar || pharm?.name || 'الصيدلية'} وحفظها`);
      } catch {
        showToast('✅ تم حفظ الوصفة (تعذر إرسالها للصيدلية)');
      }
    } else {
      showToast('✅ تم حفظ الوصفة وإنهاء الفحص');
    }

    // Save to patient history
    savePatientRx({
      patientName: rxBooking.patient_name || 'مريض',
      rxId,
      date: new Date().toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' }),
      rxText,
    });

    setSavedRx(prev => ({ ...prev, [rxBooking.id]: rxText }));
    setRxSaving(false);

    // 6. Switch to preview, trigger PDF save, then close modal
    setRxTab('preview');
    setTimeout(() => {
      savePdf(rxId);
      setTimeout(() => setRxBooking(null), 800);
    }, 350);

    // Refresh bookings list to reflect completed status
    loadBookings();
    if (tab === 'all') loadAllBookings();
  };

  // ── Schedule ──────────────────────────────────────────────────────────────
  const saveScheduleDay = async () => {
    if (editDay === null || !doctorId) return;
    setSaving(true);
    await fetch(`${API}/${doctorId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: editDay, ...editForm, max_patients: Number(editForm.max_patients) }),
    }).catch(() => {});
    setSaving(false);
    setEditDay(null);
    loadSchedule();
    showToast('✅ تم حفظ الجدول');
  };

  const applyTemplate = async () => {
    if (!doctorId) return;
    setTemplateSaving(true);
    if (templateMode === 'weekly') {
      await Promise.all(
        templateDays.map((active, dow) =>
          fetch(`${API}/${doctorId}/schedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day_of_week:dow, start_time:template.start_time, end_time:template.end_time, max_patients:Number(template.max_patients), is_active:active }),
          }).catch(()=>{})
        )
      );
      showToast('✅ تم تطبيق القالب الأسبوعي');
    } else {
      const { y, m } = templateMonth;
      const total = new Date(y, m+1, 0).getDate();
      const activeDows = new Set<number>(), inactiveDows = new Set<number>();
      for (let d = 1; d <= total; d++) {
        const date = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dow  = new Date(date+'T00:00:00').getDay();
        if (templateDays[dow] && !disabledDates.has(date)) activeDows.add(dow); else inactiveDows.add(dow);
      }
      await Promise.all(
        Array.from({ length:7 }, (_,dow) =>
          fetch(`${API}/${doctorId}/schedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day_of_week:dow, start_time:template.start_time, end_time:template.end_time, max_patients:Number(template.max_patients), is_active:activeDows.has(dow) }),
          }).catch(()=>{})
        )
      );
      showToast('✅ تم تطبيق القالب الشهري');
    }
    setTemplateSaving(false);
    loadSchedule();
  };

  const openEditDay = (dow: number) => {
    const existing = schedule.find(s => s.day_of_week === dow);
    setEditForm(existing ? {
      start_time: existing.start_time.slice(0,5),
      end_time:   existing.end_time.slice(0,5),
      max_patients: String(existing.max_patients),
      is_active: existing.is_active,
    } : { start_time:'09:00', end_time:'17:00', max_patients:'10', is_active:true });
    setEditDay(dow);
  };

  const updateStatus = async (bookingId: string, status: string) => {
    await fetch(`${API}/${doctorId}/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(()=>{});

    // Send patient notification on confirm or cancel
    if (status === 'confirmed' || status === 'cancelled') {
      const booking = [...bookings, ...allBookings].find(b => String(b.id) === String(bookingId));
      const patientId = booking?.patient_id || booking?.patientId || patientIdMap[(booking?.patient_email || '').toLowerCase()] || '';
      if (patientId) {
        const doctorName = localStorage.getItem('doctor-name') || 'الطبيب';
        const msg = status === 'confirmed'
          ? `✅ تم تأكيد موعدك\nالتاريخ: ${booking?.appointment_date || ''}\nمع الدكتور: ${doctorName}\n\nيمكنك مراجعة تفاصيل موعدك من قسم "مواعيدي".`
          : `❌ تم إلغاء موعدك\nالتاريخ: ${booking?.appointment_date || ''}\nمع الدكتور: ${doctorName}\n\nيرجى التواصل معنا لإعادة الحجز.`;
        fetch(NOTIF_API, {
          method: 'POST',
          headers: notifHeaders(),
          body: JSON.stringify({ portalType: 'patient', recipientId: patientId, senderName: `د. ${doctorName}`, message: msg }),
        }).catch(() => {});
      }
    }

    loadBookings();
    showToast(status==='confirmed' ? '✅ تم تأكيد الموعد' : status==='completed' ? '✅ تم إنهاء الفحص' : '❌ تم إلغاء الموعد');
  };

  const confirmDelete = (bookingId: string) => setDeleteConfirm(bookingId);

  const deleteBooking = async () => {
    if (!deleteConfirm) return;
    await fetch(`${API}/${doctorId}/bookings/${deleteConfirm}`, { method:'DELETE' }).catch(()=>{});
    setDeleteConfirm(null);
    setAllBookings(prev => prev.filter(x => x.id !== deleteConfirm));
    loadBookings();
    showToast('🗑️ تم حذف الموعد');
  };

  const DR_RESCHEDULE_REASONS = ['طلب المريض', 'انشغال الطبيب', 'ظروف طارئة', 'إعادة جدولة روتينية', 'أخرى'];

  const doReschedule = async () => {
    if (!rescheduleFor) return;
    const { b, newDate, reason, customReason } = rescheduleFor;
    const finalReason = reason === 'أخرى' ? customReason.trim() : reason;
    if (!newDate || !finalReason) return;
    setRescheduleSaving(true);
    const oldDate = b.appointment_date || selectedDate;
    const updatedNotes = [b.notes, `[تم تغيير الموعد من ${oldDate} إلى ${newDate} — السبب: ${finalReason}]`].filter(Boolean).join('\n');
    await fetch(`${API}/${doctorId}/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_date: newDate, notes: updatedNotes }),
    }).catch(() => {});
    // Notify patient
    const patientId = b.patient_id || b.patientId || '';
    const doctorName = localStorage.getItem('doctor-name') || 'الطبيب';
    if (patientId) {
      await fetch(NOTIF_API, {
        method: 'POST',
        headers: notifHeaders(),
        body: JSON.stringify({
          portalType: 'patient',
          recipientId: patientId,
          senderName: doctorName,
          message: `📅 تم تغيير موعدك\nمن: ${oldDate}\nإلى: ${newDate}\nالسبب: ${finalReason}\n\nيرجى التأكد من الموعد الجديد.`,
        }),
      }).catch(() => {});
    }
    setRescheduleSaving(false);
    setRescheduleFor(null);
    loadBookings();
    if (tab === 'all') loadAllBookings();
    showToast(`✅ تم تغيير الموعد إلى ${newDate}`);
  };

  const addBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSaving(true);

    // Embed time in notes so patient portal can extract it
    const timeNote  = addForm.appointment_time ? `الوقت المفضل: ${addForm.appointment_time}` : '';
    const fullNotes = [timeNote, addForm.notes].filter(Boolean).join('\n');
    const payload   = { ...addForm, notes: fullNotes };
    delete (payload as any).appointment_time;

    const res = await fetch(`${API}/${doctorId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setAddSaving(false);
    if (!res.ok) { setAddError(d?.error?.title || 'فشل الحجز'); return; }

    // Mark expected visitor as booked
    if (fromEV) {
      const ev = getEV().map(v => v.id === fromEV ? { ...v, booked:true } : v);
      saveEV(ev); loadEV(); setFromEV(null);
    }

    // Notify patient — try multiple methods to resolve their auth user ID
    const doctorName = localStorage.getItem('doctor-name') || 'الطبيب';
    const notifMsg = [
      `📅 تم حجز موعدك`,
      `التاريخ: ${addForm.appointment_date}`,
      addForm.appointment_time ? `الوقت: ${addForm.appointment_time}` : '',
      `الطبيب: د. ${doctorName}`,
      addForm.notes ? `ملاحظات: ${addForm.notes}` : '',
      `\nيمكنك مراجعة موعدك أو تغييره من قسم "مواعيدي" في بوابة المريض.`,
    ].filter(Boolean).join('\n');

    const sendPatientNotif = async (recipientId: string) => {
      await fetch(NOTIF_API, {
        method: 'POST',
        headers: notifHeaders(),
        body: JSON.stringify({ portalType: 'patient', recipientId, senderName: `د. ${doctorName}`, message: notifMsg }),
      }).catch(() => {});
    };

    if (addForm.patient_email) {
      const emailKey = addForm.patient_email.toLowerCase();

      // 1. Check booking response — backend may include patient_id when patient is registered
      const patientIdFromBooking = d?.data?.patient_id || d?.data?.patientId || d?.patient_id || '';

      // 2. Check map built from existing bookings (works when patient previously booked via patient portal)
      const patientIdFromMap = patientIdMap[emailKey] || '';

      const resolvedId = String(patientIdFromBooking || patientIdFromMap);

      if (resolvedId) {
        await sendPatientNotif(resolvedId);
      } else {
        // 3. Fallback: try auth service endpoints (may fail with doctor token — silent)
        let patientId = '';
        const endpoints = [
          `${AUTH_API}/auth/admin/users?email=${encodeURIComponent(addForm.patient_email)}&limit=5`,
          `${AUTH_API}/auth/users?email=${encodeURIComponent(addForm.patient_email)}&limit=5`,
          `${AUTH_API}/users?email=${encodeURIComponent(addForm.patient_email)}&limit=5`,
        ];
        for (const url of endpoints) {
          if (patientId) break;
          try {
            const r = await fetch(url, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${drToken()}` } });
            if (r.ok) {
              const j = await r.json();
              const users: any[] = j.data || j.users || (Array.isArray(j) ? j : []);
              const match = users.find((u: any) => u.email?.toLowerCase() === emailKey);
              if (match?.id) patientId = String(match.id);
            }
          } catch {}
        }
        if (patientId) {
          // Cache for future use
          setPatientIdMap(prev => ({ ...prev, [emailKey]: patientId }));
          await sendPatientNotif(patientId);
        }
      }
    }

    setShowAdd(false);
    setAddForm({ patient_name:'', patient_phone:'', patient_email:'', appointment_date:fmt(new Date()), appointment_time:'', notes:'' });
    if (addForm.appointment_date === selectedDate) loadBookings();
    if (tab === 'all') loadAllBookings();
    showToast('✅ تم إضافة الموعد وإشعار المريض');
  };

  const openBookingFromEV = (ev: ExpectedVisitor) => {
    setFromEV(ev.id);
    setAddForm({ patient_name: ev.patientName, patient_phone: ev.patientPhone, patient_email: ev.patientEmail, appointment_date: ev.revisitDate || fmt(new Date()), appointment_time:'', notes: `مراجعة — التشخيص السابق: ${ev.diagnosis || '—'}` });
    setAddError('');
    setShowAdd(true);
  };

  const markCalled = (evId: string) => {
    const ev = getEV().map(v => v.id === evId ? { ...v, called:true, calledAt:new Date().toISOString() } : v);
    saveEV(ev);
    loadEV();
    showToast('✅ تم تسجيل الاتصال');
  };

  const deleteEV = (evId: string) => {
    saveEV(getEV().filter(v => v.id !== evId));
    loadEV();
  };

  const getScheduleForDay = (dow: number) => schedule.find(s => s.day_of_week === dow);

  const loadAllBookings = useCallback(async () => {
    if (!doctorId) return;
    setAllLoading(true);
    const today = new Date();
    const dates = Array.from({ length:30 }, (_,i) => { const d=new Date(today); d.setDate(today.getDate()+i); return fmt(d); });
    const results = await Promise.all(
      dates.map(date =>
        fetch(`${API}/${doctorId}/bookings?date=${date}`)
          .then(r => r.json())
          .then(d => (d.data||[]).map((b:any) => ({ ...b, appointment_date:date, status: b.status || 'pending' })))
          .catch(()=>[])
      )
    );
    const flat = results.flat().sort((a,b) => a.appointment_date.localeCompare(b.appointment_date));
    setAllBookings(flat);
    buildPatientIdMap(flat);
    setAllLoading(false);
  }, [doctorId]);

  // Count expected visitors for a given date (for revisit date picker hint)
  const evCountForDate = (date: string) => expectedVisitors.filter(v => v.revisitDate === date && !v.booked).length;

  // Unique patients from all bookings
  const allPatients = useCallback(() => {
    const map: Record<string, any> = {};
    [...bookings, ...allBookings].forEach(b => {
      if (b.patient_name && !map[b.patient_name]) {
        map[b.patient_name] = { name:b.patient_name, phone:b.patient_phone||'', email:b.patient_email||'', lastDate:b.appointment_date||selectedDate, status:b.status };
      }
    });
    return Object.values(map);
  }, [bookings, allBookings, selectedDate]);

  const pendingCalls = expectedVisitors.filter(v => {
    if (v.called || v.booked) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const revisit = new Date(v.revisitDate+'T00:00:00');
    return Math.ceil((revisit.getTime()-today.getTime())/86400000) <= 2;
  }).length;

  const goExpected = () => { setTab('expected'); router.replace('/dashboard/appointments?tab=expected'); };

  // ── Booking action buttons (shared between calendar and all-bookings tabs) ──
  const BookingActions = ({ b, onStatusChange }: { b: any; onStatusChange?: (id:string,s:string)=>void }) => {
    const doStatus = (status: string) => { updateStatus(b.id, status); onStatusChange?.(b.id, status); };
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {b.status === 'pending' && (
          <>
            <button onClick={() => doStatus('confirmed')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="تأكيد"><CheckCircle className="w-4 h-4" /></button>
            <button onClick={() => doStatus('cancelled')} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="إلغاء"><XCircle className="w-4 h-4" /></button>
          </>
        )}
        {b.status === 'confirmed' && !savedRx[b.id] && (() => {
          const arrived  = !!arrivedMap[b.id];
          const choice   = historyChoice[b.id] ?? null;
          const canWrite = arrived && choice !== null;
          const patientName = b.patient_name || '';
          const hasHistory  = getHistoryForPatient(patientName).length > 0;
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Arrived checkbox */}
                <button
                  onClick={() => toggleArrived(b.id)}
                  title={arrived ? 'إلغاء الحضور' : 'تأكيد حضور المريض ودفع الرسوم'}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                    arrived
                      ? 'bg-green-50 border-green-400 text-green-700'
                      : 'bg-gray-50 border-dashed border-gray-300 text-gray-400 hover:border-green-300 hover:text-green-600'
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${arrived ? 'bg-green-500 border-green-500' : 'border-gray-400'}`}>
                    {arrived && <svg viewBox="0 0 10 8" className="w-2 h-2 fill-white"><path d="M1 4l2.5 2.5L9 1"/></svg>}
                  </div>
                  حضر ودفع
                </button>

                {/* History choice — appears after arrival is confirmed */}
                {arrived && (
                  <>
                    <button
                      onClick={() => {
                        setHistoryChoice(prev => ({ ...prev, [b.id]: 'show' }));
                        const records = getHistoryForPatient(patientName);
                        setPatientHistoryModal({ name: patientName, records });
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border-2 transition-all ${
                        choice === 'show'
                          ? 'bg-purple-500 border-purple-500 text-white'
                          : 'bg-white border-purple-300 text-purple-600 hover:bg-purple-50'
                      }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      {hasHistory ? 'عرض التاريخ المرضي' : 'لا يوجد تاريخ مرضي'}
                    </button>
                    <button
                      onClick={() => setHistoryChoice(prev => ({ ...prev, [b.id]: 'skip' }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border-2 transition-all ${
                        choice === 'skip'
                          ? 'bg-gray-500 border-gray-500 text-white'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      تخطي
                    </button>
                  </>
                )}

                {/* Prescription button — only active after arrival + history choice */}
                <button
                  onClick={() => canWrite && openRx(b)}
                  disabled={!canWrite}
                  title={!arrived ? 'يجب تأكيد حضور المريض ودفع الرسوم أولاً' : !choice ? 'اختر خيار التاريخ المرضي أولاً' : 'كتابة وصفة طبية'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    canWrite ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}>
                  <FileText className="w-3.5 h-3.5" /> كتابة وصفة
                </button>

                {/* Finish without prescription */}
                <button
                  onClick={async () => {
                    if (!canWrite) return;
                    await updateStatus(b.id, 'completed');
                    const patientId = b.patient_id || b.patientId || '';
                    const doctorName = localStorage.getItem('doctor-name') || 'الطبيب';
                    const drProfile = (() => { try { return JSON.parse(localStorage.getItem('doctor-rx-profile') || '{}'); } catch { return {}; } })();
                    if (patientId) {
                      try {
                        await fetch(NOTIF_API, {
                          method: 'POST',
                          headers: notifHeaders(),
                          body: JSON.stringify({
                            portalType: 'patient', recipientId: patientId, senderName: doctorName,
                            message: `✅ تم إنهاء زيارتك مع ${drProfile.name ? `د. ${drProfile.name}` : 'الطبيب'} بنجاح.\n\n⭐ نرجو تقييم زيارتك من 1 إلى 5 نجوم عبر بوابة المريض.`,
                          }),
                        });
                      } catch {}
                    }
                    setArrivedMap(prev => { const n = { ...prev }; delete n[b.id]; return n; });
                    setHistoryChoice(prev => { const n = { ...prev }; delete n[b.id]; return n; });
                    showToast('✅ تم إنهاء الفحص بدون وصفة');
                    loadBookings();
                  }}
                  disabled={!canWrite}
                  title={!canWrite ? 'اختر خيار التاريخ المرضي أولاً' : 'إنهاء الفحص بدون وصفة رقمية'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border-2 transition-colors ${
                    canWrite ? 'bg-white border-teal-400 text-teal-600 hover:bg-teal-50' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                  <ClipboardCheck className="w-3.5 h-3.5" /> بدون وصفة
                </button>
              </div>
            </div>
          );
        })()}
        {b.status === 'confirmed' && savedRx[b.id] && (
          <div className="flex items-center gap-2">
            <button onClick={() => openRx(b)}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-blue-300 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-50">
              <FileText className="w-3 h-3" /> تعديل
            </button>
            <button onClick={() => doStatus('completed')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg">
              <ClipboardCheck className="w-3.5 h-3.5" /> إنهاء الفحص
            </button>
          </div>
        )}
        {(b.status === 'pending' || b.status === 'confirmed') && (
          <button
            onClick={() => setRescheduleFor({ b, newDate: b.appointment_date || selectedDate, reason: DR_RESCHEDULE_REASONS[0], customReason: '' })}
            title="تغيير الموعد"
            className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg">
            <CalendarClock className="w-4 h-4" />
          </button>
        )}
        <button onClick={() => confirmDelete(b.id)} className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
      </div>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1 flex-wrap">
          {([
            ['calendar','اليوم',<Calendar key="c" className="w-4 h-4 inline ml-1.5" />],
            ['all','كل المواعيد',<Users key="a" className="w-4 h-4 inline ml-1.5" />],
            ['patients','المرضى',<Stethoscope key="p" className="w-4 h-4 inline ml-1.5" />],
            ['expected','المتوقعون',<CalendarPlus key="e" className="w-4 h-4 inline ml-1.5" />],
            ['schedule','جدول الدوام',<Clock key="s" className="w-4 h-4 inline ml-1.5" />],
          ] as const).map(([key, label, icon]) => (
            <button key={key}
              onClick={() => { setTab(key as any); if (key==='all') loadAllBookings(); }}
              className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===key ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {icon}{label}
              {key==='expected' && pendingCalls > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center text-white text-xs font-bold">{pendingCalls}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setFromEV(null); setAddForm({patient_name:'',patient_phone:'',patient_email:'',appointment_date:fmt(new Date()),appointment_time:'',notes:''}); setShowAdd(true); }}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <Plus className="w-4 h-4" /> إضافة موعد
          </button>
          <button onClick={loadBookings} disabled={loading}
            className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── CALENDAR TAB ── */}
      {tab === 'calendar' && (
        <>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setWeekOffset(w=>w+1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
              <span className="text-sm font-semibold text-gray-700">
                {weekOffset===0?'هذا الأسبوع':weekOffset===1?'الأسبوع القادم':weekOffset===-1?'الأسبوع الماضي':`${weekOffset>0?'+':''}${weekOffset} أسابيع`}
              </span>
              <button onClick={() => setWeekOffset(w=>w-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((d,i) => {
                const dateStr  = fmt(d);
                const isSelected = dateStr===selectedDate;
                const isToday    = fmt(new Date())===dateStr;
                const sched      = getScheduleForDay(d.getDay());
                const evCount    = evCountForDate(dateStr);
                return (
                  <button key={i} onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center py-2 px-1 rounded-xl transition-colors ${isSelected?'bg-teal-500 text-white':isToday?'bg-teal-50 text-teal-700':'hover:bg-gray-50 text-gray-700'}`}>
                    <span className="text-xs font-medium">{DAY_SHORT[i]}</span>
                    <span className={`text-lg font-bold mt-0.5 ${isSelected?'text-white':''}`}>{d.getDate()}</span>
                    <div className="flex gap-0.5 mt-1">
                      {sched?.is_active && <span className={`w-1.5 h-1.5 rounded-full ${isSelected?'bg-white':'bg-teal-400'}`} />}
                      {evCount > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSelected?'bg-amber-200':'bg-amber-400'}`} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {availability && (
            <div className={`rounded-2xl p-4 flex items-center gap-4 ${availability.available?'bg-green-50 border border-green-200':'bg-red-50 border border-red-200'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${availability.available?'bg-green-100':'bg-red-100'}`}>
                <Users className={`w-5 h-5 ${availability.available?'text-green-600':'text-red-600'}`} />
              </div>
              <div>
                <p className={`text-sm font-bold ${availability.available?'text-green-800':'text-red-800'}`}>
                  {availability.reason==='no_schedule'?'لا يوجد دوام في هذا اليوم':availability.available?'يوجد أماكن متاحة':'اكتملت المواعيد'}
                </p>
                {availability.maxPatients && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {availability.bookedCount} / {availability.maxPatients} مريض · {availability.startTime?.slice(0,5)} – {availability.endTime?.slice(0,5)}
                    {evCountForDate(selectedDate) > 0 && <span className="mr-2 text-amber-600">· {evCountForDate(selectedDate)} زيارة متوقعة</span>}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">
                مواعيد {new Date(selectedDate+'T00:00:00').toLocaleDateString('ar-IQ',{weekday:'long',day:'numeric',month:'long'})}
              </h2>
              <span className="bg-teal-100 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">{bookings.length} موعد</span>
            </div>
            {loading ? (
              <div className="p-12 text-center text-gray-400">جاري التحميل...</div>
            ) : bookings.length === 0 ? (
              <div className="p-12 text-center text-gray-400"><Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />لا توجد مواعيد في هذا اليوم</div>
            ) : (
              <div className="divide-y">
                {bookings.map(b => (
                  <div key={b.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-teal-700 font-bold text-sm">{b.patient_name?.[0]||'م'}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{b.patient_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{b.patient_phone||b.patient_email||'—'}</p>
                        {b.notes && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{b.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLE[b.status]||STATUS_STYLE.pending}`}>
                        {STATUS_LABEL[b.status]||b.status}
                      </span>
                      <BookingActions b={b} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── ALL BOOKINGS TAB ── */}
      {tab === 'all' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900">جميع المواعيد القادمة (30 يوم)</h2>
            <div className="flex items-center gap-2">
              {allBookings.length > 0 && <span className="bg-teal-100 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">{allBookings.length} موعد</span>}
              <button onClick={loadAllBookings} disabled={allLoading}
                className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${allLoading?'animate-spin':''}`} />
              </button>
            </div>
          </div>
          {allLoading ? (
            <div className="p-12 text-center text-gray-400">جاري التحميل...</div>
          ) : allBookings.length === 0 ? (
            <div className="p-12 text-center text-gray-400"><Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />لا توجد مواعيد خلال الـ 30 يوم القادمة</div>
          ) : (
            <div className="divide-y">
              {allBookings.map((b,i) => {
                const prevDate = i>0 ? allBookings[i-1].appointment_date : null;
                const showHeader = b.appointment_date !== prevDate;
                const dateLabel = new Date(b.appointment_date+'T00:00:00').toLocaleDateString('ar-IQ',{weekday:'long',day:'numeric',month:'long'});
                return (
                  <div key={b.id}>
                    {showHeader && (
                      <div className="px-6 py-2 bg-gray-50 border-b flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500">{dateLabel}</p>
                        {evCountForDate(b.appointment_date) > 0 && (
                          <span className="text-xs text-amber-600 font-medium">· {evCountForDate(b.appointment_date)} زيارة متوقعة</span>
                        )}
                      </div>
                    )}
                    <div className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-teal-700 font-bold text-sm">{b.patient_name?.[0]||'م'}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{b.patient_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{b.patient_phone||b.patient_email||'—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLE[b.status]||STATUS_STYLE.pending}`}>
                          {STATUS_LABEL[b.status]||b.status||'بانتظار التأكيد'}
                        </span>
                        <BookingActions b={b}
                          onStatusChange={(id,s) => setAllBookings(prev=>prev.map(x=>x.id===id?{...x,status:s}:x))} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PATIENTS TAB ── */}
      {tab === 'patients' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900">قائمة المرضى</h2>
            <button onClick={() => { loadAllBookings(); loadBookings(); }}
              className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {allPatients().length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Stethoscope className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              لا توجد بيانات مرضى — قم بتحميل المواعيد أولاً
            </div>
          ) : (
            <div className="divide-y">
              {allPatients().map((p: any, i: number) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-blue-700 font-bold text-sm">{(p.name||'م')[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.phone||p.email||'—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.phone && (
                      <a href={`tel:${p.phone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50">
                        <Phone className="w-3.5 h-3.5" /> اتصال
                      </a>
                    )}
                    <button onClick={() => { setFromEV(null); setAddForm({patient_name:p.name,patient_phone:p.phone,patient_email:p.email,appointment_date:fmt(new Date()),appointment_time:'',notes:''}); setShowAdd(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg">
                      <Plus className="w-3.5 h-3.5" /> حجز
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EXPECTED VISITORS TAB ── */}
      {tab === 'expected' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-amber-500" /> الزيارات المتوقعة
              </h2>
              <div className="flex items-center gap-2">
                {pendingCalls > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {pendingCalls} يحتاج اتصال
                  </span>
                )}
                <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full">{expectedVisitors.length} إجمالي</span>
              </div>
            </div>
            {expectedVisitors.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <CalendarPlus className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                لا توجد زيارات متوقعة — أضف موعد مراجعة عند كتابة الوصفة
              </div>
            ) : (
              <div className="divide-y">
                {[...expectedVisitors].sort((a,b) => a.revisitDate.localeCompare(b.revisitDate)).map(ev => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const revisit = new Date(ev.revisitDate+'T00:00:00');
                  const daysLeft = Math.ceil((revisit.getTime()-today.getTime())/86400000);
                  const isUrgent = !ev.called && !ev.booked && daysLeft <= 2 && daysLeft >= 0;
                  const isPast   = daysLeft < 0;
                  return (
                    <div key={ev.id} className={`px-6 py-4 ${isUrgent ? 'bg-amber-50' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isUrgent?'bg-amber-100':'bg-gray-100'}`}>
                            <span className={`font-bold text-sm ${isUrgent?'text-amber-700':'text-gray-600'}`}>{(ev.patientName||'م')[0]}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900 text-sm">{ev.patientName}</p>
                              {ev.booked && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">تم الحجز</span>}
                              {ev.called && !ev.booked && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">تم الاتصال</span>}
                              {isUrgent && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">يحتاج اتصال!</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{ev.patientPhone||'—'}</p>
                            {ev.diagnosis && <p className="text-xs text-gray-400 mt-0.5">التشخيص: {ev.diagnosis}</p>}
                            <p className={`text-xs mt-1 font-medium ${isPast?'text-red-500':isUrgent?'text-amber-600':'text-gray-600'}`}>
                              📅 {new Date(ev.revisitDate+'T00:00:00').toLocaleDateString('ar-IQ',{weekday:'long',day:'numeric',month:'long'})}
                              {!isPast && <span className="mr-1.5">· بعد {daysLeft} يوم</span>}
                              {isPast && <span className="mr-1.5 text-red-500">(منتهي)</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          {!ev.called && !ev.booked && (
                            <button onClick={() => markCalled(ev.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg">
                              <UserCheck className="w-3.5 h-3.5" /> تم الاتصال
                            </button>
                          )}
                          {!ev.booked && (
                            <button onClick={() => openBookingFromEV(ev)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg">
                              <CalendarPlus className="w-3.5 h-3.5" /> إتمام الحجز
                            </button>
                          )}
                          <button onClick={() => deleteEV(ev.id)}
                            className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg self-end">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {tab === 'schedule' && (
        <>
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-teal-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4 text-teal-500" /> قالب الدوام</h3>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                <button onClick={() => setTemplateMode('weekly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${templateMode==='weekly'?'bg-white text-teal-600 shadow-sm':'text-gray-500'}`}>أسبوعي</button>
                <button onClick={() => { setTemplateMode('monthly'); setDisabledDates(new Set()); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${templateMode==='monthly'?'bg-white text-teal-600 shadow-sm':'text-gray-500'}`}>شهري</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">وقت البدء</label>
                <input type="time" value={template.start_time}
                  onChange={e => setTemplate(t => ({ ...t, start_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">وقت الانتهاء</label>
                <div className="border border-gray-300 rounded-xl overflow-hidden">
                  <button onClick={() => setTemplate(t => ({ ...t, end_time: t.end_time === '23:59' ? '17:00' : t.end_time }))}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors border-b border-gray-200 ${template.end_time !== '23:59' ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${template.end_time !== '23:59' ? 'border-white' : 'border-gray-300'}`}>
                      {template.end_time !== '23:59' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    {template.end_time !== '23:59'
                      ? <input type="time" value={template.end_time} onClick={e => e.stopPropagation()}
                          onChange={e => setTemplate(t => ({ ...t, end_time: e.target.value }))}
                          className="bg-transparent text-white outline-none text-xs w-full" />
                      : <span>وقت محدد</span>}
                  </button>
                  <button onClick={() => setTemplate(t => ({ ...t, end_time: '23:59' }))}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${template.end_time === '23:59' ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${template.end_time === '23:59' ? 'border-white' : 'border-gray-300'}`}>
                      {template.end_time === '23:59' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    حتى آخر مريض
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">أقصى مرضى / يوم</label>
                <input type="number" value={template.max_patients} min={1} max={100}
                  onChange={e => setTemplate(t => ({ ...t, max_patients: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            <p className="text-xs font-medium text-gray-600 mb-2">أيام الدوام</p>
            <div className="flex gap-2 mb-3 flex-wrap">
              {DAYS.map((d,i) => (
                <button key={i} onClick={() => { setTemplateDays(prev=>prev.map((v,idx)=>idx===i?!v:v)); setDisabledDates(new Set()); }}
                  className={`flex-1 min-w-[52px] py-2 rounded-xl text-xs font-bold border transition-colors ${templateDays[i]?'bg-teal-500 text-white border-teal-500':'bg-gray-100 text-gray-400 border-gray-200'}`}>
                  {DAY_SHORT[i]}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                {label:'أحد–خميس',days:[true,true,true,true,true,false,false]},
                {label:'اثنين–خميس',days:[false,true,true,true,true,false,false]},
                {label:'أحد–جمعة',days:[true,true,true,true,true,true,false]},
                {label:'كل الأيام',days:[true,true,true,true,true,true,true]},
                {label:'إجازة كاملة',days:[false,false,false,false,false,false,false]},
              ].map(({label,days}) => (
                <button key={label} onClick={() => { setTemplateDays(days); setDisabledDates(new Set()); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium">{label}</button>
              ))}
            </div>
            {templateMode==='monthly' && (() => {
              const {y,m} = templateMonth;
              const firstDow = new Date(y,m,1).getDay();
              const total    = new Date(y,m+1,0).getDate();
              const todayStr = fmt(new Date());
              return (
                <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => setTemplateMonth(c=>{const d=new Date(c.y,c.m+1,1);return{y:d.getFullYear(),m:d.getMonth()};})}
                      className="p-1.5 hover:bg-gray-200 rounded-lg"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
                    <p className="text-sm font-bold text-gray-800">{new Date(y,m,1).toLocaleDateString('ar-IQ',{month:'long',year:'numeric'})}</p>
                    <button onClick={() => setTemplateMonth(c=>{const d=new Date(c.y,c.m-1,1);return{y:d.getFullYear(),m:d.getMonth()};})}
                      disabled={y===new Date().getFullYear()&&m===new Date().getMonth()}
                      className="p-1.5 hover:bg-gray-200 rounded-lg disabled:opacity-30"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                  </div>
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_SHORT.map(d=><div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-y-1">
                    {Array.from({length:firstDow},(_,i)=><div key={`e${i}`}/>)}
                    {Array.from({length:total},(_,i)=>{
                      const day  = i+1;
                      const date = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      const dow  = new Date(date+'T00:00:00').getDay();
                      const isWorkDay  = templateDays[dow];
                      const isDisabled = disabledDates.has(date);
                      const isPast     = date<todayStr;
                      return (
                        <button key={day} disabled={isPast||!isWorkDay}
                          onClick={() => setDisabledDates(prev=>{const n=new Set(prev);n.has(date)?n.delete(date):n.add(date);return n;})}
                          className={`h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${isPast||!isWorkDay?'text-gray-300 cursor-not-allowed':isDisabled?'bg-red-100 text-red-400 line-through':'bg-teal-500 text-white hover:bg-teal-600'}`}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  {disabledDates.size>0&&<p className="text-xs text-amber-600 mt-2 font-medium">{disabledDates.size} يوم مستثنى</p>}
                </div>
              );
            })()}
            <button onClick={applyTemplate} disabled={templateSaving}
              className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
              {templateSaving?'جاري التطبيق...':templateMode==='weekly'?'تطبيق على الجدول الأسبوعي':'تطبيق على الشهر'}
            </button>
          </div>

          {/* Booking open time setting */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-amber-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" /> وقت فتح الحجز للمرضى
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">متى يُسمح للمرضى ببدء الحجز في كل يوم</p>
              </div>
              <button onClick={saveBookingOpenTimes}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors ${bookingOpenSaved ? 'bg-green-500' : 'bg-amber-400 hover:bg-amber-500'}`}>
                {bookingOpenSaved ? '✓ تم الحفظ' : 'حفظ'}
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              {([['always','مفتوح دائماً'],['general','وقت موحد لجميع الأيام'],['per-day','وقت مختلف لكل يوم']] as [string,string][]).map(([key, label]) => (
                <button key={key} onClick={() => setBookingOpenMode(key as any)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${bookingOpenMode === key ? 'bg-amber-400 border-amber-400 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-200'}`}>
                  {label}
                </button>
              ))}
            </div>

            {bookingOpenMode === 'always' ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                <span className="text-green-600 text-sm">✓</span>
                <span className="text-sm text-green-700 font-medium">الحجز مفتوح في أي وقت — لا يوجد قيد على وقت الحجز</span>
              </div>
            ) : bookingOpenMode === 'general' ? (
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 shrink-0">يفتح الحجز في الساعة:</label>
                <input type="time" value={bookingOpenGeneral}
                  onChange={e => setBookingOpenGeneral(e.target.value)}
                  className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <span className="text-xs text-gray-400">لجميع أيام الدوام</span>
              </div>
            ) : (
              <div className="space-y-2">
                {DAYS.map((dayName, dow) => {
                  const sched = schedule.find((s: any) => s.day_of_week === dow);
                  const isActive = sched?.is_active;
                  return (
                    <div key={dow} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isActive ? 'bg-gray-50' : 'opacity-40'}`}>
                      <span className={`text-xs font-bold w-14 shrink-0 ${isActive ? 'text-gray-700' : 'text-gray-400'}`}>{dayName}</span>
                      {isActive ? (
                        <>
                          <input type="time" value={bookingOpenPerDay[dow] || '08:00'}
                            onChange={e => setBookingOpenPerDay(prev => ({ ...prev, [dow]: e.target.value }))}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          <span className="text-xs text-gray-400">يفتح الحجز</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">إجازة</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) }
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">جدول الدوام الأسبوعي</h2>
              <p className="text-xs text-gray-500 mt-0.5">اضغط على أي يوم لتعديل أوقات العمل</p>
            </div>
            <div className="divide-y">
              {DAYS.map((dayName,dow)=>{
                const s = getScheduleForDay(dow);
                return (
                  <div key={dow} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${s?.is_active?'bg-teal-100 text-teal-700':'bg-gray-100 text-gray-400'}`}>{DAY_SHORT[dow]}</div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{dayName}</p>
                        {s?.is_active
                          ? <p className="text-xs text-gray-500 mt-0.5">{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)} · أقصى {s.max_patients} مريض</p>
                          : <p className="text-xs text-gray-400 mt-0.5">{s?'إجازة':'لم يُحدد'}</p>}
                      </div>
                    </div>
                    <button onClick={() => openEditDay(dow)} className="px-4 py-1.5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-100">تعديل</button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── PRESCRIPTION MODAL ── */}
      {rxBooking && (() => {
        const rxId = prescriptionId(rxBooking.patient_name || 'مريض');
        const _notes: string = rxBooking.notes || '';
        const patientAge    = (_notes.match(/عمر المريض:\s*(\S+)/)   || [])[1] || '—';
        const patientGender = (_notes.match(/جنس المريض:\s*(\S+)/)   || [])[1] || '';
        const patientFileNo = (_notes.match(/رقم الملف:\s*(\S+)/)    || [])[1] || '';
        const genderLabel   = patientGender === 'M' ? 'ذكر' : patientGender === 'F' ? 'أنثى' : patientGender || '—';
        const today = new Date().toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' });
        return (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-6" dir="rtl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" /> وصفة طبية
              </h2>
              <button onClick={() => setRxBooking(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 px-5 pt-4">
              {([['edit','كتابة الوصفة'],['preview','معاينة']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setRxTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${rxTab === key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {key === 'preview' && <Eye className="w-3.5 h-3.5" />} {label}
                </button>
              ))}
            </div>

            {rxTab === 'edit' ? (
              <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
                {/* Auto prescription ID */}
                <div className="bg-gray-50 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <p className="text-xs text-gray-500 font-mono break-all">{rxId}</p>
                </div>

                {/* Patient */}
                <div className="bg-teal-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-teal-700 font-bold text-sm">{rxBooking.patient_name?.[0]||'م'}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{rxBooking.patient_name}</p>
                      <p className="text-xs text-gray-500">{rxBooking.patient_phone||rxBooking.patient_email||''}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {patientAge !== '—' && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-lg font-medium">العمر: {patientAge}</span>}
                    {genderLabel && genderLabel !== '—' && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-1 rounded-lg font-medium">{genderLabel}</span>}
                    {patientFileNo && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-mono">ملف: {patientFileNo}</span>}
                  </div>
                </div>

                {/* Diagnosis — doctor-only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                    التشخيص <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium">للطبيب فقط</span>
                  </label>
                  <input value={rxDiagnosis} onChange={e=>setRxDiagnosis(e.target.value)}
                    placeholder="مثال: التهاب حاد في الجهاز التنفسي"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>

                {/* Drugs */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">الأدوية الموصوفة</label>
                    <button onClick={() => setRxDrugs(d=>[...d,{name:'',dose:'',times:'',duration:'',notes:''}])}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                      <PlusCircle className="w-3.5 h-3.5" /> إضافة دواء
                    </button>
                  </div>
                  <div className="space-y-3">
                    {rxDrugs.map((drug,i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-500">#{i+1}</span>
                          {rxDrugs.length > 1 && (
                            <button onClick={() => setRxDrugs(d=>d.filter((_,idx)=>idx!==i))} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                        <input value={drug.name}
                          onChange={e=>setRxDrugs(d=>d.map((x,idx)=>idx===i?{...x,name:e.target.value}:x))}
                          placeholder="اسم الدواء *"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            { field: 'dose',     placeholder: 'الجرعة',  unit: 'mg' },
                            { field: 'times',    placeholder: 'التكرار', unit: 'مرة/يوم' },
                            { field: 'duration', placeholder: 'المدة',   unit: 'يوم' },
                          ] as const).map(({ field, placeholder, unit }) => (
                            <div key={field} className="relative">
                              <input value={drug[field]}
                                onChange={e=>setRxDrugs(d=>d.map((x,idx)=>idx===i?{...x,[field]:e.target.value}:x))}
                                placeholder={placeholder}
                                type="number" min="0"
                                className="w-full pl-12 pr-2.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{unit}</span>
                            </div>
                          ))}
                        </div>
                        <input value={drug.notes}
                          onChange={e=>setRxDrugs(d=>d.map((x,idx)=>idx===i?{...x,notes:e.target.value}:x))}
                          placeholder="ملاحظات (مثال: بعد الأكل)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revisit date */}
                <div className="border border-dashed border-gray-300 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => setEnableRevisit(v=>!v)}
                      className={`relative w-10 h-5 rounded-full shrink-0 transition-colors ${enableRevisit?'bg-teal-500':'bg-gray-300'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enableRevisit?'translate-x-5':''}`} />
                    </button>
                    <span className="text-sm font-medium text-gray-700">تحديد موعد مراجعة</span>
                  </div>
                  {enableRevisit && (
                    <div className="space-y-2">
                      <input type="date" value={revisitDate} min={fmt(new Date())}
                        onChange={e=>setRevisitDate(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      {revisitDate && (
                        <div className="bg-teal-50 rounded-lg px-3 py-2 text-xs text-teal-700">
                          <span className="font-semibold">{new Date(revisitDate+'T00:00:00').toLocaleDateString('ar-IQ',{weekday:'long',day:'numeric',month:'long'})}</span>
                          {evCountForDate(revisitDate) > 0 && (
                            <span className="mr-2 text-amber-600">· {evCountForDate(revisitDate)} زيارة متوقعة مسجلة</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* PREVIEW TAB */
              <div className="p-5 max-h-[65vh] overflow-y-auto">
                <div id="rx-print-area">
                <PrescriptionPreview
                  rxProfile={rxDrProfile}
                  certificates={rxCertificates}
                  clinicLogo={rxClinicLogo}
                  patientName={rxBooking.patient_name || 'المريض'}
                  patientAge={patientAge}
                  patientGender={genderLabel}
                  patientFileNo={patientFileNo}
                  drugs={rxDrugs}
                  date={today}
                  rxId={rxId}
                  diagnosis={rxDiagnosis}
                  revisitDate={enableRevisit ? revisitDate : undefined}
                />
                </div>
                {(!rxDrProfile.name || !rxDrProfile.degree || !rxDrProfile.certNumber) && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                    ⚠️ بعض معلومات الوصفة ناقصة — اذهب إلى <strong>الإعدادات ← الوصفة الطبية</strong> لإكمالها
                  </div>
                )}
              </div>
            )}

            {/* ── DISPATCH OPTIONS ── */}
            <div className="px-5 pt-3 pb-3 border-t bg-gray-50 space-y-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">تسليم الوصفة:</p>

              {/* Option 1: Hand to patient */}
              <label className="flex items-center gap-3 cursor-pointer select-none p-2 rounded-xl hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={rxHandToPatient}
                  onChange={e => setRxHandToPatient(e.target.checked)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"/>
                  </svg>
                  <span className="text-sm font-medium text-gray-700">تسليم الوصفة للمريض يدوياً</span>
                  <span className="text-xs text-gray-400">(طباعة + تسليم بالإيد)</span>
                </div>
              </label>

              {/* Option 2: Send to pharmacy */}
              <label className="flex items-start gap-3 cursor-pointer select-none p-2 rounded-xl hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={rxSendToPharmacy}
                  onChange={e => {
                    setRxSendToPharmacy(e.target.checked);
                    if (e.target.checked && pharmacies.length === 0) loadPharmacies();
                  }}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    <span className="text-sm font-medium text-gray-700">إرسال الوصفة لصيدلية</span>
                  </div>
                  {rxSendToPharmacy && (
                    <div className="mt-2 space-y-1.5">
                      <div className="relative">
                        <svg className="absolute right-3 top-2.5 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input
                          type="text"
                          value={pharmSearch}
                          onChange={e => setPharmSearch(e.target.value)}
                          placeholder="ابحث عن صيدلية..."
                          className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                        />
                      </div>
                      {pharmaciesLoading ? (
                        <p className="text-xs text-gray-400 py-1 text-center">جاري التحميل...</p>
                      ) : (
                        <div className="max-h-32 overflow-y-auto space-y-1 rounded-xl border border-gray-200 bg-white p-1">
                          {pharmacies
                            .filter(p => {
                              const name = (p.name_ar || p.name || p.pharmacy_name || '').toLowerCase();
                              return !pharmSearch.trim() || name.includes(pharmSearch.toLowerCase());
                            })
                            .map(p => {
                              const pid = String(p.id || p._id);
                              const pname = p.name_ar || p.name || p.pharmacy_name || 'صيدلية';
                              return (
                                <button
                                  key={pid}
                                  type="button"
                                  onClick={() => setSelectedPharmacyId(pid)}
                                  className={`w-full text-right px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                    selectedPharmacyId === pid
                                      ? 'bg-emerald-500 text-white font-semibold'
                                      : 'hover:bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {pname}
                                  {selectedPharmacyId === pid && <span className="float-left text-xs">✓</span>}
                                </button>
                              );
                            })}
                          {pharmacies.filter(p => {
                            const name = (p.name_ar || p.name || p.pharmacy_name || '').toLowerCase();
                            return !pharmSearch.trim() || name.includes(pharmSearch.toLowerCase());
                          }).length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-2">
                              {pharmacies.length === 0 ? 'لا توجد صيدليات مسجلة في المنصة' : 'لا توجد نتائج'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t">
              <button onClick={() => setRxBooking(null)}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={saveRx}
                disabled={rxSaving || !rxDrugs.some(d=>d.name.trim()) || (rxSendToPharmacy && !selectedPharmacyId)}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                {rxSaving ? (
                  <span className="flex items-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> جاري الحفظ...</span>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> إنهاء الفحص وحفظ الوصفة</>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── PATIENT HISTORY MODAL ── */}
      {patientHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg my-6" dir="rtl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                  التاريخ المرضي
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{patientHistoryModal.name}</p>
              </div>
              <button onClick={() => setPatientHistoryModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto space-y-3">
              {patientHistoryModal.records.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-500">لا يوجد تاريخ مرضي سابق</p>
                  <p className="text-xs text-gray-400 mt-1">هذه أول زيارة للمريض</p>
                </div>
              ) : (
                patientHistoryModal.records.map((rec, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-purple-50 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">#{patientHistoryModal.records.length - i}</span>
                        <span className="text-xs font-semibold text-gray-700">{rec.date}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-mono">{rec.rxId.split('_').slice(-2).join('_')}</span>
                    </div>
                    <div className="px-4 py-3">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{rec.rxText}</pre>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t">
              <button onClick={() => setPatientHistoryModal(null)}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2.5 rounded-xl text-sm font-semibold">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESCHEDULE MODAL ── */}
      {rescheduleFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" dir="rtl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-amber-500" />
                <p className="font-bold text-gray-900">تغيير الموعد</p>
              </div>
              <button onClick={() => setRescheduleFor(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                المريض: <span className="font-bold">{rescheduleFor.b.patient_name}</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">التاريخ الجديد</label>
                <input type="date" value={rescheduleFor.newDate} min={fmt(new Date())}
                  onChange={e => setRescheduleFor(r => r ? { ...r, newDate: e.target.value } : r)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">سبب التغيير</label>
                <div className="flex flex-wrap gap-2">
                  {DR_RESCHEDULE_REASONS.map(r => (
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
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setRescheduleFor(null)}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={doReschedule} disabled={rescheduleSaving || !rescheduleFor.newDate || (rescheduleFor.reason === 'أخرى' && !rescheduleFor.customReason.trim())}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                {rescheduleSaving ? 'جاري...' : 'تأكيد التغيير'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">حذف الموعد</h2>
            <p className="text-sm text-gray-500 mb-6">هل أنت متأكد من حذف هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                إلغاء
              </button>
              <button onClick={deleteBooking}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT SCHEDULE DAY MODAL ── */}
      {editDay !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{DAYS[editDay]}</h2>
              <button onClick={() => setEditDay(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-medium text-gray-700">يوم دوام</span>
                <button onClick={() => setEditForm(f=>({...f,is_active:!f.is_active}))}
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${editForm.is_active?'bg-teal-500':'bg-gray-300'}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${editForm.is_active?'translate-x-5':'translate-x-0'}`} />
                </button>
              </div>
              {editForm.is_active && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">وقت البدء</label>
                      <input type="time" value={editForm.start_time}
                        onChange={e=>setEditForm(f=>({...f,start_time:e.target.value}))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">وقت الانتهاء</label>
                      <div className="border border-gray-300 rounded-xl overflow-hidden">
                        <button onClick={() => setEditForm(f => ({ ...f, end_time: f.end_time === '23:59' ? '17:00' : f.end_time }))}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors border-b border-gray-200 ${editForm.end_time !== '23:59' ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${editForm.end_time !== '23:59' ? 'border-white' : 'border-gray-300'}`}>
                            {editForm.end_time !== '23:59' && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          {editForm.end_time !== '23:59'
                            ? <input type="time" value={editForm.end_time} onClick={e => e.stopPropagation()}
                                onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}
                                className="bg-transparent text-white outline-none text-sm w-full" />
                            : <span>وقت محدد</span>}
                        </button>
                        <button onClick={() => setEditForm(f => ({ ...f, end_time: '23:59' }))}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${editForm.end_time === '23:59' ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${editForm.end_time === '23:59' ? 'border-white' : 'border-gray-300'}`}>
                            {editForm.end_time === '23:59' && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          حتى آخر مريض
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">أقصى عدد مرضى في اليوم</label>
                    <input type="number" min="1" max="100" value={editForm.max_patients}
                      onChange={e=>setEditForm(f=>({...f,max_patients:e.target.value}))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditDay(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={saveScheduleDay} disabled={saving}
                className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                {saving?'جاري الحفظ...':'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD BOOKING MODAL ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {fromEV ? 'إتمام حجز المراجعة' : 'إضافة موعد جديد'}
              </h2>
              <button onClick={() => { setShowAdd(false); setFromEV(null); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {fromEV && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-amber-700">
                بيانات المريض مُعبأة تلقائياً من وصفته السابقة — اختر التاريخ والوقت واضغط تأكيد
              </div>
            )}
            {addError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{addError}</div>}
            <form onSubmit={addBooking} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المريض *</label>
                <input value={addForm.patient_name} onChange={e=>setAddForm(f=>({...f,patient_name:e.target.value}))}
                  placeholder="الاسم الكامل" required readOnly={!!fromEV}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${fromEV?'bg-gray-50':''}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                <input type="tel" dir="ltr" value={addForm.patient_phone} onChange={e=>setAddForm(f=>({...f,patient_phone:e.target.value}))}
                  readOnly={!!fromEV}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${fromEV?'bg-gray-50':''}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الموعد *</label>
                  <input type="date" value={addForm.appointment_date} onChange={e=>setAddForm(f=>({...f,appointment_date:e.target.value}))}
                    required autoFocus={!!fromEV}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">وقت الموعد *</label>
                  <input type="time" value={addForm.appointment_time} onChange={e=>setAddForm(f=>({...f,appointment_time:e.target.value}))}
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <textarea value={addForm.notes} onChange={e=>setAddForm(f=>({...f,notes:e.target.value}))}
                  rows={2} placeholder="أي تفاصيل إضافية..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowAdd(false); setFromEV(null); }}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
                <button type="submit" disabled={addSaving}
                  className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                  {addSaving?'جاري الحفظ...':fromEV?'تأكيد الحجز':'إضافة الموعد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppointmentsPage() {
  return <Suspense><AppointmentsContent /></Suspense>;
}
