'use client';
import { TrendingUp, Package, ShoppingCart, Building2 } from 'lucide-react';

const MONTHLY_DATA = [
  { month: 'يناير', orders: 45, revenue: 12500000 },
  { month: 'فبراير', orders: 62, revenue: 18200000 },
  { month: 'مارس', orders: 78, revenue: 23400000 },
  { month: 'أبريل', orders: 91, revenue: 28700000 },
  { month: 'مايو', orders: 110, revenue: 34200000 },
  { month: 'يونيو', orders: 134, revenue: 42100000 },
];

const TOP_PRODUCTS = [
  { name: 'باراسيتامول 500mg', units: 8500, revenue: 12750000 },
  { name: 'أموكسيسيلين 500mg', units: 3200, revenue: 27200000 },
  { name: 'إيبوبروفين 400mg', units: 5100, revenue: 11220000 },
  { name: 'أوميبرازول 20mg', units: 2800, revenue: 9800000 },
  { name: 'ميتفورمين 500mg', units: 4200, revenue: 11760000 },
];

export default function WarehouseAnalyticsPage() {
  const maxRevenue = Math.max(...MONTHLY_DATA.map(m => m.revenue));

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">التحليلات والإحصائيات</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الإيرادات', value: '159.2M د.ع', icon: TrendingUp, color: 'bg-amber-500' },
          { label: 'طلبات B2B', value: '520', icon: ShoppingCart, color: 'bg-sky-500' },
          { label: 'منتجات نشطة', value: '342', icon: Package, color: 'bg-teal-500' },
          { label: 'عملاء (صيدليات)', value: '47', icon: Building2, color: 'bg-indigo-500' },
        ].map(kpi => {
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

      {/* Revenue Chart */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-bold text-gray-900 mb-6">الإيرادات الشهرية</h2>
        <div className="flex items-end gap-4 h-48">
          {MONTHLY_DATA.map(item => (
            <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs text-gray-500">{(item.revenue / 1000000).toFixed(1)}M</span>
              <div className="w-full bg-amber-500 rounded-t-lg hover:bg-amber-600 transition-colors cursor-pointer"
                style={{ height: `${(item.revenue / maxRevenue) * 160}px` }} />
              <span className="text-xs text-gray-500">{item.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">أكثر المنتجات مبيعاً</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['المنتج', 'الوحدات المباعة', 'الإيرادات', 'الحصة'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {TOP_PRODUCTS.map((product, i) => {
              const totalRevenue = TOP_PRODUCTS.reduce((s, p) => s + p.revenue, 0);
              const share = ((product.revenue / totalRevenue) * 100).toFixed(1);
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900 text-sm">{product.name}</td>
                  <td className="px-6 py-3 text-gray-600 text-sm">{product.units.toLocaleString()}</td>
                  <td className="px-6 py-3 text-gray-600 text-sm">{(product.revenue / 1000000).toFixed(2)}M د.ع</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${share}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 w-10">{share}%</span>
                    </div>
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
