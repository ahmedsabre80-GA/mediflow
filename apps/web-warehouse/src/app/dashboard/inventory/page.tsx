'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, AlertTriangle, RefreshCw, Pencil, Trash2, X, Check, Upload, Settings, Tag } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1';
const CUSTOM_COLS_KEY  = 'warehouse-custom-columns';
const EXTRA_DATA_KEY   = 'warehouse-item-extra-data';

function loadExtraCache(): Record<string, Record<string, any>> {
  try { return JSON.parse(localStorage.getItem(EXTRA_DATA_KEY) || '{}'); } catch { return {}; }
}
function saveExtraCache(cache: Record<string, Record<string, any>>) {
  try { localStorage.setItem(EXTRA_DATA_KEY, JSON.stringify(cache)); } catch {}
}

interface StockItem {
  id: string; warehouse_id: string; name: string; name_ar: string;
  batch_number: string; quantity: number; reorder_level: number;
  unit_price: number; buying_price?: number; discount?: number;
  expiry_date: string | null; status: 'good' | 'low' | 'expiring' | 'out';
  extra_data?: Record<string, any>;
}
interface CustomCol { key: string; label: string; }

function loadCustomCols(): CustomCol[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_COLS_KEY) || '[]'); } catch { return []; }
}
function saveCustomCols(cols: CustomCol[]) { localStorage.setItem(CUSTOM_COLS_KEY, JSON.stringify(cols)); }

const statusConfig: Record<string, { label: string; color: string; rowColor: string }> = {
  good:     { label: 'جيد',          color: 'bg-green-100 text-green-700',   rowColor: '' },
  low:      { label: 'منخفض',        color: 'bg-amber-100 text-amber-700',   rowColor: 'bg-amber-50' },
  expiring: { label: 'ينتهي قريباً', color: 'bg-orange-100 text-orange-700', rowColor: 'bg-orange-50' },
  out:      { label: 'نفذ',          color: 'bg-red-100 text-red-700',       rowColor: 'bg-red-50' },
};

const baseEmpty = () => ({
  name: '', name_ar: '', batch_number: '', quantity: '',
  reorder_level: '100', unit_price: '', buying_price: '',
  discount_type: 'percent' as 'percent' | 'gift',
  discount: '0', gift_free: '1', gift_per: '10', expiry_date: '',
  min_order_type: 'free' as 'free' | 'min' | 'step',
  min_order_qty: '1',
});

