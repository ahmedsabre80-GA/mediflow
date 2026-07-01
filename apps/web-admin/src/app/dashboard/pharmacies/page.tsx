'use client';
import { useEffect, useState } from 'react';
import { Search, CheckCircle, XCircle, Eye, Ban, Trash2, X } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';
const STORE_KEY = 'admin-pharmacies-status';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'معلق', color: 'bg-amber-100 text-amber-700' },
  active: { label: 'نشط', color: 'bg-green-100 text-green-700' },
  suspended: { label: 'موقوف', color: 'bg-red-100 text-red-700' },
  rejected: { label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
};

export default function PharmaciesPage() {
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetch(`${PHARMACY_API}/pharmacies/admin/all`)
      .then(r => r.json())
      .then(d => setPharmacies(d.data || []))
      .catch(() => setPharmacies([]))
      .finally(() => setLoading(false));
  }, []);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', nameAr: '', licenseNumber: '', phone: '', address: '', city: '', addedBy: 'platform' });

  const handleAdd = () => {
    if (!addForm.nameAr || !addForm.licenseNumber || !addForm.phone) return alert('يرجى ملء الاسم والترخيص والهاتف');
    const newPharmacy = {
      id: `manual-${Date.now()}`,
      name: addForm.name || addForm.nameAr,
      name_ar: addForm.nameAr,
      license_number: addForm.licenseNumber,
      phone: addForm.phone,
      address: addForm.address,
      city: addForm.city,
      status: addForm.addedBy === 'platform' ? 'active' : 'pending_verification',
      rating: 0,
      distance_km: 0,
    };
    setPharmacies(prev => [newPharmacy, ...prev]);
    const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    saved[newPharmacy.id] = newPharmacy.status;
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    logAction('add', `إضافة صيدلية (${addForm.addedBy === 'platform' ? 'من قِبَل المنصة' : 'طلب شخصي'})`, 'صيدلية', addForm.nameAr, newPharmacy.id, '/dashboard/pharmacies');
    setShowAddModal(false);
    setAddForm({ name: '', nameAr: '', licenseNumber: '', phone: '', address: '', city: '', addedBy: 'platform' });
    showToast('✅ تم إضافة الصيدلية');
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`${PHARMACY_API}/pharmacies/admin/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setPharmacies(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      const msgs: Record<string, string> = { active: '✅ تم تفعيل الصيدلية', suspended: '🚫 تم إيقاف الصيدلية', rejected: '❌ تم رفض الصيدلية' };
      showToast(msgs[status] || 'تم التحديث');
      const pharmacy = pharmacies.find(p => p.id === id);
      logAction(status, { active: 'موافقة على صيدلية', suspended: 'إيقاف صيدلية', rejected: 'رفض صيدلية' }[status] || status, 'صيدلية', pharmacy?.name_ar || pharmacy?.name || id, id, '/dashboard/pharmacies');
      setSelected(null);
    } catch { showToast('⚠️ فشل تحديث الحالة'); }
  };

  const deletePharmacy = async (id: string) => {
    const pharmacy = pharmacies.find(p => p.id === id);
    setPharmacies(prev => prev.filter(p => p.id !== id));
    setConfirmDelete(null);
    try {
      await fetch(`${PHARMACY_API}/pharmacies/admin/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deleted' }),
      });
    } catch {}
    logAction('delete', 'حذف صيدلية', 'صيدلية', pharmacy?.name_ar || pharmacy?.name || id, id, '/dashboard/pharmacies');
    showToast('🗑️ تم حذف الصيدلية');
  };

  const filtered = pharmacies.filter(p => {
    const matchSearch = !search || p.name?.includes(search) || p.name_ar?.includes(search);
    const matchFilter = filter === 'all' || p.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الصيدليات</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{pharmacies.length} إجمالي</span>
          <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">{pharmacies.filter(p=>p.status==='active').length} نشط</span>
          <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">{pharmacies.filter(p=>p.status==='pending_verification').length} معلق</span>
          <span className="bg-red-100 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">{pharmacies.filter(p=>p.status==='suspended').length} موقوف</span>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            + إضافة صيدلية
          </button>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold">إضافة صيدلية جديدة</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">مصدر الإضافة</label>
                <div className="flex gap-2">
                  {[{k:'platform',l:'من قِبَل المنصة'},{k:'request',l:'طلب شخصي'},{k:'team',l:'فريق العمل'}].map(s => (
                    <button key={s.k} onClick={() => setAddForm(f => ({...f, addedBy: s.k}))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 ${addForm.addedBy === s.k ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600'}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { key: 'nameAr', label: 'اسم الصيدلية (عربي) *', placeholder: 'صيدلية الأمين' },
                { key: 'licenseNumber', label: 'رقم الترخيص *', placeholder: 'PH-2024-001', dir: 'ltr' },
                { key: 'phone', label: 'رقم الهاتف *', placeholder: '+9647801234567', dir: 'ltr' },
                { key: 'address', label: 'العنوان', placeholder: 'الكرادة، شارع المتنبي' },
                { key: 'city', label: 'المدينة', placeholder: 'بغداد' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input dir={(field as any).dir || 'rtl'}
                    value={(addForm as any)[field.key]} onChange={e => setAddForm(f => ({...f, [field.key]: e.target.value}))}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">مستند الترخيص</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-sky-400">
                  <p className="text-sm text-gray-500">اضغط لرفع مستند الترخيص</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — حد أقصى 5MB</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={handleAdd} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm">إضافة</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي', value: pharmacies.length, color: 'text-sky-600' },
          { label: 'نشط', value: pharmacies.filter(p => p.status === 'active').length, color: 'text-green-600' },
          { label: 'معلق', value: pharmacies.filter(p => p.status === 'pending_verification').length, color: 'text-amber-600' },
          { label: 'موقوف', value: pharmacies.filter(p => p.status === 'suspended').length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن صيدلية..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending_verification',l:'معلق'},{k:'active',l:'نشط'},{k:'suspended',l:'موقوف'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['اسم الصيدلية', 'المدينة', 'الهاتف', 'الحالة', 'إجراءات'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(5)].map((_, i) => <tr key={i}>{[...Array(5)].map((_, j) => <td key={j} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>)
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">لا توجد صيدليات</td></tr>
            ) : filtered.map((pharmacy: any) => {
              const status = STATUS_LABELS[pharmacy.status] || STATUS_LABELS.pending_verification;
              return (
                <tr key={pharmacy.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{pharmacy.name_ar || pharmacy.name}</p>
                      <p className="text-xs text-gray-500">{pharmacy.license_number}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{pharmacy.city || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{pharmacy.phone}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelected(pharmacy)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg" title="عرض"><Eye className="w-4 h-4" /></button>
                      {pharmacy.status === 'pending_verification' && <>
                        <button onClick={() => updateStatus(pharmacy.id, 'active')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="موافقة"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => updateStatus(pharmacy.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="رفض"><XCircle className="w-4 h-4" /></button>
                      </>}
                      {pharmacy.status === 'active' && <button onClick={() => updateStatus(pharmacy.id, 'suspended')} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إيقاف"><Ban className="w-4 h-4" /></button>}
                      {pharmacy.status === 'suspended' && <button onClick={() => updateStatus(pharmacy.id, 'active')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="تفعيل"><CheckCircle className="w-4 h-4" /></button>}
                      <button onClick={() => setConfirmDelete(pharmacy.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold text-gray-900">تفاصيل الصيدلية</h2>
            </div>
            <div className="space-y-3 mb-5">
              {[['الاسم', selected.name_ar || selected.name], ['الهاتف', selected.phone], ['المدينة', selected.city], ['العنوان', selected.address], ['التقييم', `⭐ ${parseFloat(selected.rating || 0).toFixed(1)}`], ['الحالة', STATUS_LABELS[selected.status]?.label]].map(([l, v]) => (
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

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold mb-2">تأكيد الحذف</h2>
            <p className="text-gray-500 text-sm mb-5">هل أنت متأكد من حذف هذه الصيدلية؟</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
              <button onClick={() => deletePharmacy(confirmDelete)} className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
