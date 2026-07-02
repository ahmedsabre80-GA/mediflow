'use client';
import { useState, useEffect, useRef } from 'react';
import { Send, Bell, Building2, Users, Search, X, CheckCircle, RefreshCw, MessageCircle } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

interface Pharmacy { id: string; name: string; name_ar: string; phone: string; city: string; }
interface SentMsg   { id: string; portal_type: string; recipient_id: string; sender_name: string; message: string; created_at: string; is_read: boolean; }

const RECIPIENT_GROUPS = [
  { key: 'all_pharmacies', label: 'جميع الصيدليات',   icon: Building2, portalTypes: ['pharmacy'], recipientId: 'broadcast', adminVisible: true },
  { key: 'specific',       label: 'صيدلية محددة',     icon: Search,    portalTypes: ['pharmacy'], recipientId: '',          adminVisible: true },
  { key: 'employees',      label: 'موظفو المستودع',   icon: Users,     portalTypes: ['warehouse-internal'], recipientId: 'broadcast', adminVisible: false },
];

export default function WarehouseMessagesPage() {
  const [selectedGroup, setSelectedGroup]   = useState('all_pharmacies');
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [toast,   setToast]   = useState('');
  const [tab,     setTab]     = useState<'compose' | 'sent'>('compose');

  // Specific pharmacy search
  const [pharmacies,   setPharmacies]   = useState<Pharmacy[]>([]);
  const [userSearch,   setUserSearch]   = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPh,   setSelectedPh]   = useState<Pharmacy | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Sent messages
  const [sentMessages, setSentMessages] = useState<SentMsg[]>([]);
  const [sentLoading,  setSentLoading]  = useState(false);

  const warehouseName = typeof window !== 'undefined'
    ? (localStorage.getItem('warehouse-name') || 'مستودع ميديفلو')
    : 'مستودع ميديفلو';

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  useEffect(() => {
    fetch(`${PHARMACY_API}/admin/all`)
      .then(r => r.json())
      .then(d => setPharmacies((d.data || []).filter((p: any) => p.status === 'active')))
      .catch(() => {});
  }, []);

  const loadSent = () => {
    setSentLoading(true);
    fetch(`${PHARMACY_API}/portal-notifications/admin-log`)
      .then(r => r.json())
      .then(d => {
        const all: SentMsg[] = d.data || [];
        // Warehouse only sees messages it sent (sender_name matches or portal_type is warehouse-internal)
        setSentMessages(all.filter((m: SentMsg) =>
          m.sender_name === warehouseName || m.portal_type === 'warehouse-internal'
        ));
      })
      .catch(() => {})
      .finally(() => setSentLoading(false));
  };

  useEffect(() => { if (tab === 'sent') loadSent(); }, [tab]);

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

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    if (selectedGroup === 'specific' && !selectedPh) { showToast('⚠️ يرجى اختيار الصيدلية'); return; }

    setSending(true);
    const fullMessage = `${title}\n\n${body}`;
    const group = RECIPIENT_GROUPS.find(g => g.key === selectedGroup)!;

    try {
      if (selectedGroup === 'specific' && selectedPh) {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalType: 'pharmacy',
            recipientId: selectedPh.id,
            senderName: warehouseName,
            message: fullMessage,
          }),
        });
      } else {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalTypes: group.portalTypes,
            recipientId: group.recipientId,
            senderName: warehouseName,
            message: fullMessage,
          }),
        });
      }

      const label = selectedGroup === 'specific'
        ? (selectedPh?.name_ar || selectedPh?.name)
        : group.label;
      showToast(`✅ تم الإرسال إلى ${label} بنجاح`);
      setTitle(''); setBody(''); setSelectedPh(null); setUserSearch('');
      setTab('sent');
    } catch {
      showToast('❌ فشل الإرسال، يرجى المحاولة مجدداً');
    } finally {
      setSending(false);
    }
  };

  const portalLabel = (t: string) => ({
    pharmacy: 'صيدلية', 'warehouse-internal': 'موظفو المستودع',
  }[t] || t);

  const currentGroup = RECIPIENT_GROUPS.find(g => g.key === selectedGroup);

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">الرسائل</h1>
        <p className="text-sm text-gray-500 mt-1">أرسل إشعارات للصيدليات أو موظفي المستودع</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[{ k: 'compose', l: 'إنشاء رسالة' }, { k: 'sent', l: 'الرسائل المرسلة' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recipients */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" /> المستلمون
              </h2>
              <div className="space-y-2">
                {RECIPIENT_GROUPS.map(group => {
                  const Icon = group.icon;
                  const selected = selectedGroup === group.key;
                  return (
                    <button key={group.key} onClick={() => { setSelectedGroup(group.key); setSelectedPh(null); setUserSearch(''); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selected ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-amber-600' : 'text-gray-400'}`} />
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium text-gray-800">{group.label}</p>
                        {group.adminVisible && (
                          <p className="text-xs text-gray-400">مرئي للإدارة</p>
                        )}
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                        {selected && <span className="w-2 h-2 bg-white rounded-full block" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Specific pharmacy search */}
              {selectedGroup === 'specific' && (
                <div className="mt-3 relative" ref={searchRef}>
                  {selectedPh ? (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border-2 border-amber-500">
                      <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-800 truncate">{selectedPh.name_ar || selectedPh.name}</p>
                        <p className="text-xs text-amber-600">{selectedPh.city} · {selectedPh.phone}</p>
                      </div>
                      <button onClick={() => { setSelectedPh(null); setUserSearch(''); }}
                        className="text-amber-400 hover:text-amber-600"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                        <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                          onFocus={() => setShowDropdown(true)}
                          placeholder="ابحث عن صيدلية..."
                          className="w-full pr-9 pl-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                      </div>
                      {showDropdown && userSearch && (
                        <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-xl shadow-lg border z-10 max-h-48 overflow-y-auto">
                          {filteredPharmacies.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-3">لا توجد نتائج</p>
                          ) : filteredPharmacies.map(p => (
                            <button key={p.id} onClick={() => { setSelectedPh(p); setUserSearch(''); setShowDropdown(false); }}
                              className="w-full text-right px-4 py-2.5 hover:bg-amber-50 border-b last:border-0">
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

              {/* Visibility note */}
              {currentGroup && (
                <div className={`mt-3 p-3 rounded-xl text-xs ${currentGroup.adminVisible ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'}`}>
                  {currentGroup.adminVisible
                    ? '📋 هذه الرسالة ستظهر لإدارة المنصة في سجل الرسائل'
                    : '🔒 هذه الرسالة خاصة بموظفي المستودع فقط'}
                </div>
              )}
            </div>
          </div>

          {/* Message composer */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">محتوى الرسالة</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">عنوان الرسالة *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="مثال: إشعار بتوفر منتج جديد"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">نص الرسالة *</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
                    placeholder="اكتب رسالتك هنا..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
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
                    <span>من: {warehouseName}</span>
                    <span>•</span>
                    <span>إلى: {selectedGroup === 'specific' ? (selectedPh?.name_ar || selectedPh?.name || 'لم يُحدد') : currentGroup?.label}</span>
                  </div>
                  {title && <p className="font-bold text-gray-900">{title}</p>}
                  {body && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
                </div>
              </div>
            )}

            <button onClick={handleSend}
              disabled={sending || !title || !body || (selectedGroup === 'specific' && !selectedPh)}
              className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-colors shadow-lg">
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
            <button onClick={loadSent} disabled={sentLoading}
              className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 disabled:opacity-50">
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
                    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{portalLabel(msg.portal_type)}</span>
                    {msg.recipient_id === 'broadcast' && <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">بث عام</span>}
                    {msg.is_read && <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">مقروءة</span>}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleString('ar-IQ')}</span>
                </div>
                <p className="font-bold text-gray-900 text-sm">{firstLine}</p>
                {rest && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{rest}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
