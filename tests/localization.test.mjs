import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../src/examples/registry.js';
import {presentReport,localizeDiagnostic} from '../src/browser/presentation.js';
import {layoutFinancialGraph} from '../src/core/layout.js';
import {renderSvg} from '../src/core/render-svg.js';
import {svgBlob} from '../src/browser/export.js';
import {JSDOM} from 'jsdom';
import {financeDocument,DEFAULT_CONFIG} from '../src/browser/project.js';
const han=/[\p{Script=Han}]/u;
const semantics=report=>report.nodes.map(({label:_label,...node})=>node);
for(const sample of EXAMPLES)test(`${sample.id}: English display and exported SVG preserve source data`,async()=>{
 const before=JSON.stringify(sample.document),view=presentReport(sample.document,{lang:'en'});
 assert.deepEqual(view.links,sample.document.links);assert.deepEqual(semantics(view),semantics(sample.document));
 assert.equal(view.metadata.source.url,sample.document.metadata.source.url);
 const diagram=layoutFinancialGraph(view,{lang:'en'}),svg=renderSvg(diagram,{interactive:true});
 const doc=new JSDOM(svg,{contentType:'image/svg+xml'}).window.document;
 assert.equal(han.test(doc.documentElement.textContent),false,doc.documentElement.textContent);
 assert.match(doc.documentElement.getAttribute('aria-label'),/flows/);
 const exported=await svgBlob(diagram).text();assert.match(exported,/Liuzhang/);
 assert.equal(JSON.stringify(sample.document),before);
 assert.equal(presentReport(sample.document,{lang:'zh'}).metadata.title,sample.document.metadata.title);
});
test('custom titles, node labels, provenance and notes are never translated',()=>{
 const report=structuredClone(EXAMPLES[0].document);
 report.nodes[0].label='营业收入';report.metadata.title='毛利润';report.metadata.source.title='客户来源 / my source';
 report.notes=['客户说明 / user notes'];
 const view=presentReport(report,{lang:'en'});
 assert.deepEqual(view,report);
 const renamed=structuredClone(EXAMPLES[0].document);renamed.metadata.title='净利润';
 assert.equal(presentReport(renamed,{lang:'en'}).metadata.title,'净利润');
});
test('diagnostics keep supplied node names, row numbers and amounts in one language',()=>{
 assert.match(localizeDiagnostic('第 4 行金额不是有效数字。请不要包含货币符号、百分号或单位。','en'),/Row 4/);
 assert.equal(localizeDiagnostic('links[2]: 报告值 8 与明细计算值 9 不一致；不会自动补差 / reported total does not match calculated total; no balancing item is inserted.','en'),'links[2]: reported total 8 differs from calculated total 9. No balancing item is inserted.');
 assert.equal(localizeDiagnostic('「客户收入」流向自身，请修改。','en'),'“客户收入” flows to itself. Change this link.');
 assert.equal(localizeDiagnostic('Choose a JSON project file.','zh'),'请选择 JSON 项目文件。');
});

test('quick-form defaults and generated accounting labels follow the interface',()=>{
 const finance={revenue:100,cost:40,sales:5,rnd:4,admin:3,finance:2,tax:1};
 const report=financeDocument(finance,DEFAULT_CONFIG),view=presentReport(report,{lang:'en',finance:true});
 const svg=renderSvg(layoutFinancialGraph(view,{lang:'en'}));
 const doc=new JSDOM(svg,{contentType:'image/svg+xml'}).window.document;
 assert.equal(han.test(doc.documentElement.textContent),false,doc.documentElement.textContent);
 assert.deepEqual(view.links,report.links);
});
