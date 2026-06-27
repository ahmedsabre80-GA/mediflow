'use client';
import { TrendingUp, Users, ShoppingCart, Building2, DollarSign } from 'lucide-react';

const MOCK_MONTHLY = [
  { month: 'يناير', orders: 120, revenue: 1800000 },
  { month: 'فبراير', orders: 180, revenue: 2700000 },
  { month: 'مارس', orders: 240, revenue: 3600000 },
  { month: 'أبريل', orders: 320, revenue: 4800000 },
  { month: 'مايو', orders: 410, revenue: 6150000 },
  { month: 'يونيو', orders: 520, revenue: 7800000 },
];

export default function AnalyticsPage() {
  const maxOrders = Math.max(...MOCK_MONTHLY.map(m => m.orders));

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">التحليلات والإحصائيات</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الإيرادات', value: '27.85M د.ع', icon: DollarSign, color: 'bg-green-500' },
          { label: 'إجمالي الطلبات', value: '1,790', icon: ShoppingCart, color: 'bg-sky-500' },
          { label: 'المستخدمون', value: '4,230', icon: Users, color: 'bg-indigo-500' },
          { label: 'الصيدليات', value: '47', icon: Building2, color: 'bg-teal-500' },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className={`w-10 h-10 ${kpi.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Orders Chart */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-bold text-gray-900 mb-6">الطلبات الشهرية</h2>
        <div className="flex items-end gap-3 h-48">
          {MOCK_MONTHLY.map((item) => (
            <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs text-gray-500">{item.orders}</span>
              <div
                className="w-full bg-sky-500 rounded-t-lg transition-all hover:bg-sky-600"
                style={{ height: `${(item.orders / maxOrders) * 160}px` }}
              />
              <span className="text-xs text-gray-500">{item.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">تقرير الإيرادات الشهرية</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['الشهر', 'عدد الطلبات', 'الإيرادات', 'النمو'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_MONTHLY.map((row, i) => {
              const prev = MOCK_MONTHLY[i - 1];
              const growth = prev ? (((row.orders - prev.orders) / prev.orders) * 100).toFixed(0) : '—';
              return (
                <tr key={row.month} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{row.month}</td>
                  <td className="px-6 py-3 text-gray-600">{row.orders}</td>
                  <td className="px-6 py-3 text-gray-600">{(row.revenue / 1000000).toFixed(2)}M د.ع</td>
                  <td className="px-6 py-3">
                    {growth !== '—' && (
                      <span className="text-green-600 text-sm font-medium">↑ {growth}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
