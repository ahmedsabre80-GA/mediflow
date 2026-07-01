'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Stethoscope, Upload, FileCheck } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';
const REQUESTS_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const SPECIALIZATIONS = [
  'طب عام', 'طب الأطفال', 'طب القلب', 'طب الأعصاب', 'طب العيون',
  'طب الأسنان', 'طب الجلدية', 'طب النساء والتوليد', 'جراحة عامة',
  'طب الطوارئ', 'طب الباطنية', 'طب العظام', 'طب الأنف والأذن والحنجرة',
];

export default function DoctorRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requireCertificate, setRequireCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState('');
  const [certificateName, setCertificateName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    specialization: '', licenseNumber: '', licenseExpiry: '', consultationFee: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (requireCertificate && !certificateData) {
      setError('يجب رفع شهادة التسجيل الرسمية للمتابعة'); return;
    }
    setLoading(true);
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
          certificateData: certificateData || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok && (res.status === 409 || data?.error?.title?.toLowerCase().includes('email'))) {
        const loginRes = await fetch(`${AUTH_API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) throw new Error('البريد الإلكتروني مسجل مسبقاً. تأكد من كلمة المرور الصحيحة.');
        if (loginData.data?.requiresApproval) { router.push('/auth/pending'); return; }
        localStorage.setItem('doctor-token', loginData.data.accessToken);
        localStorage.setItem('doctor-id', loginData.data.userId);
        router.push('/dashboard');
        return;
      }

      if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');
      if (data.data?.requiresApproval) {
        // Submit approval request to admin portal
        await fetch(`${REQUESTS_API}/admin-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalType: 'doctor',
            requesterId: data.data.userId,
            requesterName: `${form.firstName} ${form.lastName}`,
            requesterEntity: form.specialization || 'طبيب',
            actionType: 'add_employee',
            employeeName: `${form.firstName} ${form.lastName}`,
            employeeEmail: form.email,
            employeeRole: form.specialization || 'طبيب',
            reason: `رقم الترخيص: ${form.licenseNumber}`,
          }),
        }).catch(() => {});
        router.push('/auth/pending');
        return;
      }
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
  const inp = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

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
                <input dir="auto" lang="ar" value={form.firstName} onChange={e => update('firstName', e.target.value)}
                  placeholder="أحمد" className={inp} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأخير</label>
                <input dir="auto" lang="ar" value={form.lastName} onChange={e => update('lastName', e.target.value)}
                  placeholder="الطائي" className={inp} required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
              <input type="email" dir="ltr" inputMode="email" autoComplete="email" value={form.email} onChange={e => update('email', e.target.value)}
                placeholder="example@email.com" className={inp + ' text-left'} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
              <input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => update('phone', e.target.value)}
                placeholder="+9647801234567" className={inp + ' text-left'} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التخصص</label>
              <select value={form.specialization} onChange={e => update('specialization', e.target.value)} className={inp} required>
                <option value="">اختر التخصص</option>
                {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الترخيص الطبي</label>
              <input dir="ltr" value={form.licenseNumber} onChange={e => update('licenseNumber', e.target.value)}
                placeholder="MED-2024-001234" className={inp} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رسوم الاستشارة (دينار عراقي)</label>
              <input type="number" dir="ltr" value={form.consultationFee} onChange={e => update('consultationFee', e.target.value)}
                placeholder="25000" className={inp} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
              <input type="password" dir="ltr" autoComplete="new-password" value={form.password} onChange={e => update('password', e.target.value)}
                placeholder="••••••••" className={inp + ' text-left'} required />
            </div>

            {/* Certificate Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                شهادة التسجيل الطبي {requireCertificate ? '*' : '(اختياري)'}
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
                  <><Upload className="w-4 h-4" />رفع الشهادة الطبية (PDF أو صورة، حد أقصى 5 ميغابايت)</>
                )}
              </button>
              {requireCertificate && !certificateData && (
                <p className="text-xs text-red-500 mt-1">مطلوب من قبل إدارة المنصة</p>
              )}
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
