import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getGame, parseBoards } from '@/lib/db';

// OG cards are a marketing surface (04-site-design-language.md): sketchbook
// style — paper, ink, a highlighter swipe on the dare number.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) return new Response('not found', { status: 404 });
  const c = req.nextUrl.searchParams.get('c');
  const challenge = c && /^\d+$/.test(c) ? Number(c) : null;
  const dareLabel = parseBoards(game).find((b) => b.challenge)?.label ?? game.score_label;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#FCFCFA',
          color: '#1A1815',
          fontFamily: 'sans-serif',
          border: '6px solid #1A1815',
        }}
      >
        <div style={{ fontSize: 34, color: '#6F6A61', display: 'flex' }}>gamesight</div>
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 20, display: 'flex', textAlign: 'center', maxWidth: 1000 }}>
          {game.title}
        </div>
        {challenge != null ? (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 30, fontSize: 52 }}>
            <span style={{ display: 'flex' }}>beat</span>
            <span
              style={{
                display: 'flex',
                background: '#FFE94A',
                transform: 'skew(-8deg)',
                padding: '4px 24px',
                margin: '0 18px',
                fontWeight: 700,
              }}
            >
              {challenge.toLocaleString()}
              {dareLabel ? ` ${dareLabel}` : ''}
            </span>
            <span style={{ display: 'flex' }}>— if you can</span>
          </div>
        ) : (
          <div style={{ fontSize: 40, color: '#2447D6', marginTop: 30, display: 'flex' }}>{game.verb}</div>
        )}
        <div style={{ fontSize: 26, color: '#6F6A61', marginTop: 44, display: 'flex' }}>
          plays in your browser · no download · no account
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
