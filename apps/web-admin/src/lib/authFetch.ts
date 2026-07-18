export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const t = localStorage.getItem('admin-token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
  } catch {
    return { 'Content-Type': 'application/json', ...extra };
  }
}

export async function authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers as Record<string, string> || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem('admin-token');
    window.location.href = '/auth/login';
  }
  return res;
}
