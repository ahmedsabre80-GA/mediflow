'use client';
import { useEffect, useState } from 'react';
import { Edit2, X, Power, Users } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

function adminAuthHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('admin-token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

export default function PlansManagementPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', name_ar: '', description_ar: '', display_order: 0, is_public: true });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/admin/subscriptions/plans`, { headers: adminAuthHeaders() });
    if (r.ok) setPlans((await r.json()).data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openEdit = (plan: any) => {
    setEditing(plan);
    setForm({ name: plan.name, name_ar: plan.name_ar || '', description_ar: plan.description_ar || '', display_order: plan.display_order, is_public: plan.is_public });
  };

  const saveEdit = async () => {
    setSaving(true);
    const r = await fetch(`${API}/admin/subscriptions/plans/${editing.id}`, {
      method: 'PATCH', headers: adminAuthHeaders(), body: JSON.stringify(form),
    });
    setSaving(false);
    if (r.ok) { showToast('✅ تم حفظ نسخة جديدة من الخطة'); setEditing(null); load(); }
    else showToast('❌ تعذر الحفظ');
  };

  const toggleStatus = async (plan: any) => {
    const nextStatus = plan.status === 'active' ? 'inactive' : 'active';
    const r = await fetch(`${API}/admin/subscriptions/plans/${plan.id}/status`, {
      method: 'PATCH', headers: adminAuthHeaders(), body: JSON.stringify({ status: nextStatus }),
    });
    if (r.ok) { showToast(nextStatus === 'active' ? '✅ تم تفعيل الخطة' : '⏸️ تم إيقاف الخطة'); load(); }
    else showToast('❌ تعذر تغيير الحالة');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">إدارة الخطط</h1>
        <p className="text-sm text-gray-500 mt-1">عرض وتعديل خطط الاشتراك — التعديل ينشئ نسخة جديدة، والمشتركون الحاليون يبقون على النسخة القديمة</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">جاري التحميل...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(p => (
            <div key={p.id} className={`bg-white rounded-2xl border p-5 ${p.status === 'active' ? 'border-gray-200' : 'border-red-200 opacity-70'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-gray-900">{p.name_ar || p.name}</h3>
                  <p className="text-xs text-gray-400">v{p.version} · {p.is_public ? 'عام' : 'خاص'}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {p.status === 'active' ? 'مفعّلة' : 'موقوفة'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                <Users className="w-3.5 h-3.5" /> {p.subscriber_count} مشترك
              </div>
              <ul className="text-xs text-gray-500 space-y-1 mb-4">
                {p.quotas.map((q: any) => (
                  <li key={q.key}>{q.label_ar || q.label}: {q.limit_value === null ? 'غير محدود' : q.limit_value}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button onClick={() => openEdit(p)} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 text-gray-700 py-2 rounded-xl text-xs font-medium hover:bg-gray-50">
                  <Edit2 className="w-3.5 h-3.5" /> تعديل
                </button>
                <button onClick={() => toggleStatus(p)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium ${p.status === 'active' ? 'border border-red-200 text-red-600 hover:bg-red-50' : 'bg-green-500 text-white hover:bg-green-600'}`}>
                  <Power className="w-3.5 h-3.5" /> {p.status === 'active' ? 'إيقاف' : 'تفعيل'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">تعديل خطة: {editing.name_ar}</h3>
              <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الاسم (عربي)</label>
                <input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الاسم (إنجليزي)</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الوصف (عربي)</label>
                <textarea value={form.description_ar} onChange={e => setForm({ ...form, description_ar: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">ترتيب العرض</label>
                <input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.is_public} onChange={e => setForm({ ...form, is_public: e.target.checked })} />
                عرض هذه الخطة في كتالوج الترقية العام
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditing(null)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">إلغاء</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'جاري الحفظ...' : 'حفظ كنسخة جديدة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
