'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, DollarSign, Users } from 'lucide-react';

const PHARMACY_API = process.env.NEXT_PUBLIC_PHARMACY_API_URL || 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  const cards = [
    { label: 'طلبات اليوم', value: analytics?.today?.orders || 0, icon: ShoppingBag, color: 'bg-sky-500' },
    { label: 'إيراد اليوم', value: `${Number(analytics?.today?.revenue || 0).toLocaleString()} د.ع`, icon: DollarSign, color: 'bg-green-500' },
    { label: 'طلبات الشهر', value: analytics?.thisMonth?.orders || 0, icon: TrendingUp, color: 'bg-purple-500' },
    { label: 'إيراد الشهر', value: `${Number(analytics?.thisMonth?.revenue || 0).toLocaleString()} د.ع`, icon: Users, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">التحليلات والتقارير</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '...' : card.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4">ملخص الأداء</h3>
        <div className="space-y-4">
          {[
            { label: 'معدل إتمام الطلبات', value: '94%', width: '94%' },
            { label: 'رضا العملاء', value: '4.8/5', width: '96%' },
            { label: 'معدل الاستجابة للطلبات', value: '87%', width: '87%' },
          ].map((metric) => (
            <div key={metric.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{metric.label}</span>
                <span className="font-medium text-gray-900">{metric.value}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: metric.width }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
