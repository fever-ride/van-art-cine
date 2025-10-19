'use client'

import { useState } from 'react';
import { apiRegister } from '@/app/lib/auth';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await apiRegister({ email, password, name });
      r.replace('/');
      // r.refresh();
    } catch (e: any) {
      setErr(e.message ?? 'Log in failed');
    } finally {
      setLoading(false);
    }
  }

    return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <input
          type="email"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="text"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Name (optional)"
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Register'}
        </button>
      </form>
    </main>
  );
}