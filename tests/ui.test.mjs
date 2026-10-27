import test from 'node:test';
import {renderSvg} from '../src/core/render-svg.js';
import {layoutFinancialGraph} from '../src/core/layout.js';
import {normalizeInput} from '../src/core/financial-data.js';
import {EXAMPLES} from '../src/examples/registry.js';
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');const dom=new JSDOM(html,{url:'https://local.example/'});
for(const key of ['window','document','localStorage','XMLSerializer','innerWidth','innerHeight'])globalThis[key]=dom.window[key];
globalThis.URL.createObjectURL=()=> 'blob:test';globalThis.URL.revokeObjectURL=()=>{};
await import('../src/app.js');const $=id=>document.getElementById(id);const click=id=>$(id).click();const fill=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new dom.window.Event('input'));};
test('initial official report metrics, vector paths and source',()=>{assert.equal($('summary'),null);assert.equal(document.querySelectorAll('.sankey-link').length,16);assert.equal($('demo-badge').textContent,'含来源');assert.equal($('svg-btn').disabled,false);assert.equal($('source-card').hidden,false);assert.match($('sankey').textContent,/www.sec.gov/);assert.match($('sankey').textContent,/所得税收益 390 计为流入/);});
test('new reference theme has solid semantic ribbons and white export background',()=>{assert.equal($('palette-name').textContent,'清朗');assert.equal($('sankey').querySelector('linearGradient'),null);assert.equal($('sankey').firstElementChild.getAttribute('fill'),'#ffffff');assert.deepEqual(new Set([...document.querySelectorAll('.sankey-link')].map(p=>p.getAttribute('fill'))),new Set(['#61778d','#1167d9','#ea5b0c','#07985b']));});
test('palette and ribbon are independent controls without changing data',()=>{const text=$('data-text').value;document.querySelector('[data-palette=sunrise]').click();assert.equal($('palette-name').textContent,'晴日');$('ribbon-input').value='gradient';$('ribbon-input').dispatchEvent(new dom.window.Event('change'));assert.ok($('sankey').querySelector('linearGradient'));document.querySelector('[data-palette=clear]').click();assert.equal($('data-text').value,text);assert.ok($('sankey').querySelector('linearGradient'));$('ribbon-input').value='solid';$('ribbon-input').dispatchEvent(new dom.window.Event('change'));});
test('rendered main nodes share their tops and use continuously packed left/right cubic ports',()=>{
 assert.equal($('sankey').dataset.layout,'financial');const top=Number($('sankey').dataset.baseline);
 const nodes=[...document.querySelectorAll('.sankey-node')],links=[...document.querySelectorAll('.sankey-link')];
 const rect=id=>nodes.find(n=>n.getAttribute('aria-label').startsWith(`选择${id}，`)).querySelector('rect');
 const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
 const main=[...document.querySelectorAll('[data-junction-role=main]')];assert.equal(main.length,6);
 for(const p of main){
  assert.equal(Number(p.dataset.railTop),top);assert.equal(Number(p.getAttribute('y')),top);
  assert.equal(p.tagName,'rect');assert.equal(p.getAttribute('rx'),'0');
  assert.ok(Number(p.getAttribute('height'))>=Number(p.dataset.junctionValue)*180/14575-1e-7,'display nodes never shrink monetary height');
  assert.ok(Number(p.getAttribute('width'))>0&&Number(p.getAttribute('width'))<=24,'narrow main rectangle');
 }
 assert.equal(document.querySelectorAll('.sankey-node polygon').length,0);
 let bentMain=0;
 for(const p of links){
  const [a,b]=JSON.parse(p.dataset.ports),source=rect(p.dataset.source),target=rect(p.dataset.target),w=Number(p.dataset.visibleWidth);
  assert.equal(a.edge,'right');assert.equal(b.edge,'left');
  near(a.x,Number(source.getAttribute('x'))+Number(source.getAttribute('width')),'source right edge');near(b.x,Number(target.getAttribute('x')),'target left edge');
  if(p.dataset.railMiddle){const m=JSON.parse(p.dataset.railMiddle);near(m.y0,top,'main output upper boundary');near(a.y-w/2,top,'main output port top');near(m.y1,b.y-w/2,'target upper boundary');if(m.y1>top)bentMain++;}
 }
 assert.ok(bentMain>0,'gain merges visibly bend the target-side main inflow');
 for(const n of nodes)for(const [side,key,index] of [['right','source',0],['left','target',1]]){
  const attached=links.filter(p=>n.getAttribute('aria-label').startsWith(`选择${p.dataset[key]}，`));if(!attached.length)continue;
  const r=n.querySelector('rect');let edge=Number(r.getAttribute('y'));
  for(const p of attached.sort((a,b)=>JSON.parse(a.dataset.ports)[index].y-JSON.parse(b.dataset.ports)[index].y)){
   const port=JSON.parse(p.dataset.ports)[index],w=Number(p.dataset.visibleWidth);near(port.y-w/2,edge,`${side} ports meet continuously`);edge=port.y+w/2;
  }
  near(edge,Number(r.getAttribute('y'))+Number(r.getAttribute('height')),`${side} fills complete display node height`);
 }
 for(const hit of document.querySelectorAll('.flow-hit')){assert.equal((hit.getAttribute('d').match(/C/g)||[]).length,1);assert.doesNotMatch(hit.getAttribute('d'),/[AHVQS]/,'natural cubic, no pipe route');}
 document.querySelector('.sankey-node[aria-label^="选择营业收入"]').dispatchEvent(new dom.window.Event('click'));assert.ok($('node-up').disabled);assert.ok($('node-down').disabled);click('node-close');
});
test('amount labels belong to the correct flow and use its actual cubic midpoint',()=>{
 $('link-labels-input').checked=true;$('link-labels-input').dispatchEvent(new dom.window.Event('change'));
 const links=[...document.querySelectorAll('.sankey-link')],labels=[...document.querySelectorAll('[data-flow-label]')],hits=[...document.querySelectorAll('.flow-hit')];
 assert.equal(labels.length,links.filter(p=>Number(p.dataset.visibleWidth)>14).length);assert.ok(labels.length>0);
 const cubic=(a,b,c,d)=>a/8+3*b/8+3*c/8+d/8;
 for(const text of labels){
  const path=links.find(p=>p.dataset.link===text.dataset.flowLabel);assert.ok(path,'each label owns an existing link');
  assert.equal(text.dataset.source,path.dataset.source);assert.equal(text.dataset.target,path.dataset.target);
  const hit=hits.find(p=>p.getAttribute('aria-label').startsWith(`${text.dataset.source} → ${text.dataset.target}，`));assert.ok(hit);
  const q=hit.getAttribute('d').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number);assert.equal(q.length,8);
  assert.ok(Math.abs(Number(text.getAttribute('x'))-cubic(q[0],q[2],q[4],q[6]))<1e-7,'label at cubic midpoint x');
  assert.ok(Math.abs(Number(text.getAttribute('y'))-5-cubic(q[1],q[3],q[5],q[7]))<1e-7,'label baseline centers on its cubic, not the node top');
  assert.equal(text.textContent,path.querySelector('title').textContent.split('：')[1].split(' ')[0],'amount belongs to this exact source and target');
 }
 $('link-labels-input').checked=false;$('link-labels-input').dispatchEvent(new dom.window.Event('change'));assert.equal(document.querySelectorAll('[data-flow-label]').length,0);
});
test('minimum-width control conserves complete display ports without changing amounts and restores strict proportion',()=>{
 const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
 const links=()=>[...document.querySelectorAll('.sankey-link')];
 const tiny=()=>links().find(n=>n.dataset.target==='重组费用');
 const nodeGeometry=()=>[...document.querySelectorAll('.sankey-node rect')].map(n=>['x','y','width','height'].map(k=>n.getAttribute(k)));
 const amounts=()=>links().map(n=>[n.dataset.source,n.dataset.target,n.dataset.actualWidth,n.querySelector('title').textContent]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const nodeAmounts=()=>[...document.querySelectorAll('.sankey-node')].map(n=>n.getAttribute('aria-label'));
 const originalText=$('data-text').value,originalNodes=nodeGeometry(),originalAmounts=amounts(),originalNodeAmounts=nodeAmounts(),snapshots=new Map();
 assert.equal(Number(tiny().dataset.visibleWidth),4);assert.ok(Number(tiny().dataset.actualWidth)<.1);assert.match(tiny().textContent,/3 百万美元/);
 assert.equal(document.querySelectorAll('.flow-hit').length,16);assert.doesNotMatch($('sankey').textContent,/宽度非严格同比例/);
 for(const minimum of ['0','2','6','4','0','4']){
  $('min-width-input').value=minimum;$('min-width-input').dispatchEvent(new dom.window.Event('change'));
  assert.equal($('data-text').value,originalText);assert.deepEqual(amounts(),originalAmounts,'display allocation preserves every actual width and amount');assert.deepEqual(nodeAmounts(),originalNodeAmounts,'display allocation preserves every node amount');
  near(Number(tiny().dataset.visibleWidth),Math.max(Number(minimum),Number(tiny().dataset.actualWidth)),'tiny flow reaches its selected minimum');
  for(const p of links()){
   const [a,b]=JSON.parse(p.dataset.ports),w=Number(p.dataset.visibleWidth),coords=p.getAttribute('d').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number);
   near(Number(p.dataset.portWidth),w,'visible width equals endpoint port width');
   assert.ok(w>=Math.max(Number(minimum),Number(p.dataset.actualWidth))-1e-7,'ribbon meets the display and monetary lower bounds');
   assert.equal((p.getAttribute('d').match(/C/g)||[]).length,2,'full-width standard cubic boundaries in every mode');
   near(coords[1],a.y-w/2,'source upper boundary');near(coords[15],a.y+w/2,'source lower boundary');
   near(coords[7],b.y-w/2,'target upper boundary');near(coords[9],b.y+w/2,'target lower boundary');
   if(minimum==='0'){
    near(w,Number(p.dataset.actualWidth),'strict zero removes all display inflation');
    const amount=Number(p.querySelector('title').textContent.match(/：([\d,.]+) /)[1].replaceAll(',',''));
    near(w/amount,180/14575,'strict zero restores a single monetary ratio');
   }
  }
  for(const n of document.querySelectorAll('.sankey-node'))for(const [key,index] of [['source',0],['target',1]]){
   const attached=links().filter(p=>p.dataset[key]===n.dataset.node).sort((a,b)=>JSON.parse(a.dataset.ports)[index].y-JSON.parse(b.dataset.ports)[index].y);
   if(!attached.length)continue;
   const rect=n.querySelector('rect');let y=Number(rect.getAttribute('y'));
   for(const p of attached){const port=JSON.parse(p.dataset.ports)[index],w=Number(p.dataset.visibleWidth);near(port.y-w/2,y,'ports pack without gaps or overlaps');y+=w;}
   near(y,Number(rect.getAttribute('y'))+Number(rect.getAttribute('height')),'incoming and outgoing ports each fill the whole node');
  }
  for(const hit of document.querySelectorAll('.flow-hit'))assert.ok(Number(hit.getAttribute('stroke-width'))>=32,'touch target independent of visible ribbon');
  assert.doesNotMatch($('sankey').textContent,/宽度非严格同比例/);
  const snapshot={nodes:nodeGeometry(),paths:links().map(p=>[p.dataset.link,p.getAttribute('d'),p.dataset.ports])};
  if(snapshots.has(minimum))assert.deepEqual(snapshot,snapshots.get(minimum),'switching back restores the same geometry without accumulating inflation');else snapshots.set(minimum,snapshot);
 }
 assert.notDeepEqual(snapshots.get('0').nodes,snapshots.get('4').nodes,'minimum display mode intentionally resizes nodes');
 assert.deepEqual(nodeGeometry(),originalNodes,'restoring default minimum restores original display nodes');
 for(const ribbon of ['gradient','solid']){
  $('ribbon-input').value=ribbon;$('ribbon-input').dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual(nodeGeometry(),originalNodes,'paint mode does not change display allocation');assert.deepEqual(amounts(),originalAmounts);
 }
});
test('unbalanced data does not silently export; generic metrics are honest',()=>{fill('data-text','甲,乙,100\n乙,丙,80');assert.equal($('source-card').hidden,true);assert.equal($('demo-badge').textContent,'待更新数据');assert.ok($('svg-btn').disabled);click('generate-btn');assert.match($('validation-panel').textContent,/差额 20/);assert.ok($('png-btn').disabled);assert.equal($('summary'),null);assert.equal($('source-card').hidden,true);});
test('bad input preserves prior graph and disables exports',()=>{fill('data-text','甲,乙,-2');click('generate-btn');assert.match($('input-error').textContent,/负数/);assert.equal(document.querySelectorAll('.sankey-link').length,2);assert.ok($('svg-btn').disabled);});
test('finance quick form calculates and recovers',()=>{click('finance-tab');for(const [k,v] of Object.entries({revenue:12800,cost:6880,sales:1460,rnd:1020,admin:560,finance:120,tax:552}))fill('f-'+k,String(v));click('generate-btn');assert.match($('sankey').textContent,/2,208/);assert.equal($('svg-btn').disabled,false);fill('f-revenue','10');click('generate-btn');assert.ok($('input-error').hidden);assert.match($('sankey').textContent,/非现金/);assert.equal($('sankey').dataset.layout,'auto');fill('f-revenue','12800');click('generate-btn');assert.ok($('input-error').hidden);});
test('node order can change and reset',()=>{click('data-tab');fill('data-text','甲,总额,30\n乙,总额,20\n总额,去向,50');click('generate-btn');const nodes=()=>[...document.querySelectorAll('.sankey-node')];nodes()[0].dispatchEvent(new dom.window.Event('click'));assert.equal($('node-tools').hidden,false);click('node-down');const getY=label=>{const n=nodes().find(n=>n.getAttribute('aria-label').startsWith('选择'+label+'，'));return Number(n.querySelector('rect').getAttribute('y'));};assert.ok(getY('甲')>getY('乙'));click('reset-order-btn');assert.ok(getY('甲')<getY('乙'));});
test('long names and 80 nodes produce finite SVG dimensions',()=>{click('data-tab');fill('data-text',Array.from({length:79},(_,i)=>`来源${i}${'长'.repeat(50)},总额,${i+1}`).join('\n'));click('generate-btn');assert.ok($('input-error').hidden);for(const n of document.querySelectorAll('.sankey-node rect'))assert.ok(Number(n.getAttribute('height'))>=0);for(const p of document.querySelectorAll('.sankey-link'))assert.doesNotMatch(p.getAttribute('d'),/NaN|Infinity/);assert.equal(document.querySelectorAll('.sankey-node').length,80);});
test('imported text remains text, not executable markup',()=>{fill('data-text','<img src=x onerror=alert(1)>,普通节点,100');click('generate-btn');assert.equal($('data-rows').querySelector('img'),null);assert.match($('data-rows').textContent,/<img/);});

