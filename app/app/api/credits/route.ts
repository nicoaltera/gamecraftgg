import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { balance, entries } from '@/lib/credits';

// Balance for the signed-in user (header pill, out-of-credits state, and the
// post-checkout page polls this until the Polar webhook lands the purchase).
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ signedIn: false, balance: 0 });
  return NextResponse.json({
    signedIn: true,
    email: session.user.email,
    balance: balance(session.user.id),
    entries: entries(session.user.id, 20),
  });
}
