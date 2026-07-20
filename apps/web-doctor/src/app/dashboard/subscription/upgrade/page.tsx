'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;
const ENTITY_TYPE = 'doctor';

const REQUEST_STATUS_LABELS: Record<string, string> = { pending: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض' };

function authHeaders(json = true): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('doctor-token') : null;
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

export default function UpgradeRequestPage() {
  const [loading, setLoading] = useState(true);
  const [entityId, setEntityId] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const [currentFamilyCode, setCurrentFamilyCode] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState('');
  const [message, setMessage] = useState('');

  const load = async (id: string) => {
    const [plansRes, subRes, reqRes] = await Promise.all([
      fetch(`${API}/subscriptions/plans`, { headers: authHeaders(false) }),
      fetch(`${API}/organizations/${ENTITY_TYPE}/${id}/subscription`, { headers: authHeaders(false) }),
      fetch(`${API}/organizations/${ENTITY_TYPE}/${id}/upgrade-requests`, { headers: authHeaders(false) }),
    ]);
    const plansBody = await plansRes.json();
    setPlans(plansBody.data || []);
    if (subRes.ok) {
      const subBody = await subRes.json();
      setCurrentFamilyCode(subBody.data?.plan?.family_code || '');
    }
    if (reqRes.ok) {
      const reqBody = await reqRes.json();
      setRequests(reqBody.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const id = localStorage.getItem('doctor-id') || '';
    setEntityId(id);
    if (id) load(id); else setLoading(false);
  }, []);

  const pendingPlanChange = requests.find(r => r.request_type === 'plan_change' && r.status === 'pending');

  const handleRequest = async (planId: string) => {
    setSubmitting(planId);
    setMessage('');
    try {
      const r = await fetch(`${API}/organizations/${ENTITY_TYPE}/${entityId}/upgrade-requests`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ requestType: 'plan_change', requestedPlanId: planId }),
      });
      if (r.status === 201) {
        setMessage('تم إرسال طلب الترقية بنجاح — سيتم مراجعته من الإدارة.');
        await load(entityId);
      } else if (r.status === 409) {
        setMessage('لديك طلب ترقية قيد المراجعة بالفعل.');
      } else {
        setMessage('تعذر إرسال الطلب، حاول مجدداً.');
      }
    } catch { setMessage('تعذر إرسال الطلب، حاول مجدداً.'); }
    setSubmitting('');
  };

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">جاري التحميل...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      {message && <div className="bg-teal-50 border border-teal-200 text-teal-700 text-sm rounded-xl px-4 py-3">{message}</div>}

      {pendingPlanChange && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          لديك طلب ترقية إلى خطة &quot;{pendingPlanChange.requested_plan_name_ar || pendingPlanChange.requested_plan_name}&quot; قيد المراجعة.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map(p => {
          const isCurrent = p.family_code === currentFamilyCode;
          return (
            <div key={p.id} className={`bg-white rounded-2xl border p-5 flex flex-col ${isCurrent ? 'border-teal-400 ring-1 ring-teal-200' : 'border-gray-200'}`}>
              <h3 className="font-bold text-gray-900 mb-1">{p.name_ar || p.name}</h3>
              {isCurrent && <span className="text-xs text-teal-600 font-medium mb-2">خطتك الحالية</span>}
              <ul className="text-xs text-gray-500 space-y-1 my-3 flex-1">
                {p.quotas.map((q: any) => (
                  <li key={q.key}>{q.label_ar || q.label}: {q.limit_value === null ? 'غير محدود' : q.limit_value}</li>
                ))}
              </ul>
              <button
                disabled={isCurrent || !!submitting || !!pendingPlanChange}
                onClick={() => handleRequest(p.id)}
                className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                {submitting === p.id ? 'جاري الإرسال...' : isCurrent ? 'الخطة الحالية' : 'طلب الترقية'}
              </button>
            </div>
          );
        })}
      </div>

      {requests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-4">طلباتي السابقة</h3>
          <div className="divide-y divide-gray-100">
            {requests.map(r => (
              <div key={r.id} className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {r.status === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> : r.status === 'approved' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <span className="text-gray-700">{r.requested_plan_name_ar || r.requested_plan_name || r.request_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('ar-IQ')}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'pending' ? 'bg-amber-50 text-amber-700' : r.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {REQUEST_STATUS_LABELS[r.status] || r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
