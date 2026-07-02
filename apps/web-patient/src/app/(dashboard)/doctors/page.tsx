'use client';
import { Search, Stethoscope } from 'lucide-react';
import { useState } from 'react';

const SPECIALIZATIONS = ['الكل', 'طب عام', 'طب القلب', 'طب الأطفال', 'طب النساء والتوليد', 'طب الأعصاب', 'طب الجلدية'];

export default function DoctorsPage() {
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('الكل');

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

      <div className="px-4 pt-16 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-sky-100 rounded-full flex items-center justify-center mb-4">
          <Stethoscope className="w-10 h-10 text-sky-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-700 mb-2">قريباً</h2>
        <p className="text-sm text-gray-400 max-w-xs">خدمة الاستشارات الطبية قيد التطوير. ستتمكن قريباً من التواصل مع أطباء متخصصين.</p>
      </div>
    </div>
  );
}
