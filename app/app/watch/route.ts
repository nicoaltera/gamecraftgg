import { redirect } from 'next/navigation';
import { getFeed } from '@/lib/db';

export const dynamic = 'force-dynamic';

// "Play" drops the player into the top of the feed; the game page's chevrons
// walk the rest of the ranked order.
export async function GET() {
  const top = getFeed(1)[0];
  redirect(top ? `/g/${top.slug}` : '/');
}
