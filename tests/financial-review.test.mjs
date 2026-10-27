import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildIncomeStatement, normalizeFinancialGraph, normalizeInput } from '../src/core/financial-data.js';

const metadata = () => ({ title: 'Synthetic independent API review', period: 'Test period', currency: 'USD', unit: 'million' });
const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const node = (id, role = 'main') => ({ id, label: id, role });
const canonical = () => ({
  schema: 'liuzhang.financial', version: 1, metadata: metadata(),
  nodes: [node('input', 'source'), node('gain', 'gain'), node('middle'), node('output')],
  links: [{ source: 'input', target: 'middle', value: 1 }, { source: 'gain', target: 'middle', value: 1e-17 }, { source: 'middle', target: 'output', value: 1 }],
  mainChain: ['middle', 'output'],
});
const statement = () => ({
  schema: 'liuzhang.income-statement', version: 1, metadata: metadata(),
  revenue: { id: 'revenue', label: 'Revenue', items: [{ id: 'component', label: 'Component', value: 1 }] },
  stages: [{ id: 'net', label: 'Net result', additions: [{ id: 'gain', label: 'Gain', value: 1e-17 }], reportedValue: 1 }],
});

test('review: an unrepresentable exact aggregate must not silently erase a canonical imbalance', () => {
  let graph;
  try { graph = normalizeFinancialGraph(canonical()); }
  catch (error) { assert.match(error.message, /precision|精度|exact|精确/i); return; }
  assert.equal(graph.balanced, false, '1 + 1e-17 and 1 are distinct supplied decimal amounts');
  assert.ok(graph.warnings.some(warning => warning.type === 'balance' && warning.diff === 1e-17));
});

test('review: an unrepresentable statement total cannot validate an incorrect rounded reported value', () => {
  assert.throws(() => buildIncomeStatement(statement()), /precision|精度|exact|精确|does not match|不一致/i);
});

test('review: precision loss cannot disappear through a later exact cancellation', () => {
  const input = statement();
  delete input.stages[0].reportedValue;
  input.stages.push({ id: 'after', label: 'After cost', deductions: [{ id: 'cost', label: 'Cost', value: 1 }] });
  let graph;
  try { graph = buildIncomeStatement(input); }
  catch (error) { assert.match(error.message, /precision|精度|exact|精确/i); return; }
  assert.equal(graph.nodes.find(item => item.id === 'after').signedValue, 1e-17);
});

test('review: smallest finite numbers, scientific notation, and signed zero remain explicit', () => {
  const input = statement();
  input.revenue.items[0].value = 5e-324;
  input.revenue.reportedValue = 5e-324;
  input.stages = [{ id: 'net', label: 'Net', deductions: [{ id: 'cost', label: 'Cost', value: 5e-324 }], reportedValue: -0 }];
  const graph = buildIncomeStatement(input);
  assert.equal(graph.nodes.find(item => item.id === 'revenue').signedValue, 5e-324);
  assert.equal(Object.is(graph.nodes.find(item => item.id === 'net').signedValue, -0), false);
  assert.deepEqual(graph.mainChain, []);
  assert.equal(graph.balanced, true);
});

test('review: conflicting denomination is rejected at every supported input location', async () => {
  const source = await fixture('positive-income');
  const locate = [x => x.revenue, x => x.revenue.items[0], x => x.stages[0], x => x.stages[0].deductions[0], x => x.stages[2].additions[0]];
  for (const field of ['currency', 'unit']) {
    for (const location of locate) {
      const input = structuredClone(source);
      location(input)[field] = 'Different denomination';
      assert.throws(() => buildIncomeStatement(input), /mixed currencies or units/);
    }
    const graph = buildIncomeStatement(source);
    for (const location of [x => x.nodes[0], x => x.links[0]]) {
      const input = structuredClone(graph);
      location(input)[field] = 'Different denomination';
      assert.throws(() => normalizeFinancialGraph(input), /mixed currencies or units/);
    }
  }
});

test('review: missing, null, numeric-string, non-finite, and negative revenue amounts are not zero', async () => {
  const source = await fixture('positive-income');
  for (const value of [undefined, null, '0', NaN, Infinity, -Infinity, -1]) {
    const input = structuredClone(source);
    input.revenue.items[0].value = value;
    assert.throws(() => buildIncomeStatement(input));
  }
  for (const value of [undefined, null, '0', NaN, Infinity, -Infinity]) {
    const input = structuredClone(source);
    input.stages[0].deductions[0].value = value;
    assert.throws(() => buildIncomeStatement(input));
  }
});

