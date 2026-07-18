'use client';
import { useState, useEffect } from 'react';
import { Send, Bell, Users, CheckCircle, RefreshCw, MessageCircle, Stethoscope, Search } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API     = 'https://mediflowauth-service-production.up.railway.app/api/v1';

function pharmH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('pharmacy-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

interface StaffMember { id: string; name: string; email: string; role: string; status: string; }
interface Doctor      { id: string; email: string; phone?: string; first_name?: string; last_name?: string; }
interface SentMsg     { id: string; portal_type: string; recipient_id: string; sender_name: string; message: string; created_at: string; is_read: boolean; }

const ROLE_LABELS: Record<string, string> = {
  pharmacist: 'صيدلاني', cashier: 'كاشير', assistant_manager: 'مدير مساعد',
  inventory_clerk: 'موظف مخزون', receptionist: 'موظف استقبال', viewer: 'مشاهد',
};

export default function PharmacyMessagesPage() {
  const [mainTab,      setMainTab]      = useState<'staff' | 'doctor'>('staff');

  // Staff messaging
  const [staff,        setStaff]        = useState<StaffMember[]>([]);
  const [selectedEmp,  setSelectedEmp]  = useState<StaffMember | null>(null);
  const [staffTitle,   setStaffTitle]   = useState('');
  const [staffBody,    setStaffBody]    = useState('');
  const [staffSending, setStaffSending] = useState(false);
  const [staffSent,    setStaffSent]    = useState<SentMsg[]>([]);
  const [staffSentLoading, setStaffSentLoading] = useState(false);
  const [staffSubTab,  setStaffSubTab]  = useState<'compose' | 'sent' | 'inbox'>('compose');

  // Doctor messaging
  const [doctors,      setDoctors]      = useState<Doctor[]>([]);
  const [docSearch,    setDocSearch]    = useState('');
  const [selectedDoc,  setSelectedDoc]  = useState<Doctor | null>(null);
  const [docTitle,     setDocTitle]     = useState('');
  const [docBody,      setDocBody]      = useState('');
  const [docSending,   setDocSending]   = useState(false);
  const [docSent,      setDocSent]      = useState<SentMsg[]>([]);
  const [docInbox,     setDocInbox]     = useState<SentMsg[]>([]);
  const [docSentLoading, setDocSentLoading] = useState(false);
  const [docSubTab,    setDocSubTab]    = useState<'compose' | 'sent' | 'inbox'>('inbox');

  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const pharmacyId = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-id') || '' : '';
  const ownerId    = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-owner-id') || '' : '';
  const token      = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-token') || '' : '';
  const senderName = typeof window !== 'undefined' ? (localStorage.getItem('pharmacy-name') || 'الصيدلية') : 'الصيدلية';

  // Load staff
  useEffect(() => {
    if (!pharmacyId) return;
    fetch(`${PHARMACY_API}/${pharmacyId}/staff`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setStaff((d.data || []).filter((s: StaffMember) => s.status === 'active'))).catch(() => {});
  }, [pharmacyId]);

  // Load doctors
  useEffect(() => {
    if (mainTab !== 'doctor' || doctors.length > 0) return;
    fetch(`${AUTH_API}/auth/users/doctors`)
      .then(r => r.json()).then(d => setDoctors(d.data || [])).catch(() => {});
  }, [mainTab]);

  const loadStaffSent = () => {
    setStaffSentLoading(true);
    fetch(`${PHARMACY_API}/portal-notifications?portalType=pharmacy-internal&recipientId=${pharmacyId}`, { headers: pharmH() })
      .then(r => r.json()).then(d => {
        const all: SentMsg[] = d.data || [];
        setStaffSent(all.filter(m => m.sender_name === senderName && m.portal_type === 'pharmacy-internal'));
      }).catch(() => {}).finally(() => setStaffSentLoading(false));
  };

  const loadDocSent = () => {
    setDocSentLoading(true);
    Promise.all([
      fetch(`${PHARMACY_API}/portal-notifications?portalType=pharmacy-to-doctor&recipientId=${ownerId || pharmacyId}`, { headers: pharmH() })
        .then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${PHARMACY_API}/portal-notifications?portalType=doctor-to-pharmacy&recipientId=${ownerId || pharmacyId}`, { headers: pharmH() })
        .then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([sentRes, inboxRes]) => {
      setDocSent((sentRes.data || []).filter((m: SentMsg) => m.sender_name === `🏥 ${senderName}`));
      setDocInbox(inboxRes.data || []);
    }).finally(() => setDocSentLoading(false));
  };

  useEffect(() => { if (staffSubTab !== 'compose') loadStaffSent(); }, [staffSubTab]);
  useEffect(() => { if (docSubTab !== 'compose') loadDocSent(); }, [docSubTab]);

  const sendStaff = async () => {
    if (!staffTitle.trim() || !staffBody.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    setStaffSending(true);
    try {
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST', headers: pharmH(),
        body: JSON.stringify({ portalType: 'pharmacy-internal', recipientId: selectedEmp?.id || 'broadcast', senderName, message: `${staffTitle}\n\n${staffBody}` }),
      });
      showToast(`✅ تم الإرسال إلى ${selectedEmp ? selectedEmp.name : 'جميع الموظفين'}`);
      setStaffTitle(''); setStaffBody(''); setStaffSubTab('sent');
    } catch { showToast('❌ فشل الإرسال'); } finally { setStaffSending(false); }
  };

  const sendDoc = async () => {
    if (!selectedDoc) { showToast('⚠️ يرجى اختيار طبيب'); return; }
    if (!docTitle.trim() || !docBody.trim()) { showToast('⚠️ يرجى كتابة الموضوع والرسالة'); return; }
    setDocSending(true);
    try {
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST', headers: pharmH(),
        body: JSON.stringify({ portalType: 'doctor-to-pharmacy', recipientId: selectedDoc.id, senderName: `🏥 ${senderName}`, message: `${docTitle}\n\n${docBody}` }),
      });
      showToast(`✅ تم الإرسال`);
      setDocTitle(''); setDocBody(''); setDocSubTab('sent');
    } catch { showToast('❌ فشل الإرسال'); } finally { setDocSending(false); }
  };

  const docName = (d: Doctor) => [d.first_name, d.last_name].filter(Boolean).join(' ') || d.email;
  const filteredDocs = doctors.filter(d => !docSearch || docName(d).includes(docSearch) || d.email?.includes(docSearch));

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      <h1 className="text-2xl font-bold text-gray-900">الرسائل</h1>

      {/* Main tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[{ k: 'staff', l: '👥 موظفو الصيدلية' }, { k: 'doctor', l: '👨‍⚕️ الأطباء' }].map(t => (
          <button key={t.k} onClick={() => setMainTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${mainTab === t.k ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── STAFF MESSAGING ── */}
      {mainTab === 'staff' && (
        <>
          <div className="flex gap-2 border-b border-gray-100">
            {[{ k: 'compose', l: 'إنشاء رسالة' }, { k: 'sent', l: 'المرسلة' }].map(t => (
              <button key={t.k} onClick={() => setStaffSubTab(t.k as any)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${staffSubTab === t.k ? 'border-sky-400 text-sky-600' : 'border-transparent text-gray-400'}`}>
                {t.l}
              </button>
            ))}
          </div>
          {staffSubTab === 'compose' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Users className="w-5 h-5 text-sky-500" /> المستلم</h2>
                <div className="space-y-2">
                  <button onClick={() => setSelectedEmp(null)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${!selectedEmp ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <Users className={`w-4 h-4 shrink-0 ${!selectedEmp ? 'text-sky-600' : 'text-gray-400'}`} />
                    <span className="flex-1 text-sm font-medium text-gray-800">جميع الموظفين</span>
                  </button>
                  {staff.map(emp => (
                    <button key={emp.id} onClick={() => setSelectedEmp(emp)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selectedEmp?.id === emp.id ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-sky-700 font-bold text-xs">{emp.name[0]}</span>
                      </div>
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                        <p className="text-xs text-gray-400">{ROLE_LABELS[emp.role] || emp.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">عنوان الرسالة *</label>
                    <input value={staffTitle} onChange={e => setStaffTitle(e.target.value)} placeholder="مثال: تذكير بموعد الوردية"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">نص الرسالة *</label>
                    <textarea value={staffBody} onChange={e => setStaffBody(e.target.value)} rows={5}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
                  </div>
                </div>
                <button onClick={sendStaff} disabled={staffSending || !staffTitle || !staffBody}
                  className="w-full flex items-center justify-center gap-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors">
                  {staffSending ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />جاري الإرسال...</> : <><Send className="w-5 h-5" />إرسال</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end"><button onClick={loadStaffSent} className="text-sm text-sky-600 flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${staffSentLoading ? 'animate-spin' : ''}`} /> تحديث</button></div>
              {staffSentLoading ? <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
                : staffSent.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center text-gray-400"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />لا توجد رسائل</div>
                : staffSent.map(msg => (
                  <div key={msg.id} className="bg-white rounded-2xl shadow-sm p-4">
                    <p className="font-bold text-gray-900 text-sm">{msg.message.split('\n')[0]}</p>
                    <p className="text-sm text-gray-600 mt-1">{msg.message.split('\n').slice(2).join('\n')}</p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(msg.created_at).toLocaleString('ar-IQ')}</p>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {/* ── DOCTOR MESSAGING ── */}
      {mainTab === 'doctor' && (
        <>
          <div className="flex gap-2 border-b border-gray-100">
            {[{ k: 'inbox', l: 'الوارد' }, { k: 'compose', l: 'رسالة جديدة' }, { k: 'sent', l: 'المرسلة' }].map(t => (
              <button key={t.k} onClick={() => setDocSubTab(t.k as any)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${docSubTab === t.k ? 'border-sky-400 text-sky-600' : 'border-transparent text-gray-400'}`}>
                {t.l}
              </button>
            ))}
          </div>

          {docSubTab === 'inbox' && (
            <div className="space-y-3">
              <div className="flex justify-end"><button onClick={loadDocSent} className="text-sm text-sky-600 flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${docSentLoading ? 'animate-spin' : ''}`} /> تحديث</button></div>
              {docSentLoading ? <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
                : docInbox.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center text-gray-400"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />لا توجد رسائل واردة من الأطباء</div>
                : docInbox.map(msg => (
                  <div key={msg.id} className="bg-white rounded-2xl shadow-sm p-4 border-r-4 border-sky-400">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-sky-100 text-sky-700 font-bold px-2 py-0.5 rounded-lg">{msg.sender_name}</span>
                      <span className="text-xs text-gray-400 mr-auto">{new Date(msg.created_at).toLocaleString('ar-IQ')}</span>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">{msg.message.split('\n')[0]}</p>
                    <p className="text-sm text-gray-600 mt-1">{msg.message.split('\n').slice(2).join('\n')}</p>
                  </div>
                ))}
            </div>
          )}

          {docSubTab === 'compose' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Stethoscope className="w-5 h-5 text-sky-500" /> اختر الطبيب</h2>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="بحث..." className="flex-1 text-sm outline-none bg-transparent" />
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {filteredDocs.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">لا يوجد أطباء مسجلون</p>
                    : filteredDocs.map(d => (
                      <button key={d.id} onClick={() => setSelectedDoc(d)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selectedDoc?.id === d.id ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <span className="text-xl shrink-0">👨‍⚕️</span>
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm font-medium text-gray-800 truncate">{docName(d)}</p>
                          {d.phone && <p className="text-xs text-gray-400">{d.phone}</p>}
                        </div>
                        {selectedDoc?.id === d.id && <CheckCircle className="w-4 h-4 text-sky-500 shrink-0" />}
                      </button>
                    ))}
                </div>
              </div>
              <div className="lg:col-span-2 space-y-4">
                {selectedDoc && (
                  <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-800 font-medium">
                    إرسال إلى: د. {docName(selectedDoc)}
                  </div>
                )}
                <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">الموضوع *</label>
                    <input value={docTitle} onChange={e => setDocTitle(e.target.value)}
                      placeholder="مثال: استفسار بخصوص وصفة طبية"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">الرسالة *</label>
                    <textarea value={docBody} onChange={e => setDocBody(e.target.value)} rows={5}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
                  </div>
                </div>
                <button onClick={sendDoc} disabled={docSending || !selectedDoc || !docTitle || !docBody}
                  className="w-full flex items-center justify-center gap-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors">
                  {docSending ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />جاري الإرسال...</> : <><Send className="w-5 h-5" />إرسال للطبيب</>}
                </button>
              </div>
            </div>
          )}

          {docSubTab === 'sent' && (
            <div className="space-y-3">
              <div className="flex justify-end"><button onClick={loadDocSent} className="text-sm text-sky-600 flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${docSentLoading ? 'animate-spin' : ''}`} /> تحديث</button></div>
              {docSentLoading ? <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
                : docSent.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center text-gray-400"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />لا توجد رسائل مرسلة</div>
                : docSent.map(msg => (
                  <div key={msg.id} className="bg-white rounded-2xl shadow-sm p-4">
                    <p className="font-bold text-gray-900 text-sm">{msg.message.split('\n')[0]}</p>
                    <p className="text-sm text-gray-600 mt-1">{msg.message.split('\n').slice(2).join('\n')}</p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(msg.created_at).toLocaleString('ar-IQ')}</p>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
