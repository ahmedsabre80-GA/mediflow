'use client';
import { useState, useEffect } from 'react';
import { Search, Phone, MapPin, Building2 } from 'lucide-react';

const PHARM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export default function DoctorPharmaciesPage() {
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');

  useEffect(() => {
    fetch(`${PHARM_API}/active`)
      .then(r => r.json())
      .then(d => setPharmacies(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = pharmacies.filter(p =>
    !search ||
    p.name_ar?.includes(search) ||
    p.name?.includes(search) ||
    p.city?.includes(search) ||
    p.phone?.includes(search)
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-indigo-500" /> الصيدليات المسجلة
        </h1>
        <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{pharmacies.length} صيدلية</span>
      </div>

      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <Search className="w-5 h-5 text-gray-400 shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث باسم الصيدلية أو المدينة أو الهاتف..."
          className="flex-1 outline-none text-sm text-gray-700" />
        {search && <button onClick={() => setSearch('')} className="text-gray-400 text-xl leading-none">×</button>}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد صيدليات مطابقة</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p: any) => (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${p.status === 'active' ? 'bg-green-100' : 'bg-gray-100'}`}>
                🏥
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-bold text-gray-900 truncate">{p.name_ar || p.name}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.status === 'active' ? 'نشطة' : 'غير نشطة'}
                  </span>
                </div>
                {p.city && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {p.city}
                    {p.address && ` — ${p.address}`}
                  </p>
                )}
                {p.phone && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" /> {p.phone}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
