'use client';
import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, Star, Ban, Trash2, X } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const STORE_KEY = 'admin-doctors-status';

const MOCK_DOCTORS: any[] = [];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'معلق', color: 'bg-amber-100 text-amber-700' },
  active: { label: 'نشط', color: 'bg-green-100 text-green-700' },
  suspended: { label: 'موقوف', color: 'bg-red-100 text-red-700' },
  rejected: { label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
};

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState(MOCK_DOCTORS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Object.keys(saved).length > 0) {
      setDoctors(prev => prev
        .filter(d => saved[d.id] !== 'deleted')
        .map(d => saved[d.id] ? { ...d, status: saved[d.id] } : d)
      );
    }
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const updateStatus = (id: number, status: string) => {
    const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    saved[id] = status;
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    const doctor = doctors.find(d => d.id === id);
    const actionLabels: Record<string, string> = { active: 'موافقة على طبيب', suspended: 'إيقاف طبيب', rejected: 'رفض طبيب' };
    logAction(status, actionLabels[status] || status, 'طبيب', doctor?.name || String(id), String(id), '/dashboard/doctors');
    setDoctors(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    const msgs: Record<string, string> = { active: '✅ تم تفعيل الطبيب', suspended: '🚫 تم إيقاف الطبيب', rejected: '❌ تم رفض الطبيب' };
    showToast(msgs[status] || 'تم التحديث');
    setSelected(null);
  };

  const deleteDoctor = (id: number) => {
    const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    saved[id] = 'deleted';
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    const doctor = doctors.find(d => d.id === id);
    logAction('delete', 'حذف طبيب', 'طبيب', doctor?.name || String(id), String(id), '/dashboard/doctors');
    setDoctors(prev => prev.filter(d => d.id !== id));
    setConfirmDelete(null);
    showToast('🗑️ تم حذف الطبيب');
  };

  const filtered = doctors.filter(d => {
    const matchSearch = !search || d.name.includes(search) || d.specialization.includes(search);
    const matchFilter = filter === 'all' || d.status === filter;
    return matchSearch && matchFilter;
  });

  const pending = doctors.filter(d => d.status === 'pending_verification').length;
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', specialization: '', license: '', city: '', email: '', addedBy: 'platform' });

  const handleAdd = () => {
    if (!addForm.name || !addForm.license) return alert('يرجى ملء الاسم ورقم الترخيص');
    const newDoc = { id: Date.now(), name: addForm.name, specialization: addForm.specialization, license: addForm.license, city: addForm.city, status: addForm.addedBy === 'platform' ? 'active' : 'pending_verification', rating: 0, consultations: 0, created_at: new Date().toISOString().split('T')[0] };
    setDoctors(prev => [newDoc, ...prev]);
    logAction('add', `إضافة طبيب (${addForm.addedBy === 'platform' ? 'من قِبَل المنصة' : 'طلب شخصي'})`, 'طبيب', addForm.name, String(newDoc.id), '/dashboard/doctors');
    setShowAddModal(false);
    setAddForm({ name: '', specialization: '', license: '', city: '', email: '', addedBy: 'platform' });
    showToast('✅ تم إضافة الطبيب');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الأطباء</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.length} إجمالي</span>
          <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.filter(d=>d.status==='active').length} نشط</span>
          <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.filter(d=>d.status==='pending_verification').length} معلق</span>
          <span className="bg-red-100 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.filter(d=>d.status==='suspended').length} موقوف</span>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            + إضافة طبيب
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي', value: doctors.length, color: 'text-sky-600' },
          { label: 'نشط', value: doctors.filter(d => d.status === 'active').length, color: 'text-green-600' },
          { label: 'معلق', value: doctors.filter(d => d.status === 'pending_verification').length, color: 'text-amber-600' },
          { label: 'موقوف', value: doctors.filter(d => d.status === 'suspended').length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold">إضافة طبيب جديد</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">مصدر الإضافة</label>
                <div className="flex gap-2">
                  {[{k:'platform',l:'من قِبَل المنصة'},{k:'request',l:'طلب شخصي'},{k:'team',l:'فريق العمل'}].map(s => (
                    <button key={s.k} onClick={() => setAddForm(f => ({...f, addedBy: s.k}))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 ${addForm.addedBy === s.k ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600'}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { key: 'name', label: 'اسم الطبيب *', placeholder: 'د. أحمد محمد' },
                { key: 'specialization', label: 'التخصص', placeholder: 'طب القلب' },
                { key: 'license', label: 'رقم الترخيص *', placeholder: 'MED-2024-001', dir: 'ltr' },
                { key: 'city', label: 'المدينة', placeholder: 'بغداد' },
                { key: 'email', label: 'البريد الإلكتروني', placeholder: 'doctor@example.com', dir: 'ltr', type: 'email' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input dir={field.dir || 'rtl'} type={field.type || 'text'}
                    value={(addForm as any)[field.key]} onChange={e => setAddForm(f => ({...f, [field.key]: e.target.value}))}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">مستند الترخيص (PDF/صورة)</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-teal-400 transition-colors">
                  <p className="text-sm text-gray-500">اضغط لرفع مستند الترخيص</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — حد أقصى 5MB</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={handleAdd} className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm">إضافة</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي', value: doctors.length, color: 'text-teal-600' },
          { label: 'نشط', value: doctors.filter(d => d.status === 'active').length, color: 'text-green-600' },
          { label: 'معلق', value: pending, color: 'text-amber-600' },
          { label: 'إجمالي الاستشارات', value: doctors.reduce((s, d) => s + d.consultations, 0), color: 'text-sky-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الطبيب أو التخصص..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending_verification',l:'معلق'},{k:'active',l:'نشط'},{k:'suspended',l:'موقوف'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['الطبيب', 'التخصص', 'المدينة', 'التقييم', 'الاستشارات', 'الحالة', 'إجراءات'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">لا يوجد أطباء</td></tr>
            ) : filtered.map(doctor => {
              const status = STATUS_LABELS[doctor.status];
              return (
                <tr key={doctor.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center">
                        <span className="text-teal-700 font-bold text-sm">د</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{doctor.name}</p>
                        <p className="text-xs text-gray-400">{doctor.license}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{doctor.specialization}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{doctor.city}</td>
                  <td className="px-6 py-4">
                    {doctor.rating > 0 ? (
                      <div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /><span className="text-sm font-medium">{doctor.rating}</span></div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{doctor.consultations}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(doctor)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                      {doctor.status === 'pending_verification' && <>
                        <button onClick={() => updateStatus(doctor.id, 'active')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => updateStatus(doctor.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><XCircle className="w-4 h-4" /></button>
                      </>}
                      {doctor.status === 'active' && <button onClick={() => updateStatus(doctor.id, 'suspended')} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><Ban className="w-4 h-4" /></button>}
                      {doctor.status === 'suspended' && <button onClick={() => updateStatus(doctor.id, 'active')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>}
                      <button onClick={() => setConfirmDelete(doctor.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold">تفاصيل الطبيب</h2>
            </div>
            <div className="space-y-3 mb-5">
              {[['الاسم', selected.name], ['التخصص', selected.specialization], ['الترخيص', selected.license], ['المدينة', selected.city], ['الحالة', STATUS_LABELS[selected.status]?.label]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-900 text-sm">{v}</span>
                  <span className="text-gray-500 text-sm">{l}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {selected.status === 'pending_verification' && <button onClick={() => updateStatus(selected.id, 'active')} className="bg-green-500 text-white font-semibold py-3 rounded-xl text-sm">✅ موافقة</button>}
              {selected.status === 'active' && <button onClick={() => updateStatus(selected.id, 'suspended')} className="bg-amber-500 text-white font-semibold py-3 rounded-xl text-sm">🚫 إيقاف</button>}
              {selected.status === 'suspended' && <button onClick={() => updateStatus(selected.id, 'active')} className="bg-green-500 text-white font-semibold py-3 rounded-xl text-sm">✅ تفعيل</button>}
              <button onClick={() => setSelected(null)} className="border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold mb-2">تأكيد الحذف</h2>
            <p className="text-gray-500 text-sm mb-5">هل أنت متأكد من حذف هذا الطبيب؟</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
              <button onClick={() => deleteDoctor(confirmDelete)} className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
