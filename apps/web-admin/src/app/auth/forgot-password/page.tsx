'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Shield, Loader2, CheckCircle, ArrowRight, Info } from 'lucide-react';

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
      // Check if entered email matches registered or substitute email stored locally
      const registeredEmail = typeof window !== 'undefined' ? localStorage.getItem('admin-email') : null;
      const substituteEmail = typeof window !== 'undefined' ? localStorage.getItem('admin-substitute-email') : null;
      const isKnownEmail = !registeredEmail || email === registeredEmail || email === substituteEmail;
      if (!isKnownEmail) {
        throw new Error('البريد الإلكتروني غير مطابق للبريد المسجّل أو الاحتياطي');
      }
      const res = await fetch(`${PHARMACY_API}/admin-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'admin',
          actionType: 'reset_password',
          requesterName: name,
          requesterEntity: 'لوحة الإدارة',
          employeeEmail: email,
          reason: 'طلب إعادة تعيين كلمة مرور المشرف',
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">تم إرسال طلبك</h2>
            <p className="text-gray-400 text-sm mb-2">
              وصل طلبك للمسؤول الأعلى. سيتم إعادة تعيين كلمة المرور والتواصل معك مباشرة.
            </p>
            <p className="text-xs text-gray-500 mb-6">يُرجى الانتظار — قد يستغرق الأمر بعض الوقت</p>
            <Link href="/auth/login" className="inline-flex items-center gap-2 text-sky-400 font-medium text-sm hover:underline">
              <ArrowRight className="w-4 h-4" />
              العودة لتسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-sky-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">نسيت كلمة المرور؟</h1>
          <p className="text-gray-400 text-sm mt-1">لوحة إدارة ميديفلو</p>
        </div>
        <div className="bg-gray-800 rounded-2xl p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
          )}
          <div className="flex items-start gap-2 bg-sky-900/30 border border-sky-700/40 rounded-xl px-4 py-3 mb-4 text-xs text-sky-300" dir="rtl">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>أدخل بريدك المسجّل أو البريد الاحتياطي الذي أضفته في صفحة فريق المنصة</span>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">الاسم الكامل</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="اسم المشرف"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">البريد الإلكتروني</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                dir="ltr" placeholder="admin@mediflow.io"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري الإرسال...' : 'إرسال طلب إعادة التعيين'}
            </button>
          </form>
        </div>
        <div className="text-center mt-4">
          <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-300">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
