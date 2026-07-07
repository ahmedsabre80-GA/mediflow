'use client';
import { useState, useEffect, useRef } from 'react';
import { Send, Bell, Building2, Users, Search, X, CheckCircle, RefreshCw, MessageCircle } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

function warehouseH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('warehouse-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

type Mode = 'broadcast' | 'specific';

interface Pharmacy { id: string; name: string; name_ar: string; phone: string; city: string; }
interface SentMsg  { id: string; portal_type: string; recipient_id: string; sender_name: string; message: string; created_at: string; is_read: boolean; }

export default function WarehouseMessagesPage() {
  const [mode,    setMode]    = useState<Mode>('broadcast');
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [toast,   setToast]   = useState('');
  const [tab,     setTab]     = useState<'compose' | 'sent'>('compose');

  // Multi-select specific pharmacies
  const [pharmacies,    setPharmacies]    = useState<Pharmacy[]>([]);
  const [selectedPharm, setSelectedPharm] = useState<Pharmacy[]>([]);
  const [userSearch,    setUserSearch]    = useState('');
  const [showDropdown,  setShowDropdown]  = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Sent messages
  const [sentMessages, setSentMessages] = useState<SentMsg[]>([]);
  const [sentLoading,  setSentLoading]  = useState(false);

  const warehouseName = typeof window !== 'undefined'
    ? (localStorage.getItem('warehouse-name') || 'مستودع')
    : 'مستودع';

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

  const filteredPharm = pharmacies.filter(p => {
    const q = userSearch.toLowerCase();
    return (p.name_ar || p.name || '').toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q);
  }).slice(0, 10);

  const togglePharm = (p: Pharmacy) => {
    setSelectedPharm(prev =>
      prev.find(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, p]
    );
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    if (mode === 'specific' && selectedPharm.length === 0) { showToast('⚠️ يرجى اختيار صيدلية واحدة على الأقل'); return; }

    setSending(true);
    const fullMessage = `${title}\n\n${body}`;

    try {
      if (mode === 'specific') {
        await Promise.all(selectedPharm.map(p =>
          fetch(`${PHARMACY_API}/portal-notifications`, {
            method: 'POST',
            headers: warehouseH(),
            body: JSON.stringify({ portalType: 'pharmacy', recipientId: p.id, senderName: warehouseName, message: fullMessage }),
          })
        ));
        showToast(`✅ تم الإرسال إلى ${selectedPharm.length} صيدلية بنجاح`);
      } else {
        await fetch(`${PHARMACY_API}/portal-notifications`, {
          method: 'POST',
          headers: warehouseH(),
          body: JSON.stringify({ portalTypes: ['pharmacy'], recipientId: 'broadcast', senderName: warehouseName, message: fullMessage }),
        });
        showToast('✅ تم الإرسال إلى جميع الصيدليات بنجاح');
      }

      setTitle(''); setBody(''); setSelectedPharm([]); setUserSearch('');
      setTab('sent');
    } catch {
      showToast('❌ فشل الإرسال، يرجى المحاولة مجدداً');
    } finally {
      setSending(false);
    }
  };

  const canSend = title && body && (mode === 'broadcast' || selectedPharm.length > 0);

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">الرسائل</h1>
        <p className="text-sm text-gray-500 mt-1">أرسل إشعارات للصيدليات</p>
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
          {/* Left: Recipients */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" /> المستلمون
              </h2>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={() => setMode('broadcast')}
                  className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${mode === 'broadcast' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <Users className="w-4 h-4 inline ml-1" />
                  الكل
                </button>
                <button onClick={() => setMode('specific')}
                  className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${mode === 'specific' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <Search className="w-4 h-4 inline ml-1" />
                  تحديد
                </button>
              </div>

              {/* Broadcast info */}
              {mode === 'broadcast' && (
                <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-amber-500 bg-amber-50">
                  <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">جميع الصيدليات</p>
                    <p className="text-xs text-amber-600">{pharmacies.length} صيدلية نشطة</p>
                  </div>
                </div>
              )}

              {/* Multi-select specific */}
              {mode === 'specific' && (
                <div className="space-y-3" ref={searchRef}>
                  <div className="relative">
                    <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                    <input value={userSearch}
                      onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="ابحث عن صيدلية..."
                      className="w-full pr-9 pl-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    {userSearch && (
                      <button onClick={() => { setUserSearch(''); setShowDropdown(false); }}
                        className="absolute left-3 top-3 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown */}
                  {showDropdown && (userSearch || filteredPharm.length > 0) && (
                    <div className="absolute z-20 mt-1 bg-white rounded-xl shadow-lg border max-h-56 overflow-y-auto w-64">
                      {filteredPharm.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">لا توجد نتائج</p>
                      ) : filteredPharm.map(p => {
                        const isSel = !!selectedPharm.find(x => x.id === p.id);
                        return (
                          <button key={p.id} onClick={() => togglePharm(p)}
                            className={`w-full text-right px-4 py-2.5 border-b last:border-0 transition-colors flex items-center gap-3 ${isSel ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isSel ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                              {isSel && <span className="text-white text-xs">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{p.name_ar || p.name}</p>
                              <p className="text-xs text-gray-500">{p.city} · {p.phone}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected chips */}
                  {selectedPharm.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">المحددة ({selectedPharm.length})</span>
                        <button onClick={() => setSelectedPharm([])} className="text-xs text-red-500 hover:text-red-700">إلغاء الكل</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {selectedPharm.map(p => (
                          <div key={p.id} className="flex items-center gap-1.5 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg text-xs font-medium">
                            <span className="truncate max-w-24">{p.name_ar || p.name}</span>
                            <button onClick={() => togglePharm(p)} className="hover:opacity-70 shrink-0">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedPharm.length === 0 && !userSearch && (
                    <p className="text-xs text-gray-400 text-center py-2">ابحث واختر صيدلية أو أكثر</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Message composer */}
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
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    <Bell className="w-4 h-4" />
                    <span>من: {warehouseName}</span>
                    <span>•</span>
                    <span>إلى: {mode === 'broadcast'
                      ? 'جميع الصيدليات'
                      : selectedPharm.length === 0 ? 'لم يُحدد بعد'
                      : selectedPharm.length === 1 ? (selectedPharm[0].name_ar || selectedPharm[0].name)
                      : `${selectedPharm.length} صيدليات`}</span>
                  </div>
                  {title && <p className="font-bold text-gray-900">{title}</p>}
                  {body  && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
                </div>
              </div>
            )}

            <button onClick={handleSend} disabled={sending || !canSend}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-1 rounded-full">تم الإرسال</span>
                    {msg.recipient_id === 'broadcast' && <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">بث عام</span>}
                    {msg.is_read && <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">مقروءة</span>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{new Date(msg.created_at).toLocaleString('ar-IQ')}</span>
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
