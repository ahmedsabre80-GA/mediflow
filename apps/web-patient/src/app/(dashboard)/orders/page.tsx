'use client';
import { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, RefreshCw, ShoppingCart, XCircle } from 'lucide-react';
import Link from 'next/link';

const PHARMACY_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

function patientH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const raw = localStorage.getItem('mediflow-auth');
    const parsed = raw ? JSON.parse(raw) : {};
    const t = parsed.state?.accessToken || parsed.accessToken || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}
const CANCELLED_KEY = 'mediflow-cancelled-orders';

interface Order {
  id: string;
  type: 'reservation' | 'receipt' | 'confirmation' | 'rejected' | 'prescription';
  drug: string;
  pharmacy: string;
  pharmacyOwnerId?: string;
  pharmacyId?: string;
  prescriptionId?: string;
  qty: number;
  price: number;
  currency: string;
  total: number;
  date: string;
  submittedAt?: string;
  status: 'pending' | 'confirmed' | 'delivered' | 'rejected';
  rawMessage: string;
}

function parseNotif(n: any): Order | null {
  const msg: string = n.message || '';

  // Patient sent reservation — still waiting
  if (msg.includes('تم استلام طلب حجزك')) {
    const drug           = msg.match(/الدواء:\s*(.+)/)?.[1]?.trim()              || '—';
    const pharmacy       = msg.match(/الصيدلية:\s*(.+)/)?.[1]?.trim()            || n.sender_name || '—';
    const qtyStr         = msg.match(/الكمية:\s*(\d+)/)?.[1]                     || '1';
    const pharmacyOwnerId = msg.match(/\[pharmacy_owner_id:([^\]]+)\]/)?.[1]     || '';
    const pharmacyId      = msg.match(/\[pharmacy_id:([^\]]+)\]/)?.[1]           || '';
    return { id: n.id, type: 'reservation', drug, pharmacy, pharmacyOwnerId, pharmacyId, qty: Number(qtyStr), price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'pending', rawMessage: msg };
  }

  // Prescription submitted by patient
  if (msg.includes('تم إرسال وصفتك الطبية')) {
    const prescriptionId = msg.match(/\[prescription_id:([^\]]+)\]/)?.[1] || '';
    const delivery = msg.includes('توصيل') ? 'توصيل للمنزل' : 'استلام من الصيدلية';
    return { id: n.id, type: 'prescription' as any, drug: `وصفة طبية — ${delivery}`, pharmacy: '—', prescriptionId, qty: 1, price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'pending', rawMessage: msg };
  }

  // Prescription accepted by pharmacy
  if (msg.includes('قبلت صيدلية') && msg.includes('وصفتك الطبية')) {
    const pharmacy = msg.match(/قبلت صيدلية ([^\n!]+)/)?.[1]?.trim() || n.sender_name || '—';
    return { id: n.id, type: 'prescription' as any, drug: 'وصفة طبية — تم القبول', pharmacy, qty: 1, price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'confirmed', rawMessage: msg };
  }

  // Prescription delivered/ready
  if (msg.includes('وصفتك الطبية جاهزة') || msg.includes('تم توصيل وصفتك')) {
    const pharmacy = n.sender_name || '—';
    return { id: n.id, type: 'prescription' as any, drug: 'وصفة طبية — تم التسليم', pharmacy, qty: 1, price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'delivered', rawMessage: msg };
  }

  // Prescription rejected by pharmacy
  if (msg.includes('ملاحظة من صيدلية') && msg.includes('وصفتك')) {
    const pharmacy = msg.match(/ملاحظة من صيدلية ([^\n]+)/)?.[1]?.trim() || n.sender_name || '—';
    return { id: n.id, type: 'prescription' as any, drug: 'وصفة طبية — مرفوضة', pharmacy, qty: 1, price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'rejected', rawMessage: msg };
  }

  // Prescription expired (no pharmacy responded)
  if (msg.includes('لم يتم قبول وصفتك الطبية') || msg.includes('لم تستجب أي صيدلية لوصفتك')) {
    const prescriptionId = msg.match(/\[prescription_id:([^\]]+)\]/)?.[1] || '';
    return { id: n.id, type: 'prescription' as any, drug: 'وصفة طبية — لم يتم القبول', pharmacy: '—', prescriptionId, qty: 1, price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'rejected', rawMessage: msg };
  }

  // Auto-rejected notification
  if (msg.includes('رُفض طلبك تلقائياً')) {
    const drug     = msg.match(/الدواء:\s*(.+)/)?.[1]?.trim()    || '—';
    const pharmacy = n.sender_name || '—';
    return { id: n.id, type: 'rejected', drug, pharmacy, qty: 0, price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'rejected', rawMessage: msg };
  }

  // Pharmacy confirmed
  if (msg.includes('تم تأكيد طلبك')) {
    const drug     = msg.match(/الدواء "([^"]+)"/)?.[1]           || '—';
    const pharmacy = n.sender_name || '—';
    return { id: n.id, type: 'confirmation', drug, pharmacy, qty: 0, price: 0, currency: 'IQD', total: 0, date: n.created_at, status: 'confirmed', rawMessage: msg };
  }

  // Receipt — delivered (pickup or home delivery)
  if (msg.includes('إيصال استلام') || msg.includes('تم توصيل طلبك')) {
    const drug     = msg.match(/الدواء:\s*(.+)/)?.[1]?.trim()    || '—';
    const pharmacy = msg.match(/الصيدلية:\s*(.+)/)?.[1]?.trim()  || n.sender_name || '—';
    const qtyStr   = msg.match(/الكمية:\s*(\d+)/)?.[1]           || '1';
    const total    = msg.match(/الإجمالي:\s*([\d,]+)/)?.[1]?.replace(/,/g, '') || '0';
    const currency = msg.match(/الإجمالي:.*?(IQD|USD)/)?.[1]     || 'IQD';
    return { id: n.id, type: 'receipt', drug, pharmacy, qty: Number(qtyStr), price: 0, currency, total: Number(total), date: n.created_at, status: 'delivered', rawMessage: msg };
  }

  return null;
}

