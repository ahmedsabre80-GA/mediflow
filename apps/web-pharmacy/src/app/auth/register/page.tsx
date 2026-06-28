'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');

  const [account, setAccount] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [pharmacy, setPharmacy] = useState({
    name: '', nameAr: '', licenseNumber: '', licenseExpiry: '',
    phone: '', email: '', address: '', city: '', country: 'IQ',
  });

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${AUTH_API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...account, role: 'pharmacy_owner' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');
      // If requires approval — go directly to step 2 with userId
      if (data.data?.requiresApproval) {
        setToken(data.data.userId); // use userId as temp token
        localStorage.setItem('pharmacy-pending-id', data.data.userId);
        setStep(2);
        return;
      }
      setToken(data.data.accessToken);
      localStorage.setItem('pharmacy-token', data.data.accessToken);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePharmacySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${PHARMACY_API}/pharmacies/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(pharmacy),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل تسجيل الصيدلية');
      // Show pending approval page
      router.push('/auth/pending');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-teal-50 px-4 py-8" dir="rtl">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">🏥</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تسجيل صيدلية جديدة</h1>
          <p className="text-gray-500 text-sm mt-1">الخطوة {step} من 2</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          <div className={`flex-1 h-2 rounded-full ${step >= 1 ? 'bg-sky-500' : 'bg-gray-200'}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 2 ? 'bg-sky-500' : 'bg-gray-200'}`} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
          )}

          {/* Step 1: Account */}
          {step === 1 && (
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <h2 className="font-bold text-gray-900 mb-4">معلومات الحساب</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأول</label>
                  <input value={account.firstName} onChange={(e) => setAccount({...account, firstName: e.target.value})}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأخير</label>
                  <input value={account.lastName} onChange={(e) => setAccount({...account, lastName: e.target.value})}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                <input type="email" dir="ltr" value={account.email} onChange={(e) => setAccount({...account, email: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                <input type="tel" dir="ltr" value={account.phone} onChange={(e) => setAccount({...account, phone: e.target.value})}
                  placeholder="+9647801234567"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                <input type="password" dir="ltr" value={account.password} onChange={(e) => setAccount({...account, password: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                التالي →
              </button>
            </form>
          )}

          {/* Step 2: Pharmacy */}
          {step === 2 && (
            <form onSubmit={handlePharmacySubmit} className="space-y-4">
              <h2 className="font-bold text-gray-900 mb-4">معلومات الصيدلية</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الصيدلية (عربي)</label>
                <input value={pharmacy.nameAr} onChange={(e) => setPharmacy({...pharmacy, nameAr: e.target.value, name: e.target.value})}
                  placeholder="صيدلية الأمين"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الرخصة</label>
                <input dir="ltr" value={pharmacy.licenseNumber} onChange={(e) => setPharmacy({...pharmacy, licenseNumber: e.target.value})}
                  placeholder="PH-2024-001234"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ انتهاء الرخصة</label>
                <input type="date" dir="ltr" value={pharmacy.licenseExpiry} onChange={(e) => setPharmacy({...pharmacy, licenseExpiry: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">هاتف الصيدلية</label>
                <input type="tel" dir="ltr" value={pharmacy.phone} onChange={(e) => setPharmacy({...pharmacy, phone: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
                <input value={pharmacy.address} onChange={(e) => setPharmacy({...pharmacy, address: e.target.value})}
                  placeholder="بغداد، الكرادة"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المدينة</label>
                <input value={pharmacy.city} onChange={(e) => setPharmacy({...pharmacy, city: e.target.value})}
                  placeholder="بغداد"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" required />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                  ← السابق
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  تسجيل الصيدلية
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          لديك حساب؟ <Link href="/auth/login" className="text-sky-600 font-semibold hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
