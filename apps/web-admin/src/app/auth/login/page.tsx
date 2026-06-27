'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Shield } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function AdminLoginPage() {
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
      const role = data.data?.role || '';
      if (!['admin', 'super_admin', 'auditor', 'support'].includes(role)) {
        throw new Error('ليس لديك صلاحية الوصول إلى لوحة الإدارة');
      }
      localStorage.setItem('admin-token', data.data.accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-sky-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">لوحة إدارة ميديفلو</h1>
          <p className="text-gray-400 text-sm mt-1">للمشرفين فقط</p>
        </div>
        <div className="bg-gray-800 rounded-2xl p-8">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">البريد الإلكتروني</label>
              <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                dir="ltr" placeholder="admin@mediflow.io"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">كلمة المرور</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                dir="ltr" placeholder="••••••••"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
