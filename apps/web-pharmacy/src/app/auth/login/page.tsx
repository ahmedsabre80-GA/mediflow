'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

const AUTH_API = process.env.NEXT_PUBLIC_API_URL || 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Step 1: authenticate
      const res = await fetch(`${AUTH_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل تسجيل الدخول');

      const token = data.data.accessToken;
      const userId = data.data.userId;

      // Step 2a: check if pharmacy owner
      const phRes = await fetch(`${PHARMACY_API}/by-owner/${userId}`);

      if (phRes.ok) {
        const phData = await phRes.json();
        const status = phData.data?.status;
        if (status === 'suspended') throw new Error('حسابك موقوف مؤقتاً. تواصل مع إدارة المنصة.');
        if (status === 'rejected')  throw new Error('طلب تسجيل صيدليتك مرفوض. تواصل مع إدارة المنصة.');
        if (status === 'deleted')   throw new Error('هذا الحساب محذوف من المنصة.');
        if (status === 'pending_verification') throw new Error('صيدليتك لا تزال قيد المراجعة. ستُعلَم عند الموافقة.');
        if (status !== 'active') throw new Error('حسابك غير مفعّل. تواصل مع إدارة المنصة.');

        localStorage.setItem('pharmacy-token', token);
        localStorage.setItem('pharmacy-refresh', data.data.refreshToken);
        localStorage.setItem('pharmacy-id', phData.data.id);
        localStorage.setItem('pharmacy-name', phData.data.name_ar || phData.data.name || '');
        localStorage.setItem('pharmacy-role', 'owner');
        localStorage.setItem('pharmacy-permissions', JSON.stringify(['*']));
        router.push('/dashboard');
        return;
      }

      // Step 2b: check if pharmacy staff member
      const staffRes = await fetch(`${PHARMACY_API}/staff/by-user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (staffRes.ok) {
        const staffData = await staffRes.json();
        const staff = staffData.data;
        localStorage.setItem('pharmacy-token', token);
        localStorage.setItem('pharmacy-refresh', data.data.refreshToken);
        localStorage.setItem('pharmacy-id', staff.pharmacy_id);
        localStorage.setItem('pharmacy-name', staff.pharmacy_name_ar || staff.pharmacy_name || '');
        localStorage.setItem('pharmacy-role', staff.role);
        localStorage.setItem('pharmacy-permissions', JSON.stringify(staff.permissions || []));
        localStorage.setItem('pharmacy-staff-id', staff.id);
        router.push('/dashboard');
        return;
      }

      throw new Error('لا توجد صيدلية مسجّلة بهذا الحساب في المنصة.');
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
          <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">🏥</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تسجيل دخول الصيدلية</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="pharmacy@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                  dir="ltr"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-600 mt-4">
          <Link href="/auth/register" className="text-sky-600 font-semibold hover:underline">تسجيل صيدلية جديدة</Link>
        </p>
      </div>
    </div>
  );
}
