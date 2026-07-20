// Path-drive for The Longest Night. Walks several distinct routes to distinct
// endings using the number-key choice API (window.__TLN), asserts gs:'gameover'
// fires with endings-found, and independently traces the node graph for full
// reachability + termination (every node reaches an ending).
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 8976);
const shotDir = path.join('games', 'the-longest-night', '_shots');
fs.mkdirSync(shotDir, { recursive: true });
const url = `http://localhost:${port}/play/the-longest-night/`;

// Routes: choose by the *label substring* so this stays robust to reordering.
// Each is a list of substrings to match against the currently visible choices.
const ROUTES = [
  { name: 'DAWN (true escape)',  want: 'dawn',
    steps: ['Search the COUCH','Pocket the key','Down the HALLWAY','Approach the CLOCK','Unlock the belly','PULL the lever'] },
  { name: 'MOON RESIDENT',       want: 'moon',
    steps: ['Go to the WINDOW','Climb out','Take the moon'] },
  { name: 'SNACKED (death)',     want: 'snacked',
    steps: ['Follow the HALLWAY','Enter the KITCHEN','Look inside the FRIDGE'] },
  { name: 'GERALD (bone escape)',want: 'gerald',
    steps: ['Try the front DOOR','KNOCK','Step inside','Ask Barnaby how to leave','Thank him','Down the HALLWAY','Talk to the FERN','Offer Gerald the BONE','Climb'] },
  { name: 'THIRTEENTH (secret)', want: 'thirteenth',
    steps: ['Follow the HALLWAY','Climb the STAIRCASE','count very carefully','full weight on the 13'] },
  { name: 'PROPERLY SHOD (secret slipper)', want: 'shod',
    steps: ['Go to the WINDOW','Check the ledge','Take the slipper','Back to the room','The front DOOR','fully shod'] },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { const t=m.text(); if (m.type()==='error') errors.push(t); if (t.startsWith('[graph]')) console.log('  '+t); });
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(`window.__msgs=[];addEventListener('message',e=>{if(e.data&&e.data.gs)window.__msgs.push(e.data)});`);
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);

// ---- graph trace (independent BFS in the harness, from exposed NODES) ----
const graph = await page.evaluate(() => {
  const N = window.__TLN.NODES; const ids = Object.keys(N);
  const endIds = ids.filter(i => N[i].end);
  const seen = new Set(['start']); const q=['start'];
  while(q.length){ const n=N[q.shift()]; for(const c of (n.choices||[])) if(N[c.to]&&!seen.has(c.to)){seen.add(c.to);q.push(c.to);} }
  const unreachable = ids.filter(i=>!seen.has(i));
  const canEnd = new Set(endIds); let changed=true;
  while(changed){changed=false; for(const i of ids){ if(canEnd.has(i))continue; for(const c of (N[i].choices||[])) if(canEnd.has(c.to)){canEnd.add(i);changed=true;break;} }}
  const dead = ids.filter(i=>!canEnd.has(i));
  const badLinks=[]; for(const i of ids) for(const c of (N[i].choices||[])) if(!N[c.to]) badLinks.push(i+'->'+c.to);
  return { nodes: ids.length, endings: endIds.length, reachable: seen.size, unreachable, dead, badLinks };
});
console.log('\n=== GRAPH TRACE ===');
console.log(`  nodes=${graph.nodes}  endings=${graph.endings}  reachable=${graph.reachable}/${graph.nodes}`);
console.log('  unreachable:', graph.unreachable.length? graph.unreachable.join(', '):'(none)');
console.log('  cannot-reach-ending:', graph.dead.length? graph.dead.join(', '):'(none)');
console.log('  broken links:', graph.badLinks.length? graph.badLinks.join(', '):'(none)');

async function reset(){ await page.evaluate(()=>window.__TLN.again && (window.__msgs=[]) ); await page.evaluate(()=>{ if(window.__TLN.mode!=='play'){} }); }

