'use client';
import { useState, useEffect } from 'react';
import { Search, Phone, MapPin, Building2, Stethoscope } from 'lucide-react';

const PHARM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API  = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function DirectoryPage() {
  const [tab,          setTab]          = useState<'pharmacy' | 'doctor'>('pharmacy');
  const [pharmacies,   setPharmacies]   = useState<any[]>([]);
  const [doctors,      setDoctors]      = useState<any[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState('');

  useEffect(() => {
    if (tab === 'pharmacy' && pharmacies.length === 0) {
      setLoading(true);
      fetch(`${PHARM_API}/active`)
        .then(r => r.json()).then(d => setPharmacies(d.data || [])).catch(() => {})
        .finally(() => setLoading(false));
    }
    if (tab === 'doctor' && doctors.length === 0) {
      setLoading(true);
      fetch(`${AUTH_API}/auth/users/doctors`)
        .then(r => r.json())
        .then(d => {
          const list = (d.data || []).map((u: any) => ({
            id:             u.id,
            name:           [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
            email:          u.email,
            phone:          u.phone || '',
            specialization: 'طب عام',
          }));
          setDoctors(list);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    setSearch('');
  }, [tab]);

  const filteredPharm = pharmacies.filter(p =>
    !search || p.name_ar?.includes(search) || p.name?.includes(search) || p.city?.includes(search) || p.phone?.includes(search)
  );
  const filteredDocs = doctors.filter(d =>
    !search || d.name?.includes(search) || d.specialization?.includes(search) || d.phone?.includes(search)
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الدليل</h1>
        <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          {tab === 'pharmacy' ? `${pharmacies.length} صيدلية` : `${doctors.length} طبيب`}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {([
          { k: 'pharmacy', l: 'الصيدليات', icon: '🏥' },
          { k: 'doctor',   l: 'الأطباء',   icon: '👨‍⚕️' },
        ] as const).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === t.k ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <span>{t.icon}</span>{t.l}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <Search className="w-5 h-5 text-gray-400 shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'pharmacy' ? 'ابحث باسم الصيدلية أو المدينة...' : 'ابحث باسم الطبيب أو التخصص...'}
          className="flex-1 outline-none text-sm text-gray-700" />
        {search && <button onClick={() => setSearch('')} className="text-gray-400 text-xl leading-none">×</button>}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : tab === 'pharmacy' ? (
        filteredPharm.length === 0 ? (
          <div className="text-center py-16 text-gray-400">لا توجد صيدليات مطابقة</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPharm.map((p: any) => (
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
                  {p.city && <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {p.city}{p.address ? ` — ${p.address}` : ''}</p>}
                  {p.phone && <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><Phone className="w-3 h-3" /> {p.phone}</p>}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        filteredDocs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">لا يوجد أطباء مطابقون</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDocs.map((d: any) => (
              <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-2xl shrink-0">
                  👨‍⚕️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate mb-1">{d.name}</p>
                  <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg font-medium">{d.specialization}</span>
                  {d.phone && <p className="text-xs text-gray-500 flex items-center gap-1 mt-2"><Phone className="w-3 h-3" /> {d.phone}</p>}
                  {d.email && <p className="text-xs text-gray-400 mt-0.5 truncate">{d.email}</p>}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
