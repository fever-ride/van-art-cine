import { fetchWithAuth } from '@/app/lib/auth';

export type User = {
  uid: number;
  name: string | null;
  email: string;
  role: string;
  created_at: string;
};

export async function apiGetMyProfile(): Promise<User | null> {
  const res = await fetchWithAuth('/api/user/me', { method: 'GET' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const data = await res.json(); // { user }
  return data.user;
}

export async function apiUpdateMyName(name: string): Promise<User> {
  const res = await fetchWithAuth('/api/user/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.message || body?.error || 'Failed to update name';
    throw new Error(msg);
  }

  const data = await res.json(); // { user }
  return data.user;
}

export async function apiUpdateMyPassword(password: string): Promise<void> {
  const res = await fetchWithAuth('/api/user/me/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.message || body?.error || 'Failed to update password';
    throw new Error(msg);
  }
}

export async function apiDeleteMyAccount(): Promise<void> {
  const res = await fetchWithAuth('/api/user/me', {
    method: 'DELETE',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.message || body?.error || 'Failed to delete account';
    throw new Error(msg);
  }
}