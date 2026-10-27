import {DEFAULT_EXAMPLE} from '../src/examples/registry.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {sankey,sankeyLeft} from 'd3-sankey';
import {CLEAR_COLORS,clearNodeColor,clearLinkColor} from '../src/core/theme.js';
import {parseText,analyzeLinks} from '../src/core/table-data.js';
const REPORT_TEXT=DEFAULT_EXAMPLE.text;
const model=analyzeLinks(parseText(REPORT_TEXT));const graph=sankey().nodeId(n=>n.id).nodeAlign(sankeyLeft).extent([[0,0],[1600,1000]])({nodes:model.nodes.map(n=>({...DEFAULT_EXAMPLE.document.nodes.find(x=>x.id===n.id)})),links:model.links.map(l=>({...l}))});
test('reference palette follows financial roles, not arbitrary node index',()=>{for(const n of graph.nodes){const expected=/利息收入|其他净收益|所得税收益/.test(n.id)?'gain':/成本|费用/.test(n.id)?'expense':/航天|连接|超级智能/.test(n.id)?'source':'main';assert.equal(clearNodeColor(n),CLEAR_COLORS[expected],n.id);}});
test('solid ribbons carry expense and additional-income semantics',()=>{for(const l of graph.links){const expected=/成本|费用/.test(l.target.id)?'expense':/利息收入|其他净收益|所得税收益/.test(l.source.id)?'gain':/航天|连接|超级智能/.test(l.source.id)?'source':'main';assert.equal(clearLinkColor(l),CLEAR_COLORS[expected],l.source.id+' → '+l.target.id);}});
test('thin restructuring flow width remains proportional, not enlarged',()=>{const a=graph.links.find(l=>l.target.id==='重组费用'),b=graph.links.find(l=>l.target.id==='研发费用');assert.ok(Math.abs(a.width/b.width-3/4596)<1e-12);});

test('quick-form revenue is blue even when it is a root node',()=>{assert.equal(clearNodeColor({id:'arbitrary-root',role:'main',targetLinks:[]}),CLEAR_COLORS.main);assert.equal(clearNodeColor({id:'arbitrary-source',role:'source',targetLinks:[]}),CLEAR_COLORS.source);});
