import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {normalizeInput, layoutFinancialGraph, generateSvg} from '../src/core/index.js';
import {EXAMPLES} from '../src/examples/registry.js';
const fallback=JSON.parse(readFileSync(new URL('./fixtures/display-fallback-dag.json',import.meta.url)));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function check(d,min){
 for(const l of d.graph.links){assert.ok(l.width>=min-1e-9);assert.ok(l.width>=l.actualWidth-1e-9);assert.ok(Number.isFinite(l.width));}
 for(const n of d.graph.nodes)for(const [links,key] of [[n.targetLinks,'port1'],[n.sourceLinks,'port0']])if(links.length){let y=n.y0;for(const l of links){near(l[key].y-l.width/2,y);y+=l.width;}near(y,n.y1);}
 const stats=d.rail?.display??d.graph.display;assert.ok(stats.residual<=1e-7);assert.ok(stats.iterations<=2000);
}
test('display optimizer packs full minimum-width ports and never changes monetary input',()=>{
 for(const example of EXAMPLES)for(const min of [0,2,4,6]){
  const input=example.document,before=JSON.stringify(input),d=layoutFinancialGraph(input,{minWidth:min});check(d,min);assert.equal(JSON.stringify(input),before);
  // A loss bridge has no positive main chain and therefore no rail object, but
  // monetary proportionality is a property of the drawing either way: every
  // link must share one scale, which the rail merely pre-computes.
  const scaled=d.graph.links.filter(l=>l.value>0);
  assert.ok(scaled.length>0,`${example.id} draws no positive flow`);
  const scale=scaled[0].actualWidth/scaled[0].value;
  if(d.rail)assert.ok(Math.abs(scale-d.rail.scale)<1e-7,'geometry scale matches the rail scale');
  for(const l of scaled)near(l.actualWidth,l.value*scale);
  for(const link of d.graph.links.filter(l=>l.value===0))assert.equal(link.actualWidth,0);
  if(!min)for(const n of d.graph.nodes)near(n.y1-n.y0,n.value*scale);
 }
});
test('previous nonconvergent DAG uses bounded conservative path fallback',()=>{
 for(const min of [2,4,6]){const d=layoutFinancialGraph(normalizeInput(fallback),{minWidth:min});check(d,min);assert.equal(d.graph.display.method,'conservative-paths');assert.ok(!/NaN|Infinity/.test(generateSvg(fallback,{minWidth:min})));}
});
test('repeated layout and mode toggles do not accumulate pixels; IDs and labels are irrelevant',()=>{
 const input=normalizeInput(fallback),config={minWidth:4},geometry=d=>({nodes:d.graph.nodes.map(n=>[n.x0,n.y0,n.y1]),links:d.graph.links.map(l=>[l.width,l.port0.y,l.port1.y])});
 const initial=geometry(layoutFinancialGraph(input,config));layoutFinancialGraph(input,{minWidth:0});assert.deepEqual(geometry(layoutFinancialGraph(input,config)),initial);
 const renamed=structuredClone(input),ids=new Map(renamed.nodes.map((n,i)=>[n.id,`changed-${i}`]));renamed.nodes.forEach(n=>{n.id=ids.get(n.id);n.label='Renamed'});renamed.links.forEach(l=>{l.source=ids.get(l.source);l.target=ids.get(l.target)});renamed.order=(renamed.order??[]).map(id=>ids.get(id));
 assert.deepEqual(geometry(layoutFinancialGraph(renamed,config)),initial);
});
test('supported 80-node 200-edge DAG stays finite and conservative within bounded runtime',()=>{
 const nodes=Array.from({length:80},(_,i)=>({id:`n${i}`,label:`Test ${i}`,role:'other'})),links=[];let values=Array.from({length:16},(_,i)=>i?10000:1e9);
 for(let layer=0;layer<4;layer++){
  const next=Array(16).fill(0);
  for(let i=0;i<16;i++){const count=i<2?4:3,minor=Math.max(1,Math.floor(values[i]/1000)),weights=Array.from({length:count},(_,k)=>k?minor:values[i]-minor*(count-1));weights.forEach((value,k)=>{const target=(i+k)%16;links.push({source:`n${layer*16+i}`,target:`n${(layer+1)*16+target}`,value});next[target]+=value;});}values=next;
 }
 const input={schema:'liuzhang.financial',version:1,metadata:{title:'Synthetic upper-limit test',period:'Test',currency:'USD',unit:'million'},nodes,links,mainChain:[]};
 assert.equal(links.length,200);const start=performance.now();for(const min of [0,2,4,6])check(layoutFinancialGraph(normalizeInput(input),{minWidth:min}),min);
 assert.ok(performance.now()-start<5000,'four layouts stay under a five-second regression budget');
});
