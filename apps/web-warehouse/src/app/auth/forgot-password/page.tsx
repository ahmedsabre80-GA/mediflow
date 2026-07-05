'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { loadConfig, type WarehouseConfig } from '@/lib/config';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<WarehouseConfig | null>(null);

  useEffect(() => { setConfig(loadConfig()); }, []);

  const primary = config?.primaryColor || '#f59e0b';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${PHARMACY_API}/admin-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'warehouse',
          actionType: 'reset_password',
          requesterName: name,
          requesterEntity: config?.name || 'بوابة المذاخر',
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
      <div className="min-h-screen flex items-center justify-center px-4" dir="rtl"
        style={{ background: `linear-gradient(135deg, ${primary}15, ${primary}05)` }}>
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">تم إرسال طلبك</h2>
            <p className="text-gray-600 text-sm mb-2">
              وصل طلبك لفريق إدارة المنصة. سيقومون بإعادة تعيين كلمة المرور الخاصة بك
              وإرسال كلمة مرور مؤقتة عبر رسائل المنصة.
            </p>
            <p className="text-xs text-gray-400 mb-6">يُرجى الانتظار — قد يستغرق الأمر بعض الوقت</p>
            <Link href="/auth/login" className="inline-flex items-center gap-2 font-medium text-sm hover:underline"
              style={{ color: primary }}>
              <ArrowRight className="w-4 h-4" />
              العودة لتسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" dir="rtl"
      style={{ background: `linear-gradient(135deg, ${primary}15, ${primary}05)` }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg"
            style={{ backgroundColor: primary }}>
            {config?.logoEmoji || '🏭'}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">نسيت كلمة المرور؟</h1>
          <p className="text-gray-500 text-sm mt-1">{config?.name || 'بوابة المذاخر'} — ميديفلو</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="الاسم الكامل"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none transition-all"
                onFocus={e => e.target.style.borderColor = primary}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                dir="ltr" placeholder="warehouse@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none transition-all"
                onFocus={e => e.target.style.borderColor = primary}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 hover:opacity-90"
              style={{ backgroundColor: primary }}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري الإرسال...' : 'إرسال طلب إعادة التعيين'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          تذكّرت كلمة المرور؟{' '}
          <Link href="/auth/login" className="font-semibold hover:underline" style={{ color: primary }}>
            سجّل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
