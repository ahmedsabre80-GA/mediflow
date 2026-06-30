'use client';
import { useState, useEffect } from 'react';
import { logAction } from '@/lib/auditSystem';
import { CheckCircle, XCircle, Clock, Building2, Stethoscope, Package, Truck, History } from 'lucide-react';

const STORE_KEY = 'admin-approvals';

const INITIAL_REQUESTS: any[] = [];

const TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  doctor_employee: { icon: Stethoscope, color: 'bg-teal-100 text-teal-700', label: 'موظف طبيب' },
  pharmacy_employee: { icon: Building2, color: 'bg-sky-100 text-sky-700', label: 'موظف صيدلية' },
  warehouse_employee: { icon: Package, color: 'bg-amber-100 text-amber-700', label: 'موظف مخزن' },
  driver: { icon: Truck, color: 'bg-indigo-100 text-indigo-700', label: 'سائق توصيل' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'في انتظار الموافقة', color: 'bg-amber-100 text-amber-700', icon: '⏳' },
  approved: { label: 'تمت الموافقة', color: 'bg-green-100 text-green-700', icon: '✅' },
  rejected: { label: 'مرفوض', color: 'bg-red-100 text-red-700', icon: '❌' },
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [filter, setFilter] = useState('pending');
  const [toast, setToast] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      try { setRequests(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Save to localStorage on every change
  const saveRequests = (updated: typeof INITIAL_REQUESTS) => {
    setRequests(updated);
    localStorage.setItem(STORE_KEY, JSON.stringify(updated));
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const approve = (id: string) => {
    const now = new Date().toLocaleString('ar-IQ');
    const req = requests.find(r => r.id === id);
    const updated = requests.map(r => r.id === id ? { ...r, status: 'approved', decidedAt: now } : r);
    saveRequests(updated);
    if (req) logAction('approve', 'موافقة على طلب إضافة موظف', req.requesterType, `${req.employeeName} — ${req.requesterName}`, id, '/dashboard/approvals');
    showToast('✅ تمت الموافقة على الطلب وتم حفظها');
  };

  const reject = (id: string) => {
    const now = new Date().toLocaleString('ar-IQ');
    const req = requests.find(r => r.id === id);
    const updated = requests.map(r => r.id === id ? { ...r, status: 'rejected', decidedAt: now } : r);
    saveRequests(updated);
    if (req) logAction('reject', 'رفض طلب إضافة موظف', req.requesterType, `${req.employeeName} — ${req.requesterName}`, id, '/dashboard/approvals');
    showToast('❌ تم رفض الطلب وتم حفظه');
  };

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const pending = requests.filter(r => r.status === 'pending').length;
  const history = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">طلبات الموافقة</h1>
          <p className="text-sm text-gray-500 mt-1">طلبات إضافة موظفين — تُحفظ تلقائياً</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            <History className="w-4 h-4" /> سجل القرارات ({history.length})
          </button>
          {pending > 0 && (
            <span className="bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-full">
              {pending} طلب جديد
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'في الانتظار', value: requests.filter(r => r.status === 'pending').length, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'تمت الموافقة', value: requests.filter(r => r.status === 'approved').length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'مرفوض', value: requests.filter(r => r.status === 'rejected').length, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-900">سجل القرارات السابقة</h2>
          </div>
          <div className="divide-y">
            {history.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">لا يوجد سجل بعد</div>
            ) : history.map(req => {
              const statusConfig = STATUS_CONFIG[req.status];
              const typeConfig = TYPE_CONFIG[req.type];
              return (
                <div key={req.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg`}>{statusConfig.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{req.employeeName} — {req.employeeRole}</p>
                      <p className="text-xs text-gray-500">طلب من: {req.requesterName} • القرار: {req.decidedAt}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusConfig.color}`}>{statusConfig.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[{k:'pending',l:'في الانتظار'},{k:'approved',l:'موافق عليها'},{k:'rejected',l:'مرفوضة'},{k:'all',l:'الكل'}].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f.k ? 'bg-sky-500 text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{filter === 'pending' ? 'لا توجد طلبات معلقة' : 'لا توجد طلبات'}</p>
          </div>
        ) : filtered.map(req => {
          const typeConfig = TYPE_CONFIG[req.type];
          const statusConfig = STATUS_CONFIG[req.status];
          const TypeIcon = typeConfig.icon;

          return (
            <div key={req.id} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusConfig.color}`}>{statusConfig.label}</span>
                  <span className="text-xs text-gray-400">{req.requestedAt}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${typeConfig.color}`}>
                    <TypeIcon className="w-4 h-4" />
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${typeConfig.color}`}>{typeConfig.label}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">الطالب</p>
                  <p className="font-bold text-gray-900 text-sm">{req.requesterName}</p>
                  <p className="text-xs text-gray-500">{req.requesterType}</p>
                </div>
                <div className="bg-sky-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">الموظف المطلوب إضافته</p>
                  <p className="font-bold text-gray-900 text-sm">{req.employeeName}</p>
                  <p className="text-xs text-sky-600">{req.employeeRole}</p>
                  <p className="text-xs text-gray-400">{req.employeeEmail}</p>
                </div>
              </div>

              {req.status === 'pending' ? (
                <div className="flex gap-3">
                  <button onClick={() => reject(req.id)}
                    className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-600 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                    <XCircle className="w-4 h-4" /> رفض
                  </button>
                  <button onClick={() => approve(req.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                    <CheckCircle className="w-4 h-4" /> موافقة
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2">
                  <span>{statusConfig.icon}</span>
                  <span>تم اتخاذ القرار: {req.decidedAt}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
