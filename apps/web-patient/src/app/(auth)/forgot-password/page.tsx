'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Pill, Loader2, CheckCircle, ArrowRight } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${PHARMACY_API}/admin-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'patient',
          actionType: 'reset_password',
          requesterName: name,
          requesterEntity: 'بوابة المرضى',
          employeeEmail: email,
          reason: 'طلب إعادة تعيين كلمة المرور',
        }),
      });
      if (!res.ok) throw new Error('تعذّر إرسال الطلب. حاول مرة أخرى.');
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-teal-50 px-4" dir="rtl">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">تم إرسال طلبك</h2>
            <p className="text-gray-600 text-sm mb-2">
              وصل طلبك لفريق إدارة المنصة. سيقومون بإعادة تعيين كلمة المرور الخاصة بك
              وإرسال كلمة مرور مؤقتة إليك عبر رسائل المنصة.
            </p>
            <p className="text-xs text-gray-400 mb-6">يُرجى الانتظار — قد يستغرق الأمر بعض الوقت</p>
            <Link href="/login" className="inline-flex items-center gap-2 text-sky-600 font-medium text-sm hover:underline">
              <ArrowRight className="w-4 h-4" />
              العودة لتسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-teal-50 px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-sky-700">ميديفلو</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">نسيت كلمة المرور؟</h1>
          <p className="text-gray-600 mt-1 text-sm">أدخل بياناتك وسيتواصل معك فريق الدعم</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="أدخل اسمك الكامل"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                dir="ltr" placeholder="example@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري الإرسال...' : 'إرسال طلب إعادة التعيين'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          تذكّرت كلمة المرور؟{' '}
          <Link href="/login" className="text-sky-600 font-semibold hover:underline">سجّل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
