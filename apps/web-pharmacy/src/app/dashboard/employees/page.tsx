'use client';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff, UserCog } from 'lucide-react';

const PERMISSION_GROUPS = [
  {
    group: 'الطلبات',
    permissions: [
      { key: 'orders:read', label: 'عرض الطلبات' },
      { key: 'orders:manage', label: 'قبول/رفض الطلبات' },
      { key: 'orders:dispatch', label: 'إرسال الطلبات' },
      { key: 'orders:cancel', label: 'إلغاء الطلبات' },
    ],
  },
  {
    group: 'المخزون',
    permissions: [
      { key: 'inventory:read', label: 'عرض المخزون' },
      { key: 'inventory:write', label: 'تعديل المخزون' },
      { key: 'inventory:delete', label: 'حذف من المخزون' },
    ],
  },
  {
    group: 'الوصفات الطبية',
    permissions: [
      { key: 'prescriptions:verify', label: 'التحقق من الوصفات' },
      { key: 'prescriptions:dispense', label: 'صرف الوصفات' },
    ],
  },
  {
    group: 'العملاء',
    permissions: [
      { key: 'customers:read', label: 'عرض العملاء' },
      { key: 'customers:contact', label: 'التواصل مع العملاء' },
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
    group: 'التقارير',
    permissions: [
      { key: 'reports:read', label: 'عرض التقارير' },
      { key: 'reports:export', label: 'تصدير التقارير' },
    ],
  },
  {
    group: 'الإعدادات والموظفون',
    permissions: [
      { key: 'settings:read', label: 'عرض الإعدادات' },
      { key: 'settings:write', label: 'تعديل الإعدادات' },
      { key: 'employees:read', label: 'عرض الموظفين' },
      { key: 'employees:manage', label: 'إضافة/تعديل الموظفين' },
    ],
  },
];

const ROLE_PRESETS: Record<string, string[]> = {
  assistant_manager: [
    'orders:read','orders:manage','orders:dispatch','orders:cancel',
    'inventory:read','inventory:write',
    'prescriptions:verify','prescriptions:dispense',
    'customers:read','customers:contact',
    'campaigns:read','campaigns:create',
    'reports:read','reports:export',
    'settings:read','employees:read','employees:manage',
  ],
  manager: [
    'orders:read','orders:manage','orders:dispatch','orders:cancel',
    'inventory:read','inventory:write','inventory:delete',
    'prescriptions:verify','prescriptions:dispense',
    'customers:read','customers:contact',
    'campaigns:read','campaigns:create','campaigns:delete',
    'reports:read','reports:export',
    'settings:read','settings:write','employees:read','employees:manage',
  ],
  pharmacist: [
    'orders:read','orders:manage','orders:dispatch',
    'inventory:read','inventory:write',
    'prescriptions:verify','prescriptions:dispense',
    'customers:read','customers:contact','reports:read',
  ],
  cashier: ['orders:read','orders:manage','customers:read','customers:contact'],
  inventory_clerk: ['inventory:read','inventory:write','orders:read'],
  receptionist: ['orders:read','customers:read','customers:contact'],
  viewer: ['orders:read','inventory:read','reports:read'],
};

const ROLE_LABELS: Record<string, { label: string; badge: string }> = {
  assistant_manager: { label: 'مدير مساعد', badge: 'bg-purple-100 text-purple-700' },
  manager: { label: 'مدير الصيدلية', badge: 'bg-sky-100 text-sky-700' },
  pharmacist: { label: 'صيدلاني', badge: 'bg-teal-100 text-teal-700' },
  cashier: { label: 'كاشير', badge: 'bg-amber-100 text-amber-700' },
  inventory_clerk: { label: 'موظف مخزون', badge: 'bg-indigo-100 text-indigo-700' },
  receptionist: { label: 'موظف استقبال', badge: 'bg-pink-100 text-pink-700' },
  viewer: { label: 'مشاهد فقط', badge: 'bg-gray-100 text-gray-600' },
  custom: { label: 'مخصص', badge: 'bg-orange-100 text-orange-700' },
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
  { id: '1', name: 'حسن الموسى', email: 'hassan@pharmacy.iq', role: 'pharmacist', permissions: ROLE_PRESETS.pharmacist, status: 'active', addedAt: '2026-06-01' },
  { id: '2', name: 'مريم علي', email: 'mariam@pharmacy.iq', role: 'assistant_manager', permissions: ROLE_PRESETS.assistant_manager, status: 'active', addedAt: '2026-06-05' },
  { id: '3', name: 'كريم جابر', email: 'kareem@pharmacy.iq', role: 'cashier', permissions: ROLE_PRESETS.cashier, status: 'active', addedAt: '2026-06-12' },
];

export default function PharmacyEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الموظفين والصلاحيات</h1>
        <button onClick={() => { setEditEmp(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> إضافة موظف
        </button>
      </div>

      {/* Role Legend */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <UserCog className="w-5 h-5 text-sky-500" /> الأدوار المتاحة
        </h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'custom').map(([key, val]) => (
            <span key={key} className={`text-xs font-medium px-3 py-1.5 rounded-full ${val.badge}`}>
              {val.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">يمكنك اختيار دور جاهز أو تخصيص الصلاحيات يدوياً لكل موظف</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'إجمالي الموظفين', value: employees.length },
          { label: 'نشط', value: employees.filter(e => e.status === 'active').length },
          { label: 'موقوف', value: employees.filter(e => e.status === 'suspended').length },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-sky-600">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
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
            {employees.map(emp => {
              const roleInfo = ROLE_LABELS[emp.role] || ROLE_LABELS.custom;
              return (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-sky-100 rounded-full flex items-center justify-center">
                        <span className="text-sky-700 font-bold text-sm">{emp.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{emp.name}</p>
                        <p className="text-xs text-gray-500">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.badge}`}>
                      {roleInfo.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-600 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" />{emp.permissions.length} صلاحية
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {emp.status === 'active' ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
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
          onSave={(emp) => {
            if (editEmp) setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
            else setEmployees(prev => [...prev, { ...emp, id: Date.now().toString(), status: 'active', addedAt: new Date().toISOString().split('T')[0] }]);
            setShowModal(false); setEditEmp(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ employee, onClose, onSave }: { employee: Employee | null; onClose: () => void; onSave: (e: Employee) => void }) {
  const [name, setName] = useState(employee?.name || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState(employee?.role || 'pharmacist');
  const [permissions, setPermissions] = useState<string[]>(employee?.permissions || ROLE_PRESETS.pharmacist);

  const applyPreset = (role: string) => {
    setSelectedRole(role);
    if (role !== 'custom') setPermissions(ROLE_PRESETS[role] || []);
  };

  const toggle = (key: string) => {
    setSelectedRole('custom');
    setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900">{employee ? 'تعديل موظف' : 'إضافة موظف جديد'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="محمد أحمد" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني *</label>
              <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="employee@pharmacy.iq" required />
            </div>
            {!employee && (
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'custom').map(([key, val]) => (
                <button key={key} onClick={() => applyPreset(key)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all text-right ${
                    selectedRole === key ? `${val.badge} border-current` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {val.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">اختر دوراً لتطبيق الصلاحيات تلقائياً، أو خصص الصلاحيات يدوياً أدناه</p>
          </div>

          {/* Permissions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-sky-600 font-medium">{permissions.length} صلاحية محددة</span>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-500" /> الصلاحيات التفصيلية
              </label>
            </div>
            <div className="space-y-3">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.group} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => {
                      const allKeys = group.permissions.map(p => p.key);
                      const allSelected = allKeys.every(k => permissions.includes(k));
                      if (allSelected) setPermissions(prev => prev.filter(p => !allKeys.includes(p)));
                      else setPermissions(prev => [...new Set([...prev, ...allKeys])]);
                      setSelectedRole('custom');
                    }} className="text-xs text-sky-600 hover:underline">
                      {group.permissions.every(p => permissions.includes(p.key)) ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                    <p className="font-semibold text-gray-800 text-sm">{group.group}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.permissions.map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer flex-row-reverse justify-end">
                        <span className="text-sm text-gray-700">{perm.label}</span>
                        <input type="checkbox"
                          checked={permissions.includes(perm.key)}
                          onChange={() => toggle(perm.key)}
                          className="w-4 h-4 rounded cursor-pointer accent-sky-500" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            إلغاء
          </button>
          <button onClick={() => {
            if (!name || !email) return alert('يرجى ملء الاسم والبريد الإلكتروني');
            onSave({ id: employee?.id || '', name, email, role: selectedRole, permissions, status: employee?.status || 'active', addedAt: employee?.addedAt || new Date().toISOString().split('T')[0] });
          }}
            className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {employee ? 'حفظ التغييرات' : 'إضافة الموظف'}
          </button>
        </div>
      </div>
    </div>
  );
}
