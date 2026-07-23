import { NextRequest, NextResponse } from 'next/server';
import { addEntry } from '@/lib/credits';
import { verifyWebhook, packForProduct, PACKS } from '@/lib/polar';

// Polar webhook: order.paid → append a purchase entry to the credit ledger.
// Idempotency comes from the ledger's UNIQUE(reason, ref_id) with ref_id =
// the Polar order id — Polar retries webhooks, and every retry collapses into
// the same row. We trust only the signature and external_customer_id (our own
// user id, set at checkout creation); nothing here reads user-supplied input.
export async function POST(req: NextRequest) {
  const payload = await req.text();
  if (!verifyWebhook(payload, req.headers)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 403 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  if (event.type !== 'order.paid') return NextResponse.json({ ok: true, ignored: event.type });

  const data = (event.data ?? {}) as {
    id?: string;
    product_id?: string;
    customer?: { external_id?: string | null };
    metadata?: { pack?: string; user_id?: string };
  };
  const orderId = data.id ?? '';
  const userId = data.customer?.external_id || data.metadata?.user_id || '';
  const pack = packForProduct(data.product_id ?? '') ?? (data.metadata?.pack as keyof typeof PACKS | undefined);
  if (!orderId || !userId || !pack || !(pack in PACKS)) {
    // Paid order we can't attribute — log loudly, 200 so Polar stops retrying
    // (retries won't fix attribution; the ledger row can be added by hand).
    console.error('[polar webhook] unattributable order.paid', { orderId, userId, product: data.product_id });
    return NextResponse.json({ ok: false, error: 'unattributable' });
  }

  const credited = addEntry(userId, PACKS[pack].credits, 'purchase', orderId);
  return NextResponse.json({ ok: true, credited });
}
