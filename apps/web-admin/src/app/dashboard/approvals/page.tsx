'use client';
import { useState, useEffect } from 'react';
import { logAction } from '@/lib/auditSystem';
import { CheckCircle, XCircle, Clock, Building2, Stethoscope, Package, RefreshCw, Trash2, Filter, KeyRound, HeartPulse, Eye, EyeOff, Copy, X } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const SECRET = 'mediflow-delete-2026';

function adminAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('admin-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

const PORTAL_TABS = [
  { key: 'all',       label: 'الكل',            color: 'text-gray-700'    },
  { key: 'pharmacy',  label: 'الصيدليات',       color: 'text-sky-600'     },
  { key: 'warehouse', label: 'المستودعات',      color: 'text-amber-600'   },
  { key: 'doctor',    label: 'الأطباء',         color: 'text-teal-600'    },
  { key: 'patient',   label: 'المرضى',          color: 'text-rose-600'    },
  { key: '__reset',   label: 'إعادة كلمة المرور', color: 'text-purple-600' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:  { label: 'في الانتظار', color: 'bg-amber-100 text-amber-700', icon: '⏳' },
  approved: { label: 'موافق عليه',  color: 'bg-green-100 text-green-700', icon: '✅' },
  rejected: { label: 'مرفوض',      color: 'bg-red-100 text-red-700',     icon: '❌' },
  used:     { label: 'مُستخدَم',    color: 'bg-gray-100 text-gray-500',   icon: '✔'  },
};

const PORTAL_STYLE: Record<string, { icon: any; color: string; label: string }> = {
  pharmacy:  { icon: Building2,   color: 'bg-sky-100 text-sky-700',      label: 'صيدلية'  },
  warehouse: { icon: Package,     color: 'bg-amber-100 text-amber-700',  label: 'مستودع'  },
  doctor:    { icon: Stethoscope, color: 'bg-teal-100 text-teal-700',   label: 'طبيب'    },
  patient:   { icon: HeartPulse,  color: 'bg-rose-100 text-rose-700',   label: 'مريض'    },
  admin:     { icon: KeyRound,    color: 'bg-purple-100 text-purple-700', label: 'مشرف'   },
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [portalTab, setPortalTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);

  // Password reset modal
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState('');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin-requests`);
      const d = await r.json();
      if (d.success && Array.isArray(d.data)) {
        setRequests(d.data.map((req: any) => ({
          id: req.id,
          portalType: req.portal_type || 'pharmacy',
          requesterName: req.requester_name || '—',
          requesterEntity: req.requester_entity || '—',
          actionType: req.action_type || 'add_employee',
          employeeName: req.employee_name || '—',
          employeeEmail: req.employee_email || '',
          employeeRole: req.employee_role || '',
          reason: req.reason || '',
          status: req.status || 'pending',
          requestedAt: new Date(req.created_at).toLocaleString('ar-IQ'),
          decidedAt: req.decided_at ? new Date(req.decided_at).toLocaleString('ar-IQ') : '',
        })));
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadRequests(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    const req = requests.find(r => r.id === id);
    const now = new Date().toLocaleString('ar-IQ');
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: decision, decidedAt: now } : r));
    try {
      await fetch(`${API}/admin-requests/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision }),
      });
    } catch {}
    if (req) logAction(
      decision === 'approved' ? 'approve' : 'reject',
      `${decision === 'approved' ? 'موافقة على' : 'رفض'} طلب موظف`,
      req.requesterEntity,
      `${req.employeeName} — ${req.requesterName}`,
      id, '/dashboard/approvals'
    );
    showToast(decision === 'approved' ? '✅ تمت الموافقة' : '❌ تم الرفض');
  };

  const deleteOne = async (id: string) => {
    setRequests(prev => prev.filter(r => r.id !== id));
    try { await fetch(`${API}/admin-requests/${id}`, { method: 'DELETE' }); } catch {}
  };

  const clearDecided = async () => {
    setRequests(prev => prev.filter(r => r.status === 'pending'));
    setClearConfirm(false);
    try { await fetch(`${API}/admin-requests`, { method: 'DELETE' }); } catch {}
    showToast('🗑️ تم مسح جميع القرارات المنجزة');
  };

  const doResetPassword = async () => {
    if (!resetTarget || newPass.length < 6 || !resetEmail.trim()) return;
    setResetting(true);
    try {
      const res = await fetch(`${AUTH_API}/auth/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim(), newPassword: newPass, secret: SECRET }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const reason = d?.error?.message || d?.message || '';
        throw new Error(reason ? `فشل: ${reason}` : `البريد الإلكتروني غير موجود في النظام (${res.status}) — تحقق من البريد وأعد المحاولة`);
      }
      // Reactivate the auth account (it was suspended when they requested reset)
      await fetch(`${AUTH_API}/auth/admin/activate-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim(), secret: SECRET }),
      }).catch(() => {});

      // Reactivate the pharmacy/portal record status → active
      // Look up the pharmacy by email to get the correct DB ID
      const entityPortalType = resetTarget.portalType || 'pharmacy';
      if (entityPortalType === 'pharmacy') {
        const allPh = await fetch(`${API}/pharmacies/admin/all`).then(r => r.json()).catch(() => ({ data: [] }));
        const phList: any[] = allPh.data || allPh.pharmacies || [];
        const emailLower = resetEmail.trim().toLowerCase();
        const nameLower  = (resetTarget.requesterName || '').toLowerCase();
        const match = phList.find((p: any) =>
          (p.owner_email || p.email || '').toLowerCase() === emailLower ||
          (p.name_ar || p.name || '').toLowerCase() === nameLower
        );
        const pharmacyId = match?.id || resetTarget.requesterEntity;
        if (pharmacyId && pharmacyId !== '—') {
          const patchRes = await fetch(`${API}/pharmacies/admin/${pharmacyId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' }),
          });
          if (!patchRes.ok) showToast('⚠️ تم إعادة تعيين كلمة المرور لكن فشل تفعيل الحساب — فعّله يدوياً');
        }
      }

      // Notify the portal user with the new temp password
      const portalType = resetTarget.portalType || 'pharmacy';
      const recipientId = resetTarget.requesterEntity;
      if (recipientId) {
        await fetch(`${API}/portal-notifications`, {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({
            portalType,
            recipientId,
            senderName: 'إدارة ميديفلو',
            message: `🔑 تم إعادة تعيين كلمة المرور\n━━━━━━━━━━━━━━━\nكلمة المرور المؤقتة:\n${newPass}\n━━━━━━━━━━━━━━━\nيرجى تسجيل الدخول وتغيير كلمة المرور في أقرب وقت.`,
          }),
        }).catch(() => {});
      }

      // Mark request as done
      await fetch(`${API}/admin-requests/${resetTarget.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }).catch(() => {});
      setRequests(prev => prev.map(r => r.id === resetTarget.id ? { ...r, status: 'approved' } : r));
      setResetDone(newPass);
    } catch (err: any) {
      showToast(`❌ ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  const closeResetModal = () => {
    setResetTarget(null);
    setResetEmail('');
    setNewPass('');
    setShowPass(false);
    setResetDone('');
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    setNewPass(Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
  };

  // Separate reset-password requests from regular approvals
  const resetRequests = requests.filter(r => r.actionType === 'reset_password');
  const regularRequests = requests.filter(r => r.actionType !== 'reset_password');

  const isResetTab = portalTab === '__reset';
  const activePool = isResetTab ? resetRequests : regularRequests;
  const byPortal = isResetTab || portalTab === 'all' ? activePool : activePool.filter(r => r.portalType === portalTab);
  const filtered = statusFilter === 'all' ? byPortal : byPortal.filter(r => r.status === statusFilter);
  const decided = regularRequests.filter(r => r.status !== 'pending').length;

  const countFor = (portal: string, status: string) => {
    if (portal === '__reset') {
      return status === 'all' ? resetRequests.length : resetRequests.filter(r => r.status === status).length;
    }
    const pool = portal === 'all' ? regularRequests : regularRequests.filter(r => r.portalType === portal);
    return status === 'all' ? pool.length : pool.filter(r => r.status === status).length;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">إعادة تعيين كلمة المرور</h3>
              <button onClick={closeResetModal} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 mb-4">
              <p className="text-sm font-medium text-gray-900">{resetTarget.requesterName}</p>
              <p className="text-xs text-purple-600 mt-1">{resetTarget.requesterEntity}</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني المسجل في النظام</label>
              <input
                type="email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                dir="ltr"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="أدخل البريد الإلكتروني الصحيح"
              />
              <p className="text-xs text-amber-600 mt-1">⚠️ تأكد أن البريد يطابق الحساب المسجل في النظام</p>
            </div>
            {resetDone ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-green-700 font-medium mb-2">✅ تم إعادة التعيين بنجاح</p>
                <p className="text-xs text-gray-600 mb-1">كلمة المرور المؤقتة:</p>
                <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
                  <span className="font-mono text-sm text-gray-800 flex-1">{resetDone}</span>
                  <button onClick={() => { navigator.clipboard.writeText(resetDone); showToast('✅ تم نسخ كلمة المرور'); }}
                    className="text-xs text-green-600 flex items-center gap-1 hover:underline">
                    <Copy className="w-3.5 h-3.5" /> نسخ
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">أرسل هذه الكلمة للمستخدم عبر مركز الرسائل</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <label className="block text-sm font-medium text-gray-700">كلمة المرور الجديدة</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    dir="ltr"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 pl-10"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button type="button" onClick={generatePassword}
                  className="text-xs text-purple-600 hover:underline">
                  ⚡ توليد كلمة مرور عشوائية
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={closeResetModal}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                {resetDone ? 'إغلاق' : 'إلغاء'}
              </button>
              {!resetDone && (
                <button onClick={doResetPassword} disabled={resetting || newPass.length < 6}
                  className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors">
                  {resetting ? 'جاري الحفظ...' : 'إعادة التعيين'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">طلبات الموافقة</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isResetTab ? 'طلبات إعادة تعيين كلمة المرور' : 'طلبات إضافة وحذف موظفين من الصيدليات والمستودعات والأطباء'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {decided > 0 && (
            clearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 font-medium">مسح {decided} قرار؟</span>
                <button onClick={clearDecided} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium">تأكيد</button>
                <button onClick={() => setClearConfirm(false)} className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-600">إلغاء</button>
              </div>
            ) : (
              <button onClick={() => setClearConfirm(true)}
                className="flex items-center gap-2 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-50">
                <Trash2 className="w-4 h-4" /> مسح المنجزة ({decided})
              </button>
            )
          )}
          <button onClick={loadRequests} disabled={loading}
            className="flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Portal Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
        {PORTAL_TABS.map(t => (
          <button key={t.key} onClick={() => setPortalTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${portalTab === t.key ? `bg-white shadow-sm ${t.color}` : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.key !== 'all' && countFor(t.key, 'pending') > 0 && (
              <span className="mr-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {countFor(t.key, 'pending')}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'في الانتظار', value: countFor(portalTab, 'pending'),  color: 'text-amber-600', bg: 'bg-amber-50'  },
          { label: 'موافق عليها', value: countFor(portalTab, 'approved'), color: 'text-green-600', bg: 'bg-green-50'  },
          { label: 'مرفوضة',     value: countFor(portalTab, 'rejected'), color: 'text-red-600',   bg: 'bg-red-50'    },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        {[{k:'pending',l:'في الانتظار'},{k:'approved',l:'موافق عليها'},{k:'rejected',l:'مرفوضة'},{k:'all',l:'الكل'}].map(f => (
          <button key={f.k} onClick={() => setStatusFilter(f.k)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${statusFilter === f.k ? 'bg-sky-500 text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Requests */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
            <p>جاري التحميل...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{statusFilter === 'pending' ? 'لا توجد طلبات معلقة' : 'لا توجد طلبات في هذا القسم'}</p>
          </div>
        ) : filtered.map(req => {
          const isReset = req.actionType === 'reset_password';
          const portal = PORTAL_STYLE[req.portalType] || PORTAL_STYLE.pharmacy;
          const PortalIcon = portal.icon;
          const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;

          return (
            <div key={req.id} className={`bg-white rounded-2xl shadow-sm p-5 ${isReset ? 'border-r-4 border-purple-400' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                    {statusCfg.icon} {statusCfg.label}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${portal.color}`}>
                    <PortalIcon className="w-3 h-3 inline ml-1" />{portal.label}
                  </span>
                  {isReset && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
                      <KeyRound className="w-3 h-3 inline ml-1" />إعادة كلمة المرور
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{req.requestedAt}</span>
                </div>
                <button onClick={() => deleteOne(req.id)} title="حذف"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {isReset ? (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">اسم المستخدم</p>
                    <p className="font-bold text-gray-900 text-sm">{req.requesterName}</p>
                    <p className="text-xs text-gray-500">{req.requesterEntity}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">البريد الإلكتروني</p>
                    <p className="font-bold text-gray-900 text-sm break-all">{req.employeeEmail || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">الطالب</p>
                    <p className="font-bold text-gray-900 text-sm">{req.requesterName}</p>
                    <p className="text-xs text-gray-500">{req.requesterEntity}</p>
                  </div>
                  <div className="bg-sky-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">
                      {req.actionType === 'add_employee'    ? 'الموظف المطلوب إضافته'  :
                       req.actionType === 'remove_employee' ? 'الموظف المطلوب حذفه'    :
                       req.actionType === 'register_patient'? 'المريض المطلوب تسجيله'  :
                       req.actionType === 'delete_patient'  ? 'المريض المطلوب حذفه'    :
                       req.actionType === 'register'        ? 'المطلوب تسجيله'         :
                       req.actionType === 'delete'          ? 'المطلوب حذفه'           :
                       'التفاصيل'}
                    </p>
                    <p className="font-bold text-gray-900 text-sm">{req.employeeName}</p>
                    <p className="text-xs text-sky-600">{req.employeeRole}</p>
                    <p className="text-xs text-gray-400">{req.employeeEmail}</p>
                  </div>
                </div>
              )}

              {req.reason && !isReset && (
                <div className="bg-gray-50 rounded-xl px-4 py-2 mb-4 text-xs text-gray-600">
                  <span className="font-medium">السبب: </span>{req.reason}
                </div>
              )}

              {req.status === 'pending' ? (
                isReset ? (
                  <button onClick={() => { setResetTarget(req); setResetEmail(req.employeeEmail || ''); setNewPass(''); setResetDone(''); }}
                    className="w-full flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                    <KeyRound className="w-4 h-4" /> إعادة تعيين كلمة المرور
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => decide(req.id, 'rejected')}
                      className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-600 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                      <XCircle className="w-4 h-4" /> رفض
                    </button>
                    <button onClick={() => decide(req.id, 'approved')}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                      <CheckCircle className="w-4 h-4" /> موافقة
                    </button>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2">
                  <span>{statusCfg.icon}</span>
                  <span>تم اتخاذ القرار: {req.decidedAt || '—'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
