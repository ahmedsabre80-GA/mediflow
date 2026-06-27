'use client';
import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, Ban, Trash2, Star, X } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const STORE_KEY = 'admin-pharmacists-status';

const MOCK_PHARMACISTS = [
  { id: 1, name: 'حسن الموسى', pharmacyName: 'صيدلية الأمين', license: 'PH-LIC-001', city: 'بغداد', rating: 4.8, status: 'active', createdAt: '2026-06-01' },
  { id: 2, name: 'مريم علي', pharmacyName: 'صيدلية النور', license: 'PH-LIC-002', city: 'البصرة', rating: 0, status: 'pending_verification', createdAt: '2026-06-20' },
  { id: 3, name: 'كريم جابر', pharmacyName: 'صيدلية الشفاء', license: 'PH-LIC-003', city: 'الموصل', rating: 4.5, status: 'active', createdAt: '2026-04-15' },
  { id: 4, name: 'نور الهدى', pharmacyName: 'صيدلية الرشيد', license: 'PH-LIC-004', city: 'أربيل', rating: 0, status: 'pending_verification', createdAt: '2026-06-25' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'معلق', color: 'bg-amber-100 text-amber-700' },
  active: { label: 'نشط', color: 'bg-green-100 text-green-700' },
  suspended: { label: 'موقوف', color: 'bg-red-100 text-red-700' },
  rejected: { label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
};

export default function PharmacistsPage() {
  const [pharmacists, setPharmacists] = useState(MOCK_PHARMACISTS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Object.keys(saved).length > 0) {
      setPharmacists(prev => prev
        .filter(p => saved[p.id] !== 'deleted')
        .map(p => saved[p.id] ? { ...p, status: saved[p.id] } : p)
      );
    }
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const updateStatus = (id: number, status: string) => {
    const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    saved[id] = status;
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    const ph = pharmacists.find(p => p.id === id);
    const actionLabels: Record<string, string> = { active: 'موافقة على صيدلاني', suspended: 'إيقاف صيدلاني', rejected: 'رفض صيدلاني' };
    logAction(status, actionLabels[status] || status, 'صيدلاني', ph?.name || String(id), String(id), '/dashboard/pharmacists');
    setPharmacists(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    const msgs: Record<string, string> = { active: '✅ تم تفعيل الصيدلاني', suspended: '🚫 تم إيقاف الصيدلاني', rejected: '❌ تم رفض الصيدلاني' };
    showToast(msgs[status] || 'تم التحديث');
    setSelected(null);
  };

  const deletePharmacist = (id: number) => {
    const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    saved[id] = 'deleted';
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    setPharmacists(prev => prev.filter(p => p.id !== id));
    setConfirmDelete(null);
    showToast('🗑️ تم الحذف');
  };

  const filtered = pharmacists.filter(p => {
    const matchSearch = !search || p.name.includes(search) || p.pharmacyName.includes(search);
    const matchFilter = filter === 'all' || p.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الصيادلة</h1>
        <span className="bg-teal-100 text-teal-700 text-sm font-medium px-3 py-1 rounded-full">{pharmacists.length} صيدلاني</span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي', value: pharmacists.length, color: 'text-teal-600' },
          { label: 'نشط', value: pharmacists.filter(p => p.status === 'active').length, color: 'text-green-600' },
          { label: 'معلق', value: pharmacists.filter(p => p.status === 'pending_verification').length, color: 'text-amber-600' },
          { label: 'موقوف', value: pharmacists.filter(p => p.status === 'suspended').length, color: 'text-red-600' },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن صيدلاني..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending_verification',l:'معلق'},{k:'active',l:'نشط'},{k:'suspended',l:'موقوف'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['الصيدلاني', 'الصيدلية', 'المدينة', 'التقييم', 'الحالة', 'إجراءات'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(ph => {
              const status = STATUS_LABELS[ph.status];
              return (
                <tr key={ph.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center">
                        <span className="text-teal-700 font-bold text-sm">{ph.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{ph.name}</p>
                        <p className="text-xs text-gray-400">{ph.license}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{ph.pharmacyName}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{ph.city}</td>
                  <td className="px-6 py-4">
                    {ph.rating > 0 ? (
                      <div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /><span className="text-sm font-medium">{ph.rating}</span></div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(ph)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                      {ph.status === 'pending_verification' && <>
                        <button onClick={() => updateStatus(ph.id, 'active')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => updateStatus(ph.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><XCircle className="w-4 h-4" /></button>
                      </>}
                      {ph.status === 'active' && <button onClick={() => updateStatus(ph.id, 'suspended')} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><Ban className="w-4 h-4" /></button>}
                      {ph.status === 'suspended' && <button onClick={() => updateStatus(ph.id, 'active')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>}
                      <button onClick={() => setConfirmDelete(ph.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
              <h2 className="text-lg font-bold">تفاصيل الصيدلاني</h2>
            </div>
            <div className="space-y-3 mb-5">
              {[['الاسم', selected.name], ['الصيدلية', selected.pharmacyName], ['الترخيص', selected.license], ['المدينة', selected.city], ['الحالة', STATUS_LABELS[selected.status]?.label]].map(([l, v]) => (
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
            <p className="text-gray-500 text-sm mb-5">هل أنت متأكد؟</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
              <button onClick={() => deletePharmacist(confirmDelete)} className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
