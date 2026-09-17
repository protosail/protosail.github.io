const {fonts,base,panel,colours:C}=CONFIG;
const cornerIds=['w0','w1','w2','w3','v0','v1','v2','v3'];
const defaults={weight:800,height:85,...Object.fromEntries(cornerIds.map(id=>[id,100]))};
let currentSvg='';
function settings(){return Object.fromEntries(Object.keys(defaults).map(id=>[id,Number(document.getElementById(id).value)]))}
function pathTag(d,fill,attrs=''){return '<path d="'+d+'" fill="'+fill+'" '+attrs+'/>'}
function rect(x,y,w,h,fill,attrs=''){return pathTag('M '+f(x)+' '+f(y)+' H '+f(x+w)+' V '+f(y+h)+' H '+f(x)+' Z',fill,attrs)}
function word(font,text,x,y){const s=font.shapes[text];return '<g transform="translate('+f(x-s.bounds.x)+' '+f(y)+')">'+s.parts.map(g=>pathTag(g.path,C.white)).join('')+'</g>'}
function render(){
 const s=settings(),font=fonts[s.weight];
 Object.entries(s).forEach(([id,value])=>{document.getElementById(id+'-value').textContent=value+(id==='weight'?'':'%')});
 const wr=base.icon.wingRadii.map((r,i)=>r*s['w'+i]/100);
 const wing=normalise(polygon(base.icon.wingVertices,wr));
 const vr=base.icon.vaneRadii.map((r,i)=>r*s['v'+i]/100);
 const rise=220*Math.tan(rad(32));
 const make=h=>polygon([[0,0],[220,rise],[220,h],[0,h-rise]],vr);
 const trial=make(680),vane=make(680+670-trial.bounds.height);
 const vp=outline(vane,1,wing.width+65-vane.bounds.x,330-vane.bounds.y);
 const iconArt=pathTag(wing.path,C.lime,'data-part="wing"')+pathTag(vp,C.lime,'data-part="vane"');
 const pw=font.shapes.PROTOS.bounds.width,l=font.shapes.L;
 const lx=pw+(wing.width+65+220)*1.75+120,artWidth=lx+l.bounds.width;
 const top=Math.min(font.shapes.PROTOS.bounds.y,l.bounds.y),bottom=Math.max(font.shapes.PROTOS.bounds.y+font.shapes.PROTOS.bounds.height,l.bounds.y+l.bounds.height);
 const dy=500-(top+bottom)/2;
 const height=panel.height*s.height/100,y=500-height/2;
 const box=[-180,y-180,panel.width+360,height+360];
 const art='<g transform="translate('+f((panel.width-artWidth)/2)+' 0)"><g data-lettering="true">'+word(font,'PROTOS',0,dy)+word(font,'L',lx,dy)+'</g><g transform="translate('+f(pw)+' -480) scale(1.75)">'+iconArt+'</g></g>';
 currentSvg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+box.map(f).join(' ')+'" role="img" aria-label="Protosail A, Sora '+s.weight+'"><title>Protosail A — Sora '+s.weight+'</title><desc>Native Sora kerning. Outlined lettering. Equal top and bottom panel reduction. Settings: '+JSON.stringify(s)+'</desc>'+rect(...box,C.white)+rect(0,y,panel.width,height,C.black,'data-panel="true"')+art+'</svg>';
 document.getElementById('preview').innerHTML=currentSvg;
 document.getElementById('small-preview').innerHTML=currentSvg;
 if(document.getElementById('guides').checked){const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d','M 0 500 H '+panel.width);line.setAttribute('stroke','#ed7580');line.setAttribute('stroke-width','8');line.setAttribute('stroke-dasharray','45 35');document.querySelector('#preview svg').append(line)}
 document.getElementById('icon-preview').innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 '+f(wing.width+585)+' 1300">'+rect(-150,-150,wing.width+585,1300,C.black)+iconArt+'</svg>';
 document.getElementById('summary').textContent='Sora '+s.weight+' · Panel height '+s.height+'%';
 document.getElementById('status').textContent='';
}
function reset(){Object.entries(defaults).forEach(([id,value])=>document.getElementById(id).value=value);document.getElementById('guides').checked=false;render()}
function download(data,type,name){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
document.querySelectorAll('input').forEach(input=>input.addEventListener('input',render));
for(const id of ['reset','reset-top'])document.getElementById(id).addEventListener('click',reset);
for(const id of ['download','download-top'])document.getElementById(id).addEventListener('click',()=>{download(currentSvg,'image/svg+xml','protosail-sora-'+settings().weight+'.svg');document.getElementById('status').textContent='SVG downloaded with your current settings.'});
document.getElementById('save-settings').addEventListener('click',()=>{download(JSON.stringify({base:'A',font:'Sora',nativeKerning:true,...settings()},null,2),'application/json','protosail-settings.json');document.getElementById('status').textContent='Settings downloaded. Send this file back to use these values in the final kit.'});
document.getElementById('sharp').addEventListener('click',()=>{for(const id of ['w0','w1','v0','v3'])document.getElementById(id).value=0;render()});
window.playground={render,reset,settings,cornerIds,exportSvg:()=>currentSvg};
reset();window.ready=true;
