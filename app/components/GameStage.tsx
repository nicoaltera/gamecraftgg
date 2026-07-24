'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HandFrame from './HandFrame';
import { useSession } from '@/lib/auth-client';
import type { Board } from '@/lib/db';

type Props = {
  slug: string;
  title: string;
  boards: Board[];
  status: string;
  // ownership is decided SERVER-SIDE (session user vs creator_ref) and passed
  // down — the browser ref below is analytics identity, never authority
  isOwner: boolean;
  // signed short-lived token letting the owner's iframe load a DRAFT from the
  // cookie-less game origin; null for published games
  draftParam: string | null;
  // container geometry only — the game inside is untouched. All current games
  // are landscape (16:9, exactly as before); 'portrait' gets a phone-shaped
  // stage when such games ship.
  orientation?: string;
};

// Set NEXT_PUBLIC_GAME_ORIGIN to a distinct host in production so untrusted
// game bundles are isolated from the app origin by the same-origin policy.
const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN?.replace(/\/$/, '') ?? '';

function playerRef(): string {
  let r = localStorage.getItem('gs_ref_id');
  if (!r) {
    r = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('gs_ref_id', r);
  }
  return r;
}

export default function GameStage({ slug, title, boards, status, isOwner, draftParam, orientation }: Props) {
  const router = useRouter();
  const { data: sessionData } = useSession();
  const [remixing, setRemixing] = useState(false);
  const primaryBoard = boards.find((b) => b.primary) ?? boards[0];
  // the per-run "dare" uses the challenge board (a game's endless metric makes a
  // better single-run dare than a cross-session completion metric)
  const dareBoard = boards.find((b) => b.challenge) ?? primaryBoard;

  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  const runsRef = useRef(0);
  const bestByBoard = useRef<Record<string, number>>({});
  const [challenge, setChallenge] = useState<number | null>(null);
  const [challengeBeaten, setChallengeBeaten] = useState(false);
  const [lastScores, setLastScores] = useState<Record<string, number> | null>(null);
  const [name, setName] = useState('');
  const [nameLocked, setNameLocked] = useState(false);
  const [posted, setPosted] = useState<{ ranks: Record<string, number | null> } | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  // mobile viewing: landscape games are tiny on a portrait phone. Nudge the
  // player to rotate + go fullscreen. Fullscreen the WRAPPER (not the iframe) so
  // the game fills the screen; iOS Safari can't fullscreen a div, so there we
  // lean on the rotate hint alone. Never blocks gameplay.
  const [coarse, setCoarse] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  useEffect(() => {
    const c = matchMedia('(pointer: coarse)');
    const o = matchMedia('(orientation: portrait)');
    const upd = () => { setCoarse(c.matches); setPortrait(o.matches); };
    upd();
    c.addEventListener('change', upd);
    o.addEventListener('change', upd);
    const fs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fs);
    return () => {
      c.removeEventListener('change', upd);
      o.removeEventListener('change', upd);
      document.removeEventListener('fullscreenchange', fs);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (stageWrapRef.current?.requestFullscreen) {
        await stageWrapRef.current.requestFullscreen();
        // lock to landscape where supported (Android/Chrome); harmless no-op elsewhere
        const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
        so?.lock?.('landscape').catch(() => {});
      }
    } catch {
      /* fullscreen denied — the rotate hint still guides the player */
    }
  }

  const better = (order: 'asc' | 'desc', a: number, b: number | undefined) =>
    b == null ? true : order === 'asc' ? a < b : a > b;

  // Route keys into the game. contentWindow.focus() is what actually delivers
  // keyboard to the framed document (element focus alone doesn't), then restore
  // the parent scroll position so focusing never jump-scrolls the page.
  const focusGame = useCallback(() => {
    // don't steal focus while the player is typing their leaderboard name
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const x = window.scrollX, y = window.scrollY;
    frameRef.current?.contentWindow?.focus();
    window.scrollTo(x, y);
  }, []);

  // Keyboard focus / page-scroll guard. Games receive keys only when the iframe
  // has focus; a game that preventDefaults pointerdown can keep the click from
  // handing over focus, so arrow/space would scroll the PAGE instead of playing.
  // We focus the game on load and, as a safety net, swallow the browser's
  // scroll on game-control keys and re-hand focus to the game — unless the user
  // is typing their leaderboard name.
  useEffect(() => {
    const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'PageUp', 'PageDown']);
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (scrollKeys.has(e.key)) {
        e.preventDefault();
        focusGame();
      }
    }
    window.addEventListener('keydown', onKey, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [focusGame]);

  // session + heartbeat
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('c');
    if (c && /^\d+$/.test(c)) setChallenge(parseInt(c, 10));
    const savedName = localStorage.getItem('gs_player_name');
    if (savedName) {
      setName(savedName);
      setNameLocked(true);
    }
    const ref = params.get('r');
    fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ref, isMobile: matchMedia('(pointer: coarse)').matches }),
    })
      .then((r) => r.json())
      .then((d) => {
        sessionRef.current = d.sessionId ?? null;
        (window as { __gsSession?: string }).__gsSession = d.sessionId ?? undefined;
      })
      .catch(() => {});

    const beat = () => {
      if (!sessionRef.current) return;
      const payload = JSON.stringify({
        sessionId: sessionRef.current,
        runs: runsRef.current,
        bestScore: bestByBoard.current[primaryBoard.key],
      });
      navigator.sendBeacon?.('/api/heartbeat', new Blob([payload], { type: 'application/json' })) ||
        fetch('/api/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
    };
    const iv = setInterval(beat, 15_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', beat);
      beat();
    };
  }, [slug, primaryBoard.key]);

  // bridge messages from the game iframe
  useEffect(() => {
    const expectedOrigin = GAME_ORIGIN || window.location.origin;
    function onMsg(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.origin !== expectedOrigin) return;
      const d = e.data;
      if (!d || typeof d.gs !== 'string') return;
      if (d.gs === 'gameover') {
        // accept either a single score (→ dare board) or a per-board map
        const scores: Record<string, number> =
          d.scores && typeof d.scores === 'object'
            ? Object.fromEntries(Object.entries(d.scores).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, Math.floor(v as number)]))
            : Number.isFinite(d.score)
            ? { [dareBoard.key]: Math.floor(d.score) }
            : {};
        if (Object.keys(scores).length === 0) return;
        runsRef.current += 1;
        for (const b of boards) {
          if (b.key in scores && better(b.order, scores[b.key], bestByBoard.current[b.key])) {
            bestByBoard.current[b.key] = scores[b.key];
          }
        }
        setLastScores(scores);
        setPosted(null);
        const cv = scores[dareBoard.key];
        if (challenge != null && cv != null && (dareBoard.order === 'asc' ? cv <= challenge : cv >= challenge)) setChallengeBeaten(true);
      }
      if (d.gs === 'challenge_beaten') setChallengeBeaten(true);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [challenge, boards, dareBoard]);

  // Wipe a game's saved progress and restart it fresh. Progression games persist
  // their state under gs_save:<slug> / gs_best:<slug>; clear those and reload.
  // Direct clear works same-origin (dev); the gs:'reset' message covers a
  // separate game origin if the game handles it.
  function resetProgress() {
    if (!window.confirm('Start over? This erases your saved progress for this game.')) return;
    const w = frameRef.current?.contentWindow;
    try {
      const ls = w?.localStorage;
      if (ls) {
        // only this game's keys (gs_save:<slug> / gs_best:<slug> / any slug-scoped state)
        Object.keys(ls)
          .filter((k) => k.includes(slug))
          .forEach((k) => ls.removeItem(k));
      }
    } catch {
      /* cross-origin: fall back to the message + reload below */
    }
    w?.postMessage({ gs: 'reset' }, '*');
    try {
      w?.location.reload();
    } catch {
      if (frameRef.current) frameRef.current.src = frameRef.current.src;
    }
    bestByBoard.current = {};
    setLastScores(null);
    setPosted(null);
    setShareNote('Progress wiped — starting fresh.');
    setTimeout(() => setShareNote(null), 2500);
  }

  async function remixThis() {
    if (remixing) return;
    setRemixing(true);
    const res = await fetch('/api/remix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    const d = await res.json();
    setRemixing(false);
    if (res.ok && d.slug) router.push(`/g/${d.slug}`);
    else if (res.status === 401) router.push('/login');
    else {
      setShareNote(d.error ?? 'Could not remix.');
      setTimeout(() => setShareNote(null), 3000);
    }
  }

  async function submitScores() {
    if (!lastScores || !name.trim() || !sessionRef.current) return;
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, sessionId: sessionRef.current, name: name.trim(), scores: lastScores }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      localStorage.setItem('gs_player_name', name.trim());
      setNameLocked(true);
      setPosted({ ranks: data.ranks ?? {} });
      window.dispatchEvent(new CustomEvent('gs:board-refresh'));
    } else {
      setShareNote(data.error ?? 'Could not submit that score.');
      setTimeout(() => setShareNote(null), 3000);
    }
  }

  // Sharing is the viral core — it ALWAYS works, score or not. With a score it's
  // a "beat my X" dare; without, it's just "come play this". Never gated.
  // Signed-in shares carry the ACCOUNT id, which is what earns the share
  // reward when a friend actually plays (anonymous refs track K, earn nothing).
  async function shareChallenge() {
    const score = bestByBoard.current[dareBoard.key] ?? lastScores?.[dareBoard.key];
    const hasScore = score != null;
    const shareRef = sessionData?.user.id ?? playerRef();
    const url = `${location.origin}/g/${slug}?r=${shareRef}${hasScore ? `&c=${score}` : ''}`;
    const text = hasScore
      ? `Beat my ${score.toLocaleString()}${dareBoard.label ? ` ${dareBoard.label}` : ''} on ${title}`
      : `Play ${title} on GameCraft`;
    if (sessionRef.current) {
      fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, ref: playerRef(), sessionId: sessionRef.current }),
      }).catch(() => {});
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        /* user dismissed, or unsupported — fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} — ${url}`);
      const earn = sessionData ? ' You earn 100 credits when a friend plays.' : '';
      setShareNote((hasScore ? 'Dare copied — paste it anywhere.' : 'Link copied — paste it anywhere.') + earn);
    } catch {
      setShareNote(url); // clipboard blocked (rare) — show the link to copy by hand
    }
    setTimeout(() => setShareNote(null), 3500);
  }

  // query for the game iframe: challenge target and/or the owner's draft token
  const stageQuery = [challenge != null ? `c=${challenge}` : '', draftParam ? `dt=${encodeURIComponent(draftParam)}` : '']
    .filter(Boolean)
    .join('&');
  const challengeSrc = stageQuery ? `?${stageQuery}` : '';
  const runSummary =
    lastScores &&
    boards
      .filter((b) => b.key in lastScores)
      .map((b) => `${lastScores[b.key].toLocaleString()}${b.label ? ` ${b.label}` : ''}`)
      .join(' · ');

  return (
    <>
      {challenge != null && (
        <p className="challenge-banner">
          {challengeBeaten ? (
            <>
              Dare{' '}
              <span style={{ whiteSpace: 'nowrap' }}>
                <span className="swipe mono">{challenge.toLocaleString()}</span>
                {dareBoard.label ? ` ${dareBoard.label}` : ''}
              </span>{' '}
              beaten. Send one back.
            </>
          ) : (
            <>
              Someone dares you to beat{' '}
              <span style={{ whiteSpace: 'nowrap' }}>
                <span className="swipe mono">{challenge.toLocaleString()}</span>
                {dareBoard.label ? ` ${dareBoard.label}` : ''}.
              </span>
            </>
          )}
        </p>
      )}
      {coarse && portrait && orientation !== 'portrait' && (
        <div className="rotate-hint">
          <span>↻ Turn your phone sideways for the full game{fsSupported ? ' — or tap ⛶ Fullscreen' : ''}</span>
        </div>
      )}
      <div ref={stageWrapRef} className={`stage-wrap draw-in${orientation === 'portrait' ? ' stage-portrait' : ''}${isFs ? ' stage-fs' : ''}`}>
        <HandFrame seed={`stage-${slug}`} strokeWidth={2} />
        {coarse && fsSupported && (
          <button className="fs-btn" onClick={toggleFullscreen} aria-label={isFs ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFs ? '✕' : '⛶'}
          </button>
        )}
        <iframe
          ref={frameRef}
          className="game-stage"
          src={`${GAME_ORIGIN}/play/${slug}/${challengeSrc}`}
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          title={title}
          onLoad={focusGame}
          onMouseEnter={focusGame}
        />
      </div>
      <div className="stage-actions">
        <button className="btn btn-biro" onClick={shareChallenge}>
          Send to a friend
        </button>
        {status === 'published' && !isOwner && (
          <button className="btn" onClick={remixThis} disabled={remixing}>
            {remixing ? 'remixing…' : 'Remix this game'}
          </button>
        )}
        {lastScores && !posted && (
          <span className="name-pop">
            <span className="mono">{runSummary}</span>
            {!nameLocked && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="your name"
                maxLength={16}
                aria-label="Leaderboard name"
              />
            )}
            <button className="btn" onClick={submitScores} disabled={!name.trim()}>
              {nameLocked ? `Post as ${name}` : 'Post score'}
            </button>
          </span>
        )}
        {posted && (
          <span>
            {primaryBoard.key in posted.ranks && posted.ranks[primaryBoard.key]
              ? `#${posted.ranks[primaryBoard.key]} on ${primaryBoard.label || 'the board'}.`
              : 'Posted.'}
          </span>
        )}
        {shareNote && <span className="gs-toast">{shareNote}</span>}
        <button className="start-over" onClick={resetProgress} title="Erase saved progress and restart">
          ↺ start over
        </button>
      </div>
    </>
  );
}
