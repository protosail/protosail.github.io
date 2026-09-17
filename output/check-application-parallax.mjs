import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:4173/?nohero&nosmooth', { waitUntil: 'load', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => document.querySelector('#applications')?.scrollIntoView({ block: 'center' }))
  await page.waitForFunction(() => document.querySelectorAll('.application__image.has-depth-scene').length === 4)

  const result = await page.evaluate(async () => {
    const section = document.querySelector('#applications')
    if (!(section instanceof HTMLElement)) throw new Error('Applications section missing')

    const originalRect = section.getBoundingClientRect.bind(section)
    let rectReads = 0
    section.getBoundingClientRect = () => {
      rectReads++
      return originalRect()
    }

    const rect = originalRect()
    for (let i = 0; i < 120; i++) {
      section.dispatchEvent(new PointerEvent('pointermove', {
        pointerType: 'mouse',
        clientX: rect.left + (rect.width * i) / 119,
        clientY: rect.top + rect.height / 2,
      }))
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const burstRectReads = rectReads

    const frameTimes = []
    for (let i = 0; i < 45; i++) {
      const start = performance.now()
      await new Promise((resolve) => requestAnimationFrame(resolve))
      frameTimes.push(performance.now() - start)
      section.dispatchEvent(new PointerEvent('pointermove', {
        pointerType: 'mouse',
        clientX: rect.left + (rect.width * i) / 44,
        clientY: rect.top + rect.height * (0.35 + 0.3 * Math.sin(i / 8)),
      }))
    }

    frameTimes.sort((a, b) => a - b)
    return {
      depthScenes: document.querySelectorAll('.application__image.has-depth-scene').length,
      canvases: document.querySelectorAll('.application__image canvas').length,
      layoutReadsFor120BurstEvents: burstRectReads,
      layoutReadsFor45AnimatedFrames: rectReads - burstRectReads,
      medianFrameMs: Number(frameTimes[Math.floor(frameTimes.length / 2)].toFixed(2)),
      p95FrameMs: Number(frameTimes[Math.floor(frameTimes.length * 0.95)].toFixed(2)),
    }
  })

  console.log(JSON.stringify({ ...result, errors }, null, 2))
  if (errors.length || result.depthScenes !== 4 || result.canvases !== 4 || result.layoutReadsFor120BurstEvents > 2) {
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
