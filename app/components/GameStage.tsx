'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import HandFrame from './HandFrame';
import type { Board } from '@/lib/db';

type Props = {
  slug: string;
  title: string;
  boards: Board[];
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

export default function GameStage({ slug, title, boards }: Props) {
  const primaryBoard = boards.find((b) => b.primary) ?? boards[0];
  // the per-run "dare" uses the challenge board (a game's endless metric makes a
  // better single-run dare than a cross-session completion metric)
  const dareBoard = boards.find((b) => b.challenge) ?? primaryBoard;

  const frameRef = useRef<HTMLIFrameElement>(null);
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

  const better = (order: 'asc' | 'desc', a: number, b: number | undefined) =>
    b == null ? true : order === 'asc' ? a < b : a > b;

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

  async function shareChallenge() {
    const score = bestByBoard.current[dareBoard.key] ?? lastScores?.[dareBoard.key];
    if (score == null) return;
    const url = `${location.origin}/g/${slug}?c=${score}&r=${playerRef()}`;
    const text = `Beat my ${score.toLocaleString()}${dareBoard.label ? ` ${dareBoard.label}` : ''} on ${title}`;
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
        /* fall through to clipboard */
      }
    }
    await navigator.clipboard.writeText(`${text} — ${url}`);
    setShareNote('Dare copied — paste it anywhere.');
    setTimeout(() => setShareNote(null), 2500);
  }

  const challengeSrc = challenge != null ? `?c=${challenge}` : '';
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
      <div className="stage-wrap draw-in">
        <HandFrame seed={`stage-${slug}`} strokeWidth={2} />
        <iframe
          ref={frameRef}
          className="game-stage"
          src={`${GAME_ORIGIN}/play/${slug}/${challengeSrc}`}
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          title={title}
        />
      </div>
      <div className="stage-actions">
        <button className="btn btn-biro" onClick={shareChallenge} disabled={bestByBoard.current[dareBoard.key] == null && !lastScores}>
          Dare a friend
        </button>
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
      </div>
    </>
  );
}
