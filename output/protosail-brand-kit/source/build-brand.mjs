/** Protosail final master: Sora 800, native spacing, A corners 79%, panel 79%. */
import {mkdir,readFile,writeFile,readdir,copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {deflateRawSync} from 'node:zlib'
import {f,rad,polygon,outline,normalise} from './brand-geometry.mjs'

const SOURCE_DIR=path.dirname(fileURLToPath(import.meta.url))
const ROOT=path.resolve(SOURCE_DIR,'..')
const OUT=path.basename(SOURCE_DIR)==='source'?ROOT:path.join(ROOT,'output/protosail-brand-kit')
const SVG_ONLY=process.argv.includes('--svg-only')
const MASTER=JSON.parse(await readFile(path.join(SOURCE_DIR,'brand-master.json'),'utf8'))
const C=MASTER.colours, FONT=MASTER.font, S=MASTER.selection
const escapeHtml=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch])
const round=n=>Number(n.toFixed(6))
const wing=normalise(polygon(MASTER.baseWingVertices,MASTER.baseWingRadii.map(r=>r*S.cornerRadiusPercent/100)))
const vr=MASTER.baseVaneRadii.map(r=>r*S.cornerRadiusPercent/100)
const makeVane=h=>polygon([[0,0],[220,220*Math.tan(rad(32))],[220,h],[0,h-220*Math.tan(rad(32))]],vr)
const trial=makeVane(680),vane=makeVane(680+670-trial.bounds.height)
const ICON={width:wing.width+65+220,height:1000,paths:[wing.path,outline(vane,1,wing.width+65-vane.bounds.x,330-vane.bounds.y)]}
const FONT_PATHS=new Set(Object.values(FONT.shapes).flatMap(s=>s.parts.map(g=>g.path)))
const WORD={width:FONT.shapes.PROTOSAIL.bounds.width},PREFIX={width:FONT.shapes.PROTOS.bounds.width}
const centreShift=text=>{const b=FONT.shapes[text].bounds;return 500-b.y-b.height/2}
const TEXT_Y=centreShift('PROTOS'),WORD_Y=centreShift('PROTOSAIL')
const LAYOUT={
  icon:{clearSpace:250},wordmark:{clearSpace:500},
  primary:{iconHeight:1750,iconY:-480,textY:TEXT_Y,prefixToIcon:0,iconToL:120,clearSpace:500},
  horizontal:{iconHeight:2500,iconY:-750,gap:400,textY:WORD_Y,clearSpace:500},
  stacked:{iconHeight:3300,gap:400,clearSpace:500},
  panel:{referenceHeight:2960,height:2960*.79,centreY:500,width:MASTER.panelReference.width,whiteBorder:180},
  app:{tile:1000,radius:160,iconHeight:700},favicon:{tile:1000,radius:0,iconHeight:760},
}
const pathTag=(d,fill,attrs='')=>`<path d="${d}" fill="${fill}"${attrs?' '+attrs:''}/>`
const rect=(x,y,w,h,fill,attrs='')=>pathTag(`M ${f(x)} ${f(y)} H ${f(x+w)} V ${f(y+h)} H ${f(x)} Z`,fill,attrs)
function iconMarkup(fill,x=0,y=0,height=1000){return `<g data-component="sail-icon" transform="translate(${f(x)} ${f(y)}) scale(${f(height/1000)})">${ICON.paths.map((d,i)=>pathTag(d,fill,`data-part="${i?'vane':'wing'}"`)).join('')}</g>`}
function wordMarkup(text,fill,x=0,y=0){const s=FONT.shapes[text];return `<g transform="translate(${f(x-s.bounds.x)} ${f(y)})">${s.parts.map(g=>pathTag(g.path,fill,`data-font-path="${g.glyph}"`)).join('')}</g>`}
const letterGroup=art=>`<g data-component="lettering">${art}</g>`
const editions=[{name:'lime-black',label:'Lime / charcoal',icon:C.lime,text:C.black,background:'light'},{name:'lime-white',label:'Lime / white',icon:C.lime,text:C.white,background:'dark'},{name:'black',label:'Solid charcoal',icon:C.black,text:C.black,background:'light'},{name:'white',label:'Solid white',icon:C.white,text:C.white,background:'dark'}]
const assets=[]
function asset(kind,edition,art,bounds,pad,description,tile=false){
  const box=[bounds.x-pad,bounds.y-pad,bounds.width+pad*2,bounds.height+pad*2],name=`protosail-${kind}-${edition.name}`
  const title=`Protosail ${kind} — ${edition.label}`
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(f).join(' ')}" width="${f(box[2])}" height="${f(box[3])}" role="img" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><desc>${escapeHtml(description)}</desc>${art}</svg>\n`
  const a={name,kind,edition:edition.name,label:title,background:edition.background,box,bounds,pad,tile,art,svg};assets.push(a);return a
}
for(const e of [{name:'lime',label:'Lime',icon:C.lime,background:'dark'},editions[2],editions[3]])asset('icon',e,iconMarkup(e.icon),{x:0,y:0,width:ICON.width,height:1000},250,'Approved A sail geometry with all corner radii set to 79%. Parallel wing edges and aligned bottoms.')
for(const e of editions.slice(2)){const b=FONT.shapes.PROTOSAIL.bounds;asset('wordmark',e,letterGroup(wordMarkup('PROTOSAIL',e.text,0,WORD_Y)),{x:0,y:b.y+WORD_Y,width:b.width,height:b.height},500,'Sora ExtraBold 800, native kerning, zero added tracking. Original font outlines; no installed font required.')}
for(const e of editions){
  const p=LAYOUT.primary,ix=PREFIX.width,lx=ix+ICON.width*1.75+120
  asset('primary',e,letterGroup(wordMarkup('PROTOS',e.text,0,TEXT_Y)+wordMarkup('L',e.text,lx,TEXT_Y))+iconMarkup(e.icon,ix,p.iconY,p.iconHeight),{x:0,y:p.iconY,width:lx+FONT.shapes.L.bounds.width,height:p.iconHeight},500,'Integrated primary: PROTOS + sails replacing AI + L. Sora 800 with native spacing.')
  const h=LAYOUT.horizontal,wx=ICON.width*2.5+h.gap
  asset('horizontal',e,iconMarkup(e.icon,0,h.iconY,h.iconHeight)+letterGroup(wordMarkup('PROTOSAIL',e.text,wx,WORD_Y)),{x:0,y:h.iconY,width:wx+WORD.width,height:h.iconHeight},500,'Separate icon beside the full Sora 800 wordmark. Icon height 2.5 cap heights, 400-unit gap.')
  const st=LAYOUT.stacked,iw=ICON.width*3.3,wy=st.iconHeight+st.gap-FONT.shapes.PROTOSAIL.bounds.y
  asset('stacked',e,iconMarkup(e.icon,(WORD.width-iw)/2,0,st.iconHeight)+letterGroup(wordMarkup('PROTOSAIL',e.text,0,wy)),{x:0,y:0,width:WORD.width,height:st.iconHeight+st.gap+FONT.shapes.PROTOSAIL.bounds.height},500,'Centred stacked composition with a 400-unit visible gap. Approved sail geometry and native Sora 800 lettering.')
}
const findAsset=(kind,edition)=>assets.find(a=>a.kind===kind&&a.edition===edition)
for(const kind of ['primary','stacked']){
  const base=findAsset(kind,'lime-white'),border=180
  let x,y,w,h,art=base.art
  if(kind==='primary'){
    ({width:w,height:h}=LAYOUT.panel);x=0;y=500-h/2
    art=`<g transform="translate(${f((w-base.bounds.width)/2)} 0)">${art}</g>`
  }else{
    // A stacked arrangement is centred as a whole; its icon sits above the text.
    x=base.bounds.x-395;y=base.bounds.y-395;w=base.bounds.width+790;h=base.bounds.height+790
  }
  const b={x:x-border,y:y-border,width:w+2*border,height:h+2*border}
  asset(kind,{name:'panel-white',label:'Charcoal panel on white',background:'light'},rect(b.x,b.y,b.width,b.height,C.white,'data-component="white-background"')+rect(x,y,w,h,C.black,'data-component="panel"')+art,b,0,kind==='primary'?'Approved primary panel at 79% reference height, reduced equally at both edges. Panel and lettering centres both y=500. White surround 180 units.':'Stacked logo on a charcoal panel with 395-unit inner margins and a 180-unit white surround.',true)
}
for(const kind of ['app','favicon']){
  const t=LAYOUT[kind],iw=ICON.width*t.iconHeight/1000
  const tile=t.radius?outline(polygon([[0,0],[1000,0],[1000,1000],[0,1000]],Array(4).fill(t.radius))):'M 0 0 H 1000 V 1000 H 0 Z'
  asset(kind,{name:'lime',label:'Lime on charcoal',background:'light'},pathTag(tile,C.black)+iconMarkup(C.lime,(1000-iw)/2,(1000-t.iconHeight)/2,t.iconHeight),{x:0,y:0,width:1000,height:1000},0,'Approved sail paths centred on a charcoal tile.',true)
}
const geometry={version:3,selection:S,colours:C,units:'Icon height and letter cap height are 1000 units.',icon:{width:round(ICON.width),height:1000,gap:65,vaneWidth:220,vaneTop:330,vaneHeight:670,alignedBottom:1000,wingVertices:wing.vertices,wingCornerRadii:wing.radii,vaneCornerRadii:vr,wingTopAngle:20,wingFootAngle:20,vaneCapAngle:32,wingPath:ICON.paths[0],vanePath:ICON.paths[1]},lettering:{family:'Sora',weight:800,capHeight:1000,mainStem:FONT.stemWidth,kerning:'Native font kerning via HarfBuzz',tracking:0,sourceSha256:MASTER.fontSha256,shapes:FONT.shapes},layouts:LAYOUT,assets:assets.map(({art,svg,...a})=>({...a,svg:'svg/'+a.name+'.svg'}))}
const widthsFor=a=>a.kind==='app'?[192,512]:a.kind==='favicon'?[16,32,48]:[512,2048]
const imageTag=(kind,edition,cls='')=>{const a=findAsset(kind,edition);return `<img class="${cls}" src="svg/${a.name}.svg" alt="${escapeHtml(a.label)}">`}
const downloads=a=>`<a href="svg/${a.name}.svg" download>SVG</a> ${widthsFor(a).map(w=>`<a href="png/${a.name}-${w}.png" download>PNG ${w}</a>`).join(' ')}`
function guideHtml(){
  const sections=['primary','icon','wordmark','horizontal','stacked'].map(kind=>{
    const light=['icon','wordmark'].includes(kind)?'black':['primary','stacked'].includes(kind)?'panel-white':'lime-black'
    const dark=kind==='wordmark'?'white':kind==='icon'?'lime':'lime-white'
    return `<section id="${kind}"><h2>${{primary:'Main logo',icon:'Sail icon',wordmark:'Full wordmark',horizontal:'Horizontal composition',stacked:'Stacked composition'}[kind]}</h2><div class="pair"><div class="sample ${kind}">${imageTag(kind,light)}</div><div class="sample dark ${kind}">${imageTag(kind,dark)}</div></div><div class="downloads">${assets.filter(a=>a.kind===kind).map(a=>`<div><span>${escapeHtml(a.edition.replaceAll('-',' / '))}</span><nav>${downloads(a)}</nav></div>`).join('')}</div></section>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protosail final brand kit</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f5f1;color:#141414;font:15px/1.5 Arial,sans-serif}main{max-width:1280px;margin:auto;padding:35px 32px 70px}header{padding-bottom:35px}h1{font-size:34px;font-weight:500;letter-spacing:-.03em;margin:0 0 12px}h2{font-size:23px;font-weight:500;margin:0 0 20px}h3{font-size:16px}p{max-width:76ch;color:#555}a{color:inherit;text-underline-offset:3px}img{display:block;max-width:100%}.hero{background:#fff;margin:25px 0}.hero img{width:100%}.button{display:inline-block;padding:12px 18px;color:white;background:#141414;text-decoration:none}section{margin:45px 0;padding-top:22px;border-top:1px solid #ccc}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#ccc}.sample{background:#fff;padding:25px;display:flex;align-items:center;justify-content:center;min-height:210px}.sample img{width:100%;max-height:250px}.sample.icon img{width:200px}.sample.stacked{min-height:310px}.dark{background:#141414}.downloads{display:grid;grid-template-columns:1fr 1fr;gap:0 30px}.downloads>div{display:flex;justify-content:space-between;gap:15px;font-size:11px;border-bottom:1px solid #ddd;padding:11px 0}.downloads nav{display:flex;gap:12px;white-space:nowrap}.utility{display:flex;gap:28px;align-items:flex-end;margin:25px 0;flex-wrap:wrap}.utility img{margin-bottom:10px}.utility span{font-size:12px;color:#555}table{border-collapse:collapse;width:100%;font-size:13px}td{border-bottom:1px solid #ccc;padding:11px 0}td:last-child{text-align:right}.minimums{display:flex;gap:24px;flex-wrap:wrap}.minimums>div{padding:20px;background:white}.minimums span{font-size:12px;display:block;margin-top:14px}.swatches{display:flex;gap:12px;margin:25px 0}.swatches span{padding:22px;font-size:13px;min-width:150px}footer{font-size:12px;color:#555;border-top:1px solid #ccc;padding-top:25px}@media(max-width:700px){main{padding:25px 18px}.pair,.downloads{grid-template-columns:1fr}.sample{min-height:170px}.swatches{flex-wrap:wrap}.swatches span{min-width:100px;padding:15px}h1{font-size:29px}.minimums{gap:12px}.downloads nav{gap:8px}}</style></head><body><main><header><h1>Protosail — final brand kit</h1><p>Approved design A. Sora ExtraBold 800, native spacing, all sail corner radii at 79%, and the main panel at 79% height. Every composition uses the same outlined lettering and sail paths.</p><a class="button" href="protosail-brand-kit.zip" download>Download complete kit</a><div class="hero">${imageTag('primary','panel-white')}</div><p>The main panel is reduced equally at its top and bottom. The lettering stays vertically centred; the taller icon is excluded from that alignment calculation.</p></header>${sections}<section><h2>App icon &amp; favicon</h2><div class="utility"><div style="width:150px">${imageTag('app','lime')}<span>App icon</span></div>${[16,32,48].map(w=>`<div><img width="${w}" height="${w}" src="png/protosail-favicon-lime-${w}.png" alt="${w} pixel favicon"><span>${w} px</span></div>`).join('')}</div><p>${downloads(findAsset('app','lime'))}</p><p>${downloads(findAsset('favicon','lime'))} · <a href="protosail-favicon.ico" download>Multi-size ICO</a></p></section><section><h2>Colour &amp; construction</h2><div class="swatches"><span style="background:#E3F941">#E3F941</span><span style="background:#141414;color:white">#141414</span><span style="background:white">#FFFFFF</span></div><table><tbody><tr><td>Typeface / weight / added tracking</td><td>Sora / 800 / 0</td></tr><tr><td>Corner controls / main panel height</td><td>79% / 79%</td></tr><tr><td>Icon height / width</td><td>1000 / ${f(ICON.width)}</td></tr><tr><td>Gap / right sail width</td><td>65 / 220</td></tr><tr><td>Wing top / bottom angle</td><td>20° / 20°</td></tr><tr><td>Both sail bottom extrema</td><td>y = 1000</td></tr><tr><td>Letter cap / L stem thickness</td><td>1000 / ${FONT.stemWidth.toFixed(3)}</td></tr><tr><td>Main panel height</td><td>${LAYOUT.panel.height} (2960 × 79%)</td></tr><tr><td>Panel / lettering centre</td><td>y = 500 / 500</td></tr></tbody></table><p>Clear space: ¼ icon height for the standalone icon; ½ cap height for transparent compositions. The approved main rectangle has its own fixed padding, with a 180-unit white surround. Stacked panels use 395-unit margins around the complete stacked composition.</p><p>The font is converted to paths, preserving native kerning and repeated glyph shapes. Files contain no embedded raster images, font dependencies or external references. The supplied font source and licence are included for future editing.</p></section><section><h2>Small-size reference</h2><p>Recommended widths include the supplied clear space. Use the icon alone below the practical wordmark sizes.</p><div class="minimums">${[['primary',200],['wordmark',160],['horizontal',240],['stacked',180]].map(([kind,w])=>`<div><div style="width:${w}px">${imageTag(kind,'black')}</div><span>${kind} · ${w} px</span></div>`).join('')}</div><p>Standalone icon: 32 px wide. Favicon: 16 px square.</p></section><footer><a href="README.md">Usage and regeneration</a> · <a href="geometry.json">Geometry</a> · <a href="final-settings.json">Approved settings</a> · <a href="source/brand-fonts/OFL.txt">Sora licence</a><p>SVG masters, PNG fallbacks, ICO, deterministic source and checksums. Ordinary logo files are transparent; panel and tile editions carry their stated backgrounds.</p></footer></main></body></html>`
}
function readme(){return `# Protosail final brand kit\n\nApproved design A: Sora ExtraBold 800, native kerning, no added tracking. Panel height 79%; all eight sail corner controls 79%.\n\n## Files\n\n- svg/: icon, full wordmark, integrated primary (PROTOS + sails + L), horizontal, stacked, app and favicon.\n- Colour editions: lime/charcoal, lime/white, solid charcoal, solid white where applicable. Filenames retain black for charcoal #141414.\n- primary-panel-white is the exact approved main panel: 2960 × 0.79 = 2338.4 units high, reduced 310.8 units at each edge; fixed width and 180-unit white surround. Lettering and panel centres are y=500.\n- Stacked panel: complete composition centred in 395-unit inner margins, with a 180-unit white surround.\n- Ordinary SVGs have transparent backgrounds. App/favicons use charcoal tiles.\n- png/: logos 512/2048 px wide; app 192/512 px square; favicon 16/32/48 px square.\n- protosail-favicon.ico: 16/32/48 px PNG-compressed entries.\n- index.html: visual guide. preview.png: contact sheet.\n- geometry.json: paths, measurements, native glyph placement and layouts.\n- final-settings.json: approved controls.\n- source/: deterministic generator, frozen master font outlines and base geometry, geometry helpers, original Sora font and licence.\n- manifest.json: SHA-256 hashes. ZIP contains the complete kit.\n\n## Consistency\n\nAll variants share identical icon paths. Wing top and bottom edges are parallel at 20°. Sail bottoms align at y=1000; gap 65; right sail width 220. Corner values are 79% of A's radius controls, followed by the same uniform normalisation as the approved interactive preview. Text uses actual Sora outlines and HarfBuzz native placement. Glyph coordinates are immutable, with only translation and uniform scaling in compositions. No synthetic bold or stretching.\n\nClear space: icon 250 units; transparent lettering compositions 500 units. Panel and tile editions have composition-specific margins. Main icon height 1750, y=-480; horizontal height 2500, y=-750, gap 400; stacked height 3300, visible gap 400. Letter cap height 1000.\n\nMinimum recommended widths including padding: icon 32 px; wordmark 160 px; primary 200 px; horizontal 240 px; stacked 180 px. Favicon 16 px. SVG is preferred for print and high-resolution work.\n\nColours: #E3F941 lime, #141414 charcoal, #FFFFFF white. Flat sRGB.\n\n## Regeneration\n\nIn the original project: node scripts/build-brand.mjs. For vectors/docs only add --svg-only. In an extracted kit: node source/build-brand.mjs (install puppeteer-core for raster exports). Chrome is required for PNGs; set CHROME to override its path. Master data lives beside the generator in brand-master.json and brand-geometry.mjs. No font installation, Python, network request or font shaping dependency is needed to regenerate. The original Sora TTF and SIL Open Font Licence are provided for further type editing.\n\nThe generator is deterministic within the same Node/Chrome environment. Do not edit emitted files; update the master and regenerate. The website is not changed by this kit.\n`}

// A compact visual contact sheet is also exported as a PNG for quick review.
function proofHtml() {
  const primary = findAsset('primary', 'lime-white')
  const cell = (label, kind, edition, dark = false, extra = '') => `<div class="cell ${dark ? 'dark' : ''} ${kind}"><label>${label}</label>${imageTag(kind, edition)}${extra}</div>`
  return `<!doctype html><html><head><meta charset="utf-8"/><style>*{box-sizing:border-box}body{margin:0;width:1440px;background:#f5f6ef;color:#111;font-family:Arial,sans-serif}.title{height:105px;padding:32px 40px;display:flex;justify-content:space-between;align-items:center}.title h1{font-size:24px;letter-spacing:-.02em;font-weight:500;margin:0}.title p{font-size:12px;color:#62665a}.hero{height:300px;background:${C.black};display:flex;align-items:center;padding:0 65px}.hero img{width:100%;max-height:295px}.row{display:grid;border-bottom:1px solid #d6d9cd}.three{grid-template-columns:repeat(3,1fr)}.two{grid-template-columns:1fr 1fr}.cell{position:relative;background:#fff;display:flex;justify-content:center;align-items:center;height:275px;border-right:1px solid #d6d9cd;padding:48px 22px 20px}.cell.dark{background:${C.black};border-color:#303030}.cell label{position:absolute;left:24px;top:18px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#62665a}.cell.dark label{color:#ababab}.cell img{display:block;width:100%;max-height:190px}.cell.icon img{width:240px;height:240px;max-height:none}.cell.stacked{height:320px}.cell.stacked img{max-height:270px}.cell.app{height:320px}.cell.app img{width:190px;height:190px;max-height:none}.footer{height:95px;padding:24px 40px;display:flex;justify-content:space-between;font-size:12px;color:#636658}.colours{display:flex;gap:18px;align-items:center}.colours i{display:inline-block;width:22px;height:22px;vertical-align:middle;border:1px solid #d5d8cc;margin-right:8px}</style></head><body><div class="title"><h1>PROTOSAIL / Vector identity</h1><p>PRECISE GEOMETRY &nbsp;·&nbsp; SORA 800 &nbsp;·&nbsp; SHARED MASTERS</p></div><div class="hero"><img src="svg/${primary.name}.svg" alt="Protosail integrated logo"/></div><div class="row three">${cell('01 / Sail icon','icon','lime',true)}${cell('02 / Monochrome','icon','black')}${cell('03 / Reverse','icon','white',true)}</div><div class="row two">${cell('04 / Wordmark','wordmark','black')}${cell('05 / Horizontal compact','horizontal','lime-white',true)}</div><div class="row three">${cell('06 / Stacked, panel on white','stacked','panel-white')}${cell('07 / Stacked, dark','stacked','lime-white',true)}${cell('08 / App icon','app','lime')}</div><div class="row">${cell('09 / Primary, panel on white','primary','panel-white')}</div><div class="footer"><p>One set of paths. Uniform scale. Native Sora spacing.<br>SVG masters + PNG exports + favicon + construction guide.</p><div class="colours"><span><i style="background:#e3f941"></i>#E3F941</span><span><i style="background:${C.black}"></i>${C.black}</span><span><i style="background:#fff"></i>#FFFFFF</span></div></div></body></html>`
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
          glyphs: [...svg.querySelectorAll('[data-font-path]')].map(p => ({ d:p.getAttribute('d') })),
          panelTextCentred: (() => {if (!svg.getAttribute('aria-label').includes('primary') || !svg.querySelector('[data-component=panel]')) return true; const p=svg.querySelector('[data-component=panel]').getBBox(),t=svg.querySelector('[data-component=lettering]').getBBox();return Math.abs(p.y+p.height/2-t.y-t.height/2)<.01})(),
        }
      })
      if (!result.finite || !result.contained || !result.fontIndependent || !result.alignedBottoms || !result.panelTextCentred) throw new Error(`SVG validation failed: ${a.name}`)
      if (result.sailPaths.length && JSON.stringify(result.sailPaths) !== JSON.stringify(ICON.paths)) throw new Error(`Sail master mismatch: ${a.name}`)
      if (result.glyphs.some(g => !FONT_PATHS.has(g.d))) throw new Error(`Glyph master mismatch: ${a.name}`)
      for (const key of ['x', 'y', 'width', 'height']) if (Math.abs(result.bounds[key] - a.bounds[key]) > 0.03) throw new Error(`Declared artwork bounds differ: ${a.name} ${key}: ${result.bounds[key]} versus ${a.bounds[key]}`)
      observations.push({ file:a.name+'.svg', bounds:result.bounds, contained:result.contained, fontIndependent:result.fontIndependent, alignedBottoms:result.alignedBottoms, canonicalPaths:true, panelTextCentred:result.panelTextCentred })
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
for (const name of ['build-brand.mjs','brand-master.json','brand-geometry.mjs']) { const src=path.join(SOURCE_DIR,name),dst=path.join(OUT,'source',name); if(src!==dst)await copyFile(src,dst) }
await mkdir(path.join(OUT,'source/brand-fonts'),{recursive:true})
for(const name of ['Sora.ttf','OFL.txt']) {const src=path.join(SOURCE_DIR,'brand-fonts',name),dst=path.join(OUT,'source/brand-fonts',name);if(src!==dst)await copyFile(src,dst)}
await writeFile(path.join(OUT,'final-settings.json'),JSON.stringify({base:'A',font:'Sora',nativeKerning:true,weight:800,height:79,w0:79,w1:79,w2:79,w3:79,v0:79,v1:79,v2:79,v3:79},null,2)+'\n')
console.log(`Built ${assets.length} SVG assets; icon ${f(ICON.width)} × 1000; wordmark ${WORD.width} × 1000 cap units.`)
if(!SVG_ONLY) {
  await exportRasters()
  await exportIco()
  await packageKit()
  console.log(`Exported ${assets.reduce((n,a) => n+widthsFor(a).length,0)} PNGs, ICO, preview, verification, manifest, and ZIP.`)
}
console.log(path.join(OUT,'index.html'))
