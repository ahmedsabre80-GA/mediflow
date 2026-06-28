'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Star, Clock, Truck, ChevronDown } from 'lucide-react';
import Link from 'next/link';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'pharmacies' | 'medications'>('pharmacies');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedMed, setSelectedMed] = useState<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPharmacies();
  }, []);

  useEffect(() => {
    if (query.length > 1) {
      fetchSuggestions(query);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchSuggestions = async (q: string) => {
    try {
      const res = await fetch(`${PHARMACY_API}/medications/search?q=${encodeURIComponent(q)}&limit=5`);
      const data = await res.json();
      setSuggestions(data.data || []);
      setShowSuggestions(true);
    } catch {
      setSuggestions([]);
    }
  };

  const loadPharmacies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${PHARMACY_API}/pharmacies/nearby?lat=33.3152&lng=44.3661&radiusKm=15&limit=20`);
      const data = await res.json();
      setPharmacies(data.data || []);
    } catch {
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  };

  const searchMedications = async (q: string) => {
    if (!q || q.length < 2) return;
    setLoading(true);
    setTab('medications');
    setShowSuggestions(false);
    try {
      const res = await fetch(`${PHARMACY_API}/medications/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setMedications(data.data || []);
    } catch {
      setMedications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = (med: any) => {
    setQuery(med.generic_name_ar || med.generic_name);
    setSelectedMed(med);
    setShowSuggestions(false);
    searchMedications(med.generic_name);
  };

  const handleSearch = () => {
    if (query.length > 1) searchMedications(query);
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Search Header */}
      <div className="bg-sky-500 px-4 py-6 pt-8">
        <h1 className="text-white font-bold text-lg mb-3">ابحث عن دواء أو صيدلية</h1>

        {/* Smart Search Bar */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2 bg-white rounded-xl overflow-hidden shadow-md">
            <button onClick={handleSearch}
              className="bg-sky-600 hover:bg-sky-700 px-4 py-3 flex items-center justify-center transition-colors">
              <Search className="w-5 h-5 text-white" />
            </button>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="اكتب اسم الدواء... مثال: باراسيتامول"
              className="flex-1 py-3 px-2 text-sm outline-none"
              dir="rtl"
            />
            {query && (
              <button onClick={() => { setQuery(''); setSuggestions([]); setMedications([]); }}
                className="px-3 text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>

          {/* Autocomplete Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-xl shadow-xl z-50 border overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b">
                <p className="text-xs text-gray-500">اقتراحات البحث</p>
              </div>
              {suggestions.map((med: any) => (
                <button key={med.id} onClick={() => handleSelectSuggestion(med)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sky-50 transition-colors text-right border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{med.generic_name_ar || med.generic_name}</p>
                    {med.brand_name && <p className="text-xs text-gray-500">{med.brand_name}</p>}
                  </div>
                  <span className="text-2xl">💊</span>
                  {med.requires_prescription && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full shrink-0">وصفة</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-white">
        <button onClick={() => setTab('pharmacies')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'pharmacies' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-gray-500'}`}>
          الصيدليات
        </button>
        <button onClick={() => setTab('medications')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'medications' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-gray-500'}`}>
          الأدوية {medications.length > 0 && `(${medications.length})`}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5">

        {/* Medications Results */}
        {tab === 'medications' && (
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {query ? `نتائج البحث عن "${query}"` : 'ابحث عن دواء'}
            </h2>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[1,2,3,4,5,6].map(i => <div key={i} className="bg-white rounded-xl p-4 animate-pulse h-40" />)}
              </div>
            ) : medications.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {medications.map((med: any) => (
                  <div key={med.id} className="bg-white rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="h-20 bg-sky-50 rounded-lg mb-3 flex items-center justify-center text-3xl">💊</div>
                    <h3 className="font-bold text-gray-900 text-sm mb-1 text-right line-clamp-2">
                      {med.generic_name_ar || med.generic_name}
                    </h3>
                    {med.brand_name && <p className="text-xs text-gray-500 mb-2 text-right">{med.brand_name}</p>}
                    {med.requires_prescription && (
                      <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full mb-2">يحتاج وصفة</span>
                    )}
                    <button
                      onClick={() => { setQuery(med.generic_name_ar || med.generic_name); setTab('pharmacies'); }}
                      className="w-full mt-2 bg-sky-500 text-white text-xs py-2 rounded-lg hover:bg-sky-600">
                      ابحث في الصيدليات
                    </button>
                  </div>
                ))}
              </div>
            ) : query.length > 1 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">لم يتم العثور على نتائج لـ "{query}"</p>
                <p className="text-sm text-gray-400">جرب البحث باسم مختلف</p>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>اكتب اسم الدواء للبحث</p>
                <p className="text-xs mt-1">مثال: باراسيتامول، أموكسيسيلين...</p>
              </div>
            )}
          </div>
        )}

        {/* Pharmacies */}
        {tab === 'pharmacies' && (
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {query ? `صيدليات تحتوي على "${query}"` : 'الصيدليات القريبة منك'}
            </h2>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl p-4 animate-pulse h-24" />)}
              </div>
            ) : pharmacies.length === 0 ? (
              <div className="text-center py-12 text-gray-500">لا توجد صيدليات قريبة</div>
            ) : (
              <div className="space-y-3">
                {pharmacies.map((pharmacy: any) => (
                  <Link href={`/pharmacies/${pharmacy.id}`} key={pharmacy.id}
                    className="bg-white rounded-xl p-4 flex gap-4 hover:shadow-md transition-shadow">
                    <div className="w-16 h-16 bg-sky-100 rounded-xl flex items-center justify-center shrink-0 text-2xl">🏥</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-1 shrink-0">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="text-sm font-medium">{parseFloat(pharmacy.rating || 0).toFixed(1)}</span>
                        </div>
                        <h3 className="font-bold text-gray-900 text-sm">{pharmacy.name_ar || pharmacy.name}</h3>
                      </div>
                      <p className="text-xs text-gray-500 text-right mb-1">{pharmacy.address}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-row-reverse">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {pharmacy.distance_km} كم
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          مفتوح
                        </span>
                        <span className="flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5" />
                          توصيل
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