export default function WarehouseInventoryPage() {
  const [items, setItems]             = useState<StockItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState('all');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [customCols, setCustomCols]   = useState<CustomCol[]>([]);

  const [showForm, setShowForm]       = useState(false);
  const [addMode, setAddMode]         = useState<'manual'|'csv'|'restock'>('manual');
  const [showColMgr, setShowColMgr]   = useState(false);

  const [editItem, setEditItem]       = useState<StockItem | null>(null);
  const [form, setForm]               = useState<any>(baseEmpty());
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [saving, setSaving]           = useState(false);

  const fileRef                       = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows]         = useState<any[]>([]);
  const [csvError, setCsvError]       = useState('');
  const [csvImporting, setCsvImporting] = useState(false);

  const [restockQtys, setRestockQtys] = useState<Record<string, string>>({});
  const [restockSaving, setRestockSaving] = useState(false);

  const [newColLabel, setNewColLabel] = useState('');

  // Quick price/discount edit modal
  const [priceModal, setPriceModal]   = useState<StockItem | null>(null);
  const [priceForm, setPriceForm]     = useState({ unit_price: '', buying_price: '', discount_type: 'percent' as 'percent'|'gift', discount: '0', gift_free: '1', gift_per: '10' });
  const [priceSaving, setPriceSaving] = useState(false);


  const [error, setError]             = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('warehouse-token') : '';

  useEffect(() => { setCustomCols(loadCustomCols()); }, []);

  const getWarehouse = useCallback(async () => {
    if (!token) return null;
    const r = await fetch(`${API}/warehouses/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return (await r.json()).data?.id ?? null;
  }, [token]);

  const loadInventory = useCallback(async (whId: string) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/warehouses/${whId}/inventory`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('فشل تحميل المخزون');
      const raw: StockItem[] = (await r.json()).data || [];
      const cache = loadExtraCache();
      // Merge locally-saved extra_data back in (API may not return it)
      setItems(raw.map(item => cache[item.id]
        ? { ...item, extra_data: { ...(item.extra_data || {}), ...cache[item.id] } }
        : item));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    getWarehouse().then(id => {
      if (id) { setWarehouseId(id); loadInventory(id); }
      else { setLoading(false); setError('تعذر تحميل بيانات المستودع'); }
    });
  }, [getWarehouse, loadInventory]);

  const openAdd = () => {
    setEditItem(null); setForm(baseEmpty()); setCustomValues({});
    setCsvRows([]); setCsvError(''); setRestockQtys({});
    setAddMode('manual'); setShowForm(true);
  };
  const openEdit = (item: StockItem) => {
    setEditItem(item);
    setForm({
      name: item.name, name_ar: item.name_ar || item.name,
      batch_number: item.batch_number || '', quantity: String(item.quantity),
      reorder_level: String(item.reorder_level), unit_price: String(item.unit_price),
      buying_price: item.buying_price != null ? String(item.buying_price) : '',
      discount: String(item.discount ?? 0),
      expiry_date: item.expiry_date ? item.expiry_date.slice(0, 10) : '',
      discount_type: item.extra_data?.discount_type || 'percent',
      gift_free: String(item.extra_data?.gift_free ?? 1),
      gift_per:  String(item.extra_data?.gift_per  ?? 10),
      min_order_type: item.extra_data?.min_order_type || 'free',
      min_order_qty:  String(item.extra_data?.min_order_qty ?? 1),
    });
    const cv: Record<string, string> = {};
    customCols.forEach(c => { cv[c.key] = String(item.extra_data?.[c.key] ?? ''); });
    setCustomValues(cv);
    setAddMode('manual'); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !warehouseId) return;
    setSaving(true);
    try {
      const extra: Record<string, any> = {};
      customCols.forEach(c => { if (customValues[c.key]) extra[c.key] = customValues[c.key]; });
      const isGiftType = form.discount_type === 'gift';
      const body = {
        name: form.name, name_ar: form.name_ar || form.name,
        batch_number: form.batch_number || undefined,
        quantity: Number(form.quantity) || 0,
        reorder_level: Number(form.reorder_level) || 100,
        unit_price: Number(form.unit_price) || 0,
        buying_price: form.buying_price !== '' ? Number(form.buying_price) : undefined,
        discount: isGiftType ? 0 : (Number(form.discount) || 0),
        expiry_date: form.expiry_date || undefined,
        extra_data: {
          ...extra,
          discount_type: form.discount_type,
          ...(isGiftType ? { gift_free: Number(form.gift_free) || 1, gift_per: Number(form.gift_per) || 10 } : {}),
          min_order_type: form.min_order_type,
          min_order_qty:  form.min_order_type === 'free' ? 1 : (Number(form.min_order_qty) || 1),
        },
      };
      const liveToken = localStorage.getItem('warehouse-token') || '';
      const url = editItem
        ? `${API}/warehouses/${warehouseId}/inventory/${editItem.id}`
        : `${API}/warehouses/${warehouseId}/inventory`;
      const r = await fetch(url, {
        method: editItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${liveToken}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        throw new Error(r.status === 401 ? 'انتهت صلاحية الجلسة — أعد تسجيل الدخول' : `فشل الحفظ (${r.status}) ${errText}`);
      }
      let saved: any = null;
      try { saved = (await r.json()).data; } catch {}
      if (editItem) {
        const mergedExtra = { ...(editItem.extra_data || {}), ...body.extra_data, ...(saved?.extra_data || {}) };
        // Persist extra_data to localStorage so tab switches don't lose it
        const cache = loadExtraCache();
        cache[editItem.id] = mergedExtra;
        saveExtraCache(cache);
        const merged = { ...editItem, ...body, ...(saved || {}), extra_data: mergedExtra };
        setItems(prev => prev.map(i => i.id === editItem.id ? (merged as StockItem) : i));
        setShowForm(false);
      } else {
        setShowForm(false); loadInventory(warehouseId);
      }
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item: StockItem) => {
    if (!warehouseId || !confirm(`حذف "${item.name_ar || item.name}"؟`)) return;
    try {
      await fetch(`${API}/warehouses/${warehouseId}/inventory/${item.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      loadInventory(warehouseId);
    } catch {}
  };

  const handleCsvFile = (file: File) => {
    setCsvError(''); setCsvRows([]);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { setCsvError('الملف فارغ أو لا يحتوي على بيانات'); return; }
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row: any = {};
          headers.forEach((h, i) => { row[h] = vals[i] || ''; });
          return row;
        }).filter(r => r.name || r['اسم المنتج'] || r['اسم المنتج (إنجليزي)']);
        setCsvRows(rows);
      } catch { setCsvError('خطأ في قراءة الملف'); }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const importCsv = async () => {
    if (!warehouseId || !csvRows.length) return;
    setCsvImporting(true);
    try {
      const mapped = csvRows.map(r => ({
        name:          r.name || r['اسم المنتج (إنجليزي)'] || r['Name'] || '',
        name_ar:       r.name_ar || r['اسم المنتج'] || r['اسم المنتج (عربي)'] || r.name || '',
        batch_number:  r.batch_number || r['رقم الدفعة'] || undefined,
        quantity:      Number(r.quantity || r['الكمية'] || 0),
        reorder_level: Number(r.reorder_level || r['حد إعادة الطلب'] || 100),
        unit_price:    Number(r.unit_price || r['سعر البيع'] || 0),
        buying_price:  r.buying_price || r['سعر الشراء'] ? Number(r.buying_price || r['سعر الشراء']) : undefined,
        discount:      Number(r.discount || r['الخصم'] || 0),
        expiry_date:   r.expiry_date || r['تاريخ الانتهاء'] || undefined,
      })).filter(i => i.name);
      const r = await fetch(`${API}/warehouses/${warehouseId}/inventory/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: mapped }),
      });
      if (!r.ok) throw new Error('فشل الاستيراد');
      setShowForm(false); loadInventory(warehouseId);
    } catch (e: any) { setCsvError(e.message); }
    finally { setCsvImporting(false); }
  };

  const saveRestock = async () => {
    if (!warehouseId) return;
    setRestockSaving(true);
    try {
      for (const [id, qtyStr] of Object.entries(restockQtys)) {
        const qty = Number(qtyStr);
        if (!qty) continue;
        const item = items.find(i => i.id === id);
        if (!item) continue;
        await fetch(`${API}/warehouses/${warehouseId}/inventory/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ quantity: item.quantity + qty }),
        });
      }
      setShowForm(false); loadInventory(warehouseId);
    } catch (e: any) { setError(e.message); }
    finally { setRestockSaving(false); }
  };

  const addCustomCol = () => {
    if (!newColLabel.trim()) return;
    const key = newColLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `col_${Date.now()}`;
    const updated = [...customCols, { key, label: newColLabel.trim() }];
    setCustomCols(updated); saveCustomCols(updated); setNewColLabel('');
  };
  const removeCustomCol = (key: string) => {
    const updated = customCols.filter(c => c.key !== key);
    setCustomCols(updated); saveCustomCols(updated);
  };

  const openPriceModal = (item: StockItem) => {
    setPriceModal(item);
    setPriceForm({
      unit_price:    String(item.unit_price),
      buying_price:  item.buying_price != null ? String(item.buying_price) : '',
      discount_type: item.extra_data?.discount_type || 'percent',
      discount:      String(item.discount ?? 0),
      gift_free:     String(item.extra_data?.gift_free ?? 1),
      gift_per:      String(item.extra_data?.gift_per  ?? 10),
    });
  };

  const savePriceEdit = async () => {
    if (!priceModal || !warehouseId) return;
    setPriceSaving(true);
    try {
      const isGift = priceForm.discount_type === 'gift';
      const body = {
        unit_price:   Number(priceForm.unit_price) || 0,
        buying_price: priceForm.buying_price !== '' ? Number(priceForm.buying_price) : undefined,
        discount:     isGift ? 0 : (Number(priceForm.discount) || 0),
        extra_data: {
          ...(priceModal.extra_data || {}),
          discount_type: priceForm.discount_type,
          ...(isGift
            ? { gift_free: Number(priceForm.gift_free) || 1, gift_per: Number(priceForm.gift_per) || 10 }
            : { gift_free: 0, gift_per: 0 }),
        },
      };
      const r = await fetch(`${API}/warehouses/${warehouseId}/inventory/${priceModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('فشل الحفظ');
      setPriceModal(null);
      loadInventory(warehouseId);
    } catch (e: any) { setError(e.message); }
    finally { setPriceSaving(false); }
  };

  const filtered = items.filter(item => {
    const matchSearch = !search || (item.name_ar || item.name).includes(search) || item.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || item.status === filter;
    return matchSearch && matchFilter;
  });

  const inp = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p: any) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المخزون</h1>
        <div className="flex gap-2">
          <button onClick={() => warehouseId && loadInventory(warehouseId)} disabled={loading}
            className="p-2.5 text-amber-600 hover:text-amber-700 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowColMgr(true)}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Settings className="w-4 h-4" /> إدارة الأعمدة
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> إضافة منتج
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="underline text-xs">إغلاق</button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المنتجات', value: items.length,                                      color: 'text-gray-900' },
          { label: 'مخزون منخفض',     value: items.filter(i => i.status === 'low').length,      color: 'text-amber-600' },
          { label: 'ينتهي قريباً',    value: items.filter(i => i.status === 'expiring').length, color: 'text-orange-600' },
          { label: 'نفذ من المخزون',  value: items.filter(i => i.status === 'out').length,      color: 'text-red-600' },
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
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
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
                {['المنتج', 'رقم الدفعة', 'الكمية', 'سعر البيع', 'سعر الشراء', 'خصم %', 'قاعدة الطلب', 'الانتهاء', 'الحالة',
                  ...customCols.map(c => c.label), ''].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
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
                          <p className="font-medium text-gray-900 text-sm">{item.extra_data?.discount_type === 'gift' ? '🎁 ' : ''}{item.name_ar || item.name}</p>
                          <p className="text-xs text-gray-400">{item.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.batch_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${item.quantity === 0 ? 'text-red-600' : item.quantity < item.reorder_level ? 'text-amber-600' : 'text-gray-900'}`}>
                        {item.quantity.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400"> / {item.reorder_level.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{Number(item.unit_price).toLocaleString('ar-IQ')} د.ع</td>
                    <td className="px-4 py-3 text-sm text-blue-700">
                      {item.buying_price != null ? `${Number(item.buying_price).toLocaleString('ar-IQ')} د.ع` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {item.extra_data?.discount_type === 'gift'
                        ? <span className="text-amber-600 font-bold">🎁 {item.extra_data.gift_free ?? 1} لكل {item.extra_data.gift_per ?? 10}</span>
                        : item.discount ? <span className="text-emerald-700">{item.discount}%</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-indigo-700">
                      {item.extra_data?.min_order_type === 'min'
                        ? `≥ ${item.extra_data.min_order_qty}`
                        : item.extra_data?.min_order_type === 'step'
                        ? `× ${item.extra_data.min_order_qty}`
                        : <span className="text-gray-400">حر</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.expiry_date ? item.expiry_date.slice(0,10) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                    </td>
                    {customCols.map(c => (
                      <td key={c.key} className="px-4 py-3 text-sm text-gray-600">{item.extra_data?.[c.key] ?? '—'}</td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openPriceModal(item)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="تعديل السعر والخصم">
                          <Tag className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="تعديل كامل">
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

      {/* ── Add / Edit Modal ────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h2 className="font-bold text-gray-900">{editItem ? 'تعديل المنتج' : 'إضافة منتج'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {!editItem && (
              <div className="flex gap-1 p-4 pb-0 shrink-0">
                {([['manual','✍️ يدوي'], ['csv','📊 Excel/CSV'], ['restock','🔄 إعادة تخزين']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setAddMode(k)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${addMode === k ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}

            <div className="overflow-y-auto flex-1 p-6">

              {/* Manual */}
              {(addMode === 'manual' || !!editItem) && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">اسم المنتج (عربي)</label>
                      <input value={form.name_ar} onChange={inp('name_ar')} placeholder="باراسيتامول"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">اسم المنتج (إنجليزي)</label>
                      <input value={form.name} onChange={inp('name')} placeholder="Paracetamol 500mg"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">رقم الدفعة</label>
                      <input value={form.batch_number} onChange={inp('batch_number')} placeholder="BATCH-2024-001"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ الانتهاء</label>
                      <input type="date" value={form.expiry_date} onChange={inp('expiry_date')}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">الكمية</label>
                      <input type="number" min="0" value={form.quantity} onChange={inp('quantity')}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">حد إعادة الطلب</label>
                      <input type="number" min="0" value={form.reorder_level} onChange={inp('reorder_level')}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                  </div>

                  {/* Discount type selector */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">نوع الخصم</label>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => setForm((p: any) => ({ ...p, discount_type: 'percent', gift_pct: '0' }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors border ${form.discount_type === 'percent' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        خصم %
                      </button>
                      <button type="button"
                        onClick={() => setForm((p: any) => ({ ...p, discount_type: 'gift', discount: '0' }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors border ${form.discount_type === 'gift' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        🎁 هدية (وحدات مجانية)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">سعر البيع للصيدلية (د.ع)</label>
                      <input type="number" min="0" value={form.unit_price} onChange={inp('unit_price')}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-600 mb-1">سعر الشراء (د.ع)</label>
                      <input type="number" min="0" value={form.buying_price} onChange={inp('buying_price')} placeholder="للمستودع فقط"
                        className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" />
                    </div>
                    {form.discount_type === 'percent' ? (
                      <div>
                        <label className="block text-xs font-medium text-emerald-700 mb-1">نسبة الخصم %</label>
                        <input type="number" min="0" max="99" value={form.discount} onChange={inp('discount')} placeholder="0"
                          className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-amber-700 mb-2">🎁 نسبة الهدية</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" value={form.gift_free} onChange={inp('gift_free')} placeholder="1"
                            className="w-20 border border-amber-200 rounded-xl px-3 py-2 text-sm text-center outline-none focus:border-amber-400" />
                          <span className="text-sm text-gray-500 font-medium">مجاناً لكل</span>
                          <input type="number" min="1" value={form.gift_per} onChange={inp('gift_per')} placeholder="10"
                            className="w-20 border border-amber-200 rounded-xl px-3 py-2 text-sm text-center outline-none focus:border-amber-400" />
                          <span className="text-sm text-gray-500">وحدة</span>
                        </div>
                        {Number(form.gift_free) > 0 && Number(form.gift_per) > 0 && Number(form.unit_price) > 0 && (
                          <p className="text-xs text-amber-600 mt-2">
                            سعر الشراء الفعلي للصيدلية: {(Number(form.unit_price) / (1 + Number(form.gift_free)/Number(form.gift_per))).toFixed(0)} د.ع/وحدة
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Min order rule */}
                  <div className="border border-indigo-100 bg-indigo-50 rounded-xl p-4">
                    <label className="block text-xs font-semibold text-indigo-700 mb-2">📦 قاعدة الحد الأدنى للطلب</label>
                    <div className="flex gap-2 mb-3">
                      {([['free','بلا قيد'],['min','حد أدنى'],['step','مضاعفات']] as const).map(([k,l]) => (
                        <button key={k} type="button"
                          onClick={() => setForm((p: any) => ({ ...p, min_order_type: k }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${form.min_order_type === k ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {form.min_order_type !== 'free' && (
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" value={form.min_order_qty}
                          onChange={e => setForm((p: any) => ({ ...p, min_order_qty: e.target.value }))}
                          className="w-24 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm text-center outline-none focus:border-indigo-400" />
                        <span className="text-xs text-gray-600">
                          {form.min_order_type === 'min'
                            ? `وحدة — الحد الأدنى للطلب`
                            : `وحدة — الطلب يجب أن يكون مضاعفاً لهذا الرقم (${form.min_order_qty}, ${Number(form.min_order_qty)*2}, ${Number(form.min_order_qty)*3}...)`}
                        </span>
                      </div>
                    )}
                    {form.min_order_type === 'free' && <p className="text-xs text-gray-500">الصيدلية يمكنها طلب أي كمية</p>}
                  </div>

                  {customCols.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-xs font-semibold text-gray-500 mb-3">أعمدة إضافية</p>
                      <div className="grid grid-cols-2 gap-3">
                        {customCols.map(c => (
                          <div key={c.key}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">{c.label}</label>
                            <input
                              value={customValues[c.key] || ''}
                              onChange={e => setCustomValues(p => ({ ...p, [c.key]: e.target.value }))}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
              )}

              {/* CSV */}
              {addMode === 'csv' && !editItem && (
                <div className="space-y-4">
                  <div onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-amber-300 rounded-2xl p-8 text-center cursor-pointer hover:bg-amber-50 transition-colors">
                    <Upload className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-gray-700">انقر لاختيار ملف CSV</p>
                    <p className="text-xs text-gray-400 mt-1">يجب أن يحتوي على: name, name_ar, quantity, unit_price</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
                  <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700">
                    <strong>رؤوس الأعمدة المقبولة:</strong>&nbsp;
                    name, name_ar, batch_number, quantity, reorder_level, unit_price, buying_price, discount, expiry_date
                  </div>
                  {csvError && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl">{csvError}</p>}
                  {csvRows.length > 0 && (
                    <>
                      <p className="text-sm font-semibold text-gray-700">{csvRows.length} صنف — معاينة:</p>
                      <div className="overflow-x-auto max-h-60 border rounded-xl">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>{['الاسم','الاسم العربي','الكمية','السعر','الخصم%','الانتهاء'].map(h => (
                              <th key={h} className="px-3 py-2 text-right font-semibold text-gray-500">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {csvRows.slice(0,10).map((r, i) => (
                              <tr key={i}>
                                <td className="px-3 py-1.5">{r.name||r['اسم المنتج (إنجليزي)']}</td>
                                <td className="px-3 py-1.5">{r.name_ar||r['اسم المنتج']||r['اسم المنتج (عربي)']}</td>
                                <td className="px-3 py-1.5">{r.quantity||r['الكمية']}</td>
                                <td className="px-3 py-1.5">{r.unit_price||r['سعر البيع']}</td>
                                <td className="px-3 py-1.5">{r.discount||r['الخصم']||0}%</td>
                                <td className="px-3 py-1.5">{r.expiry_date||r['تاريخ الانتهاء']||'—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {csvRows.length > 10 && <p className="text-center text-xs text-gray-400 py-2">و{csvRows.length-10} صنف آخر</p>}
                      </div>
                      <button onClick={importCsv} disabled={csvImporting}
                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                        {csvImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        استيراد {csvRows.length} صنف
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Restock */}
              {addMode === 'restock' && !editItem && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">أدخل الكمية الإضافية لكل صنف. اتركها فارغة لتجاهلها.</p>
                  {items.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">لا توجد أصناف مسجلة بعد</p>
                  ) : (
                    <>
                      <div className="max-h-96 overflow-y-auto space-y-2 border rounded-xl p-3">
                        {items.map(item => (
                          <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{item.name_ar || item.name}</p>
                              <p className="text-xs text-gray-400">الكمية الحالية: {item.quantity.toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-gray-400">+ إضافة:</span>
                              <input type="number" min="0" placeholder="0"
                                value={restockQtys[item.id] || ''}
                                onChange={e => setRestockQtys(p => ({ ...p, [item.id]: e.target.value }))}
                                className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-amber-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={saveRestock}
                        disabled={restockSaving || Object.values(restockQtys).every(v => !Number(v))}
                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                        {restockSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        حفظ الكميات
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Price / Discount Modal ──────────────────────────────────────── */}
      {priceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Tag className="w-4 h-4 text-emerald-600" /> تعديل السعر والخصم</h2>
                <p className="text-xs text-gray-400 mt-0.5">{priceModal.name_ar || priceModal.name}</p>
              </div>
              <button onClick={() => setPriceModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">سعر البيع للصيدلية (د.ع)</label>
                  <input type="number" min="0" value={priceForm.unit_price}
                    onChange={e => setPriceForm(p => ({ ...p, unit_price: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-600 mb-1">سعر الشراء من المورد (د.ع)</label>
                  <input type="number" min="0" value={priceForm.buying_price}
                    onChange={e => setPriceForm(p => ({ ...p, buying_price: e.target.value }))}
                    placeholder="للمستودع فقط"
                    className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400" />
                </div>
              </div>

              {/* Discount type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">نوع الخصم</label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setPriceForm(p => ({ ...p, discount_type: 'percent', gift_pct: '0' }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${priceForm.discount_type === 'percent' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    خصم %
                  </button>
                  <button type="button"
                    onClick={() => setPriceForm(p => ({ ...p, discount_type: 'gift', discount: '0' }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${priceForm.discount_type === 'gift' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    🎁 هدية
                  </button>
                </div>
              </div>

              {priceForm.discount_type === 'percent' ? (
                <div>
                  <label className="block text-xs font-medium text-emerald-700 mb-1">نسبة الخصم %</label>
                  <input type="number" min="0" max="99" value={priceForm.discount}
                    onChange={e => setPriceForm(p => ({ ...p, discount: e.target.value }))}
                    className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400" />
                  {Number(priceForm.discount) > 0 && Number(priceForm.unit_price) > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">
                      سعر الصيدلية بعد الخصم: {(Number(priceForm.unit_price) * (1 - Number(priceForm.discount)/100)).toFixed(0)} د.ع
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-amber-700 mb-2">🎁 نسبة الهدية</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" value={priceForm.gift_free}
                      onChange={e => setPriceForm(p => ({ ...p, gift_free: e.target.value }))}
                      placeholder="1"
                      className="w-20 border border-amber-200 rounded-xl px-3 py-2.5 text-sm font-bold text-center outline-none focus:border-amber-400" />
                    <span className="text-sm text-gray-500 font-medium">مجاناً لكل</span>
                    <input type="number" min="1" value={priceForm.gift_per}
                      onChange={e => setPriceForm(p => ({ ...p, gift_per: e.target.value }))}
                      placeholder="10"
                      className="w-20 border border-amber-200 rounded-xl px-3 py-2.5 text-sm font-bold text-center outline-none focus:border-amber-400" />
                    <span className="text-sm text-gray-500">وحدة</span>
                  </div>
                  {Number(priceForm.gift_free) > 0 && Number(priceForm.gift_per) > 0 && Number(priceForm.unit_price) > 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      سعر الشراء الفعلي للصيدلية: {(Number(priceForm.unit_price) / (1 + Number(priceForm.gift_free)/Number(priceForm.gift_per))).toFixed(0)} د.ع/وحدة
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={savePriceEdit} disabled={priceSaving || !priceForm.unit_price}
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm">
                  {priceSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  حفظ التغييرات
                </button>
                <button onClick={() => setPriceModal(null)}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Column Manager Modal ───────────────────────────────────────────────── */}
      {showColMgr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">إدارة الأعمدة الإضافية</h2>
              <button onClick={() => setShowColMgr(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {customCols.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">لا توجد أعمدة إضافية بعد</p>
              ) : (
                <div className="space-y-2">
                  {customCols.map(c => (
                    <div key={c.key} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                        <p className="text-xs text-gray-400 font-mono">{c.key}</p>
                      </div>
                      <button onClick={() => removeCustomCol(c.key)} className="p-1.5 text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600">إضافة عمود جديد</p>
                <input value={newColLabel} onChange={e => setNewColLabel(e.target.value)}
                  placeholder="مثال: سعر المريض، رقم التسجيل..."
                  onKeyDown={e => e.key === 'Enter' && addCustomCol()}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                <button onClick={addCustomCol} disabled={!newColLabel.trim()}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> إضافة العمود
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
