'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;
const ENTITY_TYPE = 'doctor';

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط', trialing: 'تجريبي', past_due: 'متأخر الدفع', canceled: 'ملغى', expired: 'منتهي',
};

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('doctor-token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const entityId = localStorage.getItem('doctor-id');
    if (!entityId) { setError('تعذر تحديد الطبيب'); setLoading(false); return; }
    fetch(`${API}/organizations/${ENTITY_TYPE}/${entityId}/subscription`, { headers: authHeaders() })
      .then(async r => {
        if (r.status === 404) { setData(null); return; }
        if (!r.ok) throw new Error('failed');
        const body = await r.json();
        setData(body.data);
      })
      .catch(() => setError('تعذر تحميل بيانات الاشتراك'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">جاري التحميل...</div>;
  if (error) return <div className="p-6 text-center text-red-500 text-sm">{error}</div>;
  if (!data) return <div className="p-10 text-center text-gray-400 text-sm">لا يوجد اشتراك بعد.</div>;

  const { plan, quotas, organization } = data;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">الخطة الحالية</p>
          <h2 className="text-2xl font-bold text-gray-900">{plan?.name_ar || plan?.name || '—'}</h2>
          <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${organization.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[organization.status] || organization.status}
          </span>
        </div>
        <Link href="/dashboard/subscription/upgrade"
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <ArrowUpCircle className="w-4 h-4" /> طلب ترقية
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-900 mb-4">الحدود والاستخدام</h3>
        <div className="space-y-4">
          {quotas.length === 0 && <p className="text-sm text-gray-400">لا توجد حدود معرّفة لهذه الخطة.</p>}
          {quotas.map((q: any) => {
            const unlimited = q.limit_value === null;
            const pct = !unlimited && q.is_metered && q.limit_value > 0 ? Math.min(100, (q.used / q.limit_value) * 100) : 0;
            return (
              <div key={q.key}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span className="font-medium text-gray-700">{q.label_ar || q.label}</span>
                  <span className="text-gray-500">
                    {q.is_metered ? (unlimited ? `${q.used ?? 0} — غير محدود` : `${q.used} / ${q.limit_value}`) : (unlimited ? 'غير محدود' : q.limit_value)}
                  </span>
                </div>
                {q.is_metered && !unlimited && (
                  <>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">المتبقي: {q.remaining}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
