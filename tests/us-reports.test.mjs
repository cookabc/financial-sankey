import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {normalizeInput,layoutFinancialGraph,generateSvg,parseText} from '../src/core/index.js';
import {financeDocument} from '../src/browser/project.js';

const us = async (name) => JSON.parse(await readFile(new URL(`../fixtures/us/${name}.json`, import.meta.url), 'utf8'));

const REAL_REPORTS = [
  ['aapl-fq3-2025', {nodes: 13, links: 12, chain: 5, revenue: 94036, net: 23434}],
  ['msft-fy25q4', {nodes: 12, links: 11, chain: 5, revenue: 76441, net: 27233}],
  ['nvda-fq2-2026', {nodes: 18, links: 17, chain: 6, revenue: 46743, net: 26422}],
  ['googl-q3-2025', {nodes: 19, links: 18, chain: 6, revenue: 102553, net: 34979}],
  ['amzn-q3-2025', {nodes: 23, links: 22, chain: 5, revenue: 180169, net: 21187}],
];

function parseSvg(svg) {
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/, 'SVG must not contain NaN/Infinity/undefined');
  return new JSDOM(svg, {contentType: 'image/svg+xml'}).window.document;
}

test('六份美股真实财报全部规范化守恒并走财务主链布局', async () => {
  for (const [name, expect] of REAL_REPORTS) {
    const input = await us(name);
    const r = normalizeInput(input);
    assert.equal(r.balanced, true, `${name} must balance`);
    assert.equal(r.nodes.length, expect.nodes, `${name} node count`);
    assert.equal(r.links.length, expect.links, `${name} link count`);
    assert.equal(r.nodes.find(n => n.metric === 'revenue').signedValue, expect.revenue, `${name} revenue`);
    const d = layoutFinancialGraph(r);
    assert.equal(d.rail.applied, true, `${name} should use the financial rail`);
    assert.equal(d.rail.chain.length, expect.chain, `${name} rail chain`);
    const doc = parseSvg(generateSvg(input));
    assert.equal(doc.querySelectorAll('.sankey-node').length, r.nodes.length, `${name} renders every node`);
    assert.equal(doc.querySelectorAll('.sankey-link').length, r.links.length, `${name} renders every link`);
  }
});

test('英特尔亏损桥：主链清空、回退自动布局、非现金差额逐级结转', async () => {
  const input = await us('intc-fq2-2025');
  const r = normalizeInput(input);
  assert.equal(r.balanced, true);
  assert.deepEqual(r.mainChain, [], 'any loss clears the main chain');
  const losses = r.nodes.filter(n => n.role === 'loss');
  assert.deepEqual(losses.map(n => n.signedValue), [-3176, -3176, -2769, -2769, -3024],
    'each deficit appears twice: its own stage balance and the carry-forward sink');
  assert.equal(r.nodes.filter(n => n.metric === 'calculation-pool').length, 3);
  const d = layoutFinancialGraph(r);
  assert.equal(d.rail, null, 'loss bridge falls back to automatic layout');
  // Revenue stays 12,859 and is never inflated to absorb the 3,176 operating loss.
  assert.equal(r.nodes.find(n => n.metric === 'revenue').signedValue, 12859);
  const doc = parseSvg(generateSvg(input));
  const text = doc.documentElement.textContent;
  assert.match(text, /非现金/);
  assert.match(text, /12,859 百万美元/);
  assert.match(text, /3,024 百万美元/, 'the net loss appears as a labelled balance');
  assert.match(text, /Tax Code|所得税费用/, 'tax expense of 255 shows as a real outgoing flow');
});

