'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, Clock, Users, CheckCircle, ChevronLeft, ChevronRight, Stethoscope } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/appointments/doctors';
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

export default function PublicBookingPage() {
  const { doctorId } = useParams() as { doctorId: string };
  const [schedule, setSchedule] = useState<any[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [availability, setAvailability] = useState<any>(null);
  const [avLoading, setAvLoading] = useState(false);
  const [step, setStep] = useState<'date' | 'form' | 'done'>('date');
  const [form, setForm] = useState({ patient_name: '', patient_phone: '', patient_email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bookingResult, setBookingResult] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/${doctorId}/schedule`).then(r => r.json()).then(d => setSchedule(d.data || [])).catch(() => {});
  }, [doctorId]);

  const selectDate = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setAvailability(null);
    setAvLoading(true);
    const r = await fetch(`${API}/${doctorId}/availability?date=${dateStr}`).then(r => r.json()).catch(() => null);
    setAvailability(r?.data || null);
    setAvLoading(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const res = await fetch(`${API}/${doctorId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, appointment_date: selectedDate }),
    });
    const d = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(d?.error?.title || 'فشل الحجز'); return; }
    setBookingResult(d.data);
    setStep('done');
  };

  const week = weekDates(weekOffset);
  const today = fmt(new Date());

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-sky-50 px-4 py-8" dir="rtl">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">حجز موعد</h1>
          <p className="text-gray-500 text-sm mt-1">ميديفلو — منصة الرعاية الصحية</p>
        </div>

        {step === 'date' && (
          <div className="space-y-4">
            {/* Week navigator */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
                <span className="text-sm font-semibold text-gray-700">
                  {weekOffset === 0 ? 'هذا الأسبوع' : weekOffset === 1 ? 'الأسبوع القادم' : `+${weekOffset} أسابيع`}
                </span>
                <button onClick={() => { if (weekOffset > 0) setWeekOffset(w => w - 1); }} disabled={weekOffset === 0}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {week.map((d, i) => {
                  const dateStr = fmt(d);
                  const isPast = dateStr < today;
                  const dow = d.getDay();
                  const sched = schedule.find(s => s.day_of_week === dow);
                  const hasSlots = sched?.is_active && !isPast;
                  const isSelected = dateStr === selectedDate;
                  return (
                    <button key={i} onClick={() => hasSlots && selectDate(dateStr)}
                      disabled={!hasSlots}
                      className={`flex flex-col items-center py-2 px-1 rounded-xl transition-colors ${
                        isSelected ? 'bg-teal-500 text-white' :
                        hasSlots ? 'hover:bg-teal-50 text-gray-700 cursor-pointer' :
                        'text-gray-300 cursor-not-allowed'
                      }`}>
                      <span className="text-xs font-medium">{DAY_SHORT[i]}</span>
                      <span className="text-lg font-bold mt-0.5">{d.getDate()}</span>
                      {hasSlots && <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-teal-400'}`} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Availability */}
            {avLoading && <div className="text-center text-gray-400 text-sm py-4">جاري التحقق من التوفر...</div>}
            {availability && !avLoading && (
              <div className={`rounded-2xl p-4 ${availability.available ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-3">
                  <Users className={`w-5 h-5 ${availability.available ? 'text-green-600' : 'text-red-600'}`} />
                  <div>
                    <p className={`text-sm font-bold ${availability.available ? 'text-green-800' : 'text-red-800'}`}>
                      {availability.reason === 'no_schedule' ? 'لا يوجد دوام في هذا اليوم' :
                       availability.available ? `يوجد ${availability.maxPatients - availability.bookedCount} مكان متاح` : 'اكتملت المواعيد لهذا اليوم'}
                    </p>
                    {availability.startTime && (
                      <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {availability.startTime?.slice(0,5)} – {availability.endTime?.slice(0,5)}
                        <span className="mr-2">·</span>
                        <Users className="w-3 h-3" />
                        {availability.bookedCount} / {availability.maxPatients}
                      </p>
                    )}
                  </div>
                </div>
                {availability.available && (
                  <button onClick={() => setStep('form')}
                    className="mt-3 w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                    متابعة الحجز
                  </button>
                )}
              </div>
            )}

            {schedule.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">لم يُحدد جدول الدوام بعد</p>
              </div>
            )}
          </div>
        )}

        {step === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5 p-3 bg-teal-50 rounded-xl">
              <Calendar className="w-5 h-5 text-teal-600" />
              <div>
                <p className="text-sm font-bold text-teal-800">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {availability?.startTime && <p className="text-xs text-teal-600">{availability.startTime?.slice(0,5)} – {availability.endTime?.slice(0,5)}</p>}
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل *</label>
                <input value={form.patient_name} onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))}
                  placeholder="أحمد محمد" required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف *</label>
                <input type="tel" dir="ltr" value={form.patient_phone} onChange={e => setForm(f => ({ ...f, patient_phone: e.target.value }))}
                  placeholder="+9647801234567" required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني (اختياري)</label>
                <input type="email" dir="ltr" value={form.patient_email} onChange={e => setForm(f => ({ ...f, patient_email: e.target.value }))}
                  placeholder="example@email.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">سبب الزيارة (اختياري)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="وصف مختصر للحالة..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('date')}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">رجوع</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-60">
                  {submitting ? 'جاري الحجز...' : 'تأكيد الحجز'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">تم الحجز بنجاح!</h2>
            <p className="text-gray-500 text-sm mb-5">سيتواصل معك الطبيب لتأكيد موعدك</p>
            <div className="bg-gray-50 rounded-xl p-4 text-right space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-900 font-medium">{bookingResult?.patient_name}</span>
                <span className="text-gray-500">الاسم</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-900 font-medium">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <span className="text-gray-500">التاريخ</span>
              </div>
              {bookingResult?.appointment_time && (
                <div className="flex justify-between">
                  <span className="text-gray-900 font-medium">{bookingResult.appointment_time?.slice(0,5)}</span>
                  <span className="text-gray-500">الوقت</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-amber-600 font-medium">معلق</span>
                <span className="text-gray-500">الحالة</span>
              </div>
            </div>
            <button onClick={() => { setStep('date'); setSelectedDate(''); setAvailability(null); setForm({ patient_name:'', patient_phone:'', patient_email:'', notes:'' }); }}
              className="mt-5 w-full border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
              حجز موعد آخر
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
