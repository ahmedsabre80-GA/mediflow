'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ShoppingCart, CheckCircle, XCircle, Clock, Truck, Search, RefreshCw,
  Eye, Gift, Plus, X, AlertTriangle, Send, MessageSquare,
} from 'lucide-react';
import { fetchNotifications, authHeaders } from '@/lib/portalNotifications';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1';

interface OrderItem { id: string; name: string; quantity: number; unit_price: number; is_gift?: boolean; }
interface Order {
  id: string; warehouse_id: string; pharmacy_id: string; pharmacy_name: string;
  items: OrderItem[]; total: number;
  status: 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';
  created_at: string; notes?: string;
}

// Pharmacy feedback parsed from notifications
interface PharmacyFeedback {
  content: string;         // full message after [oid:xxx]
  hasIssues: boolean;      // has ⚠️ or ❌
  allAccepted: boolean;    // only ✅
  isRejectedAll: boolean;  // رفض الطلب بالكامل
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: 'قيد الانتظار', color: 'bg-amber-100 text-amber-700',   icon: Clock },
  confirmed:  { label: 'مؤكد',         color: 'bg-blue-100 text-blue-700',     icon: CheckCircle },
  dispatched: { label: 'تم الإرسال',   color: 'bg-indigo-100 text-indigo-700', icon: Truck },
  delivered:  { label: 'تم التسليم',   color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  cancelled:  { label: 'ملغي',         color: 'bg-red-100 text-red-700',       icon: XCircle },
};

// Must be outside the page component — inner component definitions cause React remount loops
function FeedbackBadge({ order, feedback }: { order: Order; feedback: Record<string, PharmacyFeedback> }) {
  if (order.status !== 'delivered') return null;
  const fb = feedback[order.id];
  if (!fb) return (
    <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> في انتظار رد الصيدلية
    </span>
  );
  if (fb.allAccepted) return (
    <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
      <CheckCircle className="w-3 h-3" /> قبلت الصيدلية الكل
    </span>
  );
  if (fb.isRejectedAll) return (
    <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
      <XCircle className="w-3 h-3" /> رفضت الصيدلية الطلب كاملاً
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
      <AlertTriangle className="w-3 h-3" /> مشاكل في الاستلام
    </span>
  );
}

function buildResendMsg(feedback: PharmacyFeedback, order: Order): string {
  const lines: string[] = [
    `نشكركم على تعاملكم مع مستودعنا.`,
    `بخصوص الطلب رقم ${order.id.slice(0,8)}:`,
    '',
  ];
  if (feedback.isRejectedAll) {
    lines.push('تم استلام ملاحظتكم بشأن الرفض الكامل للطلب.');
    lines.push('سنقوم بمعالجة الطلب وإرسال بديل مناسب في أقرب وقت ممكن.');
  } else {
    if (feedback.content.includes('⚠️')) {
      lines.push('تم استلام ملاحظتكم بشأن الكميات الناقصة.');
      lines.push('سنقوم بإرسال الكميات المتبقية في أقرب وقت ممكن.');
    }
    if (feedback.content.includes('❌')) {
      lines.push('تم استلام ملاحظتكم بشأن الأصناف التالفة/المرفوضة.');
      lines.push('سنقوم باستبدال هذه الأصناف وإعادة إرسالها في أقرب وقت ممكن.');
    }
  }
  lines.push('');
  lines.push('يرجى مراجعة صفحة "طلباتي" في بوابة المستودعات والضغط على "إعادة التحديد" لتأكيد الاستلام الجديد.');
  lines.push('شكراً لثقتكم بنا 🏭');
  return lines.join('\n');
}

