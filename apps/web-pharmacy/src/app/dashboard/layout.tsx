'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Package, ShoppingBag, BarChart2, Users, Megaphone, Settings, LogOut, Bell, X, UserCircle, MessageSquare, ChevronLeft } from 'lucide-react';
import { fetchNotifications, markNotifRead, type PortalNotif } from '@/lib/portalNotifications';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

// Each nav item declares which permission grants access. Owners (role='owner') see all.
const NAV_ITEMS = [
  { href: '/dashboard',            icon: LayoutDashboard, label: 'الرئيسية',  perm: null },
  { href: '/dashboard/orders',     icon: ShoppingBag,     label: 'الطلبات',   perm: 'orders:read' },
  { href: '/dashboard/inventory',  icon: Package,         label: 'المخزون',   perm: 'inventory:read' },
  { href: '/dashboard/analytics',  icon: BarChart2,       label: 'التحليلات', perm: 'reports:read' },
  { href: '/dashboard/employees',  icon: Users,           label: 'الموظفون',  perm: 'employees:read' },
  { href: '/dashboard/messages',   icon: MessageSquare,   label: 'الرسائل',   perm: 'employees:read' },
  { href: '/dashboard/campaigns',  icon: Megaphone,       label: 'الحملات',   perm: 'employees:manage' },
  { href: '/dashboard/settings',   icon: Settings,        label: 'الإعدادات', perm: 'settings:read' },
];

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const CONFIRMED_KEY  = 'ph-confirmed-notifs';
const DELIVERED_KEY  = 'ph-delivered-notifs';

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]));
}