test('review: untrusted labels and provenance stay literal independent data, not semantic instructions', async () => {
  const source = await fixture('positive-income');
  const baseline = buildIncomeStatement(source);
  const hostile = '<img src=x onerror="globalThis.executed=true"> revenue __proto__ 收入';
  source.metadata.title = hostile;
  source.metadata.company = hostile;
  source.revenue.label = hostile;
  source.revenue.items[0].label = hostile;
  source.stages[0].label = hostile;
  source.metadata.source = {
    title: hostile, url: 'https://example.org/report?text=%3Cscript%3E', notes: hostile,
    links: [{ label: hostile, url: 'https://example.org/table#note' }], footnotes: [hostile],
  };
  const graph = buildIncomeStatement(source);
  assert.equal(graph.nodes.find(item => item.id === 'product').label, hostile);
  assert.equal(graph.metadata.source.title, hostile);
  assert.deepEqual(graph.links, baseline.links);
  assert.deepEqual(graph.nodes.map(item => [item.id, item.role, item.metric, item.signedValue]), baseline.nodes.map(item => [item.id, item.role, item.metric, item.signedValue]));
  graph.metadata.source.links[0].label = 'Changed';
  graph.metadata.source.footnotes[0] = 'Changed';
  assert.equal(source.metadata.source.links[0].label, hostile);
  assert.equal(source.metadata.source.footnotes[0], hostile);
});

test('review: executable, local-file, data, and protocol-relative provenance URLs fail in both URL locations', async () => {
  const source = await fixture('positive-income');
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///tmp/report', '//example.org/report']) {
    for (const nested of [false, true]) {
      const input = structuredClone(source);
      input.metadata.source = { title: 'Supplied source', url: 'https://example.org/report', links: [{ label: 'Reference', url: 'https://example.org/table' }] };
      if (nested) input.metadata.source.links[0].url = url;
      else input.metadata.source.url = url;
      assert.throws(() => buildIncomeStatement(input), /HTTP\(S\)/);
    }
  }
});

test('review: generated pool and deficit IDs avoid all user-reserved prefixes and suffixes', async () => {
  const input = await fixture('loss-income');
  input.revenue.items[0].id = '__liuzhang:pool:1';
  input.revenue.items[1].id = '__liuzhang:pool:1:1';
  input.stages[0].id = '__liuzhang:carried-deficit:2';
  input.stages[0].deductions[0].id = '__liuzhang:carried-deficit:2:1';
  const graph = buildIncomeStatement(input);
  assert.equal(new Set(graph.nodes.map(item => item.id)).size, graph.nodes.length);
  assert.ok(graph.nodes.some(item => item.id === '__liuzhang:pool:1:2' && item.metric === 'calculation-pool'));
  assert.ok(graph.nodes.some(item => item.id === '__liuzhang:carried-deficit:2:2' && item.metric === 'carried-deficit'));
  assert.equal(graph.balanced, true);
});

test('review: object-prototype-shaped node IDs are ordinary IDs and trimmed duplicates fail', async () => {
  const input = await fixture('positive-income');
  input.revenue.id = '__proto__';
  input.revenue.items[0].id = 'constructor';
  input.revenue.items[1].id = 'toString';
  const graph = buildIncomeStatement(input);
  assert.equal(graph.nodes.find(item => item.id === '__proto__').signedValue, 100);
  assert.equal(graph.balanced, true);
  input.stages[0].id = ' constructor ';
  assert.throws(() => buildIncomeStatement(input), /duplicate node ID/);
});

test('review: unknown schemas never fall through to company or shape inference', async () => {
  const input = await fixture('positive-income');
  for (const schema of [undefined, '', 'Apple', 'liuzhang.income-statement.v1', 'liuzhang.financial ']) {
    input.schema = schema;
    assert.throws(() => normalizeInput(input), /unsupported input schema/);
  }
  input.schema = 'liuzhang.income-statement';
  for (const version of [undefined, 0, 2, '1']) {
    input.version = version;
    assert.throws(() => normalizeInput(input), /schema\/version/);
  }
});

test('review: loss stages with no new adjustments preserve their signed non-cash deficit, not invented revenue', async () => {
  const input = await fixture('loss-income');
  input.stages = [input.stages[0], { id: 'unchanged', label: 'Unchanged loss', reportedValue: -10 }];
  const graph = buildIncomeStatement(input);
  assert.equal(graph.balanced, true);
  assert.deepEqual(graph.mainChain, []);
  const loss = graph.nodes.find(item => item.id === 'unchanged');
  assert.equal(loss.signedValue, -10);
  assert.equal(loss.role, 'loss');
  assert.match(loss.label, /非现金/);
  const carry = graph.nodes.find(item => item.metric === 'carried-deficit');
  assert.equal(carry.signedValue, -10);
  assert.match(carry.label, /非现金/);
  assert.equal(graph.nodes.find(item => item.metric === 'revenue').signedValue, 40);
});
