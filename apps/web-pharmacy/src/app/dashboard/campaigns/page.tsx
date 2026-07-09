'use client';
import { useState, useEffect } from 'react';
import {
  Plus, Megaphone, Trash2, X, ChevronDown, ChevronUp,
  CalendarDays, Tag, Package, ToggleLeft, ToggleRight,
} from 'lucide-react';
import type { Campaign, CampaignItem } from '../sales/page';

const CAMP_KEY = 'pharmacy-campaigns';
const BAT_KEY  = 'pharmacy-stock-batches';

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function loadCampaigns(): Campaign[] {
  try { return JSON.parse(localStorage.getItem(CAMP_KEY) || '[]'); } catch { return []; }
}
function saveCampaigns(c: Campaign[]) { localStorage.setItem(CAMP_KEY, JSON.stringify(c)); }

function uniqueDrugNames(batches: any[]): string[] {
  const names = new Set<string>();
  batches.filter(b => b.qtyRemaining > 0).forEach((b: any) => names.add(b.drugName));
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ar'));
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [drugNames, setDrugNames] = useState<string[]>([]);
  const [batches,   setBatches]   = useState<any[]>([]);
  const [showForm,  setShowForm]  = useState(false);
  const [expanded,  setExpanded]  = useState<string | null>(null);

  // form state
  const [form, setForm] = useState({ name: '', description: '', startDate: '', endDate: '' });
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [itemForm, setItemForm] = useState({ drugName: '', brandName: '', originalPrice: '', discountPct: '', campaignPrice: '' });

  useEffect(() => {
    setCampaigns(loadCampaigns());
    try {
      const b: any[] = JSON.parse(localStorage.getItem(BAT_KEY) || '[]');
      setBatches(b);
      setDrugNames(uniqueDrugNames(b));
    } catch {}
  }, []);

  const pickDrug = (name: string) => {
    const b = batches.find((x: any) => x.drugName === name);
    setItemForm(f => ({
      ...f, drugName: name,
      brandName: b?.brandName || '',
      originalPrice: b?.sellingPrice ? String(b.sellingPrice) : '',
    }));
  };

  const updateCampaignPrice = (disc: string, orig: string) => {
    const d = Number(disc); const o = Number(orig);
    if (d >= 0 && d <= 100 && o > 0) setItemForm(f => ({ ...f, campaignPrice: String(Math.round(o * (1 - d / 100))) }));
  };

  const addItem = () => {
    if (!itemForm.drugName || !itemForm.originalPrice || !itemForm.discountPct || !itemForm.campaignPrice) return;
    setItems(prev => [...prev, {
      drugName: itemForm.drugName, brandName: itemForm.brandName,
      originalPrice: Number(itemForm.originalPrice),
      discountPct: Number(itemForm.discountPct),
      campaignPrice: Number(itemForm.campaignPrice),
    }]);
    setItemForm({ drugName: '', brandName: '', originalPrice: '', discountPct: '', campaignPrice: '' });
  };

  const removeItem = (i: number) => setItems(prev => prev.filter((_, j) => j !== i));

  const saveCampaign = () => {
    if (!form.name.trim() || items.length === 0) return;
    const camp: Campaign = { id: uid(), name: form.name.trim(), description: form.description.trim(), startDate: form.startDate, endDate: form.endDate, items, active: true };
    const next = [...campaigns, camp];
    setCampaigns(next); saveCampaigns(next);
    setShowForm(false);
    setForm({ name: '', description: '', startDate: '', endDate: '' });
    setItems([]);
  };

  const toggleActive = (id: string) => {
    const next = campaigns.map(c => c.id === id ? { ...c, active: !c.active } : c);
    setCampaigns(next); saveCampaigns(next);
  };

  const deleteCampaign = (id: string) => {
    const next = campaigns.filter(c => c.id !== id);
    setCampaigns(next); saveCampaigns(next);
  };

  const isActive = (c: Campaign) => {
    if (!c.active) return false;
    const now = Date.now();
    if (c.startDate && new Date(c.startDate).getTime() > now) return false;
    if (c.endDate   && new Date(c.endDate).getTime()   < now) return false;
    return true;
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">الحملات الترويجية</h2>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium px-4 py-2 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> حملة جديدة
        </button>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 text-sm text-orange-700">
        📢 الحملات الترويجية تظهر في شاشة المبيعات تحت تبويب <strong>الحملات</strong> ويمكن إضافة أصنافها مباشرةً إلى الفاتورة.
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5 border border-orange-100">
          <h3 className="font-bold text-gray-900 text-lg">إنشاء حملة جديدة</h3>

          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم الحملة *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: عروض رمضان"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">وصف الحملة</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="اختياري"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">تاريخ البداية</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">تاريخ الانتهاء</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="bg-orange-50 rounded-2xl overflow-hidden">
              <div className="px-4 py-2 text-xs font-bold text-orange-700 border-b border-orange-100">الأصناف المضافة</div>
              <div className="divide-y divide-orange-100">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{it.drugName}</p>
                      <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="line-through">{it.originalPrice.toLocaleString('ar-IQ')}</span>
                        <span className="font-bold text-orange-600">{it.campaignPrice.toLocaleString('ar-IQ')} د.ع</span>
                        <span className="bg-orange-200 text-orange-800 px-1.5 rounded-full">خصم {it.discountPct}%</span>
                      </div>
                    </div>
                    <button onClick={() => removeItem(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add item form */}
          <div className="border-2 border-dashed border-orange-200 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-gray-700 flex items-center gap-2"><Package className="w-4 h-4 text-orange-500" /> إضافة صنف للحملة</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">الدواء (من المخزون)</label>
                <select value={itemForm.drugName} onChange={e => pickDrug(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option value="">-- اختر دواء --</option>
                  {drugNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الاسم التجاري</label>
                <input value={itemForm.brandName} onChange={e => setItemForm(f => ({ ...f, brandName: e.target.value }))} placeholder="اختياري"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">السعر الأصلي (د.ع)</label>
                <input type="number" value={itemForm.originalPrice}
                  onChange={e => { setItemForm(f => ({ ...f, originalPrice: e.target.value })); updateCampaignPrice(itemForm.discountPct, e.target.value); }}
                  placeholder="0"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">نسبة الخصم %</label>
                <input type="number" min="0" max="100" value={itemForm.discountPct}
                  onChange={e => { setItemForm(f => ({ ...f, discountPct: e.target.value })); updateCampaignPrice(e.target.value, itemForm.originalPrice); }}
                  placeholder="10"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">سعر الحملة (د.ع) — محسوب تلقائياً أو أدخله يدوياً</label>
                <input type="number" value={itemForm.campaignPrice} onChange={e => setItemForm(f => ({ ...f, campaignPrice: e.target.value }))} placeholder="0"
                  className="w-full px-3 py-2.5 border border-orange-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50 font-bold text-orange-700" />
              </div>
            </div>
            <button onClick={addItem}
              disabled={!itemForm.drugName || !itemForm.originalPrice || !itemForm.discountPct || !itemForm.campaignPrice}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium">
              <Plus className="w-4 h-4" /> إضافة الصنف للحملة
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowForm(false); setItems([]); setForm({ name: '', description: '', startDate: '', endDate: '' }); }}
              className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
            <button onClick={saveCampaign} disabled={!form.name.trim() || items.length === 0}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-bold">حفظ الحملة</button>
          </div>
        </div>
      )}

      {/* ── Campaign list ── */}
      {campaigns.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl p-12 shadow-sm text-center">
          <Megaphone className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">لا توجد حملات مسجلة</p>
          <p className="text-gray-400 text-sm mt-1">أنشئ حملتك الأولى لتظهر في شاشة المبيعات</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map(camp => (
            <div key={camp.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-all ${isActive(camp) ? 'border-orange-300' : 'border-gray-100'}`}>
              <div className="px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive(camp) ? 'bg-orange-100' : 'bg-gray-100'}`}>
                  <Megaphone className={`w-5 h-5 ${isActive(camp) ? 'text-orange-500' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900">{camp.name}</h3>
                    {isActive(camp)
                      ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">نشطة</span>
                      : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">موقوفة</span>}
                  </div>
                  {camp.description && <p className="text-xs text-gray-400 mt-0.5">{camp.description}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {camp.startDate && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{camp.startDate}</span>}
                    {camp.endDate   && <span>→ {camp.endDate}</span>}
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{camp.items.length} صنف</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(camp.id)} className="p-2 rounded-xl hover:bg-gray-50" title={camp.active ? 'إيقاف' : 'تفعيل'}>
                    {camp.active
                      ? <ToggleRight className="w-6 h-6 text-orange-500" />
                      : <ToggleLeft  className="w-6 h-6 text-gray-400" />}
                  </button>
                  <button onClick={() => setExpanded(e => e === camp.id ? null : camp.id)} className="p-2 rounded-xl hover:bg-gray-50">
                    {expanded === camp.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  <button onClick={() => deleteCampaign(camp.id)} className="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {expanded === camp.id && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-right px-5 py-2 text-xs font-bold text-gray-500">الصنف</th>
                        <th className="text-center px-3 py-2 text-xs font-bold text-gray-500">السعر الأصلي</th>
                        <th className="text-center px-3 py-2 text-xs font-bold text-gray-500">الخصم</th>
                        <th className="text-center px-3 py-2 text-xs font-bold text-gray-500">سعر الحملة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {camp.items.map((it, i) => (
                        <tr key={i} className="hover:bg-orange-50/30">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-gray-900">{it.drugName}</p>
                            {it.brandName && <p className="text-xs text-gray-400">{it.brandName}</p>}
                          </td>
                          <td className="px-3 py-3 text-center text-gray-400 line-through text-xs">{it.originalPrice.toLocaleString('ar-IQ')}</td>
                          <td className="px-3 py-3 text-center"><span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{it.discountPct}%</span></td>
                          <td className="px-3 py-3 text-center font-bold text-orange-600">{it.campaignPrice.toLocaleString('ar-IQ')} د.ع</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
