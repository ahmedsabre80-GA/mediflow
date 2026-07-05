'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Truck, Store, Calculator, Upload, X, MapPin, Clock, Navigation, Send, Lock, Palette, FileText, Globe, KeyRound } from 'lucide-react';
import dynamic from 'next/dynamic';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

// Iraq provinces with capital coordinates
const IRAQ_PROVINCES: Record<string, { lat: number; lng: number; label: string }> = {
  baghdad:    { lat: 33.3152, lng: 44.3661, label: 'بغداد' },
  basra:      { lat: 30.5085, lng: 47.7835, label: 'البصرة' },
  nineveh:    { lat: 36.3350, lng: 43.1189, label: 'نينوى' },
  erbil:      { lat: 36.1911, lng: 44.0092, label: 'أربيل' },
  sulaymaniyah:{ lat: 35.5572, lng: 45.4352, label: 'السليمانية' },
  duhok:      { lat: 36.8669, lng: 42.9499, label: 'دهوك' },
  kirkuk:     { lat: 35.4681, lng: 44.3922, label: 'كركوك' },
  diyala:     { lat: 33.7473, lng: 44.6429, label: 'ديالى' },
  anbar:      { lat: 33.3731, lng: 43.3003, label: 'الأنبار' },
  saladin:    { lat: 34.5339, lng: 43.4849, label: 'صلاح الدين' },
  wasit:      { lat: 32.4978, lng: 45.8161, label: 'واسط' },
  muthanna:   { lat: 29.3722, lng: 45.2868, label: 'المثنى' },
  dhi_qar:    { lat: 31.0461, lng: 46.2597, label: 'ذي قار' },
  maysan:     { lat: 31.8344, lng: 47.1532, label: 'ميسان' },
  qadisiyyah: { lat: 31.9948, lng: 44.9197, label: 'القادسية' },
  babylon:    { lat: 32.4710, lng: 44.4219, label: 'بابل' },
  karbala:    { lat: 32.6169, lng: 44.0246, label: 'كربلاء' },
  najaf:      { lat: 31.9960, lng: 44.3261, label: 'النجف' },
};

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Lazy-load map to avoid SSR issues
const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false, loading: () => (
  <div className="w-full h-64 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">جاري تحميل الخريطة...</div>
)});