test('zero-profit quick form still reports zero financial metrics',()=>{click('finance-tab');for(const [key,value] of Object.entries({revenue:100,cost:100,sales:0,rnd:0,admin:0,finance:0,tax:0}))fill('f-'+key,String(value));click('generate-btn');assert.match($('validation-panel').textContent,/零金额|没有流向/);assert.equal($('svg-btn').disabled,false);});

test('saving an invalid draft is blocked instead of producing an unreadable project',()=>{click('data-tab');fill('data-text','甲,乙,-10');click('save-btn');assert.match($('toast').textContent,/请先修正输入数据/);assert.ok(!$('input-error').hidden);});

test('layout chrome is removed without changing financial geometry',()=>{assert.equal(document.querySelector('#preview-layout'),null);assert.equal(document.querySelector('#layout-input'),null);assert.doesNotMatch(document.body.textContent,/上沿对齐/);});

test("drawing guidance is discoverable in help, not a permanent chart footer",()=>{assert.doesNotMatch($("layout-note").textContent,/小额流线/);assert.match($("help-dialog").textContent,/宽度非严格同比例/);assert.doesNotMatch($("sankey").textContent,/主链输出上沿对齐|端口自然分合|宽度非严格同比例/);});

test('switching tabs neither invalidates a valid export nor drops the source badge',()=>{
 // Re-establish a valid, sample-backed chart; earlier tests mutate the editor.
 document.querySelector('[data-example="0"]').click();
 assert.equal($('svg-btn').disabled,false,'a valid chart is exportable');
 click('finance-tab');
 // The quick form is empty here, so the chart legitimately stays as-is.
 assert.equal($('svg-btn').disabled,false,'an empty quick form does not mark the visible chart stale');
 assert.equal($('demo-badge').textContent,'含来源','source badge survives the tab switch');
 assert.equal($('source-card').hidden,false,'source card survives the tab switch');
 click('data-tab');
 assert.equal($('svg-btn').disabled,false,'returning to data keeps the export enabled');
 assert.equal($('demo-badge').textContent,'含来源');
});

