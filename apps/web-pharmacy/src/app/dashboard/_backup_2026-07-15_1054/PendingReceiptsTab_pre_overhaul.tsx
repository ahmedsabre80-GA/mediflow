'use client';
import { useState, useEffect, useRef } from 'react';
import { Package, RefreshCw, Building2, Camera, CheckCircle, X } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const PENDING_KEY  = 'pharmacy-pending-receipts';
const DEBT_KEY     = 'pharmacy-wh-purchases';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemStatus = 'pending' | 'received' | 'broken' | 'not_received' | 'mismatch';

interface PendingItem {
  id: string; name: string; ordered_qty: number; unit_price: number;
  is_gift: boolean;
  status: ItemStatus;
  received_qty?: number; broken_image?: string; selling_price?: number;
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

function recordDebt(receipt: PendingReceipt) {
  try {
    const receivedItems = receipt.items.filter(i => i.status === 'received' || i.status === 'mismatch');
    if (!receivedItems.length) return;
    const total = receivedItems.reduce((sum, i) => sum + i.unit_price * (i.received_qty ?? i.ordered_qty), 0);
    const existing = JSON.parse(localStorage.getItem(DEBT_KEY) || '[]');
    existing.push({
      id:            uid(),
      warehouseId:   receipt.warehouseId || '',
      warehouseName: receipt.warehouseName,
      invoices: [{
        id:            uid(),
        discountType:  'none',
        totalDiscount: 0,
        items:         receivedItems.map(i => ({ name: i.name, qty: i.received_qty ?? i.ordered_qty, price: i.unit_price })),
        image:         '',
        subtotal:      total,
      }],
      grandTotal: total,
      date:       new Date().toISOString(),
      notes:      `طلبية B2B رقم ${receipt.orderId}`,
    });
    localStorage.setItem(DEBT_KEY, JSON.stringify(existing));
  } catch {}
}

function sendReturnReport(orderId: string, itemName: string, reportType: string, actualQty?: number, imageBase64?: string) {
  fetch(`${PHARMACY_API}/warehouses/b2b-orders/${orderId}/return-report`, {
    method: 'POST',
    headers: phHeaders(),
    body: JSON.stringify({
      item_name:    itemName,
      report_type:  reportType,
      actual_qty:   actualQty,
      image_base64: imageBase64,
    }),
  }).catch(() => {});
}

async function addToInventory(item: PendingItem, sellingPrice: number) {
  try {
    const pharmacyId = localStorage.getItem('pharmacy-user-id') || '';
    if (!pharmacyId) return;
    await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
      method: 'POST',
      headers: phHeaders(),
      body: JSON.stringify({
        genericName:  item.name,
        brandName:    item.name,
        quantity:     item.received_qty ?? item.ordered_qty,
        buyingPrice:  item.is_gift ? 0 : item.unit_price,
        sellingPrice: sellingPrice,
        reorderLevel: 10,
      }),
    });
  } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PendingReceiptsTab() {
  const [receipts, setReceipts]   = useState<PendingReceipt[]>([]);
  const [toast, setToast]         = useState('');

  // Selling price modal
  const [sellModal, setSellModal]     = useState<{ receiptId: string; itemId: string; name: string } | null>(null);
  const [sellPrice, setSellPrice]     = useState('');
  const [sellSaving, setSellSaving]   = useState(false);

  // Mismatch modal
  const [mismatchModal, setMismatchModal] = useState<{ receiptId: string; itemId: string; name: string; ordered: number } | null>(null);
  const [actualQty, setActualQty]         = useState('');

  // Broken / camera
  const cameraRef                           = useRef<HTMLInputElement>(null);
  const [brokenTarget, setBrokenTarget]     = useState<{ receiptId: string; itemId: string; name: string } | null>(null);

  const reload = () => setReceipts(loadPending());
  useEffect(() => { reload(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ── Update item helper ─────────────────────────────────────────────────────
  function updateItem(receiptId: string, itemId: string, patch: Partial<PendingItem>) {
    const list = loadPending().map(r => r.id !== receiptId ? r : {
      ...r,
      items: r.items.map(i => i.id !== itemId ? i : { ...i, ...patch }),
    });
    savePending(list);
    setReceipts(list);
    // if all items handled → record debt + remove
    const receipt = list.find(r => r.id === receiptId);
    if (receipt && receipt.items.every(i => i.status !== 'pending')) {
      recordDebt(receipt);
      const cleaned = list.filter(r => r.id !== receiptId);
      savePending(cleaned);
      setReceipts(cleaned);
      showToast('✅ تم إنهاء الطلبية وتسجيلها في الديون');
    }
  }

  // ── استلام ─────────────────────────────────────────────────────────────────
  const openSellModal = (r: PendingReceipt, item: PendingItem) => {
    if (item.is_gift) {
      // Gift: receive immediately, no selling price needed (user can decide later)
      handleReceive(r.id, item, 0);
      return;
    }
    setSellModal({ receiptId: r.id, itemId: item.id, name: item.name });
    setSellPrice(item.selling_price ? String(item.selling_price) : '');
  };

  const handleReceive = async (receiptId: string, item: PendingItem, sellingPrice: number) => {
    setSellSaving(true);
    try {
      const updated: PendingItem = { ...item, status: 'received', received_qty: item.ordered_qty, selling_price: sellingPrice };
      await addToInventory(updated, sellingPrice);
      updateItem(receiptId, item.id, { status: 'received', selling_price: sellingPrice });
      showToast(`✅ تمت إضافة ${item.name} إلى المخزون`);
      setSellModal(null);
    } finally { setSellSaving(false); }
  };

  // ── كمية مختلفة ─────────────────────────────────────────────────────────────
  const openMismatch = (r: PendingReceipt, item: PendingItem) => {
    setMismatchModal({ receiptId: r.id, itemId: item.id, name: item.name, ordered: item.ordered_qty });
    setActualQty('');
  };

  const handleMismatch = () => {
    if (!mismatchModal) return;
    const qty = Number(actualQty);
    if (!qty || qty <= 0) return;
    const list = loadPending();
    const receipt = list.find(r => r.id === mismatchModal.receiptId);
    const item = receipt?.items.find(i => i.id === mismatchModal.itemId);
    if (!item) return;
    sendReturnReport(receipt!.orderId, item.name, 'mismatch', qty);
    updateItem(mismatchModal.receiptId, mismatchModal.itemId, { status: 'mismatch', received_qty: qty });
    showToast(`تم تسجيل الكمية المختلفة: ${qty} من ${item.ordered_qty}`);
    setMismatchModal(null);
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
      pending:      { label: '⏳ معلق',         cls: 'bg-gray-100 text-gray-600' },
      received:     { label: '✅ تم الاستلام',   cls: 'bg-green-100 text-green-700' },
      broken:       { label: '📷 مكسور',         cls: 'bg-red-100 text-red-700' },
      not_received: { label: '📦 لم يُستلم',      cls: 'bg-orange-100 text-orange-700' },
      mismatch:     { label: '🔢 كمية مختلفة',   cls: 'bg-amber-100 text-amber-700' },
    };
    const c = cfg[status] || cfg.pending;
    return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.cls}`}>{c.label}</span>;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="space-y-4">
      {toast && (
        <div className="fixed bottom-20 right-4 left-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg text-center">
          {toast}
        </div>
      )}

      {/* Hidden camera input */}
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
          const pendingCount = receipt.items.filter(i => i.status === 'pending').length;
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
                {receipt.items.map(item => (
                  <div key={item.id} className={`rounded-xl border p-3 ${item.status !== 'pending' ? 'bg-gray-50 opacity-80' : 'bg-white'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.is_gift && <span className="text-base">🎁</span>}
                          <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                          {statusBadge(item.status)}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          الكمية المطلوبة: {item.ordered_qty}
                          {item.received_qty != null && item.received_qty !== item.ordered_qty && ` · المستلمة: ${item.received_qty}`}
                          {!item.is_gift && ` · السعر: ${Number(item.unit_price).toLocaleString('ar-IQ')} د.ع`}
                          {item.is_gift && ' · هدية مجانية'}
                        </p>
                      </div>
                    </div>

                    {item.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <button onClick={() => openSellModal(receipt, item)}
                          className="flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                          <CheckCircle className="w-3.5 h-3.5" /> استلام
                        </button>
                        <button onClick={() => openMismatch(receipt, item)}
                          className="flex items-center justify-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                          🔢 كمية مختلفة
                        </button>
                        <button onClick={() => openCamera(receipt, item)}
                          className="flex items-center justify-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                          <Camera className="w-3.5 h-3.5" /> مكسور
                        </button>
                        <button onClick={() => handleNotReceived(receipt, item)}
                          className="flex items-center justify-center gap-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                          📦 لم يُستلم
                        </button>
                      </div>
                    )}

                    {item.status === 'broken' && item.broken_image && (
                      <img src={item.broken_image} alt="صورة المكسور" className="mt-2 w-full max-h-32 object-cover rounded-xl" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* ── Selling Price Modal ─────────────────────────────────────────── */}
      {sellModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">سعر البيع</h2>
              <button onClick={() => setSellModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                أدخل سعر البيع لـ <strong>{sellModal.name}</strong> في صيدليتك:
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">سعر البيع (د.ع)</label>
                <input
                  type="number" min="0" autoFocus
                  value={sellPrice}
                  onChange={e => setSellPrice(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && Number(sellPrice) > 0 && handleReceive(sellModal.receiptId, loadPending().find(r => r.id === sellModal.receiptId)!.items.find(i => i.id === sellModal.itemId)!, Number(sellPrice))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-emerald-400 text-center" />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const r = loadPending().find(x => x.id === sellModal.receiptId);
                    const item = r?.items.find(i => i.id === sellModal.itemId);
                    if (item) handleReceive(sellModal.receiptId, item, Number(sellPrice));
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

      {/* ── Mismatch Modal ──────────────────────────────────────────────── */}
      {mismatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900">كمية مختلفة</h2>
              <button onClick={() => setMismatchModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                <strong>{mismatchModal.name}</strong> — الكمية المطلوبة: <strong>{mismatchModal.ordered}</strong>
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الكمية المستلمة فعلياً</label>
                <input type="number" min="0" autoFocus value={actualQty} onChange={e => setActualQty(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-amber-400 text-center" />
              </div>
              <div className="flex gap-3">
                <button onClick={handleMismatch} disabled={!Number(actualQty)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl">تأكيد</button>
                <button onClick={() => setMismatchModal(null)}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
