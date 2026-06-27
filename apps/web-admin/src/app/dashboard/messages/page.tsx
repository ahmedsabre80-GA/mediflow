'use client';
import { useState } from 'react';
import { Send, Mail, MessageCircle, Bell, Mic, Users, Building2, Stethoscope, Package, FlaskConical, ChevronDown, ExternalLink } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const RECIPIENT_GROUPS = [
  { key: 'all', label: 'الجميع', icon: Users, color: 'bg-gray-100 text-gray-700', count: 150 },
  { key: 'doctors', label: 'الأطباء', icon: Stethoscope, color: 'bg-teal-100 text-teal-700', count: 5 },
  { key: 'pharmacies', label: 'الصيدليات', icon: Building2, color: 'bg-sky-100 text-sky-700', count: 5 },
  { key: 'pharmacists', label: 'الصيادلة', icon: FlaskConical, color: 'bg-indigo-100 text-indigo-700', count: 4 },
  { key: 'warehouses', label: 'المذاخر', icon: Package, color: 'bg-amber-100 text-amber-700', count: 5 },
];

const CHANNELS = [
  { key: 'inapp', label: 'داخل المنصة', icon: Bell, color: 'text-sky-600', desc: 'إشعار فوري في التطبيق', free: true },
  { key: 'email', label: 'البريد الإلكتروني', icon: Mail, color: 'text-blue-600', desc: 'رسالة على البريد', free: true },
  { key: 'whatsapp', label: 'واتساب', icon: MessageCircle, color: 'text-green-600', desc: 'عبر واتساب ويب', free: true },
  { key: 'voice', label: 'رسالة صوتية', icon: Mic, color: 'text-purple-600', desc: 'تسجيل صوتي', free: false },
];

const SENT_MESSAGES = [
  { id: 1, title: 'تحديث سياسة التسعير', recipients: 'الصيدليات', channels: ['inapp', 'email'], sentAt: '2026-06-26 10:00', status: 'sent', count: 5 },
  { id: 2, title: 'تذكير تجديد الرخصة', recipients: 'الجميع', channels: ['email'], sentAt: '2026-06-25 09:00', status: 'sent', count: 150 },
  { id: 3, title: 'خدمة جديدة متاحة', recipients: 'الأطباء', channels: ['inapp'], sentAt: '2026-06-24 14:00', status: 'sent', count: 5 },
];

