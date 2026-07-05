'use client';
import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, Search, RefreshCw, UserCheck, UserX, Ban, Eye } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API     = 'https://mediflowauth-service-production.up.railway.app/api/v1';
const SECRET       = 'mediflow-delete-2026';

interface Patient {
  id: string;           // admin_request id (or synthetic)
  requester_id: string; // auth userId
  requester_name: string;
  requester_entity: string; // email
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  created_at: string;
  decided_at?: string;
  hasRequest: boolean;  // whether admin_request record exists
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: 'قيد المراجعة', color: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'موافق عليه',   color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'مرفوض',        color: 'bg-red-100 text-red-700' },
  suspended: { label: 'موقوف',        color: 'bg-gray-100 text-gray-600' },
};

export default function PatientsPage() {
  const [patients,     setPatients]     = useState<Patient[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actioning,    setActioning]    = useState<string | null>(null);
  const [selected,     setSelected]     = useState<Patient | null>(null);

  const getAdminToken = () => localStorage.getItem('admin-token') || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      // Fetch auth users with role=patient AND admin_requests in parallel
      const [usersRes, reqsRes] = await Promise.allSettled([
        fetch(`${AUTH_API}/auth/admin/users?secret=${SECRET}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${PHARMACY_API}/admin-requests?portal_type=patient&action_type=register`),
      ]);

      // Parse auth users
      let authPatients: any[] = [];
      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        const d = await usersRes.value.json();
        const allUsers = d.data || d.users || [];
        authPatients = allUsers.filter((u: any) => u.role === 'patient');
      }

      // Parse admin_requests
      let adminRequests: any[] = [];
      if (reqsRes.status === 'fulfilled' && reqsRes.value.ok) {
        const d = await reqsRes.value.json();
        adminRequests = d.data || [];
      }

      // Build a map of userId → admin_request
      const reqMap = new Map<string, any>();
      for (const req of adminRequests) {
        if (req.requester_id) reqMap.set(req.requester_id, req);
      }

      // Merge: auth patients are the source of truth
      const merged: Patient[] = authPatients.map((u: any) => {
        const req = reqMap.get(u.id || u.userId);
        const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;
        return {
          id: req?.id || `auth-${u.id || u.userId}`,
          requester_id: u.id || u.userId,
          requester_name: req?.requester_name || fullName,
          requester_entity: req?.requester_entity || u.email || '',
          status: req?.status || 'pending',
          created_at: req?.created_at || u.createdAt || new Date().toISOString(),
          decided_at: req?.decided_at,
          hasRequest: !!req,
        };
      });

      // Also include admin_requests whose user might not appear in auth list (edge case)
      for (const req of adminRequests) {
        if (!merged.find(p => p.requester_id === req.requester_id)) {
          merged.push({
            id: req.id,
            requester_id: req.requester_id || '',
            requester_name: req.requester_name || '—',
            requester_entity: req.requester_entity || '',
            status: req.status,
            created_at: req.created_at,
            decided_at: req.decided_at,
            hasRequest: true,
          });
        }
      }

      setPatients(merged);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ensureRequest = async (patient: Patient) => {
    if (patient.hasRequest) return patient.id;
    // Create an admin_request record for this patient (they registered before the system existed)
    const res = await fetch(`${PHARMACY_API}/admin-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalType: 'patient',
        requesterId: patient.requester_id,
        requesterName: patient.requester_name,
        requesterEntity: patient.requester_entity,
        actionType: 'register',
        employeeName: patient.requester_name,
        employeeEmail: patient.requester_entity,
        employeeRole: 'patient',
        reason: 'تسجيل مسبق — تم ترحيله تلقائياً',
        status: 'pending',
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const newId = d.data?.id;
      setPatients(prev => prev.map(p =>
        p.requester_id === patient.requester_id
          ? { ...p, id: newId || p.id, hasRequest: true }
          : p
      ));
      return newId || patient.id;
    }
    return patient.id;
  };

  const updateStatus = async (patient: Patient, status: 'approved' | 'rejected' | 'suspended') => {
    setActioning(patient.id);
    try {
      const reqId = await ensureRequest(patient);

      // Update admin_requests status
      await fetch(`${PHARMACY_API}/admin-requests/${reqId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      // Activate/deactivate auth user
      const authEndpoint = status === 'approved' ? 'activate-user' : 'deactivate-user';
      await fetch(`${AUTH_API}/auth/admin/${authEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ userId: patient.requester_id, adminSecret: 'mediflow-delete-2026' }),
      }).catch(() => {});

      setPatients(prev => prev.map(p =>
        p.id === patient.id || p.requester_id === patient.requester_id
          ? { ...p, status, decided_at: new Date().toISOString() }
          : p
      ));
      if (selected?.requester_id === patient.requester_id)
        setSelected(prev => prev ? { ...prev, status } : prev);
    } catch {}
    finally { setActioning(null); }
  };

  const filtered = patients.filter(p => {
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchSearch = !search ||
      p.requester_name.toLowerCase().includes(search.toLowerCase()) ||
      p.requester_entity.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = {
    all:      patients.length,
    pending:  patients.filter(p => p.status === 'pending').length,
    approved: patients.filter(p => p.status === 'approved').length,
    rejected: patients.filter(p => p.status === 'rejected').length,
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المرضى</h1>
          <p className="text-gray-500 text-sm mt-1">إدارة طلبات تسجيل المرضى والموافقة عليها</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border rounded-xl px-4 py-2 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'الكل',           count: counts.all,      color: 'bg-gray-50 border-gray-200',    text: 'text-gray-700',  key: 'all' },
          { label: 'قيد المراجعة',   count: counts.pending,  color: 'bg-amber-50 border-amber-200',  text: 'text-amber-700', key: 'pending' },
          { label: 'موافق عليهم',    count: counts.approved, color: 'bg-green-50 border-green-200',  text: 'text-green-700', key: 'approved' },
          { label: 'مرفوضون',        count: counts.rejected, color: 'bg-red-50 border-red-200',      text: 'text-red-700',   key: 'rejected' },
        ].map(s => (
          <button key={s.key} onClick={() => setFilterStatus(s.key)}
            className={`${s.color} border rounded-2xl p-4 text-right transition-all ${filterStatus === s.key ? 'ring-2 ring-sky-400' : ''}`}>
            <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border p-4">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد الإلكتروني..."
            className="flex-1 bg-transparent text-sm outline-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2 animate-spin opacity-40" />
            <p>جاري التحميل...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <UserCheck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>لا توجد نتائج</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">المريض</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">البريد الإلكتروني</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">تاريخ التسجيل</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">الحالة</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 font-bold text-sm shrink-0">
                        {p.requester_name?.charAt(0) || '؟'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-sm block">{p.requester_name}</span>
                        {!p.hasRequest && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">تسجيل مسبق</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500 dir-ltr">{p.requester_entity}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {new Date(p.created_at).toLocaleDateString('ar-IQ')}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_LABEL[p.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelected(p)}
                        className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors" title="عرض التفاصيل">
                        <Eye className="w-4 h-4" />
                      </button>
                      {p.status !== 'approved' && (
                        <button onClick={() => updateStatus(p, 'approved')} disabled={actioning === p.id}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="موافقة">
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                      {p.status !== 'rejected' && (
                        <button onClick={() => updateStatus(p, 'rejected')} disabled={actioning === p.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="رفض">
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                      {p.status === 'approved' && (
                        <button onClick={() => updateStatus(p, 'suspended')} disabled={actioning === p.id}
                          className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="إيقاف">
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 font-bold text-xl">
                {selected.requester_name?.charAt(0)}
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{selected.requester_name}</h2>
                <p className="text-sm text-gray-500">{selected.requester_entity}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-3 mb-5 text-sm">
              <div className="flex justify-between">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_LABEL[selected.status]?.color}`}>
                  {STATUS_LABEL[selected.status]?.label}
                </span>
                <span className="text-gray-500">الحالة</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-900">{new Date(selected.created_at).toLocaleString('ar-IQ')}</span>
                <span className="text-gray-500">تاريخ التسجيل</span>
              </div>
              {selected.decided_at && (
                <div className="flex justify-between">
                  <span className="text-gray-900">{new Date(selected.decided_at).toLocaleString('ar-IQ')}</span>
                  <span className="text-gray-500">تاريخ القرار</span>
                </div>
              )}
              {!selected.hasRequest && (
                <div className="bg-amber-50 rounded-xl px-3 py-2 text-xs text-amber-700">
                  هذا المريض سجّل قبل نظام الموافقة — سيتم إنشاء سجل موافقة تلقائياً عند اتخاذ أي إجراء
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {selected.status !== 'approved' && (
                <button onClick={() => updateStatus(selected, 'approved')} disabled={!!actioning}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4" /> موافقة
                </button>
              )}
              {selected.status !== 'rejected' && (
                <button onClick={() => updateStatus(selected, 'rejected')} disabled={!!actioning}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
                  <XCircle className="w-4 h-4" /> رفض
                </button>
              )}
              {selected.status === 'approved' && (
                <button onClick={() => updateStatus(selected, 'suspended')} disabled={!!actioning}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
                  <Ban className="w-4 h-4" /> إيقاف
                </button>
              )}
              <button onClick={() => setSelected(null)}
                className="px-4 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 text-sm">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
