/** Selection studies; production brand geometry and exports are read-only here. */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'output/protosail-sora-studies')
const FONT_DIR = path.join(ROOT, 'output/protosail-font-options/fonts')
const PYTHON = process.env.BRAND_PYTHON || 'C:/Users/iamta/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
const checksum = b => createHash('sha256').update(b).digest('hex')
const protectedFiles = ['scripts/build-brand.mjs', 'output/protosail-brand-kit/geometry.json', 'output/protosail-brand-kit/protosail-brand-kit.zip']
const before = await Promise.all(protectedFiles.map(async p => checksum(await readFile(path.join(ROOT,p)))))
await mkdir(path.join(OUT,'svg'),{recursive:true})
await mkdir(path.join(OUT,'png'),{recursive:true})
execFileSync(PYTHON,[path.join(ROOT,'scripts/outline-sora-studies.py')],{cwd:ROOT,stdio:'inherit'})
const fonts = JSON.parse(await readFile(path.join(OUT,'sora-outlines.json'),'utf8'))
const previous = JSON.parse(await readFile(path.join(ROOT,'output/protosail-brand-kit/geometry.json'),'utf8'))
const C = previous.colours
const f = n => String(Number(n.toFixed(6)))
const xy = p => p.map(f).join(' ')
const rad = n => n*Math.PI/180
const add = (a,b) => a.map((n,i)=>n+b[i])
const sub = (a,b) => a.map((n,i)=>n-b[i])
const mul = (a,n) => a.map(v=>v*n)
const unit = a => mul(a,1/Math.hypot(...a))
const dot = (a,b) => a.reduce((v,n,i)=>v+n*b[i],0)

function polygon(points,radii) {
  const corners=points.map((point,i)=>{
    const u=unit(sub(points[(i+points.length-1)%points.length],point)),v=unit(sub(points[(i+1)%points.length],point))
    const theta=Math.acos(Math.max(-1,Math.min(1,dot(u,v))))
    const radius=radii[i],tangent=radius/Math.tan(theta/2)
    return {point,radius,tangent,start:add(point,mul(u,tangent)),end:add(point,mul(v,tangent)),center:add(point,mul(unit(add(u,v)),radius/Math.sin(theta/2)))}
  })
  const extrema=[]
  corners.forEach((c,i)=>{
    if(c.tangent+corners[(i+1)%corners.length].tangent>=Math.hypot(...sub(points[(i+1)%points.length],c.point)))throw Error('Fillets overlap')
    extrema.push(c.start,c.end)
    if(!c.radius)return
    let a=Math.atan2(c.start[1]-c.center[1],c.start[0]-c.center[0]),b=Math.atan2(c.end[1]-c.center[1],c.end[0]-c.center[0])
    while(b<a)b+=Math.PI*2
    for(let q=-4;q<=8;q++){const angle=q*Math.PI/2;if(angle>=a&&angle<=b)extrema.push(add(c.center,[c.radius*Math.cos(angle),c.radius*Math.sin(angle)]))}
  })
  const x=Math.min(...extrema.map(p=>p[0])),y=Math.min(...extrema.map(p=>p[1]))
  return {points,corners,bounds:{x,y,width:Math.max(...extrema.map(p=>p[0]))-x,height:Math.max(...extrema.map(p=>p[1]))-y}}
}
function outline(p,scale=1,dx=0,dy=0){
  const t=v=>add(mul(v,scale),[dx,dy])
  return p.corners.map((c,i)=>(i?'L ':'M ')+xy(t(c.start))+(c.radius?' A '+f(c.radius*scale)+' '+f(c.radius*scale)+' 0 0 1 '+xy(t(c.end)):'' )).join(' ')+' Z'
}
function normalise(p){const scale=1000/p.bounds.height;return {polygon:p,scale,width:p.bounds.width*scale,path:outline(p,scale,-p.bounds.x*scale,-p.bounds.y*scale),vertices:p.points.map(v=>mul(sub(v,[p.bounds.x,p.bounds.y]),scale)),radii:p.corners.map(c=>c.radius*scale)}}
function bisect(fn,target,lo,hi){for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(fn(mid)<target)lo=mid;else hi=mid}return (lo+hi)/2}

