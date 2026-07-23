'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';

// The sidebar's account block. Signed out it's one clear button; signed in
// it's a labeled card — gamertag (→ maker page), credits remaining, and an
// always-visible "Get more credits". Balance refetches on window focus so a
// refund or purchase shows up without a reload.
export default function AccountCard() {
  const { data: session, isPending } = useSession();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!session) {
      setBalance(null);
      return;
    }
    const load = () =>
      fetch('/api/credits')
        .then((r) => r.json())
        .then((d) => setBalance(typeof d.balance === 'number' ? d.balance : null))
        .catch(() => {});
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) return <div className="account-card" aria-hidden="true" />;

  if (!session) {
    return (
      <div className="account-card">
        <span className="account-label">account</span>
        <Link href="/login" className="account-cta">
          Sign in / Sign up
        </Link>
        <span className="account-hint">2000 free credits to start</span>
      </div>
    );
  }

  return (
    <div className="account-card">
      <span className="account-label">account</span>
      <Link href={`/u/${encodeURIComponent(session.user.name)}`} className="account-tag" title="Your maker page">
        {session.user.name}
      </Link>
      <span className="account-credits mono">{balance == null ? '…' : balance.toLocaleString()} credits</span>
      <Link href="/credits" className="account-cta">
        Get more credits
      </Link>
    </div>
  );
}
