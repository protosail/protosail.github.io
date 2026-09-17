/**
 * Verification screenshots: drives the installed Chrome (no browser download) through
 * the dev server and captures each section at desktop and phone widths.
 *
 *   npm run shots                       all sections, both widths -> .screenshots/
 *   npm run shots -- --only=hero,team   a subset
 *   npm run shots -- --full             one full-page capture per width
 *   npm run shots -- --url=http://127.0.0.1:4173/   against `vite preview`
 *
 * The page is opened with ?shots so scroll smoothing and reveal animations are skipped
 * and every section is captured in its settled state.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const CHROME =
  process.env.CHROME ??
  args.chrome ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = args.url ?? 'http://127.0.0.1:5173/'
const OUT = args.out ?? '.screenshots'
const only = typeof args.only === 'string' ? args.only.split(',') : null

const VIEWPORTS = [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '390', width: 390, height: 844, isMobile: true, hasTouch: true },
]

/** What to capture: a selector to scroll to, and how long to let it settle. */
const SHOTS = [
  { name: 'hero', selector: '#top', settle: 1800 },
  { name: 'challenge', selector: '#challenge', settle: 1500 },
  { name: 'boat', selector: '#boat', settle: 1200 },
  { name: 'boat-01', selector: '#chapter-overview', settle: 3500 },
  { name: 'boat-02', selector: '#chapter-wingsail', settle: 3000 },
  { name: 'boat-03', selector: '#chapter-rudder', settle: 3000 },
  { name: 'boat-04', selector: '#chapter-hull', settle: 3000 },
  { name: 'boat-05', selector: '#chapter-solar', settle: 3000 },
  { name: 'boat-06', selector: '#chapter-electronics', settle: 3000 },
  { name: 'lineage', selector: '#lineage', settle: 1000 },
  { name: 'applications', selector: '#applications', settle: 1000 },
  { name: 'team', selector: '#team', settle: 1000 },
  { name: 'news', selector: '#news', settle: 1000 },
  { name: 'contact', selector: '#contact', settle: 1000 },
]

mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-dev-shm-usage',
  ],
})

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage()
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: args.reduced ? 'reduce' : 'no-preference' }])
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      isMobile: Boolean(vp.isMobile),
      hasTouch: Boolean(vp.hasTouch),
    })
    page.on('pageerror', (err) => console.error(`  [${vp.tag}] page error:`, err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') console.log(`  [${vp.tag}] console.${msg.type()}: ${msg.text()}`)
    })

    const url = new URL(BASE)
    if (!args.live) url.searchParams.set('shots', '1')
    // Vite keeps an HMR connection open in development, so `networkidle0` can hang
    // even after the page is fully rendered.
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 60_000 })
    await page.evaluate(() => document.fonts.ready)
    await sleep(800)

    if (args.full) {
      const file = join(OUT, `full-${vp.tag}.png`)
      await page.screenshot({ path: file, fullPage: true })
      console.log('wrote', file)
      await page.close()
      continue
    }

    for (const shot of SHOTS) {
      if (only && !only.includes(shot.name)) continue
      const found = await page.evaluate((selector) => {
        const el = document.querySelector(selector)
        if (!el) return false
        el.scrollIntoView({ block: 'start', behavior: 'instant' })
        return true
      }, shot.selector)
      if (!found) {
        console.log(`  skip ${shot.name}: ${shot.selector} not in page`)
        continue
      }
      await sleep(shot.settle)
      const file = join(OUT, `${shot.name}-${vp.tag}.png`)
      await page.screenshot({ path: file })
      console.log('wrote', file)
    }
    await page.close()
  }
} finally {
  await browser.close()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
