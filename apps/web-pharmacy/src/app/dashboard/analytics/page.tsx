'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, DollarSign, BarChart2 } from 'lucide-react';

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
    { label: 'طلبات اليوم', value: analytics?.today?.orders ?? '—', icon: ShoppingBag, color: 'bg-sky-500' },
    { label: 'إيراد اليوم', value: analytics?.today?.revenue != null ? `${Number(analytics.today.revenue).toLocaleString()} د.ع` : '—', icon: DollarSign, color: 'bg-green-500' },
    { label: 'طلبات الشهر', value: analytics?.thisMonth?.orders ?? '—', icon: TrendingUp, color: 'bg-purple-500' },
    { label: 'إيراد الشهر', value: analytics?.thisMonth?.revenue != null ? `${Number(analytics.thisMonth.revenue).toLocaleString()} د.ع` : '—', icon: BarChart2, color: 'bg-orange-500' },
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

      {!loading && !analytics && (
        <div className="bg-white rounded-2xl p-10 shadow-sm text-center text-gray-400">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد بيانات كافية بعد. ستظهر التقارير بعد بدء تلقي الطلبات.</p>
        </div>
      )}
    </div>
  );
}
