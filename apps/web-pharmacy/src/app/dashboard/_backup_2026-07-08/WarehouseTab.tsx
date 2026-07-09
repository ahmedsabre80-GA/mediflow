'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Minus, X, Upload, Trash2, ChevronDown, ChevronUp, Wallet, FileText, Building2, CreditCard } from 'lucide-react';

// ── localStorage keys ────────────────────────────────────────────────────────
const WH_KEY  = 'pharmacy-warehouses';
const PUR_KEY = 'pharmacy-wh-purchases';
const PAY_KEY = 'pharmacy-wh-payments';
const BAT_KEY = 'pharmacy-stock-batches';

// ── Types ────────────────────────────────────────────────────────────────────
export interface Warehouse { id: string; name: string; phone: string; address: string; }

export interface PurchaseItem {
  drugName: string; qty: number; unitCost: number;
  itemDiscount: number;   // percent, applied per-item
  finalUnitCost: number;  // after item discount
  totalCost: number;
  expiry: string;
}

export interface Invoice {
  id: string;
  discountType: 'none' | 'item' | 'total';
  totalDiscount: number;   // percent for 'total' mode
  items: PurchaseItem[];
  image: string;           // base64
  subtotal: number;        // after all discounts
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
  id: string; drugName: string; qtyRemaining: number;
  unitCost: number; purchaseId: string; purchaseDate: string; expiry: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function save(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function calcInvoiceSubtotal(inv: Invoice): number {
  const itemsTotal = inv.items.reduce((s, it) => s + it.totalCost, 0);
  if (inv.discountType === 'total' && inv.totalDiscount > 0) {
    return itemsTotal * (1 - inv.totalDiscount / 100);
  }
  return itemsTotal;
}

function balanceOwed(whId: string, purchases: Purchase[], payments: Payment[]): number {
  const totalPurchased = purchases.filter(p => p.warehouseId === whId).reduce((s, p) => s + p.grandTotal, 0);
  const totalPaid      = payments.filter(p => p.warehouseId === whId).reduce((s, p) => s + p.amount, 0);
  return totalPurchased - totalPaid;
}

// ── Empty invoice factory ────────────────────────────────────────────────────
function emptyInvoice(): Invoice {
  return { id: uid(), discountType: 'none', totalDiscount: 0, items: [], image: '', subtotal: 0 };
}
function emptyItem(): PurchaseItem {
  return { drugName: '', qty: 1, unitCost: 0, itemDiscount: 0, finalUnitCost: 0, totalCost: 0, expiry: '' };
}

// ── Drug search ──────────────────────────────────────────────────────────────
const DRUG_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/drugs/search';

// ════════════════════════════════════════════════════════════════════════════
export default function WarehouseTab() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => load(WH_KEY, []));
  const [purchases,  setPurchases]  = useState<Purchase[]> (() => load(PUR_KEY, []));
  const [payments,   setPayments]   = useState<Payment[]>  (() => load(PAY_KEY, []));

  const [activeWh, setActiveWh] = useState<string>('');  // selected warehouse id
  const [view, setView] = useState<'list' | 'purchase' | 'payment' | 'addWh'>('list');

  // ── Add Warehouse form ────────────────────────────────────────────────────
  const [whForm, setWhForm] = useState({ name: '', phone: '', address: '' });

  const saveWarehouse = () => {
    if (!whForm.name.trim()) return;
    const wh: Warehouse = { id: uid(), ...whForm };
    const next = [...warehouses, wh];
    setWarehouses(next); save(WH_KEY, next);
    setActiveWh(wh.id);
    setWhForm({ name: '', phone: '', address: '' });
    setView('list');
  };

  // ── Purchase form ─────────────────────────────────────────────────────────
  const [purchaseWh, setPurchaseWh] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([emptyInvoice()]);
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [drugSugs, setDrugSugs] = useState<Record<string, any[]>>({});  // invIdx-itemIdx → suggestions
  const [savingPurchase, setSavingPurchase] = useState(false);
  const debRef = useRef<NodeJS.Timeout>();

  const grandTotal = invoices.reduce((s, inv) => s + calcInvoiceSubtotal(inv), 0);

  const updateInvoice = (idx: number, patch: Partial<Invoice>) => {
    setInvoices(prev => prev.map((inv, i) => {
      if (i !== idx) return inv;
      const updated = { ...inv, ...patch };
      updated.subtotal = calcInvoiceSubtotal(updated);
      return updated;
    }));
  };

