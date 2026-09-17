/**
 * Protosail identity master. Run: node scripts/build-brand.mjs
 * Geometry and layout are defined here, never traced from raster edges.
 * Only the PNG/proof export needs installed Chrome and puppeteer-core.
 * node scripts/build-brand.mjs --svg-only emits vectors, geometry and guide.
 */
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'output', 'protosail-brand-kit')
const SVG_ONLY = process.argv.includes('--svg-only')
// Retain existing "black" filenames; the ink is now a softer charcoal.
const C = { lime: '#E3F941', black: '#141414', white: '#FFFFFF' }
const CAP = 1000
const round = n => Number(n.toFixed(6))
const f = n => String(round(n))
const xy = p => p.map(f).join(' ')
const rad = deg => deg * Math.PI / 180
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const unit = a => { const m = Math.hypot(...a); return a.map(x => x / m) }
const sub = (a, b) => a.map((x, i) => x - b[i])
const add = (a, b) => a.map((x, i) => x + b[i])
const mul = (a, s) => a.map(x => x * s)
const escapeHtml = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

// Convex clockwise polygons with exact circular fillets. The tangent length is
// r*cot(theta/2); no freehand Bezier handles or raster autotracing are involved.
function roundedPolygon(points, radii) {
  const corners = points.map((point, i) => {
    const u = unit(sub(points[(i + points.length - 1) % points.length], point))
    const v = unit(sub(points[(i + 1) % points.length], point))
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(u, v))))
    const radius = radii[i]
    const tangent = radius / Math.tan(theta / 2)
    const start = add(point, mul(u, tangent))
    const end = add(point, mul(v, tangent))
    const center = add(point, mul(unit(add(u, v)), radius / Math.sin(theta / 2)))
    return { point, radius, tangent, start, end, center }
  })
  const extrema = []
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i]
    const next = corners[(i + 1) % corners.length]
    const edgeLength = Math.hypot(...sub(points[(i + 1) % points.length], points[i]))
    if (c.tangent + next.tangent >= edgeLength) throw new Error('Overlapping corner fillets')
    extrema.push(c.start, c.end)
    let a = Math.atan2(c.start[1] - c.center[1], c.start[0] - c.center[0])
    let b = Math.atan2(c.end[1] - c.center[1], c.end[0] - c.center[0])
    while (b < a) b += 2 * Math.PI
    for (let q = -4; q <= 8; q++) {
      const angle = q * Math.PI / 2
      if (angle >= a && angle <= b) extrema.push(add(c.center, [c.radius * Math.cos(angle), c.radius * Math.sin(angle)]))
    }
  }
  const minX = Math.min(...extrema.map(p => p[0]))
  const minY = Math.min(...extrema.map(p => p[1]))
  const maxX = Math.max(...extrema.map(p => p[0]))
  const maxY = Math.max(...extrema.map(p => p[1]))
  return { corners, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } }
}

function polygonPath(polygon, scale = 1, dx = 0, dy = 0) {
  const t = p => add(mul(p, scale), [dx, dy])
  return polygon.corners.map((c, i) => `${i === 0 ? 'M' : 'L'} ${xy(t(c.start))} A ${f(c.radius * scale)} ${f(c.radius * scale)} 0 0 1 ${xy(t(c.end))}`).join(' ') + ' Z'
}

// Softer slopes: top/foot closer to horizontal, leading edge closer to vertical.
const wingAngles = { top: 20, leading: 70, foot: 14 }
const shoulder = [350, 400 * Math.tan(rad(wingAngles.top))]
const leadingSlope = Math.tan(rad(wingAngles.leading))
const footSlope = Math.tan(rad(wingAngles.foot))
const heelX = (shoulder[1] + shoulder[0] * leadingSlope - 790 - 750 * footSlope) / (leadingSlope - footSlope)
const mainPolygon = roundedPolygon([
  [750, 0], [750, 790], [heelX, 790 + (750 - heelX) * footSlope], shoulder,
], [24, 45, 65, 120])
const mainScale = 1000 / mainPolygon.bounds.height
const mainDx = -mainPolygon.bounds.x * mainScale
const mainDy = -mainPolygon.bounds.y * mainScale
const wingWidth = mainPolygon.bounds.width * mainScale
const wingPath = polygonPath(mainPolygon, mainScale, mainDx, mainDy)

const GAP = 65
const VANE_WIDTH = 220
const VANE_TOP = 330
const vaneAngle = 32
const vaneRise = VANE_WIDTH * Math.tan(rad(vaneAngle))
const makeVane = rawHeight => roundedPolygon([
  [0, 0], [VANE_WIDTH, vaneRise], [VANE_WIDTH, rawHeight], [0, rawHeight - vaneRise],
], [24, 95, 24, 95])
// Extend the straight sides to align the actual rounded extremum with the wing.
// This keeps the 330-unit top offset, vane width, cap angle, and radii unchanged.
const vaneTrial = makeVane(680)
const vanePolygon = makeVane(680 + (1000 - VANE_TOP) - vaneTrial.bounds.height)
const vaneDx = wingWidth + GAP - vanePolygon.bounds.x
const vaneDy = VANE_TOP - vanePolygon.bounds.y
const vanePath = polygonPath(vanePolygon, 1, vaneDx, vaneDy)
const ICON = {
  width: wingWidth + GAP + VANE_WIDTH,
  height: 1000,
  paths: [wingPath, vanePath],
}

