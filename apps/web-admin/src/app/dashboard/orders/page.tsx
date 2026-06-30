'use client';
import { useEffect, useState } from 'react';
import { Search, Eye } from 'lucide-react';

const ORDER_API = 'https://medifloworder-service-production.up.railway.app/api/v1';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'في انتظار الدفع', color: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'مؤكد', color: 'bg-sky-100 text-sky-700' },
  preparing: { label: 'جاري التحضير', color: 'bg-indigo-100 text-indigo-700' },
  in_transit: { label: 'في الطريق', color: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'تم التسليم', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-700' },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setOrders([]);
    setLoading(false);
  }, []);

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.patient?.includes(search) || o.id?.includes(search);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalRevenue = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الطلبات</h1>
        <div className="text-sm text-gray-500">
          إجمالي الإيرادات: <span className="font-bold text-gray-900">{totalRevenue.toLocaleString('ar-IQ')} د.ع</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'إجمالي الطلبات', value: orders.length, color: 'text-sky-600' },
          { label: 'تم التسليم', value: orders.filter(o => o.status === 'delivered').length, color: 'text-green-600' },
          { label: 'قيد التنفيذ', value: orders.filter(o => ['confirmed','preparing','in_transit'].includes(o.status)).length, color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو اسم المريض..."
            className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none">
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['رقم الطلب', 'المريض', 'الصيدلية', 'المبلغ', 'الحالة', 'التاريخ', ''].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>{[...Array(7)].map((_, j) => (
                  <td key={j} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                ))}</tr>
              ))
            ) : filtered.map(order => {
              const status = STATUS_LABELS[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-700' };
              return (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm text-gray-900">{order.id}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{order.patient}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{order.pharmacy}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{order.total.toLocaleString('ar-IQ')} د.ع</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">{order.created_at}</td>
                  <td className="px-6 py-4">
                    <button className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg">
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
