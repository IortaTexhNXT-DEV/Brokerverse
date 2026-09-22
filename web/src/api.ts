const TOKEN_KEY = 'bv.token';

export function getToken(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
export function setToken(t: string | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  if (opts.raw) return (await res.text()) as unknown as T;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401) { setToken(null); window.dispatchEvent(new Event('bv:logout')); }
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });

export const peso = (n: number | string | null | undefined) => `₱${Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const todayIso = () => new Date().toISOString().slice(0, 10);