// Custom outlined glyphs. Coordinates share cap y=0, baseline y=1000.
// The P/R bowl and counter are deliberately identical; O is reused verbatim.
const bowlCounter = 'M 310 265 H 575 C 653 265 695 297 695 355 C 695 413 653 445 575 445 H 310 Z'
const bowlTop = 'M 0 0 H 620 C 856 0 1000 148 1000 355 '
const bowlLower = [[1000, 355], [1000, 562], [856, 710], [620, 710]]
const lerp = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t)
// De Casteljau split: R leaves the very same bowl at t=.75 to join its leg.
const rb1 = lerp(bowlLower[0], bowlLower[1], .75)
const rb2 = lerp(lerp(bowlLower[0], bowlLower[1], .75), lerp(bowlLower[1], bowlLower[2], .75), .75)
const rb3 = lerp(rb2, lerp(lerp(bowlLower[1], bowlLower[2], .75), lerp(bowlLower[2], bowlLower[3], .75), .75), .75)
const GLYPHS = {
  P: { width: 1000, d: bowlTop + 'C ' + bowlLower.slice(1).map(xy).join(' ') + ' H 310 V 1000 H 0 Z ' + bowlCounter },
  R: { width: 1050, d: bowlTop + 'C ' + [rb1, rb2, rb3].map(xy).join(' ') + ' L 1050 1000 H 667 L 413 710 H 310 V 1000 H 0 Z ' + bowlCounter },
  O: { width: 1120, d: 'M 560 -20 A 560 520 0 1 1 560 1020 A 560 520 0 1 1 560 -20 Z M 560 255 A 265 245 0 1 0 560 745 A 265 245 0 1 0 560 255 Z' },
  T: { width: 900, d: 'M 0 0 H 900 V 275 H 605 V 1000 H 295 V 275 H 0 Z' },
  // Broad, balanced bowls with level terminals and a gently curved spine.
  // The outline has 180-degree symmetry about (500, 500).
  S: { width: 1000, d: 'M 1000 0 H 355 C 123 0 0 119 0 310 C 0 476 107 564 302 598 L 607 651 C 669 662 700 678 700 714 C 700 751 669 770 606 770 H 0 V 1000 H 645 C 877 1000 1000 881 1000 690 C 1000 524 893 436 698 402 L 393 349 C 331 338 300 322 300 286 C 300 249 331 230 394 230 H 1000 Z' },
  A: { width: 1010, d: 'M 326 0 H 684 L 1010 1000 H 687 L 632 810 H 374 L 319 1000 H 0 Z M 438 580 H 568 L 503 344 Z' },
  I: { width: 310, d: 'M 0 0 H 310 V 1000 H 0 Z' },
  L: { width: 820, d: 'M 0 0 H 310 V 730 H 820 V 1000 H 0 Z' },
}
const KERN = { PR: 20, RO: -30, OT: -20, TO: -20, OS: 20, SA: 25, AI: 40, IL: 40 }

function wordMetrics(text) {
  let x = 0
  const letters = Array.from(text, (letter, i) => {
    const item = { letter, x }
    x += GLYPHS[letter].width
    if (i < text.length - 1) x += KERN[letter + text[i + 1]] ?? 30
    return item
  })
  return { letters, width: x }
}
const WORD = wordMetrics('PROTOSAIL')
const PREFIX = wordMetrics('PROTOS')
const LAYOUT = {
  icon: { clearSpace: 250 },
  wordmark: { clearSpace: 500 },
  primary: { iconHeight: 1750, iconY: -480, prefixToIcon: 0, iconToL: 120, clearSpace: 500 },
  horizontal: { iconHeight: 2500, iconY: -750, gap: 400, clearSpace: 500 },
  stacked: { iconHeight: 3300, gap: 400, clearSpace: 500 },
  panelOnWhite: { whiteBorder: 250 },
  app: { tile: 1000, radius: 160, iconHeight: 700 },
  favicon: { tile: 1000, radius: 0, iconHeight: 760 },
}

const pathTag = (d, fill, attrs = '') => `<path d="${d}" fill="${fill}" fill-rule="evenodd"${attrs ? ' ' + attrs : ''}/>`
function iconMarkup(fill, x = 0, y = 0, height = 1000) {
  return `<g data-component="sail-icon" transform="translate(${f(x)} ${f(y)}) scale(${f(height / 1000)})">\n${ICON.paths.map((d, i) => pathTag(d, fill, `data-part="${i ? 'vane' : 'wing'}"`)).join('\n')}\n</g>`
}
function wordMarkup(text, fill, x = 0, y = 0) {
  return `<g data-component="lettering" transform="translate(${f(x)} ${f(y)})">\n${wordMetrics(text).letters.map(l => pathTag(GLYPHS[l.letter].d, fill, `data-letter="${l.letter}" transform="translate(${f(l.x)} 0)"`)).join('\n')}\n</g>`
}

const editions = [
  { name: 'lime-black', label: 'Lime / charcoal', icon: C.lime, text: C.black, background: 'light' },
  { name: 'lime-white', label: 'Lime / white', icon: C.lime, text: C.white, background: 'dark' },
  { name: 'black', label: 'Solid charcoal', icon: C.black, text: C.black, background: 'light' },
  { name: 'white', label: 'Solid white', icon: C.white, text: C.white, background: 'dark' },
]
const assets = []
function asset(kind, edition, art, bounds, pad, description, tile = false) {
  const box = [bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2]
  const name = `protosail-${kind}-${edition.name}`
  const title = `Protosail ${kind === 'primary' ? 'integrated primary logo' : kind} — ${edition.label}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(f).join(' ')}" width="${f(box[2])}" height="${f(box[3])}" role="img" aria-label="${escapeHtml(title)}">\n<title>${escapeHtml(title)}</title>\n<desc>${escapeHtml(description)}</desc>\n${art}\n</svg>\n`
  const result = { name, kind, edition: edition.name, label: title, background: edition.background, box, bounds, pad, tile, art, svg }
  assets.push(result)
  return result
}

for (const edition of [
  { name: 'lime', label: 'Lime', icon: C.lime, background: 'dark' },
  editions[2], editions[3],
]) asset('icon', edition, iconMarkup(edition.icon), { x: 0, y: 0, width: ICON.width, height: 1000 }, 250, 'Two solid sail panels. The 65-unit gap and original asymmetry are fixed. Includes 250 units of clear space.')

for (const edition of editions.slice(2)) asset('wordmark', edition, wordMarkup('PROTOSAIL', edition.text), { x: 0, y: -20, width: WORD.width, height: 1040 }, 500, 'PROTOSAIL custom outlined lettering, including conventional A and I. No font required. Includes 500 units of clear space.')

