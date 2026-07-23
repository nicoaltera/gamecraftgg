// Polar integration, deliberately SDK-free: two endpoints (create checkout,
// verify webhook) don't justify a dependency. Sandbox vs live is one env var.
//
// Env contract (all set in .env.local / Fly secrets):
//   POLAR_API_BASE       https://sandbox-api.polar.sh  |  https://api.polar.sh
//   POLAR_ACCESS_TOKEN   organization access token
//   POLAR_WEBHOOK_SECRET webhook endpoint secret (whsec_... or raw base64)
//   POLAR_PRODUCT_SMALL / POLAR_PRODUCT_MEDIUM / POLAR_PRODUCT_LARGE  product ids
import crypto from 'node:crypto';

export const PACKS = {
  small: { credits: 1000, usd: 10, label: '1000 credits — $10' },
  medium: { credits: 5500, usd: 50, label: '5500 credits — $50' },
  large: { credits: 12000, usd: 100, label: '12000 credits — $100' },
} as const;
export type PackKey = keyof typeof PACKS;

const API = () => process.env.POLAR_API_BASE || 'https://sandbox-api.polar.sh';

export function productIdFor(pack: PackKey): string {
  return process.env[`POLAR_PRODUCT_${pack.toUpperCase()}`] ?? '';
}
export function packForProduct(productId: string): PackKey | null {
  for (const k of Object.keys(PACKS) as PackKey[]) if (productIdFor(k) === productId) return k;
  return null;
}

export function polarConfigured(): boolean {
  return !!(process.env.POLAR_ACCESS_TOKEN && productIdFor('small'));
}

// Create a hosted checkout session; the user pays on Polar's page and comes
// back to success_url. external_customer_id ties the order to our user id —
// that (not email) is what the webhook trusts to credit the right account.
export async function createCheckout(pack: PackKey, userId: string, successUrl: string): Promise<string> {
  const res = await fetch(`${API()}/v1/checkouts/`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      products: [productIdFor(pack)],
      external_customer_id: userId,
      success_url: successUrl,
      metadata: { pack, user_id: userId },
    }),
  });
  if (!res.ok) throw new Error(`polar checkout failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error('polar checkout returned no url');
  return data.url;
}

// Standard Webhooks signature check (what Polar uses): HMAC-SHA256 over
// "<id>.<timestamp>.<payload>" keyed with the base64 secret. Constant-time
// compare against every signature in the header (there may be several on
// secret rotation). Reject stale timestamps to keep replays out.
export function verifyWebhook(payload: string, headers: Headers): boolean {
  const secretRaw = process.env.POLAR_WEBHOOK_SECRET ?? '';
  const id = headers.get('webhook-id') ?? '';
  const ts = headers.get('webhook-timestamp') ?? '';
  const sigHeader = headers.get('webhook-signature') ?? '';
  if (!secretRaw || !id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5 min tolerance
  const secret = Buffer.from(secretRaw.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', secret).update(`${id}.${ts}.${payload}`).digest('base64');
  return sigHeader.split(' ').some((part) => {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    try {
      return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}
