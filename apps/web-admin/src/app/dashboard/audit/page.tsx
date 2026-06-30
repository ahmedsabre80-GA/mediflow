'use client';
import { useState, useEffect } from 'react';
import { Search, LogIn, LogOut, CheckCircle, XCircle, Trash2, Edit2, Plus, Shield, Users, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AuditEntry {
  id: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  actionAr: string;
  action: string;
  targetName: string;
  targetType: string;
  link?: string;
  timestamp: string;
}

interface SessionEntry {
  id: string;
  userName: string;
  userEmail: string;
  userRole: string;
  loginTime: string;
  logoutTime?: string;
  isOnline: boolean;
  forcedOut?: boolean;
  actions: AuditEntry[];
}

const ACTION_ICONS: Record<string, any> = {
  approve: CheckCircle,
  reject: XCircle,
  delete: Trash2,
  add: Plus,
  edit: Edit2,
  login: LogIn,
  logout: LogOut,
  force_logout: LogOut,
  send_message: Shield,
};

const ACTION_COLORS: Record<string, string> = {
  approve: 'text-green-600 bg-green-50',
  reject: 'text-red-600 bg-red-50',
  delete: 'text-red-700 bg-red-50',
  add: 'text-sky-600 bg-sky-50',
  edit: 'text-indigo-600 bg-indigo-50',
  login: 'text-green-600 bg-green-50',
  logout: 'text-gray-600 bg-gray-50',
  force_logout: 'text-red-600 bg-red-50',
  send_message: 'text-purple-600 bg-purple-50',
};

export default function AuditPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'sessions' | 'actions'>('sessions');
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    // Load sessions
    const savedSessions: SessionEntry[] = JSON.parse(localStorage.getItem('mediflow-sessions') || '[]');
    setSessions(savedSessions);
    // Load audit log
    const savedLog: AuditEntry[] = JSON.parse(localStorage.getItem('mediflow-audit-log') || '[]');
    setAuditLog(savedLog);
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const deleteAction = (id: string) => {
    const updated = auditLog.filter(e => e.id !== id);
    setAuditLog(updated);
    localStorage.setItem('mediflow-audit-log', JSON.stringify(updated));
  };

  const clearAllActions = () => {
    if (!confirm('هل تريد مسح جميع الإجراءات المسجلة؟')) return;
    setAuditLog([]);
    localStorage.setItem('mediflow-audit-log', JSON.stringify([]));
    showToast('🗑️ تم مسح سجل الإجراءات');
  };

  const forceLogout = (sessionId: string, userName: string) => {
    if (!confirm(`هل تريد إخراج ${userName} من المنصة؟`)) return;
    const updated = sessions.map(s =>
      s.id === sessionId ? { ...s, isOnline: false, forcedOut: true, logoutTime: new Date().toLocaleString('ar-IQ') } : s
    );
    setSessions(updated);
    localStorage.setItem('mediflow-sessions', JSON.stringify(updated));
    showToast(`🔴 تم إخراج ${userName} من المنصة`);
  };

  const filteredSessions = sessions.filter(s =>
    !search || s.userName.includes(search) || s.userEmail.includes(search)
  );

  const filteredLog = auditLog.filter(e =>
    !search || e.actorName.includes(search) || e.actionAr.includes(search) || e.targetName.includes(search)
  );

  const onlineSessions = sessions.filter(s => s.isOnline);

  return (
    <div className="space-y-6" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">سجل المراقبة</h1>
          <p className="text-sm text-gray-500 mt-1">تتبع كامل لجلسات الفريق وإجراءاتهم</p>
        </div>
        <div className="flex gap-2">
          <span className="bg-green-100 text-green-700 text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
            {onlineSessions.length} متصل الآن
          </span>
          <span className="bg-sky-100 text-sky-700 text-sm font-medium px-3 py-1 rounded-full">{auditLog.length} إجراء مسجل</span>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الإجراء..." className="bg-transparent flex-1 text-sm outline-none" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { k: 'sessions', l: `جلسات الفريق (${sessions.length})`, icon: Users },
          { k: 'actions', l: `سجل الإجراءات (${auditLog.length})`, icon: Shield },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === t.k ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" />
              {t.l}
            </button>
          );
        })}
      </div>

      {/* Sessions Tab */}
      {tab === 'sessions' && (
        <div className="space-y-4">
          {filteredSessions.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد جلسات مسجلة بعد</p>
              <p className="text-xs mt-1">ستظهر هنا عند دخول أي عضو من الفريق</p>
            </div>
          ) : filteredSessions.map(session => (
            <div key={session.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      session.isOnline ? 'bg-green-100 text-green-700' :
                      session.forcedOut ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {session.isOnline ? '🟢 متصل الآن' : session.forcedOut ? '🔴 أُخرج قسراً' : '⚪ خرج'}
                    </span>
                    {session.isOnline && (
                      <button onClick={() => forceLogout(session.id, session.userName)}
                        className="flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium">
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

                {/* Times */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> وقت الدخول</p>
                    <p className="text-sm font-bold text-green-700">🟢 {session.loginTime}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${session.logoutTime ? 'bg-gray-50' : 'bg-sky-50'}`}>
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> وقت الخروج</p>
                    <p className="text-sm font-bold text-gray-700">
                      {session.logoutTime ? `⚪ ${session.logoutTime}` : session.isOnline ? '— لا يزال متصلاً' : '— غير مسجل'}
                    </p>
                  </div>
                </div>

                {/* Actions in this session */}
                {session.actions && session.actions.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" />
                      الإجراءات في هذه الجلسة ({session.actions.length})
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {session.actions.map(action => {
                        const actionKey = action.action?.split('_')[0] || 'default';
                        const colorClass = ACTION_COLORS[actionKey] || 'text-gray-600 bg-gray-50';
                        return (
                          <div key={action.id}
                            onClick={() => action.link && router.push(action.link)}
                            className={`flex items-center gap-3 text-xs rounded-lg px-3 py-2 ${colorClass} ${action.link ? 'cursor-pointer hover:opacity-80' : ''}`}>
                            <span className="text-gray-400 shrink-0">{action.timestamp}</span>
                            <span className="font-medium flex-1">{action.actionAr}</span>
                            <span className="font-bold">{action.targetName}</span>
                            {action.link && <span className="text-xs opacity-70">←</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-center text-xs text-gray-400">
                    {session.isOnline ? 'لم يقم بأي إجراء بعد' : 'دخل وخرج فقط — لم يقم بأي إجراء'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions Log Tab */}
      {tab === 'actions' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {auditLog.length > 0 && (
            <div className="px-6 py-3 border-b flex justify-end">
              <button onClick={clearAllActions}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg font-medium border border-red-200">
                <Trash2 className="w-3.5 h-3.5" /> مسح الكل
              </button>
            </div>
          )}
          {filteredLog.length === 0 ? (
            <div className="px-6 py-16 text-center text-gray-400">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد إجراءات مسجلة بعد</p>
              <p className="text-xs mt-1">ستظهر هنا عند الموافقة أو الرفض أو الحذف أو الإضافة</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredLog.map(entry => {
                const actionKey = entry.action?.split('_')[0] || 'default';
                const Icon = ACTION_ICONS[actionKey] || Shield;
                const colorClass = ACTION_COLORS[actionKey] || 'text-indigo-600 bg-indigo-50';
                return (
                  <div key={entry.id}
                    className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors group">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => entry.link && router.push(entry.link)} style={{cursor: entry.link ? 'pointer' : 'default'}}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{entry.actorName}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{entry.actorEmail}</span>
                        <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full">{entry.actorRole}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5">
                        <span className="font-medium">{entry.actionAr}</span>
                        {' — '}
                        <span className="text-sky-600 font-medium">{entry.targetName}</span>
                        {entry.targetType && <span className="text-gray-400 text-xs mr-1">({entry.targetType})</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {entry.timestamp}
                        {entry.link && <span className="text-sky-500 mr-2">← اضغط للعرض</span>}
                      </p>
                    </div>
                    <button onClick={() => deleteAction(entry.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
