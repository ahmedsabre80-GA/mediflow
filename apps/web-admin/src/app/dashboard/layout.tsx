'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Building2, Users, ShoppingCart,
  BarChart3, Shield, Settings, LogOut, Menu, X, Bell,
  Package, Stethoscope, ClipboardList, UserCog, MessageSquare, Trash2, HeartPulse, KeyRound, Pill
} from 'lucide-react';
import {
  startSession, endSession,
  getPlatformNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount,
  deleteNotification, deleteAllNotifications,
  type PlatformNotification,
} from '@/lib/auditSystem';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/approvals', label: 'طلبات الموافقة', icon: ClipboardList },
  { href: '/dashboard/pharmacies', label: 'الصيدليات', icon: Building2 },

  { href: '/dashboard/warehouses', label: 'المذاخر', icon: Package },
  { href: '/dashboard/drugs', label: 'كتالوج الأدوية', icon: Pill },
  { href: '/dashboard/doctors', label: 'الأطباء', icon: Stethoscope },
  { href: '/dashboard/patients', label: 'المرضى', icon: HeartPulse },
  { href: '/dashboard/users', label: 'المستخدمون', icon: Users },
  { href: '/dashboard/team', label: 'فريق المنصة', icon: UserCog },
  { href: '/dashboard/orders', label: 'الطلبات', icon: ShoppingCart },
  { href: '/dashboard/analytics', label: 'التحليلات', icon: BarChart3 },
  { href: '/dashboard/messages', label: 'مركز الرسائل', icon: MessageSquare },
  { href: '/dashboard/audit', label: 'سجل المراقبة', icon: Shield },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshNotifications = useCallback(() => {
    const notifs = getPlatformNotifications();
    setNotifications(notifs);
    setUnreadCount(getUnreadCount());
  }, []);

  useEffect(() => {
    // Start session tracking
    startSession();
    refreshNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  const markAllRead = () => {
    markAllNotificationsRead();
    refreshNotifications();
  };

  const handleNotificationClick = (notif: PlatformNotification) => {
    markNotificationRead(notif.id);
    refreshNotifications();
    setShowNotifications(false);
    if (notif.link) router.push(notif.link);
  };

  useEffect(() => {
    const token = localStorage.getItem('admin-token');
    if (!token) { router.push('/auth/login'); return; }

    // Validate token is still accepted by the backend
    fetch('https://mediflowauth-service-production.up.railway.app/api/v1/auth/admin/users?role=pharmacy&limit=1', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (r.status === 401) {
        localStorage.removeItem('admin-token');
        router.push('/auth/login');
      }
    }).catch(() => {});

    // Open sidebar by default on large screens
    const handleResize = () => setSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [router]);

  // Auto-logout after 30 minutes of inactivity
  useEffect(() => {
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        endSession(false);
        localStorage.removeItem('admin-token');
        router.push('/auth/login');
      }, IDLE_MS);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [router]);

  const logout = () => {
    endSession(false);
    localStorage.removeItem('admin-token');
    router.push('/auth/login');
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden" dir="rtl">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 right-0 z-30
        ${sidebarOpen ? 'w-64 translate-x-0' : 'w-64 translate-x-full lg:translate-x-0 lg:w-16'}
        bg-gray-900 text-white flex flex-col transition-all duration-300
      `}>
        <div className="p-4 flex items-center justify-between border-b border-gray-700 shrink-0">
          <div className={`flex items-center gap-2 overflow-hidden transition-all ${sidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 lg:opacity-0 lg:w-0'}`}>
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-sm whitespace-nowrap">ميديفلو — إدارة</span>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white shrink-0">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} prefetch={false}
                onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  active ? 'bg-sky-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}>
                <Icon className="w-5 h-5 shrink-0" />
                <span className={`text-sm font-medium whitespace-nowrap transition-all flex-1 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden lg:opacity-0'}`}>
                  {item.label}
                </span>
                {(item as any).badge && sidebarOpen && (
                  <span className="bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">!</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-700 shrink-0">
          <button onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white w-full transition-colors">
            <LogOut className="w-5 h-5 shrink-0" />
            <span className={`text-sm font-medium whitespace-nowrap transition-all ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
              تسجيل الخروج
            </span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b px-4 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg lg:hidden">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-gray-900 text-sm md:text-base">
              {NAV_ITEMS.find(i => i.href === pathname)?.label || 'لوحة الإدارة'}
            </h1>
          </div>
          <div className="flex items-center gap-2 relative">
            <button onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="absolute left-0 top-10 w-80 bg-white rounded-2xl shadow-xl border z-50" dir="rtl">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); markAllRead(); refreshNotifications(); }} className="text-xs text-sky-600 hover:underline">تحديد الكل كمقروء</button>
                      {notifications.length > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); deleteAllNotifications(); refreshNotifications(); }}
                          className="text-xs text-red-500 hover:underline flex items-center gap-1">
                          <Trash2 className="w-3 h-3" />حذف الكل
                        </button>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">
                      الإشعارات {unreadCount > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full mr-1">{unreadCount}</span>}
                    </h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-400 text-sm">لا توجد إشعارات</div>
                    ) : notifications.map(n => (
                      <div key={n.id}
                        onClick={(e) => { e.stopPropagation(); handleNotificationClick(n); }}
                        className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors flex items-start gap-3 ${!n.read ? 'bg-sky-50' : ''}`}>
                        {!n.read && <span className="w-2 h-2 bg-sky-500 rounded-full shrink-0 mt-1.5" />}
                        <div className={`flex-1 ${!n.read ? '' : 'mr-4'}`}>
                          <p className="text-sm text-gray-800 font-medium">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{n.timestamp}</p>
                          {n.link && <span className="text-xs text-sky-600 font-medium">← اضغط للانتقال للطلب</span>}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); refreshNotifications(); }}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0 rounded"
                          title="حذف الإشعار">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 text-center border-t">
                    <button onClick={(e) => { e.stopPropagation(); setShowNotifications(false); }} className="text-xs text-gray-500 hover:text-gray-700">إغلاق</button>
                  </div>
                </div>
              </>
            )}

            <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