async function drive(route){
  // restart to a clean start
  await page.evaluate(()=>{ window.__msgs=[]; });
  await page.evaluate(()=>{ // ensure we are at play/start
    if(window.__TLN.mode==='splash'){ window.__TLN.pick(0); }
    window.__TLN.again();
  });
  await page.waitForTimeout(60);
  let ok=true, trail=[];
  for(const sub of route.steps){
    const vis = await page.evaluate(()=>window.__TLN.visible());
    const idx = vis.findIndex(c=>c.label.toLowerCase().includes(sub.toLowerCase()));
    if(idx<0){ ok=false; trail.push(`  !! at "${await page.evaluate(()=>window.__TLN.node.loc)}" no choice matching "${sub}" — options: ${vis.map(v=>v.label).join(' | ')}`); break; }
    trail.push(`  · ${vis[idx].label}`);
    await page.evaluate(i=>window.__TLN.pick(i), idx);
    await page.waitForTimeout(50);
  }
  const st = await page.evaluate(()=>({ mode: window.__TLN.mode, end: window.__TLN.curEnd, msgs: window.__msgs, clicks: window.__TLN.clicks }));
  const reached = st.mode==='ending' && st.end && st.end.id===route.want;
  console.log(`\n=== ${route.name} ===`);
  trail.forEach(t=>console.log(t));
  const go = st.msgs.filter(m=>m.gs==='gameover');
  console.log(`  reached ending: ${st.end? st.end.id : '(none)'}  ${reached?'✓':'✗ (wanted '+route.want+')'}  clicks=${st.clicks}`);
  console.log(`  gameover msgs: ${JSON.stringify(go)}`);
  return reached && ok && go.length>0;
}

let pass=0;
for(const r of ROUTES){ if(await drive(r)) pass++; }
// screenshot an ending screen for art review
await page.screenshot({ path: path.join(shotDir, 'drive-ending.png') });
await page.evaluate(()=>{ window.__TLN.pick && null; });
// collection view shot
await page.evaluate(()=>{ /* open collection via key */ });
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(shotDir, 'drive-collection.png') });

// mobile session sanity
const mctx = await browser.newContext({ ...devices['iPhone 13'] });
const mp = await mctx.newPage();
const merr=[]; mp.on('console',m=>m.type()==='error'&&merr.push(m.text())); mp.on('pageerror',e=>merr.push(String(e)));
await mp.addInitScript(`window.__msgs=[];addEventListener('message',e=>{if(e.data&&e.data.gs)window.__msgs.push(e.data)});`);
await mp.goto(url,{waitUntil:'load'}); await mp.waitForTimeout(400);
await mp.evaluate(()=>{ window.__TLN.pick(0); }); // wake
// walk a short death route by taps via API
for(const sub of ['Follow the HALLWAY','Enter the KITCHEN','Look inside the FRIDGE']){
  const vis=await mp.evaluate(()=>window.__TLN.visible());
  const idx=vis.findIndex(c=>c.label.toLowerCase().includes(sub.toLowerCase()));
  await mp.evaluate(i=>window.__TLN.pick(i),idx); await mp.waitForTimeout(40);
}
const mgo=await mp.evaluate(()=>window.__msgs.filter(m=>m.gs==='gameover'));
await mp.screenshot({ path: path.join(shotDir,'drive-mobile.png') });
console.log(`\n=== MOBILE ===\n  console errors: ${merr.length}  gameover: ${JSON.stringify(mgo)}`);

console.log(`\n=== SUMMARY ===`);
console.log(`  routes passed: ${pass}/${ROUTES.length}`);
console.log(`  desktop console errors: ${errors.length}`);
errors.slice(0,6).forEach(e=>console.log('   ERR:',e.slice(0,200)));
const hardFail = errors.length>0 || pass<ROUTES.length || graph.unreachable.length || graph.dead.length || graph.badLinks.length;
await browser.close();
process.exit(hardFail?1:0);
