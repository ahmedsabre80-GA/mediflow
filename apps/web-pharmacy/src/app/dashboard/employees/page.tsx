'use client';
import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, EyeOff, Copy, CheckCircle, Bell, ClipboardList, Send, UserPlus, UserMinus, Lock } from 'lucide-react';
import { addLocalNotification } from '@/lib/portalNotifications';
import DraggableModal from '@/components/DraggableModal';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

function pharmH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('pharmacy-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const PERMISSION_GROUPS = [
  { group: 'الطلبات', permissions: [{ key: 'orders:read', label: 'عرض الطلبات' }, { key: 'orders:manage', label: 'قبول/رفض' }, { key: 'orders:dispatch', label: 'إرسال' }, { key: 'orders:cancel', label: 'إلغاء' }] },
  { group: 'المخزون', permissions: [{ key: 'inventory:read', label: 'عرض المخزون' }, { key: 'inventory:write', label: 'تعديل' }, { key: 'inventory:delete', label: 'حذف' }] },
  { group: 'الوصفات', permissions: [{ key: 'prescriptions:verify', label: 'تحقق' }, { key: 'prescriptions:dispense', label: 'صرف' }] },
  { group: 'العملاء', permissions: [{ key: 'customers:read', label: 'عرض' }, { key: 'customers:contact', label: 'تواصل' }] },
  { group: 'التقارير', permissions: [{ key: 'reports:read', label: 'عرض' }, { key: 'reports:export', label: 'تصدير' }] },
  { group: 'الإعدادات والموظفون', permissions: [{ key: 'settings:read', label: 'عرض الإعدادات' }, { key: 'employees:read', label: 'عرض الموظفين' }, { key: 'employees:manage', label: 'إدارة الموظفين' }] },
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
interface AdminRequest { id: string; action_type: string; status: string; employee_name: string; created_at: string; }

export default function PharmacyEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [approvedRequestId, setApprovedRequestId] = useState<string | null>(null);
  const [tab, setTab] = useState<'employees' | 'activity' | 'requests'>('employees');
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
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

  const pharmacyId = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-id') || '' : '';
  const token       = typeof window !== 'undefined' ? localStorage.getItem('pharmacy-token') || '' : '';
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadStaff = () => {
    if (!pharmacyId) return;
    fetch(`${API}/${pharmacyId}/staff`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setEmployees((d.data || []).map((s: any) => ({
            id: s.id, name: s.name, email: s.email, role: s.role,
            permissions: Array.isArray(s.permissions) ? s.permissions : JSON.parse(s.permissions || '[]'),
            status: s.status, addedAt: s.created_at?.split('T')[0] || '',
          })));
        }
      }).catch(() => {});
  };

  useEffect(() => {
    loadStaff();
    // Load admin requests to check for approved add_employee permission
    fetch(`${API}/admin-requests?requester_id=${pharmacyId}`)
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
      method: 'PATCH', headers: authHeaders,
      body: JSON.stringify({ status: 'used' }),
    }).catch(() => {});
    setApprovedRequestId(null);
    setRequests(prev => prev.map(r => r.id === approvedRequestId ? { ...r, status: 'used' } : r));
  };

  const toggleStatus = async (emp: Employee) => {
    const newStatus = emp.status === 'active' ? 'suspended' : 'active';
    await fetch(`${API}/${pharmacyId}/staff/${emp.id}`, {
      method: 'PATCH', headers: authHeaders,
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: newStatus as 'active' | 'suspended' } : e));
  };

  const deleteEmployee = async (emp: Employee) => {
    await fetch(`${API}/${pharmacyId}/staff/${emp.id}`, { method: 'DELETE', headers: authHeaders }).catch(() => {});
    setEmployees(prev => prev.filter(e => e.id !== emp.id));
  };

  const sendNotification = async () => {
    if (!notifTarget || !notifMsg.trim()) return;
    // Send via portal notification to this specific staff member's user account
    await fetch(`${API}/portal-notifications`, {
      method: 'POST', headers: pharmH(),
      body: JSON.stringify({ portalType: 'pharmacy', recipientId: notifTarget.id, senderName: 'مدير الصيدلية', message: notifMsg }),
    }).catch(() => {});
    setNotifTarget(null);
    setNotifMsg('');
  };

  const submitAdminRequest = async () => {
    setReqLoading(true);
    try {
      await fetch(`${API}/admin-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'pharmacy',
          requesterId: pharmacyId,
          requesterName: localStorage.getItem('pharmacy-name') || 'مدير الصيدلية',
          requesterEntity: localStorage.getItem('pharmacy-name') || 'الصيدلية',
          actionType: reqType === 'add' ? 'add_employee' : 'remove_employee',
          employeeName: reqName,
          employeeEmail: reqEmail,
          employeeRole: reqRole,
          reason: reqReason,
        }),
      });
    } catch {}
    setReqSent(true);
    setReqLoading(false);
    setTimeout(() => {
      setShowAdminReq(false);
      setReqSent(false);
      setReqName(''); setReqEmail(''); setReqRole(''); setReqReason('');
    }, 2500);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الموظفون وإدارة الصلاحيات</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowAdminReq(true); setReqType('add'); }}
            className="flex items-center gap-2 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 px-3 py-2 rounded-xl text-sm font-medium">
            <ClipboardList className="w-4 h-4" /> طلب إلى الإدارة
          </button>
          <div className="relative group">
            <button
              onClick={() => { if (canAddEmployee) { setEditEmp(null); setShowModal(true); } }}
              disabled={!canAddEmployee}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                canAddEmployee
                  ? 'bg-sky-500 hover:bg-sky-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {canAddEmployee ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              إضافة موظف
            </button>
            {!canAddEmployee && (
              <div className="absolute top-full mt-2 left-0 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                أرسل طلباً للإدارة أولاً — ستُفعَّل بعد الموافقة
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Permission banner */}
      {canAddEmployee && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-green-800">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span>تمت الموافقة على طلبك — يمكنك إضافة موظف واحد الآن.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['employees', 'الموظفون'], ['activity', 'سجل النشاط'], ['requests', 'الطلبات']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'employees' && (
        <>
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

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>{['الموظف', 'الدور', 'الصلاحيات', 'الحالة', 'الإجراءات'].map(h => (
                  <th key={h} className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    لا يوجد موظفون — أرسل طلباً للإدارة للحصول على إذن إضافة موظف
                  </td></tr>
                ) : employees.map(emp => {
                  const roleInfo = ROLE_LABELS[emp.role] || { label: emp.role, badge: 'bg-gray-100 text-gray-700' };
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
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.badge}`}>{roleInfo.label}</span>
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
                          <button onClick={() => setNotifTarget(emp)} title="إرسال إشعار" className="p-1.5 rounded-lg hover:bg-sky-50">
                            <Bell className="w-4 h-4 text-sky-500" />
                          </button>
                          <button onClick={() => { setEditEmp(emp); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-gray-100">
                            <Edit2 className="w-4 h-4 text-gray-600" />
                          </button>
                          <button onClick={() => toggleStatus(emp)} className="p-1.5 rounded-lg hover:bg-gray-100">
                            {emp.status === 'active' ? <EyeOff className="w-4 h-4 text-amber-600" /> : <Eye className="w-4 h-4 text-green-600" />}
                          </button>
                          <button onClick={() => deleteEmployee(emp)} className="p-1.5 rounded-lg hover:bg-red-50">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
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
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">طلباتي إلى الإدارة</h2>
          </div>
          {requests.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              لا توجد طلبات مُرسَلة بعد. استخدم زر "طلب إلى الإدارة" للبدء.
            </div>
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
                    req.status === 'used' ? 'bg-gray-100 text-gray-500' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {req.status === 'approved' ? 'موافق عليه' :
                     req.status === 'rejected' ? 'مرفوض' :
                     req.status === 'used' ? 'مُستخدَم' : 'قيد الانتظار'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <DraggableModal open={!!credentials} onClose={() => setCredentials(null)} title="تم إنشاء الحساب" initialWidth={380}>
        {credentials && (
          <div className="p-6 text-center" dir="rtl">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
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
            <button onClick={() => setCredentials(null)} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm">حسناً، تم الحفظ</button>
          </div>
        )}
      </DraggableModal>

      <DraggableModal open={!!notifTarget} onClose={() => setNotifTarget(null)} title={`إرسال إشعار — ${notifTarget?.name || ''}`} initialWidth={380}>
        <div className="p-6" dir="rtl">
          <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} rows={3}
            placeholder="اكتب رسالة الإشعار هنا..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
          <div className="flex gap-3 mt-4">
            <button onClick={() => setNotifTarget(null)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
            <button onClick={sendNotification} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              <Send className="w-4 h-4" /> إرسال
            </button>
          </div>
        </div>
      </DraggableModal>

      <DraggableModal open={showAdminReq} onClose={() => setShowAdminReq(false)} title="طلب إلى إدارة المنصة" initialWidth={440}>
        <div className="p-6" dir="rtl">
          {reqSent ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="font-bold text-gray-900">تم إرسال الطلب للإدارة</p>
              <p className="text-sm text-gray-500 mt-1">ستظهر زر "إضافة موظف" بعد موافقة الإدارة</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                <button onClick={() => setReqType('add')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 ${reqType === 'add' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600'}`}>
                  <UserPlus className="w-4 h-4" /> إضافة موظف
                </button>
                <button onClick={() => setReqType('remove')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 ${reqType === 'remove' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}>
                  <UserMinus className="w-4 h-4" /> حذف موظف
                </button>
              </div>
              <div className="space-y-3">
                <input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="اسم الموظف *" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                <input type="email" dir="ltr" value={reqEmail} onChange={e => setReqEmail(e.target.value)} placeholder="البريد الإلكتروني *" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-left" />
                <input value={reqRole} onChange={e => setReqRole(e.target.value)} placeholder="الدور الوظيفي (صيدلاني، كاشير...)" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                <textarea value={reqReason} onChange={e => setReqReason(e.target.value)} rows={2} placeholder="سبب الطلب" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowAdminReq(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700">إلغاء</button>
                <button onClick={submitAdminRequest} disabled={reqLoading || !reqName || !reqEmail}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  {reqLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  إرسال الطلب
                </button>
              </div>
            </>
          )}
        </div>
      </DraggableModal>

      {showModal && (
        <EmployeeModal
          employee={editEmp}
          onClose={() => { setShowModal(false); setEditEmp(null); }}
          onSave={async (emp, creds, userId) => {
            if (editEmp) {
              // Update role/permissions in DB
              await fetch(`${API}/${pharmacyId}/staff/${emp.id}`, {
                method: 'PATCH', headers: authHeaders,
                body: JSON.stringify({ role: emp.role, permissions: emp.permissions }),
              }).catch(() => {});
              setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
            } else {
              // Save new staff to DB
              if (userId) {
                await fetch(`${API}/${pharmacyId}/staff`, {
                  method: 'POST', headers: authHeaders,
                  body: JSON.stringify({ userId, name: emp.name, email: emp.email, role: emp.role, permissions: emp.permissions }),
                }).catch(() => {});
              }
              loadStaff();
              if (creds) setCredentials(creds);
              await consumePermission();
            }
            setShowModal(false);
            setEditEmp(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ employee, onClose, onSave }: {
  employee: Employee | null;
  onClose: () => void;
  onSave: (e: Employee, creds?: { name: string; email: string; password: string }, userId?: string) => void;
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
    setLoading(true); setError('');
    try {
      if (!employee) {
        const parts = name.trim().split(' ');
        const res = await fetch(`${AUTH_API}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: parts[0], lastName: parts.slice(1).join(' ') || parts[0], email, password, role: 'pharmacy_employee' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');
        const newUserId = data.data?.userId || '';
        const newEmp: Employee = { id: newUserId || Date.now().toString(), name, email, role: selectedRole, permissions, status: 'active', addedAt: new Date().toISOString().split('T')[0] };
        onSave(newEmp, { name, email, password }, newUserId);
      } else {
        onSave({ ...employee, name, email, role: selectedRole, permissions });
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <DraggableModal open onClose={onClose} title={employee ? 'تعديل موظف' : 'إضافة موظف جديد'} initialWidth={620}>
      <div dir="rtl">
        <div className="p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل *</label>
              <input dir="auto" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني *</label>
              <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-left" />
            </div>
            {!employee && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور *</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input type={showPass ? 'text' : 'password'} dir="ltr" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-left pr-10" />
                    <button type="button" onClick={() => setShowPass(v => !v)} className="absolute left-3 top-3.5 text-gray-400">{showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  <button type="button" onClick={() => setPassword(generatePassword())} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700">توليد تلقائي</button>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(password)} className="px-3 py-2 bg-sky-50 hover:bg-sky-100 rounded-xl text-sky-600"><Copy className="w-4 h-4" /></button>
                </div>
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
                  <p className="font-semibold text-gray-800 text-sm mb-3">{group.group}</p>
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
    </DraggableModal>
  );
}
