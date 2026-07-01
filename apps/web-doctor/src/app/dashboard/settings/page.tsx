'use client';
import { useRouter } from 'next/navigation';
import { Calendar, ArrowLeft } from 'lucide-react';

export default function DoctorSettingsPage() {
  const router = useRouter();
  return (
    <div className="space-y-6 max-w-xl" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">الإعدادات</h1>
      <button onClick={() => router.push('/dashboard/appointments')}
        className="w-full flex items-center justify-between bg-white rounded-2xl shadow-sm p-5 hover:bg-gray-50 transition-colors group">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-teal-600" />
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900">جدول الدوام</p>
            <p className="text-sm text-gray-500 mt-0.5">تحديد أوقات العمل والسعة الاستيعابية لكل يوم</p>
          </div>
        </div>
        <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-teal-500 transition-colors" />
      </button>
    </div>
  );
}
