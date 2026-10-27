import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {EXAMPLES,DEFAULT_EXAMPLE} from '../src/examples/registry.js';
import {normalizeInput,layoutFinancialGraph,generateSvg} from '../src/core/index.js';
import {projectFromDocument,restoreProject} from '../src/browser/project.js';

const sample=EXAMPLES.find(x=>x.id==='anthropic-2026-h1').document;

test('Anthropic S-1 half-year reconciles to the filed operating loss',()=>{
 const r=normalizeInput(sample);
 assert.equal(r.balanced,true);
 assert.equal(r.nodes.length,9);assert.equal(r.links.length,8);
 assert.equal(r.metadata.period,'2026 H1（2026-01-01 至 2026-06-30）');
 assert.equal(r.metadata.currency,'USD');assert.equal(r.metadata.unit,'百万美元');
 assert.equal(r.metadata.source.publishedAt,'2026-10-26');
 assert.match(r.metadata.source.url,/sec\.gov\/Archives\/edgar\/data\/2130357/);
 // Revenue components are the S-1 Note 2 consumption/subscription split.
 assert.deepEqual(r.links.filter(l=>l.target==='revenue').map(l=>l.value),[13064,3222]);
 // Four operating expense lines sum to the filed total operating expenses.
 assert.deepEqual(r.links.filter(l=>l.target==='compute').map(l=>l.value),[8945]);
 assert.deepEqual(r.links.filter(l=>l.source==='cost-pool').map(l=>l.value),[8945,3152,3168,1714]);
 const poolIn=r.links.filter(l=>l.target==='cost-pool').reduce((s,l)=>s+l.value,0);
 assert.equal(poolIn,16979,'16,286 revenue + 693 deficit must equal total operating expenses');
 const op=r.nodes.find(n=>n.id==='operating');
 assert.equal(op.role,'loss');assert.equal(op.signedValue,-693);
 // Revenue never gets inflated to absorb the deficit.
 assert.equal(r.nodes.find(n=>n.id==='revenue').signedValue,16286);
});

test('Anthropic graph draws the non-cash deficit as a labelled balance, not invented revenue',()=>{
 const svg=generateSvg(sample);const doc=new JSDOM(svg,{contentType:'image/svg+xml'}).window.document;
 assert.equal(doc.querySelectorAll('.sankey-link').length,8);
 const text=doc.documentElement.textContent;
 assert.match(text,/营业收入 → 成本计算池：16,286 百万美元/);
 assert.match(text,/营业亏损（差额） → 成本计算池：693 百万美元/);
 // The 72,388 fair-value swing is deliberately excluded and must not appear as a flow.
 assert.doesNotMatch(text,/72,388 百万美元/);
 assert.match(text,/72,388/,'footnote still discloses the excluded non-cash item');
 assert.match(text,/Anthropic, PBC Form S-1/);
});

test('Anthropic keeps every label on one line and inside the canvas',()=>{
 const doc=new JSDOM(generateSvg(sample),{contentType:'image/svg+xml'}).window.document;
 for(const node of doc.querySelectorAll('.sankey-node')){
  const texts=[...node.querySelectorAll('text')].map(n=>n.textContent);
  assert.ok(texts.length<=2,`${node.dataset.node} wrapped to ${texts.length} lines`);
  for(const t of texts)assert.doesNotMatch(t,/[（(]$/,'no dangling opening bracket');
 }
});

test('Anthropic projects round-trip and leaves SpaceX as the default sample',()=>{
 const p=projectFromDocument(sample,{palette:'jade',ribbon:'gradient'});
 const restored=restoreProject(JSON.parse(JSON.stringify(p)));
 assert.equal(restored.config.palette,'jade');
 assert.equal(restored.config.ribbon,'gradient');
 assert.deepEqual(restored.document.links,p.document.links);
 assert.equal(DEFAULT_EXAMPLE.id,'spacex-2026-q3');
});

test('Anthropic uses automatic layout because a loss clears the financial rail',()=>{
 const d=layoutFinancialGraph(normalizeInput(sample));
 // A loss bridge has no positive main chain, so no rail object is produced at all.
 assert.equal(d.rail,null);
 assert.equal(d.graph.nodes.reduce((s,n)=>s+(n.value||0),0)>0,true);
});
