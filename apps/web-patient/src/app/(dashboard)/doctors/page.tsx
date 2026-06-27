'use client';
import { useState } from 'react';
import { Search, Star, Clock, Video, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';

const MOCK_DOCTORS = [
  { id: '1', name: 'د. أحمد الراوي', specialization: 'طب القلب', rating: 4.9, reviews: 234, fee: 25000, available: true, image: '👨‍⚕️' },
  { id: '2', name: 'د. سارة حسن', specialization: 'طب الأطفال', rating: 4.7, reviews: 189, fee: 20000, available: true, image: '👩‍⚕️' },
  { id: '3', name: 'د. محمد علي', specialization: 'طب عام', rating: 4.8, reviews: 312, fee: 15000, available: false, image: '👨‍⚕️' },
  { id: '4', name: 'د. فاطمة الزهراء', specialization: 'طب النساء والتوليد', rating: 4.9, reviews: 156, fee: 30000, available: true, image: '👩‍⚕️' },
  { id: '5', name: 'د. علي الجبوري', specialization: 'طب الأعصاب', rating: 4.6, reviews: 98, fee: 35000, available: true, image: '👨‍⚕️' },
  { id: '6', name: 'د. نور الهدى', specialization: 'طب الجلدية', rating: 4.8, reviews: 201, fee: 22000, available: false, image: '👩‍⚕️' },
];

const SPECIALIZATIONS = ['الكل', 'طب عام', 'طب القلب', 'طب الأطفال', 'طب النساء والتوليد', 'طب الأعصاب', 'طب الجلدية'];

export default function DoctorsPage() {
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('الكل');
  const [availableOnly, setAvailableOnly] = useState(false);

  const filtered = MOCK_DOCTORS.filter(d => {
    const matchSearch = !search || d.name.includes(search) || d.specialization.includes(search);
    const matchSpec = spec === 'الكل' || d.specialization === spec;
    const matchAvail = !availableOnly || d.available;
    return matchSearch && matchSpec && matchAvail;
  });

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-sky-500 px-4 py-6 pt-12">
        <h1 className="text-xl font-bold text-white mb-4">استشر طبيب</h1>
        <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن طبيب أو تخصص..."
            className="flex-1 outline-none text-sm" dir="rtl" />
        </div>
      </div>

      {/* Specialization Filter */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 w-max">
          {SPECIALIZATIONS.map(s => (
            <button key={s} onClick={() => setSpec(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${spec === s ? 'bg-sky-500 text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Available Toggle */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} className="w-4 h-4 accent-sky-500" />
          <span className="text-sm text-gray-700">المتاحون الآن فقط</span>
        </label>
        <span className="text-sm text-gray-500">{filtered.length} طبيب</span>
      </div>

      {/* Doctors List */}
      <div className="px-4 pb-8 space-y-4">
        {filtered.map(doctor => (
          <div key={doctor.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center text-3xl shrink-0">
                {doctor.image}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${doctor.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {doctor.available ? 'متاح الآن' : 'غير متاح'}
                  </span>
                  <h3 className="font-bold text-gray-900">{doctor.name}</h3>
                </div>
                <p className="text-sm text-gray-500 text-right mt-1">{doctor.specialization}</p>
                <div className="flex items-center justify-end gap-3 mt-2">
                  <span className="text-sm text-gray-500">{doctor.reviews} تقييم</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-medium">{doctor.rating}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div className="flex gap-2">
                <button className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                  <Video className="w-4 h-4" /> فيديو
                </button>
                <button className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                  <MessageCircle className="w-4 h-4" /> دردشة
                </button>
              </div>
              <div className="text-right">
                <p className="font-bold text-sky-600">{doctor.fee.toLocaleString('ar-IQ')} د.ع</p>
                <p className="text-xs text-gray-500">للاستشارة</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
