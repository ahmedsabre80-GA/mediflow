'use client';
import { useEffect, useState } from 'react';
import { Search, CheckCircle, XCircle, Eye, Ban, Trash2, X, RefreshCw, KeyRound, LogOut, Printer } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';
const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

const SECRET = 'mediflow-delete-2026';

function adminAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('admin-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'معلق',   color: 'bg-amber-100 text-amber-700' },
  active:               { label: 'نشط',    color: 'bg-green-100 text-green-700' },
  suspended:            { label: 'موقوف',  color: 'bg-red-100 text-red-700' },
  rejected:             { label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
  inactive:             { label: 'غير نشط', color: 'bg-amber-100 text-amber-700' },
};

function printPharmacyReport(p: any) {
  const win = window.open('', '_blank', 'width=700,height=600');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8"/>
      <title>تقرير صيدلية — ${p.name_ar || p.name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; direction: rtl; padding: 40px; color: #1a1a1a; }
        .header { text-align: center; border-bottom: 2px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 24px; }
        .header h1 { font-size: 22px; color: #0ea5e9; }
        .header p { font-size: 13px; color: #666; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 13px; text-align: right; }
        th { background: #f8fafc; font-weight: bold; color: #374151; width: 35%; }
        .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🏥 منصة ميديفلو — تقرير صيدلية</h1>
        <p>تاريخ إصدار التقرير: ${new Date().toLocaleString('ar-IQ')}</p>
      </div>
      <table>
        <tr><th>اسم الصيدلية</th><td>${p.name_ar || p.name || '—'}</td></tr>
        <tr><th>رقم الترخيص</th><td>${p.license_number || '—'}</td></tr>
        <tr><th>الهاتف</th><td>${p.phone || '—'}</td></tr>
        <tr><th>المدينة</th><td>${p.city || '—'}</td></tr>
        <tr><th>العنوان</th><td>${p.address || '—'}</td></tr>
        <tr><th>البريد الإلكتروني للمالك</th><td>${p.owner_email || p.email || '—'}</td></tr>
        <tr><th>تاريخ انتهاء الترخيص</th><td>${p.license_expiry ? new Date(p.license_expiry).toLocaleDateString('ar-IQ') : '—'}</td></tr>
        <tr><th>الحالة</th><td>${STATUS_LABELS[p.status]?.label || p.status}</td></tr>
        <tr><th>التقييم</th><td>${parseFloat(p.rating || 0).toFixed(1)} / 5</td></tr>
        <tr><th>رقم السجل</th><td>${p.id}</td></tr>
      </table>
      <div class="footer">
        تم إصدار هذا التقرير من لوحة إدارة منصة ميديفلو — ${new Date().toLocaleString('ar-IQ')}
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

export default function PharmaciesPage() {
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);
  const [toast, setToast] = useState('');

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // Password reset
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPass, setNewPass] = useState('');
  const [resetDone, setResetDone] = useState('');
  const [resetting, setResetting] = useState(false);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ nameAr: '', licenseNumber: '', phone: '', address: '', city: '', email: '', password: '', addedBy: 'platform' });
  const [addingSave, setAddingSave] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const load = () => {
    setLoading(true);
    fetch(`${PHARMACY_API}/pharmacies/admin/all`, { headers: adminAuthHeaders() })
      .then(r => r.json())
      .then(d => setPharmacies(d.data || []))
      .catch(() => setPharmacies([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!addForm.nameAr || !addForm.licenseNumber || !addForm.phone) return alert('يرجى ملء الاسم والترخيص والهاتف');
    if (!addForm.email || !addForm.password) return alert('يرجى إدخال البريد الإلكتروني وكلمة المرور');
    if (addForm.password.length < 8) return alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    setAddingSave(true);
    try {
      // 1. Register auth account
      const authRes = await fetch(`${AUTH_API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addForm.email, password: addForm.password, role: 'pharmacy_owner', name: addForm.nameAr }),
      });
      const authData = await authRes.json();
      if (!authRes.ok) throw new Error(authData.message || 'فشل إنشاء الحساب');

      // 2. Create pharmacy record
      const phRes = await fetch(`${PHARMACY_API}/pharmacies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authData.token || authData.data?.token || ''}` },
        body: JSON.stringify({
          name_ar: addForm.nameAr,
          name: addForm.nameAr,
          license_number: addForm.licenseNumber,
          phone: addForm.phone,
          address: addForm.address,
          city: addForm.city,
          owner_email: addForm.email,
          status: 'active',
        }),
      });
      const phData = await phRes.json();
      const newP = phData.data || {
        id: `manual-${Date.now()}`,
        name_ar: addForm.nameAr,
        name: addForm.nameAr,
        license_number: addForm.licenseNumber,
        phone: addForm.phone,
        address: addForm.address,
        city: addForm.city,
        owner_email: addForm.email,
        status: 'active',
        rating: 0,
      };
      setPharmacies(prev => [newP, ...prev]);
      logAction('add', 'إضافة صيدلية', 'صيدلية', addForm.nameAr, newP.id, '/dashboard/pharmacies');
      setShowAddModal(false);
      setAddForm({ nameAr: '', licenseNumber: '', phone: '', address: '', city: '', email: '', password: '', addedBy: 'platform' });
      showToast('✅ تم إضافة الصيدلية وإنشاء حسابها');
    } catch (err: any) {
      showToast(`❌ ${err.message || 'حدث خطأ أثناء الإضافة'}`);
    } finally {
      setAddingSave(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`${PHARMACY_API}/pharmacies/admin/${id}/status`, {
        method: 'PATCH',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      // Also sync auth account
      const pharmacy = pharmacies.find(p => p.id === id);
      const email = pharmacy?.owner_email || pharmacy?.email;
      if (email) {
        if (status === 'suspended') {
          await fetch(`${AUTH_API}/auth/admin/force-signout`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, secret: SECRET }),
          }).catch(() => {});
        } else if (status === 'active') {
          await fetch(`${AUTH_API}/auth/admin/activate-user`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, secret: SECRET }),
          }).catch(() => {});
        }
      }
      setPharmacies(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      if (selected?.id === id) setSelected((s: any) => ({ ...s, status }));
      const msgs: Record<string, string> = { active: '✅ تم تفعيل الصيدلية', suspended: '🚫 تم إيقاف الصيدلية', rejected: '❌ تم رفض الصيدلية' };
      showToast(msgs[status] || 'تم التحديث');
      logAction(status, msgs[status] || status, 'صيدلية', pharmacy?.name_ar || id, id, '/dashboard/pharmacies');
    } catch { showToast('⚠️ فشل تحديث الحالة'); }
  };

  const confirmAndDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`${PHARMACY_API}/pharmacies/admin/${deleteTarget.id}/status`, {
        method: 'PATCH',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ status: 'deleted' }),
      });
    } catch {}
    const email = deleteTarget.owner_email || deleteTarget.email;
    if (email) {
      await fetch(`${AUTH_API}/auth/admin/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, secret: SECRET }),
      }).catch(() => {});
    }
    setPharmacies(prev => prev.filter(p => p.id !== deleteTarget.id));
    logAction('delete', 'حذف صيدلية', 'صيدلية', deleteTarget.name_ar || deleteTarget.name || deleteTarget.id, deleteTarget.id, '/dashboard/pharmacies');
    setDeleting(false);
    setDeleteTarget(null);
    showToast('🗑️ تم حذف الصيدلية بالكامل');
  };

  const resetPassword = async () => {
    if (!newPass || newPass.length < 6) return;
    const email = resetTarget.owner_email || resetTarget.email;
    if (!email) { showToast('❌ لا يوجد بريد إلكتروني للمالك'); return; }
    setResetting(true);
    const res = await fetch(`${AUTH_API}/auth/admin/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, newPassword: newPass, secret: SECRET }),
    });
    setResetting(false);
    if (res.ok) {
      setResetDone(newPass);
      showToast('✅ تم تغيير كلمة المرور');
      // Reactivate auth account and pharmacy status
      await fetch(`${AUTH_API}/auth/admin/activate-user`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, secret: SECRET }),
      }).catch(() => {});
      if (resetTarget?.id) {
        const patchRes = await fetch(`${PHARMACY_API}/pharmacies/admin/${resetTarget.id}/status`, {
          method: 'PATCH', headers: adminAuthHeaders(),
          body: JSON.stringify({ status: 'active' }),
        }).catch(() => null);
        if (patchRes?.ok) {
          setPharmacies(prev => prev.map(p => p.id === resetTarget.id ? { ...p, status: 'active' } : p));
        }
      }
    } else showToast('❌ فشل تغيير كلمة المرور');
  };

  const forceSignOut = async (pharmacy: any) => {
    const email = pharmacy.owner_email || pharmacy.email;
    if (!email) { showToast('❌ لا يوجد بريد إلكتروني'); return; }
    await fetch(`${AUTH_API}/auth/admin/force-signout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, secret: SECRET }),
    }).catch(() => {});
    showToast('🔒 تم تسجيل الخروج القسري');
  };

  const genPass = () => {
    const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
    setNewPass(Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join(''));
  };

  const filtered = pharmacies.filter(p => {
    const matchSearch = !search || p.name?.includes(search) || p.name_ar?.includes(search);
    const matchFilter = filter === 'all' || p.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الصيدليات</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{pharmacies.length} إجمالي</span>
          <button onClick={load} disabled={loading} className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            + إضافة صيدلية
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي', value: pharmacies.length,                                               color: 'text-sky-600',   bg: 'bg-sky-50' },
          { label: 'نشط',    value: pharmacies.filter(p=>p.status==='active').length,                color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'معلق',   value: pharmacies.filter(p=>p.status==='pending_verification').length,  color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'موقوف',  value: pharmacies.filter(p=>p.status==='suspended').length,             color: 'text-red-600',   bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن صيدلية..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[{k:'all',l:'الكل'},{k:'pending_verification',l:'معلق'},{k:'active',l:'نشط'},{k:'suspended',l:'موقوف'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['اسم الصيدلية','المدينة','الهاتف','الحالة','إجراءات'].map(h => (
                <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => <tr key={i}>{[...Array(5)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>)
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">لا توجد صيدليات</td></tr>
            ) : filtered.map((pharmacy: any) => {
              const status = STATUS_LABELS[pharmacy.status] || { label: pharmacy.status || 'معلق', color: 'bg-amber-100 text-amber-700' };
              return (
                <tr key={pharmacy.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{pharmacy.name_ar || pharmacy.name}</p>
                    <p className="text-xs text-gray-500">{pharmacy.license_number}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{pharmacy.city || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{pharmacy.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => setSelected(pharmacy)} title="عرض" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                      {(pharmacy.status === 'pending_verification' || pharmacy.status === 'inactive') && <>
                        <button onClick={() => updateStatus(pharmacy.id,'active')} title="تفعيل" className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => updateStatus(pharmacy.id,'rejected')} title="رفض" className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><XCircle className="w-4 h-4" /></button>
                      </>}
                      {pharmacy.status === 'active' && (
                        <button onClick={() => updateStatus(pharmacy.id,'suspended')} title="إيقاف" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><Ban className="w-4 h-4" /></button>
                      )}
                      {pharmacy.status === 'suspended' && (
                        <button onClick={() => updateStatus(pharmacy.id,'active')} title="تفعيل" className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => { setResetTarget(pharmacy); setNewPass(''); setResetDone(''); }} title="تغيير كلمة المرور" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><KeyRound className="w-4 h-4" /></button>
                      <button onClick={() => forceSignOut(pharmacy)} title="تسجيل خروج قسري" className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"><LogOut className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget(pharmacy)} title="حذف" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* View modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold text-gray-900">تفاصيل الصيدلية</h2>
            </div>
            <div className="space-y-0 mb-5">
              {([
                ['الاسم', selected.name_ar || selected.name],
                ['الهاتف', selected.phone],
                ['المدينة', selected.city],
                ['العنوان', selected.address],
                ['رقم الترخيص / الشهادة', selected.license_number],
                ['الاسم على الشهادة', selected.license_holder_name],
                ['بريد المالك', selected.owner_email || selected.email],
                ['التقييم', `⭐ ${parseFloat(selected.rating||0).toFixed(1)}`],
                ['الحالة', STATUS_LABELS[selected.status]?.label],
              ] as [string,string][]).map(([l, v]) => v ? (
                <div key={l} className="flex justify-between py-2.5 border-b border-gray-100">
                  <span className="font-medium text-gray-900 text-sm">{v}</span>
                  <span className="text-gray-500 text-sm">{l}</span>
                </div>
              ) : null)}
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.status === 'pending_verification' && <button onClick={() => updateStatus(selected.id,'active')} className="flex-1 bg-green-500 text-white font-semibold py-2.5 rounded-xl text-sm">✅ موافقة</button>}
              {selected.status === 'active' && <button onClick={() => updateStatus(selected.id,'suspended')} className="flex-1 bg-amber-500 text-white font-semibold py-2.5 rounded-xl text-sm">🚫 إيقاف</button>}
              {selected.status === 'suspended' && <button onClick={() => updateStatus(selected.id,'active')} className="flex-1 bg-green-500 text-white font-semibold py-2.5 rounded-xl text-sm">✅ تفعيل</button>}
              <button onClick={() => { setDeleteTarget(selected); setSelected(null); }} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1">
                <Trash2 className="w-4 h-4" /> حذف
              </button>
              <button onClick={() => setSelected(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-lg font-bold text-gray-900">حذف الصيدلية نهائياً</h2>
              <p className="text-gray-500 text-sm mt-2">سيتم حذف جميع البيانات بشكل كامل ولا يمكن التراجع.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm space-y-1.5">
              <p><span className="text-gray-500">الاسم:</span> <span className="font-medium">{deleteTarget.name_ar || deleteTarget.name}</span></p>
              <p><span className="text-gray-500">الترخيص:</span> <span className="font-medium">{deleteTarget.license_number}</span></p>
              <p><span className="text-gray-500">المدينة:</span> <span className="font-medium">{deleteTarget.city || '—'}</span></p>
            </div>
            <button onClick={() => printPharmacyReport(deleteTarget)}
              className="w-full flex items-center justify-center gap-2 border-2 border-sky-300 text-sky-700 font-semibold py-2.5 rounded-xl text-sm mb-3 hover:bg-sky-50">
              <Printer className="w-4 h-4" /> طباعة التقرير أولاً
            </button>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={confirmAndDelete} disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">
                {deleting ? 'جاري الحذف...' : 'حذف الكل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password reset modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">تغيير كلمة المرور</h2>
              <button onClick={() => setResetTarget(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{resetTarget.name_ar || resetTarget.name}</p>
            {resetDone ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-bold text-green-800 mb-2">✅ تم تغيير كلمة المرور</p>
                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                  <span className="font-mono text-sm text-gray-800">{resetDone}</span>
                  <button onClick={() => navigator.clipboard.writeText(resetDone)} className="text-xs text-green-600">نسخ</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)}
                  placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <button onClick={genPass} className="text-xs text-sky-600 hover:underline">توليد تلقائي</button>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">
                {resetDone ? 'إغلاق' : 'إلغاء'}
              </button>
              {!resetDone && (
                <button onClick={resetPassword} disabled={resetting || newPass.length < 6}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                  {resetting ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold">إضافة صيدلية جديدة</h2>
            </div>
            <div className="space-y-3">
              {[
                { key: 'nameAr', label: 'اسم الصيدلية *', placeholder: 'صيدلية الأمين' },
                { key: 'licenseNumber', label: 'رقم الترخيص *', placeholder: 'PH-2024-001', dir: 'ltr' },
                { key: 'phone', label: 'رقم الهاتف *', placeholder: '+9647801234567', dir: 'ltr' },
                { key: 'address', label: 'العنوان', placeholder: 'الكرادة، شارع المتنبي' },
                { key: 'city', label: 'المدينة', placeholder: 'بغداد' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input dir={(field as any).dir || 'rtl'}
                    value={(addForm as any)[field.key]} onChange={e => setAddForm(f => ({...f, [field.key]: e.target.value}))}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
              ))}
              <hr className="border-gray-200" />
              <p className="text-xs text-gray-500 font-medium">بيانات تسجيل الدخول للصيدلية</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني *</label>
                <input type="email" dir="ltr"
                  value={addForm.email} onChange={e => setAddForm(f => ({...f, email: e.target.value}))}
                  placeholder="pharmacy@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور * (8 أحرف على الأقل)</label>
                <input type="password" dir="ltr"
                  value={addForm.password} onChange={e => setAddForm(f => ({...f, password: e.target.value}))}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={handleAdd} disabled={addingSave} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60">
                {addingSave ? 'جاري الإضافة...' : 'إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
