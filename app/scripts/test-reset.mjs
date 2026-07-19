import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
p.on('dialog', d => d.accept());   // auto-confirm the "Start over?" prompt
await p.goto('http://localhost:3311/g/paper-pilot', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
// seed a fake save in the game iframe, then reset, then confirm it's gone
const set = await p.evaluate(() => { const f=document.querySelector('iframe.game-stage'); f.contentWindow.localStorage.setItem('gs_save:paper-pilot','{"st":999}'); f.contentWindow.localStorage.setItem('gs_save:sky-duel','KEEP'); return f.contentWindow.localStorage.getItem('gs_save:paper-pilot'); });
await p.locator('.start-over').click();
await p.waitForTimeout(800);
const after = await p.evaluate(() => { const f=document.querySelector('iframe.game-stage'); return { pp: f.contentWindow.localStorage.getItem('gs_save:paper-pilot'), sky: f.contentWindow.localStorage.getItem('gs_save:sky-duel') }; });
console.log('before reset pp save:', set, '| after reset pp save:', after.pp, '| sky-duel save preserved:', after.sky);
await b.close();