test('selecting a node with the keyboard keeps focus on that node',()=>{
 const node=document.querySelector('.sankey-node'),id=node.dataset.node;
 node.focus();
 node.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 const restored=document.querySelector(`.sankey-node[data-node="${id}"]`);
 assert.ok(restored,'the node is re-rendered');
 assert.equal(document.activeElement,restored,'focus returns to the same node, not the document body');
 assert.equal($('node-tools').hidden,false);
 click('node-close');
});

test('pasting own data resets the headline so exports never claim the sample company',()=>{
 // Earlier tests leave the editor in an arbitrary state, so reload the sample
 // first instead of depending on whatever title happened to be left behind.
 document.querySelector('[data-example="0"]').click();
 assert.match($('title-input').value,/SpaceX/,'the sample is loaded again as the starting point');
 fill('data-text','我公司A,我公司B,1234\n我公司B,我公司C,1234');
 assert.equal($('title-input').value,'财务流向分析');
 assert.equal($('period-input').value,'未指定期间');
 assert.equal($('currency-input').value,'未指定');
 assert.equal($('unit-input').value,'未指定');
 click('generate-btn');
 assert.ok($('input-error').hidden);
 assert.doesNotMatch($('sankey').textContent,/SpaceX/,'the rendered header no longer names the sample');
});

