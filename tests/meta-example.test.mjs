import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {EXAMPLES,DEFAULT_EXAMPLE} from '../src/examples/registry.js';
import {normalizeInput,layoutFinancialGraph,generateSvg} from '../src/core/index.js';
import {financialLinkGeometry} from '../src/core/top-layout.js';
import {projectFromDocument,restoreProject,resolveDocument} from '../src/browser/project.js';
const sample=EXAMPLES.find(x=>x.id==='meta-2026-q3').document;
test('Meta official quarter reconciles without subtotal or litigation double counting',()=>{
 const r=normalizeInput(sample); assert.equal(r.balanced,true);assert.equal(r.nodes.length,14);assert.equal(r.links.length,13);
 const d=layoutFinancialGraph(r);assert.equal(d.rail.applied,true);
 const totals={revenue:64601,gross:51232,operating:12988,pretax:13001,net:9860};
 for(const [id,v] of Object.entries(totals))assert.equal(d.graph.nodes.find(n=>n.id===id).value,v);
 assert.deepEqual(r.links.filter(l=>l.target==='revenue').map(l=>l.value),[63061,1097,443]);
 assert.equal(r.links.find(l=>l.target==='admin').value,14857);assert.equal(r.links.filter(l=>l.value===9890||l.value===64158).length,0);
 assert.match(r.metadata.source.notes,/已含诉讼费用 9,890/);assert.match(r.metadata.source.url,/investor.atmeta.com/);
 assert.equal(r.metadata.period,'2026 Q3');assert.equal(r.metadata.currency,'USD');assert.equal(r.metadata.unit,'百万美元');assert.equal(r.metadata.source.publishedAt,'2026-10-21');
});
test('Meta conserves display flow at complete node edges while retaining true monetary widths',()=>{
 const normalized=normalizeInput(sample),source=JSON.stringify(normalized),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 for(const minWidth of [0,2,4,6]){
  const d=layoutFinancialGraph(normalized,{minWidth});
  for(const n of d.graph.nodes){
   near(n.y1-n.y0,n.displayHeight);
   if(minWidth===0)near(n.displayHeight,n.value*d.rail.scale);
   for(const [links,port] of [[n.targetLinks,'port1'],[n.sourceLinks,'port0']])if(links.length){
    let y=n.y0;
    for(const l of links){near(l[port].y-l.width/2,y);near(l.actualWidth,l.value*d.rail.scale);assert.ok(l.width>=minWidth-1e-7);y+=l.width;}
    near(y,n.y1);
   }
  }
  for(const l of d.graph.links.filter(l=>l.source.role==='main'&&l.target.role==='main'))near(l.port0.y-l.width/2,l.source.y0);
  const gain=d.graph.links.find(l=>l.source.id==='other-gain'),g=financialLinkGeometry(gain);
  assert.equal(gain.value,13);assert.ok(gain.actualWidth<.04);
  near(gain.width,minWidth||gain.actualWidth);near(g.visibleWidth,gain.width);near(g.portWidth,gain.width);near(g.actualWidth,gain.actualWidth);
  const p=g.area.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number);
  near(p[1],gain.port0.y-gain.width/2);near(p[7],gain.port1.y-gain.width/2);
  near(p[9],gain.port1.y+gain.width/2);near(p[15],gain.port0.y+gain.width/2);
 }
 assert.equal(JSON.stringify(normalized),source,'every mode leaves the normalized source untouched');
});
test('Meta solid and gradient exports retain values and source without drawing-instruction footnotes',()=>{
 for(const ribbon of ['solid','gradient']){const svg=generateSvg(sample,{ribbon}),doc=new JSDOM(svg,{contentType:'image/svg+xml'}).window.document;assert.equal(doc.querySelectorAll('.sankey-link').length,13);assert.match(doc.documentElement.textContent,/利息及其他净收益 → 税前利润：13 百万美元/);assert.doesNotMatch(svg,/宽度非严格同比例|主链输出上沿对齐|端口自然分合/);assert.match(doc.documentElement.textContent,/Meta-Reports-Third-Quarter-2026-Results/);assert.equal(!!doc.querySelector('linearGradient'),ribbon==='gradient');}
 assert.doesNotMatch(generateSvg(sample,{minWidth:0}),/宽度非严格同比例/);
});
test('Meta projects round-trip while existing SpaceX remains default',()=>{const p=projectFromDocument(sample,{palette:'sunrise',ribbon:'gradient'}),restored=restoreProject(JSON.parse(JSON.stringify(p)));assert.equal(resolveDocument(restored).balanced,true);assert.equal(restored.config.palette,'sunrise');assert.equal(restored.config.ribbon,'gradient');assert.deepEqual(restored.document.links,p.document.links);assert.equal(DEFAULT_EXAMPLE.id,'spacex-2026-q3');});

test("Meta export labels avoid isolated characters and fit left margin",()=>{const doc=new JSDOM(generateSvg(sample),{contentType:"image/svg+xml"}).window.document; const labels=id=>[...doc.querySelectorAll(`.sankey-node[data-node="${id}"] text`)].map(n=>n.textContent);assert.deepEqual(labels("other-gain"),["利息及其他","净收益","13"]);assert.deepEqual(labels("apps-other"),["其他应用收入","1,097"]);});
