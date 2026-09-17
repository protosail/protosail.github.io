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


export {f, rad, polygon, outline, normalise};
