'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Search, Package, Stethoscope, Clock, Bell, X, ChevronLeft, LogOut } from 'lucide-react';
import { fetchPatientNotifications, markPatientNotifRead, type PatientNotif } from '@/lib/portalNotifications';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
  { href: '/search',    icon: Search,          label: 'بحث' },
  { href: '/doctors',   icon: Stethoscope,     label: 'أطباء' },
  { href: '/orders',    icon: Package,         label: 'طلباتي' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [userId,     setUserId]     = useState('');
  const [userName,   setUserName]   = useState('');
  const [notifs,     setNotifs]     = useState<PatientNotif[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [selected,   setSelected]   = useState<PatientNotif | null>(null);

  const refresh = useCallback(async (uid: string) => {
    if (!uid) return;
    const data = await fetchPatientNotifications(uid);
    setNotifs(data);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('mediflow-auth');
    if (!stored) { router.push('/login'); return; }
    try {
      const parsed = JSON.parse(stored);
      if (!parsed.state?.isAuthenticated) { router.push('/login'); return; }
      setIsApproved(!!parsed.state?.isApproved);
      const user = parsed.state?.user;
      const uid  = user?.id || '';
      setUserId(uid);
      setUserName(user?.name || user?.email?.split('@')[0] || 'مريض');
      refresh(uid);
      const iv = setInterval(() => refresh(uid), 30000);
      return () => clearInterval(iv);
    } catch { router.push('/login'); }
  }, [router, refresh]);

  const unread = notifs.filter(n => !n.isRead).length;

  const openNotif = (n: PatientNotif) => {
    if (!n.isRead) {
      markPatientNotifRead(n.id);
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    }
    setSelected(n);
    setShowNotifs(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('mediflow-auth');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">

      {/* ── TOP HEADER ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm px-4 h-14 flex items-center justify-between">

        {/* RIGHT: app name + greeting */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">م</div>
          <div className="leading-tight">
            <p className="text-xs text-gray-400">مرحباً</p>
            <p className="text-sm font-bold text-gray-900 leading-none">{userName}</p>
          </div>
        </div>

        {/* LEFT: bell + logout */}
        <div className="flex items-center gap-1 relative">
          {/* Bell */}
          <button onClick={() => setShowNotifs(v => !v)}
            className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {/* Logout */}
          <button onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors text-xs font-medium">
            <LogOut className="w-4 h-4" />
            تسجيل خروج
          </button>

          {/* Notification dropdown */}
          {showNotifs && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
              <div className="absolute left-0 top-11 w-80 bg-white rounded-2xl shadow-xl border z-50">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <button onClick={() => setShowNotifs(false)}>
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                  <h3 className="font-bold text-gray-900 text-sm">
                    الإشعارات
                    {unread > 0 && (
                      <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full mr-1">{unread}</span>
                    )}
                  </h3>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">لا توجد إشعارات حالياً</div>
                  ) : notifs.map(n => (
                    <div key={n.id} onClick={() => openNotif(n)}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-sky-50' : ''}`}>
                      <div className="flex items-start gap-2">
                        {!n.isRead && <span className="w-2 h-2 bg-sky-500 rounded-full shrink-0 mt-1.5" />}
                        <div className={`flex-1 min-w-0 ${!n.isRead ? '' : 'mr-4'}`}>
                          <p className="text-sm text-gray-800 font-medium line-clamp-2">{n.message}</p>
                          {n.senderName && <p className="text-xs text-gray-400 mt-0.5">من: {n.senderName}</p>}
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

      {/* Pending approval banner */}
      {isApproved === false && (
        <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm">
          <Clock className="w-4 h-4 shrink-0" />
          <span>حسابك قيد المراجعة — بعض الخدمات غير متاحة حتى موافقة الإدارة</span>
          <Link href="/pending" className="underline font-medium mr-2">التفاصيل</Link>
        </div>
      )}

      {children}

      {/* ── BOTTOM NAV ──────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-50">
        <div className="grid grid-cols-4 h-16">
          {NAV.map(item => {
            const Icon   = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} prefetch={false}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-sky-600' : 'text-gray-400'}`}>
                <Icon className={`w-5 h-5 ${active ? 'text-sky-600' : 'text-gray-400'}`} />
                <span className="text-xs font-medium">{item.label}</span>
                {active && <span className="absolute top-0 h-0.5 w-8 bg-sky-500 rounded-full" />}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── NOTIFICATION DETAIL MODAL ───────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
              <h2 className="font-bold text-gray-900">تفاصيل الإشعار</h2>
            </div>
            <div className="bg-sky-50 rounded-xl p-4 mb-4">
              <p className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</p>
            </div>
            <div className="space-y-1.5 text-sm mb-5">
              {selected.senderName && (
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">من</span>
                  <span className="text-gray-500">{selected.senderName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">التاريخ</span>
                <span className="text-gray-500">{new Date(selected.createdAt).toLocaleString('ar-IQ')}</span>
              </div>
            </div>
            <button onClick={() => setSelected(null)}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-xl text-sm">
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
