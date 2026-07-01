'use client';
import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, Ban, Trash2, X, RefreshCw } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:  { label: 'معلق',   color: 'bg-amber-100 text-amber-700' },
  approved: { label: 'موافق',  color: 'bg-green-100 text-green-700' },
  rejected: { label: 'مرفوض', color: 'bg-red-100 text-red-700' },
};

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${PHARMACY_API}/admin-requests?portal_type=doctor`);
      const d = await r.json();
      if (d.success) setDoctors(d.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    const doc = doctors.find(d => d.id === id);
    await fetch(`${PHARMACY_API}/admin-requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {});
    // Activate the auth account so the doctor can actually log in
    if (status === 'approved' && doc?.employee_email) {
      await fetch(`${AUTH_API}/auth/admin/activate-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: doc.employee_email, secret: 'mediflow-delete-2026' }),
      }).catch(() => {});
    }
    setDoctors(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    logAction(status, status === 'approved' ? 'موافقة على طبيب' : 'رفض طبيب', 'طبيب', doc?.employee_name || id, id, '/dashboard/doctors');
    showToast(status === 'approved' ? '✅ تمت الموافقة على الطبيب' : '❌ تم رفض الطبيب');
    setSelected(null);
  };

  const deleteDoctor = async (id: string) => {
    const doc = doctors.find(d => d.id === id);
    setDoctors(prev => prev.filter(d => d.id !== id));
    setConfirmDelete(null);
    // Remove from admin-requests
    await fetch(`${PHARMACY_API}/admin-requests/${id}`, { method: 'DELETE' }).catch(() => {});
    // Wipe auth account so doctor can re-register
    if (doc?.employee_email) {
      fetch(`${AUTH_API}/auth/admin/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: doc.employee_email, secret: 'mediflow-delete-2026' }),
      }).catch(() => {});
    }
    logAction('delete', 'حذف طبيب', 'طبيب', doc?.employee_name || id, id, '/dashboard/doctors');
    showToast('🗑️ تم حذف الطبيب بالكامل');
  };

  const filtered = doctors.filter(d => {
    const name = (d.employee_name || '').toLowerCase();
    const role = (d.employee_role || '').toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || role.includes(search.toLowerCase());
    const matchFilter = filter === 'all' || d.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الأطباء</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.length} إجمالي</span>
          <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.filter(d=>d.status==='pending').length} معلق</span>
          <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.filter(d=>d.status==='approved').length} موافق</span>
          <button onClick={load} disabled={loading}
            className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'معلق',  value: doctors.filter(d=>d.status==='pending').length,  color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'موافق', value: doctors.filter(d=>d.status==='approved').length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'مرفوض', value: doctors.filter(d=>d.status==='rejected').length, color: 'text-red-600',   bg: 'bg-red-50'   },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الطبيب أو التخصص..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending',l:'معلق'},{k:'approved',l:'موافق'},{k:'rejected',l:'مرفوض'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['الطبيب', 'التخصص', 'البريد الإلكتروني', 'الترخيص', 'الحالة', 'إجراءات'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(3)].map((_, i) => <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>)
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">لا يوجد أطباء مسجلون</td></tr>
            ) : filtered.map(doc => {
              const status = STATUS_LABELS[doc.status] || STATUS_LABELS.pending;
              return (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center">
                        <span className="text-teal-700 font-bold text-sm">د</span>
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{doc.employee_name}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{doc.employee_role || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dir-ltr">{doc.employee_email || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{doc.reason?.replace('رقم الترخيص: ', '') || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(doc)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                      {doc.status === 'pending' && <>
                        <button onClick={() => decide(doc.id, 'approved')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => decide(doc.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><XCircle className="w-4 h-4" /></button>
                      </>}
                      <button onClick={() => setConfirmDelete(doc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
            <div className="space-y-2 mb-5">
              {[['الاسم', selected.employee_name], ['التخصص', selected.employee_role], ['البريد', selected.employee_email], ['رقم الترخيص', selected.reason?.replace('رقم الترخيص: ','')], ['تاريخ الطلب', new Date(selected.created_at).toLocaleDateString('ar-IQ')], ['الحالة', STATUS_LABELS[selected.status]?.label]].map(([l, v]) => v ? (
                <div key={l} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-900 text-sm">{v}</span>
                  <span className="text-gray-500 text-sm">{l}</span>
                </div>
              ) : null)}
            </div>
            <div className="flex gap-3">
              {selected.status === 'pending' && <>
                <button onClick={() => decide(selected.id, 'approved')} className="flex-1 bg-green-500 text-white font-semibold py-3 rounded-xl text-sm">✅ موافقة</button>
                <button onClick={() => decide(selected.id, 'rejected')} className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm">❌ رفض</button>
              </>}
              <button onClick={() => setSelected(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold mb-2">تأكيد الحذف الكامل</h2>
            <p className="text-gray-500 text-sm mb-5">سيتم حذف جميع بيانات الطبيب بما في ذلك حسابه، ويمكنه التسجيل مجدداً.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
              <button onClick={() => deleteDoctor(confirmDelete)} className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm">حذف الكل</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
