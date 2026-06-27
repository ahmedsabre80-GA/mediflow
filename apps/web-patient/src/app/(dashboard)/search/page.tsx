'use client';
import { useState, useEffect } from 'react';
import { Search, MapPin, Star, Clock, Truck } from 'lucide-react';
import Link from 'next/link';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'pharmacies' | 'medications'>('pharmacies');

  useEffect(() => {
    loadPharmacies();
  }, []);

  useEffect(() => {
    if (query.length > 2) searchMedications();
    else setMedications([]);
  }, [query]);

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

  const searchMedications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${PHARMACY_API}/medications/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setMedications(data.data || []);
    } catch {
      setMedications([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Search Header */}
      <div className="bg-white border-b sticky top-0 z-10 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-3">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ابحث عن دواء أو صيدلية..."
              className="bg-transparent flex-1 outline-none text-sm"
              dir="rtl"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-sky-600">
            <MapPin className="w-4 h-4" />
            <span>بغداد</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-4xl mx-auto flex gap-2 mt-3">
          <button onClick={() => setTab('pharmacies')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'pharmacies' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            الصيدليات
          </button>
          <button onClick={() => setTab('medications')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'medications' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            الأدوية
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Medications Results */}
        {tab === 'medications' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {query.length > 2 ? `نتائج البحث عن "${query}"` : 'ابحث عن دواء'}
            </h2>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-xl p-4 animate-pulse h-40" />)}
              </div>
            ) : medications.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {medications.map((med: any) => (
                  <div key={med.id} className="bg-white rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="h-24 bg-sky-50 rounded-lg mb-3 flex items-center justify-center text-4xl">💊</div>
                    <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2 text-right">
                      {med.generic_name_ar || med.generic_name}
                    </h3>
                    {med.brand_name && <p className="text-xs text-gray-500 mb-2 text-right">{med.brand_name}</p>}
                    {med.requires_prescription && (
                      <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">يحتاج وصفة</span>
                    )}
                    <button className="w-full mt-3 bg-sky-500 text-white text-sm py-2 rounded-lg hover:bg-sky-600 transition-colors">
                      طلب الآن
                    </button>
                  </div>
                ))}
              </div>
            ) : query.length > 2 ? (
              <div className="text-center py-12 text-gray-500">لم يتم العثور على نتائج</div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>اكتب اسم الدواء للبحث</p>
              </div>
            )}
          </div>
        )}

        {/* Pharmacies */}
        {tab === 'pharmacies' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">الصيدليات القريبة منك</h2>
            {loading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl p-4 animate-pulse h-24" />)}
              </div>
            ) : pharmacies.length === 0 ? (
              <div className="text-center py-12 text-gray-500">لا توجد صيدليات قريبة</div>
            ) : (
              <div className="space-y-4">
                {pharmacies.map((pharmacy: any) => (
                  <Link href={`/pharmacies/${pharmacy.id}`} key={pharmacy.id}
                    className="bg-white rounded-xl p-4 flex gap-4 hover:shadow-md transition-shadow">
                    <div className="w-20 h-20 bg-sky-100 rounded-xl flex items-center justify-center shrink-0 text-3xl">🏥</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-1 shrink-0">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="text-sm font-medium">{parseFloat(pharmacy.rating).toFixed(1)}</span>
                        </div>
                        <h3 className="font-bold text-gray-900">{pharmacy.name_ar || pharmacy.name}</h3>
                      </div>
                      <p className="text-sm text-gray-500 text-right mb-2">{pharmacy.address}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500 flex-row-reverse">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {pharmacy.distance_km} كم
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          مفتوح الآن
                        </span>
                        <span className="flex items-center gap-1">
                          <Truck className="w-4 h-4" />
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
