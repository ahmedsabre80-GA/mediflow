'use client';
import { useState, useEffect, useRef } from 'react';
import { Send, Mail, MessageCircle, Bell, Mic, Users, Building2, Stethoscope, Package, FlaskConical, ExternalLink, Search, X, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API     = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const ADMIN_SENDER = 'فريق ميديفلو';

function adminH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('admin-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const BROADCAST_GROUPS = [
  { key: 'all',         label: 'الجميع',      icon: Users,        portalTypes: ['pharmacy', 'doctor', 'warehouse', 'pharmacist', 'patient'] },
  { key: 'patients',    label: 'المرضى',      icon: Users,        portalTypes: ['patient'] },
  { key: 'doctors',     label: 'الأطباء',     icon: Stethoscope,  portalTypes: ['doctor'] },
  { key: 'pharmacies',  label: 'الصيدليات',   icon: Building2,    portalTypes: ['pharmacy'] },
  { key: 'pharmacists', label: 'الصيادلة',    icon: FlaskConical, portalTypes: ['pharmacist'] },
  { key: 'warehouses',  label: 'المذاخر',     icon: Package,      portalTypes: ['warehouse'] },
];

const CHANNELS = [
  { key: 'inapp',    label: 'داخل المنصة',       icon: Bell,          desc: 'إشعار فوري في التطبيق', free: true },
  { key: 'email',    label: 'البريد الإلكتروني', icon: Mail,          desc: 'رسالة على البريد',       free: true },
  { key: 'whatsapp', label: 'واتساب',            icon: MessageCircle, desc: 'عبر واتساب ويب',        free: true },
  { key: 'voice',    label: 'رسالة صوتية',       icon: Mic,           desc: 'تسجيل صوتي',            free: false },
];

type Mode = 'broadcast' | 'specific';
type Tab  = 'compose' | 'sent' | 'received' | 'portals';

interface User    { id: string; owner_id?: string; name: string; type: string; sub?: string; }
interface SentMsg { id: string; portal_type: string; recipient_id: string; sender_name: string; message: string; created_at: string; is_read: boolean; }

const portalTypeLabel = (t: string) => ({ pharmacy: 'صيدلية', doctor: 'طبيب', warehouse: 'مخزن', pharmacist: 'صيدلاني', patient: 'مريض' }[t] || t);

function MsgCard({ msg, onDelete }: { msg: SentMsg; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const firstLine = msg.message?.split('\n')[0] || '';
  const rest      = msg.message?.split('\n').slice(2).join('\n') || '';

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`${PHARMACY_API}/portal-notifications/${msg.id}`, { method: 'DELETE' });
    onDelete(msg.id);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-1 rounded-full">تم الإرسال</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{portalTypeLabel(msg.portal_type)}</span>
          {msg.recipient_id === 'broadcast' && <span className="text-xs bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full">بث عام</span>}
          {msg.is_read && <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">مقروءة</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleString('ar-IQ')}</span>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} title="حذف" className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => setConfirming(false)} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">إلغاء</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-60">
                {deleting ? '...' : 'حذف'}
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="font-bold text-gray-900 text-sm">{firstLine}</p>
      {rest && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{rest}</p>}
      <p className="text-xs text-gray-400 mt-2">من: {msg.sender_name}</p>
    </div>
  );
}

export default function MessagesPage() {
  const [mode,             setMode]             = useState<Mode>('broadcast');
  const [broadcastGroup,   setBroadcastGroup]   = useState('all');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['inapp']);
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [toast,   setToast]   = useState('');
  const [tab,     setTab]     = useState<Tab>('compose');
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  // Multi-select specific users
  const [allUsers,      setAllUsers]      = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [userSearch,    setUserSearch]    = useState('');
  const [showDropdown,  setShowDropdown]  = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Messages
  const [sentMessages,     setSentMessages]     = useState<SentMsg[]>([]);
  const [receivedMessages, setReceivedMessages] = useState<SentMsg[]>([]);
  const [sentLoading,      setSentLoading]      = useState(false);
  const [receivedLoading,  setReceivedLoading]  = useState(false);
  const [deletingAll,      setDeletingAll]      = useState(false);
  const [portalNotifs,     setPortalNotifs]     = useState<SentMsg[]>([]);
  const [portalFilter,     setPortalFilter]     = useState<string>('pharmacy');
  const [portalLoading,    setPortalLoading]    = useState(false);
  const [deletingPortal,   setDeletingPortal]   = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  useEffect(() => {
    Promise.all([
      fetch(`${PHARMACY_API}/admin/all`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${AUTH_API}/auth/admin/users`, { headers: adminH() }).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([pharmData, authData]) => {
      const pharmacies: User[] = (pharmData.data || []).map((p: any) => ({
        id: p.owner_id || p.id,
        owner_id: p.owner_id,
        name: p.name_ar || p.name || p.phone,
        type: 'pharmacy',
        sub: `صيدلية · ${p.city || ''}`,
      }));
      const authUsers: User[] = (authData.data || [])
        .filter((u: any) => ['doctor', 'warehouse_owner', 'patient'].includes(u.role))
        .map((u: any) => ({
          id: u.id,
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          type: u.role === 'doctor' ? 'doctor' : u.role === 'patient' ? 'patient' : 'warehouse',
          sub: u.role === 'doctor' ? `طبيب · ${u.email}` : u.role === 'patient' ? `مريض · ${u.email}` : `مستودع · ${u.email}`,
        }));
      setAllUsers([...pharmacies, ...authUsers]);
    });
  }, []);

  const loadSentMessages = () => {
    setSentLoading(true);
    fetch(`${PHARMACY_API}/portal-notifications/admin-log`)
      .then(r => r.json())
      .then(d => {
        const all: SentMsg[] = d.data || [];
        // "sent" tab: messages sent BY the admin
        setSentMessages(all.filter(m => m.sender_name === ADMIN_SENDER));
      })
      .catch(() => {})
      .finally(() => setSentLoading(false));
  };

  const loadReceivedMessages = () => {
    setReceivedLoading(true);
    fetch(`${PHARMACY_API}/portal-notifications/admin-log`)
      .then(r => r.json())
      .then(d => {
        const all: SentMsg[] = d.data || [];
        // "received" tab: messages FROM the admin that are sitting in other portals (general only = sent by admin)
        setReceivedMessages(all.filter(m => m.sender_name === ADMIN_SENDER));
      })
      .catch(() => {})
      .finally(() => setReceivedLoading(false));
  };

  const loadPortalNotifs = (type = portalFilter) => {
    setPortalLoading(true);
    fetch(`${PHARMACY_API}/portal-notifications/admin-log`)
      .then(r => r.json())
      .then(d => setPortalNotifs((d.data || []).filter((m: SentMsg) => m.portal_type === type)))
      .catch(() => {})
      .finally(() => setPortalLoading(false));
  };

  const handleDeletePortalAll = async () => {
    if (!confirm(`حذف جميع إشعارات بوابة "${portalTypeLabel(portalFilter)}"؟`)) return;
    setDeletingPortal(true);
    await Promise.all(
      portalNotifs.map(m => fetch(`${PHARMACY_API}/portal-notifications/${m.id}`, { method: 'DELETE' }).catch(() => {}))
    );
    setPortalNotifs([]);
    setDeletingPortal(false);
  };

  useEffect(() => {
    if (tab === 'sent')     loadSentMessages();
    if (tab === 'received') loadReceivedMessages();
    if (tab === 'portals')  loadPortalNotifs();
  }, [tab]);

  useEffect(() => {
    if (tab === 'portals') loadPortalNotifs(portalFilter);
  }, [portalFilter]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredUsers = allUsers.filter(u => {
    const q = userSearch.toLowerCase();
    return u.name.toLowerCase().includes(q) || (u.sub || '').toLowerCase().includes(q);
  }).slice(0, 10);

  const toggleUser = (u: User) =>
    setSelectedUsers(prev => prev.find(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]);

  const toggleChannel = (key: string) => {
    if (key === 'whatsapp') { setShowWhatsApp(true); return; }
    setSelectedChannels(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const typeLabel = (t: string) => ({ pharmacy: 'صيدلية', doctor: 'طبيب', warehouse: 'مستودع' }[t] || t);
  const typeColor = (t: string) => ({ pharmacy: 'bg-sky-100 text-sky-700', doctor: 'bg-teal-100 text-teal-700', warehouse: 'bg-amber-100 text-amber-700' }[t] || 'bg-gray-100 text-gray-700');

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    if (selectedChannels.length === 0) { showToast('⚠️ يرجى اختيار قناة إرسال واحدة على الأقل'); return; }
    if (mode === 'specific' && selectedUsers.length === 0) { showToast('⚠️ يرجى اختيار مستخدم واحد على الأقل'); return; }

    setSending(true);
    const fullMessage = `${title}\n\n${body}`;

    try {
      if (mode === 'specific') {
        await Promise.all(selectedUsers.map(u => {
          const portalType = u.type === 'pharmacy' ? 'pharmacy' : u.type === 'doctor' ? 'doctor' : 'warehouse';
          return fetch(`${PHARMACY_API}/portal-notifications`, {
            method: 'POST',
            headers: adminH(),
            body: JSON.stringify({ portalType, recipientId: u.id, senderName: ADMIN_SENDER, message: fullMessage }),
          });
        }));
        showToast(`✅ تم الإرسال إلى ${selectedUsers.length} مستخدم بنجاح`);
      } else {
        const group = BROADCAST_GROUPS.find(g => g.key === broadcastGroup);
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: adminH(),
          body: JSON.stringify({ portalTypes: group?.portalTypes, recipientId: 'broadcast', senderName: ADMIN_SENDER, message: fullMessage }),
        });
        showToast(`✅ تم الإرسال إلى ${group?.label} بنجاح`);
      }

      logAction('send_message', 'إرسال رسالة', 'رسالة', title, undefined, '/dashboard/messages');
      setTitle(''); setBody(''); setSelectedUsers([]); setUserSearch('');
      setTab('sent');
    } catch {
      showToast('❌ فشل الإرسال، يرجى المحاولة مجدداً');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMsg = (id: string) => {
    setSentMessages(prev     => prev.filter(m => m.id !== id));
    setReceivedMessages(prev => prev.filter(m => m.id !== id));
    showToast('🗑️ تم حذف الرسالة من الطرفين');
  };

  const handleDeleteAll = async () => {
    if (!confirm('هل تريد حذف جميع رسائلك المرسلة من الطرفين؟')) return;
    setDeletingAll(true);
    try {
      await fetch(`${PHARMACY_API}/portal-notifications?sender_name=${encodeURIComponent(ADMIN_SENDER)}`, { method: 'DELETE' });
      setSentMessages([]);
      setReceivedMessages([]);
      showToast('🗑️ تم حذف جميع الرسائل');
    } catch { showToast('❌ فشل الحذف'); }
    finally { setDeletingAll(false); }
  };

  const whatsappText = encodeURIComponent(`${title}\n\n${body}`);
  const canSend = title && body && selectedChannels.length > 0 &&
    (mode === 'broadcast' || selectedUsers.length > 0);

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      {/* WhatsApp Modal */}
      {showWhatsApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <h2 className="text-lg font-bold text-gray-900 mb-3">إرسال عبر واتساب</h2>
            <p className="text-sm text-gray-600 mb-4">لا يمكن ربط واتساب مباشرة. سيتم فتح واتساب ويب لإرسال الرسالة يدوياً.</p>
            <div className="bg-green-50 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-green-800 mb-1">{title || 'اكتب عنوان الرسالة أولاً'}</p>
              {body && <p className="text-sm text-green-600">{body}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowWhatsApp(false)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
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
        <p className="text-sm text-gray-500 mt-1">أرسل رسائل لمجموعات المستخدمين أو اختر أشخاصاً بعينهم</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { k: 'compose',  l: 'إنشاء رسالة' },
          { k: 'sent',     l: 'المرسلة' },
          { k: 'received', l: 'المستلمة من الأطراف الأخرى' },
          { k: 'portals',  l: 'إشعارات البوابات' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as Tab)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── COMPOSE ── */}
      {tab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-500" /> المستلمون
              </h2>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={() => setMode('broadcast')}
                  className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${mode === 'broadcast' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  بث جماعي
                </button>
                <button onClick={() => setMode('specific')}
                  className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${mode === 'specific' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  تحديد أشخاص
                </button>
              </div>

              {mode === 'broadcast' && (
                <div className="space-y-2">
                  {BROADCAST_GROUPS.map(group => {
                    const Icon = group.icon;
                    const selected = broadcastGroup === group.key;
                    return (
                      <button key={group.key} onClick={() => setBroadcastGroup(group.key)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selected ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-sky-600' : 'text-gray-400'}`} />
                        <span className="flex-1 text-sm font-medium text-gray-800 text-right">{group.label}</span>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}>
                          {selected && <span className="w-2 h-2 bg-white rounded-full block" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {mode === 'specific' && (
                <div className="space-y-3" ref={searchRef}>
                  <div className="relative">
                    <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                    <input value={userSearch}
                      onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="ابحث باسم المستخدم أو نوعه..."
                      className="w-full pr-9 pl-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    {userSearch && (
                      <button onClick={() => { setUserSearch(''); setShowDropdown(false); }} className="absolute left-3 top-3 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {showDropdown && (userSearch || filteredUsers.length > 0) && (
                    <div className="absolute z-20 mt-1 bg-white rounded-xl shadow-lg border max-h-56 overflow-y-auto w-72">
                      {filteredUsers.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">لا توجد نتائج</p>
                      ) : filteredUsers.map(u => {
                        const isSel = !!selectedUsers.find(x => x.id === u.id);
                        return (
                          <button key={u.id} onClick={() => toggleUser(u)}
                            className={`w-full text-right px-4 py-2.5 border-b last:border-0 transition-colors flex items-center gap-3 ${isSel ? 'bg-sky-50' : 'hover:bg-gray-50'}`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isSel ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}>
                              {isSel && <span className="text-white text-xs">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                              <p className="text-xs text-gray-500">{u.sub}</p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${typeColor(u.type)}`}>{typeLabel(u.type)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedUsers.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">المحددون ({selectedUsers.length})</span>
                        <button onClick={() => setSelectedUsers([])} className="text-xs text-red-500 hover:text-red-700">إلغاء الكل</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {selectedUsers.map(u => (
                          <div key={u.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${typeColor(u.type)}`}>
                            <span className="truncate max-w-24">{u.name}</span>
                            <button onClick={() => toggleUser(u)} className="hover:opacity-70 shrink-0"><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUsers.length === 0 && !userSearch && (
                    <p className="text-xs text-gray-400 text-center py-2">ابحث واختر مستخدماً أو أكثر</p>
                  )}
                </div>
              )}
            </div>

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
            </div>
          </div>

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

            {(title || body) && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">معاينة الرسالة</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    <Bell className="w-4 h-4" />
                    <span>من: {ADMIN_SENDER}</span>
                    <span>•</span>
                    <span>إلى: {mode === 'specific'
                      ? (selectedUsers.length === 0 ? 'لم يُحدد بعد' : selectedUsers.length === 1 ? selectedUsers[0].name : `${selectedUsers.length} مستخدمين`)
                      : BROADCAST_GROUPS.find(g => g.key === broadcastGroup)?.label}</span>
                  </div>
                  {title && <p className="font-bold text-gray-900">{title}</p>}
                  {body  && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
                </div>
              </div>
            )}

            <button onClick={handleSend} disabled={sending || !canSend}
              className="w-full flex items-center justify-center gap-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-colors shadow-lg">
              {sending
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> جاري الإرسال...</>
                : <><Send className="w-5 h-5" /> إرسال الرسالة</>}
            </button>
          </div>
        </div>
      )}

      {/* ── SENT ── */}
      {tab === 'sent' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-500">{sentMessages.length} رسالة مرسلة</p>
            <div className="flex items-center gap-2">
              {sentMessages.length > 0 && (
                <button onClick={handleDeleteAll} disabled={deletingAll}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" /> حذف الكل
                </button>
              )}
              <button onClick={loadSentMessages} disabled={sentLoading}
                className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${sentLoading ? 'animate-spin' : ''}`} /> تحديث
              </button>
            </div>
          </div>
          {sentLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">جاري التحميل...</div>
          ) : sentMessages.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">لا توجد رسائل مرسلة بعد</p>
            </div>
          ) : sentMessages.map(msg => (
            <MsgCard key={msg.id} msg={msg} onDelete={handleDeleteMsg} />
          ))}
        </div>
      )}

      {/* ── PORTALS: browse & bulk-delete notifications per portal ── */}
      {tab === 'portals' && (
        <div className="space-y-4">
          {/* Portal filter pills */}
          <div className="flex flex-wrap gap-2">
            {(['pharmacy','patient','doctor'] as const).map(pt => (
              <button key={pt} onClick={() => setPortalFilter(pt)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${portalFilter === pt ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-200 text-gray-600 hover:bg-sky-50'}`}>
                {portalTypeLabel(pt)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-500">
              {portalLoading ? 'جاري التحميل...' : `${portalNotifs.length} إشعار في بوابة ${portalTypeLabel(portalFilter)}`}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => loadPortalNotifs()} disabled={portalLoading}
                className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${portalLoading ? 'animate-spin' : ''}`} /> تحديث
              </button>
              {portalNotifs.length > 0 && (
                <button onClick={handleDeletePortalAll} disabled={deletingPortal}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" /> حذف الكل
                </button>
              )}
            </div>
          </div>

          {portalLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">جاري التحميل...</div>
          ) : portalNotifs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">لا توجد إشعارات في هذه البوابة</p>
            </div>
          ) : portalNotifs.map(msg => (
            <MsgCard key={msg.id} msg={msg} onDelete={id => {
              setPortalNotifs(prev => prev.filter(m => m.id !== id));
            }} />
          ))}
        </div>
      )}

      {/* ── RECEIVED (messages admin sent sitting in other portals) ── */}
      {tab === 'received' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm text-gray-700 font-medium">الرسائل العامة التي أرسلتها وتظهر على البوابات الأخرى</p>
              <p className="text-xs text-gray-400 mt-0.5">يمكنك حذف أي رسالة وستُزال من الطرفين فوراً</p>
            </div>
            <div className="flex items-center gap-2">
              {receivedMessages.length > 0 && (
                <button onClick={handleDeleteAll} disabled={deletingAll}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" /> حذف الكل
                </button>
              )}
              <button onClick={loadReceivedMessages} disabled={receivedLoading}
                className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${receivedLoading ? 'animate-spin' : ''}`} /> تحديث
              </button>
            </div>
          </div>
          {receivedLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">جاري التحميل...</div>
          ) : receivedMessages.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">لا توجد رسائل</p>
            </div>
          ) : receivedMessages.map(msg => (
            <MsgCard key={msg.id} msg={msg} onDelete={handleDeleteMsg} />
          ))}
        </div>
      )}
    </div>
  );
}
