// ─── AUDIT & ACTIVITY TRACKING SYSTEM ───────────────────────────────────────

export interface AuditEntry {
  id: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  action: string;
  actionAr: string;
  targetType: string;
  targetName: string;
  targetId?: string;
  link?: string;
  timestamp: string;
  timestampMs: number;
}

export interface SessionEntry {
  id: string;
  userEmail: string;
  userName: string;
  userRole: string;
  loginTime: string;
  loginTimeMs: number;
  logoutTime?: string;
  logoutTimeMs?: number;
  isOnline: boolean;
  actions: AuditEntry[];
  forcedOut?: boolean;
}

export interface PlatformNotification {
  id: string;
  type: 'action' | 'login' | 'logout' | 'forced_out';
  actorEmail: string;
  actorName: string;
  message: string;
  link?: string;
  timestamp: string;
  timestampMs: number;
  read: boolean;
}

// ─── CURRENT USER ────────────────────────────────────────────────────────────
export function getCurrentUser() {
  return {
    email: localStorage.getItem('admin-email') || 'admin@mediflow.io',
    name: localStorage.getItem('admin-name') || 'المشرف العام',
    role: localStorage.getItem('admin-role') || 'super_admin',
  };
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────
function isLogAdminActionsEnabled(): boolean {
  try {
    const s = localStorage.getItem('mediflow-platform-settings');
    if (s) {
      const parsed = JSON.parse(s);
      if ('logAdminActions' in parsed) return !!parsed.logAdminActions;
    }
  } catch {}
  return true; // default on
}

export function logAction(
  action: string,
  actionAr: string,
  targetType: string,
  targetName: string,
  targetId?: string,
  link?: string,
) {
  if (!isLogAdminActionsEnabled()) return;
  const user = getCurrentUser();
  const entry: AuditEntry = {
    id: Date.now().toString(),
    actorEmail: user.email,
    actorName: user.name,
    actorRole: user.role,
    action,
    actionAr,
    targetType,
    targetName,
    targetId,
    link,
    timestamp: new Date().toLocaleString('ar-IQ'),
    timestampMs: Date.now(),
  };

  // Save to audit log
  const logs: AuditEntry[] = JSON.parse(localStorage.getItem('mediflow-audit-log') || '[]');
  logs.unshift(entry);
  localStorage.setItem('mediflow-audit-log', JSON.stringify(logs.slice(0, 500)));

  // Add to session actions
  addActionToSession(entry);

  // Add platform notification
  addPlatformNotification({
    id: entry.id,
    type: 'action',
    actorEmail: user.email,
    actorName: user.name,
    message: `${user.name} — ${actionAr}: ${targetName}`,
    link,
    timestamp: entry.timestamp,
    timestampMs: entry.timestampMs,
    read: false,
  });
}

export function getAuditLog(): AuditEntry[] {
  return JSON.parse(localStorage.getItem('mediflow-audit-log') || '[]');
}

// ─── SESSION TRACKING ────────────────────────────────────────────────────────
export function startSession() {
  const user = getCurrentUser();
  const sessionId = `session-${Date.now()}`;
  const session: SessionEntry = {
    id: sessionId,
    userEmail: user.email,
    userName: user.name,
    userRole: user.role,
    loginTime: new Date().toLocaleString('ar-IQ'),
    loginTimeMs: Date.now(),
    isOnline: true,
    actions: [],
  };

  const sessions: SessionEntry[] = JSON.parse(localStorage.getItem('mediflow-sessions') || '[]');
  sessions.unshift(session);
  localStorage.setItem('mediflow-sessions', JSON.stringify(sessions.slice(0, 100)));
  localStorage.setItem('mediflow-current-session', sessionId);

  addPlatformNotification({
    id: Date.now().toString(),
    type: 'login',
    actorEmail: user.email,
    actorName: user.name,
    message: `🟢 ${user.name} سجّل الدخول`,
    link: '/dashboard/audit',
    timestamp: new Date().toLocaleString('ar-IQ'),
    timestampMs: Date.now(),
    read: false,
  });
}

export function endSession(forced = false) {
  const sessionId = localStorage.getItem('mediflow-current-session');
  if (!sessionId) return;

  const user = getCurrentUser();
  const sessions: SessionEntry[] = JSON.parse(localStorage.getItem('mediflow-sessions') || '[]');
  const updated = sessions.map(s =>
    s.id === sessionId
      ? { ...s, logoutTime: new Date().toLocaleString('ar-IQ'), logoutTimeMs: Date.now(), isOnline: false, forcedOut: forced }
      : s
  );
  localStorage.setItem('mediflow-sessions', JSON.stringify(updated));
  localStorage.removeItem('mediflow-current-session');

  addPlatformNotification({
    id: Date.now().toString(),
    type: forced ? 'forced_out' : 'logout',
    actorEmail: user.email,
    actorName: user.name,
    message: forced ? `🔴 تم إخراج ${user.name} من المنصة` : `⚪ ${user.name} سجّل الخروج`,
    link: '/dashboard/audit',
    timestamp: new Date().toLocaleString('ar-IQ'),
    timestampMs: Date.now(),
    read: false,
  });
}

function addActionToSession(entry: AuditEntry) {
  const sessionId = localStorage.getItem('mediflow-current-session');
  if (!sessionId) return;
  const sessions: SessionEntry[] = JSON.parse(localStorage.getItem('mediflow-sessions') || '[]');
  const updated = sessions.map(s =>
    s.id === sessionId ? { ...s, actions: [entry, ...(s.actions || [])].slice(0, 50) } : s
  );
  localStorage.setItem('mediflow-sessions', JSON.stringify(updated));
}

export function getSessions(): SessionEntry[] {
  return JSON.parse(localStorage.getItem('mediflow-sessions') || '[]');
}

export function forceLogoutUser(sessionId: string) {
  const sessions: SessionEntry[] = JSON.parse(localStorage.getItem('mediflow-sessions') || '[]');
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;

  const updated = sessions.map(s =>
    s.id === sessionId
      ? { ...s, logoutTime: new Date().toLocaleString('ar-IQ'), logoutTimeMs: Date.now(), isOnline: false, forcedOut: true }
      : s
  );
  localStorage.setItem('mediflow-sessions', JSON.stringify(updated));

  // Add forced-logout key so when they try to use the app they get redirected
  localStorage.setItem(`force-logout-${session.userEmail}`, 'true');

  const user = getCurrentUser();
  logAction('force_logout', 'إخراج قسري من المنصة', 'مستخدم', session.userName, sessionId, '/dashboard/audit');
}

// ─── PLATFORM NOTIFICATIONS ──────────────────────────────────────────────────
export function addPlatformNotification(notif: PlatformNotification) {
  const notifs: PlatformNotification[] = JSON.parse(localStorage.getItem('mediflow-platform-notifs') || '[]');
  notifs.unshift(notif);
  localStorage.setItem('mediflow-platform-notifs', JSON.stringify(notifs.slice(0, 100)));
}

export function getPlatformNotifications(): PlatformNotification[] {
  return JSON.parse(localStorage.getItem('mediflow-platform-notifs') || '[]');
}

export function markNotificationRead(id: string) {
  const notifs = getPlatformNotifications().map(n => n.id === id ? { ...n, read: true } : n);
  localStorage.setItem('mediflow-platform-notifs', JSON.stringify(notifs));
}

export function markAllNotificationsRead() {
  const notifs = getPlatformNotifications().map(n => ({ ...n, read: true }));
  localStorage.setItem('mediflow-platform-notifs', JSON.stringify(notifs));
}

export function getUnreadCount(): number {
  return getPlatformNotifications().filter(n => !n.read).length;
}

export function deleteNotification(id: string) {
  const notifs = getPlatformNotifications().filter(n => n.id !== id);
  localStorage.setItem('mediflow-platform-notifs', JSON.stringify(notifs));
}

export function deleteAllNotifications() {
  localStorage.setItem('mediflow-platform-notifs', JSON.stringify([]));
}