test('Alphabet 对冲损益按规范建模为显式扣减，收入不被改成负数', async () => {
  const input = await us('googl-q3-2025');
  const r = normalizeInput(input);
  // Six disclosed revenue segments sum to 102,553; the −207 hedging gains are a
  // contra-revenue component and must be a later deduction, not a negative item.
  const revenue = r.nodes.find(n => n.metric === 'revenue');
  assert.equal(revenue.signedValue, 102553);
  assert.deepEqual(r.links.filter(l => l.target === 'revenue').map(l => l.value), [56567, 10261, 7354, 12870, 15157, 344]);
  const hedging = r.nodes.find(n => n.id === 'hedging');
  assert.equal(hedging.role, 'expense');
  assert.equal(hedging.signedValue, 207, 'authored as a plain deduction, the expense node carries its positive width');
  assert.equal(r.links.find(l => l.target === 'hedging').value, 207, 'the flow width is the absolute 207');
  // Gross profit 60,977 = 102,553 − 41,369 − 207 reconciles with the filed face figure.
  assert.equal(r.nodes.find(n => n.id === 'gross').signedValue, 60977);
  const doc = parseSvg(generateSvg(input));
  assert.match(doc.documentElement.textContent, /对冲损益/);
});

test('净利润高于营业利润的真实结构（谷歌/亚马逊）正常绘制', async () => {
  // GOOGL: operating 31,228 < net 34,979 (OI&E gains); AMZN: non-operating +10,748.
  for (const [name, gain] of [['googl-q3-2025', 12759], ['amzn-q3-2025', 10186]]) {
    const input = await us(name);
    const r = normalizeInput(input);
    const gains = r.nodes.filter(n => n.role === 'gain');
    assert.ok(gains.some(n => n.signedValue === gain), `${name} keeps the large non-operating gain`);
    const doc = parseSvg(generateSvg(input));
    assert.ok(doc.querySelectorAll('.sankey-node').length === r.nodes.length);
  }
});

test('亚马逊七分部收入全部进入主链首列（密集来源布局）', async () => {
  const input = await us('amzn-q3-2025');
  const r = normalizeInput(input);
  const primary = r.links.filter(l => l.target === 'revenue');
  assert.equal(primary.length, 7);
  assert.equal(primary.reduce((s, l) => s + l.value, 0), 180169);
  const d = layoutFinancialGraph(r);
  assert.equal(d.rail.applied, true);
  const revenueNode = d.graph.nodes.find(n => n.id === 'revenue');
  assert.equal(revenueNode.targetLinks.length, 7, 'dense primary column is preserved, not dropped');
});

test('边界：空 stages 只剩收入单节点链且可渲染', async () => {
  const input = await us('edge-empty-stages');
  const r = normalizeInput(input);
  assert.deepEqual(r.nodes.map(n => n.id), ['only', 'revenue']);
  assert.equal(r.links.length, 1);
  assert.deepEqual(r.mainChain, ['revenue']);
  const doc = parseSvg(generateSvg(input));
  assert.equal(doc.querySelectorAll('.sankey-node').length, 2);
});

test('边界：八级深链与收益池恰好贴着 2–12 主链上限', async () => {
  const input = await us('edge-deep-chain');
  const r = normalizeInput(input);
  const d = layoutFinancialGraph(r);
  assert.equal(d.rail.applied, true);
  // revenue + 8 stages + 3 pools for the three gain stages = 12, the documented maximum.
  assert.equal(d.rail.chain.length, 12);
});

test('边界：1e15 金额上限可用，超限明确报错', async () => {
  const input = await us('edge-max-amount');
  const r = normalizeInput(input);
  assert.equal(r.nodes.find(n => n.metric === 'revenue').signedValue, 1e15);
  parseSvg(generateSvg(input));
  await assert.rejects(async () => normalizeInput({...input, revenue: {...input.revenue, items: [{id: 'i', label: 'I', value: 1e15 + 1}]}}),
    /1e15/);
});

test('边界：百万分之一量级在默认与严格线宽下都不产生 NaN', async () => {
  const input = await us('edge-tiny-amount');
  parseSvg(generateSvg(input, {minWidth: 4}));
  parseSvg(generateSvg(input, {minWidth: 0}), 'strict-width rendering must stay finite');
  const r = normalizeInput(input);
  assert.equal(r.nodes.find(n => n.id === 'tiny').signedValue, 0.000001);
});

