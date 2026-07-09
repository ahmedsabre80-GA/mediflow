'use client';
import { useEffect, useState } from 'react';
import { ShoppingBag, DollarSign, TrendingUp, Star, CheckCircle, AlertTriangle, Clock, PackageCheck, X, Truck } from 'lucide-react';
import Link from 'next/link';

const PHARMACY_API    = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const DELIVERED_KEY   = 'pharmacy-delivered-notifs';
const CONFIRMED_KEY   = 'ph-confirmed-notifs';
const REJECTED_KEY    = 'ph-rejected-notifs';
const BAT_KEY         = 'pharmacy-stock-batches';
const EXPIRY_WARN_KEY = 'pharmacy-expiry-warn-days';

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(s))); } catch {}
}

function parseNotif(msg: string, id: string, createdAt: string, deliveredIds: Set<string>, confirmedIds: Set<string>, rejectedIds: Set<string>) {
  if (!msg.includes('طلب حجز جديد')) return null;
  const drug      = msg.match(/الدواء:\s*([^\n\[]+)/)?.[1]?.trim()        || '';
  const patient   = msg.match(/المريض:\s*([^\n\[]+)/)?.[1]?.trim()        || '';
  const qtyStr    = msg.match(/الكمية المطلوبة:\s*(\d+)/)?.[1]            || '1';
  const price     = msg.match(/\[price:([^\]]*)\]/)?.[1]                   || '0';
  const patientId = msg.match(/\[patient_id:([^\]]+)\]/)?.[1]              || '';
  const drugId    = msg.match(/\[drug_id:([^\]]+)\]/)?.[1]                 || '';
  const delivery  = msg.match(/\[delivery:([^\]]+)\]/)?.[1]                || '';
  return {
    id, drug, patient, patientId, drugId, delivery,
    qty: Number(qtyStr), price: Number(price) || 0,
    createdAt: new Date(createdAt),
    delivered: deliveredIds.has(id),
    confirmed: confirmedIds.has(id),
    rejected:  rejectedIds.has(id),
  };
}

