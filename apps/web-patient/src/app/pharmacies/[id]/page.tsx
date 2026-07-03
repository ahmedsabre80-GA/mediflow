'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Phone, Star, Truck, ArrowRight, Package, ShoppingCart, CheckCircle, X, User } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

function PharmacyDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const drugId = searchParams.get('drug');

  const [pharmacy,      setPharmacy]      = useState<any>(null);
  const [inventory,     setInventory]     = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [phone,         setPhone]         = useState('');
  const [reserving,     setReserving]     = useState(false);
  const [reserved,      setReserved]      = useState(false);
  const [reserveError,  setReserveError]  = useState('');
  const [patientName,   setPatientName]   = useState('');
  const [patientId,     setPatientId]     = useState('');
  const [orderQty,      setOrderQty]      = useState(1);
  const [deliveryChoice, setDeliveryChoice] = useState<'pickup' | 'delivery'>('pickup');

  useEffect(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('mediflow-auth') || '{}');
      const user = auth.state?.user;
      setPatientName(user?.name || user?.email?.split('@')[0] || 'مريض');
      setPatientId(user?.id || '');
    } catch {}

    const token = (() => { try { return JSON.parse(localStorage.getItem('mediflow-auth') || '{}').state?.accessToken; } catch { return null; } })();
    const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch(`${PHARMACY_API}/pharmacies/${id}`).then(r => r.json()),
      fetch(`${PHARMACY_API}/pharmacies/${id}/public-inventory`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([pharmData, invData]) => {
      setPharmacy(pharmData.data);
      setInventory(invData.data || []);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleReserve = async () => {
    if (!phone.trim()) { setReserveError('أدخل رقم هاتفك'); return; }
    if (!/^07[0-9]{9}$/.test(phone.replace(/\s/g, ''))) { setReserveError('أدخل رقم هاتف عراقي صحيح (07XXXXXXXXX)'); return; }
    setReserving(true);
    setReserveError('');
    try {
      const drug = focusedDrug;
      const drugName = drug?.generic_name || drug?.brand_name || 'دواء';
      const pharmName = pharmacy?.name_ar || pharmacy?.name || 'صيدلية';

      // 1. Notify pharmacy with patient details
      await fetch(`${PHARMACY_API}/pharmacies/portal-notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'pharmacy',
          recipientId: pharmacy.owner_id,
          senderName: patientName,
          message: `🔔 طلب حجز جديد\nالدواء: ${drugName}\nالمريض: ${patientName}\nالهاتف: ${phone.trim()}\nالكمية المطلوبة: ${orderQty}\nطريقة الاستلام: ${deliveryChoice === 'delivery' ? '🚚 توصيل للمنزل' : '🏪 استلام من الصيدلية'}\n[patient_id:${patientId}][pharmacy_phone:${pharmacy.phone || ''}][price:${drug.selling_price || 0}][currency:${drug.currency || 'IQD'}][drug_id:${drug.drug_id || ''}][delivery:${deliveryChoice}]`,
        }),
      });

      // 2. Notify patient with confirmation
      if (patientId) {
        await fetch(`${PHARMACY_API}/pharmacies/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: patientId,
            senderName: pharmName,
            message: `📋 تم استلام طلب حجزك!\nالدواء: ${drugName}\nالكمية: ${orderQty} قطعة\nالصيدلية: ${pharmName}\nسيتواصل معك الصيدلاني على الرقم ${phone.trim()} بعد تأكيد الطلب.\n[pharmacy_owner_id:${pharmacy.owner_id}][pharmacy_id:${pharmacy.id}]`,
          }),
        });
      }

      setReserved(true);
      setShowModal(false);
    } catch {
      setReserveError('حدث خطأ أثناء الإرسال. حاول مرة أخرى.');
    } finally {
      setReserving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!pharmacy) return (
    <div className="text-center py-20 text-gray-500" dir="rtl">
      <p>الصيدلية غير موجودة</p>
      <button onClick={() => router.back()} className="mt-4 text-sky-600 hover:underline">العودة</button>
    </div>
  );

  const focusedDrug = drugId ? inventory.find((i: any) => i.drug_id === drugId) : null;
  const otherDrugs = focusedDrug
    ? inventory.filter((i: any) => i.drug_id !== drugId && i.category && i.category === focusedDrug.category)
    : inventory;
  const hasDelivery = pharmacy.delivery_rate_per_km > 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-8" dir="rtl">

      {/* Header */}
      <div className="bg-sky-500 text-white px-4 py-6 pt-12">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sky-200 mb-4 hover:text-white">
          <ArrowRight className="w-5 h-5" /><span className="text-sm">العودة</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">🏥</div>
          <div>
            <h1 className="text-xl font-bold">{pharmacy.name_ar || pharmacy.name}</h1>
            {pharmacy.address && (
              <p className="text-sky-200 text-sm mt-1 flex items-center gap-1">
                <MapPin className="w-4 h-4" />{pharmacy.address}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info strip */}
      <div className="px-4 py-3 grid grid-cols-3 gap-3 -mt-3">
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-sm font-bold text-gray-900 flex items-center justify-center gap-1">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />{parseFloat(pharmacy.rating || 0).toFixed(1)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">التقييم</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-sm font-bold text-green-600">مفتوح</p>
          <p className="text-xs text-gray-500 mt-0.5">الحالة</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className={`text-sm font-bold flex items-center justify-center gap-1 ${hasDelivery ? 'text-sky-600' : 'text-gray-400'}`}>
            <Truck className="w-3.5 h-3.5" />{hasDelivery ? 'متاح' : 'غير متاح'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">توصيل</p>
        </div>
      </div>

      {/* Phone hidden — revealed in notification after reservation */}

      {/* ── FOCUSED DRUG ── */}
      {focusedDrug && (
        <div className="px-4 mb-5">
          <h2 className="font-bold text-gray-900 mb-3 text-base">الدواء الذي بحثت عنه</h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border-2 border-sky-200">
            <div className="px-4 pt-4 pb-3 flex items-start gap-3">
              <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center text-3xl shrink-0">💊</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{focusedDrug.generic_name || '—'}</p>
                {focusedDrug.brand_name && <p className="text-sm text-gray-500 mt-0.5">{focusedDrug.brand_name}</p>}
                {focusedDrug.dosage_form && <p className="text-xs text-gray-400 mt-0.5">{focusedDrug.dosage_form}{focusedDrug.strength ? ` · ${focusedDrug.strength}` : ''}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px bg-gray-100 border-t">
              <div className="bg-white px-4 py-3">
                <p className="text-xs text-gray-500 mb-0.5">الكمية المتوفرة</p>
                <p className="font-bold text-gray-900">{focusedDrug.quantity} <span className="text-xs font-normal text-gray-500">قطعة</span></p>
              </div>
              <div className="bg-white px-4 py-3">
                <p className="text-xs text-gray-500 mb-0.5">السعر</p>
                <p className="font-bold text-sky-600">{Number(focusedDrug.selling_price).toLocaleString('ar-IQ')} <span className="text-xs font-normal">{focusedDrug.currency || 'IQD'} للقطعة الواحدة</span></p>
              </div>
              {focusedDrug.origin_country && (
                <div className="bg-white px-4 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">بلد المنشأ</p>
                  <p className="font-medium text-gray-900 text-sm">{focusedDrug.origin_country}</p>
                </div>
              )}
              <div className="bg-white px-4 py-3">
                <p className="text-xs text-gray-500 mb-0.5">التوصيل</p>
                <p className={`font-medium text-sm ${hasDelivery ? 'text-green-600' : 'text-gray-400'}`}>
                  {hasDelivery ? `✓ متاح — ${pharmacy.delivery_rate_per_km} IQD/كم` : '✗ غير متاح'}
                </p>
              </div>
              {focusedDrug.expiry_date && (
                <div className="bg-white px-4 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">تاريخ الصلاحية</p>
                  <p className="font-medium text-gray-900 text-sm">{new Date(focusedDrug.expiry_date).toLocaleDateString('ar-IQ')}</p>
                </div>
              )}
            </div>

            {/* Reserve button */}
            <div className="px-4 py-4">
              {reserved ? (
                <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-2xl py-3.5">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-green-700">تم إرسال طلب الحجز! ستتواصل معك الصيدلية قريباً</p>
                </div>
              ) : (
                <button
                  onClick={() => { setShowModal(true); setReserveError(''); setOrderQty(1); }}
                  disabled={focusedDrug.quantity === 0}
                  className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-colors flex items-center justify-center gap-2 text-base shadow">
                  {focusedDrug.quantity === 0
                    ? <><Package className="w-5 h-5" /> غير متوفر</>
                    : <><ShoppingCart className="w-5 h-5" /> احجز الآن</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── OTHER DRUGS ── */}
      {otherDrugs.length > 0 && (
        <div className="px-4">
          <h2 className="font-bold text-gray-900 mb-3 text-base flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-500" />
            {focusedDrug
              ? (focusedDrug.category ? `أدوية مشابهة — ${focusedDrug.category} (${otherDrugs.length})` : `أدوية من نفس الصيدلية (${otherDrugs.length})`)
              : `الأدوية المتوفرة (${otherDrugs.length})`}
          </h2>
          <div className="space-y-3">
            {otherDrugs.map((item: any) => (
              <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
                <div className="w-11 h-11 bg-sky-50 rounded-xl flex items-center justify-center text-xl shrink-0">💊</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{item.generic_name || '—'}</p>
                  {item.brand_name && <p className="text-xs text-gray-500">{item.brand_name}</p>}
                  {item.origin_country && <p className="text-xs text-gray-400">{item.origin_country}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sky-600 text-sm">{Number(item.selling_price).toLocaleString('ar-IQ')} د.ع</p>
                  <p className="text-xs text-green-600 mt-0.5">متوفر ({item.quantity})</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!focusedDrug && inventory.length === 0 && (
        <div className="px-4 text-center py-12 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p>لا توجد أدوية مسجلة لهذه الصيدلية</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          RESERVATION MODAL
      ══════════════════════════════════════════════ */}
      {showModal && focusedDrug && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            {/* Modal header — stays visible */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b shrink-0">
              <h3 className="font-bold text-gray-900 text-lg">تأكيد الحجز</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              {/* Drug summary */}
              <div className="bg-sky-50 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">💊</span>
                <div>
                  <p className="font-bold text-sky-900 text-sm">{focusedDrug.generic_name}</p>
                  {focusedDrug.brand_name && <p className="text-xs text-sky-600">{focusedDrug.brand_name}</p>}
                  <p className="text-xs text-sky-700 mt-0.5 font-medium">{Number(focusedDrug.selling_price).toLocaleString('ar-IQ')} {focusedDrug.currency || 'IQD'}</p>
                </div>
              </div>

              {/* Patient name (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <User className="w-4 h-4" /> اسمك
                </label>
                <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
                  {patientName}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الكمية المطلوبة *</label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setOrderQty(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 active:bg-gray-100">−</button>
                  <span className="flex-1 text-center text-xl font-bold text-gray-900">{orderQty}</span>
                  <button type="button"
                    onClick={() => setOrderQty(q => Math.min(focusedDrug?.quantity || 99, q + 1))}
                    className="w-10 h-10 rounded-xl border border-sky-400 bg-sky-50 flex items-center justify-center text-lg font-bold text-sky-600 hover:bg-sky-100 active:bg-sky-200">+</button>
                </div>
                {focusedDrug && (
                  <p className="text-xs text-gray-400 mt-1 text-center">الكمية المتاحة: {focusedDrug.quantity} قطعة</p>
                )}
              </div>

              {/* Delivery or pickup choice */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">طريقة الاستلام *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => setDeliveryChoice('pickup')}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-sm font-medium transition-colors ${deliveryChoice === 'pickup' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <span className="text-xl">🏪</span>
                    استلام من الصيدلية
                  </button>
                  <button type="button"
                    onClick={() => hasDelivery && setDeliveryChoice('delivery')}
                    disabled={!hasDelivery}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-sm font-medium transition-colors ${!hasDelivery ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed' : deliveryChoice === 'delivery' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <span className="text-xl">🚚</span>
                    {hasDelivery ? 'توصيل للمنزل' : 'توصيل (غير متاح)'}
                  </button>
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-4 h-4" /> رقم هاتفك *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="07XXXXXXXXX"
                  dir="ltr"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-center tracking-wider"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1 text-right">سيتم إرسال رقمك للصيدلية لتتواصل معك</p>
              </div>

              {reserveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {reserveError}
                </div>
              )}

              {/* Info note */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                سيصلك إشعار بالتأكيد فور استلام الصيدلية لطلبك
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-3 shrink-0 border-t pt-4">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                إلغاء
              </button>
              <button onClick={handleReserve} disabled={reserving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                {reserving
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> جاري الإرسال...</>
                  : <><ShoppingCart className="w-4 h-4" /> تأكيد الحجز</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PharmacyDetailPage() {
  return (
    <Suspense>
      <PharmacyDetailContent />
    </Suspense>
  );
}
