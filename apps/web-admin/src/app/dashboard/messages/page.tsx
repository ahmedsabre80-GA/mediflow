'use client';
import { useState, useEffect, useRef } from 'react';
import { Send, Mail, MessageCircle, Bell, Mic, Users, Building2, Stethoscope, Package, FlaskConical, ExternalLink, Search, X, CheckCircle, RefreshCw } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const RECIPIENT_GROUPS = [
  { key: 'all',         label: 'الجميع',      icon: Users,        portalTypes: ['pharmacy', 'doctor', 'warehouse', 'pharmacist'] },
  { key: 'doctors',     label: 'الأطباء',     icon: Stethoscope,  portalTypes: ['doctor'] },
  { key: 'pharmacies',  label: 'الصيدليات',   icon: Building2,    portalTypes: ['pharmacy'] },
  { key: 'pharmacists', label: 'الصيادلة',    icon: FlaskConical, portalTypes: ['pharmacist'] },
  { key: 'warehouses',  label: 'المذاخر',     icon: Package,      portalTypes: ['warehouse'] },
  { key: 'specific',    label: 'مستخدم محدد', icon: Search,       portalTypes: [] },
];

const CHANNELS = [
  { key: 'inapp',     label: 'داخل المنصة',    icon: Bell,          desc: 'إشعار فوري في التطبيق', free: true },
  { key: 'email',     label: 'البريد الإلكتروني', icon: Mail,       desc: 'رسالة على البريد',       free: true },
  { key: 'whatsapp',  label: 'واتساب',          icon: MessageCircle, desc: 'عبر واتساب ويب',        free: true },
  { key: 'voice',     label: 'رسالة صوتية',    icon: Mic,           desc: 'تسجيل صوتي',            free: false },
];

interface Pharmacy { id: string; name: string; name_ar: string; phone: string; city: string; }
interface SentMsg   { id: string; portal_type: string; recipient_id: string; sender_name: string; message: string; created_at: string; is_read: boolean; }

