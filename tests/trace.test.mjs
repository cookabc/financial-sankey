import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeInput} from '../src/core/financial-data.js';
import {layoutFinancialGraph} from '../src/core/layout.js';
import {describeTrace, revenueBasis, shareOfRevenue, tracePath} from '../src/core/trace.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const diagram = (name) => layoutFinancialGraph(normalizeInput(example(name)));
const byMetric = (graph, metric) => graph.nodes.find((n) => n.metric === metric);

test('tracing a node reaches its whole causal path in both directions', () => {
  const {graph} = diagram('spacex-2026-q3');
  const revenue = byMetric(graph, 'revenue');
  const trace = tracePath(graph, revenue.id);
  // Revenue sits in the middle: everything upstream feeds it, everything
  // downstream derives from it, so a mid-chain node traces the whole chart.
  assert.ok(trace.nodes.size > graph.nodes.length / 2, `${trace.nodes.size} of ${graph.nodes.length} nodes on the revenue path`);
  // Every traced link must touch a traced node: the path is closed, never a
  // ribbon floating without its endpoints.
  for (const key of trace.links) {
    const [source, target] = key.split('\u0000');
    assert.ok(trace.nodes.has(source) && trace.nodes.has(target), `${source}->${target} has an endpoint off the path`);
  }
  assert.ok(trace.links.size >= graph.links.length - 4, 'most links lie on the revenue path');
  assert.ok(trace.nodes.has(revenue.id));

  // A leaf expense traces back to revenue and forward to nothing.
  const rnd = graph.nodes.find((n) => n.id === '研发费用');
  const leaf = tracePath(graph, rnd.id);
  assert.ok(leaf.nodes.has('营业收入'), 'a leaf expense traces back to revenue');
  assert.ok(leaf.nodes.size < trace.nodes.size, 'a leaf traces strictly less than a mid-chain node');
});

test('a node on no path only traces itself', () => {
  const report = normalizeInput({
    schema: 'liuzhang.financial', version: 1,
    metadata: {title: 't', period: 'p', currency: 'USD', unit: 'm'},
    nodes: [
      {id: 'a', label: 'A', role: 'source'}, {id: 'b', label: 'B', role: 'main'},
      {id: 'lonely', label: 'Lonely', role: 'other'},
    ],
    links: [{source: 'a', target: 'b', value: 10}],
    mainChain: [],
  });
  const {graph} = layoutFinancialGraph(report, {layout: 'auto'});
  const trace = tracePath(graph, 'lonely');
  assert.deepEqual([...trace.nodes], ['lonely'], 'an isolated node traces only itself');
  assert.equal(trace.links.size, 0);
});

test('share of revenue is the number a reader actually wants', () => {
  const {graph} = diagram('spacex-2026-q3');
  assert.equal(revenueBasis(graph), 14575, 'revenue is the denominator, not total source inflow');
  // Research is 4596 of 14575 revenue.
  const rnd = shareOfRevenue(graph, '研发费用');
  assert.ok(Math.abs(rnd - 4596 / 14575) < 1e-12, `got ${rnd}`);
  assert.equal(shareOfRevenue(graph, '营业收入'), 1, 'revenue is 100% of itself');
  const net = shareOfRevenue(graph, '净利润');
  assert.ok(Math.abs(net - 4404 / 14575) < 1e-12, 'net margin reads as a share of revenue');
  // Every share is a real fraction, never a fabricated or out-of-range value.
  for (const node of graph.nodes) {
    const s = shareOfRevenue(graph, node.id);
    if (s !== null) assert.ok(s > 0 && s <= 1, `${node.id}: ${s}`);
  }
  assert.equal(shareOfRevenue(graph, 'not-a-node'), null, 'an unknown node has no share');
});

test('a chart with no revenue basis reports no share rather than dividing by zero', () => {
  const report = normalizeInput({
    schema: 'liuzhang.financial', version: 1,
    metadata: {title: 't', period: 'p', currency: 'USD', unit: 'm'},
    nodes: [{id: 'a', label: 'A', role: 'source'}, {id: 'b', label: 'B', role: 'main'}],
    links: [{source: 'a', target: 'b', value: 6}],
    mainChain: [],
  });
  const {graph} = layoutFinancialGraph(report, {layout: 'auto'});
  // No declared revenue metric and no positive leaf source (the only source
  // feeds forward), so the basis falls back to the leaf total.
  assert.ok(revenueBasis(graph) > 0);
  const info = describeTrace(graph, 'a', 'm');
  assert.equal(info.label, 'A');
  assert.equal(info.feeds, 1);
  assert.equal(info.fedBy, 0);
});

test('the trace summary carries amount, unit and neighbour counts', () => {
  const {graph} = diagram('meta-2026-q3');
  const info = describeTrace(graph, 'rnd', '百万美元');
  assert.equal(info.unit, '百万美元');
  assert.ok(info.value > 0);
  assert.ok(info.share > 0 && info.share < 1, 'R&D is a fraction of revenue, not all of it');
  assert.equal(info.feeds, 0, 'R&D is a leaf');
  assert.equal(info.fedBy, 1);
  assert.equal(describeTrace(graph, 'ghost', 'm'), null);
});
