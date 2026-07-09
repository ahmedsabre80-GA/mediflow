'use client';
import { useEffect, useState } from 'react';
import { KeyRound, Check, X, RefreshCw } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const AUTH_API     = 'https://mediflowauth-service-production.up.railway.app/api/v1/auth';
const SECRET       = 'mediflow-delete-2026';

function adminH(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('admin-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch { return { 'Content-Type': 'application/json', ...extra }; }
}

interface ResetRequest {
  id: string;
  pharmacyName: string;
  pharmacyEmail: string;
  pharmacyId: string;
  createdAt: string;
  handled: boolean;
}

function parseRequest(n: any): ResetRequest | null {
  const msg: string = n.message || '';
  if (!msg.includes('[reset_password_request]')) return null;
  const email = msg.match(/\[pharmacy_email:([^\]]+)\]/)?.[1] || '';
  const pid   = msg.match(/\[pharmacy_id:([^\]]+)\]/)?.[1]   || '';
  return {
    id: n.id,
    pharmacyName: n.sender_name || n.senderName || '—',
    pharmacyEmail: email,
    pharmacyId: pid,
    createdAt: n.created_at || n.createdAt,
    handled: false,
  };
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function PasswordResetsPage() {
  const [requests,    setRequests]    = useState<ResetRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState<string | null>(null);
  const [done,        setDone]        = useState<Record<string, 'approved' | 'rejected'>>({});
  const [shownPass,   setShownPass]   = useState<{ name: string; email: string; pass: string } | null>(null);

  useEffect(() => {
    fetch(`${PHARMACY_API}/portal-notifications?portalType=admin&recipientId=admin`, {
      headers: adminH(),
    })
      .then(r => r.json())
      .then(d => {
        const notifs: any[] = d.data || [];
        setRequests(notifs.map(parseRequest).filter(Boolean) as ResetRequest[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (req: ResetRequest) => {
    if (!req.pharmacyEmail) { alert('لا يوجد بريد إلكتروني لهذه الصيدلية'); return; }
    setActing(req.id);
    try {
      const tempPass = generateTempPassword();

      // Reset password in auth service
      const res = await fetch(`${AUTH_API}/admin/reset-password`, {
        method: 'POST',
        headers: adminH(),
        body: JSON.stringify({ email: req.pharmacyEmail, newPassword: tempPass, secret: SECRET }),
      });

      if (!res.ok) { alert('فشل إعادة التعيين — تحقق من البريد الإلكتروني'); setActing(null); return; }

      // Notify pharmacy with temp password
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST',
        headers: adminH(),
        body: JSON.stringify({
          portalType: 'pharmacy',
          recipientId: req.pharmacyId,
          senderName: 'إدارة ميديفلو',
          message: `🔑 تم إعادة تعيين كلمة المرور\n━━━━━━━━━━━━━━━\nكلمة المرور المؤقتة:\n${tempPass}\n━━━━━━━━━━━━━━━\nيرجى تسجيل الدخول وتغيير كلمة المرور في أقرب وقت.`,
        }),
      });

      // Delete the request notification
      await fetch(`${PHARMACY_API}/portal-notifications/${req.id}`, { method: 'DELETE' }).catch(() => {});

      setDone(prev => ({ ...prev, [req.id]: 'approved' }));
      setShownPass({ name: req.pharmacyName, email: req.pharmacyEmail, pass: tempPass });
    } catch (e) { alert('حدث خطأ — حاول مجدداً'); }
    setActing(null);
  };

  const handleReject = async (req: ResetRequest) => {
    setActing(req.id);
    try {
      // Notify pharmacy of rejection
      await fetch(`${PHARMACY_API}/portal-notifications`, {
        method: 'POST',
        headers: adminH(),
        body: JSON.stringify({
          portalType: 'pharmacy',
          recipientId: req.pharmacyId,
          senderName: 'إدارة ميديفلو',
          message: `❌ تم رفض طلب إعادة تعيين كلمة المرور\nإذا كنت بحاجة لمساعدة، تواصل مع الدعم الفني.`,
        }),
      });

      // Delete the request notification
      await fetch(`${PHARMACY_API}/portal-notifications/${req.id}`, { method: 'DELETE' }).catch(() => {});

      setDone(prev => ({ ...prev, [req.id]: 'rejected' }));
    } catch {}
    setActing(null);
  };

  const pending  = requests.filter(r => !done[r.id]);
  const handled  = requests.filter(r => !!done[r.id]);

  return (
    <div className="space-y-6" dir="rtl">

      {/* Temp password dialog */}
      {shownPass && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">تمت الموافقة</h3>
            <p className="text-sm text-gray-500 mb-4">{shownPass.name} — {shownPass.email}</p>
            <p className="text-xs text-gray-500 mb-2">كلمة المرور المؤقتة</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <span className="font-mono text-lg font-bold tracking-widest text-gray-900 select-all">{shownPass.pass}</span>
              <button onClick={() => navigator.clipboard.writeText(shownPass.pass)}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium shrink-0">نسخ</button>
            </div>
            <p className="text-xs text-gray-400 mb-5">تم إرسالها أيضاً كإشعار داخل بوابة الصيدلية</p>
            <button onClick={() => setShownPass(null)}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">
              حسناً
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-orange-500" />
          طلبات إعادة كلمة المرور
        </h2>
        <span className="text-sm text-gray-500">{pending.length} طلب معلّق</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="bg-white rounded-2xl p-5 animate-pulse h-24" />)}</div>
      ) : pending.length === 0 && handled.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <KeyRound className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">لا توجد طلبات معلّقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pending */}
          {pending.map(req => (
            <div key={req.id} className="bg-white rounded-2xl shadow-sm border-r-4 border-orange-400 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-bold text-gray-900">{req.pharmacyName}</p>
                  <p className="text-sm text-gray-500">البريد: <span className="text-gray-700 font-medium" dir="ltr">{req.pharmacyEmail || '—'}</span></p>
                  <p className="text-xs text-gray-400">{new Date(req.createdAt).toLocaleString('ar-IQ')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleReject(req)} disabled={acting === req.id}
                    className="flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors">
                    <X className="w-4 h-4" /> رفض
                  </button>
                  <button onClick={() => handleApprove(req)} disabled={acting === req.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
                    {acting === req.id
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <Check className="w-4 h-4" />}
                    موافقة وإرسال كلمة مرور مؤقتة
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Handled */}
          {handled.map(req => (
            <div key={req.id} className={`bg-white rounded-2xl shadow-sm border-r-4 p-5 opacity-60 ${done[req.id] === 'approved' ? 'border-green-400' : 'border-red-300'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900">{req.pharmacyName}</p>
                  <p className="text-sm text-gray-500" dir="ltr">{req.pharmacyEmail}</p>
                </div>
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${done[req.id] === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {done[req.id] === 'approved' ? '✓ تمت الموافقة' : '✗ مرفوض'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
