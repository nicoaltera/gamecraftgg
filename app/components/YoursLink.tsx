'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { listCreations } from '@/lib/creations';

// Header link to "Your games" that lights up while any of your builds is still
// running — so you always know your game is cooking even while you play others.
export default function YoursLink() {
  const [building, setBuilding] = useState(0);

  const check = useCallback(async () => {
    const list = listCreations();
    if (list.length === 0) {
      setBuilding(0);
      return;
    }
    const states = await Promise.all(
      list.slice(0, 20).map(async (c) => {
        try {
          const r = await fetch(`/api/generation/${c.id}`);
          if (!r.ok) return null;
          return (await r.json()).status as string;
        } catch {
          return null;
        }
      })
    );
    setBuilding(states.filter((s) => s === 'running').length);
  }, []);

  useEffect(() => {
    check();
    const onChange = () => check();
    window.addEventListener('gs:creations-changed', onChange);
    const iv = setInterval(check, 4000);
    return () => {
      window.removeEventListener('gs:creations-changed', onChange);
      clearInterval(iv);
    };
  }, [check]);

  // Always visible so a creator can always find their games (the page shows an
  // empty state if they haven't made one yet); the dot lights while any build runs.
  return (
    <Link href="/yours" className="yours-link">
      your games
      {building > 0 && (
        <span className="building-dot" title={`${building} game${building === 1 ? '' : 's'} building`}>
          <span className="gs-blink">●</span>
        </span>
      )}
    </Link>
  );
}
