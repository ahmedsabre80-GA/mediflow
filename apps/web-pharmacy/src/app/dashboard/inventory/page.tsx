'use client';
import { useEffect, useState } from 'react';
import { Search, Plus, AlertTriangle, Package } from 'lucide-react';

const PHARMACY_API = process.env.NEXT_PUBLIC_PHARMACY_API_URL || 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ drugId: '', quantity: '', sellingPrice: '', reorderLevel: '10' });
  const [saving, setSaving] = useState(false);

  const fetchInventory = () => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!pharmacyId) { setLoading(false); return; }
    fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory?search=${search}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setInventory(d.data || []))
      .catch(() => setInventory([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInventory(); }, [search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, quantity: Number(form.quantity), sellingPrice: Number(form.sellingPrice), reorderLevel: Number(form.reorderLevel) }),
    });
    setSaving(false);
    setShowAdd(false);
    fetchInventory();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">إدارة المخزون</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-medium px-4 py-2 rounded-xl transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          إضافة منتج
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 max-w-md">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن دواء..."
            className="bg-transparent flex-1 outline-none text-sm"
          />
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 mb-4">إضافة منتج للمخزون</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">معرّف الدواء</label>
                <input
                  value={form.drugId}
                  onChange={(e) => setForm({ ...form, drugId: e.target.value })}
                  placeholder="UUID الدواء"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  dir="ltr"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الكمية</label>
                  <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع (د.ع)</label>
                  <input type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">مستوى إعادة الطلب</label>
                <input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-gray-300 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                  إلغاء
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                  {saving ? 'جاري الحفظ...' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">الدواء</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">الكمية</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">المحجوز</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">السعر</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">جاري التحميل...</td></tr>
            ) : inventory.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                لا توجد منتجات في المخزون
              </td></tr>
            ) : inventory.map((item) => {
              const available = item.quantity - item.reserved_qty;
              const isLow = available <= item.reorder_level;
              return (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.generic_name}</p>
                    <p className="text-xs text-gray-500">{item.brand_name}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{item.reserved_qty}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {Number(item.selling_price).toLocaleString()} د.ع
                  </td>
                  <td className="px-4 py-3">
                    {isLow ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full w-fit">
                        <AlertTriangle className="w-3 h-3" /> نفاد قريب
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">متوفر</span>
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
