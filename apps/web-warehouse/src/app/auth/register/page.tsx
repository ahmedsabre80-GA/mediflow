'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Warehouse, Upload, FileCheck } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function WarehouseRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requireCertificate, setRequireCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState('');
  const [certificateName, setCertificateName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    warehouseName: '', licenseNumber: '', address: '', city: '',
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
          role: 'warehouse_owner',
          certificateData: certificateData || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok && res.status === 409) {
        throw new Error('البريد الإلكتروني مسجل مسبقاً');
      }
      if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');

      if (data.data?.requiresApproval) {
        // Insert into admin_requests so the admin portal can see this registration
        await fetch(`${PHARMACY_API}/pharmacies/admin-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalType: 'warehouse',
            requesterId: data.data.userId,
            requesterName: `${form.firstName} ${form.lastName}`,
            requesterEntity: form.warehouseName,
            actionType: 'registration',
            reason: `طلب تسجيل مستودع جديد — ${form.city}`,
          }),
        }).catch(() => {});
        router.push('/auth/pending'); return;
      }
      localStorage.setItem('warehouse-token', data.data.accessToken);
      localStorage.setItem('warehouse-id', data.data.userId);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));
  const inp = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 px-4 py-8" dir="rtl">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Warehouse className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تسجيل مستودع جديد</h1>
          <p className="text-sm text-gray-500 mt-1">انضم إلى شبكة مستودعات ميديفلو</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="font-semibold text-gray-800 mb-2">معلومات المالك</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأول *</label>
                <input dir="auto" lang="ar" value={form.firstName} onChange={e => update('firstName', e.target.value)}
                  placeholder="محمد" className={inp} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الأخير</label>
                <input dir="auto" lang="ar" value={form.lastName} onChange={e => update('lastName', e.target.value)}
                  placeholder="العلي" className={inp} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني *</label>
              <input type="email" dir="ltr" inputMode="email" autoComplete="email" value={form.email} onChange={e => update('email', e.target.value)}
                placeholder="example@email.com" className={inp + ' text-left'} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
              <input type="tel" dir="ltr" inputMode="tel" value={form.phone} onChange={e => update('phone', e.target.value)}
                placeholder="07700000000" className={inp + ' text-left'} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور *</label>
              <input type="password" dir="ltr" autoComplete="new-password" value={form.password} onChange={e => update('password', e.target.value)}
                placeholder="••••••••" className={inp + ' text-left'} required />
              <p className="text-xs text-gray-400 mt-1">8 أحرف على الأقل</p>
            </div>

            <hr className="border-gray-100" />
            <h2 className="font-semibold text-gray-800">معلومات المستودع</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">اسم المستودع *</label>
              <input dir="auto" lang="ar" value={form.warehouseName} onChange={e => update('warehouseName', e.target.value)}
                placeholder="مستودع الخليج الطبي" className={inp} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الرخصة *</label>
              <input dir="ltr" value={form.licenseNumber} onChange={e => update('licenseNumber', e.target.value)}
                placeholder="WH-2024-001" className={inp} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">العنوان *</label>
              <input dir="auto" lang="ar" value={form.address} onChange={e => update('address', e.target.value)}
                placeholder="المنطقة الصناعية، شارع المصانع" className={inp} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المدينة *</label>
              <input dir="auto" lang="ar" value={form.city} onChange={e => update('city', e.target.value)}
                placeholder="بغداد" className={inp} required />
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
                  <><Upload className="w-4 h-4" />رفع شهادة تسجيل المستودع (PDF أو صورة، حد أقصى 5 ميغابايت)</>
                )}
              </button>
              {requireCertificate && !certificateData && (
                <p className="text-xs text-red-500 mt-1">مطلوب من قبل إدارة المنصة</p>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري التسجيل...' : 'تسجيل المستودع'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          لديك حساب؟ <Link href="/auth/login" className="text-orange-600 font-semibold hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
