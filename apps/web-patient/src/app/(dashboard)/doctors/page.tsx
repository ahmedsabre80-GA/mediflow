'use client';
import { Search, Stethoscope, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react';
import { useState, useEffect } from 'react';

const AUTH_API  = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const APPT_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/appointments/doctors';
const SECRET    = 'mediflow-delete-2026';

const SPECIALIZATIONS = ['الكل', 'طب عام', 'طب القلب', 'طب الأطفال', 'طب النساء والتوليد', 'طب الأعصاب', 'طب الجلدية'];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function genSlots(start: string, end: string, intervalMin = 30): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let cur = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (cur + intervalMin <= endMin) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    cur += intervalMin;
  }
  return slots;
}

export default function DoctorsPage() {
  const [search, setSearch]       = useState('');
  const [spec, setSpec]           = useState('الكل');
  const [doctors, setDoctors]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<any>(null);

  // Booking state
  const [bookDate, setBookDate]   = useState(fmt(new Date()));
  const [calMonth, setCalMonth]   = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [avail, setAvail]         = useState<any>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [prefTime, setPrefTime]   = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientFileNo, setPatientFileNo] = useState('');
  const [notes, setNotes]         = useState('');
  const [booking, setBooking]     = useState(false);
  const [booked, setBooked]       = useState(false);
  const [bookError, setBookError] = useState('');
  const [reminders, setReminders] = useState({ h24: true, h6: true, h2: true });

  useEffect(() => {
    setPatientName(localStorage.getItem('patient-name') || '');
    setPatientPhone(localStorage.getItem('patient-phone') || '');
    setPatientAge(localStorage.getItem('patient-age') || '');
    setPatientGender(localStorage.getItem('patient-gender') || '');
    setPatientFileNo(localStorage.getItem('patient-file-no') || '');

    Promise.all([
      fetch(`${PHARM_API}/admin-requests`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${AUTH_API}/auth/admin/users?secret=${SECRET}`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([reqRes, authRes]) => {
      const authUsers: any[] = authRes.data || authRes.users || [];
      const approved = (reqRes.data || [])
        .filter((d: any) => ['approved','used'].includes(d.status) && d.portal_type === 'doctor')
        .map((d: any) => {
          const authUser = authUsers.find((u: any) =>
            u.email?.toLowerCase() === d.employee_email?.toLowerCase()
          );
          return {
            id: d.id,
            name: d.employee_name,
            email: d.employee_email,
            specialization: d.employee_role || 'طب عام',
            authId: authUser?.id || null,
          };
        });
      setDoctors(approved);
    }).finally(() => setLoading(false));
  }, []);

  const loadAvailability = async (doc: any, date: string) => {
    if (!doc.authId) { setAvail(null); setLoadingAvail(false); return; }
    setLoadingAvail(true);
    setAvail(null);
    setPrefTime('');
    const r = await fetch(`${APPT_API}/${doc.authId}/availability?date=${date}`)
      .then(r => r.json()).catch(() => null);
    setAvail(r?.data || null);
    setLoadingAvail(false);
  };

  const openDoctor = (doc: any) => {
    setSelected(doc);
    setBooked(false);
    setBookError('');
    setNotes('');
    setPrefTime('');
    setReminders({ h24: true, h6: true, h2: true });
    const today = fmt(new Date());
    setBookDate(today);
    loadAvailability(doc, today);
  };

  const selectDate = (dateStr: string) => {
    setBookDate(dateStr);
    if (selected) loadAvailability(selected, dateStr);
  };

  const calDays = (() => {
    const { y, m } = calMonth;
    const first = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const today = fmt(new Date());
    const cells: Array<{ date: string; day: number; disabled: boolean } | null> = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      const date = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push({ date, day: d, disabled: date < today });
    }
    return cells;
  })();

  const timeSlots = avail?.startTime && avail?.endTime
    ? genSlots(avail.startTime.slice(0,5), avail.endTime.slice(0,5), 30)
    : [];

  const reserve = async () => {
    if (!selected || !patientName.trim()) { setBookError('يرجى إدخال اسمك'); return; }
    if (!patientAge.trim()) { setBookError('يرجى إدخال عمرك'); return; }
    if (!patientGender) { setBookError('يرجى تحديد الجنس'); return; }
    if (!avail?.available) return;

    // Duplicate booking guard — one booking per doctor per day per patient
    const existingBookings: any[] = JSON.parse(localStorage.getItem('mediflow-my-bookings') || '[]');
    const doctorAuthId = selected.authId || selected.id || '';
    const alreadyBooked = existingBookings.some(b => {
      if ((b.status || '') === 'cancelled') return false;
      const bDate = (b.date || b.appointment_date || '').slice(0, 10);
      if (bDate !== bookDate) return false;
      return (doctorAuthId && b.doctorAuthId === doctorAuthId) ||
             (b.doctorName && b.doctorName === (selected.name || ''));
    });
    if (alreadyBooked) {
      setBookError('لديك حجز بالفعل مع هذا الطبيب في هذا اليوم');
      return;
    }

    setBooking(true);
    setBookError('');
    const notesWithTime = prefTime
      ? `الوقت المفضل: ${prefTime}${notes.trim() ? ' | ' + notes.trim() : ''}`
      : notes.trim();
    const res = await fetch(`${APPT_API}/${selected.authId || selected.id}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: patientName.trim(),
        patient_phone: patientPhone.trim(),
        patient_email: localStorage.getItem('patient-email') || '',
        appointment_date: bookDate,
        preferred_time: prefTime || undefined,
        notes: [
          notesWithTime,
          patientAge.trim()    ? `عمر المريض: ${patientAge.trim()}` : '',
          patientGender.trim() ? `جنس المريض: ${patientGender.trim()}` : '',
          patientFileNo.trim() ? `رقم الملف: ${patientFileNo.trim()}` : '',
        ].filter(Boolean).join('\n'),
      }),
    });
    setBooking(false);
    if (res.ok) {
      // Notify doctor
      if (selected.authId) {
        const notifAPI = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/portal-notifications';
        fetch(notifAPI, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalType: 'doctor',
            recipientId: selected.authId,
            senderName: patientName.trim(),
            message: `🗓️ حجز موعد جديد\nالمريض: ${patientName.trim()}${patientPhone.trim() ? '\nالهاتف: ' + patientPhone.trim() : ''}\nالتاريخ: ${bookDate}${prefTime ? '\nالوقت المفضل: ' + prefTime : ''}${notes.trim() ? '\nملاحظات: ' + notes.trim() : ''}`,
          }),
        }).catch(() => {});
      }

      // Persist patient identity for future syncs
      if (patientName.trim())   localStorage.setItem('patient-name',    patientName.trim());
      if (patientPhone.trim())  localStorage.setItem('patient-phone',   patientPhone.trim());
      if (patientAge.trim())    localStorage.setItem('patient-age',     patientAge.trim());
      if (patientGender.trim()) localStorage.setItem('patient-gender',  patientGender.trim());
      if (patientFileNo.trim()) localStorage.setItem('patient-file-no', patientFileNo.trim());

      // Save booking to my appointments
      const myBookings = JSON.parse(localStorage.getItem('mediflow-my-bookings') || '[]');
      const bookingRecord = {
        id: `local-${Date.now()}`,
        doctorName: selected.name || 'الطبيب',
        doctorAuthId: selected.authId || selected.id || '',
        specialization: selected.specialization || 'طب عام',
        date: bookDate,
        prefTime: prefTime || '',
        patientName: patientName.trim(),
        notes: notes.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      myBookings.unshift(bookingRecord);
      localStorage.setItem('mediflow-my-bookings', JSON.stringify(myBookings));

      // Save reminder schedule
      const enabledHours = [reminders.h24 && 24, reminders.h6 && 6, reminders.h2 && 2].filter(Boolean) as number[];
      if (enabledHours.length > 0) {
        const stored = JSON.parse(localStorage.getItem('mediflow-appt-reminders') || '[]');
        stored.push({
          id: bookingRecord.id,
          doctorName: selected.name || 'الطبيب',
          date: bookDate,
          prefTime: prefTime || '09:00',
          hours: enabledHours,
          sent: [],
        });
        localStorage.setItem('mediflow-appt-reminders', JSON.stringify(stored));
      }

      setBooked(true);
    } else {
      const d = await res.json().catch(() => ({}));
      setBookError(d?.error?.title || d?.message || 'فشل الحجز، حاول مرة أخرى');
    }
  };

  const filtered = doctors.filter(d => {
    const name = (d.name || d.username || '').toLowerCase();
    return (!search || name.includes(search.toLowerCase())) &&
           (spec === 'الكل' || (d.specialization || '').includes(spec));
  });

  const dateLabel = (() => {
    const d = new Date(bookDate + 'T00:00:00');
    return d.toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' });
  })();

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-sky-500 px-4 py-6 pt-12">
        <h1 className="text-xl font-bold text-white mb-4">استشر طبيب</h1>
        <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن طبيب أو تخصص..."
            className="flex-1 outline-none text-sm" dir="rtl" />
        </div>
      </div>

      {/* Specialization filter */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 w-max">
          {SPECIALIZATIONS.map(s => (
            <button key={s} onClick={() => setSpec(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${spec === s ? 'bg-sky-500 text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Doctor list */}
      <div className="px-4 pb-28 space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-20" />)
        ) : filtered.length === 0 ? (
          <div className="pt-16 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-sky-100 rounded-full flex items-center justify-center mb-4">
              <Stethoscope className="w-10 h-10 text-sky-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-700 mb-2">لا يوجد أطباء</h2>
            <p className="text-sm text-gray-400 max-w-xs">لم يتم العثور على أطباء مسجلين حالياً.</p>
          </div>
        ) : filtered.map(doc => (
          <button key={doc.id} onClick={() => openDoctor(doc)}
            className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 text-right hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xl font-bold">
                {(doc.name || doc.username || 'د')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">{doc.name || doc.username || 'طبيب'}</p>
              <p className="text-xs text-sky-600 mt-0.5">{doc.specialization || 'طب عام'}</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700 shrink-0">حجز</span>
          </button>
        ))}
      </div>

      {/* Booking sheet */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-t-3xl w-full max-h-[92vh] overflow-y-auto" dir="rtl"
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mt-4" />

            {booked ? (
              <div className="p-6 pb-28 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">✅</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">تم الحجز بنجاح!</h2>
                <p className="text-sm text-gray-500 mb-1">
                  موعدك مع <strong>{selected.name || 'الطبيب'}</strong>
                </p>
                <p className="text-sm text-sky-600 font-medium mb-1">{dateLabel}</p>
                {prefTime && <p className="text-sm text-gray-500 mb-2">الوقت المفضل: <strong>{prefTime}</strong></p>}
                {(reminders.h24 || reminders.h6 || reminders.h2) && (
                  <p className="text-xs text-sky-500 mb-6">🔔 سيتم تذكيرك عبر المنصة قبل الموعد</p>
                )}
                <button onClick={() => setSelected(null)}
                  className="w-full bg-sky-500 text-white py-3 rounded-2xl font-semibold text-sm">
                  حسناً
                </button>
              </div>
            ) : (
              <div className="p-6 pb-28">
                {/* Doctor header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-2xl font-bold">
                      {(selected.name || selected.username || 'د')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selected.name || selected.username || 'طبيب'}</h2>
                    <p className="text-sm text-sky-600">{selected.specialization || 'طب عام'}</p>
                  </div>
                </div>

                {/* Monthly calendar */}
                <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => setCalMonth(c => {
                      const d = new Date(c.y, c.m + 1, 1);
                      return { y: d.getFullYear(), m: d.getMonth() };
                    })} className="p-1.5 hover:bg-gray-200 rounded-lg">
                      <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                    <p className="text-sm font-bold text-gray-800">
                      {new Date(calMonth.y, calMonth.m, 1).toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' })}
                    </p>
                    <button onClick={() => setCalMonth(c => {
                      const d = new Date(c.y, c.m - 1, 1);
                      return { y: d.getFullYear(), m: d.getMonth() };
                    })} disabled={calMonth.y === new Date().getFullYear() && calMonth.m === new Date().getMonth()}
                    className="p-1.5 hover:bg-gray-200 rounded-lg disabled:opacity-30">
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 mb-1">
                    {['أح','إث','ثل','أر','خم','جم','سب'].map(d => (
                      <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-y-1">
                    {calDays.map((cell, i) => cell === null ? (
                      <div key={i} />
                    ) : (
                      <button key={i}
                        disabled={cell.disabled}
                        onClick={() => selectDate(cell.date)}
                        className={`h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors
                          ${cell.disabled ? 'text-gray-300 cursor-not-allowed' :
                            cell.date === bookDate ? 'bg-sky-500 text-white' :
                            cell.date === fmt(new Date()) ? 'bg-sky-100 text-sky-700' :
                            'hover:bg-gray-200 text-gray-700'}`}>
                        {cell.day}
                      </button>
                    ))}
                  </div>
                  {bookDate && (
                    <p className="text-xs text-center text-sky-600 font-medium mt-2">{dateLabel}</p>
                  )}
                </div>

                {/* Availability summary */}
                <div className={`rounded-2xl p-4 mb-4 flex items-center gap-3 ${
                  loadingAvail ? 'bg-gray-50' :
                  avail?.available ? 'bg-green-50 border border-green-200' :
                  avail?.reason === 'no_schedule' ? 'bg-gray-50' : 'bg-red-50 border border-red-200'
                }`}>
                  {loadingAvail ? (
                    <div className="h-5 bg-gray-200 rounded animate-pulse w-40" />
                  ) : (
                    <>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${avail?.available ? 'bg-green-100' : 'bg-gray-100'}`}>
                        {avail?.available ? <Users className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${avail?.available ? 'text-green-700' : 'text-gray-600'}`}>
                          {!avail || avail.reason === 'no_schedule' ? 'لا يوجد دوام في هذا اليوم' :
                           avail.available ? 'يوجد أماكن متاحة' : 'اكتملت المواعيد'}
                        </p>
                        {avail?.startTime && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {avail.startTime?.slice(0,5)} – {avail.endTime?.slice(0,5)} · {avail.bookedCount}/{avail.maxPatients} محجوز
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Time slots */}
                {avail?.available && timeSlots.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-sky-500" />
                      اختر الوقت المفضل
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {timeSlots.map(slot => (
                        <button key={slot} onClick={() => setPrefTime(prefTime === slot ? '' : slot)}
                          className={`py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                            prefTime === slot
                              ? 'bg-sky-500 text-white border-sky-500'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-sky-300'
                          }`}>
                          {slot}
                        </button>
                      ))}
                    </div>
                    {!prefTime && (
                      <p className="text-xs text-gray-400 mt-1.5">اختياري — يمكنك الحجز بدون تحديد وقت</p>
                    )}
                  </div>
                )}

                {/* Reminder preferences */}
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">🔔 تذكيرات قبل الموعد</p>
                  <div className="flex gap-2">
                    {[
                      { key: 'h24', label: 'قبل يوم' },
                      { key: 'h6',  label: 'قبل 6 ساعات' },
                      { key: 'h2',  label: 'قبل ساعتين' },
                    ].map(({ key, label }) => {
                      const on = reminders[key as keyof typeof reminders];
                      return (
                        <button key={key} onClick={() => setReminders(r => ({ ...r, [key]: !r[key as keyof typeof reminders] }))}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                            on ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-gray-600 border-gray-200'
                          }`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">ستصلك إشعار عبر المنصة في الأوقات المحددة</p>
                </div>

                {/* Patient info */}
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">الاسم الكامل *</label>
                    <input value={patientName} onChange={e => setPatientName(e.target.value)}
                      placeholder="الاسم الثلاثي"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">العمر *</label>
                      <input value={patientAge} onChange={e => setPatientAge(e.target.value)}
                        placeholder="مثال: 35" type="number" min="1" max="120"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">الجنس *</label>
                      <div className="grid grid-cols-2 gap-2 h-[46px]">
                        {[['ذكر','M'],['أنثى','F']].map(([label, val]) => (
                          <button key={val} type="button" onClick={() => setPatientGender(val)}
                            className={`rounded-xl text-sm font-medium border-2 transition-all ${patientGender === val ? 'bg-sky-500 border-sky-500 text-white' : 'border-gray-200 text-gray-600 hover:border-sky-300'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">رقم الهاتف</label>
                      <input value={patientPhone} onChange={e => setPatientPhone(e.target.value)}
                        placeholder="07xxxxxxxxx" dir="ltr"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">رقم الملف</label>
                      <input value={patientFileNo} onChange={e => setPatientFileNo(e.target.value)}
                        placeholder="اختياري"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات (اختياري)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="سبب الزيارة أو أي تفاصيل..."
                      rows={2}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
                  </div>
                </div>

                {bookError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{bookError}</div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setSelected(null)}
                    className="flex-1 border border-gray-300 py-3 rounded-2xl text-sm font-medium text-gray-700">
                    إلغاء
                  </button>
                  <button onClick={reserve}
                    disabled={booking || !avail?.available || loadingAvail}
                    className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white py-3 rounded-2xl text-sm font-bold transition-colors">
                    {booking ? 'جاري الحجز...' : 'تأكيد الحجز'}
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
