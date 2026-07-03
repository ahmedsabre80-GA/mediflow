'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Star, ChevronLeft } from 'lucide-react';

function isPharmacyOpen(p: any): boolean {
  if (p.status === 'inactive') return false;
  if (!p.opening_hours) return p.status === 'active';
  try {
    const hours = typeof p.opening_hours === 'string' ? JSON.parse(p.opening_hours) : p.opening_hours;
    const now = new Date();
    const day = now.getDay();
    const h = hours[day];
    if (!h || !h.open) return false;
    const [fh, fm] = h.from.split(':').map(Number);
    const [th, tm] = h.to.split(':').map(Number);
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= fh * 60 + fm && cur <= th * 60 + tm;
  } catch { return p.status === 'active'; }
}

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function PatientDashboard() {
  const [pharmacies, setPharmacies] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${PHARMACY_API}/pharmacies/nearby?lat=33.3152&lng=44.3661&radiusKm=15&limit=3`)
      .then(r => r.json())
      .then(d => setPharmacies(d.data || []))
      .catch(() => {});
  }, []);

  const quickActions = [
    { label: 'ابحث عن دواء', href: '/search',  icon: '🔍', color: 'bg-sky-50 text-sky-700' },
    { label: 'استشر طبيب',   href: '/doctors', icon: '👨‍⚕️', color: 'bg-indigo-50 text-indigo-700' },
    { label: 'طلباتي',       href: '/orders',  icon: '📦', color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

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
          <h2 className="font-bold text-gray-900">صيدليات قريبة</h2>
        </div>
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
                <p className="text-xs text-gray-500">{p.distance_km} كم</p>
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
            <p className="text-3xl font-bold">0</p>
            <p className="text-xs text-indigo-300">ابدأ التسوق لتجميع النقاط</p>
          </div>
        </div>
      </div>
    </div>
  );
}
