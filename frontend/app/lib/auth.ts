const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

export async function apiRegister(body: { email: string; password: string; name?: string }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  return res.json(); // { user, message }
}

export async function apiLogin(body: { email: string; password: string }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return res.json(); // { user, message }
}

export async function apiLogout() {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
  return res.json(); // { ok: true }
}

export async function apiMe() {
  const res = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Me failed: ${res.status}`);
  return res.json(); // { user }
}