for (const edition of editions) {
  const p = LAYOUT.primary
  const iw = ICON.width * p.iconHeight / 1000
  const ix = PREFIX.width + p.prefixToIcon
  const lx = ix + iw + p.iconToL
  asset('primary', edition,
    wordMarkup('PROTOS', edition.text) + '\n' + iconMarkup(edition.icon, ix, p.iconY, p.iconHeight) + '\n' + wordMarkup('L', edition.text, lx),
    { x: 0, y: p.iconY, width: lx + GLYPHS.L.width, height: p.iconHeight }, p.clearSpace,
    'Protosail integrated logo. The two sails replace A and I: PROTOS + sail pair + L. Includes half a cap height of clear space.')

  const h = LAYOUT.horizontal
  const hw = ICON.width * h.iconHeight / 1000
  asset('horizontal', edition,
    iconMarkup(edition.icon, 0, h.iconY, h.iconHeight) + '\n' + wordMarkup('PROTOSAIL', edition.text, hw + h.gap),
    { x: 0, y: h.iconY, width: hw + h.gap + WORD.width, height: h.iconHeight }, h.clearSpace,
    'Horizontal compact logo: separate sail icon and full PROTOSAIL wordmark. The icon is 2.5 cap heights tall; artwork gap is 400 units.')

  const s = LAYOUT.stacked
  const sw = ICON.width * s.iconHeight / 1000
  const sy = s.iconHeight + s.gap + 20 // account for the round O overshoot
  asset('stacked', edition,
    iconMarkup(edition.icon, (WORD.width - sw) / 2, 0, s.iconHeight) + '\n' + wordMarkup('PROTOSAIL', edition.text, 0, sy),
    { x: 0, y: 0, width: WORD.width, height: sy + 1020 }, s.clearSpace,
    'Stacked logo. Icon and full wordmark are centred by their artwork bounds. The icon is 3.3 cap heights tall with a 400-unit visible gap.')
}

