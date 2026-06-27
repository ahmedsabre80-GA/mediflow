'use client';
import { useEffect, useState } from 'react';
import { ShoppingBag, DollarSign, TrendingUp, Star, Package, AlertTriangle } from 'lucide-react';

const PHARMACY_API = process.env.NEXT_PUBLIC_PHARMACY_API_URL || 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!pharmacyId) {
      setLoading(false);
      return;
    }
    fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setAnalytics(d.data))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'طلبات اليوم', value: analytics?.today?.orders || '0', icon: ShoppingBag, color: 'bg-sky-500', change: '+12%' },
    { label: 'إيراد اليوم', value: `${Number(analytics?.today?.revenue || 0).toLocaleString()} د.ع`, icon: DollarSign, color: 'bg-green-500', change: '+8%' },
    { label: 'طلبات الشهر', value: analytics?.thisMonth?.orders || '0', icon: TrendingUp, color: 'bg-purple-500', change: '+23%' },
    { label: 'التقييم', value: '4.8 ⭐', icon: Star, color: 'bg-yellow-500', change: '+0.1' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">مرحباً بك 👋</h2>
        <p className="text-gray-500 text-sm">هذا ملخص أداء صيدليتك اليوم</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  {stat.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '...' : stat.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Alerts */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          تنبيهات المخزون
        </h3>
        <div className="space-y-3">
          {[
            { name: 'أموكسيسيلين 500mg', status: 'نفاد قريب', qty: 8, color: 'text-orange-600 bg-orange-50' },
            { name: 'إيبوبروفين 400mg', status: 'نفد', qty: 0, color: 'text-red-600 bg-red-50' },
            { name: 'أوميبرازول 20mg', status: 'انتهاء قريب', qty: 45, color: 'text-yellow-600 bg-yellow-50' },
          ].map((item) => (
            <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">الكمية: {item.qty}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.color}`}>
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
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
