'use client';
import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff } from 'lucide-react';
import { loadConfig } from '@/lib/config';

// ─── PERMISSION DEFINITIONS ──────────────────────────────────────────────────
const PERMISSION_GROUPS = [
  {
    group: 'المخزون',
    permissions: [
      { key: 'inventory:read', label: 'عرض المخزون' },
      { key: 'inventory:write', label: 'تعديل المخزون' },
      { key: 'inventory:delete', label: 'حذف من المخزون' },
    ],
  },
  {
    group: 'الطلبات B2B',
    permissions: [
      { key: 'orders:read', label: 'عرض الطلبات' },
      { key: 'orders:confirm', label: 'قبول/رفض الطلبات' },
      { key: 'orders:dispatch', label: 'إرسال الشحنات' },
    ],
  },
  {
    group: 'الحملات الإعلانية',
    permissions: [
      { key: 'campaigns:read', label: 'عرض الحملات' },
      { key: 'campaigns:create', label: 'إنشاء حملات' },
      { key: 'campaigns:delete', label: 'حذف الحملات' },
    ],
  },
  {
    group: 'التقارير والتحليلات',
    permissions: [
      { key: 'analytics:read', label: 'عرض التحليلات' },
      { key: 'reports:export', label: 'تصدير التقارير' },
    ],
  },
  {
    group: 'إدارة الموظفين',
    permissions: [
      { key: 'employees:read', label: 'عرض الموظفين' },
      { key: 'employees:manage', label: 'إضافة/تعديل الموظفين' },
    ],
  },
  {
    group: 'الإعدادات',
    permissions: [
      { key: 'settings:read', label: 'عرض الإعدادات' },
      { key: 'settings:write', label: 'تعديل الإعدادات' },
    ],
  },
];

// Preset roles
const ROLE_PRESETS: Record<string, string[]> = {
  assistant_manager: [
    'inventory:read', 'inventory:write', 'orders:read', 'orders:confirm', 'orders:dispatch',
    'campaigns:read', 'campaigns:create', 'analytics:read', 'reports:export',
    'employees:read', 'settings:read',
  ],
  manager: [
    'inventory:read', 'inventory:write', 'orders:read', 'orders:confirm', 'orders:dispatch',
    'campaigns:read', 'campaigns:create', 'analytics:read', 'reports:export',
    'employees:read', 'employees:manage', 'settings:read', 'settings:write',
  ],
  supervisor: [
    'inventory:read', 'inventory:write', 'orders:read', 'orders:confirm', 'orders:dispatch',
    'campaigns:read', 'analytics:read',
  ],
  inventory_staff: [
    'inventory:read', 'inventory:write', 'orders:read',
  ],
  sales_rep: [
    'orders:read', 'orders:confirm', 'campaigns:read', 'campaigns:create', 'analytics:read',
  ],
  viewer: ['inventory:read', 'orders:read', 'analytics:read'],
};

const ROLE_LABELS: Record<string, string> = {
  assistant_manager: 'مدير مساعد',
  manager: 'مدير',
  supervisor: 'مشرف',
  inventory_staff: 'موظف مخزون',
  sales_rep: 'مندوب مبيعات',
  viewer: 'مشاهد فقط',
  custom: 'مخصص',
};

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  status: 'active' | 'suspended';
  addedAt: string;
}

