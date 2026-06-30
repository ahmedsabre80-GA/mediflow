'use client';
import { useState } from 'react';
import { Search, CheckCircle, XCircle, Eye, Package, Plus, Trash2, Ban } from 'lucide-react';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'معلق', color: 'bg-amber-100 text-amber-700' },
  active: { label: 'نشط', color: 'bg-green-100 text-green-700' },
  suspended: { label: 'موقوف', color: 'bg-red-100 text-red-700' },
  rejected: { label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
};

interface Warehouse {
  id: number;
  name: string;
  company: string;
  license: string;
  city: string;
  status: string;
  products: number;
  created_at: string;
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Warehouse | null>(null);
  const [newWarehouse, setNewWarehouse] = useState({ name: '', company: '', license: '', city: '' });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const filtered = warehouses.filter(w => {
    const matchSearch = !search || w.name.includes(search) || w.company.includes(search);
    const matchFilter = filter === 'all' || w.status === filter;
    return matchSearch && matchFilter;
  });

  const approve = (id: number) => setWarehouses(prev => prev.map(w => w.id === id ? { ...w, status: 'active' } : w));
  const reject = (id: number) => setWarehouses(prev => prev.map(w => w.id === id ? { ...w, status: 'rejected' } : w));
  const suspend = (id: number) => setWarehouses(prev => prev.map(w => w.id === id ? { ...w, status: w.status === 'suspended' ? 'active' : 'suspended' } : w));
  const deleteWarehouse = (id: number) => { setWarehouses(prev => prev.filter(w => w.id !== id)); setConfirmDelete(null); };

  const addWarehouse = () => {
    if (!newWarehouse.name || !newWarehouse.company) return alert('يرجى ملء جميع الحقول');
    setWarehouses(prev => [...prev, {
      id: Date.now(), ...newWarehouse, status: 'pending_verification', products: 0, created_at: new Date().toISOString().split('T')[0]
    }]);
    setNewWarehouse({ name: '', company: '', license: '', city: '' });
    setShowAdd(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المذاخر</h1>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> إضافة مخزن
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المذاخر', value: warehouses.length, color: 'text-indigo-600' },
          { label: 'نشط', value: warehouses.filter(w => w.status === 'active').length, color: 'text-green-600' },
          { label: 'في انتظار التحقق', value: warehouses.filter(w => w.status === 'pending_verification').length, color: 'text-amber-600' },
          { label: 'إجمالي المنتجات', value: warehouses.reduce((s, w) => s + w.products, 0), color: 'text-sky-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم المخزن أو الشركة..."
            className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending_verification',l:'معلق'},{k:'active',l:'نشط'},{k:'suspended',l:'موقوف'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['المخزن', 'الشركة', 'المدينة', 'المنتجات', 'الحالة', 'إجراءات'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(warehouse => {
              const status = STATUS_LABELS[warehouse.status];
              return (
                <tr key={warehouse.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <Package className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{warehouse.name}</p>
                        <p className="text-xs text-gray-400">{warehouse.license}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{warehouse.company}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{warehouse.city}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">{warehouse.products}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(warehouse)}
                        className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg" title="عرض التفاصيل">
                        <Eye className="w-4 h-4" />
                      </button>
                      {warehouse.status === 'pending_verification' && (
                        <>
                          <button onClick={() => approve(warehouse.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="موافقة">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => reject(warehouse.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="رفض">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {warehouse.status === 'active' && (
                        <button onClick={() => suspend(warehouse.id)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إيقاف">
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      {warehouse.status === 'suspended' && (
                        <button onClick={() => approve(warehouse.id)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="إعادة تفعيل">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => setConfirmDelete(warehouse.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="حذف">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">إضافة مخزن جديد</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المخزن</label>
                <input value={newWarehouse.name} onChange={e => setNewWarehouse({...newWarehouse, name: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="مخزن الأمين" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الشركة</label>
                <input value={newWarehouse.company} onChange={e => setNewWarehouse({...newWarehouse, company: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="شركة الأمين للتوزيع" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الترخيص</label>
                <input value={newWarehouse.license} onChange={e => setNewWarehouse({...newWarehouse, license: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="WH-2024-006" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المدينة</label>
                <input value={newWarehouse.city} onChange={e => setNewWarehouse({...newWarehouse, city: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="بغداد" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={addWarehouse}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm">إضافة</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h2>
            <p className="text-gray-500 text-sm mb-5">هل أنت متأكد من حذف هذا المخزن؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={() => deleteWarehouse(confirmDelete)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl text-sm">حذف</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              <h2 className="text-lg font-bold text-gray-900">تفاصيل المخزن</h2>
            </div>
            <div className="space-y-3">
              {[
                { label: 'اسم المخزن', value: selected.name },
                { label: 'الشركة', value: selected.company },
                { label: 'رقم الترخيص', value: selected.license },
                { label: 'المدينة', value: selected.city },
                { label: 'عدد المنتجات', value: selected.products },
                { label: 'تاريخ التسجيل', value: selected.created_at },
                { label: 'الحالة', value: STATUS_LABELS[selected.status]?.label },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-900 text-sm">{item.value}</span>
                  <span className="text-gray-500 text-sm">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              {selected.status === 'pending_verification' && (
                <button onClick={() => { approve(selected.id); setSelected(null); }}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl text-sm">
                  ✅ موافقة
                </button>
              )}
              {selected.status === 'active' && (
                <button onClick={() => { suspend(selected.id); setSelected(null); }}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm">
                  🚫 إيقاف
                </button>
              )}
              {selected.status === 'suspended' && (
                <button onClick={() => { approve(selected.id); setSelected(null); }}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl text-sm">
                  ✅ إعادة تفعيل
                </button>
              )}
              <button onClick={() => setSelected(null)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
