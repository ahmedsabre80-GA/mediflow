'use client';
import { useState, useEffect } from 'react';
import { Package, CheckCircle, AlertTriangle, RefreshCw, Trash2, Building2 } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const PENDING_KEY   = 'pharmacy-pending-receipts';
const PHARMACY_API  = 'https://mediflow-production-d815.up.railway.app/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PendingItem  { id: string; name: string; quantity: number; unit_price: number; approved: boolean; }
interface PendingReceipt {
  id: string; orderId: string; warehouseName: string;
  orderDate: string; deliveredDate: string; total: number;
  items: PendingItem[];
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function PendingReceiptsTab() {
  const [receipts, setReceipts]   = useState<PendingReceipt[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [toast, setToast]         = useState('');

  const reload = () => setReceipts(loadPending());
  useEffect(() => { reload(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Approve a single item → POST to pharmacy inventory API
  const approveItem = async (receiptId: string, itemId: string) => {
    setApproving(itemId);
    try {
      const pharmacyId = localStorage.getItem('pharmacy-user-id') || '';
      const pending = loadPending();
      const receipt = pending.find(r => r.id === receiptId);
      if (!receipt) return;
      const item = receipt.items.find(i => i.id === itemId);
      if (!item) return;

      // Add to pharmacy inventory
      if (pharmacyId) {
        await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
          method: 'POST',
          headers: phHeaders(),
          body: JSON.stringify({
            genericName:  item.name,
            brandName:    item.name,
            quantity:     item.quantity,
            buyingPrice:  item.unit_price,
            sellingPrice: Math.round(item.unit_price * 1.2), // 20% margin default
            reorderLevel: 10,
            warehouseId:  '',
          }),
        }).catch(() => {});
      }

      // Mark item as approved in localStorage
      const updated = pending.map(r => r.id !== receiptId ? r : {
        ...r,
        items: r.items.map(i => i.id === itemId ? { ...i, approved: true } : i),
      });
      savePending(updated);
      setReceipts(updated);
      showToast(`✅ تمت إضافة ${item.name} إلى المخزون`);
    } finally {
      setApproving(null);
    }
  };

  // Approve ALL unapproved items in a receipt
  const approveAll = async (receiptId: string) => {
    setApproving(receiptId);
    try {
      const pharmacyId = localStorage.getItem('pharmacy-user-id') || '';
      const pending = loadPending();
      const receipt = pending.find(r => r.id === receiptId);
      if (!receipt) return;
      const unapproved = receipt.items.filter(i => !i.approved);

      for (const item of unapproved) {
        if (pharmacyId) {
          await fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory`, {
            method: 'POST',
            headers: phHeaders(),
            body: JSON.stringify({
              genericName:  item.name,
              brandName:    item.name,
              quantity:     item.quantity,
              buyingPrice:  item.unit_price,
              sellingPrice: Math.round(item.unit_price * 1.2),
              reorderLevel: 10,
              warehouseId:  '',
            }),
          }).catch(() => {});
        }
      }

      const updated = pending.map(r => r.id !== receiptId ? r : {
        ...r,
        items: r.items.map(i => ({ ...i, approved: true })),
      });
      savePending(updated);
      setReceipts(updated);
      showToast(`✅ تمت إضافة ${unapproved.length} صنف إلى المخزون`);
    } finally {
      setApproving(null);
    }
  };

  // Remove a fully-approved receipt
  const removeReceipt = (receiptId: string) => {
    const updated = loadPending().filter(r => r.id !== receiptId);
    savePending(updated);
    setReceipts(updated);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="space-y-4">
      {toast && (
        <div className="fixed bottom-20 right-4 left-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg text-center">
          {toast}
        </div>
      )}

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
          const allApproved = receipt.items.every(i => i.approved);
          const pendingCount = receipt.items.filter(i => !i.approved).length;
          return (
            <div key={receipt.id} className="bg-white rounded-2xl border overflow-hidden">
              {/* Receipt header */}
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
                <div className="flex items-center gap-2 shrink-0">
                  {allApproved ? (
                    <span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">
                      ✅ مكتمل
                    </span>
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">
                      ⏳ {pendingCount} معلق
                    </span>
                  )}
                  {allApproved && (
                    <button onClick={() => removeReceipt(receipt.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Items list */}
              <div className="p-4 space-y-2">
                {receipt.items.map(item => (
                  <div key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${item.approved ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${item.approved ? 'text-green-800' : 'text-gray-900'}`}>{item.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        الكمية: {item.quantity} · السعر: {Number(item.unit_price).toLocaleString('ar-IQ')} د.ع
                      </p>
                    </div>
                    {item.approved ? (
                      <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                    ) : (
                      <button
                        disabled={approving === item.id}
                        onClick={() => approveItem(receipt.id, item.id)}
                        className="shrink-0 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1">
                        {approving === item.id
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : <CheckCircle className="w-3 h-3" />}
                        قبول
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Approve all button */}
              {!allApproved && (
                <div className="px-4 pb-4">
                  <button
                    disabled={approving === receipt.id}
                    onClick={() => approveAll(receipt.id)}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
                    {approving === receipt.id
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <CheckCircle className="w-4 h-4" />}
                    قبول الكل ({pendingCount} صنف)
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
