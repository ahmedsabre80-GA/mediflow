'use client';
import { useState, useEffect } from 'react';
import { Send, Users, CheckCircle, RefreshCw, MessageCircle, Bell, Building2, Search } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API     = 'https://mediflowauth-service-production.up.railway.app/api/v1';

function drH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('doctor-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

interface Employee  { id: string; name: string; role: string; status: string; }
interface Pharmacy  { id: string; owner_id: string; name?: string; name_ar?: string; city?: string; phone?: string; }
interface SentMsg   { id: string; recipient_id: string; sender_name: string; message: string; created_at: string; is_read: boolean; portal_type?: string; }

const ROLE_LABELS: Record<string, string> = {
  receptionist: 'موظف استقبال', nurse: 'ممرض/ة', assistant: 'مساعد طبي',
  secretary: 'سكرتير', viewer: 'مشاهد',
};

export default function DoctorMessagesPage() {
  const [mainTab,      setMainTab]      = useState<'staff' | 'pharmacy'>('staff');

  // Staff messaging
  const [employees,    setEmployees]    = useState<Employee[]>([]);
  const [selectedEmp,  setSelectedEmp]  = useState<Employee | null>(null);
  const [staffTitle,   setStaffTitle]   = useState('');
  const [staffBody,    setStaffBody]    = useState('');
  const [staffSending, setStaffSending] = useState(false);
  const [staffSent,    setStaffSent]    = useState<SentMsg[]>([]);
  const [staffSentLoading, setStaffSentLoading] = useState(false);
  const [staffSubTab,  setStaffSubTab]  = useState<'compose' | 'sent'>('compose');

  // Pharmacy messaging
  const [pharmacies,   setPharmacies]   = useState<Pharmacy[]>([]);
  const [pharmSearch,  setPharmSearch]  = useState('');
  const [selectedPharm, setSelectedPharm] = useState<Pharmacy | null>(null);
  const [pharmTitle,   setPharmTitle]   = useState('');
  const [pharmBody,    setPharmBody]    = useState('');
  const [pharmSending, setPharmSending] = useState(false);
  const [pharmSent,    setPharmSent]    = useState<SentMsg[]>([]);
  const [pharmSentLoading, setPharmSentLoading] = useState(false);
  const [pharmSubTab,  setPharmSubTab]  = useState<'compose' | 'sent'>('compose');

  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const doctorId   = typeof window !== 'undefined' ? localStorage.getItem('doctor-clinic-id') || '' : '';
  const token      = typeof window !== 'undefined' ? localStorage.getItem('doctor-token') || '' : '';
  const senderName = typeof window !== 'undefined' ? (localStorage.getItem('doctor-name') || 'الطبيب') : 'الطبيب';

  // Load staff
  useEffect(() => {
    if (!doctorId) return;
    fetch(`${PHARMACY_API}/${doctorId}/staff`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setEmployees((d.data || []).filter((e: Employee) => e.status === 'active'))).catch(() => {});
  }, [doctorId]);

  // Load pharmacies
  useEffect(() => {
    if (mainTab !== 'pharmacy' || pharmacies.length > 0) return;
    fetch(`${PHARMACY_API}/active`)
      .then(r => r.json()).then(d => setPharmacies(d.data || [])).catch(() => {});
  }, [mainTab]);

  const loadStaffSent = () => {
    setStaffSentLoading(true);
    const id = typeof window !== 'undefined' ? localStorage.getItem('doctor-id') || '' : '';
    fetch(`${PHARMACY_API}/portal-notifications?portalType=doctor-internal&recipientId=${id}`, { headers: drH() })
      .then(r => r.json()).then(d => {
        const all: SentMsg[] = d.data || [];
        setStaffSent(all.filter(m => m.sender_name === senderName));
      }).catch(() => {}).finally(() => setStaffSentLoading(false));
  };

  const loadPharmSent = () => {
    setPharmSentLoading(true);
    const id = typeof window !== 'undefined' ? localStorage.getItem('doctor-id') || '' : '';
    fetch(`${PHARMACY_API}/portal-notifications?portalType=doctor-to-pharmacy&recipientId=${id}`, { headers: drH() })
      .then(r => r.json()).then(d => setPharmSent((d.data || []).filter((m: SentMsg) => m.sender_name === senderName)))
      .catch(() => {}).finally(() => setPharmSentLoading(false));
  };

  useEffect(() => { if (staffSubTab === 'sent') loadStaffSent(); }, [staffSubTab]);
  useEffect(() => { if (pharmSubTab === 'sent') loadPharmSent(); }, [pharmSubTab]);

  const sendStaff = async () => {
    if (!staffTitle.trim() || !staffBody.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    setStaffSending(true);
    try {
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST', headers: drH(),
        body: JSON.stringify({ portalType: 'doctor-internal', recipientId: selectedEmp?.id || 'broadcast', senderName, message: `${staffTitle}\n\n${staffBody}` }),
      });
      showToast(`✅ تم الإرسال إلى ${selectedEmp ? selectedEmp.name : 'جميع الموظفين'}`);
      setStaffTitle(''); setStaffBody(''); setStaffSubTab('sent');
    } catch { showToast('❌ فشل الإرسال'); } finally { setStaffSending(false); }
  };

  const sendPharm = async () => {
    if (!selectedPharm) { showToast('⚠️ يرجى اختيار صيدلية'); return; }
    if (!pharmTitle.trim() || !pharmBody.trim()) { showToast('⚠️ يرجى كتابة العنوان والرسالة'); return; }
    setPharmSending(true);
    try {
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST', headers: drH(),
        body: JSON.stringify({ portalType: 'pharmacy', recipientId: selectedPharm.owner_id, senderName: `👨‍⚕️ د. ${senderName}`, message: `${pharmTitle}\n\n${pharmBody}` }),
      });
      showToast(`✅ تم الإرسال إلى ${selectedPharm.name_ar || selectedPharm.name}`);
      setPharmTitle(''); setPharmBody(''); setPharmSubTab('sent');
    } catch { showToast('❌ فشل الإرسال'); } finally { setPharmSending(false); }
  };

  const filteredPharm = pharmacies.filter(p =>
    !pharmSearch || p.name_ar?.includes(pharmSearch) || p.name?.includes(pharmSearch) || p.city?.includes(pharmSearch)
  );

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-md text-center">{toast}</div>}

      <h1 className="text-2xl font-bold text-gray-900">الرسائل</h1>

      {/* Main tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[{ k: 'staff', l: '👥 موظفو العيادة' }, { k: 'pharmacy', l: '🏥 الصيدليات' }].map(t => (
          <button key={t.k} onClick={() => setMainTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${mainTab === t.k ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
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
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${staffSubTab === t.k ? 'border-teal-400 text-teal-600' : 'border-transparent text-gray-400'}`}>
                {t.l}
              </button>
            ))}
          </div>
          {staffSubTab === 'compose' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Users className="w-5 h-5 text-teal-500" /> المستلم</h2>
                <div className="space-y-2">
                  <button onClick={() => setSelectedEmp(null)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${!selectedEmp ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <Users className={`w-4 h-4 shrink-0 ${!selectedEmp ? 'text-teal-600' : 'text-gray-400'}`} />
                    <span className="flex-1 text-sm font-medium text-gray-800">جميع الموظفين</span>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${!selectedEmp ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`}>
                      {!selectedEmp && <span className="w-2 h-2 bg-white rounded-full block" />}
                    </div>
                  </button>
                  {employees.map(emp => (
                    <button key={emp.id} onClick={() => setSelectedEmp(emp)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selectedEmp?.id === emp.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-teal-700 font-bold text-xs">{emp.name[0]}</span>
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
                    <input value={staffTitle} onChange={e => setStaffTitle(e.target.value)} placeholder="مثال: تذكير بجدول المناوبة"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">نص الرسالة *</label>
                    <textarea value={staffBody} onChange={e => setStaffBody(e.target.value)} rows={5}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                  </div>
                </div>
                <button onClick={sendStaff} disabled={staffSending || !staffTitle || !staffBody}
                  className="w-full flex items-center justify-center gap-3 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors">
                  {staffSending ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />جاري الإرسال...</> : <><Send className="w-5 h-5" />إرسال</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end"><button onClick={loadStaffSent} className="text-sm text-teal-600 flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${staffSentLoading ? 'animate-spin' : ''}`} /> تحديث</button></div>
              {staffSentLoading ? <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
                : staffSent.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center text-gray-400"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />لا توجد رسائل</div>
                : staffSent.map(msg => (
                  <div key={msg.id} className="bg-white rounded-2xl shadow-sm p-4">
                    <p className="font-bold text-gray-900 text-sm">{msg.message.split('\n')[0]}</p>
                    <p className="text-xs text-gray-500 mt-1">{msg.message.split('\n').slice(2).join('\n')}</p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(msg.created_at).toLocaleString('ar-IQ')}</p>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {/* ── PHARMACY MESSAGING ── */}
      {mainTab === 'pharmacy' && (
        <>
          <div className="flex gap-2 border-b border-gray-100">
            {[{ k: 'compose', l: 'رسالة جديدة' }, { k: 'sent', l: 'المرسلة' }].map(t => (
              <button key={t.k} onClick={() => setPharmSubTab(t.k as any)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${pharmSubTab === t.k ? 'border-teal-400 text-teal-600' : 'border-transparent text-gray-400'}`}>
                {t.l}
              </button>
            ))}
          </div>
          {pharmSubTab === 'compose' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Building2 className="w-5 h-5 text-teal-500" /> اختر الصيدلية</h2>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input value={pharmSearch} onChange={e => setPharmSearch(e.target.value)} placeholder="بحث..." className="flex-1 text-sm outline-none bg-transparent" />
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {filteredPharm.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">لا توجد صيدليات مسجلة</p>
                    : filteredPharm.map(p => (
                      <button key={p.id} onClick={() => setSelectedPharm(p)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${selectedPharm?.id === p.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <span className="text-xl shrink-0">🏥</span>
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.name_ar || p.name}</p>
                          {p.city && <p className="text-xs text-gray-400">{p.city}</p>}
                        </div>
                        {selectedPharm?.id === p.id && <CheckCircle className="w-4 h-4 text-teal-500 shrink-0" />}
                      </button>
                    ))}
                </div>
              </div>
              <div className="lg:col-span-2 space-y-4">
                {selectedPharm && (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-800 font-medium">
                    إرسال إلى: {selectedPharm.name_ar || selectedPharm.name} {selectedPharm.city ? `— ${selectedPharm.city}` : ''}
                  </div>
                )}
                <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">الموضوع *</label>
                    <input value={pharmTitle} onChange={e => setPharmTitle(e.target.value)}
                      placeholder="مثال: استفسار عن توفر دواء أموكسيسيلين"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">الرسالة *</label>
                    <textarea value={pharmBody} onChange={e => setPharmBody(e.target.value)} rows={5}
                      placeholder="اكتب رسالتك للصيدلية هنا..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                  </div>
                </div>
                <button onClick={sendPharm} disabled={pharmSending || !selectedPharm || !pharmTitle || !pharmBody}
                  className="w-full flex items-center justify-center gap-3 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors">
                  {pharmSending ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />جاري الإرسال...</> : <><Send className="w-5 h-5" />إرسال للصيدلية</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end"><button onClick={loadPharmSent} className="text-sm text-teal-600 flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${pharmSentLoading ? 'animate-spin' : ''}`} /> تحديث</button></div>
              {pharmSentLoading ? <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
                : pharmSent.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center text-gray-400"><MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />لا توجد رسائل مرسلة</div>
                : pharmSent.map(msg => (
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