function WarehouseOrdersPage() {
  const searchParams = useSearchParams();
  // Track the full search string last used to auto-open so repeat clicks re-open the modal
  const lastAutoOpenRef = useRef<string | null>(null);

  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected]     = useState<Order | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [error, setError]           = useState('');

  // Pharmacy feedback (parsed from notifications)
  const [feedback, setFeedback]     = useState<Record<string, PharmacyFeedback>>({});
  const [feedbackModal, setFeedbackModal] = useState<{ order: Order; fb: PharmacyFeedback } | null>(null);
  const [resendModal, setResendModal]     = useState<{ order: Order; fb: PharmacyFeedback } | null>(null);
  const [resendMsg, setResendMsg]   = useState('');
  const [sending, setSending]       = useState(false);
  // Track orders where warehouse already sent a resend response (locked until pharmacy replies again)
  const [resentOrders, setResentOrders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('warehouse-resent-orders') || '[]')); } catch { return new Set(); }
  });

  // Auto-open feedback modal when navigated from notification; _t param makes each click unique
  useEffect(() => {
    const targetId = searchParams.get('feedback');
    if (!targetId) return;
    const currentSearch = searchParams.toString();
    if (lastAutoOpenRef.current === currentSearch) return;
    const order = orders.find(o => o.id === targetId);
    const fb = feedback[targetId];
    if (order && fb) {
      lastAutoOpenRef.current = currentSearch;
      setFeedbackModal({ order, fb });
    }
  }, [searchParams, orders, feedback]);

  // Gift items
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftOrderId, setGiftOrderId]     = useState<string | null>(null);
  const [giftItems, setGiftItems]         = useState<{ name: string; quantity: string }[]>([{ name: '', quantity: '' }]);
  const [giftSaving, setGiftSaving]       = useState(false);

  const getWarehouse = useCallback(async () => {
    const liveToken = localStorage.getItem('warehouse-token') || '';
    if (!liveToken) return null;
    const res = await fetch(`${API}/warehouses/me`, { headers: { Authorization: `Bearer ${liveToken}` } });
    if (!res.ok) return null;
    return (await res.json()).data?.id ?? null;
  }, []);

  const loadOrders = useCallback(async (whId: string) => {
    const liveToken = localStorage.getItem('warehouse-token') || '';
    if (!liveToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/warehouses/${whId}/b2b-orders`, { headers: { Authorization: `Bearer ${liveToken}` } });
      if (!res.ok) throw new Error('فشل تحميل الطلبات');
      setOrders((await res.json()).data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  // Parse pharmacy feedback from warehouse notifications
  const loadFeedback = useCallback(async () => {
    const userId = localStorage.getItem('warehouse-user-id') || '';
    if (!userId) return;
    const liveToken = localStorage.getItem('warehouse-token') || '';
    if (!liveToken) return;
    const notifs = await fetchNotifications(userId);
    console.log('[loadFeedback] notifications count:', notifs.length, notifs.map((n: any) => n.message.slice(0,80)));
    const map: Record<string, PharmacyFeedback> = {};
    for (const n of notifs) {
      const msg = n.message;

      // Strategy 1: find [oid:UUID] anywhere in the message (may be preceded by [PHREPORT])
      let orderId = '';
      let rawContent = '';
      const oidMatch = msg.match(/\[oid:([0-9a-f-]{36})\]/i);
      if (oidMatch) {
        orderId = oidMatch[1];
        // Grab everything after the [oid:UUID] tag as the summary content
        const afterTag = msg.slice(msg.indexOf(oidMatch[0]) + oidMatch[0].length).trim();
        rawContent = afterTag;
      }

      // Strategy 2: backend return-report notifications use "الطلبية: UUID" (no [PHREPORT] prefix)
      if (!orderId) {
        const orderLineMatch = msg.match(/الطلبية:\s*([0-9a-f\-]{36})/i);
        if (orderLineMatch) {
          orderId = orderLineMatch[1];
          rawContent = msg.split('\n').filter((l: string) =>
            l.startsWith('✅') || l.startsWith('⚠️') || l.startsWith('❌') ||
            l.startsWith('📷') || l.startsWith('📦') || l.startsWith('🔢') ||
            l.includes('رفض الطلب')
          ).join('\n');
        }
      }

      if (!orderId) continue;
      const content = rawContent.trim();
      const hasIssues     = content.includes('⚠️') || content.includes('❌');
      const allAccepted   = content.includes('✅') && !hasIssues;
      const isRejectedAll = content.includes('رفض الطلب بالكامل');
      if (!map[orderId]) map[orderId] = { content, hasIssues, allAccepted, isRejectedAll };
    }
    setFeedback(map);
    // Unlock any resent orders that now have new pharmacy feedback
    setResentOrders(prev => {
      const updated = new Set(Array.from(prev).filter(id => !map[id]));
      if (updated.size !== prev.size) {
        try { localStorage.setItem('warehouse-resent-orders', JSON.stringify(Array.from(updated))); } catch {}
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    getWarehouse().then(id => {
      if (id) { setWarehouseId(id); loadOrders(id); }
      else { setLoading(false); setError('تعذر تحميل بيانات المستودع'); }
    });
    loadFeedback();
    // Poll feedback every 30 s so new pharmacy responses appear without manual refresh
    const iv = setInterval(loadFeedback, 30000);
    return () => clearInterval(iv);
  }, [getWarehouse, loadOrders, loadFeedback]);

  const updateStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const liveToken = localStorage.getItem('warehouse-token') || '';
      const res = await fetch(`${API}/warehouses/b2b-orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${liveToken}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('فشل تحديث الحالة');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if (selected?.id === orderId) setSelected(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (e: any) { setError(e.message); }
  };

  const openResend = (order: Order, fb: PharmacyFeedback) => {
    setResendModal({ order, fb });
    setResendMsg(buildResendMsg(fb, order));
  };

  const sendResend = async () => {
    if (!resendModal) return;
    setSending(true);
    try {
      const whName = localStorage.getItem('warehouse-name') || 'المستودع';
      await fetch(`${API}/pharmacies/portal-notifications`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          portalType:  'pharmacy',
          recipientId: resendModal.order.pharmacy_id,
          senderName:  `🏭 ${whName}`,
          message: `[oid:${resendModal.order.id}][RESENT]\n${resendMsg.trim()}`,
        }),
      });
      // Lock this order — show "waiting for pharmacy" until new feedback arrives
      const orderId = resendModal.order.id;
      setResentOrders(prev => {
        const next = new Set(Array.from(prev));
        next.add(orderId);
        try { localStorage.setItem('warehouse-resent-orders', JSON.stringify(Array.from(next))); } catch {}
        return next;
      });
      setResendModal(null);
    } catch { alert('تعذر الإرسال، حاول مرة أخرى'); }
    finally { setSending(false); }
  };

  const openGiftModal = (orderId: string) => { setGiftOrderId(orderId); setGiftItems([{ name: '', quantity: '' }]); setShowGiftModal(true); };
  const saveGiftItems = async () => {
    if (!giftOrderId) return;
    setGiftSaving(true);
    try {
      const items = giftItems.filter(i => i.name.trim() && Number(i.quantity) > 0).map(i => ({ name: i.name.trim(), quantity: Number(i.quantity) }));
      if (!items.length) return;
      const liveToken = localStorage.getItem('warehouse-token') || '';
      const r = await fetch(`${API}/warehouses/b2b-orders/${giftOrderId}/gift-items`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${liveToken}` }, body: JSON.stringify({ items }) });
      if (!r.ok) throw new Error('فشل إضافة الهدايا');
      setShowGiftModal(false);
    } catch (e: any) { setError(e.message); }
    finally { setGiftSaving(false); }
  };

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.pharmacy_name.includes(search) || o.id.includes(search);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    pending:   orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    dispatched:orders.filter(o => o.status === 'dispatched').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">طلبات B2B</h1>
          <p className="text-sm text-gray-500 mt-0.5">طلبات الصيدليات من المستودع</p>
        </div>
        <button onClick={() => { warehouseId && loadOrders(warehouseId); loadFeedback(); }} disabled={loading}
          className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'قيد الانتظار', value: counts.pending,    color: 'text-amber-600',  bg: 'bg-amber-50' },
          { label: 'مؤكدة',        value: counts.confirmed,  color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'تم الإرسال',   value: counts.dispatched, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'تم التسليم',   value: counts.delivered,  color: 'text-green-600',  bg: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم الصيدلية أو رقم الطلب..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[['all','الكل'],['pending','انتظار'],['confirmed','مؤكد'],['dispatched','مُرسَل'],['delivered','مُسلَّم'],['cancelled','ملغي']].map(([k,l]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === k ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-16 text-gray-400 text-sm">جاري التحميل...</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['رقم الطلب', 'الصيدلية', 'المنتجات', 'الإجمالي', 'الحالة', 'رد الصيدلية', 'التاريخ', 'إجراءات'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">لا توجد طلبات</td></tr>
              ) : filtered.map(order => {
                const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                const Icon = st.icon;
                const fb = feedback[order.id];
                const isAllOk = fb?.allAccepted;
                const isResent = resentOrders.has(order.id);
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 ${isAllOk ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-4"><p className="text-sm font-mono font-medium text-gray-900">{order.id.slice(0,8)}…</p></td>
                    <td className="px-4 py-4"><p className="text-sm font-medium text-gray-900">{order.pharmacy_name}</p></td>
                    <td className="px-4 py-4"><p className="text-sm text-gray-600">{order.items?.length ?? 0} منتج</p></td>
                    <td className="px-4 py-4"><p className="text-sm font-semibold text-gray-900">{Number(order.total).toLocaleString('ar-IQ')} د.ع</p></td>
                    <td className="px-4 py-4">
                      <span className={`flex items-center gap-1.5 w-fit text-xs font-medium px-2.5 py-1 rounded-full ${st.color}`}>
                        <Icon className="w-3.5 h-3.5" />{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <FeedbackBadge order={order} feedback={feedback} />
                    </td>
                    <td className="px-4 py-4"><p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('ar-IQ')}</p></td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => setSelected(order)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="عرض التفاصيل">
                          <Eye className="w-4 h-4" />
                        </button>
                        {/* Pharmacy feedback actions */}
                        {fb && (
                          <button onClick={() => setFeedbackModal({ order, fb })}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="تقرير الصيدلية">
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                        {fb?.hasIssues && (
                          isResent
                            ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1.5 rounded-lg flex items-center gap-1">
                                <Clock className="w-3 h-3" /> في انتظار رد الصيدلية
                              </span>
                            : <button onClick={() => openResend(order, fb)}
                                className="text-xs bg-indigo-500 text-white px-2 py-1.5 rounded-lg hover:bg-indigo-600 flex items-center gap-1">
                                <Send className="w-3 h-3" /> إعادة إرسال
                              </button>
                        )}
                        {order.status === 'pending' && (
                          <>
                            <button onClick={() => updateStatus(order.id, 'confirmed')} className="text-xs bg-blue-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-600">تأكيد</button>
                            <button onClick={() => updateStatus(order.id, 'cancelled')} className="text-xs bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-200">رفض</button>
                          </>
                        )}
                        {order.status === 'confirmed' && (
                          <>
                            <button onClick={() => updateStatus(order.id, 'dispatched')} className="text-xs bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-600">إرسال</button>
                            <button onClick={() => openGiftModal(order.id)} className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-200 flex items-center gap-1"><Gift className="w-3 h-3" />هدية</button>
                          </>
                        )}
                        {order.status === 'dispatched' && (
                          <button onClick={() => updateStatus(order.id, 'delivered')} className="text-xs bg-green-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-600">تسليم</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">تفاصيل الطلب</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CONFIG[selected.status]?.color}`}>
                  {STATUS_CONFIG[selected.status]?.label}
                </span>
                <p className="text-sm text-gray-500">{new Date(selected.created_at).toLocaleString('ar-IQ')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-1">الصيدلية</p>
                <p className="text-gray-900 font-medium">{selected.pharmacy_name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">المنتجات المطلوبة</p>
                <div className="space-y-2">
                  {(selected.items || []).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-medium text-gray-600">
                        {item.is_gift ? <span className="text-amber-600 ml-1">🎁</span> : null}
                        {item.quantity.toLocaleString()} × {item.is_gift ? 'هدية مجانية' : `${Number(item.unit_price).toLocaleString()} د.ع`}
                      </span>
                      <span className="text-gray-900">{item.name}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-3 pt-3 flex justify-between font-bold text-gray-900">
                  <span>{Number(selected.total).toLocaleString('ar-IQ')} د.ع</span>
                  <span>الإجمالي</span>
                </div>
              </div>

              {/* Pharmacy feedback in detail modal */}
              {feedback[selected.id] && (
                <div className={`rounded-xl p-4 border ${feedback[selected.id].allAccepted ? 'bg-emerald-50 border-emerald-200' : feedback[selected.id].isRejectedAll ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <p className="text-sm font-bold mb-2">
                    {feedback[selected.id].allAccepted ? '✅ تقرير الصيدلية — قبول كامل' :
                     feedback[selected.id].isRejectedAll ? '❌ تقرير الصيدلية — رفض كامل' :
                     '⚠️ تقرير الصيدلية — مشاكل في الاستلام'}
                  </p>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{feedback[selected.id].content}</pre>
                  {feedback[selected.id].hasIssues && (
                    <button onClick={() => { openResend(selected, feedback[selected.id]); setSelected(null); }}
                      className="mt-3 w-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2">
                      <Send className="w-4 h-4" /> إعادة إرسال وإشعار الصيدلية
                    </button>
                  )}
                </div>
              )}

              {selected.notes && <div className="bg-amber-50 rounded-xl p-4"><p className="text-sm text-amber-800">{selected.notes}</p></div>}

              <div className="flex gap-3 pt-2">
                {selected.status === 'pending' && (
                  <>
                    <button onClick={() => { updateStatus(selected.id, 'confirmed'); setSelected(null); }} className="flex-1 bg-blue-500 text-white font-semibold py-3 rounded-xl text-sm hover:bg-blue-600">تأكيد الطلب</button>
                    <button onClick={() => { updateStatus(selected.id, 'cancelled'); setSelected(null); }} className="flex-1 bg-red-100 text-red-600 font-semibold py-3 rounded-xl text-sm hover:bg-red-200">رفض الطلب</button>
                  </>
                )}
                {selected.status === 'confirmed' && (
                  <>
                    <button onClick={() => { updateStatus(selected.id, 'dispatched'); setSelected(null); }} className="flex-1 bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm hover:bg-indigo-600">إرسال الشحنة</button>
                    <button onClick={() => { openGiftModal(selected.id); setSelected(null); }} className="flex-1 bg-amber-100 text-amber-700 font-semibold py-3 rounded-xl text-sm hover:bg-amber-200 flex items-center justify-center gap-2"><Gift className="w-4 h-4" /> إضافة هدية</button>
                  </>
                )}
                {selected.status === 'dispatched' && (
                  <button onClick={() => { updateStatus(selected.id, 'delivered'); setSelected(null); }} className="flex-1 bg-green-500 text-white font-semibold py-3 rounded-xl text-sm hover:bg-green-600">تأكيد التسليم</button>
                )}
                <button onClick={() => setSelected(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إغلاق</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pharmacy Feedback Modal */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-500" /> تقرير الصيدلية</h2>
              <button onClick={() => setFeedbackModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">الطلب: {feedbackModal.order.id.slice(0,8)} · {feedbackModal.order.pharmacy_name}</p>
              <div className={`rounded-xl p-4 border text-sm ${feedbackModal.fb.allAccepted ? 'bg-emerald-50 border-emerald-200' : feedbackModal.fb.isRejectedAll ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <pre className="whitespace-pre-wrap font-sans text-gray-800">{feedbackModal.fb.content}</pre>
              </div>
              {feedbackModal.fb.hasIssues && (
                <button onClick={() => { openResend(feedbackModal.order, feedbackModal.fb); setFeedbackModal(null); }}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" /> إعادة إرسال وإشعار الصيدلية
                </button>
              )}
              <button onClick={() => setFeedbackModal(null)} className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Resend Modal */}
      {resendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Send className="w-5 h-5 text-indigo-500" /> إعادة إرسال للصيدلية</h2>
              <button onClick={() => setResendModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Issues summary */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p className="font-bold mb-1">المشاكل المُبلَّغ عنها:</p>
                <pre className="whitespace-pre-wrap font-sans">{resendModal.fb.content}</pre>
              </div>
              {/* Editable message */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">الرسالة للصيدلية (يمكن تعديلها):</p>
                <textarea
                  value={resendMsg}
                  onChange={e => setResendMsg(e.target.value)}
                  rows={8}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={sendResend} disabled={sending || !resendMsg.trim()}
                  className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  إرسال الإشعار للصيدلية
                </button>
                <button onClick={() => setResendModal(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gift Items Modal */}
      {showGiftModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" dir="rtl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Gift className="w-5 h-5 text-amber-500" /> إضافة أصناف هدية</h2>
              <button onClick={() => setShowGiftModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">هذه الأصناف ستُرسل مجاناً مع الطلب (سعرها صفر)</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {giftItems.map((gi, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={gi.name} onChange={e => setGiftItems(prev => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                      placeholder="اسم الصنف" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    <input type="number" min="1" value={gi.quantity} onChange={e => setGiftItems(prev => prev.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))}
                      placeholder="الكمية" className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 text-center" />
                    {giftItems.length > 1 && (
                      <button onClick={() => setGiftItems(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setGiftItems(prev => [...prev, { name: '', quantity: '' }])}
                className="w-full border border-dashed border-amber-300 text-amber-600 text-sm py-2 rounded-xl hover:bg-amber-50 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> إضافة صنف آخر
              </button>
              <div className="flex gap-3 pt-2">
                <button onClick={saveGiftItems} disabled={giftSaving || giftItems.every(i => !i.name.trim() || !Number(i.quantity))}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                  {giftSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} إرسال الهدايا
                </button>
                <button onClick={() => setShowGiftModal(false)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><WarehouseOrdersPage /></Suspense>;
}
