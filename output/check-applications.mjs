import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('.impeccable/review', { recursive: true })
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']})
const results = []
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('http://127.0.0.1:5174/?shots&nohero', {waitUntil: 'networkidle0'})
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(async () => {
      const images = [...document.querySelectorAll('#applications img')]
      images.forEach(i => i.loading = 'eager')
      await Promise.all(images.map(i => i.decode()))
    })
    await page.addStyleTag({content: '.nav, .skip { visibility: hidden !important; }'})
    const section = await page.$('#applications')
    await section.screenshot({path: `.impeccable/review/applications-${width}.png`})
    const result = await page.evaluate(() => {
      const section = document.querySelector('#applications')
      return {
        headings: [...section.querySelectorAll('h3')].map(e => e.textContent),
        images: [...section.querySelectorAll('img')].map(i => ({loaded: i.complete && i.naturalWidth > 0, width: i.naturalWidth, alt: !!i.alt})),
        overflow: document.documentElement.scrollWidth > innerWidth,
        sectionOverflow: [...section.querySelectorAll('*')].some(e => e.getBoundingClientRect().right > innerWidth + 1),
        credits: section.querySelectorAll('a[href^="https://unsplash.com"]').length,
      }
    })
    results.push({width, errors, ...result})
    await page.close()
  }
  writeFileSync('output/applications-check.json', JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  if(results.some(r=>r.errors.length || r.overflow || r.sectionOverflow || r.headings.length !== 4 || r.images.some(i=>!i.loaded))) process.exitCode = 1
} finally { await browser.close() }
