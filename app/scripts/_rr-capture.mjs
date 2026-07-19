import { chromium } from 'playwright';
const port = 8936;
const url = `http://localhost:${port}/play/roll-rumble/?dbg=1`;
const out = '/Users/christie/Desktop/GameSight/app/games/roll-rumble/_shots';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript(`window.__gs={msgs:[],errors:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data)});`);
const errs=[];
page.on('console', m=>m.type()==='error'&&errs.push(m.text()));
page.on('pageerror', e=>errs.push(String(e)));
await page.goto(url,{waitUntil:'load'});
await page.waitForTimeout(500);
await page.keyboard.press('Space'); // start

const held = new Set();
async function setKeys(want){
  for(const k of held) if(!want.has(k)){ await page.keyboard.up(k); held.delete(k); }
  for(const k of want) if(!held.has(k)){ await page.keyboard.down(k); held.add(k); }
}
let shot=0;
async function snap(tag){ await page.screenshot({path:`${out}/play-${String(shot).padStart(2,'0')}-${tag}.png`}); shot++; }

const t0=Date.now();
let lastSnap=0, lastMode='';
let survived=0, maxRound=1;
while(Date.now()-t0 < 40000){
  const s = await page.evaluate(()=> window.__rr ? window.__rr.st() : null);
  if(!s){ await page.waitForTimeout(50); continue; }
  if(s.state===3){ // GAMEOVER -> restart to keep exploring escalation
    await setKeys(new Set());
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    continue;
  }
  if(s.state===1 && s.alive){
    survived = (Date.now()-t0)/1000;
    maxRound = Math.max(maxRound, s.round);
    const kx = 0.010, ktx = 1.35, klx = 1.1;
    let wx = -s.px*kx - s.TX*ktx - s.lx*klx;
    let wy = -s.py*kx - s.TY*ktx - s.ly*klx;
    if(s.boulder && s.boulder.tele<=0){ const dx=s.px-s.boulder.px, dy=s.py-s.boulder.py, d=Math.hypot(dx,dy)||1; if(d<160){ wx+=dx/d*1.5; wy+=dy/d*1.5; } }
    const want=new Set();
    if(wx> 0.18) want.add('ArrowRight'); else if(wx<-0.18) want.add('ArrowLeft');
    if(wy> 0.18) want.add('ArrowUp');    else if(wy<-0.18) want.add('ArrowDown');
    await setKeys(want);
    if(s.dashCD<=0 && s.r<180 && s.rivals.length){
      let bd=1e9; for(const rv of s.rivals){ const d=Math.hypot(rv.px-s.px,rv.py-s.py); if(d<bd){bd=d;} }
      if(bd<150){ await page.keyboard.press('Space'); }
    }
  }
  const now=(Date.now()-t0)/1000;
  if((s.mode!==lastMode && s.state===1) || now-lastSnap>2.5){
    await snap((s.state===1? (s.mode+'-r'+s.round+'-'+Math.round(now)) : 'x'));
    lastMode=s.mode; lastSnap=now;
  }
  await page.waitForTimeout(70);
}
await setKeys(new Set());
console.log('errors', errs.length, errs.slice(0,5));
console.log('maxRound', maxRound, 'lastSurvive~', survived.toFixed(1)+'s');
console.log('msgs', (await page.evaluate(()=>window.__gs.msgs)).map(m=>m.gs+(m.score!=null?':'+m.score:'')).join(', '));
await browser.close();
