'use client';
import { useState } from 'react';
import { Search, Shield, Eye, Ban, Trash2, CheckCircle, Plus, Edit2, X } from 'lucide-react';

// ─── PLATFORM ADMIN ROLES ONLY ───────────────────────────────────────────────
// These are INTERNAL platform staff — not doctors/pharmacists/patients
// Those are managed in their own dedicated pages

const PLATFORM_ROLES = [
  { key: 'super_admin', label: 'مشرف عام', color: 'bg-red-100 text-red-700', desc: 'صلاحيات كاملة على المنصة' },
  { key: 'admin', label: 'مدير', color: 'bg-purple-100 text-purple-700', desc: 'إدارة المنصة بدون الإعدادات الحساسة' },
  { key: 'assistant_manager', label: 'مساعد مدير', color: 'bg-indigo-100 text-indigo-700', desc: 'مساعدة المدير في المهام اليومية' },
  { key: 'supervisor', label: 'مشرف', color: 'bg-sky-100 text-sky-700', desc: 'مراقبة العمليات والتقارير' },
  { key: 'assistant', label: 'مساعد إداري', color: 'bg-teal-100 text-teal-700', desc: 'مهام إدارية محدودة' },
  { key: 'programmer', label: 'مبرمج', color: 'bg-amber-100 text-amber-700', desc: 'الوصول التقني والتطوير' },
  { key: 'auditor', label: 'مدقق', color: 'bg-gray-100 text-gray-700', desc: 'مراجعة السجلات والتقارير فقط' },
  { key: 'support', label: 'دعم فني', color: 'bg-green-100 text-green-700', desc: 'دعم المستخدمين وحل المشكلات' },
];

// ─── PERMISSION GROUPS ───────────────────────────────────────────────────────
const PERMISSION_GROUPS = [
  {
    group: 'إدارة الصيدليات',
    permissions: [
      { key: 'pharmacies:read', label: 'عرض الصيدليات' },
      { key: 'pharmacies:approve', label: 'الموافقة على الصيدليات' },
      { key: 'pharmacies:suspend', label: 'إيقاف الصيدليات' },
      { key: 'pharmacies:delete', label: 'حذف الصيدليات' },
    ],
  },
  {
    group: 'إدارة المذاخر',
    permissions: [
      { key: 'warehouses:read', label: 'عرض المذاخر' },
      { key: 'warehouses:approve', label: 'الموافقة على المذاخر' },
      { key: 'warehouses:suspend', label: 'إيقاف المذاخر' },
    ],
  },
  {
    group: 'إدارة الأطباء',
    permissions: [
      { key: 'doctors:read', label: 'عرض الأطباء' },
      { key: 'doctors:approve', label: 'الموافقة على الأطباء' },
      { key: 'doctors:suspend', label: 'إيقاف الأطباء' },
    ],
  },
  {
    group: 'إدارة المستخدمين',
    permissions: [
      { key: 'users:read', label: 'عرض المستخدمين' },
      { key: 'users:manage', label: 'إدارة المستخدمين' },
      { key: 'users:delete', label: 'حذف المستخدمين' },
    ],
  },
  {
    group: 'الطلبات والمدفوعات',
    permissions: [
      { key: 'orders:read', label: 'عرض الطلبات' },
      { key: 'orders:manage', label: 'إدارة الطلبات' },
      { key: 'payments:read', label: 'عرض المدفوعات' },
      { key: 'payments:refund', label: 'إصدار استردادات' },
    ],
  },
  {
    group: 'التقارير والتحليلات',
    permissions: [
      { key: 'analytics:read', label: 'عرض التحليلات' },
      { key: 'reports:export', label: 'تصدير التقارير' },
      { key: 'audit:read', label: 'عرض سجل المراقبة' },
    ],
  },
  {
    group: 'إعدادات المنصة',
    permissions: [
      { key: 'settings:read', label: 'عرض الإعدادات' },
      { key: 'settings:write', label: 'تعديل الإعدادات' },
      { key: 'roles:manage', label: 'إدارة الأدوار والصلاحيات' },
    ],
  },
  {
    group: 'الوصول التقني',
    permissions: [
      { key: 'api:access', label: 'الوصول لـ API' },
      { key: 'logs:read', label: 'عرض سجلات النظام' },
      { key: 'database:read', label: 'قراءة قاعدة البيانات' },
    ],
  },
];

