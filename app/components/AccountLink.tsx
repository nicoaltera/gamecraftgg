'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';

// Header account state: signed out → "sign in"; signed in → credit balance
// linking to the credits page. The balance refetches on window focus so a
// finished build (refund) or a purchase shows up without a reload.
export default function AccountLink() {
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

  if (isPending) return null;
  if (!session) return <Link href="/login">sign in</Link>;
  return (
    <>
      <Link href={`/u/${encodeURIComponent(session.user.name)}`} title="Your maker page">
        {session.user.name}
      </Link>
      <Link href="/credits" title={session.user.email}>
        ✎ {balance ?? '…'}
      </Link>
    </>
  );
}
