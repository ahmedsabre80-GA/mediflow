'use client';
import { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, Truck, XCircle, RefreshCw } from 'lucide-react';

const ORDER_API = 'https://medifloworder-service-production.up.railway.app/api/v1';

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: 'قيد الانتظار',  color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  confirmed:  { label: 'تم التأكيد',    color: 'bg-blue-100 text-blue-700',    icon: CheckCircle },
  preparing:  { label: 'جاري التحضير', color: 'bg-indigo-100 text-indigo-700', icon: Package },
  dispatched: { label: 'في الطريق',    color: 'bg-purple-100 text-purple-700', icon: Truck },
  delivered:  { label: 'تم التوصيل',   color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  cancelled:  { label: 'ملغي',          color: 'bg-red-100 text-red-700',       icon: XCircle },
};

export default function OrdersPage() {
  const [orders, setOrders]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem('mediflow-auth');
      if (!stored) return;
      const { state } = JSON.parse(stored);
      const token  = state?.accessToken;
      const userId = state?.user?.id;
      if (!token || !userId) return;
      const res = await fetch(`${ORDER_API}/orders?patientId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setOrders(d.data || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-sky-500 px-4 py-6 pt-12">
        <div className="flex items-center justify-between">
          <button onClick={load} disabled={loading} className="text-white/80 hover:text-white">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <h1 className="text-xl font-bold text-white">طلباتي</h1>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-28" />)
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">لا توجد طلبات بعد</p>
            <p className="text-sm text-gray-400 mt-1">ابحث عن دواء وابدأ طلبك الأول</p>
          </div>
        ) : orders.map((order: any) => {
          const st = STATUS_MAP[order.status] || STATUS_MAP['pending'];
          const Icon = st.icon;
          return (
            <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 ${st.color}`}>
                  <Icon className="w-3.5 h-3.5" /> {st.label}
                </span>
                <div className="text-right">
                  <p className="font-bold text-gray-900 text-sm">طلب #{order.id?.slice(-6)}</p>
                  <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('ar-IQ')}</p>
                </div>
              </div>
              <div className="space-y-1 mb-3">
                {(order.items || []).slice(0, 2).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">× {item.quantity}</span>
                    <span className="text-gray-800 font-medium">{item.medication_name || item.name}</span>
                  </div>
                ))}
                {(order.items || []).length > 2 && (
                  <p className="text-xs text-gray-400 text-right">+{order.items.length - 2} أكثر</p>
                )}
              </div>
              <div className="flex items-center justify-between pt-3 border-t">
                <span className="font-bold text-sky-600">{(order.total_amount || 0).toLocaleString('ar-IQ')} د.ع</span>
                <span className="text-xs text-gray-500">{order.pharmacy_name || 'صيدلية'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
