'use client';
import { useState } from 'react';
import { Save, Bell, Shield, Globe, Database } from 'lucide-react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    platformName: 'ميديفلو',
    supportEmail: 'support@mediflow.io',
    maxRequestsPerPatient: 5,
    pharmacyCampaignCooldownDays: 24,
    pharmacyCampaignMaxPatients: 6,
    loyaltyPointsPerOrder: 10,
    commissionRate: 5,
    defaultSearchRadiusKm: 10,
    maintenanceMode: false,
    emailNotifications: true,
    smsNotifications: true,
  });

  const update = (key: string, value: any) => setSettings(s => ({ ...s, [key]: value }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إعدادات المنصة</h1>
        <button onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            saved ? 'bg-green-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'
          }`}>
          <Save className="w-4 h-4" />
          {saved ? 'تم الحفظ ✓' : 'حفظ الإعدادات'}
        </button>
      </div>

      {/* General */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
            <Globe className="w-5 h-5 text-sky-600" />
          </div>
          <h2 className="font-bold text-gray-900">الإعدادات العامة</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم المنصة</label>
            <input value={settings.platformName} onChange={e => update('platformName', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">بريد الدعم الفني</label>
            <input type="email" dir="ltr" value={settings.supportEmail} onChange={e => update('supportEmail', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">نسبة العمولة (%)</label>
              <input type="number" value={settings.commissionRate} onChange={e => update('commissionRate', Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">نطاق البحث الافتراضي (كم)</label>
              <input type="number" value={settings.defaultSearchRadiusKm} onChange={e => update('defaultSearchRadiusKm', Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Business Rules */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Database className="w-5 h-5 text-indigo-600" />
          </div>
          <h2 className="font-bold text-gray-900">قواعد العمل</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">أقصى طلبات نشطة للمريض</label>
            <input type="number" value={settings.maxRequestsPerPatient} onChange={e => update('maxRequestsPerPatient', Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">نقاط الولاء لكل طلب</label>
            <input type="number" value={settings.loyaltyPointsPerOrder} onChange={e => update('loyaltyPointsPerOrder', Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">فترة انتظار الحملة الإعلانية (أيام)</label>
            <input type="number" value={settings.pharmacyCampaignCooldownDays} onChange={e => update('pharmacyCampaignCooldownDays', Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">أقصى مرضى لكل حملة</label>
            <input type="number" value={settings.pharmacyCampaignMaxPatients} onChange={e => update('pharmacyCampaignMaxPatients', Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <h2 className="font-bold text-gray-900">الإشعارات</h2>
        </div>
        <div className="space-y-3">
          {[
            { key: 'emailNotifications', label: 'إشعارات البريد الإلكتروني' },
            { key: 'smsNotifications', label: 'إشعارات الرسائل النصية' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
              <button onClick={() => update(item.key, !(settings as any)[item.key])}
                className={`w-11 h-6 rounded-full transition-colors ${(settings as any)[item.key] ? 'bg-sky-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${(settings as any)[item.key] ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
            <div>
              <p className="text-sm font-medium text-gray-700">وضع الصيانة</p>
              <p className="text-xs text-gray-500">إيقاف المنصة مؤقتاً للصيانة</p>
            </div>
            <button onClick={() => update('maintenanceMode', !settings.maintenanceMode)}
              className={`w-11 h-6 rounded-full transition-colors ${settings.maintenanceMode ? 'bg-red-500' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${settings.maintenanceMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
