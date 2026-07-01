'use client';
import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, AlertTriangle, Package, Settings2, Barcode, ShoppingCart, X, Sun, Snowflake, ChevronDown } from 'lucide-react';

const PHARMACY_API = process.env.NEXT_PUBLIC_PHARMACY_API_URL || 'https://mediflow-production-d815.up.railway.app/api/v1';
const LIMITS_KEY = 'pharmacy-stock-limits';
const SEASON_KEY = 'pharmacy-season-config';
const ORDERS_KEY = 'pharmacy-reorder-log';

const MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DEFAULT_SUMMER = [5, 6, 7, 8, 9]; // May–Sep

function getSeasonConfig(): { summerMonths: number[] } {
  try {
    const s = localStorage.getItem(SEASON_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return { summerMonths: DEFAULT_SUMMER };
}

function getCurrentSeason(): 'summer' | 'winter' {
  const month = new Date().getMonth() + 1;
  const { summerMonths } = getSeasonConfig();
  return summerMonths.includes(month) ? 'summer' : 'winter';
}

function getItemLimits(): Record<string, { summer: number; winter: number }> {
  try { return JSON.parse(localStorage.getItem(LIMITS_KEY) || '{}'); } catch { return {}; }
}

function saveItemLimits(limits: Record<string, { summer: number; winter: number }>) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify(limits));
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ drugId: '', quantity: '', sellingPrice: '', reorderLevel: '10' });
  const [addMode, setAddMode] = useState<'new' | 'update'>('new');
  const [existingItem, setExistingItem] = useState<any | null>(null);
  const [existingChecking, setExistingChecking] = useState(false);
  const [addQty, setAddQty] = useState('');
  const [drugSearch, setDrugSearch] = useState('');
  const [drugResults, setDrugResults] = useState<any[]>([]);
  const [selectedDrug, setSelectedDrug] = useState<any | null>(null);
  const [drugSearching, setDrugSearching] = useState(false);

  // Seasonal limits
  const [itemLimits, setItemLimits] = useState<Record<string, { summer: number; winter: number }>>({});
  const [season, setSeason] = useState<'summer' | 'winter'>('summer');
  const [seasonConfig, setSeasonConfig] = useState<{ summerMonths: number[] }>({ summerMonths: DEFAULT_SUMMER });
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [tempSummer, setTempSummer] = useState<number[]>(DEFAULT_SUMMER);

  // Per-item limit editor
  const [editLimitItem, setEditLimitItem] = useState<any | null>(null);
  const [editSummer, setEditSummer] = useState('');
  const [editWinter, setEditWinter] = useState('');

  // Low-stock alert popup
  const [alertItems, setAlertItems] = useState<any[]>([]);
  const [orderItem, setOrderItem] = useState<any | null>(null);
  const [orderWarehouse, setOrderWarehouse] = useState('');
  const [orderQty, setOrderQty] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [orderSent, setOrderSent] = useState(false);

  useEffect(() => {
    const cfg = getSeasonConfig();
    setSeasonConfig(cfg);
    setTempSummer(cfg.summerMonths);
    setSeason(getCurrentSeason());
    setItemLimits(getItemLimits());
  }, []);

  const fetchInventory = useCallback(() => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!pharmacyId) { setLoading(false); return; }
    fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory?search=${search}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        const items = d.data || [];
        setInventory(items);
        // Check for low stock based on seasonal limits
        const limits = getItemLimits();
        const currentSeason = getCurrentSeason();
        const below = items.filter((item: any) => {
          const limit = limits[item.id];
          if (!limit) return false;
          const threshold = currentSeason === 'summer' ? limit.summer : limit.winter;
          if (!threshold) return false;
          const available = item.quantity - (item.reserved_qty || 0);
          return available <= threshold;
        });
        if (below.length > 0) setAlertItems(below);
      })
      .catch(() => setInventory([]))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const checkExistingDrug = async (drugId: string) => {
    if (!drugId) { setExistingItem(null); return; }
    setExistingChecking(true);
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    try {
      const r = await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory?search=${drugId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      const found = (d.data || []).find((i: any) => i.drug_id === drugId || i.id === drugId);
      setExistingItem(found || null);
    } catch { setExistingItem(null); }
    setExistingChecking(false);
  };

  const searchDrugs = async (q: string) => {
    setDrugSearch(q);
    setSelectedDrug(null);
    setForm(f => ({ ...f, drugId: '' }));
    if (!q || q.length < 2) { setDrugResults([]); return; }
    setDrugSearching(true);
    try {
      const r = await fetch(`${PHARMACY_API}/pharmacies/drugs/search?q=${encodeURIComponent(q)}&limit=8`);
      const d = await r.json();
      setDrugResults(d.data || []);
    } catch { setDrugResults([]); }
    setDrugSearching(false);
  };

  const pickDrug = (drug: any) => {
    setSelectedDrug(drug);
    setForm(f => ({ ...f, drugId: drug.id }));
    setDrugSearch(drug.generic_name || drug.brand_name);
    setDrugResults([]);
    checkExistingDrug(drug.id);
  };

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
    setForm({ drugId: '', quantity: '', sellingPrice: '', reorderLevel: '10' });
    setExistingItem(null);
    fetchInventory();
  };

  const handleUpdateQty = async () => {
    if (!existingItem || !addQty) return;
    setSaving(true);
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    const newQty = existingItem.quantity + Number(addQty);
    await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory/${existingItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quantity: newQty }),
    }).catch(() => {});
    setSaving(false);
    setShowAdd(false);
    setExistingItem(null);
    setAddQty('');
    setForm({ drugId: '', quantity: '', sellingPrice: '', reorderLevel: '10' });
    fetchInventory();
  };

  const saveSeasonConfig = () => {
    const cfg = { summerMonths: tempSummer };
    localStorage.setItem(SEASON_KEY, JSON.stringify(cfg));
    setSeasonConfig(cfg);
    setSeason(getCurrentSeason());
    setShowSeasonModal(false);
  };

  const openEditLimit = (item: any) => {
    const existing = itemLimits[item.id] || { summer: 0, winter: 0 };
    setEditSummer(String(existing.summer || ''));
    setEditWinter(String(existing.winter || ''));
    setEditLimitItem(item);
  };

  const saveItemLimit = () => {
    if (!editLimitItem) return;
    const updated = { ...itemLimits, [editLimitItem.id]: { summer: Number(editSummer) || 0, winter: Number(editWinter) || 0 } };
    setItemLimits(updated);
    saveItemLimits(updated);
    setEditLimitItem(null);
    fetchInventory();
  };

  const sendOrder = () => {
    if (!orderItem || !orderWarehouse || !orderQty) return;
    const log = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    log.unshift({
      id: Date.now().toString(),
      drugName: orderItem.generic_name || orderItem.brand_name,
      warehouse: orderWarehouse,
      quantity: Number(orderQty),
      note: orderNote,
      season,
      sentAt: new Date().toLocaleString('ar-IQ'),
      status: 'pending',
    });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(log.slice(0, 100)));
    setOrderSent(true);
    setTimeout(() => {
      setOrderItem(null);
      setOrderWarehouse('');
      setOrderQty('');
      setOrderNote('');
      setOrderSent(false);
      setAlertItems(prev => prev.filter(i => i.id !== orderItem?.id));
    }, 2000);
  };

  const seasonLabel = season === 'summer' ? 'الصيف' : 'الشتاء';
  const SeasonIcon = season === 'summer' ? Sun : Snowflake;
  const seasonColor = season === 'summer' ? 'text-orange-500 bg-orange-50' : 'text-sky-600 bg-sky-50';

  return (
    <div className="space-y-6" dir="rtl">

      {/* Low-stock alert banner */}
      {alertItems.length > 0 && !orderItem && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800">
                {alertItems.length} {alertItems.length === 1 ? 'دواء وصل' : 'أدوية وصلت'} لحد الطلب ({seasonLabel})
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {alertItems.map(i => i.generic_name || i.brand_name).join(' • ')}
              </p>
            </div>
          </div>
          <button onClick={() => setOrderItem(alertItems[0])}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <ShoppingCart className="w-4 h-4" /> طلب من مستودع
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-900">إدارة المخزون</h2>
        <div className="flex items-center gap-2">
          {/* Season badge */}
          <button onClick={() => setShowSeasonModal(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${seasonColor} border border-current/20`}>
            <SeasonIcon className="w-4 h-4" />
            {seasonLabel}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-medium px-4 py-2 rounded-xl text-sm">
            <Plus className="w-4 h-4" /> إضافة منتج
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 max-w-md">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن دواء..." className="bg-transparent flex-1 outline-none text-sm" />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">الدواء</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">الكمية</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                حد {seasonLabel}
              </th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">السعر</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">الحالة</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">إعدادات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">جاري التحميل...</td></tr>
            ) : inventory.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                لا توجد منتجات في المخزون
              </td></tr>
            ) : inventory.map(item => {
              const available = item.quantity - (item.reserved_qty || 0);
              const limits = itemLimits[item.id] || { summer: 0, winter: 0 };
              const activeLimit = season === 'summer' ? limits.summer : limits.winter;
              const isLow = activeLimit > 0 && available <= activeLimit;
              const isAlert = alertItems.some(a => a.id === item.id);
              return (
                <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isAlert ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.generic_name}</p>
                    <p className="text-xs text-gray-500">{item.brand_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                      {available}
                    </span>
                    <span className="text-xs text-gray-400 mr-1">متاح</span>
                  </td>
                  <td className="px-4 py-3">
                    {activeLimit > 0 ? (
                      <span className={`text-sm font-medium ${isLow ? 'text-red-600' : 'text-gray-600'}`}>
                        {activeLimit}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {Number(item.selling_price).toLocaleString()} د.ع
                  </td>
                  <td className="px-4 py-3">
                    {isLow ? (
                      <button onClick={() => setOrderItem(item)}
                        className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-full transition-colors">
                        <AlertTriangle className="w-3 h-3" /> طلب مستودع
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">متوفر</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEditLimit(item)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                      title="إعداد حدود الموسم">
                      <Settings2 className="w-4 h-4 text-gray-500" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Season Config Modal ── */}
      {showSeasonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">إعداد الموسم</h2>
              <button onClick={() => setShowSeasonModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">اختر الأشهر التي تعدّها <span className="font-bold text-orange-500">صيفاً</span> — الباقي سيكون <span className="font-bold text-sky-600">شتاءً</span> تلقائياً.</p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {MONTH_NAMES.map((name, i) => {
                const month = i + 1;
                const isSummer = tempSummer.includes(month);
                return (
                  <button key={month}
                    onClick={() => setTempSummer(prev => isSummer ? prev.filter(m => m !== month) : [...prev, month].sort((a,b)=>a-b))}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      isSummer
                        ? 'bg-orange-50 border-orange-400 text-orange-700'
                        : 'bg-sky-50 border-sky-300 text-sky-700'
                    }`}>
                    {isSummer ? <Sun className="w-3 h-3 inline ml-1" /> : <Snowflake className="w-3 h-3 inline ml-1" />}
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
              <span className="flex items-center gap-1"><Snowflake className="w-3 h-3 text-sky-500" /> شتاء: {12 - tempSummer.length} شهر</span>
              <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-orange-500" /> صيف: {tempSummer.length} أشهر</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSeasonModal(false)}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={saveSeasonConfig}
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold">حفظ</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Per-item Limit Editor ── */}
      {editLimitItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">حدود المخزون الموسمية</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editLimitItem.generic_name || editLimitItem.brand_name}</p>
              </div>
              <button onClick={() => setEditLimitItem(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4 bg-gray-50 rounded-xl px-3 py-2">
              عند وصول الكمية المتاحة إلى هذا الحد أو أقل، يظهر تنبيه تلقائي للطلب من المستودع.
            </p>
            <div className="space-y-4">
              <div className="bg-orange-50 rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-orange-700 mb-2">
                  <Sun className="w-4 h-4" /> حد الصيف (أدنى كمية)
                </label>
                <input type="number" min="0" value={editSummer}
                  onChange={e => setEditSummer(e.target.value)}
                  placeholder="مثال: 20"
                  className="w-full px-4 py-2.5 border border-orange-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
              </div>
              <div className="bg-sky-50 rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-sky-700 mb-2">
                  <Snowflake className="w-4 h-4" /> حد الشتاء (أدنى كمية)
                </label>
                <input type="number" min="0" value={editWinter}
                  onChange={e => setEditWinter(e.target.value)}
                  placeholder="مثال: 10"
                  className="w-full px-4 py-2.5 border border-sky-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditLimitItem(null)}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={saveItemLimit}
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold">حفظ الحدود</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order from Warehouse Popup ── */}
      {orderItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            {orderSent ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShoppingCart className="w-7 h-7 text-green-600" />
                </div>
                <p className="text-lg font-bold text-gray-900">تم إرسال طلب الشراء</p>
                <p className="text-sm text-gray-500 mt-1">سيتواصل معك المستودع قريباً</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">طلب شراء من مستودع</h2>
                    <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      {orderItem.generic_name || orderItem.brand_name} — الكمية المتاحة: {(orderItem.quantity - (orderItem.reserved_qty || 0))}
                    </p>
                  </div>
                  <button onClick={() => setOrderItem(null)}><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                {/* Alert items selector if multiple */}
                {alertItems.length > 1 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">الدواء</label>
                    <div className="flex flex-wrap gap-2">
                      {alertItems.map(item => (
                        <button key={item.id} onClick={() => setOrderItem(item)}
                          className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                            orderItem.id === item.id ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600'
                          }`}>
                          {item.generic_name || item.brand_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم المستودع *</label>
                    <input value={orderWarehouse} onChange={e => setOrderWarehouse(e.target.value)}
                      placeholder="مثال: مستودع الأمانة الطبية"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">الكمية المطلوبة *</label>
                    <input type="number" min="1" value={orderQty} onChange={e => setOrderQty(e.target.value)}
                      placeholder="مثال: 50"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">ملاحظات (اختياري)</label>
                    <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} rows={2}
                      placeholder="أي تفاصيل إضافية..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
                  </div>
                </div>

                <div className="mt-4 bg-gray-50 rounded-xl px-4 py-2 flex items-center justify-between text-xs text-gray-500">
                  <span>الموسم الحالي:</span>
                  <span className={`flex items-center gap-1 font-medium ${season === 'summer' ? 'text-orange-600' : 'text-sky-600'}`}>
                    {season === 'summer' ? <Sun className="w-3.5 h-3.5" /> : <Snowflake className="w-3.5 h-3.5" />}
                    {season === 'summer' ? 'الصيف' : 'الشتاء'}
                  </span>
                </div>

                <div className="flex gap-3 mt-5">
                  <button onClick={() => setOrderItem(null)}
                    className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
                  <button onClick={sendOrder} disabled={!orderWarehouse || !orderQty}
                    className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                    <ShoppingCart className="w-4 h-4" /> إرسال الطلب
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add / Update Product Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">إدارة المخزون</h3>
              <button onClick={() => { setShowAdd(false); setExistingItem(null); setAddQty(''); setForm({ drugId: '', quantity: '', sellingPrice: '', reorderLevel: '10' }); setDrugSearch(''); setDrugResults([]); setSelectedDrug(null); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
              <button onClick={() => { setAddMode('new'); setExistingItem(null); setForm({ drugId: '', quantity: '', sellingPrice: '', reorderLevel: '10' }); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${addMode === 'new' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500'}`}>
                ➕ إضافة منتج جديد
              </button>
              <button onClick={() => { setAddMode('update'); setExistingItem(null); setForm(f => ({ ...f, drugId: '' })); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${addMode === 'update' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500'}`}>
                🔄 تحديث كمية موجودة
              </button>
            </div>

            {addMode === 'update' ? (
              /* ── Update existing quantity ── */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-gray-400" /> معرّف الدواء (مسح أو يدوي)
                  </label>
                  <input value={form.drugId}
                    onChange={e => { setForm({ ...form, drugId: e.target.value }); setExistingItem(null); }}
                    onBlur={e => checkExistingDrug(e.target.value)}
                    placeholder="امسح الباركود أو أدخل UUID الدواء"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    dir="ltr" />
                  {existingChecking && <p className="text-xs text-gray-400 mt-1">جاري البحث...</p>}
                </div>

                {existingItem ? (
                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{existingItem.generic_name || existingItem.brand_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">الكمية الحالية: <span className="font-bold text-sky-700">{existingItem.quantity}</span></p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الكمية المضافة</label>
                      <input type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)}
                        placeholder="مثال: 50"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      {addQty && (
                        <p className="text-xs text-green-600 mt-1 font-medium">
                          الكمية بعد الإضافة: {existingItem.quantity + Number(addQty)}
                        </p>
                      )}
                    </div>
                    <button onClick={handleUpdateQty} disabled={saving || !addQty}
                      className="w-full bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                      {saving ? 'جاري الحفظ...' : 'تحديث الكمية'}
                    </button>
                  </div>
                ) : form.drugId && !existingChecking ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    لم يُعثر على هذا الدواء في مخزونك — يمكنك إضافته كمنتج جديد.
                  </div>
                ) : null}
              </div>
            ) : (
            /* ── Add new product ── */
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الدواء</label>
                <input value={drugSearch}
                  onChange={e => searchDrugs(e.target.value)}
                  placeholder="ابحث باسم الدواء..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required={!form.drugId} />
                {drugSearching && <p className="text-xs text-gray-400 mt-1">جاري البحث...</p>}
                {drugResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {drugResults.map(drug => (
                      <button key={drug.id} type="button" onClick={() => pickDrug(drug)}
                        className="w-full text-right px-4 py-2.5 hover:bg-sky-50 text-sm border-b border-gray-100 last:border-0">
                        <p className="font-medium text-gray-900">{drug.generic_name}</p>
                        <p className="text-xs text-gray-500">{drug.brand_name} · {drug.dosage_form} {drug.strength}</p>
                      </button>
                    ))}
                  </div>
                )}
                {drugSearch.length >= 2 && !drugSearching && drugResults.length === 0 && !selectedDrug && (
                  <p className="text-xs text-amber-600 mt-1">لم يُعثر على دواء بهذا الاسم</p>
                )}
                {selectedDrug && (
                  <div className="mt-1 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-xs text-sky-800">
                    ✓ {selectedDrug.generic_name} — {selectedDrug.brand_name}
                    {selectedDrug.requires_prescription && <span className="mr-2 text-amber-600">يستلزم وصفة</span>}
                  </div>
                )}
                {existingItem && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
                    <span>هذا الدواء موجود بالفعل — الكمية: {existingItem.quantity}</span>
                    <button type="button" onClick={() => setAddMode('update')} className="text-sky-600 font-medium underline mr-2">إضافة كمية؟</button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الكمية</label>
                  <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع (د.ع)</label>
                  <input type="number" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-orange-50 rounded-xl p-3">
                  <label className="flex items-center gap-1 text-xs font-semibold text-orange-700 mb-1.5">
                    <Sun className="w-3.5 h-3.5" /> حد الصيف
                  </label>
                  <input type="number" min="0" defaultValue=""
                    id="new-summer-limit" placeholder="0"
                    className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white" />
                </div>
                <div className="bg-sky-50 rounded-xl p-3">
                  <label className="flex items-center gap-1 text-xs font-semibold text-sky-700 mb-1.5">
                    <Snowflake className="w-3.5 h-3.5" /> حد الشتاء
                  </label>
                  <input type="number" min="0" defaultValue=""
                    id="new-winter-limit" placeholder="0"
                    className="w-full px-3 py-2 border border-sky-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
                <button type="submit" disabled={saving}
                  onClick={() => {
                    // capture seasonal limits before submit
                    const sl = (document.getElementById('new-summer-limit') as HTMLInputElement)?.value;
                    const wl = (document.getElementById('new-winter-limit') as HTMLInputElement)?.value;
                    if (form.drugId && (sl || wl)) {
                      // will be saved after we get the item id from response — store pending
                      localStorage.setItem('pharmacy-pending-limits', JSON.stringify({ summer: Number(sl)||0, winter: Number(wl)||0 }));
                    }
                  }}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                  {saving ? 'جاري الحفظ...' : 'إضافة'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
