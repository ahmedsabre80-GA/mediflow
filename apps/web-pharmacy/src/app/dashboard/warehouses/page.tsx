'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Building2, Search, ShoppingCart, Package, Plus, Minus, X,
  CheckCircle, Clock, Truck, XCircle, RefreshCw, ChevronDown, ChevronUp,
  Warehouse, FileText, AlertTriangle,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const WH_API    = 'https://mediflow-production-d815.up.railway.app/api/v1/warehouses';
const NOTIF_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/portal-notifications';
const PENDING_KEY    = 'pharmacy-pending-receipts';
const CONFIRMED_KEY  = 'pharmacy-confirmed-orders';
const STATUSES_KEY   = 'pharmacy-item-statuses';

// ── Helpers ───────────────────────────────────────────────────────────────────
function phHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem('pharmacy-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  } catch { return { 'Content-Type': 'application/json' }; }
}
function fmtPrice(n: number) {
  return Number(n).toLocaleString('ar-IQ') + ' د.ع';
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
}
function loadPending(): any[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
}
function savePending(list: any[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface WH       { id: string; name: string; name_ar?: string; city?: string; phone?: string; address?: string; drug_count: number; owner_id?: string; }
interface Drug     { id: string; name: string; name_ar?: string; batch_number?: string; quantity: number; unit_price: number; net_price?: number; discount?: number; extra_data?: any; expiry_date?: string; warehouse_id: string; warehouse_name?: string; warehouse_city?: string; }
interface CartItem { drug: Drug; qty: number; }
type ItemStatus = 'accepted' | 'missing' | 'rejected';

function drugPrice(d: Drug) { return d.net_price ?? d.unit_price; }

// ── Order-rule helpers ────────────────────────────────────────────────────────
function getStep(drug: Drug): number {
  const type = drug.extra_data?.min_order_type;
  const qty  = Number(drug.extra_data?.min_order_qty) || 1;
  return (type === 'min' || type === 'step') ? Math.max(1, qty) : 1;
}
function getMinQty(drug: Drug): number {
  return getStep(drug); // first valid quantity
}
function snapToRule(value: number, drug: Drug): number {
  const type = drug.extra_data?.min_order_type;
  const step = getStep(drug);
  let v = Math.max(1, value);
  if (type === 'min')  v = Math.max(v, step);
  if (type === 'step') v = Math.max(step, Math.round(v / step) * step);
  return Math.min(v, drug.quantity);
}
function ruleLabel(drug: Drug): string | null {
  const type = drug.extra_data?.min_order_type;
  const qty  = getStep(drug);
  if (type === 'min')  return `الحد الأدنى للطلب: ${qty} وحدة`;
  if (type === 'step') return `الطلب بمضاعفات ${qty} (${qty}، ${qty*2}، ${qty*3}...)`;
  return null;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: 'قيد الانتظار', color: 'bg-amber-100 text-amber-700',   icon: Clock },
  confirmed:  { label: 'مؤكد',         color: 'bg-blue-100 text-blue-700',     icon: CheckCircle },
  dispatched: { label: 'تم الإرسال',   color: 'bg-indigo-100 text-indigo-700', icon: Truck },
  delivered:  { label: 'تم التسليم',   color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  cancelled:  { label: 'ملغي',         color: 'bg-red-100 text-red-700',       icon: XCircle },
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WarehousesPage() {
  const [tab, setTab] = useState<'browse' | 'search' | 'orders'>('browse');

  // Warehouse list
  const [warehouses, setWarehouses]     = useState<WH[]>([]);
  const [whLoading, setWhLoading]       = useState(true);
  const [selectedWH, setSelectedWH]     = useState<WH | null>(null);
  const [whDrugs, setWhDrugs]           = useState<Drug[]>([]);
  const [whDrugsLoading, setWhDrugsLoading] = useState(false);

  // Drug search
  const [searchQ, setSearchQ]           = useState('');
  const [searchResults, setSearchResults] = useState<Drug[]>([]);
  const [searching, setSearching]       = useState(false);
  const searchTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cart
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen]         = useState(false);
  const [orderNotes, setOrderNotes]     = useState('');
  const [placing, setPlacing]           = useState(false);
  const [placeError, setPlaceError]     = useState('');
  const [placeSuccess, setPlaceSuccess] = useState('');

  // My orders
  const [myOrders, setMyOrders]         = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Raw typed qty strings (so user can type multi-digit freely)
  const [localQtys, setLocalQtys] = useState<Record<string, string>>({});

  // ── Receipt review ────────────────────────────────────────────────────────────
  const [itemStatuses, setItemStatusesRaw]  = useState<Record<string, ItemStatus>>(() => {
    try { return JSON.parse(localStorage.getItem(STATUSES_KEY) || '{}'); } catch { return {}; }
  });
  const setItemStatuses = (fn: (p: Record<string, ItemStatus>) => Record<string, ItemStatus>) => {
    setItemStatusesRaw(prev => {
      const next = fn(prev);
      try { localStorage.setItem(STATUSES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [itemImages, setItemImages]         = useState<Record<string, string>>({});
  const [missingQtys, setMissingQtys]       = useState<Record<string, string>>({});  // actual received qty for ناقص
  const [rejectedNotes, setRejectedNotes]   = useState<Record<string, string>>({});  // note for تالف
  const [sendingNotif, setSendingNotif]     = useState(false);
  const [rejectAllMsg, setRejectAllMsg]     = useState('');
  const [showRejectBox, setShowRejectBox]   = useState<string | null>(null);
  const [confirmedOrders, setConfirmedOrders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CONFIRMED_KEY) || '[]')); } catch { return new Set(); }
  });
  // Tracks orders where user clicked قبول الكل — hides bulk buttons so only per-item & confirm remain
  const [bulkDoneOrders, setBulkDoneOrders] = useState<Set<string>>(new Set());

  const ensureStatuses = (order: any) => {
    setItemStatusesRaw(prev => {
      const updated = { ...prev };
      let changed = false;
      (order.items || []).forEach((it: any) => {
        if (!(it.id in updated)) { updated[it.id] = 'accepted'; changed = true; }
      });
      if (changed) { try { localStorage.setItem(STATUSES_KEY, JSON.stringify(updated)); } catch {} }
      return changed ? updated : prev;
    });
  };

  const setItemStatus = (itemId: string, status: ItemStatus) => {
    setItemStatuses(p => ({ ...p, [itemId]: status }));
    if (status !== 'rejected') { setItemImages(p => { const n = { ...p }; delete n[itemId]; return n; }); setRejectedNotes(p => { const n = { ...p }; delete n[itemId]; return n; }); }
    if (status !== 'missing')  { setMissingQtys(p => { const n = { ...p }; delete n[itemId]; return n; }); }
  };

  const acceptAll = (order: any) => {
    const updated: Record<string, ItemStatus> = {};
    (order.items || []).forEach((it: any) => { updated[it.id] = 'accepted'; });
    setItemStatuses(p => ({ ...p, ...updated }));
    setShowRejectBox(null);
    setBulkDoneOrders(prev => new Set([...prev, order.id]));
  };

  const handleImageUpload = (itemId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = e => setItemImages(p => ({ ...p, [itemId]: e.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const confirmReceipt = async (order: any) => {
    const allItems: any[] = order.items || [];
    const accepted = allItems.filter(it => (itemStatuses[it.id] ?? 'accepted') === 'accepted');
    const missing  = allItems.filter(it => itemStatuses[it.id] === 'missing');
    const rejected = allItems.filter(it => itemStatuses[it.id] === 'rejected');

    if (accepted.length === 0 && missing.length === 0 && rejected.length === 0) {
      alert('لا توجد أصناف لمعالجتها'); return;
    }

    const existing = loadPending();
    const alreadyExists = !!existing.find((p: any) => p.orderId === order.id);

    // Build receipt items: accepted (full qty) + missing (actual received qty)
    const receiptItems = [
      ...accepted.map((it: any) => ({ id: it.id, name: it.name, ordered_qty: it.quantity, unit_price: it.unit_price, is_gift: false, status: 'pending' })),
      ...missing.map((it: any) => {
        const actualQty = parseInt(missingQtys[it.id] || '0') || 0;
        return { id: it.id, name: it.name, ordered_qty: actualQty > 0 ? actualQty : it.quantity, unit_price: it.unit_price, is_gift: false, status: 'pending' };
      }),
    ];
    if (receiptItems.length > 0 && !alreadyExists) {
      const receipt = {
        id:            `receipt_${Date.now()}`,
        orderId:       order.id,
        warehouseName: order.warehouse_name,
        orderDate:     order.created_at,
        deliveredDate: new Date().toISOString(),
        total:         receiptItems.reduce((s: number, it: any) => s + it.ordered_qty * it.unit_price, 0),
        items:         receiptItems,
      };
      savePending([...existing, receipt]);
    }

    const summaryLines: string[] = [];
    if (accepted.length > 0)
      summaryLines.push(`✅ مستلم: ${accepted.map((it: any) => it.name).join('، ')}`);
    if (missing.length > 0)
      summaryLines.push(`⚠️ ناقص: ${missing.map((it: any) => { const a = parseInt(missingQtys[it.id]||'0')||0; return `${it.name} (وصل ${a > 0 ? a : '؟'} من ${it.quantity})`; }).join('، ')}`);
    if (rejected.length > 0)
      summaryLines.push(`❌ مرفوض: ${rejected.map((it: any) => `${it.name}${rejectedNotes[it.id] ? ' — ' + rejectedNotes[it.id] : ''}`).join('، ')}`);

    // Find warehouse owner_id — try loaded list first, then fetch warehouse details
    const wh = warehouses.find((w: WH) => w.id === order.warehouse_id);
    let ownerId = wh?.owner_id;

    // Fallback: if owner_id not in list (older deployed backend), fetch it directly
    if (!ownerId && order.warehouse_id) {
      try {
        const whRes = await fetch(`${WH_API}/list`, { headers: phHeaders() });
        if (whRes.ok) {
          const whData = await whRes.json();
          const found = (whData.data || []).find((w: WH) => w.id === order.warehouse_id);
          ownerId = found?.owner_id;
        }
      } catch {}
    }

    const pharmacyName = localStorage.getItem('pharmacy-name') || 'صيدلية';
    console.log('[confirmReceipt] ownerId:', ownerId, 'order.warehouse_id:', order.warehouse_id);

    setSendingNotif(true);
    try {
      if (ownerId) {
        const res = await fetch(NOTIF_API, {
          method: 'POST', headers: phHeaders(),
          body: JSON.stringify({
            portalType:  'warehouse',
            recipientId: ownerId,
            senderName:  pharmacyName,
            message: `[PHREPORT][oid:${order.id}]\n${summaryLines.join('\n')}`,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          alert(`تعذر إرسال الإشعار للمستودع (${res.status}): ${body}`);
        }
      } else {
        alert('تعذر الحصول على معرّف المستودع — تأكد من تحديث الصفحة وإعادة المحاولة');
      }
    } catch (e) { console.error('notification error', e); }
    finally { setSendingNotif(false); }

    // Lock this order
    setConfirmedOrders(prev => { const s = new Set(Array.from(prev)); s.add(order.id); try { localStorage.setItem(CONFIRMED_KEY, JSON.stringify(Array.from(s))); } catch {} return s; });

    const parts: string[] = [];
    if (accepted.length > 0) parts.push(alreadyExists ? `✅ ${accepted.length} صنف مستلم (سبق إضافته للمخزون)` : `✅ ${accepted.length} صنف مستلم أُضيف للمخزون المعلق`);
    if (missing.length  > 0) parts.push(`⚠️ ${missing.length} صنف ناقص — تم إشعار المستودع`);
    if (rejected.length > 0) parts.push(`❌ ${rejected.length} صنف مرفوض — تم إشعار المستودع`);
    alert(parts.join('\n'));
  };

  const sendRejectAll = async (order: any) => {
    if (!rejectAllMsg.trim()) { alert('يرجى كتابة سبب الرفض'); return; }
    setSendingNotif(true);
    const updated: Record<string, ItemStatus> = {};
    (order.items || []).forEach((it: any) => { updated[it.id] = 'rejected'; });
    setItemStatuses(p => ({ ...p, ...updated }));
    try {
      const reason = rejectAllMsg.trim();
      const itemList = (order.items || []).map((it: any) => `• ${it.name}`).join('\n');
      const wh2 = warehouses.find((w: WH) => w.id === order.warehouse_id);
      let ownerId2 = wh2?.owner_id;
      if (!ownerId2 && order.warehouse_id) {
        try {
          const whRes2 = await fetch(`${WH_API}/list`, { headers: phHeaders() });
          if (whRes2.ok) {
            const whData2 = await whRes2.json();
            const found2 = (whData2.data || []).find((w: WH) => w.id === order.warehouse_id);
            ownerId2 = found2?.owner_id;
          }
        } catch {}
      }
      const pharmacyName2 = localStorage.getItem('pharmacy-name') || 'صيدلية';
      console.log('[sendRejectAll] ownerId2:', ownerId2, 'order.warehouse_id:', order.warehouse_id);
      if (ownerId2) {
        const res2 = await fetch(NOTIF_API, {
          method: 'POST', headers: phHeaders(),
          body: JSON.stringify({
            portalType:  'warehouse',
            recipientId: ownerId2,
            senderName:  pharmacyName2,
            message: `[PHREPORT][oid:${order.id}]\n❌ رفض الطلب بالكامل — السبب: ${reason}\n${itemList}`,
          }),
        });
        if (!res2.ok) {
          const body2 = await res2.text().catch(() => '');
          alert(`تعذر إرسال الإشعار للمستودع (${res2.status}): ${body2}`);
        }
      } else {
        alert('تعذر الحصول على معرّف المستودع — تأكد من تحديث الصفحة وإعادة المحاولة');
      }
      setShowRejectBox(null);
      setRejectAllMsg('');
      setConfirmedOrders(prev => { const s = new Set(Array.from(prev)); s.add(order.id); try { localStorage.setItem(CONFIRMED_KEY, JSON.stringify(Array.from(s))); } catch {} return s; });
      alert('✅ تم إرسال إشعار الرفض للمستودع وتأمين الطلب');
    } catch { alert('تعذر إرسال الإشعار، حاول مرة أخرى'); }
    finally { setSendingNotif(false); }
  };

  // ── Load warehouses ──────────────────────────────────────────────────────────
  const loadWarehouses = useCallback(async () => {
    setWhLoading(true);
    try {
      const r = await fetch(`${WH_API}/list`, { headers: phHeaders() });
      const d = await r.json();
      console.log('[loadWarehouses] first warehouse:', JSON.stringify(d.data?.[0]));
      setWarehouses(d.data || []);
    } catch { setWarehouses([]); }
    finally { setWhLoading(false); }
  }, []);

  useEffect(() => { loadWarehouses(); }, [loadWarehouses]);

  // ── Load warehouse catalog ───────────────────────────────────────────────────
  const loadWhDrugs = useCallback(async (wh: WH) => {
    setSelectedWH(wh);
    setWhDrugsLoading(true);
    try {
      const r = await fetch(`${WH_API}/catalog`, { headers: phHeaders() });
      const d = await r.json();
      const all: Drug[] = d.data || [];
      setWhDrugs(all.filter((x: Drug) => x.warehouse_id === wh.id));
    } catch { setWhDrugs([]); }
    finally { setWhDrugsLoading(false); }
  }, []);

  // ── Drug search ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQ.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`${WH_API}/drugs/search?q=${encodeURIComponent(searchQ.trim())}`);
        const d = await r.json();
        setSearchResults(d.data || []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, [searchQ]);

  // ── Cart helpers ─────────────────────────────────────────────────────────────
  const cartWarehouseId = cart[0]?.drug.warehouse_id ?? null;

  const addToCart = (drug: Drug) => {
    if (cartWarehouseId && cartWarehouseId !== drug.warehouse_id) {
      alert('يمكنك الطلب من مستودع واحد فقط في كل مرة. أفرغ السلة أولاً لتغيير المستودع.');
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(c => c.drug.id === drug.id);
      if (idx >= 0) {
        const step = getStep(drug);
        const next = Math.min(prev[idx].qty + step, drug.quantity);
        return prev.map((c, i) => i === idx ? { ...c, qty: next } : c);
      }
      return [...prev, { drug, qty: getMinQty(drug) }];
    });
  };

  const setQty = (drugId: string, qty: number, drug?: Drug) => {
    if (qty <= 0) { setCart(prev => prev.filter(c => c.drug.id !== drugId)); return; }
    const snapped = drug ? snapToRule(qty, drug) : qty;
    setCart(prev => prev.map(c => c.drug.id === drugId ? { ...c, qty: snapped } : c));
  };

  const cartTotal = cart.reduce((s, c) => s + c.qty * drugPrice(c.drug), 0);
  const cartWarehouse = warehouses.find(w => w.id === cartWarehouseId) ?? (cart[0] ? { id: cartWarehouseId!, name: cart[0].drug.warehouse_name || '—', drug_count: 0 } : null);

  // ── Place order ──────────────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (!cart.length) return;
    setPlacing(true);
    setPlaceError('');
    setPlaceSuccess('');
    try {
      const pharmacyId   = localStorage.getItem('pharmacy-user-id') || '';
      const pharmacyName = localStorage.getItem('pharmacy-name')    || 'صيدلية';
      const items = cart.map(c => ({
        inventory_id: c.drug.id,
        name:         c.drug.name,
        quantity:     c.qty,
        unit_price:   c.drug.unit_price,
      }));
      const r = await fetch(`${WH_API}/b2b-orders`, {
        method: 'POST',
        headers: phHeaders(),
        body: JSON.stringify({
          warehouse_id:  cartWarehouseId,
          pharmacy_id:   pharmacyId,
          pharmacy_name: pharmacyName,
          items,
          notes: orderNotes.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.title || 'فشل إرسال الطلب');

      setPlaceSuccess(`✅ تم إرسال الطلب بنجاح — رقم الطلب: ${d.data.id.slice(0, 8)}`);
      setCart([]);
      setOrderNotes('');
      setCartOpen(false);
      loadMyOrders();
    } catch (e: any) {
      setPlaceError(e.message);
    } finally {
      setPlacing(false);
    }
  };

  // ── My orders ────────────────────────────────────────────────────────────────
  const loadMyOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const r = await fetch(`${WH_API}/my-b2b-orders`, { headers: phHeaders() });
      const d = await r.json();
      setMyOrders(d.data || []);
    } catch { setMyOrders([]); }
    finally { setOrdersLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'orders') loadMyOrders(); }, [tab, loadMyOrders]);

  // ── Save delivered order as pending receipt ───────────────────────────────────
  const savePendingReceipt = (order: any) => {
    const existing = loadPending();
    if (existing.find((p: any) => p.orderId === order.id)) {
      alert('هذا الطلب موجود بالفعل في طلبيات المعلقة');
      return;
    }
    const receipt = {
      id:            `receipt_${Date.now()}`,
      orderId:       order.id,
      warehouseName: order.warehouse_name,
      orderDate:     order.created_at,
      deliveredDate: new Date().toISOString(),
      total:         order.total,
      items:         (order.items || []).map((it: any) => ({
        id:          it.id,
        name:        it.name,
        ordered_qty: it.quantity,
        unit_price:  it.unit_price,
        is_gift:     false,
        status:      'pending',
      })),
    };
    savePending([...existing, receipt]);
    alert('✅ تم إضافة الطلب إلى "طلبيات معلقة" في صفحة المخزون');
  };

  // ── Drug card ────────────────────────────────────────────────────────────────
  const DrugCard = ({ drug }: { drug: Drug }) => {
    const inCart = cart.find(c => c.drug.id === drug.id);
    const wrongWH = cartWarehouseId && cartWarehouseId !== drug.warehouse_id;
    return (
      <div className={`bg-white rounded-xl border p-3 flex items-center justify-between gap-3 ${wrongWH ? 'opacity-40' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{drug.name}</p>
          {drug.name_ar && drug.name_ar !== drug.name && (
            <p className="text-xs text-gray-400 truncate">{drug.name_ar}</p>
          )}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-emerald-700 font-bold">{fmtPrice(drugPrice(drug))}</span>
            {drug.extra_data?.discount_type === 'gift' && drug.extra_data?.gift_free > 0
              ? <span className="text-xs bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-md">🎁 {drug.extra_data.gift_free} مجاناً لكل {drug.extra_data.gift_per}</span>
              : drug.discount && drug.discount > 0
              ? <span className="text-xs bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-md">خصم {drug.discount}%</span>
              : null}
            <span className="text-xs text-gray-400">متوفر: {drug.quantity.toLocaleString()}</span>
            {drug.expiry_date && (
              <span className="text-xs text-gray-400">صلاحية: {drug.expiry_date.slice(0, 10)}</span>
            )}
            {drug.warehouse_name && (
              <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md">{drug.warehouse_name}</span>
            )}
          </div>
          {ruleLabel(drug) && (
            <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-0.5 mt-1.5 w-fit">
              ℹ️ {ruleLabel(drug)}
            </p>
          )}
        </div>
        {inCart ? (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { setQty(drug.id, inCart.qty - getStep(drug), drug); setLocalQtys(p => { const n={...p}; delete n[drug.id]; return n; }); }} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-50 flex items-center justify-center text-gray-600"><Minus className="w-3.5 h-3.5" /></button>
            <input
              type="number"
              inputMode="numeric"
              value={localQtys[drug.id] ?? String(inCart.qty)}
              onChange={e => setLocalQtys(p => ({ ...p, [drug.id]: e.target.value }))}
              onBlur={e => {
                const v = parseInt(e.target.value);
                setQty(drug.id, isNaN(v) || v < 1 ? getMinQty(drug) : v, drug);
                setLocalQtys(p => { const n = { ...p }; delete n[drug.id]; return n; });
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-16 text-center text-sm font-bold text-gray-900 border border-gray-200 rounded-lg py-0.5 outline-none focus:border-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button onClick={() => { setQty(drug.id, inCart.qty + getStep(drug), drug); setLocalQtys(p => { const n={...p}; delete n[drug.id]; return n; }); }} className="w-7 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 flex items-center justify-center text-amber-700"><Plus className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button
            disabled={!!wrongWH}
            onClick={() => addToCart(drug)}
            className="shrink-0 flex items-center gap-1 bg-amber-400 hover:bg-amber-500 disabled:opacity-30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
            <Plus className="w-3.5 h-3.5" /> أضف
          </button>
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-amber-500 px-4 py-6 pt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">المستودعات</h1>
            <p className="text-amber-100 text-sm mt-0.5">تصفح وأطلب من المستودعات</p>
          </div>
          {/* Cart button */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-white transition-colors">
            <ShoppingCart className="w-5 h-5" />
            {cart.length > 0 && (
              <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-3 bg-white border-b sticky top-0 z-10">
        {([['browse', '🏭 تصفح المستودعات'], ['search', '🔍 بحث عن دواء'], ['orders', '📋 طلباتي']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${tab === key ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {placeSuccess && (
        <div className="mx-4 mt-3 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" /> {placeSuccess}
        </div>
      )}

      <div className="px-4 mt-4 space-y-3">

        {/* ── BROWSE TAB ───────────────────────────────────────────────── */}
        {tab === 'browse' && (
          <>
            {whLoading ? (
              <p className="text-center text-gray-400 text-sm py-8">جاري التحميل...</p>
            ) : warehouses.length === 0 ? (
              <div className="text-center py-12">
                <Warehouse className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">لا توجد مستودعات نشطة حالياً</p>
              </div>
            ) : (
              <>
                {/* Warehouse list */}
                {!selectedWH && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">اختر مستودعاً لعرض كتالوج الأدوية</p>
                    {warehouses.map(wh => (
                      <button key={wh.id} onClick={() => loadWhDrugs(wh)}
                        className="w-full bg-white rounded-2xl border p-4 text-right hover:border-amber-300 hover:shadow-sm transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 text-sm">{wh.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{wh.city || '—'}{wh.phone ? ` · ${wh.phone}` : ''}</p>
                          </div>
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">
                            {wh.drug_count} صنف
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Warehouse catalog */}
                {selectedWH && (
                  <>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setSelectedWH(null); setWhDrugs([]); }}
                        className="text-xs text-amber-600 font-semibold hover:underline">← العودة</button>
                      <span className="text-xs text-gray-400">/</span>
                      <span className="text-xs font-bold text-gray-700">{selectedWH.name}</span>
                    </div>
                    {whDrugsLoading ? (
                      <p className="text-center text-gray-400 text-sm py-8">جاري التحميل...</p>
                    ) : whDrugs.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-8">لا توجد أدوية متوفرة في هذا المستودع حالياً</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">{whDrugs.length} صنف متوفر</p>
                        {whDrugs.map(d => <div key={d.id}>{DrugCard({ drug: d })}</div>)}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── SEARCH TAB ───────────────────────────────────────────────── */}
        {tab === 'search' && (
          <>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="ابحث عن دواء بالاسم..."
                className="w-full bg-white border rounded-xl pr-9 pl-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                autoFocus
              />
              {searching && <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
            </div>
            {searchResults.length === 0 && searchQ.length >= 2 && !searching && (
              <p className="text-center text-gray-400 text-sm py-6">لا توجد نتائج</p>
            )}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">{searchResults.length} نتيجة</p>
                {searchResults.map(d => <div key={d.id}>{DrugCard({ drug: d })}</div>)}
              </div>
            )}
            {searchQ.length < 2 && (
              <div className="text-center py-10">
                <Search className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">أدخل حرفين على الأقل للبحث</p>
              </div>
            )}
          </>
        )}

        {/* ── MY ORDERS TAB ────────────────────────────────────────────── */}
        {tab === 'orders' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">طلباتي من المستودعات</p>
              <button onClick={loadMyOrders} className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors">
                <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {ordersLoading ? (
              <p className="text-center text-gray-400 text-sm py-8">جاري التحميل...</p>
            ) : myOrders.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">لا توجد طلبات سابقة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myOrders.map(order => {
                  const cfg = STATUS_CFG[order.status] || STATUS_CFG.pending;
                  const Icon = cfg.icon;
                  const isExp = expandedOrder === order.id;
                  const items: any[] = order.items || [];
                  return (
                    <div key={order.id} className="bg-white rounded-2xl border overflow-hidden">
                      <button
                        className="w-full p-4 text-right"
                        onClick={() => {
                          if (!isExp && order.status === 'delivered') ensureStatuses(order);
                          setExpandedOrder(isExp ? null : order.id);
                        }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 text-sm">{order.warehouse_name || '—'}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(order.created_at)} · {items.length} صنف · {fmtPrice(order.total)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${cfg.color}`}>
                              <Icon className="w-3 h-3" /> {cfg.label}
                            </span>
                            {isExp ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>
                      </button>

                      {isExp && (() => {
                        const locked = confirmedOrders.has(order.id);
                        return (
                        <div className="border-t px-4 pb-4 bg-gray-50">

                          {/* Locked banner */}
                          {order.status === 'delivered' && locked && (
                            <div className="mt-3 bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-gray-500">🔒 تم معالجة هذا الطلب</p>
                              <button
                                onClick={() => {
                                  setConfirmedOrders(prev => { const s = new Set(Array.from(prev)); s.delete(order.id); try { localStorage.setItem(CONFIRMED_KEY, JSON.stringify(Array.from(s))); } catch {} return s; });
                                  // Remove from pending receipts so it can be re-saved
                                  const cleaned = loadPending().filter((p: any) => p.orderId !== order.id);
                                  savePending(cleaned);
                                  // Reset item statuses for this order
                                  const resetStatuses: Record<string, ItemStatus> = {};
                                  (order.items || []).forEach((it: any) => { resetStatuses[it.id] = 'accepted'; });
                                  setItemStatuses(p => { const next = { ...p, ...resetStatuses }; return next; });
                                  setMissingQtys(p => { const n = { ...p }; (order.items || []).forEach((it: any) => delete n[it.id]); return n; });
                                  setRejectedNotes(p => { const n = { ...p }; (order.items || []).forEach((it: any) => delete n[it.id]); return n; });
                                  setBulkDoneOrders(prev => { const s = new Set(prev); s.delete(order.id); return s; });
                                }}
                                className="text-xs text-amber-600 font-bold border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                                إعادة التحديد
                              </button>
                            </div>
                          )}

                          {/* Accept all / Reject all — delivered, not yet locked, not yet bulk-accepted */}
                          {order.status === 'delivered' && !locked && !bulkDoneOrders.has(order.id) && (
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => acceptAll(order)}
                                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> قبول الكل
                              </button>
                              <button onClick={() => { setShowRejectBox(showRejectBox === order.id ? null : order.id); setRejectAllMsg(''); }}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1">
                                <XCircle className="w-3.5 h-3.5" /> رفض الكل
                              </button>
                            </div>
                          )}

                          {/* Reject-all justification box */}
                          {order.status === 'delivered' && !locked && !bulkDoneOrders.has(order.id) && showRejectBox === order.id && (
                            <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                              <p className="text-xs font-bold text-red-700">سبب رفض الطلب بالكامل — سيُرسل للمستودع:</p>
                              <textarea
                                value={rejectAllMsg}
                                onChange={e => setRejectAllMsg(e.target.value)}
                                placeholder="اكتب سبب الرفض هنا..."
                                rows={3}
                                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                              />
                              <button onClick={() => sendRejectAll(order)} disabled={sendingNotif || !rejectAllMsg.trim()}
                                className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-2">
                                {sendingNotif ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                إرسال الرفض وإشعار المستودع
                              </button>
                            </div>
                          )}

                          {/* Items list */}
                          <p className="text-xs font-semibold text-gray-500 mt-3 mb-2">الأصناف:</p>
                          <div className="space-y-2">
                            {items.map((it: any) => {
                              const st: ItemStatus = itemStatuses[it.id] ?? 'accepted';
                              const stColor = locked
                                ? (st === 'accepted' ? 'border-emerald-200 bg-emerald-50' : st === 'missing' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50')
                                : (st === 'accepted' ? 'border-emerald-300 bg-emerald-50' : st === 'missing' ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50');
                              return (
                                <div key={it.id} className={`rounded-xl border p-3 space-y-2 transition-colors ${order.status === 'delivered' ? stColor : 'bg-white border-gray-200'} ${locked ? 'opacity-70' : ''}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-gray-800">{it.name}</span>
                                    <span className="text-xs text-gray-500">{it.quantity} × {fmtPrice(it.unit_price)}</span>
                                  </div>
                                  {/* Inline status buttons — always visible when order is not locked */}
                                  {order.status === 'delivered' && !locked && (
                                    <div className="flex gap-1.5">
                                      {([['accepted','✅ مستلم','bg-emerald-500'],['missing','⚠️ ناقص','bg-amber-500'],['rejected','❌ تالف','bg-red-500']] as const).map(([val,lbl,cls]) => (
                                        <button key={val} onClick={() => setItemStatus(it.id, val as ItemStatus)}
                                          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${st === val ? `${cls} text-white` : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                          {lbl}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {/* Show locked status label */}
                                  {order.status === 'delivered' && locked && (
                                    <p className="text-xs font-semibold">
                                      {st === 'accepted' ? '✅ مستلم بالكامل' :
                                       st === 'missing'  ? `⚠️ ناقص — وصل ${missingQtys[it.id] || '؟'} من ${it.quantity} — أُشعر المستودع` :
                                       `❌ تالف/مرفوض${rejectedNotes[it.id] ? ` — ${rejectedNotes[it.id]}` : ''} — أُشعر المستودع`}
                                    </p>
                                  )}
                                  {/* ناقص: actual received qty input */}
                                  {order.status === 'delivered' && !locked && st === 'missing' && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-amber-700 font-semibold shrink-0">كم وصل فعلاً؟</span>
                                      <input
                                        type="number" inputMode="numeric" min={0} max={it.quantity}
                                        placeholder={`من ${it.quantity}`}
                                        value={missingQtys[it.id] ?? ''}
                                        onChange={e => setMissingQtys(p => ({ ...p, [it.id]: e.target.value }))}
                                        className="w-24 border border-amber-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <span className="text-xs text-gray-400">/ {it.quantity}</span>
                                    </div>
                                  )}
                                  {/* تالف: note + photo */}
                                  {order.status === 'delivered' && !locked && st === 'rejected' && (
                                    <div className="space-y-1.5">
                                      <textarea
                                        rows={2}
                                        placeholder="سبب الرفض أو وصف العيب (اختياري)..."
                                        value={rejectedNotes[it.id] ?? ''}
                                        onChange={e => setRejectedNotes(p => ({ ...p, [it.id]: e.target.value }))}
                                        className="w-full border border-red-200 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-red-300"
                                      />
                                      <label className="text-xs text-red-600 font-semibold cursor-pointer hover:text-red-700 flex items-center gap-1">
                                        📷 رفع صورة (اختياري)
                                        <input type="file" accept="image/*" className="hidden"
                                          onChange={e => { if (e.target.files?.[0]) handleImageUpload(it.id, e.target.files[0]); }} />
                                      </label>
                                      {itemImages[it.id] && (
                                        <img src={itemImages[it.id]} alt="proof" className="w-16 h-16 object-cover rounded-lg border border-red-200" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {order.notes && (
                            <p className="text-xs text-gray-400 mt-2 bg-white rounded-lg px-3 py-2 border">{order.notes}</p>
                          )}

                          {/* Confirm button — only when delivered and not yet locked */}
                          {order.status === 'delivered' && !locked && (
                            <button onClick={() => confirmReceipt(order)} disabled={sendingNotif}
                              className="mt-3 w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                              {sendingNotif ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                              تأكيد وإضافة المستلم للمخزون
                            </button>
                          )}
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Floating cart bar ───────────────────────────────────────────── */}
      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-xl flex items-center justify-between px-5 transition-colors">
            <span className="bg-white text-amber-600 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center shrink-0">{cart.length}</span>
            <span className="text-base">عرض السلة وإرسال الطلب</span>
            <span className="text-base font-bold">{fmtPrice(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* ── CART DRAWER ──────────────────────────────────────────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex" dir="rtl">
          <div className="flex-1 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="w-full max-w-sm bg-white shadow-xl flex flex-col h-full overflow-hidden">
            {/* Cart header */}
            <div className="flex items-center justify-between px-4 py-4 border-b bg-amber-500">
              <h2 className="font-bold text-white text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> السلة
              </h2>
              <button onClick={() => setCartOpen(false)} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <ShoppingCart className="w-12 h-12 text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">السلة فارغة</p>
              </div>
            ) : (
              <>
                {cartWarehouse && (
                  <div className="px-4 py-2.5 bg-amber-50 border-b flex items-center gap-2 text-xs text-amber-700">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    الطلب من: <span className="font-bold">{cartWarehouse.name}</span>
                  </div>
                )}
                {/* Cart items */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {cart.map(c => (
                    <div key={c.drug.id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.drug.name}</p>
                          <p className="text-xs text-emerald-700 font-bold mt-0.5">{fmtPrice(c.drug.unit_price)}</p>
                        </div>
                        <button onClick={() => setCart(prev => prev.filter(x => x.drug.id !== c.drug.id))} className="text-red-400 hover:text-red-600 p-0.5 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {ruleLabel(c.drug) && (
                        <p className="text-xs text-indigo-600 mt-1">ℹ️ {ruleLabel(c.drug)}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => { setQty(c.drug.id, c.qty - getStep(c.drug), c.drug); setLocalQtys(p => { const n={...p}; delete n[c.drug.id]; return n; }); }} className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center text-gray-600 hover:bg-red-50"><Minus className="w-3.5 h-3.5" /></button>
                        <input
                          type="number" inputMode="numeric"
                          value={localQtys[c.drug.id] ?? String(c.qty)}
                          onChange={e => setLocalQtys(p => ({ ...p, [c.drug.id]: e.target.value }))}
                          onBlur={e => { const v = parseInt(e.target.value); setQty(c.drug.id, isNaN(v) || v < 1 ? getMinQty(c.drug) : v, c.drug); setLocalQtys(p => { const n={...p}; delete n[c.drug.id]; return n; }); }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="w-16 text-center border rounded-lg py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-amber-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button onClick={() => { setQty(c.drug.id, c.qty + getStep(c.drug), c.drug); setLocalQtys(p => { const n={...p}; delete n[c.drug.id]; return n; }); }} className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 hover:bg-amber-200"><Plus className="w-3.5 h-3.5" /></button>
                        <span className="text-xs text-gray-500 mr-auto">{fmtPrice(c.qty * drugPrice(c.drug))}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Notes + total + place order */}
                <div className="border-t px-4 py-4 space-y-3">
                  <textarea
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    placeholder="ملاحظات (اختياري)..."
                    rows={2}
                    className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-600">الإجمالي:</span>
                    <span className="text-lg font-bold text-emerald-700">{fmtPrice(cartTotal)}</span>
                  </div>
                  {placeError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {placeError}
                    </p>
                  )}
                  <button
                    onClick={placeOrder}
                    disabled={placing || cart.length === 0}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {placing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                    {placing ? 'جاري الإرسال...' : 'إرسال الطلب'}
                  </button>
                  <button
                    onClick={() => { setCart([]); setCartOpen(false); }}
                    className="w-full text-red-500 text-sm font-semibold py-2 hover:bg-red-50 rounded-xl transition-colors">
                    🗑️ إفراغ السلة
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
