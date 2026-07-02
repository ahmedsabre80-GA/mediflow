'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, CheckCircle, XCircle, Eye, Package, Ban, RefreshCw } from 'lucide-react';

const AUTH_API  = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const SECRET    = 'mediflow-delete-2026';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'معلق',   color: 'bg-amber-100 text-amber-700' },
  active:               { label: 'نشط',    color: 'bg-green-100 text-green-700' },
  suspended:            { label: 'موقوف',  color: 'bg-red-100 text-red-700' },
  rejected:             { label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
};

interface WarehouseUser {
  id: string; email: string; phone: string; status: string;
  first_name: string; last_name: string; created_at: string;
  requester_entity?: string; reason?: string; request_id?: string;
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [selected, setSelected]     = useState<WarehouseUser | null>(null);
  const [acting, setActing]         = useState(false);
  const [toast, setToast]           = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, reqsRes] = await Promise.all([
        fetch(`${AUTH_API}/auth/admin/users?secret=${SECRET}&role=warehouse_owner`),
        fetch(`${PHARM_API}/admin-requests?portal_type=warehouse`),
      ]);
      const usersData = await usersRes.json();
      const reqsData  = await reqsRes.json();

      const requests: Record<string, { entity: string; reason: string; request_id: string }> = {};
      for (const r of (reqsData.data || [])) {
        requests[r.requester_id] = { entity: r.requester_entity, reason: r.reason, request_id: r.id };
      }

      const merged: WarehouseUser[] = (usersData.data || []).map((u: any) => ({
        ...u,
        requester_entity: requests[u.id]?.entity || '',
        reason:           requests[u.id]?.reason || '',
        request_id:       requests[u.id]?.request_id || '',
      }));
      setWarehouses(merged);
    } catch { showToast('❌ فشل تحميل البيانات'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const callAuth = async (email: string, action: 'activate' | 'reset-password' | 'force-signout', extra?: object) => {
    const endpoint = action === 'activate' ? 'activate-user' : action === 'reset-password' ? 'reset-password' : 'force-signout';
    await fetch(`${AUTH_API}/auth/admin/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, secret: SECRET, ...extra }),
    });
  };

  const approve = async (w: WarehouseUser) => {
    setActing(true);
    try {
      await callAuth(w.email, 'activate');
      showToast(`✅ تم قبول ${w.first_name} ${w.last_name}`);
      await load();
    } catch { showToast('❌ فشل العملية'); }
    finally { setActing(false); setSelected(null); }
  };

  const reject = async (w: WarehouseUser) => {
    setActing(true);
    try {
      await fetch(`${AUTH_API}/auth/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: w.email, newPassword: Math.random().toString(36).slice(2), secret: SECRET }),
      });
      // Set status to rejected via force-signout then we manually patch — use suspend for now
      await fetch(`${AUTH_API}/auth/admin/force-signout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: w.email, secret: SECRET }),
      });
      showToast(`🚫 تم رفض ${w.first_name} ${w.last_name}`);
      await load();
    } catch { showToast('❌ فشل العملية'); }
    finally { setActing(false); setSelected(null); }
  };

  const suspend = async (w: WarehouseUser) => {
    setActing(true);
    try {
      await callAuth(w.email, 'force-signout');
      showToast(`⏸ تم إيقاف ${w.first_name} ${w.last_name}`);
      await load();
    } catch { showToast('❌ فشل العملية'); }
    finally { setActing(false); setSelected(null); }
  };

  const filtered = warehouses.filter(w => {
    const name = `${w.first_name} ${w.last_name} ${w.requester_entity} ${w.email}`.toLowerCase();
    return (filter === 'all' || w.status === filter) && (!search || name.includes(search.toLowerCase()));
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
          { label: 'إجمالي', value: warehouses.length, color: 'text-sky-600' },
          { label: 'نشط',    value: warehouses.filter(w=>w.status==='active').length, color: 'text-green-600' },
          { label: 'معلق',   value: warehouses.filter(w=>w.status==='pending_verification').length, color: 'text-amber-600' },
          { label: 'موقوف',  value: warehouses.filter(w=>w.status==='suspended'||w.status==='force_logout').length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد أو المستودع..."
            className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending_verification',l:'معلق'},{k:'active',l:'نشط'},{k:'force_logout',l:'موقوف'}].map(f => (
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
                {['المالك', 'المستودع', 'البريد', 'الحالة', 'إجراءات'].map(h => (
                  <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(w => {
                const status = STATUS_LABELS[w.status] || STATUS_LABELS['suspended'];
                return (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                          <Package className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{w.first_name} {w.last_name}</p>
                          <p className="text-xs text-gray-400">{w.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{w.requester_entity || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dir-ltr">{w.email}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => setSelected(w)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg" title="عرض">
                          <Eye className="w-4 h-4" />
                        </button>
                        {w.status === 'pending_verification' && (
                          <>
                            <button onClick={() => approve(w)} disabled={acting}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50" title="موافقة">
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button onClick={() => reject(w)} disabled={acting}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50" title="رفض">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {w.status === 'active' && (
                          <button onClick={() => suspend(w)} disabled={acting}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50" title="إيقاف">
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        {(w.status === 'force_logout' || w.status === 'suspended') && (
                          <button onClick={() => approve(w)} disabled={acting}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50" title="إعادة تفعيل">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              <h2 className="text-lg font-bold text-gray-900">تفاصيل المستودع</h2>
            </div>
            <div className="space-y-3">
              {[
                { label: 'الاسم',         value: `${selected.first_name} ${selected.last_name}` },
                { label: 'المستودع',      value: selected.requester_entity || '—' },
                { label: 'البريد',        value: selected.email },
                { label: 'الهاتف',        value: selected.phone },
                { label: 'السبب',         value: selected.reason || '—' },
                { label: 'تاريخ التسجيل', value: new Date(selected.created_at).toLocaleDateString('ar-IQ') },
                { label: 'الحالة',        value: STATUS_LABELS[selected.status]?.label || selected.status },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-900 text-sm">{item.value}</span>
                  <span className="text-gray-500 text-sm">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              {selected.status === 'pending_verification' && (
                <>
                  <button onClick={() => approve(selected)} disabled={acting}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
                    ✅ موافقة
                  </button>
                  <button onClick={() => reject(selected)} disabled={acting}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
                    ❌ رفض
                  </button>
                </>
              )}
              {selected.status === 'active' && (
                <button onClick={() => suspend(selected)} disabled={acting}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
                  🚫 إيقاف
                </button>
              )}
              {(selected.status === 'force_logout' || selected.status === 'suspended') && (
                <button onClick={() => approve(selected)} disabled={acting}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
                  ✅ إعادة تفعيل
                </button>
              )}
              <button onClick={() => setSelected(null)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
