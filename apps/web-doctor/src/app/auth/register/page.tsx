'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Stethoscope } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

const SPECIALIZATIONS = [
  'طب عام', 'طب الأطفال', 'طب القلب', 'طب الأعصاب', 'طب العيون',
  'طب الأسنان', 'طب الجلدية', 'طب النساء والتوليد', 'جراحة عامة',
  'طب الطوارئ', 'طب الباطنية', 'طب العظام', 'طب الأنف والأذن والحنجرة',
];

export default function DoctorRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    specialization: '', licenseNumber: '', licenseExpiry: '', consultationFee: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${AUTH_API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: 'doctor',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');
      localStorage.setItem('doctor-token', data.data.accessToken);
      localStorage.setItem('doctor-id', data.data.userId);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-sky-50 px-4 py-8" dir="rtl">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تسجيل طبيب جديد</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأول</label>
                <input value={form.firstName} onChange={e => update('firstName', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأخير</label>
                <input value={form.lastName} onChange={e => update('lastName', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
              <input type="email" dir="ltr" value={form.email} onChange={e => update('email', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
              <input type="tel" dir="ltr" value={form.phone} onChange={e => update('phone', e.target.value)}
                placeholder="+9647801234567"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التخصص</label>
              <select value={form.specialization} onChange={e => update('specialization', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required>
                <option value="">اختر التخصص</option>
                {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الترخيص الطبي</label>
              <input dir="ltr" value={form.licenseNumber} onChange={e => update('licenseNumber', e.target.value)}
                placeholder="MED-2024-001234"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رسوم الاستشارة (دينار عراقي)</label>
              <input type="number" dir="ltr" value={form.consultationFee} onChange={e => update('consultationFee', e.target.value)}
                placeholder="25000"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
              <input type="password" dir="ltr" value={form.password} onChange={e => update('password', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري التسجيل...' : 'إنشاء حساب الطبيب'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          لديك حساب؟ <Link href="/auth/login" className="text-teal-600 font-semibold hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
