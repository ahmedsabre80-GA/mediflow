'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Search, Package, Stethoscope, Clock, Bell, X, ChevronLeft, LogOut, XCircle, CalendarDays, RefreshCw } from 'lucide-react';
import { fetchPatientNotifications, markPatientNotifRead, type PatientNotif } from '@/lib/portalNotifications';

const PHARMACY_API  = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const CANCELLED_KEY = 'mediflow-cancelled-orders';
const REMINDERS_KEY = 'mediflow-appt-reminders';

function patientAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const raw = localStorage.getItem('mediflow-auth');
    const parsed = raw ? JSON.parse(raw) : {};
    const t = parsed.state?.accessToken || parsed.accessToken || parsed.token || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const CANCEL_REASONS = [
  'وجدت الدواء في صيدلية أخرى',
  'تغيرت حاجتي للدواء',
  'الوقت لا يناسبني',
  'طلبت بالخطأ',
  'السعر لا يناسبني',
];

const NAV = [
  { href: '/dashboard',      icon: LayoutDashboard, label: 'الرئيسية' },
  { href: '/search',         icon: Search,          label: 'بحث' },
  { href: '/doctors',        icon: Stethoscope,     label: 'أطباء' },
  { href: '/appointments',   icon: CalendarDays,    label: 'مواعيدي' },
  { href: '/orders',         icon: Package,         label: 'طلباتي' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [isApproved,     setIsApproved]     = useState<boolean | null>(null);
  const [userId,         setUserId]         = useState('');
  const [userName,       setUserName]       = useState('');
  const [notifs,         setNotifs]         = useState<PatientNotif[]>([]);
  const [showNotifs,     setShowNotifs]     = useState(false);
  const [selected,       setSelected]       = useState<PatientNotif | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason,   setCancelReason]   = useState('');
  const [cancelling,     setCancelling]     = useState(false);
  const [cancelledIds,   setCancelledIds]   = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CANCELLED_KEY) || '[]')); } catch { return new Set(); }
  });
  const [rxResearchModal, setRxResearchModal] = useState(false);
  const [pendingRxBase64, setPendingRxBase64] = useState('');
  const [resendingRx,     setResendingRx]     = useState(false);
  const [resendingPartial, setResendingPartial] = useState(false);
  const [resentRxNotifIds, setResentRxNotifIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mediflow-resent-rx-notifs') || '[]')); } catch { return new Set(); }
  });

  const refresh = useCallback(async (uid: string) => {
    if (!uid) return;
    const data = await fetchPatientNotifications(uid);
    setNotifs(data);
  }, []);

  const checkReminders = useCallback(async (uid: string) => {
    if (!uid) return;
    const stored: any[] = JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]');
    if (!stored.length) return;
    const now = Date.now();
    let changed = false;
    for (const appt of stored) {
      if (appt.sent) continue; // already fired
      const fireAt: number = appt.fireAt || (() => {
        const [h, m] = (appt.time || appt.prefTime || '09:00').split(':').map(Number);
        const base = new Date(appt.date + 'T00:00:00').getTime() + h * 3600000 + m * 60000;
        return appt.minutesBeforeTarget != null
          ? base - appt.minutesBeforeTarget * 60000
          : base - (appt.hoursBeforeTarget || 2) * 3600000;
      })();
      if (now >= fireAt && now < fireAt + 3600000) {
        const mins = appt.minutesBeforeTarget;
        const hrs  = appt.hoursBeforeTarget;
        const label = mins != null
          ? `بعد ${mins} دقيقة`
          : hrs === 24 ? 'غداً' : hrs === 6 ? 'بعد ٦ ساعات' : 'بعد ساعتين';
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: patientAuthHeaders(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: uid,
            senderName: 'ميديفلو',
            message: `🔔 تذكير بموعدك\nلديك موعد مع ${appt.doctorName} ${label}\nالتاريخ: ${appt.date}${appt.time || appt.prefTime ? '\nالوقت: ' + (appt.time || appt.prefTime) : ''}`,
          }),
        }).catch(() => {});
        appt.sent = true;
        changed = true;
      }
    }
    // Remove past appointments (> 1 day old)
    const filtered = stored.filter(a => new Date(a.date + 'T23:59:00').getTime() > now - 86400000);
    if (changed || filtered.length !== stored.length) {
      localStorage.setItem(REMINDERS_KEY, JSON.stringify(filtered));
      refresh(uid);
    }
  }, [refresh]);

  const checkPendingRx = useCallback(async (uid: string) => {
    if (!uid) return;
    try {
      const raw = localStorage.getItem('mediflow-pending-rx');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending?.sentAt) return;

      // Read timeout from localStorage (written by admin portal settings), default 30 min
      const rxTimeoutMin = Number(localStorage.getItem('mediflow-rx-timeout-min') || '30');
      const ageMin = (Date.now() - new Date(pending.sentAt).getTime()) / 60000;
      if (ageMin < rxTimeoutMin) return;

      // Check if prescription was already accepted (status no longer open)
      const rxData = await fetch(`${PHARMACY_API}/prescriptions/${pending.id}`, { headers: patientAuthHeaders() }).then(r => r.json()).catch(() => ({}));
      if (rxData?.data?.status && rxData.data.status !== 'open') {
        // Already handled — clear the pending entry
        localStorage.removeItem('mediflow-pending-rx');
        return;
      }

      // Expired and still open — notify patient and trigger re-search modal
      localStorage.removeItem('mediflow-pending-rx');
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST',
        headers: patientAuthHeaders(),
        body: JSON.stringify({
          portalType: 'patient',
          recipientId: uid,
          senderName: 'ميديفلو',
          message: `❌ لم يتم قبول وصفتك الطبية\nلم تستجب أي صيدلية خلال ${rxTimeoutMin} دقيقة.\nانقر لإعادة البحث أو توسيع النطاق.[prescription_id:${pending.id}]`,
        }),
      }).catch(() => {});
      refresh(uid);

      // Show re-search modal with the prescription image
      if (pending.imageBase64) {
        setPendingRxBase64(pending.imageBase64);
        setRxResearchModal(true);
      }
    } catch {}
  }, [refresh]);

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

      // Validate token with backend on mount
      const token = parsed.state?.accessToken || parsed.accessToken || parsed.token || '';
      const validateToken = () => {
        if (!token) { localStorage.removeItem('mediflow-auth'); router.push('/login'); return; }
        fetch('https://mediflowauth-service-production.up.railway.app/api/v1/auth/profile', {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => {
          if (r.status === 401) {
            localStorage.removeItem('mediflow-auth');
            router.push('/login');
          }
        }).catch(() => {});
      };
      validateToken();

      refresh(uid);
      checkReminders(uid);
      checkPendingRx(uid);
      const iv1   = setInterval(() => refresh(uid), 30000);
      const iv2   = setInterval(() => checkReminders(uid), 60000);
      const iv3   = setInterval(() => checkPendingRx(uid), 60000);
      const ivVal = setInterval(validateToken, 15 * 60 * 1000); // re-validate every 15 min
      return () => { clearInterval(iv1); clearInterval(iv2); clearInterval(iv3); clearInterval(ivVal); };
    } catch { router.push('/login'); }
  }, [router, refresh, checkReminders, checkPendingRx]);

  const unread = notifs.filter(n => !n.isRead).length;

  const isReservationNotif = (n: PatientNotif) =>
    n.message.includes('تم استلام طلب حجزك') && !cancelledIds.has(n.id);

  const closeModal = () => {
    setSelected(null);
    setShowCancelForm(false);
    setCancelReason('');
  };

  const handleCancelOrder = async () => {
    if (!selected || !cancelReason) return;
    setCancelling(true);
    try {
      const pharmacyOwnerId = selected.message.match(/\[pharmacy_owner_id:([^\]]+)\]/)?.[1] || '';
      const drug            = selected.message.match(/الدواء:\s*(.+)/)?.[1]?.trim() || 'الدواء';

      if (pharmacyOwnerId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: patientAuthHeaders(),
          body: JSON.stringify({
            portalType: 'pharmacy',
            recipientId: pharmacyOwnerId,
            senderName: userName,
            message: `❌ إلغاء طلب\nالمريض "${userName}" ألغى طلب حجز الدواء: ${drug}\nسبب الإلغاء: ${cancelReason}`,
          }),
        });
      }

      const next = new Set(Array.from(cancelledIds).concat(selected.id));
      setCancelledIds(next);
      localStorage.setItem(CANCELLED_KEY, JSON.stringify(Array.from(next)));
      closeModal();
    } catch {}
    setCancelling(false);
  };

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
                {notifs.length > 0 && (
                  <div className="px-4 py-2 border-b flex items-center justify-end bg-gray-50">
                    <button onClick={async () => {
                      await fetch(`${PHARMACY_API}/portal-notifications/read-all?portalType=patient&recipientId=${encodeURIComponent(userId)}`, { method: 'PATCH', headers: patientAuthHeaders() }).catch(() => {});
                      setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
                    }} className="text-xs text-sky-600 hover:text-sky-800 font-medium">
                      تحديد الكل كمقروء ✓
                    </button>
                  </div>
                )}
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
        <div className="grid grid-cols-5 h-16">
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

      {/* ── PRESCRIPTION RE-SEARCH MODAL ────────────────────────── */}
      {rxResearchModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setRxResearchModal(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
                <h2 className="font-bold text-gray-900 text-base">انتهت مدة انتظار وصفتك</h2>
              </div>
              <p className="text-sm text-amber-700 mt-1 text-right">
                لم تقبل أي صيدلية وصفتك — يمكنك إعادة الإرسال بنفس الوصفة أو تغيير النطاق
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Prescription image preview */}
              {pendingRxBase64 && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/jpeg;base64,${pendingRxBase64}`}
                    alt="الوصفة الطبية"
                    className="w-40 h-40 object-cover rounded-xl border-2 border-sky-200"
                  />
                </div>
              )}
              <p className="text-sm text-gray-600 text-center">
                وصفتك جاهزة — اضغط &quot;إعادة البحث&quot; لإرسالها مجدداً مع إمكانية تغيير النطاق
              </p>
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setRxResearchModal(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                لاحقاً
              </button>
              <button
                onClick={() => {
                  setRxResearchModal(false);
                  // Save the image back to pending-rx so search page can pre-fill
                  localStorage.setItem('mediflow-pending-rx', JSON.stringify({
                    imageBase64: pendingRxBase64,
                    sentAt: null,
                  }));
                  router.push('/search?tab=prescription');
                }}
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />
                إعادة البحث
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATION DETAIL MODAL ───────────────────────────── */}
      {selected && (() => {
        const isReservation = isReservationNotif(selected);
        const isPartialAccept = selected.message.includes('قبول جزئي للوصفة') || selected.message.includes('جميع الأدوية متوفرة');
        const partialPharmacyOwnerId = selected.message.match(/\[pharmacy_owner_id:([^\]]+)\]/)?.[1] || selected.senderId || '';
        const partialPrescriptionId  = selected.message.match(/\[prescription_id:([^\]]+)\]/)?.[1]  || '';
        const displayMessage = selected.message
          .replace(/\[pharmacy_owner_id:[^\]]*\]/g, '')
          .replace(/\[prescription_id:[^\]]*\]/g, '')
          .replace(/\[delivery:[^\]]*\]/g, '')
          .replace(/\[price:[^\]]*\]/g, '')
          .replace(/\[currency:[^\]]*\]/g, '')
          .trim();

        const handleResendToSamePharmacy = async () => {
          setResendingPartial(true);
          try {
            const pendingRaw = localStorage.getItem('mediflow-pending-rx');
            const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
            const imageBase64 = pending?.imageBase64 || '';
            const notes       = pending?.notes || '';
            const deliveryMethod = pending?.deliveryMethod || 'pickup';
            const deliveryAddress = pending?.deliveryAddress || '';
            const prescriptionId = partialPrescriptionId || pending?.id || `rx-${Date.now()}`;

            // Resolve pharmacy owner ID: from tag → senderId → nearby lookup by senderName
            let ownerId = partialPharmacyOwnerId;
            if (!ownerId && selected.senderName) {
              const lat  = pending?.lat  || 33.3;
              const lng  = pending?.lng  || 44.4;
              const near = await fetch(`${PHARMACY_API}/nearby?lat=${lat}&lng=${lng}&radius=500`).then(r => r.json()).catch(() => ({}));
              const match = (near.data || []).find((p: any) =>
                (p.name_ar || p.name || '').toLowerCase() === selected.senderName.toLowerCase()
              );
              ownerId = match?.owner_id || '';
            }
            if (!ownerId) { alert('لم نتمكن من تحديد الصيدلية — يرجى المحاولة مرة أخرى'); setResendingPartial(false); return; }

            const deliveryLine = deliveryMethod === 'delivery'
              ? `🚚 توصيل للمنزل${deliveryAddress ? ` — ${deliveryAddress}` : ''}`
              : '🏪 استلام من الصيدلية';

            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: patientAuthHeaders(),
              body: JSON.stringify({
                portalType: 'pharmacy',
                recipientId: ownerId,
                senderName: userName,
                message: `📋 قبول جزئي — المريض وافق على تحضير الأدوية المتوفرة\nطريقة الاستلام: ${deliveryLine}\n${notes ? `ملاحظات: ${notes}\n` : ''}[partial_accept:true][prescription_id:${prescriptionId}][patient_id:${userId}][delivery:${deliveryMethod}]`,
                imageBase64,
              }),
            });

            localStorage.setItem('mediflow-pending-rx', JSON.stringify({
              id: prescriptionId,
              imageBase64,
              notes,
              deliveryMethod,
              deliveryAddress,
              sentAt: new Date().toISOString(),
              pharmacyOwnerIds: [ownerId],
            }));

            await refresh(userId);
            setResentRxNotifIds(prev => {
              const next = new Set(Array.from(prev).concat(selected.id));
              localStorage.setItem('mediflow-resent-rx-notifs', JSON.stringify(Array.from(next)));
              return next;
            });
            closeModal();
          } catch { alert('حدث خطأ، حاول مجدداً'); }
          setResendingPartial(false);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
            onClick={closeModal}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="font-bold text-gray-900">تفاصيل الإشعار</h2>
              </div>
              <div className={`rounded-xl p-4 mb-4 ${isPartialAccept ? 'bg-amber-50' : 'bg-sky-50'}`}>
                {isPartialAccept ? (
                  <div className="text-sm leading-relaxed space-y-0.5">
                    {displayMessage.split('\n').map((line, i) => {
                      const isAvail    = line.includes('✓ متوفر');
                      const isUnavail  = line.includes('✗ غير متوفر');
                      const isSep      = /^━+$/.test(line.trim());
                      return (
                        <p key={i}
                          className={
                            isAvail   ? 'text-green-700 font-medium' :
                            isUnavail ? 'text-red-500 font-medium'   :
                            isSep     ? 'text-amber-300 text-xs'     :
                            'text-gray-800'
                          }>
                          {line || ' '}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap">{displayMessage}</p>
                )}
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

              {/* Partial accept response buttons */}
              {isPartialAccept && !showCancelForm && (
                <div className="space-y-2 mb-3">
                  {resentRxNotifIds.has(selected.id) ? (
                    <>
                      <p className="text-sm font-semibold text-green-700 text-center py-2">✅ تم إرسال الوصفة للصيدلية</p>
                      <button onClick={closeModal} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl text-sm">
                        إغلاق
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-amber-700 text-right">⚠️ هذه الصيدلية قبلت وصفتك جزئياً — اختر:</p>
                      <button
                        onClick={handleResendToSamePharmacy}
                        disabled={resendingPartial}
                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                        {resendingPartial ? 'جاري الإرسال...' : '✅ قبول وإعادة الإرسال لنفس الصيدلية'}
                      </button>
                      <button
                        disabled={resendingPartial}
                        onClick={() => { closeModal(); router.push('/search?tab=prescription'); }}
                        className="w-full border border-sky-400 text-sky-600 hover:bg-sky-50 disabled:opacity-50 font-bold py-3 rounded-xl text-sm">
                        🔍 البحث عن صيدلية أخرى
                      </button>
                      <button disabled={resendingPartial} onClick={closeModal} className="w-full border border-gray-300 text-gray-500 disabled:opacity-50 py-2.5 rounded-xl text-sm">
                        إغلاق
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Cancel reasons — only for pending reservations */}
              {!isPartialAccept && (isReservation && showCancelForm ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 text-right">سبب الإلغاء:</p>
                  {CANCEL_REASONS.map(reason => (
                    <button key={reason} onClick={() => setCancelReason(reason)}
                      className={`w-full text-right px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                        cancelReason === reason
                          ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}>
                      {reason}
                    </button>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowCancelForm(false); setCancelReason(''); }}
                      className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      رجوع
                    </button>
                    <button onClick={handleCancelOrder} disabled={!cancelReason || cancelling}
                      className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                      {cancelling ? 'جاري الإرسال...' : 'إلغاء وإشعار الصيدلية'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  <button onClick={closeModal}
                    className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-xl text-sm">
                    إغلاق
                  </button>
                  {(selected.message.includes('موعد') || selected.message.includes('حجز') || selected.message.includes('تأكيد') || selected.message.includes('زيارة')) && (
                    <button onClick={() => { closeModal(); router.push('/appointments'); }}
                      className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl text-sm">
                      فتح المواعيد
                    </button>
                  )}
                  {isReservation && (
                    <button onClick={() => setShowCancelForm(true)}
                      className="flex-1 flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 py-2.5 rounded-xl text-sm font-medium transition-colors">
                      <XCircle className="w-4 h-4" />
                      إلغاء وإشعار الصيدلية
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