test('the quick form never inherits the sample company headline',()=>{
 click('finance-tab');
 for(const [key,value] of Object.entries({revenue:12800,cost:6880,sales:1460,rnd:1020,admin:560,finance:120,tax:552}))fill('f-'+key,String(value));
 click('generate-btn');
 assert.equal($('title-input').value,'财务流向分析');
 assert.doesNotMatch($('sankey').textContent,/SpaceX/);
});

test('zero-valued flows are described once and listed in the detail table',()=>{
 click('finance-tab');
 for(const [key,value] of Object.entries({revenue:100,cost:100,sales:0,rnd:0,admin:0,finance:0,tax:0}))fill('f-'+key,String(value));
 click('generate-btn');
 const items=[...document.querySelectorAll('#validation-panel li')].map(li=>li.textContent);
 assert.equal(items.filter(text=>/零金额/.test(text)).length,1,'exactly one zero-flow statement');
 assert.ok(!items.some(text=>/未绘制/.test(text)),'no wording that contradicts 保留');
 assert.match($('row-count').textContent,/零值/,'the detail list accounts for the zero rows');
});

test('a report with no main chain does not also demand that a main chain be configured',()=>{
 click('finance-tab');
 for(const [key,value] of Object.entries({revenue:100,cost:100,sales:0,rnd:0,admin:0,finance:0,tax:0}))fill('f-'+key,String(value));
 click('generate-btn');
 const banner=$('layout-note').textContent;
 assert.doesNotMatch(banner,/请配置 2–12/,'the cleared-chain note does not contradict a "configure a chain" demand');
 // The explanation lives in the exported SVG footer, not repeated in the banner.
 assert.match($('sankey').textContent,/零余额/,'the real explanation reaches the exported chart');
 assert.doesNotMatch(banner,/零余额/,'the banner does not repeat the footer note');
});

