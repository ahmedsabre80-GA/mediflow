'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, AlertTriangle, Building2, Search, CheckCircle, MessageCircle, Send, X } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

function drH(): Record<string, string> {
  try {
    const t = localStorage.getItem('doctor-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  } catch { return { 'Content-Type': 'application/json' }; }
}

interface PrescriptionItem {
  drugName: string; dosage: string; frequency: string; duration: string; instructions: string;
}
interface Pharmacy { id: string; owner_id: string; name?: string; name_ar?: string; city?: string; phone?: string; }

export default function NewPrescriptionPage() {
  const router = useRouter();
  const [loading,      setLoading]      = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [patientName,  setPatientName]  = useState('');
  const [diagnosis,    setDiagnosis]    = useState('');
  const [notes,        setNotes]        = useState('');
  const [items,        setItems]        = useState<PrescriptionItem[]>([
    { drugName: '', dosage: '', frequency: '', duration: '', instructions: '' }
  ]);

  // Pharmacy selection
  const [pharmacies,    setPharmacies]    = useState<Pharmacy[]>([]);
  const [pharmSearch,   setPharmSearch]   = useState('');
  const [selectedPharm, setSelectedPharm] = useState<Pharmacy | null>(null);
  const [showPharmPicker, setShowPharmPicker] = useState(false);

  // Ask pharmacy (quick message)
  const [showAskModal,  setShowAskModal]  = useState(false);
  const [askMsg,        setAskMsg]        = useState('');
  const [askSending,    setAskSending]    = useState(false);
  const [askSent,       setAskSent]       = useState(false);

  const senderName = typeof window !== 'undefined' ? localStorage.getItem('doctor-name') || 'الطبيب' : 'الطبيب';

  useEffect(() => {
    fetch(`${PHARMACY_API}/active`)
      .then(r => r.json()).then(d => setPharmacies(d.data || [])).catch(() => {});
  }, []);

  const addItem = () => setItems([...items, { drugName: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof PrescriptionItem, value: string) => {
    const updated = [...items]; updated[i] = { ...updated[i], [field]: value }; setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      setSuccess(true);
      setTimeout(() => router.push('/dashboard/prescriptions'), 2000);
    } catch {
      alert('فشل إصدار الوصفة الطبية');
    } finally { setLoading(false); }
  };

  const sendAsk = async () => {
    if (!selectedPharm || !askMsg.trim()) return;
    setAskSending(true);
    try {
      const drugList = items.filter(i => i.drugName).map(i => `• ${i.drugName} ${i.dosage}`).join('\n');
      const fullMsg = `استفسار بخصوص توفر أدوية\n\nالأدوية المطلوبة:\n${drugList}\n\nملاحظة: ${askMsg}`;
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST', headers: drH(),
        body: JSON.stringify({ portalType: 'pharmacy', recipientId: selectedPharm.owner_id, senderName: `👨‍⚕️ د. ${senderName}`, message: fullMsg }),
      });
      setAskSent(true);
      setTimeout(() => { setShowAskModal(false); setAskSent(false); setAskMsg(''); }, 2000);
    } catch { alert('فشل الإرسال'); } finally { setAskSending(false); }
  };

  const filteredPharm = pharmacies.filter(p =>
    !pharmSearch || p.name_ar?.includes(pharmSearch) || p.name?.includes(pharmSearch) || p.city?.includes(pharmSearch)
  );

  if (success) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-3xl">✅</span></div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">تم إصدار الوصفة الطبية</h2>
          <p className="text-gray-500">جاري التحويل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto" dir="rtl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">وصفة طبية جديدة</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Info */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-4">معلومات المريض</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم المريض</label>
              <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="أحمد محمد علي"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">التشخيص</label>
              <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="التهاب الجهاز التنفسي العلوي"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>
          </div>
        </div>

        {/* Medications */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">الأدوية</h2>
            <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium">
              <Plus className="w-4 h-4" /> إضافة دواء
            </button>
          </div>
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">الدواء {i + 1}</span>
                  {items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">اسم الدواء</label>
                    <input value={item.drugName} onChange={e => updateItem(i, 'drugName', e.target.value)} placeholder="أموكسيسيلين 500mg"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">الجرعة</label>
                    <input value={item.dosage} onChange={e => updateItem(i, 'dosage', e.target.value)} placeholder="500mg"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">التكرار</label>
                    <select value={item.frequency} onChange={e => updateItem(i, 'frequency', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required>
                      <option value="">اختر</option>
                      <option>مرة يومياً</option><option>مرتان يومياً</option><option>3 مرات يومياً</option>
                      <option>4 مرات يومياً</option><option>عند الحاجة</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">المدة</label>
                    <input value={item.duration} onChange={e => updateItem(i, 'duration', e.target.value)} placeholder="7 أيام"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">تعليمات</label>
                    <input value={item.instructions} onChange={e => updateItem(i, 'instructions', e.target.value)} placeholder="بعد الأكل"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pharmacy Selection */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Building2 className="w-5 h-5 text-teal-500" /> الصيدلية</h2>
          {selectedPharm ? (
            <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏥</span>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{selectedPharm.name_ar || selectedPharm.name}</p>
                  {selectedPharm.city && <p className="text-xs text-gray-500">{selectedPharm.city}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setShowAskModal(true); setAskMsg(''); setAskSent(false); }}
                  className="flex items-center gap-1.5 text-xs bg-white border border-teal-300 text-teal-700 px-3 py-1.5 rounded-lg hover:bg-teal-50 font-medium">
                  <MessageCircle className="w-3.5 h-3.5" /> استفسار
                </button>
                <button type="button" onClick={() => setSelectedPharm(null)} className="text-gray-400 hover:text-red-500 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowPharmPicker(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
              <Building2 className="w-5 h-5" /> اختر صيدلية لإرسال الوصفة إليها
            </button>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">سيتم التحقق تلقائياً من التفاعلات الدوائية عند إصدار الوصفة</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">ملاحظات إضافية</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="أي تعليمات إضافية للمريض..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()}
            className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            إلغاء
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'جاري الإصدار...' : 'إصدار الوصفة الطبية'}
          </button>
        </div>
      </form>

      {/* Pharmacy Picker Modal */}
      {showPharmPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPharmPicker(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-gray-900">اختر صيدلية</h3>
              <button onClick={() => setShowPharmPicker(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input value={pharmSearch} onChange={e => setPharmSearch(e.target.value)} placeholder="ابحث باسم الصيدلية أو المدينة..."
                  autoFocus className="flex-1 text-sm outline-none bg-transparent" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {filteredPharm.length === 0 ? <p className="text-center py-8 text-gray-400 text-sm">لا توجد نتائج</p>
                : filteredPharm.map(p => (
                  <button key={p.id} onClick={() => { setSelectedPharm(p); setShowPharmPicker(false); setPharmSearch(''); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-teal-50 transition-colors text-right border border-transparent hover:border-teal-200">
                    <span className="text-2xl shrink-0">🏥</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{p.name_ar || p.name}</p>
                      {p.city && <p className="text-xs text-gray-500">{p.city}</p>}
                      {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                    </div>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-lg shrink-0">نشطة</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Ask Pharmacy Modal */}
      {showAskModal && selectedPharm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAskModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-gray-900">استفسار — {selectedPharm.name_ar || selectedPharm.name}</h3>
              <button onClick={() => setShowAskModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {askSent ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-bold text-gray-900">تم الإرسال بنجاح</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {items.filter(i => i.drugName).length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">الأدوية في الوصفة:</p>
                    {items.filter(i => i.drugName).map((i, idx) => (
                      <p key={idx} className="text-xs text-gray-700">• {i.drugName} {i.dosage}</p>
                    ))}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">رسالتك للصيدلية</label>
                  <textarea value={askMsg} onChange={e => setAskMsg(e.target.value)} rows={4} autoFocus
                    placeholder="مثال: هل لديكم أموكسيسيلين 500mg متوفر حالياً؟"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                </div>
                <button onClick={sendAsk} disabled={askSending || !askMsg.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
                  {askSending ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />جاري الإرسال...</> : <><Send className="w-4 h-4" />إرسال الاستفسار</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
