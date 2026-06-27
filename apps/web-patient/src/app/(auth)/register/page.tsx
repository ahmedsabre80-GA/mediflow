'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Pill, Eye, EyeOff } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });

  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${AUTH_API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'patient' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');
      localStorage.setItem('mediflow-auth', JSON.stringify({
        state: { accessToken: data.data.accessToken, refreshToken: data.data.refreshToken, user: { id: data.data.userId, role: 'patient' }, isAuthenticated: true }
      }));
      router.push('/dashboard');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
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
          <h1 className="text-2xl font-bold text-gray-900">إنشاء حساب جديد</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الأول</label>
                <input value={form.firstName} onChange={e => update('firstName', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الأخير</label>
                <input value={form.lastName} onChange={e => update('lastName', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input type="email" dir="ltr" value={form.email} onChange={e => update('email', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الهاتف</label>
              <input type="tel" dir="ltr" value={form.phone} onChange={e => update('phone', e.target.value)}
                placeholder="+9647801234567"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} dir="ltr" value={form.password} onChange={e => update('password', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required minLength={8} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-600 mt-6">
          لديك حساب؟ <Link href="/auth/login" className="text-sky-600 font-semibold hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
