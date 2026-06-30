'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Stethoscope, Clock } from 'lucide-react';

export default function DoctorDashboard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('doctor-token');
    if (!token) {
      router.replace('/auth/login');
      return;
    }
    setChecking(false);
  }, [router]);

  if (checking) return null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
      <div className="text-center max-w-md mx-auto">
        <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Stethoscope className="w-10 h-10 text-teal-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">مرحباً بك في بوابة الأطباء</h1>
        <p className="text-gray-500 mb-6 leading-relaxed">
          لوحة التحكم قيد التطوير. سيتم إضافة مواعيدك ووصفاتك ومعلومات المرضى قريباً.
        </p>
        <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">قريباً — جاري تفعيل الخدمات</span>
        </div>
      </div>
    </div>
  );
}
