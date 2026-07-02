'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Package, ShoppingBag, BarChart2, Users, Megaphone, Settings, LogOut, Bell, X } from 'lucide-react';
import { getLocalNotifications, markNotifRead, addLocalNotification, type PortalNotif } from '@/lib/portalNotifications';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
  { href: '/dashboard/orders', icon: ShoppingBag, label: 'الطلبات' },
  { href: '/dashboard/inventory', icon: Package, label: 'المخزون' },
  { href: '/dashboard/analytics', icon: BarChart2, label: 'التحليلات' },
  { href: '/dashboard/employees', icon: Users, label: 'الموظفون' },
  { href: '/dashboard/campaigns', icon: Megaphone, label: 'الحملات' },
  { href: '/dashboard/settings', icon: Settings, label: 'الإعدادات' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<PortalNotif[]>([]);

  const refresh = useCallback(() => setNotifs(getLocalNotifications()), []);

  useEffect(() => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!token || !pharmacyId) {
      router.push('/auth/login');
      return;
    }
    // Validate token by hitting the inventory endpoint — redirect to login on 401
    fetch(`https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/${pharmacyId}/inventory?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (r.status === 401) {
        localStorage.removeItem('pharmacy-token');
        localStorage.removeItem('pharmacy-id');
        router.push('/auth/login');
      }
    }).catch(() => {});
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [router, refresh]);

  const unread = notifs.filter(n => !n.isRead).length;

  const handleRead = (id: string) => {
    markNotifRead(id);
    refresh();
  };

  const handleLogout = () => {
    localStorage.removeItem('pharmacy-token');
    localStorage.removeItem('pharmacy-refresh');
    router.push('/auth/login');
  };

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      <aside className="w-64 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sky-500 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🏥</span>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">ميديفلو</p>
              <p className="text-xs text-gray-500">لوحة الصيدلية</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} prefetch={false}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-sky-50 text-sky-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors">
            <LogOut className="w-5 h-5 shrink-0" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">
            {navItems.find(i => i.href === pathname)?.label || 'لوحة التحكم'}
          </h1>
          <div className="flex items-center gap-3 relative">
            {/* Notification Bell */}
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
                <div className="absolute left-0 top-10 w-80 bg-white rounded-2xl shadow-xl border z-50" dir="rtl">
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
                      <div key={n.id} onClick={() => handleRead(n.id)}
                        className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-sky-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.isRead && <span className="w-2 h-2 bg-sky-500 rounded-full shrink-0 mt-1.5" />}
                          <div className={!n.isRead ? '' : 'mr-4'}>
                            <p className="text-sm text-gray-800 font-medium">{n.message}</p>
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

            <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center text-white text-sm font-bold">ص</div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
