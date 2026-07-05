'use client';
import { useState, useEffect } from 'react';
import { Save, Bell, Shield, Globe, Database, FileCheck, Clock, AlertTriangle } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoRejectMin,    setAutoRejectMin]    = useState(10);
  const [autoRejectSaved,  setAutoRejectSaved]  = useState(false);
  const [autoRejectSaving, setAutoRejectSaving] = useState(false);
  const [rxRejectMin,    setRxRejectMin]    = useState(30);
  const [rxRejectSaved,  setRxRejectSaved]  = useState(false);
  const [rxRejectSaving, setRxRejectSaving] = useState(false);
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
    requireCertificate: false,
    logAdminActions: true,
  });

  useEffect(() => {
    // Load from localStorage first as immediate fallback
    const local = localStorage.getItem('mediflow-platform-settings');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        setSettings(s => ({ ...s, ...parsed }));
      } catch {}
    }
    // Load auto-reject timeout from backend
    fetch(`${PHARMACY_API}/platform/config/auto_reject_minutes`)
      .then(r => r.json())
      .then(d => { if (d.success) setAutoRejectMin(Number(d.data.value)); })
      .catch(() => {});
    fetch(`${PHARMACY_API}/platform/config/prescription_reject_minutes`)
      .then(r => r.json())
      .then(d => { if (d.success) setRxRejectMin(Number(d.data.value)); })
      .catch(() => {});

    // Only use API as fallback if localStorage has no saved value
    if (!local) {
      fetch(`${PHARMACY_API}/pharmacies/settings`)
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data) {
            setSettings(s => ({
              ...s,
              requireCertificate: d.data.require_certificate === true,
              logAdminActions: d.data.log_admin_actions === true,
            }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const update = (key: string, value: any) => {
    setSettings(s => {
      const next = { ...s, [key]: value };
      // Persist security toggles to localStorage immediately so they survive navigation
      const toSave = { requireCertificate: next.requireCertificate, logAdminActions: next.logAdminActions };
      localStorage.setItem('mediflow-platform-settings', JSON.stringify(toSave));
      return next;
    });
  };

  const handleAutoRejectSave = async () => {
    const val = Math.min(60, Math.max(1, autoRejectMin));
    setAutoRejectMin(val);
    setAutoRejectSaving(true);
    try {
      await fetch(`${PHARMACY_API}/platform/config/auto_reject_minutes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'mediflow-admin-2026' },
        body: JSON.stringify({ value: val }),
      });
      setAutoRejectSaved(true);
      setTimeout(() => setAutoRejectSaved(false), 3000);
    } catch {}
    setAutoRejectSaving(false);
  };

  const handleRxRejectSave = async () => {
    const val = Math.min(120, Math.max(5, rxRejectMin));
    setRxRejectMin(val);
    setRxRejectSaving(true);
    try {
      await fetch(`${PHARMACY_API}/platform/config/prescription_reject_minutes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'mediflow-admin-2026' },
        body: JSON.stringify({ value: val }),
      });
      setRxRejectSaved(true);
      setTimeout(() => setRxRejectSaved(false), 3000);
    } catch {}
    setRxRejectSaving(false);
  };

  const handleSave = async () => {
    setSaving(true);
    // Always save to localStorage so toggles survive navigation
    const toSave = {
      requireCertificate: settings.requireCertificate,
      logAdminActions: settings.logAdminActions,
    };
    localStorage.setItem('mediflow-platform-settings', JSON.stringify(toSave));
    try {
      const token = localStorage.getItem('admin-token') || '';
      const res = await fetch(`${PHARMACY_API}/pharmacies/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          secret: 'mediflow-admin-2026',
          require_certificate: settings.requireCertificate,
          log_admin_actions: settings.logAdminActions,
        }),
      });
      if (!res.ok) console.warn('Settings PATCH returned', res.status);
    } catch (e) {
      console.warn('Settings save failed, using localStorage fallback', e);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button type="button" onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-sky-500' : 'bg-gray-300'}`}>
      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إعدادات المنصة</h1>
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${
            saved ? 'bg-green-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'
          }`}>
          <Save className="w-4 h-4" />
          {saved ? 'تم الحفظ ✓' : saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
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

      {/* Registration & Security */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
            <FileCheck className="w-5 h-5 text-green-600" />
          </div>
          <h2 className="font-bold text-gray-900">التسجيل والأمان</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-700">طلب شهادة عند التسجيل</p>
              <p className="text-xs text-gray-500 mt-0.5">
                عند التفعيل، يجب على الصيدليات والأطباء والمستودعات رفع شهادة رسمية عند التسجيل، وإلا يُحذف الطلب تلقائياً
              </p>
            </div>
            <Toggle value={settings.requireCertificate} onChange={() => update('requireCertificate', !settings.requireCertificate)} />
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-700">تسجيل إجراءات المدير</p>
              <p className="text-xs text-gray-500 mt-0.5">
                عند التفعيل، تُسجَّل جميع إجراءات المدير (موافقة، رفض، حذف، إضافة) في سجل المراقبة
              </p>
            </div>
            <Toggle value={settings.logAdminActions} onChange={() => update('logAdminActions', !settings.logAdminActions)} />
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
              <Toggle value={(settings as any)[item.key]} onChange={() => update(item.key, !(settings as any)[item.key])} />
            </div>
          ))}
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
            <div>
              <p className="text-sm font-medium text-gray-700">وضع الصيانة</p>
              <p className="text-xs text-gray-500">إيقاف المنصة مؤقتاً للصيانة</p>
            </div>
            <Toggle value={settings.maintenanceMode} onChange={() => update('maintenanceMode', !settings.maintenanceMode)} />
          </div>
        </div>
      </div>

      {/* Auto-reject rule */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border-2 border-amber-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">قاعدة الرفض التلقائي للطلبات</h2>
            <p className="text-xs text-gray-500 mt-0.5">تُطبَّق على جميع الصيدليات في المنصة</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">كيف تعمل هذه القاعدة؟</p>
            <ul className="space-y-1 text-xs list-disc list-inside">
              <li>إذا لم ترد الصيدلية على طلب المريض خلال المدة المحددة، يُرفض الطلب تلقائياً</li>
              <li>يصل إشعار رفض للمريض مع اقتراح بالبحث عن صيدلية أخرى</li>
              <li>يُخصم 0.2 نجمة من تقييم الصيدلية عن كل رفض تلقائي</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              مدة الانتظار قبل الرفض التلقائي (دقيقة)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range" min={1} max={60} value={autoRejectMin}
                onChange={e => setAutoRejectMin(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <div className="w-20 text-center">
                <span className="text-3xl font-bold text-amber-600">{autoRejectMin}</span>
                <p className="text-xs text-gray-500">دقيقة</p>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 دقيقة (صارم)</span>
              <span>60 دقيقة (مرن)</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 15, 30].map(v => (
              <button key={v} onClick={() => setAutoRejectMin(v)}
                className={`py-2 rounded-xl text-sm font-medium border transition-colors ${autoRejectMin === v ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-600 hover:bg-amber-50'}`}>
                {v} دقيقة
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              الإعداد الحالي: طلبات غير مجاب عليها بعد <strong>{autoRejectMin} دقيقة</strong> تُرفض تلقائياً
            </p>
            <button onClick={handleAutoRejectSave} disabled={autoRejectSaving}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${autoRejectSaved ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
              <Save className="w-4 h-4" />
              {autoRejectSaved ? 'تم الحفظ ✓' : autoRejectSaving ? 'جاري...' : 'حفظ القاعدة'}
            </button>
          </div>
        </div>
      </div>

      {/* Prescription auto-reject */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <FileCheck className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">رفض الوصفات الطبية تلقائياً</h2>
            <p className="text-xs text-gray-500 mt-0.5">إذا لم تقبل أي صيدلية الوصفة خلال المدة المحددة</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              مدة انتظار قبول الوصفة (دقيقة)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range" min={5} max={120} step={5} value={rxRejectMin}
                onChange={e => setRxRejectMin(Number(e.target.value))}
                className="flex-1 accent-purple-500"
              />
              <div className="w-20 text-center">
                <span className="text-3xl font-bold text-purple-600">{rxRejectMin}</span>
                <p className="text-xs text-gray-500">دقيقة</p>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>5 دقائق</span>
              <span>120 دقيقة</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[15, 30, 60, 120].map(v => (
              <button key={v} onClick={() => setRxRejectMin(v)}
                className={`py-2 rounded-xl text-sm font-medium border transition-colors ${rxRejectMin === v ? 'bg-purple-500 text-white border-purple-500' : 'border-gray-200 text-gray-600 hover:bg-purple-50'}`}>
                {v} دقيقة
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              الإعداد الحالي: وصفات غير مقبولة بعد <strong>{rxRejectMin} دقيقة</strong> تُرفض وتُشعر المريض
            </p>
            <button onClick={handleRxRejectSave} disabled={rxRejectSaving}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${rxRejectSaved ? 'bg-green-500 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'}`}>
              <Save className="w-4 h-4" />
              {rxRejectSaved ? 'تم الحفظ ✓' : rxRejectSaving ? 'جاري...' : 'حفظ القاعدة'}
            </button>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="font-bold text-gray-900">الحماية والخصوصية</h2>
        </div>
        <p className="text-sm text-gray-500">ملاحظة: يمكن حذف الإشعارات من قبل المدير فقط. المستخدمون الآخرون يمكنهم القراءة وتحديد حالة القراءة فقط.</p>
      </div>
    </div>
  );
}
