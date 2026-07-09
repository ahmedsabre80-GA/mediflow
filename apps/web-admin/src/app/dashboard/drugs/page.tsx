'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Trash2, RefreshCw, Pill, X, AlertCircle } from 'lucide-react';

const DRUG_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/drugs';

interface Drug {
  id: string;
  generic_name: string;
  brand_name?: string;
  dosage_form?: string;
  strength?: string;
  category?: string;
  barcode?: string;
  created_at?: string;
}

export default function DrugsPage() {
  const [drugs, setDrugs]       = useState<Drug[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [toast, setToast]       = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');

  const [form, setForm] = useState({
    generic_name: '', brand_name: '', dosage_form: '',
    strength: '', category: '', barcode: '',
  });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const fetchDrugs = useCallback(async () => {
    setLoading(true);
    try {
      const q = search.trim();
      const url = q
        ? `${DRUG_API}/search?q=${encodeURIComponent(q)}&limit=100`
        : `${DRUG_API}/search?q=a&limit=100`;
      const r = await fetch(url);
      const d = await r.json();
      setDrugs(d.data || []);
    } catch { showToast('❌ فشل تحميل الأدوية'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchDrugs, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchDrugs, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!form.generic_name.trim()) { setSaveError('أدخل الاسم العلمي للدواء'); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('admin-token');
      const r = await fetch(DRUG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          generic_name: form.generic_name.trim(),
          brand_name:   form.brand_name.trim() || undefined,
          dosage_form:  form.dosage_form.trim() || undefined,
          strength:     form.strength.trim() || undefined,
          category:     form.category.trim() || undefined,
          barcode:      form.barcode.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setSaveError(d?.error?.title || d?.error || d?.message || `فشل الحفظ (${r.status})`);
        setSaving(false);
        return;
      }
      showToast('✅ تم إضافة الدواء إلى الكتالوج');
      setForm({ generic_name: '', brand_name: '', dosage_form: '', strength: '', category: '', barcode: '' });
      setShowAdd(false);
      fetchDrugs();
    } catch { setSaveError('خطأ في الشبكة'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (drug: Drug) => {
    if (!confirm(`حذف "${drug.generic_name}" من الكتالوج؟`)) return;
    try {
      const token = localStorage.getItem('admin-token');
      await fetch(`${DRUG_API}/${drug.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setDrugs(prev => prev.filter(d => d.id !== drug.id));
      showToast('🗑️ تم حذف الدواء');
    } catch { showToast('❌ فشل الحذف'); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">كتالوج الأدوية</h1>
          <p className="text-sm text-gray-500 mt-0.5">الأدوية المتاحة في قاعدة البيانات للصيدليات</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-indigo-100 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full">{drugs.length} دواء</span>
          <button onClick={fetchDrugs} disabled={loading}
            className="flex items-center gap-2 border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button onClick={() => { setShowAdd(true); setSaveError(''); }}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> إضافة دواء
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5 max-w-lg">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم العلمي أو التجاري أو الباركود..."
            className="bg-transparent flex-1 text-sm outline-none" />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">جاري التحميل...</div>
        ) : drugs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Pill className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-gray-400 text-sm">لا توجد أدوية{search ? ` بحث عن "${search}"` : ''}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['الاسم العلمي', 'الاسم التجاري', 'الشكل الدوائي', 'التركيز', 'التصنيف', 'الباركود', 'إجراءات'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {drugs.map(drug => (
                <tr key={drug.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{drug.generic_name}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{drug.brand_name || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{drug.dosage_form || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{drug.strength || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {drug.category
                      ? <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{drug.category}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{drug.barcode || <span className="text-gray-200">—</span>}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(drug)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">إضافة دواء جديد للكتالوج</h2>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {saveError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم العلمي (Generic Name) *</label>
                <input value={form.generic_name} onChange={e => setForm(p => ({ ...p, generic_name: e.target.value }))}
                  autoFocus placeholder="مثال: Paracetamol / باراسيتامول"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم التجاري</label>
                <input value={form.brand_name} onChange={e => setForm(p => ({ ...p, brand_name: e.target.value }))}
                  placeholder="مثال: Panadol"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الشكل الدوائي</label>
                  <select value={form.dosage_form} onChange={e => setForm(p => ({ ...p, dosage_form: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">— اختر —</option>
                    {['Tablet','Capsule','Syrup','Injection','Cream','Drops','Inhaler','Suppository','Patch','Powder'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">التركيز</label>
                  <input value={form.strength} onChange={e => setForm(p => ({ ...p, strength: e.target.value }))}
                    placeholder="مثال: 500mg"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">التصنيف</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">— اختر —</option>
                  {['مسكنات الألم','مضادات الالتهاب','مضادات حيوية','أدوية القلب والضغط','أدوية السكري','أدوية الجهاز الهضمي','أدوية الجهاز التنفسي','أدوية الحساسية','فيتامينات ومكملات','أدوية نفسية وأعصاب','مضادات الفطريات','مضادات الفيروسات','أدوية الأطفال','أخرى'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الباركود (اختياري)</label>
                <input value={form.barcode} onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))}
                  dir="ltr" placeholder="رقم الباركود"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                  {saving ? 'جاري الحفظ...' : 'إضافة للكتالوج'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
