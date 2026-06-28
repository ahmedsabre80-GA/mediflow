'use client';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff, UserCog, Copy, CheckCircle } from 'lucide-react';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

const PERMISSION_GROUPS = [
  { group: 'الطلبات', permissions: [{ key: 'orders:read', label: 'عرض الطلبات' }, { key: 'orders:manage', label: 'قبول/رفض الطلبات' }, { key: 'orders:dispatch', label: 'إرسال الطلبات' }, { key: 'orders:cancel', label: 'إلغاء الطلبات' }] },
  { group: 'المخزون', permissions: [{ key: 'inventory:read', label: 'عرض المخزون' }, { key: 'inventory:write', label: 'تعديل المخزون' }, { key: 'inventory:delete', label: 'حذف من المخزون' }] },
  { group: 'الوصفات الطبية', permissions: [{ key: 'prescriptions:verify', label: 'التحقق من الوصفات' }, { key: 'prescriptions:dispense', label: 'صرف الوصفات' }] },
  { group: 'العملاء', permissions: [{ key: 'customers:read', label: 'عرض العملاء' }, { key: 'customers:contact', label: 'التواصل مع العملاء' }] },
  { group: 'التقارير', permissions: [{ key: 'reports:read', label: 'عرض التقارير' }, { key: 'reports:export', label: 'تصدير التقارير' }] },
  { group: 'الإعدادات والموظفون', permissions: [{ key: 'settings:read', label: 'عرض الإعدادات' }, { key: 'employees:read', label: 'عرض الموظفين' }, { key: 'employees:manage', label: 'إضافة/تعديل الموظفين' }] },
];

const ROLE_PRESETS: Record<string, string[]> = {
  assistant_manager: ['orders:read','orders:manage','orders:dispatch','orders:cancel','inventory:read','inventory:write','prescriptions:verify','prescriptions:dispense','customers:read','customers:contact','reports:read','reports:export','settings:read','employees:read','employees:manage'],
  pharmacist: ['orders:read','orders:manage','orders:dispatch','inventory:read','inventory:write','prescriptions:verify','prescriptions:dispense','customers:read','customers:contact','reports:read'],
  cashier: ['orders:read','orders:manage','customers:read','customers:contact'],
  inventory_clerk: ['inventory:read','inventory:write','orders:read'],
  receptionist: ['orders:read','customers:read','customers:contact'],
  viewer: ['orders:read','inventory:read','reports:read'],
};

const ROLE_LABELS: Record<string, { label: string; badge: string }> = {
  assistant_manager: { label: 'مدير مساعد', badge: 'bg-purple-100 text-purple-700' },
  pharmacist: { label: 'صيدلاني', badge: 'bg-teal-100 text-teal-700' },
  cashier: { label: 'كاشير', badge: 'bg-amber-100 text-amber-700' },
  inventory_clerk: { label: 'موظف مخزون', badge: 'bg-indigo-100 text-indigo-700' },
  receptionist: { label: 'موظف استقبال', badge: 'bg-pink-100 text-pink-700' },
  viewer: { label: 'مشاهد فقط', badge: 'bg-gray-100 text-gray-600' },
};

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

interface Employee { id: string; name: string; email: string; role: string; permissions: string[]; status: 'active' | 'suspended'; addedAt: string; }

