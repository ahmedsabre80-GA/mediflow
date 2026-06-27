// ─── PERSISTENT ADMIN STORE ──────────────────────────────────────────────────
// Uses localStorage to persist state across page navigation

export interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  type: 'approval' | 'warning' | 'info';
  message: string;
  timestamp: string;
  read: boolean;
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────
export function addAuditLog(action: string, target: string, details: string) {
  const entries = getAuditLogs();
  const adminEmail = 'admin@mediflow.io';
  const entry: AuditEntry = {
    id: Date.now().toString(),
    actorEmail: adminEmail,
    action,
    target,
    details,
    timestamp: new Date().toLocaleString('ar-IQ'),
  };
  entries.unshift(entry);
  // Keep max 100 entries
  localStorage.setItem('mediflow-audit', JSON.stringify(entries.slice(0, 100)));
  // Also add notification
  addNotification('info', `${action}: ${target}`);
}

export function getAuditLogs(): AuditEntry[] {
  try {
    return JSON.parse(localStorage.getItem('mediflow-audit') || '[]');
  } catch { return []; }
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
export function addNotification(type: Notification['type'], message: string) {
  const notifs = getNotifications();
  notifs.unshift({ id: Date.now().toString(), type, message, timestamp: new Date().toLocaleString('ar-IQ'), read: false });
  localStorage.setItem('mediflow-notifications', JSON.stringify(notifs.slice(0, 50)));
}

export function getNotifications(): Notification[] {
  try {
    return JSON.parse(localStorage.getItem('mediflow-notifications') || '[]');
  } catch { return []; }
}

export function markAllRead() {
  const notifs = getNotifications().map(n => ({ ...n, read: true }));
  localStorage.setItem('mediflow-notifications', JSON.stringify(notifs));
}

export function getUnreadCount(): number {
  return getNotifications().filter(n => !n.read).length;
}

// ─── PERSISTENT STATE ────────────────────────────────────────────────────────
export function getState<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(`mediflow-admin-${key}`);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch { return defaultValue; }
}

export function setState<T>(key: string, value: T) {
  localStorage.setItem(`mediflow-admin-${key}`, JSON.stringify(value));
}
