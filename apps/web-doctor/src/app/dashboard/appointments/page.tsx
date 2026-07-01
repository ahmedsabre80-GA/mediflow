'use client';
import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Users, CheckCircle, XCircle, Trash2, Plus, X, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/appointments/doctors';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
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

export default function AppointmentsPage() {
  const [doctorId, setDoctorId] = useState('');
  const [tab, setTab] = useState<'calendar' | 'schedule'>('calendar');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(fmt(new Date()));
  const [bookings, setBookings] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  // Schedule editor state
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ start_time: '09:00', end_time: '17:00', max_patients: '10', is_active: true });
  const [saving, setSaving] = useState(false);

  // New booking modal (for manual add by doctor)
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ patient_name: '', patient_phone: '', patient_email: '', appointment_date: fmt(new Date()), notes: '' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    const id = localStorage.getItem('doctor-id') || '';
    setDoctorId(id);
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!doctorId) return;
    const r = await fetch(`${API}/${doctorId}/schedule`).then(r => r.json()).catch(() => ({ data: [] }));
    setSchedule(r.data || []);
  }, [doctorId]);

  const loadBookings = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    const r = await fetch(`${API}/${doctorId}/bookings?date=${selectedDate}`).then(r => r.json()).catch(() => ({ data: [] }));
    setBookings(r.data || []);
    const av = await fetch(`${API}/${doctorId}/availability?date=${selectedDate}`).then(r => r.json()).catch(() => null);
    setAvailability(av?.data || null);
    setLoading(false);
  }, [doctorId, selectedDate]);

  useEffect(() => { if (doctorId) { loadSchedule(); loadBookings(); } }, [doctorId, loadSchedule, loadBookings]);

  const week = weekDates(weekOffset);

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

  const openEditDay = (dow: number) => {
    const existing = schedule.find(s => s.day_of_week === dow);
    setEditForm(existing ? {
      start_time: existing.start_time.slice(0, 5),
      end_time: existing.end_time.slice(0, 5),
      max_patients: String(existing.max_patients),
      is_active: existing.is_active,
    } : { start_time: '09:00', end_time: '17:00', max_patients: '10', is_active: true });
    setEditDay(dow);
  };

  const updateStatus = async (bookingId: string, status: string) => {
    await fetch(`${API}/${doctorId}/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {});
    loadBookings();
    showToast(status === 'confirmed' ? '✅ تم تأكيد الموعد' : '❌ تم إلغاء الموعد');
  };

  const deleteBooking = async (bookingId: string) => {
    await fetch(`${API}/${doctorId}/bookings/${bookingId}`, { method: 'DELETE' }).catch(() => {});
    loadBookings();
    showToast('🗑️ تم حذف الموعد');
  };

  const addBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSaving(true);
    const res = await fetch(`${API}/${doctorId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    const d = await res.json();
    setAddSaving(false);
    if (!res.ok) { setAddError(d?.error?.title || 'فشل الحجز'); return; }
    setShowAdd(false);
    setAddForm({ patient_name: '', patient_phone: '', patient_email: '', appointment_date: fmt(new Date()), notes: '' });
    if (addForm.appointment_date === selectedDate) loadBookings();
    showToast('✅ تم إضافة الموعد');
  };

  const getScheduleForDay = (dow: number) => schedule.find(s => s.day_of_week === dow);

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button onClick={() => setTab('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'calendar' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500'}`}>
            <Calendar className="w-4 h-4 inline ml-2" />المواعيد
          </button>
          <button onClick={() => setTab('schedule')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'schedule' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500'}`}>
            <Clock className="w-4 h-4 inline ml-2" />جدول الدوام
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <Plus className="w-4 h-4" /> إضافة موعد
          </button>
          <button onClick={loadBookings} disabled={loading}
            className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {tab === 'calendar' && (
        <>
          {/* Week navigator */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
              <span className="text-sm font-semibold text-gray-700">
                {weekOffset === 0 ? 'هذا الأسبوع' : weekOffset === 1 ? 'الأسبوع القادم' : weekOffset === -1 ? 'الأسبوع الماضي' : `${weekOffset > 0 ? '+' : ''}${weekOffset} أسابيع`}
              </span>
              <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((d, i) => {
                const dateStr = fmt(d);
                const isSelected = dateStr === selectedDate;
                const isToday = fmt(new Date()) === dateStr;
                const sched = getScheduleForDay(d.getDay());
                const hasSlots = sched?.is_active;
                return (
                  <button key={i} onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center py-2 px-1 rounded-xl transition-colors ${isSelected ? 'bg-teal-500 text-white' : isToday ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                    <span className="text-xs font-medium">{DAY_SHORT[i]}</span>
                    <span className={`text-lg font-bold mt-0.5 ${isSelected ? 'text-white' : ''}`}>{d.getDate()}</span>
                    {hasSlots && <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-teal-400'}`} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Availability summary */}
          {availability && (
            <div className={`rounded-2xl p-4 flex items-center gap-4 ${availability.available ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${availability.available ? 'bg-green-100' : 'bg-red-100'}`}>
                <Users className={`w-5 h-5 ${availability.available ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className={`text-sm font-bold ${availability.available ? 'text-green-800' : 'text-red-800'}`}>
                  {availability.reason === 'no_schedule' ? 'لا يوجد دوام في هذا اليوم' : availability.available ? 'يوجد أماكن متاحة' : 'اكتملت المواعيد'}
                </p>
                {availability.maxPatients && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {availability.bookedCount} / {availability.maxPatients} مريض · {availability.startTime?.slice(0,5)} – {availability.endTime?.slice(0,5)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Bookings list */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">
                مواعيد {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <span className="bg-teal-100 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">{bookings.length} موعد</span>
            </div>
            {loading ? (
              <div className="p-12 text-center text-gray-400">جاري التحميل...</div>
            ) : bookings.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                لا توجد مواعيد في هذا اليوم
              </div>
            ) : (
              <div className="divide-y">
                {bookings.map(b => (
                  <div key={b.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-teal-700 font-bold text-sm">{b.patient_name?.[0] || 'م'}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{b.patient_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{b.patient_phone || b.patient_email || '—'}</p>
                        {b.notes && <p className="text-xs text-gray-400 mt-0.5">{b.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLE[b.status] || STATUS_STYLE.pending}`}>
                        {STATUS_LABEL[b.status] || b.status}
                      </span>
                      {b.status === 'pending' && (
                        <>
                          <button onClick={() => updateStatus(b.id, 'confirmed')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                          <button onClick={() => updateStatus(b.id, 'cancelled')} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><XCircle className="w-4 h-4" /></button>
                        </>
                      )}
                      <button onClick={() => deleteBooking(b.id)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'schedule' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-bold text-gray-900">جدول الدوام الأسبوعي</h2>
            <p className="text-xs text-gray-500 mt-0.5">اضغط على أي يوم لتعديل أوقات العمل والسعة الاستيعابية</p>
          </div>
          <div className="divide-y">
            {DAYS.map((dayName, dow) => {
              const s = getScheduleForDay(dow);
              return (
                <div key={dow} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${s?.is_active ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>
                      {DAY_SHORT[dow]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{dayName}</p>
                      {s?.is_active ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)} · أقصى {s.max_patients} مريض
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">{s ? 'إجازة' : 'لم يُحدد'}</p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => openEditDay(dow)}
                    className="px-4 py-1.5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    تعديل
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit schedule day modal */}
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
                <button onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`w-11 h-6 rounded-full transition-colors ${editForm.is_active ? 'bg-teal-500' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${editForm.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {editForm.is_active && <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">وقت البدء</label>
                    <input type="time" value={editForm.start_time}
                      onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">وقت الانتهاء</label>
                    <input type="time" value={editForm.end_time}
                      onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">أقصى عدد مرضى في اليوم</label>
                  <input type="number" min="1" max="100" value={editForm.max_patients}
                    onChange={e => setEditForm(f => ({ ...f, max_patients: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditDay(null)}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={saveScheduleDay} disabled={saving}
                className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add booking modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">إضافة موعد جديد</h2>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {addError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{addError}</div>}
            <form onSubmit={addBooking} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المريض *</label>
                <input value={addForm.patient_name} onChange={e => setAddForm(f => ({ ...f, patient_name: e.target.value }))}
                  placeholder="الاسم الكامل" required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                  <input type="tel" dir="ltr" value={addForm.patient_phone} onChange={e => setAddForm(f => ({ ...f, patient_phone: e.target.value }))}
                    placeholder="+964..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الموعد *</label>
                  <input type="date" value={addForm.appointment_date} onChange={e => setAddForm(f => ({ ...f, appointment_date: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="أي تفاصيل إضافية..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
                <button type="submit" disabled={addSaving}
                  className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                  {addSaving ? 'جاري الحفظ...' : 'إضافة الموعد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