export default function PharmacyEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الموظفين والصلاحيات</h1>
        <button onClick={() => { setEditEmp(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> إضافة موظف
        </button>
      </div>

      {/* Credentials modal shown after adding */}
      {credentials && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">تم إنشاء الحساب</h2>
            <p className="text-sm text-gray-500 mb-5">احفظ بيانات الدخول وأرسلها للموظف</p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-right mb-5">
              <div className="flex items-center justify-between">
                <button onClick={() => navigator.clipboard?.writeText(credentials.email)} className="text-sky-600"><Copy className="w-4 h-4" /></button>
                <div><p className="text-xs text-gray-500">البريد الإلكتروني</p><p className="font-mono text-sm font-bold text-gray-900" dir="ltr">{credentials.email}</p></div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <button onClick={() => navigator.clipboard?.writeText(credentials.password)} className="text-sky-600"><Copy className="w-4 h-4" /></button>
                <div><p className="text-xs text-gray-500">كلمة المرور</p><p className="font-mono text-sm font-bold text-gray-900" dir="ltr">{credentials.password}</p></div>
              </div>
            </div>
            <p className="text-xs text-red-500 mb-4">⚠️ لن تتمكن من رؤية كلمة المرور مرة أخرى</p>
            <button onClick={() => setCredentials(null)}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm">
              حسناً، تم الحفظ
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[{ label: 'إجمالي الموظفين', value: employees.length }, { label: 'نشط', value: employees.filter(e => e.status === 'active').length }, { label: 'موقوف', value: employees.filter(e => e.status === 'suspended').length }].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-sky-600">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>{['الموظف', 'الدور', 'الصلاحيات', 'الحالة', 'الإجراءات'].map(h => <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">لا يوجد موظفون — اضغط "إضافة موظف" للبدء</td></tr>
            ) : employees.map(emp => {
              const roleInfo = ROLE_LABELS[emp.role] || { label: emp.role, badge: 'bg-gray-100 text-gray-700' };
              return (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-sky-100 rounded-full flex items-center justify-center"><span className="text-sky-700 font-bold text-sm">{emp.name[0]}</span></div>
                      <div><p className="font-medium text-gray-900 text-sm">{emp.name}</p><p className="text-xs text-gray-500">{emp.email}</p></div>
                    </div>
                  </td>
                  <td className="px-6 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.badge}`}>{roleInfo.label}</span></td>
                  <td className="px-6 py-4"><span className="text-xs text-gray-600 flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{emp.permissions.length} صلاحية</span></td>
                  <td className="px-6 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-full ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{emp.status === 'active' ? 'نشط' : 'موقوف'}</span></td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => { setEditEmp(emp); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-gray-100"><Edit2 className="w-4 h-4 text-gray-600" /></button>
                      <button onClick={() => setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: e.status === 'active' ? 'suspended' : 'active' } : e))} className="p-1.5 rounded-lg hover:bg-gray-100">
                        {emp.status === 'active' ? <EyeOff className="w-4 h-4 text-amber-600" /> : <Eye className="w-4 h-4 text-green-600" />}
                      </button>
                      <button onClick={() => setEmployees(prev => prev.filter(e => e.id !== emp.id))} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <EmployeeModal
          employee={editEmp}
          onClose={() => { setShowModal(false); setEditEmp(null); }}
          onSave={(emp, creds) => {
            if (editEmp) setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
            else { setEmployees(prev => [...prev, emp]); if (creds) setCredentials(creds); }
            setShowModal(false); setEditEmp(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ employee, onClose, onSave }: {
  employee: Employee | null;
  onClose: () => void;
  onSave: (e: Employee, creds?: { name: string; email: string; password: string }) => void;
}) {
  const [name, setName] = useState(employee?.name || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [password, setPassword] = useState(generatePassword());
  const [showPass, setShowPass] = useState(true);
  const [selectedRole, setSelectedRole] = useState(employee?.role || 'pharmacist');
  const [permissions, setPermissions] = useState<string[]>(employee?.permissions || ROLE_PRESETS.pharmacist);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = (role: string) => { setSelectedRole(role); if (ROLE_PRESETS[role]) setPermissions(ROLE_PRESETS[role]); };
  const toggle = (key: string) => { setSelectedRole('custom'); setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]); };

  const handleSave = async () => {
    if (!name || !email) { setError('الاسم والبريد الإلكتروني مطلوبان'); return; }
    if (!employee && (!password || password.length < 8)) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    setLoading(true); setError('');
    try {
      if (!employee) {
        const parts = name.trim().split(' ');
        const res = await fetch(`${AUTH_API}/auth/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: parts[0], lastName: parts.slice(1).join(' ') || parts[0], email, password, role: 'pharmacy_employee' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');
        const newEmp: Employee = { id: data.data?.userId || Date.now().toString(), name, email, role: selectedRole, permissions, status: 'active', addedAt: new Date().toISOString().split('T')[0] };
        onSave(newEmp, { name, email, password });
      } else {
        onSave({ ...employee, name, email, role: selectedRole, permissions });
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{employee ? 'تعديل موظف' : 'إضافة موظف جديد'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل *</label>
              <input dir="auto" value={name} onChange={e => setName(e.target.value)} placeholder="محمد أحمد"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني * <span className="text-gray-400 font-normal">(اسم المستخدم)</span></label>
              <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} placeholder="employee@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-left" />
            </div>
            {!employee && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور *</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input type={showPass ? 'text' : 'password'} dir="ltr" value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-left pr-10" />
                    <button type="button" onClick={() => setShowPass(v => !v)} className="absolute left-3 top-3.5 text-gray-400">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button type="button" onClick={() => setPassword(generatePassword())}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 whitespace-nowrap">
                    توليد تلقائي
                  </button>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(password)}
                    className="px-3 py-2 bg-sky-50 hover:bg-sky-100 rounded-xl text-sky-600">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">البريد + كلمة المرور هي بيانات دخول الموظف — احفظها وأرسلها له</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">الدور الوظيفي</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(ROLE_LABELS).map(([key, val]) => (
                <button key={key} onClick={() => applyPreset(key)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all text-right ${selectedRole === key ? `${val.badge} border-current` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-sky-600 font-medium">{permissions.length} صلاحية محددة</span>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Shield className="w-4 h-4 text-gray-500" /> الصلاحيات</label>
            </div>
            <div className="space-y-3">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.group} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => { const keys = group.permissions.map(p => p.key); const all = keys.every(k => permissions.includes(k)); setPermissions(prev => all ? prev.filter(p => !keys.includes(p)) : Array.from(new Set([...prev, ...keys]))); setSelectedRole('custom'); }} className="text-xs text-sky-600 hover:underline">
                      {group.permissions.every(p => permissions.includes(p.key)) ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                    <p className="font-semibold text-gray-800 text-sm">{group.group}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.permissions.map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer flex-row-reverse justify-end">
                        <span className="text-sm text-gray-700">{perm.label}</span>
                        <input type="checkbox" checked={permissions.includes(perm.key)} onChange={() => toggle(perm.key)} className="w-4 h-4 rounded cursor-pointer accent-sky-500" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {employee ? 'حفظ التغييرات' : 'إضافة وإنشاء حساب'}
          </button>
        </div>
      </div>
    </div>
  );
}
