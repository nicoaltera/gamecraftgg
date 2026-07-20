// Scripted drive for microbe-bloom: proves the grow/eat/die loop + termination.
// 1) starts a run, 2) chases prey/pellets and confirms SIZE grows,
// 3) spawns a bigger predator and swims into it -> real death -> gs:'gameover',
//    confirming the run TERMINATES (no infinite state).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 8971);
const shotDir = path.join('games', 'microbe-bloom', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript(`window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data)});`);
const errors = [];
page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('  CONSOLE ERR:', m.text().slice(0, 200)); } });
page.on('pageerror', e => { errors.push(String(e)); console.log('  PAGEERR:', String(e).slice(0, 200)); });

await page.goto(`http://localhost:${port}/play/microbe-bloom/`, { waitUntil: 'load' });
await page.waitForTimeout(600);

// --- start ---
await page.evaluate(() => window.__MB.start());
await page.waitForTimeout(200);
const startSize = await page.evaluate(() => window.__MB.size);
console.log('start size:', startSize, ' state:', await page.evaluate(() => window.__MB.state));

// --- grow: chase nearest prey/pellet for a while ---
let maxSize = startSize;
for (let i = 0; i < 170; i++) {
  await page.evaluate(() => {
    const t = window.__MB.nearestPrey();
    if (t) window.__MB.aimWorld(t.x, t.y);
  });
  await page.waitForTimeout(90);
  const s = await page.evaluate(() => window.__MB.size);
  if (s > maxSize) maxSize = s;
  if (i % 15 === 0) console.log(`  t=${(i * 0.09).toFixed(1)}s size=${s} zoom=${(await page.evaluate(() => window.__MB.zoom)).toFixed(3)} microbes=${await page.evaluate(() => window.__MB.microbes.length)}`);
}
const grew = maxSize > startSize;
console.log(`GROWTH: start=${startSize} -> max=${maxSize}  (${grew ? 'PASS grew' : 'FAIL no growth'})`);
await page.screenshot({ path: path.join(shotDir, 'drive-2-grown.png') });

// --- prove zoom-out happened ---
const zoom = await page.evaluate(() => window.__MB.zoom);
console.log('camera zoom after growth (should be < 1 if grown):', zoom.toFixed(3));

// --- terminate: spawn a predator and swim into it ---
console.log('spawning predator + swimming into it to force death...');
let died = false;
for (let i = 0; i < 60; i++) {
  const stateNum = await page.evaluate(() => window.__MB.state);
  const DEAD = await page.evaluate(() => window.__MB.STATE.DEAD);
  if (stateNum === DEAD) { died = true; break; }
  await page.evaluate(() => {
    let pr = window.__MB.nearestPredator();
    if (!pr) pr = window.__MB.spawnPredator(150);
    window.__MB.aimWorld(pr.x, pr.y);
  });
  await page.waitForTimeout(90);
}
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(shotDir, 'drive-3-dead.png') });

const finalState = await page.evaluate(() => window.__MB.state);
const DEAD = await page.evaluate(() => window.__MB.STATE.DEAD);
const msgs = await page.evaluate(() => window.__gs.msgs);
const go = msgs.filter(m => m.gs === 'gameover');
console.log('\n=== RESULT ===');
console.log('reached DEAD state:', finalState === DEAD, died || finalState === DEAD ? '(PASS terminates)' : '(FAIL no death)');
console.log('bridge msgs:', msgs.map(m => m.gs + (m.score != null ? ':' + m.score : '')).join(', '));
console.log('gameover posted:', go.length ? `yes score=${go[go.length - 1].score}` : 'NO');
console.log('console errors:', errors.length);

// --- retry returns to real playable start state ---
await page.evaluate(() => window.__MB.start());
await page.waitForTimeout(200);
const retrySize = await page.evaluate(() => window.__MB.size);
const retryState = await page.evaluate(() => window.__MB.state);
const PLAY = await page.evaluate(() => window.__MB.STATE.PLAY);
console.log('retry -> size:', retrySize, '(should equal start', startSize, ')  state PLAY:', retryState === PLAY);

await browser.close();
const ok = grew && (finalState === DEAD) && go.length && errors.length === 0 && retrySize === startSize;
console.log('\nDRIVE', ok ? 'PASS' : 'CHECK ABOVE');
process.exit(ok ? 0 : 1);
