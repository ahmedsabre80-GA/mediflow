'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, MapPin, Star, Truck, X, Package, ArrowRight, ShoppingCart, ChevronDown, ChevronUp, FileImage, Send, CheckCircle, Stethoscope } from 'lucide-react';
import Link from 'next/link';

const AUTH_API_URL  = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARM_API_URL = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

function patientH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const raw = localStorage.getItem('mediflow-auth');
    const parsed = raw ? JSON.parse(raw) : {};
    const t = parsed.state?.accessToken || parsed.accessToken || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const DEFAULT_LAT = 33.3152;
const DEFAULT_LNG = 44.3661;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

interface Drug {
  id: string;
  generic_name: string;
  generic_name_en: string;
  brand_name: string;
  dosage_form: string;
  strength: string;
  requires_prescription: boolean;
}
interface StockPharmacy {
  id: string;
  name: string;
  name_ar: string;
  phone: string;
  rating: number;
  distance_km: number;
  delivery_rate_per_km: number;
  delivery_min_fee: number;
  selling_price: number;
  quantity: number;
  currency: string;
}

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initTab = searchParams.get('tab');
  const [activeTab,    setActiveTab]    = useState<'drug' | 'prescription' | 'doctor'>(
    initTab === 'doctor' ? 'doctor' : initTab === 'prescription' ? 'prescription' : 'drug'
  );

  // Doctor search state
  const [docSearch,   setDocSearch]   = useState('');
  const [docSpec,     setDocSpec]     = useState('الكل');
  const [doctors,     setDoctors]     = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const DOC_SPECS = ['الكل','طب عام','طب القلب','طب الأطفال','طب النساء والتوليد','طب الأعصاب','طب الجلدية'];

  useEffect(() => {
    if (activeTab !== 'doctor' || doctors.length > 0) return;
    setDocsLoading(true);
    Promise.all([
      fetch(`${PHARM_API_URL}/admin-requests`, { headers: patientH() }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${AUTH_API_URL}/auth/users/doctors`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([reqRes, authRes]) => {
      const authUsers: any[] = authRes.data || authRes.users || [];
      setDoctors((reqRes.data || [])
        .filter((d: any) => ['approved','used'].includes(d.status) && d.portal_type === 'doctor')
        .map((d: any) => {
          const au = authUsers.find((u: any) => u.email?.toLowerCase() === d.employee_email?.toLowerCase());
          return { id: d.id, name: d.employee_name, email: d.employee_email, specialization: d.employee_role || 'طب عام', authId: au?.id || null, latitude: d.latitude ?? null, longitude: d.longitude ?? null };
        }));
    }).finally(() => setDocsLoading(false));
  }, [activeTab]);
  const [query,        setQuery]        = useState(searchParams.get('q') || '');
  const [drugs,        setDrugs]        = useState<Drug[]>([]);
  const [suggestions,  setSuggestions]  = useState<Drug[]>([]);
  const [showSug,      setShowSug]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [nearbyPharm,  setNearbyPharm]  = useState<StockPharmacy[]>([]);
  const [expandedDrug, setExpandedDrug] = useState<string | null>(null);
  const [stockMap,     setStockMap]     = useState<Record<string, StockPharmacy[]>>({});
  const [stockLoading, setStockLoading] = useState<string | null>(null);
  const [coords,       setCoords]       = useState(() => {
    try {
      const lat = localStorage.getItem('patient-saved-lat');
      const lng = localStorage.getItem('patient-saved-lng');
      if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
    } catch {}
    return { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
  });
  const [gpsLoading,   setGpsLoading]   = useState(false);
  const [gpsReady,     setGpsReady]     = useState(() => {
    try { return !!(localStorage.getItem('patient-saved-lat')); } catch { return false; }
  });
  const [showMapPicker, setShowMapPicker] = useState(false);
  const mapPickerRef   = useRef<HTMLDivElement>(null);
  const mapPickerObj   = useRef<any>(null);
  const mapPickerMark  = useRef<any>(null);

  // Prescription state
  const [rxFile,       setRxFile]       = useState<File | null>(null);
  const [rxBase64,     setRxBase64]     = useState('');    // pre-filled from pending rx
  const [rxNotes,      setRxNotes]      = useState('');
  const [rxRadius,     setRxRadius]     = useState(5);
  const [rxDelivery,   setRxDelivery]   = useState<'pickup' | 'delivery'>('pickup');
  const [rxAddress,    setRxAddress]    = useState('');
  const [rxSending,    setRxSending]    = useState(false);
  const [rxSent,       setRxSent]       = useState(false);
  const [rxError,      setRxError]      = useState('');
  const rxInputRef = useRef<HTMLInputElement>(null);

  // Delivery location picker state
  const [deliveryMapOpen,    setDeliveryMapOpen]    = useState(false);
  const [deliveryLat,        setDeliveryLat]        = useState<number | null>(null);
  const [deliveryLng,        setDeliveryLng]        = useState<number | null>(null);
  const [deliveryGpsLoading, setDeliveryGpsLoading] = useState(false);
  const delivMapRef  = useRef<HTMLDivElement>(null);
  const delivMapObj  = useRef<any>(null);
  const delivMapMark = useRef<any>(null);

  // Pre-fill from pending prescription ONLY when user explicitly chose to re-search (sentAt === null)
  useEffect(() => {
    if (activeTab !== 'prescription') return;
    try {
      const pending = localStorage.getItem('mediflow-pending-rx');
      if (!pending) return;
      const p = JSON.parse(pending);
      // sentAt is null only when set by the re-search button — skip pre-fill for normal tab opens
      if (p.sentAt !== null) return;
      if (p.imageBase64 && !rxFile && !rxBase64) {
        setRxBase64(p.imageBase64);
        setRxNotes(p.notes || '');
        setRxRadius(p.radius || 5);
        if (p.deliveryMethod) setRxDelivery(p.deliveryMethod);
        if (p.deliveryAddress) setRxAddress(p.deliveryAddress);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const searchRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const requestGPS = () => {
    setGpsLoading(true);
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setGpsReady(true); setGpsLoading(false);
        localStorage.setItem('patient-saved-lat', String(latitude));
        localStorage.setItem('patient-saved-lng', String(longitude));
      },
      () => { setGpsLoading(false); alert('تعذر الحصول على موقعك. تأكد من منح الإذن من إعدادات المتصفح.'); }
    );
  };

  // Only auto-request GPS if there is truly no saved location
  useEffect(() => {
    const hasSaved = !!(localStorage.getItem('patient-saved-lat'));
    if (!hasSaved) requestGPS();
  }, []);

  useEffect(() => {
    if (!showMapPicker || !mapPickerRef.current) return;
    if (mapPickerObj.current) return;
    import('leaflet').then(L => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const map = L.map(mapPickerRef.current!).setView([coords.lat, coords.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const marker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        setCoords({ lat, lng });
        setGpsReady(true);
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        setGpsReady(true);
      });
      mapPickerObj.current  = map;
      mapPickerMark.current = marker;
    });
    return () => {
      mapPickerObj.current?.remove();
      mapPickerObj.current  = null;
      mapPickerMark.current = null;
    };
  }, [showMapPicker]);

  // Delivery location map
  useEffect(() => {
    if (!deliveryMapOpen || !delivMapRef.current) return;
    if (delivMapObj.current) return;
    const initLat = deliveryLat ?? coords.lat;
    const initLng = deliveryLng ?? coords.lng;
    import('leaflet').then(L => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const map = L.map(delivMapRef.current!).setView([initLat, initLng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const marker = L.marker([initLat, initLng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        setDeliveryLat(lat); setDeliveryLng(lng);
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        setDeliveryLat(e.latlng.lat); setDeliveryLng(e.latlng.lng);
      });
      delivMapObj.current  = map;
      delivMapMark.current = marker;
    });
    return () => {
      delivMapObj.current?.remove();
      delivMapObj.current  = null;
      delivMapMark.current = null;
    };
  }, [deliveryMapOpen]);

  const handleDeliveryGPS = () => {
    setDeliveryGpsLoading(true);
    navigator.geolocation?.getCurrentPosition(
      pos => { setDeliveryLat(pos.coords.latitude); setDeliveryLng(pos.coords.longitude); setDeliveryGpsLoading(false); },
      () => { setDeliveryGpsLoading(false); alert('تعذر الحصول على موقعك، تأكد من منح إذن الموقع.'); }
    );
  };

  useEffect(() => {
    // Clear cached drug-pharmacy results so they re-fetch with new coords
    setStockMap({});
    setExpandedDrug(null);
    fetch(`${API}/nearby?lat=${coords.lat}&lng=${coords.lng}&radiusKm=15&limit=8`)
      .then(r => r.json())
      .then(d => setNearbyPharm(d.data || []))
      .catch(() => {});
  }, [coords.lat, coords.lng]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSug(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setSuggestions([]); setShowSug(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/drugs/search?q=${encodeURIComponent(query)}&limit=6`);
        const d = await r.json();
        setSuggestions(d.data || []);
        setShowSug(true);
      } catch { setSuggestions([]); }
    }, 300);
  }, [query]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) return;
    setLoading(true);
    setShowSug(false);
    setExpandedDrug(null);
    setStockMap({});
    try {
      const r = await fetch(`${API}/drugs/search?q=${encodeURIComponent(q)}&limit=20`);
      const d = await r.json();
      const drugList: Drug[] = d.data || [];
      setDrugs(drugList);
      if (drugList.length > 0) {
        loadPharmaciesForDrug(drugList[0], true);
      }
    } catch { setDrugs([]); }
    finally { setLoading(false); }
  }, [coords]);

  const loadPharmaciesForDrug = async (drug: Drug, autoExpand = false) => {
    if (stockMap[drug.id]) {
      setExpandedDrug(prev => prev === drug.id ? null : drug.id);
      return;
    }
    setExpandedDrug(drug.id);
    setStockLoading(drug.id);
    try {
      const r = await fetch(`${API}/nearby?lat=${coords.lat}&lng=${coords.lng}&radiusKm=30&drugId=${drug.id}&limit=10`);
      const d = await r.json();
      const available = (d.data || []).filter((p: StockPharmacy) => (p.quantity ?? 0) > 0);
      setStockMap(prev => ({ ...prev, [drug.id]: available }));
    } catch {
      setStockMap(prev => ({ ...prev, [drug.id]: [] }));
    } finally {
      setStockLoading(null);
    }
  };

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q.length >= 2) doSearch(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSearch = () => {
    setQuery(''); setSuggestions([]); setDrugs([]);
    setExpandedDrug(null); setStockMap({});
  };

  const handleSendPrescription = async () => {
    if (!rxFile && !rxBase64) { setRxError('يرجى اختيار صورة الوصفة الطبية'); return; }
    setRxSending(true);
    setRxError('');
    try {
      const stored = localStorage.getItem('mediflow-auth');
      const state  = stored ? JSON.parse(stored).state : null;
      const patientId    = state?.user?.id   || '';
      const patientName  = state?.user?.name || state?.user?.email?.split('@')[0] || 'مريض';
      const patientPhone = state?.user?.phone || state?.user?.phoneNumber || state?.user?.phone_number || localStorage.getItem('patient-phone') || '';

      // 1. Convert image to base64 (use cached base64 if re-sending)
      const imageBase64 = rxFile
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve((reader.result as string).split(',')[1] || '');
            reader.onerror = reject;
            reader.readAsDataURL(rxFile!);
          })
        : rxBase64;

      const uploadRes = await fetch(`${PHARMACY_API}/prescriptions`, {
        method: 'POST',
        headers: patientH(),
        body: JSON.stringify({ patientId, notes: rxNotes, imageBase64, radiusKm: rxRadius, lat: coords.lat, lng: coords.lng }),
      });
      const uploadData = await uploadRes.json();
      const prescriptionId = uploadData?.data?.id;

      // 2. Fetch nearby pharmacies and notify each
      const nearbyRes  = await fetch(`${PHARMACY_API}/nearby?lat=${coords.lat}&lng=${coords.lng}&radiusKm=${rxRadius}&limit=20`);
      const nearbyData = await nearbyRes.json();
      const nearPharms: any[] = nearbyData.data || [];

      // owner_id may not be in nearby results — fetch full details for each pharmacy
      const pharmsWithOwner = await Promise.all(
        nearPharms.map(async p => {
          if (p.owner_id) return p;
          try {
            const r = await fetch(`${PHARMACY_API}/${p.id}`);
            const d = await r.json();
            return { ...p, owner_id: d.data?.owner_id };
          } catch { return p; }
        })
      );

      const pharmacyOwnerIds = pharmsWithOwner.filter(p => p.owner_id).map(p => p.owner_id);

      await Promise.allSettled(
        pharmsWithOwner
          .filter(p => p.owner_id)
          .map(p =>
            fetch(`${PHARMACY_API}/portal-notifications`, {
              method: 'POST',
              headers: patientH(),
              body: JSON.stringify({
                portalType: 'pharmacy',
                recipientId: p.owner_id,
                senderName: patientName,
                message: `📋 وصفة طبية جديدة!\nالمريض: ${patientName}\n${patientPhone ? `رقم الهاتف: ${patientPhone}\n` : ''}${p.distance_km != null ? `المسافة: ${Number(p.distance_km).toFixed(1)} كم\n` : ''}طريقة الاستلام: ${rxDelivery === 'delivery' ? '🚚 توصيل للمنزل' : '🏪 استلام من الصيدلية'}\n${rxDelivery === 'delivery' && rxAddress ? `العنوان: ${rxAddress}\n` : ''}${rxDelivery === 'delivery' && deliveryLat && deliveryLng ? `إحداثيات التوصيل: ${deliveryLat.toFixed(5)}, ${deliveryLng.toFixed(5)}\n` : ''}${rxNotes ? `ملاحظات: ${rxNotes}\n` : ''}[prescription_id:${prescriptionId}][patient_id:${patientId}][delivery:${rxDelivery}]${deliveryLat && deliveryLng ? `[dlat:${deliveryLat.toFixed(5)}][dlng:${deliveryLng.toFixed(5)}]` : ''}`,
              }),
            })
          )
      );

      // Send self-notification so the prescription appears in طلباتي
      if (patientId) {
        fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: patientH(),
          body: JSON.stringify({
            portalType: 'patient',
            recipientId: patientId,
            senderName: patientName,
            message: `📋 تم إرسال وصفتك الطبية\nالحالة: قيد المراجعة\nطريقة الاستلام: ${rxDelivery === 'delivery' ? 'توصيل للمنزل' : 'استلام من الصيدلية'}\n[prescription_id:${prescriptionId}]`,
          }),
        }).catch(() => {});
      }

      // Save pending prescription so layout can detect expiry and trigger re-search
      if (prescriptionId) {
        localStorage.setItem('mediflow-pending-rx', JSON.stringify({
          id: prescriptionId,
          imageBase64,
          notes: rxNotes,
          radius: rxRadius,
          lat: coords.lat,
          lng: coords.lng,
          sentAt: new Date().toISOString(),
          pharmacyOwnerIds,
          deliveryMethod: rxDelivery,
          deliveryAddress: rxAddress,
          deliveryLat: deliveryLat ?? undefined,
          deliveryLng: deliveryLng ?? undefined,
        }));
      }

      setRxSent(true);
    } catch {
      setRxError('حدث خطأ أثناء الإرسال، حاول مرة أخرى');
    } finally {
      setRxSending(false);
    }
  };

  const isArabic = (s: string) => /[؀-ۿ]/.test(s);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* Header */}
      <div className="bg-sky-500 px-4 py-6 pt-10 pb-4">
        <div className="flex items-center justify-between mb-3">
          <Link href="/dashboard" className="flex items-center gap-1 text-sky-200 hover:text-white text-sm">
            <ArrowRight className="w-4 h-4" /> الرئيسية
          </Link>
          <h1 className="text-white font-bold text-lg">
            {activeTab === 'doctor' ? 'البحث عن طبيب' : 'ابحث عن دواء'}
          </h1>
        </div>
        {/* Tab switcher */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setActiveTab('drug')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all border-2 flex flex-col items-center gap-0.5 ${
              activeTab === 'drug'
                ? 'bg-amber-400 text-white border-amber-300 shadow'
                : 'bg-white/20 text-white border-transparent'
            }`}>
            <span className="text-2xl">💊</span>
            <span className="text-xs">دواء</span>
          </button>
          <button onClick={() => setActiveTab('doctor')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all border-2 flex flex-col items-center gap-0.5 ${
              activeTab === 'doctor'
                ? 'bg-amber-400 text-white border-amber-300 shadow'
                : 'bg-white/20 text-white border-transparent'
            }`}>
            <span className="text-2xl">🩺</span>
            <span className="text-xs">طبيب</span>
          </button>
          <button onClick={() => setActiveTab('prescription')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all border-2 flex flex-col items-center gap-0.5 ${
              activeTab === 'prescription'
                ? 'bg-amber-400 text-white border-amber-300 shadow'
                : 'bg-white/20 text-white border-transparent'
            }`}>
            <span className="text-2xl">📋</span>
            <span className="text-xs">وصفة</span>
          </button>
        </div>

        <div ref={searchRef} className={`relative ${activeTab !== 'drug' ? 'hidden' : ''}`}>
          <div className="flex items-center bg-white rounded-2xl overflow-hidden shadow-lg">
            <button onClick={() => doSearch(query)}
              className="bg-sky-600 hover:bg-sky-700 px-4 py-3.5 flex items-center justify-center transition-colors shrink-0">
              <Search className="w-5 h-5 text-white" />
            </button>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch(query)}
              placeholder="باراسيتامول، ibuprofen، ..."
              className="flex-1 py-3.5 px-2 text-sm outline-none"
              dir={isArabic(query) ? 'rtl' : 'ltr'}
              autoComplete="off"
              autoFocus
            />
            {query && (
              <button onClick={clearSearch} className="px-3 text-gray-400 hover:text-gray-600 shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {!query && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {['باراسيتامول', 'ibuprofen', 'amoxicillin', 'فيتامين C'].map(hint => (
                <button key={hint} onClick={() => { setQuery(hint); doSearch(hint); }}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-full transition-colors">
                  {hint}
                </button>
              ))}
            </div>
          )}

          {showSug && suggestions.length > 0 && (
            <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-2xl shadow-xl z-50 border overflow-hidden">
              {suggestions.map(drug => (
                <button key={drug.id} onClick={() => { setQuery(drug.generic_name); setShowSug(false); doSearch(drug.generic_name); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sky-50 text-right border-b last:border-0 transition-colors">
                  <span className="text-xl shrink-0">💊</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{drug.generic_name}</p>
                    <p className="text-xs text-gray-400">
                      {drug.generic_name_en && <span className="ml-2">{drug.generic_name_en}</span>}
                      {drug.brand_name && <span>{drug.brand_name}</span>}
                      {drug.strength && <span> · {drug.strength}</span>}
                    </p>
                  </div>
                  {drug.requires_prescription && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full shrink-0">وصفة</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ DOCTOR SEARCH ══ */}
      {activeTab === 'doctor' && (
        <div className="px-4 py-4 space-y-3 pb-24">
          {/* Search bar */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input value={docSearch} onChange={e => setDocSearch(e.target.value)}
              autoFocus placeholder="ابحث باسم الطبيب أو التخصص..."
              className="flex-1 outline-none text-sm" dir="rtl" />
            {docSearch && <button onClick={() => setDocSearch('')} className="text-gray-400 text-lg">×</button>}
          </div>
          {/* Specializations */}
          <div className="overflow-x-auto">
            <div className="flex gap-2 w-max">
              {DOC_SPECS.map(s => (
                <button key={s} onClick={() => setDocSpec(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${docSpec === s ? 'bg-sky-500 text-white' : 'bg-white text-gray-600 shadow-sm'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          {/* Results */}
          {docsLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-20" />)
          ) : (() => {
            const filtered = doctors
              .filter(d =>
                (!docSearch || (d.name || '').toLowerCase().includes(docSearch.toLowerCase()) || (d.specialization || '').includes(docSearch)) &&
                (docSpec === 'الكل' || (d.specialization || '').includes(docSpec))
              )
              .map(d => ({
                ...d,
                distKm: (d.latitude != null && d.longitude != null)
                  ? haversineKm(coords.lat, coords.lng, d.latitude, d.longitude)
                  : null,
              }))
              .sort((a, b) => {
                if (a.distKm == null && b.distKm == null) return 0;
                if (a.distKm == null) return 1;
                if (b.distKm == null) return -1;
                return a.distKm - b.distKm;
              });
            return filtered.length === 0 ? (
              <div className="pt-10 text-center text-gray-400">
                <Stethoscope className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">لا توجد نتائج</p>
              </div>
            ) : filtered.map(doc => (
              <button key={doc.id} onClick={() => router.push('/doctors')}
                className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 text-right hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-lg font-bold">{(doc.name || 'د')[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{doc.name}</p>
                  <p className="text-xs text-sky-600 mt-0.5">{doc.specialization}</p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />
                    {doc.distKm != null ? (doc.distKm < 1 ? `${Math.round(doc.distKm * 1000)} م` : `${doc.distKm.toFixed(1)} كم`) : 'موقع غير محدد'}
                  </p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700 shrink-0">حجز</span>
              </button>
            ));
          })()}
        </div>
      )}

      {/* ══ PRESCRIPTION UPLOAD ══ */}
      {activeTab === 'prescription' && (
        <div className="px-4 py-5">
          {/* Back button */}
          <button onClick={() => { setActiveTab('drug'); setRxSent(false); setRxFile(null); setRxNotes(''); }}
            className="flex items-center gap-1 text-sky-600 text-sm mb-4 hover:underline">
            <ArrowRight className="w-4 h-4" /> العودة للبحث
          </button>
          {rxSent ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">تم إرسال الوصفة!</h3>
              <p className="text-gray-500 text-sm mb-2">
                أُرسلت وصفتك إلى الصيدليات في نطاق {rxRadius} كم.<br />
                <span className="font-medium text-gray-700">أول صيدلية تقبل ستصلك إشعار فوراً 🔔</span>
              </p>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="text-lg">{rxDelivery === 'delivery' ? '🚚' : '🏪'}</span>
                <span className="text-sm font-medium text-gray-700">
                  {rxDelivery === 'delivery' ? 'طلبت توصيل للمنزل' : 'ستستلم من الصيدلية'}
                </span>
              </div>

              <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-right mb-5">
                <p className="font-bold text-sky-700 text-sm mb-1">ماذا تفعل الآن؟</p>
                <ul className="space-y-1 text-xs text-sky-600">
                  <li>• انتظر إشعار القبول 🔔 من الصيدلية</li>
                  <li>• يمكنك التصفح بشكل طبيعي وستصلك التنبيه</li>
                  <li>• تابع حالة طلبك من صفحة "طلباتي"</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <Link href="/orders"
                  className="flex-1 bg-sky-500 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-sky-600 transition-colors text-sm text-center">
                  طلباتي
                </Link>
                <button onClick={() => { setRxSent(false); setRxFile(null); setRxBase64(''); setRxNotes(''); setRxRadius(5); setRxDelivery('pickup'); setRxAddress(''); localStorage.removeItem('mediflow-pending-rx'); }}
                  className="flex-1 border border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
                  إرسال وصفة أخرى
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Image picker */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">صورة الوصفة الطبية *</p>
                <input ref={rxInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setRxFile(f); setRxBase64(''); } }} />
                <button onClick={() => rxInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-2xl py-8 flex flex-col items-center gap-2 transition-colors ${(rxFile || rxBase64) ? 'border-sky-400 bg-sky-50' : 'border-gray-300 hover:border-sky-300 bg-white'}`}>
                  {rxFile ? (
                    <>
                      <img src={URL.createObjectURL(rxFile)} alt="" className="w-24 h-24 object-cover rounded-xl" />
                      <p className="text-sm text-sky-700 font-medium">{rxFile.name}</p>
                      <p className="text-xs text-gray-400">اضغط لتغيير الصورة</p>
                    </>
                  ) : rxBase64 ? (
                    <>
                      <img src={`data:image/jpeg;base64,${rxBase64}`} alt="" className="w-24 h-24 object-cover rounded-xl" />
                      <p className="text-sm text-sky-700 font-medium">وصفتك السابقة</p>
                      <p className="text-xs text-gray-400">اضغط لتغيير الصورة</p>
                    </>
                  ) : (
                    <>
                      <FileImage className="w-10 h-10 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">اضغط لاختيار صورة الوصفة</p>
                      <p className="text-xs text-gray-400">JPG, PNG, HEIC مقبول</p>
                    </>
                  )}
                </button>
              </div>

              {/* Radius */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">نطاق البحث</p>
                  <span className="text-sky-600 font-bold text-sm">{rxRadius} كم</span>
                </div>
                <input type="range" min={1} max={20} step={1} value={rxRadius} onChange={e => setRxRadius(Number(e.target.value))}
                  className="w-full accent-sky-500" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1 كم</span><span>10 كم</span><span>20 كم</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {[3, 5, 10, 15].map(r => (
                    <button key={r} onClick={() => setRxRadius(r)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${rxRadius === r ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {r} كم
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery method */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">طريقة الاستلام *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setRxDelivery('pickup')}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-sm font-medium transition-all ${rxDelivery === 'pickup' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <span className="text-2xl">🏪</span>
                    <span>استلام من الصيدلية</span>
                    <span className="text-xs font-normal opacity-70">تذهب بنفسك للصيدلية</span>
                  </button>
                  <button type="button" onClick={() => setRxDelivery('delivery')}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-sm font-medium transition-all ${rxDelivery === 'delivery' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <span className="text-2xl">🚚</span>
                    <span>توصيل للمنزل</span>
                    <span className="text-xs font-normal opacity-70">الصيدلية توصّل إليك</span>
                  </button>
                </div>
                {rxDelivery === 'delivery' && (
                  <div className="mt-3 space-y-2">
                    {deliveryLat && deliveryLng ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                        <span className="text-xs text-green-700 font-medium">📍 تم تحديد موقع التوصيل</span>
                        <button type="button" onClick={() => { setDeliveryLat(null); setDeliveryLng(null); }}
                          className="text-xs text-red-400 hover:text-red-600">تغيير</button>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">⚠️ لم يتم تحديد موقع التوصيل بعد</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setDeliveryMapOpen(true)}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-sky-400 text-sky-600 bg-sky-50 hover:bg-sky-100 text-sm font-medium transition-all">
                        📍 اختر من الخريطة
                      </button>
                      <button type="button" onClick={handleDeliveryGPS} disabled={deliveryGpsLoading}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-purple-400 text-purple-600 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 text-sm font-medium transition-all">
                        {deliveryGpsLoading ? '⏳ جاري...' : '📡 موقعي الحالي'}
                      </button>
                    </div>
                    <input value={rxAddress} onChange={e => setRxAddress(e.target.value)}
                      placeholder="وصف العنوان: شارع، بناية، طابق... (اختياري)"
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-sky-400" />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">ملاحظات إضافية (اختياري)</label>
                <textarea value={rxNotes} onChange={e => setRxNotes(e.target.value)}
                  placeholder="مثال: أحتاج جميع الأدوية في الوصفة، أو دواء معين..."
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
              </div>

              {rxError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{rxError}</div>
              )}

              <button onClick={handleSendPrescription} disabled={rxSending || (!rxFile && !rxBase64)}
                className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow">
                {rxSending
                  ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> جاري الإرسال...</>
                  : <><Send className="w-5 h-5" /> إرسال الوصفة للصيدليات</>}
              </button>

              <p className="text-center text-xs text-gray-400">
                سيتم إشعار كل الصيدليات في نطاق {rxRadius} كم — أول من يقبل ستختفي الوصفة من الباقين
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'drug' && loading && (
        <div className="px-4 py-8 space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-24" />)}
        </div>
      )}

      {/* Drug Results */}
      {activeTab === 'drug' && !loading && drugs.length > 0 && (
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-gray-500 text-right">{drugs.length} نتيجة — اضغط على الدواء لعرض الصيدليات القريبة</p>
          {drugs.map(drug => {
            const isExpanded = expandedDrug === drug.id;
            const pharmacies = stockMap[drug.id] || [];
            const isLoadingThis = stockLoading === drug.id;

            return (
              <div key={drug.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Drug header — tap to expand */}
                <button onClick={() => loadPharmaciesForDrug(drug)}
                  className="w-full flex items-center gap-3 p-4 text-right hover:bg-sky-50 transition-colors">
                  <div className="w-11 h-11 bg-sky-50 rounded-xl flex items-center justify-center text-2xl shrink-0">💊</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{drug.generic_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {drug.generic_name_en && <span className="ml-2">{drug.generic_name_en}</span>}
                      {drug.brand_name && <span className="text-gray-500">{drug.brand_name}</span>}
                      {drug.dosage_form && <span> · {drug.dosage_form}</span>}
                      {drug.strength && <span> · {drug.strength}</span>}
                    </p>
                    {drug.requires_prescription && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full mt-1 inline-block">يحتاج وصفة طبية</span>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>

                {/* Nearby pharmacies with stock */}
                {isExpanded && (
                  <div className="border-t">
                    {isLoadingThis ? (
                      <div className="px-4 py-6 text-center">
                        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-gray-400">جاري البحث في الصيدليات القريبة...</p>
                      </div>
                    ) : pharmacies.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">لا توجد صيدلية قريبة تحتوي هذا الدواء</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        <div className="px-4 py-2 bg-sky-50">
                          <p className="text-xs font-medium text-sky-700">{pharmacies.length} صيدلية قريبة لديها هذا الدواء</p>
                        </div>
                        {pharmacies.map(p => (
                          <Link href={`/pharmacies/${p.id}?drug=${drug.id}`} key={p.id}
                            className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center text-xl shrink-0">🏥</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-900 text-sm truncate">{p.name_ar || p.name}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                <span className="flex items-center gap-0.5 text-xs text-gray-500">
                                  <MapPin className="w-3 h-3" />{p.distance_km != null ? `${Number(p.distance_km).toFixed(1)} كم` : 'موقع غير محدد'}
                                </span>
                                {p.delivery_rate_per_km > 0 ? (
                                  <span className="flex items-center gap-0.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                                    <Truck className="w-3 h-3" />توصيل متاح
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-0.5 text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-medium">
                                    <Truck className="w-3 h-3" />لا يوجد خدمة توصيل
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5 text-xs text-gray-500">
                                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />{Number(p.rating).toFixed(1)}
                                </span>
                                {p.quantity > 0 && (
                                  <span className="text-xs text-green-600 font-medium">متوفر ({p.quantity})</span>
                                )}
                              </div>
                            </div>
                            {p.selling_price > 0 && (
                              <div className="text-right shrink-0">
                                <p className="font-bold text-sky-600 text-sm">
                                  {Number(p.selling_price).toLocaleString('ar-IQ')}
                                </p>
                                <p className="text-xs text-gray-400">{p.currency || 'IQD'}</p>
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No search yet — show nearby pharmacies */}
      {activeTab === 'drug' && !loading && drugs.length === 0 && (
        <div className="px-4 py-5">
          {/* Location picker — compact */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">موقعك لعرض الصيدليات القريبة</p>
              <div className="flex items-center gap-1.5">
                <button onClick={requestGPS} disabled={gpsLoading}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-60 transition-colors">
                  {gpsLoading
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <MapPin className="w-3 h-3" />}
                  موقعي
                </button>
                <button onClick={() => setShowMapPicker(v => !v)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${showMapPicker ? 'border-sky-500 bg-sky-50 text-sky-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  <Search className="w-3 h-3" />
                  اختر على الخريطة
                </button>
              </div>
            </div>
            {gpsReady && !showMapPicker && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> تم تحديد موقعك
              </p>
            )}

            {/* Inline map picker */}
            {showMapPicker && (
              <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <div ref={mapPickerRef} style={{ height: '260px', width: '100%' }} />
                <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 text-center">
                  اضغط على الخريطة أو اسحب العلامة لتحديد موقعك
                </div>
                {gpsReady && (
                  <button onClick={() => setShowMapPicker(false)}
                    className="w-full py-2.5 bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 transition-colors">
                    ✓ تأكيد الموقع وإغلاق الخريطة
                  </button>
                )}
              </div>
            )}
          </div>
          <h2 className="font-bold text-gray-900 mb-3">الصيدليات القريبة</h2>
          {nearbyPharm.length === 0 ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-20" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {nearbyPharm.map(p => (
                <Link href={`/pharmacies/${p.id}`} key={p.id}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center text-2xl shrink-0">🏥</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{p.name_ar || p.name}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{p.distance_km != null ? `${Number(p.distance_km).toFixed(1)} كم` : 'موقع غير محدد'}</span>
                      {p.delivery_rate_per_km > 0 ? (
                        <span className="flex items-center gap-0.5 bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium text-xs">
                          <Truck className="w-3 h-3" />توصيل متاح
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-medium text-xs">
                          <Truck className="w-3 h-3" />لا يوجد خدمة توصيل
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-medium">{Number(p.rating).toFixed(1)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <h2 className="font-bold text-gray-900 mt-6 mb-3">بحث سريع</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'مسكنات الألم', q: 'باراسيتامول', emoji: '💊' },
              { label: 'مضادات حيوية', q: 'أموكسيسيلين', emoji: '🦠' },
              { label: 'فيتامينات',    q: 'فيتامين',      emoji: '🌿' },
              { label: 'ضغط الدم',    q: 'أملوديبين',    emoji: '❤️' },
              { label: 'سكري',        q: 'ميتفورمين',    emoji: '🩸' },
              { label: 'حساسية',      q: 'سيتيريزين',    emoji: '🌸' },
            ].map(c => (
              <button key={c.q} onClick={() => { setQuery(c.q); doSearch(c.q); }}
                className="bg-white rounded-2xl p-3 flex flex-col items-center gap-1.5 shadow-sm hover:shadow-md transition-shadow">
                <span className="text-2xl">{c.emoji}</span>
                <span className="text-xs font-medium text-gray-700 text-center leading-tight">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delivery location map modal */}
      {deliveryMapOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/80">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <div className="flex items-center justify-between px-4 py-3 bg-white shadow-md" dir="rtl">
            <button onClick={() => setDeliveryMapOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h2 className="font-bold text-gray-900 text-sm">اختر موقع التوصيل</h2>
            <button
              onClick={() => setDeliveryMapOpen(false)}
              className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">
              {deliveryLat && deliveryLng ? '✓ تأكيد الموقع' : 'إغلاق'}
            </button>
          </div>
          <div ref={delivMapRef} className="flex-1" />
          <div className="bg-white px-4 py-2.5 text-center text-xs text-gray-500" dir="rtl">
            انقر على الخريطة أو اسحب الدبوس لتحديد موقع التوصيل الدقيق
            {deliveryLat && deliveryLng && (
              <span className="block text-green-600 font-medium mt-0.5">
                📍 {deliveryLat.toFixed(4)}, {deliveryLng.toFixed(4)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
