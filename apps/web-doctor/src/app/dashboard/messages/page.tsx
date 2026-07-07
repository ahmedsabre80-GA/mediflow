'use client';
import { useState, useEffect } from 'react';
import { Send, Users, UserCheck, CheckCircle, RefreshCw, MessageCircle, Bell } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

function drH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('doctor-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

interface Employee { id: string; name: string; role: string; status: string; }
interface SentMsg  { id: string; recipient_id: string; sender_name: string; message: string; created_at: string; is_read: boolean; portal_type?: string; }

const ROLE_LABELS: Record<string, string> = {
  receptionist: 'موظف استقبال', nurse: 'ممرض/ة', assistant: 'مساعد طبي',
  secretary: 'سكرتير', viewer: 'مشاهد',
};

export default function DoctorMessagesPage() {
  const [employees,    setEmployees]    = useState<Employee[]>([]);
  const [selectedEmp,  setSelectedEmp]  = useState<Employee | null>(null);
  const [title,        setTitle]        = useState('');
  const [body,         setBody]         = useState('');
  const [sending,      setSending]      = useState(false);
  const [toast,        setToast]        = useState('');
  const [tab,          setTab]          = useState<'compose' | 'sent'>('compose');
  const [sentMessages, setSentMessages] = useState<SentMsg[]>([]);
  const [sentLoading,  setSentLoading]  = useState(false);

  const doctorId   = typeof window !== 'undefined' ? localStorage.getItem('doctor-clinic-id') || '' : '';
  const token      = typeof window !== 'undefined' ? localStorage.getItem('doctor-token') || '' : '';
  const senderName = typeof window !== 'undefined' ? (localStorage.getItem('doctor-name') || 'الطبيب') : 'الطبيب';

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  useEffect(() => {
    if (!doctorId) return;
    fetch(`${PHARMACY_API}/${doctorId}/staff`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setEmployees((d.data || []).filter((e: Employee) => e.status === 'active')))
      .catch(() => {});
  }, [doctorId]);

  const loadSent = () => {
    setSentLoading(true);
    fetch(`${PHARMACY_API}/portal-notifications/admin-log`)
      .then(r => r.json())
      .then(d => {
        const all: SentMsg[] = d.data || [];
        setSentMessages(all.filter(m => m.sender_name === senderName && m.portal_type === 'doctor-internal'));
      })
      .catch(() => {})
      .finally(() => setSentLoading(false));
  };

  useEffect(() => { if (tab === 'sent') loadSent(); }, [tab]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    setSending(true);
    try {
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST',
        headers: drH(),
        body: JSON.stringify({
          portalType: 'doctor-internal',
          recipientId: selectedEmp ? selectedEmp.id : 'broadcast',
          senderName,
          message: `${title}\n\n${body}`,
        }),
      });
      showToast(`✅ تم الإرسال إلى ${selectedEmp ? selectedEmp.name : 'جميع الموظفين'}`);
      setTitle(''); setBody(''); setTab('sent');
    } catch {
      showToast('❌ فشل الإرسال، يرجى المحاولة مجدداً');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">رسائل الموظفين</h1>
        <p className="text-sm text-gray-500 mt-1">أرسل إشعارات لموظفي عيادتك — خاصة ولا تظهر للإدارة</p>
      </div>

      <div className="flex gap-2 border-b">
        {[{ k: 'compose', l: 'إنشاء رسالة' }, { k: 'sent', l: 'الرسائل المرسلة' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-500" /> المستلم
            </h2>
            <div className="space-y-2">
              <button onClick={() => setSelectedEmp(null)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${!selectedEmp ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <Users className={`w-4 h-4 shrink-0 ${!selectedEmp ? 'text-teal-600' : 'text-gray-400'}`} />
                <span className="flex-1 text-sm font-medium text-gray-800">جميع الموظفين</span>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${!selectedEmp ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`}>
                  {!selectedEmp && <span className="w-2 h-2 bg-white rounded-full block" />}
                </div>
              </button>
              {employees.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">لا يوجد موظفون مضافون بعد</p>
              ) : employees.map(emp => (
                <button key={emp.id} onClick={() => setSelectedEmp(emp)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selectedEmp?.id === emp.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-teal-700 font-bold text-xs">{emp.name[0]}</span>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                    <p className="text-xs text-gray-400">{ROLE_LABELS[emp.role] || emp.role}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedEmp?.id === emp.id ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`}>
                    {selectedEmp?.id === emp.id && <span className="w-2 h-2 bg-white rounded-full block" />}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 p-3 rounded-xl bg-gray-50 text-xs text-gray-500">
              🔒 هذه الرسائل خاصة بموظفي العيادة فقط ولا تظهر لإدارة المنصة
            </div>
          </div>

          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">محتوى الرسالة</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">عنوان الرسالة *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="مثال: تذكير بجدول المناوبة"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">نص الرسالة *</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
                    placeholder="اكتب رسالتك هنا..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                </div>
              </div>
            </div>

            {(title || body) && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">معاينة</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Bell className="w-4 h-4" />
                    <span>من: {senderName}</span>
                    <span>•</span>
                    <span>إلى: {selectedEmp ? selectedEmp.name : 'جميع الموظفين'}</span>
                  </div>
                  {title && <p className="font-bold text-gray-900">{title}</p>}
                  {body  && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
                </div>
              </div>
            )}

            <button onClick={handleSend} disabled={sending || !title || !body}
              className="w-full flex items-center justify-center gap-3 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-colors shadow-lg">
              {sending
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />جاري الإرسال...</>
                : <><Send className="w-5 h-5" />إرسال إلى {selectedEmp ? selectedEmp.name : 'جميع الموظفين'}</>}
            </button>
          </div>
        </div>
      )}

      {tab === 'sent' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{sentMessages.length} رسالة</p>
            <button onClick={loadSent} disabled={sentLoading}
              className="flex items-center gap-2 text-sm text-teal-600 disabled:opacity-50">
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
            const rest      = msg.message?.split('\n').slice(2).join('\n') || '';
            return (
              <div key={msg.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-1 rounded-full">تم الإرسال</span>
                    {msg.recipient_id === 'broadcast'
                      ? <span className="text-xs bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full">جميع الموظفين</span>
                      : <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">موظف محدد</span>}
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
