import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCheckout, polarConfigured, PACKS, type PackKey } from '@/lib/polar';
import { readJson } from '@/lib/http';

// Starts a Polar hosted checkout for a credit pack and returns its URL; the
// client redirects there. No custom payment UI — Polar owns the card form.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: 'Sign in to buy credits.', code: 'auth' }, { status: 401 });
  if (!polarConfigured()) {
    return NextResponse.json({ error: 'Purchases aren’t open quite yet — hang tight.' }, { status: 503 });
  }
  const body = await readJson(req);
  const pack = typeof body?.pack === 'string' && body.pack in PACKS ? (body.pack as PackKey) : null;
  if (!pack) return NextResponse.json({ error: 'unknown pack' }, { status: 400 });

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || new URL(req.url).origin;
  try {
    const url = await createCheckout(pack, session.user.id, `${origin}/credits?checkout=success`);
    return NextResponse.json({ url });
  } catch (e) {
    console.error('[checkout]', e);
    return NextResponse.json({ error: 'Checkout didn’t start — try again in a minute.' }, { status: 502 });
  }
}
