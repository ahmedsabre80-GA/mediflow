'use client';
import { useEffect, useState } from 'react';
import { ShoppingBag, DollarSign, TrendingUp, Star } from 'lucide-react';

const PHARMACY_API = process.env.NEXT_PUBLIC_PHARMACY_API_URL || 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pharmacyName, setPharmacyName] = useState('');

  useEffect(() => {
    setPharmacyName(localStorage.getItem('pharmacy-name') || '');
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!pharmacyId) { setLoading(false); return; }
    fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setAnalytics(d.data))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'طلبات اليوم', value: analytics?.today?.orders ?? '—', icon: ShoppingBag, color: 'bg-sky-500' },
    { label: 'إيراد اليوم', value: analytics?.today?.revenue != null ? `${Number(analytics.today.revenue).toLocaleString()} د.ع` : '—', icon: DollarSign, color: 'bg-green-500' },
    { label: 'طلبات الشهر', value: analytics?.thisMonth?.orders ?? '—', icon: TrendingUp, color: 'bg-purple-500' },
    { label: 'إيراد الشهر', value: analytics?.thisMonth?.revenue != null ? `${Number(analytics.thisMonth.revenue).toLocaleString()} د.ع` : '—', icon: Star, color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          مرحباً{pharmacyName ? ` — ${pharmacyName}` : ''} 👋
        </h2>
        <p className="text-gray-500 text-sm">هذا ملخص أداء صيدليتك اليوم</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '...' : stat.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إضافة منتج', icon: '➕', href: '/dashboard/inventory' },
          { label: 'عرض الطلبات', icon: '📦', href: '/dashboard/orders' },
          { label: 'تقرير الإيراد', icon: '📊', href: '/dashboard/analytics' },
          { label: 'إدارة الحملات', icon: '📣', href: '/dashboard/campaigns' },
        ].map((action) => (
          <a
            key={action.label}
            href={action.href}
            className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
          >
            <div className="text-3xl mb-2">{action.icon}</div>
            <p className="text-sm font-medium text-gray-700">{action.label}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
