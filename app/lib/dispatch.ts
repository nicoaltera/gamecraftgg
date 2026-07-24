import { spawn } from 'node:child_process';
import path from 'node:path';
import { jobToken } from './internal-auth';

// Where builds run. Two modes, chosen by env:
//   local    — spawn pipeline/run.mjs as a detached child on this box
//              (dev default; also the single-box fallback)
//   machines — one ephemeral Fly Machine per build (GC_DISPATCH=machines +
//              FLY_API_TOKEN). The worker gets its own memory envelope, a
//              per-job token, and NO app secrets: no auth secret, no Polar,
//              no Fly token. Deploys never touch in-flight workers.
const MACHINES_API = 'https://api.machines.dev/v1';

export function dispatchMode(): 'machines' | 'local' {
  return process.env.GC_DISPATCH === 'machines' && process.env.FLY_API_TOKEN ? 'machines' : 'local';
}

export async function dispatchBuild(id: string): Promise<{ mode: string; machine?: string }> {
  if (dispatchMode() === 'machines') return dispatchMachine(id);
  // FAIL CLOSED in production: a misconfigured fleet must never silently run
  // untrusted builds on the web box next to the DB and secrets. The caller
  // refunds and tells the user the workshop is down.
  if (process.env.NODE_ENV === 'production' && process.env.FLY_APP_NAME) {
    throw new Error('machines dispatch not configured — refusing local builds in production');
  }
  return dispatchLocal(id);
}

function dispatchLocal(id: string): { mode: string } {
  const runner = path.join(process.cwd(), 'pipeline', 'run.mjs');
  // Same scrubbed-env rules as always — the pipeline runs untrusted prompts.
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const k of [
    'PATH', 'HOME', 'TMPDIR', 'SHELL', 'LANG', 'PLAYWRIGHT_BROWSERS_PATH',
    'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN',
    'GS_MODEL_DESIGNER', 'GS_MODEL_BUILDER', 'GS_MODEL_JUDGE',
  ]) {
    if (process.env[k]) childEnv[k] = process.env[k];
  }
  // local children talk to the DB directly (LocalReporter) — same as ever;
  // the app row already exists, so run.mjs's upsert is a no-op refresh
  const child = spawn('node', [runner, '--job-local', id], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: childEnv,
  });
  child.unref();
  return { mode: 'local' };
}

async function dispatchMachine(id: string): Promise<{ mode: string; machine: string }> {
  const app = process.env.FLY_APP_NAME;
  const image = process.env.FLY_IMAGE_REF; // the exact image THIS release runs
  if (!app || !image) throw new Error('machines dispatch needs FLY_APP_NAME and FLY_IMAGE_REF');

  // Idempotency: an ambiguous earlier create (timeout with the machine actually
  // made) must not spawn a second worker for one charged build. Workers are
  // findable by their job metadata.
  const existing = await fetch(`${MACHINES_API}/apps/${app}/machines?metadata.gc_job=${id}`, {
    headers: { authorization: `Bearer ${process.env.FLY_API_TOKEN}` },
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ id: string }[]>) : []))
    .catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) {
    return { mode: 'machines', machine: existing[0].id };
  }
  const env: Record<string, string> = {
    NODE_ENV: 'production',
    GC_REPORT_URL: process.env.BETTER_AUTH_URL ?? `https://${app}.fly.dev`,
    GC_JOB_TOKEN: jobToken(id),
  };
  for (const k of ['ANTHROPIC_API_KEY', 'GS_MODEL_DESIGNER', 'GS_MODEL_BUILDER', 'GS_MODEL_JUDGE']) {
    if (process.env[k]) env[k] = process.env[k] as string;
  }

  const body = (region?: string) =>
    JSON.stringify({
      ...(region ? { region } : {}),
      config: {
        image,
        guest: { cpu_kind: 'shared', cpus: 2, memory_mb: 4096 },
        env,
        auto_destroy: true, // the machine deletes itself when run.mjs exits
        restart: { policy: 'no' },
        // entrypoint override: bypass the image's web-server entrypoint
        // entirely (it also honors argv as a fallback, but be explicit)
        init: { entrypoint: ['node', 'pipeline/run.mjs', '--job', id] },
        metadata: { gc_role: 'build-worker', gc_job: id }, // NOT a fly process group: deploys ignore these machines
      },
    });

  // try home region first, then let Fly place it anywhere
  for (const region of [process.env.FLY_REGION, undefined]) {
    const res = await fetch(`${MACHINES_API}/apps/${app}/machines`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.FLY_API_TOKEN}`, 'content-type': 'application/json' },
      body: body(region),
    });
    if (res.ok) {
      const m = (await res.json()) as { id: string };
      return { mode: 'machines', machine: m.id };
    }
    console.error(`[dispatch] machine create failed (${region ?? 'any region'}):`, res.status, (await res.text()).slice(0, 200));
  }
  throw new Error('could not start a build machine');
}
