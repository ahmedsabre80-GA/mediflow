'use client';
import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff, Bell, ClipboardList, Send, UserPlus, UserMinus, CheckCircle, Lock } from 'lucide-react';
import { addLocalNotification } from '@/lib/portalNotifications';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const PERMISSION_GROUPS = [
  { group: 'المخزون', permissions: [{ key: 'inventory:read', label: 'عرض المخزون' }, { key: 'inventory:write', label: 'تعديل' }, { key: 'inventory:delete', label: 'حذف' }] },
  { group: 'الطلبات B2B', permissions: [{ key: 'orders:read', label: 'عرض الطلبات' }, { key: 'orders:confirm', label: 'قبول/رفض' }, { key: 'orders:dispatch', label: 'إرسال شحنات' }] },
  { group: 'الحملات', permissions: [{ key: 'campaigns:read', label: 'عرض' }, { key: 'campaigns:create', label: 'إنشاء' }, { key: 'campaigns:delete', label: 'حذف' }] },
  { group: 'التقارير', permissions: [{ key: 'analytics:read', label: 'عرض التحليلات' }, { key: 'reports:export', label: 'تصدير' }] },
  { group: 'الإعدادات', permissions: [{ key: 'settings:read', label: 'عرض' }, { key: 'settings:write', label: 'تعديل' }] },
];

const ROLE_PRESETS: Record<string, string[]> = {
  manager:         ['inventory:read','inventory:write','orders:read','orders:confirm','orders:dispatch','campaigns:read','campaigns:create','analytics:read','reports:export','settings:read','settings:write'],
  supervisor:      ['inventory:read','inventory:write','orders:read','orders:confirm','orders:dispatch','campaigns:read','analytics:read'],
  inventory_staff: ['inventory:read','inventory:write','orders:read'],
  sales_rep:       ['orders:read','orders:confirm','campaigns:read','campaigns:create','analytics:read'],
  viewer:          ['inventory:read','orders:read','analytics:read'],
};

const ROLE_LABELS: Record<string, { label: string; badge: string }> = {
  manager:         { label: 'مدير',          badge: 'bg-purple-100 text-purple-700' },
  supervisor:      { label: 'مشرف',          badge: 'bg-blue-100 text-blue-700'    },
  inventory_staff: { label: 'موظف مخزون',    badge: 'bg-amber-100 text-amber-700'  },
  sales_rep:       { label: 'مندوب مبيعات',  badge: 'bg-teal-100 text-teal-700'   },
  viewer:          { label: 'مشاهد فقط',     badge: 'bg-gray-100 text-gray-600'   },
};

interface Employee { id: string; name: string; email: string; role: string; permissions: string[]; status: 'active' | 'suspended'; addedAt: string; }
interface AdminRequest { id: string; action_type: string; status: string; employee_name: string; created_at: string; }

