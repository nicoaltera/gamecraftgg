'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';

const PACKS = [
  { key: 'small', label: '1000 credits', price: '$10', note: 'one game' },
  { key: 'medium', label: '5500 credits', price: '$50', note: 'five games + a bonus' },
  { key: 'large', label: '12000 credits', price: '$100', note: 'twelve games, best rate' },
];

const REASON_LABEL: Record<string, string> = {
  signup_grant: 'welcome credits',
  purchase: 'credit pack',
  debit: 'made a game',
  refund: 'build failed — refunded',
  share_reward: 'a friend played your game',
};

type Ledger = { balance: number; entries: { delta: number; reason: string; ref_id: string; created_at: number }[] };

export default function CreditsPage() {
  const { data: session, isPending } = useSession();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  // After Polar checkout we land back here with ?checkout=success; the webhook
  // may lag the redirect by a few seconds, so poll until the balance moves.
  const pollUntil = useRef(0);

  const load = useCallback(() => {
    fetch('/api/credits')
      .then((r) => r.json())
      .then((d) => d.signedIn && setLedger({ balance: d.balance, entries: d.entries ?? [] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!session) return;
    load();
    if (new URLSearchParams(window.location.search).get('checkout') === 'success') {
      setNote('Payment received — crediting your account…');
      pollUntil.current = Date.now() + 60_000;
      const before = ledger?.balance;
      const t = setInterval(async () => {
        const d = await fetch('/api/credits').then((r) => r.json()).catch(() => null);
        if (d?.signedIn) setLedger({ balance: d.balance, entries: d.entries ?? [] });
        const landed = d?.entries?.some((e: { reason: string }) => e.reason === 'purchase');
        if ((landed && d.balance !== before) || Date.now() > pollUntil.current) {
          clearInterval(t);
          setNote(landed ? 'Credits added. Go make something.' : 'Payment received — credits are taking a moment. They’ll appear shortly.');
        }
      }, 2500);
      return () => clearInterval(t);
    }
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buy(pack: string) {
    setBusyPack(pack);
    setNote(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setNote(data.error ?? 'Checkout didn’t start — try again.');
    } catch {
      setNote('Checkout didn’t start — try again.');
    }
    setBusyPack(null);
  }

  if (isPending) return null;
  if (!session)
    return (
      <main className="hero draw-in">
        <h1>Credits</h1>
        <p className="hero-sub">
          <Link href="/login">Sign in</Link> to see your credits — new accounts start with 2000.
        </p>
      </main>
    );

  return (
    <main className="hero draw-in" style={{ minHeight: '60vh' }}>
      <h1>{ledger ? `${ledger.balance} credits` : '…'}</h1>
      <p className="hero-sub">{note ?? 'A game costs 1000 credits, an edit 200. Failed builds refund themselves.'}</p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', margin: '18px 0 28px' }}>
        {PACKS.map((p) => (
          <button key={p.key} className="btn btn-biro" disabled={busyPack !== null} onClick={() => buy(p.key)}>
            {busyPack === p.key ? 'opening checkout…' : `${p.label} · ${p.price}`}
          </button>
        ))}
      </div>

      {ledger && ledger.entries.length > 0 && (
        <table style={{ margin: '0 auto', borderCollapse: 'collapse', fontSize: 14 }}>
          <tbody>
            {ledger.entries.map((e, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(26,24,21,0.12)' }}>
                <td style={{ padding: '6px 14px', textAlign: 'right', color: e.delta > 0 ? 'var(--biro)' : 'var(--redpencil)' }}>
                  {e.delta > 0 ? `+${e.delta}` : e.delta}
                </td>
                <td style={{ padding: '6px 14px' }}>{REASON_LABEL[e.reason] ?? e.reason}</td>
                <td style={{ padding: '6px 14px', color: 'var(--graphite)' }}>{new Date(e.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hero-sub" style={{ marginTop: 28 }}>
        <span style={{ color: 'var(--graphite)' }}>{session.user.email}</span>{' '}
        <button
          type="button"
          onClick={() => signOut().then(() => (window.location.href = '/'))}
          style={{ background: 'none', border: 'none', color: 'var(--biro)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
        >
          sign out
        </button>
      </p>
    </main>
  );
}
