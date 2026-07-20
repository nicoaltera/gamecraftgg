// Winnability + termination drive for stick-front.
// Run A: aggressive good play -> prove a battle WIN (foe fort -> 0) + termination.
// Run B: passive bad play    -> prove a LOSS (gameover posts) + termination.
// Usage: node scripts/_drive-stickfront.mjs [port]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 8972);
const shotDir = path.join('games', 'stick-front', '_shots');
fs.mkdirSync(shotDir, { recursive: true });
const URL = `http://localhost:${port}/play/stick-front/`;

async function boot(label) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log(`  [${label}] CONSOLE ERR:`, m.text().slice(0, 200)); });
  page.on('pageerror', e => console.log(`  [${label}] PAGEERR:`, String(e).slice(0, 200)));
  await page.addInitScript(`window.__msgs=[];window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__msgs.push(e.data);});`);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  // clear any prior save so we start fresh at battle 1
  await page.evaluate(() => { try { localStorage.removeItem('gs_save:stick-front'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.evaluate(() => window.__SF.begin());
  await page.waitForTimeout(300);
  return { browser, page };
}

// ---- Run A: smart aggressive -> win multiple escalating battles ----
async function runAggressive() {
  const { browser, page } = await boot('WIN');
  let samples = [], wins = [], lost = false, lastWon = 0, battleStart = 0;
  for (let i = 0; i < 2600; i++) { // up to ~260s wall
    const r = await page.evaluate(() => {
      const S = window.__SF;
      if (S.state !== S.ST.BATTLE) return S.info();
      // smart economy: age up when affordable; buy a turret early; bank for brutes.
      S.ageUp();
      if (S.turret < 2 && S.gold > 150) S.turretBuy();
      // backbone of brutes, fill with runners, add shooters for support
      if (S.gold > 90) S.spawn(1);
      if (S.gold > 55) S.spawn(2);
      S.spawn(0);
      return S.info();
    });
    if (r.battlesWon > lastWon) { wins.push({ b: r.battlesWon, t: r.t, dt: +(r.t).toFixed(1), age: r.age, turret: r.turretTier }); lastWon = r.battlesWon; }
    if (i % 25 === 0) samples.push(`t=${r.t} battle=${r.battle} gold=${r.gold} age=${r.age} turret=${r.turretTier} foeHP=${r.foeHP}/${r.foeMax} youHP=${r.youHP} won=${r.battlesWon}`);
    const st = await page.evaluate(() => window.__SF.state);
    if (st === 3) { lost = true; samples.push(`LOST after ${lastWon} wins`); break; }
    if (lastWon >= 3) { samples.push(`reached ${lastWon} wins — stopping drive`); break; }
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: path.join(shotDir, 'drive-WIN.png') });
  const msgs = await page.evaluate(() => window.__msgs);
  await browser.close();
  return { sawWin: lastWon >= 1, wins, lost, samples, msgs };
}

// ---- Run B: passive -> LOSS ----
async function runPassive() {
  const { browser, page } = await boot('LOSS');
  let over = null, samples = [];
  for (let i = 0; i < 1200; i++) { // up to ~120s
    const r = await page.evaluate(() => window.__SF.info());
    if (i % 30 === 0) samples.push(`t=${r.t} youHP=${r.youHP} foeHP=${r.foeHP} state=${r.state}`);
    const isOver = await page.evaluate(() => window.__SF.state === window.__SF.ST.OVER);
    if (isOver) { over = r; break; }
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: path.join(shotDir, 'drive-LOSS.png') });
  const msgs = await page.evaluate(() => window.__msgs);
  await browser.close();
  return { over, samples, msgs };
}

console.log('=== RUN A: aggressive good play (expect WIN + termination) ===');
const A = await runAggressive();
A.samples.forEach(s => console.log('  ', s));
console.log('  wins:', A.wins.map(w => `battle${w.b}@${w.dt}s(age${w.age},turret${w.turret})`).join('  ') || '(none)');
console.log('  msgs:', A.msgs.map(m => m.gs + (m.score != null ? ':' + m.score : '')).join(', ') || '(none)');

console.log('\n=== RUN B: passive bad play (expect LOSS + gameover) ===');
const B = await runPassive();
B.samples.forEach(s => console.log('  ', s));
console.log('  msgs:', B.msgs.map(m => m.gs + (m.score != null ? ':' + m.score : '')).join(', ') || '(none)');
const goMsg = B.msgs.find(m => m.gs === 'gameover');
console.log(`  -> gameover posted=${!!goMsg}`, goMsg ? `score=${goMsg.score}` : '', B.over ? `at t=${B.over.t}s` : '');

console.log('\n=== VERDICT ===');
const winOK = A.sawWin;
const lossOK = !!B.msgs.find(m => m.gs === 'gameover');
console.log(`  WIN reachable: ${winOK ? 'YES' : 'NO'}`);
console.log(`  LOSS reachable + gameover posts: ${lossOK ? 'YES' : 'NO'}`);
console.log(`  Both terminate: ${winOK && lossOK ? 'YES' : 'CHECK'}`);
process.exit(winOK && lossOK ? 0 : 1);
