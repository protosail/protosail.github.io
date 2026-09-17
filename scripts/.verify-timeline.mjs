import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = '.screenshots/timeline-after';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars']});
const checks = [];
try {
  for (const width of [1440, 1100, 900, 390, 320]) {
    const page = await browser.newPage();
    await page.setViewport({width,height:950,deviceScaleFactor:1,isMobile:width<700,hasTouch:width<700});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/?shots', {waitUntil:'load'});
    await page.evaluate(()=>document.fonts.ready);
    const timeline=await page.$('.challenge-timeline');
    await timeline.screenshot({path:`${out}/${width}.png`});
    const result=await page.evaluate(()=>{
      const target=document.querySelector('.challenge-timeline');
      const items=[...target.querySelectorAll('li')];
      return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,items:items.length,headings:target.querySelectorAll('h4').length,dates:[...target.querySelectorAll('.challenge-timeline__date')].map(el=>el.textContent),clipped:items.some(el=>el.scrollWidth>el.clientWidth),layout:getComputedStyle(target.querySelector('ol')).gridTemplateColumns,visible:getComputedStyle(target).opacity};
    });
    checks.push({...result,errors});
    await page.close();
  }
} finally {await browser.close();}
writeFileSync(`${out}/checks.json`,JSON.stringify(checks,null,2));
console.log(JSON.stringify(checks,null,2));
if(checks.some(c=>c.overflow||c.clipped||c.items!==6||c.headings!==6||c.errors.length))process.exitCode=1;
