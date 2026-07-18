import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { db } from '@/lib/db';

// Spawns the generation pipeline (pipeline/run.mjs) detached; the build page
// watches the trace. Guardrails: claude CLI must exist, and a daily cap keeps
// token burn bounded until real accounts/quota land (07-open-questions.md).
const DAILY_CAP = 20;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 400) : '';
  if (prompt.length < 8) return NextResponse.json({ error: 'Describe the game in a sentence or two.' }, { status: 400 });

  try {
    execSync('which claude', { stdio: 'ignore' });
  } catch {
    return NextResponse.json({ error: 'The game workshop is offline right now (claude CLI not found).' }, { status: 503 });
  }

  const today = (db().prepare('SELECT COUNT(*) AS c FROM generations WHERE created_at > ?')
    .get(Date.now() - 86400_000) as { c: number }).c;
  if (today >= DAILY_CAP) {
    return NextResponse.json({ error: 'The workshop hit today’s limit. Come back tomorrow.' }, { status: 429 });
  }

  const id = crypto.randomBytes(8).toString('hex');
  db().prepare('INSERT INTO generations (id, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, prompt, 'running', Date.now(), Date.now());

  const runner = path.join(process.cwd(), 'pipeline', 'run.mjs');
  const child = spawn('node', [runner, '--prompt', prompt, '--id', id], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return NextResponse.json({ id });
}