test('the chart is one tab stop with arrow-key roving focus',()=>{
 // A chart with dozens of interactive nodes must not cost one tab stop each.
 document.querySelector('[data-example="0"]').click();
 const chart=()=>[...document.querySelectorAll('#chart-stage [role=button]')];
 assert.equal(chart().filter(el=>el.getAttribute('tabindex')==='0').length,1,'exactly one chart element admits Tab');
 const first=chart().find(el=>el.getAttribute('tabindex')==='0');
 first.focus();
 assert.equal(document.activeElement,first,'Tab lands on the designated entry node');
 // ArrowDown walks the roving sequence (order policy pinned by session tests);
 // the wiring here only has to move focus and keep exactly one tab entry.
 first.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 assert.notEqual(document.activeElement,first,'ArrowDown moves focus to another chart element');
 assert.ok(document.activeElement.closest('#chart-stage'),'focus stays inside the chart');
 assert.equal(chart().filter(el=>el.getAttribute('tabindex')==='0').length,1,'roving tabindex stays unique');
 document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
 assert.equal(document.activeElement,first,'ArrowUp walks back to the entry node');
 // Focus survives a re-render and keeps the roving state consistent.
 document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(document.activeElement.getAttribute('tabindex'),'0','the focused node keeps the tab entry after re-render');
 assert.equal(chart().filter(el=>el.getAttribute('tabindex')==='0').length,1);
 assert.equal($('node-tools').hidden,false);
 click('node-close');
});

