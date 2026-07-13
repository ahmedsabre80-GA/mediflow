'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, CheckCircle, XCircle, Eye, Package, Ban, RefreshCw, KeyRound, LogOut, Trash2, Printer } from 'lucide-react';

function printWarehouseReport(w: WUser) {
  const win = window.open('', '_blank', 'width=700,height=600');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>تقرير مستودع</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;direction:rtl;padding:40px;color:#1a1a1a}.header{text-align:center;border-bottom:2px solid #6366f1;padding-bottom:20px;margin-bottom:24px}.header h1{font-size:22px;color:#6366f1}.header p{font-size:13px;color:#666;margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:24px}th,td{padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;text-align:right}th{background:#f8fafc;font-weight:bold;color:#374151;width:35%}.footer{margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}@media print{body{padding:20px}}</style></head><body><div class="header"><h1>🏭 منصة ميديفلو — تقرير مستودع</h1><p>تاريخ إصدار التقرير: ${new Date().toLocaleString('ar-IQ')}</p></div><table><tr><th>اسم المالك</th><td>${w.first_name} ${w.last_name}</td></tr><tr><th>اسم المستودع</th><td>${w.requester_entity || '—'}</td></tr><tr><th>البريد الإلكتروني</th><td>${w.email}</td></tr><tr><th>الهاتف</th><td>${w.phone || '—'}</td></tr><tr><th>سبب التسجيل</th><td>${w.reason || '—'}</td></tr><tr><th>الحالة</th><td>${STATUS_LABELS[w.status]?.label || w.status}</td></tr><tr><th>تاريخ التسجيل</th><td>${new Date(w.created_at).toLocaleDateString('ar-IQ')}</td></tr><tr><th>رقم السجل</th><td>${w.id}</td></tr></table><div class="footer">تم إصدار هذا التقرير من لوحة إدارة منصة ميديفلو — ${new Date().toLocaleString('ar-IQ')}</div><script>window.onload=()=>{window.print()}<\/script></body></html>`);
  win.document.close();
}

