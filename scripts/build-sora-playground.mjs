import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const OUT=path.join(ROOT,'output/protosail-sora-playground')
await mkdir(OUT,{recursive:true})
if(!existsSync(path.join(OUT,'sora-outlines.json'))||process.argv.includes('--refresh-fonts'))execFileSync(process.env.BRAND_PYTHON||'C:/Users/iamta/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[path.join(ROOT,'scripts/outline-sora-studies.py'),'--all-weights'],{cwd:ROOT,stdio:'inherit'})
const fonts=JSON.parse(await readFile(path.join(OUT,'sora-outlines.json'),'utf8'))
const geometry=JSON.parse(await readFile(path.join(ROOT,'output/protosail-sora-studies/geometry.json'),'utf8'))
const source=await readFile(path.join(ROOT,'scripts/preview-sora-variations.mjs'),'utf8')
const helpers=source.slice(source.indexOf('const f ='),source.indexOf('// Reconstruct the approved raw polygon'))
const runtime=await readFile(path.join(ROOT,'scripts/sora-playground-runtime.js'),'utf8')
const config={fonts,base:geometry.options.find(o=>o.id==='A'),panel:geometry.panel,colours:{lime:'#E3F941',black:'#141414',white:'#FFFFFF'}}
const corner=(id,label)=>`<label class="slider" for="${id}"><span>${label}<output for="${id}" id="${id}-value">100%</output></span><input id="${id}" type="range" min="0" max="150" step="1" value="100"></label>`
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protosail — refine A</title><style>
*{box-sizing:border-box}body{margin:0;color:#141414;background:#f5f5f1;font:15px/1.5 Arial,Helvetica,sans-serif}header{padding:26px 32px;border-bottom:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;gap:20px;background:#fff}h1{font-size:26px;letter-spacing:-.025em;font-weight:500;margin:0}header p{font-size:13px;color:#555;margin:4px 0 0}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 340px;max-width:1800px;margin:auto}.canvas{padding:45px 32px;position:sticky;top:0;align-self:start;min-width:0}.canvas svg{display:block;width:100%;height:auto}.main-preview{background:white}.preview-caption{font-size:13px;color:#555;display:flex;justify-content:space-between;gap:20px;margin:14px 0 28px}.secondary{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;margin-top:42px}.secondary h2{font-size:14px;font-weight:500;margin:0 0 14px}.icon-preview{background:white;padding:10px;width:220px}.small-preview{width:320px;max-width:100%}.small-note{font-size:12px;color:#555;margin-top:10px}.controls{padding:24px;background:#fff;border-left:1px solid #ccc}fieldset{border:0;margin:0;padding:0 0 26px}fieldset+fieldset{border-top:1px solid #ccc;padding-top:22px}legend{font-size:16px;font-weight:600;padding:0;margin-bottom:16px;float:left;width:100%}fieldset:after{content:"";display:block;clear:both}.slider{display:block;clear:both;margin-bottom:17px;font-size:13px}.slider>span{display:flex;justify-content:space-between;gap:10px}output{font-variant-numeric:tabular-nums;color:#555}input[type=range]{width:100%;height:28px;margin:3px 0 0;accent-color:#566117;cursor:pointer}input[type=checkbox]{accent-color:#566117}.hint{font-size:12px;color:#666;margin:0 0 18px;clear:both}button{font:inherit;font-size:13px;color:#141414;background:#fff;border:1px solid #aaa;padding:10px 14px;cursor:pointer}button:hover{background:#f2f3e8}button.primary{background:#141414;color:#fff;border-color:#141414}button.primary:hover{background:#333}.actions{display:flex;gap:10px;flex-wrap:wrap}.check{display:flex;align-items:center;gap:8px;font-size:13px;margin:14px 0}.status{font-size:12px;color:#555;min-height:36px;margin-top:14px}.footer{font-size:12px;color:#555;margin-top:32px;max-width:70ch}a{color:inherit;text-underline-offset:3px}button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid #677923;outline-offset:4px}::selection{background:#e3f941;color:#141414}@media(max-width:1050px){.secondary{grid-template-columns:1fr}.workspace{grid-template-columns:minmax(0,1fr) 310px}.canvas{padding:30px 20px}}@media(max-width:720px){header{padding:22px 20px;align-items:flex-start}h1{font-size:23px}.workspace{display:flex;flex-direction:column}.canvas{position:static;padding:25px 15px;width:100%}.controls{border-left:0;border-top:1px solid #ccc;padding:25px 20px}.secondary{display:none}.preview-caption{font-size:12px;margin-bottom:0}.footer{margin-top:20px}header .actions{display:none}.main-preview{position:relative}.canvas{padding-bottom:20px}}@media(prefers-reduced-motion:no-preference){button{transition:background-color 120ms ease-out}}
</style></head><body><header><div><h1>Protosail — refine A</h1><p>Sora, native spacing. Adjust the weight and each sail corner.</p></div><div class="actions"><button id="reset-top">Reset to A</button><button class="primary" id="download-top">Download SVG</button></div></header><main class="workspace"><section class="canvas"><div class="main-preview" id="preview"></div><div class="preview-caption"><span id="summary">Sora 800 · Panel height 85%</span><label><input id="guides" type="checkbox"> Text centreline</label></div><div class="secondary"><div><h2>Corner detail</h2><div id="icon-preview" class="icon-preview"></div></div><div><h2>At 320 pixels wide</h2><div id="small-preview" class="small-preview"></div><p class="small-note">The right sail retains A’s original width.</p></div></div><p class="footer">The panel starts 15% shorter than A, with equal reductions at the top and bottom. Lettering stays centred. These controls affect this preview; download your settings to keep a version for the final kit.</p></section><aside class="controls" aria-label="Logo settings"><fieldset><legend>Lettering &amp; panel</legend><label class="slider" for="weight"><span>Sora weight<output id="weight-value" for="weight">800</output></span><input id="weight" type="range" min="100" max="800" step="10" value="800"></label><p class="hint">Real Sora weights, with native kerning.</p><label class="slider" for="height"><span>Panel height<output id="height-value" for="height">85%</output></span><input id="height" type="range" min="75" max="100" step="1" value="85"></label><p class="hint">Top and bottom move equally. 100% is the previous panel.</p></fieldset><fieldset><legend>Left sail corners</legend><p class="hint">Radius relative to A. 0% makes a sharp corner.</p>${corner('w3','Top left')}${corner('w0','Top right · inner')}${corner('w1','Bottom right · inner')}${corner('w2','Bottom left')}</fieldset><fieldset><legend>Right sail corners</legend>${corner('v0','Top left · inner')}${corner('v1','Top right')}${corner('v2','Bottom right')}${corner('v3','Bottom left · inner')}<button id="sharp">Make inner corners sharp</button></fieldset><div class="actions"><button id="reset">Reset to A</button><button id="save-settings">Save settings</button><button class="primary" id="download">Download SVG</button></div><p class="status" id="status" role="status" aria-live="polite"></p></aside></main><script>const CONFIG=${JSON.stringify(config)};${helpers}\n${runtime}</script></body></html>`
await writeFile(path.join(OUT,'index.html'),html.replace('</style>','@media(max-width:720px){.canvas{position:sticky;top:0;z-index:2;background:#f5f5f1;border-bottom:1px solid #ccc}.canvas .footer{display:none}}\n</style>'))
await copyFile(path.join(ROOT,'output/protosail-font-options/fonts/sora-OFL.txt'),path.join(OUT,'Sora-OFL.txt'))
const browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
const page=await browser.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{
await page.setViewport({width:1440,height:1050,deviceScaleFactor:1})
await page.goto(pathToFileURL(path.join(OUT,'index.html')).href,{waitUntil:'networkidle0'})
await page.waitForFunction(()=>window.ready)
await page.screenshot({path:path.join(OUT,'preview.png'),fullPage:true})
await writeFile(path.join(OUT,'protosail-a-shorter-panel.svg'),await page.evaluate(()=>window.playground.exportSvg()))
const checks=await page.evaluate(()=>{
 const p=window.playground,results=[];
 const assert=()=>{const svg=document.querySelector('#preview svg'),l=svg.querySelector('[data-lettering]').getBBox(),panel=svg.querySelector('[data-panel]').getBBox(),w=svg.querySelector('[data-part="wing"]').getBBox(),v=svg.querySelector('[data-part="vane"]').getBBox();if(Math.abs(l.y+l.height/2-(panel.y+panel.height/2))>.01)throw Error('Text off centre');if(Math.abs(w.y+w.height-v.y-v.height)>.01)throw Error('Bottoms misaligned');if(!Number.isFinite(w.width)||svg.outerHTML.includes('NaN'))throw Error('Invalid geometry');return {height:panel.height,centre:panel.y+panel.height/2}};
 for(const weight of [100,400,700,800]){document.querySelector('#weight').value=weight;for(const radius of [0,100,150]){for(const id of p.cornerIds)document.getElementById(id).value=radius;p.render();results.push({weight,radius,...assert()})}}
 for(const id of p.cornerIds){p.reset();document.getElementById(id).value=0;p.render();assert()}
 p.reset();const initial=assert();document.getElementById('height').value=75;p.render();assert();p.reset();
 return {cases:results.length+8+2,initial,settings:p.settings(),svgPathsOnly:!document.querySelector('#preview text'),weights:Object.keys(CONFIG.fonts).length};
})
await page.click('#sharp');await page.click('#reset');
await page.focus('#weight');await page.keyboard.press('ArrowLeft');
if(await page.$eval('#weight',e=>e.value)!=='790')throw Error('Weight keyboard control failed')
await page.evaluate(()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.lastDownload=blob;return original(blob)}})
await page.click('#save-settings')
const saved=await page.evaluate(async()=>JSON.parse(await window.lastDownload.text()))
if(saved.weight!==790)throw Error('Settings download mismatch')
await page.click('#download')
const downloaded=await page.evaluate(async()=>await window.lastDownload.text())
if(!downloaded.includes('Sora 790')||downloaded.includes('<text'))throw Error('SVG download mismatch')
await page.click('#reset')
await page.setViewport({width:390,height:844,deviceScaleFactor:1})
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow')
await page.screenshot({path:path.join(OUT,'mobile-preview.png'),fullPage:true})
await page.$eval('#v3',e=>e.scrollIntoView({block:'center'}))
if(await page.$eval('#preview',e=>e.getBoundingClientRect().bottom<0))throw Error('Mobile preview not visible while adjusting corners')
await writeFile(path.join(OUT,'verification.json'),JSON.stringify({checks,errors,mobileNoOverflow:true,keyboardControl:true,svgDownload:true,settingsDownload:true,mobileStickyPreview:true},null,2))
if(errors.length)throw Error(errors.join('\n'))
console.log(JSON.stringify({output:OUT,...checks}))
}finally{await browser.close()}
