'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, MapPin, Star, Truck, X, Package, ArrowRight, ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const DEFAULT_LAT = 33.3152;
const DEFAULT_LNG = 44.3661;

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

function SearchContent() {
  const searchParams = useSearchParams();
  const [query,        setQuery]        = useState(searchParams.get('q') || '');
  const [drugs,        setDrugs]        = useState<Drug[]>([]);
  const [suggestions,  setSuggestions]  = useState<Drug[]>([]);
  const [showSug,      setShowSug]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [nearbyPharm,  setNearbyPharm]  = useState<StockPharmacy[]>([]);
  const [expandedDrug, setExpandedDrug] = useState<string | null>(null);
  const [stockMap,     setStockMap]     = useState<Record<string, StockPharmacy[]>>({});
  const [stockLoading, setStockLoading] = useState<string | null>(null);
  const [coords,       setCoords]       = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });

  const searchRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  useEffect(() => {
    fetch(`${API}/nearby?lat=${coords.lat}&lng=${coords.lng}&radiusKm=15&limit=8`)
      .then(r => r.json())
      .then(d => setNearbyPharm(d.data || []))
      .catch(() => {});
  }, [coords]);

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
      // Auto-expand first drug and load its pharmacies
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
      setStockMap(prev => ({ ...prev, [drug.id]: d.data || [] }));
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

  const isArabic = (s: string) => /[؀-ۿ]/.test(s);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* Header */}
      <div className="bg-sky-500 px-4 py-6 pt-10 pb-8">
        <div className="flex items-center justify-between mb-3">
          <Link href="/dashboard" className="flex items-center gap-1 text-sky-200 hover:text-white text-sm">
            <ArrowRight className="w-4 h-4" /> الرئيسية
          </Link>
          <h1 className="text-white font-bold text-lg">ابحث عن دواء</h1>
        </div>

        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2 bg-white rounded-2xl overflow-hidden shadow-lg">
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

      {/* Loading */}
      {loading && (
        <div className="px-4 py-8 space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-24" />)}
        </div>
      )}

      {/* Drug Results */}
      {!loading && drugs.length > 0 && (
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
                                  <MapPin className="w-3 h-3" />{Number(p.distance_km).toFixed(1)} كم
                                </span>
                                {p.delivery_rate_per_km > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs text-gray-500">
                                    <Truck className="w-3 h-3" />توصيل
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
      {!loading && drugs.length === 0 && (
        <div className="px-4 py-5">
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
                      <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{Number(p.distance_km).toFixed(1)} كم</span>
                      {p.delivery_rate_per_km > 0 && <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" />توصيل</span>}
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
