'use client';
import { useState, useRef, useEffect } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  Plus, X, Upload, Trash2, ChevronDown, ChevronUp,
  Wallet, FileText, Building2, CreditCard, Camera, QrCode, Search,
} from 'lucide-react';

// ── localStorage keys ────────────────────────────────────────────────────────
const WH_KEY  = 'pharmacy-warehouses';
const PUR_KEY = 'pharmacy-wh-purchases';
const PAY_KEY = 'pharmacy-wh-payments';
const BAT_KEY = 'pharmacy-stock-batches';

// ── Types ────────────────────────────────────────────────────────────────────
export interface Warehouse { id: string; name: string; phone: string; address: string; }

export interface PurchaseItem {
  drugName: string; brandName: string; barcode: string;
  pkgQty: number; sheetsPerPkg: number;
  qty: number; unitCost: number; itemDiscount: number;
  finalUnitCost: number; totalCost: number;
  sellingPrice: number; expiry: string; category: string; originCountry: string;
}

export interface Invoice {
  id: string; discountType: 'none' | 'item' | 'total';
  totalDiscount: number; items: PurchaseItem[]; image: string; subtotal: number;
}

export interface Purchase {
  id: string; warehouseId: string; warehouseName: string;
  invoices: Invoice[]; grandTotal: number; date: string; notes: string;
}

export interface Payment {
  id: string; warehouseId: string; warehouseName: string;
  amount: number; date: string; notes: string; receiptImage: string;
}

export interface StockBatch {
  id: string; drugName: string; brandName?: string; barcode?: string;
  qtyRemaining: number; unitCost: number; sellingPrice: number;
  purchaseId: string; purchaseDate: string; expiry: string;
  category?: string; originCountry?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function save(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function calcInvoiceSubtotal(inv: Invoice): number {
  if (!inv.items?.length) return inv.subtotal ?? 0;
  const total = (inv.items).reduce((s, it) => s + (it.totalCost ?? (it as any).price * (it as any).qty ?? 0), 0);
  return inv.discountType === 'total' && inv.totalDiscount > 0
    ? total * (1 - inv.totalDiscount / 100) : total;
}

function balanceOwed(whId: string, purchases: Purchase[], payments: Payment[]): number {
  return purchases.filter(p => p.warehouseId === whId).reduce((s, p) => s + p.grandTotal, 0)
       - payments.filter(p => p.warehouseId === whId).reduce((s, p) => s + p.amount, 0);
}

// Merge duplicate B2B entries: if multiple entries share the same orderId in notes,
// keep only the one with the highest grandTotal (most-complete delivery record).
function deduplicatePurchases(list: Purchase[]): Purchase[] {
  const b2bMap = new Map<string, Purchase>();
  const nonB2B: Purchase[] = [];
  for (const p of list) {
    const match = p.notes?.match(/طلبية B2B رقم ([0-9a-f-]{36})/i);
    if (match) {
      const oid = match[1];
      const existing = b2bMap.get(oid);
      if (!existing || p.grandTotal > existing.grandTotal) b2bMap.set(oid, p);
    } else {
      nonB2B.push(p);
    }
  }
  return [...nonB2B, ...Array.from(b2bMap.values())];
}

function emptyInvoice(): Invoice {
  return { id: uid(), discountType: 'none', totalDiscount: 0, items: [], image: '', subtotal: 0 };
}
function emptyItemForm() {
  return {
    drugName: '', brandName: '', barcode: '',
    pkgQty: '', sheetsPerPkg: '', unitCost: '',
    itemDiscount: '', sellingPrice: '',
    expiry: '', category: '', originCountry: '',
  };
}

const DRUG_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/drugs/search';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';
const CATEGORIES = ['مسكنات الألم','مضادات الالتهاب','مضادات حيوية','أدوية القلب والضغط','أدوية السكري','أدوية الجهاز الهضمي','أدوية الجهاز التنفسي','أدوية الحساسية','فيتامينات ومكملات','أدوية نفسية وأعصاب','مضادات الفطريات','مضادات الفيروسات','أدوية الأطفال','أدوية النساء والتوليد','أخرى'];
const COUNTRIES = ['العراق','الأردن','مصر','السعودية','الإمارات','سوريا','لبنان','تركيا','الهند','ألمانيا','فرنسا','المملكة المتحدة','الولايات المتحدة','الصين','إيران','باكستان','أخرى'];

// ── Backend sync helpers ─────────────────────────────────────────────────────
function stripImages<T>(data: T): T {
  // Remove base64 images before syncing to backend (too large; stored locally only)
  return JSON.parse(JSON.stringify(data, (k, v) => {
    if ((k === 'image' || k === 'receiptImage') && typeof v === 'string' && v.startsWith('data:')) return '';
    return v;
  }));
}

async function pushState(key: string, value: unknown) {
  try {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!token || !pharmacyId) return;
    await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/state/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ value: stripImages(value) }),
    });
  } catch {}
}

async function pullState<T>(key: string, fallback: T): Promise<T> {
  try {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!token || !pharmacyId) return fallback;
    const r = await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/state/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (d.success && d.data && Array.isArray(d.data) && d.data.length > 0) return d.data as T;
  } catch {}
  return fallback;
}

