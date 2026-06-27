'use client';
import { useState } from 'react';
import { Search, Plus, AlertTriangle } from 'lucide-react';

const MOCK_INVENTORY = [
  { id: 1, name: 'أموكسيسيلين 500mg', nameAr: 'أموكسيسيلين', batch: 'BATCH-2024-001', quantity: 45, reorderLevel: 100, price: 8500, expiry: '2026-03-15', status: 'low' },
  { id: 2, name: 'باراسيتامول 500mg', nameAr: 'باراسيتامول', batch: 'BATCH-2024-002', quantity: 850, reorderLevel: 200, price: 1500, expiry: '2027-01-20', status: 'good' },
  { id: 3, name: 'إيبوبروفين 400mg', nameAr: 'إيبوبروفين', batch: 'BATCH-2024-003', quantity: 320, reorderLevel: 150, price: 2200, expiry: '2026-08-10', status: 'good' },
  { id: 4, name: 'أوميبرازول 20mg', nameAr: 'أوميبرازول', batch: 'BATCH-2024-004', quantity: 180, reorderLevel: 100, price: 3500, expiry: '2025-12-31', status: 'expiring' },
  { id: 5, name: 'ميتفورمين 500mg', nameAr: 'ميتفورمين', batch: 'BATCH-2024-005', quantity: 0, reorderLevel: 50, price: 2800, expiry: '2027-06-15', status: 'out' },
];

export default function WarehouseInventoryPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = MOCK_INVENTORY.filter(item => {
    const matchSearch = !search || item.nameAr.includes(search) || item.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || item.status === filter;
    return matchSearch && matchFilter;
  });

  const statusConfig: Record<string, { label: string; color: string; rowColor: string }> = {
    good: { label: 'جيد', color: 'bg-green-100 text-green-700', rowColor: '' },
    low: { label: 'منخفض', color: 'bg-amber-100 text-amber-700', rowColor: 'bg-amber-50' },
    expiring: { label: 'ينتهي قريباً', color: 'bg-orange-100 text-orange-700', rowColor: 'bg-orange-50' },
    out: { label: 'نفذ', color: 'bg-red-100 text-red-700', rowColor: 'bg-red-50' },
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المخزون</h1>
        <button className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> إضافة منتج
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المنتجات', value: MOCK_INVENTORY.length, color: 'text-gray-900' },
          { label: 'مخزون منخفض', value: MOCK_INVENTORY.filter(i => i.status === 'low').length, color: 'text-amber-600' },
          { label: 'ينتهي قريباً', value: MOCK_INVENTORY.filter(i => i.status === 'expiring').length, color: 'text-orange-600' },
          { label: 'نفذ من المخزون', value: MOCK_INVENTORY.filter(i => i.status === 'out').length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث عن منتج..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'low',l:'منخفض'},{k:'expiring',l:'ينتهي'},{k:'out',l:'نفذ'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter === f.k ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{f.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['المنتج', 'رقم الدفعة', 'الكمية', 'السعر', 'انتهاء الصلاحية', 'الحالة', ''].map(h => (
                <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(item => {
              const status = statusConfig[item.status];
              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${status.rowColor}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {(item.status === 'low' || item.status === 'expiring' || item.status === 'out') && (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{item.nameAr}</p>
                        <p className="text-xs text-gray-400">{item.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.batch}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold text-sm ${item.quantity === 0 ? 'text-red-600' : item.quantity < item.reorderLevel ? 'text-amber-600' : 'text-gray-900'}`}>
                      {item.quantity.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400"> / {item.reorderLevel.toLocaleString()} حد إعادة الطلب</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.price.toLocaleString('ar-IQ')} د.ع</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.expiry}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100">تعديل</button>
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
