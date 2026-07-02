'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, FileCheck } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

const ltr = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-left';
const rtl = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requireCertificate, setRequireCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState<string>('');
  const [certificateName, setCertificateName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [account, setAccount] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  });
  const [pharmacy, setPharmacy] = useState({
    nameAr: '', licenseNumber: '', licenseHolderName: '', licenseExpiry: '', phone: '', address: '', city: '',
  });

  useEffect(() => {
    fetch(`${PHARMACY_API}/pharmacies/settings`)
      .then(r => r.json())
      .then(d => { if (d.success) setRequireCertificate(!!d.data.require_certificate); })
      .catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('حجم الملف يجب أن يكون أقل من 5 ميغابايت'); return; }
    setCertificateName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setCertificateData(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!account.firstName || !account.email || !account.password) {
      setError('يرجى تعبئة جميع الحقول المطلوبة'); return;
    }
    if (account.password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (requireCertificate && !certificateData) {
      setError('يجب رفع شهادة التسجيل الرسمية للمتابعة'); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${PHARMACY_API}/pharmacies/register-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: account.firstName,
          lastName: account.lastName || account.firstName,
          email: account.email,
          phone: account.phone,
          password: account.password,
          name: pharmacy.nameAr,
          nameAr: pharmacy.nameAr,
          licenseNumber: pharmacy.licenseNumber,
          licenseHolderName: pharmacy.licenseHolderName,
          licenseExpiry: pharmacy.licenseExpiry,
          pharmacyPhone: pharmacy.phone,
          address: pharmacy.address,
          city: pharmacy.city,
          country: 'IQ',
          certificateData: certificateData || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل التسجيل');
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
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">🏥</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تسجيل صيدلية جديدة</h1>
          <p className="text-gray-500 text-sm mt-1">الخطوة {step} من 2</p>
        </div>

        <div className="flex gap-2 mb-8">
          <div className={`flex-1 h-2 rounded-full ${step >= 1 ? 'bg-sky-500' : 'bg-gray-200'}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 2 ? 'bg-sky-500' : 'bg-gray-200'}`} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <h2 className="font-bold text-gray-900 mb-4">معلومات الحساب</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأول *</label>
                  <input dir="auto" lang="ar"
                    value={account.firstName} onChange={e => setAccount(a => ({...a, firstName: e.target.value}))}
                    placeholder="أحمد" className={rtl} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأخير</label>
                  <input dir="auto" lang="ar"
                    value={account.lastName} onChange={e => setAccount(a => ({...a, lastName: e.target.value}))}
                    placeholder="الطائي" className={rtl} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني *</label>
                <input type="email" dir="ltr" inputMode="email" autoComplete="email"
                  value={account.email} onChange={e => setAccount(a => ({...a, email: e.target.value}))}
                  placeholder="example@email.com" className={ltr} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                <input type="tel" dir="ltr" inputMode="tel"
                  value={account.phone} onChange={e => setAccount(a => ({...a, phone: e.target.value}))}
                  placeholder="07740341370" className={ltr} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور *</label>
                <input type="password" dir="ltr" autoComplete="new-password"
                  value={account.password} onChange={e => setAccount(a => ({...a, password: e.target.value}))}
                  placeholder="••••••••" className={ltr} required />
                <p className="text-xs text-gray-400 mt-1">8 أحرف على الأقل</p>
              </div>
              <button type="submit"
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl">
                التالي →
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="font-bold text-gray-900 mb-4">معلومات الصيدلية</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الصيدلية *</label>
                <input dir="auto" lang="ar"
                  value={pharmacy.nameAr} onChange={e => setPharmacy(p => ({...p, nameAr: e.target.value}))}
                  placeholder="صيدلية الأمين" className={rtl} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الرخصة / الشهادة *</label>
                <input dir="ltr"
                  value={pharmacy.licenseNumber} onChange={e => setPharmacy(p => ({...p, licenseNumber: e.target.value}))}
                  placeholder="PH-2024-001234" className={ltr} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم على الشهادة *</label>
                <input dir="auto" lang="ar"
                  value={pharmacy.licenseHolderName} onChange={e => setPharmacy(p => ({...p, licenseHolderName: e.target.value}))}
                  placeholder="الاسم كما هو مكتوب في الشهادة الرسمية" className={rtl} required />
                <p className="text-xs text-gray-400 mt-1">الاسم كما هو مدوّن رسمياً في الشهادة</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ انتهاء الرخصة *</label>
                <input type="date" dir="ltr"
                  value={pharmacy.licenseExpiry} onChange={e => setPharmacy(p => ({...p, licenseExpiry: e.target.value}))}
                  className={ltr} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">هاتف الصيدلية *</label>
                <input type="tel" dir="ltr" inputMode="tel"
                  value={pharmacy.phone} onChange={e => setPharmacy(p => ({...p, phone: e.target.value}))}
                  placeholder="07740341370" className={ltr} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان *</label>
                <input dir="auto" lang="ar"
                  value={pharmacy.address} onChange={e => setPharmacy(p => ({...p, address: e.target.value}))}
                  placeholder="ديالى، بعقوبة" className={rtl} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المدينة *</label>
                <input dir="auto" lang="ar"
                  value={pharmacy.city} onChange={e => setPharmacy(p => ({...p, city: e.target.value}))}
                  placeholder="ديالى" className={rtl} required />
              </div>

              {/* Certificate Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  شهادة التسجيل {requireCertificate ? '*' : '(اختياري)'}
                </label>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed rounded-xl text-sm transition-colors ${
                    certificateData
                      ? 'border-green-400 bg-green-50 text-green-700'
                      : requireCertificate
                        ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                        : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}>
                  {certificateData ? (
                    <><FileCheck className="w-4 h-4" />{certificateName}</>
                  ) : (
                    <><Upload className="w-4 h-4" />رفع الشهادة (PDF أو صورة، حد أقصى 5 ميغابايت)</>
                  )}
                </button>
                {requireCertificate && !certificateData && (
                  <p className="text-xs text-red-500 mt-1">مطلوب من قبل إدارة المنصة</p>
                )}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => { setStep(1); setError(''); }}
                  className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                  ← السابق
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  تسجيل الصيدلية
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          لديك حساب؟{' '}
          <Link href="/auth/login" className="text-sky-600 font-semibold hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