// Embedded charcoal rectangles and an opaque white surround travel with the SVG.
// The panel includes the same 500-unit inner clear space as its transparent master.
for (const kind of ['primary', 'stacked']) {
  const base = assets.find(a => a.kind === kind && a.edition === 'lime-white')
  const [x, y, width, height] = base.box
  const border = LAYOUT.panelOnWhite.whiteBorder
  const bounds = { x: x - border, y: y - border, width: width + border * 2, height: height + border * 2 }
  const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} H ${f(x + w)} V ${f(y + h)} H ${f(x)} Z`
  asset(kind, { name: 'panel-white', label: 'Charcoal panel on white', background: 'light' },
    pathTag(rect(bounds.x, bounds.y, bounds.width, bounds.height), C.white, 'data-component="white-background"') + '\n' +
    pathTag(rect(x, y, width, height), C.black, 'data-component="panel"') + '\n' + base.art,
    bounds, 0, 'Lime sails and white lettering on an embedded charcoal rectangle, with a white outer border. Inner clear space is 500 units; white border is 250 units.', true)
}

for (const kind of ['app', 'favicon']) {
  const t = LAYOUT[kind]
  const iw = ICON.width * t.iconHeight / 1000
  // Rounded tile is also an outlined path, not a clipping mask.
  const tilePath = t.radius ? polygonPath(roundedPolygon([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], [t.radius, t.radius, t.radius, t.radius])) : 'M 0 0 H 1000 V 1000 H 0 Z'
  asset(kind, { name: 'lime', label: 'Lime on charcoal', background: 'light' },
    pathTag(tilePath, C.black, 'data-component="tile"') + '\n' + iconMarkup(C.lime, (1000 - iw) / 2, (1000 - t.iconHeight) / 2, t.iconHeight),
    { x: 0, y: 0, width: 1000, height: 1000 }, 0,
    `${kind === 'app' ? 'Rounded app tile' : 'Square favicon tile'}, lime sail icon on charcoal. Uses exactly the same sail paths as the master. Tile padding is built in.`, true)
}

const geometry = {
  version: 2,
  units: 'Icon artwork height = 1000. Letter cap height = 1000. All measures are SVG user units.',
  colours: C,
  icon: {
    width: round(ICON.width), height: ICON.height, wingWidth: round(wingWidth), gap: GAP,
    vaneWidth: VANE_WIDTH, vaneTop: VANE_TOP, vaneHeight: round(vanePolygon.bounds.height), alignedBottom: 1000,
    wingAnglesDegrees: wingAngles, vaneCapAngleDegrees: vaneAngle,
    wingCornerRadii: mainPolygon.corners.map(c => round(c.radius * mainScale)),
    vaneCornerRadii: vanePolygon.corners.map(c => c.radius),
    wingPath, vanePath,
  },
  lettering: { capHeight: CAP, mainStem: 310, roundOvershoot: 20, kerning: KERN, wordWidth: WORD.width, glyphs: GLYPHS, placements: WORD.letters },
  layouts: LAYOUT,
  assets: assets.map(({ svg, art, ...a }) => ({ ...a, svg: `svg/${a.name}.svg` })),
}

const widthsFor = a => a.kind === 'app' ? [192, 512] : a.kind === 'favicon' ? [16, 32, 48] : [512, 2048]
const findAsset = (kind, edition) => assets.find(a => a.kind === kind && a.edition === edition)
const imageTag = (kind, edition, cls = '') => {
  const a = findAsset(kind, edition)
  return `<img class="${cls}" src="svg/${a.name}.svg" alt="${escapeHtml(a.label)}"/>`
}
const downloads = a => `<a href="svg/${a.name}.svg" download>SVG ↗</a>${widthsFor(a).map(w => `<a href="png/${a.name}-${w}.png" download>PNG ${w}</a>`).join('')}`

function guideHtml() {
  const gallery = ['primary', 'icon', 'wordmark', 'horizontal', 'stacked'].map((kind, i) => {
    const light = findAsset(kind, ['icon', 'wordmark'].includes(kind) ? 'black' : ['primary', 'stacked'].includes(kind) ? 'panel-white' : 'lime-black')
    const dark = findAsset(kind, kind === 'icon' ? 'lime' : kind === 'wordmark' ? 'white' : 'lime-white')
    return `<section class="variant" id="${kind}"><div class="section-label"><span>0${i + 1}</span><h2>${({ primary: 'Integrated signature', icon: 'Sail icon', wordmark: 'Wordmark', horizontal: 'Horizontal compact', stacked: 'Stacked signature' })[kind]}</h2></div><div class="pair"><div class="specimen light ${kind}">${imageTag(kind, light.edition)}</div><div class="specimen dark ${kind}">${imageTag(kind, dark.edition)}</div></div><div class="files">${assets.filter(a => a.kind === kind).map(a => `<div><span>${escapeHtml(a.edition.replaceAll('-', ' / '))}</span><nav>${downloads(a)}</nav></div>`).join('')}</div></section>`
  }).join('\n')
  const sizes = [16, 24, 32, 48, 64].map(size => `<div>${imageTag('favicon', 'lime', '')}<span>${size} px</span><style>.sizes > div:nth-child(${[16,24,32,48,64].indexOf(size) + 1}) img { width:${size}px;height:${size}px }</style></div>`).join('')
  const letters = Object.keys(GLYPHS).map(letter => `<div><svg viewBox="-90 -120 ${GLYPHS[letter].width + 180} 1240" aria-label="${letter}">${pathTag(GLYPHS[letter].d, C.black)}</svg><span>${letter}</span></div>`).join('')
  const construction = `<svg viewBox="-150 -130 ${f(ICON.width + 300)} 1260" role="img" aria-label="Sail geometry with master dimensions"><defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 H 0 V 50" fill="none" stroke="#dcded6" stroke-width="1"/></pattern></defs><path d="M -150 -130 H ${f(ICON.width+150)} V 1130 H -150 Z" fill="url(#grid)"/>${iconMarkup(C.black)}<g fill="none" stroke="#627334" stroke-width="2"><path d="M -65 0 V 1000 M -80 0 H -50 M -80 1000 H ${f(ICON.width + 50)} M ${f(wingWidth)} 250 V 325 M ${f(wingWidth + GAP)} 250 V 325 M ${f(wingWidth)} 275 H ${f(wingWidth + GAP)}"/></g><g font-family="Arial,sans-serif" font-size="30" fill="#52622d"><text x="-85" y="500" transform="rotate(-90 -85 500)" text-anchor="middle">1000 units</text><text x="${f(wingWidth + GAP / 2)}" y="235" text-anchor="middle">65</text></g></svg>`
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Protosail — vector identity kit</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f6ef;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5}a{color:inherit;text-underline-offset:4px}img,svg{display:block;max-width:100%}header{padding:38px 5vw 72px;background:${C.black};color:#fff}.topline{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #353535;padding-bottom:20px;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.topline nav{display:flex;gap:24px}.hero{max-width:1320px;margin:50px auto 0}.hero img{width:100%;max-height:370px}.hero-note{display:flex;justify-content:space-between;gap:40px;color:#b9b9b9;font-size:13px}.hero-note p{max-width:420px}.hero-note strong{font-weight:400;color:#e3f941}main{max-width:1320px;margin:auto;padding:60px 40px 90px}.intro{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin-bottom:60px}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#636658}h1{font-size:clamp(30px,4vw,52px);font-weight:500;letter-spacing:-.045em;line-height:1.08;margin:12px 0 20px}h2{font-size:20px;font-weight:500;letter-spacing:-.02em;margin:0}h3{font-size:14px;font-weight:600;margin:0 0 12px}p{margin:0 0 16px}.intro-copy{padding-top:30px;color:#52544c}.button{display:inline-block;background:${C.black};color:#fff;padding:12px 18px;text-decoration:none;margin-top:6px;font-size:13px}.variant{margin-bottom:55px;scroll-margin-top:20px}.section-label{display:flex;gap:18px;align-items:center;border-top:1px solid #ccd0c1;padding-top:18px;margin-bottom:20px}.section-label>span{font-size:11px;color:#73766a}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#daddd2;border:1px solid #daddd2}.specimen{display:flex;align-items:center;justify-content:center;min-height:225px;padding:22px}.light{background:#fff}.dark{background:${C.black}}.specimen img{width:100%;max-height:215px}.specimen.icon img{width:225px;height:225px}.specimen.icon{min-height:285px}.specimen.stacked{min-height:340px}.specimen.stacked img{max-height:310px}.files{display:grid;grid-template-columns:1fr 1fr;gap:0 35px;margin-top:12px}.files>div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #daddd2;font-size:11px}.files>div>span{min-width:0;text-transform:uppercase;letter-spacing:.07em}.files nav{display:flex;gap:12px;white-space:nowrap}.utility{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:60px 0}.utility-panel{border-top:1px solid #ccd0c1;padding-top:20px}.app-samples{display:flex;align-items:center;gap:28px;margin:30px 0}.app-samples img:first-child{width:150px}.app-samples img:last-child{width:96px}.sizes{display:flex;align-items:flex-end;gap:30px;min-height:180px;padding-bottom:26px}.sizes>div{display:flex;flex-direction:column;align-items:center;gap:12px}.sizes span{font-size:11px;color:#636658}.utility p{font-size:13px;color:#53564c}.construction{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin:25px 0 55px}.construction>svg{max-height:425px;width:100%}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:10px 0;border-bottom:1px solid #d5d8cc}th{font-size:11px;color:#666a5d;text-transform:uppercase;letter-spacing:.05em;font-weight:400}td:last-child{text-align:right;font-variant-numeric:tabular-nums}.swatches{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:25px 0}.swatch{height:100px;padding:12px;display:flex;align-items:flex-end;font-size:12px;font-family:monospace}.alphabet{display:grid;grid-template-columns:repeat(8,1fr);gap:12px;margin:25px 0 20px}.alphabet>div{border-bottom:1px solid #ccd0c1}.alphabet svg{height:100px;width:100%}.alphabet span{display:block;color:#727569;text-align:center;font-size:11px;padding:10px}.notes{display:grid;grid-template-columns:1fr 1fr;gap:60px;font-size:13px;color:#53564c;margin:30px 0 55px}.notes strong{color:#171914;font-weight:600}.minimums{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#daddd2;border:1px solid #daddd2;margin-top:20px}.minimums>div{background:#fff;padding:25px;min-height:125px}.minimums img{margin:18px 0}.minimums span{font-size:12px;color:#636658}.minimums .primary img{width:200px}.minimums .wordmark img{width:160px}.minimums .horizontal img{width:240px}.minimums .stacked img{width:180px}footer{border-top:1px solid #ccd0c1;padding-top:25px;font-size:12px;color:#636658;display:flex;justify-content:space-between;gap:30px}code{font-size:12px}a:focus-visible{outline:2px solid #748b25;outline-offset:5px}@media(max-width:720px){main{padding:35px 20px}.intro,.pair,.construction,.utility,.notes,.minimums{grid-template-columns:1fr;gap:24px}.files{grid-template-columns:1fr}.intro{gap:0}.intro-copy{padding-top:0}.hero-note{display:block}.topline nav{gap:12px}.topline{letter-spacing:.02em}.specimen{min-height:175px}.alphabet{grid-template-columns:repeat(4,1fr)}.hero{margin-top:35px}header{padding:25px 20px 40px}footer{display:block}.sizes{gap:25px}.minimums{gap:1px}}@media print{header{print-color-adjust:exact;-webkit-print-color-adjust:exact}.dark,.swatch{print-color-adjust:exact;-webkit-print-color-adjust:exact}.variant,.construction,.utility{break-inside:avoid}.topline nav,.button,.files{display:none}main{padding:30px 0}}
@media(max-width:720px){.intro-copy{padding-top:24px}}
</style></head><body>
<header><div class="topline"><span>Protosail / identity system</span><nav><a href="#primary">Assets</a><a href="#construction">Construction</a><a href="protosail-brand-kit.zip" download>Download kit ↗</a></nav></div><div class="hero">${imageTag('primary','lime-white')}<div class="hero-note"><p>One icon. One set of letterforms.<br>Consistent at every scale.</p><p><strong>Vector master / 01</strong><br>Custom outlines · Flat colour · Fixed proportions</p></div></div></header>
<main><div class="intro"><div><span class="eyebrow">Asset library</span><h1>A precise identity,<br>ready to use.</h1><a class="button" href="protosail-brand-kit.zip" download>Download the complete kit ↗</a></div><div class="intro-copy"><p>Reconstructed from the supplied design: two solid sail panels and bold, geometric lettering. Every composition uses the same vector masters.</p><p>Use SVG for sharp, scalable artwork. Use PNG when an application needs an image file. Clear space is already included; scale each file proportionally.</p><p>The yellow-lime is <strong>${C.lime}</strong>; the charcoal is <strong>${C.black}</strong>. Use charcoal lettering on light backgrounds and white lettering on dark backgrounds. The panel-on-white editions include their rectangle and white surround. For stronger contrast on light backgrounds, choose the solid charcoal icon.</p></div></div>
${gallery}
<div class="utility"><section class="utility-panel"><h2>06 &nbsp; App icon</h2><div class="app-samples">${imageTag('app','lime')}${imageTag('app','lime')}</div><p>A rounded charcoal tile with 70% icon height. Ready for profiles, app shortcuts, and presentations. Corners outside the tile are transparent.</p><div class="files"><div><nav>${downloads(findAsset('app','lime'))}</nav></div></div></section><section class="utility-panel"><h2>07 &nbsp; Favicon</h2><div class="sizes">${sizes}</div><p>Shown at actual CSS sizes. A square charcoal tile with 76% icon height preserves the panel gap at small sizes. The silhouette is unchanged.</p><div class="files"><div><nav><a href="svg/protosail-favicon-lime.svg" download>SVG ↗</a><a href="protosail-favicon.ico" download>ICO ↗</a></nav></div></div></section></div>
<section id="construction"><div class="section-label"><span>08</span><h2>Construction &amp; colour</h2></div><div class="construction">${construction}<div><table><tbody><tr><th>Master measurement</th><th>Units</th></tr><tr><td>Icon artwork height</td><td>1000</td></tr><tr><td>Icon artwork width</td><td>${f(ICON.width)}</td></tr><tr><td>Gap between vertical panel edges</td><td>65</td></tr><tr><td>Vane width / top offset</td><td>220 / 330</td></tr><tr><td>Wing top / leading / foot angles</td><td>${wingAngles.top}° / ${wingAngles.leading}° / ${wingAngles.foot}°</td></tr><tr><td>Both panel bottoms</td><td>y = 1000</td></tr><tr><td>Parallel vane caps</td><td>${vaneAngle}°</td></tr><tr><td>Letter cap height / main stem</td><td>1000 / 310</td></tr><tr><td>Round-letter overshoot</td><td>20</td></tr></tbody></table><div class="swatches"><div class="swatch" style="background:#e3f941">${C.lime}</div><div class="swatch" style="background:${C.black};color:#fff">${C.black}</div><div class="swatch" style="background:#fff">#FFFFFF</div></div><p style="font-size:13px;color:#53564c">The lime is an approximate sample from the reference, standardised as flat sRGB. Print colour matching depends on the production process; these files do not prescribe a spot ink.</p></div></div>
<h3>Custom letterforms</h3><div class="alphabet">${letters}</div><div class="notes"><div><p><strong>Consistent construction.</strong> P and R share a bowl and counter. Both O characters use the same path. Vertical stems are 310 units; curved forms use optical compensation. All exported lettering is outlined.</p><p><strong>Optical spacing.</strong> Fixed pair adjustments balance curved, diagonal, and straight edges. Negative bounding-box gaps at RO, OT, and TO are intentional; the filled letterforms do not touch.</p></div><div><p><strong>Clear space.</strong> Standalone icon: 250 units, or one-quarter of icon height. Wordmarks and logo compositions: 500 units, or half a letter cap height, outside the visible artwork bounds.</p><p><strong>Reuse.</strong> Preserve the viewBox and aspect ratio. Do not alter one sail independently, retype the wordmark, stretch the logo, or add gradients. App and favicon tiles have their own built-in margins.</p></div></div>
<h3>Fixed composition measurements</h3><table><thead><tr><th>Composition</th><th>Icon height</th><th>Gap / placement</th></tr></thead><tbody><tr><td>Integrated primary</td><td>1.75 × cap</td><td>Icon y −480; S-to-icon 0; icon-to-L 120</td></tr><tr><td>Horizontal compact</td><td>2.5 × cap</td><td>400 gap; icon y −750</td></tr><tr><td>Stacked</td><td>3.3 × cap</td><td>400 visible gap; centred artwork</td></tr><tr><td>App / favicon</td><td>70% / 76% of tile</td><td>Centred artwork; app corner radius 16%</td></tr></tbody></table></section>
<section style="margin:55px 0"><div class="section-label"><span>09</span><h2>Minimum recommended display sizes</h2></div><p>Widths below include the supplied clear space. Use the icon or favicon where there is not enough room for readable lettering. Standalone icon: 32 px wide; favicon: 16 px square.</p><div class="minimums"><div class="primary"><span>Integrated primary · 200 px</span>${imageTag('primary','black')}</div><div class="wordmark"><span>Wordmark · 160 px</span>${imageTag('wordmark','black')}</div><div class="horizontal"><span>Horizontal · 240 px</span>${imageTag('horizontal','black')}</div><div class="stacked"><span>Stacked · 180 px</span>${imageTag('stacked','black')}</div></div></section>
<footer><p>PROTOSAIL / Vector identity kit<br>Geometry source: <a href="source/build-brand.mjs">build-brand.mjs</a> · <a href="geometry.json">Measurements &amp; paths</a> · <a href="README.md">Usage guide</a></p><p>${assets.length} SVG masters · PNG fallbacks · Multi-size ICO<br>Reference artwork reconstructed as editable vector paths.</p></footer></main></body></html>\n`
}

function readme() {
  return `# Protosail vector identity kit

Open **index.html** for the visual guide and downloads. All SVG files are self-contained vector paths; no font installation is needed. The artwork uses flat sRGB colours, without raster images, gradients, strokes, or external resources.

## Choose an asset

| File group | Use |
| --- | --- |
| icon | The two sail shapes alone. Yellow-lime, charcoal, white. |
| wordmark | Full PROTOSAIL lettering with conventional A and I. Charcoal or white. |
| primary | PROTOS + sail pair + L. Sails replace AI. |
| horizontal | Sail icon beside the full wordmark. |
| stacked | Sail icon above the full wordmark. |
| app | Rounded charcoal tile; lime icon. |
| favicon | Square charcoal tile; lime icon. |

Primary, horizontal, and stacked logos each have lime-black, lime-white, black, and white editions. Use lime-black or black on light backgrounds; lime-white or white on dark backgrounds. The lime icon is most distinct on a dark background. The primary and stacked logos also include **panel-white** editions: yellow-lime sails and white text on a charcoal rectangle with an opaque white outer border. The other ordinary logo files are transparent. App tile corner areas are transparent; the favicon tile is opaque charcoal. Filenames containing black are retained for compatibility and now use charcoal ${C.black}.

## Geometry and spacing

- Icon height: 1000 units. Width: ${f(ICON.width)} units. Main wing width: ${f(wingWidth)} units.
- Gap between panel vertical edges: 65 units. Vane width: 220 units. Vane top: 330 units. Vane height: ${f(vanePolygon.bounds.height)} units.
- Main wing edge angles: top ${wingAngles.top}°, leading ${wingAngles.leading}°, foot ${wingAngles.foot}°. The main trailing edge and both vane side edges are exactly vertical. Vane caps are parallel at ${vaneAngle}°. Both rounded sail bottoms lie on y=1000.
- Main corner radii, tip / trailing foot / heel / shoulder: ${mainPolygon.corners.map(c => f(c.radius * mainScale)).join(' / ')} units.
- Vane corner radii, top-left / top-right / bottom-right / bottom-left: 24 / 95 / 24 / 95 units. Circular fillets meet their straight edges tangentially.
- S is redrawn with balanced rounded bowls, level terminals, and 180-degree symmetry.
- Letter cap height: 1000 units; baseline y=1000. Main vertical stem: 310 units. O overshoots by 20 units above and below. P and R share the same bowl and counter; repeated O paths are identical.
- Kerning, in cap units: ${Object.entries(KERN).map(([k,v]) => `${k} ${v}`).join('; ')}. These are gaps between glyph bounding boxes, not between every visible edge.
- Integrated primary: icon height 1750, icon y=−480, S-to-icon bounding-box gap 0, icon-to-L gap 120.
- Horizontal: icon height 2500, icon y=−750, icon-to-wordmark gap 400.
- Stacked: icon height 3300, visible gap 400 above the O overshoot, artwork centred horizontally.
- App: 1000-unit square, corner radius 160, icon height 700. Favicon: square tile, icon height 760. Both use centred artwork and unchanged master sail paths.

## Clear space and minimum sizes

Supplied viewBoxes include clear space. Keep at least that much room outside the visible artwork. Do not crop this padding when positioning neighbouring content.

- Icon: 250 units on every side, one-quarter of icon height. Recommended minimum file width: 32 px.
- Lettered compositions: 500 units on every side, half a letter cap height.
- Recommended minimum file widths including padding: primary 200 px; wordmark 160 px; horizontal 240 px; stacked 180 px.
- Favicon minimum: 16 × 16 px. At 16 px the panel gap is subpixel-antialiased; use 32 px or above where space permits. ICO contains 16, 32, and 48 px PNG-compressed entries.
- Tile margins are built in and differ from the ordinary logo clear-space rule. Panel-white editions contain 500 units of charcoal clear space plus a 250-unit white border; minimum widths are 220 px for primary and 200 px for stacked.

## Formats

- **svg/** — ${assets.length} scalable, editable files. The icon paths and letter paths can be selected in a vector editor. All transforms are translations or uniform scales.
- **png/** — ordinary logos at 512 and 2048 px wide; app icons at 192 and 512 px; favicons at 16, 32, and 48 px. Width includes clear space; height is rounded to the nearest whole pixel with uniform fitting.
- **protosail-favicon.ico** — 16/32/48 px multi-size favicon.
- **preview.png** — overview of the complete system.
- **geometry.json** — canonical paths, layout data, glyph placements, and asset dimensions.
- **source/build-brand.mjs** — reproducible source; canonical working copy is scripts/build-brand.mjs in the project.
- **manifest.json** — SHA-256 checksums of packaged files (excluding itself and the ZIP).
- **protosail-brand-kit.zip** — the complete kit; does not contain a recursive copy of itself.

## Colours

Yellow-lime **${C.lime}**, charcoal **${C.black}**, white **${C.white}**. Lime is an approximate sample from the supplied AI reference and is deliberately flattened to one colour. No spot-ink or CMYK match is asserted. A print provider can colour-match the vector artwork for its process.

## Editing and regeneration

Scale entire compositions proportionally; preserve the viewBox. Do not retype the wordmark or reshape one sail separately. No website integration is performed by this kit.

From the original project, run:

    node scripts/build-brand.mjs

Chrome and the project's installed puppeteer-core are used for PNG/proof exports. Set the CHROME environment variable to override the default Windows Chrome location. For vectors, JSON, and documentation only:

    node scripts/build-brand.mjs --svg-only

Edit the canonical geometry or layout constants in scripts/build-brand.mjs and regenerate all outputs together. Manual edits to generated files will be overwritten. Regeneration is byte-stable within the same Node/Chrome environment; a different renderer version may change PNG antialiasing.

In HTML, use an img element with meaningful alternative text, e.g. alt="Protosail" for a homepage logo. Use empty alt text for a purely decorative repeat. Set width and height through CSS while preserving aspect ratio.
`
}

// A compact visual contact sheet is also exported as a PNG for quick review.
function proofHtml() {
  const primary = findAsset('primary', 'lime-white')
  const cell = (label, kind, edition, dark = false, extra = '') => `<div class="cell ${dark ? 'dark' : ''} ${kind}"><label>${label}</label>${imageTag(kind, edition)}${extra}</div>`
  return `<!doctype html><html><head><meta charset="utf-8"/><style>*{box-sizing:border-box}body{margin:0;width:1440px;background:#f5f6ef;color:#111;font-family:Arial,sans-serif}.title{height:105px;padding:32px 40px;display:flex;justify-content:space-between;align-items:center}.title h1{font-size:24px;letter-spacing:-.02em;font-weight:500;margin:0}.title p{font-size:12px;color:#62665a}.hero{height:300px;background:${C.black};display:flex;align-items:center;padding:0 65px}.hero img{width:100%;max-height:295px}.row{display:grid;border-bottom:1px solid #d6d9cd}.three{grid-template-columns:repeat(3,1fr)}.two{grid-template-columns:1fr 1fr}.cell{position:relative;background:#fff;display:flex;justify-content:center;align-items:center;height:275px;border-right:1px solid #d6d9cd;padding:48px 22px 20px}.cell.dark{background:${C.black};border-color:#303030}.cell label{position:absolute;left:24px;top:18px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#62665a}.cell.dark label{color:#ababab}.cell img{display:block;width:100%;max-height:190px}.cell.icon img{width:240px;height:240px;max-height:none}.cell.stacked{height:320px}.cell.stacked img{max-height:270px}.cell.app{height:320px}.cell.app img{width:190px;height:190px;max-height:none}.footer{height:95px;padding:24px 40px;display:flex;justify-content:space-between;font-size:12px;color:#636658}.colours{display:flex;gap:18px;align-items:center}.colours i{display:inline-block;width:22px;height:22px;vertical-align:middle;border:1px solid #d5d8cc;margin-right:8px}</style></head><body><div class="title"><h1>PROTOSAIL / Vector identity</h1><p>PRECISE GEOMETRY &nbsp;·&nbsp; CUSTOM LETTERING &nbsp;·&nbsp; SHARED MASTERS</p></div><div class="hero"><img src="svg/${primary.name}.svg" alt="Protosail integrated logo"/></div><div class="row three">${cell('01 / Sail icon','icon','lime',true)}${cell('02 / Monochrome','icon','black')}${cell('03 / Reverse','icon','white',true)}</div><div class="row two">${cell('04 / Wordmark','wordmark','black')}${cell('05 / Horizontal compact','horizontal','lime-white',true)}</div><div class="row three">${cell('06 / Stacked, panel on white','stacked','panel-white')}${cell('07 / Stacked, dark','stacked','lime-white',true)}${cell('08 / App icon','app','lime')}</div><div class="row">${cell('09 / Primary, panel on white','primary','panel-white')}</div><div class="footer"><p>One set of paths. Uniform scale. Fixed optical spacing.<br>SVG masters + PNG exports + favicon + construction guide.</p><div class="colours"><span><i style="background:#e3f941"></i>#E3F941</span><span><i style="background:${C.black}"></i>${C.black}</span><span><i style="background:#fff"></i>#FFFFFF</span></div></div></body></html>`
}

async function exportRasters() {
  const { default: puppeteer } = await import('puppeteer-core')
  const chrome = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  if (!existsSync(chrome)) throw new Error('Chrome not found. Set CHROME to its executable path, or use --svg-only.')
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text'] })
  const observations = []
  try {
    const page = await browser.newPage()
    for (const a of assets) {
      for (const width of widthsFor(a)) {
        const height = Math.max(1, Math.round(width * a.box[3] / a.box[2]))
        await page.setViewport({ width, height, deviceScaleFactor: 1 })
        // Panel editions are opaque white to the raster edge, including any
        // fractional letterbox caused by rounding the output height to pixels.
        const canvasBackground = a.edition === 'panel-white' ? C.white : 'transparent'
        await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;background:${canvasBackground}}svg{display:block;width:100%;height:100%}</style></head><body>${a.svg}</body></html>`)
        await page.screenshot({ path: path.join(OUT, 'png', `${a.name}-${width}.png`), omitBackground: true })
      }
      const result = await page.evaluate(() => {
        const svg = document.querySelector('svg')
        const b = svg.getBBox()
        const v = svg.viewBox.baseVal
        return {
          finite: [b.x,b.y,b.width,b.height].every(Number.isFinite),
          contained: b.x >= v.x - 0.001 && b.y >= v.y - 0.001 && b.x+b.width <= v.x+v.width+0.001 && b.y+b.height <= v.y+v.height+0.001,
          bounds: { x:b.x,y:b.y,width:b.width,height:b.height },
          fontIndependent: !svg.querySelector('text,image,foreignObject,use,style,script'),
          sailPaths: [...svg.querySelectorAll('[data-part]')].map(p => p.getAttribute('d')),
          alignedBottoms: (() => { const parts = [...svg.querySelectorAll('[data-part]')]; if (!parts.length) return true; const bottoms = parts.map(p => { const b = p.getBBox(); return b.y + b.height }); return Math.abs(bottoms[0] - bottoms[1]) < 0.001 })(),
          glyphs: [...svg.querySelectorAll('[data-letter]')].map(p => ({ letter:p.dataset.letter,d:p.getAttribute('d') })),
        }
      })
      if (!result.finite || !result.contained || !result.fontIndependent || !result.alignedBottoms) throw new Error(`SVG validation failed: ${a.name}`)
      if (result.sailPaths.length && JSON.stringify(result.sailPaths) !== JSON.stringify(ICON.paths)) throw new Error(`Sail master mismatch: ${a.name}`)
      if (result.glyphs.some(g => g.d !== GLYPHS[g.letter].d)) throw new Error(`Glyph master mismatch: ${a.name}`)
      for (const key of ['x', 'y', 'width', 'height']) if (Math.abs(result.bounds[key] - a.bounds[key]) > 0.03) throw new Error(`Declared artwork bounds differ: ${a.name} ${key}: ${result.bounds[key]} versus ${a.bounds[key]}`)
      observations.push({ file:a.name+'.svg', bounds:result.bounds, contained:result.contained, fontIndependent:result.fontIndependent, alignedBottoms:result.alignedBottoms, canonicalPaths:true })
    }
    await page.setViewport({ width: 1440, height: 1370, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(path.join(OUT, 'proof.html')).href, { waitUntil: 'load' })
    await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode())) })
    await page.screenshot({ path:path.join(OUT,'preview.png'), fullPage:true })
    const proofResult = await page.evaluate(() => ({ loaded:[...document.images].every(i => i.complete && i.naturalWidth > 0), overflow:document.documentElement.scrollWidth > innerWidth }))
    if (!proofResult.loaded || proofResult.overflow) throw new Error('Proof rendering failed')
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor:1 })
      await page.goto(pathToFileURL(path.join(OUT,'index.html')).href, { waitUntil:'load' })
      await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode())) })
      const layout = await page.evaluate(() => ({ overflow:document.documentElement.scrollWidth > innerWidth, loaded:[...document.images].every(i => i.naturalWidth > 0) }))
      if (layout.overflow || !layout.loaded) throw new Error(`Guide rendering failed at ${width}px: ${JSON.stringify(layout)}`)
    }
    await writeFile(path.join(OUT,'verification.json'), JSON.stringify({ renderer: await browser.version(), vectors:observations, guideWidths:[1440,390], pngCount:assets.reduce((n,a) => n+widthsFor(a).length,0) }, null, 2)+'\n')
  } finally { await browser.close() }
}

async function exportIco() {
  const widths = [16,32,48]
  const pngs = await Promise.all(widths.map(w => readFile(path.join(OUT,'png',`protosail-favicon-lime-${w}.png`))))
  const head = Buffer.alloc(6 + widths.length * 16)
  head.writeUInt16LE(1,2)
  head.writeUInt16LE(widths.length,4)
  let offset = head.length
  pngs.forEach((png,i) => {
    const p = 6+i*16
    head[p] = widths[i]; head[p+1] = widths[i]
    head.writeUInt16LE(1,p+4); head.writeUInt16LE(32,p+6)
    head.writeUInt32LE(png.length,p+8); head.writeUInt32LE(offset,p+12)
    offset += png.length
  })
  await writeFile(path.join(OUT,'protosail-favicon.ico'),Buffer.concat([head,...pngs]))
}

const crcTable = Array.from({ length:256 }, (_,n) => { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0 })
function crc32(buffer) { let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0 }
async function listFiles(dir, prefix='') {
  const files=[]
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const relative=prefix+entry.name
    if(entry.isDirectory())files.push(...await listFiles(path.join(dir,entry.name),relative+'/'))
    else files.push(relative)
  }
  return files.sort()
}

// Fixed timestamps, ordering, compression, and permissions make the ZIP stable.
async function packageKit() {
  const files=(await listFiles(OUT)).filter(n => n !== 'manifest.json' && !n.endsWith('.zip'))
  const hashes={}
  for(const name of files)hashes[name]=createHash('sha256').update(await readFile(path.join(OUT,name))).digest('hex')
  await writeFile(path.join(OUT,'manifest.json'),JSON.stringify({ algorithm:'sha256',files:hashes },null,2)+'\n')
  const allFiles=[...files,'manifest.json'].sort()
  const locals=[],central=[]
  let offset=0
  for(const name of allFiles) {
    const nameBytes=Buffer.from(name)
    const data=await readFile(path.join(OUT,name))
    const zipped=deflateRawSync(data,{level:9})
    const crc=crc32(data)
    const local=Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8)
    local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(zipped.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26)
    locals.push(local,nameBytes,zipped)
    const cen=Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50,0);cen.writeUInt16LE(20,4);cen.writeUInt16LE(20,6);cen.writeUInt16LE(0x800,8);cen.writeUInt16LE(8,10)
    cen.writeUInt16LE(33,14);cen.writeUInt32LE(crc,16);cen.writeUInt32LE(zipped.length,20);cen.writeUInt32LE(data.length,24);cen.writeUInt16LE(nameBytes.length,28);cen.writeUInt32LE(offset,42)
    central.push(cen,nameBytes)
    offset+=local.length+nameBytes.length+zipped.length
  }
  const centralBytes=Buffer.concat(central)
  const end=Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(allFiles.length,8);end.writeUInt16LE(allFiles.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16)
  await writeFile(path.join(OUT,'protosail-brand-kit.zip'),Buffer.concat([...locals,centralBytes,end]))
}

await Promise.all(['svg','png','source'].map(dir => mkdir(path.join(OUT,dir),{recursive:true})))
for(const a of assets)await writeFile(path.join(OUT,'svg',a.name+'.svg'),a.svg)
await writeFile(path.join(OUT,'geometry.json'),JSON.stringify(geometry,null,2)+'\n')
await writeFile(path.join(OUT,'README.md'),readme())
await writeFile(path.join(OUT,'index.html'),guideHtml())
await writeFile(path.join(OUT,'proof.html'),proofHtml())
await copyFile(fileURLToPath(import.meta.url),path.join(OUT,'source','build-brand.mjs'))
console.log(`Built ${assets.length} SVG assets; icon ${f(ICON.width)} × 1000; wordmark ${WORD.width} × 1000 cap units.`)
if(!SVG_ONLY) {
  await exportRasters()
  await exportIco()
  await packageKit()
  console.log(`Exported ${assets.reduce((n,a) => n+widthsFor(a).length,0)} PNGs, ICO, preview, verification, manifest, and ZIP.`)
}
console.log(path.join(OUT,'index.html'))
