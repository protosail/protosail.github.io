import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--hide-scrollbars'] })
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
await page.setViewport({ width: 1440, height: 900 })
page.on('console', m => console.log('console.' + m.type() + ':', m.text()))
page.on('pageerror', e => console.log('pageerror:', e.message))
page.on('requestfailed', r => console.log('requestfailed:', r.url()))
await page.goto('http://127.0.0.1:5173/?debug&shots', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 3000))
const info = await page.evaluate(() => {
  const o = window.ocean
  if (!o) return 'no ocean'
  const kids = o.scene.children.map(c => `${c.type}(${c.name || ''}) children=${c.children.length} pos=${c.position.toArray().map(n => n.toFixed(2))} scale=${c.scale.x.toFixed(3)}`)
  let ghost = null
  o.scene.traverse(obj => { if (obj.isMesh && obj.material && obj.material.uniforms && obj.material.uniforms.uOpacity && !ghost) ghost = { opacity: obj.material.uniforms.uOpacity.value, visible: obj.visible, depthTest: obj.material.depthTest } })
  return { running: o.running, time: o.time, kids, ghost, cam: { pos: o.camera.position.toArray(), rot: o.camera.rotation.toArray() } }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
