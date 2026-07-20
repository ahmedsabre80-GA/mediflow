'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, CreditCard, Clock, TrendingUp, ListTree, RefreshCw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

function adminAuthHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('admin-token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

const ENTITY_LABELS: Record<string, string> = { pharmacy: 'الصيدليات', warehouse: 'المذاخر', doctor: 'الأطباء' };
const REQUEST_STATUS_LABELS: Record<string, string> = { pending: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض', cancelled: 'ملغى' };

export default function SubscriptionDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/admin/subscriptions/dashboard`, { headers: adminAuthHeaders() });
    if (r.ok) setStats((await r.json()).data);
    setLoading(false);
  };

  const loadAudit = async () => {
    const r = await fetch(`${API}/admin/audit-log?limit=30`, { headers: adminAuthHeaders() });
    if (r.ok) setAuditLog((await r.json()).data || []);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">جاري التحميل...</div>;
  if (!stats) return <div className="p-6 text-center text-red-500 text-sm">تعذر تحميل لوحة الاشتراكات</div>;

  const maxByPlan = Math.max(1, ...stats.organizations_by_plan.map((p: any) => p.organization_count));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة الاشتراكات</h1>
          <p className="text-sm text-gray-500 mt-1">نظرة عامة على المنظمات والخطط والطلبات</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      {/* Section links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Link href="/dashboard/subscriptions/plans" className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-sky-300 hover:shadow-sm transition-all">
          <CreditCard className="w-5 h-5 text-sky-500 mb-2" />
          <p className="font-bold text-gray-900 text-sm">إدارة الخطط</p>
        </Link>
        <Link href="/dashboard/subscriptions/organizations" className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-sky-300 hover:shadow-sm transition-all">
          <Building2 className="w-5 h-5 text-sky-500 mb-2" />
          <p className="font-bold text-gray-900 text-sm">إدارة المنظمات</p>
        </Link>
        <Link href="/dashboard/subscriptions/upgrade-requests" className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-sky-300 hover:shadow-sm transition-all">
          <TrendingUp className="w-5 h-5 text-sky-500 mb-2" />
          <p className="font-bold text-gray-900 text-sm">طلبات الترقية</p>
          {stats.pending_upgrade_requests > 0 && (
            <span className="inline-block mt-1 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{stats.pending_upgrade_requests} قيد المراجعة</span>
          )}
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">إجمالي المنظمات</p>
          <p className="text-3xl font-bold text-gray-900">{stats.total_organizations}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">اشتراكات نشطة</p>
          <p className="text-3xl font-bold text-green-600">{stats.active_subscriptions}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">طلبات ترقية قيد المراجعة</p>
          <p className="text-3xl font-bold text-amber-600">{stats.pending_upgrade_requests}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Organizations by plan */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">المنظمات حسب الخطة</h3>
          <div className="space-y-3">
            {stats.organizations_by_plan.map((p: any) => (
              <div key={p.family_code}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700">{p.name_ar || p.name}</span>
                  <span className="text-gray-500">{p.organization_count}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(p.organization_count / maxByPlan) * 100}%` }} />
                </div>
              </div>
            ))}
            {stats.organizations_by_plan.length === 0 && <p className="text-sm text-gray-400">لا توجد بيانات</p>}
          </div>
        </div>

        {/* Organizations by entity type */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">المنظمات حسب النوع</h3>
          <div className="space-y-2">
            {stats.organizations_by_entity_type.map((e: any) => (
              <div key={e.entity_type} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                <span className="text-sm font-medium text-gray-700">{ENTITY_LABELS[e.entity_type] || e.entity_type}</span>
                <span className="text-sm font-bold text-gray-900">{e.organization_count}</span>
              </div>
            ))}
            {stats.organizations_by_entity_type.length === 0 && <p className="text-sm text-gray-400">لا توجد بيانات</p>}
          </div>
        </div>
      </div>

      {/* Recent upgrade requests */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm">أحدث طلبات الترقية</h3>
          <Link href="/dashboard/subscriptions/upgrade-requests" className="text-xs text-sky-600 hover:underline">عرض الكل</Link>
        </div>
        <div className="divide-y divide-gray-100">
          {stats.recent_upgrade_requests.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">لا توجد طلبات بعد</p>
          ) : stats.recent_upgrade_requests.map((r: any) => (
            <div key={r.id} className="py-3 flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-gray-800">{r.organization_display_name || '—'} <span className="text-xs text-gray-400">({ENTITY_LABELS[r.entity_type] || r.entity_type})</span></p>
                <p className="text-xs text-gray-500">→ {r.requested_plan_name_ar || r.requested_plan_name || r.request_type}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'pending' ? 'bg-amber-50 text-amber-700' : r.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {REQUEST_STATUS_LABELS[r.status] || r.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Global audit log */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <button onClick={() => { setShowAudit(!showAudit); if (!showAudit && auditLog.length === 0) loadAudit(); }}
          className="flex items-center gap-2 font-bold text-gray-900 text-sm">
          <ListTree className="w-4 h-4" /> سجل المراقبة (كل التغييرات على الاشتراكات) {showAudit ? '▲' : '▼'}
        </button>
        {showAudit && (
          <div className="divide-y divide-gray-100 mt-4 max-h-96 overflow-y-auto">
            {auditLog.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">لا يوجد سجل بعد</p>
            ) : auditLog.map((e: any) => (
              <div key={`${e.type}-${e.id}`} className="py-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">
                    {e.type === 'plan_change' ? '🔄 تغيير خطة' : e.type === 'quota_override' ? '⚙️ تعديل حد' : '📝 طلب ترقية'}
                    {e.summary ? ` — ${e.summary}` : ''}
                  </span>
                  <span className="text-gray-400">{e.occurred_at ? new Date(e.occurred_at).toLocaleString('ar-IQ') : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