  const updateItem = (invIdx: number, itemIdx: number, patch: Partial<PurchaseItem>) => {
    setInvoices(prev => prev.map((inv, i) => {
      if (i !== invIdx) return inv;
      const items = inv.items.map((it, j) => {
        if (j !== itemIdx) return it;
        const merged = { ...it, ...patch };
        merged.finalUnitCost = merged.unitCost * (1 - merged.itemDiscount / 100);
        merged.totalCost = merged.finalUnitCost * merged.qty;
        return merged;
      });
      const updated = { ...inv, items };
      updated.subtotal = calcInvoiceSubtotal(updated);
      return updated;
    }));
  };

  const addItem = (invIdx: number) => {
    setInvoices(prev => prev.map((inv, i) => i !== invIdx ? inv : { ...inv, items: [...inv.items, emptyItem()] }));
  };

  const removeItem = (invIdx: number, itemIdx: number) => {
    setInvoices(prev => prev.map((inv, i) => {
      if (i !== invIdx) return inv;
      const items = inv.items.filter((_, j) => j !== itemIdx);
      const updated = { ...inv, items };
      updated.subtotal = calcInvoiceSubtotal(updated);
      return updated;
    }));
  };

  const searchDrug = (invIdx: number, itemIdx: number, q: string) => {
    updateItem(invIdx, itemIdx, { drugName: q });
    clearTimeout(debRef.current);
    if (q.length < 2) { setDrugSugs(prev => ({ ...prev, [`${invIdx}-${itemIdx}`]: [] })); return; }
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${DRUG_API}?q=${encodeURIComponent(q)}&limit=5`);
        const d = await r.json();
        setDrugSugs(prev => ({ ...prev, [`${invIdx}-${itemIdx}`]: d.data || [] }));
      } catch {}
    }, 300);
  };

  const handleInvoiceImage = (invIdx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => updateInvoice(invIdx, { image: (reader.result as string) });
    reader.readAsDataURL(file);
  };

  const savePurchase = () => {
    if (!purchaseWh) return;
    setSavingPurchase(true);
    const wh = warehouses.find(w => w.id === purchaseWh)!;
    const purchase: Purchase = {
      id: uid(), warehouseId: purchaseWh, warehouseName: wh.name,
      invoices, grandTotal, date: new Date().toISOString(), notes: purchaseNotes,
    };
    // Save purchase
    const nextPur = [...purchases, purchase];
    setPurchases(nextPur); save(PUR_KEY, nextPur);

    // Save FIFO stock batches
    const batches: StockBatch[] = load(BAT_KEY, []);
    invoices.forEach(inv => {
      inv.items.forEach(it => {
        if (!it.drugName || it.qty <= 0) return;
        const finalCost = inv.discountType === 'total'
          ? it.finalUnitCost * (1 - inv.totalDiscount / 100)
          : it.finalUnitCost;
        batches.push({
          id: uid(), drugName: it.drugName.trim(), qtyRemaining: it.qty,
          unitCost: finalCost, purchaseId: purchase.id,
          purchaseDate: purchase.date, expiry: it.expiry,
        });
      });
    });
    save(BAT_KEY, batches);

    // Reset form
    setInvoices([emptyInvoice()]);
    setPurchaseNotes('');
    setPurchaseWh('');
    setSavingPurchase(false);
    setActiveWh(purchase.warehouseId);
    setView('list');
  };

  // ── Payment form ──────────────────────────────────────────────────────────
  const [payWh,      setPayWh]      = useState('');
  const [payRows,    setPayRows]    = useState([{ amount: '', date: new Date().toISOString().slice(0,10), notes: '', receiptImage: '' }]);
  const [savingPay,  setSavingPay]  = useState(false);

  const handleReceiptImage = (rowIdx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPayRows(prev => prev.map((r, i) => i !== rowIdx ? r : { ...r, receiptImage: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const savePayments = () => {
    if (!payWh) return;
    setSavingPay(true);
    const wh = warehouses.find(w => w.id === payWh)!;
    const newPays: Payment[] = payRows
      .filter(r => Number(r.amount) > 0)
      .map(r => ({ id: uid(), warehouseId: payWh, warehouseName: wh.name, amount: Number(r.amount), date: r.date, notes: r.notes, receiptImage: r.receiptImage }));
    const next = [...payments, ...newPays];
    setPayments(next); save(PAY_KEY, next);
    setPayRows([{ amount: '', date: new Date().toISOString().slice(0,10), notes: '', receiptImage: '' }]);
    setPayWh('');
    setSavingPay(false);
    setView('list');
  };

  // ── Filtered data for active warehouse ───────────────────────────────────
  const whPurchases = activeWh ? purchases.filter(p => p.warehouseId === activeWh) : purchases;
  const whPayments  = activeWh ? payments.filter(p => p.warehouseId === activeWh)  : payments;
  const activeWhObj = warehouses.find(w => w.id === activeWh);
  const owed        = activeWh ? balanceOwed(activeWh, purchases, payments) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: Add Warehouse
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'addWh') return (
    <div className="max-w-md mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => setView('list')} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-4 h-4" /></button>
        <h2 className="font-bold text-gray-900">إضافة مستودع جديد</h2>
      </div>
      {[['name','اسم المستودع *'],['phone','رقم الهاتف'],['address','العنوان']].map(([k,label]) => (
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
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-4 h-4" /></button>
        <h2 className="font-bold text-gray-900 text-lg">إضافة فاتورة شراء من مستودع</h2>
      </div>

      {/* Warehouse selector */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <label className="block text-sm font-bold text-gray-800">المستودع</label>
        <div className="flex gap-2">
          <select value={purchaseWh} onChange={e => setPurchaseWh(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white">
            <option value="">اختر مستودعاً...</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={() => setView('addWh')}
            className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-white px-3 py-2.5 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> جديد
          </button>
        </div>
      </div>

      {/* Invoices */}
      {invoices.map((inv, invIdx) => (
        <div key={inv.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Invoice header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-500" />
              <span className="font-bold text-gray-800 text-sm">فاتورة {invIdx + 1}</span>
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
            </div>

            {/* Invoice image */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">صورة الفاتورة (اختياري)</label>
              {inv.image ? (
                <div className="relative inline-block">
                  <img src={inv.image} alt="فاتورة" className="h-24 rounded-xl object-cover border border-gray-200" />
                  <button onClick={() => updateInvoice(invIdx, { image: '' })}
                    className="absolute -top-1.5 -left-1.5 bg-red-500 text-white rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer w-fit bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-600 transition-colors">
                  <Upload className="w-4 h-4" /> مسح / رفع الفاتورة
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handleInvoiceImage(invIdx, e.target.files[0])} />
                </label>
              )}
            </div>

            {/* Items table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">الأصناف</label>
                <button onClick={() => addItem(invIdx)}
                  className="flex items-center gap-1 text-xs bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg">
                  <Plus className="w-3 h-3" /> إضافة صنف
                </button>
              </div>

              {inv.items.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-4">لا توجد أصناف — اضغط "إضافة صنف"</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-2 py-2 text-right font-medium">الصنف</th>
                        <th className="px-2 py-2 text-center font-medium w-16">الكمية</th>
                        <th className="px-2 py-2 text-center font-medium w-24">سعر الشراء</th>
                        {inv.discountType === 'item' && <th className="px-2 py-2 text-center font-medium w-16">خصم%</th>}
                        <th className="px-2 py-2 text-center font-medium w-24">الإجمالي</th>
                        <th className="px-2 py-2 text-center font-medium w-24">انتهاء الصلاحية</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((it, itemIdx) => {
                        const sugKey = `${invIdx}-${itemIdx}`;
                        return (
                          <tr key={itemIdx} className="border-t border-gray-100">
                            {/* Drug name with autocomplete */}
                            <td className="px-2 py-2 relative">
                              <input value={it.drugName}
                                onChange={e => searchDrug(invIdx, itemIdx, e.target.value)}
                                placeholder="اسم الدواء..."
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-sky-400 min-w-[120px]" />
                              {(drugSugs[sugKey]?.length ?? 0) > 0 && (
                                <div className="absolute z-10 top-full right-2 left-2 bg-white border border-gray-200 rounded-xl shadow-lg mt-0.5 overflow-hidden">
                                  {drugSugs[sugKey].map((d: any) => (
                                    <button key={d.id} type="button"
                                      onClick={() => { updateItem(invIdx, itemIdx, { drugName: d.generic_name || d.brand_name }); setDrugSugs(p => ({ ...p, [sugKey]: [] })); }}
                                      className="w-full text-right px-3 py-2 hover:bg-sky-50 text-xs">
                                      {d.generic_name} {d.brand_name ? `(${d.brand_name})` : ''}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min="1" value={it.qty}
                                onChange={e => updateItem(invIdx, itemIdx, { qty: Number(e.target.value) })}
                                className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-center outline-none focus:ring-1 focus:ring-sky-400" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min="0" value={it.unitCost || ''}
                                onChange={e => updateItem(invIdx, itemIdx, { unitCost: Number(e.target.value) })}
                                placeholder="0"
                                className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-center outline-none focus:ring-1 focus:ring-sky-400" />
                            </td>
                            {inv.discountType === 'item' && (
                              <td className="px-2 py-2">
                                <input type="number" min="0" max="100" value={it.itemDiscount || ''}
                                  onChange={e => updateItem(invIdx, itemIdx, { itemDiscount: Number(e.target.value) })}
                                  placeholder="0"
                                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-center outline-none focus:ring-1 focus:ring-sky-400" />
                              </td>
                            )}
                            <td className="px-2 py-2 text-center font-bold text-gray-800">
                              {it.totalCost.toLocaleString('ar-IQ')}
                            </td>
                            <td className="px-2 py-2">
                              <input type="date" value={it.expiry}
                                onChange={e => updateItem(invIdx, itemIdx, { expiry: e.target.value })}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-sky-400 text-xs" />
                            </td>
                            <td className="px-2 py-2">
                              <button onClick={() => removeItem(invIdx, itemIdx)}
                                className="p-1 text-red-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Invoice subtotal */}
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">إجمالي الفاتورة {invIdx + 1}</span>
                <span className="font-bold text-gray-900">{calcInvoiceSubtotal(inv).toLocaleString('ar-IQ')} IQD</span>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Add invoice button */}
      <button onClick={() => setInvoices(prev => [...prev, emptyInvoice()])}
        className="w-full border-2 border-dashed border-sky-300 hover:border-sky-500 text-sky-600 hover:text-sky-700 py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 transition-all">
        <Plus className="w-4 h-4" /> إضافة فاتورة
      </button>

      {/* Notes */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">ملاحظات (اختياري)</label>
        <textarea value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} rows={2}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
      </div>

      {/* Grand total + save */}
      <div className="bg-sky-600 rounded-2xl p-4 flex items-center justify-between text-white">
        <div>
          <p className="text-xs opacity-80">الإجمالي الكلي ({invoices.length} {invoices.length === 1 ? 'فاتورة' : 'فواتير'})</p>
          <p className="text-2xl font-black">{grandTotal.toLocaleString('ar-IQ')} IQD</p>
        </div>
        <button onClick={savePurchase} disabled={savingPurchase || !purchaseWh || invoices.every(inv => inv.items.length === 0)}
          className="bg-white text-sky-600 font-bold px-5 py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-sky-50 transition-colors">
          {savingPurchase ? 'جاري الحفظ...' : 'حفظ المشتريات'}
        </button>
      </div>
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

      {/* Warehouse selector */}
      <div className="flex gap-2">
        <select value={payWh} onChange={e => setPayWh(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white">
          <option value="">اختر مستودعاً...</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} — مديونية: {balanceOwed(w.id, purchases, payments).toLocaleString('ar-IQ')} IQD</option>)}
        </select>
      </div>

      {/* Payment rows */}
      {payRows.map((row, i) => (
        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">دفعة {i + 1}</span>
            {payRows.length > 1 && (
              <button onClick={() => setPayRows(prev => prev.filter((_, j) => j !== i))}
                className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">المبلغ (IQD) *</label>
              <input type="number" min="0" value={row.amount}
                onChange={e => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, amount: e.target.value }))}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">التاريخ</label>
              <input type="date" value={row.date}
                onChange={e => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
            <input value={row.notes}
              onChange={e => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, notes: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          {/* Receipt image */}
          {row.receiptImage ? (
            <div className="relative inline-block">
              <img src={row.receiptImage} alt="إيصال" className="h-24 rounded-xl object-cover border border-gray-200" />
              <button onClick={() => setPayRows(prev => prev.map((r, j) => j !== i ? r : { ...r, receiptImage: '' }))}
                className="absolute -top-1.5 -left-1.5 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <label className="flex items-center gap-2 cursor-pointer w-fit bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-600">
              <Upload className="w-4 h-4" /> مسح إيصال الدفع
              <input type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleReceiptImage(i, e.target.files[0])} />
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
      {/* Header actions */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <h2 className="font-bold text-gray-900 text-lg">إدارة المستودعات</h2>
        <div className="flex gap-2">
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

      {/* Warehouse filter tabs */}
      {warehouses.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setActiveWh('')}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${!activeWh ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            الكل
          </button>
          {warehouses.map(w => (
            <button key={w.id} onClick={() => setActiveWh(w.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeWh === w.id ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {w.name}
            </button>
          ))}
        </div>
      )}

      {/* Balance owed banner */}
      {activeWhObj && (
        <div className={`rounded-2xl p-4 flex items-center gap-4 ${owed > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          <Wallet className={`w-8 h-8 shrink-0 ${owed > 0 ? 'text-red-500' : 'text-green-500'}`} />
          <div className="flex-1">
            <p className="text-xs text-gray-500">{activeWhObj.name} {activeWhObj.phone ? `— ${activeWhObj.phone}` : ''}</p>
            <p className={`text-xl font-black ${owed > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {owed > 0 ? `مديونية: ${owed.toLocaleString('ar-IQ')} IQD` : 'لا توجد مديونية ✓'}
            </p>
          </div>
          {owed > 0 && (
            <button onClick={() => { setPayWh(activeWh); setView('payment'); }}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
              سداد
            </button>
          )}
        </div>
      )}

      {warehouses.length === 0 && (
        <div className="text-center py-16 text-gray-400 space-y-3">
          <Building2 className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">لا توجد مستودعات مسجلة</p>
          <button onClick={() => setView('addWh')}
            className="bg-sky-500 hover:bg-sky-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
            إضافة مستودع
          </button>
        </div>
      )}

      {/* Purchases */}
      {whPurchases.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm">فواتير الشراء ({whPurchases.length})</h3>
          {[...whPurchases].reverse().map(p => (
            <PurchaseCard key={p.id} purchase={p} />
          ))}
        </div>
      )}

      {/* Payments */}
      {whPayments.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm">المدفوعات ({whPayments.length})</h3>
          {[...whPayments].reverse().map(pay => (
            <div key={pay.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-green-700">{pay.amount.toLocaleString('ar-IQ')} IQD</p>
                <p className="text-xs text-gray-500">{pay.warehouseName} — {new Date(pay.date).toLocaleDateString('ar-IQ')}</p>
                {pay.notes && <p className="text-xs text-gray-400 mt-0.5">{pay.notes}</p>}
              </div>
              {pay.receiptImage && (
                <img src={pay.receiptImage} alt="إيصال" className="h-14 w-14 rounded-xl object-cover border border-gray-100 cursor-pointer"
                  onClick={() => window.open(pay.receiptImage)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Purchase card with expand ─────────────────────────────────────────────
function PurchaseCard({ purchase }: { purchase: Purchase }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
            <FileText className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{purchase.warehouseName}</p>
            <p className="text-xs text-gray-500">{new Date(purchase.date).toLocaleDateString('ar-IQ')} — {purchase.invoices.length} {purchase.invoices.length === 1 ? 'فاتورة' : 'فواتير'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-black text-sky-700">{purchase.grandTotal.toLocaleString('ar-IQ')} IQD</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {purchase.invoices.map((inv, i) => (
            <div key={inv.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">فاتورة {i + 1}
                  {inv.discountType !== 'none' && <span className="mr-2 text-amber-600">({inv.discountType === 'total' ? `خصم ${inv.totalDiscount}% على الإجمالي` : 'خصم على الأصناف'})</span>}
                </span>
                {inv.image && <img src={inv.image} alt="" className="h-10 rounded-lg object-cover border cursor-pointer" onClick={() => window.open(inv.image)} />}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="px-2 py-1.5 text-right">الصنف</th>
                    <th className="px-2 py-1.5 text-center">الكمية</th>
                    <th className="px-2 py-1.5 text-center">سعر الشراء</th>
                    <th className="px-2 py-1.5 text-center">الإجمالي</th>
                    <th className="px-2 py-1.5 text-center">الانتهاء</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((it, j) => (
                    <tr key={j} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 font-medium text-gray-800">{it.drugName}</td>
                      <td className="px-2 py-1.5 text-center">{it.qty}</td>
                      <td className="px-2 py-1.5 text-center">{it.finalUnitCost.toLocaleString('ar-IQ')}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{it.totalCost.toLocaleString('ar-IQ')}</td>
                      <td className="px-2 py-1.5 text-center text-gray-500">{it.expiry || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-xs pt-1 border-t border-gray-100">
                <span className="text-gray-500">إجمالي الفاتورة {i + 1}</span>
                <span className="font-bold text-sky-700">{calcInvoiceSubtotal(inv).toLocaleString('ar-IQ')} IQD</span>
              </div>
            </div>
          ))}
          {purchase.notes && <p className="text-xs text-gray-400 pt-1">ملاحظات: {purchase.notes}</p>}
        </div>
      )}
    </div>
  );
}
