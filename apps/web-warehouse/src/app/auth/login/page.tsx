'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { loadConfig, type WarehouseConfig } from '@/lib/config';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function WarehouseLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<WarehouseConfig | null>(null);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

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

      const allowedRoles = ['warehouse_owner', 'warehouse_manager', 'warehouse_staff'];
      if (!allowedRoles.includes(data.data.role)) {
        throw new Error('ليس لديك صلاحية الوصول إلى بوابة المذاخر');
      }

      localStorage.setItem('warehouse-token', data.data.accessToken);
      localStorage.setItem('warehouse-user-id', data.data.userId);
      localStorage.setItem('warehouse-user-role', data.data.role);
      const fullName = [data.data.firstName, data.data.lastName].filter(Boolean).join(' ');
      if (fullName) localStorage.setItem('warehouse-name', `مستودع — ${fullName}`);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const primary = config?.primaryColor || '#f59e0b';
  const name = config?.name || 'بوابة المذاخر';
  const tagline = config?.tagline || 'ميديفلو — إدارة التوزيع';
  const emoji = config?.logoEmoji || '🏭';

  return (
    <div className="min-h-screen flex items-center justify-center px-4" dir="rtl"
      style={{ background: `linear-gradient(135deg, ${primary}15, ${primary}05)` }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg"
            style={{ backgroundColor: primary }}>
            {emoji}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
          <p className="text-gray-500 text-sm mt-1">{tagline}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                dir="ltr" placeholder="warehouse@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none transition-all"
                style={{ '--tw-ring-color': primary } as any}
                onFocus={e => e.target.style.borderColor = primary}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
                required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                dir="ltr" placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none transition-all"
                onFocus={e => e.target.style.borderColor = primary}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
                required />
            </div>

            <div className="flex justify-end">
              <a href="/auth/forgot-password" className="text-sm hover:underline" style={{ color: primary }}>
                نسيت كلمة المرور؟
              </a>
            </div>
            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 hover:opacity-90"
              style={{ backgroundColor: primary }}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          مستودع جديد؟{' '}
          <Link href="/auth/register" className="font-semibold hover:underline" style={{ color: primary }}>
            سجّل الآن
          </Link>
        </p>
      </div>
    </div>
  );
}
