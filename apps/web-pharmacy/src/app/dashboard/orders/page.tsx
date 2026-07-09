'use client';
import { useEffect, useState } from 'react';
import { Search, ShoppingBag, CheckCircle, Clock, Package, Send, X, FileImage, CheckSquare, ChevronDown, ChevronUp, AlertTriangle, MessageSquare } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

function pharmH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('pharmacy-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

interface Reservation {
  id: string;
  drug: string;
  patient: string;
  phone: string;
  qty: number;
  price: string;
  currency: string;
  patientId: string;
  drugId: string;
  deliveryChoice: 'pickup' | 'delivery' | '';
  createdAt: string;
  delivered: boolean;
  confirmed: boolean;
  rejected: boolean;
  expired: boolean;
}

function parseReservation(msg: string, id: string, createdAt: string, deliveredIds: Set<string>, confirmedIds: Set<string>, rejectedIds: Set<string>, timeoutMin: number): Reservation | null {
  if (!msg.includes('طلب حجز جديد')) return null;
  const drug      = msg.match(/الدواء:\s*(.+)/)?.[1]?.trim()           || '';
  const patient   = msg.match(/المريض:\s*(.+)/)?.[1]?.trim()           || '';
  const phone     = msg.match(/الهاتف:\s*(.+)/)?.[1]?.trim()           || '';
  const qtyStr    = msg.match(/الكمية المطلوبة:\s*(\d+)/)?.[1]         || '1';
  const pid       = msg.match(/\[patient_id:([^\]]+)\]/)?.[1]          || '';
  const price     = msg.match(/\[price:([^\]]*)\]/)?.[1]               || '';
  const currency  = msg.match(/\[currency:([^\]]*)\]/)?.[1]            || 'IQD';
  const delivery  = (msg.match(/\[delivery:([^\]]*)\]/)?.[1] || '') as 'pickup' | 'delivery' | '';
  const drugId    = msg.match(/\[drug_id:([^\]]*)\]/)?.[1]             || '';
  const ageMin = (Date.now() - new Date(createdAt).getTime()) / 60000;
  const confirmed = confirmedIds.has(id);
  const delivered = deliveredIds.has(id);
  const rejected  = rejectedIds.has(id);
  const expired   = !confirmed && !delivered && !rejected && ageMin > timeoutMin;
  return { id, drug, patient, phone, qty: Number(qtyStr), price, currency, patientId: pid, drugId, deliveryChoice: delivery, createdAt, delivered, confirmed, rejected, expired };
}

function ViewPrescriptionImage({ prescriptionId }: { prescriptionId: string }) {
  const [imgSrc, setImgSrc] = useState('');
  const [open, setOpen]     = useState(false);
  const load = async () => {
    if (imgSrc) { setOpen(true); return; }
    try {
      const r = await fetch(`${PHARMACY_API}/prescriptions/${prescriptionId}/image`);
      const d = await r.json();
      if (d?.data?.image_base64) {
        setImgSrc(`data:image/jpeg;base64,${d.data.image_base64}`);
        setOpen(true);
      }
    } catch {}
  };
  return (
    <>
      <button onClick={load} className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline mt-2">
        <FileImage className="w-3 h-3" /> عرض صورة الوصفة
      </button>
      {open && imgSrc && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute -top-3 -left-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-gray-700 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
            <img src={imgSrc} alt="وصفة طبية" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}
    </>
  );
}

const DELIVERED_KEY      = 'ph-delivered-notifs';
const CONFIRMED_KEY      = 'ph-confirmed-notifs';
const REJECTED_KEY       = 'ph-rejected-notifs';
const CLAIMED_RX_KEY     = 'pharmacy-claimed-prescriptions';
const RX_DELIVERED_KEY   = 'pharmacy-rx-delivered';
const AUTO_REJECTED_KEY  = 'pharmacy-auto-rejected-orders';
const PLATFORM_API       = 'https://mediflow-production-d815.up.railway.app/api/v1/platform';

// Module-level guard — prevents StrictMode double-effect from firing rejections twice
const inFlightRejections = new Set<string>();

interface PrescriptionRequest {
  notifId: string;
  prescriptionId: string;
  patient: string;
  patientId: string;
  notes: string;
  deliveryChoice: 'pickup' | 'delivery' | '';
  deliveryAddress: string;
  createdAt: string;
  claimed: boolean;
  rxDelivered: boolean;
  externalClaim?: boolean;
}

function parsePrescription(n: any, claimedIds: Set<string>, rxDeliveredIds: Set<string>): PrescriptionRequest | null {
  const msg: string = n.message || '';
  if (!msg.includes('وصفة طبية جديدة')) return null;
  const patient        = msg.match(/المريض:\s*(.+)/)?.[1]?.trim()          || n.sender_name || '—';
  const notes          = msg.match(/ملاحظات:\s*(.+)/)?.[1]?.trim()         || '';
  const prescriptionId = msg.match(/\[prescription_id:([^\]]+)\]/)?.[1]     || '';
  const patientId      = msg.match(/\[patient_id:([^\]]+)\]/)?.[1]          || '';
  const delivery       = (msg.match(/\[delivery:([^\]]*)\]/)?.[1] || '') as 'pickup' | 'delivery' | '';
  const deliveryAddress = msg.match(/العنوان:\s*(.+)/)?.[1]?.trim() || '';
  return { notifId: n.id, prescriptionId, patient, patientId, notes, deliveryChoice: delivery, deliveryAddress, createdAt: n.created_at, claimed: claimedIds.has(n.id), rxDelivered: rxDeliveredIds.has(n.id) };
}

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}

