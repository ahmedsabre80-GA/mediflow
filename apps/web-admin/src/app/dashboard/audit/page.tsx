'use client';
import { useState, useEffect } from 'react';
import { Search, Shield, User, Building2, ShoppingCart, FileText, LogOut, LogIn, Trash2, CheckCircle, XCircle, Ban } from 'lucide-react';
import { getAuditLog, getSessions, forceLogoutUser, type AuditEntry, type SessionEntry } from '@/lib/auditSystem';
import { useRouter } from 'next/navigation';

const ACTION_ICONS: Record<string, any> = {
  approve: CheckCircle,
  reject: XCircle,
  suspend: Ban,
  activate: CheckCircle,
  delete: Trash2,
  login: LogIn,
  logout: LogOut,
  force_logout: LogOut,
  default: Shield,
};

const ACTION_COLORS: Record<string, string> = {
  approve: 'text-green-600 bg-green-50',
  reject: 'text-red-600 bg-red-50',
  suspend: 'text-amber-600 bg-amber-50',
  activate: 'text-green-600 bg-green-50',
  delete: 'text-red-600 bg-red-50',
  login: 'text-sky-600 bg-sky-50',
  logout: 'text-gray-600 bg-gray-50',
  force_logout: 'text-red-600 bg-red-50',
  default: 'text-indigo-600 bg-indigo-50',
};

export default function AuditPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'log' | 'sessions'>('log');
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setAuditLog(getAuditLog());
    setSessions(getSessions());
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleForceLogout = (sessionId: string, userName: string) => {
    if (!confirm(`هل تريد إخراج ${userName} من المنصة؟`)) return;
    forceLogoutUser(sessionId);
    setSessions(getSessions());
    showToast(`🔴 تم إخراج ${userName} من المنصة`);
  };

  const filteredLog = auditLog.filter(e =>
    !search || e.actorName.includes(search) || e.actionAr.includes(search) || e.targetName.includes(search)
  );

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">سجل المراقبة</h1>
          <p className="text-sm text-gray-500 mt-1">جميع الإجراءات وجلسات الفريق محفوظة هنا</p>
        </div>
        <div className="flex gap-2">
          <span className="bg-sky-100 text-sky-700 text-sm font-medium px-3 py-1 rounded-full">{auditLog.length} إجراء</span>
          <span className="bg-green-100 text-green-700 text-sm font-medium px-3 py-1 rounded-full">
            {sessions.filter(s => s.isOnline).length} متصل الآن
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[{k:'log',l:'سجل الإجراءات'},{k:'sessions',l:'جلسات الفريق'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Audit Log Tab */}
      {tab === 'log' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الإجراء..." className="bg-transparent flex-1 text-sm outline-none" />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {filteredLog.length === 0 ? (
              <div className="px-6 py-16 text-center text-gray-400">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد إجراءات مسجلة بعد</p>
                <p className="text-xs mt-1">ستظهر هنا عند الموافقة أو الرفض أو الحذف</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredLog.map(entry => {
                  const actionKey = entry.action.split('_')[0];
                  const Icon = ACTION_ICONS[actionKey] || ACTION_ICONS.default;
                  const colorClass = ACTION_COLORS[actionKey] || ACTION_COLORS.default;
                  return (
                    <div key={entry.id}
                      onClick={() => entry.link && router.push(entry.link)}
                      className={`px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors ${entry.link ? 'cursor-pointer' : ''}`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900">{entry.actorName}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{entry.actorEmail}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">
                          <span className="font-medium">{entry.actionAr}</span>
                          {' — '}
                          <span className="text-sky-600">{entry.targetName}</span>
                          {entry.link && <span className="text-xs text-gray-400 mr-2">← اضغط للعرض</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{entry.timestamp}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions Tab */}
      {tab === 'sessions' && (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center text-gray-400">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد جلسات مسجلة بعد</p>
            </div>
          ) : sessions.map(session => (
            <div key={session.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${session.isOnline ? 'bg-green-100 text-green-700' : session.forcedOut ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {session.isOnline ? '🟢 متصل الآن' : session.forcedOut ? '🔴 أُخرج قسراً' : '⚪ خرج'}
                    </span>
                    {session.isOnline && (
                      <button onClick={() => handleForceLogout(session.id, session.userName)}
                        className="flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
                        <LogOut className="w-3.5 h-3.5" />
                        تسجيل الخروج
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{session.userName}</p>
                    <p className="text-xs text-gray-500">{session.userEmail}</p>
                    <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{session.userRole}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">وقت الدخول</p>
                    <p className="text-sm font-bold text-green-700">🟢 {session.loginTime}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${session.logoutTime ? 'bg-gray-50' : 'bg-sky-50'}`}>
                    <p className="text-xs text-gray-500 mb-1">وقت الخروج</p>
                    <p className="text-sm font-bold text-gray-700">
                      {session.logoutTime ? `⚪ ${session.logoutTime}` : '— لا يزال متصلاً'}
                    </p>
                  </div>
                </div>

                {session.actions && session.actions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">الإجراءات في هذه الجلسة ({session.actions.length})</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {session.actions.map(action => (
                        <div key={action.id}
                          onClick={() => action.link && router.push(action.link)}
                          className={`flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2 ${action.link ? 'cursor-pointer hover:bg-gray-100' : ''}`}>
                          <span className="text-gray-400">{action.timestamp}</span>
                          <span className="font-medium text-gray-700">{action.actionAr}</span>
                          <span className="text-sky-600">{action.targetName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!session.actions || session.actions.length === 0) && (
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-center text-xs text-gray-400">
                    دخل وخرج فقط — لم يقم بأي إجراء
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