test('the validation panel announces itself to assistive tech',()=>{
 assert.equal(document.getElementById('validation-panel').getAttribute('role'),'status');
 assert.equal(document.getElementById('sankey').getAttribute('role'),'group','an interactive svg cannot be role=img');
});

test('hovering a node traces its causal path without rebuilding the chart',()=>{
 document.querySelector('[data-example="0"]').click();
 const stage=document.getElementById('chart-stage');
 const node=document.querySelector('.sankey-node[data-node="净利润"]');
 // Capture identity after the load settles, so the assertion measures whether
 // *hovering* rebuilds the chart rather than whether loading did.
 const before=stage.querySelector('.sankey-node');
 // jsdom does not bubble pointer events to delegated handlers, so drive the
 // delegated handler directly with the event shape it receives in a browser.
 assert.equal(typeof stage.onpointerover,'function','the stage owns a delegated pointerover');
 stage.onpointerover({target:node});
 assert.ok(stage.classList.contains('is-tracing'),'the stage enters tracing mode');
 const onPath=[...stage.querySelectorAll('.sankey-node.on-path')];
 assert.ok(onPath.length>0&&onPath.length<stage.querySelectorAll('.sankey-node').length,'only the path stays lit');
 assert.ok(onPath.some(n=>n.dataset.node==='净利润'),'the hovered node is on its own path');
 assert.equal(stage.querySelector('.sankey-node'),before,'the chart is not rebuilt on hover');
 const readout=document.getElementById('trace-readout');
 assert.equal(readout.hidden,false,'the readout appears');
 assert.match(readout.textContent,/占收入/,'it reports share of revenue, not just an amount');
 assert.match(readout.textContent,/30\.2%/,'net income is 30.2% of revenue');
 // A ribbon hover traces from its source.
 const link=stage.querySelector('.sankey-link');
 stage.onpointerover({target:link});
 assert.ok(stage.classList.contains('is-tracing'),'ribbons trace too');
 stage.onpointerleave();
 assert.equal(stage.classList.contains('is-tracing'),false,'leaving the chart clears the trace');
 assert.equal(readout.hidden,true);
});

test('the exported SVG is never dimmed by an active trace',()=>{
 document.querySelector('[data-example="0"]').click();
 document.querySelector('.sankey-node[data-node="净利润"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
 assert.ok(document.getElementById('chart-stage').classList.contains('is-tracing'),'a selection pins a trace on screen');
 // The export path renders from the diagram, never from the live DOM.
 const svg=renderSvg(layoutFinancialGraph(normalizeInput(EXAMPLES[0].document)),{interactive:true,selected:'净利润'});
 assert.doesNotMatch(svg,/on-path/,'no trace classes leak into the export');
 assert.doesNotMatch(svg,/trace-readout/,'no readout markup leaks into the export');
 assert.doesNotMatch(svg,/opacity="0\.1[0-9]?"/,'nothing is exported at dimmed opacity');
 click('node-close');
});
