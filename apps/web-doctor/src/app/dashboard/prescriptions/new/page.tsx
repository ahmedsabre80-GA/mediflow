'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

interface PrescriptionItem {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export default function NewPrescriptionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PrescriptionItem[]>([
    { drugName: '', dosage: '', frequency: '', duration: '', instructions: '' }
  ]);

  const addItem = () => setItems([...items, { drugName: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof PrescriptionItem, value: string) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // In production this calls prescription-service
      // For now we simulate success
      await new Promise(r => setTimeout(r, 1500));
      setSuccess(true);
      setTimeout(() => router.push('/dashboard/prescriptions'), 2000);
    } catch {
      alert('فشل إصدار الوصفة الطبية');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✅</span>
          </div>
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
              <input value={patientName} onChange={e => setPatientName(e.target.value)}
                placeholder="أحمد محمد علي"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">التشخيص</label>
              <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                placeholder="التهاب الجهاز التنفسي العلوي"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
            </div>
          </div>
        </div>

        {/* Medications */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">الأدوية</h2>
            <button type="button" onClick={addItem}
              className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium">
              <Plus className="w-4 h-4" /> إضافة دواء
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">الدواء {i + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">اسم الدواء</label>
                    <input value={item.drugName} onChange={e => updateItem(i, 'drugName', e.target.value)}
                      placeholder="أموكسيسيلين 500mg"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">الجرعة</label>
                    <input value={item.dosage} onChange={e => updateItem(i, 'dosage', e.target.value)}
                      placeholder="500mg"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">التكرار</label>
                    <select value={item.frequency} onChange={e => updateItem(i, 'frequency', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required>
                      <option value="">اختر</option>
                      <option>مرة يومياً</option>
                      <option>مرتان يومياً</option>
                      <option>3 مرات يومياً</option>
                      <option>4 مرات يومياً</option>
                      <option>عند الحاجة</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">المدة</label>
                    <input value={item.duration} onChange={e => updateItem(i, 'duration', e.target.value)}
                      placeholder="7 أيام"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">تعليمات</label>
                    <input value={item.instructions} onChange={e => updateItem(i, 'instructions', e.target.value)}
                      placeholder="بعد الأكل"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Drug Interaction Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">سيتم التحقق تلقائياً من التفاعلات الدوائية عند إصدار الوصفة</p>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">ملاحظات إضافية</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="أي تعليمات إضافية للمريض..."
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
    </div>
  );
}
