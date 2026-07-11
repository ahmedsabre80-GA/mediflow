'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useRouter, useSearchParams } from 'next/navigation';
import DraggableModal from '@/components/DraggableModal';
import {
  Search, Plus, AlertTriangle, Package, Settings2, Camera, X,
  Sun, Snowflake, ChevronDown, ShoppingCart, RefreshCw, Edit3, QrCode, PenLine, Trash2,
} from 'lucide-react';
import WarehouseTab from './WarehouseTab';

const BAT_KEY = 'pharmacy-stock-batches';
const EXPIRY_WARN_KEY = 'pharmacy-expiry-warn-days';

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

function InventoryPage() {
  const router = useRouter();
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // modal mode
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── ADD form (manual + scan result)
  const [form, setForm] = useState({ genericName: '', brandName: '', barcode: '', pkgQty: '', sheetsPerPkg: '', quantity: '', sellingPrice: '', buyingPrice: '', reorderLevel: '10', expiryDate: '', originCountry: '', category: '', warehouseId: '' });
  const [formWarehouses, setFormWarehouses] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    try { setFormWarehouses(JSON.parse(localStorage.getItem('pharmacy-warehouses') || '[]')); } catch {}
  }, []);
  const [userRole, setUserRole] = useState<string>('owner');
  const canSeeBuyingPrice = ['owner', 'assistant_manager', 'pharmacist'].includes(userRole);
  const [drugSuggestions, setDrugSuggestions] = useState<any[]>([]);
  const [drugSearching, setDrugSearching] = useState(false);


  // ── UPDATE form
  const [updateSearch, setUpdateSearch] = useState('');
  const [updateItem, setUpdateItem] = useState<any>(null);
  const [updateQty, setUpdateQty] = useState('');
  const [updatePrice, setUpdatePrice] = useState('');
  const [updatePkgQty, setUpdatePkgQty] = useState('');
  const [updateSheetsPerPkg, setUpdateSheetsPerPkg] = useState('');

  // ── SCAN
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanActiveRef = useRef(false);
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
    setUserRole(localStorage.getItem('pharmacy-role') || 'owner');
  }, []);

  const [localItems, setLocalItems] = useState<any[]>([]);

  const buildLocalItems = (apiItems: any[]) => {
    try {
      let batches: any[] = JSON.parse(localStorage.getItem(BAT_KEY) || '[]');

      // Backfill category/originCountry from purchase records for batches that are missing them
      const needsBackfill = batches.some(b => !b.category && !b.originCountry);
      if (needsBackfill) {
        try {
          const purchases: any[] = JSON.parse(localStorage.getItem('pharmacy-wh-purchases') || '[]');
          const purchaseMap = new Map<string, any>();
          purchases.forEach(p => {
            (p.invoices || []).forEach((inv: any) => {
              (inv.items || []).forEach((it: any) => {
                if (it.category || it.originCountry) {
                  const key = `${p.id}__${(it.drugName || '').toLowerCase().trim()}`;
                  purchaseMap.set(key, it);
                }
              });
            });
          });
          let changed = false;
          batches = batches.map(b => {
            if (b.category || b.originCountry) return b;
            const key = `${b.purchaseId}__${(b.drugName || '').toLowerCase().trim()}`;
            const src = purchaseMap.get(key);
            if (!src) return b;
            changed = true;
            return { ...b, category: src.category || '', originCountry: src.originCountry || '' };
          });
          if (changed) localStorage.setItem(BAT_KEY, JSON.stringify(batches));
        } catch {}
      }
      const apiNames = new Set(apiItems.map((i: any) => (i.generic_name || i.drug_name || '').toLowerCase().trim()));

      // Group batches by drugName; skip drugs already in API
      const map = new Map<string, any>();
      batches.forEach(b => {
        if (!b.drugName) return;
        const key = b.drugName.toLowerCase().trim();
        if (apiNames.has(key)) return; // API already has it
        if (!map.has(key)) {
          map.set(key, {
            id: `_local_${key}`,
            generic_name: b.drugName,
            brand_name: b.brandName || '',
            barcode: b.barcode || '',
            quantity: 0,
            reserved_qty: 0,
            selling_price: b.sellingPrice || 0,
            buying_price: b.unitCost || 0,
            category: b.category || '',
            expiry_date: b.expiry || '',
            origin_country: b.originCountry || '',
            _local: true,
          });
        }
        const entry = map.get(key)!;
        entry.quantity += b.qtyRemaining || 0;
        // Keep the nearest expiry
        if (b.expiry && (!entry.expiry_date || new Date(b.expiry) < new Date(entry.expiry_date))) {
          entry.expiry_date = b.expiry;
        }
        if (!entry.selling_price && b.sellingPrice) entry.selling_price = b.sellingPrice;
        if (!entry.buying_price && b.unitCost) entry.buying_price = b.unitCost;
        if (!entry.barcode && b.barcode) entry.barcode = b.barcode;
      });

      // Apply search filter
      const q = search.toLowerCase().trim();
      const items = Array.from(map.values()).filter(item =>
        !q || item.generic_name.toLowerCase().includes(q) || item.brand_name.toLowerCase().includes(q) || (item.barcode || '').includes(q)
      );
      setLocalItems(items);
    } catch { setLocalItems([]); }
  };

  const fetchInventory = useCallback(() => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!pharmacyId) { setLoading(false); buildLocalItems([]); return; }
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
        const raw: any[] = d.data || [];
        // Deduplicate by generic_name (sum quantities when same drug has multiple stock rows)
        const deduped = new Map<string, any>();
        raw.forEach((item: any) => {
          const key = (item.generic_name || '').toLowerCase().trim();
          if (deduped.has(key)) {
            const ex = deduped.get(key)!;
            ex.quantity = (ex.quantity || 0) + (item.quantity || 0);
            ex.reserved_qty = (ex.reserved_qty || 0) + (item.reserved_qty || 0);
          } else {
            deduped.set(key, { ...item });
          }
        });
        const items = Array.from(deduped.values());
        setInventory(items);
        buildLocalItems(items);
        const limits = getItemLimits();
        const cur = getCurrentSeason();
        setAlertItems(items.filter((item: any) => {
          const lim = limits[item.id];
          if (!lim) return false;
          const thr = cur === 'summer' ? lim.summer : lim.winter;
          return thr > 0 && (item.quantity - (item.reserved_qty || 0)) <= thr;
        }));
      })
      .catch(() => { setInventory([]); buildLocalItems([]); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  // Auto-sync localStorage batches to backend once per device
  useEffect(() => {
    const SYNC_FLAG = 'pharmacy-batches-synced-v1';
    if (localStorage.getItem(SYNC_FLAG)) return;
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!token || !pharmacyId) return;
    try {
      const batches: any[] = JSON.parse(localStorage.getItem(BAT_KEY) || '[]');
      if (batches.length === 0) { localStorage.setItem(SYNC_FLAG, '1'); return; }
      (async () => {
        for (const b of batches) {
          await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              genericName: b.drugName,
              brandName: b.brandName || '',
              barcode: b.barcode || null,
              quantity: b.qtyRemaining,
              sellingPrice: b.sellingPrice || 0,
              reorderLevel: 10,
              expiryDate: b.expiry || null,
              originCountry: b.originCountry || '',
              category: b.category || '',
              buyingPrice: b.unitCost || undefined,
            }),
          }).catch(() => {});
        }
        localStorage.setItem(SYNC_FLAG, '1');
        fetchInventory();
      })();
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Barcode scanner using ZXing (works on Windows Chrome, Firefox, Safari)
  const startScan = async () => {
    setScanStatus('جاري فتح الكاميرا...');
    setScanning(true);
    scanActiveRef.current = true;

    // Wait for the video element to mount
    await new Promise<void>(resolve => setTimeout(resolve, 150));

    const video = videoRef.current;
    if (!video) { setScanning(false); scanActiveRef.current = false; return; }

    try {
      const reader = new BrowserMultiFormatReader();
      zxingReaderRef.current = reader;

      setScanStatus('وجّه الكاميرا نحو الباركود');

      await reader.decodeFromVideoDevice(undefined, video, async (result) => {
        // Guard: ignore callbacks that fire after we already got a result or stopped
        if (!scanActiveRef.current) return;
        if (result) {
          scanActiveRef.current = false;
          const code = result.getText();
          stopScan();
          setForm(f => ({ ...f, barcode: code }));
          setScanStatus('');
          // lookup drug in catalog
          try {
            const r = await fetch(`${PHARMACY_API}/pharmacies/drugs/search?q=${encodeURIComponent(code)}&limit=1`);
            const d = await r.json();
            if (d.data?.length) {
              const drug = d.data[0];
              setForm(f => ({ ...f, genericName: drug.generic_name, brandName: drug.brand_name || '', barcode: drug.barcode || code }));
            }
          } catch {}
          setMode('manual');
        }
      });
    } catch {
      setScanning(false);
      scanActiveRef.current = false;
      setSaveError('لا يمكن الوصول للكاميرا. تأكد من منح الإذن أو استخدم الإدخال اليدوي.');
      setMode('manual');
    }
  };

  const stopScan = () => {
    scanActiveRef.current = false;
    if (zxingReaderRef.current) {
      // @ts-ignore
      zxingReaderRef.current.reset?.();
      zxingReaderRef.current = null;
    }
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
    // Resolve quantity: if pkgQty entered, derive from packages × sheets; else use quantity directly
    const sheetsPerPkg = Number(form.sheetsPerPkg) || 1;
    const pkgQty = Number(form.pkgQty) || 0;
    const resolvedQty = pkgQty > 0 ? pkgQty * sheetsPerPkg : Number(form.quantity);
    const resolvedBuyingPrice = pkgQty > 0 && form.buyingPrice
      ? (Number(form.buyingPrice) / sheetsPerPkg)
      : Number(form.buyingPrice);
    if (resolvedQty <= 0) { setSaveError('أدخل عدد العبوات أو الكمية'); return; }
    if (!form.sellingPrice || Number(form.sellingPrice) < 0) { setSaveError('أدخل سعر البيع'); return; }
    if (!form.expiryDate) { setSaveError('أدخل تاريخ انتهاء الصلاحية'); return; }
    if (!form.originCountry.trim()) { setSaveError('اختر بلد المنشأ'); return; }
    if (!form.category.trim()) { setSaveError('اختر تصنيف الدواء'); return; }
    if (canSeeBuyingPrice && (!form.buyingPrice || Number(form.buyingPrice) < 0)) { setSaveError('أدخل سعر الشراء للعبوة'); return; }
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
        quantity: resolvedQty,
        sellingPrice: Number(form.sellingPrice),
        reorderLevel: Number(form.reorderLevel) || 10,
        expiryDate: form.expiryDate,
        originCountry: form.originCountry.trim(),
        category: form.category.trim(),
        buyingPrice: form.buyingPrice ? resolvedBuyingPrice : undefined,
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

    // Link to warehouse via local stock batch if a warehouse was selected
    if (form.warehouseId && form.buyingPrice) {
      try {
        const wh = formWarehouses.find(w => w.id === form.warehouseId);
        const purchases: any[] = JSON.parse(localStorage.getItem('pharmacy-wh-purchases') || '[]');
        const batchId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const purchaseId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const newPurchase = {
          id: purchaseId, warehouseId: form.warehouseId, warehouseName: wh?.name || '',
          invoices: [{ id: batchId, discountType: 'none', totalDiscount: 0, subtotal: resolvedBuyingPrice * resolvedQty,
            items: [{ drugName: form.genericName.trim(), pkgQty, sheetsPerPkg, qty: resolvedQty, unitCost: resolvedBuyingPrice, itemDiscount: 0, finalUnitCost: resolvedBuyingPrice, totalCost: resolvedBuyingPrice * resolvedQty, expiry: form.expiryDate }],
            image: '' }],
          grandTotal: resolvedBuyingPrice * resolvedQty,
          date: new Date().toISOString(), notes: 'أضيف يدوياً من المخزون',
        };
        purchases.push(newPurchase);
        localStorage.setItem('pharmacy-wh-purchases', JSON.stringify(purchases));

        const batches: any[] = JSON.parse(localStorage.getItem('pharmacy-stock-batches') || '[]');
        batches.push({ id: batchId, drugName: form.genericName.trim(), qtyRemaining: resolvedQty, unitCost: resolvedBuyingPrice, purchaseId, purchaseDate: new Date().toISOString(), expiry: form.expiryDate });
        localStorage.setItem('pharmacy-stock-batches', JSON.stringify(batches));
      } catch {}
    }

    closeModal();
    fetchInventory();
  };

  // Submit: UPDATE existing stock item
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateItem) return;
    setSaveError('');
    const updSheetsPerPkg = Number(updateSheetsPerPkg) || 1;
    const updPkgQty = Number(updatePkgQty) || 0;
    const resolvedUpdateQty = updPkgQty > 0 ? updPkgQty * updSheetsPerPkg : Number(updateQty) || 0;
    if (!resolvedUpdateQty && !updatePrice) { setSaveError('أدخل الكمية أو السعر'); return; }
    setSaving(true);
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    const body: any = {};
    if (resolvedUpdateQty) body.quantity = resolvedUpdateQty;
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
    setForm({ genericName:'', brandName:'', barcode:'', pkgQty:'', sheetsPerPkg:'', quantity:'', sellingPrice:'', buyingPrice:'', reorderLevel:'10', expiryDate:'', originCountry:'', category:'', warehouseId:'' });
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

  const [mainTab, setMainTab] = useState<'inventory' | 'warehouses'>('inventory');
  const [drugWarehouseMap, setDrugWarehouseMap] = useState<Record<string, string>>({});

  // Expiry filter (from dashboard banner links)
  const searchParams = useSearchParams();
  const [expiryFilter, setExpiryFilter] = useState<'expiring' | 'expired' | null>(null);
  const [expiryBatches, setExpiryBatches] = useState<any[]>([]);

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f !== 'expiring' && f !== 'expired') return;
    setExpiryFilter(f);

    const now = Date.now();
    const warnDays = Number(localStorage.getItem(EXPIRY_WARN_KEY)) || 30;
    const rows: any[] = [];

    // From localStorage batches
    try {
      const batches: any[] = JSON.parse(localStorage.getItem(BAT_KEY) || '[]');
      batches.forEach(b => {
        if (!b.expiry || (b.qtyRemaining ?? 0) <= 0) return;
        const days = Math.ceil((new Date(b.expiry).getTime() - now) / 86400000);
        const match = f === 'expired' ? days <= 0 : (days > 0 && days <= warnDays);
        if (match) rows.push({ drugName: b.drugName, brandName: b.brandName || '', barcode: b.barcode || '', qtyRemaining: b.qtyRemaining, expiry: b.expiry, source: 'local' });
      });
    } catch {}

    rows.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    setExpiryBatches(rows);

    // Also fetch from API inventory
    const token      = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id') || '';
    if (!pharmacyId || !token) return;
    fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        const apiRows: any[] = [];
        (d.data || []).forEach((item: any) => {
          const expiry = item.expiry_date || item.expiryDate || '';
          if (!expiry || (item.quantity ?? item.total_qty ?? 0) <= 0) return;
          const days = Math.ceil((new Date(expiry).getTime() - now) / 86400000);
          const match = f === 'expired' ? days <= 0 : (days > 0 && days <= warnDays);
          if (match) apiRows.push({ drugName: item.generic_name || item.drug_name || '', brandName: item.brand_name || '', barcode: item.barcode || '', qtyRemaining: item.quantity ?? item.total_qty ?? 0, expiry, source: 'api' });
        });
        setExpiryBatches(prev => {
          const existingNames = new Set(prev.map((r: any) => (r.drugName || '').toLowerCase().trim()));
          const newRows = apiRows.filter(r => !existingNames.has((r.drugName || '').toLowerCase().trim()));
          const combined = [...prev, ...newRows];
          combined.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
          return combined;
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const buildMap = (purchases: any[]) => {
      try {
        const batches: any[] = JSON.parse(localStorage.getItem('pharmacy-stock-batches') || '[]');
        const purMap: Record<string, string> = {};
        purchases.forEach((p: any) => { purMap[p.id] = p.warehouseName; });
        const map: Record<string, string> = {};
        [...batches].reverse().forEach((b: any) => {
          if (b.drugName && b.purchaseId && purMap[b.purchaseId] && !map[b.drugName.toLowerCase()]) {
            map[b.drugName.toLowerCase()] = purMap[b.purchaseId];
          }
        });
        setDrugWarehouseMap(map);
      } catch {}
    };

    try {
      const purchases: any[] = JSON.parse(localStorage.getItem('pharmacy-wh-purchases') || '[]');
      if (purchases.length > 0) {
        buildMap(purchases);
      } else {
        // localStorage empty — pull from backend
        const token = localStorage.getItem('pharmacy-token');
        const pharmacyId = localStorage.getItem('pharmacy-id');
        if (token && pharmacyId) {
          fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/state/wh-purchases`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.json()).then(d => {
            if (d.success && Array.isArray(d.data) && d.data.length > 0) {
              localStorage.setItem('pharmacy-wh-purchases', JSON.stringify(d.data));
              buildMap(d.data);
            }
          }).catch(() => {});
        }
      }
    } catch {}
  }, [mainTab]);

  // ────────────────────────────────────────────────────────────────────────────
  // ── Expiry filter view (from dashboard banner) ───────────────────────────
  if (expiryFilter) {
    const isExpired = expiryFilter === 'expired';
    const now = Date.now();
    return (
      <div className="space-y-4" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setExpiryFilter(null)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${isExpired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            <AlertTriangle className="w-4 h-4" />
            {isExpired ? `الأدوية المنتهية الصلاحية (${expiryBatches.length})` : `الأدوية القريبة من الانتهاء (${expiryBatches.length})`}
          </div>
        </div>

        {expiryBatches.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-400 shadow-sm">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{isExpired ? 'لا توجد أدوية منتهية الصلاحية' : 'لا توجد أدوية قريبة من الانتهاء'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '600px' }}>
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {['اسم الدواء', 'الاسم التجاري', 'الباركود', 'الكمية المتبقية', 'تاريخ الانتهاء', 'الحالة'].map(h => (
                      <th key={h} className="text-right text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {expiryBatches.map((b, i) => {
                    const days = Math.ceil((new Date(b.expiry).getTime() - now) / 86400000);
                    return (
                      <tr key={i} className={isExpired ? 'bg-red-50/40' : 'bg-amber-50/30'}>
                        <td className="px-4 py-3 font-medium text-gray-900">{b.drugName}</td>
                        <td className="px-4 py-3 text-gray-500">{b.brandName || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{b.barcode || '—'}</td>
                        <td className="px-4 py-3 font-bold text-center">{b.qtyRemaining}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{b.expiry}</td>
                        <td className="px-4 py-3 text-center">
                          {isExpired
                            ? <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">منتهي منذ {Math.abs(days)} يوم</span>
                            : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">ينتهي خلال {days} يوم</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        {([['inventory','📦 المخزون'],['warehouses','🏭 المستودعات']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setMainTab(tab)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${mainTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {mainTab === 'warehouses' && <WarehouseTab />}
      {mainTab === 'inventory' && <>
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
        <div className="overflow-x-auto" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 310px)' }}>
        <table className="w-full" style={{ minWidth: '950px' }}>
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              {['الباركود','الدواء','الكمية',`حد ${seasonLabel}`,...(canSeeBuyingPrice ? ['سعر الشراء/قطعة'] : []),'سعر البيع/قطعة','المستودع','التصنيف','الصلاحية','المنشأ','الحالة','إجراءات'].map(h => (
                <th key={h} className="text-right text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">جاري التحميل...</td></tr>
            ) : inventory.length === 0 && localItems.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />لا توجد منتجات في المخزون
              </td></tr>
            ) : [...inventory, ...localItems].map(item => {
              const available = item.quantity - (item.reserved_qty || 0);
              const limits = itemLimits[item.id] || { summer:0, winter:0 };
              const activeLimit = season === 'summer' ? limits.summer : limits.winter;
              const isLow = activeLimit > 0 && available <= activeLimit;
              const isAlert = alertItems.some(a => a.id === item.id);
              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${isAlert ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    {item.barcode
                      ? <span className="text-xs font-mono text-gray-500 tracking-wider" dir="ltr">{item.barcode}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900">{item.generic_name || '—'}</p>
                      {item._local && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">مستودع</span>}
                    </div>
                    <p className="text-xs text-gray-500">{item.brand_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{available}</span>
                    <span className="text-xs text-gray-400 mr-1">متاح</span>
                  </td>
                  <td className="px-4 py-3">
                    {activeLimit > 0 ? <span className={`text-sm font-medium ${isLow ? 'text-red-600' : 'text-gray-600'}`}>{activeLimit}</span> : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  {canSeeBuyingPrice && (
                    <td className="px-4 py-3 text-sm font-medium text-orange-600">
                      {item.buying_price ? `${Number(item.buying_price).toLocaleString()} د.ع` : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm font-medium text-sky-700">{Number(item.selling_price).toLocaleString()} د.ع</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const wh = drugWarehouseMap[(item.generic_name || '').toLowerCase()] || drugWarehouseMap[(item.brand_name || '').toLowerCase()];
                      return wh ? <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{wh}</span> : <span className="text-gray-300 text-xs">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {item.category
                      ? <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{item.category}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {item.expiry_date ? (() => {
                      const d = new Date(item.expiry_date);
                      const isExpired = d < new Date();
                      const isSoon = !isExpired && (d.getTime() - Date.now()) < 90*24*60*60*1000;
                      return <span className={`font-medium ${isExpired ? 'text-red-600' : isSoon ? 'text-orange-500' : 'text-gray-700'}`}>{d.toLocaleDateString('ar-IQ')}</span>;
                    })() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.origin_country || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {isLow ? (
                      <button onClick={() => setOrderItem(item)} className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> طلب مستودع
                      </button>
                    ) : <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">متوفر</span>}
                  </td>
                  <td className="px-4 py-3">
                    {item._local ? (
                      <div className="flex gap-1">
                        <button onClick={() => openUpdate(item)} title="تعديل" className="p-1.5 hover:bg-sky-50 rounded-lg text-sky-600">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEditLimit(item)} title="حدود الموسم" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => {
                          if (!confirm(`حذف "${item.generic_name}" من المخزون المحلي؟`)) return;
                          const key = (item.generic_name || '').toLowerCase().trim();
                          try {
                            const batches: any[] = JSON.parse(localStorage.getItem(BAT_KEY) || '[]');
                            localStorage.setItem(BAT_KEY, JSON.stringify(batches.filter((b: any) => (b.drugName || '').toLowerCase().trim() !== key)));
                          } catch {}
                          fetchInventory();
                        }} title="حذف" className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
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
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL OVERLAY
      ═══════════════════════════════════════════════════════════════════════ */}
      <DraggableModal open={!!mode} onClose={closeModal} title={mode === 'update' ? 'تحديث المخزون' : mode === 'scan' ? 'مسح باركود' : mode === 'manual' ? 'إضافة دواء جديد' : 'اختر نوع العملية'} initialWidth={480}>
        <div dir="rtl">

            {/* ── CHOOSE ── */}
            {mode === 'choose' && (
              <div className="p-6 space-y-3">
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
            )}

            {/* ── UPDATE EXISTING ── */}
            {mode === 'update' && (
              <div className="px-6 pt-4 pb-6">
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

                    {/* Package quantity entry */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">عدد العبوات</label>
                        <input type="number" min="1" value={updatePkgQty} onChange={e => { setUpdatePkgQty(e.target.value); setUpdateQty(''); }}
                          placeholder="10"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">قطعة/علبة</label>
                        <input type="number" min="1" value={updateSheetsPerPkg} onChange={e => setUpdateSheetsPerPkg(e.target.value)}
                          placeholder="4"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">أو الكمية مباشرة</label>
                        <input type="number" min="0" value={updateQty} onChange={e => { setUpdateQty(e.target.value); setUpdatePkgQty(''); }}
                          placeholder={String(updateItem.quantity)}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      </div>
                    </div>

                    {updatePkgQty && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center text-xs">
                        <p className="text-gray-500 mb-0.5">إجمالي القطع</p>
                        <p className="font-bold text-blue-700 text-base">
                          {(Number(updatePkgQty) * (Number(updateSheetsPerPkg) || 1)).toLocaleString('ar-IQ')} قطعة
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع/قطعة (د.ع)</label>
                      <input type="number" min="0" value={updatePrice} onChange={e => setUpdatePrice(e.target.value)}
                        placeholder={String(updateItem.selling_price||0)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
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
              <div className="px-6 pt-4 pb-6">

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
              <div className="px-6 pt-4 pb-6">

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

                  {/* Package entry */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">عدد العبوات</label>
                      <input type="number" min="1" value={form.pkgQty} onChange={e => setForm(f => ({ ...f, pkgQty: e.target.value }))}
                        placeholder="10"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">قطعة/علبة</label>
                      <input type="number" min="1" value={form.sheetsPerPkg} onChange={e => setForm(f => ({ ...f, sheetsPerPkg: e.target.value }))}
                        placeholder="4"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">أو أدخل الكمية مباشرة</label>
                      <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value, pkgQty: '' }))}
                        placeholder="40"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>

                  {/* Live calc preview */}
                  {form.pkgQty && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 grid grid-cols-2 gap-3 text-center text-xs">
                      <div>
                        <p className="text-gray-500 mb-0.5">إجمالي القطع المتاحة</p>
                        <p className="font-bold text-blue-700 text-base">
                          {(Number(form.pkgQty) * (Number(form.sheetsPerPkg) || 1)).toLocaleString('ar-IQ')} قطعة
                        </p>
                      </div>
                      {form.buyingPrice && (
                        <div>
                          <p className="text-gray-500 mb-0.5">سعر الشراء/قطعة</p>
                          <p className="font-bold text-orange-600 text-base">
                            {(Number(form.buyingPrice) / (Number(form.sheetsPerPkg) || 1)).toLocaleString('ar-IQ', { maximumFractionDigits: 0 })} د.ع
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {canSeeBuyingPrice && (
                      <div>
                        <label className="block text-sm font-medium text-orange-600 mb-1">🔒 سعر الشراء/علبة (د.ع)</label>
                        <input type="number" min="0" value={form.buyingPrice} onChange={e => setForm(f => ({ ...f, buyingPrice: e.target.value }))}
                          placeholder="8000"
                          className="w-full px-3 py-2.5 border border-orange-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50" />
                        <p className="text-xs text-orange-500 mt-1">سعر العبوة الكاملة — يُحسب سعر القطعة تلقائياً</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-sky-700 mb-1">سعر البيع/قطعة (د.ع) *</label>
                      <input type="number" min="0" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                        placeholder="3000" required
                        className="w-full px-3 py-2.5 border border-sky-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ انتهاء الصلاحية *</label>
                    <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                      required min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">بلد المنشأ *</label>
                    <select value={form.originCountry} onChange={e => setForm(f => ({ ...f, originCountry: e.target.value }))}
                      required
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                      <option value="">— اختر البلد —</option>
                      <option value="العراق">العراق</option>
                      <option value="الأردن">الأردن</option>
                      <option value="مصر">مصر</option>
                      <option value="السعودية">السعودية</option>
                      <option value="الإمارات">الإمارات</option>
                      <option value="سوريا">سوريا</option>
                      <option value="لبنان">لبنان</option>
                      <option value="تركيا">تركيا</option>
                      <option value="الهند">الهند</option>
                      <option value="ألمانيا">ألمانيا</option>
                      <option value="فرنسا">فرنسا</option>
                      <option value="المملكة المتحدة">المملكة المتحدة</option>
                      <option value="الولايات المتحدة">الولايات المتحدة</option>
                      <option value="الصين">الصين</option>
                      <option value="إيران">إيران</option>
                      <option value="باكستان">باكستان</option>
                      <option value="أخرى">أخرى</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تصنيف الدواء *</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      required
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                      <option value="">— اختر التصنيف —</option>
                      <option value="مسكنات الألم">مسكنات الألم</option>
                      <option value="مضادات الالتهاب">مضادات الالتهاب</option>
                      <option value="مضادات حيوية">مضادات حيوية</option>
                      <option value="أدوية القلب والضغط">أدوية القلب والضغط</option>
                      <option value="أدوية السكري">أدوية السكري</option>
                      <option value="أدوية الجهاز الهضمي">أدوية الجهاز الهضمي</option>
                      <option value="أدوية الجهاز التنفسي">أدوية الجهاز التنفسي</option>
                      <option value="أدوية الحساسية">أدوية الحساسية</option>
                      <option value="فيتامينات ومكملات">فيتامينات ومكملات</option>
                      <option value="أدوية نفسية وأعصاب">أدوية نفسية وأعصاب</option>
                      <option value="أدوية العيون والأذن">أدوية العيون والأذن</option>
                      <option value="أدوية الجلد">أدوية الجلد</option>
                      <option value="أدوية الغدة الدرقية">أدوية الغدة الدرقية</option>
                      <option value="مضادات الفطريات">مضادات الفطريات</option>
                      <option value="مضادات الفيروسات">مضادات الفيروسات</option>
                      <option value="أدوية الأطفال">أدوية الأطفال</option>
                      <option value="أدوية النساء والتوليد">أدوية النساء والتوليد</option>
                      <option value="أخرى">أخرى</option>
                    </select>
                  </div>

                  {formWarehouses.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">المستودع (اختياري)</label>
                      <select value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                        <option value="">— بدون مستودع —</option>
                        {formWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">اختياري — لربط الدواء بمستودع وإظهاره في عمود المستودع</p>
                    </div>
                  )}

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
      </DraggableModal>

      {/* Season modal */}
      <DraggableModal open={showSeasonModal} onClose={() => setShowSeasonModal(false)} title="إعداد الموسم" initialWidth={420}>
        <div className="p-6" dir="rtl">
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
      </DraggableModal>

      <DraggableModal open={!!editLimitItem} onClose={() => setEditLimitItem(null)} title={<><span>حدود المخزون الموسمية</span>{editLimitItem && <span className="text-xs font-normal text-gray-500 mr-2">{editLimitItem.generic_name||editLimitItem.brand_name}</span>}</>} initialWidth={380}>
        <div className="p-6 space-y-4" dir="rtl">
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
          <div className="flex gap-3">
            <button onClick={() => setEditLimitItem(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
            <button onClick={saveItemLimit} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold">حفظ الحدود</button>
          </div>
        </div>
      </DraggableModal>

      <DraggableModal open={!!orderItem} onClose={() => setOrderItem(null)} title="طلب شراء من مستودع" initialWidth={420}>
        <div className="p-6" dir="rtl">
          {orderSent ? (
            <div className="text-center py-6">
              <ShoppingCart className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-gray-900">تم إرسال طلب الشراء</p>
            </div>
          ) : (
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
              <div className="flex gap-3 mt-5">
                <button onClick={() => setOrderItem(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
                <button onClick={sendOrder} disabled={!orderWarehouse||!orderQty}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50">
                  إرسال الطلب
                </button>
              </div>
            </div>
          )}
        </div>
      </DraggableModal>
      </>}
    </div>
  );
}

export default function InventoryPageWrapper() {
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}
