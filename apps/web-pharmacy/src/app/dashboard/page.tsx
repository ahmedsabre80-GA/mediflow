'use client';
import { useEffect, useState } from 'react';
import { ShoppingBag, DollarSign, TrendingUp, Star, CheckCircle } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const DELIVERED_KEY = 'pharmacy-delivered-notifs';

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}

function parseNotif(msg: string, id: string, createdAt: string, deliveredIds: Set<string>) {
  if (!msg.includes('طلب حجز جديد')) return null;
  const qtyStr = msg.match(/الكمية المطلوبة:\s*(\d+)/)?.[1] || '1';
  const price  = msg.match(/\[price:([^\]]*)\]/)?.[1]       || '0';
  return {
    id,
    qty: Number(qtyStr),
    price: Number(price) || 0,
    createdAt: new Date(createdAt),
    delivered: deliveredIds.has(id),
  };
}

export default function DashboardPage() {
  const [orders,       setOrders]       = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [pharmacyName, setPharmacyName] = useState('');

  useEffect(() => {
    setPharmacyName(localStorage.getItem('pharmacy-name') || '');
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

  const todayOrders  = orders.filter(o => o.createdAt.toDateString() === todayStr);
  const monthOrders  = orders.filter(o => o.createdAt.getMonth() === thisMonth && o.createdAt.getFullYear() === thisYear);
  const deliveredAll = orders.filter(o => o.delivered);
  const revenue      = (list: any[]) => list.filter(o => o.delivered).reduce((s, o) => s + o.price * o.qty, 0);

  const stats = [
    { label: 'طلبات اليوم',  value: loading ? '...' : String(todayOrders.length),                                    icon: ShoppingBag, color: 'bg-sky-500'    },
    { label: 'إيراد اليوم',  value: loading ? '...' : `${revenue(todayOrders).toLocaleString('ar-IQ')} د.ع`,         icon: DollarSign,  color: 'bg-green-500'  },
    { label: 'طلبات الشهر',  value: loading ? '...' : String(monthOrders.length),                                    icon: TrendingUp,  color: 'bg-purple-500' },
    { label: 'إيراد الشهر',  value: loading ? '...' : `${revenue(monthOrders).toLocaleString('ar-IQ')} د.ع`,         icon: Star,        color: 'bg-amber-500'  },
    { label: 'تم تسليمها',   value: loading ? '...' : String(deliveredAll.length),                                   icon: CheckCircle, color: 'bg-teal-500'   },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          مرحباً{pharmacyName ? ` — ${pharmacyName}` : ''} 👋
        </h2>
        <p className="text-gray-500 text-sm">هذا ملخص أداء صيدليتك اليوم</p>
      </div>

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
