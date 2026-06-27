'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Stethoscope } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function DoctorLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${AUTH_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل تسجيل الدخول');
      if (data.data.role !== 'doctor') throw new Error('هذا الحساب ليس حساب طبيب');
      localStorage.setItem('doctor-token', data.data.accessToken);
      localStorage.setItem('doctor-id', data.data.userId);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-sky-50 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">بوابة الأطباء</h1>
          <p className="text-gray-500 text-sm mt-1">ميديفلو — منصة الرعاية الصحية</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                dir="ltr" placeholder="doctor@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                dir="ltr" placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          طبيب جديد؟{' '}
          <Link href="/auth/register" className="text-teal-600 font-semibold hover:underline">سجّل الآن</Link>
        </p>
      </div>
    </div>
  );
}
