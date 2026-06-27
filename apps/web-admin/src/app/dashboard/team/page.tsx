'use client';
import { useState, useEffect } from 'react';
import { Search, Eye, EyeOff, Key, Shield, Plus, Edit2, Trash2, Ban, CheckCircle, X, Copy } from 'lucide-react';
import { logAction } from '@/lib/auditSystem';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

const PLATFORM_ROLES = [
  { key: 'super_admin', label: 'مشرف عام', color: 'bg-red-100 text-red-700' },
  { key: 'admin', label: 'مدير', color: 'bg-purple-100 text-purple-700' },
  { key: 'assistant_manager', label: 'مساعد مدير', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'supervisor', label: 'مشرف', color: 'bg-sky-100 text-sky-700' },
  { key: 'assistant', label: 'مساعد إداري', color: 'bg-teal-100 text-teal-700' },
  { key: 'programmer', label: 'مبرمج', color: 'bg-amber-100 text-amber-700' },
  { key: 'auditor', label: 'مدقق', color: 'bg-gray-100 text-gray-700' },
  { key: 'support', label: 'دعم فني', color: 'bg-green-100 text-green-700' },
];

const INITIAL_TEAM = [
  { id: '1', name: 'أحمد المشرف', email: 'admin@mediflow.io', role: 'super_admin', password: 'Admin@123456', status: 'active', createdAt: '2026-06-01', permissions: 20 },
  { id: '2', name: 'سارة المديرة', email: 'sara@mediflow.io', role: 'admin', password: 'Sara@2026!', status: 'active', createdAt: '2026-06-10', permissions: 15 },
  { id: '3', name: 'محمد المساعد', email: 'mohammed@mediflow.io', role: 'assistant_manager', password: 'Mohammed#99', status: 'active', createdAt: '2026-06-15', permissions: 10 },
  { id: '4', name: 'علي المشرف', email: 'ali@mediflow.io', role: 'supervisor', password: 'Ali@Sup2026', status: 'active', createdAt: '2026-06-20', permissions: 7 },
  { id: '5', name: 'كريم المبرمج', email: 'kareem@mediflow.io', role: 'programmer', password: 'Kareem@Dev1', status: 'suspended', createdAt: '2026-06-22', permissions: 5 },
];

