// Onboarding-clarity drive for Paper Pilot. Captures the first-time coaching at each
// moment a brand-new player meets it, then confirms it self-dismisses for a returning player.
// Shots: first-aim (goal + both throw methods + animated hand), charge state, first-airborne
// pitch callout, boost callout, laser callout, the self-explaining shop, and a returning-player
// airborne frame with NO coaching. Usage: node scripts/drive-paper-pilot-onboard.mjs [port]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8941);
const url = `http://localhost:${port}/play/paper-pilot/`;
const shotDir = path.join('games', 'paper-pilot', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const HARNESS = `window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
const clearSave = `try{localStorage.removeItem('gs_save:paper-pilot');localStorage.removeItem('gs_best:paper-pilot');}catch(e){}`;
function setSave(obj) { return `try{localStorage.setItem('gs_save:paper-pilot',JSON.stringify(${JSON.stringify(obj)}));localStorage.setItem('gs_best:paper-pilot','0');}catch(e){}`; }

const errors = [];
const notes = [];

async function newPage(browser, initScript) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()}`));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(HARNESS);
  await page.addInitScript(initScript);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  return { page, ctx };
}
const msgs = (page) => page.evaluate(() => window.__gs.msgs);
// full-power pull-back throw: pull DOWN-LEFT to fling UP-RIGHT
async function fullThrow(page) {
  await page.mouse.move(560, 300);
  await page.mouse.down();
  await page.mouse.move(430, 380, { steps: 6 });
  await page.mouse.move(230, 470, { steps: 10 });
  await page.mouse.up();
}
// the game persists coachDone flags to localStorage the instant a control is used (markCoach),
// so we can prove "fades on use" by reading the saved flags before/after.
async function readSave(page) {
  return page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gs_save:paper-pilot') || '{}'); } catch (e) { return {}; } });
}
const cd = (s, k) => (s && s.coachDone && s.coachDone[k]);

const browser = await chromium.launch();

// ---- 1. FIRST AIM (fresh save): goal line + both throw methods + animated pull-back hand ----
{
  const { page } = await newPage(browser, clearSave);
  await page.mouse.move(200, 200); // wake, no drag
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, 'onb-1-first-aim.png') });
  // charge state: hold Space -> "release to throw!" + charge meter
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, 'onb-2-charging.png') });
  await page.keyboard.up('Space'); // this throws it (charged release)
  await page.waitForTimeout(120);
  notes.push('first-aim captured (goal + pull-back + Space); charge/release fired the throw');
  await page.context().close();
}

// ---- 2. FIRST AIRBORNE (fresh save): pitch callout appears by the meters ----
{
  const { page } = await newPage(browser, clearSave);
  await fullThrow(page);
  await page.waitForTimeout(650); // airborne, <8s, haven't pitched
  const before = await readSave(page);
  await page.screenshot({ path: path.join(shotDir, 'onb-3-airborne-pitch.png') });
  // now USE pitch -> callout must vanish + coachDone.pitch persisted
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shotDir, 'onb-3b-after-pitch.png') });
  const after = await readSave(page);
  notes.push(`pitch callout: coachDone.pitch before=${cd(before, 'pitch')} after-tilt=${cd(after, 'pitch')} (false->true = fades on use)`);
  await page.context().close();
}

// ---- 3. BOOST callout (owns Thruster, fresh, not yet boosted) ----
{
  const { page } = await newPage(browser, setSave({ st: 9999, up: { folds: 1, band: 1, clip: 0, thr: 3, fuel: 3 }, throws: 0, delivered: false, delThrows: 0, coachDone: { aim: false, pitch: false, boost: false, laser: false } }));
  await fullThrow(page);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(shotDir, 'onb-4-boost-callout.png') });
  const before = await readSave(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  await page.waitForTimeout(150);
  const after = await readSave(page);
  notes.push(`boost callout: coachDone.boost before=${cd(before, 'boost')} after-boost=${cd(after, 'boost')} (false->true = fades on use)`);
  await page.context().close();
}

// ---- 4. LASER callout (owns Nose Gun T4 laser, no thruster so it stands alone) ----
{
  const { page } = await newPage(browser, setSave({ st: 9999, up: { folds: 2, band: 2, clip: 4, thr: 0, fuel: 0 }, throws: 0, delivered: false, delThrows: 0, coachDone: { aim: false, pitch: false, boost: false, laser: false } }));
  await fullThrow(page);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(shotDir, 'onb-5-laser-callout.png') });
  const before = await readSave(page);
  await page.keyboard.down('f');
  await page.waitForTimeout(250);
  await page.keyboard.up('f');
  await page.waitForTimeout(150);
  const after = await readSave(page);
  notes.push(`laser callout: coachDone.laser before=${cd(before, 'laser')} after-fire=${cd(after, 'laser')} (false->true = fades on use)`);
  await page.context().close();
}

// ---- 5. SHOP (fresh save): each card shows a plain what-it-does line ----
{
  const { page } = await newPage(browser, setSave({ st: 500, up: { folds: 0, band: 0, clip: 0, thr: 0, fuel: 0 }, throws: 0, delivered: false, delThrows: 0, coachDone: { aim: false, pitch: false, boost: false, laser: false } }));
  await fullThrow(page);
  // land: poll for gameover -> result screen has the shop
  let landed = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(400);
    const m = await msgs(page);
    if (m.some((x) => x.gs === 'gameover')) { landed = true; break; }
  }
  await page.waitForTimeout(1600); // let the tally + cards ease in
  await page.screenshot({ path: path.join(shotDir, 'onb-6-shop.png') });
  notes.push(`shop screen reached (gameover=${landed})`);
  await page.context().close();
}

// ---- 6. RETURNING PLAYER: coaching self-dismisses (delivered save, flags seen) ----
{
  const { page } = await newPage(browser, setSave({ st: 9999, up: { folds: 4, band: 4, clip: 4, thr: 4, fuel: 4 }, throws: 40, delivered: true, delThrows: 22, coachDone: { aim: true, pitch: true, boost: true, laser: true } }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, 'onb-7-returning-aim.png') });
  await fullThrow(page);
  await page.waitForTimeout(650);
  const cs = await readSave(page);
  await page.screenshot({ path: path.join(shotDir, 'onb-8-returning-airborne.png') });
  notes.push(`returning player: throws=${cs && cs.throws} coachDone=${JSON.stringify(cs && cs.coachDone)} (all true = no first-time coaching drawn)`);
  await page.context().close();
}

await browser.close();
console.log('\n=== ONBOARDING DRIVE ===');
notes.forEach((n) => console.log(' •', n));
console.log(`console errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 200)));
process.exit(errors.length ? 1 : 0);
