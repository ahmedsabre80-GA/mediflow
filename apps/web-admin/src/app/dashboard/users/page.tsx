'use client';
import { useState, useEffect } from 'react';
import { Search, RefreshCw, LogOut, KeyRound, Eye, CheckCircle, X, Copy, Ban, Trash2, Printer } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

function adminAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('admin-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

// Roles considered "employees" — added by portals, not main owners
const EMPLOYEE_ROLES = ['pharmacy_employee', 'warehouse_employee', 'doctor_assistant', 'driver'];

const ROLE_LABEL: Record<string, string> = {
  pharmacy_employee:  'موظف صيدلية',
  warehouse_employee: 'موظف مستودع',
  doctor_assistant:   'مساعد طبيب',
  driver:             'سائق',
};
const ROLE_COLOR: Record<string, string> = {
  pharmacy_employee:  'bg-sky-100 text-sky-700',
  warehouse_employee: 'bg-purple-100 text-purple-700',
  doctor_assistant:   'bg-teal-100 text-teal-700',
  driver:             'bg-orange-100 text-orange-700',
};
const STATUS_COLOR: Record<string, string> = {
  active:               'bg-green-100 text-green-700',
  pending_verification: 'bg-amber-100 text-amber-700',
  rejected:             'bg-red-100 text-red-700',
  force_logout:         'bg-gray-100 text-gray-500',
  suspended:            'bg-red-100 text-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  active:               'نشط',
  pending_verification: 'معلق',
  rejected:             'مرفوض',
  force_logout:         'موقوف مؤقتاً',
  suspended:            'موقوف',
};

function printUserReport(u: any, belongsTo: string) {
  const win = window.open('', '_blank', 'width=700,height=600');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html><html dir="rtl" lang="ar">
    <head><meta charset="UTF-8"/><title>تقرير مستخدم — ${u.first_name || ''} ${u.last_name || ''}</title>
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
    </style></head>
    <body>
      <div class="header">
        <h1>🏥 منصة ميديفلو — تقرير مستخدم</h1>
        <p>تاريخ إصدار التقرير: ${new Date().toLocaleString('ar-IQ')}</p>
      </div>
      <table>
        <tr><th>الاسم الكامل</th><td>${[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td></tr>
        <tr><th>البريد الإلكتروني</th><td>${u.email || '—'}</td></tr>
        <tr><th>رقم الهاتف</th><td>${u.phone || '—'}</td></tr>
        <tr><th>الدور</th><td>${ROLE_LABEL[u.role] || u.role}</td></tr>
        <tr><th>العائد الى</th><td>${belongsTo || '—'}</td></tr>
        <tr><th>الحالة</th><td>${STATUS_LABEL[u.status] || u.status}</td></tr>
        <tr><th>تاريخ التسجيل</th><td>${new Date(u.created_at).toLocaleDateString('ar-IQ')}</td></tr>
        <tr><th>رقم السجل</th><td>${u.id}</td></tr>
      </table>
      <div class="footer">تم إصدار هذا التقرير من لوحة إدارة منصة ميديفلو — ${new Date().toLocaleString('ar-IQ')}</div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body></html>
  `);
  win.document.close();
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<any>(null);

  // Password reset
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPass, setNewPass] = useState('');
  const [resetDone, setResetDone] = useState('');
  const [resetting, setResetting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    const [usersRes, pharmaciesRes] = await Promise.all([
      fetch(`${AUTH_API}/auth/admin/users`, { headers: adminAuthHeaders() }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${PHARMACY_API}/pharmacies/admin/all`).then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    // Only show employee-type roles here
    const all = usersRes.data || [];
    setUsers(all.filter((u: any) => EMPLOYEE_ROLES.includes(u.role)));
    setPharmacies(pharmaciesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Try to find who this employee belongs to
  const getBelongsTo = (u: any): string => {
    if (u.role === 'pharmacy_employee') {
      // Try to find a pharmacy that might own this employee
      // We check pharmacy name loosely — if a direct link exists it will be there
      const match = pharmacies.find(p => p.owner_email === u.email || p.email === u.email);
      if (match) return match.name_ar || match.name;
      // If we can't determine, show role hint
      return 'صيدلية';
    }
    if (u.role === 'warehouse_employee') return 'مستودع';
    if (u.role === 'doctor_assistant') return 'عيادة';
    if (u.role === 'driver') return 'المنصة';
    return '—';
  };

  const forceSignOut = async (u: any) => {
    await fetch(`${AUTH_API}/auth/admin/force-signout`, {
      method: 'POST', headers: adminAuthHeaders(),
      body: JSON.stringify({ email: u.email }),
    }).catch(() => {});
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: 'force_logout' } : x));
    showToast(`🔒 تم تسجيل خروج ${u.email}`);
    if (selected?.id === u.id) setSelected((s: any) => ({ ...s, status: 'force_logout' }));
  };

  const reactivate = async (u: any) => {
    await fetch(`${AUTH_API}/auth/admin/activate-user`, {
      method: 'POST', headers: adminAuthHeaders(),
      body: JSON.stringify({ email: u.email }),
    }).catch(() => {});
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: 'active' } : x));
    showToast(`✅ تم تفعيل ${u.email}`);
    if (selected?.id === u.id) setSelected((s: any) => ({ ...s, status: 'active' }));
  };

  const confirmAndDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`${AUTH_API}/auth/admin/delete-user`, {
      method: 'DELETE', headers: adminAuthHeaders(),
      body: JSON.stringify({ email: deleteTarget.email }),
    }).catch(() => {});
    setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
    showToast('🗑️ تم حذف المستخدم بالكامل');
  };

  const resetPassword = async () => {
    if (!newPass || newPass.length < 6) return;
    setResetting(true);
    const res = await fetch(`${AUTH_API}/auth/admin/reset-password`, {
      method: 'POST', headers: adminAuthHeaders(),
      body: JSON.stringify({ email: resetTarget.email, newPassword: newPass }),
    });
    setResetting(false);
    if (res.ok) { setResetDone(newPass); showToast('✅ تم تغيير كلمة المرور'); }
    else showToast('❌ فشل تغيير كلمة المرور');
  };

  const genPass = () => {
    const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
    setNewPass(Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join(''));
  };

  const filtered = users.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''} ${u.email}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleGroups = [
    { key: 'all', label: 'الكل' },
    { key: 'pharmacy_employee', label: 'موظفو الصيدليات' },
    { key: 'warehouse_employee', label: 'موظفو المستودعات' },
    { key: 'driver', label: 'السائقون' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المستخدمون</h1>
          <p className="text-sm text-gray-400 mt-0.5">المستخدمون المضافون من خلال البوابات (موظفون، سائقون، مرضى)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{users.length} مستخدم</span>
          <button onClick={load} disabled={loading} className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..."
            className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          {roleGroups.map(r => (
            <button key={r.key} onClick={() => setRoleFilter(r.key)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${roleFilter === r.key ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['المستخدم','البريد الإلكتروني','الدور','العائد الى','الحالة','تاريخ التسجيل','إجراءات'].map(h => (
                <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => <tr key={i}>{[...Array(7)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>)
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-16 text-center">
                <div className="text-gray-300 text-5xl mb-3">👥</div>
                <p className="text-gray-400 text-sm">لا يوجد مستخدمون مضافون من البوابات بعد</p>
                <p className="text-gray-300 text-xs mt-1">سيظهر هنا الموظفون والسائقون الذين يضيفهم الأطباء والصيدليات والمستودعات</p>
              </td></tr>
            ) : filtered.map(u => {
              const belongsTo = getBelongsTo(u);
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-gray-600 font-bold text-sm">{(u.first_name?.[0] || u.email[0]).toUpperCase()}</span>
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-600">{u.email || u.phone}</span>
                      <button onClick={() => navigator.clipboard.writeText(u.email || u.phone).then(() => showToast('تم النسخ ✓'))}
                        className="p-1 text-gray-300 hover:text-gray-500"><Copy className="w-3 h-3" /></button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-700">{belongsTo}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[u.status] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[u.status] || u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString('ar-IQ')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setSelected(u)} title="عرض" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => { setResetTarget(u); setNewPass(''); setResetDone(''); }} title="كلمة المرور" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><KeyRound className="w-4 h-4" /></button>
                      {u.status === 'force_logout' || u.status === 'suspended'
                        ? <button onClick={() => reactivate(u)} title="تفعيل" className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                        : <button onClick={() => forceSignOut(u)} title="تسجيل خروج قسري" className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"><LogOut className="w-4 h-4" /></button>
                      }
                      <button onClick={() => setDeleteTarget(u)} title="حذف" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">تفاصيل المستخدم</h2>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {([
              ['الاسم', [selected.first_name, selected.last_name].filter(Boolean).join(' ') || '—'],
              ['البريد الإلكتروني', selected.email || '—'],
              ['رقم الهاتف', selected.phone || '—'],
              ['الدور', ROLE_LABEL[selected.role] || selected.role],
              ['العائد الى', getBelongsTo(selected)],
              ['الحالة', STATUS_LABEL[selected.status] || selected.status],
              ['تاريخ التسجيل', new Date(selected.created_at).toLocaleString('ar-IQ')],
            ] as [string,string][]).map(([l, v]) => (
              <div key={l} className="flex justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-900">{v}</span>
                <span className="text-sm text-gray-400">{l}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 mt-5">
              {selected.status === 'force_logout' || selected.status === 'suspended'
                ? <button onClick={() => reactivate(selected)} className="flex-1 bg-green-500 text-white font-semibold py-2.5 rounded-xl text-sm">✅ تفعيل</button>
                : <button onClick={() => forceSignOut(selected)} className="flex-1 bg-orange-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1"><LogOut className="w-4 h-4" /> تسجيل خروج</button>
              }
              <button onClick={() => { setDeleteTarget(selected); setSelected(null); }}
                className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1"><Trash2 className="w-4 h-4" /> حذف</button>
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
              <h2 className="text-lg font-bold text-gray-900">حذف المستخدم نهائياً</h2>
              <p className="text-gray-500 text-sm mt-2">سيتم حذف جميع البيانات ولا يمكن التراجع.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm space-y-1.5">
              <p><span className="text-gray-500">الاسم:</span> <span className="font-medium">{[deleteTarget.first_name, deleteTarget.last_name].filter(Boolean).join(' ') || '—'}</span></p>
              <p><span className="text-gray-500">البريد:</span> <span className="font-medium">{deleteTarget.email}</span></p>
              <p><span className="text-gray-500">العائد الى:</span> <span className="font-medium">{getBelongsTo(deleteTarget)}</span></p>
            </div>
            <button onClick={() => printUserReport(deleteTarget, getBelongsTo(deleteTarget))}
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
            <p className="text-sm text-gray-500 mb-4">{resetTarget.email}</p>
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
