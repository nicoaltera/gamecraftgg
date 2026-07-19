// Controlled survival probe (real-combat time-to-die).
// Fresh save, scramble, then attempt a 1-dmg hit on the player every 90ms with the
// iframe forgiveness window RESPECTED (the honest number a dogfight produces), and
// measure wall time to death. Isolates the HP + iframe tuning we are softening.
import { chromium } from 'playwright';
const port = Number(process.argv[2] || 8942);
const url = `http://localhost:${port}/play/sky-duel/`;
const HARNESS = `window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
const browser = await chromium.launch();
async function measure(){
  const ctx = await browser.newContext({ viewport:{ width:1280, height:720 } });
  const page = await ctx.newPage();
  await page.addInitScript(HARNESS);
  await page.addInitScript(`try{localStorage.setItem('gs_best:sky-duel','0');localStorage.removeItem('gs_save:sky-duel');}catch(e){}`);
  await page.goto(url, { waitUntil:'load' });
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(3300); // let any pre-round countdown elapse so guns/combat are live
  const info = await page.evaluate(()=> new Promise(res=>{
    const p=planes[0]; const maxHp=p.maxHp, iframe=p.st?p.st.iframe:0; const t0=performance.now();
    const id=setInterval(()=>{
      const pl=planes[0];
      if(!pl.alive||state==='dead'){ clearInterval(id); res({maxHp,iframe,ttd:(performance.now()-t0)/1000}); return; }
      hitPlane(pl,1,pl.x,pl.y,1);   // iframe respected
      if(performance.now()-t0>30000){ clearInterval(id); res({maxHp,iframe,ttd:-1}); }
    },90);
  }));
  await ctx.close();
  return info;
}
const r = await measure();
console.log(`RESULT maxHp=${r.maxHp} iframe=${r.iframe.toFixed(2)} time-to-die(sustained fire, iframe-respected, 90ms cadence)=${r.ttd.toFixed(2)}s`);
await browser.close();
