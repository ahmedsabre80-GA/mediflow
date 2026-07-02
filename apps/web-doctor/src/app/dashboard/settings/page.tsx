'use client';
import { useState, useEffect, useRef } from 'react';
import { Save, Calendar, Upload, X, User, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DoctorSettingsPage() {
  const router = useRouter();
  const [logoImage, setLogoImage] = useState('');
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: '', specialty: '', phone: '', clinic: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('doctor-logo-image');
    if (stored) setLogoImage(stored);
    setProfile({
      name:      localStorage.getItem('doctor-name') || '',
      specialty: localStorage.getItem('doctor-specialty') || '',
      phone:     localStorage.getItem('doctor-phone') || '',
      clinic:    localStorage.getItem('doctor-clinic') || '',
    });
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

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الإعدادات</h1>
        <button onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${saved ? 'bg-green-500' : 'bg-teal-500 hover:bg-teal-600'}`}>
          <Save className="w-4 h-4" />
          {saved ? 'تم الحفظ ✓' : 'حفظ التغييرات'}
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
  );
}