export default function WarehouseEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [approvedRequestId, setApprovedRequestId] = useState<string | null>(null);
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

  const [requesterId] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('warehouse-id') || 'warehouse-owner' : 'warehouse-owner');
  const [requesterName] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('warehouse-name') || 'مدير المستودع' : 'مدير المستودع');

  const whAuthH = () => { try { const t = localStorage.getItem('warehouse-token') || ''; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; } catch { return { 'Content-Type': 'application/json' }; } };

  useEffect(() => {
    fetch(`${API}/admin-requests?requester_id=${requesterId}`, { headers: whAuthH() })
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.data)) {
          setRequests(d.data);
          const approved = d.data.find((r: AdminRequest) => r.action_type === 'add_employee' && r.status === 'approved');
          setApprovedRequestId(approved?.id || null);
        }
      }).catch(() => {});
  }, []);

  const canAddEmployee = !!approvedRequestId;

  const consumePermission = async () => {
    if (!approvedRequestId) return;
    await fetch(`${API}/admin-requests/${approvedRequestId}/status`, {
      method: 'PATCH', headers: whAuthH(),
      body: JSON.stringify({ status: 'used' }),
    }).catch(() => {});
    setApprovedRequestId(null);
    setRequests(prev => prev.map(r => r.id === approvedRequestId ? { ...r, status: 'used' } : r));
  };

  const submitAdminRequest = async () => {
    setReqLoading(true);
    try {
      const res = await fetch(`${API}/admin-requests`, {
        method: 'POST', headers: whAuthH(),
        body: JSON.stringify({ portalType: 'warehouse', requesterId, requesterName, requesterEntity: requesterName, actionType: reqType === 'add' ? 'add_employee' : 'remove_employee', employeeName: reqName, employeeEmail: reqEmail, employeeRole: reqRole, reason: reqReason }),
      });
      const d = await res.json();
      if (d.success && d.data) setRequests(prev => [d.data, ...prev]);
    } catch {}
    setReqSent(true); setReqLoading(false);
    setTimeout(() => { setShowAdminReq(false); setReqSent(false); setReqName(''); setReqEmail(''); setReqRole(''); setReqReason(''); }, 2500);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الموظفون وإدارة الصلاحيات</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowAdminReq(true); setReqType('add'); }}
            className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 px-3 py-2 rounded-xl text-sm font-medium">
            <ClipboardList className="w-4 h-4" /> طلب إلى الإدارة
          </button>
          <div className="relative group">
            <button onClick={() => { if (canAddEmployee) { setEditEmp(null); setShowModal(true); } }}
              disabled={!canAddEmployee}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${canAddEmployee ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {canAddEmployee ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />} إضافة موظف
            </button>
            {!canAddEmployee && (
              <div className="absolute bottom-full mb-2 right-0 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                أرسل طلباً للإدارة أولاً
              </div>
            )}
          </div>
        </div>
      </div>

      {canAddEmployee && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-green-800">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          تمت الموافقة على طلبك — يمكنك إضافة موظف واحد الآن.
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['employees','الموظفون'],['activity','سجل النشاط'],['requests','الطلبات']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'employees' && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[{ label: 'إجمالي الموظفين', value: employees.length }, { label: 'نشط', value: employees.filter(e => e.status === 'active').length }, { label: 'موقوف', value: employees.filter(e => e.status === 'suspended').length }].map(s => (
              <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-amber-600">{s.value}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>{['الموظف','الدور','الصلاحيات','الحالة','الإجراءات'].map(h => <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">لا يوجد موظفون — أرسل طلباً للإدارة للحصول على إذن إضافة موظف</td></tr>
                ) : employees.map(emp => {
                  const roleInfo = ROLE_LABELS[emp.role] || { label: emp.role, badge: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center"><span className="text-amber-700 font-bold text-sm">{emp.name[0]}</span></div>
                          <div><p className="font-medium text-gray-900 text-sm">{emp.name}</p><p className="text-xs text-gray-500">{emp.email}</p></div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.badge}`}>{roleInfo.label}</span></td>
                      <td className="px-6 py-4"><span className="text-xs text-gray-600 flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{emp.permissions.length} صلاحية</span></td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-full ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{emp.status === 'active' ? 'نشط' : 'موقوف'}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => setNotifTarget(emp)} className="p-1.5 rounded-lg hover:bg-amber-50"><Bell className="w-4 h-4 text-amber-500" /></button>
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
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">سيظهر سجل نشاط الموظفين هنا بعد إضافة الموظفين وبدء العمل.</p>
        </div>
      )}

      {tab === 'requests' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b"><h2 className="font-semibold text-gray-900">طلباتي إلى الإدارة</h2></div>
          {requests.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">لا توجد طلبات مُرسَلة بعد.</div>
          ) : (
            <div className="divide-y">
              {requests.map(req => (
                <div key={req.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {req.action_type === 'add_employee' ? 'إضافة موظف' : 'حذف موظف'}: {req.employee_name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(req.created_at).toLocaleDateString('ar-IQ')}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    req.status === 'approved' ? 'bg-green-100 text-green-700' :
                    req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    req.status === 'used' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {req.status === 'approved' ? 'موافق عليه' : req.status === 'rejected' ? 'مرفوض' : req.status === 'used' ? 'مُستخدَم' : 'قيد الانتظار'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {notifTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" dir="rtl">
            <h2 className="font-bold text-gray-900 mb-1">إرسال إشعار</h2>
            <p className="text-sm text-gray-500 mb-4">إلى: {notifTarget.name}</p>
            <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} rows={3} placeholder="اكتب رسالة الإشعار هنا..." className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setNotifTarget(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
              <button onClick={() => { addLocalNotification(notifMsg, requesterName); setNotifTarget(null); setNotifMsg(''); }} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"><Send className="w-4 h-4" /> إرسال</button>
            </div>
          </div>
        </div>
      )}

      {showAdminReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            {reqSent ? (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-bold text-gray-900">تم إرسال الطلب للإدارة</p>
                <p className="text-sm text-gray-500 mt-1">ستُفعَّل زر "إضافة موظف" بعد الموافقة</p>
              </div>
            ) : (
              <>
                <h2 className="font-bold text-gray-900 mb-4">طلب إلى إدارة المنصة</h2>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setReqType('add')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 ${reqType === 'add' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600'}`}><UserPlus className="w-4 h-4" /> إضافة</button>
                  <button onClick={() => setReqType('remove')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 ${reqType === 'remove' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}><UserMinus className="w-4 h-4" /> حذف</button>
                </div>
                <div className="space-y-3">
                  <input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="اسم الموظف *" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="email" dir="ltr" value={reqEmail} onChange={e => setReqEmail(e.target.value)} placeholder="البريد الإلكتروني *" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-left" />
                  <input value={reqRole} onChange={e => setReqRole(e.target.value)} placeholder="الدور الوظيفي" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <textarea value={reqReason} onChange={e => setReqReason(e.target.value)} rows={2} placeholder="سبب الطلب" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setShowAdminReq(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
                  <button onClick={submitAdminRequest} disabled={reqLoading || !reqName || !reqEmail}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
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
        <EmployeeModal employee={editEmp}
          onClose={() => { setShowModal(false); setEditEmp(null); }}
          onSave={async (emp) => {
            if (editEmp) setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
            else { setEmployees(prev => [...prev, emp]); await consumePermission(); }
            setShowModal(false); setEditEmp(null);
          }} />
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
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل *</label><input dir="auto" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني *</label><input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-left" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">الدور الوظيفي</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(ROLE_LABELS).map(([key, val]) => (
                <button key={key} onClick={() => applyPreset(key)} className={`px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all text-right ${selectedRole === key ? `${val.badge} border-current` : 'bg-white border-gray-200 text-gray-600'}`}>{val.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-amber-600 font-medium">{permissions.length} صلاحية محددة</span>
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
                        <input type="checkbox" checked={permissions.includes(perm.key)} onChange={() => toggle(perm.key)} className="w-4 h-4 rounded cursor-pointer accent-amber-500" />
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
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm">{employee ? 'حفظ التغييرات' : 'إضافة الموظف'}</button>
        </div>
      </div>
    </div>
  );
}
