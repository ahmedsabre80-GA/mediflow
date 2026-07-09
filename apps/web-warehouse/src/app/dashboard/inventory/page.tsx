'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, AlertTriangle, RefreshCw, Pencil, Trash2, X, Check } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1';

interface StockItem {
  id: string;
  warehouse_id: string;
  name: string;
  name_ar: string;
  batch_number: string;
  quantity: number;
  reorder_level: number;
  unit_price: number;
  expiry_date: string | null;
  status: 'good' | 'low' | 'expiring' | 'out';
}

const statusConfig: Record<string, { label: string; color: string; rowColor: string }> = {
  good:     { label: 'جيد',         color: 'bg-green-100 text-green-700',   rowColor: '' },
  low:      { label: 'منخفض',       color: 'bg-amber-100 text-amber-700',   rowColor: 'bg-amber-50' },
  expiring: { label: 'ينتهي قريباً', color: 'bg-orange-100 text-orange-700', rowColor: 'bg-orange-50' },
  out:      { label: 'نفذ',         color: 'bg-red-100 text-red-700',       rowColor: 'bg-red-50' },
};

const emptyForm = { name: '', name_ar: '', batch_number: '', quantity: '', reorder_level: '100', unit_price: '', expiry_date: '' };

export default function WarehouseInventoryPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('warehouse-token') : '';

  const getWarehouse = useCallback(async () => {
    if (!token) return null;
    const res = await fetch(`${API}/warehouses/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.id ?? null;
  }, [token]);

  const loadInventory = useCallback(async (whId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/warehouses/${whId}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('فشل تحميل المخزون');
      const data = await res.json();
      setItems(data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    getWarehouse().then(id => {
      if (id) {
        setWarehouseId(id);
        loadInventory(id);
      } else {
        setLoading(false);
        setError('تعذر تحميل بيانات المستودع');
      }
    });
  }, [getWarehouse, loadInventory]);

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (item: StockItem) => {
    setEditItem(item);
    setForm({
      name: item.name, name_ar: item.name_ar || item.name,
      batch_number: item.batch_number || '',
      quantity: String(item.quantity), reorder_level: String(item.reorder_level),
      unit_price: String(item.unit_price),
      expiry_date: item.expiry_date ? item.expiry_date.slice(0, 10) : '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !warehouseId) return;
    setSaving(true);
    try {
      const body = {
        name: form.name, name_ar: form.name_ar || form.name,
        batch_number: form.batch_number || undefined,
        quantity: Number(form.quantity) || 0,
        reorder_level: Number(form.reorder_level) || 100,
        unit_price: Number(form.unit_price) || 0,
        expiry_date: form.expiry_date || undefined,
      };
      const url = editItem
        ? `${API}/warehouses/${warehouseId}/inventory/${editItem.id}`
        : `${API}/warehouses/${warehouseId}/inventory`;
      const res = await fetch(url, {
        method: editItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('فشل الحفظ');
      setShowForm(false);
      loadInventory(warehouseId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: StockItem) => {
    if (!warehouseId) return;
    if (!confirm(`حذف "${item.name_ar || item.name}"؟`)) return;
    try {
      await fetch(`${API}/warehouses/${warehouseId}/inventory/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadInventory(warehouseId);
    } catch {}
  };

  const filtered = items.filter(item => {
    const matchSearch = !search || (item.name_ar || item.name).includes(search) || item.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || item.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المخزون</h1>
        <div className="flex gap-2">
          <button onClick={() => warehouseId && loadInventory(warehouseId)} disabled={loading}
            className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 disabled:opacity-50 px-3 py-2.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> إضافة منتج
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المنتجات', value: items.length, color: 'text-gray-900' },
          { label: 'مخزون منخفض', value: items.filter(i => i.status === 'low').length, color: 'text-amber-600' },
          { label: 'ينتهي قريباً', value: items.filter(i => i.status === 'expiring').length, color: 'text-orange-600' },
          { label: 'نفذ من المخزون', value: items.filter(i => i.status === 'out').length, color: 'text-red-600' },
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
        {loading ? (
          <div className="flex justify-center items-center py-16 text-gray-400 text-sm">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <p>لا توجد منتجات</p>
            <button onClick={openAdd} className="text-amber-600 hover:underline text-xs">+ أضف منتجاً الآن</button>
          </div>
        ) : (
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
                const st = statusConfig[item.status] || statusConfig.good;
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${st.rowColor}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.status !== 'good' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{item.name_ar || item.name}</p>
                          <p className="text-xs text-gray-400">{item.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.batch_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${item.quantity === 0 ? 'text-red-600' : item.quantity < item.reorder_level ? 'text-amber-600' : 'text-gray-900'}`}>
                        {item.quantity.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400"> / {item.reorder_level.toLocaleString()} حد إعادة</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{Number(item.unit_price).toLocaleString('ar-IQ')} د.ع</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.expiry_date ? item.expiry_date.slice(0,10) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="تعديل">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="حذف">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{editItem ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">اسم المنتج (عربي)</label>
                  <input value={form.name_ar} onChange={e => setForm(f => ({...f, name_ar: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" placeholder="باراسيتامول" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">اسم المنتج (إنجليزي)</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" placeholder="Paracetamol 500mg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">رقم الدفعة</label>
                  <input value={form.batch_number} onChange={e => setForm(f => ({...f, batch_number: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" placeholder="BATCH-2024-001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ انتهاء الصلاحية</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({...f, expiry_date: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الكمية</label>
                  <input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({...f, quantity: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">حد إعادة الطلب</label>
                  <input type="number" min="0" value={form.reorder_level} onChange={e => setForm(f => ({...f, reorder_level: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">سعر الوحدة (د.ع)</label>
                  <input type="number" min="0" value={form.unit_price} onChange={e => setForm(f => ({...f, unit_price: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving || !form.name}
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editItem ? 'حفظ التعديلات' : 'إضافة المنتج'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
