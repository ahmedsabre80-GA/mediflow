'use client';
import { useEffect, useState } from 'react';
import { Search, X, Trash2, PlusCircle, RotateCcw, Ban, ListTree } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

function adminAuthHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('admin-token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

const ENTITY_LABELS: Record<string, string> = { pharmacy: 'صيدلية', warehouse: 'مستودع', doctor: 'طبيب' };
const ENTITY_OPTIONS = [{ v: '', l: 'كل الأنواع' }, { v: 'pharmacy', l: 'صيدليات' }, { v: 'warehouse', l: 'مذاخر' }, { v: 'doctor', l: 'أطباء' }];

export default function OrganizationsManagementPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const [planFamilyCode, setPlanFamilyCode] = useState('');
  const [selected, setSelected] = useState<any>(null); // org row from list
  const [detail, setDetail] = useState<any>(null); // full snapshot
  const [overrides, setOverrides] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ quotaKey: '', overrideValue: '', reason: '' });
  const [changePlanId, setChangePlanId] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadOrgs = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (entityType) params.set('entityType', entityType);
    if (planFamilyCode) params.set('planFamilyCode', planFamilyCode);
    const r = await fetch(`${API}/admin/organizations?${params}`, { headers: adminAuthHeaders() });
    if (r.ok) { const d = await r.json(); setOrgs(d.data || []); setTotal(d.total || 0); }
    setLoading(false);
  };

  useEffect(() => {
    loadOrgs();
    fetch(`${API}/admin/subscriptions/plans`, { headers: adminAuthHeaders() }).then(r => r.ok ? r.json() : null).then(d => d && setPlans(d.data));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(loadOrgs, 300); return () => clearTimeout(t); }, [search, entityType, planFamilyCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (org: any) => {
    setSelected(org);
    setDetail(null);
    setOverrides([]);
    setAuditLog([]);
    const [detailRes, overridesRes, auditRes] = await Promise.all([
      fetch(`${API}/admin/organizations/${org.id}`, { headers: adminAuthHeaders() }),
      fetch(`${API}/admin/organizations/${org.id}/quota-overrides`, { headers: adminAuthHeaders() }),
      fetch(`${API}/admin/audit-log?organizationId=${org.id}`, { headers: adminAuthHeaders() }),
    ]);
    if (detailRes.ok) setDetail((await detailRes.json()).data);
    if (overridesRes.ok) setOverrides((await overridesRes.json()).data || []);
    if (auditRes.ok) setAuditLog((await auditRes.json()).data || []);
  };

  const refreshDetail = async () => { if (selected) await openDetail(selected); };

  const doChangePlan = async () => {
    if (!changePlanId) return;
    setBusy(true);
    const r = await fetch(`${API}/admin/organizations/${selected.id}/subscription/change-plan`, {
      method: 'POST', headers: adminAuthHeaders(), body: JSON.stringify({ planId: changePlanId, reason: 'admin_manual_change' }),
    });
    setBusy(false);
    if (r.ok) { showToast('✅ تم تغيير الخطة'); setChangePlanId(''); refreshDetail(); loadOrgs(); }
    else showToast('❌ تعذر تغيير الخطة');
  };

  const doCancel = async () => {
    setBusy(true);
    const r = await fetch(`${API}/admin/organizations/${selected.id}/subscription/cancel`, { method: 'POST', headers: adminAuthHeaders(), body: JSON.stringify({ reason: 'admin_manual_cancel' }) });
    setBusy(false);
    if (r.ok) { showToast('⛔ تم إلغاء الاشتراك'); refreshDetail(); loadOrgs(); }
    else showToast('❌ تعذر الإلغاء');
  };

  const doRestore = async () => {
    setBusy(true);
    const r = await fetch(`${API}/admin/organizations/${selected.id}/subscription/restore`, { method: 'POST', headers: adminAuthHeaders(), body: JSON.stringify({ reason: 'admin_manual_restore' }) });
    setBusy(false);
    if (r.ok) { showToast('✅ تم استعادة الاشتراك'); refreshDetail(); loadOrgs(); }
    else { const d = await r.json().catch(() => ({})); showToast(`❌ ${d?.error?.title || 'تعذرت الاستعادة'}`); }
  };

  const createOverride = async () => {
    if (!overrideForm.quotaKey || overrideForm.overrideValue === '') return;
    setBusy(true);
    const r = await fetch(`${API}/admin/organizations/${selected.id}/quota-overrides`, {
      method: 'POST', headers: adminAuthHeaders(),
      body: JSON.stringify({ quotaKey: overrideForm.quotaKey, overrideValue: Number(overrideForm.overrideValue), reason: overrideForm.reason }),
    });
    setBusy(false);
    if (r.ok) { showToast('✅ تم إنشاء استثناء للحد'); setOverrideForm({ quotaKey: '', overrideValue: '', reason: '' }); refreshDetail(); }
    else showToast('❌ تعذر إنشاء الاستثناء');
  };

  const removeOverride = async (quotaKey: string) => {
    setBusy(true);
    const r = await fetch(`${API}/admin/organizations/${selected.id}/quota-overrides/${quotaKey}`, { method: 'DELETE', headers: adminAuthHeaders() });
    setBusy(false);
    if (r.ok) { showToast('🗑️ تمت إزالة الاستثناء'); refreshDetail(); }
    else showToast('❌ تعذرت الإزالة');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">إدارة المنظمات</h1>
        <p className="text-sm text-gray-500 mt-1">{total} منظمة</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم..."
            className="w-full pr-9 pl-3 py-2.5 border border-gray-300 rounded-xl text-sm" />
        </div>
        <select value={entityType} onChange={e => setEntityType(e.target.value)} className="border border-gray-300 rounded-xl text-sm px-3 py-2.5">
          {ENTITY_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <select value={planFamilyCode} onChange={e => setPlanFamilyCode(e.target.value)} className="border border-gray-300 rounded-xl text-sm px-3 py-2.5">
          <option value="">كل الخطط</option>
          {plans.map(p => <option key={p.family_code} value={p.family_code}>{p.name_ar || p.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-right px-4 py-3 font-medium">الاسم</th>
              <th className="text-right px-4 py-3 font-medium">النوع</th>
              <th className="text-right px-4 py-3 font-medium">الخطة</th>
              <th className="text-right px-4 py-3 font-medium">حالة الاشتراك</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا توجد نتائج</td></tr>
            ) : orgs.map(o => (
              <tr key={o.id} onClick={() => openDetail(o)} className="hover:bg-sky-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{o.display_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{ENTITY_LABELS[o.entity_type] || o.entity_type}</td>
                <td className="px-4 py-3 text-gray-500">{o.plan_name_ar || o.plan_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.subscription_status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {o.subscription_status || 'بلا اشتراك'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">{selected.display_name}</h3>
              <button onClick={() => setSelected(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            {!detail ? <p className="text-sm text-gray-400 text-center py-8">جاري التحميل...</p> : (
              <div className="space-y-5">
                {/* Plan + manual actions */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-gray-900">الخطة الحالية: {detail.plan ? (detail.plan.name_ar || detail.plan.name) : 'بلا اشتراك (ملغى)'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={changePlanId} onChange={e => setChangePlanId(e.target.value)} className="border border-gray-300 rounded-lg text-xs px-2 py-1.5">
                      <option value="">اختر خطة جديدة...</option>
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar || p.name}</option>)}
                    </select>
                    <button onClick={doChangePlan} disabled={busy || !changePlanId} className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg">تغيير الخطة</button>
                    {detail.plan ? (
                      <button onClick={doCancel} disabled={busy} className="flex items-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium px-3 py-1.5 rounded-lg"><Ban className="w-3.5 h-3.5" />إلغاء الاشتراك</button>
                    ) : (
                      <button onClick={doRestore} disabled={busy} className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg"><RotateCcw className="w-3.5 h-3.5" />استعادة الاشتراك</button>
                    )}
                  </div>
                </div>

                {/* Quotas + usage + overrides */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-2">الحدود والاستخدام</p>
                  <div className="space-y-2">
                    {detail.quotas.map((q: any) => {
                      const ov = overrides.find(o => o.quota_key === q.key);
                      return (
                        <div key={q.key} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-700">{q.label_ar || q.label}</span>
                            <span className="text-gray-500">
                              {q.is_metered ? `${q.used ?? 0} / ${q.limit_value === null ? '∞' : q.limit_value}` : (q.limit_value === null ? '∞' : q.limit_value)}
                              {q.is_overridden && <span className="text-amber-600 mr-1"> (مُستثنى، الأصل: {q.plan_limit_value === null ? '∞' : q.plan_limit_value})</span>}
                            </span>
                          </div>
                          {ov && (
                            <button onClick={() => removeOverride(q.key)} disabled={busy} className="text-xs text-red-500 hover:underline mt-1 flex items-center gap-1"><Trash2 className="w-3 h-3" />إزالة الاستثناء</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3 bg-gray-50 rounded-xl p-3">
                    <select value={overrideForm.quotaKey} onChange={e => setOverrideForm({ ...overrideForm, quotaKey: e.target.value })} className="border border-gray-300 rounded-lg text-xs px-2 py-1.5">
                      <option value="">اختر حداً...</option>
                      {detail.quotas.filter((q: any) => q.is_metered).map((q: any) => <option key={q.key} value={q.key}>{q.label_ar || q.label}</option>)}
                    </select>
                    <input type="number" placeholder="القيمة الجديدة" value={overrideForm.overrideValue}
                      onChange={e => setOverrideForm({ ...overrideForm, overrideValue: e.target.value })}
                      className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 w-28" />
                    <input placeholder="السبب" value={overrideForm.reason} onChange={e => setOverrideForm({ ...overrideForm, reason: e.target.value })} className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 flex-1 min-w-[100px]" />
                    <button onClick={createOverride} disabled={busy || !overrideForm.quotaKey || overrideForm.overrideValue === ''}
                      className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg"><PlusCircle className="w-3.5 h-3.5" />إنشاء استثناء</button>
                  </div>
                </div>

                {/* Per-org audit log */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><ListTree className="w-4 h-4" />سجل التغييرات</p>
                  <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
                    {auditLog.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">لا يوجد سجل بعد</p> : auditLog.map(e => (
                      <div key={`${e.type}-${e.id}`} className="px-3 py-2 text-xs flex items-center justify-between">
                        <span className="text-gray-700">
                          {e.type === 'plan_change' ? '🔄 تغيير خطة' : e.type === 'quota_override' ? '⚙️ تعديل حد' : '📝 طلب ترقية'} — {e.summary}
                        </span>
                        <span className="text-gray-400">{e.occurred_at ? new Date(e.occurred_at).toLocaleString('ar-IQ') : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
