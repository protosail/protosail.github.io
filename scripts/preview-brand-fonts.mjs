/**
 * Font selection studies only. Does not modify the production brand kit.
 * Run: node scripts/preview-brand-fonts.mjs
 * Font files, upstream metadata and licences are cached in the preview folder.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'output/protosail-font-options')
const KIT = path.join(ROOT, 'output/protosail-brand-kit')
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
const protectedPaths = ['scripts/build-brand.mjs', 'output/protosail-brand-kit/protosail-brand-kit.zip', 'output/protosail-brand-kit/geometry.json']
const before = await Promise.all(protectedPaths.map(async p => hash(await readFile(path.join(ROOT, p)))))
const geometry = JSON.parse(await readFile(path.join(KIT, 'geometry.json'), 'utf8'))
const options = [
  { id: 'A', slug: 'archivo', name: 'Archivo Expanded', family: 'Archivo', weight: 900, width: 125, style: 'Black 900 · Expanded 125%', note: 'Broad and solid; closest to the original direction.', url: 'https://fonts.google.com/specimen/Archivo' },
  { id: 'B', slug: 'leaguespartan', name: 'League Spartan', family: 'League Spartan', weight: 800, style: 'ExtraBold 800', note: 'Classic geometric shapes with a distinctive R.', url: 'https://fonts.google.com/specimen/League+Spartan' },
  { id: 'C', slug: 'outfit', name: 'Outfit', family: 'Outfit', weight: 800, style: 'ExtraBold 800', note: 'Rounder curves and a softer, more open rhythm.', url: 'https://fonts.google.com/specimen/Outfit' },
  { id: 'D', slug: 'montserrat', name: 'Montserrat', family: 'Montserrat', weight: 900, style: 'Black 900', note: 'Heavy geometric lettering with a strong, angled R.', url: 'https://fonts.google.com/specimen/Montserrat' },
  { id: 'E', slug: 'sora', name: 'Sora', family: 'Sora', weight: 800, style: 'ExtraBold 800', note: 'A more technical shape with distinctive square details.', url: 'https://fonts.google.com/specimen/Sora' },
]
for (const option of options) {
  const file = await readFile(path.join(OUT, 'fonts', option.slug + '.ttf'))
  option.fontSha256 = hash(file)
  option.data = file.toString('base64')
  const licence = await readFile(path.join(OUT, 'fonts', option.slug + '-OFL.txt'), 'utf8')
  if (!licence.includes('SIL OPEN FONT LICENSE Version 1.1')) throw Error('Missing font licence: ' + option.slug)
}
const cssFaces = options.map(o => `@font-face{font-family:study-${o.slug};src:url(data:font/ttf;base64,${o.data}) format('truetype');font-weight:${o.weight};font-style:normal;font-display:block;font-variation-settings:"wght" ${o.weight}${o.width ? `,"wdth" ${o.width}` : ''}}`).join('\n')
const config = {
  options: options.map(({ data, ...o }) => o),
  icon: geometry.icon,
  colours: geometry.colours,
  layouts: geometry.layouts,
}

const runtime = String.raw`
const CONFIG = __CONFIG__;
const NS = 'http://www.w3.org/2000/svg';
const { options, icon, colours:C, layouts } = CONFIG;
const f = n => Number(n.toFixed(4));
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const fontStyle = o => 'font-family:study-'+o.slug+';font-weight:'+o.weight+';font-synthesis:none;font-kerning:normal;font-variation-settings:"wght" '+o.weight+(o.width?',"wdth" '+o.width:'');
function measure(o, text, tracking=0) {
  ctx.font = o.weight+' 1000px study-'+o.slug;
  ctx.fontKerning = 'normal';
  ctx.letterSpacing = '0px';
  const hm = ctx.measureText('H');
  const size = 1000000 / (hm.actualBoundingBoxAscent + hm.actualBoundingBoxDescent);
  ctx.font = o.weight+' '+size+'px study-'+o.slug;
  ctx.letterSpacing = (tracking*size)+'px';
  const m = ctx.measureText(text);
  return {size, left:m.actualBoundingBoxLeft, top:1000-m.actualBoundingBoxAscent, width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight, height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent, advance:m.width};
}
function lettering(o, text, fill, x=0, y=0, tracking=0) {
  const m = measure(o,text,tracking);
  return { markup:'<text data-lettering="'+text+'" x="'+f(x+m.left)+'" y="'+f(y+1000)+'" font-size="'+f(m.size)+'" letter-spacing="'+f(tracking*m.size)+'" fill="'+fill+'" style=\''+fontStyle(o)+'\'>'+text+'</text>', bounds:{x,y:y+m.top,width:m.width,height:m.height}, metrics:m };
}
function sails(x,y,h,fill=C.lime) {
  return '<g data-component="sail-icon" transform="translate('+f(x)+' '+f(y)+') scale('+f(h/1000)+')"><path d="'+icon.wingPath+'" fill="'+fill+'"/><path d="'+icon.vanePath+'" fill="'+fill+'"/></g>';
}
function union(...boxes) {
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
function composition(o,kind='primary',tracking=0,theme='dark') {
  const fill=theme==='light'?C.black:C.white;
  const word=lettering(o,'PROTOSAIL',fill,0,0,tracking);
  if(kind==='wordmark') return {markup:word.markup,bounds:word.bounds};
  if(kind==='primary') {
    const p=layouts.primary, prefix=lettering(o,'PROTOS',fill,0,0,tracking);
    const ix=prefix.bounds.width+p.prefixToIcon, iw=icon.width*p.iconHeight/1000;
    const l=lettering(o,'L',fill,ix+iw+p.iconToL);
    return {markup:prefix.markup+sails(ix,p.iconY,p.iconHeight)+l.markup,bounds:union(prefix.bounds,l.bounds,{x:ix,y:p.iconY,width:iw,height:p.iconHeight})};
  }
  if(kind==='horizontal') {
    const h=layouts.horizontal,iw=icon.width*h.iconHeight/1000;
    const shifted=lettering(o,'PROTOSAIL',fill,iw+h.gap,0,tracking);
    return {markup:sails(0,h.iconY,h.iconHeight)+shifted.markup,bounds:union(shifted.bounds,{x:0,y:h.iconY,width:iw,height:h.iconHeight})};
  }
  const s=layouts.stacked,iw=icon.width*s.iconHeight/1000,ix=(word.bounds.width-iw)/2;
  const shifted=lettering(o,'PROTOSAIL',fill,0,s.iconHeight+s.gap-word.bounds.y,tracking);
  return {markup:sails(ix,0,s.iconHeight)+shifted.markup,bounds:union(shifted.bounds,{x:ix,y:0,width:iw,height:s.iconHeight})};
}
function svgFor(o,kind,tracking=0,theme='dark',fixedWidth=0) {
  const art=composition(o,kind,tracking,theme),b=art.bounds;
  const box = fixedWidth ? [(b.width-fixedWidth)/2,-580,fixedWidth,2100] : [b.x-500,b.y-500,b.width+1000,b.height+1000];
  return '<svg xmlns="'+NS+'" role="img" aria-label="Protosail in '+o.name+', '+kind+'" viewBox="'+box.map(f).join(' ')+'"><title>Protosail / '+o.name+' / '+kind+'</title>'+art.markup+'</svg>';
}
await Promise.all(options.map(o=>document.fonts.load(o.weight+' 1000px study-'+o.slug,'PROTOSAIL')));
await document.fonts.ready;
for(const o of options) if(!document.fonts.check(o.weight+' 1000px study-'+o.slug)) throw Error('Font not loaded: '+o.slug);
const commonWidth=Math.max(...options.flatMap(o=>['wordmark','primary'].map(k=>composition(o,k).bounds.width)))+900;
document.getElementById('comparison').innerHTML=options.map(o=>'<article class="font-row" id="option-'+o.id+'"><div class="option-heading"><h2><span>'+o.id+'</span> '+o.name+'</h2><p>'+o.style+' <span class="separator">/</span> '+o.note+'</p></div><div class="samples"><div class="word-sample">'+svgFor(o,'wordmark',0,'light',commonWidth)+'</div><div class="integrated-sample">'+svgFor(o,'primary',0,'dark',commonWidth)+'</div></div></article>').join('');
const fontSelect=document.getElementById('font');
fontSelect.innerHTML=options.map(o=>'<option value="'+o.id+'">'+o.id+' — '+o.name+'</option>').join('');
function updateDetail() {
  const o=options.find(o=>o.id===fontSelect.value);
  const kind=document.getElementById('layout').value;
  const tracking=Number(document.getElementById('tracking').value);
  const theme=document.getElementById('theme').value;
  const stage=document.getElementById('detail-stage');
  stage.className='detail-stage '+theme+' '+kind;
  stage.innerHTML=svgFor(o,kind,tracking,theme);
  document.getElementById('detail-caption').textContent=o.name+' · '+o.style+' · '+(tracking===0?'Native spacing':tracking+' em additional letter spacing');
  document.getElementById('source-link').href=o.url;
  document.getElementById('letter-closeup').innerHTML=letterCloseup(o);
  document.getElementById('practical').innerHTML='<div>'+svgFor(o,'wordmark',tracking,'light')+'<span>Wordmark / 220 px wide</span></div><div>'+svgFor(o,'primary',tracking,'dark')+'<span>Integrated / 280 px wide</span></div>';
}
function letterCloseup(o) {
  return ['P','R','O','S','A','I','L'].map(l=>{const a=lettering(o,l,C.black);return '<div><svg role="img" aria-label="'+l+' in '+o.name+'" viewBox="'+f((a.bounds.width-1600)/2)+' -150 1600 1400">'+a.markup+'</svg><span>'+l+'</span></div>';}).join('');
}
document.querySelectorAll('select').forEach(s=>s.addEventListener('change',updateDetail));
updateDetail();
window.study={options,measure,composition,svgFor,commonWidth,updateDetail};
window.ready=true;
` .replace('__CONFIG__', JSON.stringify(config))

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protosail — font options</title><style>
${cssFaces}
*{box-sizing:border-box}body{margin:0;background:#f4f4ef;color:#141414;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5}a{color:inherit;text-underline-offset:4px}button,select{font:inherit}svg{display:block;width:100%;height:auto}#comparison-sheet{max-width:1600px;margin:auto;background:#fff}.sheet-header{padding:35px 42px 28px;border-bottom:1px solid #ccc}.topline{display:flex;justify-content:space-between;gap:20px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#555}.topline b{font-weight:400}h1{font-size:38px;font-weight:500;letter-spacing:-.04em;line-height:1.1;margin:24px 0 12px}.sheet-header p{color:#555;margin:0;font-size:14px}.column-labels{display:grid;grid-template-columns:1fr 1fr;padding:14px 28px 10px;border-bottom:1px solid #ccc;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#64645b}.column-labels span:last-child{padding-left:28px}.font-row{border-bottom:1px solid #ccc}.option-heading{padding:13px 28px 0;display:flex;align-items:baseline;gap:26px;min-height:53px}.option-heading h2{font-size:20px;font-weight:600;letter-spacing:-.025em;margin:0;min-width:270px}.option-heading h2 span{display:inline-block;font-size:13px;color:#76766c;font-weight:400;width:26px;letter-spacing:0}.option-heading p{font-size:12px;color:#64645b;margin:0}.separator{margin:0 10px;color:#aaa}.samples{display:grid;grid-template-columns:1fr 1fr;gap:0}.samples>div{padding:0 28px;display:flex;align-items:center;height:165px}.word-sample{background:#fff}.integrated-sample{background:#141414}.sheet-footer{padding:20px 28px;font-size:11px;color:#666;display:flex;justify-content:space-between;gap:25px}.detail{max-width:1320px;margin:64px auto;padding:0 36px}.detail h2{font-size:30px;font-weight:500;letter-spacing:-.03em;margin:0 0 8px}.detail>p{color:#60605a;max-width:810px}.controls{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:15px;margin:28px 0 20px}label{font-size:12px;color:#555}select{display:block;width:100%;padding:12px 30px 12px 12px;border:1px solid #aaa;border-radius:0;color:#141414;background:#fff;margin-top:7px;font-size:14px}.detail-stage{display:flex;align-items:center;justify-content:center;min-height:370px;padding:35px;background:#141414}.detail-stage.light{background:#fff}.detail-stage.panel{background:#fff;padding:35px}.detail-stage.panel svg{background:#141414}.detail-stage svg{max-height:430px}.detail-stage.wordmark{min-height:280px}.detail-caption{display:flex;justify-content:space-between;gap:20px;margin-top:12px;font-size:13px;color:#555}.closeup-heading{margin:38px 0 18px;font-size:13px;color:#555}.letter-closeup{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}.letter-closeup>div{background:#fff;text-align:center;padding:8px}.letter-closeup span{font-size:11px;color:#777}.practical{display:flex;gap:40px;margin:28px 0}.practical>div{padding:20px;background:#fff;display:flex;flex-direction:column;justify-content:center}.practical>div:nth-child(2){background:#141414;color:#fff}.practical svg{width:220px}.practical>div:nth-child(2) svg{width:280px}.practical span{font-size:11px;margin-top:16px;color:#75756a}.practical>div:nth-child(2) span{color:#bbb}.note{border-top:1px solid #ccc;padding-top:24px;font-size:13px;color:#555}.sources{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin-top:25px}select:focus-visible,a:focus-visible{outline:2px solid #849a18;outline-offset:3px}@media(max-width:720px){.sheet-header{padding:25px 20px}.topline{font-size:10px;letter-spacing:.04em}h1{font-size:32px}.column-labels{display:none}.option-heading{display:block;padding:20px 20px 12px}.option-heading h2{font-size:22px}.option-heading p{font-size:12px;margin:5px 0 0}.separator{margin:0 5px}.samples{grid-template-columns:1fr}.samples>div{height:125px;padding:0 18px}.sheet-footer{display:block;padding:20px}.sheet-footer span{display:block;margin-top:7px}.detail{margin:40px auto;padding:0 20px}.controls{grid-template-columns:1fr 1fr}.detail-stage{min-height:220px;padding:12px}.detail-stage.panel{padding:12px}.detail-caption{display:block}.letter-closeup{gap:4px}.letter-closeup>div{padding:2px}.practical{flex-direction:column;gap:16px}.practical>div{align-items:center}.detail h2{font-size:28px}.sources{gap:15px}.detail-stage.wordmark{min-height:170px}}@media print{body{background:white}.detail{display:none}#comparison-sheet{max-width:none}.integrated-sample{print-color-adjust:exact;-webkit-print-color-adjust:exact}.font-row{break-inside:avoid}}
</style></head><body><main><section id="comparison-sheet"><header class="sheet-header"><div class="topline"><span>Protosail / Typography studies</span><b>Preview only · A—E</b></div><h1>Five fonts. One identity.</h1><p>Compare the letterforms and their native kerning. Every option uses the same cap height, sail geometry and colours.</p></header><div class="column-labels"><span>Full wordmark / charcoal on white</span><span>Integrated logo / lime + white on charcoal</span></div><div id="comparison"></div><footer class="sheet-footer"><span>Native kerning · No added tracking · No synthetic bold or stretching</span><span>#E3F941 lime · #141414 charcoal · #FFFFFF white</span></footer></section>
<section class="detail"><h2>Take a closer look.</h2><p>Try each font in the main logo, a separate icon and wordmark, or a stacked composition. The controls below only change this preview.</p><div class="controls"><label>Typeface<select id="font" aria-label="Typeface"></select></label><label>Composition<select id="layout"><option value="primary">Integrated main logo</option><option value="wordmark">Full wordmark</option><option value="horizontal">Icon + wordmark</option><option value="stacked">Stacked logo</option></select></label><label>Spacing<select id="tracking"><option value="0">Native spacing</option><option value="-0.015">Slightly tighter (−0.015 em)</option><option value="0.02">Slightly wider (+0.02 em)</option></select></label><label>Background<select id="theme"><option value="dark">Charcoal</option><option value="light">White</option><option value="panel">Charcoal panel on white</option></select></label></div><div id="detail-stage" class="detail-stage"></div><div class="detail-caption"><span id="detail-caption"></span><a id="source-link" href="https://fonts.google.com" target="_blank" rel="noreferrer">View font source ↗</a></div><p class="closeup-heading">Letterform details / P · R · O · S · A · I · L</p><div id="letter-closeup" class="letter-closeup"></div><div id="practical" class="practical"></div><div class="note"><p><strong>Selection study.</strong> The existing brand kit is unchanged. After a font is chosen, its lettering can be converted to vector outlines and used consistently across the final SVGs and exports.</p><p>Archivo uses its designed width axis at 125%; no lettering has been stretched. All five original font files are embedded in this page for offline viewing. Font licences and upstream metadata are included in the adjacent fonts folder.</p></div><nav class="sources">${options.map(o => `<a href="${o.url}" target="_blank" rel="noreferrer">${o.name}</a>`).join('')}</nav></section></main><script type="module">${runtime}</script></body></html>`

await mkdir(OUT, { recursive: true })
await writeFile(path.join(OUT, 'index.html'), html)
await writeFile(path.join(OUT, 'options.json'), JSON.stringify(config, null, 2) + '\n')
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.error(e.message) })
await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(path.join(OUT, 'index.html')).href, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.ready, { timeout: 20000 })
const metrics = await page.evaluate(() => {
  const s = window.study
  return s.options.map(o => ({ id:o.id, name:o.name, word:s.measure(o,'PROTOSAIL'), primary:s.composition(o,'primary').bounds }))
})
await (await page.$('#comparison-sheet')).screenshot({ path: path.join(OUT, 'font-comparison.png') })

// Verify real fonts loaded, fixed cap height, canonical sails, controls, and mobile layout.
const checks = await page.evaluate(() => {
  const {options,measure}=window.study
  return {
    fontCount:document.fonts.size,
    capHeights:options.map(o=>({font:o.name,height:measure(o,'H').height})),
    noOverflow:document.documentElement.scrollWidth<=innerWidth,
    sailCopies:document.querySelectorAll('#comparison [data-component="sail-icon"]').length,
    loaded:options.every(o=>document.fonts.check(o.weight+' 1000px study-'+o.slug)),
  }
})
if(checks.fontCount!==5 || !checks.loaded || !checks.noOverflow || checks.capHeights.some(x=>Math.abs(x.height-1000)>2)) throw Error(JSON.stringify(checks))
const variations = []
for (const option of options) {
  await page.select('#font', option.id)
  for (const kind of ['primary','wordmark','horizontal','stacked']) {
    await page.select('#layout', kind)
    for (const theme of ['dark','light','panel']) {
      await page.select('#theme', theme)
      const ok = await page.evaluate(() => {
        const svg=document.querySelector('#detail-stage svg')
        return svg && !svg.outerHTML.includes('NaN') && svg.getBoundingClientRect().width>0
      })
      if(!ok) throw Error('Invalid detail preview: '+option.id+' '+kind+' '+theme)
      variations.push(option.id+'/'+kind+'/'+theme)
    }
  }
}
await page.select('#font','A')
await page.select('#layout','primary')
await page.select('#theme','panel')
for(const value of ['-0.015','0.02','0']) await page.select('#tracking',value)
await (await page.$('.detail')).screenshot({path:path.join(OUT,'detail-preview.png')})
await page.setViewport({width:390,height:844,deviceScaleFactor:1})
const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
if(mobileOverflow) throw Error('Mobile horizontal overflow')
await page.screenshot({path:path.join(OUT,'mobile-preview.png'),fullPage:true})
await browser.close()
if(errors.length) throw Error(errors.join('\n'))
const after=await Promise.all(protectedPaths.map(async p=>hash(await readFile(path.join(ROOT,p)))))
if(before.some((v,i)=>v!==after[i])) throw Error('Production kit changed during preview')
await writeFile(path.join(OUT,'verification.json'),JSON.stringify({checks,metrics,variationsChecked:variations.length,mobileNoOverflow:!mobileOverflow,pageErrors:errors,productionKitUnchanged:true,protectedFiles:protectedPaths.map((p,i)=>({path:p,sha256:after[i]}))},null,2)+'\n')
console.log(JSON.stringify({output:OUT,fontOptions:options.length,variationsChecked:variations.length,productionKitUnchanged:true},null,2))
