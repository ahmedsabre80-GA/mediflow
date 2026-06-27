'use client';
import { useState } from 'react';
import { Save } from 'lucide-react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900">إعدادات الصيدلية</h2>

      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
        <h3 className="font-bold text-gray-900 border-b pb-3">معلومات الصيدلية</h3>
        {[
          { label: 'اسم الصيدلية', placeholder: 'صيدلية الأمين', type: 'text' },
          { label: 'رقم الهاتف', placeholder: '+9647801234567', type: 'tel' },
          { label: 'البريد الإلكتروني', placeholder: 'pharmacy@example.com', type: 'email' },
          { label: 'العنوان', placeholder: 'بغداد، الكرادة، شارع المتنبي', type: 'text' },
        ].map((field) => (
          <div key={field.label}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
            <input
              type={field.type}
              placeholder={field.placeholder}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              dir={field.type === 'email' || field.type === 'tel' ? 'ltr' : 'rtl'}
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
        <h3 className="font-bold text-gray-900 border-b pb-3">إعدادات التوصيل</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">رسوم التوصيل (د.ع)</label>
            <input type="number" defaultValue="2000"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">نطاق التوصيل (كم)</label>
            <input type="number" defaultValue="5"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-medium px-6 py-3 rounded-xl transition-colors"
      >
        <Save className="w-4 h-4" />
        {saved ? 'تم الحفظ ✓' : 'حفظ التغييرات'}
      </button>
    </div>
  );
}
