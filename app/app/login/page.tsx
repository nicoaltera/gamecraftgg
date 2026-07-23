'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import HandFrame from '@/components/HandFrame';
import { signIn, signUp } from '@/lib/auth-client';
import { getRef } from '@/lib/ref';

// Email + password only (no OAuth, no magic links — the launch stack has no
// email service). New accounts start with 200 credits; the grant happens
// server-side on user creation, not here.
export default function LoginPage() {
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    const res =
      mode === 'up'
        ? await signUp.email({ email, password, name: email.split('@')[0] || 'player' })
        : await signIn.email({ email, password });
    if (res.error) {
      setNote(res.error.message ?? 'That didn’t work — check the email and password.');
      setBusy(false);
      return;
    }
    // Adopt this browser's anonymous games into the account, so nothing made
    // before signing up is lost. Fire-and-forget: a failure here must not
    // block the sign-in itself.
    try {
      await fetch('/api/adopt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref: getRef() }),
      });
    } catch {
      /* adopted next time they sign in */
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="hero draw-in" style={{ minHeight: '60vh' }}>
      <h1>{mode === 'up' ? 'Make an account, get 200 credits' : 'Welcome back'}</h1>
      <form className="prompt-row" onSubmit={submit} style={{ flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="prompt-frame" style={{ width: 'min(420px, 90vw)' }}>
          <HandFrame seed="login-email" strokeWidth={1.8} />
          <input
            className="prompt-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@somewhere.com"
            aria-label="Email"
            autoComplete="email"
          />
        </div>
        <div className="prompt-frame" style={{ width: 'min(420px, 90vw)' }}>
          <HandFrame seed="login-password" strokeWidth={1.8} />
          <input
            className="prompt-input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'up' ? 'a password (8+ characters)' : 'your password'}
            aria-label="Password"
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          />
        </div>
        <button className="btn btn-biro" type="submit" disabled={busy}>
          {busy ? 'signing…' : mode === 'up' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="hero-sub">
        {note ?? (mode === 'up' ? 'Two free games on the house. A game costs 100 credits to make.' : '')}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'up' ? 'in' : 'up');
            setNote(null);
          }}
          style={{ background: 'none', border: 'none', color: 'var(--biro)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
        >
          {mode === 'up' ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </p>
    </main>
  );
}
