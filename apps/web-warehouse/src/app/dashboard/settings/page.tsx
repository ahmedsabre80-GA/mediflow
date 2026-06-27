'use client';
import { useState, useEffect } from 'react';
import { Save, Palette, Building2 } from 'lucide-react';
import { loadConfig, saveConfig, type WarehouseConfig } from '@/lib/config';

const COLOR_PRESETS = [
  { name: 'عنبري', value: '#f59e0b' },
  { name: 'أزرق', value: '#0ea5e9' },
  { name: 'أخضر', value: '#10b981' },
  { name: 'بنفسجي', value: '#8b5cf6' },
  { name: 'أحمر', value: '#ef4444' },
  { name: 'وردي', value: '#ec4899' },
  { name: 'برتقالي', value: '#f97316' },
  { name: 'رمادي', value: '#6b7280' },
];

const EMOJI_PRESETS = ['🏭', '🏪', '🏬', '🏗️', '📦', '🚚', '💊', '🏥', '⭐', '🌟'];

export default function WarehouseSettingsPage() {
  const [config, setConfig] = useState<WarehouseConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'branding' | 'general'>('branding');

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const update = (key: keyof WarehouseConfig, value: string) => {
    setConfig(c => c ? { ...c, [key]: value } : c);
  };

  const handleSave = () => {
    if (config) {
      saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Force page reload to apply new colors
      window.location.reload();
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

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[{k:'branding',l:'الهوية البصرية'},{k:'general',l:'الإعدادات العامة'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.k ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
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
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl shadow-md"
                style={{ backgroundColor: primary }}>
                {config.logoEmoji}
              </div>
              <p className="font-bold text-gray-900 text-lg">{config.name}</p>
              <p className="text-gray-500 text-sm mt-1">{config.tagline}</p>
              <button className="mt-4 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: primary }}>
                تسجيل الدخول
              </button>
            </div>
          </div>

          {/* Portal Name */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" /> اسم البوابة
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم بالعربية</label>
                <input value={config.name} onChange={e => update('name', e.target.value)}
                  placeholder="بوابة المذاخر"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primary } as any} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم بالإنجليزية</label>
                <input dir="ltr" value={config.nameEn} onChange={e => update('nameEn', e.target.value)}
                  placeholder="Warehouse Portal"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الشعار (نص)</label>
                <input value={config.tagline} onChange={e => update('tagline', e.target.value)}
                  placeholder="ميديفلو — إدارة التوزيع"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2" />
              </div>
            </div>
          </div>

          {/* Logo Emoji */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4">أيقونة الشعار</h2>
            <div className="flex flex-wrap gap-3">
              {EMOJI_PRESETS.map(emoji => (
                <button key={emoji} onClick={() => update('logoEmoji', emoji)}
                  className={`w-14 h-14 rounded-xl text-2xl flex items-center justify-center transition-all border-2 ${
                    config.logoEmoji === emoji ? 'scale-110' : 'border-transparent hover:border-gray-200'
                  }`}
                  style={config.logoEmoji === emoji ? { borderColor: primary, backgroundColor: `${primary}15` } : { backgroundColor: '#f9fafb' }}>
                  {emoji}
                </button>
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
                  <div className={`w-10 h-10 rounded-xl transition-all ${
                    config.primaryColor === preset.value ? 'scale-110 ring-2 ring-offset-2' : ''
                  }`}
                    style={{
                      backgroundColor: preset.value,
                      ringColor: preset.value,
                    }} />
                  <span className="text-xs text-gray-600">{preset.name}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">لون مخصص (HEX)</label>
              <div className="flex items-center gap-3">
                <input type="color" value={config.primaryColor}
                  onChange={e => update('primaryColor', e.target.value)}
                  className="w-12 h-12 rounded-xl border-0 cursor-pointer" />
                <input dir="ltr" value={config.primaryColor}
                  onChange={e => update('primaryColor', e.target.value)}
                  placeholder="#f59e0b"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none font-mono" />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'general' && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-gray-900 mb-4">الإعدادات العامة</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">العملة</label>
            <select value={config.currency} onChange={e => update('currency', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none">
              <option value="IQD">دينار عراقي (IQD)</option>
              <option value="USD">دولار أمريكي (USD)</option>
              <option value="SAR">ريال سعودي (SAR)</option>
              <option value="AED">درهم إماراتي (AED)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الدولة</label>
            <select value={config.country} onChange={e => update('country', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none">
              <option value="IQ">العراق</option>
              <option value="SA">السعودية</option>
              <option value="AE">الإمارات</option>
              <option value="JO">الأردن</option>
              <option value="KW">الكويت</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
