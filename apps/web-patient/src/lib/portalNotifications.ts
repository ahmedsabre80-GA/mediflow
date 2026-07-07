const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export interface PatientNotif {
  id: string;
  message: string;
  senderName: string;
  isRead: boolean;
  createdAt: string;
}

function getToken(): string {
  try {
    const raw = localStorage.getItem('mediflow-auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed.state?.accessToken || parsed.accessToken || parsed.token || '';
  } catch { return ''; }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

export async function fetchPatientNotifications(userId: string): Promise<PatientNotif[]> {
  try {
    const r = await fetch(
      `${API}/portal-notifications?portalType=patient&recipientId=${encodeURIComponent(userId)}`,
      { headers: authHeaders() }
    );
    const d = await r.json();
    return (d.data || []).map((n: any) => ({
      id: n.id, message: n.message, senderName: n.sender_name || '',
      isRead: n.is_read, createdAt: n.created_at,
    }));
  } catch { return []; }
}

export async function markPatientNotifRead(id: string) {
  try { await fetch(`${API}/portal-notifications/${id}/read`, { method: 'PATCH', headers: authHeaders() }); } catch {}
}
