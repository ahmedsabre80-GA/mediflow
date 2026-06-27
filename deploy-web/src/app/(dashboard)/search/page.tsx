'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Filter, Star, Clock, Truck } from 'lucide-react';
import { pharmaciesApi, medicationsApi } from '@/services/api.client';
import Link from 'next/link';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sortBy, setSortBy] = useState<'distance' | 'price' | 'rating'>('distance');

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLocation({ lat: 33.3152, lng: 44.3661 }), // Baghdad default
    );
  }, []);

  // Search medications
  const { data: medications, isLoading: medsLoading } = useQuery({
    queryKey: ['medications', query],
    queryFn: () => medicationsApi.search({ q: query }).then((r) => r.data.data),
    enabled: query.length > 2,
    staleTime: 30000,
  });

  // Search nearby pharmacies
  const { data: pharmacies, isLoading: pharmsLoading } = useQuery({
    queryKey: ['pharmacies-nearby', userLocation],
    queryFn: () =>
      pharmaciesApi.getNearby({
        lat: userLocation!.lat,
        lng: userLocation!.lng,
        radiusKm: 10,
      }).then((r) => r.data.data),
    enabled: !!userLocation,
  });

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Search Header */}
      <div className="bg-white border-b sticky top-0 z-10 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-3">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن دواء..."
              className="bg-transparent flex-1 outline-none text-sm"
              dir="rtl"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-sky-600">
            <MapPin className="w-4 h-4" />
            <span>بغداد</span>
          </div>
        </div>

        {/* Sort Tabs */}
        <div className="max-w-6xl mx-auto flex gap-2 mt-3">
          {[
            { key: 'distance', label: 'الأقرب' },
            { key: 'price', label: 'الأرخص' },
            { key: 'rating', label: 'الأعلى تقييماً' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key as typeof sortBy)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                sortBy === s.key
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Medication Results */}
        {query.length > 2 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              نتائج البحث عن "{query}"
            </h2>
            {medsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                    <div className="h-32 bg-gray-200 rounded-lg mb-3" />
                    <div className="h-4 bg-gray-200 rounded mb-2 w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : medications?.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {medications.map((med: any) => (
                  <Link
                    href={`/medications/${med.id}`}
                    key={med.id}
                    className="bg-white rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="h-32 bg-sky-50 rounded-lg mb-3 flex items-center justify-center">
                      <span className="text-4xl">💊</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
                      {med.generic_name}
                    </h3>
                    {med.brand_name && (
                      <p className="text-xs text-gray-500 mb-2">{med.brand_name}</p>
                    )}
                    {med.requires_prescription && (
                      <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                        يحتاج وصفة
                      </span>
                    )}
                    <button className="w-full mt-3 bg-sky-500 text-white text-sm py-2 rounded-lg hover:bg-sky-600 transition-colors">
                      طلب الآن
                    </button>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">لم يتم العثور على نتائج</p>
                <p className="text-sm">جرب البحث باسم مختلف أو</p>
                <Link href="/prescriptions/upload" className="text-sky-600 font-medium hover:underline">
                  ارفع وصفتك الطبية
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Nearby Pharmacies */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">الصيدليات القريبة منك</h2>
          {pharmsLoading ? (
            <div className="space-y-4">
              {[1,2,3].map((i) => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse flex gap-4">
                  <div className="w-20 h-20 bg-gray-200 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {(pharmacies || []).map((pharmacy: any) => (
                <Link
                  href={`/pharmacies/${pharmacy.id}`}
                  key={pharmacy.id}
                  className="bg-white rounded-xl p-4 flex gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="w-20 h-20 bg-sky-100 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                    {pharmacy.front_image_url ? (
                      <img src={pharmacy.front_image_url} alt={pharmacy.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">🏥</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-bold text-gray-900">{pharmacy.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-medium">{pharmacy.rating}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {parseFloat(pharmacy.distance_km).toFixed(1)} كم
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        مفتوح الآن
                      </span>
                      <span className="flex items-center gap-1">
                        <Truck className="w-4 h-4" />
                        توصيل مجاني
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