export default function MessagesPage() {
  const [selectedGroup,    setSelectedGroup]    = useState('all');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['inapp']);
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [toast,   setToast]   = useState('');
  const [tab,     setTab]     = useState<'compose' | 'sent'>('compose');
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  // Specific user search
  const [pharmacies,    setPharmacies]    = useState<Pharmacy[]>([]);
  const [userSearch,    setUserSearch]    = useState('');
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [selectedUser,  setSelectedUser]  = useState<Pharmacy | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Sent messages
  const [sentMessages,  setSentMessages]  = useState<SentMsg[]>([]);
  const [sentLoading,   setSentLoading]   = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  // Load pharmacies for specific targeting
  useEffect(() => {
    fetch(`${PHARMACY_API}/admin/all`)
      .then(r => r.json())
      .then(d => setPharmacies(d.data || []))
      .catch(() => {});
  }, []);

  const loadSentMessages = () => {
    setSentLoading(true);
    fetch(`${PHARMACY_API}/portal-notifications/admin-log`)
      .then(r => r.json())
      .then(d => setSentMessages(d.data || []))
      .catch(() => {})
      .finally(() => setSentLoading(false));
  };

  useEffect(() => { if (tab === 'sent') loadSentMessages(); }, [tab]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredPharmacies = pharmacies.filter(p =>
    (p.name_ar || p.name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (p.phone || '').includes(userSearch) ||
    (p.city || '').toLowerCase().includes(userSearch.toLowerCase())
  ).slice(0, 8);

  const toggleChannel = (key: string) => {
    if (key === 'whatsapp') { setShowWhatsApp(true); return; }
    setSelectedChannels(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    if (selectedChannels.length === 0)  { showToast('⚠️ يرجى اختيار قناة إرسال واحدة على الأقل'); return; }
    if (selectedGroup === 'specific' && !selectedUser) { showToast('⚠️ يرجى اختيار المستخدم المحدد'); return; }

    setSending(true);
    const fullMessage = `${title}\n\n${body}`;
    const senderName  = 'فريق ميديفلو';

    try {
      if (selectedGroup === 'specific' && selectedUser) {
        // Send to one specific pharmacy
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portalType: 'pharmacy', recipientId: selectedUser.id, senderName, message: fullMessage }),
        });
      } else {
        // Broadcast to selected group portal types
        const group = RECIPIENT_GROUPS.find(g => g.key === selectedGroup);
        const portalTypes = group?.portalTypes || [];
        if (portalTypes.length > 0) {
          await fetch(`${PHARMACY_API}/portal-notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portalTypes, recipientId: 'broadcast', senderName, message: fullMessage }),
          });
        }
      }

      logAction('send_message', 'إرسال رسالة', 'رسالة', title, undefined, '/dashboard/messages');
      const recipientLabel = selectedGroup === 'specific' ? (selectedUser?.name_ar || selectedUser?.name || 'مستخدم') : (RECIPIENT_GROUPS.find(g => g.key === selectedGroup)?.label || '');
      showToast(`✅ تم الإرسال إلى ${recipientLabel} بنجاح`);
      setTitle('');
      setBody('');
      setSelectedUser(null);
      setUserSearch('');
      setTab('sent');
    } catch {
      showToast('❌ فشل الإرسال، يرجى المحاولة مجدداً');
    } finally {
      setSending(false);
    }
  };

  const whatsappText = encodeURIComponent(`${title}\n\n${body}`);

  const portalTypeLabel = (t: string) => ({ pharmacy: 'صيدلية', doctor: 'طبيب', warehouse: 'مخزن', pharmacist: 'صيدلاني' }[t] || t);

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      {/* WhatsApp Modal */}
      {showWhatsApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <h2 className="text-lg font-bold text-gray-900 mb-3">إرسال عبر واتساب</h2>
            <p className="text-sm text-gray-600 mb-4">لا يمكن ربط واتساب مباشرة بالبرنامج مجاناً. سيتم فتح واتساب ويب حيث يمكنك إرسال الرسالة يدوياً.</p>
            <div className="bg-green-50 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-green-800 mb-2">نص الرسالة:</p>
              <p className="text-sm text-green-700">{title || 'اكتب عنوان الرسالة أولاً'}</p>
              {body && <p className="text-sm text-green-600 mt-1">{body}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowWhatsApp(false)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <a href={`https://web.whatsapp.com/send?text=${whatsappText}`} target="_blank" rel="noopener noreferrer"
                onClick={() => { setShowWhatsApp(false); setSelectedChannels(prev => [...prev, 'whatsapp']); }}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                <ExternalLink className="w-4 h-4" /> فتح واتساب ويب
              </a>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">مركز الرسائل</h1>
        <p className="text-sm text-gray-500 mt-1">أرسل رسائل لمجموعات المستخدمين أو مستخدم محدد</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[{ k: 'compose', l: 'إنشاء رسالة' }, { k: 'sent', l: 'الرسائل المرسلة' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Settings */}
          <div className="space-y-5">
            {/* Recipients */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-500" /> المستلمون
              </h2>
              <div className="space-y-2">
                {RECIPIENT_GROUPS.map(group => {
                  const Icon = group.icon;
                  const selected = selectedGroup === group.key;
                  return (
                    <button key={group.key} onClick={() => { setSelectedGroup(group.key); setSelectedUser(null); setUserSearch(''); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selected ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-sky-600' : 'text-gray-400'}`} />
                      <span className="flex-1 text-sm font-medium text-gray-800">{group.label}</span>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}>
                        {selected && <span className="w-2 h-2 bg-white rounded-full block" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Specific user search */}
              {selectedGroup === 'specific' && (
                <div className="mt-3 relative" ref={searchRef}>
                  {selectedUser ? (
                    <div className="flex items-center gap-2 p-3 bg-sky-50 rounded-xl border-2 border-sky-500">
                      <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-sky-800 truncate">{selectedUser.name_ar || selectedUser.name}</p>
                        <p className="text-xs text-sky-600">{selectedUser.city} · {selectedUser.phone}</p>
                      </div>
                      <button onClick={() => { setSelectedUser(null); setUserSearch(''); }}
                        className="text-sky-400 hover:text-sky-600"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                        <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                          onFocus={() => setShowDropdown(true)}
                          placeholder="ابحث عن صيدلية..."
                          className="w-full pr-9 pl-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      </div>
                      {showDropdown && userSearch && (
                        <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-xl shadow-lg border z-10 max-h-48 overflow-y-auto">
                          {filteredPharmacies.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-3">لا توجد نتائج</p>
                          ) : filteredPharmacies.map(p => (
                            <button key={p.id} onClick={() => { setSelectedUser(p); setUserSearch(''); setShowDropdown(false); }}
                              className="w-full text-right px-4 py-2.5 hover:bg-sky-50 border-b last:border-0 transition-colors">
                              <p className="text-sm font-medium text-gray-800">{p.name_ar || p.name}</p>
                              <p className="text-xs text-gray-500">{p.city} · {p.phone}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Channels */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3">قنوات الإرسال</h2>
              <div className="space-y-2">
                {CHANNELS.map(channel => {
                  const Icon = channel.icon;
                  const selected = selectedChannels.includes(channel.key);
                  return (
                    <button key={channel.key} onClick={() => toggleChannel(channel.key)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selected ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <Icon className={`w-5 h-5 shrink-0 ${selected ? 'text-sky-600' : 'text-gray-400'}`} />
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium text-gray-800">{channel.label}</p>
                        <p className="text-xs text-gray-500">{channel.desc}</p>
                      </div>
                      {!channel.free && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">مدفوع</span>}
                      {channel.key === 'whatsapp' && <ExternalLink className="w-4 h-4 text-gray-400" />}
                      {channel.key !== 'whatsapp' && (
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}>
                          {selected && <span className="text-white text-xs">✓</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">* الإشعارات داخل المنصة تُرسل فوراً للمستخدمين المسجلين</p>
            </div>
          </div>

          {/* Right: Message */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">محتوى الرسالة</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">عنوان الرسالة *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="مثال: تحديث مهم بخصوص سياسة التسعير"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">نص الرسالة *</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
                    placeholder="اكتب رسالتك هنا..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
                  <p className="text-xs text-gray-400 mt-1 text-left">{body.length} حرف</p>
                </div>
              </div>
            </div>

            {/* Preview */}
            {(title || body) && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">معاينة الرسالة</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Bell className="w-4 h-4" />
                    <span>من: فريق ميديفلو</span>
                    <span>•</span>
                    <span>إلى: {selectedGroup === 'specific' ? (selectedUser?.name_ar || selectedUser?.name || 'لم يُحدد بعد') : (RECIPIENT_GROUPS.find(g => g.key === selectedGroup)?.label)}</span>
                  </div>
                  {title && <p className="font-bold text-gray-900">{title}</p>}
                  {body && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
                </div>
              </div>
            )}

            <button onClick={handleSend} disabled={sending || !title || !body || (selectedGroup === 'specific' && !selectedUser)}
              className="w-full flex items-center justify-center gap-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-colors shadow-lg">
              {sending ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> جاري الإرسال...</>
              ) : (
                <><Send className="w-5 h-5" /> إرسال الرسالة</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Sent Messages */}
      {tab === 'sent' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{sentMessages.length} رسالة مرسلة</p>
            <button onClick={loadSentMessages} disabled={sentLoading}
              className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${sentLoading ? 'animate-spin' : ''}`} /> تحديث
            </button>
          </div>
          {sentLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">جاري التحميل...</div>
          ) : sentMessages.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">لا توجد رسائل مرسلة بعد</p>
            </div>
          ) : sentMessages.map(msg => {
            const firstLine = msg.message?.split('\n')[0] || '';
            const rest = msg.message?.split('\n').slice(2).join('\n') || '';
            return (
              <div key={msg.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-1 rounded-full">تم الإرسال</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{portalTypeLabel(msg.portal_type)}</span>
                    {msg.recipient_id === 'broadcast' && <span className="text-xs bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full">بث عام</span>}
                    {msg.is_read && <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">مقروءة</span>}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleString('ar-IQ')}</span>
                </div>
                <p className="font-bold text-gray-900 text-sm">{firstLine}</p>
                {rest && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{rest}</p>}
                <p className="text-xs text-gray-400 mt-2">من: {msg.sender_name}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
