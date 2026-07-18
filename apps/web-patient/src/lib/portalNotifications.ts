import { useAuthStore } from '@/stores/auth.store';

const API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';

export interface PatientNotif {
  id: string;
  message: string;
  senderName: string;
  senderId: string;
  isRead: boolean;
  createdAt: string;
}

function getToken(): string {
  // accessToken is not persisted to localStorage (by design in the Zustand store),
  // so we must read from the in-memory store state via getState().
  try {
    return useAuthStore.getState().accessToken || '';
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
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map((n: any) => ({
      id: n.id, message: n.message, senderName: n.sender_name || '',
      senderId: n.sender_id || '', isRead: n.is_read, createdAt: n.created_at,
    }));
  } catch { return []; }
}

export async function markPatientNotifRead(id: string) {
  try { await fetch(`${API}/portal-notifications/${id}/read`, { method: 'PATCH', headers: authHeaders() }); } catch {}
}
