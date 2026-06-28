'use client';
import Link from 'next/link';
import { Clock, Mail } from 'lucide-react';

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-sky-50 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">طلبك قيد المراجعة</h1>
          <p className="text-gray-600 mb-6">
            تم استلام طلب تسجيلك كطبيب بنجاح. سيقوم فريق الإدارة بمراجعة بياناتك وشهاداتك والموافقة على طلبك.
          </p>
          <div className="text-right space-y-3 mb-6 bg-gray-50 rounded-xl p-4">
            <p className="font-semibold text-gray-700 mb-3">ماذا سيحدث بعد ذلك؟</p>
            {[
              'مراجعة الترخيص الطبي والشهادات (1-3 أيام عمل)',
              'إشعارك عبر البريد الإلكتروني عند الموافقة',
              'تسجيل الدخول وتغيير كلمة المرور',
              'البدء باستقبال المرضى',
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-xs font-bold shrink-0">{i+1}</div>
                <p className="text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
          <div className="bg-teal-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-600 flex items-center gap-2 justify-end">
              <span>support@mediflow.io</span>
              <Mail className="w-4 h-4 text-teal-500" />
            </p>
          </div>
          <Link href="/auth/login" className="block w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl transition-colors">
            العودة لصفحة الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