test('边界：亏损→盈亏平衡→转盈的完整恢复', async () => {
  const input = await us('edge-loss-recovery');
  const r = normalizeInput(input);
  assert.equal(r.balanced, true);
  assert.deepEqual(r.mainChain, []);
  assert.equal(r.nodes.find(n => n.id === 'zero-stage').signedValue, 0, 'break-even stage keeps a zero signed balance');
  assert.equal(r.nodes.find(n => n.id === 'profit-stage').signedValue, 15);
  const carried = r.nodes.filter(n => n.id.includes('carried-deficit'));
  assert.equal(carried.length, 1, 'one deficit carried into the next stage');
  parseSvg(generateSvg(input));
});

test('边界：精度陷阱、负收入、循环流向都被明确拒绝', async () => {
  await assert.rejects(async () => normalizeInput(await us('edge-precision-trap')), /十进制精度|round-trip/);
  await assert.rejects(async () => normalizeInput(await us('edge-negative-revenue')), /不能为负|negative/);
  await assert.rejects(async () => normalizeInput(await us('edge-cycle')), /循环|acyclic/);
});

test('边界：最小两节点单流带图', async () => {
  const input = await us('edge-minimal-graph');
  const r = normalizeInput(input);
  assert.equal(r.nodes.length, 2);
  assert.deepEqual(r.mainChain, []);
  const doc = parseSvg(generateSvg(input));
  assert.equal(doc.querySelectorAll('.sankey-link').length, 1);
});

test('三列表入口：亚马逊收入→费用→净利 CSV 也能出图', () => {
  const text = [
    '线上商店,营业收入,67407',
    'AWS,营业收入,33006',
    '广告服务,营业收入,17703',
    '第三方卖家服务,营业收入,42486',
    '其他收入,营业收入,19567',
    '营业收入,营业成本,88670',
    '营业收入,履约费用,27679',
    '营业收入,技术与基础设施,28962',
    '营业收入,净利润,34858',
  ].join('\n');
  const links = parseText(text);
  assert.equal(links.length, 9);
  const report = normalizeInput({
    schema: 'liuzhang.financial', version: 1,
    metadata: {title: 'Amazon 2025 Q3（三列表简版）', period: '2025 Q3', currency: 'USD', unit: '百万美元'},
    nodes: links.flatMap(l => [{id: l.source, role: l.target === '营业收入' ? 'source' : 'expense'}, {id: l.target, role: 'main'}])
      .filter((n, i, a) => a.findIndex(x => x.id === n.id) === i)
      .map(n => ({...n, label: n.id})),
    links, mainChain: ['营业收入', '净利润'],
  });
  assert.equal(report.balanced, true);
  assert.equal(layoutFinancialGraph(report).rail.applied, true);
  const doc = parseSvg(generateSvg(report));
  assert.equal(doc.querySelectorAll('.sankey-node').length, report.nodes.length);
});

test('速填模式：苹果七字段快速建图', () => {
  const doc = financeDocument(
    {revenue: '94036', cost: '50318', sales: '6650', rnd: '8866', admin: '0', finance: '171', tax: '4597'},
    {title: 'Apple FY2025 Q3 速填', period: 'FY2025 Q3', currency: 'USD', unit: '百万美元'});
  const r = normalizeInput(doc);
  assert.equal(r.balanced, true);
  assert.equal(r.nodes.find(n => n.metric === 'revenue').signedValue, 94036);
  parseSvg(generateSvg(doc, {layout: 'financial'}));
});

test('速填模式：负所得税按税收收益建模（fixture 同款行为）', () => {
  const doc = financeDocument(
    {revenue: '100', cost: '60', sales: '10', rnd: '20', admin: '0', finance: '0', tax: '-3'},
    {title: 'Tax benefit quick fill', period: 'p', currency: 'USD', unit: 'million'});
  const r = normalizeInput(doc);
  assert.equal(r.balanced, true);
  assert.ok(r.nodes.some(n => n.role === 'gain' && n.signedValue === -3), 'negative tax becomes an incoming gain with the original sign');
});