// ════════════════════════════════════════════════════════════════════════════
export default function WarehouseTab() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => load(WH_KEY, []));
  const [purchases,  setPurchases]  = useState<Purchase[]>(() => {
    const raw = load<Purchase[]>(PUR_KEY, []);
    const deduped = deduplicatePurchases(raw);
    if (deduped.length !== raw.length) save(PUR_KEY, deduped);
    return deduped;
  });
  const [payments,   setPayments]   = useState<Payment[]>  (() => load(PAY_KEY, []));
  const [activeWh,   setActiveWh]   = useState('');

  // Sync from backend on mount (merge: backend wins for items not in localStorage)
  useEffect(() => {
    (async () => {
      const localWh: Warehouse[] = load(WH_KEY, []);
      const localPur: Purchase[] = load(PUR_KEY, []);
      const localPay: Payment[] = load(PAY_KEY, []);

      const [remoteWh, remotePur, remotePay] = await Promise.all([
        pullState<Warehouse[]>('wh-warehouses', []),
        pullState<Purchase[]>('wh-purchases', []),
        pullState<Payment[]>('wh-payments', []),
      ]);

      // Merge: combine local + remote, deduplicate by id (local takes priority)
      const merge = <T extends { id: string }>(local: T[], remote: T[]): T[] => {
        const map = new Map<string, T>();
        remote.forEach(r => map.set(r.id, r));
        local.forEach(l => map.set(l.id, l)); // local overrides remote
        return Array.from(map.values());
      };

      const mergedWh = merge(localWh, remoteWh);
      const rawMergedPur = merge(localPur, remotePur);
      const mergedPur = deduplicatePurchases(rawMergedPur);
      const mergedPay = merge(localPay, remotePay);

      // Save merged back to localStorage
      if (mergedWh.length > localWh.length) { save(WH_KEY, mergedWh); setWarehouses(mergedWh); }
      if (mergedPur.length !== localPur.length || rawMergedPur.length !== mergedPur.length) { save(PUR_KEY, mergedPur); setPurchases(mergedPur); }
      if (mergedPay.length > localPay.length) { save(PAY_KEY, mergedPay); setPayments(mergedPay); }

      // Push cleaned data to backend whenever dedup removed entries or local has more
      if (localWh.length > remoteWh.length) pushState('wh-warehouses', mergedWh);
      if (localPur.length > remotePur.length || rawMergedPur.length > mergedPur.length) pushState('wh-purchases', mergedPur);
      if (localPay.length > remotePay.length) pushState('wh-payments', mergedPay);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [view, setView] = useState<'list' | 'purchase' | 'payment' | 'addWh'>('list');

  // ── Add Warehouse ─────────────────────────────────────────────────────────
  const [whForm, setWhForm] = useState({ name: '', phone: '', address: '' });
  const [whNameSugs, setWhNameSugs] = useState<Warehouse[]>([]);

  const saveWarehouse = () => {
    if (!whForm.name.trim()) return;
    const wh: Warehouse = { id: uid(), ...whForm };
    const next = [...warehouses, wh];
    setWarehouses(next); save(WH_KEY, next);
    pushState('wh-warehouses', next);
    setActiveWh(wh.id);
    setWhForm({ name: '', phone: '', address: '' });
    setView('list');
  };

  // ── Purchase form ─────────────────────────────────────────────────────────
  const [purchaseWh,    setPurchaseWh]    = useState('');
  const [invoices,      setInvoices]      = useState<Invoice[]>([emptyInvoice()]);
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [fromCatalog,   setFromCatalog]   = useState<Set<string>>(new Set());

  // ── Item modal ────────────────────────────────────────────────────────────
  // invIdx = which invoice we're adding to; null = modal closed
  const [itemModal, setItemModal] = useState<{ invIdx: number } | null>(null);
  const [itemForm,  setItemForm]  = useState(emptyItemForm());
  const [itemError, setItemError] = useState('');
  const [drugSugs,  setDrugSugs]  = useState<any[]>([]);
  const [drugSearching, setDrugSearching] = useState(false);
  const [itemFromCatalog, setItemFromCatalog] = useState(false);
  const debRef = useRef<NodeJS.Timeout>();

  // ── Barcode scanner ───────────────────────────────────────────────────────
  const [scanning,      setScanning]      = useState(false);
  const [scanStatus,    setScanStatus]    = useState('');
  const [showScanModal, setShowScanModal] = useState(false);
  const videoRef        = useRef<HTMLVideoElement>(null);
  const zxingRef        = useRef<BrowserMultiFormatReader | null>(null);
  const scanActiveRef      = useRef(false);
  const cameraStreamRef    = useRef<MediaStream | null>(null);
  const scanLookupDoneRef  = useRef(true); // false while drug-lookup fetch is in flight

  const releaseCamera = () => {
    try { (zxingRef.current as any)?.reset?.(); } catch {}
    zxingRef.current = null;
    try { cameraStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    cameraStreamRef.current = null;
    try { const v = videoRef.current; if (v) { v.srcObject = null; } } catch {}
  };

  const startScan = () => {
    scanActiveRef.current = true;
    setScanStatus('جاري فتح الكاميرا...');
    setShowScanModal(true);
    setScanning(true);
  };

  const stopScan = () => {
    scanActiveRef.current = false;
    releaseCamera();
    setScanning(false);
    setScanStatus('');
    setShowScanModal(false);
  };

  // Start camera only after the modal + video element are in the DOM
  useEffect(() => {
    if (!showScanModal) return;
    let cancelled = false;

    const run = async () => {
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      if (cancelled) return;

      const video = videoRef.current;
      if (!video) { setScanStatus('خطأ: لم يتم العثور على عنصر الكاميرا'); return; }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        cameraStreamRef.current = stream;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const reader = new BrowserMultiFormatReader();
        zxingRef.current = reader;
        setScanStatus('وجّه الكاميرا نحو الباركود');

        await reader.decodeFromStream(stream, video, async (result) => {
          if (cancelled || !scanActiveRef.current || !result) return;
          scanActiveRef.current = false;
          cancelled = true;
          const code = result.getText();
          stopScan();
          setItemForm(f => ({ ...f, barcode: code }));
          scanLookupDoneRef.current = false; // lookup in flight
          try {
            const r = await fetch(`${DRUG_API}?q=${encodeURIComponent(code)}&limit=1`);
            const d = await r.json();
            // Only update if commitItem hasn't already cleared the form
            if (!scanLookupDoneRef.current && d.data?.length) {
              const drug = d.data[0];
              setItemForm(f => ({
                ...f, barcode: drug.barcode || code,
                drugName: drug.generic_name || '', brandName: drug.brand_name || '',
                category: drug.category || '',
              }));
              setItemFromCatalog(true);
            }
          } catch {}
          scanLookupDoneRef.current = true;
        });
      } catch (e: any) {
        if (cancelled) return;
        if (stream) { stream.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; }
        const msg = (e as any)?.message || '';
        if (msg.includes('Permission') || msg.includes('NotAllowed')) {
          setScanStatus('⚠️ لم يتم منح إذن الكاميرا');
        } else if (msg.includes('NotFound') || msg.includes('Devices') || msg.includes('device')) {
          setScanStatus('⚠️ لا توجد كاميرا متصلة');
        } else {
          setScanStatus(`⚠️ خطأ: ${msg || 'تعذر فتح الكاميرا'}`);
        }
      }
    };

    run();
    return () => { cancelled = true; releaseCamera(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanModal]);

  useEffect(() => () => { releaseCamera(); }, []);

  // ── Drug autocomplete in item modal ───────────────────────────────────────
  const searchDrug = (q: string) => {
    setItemForm(f => ({ ...f, drugName: q }));
    setItemFromCatalog(false);
    clearTimeout(debRef.current);
    if (q.length < 1) { setDrugSugs([]); return; }
    setDrugSearching(true);
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${DRUG_API}?q=${encodeURIComponent(q)}&limit=6`);
        const d = await r.json();
        setDrugSugs(d.data || []);
      } catch {}
      setDrugSearching(false);
    }, 300);
  };

  const pickDrug = (drug: any) => {
    setItemForm(f => ({
      ...f, drugName: drug.generic_name || drug.brand_name || '',
      brandName: drug.brand_name || '', barcode: drug.barcode || '',
      category: drug.category || '',
    }));
    setDrugSugs([]);
    setItemFromCatalog(true);
  };

  // Current invoice discount type (for showing discount field in modal)
  const currentDiscountType = itemModal != null ? invoices[itemModal.invIdx]?.discountType : 'none';

  const buildItem = (): PurchaseItem | null => {
    if (!itemForm.drugName.trim()) { setItemError('أدخل اسم الدواء'); return null; }
    if (!itemForm.pkgQty || Number(itemForm.pkgQty) <= 0) { setItemError('أدخل عدد العبوات'); return null; }
    if (!itemForm.unitCost || Number(itemForm.unitCost) < 0) { setItemError('أدخل سعر العبوة'); return null; }
    if (!itemForm.expiry) { setItemError('أدخل تاريخ انتهاء الصلاحية'); return null; }
    const pkgQty = Number(itemForm.pkgQty);
    const sheetsPerPkg = Number(itemForm.sheetsPerPkg) || 1;
    const packagePrice = Number(itemForm.unitCost);
    const unitCostPerSheet = packagePrice / sheetsPerPkg;
    const qty = pkgQty * sheetsPerPkg;
    const disc = Number(itemForm.itemDiscount) || 0;
    const finalUnit = unitCostPerSheet * (1 - disc / 100);
    return {
      drugName: itemForm.drugName.trim(), brandName: itemForm.brandName.trim(),
      barcode: itemForm.barcode.trim(),
      pkgQty, sheetsPerPkg, qty,
      unitCost: unitCostPerSheet, itemDiscount: disc,
      finalUnitCost: finalUnit, totalCost: finalUnit * qty,
      sellingPrice: Number(itemForm.sellingPrice) || 0,
      expiry: itemForm.expiry, category: itemForm.category,
      originCountry: itemForm.originCountry,
    };
  };

  const commitItem = (andClose: boolean) => {
    setItemError('');
    if (itemModal == null) return;
    const item = buildItem();
    if (!item) return;

    // Track catalog flag
    const newFromCatalog = new Set(Array.from(fromCatalog));
    if (itemFromCatalog) {
      newFromCatalog.add(`modal-${Date.now()}`);
    }
    setFromCatalog(newFromCatalog);

    setInvoices(prev => prev.map((inv, i) => {
      if (i !== itemModal.invIdx) return inv;
      const items = [...inv.items, item];
      return { ...inv, items, subtotal: calcInvoiceSubtotal({ ...inv, items }) };
    }));

    if (andClose) {
      setItemModal(null);
    } else {
      scanLookupDoneRef.current = true; // cancel any in-flight drug lookup
      setItemForm(emptyItemForm());
      setItemFromCatalog(false);
      setDrugSugs([]);
    }
  };

  const openItemModal = (invIdx: number) => {
    setItemModal({ invIdx });
    setItemForm(emptyItemForm());
    setItemError('');
    setDrugSugs([]);
    setItemFromCatalog(false);
  };

  const removeItem = (invIdx: number, itemIdx: number) =>
    setInvoices(prev => prev.map((inv, i) => {
      if (i !== invIdx) return inv;
      const items = inv.items.filter((_, j) => j !== itemIdx);
      return { ...inv, items, subtotal: calcInvoiceSubtotal({ ...inv, items }) };
    }));

  const updateInvoice = (idx: number, patch: Partial<Invoice>) =>
    setInvoices(prev => prev.map((inv, i) => {
      if (i !== idx) return inv;
      const updated = { ...inv, ...patch };
      updated.subtotal = calcInvoiceSubtotal(updated);
      return updated;
    }));

  const handleInvoiceImage = (invIdx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => updateInvoice(invIdx, { image: reader.result as string });
    reader.readAsDataURL(file);
  };

  const grandTotal = invoices.reduce((s, inv) => s + calcInvoiceSubtotal(inv), 0);

  const savePurchase = () => {
    if (!purchaseWh) return;
    setSavingPurchase(true);
    const wh = warehouses.find(w => w.id === purchaseWh)!;
    const purchase: Purchase = {
      id: uid(), warehouseId: purchaseWh, warehouseName: wh.name,
      invoices, grandTotal, date: new Date().toISOString(), notes: purchaseNotes,
    };
    const nextPur = [...purchases, purchase];
    setPurchases(nextPur); save(PUR_KEY, nextPur);
    pushState('wh-purchases', nextPur);

    // FEFO batches
    const batches: StockBatch[] = load(BAT_KEY, []);
    invoices.forEach(inv => {
      inv.items.forEach(it => {
        if (!it.drugName || it.qty <= 0) return;
        const finalCost = inv.discountType === 'total'
          ? it.finalUnitCost * (1 - inv.totalDiscount / 100) : it.finalUnitCost;
        batches.push({ id: uid(), drugName: it.drugName.trim(), brandName: it.brandName || '', barcode: it.barcode || '', qtyRemaining: it.qty, unitCost: finalCost, sellingPrice: it.sellingPrice || 0, purchaseId: purchase.id, purchaseDate: purchase.date, expiry: it.expiry, category: it.category || '', originCountry: it.originCountry || '' });
      });
    });
    batches.sort((a, b) => {
      if (!a.expiry) return 1; if (!b.expiry) return -1;
      return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
    });
    save(BAT_KEY, batches);

    // Save drugs to backend inventory + drug catalog
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    invoices.forEach(inv => {
      inv.items.forEach(it => {
        if (!it.drugName.trim()) return;
        const finalCost = inv.discountType === 'total'
          ? it.finalUnitCost * (1 - inv.totalDiscount / 100) : it.finalUnitCost;
        // Save to pharmacy inventory so patients can find it
        if (pharmacyId && token) {
          fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              genericName: it.drugName.trim(),
              brandName: it.brandName || '',
              barcode: it.barcode || null,
              quantity: it.qty,
              sellingPrice: it.sellingPrice || 0,
              reorderLevel: 10,
              expiryDate: it.expiry || null,
              originCountry: it.originCountry || '',
              category: it.category || '',
              buyingPrice: finalCost || undefined,
            }),
          }).catch(() => {});
        }
        // Also register in drug catalog
        fetch(DRUG_API.replace('/search', ''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ generic_name: it.drugName.trim(), brand_name: it.brandName || undefined, barcode: it.barcode || undefined, category: it.category || undefined }),
        }).catch(() => {});
      });
    });

    setInvoices([emptyInvoice()]);
    setPurchaseNotes(''); setPurchaseWh('');
    setFromCatalog(new Set());
    setSavingPurchase(false);
    setActiveWh(purchase.warehouseId);
    setView('list');
  };

  // ── Payment form ──────────────────────────────────────────────────────────
  const [payWh,     setPayWh]     = useState('');
  const [payRows,   setPayRows]   = useState([{ amount: '', date: new Date().toISOString().slice(0,10), notes: '', receiptImage: '' }]);
  const [savingPay, setSavingPay] = useState(false);

  const handleReceiptImage = (i: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, receiptImage: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const savePayments = () => {
    if (!payWh) return;
    setSavingPay(true);
    const wh = warehouses.find(w => w.id === payWh)!;
    const newPays: Payment[] = payRows.filter(r => Number(r.amount) > 0)
      .map(r => ({ id: uid(), warehouseId: payWh, warehouseName: wh.name, amount: Number(r.amount), date: r.date, notes: r.notes, receiptImage: r.receiptImage }));
    const next = [...payments, ...newPays];
    setPayments(next); save(PAY_KEY, next);
    pushState('wh-payments', next);
    setPayRows([{ amount: '', date: new Date().toISOString().slice(0,10), notes: '', receiptImage: '' }]);
    setPayWh(''); setSavingPay(false); setView('list');
  };

  const whPurchases = activeWh ? purchases.filter(p => p.warehouseId === activeWh) : purchases;
  const whPayments  = activeWh ? payments.filter(p => p.warehouseId === activeWh)  : payments;
  const activeWhObj = warehouses.find(w => w.id === activeWh);
  const owed        = activeWh ? balanceOwed(activeWh, purchases, payments) : 0;
  const selectedWhName = warehouses.find(w => w.id === purchaseWh)?.name || '';

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: Add Warehouse
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'addWh') return (
    <div className="max-w-md mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => setView('list')} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-4 h-4" /></button>
        <h2 className="font-bold text-gray-900">إضافة مستودع جديد</h2>
      </div>
      <div className="relative">
        <label className="block text-xs font-medium text-gray-600 mb-1">اسم المستودع *</label>
        <input value={whForm.name}
          onChange={e => { const q = e.target.value; setWhForm(p => ({ ...p, name: q })); setWhNameSugs(q.length >= 1 ? warehouses.filter(w => w.name.toLowerCase().includes(q.toLowerCase())) : []); }}
          placeholder="اكتب اسم المستودع..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
        {whNameSugs.length > 0 && (
          <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <p className="text-[10px] text-gray-400 px-3 pt-2 pb-1">مستودعات موجودة — اضغط للاختيار</p>
            {whNameSugs.map(w => (
              <button key={w.id} type="button" onClick={() => { setActiveWh(w.id); setWhNameSugs([]); setView('list'); }}
                className="w-full text-right px-3 py-2.5 hover:bg-sky-50 text-sm border-t border-gray-100 flex items-center justify-between">
                <span className="font-medium text-gray-900">{w.name}</span>
                {w.phone && <span className="text-xs text-gray-400">{w.phone}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {[['phone','رقم الهاتف'],['address','العنوان']].map(([k, label]) => (
        <div key={k}>
          <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
          <input value={(whForm as any)[k]} onChange={e => setWhForm(p => ({ ...p, [k]: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
      ))}
      <button onClick={saveWarehouse} disabled={!whForm.name.trim()}
        className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm">
        حفظ المستودع
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: Add Purchase
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'purchase') return (
    <div className="space-y-5" dir="rtl">

      {/* ── Barcode scan modal ── */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-900">مسح باركود</h3>
              <button onClick={stopScan}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="relative bg-black" style={{ aspectRatio:'4/3' }}>
              {scanning ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-28 relative">
                      <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white rounded-tr" />
                      <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white rounded-tl" />
                      <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white rounded-br" />
                      <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white rounded-bl" />
                      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-400 animate-pulse" />
                    </div>
                  </div>
                  {scanStatus && <div className="absolute bottom-3 left-0 right-0 text-center"><span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">{scanStatus}</span></div>}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Camera className="w-10 h-10 text-gray-500 opacity-30" /></div>
              )}
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-gray-400 text-center">أو أدخل الباركود يدوياً</p>
              <input placeholder="رقم الباركود" dir="ltr"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center tracking-wider outline-none focus:ring-2 focus:ring-sky-400"
                onChange={e => setItemForm(f => ({ ...f, barcode: e.target.value }))} />
              <button onClick={stopScan} className="w-full border border-gray-300 py-2 rounded-xl text-sm text-gray-700">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item add/edit modal ── */}
      <DraggableModal
        open={itemModal != null}
        onClose={() => setItemModal(null)}
        title={<><span>إضافة صنف</span>{selectedWhName && <span className="text-xs font-normal text-sky-600 mr-2">📦 {selectedWhName} — فاتورة {(itemModal?.invIdx ?? 0) + 1}</span>}</>}
        initialWidth={540}
      >
        {itemModal != null && (
          <div dir="rtl">
            <div className="px-6 pb-6 pt-4 space-y-4">
              {itemError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{itemError}</div>}

              {/* Drug name + autocomplete */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الدواء (علمي) *</label>
                <input value={itemForm.drugName} onChange={e => searchDrug(e.target.value)} autoFocus
                  placeholder="مثال: باراسيتامول أو Paracetamol"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                {drugSearching && <p className="text-xs text-gray-400 mt-1">جاري البحث...</p>}
                {drugSugs.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {drugSugs.map(drug => (
                      <button key={drug.id} type="button" onClick={() => pickDrug(drug)}
                        className="w-full text-right px-4 py-2.5 hover:bg-sky-50 text-sm border-b border-gray-100 last:border-0">
                        <p className="font-medium text-gray-900">{drug.generic_name}</p>
                        {drug.brand_name && <p className="text-xs text-gray-500">{drug.brand_name} · {drug.dosage_form} {drug.strength}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Brand name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم التجاري</label>
                <input value={itemForm.brandName} onChange={e => setItemForm(f => ({ ...f, brandName: e.target.value }))}
                  placeholder="مثال: بنادول"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الباركود</label>
                <div className="flex gap-2">
                  <input value={itemForm.barcode} onChange={e => setItemForm(f => ({ ...f, barcode: e.target.value }))}
                    placeholder="رقم الباركود" dir="ltr"
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 tracking-wider" />
                  <button type="button" onClick={startScan}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700">
                    <QrCode className="w-4 h-4" /> مسح
                  </button>
                </div>
              </div>

              {/* Packages + sheets per package + package price */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">عدد العبوات *</label>
                  <input type="number" min="1" value={itemForm.pkgQty}
                    onChange={e => setItemForm(f => ({ ...f, pkgQty: e.target.value }))}
                    placeholder="10"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">قطعة/علبة</label>
                  <input type="number" min="1" value={itemForm.sheetsPerPkg}
                    onChange={e => setItemForm(f => ({ ...f, sheetsPerPkg: e.target.value }))}
                    placeholder="4"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-orange-600 mb-1">سعر العبوة (د.ع) *</label>
                  <input type="number" min="0" value={itemForm.unitCost}
                    onChange={e => setItemForm(f => ({ ...f, unitCost: e.target.value }))}
                    placeholder="8000"
                    className="w-full px-3 py-2.5 border border-orange-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50" />
                </div>
              </div>

              {/* Live calculation preview */}
              {itemForm.pkgQty && itemForm.unitCost && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 grid grid-cols-3 gap-3 text-center text-xs">
                  <div>
                    <p className="text-gray-500 mb-0.5">إجمالي الأوراق</p>
                    <p className="font-bold text-blue-700 text-base">
                      {(Number(itemForm.pkgQty) * (Number(itemForm.sheetsPerPkg) || 1)).toLocaleString('ar-IQ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">سعر الشراء/ورقة</p>
                    <p className="font-bold text-orange-600 text-base">
                      {(Number(itemForm.unitCost) / (Number(itemForm.sheetsPerPkg) || 1)).toLocaleString('ar-IQ', { maximumFractionDigits: 0 })} د.ع
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">إجمالي الشراء</p>
                    <p className="font-bold text-gray-800 text-base">
                      {(Number(itemForm.unitCost) * Number(itemForm.pkgQty)).toLocaleString('ar-IQ')} د.ع
                    </p>
                  </div>
                </div>
              )}

              {/* Per-item discount — only when invoice discountType === 'item' */}
              {currentDiscountType === 'item' && (
                <div>
                  <label className="block text-sm font-medium text-amber-700 mb-1">خصم على هذا الصنف (%)</label>
                  <div className="flex items-center gap-3">
                    <input type="number" min="0" max="100" value={itemForm.itemDiscount} onChange={e => setItemForm(f => ({ ...f, itemDiscount: e.target.value }))}
                      placeholder="0"
                      className="w-32 px-3 py-2.5 border border-amber-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50" />
                    <span className="text-sm text-gray-500">%</span>
                    {itemForm.unitCost && itemForm.itemDiscount && (
                      <span className="text-xs text-amber-700 font-medium bg-amber-50 px-2 py-1 rounded-lg">
                        السعر بعد الخصم: {(Number(itemForm.unitCost) * (1 - Number(itemForm.itemDiscount) / 100)).toLocaleString('ar-IQ')} د.ع
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Selling price */}
              <div>
                <label className="block text-sm font-medium text-sky-700 mb-1">سعر البيع/قطعة (د.ع)</label>
                <input type="number" min="0" value={itemForm.sellingPrice} onChange={e => setItemForm(f => ({ ...f, sellingPrice: e.target.value }))}
                  placeholder="5000"
                  className="w-full px-3 py-2.5 border border-sky-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-sky-50" />
              </div>

              {/* Expiry */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ انتهاء الصلاحية *</label>
                <input type="date" value={itemForm.expiry} onChange={e => setItemForm(f => ({ ...f, expiry: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">التصنيف</label>
                <select value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                  <option value="">— اختر التصنيف —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Origin */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">بلد المنشأ</label>
                <select value={itemForm.originCountry} onChange={e => setItemForm(f => ({ ...f, originCountry: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                  <option value="">— اختر البلد —</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Selling price vs buying price margin */}
              {itemForm.unitCost && itemForm.sheetsPerPkg && itemForm.sellingPrice && (
                <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">هامش الربح/ورقة</span>
                  <span className="font-bold text-green-700">
                    {(Number(itemForm.sellingPrice) - Number(itemForm.unitCost) / (Number(itemForm.sheetsPerPkg) || 1)).toLocaleString('ar-IQ', { maximumFractionDigits: 0 })} د.ع
                  </span>
                </div>
              )}
            </div>
            {/* Action buttons */}
            <div className="border-t px-6 py-4 flex gap-3 bg-gray-50">
              <button type="button" onClick={() => { setItemError(''); commitItem(false); }}
                className="flex-1 bg-sky-100 hover:bg-sky-200 text-sky-800 font-semibold py-2.5 rounded-xl text-sm transition-colors">
                ✚ حفظ وإضافة صنف آخر
              </button>
              <button type="button" onClick={() => { setItemError(''); commitItem(true); }}
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                ✓ حفظ وإغلاق
              </button>
            </div>
          </div>
        )}
      </DraggableModal>

      {/* Purchase header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-4 h-4" /></button>
        <h2 className="font-bold text-gray-900 text-lg">إضافة فاتورة شراء من مستودع</h2>
      </div>

      {/* Warehouse selector */}
      <div className={`rounded-2xl p-4 shadow-sm space-y-3 ${purchaseWh ? 'bg-sky-50 border-2 border-sky-300' : 'bg-white border-2 border-dashed border-orange-300'}`}>
        <label className="block text-sm font-bold text-gray-800">
          المستودع {!purchaseWh && <span className="text-orange-500 text-xs font-normal mr-1">— مطلوب لبدء إضافة الأصناف</span>}
        </label>
        <div className="flex gap-2">
          <select value={purchaseWh} onChange={e => setPurchaseWh(e.target.value)}
            className={`flex-1 border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 bg-white ${purchaseWh ? 'border-sky-400 focus:ring-sky-400 font-semibold text-sky-800' : 'border-orange-300 focus:ring-orange-400'}`}>
            <option value="">اختر مستودعاً...</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={() => setView('addWh')}
            className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-white px-3 py-2.5 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> جديد
          </button>
        </div>
        {selectedWhName && (
          <div className="flex items-center gap-2 bg-sky-100 text-sky-800 px-3 py-2 rounded-xl text-sm font-semibold">
            <Building2 className="w-4 h-4 shrink-0" />
            المستودع المختار: {selectedWhName}
          </div>
        )}
      </div>

      {/* Invoices — locked until warehouse is selected */}
      {!purchaseWh && (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl py-12 text-center space-y-2">
          <Building2 className="w-10 h-10 mx-auto text-gray-300" />
          <p className="text-sm font-medium text-gray-400">اختر مستودعاً أو أضف جديداً أولاً</p>
          <p className="text-xs text-gray-300">لا يمكن إضافة فواتير بدون تحديد المستودع</p>
        </div>
      )}
      {purchaseWh && invoices.map((inv, invIdx) => (
        <div key={inv.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-500" />
              <span className="font-bold text-gray-800 text-sm">فاتورة {invIdx + 1}</span>
              {selectedWhName && <span className="text-xs text-gray-400">— {selectedWhName}</span>}
            </div>
            {invoices.length > 1 && (
              <button onClick={() => setInvoices(prev => prev.filter((_, i) => i !== invIdx))}
                className="p-1 rounded-lg hover:bg-red-100 text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Discount type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">نوع الخصم</label>
              <div className="grid grid-cols-3 gap-2">
                {([['none','بدون خصم'],['item','خصم على كل صنف'],['total','خصم على الإجمالي']] as const).map(([val, label]) => (
                  <button key={val} type="button"
                    onClick={() => updateInvoice(invIdx, { discountType: val, totalDiscount: 0 })}
                    className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${inv.discountType === val ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {inv.discountType === 'total' && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min="0" max="100" value={inv.totalDiscount || ''}
                    onChange={e => updateInvoice(invIdx, { totalDiscount: Number(e.target.value) })}
                    placeholder="نسبة الخصم %"
                    className="w-40 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
                  <span className="text-sm text-gray-500">% على الإجمالي</span>
                </div>
              )}
              {inv.discountType === 'item' && (
                <p className="text-xs text-amber-600 mt-1.5">✦ عند إضافة كل صنف سيظهر حقل الخصم الخاص به</p>
              )}
            </div>

            {/* Invoice image */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">صورة الفاتورة (اختياري)</label>
              {inv.image ? (
                <div className="relative inline-block">
                  <img src={inv.image} alt="فاتورة" className="h-24 rounded-xl object-cover border border-gray-200" />
                  <button onClick={() => updateInvoice(invIdx, { image: '' })}
                    className="absolute -top-1.5 -left-1.5 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer w-fit bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-600">
                  <Upload className="w-4 h-4" /> مسح / رفع الفاتورة
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleInvoiceImage(invIdx, e.target.files[0])} />
                </label>
              )}
            </div>

            {/* Items list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">الأصناف ({inv.items.length})</label>
                <button onClick={() => openItemModal(invIdx)}
                  className="flex items-center gap-1.5 text-xs bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg font-medium">
                  <Plus className="w-3 h-3" /> إضافة صنف
                </button>
              </div>

              {inv.items.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                  <p className="text-xs text-gray-400">لا توجد أصناف بعد — اضغط «إضافة صنف» أعلاه</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: '820px' }}>
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-2 py-2 text-right font-medium">الدواء</th>
                        <th className="px-2 py-2 text-right font-medium">التجاري</th>
                        <th className="px-2 py-2 text-center font-medium">الباركود</th>
                        <th className="px-2 py-2 text-center font-medium">عبوات</th>
                        <th className="px-2 py-2 text-center font-medium">ورقة/علبة</th>
                        <th className="px-2 py-2 text-center font-medium">أوراق متاحة</th>
                        <th className="px-2 py-2 text-center font-medium">شراء/ورقة</th>
                        {inv.discountType === 'item' && <th className="px-2 py-2 text-center font-medium">خصم%</th>}
                        <th className="px-2 py-2 text-center font-medium">بيع/ورقة</th>
                        <th className="px-2 py-2 text-center font-medium">الإجمالي</th>
                        <th className="px-2 py-2 text-right font-medium">التصنيف</th>
                        <th className="px-2 py-2 text-center font-medium">الصلاحية</th>
                        <th className="px-2 py-2 text-right font-medium">المنشأ</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((it, itemIdx) => (
                        <tr key={itemIdx} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-2 py-2 font-medium text-gray-800">{it.drugName}</td>
                          <td className="px-2 py-2 text-gray-500">{it.brandName || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2 text-center font-mono text-gray-400 text-[10px]">{it.barcode || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2 text-center font-bold">{it.pkgQty}</td>
                          <td className="px-2 py-2 text-center text-gray-500">{it.sheetsPerPkg || 1}</td>
                          <td className="px-2 py-2 text-center font-bold text-blue-700">{it.qty}</td>
                          <td className="px-2 py-2 text-center text-orange-600 font-medium">{(it.finalUnitCost ?? 0).toLocaleString('ar-IQ', { maximumFractionDigits: 0 })}</td>
                          {inv.discountType === 'item' && <td className="px-2 py-2 text-center text-amber-600">{it.itemDiscount ? `${it.itemDiscount}%` : '—'}</td>}
                          <td className="px-2 py-2 text-center text-sky-600 font-medium">{it.sellingPrice ? it.sellingPrice.toLocaleString('ar-IQ') : <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2 text-center font-bold text-gray-800">{(it.totalCost ?? 0).toLocaleString('ar-IQ')}</td>
                          <td className="px-2 py-2">
                            {it.category ? <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium">{it.category}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-500">{it.expiry || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2 text-gray-500">{it.originCountry || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeItem(invIdx, itemIdx)} className="p-1 text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">إجمالي الفاتورة {invIdx + 1}</span>
                <span className="font-bold text-gray-900">{calcInvoiceSubtotal(inv).toLocaleString('ar-IQ')} IQD</span>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Add invoice + notes + save — only when warehouse selected */}
      {purchaseWh && (
        <>
          <button onClick={() => setInvoices(prev => [...prev, emptyInvoice()])}
            className="w-full border-2 border-dashed border-sky-300 hover:border-sky-500 text-sky-600 py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 transition-all">
            <Plus className="w-4 h-4" /> إضافة فاتورة
          </button>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">ملاحظات (اختياري)</label>
            <textarea value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </div>

          <div className="bg-sky-600 rounded-2xl p-4 flex items-center justify-between text-white">
            <div>
              <p className="text-xs opacity-80">الإجمالي الكلي ({invoices.length} {invoices.length === 1 ? 'فاتورة' : 'فواتير'})</p>
              <p className="text-2xl font-black">{grandTotal.toLocaleString('ar-IQ')} IQD</p>
            </div>
            <button onClick={savePurchase} disabled={savingPurchase || invoices.every(inv => inv.items.length === 0)}
              className="bg-white text-sky-600 font-bold px-5 py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-sky-50">
              {savingPurchase ? 'جاري الحفظ...' : 'حفظ المشتريات'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: Add Payment
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'payment') return (
    <div className="max-w-2xl space-y-4" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => setView('list')} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-4 h-4" /></button>
        <h2 className="font-bold text-gray-900 text-lg">تسجيل دفعة للمستودع</h2>
      </div>
      <div className="flex gap-2">
        <select value={payWh} onChange={e => setPayWh(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white">
          <option value="">اختر مستودعاً...</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} — مديونية: {balanceOwed(w.id, purchases, payments).toLocaleString('ar-IQ')} IQD</option>)}
        </select>
      </div>
      {payRows.map((row, i) => (
        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">دفعة {i + 1}</span>
            {payRows.length > 1 && <button onClick={() => setPayRows(prev => prev.filter((_, j) => j !== i))} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">المبلغ (IQD) *</label>
              <input type="number" min="0" value={row.amount} onChange={e => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, amount: e.target.value }))} placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">التاريخ</label>
              <input type="date" value={row.date} onChange={e => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
            <input value={row.notes} onChange={e => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, notes: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          {row.receiptImage ? (
            <div className="relative inline-block">
              <img src={row.receiptImage} alt="إيصال" className="h-24 rounded-xl object-cover border border-gray-200" />
              <button onClick={() => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, receiptImage: '' }))} className="absolute -top-1.5 -left-1.5 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <label className="flex items-center gap-2 cursor-pointer w-fit bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-600">
              <Upload className="w-4 h-4" /> مسح إيصال الدفع
              <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleReceiptImage(i, e.target.files[0])} />
            </label>
          )}
        </div>
      ))}
      <button onClick={() => setPayRows(prev => [...prev, { amount: '', date: new Date().toISOString().slice(0,10), notes: '', receiptImage: '' }])}
        className="w-full border-2 border-dashed border-green-300 hover:border-green-500 text-green-600 py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> إضافة دفعة أخرى
      </button>
      <div className="flex items-center justify-between bg-green-600 rounded-2xl p-4 text-white">
        <div>
          <p className="text-xs opacity-80">إجمالي الدفعات</p>
          <p className="text-xl font-black">{payRows.reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString('ar-IQ')} IQD</p>
        </div>
        <button onClick={savePayments} disabled={savingPay || !payWh || payRows.every(r => !Number(r.amount))}
          className="bg-white text-green-600 font-bold px-5 py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-green-50">
          {savingPay ? 'جاري الحفظ...' : 'تسجيل الدفعات'}
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: Main List
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <h2 className="font-bold text-gray-900 text-lg">إدارة المستودعات</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setPurchaseWh(activeWh); setView('purchase'); }}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <FileText className="w-4 h-4" /> فاتورة شراء
          </button>
          <button onClick={() => { setPayWh(activeWh); setView('payment'); }}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <CreditCard className="w-4 h-4" /> تسجيل دفعة
          </button>
          <button onClick={() => setView('addWh')}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Building2 className="w-4 h-4" /> مستودع جديد
          </button>
        </div>
      </div>

      {warehouses.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setActiveWh('')} className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${!activeWh ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>الكل</button>
          {warehouses.map(w => (
            <button key={w.id} onClick={() => setActiveWh(w.id)} className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeWh === w.id ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{w.name}</button>
          ))}
        </div>
      )}

      {activeWhObj && (
        <div className={`rounded-2xl p-4 flex items-center gap-4 ${owed > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          <Wallet className={`w-8 h-8 shrink-0 ${owed > 0 ? 'text-red-500' : 'text-green-500'}`} />
          <div className="flex-1">
            <p className="text-xs text-gray-500">{activeWhObj.name}{activeWhObj.phone ? ` — ${activeWhObj.phone}` : ''}</p>
            <p className={`text-xl font-black ${owed > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {owed > 0 ? `مديونية: ${owed.toLocaleString('ar-IQ')} IQD` : 'لا توجد مديونية ✓'}
            </p>
          </div>
          {owed > 0 && <button onClick={() => { setPayWh(activeWh); setView('payment'); }} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium">سداد</button>}
        </div>
      )}

      {warehouses.length === 0 && (
        <div className="text-center py-16 text-gray-400 space-y-3">
          <Building2 className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">لا توجد مستودعات مسجلة</p>
          <button onClick={() => setView('addWh')} className="bg-sky-500 hover:bg-sky-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium">إضافة مستودع</button>
        </div>
      )}

      {whPurchases.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm">فواتير الشراء ({whPurchases.length})</h3>
          {[...whPurchases].reverse().map(p => <PurchaseCard key={p.id} purchase={p} />)}
        </div>
      )}

      {whPayments.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm">المدفوعات ({whPayments.length})</h3>
          {[...whPayments].reverse().map(pay => (
            <div key={pay.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0"><CreditCard className="w-5 h-5 text-green-600" /></div>
              <div className="flex-1">
                <p className="font-bold text-green-700">{pay.amount.toLocaleString('ar-IQ')} IQD</p>
                <p className="text-xs text-gray-500">{pay.warehouseName} — {new Date(pay.date).toLocaleDateString('ar-IQ')}</p>
                {pay.notes && <p className="text-xs text-gray-400 mt-0.5">{pay.notes}</p>}
              </div>
              {pay.receiptImage && <img src={pay.receiptImage} alt="إيصال" className="h-14 w-14 rounded-xl object-cover border border-gray-100 cursor-pointer" onClick={() => window.open(pay.receiptImage)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Purchase card ─────────────────────────────────────────────────────────
function PurchaseCard({ purchase }: { purchase: Purchase }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center"><FileText className="w-4 h-4 text-sky-600" /></div>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{purchase.warehouseName}</p>
            <p className="text-xs text-gray-500">{new Date(purchase.date).toLocaleDateString('ar-IQ')} — {purchase.invoices.length} {purchase.invoices.length === 1 ? 'فاتورة' : 'فواتير'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-black text-sky-700">{(purchase.grandTotal ?? 0).toLocaleString('ar-IQ')} IQD</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {purchase.invoices.map((inv, i) => (
            <div key={inv.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">فاتورة {i + 1} — {purchase.warehouseName}
                  {inv.discountType !== 'none' && <span className="mr-2 text-amber-600">({inv.discountType === 'total' ? `خصم ${inv.totalDiscount}% على الإجمالي` : 'خصم على الأصناف'})</span>}
                </span>
                {inv.image && <img src={inv.image} alt="" className="h-10 rounded-lg object-cover border cursor-pointer" onClick={() => window.open(inv.image)} />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: '780px' }}>
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="px-2 py-1.5 text-right">الدواء</th>
                      <th className="px-2 py-1.5 text-right">التجاري</th>
                      <th className="px-2 py-1.5 text-center">الباركود</th>
                      <th className="px-2 py-1.5 text-center">عبوات</th>
                      <th className="px-2 py-1.5 text-center">ورقة/علبة</th>
                      <th className="px-2 py-1.5 text-center">أوراق</th>
                      <th className="px-2 py-1.5 text-center">شراء/ورقة</th>
                      {inv.discountType === 'item' && <th className="px-2 py-1.5 text-center">خصم%</th>}
                      <th className="px-2 py-1.5 text-center">بيع/ورقة</th>
                      <th className="px-2 py-1.5 text-center">الإجمالي</th>
                      <th className="px-2 py-1.5 text-right">التصنيف</th>
                      <th className="px-2 py-1.5 text-center">الصلاحية</th>
                      <th className="px-2 py-1.5 text-right">المنشأ</th>
                      <th className="px-2 py-1.5 text-right">المستودع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.items.map((it, j) => (
                      <tr key={j} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 font-medium text-gray-800">{it.drugName || (it as any).name || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500">{it.brandName || '—'}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-gray-400 text-[10px]">{it.barcode || '—'}</td>
                        <td className="px-2 py-1.5 text-center">{it.pkgQty || it.qty}</td>
                        <td className="px-2 py-1.5 text-center">{it.sheetsPerPkg || 1}</td>
                        <td className="px-2 py-1.5 text-center font-bold text-blue-700">{it.qty}</td>
                        <td className="px-2 py-1.5 text-center text-orange-600">{(it.finalUnitCost ?? 0).toLocaleString('ar-IQ', { maximumFractionDigits: 0 })}</td>
                        {inv.discountType === 'item' && <td className="px-2 py-1.5 text-center text-amber-600">{it.itemDiscount ? `${it.itemDiscount}%` : '—'}</td>}
                        <td className="px-2 py-1.5 text-center text-sky-700 font-medium">{it.sellingPrice ? it.sellingPrice.toLocaleString('ar-IQ') : '—'}</td>
                        <td className="px-2 py-1.5 text-center font-bold">{(it.totalCost ?? 0).toLocaleString('ar-IQ')}</td>
                        <td className="px-2 py-1.5">{it.category || '—'}</td>
                        <td className="px-2 py-1.5 text-center text-gray-500">{it.expiry || '—'}</td>
                        <td className="px-2 py-1.5">{it.originCountry || '—'}</td>
                        <td className="px-2 py-1.5"><span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium">{purchase.warehouseName}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-gray-100">
                <span className="text-gray-500">إجمالي الفاتورة {i + 1}</span>
                <span className="font-bold text-sky-700">{(calcInvoiceSubtotal(inv) || 0).toLocaleString('ar-IQ')} IQD</span>
              </div>
            </div>
          ))}
          {purchase.notes && <p className="text-xs text-gray-400 pt-1">ملاحظات: {purchase.notes}</p>}
        </div>
      )}
    </div>
  );
}
