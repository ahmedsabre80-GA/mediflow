'use client';
import { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, RefreshCw, ShoppingCart, XCircle } from 'lucide-react';
import Link from 'next/link';

const PHARMACY_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const PLATFORM_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/platform';
const AUTO_REJECTED_KEY  = 'mediflow-auto-rejected-orders';
const CANCELLED_KEY      = 'mediflow-cancelled-orders';

// Module-level guard — prevents StrictMode double-effect from firing rejections twice
const inFlightRejections = new Set<string>();

interface Order {
  id: string;
  type: 'reservation' | 'receipt' | 'confirmation' | 'rejected';
  drug: string;
  pharmacy: string;
  pharmacyOwnerId?: string;
  pharmacyId?: string;
  qty: number;
  price: number;
  currency: string;
  total: number;
  date: string;
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

  // Receipt — delivered
  if (msg.includes('إيصال استلام')) {
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

      // Fetch timeout setting and notifications in parallel
      const [configRes, notifsRes] = await Promise.all([
        fetch(`${PLATFORM_API}/config/auto_reject_minutes`).then(r => r.json()).catch(() => ({ data: { value: '10' } })),
        fetch(`${PHARMACY_API}/portal-notifications?portalType=patient&recipientId=${patientId}`).then(r => r.json()),
      ]);

      const timeoutMin = Number(configRes?.data?.value || 10);
      const cancelled = new Set(JSON.parse(localStorage.getItem(CANCELLED_KEY) || '[]'));
      const parsed = (notifsRes.data || []).map(parseNotif).filter(Boolean).filter((o: any) => !cancelled.has(o.id)) as Order[];

      // Deduplicate
      const receiptDrugs  = new Set(parsed.filter(o => o.type === 'receipt').map(o => o.drug));
      const confirmDrugs  = new Set(parsed.filter(o => o.type === 'confirmation').map(o => o.drug));
      const rejectedDrugs = new Set(parsed.filter(o => o.type === 'rejected').map(o => o.drug));
      const deduped = parsed.filter(o => {
        if (o.type === 'reservation' && receiptDrugs.has(o.drug))  return false;
        if (o.type === 'reservation' && rejectedDrugs.has(o.drug)) return false;
        if (o.type === 'confirmation' && receiptDrugs.has(o.drug)) return false;
        if (o.type === 'reservation' && confirmDrugs.has(o.drug))  return false;
        return true;
      });

      // Auto-reject: pending orders older than timeout that haven't been confirmed
      const alreadyRejected: Set<string> = new Set(JSON.parse(localStorage.getItem(AUTO_REJECTED_KEY) || '[]'));
      const now = Date.now();
      for (const order of deduped) {
        if (order.status !== 'pending' || alreadyRejected.has(order.id) || inFlightRejections.has(order.id)) continue;
        const ageMin = (now - new Date(order.date).getTime()) / 60000;
        if (ageMin < timeoutMin) continue;

        // Mark as auto-rejected locally (module-level guard blocks StrictMode double-fire)
        inFlightRejections.add(order.id);
        alreadyRejected.add(order.id);
        order.status = 'rejected';
        order.type   = 'rejected';

        // Notify patient
        fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: patientId,
            senderName: 'ميديفلو',
            message: `❌ رُفض طلبك تلقائياً\nالدواء: ${order.drug}\nلم تستجب الصيدلية خلال ${timeoutMin} دقيقة.\nنقترح البحث عن صيدلية أخرى.`,
          }),
        }).catch(() => {});

        // Drop pharmacy rating (pharmacyId embedded in rawMessage if available)
        const pharmId = order.rawMessage?.match(/\[pharmacy_id:([^\]]+)\]/)?.[1];
        if (pharmId) {
          fetch(`${PHARMACY_API.replace('/pharmacies', '')}/${pharmId}/rating-decrement`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 0.2 }),
          }).catch(() => {});
        }
      }
      localStorage.setItem(AUTO_REJECTED_KEY, JSON.stringify([...alreadyRejected]));

      setOrders(deduped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCancel = async (order: Order) => {
    setCancelling(order.id);
    try {
      const stored = localStorage.getItem('mediflow-auth');
      const patientName = stored ? JSON.parse(stored)?.state?.user?.name || 'المريض' : 'المريض';

      // Notify pharmacy so they know the patient cancelled
      if (order.pharmacyOwnerId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
                  <p className="text-xs text-gray-400">{new Date(order.date).toLocaleDateString('ar-IQ')}</p>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${order.status === 'rejected' ? 'bg-red-50' : 'bg-sky-50'}`}>💊</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{order.drug}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{order.pharmacy}</p>
                  </div>
                  <div className="text-left shrink-0">
                    {order.qty > 0 && <p className="text-xs text-gray-500">{order.qty} قطعة</p>}
                    {order.total > 0 && <p className="font-bold text-sky-600 text-sm">{order.total.toLocaleString('ar-IQ')} {order.currency}</p>}
                  </div>
                </div>
                {order.status === 'pending' && (
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
