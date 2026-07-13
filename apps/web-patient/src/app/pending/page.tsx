'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, LogOut, Pill } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export default function PendingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('mediflow-auth');
      if (!stored) { router.push('/login'); return; }
      const parsed = JSON.parse(stored);
      if (!parsed.state?.isAuthenticated) { router.push('/login'); return; }
      setName(parsed.state?.user?.name || '');
      // If already approved, go to dashboard
      if (parsed.state?.isApproved) router.push('/dashboard');
    } catch { router.push('/login'); }
  }, [router]);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const stored = localStorage.getItem('mediflow-auth');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const userId = parsed.state?.user?.id;
      const token = parsed.state?.accessToken || '';
      const res = await fetch(`${PHARMACY_API}/admin-requests?portal_type=patient&requester_id=${userId}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      const record = data.data?.[0];
      if (record?.status === 'approved') {
        parsed.state.isApproved = true;
        localStorage.setItem('mediflow-auth', JSON.stringify(parsed));
        router.push('/dashboard');
      } else if (record?.status === 'rejected') {
        alert('تم رفض طلبك من قبل الإدارة. يرجى التواصل مع الدعم.');
      }
    } catch {}
    finally { setChecking(false); }
  };

  const logout = () => {
    localStorage.removeItem('mediflow-auth');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-teal-50 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 mb-8">
          <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center">
            <Pill className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-sky-700">ميديفلو</span>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-8">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">في انتظار الموافقة</h1>
          {name && <p className="text-sky-600 font-medium mb-3">أهلاً {name}</p>}
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            تم استلام طلب تسجيلك بنجاح. حسابك قيد المراجعة من قبل إدارة ميديفلو.
            ستتمكن من استخدام جميع الخدمات فور الموافقة على طلبك.
          </p>

          <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-right space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span>البحث عن الأدوية والصيدليات</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>طلب الأدوية والتوصيل — ينتظر الموافقة</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>حجز موعد مع طبيب — ينتظر الموافقة</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>رفع الوصفات الطبية — ينتظر الموافقة</span>
            </div>
          </div>

          <button onClick={checkStatus} disabled={checking}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors mb-3 disabled:opacity-60 flex items-center justify-center gap-2">
            {checking ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : null}
            {checking ? 'جاري التحقق...' : 'تحقق من حالة الطلب'}
          </button>

          <button onClick={logout}
            className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 text-sm py-2">
            <LogOut className="w-4 h-4" /> تسجيل الخروج
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-4">عادةً ما تتم المراجعة خلال 24 ساعة</p>
      </div>
    </div>
  );
}
