'use client';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff } from 'lucide-react';

const PERMISSION_GROUPS = [
  {
    group: 'المواعيد',
    permissions: [
      { key: 'appointments:read', label: 'عرض المواعيد' },
      { key: 'appointments:manage', label: 'إدارة المواعيد' },
      { key: 'appointments:cancel', label: 'إلغاء المواعيد' },
    ],
  },
  {
    group: 'الوصفات الطبية',
    permissions: [
      { key: 'prescriptions:read', label: 'عرض الوصفات' },
      { key: 'prescriptions:create', label: 'إصدار وصفات' },
    ],
  },
  {
    group: 'المرضى',
    permissions: [
      { key: 'patients:read', label: 'عرض بيانات المرضى' },
      { key: 'patients:contact', label: 'التواصل مع المرضى' },
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
    group: 'الإعدادات',
    permissions: [
      { key: 'settings:read', label: 'عرض الإعدادات' },
      { key: 'settings:write', label: 'تعديل الإعدادات' },
    ],
  },
];

const ROLE_PRESETS: Record<string, string[]> = {
  assistant_manager: ['appointments:read', 'appointments:manage', 'appointments:cancel', 'patients:read', 'patients:contact', 'prescriptions:read', 'reports:read', 'reports:export', 'settings:read', 'employees:read', 'employees:manage'],
  assistant: ['appointments:read', 'appointments:manage', 'patients:read', 'patients:contact', 'reports:read'],
  receptionist: ['appointments:read', 'appointments:manage', 'appointments:cancel', 'patients:read', 'patients:contact'],
  nurse: ['appointments:read', 'patients:read', 'patients:contact', 'prescriptions:read'],
  viewer: ['appointments:read', 'patients:read'],
};

const ROLE_LABELS: Record<string, string> = {
  assistant_manager: 'مدير مساعد',
  assistant: 'مساعد طبيب',
  receptionist: 'موظف استقبال',
  nurse: 'ممرض/ممرضة',
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
  { id: '1', name: 'نور الهدى', email: 'nour@clinic.iq', role: 'assistant', permissions: ROLE_PRESETS.assistant, status: 'active', addedAt: '2026-06-01' },
  { id: '2', name: 'أحمد سعيد', email: 'ahmed@clinic.iq', role: 'receptionist', permissions: ROLE_PRESETS.receptionist, status: 'active', addedAt: '2026-06-10' },
];

export default function DoctorEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الموظفين والصلاحيات</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> إضافة موظف
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'إجمالي الموظفين', value: employees.length },
          { label: 'نشط', value: employees.filter(e => e.status === 'active').length },
          { label: 'موقوف', value: employees.filter(e => e.status === 'suspended').length },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-teal-600">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

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
                    <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center">
                      <span className="text-teal-700 font-bold text-sm">{emp.name[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{emp.name}</p>
                      <p className="text-xs text-gray-500">{emp.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-100 text-teal-700">
                    {ROLE_LABELS[emp.role] || emp.role}
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
            ))}
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
  const [selectedRole, setSelectedRole] = useState(employee?.role || 'viewer');
  const [permissions, setPermissions] = useState<string[]>(employee?.permissions || ROLE_PRESETS.viewer);

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
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{employee ? 'تعديل موظف' : 'إضافة موظف جديد'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">الدور الوظيفي</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => applyPreset(key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${selectedRole === key ? 'bg-teal-500 text-white border-teal-500' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" /> الصلاحيات ({permissions.length} محددة)
            </label>
            <div className="space-y-3">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.group} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-gray-800 text-sm mb-3">{group.group}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.permissions.map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer flex-row-reverse justify-end">
                        <span className="text-sm text-gray-700">{perm.label}</span>
                        <input type="checkbox" checked={permissions.includes(perm.key)} onChange={() => toggle(perm.key)} className="w-4 h-4 rounded accent-teal-500" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
          <button onClick={() => { if (!name || !email) return; onSave({ id: employee?.id || '', name, email, role: selectedRole, permissions, status: employee?.status || 'active', addedAt: employee?.addedAt || new Date().toISOString().split('T')[0] }); }}
            className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm">
            {employee ? 'حفظ التغييرات' : 'إضافة الموظف'}
          </button>
        </div>
      </div>
    </div>
  );
}
