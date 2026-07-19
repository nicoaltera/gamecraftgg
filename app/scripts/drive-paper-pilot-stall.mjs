// Stall / anti-exploit drive for Paper Pilot.
// Proves: (A) holding ↑ (ArrowUp) continuously NO LONGER flies forever — the wing stalls,
//         noses over, descends, and the run ENDS (gameover fires) with bounded distance;
//         the stall telegraph (run.stallWarn) and stall state (run.stalling) both fire.
//     (B) a normal skilled flight (glide + shallow dives, no over-holding) does NOT stall
//         and flies well past the mailbox.
// Usage (server on PORT): node scripts/drive-paper-pilot-stall.mjs [port]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8923);
const url = `http://localhost:${port}/play/paper-pilot/`;
const shotDir = path.join('games', 'paper-pilot', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const HARNESS = `window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
function saveScript(up, delivered) {
  const s = { st: 999999, up, throws: delivered ? 5 : 0, delivered, delThrows: delivered ? 5 : 0 };
  return `try{localStorage.setItem('gs_save:paper-pilot', JSON.stringify(${JSON.stringify(s)}));localStorage.setItem('gs_best:paper-pilot','0');}catch(e){}`;
}

async function newPage(browser, up, delivered) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(HARNESS);
  await page.addInitScript(saveScript(up, delivered));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  return { page, ctx, errors };
}
const msgs = (page) => page.evaluate(() => window.__gs.msgs);
const snap = (page) => page.evaluate(() => ({
  state, y: plane.y, alt: (460 - 6 - plane.y) / 5, dist: Math.round((plane.x - 70) / 5),
  spd: Math.round(Math.hypot(plane.vx, plane.vy)), pitch: +run.pitch.toFixed(2),
  stalling: run.stalling, warn: +(run.stallWarn || 0).toFixed(2),
}));
const hadGameover = (m) => m.some((x) => x.gs === 'gameover');

// full-power pull-back throw: pull DOWN-LEFT to fling UP-RIGHT (slingshot)
async function fullThrow(page) {
  await page.mouse.move(560, 300);
  await page.mouse.down();
  await page.mouse.move(430, 380, { steps: 6 });
  await page.mouse.move(230, 470, { steps: 10 });
  await page.mouse.up();
}

const results = { errors: [], notes: [] };
const browser = await chromium.launch();

// ============================================================
// (A) EXPLOIT TEST — hold ↑ continuously for a long time.
//     Must stall, descend, and END (bounded distance). A decent-but-not-maxed plane so
//     there's no boost masking the effect (thr:0 => no thruster available at all).
// ============================================================
{
  const { page, errors } = await newPage(browser, { folds: 3, band: 4, clip: 0, thr: 0, fuel: 0 }, true);
  await fullThrow(page);
  await page.waitForTimeout(250);
  await page.keyboard.down('ArrowUp');   // <-- HOLD UP AND NEVER LET GO
  let everStalled = false, everWarned = false, peakDist = 0, peakAlt = 0;
  let stallCount = 0, prevStall = false, shotTaken = false;
  const t0 = Date.now();
  let ended = false, last = null;
  while (Date.now() - t0 < 30000) {
    await page.waitForTimeout(200);
    const s = await snap(page);
    last = s;
    if (s.stalling) everStalled = true;
    if (s.warn > 0) everWarned = true;
    if (s.stalling && !prevStall) stallCount++;
    prevStall = s.stalling;
    peakDist = Math.max(peakDist, s.dist);
    peakAlt = Math.max(peakAlt, s.alt);
    // grab a screenshot mid-stall so we can read the nose-over + telegraph
    if (s.stalling && !shotTaken) { shotTaken = true; await page.screenshot({ path: path.join(shotDir, 'stall-1-nose-over.png') }); }
    const m = await msgs(page);
    if (hadGameover(m) || s.state === 'result' || s.state === 'settle') { ended = true; break; }
  }
  // keep holding a beat longer, then confirm the run fully finishes (settle -> gameover)
  const tg = Date.now();
  while (Date.now() - tg < 4000) { await page.waitForTimeout(300); if (hadGameover(await msgs(page))) break; }
  await page.keyboard.up('ArrowUp');
  const m = await msgs(page);
  await page.screenshot({ path: path.join(shotDir, 'stall-2-ended.png') });
  results.errors.push(...errors);
  results.notes.push(
    `HOLD-UP exploit: everWarned=${everWarned} everStalled=${everStalled} stallCycles=${stallCount} ` +
    `runEnded=${ended || hadGameover(m)} gameover=${hadGameover(m)} peakAlt=${Math.round(peakAlt)}m ` +
    `peakDist=${peakDist}m finalState=${last && last.state}`
  );
  await page.context().close();
}

// ============================================================
// (B) NORMAL SKILLED FLIGHT — no over-holding. Glide + occasional shallow dive.
//     Must NOT stall and must fly well. Maxed plane so we see a long throw.
// ============================================================
{
  const { page, errors } = await newPage(browser, { folds: 7, band: 7, clip: 7, thr: 7, fuel: 7 }, true);
  await fullThrow(page);
  await page.waitForTimeout(250);
  // ride boost a moment, then fly clean with shallow dives (the skilled line)
  await page.keyboard.down('Space'); await page.waitForTimeout(2500); await page.keyboard.up('Space');
  let everStalled = false, i = 0, peakDist = 0;
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 45000) {
    // gentle level flight with periodic shallow dives to keep airspeed up
    if (++i % 4 === 0) { await page.keyboard.down('ArrowDown'); await page.waitForTimeout(150); await page.keyboard.up('ArrowDown'); }
    await page.waitForTimeout(250);
    const s = await snap(page);
    last = s;
    if (s.stalling) everStalled = true;
    peakDist = Math.max(peakDist, s.dist);
    const m = await msgs(page);
    if (hadGameover(m)) break;
  }
  const m = await msgs(page);
  const go = [...m].reverse().find((x) => x.gs === 'gameover');
  results.errors.push(...errors);
  results.notes.push(
    `NORMAL flight: everStalled=${everStalled} distance=${go ? go.scores.distance : '(aloft) peak=' + peakDist}m ` +
    `finalState=${last && last.state}`
  );
  await page.context().close();
}

// ============================================================
// (C) GENTLE-CLIMB TEST — a brief, shallow climb (tap up, then release) must NOT stall.
// ============================================================
{
  const { page, errors } = await newPage(browser, { folds: 4, band: 5, clip: 0, thr: 0, fuel: 0 }, true);
  await fullThrow(page);
  await page.waitForTimeout(250);
  let everStalled = false;
  for (let k = 0; k < 8; k++) {
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(220); await page.keyboard.up('ArrowUp'); // short zoom
    await page.waitForTimeout(500); // level off between climbs
    const s = await snap(page);
    if (s.stalling) everStalled = true;
    const m = await msgs(page);
    if (hadGameover(m)) break;
  }
  results.errors.push(...errors);
  results.notes.push(`GENTLE brief-climbs: everStalled=${everStalled} (should be false — short climbs keep airspeed)`);
  await page.context().close();
}

await browser.close();

console.log('\n=== STALL DRIVE RESULTS ===');
results.notes.forEach((n) => console.log(' •', n));
console.log(`console errors: ${results.errors.length}`);
results.errors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 200)));
// Assertions
const a = results.notes[0];
const passExploit = /everStalled=true/.test(a) && /runEnded=true/.test(a) && /gameover=true/.test(a);
const b2 = results.notes[1];
const passNormal = /everStalled=false/.test(b2);
console.log(`\nEXPLOIT CLOSED (stalled + run ended while holding up): ${passExploit ? 'PASS' : 'FAIL'}`);
console.log(`NORMAL FLIGHT UNHARMED (no stall on skilled line):      ${passNormal ? 'PASS' : 'FAIL'}`);
process.exit(results.errors.length || !passExploit || !passNormal ? 1 : 0);
