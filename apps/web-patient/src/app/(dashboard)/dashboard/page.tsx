'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Search, Star, ChevronLeft, Navigation, Map, Check } from 'lucide-react';
import { DEFAULT_LAT, DEFAULT_LNG } from '@/lib/usePatientLocation';

const NOTIF_API   = 'https://mediflow-production-d815.up.railway.app/api/v1/notifications';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

const LAT_KEY = 'patient-saved-lat';
const LNG_KEY = 'patient-saved-lng';

function patientAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('mediflow-auth');
    const parsed = raw ? JSON.parse(raw) : {};
    const t = parsed.state?.accessToken || parsed.accessToken || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  } catch { return { 'Content-Type': 'application/json' }; }
}

function isPharmacyOpen(p: any): boolean {
  if (p.status === 'inactive') return false;
  if (!p.opening_hours) return p.status === 'active';
  try {
    const hours = typeof p.opening_hours === 'string' ? JSON.parse(p.opening_hours) : p.opening_hours;
    const now = new Date();
    const h = hours[now.getDay()];
    if (!h || !h.open) return false;
    const [fh, fm] = h.from.split(':').map(Number);
    const [th, tm] = h.to.split(':').map(Number);
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= fh * 60 + fm && cur <= th * 60 + tm;
  } catch { return p.status === 'active'; }
}

function saveCoords(lat: number, lng: number) {
  localStorage.setItem(LAT_KEY, String(lat));
  localStorage.setItem(LNG_KEY, String(lng));
}

