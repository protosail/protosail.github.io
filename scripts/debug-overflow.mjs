import puppeteer from 'puppeteer-core'
const width = Number(process.argv[2] ?? 390)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--hide-scrollbars'] })
const page = await browser.newPage()
await page.setViewport({ width, height: 844, deviceScaleFactor: 1 })
await page.goto('http://127.0.0.1:5173/?shots', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 2500))
const info = await page.evaluate((width) => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect()
    if (b.width > 0 && (b.right > width + 1 || b.left < -1)) {
      const path = [el.tagName.toLowerCase(), el.id ? '#' + el.id : '', el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''].join('')
      out.push(`${path}  left=${Math.round(b.left)} right=${Math.round(b.right)} width=${Math.round(b.width)}`)
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, offenders: out.slice(0, 40) }
}, width)
console.log(JSON.stringify(info, null, 1))
await browser.close()