export default function TeamPage() {
  const [team, setTeam] = useState(INITIAL_TEAM);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [resetPasswordFor, setResetPasswordFor] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'assistant', password: '' });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const togglePassword = (id: string) => setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));

  const copyPassword = (password: string) => {
    navigator.clipboard?.writeText(password);
    showToast('✅ تم نسخ كلمة المرور');
  };

  const toggleStatus = (id: string) => {
    const member = team.find(m => m.id === id);
    if (!member) return;
    setTeam(prev => prev.map(m => m.id === id ? { ...m, status: m.status === 'active' ? 'suspended' : 'active' } : m));
    logAction('suspend', member.status === 'active' ? 'إيقاف عضو فريق' : 'تفعيل عضو فريق', 'فريق المنصة', member.name, id, '/dashboard/team');
    showToast(member.status === 'active' ? '🚫 تم إيقاف العضو' : '✅ تم تفعيل العضو');
  };

  const deleteMember = (id: string) => {
    const member = team.find(m => m.id === id);
    if (member?.role === 'super_admin') { showToast('⚠️ لا يمكن حذف المشرف العام'); return; }
    logAction('delete', 'حذف عضو فريق', 'فريق المنصة', member?.name || id, id, '/dashboard/team');
    setTeam(prev => prev.filter(m => m.id !== id));
    setConfirmDelete(null);
    showToast('🗑️ تم حذف العضو');
  };

  const resetPassword = () => {
    if (!newPassword || newPassword.length < 8) { showToast('⚠️ كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    setTeam(prev => prev.map(m => m.id === resetPasswordFor.id ? { ...m, password: newPassword } : m));
    logAction('edit', 'إعادة تعيين كلمة مرور', 'فريق المنصة', resetPasswordFor.name, resetPasswordFor.id, '/dashboard/team');
    showToast('✅ تم تغيير كلمة المرور');
    setResetPasswordFor(null);
    setNewPassword('');
  };

  const addMember = async () => {
    if (!addForm.name || !addForm.email || !addForm.password) { showToast('⚠️ جميع الحقول مطلوبة'); return; }
    try {
      const res = await fetch(`${AUTH_API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: addForm.name.split(' ')[0], lastName: addForm.name.split(' ').slice(1).join(' ') || 'Admin', email: addForm.email, password: addForm.password, role: addForm.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');
      const newMember = { id: data.data?.userId || Date.now().toString(), name: addForm.name, email: addForm.email, role: addForm.role, password: addForm.password, status: 'active', createdAt: new Date().toISOString().split('T')[0], permissions: 5 };
      setTeam(prev => [newMember, ...prev]);
      logAction('add', 'إضافة عضو فريق جديد', 'فريق المنصة', addForm.name, newMember.id, '/dashboard/team');
      setShowAdd(false);
      setAddForm({ name: '', email: '', role: 'assistant', password: '' });
      showToast('✅ تم إضافة العضو وإنشاء حسابه');
    } catch (err: any) {
      showToast(`⚠️ ${err.message}`);
    }
  };

  const filtered = team.filter(m => {
    const matchSearch = !search || m.name.includes(search) || m.email.includes(search);
    const matchRole = roleFilter === 'all' || m.role === roleFilter;
    return matchSearch && matchRole;
  });

  const getRoleInfo = (role: string) => PLATFORM_ROLES.find(r => r.key === role) || { label: role, color: 'bg-gray-100 text-gray-700' };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">فريق المنصة</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة أعضاء الفريق الداخلي وكلمات المرور</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> إضافة عضو
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الفريق', value: team.length, color: 'text-sky-600' },
          { label: 'نشط', value: team.filter(m => m.status === 'active').length, color: 'text-green-600' },
          { label: 'موقوف', value: team.filter(m => m.status === 'suspended').length, color: 'text-red-600' },
          { label: 'الأدوار', value: new Set(team.map(m => m.role)).size, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none">
          <option value="all">كل الأدوار</option>
          {PLATFORM_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      {/* Team Cards */}
      <div className="space-y-3">
        {filtered.map(member => {
          const roleInfo = getRoleInfo(member.role);
          const showPass = showPasswords[member.id];
          return (
            <div key={member.id} className={`bg-white rounded-2xl shadow-sm p-5 ${member.status === 'suspended' ? 'opacity-75 border border-red-100' : ''}`}>
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.color}`}>{roleInfo.label}</span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {member.status === 'active' ? '● نشط' : '● موقوف'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center">
                    <span className="text-sky-700 font-bold">{member.name[0]}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                  </div>
                </div>
              </div>

              {/* Password Row */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => copyPassword(member.password)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg" title="نسخ">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setResetPasswordFor(member)}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg">
                    <Key className="w-3.5 h-3.5" /> إعادة تعيين
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <code className="text-sm font-mono text-gray-800">
                    {showPass ? member.password : '••••••••••'}
                  </code>
                  <button onClick={() => togglePassword(member.id)} className="text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <span className="text-xs text-gray-500">كلمة المرور:</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => toggleStatus(member.id)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${member.status === 'active' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                    {member.status === 'active' ? <><Ban className="w-3.5 h-3.5" /> إيقاف</> : <><CheckCircle className="w-3.5 h-3.5" /> تفعيل</>}
                  </button>
                  {member.role !== 'super_admin' && (
                    <button onClick={() => setConfirmDelete(member.id)}
                      className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5" /> حذف
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">أُضيف: {member.createdAt}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Member Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold">إضافة عضو فريق جديد</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل *</label>
                <input value={addForm.name} onChange={e => setAddForm(f => ({...f, name: e.target.value}))}
                  placeholder="أحمد محمد علي"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني *</label>
                <input type="email" dir="ltr" value={addForm.email} onChange={e => setAddForm(f => ({...f, email: e.target.value}))}
                  placeholder="member@mediflow.io"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الدور الوظيفي</label>
                <select value={addForm.role} onChange={e => setAddForm(f => ({...f, role: e.target.value}))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                  {PLATFORM_ROLES.filter(r => r.key !== 'super_admin').map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور *</label>
                <input type="text" dir="ltr" value={addForm.password} onChange={e => setAddForm(f => ({...f, password: e.target.value}))}
                  placeholder="Password@123"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono" />
                <p className="text-xs text-gray-500 mt-1">8 أحرف على الأقل، يشمل أحرف كبيرة وأرقام ورموز</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={addMember} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm">إضافة وإنشاء حساب</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { setResetPasswordFor(null); setNewPassword(''); }}><X className="w-5 h-5 text-gray-400" /></button>
              <h2 className="text-lg font-bold">إعادة تعيين كلمة المرور</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">إعادة تعيين كلمة مرور: <strong>{resetPasswordFor.name}</strong></p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الجديدة</label>
              <input type="text" dir="ltr" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="NewPassword@123"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setResetPasswordFor(null); setNewPassword(''); }} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
              <button onClick={resetPassword} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm">تغيير كلمة المرور</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold mb-2">تأكيد الحذف</h2>
            <p className="text-gray-500 text-sm mb-5">هل أنت متأكد من حذف هذا العضو؟ سيفقد جميع صلاحياته.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">إلغاء</button>
              <button onClick={() => deleteMember(confirmDelete)} className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl text-sm">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
