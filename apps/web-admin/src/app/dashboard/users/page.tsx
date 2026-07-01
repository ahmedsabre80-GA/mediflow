'use client';
import { useState, useEffect } from 'react';
import { Search, RefreshCw, LogOut, KeyRound, Eye, EyeOff, CheckCircle, X, Copy } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const SECRET = 'mediflow-delete-2026';

const ROLE_LABEL: Record<string, string> = {
  pharmacy_owner: 'صيدلية',
  doctor: 'طبيب',
  warehouse_owner: 'مستودع',
  driver: 'سائق',
  patient: 'مريض',
  admin: 'مدير',
};
const ROLE_COLOR: Record<string, string> = {
  pharmacy_owner: 'bg-sky-100 text-sky-700',
  doctor: 'bg-teal-100 text-teal-700',
  warehouse_owner: 'bg-purple-100 text-purple-700',
  driver: 'bg-orange-100 text-orange-700',
  patient: 'bg-gray-100 text-gray-600',
  admin: 'bg-red-100 text-red-700',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending_verification: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  force_logout: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'نشط',
  pending_verification: 'معلق',
  rejected: 'مرفوض',
  force_logout: 'موقوف',
};

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [showReset, setShowReset] = useState<any>(null);
  const [newPass, setNewPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${AUTH_API}/auth/admin/users?secret=${SECRET}`)
      .then(r => r.json()).catch(() => ({ data: [] }));
    setUsers(res.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const forceSignOut = async (user: any) => {
    await fetch(`${AUTH_API}/auth/admin/force-signout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, secret: SECRET }),
    }).catch(() => {});
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: 'force_logout' } : u));
    showToast(`🔒 تم تسجيل خروج ${user.email}`);
    if (selected?.id === user.id) setSelected((s: any) => ({ ...s, status: 'force_logout' }));
  };

  const reactivate = async (user: any) => {
    await fetch(`${AUTH_API}/auth/admin/activate-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, secret: SECRET }),
    }).catch(() => {});
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: 'active' } : u));
    showToast(`✅ تم تفعيل ${user.email}`);
    if (selected?.id === user.id) setSelected((s: any) => ({ ...s, status: 'active' }));
  };

  const resetPassword = async () => {
    if (!newPass || newPass.length < 6) return;
    setResetting(true);
    const res = await fetch(`${AUTH_API}/auth/admin/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: showReset.email, newPassword: newPass, secret: SECRET }),
    });
    setResetting(false);
    if (res.ok) {
      setResetDone(newPass);
      showToast('✅ تم تغيير كلمة المرور');
    } else {
      showToast('❌ فشل تغيير كلمة المرور');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast('تم النسخ ✓'));
  };

  const filtered = users.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''} ${u.email}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleGroups = [
    { key: 'all', label: 'الكل' },
    { key: 'pharmacy_owner', label: 'الصيدليات' },
    { key: 'doctor', label: 'الأطباء' },
    { key: 'warehouse_owner', label: 'المستودعات' },
    { key: 'driver', label: 'السائقون' },
    { key: 'patient', label: 'المرضى' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين</h1>
        <div className="flex items-center gap-2">
          <span className="bg-sky-100 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full">{users.length} مستخدم</span>
          <button onClick={load} disabled={loading}
            className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'صيدليات', count: users.filter(u => u.role === 'pharmacy_owner').length, color: 'bg-sky-50 text-sky-700' },
          { label: 'أطباء', count: users.filter(u => u.role === 'doctor').length, color: 'bg-teal-50 text-teal-700' },
          { label: 'مستودعات', count: users.filter(u => u.role === 'warehouse_owner').length, color: 'bg-purple-50 text-purple-700' },
          { label: 'نشط', count: users.filter(u => u.status === 'active').length, color: 'bg-green-50 text-green-700' },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-2xl p-4 text-center`}>
            <p className="text-3xl font-bold">{s.count}</p>
            <p className="text-sm mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
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
              {['المستخدم', 'البريد الإلكتروني', 'النوع', 'الحالة', 'تاريخ التسجيل', 'إجراءات'].map(h => (
                <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>{[...Array(6)].map((_, j) => (
                  <td key={j} className="px-4 py-4">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td>
                ))}</tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">لا يوجد مستخدمون</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-sky-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-sky-700 font-bold text-sm">
                        {(u.first_name?.[0] || u.email[0]).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-600">{u.email || u.phone}</span>
                    <button onClick={() => copyToClipboard(u.email || u.phone)}
                      className="p-1 text-gray-400 hover:text-gray-600">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[u.status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[u.status] || u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString('ar-IQ')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => setSelected(u)} title="عرض التفاصيل"
                      className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setShowReset(u); setNewPass(''); setResetDone(''); }} title="تغيير كلمة المرور"
                      className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg">
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {u.status === 'force_logout' ? (
                      <button onClick={() => reactivate(u)} title="إعادة تفعيل"
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => forceSignOut(u)} title="تسجيل الخروج القسري"
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
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

            <div className="space-y-0 mb-5">
              {([
                ['الاسم', [selected.first_name, selected.last_name].filter(Boolean).join(' ') || '—'],
                ['البريد الإلكتروني', selected.email || '—'],
                ['رقم الهاتف', selected.phone || '—'],
                ['النوع', ROLE_LABEL[selected.role] || selected.role],
                ['الحالة', STATUS_LABEL[selected.status] || selected.status],
                ['تاريخ التسجيل', new Date(selected.created_at).toLocaleString('ar-IQ')],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900 font-medium">{value}</span>
                    {(label === 'البريد الإلكتروني' || label === 'رقم الهاتف') && value !== '—' && (
                      <button onClick={() => copyToClipboard(value)} className="p-1 text-gray-400 hover:text-gray-600">
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm">{label}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              {selected.status === 'force_logout' ? (
                <button onClick={() => reactivate(selected)}
                  className="flex-1 bg-green-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" /> إعادة تفعيل
                </button>
              ) : (
                <button onClick={() => forceSignOut(selected)}
                  className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                  <LogOut className="w-4 h-4" /> تسجيل خروج قسري
                </button>
              )}
              <button onClick={() => { setShowReset(selected); setSelected(null); setNewPass(''); setResetDone(''); }}
                className="flex-1 bg-amber-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                <KeyRound className="w-4 h-4" /> تغيير كلمة المرور
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {showReset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">تغيير كلمة المرور</h2>
              <button onClick={() => setShowReset(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{showReset.email}</p>

            {resetDone ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-bold text-green-800 mb-2">✅ تم تغيير كلمة المرور</p>
                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                  <span className="font-mono text-sm text-gray-800">{resetDone}</span>
                  <button onClick={() => copyToClipboard(resetDone)} className="text-green-600 hover:text-green-800">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الجديدة</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      placeholder="6 أحرف على الأقل"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button onClick={() => {
                  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
                  setNewPass(Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
                  setShowPass(true);
                }} className="text-xs text-sky-600 hover:underline">
                  توليد كلمة مرور تلقائية
                </button>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowReset(null)}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">
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
