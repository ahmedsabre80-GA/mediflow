'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Calendar, FileText, Users, BarChart3, Settings, LogOut, Stethoscope, UserCog, Bell, X, MessageSquare, ChevronLeft, Building2, CreditCard } from 'lucide-react';
import { fetchNotifications, markNotifRead, type PortalNotif } from '@/lib/portalNotifications';
import { useIdleLogout } from '@/hooks/useIdleLogout';

const NAV = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/appointments', label: 'المواعيد', icon: Calendar },
  { href: '/dashboard/prescriptions', label: 'الوصفات الطبية', icon: FileText },
  { href: '/dashboard/patients', label: 'المرضى', icon: Users },
  { href: '/dashboard/pharmacies', label: 'الصيدليات', icon: Building2 },
  { href: '/dashboard/employees', label: 'الموظفون', icon: UserCog },
  { href: '/dashboard/messages', label: 'الرسائل', icon: MessageSquare },
  { href: '/dashboard/analytics', label: 'الإحصائيات', icon: BarChart3 },
  { href: '/dashboard/subscription', label: 'الاشتراك', icon: CreditCard },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings },
];

export default function DoctorDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<PortalNotif[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<PortalNotif | null>(null);
  const [ptRescheduleActing, setPtRescheduleActing] = useState(false);
  const [ptRescheduleActed, setPtRescheduleActed] = useState<Record<string, 'accepted' | 'cancelled'>>({});
  const [ptBookingStatus, setPtBookingStatus] = useState<string | null>(null);

  const APPT_API  = `${process.env.NEXT_PUBLIC_API_URL}/appointments/doctors`;
  const NOTIF_API = `${process.env.NEXT_PUBLIC_API_URL}/pharmacies/portal-notifications`;

  function drAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('doctor-token') || '';
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  const refresh = useCallback(async () => {
    const userId = localStorage.getItem('doctor-user-id') || '';
    if (userId) {
      const remote = await fetchNotifications(userId);
      setNotifs(remote);
    }
  }, []);

  // Validate locally using JWT expiry — no network call, no Railway timeout errors.
  const validateToken = useCallback(() => {
    const token = localStorage.getItem('doctor-token');
    if (!token) { router.push('/auth/login'); return; }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        ['doctor-token','doctor-name','doctor-id','doctor-user-id'].forEach(k => localStorage.removeItem(k));
        router.push('/auth/login');
      }
    } catch {
      ['doctor-token','doctor-name','doctor-id','doctor-user-id'].forEach(k => localStorage.removeItem(k));
      router.push('/auth/login');
    }
  }, [router]);

  useEffect(() => {
    if (!localStorage.getItem('doctor-token')) { router.push('/auth/login'); return; }
    validateToken();
    refresh();
    const iv    = setInterval(refresh, 30000);
    const ivVal = setInterval(validateToken, 15 * 60 * 1000);
    return () => { clearInterval(iv); clearInterval(ivVal); };
  }, [router, refresh, validateToken]);

  // Auto-logout after 30 minutes of inactivity — shared across every portal, see useIdleLogout.
  useIdleLogout(() => {
    ['doctor-token','doctor-name','doctor-id','doctor-user-id'].forEach(k => localStorage.removeItem(k));
    router.push('/auth/login');
  });

  const unread = notifs.filter(n => !n.isRead).length;

  // Amber badge: expected visitors needing a call within 2 days
  const [pendingCalls, setPendingCalls] = useState(0);
  useEffect(() => {
    const ev: any[] = JSON.parse(localStorage.getItem('mediflow-expected-visitors') || '[]');
    const today = new Date(); today.setHours(0,0,0,0);
    const count = ev.filter(v => {
      if (v.called || v.booked) return false;
      const d = Math.ceil((new Date(v.revisitDate+'T00:00:00').getTime() - today.getTime()) / 86400000);
      return d >= 0 && d <= 2;
    }).length;
    setPendingCalls(count);
  }, [pathname]);

  const handleRead = (notif: PortalNotif) => {
    markNotifRead(notif.id);
    setSelectedNotif(notif);
    setPtBookingStatus(null);
    setShowNotifs(false);
    refresh();
  };

  // When the modal opens for a patient-reschedule notification, fetch live booking status
  // so we can detect if the doctor already acted on it from the appointment card.
  useEffect(() => {
    if (!selectedNotif) return;
    const isPtReschedule = selectedNotif.message.includes('📅 طلب تغيير موعد من المريض');
    if (!isPtReschedule) return;
    const bookingId = selectedNotif.message.match(/\[booking_id:([^\]]+)\]/)?.[1] || '';
    const doctorId  = selectedNotif.message.match(/\[doctor_id:([^\]]+)\]/)?.[1] || '';
    if (!bookingId || !doctorId) return;
    fetch(`${APPT_API}/${doctorId}/bookings/${bookingId}`, { headers: drAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const status = d?.data?.status || d?.status || null;
        if (status && status !== 'pending') setPtBookingStatus(status);
      })
      .catch(() => {});
  }, [selectedNotif]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="flex items-center gap-2">
            {pendingCalls > 0 && (
              <button onClick={() => router.push('/dashboard/appointments?tab=expected')}
                className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
                <span>📞</span> {pendingCalls} اتصال مطلوب
              </button>
            )}
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
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>

      {/* Notification detail modal */}
      {selectedNotif && (() => {
        const isPtReschedule = selectedNotif.message.includes('📅 طلب تغيير موعد من المريض');
        const ptBookingId = selectedNotif.message.match(/\[booking_id:([^\]]+)\]/)?.[1] || '';
        const ptDoctorId  = selectedNotif.message.match(/\[doctor_id:([^\]]+)\]/)?.[1]  || '';
        const ptNewDate   = selectedNotif.message.match(/\[new_date:([^\]]+)\]/)?.[1]   || '';
        const ptPatientId = selectedNotif.message.match(/\[patient_id:([^\]]+)\]/)?.[1] || selectedNotif.senderId || '';
        const displayMsg  = selectedNotif.message
          .replace(/\[booking_id:[^\]]*\]/g, '')
          .replace(/\[doctor_id:[^\]]*\]/g, '')
          .replace(/\[new_date:[^\]]*\]/g, '')
          .replace(/\[patient_id:[^\]]*\]/g, '')
          .trim();

        const handlePtRescheduleAction = async (action: 'accept' | 'cancel') => {
          if (!ptBookingId || !ptDoctorId) { alert('بيانات الحجز غير مكتملة'); return; }
          setPtRescheduleActing(true);
          try {
            const newStatus = action === 'accept' ? 'confirmed' : 'cancelled';
            await fetch(`${APPT_API}/${ptDoctorId}/bookings/${ptBookingId}`, {
              method: 'PATCH',
              headers: drAuthHeaders(),
              body: JSON.stringify({ status: newStatus }),
            });
            // Notify patient
            const patientName = selectedNotif.senderName || 'المريض';
            const doctorName  = localStorage.getItem('doctor-name') || 'الطبيب';
            await fetch(NOTIF_API, {
              method: 'POST',
              headers: drAuthHeaders(),
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: ptPatientId,
                senderName: doctorName,
                message: action === 'accept'
                  ? `✅ قبل الطبيب طلب تغيير موعدك إلى ${ptNewDate}`
                  : `❌ رفض الطبيب طلب تغيير موعدك — الموعد القديم لا يزال سارياً`,
              }),
            }).catch(() => {});
            setPtRescheduleActed(prev => ({ ...prev, [selectedNotif.id]: action === 'accept' ? 'accepted' : 'cancelled' }));
          } catch { alert('حدث خطأ، حاول مجدداً'); }
          setPtRescheduleActing(false);
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
              <div className="bg-teal-50 rounded-xl p-4 mb-4 max-h-64 overflow-y-auto">
                <p className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap">{displayMsg}</p>
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

              {/* Patient reschedule: Accept / Cancel */}
              {isPtReschedule && (() => {
                // Resolved via modal action this session
                const actedThisSession = ptRescheduleActed[selectedNotif.id];
                // Resolved via appointment card (live booking status)
                const alreadyHandled = !actedThisSession && ptBookingStatus && ptBookingStatus !== 'pending';
                const resolvedAs = actedThisSession ||
                  (ptBookingStatus === 'confirmed' ? 'accepted' : ptBookingStatus === 'cancelled' ? 'cancelled' : null);

                if (resolvedAs) {
                  return (
                    <div className="space-y-2">
                      <p className={`text-sm font-semibold text-center py-2 ${resolvedAs === 'accepted' ? 'text-green-700' : 'text-red-600'}`}>
                        {resolvedAs === 'accepted' ? '✅ تم قبول الموعد الجديد' : '❌ تم رفض الطلب'}
                      </p>
                      <button onClick={() => setSelectedNotif(null)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl text-sm">إغلاق</button>
                    </div>
                  );
                }

                if (alreadyHandled) {
                  return (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500 text-center py-2">تم التعامل مع هذا الطلب مسبقاً</p>
                      <button onClick={() => setSelectedNotif(null)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl text-sm">إغلاق</button>
                    </div>
                  );
                }

                return (
                  <div>
                    <p className="text-sm font-semibold text-teal-700 text-right mb-3">📅 اختر ما تريد فعله بطلب المريض:</p>
                    <div className="flex gap-2">
                      <button onClick={() => handlePtRescheduleAction('accept')} disabled={ptRescheduleActing}
                        className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm">
                        {ptRescheduleActing ? '...' : '✅ قبول'}
                      </button>
                      <button onClick={() => handlePtRescheduleAction('cancel')} disabled={ptRescheduleActing}
                        className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm">
                        {ptRescheduleActing ? '...' : '❌ رفض'}
                      </button>
                      <button onClick={() => setSelectedNotif(null)} disabled={ptRescheduleActing}
                        className="flex-1 border border-gray-300 text-gray-500 disabled:opacity-50 py-3 rounded-xl text-sm font-medium">
                        لاحقاً
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Regular actions */}
              {!isPtReschedule && (
                <div className="flex gap-2">
                  {(selectedNotif.message.includes('موعد') || selectedNotif.message.includes('حجز') || selectedNotif.message.includes('تأكيد') || selectedNotif.message.includes('إلغاء') || selectedNotif.message.includes('تغيير')) && (
                    <button onClick={() => {
                      const dateMatch = selectedNotif.message.match(/إلى:\s*(\d{4}-\d{2}-\d{2})/);
                      const dest = dateMatch ? `/dashboard/appointments?date=${dateMatch[1]}` : '/dashboard/appointments';
                      setSelectedNotif(null); router.push(dest);
                    }} className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                      فتح المواعيد
                    </button>
                  )}
                  <button onClick={() => setSelectedNotif(null)}
                    className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded-xl transition-colors text-sm">
                    إغلاق
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
