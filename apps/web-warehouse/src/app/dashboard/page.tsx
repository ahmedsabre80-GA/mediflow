'use client';
import { Package, ShoppingCart, TrendingUp, Building2, AlertTriangle, Clock } from 'lucide-react';

export default function WarehouseDashboard() {
  const stats = [
    { label: 'إجمالي المنتجات', value: '342', icon: Package, color: 'bg-amber-500' },
    { label: 'طلبات B2B اليوم', value: '12', icon: ShoppingCart, color: 'bg-sky-500' },
    { label: 'الصيدليات الموردة', value: '47', icon: Building2, color: 'bg-teal-500' },
    { label: 'الإيرادات الشهرية', value: '4.2M', icon: TrendingUp, color: 'bg-indigo-500' },
  ];

  const pendingOrders = [
    { id: 'B2B-001', pharmacy: 'صيدلية الأمين', items: 5, total: 850000, status: 'pending' },
    { id: 'B2B-002', pharmacy: 'صيدلية النور', items: 3, total: 420000, status: 'pending' },
    { id: 'B2B-003', pharmacy: 'صيدلية الشفاء', items: 8, total: 1200000, status: 'processing' },
  ];

  const alerts = [
    { type: 'warning', msg: '5 منتجات تنتهي صلاحيتها خلال 30 يوماً' },
    { type: 'warning', msg: 'مخزون أموكسيسيلين منخفض — 45 وحدة متبقية' },
    { type: 'info', msg: 'طلب RFQ جديد من صيدلية الكرادة' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending B2B Orders */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900">طلبات B2B المعلقة</h2>
            <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2.5 py-1 rounded-full">{pendingOrders.length} طلبات</span>
          </div>
          <div className="p-4 space-y-3">
            {pendingOrders.map(order => (
              <div key={order.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{order.pharmacy}</p>
                  <p className="text-xs text-gray-500">{order.items} منتجات — {order.total.toLocaleString('ar-IQ')} د.ع</p>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600">قبول</button>
                  <button className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200">عرض</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="font-bold text-gray-900">التنبيهات</h2>
          </div>
          <div className="p-6 space-y-3">
            {alerts.map((alert, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${
                alert.type === 'warning' ? 'bg-amber-50' : 'bg-sky-50'
              }`}>
                <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${
                  alert.type === 'warning' ? 'text-amber-500' : 'text-sky-500'
                }`} />
                <p className="text-sm text-gray-700">{alert.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
