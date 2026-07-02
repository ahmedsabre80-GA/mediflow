'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Calendar, FileText, Users, BarChart3, Settings, LogOut, Stethoscope, UserCog, Bell, X, MessageSquare, ChevronLeft } from 'lucide-react';
import { fetchNotifications, markNotifRead, type PortalNotif } from '@/lib/portalNotifications';

const NAV = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/appointments', label: 'المواعيد', icon: Calendar },
  { href: '/dashboard/prescriptions', label: 'الوصفات الطبية', icon: FileText },
  { href: '/dashboard/patients', label: 'المرضى', icon: Users },
  { href: '/dashboard/employees', label: 'الموظفون', icon: UserCog },
  { href: '/dashboard/messages', label: 'الرسائل', icon: MessageSquare },
  { href: '/dashboard/analytics', label: 'الإحصائيات', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings },
];

export default function DoctorDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<PortalNotif[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<PortalNotif | null>(null);

  const refresh = useCallback(async () => {
    const userId = localStorage.getItem('doctor-user-id') || '';
    if (userId) {
      const remote = await fetchNotifications(userId);
      setNotifs(remote);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('doctor-token')) router.push('/auth/login');
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [router, refresh]);

  const unread = notifs.filter(n => !n.isRead).length;

  const handleRead = (notif: PortalNotif) => {
    markNotifRead(notif.id);
    setSelectedNotif(notif);
    setShowNotifs(false);
    refresh();
  };

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      <aside className="w-64 bg-white border-l flex flex-col shadow-sm">
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">بوابة الأطباء</p>
              <p className="text-xs text-gray-500">ميديفلو</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                  active ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t">
          <button onClick={() => { localStorage.removeItem('doctor-token'); router.push('/auth/login'); }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 w-full text-sm font-medium transition-colors">
            <LogOut className="w-5 h-5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <h1 className="font-bold text-gray-900">
            {NAV.find(i => i.href === pathname)?.label || 'لوحة التحكم'}
          </h1>
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
                      <div key={n.id} onClick={() => handleRead(n)}
                        className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-teal-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.isRead && <span className="w-2 h-2 bg-teal-500 rounded-full shrink-0 mt-1.5" />}
                          <div className={`flex-1 ${!n.isRead ? '' : 'mr-4'}`}>
                            <p className="text-sm text-gray-800 font-medium line-clamp-2">{n.message}</p>
                            {n.senderName && <p className="text-xs text-gray-400">من: {n.senderName}</p>}
                            <p className="text-xs text-gray-400">{new Date(n.createdAt).toLocaleString('ar-IQ')}</p>
                          </div>
                          <ChevronLeft className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
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

      {/* Notification detail modal */}
      {selectedNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelectedNotif(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelectedNotif(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
              <h2 className="font-bold text-gray-900">تفاصيل الإشعار</h2>
            </div>
            <div className="bg-teal-50 rounded-xl p-4 mb-4">
              <p className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap">{selectedNotif.message}</p>
            </div>
            <div className="space-y-1.5 text-sm text-gray-500">
              {selectedNotif.senderName && (
                <div className="flex justify-between">
                  <span>{selectedNotif.senderName}</span>
                  <span className="font-medium text-gray-700">المرسل</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>{new Date(selectedNotif.createdAt).toLocaleString('ar-IQ')}</span>
                <span className="font-medium text-gray-700">التاريخ</span>
              </div>
            </div>
            <button onClick={() => setSelectedNotif(null)}
              className="mt-5 w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