export default function MessagesPage() {
  const [selectedGroups, setSelectedGroups] = useState<string[]>(['all']);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['inapp']);
  const [messageType, setMessageType] = useState<'text' | 'voice'>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState<'compose' | 'sent'>('compose');
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const toggleGroup = (key: string) => {
    if (key === 'all') {
      setSelectedGroups(['all']);
    } else {
      setSelectedGroups(prev => {
        const withoutAll = prev.filter(g => g !== 'all');
        return withoutAll.includes(key) ? withoutAll.filter(g => g !== key) : [...withoutAll, key];
      });
    }
  };

  const toggleChannel = (key: string) => {
    if (key === 'whatsapp') {
      setShowWhatsApp(true);
      return;
    }
    setSelectedChannels(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const getTotalRecipients = () => {
    if (selectedGroups.includes('all')) return 150;
    return selectedGroups.reduce((sum, g) => {
      const group = RECIPIENT_GROUPS.find(r => r.key === g);
      return sum + (group?.count || 0);
    }, 0);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    if (selectedChannels.length === 0) { showToast('⚠️ يرجى اختيار قناة إرسال واحدة على الأقل'); return; }

    setSending(true);
    await new Promise(r => setTimeout(r, 1500));

    const recipientLabels = selectedGroups.includes('all') ? 'الجميع' : selectedGroups.map(g => RECIPIENT_GROUPS.find(r => r.key === g)?.label).join('، ');
    const channelLabels = selectedChannels.map(c => CHANNELS.find(ch => ch.key === c)?.label).join('، ');

    logAction('send_message', 'إرسال رسالة جماعية', 'رسالة', `${title} — إلى: ${recipientLabels}`, undefined, '/dashboard/messages');

    setSending(false);
    showToast(`✅ تم الإرسال إلى ${getTotalRecipients()} مستخدم عبر: ${channelLabels}`);
    setTitle('');
    setBody('');
    setTab('sent');
  };

  const whatsappText = encodeURIComponent(`${title}\n\n${body}`);

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      {/* WhatsApp Modal */}
      {showWhatsApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <h2 className="text-lg font-bold text-gray-900 mb-3">إرسال عبر واتساب</h2>
            <p className="text-sm text-gray-600 mb-4">
              لا يمكن ربط واتساب مباشرة بالبرنامج مجاناً. سيتم فتح واتساب ويب حيث يمكنك إرسال الرسالة يدوياً.
            </p>
            <div className="bg-green-50 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-green-800 mb-2">نص الرسالة:</p>
              <p className="text-sm text-green-700">{title || 'اكتب عنوان الرسالة أولاً'}</p>
              {body && <p className="text-sm text-green-600 mt-1">{body}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowWhatsApp(false)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                إلغاء
              </button>
              <a href={`https://web.whatsapp.com/send?text=${whatsappText}`} target="_blank" rel="noopener noreferrer"
                onClick={() => { setShowWhatsApp(false); setSelectedChannels(prev => [...prev, 'whatsapp']); }}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                <ExternalLink className="w-4 h-4" />
                فتح واتساب ويب
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مركز الرسائل</h1>
          <p className="text-sm text-gray-500 mt-1">أرسل رسائل لمجموعات المستخدمين عبر قنوات متعددة</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[{k:'compose',l:'إنشاء رسالة'},{k:'sent',l:`الرسائل المرسلة (${SENT_MESSAGES.length})`}].map(t => (
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
                  const selected = selectedGroups.includes(group.key);
                  return (
                    <button key={group.key} onClick={() => toggleGroup(group.key)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selected ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${group.color}`}>{group.count}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800">{group.label}</span>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}>
                        {selected && <span className="text-white text-xs">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 bg-sky-50 rounded-xl px-4 py-2 text-sm text-sky-700 font-medium text-center">
                إجمالي المستلمين: {getTotalRecipients()} مستخدم
              </div>
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
                      <Icon className={`w-5 h-5 shrink-0 ${channel.color}`} />
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
            </div>
          </div>

          {/* Right: Message */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">محتوى الرسالة</h2>

              {/* Message Type */}
              <div className="flex gap-3 mb-4">
                {[{k:'text',l:'📝 رسالة نصية'},{k:'voice',l:'🎤 رسالة صوتية'}].map(t => (
                  <button key={t.k} onClick={() => setMessageType(t.k as any)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${messageType === t.k ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {t.l}
                  </button>
                ))}
              </div>

              {messageType === 'text' ? (
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
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                  <Mic className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-3">اضغط لبدء التسجيل الصوتي</p>
                  <button className="bg-red-500 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-red-600">
                    🎤 بدء التسجيل
                  </button>
                  <p className="text-xs text-amber-600 mt-3">⚠️ تتطلب هذه الميزة اشتراكاً مدفوعاً</p>
                </div>
              )}
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
                    <span>إلى: {selectedGroups.includes('all') ? 'الجميع' : selectedGroups.map(g => RECIPIENT_GROUPS.find(r => r.key === g)?.label).join('، ')}</span>
                  </div>
                  {title && <p className="font-bold text-gray-900">{title}</p>}
                  {body && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
                </div>
              </div>
            )}

            {/* Send Button */}
            <button onClick={handleSend} disabled={sending || !title || !body}
              className="w-full flex items-center justify-center gap-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-colors shadow-lg">
              {sending ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  إرسال إلى {getTotalRecipients()} مستخدم
                  {selectedChannels.length > 0 && (
                    <span className="text-sky-200 text-sm font-normal">
                      عبر {selectedChannels.length} قناة
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Sent Messages */}
      {tab === 'sent' && (
        <div className="space-y-4">
          {SENT_MESSAGES.map(msg => (
            <div key={msg.id} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-1 rounded-full">✅ تم الإرسال</span>
                  <span className="text-xs text-gray-400">{msg.sentAt}</span>
                </div>
                <h3 className="font-bold text-gray-900">{msg.title}</h3>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1"><Users className="w-4 h-4" />{msg.recipients}</span>
                <span className="flex items-center gap-1">
                  {msg.channels.map(c => {
                    const ch = CHANNELS.find(x => x.key === c);
                    const Icon = ch?.icon || Bell;
                    return <Icon key={c} className="w-4 h-4" />;
                  })}
                  {msg.channels.map(c => CHANNELS.find(x => x.key === c)?.label).join('، ')}
                </span>
                <span className="font-medium text-sky-600">{msg.count} مستخدم</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