// Reconstruct the approved raw polygon, then change the top and foot geometry.
const oldShoulder=[350,400*Math.tan(rad(20))]
const oldHeelX=(oldShoulder[1]+oldShoulder[0]*Math.tan(rad(70))-790-750*Math.tan(rad(14)))/(Math.tan(rad(70))-Math.tan(rad(14)))
const oldPoints=[[750,0],[750,790],[oldHeelX,790+(750-oldHeelX)*Math.tan(rad(14))],oldShoulder]
const old=normalise(polygon(oldPoints,[24,45,65,120]))
const oldTopLength=Math.hypot(...sub(old.vertices[3],old.vertices[0]))
const [tr,,bl]=old.vertices
const angle=20,slope=Math.tan(rad(angle))
const newBR=[tr[0],bl[1]-(tr[0]-bl[0])*slope]
const pointsFor=run=>[tr,newBR,bl,[tr[0]-run,tr[1]+run*slope]]
// Account for the final uniform normalisation when shortening the nominal edge.
const run=bisect(r=>{const n=normalise(polygon(pointsFor(r),old.radii));return Math.hypot(...sub(n.vertices[3],n.vertices[0]))},oldTopLength*.75,230,390)
const revisedVertices=pointsFor(run)
const wingMasters={rounded:normalise(polygon(revisedVertices,old.radii)),sharp:normalise(polygon(revisedVertices,[0,0,old.radii[2],old.radii[3]]))}

function makeIcon(cornerStyle,vaneWidth){
  const wing=wingMasters[cornerStyle]
  const radii=cornerStyle==='sharp'?[0,95,24,0]:[24,95,24,95]
  const rise=vaneWidth*Math.tan(rad(32))
  const make=h=>polygon([[0,0],[vaneWidth,rise],[vaneWidth,h],[0,h-rise]],radii)
  const trial=make(680),vane=make(680+670-trial.bounds.height)
  return {width:wing.width+65+vaneWidth,height:1000,wingWidth:wing.width,vaneWidth,gap:65,vaneTop:330,vaneHeight:670,cornerStyle,wingPath:wing.path,vanePath:outline(vane,1,wing.width+65-vane.bounds.x,330-vane.bounds.y),wingVertices:wing.vertices,wingRadii:wing.radii,vaneRadii:radii}
}
const options=[
  {id:'A',weight:800,corners:'rounded',match:false,title:'Rounded · Sora 800',note:'Current right-sail width'},
  {id:'B',weight:800,corners:'sharp',match:false,title:'Sharp inner corners · Sora 800',note:'Current right-sail width'},
  {id:'C',weight:800,corners:'rounded',match:true,title:'Rounded · Sora 800',note:'Right sail matched to the L stem'},
  {id:'D',weight:800,corners:'sharp',match:true,title:'Sharp inner corners · Sora 800',note:'Right sail matched to the L stem'},
  {id:'E',weight:700,corners:'rounded',match:true,title:'Rounded · Sora 700',note:'Lighter lettering; right sail matched to the L stem'},
  {id:'F',weight:700,corners:'sharp',match:true,title:'Sharp inner corners · Sora 700',note:'Lighter lettering; right sail matched to the L stem'},
]
const pathTag=(d,fill,attrs='')=>`<path d="${d}" fill="${fill}" ${attrs}/>`
const rect=(x,y,w,h,fill,attrs='')=>pathTag(`M ${f(x)} ${f(y)} H ${f(x+w)} V ${f(y+h)} H ${f(x)} Z`,fill,attrs)
function word(weight,text,x=0,y=0){const s=fonts[weight].shapes[text];return `<g data-letters="${text}" transform="translate(${f(x-s.bounds.x)} ${f(y)})">${s.parts.map(g=>pathTag(g.path,C.white,`data-glyph="${g.glyph}"`)).join('')}</g>`}
function iconMarkup(icon,x=0,y=0,scale=1){return `<g data-icon="${icon.cornerStyle}" transform="translate(${f(x)} ${f(y)}) scale(${f(scale)})">${pathTag(icon.wingPath,C.lime,'data-part="wing"')}${pathTag(icon.vanePath,C.lime,'data-part="vane"')}</g>`}
for(const o of options){
  const font=fonts[o.weight],prefix=font.shapes.PROTOS,l=font.shapes.L
  o.stemWidth=font.stemWidth
  o.icon=makeIcon(o.corners,o.match?o.stemWidth/1.75:220)
  o.sailWidthAtLogo=o.icon.vaneWidth*1.75
  o.prefixWidth=prefix.bounds.width
  o.iconX=o.prefixWidth
  o.lX=o.iconX+o.icon.width*1.75+120
  o.artWidth=o.lX+l.bounds.width
  const textTop=Math.min(prefix.bounds.y,l.bounds.y),textBottom=Math.max(prefix.bounds.y+prefix.bounds.height,l.bounds.y+l.bounds.height)
  o.textShift=500-(textTop+textBottom)/2
  o.textBounds={x:0,y:textTop+o.textShift,width:o.artWidth,height:textBottom-textTop}
  o.markup=`<g data-lettering="true">${word(o.weight,'PROTOS',0,o.textShift)}${word(o.weight,'L',o.lX,o.textShift)}</g>`+iconMarkup(o.icon,o.iconX,-480,1.75)
}
// A common panel with its vertical centre at the actual lettering's centre.
const panel={width:Math.max(...options.map(o=>o.artWidth))+1000,y:-980,height:2960,whiteBorder:180,centreY:500}
for(const o of options){
  o.artX=(panel.width-o.artWidth)/2
  o.name=`protosail-sora-${o.id.toLowerCase()}-${o.weight}-${o.corners}${o.match?'-matched':''}-panel-white`
  const box=[-panel.whiteBorder,panel.y-panel.whiteBorder,panel.width+panel.whiteBorder*2,panel.height+panel.whiteBorder*2]
  o.svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(f).join(' ')}" role="img" aria-label="Protosail study ${o.id}: ${o.title}, ${o.note}"><title>Protosail study ${o.id}: ${o.title}</title><desc>Sora native kerning, outlined from the original font. ${o.note}. The lettering is vertically centred within the charcoal rectangle. Preview only.</desc>${rect(...box,C.white,'data-background="white"')}${rect(0,panel.y,panel.width,panel.height,C.black,'data-panel="charcoal"')}<g transform="translate(${f(o.artX)} 0)">${o.markup}</g></svg>\n`
  await writeFile(path.join(OUT,'svg',o.name+'.svg'),o.svg)
}

