import { NextRequest } from 'next/server';

// Bounded JSON body reader: rejects oversized payloads before parsing so a
// large POST can't be used as a cheap memory/CPU DoS on the write endpoints.
// Public endpoints carry tiny payloads (default 8KB). The internal build API
// carries trace batches and base64 game files — it passes its own bound.
const MAX_BODY = 8 * 1024;

export async function readJson(req: NextRequest, maxBytes = MAX_BODY): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