const MOCK_EMPLOYEES: Employee[] = [
  { id: '1', name: 'محمد الراوي', email: 'mohammed@warehouse.iq', role: 'manager', permissions: ROLE_PRESETS.manager, status: 'active', addedAt: '2026-06-01' },
  { id: '2', name: 'سارة أحمد', email: 'sara@warehouse.iq', role: 'inventory_staff', permissions: ROLE_PRESETS.inventory_staff, status: 'active', addedAt: '2026-06-10' },
  { id: '3', name: 'علي حسن', email: 'ali@warehouse.iq', role: 'sales_rep', permissions: ROLE_PRESETS.sales_rep, status: 'suspended', addedAt: '2026-06-15' },
];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => setConfig(loadConfig()), []);

  const primary = config?.primaryColor || '#f59e0b';

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الموظفين والصلاحيات</h1>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: primary }}>
          <Plus className="w-4 h-4" /> إضافة موظف
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'إجمالي الموظفين', value: employees.length },
          { label: 'نشط', value: employees.filter(e => e.status === 'active').length },
          { label: 'موقوف', value: employees.filter(e => e.status === 'suspended').length },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['الموظف', 'الدور', 'الصلاحيات', 'الحالة', 'الإجراءات'].map(h => (
                <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: primary }}>
                      {emp.name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{emp.name}</p>
                      <p className="text-xs text-gray-500 dir-ltr">{emp.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${primary}20`, color: primary }}>
                    {ROLE_LABELS[emp.role] || emp.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs text-gray-600 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" />
                    {emp.permissions.length} صلاحية
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {emp.status === 'active' ? 'نشط' : 'موقوف'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button onClick={() => setEditEmployee(emp)}
                      className="p-1.5 rounded-lg hover:bg-gray-100" title="تعديل الصلاحيات">
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    <button onClick={() => setEmployees(prev => prev.map(e =>
                      e.id === emp.id ? { ...e, status: e.status === 'active' ? 'suspended' : 'active' } : e
                    ))} className="p-1.5 rounded-lg hover:bg-gray-100" title="تفعيل/إيقاف">
                      {emp.status === 'active'
                        ? <EyeOff className="w-4 h-4 text-amber-600" />
                        : <Eye className="w-4 h-4 text-green-600" />}
                    </button>
                    <button onClick={() => setEmployees(prev => prev.filter(e => e.id !== emp.id))}
                      className="p-1.5 rounded-lg hover:bg-red-50" title="حذف">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editEmployee) && (
        <EmployeeModal
          employee={editEmployee}
          primary={primary}
          onClose={() => { setShowAddModal(false); setEditEmployee(null); }}
          onSave={(emp) => {
            if (editEmployee) {
              setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
            } else {
              setEmployees(prev => [...prev, { ...emp, id: Date.now().toString(), status: 'active', addedAt: new Date().toISOString().split('T')[0] }]);
            }
            setShowAddModal(false);
            setEditEmployee(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ employee, primary, onClose, onSave }: {
  employee: Employee | null;
  primary: string;
  onClose: () => void;
  onSave: (emp: Employee) => void;
}) {
  const [name, setName] = useState(employee?.name || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState(employee?.role || 'viewer');
  const [permissions, setPermissions] = useState<string[]>(employee?.permissions || ROLE_PRESETS.viewer);

  const applyPreset = (role: string) => {
    setSelectedRole(role);
    if (role !== 'custom') setPermissions(ROLE_PRESETS[role] || []);
  };

  const togglePermission = (key: string) => {
    setSelectedRole('custom');
    setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const handleSave = () => {
    if (!name || !email) { alert('يرجى ملء الاسم والبريد الإلكتروني'); return; }
    onSave({
      id: employee?.id || '',
      name, email,
      role: selectedRole,
      permissions,
      status: employee?.status || 'active',
      addedAt: employee?.addedAt || new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {employee ? 'تعديل موظف' : 'إضافة موظف جديد'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                placeholder="محمد أحمد" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                placeholder="employee@warehouse.iq" />
            </div>
            {!employee && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
                <input type="password" dir="ltr" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2"
                  placeholder="••••••••" />
              </div>
            )}
          </div>

          {/* Role Presets */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">الدور الوظيفي</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => applyPreset(key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                    selectedRole === key ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  style={selectedRole === key ? { backgroundColor: primary, borderColor: primary } : {}}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">اختر دوراً لتطبيق الصلاحيات تلقائياً، أو خصص الصلاحيات يدوياً أدناه</p>
          </div>

          {/* Permissions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-gray-600" />
              <label className="text-sm font-medium text-gray-700">الصلاحيات ({permissions.length} محددة)</label>
            </div>
            <div className="space-y-4">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.group} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-gray-800 text-sm mb-3">{group.group}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.permissions.map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer flex-row-reverse justify-end">
                        <span className="text-sm text-gray-700">{perm.label}</span>
                        <input type="checkbox"
                          checked={permissions.includes(perm.key)}
                          onChange={() => togglePermission(perm.key)}
                          className="w-4 h-4 rounded cursor-pointer"
                          style={{ accentColor: primary }} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            إلغاء
          </button>
          <button onClick={handleSave}
            className="flex-1 text-white font-semibold py-3 rounded-xl text-sm transition-all hover:opacity-90"
            style={{ backgroundColor: primary }}>
            {employee ? 'حفظ التغييرات' : 'إضافة الموظف'}
          </button>
        </div>
      </div>
    </div>
  );
}
