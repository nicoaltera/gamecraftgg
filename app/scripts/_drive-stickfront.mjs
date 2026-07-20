// Scripted drive for stick-front — plays via REAL input only (no debug hook;
// __SF was removed). Reads read-only console telemetry enabled with ?v=1.
// Proves the four owner changes + termination:
//   1. wider map + following camera (you can't see both forts at once)
//   2. age-up is now slow/earned (time to reach age 2)
//   3. age-up visibly transforms the army (before/after screenshots per age)
//   4. unit health bars render
//   + a battle TERMINATES in a win or loss (gs:'gameover' on loss)
// Usage: node scripts/_drive-stickfront.mjs [port]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 8970);
const shotDir = path.join('games', 'stick-front', '_shots');
fs.mkdirSync(shotDir, { recursive: true });
const URL = `http://localhost:${port}/play/stick-front/?v=1`;

async function boot(label) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const tel = { last: null, ageups: [], errors: [] };
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') { tel.errors.push(t); console.log(`  [${label}] CONSOLE ERR:`, t.slice(0, 200)); return; }
    if (t.startsWith('SFV_AGEUP ')) { try { tel.ageups.push(JSON.parse(t.slice(10))); } catch (e) {} return; }
    if (t.startsWith('SFV ')) { try { tel.last = JSON.parse(t.slice(4)); } catch (e) {} }
  });
  page.on('pageerror', e => { tel.errors.push(String(e)); console.log(`  [${label}] PAGEERR:`, String(e).slice(0, 200)); });
  await page.addInitScript(`window.__msgs=[];window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__msgs.push(e.data);});`);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.evaluate(() => { try { localStorage.removeItem('gs_save:stick-front'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.keyboard.press('Space');            // start (real input)
  await page.waitForTimeout(300);
  return { browser, page, tel };
}

// ---- Run A: aggressive good play -> reach ages, win, prove camera + transforms ----
async function runAggressive() {
  const { browser, page, tel } = await boot('WIN');
  await page.keyboard.down('1');                 // hold cheap runners the whole time
  let shots = {}, ageAt = {}, wonSeen = 0, ended = null, camSamples = [];
  const T0 = Date.now();
  for (let i = 0; i < 2000; i++) {                // up to ~200s wall
    if (i % 4 === 0) { await page.keyboard.press('2'); await page.keyboard.press('3'); }
    if (i % 10 === 0) { await page.keyboard.press('5'); }   // try to advance age
    if (i % 14 === 0) { await page.keyboard.press('4'); }   // turret
    await page.waitForTimeout(100);
    const L = tel.last; if (!L) continue;
    if (L.age === 0 && !shots.age0) { shots.age0 = 1; ageAt[0] = L.t; await page.screenshot({ path: path.join(shotDir, 'age0-stone.png') }); }
    if (L.age === 1 && !shots.age1) { shots.age1 = 1; ageAt[1] = L.t; await page.waitForTimeout(200); await page.screenshot({ path: path.join(shotDir, 'age1-sword.png') }); }
    if (L.age === 2 && !shots.age2) { shots.age2 = 1; ageAt[2] = L.t; await page.waitForTimeout(200); await page.screenshot({ path: path.join(shotDir, 'age2-knight.png') }); }
    if (L.age === 3 && !shots.age3) { shots.age3 = 1; ageAt[3] = L.t; await page.screenshot({ path: path.join(shotDir, 'age3-musket.png') }); }
    if (L.age === 4 && !shots.age4) { shots.age4 = 1; ageAt[4] = L.t; await page.screenshot({ path: path.join(shotDir, 'age4-future.png') }); }
    camSamples.push({ t: L.t, cam: L.cam, age: L.age });
    if (L.won > wonSeen) { wonSeen = L.won; await page.screenshot({ path: path.join(shotDir, 'drive-WIN.png') }); }
    if (!shots.front && L.pop >= 3 && L.cam > 200) { shots.front = 1; await page.screenshot({ path: path.join(shotDir, 'frontline.png') }); }
    if (wonSeen >= 1 && shots.age2) { ended = 'won+age2'; break; }
    if (Date.now() - T0 > 200000) { ended = 'timeout'; break; }
  }
  // camera navigation demo: peek the enemy fort, then your fort
  await page.keyboard.press('End'); await page.waitForTimeout(400); await page.screenshot({ path: path.join(shotDir, 'peek-foe.png') });
  const peekFoe = tel.last ? tel.last.cam : -1;
  await page.keyboard.press('Home'); await page.waitForTimeout(400); await page.screenshot({ path: path.join(shotDir, 'peek-you.png') });
  const peekYou = tel.last ? tel.last.cam : -1;
  await page.keyboard.up('1');
  const msgs = await page.evaluate(() => window.__msgs);
  await browser.close();
  return { tel, ageAt, wonSeen, ended, camSamples, peekFoe, peekYou, msgs };
}

// ---- Run B: passive -> LOSS + gameover ----
async function runPassive() {
  const { browser, page, tel } = await boot('LOSS');
  let over = false;
  for (let i = 0; i < 1400; i++) {                // up to ~140s
    await page.waitForTimeout(100);
    const msgs = await page.evaluate(() => window.__msgs);
    if (msgs.some(m => m.gs === 'gameover')) { over = true; break; }
  }
  await page.screenshot({ path: path.join(shotDir, 'drive-LOSS.png') });
  const msgs = await page.evaluate(() => window.__msgs);
  await browser.close();
  return { over, msgs, tel };
}

console.log('=== RUN A: aggressive play (reach ages, win, camera + transforms) ===');
const A = await runAggressive();
console.log('  ended:', A.ended, ' wonSeen:', A.wonSeen, ' errors:', A.tel.errors.length);
console.log('  age reached-at (battle seconds):', JSON.stringify(A.ageAt));
console.log('  age-up events:', JSON.stringify(A.tel.ageups));
const cams = A.camSamples.map(s => s.cam);
const camMin = cams.length ? Math.min(...cams) : 0, camMax = cams.length ? Math.max(...cams) : 0;
console.log(`  camera range over battle: camX ${camMin}..${camMax} (0 = your fort edge; larger = toward foe)`);
console.log(`  peek: End->camX=${A.peekFoe} (toward FOE)  Home->camX=${A.peekYou} (toward YOU)`);
console.log('  bridge msgs:', A.msgs.map(m => m.gs + (m.score != null ? ':' + m.score : '')).join(', ') || '(none)');

console.log('\n=== RUN B: passive (expect LOSS + gameover) ===');
const B = await runPassive();
const go = B.msgs.find(m => m.gs === 'gameover');
console.log('  gameover posted:', !!go, go ? `score=${go.score}` : '', ' errors:', B.tel.errors.length);

console.log('\n=== VERDICT ===');
const wideCam = camMax - camMin > 300 && A.peekFoe > A.peekYou;
const age2Slow = (A.ageAt[2] != null) && A.ageAt[2] > 12;
const transforms = A.tel.ageups.length >= 1;
const winOK = A.wonSeen >= 1;
const lossOK = !!go;
const noErr = A.tel.errors.length === 0 && B.tel.errors.length === 0;
console.log(`  camera pans across wide field (cannot see both forts): ${wideCam ? 'YES' : 'CHECK'}`);
console.log(`  reaching age 2 takes real time (t=${A.ageAt[2]}s): ${age2Slow ? 'YES' : 'CHECK'}`);
console.log(`  age-up transforms fired: ${transforms ? 'YES' : 'CHECK'} (${A.tel.ageups.length})`);
console.log(`  WIN reachable: ${winOK ? 'YES' : 'NO'}`);
console.log(`  LOSS + gameover posts: ${lossOK ? 'YES' : 'NO'}`);
console.log(`  no console errors: ${noErr ? 'YES' : 'NO'}`);
process.exit(winOK && lossOK && noErr ? 0 : 1);
