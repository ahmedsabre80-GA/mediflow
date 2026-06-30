'use client';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff, Bell, ClipboardList, Send, UserPlus, UserMinus, CheckCircle } from 'lucide-react';
import { addLocalNotification } from '@/lib/portalNotifications';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const PERMISSION_GROUPS = [
  { group: 'المواعيد', permissions: [{ key: 'appointments:read', label: 'عرض' }, { key: 'appointments:manage', label: 'إدارة' }, { key: 'appointments:cancel', label: 'إلغاء' }] },
  { group: 'الوصفات', permissions: [{ key: 'prescriptions:read', label: 'عرض' }, { key: 'prescriptions:create', label: 'إصدار' }] },
  { group: 'المرضى', permissions: [{ key: 'patients:read', label: 'عرض البيانات' }, { key: 'patients:contact', label: 'تواصل' }] },
  { group: 'التقارير', permissions: [{ key: 'reports:read', label: 'عرض' }, { key: 'reports:export', label: 'تصدير' }] },
  { group: 'الإعدادات', permissions: [{ key: 'settings:read', label: 'عرض' }, { key: 'settings:write', label: 'تعديل' }] },
];

const ROLE_PRESETS: Record<string, string[]> = {
  assistant_manager: ['appointments:read','appointments:manage','appointments:cancel','patients:read','patients:contact','prescriptions:read','reports:read','reports:export','settings:read'],
  assistant: ['appointments:read','appointments:manage','patients:read','patients:contact','reports:read'],
  receptionist: ['appointments:read','appointments:manage','appointments:cancel','patients:read','patients:contact'],
  nurse: ['appointments:read','patients:read','patients:contact','prescriptions:read'],
  viewer: ['appointments:read','patients:read'],
};

const ROLE_LABELS: Record<string, { label: string; badge: string }> = {
  assistant_manager: { label: 'مدير مساعد', badge: 'bg-purple-100 text-purple-700' },
  assistant: { label: 'مساعد طبيب', badge: 'bg-teal-100 text-teal-700' },
  receptionist: { label: 'موظف استقبال', badge: 'bg-blue-100 text-blue-700' },
  nurse: { label: 'ممرض/ممرضة', badge: 'bg-pink-100 text-pink-700' },
  viewer: { label: 'مشاهد فقط', badge: 'bg-gray-100 text-gray-600' },
};

interface Employee { id: string; name: string; email: string; role: string; permissions: string[]; status: 'active' | 'suspended'; addedAt: string; }

const MOCK_EMPLOYEES: Employee[] = [
  { id: '1', name: 'نور الهدى', email: 'nour@clinic.iq', role: 'assistant', permissions: ROLE_PRESETS.assistant, status: 'active', addedAt: '2026-06-01' },
  { id: '2', name: 'أحمد سعيد', email: 'ahmed@clinic.iq', role: 'receptionist', permissions: ROLE_PRESETS.receptionist, status: 'active', addedAt: '2026-06-10' },
];

const ACTIVITY_LOG = [
  { id: '1', action: 'تسجيل دخول', user: 'نور الهدى', time: 'منذ 30 دقيقة' },
  { id: '2', action: 'إنشاء وصفة للمريض #204', user: 'نور الهدى', time: 'منذ ساعة' },
  { id: '3', action: 'حجز موعد جديد', user: 'أحمد سعيد', time: 'منذ ساعتين' },
  { id: '4', action: 'تسجيل خروج', user: 'أحمد سعيد', time: 'أمس 17:00' },
];

