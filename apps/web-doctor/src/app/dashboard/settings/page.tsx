'use client';
import { useState, useEffect, useRef } from 'react';
import { Save, Calendar, Upload, X, User, ArrowLeft, FileText, Plus, Lock, Eye, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PrescriptionPreview } from '@/components/PrescriptionPreview';

const PHARM_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export default function DoctorSettingsPage() {
  const router = useRouter();
  const [settingsTab, setSettingsTab] = useState<'general' | 'prescription'>('general');

  // ── General tab state ──
  const [logoImage, setLogoImage] = useState('');
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: '', specialty: '', phone: '', clinic: '' });
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locSaved, setLocSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Prescription tab state ──
  const [rxProfile, setRxProfile] = useState({
    name: '',
    degree: '',
    specialty: '',
    address: '',
    phone: '',
    social: '',
    certNumber: '',
    certNumberLocked: false,
    clinicName: '',
    themeColor: '#2d6b5e',
    fontSize: 'md',
  });
  const [certificates, setCertificates] = useState<string[]>(['']);
  const [certImage, setCertImage] = useState('');
  const [certImageLocked, setCertImageLocked] = useState(false);
  const [clinicLogo, setClinicLogo] = useState('');
  const [rxSaved, setRxSaved] = useState(false);
  const certFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Immediately persist a visual field to localStorage (called inline in handlers)
  const persistVisual = (updates: Record<string, unknown>) => {
    try {
      const existing = localStorage.getItem('doctor-rx-profile');
      const base = existing ? JSON.parse(existing) : {};
      localStorage.setItem('doctor-rx-profile', JSON.stringify({ ...base, ...updates }));
    } catch {}
  };

  useEffect(() => {
    const stored = localStorage.getItem('doctor-logo-image');
    if (stored) setLogoImage(stored);
    const name      = localStorage.getItem('doctor-name') || '';
    const specialty = localStorage.getItem('doctor-specialty') || '';
    const phone     = localStorage.getItem('doctor-phone') || '';
    const clinic    = localStorage.getItem('doctor-clinic') || '';
    setProfile({ name, specialty, phone, clinic });
    const lat = localStorage.getItem('doctor-lat');
    const lng = localStorage.getItem('doctor-lng');
    if (lat && lng) setLocation({ lat: Number(lat), lng: Number(lng) });

    // Load prescription profile
    const rxRaw = localStorage.getItem('doctor-rx-profile');
    if (rxRaw) {
      const rx = JSON.parse(rxRaw);
      setRxProfile({
        name:            rx.name      || name,
        degree:          rx.degree    || '',
        specialty:       rx.specialty || specialty,
        address:         rx.address   || '',
        phone:           rx.phone     || phone,
        social:          rx.social    || '',
        certNumber:      rx.certNumber || '',
        certNumberLocked: !!rx.certNumberLocked,
        clinicName:      rx.clinicName  || '',
        themeColor:      rx.themeColor  || '#2d6b5e',
        fontSize:        rx.fontSize    || 'md',
      });
      if (rx.certificates) setCertificates(rx.certificates.length > 0 ? rx.certificates : ['']);
      if (rx.certImage) { setCertImage(rx.certImage); setCertImageLocked(true); }
      if (rx.clinicLogo) setClinicLogo(rx.clinicLogo);
    } else {
      setRxProfile(p => ({ ...p, name, specialty, phone }));
    }
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 2 ميغابايت'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setLogoImage(data);
      localStorage.setItem('doctor-logo-image', data);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    localStorage.setItem('doctor-name', profile.name);
    localStorage.setItem('doctor-specialty', profile.specialty);
    localStorage.setItem('doctor-phone', profile.phone);
    localStorage.setItem('doctor-clinic', profile.clinic);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const requestMyLocation = () => {
    setLocLoading(true);
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        setLocLoading(false);
      },
      () => { setLocLoading(false); alert('تعذر الحصول على موقعك. تأكد من منح الإذن من إعدادات المتصفح.'); }
    );
  };

  const saveLocation = async () => {
    if (!location) return;
    localStorage.setItem('doctor-lat', String(location.lat));
    localStorage.setItem('doctor-lng', String(location.lng));
    const adminReqId = localStorage.getItem('doctor-id');
    const token = localStorage.getItem('doctor-token') || '';
    if (adminReqId) {
      await fetch(`${PHARM_API}/admin-requests/${adminReqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ latitude: location.lat, longitude: location.lng }),
      }).catch(() => {});
    }
    setLocSaved(true);
    setTimeout(() => setLocSaved(false), 2000);
  };

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (certImageLocked) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 3 ميغابايت'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setCertImage(data);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUploadRx = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 2 ميغابايت'); return; }
    const reader = new FileReader();
    reader.onload = ev => setClinicLogo(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const saveRxProfile = () => {
    const certNumberLocked = rxProfile.certNumber.trim() !== '' ? true : rxProfile.certNumberLocked;
    const certImageLock    = certImage !== '' ? true : certImageLocked;
    const toSave = {
      ...rxProfile,
      certNumberLocked,
      certificates: certificates.filter(c => c.trim()),
      certImage,
      certImageLocked: certImageLock,
      clinicLogo,
    };
    localStorage.setItem('doctor-rx-profile', JSON.stringify(toSave));
    setCertImageLocked(certImageLock);
    setRxProfile(p => ({ ...p, certNumberLocked }));
    setRxSaved(true);
    setTimeout(() => setRxSaved(false), 2000);
  };

  const addCert = () => setCertificates(c => [...c, '']);
  const removeCert = (i: number) => setCertificates(c => c.filter((_, idx) => idx !== i));
  const updateCert = (i: number, val: string) => setCertificates(c => c.map((x, idx) => idx === i ? val : x));

  const today = new Date().toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-2xl" dir="rtl">
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-2xl p-1">
        {[
          { key: 'general',      label: 'الإعدادات العامة', icon: User },
          { key: 'prescription', label: 'الوصفة الطبية',    icon: FileText },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setSettingsTab(t.key as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                settingsTab === t.key ? 'bg-white shadow text-teal-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── GENERAL TAB ── */}
      {settingsTab === 'general' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">الإعدادات العامة</h1>
            <button onClick={handleSave}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${saved ? 'bg-green-500' : 'bg-teal-500 hover:bg-teal-600'}`}>
              <Save className="w-4 h-4" />
              {saved ? 'تم الحفظ ✓' : 'حفظ'}
            </button>
          </div>

          {/* Logo Upload */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Upload className="w-5 h-5 text-teal-500" /> صورة الملف الشخصي</h3>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                {logoImage ? <img src={logoImage} alt="profile" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-gray-300" />}
              </div>
              <div className="flex-1 space-y-2">
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-teal-400 hover:bg-teal-50 transition-colors w-full justify-center">
                  <Upload className="w-4 h-4" /> رفع صورة
                </button>
                {logoImage && (
                  <button onClick={() => { setLogoImage(''); localStorage.removeItem('doctor-logo-image'); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors w-full justify-center">
                    <X className="w-4 h-4" /> حذف الصورة
                  </button>
                )}
                <p className="text-xs text-gray-400 text-center">PNG أو JPG — أقل من 2 ميغابايت</p>
              </div>
            </div>
          </div>

          {/* Profile Info */}
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><User className="w-5 h-5 text-teal-500" /> المعلومات الشخصية</h3>
            {[
              { key: 'name',      label: 'الاسم الكامل',      placeholder: 'د. أحمد محمد' },
              { key: 'specialty', label: 'التخصص',             placeholder: 'طب عام / قلب / نساء...' },
              { key: 'phone',     label: 'رقم الهاتف',         placeholder: '+9647801234567' },
              { key: 'clinic',    label: 'اسم العيادة / المستشفى', placeholder: 'عيادة الأمل' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{f.label}</label>
                <input value={(profile as any)[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            ))}
          </div>

          {/* Clinic Location */}
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-teal-500" /> موقع العيادة</h3>
            {location ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center justify-between">
                <span>📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
                <button onClick={() => setLocation(null)} className="text-red-400 hover:text-red-600 text-xs">حذف</button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">لم يتم تحديد موقع العيادة بعد. اضغط الزر أدناه لتحديد موقعك الحالي.</p>
            )}
            <div className="flex gap-3">
              <button onClick={requestMyLocation} disabled={locLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-teal-400 text-teal-600 bg-teal-50 hover:bg-teal-100 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors">
                {locLoading ? <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /> : <MapPin className="w-4 h-4" />}
                {locLoading ? 'جاري التحديد...' : 'موقعي الحالي'}
              </button>
              {location && (
                <button onClick={saveLocation}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${locSaved ? 'bg-green-500' : 'bg-teal-500 hover:bg-teal-600'}`}>
                  <Save className="w-4 h-4" />
                  {locSaved ? 'تم الحفظ ✓' : 'حفظ الموقع'}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">يُستخدم الموقع لعرض المسافة للمرضى عند البحث عن طبيب قريب</p>
          </div>

          {/* Appointments shortcut */}
          <button onClick={() => router.push('/dashboard/appointments')}
            className="w-full flex items-center justify-between bg-white rounded-2xl shadow-sm p-5 hover:bg-gray-50 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5 text-teal-600" />
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">جدول الدوام</p>
                <p className="text-sm text-gray-500 mt-0.5">تحديد أوقات العمل والسعة الاستيعابية لكل يوم</p>
              </div>
            </div>
            <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-teal-500 transition-colors" />
          </button>
        </div>
      )}

      {/* ── PRESCRIPTION TAB ── */}
      {settingsTab === 'prescription' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">إعدادات الوصفة الطبية</h1>
            <div className="flex gap-2">
              <button onClick={() => setPreviewOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-teal-400 text-teal-600 hover:bg-teal-50 transition-colors">
                <Eye className="w-4 h-4" /> معاينة
              </button>
              <button onClick={saveRxProfile}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${rxSaved ? 'bg-green-500' : 'bg-teal-500 hover:bg-teal-600'}`}>
                <Save className="w-4 h-4" />
                {rxSaved ? 'تم الحفظ ✓' : 'حفظ'}
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            ℹ️ ستظهر هذه المعلومات تلقائياً في كل وصفة طبية تكتبها. رقم الإجازة والشهادة لا يمكن تعديلهما بعد الحفظ.
          </div>

          {/* Doctor header info */}
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-sm text-gray-500 uppercase tracking-wide">معلومات الطبيب</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل (كما سيظهر في الوصفة)</label>
              <input value={rxProfile.name} onChange={e => setRxProfile(p => ({ ...p, name: e.target.value }))}
                placeholder="د. أحمد محمد"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الدرجة العلمية</label>
              <input value={rxProfile.degree} onChange={e => setRxProfile(p => ({ ...p, degree: e.target.value }))}
                placeholder="مثال: M.B.Ch.B — بكالوريوس الطب والجراحة"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">التخصص</label>
              <input value={rxProfile.specialty} onChange={e => setRxProfile(p => ({ ...p, specialty: e.target.value }))}
                placeholder="مثال: طب عام / أمراض القلب"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>

            {/* Certificates */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">الشهادات والدورات</label>
                <button onClick={addCert}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium">
                  <Plus className="w-3.5 h-3.5" /> إضافة شهادة
                </button>
              </div>
              <div className="space-y-2">
                {certificates.map((cert, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={cert} onChange={e => updateCert(i, e.target.value)}
                      placeholder={`مثال: زمالة الكلية الملكية للأطباء ${i + 1}`}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    {certificates.length > 1 && (
                      <button onClick={() => removeCert(i)} className="text-red-400 hover:text-red-600 p-1">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Contact info (right side of prescription) */}
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-sm text-gray-500 uppercase tracking-wide">معلومات الاتصال</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">العنوان</label>
              <input value={rxProfile.address} onChange={e => setRxProfile(p => ({ ...p, address: e.target.value }))}
                placeholder="مثال: شارع فلسطين، بغداد"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الهاتف</label>
              <input value={rxProfile.phone} onChange={e => setRxProfile(p => ({ ...p, phone: e.target.value }))}
                placeholder="+9647801234567"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">وسائل التواصل الاجتماعي</label>
              <input value={rxProfile.social} onChange={e => setRxProfile(p => ({ ...p, social: e.target.value }))}
                placeholder="مثال: @drahmed أو instagram.com/drahmed"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>

          {/* Clinic logo */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 text-sm text-gray-500 uppercase tracking-wide mb-4">شعار العيادة / المستشفى</h3>
            <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUploadRx} />
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                {clinicLogo
                  ? <img src={clinicLogo} alt="clinic logo" className="w-full h-full object-contain p-1" />
                  : <Upload className="w-7 h-7 text-gray-300" />}
              </div>
              <div className="flex-1 space-y-2">
                <button onClick={() => logoFileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-teal-400 hover:bg-teal-50 transition-colors w-full justify-center">
                  <Upload className="w-4 h-4" /> {clinicLogo ? 'تغيير الشعار' : 'رفع شعار'}
                </button>
                {clinicLogo && (
                  <button onClick={() => setClinicLogo('')}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors w-full justify-center">
                    <X className="w-4 h-4" /> حذف الشعار
                  </button>
                )}
                <p className="text-xs text-gray-400 text-center">PNG أو JPG — أقل من 2 ميغابايت — سيظهر في أعلى الوصفة</p>
              </div>
            </div>
          </div>

          {/* Clinic name */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 text-sm text-gray-500 uppercase tracking-wide mb-4">اسم العيادة / المستشفى</h3>
            <input value={rxProfile.clinicName} onChange={e => { setRxProfile(p => ({ ...p, clinicName: e.target.value })); persistVisual({ clinicName: e.target.value }); }}
              placeholder="مثال: مجمع النخبة الطبي"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <p className="text-xs text-gray-400 mt-1.5">سيظهر في أعلى يسار الوصفة</p>
          </div>

          {/* Theme color + font size */}
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-5">
            <h3 className="font-bold text-gray-900 text-sm text-gray-500 uppercase tracking-wide">تصميم الوصفة</h3>

            {/* Color theme */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">لون الثيم</label>
              <div className="flex items-center gap-4">
                {/* Native color picker */}
                <div className="relative">
                  <div
                    className="w-12 h-12 rounded-xl border-2 border-gray-200 cursor-pointer shadow-sm overflow-hidden"
                    style={{ backgroundColor: rxProfile.themeColor }}
                    onClick={() => (document.getElementById('themeColorInput') as HTMLInputElement)?.click()}
                  />
                  <input
                    id="themeColorInput"
                    type="color"
                    value={rxProfile.themeColor}
                    onChange={e => { setRxProfile(p => ({ ...p, themeColor: e.target.value })); persistVisual({ themeColor: e.target.value }); }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
                {/* Quick presets */}
                <div className="flex gap-2 flex-wrap">
                  {['#2d6b5e','#1e3a5f','#4c1d95','#7c1d1d','#166534','#b45309','#0e7490','#be185d'].map(hex => (
                    <button key={hex} onClick={() => { setRxProfile(p => ({ ...p, themeColor: hex })); persistVisual({ themeColor: hex }); }}
                      title={hex}
                      className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: hex,
                        borderColor: rxProfile.themeColor === hex ? '#fff' : 'transparent',
                        boxShadow: rxProfile.themeColor === hex ? `0 0 0 2px ${hex}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2 font-mono">{rxProfile.themeColor}</p>
            </div>

            {/* Font size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">حجم الخط</label>
              <div className="flex gap-2">
                {[
                  { key: 'sm', label: 'صغير', sample: 'A' },
                  { key: 'md', label: 'متوسط', sample: 'A' },
                  { key: 'lg', label: 'كبير', sample: 'A' },
                ].map((s, si) => (
                  <button key={s.key} onClick={() => { setRxProfile(p => ({ ...p, fontSize: s.key })); persistVisual({ fontSize: s.key }); }}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                      rxProfile.fontSize === s.key ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <span style={{ fontSize: `${[13, 16, 19][si]}px`, fontWeight: 600 }}>{s.sample}</span>
                    <span className="text-xs">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Certificate number — locked once set */}
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-sm text-gray-500 uppercase tracking-wide flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500" /> رقم الإجازة والشهادة
              {rxProfile.certNumberLocked && <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">مؤمّن — لا يمكن التعديل</span>}
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم إجازة مزاولة المهنة</label>
              {rxProfile.certNumberLocked ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 font-mono">{rxProfile.certNumber}</span>
                </div>
              ) : (
                <input value={rxProfile.certNumber} onChange={e => setRxProfile(p => ({ ...p, certNumber: e.target.value }))}
                  placeholder="مثال: 123456"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              )}
              {!rxProfile.certNumberLocked && rxProfile.certNumber.trim() && (
                <p className="text-xs text-amber-600 mt-1.5">⚠️ سيتم قفل هذا الرقم بعد الحفظ ولا يمكن تعديله</p>
              )}
            </div>

            {/* Certificate image upload — locked once set */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">صورة الشهادة</label>
              <input ref={certFileRef} type="file" accept="image/*" className="hidden" onChange={handleCertUpload} />
              {certImage ? (
                <div className="space-y-2">
                  <div className="relative w-full rounded-xl overflow-hidden border border-gray-200">
                    <img src={certImage} alt="certificate" className="w-full max-h-40 object-cover" />
                    {certImageLocked && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="bg-white rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-sm text-gray-700 font-medium">
                          <Lock className="w-4 h-4 text-amber-500" /> مؤمّنة
                        </div>
                      </div>
                    )}
                  </div>
                  {!certImageLocked && (
                    <button onClick={() => setCertImage('')} className="text-xs text-red-500 hover:text-red-700">إزالة الصورة</button>
                  )}
                </div>
              ) : (
                <button onClick={() => certFileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-teal-400 hover:bg-teal-50 transition-colors w-full justify-center">
                  <Upload className="w-4 h-4" /> رفع صورة الشهادة
                </button>
              )}
              {!certImageLocked && certImage && (
                <p className="text-xs text-amber-600 mt-1.5">⚠️ سيتم قفل الصورة بعد الحفظ ولا يمكن تعديلها</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PRESCRIPTION PREVIEW MODAL ── */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-gray-900">معاينة الوصفة الطبية</h2>
              <button onClick={() => setPreviewOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5">
              <PrescriptionPreview
                rxProfile={rxProfile}
                certificates={certificates}
                clinicLogo={clinicLogo}
                patientName="اسم المريض"
                patientAge="—"
                drugs={[{ name: 'اسم الدواء', dose: 'الجرعة', times: 'التكرار', duration: 'المدة', notes: 'ملاحظات' }]}
                date={today}
                rxId="اسم_المريض_01-01-2026_10:30:00"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

