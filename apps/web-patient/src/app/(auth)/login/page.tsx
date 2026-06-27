'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Pill } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
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
      if (!res.ok) throw new Error(data?.error?.title || 'بيانات الدخول غير صحيحة');
      localStorage.setItem('mediflow-auth', JSON.stringify({
        state: {
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
          user: { id: data.data.userId, role: data.data.role },
          isAuthenticated: true,
        }
      }));
      router.push('/search');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900">مرحباً بعودتك</h1>
          <p className="text-gray-600 mt-1">سجّل دخولك للمتابعة</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني أو رقم الهاتف</label>
              <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                dir="ltr" placeholder="example@email.com أو +9647801234567"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" dir="ltr"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link href="/auth/forgot-password" className="text-sm text-sky-600 hover:underline">
                نسيت كلمة المرور؟
              </Link>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          ليس لديك حساب؟{' '}
          <Link href="/auth/register" className="text-sky-600 font-semibold hover:underline">سجّل الآن مجاناً</Link>
        </p>
      </div>
    </div>
  );
}
