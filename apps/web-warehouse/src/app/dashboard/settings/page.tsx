'use client';
import { useState, useEffect, useRef } from 'react';
import { Save, Palette, Building2, Truck, Calculator, Upload, X } from 'lucide-react';
import { loadConfig, saveConfig, type WarehouseConfig } from '@/lib/config';

const COLOR_PRESETS = [
  { name: 'عنبري',    value: '#f59e0b' },
  { name: 'أزرق',    value: '#0ea5e9' },
  { name: 'أخضر',    value: '#10b981' },
  { name: 'بنفسجي',  value: '#8b5cf6' },
  { name: 'أحمر',    value: '#ef4444' },
  { name: 'وردي',    value: '#ec4899' },
  { name: 'برتقالي', value: '#f97316' },
  { name: 'رمادي',   value: '#6b7280' },
];

const EMOJI_PRESETS = ['🏭', '🏪', '🏬', '🏗️', '📦', '🚚', '💊', '🏥', '⭐', '🌟'];

export default function WarehouseSettingsPage() {
  const [config, setConfig] = useState<WarehouseConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'branding' | 'delivery' | 'general'>('branding');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setConfig(loadConfig()); }, []);

  const update = (key: keyof WarehouseConfig, value: any) =>
    setConfig(c => c ? { ...c, [key]: value } : c);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 2 ميغابايت'); return; }
    const reader = new FileReader();
    reader.onload = ev => update('logoImage', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (config) {
      saveConfig(config);
      setSaved(true);
      setTimeout(() => { setSaved(false); window.location.reload(); }, 1200);
    }
  };

  if (!config) return null;
  const primary = config.primaryColor;

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الإعدادات</h1>
        <button onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ backgroundColor: primary }}>
          <Save className="w-4 h-4" />
          {saved ? 'تم الحفظ ✓' : 'حفظ التغييرات'}
        </button>
      </div>

      <div className="flex gap-2 border-b">
        {[{k:'branding',l:'الهوية البصرية'},{k:'delivery',l:'إعدادات التوصيل'},{k:'general',l:'الإعدادات العامة'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            style={tab === t.k ? { color: primary, borderColor: primary } : {}}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'branding' && (
        <div className="space-y-6">
          {/* Preview */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Palette className="w-5 h-5" /> معاينة مباشرة
            </h2>
            <div className="border rounded-xl p-6 text-center"
              style={{ background: `linear-gradient(135deg, ${primary}15, ${primary}05)` }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md overflow-hidden"
                style={{ backgroundColor: config.logoImage ? 'transparent' : primary }}>
                {config.logoImage
                  ? <img src={config.logoImage} alt="logo" className="w-full h-full object-cover" />
                  : <span className="text-2xl">{config.logoEmoji}</span>}
              </div>
              <p className="font-bold text-gray-900 text-lg">{config.name}</p>
              <p className="text-gray-500 text-sm mt-1">{config.tagline}</p>
              <button className="mt-4 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: primary }}>تسجيل الدخول</button>
            </div>
          </div>

          {/* Logo Upload */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" /> شعار المستودع
            </h2>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                {config.logoImage
                  ? <img src={config.logoImage} alt="logo" className="w-full h-full object-cover" />
                  : <span className="text-3xl">{config.logoEmoji}</span>}
              </div>
              <div className="flex-1 space-y-2">
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors w-full justify-center">
                  <Upload className="w-4 h-4" /> رفع صورة الشعار
                </button>
                {config.logoImage && (
                  <button onClick={() => update('logoImage', '')}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors w-full justify-center">
                    <X className="w-4 h-4" /> حذف الشعار
                  </button>
                )}
                <p className="text-xs text-gray-400 text-center">PNG أو JPG — أقل من 2 ميغابايت</p>
              </div>
            </div>
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">أو اختر أيقونة</p>
              <div className="flex flex-wrap gap-3">
                {EMOJI_PRESETS.map(emoji => (
                  <button key={emoji} onClick={() => { update('logoEmoji', emoji); update('logoImage', ''); }}
                    className={`w-12 h-12 rounded-xl text-2xl flex items-center justify-center transition-all border-2 ${!config.logoImage && config.logoEmoji === emoji ? 'scale-110' : 'border-transparent hover:border-gray-200'}`}
                    style={!config.logoImage && config.logoEmoji === emoji ? { borderColor: primary, backgroundColor: `${primary}15` } : { backgroundColor: '#f9fafb' }}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Portal Name */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" /> اسم البوابة
            </h2>
            <div className="space-y-4">
              {[
                { key: 'name',    label: 'الاسم بالعربية',    placeholder: 'بوابة المذاخر',          dir: 'rtl' },
                { key: 'nameEn',  label: 'الاسم بالإنجليزية', placeholder: 'Warehouse Portal',       dir: 'ltr' },
                { key: 'tagline', label: 'الشعار (نص)',        placeholder: 'ميديفلو — إدارة التوزيع', dir: 'rtl' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{f.label}</label>
                  <input dir={f.dir as any} value={(config as any)[f.key]} onChange={e => update(f.key as any, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': primary } as any} />
                </div>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4">لون المنصة</h2>
            <div className="flex flex-wrap gap-3 mb-4">
              {COLOR_PRESETS.map(preset => (
                <button key={preset.value} onClick={() => update('primaryColor', preset.value)}
                  className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-xl transition-all ${config.primaryColor === preset.value ? 'scale-110 ring-2 ring-offset-2' : ''}`}
                    style={{ backgroundColor: preset.value }} />
                  <span className="text-xs text-gray-600">{preset.name}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">لون مخصص (HEX)</label>
              <div className="flex items-center gap-3">
                <input type="color" value={config.primaryColor} onChange={e => update('primaryColor', e.target.value)}
                  className="w-12 h-12 rounded-xl border-0 cursor-pointer" />
                <input dir="ltr" value={config.primaryColor} onChange={e => update('primaryColor', e.target.value)}
                  placeholder="#f59e0b"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none font-mono" />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'delivery' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <Truck className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">إعدادات التوصيل</h3>
                <p className="text-xs text-gray-500 mt-0.5">رسوم التوصيل تُحسب تلقائياً حسب المسافة × السعر لكل كيلومتر</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">سعر التوصيل لكل كيلومتر (د.ع)</label>
              <input type="number" min="0" value={config.delivery_rate_per_km}
                onChange={e => update('delivery_rate_per_km', Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': primary } as any} />
              <p className="text-xs text-gray-400 mt-1">مثال: إذا وضعت 1000، فتوصيل 5 كم = 5000 د.ع</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الحد الأدنى للتوصيل (د.ع)</label>
                <input type="number" min="0" value={config.delivery_min_fee}
                  onChange={e => update('delivery_min_fee', Number(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primary } as any} />
                <p className="text-xs text-gray-400 mt-1">أقل رسوم توصيل تُطبّق</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">أقصى نطاق توصيل (كم)</label>
                <input type="number" min="1" value={config.delivery_max_km}
                  onChange={e => update('delivery_max_km', Number(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primary } as any} />
                <p className="text-xs text-gray-400 mt-1">لا يُقبل طلبات خارج هذا النطاق</p>
              </div>
            </div>
            {config.delivery_rate_per_km > 0 && (
              <div className="rounded-xl p-4 border" style={{ backgroundColor: `${primary}10`, borderColor: `${primary}40` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-4 h-4" style={{ color: primary }} />
                  <p className="text-sm font-semibold" style={{ color: primary }}>معاينة — كيف يراها العميل</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[1, 3, 5, 10].filter(km => km <= config.delivery_max_km).map(km => {
                    const fee = Math.max(config.delivery_min_fee, config.delivery_rate_per_km * km);
                    return (
                      <div key={km} className="flex items-center justify-between text-gray-700">
                        <span className="font-bold" style={{ color: primary }}>{fee.toLocaleString('ar-IQ')} د.ع</span>
                        <span>مسافة {km} كم</span>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t text-xs text-gray-500 text-center" style={{ borderColor: `${primary}30` }}>
                    طلبات أبعد من {config.delivery_max_km} كم: غير متاحة
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'general' && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-gray-900 mb-4">الإعدادات العامة</h2>
          {[
            { key: 'currency', label: 'العملة', options: [['IQD','دينار عراقي (IQD)'],['USD','دولار أمريكي (USD)'],['SAR','ريال سعودي (SAR)'],['AED','درهم إماراتي (AED)']] },
            { key: 'country',  label: 'الدولة',  options: [['IQ','العراق'],['SA','السعودية'],['AE','الإمارات'],['JO','الأردن'],['KW','الكويت']] },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{f.label}</label>
              <select value={(config as any)[f.key]} onChange={e => update(f.key as any, e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none">
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
