import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
await page.goto('http://localhost:3311/g/glowcave?c=250', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const probe = await page.evaluate(() => {
  const out = {};
  const swipe = document.querySelector('.swipe');
  if (swipe) {
    const cs = getComputedStyle(swipe, '::before');
    out.swipeBefore = {
      content: cs.content, background: cs.backgroundColor, zIndex: cs.zIndex,
      position: cs.position, inset: cs.inset, width: cs.width, height: cs.height,
      transform: cs.transform,
    };
    out.swipeParentChain = [];
    let el = swipe;
    while (el && el !== document.body) {
      const c = getComputedStyle(el);
      if (c.backgroundColor !== 'rgba(0, 0, 0, 0)' || c.zIndex !== 'auto' || c.transform !== 'none' || c.isolation === 'isolate') {
        out.swipeParentChain.push({ tag: el.tagName, cls: el.className, bg: c.backgroundColor, z: c.zIndex, transform: c.transform, position: c.position });
      }
      el = el.parentElement;
    }
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    out.bodyBg = bodyBg;
    out.htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  } else out.swipe = 'NOT FOUND';

  // frame geometry
  const stage = document.querySelector('.game-stage');
  const frame = document.querySelector('.stage-wrap svg.hand-frame');
  if (stage && frame) {
    out.stageRect = stage.getBoundingClientRect().toJSON();
    out.frameRect = frame.getBoundingClientRect().toJSON();
    const path = frame.querySelector('path');
    const cs = getComputedStyle(path);
    out.framePath = { dasharray: cs.strokeDasharray, dashoffset: cs.strokeDashoffset, totalLen: path.getTotalLength(), frameLenVar: getComputedStyle(path).getPropertyValue('--frame-len') };
    out.stageWrapClass = document.querySelector('.stage-wrap')?.parentElement?.className;
  }
  // leaderboard first score swipe
  const first = document.querySelector('.board li .score');
  out.boardFirst = first ? getComputedStyle(first, '::before').backgroundColor : 'none';

  // fonts
  out.fonts = {
    h1: getComputedStyle(document.querySelector('h1')).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    score: first ? getComputedStyle(first).fontFamily : null,
  };
  out.fontsLoaded = document.fonts.check('16px "Shantell Sans"') + '/' + document.fonts.check('16px "Instrument Sans"') + '/' + document.fonts.check('16px "IBM Plex Mono"');
  return out;
});
console.log(JSON.stringify(probe, null, 2));

// dare dialog
await page.click('text=Dare a friend').catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/gs-review/dare-dialog.png' });

await browser.close();
