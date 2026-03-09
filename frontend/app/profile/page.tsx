'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  apiGetMyProfile, 
  apiUpdateMyName, 
  apiUpdateMyPassword, 
  apiDeleteMyAccount,
  User
} from '@/app/lib/profile';
import { Noto_Sans } from 'next/font/google';

const noto = Noto_Sans({ subsets: ['latin'], weight: ['400', '600', '700'] });

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Name form
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  // Password form
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const u = await apiGetMyProfile();
        if (cancelled) return;

        if (!u) {
          setLoadError('You are not logged in.');
          setLoading(false);
          return;
        }

        setUser(u);
        setNameInput(u.name ?? '');
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e as Error;
        setLoadError(err.message || 'Failed to load profile');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setNameMessage(null);
    setSavingName(true);
    try {
      const updated = await apiUpdateMyName(nameInput);
      setUser(updated);
      setNameMessage('Name updated.');
    } catch (e: unknown) {
      const err = e as Error;
      setNameMessage(err.message || 'Could not update name.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (!password || password.length < 8) {
      setPasswordMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordMessage('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await apiUpdateMyPassword(password);
      setPassword('');
      setPasswordConfirm('');
      setPasswordMessage('Password updated.');
    } catch (e: unknown) {
      const err = e as Error;
      setPasswordMessage(err.message || 'Could not update password.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteMessage(null);

    if (deleteConfirm !== 'DELETE') {
      setDeleteMessage('Please type DELETE in all caps to confirm.');
      return;
    }

    setDeleting(true);
    try {
      await apiDeleteMyAccount();
      router.push('/');
      router.refresh();
    } catch (e: unknown) {
      const err = e as Error;
      setDeleteMessage(err.message || 'Could not delete account.');
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className={`${noto.className} mx-auto max-w-3xl px-4 py-8`}>
        <h1 className="text-2xl font-semibold text-primary">My Profile</h1>
        <p className="mt-4 text-sm text-muted">Loading your profile…</p>
      </main>
    );
  }

  if (loadError || !user) {
    return (
      <main className={`${noto.className} mx-auto max-w-3xl px-4 py-8`}>
        <h1 className="text-2xl font-semibold text-primary">My Profile</h1>
        <p className="mt-4 text-sm text-error-text">
          {loadError || 'You are not logged in.'}
        </p>
      </main>
    );
  }

  const nameChanged = (user.name ?? '') !== nameInput.trim();
  const pillButton =
    'inline-flex items-center rounded-[10px] px-4 py-1.5 text-sm font-semibold';

  return (
    <main className={`${noto.className} mx-auto max-w-3xl px-4 py-8`}>
      <header>
        <h1 className="text-2xl font-semibold text-primary">My Profile</h1>
        <p className="mt-2 text-sm text-muted">
          Manage your account details, password, and profile.
        </p>
      </header>

      <section className="mt-6 rounded-2xl border border-border-subtle bg-surface p-6 shadow-sm">
        {/* Account summary */}
        <div>
          <h2 className="text-base font-semibold text-primary">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <dt className="w-32 text-muted">Email</dt>
              <dd className="font-medium text-primary break-all">
                {user.email}
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <dt className="w-32 text-muted">Member since</dt>
              <dd className="text-primary">
                {new Date(user.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-dashed border-border-subtle" />

        {/* Name section */}
        <div>
          <h2 className="text-base font-semibold text-primary">Profile</h2>
          <p className="mt-1 text-sm text-muted">
            Update the name shown in your account.
          </p>

          <form onSubmit={handleSaveName} className="mt-4 space-y-4">
            <div className="space-y-1 text-sm">
              <label htmlFor="name" className="block font-medium text-primary">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Your name"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingName || !nameChanged}
                className={`${pillButton} bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-disabled`}
              >
                {savingName ? 'Saving…' : 'Save changes'}
              </button>
              {nameMessage && (
                <p className="text-sm text-muted">{nameMessage}</p>
              )}
            </div>
          </form>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-dashed border-border-subtle" />

        {/* Password section */}
        <div>
          <h2 className="text-base font-semibold text-primary">Password</h2>
          <p className="mt-1 text-sm text-muted">
            Set a new password for your account.
          </p>

          <form onSubmit={handleSavePassword} className="mt-4 space-y-4">
            <div className="space-y-1 text-sm">
              <label
                htmlFor="new-password"
                className="block font-medium text-primary"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1 text-sm">
              <label
                htmlFor="confirm-password"
                className="block font-medium text-primary"
              >
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingPassword}
                className={`${pillButton} bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-disabled`}
              >
                {savingPassword ? 'Saving…' : 'Update password'}
              </button>
              {passwordMessage && (
                <p
                  className={`text-sm ${
                    passwordMessage.includes('updated')
                      ? 'text-muted'
                      : 'text-error-text'
                  }`}
                >
                  {passwordMessage}
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-dashed border-error-border" />

        {/* Danger zone (inside same card, but red emphasis) */}
        <div>
          <h2 className="text-base font-semibold text-error-text">Danger zone</h2>
          <p className="mt-1 text-sm text-error-text">
            Deleting your account will remove your profile and watchlist. This action
            cannot be undone.
          </p>

          <form onSubmit={handleDeleteAccount} className="mt-4 space-y-3">
            <div className="space-y-1 text-sm">
              <label
                htmlFor="delete-confirm"
                className="block font-medium text-error-text"
              >
                Type <span className="font-mono">DELETE</span> to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="block w-full rounded-lg border border-error-border bg-surface px-3 py-2 text-sm text-primary shadow-sm focus:border-error focus:outline-none focus:ring-1 focus:ring-error"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={deleting}
                className={`${pillButton} bg-error text-white hover:bg-error-hover disabled:cursor-not-allowed disabled:bg-error-border`}
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
              {deleteMessage && (
                <p className="text-sm text-error-text">{deleteMessage}</p>
              )}
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}