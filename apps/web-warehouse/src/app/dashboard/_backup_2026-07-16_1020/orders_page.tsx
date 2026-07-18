'use client';
import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, CheckCircle, XCircle, Clock, Truck, Search, RefreshCw, Eye } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1';

interface OrderItem { id: string; name: string; quantity: number; unit_price: number; }
interface Order {
  id: string;
  warehouse_id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';
  created_at: string;
  notes?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: 'قيد الانتظار', color: 'bg-amber-100 text-amber-700',   icon: Clock },
  confirmed:  { label: 'مؤكد',         color: 'bg-blue-100 text-blue-700',     icon: CheckCircle },
  dispatched: { label: 'تم الإرسال',   color: 'bg-indigo-100 text-indigo-700', icon: Truck },
  delivered:  { label: 'تم التسليم',   color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  cancelled:  { label: 'ملغي',         color: 'bg-red-100 text-red-700',       icon: XCircle },
};

export default function WarehouseOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Order | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('warehouse-token') : '';

  const getWarehouse = useCallback(async () => {
    if (!token) return null;
    const res = await fetch(`${API}/warehouses/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.id ?? null;
  }, [token]);

  const loadOrders = useCallback(async (whId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/warehouses/${whId}/b2b-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('فشل تحميل الطلبات');
      const data = await res.json();
      setOrders(data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    getWarehouse().then(id => {
      if (id) { setWarehouseId(id); loadOrders(id); }
      else { setLoading(false); setError('تعذر تحميل بيانات المستودع'); }
    });
  }, [getWarehouse, loadOrders]);

  const updateStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const res = await fetch(`${API}/warehouses/b2b-orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('فشل تحديث الحالة');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if (selected?.id === orderId) setSelected(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.pharmacy_name.includes(search) || o.id.includes(search);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    dispatched: orders.filter(o => o.status === 'dispatched').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">طلبات B2B</h1>
          <p className="text-sm text-gray-500 mt-0.5">طلبات الصيدليات من المستودع</p>
        </div>
        <button onClick={() => warehouseId && loadOrders(warehouseId)} disabled={loading}
          className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'قيد الانتظار', value: counts.pending,   color: 'text-amber-600',  bg: 'bg-amber-50' },
          { label: 'مؤكدة',        value: counts.confirmed,  color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'تم الإرسال',   value: counts.dispatched, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'تم التسليم',   value: counts.delivered,  color: 'text-green-600',  bg: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم الصيدلية أو رقم الطلب..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[['all','الكل'],['pending','انتظار'],['confirmed','مؤكد'],['dispatched','مُرسَل'],['delivered','مُسلَّم'],['cancelled','ملغي']].map(([k,l]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === k ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-16 text-gray-400 text-sm">جاري التحميل...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['رقم الطلب', 'الصيدلية', 'المنتجات', 'الإجمالي', 'الحالة', 'التاريخ', 'إجراءات'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">لا توجد طلبات</td></tr>
              ) : filtered.map(order => {
                const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                const Icon = st.icon;
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4"><p className="text-sm font-mono font-medium text-gray-900">{order.id.slice(0,8)}…</p></td>
                    <td className="px-4 py-4"><p className="text-sm font-medium text-gray-900">{order.pharmacy_name}</p></td>
                    <td className="px-4 py-4"><p className="text-sm text-gray-600">{order.items?.length ?? 0} منتج</p></td>
                    <td className="px-4 py-4"><p className="text-sm font-semibold text-gray-900">{Number(order.total).toLocaleString('ar-IQ')} د.ع</p></td>
                    <td className="px-4 py-4">
                      <span className={`flex items-center gap-1.5 w-fit text-xs font-medium px-2.5 py-1 rounded-full ${st.color}`}>
                        <Icon className="w-3.5 h-3.5" />{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-4"><p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('ar-IQ')}</p></td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5">
                        <button onClick={() => setSelected(order)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="عرض التفاصيل">
                          <Eye className="w-4 h-4" />
                        </button>
                        {order.status === 'pending' && (
                          <>
                            <button onClick={() => updateStatus(order.id, 'confirmed')} className="text-xs bg-blue-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-600">تأكيد</button>
                            <button onClick={() => updateStatus(order.id, 'cancelled')} className="text-xs bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-200">رفض</button>
                          </>
                        )}
                        {order.status === 'confirmed' && (
                          <button onClick={() => updateStatus(order.id, 'dispatched')} className="text-xs bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-600">إرسال</button>
                        )}
                        {order.status === 'dispatched' && (
                          <button onClick={() => updateStatus(order.id, 'delivered')} className="text-xs bg-green-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-600">تسليم</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Order Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">تفاصيل الطلب</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CONFIG[selected.status]?.color}`}>
                  {STATUS_CONFIG[selected.status]?.label}
                </span>
                <p className="text-sm text-gray-500">{new Date(selected.created_at).toLocaleString('ar-IQ')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-1">الصيدلية</p>
                <p className="text-gray-900 font-medium">{selected.pharmacy_name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">المنتجات المطلوبة</p>
                <div className="space-y-2">
                  {(selected.items || []).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-medium text-gray-600">{item.quantity.toLocaleString()} × {Number(item.unit_price).toLocaleString()} د.ع</span>
                      <span className="text-gray-900">{item.name}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-3 pt-3 flex justify-between font-bold text-gray-900">
                  <span>{Number(selected.total).toLocaleString('ar-IQ')} د.ع</span>
                  <span>الإجمالي</span>
                </div>
              </div>
              {selected.notes && (
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-sm text-amber-800">{selected.notes}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                {selected.status === 'pending' && (
                  <>
                    <button onClick={() => { updateStatus(selected.id, 'confirmed'); setSelected(null); }}
                      className="flex-1 bg-blue-500 text-white font-semibold py-3 rounded-xl text-sm hover:bg-blue-600">تأكيد الطلب</button>
                    <button onClick={() => { updateStatus(selected.id, 'cancelled'); setSelected(null); }}
                      className="flex-1 bg-red-100 text-red-600 font-semibold py-3 rounded-xl text-sm hover:bg-red-200">رفض الطلب</button>
                  </>
                )}
                {selected.status === 'confirmed' && (
                  <button onClick={() => { updateStatus(selected.id, 'dispatched'); setSelected(null); }}
                    className="flex-1 bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm hover:bg-indigo-600">إرسال الشحنة</button>
                )}
                {selected.status === 'dispatched' && (
                  <button onClick={() => { updateStatus(selected.id, 'delivered'); setSelected(null); }}
                    className="flex-1 bg-green-500 text-white font-semibold py-3 rounded-xl text-sm hover:bg-green-600">تأكيد التسليم</button>
                )}
                <button onClick={() => setSelected(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إغلاق</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
