'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import HandFrame from './HandFrame';

type Props = {
  slug: string;
  title: string;
  scoreLabel: string;
  scoreOrder: 'asc' | 'desc';
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

export default function GameStage({ slug, title, scoreLabel, scoreOrder }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<string | null>(null);
  const runsRef = useRef(0);
  const bestRef = useRef<number | null>(null);
  const [challenge, setChallenge] = useState<number | null>(null);
  const [challengeBeaten, setChallengeBeaten] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [nameLocked, setNameLocked] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const isBetter = useCallback(
    (a: number, b: number | null) => (b == null ? true : scoreOrder === 'asc' ? a < b : a > b),
    [scoreOrder]
  );

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
        // expose to the sibling ReportButton (report requires a real session)
        (window as { __gsSession?: string }).__gsSession = d.sessionId ?? undefined;
      })
      .catch(() => {});

    const beat = () => {
      if (!sessionRef.current) return;
      const payload = JSON.stringify({
        sessionId: sessionRef.current,
        runs: runsRef.current,
        bestScore: bestRef.current,
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
  }, [slug]);

  // bridge messages from the game iframe
  useEffect(() => {
    const expectedOrigin = GAME_ORIGIN || window.location.origin;
    function onMsg(e: MessageEvent) {
      // source check is the primary guard (browser sets e.source unforgeably);
      // origin check adds defense-in-depth when games run on a separate origin.
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.origin !== expectedOrigin) return;
      const d = e.data;
      if (!d || typeof d.gs !== 'string') return;
      if (d.gs === 'gameover' && Number.isFinite(d.score)) {
        const score = Math.floor(d.score);
        runsRef.current += 1;
        if (isBetter(score, bestRef.current)) bestRef.current = score;
        setLastScore(score);
        setSubmitted(false);
        setRank(null);
        if (challenge != null && (scoreOrder === 'asc' ? score <= challenge : score >= challenge)) setChallengeBeaten(true);
      }
      if (d.gs === 'challenge_beaten') setChallengeBeaten(true);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [challenge, isBetter, scoreOrder]);

  async function submitScore() {
    if (lastScore == null || !name.trim() || !sessionRef.current) return;
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, sessionId: sessionRef.current, name: name.trim(), score: lastScore }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      localStorage.setItem('gs_player_name', name.trim());
      setNameLocked(true);
      setSubmitted(true);
      setRank(data.rank ?? null);
      window.dispatchEvent(new CustomEvent('gs:board-refresh'));
    } else {
      setShareNote(data.error ?? 'Could not submit that score.');
      setTimeout(() => setShareNote(null), 3000);
    }
  }

  async function shareChallenge() {
    const score = bestRef.current ?? lastScore;
    if (score == null) return;
    const url = `${location.origin}/g/${slug}?c=${score}&r=${playerRef()}`;
    const text = `Beat my ${score.toLocaleString()}${scoreLabel ? ` ${scoreLabel}` : ''} on ${title}`;
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

  return (
    <>
      {challenge != null && (
        <p className="challenge-banner">
          {challengeBeaten ? (
            <>
              Dare <span style={{ whiteSpace: 'nowrap' }}><span className="swipe mono">{challenge.toLocaleString()}</span>{scoreLabel ? ` ${scoreLabel}` : ''}</span> beaten. Send one back.
            </>
          ) : (
            <>
              Someone dares you to beat{' '}
              <span style={{ whiteSpace: 'nowrap' }}>
                <span className="swipe mono">{challenge.toLocaleString()}</span>
                {scoreLabel ? ` ${scoreLabel}` : ''}.
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
        <button className="btn btn-biro" onClick={shareChallenge} disabled={bestRef.current == null && lastScore == null}>
          Dare a friend
        </button>
        {lastScore != null && !submitted && (
          <span className="name-pop">
            <span className="mono">{lastScore.toLocaleString()}{scoreLabel ? ` ${scoreLabel}` : ''}</span>
            {!nameLocked && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="your name"
                maxLength={16}
                aria-label="Leaderboard name"
              />
            )}
            <button className="btn" onClick={submitScore} disabled={!name.trim()}>
              {nameLocked ? `Post as ${name}` : 'Post score'}
            </button>
          </span>
        )}
        {submitted && <span>{rank ? `#${rank} on the board.` : 'Posted.'}</span>}
        {shareNote && <span className="gs-toast">{shareNote}</span>}
      </div>
    </>
  );
}
