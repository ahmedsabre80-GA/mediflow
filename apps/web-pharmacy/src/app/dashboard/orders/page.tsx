'use client';
import { useEffect, useState } from 'react';
import { Search, Filter, Eye, CheckCircle, XCircle, Clock } from 'lucide-react';

const PHARMACY_API = process.env.NEXT_PUBLIC_PHARMACY_API_URL || 'https://mediflow-production-d815.up.railway.app/api/v1';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'انتظار الدفع', color: 'text-yellow-600 bg-yellow-50' },
  confirmed: { label: 'مؤكد', color: 'text-blue-600 bg-blue-50' },
  preparing: { label: 'جاري التحضير', color: 'text-purple-600 bg-purple-50' },
  ready_for_pickup: { label: 'جاهز للاستلام', color: 'text-teal-600 bg-teal-50' },
  in_transit: { label: 'في الطريق', color: 'text-sky-600 bg-sky-50' },
  delivered: { label: 'تم التسليم', color: 'text-green-600 bg-green-50' },
  cancelled: { label: 'ملغى', color: 'text-red-600 bg-red-50' },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!pharmacyId) { setLoading(false); return; }

    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);

    fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/orders?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setOrders(d.data || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const filtered = orders.filter((o) =>
    !search || o.id?.includes(search) || o.patient_email?.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">الطلبات</h2>
        <span className="text-sm text-gray-500">{filtered.length} طلب</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم الطلب..."
            className="bg-transparent flex-1 outline-none text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">جميع الحالات</option>
          {Object.entries(STATUS_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">رقم الطلب</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">المريض</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">المبلغ</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">الحالة</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">التاريخ</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">جاري التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">لا توجد طلبات</td></tr>
            ) : filtered.map((order) => {
              const status = STATUS_LABELS[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-50' };
              return (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">#{order.id?.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{order.patient_email || '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {Number(order.total_amount || 0).toLocaleString()} د.ع
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString('ar-IQ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-sky-600 hover:text-sky-700 p-1 rounded-lg hover:bg-sky-50 transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
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
