'use client';
import { useState, useEffect, useRef } from 'react';
import { Save, Truck, Store, Calculator, Upload, X } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoImage, setLogoImage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    delivery_rate_per_km: 0,
    delivery_min_fee: 0,
    delivery_max_km: 20,
  });

  useEffect(() => {
    const token = localStorage.getItem('pharmacy-token');
    if (!token) return;
    fetch(`${API}/my/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success && d.data) setSettings(s => ({ ...s, ...d.data })); })
      .catch(() => {});
    const stored = localStorage.getItem('pharmacy-logo-image');
    if (stored) setLogoImage(stored);
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 2 ميغابايت'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setLogoImage(data);
      localStorage.setItem('pharmacy-logo-image', data);
    };
    reader.readAsDataURL(file);
  };

  const update = (key: string, value: any) => setSettings(s => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('pharmacy-token') || '';
      await fetch(`${API}/my/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          delivery_rate_per_km: settings.delivery_rate_per_km,
          delivery_min_fee: settings.delivery_min_fee,
          delivery_max_km: settings.delivery_max_km,
        }),
      });
    } catch {}
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Live delivery fee preview
  const sampleKm = 5;
  const calculatedFee = Math.max(settings.delivery_min_fee, settings.delivery_rate_per_km * sampleKm);

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">إعدادات الصيدلية</h2>
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${saved ? 'bg-green-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'}`}>
          <Save className="w-4 h-4" />
          {saved ? 'تم الحفظ ✓' : saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>

      {/* Logo Upload */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Upload className="w-5 h-5 text-sky-500" /> شعار الصيدلية</h3>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
            {logoImage ? <img src={logoImage} alt="logo" className="w-full h-full object-cover" /> : <Store className="w-8 h-8 text-gray-300" />}
          </div>
          <div className="flex-1 space-y-2">
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-sky-400 hover:bg-sky-50 transition-colors w-full justify-center">
              <Upload className="w-4 h-4" /> رفع صورة الشعار
            </button>
            {logoImage && (
              <button onClick={() => { setLogoImage(''); localStorage.removeItem('pharmacy-logo-image'); }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors w-full justify-center">
                <X className="w-4 h-4" /> حذف الشعار
              </button>
            )}
            <p className="text-xs text-gray-400 text-center">PNG أو JPG — أقل من 2 ميغابايت</p>
          </div>
        </div>
      </div>

      {/* Pharmacy Info */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-sky-600" />
          </div>
          <h3 className="font-bold text-gray-900">معلومات الصيدلية</h3>
        </div>
        {[
          { key: 'name', label: 'اسم الصيدلية', placeholder: 'صيدلية الأمين', type: 'text' },
          { key: 'phone', label: 'رقم الهاتف', placeholder: '+9647801234567', type: 'tel' },
          { key: 'email', label: 'البريد الإلكتروني', placeholder: 'pharmacy@example.com', type: 'email' },
          { key: 'address', label: 'العنوان', placeholder: 'بغداد، الكرادة، شارع المتنبي', type: 'text' },
        ].map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
            <input type={field.type} value={(settings as any)[field.key]} onChange={e => update(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              dir={field.type === 'email' || field.type === 'tel' ? 'ltr' : 'rtl'} />
          </div>
        ))}
      </div>

      {/* Delivery Settings */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
            <Truck className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">إعدادات التوصيل</h3>
            <p className="text-xs text-gray-500 mt-0.5">رسوم التوصيل تُحسب تلقائياً حسب المسافة × السعر لكل كيلومتر</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              سعر التوصيل لكل كيلومتر (د.ع)
            </label>
            <input type="number" min="0" value={settings.delivery_rate_per_km}
              onChange={e => update('delivery_rate_per_km', Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
            <p className="text-xs text-gray-400 mt-1">مثال: إذا وضعت 1000، فتوصيل 5 كم = 5000 د.ع</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الحد الأدنى للتوصيل (د.ع)</label>
              <input type="number" min="0" value={settings.delivery_min_fee}
                onChange={e => update('delivery_min_fee', Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
              <p className="text-xs text-gray-400 mt-1">أقل رسوم توصيل تُطبّق</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">أقصى نطاق توصيل (كم)</label>
              <input type="number" min="1" value={settings.delivery_max_km}
                onChange={e => update('delivery_max_km', Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
              <p className="text-xs text-gray-400 mt-1">لا يُقبل طلبات خارج هذا النطاق</p>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        {settings.delivery_rate_per_km > 0 && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4 text-sky-600" />
              <p className="text-sm font-semibold text-sky-800">معاينة — كيف يراها المريض</p>
            </div>
            <div className="space-y-2 text-sm">
              {[1, 3, 5, 10].filter(km => km <= settings.delivery_max_km).map(km => {
                const fee = Math.max(settings.delivery_min_fee, settings.delivery_rate_per_km * km);
                return (
                  <div key={km} className="flex items-center justify-between text-gray-700">
                    <span className="font-bold text-sky-700">{fee.toLocaleString('ar-IQ')} د.ع</span>
                    <span>مسافة {km} كم</span>
                  </div>
                );
              })}
              {settings.delivery_max_km > 0 && (
                <div className="pt-2 border-t border-sky-200 text-xs text-gray-500 text-center">
                  طلبات أبعد من {settings.delivery_max_km} كم: غير متاحة
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
