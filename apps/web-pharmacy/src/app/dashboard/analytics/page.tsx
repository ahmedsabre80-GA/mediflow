'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, DollarSign, BarChart2, CheckCircle, Clock, Package } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const DELIVERED_KEY = 'pharmacy-delivered-notifs';

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}

function parseNotif(msg: string, id: string, createdAt: string, deliveredIds: Set<string>) {
  if (!msg.includes('طلب حجز جديد')) return null;
  const drug    = msg.match(/الدواء:\s*(.+)/)?.[1]?.trim()       || '';
  const qtyStr  = msg.match(/الكمية المطلوبة:\s*(\d+)/)?.[1]     || '1';
  const price   = msg.match(/\[price:([^\]]*)\]/)?.[1]           || '0';
  return {
    id,
    drug,
    qty: Number(qtyStr),
    price: Number(price) || 0,
    createdAt: new Date(createdAt),
    delivered: deliveredIds.has(id),
  };
}

export default function AnalyticsPage() {
  const [orders,  setOrders]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const deliveredIds = loadSet(DELIVERED_KEY);
    const token   = localStorage.getItem('pharmacy-token');
    const ownerId = localStorage.getItem('pharmacy-user-id') || '';
    if (!ownerId) { setLoading(false); return; }

    fetch(`${PHARMACY_API}/portal-notifications?portalType=pharmacy&recipientId=${ownerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        const parsed = (d.data || [])
          .map((n: any) => parseNotif(n.message, n.id, n.created_at, deliveredIds))
          .filter(Boolean);
        setOrders(parsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now      = new Date();
  const todayStr = now.toDateString();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();

  const todayOrders    = orders.filter(o => o.createdAt.toDateString() === todayStr);
  const monthOrders    = orders.filter(o => o.createdAt.getMonth() === thisMonth && o.createdAt.getFullYear() === thisYear);
  const deliveredAll   = orders.filter(o => o.delivered);
  const deliveredToday = deliveredAll.filter(o => o.createdAt.toDateString() === todayStr);

  const revenue = (list: any[]) => list.filter(o => o.delivered).reduce((s, o) => s + o.price * o.qty, 0);

  const cards = [
    { label: 'طلبات اليوم',    value: todayOrders.length,                                            icon: ShoppingBag, color: 'bg-sky-500'    },
    { label: 'إيراد اليوم',    value: `${revenue(todayOrders).toLocaleString('ar-IQ')} د.ع`,         icon: DollarSign,  color: 'bg-green-500'  },
    { label: 'طلبات الشهر',    value: monthOrders.length,                                            icon: TrendingUp,  color: 'bg-purple-500' },
    { label: 'إيراد الشهر',    value: `${revenue(monthOrders).toLocaleString('ar-IQ')} د.ع`,         icon: BarChart2,   color: 'bg-orange-500' },
    { label: 'إجمالي الطلبات', value: orders.length,                                                 icon: Package,     color: 'bg-indigo-500' },
    { label: 'تم تسليمها',     value: deliveredAll.length,                                           icon: CheckCircle, color: 'bg-teal-500'   },
    { label: 'معدل التسليم',   value: orders.length ? `${Math.round(deliveredAll.length / orders.length * 100)}%` : '—', icon: TrendingUp, color: 'bg-amber-500' },
    { label: 'في الانتظار',    value: orders.filter(o => !o.delivered).length,                       icon: Clock,       color: 'bg-rose-500'   },
  ];

  // Group by day for last 7 days
  const last7: { label: string; total: number; delivered: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    const dayOrders = orders.filter(o => o.createdAt.toDateString() === ds);
    last7.push({
      label: d.toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric' }),
      total: dayOrders.length,
      delivered: dayOrders.filter(o => o.delivered).length,
    });
  }
  const maxBar = Math.max(...last7.map(d => d.total), 1);

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-2xl font-bold text-gray-900">التحليلات والتقارير</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '...' : card.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Last 7 days bar chart */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-5">الطلبات — آخر 7 أيام</h3>
        {loading ? (
          <div className="h-32 flex items-end gap-2">
            {[1,2,3,4,5,6,7].map(i => <div key={i} className="flex-1 bg-gray-100 rounded animate-pulse" style={{ height: `${Math.random()*80+20}%` }} />)}
          </div>
        ) : (
          <div className="flex items-end gap-2 h-36">
            {last7.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5 w-full" style={{ height: '100px' }}>
                  {/* Total bar — sky blue */}
                  <div className="flex-1 flex flex-col justify-end items-center">
                    {day.total > 0 && <span className="text-[10px] font-bold text-sky-600 mb-0.5">{day.total}</span>}
                    <div className="w-full bg-sky-300 rounded-t transition-all"
                      style={{ height: `${(day.total / maxBar) * 100}%` }} />
                  </div>
                  {/* Delivered bar — green */}
                  <div className="flex-1 flex flex-col justify-end items-center">
                    {day.delivered > 0 && <span className="text-[10px] font-bold text-green-600 mb-0.5">{day.delivered}</span>}
                    <div className="w-full bg-green-400 rounded-t transition-all"
                      style={{ height: `${(day.delivered / maxBar) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs text-gray-400 text-center leading-tight">{day.label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-sky-300" /><span className="text-xs text-gray-500">إجمالي الطلبات</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-400" /><span className="text-xs text-gray-500">تم التسليم</span></div>
        </div>
      </div>

      {/* Recent orders table */}
      {!loading && orders.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="font-bold text-gray-900">آخر الطلبات</h3>
          </div>
          <div className="divide-y">
            {orders.slice(0, 10).map(o => (
              <div key={o.id} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${o.delivered ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <span className="text-sm text-gray-900 font-medium">{o.drug || '—'}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{o.qty} قطعة</span>
                  {o.price > 0 && <span className="font-medium text-sky-600">{(o.price * o.qty).toLocaleString('ar-IQ')} د.ع</span>}
                  <span>{o.createdAt.toLocaleDateString('ar-IQ')}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.delivered ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {o.delivered ? 'مُسلَّم' : 'معلّق'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="bg-white rounded-2xl p-10 shadow-sm text-center text-gray-400">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد بيانات بعد. ستظهر التقارير بعد استلام الطلبات الأولى.</p>
        </div>
      )}
    </div>
  );
}
