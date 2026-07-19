import { chromium } from 'playwright';
const url='http://localhost:8922/play/paper-pilot/';
const HARNESS=`window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
const b=await chromium.launch();
async function run(up,boostMs,diveN){
  const save={st:999999,up,throws:5,delivered:true,delThrows:5};
  const ctx=await b.newContext({viewport:{width:1280,height:720}});
  const page=await ctx.newPage();
  await page.addInitScript(HARNESS);
  await page.addInitScript(`try{localStorage.setItem('gs_save:paper-pilot',JSON.stringify(${JSON.stringify(save)}));localStorage.setItem('gs_best:paper-pilot','0');}catch(e){}`);
  await page.goto(url,{waitUntil:'load'}); await page.waitForTimeout(700);
  await page.mouse.move(560,280); await page.mouse.down();
  await page.mouse.move(420,400,{steps:6}); await page.mouse.move(250,520,{steps:10}); await page.mouse.up();
  await page.waitForTimeout(250);
  const tLaunch=Date.now();
  if(boostMs){ await page.keyboard.down('Space'); await page.waitForTimeout(boostMs); await page.keyboard.up('Space'); }
  let peak=0,go=null,t0=Date.now(),i=0;
  while(Date.now()-t0<45000){
    i++;
    if(diveN && i%diveN===0){ await page.keyboard.down('ArrowDown'); await page.waitForTimeout(180); await page.keyboard.up('ArrowDown'); }
    await page.waitForTimeout(350);
    const m=await page.evaluate(()=>window.__gs.msgs);
    for(const x of m){ if(x.gs==='score'&&x.score>peak) peak=x.score; }
    go=[...m].reverse().find(x=>x.gs==='gameover'); if(go) break;
  }
  const airtime=((Date.now()-tLaunch)/1000).toFixed(1);
  await ctx.close();
  return {final: go?go.scores.distance:'(aloft>45s) peak='+peak, airtime};
}
const mx={folds:7,band:7,clip:7,thr:7,fuel:7};
console.log('MAXED glide:', JSON.stringify(await run(mx,3600,10)));
console.log('MAXED dives:', JSON.stringify(await run(mx,3600,5)));
console.log('naive T0:', JSON.stringify(await run({folds:0,band:0,clip:0,thr:0,fuel:0},0,0)));
console.log('mid T3:', JSON.stringify(await run({folds:3,band:3,clip:3,thr:3,fuel:3},1500,7)));
console.log('T5:', JSON.stringify(await run({folds:5,band:5,clip:5,thr:5,fuel:5},2500,7)));
await b.close();
