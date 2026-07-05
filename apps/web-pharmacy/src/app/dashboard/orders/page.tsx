'use client';
import { useEffect, useState } from 'react';
import { Search, ShoppingBag, CheckCircle, Clock, Package, Send, X, FileImage, CheckSquare } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

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
  createdAt: string;
  claimed: boolean;
}

function parsePrescription(n: any, claimedIds: Set<string>): PrescriptionRequest | null {
  const msg: string = n.message || '';
  if (!msg.includes('وصفة طبية جديدة')) return null;
  const patient        = msg.match(/المريض:\s*(.+)/)?.[1]?.trim()          || n.sender_name || '—';
  const notes          = msg.match(/ملاحظات:\s*(.+)/)?.[1]?.trim()         || '';
  const prescriptionId = msg.match(/\[prescription_id:([^\]]+)\]/)?.[1]     || '';
  const patientId      = msg.match(/\[patient_id:([^\]]+)\]/)?.[1]          || '';
  return { notifId: n.id, prescriptionId, patient, patientId, notes, createdAt: n.created_at, claimed: claimedIds.has(n.id) };
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
  const [claiming, setClaiming]         = useState<string | null>(null);
  const [deliveredIds, setDeliveredIds] = useState<Set<string>>(new Set());
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [rejectedIds,  setRejectedIds]  = useState<Set<string>>(new Set());
  const [claimedIds, setClaimedIds]     = useState<Set<string>>(new Set());
  const pharmacyName = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-name') || '' : '';

  useEffect(() => {
    const dIds = loadSet(DELIVERED_KEY);
    const cIds = loadSet(CONFIRMED_KEY);
    const rIds = loadSet(REJECTED_KEY);
    const rxIds = loadSet(CLAIMED_RX_KEY);
    setDeliveredIds(dIds);
    setConfirmedIds(cIds);
    setRejectedIds(rIds);
    setClaimedIds(rxIds);

    const token       = localStorage.getItem('pharmacy-token');
    const pharmacyId  = localStorage.getItem('pharmacy-id');
    const ownerId     = localStorage.getItem('pharmacy-user-id') || localStorage.getItem('pharmacy-owner-id') || '';
    if (!pharmacyId) { setLoading(false); return; }

    const autoRejected: Set<string> = loadSet(AUTO_REJECTED_KEY);

    Promise.all([
      fetch(`${PHARMACY_API}/portal-notifications?portalType=pharmacy&recipientId=${ownerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
      fetch(`${PLATFORM_API}/config/auto_reject_minutes`).then(r => r.json()).catch(() => ({ data: { value: '10' } })),
    ])
      .then(async ([d, configRes]) => {
        const notifs: any[] = d.data || [];
        const timeoutMin = Number(configRes?.data?.value || 10);
        const now = Date.now();

        const reservParsed = notifs
          .map(n => parseReservation(n.message, n.id, n.created_at, dIds, cIds, rIds, timeoutMin))
          .filter(Boolean) as Reservation[];

        const rxParsed = notifs
          .map(n => parsePrescription(n, rxIds))
          .filter(Boolean) as PrescriptionRequest[];

        // Auto-reject timed-out pending reservations
        const currentPharmacyName = localStorage.getItem('pharmacy-name') || 'الصيدلية';
        const toKeep: Reservation[] = [];
        for (const r of reservParsed) {
          const isPending = !r.confirmed && !r.delivered;
          const ageMin = (now - new Date(r.createdAt).getTime()) / 60000;
          if (isPending && ageMin >= timeoutMin && !autoRejected.has(r.id) && !inFlightRejections.has(r.id)) {
            inFlightRejections.add(r.id);
            autoRejected.add(r.id);
            // Notify the patient
            if (r.patientId) {
              fetch(`${PHARMACY_API}/portal-notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  portalType: 'patient',
                  recipientId: r.patientId,
                  senderName: currentPharmacyName,
                  message: `❌ رُفض طلبك تلقائياً\nالدواء: ${r.drug}\nلم تستجب الصيدلية خلال ${timeoutMin} دقيقة.\nنقترح البحث عن صيدلية أخرى.`,
                }),
              }).catch(() => {});
            }
          } else {
            toKeep.push(r);
          }
        }
        localStorage.setItem(AUTO_REJECTED_KEY, JSON.stringify(Array.from(autoRejected)));

        setReservations(toKeep);
        setPrescriptions(rxParsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveSet = (key: string, s: Set<string>) => localStorage.setItem(key, JSON.stringify(Array.from(s)));

  const handleConfirm = async (r: Reservation) => {
    setConfirming(r.id);
    try {
      if (r.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: r.patientId,
            senderName: pharmacyName || 'الصيدلية',
            message: `🧾 إيصال استلام\n━━━━━━━━━━━━━━━\nالدواء: ${r.drug}\nالكمية: ${r.qty} قطعة\nالسعر: ${pricePerUnit.toLocaleString('ar-IQ')} ${r.currency} للقطعة\nالإجمالي: ${total.toLocaleString('ar-IQ')} ${r.currency}\nالصيدلية: ${pharmacyName || 'الصيدلية'}\nالتاريخ: ${now}\n━━━━━━━━━━━━━━━\nشكراً لاستخدامك ميديفلو 💙`,
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pharmacyId: localStorage.getItem('pharmacy-id') }),
        });
      }
      // Notify patient
      if (rx.patientId) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      setPrescriptions(prev => prev.map(p => p.notifId === rx.notifId ? { ...p, claimed: true } : p));
    } catch {}
    setClaiming(null);
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
          {prescriptions.filter(p => !p.claimed).length > 0 && (
            <span className="bg-sky-500 text-white text-xs px-1.5 py-0.5 rounded-full">{prescriptions.filter(p => !p.claimed).length}</span>
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
            {prescriptions.map(rx => (
              <div key={rx.notifId} className={`bg-white rounded-2xl shadow-sm border-r-4 overflow-hidden ${rx.claimed ? 'border-green-400' : 'border-sky-400'}`}>
                <div className="p-4 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${rx.claimed ? 'bg-green-100' : 'bg-sky-100'}`}>
                    <FileImage className={`w-5 h-5 ${rx.claimed ? 'text-green-600' : 'text-sky-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold text-gray-900">وصفة طبية</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${rx.claimed ? 'bg-green-100 text-green-700' : 'bg-sky-100 text-sky-700'}`}>
                        {rx.claimed ? 'تم القبول' : 'جديدة'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5 mt-1">
                      <p>المريض: <span className="text-gray-700 font-medium">{rx.patient}</span></p>
                      {rx.notes && <p>ملاحظات: <span className="text-gray-700">{rx.notes}</span></p>}
                    </div>
                    {rx.prescriptionId && (
                      <ViewPrescriptionImage prescriptionId={rx.prescriptionId} />
                    )}
                    <p className="text-xs text-gray-400 mt-2">{new Date(rx.createdAt).toLocaleString('ar-IQ')}</p>
                  </div>
                </div>
                {!rx.claimed && (
                  <div className="px-4 pb-4">
                    <button onClick={() => handleClaimPrescription(rx)} disabled={claiming === rx.notifId}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
                      {claiming === rx.notifId
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <CheckSquare className="w-4 h-4" />}
                      قبول الوصفة والتواصل مع المريض
                    </button>
                  </div>
                )}
              </div>
            ))}
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
                    تم التسليم
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
