'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  QrCode, Camera, X, Plus, Minus, Trash2, ShoppingCart,
  Search, CheckCircle, Package, AlertTriangle, Printer,
  Megaphone, Tag, Pill, ClipboardList, ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react';
import type { StockBatch } from '../inventory/WarehouseTab';

const BAT_KEY   = 'pharmacy-stock-batches';
const SALE_KEY  = 'pharmacy-sales';
const CAMP_KEY  = 'pharmacy-campaigns';
const DISC_KEY   = 'pharmacy-discounts';
const RET_KEY    = 'pharmacy-returns';
const EXPIRY_WARN_KEY = 'pharmacy-expiry-warn-days'; // manager-configurable
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

function getExpiryWarnDays() {
  try { return Number(localStorage.getItem(EXPIRY_WARN_KEY)) || 30; } catch { return 30; }
}

// ── Types ────────────────────────────────────────────────────────────────────
interface CartItem {
  drugName: string; brandName: string; barcode: string;
  qty: number; sellingPrice: number; subtotal: number;
  batches: { batchId: string; qty: number; expiry: string }[];
  campaignId?: string; discountId?: string;
  apiId?: string; // for API-sourced drugs, deduct via API on checkout
}
interface Sale {
  id: string; items: CartItem[]; total: number;
  discount: number; paid: number; change: number; date: string; note: string;
}
interface ReturnRecord {
  id: string; date: string;
  drugName: string; brandName: string; qty: number;
  unitPrice: number; refund: number;
  reason: string; reasonNote: string;
  saleId?: string;
}
interface DrugStock {
  drugName: string; brandName: string; barcode: string;
  totalQty: number; sellingPrice: number; nearestExpiry: string;
  apiId?: string; // set for API-sourced drugs (not in local batches)
}
export interface CampaignItem {
  drugName: string; brandName: string; originalPrice: number;
  discountPct: number; campaignPrice: number;
}
export interface Campaign {
  id: string; name: string; description: string;
  startDate: string; endDate: string;
  items: CampaignItem[]; active: boolean;
}
export interface DiscountPreset {
  id: string; name: string;
  type: 'pct' | 'fixed'; value: number;
  scope: 'cart' | 'item'; note: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function loadBatches(): StockBatch[] {
  try { return JSON.parse(localStorage.getItem(BAT_KEY) || '[]'); } catch { return []; }
}
function saveBatches(b: StockBatch[]) { localStorage.setItem(BAT_KEY, JSON.stringify(b)); }
function loadCampaigns(): Campaign[] {
  try { return JSON.parse(localStorage.getItem(CAMP_KEY) || '[]'); } catch { return []; }
}
function loadDiscounts(): DiscountPreset[] {
  try { return JSON.parse(localStorage.getItem(DISC_KEY) || '[]'); } catch { return []; }
}

function buildStockMap(batches: StockBatch[]): DrugStock[] {
  const map = new Map<string, DrugStock>();
  batches.filter(b => b.qtyRemaining > 0)
    .sort((a, b) => {
      if (!a.expiry) return 1; if (!b.expiry) return -1;
      return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
    })
    .forEach(b => {
      const key = b.drugName.toLowerCase();
      if (!map.has(key)) map.set(key, { drugName: b.drugName, brandName: b.brandName || '', barcode: b.barcode || '', totalQty: 0, sellingPrice: b.sellingPrice || 0, nearestExpiry: b.expiry || '' });
      const d = map.get(key)!;
      d.totalQty += b.qtyRemaining;
      if (!d.sellingPrice && b.sellingPrice) d.sellingPrice = b.sellingPrice;
    });
  return Array.from(map.values());
}

function allocateFEFO(drugName: string, qty: number, batches: StockBatch[]) {
  const pool = batches.filter(b => b.drugName.toLowerCase() === drugName.toLowerCase() && b.qtyRemaining > 0)
    .sort((a, b) => { if (!a.expiry) return 1; if (!b.expiry) return -1; return new Date(a.expiry).getTime() - new Date(b.expiry).getTime(); });
  const alloc: { batchId: string; qty: number; expiry: string }[] = [];
  let rem = qty;
  for (const b of pool) {
    if (rem <= 0) break;
    const take = Math.min(b.qtyRemaining, rem);
    alloc.push({ batchId: b.id, qty: take, expiry: b.expiry });
    rem -= take;
  }
  return { alloc, ok: rem === 0 };
}

function daysLeft(exp: string) {
  if (!exp) return null;
  return Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
}

// ── Sale history card ─────────────────────────────────────────────────────────
function SaleCard({ sale }: { sale: Sale }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="text-right">
          <p className="text-xs text-gray-400">{new Date(sale.date).toLocaleString('ar-IQ')}</p>
          <p className="text-sm font-bold text-gray-900 mt-0.5">{sale.total.toLocaleString('ar-IQ')} د.ع</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-medium">{sale.items.length} صنف</span>
          {sale.discount > 0 && <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">خصم</span>}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
          {sale.items.map((it, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-600">{it.drugName}{it.campaignId ? ' ★' : ''} × {it.qty}</span>
              <span className="font-medium text-gray-800">{it.subtotal.toLocaleString('ar-IQ')} د.ع</span>
            </div>
          ))}
          <div className="border-t border-dashed pt-2 space-y-1 text-xs">
            {sale.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>خصم</span><span>- {sale.discount.toLocaleString('ar-IQ')} د.ع</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm">
              <span>الإجمالي</span><span>{sale.total.toLocaleString('ar-IQ')} د.ع</span>
            </div>
            {sale.paid > 0 && <div className="flex justify-between text-gray-500"><span>مدفوع</span><span>{sale.paid.toLocaleString('ar-IQ')}</span></div>}
            {sale.note && <p className="text-gray-400 mt-1">ملاحظة: {sale.note}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function SalesPage() {
  const [batches,  setBatches]  = useState<StockBatch[]>([]);
  const [stockMap, setStockMap] = useState<DrugStock[]>([]);
  const [campaigns,  setCampaigns]  = useState<Campaign[]>([]);
  const [discounts,  setDiscounts]  = useState<DiscountPreset[]>([]);
  const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
  const [query,    setQuery]    = useState('');
  const [showAllDrugs, setShowAllDrugs] = useState(false);
  const [expiryWarnDays, setExpiryWarnDays] = useState(30);
  const [showExpiryMgr, setShowExpiryMgr] = useState(false);
  const [editBatch, setEditBatch] = useState<{ id: string; drugName: string; expiry: string } | null>(null);
  const [editExpiryVal, setEditExpiryVal] = useState('');
  const [leftTab,  setLeftTab]  = useState<'drugs' | 'campaigns' | 'discounts' | 'history' | 'returns'>('drugs');
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [retSearch, setRetSearch] = useState('');
  const [retForm, setRetForm] = useState({ drugName: '', brandName: '', qty: '1', unitPrice: '', reason: '', reasonNote: '', saleId: '' });
  const [retError, setRetError] = useState('');
  const [retSuccess, setRetSuccess] = useState(false);
  const [cart,     setCart]     = useState<CartItem[]>([]);
  const [cartDiscount, setCartDiscount] = useState(''); // percentage 0–max
  const [userRole, setUserRole] = useState('employee');
  const [paid,     setPaid]     = useState('');
  const [note,     setNote]     = useState('');
  const [receipt,  setReceipt]  = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [pharmacyName, setPharmacyName] = useState('');

  // Add modal
  const [addModal,  setAddModal]  = useState<{ drug: DrugStock; campaignId?: string; discountId?: string; fixedPrice?: number } | null>(null);
  const [addQty,    setAddQty]    = useState('1');
  const [addPrice,  setAddPrice]  = useState('');
  const [addError,  setAddError]  = useState('');

  // Discount creation form
  const [showDiscForm, setShowDiscForm] = useState(false);
  const [discForm, setDiscForm] = useState({ name: '', type: 'pct' as 'pct'|'fixed', value: '', scope: 'cart' as 'cart'|'item', note: '' });

  // Barcode scanner
  const [scanning,   setScanning]   = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const videoRef   = useRef<HTMLVideoElement>(null);
  const zxingRef   = useRef<BrowserMultiFormatReader | null>(null);
  const scanActive = useRef(false);

  const reload = useCallback(async () => {
    const b = loadBatches();
    setBatches(b);
    const batchStock = buildStockMap(b);
    const batchKeys = new Set(batchStock.map(d => d.drugName.toLowerCase()));

    // Also fetch from API inventory so all drugs show up
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    let merged = [...batchStock];
    if (pharmacyId && token) {
      try {
        const res = await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const items: any[] = data.data || [];
          items.forEach(item => {
            const available = (item.quantity ?? 0) - (item.reserved_qty ?? 0);
            const name = (item.generic_name || item.brand_name || '').trim();
            if (!name || available <= 0) return;
            if (batchKeys.has(name.toLowerCase())) return; // already from batches
            merged.push({
              drugName: name,
              brandName: item.brand_name || '',
              barcode: item.barcode || '',
              totalQty: available,
              sellingPrice: Number(item.selling_price) || 0,
              nearestExpiry: item.expiry_date || '',
              apiId: item.id,
            });
          });
        }
      } catch {}
    }

    setStockMap(merged);
    setCampaigns(loadCampaigns());
    setDiscounts(loadDiscounts());
    try { setSalesHistory(JSON.parse(localStorage.getItem(SALE_KEY) || '[]').reverse()); } catch {}
    try { setReturns(JSON.parse(localStorage.getItem(RET_KEY) || '[]').reverse()); } catch {}
  }, []);

  useEffect(() => {
    reload();
    setUserRole(localStorage.getItem('pharmacy-role') || 'employee');
    setPharmacyName(localStorage.getItem('pharmacy-name') || 'الصيدلية');
    setExpiryWarnDays(getExpiryWarnDays());
  }, [reload]);

  // Rank drugs by total qty sold (most common first)
  const freqMap = new Map<string, number>();
  salesHistory.forEach(s => s.items.forEach(it => freqMap.set(it.drugName.toLowerCase(), (freqMap.get(it.drugName.toLowerCase()) || 0) + it.qty)));
  const rankedStock = [...stockMap].sort((a, b) => (freqMap.get(b.drugName.toLowerCase()) || 0) - (freqMap.get(a.drugName.toLowerCase()) || 0));

  const isManager = ['owner', 'assistant_manager'].includes(userRole);
  const hasQuery = query.trim().length > 0;
  const filtered = hasQuery
    ? stockMap.filter(d => d.drugName.toLowerCase().includes(query.toLowerCase()) || d.brandName.toLowerCase().includes(query.toLowerCase()) || d.barcode.includes(query))
    : showAllDrugs ? rankedStock : rankedStock.slice(0, 12);

  // Almost-expired batches (for manager panel)
  const warnBatches = batches.filter(b => {
    if (b.qtyRemaining <= 0 || !b.expiry) return false;
    const d = Math.ceil((new Date(b.expiry).getTime() - Date.now()) / 86400000);
    return d > 0 && d <= expiryWarnDays;
  }).sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());

  // ── Scanner ───────────────────────────────────────────────────────────────
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const releaseCamera = () => {
    try { (zxingRef.current as any)?.reset?.(); } catch {}
    zxingRef.current = null;
    try {
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    } catch {}
    try {
      const v = videoRef.current;
      if (v) { v.srcObject = null; v.load(); }
    } catch {}
  };

  const startScan = () => {
    setQuery(''); // clear previous barcode from search field
    setScanStatus('جاري فتح الكاميرا...');
    scanActive.current = true;
    setScanning(true);
  };

  const stopScan = () => {
    scanActive.current = false;
    releaseCamera();
    setScanning(false);
    setScanStatus('');
  };

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;

    const run = async () => {
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      if (cancelled) return;

      const video = videoRef.current;
      if (!video) { setScanStatus('خطأ: لم يتم العثور على عنصر الكاميرا'); return; }

      let stream: MediaStream | null = null;
      try {
        // Own the stream ourselves so we can stop tracks reliably
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

        await reader.decodeFromStream(stream, video, (result) => {
          if (cancelled || !scanActive.current) return;
          if (!result) return;
          scanActive.current = false;
          cancelled = true;
          const code = result.getText();
          stopScan();
          setLeftTab('drugs');
          const match = stockMap.find(d => d.barcode === code);
          if (match) openAddModal(match);
          else setQuery(code); // only set query if no direct match
        });
      } catch (e: any) {
        if (cancelled) return;
        if (stream) { stream.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; }
        const msg = e?.message || '';
        if (msg.includes('Permission') || msg.includes('NotAllowed')) {
          setScanStatus('⚠️ لم يتم منح إذن الكاميرا — تحقق من إعدادات المتصفح');
        } else if (msg.includes('NotFound') || msg.includes('Devices') || msg.includes('device')) {
          setScanStatus('⚠️ لا توجد كاميرا متصلة بالجهاز');
        } else {
          setScanStatus(`⚠️ خطأ: ${msg || 'تعذر فتح الكاميرا'}`);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      releaseCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // ── Add modal ─────────────────────────────────────────────────────────────
  const openAddModal = (drug: DrugStock, campaignId?: string, discountId?: string, fixedPrice?: number) => {
    setAddModal({ drug, campaignId, discountId, fixedPrice });
    setAddQty('1');
    setAddPrice(fixedPrice != null ? String(fixedPrice) : drug.sellingPrice > 0 ? String(drug.sellingPrice) : '');
    setAddError('');
  };

  const addToCart = () => {
    if (!addModal) return;
    const qty = Number(addQty); const price = Number(addPrice);
    if (!qty || qty <= 0) { setAddError('أدخل كمية صحيحة'); return; }
    if (!price || price < 0) { setAddError('أدخل سعر البيع'); return; }
    if (qty > addModal.drug.totalQty) { setAddError(`الكمية المتوفرة: ${addModal.drug.totalQty} فقط`); return; }

    const isApiOnly = !!addModal.drug.apiId;
    let alloc: { batchId: string; qty: number; expiry: string }[] = [];
    if (!isApiOnly) {
      const result = allocateFEFO(addModal.drug.drugName, qty, batches);
      if (!result.ok) { setAddError('الكمية غير كافية في المخزون'); return; }
      alloc = result.alloc;
    }

    setCart(prev => {
      const existing = prev.findIndex(c => c.drugName.toLowerCase() === addModal.drug.drugName.toLowerCase());
      if (existing >= 0) return prev.map((c, i) => i !== existing ? c : { ...c, qty: c.qty + qty, subtotal: (c.qty + qty) * price, sellingPrice: price, batches: [...c.batches, ...alloc] });
      return [...prev, { drugName: addModal.drug.drugName, brandName: addModal.drug.brandName, barcode: addModal.drug.barcode, qty, sellingPrice: price, subtotal: qty * price, batches: alloc, campaignId: addModal.campaignId, discountId: addModal.discountId, apiId: addModal.drug.apiId }];
    });
    setAddModal(null);
    setQuery(''); // clear barcode/search after adding item
  };

  const removeFromCart = (i: number) => setCart(prev => prev.filter((_, j) => j !== i));
  const changeQty = (i: number, delta: number) => setCart(prev => prev.map((c, j) => j !== i ? c : { ...c, qty: Math.max(1, c.qty + delta), subtotal: Math.max(1, c.qty + delta) * c.sellingPrice }));

  // Apply discount preset to cart (percentage only, capped at maxDiscPct)
  const applyDiscountPreset = (d: DiscountPreset) => {
    if (d.scope !== 'cart') return;
    const pct = d.type === 'pct' ? d.value : Math.round((d.value / subtotal) * 100);
    setCartDiscount(String(Math.min(pct, maxDiscPct)));
  };

  // Totals
  const maxDiscPct = ['owner', 'assistant_manager'].includes(userRole) ? 100 : 10;
  const subtotal   = cart.reduce((s, c) => s + c.subtotal, 0);
  const discPct    = Math.min(Math.max(Number(cartDiscount) || 0, 0), maxDiscPct);
  const discAmt    = Math.round(subtotal * discPct / 100);
  const total      = subtotal - discAmt;
  const paidAmt    = Number(paid) || 0;
  const change     = paidAmt - total;

  // Checkout
  const checkout = async () => {
    if (cart.length === 0) return;

    // Deduct local batches
    const updated = [...batches];
    cart.forEach(item => item.batches.forEach(alloc => {
      const idx = updated.findIndex(b => b.id === alloc.batchId);
      if (idx >= 0) updated[idx] = { ...updated[idx], qtyRemaining: Math.max(0, updated[idx].qtyRemaining - alloc.qty) };
    }));
    saveBatches(updated);

    // Deduct API-sourced drugs
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (token && pharmacyId) {
      const apiItems = cart.filter(item => item.apiId && item.batches.length === 0);
      await Promise.all(apiItems.map(item => {
        const drug = stockMap.find(d => d.apiId === item.apiId);
        const newQty = Math.max(0, (drug?.totalQty ?? item.qty) - item.qty);
        return fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory/${item.apiId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ quantity: newQty }),
        }).catch(() => {});
      }));
    }

    const sale: Sale = { id: uid(), items: cart, total, discount: discAmt, paid: paidAmt, change, date: new Date().toISOString(), note };
    try { const sales = JSON.parse(localStorage.getItem(SALE_KEY) || '[]'); sales.push(sale); localStorage.setItem(SALE_KEY, JSON.stringify(sales)); } catch {}
    setReceipt(sale); setShowReceipt(true);
    setCart([]); setCartDiscount(''); setPaid(''); setNote('');
    reload();
  };

  // Save discount preset
  const saveDiscount = () => {
    if (!discForm.name.trim() || !discForm.value) return;
    const d: DiscountPreset = { id: uid(), name: discForm.name.trim(), type: discForm.type, value: Number(discForm.value), scope: discForm.scope, note: discForm.note };
    const next = [...discounts, d];
    setDiscounts(next); localStorage.setItem(DISC_KEY, JSON.stringify(next));
    setDiscForm({ name: '', type: 'pct', value: '', scope: 'cart', note: '' });
    setShowDiscForm(false);
  };

  const deleteDiscount = (id: string) => {
    const next = discounts.filter(d => d.id !== id);
    setDiscounts(next); localStorage.setItem(DISC_KEY, JSON.stringify(next));
  };

  const activeCampaigns = campaigns.filter(c => {
    if (!c.active) return false;
    const now = Date.now();
    if (c.startDate && new Date(c.startDate).getTime() > now) return false;
    if (c.endDate   && new Date(c.endDate).getTime()   < now) return false;
    return true;
  });

  // ── Drug card sub-component ───────────────────────────────────────────────
  const DrugCard = ({ drug }: { drug: DrugStock }) => {
    const d = daysLeft(drug.nearestExpiry);
    const expired    = d !== null && d <= 0;
    const soonExpire = d !== null && d > 0 && d <= expiryWarnDays;
    return (
      <div className="relative">
        <button onClick={() => { if (expired || drug.totalQty === 0) return; openAddModal(drug); }}
          className={`w-full bg-white rounded-2xl p-4 text-right shadow-sm border-2 transition-all text-sm space-y-2
            ${expired ? 'cursor-not-allowed border-red-300 bg-red-50' : drug.totalQty === 0 ? 'opacity-40 cursor-not-allowed border-gray-200' : 'border-transparent hover:border-sky-400 hover:shadow-md cursor-pointer'}`}>
          <div className="flex items-start justify-between gap-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${expired ? 'bg-red-200 text-red-700' : drug.totalQty <= 5 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-700'}`}>{drug.totalQty} ق</span>
            {soonExpire && !expired && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">{d}ي</span>}
          </div>
          <div>
            <p className={`font-bold leading-tight line-clamp-2 ${expired ? 'text-red-700' : 'text-gray-900'}`}>{drug.drugName}</p>
            {drug.brandName && <p className="text-xs text-gray-400 mt-0.5">{drug.brandName}</p>}
          </div>
          {drug.sellingPrice > 0 && !expired && <p className="text-sky-600 font-bold">{drug.sellingPrice.toLocaleString('ar-IQ')} <span className="text-xs font-normal text-gray-400">د.ع</span></p>}
          {drug.barcode && <p className="text-[10px] text-gray-300 font-mono tracking-wide truncate" dir="ltr">{drug.barcode}</p>}
          {expired && (
            <div className="flex items-center gap-1 bg-red-100 text-red-700 rounded-xl px-2 py-1.5 mt-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="text-[10px] font-bold leading-tight">منتهي — لا يُباع</span>
            </div>
          )}
        </button>
      </div>
    );
  };

  const processReturn = () => {
    setRetError('');
    const qty = Number(retForm.qty);
    const unitPrice = Number(retForm.unitPrice);
    if (!retForm.drugName.trim()) { setRetError('اختر الدواء المُرتجع'); return; }
    if (!qty || qty <= 0)         { setRetError('أدخل الكمية'); return; }
    if (!retForm.reason)          { setRetError('اختر سبب الإرجاع'); return; }

    // Restore qty to local batches — add back to the first matching batch
    const updatedBatches = [...batches];
    const batchIdx = updatedBatches.findIndex(b => b.drugName.toLowerCase() === retForm.drugName.toLowerCase());
    if (batchIdx >= 0) {
      updatedBatches[batchIdx] = { ...updatedBatches[batchIdx], qtyRemaining: updatedBatches[batchIdx].qtyRemaining + qty };
      saveBatches(updatedBatches);
    }
    // If API-sourced: try to increment via API
    const apiDrug = stockMap.find(d => d.drugName.toLowerCase() === retForm.drugName.toLowerCase() && d.apiId);
    if (apiDrug?.apiId) {
      const token = localStorage.getItem('pharmacy-token');
      const pharmacyId = localStorage.getItem('pharmacy-id');
      if (token && pharmacyId) {
        fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory/${apiDrug.apiId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ quantity: (apiDrug.totalQty || 0) + qty }),
        }).catch(() => {});
      }
    }

    const rec: ReturnRecord = {
      id: uid(), date: new Date().toISOString(),
      drugName: retForm.drugName.trim(), brandName: retForm.brandName,
      qty, unitPrice, refund: qty * unitPrice,
      reason: retForm.reason, reasonNote: retForm.reasonNote,
      saleId: retForm.saleId || undefined,
    };
    try {
      const prev = JSON.parse(localStorage.getItem(RET_KEY) || '[]');
      prev.push(rec);
      localStorage.setItem(RET_KEY, JSON.stringify(prev));
    } catch {}

    setRetForm({ drugName: '', brandName: '', qty: '1', unitPrice: '', reason: '', reasonNote: '', saleId: '' });
    setRetSearch('');
    setRetSuccess(true);
    setTimeout(() => setRetSuccess(false), 3000);
    reload();
  };

  const saveEditedExpiry = () => {
    if (!editBatch || !editExpiryVal) return;
    const updated = batches.map(b => b.id === editBatch.id ? { ...b, expiry: editExpiryVal } : b);
    saveBatches(updated);
    setBatches(updated);
    setEditBatch(null);
    reload();
  };

  return (
    <div className="flex gap-4 h-full" dir="rtl">

      {/* ── Expiry Manager Modal ── */}
      {showExpiryMgr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900">إدارة الدفعات المنتهية قريباً</h3>
              <button onClick={() => { setShowExpiryMgr(false); setEditBatch(null); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {warnBatches.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-12">لا توجد دفعات تحتاج انتباهاً</p>
              ) : warnBatches.map(b => {
                const d = Math.ceil((new Date(b.expiry).getTime() - Date.now()) / 86400000);
                const isEditing = editBatch?.id === b.id;
                return (
                  <div key={b.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{b.drugName}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                          <span>الكمية: <strong>{b.qtyRemaining}</strong></span>
                          <span className={`font-bold px-2 py-0.5 rounded-full ${d <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {d <= 7 ? `⚠ ${d} أيام فقط` : `${d} يوم`}
                          </span>
                          <span dir="ltr" className="font-mono">{b.expiry}</span>
                        </div>
                      </div>
                      {!isEditing && (
                        <button onClick={() => { setEditBatch({ id: b.id, drugName: b.drugName, expiry: b.expiry }); setEditExpiryVal(b.expiry); }}
                          className="text-xs bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 px-3 py-1.5 rounded-lg font-medium shrink-0">
                          تعديل تاريخ الانتهاء
                        </button>
                      )}
                    </div>
                    {isEditing && (
                      <div className="mt-3 bg-sky-50 rounded-xl p-3 space-y-3">
                        <p className="text-xs text-sky-700 font-medium">تمديد أو تعديل تاريخ انتهاء الصلاحية</p>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { label: '+1 يوم',    days: 1   },
                            { label: '+7 أيام',   days: 7   },
                            { label: '+1 شهر',    days: 30  },
                            { label: '+2 شهر',    days: 60  },
                            { label: '+3 أشهر',   days: 90  },
                          ].map(({ label, days }) => (
                            <button key={days} onClick={() => {
                              const base = new Date(editExpiryVal || b.expiry);
                              base.setDate(base.getDate() + days);
                              setEditExpiryVal(base.toISOString().slice(0, 10));
                            }} className="text-xs bg-white border border-sky-300 text-sky-700 px-2.5 py-1.5 rounded-lg hover:bg-sky-100 font-medium">
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="date" value={editExpiryVal} onChange={e => setEditExpiryVal(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" dir="ltr" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditBatch(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
                          <button onClick={saveEditedExpiry} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2 rounded-xl text-sm font-bold">حفظ التاريخ</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Scan modal ── */}
      {scanning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold">مسح باركود</h3>
              <button onClick={stopScan}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-28 relative">
                  {['top-0 right-0 border-t-2 border-r-2 rounded-tr','top-0 left-0 border-t-2 border-l-2 rounded-tl','bottom-0 right-0 border-b-2 border-r-2 rounded-br','bottom-0 left-0 border-b-2 border-l-2 rounded-bl'].map(c => <div key={c} className={`absolute w-5 h-5 border-white ${c}`} />)}
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-400 animate-pulse" />
                </div>
              </div>
              {scanStatus && <div className="absolute bottom-3 left-0 right-0 text-center"><span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">{scanStatus}</span></div>}
            </div>
            <div className="p-4"><button onClick={stopScan} className="w-full border border-gray-300 py-2 rounded-xl text-sm">إغلاق</button></div>
          </div>
        </div>
      )}

      {/* ── Add modal ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">{addModal.drug.drugName}</h3>
                {addModal.campaignId && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">حملة</span>}
                {addModal.discountId && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">خصم</span>}
              </div>
              <button onClick={() => setAddModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {addModal.drug.brandName && <p className="text-sm text-gray-500 -mt-2">{addModal.drug.brandName}</p>}
            {addModal.drug.barcode && <p className="text-xs font-mono text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg tracking-widest" dir="ltr">📦 {addModal.drug.barcode}</p>}
            <div className="bg-sky-50 rounded-xl px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-500">الكمية المتوفرة</span>
              <span className="font-bold text-sky-700">{addModal.drug.totalQty} قطعة</span>
            </div>
            {addError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{addError}</p>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الكمية</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setAddQty(q => String(Math.max(1, Number(q) - 1)))} className="w-10 h-10 rounded-xl border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50">−</button>
                <input type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)} className="flex-1 text-center text-xl font-bold border border-gray-300 rounded-xl py-2 outline-none focus:ring-2 focus:ring-sky-500" />
                <button onClick={() => setAddQty(q => String(Math.min(addModal.drug.totalQty, Number(q) + 1)))} className="w-10 h-10 rounded-xl border border-sky-400 bg-sky-50 flex items-center justify-center text-lg font-bold text-sky-600 hover:bg-sky-100">+</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">سعر البيع / قطعة (د.ع)</label>
              <input type="number" min="0" value={addPrice} onChange={e => setAddPrice(e.target.value)} placeholder="0"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            {addQty && addPrice && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-500">الإجمالي</span>
                <span className="font-bold text-lg">{(Number(addQty) * Number(addPrice)).toLocaleString('ar-IQ')} د.ع</span>
              </div>
            )}
            <button onClick={addToCart} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
              <ShoppingCart className="w-4 h-4" /> إضافة إلى الفاتورة
            </button>
          </div>
        </div>
      )}

      {/* ── Print-only thermal receipt (hidden on screen) ── */}
      {receipt && (
        <div id="thermal-receipt" dir="rtl" style={{ display: 'none' }}>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #thermal-receipt, #thermal-receipt * { visibility: visible !important; }
              #thermal-receipt {
                display: block !important;
                position: fixed; top: 0; left: 0; right: 0;
                width: 80mm;
                margin: 0 auto;
                padding: 6mm 4mm;
                font-family: 'Courier New', monospace;
                font-size: 11px;
                color: #000;
                background: #fff;
              }
            }
          `}</style>
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '6px', marginBottom: '6px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{pharmacyName}</div>
            <div style={{ fontSize: '10px', marginTop: '2px', color: '#333' }}>
              {new Date(receipt.date).toLocaleString('ar-IQ')}
            </div>
            <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>رقم الفاتورة: {receipt.id.slice(-8).toUpperCase()}</div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px dashed #000' }}>
                <th style={{ textAlign: 'right', paddingBottom: '3px' }}>الصنف</th>
                <th style={{ textAlign: 'center', paddingBottom: '3px' }}>ك</th>
                <th style={{ textAlign: 'center', paddingBottom: '3px' }}>سعر</th>
                <th style={{ textAlign: 'left', paddingBottom: '3px' }}>مجموع</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((it, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'right', paddingTop: '3px', maxWidth: '28mm', wordBreak: 'break-word' }}>
                    {it.drugName}{it.campaignId ? ' ★' : ''}
                  </td>
                  <td style={{ textAlign: 'center', paddingTop: '3px' }}>{it.qty}</td>
                  <td style={{ textAlign: 'center', paddingTop: '3px' }}>{it.sellingPrice.toLocaleString('ar-IQ')}</td>
                  <td style={{ textAlign: 'left', paddingTop: '3px', whiteSpace: 'nowrap' }}>{it.subtotal.toLocaleString('ar-IQ')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span>المجموع الفرعي</span>
              <span>{(receipt.total + receipt.discount).toLocaleString('ar-IQ')} د.ع</span>
            </div>
            {receipt.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span>الخصم ({discPct}%)</span>
                <span>- {receipt.discount.toLocaleString('ar-IQ')} د.ع</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', borderTop: '1px dashed #000', marginTop: '4px', paddingTop: '4px' }}>
              <span>الإجمالي</span>
              <span>{receipt.total.toLocaleString('ar-IQ')} د.ع</span>
            </div>
            {receipt.paid > 0 && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '3px' }}>
                <span>المبلغ المدفوع</span>
                <span>{receipt.paid.toLocaleString('ar-IQ')} د.ع</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span>الباقي</span>
                <span>{Math.max(0, receipt.change).toLocaleString('ar-IQ')} د.ع</span>
              </div>
            </>}
          </div>

          {receipt.note && (
            <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px', fontSize: '10px', color: '#444' }}>
              ملاحظة: {receipt.note}
            </div>
          )}

          <div style={{ textAlign: 'center', borderTop: '1px dashed #000', marginTop: '8px', paddingTop: '6px', fontSize: '10px', color: '#555' }}>
            شكراً لزيارتكم
          </div>
        </div>
      )}

      {/* ── Receipt modal ── */}
      {showReceipt && receipt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm" dir="rtl">
            <div className="p-6 space-y-3">
              <div className="text-center space-y-1">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto"><CheckCircle className="w-8 h-8 text-green-500" /></div>
                <h3 className="font-bold text-gray-900 text-lg">تمت عملية البيع</h3>
                <p className="text-xs text-gray-400">{new Date(receipt.date).toLocaleString('ar-IQ')}</p>
              </div>
              <div className="border-t border-dashed pt-3 space-y-1.5">
                {receipt.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-500">{it.drugName} × {it.qty}{it.campaignId ? ' 🏷' : ''}</span>
                    <span className="font-medium">{it.subtotal.toLocaleString('ar-IQ')}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 space-y-1.5 text-sm">
                {receipt.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>خصم {discPct}%</span>
                    <span>- {receipt.discount.toLocaleString('ar-IQ')} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base"><span>الإجمالي</span><span>{receipt.total.toLocaleString('ar-IQ')} د.ع</span></div>
                {receipt.paid > 0 && <>
                  <div className="flex justify-between"><span className="text-gray-500">المدفوع</span><span>{receipt.paid.toLocaleString('ar-IQ')}</span></div>
                  <div className="flex justify-between text-sky-600 font-semibold"><span>الباقي</span><span>{Math.max(0, receipt.change).toLocaleString('ar-IQ')} د.ع</span></div>
                </>}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => {
                window.onafterprint = () => { window.onafterprint = null; setShowReceipt(false); };
                window.print();
              }} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> طباعة وإغلاق
              </button>
              <button onClick={() => setShowReceipt(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إغلاق فقط</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ LEFT PANEL ══ */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">

        {/* Tabs */}
        <div className="flex gap-0.5 bg-gray-100 rounded-2xl p-1">
          {([
            ['drugs',     <Pill key="p" className="w-3.5 h-3.5" />,        'الأدوية'],
            ['campaigns', <Megaphone key="m" className="w-3.5 h-3.5" />,   'الحملات'],
            ['discounts', <Tag key="t" className="w-3.5 h-3.5" />,         'الخصومات'],
            ['history',   <ClipboardList key="h" className="w-3.5 h-3.5" />,'السجل'],
            ['returns',   <RotateCcw key="r" className="w-3.5 h-3.5" />,   'مرتجع'],
          ] as const).map(([tab, icon, label]) => (
            <button key={tab} onClick={() => setLeftTab(tab as any)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-bold transition-all ${leftTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {icon}<span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Tab: Drugs ── */}
        {leftTab === 'drugs' && (
          <>
            {/* Search + scan row */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input value={query} onChange={e => { setQuery(e.target.value); if (e.target.value) setShowAllDrugs(true); }} placeholder="ابحث بالاسم أو الاسم التجاري..."
                className="flex-1 outline-none text-sm bg-transparent" />
              {query && <button onClick={() => { setQuery(''); setShowAllDrugs(false); }}><X className="w-4 h-4 text-gray-400" /></button>}
              <div className="w-px h-5 bg-gray-200 shrink-0" />
              <button onClick={startScan} className="flex items-center gap-1.5 text-gray-700 hover:text-sky-600 shrink-0 text-sm font-medium">
                <Camera className="w-5 h-5" /><span>مسح</span>
              </button>
            </div>
            <div className="flex items-center gap-2 bg-white border border-dashed border-gray-300 rounded-2xl px-4 py-2.5">
              <QrCode className="w-4 h-4 text-gray-400 shrink-0" />
              <input placeholder="أو أدخل رقم الباركود يدوياً ثم اضغط Enter..." dir="ltr"
                className="flex-1 outline-none text-sm bg-transparent font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal"
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  const code = (e.target as HTMLInputElement).value.trim();
                  if (!code) return;
                  setQuery(code); setShowAllDrugs(true);
                  const match = stockMap.find(d => d.barcode === code);
                  if (match) { openAddModal(match); (e.target as HTMLInputElement).value = ''; }
                }} />
            </div>

            {/* Amber expiry alert bar */}
            {warnBatches.length > 0 && (
              <div className={`rounded-2xl border-2 px-4 py-3 flex items-center justify-between gap-3 ${warnBatches.some(b => Math.ceil((new Date(b.expiry).getTime() - Date.now()) / 86400000) <= 7) ? 'border-red-400 bg-red-50' : 'border-amber-400 bg-amber-50 animate-pulse'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 font-medium truncate">
                    {warnBatches.length} دفعة تقترب من انتهاء الصلاحية خلال {expiryWarnDays} يوم
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isManager && (
                    <button onClick={() => setShowExpiryMgr(true)}
                      className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium">
                      إدارة
                    </button>
                  )}
                </div>
              </div>
            )}


            <div className="flex-1 overflow-y-auto">
              {stockMap.length === 0 ? (
                <div className="text-center py-20 space-y-3"><Package className="w-14 h-14 mx-auto text-gray-200" /><p className="text-gray-400 text-sm">لا يوجد مخزون مسجل بعد</p></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-20"><p className="text-gray-400 text-sm">لا توجد نتائج لـ «{query}»</p></div>
              ) : (
                <div className="space-y-3">
                  {!hasQuery && !showAllDrugs && (
                    <p className="text-xs text-gray-400 px-1">الأكثر مبيعاً</p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map(drug => <DrugCard key={drug.drugName} drug={drug} />)}
                  </div>
                  {!hasQuery && !showAllDrugs && stockMap.length > 12 && (
                    <button onClick={() => setShowAllDrugs(true)}
                      className="w-full py-2.5 text-sm text-sky-600 font-medium border border-sky-200 rounded-2xl hover:bg-sky-50 transition-all">
                      عرض جميع الأدوية ({stockMap.length})
                    </button>
                  )}
                  {!hasQuery && showAllDrugs && stockMap.length > 12 && (
                    <button onClick={() => setShowAllDrugs(false)}
                      className="w-full py-2.5 text-sm text-gray-500 font-medium border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all">
                      عرض الأكثر مبيعاً فقط
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Tab: Campaigns ── */}
        {leftTab === 'campaigns' && (
          <div className="flex-1 overflow-y-auto space-y-4">
            {activeCampaigns.length === 0 ? (
              <div className="text-center py-20 space-y-3 bg-white rounded-2xl shadow-sm">
                <Megaphone className="w-14 h-14 mx-auto text-gray-200" />
                <p className="text-gray-500 font-medium">لا توجد حملات نشطة</p>
                <p className="text-xs text-gray-400">أنشئ حملة من صفحة الحملات الإعلانية</p>
              </div>
            ) : activeCampaigns.map(camp => (
              <div key={camp.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-l from-orange-500 to-amber-400 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-white shrink-0" />
                    <h3 className="font-bold text-white text-base">{camp.name}</h3>
                  </div>
                  {camp.description && <p className="text-orange-100 text-xs mt-1">{camp.description}</p>}
                  <div className="flex gap-3 mt-2 text-xs text-orange-100">
                    {camp.startDate && <span>من {camp.startDate}</span>}
                    {camp.endDate   && <span>إلى {camp.endDate}</span>}
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {camp.items.map((item, i) => {
                    const inStock = stockMap.find(d => d.drugName.toLowerCase() === item.drugName.toLowerCase());
                    const available = inStock && inStock.totalQty > 0;
                    return (
                      <div key={i} className={`flex items-center justify-between px-5 py-3 ${available ? 'hover:bg-orange-50 cursor-pointer' : 'opacity-40'}`}
                        onClick={() => { if (!available || !inStock) return; openAddModal(inStock, camp.id, undefined, item.campaignPrice); }}>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{item.drugName}</p>
                          {item.brandName && <p className="text-xs text-gray-400">{item.brandName}</p>}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400 line-through">{item.originalPrice.toLocaleString('ar-IQ')}</span>
                            <span className="text-xs font-bold text-orange-600">{item.campaignPrice.toLocaleString('ar-IQ')} د.ع</span>
                            <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">خصم {item.discountPct}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {available
                            ? <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg">{inStock!.totalQty} ق متوفر</span>
                            : <span className="text-xs text-gray-400">غير متوفر</span>}
                          {available && <Plus className="w-5 h-5 text-orange-500 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Discounts ── */}
        {leftTab === 'discounts' && (
          <div className="flex-1 overflow-y-auto space-y-3">
            <button onClick={() => setShowDiscForm(v => !v)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-sky-300 hover:border-sky-500 text-sky-600 py-3 rounded-2xl text-sm font-medium transition-all">
              <Plus className="w-4 h-4" /> إضافة خصم جديد
            </button>

            {showDiscForm && (
              <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-gray-900">خصم جديد</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">اسم الخصم *</label>
                  <input value={discForm.name} onChange={e => setDiscForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: خصم رمضان"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">النوع</label>
                    <select value={discForm.type} onChange={e => setDiscForm(f => ({ ...f, type: e.target.value as any }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                      <option value="pct">نسبة مئوية %</option>
                      <option value="fixed">مبلغ ثابت د.ع</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">القيمة *</label>
                    <input type="number" min="0" value={discForm.value} onChange={e => setDiscForm(f => ({ ...f, value: e.target.value }))}
                      placeholder={discForm.type === 'pct' ? '10' : '5000'}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">التطبيق</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([['cart','على الفاتورة كاملة'],['item','على صنف محدد']] as const).map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setDiscForm(f => ({ ...f, scope: val }))}
                        className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${discForm.scope === val ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظة</label>
                  <input value={discForm.note} onChange={e => setDiscForm(f => ({ ...f, note: e.target.value }))} placeholder="اختياري"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowDiscForm(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
                  <button onClick={saveDiscount} disabled={!discForm.name.trim() || !discForm.value}
                    className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold">حفظ الخصم</button>
                </div>
              </div>
            )}

            {discounts.length === 0 && !showDiscForm && (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <Tag className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">لا توجد خصومات محفوظة</p>
              </div>
            )}

            {discounts.map(d => (
              <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-sm">{d.name}</p>
                    <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">
                      {d.type === 'pct' ? `${d.value}%` : `${d.value.toLocaleString('ar-IQ')} د.ع`}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{d.scope === 'cart' ? 'فاتورة' : 'صنف'}</span>
                  </div>
                  {d.note && <p className="text-xs text-gray-400 mt-0.5">{d.note}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.scope === 'cart' && cart.length > 0 && (
                    <button onClick={() => applyDiscountPreset(d)}
                      className="text-xs bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg font-medium">
                      تطبيق
                    </button>
                  )}
                  <button onClick={() => deleteDiscount(d.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: History ── */}
        {leftTab === 'history' && (
          <div className="flex-1 overflow-y-auto space-y-3">
            {salesHistory.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 shadow-sm text-center">
                <ClipboardList className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">لا توجد مبيعات مسجلة بعد</p>
              </div>
            ) : salesHistory.map(sale => (
              <SaleCard key={sale.id} sale={sale} />
            ))}
          </div>
        )}

        {/* ── Tab: Returns ── */}
        {leftTab === 'returns' && (
          <div className="flex-1 overflow-y-auto space-y-4">

            {/* Return form */}
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-orange-500" /> إرجاع صنف
              </h3>

              {retSuccess && (
                <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 text-green-700 text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> تم تسجيل الإرجاع وإعادة الكمية للمخزون
                </div>
              )}
              {retError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{retError}</p>}

              {/* Drug search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الدواء المُرتجع *</label>
                <div className="relative">
                  <input value={retSearch} onChange={e => { setRetSearch(e.target.value); setRetForm(f => ({ ...f, drugName: e.target.value })); }}
                    placeholder="ابحث أو اكتب اسم الدواء..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  {retSearch && (
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                      {stockMap.filter(d => d.drugName.toLowerCase().includes(retSearch.toLowerCase())).slice(0, 8).map(d => (
                        <button key={d.drugName} onClick={() => {
                          setRetForm(f => ({ ...f, drugName: d.drugName, brandName: d.brandName, unitPrice: d.sellingPrice > 0 ? String(d.sellingPrice) : '' }));
                          setRetSearch(d.drugName);
                        }} className="w-full text-right px-4 py-2.5 hover:bg-orange-50 text-sm border-b border-gray-50 last:border-0">
                          <span className="font-medium">{d.drugName}</span>
                          {d.brandName && <span className="text-gray-400 text-xs mr-2">{d.brandName}</span>}
                        </button>
                      ))}
                      {stockMap.filter(d => d.drugName.toLowerCase().includes(retSearch.toLowerCase())).length === 0 && (
                        <p className="text-center text-gray-400 text-xs py-3">لا توجد نتائج — يمكنك الكتابة يدوياً</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">الكمية *</label>
                  <input type="number" min="1" value={retForm.qty} onChange={e => setRetForm(f => ({ ...f, qty: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">سعر الوحدة (د.ع)</label>
                  <input type="number" min="0" value={retForm.unitPrice} onChange={e => setRetForm(f => ({ ...f, unitPrice: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>

              {retForm.qty && retForm.unitPrice && Number(retForm.unitPrice) > 0 && (
                <div className="bg-orange-50 rounded-xl px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-gray-500">المبلغ المُسترد</span>
                  <span className="font-bold text-orange-700">{(Number(retForm.qty) * Number(retForm.unitPrice)).toLocaleString('ar-IQ')} د.ع</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">سبب الإرجاع *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['damaged',   'تالف / معيب'],
                    ['wrong',     'صنف خاطئ'],
                    ['expired',   'منتهي الصلاحية'],
                    ['allergy',   'حساسية'],
                    ['doctor',    'تعديل وصفة'],
                    ['other',     'سبب آخر'],
                  ].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setRetForm(f => ({ ...f, reason: val }))}
                      className={`py-2 px-3 rounded-xl text-xs font-medium border-2 text-right transition-all ${retForm.reason === val ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ملاحظة إضافية</label>
                <input value={retForm.reasonNote} onChange={e => setRetForm(f => ({ ...f, reasonNote: e.target.value }))}
                  placeholder="اختياري..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الفاتورة الأصلية (اختياري)</label>
                <select value={retForm.saleId} onChange={e => {
                  const sale = salesHistory.find(s => s.id === e.target.value);
                  setRetForm(f => ({ ...f, saleId: e.target.value }));
                  if (sale && sale.items.length === 1) {
                    setRetForm(f => ({ ...f, saleId: e.target.value, drugName: sale.items[0].drugName, brandName: sale.items[0].brandName, unitPrice: String(sale.items[0].sellingPrice) }));
                    setRetSearch(sale.items[0].drugName);
                  }
                }} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option value="">-- اختر فاتورة (اختياري) --</option>
                  {salesHistory.slice(0, 20).map(s => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.date).toLocaleDateString('ar-IQ')} — {s.total.toLocaleString('ar-IQ')} د.ع ({s.items.map(i => i.drugName).join('، ')})
                    </option>
                  ))}
                </select>
              </div>

              <button onClick={processReturn}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> تأكيد الإرجاع وإعادة للمخزون
              </button>
            </div>

            {/* Returns history */}
            {returns.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 px-1 font-medium">سجل المرتجعات</p>
                {returns.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{r.drugName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(r.date).toLocaleString('ar-IQ')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-orange-600">{r.qty} قطعة</p>
                        {r.refund > 0 && <p className="text-xs text-gray-500">{r.refund.toLocaleString('ar-IQ')} د.ع</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                        {{ damaged:'تالف', wrong:'صنف خاطئ', expired:'منتهي', allergy:'حساسية', doctor:'تعديل وصفة', other:'سبب آخر' }[r.reason] ?? r.reason}
                      </span>
                      {r.reasonNote && <span className="text-xs text-gray-400">{r.reasonNote}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ RIGHT: Cart ══ */}
      <div className="w-80 shrink-0 flex flex-col gap-3">
        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-sky-500" />
            <span className="font-bold text-gray-900">الفاتورة</span>
          </div>
          {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600 font-medium">مسح الكل</button>}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {cart.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm space-y-2">
              <ShoppingCart className="w-10 h-10 mx-auto text-gray-200" />
              <p className="text-xs text-gray-400">اختر دواءً من اليسار</p>
            </div>
          ) : cart.map((item, i) => (
            <div key={i} className="bg-white rounded-2xl p-3 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm truncate">{item.drugName}</p>
                    {item.campaignId && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 rounded-full shrink-0">حملة</span>}
                  </div>
                  <p className="text-xs text-gray-400">{item.sellingPrice.toLocaleString('ar-IQ')} × {item.qty}</p>
                </div>
                <button onClick={() => removeFromCart(i)} className="p-1 text-red-400 hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(i, -1)} className="w-7 h-7 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"><Minus className="w-3 h-3" /></button>
                  <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                  <button onClick={() => changeQty(i, 1)} className="w-7 h-7 rounded-lg border border-sky-300 bg-sky-50 flex items-center justify-center text-sky-600 hover:bg-sky-100"><Plus className="w-3 h-3" /></button>
                </div>
                <span className="font-bold text-gray-900 text-sm">{item.subtotal.toLocaleString('ar-IQ')}</span>
              </div>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex justify-between text-sm text-gray-500">
              <span>المجموع الفرعي</span>
              <span className="font-medium text-gray-800">{subtotal.toLocaleString('ar-IQ')} د.ع</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">خصم %</label>
                <span className="text-xs text-gray-400">الحد الأقصى: {maxDiscPct}%</span>
              </div>
              <div className="relative">
                <input
                  type="number" min="0" max={maxDiscPct} step="0.5"
                  value={cartDiscount}
                  onChange={e => {
                    const v = Math.min(Number(e.target.value), maxDiscPct);
                    setCartDiscount(v < 0 ? '' : String(v));
                  }}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 pr-8"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span>
              </div>
              {discPct > 0 && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  خصم {discPct}% = {discAmt.toLocaleString('ar-IQ')} د.ع
                </p>
              )}
              {/* Quick pct chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[5, 10].filter(p => p <= maxDiscPct).map(p => (
                  <button key={p} onClick={() => setCartDiscount(String(p))}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${discPct === p ? 'bg-sky-500 text-white border-sky-500' : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'}`}>
                    {p}%
                  </button>
                ))}
                {discounts.filter(d => d.scope === 'cart' && d.type === 'pct' && d.value <= maxDiscPct).map(d => (
                  <button key={d.id} onClick={() => setCartDiscount(String(d.value))}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${discPct === d.value ? 'bg-sky-500 text-white border-sky-500' : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'}`}>
                    {d.name} {d.value}%
                  </button>
                ))}
                {discPct > 0 && (
                  <button onClick={() => setCartDiscount('')} className="text-xs bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 px-2 py-1 rounded-lg">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-3">
              <span>الإجمالي</span>
              <span className="text-sky-700">{total.toLocaleString('ar-IQ')} د.ع</span>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">المبلغ المدفوع</label>
              <input type="number" min="0" value={paid} onChange={e => setPaid(e.target.value)} placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            {paidAmt > 0 && (
              <div className={`flex justify-between text-sm font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span>{change >= 0 ? 'الباقي' : 'ناقص'}</span>
                <span>{Math.abs(change).toLocaleString('ar-IQ')} د.ع</span>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">ملاحظة</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="مثال: مريض، وصفة..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <button onClick={checkout} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> إتمام البيع
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