export default function PatientDashboard() {
  const [pharmacies,    setPharmacies]    = useState<any[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(0);
  const [lat,           setLat]           = useState(DEFAULT_LAT);
  const [lng,           setLng]           = useState(DEFAULT_LNG);
  const [gpsReady,      setGpsReady]      = useState(false);
  const [gpsLoading,    setGpsLoading]    = useState(false);
  const [showMap,       setShowMap]       = useState(false);
  const [mapCoords,     setMapCoords]     = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapObj  = useRef<any>(null);
  const mapMark = useRef<any>(null);

  // Load location on mount — cached first, GPS only if nothing saved
  useEffect(() => {
    const cachedLat = localStorage.getItem(LAT_KEY);
    const cachedLng = localStorage.getItem(LNG_KEY);
    if (cachedLat && cachedLng) {
      // Use saved location immediately — no GPS auto-fire
      setLat(Number(cachedLat));
      setLng(Number(cachedLng));
      setGpsReady(true);
    } else {
      // No saved location at all — get GPS once and save it
      navigator.geolocation?.getCurrentPosition(
        pos => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
          setGpsReady(true);
          saveCoords(pos.coords.latitude, pos.coords.longitude);
        },
        () => { setGpsReady(true); } // fall through with defaults
      );
    }
  }, []);

  // Fetch nearby pharmacies — only after location is resolved (gpsReady)
  useEffect(() => {
    if (!gpsReady) return;
    fetch(`${PHARMACY_API}/pharmacies/nearby?lat=${lat}&lng=${lng}&radiusKm=15&limit=3`)
      .then(r => r.json()).then(d => setPharmacies(d.data || [])).catch(() => {});
  }, [lat, lng, gpsReady]);

  // Fetch loyalty points from patient notifications
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mediflow-auth');
      const uid = raw ? (JSON.parse(raw).state?.user?.id || '') : '';
      if (!uid) return;
      fetch(`${PHARMACY_API}/pharmacies/portal-notifications?portalType=patient&recipientId=${encodeURIComponent(uid)}`, { headers: patientAuthHeaders() })
        .then(r => r.json())
        .then(d => {
          const notifs: any[] = d.data || [];
          let totalSpent = 0;
          notifs.forEach((n: any) => {
            const msg: string = n.message || '';
            if (msg.includes('إيصال استلام')) {
              const totalStr = msg.match(/الإجمالي:\s*([\d,]+)/)?.[1]?.replace(/,/g, '') || '0';
              totalSpent += Number(totalStr);
            }
          });
          setLoyaltyPoints(Math.floor(totalSpent / 1000));
        }).catch(() => {});
    } catch {}
  }, []);

  const requestGPS = () => {
    setGpsLoading(true);
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude); setLng(longitude); setGpsReady(true); setGpsLoading(false);
        saveCoords(latitude, longitude);
        setShowMap(false);
      },
      () => { setGpsLoading(false); alert('تعذر الحصول على موقعك. تأكد من منح الإذن من إعدادات المتصفح.'); }
    );
  };

  // Build map when showMap becomes true
  useEffect(() => {
    if (!showMap || !mapRef.current) return;
    if (mapObj.current) return;
    import('leaflet').then(L => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const initLat = lat || DEFAULT_LAT;
      const initLng = lng || DEFAULT_LNG;
      setMapCoords({ lat: initLat, lng: initLng });
      const map = L.map(mapRef.current!).setView([initLat, initLng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const marker = L.marker([initLat, initLng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        setMapCoords({ lat: ll.lat, lng: ll.lng });
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        setMapCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      mapObj.current  = map;
      mapMark.current = marker;
    });
    return () => { mapObj.current?.remove(); mapObj.current = null; mapMark.current = null; };
  }, [showMap]);

  const confirmMapLocation = () => {
    setLat(mapCoords.lat); setLng(mapCoords.lng); setGpsReady(true);
    saveCoords(mapCoords.lat, mapCoords.lng);
    setShowMap(false);
  };

  const quickActions = [
    { label: 'ابحث عن دواء', href: '/search',  icon: '🔍', color: 'bg-sky-50 text-sky-700' },
    { label: 'استشر طبيب',   href: '/doctors', icon: '👨‍⚕️', color: 'bg-indigo-50 text-indigo-700' },
    { label: 'طلباتي',       href: '/orders',  icon: '📦', color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* Map picker (inline, shown below the heading when opened) */}

      {/* Hero search bar */}
      <div className="bg-gradient-to-r from-sky-500 to-teal-500 px-4 pt-6 pb-8">
        <Link href="/search" className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-md">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="text-gray-400 text-sm">ابحث عن دواء أو صيدلية...</span>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-5">
        <h2 className="font-bold text-gray-900 mb-3">ماذا تريد؟</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}
              className={`${action.color} rounded-2xl p-3 flex flex-col items-center gap-2 hover:opacity-90 transition-opacity`}>
              <span className="text-2xl">{action.icon}</span>
              <span className="text-xs font-medium text-center leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Nearby Pharmacies */}
      <div className="px-4 pb-5">
        <div className="flex items-center justify-between mb-3">
          <Link href="/search" className="text-sky-600 text-sm flex items-center gap-1">
            عرض الكل <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-gray-900">صيدليات قريبة</h2>
            <button onClick={requestGPS} disabled={gpsLoading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-sky-300 text-sky-600 bg-sky-50 hover:bg-sky-100 transition-colors">
              <Navigation className="w-3 h-3" />
              {gpsLoading ? '...' : 'موقعي'}
            </button>
            <button onClick={() => setShowMap(v => !v)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${showMap ? 'border-purple-400 text-purple-700 bg-purple-100' : 'border-purple-300 text-purple-600 bg-purple-50 hover:bg-purple-100'}`}>
              <Map className="w-3 h-3" />
              الخريطة
            </button>
          </div>
        </div>

        {/* Inline map picker */}
        {showMap && (
          <div className="mb-4 rounded-2xl overflow-hidden border border-purple-200">
            <div ref={mapRef} style={{ height: 260 }} />
            <div className="bg-purple-50 px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-purple-500">اسحب العلامة أو انقر لتحديد موقعك</p>
              <button onClick={confirmMapLocation}
                className="flex items-center gap-1 bg-purple-500 hover:bg-purple-600 text-white text-xs px-3 py-1.5 rounded-xl font-medium">
                <Check className="w-3 h-3" /> تأكيد الموقع
              </button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {pharmacies.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-gray-400 text-sm">جاري التحميل...</div>
          ) : pharmacies.map((p: any) => (
            <Link href={`/pharmacies/${p.id}`} key={p.id}
              className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center text-2xl shrink-0">🏥</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-900 text-sm">{p.name_ar || p.name}</p>
                  {isPharmacyOpen(p)
                    ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">مفتوح</span>
                    : <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">مغلق</span>}
                </div>
                <p className="text-xs text-gray-500">{parseFloat(p.distance_km).toFixed(1)} كم</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium">{parseFloat(p.rating).toFixed(1)}</span>
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Loyalty Points */}
      <div className="px-4 pb-8">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-5 flex items-center justify-between text-white">
          <Star className="w-12 h-12 text-indigo-300" />
          <div className="text-right">
            <p className="text-indigo-200 text-sm">نقاط المكافآت</p>
            <p className="text-3xl font-bold">{loyaltyPoints.toLocaleString()}</p>
            <p className="text-xs text-indigo-300">
              {loyaltyPoints === 0 ? 'ابدأ التسوق لتجميع النقاط' : 'نقطة لكل ١٠٠٠ د.ع مصروفة'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
