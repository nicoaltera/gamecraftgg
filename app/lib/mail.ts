// Email via Resend, SDK-free (one endpoint). Dark until configured: with no
// RESEND_API_KEY every call is a silent no-op, so the whole notify feature
// ships now and switches on the moment the key + DNS land. Never throws into
// a caller — email is best-effort around the real work (publishing a game).
const FROM = process.env.MAIL_FROM || 'GameCraft <hello@gamecraft.gg>';
const APP = process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, '') || 'https://gamecraft.gg';

export function mailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  if (!mailEnabled()) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) console.error('[mail] resend', res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error('[mail] send failed', e);
    return false;
  }
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

// The sketchbook, in an inbox: plain, warm, personal — the shape spam filters
// like and humans click.
function shell(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:460px;margin:0 auto;color:#1a1815;line-height:1.5">
    ${body}
    <p style="margin-top:28px;color:#6f6a61;font-size:12px">gamecraft — play instantly, make a game from a sentence</p>
  </div>`;
}

export async function emailCreatorLive(to: string, title: string, slug: string): Promise<boolean> {
  return send(
    to,
    `Your game “${title}” is live`,
    shell(
      `<h2 style="font-size:22px">Your game is live ✎</h2>
       <p><strong>${esc(title)}</strong> passed the judges and it's playable now.</p>
       <p><a href="${APP}/g/${slug}" style="display:inline-block;border:1.5px solid #2447d6;color:#2447d6;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Play it now</a></p>`
    )
  );
}

export async function emailCreatorFailed(to: string, prompt: string): Promise<boolean> {
  return send(
    to,
    `Your game didn't make the cut`,
    shell(
      `<h2 style="font-size:22px">That one didn't ship</h2>
       <p>The judges wouldn't sign off on “${esc(prompt.slice(0, 120))}”, so nothing published — and <strong>your credits are back in your account</strong>. A different twist usually does it.</p>
       <p><a href="${APP}/#make" style="color:#2447d6">Try another idea →</a></p>`
    )
  );
}

export async function emailFriendInvite(to: string, maker: string, title: string, slug: string, ref: string): Promise<boolean> {
  return send(
    to,
    `${maker} made you a game to play`,
    shell(
      `<h2 style="font-size:22px">${esc(maker)} made you a game</h2>
       <p>They built <strong>${esc(title)}</strong> on GameCraft and want you to play it. No download, no account — just tap and go.</p>
       <p><a href="${APP}/g/${slug}?r=${encodeURIComponent(ref)}" style="display:inline-block;border:1.5px solid #2447d6;color:#2447d6;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Play ${esc(title)}</a></p>`
    )
  );
}
