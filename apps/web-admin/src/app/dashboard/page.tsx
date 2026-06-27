'use client';
import { useEffect, useState } from 'react';
import { Users, Building2, ShoppingCart, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

function StatCard({ title, value, icon: Icon, color, subtitle }: any) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, pharmacies: 0, orders: 0, revenue: 0 });
  const [pendingPharmacies, setPendingPharmacies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin-token') : '';

    // Load pending pharmacies
    fetch(`${PHARMACY_API}/pharmacies/nearby?lat=33.31&lng=44.36&radiusKm=999`)
      .then(r => r.json())
      .then(d => {
        const all = d.data || [];
        setPendingPharmacies(all.filter((p: any) => p.status === 'pending_verification').slice(0, 5));
        setStats(prev => ({ ...prev, pharmacies: all.length }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = [
    { title: 'إجمالي المستخدمين', value: stats.users || '—', icon: Users, color: 'bg-sky-500', subtitle: 'مستخدم مسجل' },
    { title: 'الصيدليات النشطة', value: stats.pharmacies || '—', icon: Building2, color: 'bg-teal-500', subtitle: 'صيدلية مسجلة' },
    { title: 'إجمالي الطلبات', value: stats.orders || '—', icon: ShoppingCart, color: 'bg-indigo-500', subtitle: 'طلب منجز' },
    { title: 'الإيرادات', value: '—', icon: TrendingUp, color: 'bg-amber-500', subtitle: 'دينار عراقي' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => <StatCard key={kpi.title} {...kpi} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Pharmacy Approvals */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900">طلبات تسجيل الصيدليات</h2>
            <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {pendingPharmacies.length} معلق
            </span>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : pendingPharmacies.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
                <p>لا توجد طلبات معلقة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingPharmacies.map((pharmacy: any) => (
                  <div key={pharmacy.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{pharmacy.name}</p>
                      <p className="text-xs text-gray-500">{pharmacy.city}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600">
                        موافقة
                      </button>
                      <button className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200">
                        رفض
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Platform Alerts */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="font-bold text-gray-900">تنبيهات المنصة</h2>
          </div>
          <div className="p-6 space-y-3">
            {[
              { type: 'warning', msg: 'انتهت صلاحية 3 رخص صيدليات', time: 'منذ ساعة' },
              { type: 'info', msg: 'تم تسجيل 12 مستخدم جديد اليوم', time: 'منذ 2 ساعة' },
              { type: 'warning', msg: '5 طلبات تسجيل صيدلية جديدة', time: 'منذ 3 ساعات' },
            ].map((alert, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${
                alert.type === 'warning' ? 'bg-amber-50' : 'bg-sky-50'
              }`}>
                <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${
                  alert.type === 'warning' ? 'text-amber-500' : 'text-sky-500'
                }`} />
                <div className="flex-1">
                  <p className="text-sm text-gray-800">{alert.msg}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {alert.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-bold text-gray-900 mb-4">إجراءات سريعة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'مراجعة الصيدليات', href: '/dashboard/pharmacies', color: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
            { label: 'إدارة المستخدمين', href: '/dashboard/users', color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
            { label: 'عرض التحليلات', href: '/dashboard/analytics', color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
            { label: 'سجل المراقبة', href: '/dashboard/audit', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
          ].map((action) => (
            <a key={action.label} href={action.href}
              className={`${action.color} p-4 rounded-xl text-center text-sm font-medium transition-colors`}>
              {action.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