function parseReservation(msg: string) {
  if (!msg.includes('طلب حجز جديد')) return null;
  const drug       = msg.match(/الدواء:\s*(.+)/)?.[1]?.trim()             || '';
  const patient    = msg.match(/المريض:\s*(.+)/)?.[1]?.trim()             || '';
  const phone      = msg.match(/الهاتف:\s*(.+)/)?.[1]?.trim()             || '';
  const qtyStr     = msg.match(/الكمية المطلوبة:\s*(\d+)/)?.[1]           || '1';
  const pid        = msg.match(/\[patient_id:([^\]]+)\]/)?.[1]            || '';
  const pharmPhone = msg.match(/\[pharmacy_phone:([^\]]*)\]/)?.[1]        || '';
  const price      = msg.match(/\[price:([^\]]*)\]/)?.[1]                 || '';
  const currency   = msg.match(/\[currency:([^\]]*)\]/)?.[1]              || 'IQD';
  return { drug, patient, phone, qty: Number(qtyStr), patientId: pid, pharmacyPhone: pharmPhone, price, currency };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<PortalNotif[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<PortalNotif | null>(null);
  const [confirming,    setConfirming]    = useState(false);
  const [delivering,    setDelivering]    = useState(false);
  const [confirmedIds,  setConfirmedIds]  = useState<Set<string>>(new Set());
  const [deliveredIds,  setDeliveredIds]  = useState<Set<string>>(new Set());
  const [role, setRole] = useState<string>('owner');
  const [permissions, setPermissions] = useState<string[]>(['*']);
  const [pharmacyName,  setPharmacyName]  = useState('');
  const [pharmacyPhone, setPharmacyPhone] = useState('');

  const isOwner = role === 'owner';
  const hasPerm = (perm: string | null) => {
    if (!perm || isOwner || permissions.includes('*')) return true;
    return permissions.includes(perm);
  };

  const visibleNav = NAV_ITEMS.filter(item => hasPerm(item.perm));

  const refresh = useCallback(async () => {
    const userId = localStorage.getItem('pharmacy-user-id') || '';
    if (userId) {
      const remote = await fetchNotifications(userId);
      setNotifs(remote);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (!token || !pharmacyId) {
      router.push('/auth/login');
      return;
    }

    // Load role and permissions
    const storedRole = localStorage.getItem('pharmacy-role') || 'owner';
    const storedPerms = JSON.parse(localStorage.getItem('pharmacy-permissions') || '["*"]');
    setRole(storedRole);
    setPermissions(storedPerms);
    setPharmacyName(localStorage.getItem('pharmacy-name') || '');
    setPharmacyPhone(localStorage.getItem('pharmacy-phone') || '');
    setConfirmedIds(loadSet(CONFIRMED_KEY));
    setDeliveredIds(loadSet(DELIVERED_KEY));

    // Validate token
    fetch(`${API}/${pharmacyId}/inventory?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (r.status === 401) {
        ['pharmacy-token','pharmacy-refresh','pharmacy-id','pharmacy-name','pharmacy-role','pharmacy-permissions','pharmacy-staff-id']
          .forEach(k => localStorage.removeItem(k));
        router.push('/auth/login');
      }
    }).catch(() => {});

    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [router, refresh]);

  const unread = notifs.filter(n => !n.isRead).length;

  const handleLogout = () => {
    ['pharmacy-token','pharmacy-refresh','pharmacy-id','pharmacy-name','pharmacy-role','pharmacy-permissions','pharmacy-staff-id']
      .forEach(k => localStorage.removeItem(k));
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
              <p className="font-bold text-gray-900 text-sm">{pharmacyName || 'ميديفلو'}</p>
              <p className="text-xs text-gray-500">
                {isOwner ? 'مدير الصيدلية' : role === 'pharmacist' ? 'صيدلاني' : role === 'assistant_manager' ? 'مدير مساعد' : role === 'cashier' ? 'كاشير' : role === 'inventory_clerk' ? 'موظف مخزون' : 'موظف'}
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
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
            {NAV_ITEMS.find(i => i.href === pathname)?.label || 'لوحة التحكم'}
          </h1>
          <div className="flex items-center gap-3 relative">
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
                      <div key={n.id} onClick={() => { markNotifRead(n.id); setSelectedNotif(n); setShowNotifs(false); refresh(); }}
                        className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-sky-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.isRead && <span className="w-2 h-2 bg-sky-500 rounded-full shrink-0 mt-1.5" />}
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

            <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {isOwner ? 'م' : <UserCircle className="w-5 h-5" />}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>

      {/* Notification detail modal */}
      {selectedNotif && (() => {
        const reservation = parseReservation(selectedNotif.message);
        const isConfirmed  = confirmedIds.has(selectedNotif.id);
        const isDelivered  = deliveredIds.has(selectedNotif.id);
        const cleanMessage = selectedNotif.message.replace(/\[patient_id:[^\]]+\]/g, '').replace(/\[pharmacy_phone:[^\]]*\]/g, '').trim();

        const handleConfirm = async () => {
          if (!reservation?.patientId) return;
          setConfirming(true);
          try {
            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: reservation.patientId,
                senderName: pharmacyName || 'الصيدلية',
                message: `✅ تم تأكيد طلبك!\nالدواء "${reservation.drug}" جاهز للاستلام من صيدلية ${pharmacyName || 'الصيدلية'}.\nيمكنك التوجه إليها أو التواصل معهم على رقم الصيدلية ${reservation.pharmacyPhone || pharmacyPhone || ''}.`,
              }),
            });
            const next = new Set([...confirmedIds, selectedNotif.id]);
            setConfirmedIds(next);
            saveSet(CONFIRMED_KEY, next);
          } catch {}
          setConfirming(false);
        };

        const handleDeliver = async () => {
          if (!reservation?.patientId) return;
          setDelivering(true);
          try {
            const pricePerUnit = Number(reservation.price) || 0;
            const total = pricePerUnit * reservation.qty;
            const now   = new Date().toLocaleString('ar-IQ');
            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: reservation.patientId,
                senderName: pharmacyName || 'الصيدلية',
                message: `🧾 إيصال استلام\n━━━━━━━━━━━━━━━\nالدواء: ${reservation.drug}\nالكمية: ${reservation.qty} قطعة\nالسعر: ${pricePerUnit.toLocaleString('ar-IQ')} ${reservation.currency} للقطعة\nالإجمالي: ${total.toLocaleString('ar-IQ')} ${reservation.currency}\nالصيدلية: ${pharmacyName || 'الصيدلية'}\nالتاريخ: ${now}\n━━━━━━━━━━━━━━━\nشكراً لاستخدامك ميديفلو 💙`,
              }),
            });
            const next = new Set([...deliveredIds, selectedNotif.id]);
            setDeliveredIds(next);
            saveSet(DELIVERED_KEY, next);
          } catch {}
          setDelivering(false);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelectedNotif(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setSelectedNotif(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="font-bold text-gray-900">تفاصيل الإشعار</h2>
              </div>

              {/* Message */}
              <div className={`rounded-xl p-4 mb-4 max-h-64 overflow-y-auto ${reservation ? 'bg-amber-50 border border-amber-200' : 'bg-sky-50'}`}>
                <p className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap">{cleanMessage}</p>
              </div>

              <div className="space-y-1.5 text-sm text-gray-500 mb-5">
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

              {/* Buttons */}
              {reservation ? (
                isDelivered ? (
                  /* ── State 3: delivered ── */
                  <div className="space-y-2">
                    <div className="w-full bg-green-50 border border-green-200 text-green-700 font-semibold py-2.5 rounded-xl text-sm text-center">
                      ✅ تم التسليم — تم إرسال الإيصال للمريض
                    </div>
                    <button onClick={() => setSelectedNotif(null)}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                ) : isConfirmed ? (
                  /* ── State 2: confirmed, waiting for delivery ── */
                  <div className="space-y-2">
                    <div className="w-full bg-sky-50 border border-sky-200 text-sky-700 text-xs text-center py-2 rounded-xl">
                      ✅ تم تأكيد الحجز — في انتظار استلام المريض
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setSelectedNotif(null)}
                        className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                        إغلاق
                      </button>
                      <button onClick={handleDeliver} disabled={delivering}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                        {delivering ? 'جاري الإرسال...' : '📦 تم التسليم — إرسال إيصال'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── State 1: new reservation ── */
                  <div className="flex gap-3">
                    <button onClick={() => setSelectedNotif(null)}
                      className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                    <button onClick={handleConfirm} disabled={confirming}
                      className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                      {confirming ? 'جاري الإرسال...' : '✓ تأكيد الحجز وإشعار المريض'}
                    </button>
                  </div>
                )
              ) : (
                <button onClick={() => setSelectedNotif(null)}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                  إغلاق
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
