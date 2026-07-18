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
const PENDING_KEY = 'pharmacy-pending-receipts';

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
interface WH       { id: string; name: string; name_ar?: string; city?: string; phone?: string; address?: string; drug_count: number; }
interface Drug     { id: string; name: string; name_ar?: string; batch_number?: string; quantity: number; unit_price: number; expiry_date?: string; warehouse_id: string; warehouse_name?: string; warehouse_city?: string; }
interface CartItem { drug: Drug; qty: number; }

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

  // ── Load warehouses ──────────────────────────────────────────────────────────
  const loadWarehouses = useCallback(async () => {
    setWhLoading(true);
    try {
      const r = await fetch(`${WH_API}/list`, { headers: phHeaders() });
      const d = await r.json();
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
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { drug, qty: 1 }];
    });
  };

  const setQty = (drugId: string, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(c => c.drug.id !== drugId)); return; }
    setCart(prev => prev.map(c => c.drug.id === drugId ? { ...c, qty } : c));
  };

  const cartTotal = cart.reduce((s, c) => s + c.qty * c.drug.unit_price, 0);
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
        id:         it.id,
        name:       it.name,
        quantity:   it.quantity,
        unit_price: it.unit_price,
        approved:   false,
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
            <span className="text-xs text-emerald-700 font-bold">{fmtPrice(drug.unit_price)}</span>
            <span className="text-xs text-gray-400">متوفر: {drug.quantity}</span>
            {drug.expiry_date && (
              <span className="text-xs text-gray-400">صلاحية: {drug.expiry_date.slice(0, 10)}</span>
            )}
            {drug.warehouse_name && (
              <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md">{drug.warehouse_name}</span>
            )}
          </div>
        </div>
        {inCart ? (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setQty(drug.id, inCart.qty - 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-50 flex items-center justify-center text-gray-600"><Minus className="w-3.5 h-3.5" /></button>
            <span className="w-8 text-center text-sm font-bold text-gray-900">{inCart.qty}</span>
            <button onClick={() => setQty(drug.id, inCart.qty + 1)} className="w-7 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 flex items-center justify-center text-amber-700"><Plus className="w-3.5 h-3.5" /></button>
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
                        {whDrugs.map(d => <DrugCard key={d.id} drug={d} />)}
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
                {searchResults.map(d => <DrugCard key={d.id} drug={d} />)}
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
                        onClick={() => setExpandedOrder(isExp ? null : order.id)}>
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

                      {isExp && (
                        <div className="border-t px-4 pb-4 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-500 mt-3 mb-2">الأصناف:</p>
                          <div className="space-y-1.5">
                            {items.map((it: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-sm bg-white rounded-lg px-3 py-2 border">
                                <span className="text-gray-700">{it.name}</span>
                                <span className="text-gray-500 text-xs">{it.quantity} × {fmtPrice(it.unit_price)}</span>
                              </div>
                            ))}
                          </div>
                          {order.notes && (
                            <p className="text-xs text-gray-400 mt-2 bg-white rounded-lg px-3 py-2 border">{order.notes}</p>
                          )}
                          {/* Receive into pending button — only for delivered orders */}
                          {order.status === 'delivered' && (
                            <button
                              onClick={() => savePendingReceipt(order)}
                              className="mt-3 w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                              <Package className="w-4 h-4" /> استلام وإضافة إلى المخزون المعلق
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

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
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => setQty(c.drug.id, c.qty - 1)} className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center text-gray-600 hover:bg-red-50"><Minus className="w-3.5 h-3.5" /></button>
                        <input
                          type="number" min={1} value={c.qty}
                          onChange={e => setQty(c.drug.id, parseInt(e.target.value) || 1)}
                          className="w-14 text-center border rounded-lg py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-amber-300"
                        />
                        <button onClick={() => setQty(c.drug.id, c.qty + 1)} className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 hover:bg-amber-200"><Plus className="w-3.5 h-3.5" /></button>
                        <span className="text-xs text-gray-500 mr-auto">{fmtPrice(c.qty * c.drug.unit_price)}</span>
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
