import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {DEFAULT_EXAMPLE} from '../src/examples/registry.js';import {initialProject,restoreProject,resolveDocument} from '../src/browser/project.js';import {generateSvg,normalizeInput} from '../src/core/index.js';
test('a saved project round-trips with its style and data intact',()=>{
 const p=initialProject();
 const styled={...p,config:{...p.config,palette:'warm',ribbon:'gradient',layout:'auto',layoutExplicit:true}};
 const restored=restoreProject(JSON.parse(JSON.stringify(styled)));
 assert.equal(restored.config.palette,'warm');
 assert.equal(restored.config.layout,'auto');
 assert.equal(restored.config.ribbon,'gradient');
 assert.deepEqual(resolveDocument(restored).links,DEFAULT_EXAMPLE.document.links);
 assert.deepEqual(restoreProject(JSON.parse(JSON.stringify(restored))),restored,'a second round-trip is a fixed point');
});
test('a project built from plain text never acquires sample semantics or provenance',()=>{
 const p=restoreProject({schema:'liuzhang.sankey',version:2,text:'SpaceX,净利润,42',config:{palette:'jade',layout:'auto'}});
 const d=resolveDocument(p);
 assert.equal(d.metadata.source,undefined);
 assert.equal(d.mainChain.length,0);
 assert.equal(d.nodes[1].role,'other');
});
test('editing values clears provenance; editing denomination removes source without conversion',()=>{const p=initialProject();p.text=p.text.replace('1767','1700');p.document=null;const d=resolveDocument(p);assert.equal(d.metadata.source,undefined);assert.equal(d.balanced,false);const q=initialProject();q.config.currency='CNY';const x=resolveDocument(q);assert.equal(x.metadata.source,undefined);assert.deepEqual(x.links,DEFAULT_EXAMPLE.document.links);});
test('all positive and loss fixtures produce finite standalone SVG or an explicit no-flow error',()=>{for(const name of ['positive-income','tax-benefit-income','loss-income','renamed-income','decimal-income','all-zero-income','absent-metrics-income','zero-adjustment-income']){const x=JSON.parse(readFileSync(new URL('../fixtures/'+name+'.json',import.meta.url)));const report=normalizeInput(x);if(!report.links.some(l=>l.value>0)){assert.throws(()=>generateSvg(x),/零|没有/);continue}const svg=generateSvg(x);assert.match(svg,/<svg/);assert.doesNotMatch(svg,/NaN|Infinity/);if(report.nodes.some(n=>n.role==='main'&&n.signedValue<0))assert.match(svg,/非现金/);}});
test('exact small imbalance must still block layout export despite generic tolerance',()=>{const d=structuredClone(DEFAULT_EXAMPLE.document);d.links[0].value+=.0000001;assert.throws(()=>generateSvg(d),/Unbalanced/);});
test('CLI renders outside browser with gradient and proportional controls',()=>{const out=join(mkdtempSync(join(tmpdir(),'liuzhang-')),'chart.svg');execFileSync(process.execPath,['scripts/render-financial.mjs','examples/spacex-2026-q3.json','--output',out,'--gradient','--strict-width'],{cwd:new URL('..',import.meta.url)});const s=readFileSync(out,'utf8');assert.match(s,/<linearGradient/);assert.doesNotMatch(s,/宽度非严格同比例/);});
