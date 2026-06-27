'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, FileText, Stethoscope, Package, Star, ChevronLeft, Bell } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function PatientDashboard() {
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('mediflow-auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserName(parsed.state?.user?.email?.split('@')[0] || 'مريض');
      }
    } catch {}

    fetch(`${PHARMACY_API}/pharmacies/nearby?lat=33.3152&lng=44.3661&radiusKm=10&limit=3`)
      .then(r => r.json())
      .then(d => setPharmacies(d.data || []))
      .catch(() => {});
  }, []);

  const quickActions = [
    { label: 'ابحث عن دواء', href: '/search', icon: '🔍', color: 'bg-sky-50 text-sky-700' },
    { label: 'وصفاتي', href: '/prescriptions', icon: '📋', color: 'bg-teal-50 text-teal-700' },
    { label: 'استشر طبيب', href: '/doctors', icon: '👨‍⚕️', color: 'bg-indigo-50 text-indigo-700' },
    { label: 'طلباتي', href: '/orders', icon: '📦', color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-500 to-teal-500 px-4 py-8 pt-12">
        <div className="flex items-center justify-between mb-4">
          <button className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </button>
          <div className="text-right">
            <p className="text-sky-100 text-sm">مرحباً بك</p>
            <h1 className="text-white font-bold text-lg">{userName}</h1>
          </div>
        </div>

        {/* Search Bar */}
        <Link href="/search" className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-md">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="text-gray-400 text-sm">ابحث عن دواء أو صيدلية...</span>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-5">
        <h2 className="font-bold text-gray-900 mb-3">ماذا تريد؟</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}
              className={`${action.color} rounded-2xl p-3 flex flex-col items-center gap-2 hover:opacity-90 transition-opacity`}>
              <span className="text-2xl">{action.icon}</span>
              <span className="text-xs font-medium text-center leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Emergency Banner */}
      <div className="px-4 mb-5">
        <Link href="/medication/request"
          className="flex items-center justify-between bg-red-50 border border-red-200 rounded-2xl p-4">
          <span className="text-red-600 text-lg">←</span>
          <div className="text-right">
            <p className="font-bold text-red-700">🚨 طلب طارئ</p>
            <p className="text-xs text-red-500">اطلب دواءك بأولوية قصوى</p>
          </div>
        </Link>
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
          ) : (
            pharmacies.map((p: any) => (
              <Link href={`/pharmacies/${p.id}`} key={p.id}
                className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center text-2xl shrink-0">🏥</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm text-right">{p.name_ar || p.name}</p>
                  <p className="text-xs text-gray-500 text-right">{p.distance_km} كم</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{parseFloat(p.rating).toFixed(1)}</span>
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                </div>
              </Link>
            ))
          )}
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
