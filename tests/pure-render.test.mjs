import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
import {DEFAULT_EXAMPLE} from '../src/examples/registry.js';import {layoutFinancialGraph} from '../src/core/layout.js';import {renderSvg} from '../src/core/render-svg.js';
const sample=DEFAULT_EXAMPLE.document;
function snapshot(svg){const d=new JSDOM(svg,{contentType:'image/svg+xml'}).window.document;return {viewBox:d.documentElement.getAttribute('viewBox'),nodes:[...d.querySelectorAll('.sankey-node')].map(n=>({label:n.getAttribute('aria-label'),rect:['x','y','width','height','rx'].map(k=>n.querySelector('rect').getAttribute(k)),texts:[...n.querySelectorAll('text')].map(t=>({text:t.textContent,x:t.getAttribute('x'),y:t.getAttribute('y')}))})),links:[...d.querySelectorAll('.sankey-link')].map(n=>Object.fromEntries(['d','fill','data-source','data-target','data-actual-width','data-visible-width','data-ports'].map(k=>[k,n.getAttribute(k)]))) };}
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
function strictFixture(){
 const expected=JSON.parse(readFileSync(new URL('./fixtures/v10-geometry.json',import.meta.url)));
 // The v10 fixture stored minimum-4 appearance with true-size nodes and ports.
 // Derive only its enhanced ribbon's strict outline from that stored true data.
 for(const link of expected.links){
  const w=Number(link['data-actual-width']);
  if(w<Number(link['data-visible-width'])){
   const [a,b]=JSON.parse(link['data-ports']),xm=(a.x+b.x)/2;
   link.d=`M${a.x},${a.y-w/2}C${xm},${a.y-w/2} ${xm},${b.y-w/2} ${b.x},${b.y-w/2}L${b.x},${b.y+w/2}C${xm},${b.y+w/2} ${xm},${a.y+w/2} ${a.x},${a.y+w/2}Z`;
  }
  link['data-visible-width']=link['data-actual-width'];
 }
 return expected;
}
function geometricSnapshot(s){
 const rounded=n=>Number(Number(n).toFixed(8));
 return {...s,nodes:s.nodes.map(n=>({...n,rect:n.rect.map(rounded),texts:n.texts.map(t=>({...t,x:rounded(t.x),y:rounded(t.y)}))})),links:s.links.map(l=>({...l,
  d:l.d.match(/[MLCHVZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(x=>/^[A-Z]$/.test(x)?x:rounded(x)),
  'data-actual-width':rounded(l['data-actual-width']),'data-visible-width':rounded(l['data-visible-width']),
  'data-ports':JSON.parse(l['data-ports']).map(p=>({...p,x:rounded(p.x),y:rounded(p.y)}))
 }))};
}
test('strict zero preserves the v10 monetary node, label, port and ribbon snapshot',()=>{
 const actual=snapshot(renderSvg(layoutFinancialGraph(sample,{minWidth:0})));
 assert.deepEqual(geometricSnapshot(actual),geometricSnapshot(strictFixture()));
});
test('financial and auto modes export complete conserved display ports across minima and ribbon styles',()=>{
 const original=JSON.stringify(sample);
 for(const layout of ['financial','auto']){
  const strict=layoutFinancialGraph(sample,{layout,minWidth:0});
  const trueWidths=new Map(strict.graph.links.map(l=>[`${l.source.id}→${l.target.id}`,l.actualWidth]));
  const amounts=new Map(strict.graph.links.map(l=>[`${l.source.id}→${l.target.id}`,l.value]));
  const scale=strict.graph.links[0].actualWidth/strict.graph.links[0].value;
  for(const minWidth of [0,2,4,6,4])for(const ribbon of ['solid','gradient']){
   const options={layout,minWidth,ribbon},d=layoutFinancialGraph(sample,options),svg=renderSvg(d);
   assert.equal(renderSvg(layoutFinancialGraph(sample,options)),svg,'repeated renders and mode toggles are idempotent');
   for(const l of d.graph.links){
    const key=`${l.source.id}→${l.target.id}`;
    assert.equal(l.value,amounts.get(key));near(l.actualWidth,trueWidths.get(key),'monetary width is independent of display mode');
    assert.ok(l.width>=Math.max(l.actualWidth,minWidth)-1e-7);
    if(minWidth===0)near(l.width/l.value,scale,'strict mode keeps a single monetary ratio');
   }
   const doc=new JSDOM(svg,{contentType:'image/svg+xml'}).window.document;
   assert.equal(!!doc.querySelector('linearGradient'),ribbon==='gradient');
   const paths=[...doc.querySelectorAll('.sankey-link')];
   for(const n of d.graph.nodes){
    const rect=[...doc.querySelectorAll('.sankey-node')].find(g=>g.dataset.node===n.id).querySelector('rect');
    near(Number(rect.getAttribute('height')),n.displayHeight,'exported node uses the conserved display height');
    for(const [links,key,index] of [[n.sourceLinks,'source',0],[n.targetLinks,'target',1]])if(links.length){
     const attached=paths.filter(p=>p.dataset[key]===n.id).sort((a,b)=>JSON.parse(a.dataset.ports)[index].y-JSON.parse(b.dataset.ports)[index].y);
     let y=Number(rect.getAttribute('y'));
     for(const p of attached){const port=JSON.parse(p.dataset.ports)[index],width=Number(p.dataset.visibleWidth);near(Number(p.dataset.portWidth),width,'visible and port width match');near(port.y-width/2,y,'rendered port begins at previous boundary');y+=width;}
     near(y,Number(rect.getAttribute('y'))+Number(rect.getAttribute('height')),'rendered ports fill the node completely');
    }
   }
  }
 }
 assert.equal(JSON.stringify(sample),original,'rendering never mutates the source document');
});
test('pure pipeline is immutable and role-driven after every label and id changes',()=>{const before=JSON.stringify(sample),renamed=structuredClone(sample),ids=new Map(renamed.nodes.map((n,i)=>[n.id,'opaque-'+i]));renamed.nodes.forEach((n,i)=>{n.id=ids.get(n.id);n.label='Company account '+i});renamed.links.forEach(l=>{l.source=ids.get(l.source);l.target=ids.get(l.target)});renamed.mainChain=renamed.mainChain.map(x=>ids.get(x));renamed.order=renamed.order.map(x=>ids.get(x));const a=layoutFinancialGraph(sample),b=layoutFinancialGraph(renamed);assert.deepEqual(a.graph.nodes.map(n=>[n.x0,n.y0,n.y1]),b.graph.nodes.map(n=>[n.x0,n.y0,n.y1]));const colors=s=>[...new JSDOM(s,{contentType:'image/svg+xml'}).window.document.querySelectorAll('.sankey-link')].map(n=>n.getAttribute('fill'));assert.deepEqual(colors(renderSvg(a)),colors(renderSvg(b)));assert.equal(JSON.stringify(sample),before);});
test('export is DOM-free, escapes content, and omits interactive hit areas',()=>{const x=structuredClone(sample);x.metadata.title='<script>&bad';x.nodes[0].label='<img onerror=x>';const svg=renderSvg(layoutFinancialGraph(x));assert.match(svg,/&lt;script&gt;&amp;bad/);assert.doesNotMatch(svg,/<script|<img|class="flow-hit"/);assert.match(renderSvg(layoutFinancialGraph(x),{interactive:true}),/class="flow-hit"/);});
