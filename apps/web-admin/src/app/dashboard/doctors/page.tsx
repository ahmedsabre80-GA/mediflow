'use client';
import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, Ban, Trash2, X, RefreshCw, KeyRound, LogOut, Printer } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const SECRET = 'mediflow-delete-2026';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'معلق',    color: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'موافق',   color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'مرفوض',  color: 'bg-red-100 text-red-700' },
  suspended: { label: 'موقوف',  color: 'bg-gray-100 text-gray-600' },
};

function printDoctorReport(doc: any) {
  const win = window.open('', '_blank', 'width=700,height=600');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8"/>
      <title>تقرير طبيب — ${doc.employee_name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; direction: rtl; padding: 40px; color: #1a1a1a; }
        .header { text-align: center; border-bottom: 2px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 24px; }
        .header h1 { font-size: 22px; color: #0ea5e9; }
        .header p { font-size: 13px; color: #666; margin-top: 4px; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #dcfce7; color: #16a34a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 13px; text-align: right; }
        th { background: #f8fafc; font-weight: bold; color: #374151; width: 35%; }
        .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🏥 منصة ميديفلو — تقرير طبيب</h1>
        <p>تاريخ إصدار التقرير: ${new Date().toLocaleString('ar-IQ')}</p>
      </div>
      <table>
        <tr><th>الاسم الكامل</th><td>${doc.employee_name || '—'}</td></tr>
        <tr><th>البريد الإلكتروني</th><td>${doc.employee_email || '—'}</td></tr>
        <tr><th>التخصص</th><td>${doc.employee_role || '—'}</td></tr>
        <tr><th>رقم الترخيص</th><td>${doc.reason?.replace('رقم الترخيص: ','') || '—'}</td></tr>
        <tr><th>الحالة</th><td><span class="badge">${STATUS_LABELS[doc.status]?.label || doc.status}</span></td></tr>
        <tr><th>تاريخ التسجيل</th><td>${new Date(doc.created_at).toLocaleDateString('ar-IQ')}</td></tr>
        <tr><th>رقم السجل</th><td>${doc.id}</td></tr>
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

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<any[]>([]);
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${PHARMACY_API}/admin-requests?portal_type=doctor`);
      const d = await r.json();
      if (d.success) setDoctors(d.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    const doc = doctors.find(d => d.id === id);
    await fetch(`${PHARMACY_API}/admin-requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {});
    if (status === 'approved' && doc?.employee_email) {
      await fetch(`${AUTH_API}/auth/admin/activate-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: doc.employee_email, secret: SECRET }),
      }).catch(() => {});
    }
    setDoctors(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    logAction(status, status === 'approved' ? 'موافقة على طبيب' : 'رفض طبيب', 'طبيب', doc?.employee_name || id, id, '/dashboard/doctors');
    showToast(status === 'approved' ? '✅ تمت الموافقة على الطبيب' : '❌ تم رفض الطبيب');
    setSelected(null);
  };

  const suspend = async (doc: any) => {
    const isSuspended = doc.authStatus === 'suspended';
    await fetch(`${AUTH_API}/auth/admin/${isSuspended ? 'activate-user' : 'force-signout'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: doc.employee_email, secret: SECRET }),
    }).catch(() => {});
    if (!isSuspended) {
      // Also set suspended status
      await fetch(`${AUTH_API}/auth/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: doc.employee_email, newPassword: '_suspended_', secret: SECRET }),
      }).catch(() => {});
    }
    setDoctors(prev => prev.map(d => d.id === doc.id ? { ...d, authStatus: isSuspended ? 'active' : 'suspended' } : d));
    if (selected?.id === doc.id) setSelected((s: any) => ({ ...s, authStatus: isSuspended ? 'active' : 'suspended' }));
    showToast(isSuspended ? '✅ تم تفعيل الطبيب' : '🚫 تم إيقاف الطبيب');
  };

  const forceSignOut = async (email: string) => {
    await fetch(`${AUTH_API}/auth/admin/force-signout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, secret: SECRET }),
    }).catch(() => {});
    showToast('🔒 تم تسجيل الخروج القسري');
  };

  const confirmAndDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`${PHARMACY_API}/admin-requests/${deleteTarget.id}`, { method: 'DELETE' }).catch(() => {});
    if (deleteTarget.employee_email) {
      await fetch(`${AUTH_API}/auth/admin/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: deleteTarget.employee_email, secret: SECRET }),
      }).catch(() => {});
    }
    setDoctors(prev => prev.filter(d => d.id !== deleteTarget.id));
    logAction('delete', 'حذف طبيب', 'طبيب', deleteTarget.employee_name || deleteTarget.id, deleteTarget.id, '/dashboard/doctors');
    setDeleting(false);
    setDeleteTarget(null);
    showToast('🗑️ تم حذف الطبيب بالكامل');
  };

  const resetPassword = async () => {
    if (!newPass || newPass.length < 6) return;
    setResetting(true);
    const res = await fetch(`${AUTH_API}/auth/admin/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTarget.employee_email, newPassword: newPass, secret: SECRET }),
    });
    setResetting(false);
    if (res.ok) { setResetDone(newPass); showToast('✅ تم تغيير كلمة المرور'); }
    else showToast('❌ فشل تغيير كلمة المرور');
  };

  const genPass = () => {
    const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
    setNewPass(Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join(''));
  };

  const filtered = doctors.filter(d => {
    const name = (d.employee_name || '').toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || (d.employee_role || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || d.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الأطباء</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.length} إجمالي</span>
          <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.filter(d=>d.status==='pending').length} معلق</span>
          <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">{doctors.filter(d=>d.status==='approved').length} موافق</span>
          <button onClick={load} disabled={loading} className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'معلق',   value: doctors.filter(d=>d.status==='pending').length,   color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'موافق',  value: doctors.filter(d=>d.status==='approved').length,  color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'مرفوض', value: doctors.filter(d=>d.status==='rejected').length,  color: 'text-red-600',   bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الطبيب أو التخصص..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex gap-2">
          {[{k:'all',l:'الكل'},{k:'pending',l:'معلق'},{k:'approved',l:'موافق'},{k:'rejected',l:'مرفوض'}].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['الطبيب','التخصص','البريد الإلكتروني','الترخيص','الحالة','إجراءات'].map(h => (
                <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(3)].map((_, i) => <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>)
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">لا يوجد أطباء مسجلون</td></tr>
            ) : filtered.map(doc => {
              const status = STATUS_LABELS[doc.status] || STATUS_LABELS.pending;
              const isSuspended = doc.authStatus === 'suspended';
              return (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-teal-700 font-bold text-sm">د</span>
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{doc.employee_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{doc.employee_role || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{doc.employee_email || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{doc.reason?.replace('رقم الترخيص: ','') || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => setSelected(doc)} title="عرض" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                      {doc.status === 'pending' && <>
                        <button onClick={() => decide(doc.id,'approved')} title="موافقة" className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => decide(doc.id,'rejected')} title="رفض" className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><XCircle className="w-4 h-4" /></button>
                      </>}
                      {doc.employee_email && <>
                        <button onClick={() => { setResetTarget(doc); setNewPass(''); setResetDone(''); }} title="تغيير كلمة المرور" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => forceSignOut(doc.employee_email)} title="تسجيل خروج قسري" className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"><LogOut className="w-4 h-4" /></button>
                        <button onClick={() => suspend(doc)} title={isSuspended ? 'رفع الإيقاف' : 'إيقاف الحساب'} className={`p-1.5 rounded-lg ${isSuspended ? 'text-green-600 hover:bg-green-50' : 'text-gray-500 hover:bg-gray-100'}`}>
                          <Ban className="w-4 h-4" />
                        </button>
                      </>}
                      <button onClick={() => setDeleteTarget(doc)} title="حذف" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
              <h2 className="text-lg font-bold">تفاصيل الطبيب</h2>
            </div>
            <div className="space-y-0 mb-5">
              {([
                ['الاسم', selected.employee_name],
                ['التخصص', selected.employee_role],
                ['البريد', selected.employee_email],
                ['رقم الترخيص', selected.reason?.replace('رقم الترخيص: ','')],
                ['تاريخ الطلب', new Date(selected.created_at).toLocaleDateString('ar-IQ')],
                ['الحالة', STATUS_LABELS[selected.status]?.label],
              ] as [string,string][]).map(([l, v]) => v ? (
                <div key={l} className="flex justify-between py-2.5 border-b border-gray-100">
                  <span className="font-medium text-gray-900 text-sm">{v}</span>
                  <span className="text-gray-500 text-sm">{l}</span>
                </div>
              ) : null)}
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.status === 'pending' && <>
                <button onClick={() => decide(selected.id,'approved')} className="flex-1 bg-green-500 text-white font-semibold py-2.5 rounded-xl text-sm">✅ موافقة</button>
                <button onClick={() => decide(selected.id,'rejected')} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-xl text-sm">❌ رفض</button>
              </>}
              {selected.employee_email && <>
                <button onClick={() => { setResetTarget(selected); setSelected(null); setNewPass(''); setResetDone(''); }}
                  className="flex-1 bg-amber-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1">
                  <KeyRound className="w-4 h-4" /> كلمة المرور
                </button>
                <button onClick={() => { setDeleteTarget(selected); setSelected(null); }}
                  className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1">
                  <Trash2 className="w-4 h-4" /> حذف
                </button>
              </>}
              <button onClick={() => setSelected(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal — print report first, then delete */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-lg font-bold text-gray-900">حذف الطبيب نهائياً</h2>
              <p className="text-gray-500 text-sm mt-2">سيتم حذف جميع البيانات بشكل كامل ولا يمكن التراجع عن هذه العملية.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm space-y-1.5">
              <p><span className="text-gray-500">الاسم:</span> <span className="font-medium">{deleteTarget.employee_name}</span></p>
              <p><span className="text-gray-500">البريد:</span> <span className="font-medium">{deleteTarget.employee_email}</span></p>
              <p><span className="text-gray-500">التخصص:</span> <span className="font-medium">{deleteTarget.employee_role || '—'}</span></p>
            </div>
            <button onClick={() => printDoctorReport(deleteTarget)}
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
            <p className="text-sm text-gray-500 mb-4">{resetTarget.employee_name} — {resetTarget.employee_email}</p>
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
    </div>
  );
}