const AUTH_API  = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
function adminAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('admin-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'معلق',   color: 'bg-amber-100 text-amber-700' },
  active:               { label: 'نشط',    color: 'bg-green-100 text-green-700' },
  suspended:            { label: 'موقوف',  color: 'bg-red-100 text-red-700' },
  force_logout:         { label: 'موقوف',  color: 'bg-red-100 text-red-700' },
  rejected:             { label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
};

interface WUser {
  id: string; email: string; phone: string; status: string;
  first_name: string; last_name: string; created_at: string;
  requester_entity?: string; reason?: string;
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [selected, setSelected]     = useState<WUser | null>(null);
  const [acting, setActing]         = useState(false);
  const [toast, setToast]           = useState('');

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState<WUser | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Password reset
  const [resetTarget, setResetTarget] = useState<WUser | null>(null);
  const [newPass, setNewPass]         = useState('');
  const [resetDone, setResetDone]     = useState('');
  const [resetting, setResetting]     = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, reqsRes] = await Promise.all([
        fetch(`${AUTH_API}/auth/admin/users?role=warehouse_owner`, { headers: adminAuthHeaders() }),
        fetch(`${PHARM_API}/admin-requests?portal_type=warehouse`, { headers: adminAuthHeaders() }),
      ]);
      const usersData = await usersRes.json();
      const reqsData  = await reqsRes.json();
      const requests: Record<string, { entity: string; reason: string }> = {};
      for (const r of (reqsData.data || [])) {
        requests[r.requester_id] = { entity: r.requester_entity, reason: r.reason };
      }
      setWarehouses((usersData.data || []).map((u: any) => ({
        ...u,
        requester_entity: requests[u.id]?.entity || '',
        reason:           requests[u.id]?.reason || '',
      })));
    } catch { showToast('❌ فشل تحميل البيانات'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const callAuth = async (endpoint: string, body: object) =>
    fetch(`${AUTH_API}/auth/admin/${endpoint}`, {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: JSON.stringify(body),
    });

  const approve = async (w: WUser) => {
    setActing(true);
    try {
      await callAuth('activate-user', { email: w.email });
      setWarehouses(prev => prev.map(u => u.id === w.id ? { ...u, status: 'active' } : u));
      if (selected?.id === w.id) setSelected(s => s ? { ...s, status: 'active' } : s);
      showToast(`✅ تم قبول ${w.first_name} ${w.last_name}`);
    } catch { showToast('❌ فشل العملية'); }
    finally { setActing(false); setSelected(null); }
  };

  const reject = async (w: WUser) => {
    setActing(true);
    try {
      await callAuth('force-signout', { email: w.email });
      setWarehouses(prev => prev.map(u => u.id === w.id ? { ...u, status: 'rejected' } : u));
      showToast(`❌ تم رفض ${w.first_name} ${w.last_name}`);
    } catch { showToast('❌ فشل العملية'); }
    finally { setActing(false); setSelected(null); }
  };

  const suspend = async (w: WUser) => {
    setActing(true);
    try {
      await callAuth('force-signout', { email: w.email });
      setWarehouses(prev => prev.map(u => u.id === w.id ? { ...u, status: 'force_logout' } : u));
      if (selected?.id === w.id) setSelected(s => s ? { ...s, status: 'force_logout' } : s);
      showToast(`🚫 تم إيقاف ${w.first_name} ${w.last_name}`);
    } catch { showToast('❌ فشل العملية'); }
    finally { setActing(false); }
  };

  const forceSignOut = async (w: WUser) => {
    setActing(true);
    try {
      await callAuth('force-signout', { email: w.email });
      showToast(`↩️ تم تسجيل خروج ${w.first_name} ${w.last_name} قسراً`);
    } catch { showToast('❌ فشل العملية'); }
    finally { setActing(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`${AUTH_API}/auth/admin/delete-user`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ email: deleteTarget.email }),
      });
      setWarehouses(prev => prev.filter(u => u.id !== deleteTarget.id));
      showToast('🗑️ تم حذف المستودع بالكامل');
    } catch { showToast('❌ فشل الحذف'); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const resetPassword = async () => {
    if (!newPass || newPass.length < 6) return;
    setResetting(true);
    try {
      await callAuth('reset-password', { email: resetTarget!.email, newPassword: newPass });
      setResetDone('✅ تم تغيير كلمة المرور بنجاح');
    } catch { setResetDone('❌ فشل تغيير كلمة المرور'); }
    finally { setResetting(false); }
  };

  const filtered = warehouses.filter(w => {
    const name = `${w.first_name} ${w.last_name} ${w.requester_entity} ${w.email}`.toLowerCase();
    const st = ['suspended', 'force_logout'].includes(w.status) ? 'suspended' : w.status;
    return (filter === 'all' || (filter === 'suspended' ? ['suspended','force_logout'].includes(w.status) : w.status === filter))
      && (!search || name.includes(search.toLowerCase()));
  });

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المذاخر</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{warehouses.length} إجمالي</span>
          <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">{warehouses.filter(w=>w.status==='active').length} نشط</span>
          <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">{warehouses.filter(w=>w.status==='pending_verification').length} معلق</span>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي', value: warehouses.length,                                                               color: 'text-sky-600',   bg: 'bg-sky-50' },
          { label: 'نشط',    value: warehouses.filter(w=>w.status==='active').length,                                color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'معلق',   value: warehouses.filter(w=>w.status==='pending_verification').length,                  color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'موقوف',  value: warehouses.filter(w=>['suspended','force_logout'].includes(w.status)).length,    color: 'text-red-600',   bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-5 shadow-sm text-center`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex gap-3 flex-wrap">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5 min-w-48">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد أو المستودع..."
            className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending_verification',l:'معلق'},{k:'active',l:'نشط'},{k:'suspended',l:'موقوف'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter===f.k ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">لا توجد مذاخر</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['المالك', 'المستودع', 'البريد الإلكتروني', 'الحالة', 'إجراءات'].map(h => (
                  <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(w => {
                const status = STATUS_LABELS[w.status] || STATUS_LABELS['suspended'];
                const isActive  = w.status === 'active';
                const isPending = w.status === 'pending_verification';
                const isSuspended = ['suspended','force_logout'].includes(w.status);
                return (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{w.first_name} {w.last_name}</p>
                          <p className="text-xs text-gray-400">{w.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{w.requester_entity || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dir-ltr">{w.email}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        <button onClick={() => setSelected(w)} title="عرض" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                        {isPending && <>
                          <button onClick={() => approve(w)} disabled={acting} title="موافقة" className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"><CheckCircle className="w-4 h-4" /></button>
                          <button onClick={() => reject(w)}  disabled={acting} title="رفض"    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"><XCircle className="w-4 h-4" /></button>
                        </>}
                        {isActive    && <button onClick={() => suspend(w)}     disabled={acting} title="إيقاف"         className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50"><Ban className="w-4 h-4" /></button>}
                        {isSuspended && <button onClick={() => approve(w)}     disabled={acting} title="إعادة تفعيل"   className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"><CheckCircle className="w-4 h-4" /></button>}
                        {!isPending  && <>
                          <button onClick={() => { setResetTarget(w); setNewPass(''); setResetDone(''); }} title="تغيير كلمة المرور" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><KeyRound className="w-4 h-4" /></button>
                          <button onClick={() => forceSignOut(w)} disabled={acting} title="تسجيل خروج قسري" className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg disabled:opacity-50"><LogOut className="w-4 h-4" /></button>
                        </>}
                        <button onClick={() => setDeleteTarget(w)} title="حذف" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              <h2 className="text-lg font-bold text-gray-900">تفاصيل المستودع</h2>
            </div>
            <div className="space-y-3 mb-5">
              {[
                { label: 'الاسم',          value: `${selected.first_name} ${selected.last_name}` },
                { label: 'المستودع',       value: selected.requester_entity || '—' },
                { label: 'البريد',         value: selected.email },
                { label: 'الهاتف',         value: selected.phone },
                { label: 'السبب',          value: selected.reason || '—' },
                { label: 'تاريخ التسجيل', value: new Date(selected.created_at).toLocaleDateString('ar-IQ') },
                { label: 'الحالة',         value: STATUS_LABELS[selected.status]?.label || selected.status },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-900 text-sm">{item.value}</span>
                  <span className="text-gray-500 text-sm">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              {selected.status === 'pending_verification' && <>
                <button onClick={() => approve(selected)} disabled={acting} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">✅ موافقة</button>
                <button onClick={() => reject(selected)}  disabled={acting} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">❌ رفض</button>
              </>}
              {selected.status === 'active' && <button onClick={() => suspend(selected)} disabled={acting} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">🚫 إيقاف</button>}
              {['suspended','force_logout'].includes(selected.status) && <button onClick={() => approve(selected)} disabled={acting} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">✅ إعادة تفعيل</button>}
              <button onClick={() => setSelected(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-lg font-bold text-gray-900">حذف المستودع نهائياً</h2>
              <p className="text-gray-500 text-sm mt-2">سيتم حذف جميع البيانات بشكل كامل ولا يمكن التراجع.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm space-y-1.5">
              <p><span className="text-gray-500">الاسم:</span> <span className="font-medium">{deleteTarget.first_name} {deleteTarget.last_name}</span></p>
              <p><span className="text-gray-500">المستودع:</span> <span className="font-medium">{deleteTarget.requester_entity || '—'}</span></p>
              <p><span className="text-gray-500">البريد:</span> <span className="font-medium">{deleteTarget.email}</span></p>
            </div>
            <button onClick={() => printWarehouseReport(deleteTarget)}
              className="w-full flex items-center justify-center gap-2 border-2 border-indigo-300 text-indigo-700 font-semibold py-2.5 rounded-xl text-sm mb-3 hover:bg-indigo-50">
              <Printer className="w-4 h-4" /> طباعة التقرير أولاً
            </button>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">
                {deleting ? 'جاري الحذف...' : 'حذف الكل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setResetTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              <h2 className="text-lg font-bold text-gray-900">تغيير كلمة المرور</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">{resetTarget.first_name} {resetTarget.last_name} — {resetTarget.email}</p>
            <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} dir="ltr"
              placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3" />
            {resetDone && <p className="text-sm mb-3 text-center font-medium">{resetDone}</p>}
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إغلاق</button>
              <button onClick={resetPassword} disabled={resetting || newPass.length < 6}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
                {resetting ? 'جاري التغيير...' : '🔑 تغيير'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
