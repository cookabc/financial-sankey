import test from 'node:test';import assert from 'node:assert/strict';import {sankey} from 'd3-sankey';
import {parseText,analyzeLinks} from '../src/core/table-data.js';
import {financialRail,railNodeRect,financialLinkGeometry} from '../src/core/top-layout.js';
import {DEFAULT_EXAMPLE} from '../src/examples/registry.js';
const REPORT_TEXT = DEFAULT_EXAMPLE.text, REPORT_CHAIN = DEFAULT_EXAMPLE.document.mainChain;
const make=(text=REPORT_TEXT)=>{const m=analyzeLinks(parseText(text));return {m,g:sankey().nodeId(n=>n.id).extent([[44,180],[1365,900]])({nodes:m.nodes.map(n=>({id:n.id})),links:m.links.map(l=>({...l}))})};};
const near=(actual,expected,label,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, got ${actual}`);
function checkTopAligned(g){
 for(const n of g.nodes.filter(n=>n.railRole==='main')){
  near(n.y0,g.rail.baseline,`${n.id} shares the main-node top`);
  near(n.y1,n.y0+n.displayHeight,`${n.id} display bottom`);
  assert.ok(n.x1-n.x0>0&&n.x1-n.x0<=24,`${n.id} remains a narrow rectangle`);
 }
 for(const l of g.links.filter(l=>l.source.railRole==='main'&&l.target.railRole==='main')){
  const d=financialLinkGeometry(l),label=`${l.source.id} → ${l.target.id}`;
  assert.equal(d.main,true);
  assert.equal(l.port0.edge,'right');assert.equal(l.port1.edge,'left');
  near(l.port0.x,l.source.x1,`${label} starts at source right`);
  near(l.port0.y-l.width/2,l.source.y0,`${label} outgoing top is the source node top`);
  near(l.port1.x,l.target.x0,`${label} ends at target left`);
  const gains=l.target.targetLinks.filter(q=>q.source.railRole==='addition').reduce((sum,q)=>sum+q.width,0);
  near(l.port1.y-l.width/2,l.target.y0+gains,`${label} main input follows gains`);
  near(d.middle.x0,l.source.x1,`${label} starts at node edge`);
  near(d.middle.x1,l.target.x0,`${label} ends at node edge`);
  near(d.middle.y0,l.source.y0,`${label} source boundary is top-aligned`);
  near(d.middle.y1,l.target.y0+gains,`${label} target boundary respects packed additions`);
  assert.equal((d.center.match(/C/g)||[]).length,1,`${label} uses one standard cubic`);
 }
}
function checkPorts(g){
 for(const n of g.nodes){
  const height=n.y1-n.y0;
  near(height,n.displayHeight,`${n.id} display flow height`);
  assert.ok(height>=n.value*g.rail.scale-1e-7,`${n.id} display never shrinks monetary height`);
  for(const [links,key,edge,x] of [[n.sourceLinks,'port0','right',n.x1],[n.targetLinks,'port1','left',n.x0]]){
   if(!links.length)continue;
   near(links.reduce((sum,l)=>sum+l.width,0),height,`${n.id} aggregate display ${key} conservation`);
   near(links.reduce((sum,l)=>sum+l.actualWidth,0),n.value*g.rail.scale,`${n.id} aggregate monetary ${key} conservation`);
   let boundary=n.y0;
   for(const l of [...links].sort((a,b)=>a[key].y-b[key].y)){
    const p=l[key],label=`${l.source.id} → ${l.target.id} ${key}`;
    assert.ok(p,`${label} is explicit`);assert.equal(p.edge,edge,`${label} uses only the correct left/right edge`);
    near(p.x,x,`${label} lies on node edge`);
    near(p.y-l.width/2,boundary,`${label} packs continuously without gap or overlap`);
    boundary=p.y+l.width/2;
   }
   near(boundary,n.y1,`${n.id} ${edge} ports fill the complete display node height`);
  }
 }
 for(const n of g.nodes.filter(n=>n.railRole==='main')){
  const gains=n.targetLinks.filter(l=>l.source.railRole==='addition'),expenses=n.sourceLinks.filter(l=>l.target.railRole==='deduction');
  const incoming=[...gains].sort((a,b)=>a.source.y0-b.source.y0);
  const outgoing=[...expenses].sort((a,b)=>a.target.y0-b.target.y0);
  assert.deepEqual(n.targetLinks.filter(l=>l.source.railRole==='addition'),incoming,`${n.id} gains follow their display order`);
  assert.deepEqual(n.sourceLinks.filter(l=>l.target.railRole==='deduction'),outgoing,`${n.id} deductions follow their display order`);
  if(gains.length)assert.deepEqual(n.targetLinks.slice(0,gains.length),incoming,`${n.id} gains enter before the main input`);
  if(expenses.length)assert.deepEqual(n.sourceLinks.slice(-expenses.length),outgoing,`${n.id} deductions leave after the main output`);
 }
}
test('main output tops align with narrow real-height nodes, additions above and deductions below',()=>{const {m,g}=make();const r=financialRail(g,{chain:REPORT_CHAIN,balanced:m.balanced});assert.ok(r.applied);checkTopAligned(g);checkPorts(g);for(const l of g.links){assert.ok(Math.abs(l.width/l.value-r.scale)<1e-10);if(l.source.railRole==='addition')assert.ok(l.source.y1<l.target.y0);if(l.target.railRole==='deduction')assert.ok(l.target.y0>l.source.y1);}assert.equal(g.links.find(l=>l.target.id==='重组费用').value,3);assert.equal(g.nodes.find(n=>n.id==='利润与其他收益合计').value,4689);});
test('rail recognizes structural configuration, not fixed Chinese names',()=>{const {g}=make('甲,主节点,100\n主节点,副项,40\n主节点,中间节点,60\n补充,中间节点,10\n中间节点,终点,70');assert.ok(financialRail(g,{chain:['主节点','中间节点','终点']}).applied);checkTopAligned(g);checkPorts(g);});
test('missing, disconnected, duplicate, unbalanced and complex chains fall back untouched',()=>{for(const chain of [[],['营业收入','不存在'],['营业收入','净利润'],['营业收入','营业收入']]){const {g}=make();const before=g.nodes.map(n=>n.y0);assert.equal(financialRail(g,{chain}).applied,false);assert.deepEqual(g.nodes.map(n=>n.y0),before);}const {g}=make();assert.equal(financialRail(g,{chain:REPORT_CHAIN,balanced:false}).applied,false);const complex=make('起点,中点,100\n中点,终点,60\n中点,支路,40\n支路,细项,40').g;assert.equal(financialRail(complex,{chain:['起点','中点','终点']}).applied,false);});
test('numeric edits and side-branch reordering preserve top alignment and continuous ports',()=>{const changed=REPORT_TEXT.replace('重组费用,3','重组费用,4').replace('研发费用,4596','研发费用,4595');const {m,g}=make(changed);assert.ok(m.balanced);const order=['重组费用','销售及管理费用','研发费用','其他净收益','利息收入'];assert.ok(financialRail(g,{chain:REPORT_CHAIN,order}).applied);checkTopAligned(g);checkPorts(g);assert.ok(g.nodes.find(n=>n.id==='重组费用').y0<g.nodes.find(n=>n.id==='研发费用').y0);assert.ok(g.nodes.find(n=>n.id==='其他净收益').y0<g.nodes.find(n=>n.id==='利息收入').y0);});

test('minimum widths are allocated across the graph with full-height nodes and unchanged monetary values',()=>{
 const {g}=make(),originalValues=g.links.map(l=>l.value),originalNodes=g.nodes.map(n=>n.value);
 const snapshots=new Map();
 for(const minimum of [0,2,4,6,4,2,0,6]){
  assert.ok(financialRail(g,{chain:REPORT_CHAIN,minimum}).applied);checkTopAligned(g);checkPorts(g);
  assert.deepEqual(g.links.map(l=>l.value),originalValues,'display allocation cannot change amounts');
  assert.deepEqual(g.nodes.map(n=>n.value),originalNodes,'display allocation cannot change node amounts');
  let enhanced=0;
  for(const l of g.links){
   const d=financialLinkGeometry(l);
   near(l.actualWidth,l.value*g.rail.scale,'actual width retains the true monetary scale');
   near(d.actualWidth,l.actualWidth,'geometry exposes actual width separately');
   near(d.portWidth,l.width,'port uses the complete display width');
   near(d.visibleWidth,l.width,'ribbon and port use the same display width');
   assert.ok(l.width>=minimum-1e-7&&l.width>=l.actualWidth-1e-7,'display width respects both lower bounds');
   if(minimum===0)near(l.width,l.value*g.rail.scale,'strict zero retains monetary proportion');
   else if(l.width>l.actualWidth+1e-7)enhanced++;
  }
  for(const n of g.nodes.filter(n=>n.railRole==='main')){
   const r=railNodeRect(n);near(r.height,n.displayHeight,'rectangle uses conserved display height');assert.equal(r.y,n.y0);
  }
  if(minimum)assert.ok(enhanced>0,'small branches actually trigger display allocation');
  const snapshot={nodes:g.nodes.map(n=>[n.x0,n.x1,n.y0,n.y1,n.value]),links:g.links.map(l=>[l.value,l.actualWidth,l.width,l.port0,l.port1])};
  if(snapshots.has(minimum))assert.deepEqual(snapshot,snapshots.get(minimum),'switching minima is deterministic and never compounds inflation');
  else snapshots.set(minimum,snapshot);
 }
 assert.notDeepEqual(snapshots.get(4).nodes,snapshots.get(0).nodes,'default minimum intentionally changes node heights');
});
test('natural side branches use left/right cubic ports and gain merges may bend the main flow',()=>{
 let bentMain=0;
 for(const minimum of [0,2,4,6]){
  const {g}=make();financialRail(g,{chain:REPORT_CHAIN,minimum});
  for(const l of g.links){
   assert.equal(l.port0.edge,'right');assert.equal(l.port1.edge,'left');
   if(l.source.railRole==='addition')assert.ok(l.port0.y<l.port1.y,'gain descends naturally from above');
   if(l.target.railRole==='deduction')assert.ok(l.port0.y<l.port1.y,'deduction curves down below the main nodes');
   const d=financialLinkGeometry(l),a=l.port0,b=l.port1,xm=(a.x+b.x)/2;
   assert.equal(d.center,`M${a.x},${a.y}C${xm},${a.y} ${xm},${b.y} ${b.x},${b.y}`,'one standard cubic, not a pipe arc');
   near(d.labelPoint.x,xm,'label cubic midpoint x');near(d.labelPoint.y,(a.y+b.y)/2,'label cubic midpoint y');
   if(l.source.railRole==='main'&&l.target.railRole==='main'&&l.target.targetLinks.some(q=>q.source.railRole==='addition')){
    assert.ok(l.port1.y>l.port0.y,'gain merge bends the main input instead of forcing a shared centerline');bentMain++;
   }
  }
 }
 assert.ok(bentMain>0,'fixture exercises a target-side main bend');
});
test('scaled conservation catches tiny imbalances before any rail mutation',()=>{const {m,g}=make('根,甲,0.00000001\n甲,乙,0.000000005\n乙,末,0.000000005');assert.ok(m.balanced);const before=g.nodes.map(n=>[n.x0,n.y0,n.y1]);assert.equal(financialRail(g,{chain:['甲','乙','末'],balanced:m.balanced}).applied,false);assert.deepEqual(g.nodes.map(n=>[n.x0,n.y0,n.y1]),before);});
test('gain-heavy and deduction-heavy cases retain true rectangles and packed top-aligned outputs',()=>{for(const text of ['源,甲,100\n甲,费用,99\n甲,乙,1\n加项,乙,99\n乙,末,100','源,甲,100\n甲,乙,100\n加项,乙,200\n乙,费用,299\n乙,末,1']){const {g}=make(text);assert.ok(financialRail(g,{chain:['甲','乙','末']}).applied);checkPorts(g);checkTopAligned(g);}});
