'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Package, ShoppingBag, BarChart2, Users, Megaphone, Settings, LogOut, Bell, X, UserCircle, MessageSquare, ChevronLeft, AlertTriangle, CheckCircle, Send } from 'lucide-react';
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
const PLATFORM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/platform';

function pharmAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('pharmacy-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const CONFIRMED_KEY         = 'ph-confirmed-notifs';
const DELIVERED_KEY         = 'ph-delivered-notifs';
const PARTIAL_PREPARING_KEY = 'ph-partial-preparing';
const PARTIAL_DELIVERED_KEY = 'ph-partial-delivered';

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify(Array.from(s)));
}

function parsePrescription(msg: string) {
  if (!msg.includes('[prescription_id:')) return null;
  const id       = msg.match(/\[prescription_id:([^\]]+)\]/)?.[1] || '';
  const patient  = msg.match(/المريض:\s*(.+)/)?.[1]?.trim()       || '';
  const pid      = msg.match(/\[patient_id:([^\]]+)\]/)?.[1]      || '';
  const delivery = msg.match(/\[delivery:([^\]]+)\]/)?.[1]        || 'pickup';
  return { id, patient, patientId: pid, delivery };
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
  const drugId     = msg.match(/\[drug_id:([^\]]*)\]/)?.[1]              || '';
  return { drug, patient, phone, qty: Number(qtyStr), patientId: pid, pharmacyPhone: pharmPhone, price, currency, drugId };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<PortalNotif[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<PortalNotif | null>(null);
  const [confirming,    setConfirming]    = useState(false);
  const [delivering,    setDelivering]    = useState(false);
  const [rejecting,     setRejecting]     = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason,  setRejectReason]  = useState('');
  const [confirmedIds,  setConfirmedIds]  = useState<Set<string>>(new Set());
  const [deliveredIds,  setDeliveredIds]  = useState<Set<string>>(new Set());
  const [rejectedIds,   setRejectedIds]   = useState<Set<string>>(new Set());
  const [role, setRole] = useState<string>('owner');
  const [permissions, setPermissions] = useState<string[]>(['*']);
  const [pharmacyName,  setPharmacyName]  = useState('');
  const [pharmacyPhone, setPharmacyPhone] = useState('');
  const [timeoutMin,         setTimeoutMin]         = useState(10);
  const [acceptingRx,        setAcceptingRx]        = useState(false);
  const [acceptedRxIds,      setAcceptedRxIds]      = useState<Set<string>>(new Set());
  const [rxClaimedBy,        setRxClaimedBy]        = useState<string | null>(null);
  const [checkingRxClaim,    setCheckingRxClaim]    = useState(false);
  const [rxImage,            setRxImage]            = useState<string | null>(null);
  const [rxImageLoading,     setRxImageLoading]     = useState(false);
  const [rxImageFullscreen,  setRxImageFullscreen]  = useState(false);
  const [rxTimeoutMin,       setRxTimeoutMin]       = useState(30);
  const [rxModalMode,        setRxModalMode]        = useState<'partial' | 'reject' | null>(null);
  const [rxModalDrugSlots,   setRxModalDrugSlots]   = useState<Record<number, boolean>>({});
  const [rxModalDrugCount,   setRxModalDrugCount]   = useState(5);
  const [rxModalRejectMsg,   setRxModalRejectMsg]   = useState('');
  const [rxModalResponding,  setRxModalResponding]  = useState(false);
  const [preparingPartialIds, setPreparingPartialIds] = useState<Set<string>>(new Set());
  const [partialDeliveredIds, setPartialDeliveredIds] = useState<Set<string>>(new Set());
  const [startingPrep,       setStartingPrep]       = useState(false);
  const [partialDelivering,  setPartialDelivering]  = useState(false);

  const isOwner = role === 'owner';
  const hasPerm = (perm: string | null) => {
    if (!perm || isOwner || permissions.includes('*')) return true;
    return permissions.includes(perm);
  };

  const visibleNav = NAV_ITEMS.filter(item => hasPerm(item.perm));

  const refresh = useCallback(async () => {
    const userId = localStorage.getItem('pharmacy-user-id') || '';
    if (!userId) return;
    const remote = await fetchNotifications(userId);
    setNotifs(remote);

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
    setPreparingPartialIds(loadSet(PARTIAL_PREPARING_KEY));
    setPartialDeliveredIds(loadSet(PARTIAL_DELIVERED_KEY));

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

    fetch(`${PLATFORM_API}/config/auto_reject_minutes`)
      .then(r => r.json())
      .then(d => setTimeoutMin(Number(d?.data?.value || 10)))
      .catch(() => {});
    fetch(`${PLATFORM_API}/config/prescription_reject_minutes`)
      .then(r => r.json())
      .then(d => setRxTimeoutMin(Number(d?.data?.value || 30)))
      .catch(() => {});

    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [router, refresh]);

  // When a prescription notification is opened: fetch image + check claim status
  useEffect(() => {
    if (!selectedNotif) { setRxImage(null); setRxClaimedBy(null); return; }
    const rx = parsePrescription(selectedNotif.message);
    if (!rx) { setRxImage(null); return; }
    // Fetch image
    setRxImage(null);
    setRxImageLoading(true);
    fetch(`${PHARMACY_API}/prescriptions/${rx.id}/image`)
      .then(r => r.json())
      .then(d => {
        if (d?.data?.image_base64) {
          const raw = d.data.image_base64 as string;
          setRxImage(raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`);
        }
      })
      .catch(() => {})
      .finally(() => setRxImageLoading(false));
    // Check claim status
    if (acceptedRxIds.has(rx.id)) return;
    setRxClaimedBy(null);
    setCheckingRxClaim(true);
    fetch(`${PHARMACY_API}/prescriptions/${rx.id}`)
      .then(r => r.json())
      .then(d => { if (d?.data?.status === 'claimed') setRxClaimedBy(d.data.claimed_by || 'صيدلية أخرى'); })
      .catch(() => {})
      .finally(() => setCheckingRxClaim(false));
  }, [selectedNotif]);

  const unread = notifs.filter(n => !n.isRead).length;

  const handleLogout = async () => {
    // Set pharmacy status to inactive (shows as "مغلق" to patients)
    const token = localStorage.getItem('pharmacy-token');
    const pharmacyId = localStorage.getItem('pharmacy-id');
    if (token && pharmacyId) {
      fetch(`${API}/${pharmacyId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'inactive' }),
      }).catch(() => {});
    }
    ['pharmacy-token','pharmacy-refresh','pharmacy-id','pharmacy-name','pharmacy-role','pharmacy-permissions','pharmacy-staff-id','pharmacy-opening-hours']
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
                  {notifs.length > 0 && (
                    <div className="px-4 py-2 border-b flex items-center justify-end bg-gray-50">
                      <button onClick={async () => {
                        const uid = localStorage.getItem('pharmacy-user-id') || '';
                        await fetch(`${PHARMACY_API}/portal-notifications/read-all?portalType=pharmacy&recipientId=${encodeURIComponent(uid)}`, { method: 'PATCH', headers: pharmAuthHeaders() }).catch(() => {});
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

      {/* Prescription fullscreen viewer */}
      {rxImageFullscreen && rxImage && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
          onClick={() => setRxImageFullscreen(false)}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/60">
            <span className="text-white text-sm font-medium">الوصفة الطبية</span>
            <button onClick={() => setRxImageFullscreen(false)}
              className="text-white bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <img src={rxImage} alt="الوصفة الطبية"
            className="max-w-full max-h-full object-contain p-4 pt-14"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Notification detail modal */}
      {selectedNotif && (() => {
        const reservation  = parseReservation(selectedNotif.message);
        const prescription = parsePrescription(selectedNotif.message);
        const isConfirmed  = confirmedIds.has(selectedNotif.id);
        const isDelivered  = deliveredIds.has(selectedNotif.id);
        const isExpired    = !!reservation && !isConfirmed && !isDelivered &&
          (Date.now() - new Date(selectedNotif.createdAt).getTime()) / 60000 > timeoutMin;
        const isRxAccepted = prescription ? acceptedRxIds.has(prescription.id) : false;
        const isRxExpired  = !!prescription && !isRxAccepted && !rxClaimedBy &&
          (Date.now() - new Date(selectedNotif.createdAt).getTime()) / 60000 > rxTimeoutMin;
        const isPartialAcceptFromPatient = selectedNotif.message.includes('[partial_accept:true]');
        const partialAcceptDelivery = selectedNotif.message.match(/\[delivery:([^\]]+)\]/)?.[1] || 'pickup';
        const partialAcceptPatientId = selectedNotif.message.match(/\[patient_id:([^\]]+)\]/)?.[1] || '';
        const isPreparing   = preparingPartialIds.has(selectedNotif.id);
        const isPartialDone = partialDeliveredIds.has(selectedNotif.id);

        const handleStartPreparing = async () => {
          setStartingPrep(true);
          try {
            const msg = partialAcceptDelivery === 'delivery'
              ? `🔄 يتم تحضير الأدوية المتوفرة في وصفتك الآن وستصلك قريباً — صيدلية ${pharmacyName || 'الصيدلية'}`
              : `🔄 يتم تحضير الأدوية المتوفرة في وصفتك الآن، يرجى التوجه للاستلام من صيدلية ${pharmacyName || 'الصيدلية'}\nرقم الهاتف: ${pharmacyPhone || '—'}`;
            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: pharmAuthHeaders(),
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: partialAcceptPatientId,
                senderName: pharmacyName || 'الصيدلية',
                message: msg,
              }),
            });
            const next = new Set(Array.from(preparingPartialIds).concat(selectedNotif.id));
            setPreparingPartialIds(next);
            saveSet(PARTIAL_PREPARING_KEY, next);
          } catch {}
          setStartingPrep(false);
        };

        const handlePartialDelivered = async () => {
          setPartialDelivering(true);
          try {
            const msg = partialAcceptDelivery === 'delivery'
              ? `✅ تم توصيل الأدوية الجزئية إلى عنوانك — شكراً لاستخدامك ميديفلو 💙`
              : `✅ تم تسليم الأدوية الجزئية — شكراً لزيارتك صيدلية ${pharmacyName || 'الصيدلية'} 💙`;
            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: pharmAuthHeaders(),
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: partialAcceptPatientId,
                senderName: pharmacyName || 'الصيدلية',
                message: msg,
              }),
            });
            const next = new Set(Array.from(partialDeliveredIds).concat(selectedNotif.id));
            setPartialDeliveredIds(next);
            saveSet(PARTIAL_DELIVERED_KEY, next);
          } catch {}
          setPartialDelivering(false);
        };

        const cleanMessage = selectedNotif.message
          .replace(/\[patient_id:[^\]]+\]/g, '')
          .replace(/\[pharmacy_phone:[^\]]*\]/g, '')
          .replace(/\[drug_id:[^\]]*\]/g, '')
          .replace(/\[prescription_id:[^\]]+\]/g, '')
          .replace(/\[delivery:[^\]]*\]/g, '')
          .replace(/\[price:[^\]]*\]/g, '')
          .replace(/\[currency:[^\]]*\]/g, '')
          .replace(/\[partial_accept:[^\]]*\]/g, '')
          .replace(/\[dlat:[^\]]*\]/g, '')
          .replace(/\[dlng:[^\]]*\]/g, '')
          .trim();

        const handleConfirm = async () => {
          if (!reservation?.patientId) return;
          setConfirming(true);
          try {
            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: pharmAuthHeaders(),
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: reservation.patientId,
                senderName: pharmacyName || 'الصيدلية',
                message: `✅ تم تأكيد طلبك!\nالدواء "${reservation.drug}" جاهز للاستلام من صيدلية ${pharmacyName || 'الصيدلية'}.\nيمكنك التوجه إليها أو التواصل معهم على رقم الصيدلية ${reservation.pharmacyPhone || pharmacyPhone || ''}.`,
              }),
            });
            const next = new Set(Array.from(confirmedIds).concat(selectedNotif.id));
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
            const pharmacyId = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-id') : null;
            const token      = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-token') : null;

            // Decrement inventory quantity
            if (pharmacyId && token && reservation.drugId) {
              fetch(`${PHARMACY_API}/pharmacies/${pharmacyId}/inventory/decrement`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ drugId: reservation.drugId, qty: reservation.qty }),
              }).catch(() => {});
            }

            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: pharmAuthHeaders(),
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: reservation.patientId,
                senderName: pharmacyName || 'الصيدلية',
                message: `🧾 إيصال استلام\n━━━━━━━━━━━━━━━\nالدواء: ${reservation.drug}\nالكمية: ${reservation.qty} قطعة\nالسعر: ${pricePerUnit.toLocaleString('ar-IQ')} ${reservation.currency} للقطعة\nالإجمالي: ${total.toLocaleString('ar-IQ')} ${reservation.currency}\nالصيدلية: ${pharmacyName || 'الصيدلية'}\nالتاريخ: ${now}\n━━━━━━━━━━━━━━━\nشكراً لاستخدامك ميديفلو 💙`,
              }),
            });
            const next = new Set(Array.from(deliveredIds).concat(selectedNotif.id));
            setDeliveredIds(next);
            saveSet(DELIVERED_KEY, next);
          } catch {}
          setDelivering(false);
        };

        const isRejected = rejectedIds.has(selectedNotif.id);

        const handleReject = async () => {
          if (!reservation?.patientId || !rejectReason.trim()) return;
          setRejecting(true);
          try {
            const fullMsg =
              `❌ نعتذر عن عدم تأكيد طلبك و${rejectReason.trim()}\n\n` +
              `الصيدلية: ${pharmacyName || 'الصيدلية'}\n` +
              `رقم الهاتف: ${pharmacyPhone || '—'}\n` +
              `صحتك تهمنا 💙`;
            await fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: pharmAuthHeaders(),
              body: JSON.stringify({
                portalType: 'patient',
                recipientId: reservation.patientId,
                senderName: pharmacyName || 'الصيدلية',
                message: fullMsg,
              }),
            });
            const next = new Set(Array.from(rejectedIds).concat(selectedNotif.id));
            setRejectedIds(next);
            saveSet('ph-rejected-notifs', next);
            setShowRejectForm(false);
            setRejectReason('');
          } catch {}
          setRejecting(false);
        };

        const handleAcceptPrescription = async () => {
          if (!prescription) return;
          const token = localStorage.getItem('pharmacy-token') || '';
          setAcceptingRx(true);
          try {
            // Use the real /claim endpoint — returns 409 if already claimed
            const claimRes = await fetch(`${PHARMACY_API}/prescriptions/${prescription.id}/claim`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            if (claimRes.status === 409) {
              setRxClaimedBy('صيدلية أخرى');
              setAcceptingRx(false);
              return;
            }
            // Notify patient
            if (prescription.patientId) {
              await fetch(`${PHARMACY_API}/portal-notifications`, {
                method: 'POST',
                headers: pharmAuthHeaders(),
                body: JSON.stringify({
                  portalType: 'patient',
                  recipientId: prescription.patientId,
                  senderName: pharmacyName || 'الصيدلية',
                  message: prescription.delivery === 'delivery'
                    ? `✅ وصفتك الطبية قُبلت!\nصيدلية "${pharmacyName || 'الصيدلية'}" قبلت تحضير وصفتك وسيتم توصيلها إليك قريباً.\nللتواصل: ${pharmacyPhone || '—'}`
                    : `✅ وصفتك الطبية قُبلت!\nصيدلية "${pharmacyName || 'الصيدلية'}" قبلت تحضير وصفتك.\nيمكنك التوجه إليها أو التواصل معهم على رقم: ${pharmacyPhone || '—'}`,
                }),
              });
            }
            const next = new Set(Array.from(acceptedRxIds).concat(prescription.id));
            setAcceptedRxIds(next);
          } catch {}
          setAcceptingRx(false);
        };

        const handlePartialRx = async () => {
          if (!prescription) return;
          setRxModalResponding(true);
          try {
            const lines = Array.from({ length: rxModalDrugCount }, (_, i) => {
              const avail = rxModalDrugSlots[i + 1] !== false;
              return `الدواء ${i + 1}: ${avail ? '✓ متوفر' : '✗ غير متوفر'}`;
            });
            // Claim in backend
            await fetch(`${PHARMACY_API}/prescriptions/${prescription.id}/claim`, {
              method: 'PATCH',
              headers: pharmAuthHeaders(),
              body: JSON.stringify({ pharmacyId: localStorage.getItem('pharmacy-id') }),
            }).catch(() => {});
            if (prescription.patientId) {
              await fetch(`${PHARMACY_API}/portal-notifications`, {
                method: 'POST',
                headers: pharmAuthHeaders(),
                body: JSON.stringify({
                  portalType: 'patient',
                  recipientId: prescription.patientId,
                  senderName: pharmacyName || 'الصيدلية',
                  message: `⚠️ قبول جزئي للوصفة — صيدلية ${pharmacyName || 'الصيدلية'}\n━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━\n${prescription.delivery === 'delivery' ? 'سيتم توصيل الأدوية المتوفرة إليك بعد التأكيد.' : 'يمكنك التوجه للصيدلية لاستلام الأدوية المتوفرة.'}[pharmacy_owner_id:${localStorage.getItem('pharmacy-user-id') || ''}][prescription_id:${prescription.id}][delivery:${prescription.delivery}]`,
                }),
              });
            }
            const next = new Set(Array.from(acceptedRxIds).concat(prescription.id));
            setAcceptedRxIds(next);
            setRxModalMode(null);
            setSelectedNotif(null);
          } catch {}
          setRxModalResponding(false);
        };

        const handleRejectRx = async () => {
          if (!prescription || !rxModalRejectMsg.trim()) return;
          setRxModalResponding(true);
          try {
            if (prescription.patientId) {
              await fetch(`${PHARMACY_API}/portal-notifications`, {
                method: 'POST',
                headers: pharmAuthHeaders(),
                body: JSON.stringify({
                  portalType: 'patient',
                  recipientId: prescription.patientId,
                  senderName: pharmacyName || 'الصيدلية',
                  message: `❌ ملاحظة من صيدلية ${pharmacyName || 'الصيدلية'} بخصوص وصفتك\n━━━━━━━━━━━━━━━\n${rxModalRejectMsg.trim()}\n━━━━━━━━━━━━━━━\nيمكنك البحث عن صيدلية أخرى.`,
                }),
              });
            }
            setRxModalMode(null);
            setRxModalRejectMsg('');
            setSelectedNotif(null);
          } catch {}
          setRxModalResponding(false);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { setSelectedNotif(null); setShowRejectForm(false); setRejectReason(''); setRxClaimedBy(null); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setSelectedNotif(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="font-bold text-gray-900">تفاصيل الإشعار</h2>
              </div>

              {/* Message */}
              <div className={`rounded-xl p-4 mb-4 ${isExpired ? 'bg-red-50 border border-red-200' : prescription ? 'bg-purple-50 border border-purple-200' : reservation ? 'bg-amber-50 border border-amber-200' : 'bg-sky-50'}`}>
                <p className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap">{cleanMessage}</p>
                {prescription && (
                  <div className="mt-3">
                    {rxImageLoading ? (
                      <div className="w-full h-40 bg-purple-100 rounded-xl animate-pulse flex items-center justify-center">
                        <p className="text-xs text-purple-400">جاري تحميل الوصفة...</p>
                      </div>
                    ) : rxImage ? (
                      <img src={rxImage} alt="الوصفة الطبية"
                        className="w-full rounded-xl border border-purple-200 object-contain max-h-64 cursor-zoom-in"
                        onClick={() => setRxImageFullscreen(true)}
                      />
                    ) : (
                      <p className="text-xs text-purple-400 text-center mt-1">لا توجد صورة مرفقة</p>
                    )}
                  </div>
                )}
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
              {isPartialAcceptFromPatient ? (
                isPartialDone ? (
                  <div className="space-y-2">
                    <div className="w-full bg-green-50 border border-green-200 text-green-700 font-semibold py-2.5 rounded-xl text-sm text-center">
                      {partialAcceptDelivery === 'delivery' ? '✅ تم التوصيل — تم إشعار المريض' : '✅ تم التسليم — تم إشعار المريض'}
                    </div>
                    <button onClick={() => setSelectedNotif(null)}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                ) : isPreparing ? (
                  <div className="space-y-2">
                    <div className="w-full bg-sky-50 border border-sky-200 text-sky-700 text-xs text-center py-2 rounded-xl">
                      🔄 جاري تحضير الأدوية — في انتظار {partialAcceptDelivery === 'delivery' ? 'التوصيل' : 'استلام المريض'}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setSelectedNotif(null)}
                        className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                        إغلاق
                      </button>
                      <button onClick={handlePartialDelivered} disabled={partialDelivering}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-1">
                        {partialDelivering ? 'جاري الإرسال...' : (partialAcceptDelivery === 'delivery' ? '🚚 تم التوصيل' : '📦 تم الاستلام')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={handleStartPreparing} disabled={startingPrep || !partialAcceptPatientId}
                      className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                      {startingPrep ? 'جاري الإرسال...' : '🧪 ابدأ تحضير الدواء الجزئي'}
                    </button>
                    <button onClick={() => setSelectedNotif(null)}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                )
              ) : prescription ? (
                isRxExpired ? (
                  /* ── Prescription: timed out ── */
                  <div className="space-y-2">
                    <div className="w-full bg-red-50 border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl text-sm text-center">
                      ⏱ انتهت مدة قبول الوصفة ({rxTimeoutMin} دقيقة)
                    </div>
                    <button onClick={() => { setSelectedNotif(null); setRxClaimedBy(null); }}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                ) : isRxAccepted ? (
                  /* ── Prescription: accepted by this pharmacy ── */
                  <div className="space-y-2">
                    <div className="w-full bg-green-50 border border-green-200 text-green-700 font-semibold py-2.5 rounded-xl text-sm text-center">
                      ✅ قبلت تحضير هذه الوصفة وأُشعر المريض
                    </div>
                    <button onClick={() => { setSelectedNotif(null); setRxClaimedBy(null); }}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                ) : rxClaimedBy ? (
                  /* ── Prescription: already claimed by another pharmacy ── */
                  <div className="space-y-2">
                    <div className="w-full bg-gray-100 border border-gray-200 text-gray-500 font-medium py-2.5 rounded-xl text-sm text-center">
                      تم قبول هذه الوصفة من صيدلية أخرى
                    </div>
                    <button onClick={() => { setSelectedNotif(null); setRxClaimedBy(null); }}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                ) : (
                  /* ── Prescription: available to accept — 3-mode panel ── */
                  <div className="space-y-3">
                    {rxModalMode === null && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={handleAcceptPrescription} disabled={acceptingRx || checkingRxClaim}
                            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-purple-500 hover:bg-purple-600 disabled:opacity-60 text-white text-xs font-bold transition-colors">
                            {acceptingRx || checkingRxClaim
                              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : <CheckCircle className="w-4 h-4" />}
                            قبول كامل
                          </button>
                          <button onClick={() => { setRxModalMode('partial'); setRxModalDrugSlots({}); setRxModalDrugCount(5); }}
                            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors">
                            <AlertTriangle className="w-4 h-4" />
                            قبول جزئي
                          </button>
                          <button onClick={() => { setRxModalMode('reject'); setRxModalRejectMsg(''); }}
                            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors">
                            <MessageSquare className="w-4 h-4" />
                            رفض مع ملاحظة
                          </button>
                        </div>
                        <button onClick={() => { setSelectedNotif(null); setRxClaimedBy(null); setRxModalMode(null); }}
                          className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                          إغلاق
                        </button>
                      </>
                    )}

                    {rxModalMode === 'partial' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <button onClick={() => setRxModalMode(null)} className="text-xs text-gray-500 hover:text-gray-700">← رجوع</button>
                          <p className="text-sm font-bold text-gray-900">توفر الأدوية في الوصفة</p>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                          <span className="text-xs text-gray-500 shrink-0">عدد الأدوية:</span>
                          <div className="flex items-center gap-2 flex-1 justify-end">
                            <button onClick={() => setRxModalDrugCount(c => Math.max(1, c - 1))}
                              className="w-7 h-7 rounded-lg border border-gray-300 flex items-center justify-center font-bold text-gray-600 hover:bg-gray-100">−</button>
                            <span className="text-sm font-bold w-6 text-center">{rxModalDrugCount}</span>
                            <button onClick={() => setRxModalDrugCount(c => Math.min(10, c + 1))}
                              className="w-7 h-7 rounded-lg border border-purple-400 bg-purple-50 flex items-center justify-center font-bold text-purple-600 hover:bg-purple-100">+</button>
                          </div>
                        </div>
                        <div className="rounded-xl overflow-hidden border border-gray-200">
                          {Array.from({ length: rxModalDrugCount }, (_, i) => {
                            const num = i + 1;
                            const avail = rxModalDrugSlots[num] !== false;
                            return (
                              <div key={num} className={`flex items-center justify-between px-4 py-2.5 ${i < rxModalDrugCount - 1 ? 'border-b border-gray-100' : ''}`}>
                                <span className="text-sm text-gray-700 font-medium">الدواء {num}</span>
                                <button onClick={() => setRxModalDrugSlots(prev => ({ ...prev, [num]: !avail }))}
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${avail ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                                  {avail ? <><CheckCircle className="w-3.5 h-3.5" /> متوفر</> : <><X className="w-3.5 h-3.5" /> غير متوفر</>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <button onClick={handlePartialRx} disabled={rxModalResponding}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors">
                          {rxModalResponding ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                          إرسال رد التوفر للمريض
                        </button>
                      </div>
                    )}

                    {rxModalMode === 'reject' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <button onClick={() => setRxModalMode(null)} className="text-xs text-gray-500 hover:text-gray-700">← رجوع</button>
                          <p className="text-sm font-bold text-gray-900">رفض مع ملاحظة</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {['الوصفة غير واضحة', 'الأدوية غير متوفرة', 'الوصفة منتهية الصلاحية', 'يرجى إحضار الوصفة الأصلية'].map(p => (
                            <button key={p} onClick={() => setRxModalRejectMsg(p)}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${rxModalRejectMsg === p ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                              {p}
                            </button>
                          ))}
                        </div>
                        <textarea value={rxModalRejectMsg} onChange={e => setRxModalRejectMsg(e.target.value)} rows={3}
                          placeholder="اكتب ملاحظتك للمريض..."
                          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-300 resize-none" />
                        <button onClick={handleRejectRx} disabled={!rxModalRejectMsg.trim() || rxModalResponding}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
                          {rxModalResponding ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                          إرسال الملاحظة للمريض
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : reservation ? (
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
                ) : isExpired ? (
                  /* ── State 5: timed out / auto-rejected ── */
                  <div className="space-y-3">
                    <div className="w-full bg-red-50 border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl text-sm text-center">
                      ⏱ انتهت مدة الطلب ولم يتم تأكيده
                    </div>
                    <button onClick={() => { setSelectedNotif(null); setShowRejectForm(false); setRejectReason(''); }}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                ) : isRejected ? (
                  /* ── State 4: rejected ── */
                  <div className="space-y-2">
                    <div className="w-full bg-red-50 border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl text-sm text-center">
                      ❌ تم رفض الطلب وإشعار المريض
                    </div>
                    <button onClick={() => { setSelectedNotif(null); setShowRejectForm(false); setRejectReason(''); }}
                      className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                ) : showRejectForm ? (
                  /* ── Reject form ── */
                  <div className="space-y-3">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-xs text-red-600 font-medium mb-2">رسالة الاعتذار للمريض:</p>
                      <p className="text-sm text-gray-700 mb-2">نعتذر عن عدم تأكيد طلبك و</p>
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="أكمل سبب الرفض هنا..."
                        rows={3} dir="rtl"
                        className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white"
                      />
                      <div className="mt-2 text-xs text-gray-500 bg-white rounded-lg px-3 py-2 border border-gray-200">
                        <p>الصيدلية: {pharmacyName || '—'}</p>
                        <p>رقم الهاتف: {pharmacyPhone || '—'}</p>
                        <p>صحتك تهمنا 💙</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                        className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                        إلغاء
                      </button>
                      <button onClick={handleReject} disabled={rejecting || !rejectReason.trim()}
                        className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                        {rejecting ? 'جاري الإرسال...' : 'إرسال الاعتذار'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── State 1: new reservation ── */
                  <div className="space-y-2">
                    <div className="flex gap-3">
                      <button onClick={() => { setSelectedNotif(null); setShowRejectForm(false); }}
                        className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                        إغلاق
                      </button>
                      <button onClick={handleConfirm} disabled={confirming}
                        className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                        {confirming ? 'جاري الإرسال...' : '✓ تأكيد الحجز وإشعار المريض'}
                      </button>
                    </div>
                    <button onClick={() => setShowRejectForm(true)}
                      className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2.5 rounded-xl text-sm font-medium transition-colors">
                      ✗ رفض الطلب
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
