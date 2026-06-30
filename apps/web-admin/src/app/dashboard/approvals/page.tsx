'use client';
import { useState, useEffect } from 'react';
import { logAction } from '@/lib/auditSystem';
import { CheckCircle, XCircle, Clock, Building2, Stethoscope, Package, RefreshCw, Trash2, Filter } from 'lucide-react';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

const PORTAL_TABS = [
  { key: 'all',       label: 'الكل',      color: 'text-gray-700'   },
  { key: 'pharmacy',  label: 'الصيدليات', color: 'text-sky-600'    },
  { key: 'warehouse', label: 'المستودعات', color: 'text-amber-600' },
  { key: 'doctor',    label: 'الأطباء',   color: 'text-teal-600'   },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:  { label: 'في الانتظار', color: 'bg-amber-100 text-amber-700', icon: '⏳' },
  approved: { label: 'موافق عليه',  color: 'bg-green-100 text-green-700', icon: '✅' },
  rejected: { label: 'مرفوض',      color: 'bg-red-100 text-red-700',     icon: '❌' },
  used:     { label: 'مُستخدَم',    color: 'bg-gray-100 text-gray-500',   icon: '✔'  },
};

const PORTAL_STYLE: Record<string, { icon: any; color: string; label: string }> = {
  pharmacy:  { icon: Building2,   color: 'bg-sky-100 text-sky-700',    label: 'صيدلية'   },
  warehouse: { icon: Package,     color: 'bg-amber-100 text-amber-700', label: 'مستودع'  },
  doctor:    { icon: Stethoscope, color: 'bg-teal-100 text-teal-700',  label: 'طبيب'    },
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [portalTab, setPortalTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);

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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

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

  const byPortal = portalTab === 'all' ? requests : requests.filter(r => r.portalType === portalTab);
  const filtered = statusFilter === 'all' ? byPortal : byPortal.filter(r => r.status === statusFilter);
  const decided = requests.filter(r => r.status !== 'pending').length;

  const countFor = (portal: string, status: string) => {
    const pool = portal === 'all' ? requests : requests.filter(r => r.portalType === portal);
    return status === 'all' ? pool.length : pool.filter(r => r.status === status).length;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">طلبات الموافقة</h1>
          <p className="text-sm text-gray-500 mt-1">طلبات إضافة وحذف موظفين من الصيدليات والمستودعات والأطباء</p>
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

      {/* Portal Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
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
          const portal = PORTAL_STYLE[req.portalType] || PORTAL_STYLE.pharmacy;
          const PortalIcon = portal.icon;
          const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;

          return (
            <div key={req.id} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                    {statusCfg.icon} {statusCfg.label}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${portal.color}`}>
                    <PortalIcon className="w-3 h-3 inline ml-1" />{portal.label}
                  </span>
                  <span className="text-xs text-gray-400">{req.requestedAt}</span>
                </div>
                <button onClick={() => deleteOne(req.id)} title="حذف"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">الطالب</p>
                  <p className="font-bold text-gray-900 text-sm">{req.requesterName}</p>
                  <p className="text-xs text-gray-500">{req.requesterEntity}</p>
                </div>
                <div className="bg-sky-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">
                    {req.actionType === 'add_employee' ? 'الموظف المطلوب إضافته' : 'الموظف المطلوب حذفه'}
                  </p>
                  <p className="font-bold text-gray-900 text-sm">{req.employeeName}</p>
                  <p className="text-xs text-sky-600">{req.employeeRole}</p>
                  <p className="text-xs text-gray-400">{req.employeeEmail}</p>
                </div>
              </div>

              {req.reason && (
                <div className="bg-gray-50 rounded-xl px-4 py-2 mb-4 text-xs text-gray-600">
                  <span className="font-medium">السبب: </span>{req.reason}
                </div>
              )}

              {req.status === 'pending' ? (
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
