'use client';
import { useState, useEffect, useCallback } from 'react';
import { Package, ShoppingCart, TrendingUp, Building2, AlertTriangle, Clock } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function WarehouseDashboard() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const token = typeof window !== 'undefined' ? localStorage.getItem('warehouse-token') : '';

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const whRes = await fetch(`${API}/warehouses/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!whRes.ok) return;
      const whData = await whRes.json();
      const whId = whData.data?.id;
      if (!whId) return;

      const [invRes, ordRes] = await Promise.all([
        fetch(`${API}/warehouses/${whId}/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/warehouses/${whId}/b2b-orders`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (invRes.ok) setInventory((await invRes.json()).data || []);
      if (ordRes.ok) setOrders((await ordRes.json()).data || []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed');
  const lowAlerts = inventory.filter(i => i.status === 'low' || i.status === 'out' || i.status === 'expiring');
  const monthlyRevenue = orders.filter(o => o.status === 'delivered')
    .reduce((s, o) => s + Number(o.total), 0);

  const stats = [
    { label: 'إجمالي المنتجات', value: loading ? '...' : inventory.length, icon: Package, color: 'bg-amber-500' },
    { label: 'طلبات B2B قيد التنفيذ', value: loading ? '...' : pendingOrders.length, icon: ShoppingCart, color: 'bg-sky-500' },
    { label: 'إجمالي الطلبات', value: loading ? '...' : orders.length, icon: Building2, color: 'bg-teal-500' },
    { label: 'إيرادات المُسلَّمة', value: loading ? '...' : (monthlyRevenue >= 1_000_000 ? `${(monthlyRevenue/1_000_000).toFixed(1)}M` : monthlyRevenue.toLocaleString('ar-IQ')), icon: TrendingUp, color: 'bg-indigo-500' },
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
            <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2.5 py-1 rounded-full">
              {pendingOrders.length} طلبات
            </span>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-4">جاري التحميل...</p>
            ) : pendingOrders.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">لا توجد طلبات معلقة</p>
            ) : pendingOrders.slice(0, 5).map(order => (
              <div key={order.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{order.pharmacy_name}</p>
                  <p className="text-xs text-gray-500">{order.items?.length ?? 0} منتج</p>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{Number(order.total).toLocaleString('ar-IQ')} د.ع</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${order.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {order.status === 'pending' ? 'انتظار' : 'مؤكد'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Alerts */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900">تنبيهات المخزون</h2>
            <span className="text-xs bg-red-100 text-red-700 font-medium px-2.5 py-1 rounded-full">
              {lowAlerts.length} تنبيه
            </span>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-4">جاري التحميل...</p>
            ) : lowAlerts.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">المخزون في وضع جيد ✓</p>
            ) : lowAlerts.slice(0, 5).map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{item.name_ar || item.name}</p>
                  <p className="text-xs text-gray-500">
                    {item.status === 'out' ? 'نفذ من المخزون' :
                     item.status === 'expiring' ? 'ينتهي قريباً' :
                     `${item.quantity} وحدة — منخفض`}
                  </p>
                </div>
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
