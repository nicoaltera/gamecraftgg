// Scripted drive for Pocket Apocalypse.
// Kites the horde with real WASD input + Space fire (auto-aim), and VERIFIES:
//   (a) climbs the weapon ladder (rocks -> pistol -> ...) as waves are survived,
//   (b) zombie health bars deplete (hp < maxhp observed),
//   (c) reaches wave 2+ with a weapon upgrade,
//   (d) gs:'gameover' posts the {waves, kills} map on death,
//   (e) retry ("Again") returns to a fresh playable wave-1 run (no auto-play).
// Usage: node scripts/drive-pocket-apocalypse.mjs [port]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8937);
const url = `http://localhost:${port}/play/pocket-apocalypse/`;
const shotDir = path.join('games', 'pocket-apocalypse', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const HARNESS = `window.__paWant=true;window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
const W = 960, H = 540;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(HARNESS);
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);

const snap = () => page.evaluate(() => window.__pa);
const msgs = () => page.evaluate(() => window.__gs.msgs);

// map virtual coords -> screen (letterboxed, fit-to-window)
async function metrics() {
  return page.evaluate(() => {
    const s = Math.min(window.innerWidth / 960, window.innerHeight / 540);
    return { s, ox: (window.innerWidth - 960 * s) / 2, oy: (window.innerHeight - 540 * s) / 2 };
  });
}

// start
await page.mouse.click(640, 360);
await page.waitForTimeout(400);

// ---- kiting control loop ----
const held = new Set();
async function setKeys(want) {
  for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
const observed = { maxWave: 1, weapons: new Set(), sawDamaged: false, weaponByWave: {} };

async function playUntil(predicate, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await snap();
    if (s) {
      observed.maxWave = Math.max(observed.maxWave, s.wave);
      observed.weapons.add(s.weapon);
      observed.weaponByWave[s.wave] = s.weapon;
      if (s.zombies.some((z) => z.hp < z.maxhp)) observed.sawDamaged = true;
      if (predicate(s)) return s;
      if (s.state === 'over') return s;
      // steer: away from nearest zombie, biased toward arena center, dodge walls
      let nx = 0, ny = 0, nd = 1e9;
      for (const z of s.zombies) { const d = Math.hypot(z.x - s.px, z.y - s.py); if (d < nd) { nd = d; nx = z.x; ny = z.y; } }
      let dx = 0, dy = 0;
      if (nd < 1e9) { dx = (s.px - nx) / (nd || 1); dy = (s.py - ny) / (nd || 1); }
      dx += (W / 2 - s.px) * 0.01; dy += (H / 2 - s.py) * 0.01;
      const want = new Set();
      if (dx > 0.25) want.add('d'); else if (dx < -0.25) want.add('a');
      if (dy > 0.25) want.add('s'); else if (dy < -0.25) want.add('w');
      await setKeys(want);
    }
    // fire (re-trigger: works for both semi and auto weapons)
    await page.keyboard.up('Space');
    await page.keyboard.down('Space');
    await page.waitForTimeout(70);
  }
  return await snap();
}

// Play until we reach wave 2 (a weapon upgrade), capture a mid-fight action shot.
const reachedW2 = await playUntil((s) => s.wave >= 2 && s.phase === 'fight', 60000);
await page.screenshot({ path: path.join(shotDir, 'drive-1-wave2-fight.png') });

// keep climbing a bit to show the ladder move further and hordes grow
const reachedW3 = await playUntil((s) => s.wave >= 3 && s.phase === 'fight', 60000);
await page.screenshot({ path: path.join(shotDir, 'drive-2-wave3-fight.png') });

// now stop kiting and walk INTO the horde to force an honest death
await setKeys(new Set());
await page.keyboard.up('Space');
// stand still / drift toward nearest zombie until dead
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const s = await snap();
    if (!s || s.state === 'over') break;
    let nx = s.px, ny = s.py, nd = 1e9;
    for (const z of s.zombies) { const d = Math.hypot(z.x - s.px, z.y - s.py); if (d < nd) { nd = d; nx = z.x; ny = z.y; } }
    const want = new Set();
    if (nx > s.px + 6) want.add('d'); else if (nx < s.px - 6) want.add('a');
    if (ny > s.py + 6) want.add('s'); else if (ny < s.py - 6) want.add('w');
    await setKeys(want);
    await page.waitForTimeout(60);
  }
}
await setKeys(new Set());
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(shotDir, 'drive-3-fainted.png') });

const m1 = await msgs();
const go = [...m1].reverse().find((x) => x.gs === 'gameover');
const goCountBefore = m1.filter((x) => x.gs === 'gameover').length;

// ---- retry test: press Space to restart, then confirm fresh wave-1 run and NO auto-play ----
await page.waitForTimeout(700); // let the "Again" button arm
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const afterRetry = await snap();
// idle for a moment WITHOUT firing — must not auto-shoot/auto-progress; wave stays 1, kills low
const retryKills0 = afterRetry ? afterRetry.kills : -1;
await page.waitForTimeout(1500);
const afterIdle = await snap();
const m2 = await msgs();
const goCountAfter = m2.filter((x) => x.gs === 'gameover').length;

await browser.close();

console.log('\n=== POCKET APOCALYPSE DRIVE ===');
console.log(' • reached wave 2 fight:', reachedW2 && reachedW2.wave >= 2, ' weapon@w2:', observed.weaponByWave[2]);
console.log(' • reached wave 3 fight:', reachedW3 && reachedW3.wave >= 3, ' weapon@w3:', observed.weaponByWave[3]);
console.log(' • max wave reached:', observed.maxWave);
console.log(' • weapon ladder observed:', [...observed.weapons].join(' -> '));
console.log(' • weapons by wave:', JSON.stringify(observed.weaponByWave));
console.log(' • zombie health bars depleted (hp<maxhp seen):', observed.sawDamaged);
console.log(' • gameover map:', JSON.stringify(go && go.scores));
console.log(' • retry -> fresh run:', afterRetry && afterRetry.state === 'live', 'wave=', afterRetry && afterRetry.wave, 'weapon=', afterRetry && afterRetry.weapon);
console.log(' • retry NO auto-play: gameovers before=', goCountBefore, 'after-idle=', goCountAfter, '(must be equal)  idle kills:', retryKills0, '->', afterIdle && afterIdle.kills);
console.log(' • console errors:', errors.length);
errors.slice(0, 8).forEach((e) => console.log('   ERR:', e.slice(0, 200)));

const ok = errors.length === 0 && reachedW2 && reachedW2.wave >= 2 && observed.weapons.size >= 2 && observed.sawDamaged && go && go.scores && typeof go.scores.waves === 'number' && typeof go.scores.kills === 'number' && afterRetry && afterRetry.state === 'live' && afterRetry.wave === 1 && goCountBefore === goCountAfter;
console.log('\nRESULT:', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
