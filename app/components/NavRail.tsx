'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// TikTok-style prev/next chevrons for walking the feed. Deliberately click/tap
// only: arrow keys and wheel belong to the GAME (its iframe owns input), and a
// scroll-hijack here would fight gameplay. The rail floats clear of the stage
// so it can never cover game controls.
export default function NavRail({ prevSlug, nextSlug }: { prevSlug: string | null; nextSlug: string | null }) {
  const router = useRouter();
  // prefetch both neighbors so a chevron tap feels like a swipe, not a load
  useEffect(() => {
    if (nextSlug) router.prefetch(`/g/${nextSlug}`);
    if (prevSlug) router.prefetch(`/g/${prevSlug}`);
  }, [prevSlug, nextSlug, router]);

  return (
    <nav className="nav-rail" aria-label="Next and previous games">
      {prevSlug ? (
        <Link href={`/g/${prevSlug}`} aria-label="Previous game" title="Previous game">
          ↑
        </Link>
      ) : (
        <span className="rail-disabled">
          <Link href="/" aria-label="Back to all games">↑</Link>
        </span>
      )}
      {nextSlug ? (
        <Link href={`/g/${nextSlug}`} aria-label="Next game" title="Next game">
          ↓
        </Link>
      ) : (
        <span className="rail-disabled">
          <Link href="/" aria-label="Back to all games">↓</Link>
        </span>
      )}
      <span className="rail-label">next</span>
    </nav>
  );
}
