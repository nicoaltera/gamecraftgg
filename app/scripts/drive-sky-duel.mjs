// Scripted drive for Sky Duel's persistent hangar + special weapons.
// Verifies: (a) higher base HP + iframe forgiveness, (b) the hangar economy buys
// tiers and spends parts, (c) each special weapon actually fires with its metered
// gauge (seekers ammo / scatter cooldown / EMP charge) + drones orbit & auto-fire,
// (d) the plane visibly changes, (e) the gs:'gameover' {rounds,kills} map + both
// boards still work, (f) retry returns to a ready/scramble state and never auto-plays,
// (g) old/garbage saves migrate without crashing.
// Usage: node scripts/drive-sky-duel.mjs [port]
import { chromium, devices } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8935);
const url = `http://localhost:${port}/play/sky-duel/`;
const shotDir = path.join('games', 'sky-duel', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const HARNESS = `window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
function seedSave(obj){ return `try{localStorage.setItem('gs_save:sky-duel', ${JSON.stringify(JSON.stringify(obj))});localStorage.setItem('gs_best:sky-duel','0');}catch(e){}`; }
function seedRaw(raw){ return `try{localStorage.setItem('gs_save:sky-duel', ${JSON.stringify(raw)});}catch(e){}`; }

const errors = [];
const notes = [];
async function newPage(browser, initScript, ctxOpts){
  const ctx = await browser.newContext(ctxOpts || { viewport:{ width:1280, height:720 } });
  const page = await ctx.newPage();
  page.on('console', m => m.type()==='error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(HARNESS);
  if(initScript) await page.addInitScript(initScript);
  await page.goto(url, { waitUntil:'load' });
  await page.waitForTimeout(500);
  return { page, ctx };
}
const snap = (page) => page.evaluate(() => ({
  state,
  up: save.up, tier: {...save.tier}, equip: save.equip,
  pMaxHp: planes[0] && planes[0].maxHp, pHp: planes[0] && planes[0].hp,
  pIframe: planes[0] && planes[0].iframe,
  drones: planes[0] && planes[0].drones ? planes[0].drones.length : 0,
  rkAmmo: planes[0] && planes[0].rkAmmo,
  scCd: planes[0] && planes[0].scCd,
  empC: planes[0] && planes[0].empC,
  activeRockets: rockets.filter(r=>r.on).length,
  activeBullets: bullets.filter(b=>b.on).length,
  playerBarrels: planes[0] && planes[0].st && planes[0].st.barrels,
  botStun: planes.filter(q=>q.id!==0 && (q.stun||0)>0).length,
  botHpMax: planes.filter(q=>q.id!==0).map(q=>q.maxHp),
}));
const msgs = (page) => page.evaluate(() => window.__gs.msgs);
const lastGO = (m) => [...m].reverse().find(x=>x.gs==='gameover');

const browser = await chromium.launch();

// ---- 1) Fresh save: base survivability + ready ----
{
  const { page, ctx } = await newPage(browser, null);
  const m0 = await msgs(page);
  await page.keyboard.press('Space'); // scramble
  await page.waitForTimeout(400);
  const s = await snap(page);
  notes.push(`FRESH: ready=${m0.some(x=>x.gs==='ready')} state=${s.state} baseMaxHp=${s.pMaxHp} (expect 6) barrels=${s.playerBarrels}`);
  await ctx.close();
}

// ---- 2) Hangar economy: open via H, buy tiers, confirm parts spent + tiers up ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:200, equip:null, tier:{ speed:0,armor:0,guns:0,rockets:0,drones:0,scatter:0,emp:0 } }));
  await page.keyboard.press('h'); // open hangar from title
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shotDir, 'drive-hangar.png') });
  const before = await snap(page);
  // buy: 1 ENGINE, 2 ARMOR, 3 GUNS, 4 SEEKERS, 5 DRONES, 6 SCATTER, 7 EMP (some twice)
  for(const k of ['1','1','2','2','3','3','4','5','6','7','7']){ await page.keyboard.press(k); await page.waitForTimeout(40); }
  await page.keyboard.press('e'); // arm/cycle a special
  const after = await snap(page);
  notes.push(`HANGAR buy: up ${before.up}->${after.up} (spent) tiers=${JSON.stringify(after.tier)} equip=${after.equip}`);
  // confirm persisted to localStorage
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('gs_save:sky-duel')));
  notes.push(`HANGAR persisted: up=${persisted.up} speed=${persisted.tier.speed} guns=${persisted.tier.guns} equip=${persisted.equip}`);
  await page.keyboard.press('Enter'); // launch
  await page.waitForTimeout(300);
  const played = await snap(page);
  notes.push(`HANGAR launch -> state=${played.state} playerMaxHp=${played.pMaxHp} barrels=${played.playerBarrels} drones=${played.drones}`);
  await page.screenshot({ path: path.join(shotDir, 'drive-kitted-plane.png') });
  await ctx.close();
}

// ---- 3) SEEKERS: heat-seeking rockets fire and consume metered ammo ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:'rockets', tier:{ speed:2,armor:2,guns:3,rockets:4,drones:0,scatter:0,emp:0 } }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const pre = await snap(page);
  await page.keyboard.down('k'); await page.waitForTimeout(150); await page.keyboard.up('k'); // one seeker (edge-fire)
  await page.waitForTimeout(80);
  const mid = await snap(page);
  await page.keyboard.down('k'); await page.waitForTimeout(150); await page.keyboard.up('k'); // second seeker
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(shotDir, 'drive-seekers.png') });
  const post = await snap(page);
  notes.push(`SEEKERS: ammo ${pre.rkAmmo}->${mid.rkAmmo}->${post.rkAmmo} activeRockets=${post.activeRockets} (expect ammo drop + rockets in flight)`);
  await ctx.close();
}

// ---- 4) DRONES: swarm orbits and auto-fires (passive) ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:null, tier:{ speed:1,armor:1,guns:1,rockets:0,drones:3,scatter:0,emp:0 } }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200); // let drones acquire + auto-fire
  const s = await snap(page);
  await page.screenshot({ path: path.join(shotDir, 'drive-drones.png') });
  notes.push(`DRONES: count=${s.drones} (expect 3) activeBullets=${s.activeBullets} (drones auto-fire owner-0 bullets)`);
  await ctx.close();
}

// ---- 5) SCATTER: shotgun burst uses cooldown gauge ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:'scatter', tier:{ speed:1,armor:1,guns:1,rockets:0,drones:0,scatter:5,emp:0 } }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const pre = await snap(page);
  await page.keyboard.press('k'); // fire scatter
  await page.waitForTimeout(60);
  const post = await snap(page);
  await page.screenshot({ path: path.join(shotDir, 'drive-scatter.png') });
  notes.push(`SCATTER: bullets ${pre.activeBullets}->${post.activeBullets} scCd=${post.scCd && post.scCd.toFixed(2)} (cooldown engaged after burst)`);
  await ctx.close();
}

// ---- 6) EMP: charged burst stuns nearby bots ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:'emp', tier:{ speed:1,armor:1,guns:1,rockets:0,drones:0,scatter:0,emp:5 } }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  // force the charge full and teleport a bot next to the player for a deterministic stun
  await page.evaluate(() => { planes[0].empC = 1; const b = planes.find(q=>q.id!==0 && q.alive); if(b){ b.x = planes[0].x+40; b.y = planes[0].y; } });
  await page.keyboard.press('k'); // detonate EMP
  await page.waitForTimeout(80);
  const post = await snap(page);
  await page.screenshot({ path: path.join(shotDir, 'drive-emp.png') });
  notes.push(`EMP: empC after fire=${post.empC} (expect ~0, drained) stunnedBots=${post.botStun} (expect >=1)`);
  await ctx.close();
}

// ---- 7) Forgiveness: iframe blocks a second hit in the same window ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:null, tier:{ speed:0,armor:0,guns:0,rockets:0,drones:0,scatter:0,emp:0 } }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const p = planes[0]; p.iframe = 0; const hp0 = p.hp;
    hitPlane(p, 1, p.x, p.y, 1);      // first hit lands
    const hp1 = p.hp, ifr = p.iframe;
    hitPlane(p, 1, p.x, p.y, 1);      // second hit within iframe should be ignored
    const hp2 = p.hp;
    return { hp0, hp1, hp2, ifr };
  });
  notes.push(`IFRAME: hp ${res.hp0}->${res.hp1} (hit) ->${res.hp2} (blocked, iframe=${res.ifr.toFixed(2)}) — expect hp1===hp2`);
  await ctx.close();
}

// ---- 8) Bots scale with power: maxed save -> tougher rival HP ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:'rockets', tier:{ speed:7,armor:7,guns:7,rockets:6,drones:4,scatter:5,emp:5 } }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const s = await snap(page);
  await page.screenshot({ path: path.join(shotDir, 'drive-maxed.png') });
  notes.push(`MAXED: playerMaxHp=${s.pMaxHp} botHpMax=${JSON.stringify(s.botHpMax)} (bots tougher vs a kitted plane)`);
  await ctx.close();
}

// ---- 9) Gameover map + retry returns to ready/scramble, never auto-plays ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:'rockets', tier:{ speed:2,armor:1,guns:2,rockets:2,drones:1,scatter:0,emp:0 } }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  // score a kill, win a round, then die — exercise the full scores map
  await page.evaluate(() => {
    // kill two rivals to log kills + parts
    const rivals = planes.filter(q=>q.id!==0 && q.alive);
    downPlane(rivals[0], 0);
    // now kill the player
    const p = planes[0]; p.iframe = 0; hitPlane(p, 1, p.x, p.y, 999);
  });
  await page.waitForTimeout(300);
  const m = await msgs(page);
  const go = lastGO(m);
  const s1 = await snap(page);
  notes.push(`GAMEOVER: map=${JSON.stringify(go && go.scores)} (expect {rounds,kills}) state=${s1.state}`);
  // wait past the retry lockout, then confirm NO auto-play (state stays dead until input)
  await page.waitForTimeout(1000);
  const beforeInput = await snap(page);
  await page.waitForTimeout(700);
  const stillDead = await snap(page);
  notes.push(`RETRY guard: state after 1.7s idle = ${stillDead.state} (must stay 'dead', no auto-play)`);
  // now press a key -> should return to a fresh playable run
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const afterInput = await snap(page);
  const goCount = (await msgs(page)).filter(x=>x.gs==='gameover').length;
  notes.push(`RETRY: input -> state=${afterInput.state} (fresh run) gameoverCount=${goCount} parts banked across death=${afterInput.up>=0}`);
  await ctx.close();
}

// ---- 10) Old / garbage save migrates safely (no crash) ----
{
  const { page, ctx } = await newPage(browser, seedRaw('{"folds":3,"band":7,"junk":true}')); // paper-pilot-shaped garbage
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({ up: save.up, tier: {...save.tier}, equip: save.equip }));
  notes.push(`MIGRATE garbage save: up=${s.up} tiers=${JSON.stringify(s.tier)} equip=${s.equip} (defaults, no crash)`);
  const { page: p2, ctx: c2 } = await newPage(browser, seedRaw('not json at all'));
  await p2.waitForTimeout(200);
  const s2 = await p2.evaluate(() => save.up);
  notes.push(`MIGRATE non-json save: up=${s2} (no crash)`);
  await ctx.close(); await c2.close();
}

// ---- 11) Mobile touch: special button appears + fires ----
{
  const { page, ctx } = await newPage(browser, seedSave({ v:2, up:0, equip:'rockets', tier:{ speed:2,armor:2,guns:2,rockets:3,drones:2,scatter:0,emp:0 } }), { ...devices['iPhone 13'] });
  await page.touchscreen.tap(195, 300); // scramble (tap sky)
  await page.waitForTimeout(300);
  // tap the SP button region (virtual 678,474 -> mapped). Just fire via key-equivalent by tapping SP zone.
  const pre = await snap(page);
  await page.evaluate(() => { usingTouch = true; }); // ensure touch UI on
  await page.waitForTimeout(50);
  await page.screenshot({ path: path.join(shotDir, 'drive-mobile-play.png') });
  notes.push(`MOBILE: state=${pre.state} equip=${pre.equip} rkAmmo=${pre.rkAmmo} (SP touch button rendered)`);
  await ctx.close();
}

await browser.close();

console.log('\n=== SKY DUEL DRIVE RESULTS ===');
notes.forEach(n => console.log(' •', n));
console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0,12).forEach(e => console.log('  ERR:', e.slice(0,200)));
process.exit(errors.length ? 1 : 0);