function pharmH(): Record<string, string> {
  try {
    const t = localStorage.getItem('pharmacy-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  } catch { return { 'Content-Type': 'application/json' }; }
}

export default function DashboardPage() {
  const [orders,       setOrders]       = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [pharmacyName, setPharmacyName] = useState('');
  const [expiredDrugs,    setExpiredDrugs]    = useState<string[]>([]);
  const [soonExpireDrugs, setSoonExpireDrugs] = useState<{ name: string; days: number }[]>([]);
  const [acting, setActing] = useState<string | null>(null);

  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [rejectedIds,  setRejectedIds]  = useState<Set<string>>(new Set());
  const [deliveredIds, setDeliveredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const name = localStorage.getItem('pharmacy-name') || '';
    setPharmacyName(name);

    const now = Date.now();
    const warnDays = Number(localStorage.getItem(EXPIRY_WARN_KEY)) || 30;
    const expiredSet = new Set<string>();
    const soonMap = new Map<string, number>();

    const applyExpiry = (n: string, expiryStr: string) => {
      if (!n || !expiryStr) return;
      const days = Math.ceil((new Date(expiryStr).getTime() - now) / 86400000);
      if (days <= 0) { expiredSet.add(n); }
      else if (days <= warnDays) {
        const existing = soonMap.get(n);
        if (existing === undefined || days < existing) soonMap.set(n, days);
      }
    };

    try {
      const batches: any[] = JSON.parse(localStorage.getItem(BAT_KEY) || '[]');
      batches.filter(b => (b.qtyRemaining ?? 0) > 0 && b.expiry).forEach(b => applyExpiry(b.drugName, b.expiry));
    } catch {}

    const flush = () => {
      setExpiredDrugs(Array.from(expiredSet));
      setSoonExpireDrugs(Array.from(soonMap.entries()).map(([n, days]) => ({ name: n, days })).sort((a, b) => a.days - b.days));
    };
    flush();

    const token      = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id') || '';
    if (pharmacyId && token) {
      fetch(`${PHARMACY_API}/${pharmacyId}/inventory?limit=200`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          (d.data || []).forEach((item: any) => {
            const n = item.generic_name || item.drug_name || item.name || '';
            const expiry = item.expiry_date || item.expiryDate || '';
            if (n && expiry && (item.quantity ?? item.total_qty ?? 0) > 0) applyExpiry(n, expiry);
          });
          flush();
        }).catch(() => {});
    }

    const dlv = loadSet(DELIVERED_KEY);
    const cnf = loadSet(CONFIRMED_KEY);
    const rej = loadSet(REJECTED_KEY);
    setDeliveredIds(dlv);
    setConfirmedIds(cnf);
    setRejectedIds(rej);

    const ownerId = localStorage.getItem('pharmacy-user-id') || '';
    if (!ownerId) { setLoading(false); return; }

    fetch(`${PHARMACY_API}/portal-notifications?portalType=pharmacy&recipientId=${ownerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        const parsed = (d.data || [])
          .map((n: any) => parseNotif(n.message, n.id, n.created_at, dlv, cnf, rej))
          .filter(Boolean);
        setOrders(parsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async (o: any) => {
    setActing(o.id);
    try {
      const name = localStorage.getItem('pharmacy-name') || 'الصيدلية';
      if (o.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST', headers: pharmH(),
          body: JSON.stringify({ portalType: 'patient', recipientId: o.patientId, senderName: name,
            message: `✅ تم تأكيد طلبك!\nالدواء "${o.drug}" جاهز للاستلام من صيدلية ${name}.` }),
        });
      }
      const next = new Set(Array.from(confirmedIds).concat(o.id));
      setConfirmedIds(next); saveSet(CONFIRMED_KEY, next);
      setOrders(prev => prev.map(x => x.id === o.id ? { ...x, confirmed: true } : x));
    } catch {}
    setActing(null);
  };

  const handleReject = async (o: any) => {
    setActing(o.id);
    try {
      const name = localStorage.getItem('pharmacy-name') || 'الصيدلية';
      if (o.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST', headers: pharmH(),
          body: JSON.stringify({ portalType: 'patient', recipientId: o.patientId, senderName: name,
            message: `❌ رُفض طلبك\nالدواء: ${o.drug}\nرفضت صيدلية ${name} طلبك.\nنقترح البحث عن صيدلية أخرى.` }),
        });
      }
      const next = new Set(Array.from(rejectedIds).concat(o.id));
      setRejectedIds(next); saveSet(REJECTED_KEY, next);
      setOrders(prev => prev.map(x => x.id === o.id ? { ...x, rejected: true } : x));
    } catch {}
    setActing(null);
  };

  const handleDeliver = async (o: any) => {
    setActing(o.id);
    try {
      const name       = localStorage.getItem('pharmacy-name') || 'الصيدلية';
      const token      = localStorage.getItem('pharmacy-token');
      const pharmacyId = localStorage.getItem('pharmacy-id') || '';
      const now        = new Date().toLocaleString('ar-IQ');

      if (pharmacyId && o.drugId) {
        fetch(`${PHARMACY_API}/${pharmacyId}/inventory/decrement`, {
          method: 'POST', headers: pharmH(),
          body: JSON.stringify({ drugId: o.drugId, quantity: o.qty }),
        }).catch(() => {});
      }

      if (o.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST', headers: pharmH(),
          body: JSON.stringify({ portalType: 'patient', recipientId: o.patientId, senderName: name,
            message: `📦 ${o.delivery === 'delivery' ? 'تم توصيل طلبك' : 'تم تسليم طلبك'}\n━━━━━━━━━━━━━━━\nالدواء: ${o.drug}\nالصيدلية: ${name}\nالتاريخ: ${now}\n━━━━━━━━━━━━━━━\nشكراً لاستخدامك ميديفلو 💙` }),
        });
      }

      const cnfNext = new Set(Array.from(confirmedIds).concat(o.id));
      setConfirmedIds(cnfNext); saveSet(CONFIRMED_KEY, cnfNext);
      const dlvNext = new Set(Array.from(deliveredIds).concat(o.id));
      setDeliveredIds(dlvNext); saveSet(DELIVERED_KEY, dlvNext);
      setOrders(prev => prev.map(x => x.id === o.id ? { ...x, confirmed: true, delivered: true } : x));
    } catch {}
    setActing(null);
  };

  const nowDate    = new Date();
  const todayStr   = nowDate.toDateString();
  const thisMonth  = nowDate.getMonth();
  const thisYear   = nowDate.getFullYear();

  const todayOrders  = orders.filter(o => o.createdAt.toDateString() === todayStr);
  const monthOrders  = orders.filter(o => o.createdAt.getMonth() === thisMonth && o.createdAt.getFullYear() === thisYear);
  const deliveredAll = orders.filter(o => o.delivered);
  const revenue      = (list: any[]) => list.filter(o => o.delivered).reduce((s, o) => s + o.price * o.qty, 0);

  const orderTimeoutMin  = Number(localStorage.getItem('mediflow-order-timeout-min')   || 10);
  const deliveryTimeoutH = Number(localStorage.getItem('mediflow-delivery-timeout-h')  || 24);
  const pendingOrders = orders.filter(o => {
    if (o.delivered || o.rejected) return false;
    const ageMin = (Date.now() - o.createdAt.getTime()) / 60000;
    const ageH   = ageMin / 60;
    if (!o.confirmed && ageMin >= orderTimeoutMin * 3) return false; // expired unconfirmed
    if (o.confirmed && ageH >= deliveryTimeoutH) return false;       // delivery timed out
    return true;
  });

  const stats = [
    { label: 'طلبات اليوم',  value: loading ? '...' : String(todayOrders.length),                            icon: ShoppingBag, color: 'bg-sky-500'    },
    { label: 'إيراد اليوم',  value: loading ? '...' : `${revenue(todayOrders).toLocaleString('ar-IQ')} د.ع`, icon: DollarSign,  color: 'bg-green-500'  },
    { label: 'طلبات الشهر',  value: loading ? '...' : String(monthOrders.length),                            icon: TrendingUp,  color: 'bg-purple-500' },
    { label: 'إيراد الشهر',  value: loading ? '...' : `${revenue(monthOrders).toLocaleString('ar-IQ')} د.ع`, icon: Star,        color: 'bg-amber-500'  },
    { label: 'تم تسليمها',   value: loading ? '...' : String(deliveredAll.length),                           icon: CheckCircle, color: 'bg-teal-500'   },
  ];

  return (
    <div className="space-y-6 overflow-auto">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          مرحباً{pharmacyName ? ` — ${pharmacyName}` : ''} 👋
        </h2>
        <p className="text-gray-500 text-sm">هذا ملخص أداء صيدليتك اليوم</p>
      </div>

      {/* ── Pending orders ── */}
      {!loading && pendingOrders.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
          <div className="bg-amber-50 px-5 py-3 flex items-center gap-2 border-b border-amber-100">
            <PackageCheck className="w-5 h-5 text-amber-600" />
            <p className="font-bold text-amber-800 text-sm">طلبات تحتاج إجراء ({pendingOrders.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingOrders.map(o => {
              const isActing = acting === o.id;
              return (
                <div key={o.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.confirmed ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {o.confirmed ? 'مؤكد' : 'معلق'}
                      </span>
                      <p className="text-sm font-semibold text-gray-900">{o.drug || 'دواء'}</p>
                      {o.delivery === 'delivery' && <Truck className="w-3.5 h-3.5 text-sky-500" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {o.patient && <span>{o.patient} · </span>}
                      {o.qty} قطعة · {Number(o.price * o.qty).toLocaleString('ar-IQ')} د.ع
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {!o.confirmed && (
                      <button onClick={() => handleConfirm(o)} disabled={isActing}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50">
                        {isActing ? '...' : 'تأكيد'}
                      </button>
                    )}
                    <button onClick={() => handleDeliver(o)} disabled={isActing}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500 hover:bg-green-600 text-white disabled:opacity-50">
                      {isActing ? '...' : o.delivery === 'delivery' ? 'تم التوصيل' : 'تم التسليم'}
                    </button>
                    <button onClick={() => handleReject(o)} disabled={isActing}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Expiry alerts ── */}
      {expiredDrugs.length > 0 && (
        <Link href="/dashboard/inventory?filter=expired" className="block">
          <div className="rounded-2xl border-2 border-red-400 bg-red-50 px-5 py-4 flex items-start gap-4 animate-pulse cursor-pointer hover:bg-red-100 transition-colors">
            <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-700 text-sm">⚠️ أدوية منتهية الصلاحية ({expiredDrugs.length})</p>
              <p className="text-xs text-red-600 mt-1 leading-relaxed line-clamp-2">{expiredDrugs.join(' • ')}</p>
            </div>
            <span className="text-xs text-red-500 font-medium shrink-0 bg-red-100 px-2 py-1 rounded-lg">عرض المنتهية ←</span>
          </div>
        </Link>
      )}

      {soonExpireDrugs.length > 0 && (
        <Link href="/dashboard/inventory?filter=expiring" className="block">
          <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 flex items-start gap-4 animate-pulse cursor-pointer hover:bg-amber-100 transition-colors">
            <Clock className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-700 text-sm">🕐 أدوية تقترب من انتهاء الصلاحية ({soonExpireDrugs.length})</p>
              <p className="text-xs text-amber-600 mt-1 leading-relaxed line-clamp-2">
                {soonExpireDrugs.map(d => `${d.name} (${d.days} يوم)`).join(' • ')}
              </p>
            </div>
            <span className="text-xs text-amber-500 font-medium shrink-0 bg-amber-100 px-2 py-1 rounded-lg">عرض القريبة ←</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إضافة منتج',    icon: '➕', href: '/dashboard/inventory' },
          { label: 'عرض الطلبات',   icon: '📦', href: '/dashboard/orders'    },
          { label: 'تقرير الإيراد', icon: '📊', href: '/dashboard/analytics' },
          { label: 'إدارة الحملات', icon: '📣', href: '/dashboard/campaigns' },
        ].map((action) => (
          <a key={action.label} href={action.href}
            className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-center">
            <div className="text-3xl mb-2">{action.icon}</div>
            <p className="text-sm font-medium text-gray-700">{action.label}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
