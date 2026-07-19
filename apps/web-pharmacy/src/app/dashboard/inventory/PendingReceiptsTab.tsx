'use client';
import { useState, useEffect, useRef } from 'react';
import { Package, RefreshCw, Building2, Camera, CheckCircle, X } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const PENDING_KEY  = 'pharmacy-pending-receipts';
const DEBT_KEY     = 'pharmacy-wh-purchases';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemStatus = 'pending' | 'partial' | 'received' | 'broken' | 'not_received';

interface PendingItem {
  id: string; name: string; ordered_qty: number; unit_price: number;
  is_gift: boolean;
  status: ItemStatus;
  received_qty?: number;       // qty received in LAST batch
  received_so_far?: number;    // cumulative qty received across all batches
  broken_image?: string;
  selling_price?: number;
  expiry_date?: string;
  category?: string;
}

interface PendingReceipt {
  id: string; orderId: string; warehouseId: string;
  warehouseName: string; orderDate: string; deliveredDate: string;
  total: number; items: PendingItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadPending(): PendingReceipt[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
}
function savePending(list: PendingReceipt[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}
function phHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem('pharmacy-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  } catch { return { 'Content-Type': 'application/json' }; }
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
}
function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2)}`; }

// Update-or-insert a single item's batch into DEBT_KEY (never creates duplicates for same orderId)
function recordBatch(receipt: PendingReceipt, item: PendingItem, qty: number) {
  try {
    if (!qty || item.is_gift) return;
    const batchTotal = item.unit_price * qty;
    const existing: any[] = JSON.parse(localStorage.getItem(DEBT_KEY) || '[]');
    const idx = existing.findIndex(e => e.notes && e.notes.includes(receipt.orderId));
    const batchInvoice = {
      id:            uid(),
      discountType:  'none',
      totalDiscount: 0,
      items:         [{ name: item.name, qty, price: item.unit_price }],
      image:         '',
      subtotal:      batchTotal,
    };
    if (idx >= 0) {
      // UPDATE: merge item into the first invoice (keep all items under one invoice per order)
      if (existing[idx].invoices && existing[idx].invoices.length > 0) {
        existing[idx].invoices[0].items.push({ name: item.name, qty, price: item.unit_price });
        existing[idx].invoices[0].subtotal = (existing[idx].invoices[0].subtotal || 0) + batchTotal;
      } else {
        existing[idx].invoices = [batchInvoice];
      }
      existing[idx].grandTotal = (existing[idx].grandTotal || 0) + batchTotal;
    } else {
      // INSERT: first batch for this order
      existing.push({
        id:            uid(),
        warehouseId:   receipt.warehouseId || '',
        warehouseName: receipt.warehouseName,
        invoices:      [batchInvoice],
        grandTotal:    batchTotal,
        date:          new Date().toISOString(),
        notes:         `طلبية B2B رقم ${receipt.orderId}`,
      });
    }
    localStorage.setItem(DEBT_KEY, JSON.stringify(existing));
  } catch {}
}

function sendReturnReport(orderId: string, itemName: string, reportType: string, actualQty?: number, imageBase64?: string) {
  fetch(`${PHARMACY_API}/warehouses/b2b-orders/${orderId}/return-report`, {
    method: 'POST',
    headers: phHeaders(),
    body: JSON.stringify({ item_name: itemName, report_type: reportType, actual_qty: actualQty, image_base64: imageBase64 }),
  }).catch(() => {});
}

function calcRealBuyingPrice(receipt: PendingReceipt, item: PendingItem): number {
  const giftFree = (item as any).gift_free;
  const giftPer  = (item as any).gift_per;
  if (typeof giftFree === 'number' && giftFree > 0 && typeof giftPer === 'number' && giftPer > 0) {
    return item.unit_price / (1 + giftFree / giftPer);
  }
  const totalPaid  = receipt.total;
  const totalUnits = receipt.items.reduce((s, i) => s + (i.received_qty ?? i.ordered_qty), 0);
  if (!totalUnits) return item.unit_price;
  const hasDispatchGifts = receipt.items.some(i => i.is_gift);
  return hasDispatchGifts ? totalPaid / totalUnits : item.unit_price;
}

async function addToInventory(item: PendingItem, sellingPrice: number, realBuyingPrice: number, qty: number) {
  try {
    const pharmacyId = localStorage.getItem('pharmacy-id') || '';
    if (!pharmacyId) return;
    await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
      method: 'POST',
      headers: phHeaders(),
      body: JSON.stringify({
        genericName:  item.name,
        brandName:    item.name,
        quantity:     qty,
        buyingPrice:  realBuyingPrice,
        sellingPrice: sellingPrice,
        reorderLevel: 10,
        ...(item.expiry_date ? { expiryDate: item.expiry_date } : {}),
        ...(item.category    ? { category:   item.category }    : {}),
      }),
    });
  } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PendingReceiptsTab() {
  const [receipts, setReceipts] = useState<PendingReceipt[]>([]);
  const [toast, setToast]       = useState('');

  // Full-receive modal (استلام الكل)
  const [sellModal, setSellModal]       = useState<{ receiptId: string; itemId: string; name: string } | null>(null);
  const [sellPrice, setSellPrice]       = useState('');
  const [sellExpiry, setSellExpiry]     = useState('');
  const [sellCategory, setSellCategory] = useState('');
  const [sellSaving, setSellSaving]     = useState(false);

  // Partial-receive modal (كمية مختلفة / دفعة جزئية)
  const [partialModal, setPartialModal] = useState<{
    receiptId: string; itemId: string; name: string;
    ordered: number; alreadyReceived: number;
  } | null>(null);
  const [partialQty, setPartialQty]             = useState('');
  const [partialSellPrice, setPartialSellPrice] = useState('');
  const [partialExpiry, setPartialExpiry]       = useState('');
  const [partialCategory, setPartialCategory]   = useState('');
  const [partialSaving, setPartialSaving]       = useState(false);

  // Broken / camera
  const cameraRef                       = useRef<HTMLInputElement>(null);
  const [brokenTarget, setBrokenTarget] = useState<{ receiptId: string; itemId: string; name: string } | null>(null);

  const reload = () => setReceipts(loadPending());
  useEffect(() => { reload(); }, []);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  // ── Update item in localStorage + state ────────────────────────────────────
  function updateItem(receiptId: string, itemId: string, patch: Partial<PendingItem>) {
    const list = loadPending().map(r => r.id !== receiptId ? r : {
      ...r,
      items: r.items.map(i => i.id !== itemId ? i : { ...i, ...patch }),
    });
    savePending(list);
    setReceipts(list);
    // Close receipt only when ALL items are in a terminal state (no pending/partial)
    const receipt = list.find(r => r.id === receiptId);
    if (receipt && receipt.items.every(i => i.status !== 'pending' && i.status !== 'partial')) {
      const cleaned = list.filter(r => r.id !== receiptId);
      savePending(cleaned);
      setReceipts(cleaned);
      showToast('✅ تم إنهاء جميع مواد الطلبية');
    }
  }

  // ── استلام كامل (all remaining qty) ──────────────────────────────────────
  const openSellModal = (r: PendingReceipt, item: PendingItem) => {
    if (item.is_gift) { handleReceive(r, item, 0, '', ''); return; }
    setSellModal({ receiptId: r.id, itemId: item.id, name: item.name });
    setSellPrice(item.selling_price ? String(item.selling_price) : '');
    setSellExpiry(item.expiry_date || '');
    setSellCategory(item.category || '');
  };

  const handleReceive = async (receipt: PendingReceipt, item: PendingItem, sellingPrice: number, expiry: string, category: string) => {
    setSellSaving(true);
    try {
      const remainingQty = item.ordered_qty - (item.received_so_far || 0);
      const updatedItem: PendingItem = {
        ...item,
        status:           'received',
        received_qty:     remainingQty,
        received_so_far:  item.ordered_qty,
        selling_price:    sellingPrice,
        expiry_date:      expiry || undefined,
        category:         category || undefined,
      };
      const updatedReceipt = { ...receipt, items: receipt.items.map(i => i.id === item.id ? updatedItem : i) };
      const realBuyingPrice = calcRealBuyingPrice(updatedReceipt, updatedItem);
      await addToInventory(updatedItem, sellingPrice, realBuyingPrice, remainingQty);
      recordBatch(receipt, updatedItem, remainingQty);
      updateItem(receipt.id, item.id, {
        status:          'received',
        received_qty:    remainingQty,
        received_so_far: item.ordered_qty,
        selling_price:   sellingPrice,
        expiry_date:     expiry || undefined,
        category:        category || undefined,
      });
      showToast(`✅ تمت إضافة ${item.name} (${remainingQty} وحدة) إلى المخزون`);
      setSellModal(null);
    } finally { setSellSaving(false); }
  };

  // ── كمية مختلفة / دفعة جزئية ─────────────────────────────────────────────
  const openPartialModal = (r: PendingReceipt, item: PendingItem) => {
    const alreadyReceived = item.received_so_far || 0;
    setPartialModal({ receiptId: r.id, itemId: item.id, name: item.name, ordered: item.ordered_qty, alreadyReceived });
    setPartialQty('');
    setPartialSellPrice(item.selling_price ? String(item.selling_price) : '');
    setPartialExpiry(item.expiry_date || '');
    setPartialCategory(item.category || '');
  };

  const handlePartialReceive = async () => {
    if (!partialModal) return;
    const qty = Number(partialQty);
    if (!qty || qty <= 0) return;
    const remaining = partialModal.ordered - partialModal.alreadyReceived;
    const actualQty = Math.min(qty, remaining);
    const newTotal  = partialModal.alreadyReceived + actualQty;
    const newStatus: ItemStatus = newTotal >= partialModal.ordered ? 'received' : 'partial';

    const list    = loadPending();
    const receipt = list.find(r => r.id === partialModal.receiptId);
    const item    = receipt?.items.find(i => i.id === partialModal.itemId);
    if (!receipt || !item) return;

    setPartialSaving(true);
    try {
      sendReturnReport(receipt.orderId, item.name, 'mismatch', actualQty);
      const updatedItem: PendingItem = {
        ...item,
        status:          newStatus,
        received_qty:    actualQty,
        received_so_far: newTotal,
        selling_price:   Number(partialSellPrice) || item.selling_price,
        expiry_date:     partialExpiry || item.expiry_date,
        category:        partialCategory || item.category,
      };
      const realBuyingPrice = calcRealBuyingPrice(receipt, updatedItem);
      if (!item.is_gift) {
        await addToInventory(updatedItem, Number(partialSellPrice) || 0, realBuyingPrice, actualQty);
      }
      recordBatch(receipt, updatedItem, actualQty);
      updateItem(partialModal.receiptId, partialModal.itemId, {
        status:          newStatus,
        received_qty:    actualQty,
        received_so_far: newTotal,
        selling_price:   Number(partialSellPrice) || item.selling_price,
        expiry_date:     partialExpiry || undefined,
        category:        partialCategory || undefined,
      });
      const stillRemaining = partialModal.ordered - newTotal;
      showToast(newStatus === 'received'
        ? `✅ اكتمل استلام ${item.name} — المجموع: ${newTotal} وحدة`
        : `⚠️ استُلم ${actualQty} من أصل ${remaining} المتبقية — لا يزال ${stillRemaining} معلقاً`
      );
      setPartialModal(null);
    } finally { setPartialSaving(false); }
  };

  // ── مكسور ───────────────────────────────────────────────────────────────────
  const openCamera = (r: PendingReceipt, item: PendingItem) => {
    setBrokenTarget({ receiptId: r.id, itemId: item.id, name: item.name });
    cameraRef.current?.click();
  };

  const handleBrokenPhoto = (file: File) => {
    if (!brokenTarget) return;
    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target?.result as string;
      const list = loadPending();
      const receipt = list.find(r => r.id === brokenTarget!.receiptId);
      if (receipt) sendReturnReport(receipt.orderId, brokenTarget!.name, 'broken', undefined, base64);
      updateItem(brokenTarget!.receiptId, brokenTarget!.itemId, { status: 'broken', broken_image: base64 });
      showToast('📷 تم إرسال بلاغ المكسور');
      setBrokenTarget(null);
    };
    reader.readAsDataURL(file);
  };

  // ── لم يُستلم ────────────────────────────────────────────────────────────────
  const handleNotReceived = (r: PendingReceipt, item: PendingItem) => {
    sendReturnReport(r.orderId, item.name, 'not_received');
    updateItem(r.id, item.id, { status: 'not_received' });
    showToast('تم إرسال بلاغ: لم يُستلم');
  };

  // ── Status badge ────────────────────────────────────────────────────────────
  const statusBadge = (status: ItemStatus) => {
    const cfg: Record<ItemStatus, { label: string; cls: string }> = {
      pending:      { label: '⏳ معلق',          cls: 'bg-gray-100 text-gray-600' },
      partial:      { label: '📦 جزئي',          cls: 'bg-blue-100 text-blue-700' },
      received:     { label: '✅ تم الاستلام',    cls: 'bg-green-100 text-green-700' },
      broken:       { label: '📷 مكسور',          cls: 'bg-red-100 text-red-700' },
      not_received: { label: '📦 لم يُستلم',       cls: 'bg-orange-100 text-orange-700' },
    };
    const c = cfg[status] || cfg.pending;
    return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.cls}`}>{c.label}</span>;
  };

  // received = permanently locked; broken/partial can still be edited
  const isActionable = (s?: ItemStatus | string) => !s || s === 'pending' || s === 'partial' || s === 'broken';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="space-y-4">
      {toast && (
        <div className="fixed bottom-20 right-4 left-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg text-center">
          {toast}
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleBrokenPhoto(f); e.target.value = ''; }} />

      {receipts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="w-12 h-12 text-gray-200 mb-3" />
          <h3 className="text-gray-500 font-semibold">لا توجد طلبيات معلقة</h3>
          <p className="text-xs text-gray-400 mt-1">
            عند استلام طلب من المستودع اضغط "استلام وإضافة إلى المخزون المعلق" من صفحة المستودعات
          </p>
        </div>
      ) : (
        receipts.map(receipt => {
          const pendingCount = receipt.items.filter(i => isActionable(i.status)).length;
          return (
            <div key={receipt.id} className="bg-white rounded-2xl border overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{receipt.warehouseName}</p>
                    <p className="text-xs text-gray-400">
                      طلب: {fmtDate(receipt.orderDate)} · تسليم: {fmtDate(receipt.deliveredDate)}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${pendingCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                  {pendingCount > 0 ? `⏳ ${pendingCount} معلق` : '✅ مكتمل'}
                </span>
              </div>

              {/* Items */}
              <div className="p-4 space-y-3">
                {receipt.items.map(item => {
                  const actionable  = isActionable(item.status);
                  const soFar       = item.received_so_far || 0;
                  const remaining   = item.ordered_qty - soFar;
                  return (
                    <div key={item.id} className={`rounded-xl border p-3 ${!actionable ? 'bg-gray-50 opacity-80' : 'bg-white'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.is_gift && <span className="text-base">🎁</span>}
                            <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                            {statusBadge(item.status)}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            الكمية المطلوبة: {item.ordered_qty}
                            {soFar > 0 && ` · المستلم: ${soFar}`}
                            {item.status === 'partial' && ` · المتبقي: ${remaining}`}
                            {!item.is_gift && ` · السعر: ${Number(item.unit_price).toLocaleString('ar-IQ')} د.ع`}
                            {item.is_gift && ' · هدية مجانية'}
                          </p>
                        </div>
                      </div>

                      {actionable && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {/* Full / remaining receive */}
                          <button onClick={() => openSellModal(receipt, item)}
                            className="col-span-2 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {item.status === 'partial' ? `استلام الباقي (${remaining} وحدة)` : 'استلام'}
                          </button>

                          {/* Partial / mismatch */}
                          <button onClick={() => openPartialModal(receipt, item)}
                            className="flex items-center justify-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                            🔢 {item.status === 'partial' ? 'دفعة جزئية إضافية' : 'كمية مختلفة'}
                          </button>

                          {/* Broken — available on pending and on already-broken items (re-photo) */}
                          {(item.status === 'pending' || item.status === 'broken') && (
                            <button onClick={() => openCamera(receipt, item)}
                              className="flex items-center justify-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                              <Camera className="w-3.5 h-3.5" /> {item.status === 'broken' ? 'تحديث صورة الكسر' : 'مكسور'}
                            </button>
                          )}

                          {/* Not received — only on first-time (pending) */}
                          {item.status === 'pending' && (
                            <button onClick={() => handleNotReceived(receipt, item)}
                              className={`flex items-center justify-center gap-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors ${item.status === 'pending' ? 'col-span-2' : ''}`}>
                              📦 لم يُستلم
                            </button>
                          )}
                        </div>
                      )}

                      {item.status === 'broken' && item.broken_image && (
                        <img src={item.broken_image} alt="صورة المكسور" className="mt-2 w-full max-h-32 object-cover rounded-xl" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ── Full Receive Modal ──────────────────────────────────────────────── */}
      {sellModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">بيانات الصنف</h2>
              <button onClick={() => setSellModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">أدخل بيانات <strong>{sellModal.name}</strong> لإضافته إلى المخزون:</p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">سعر البيع (د.ع) *</label>
                <input type="number" min="0" autoFocus value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && Number(sellPrice) > 0) {
                      const r = loadPending().find(x => x.id === sellModal.receiptId);
                      const i = r?.items.find(x => x.id === sellModal.itemId);
                      if (r && i) handleReceive(r, i, Number(sellPrice), sellExpiry, sellCategory);
                    }
                  }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-emerald-400 text-center" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ الانتهاء (اختياري)</label>
                <input type="date" value={sellExpiry} onChange={e => setSellExpiry(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">التصنيف (اختياري)</label>
                <input type="text" value={sellCategory} onChange={e => setSellCategory(e.target.value)}
                  placeholder="مثال: مضادات حيوية، مسكنات..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400" />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const r = receipts.find(x => x.id === sellModal.receiptId);
                    const item = r?.items.find(i => i.id === sellModal.itemId);
                    if (r && item) handleReceive(r, item, Number(sellPrice), sellExpiry, sellCategory);
                  }}
                  disabled={sellSaving || !Number(sellPrice)}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  {sellSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  إضافة للمخزون
                </button>
                <button onClick={() => setSellModal(null)}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Partial Receive Modal ───────────────────────────────────────────── */}
      {partialModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">استلام جزئي</h2>
              <button onClick={() => setPartialModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Summary */}
              <div className="bg-amber-50 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-1">
                <p>المادة: <strong>{partialModal.name}</strong></p>
                <p>الكمية الإجمالية المطلوبة: <strong>{partialModal.ordered}</strong></p>
                {partialModal.alreadyReceived > 0 && (
                  <p>المستلم سابقاً: <strong>{partialModal.alreadyReceived}</strong></p>
                )}
                <p>المتبقي للاستلام: <strong>{partialModal.ordered - partialModal.alreadyReceived}</strong></p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  الكمية المستلمة الآن (الحد الأقصى: {partialModal.ordered - partialModal.alreadyReceived})
                </label>
                <input type="number" min="1" max={partialModal.ordered - partialModal.alreadyReceived}
                  autoFocus value={partialQty} onChange={e => setPartialQty(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-amber-400 text-center" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">سعر البيع (د.ع) *</label>
                <input type="number" min="0" value={partialSellPrice} onChange={e => setPartialSellPrice(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-amber-400 text-center" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ الانتهاء (اختياري)</label>
                <input type="date" value={partialExpiry} onChange={e => setPartialExpiry(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-400" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">التصنيف (اختياري)</label>
                <input type="text" value={partialCategory} onChange={e => setPartialCategory(e.target.value)}
                  placeholder="مثال: مضادات حيوية، مسكنات..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-400" />
              </div>

              <div className="flex gap-3">
                <button onClick={handlePartialReceive}
                  disabled={partialSaving || !Number(partialQty) || !Number(partialSellPrice)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  {partialSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  تأكيد الاستلام الجزئي
                </button>
                <button onClick={() => setPartialModal(null)}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
