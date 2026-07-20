'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Package, ShoppingCart, Megaphone, BarChart3, Settings, LogOut, Warehouse, Users, Bell, X, MessageSquare, BookOpen, CreditCard } from 'lucide-react';
import { fetchNotifications, markNotifRead, type PortalNotif } from '@/lib/portalNotifications';
import { useIdleLogout } from '@/hooks/useIdleLogout';

const NAV = [
  { href: '/dashboard',           label: 'الرئيسية',       icon: LayoutDashboard },
  { href: '/dashboard/inventory', label: 'المخزون',        icon: Package },
  { href: '/dashboard/orders',    label: 'الطلبات B2B',   icon: ShoppingCart },
  { href: '/dashboard/directory', label: 'الدليل',         icon: BookOpen },
  { href: '/dashboard/messages',  label: 'الرسائل',        icon: MessageSquare },
  { href: '/dashboard/campaigns', label: 'الحملات',        icon: Megaphone },
  { href: '/dashboard/analytics', label: 'التحليلات',      icon: BarChart3 },
  { href: '/dashboard/employees', label: 'الموظفون',       icon: Users },
  { href: '/dashboard/subscription', label: 'الاشتراك',    icon: CreditCard },
  { href: '/dashboard/settings',  label: 'الإعدادات',      icon: Settings },
];

export default function WarehouseDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<PortalNotif[]>([]);

  const refresh = useCallback(async () => {
    const userId = localStorage.getItem('warehouse-user-id') || '';
    if (userId) {
      const remote = await fetchNotifications(userId);
      setNotifs(remote);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('warehouse-token')) { router.push('/auth/login'); return; }
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => { clearInterval(iv); };
  }, [router, refresh]);

  // Auto-logout after 30 minutes of inactivity — shared across every portal, see useIdleLogout.
  useIdleLogout(() => {
    localStorage.removeItem('warehouse-token');
    router.push('/auth/login');
  });

  const unread = notifs.filter(n => !n.isRead).length;

  const handleRead = (id: string, message?: string) => {
    markNotifRead(id);
    refresh();
    setShowNotifs(false);
    if (!message) return;
    // [PHREPORT] / pharmacy confirmReceipt messages
    const oidMatch = message.match(/\[oid:([0-9a-f-]{36})\]/i);
    if (oidMatch) {
      // _t param makes each click a unique URL so the orders page re-opens the modal
      router.push(`/dashboard/orders?feedback=${oidMatch[1]}&_t=${Date.now()}`);
      return;
    }
    // Return-report (broken/missing) messages from backend use "الطلبية: UUID"
    const orderLineMatch = message.match(/الطلبية:\s*([0-9a-f\-]{36})/i);
    if (orderLineMatch) {
      router.push(`/dashboard/orders?feedback=${orderLineMatch[1]}&_t=${Date.now()}`);
      return;
    }
    if (message.includes('B2B') || message.includes('طلب') || message.includes('order')) {
      router.push('/dashboard/orders');
    }
  };

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      <aside className="w-64 bg-white border-l flex flex-col shadow-sm">
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
              <Warehouse className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">بوابة المذاخر</p>
              <p className="text-xs text-gray-500">ميديفلو</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} prefetch={false}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                  active ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t">
          <button onClick={() => { localStorage.removeItem('warehouse-token'); router.push('/auth/login'); }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 w-full text-sm font-medium">
            <LogOut className="w-5 h-5" />تسجيل الخروج
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <h1 className="font-bold text-gray-900">{NAV.find(i => i.href === pathname)?.label || 'لوحة التحكم'}</h1>
          <div className="relative">
            <button onClick={() => setShowNotifs(!showNotifs)}
              className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {showNotifs && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
                <div className="fixed top-16 left-4 w-80 bg-white rounded-2xl shadow-xl border z-50" dir="rtl">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <button onClick={() => setShowNotifs(false)}><X className="w-4 h-4 text-gray-400" /></button>
                    <h3 className="font-bold text-gray-900 text-sm">
                      الإشعارات {unread > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full mr-1">{unread}</span>}
                    </h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y">
                    {notifs.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-400 text-sm">لا توجد إشعارات حالياً</div>
                    ) : notifs.map(n => (
                      <div key={n.id} onClick={() => handleRead(n.id, n.message)}
                        className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-amber-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.isRead && <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0 mt-1.5" />}
                          <div className={!n.isRead ? '' : 'mr-4'}>
                            <p className="text-sm text-gray-800 font-medium">
                              {n.message.includes('[PHREPORT]')
                                ? '📋 تقرير استلام من الصيدلية'
                                : n.message.split('\n')[0].replace(/\[.*?\]/g, '').trim() || n.message.slice(0, 60)}
                            </p>
                            {n.senderName && <p className="text-xs text-gray-400">من: {n.senderName}</p>}
                            <p className="text-xs text-gray-400">{new Date(n.createdAt).toLocaleString('ar-IQ')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
