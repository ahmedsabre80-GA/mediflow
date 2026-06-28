'use client';
import Link from 'next/link';
import { Clock, CheckCircle, Phone, Mail } from 'lucide-react';

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-teal-50 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          {/* Icon */}
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">طلبك قيد المراجعة</h1>
          <p className="text-gray-600 mb-6">
            تم استلام طلب تسجيل صيدليتك بنجاح. سيقوم فريق الإدارة بمراجعة المستندات والموافقة على طلبك في أقرب وقت.
          </p>

          {/* Steps */}
          <div className="text-right space-y-3 mb-6 bg-gray-50 rounded-xl p-4">
            <p className="font-semibold text-gray-700 mb-3">ماذا سيحدث بعد ذلك؟</p>
            {[
              { step: '1', text: 'مراجعة المستندات من قبل الإدارة (1-3 أيام عمل)', done: false },
              { step: '2', text: 'إشعارك عبر البريد الإلكتروني عند الموافقة', done: false },
              { step: '3', text: 'تسجيل الدخول وتغيير كلمة المرور', done: false },
              { step: '4', text: 'البدء باستقبال الطلبات', done: false },
            ].map(item => (
              <div key={item.step} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {item.step}
                </div>
                <p className="text-sm text-gray-600">{item.text}</p>
              </div>
            ))}
          </div>

          {/* Contact */}
          <div className="bg-sky-50 rounded-xl p-4 mb-6 text-right">
            <p className="text-sm font-semibold text-gray-700 mb-2">للاستفسار تواصل معنا:</p>
            <div className="space-y-1">
              <p className="text-sm text-gray-600 flex items-center gap-2 justify-end">
                <span>support@mediflow.io</span>
                <Mail className="w-4 h-4 text-sky-500" />
              </p>
            </div>
          </div>

          <Link href="/auth/login"
            className="block w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors">
            العودة لصفحة الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
