'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, AlertTriangle, Package, Settings2, Camera, X,
  Sun, Snowflake, ChevronDown, ShoppingCart, RefreshCw, Edit3, QrCode, PenLine, Trash2,
} from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';
const LIMITS_KEY = 'pharmacy-stock-limits';
const SEASON_KEY = 'pharmacy-season-config';
const ORDERS_KEY = 'pharmacy-reorder-log';
const MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DEFAULT_SUMMER = [5,6,7,8,9];

type Mode = null | 'choose' | 'update' | 'scan' | 'manual';

function getSeasonConfig() {
  try { const s = localStorage.getItem(SEASON_KEY); if (s) return JSON.parse(s); } catch {}
  return { summerMonths: DEFAULT_SUMMER };
}
function getCurrentSeason(): 'summer' | 'winter' {
  const month = new Date().getMonth() + 1;
  return getSeasonConfig().summerMonths.includes(month) ? 'summer' : 'winter';
}
function getItemLimits(): Record<string, { summer: number; winter: number }> {
  try { return JSON.parse(localStorage.getItem(LIMITS_KEY) || '{}'); } catch { return {}; }
}
function saveItemLimits(l: Record<string, { summer: number; winter: number }>) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify(l));
}

export default function InventoryPage() {
  const router = useRouter();
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // modal mode
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── ADD form (manual + scan result)
  const [form, setForm] = useState({ genericName: '', brandName: '', barcode: '', quantity: '', sellingPrice: '', reorderLevel: '10' });
  const [drugSuggestions, setDrugSuggestions] = useState<any[]>([]);
  const [drugSearching, setDrugSearching] = useState(false);

  // ── UPDATE form
  const [updateSearch, setUpdateSearch] = useState('');
  const [updateItem, setUpdateItem] = useState<any>(null);
  const [updateQty, setUpdateQty] = useState('');
  const [updatePrice, setUpdatePrice] = useState('');

  // ── SCAN
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanLoopRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  // ── Seasonal
  const [itemLimits, setItemLimits] = useState<Record<string, { summer: number; winter: number }>>({});
  const [season, setSeason] = useState<'summer' | 'winter'>('summer');
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [tempSummer, setTempSummer] = useState<number[]>(DEFAULT_SUMMER);
  const [editLimitItem, setEditLimitItem] = useState<any>(null);
  const [editSummer, setEditSummer] = useState('');
  const [editWinter, setEditWinter] = useState('');
  const [alertItems, setAlertItems] = useState<any[]>([]);
  const [orderItem, setOrderItem] = useState<any>(null);
  const [orderWarehouse, setOrderWarehouse] = useState('');
  const [orderQty, setOrderQty] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [orderSent, setOrderSent] = useState(false);

  useEffect(() => {
    const cfg = getSeasonConfig();
    setTempSummer(cfg.summerMonths);
    setSeason(getCurrentSeason());
    setItemLimits(getItemLimits());
  }, []);

  const fetchInventory = useCallback(() => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!pharmacyId) { setLoading(false); return; }
    setLoading(true);
    fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory?search=${encodeURIComponent(search)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (r.status === 401) {
          localStorage.removeItem('pharmacy-token');
          localStorage.removeItem('pharmacy-id');
          router.push('/auth/login');
          return null;
        }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        const items = d.data || [];
        setInventory(items);
        const limits = getItemLimits();
        const cur = getCurrentSeason();
        setAlertItems(items.filter((item: any) => {
          const lim = limits[item.id];
          if (!lim) return false;
          const thr = cur === 'summer' ? lim.summer : lim.winter;
          return thr > 0 && (item.quantity - (item.reserved_qty || 0)) <= thr;
        }));
      })
      .catch(() => setInventory([]))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  // ────────────────────────────────────────────────────────────────────────────
  // Drug catalog search (for manual add)
  const searchDrugs = async (q: string) => {
    setForm(f => ({ ...f, genericName: q }));
    if (!q || q.length < 2) { setDrugSuggestions([]); return; }
    setDrugSearching(true);
    try {
      const r = await fetch(`${PHARMACY_API}/pharmacies/drugs/search?q=${encodeURIComponent(q)}&limit=6`);
      const d = await r.json();
      setDrugSuggestions(d.data || []);
    } catch { setDrugSuggestions([]); }
    setDrugSearching(false);
  };

  const pickDrug = (drug: any) => {
    setForm(f => ({ ...f, genericName: drug.generic_name, brandName: drug.brand_name || '', barcode: drug.barcode || '' }));
    setDrugSuggestions([]);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Barcode scanner
  const startScan = async () => {
    setScanStatus('جاري فتح الكاميرا...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      // wait a tick for video element to mount
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);

      if ('BarcodeDetector' in window) {
        setScanStatus('وجّه الكاميرا نحو الباركود');
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'],
        });
        detectorRef.current = detector;
        const loop = async () => {
          if (!videoRef.current || !detectorRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const code = codes[0].rawValue;
              stopScan();
              setForm(f => ({ ...f, barcode: code }));
              setScanStatus('');
              // lookup
              const r = await fetch(`${PHARMACY_API}/pharmacies/drugs/search?q=${encodeURIComponent(code)}&limit=1`);
              const d = await r.json();
              if (d.data?.length) {
                const drug = d.data[0];
                setForm(f => ({ ...f, genericName: drug.generic_name, brandName: drug.brand_name || '', barcode: drug.barcode || code }));
              }
              setMode('manual'); // show form with pre-filled data
            } else {
              scanLoopRef.current = requestAnimationFrame(loop);
            }
          } catch { scanLoopRef.current = requestAnimationFrame(loop); }
        };
        scanLoopRef.current = requestAnimationFrame(loop);
      } else {
        setScanStatus('المتصفح لا يدعم المسح التلقائي. أدخل الباركود يدوياً أدناه.');
      }
    } catch {
      setScanStatus('');
      setScanning(false);
      setSaveError('لا يمكن الوصول للكاميرا. تأكد من منح الإذن أو استخدم الإدخال اليدوي.');
      setMode('manual');
    }
  };

  const stopScan = () => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    detectorRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScanning(false);
  };

  // Start camera immediately when entering scan mode
  useEffect(() => {
    if (mode === 'scan') startScan();
    if (mode !== 'scan') stopScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => () => stopScan(), []);

  // ────────────────────────────────────────────────────────────────────────────
  // Submit: ADD (manual / scan result)
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!form.genericName.trim()) { setSaveError('أدخل اسم الدواء'); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { setSaveError('أدخل كمية صحيحة'); return; }
    if (!form.sellingPrice || Number(form.sellingPrice) < 0) { setSaveError('أدخل سعر البيع'); return; }
    setSaving(true);
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    const res = await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        genericName: form.genericName.trim(),
        brandName: form.brandName.trim(),
        barcode: form.barcode.trim() || null,
        quantity: Number(form.quantity),
        sellingPrice: Number(form.sellingPrice),
        reorderLevel: Number(form.reorderLevel) || 10,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.status === 401) {
      localStorage.removeItem('pharmacy-token');
      localStorage.removeItem('pharmacy-id');
      router.push('/auth/login');
      return;
    }
    if (!res.ok) { setSaveError(data?.error?.title || data?.error || 'فشلت العملية'); return; }
    closeModal();
    fetchInventory();
  };

  // Submit: UPDATE existing stock item
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateItem) return;
    setSaveError('');
    if (!updateQty && !updatePrice) { setSaveError('أدخل الكمية أو السعر'); return; }
    setSaving(true);
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    const body: any = {};
    if (updateQty) body.quantity = Number(updateQty);
    if (updatePrice) body.sellingPrice = Number(updatePrice);
    const res = await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory/${updateItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveError(data?.error?.title || 'فشل التحديث'); return; }
    closeModal();
    fetchInventory();
  };

  const closeModal = () => {
    setMode(null);
    setSaveError('');
    setSaving(false);
    setForm({ genericName:'', brandName:'', barcode:'', quantity:'', sellingPrice:'', reorderLevel:'10' });
    setDrugSuggestions([]);
    setUpdateSearch('');
    setUpdateItem(null);
    setUpdateQty('');
    setUpdatePrice('');
    stopScan();
    setScanStatus('');
  };

  const openUpdate = (item: any) => {
    setMode('update');
    setUpdateItem(item);
    setUpdateQty(String(item.quantity));
    setUpdatePrice(String(item.selling_price || ''));
    setUpdateSearch(item.generic_name || '');
    setSaveError('');
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Seasonal helpers
  const saveSeasonConfig = () => {
    localStorage.setItem(SEASON_KEY, JSON.stringify({ summerMonths: tempSummer }));
    setSeason(getCurrentSeason());
    setShowSeasonModal(false);
  };
  const openEditLimit = (item: any) => {
    const ex = itemLimits[item.id] || { summer: 0, winter: 0 };
    setEditSummer(String(ex.summer || ''));
    setEditWinter(String(ex.winter || ''));
    setEditLimitItem(item);
  };
  const saveItemLimit = () => {
    if (!editLimitItem) return;
    const updated = { ...itemLimits, [editLimitItem.id]: { summer: Number(editSummer)||0, winter: Number(editWinter)||0 } };
    setItemLimits(updated);
    saveItemLimits(updated);
    setEditLimitItem(null);
    fetchInventory();
  };
  const sendOrder = () => {
    if (!orderItem || !orderWarehouse || !orderQty) return;
    const log = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    log.unshift({ id: Date.now().toString(), drugName: orderItem.generic_name || orderItem.brand_name, warehouse: orderWarehouse, quantity: Number(orderQty), note: orderNote, season, sentAt: new Date().toLocaleString('ar-IQ'), status: 'pending' });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(log.slice(0,100)));
    setOrderSent(true);
    setTimeout(() => { setOrderItem(null); setOrderWarehouse(''); setOrderQty(''); setOrderNote(''); setOrderSent(false); setAlertItems(prev => prev.filter(i => i.id !== orderItem?.id)); }, 2000);
  };

  const seasonLabel = season === 'summer' ? 'الصيف' : 'الشتاء';
  const SeasonIcon = season === 'summer' ? Sun : Snowflake;
  const seasonColor = season === 'summer' ? 'text-orange-500 bg-orange-50' : 'text-sky-600 bg-sky-50';
  const filteredInventory = inventory.filter(i =>
    !updateSearch || (i.generic_name||'').toLowerCase().includes(updateSearch.toLowerCase()) || (i.brand_name||'').toLowerCase().includes(updateSearch.toLowerCase())
  );

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">
      {alertItems.length > 0 && !orderItem && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800">{alertItems.length} {alertItems.length===1?'دواء وصل':'أدوية وصلت'} لحد الطلب ({seasonLabel})</p>
              <p className="text-xs text-red-600 mt-0.5">{alertItems.map(i => i.generic_name||i.brand_name).join(' • ')}</p>
            </div>
          </div>
          <button onClick={() => setOrderItem(alertItems[0])} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <ShoppingCart className="w-4 h-4" /> طلب من مستودع
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-900">إدارة المخزون</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSeasonModal(true)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${seasonColor} border border-current/20`}>
            <SeasonIcon className="w-4 h-4" />{seasonLabel}<ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          <button onClick={fetchInventory} disabled={loading} className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setMode('choose')} className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-medium px-4 py-2 rounded-xl text-sm">
            <Plus className="w-4 h-4" /> إضافة / تحديث دواء
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 max-w-md">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن دواء..." className="bg-transparent flex-1 outline-none text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['الدواء','الكمية',`حد ${seasonLabel}`,'السعر','الحالة','إجراءات'].map(h => (
                <th key={h} className="text-right text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">جاري التحميل...</td></tr>
            ) : inventory.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />لا توجد منتجات في المخزون
              </td></tr>
            ) : inventory.map(item => {
              const available = item.quantity - (item.reserved_qty || 0);
              const limits = itemLimits[item.id] || { summer:0, winter:0 };
              const activeLimit = season === 'summer' ? limits.summer : limits.winter;
              const isLow = activeLimit > 0 && available <= activeLimit;
              const isAlert = alertItems.some(a => a.id === item.id);
              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${isAlert ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.generic_name || '—'}</p>
                    <p className="text-xs text-gray-500">{item.brand_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{available}</span>
                    <span className="text-xs text-gray-400 mr-1">متاح</span>
                  </td>
                  <td className="px-4 py-3">
                    {activeLimit > 0 ? <span className={`text-sm font-medium ${isLow ? 'text-red-600' : 'text-gray-600'}`}>{activeLimit}</span> : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{Number(item.selling_price).toLocaleString()} د.ع</td>
                  <td className="px-4 py-3">
                    {isLow ? (
                      <button onClick={() => setOrderItem(item)} className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> طلب مستودع
                      </button>
                    ) : <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">متوفر</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openUpdate(item)} title="تحديث" className="p-1.5 hover:bg-sky-50 rounded-lg text-sky-600">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditLimit(item)} title="حدود الموسم" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button onClick={async () => {
                        if (!confirm('حذف هذا الدواء من المخزون؟')) return;
                        const token = localStorage.getItem('pharmacy-token');
                        const pharmacyId = localStorage.getItem('pharmacy-id');
                        await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory/${item.id}`, {
                          method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
                        });
                        fetchInventory();
                      }} title="حذف" className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL OVERLAY
      ═══════════════════════════════════════════════════════════════════════ */}
      {mode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" dir="rtl">

            {/* ── CHOOSE ── */}
            {mode === 'choose' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-gray-900 text-lg">ماذا تريد أن تفعل؟</h3>
                  <button onClick={closeModal}><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-3">
                  <button onClick={() => { setMode('update'); setSaveError(''); }}
                    className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 hover:border-sky-400 hover:bg-sky-50 rounded-2xl text-right transition-all group">
                    <div className="w-12 h-12 bg-sky-100 group-hover:bg-sky-200 rounded-xl flex items-center justify-center shrink-0">
                      <Edit3 className="w-6 h-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">تحديث دواء موجود</p>
                      <p className="text-sm text-gray-500 mt-0.5">تغيير الكمية أو السعر لدواء في مخزونك</p>
                    </div>
                  </button>

                  <button onClick={() => setMode('scan')}
                    className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 rounded-2xl text-right transition-all group">
                    <div className="w-12 h-12 bg-green-100 group-hover:bg-green-200 rounded-xl flex items-center justify-center shrink-0">
                      <QrCode className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">إضافة جديد — مسح باركود</p>
                      <p className="text-sm text-gray-500 mt-0.5">افتح الكاميرا وامسح الباركود مباشرة</p>
                    </div>
                  </button>

                  <button onClick={() => setMode('manual')}
                    className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl text-right transition-all group">
                    <div className="w-12 h-12 bg-purple-100 group-hover:bg-purple-200 rounded-xl flex items-center justify-center shrink-0">
                      <PenLine className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">إضافة جديد — يدوياً</p>
                      <p className="text-sm text-gray-500 mt-0.5">أدخل اسم الدواء أو ابحث في الكتالوج</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ── UPDATE EXISTING ── */}
            {mode === 'update' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">تحديث دواء موجود</h3>
                    {!updateItem && <p className="text-sm text-gray-400 mt-0.5">ابحث واختر الدواء أولاً</p>}
                  </div>
                  <button onClick={closeModal}><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                {saveError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{saveError}</div>}

                {/* Search inventory */}
                {!updateItem ? (
                  <div>
                    <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5 mb-3">
                      <Search className="w-4 h-4 text-gray-400 shrink-0" />
                      <input value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} autoFocus
                        placeholder="ابحث في مخزونك..." className="bg-transparent flex-1 outline-none text-sm" />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {filteredInventory.length === 0
                        ? <p className="text-center text-gray-400 text-sm py-6">لا توجد نتائج</p>
                        : filteredInventory.map(item => (
                          <button key={item.id} onClick={() => { setUpdateItem(item); setUpdateQty(String(item.quantity)); setUpdatePrice(String(item.selling_price||'')); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 text-right">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{item.generic_name||'—'}</p>
                              <p className="text-xs text-gray-400">{item.brand_name}</p>
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold text-gray-700">{item.quantity} قطعة</p>
                              <p className="text-xs text-gray-400">{Number(item.selling_price).toLocaleString()} د.ع</p>
                            </div>
                          </button>
                        ))
                      }
                    </div>
                    <button onClick={() => setMode('choose')} className="mt-4 w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">رجوع</button>
                  </div>
                ) : (
                  <form onSubmit={handleUpdate} className="space-y-4">
                    {/* Selected drug */}
                    <div className="bg-sky-50 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sky-800">{updateItem.generic_name||'—'}</p>
                        <p className="text-xs text-sky-600">{updateItem.brand_name}</p>
                      </div>
                      <button type="button" onClick={() => setUpdateItem(null)} className="text-sky-400 hover:text-sky-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الكمية الجديدة</label>
                        <input type="number" min="0" value={updateQty} onChange={e => setUpdateQty(e.target.value)}
                          placeholder={String(updateItem.quantity)}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع (د.ع)</label>
                        <input type="number" min="0" value={updatePrice} onChange={e => setUpdatePrice(e.target.value)}
                          placeholder={String(updateItem.selling_price||0)}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button type="button" onClick={() => setUpdateItem(null)}
                        className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">رجوع</button>
                      <button type="submit" disabled={saving}
                        className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                        {saving ? 'جاري الحفظ...' : 'حفظ التحديث'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ── SCAN ── */}
            {mode === 'scan' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 text-lg">مسح الباركود</h3>
                  <button onClick={closeModal}><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                {/* Camera view */}
                <div className="relative rounded-2xl overflow-hidden bg-black mb-4" style={{ aspectRatio:'4/3' }}>
                  {scanning ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      {/* Scan frame overlay */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-56 h-32 relative">
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
                          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-400 opacity-80 animate-pulse" />
                        </div>
                      </div>
                      {scanStatus && (
                        <div className="absolute bottom-3 left-0 right-0 text-center">
                          <span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">{scanStatus}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">جاري تشغيل الكاميرا...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual barcode entry as fallback */}
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 text-center">أو أدخل الباركود يدوياً</p>
                  <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                    placeholder="رقم الباركود"
                    dir="ltr"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-center tracking-wider" />
                  <div className="flex gap-3">
                    <button onClick={() => setMode('choose')} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">رجوع</button>
                    <button onClick={() => { stopScan(); setMode('manual'); }}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold">
                      متابعة يدوياً
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── MANUAL FORM (also used after scan) ── */}
            {mode === 'manual' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-gray-900 text-lg">
                    {form.barcode ? 'إضافة دواء — باركود مُسح' : 'إضافة دواء — يدوياً'}
                  </h3>
                  <button onClick={closeModal}><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                {saveError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{saveError}</div>}

                <form onSubmit={handleAdd} className="space-y-4">
                  {/* Show scanned barcode if available */}
                  {form.barcode && (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                      <QrCode className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm font-mono text-green-800 flex-1">{form.barcode}</span>
                      <button type="button" onClick={() => setMode('scan')} className="text-green-600 text-xs hover:underline">إعادة المسح</button>
                    </div>
                  )}

                  {/* Drug name with catalog autocomplete */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">اسم الدواء *</label>
                    <input value={form.genericName} onChange={e => searchDrugs(e.target.value)} autoFocus={!form.genericName}
                      placeholder="مثال: باراسيتامول أو Paracetamol"
                      required
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    {drugSearching && <p className="text-xs text-gray-400 mt-1">جاري البحث في الكتالوج...</p>}
                    {drugSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                        {drugSuggestions.map(drug => (
                          <button key={drug.id} type="button" onClick={() => pickDrug(drug)}
                            className="w-full text-right px-4 py-2.5 hover:bg-sky-50 text-sm border-b border-gray-100 last:border-0">
                            <p className="font-medium text-gray-900">{drug.generic_name}</p>
                            {drug.brand_name && <p className="text-xs text-gray-500">{drug.brand_name} · {drug.dosage_form} {drug.strength}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الاسم التجاري (اختياري)</label>
                    <input value={form.brandName} onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))}
                      placeholder="مثال: بنادول"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>

                  {!form.barcode && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الباركود (اختياري)</label>
                      <div className="flex gap-2">
                        <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                          placeholder="رقم الباركود" dir="ltr"
                          className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        <button type="button" onClick={() => setMode('scan')}
                          className="flex items-center gap-1 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700">
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الكمية *</label>
                      <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                        placeholder="100" required
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع (د.ع) *</label>
                      <input type="number" min="0" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                        placeholder="5000" required
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setMode('choose')}
                      className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">رجوع</button>
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                      {saving ? 'جاري الإضافة...' : 'إضافة للمخزون'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Season modal */}
      {showSeasonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">إعداد الموسم</h2>
              <button onClick={() => setShowSeasonModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">اختر الأشهر التي تعدّها <span className="font-bold text-orange-500">صيفاً</span></p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {MONTH_NAMES.map((name, i) => {
                const month = i+1;
                const isSummer = tempSummer.includes(month);
                return (
                  <button key={month} type="button"
                    onClick={() => setTempSummer(prev => isSummer ? prev.filter(m => m!==month) : [...prev, month].sort((a,b)=>a-b))}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${isSummer ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-sky-50 border-sky-300 text-sky-700'}`}>
                    {isSummer ? <Sun className="w-3 h-3 inline ml-1" /> : <Snowflake className="w-3 h-3 inline ml-1" />}{name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSeasonModal(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={saveSeasonConfig} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold">حفظ</button>
            </div>
          </div>
        </div>
      )}

      {/* Limit editor */}
      {editLimitItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">حدود المخزون الموسمية</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editLimitItem.generic_name||editLimitItem.brand_name}</p>
              </div>
              <button onClick={() => setEditLimitItem(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-orange-50 rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-orange-700 mb-2"><Sun className="w-4 h-4" /> حد الصيف</label>
                <input type="number" min="0" value={editSummer} onChange={e => setEditSummer(e.target.value)} placeholder="0"
                  className="w-full px-4 py-2.5 border border-orange-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
              </div>
              <div className="bg-sky-50 rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-sky-700 mb-2"><Snowflake className="w-4 h-4" /> حد الشتاء</label>
                <input type="number" min="0" value={editWinter} onChange={e => setEditWinter(e.target.value)} placeholder="0"
                  className="w-full px-4 py-2.5 border border-sky-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditLimitItem(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={saveItemLimit} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold">حفظ الحدود</button>
            </div>
          </div>
        </div>
      )}

      {/* Order modal */}
      {orderItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            {orderSent ? (
              <div className="text-center py-6">
                <ShoppingCart className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-bold text-gray-900">تم إرسال طلب الشراء</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">طلب شراء من مستودع</h2>
                  <button onClick={() => setOrderItem(null)}><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">اسم المستودع *</label>
                    <input value={orderWarehouse} onChange={e => setOrderWarehouse(e.target.value)} placeholder="مثال: مستودع الأمانة الطبية"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الكمية المطلوبة *</label>
                    <input type="number" min="1" value={orderQty} onChange={e => setOrderQty(e.target.value)} placeholder="50"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                    <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} rows={2}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setOrderItem(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
                  <button onClick={sendOrder} disabled={!orderWarehouse||!orderQty}
                    className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50">
                    إرسال الطلب
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
