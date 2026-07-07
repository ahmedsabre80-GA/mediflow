const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const PORTAL = 'doctor';
const LOCAL_KEY = 'doctor-notifications';
const TOKEN_KEY = 'doctor-token';

export interface PortalNotif {
  id: string; message: string; senderName: string; isRead: boolean; createdAt: string;
}

function getToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

export async function fetchNotifications(recipientId: string): Promise<PortalNotif[]> {
  try {
    const r = await fetch(
      `${API}/portal-notifications?portalType=${PORTAL}&recipientId=${encodeURIComponent(recipientId)}`,
      { headers: authHeaders() }
    );
    const d = await r.json();
    return (d.data || []).map((n: any) => ({ id: n.id, message: n.message, senderName: n.sender_name || '', isRead: n.is_read, createdAt: n.created_at }));
  } catch { return getLocalNotifications(); }
}

export async function markNotifRead(id: string) {
  try { await fetch(`${API}/portal-notifications/${id}/read`, { method: 'PATCH', headers: authHeaders() }); } catch {}
  const local = getLocalNotifications().map(n => n.id === id ? { ...n, isRead: true } : n);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
}

export function getLocalNotifications(): PortalNotif[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}

export function addLocalNotification(msg: string, sender = 'النظام') {
  const notifs = getLocalNotifications();
  notifs.unshift({ id: Date.now().toString(), message: msg, senderName: sender, isRead: false, createdAt: new Date().toISOString() });
  localStorage.setItem(LOCAL_KEY, JSON.stringify(notifs.slice(0, 50)));
}
