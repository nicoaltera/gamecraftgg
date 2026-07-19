// Scripted drive for Paper Pilot's 7-tier progression + laser.
// Verifies: (a) plane transforms across airframe tiers, (b) the laser fires at a high
// nose tier, (c) delivery triggers at 3000m, (d) a maxed plane throws multi-thousand
// metres, (e) the gameover scores map + both leaderboards, (f) charge/boost/pitch/retry.
// Usage: node scripts/drive-paper-pilot.mjs [port]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8922);
const url = `http://localhost:${port}/play/paper-pilot/`;
const shotDir = path.join('games', 'paper-pilot', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const HARNESS = `window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
function saveScript(up, delivered) {
  const s = { st: 999999, up, throws: delivered ? 5 : 0, delivered, delThrows: delivered ? 5 : 0 };
  return `try{localStorage.setItem('gs_save:paper-pilot', JSON.stringify(${JSON.stringify(s)}));localStorage.setItem('gs_best:paper-pilot','0');}catch(e){}`;
}
const T = { folds: 7, band: 7, clip: 7, thr: 7, fuel: 7 };

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
const lastGameover = (m) => [...m].reverse().find((x) => x.gs === 'gameover');

// a full-power pull-back throw: pull DOWN-LEFT to fling UP-RIGHT (slingshot).
async function fullThrow(page) {
  await page.mouse.move(560, 300);
  await page.mouse.down();
  await page.mouse.move(430, 380, { steps: 6 });
  await page.mouse.move(230, 470, { steps: 10 }); // long pull => 100% power, ~-30deg
  await page.mouse.up();
}

const results = { errors: [], notes: [] };

const browser = await chromium.launch();

// ---- Scenario 1: MAXED plane, fresh (undelivered) -> throw, boost, fire laser, pitch ----
{
  const { page, errors } = await newPage(browser, T, false);
  await page.screenshot({ path: path.join(shotDir, 'drive-1-maxed-aim.png') }); // Gauss Rail launcher + Aerogel plane
  await fullThrow(page);
  await page.waitForTimeout(300);
  // hold boost (Space) + fire laser (F) + a little pitch, mid-flight
  await page.keyboard.down('Space');
  await page.keyboard.down('f');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, 'drive-2-maxed-firing.png') }); // beam + flame + transformed craft
  await page.keyboard.up('Space');
  await page.waitForTimeout(200);
  // dive then climb to exercise pitch/energy
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(350); await page.keyboard.up('ArrowDown');
  await page.keyboard.down('f'); // keep tapping laser
  await page.waitForTimeout(400); await page.keyboard.up('f');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(300); await page.keyboard.up('ArrowUp');
  // let it fly out and settle
  await page.waitForTimeout(9000);
  const m = await msgs(page);
  const go = lastGameover(m);
  results.errors.push(...errors);
  results.notes.push(`MAXED run: gameover=${JSON.stringify(go && go.scores)}`);
  await page.screenshot({ path: path.join(shotDir, 'drive-3-maxed-result.png') });
  await page.context().close();
}

// ---- Scenario 2: measure several maxed throws for the distance trend ----
{
  const dists = [];
  for (let n = 0; n < 4; n++) {
    const { page, errors } = await newPage(browser, T, true);
    await fullThrow(page);
    await page.waitForTimeout(250);
    // ride the boost a touch after launch, then a shallow dive to carry speed
    await page.keyboard.down('Space');
    await page.waitForTimeout(1200);
    await page.keyboard.up('Space');
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(250); await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(12000);
    const m = await msgs(page);
    const go = lastGameover(m);
    if (go) dists.push(go.scores.distance);
    results.errors.push(...errors);
    await page.context().close();
  }
  results.notes.push(`MAXED distances (4 runs): ${dists.join(', ')}  max=${Math.max(...dists)}`);
}

// ---- Scenario 3: transform gallery (aim screenshots across airframe + nose tiers) ----
for (const [name, up] of [
  ['t0-scrap', { folds: 0, band: 0, clip: 0, thr: 0, fuel: 0 }],
  ['t3-cardstock', { folds: 3, band: 3, clip: 3, thr: 3, fuel: 3 }],
  ['t5-carbon', { folds: 5, band: 5, clip: 5, thr: 5, fuel: 5 }],
  ['t7-aerogel', { folds: 7, band: 7, clip: 7, thr: 7, fuel: 7 }],
]) {
  const { page, errors } = await newPage(browser, up, true);
  // gentle throw so the craft is big & clear at apex
  await page.mouse.move(560, 300); await page.mouse.down();
  await page.mouse.move(470, 360, { steps: 5 }); await page.mouse.move(360, 420, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(650);
  await page.keyboard.down('f'); // fire laser if owned
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(shotDir, `drive-tier-${name}.png`) });
  await page.keyboard.up('f');
  results.errors.push(...errors);
  await page.context().close();
}

// ---- Scenario 4: preserved behaviours — charge/release + retry-never-auto-throws ----
{
  const { page, errors } = await newPage(browser, { folds: 2, band: 2, clip: 0, thr: 2, fuel: 2 }, true);
  // charge & release (keyboard throw)
  await page.keyboard.down('Space'); await page.waitForTimeout(600); await page.keyboard.up('Space');
  await page.waitForTimeout(9000);
  let m = await msgs(page);
  const go1 = lastGameover(m);
  results.notes.push(`CHARGE throw: gameover=${JSON.stringify(go1 && go1.scores)}`);
  const goCount1 = m.filter((x) => x.gs === 'gameover').length;
  // back to aim (Space on result) then DO NOTHING — must NOT auto-throw
  await page.keyboard.press('Space');
  await page.waitForTimeout(2500);
  m = await msgs(page);
  const goCount2 = m.filter((x) => x.gs === 'gameover').length;
  results.notes.push(`retry auto-throw check: gameovers before=${goCount1} after-idle=${goCount2} (must be equal)`);
  results.errors.push(...errors);
  await page.context().close();
}

await browser.close();

console.log('\n=== DRIVE RESULTS ===');
results.notes.forEach((n) => console.log(' •', n));
console.log(`console errors: ${results.errors.length}`);
results.errors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 200)));
process.exit(results.errors.length ? 1 : 0);
