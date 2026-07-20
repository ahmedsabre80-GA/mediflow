'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Ban, Filter } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

function adminAuthHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('admin-token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

const ENTITY_LABELS: Record<string, string> = { pharmacy: 'صيدلية', warehouse: 'مستودع', doctor: 'طبيب' };
const STATUS_LABELS: Record<string, string> = { pending: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض', cancelled: 'ملغى' };
const STATUS_COLORS: Record<string, string> = { pending: 'bg-amber-50 text-amber-700', approved: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-500' };

export default function UpgradeRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [entityFilter, setEntityFilter] = useState('');
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (entityFilter) params.set('entityType', entityFilter);
    const r = await fetch(`${API}/admin/upgrade-requests?${params}`, { headers: adminAuthHeaders() });
    if (r.ok) { const d = await r.json(); setRequests(d.data || []); setTotal(d.total || 0); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter, entityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (id: string, action: 'approve' | 'reject' | 'cancel') => {
    setBusyId(id);
    const r = await fetch(`${API}/admin/upgrade-requests/${id}/${action}`, { method: 'PATCH', headers: adminAuthHeaders(), body: JSON.stringify({}) });
    setBusyId('');
    if (r.ok) {
      showToast(action === 'approve' ? '✅ تمت الموافقة وتطبيق الخطة' : action === 'reject' ? '❌ تم الرفض' : '⛔ تم الإلغاء');
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      showToast(`❌ ${d?.error?.title || 'تعذر تنفيذ الإجراء'}`);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">طلبات الترقية</h1>
        <p className="text-sm text-gray-500 mt-1">{total} طلب</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-gray-400" />
        {[{ k: 'pending', l: 'قيد المراجعة' }, { k: 'approved', l: 'موافق عليها' }, { k: 'rejected', l: 'مرفوضة' }, { k: 'cancelled', l: 'ملغاة' }, { k: '', l: 'الكل' }].map(f => (
          <button key={f.k} onClick={() => setStatusFilter(f.k)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${statusFilter === f.k ? 'bg-sky-500 text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}>
            {f.l}
          </button>
        ))}
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className="border border-gray-300 rounded-xl text-sm px-3 py-1.5">
          <option value="">كل الأنواع</option>
          <option value="pharmacy">صيدليات</option>
          <option value="warehouse">مذاخر</option>
          <option value="doctor">أطباء</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">جاري التحميل...</div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">لا توجد طلبات في هذا القسم</div>
        ) : requests.map(req => (
          <div key={req.id} className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[req.status]}`}>{STATUS_LABELS[req.status] || req.status}</span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-sky-50 text-sky-700">{ENTITY_LABELS[req.entity_type] || req.entity_type}</span>
                <span className="text-xs text-gray-400">{new Date(req.created_at).toLocaleString('ar-IQ')}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">المنظمة</p>
                <p className="font-bold text-gray-900 text-sm">{req.organization_display_name || '—'}</p>
              </div>
              <div className="bg-sky-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">الخطة المطلوبة</p>
                <p className="font-bold text-gray-900 text-sm">{req.requested_plan_name_ar || req.requested_plan_name || '—'}</p>
              </div>
            </div>
            {req.admin_notes && <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 mb-3">ملاحظة الإدارة: {req.admin_notes}</p>}
            {req.status === 'pending' ? (
              <div className="flex gap-2">
                <button onClick={() => decide(req.id, 'approve')} disabled={busyId === req.id}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium"><CheckCircle className="w-4 h-4" />موافقة</button>
                <button onClick={() => decide(req.id, 'reject')} disabled={busyId === req.id}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 py-2 rounded-xl text-sm font-medium"><XCircle className="w-4 h-4" />رفض</button>
                <button onClick={() => decide(req.id, 'cancel')} disabled={busyId === req.id}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 py-2 rounded-xl text-sm font-medium"><Ban className="w-4 h-4" />إلغاء</button>
              </div>
            ) : (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2">
                تم اتخاذ القرار: {req.decided_at ? new Date(req.decided_at).toLocaleString('ar-IQ') : '—'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