// Role preset permissions
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key)),
  admin: [
    'pharmacies:read','pharmacies:approve','pharmacies:suspend',
    'warehouses:read','warehouses:approve','warehouses:suspend',
    'doctors:read','doctors:approve','doctors:suspend',
    'users:read','users:manage',
    'orders:read','orders:manage','payments:read','payments:refund',
    'analytics:read','reports:export','audit:read',
    'settings:read',
  ],
  assistant_manager: [
    'pharmacies:read','pharmacies:approve',
    'warehouses:read','warehouses:approve',
    'doctors:read','doctors:approve',
    'users:read','users:manage',
    'orders:read','orders:manage',
    'analytics:read','reports:export',
  ],
  supervisor: [
    'pharmacies:read','warehouses:read','doctors:read',
    'users:read','orders:read','analytics:read','audit:read',
  ],
  assistant: ['pharmacies:read','warehouses:read','doctors:read','users:read','orders:read'],
  programmer: ['api:access','logs:read','database:read','settings:read'],
  auditor: ['audit:read','analytics:read','reports:export','orders:read','payments:read'],
  support: ['pharmacies:read','users:read','orders:read','orders:manage'],
};

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  status: 'active' | 'suspended';
  createdAt: string;
}

const INITIAL_USERS: AdminUser[] = [
  { id: '1', name: 'أحمد المشرف', email: 'admin@mediflow.io', role: 'super_admin', permissions: ROLE_PERMISSIONS.super_admin, status: 'active', createdAt: '2026-06-01' },
  { id: '2', name: 'سارة المديرة', email: 'sara@mediflow.io', role: 'admin', permissions: ROLE_PERMISSIONS.admin, status: 'active', createdAt: '2026-06-10' },
  { id: '3', name: 'محمد المساعد', email: 'mohammed@mediflow.io', role: 'assistant_manager', permissions: ROLE_PERMISSIONS.assistant_manager, status: 'active', createdAt: '2026-06-15' },
  { id: '4', name: 'علي المشرف', email: 'ali@mediflow.io', role: 'supervisor', permissions: ROLE_PERMISSIONS.supervisor, status: 'active', createdAt: '2026-06-20' },
  { id: '5', name: 'كريم المبرمج', email: 'kareem@mediflow.io', role: 'programmer', permissions: ROLE_PERMISSIONS.programmer, status: 'suspended', createdAt: '2026-06-22' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>(INITIAL_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewPermissions, setViewPermissions] = useState<AdminUser | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const toggleStatus = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'suspended' : 'active' } : u));
    const user = users.find(u => u.id === id);
    showToast(user?.status === 'active' ? '🚫 تم إيقاف المستخدم' : '✅ تم تفعيل المستخدم');
  };

  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    setConfirmDelete(null);
    showToast('🗑️ تم حذف المستخدم');
  };

  const saveUser = (user: AdminUser) => {
    if (editUser) {
      setUsers(prev => prev.map(u => u.id === user.id ? user : u));
      showToast('✅ تم تحديث المستخدم');
    } else {
      setUsers(prev => [...prev, { ...user, id: Date.now().toString(), createdAt: new Date().toISOString().split('T')[0] }]);
      showToast('✅ تم إضافة المستخدم');
    }
    setShowAdd(false);
    setEditUser(null);
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.includes(search) || u.email.includes(search);
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const getRoleInfo = (role: string) => PLATFORM_ROLES.find(r => r.key === role) || { label: role, color: 'bg-gray-100 text-gray-700', desc: '' };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium animate-bounce">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة فريق المنصة</h1>
          <p className="text-sm text-gray-500 mt-1">موظفو المنصة الداخليون فقط — الأطباء والصيادلة في صفحاتهم الخاصة</p>
        </div>
        <button onClick={() => { setEditUser(null); setShowAdd(true); }}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> إضافة عضو فريق
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الفريق', value: users.length, color: 'text-sky-600' },
          { label: 'نشط', value: users.filter(u => u.status === 'active').length, color: 'text-green-600' },
          { label: 'موقوف', value: users.filter(u => u.status === 'suspended').length, color: 'text-red-600' },
          { label: 'الأدوار', value: new Set(users.map(u => u.role)).size, color: 'text-purple-600' },
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
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد الإلكتروني..."
            className="bg-transparent flex-1 text-sm outline-none" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="all">كل الأدوار</option>
          {PLATFORM_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['عضو الفريق', 'الدور', 'الصلاحيات', 'الحالة', 'تاريخ الإضافة', 'إجراءات'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(user => {
                const roleInfo = getRoleInfo(user.role);
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-sky-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-sky-700 font-bold text-sm">{user.name[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{user.name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.color}`}>{roleInfo.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewPermissions(user)}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
                        <Shield className="w-3.5 h-3.5" />
                        {user.permissions.length} صلاحية
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleStatus(user.id)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${
                          user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {user.status === 'active' ? '● نشط' : '● موقوف'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{user.createdAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditUser(user); setShowAdd(true); }}
                          className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg" title="تعديل">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleStatus(user.id)}
                          className={`p-1.5 rounded-lg ${user.status === 'active' ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}
                          title={user.status === 'active' ? 'إيقاف' : 'تفعيل'}>
                          {user.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                        {user.role !== 'super_admin' && (
                          <button onClick={() => setConfirmDelete(user.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="حذف">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAdd || editUser) && (
        <UserFormModal
          user={editUser}
          roles={PLATFORM_ROLES}
          rolePermissions={ROLE_PERMISSIONS}
          permissionGroups={PERMISSION_GROUPS}
          onClose={() => { setShowAdd(false); setEditUser(null); }}
          onSave={saveUser}
        />
      )}

      {/* View Permissions Modal */}
      {viewPermissions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl">
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
              <button onClick={() => setViewPermissions(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              <div>
                <h2 className="font-bold text-gray-900">صلاحيات {viewPermissions.name}</h2>
                <p className="text-xs text-gray-500">{viewPermissions.permissions.length} صلاحية من أصل {PERMISSION_GROUPS.flatMap(g => g.permissions).length}</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {PERMISSION_GROUPS.map(group => {
                const groupPerms = group.permissions.filter(p => viewPermissions.permissions.includes(p.key));
                if (groupPerms.length === 0) return null;
                return (
                  <div key={group.group} className="bg-gray-50 rounded-xl p-4">
                    <p className="font-semibold text-gray-800 text-sm mb-3">{group.group}</p>
                    <div className="flex flex-wrap gap-2">
                      {groupPerms.map(p => (
                        <span key={p.key} className="text-xs bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full">{p.label}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-5 border-t">
              <button onClick={() => { setEditUser(viewPermissions); setViewPermissions(null); setShowAdd(true); }}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm">
                تعديل الصلاحيات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h2>
            <p className="text-gray-500 text-sm mb-5">هل أنت متأكد من حذف هذا المستخدم؟ سيفقد جميع صلاحياته.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={() => deleteUser(confirmDelete)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl text-sm">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── USER FORM MODAL ─────────────────────────────────────────────────────────
function UserFormModal({ user, roles, rolePermissions, permissionGroups, onClose, onSave }: any) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState(user?.role || 'assistant');
  const [permissions, setPermissions] = useState<string[]>(user?.permissions || rolePermissions.assistant);

  const applyRole = (role: string) => {
    setSelectedRole(role);
    setPermissions(rolePermissions[role] || []);
  };

  const toggle = (key: string) => {
    setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const handleSave = () => {
    if (!name.trim() || !email.trim()) return alert('الاسم والبريد الإلكتروني مطلوبان');
    onSave({ id: user?.id || '', name, email, role: selectedRole, permissions, status: user?.status || 'active', createdAt: user?.createdAt || '' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          <h2 className="text-lg font-bold text-gray-900">{user ? 'تعديل عضو الفريق' : 'إضافة عضو فريق جديد'}</h2>
        </div>

        <div className="p-5 space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="أحمد محمد" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني *</label>
              <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="ahmed@mediflow.io" />
            </div>
            {!user && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور *</label>
                <input type="password" dir="ltr" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="••••••••" />
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">الدور الوظيفي</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {roles.map((role: any) => (
                <button key={role.key} onClick={() => applyRole(role.key)}
                  className={`p-3 rounded-xl text-xs font-medium border-2 transition-all text-right ${
                    selectedRole === role.key ? `${role.color} border-current` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <div className="font-bold">{role.label}</div>
                  <div className="text-gray-500 font-normal mt-0.5 text-xs leading-tight">{role.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-sky-600 bg-sky-50 px-3 py-1 rounded-full font-medium">{permissions.length} صلاحية محددة</span>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-500" /> الصلاحيات التفصيلية
              </label>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {permissionGroups.map((group: any) => (
                <div key={group.group} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => {
                      const keys = group.permissions.map((p: any) => p.key);
                      const all = keys.every((k: string) => permissions.includes(k));
                      setPermissions(prev => all ? prev.filter(p => !keys.includes(p)) : Array.from(new Set([...prev, ...keys])));
                    }} className="text-xs text-sky-600 hover:underline">
                      {group.permissions.every((p: any) => permissions.includes(p.key)) ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                    <p className="font-semibold text-gray-800 text-sm">{group.group}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.permissions.map((perm: any) => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer flex-row-reverse justify-end">
                        <span className="text-sm text-gray-700">{perm.label}</span>
                        <input type="checkbox"
                          checked={permissions.includes(perm.key)}
                          onChange={() => toggle(perm.key)}
                          className="w-4 h-4 rounded accent-sky-500 cursor-pointer" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 border-t flex gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            إلغاء
          </button>
          <button onClick={handleSave}
            className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {user ? 'حفظ التغييرات' : 'إضافة للفريق'}
          </button>
        </div>
      </div>
    </div>
  );
}
