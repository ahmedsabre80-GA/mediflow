'use client';
import Link from 'next/link';
import { Clock, Mail } from 'lucide-react';
import { loadConfig } from '@/lib/config';
import { useEffect, useState } from 'react';

export default function PendingApprovalPage() {
  const [primary, setPrimary] = useState('#f59e0b');
  useEffect(() => { setPrimary(loadConfig().primaryColor || '#f59e0b'); }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" dir="rtl"
      style={{ background: `linear-gradient(135deg, ${primary}15, ${primary}05)` }}>
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">طلبك قيد المراجعة</h1>
          <p className="text-gray-600 mb-6">تم استلام طلب تسجيل مخزنك بنجاح. سيقوم فريق الإدارة بمراجعة وثائقك والموافقة على طلبك.</p>
          <div className="text-right space-y-3 mb-6 bg-gray-50 rounded-xl p-4">
            {['مراجعة رخصة التوزيع والوثائق (1-3 أيام)', 'إشعارك عبر البريد الإلكتروني عند الموافقة', 'تسجيل الدخول وتغيير كلمة المرور', 'البدء بالتوزيع للصيدليات'].map((text, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white" style={{ backgroundColor: primary }}>{i+1}</div>
                <p className="text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
          <Link href="/auth/login" className="block w-full text-white font-semibold py-3 rounded-xl transition-all hover:opacity-90" style={{ backgroundColor: primary }}>
            العودة لصفحة الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