const STATUS_STYLE = {
  pending:   { label: 'قيد الانتظار',       color: 'bg-amber-100 text-amber-700', icon: Clock        },
  confirmed: { label: 'تم التأكيد',         color: 'bg-blue-100 text-blue-700',   icon: CheckCircle  },
  delivered: { label: 'تم التسليم',         color: 'bg-green-100 text-green-700', icon: CheckCircle  },
  rejected:  { label: 'مرفوض تلقائياً',    color: 'bg-red-100 text-red-600',     icon: XCircle      },
};

export default function OrdersPage() {
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem('mediflow-auth');
      if (!stored) { setLoading(false); return; }
      const { state } = JSON.parse(stored);
      const patientId = state?.user?.id;
      if (!patientId) { setLoading(false); return; }

      const notifsRes = await fetch(`${PHARMACY_API}/portal-notifications?portalType=patient&recipientId=${patientId}`).then(r => r.json());
      const cancelled = new Set(JSON.parse(localStorage.getItem(CANCELLED_KEY) || '[]'));
      const parsed = (notifsRes.data || []).map(parseNotif).filter(Boolean).filter((o: any) => !cancelled.has(o.id)) as Order[];

      // One card per order: group notifications into order cycles, show only the latest status
      const sorted = [...parsed].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const shown = new Set<string>();
      const result: Order[] = [];

      // Drug orders: each reservation starts a cycle; find the latest update within 24h
      for (const res of sorted.filter(o => o.type === 'reservation')) {
        if (shown.has(res.id)) continue;
        const resTime = new Date(res.date).getTime();
        const cycle = sorted.filter(o =>
          o.drug === res.drug &&
          new Date(o.date).getTime() >= resTime &&
          new Date(o.date).getTime() <= resTime + 24 * 3600 * 1000
        );
        const latest = { ...cycle[cycle.length - 1], submittedAt: res.date };
        cycle.forEach(o => shown.add(o.id));
        result.push(latest);
      }

      // Prescriptions: group by prescriptionId when available, else by submission date (same day = same order)
      const rxGroups = new Map<string, Order[]>();
      for (const o of sorted.filter(o => o.type === 'prescription')) {
        const key = o.prescriptionId || new Date(o.date).toISOString().slice(0, 10);
        if (!rxGroups.has(key)) rxGroups.set(key, []);
        rxGroups.get(key)!.push(o);
      }
      for (const group of Array.from(rxGroups.values())) {
        const first  = group[0];
        const latest = { ...group[group.length - 1], submittedAt: first.date };
        group.forEach(o => shown.add(o.id));
        result.push(latest);
      }

      // Any orphan updates not linked to a reservation (e.g. delivery receipt without a known reservation)
      for (const o of sorted) {
        if (!shown.has(o.id)) result.push(o);
      }

      setOrders(result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const handleCancel = async (order: Order) => {
    setCancelling(order.id);
    try {
      const stored = localStorage.getItem('mediflow-auth');
      const patientName = stored ? JSON.parse(stored)?.state?.user?.name || 'المريض' : 'المريض';

      // Notify pharmacy so they know the patient cancelled
      if (order.pharmacyOwnerId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: patientH(),
          body: JSON.stringify({
            portalType: 'pharmacy',
            recipientId: order.pharmacyOwnerId,
            senderName: patientName,
            message: `❌ إلغاء طلب\nالمريض "${patientName}" ألغى طلب حجز الدواء: ${order.drug}`,
          }),
        });
      }

      // Save cancelled ID locally and remove from view
      const cancelled: Set<string> = new Set(JSON.parse(localStorage.getItem(CANCELLED_KEY) || '[]'));
      cancelled.add(order.id);
      localStorage.setItem(CANCELLED_KEY, JSON.stringify(Array.from(cancelled)));
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch {}
    setCancelling(null);
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-sky-500 px-4 py-6 pt-12">
        <div className="flex items-center justify-between">
          <button onClick={load} disabled={loading} className="text-white/80 hover:text-white">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <h1 className="text-xl font-bold text-white">طلباتي</h1>
        </div>
      </div>

      <div className="px-4 py-5 space-y-3">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-28" />)
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">لا توجد طلبات بعد</p>
            <p className="text-sm text-gray-400 mt-1">ابحث عن دواء وابدأ طلبك الأول</p>
            <Link href="/search"
              className="mt-4 inline-flex items-center gap-2 bg-sky-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors">
              <ShoppingCart className="w-4 h-4" /> ابحث عن دواء
            </Link>
          </div>
        ) : orders.map((order) => {
          const st   = STATUS_STYLE[order.status];
          const Icon = st.icon;
          return (
            <div key={order.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden border-r-4 ${order.status === 'delivered' ? 'border-green-400' : order.status === 'confirmed' ? 'border-blue-400' : order.status === 'rejected' ? 'border-red-400' : 'border-amber-400'}`}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 ${st.color}`}>
                    <Icon className="w-3.5 h-3.5" /> {st.label}
                  </span>
                  <div className="text-xs text-gray-400 text-left space-y-0.5">
                    {order.submittedAt && order.submittedAt !== order.date && (
                      <div className="flex items-center gap-1 justify-end">
                        <span>{new Date(order.submittedAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-green-500">✓</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 justify-end">
                      <span>{new Date(order.date).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={
                        order.status === 'pending'   ? 'text-amber-400' :
                        order.status === 'rejected'  ? 'text-red-500'   : 'text-green-500'
                      }>
                        {order.status === 'pending' ? '◉' : order.status === 'rejected' ? '✕' : '✓'}
                      </span>
                    </div>
                    <div>{new Date(order.submittedAt || order.date).toLocaleDateString('ar-IQ')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${order.status === 'rejected' ? 'bg-red-50' : 'bg-sky-50'}`}>{order.type === 'prescription' ? '📋' : '💊'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{order.drug}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{order.pharmacy}</p>
                  </div>
                  <div className="text-left shrink-0">
                    {order.qty > 0 && <p className="text-xs text-gray-500">{order.qty} قطعة</p>}
                    {order.total > 0 && <p className="font-bold text-sky-600 text-sm">{order.total.toLocaleString('ar-IQ')} {order.currency}</p>}
                  </div>
                </div>
                {order.status === 'pending' && order.type !== 'prescription' && (
                  <button onClick={() => handleCancel(order)} disabled={cancelling === order.id}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors border border-red-200 disabled:opacity-50">
                    <XCircle className="w-4 h-4" />
                    {cancelling === order.id ? 'جاري الإلغاء...' : 'إلغاء الطلب'}
                  </button>
                )}
                {order.status === 'rejected' && (
                  <Link href="/search"
                    className="mt-3 flex items-center justify-center gap-2 py-2 bg-sky-50 hover:bg-sky-100 text-sky-600 rounded-xl text-sm font-medium transition-colors border border-sky-200">
                    <ShoppingCart className="w-4 h-4" /> ابحث عن صيدلية أخرى
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