function PasswordResetRequest({ pharmacyName, settingsObj }: { pharmacyName: string; settingsObj: any }) {
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleRequest = async () => {
    setSending(true);
    try {
      const pharmacyId = localStorage.getItem('pharmacy-id') || '';
      const email      = localStorage.getItem('pharmacy-email') || settingsObj.email || '';
      const name       = pharmacyName || localStorage.getItem('pharmacy-name') || 'صيدلية';
      await fetch('https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/portal-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'admin',
          recipientId: 'admin',
          senderName: name,
          message: `🔑 طلب إعادة تعيين كلمة المرور\n━━━━━━━━━━━━━━━\nالصيدلية: ${name}\nالبريد الإلكتروني: ${email}\n[reset_password_request]\n[pharmacy_id:${pharmacyId}]\n[pharmacy_email:${email}]`,
        }),
      });
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch {}
    setSending(false);
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <h3 className="font-bold text-gray-900 flex items-center gap-2"><KeyRound className="w-5 h-5 text-orange-500" /> إعادة تعيين كلمة المرور</h3>
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700">
        إذا نسيت كلمة المرور أو تريد تغييرها، أرسل طلباً للإدارة وسيتم إرسال كلمة مرور مؤقتة إليك.
      </div>
      {sent ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium text-center">
          ✓ تم إرسال الطلب — ستتلقى كلمة المرور الجديدة قريباً
        </div>
      ) : (
        <button onClick={handleRequest} disabled={sending}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
          {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {sending ? 'جاري الإرسال...' : 'طلب إعادة تعيين كلمة المرور'}
        </button>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [saved,         setSaved]         = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [locationSaved, setLocationSaved] = useState<'idle'|'saving'|'ok'|'err'>('idle');
  const [logoImage, setLogoImage] = useState('');
  const [tab,       setTab]       = useState<'info'|'location'|'delivery'|'hours'>('info');
  const fileRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState({
    name: '', phone: '', email: '', address: '',
    delivery_rate_per_km: 0, delivery_min_fee: 0, delivery_max_km: 20,
    latitude: null as number | null,
    longitude: null as number | null,
    province: 'baghdad',
    description: '',
    website: '',
    theme_color: '#0ea5e9',
  });

  // Change-request modal state
  const [changeReq, setChangeReq]         = useState<{ field: string; label: string; placeholder: string } | null>(null);
  const [changeReqVal, setChangeReqVal]   = useState('');
  const [changeReqNote, setChangeReqNote] = useState('');
  const [sendingReq, setSendingReq]       = useState(false);
  const [reqSent, setReqSent]             = useState(false);

  // Opening hours: { day: { open: bool, from: string, to: string } }
  const [hours, setHours] = useState(() =>
    DAYS_AR.reduce((acc, _, i) => ({
      ...acc,
      [i]: { open: i !== 5, from: '08:00', to: '22:00' }, // Fri closed by default
    }), {} as Record<number, { open: boolean; from: string; to: string }>)
  );

  useEffect(() => {
    const token = localStorage.getItem('pharmacy-token');
    if (!token) return;

    // Load cached location from localStorage first (survives tab switches + offline)
    const cachedLat = localStorage.getItem('pharmacy-saved-lat');
    const cachedLng = localStorage.getItem('pharmacy-saved-lng');
    if (cachedLat && cachedLng) {
      setSettings(s => ({ ...s, latitude: Number(cachedLat), longitude: Number(cachedLng) }));
    }

    const tokenEmail = localStorage.getItem('pharmacy-email') || '';
    const cachedName  = localStorage.getItem('pharmacy-name')  || '';
    const cachedPhone = localStorage.getItem('pharmacy-phone') || '';
    if (cachedName || cachedPhone || tokenEmail) {
      setSettings(s => ({ ...s, name: cachedName || s.name, phone: cachedPhone || s.phone, email: tokenEmail || s.email }));
    }

    // Fetch settings (delivery/location) and registration info (name/phone) in parallel
    const pharmacyId = localStorage.getItem('pharmacy-id') || '';
    Promise.all([
      fetch(`${API}/my/settings`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
      pharmacyId ? fetch(`${API}/${pharmacyId}`).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
    ]).then(([settings_data, info_data]) => {
      const d = settings_data?.data || {};
      const info = info_data?.data || {};
      const lat = d.latitude ?? (cachedLat ? Number(cachedLat) : null);
      const lng = d.longitude ?? (cachedLng ? Number(cachedLng) : null);
      setSettings(s => ({
        ...s,
        ...d,
        latitude: lat,
        longitude: lng,
        name:  info.name  || d.name  || s.name,
        phone: info.phone || d.phone || s.phone,
        email: tokenEmail || info.owner_email || d.email || s.email,
      }));
      if (d.opening_hours) {
        try { setHours(JSON.parse(d.opening_hours)); } catch {}
      }
    });
    const stored = localStorage.getItem('pharmacy-logo-image');
    if (stored) setLogoImage(stored);
    const storedHours = localStorage.getItem('pharmacy-opening-hours');
    if (storedHours) { try { setHours(JSON.parse(storedHours)); } catch {} }
  }, []);

  const update = (key: string, val: any) => setSettings(s => ({ ...s, [key]: val }));

  const toggleDelivery = async () => {
    const newRate = settings.delivery_rate_per_km > 0 ? 0 : 1000;
    setSettings(s => ({ ...s, delivery_rate_per_km: newRate }));
    try {
      const token = localStorage.getItem('pharmacy-token') || '';
      await fetch(`${API}/my/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ delivery_rate_per_km: newRate }),
      });
    } catch {}
  };

  const setProvince = (key: string) => {
    const p = IRAQ_PROVINCES[key];
    if (p) setSettings(s => ({ ...s, province: key, latitude: p.lat, longitude: p.lng }));
  };

  const saveLocation = async (lat: number, lng: number) => {
    setSettings(s => ({ ...s, latitude: lat, longitude: lng }));
    localStorage.setItem('pharmacy-saved-lat', String(lat));
    localStorage.setItem('pharmacy-saved-lng', String(lng));
    setLocationSaved('saving');
    try {
      const token = localStorage.getItem('pharmacy-token') || '';
      const res = await fetch(`${API}/my/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      setLocationSaved(res.ok ? 'ok' : 'err');
    } catch {
      setLocationSaved('err');
    }
    setTimeout(() => setLocationSaved('idle'), 4000);
  };

  const handleMapClick = (lat: number, lng: number) => { saveLocation(lat, lng); };

  const handleGPS = () => {
    navigator.geolocation?.getCurrentPosition(
      pos => saveLocation(pos.coords.latitude, pos.coords.longitude),
      () => alert('تعذر الحصول على موقعك. تأكد من منح الإذن.')
    );
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 250 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 250 كيلوبايت'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setLogoImage(data);
      localStorage.setItem('pharmacy-logo-image', data);
    };
    reader.readAsDataURL(file);
  };

  const handleSendChangeRequest = async () => {
    if (!changeReq || !changeReqVal.trim() || !changeReqNote.trim()) return;
    setSendingReq(true);
    try {
      const pharmacyId   = localStorage.getItem('pharmacy-id')   || '';
      const pharmacyName = localStorage.getItem('pharmacy-name') || settings.name || 'صيدلية';
      const token        = localStorage.getItem('pharmacy-token') || '';
      await fetch(`${API}/portal-notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'admin',
          recipientId: 'admin',
          senderName: pharmacyName,
          message: `📝 طلب تعديل بيانات صيدلية\n━━━━━━━━━━━━━━━\nالصيدلية: ${pharmacyName}\nالحقل المطلوب تعديله: ${changeReq.label}\nالقيمة الجديدة المطلوبة: ${changeReqVal.trim()}\n${changeReqNote.trim() ? `ملاحظة: ${changeReqNote.trim()}\n` : ''}[pharmacy_id:${pharmacyId}]`,
        }),
      });
      setReqSent(true);
      setTimeout(() => { setReqSent(false); setChangeReq(null); setChangeReqVal(''); setChangeReqNote(''); }, 2500);
    } catch {}
    setSendingReq(false);
  };

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
          latitude: settings.latitude,
          longitude: settings.longitude,
          address: settings.address,
          opening_hours: JSON.stringify(hours),
          description: settings.description,
          website: settings.website,
          theme_color: settings.theme_color,
        }),
      });
      localStorage.setItem('pharmacy-opening-hours', JSON.stringify(hours));
    } catch {}
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const sampleKm = 5;
  const calculatedFee = Math.max(settings.delivery_min_fee, settings.delivery_rate_per_km * sampleKm);

  const mapLat = settings.latitude ?? IRAQ_PROVINCES[settings.province]?.lat ?? 33.3152;
  const mapLng = settings.longitude ?? IRAQ_PROVINCES[settings.province]?.lng ?? 44.3661;

  const TABS = [
    { id: 'info',     label: 'معلومات', icon: Store },
    { id: 'location', label: 'الموقع',  icon: MapPin },
    { id: 'hours',    label: 'أوقات العمل', icon: Clock },
    { id: 'delivery', label: 'التوصيل', icon: Truck },
  ] as const;

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

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${tab === id ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── INFO TAB ── */}
      {tab === 'info' && (
        <>
          {/* Branding card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Palette className="w-5 h-5 text-sky-500" /> الهوية البصرية</h3>

            {/* Logo + theme color side by side */}
            <div className="flex gap-4 items-start">
              {/* Logo */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <div
                  className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 cursor-pointer hover:border-sky-400 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  title="انقر لرفع الشعار"
                >
                  {logoImage
                    ? <img src={logoImage} alt="logo" className="w-full h-full object-cover" />
                    : <Store className="w-8 h-8 text-gray-300" />}
                </div>
                <p className="text-xs text-gray-400 text-center">الشعار<br/>أقل من 250 كيلوبايت</p>
                {logoImage && (
                  <button onClick={() => { setLogoImage(''); localStorage.removeItem('pharmacy-logo-image'); }}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                    <X className="w-3 h-3" /> حذف
                  </button>
                )}
              </div>

              {/* Theme color + preview */}
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">لون الصيدلية</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={settings.theme_color}
                      onChange={e => update('theme_color', e.target.value)}
                      className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
                    <input type="text" value={settings.theme_color}
                      onChange={e => update('theme_color', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                      dir="ltr" maxLength={7} placeholder="#0ea5e9" />
                  </div>
                </div>
                {/* Mini preview */}
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <div className="h-10 flex items-center px-3 gap-2" style={{ backgroundColor: settings.theme_color }}>
                    {logoImage
                      ? <img src={logoImage} alt="logo" className="w-6 h-6 rounded object-cover" />
                      : <Store className="w-5 h-5 text-white/80" />}
                    <span className="text-white text-sm font-bold truncate">{settings.name || 'اسم الصيدلية'}</span>
                  </div>
                  <div className="px-3 py-2 bg-white text-xs text-gray-500">معاينة بطاقة الصيدلية</div>
                </div>
              </div>
            </div>
          </div>

          {/* Core info — locked fields with change-request */}
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Store className="w-5 h-5 text-sky-500" /> معلومات الصيدلية</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              الاسم ورقم الهاتف والبريد يتطلبان موافقة الإدارة — اضغط "إرسال طلب" لتقديم طلب التعديل.
            </div>

            {[
              { key: 'name',  label: 'اسم الصيدلية',     placeholder: 'الاسم الجديد المراد تغييره' },
              { key: 'phone', label: 'رقم الهاتف',        placeholder: 'رقم الهاتف الجديد' },
              { key: 'email', label: 'البريد الإلكتروني', placeholder: 'البريد الإلكتروني الجديد' },
            ].map(f => {
              const currentVal = (settings as any)[f.key];
              return (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{f.label}</label>
                <div className="flex gap-2">
                  <div dir="rtl"
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
                    {currentVal || <span className="text-gray-400">{f.placeholder}</span>}
                  </div>
                  <button
                    onClick={() => { setChangeReq({ field: f.key, label: f.label, placeholder: f.placeholder }); setChangeReqVal(currentVal || ''); setChangeReqNote(''); setReqSent(false); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 rounded-xl text-xs font-medium transition-colors shrink-0">
                    <Send className="w-3.5 h-3.5" /> إرسال طلب
                  </button>
                </div>
              </div>
              );
            })}

            {/* Editable fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">العنوان التفصيلي</label>
              <input type="text" value={settings.address} onChange={e => update('address', e.target.value)}
                placeholder="بغداد، الكرادة، شارع المتنبي" dir="rtl"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
            </div>
          </div>

          {/* Password reset request */}
          <PasswordResetRequest pharmacyName={settings.name} settingsObj={settings} />

          {/* Extra info */}
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><FileText className="w-5 h-5 text-sky-500" /> معلومات إضافية</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">وصف الصيدلية</label>
              <textarea value={settings.description} onChange={e => update('description', e.target.value)}
                placeholder="اكتب نبذة قصيرة عن صيدليتك، خدماتك، تخصصاتك..."
                rows={3} dir="rtl"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm resize-none" />
              <p className="text-xs text-gray-400 mt-1 text-left">{settings.description.length}/300</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                الموقع الإلكتروني أو صفحة التواصل
              </label>
              <input type="url" value={settings.website} onChange={e => update('website', e.target.value)}
                placeholder="https://facebook.com/yourpage" dir="ltr"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
            </div>
          </div>
        </>
      )}

      {/* ── CHANGE REQUEST MODAL ── */}
      {changeReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
              <button onClick={() => setChangeReq(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              <h3 className="font-bold text-gray-900">طلب تعديل — {changeReq.label}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {reqSent ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Send className="w-7 h-7 text-green-600" />
                  </div>
                  <p className="font-bold text-gray-900">تم إرسال الطلب!</p>
                  <p className="text-sm text-gray-500 mt-1">ستتلقى إشعاراً بعد مراجعة الإدارة</p>
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                    سيصل طلبك لإدارة المنصة وسيتم مراجعته والرد عليك في أقرب وقت.
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{changeReq.placeholder} *</label>
                    <input type="text" value={changeReqVal} onChange={e => setChangeReqVal(e.target.value)}
                      placeholder={changeReq.placeholder}
                      dir={changeReq.field === 'name' ? 'rtl' : 'ltr'}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">سبب الطلب *</label>
                    <textarea value={changeReqNote} onChange={e => setChangeReqNote(e.target.value)}
                      placeholder="اشرح سبب رغبتك في التغيير..."
                      rows={2} dir="rtl"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm resize-none" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setChangeReq(null)}
                      className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                      إلغاء
                    </button>
                    <button onClick={handleSendChangeRequest} disabled={sendingReq || !changeReqVal.trim() || !changeReqNote.trim()}
                      className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                      {sendingReq ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                      {sendingReq ? 'جاري الإرسال...' : 'إرسال الطلب للإدارة'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATION TAB ── */}
      {tab === 'location' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-sky-500" /> موقع الصيدلية</h3>
          <p className="text-sm text-gray-500">حدد موقع الصيدلية بدقة حتى يتمكن المرضى من إيجادك على الخريطة.</p>

          {/* Province picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">المحافظة</label>
            <select value={settings.province} onChange={e => setProvince(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white">
              {Object.entries(IRAQ_PROVINCES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">اختيار المحافظة يضع الموقع تلقائياً على عاصمتها — يمكنك تعديله بالخريطة</p>
          </div>

          {/* GPS button + save status */}
          <div className="flex items-center gap-2">
            <button onClick={handleGPS}
              className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl text-sm font-medium text-sky-700 transition-colors justify-center">
              <Navigation className="w-4 h-4" /> استخدم موقعي الحالي (GPS)
            </button>
            {locationSaved === 'saving' && <span className="text-xs text-gray-500 shrink-0">جاري الحفظ...</span>}
            {locationSaved === 'ok'  && <span className="text-xs text-green-600 font-medium shrink-0">✓ تم الحفظ</span>}
            {locationSaved === 'err' && <span className="text-xs text-red-500 font-medium shrink-0">✗ فشل الحفظ — حاول مجدداً</span>}
          </div>

          {/* Coordinates display */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">خط العرض (Latitude)</label>
              <input type="number" step="0.0001" value={settings.latitude ?? ''} dir="ltr"
                onChange={e => update('latitude', e.target.value ? Number(e.target.value) : null)}
                placeholder="33.3152"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">خط الطول (Longitude)</label>
              <input type="number" step="0.0001" value={settings.longitude ?? ''} dir="ltr"
                onChange={e => update('longitude', e.target.value ? Number(e.target.value) : null)}
                placeholder="44.3661"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>

          {/* Map */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">أو انقر على الخريطة لتحديد الموقع بدقة</p>
            <LocationMap lat={mapLat} lng={mapLng} onLocationSelect={handleMapClick} />
          </div>

          {settings.latitude && settings.longitude && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0" />
              تم تحديد الموقع: {Number(settings.latitude).toFixed(5)}, {Number(settings.longitude).toFixed(5)}
            </div>
          )}
        </div>
      )}

      {/* ── HOURS TAB ── */}
      {tab === 'hours' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Clock className="w-5 h-5 text-sky-500" /> أوقات العمل</h3>
          <p className="text-sm text-gray-500">تظهر الصيدلية للمرضى كـ "مفتوح" فقط خلال الأوقات المحددة هنا.</p>
          <div className="space-y-3">
            {DAYS_AR.map((day, i) => (
              <div key={i} className="flex items-center gap-3">
                <button onClick={() => setHours(h => ({ ...h, [i]: { ...h[i], open: !h[i].open } }))}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${hours[i]?.open ? 'bg-sky-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${hours[i]?.open ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="w-20 text-sm font-medium text-gray-700 shrink-0">{day}</span>
                {hours[i]?.open ? (
                  <>
                    <input type="time" value={hours[i].from}
                      onChange={e => setHours(h => ({ ...h, [i]: { ...h[i], from: e.target.value } }))}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    <span className="text-gray-400 text-sm">—</span>
                    <input type="time" value={hours[i].to}
                      onChange={e => setHours(h => ({ ...h, [i]: { ...h[i], to: e.target.value } }))}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </>
                ) : (
                  <span className="text-sm text-gray-400 flex-1">مغلق</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DELIVERY TAB ── */}
      {tab === 'delivery' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Truck className="w-5 h-5 text-amber-500" /> إعدادات التوصيل</h3>

          {/* Delivery on/off toggle */}
          <div className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-colors ${settings.delivery_rate_per_km > 0 ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
            <div>
              <p className="font-bold text-gray-900 text-sm">خدمة التوصيل</p>
              <p className={`text-xs mt-0.5 font-medium ${settings.delivery_rate_per_km > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {settings.delivery_rate_per_km > 0 ? '✓ متاحة — يراها المرضى في البحث' : '✗ غير متاحة — لن يرى المرضى خيار التوصيل'}
              </p>
            </div>
            <button
              onClick={toggleDelivery}
              className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${settings.delivery_rate_per_km > 0 ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${settings.delivery_rate_per_km > 0 ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {settings.delivery_rate_per_km > 0 && (
          <>
          <p className="text-xs text-gray-500">رسوم التوصيل تُحسب تلقائياً حسب المسافة × السعر لكل كيلومتر</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">سعر التوصيل لكل كيلومتر (د.ع)</label>
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">أقصى نطاق توصيل (كم)</label>
              <input type="number" min="1" value={settings.delivery_max_km}
                onChange={e => update('delivery_max_km', Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm" />
            </div>
          </div>
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
              </div>
            </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}