export default function DoctorEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [tab, setTab] = useState<'employees' | 'activity' | 'requests'>('employees');
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [notifTarget, setNotifTarget] = useState<Employee | null>(null);
  const [notifMsg, setNotifMsg] = useState('');
  const [showAdminReq, setShowAdminReq] = useState(false);
  const [reqType, setReqType] = useState<'add' | 'remove'>('add');
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqRole, setReqRole] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqSent, setReqSent] = useState(false);
  const [reqLoading, setReqLoading] = useState(false);

  const sendNotification = () => {
    if (!notifTarget || !notifMsg.trim()) return;
    addLocalNotification(notifMsg, 'الطبيب المسؤول');
    setNotifTarget(null); setNotifMsg('');
  };

  const submitAdminRequest = async () => {
    setReqLoading(true);
    try {
      await fetch(`${API}/admin-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalType: 'doctor', requesterId: 'doctor-owner', requesterName: 'الطبيب المسؤول', requesterEntity: 'العيادة', actionType: reqType === 'add' ? 'add_employee' : 'remove_employee', employeeName: reqName, employeeEmail: reqEmail, employeeRole: reqRole, reason: reqReason }),
      });
    } catch {}
    setReqSent(true); setReqLoading(false);
    setTimeout(() => { setShowAdminReq(false); setReqSent(false); setReqName(''); setReqEmail(''); setReqRole(''); setReqReason(''); }, 2000);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الموظفون وإدارة الصلاحيات</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowAdminReq(true); setReqType('add'); }}
            className="flex items-center gap-2 bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 px-3 py-2 rounded-xl text-sm font-medium">
            <ClipboardList className="w-4 h-4" /> طلب إلى الإدارة
          </button>
          <button onClick={() => { setEditEmp(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> إضافة موظف
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['employees', 'الموظفون'], ['activity', 'سجل النشاط'], ['requests', 'الطلبات']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'employees' && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[{ label: 'إجمالي الموظفين', value: employees.length }, { label: 'نشط', value: employees.filter(e => e.status === 'active').length }, { label: 'موقوف', value: employees.filter(e => e.status === 'suspended').length }].map(s => (
              <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-teal-600">{s.value}</p>
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
                {employees.map(emp => {
                  const roleInfo = ROLE_LABELS[emp.role] || { label: emp.role, badge: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center"><span className="text-teal-700 font-bold text-sm">{emp.name[0]}</span></div>
                          <div><p className="font-medium text-gray-900 text-sm">{emp.name}</p><p className="text-xs text-gray-500">{emp.email}</p></div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.badge}`}>{roleInfo.label}</span></td>
                      <td className="px-6 py-4"><span className="text-xs text-gray-600 flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{emp.permissions.length} صلاحية</span></td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-full ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{emp.status === 'active' ? 'نشط' : 'موقوف'}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => setNotifTarget(emp)} title="إرسال إشعار" className="p-1.5 rounded-lg hover:bg-teal-50"><Bell className="w-4 h-4 text-teal-500" /></button>
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
        </>
      )}

      {tab === 'activity' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold text-gray-900">سجل نشاط الموظفين</h2></div>
          <div className="divide-y">
            {ACTIVITY_LOG.map(log => (
              <div key={log.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <span className="text-xs text-gray-400">{log.time}</span>
                <div className="text-right"><p className="text-sm font-medium text-gray-900">{log.action}</p><p className="text-xs text-gray-500">{log.user}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <p className="text-gray-500 text-sm">استخدم زر "طلب إلى الإدارة" لإرسال طلبات إضافة أو حذف موظفين.</p>
        </div>
      )}

      {notifTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <h2 className="font-bold text-gray-900 mb-1">إرسال إشعار</h2>
            <p className="text-sm text-gray-500 mb-4">إلى: {notifTarget.name}</p>
            <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} rows={3} placeholder="اكتب رسالة الإشعار هنا..." className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setNotifTarget(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={sendNotification} className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"><Send className="w-4 h-4" /> إرسال</button>
            </div>
          </div>
        </div>
      )}

      {showAdminReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            {reqSent ? (
              <div className="text-center py-4"><CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" /><p className="font-bold text-gray-900">تم إرسال الطلب للإدارة</p></div>
            ) : (
              <>
                <h2 className="font-bold text-gray-900 mb-4">طلب إلى إدارة المنصة</h2>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setReqType('add')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 ${reqType === 'add' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600'}`}><UserPlus className="w-4 h-4" /> إضافة</button>
                  <button onClick={() => setReqType('remove')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 ${reqType === 'remove' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}><UserMinus className="w-4 h-4" /> حذف</button>
                </div>
                <div className="space-y-3">
                  <input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="اسم الموظف *" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  <input type="email" dir="ltr" value={reqEmail} onChange={e => setReqEmail(e.target.value)} placeholder="البريد الإلكتروني *" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-left" />
                  <input value={reqRole} onChange={e => setReqRole(e.target.value)} placeholder="الدور الوظيفي" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  <textarea value={reqReason} onChange={e => setReqReason(e.target.value)} rows={2} placeholder="سبب الطلب" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setShowAdminReq(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
                  <button onClick={submitAdminRequest} disabled={reqLoading || !reqName || !reqEmail}
                    className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                    {reqLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    إرسال الطلب
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <EmployeeModal
          employee={editEmp}
          onClose={() => { setShowModal(false); setEditEmp(null); }}
          onSave={(emp) => {
            if (editEmp) setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
            else setEmployees(prev => [...prev, emp]);
            setShowModal(false); setEditEmp(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ employee, onClose, onSave }: { employee: Employee | null; onClose: () => void; onSave: (e: Employee) => void; }) {
  const [name, setName] = useState(employee?.name || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [selectedRole, setSelectedRole] = useState(employee?.role || 'viewer');
  const [permissions, setPermissions] = useState<string[]>(employee?.permissions || ROLE_PRESETS.viewer);

  const applyPreset = (role: string) => { setSelectedRole(role); if (ROLE_PRESETS[role]) setPermissions(ROLE_PRESETS[role]); };
  const toggle = (key: string) => { setSelectedRole('custom'); setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{employee ? 'تعديل موظف' : 'إضافة موظف جديد'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل *</label>
              <input dir="auto" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني *</label>
              <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-left" />
            </div>
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
              <span className="text-xs text-teal-600 font-medium">{permissions.length} صلاحية محددة</span>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Shield className="w-4 h-4 text-gray-500" /> الصلاحيات</label>
            </div>
            <div className="space-y-3">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.group} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-gray-800 text-sm mb-3">{group.group}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.permissions.map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer flex-row-reverse justify-end">
                        <span className="text-sm text-gray-700">{perm.label}</span>
                        <input type="checkbox" checked={permissions.includes(perm.key)} onChange={() => toggle(perm.key)} className="w-4 h-4 rounded cursor-pointer accent-teal-500" />
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
          <button onClick={() => { if (!name || !email) return; onSave({ id: employee?.id || Date.now().toString(), name, email, role: selectedRole, permissions, status: employee?.status || 'active', addedAt: employee?.addedAt || new Date().toISOString().split('T')[0] }); }}
            className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm">
            {employee ? 'حفظ التغييرات' : 'إضافة الموظف'}
          </button>
        </div>
      </div>
    </div>
  );
}
