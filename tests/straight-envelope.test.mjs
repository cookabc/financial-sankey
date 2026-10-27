import test from 'node:test';
import assert from 'node:assert/strict';
import {sankey} from 'd3-sankey';
import {parseText,analyzeLinks} from '../src/core/table-data.js';
import {DEFAULT_EXAMPLE} from '../src/examples/registry.js';
const REPORT_TEXT=DEFAULT_EXAMPLE.text;
import {financialRail,financialLinkGeometry} from '../src/core/top-layout.js';
const REPORT_CHAIN=DEFAULT_EXAMPLE.document.mainChain;

const TOLERANCE=.005;
const CUBIC_STEPS=128;
const near=(actual,expected,label,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, got ${actual}`);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cubic=(p0,p1,p2,p3,t)=>p0*(1-t)**3+3*p1*t*(1-t)**2+3*p2*t*t*(1-t)+p3*t**3;

// Read the actual filled SVG path, not just centerlines or vertical bounds.
// Sample the actual standard cubic boundaries, not an assumed straight rail.
function polygonFromPath(path){
 const tokens=path.match(/[MLCHVZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[];
 assert.equal(path.replace(/[MLCHVZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]/g,''),'','unexpected filled-path command');
 const points=[];let i=0,p=[0,0],start=null,command=null,closed=false;
 const number=()=>{const value=Number(tokens[i++]);assert.ok(Number.isFinite(value),'finite SVG coordinate');return value;};
 const add=q=>{if(!points.length||distance(points.at(-1),q)>1e-10)points.push(q);p=q;};
 while(i<tokens.length){
  if(/^[A-Z]$/.test(tokens[i]))command=tokens[i++];
  assert.ok(command,'SVG path starts with a command');
  if(command==='Z'){closed=true;p=start;command=null;continue;}
  if(command==='M'){assert.equal(start,null,'one ribbon is one contour');add([number(),number()]);start=p;command='L';}
  else if(command==='L')add([number(),number()]);
  else if(command==='H')add([number(),p[1]]);
  else if(command==='V')add([p[0],number()]);
  else if(command==='C'){
   const p0=p,p1=[number(),number()],p2=[number(),number()],p3=[number(),number()];
   for(let j=1;j<=CUBIC_STEPS;j++){const t=j/CUBIC_STEPS;add([cubic(p0[0],p1[0],p2[0],p3[0],t),cubic(p0[1],p1[1],p2[1],p3[1],t)]);}
  }else assert.fail(`unsupported SVG command ${command}`);
 }
 assert.ok(closed,'filled ribbon is closed');
 if(points.length>1&&distance(points[0],points.at(-1))<1e-10)points.pop();
 assert.ok(points.length>=3,'filled ribbon has a nonempty polygon');
 return points;
}
function polygon(points){
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const edges=points.map((a,i)=>{const b=points[(i+1)%points.length];return {a,b,x0:Math.min(a[0],b[0]),x1:Math.max(a[0],b[0]),y0:Math.min(a[1],b[1]),y1:Math.max(a[1],b[1])};});
 return {points,edges,x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};
}
function segmentDistance(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
 const t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2)):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function inside(p,shape,tolerance=TOLERANCE){
 if(p[0]<=shape.x0+tolerance||p[0]>=shape.x1-tolerance||p[1]<=shape.y0+tolerance||p[1]>=shape.y1-tolerance)return false;
 let result=false;
 for(const {a,b} of shape.edges)if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
 if(!result)return false;
 return !shape.edges.some(e=>p[0]>=e.x0-tolerance&&p[0]<=e.x1+tolerance&&p[1]>=e.y0-tolerance&&p[1]<=e.y1+tolerance&&segmentDistance(p,e.a,e.b)<=tolerance);
}
function properCrossing(a,b,c,d,tolerance=TOLERANCE){
 const signedDistance=(p,q,r)=>((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))/distance(p,q);
 if(distance(a,b)<1e-10||distance(c,d)<1e-10)return false;
 const c0=signedDistance(a,b,c),d0=signedDistance(a,b,d),a0=signedDistance(c,d,a),b0=signedDistance(c,d,b);
 return ((c0>tolerance&&d0<-tolerance)||(c0<-tolerance&&d0>tolerance))&&((a0>tolerance&&b0<-tolerance)||(a0<-tolerance&&b0>tolerance));
}
function overlap(a,b){
 if(Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)<=TOLERANCE||Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)<=TOLERANCE)return null;
 for(const e of a.edges)for(const f of b.edges){
  if(e.x1<f.x0||f.x1<e.x0||e.y1<f.y0||f.y1<e.y0)continue;
  if(properCrossing(e.a,e.b,f.a,f.b))return 'proper boundary crossing';
 }
 for(const [first,second] of [[a,b],[b,a]]){
  for(const {a:p,b:q} of first.edges){
   if(inside(p,second))return `interior vertex ${p.join(',')}`;
   const midpoint=[(p[0]+q[0])/2,(p[1]+q[1])/2];
   if(inside(midpoint,second))return `interior edge midpoint ${midpoint.join(',')}`;
  }
  const centroid=first.points.reduce((sum,p)=>[sum[0]+p[0]/first.points.length,sum[1]+p[1]/first.points.length],[0,0]);
  if(inside(centroid,first)&&inside(centroid,second))return `shared interior ${centroid.join(',')}`;
 }
 return null;
}
function make(text,chain,order=[],minimum=0){
 const model=analyzeLinks(parseText(text));assert.ok(model.balanced,'fixture conserves flow');
 const graph=sankey().nodeId(n=>n.id).extent([[44,180],[1365,900]])({nodes:model.nodes.map(n=>({id:n.id})),links:model.links.map(l=>({...l}))});
 const result=financialRail(graph,{chain,order,balanced:model.balanced,minimum});assert.ok(result.applied,result.reason);
 return graph;
}
const label=l=>`${l.source.id}→${l.target.id}`;
const tiny=`源一,甲,0.001
源二,甲,99.998
源三,甲,0.001
甲,费用甲,0.001
甲,费用乙,0.001
甲,乙,99.998
小收益甲,乙,0.001
小收益乙,乙,0.001
乙,末,100`;
const adjacent=`源一,甲,60
源二,甲,40
甲,甲费用一,15
甲,甲费用二,10
甲,乙,75
乙收益一,乙,12
乙收益二,乙,13
乙,乙费用一,35
乙,乙费用二,15
乙,丙,50
丙收益一,丙,40
丙收益二,丙,10
丙,丙费用一,30
丙,丙费用二,20
丙,丁,50
丁收益一,丁,25
丁收益二,丁,25
丁,丁费用一,40
丁,丁费用二,10
丁,末,50`;
const cases=[
 ['official report',REPORT_TEXT,REPORT_CHAIN],
 ['adjacent gain and expense groups',adjacent,['甲','乙','丙','丁','末']],
 ['0.001 sources and side branches',tiny,['甲','乙','末']],
 ['900% gains and 99.9% deductions','源,甲,100\n甲,乙,100\n加项,乙,900\n乙,费用,999\n乙,末,1',['甲','乙','末']],
 ['99.9% deductions before 900% gains','源,甲,100\n甲,费用,99.9\n甲,乙,0.1\n加项,乙,0.9\n乙,末,1',['甲','乙','末']],
 ['main chain without separate income','甲,乙,100\n乙,末,100',['甲','乙','末']],
];

test('envelope intersection checker distinguishes overlap from shared boundaries',()=>{
 const square=(x,y,w,h)=>polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
 assert.equal(overlap(square(0,0,10,10),square(10,0,10,10)),null);
 assert.equal(overlap(square(0,0,10,10),square(10-TOLERANCE/2,0,10,10)),null);
 assert.ok(overlap(square(0,0,10,10),square(9,5,10,10)));
 assert.ok(overlap(square(0,0,10,10),square(2,2,2,2)));
 assert.ok(overlap(square(0,0,10,10),square(0,0,10,10)));
 assert.ok(overlap(square(0,4,10,2),square(4,0,2,10)),'crossing is found without contained original vertices');
});

test('every true ribbon has one standard cubic per boundary and preserves its quantitative ports',()=>{
 for(const [,text,chain] of cases){
  const g=make(text,chain);
  for(const l of g.links){
   const d=financialLinkGeometry(l),a=l.port0,b=l.port1,xm=(a.x+b.x)/2,w=l.width;
   assert.equal(a.edge,'right');assert.equal(b.edge,'left');assert.ok(b.x>a.x,label(l));
   assert.equal(d.center,`M${a.x},${a.y}C${xm},${a.y} ${xm},${b.y} ${b.x},${b.y}`,label(l));
   assert.equal(d.actualArea,`M${a.x},${a.y-w/2}C${xm},${a.y-w/2} ${xm},${b.y-w/2} ${b.x},${b.y-w/2}L${b.x},${b.y+w/2}C${xm},${b.y+w/2} ${xm},${a.y+w/2} ${a.x},${a.y+w/2}Z`,label(l));
   assert.equal(d.area,d.actualArea,'strict zero is the actual proportional two-cubic ribbon');
   assert.equal(d.portWidth,w);assert.equal(d.visibleWidth,w);
   assert.ok(polygonFromPath(d.area).length>2*CUBIC_STEPS,'the real filled SVG path is valid');
   near(d.labelPoint.x,cubic(a.x,xm,xm,b.x,.5),'label actual cubic midpoint x');
   near(d.labelPoint.y,cubic(a.y,a.y,b.y,b.y,.5),'label actual cubic midpoint y');
   assert.equal(d.route,undefined,'no orthogonal or quarter-circle pipe route');
   if(d.main)near(a.y-w/2,l.source.y0,'main output begins at the node top');
  }
 }
});

test('minimum display widths reach both node edges without a taper and conserve the whole graph',()=>{
 let enhancedCurves=0,enhancedBentSections=0;
 for(const [,text,chain] of cases)for(const minimum of [2,4,6]){
  const g=make(text,chain,[],minimum);
  for(const n of g.nodes){
   for(const [links,key] of [[n.targetLinks,'port1'],[n.sourceLinks,'port0']])if(links.length){
    let y=n.y0;
    for(const l of [...links].sort((a,b)=>a[key].y-b[key].y)){
     near(l[key].y-l.width/2,y,`${n.id} ${key}: continuous display boundary`);y+=l.width;
    }
    near(y,n.y1,`${n.id} ${key}: full display-height coverage`);
   }
  }
  for(const l of g.links){
   const d=financialLinkGeometry(l),a=l.port0,b=l.port1,xm=(a.x+b.x)/2;
   near(l.actualWidth,l.value*g.rail.scale,'true monetary width remains unchanged');
   near(d.actualWidth,l.actualWidth,'geometry retains a separate monetary width');
   near(d.portWidth,l.width,'complete display width reaches each port');near(d.visibleWidth,l.width,'same display width for ribbon and port');
   assert.ok(l.width>=minimum-1e-7&&l.width>=l.actualWidth-1e-7,'minimum and monetary lower bounds are respected');
   assert.deepEqual(d.ports,[a,b]);
   const outline=polygonFromPath(d.area);
   assert.equal((d.area.match(/C/g)||[]).length,2,'standard cubic boundaries, not a local taper envelope');
   assert.equal(outline.length,2*(CUBIC_STEPS+1),'both cubic boundaries are sampled completely');
   for(let i=0;i<=CUBIC_STEPS;i++){
    const t=i/CUBIC_STEPS,upper=outline[i],lower=outline[outline.length-1-i];
    const x=cubic(a.x,xm,xm,b.x,t),y=cubic(a.y,a.y,b.y,b.y,t);
    near(upper[0],x,'upper boundary follows the actual cubic x');near(lower[0],x,'lower boundary follows the actual cubic x');
    near(upper[1],y-l.width/2,'complete upper display boundary');near(lower[1],y+l.width/2,'complete lower display boundary');
    near(lower[1]-upper[1],l.width,'constant vertical display thickness, including both endpoints');
   }
   if(l.width>l.actualWidth+1e-7){enhancedCurves++;if(Math.abs(a.y-b.y)>1)enhancedBentSections++;}
  }
 }
 assert.ok(enhancedCurves>0);assert.ok(enhancedBentSections>0,'enhancement is verified on actual bends, not only horizontal links');
});

// Rebuild the full conserved layout for each minimum. Calling geometry with a
// minimum alone cannot exercise display allocation, node sizing, or port packing.
const standardCases=cases.filter(([name])=>['official report','adjacent gain and expense groups','main chain without separate income'].includes(name));
for(const [name,text,chain] of standardCases)test(`${name}: unrelated filled ribbons do not overlap at minima 0, 2, 4, 6 or after branch reordering`,()=>{
 const ids=analyzeLinks(parseText(text)).nodes.map(n=>n.id);
 for(const order of [[],[...ids].reverse()]){
  for(const minimum of [0,2,4,6]){
   const g=make(text,chain,order,minimum);
   const shapes=g.links.map(l=>({link:l,shape:polygon(polygonFromPath(financialLinkGeometry(l).area))}));
   for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){
    const a=shapes[i],b=shapes[j];
    if([a.link.source,a.link.target].some(n=>n===b.link.source||n===b.link.target))continue;
    const reason=overlap(a.shape,b.shape);
    assert.equal(reason,null,`${name}, min ${minimum}, ${order.length?'reversed':'default'}: unrelated ${label(a.link)} overlaps ${label(b.link)} (${reason}); tolerance ${TOLERANCE} px`);
   }
  }
 }
});

// Shared-node pairs used to be skipped. Full-width display ports must meet
// continuously without either ribbon occupying its adjacent display ribbon.
for (const [name,text,chain] of [
 ['tiny gain into large main','s,r,10000\nr,p,9999\nr,c,1\ng,p,1\np,n,10000',['r','p','n']],
 ['adjacent tiny gains and deductions','s,r,10000\nr,p,9998\nr,c,1\nr,d,1\ng,p,1\nh,p,1\np,n,10000',['r','p','n']],
 ['renamed semantic-free data','x,a,10000\na,b,9998\na,u,1\na,v,1\ny,b,1\nz,b,1\nb,k,10000',['a','b','k']]
]) test(`${name}: shared junction enhanced envelopes do not overlap`,()=>{
 const ids=analyzeLinks(parseText(text)).nodes.map(n=>n.id);
 for(const order of [[],[...ids].reverse()]){
  for(const minimum of [0,2,4,6]){
   const g=make(text,chain,order,minimum);
   const shapes=g.links.map(l=>({link:l,shape:polygon(polygonFromPath(financialLinkGeometry(l).area))}));
   for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){
    const a=shapes[i],b=shapes[j];
    if(a.link.source!==b.link.source&&a.link.target!==b.link.target)continue;
    assert.equal(overlap(a.shape,b.shape),null,`${name} min${minimum}: ${label(a.link)} / ${label(b.link)}`);
   }
  }
 }
});