export default function OrdersPage() {
  const [activeTab, setActiveTab]       = useState<'orders' | 'prescriptions'>('orders');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRequest[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState<'all' | 'pending' | 'confirmed' | 'delivered' | 'rejected'>('all');
  const [delivering, setDelivering]     = useState<string | null>(null);
  const [confirming, setConfirming]     = useState<string | null>(null);
  const [rejecting, setRejecting]       = useState<string | null>(null);
  const [claiming, setClaiming]             = useState<string | null>(null);
  const [rxDelivering, setRxDelivering]     = useState<string | null>(null);
  const [rxPanel, setRxPanel]               = useState<string | null>(null);   // expanded notifId
  const [rxActionMode, setRxActionMode]     = useState<'partial' | 'reject' | null>(null);
  const [drugSlots, setDrugSlots]           = useState<Record<number, boolean>>({});   // true=available
  const [drugCount, setDrugCount]           = useState(5);
  const [rejectMsg, setRejectMsg]           = useState('');
  const [rxResponding, setRxResponding]     = useState<string | null>(null);
  const [deliveredIds, setDeliveredIds]     = useState<Set<string>>(new Set());
  const [confirmedIds, setConfirmedIds]     = useState<Set<string>>(new Set());
  const [rejectedIds,  setRejectedIds]      = useState<Set<string>>(new Set());
  const [claimedIds, setClaimedIds]         = useState<Set<string>>(new Set());
  const [rxDeliveredIds, setRxDeliveredIds] = useState<Set<string>>(new Set());
  const [rxExpiredIds, setRxExpiredIds]     = useState<Set<string>>(() => loadSet('pharmacy-rx-auto-expired'));
  const pharmacyName = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-name') || '' : '';

  const loadOrders = () => {
    const dIds = loadSet(DELIVERED_KEY);
    const cIds = loadSet(CONFIRMED_KEY);
    const rIds = loadSet(REJECTED_KEY);
    const rxIds = loadSet(CLAIMED_RX_KEY);
    const rxdIds = loadSet(RX_DELIVERED_KEY);
    setDeliveredIds(dIds);
    setConfirmedIds(cIds);
    setRejectedIds(rIds);
    setClaimedIds(rxIds);
    setRxDeliveredIds(rxdIds);

    const token       = localStorage.getItem('pharmacy-token');
    const pharmacyId  = localStorage.getItem('pharmacy-id');
    const ownerId     = localStorage.getItem('pharmacy-user-id') || localStorage.getItem('pharmacy-owner-id') || '';
    if (!pharmacyId) { setLoading(false); return; }

    const autoRejected: Set<string> = loadSet(AUTO_REJECTED_KEY);

    const RX_AUTO_EXPIRED_KEY       = 'pharmacy-rx-auto-expired';
    const DELIVERY_AUTO_REJECTED_KEY = 'pharmacy-delivery-auto-rejected';

    // Only fetch config from server once per session; use cached values on subsequent loads
    const CONFIG_FETCHED_KEY = 'mediflow-config-fetched-at';
    const lastFetch = Number(localStorage.getItem(CONFIG_FETCHED_KEY) || 0);
    const configStale = Date.now() - lastFetch > 5 * 60 * 1000; // re-fetch every 5 min max

    const configFetches = configStale
      ? [
          fetch(`${PLATFORM_API}/config/auto_reject_minutes`).then(r => r.json()).catch(() => null),
          fetch(`${PLATFORM_API}/config/prescription_reject_minutes`).then(r => r.json()).catch(() => null),
          fetch(`${PLATFORM_API}/config/delivery_timeout_hours`).then(r => r.json()).catch(() => null),
        ]
      : [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null)];

    Promise.all([
      fetch(`${PHARMACY_API}/portal-notifications?portalType=pharmacy&recipientId=${ownerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
      ...configFetches,
    ])
      .then(async ([d, configRes, rxConfigRes, deliveryConfigRes]) => {
        const notifs: any[] = d.data || [];
        const timeoutMin  = Number(configRes?.data?.value  || localStorage.getItem('mediflow-order-timeout-min')   || 10);
        const rxTimeoutMin = Number(rxConfigRes?.data?.value || localStorage.getItem('mediflow-rx-timeout-min')    || 30);
        const deliveryH   = Number(deliveryConfigRes?.data?.value || localStorage.getItem('mediflow-delivery-timeout-h') || 24);

        if (configStale) {
          localStorage.setItem('mediflow-order-timeout-min',  String(timeoutMin));
          localStorage.setItem('mediflow-rx-timeout-min',     String(rxTimeoutMin));
          localStorage.setItem('mediflow-delivery-timeout-h', String(deliveryH));
          localStorage.setItem(CONFIG_FETCHED_KEY, String(Date.now()));
        }

        const now = Date.now();

        const reservParsed = notifs
          .map(n => parseReservation(n.message, n.id, n.created_at, dIds, cIds, rIds, timeoutMin))
          .filter(Boolean) as Reservation[];

        const rxParsedRaw = notifs
          .map(n => parsePrescription(n, rxIds, rxdIds))
          .filter(Boolean) as PrescriptionRequest[];

        // Check backend claim status — at most once per prescription per 5 min to avoid excess calls
        const myPharmacyId = pharmacyId || '';
        const RX_CHECK_KEY = 'mediflow-rx-last-checked';
        const rxChecked: Record<string, number> = JSON.parse(localStorage.getItem(RX_CHECK_KEY) || '{}');
        const rxParsed = await Promise.all(
          rxParsedRaw.map(async rx => {
            if (rx.claimed || rx.rxDelivered || !rx.prescriptionId) return rx;
            const lastChecked = rxChecked[rx.prescriptionId] || 0;
            if (Date.now() - lastChecked < 5 * 60 * 1000) return rx;
            try {
              const d = await fetch(`${PHARMACY_API}/prescriptions/${rx.prescriptionId}`, {
                headers: { Authorization: `Bearer ${token}` },
              }).then(r => r.json());
              rxChecked[rx.prescriptionId] = Date.now();
              if (d?.data?.status === 'claimed') {
                const claimedBy = d.data.claimed_by || '';
                if (claimedBy === myPharmacyId) {
                  rxIds.add(rx.notifId);
                  return { ...rx, claimed: true };
                } else {
                  return { ...rx, claimed: true, externalClaim: true };
                }
              }
            } catch {}
            return rx;
          })
        );
        localStorage.setItem(RX_CHECK_KEY, JSON.stringify(rxChecked));
        localStorage.setItem(CLAIMED_RX_KEY, JSON.stringify(Array.from(rxIds)));

        const currentPharmacyName = localStorage.getItem('pharmacy-name') || 'الصيدلية';

        // ── Rule 1: Auto-reject pending reservations (10 min window) ──────────
        const toKeep: Reservation[] = [];
        for (const r of reservParsed) {
          const isPending = !r.confirmed && !r.delivered && !r.rejected;
          const ageMin = (now - new Date(r.createdAt).getTime()) / 60000;
          const isFreshEnoughToReject = ageMin >= timeoutMin && ageMin < timeoutMin * 3;
          if (isPending && isFreshEnoughToReject && !autoRejected.has(r.id) && !inFlightRejections.has(r.id)) {
            inFlightRejections.add(r.id);
            autoRejected.add(r.id);
            if (r.patientId) {
              fetch(`${PHARMACY_API}/portal-notifications`, {
                method: 'POST', headers: pharmH(),
                body: JSON.stringify({
                  portalType: 'patient', recipientId: r.patientId, senderName: currentPharmacyName,
                  message: `❌ رُفض طلبك تلقائياً\nالدواء: ${r.drug}\nلم تستجب الصيدلية خلال ${timeoutMin} دقيقة.\nنقترح البحث عن صيدلية أخرى.`,
                }),
              }).catch(() => {});
            }
          }
          toKeep.push(r);
        }
        localStorage.setItem(AUTO_REJECTED_KEY, JSON.stringify(Array.from(autoRejected)));

        // ── Rule 2: Auto-expire unclaimed prescriptions (rxTimeoutMin) ────────
        // Patient expiry notification is sent by the PATIENT portal (layout.tsx) — not here,
        // to avoid duplicate notifications when prescription is sent to multiple pharmacies.
        const rxAutoExpired: Set<string> = new Set(JSON.parse(localStorage.getItem(RX_AUTO_EXPIRED_KEY) || '[]'));
        for (const rx of rxParsed) {
          if (rx.claimed || rx.rxDelivered || rxAutoExpired.has(rx.notifId)) continue;
          const ageMin = (now - new Date(rx.createdAt).getTime()) / 60000;
          if (ageMin >= rxTimeoutMin) {
            rxAutoExpired.add(rx.notifId);
          }
        }
        localStorage.setItem(RX_AUTO_EXPIRED_KEY, JSON.stringify(Array.from(rxAutoExpired)));
        setRxExpiredIds(new Set(rxAutoExpired));

        // ── Rule 3: Auto-reject confirmed-but-undelivered orders (deliveryH) ─
        const deliveryAutoRejected: Set<string> = new Set(JSON.parse(localStorage.getItem(DELIVERY_AUTO_REJECTED_KEY) || '[]'));
        for (const r of toKeep) {
          if (!r.confirmed || r.delivered || r.rejected || deliveryAutoRejected.has(r.id)) continue;
          const ageH = (now - new Date(r.createdAt).getTime()) / 3600000;
          if (ageH >= deliveryH) {
            deliveryAutoRejected.add(r.id);
            if (r.patientId) {
              fetch(`${PHARMACY_API}/portal-notifications`, {
                method: 'POST', headers: pharmH(),
                body: JSON.stringify({
                  portalType: 'patient', recipientId: r.patientId, senderName: currentPharmacyName,
                  message: `❌ تم إلغاء طلبك تلقائياً\nالدواء: ${r.drug}\nلم يتم ${r.deliveryChoice === 'delivery' ? 'توصيل' : 'استلام'} طلبك خلال ${deliveryH} ساعة.\nيُنصح بالتواصل مع الصيدلية أو البحث عن صيدلية أخرى.`,
                }),
              }).catch(() => {});
            }
          }
        }
        localStorage.setItem(DELIVERY_AUTO_REJECTED_KEY, JSON.stringify(Array.from(deliveryAutoRejected)));

        setReservations(toKeep);
        setPrescriptions(rxParsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') loadOrders(); };
    const onRxUpdate = () => loadOrders();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('mediflow-rx-update', onRxUpdate);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('mediflow-rx-update', onRxUpdate);
    };
  }, []);

  const saveSet = (key: string, s: Set<string>) => localStorage.setItem(key, JSON.stringify(Array.from(s)));

  const handleConfirm = async (r: Reservation) => {
    setConfirming(r.id);
    try {
      if (r.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: pharmH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: r.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `✅ تم تأكيد طلبك!\nالدواء "${r.drug}" جاهز للاستلام من صيدلية ${pharmacyName || 'الصيدلية'}.`,
          }),
        });
      }
      const next = new Set(Array.from(confirmedIds).concat(r.id));
      setConfirmedIds(next);
      saveSet(CONFIRMED_KEY, next);
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, confirmed: true } : x));
    } catch {}
    setConfirming(null);
  };

  const handleReject = async (r: Reservation) => {
    setRejecting(r.id);
    try {
      if (r.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: pharmH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: r.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `❌ رُفض طلبك\nالدواء: ${r.drug}\nرفضت صيدلية ${pharmacyName || 'الصيدلية'} طلبك.\nنقترح البحث عن صيدلية أخرى.`,
          }),
        });
      }
      const next = new Set(Array.from(rejectedIds).concat(r.id));
      setRejectedIds(next);
      saveSet(REJECTED_KEY, next);
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, rejected: true } : x));
    } catch {}
    setRejecting(null);
  };

  const handleDeliver = async (r: Reservation) => {
    setDelivering(r.id);
    try {
      const pricePerUnit = Number(r.price) || 0;
      const total = pricePerUnit * r.qty;
      const now   = new Date().toLocaleString('ar-IQ');
      const token     = localStorage.getItem('pharmacy-token');
      const pharmacyId = localStorage.getItem('pharmacy-id') || '';

      // Decrement stock quantity
      if (pharmacyId && r.drugId) {
        fetch(`${PHARMACY_API}/${pharmacyId}/inventory/decrement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ drugId: r.drugId, qty: r.qty }),
        }).catch(() => {});
      }

      if (r.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: pharmH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: r.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `🧾 ${r.deliveryChoice === 'delivery' ? 'تم توصيل طلبك' : 'إيصال استلام'}\n━━━━━━━━━━━━━━━\nالدواء: ${r.drug}\nالكمية: ${r.qty} قطعة\nالسعر: ${pricePerUnit.toLocaleString('ar-IQ')} ${r.currency} للقطعة\nالإجمالي: ${total.toLocaleString('ar-IQ')} ${r.currency}\nالصيدلية: ${pharmacyName || 'الصيدلية'}\nالتاريخ: ${now}\n━━━━━━━━━━━━━━━\nشكراً لاستخدامك ميديفلو 💙`,
          }),
        });
      }
      const next = new Set(Array.from(deliveredIds).concat(r.id));
      setDeliveredIds(next);
      saveSet(DELIVERED_KEY, next);
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, delivered: true, confirmed: true } : x));
    } catch {}
    setDelivering(null);
  };

  const handleClaimPrescription = async (rx: PrescriptionRequest) => {
    setClaiming(rx.notifId);
    try {
      // Claim in backend (prevents double-claim)
      if (rx.prescriptionId) {
        await fetch(`${PHARMACY_API}/prescriptions/${rx.prescriptionId}/claim`, {
          method: 'PATCH',
          headers: pharmH(),
          body: JSON.stringify({ pharmacyId: localStorage.getItem('pharmacy-id') }),
        });
      }
      // Notify patient
      if (rx.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: pharmH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: rx.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `✅ قبلت صيدلية ${pharmacyName || 'الصيدلية'} وصفتك الطبية!\nسيتواصلون معك قريباً لتأكيد الطلب وطريقة الاستلام.`,
          }),
        });
      }
      const next = new Set(Array.from(claimedIds).concat(rx.notifId));
      setClaimedIds(next);
      saveSet(CLAIMED_RX_KEY, next);
      // Also store prescriptionId so the notification bell panel can verify this pharmacy accepted it
      if (rx.prescriptionId) {
        try {
          const myAccepted: string[] = JSON.parse(localStorage.getItem('mediflow-my-accepted-rx-ids') || '[]');
          if (!myAccepted.includes(rx.prescriptionId)) {
            myAccepted.push(rx.prescriptionId);
            localStorage.setItem('mediflow-my-accepted-rx-ids', JSON.stringify(myAccepted));
          }
        } catch {}
      }
      setPrescriptions(prev => prev.map(p => p.notifId === rx.notifId ? { ...p, claimed: true } : p));
      window.dispatchEvent(new CustomEvent('mediflow-rx-update'));
    } catch {}
    setClaiming(null);
  };

  const handleDeliverPrescription = async (rx: PrescriptionRequest) => {
    setRxDelivering(rx.notifId);
    try {
      const isDelivery = rx.deliveryChoice === 'delivery';
      const now = new Date().toLocaleString('ar-IQ');
      if (rx.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: pharmH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: rx.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `🧾 ${isDelivery ? 'تم توصيل وصفتك الطبية' : 'وصفتك الطبية جاهزة للاستلام — تم التسليم'}\n━━━━━━━━━━━━━━━\nالصيدلية: ${pharmacyName || 'الصيدلية'}\nالتاريخ: ${now}\n━━━━━━━━━━━━━━━\nشكراً لاستخدامك ميديفلو 💙`,
          }),
        });
      }
      const next = new Set(Array.from(rxDeliveredIds).concat(rx.notifId));
      setRxDeliveredIds(next);
      saveSet(RX_DELIVERED_KEY, next);
      setPrescriptions(prev => prev.map(p => p.notifId === rx.notifId ? { ...p, rxDelivered: true } : p));
      window.dispatchEvent(new CustomEvent('mediflow-rx-update'));
    } catch {}
    setRxDelivering(null);
  };

  const openRxPanel = (notifId: string) => {
    if (rxPanel === notifId) { setRxPanel(null); setRxActionMode(null); setRejectMsg(''); setDrugSlots({}); return; }
    setRxPanel(notifId);
    setRxActionMode(null);
    setRejectMsg('');
    setDrugSlots({});
    setDrugCount(5);
  };

  const handlePartialAccept = async (rx: PrescriptionRequest) => {
    setRxResponding(rx.notifId);
    try {
      // Build drug list
      const lines = Array.from({ length: drugCount }, (_, i) => {
        const avail = drugSlots[i + 1] !== false; // default available unless explicitly set false
        return `الدواء ${i + 1}: ${avail ? '✓ متوفر' : '✗ غير متوفر'}`;
      });
      const hasUnavailable = Object.values(drugSlots).some(v => v === false);

      // Claim in backend
      if (rx.prescriptionId) {
        await fetch(`${PHARMACY_API}/prescriptions/${rx.prescriptionId}/claim`, {
          method: 'PATCH',
          headers: pharmH(),
          body: JSON.stringify({ pharmacyId: localStorage.getItem('pharmacy-id') }),
        });
      }
      if (rx.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: pharmH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: rx.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `⚠️ ${hasUnavailable ? 'قبول جزئي للوصفة' : 'جميع الأدوية متوفرة'} — صيدلية ${pharmacyName || 'الصيدلية'}\n━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━\n${rx.deliveryChoice === 'delivery' ? 'سيتم توصيل الأدوية المتوفرة إليك بعد التأكيد.' : 'يمكنك التوجه للصيدلية لاستلام الأدوية المتوفرة.'}[pharmacy_owner_id:${localStorage.getItem('pharmacy-user-id') || ''}][prescription_id:${rx.prescriptionId || ''}][delivery:${rx.deliveryChoice}]`,
          }),
        });
      }
      const next = new Set(Array.from(claimedIds).concat(rx.notifId));
      setClaimedIds(next);
      saveSet(CLAIMED_RX_KEY, next);
      setPrescriptions(prev => prev.map(p => p.notifId === rx.notifId ? { ...p, claimed: true } : p));
      window.dispatchEvent(new CustomEvent('mediflow-rx-update'));
      setRxPanel(null);
      setRxActionMode(null);
    } catch {}
    setRxResponding(null);
  };

  const handleRejectWithMessage = async (rx: PrescriptionRequest) => {
    if (!rejectMsg.trim()) return;
    setRxResponding(rx.notifId);
    try {
      if (rx.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: pharmH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: rx.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `❌ ملاحظة من صيدلية ${pharmacyName || 'الصيدلية'} بخصوص وصفتك\n━━━━━━━━━━━━━━━\n${rejectMsg.trim()}\n━━━━━━━━━━━━━━━\nيمكنك البحث عن صيدلية أخرى.`,
          }),
        });
      }
      // Mark locally so card shows it was responded to
      const next = new Set(Array.from(rejectedIds).concat(rx.notifId));
      setRejectedIds(next);
      saveSet(REJECTED_KEY + '-rx', next);
      setPrescriptions(prev => prev.map(p => p.notifId === rx.notifId ? { ...p, claimed: true } : p));
      setRxPanel(null);
      setRxActionMode(null);
      setRejectMsg('');
    } catch {}
    setRxResponding(null);
  };

  const filtered = reservations.filter(r => {
    if (search && !r.drug.includes(search) && !r.patient.includes(search) && !r.phone.includes(search)) return false;
    if (filter === 'pending')   return !r.confirmed && !r.delivered && !r.rejected && !r.expired;
    if (filter === 'confirmed') return r.confirmed && !r.delivered;
    if (filter === 'delivered') return r.delivered;
    if (filter === 'rejected')  return r.rejected;
    return true;
  });

  const counts = {
    all: reservations.length,
    pending: reservations.filter(r => !r.confirmed && !r.delivered && !r.rejected && !r.expired).length,
    confirmed: reservations.filter(r => r.confirmed && !r.delivered).length,
    delivered: reservations.filter(r => r.delivered).length,
    rejected: reservations.filter(r => r.rejected).length,
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">الطلبات</h2>
        <span className="text-sm text-gray-500">{activeTab === 'orders' ? `${filtered.length} طلب` : `${prescriptions.length} وصفة`}</span>
      </div>

      {/* Main tab switcher */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
        <button onClick={() => setActiveTab('orders')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}>
          <ShoppingBag className="w-4 h-4" /> طلبات الحجز
          {reservations.filter(r => !r.confirmed && !r.delivered).length > 0 && (
            <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{reservations.filter(r => !r.confirmed && !r.delivered).length}</span>
          )}
        </button>
        <button onClick={() => setActiveTab('prescriptions')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'prescriptions' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}>
          <FileImage className="w-4 h-4" /> وصفات طبية
          {prescriptions.filter(p => !p.claimed && !rxExpiredIds.has(p.notifId)).length > 0 && (
            <span className="bg-sky-500 text-white text-xs px-1.5 py-0.5 rounded-full">{prescriptions.filter(p => !p.claimed && !rxExpiredIds.has(p.notifId)).length}</span>
          )}
        </button>
      </div>

      {/* ══ PRESCRIPTIONS TAB ══ */}
      {activeTab === 'prescriptions' && (
        loading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="bg-white rounded-2xl p-5 animate-pulse h-28" />)}</div>
        ) : prescriptions.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <FileImage className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">لا توجد وصفات طبية</p>
            <p className="text-gray-400 text-sm mt-1">ستظهر هنا الوصفات الطبية من المرضى القريبين</p>
          </div>
        ) : (
          <div className="space-y-3">
            {prescriptions.map(rx => {
              const isExpired = rxExpiredIds.has(rx.notifId) && !rx.claimed && !rx.rxDelivered;
              return (
              <div key={rx.notifId} className={`bg-white rounded-2xl shadow-sm border-r-4 overflow-hidden ${rx.rxDelivered ? 'border-green-500' : rx.claimed ? 'border-blue-400' : isExpired ? 'border-gray-300' : 'border-sky-400'}`}>
                {/* Card header */}
                <div className="p-4 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${rx.rxDelivered ? 'bg-green-100' : rx.claimed ? 'bg-blue-100' : isExpired ? 'bg-gray-100' : 'bg-sky-100'}`}>
                    <FileImage className={`w-5 h-5 ${rx.rxDelivered ? 'text-green-600' : rx.claimed ? 'text-blue-600' : isExpired ? 'text-gray-400' : 'text-sky-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold text-gray-900">وصفة طبية</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${rx.rxDelivered ? 'bg-green-100 text-green-700' : rx.externalClaim ? 'bg-gray-100 text-gray-500' : rx.claimed ? 'bg-blue-100 text-blue-700' : isExpired ? 'bg-gray-100 text-gray-500' : 'bg-sky-100 text-sky-700'}`}>
                        {rx.rxDelivered ? 'تم التسليم ✓' : rx.externalClaim ? 'قُبلت من صيدلية أخرى' : rx.claimed ? 'مقبولة' : isExpired ? 'منتهية ⏱' : 'جديدة'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5 mt-1">
                      <p>المريض: <span className="text-gray-700 font-medium">{rx.patient}</span></p>
                      {rx.deliveryChoice && (
                        <p className={`font-medium ${rx.deliveryChoice === 'delivery' ? 'text-sky-600' : 'text-gray-700'}`}>
                          {rx.deliveryChoice === 'delivery' ? '🚚 توصيل للمنزل' : '🏪 استلام من الصيدلية'}
                        </p>
                      )}
                      {rx.deliveryChoice === 'delivery' && rx.deliveryAddress && (
                        <p className="text-xs text-gray-600 bg-sky-50 rounded-lg px-2 py-1">📍 {rx.deliveryAddress}</p>
                      )}
                      {rx.notes && <p>ملاحظات: <span className="text-gray-700">{rx.notes}</span></p>}
                    </div>
                    {rx.prescriptionId && <ViewPrescriptionImage prescriptionId={rx.prescriptionId} />}
                    <p className="text-xs text-gray-400 mt-2">{new Date(rx.createdAt).toLocaleString('ar-IQ')}</p>
                  </div>
                </div>

                {/* Deliver button (after claim) */}
                {rx.claimed && !rx.rxDelivered && (
                  <div className="px-4 pb-4">
                    <button onClick={() => handleDeliverPrescription(rx)} disabled={rxDelivering === rx.notifId}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
                      {rxDelivering === rx.notifId
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <CheckCircle className="w-4 h-4" />}
                      {rx.deliveryChoice === 'delivery' ? 'تم التوصيل للمريض' : rx.deliveryChoice === 'pickup' ? 'تم استلام المريض' : 'تم التسليم'}
                    </button>
                  </div>
                )}

                {/* Action panel toggle (only on unclaimed, non-expired prescriptions) */}
                {!rx.claimed && !rx.rxDelivered && !isExpired && (
                  <div className="border-t border-gray-100">
                    {/* Toggle bar */}
                    <button onClick={() => openRxPanel(rx.notifId)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                      <span className="font-medium">الرد على الوصفة</span>
                      {rxPanel === rx.notifId
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {rxPanel === rx.notifId && (
                      <div className="px-4 pb-4 space-y-3 bg-gray-50 border-t border-gray-100">

                        {/* Mode selector */}
                        {rxActionMode === null && (
                          <div className="pt-3 grid grid-cols-3 gap-2">
                            <button onClick={() => handleClaimPrescription(rx)} disabled={claiming === rx.notifId}
                              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-xs font-medium transition-colors">
                              {claiming === rx.notifId
                                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <CheckSquare className="w-4 h-4" />}
                              قبول كامل
                            </button>
                            <button onClick={() => setRxActionMode('partial')}
                              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors">
                              <AlertTriangle className="w-4 h-4" />
                              قبول جزئي
                            </button>
                            <button onClick={() => setRxActionMode('reject')}
                              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors">
                              <MessageSquare className="w-4 h-4" />
                              رفض مع ملاحظة
                            </button>
                          </div>
                        )}

                        {/* ── PARTIAL ACCEPT ── */}
                        {rxActionMode === 'partial' && (
                          <div className="pt-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <button onClick={() => setRxActionMode(null)} className="text-xs text-gray-500 hover:text-gray-700">← رجوع</button>
                              <p className="text-sm font-bold text-gray-900">توفر الأدوية في الوصفة</p>
                            </div>

                            {/* Drug count selector */}
                            <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2">
                              <span className="text-xs text-gray-500 shrink-0">عدد الأدوية في الوصفة:</span>
                              <div className="flex items-center gap-2 flex-1 justify-end">
                                <button onClick={() => setDrugCount(c => Math.max(1, c - 1))}
                                  className="w-7 h-7 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-50">−</button>
                                <span className="text-sm font-bold w-6 text-center">{drugCount}</span>
                                <button onClick={() => setDrugCount(c => Math.min(10, c + 1))}
                                  className="w-7 h-7 rounded-lg border border-sky-400 bg-sky-50 flex items-center justify-center text-sky-600 font-bold hover:bg-sky-100">+</button>
                              </div>
                            </div>

                            {/* Drug availability toggles */}
                            <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
                              {Array.from({ length: drugCount }, (_, i) => {
                                const num = i + 1;
                                const avail = drugSlots[num] !== false;
                                return (
                                  <div key={num} className={`flex items-center justify-between px-4 py-2.5 ${i < drugCount - 1 ? 'border-b border-gray-100' : ''}`}>
                                    <span className="text-sm text-gray-700 font-medium">الدواء {num}</span>
                                    <button onClick={() => setDrugSlots(prev => ({ ...prev, [num]: !avail }))}
                                      className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold transition-all ${avail ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                                      {avail ? <><CheckCircle className="w-3.5 h-3.5" /> متوفر</> : <><X className="w-3.5 h-3.5" /> غير متوفر</>}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            <button onClick={() => handlePartialAccept(rx)} disabled={rxResponding === rx.notifId}
                              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors">
                              {rxResponding === rx.notifId
                                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <Send className="w-4 h-4" />}
                              إرسال رد التوفر للمريض
                            </button>
                          </div>
                        )}

                        {/* ── REJECT WITH MESSAGE ── */}
                        {rxActionMode === 'reject' && (
                          <div className="pt-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <button onClick={() => setRxActionMode(null)} className="text-xs text-gray-500 hover:text-gray-700">← رجوع</button>
                              <p className="text-sm font-bold text-gray-900">رفض مع ملاحظة للمريض</p>
                            </div>

                            {/* Quick presets */}
                            <div className="flex gap-2 flex-wrap">
                              {['الوصفة غير واضحة', 'الأدوية غير متوفرة حالياً', 'الوصفة منتهية الصلاحية', 'يرجى إحضار الوصفة الأصلية'].map(preset => (
                                <button key={preset} onClick={() => setRejectMsg(preset)}
                                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${rejectMsg === preset ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                  {preset}
                                </button>
                              ))}
                            </div>

                            <textarea value={rejectMsg} onChange={e => setRejectMsg(e.target.value)} rows={3}
                              placeholder="اكتب ملاحظتك للمريض هنا..."
                              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-300 resize-none bg-white" />

                            <button onClick={() => handleRejectWithMessage(rx)} disabled={!rejectMsg.trim() || rxResponding === rx.notifId}
                              className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
                              {rxResponding === rx.notifId
                                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <Send className="w-4 h-4" />}
                              إرسال الملاحظة للمريض
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );})}
          </div>
        )
      )}

      {/* ══ ORDERS TAB ══ */}
      {activeTab === 'orders' && <>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'all',       label: 'الكل',        color: 'bg-gray-100 text-gray-700' },
          { key: 'pending',   label: 'معلّق',        color: 'bg-amber-100 text-amber-700' },
          { key: 'confirmed', label: 'مؤكد',         color: 'bg-blue-100 text-blue-700' },
          { key: 'delivered', label: 'تم التسليم',   color: 'bg-green-100 text-green-700' },
          { key: 'rejected',  label: 'مرفوض',        color: 'bg-red-100 text-red-700' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.key ? f.color + ' ring-2 ring-offset-1 ring-current' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
            {f.label}
            <span className="mr-1.5 bg-white/60 text-current text-xs px-1.5 py-0.5 rounded-full">{counts[f.key]}</span>
          </button>
        ))}
        <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 min-w-40">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالدواء أو المريض..."
            className="bg-transparent flex-1 outline-none text-sm" />
        </div>
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-5 animate-pulse h-28" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">لا توجد طلبات</p>
          <p className="text-gray-400 text-sm mt-1">تظهر هنا طلبات الحجز من المرضى</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className={`bg-white rounded-2xl shadow-sm border-r-4 overflow-hidden ${r.delivered ? 'border-green-400' : r.rejected ? 'border-red-400' : r.expired ? 'border-gray-300' : r.confirmed ? 'border-blue-400' : 'border-amber-400'}`}>
              <div className="p-4 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.delivered ? 'bg-green-100' : r.rejected ? 'bg-red-100' : r.expired ? 'bg-gray-100' : r.confirmed ? 'bg-blue-100' : 'bg-amber-100'}`}>
                  {r.delivered ? <CheckCircle className="w-5 h-5 text-green-600" />
                    : r.rejected ? <X className="w-5 h-5 text-red-500" />
                    : r.expired ? <Clock className="w-5 h-5 text-gray-400" />
                    : r.confirmed ? <Package className="w-5 h-5 text-blue-600" />
                    : <Clock className="w-5 h-5 text-amber-600" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-bold text-gray-900 truncate">{r.drug}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${r.delivered ? 'bg-green-100 text-green-700' : r.rejected ? 'bg-red-100 text-red-700' : r.expired ? 'bg-gray-100 text-gray-500' : r.confirmed ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {r.delivered ? 'تم التسليم' : r.rejected ? 'مرفوض' : r.expired ? '⏱ منتهي' : r.confirmed ? 'مؤكد' : 'معلّق'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                    <span>المريض: <span className="text-gray-700 font-medium">{r.patient}</span></span>
                    <span>الهاتف: <span className="text-gray-700 font-medium" dir="ltr">{r.phone}</span></span>
                    <span>الكمية: <span className="text-gray-700 font-medium">{r.qty} قطعة</span></span>
                    <span>السعر: <span className={`font-medium ${Number(r.price) > 0 ? 'text-sky-600' : 'text-gray-400'}`}>{Number(r.price) > 0 ? `${Number(r.price).toLocaleString('ar-IQ')} ${r.currency}` : 'غير محدد'}</span></span>
                    {r.deliveryChoice && (
                      <span className="col-span-2">الاستلام: <span className={`font-medium ${r.deliveryChoice === 'delivery' ? 'text-sky-600' : 'text-gray-700'}`}>{r.deliveryChoice === 'delivery' ? '🚚 توصيل للمنزل' : '🏪 استلام من الصيدلية'}</span></span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{new Date(r.createdAt).toLocaleString('ar-IQ')}</p>
                </div>
              </div>

              {/* Action buttons */}
              {!r.delivered && !r.rejected && !r.expired && (
                <div className="px-4 pb-4 flex gap-2">
                  {!r.confirmed && (
                    <>
                    <button onClick={() => handleConfirm(r)} disabled={confirming === r.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
                      {confirming === r.id
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Send className="w-4 h-4" />}
                      تأكيد الطلب
                    </button>
                    <button onClick={() => handleReject(r)} disabled={rejecting === r.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
                      {rejecting === r.id
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <X className="w-4 h-4" />}
                      رفض الطلب
                    </button>
                    </>
                  )}
                  <button onClick={() => handleDeliver(r)} disabled={delivering === r.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
                    {delivering === r.id
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <CheckCircle className="w-4 h-4" />}
                    {r.deliveryChoice === 'delivery' ? 'تم التوصيل' : r.deliveryChoice === 'pickup' ? 'تم الاستلام' : 'تم التسليم'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </>}
    </div>
  );
}