const facts={fontFamily:'Sora',tracking:0,kerning:'Native HarfBuzz shaping',topAndBottomAngleDegrees:20,oldNominalTopLength:oldTopLength,newNominalTopLength:Math.hypot(...sub(wingMasters.rounded.vertices[3],wingMasters.rounded.vertices[0])),topReductionPercent:25,panel,options:options.map(({svg,markup,...o})=>o)}
await writeFile(path.join(OUT,'geometry.json'),JSON.stringify(facts,null,2)+'\n')
await copyFile(path.join(FONT_DIR,'sora-OFL.txt'),path.join(OUT,'Sora-OFL.txt'))
await copyFile(path.join(FONT_DIR,'sora-source.json'),path.join(OUT,'Sora-source.json'))

const cards=options.map(o=>`<article class="option" id="option-${o.id}"><header><h2><span>${o.id}</span>${o.title}</h2><p>${o.note}</p></header><div class="panel-preview">${o.svg}</div><footer><span>Right sail: ${(o.sailWidthAtLogo/o.stemWidth).toFixed(2)} × L stem thickness</span><a href="svg/${o.name}.svg" download>SVG ↗</a></footer></article>`).join('')
const runtime=String.raw`
const OPTIONS=__OPTIONS__,PANEL=__PANEL__;
const select=document.getElementById('variation');
function update(){const o=OPTIONS.find(o=>o.id===select.value);const stage=document.getElementById('large-preview');stage.innerHTML=o.svg;const svg=stage.querySelector('svg');if(document.getElementById('centreline').checked){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M 0 500 H '+PANEL.width);p.setAttribute('stroke','#ed7580');p.setAttribute('stroke-width','9');p.setAttribute('stroke-dasharray','45 35');p.setAttribute('fill','none');svg.append(p);}document.getElementById('detail-note').textContent=o.id+' · '+o.note+' · Native spacing';document.getElementById('detail-download').href='svg/'+o.name+'.svg';document.getElementById('practical').innerHTML=o.svg;document.getElementById('large-icon').innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-180 -160 '+(o.icon.width+360)+' 1320"><path d="M -180 -160 H '+(o.icon.width+180)+' V 1160 H -180 Z" fill="#141414"/><path d="'+o.icon.wingPath+'" fill="#E3F941"/><path d="'+o.icon.vanePath+'" fill="#E3F941"/></svg>'}
select.addEventListener('change',update);document.getElementById('centreline').addEventListener('change',update);update();window.ready=true;
`.replace('__OPTIONS__',JSON.stringify(options.map(({markup,...o})=>o))).replace('__PANEL__',JSON.stringify(panel))
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protosail — Sora refinements</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f1;color:#141414;font:15px/1.5 Arial,Helvetica,sans-serif}a{color:inherit;text-underline-offset:3px}svg{display:block;width:100%;height:auto}#sheet{max-width:1680px;margin:auto;background:#fff}.intro{padding:35px 42px 26px;border-bottom:1px solid #d0d0c8}.eyebrow{display:flex;justify-content:space-between;color:#626259;text-transform:uppercase;font-size:11px;letter-spacing:.1em}h1{font-size:36px;letter-spacing:-.035em;font-weight:500;line-height:1.1;margin:22px 0 13px}.intro p{font-size:14px;color:#555;max-width:1120px;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr}.option{border-bottom:1px solid #d0d0c8}.option:nth-child(odd){border-right:1px solid #d0d0c8}.option header{padding:18px 28px 0}.option h2{display:flex;gap:16px;align-items:baseline;font-size:20px;font-weight:500;letter-spacing:-.025em;margin:0}.option h2 span{font-size:13px;color:#777}.option p{font-size:12px;color:#65655d;margin:4px 0 0 25px}.panel-preview{padding:12px 17px 8px}.option footer{padding:0 30px 18px;display:flex;justify-content:space-between;gap:16px;font-size:11px;color:#666}.sheet-note{padding:22px 32px;color:#666;font-size:12px;display:flex;gap:28px;justify-content:space-between}.sheet-note span{max-width:730px}.details{max-width:1320px;margin:50px auto;padding:0 32px 55px}.details h2{font-size:28px;font-weight:500;letter-spacing:-.035em;margin:0 0 12px}.controls{display:flex;gap:30px;align-items:flex-end;margin:25px 0 18px}label{font-size:13px;color:#555}select{display:block;min-width:340px;padding:11px;font:inherit;background:#fff;border:1px solid #aaa;margin-top:7px}.check{display:flex;gap:9px;align-items:center;padding-bottom:12px}.large-preview{background:#fff}.detail-note{display:flex;justify-content:space-between;gap:18px;font-size:13px;color:#666;margin:12px 0 30px}.closeups{display:grid;grid-template-columns:1fr 1fr;gap:40px}.large-icon{max-width:360px;padding:12px;background:#fff}.practical{width:320px;margin-top:28px}h3{font-size:15px;font-weight:500}.measurements{font-size:13px;color:#555}table{border-collapse:collapse;width:100%;margin:20px 0}td{border-bottom:1px solid #ccc;padding:10px 0}td:last-child{text-align:right}.footnote{font-size:12px;color:#666;margin-top:35px;padding-top:22px;border-top:1px solid #ccc}input,select,a{accent-color:#5a650d}input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #849a18;outline-offset:3px}@media(max-width:720px){.intro{padding:25px 20px}.eyebrow{font-size:9px;letter-spacing:.04em}h1{font-size:30px}.grid{grid-template-columns:1fr}.option:nth-child(odd){border-right:0}.option header{padding:20px 20px 0}.option h2{font-size:19px}.panel-preview{padding:10px 8px}.option footer{padding:0 20px 17px;font-size:10px}.sheet-note{display:block;padding:20px}.sheet-note span{display:block;margin:8px 0}.details{padding:0 20px 35px;margin:35px auto}.controls,.closeups{display:flex;flex-direction:column;align-items:stretch;gap:16px}select{min-width:0;width:100%}.check{padding-bottom:0}.detail-note{display:block}.large-icon{margin:auto}.practical{max-width:100%}}@media print{.details{display:none}.option{break-inside:avoid}.option svg{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main><section id="sheet"><header class="intro"><div class="eyebrow"><span>Protosail / Sora refinements</span><span>Selection previews · A—F</span></div><h1>Shape, weight and alignment.</h1><p>All six use Sora with native spacing, parallel 20° top and bottom edges, and a top edge shortened by about 25%. The white lettering is centred vertically within each charcoal panel.</p></header><div class="grid">${cards}</div><footer class="sheet-note"><span><strong>A–B:</strong> current right-sail width. <strong>C–D:</strong> Sora 800 with a narrower, matched right sail. <strong>E–F:</strong> Sora 700 with a narrower, matched right sail.</span><span>Sora’s maximum designed weight is 800; matching its stem requires narrowing the right sail. Outer corners remain rounded in every option.</span></footer></section><section class="details"><h2>Inspect a variation.</h2><div class="controls"><label>Variation<select id="variation">${options.map(o=>`<option value="${o.id}" ${o.id==='D'?'selected':''}>${o.id} — ${o.title}${o.match?' · matched':''}</option>`).join('')}</select></label><label class="check"><input type="checkbox" id="centreline">Show the lettering / panel centreline</label></div><div id="large-preview" class="large-preview"></div><div class="detail-note"><span id="detail-note"></span><a id="detail-download" href="#" download>Download outlined SVG ↗</a></div><div class="closeups"><div><h3>Corner and edge details</h3><div id="large-icon" class="large-icon"></div></div><div class="measurements"><h3>Construction</h3><table><tbody><tr><td>Parallel wing edges</td><td>20° / 20°</td></tr><tr><td>Nominal top edge</td><td>25% shorter</td></tr><tr><td>Sail gap / icon height</td><td>65 / 1000</td></tr><tr><td>Both sail bottoms</td><td>y = 1000</td></tr><tr><td>Sora 800 L stem / cap height</td><td>${f(fonts[800].stemWidth)} / 1000</td></tr><tr><td>Sora 700 L stem / cap height</td><td>${f(fonts[700].stemWidth)} / 1000</td></tr><tr><td>Panel / lettering centre</td><td>y = 500 / 500</td></tr></tbody></table><p>The shortened top edge moves the upper-left shoulder inward, increasing the left edge’s slant. Sharp options remove the two right corners of the left sail and the two left corners of the right sail.</p><h3>At 320 pixels wide</h3><div id="practical" class="practical"></div></div></div><div class="footnote">Preview studies only. The production kit is unchanged. Lettering is outlined directly from Sora at weights 700 and 800 with native kerning, so these SVGs need no installed font. <a href="Sora-OFL.txt">Font licence</a> · <a href="geometry.json">Geometry and measurements</a></div></section></main><script>${runtime}</script></body></html>`
await writeFile(path.join(OUT,'index.html'),html)
await writeFile(path.join(OUT,'README.md'),`# Protosail Sora selection studies\n\nOpen index.html or comparison.png. These are charcoal-panel-on-white previews only. The production brand kit has not been modified.\n\nA/B use Sora 800 and the current 220-unit right sail. C/D use Sora 800 and a right sail narrowed to ${f(fonts[800].stemWidth/1.75)} icon units. E/F use Sora 700 and a right sail narrowed to ${f(fonts[700].stemWidth/1.75)} icon units. A/C/E have rounded inner corners; B/D/F have sharp inner corners. Sora native kerning is preserved at each weight, with zero added tracking.\n\nThe font only provides weights 100–800. At 800 its vertical L stem is ${f(fonts[800].stemWidth)} units for a 1000-unit cap; the current right sail is 385 units at the 1.75x icon scale. A font-weight-only match is therefore unavailable. Matched studies change the right sail width as explicitly labelled, preserving its 32-degree caps and 670-unit height.\n\nThe revised left sail has parallel 20-degree top and bottom edges. Its nominal top edge between theoretical corner intersections is 25% shorter than the previous rounded master; corner fillets affect the visible straight length. The left shoulder moves inward. All icon variants have a 1000-unit height, a 65-unit gap and aligned bottom extrema.\n\nThe panel centre uses the combined lettering ink bounds, excluding the icon. The text and panel centres are both y=500. All six share panel dimensions and letter cap height; no letter is stretched or synthetically boldened.\n\nSVGs contain paths only. FontTools extracts original font outlines and HarfBuzz supplies native glyph placement. Font copyright/licence is included.\n\nTo regenerate: node scripts/preview-sora-variations.mjs. The helper scripts/outline-sora-studies.py needs fonttools and uharfbuzz; this session installed those into the temporary protosail-font-tools directory. BRAND_PYTHON can override the Python executable.\n`)

const browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
const errors=[]
const page=await browser.newPage()
page.on('pageerror',e=>errors.push(e.message))
const results=[]
try {
  await page.setViewport({width:1680,height:1000,deviceScaleFactor:1})
  await page.goto(pathToFileURL(path.join(OUT,'index.html')).href,{waitUntil:'networkidle0'})
  await page.waitForFunction(()=>window.ready)
  await (await page.$('#sheet')).screenshot({path:path.join(OUT,'comparison.png')})
  await (await page.$('.details')).screenshot({path:path.join(OUT,'detail-preview.png')})
  for(const o of options){
    await page.select('#variation',o.id)
    const result=await page.evaluate(()=>{
      const svg=document.querySelector('#large-preview svg'),letters=svg.querySelector('[data-lettering]').getBBox(),panel=svg.querySelector('[data-panel]').getBBox(),wing=svg.querySelector('[data-part="wing"]').getBBox(),vane=svg.querySelector('[data-part="vane"]').getBBox()
      return {textCentre:letters.y+letters.height/2,panelCentre:panel.y+panel.height/2,bottomDifference:Math.abs((wing.y+wing.height)-(vane.y+vane.height)),noFonts:!svg.querySelector('text,image,use,foreignObject'),wingBounds:{x:wing.x,y:wing.y,width:wing.width,height:wing.height},vaneBounds:{x:vane.x,y:vane.y,width:vane.width,height:vane.height}}
    })
    if(Math.abs(result.textCentre-result.panelCentre)>.01||result.bottomDifference>.01||!result.noFonts)throw Error(JSON.stringify(result))
    if(o.match&&Math.abs(result.vaneBounds.width*1.75-o.stemWidth)>.01)throw Error('Stem match failed')
    const v=o.icon.wingVertices,top=sub(v[0],v[3]),bottom=sub(v[1],v[2]),cross=top[0]*bottom[1]-top[1]*bottom[0]
    if(Math.abs(cross)>1e-6)throw Error('Wing edges not parallel')
    results.push({id:o.id,...result,parallelCrossProduct:cross,stemWidth:o.stemWidth,sailWidth:o.sailWidthAtLogo})
  }
  await page.select('#variation','D')
  await page.click('#centreline')
  await (await page.$('#large-preview')).screenshot({path:path.join(OUT,'centred-text-proof.png')})
  await page.click('#centreline')
  await page.setViewport({width:390,height:844,deviceScaleFactor:1})
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow')
  await page.screenshot({path:path.join(OUT,'mobile-preview.png'),fullPage:true})
  for(const o of options){
    const boxWidth=panel.width+panel.whiteBorder*2,boxHeight=panel.height+panel.whiteBorder*2
    await page.setViewport({width:2048,height:Math.ceil(2048*boxHeight/boxWidth),deviceScaleFactor:1})
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:white}svg{width:100%;height:100%;display:block}</style>${o.svg}`)
    await page.screenshot({path:path.join(OUT,'png',o.name+'-2048.png')})
  }
}finally{await browser.close()}
if(errors.length)throw Error(errors.join('\n'))
const after=await Promise.all(protectedFiles.map(async p=>checksum(await readFile(path.join(ROOT,p)))))
if(before.some((v,i)=>v!==after[i]))throw Error('Production kit was modified')
await writeFile(path.join(OUT,'verification.json'),JSON.stringify({options:results,pageErrors:errors,mobileNoOverflow:true,productionKitUnchanged:true,protectedFiles:protectedFiles.map((p,i)=>({path:p,sha256:after[i]}))},null,2)+'\n')
console.log(JSON.stringify({output:OUT,variants:options.length,parallelEdges:true,alignedBottoms:true,textCentred:true,productionKitUnchanged:true},null,2))
