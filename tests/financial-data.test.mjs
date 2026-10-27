import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sankey } from 'd3-sankey';
import { normalizeFinancialGraph, buildIncomeStatement, normalizeInput } from '../src/core/financial-data.js';

const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
const byId = graph => new Map(graph.nodes.map(node => [node.id, node]));
const incoming = (graph, id) => graph.links.filter(link => link.target === id).reduce((total, link) => total + link.value, 0);
const outgoing = (graph, id) => graph.links.filter(link => link.source === id).reduce((total, link) => total + link.value, 0);
function rendered(graph) {
  const links = graph.links.filter(link => link.value > 0);
  const active = new Set(links.flatMap(link => [link.source, link.target]));
  return sankey().nodeId(node => node.id).extent([[0, 0], [1200, 800]])({ nodes: graph.nodes.filter(node => active.has(node.id)).map(node => ({ ...node })), links: links.map(link => ({ ...link })) });
}

test('positive income statement builds explicit semantic nodes and a balanced path without mutation', async () => {
  const input = await fixture('positive-income');
  const before = clone(input);
  const graph = buildIncomeStatement(freeze(input));
  assert.deepEqual(input, before);
  assert.equal(graph.schema, 'liuzhang.financial');
  assert.equal(graph.balanced, true);
  assert.deepEqual(graph.nodes.filter(node => node.metric === 'statement-balance').map(node => node.signedValue), [40, 25, 26, 20]);
  assert.equal(incoming(graph, 'revenue'), 100);
  assert.equal(outgoing(graph, 'revenue'), 100);
  assert.equal(byId(graph).get('interest').role, 'gain');
  assert.equal(byId(graph).get('cost').role, 'expense');
  assert.equal(graph.mainChain[0], 'revenue');
  assert.equal(graph.mainChain.at(-1), 'net');
  const pool = graph.nodes.find(node => node.metric === 'calculation-pool');
  assert.equal(pool.role, 'other');
  assert.ok(graph.mainChain.includes(pool.id));
  assert.equal(outgoing(graph, 'operating'), 25, 'gain does not inflate the preceding profit metric');
  assert.equal(incoming(graph, pool.id), 28);
  assert.deepEqual(normalizeInput(input), graph);
  const again = normalizeFinancialGraph(freeze(graph));
  assert.deepEqual(again, graph, 'normalization is stable and does not duplicate notes');
  again.metadata.title = 'Changed';
  assert.notEqual(again.metadata.title, graph.metadata.title, 'output has no shared metadata references');
});

test('negative tax deduction is an explicit gain, with original signed amount and explanation', async () => {
  const graph = buildIncomeStatement(await fixture('tax-benefit-income'));
  const tax = byId(graph).get('tax');
  assert.equal(tax.signedValue, -4);
  assert.equal(tax.role, 'gain');
  assert.equal(graph.links.find(link => link.source === 'tax').value, 4);
  assert.equal(byId(graph).get('net').signedValue, 30);
  assert.ok(graph.notes.some(note => note.includes('-4') && note.includes('signed adjustment')));
  assert.ok(graph.links.every(link => link.value >= 0));
  assert.equal(graph.balanced, true);
});

test('negative addition reverses to a deduction without changing the supplied signed amount', async () => {
  const input = await fixture('positive-income');
  input.stages[2].additions[0].value = -3;
  input.stages[2].reportedValue = 20;
  input.stages[3].reportedValue = 14;
  const graph = buildIncomeStatement(input);
  assert.equal(byId(graph).get('interest').role, 'expense');
  assert.equal(byId(graph).get('interest').signedValue, -3);
  assert.equal(graph.links.find(link => link.target === 'interest').value, 3);
  assert.ok(graph.notes.some(note => note.includes('原始加项为 -3')));
});

test('operating and net losses use explicit non-cash signed bridges, not inflated revenue', async () => {
  const graph = buildIncomeStatement(await fixture('loss-income'));
  assert.equal(graph.balanced, true);
  assert.deepEqual(graph.mainChain, []);
  assert.deepEqual(graph.nodes.filter(node => node.metric === 'statement-balance').map(node => node.signedValue), [-10, -25, -24, -20]);
  assert.equal(incoming(graph, 'revenue'), 40);
  assert.equal(outgoing(graph, 'revenue'), 40);
  assert.equal(byId(graph).get('revenue').signedValue, 40);
  for (const node of graph.nodes.filter(node => node.signedValue < 0 && node.role === 'loss')) assert.match(node.label, /非现金/);
  for (const node of graph.nodes.filter(node => node.metric === 'calculation-pool')) assert.equal(node.role, 'other');
  assert.ok(graph.notes.some(note => note.includes('不是收入、融资或现金流')));
  const geometry = rendered(graph);
  assert.equal(geometry.nodes.find(node => node.id === 'revenue').value, 40, 'the rendered revenue node keeps its actual height basis');
  for (const node of geometry.nodes) assert.ok(Number.isFinite(node.y0) && Number.isFinite(node.y1));
});

test('a loss can recover through zero into profit without cycles or invented income', async () => {
  const input = await fixture('loss-income');
  input.stages = [input.stages[0],
    { id: 'breakeven', label: 'Break-even', additions: [{ id: 'recovery', label: 'Recognized recovery', value: 10 }], reportedValue: 0 },
    { id: 'positive', label: 'Positive result', additions: [{ id: 'gain2', label: 'Further recognized gain', value: 3 }], reportedValue: 3 }];
  const graph = buildIncomeStatement(input);
  assert.equal(graph.balanced, true);
  assert.deepEqual(graph.mainChain, []);
  assert.equal(byId(graph).get('breakeven').signedValue, 0);
  assert.equal(byId(graph).get('positive').signedValue, 3);
  assert.doesNotThrow(() => rendered(graph));
});

test('decimal arithmetic produces exact stated totals, including 0.1 + 0.2', async () => {
  const graph = buildIncomeStatement(await fixture('decimal-income'));
  assert.equal(byId(graph).get('r').signedValue, 0.3);
  assert.equal(byId(graph).get('g').signedValue, 0.2);
  assert.equal(byId(graph).get('n').signedValue, 0.17);
  assert.equal(graph.balanced, true);
  assert.ok(!graph.warnings.some(warning => warning.type === 'balance'));
});

test('missing metrics are not invented; missing amounts and metadata are rejected', async () => {
  const graph = buildIncomeStatement(await fixture('absent-metrics-income'));
  assert.deepEqual(graph.nodes.filter(node => node.metric === 'statement-balance').map(node => node.id), ['gross']);
  assert.ok(!graph.nodes.some(node => ['operating', 'pretax', 'net'].includes(node.id)));
  assert.throws(() => buildIncomeStatement({}), /schema/);
  const missing = await fixture('missing-value-income');
  assert.throws(() => buildIncomeStatement(missing), /缺失值不能当成零/);
  for (const field of ['title', 'period', 'currency', 'unit']) {
    const input = await fixture('positive-income');
    delete input.metadata[field];
    assert.throws(() => buildIncomeStatement(input), new RegExp(`metadata.${field}`));
  }
  for (const value of [null, '', '0', NaN, Infinity]) {
    const input = await fixture('positive-income');
    input.revenue.items[0].value = value;
    assert.throws(() => buildIncomeStatement(input), /finite number/);
  }
});

test('zero adjustments and all-zero data are retained without made-up minimum amounts', async () => {
  const graph = buildIncomeStatement(await fixture('zero-adjustment-income'));
  assert.equal(byId(graph).get('research').signedValue, 0);
  assert.equal(graph.links.find(link => link.target === 'research').value, 0);
  assert.ok(graph.warnings.some(warning => warning.code === 'zero-links'));
  const zero = buildIncomeStatement(await fixture('all-zero-income'));
  assert.ok(zero.links.every(link => link.value === 0));
  assert.equal(zero.balanced, true);
  assert.deepEqual(zero.mainChain, []);
  assert.ok(zero.warnings.some(warning => warning.code === 'no-positive-flow'));
  assert.ok(zero.notes.some(note => note.includes('零余额')));
});

test('mixed units/currencies and reported mismatches fail instead of converting or plugging', async () => {
  for (const name of ['mixed-currency-income', 'mixed-unit-income']) assert.throws(() => buildIncomeStatement(inputs.get(name)), /mixed currencies or units/);
  assert.throws(() => buildIncomeStatement(inputs.get('mismatched-total-income')), /no balancing item/);
  const revenueMismatch = await fixture('positive-income');
  revenueMismatch.revenue.reportedValue = 101;
  assert.throws(() => buildIncomeStatement(revenueMismatch), /revenue.reportedValue/);
});
const inputs = new Map(await Promise.all(['mixed-currency-income', 'mixed-unit-income', 'mismatched-total-income'].map(async name => [name, await fixture(name)])));

test('company, node labels, and arbitrary IDs do not affect the graph semantics or magnitudes', async () => {
  const original = buildIncomeStatement(await fixture('positive-income'));
  const renamed = buildIncomeStatement(await fixture('renamed-income'));
  assert.deepEqual(renamed.nodes.map(node => [node.role, node.stage, node.metric, node.signedValue]), original.nodes.map(node => [node.role, node.stage, node.metric, node.signedValue]));
  assert.deepEqual(renamed.links.map(link => link.value), original.links.map(link => link.value));
  assert.equal(renamed.mainChain.length, original.mainChain.length);
  assert.equal(renamed.balanced, original.balanced);
  assert.equal(renamed.metadata.source, undefined);
  assert.equal(original.metadata.source, undefined);
});

test('canonical graph validates explicit roles, IDs, links, schema and chain topology', async () => {
  const base = normalizeInput(await fixture('positive-income'));
  for (const mutate of [
    input => { input.nodes[0].role = undefined; },
    input => { input.nodes[0].role = 'invented'; },
    input => { input.nodes[1].id = input.nodes[0].id; },
    input => { input.links[0].target = 'missing'; },
    input => { input.links[0].value = -1; },
    input => { input.links[0].source = input.links[0].target; },
    input => { input.links.push({ source: 'net', target: 'revenue', value: 1 }); },
    input => { input.mainChain = ['revenue', 'net']; },
    input => { input.order = ['not-a-node']; },
    input => { input.links[0].currency = 'EUR'; },
    input => { input.links[0].unit = 'thousand'; },
    input => { input.nodes[0].currency = 'EUR'; },
    input => { input.version = 2; },
  ]) {
    const input = clone(base); mutate(input); assert.throws(() => normalizeFinancialGraph(input));
  }
  assert.throws(() => normalizeInput({ schema: 'unknown', version: 1 }), /unsupported input schema/);
  assert.throws(() => normalizeInput(JSON.stringify(base)), /must be an object/);
});

test('canonical imbalance is reported and no hidden balancing edge is inserted', async () => {
  const input = await fixture('unbalanced-graph');
  const graph = normalizeFinancialGraph(freeze(input));
  assert.equal(graph.balanced, false);
  assert.deepEqual(graph.links, input.links);
  assert.deepEqual(graph.warnings.filter(warning => warning.type === 'balance'), [{ type: 'balance', node: 'b', in: 10, out: 8, diff: 2 }]);
  const tiny = clone(input);
  tiny.links[0].value = 1e-8; tiny.links[1].value = 5e-9;
  assert.equal(normalizeFinancialGraph(tiny).balanced, false, 'small values do not get an absolute-tolerance exemption');
});

test('unrepresentable exact decimal totals fail rather than silently losing small contributions', async () => {
  const canonical = await fixture('unbalanced-graph');
  canonical.nodes.push({ id: 'tiny', label: 'Small actual contribution', role: 'gain' });
  canonical.links = [{ source: 'a', target: 'b', value: 1 }, { source: 'tiny', target: 'b', value: 1e-17 }, { source: 'b', target: 'c', value: 1 }];
  assert.throws(() => normalizeFinancialGraph(canonical), /exact decimal total cannot round-trip/);

  const statement = await fixture('positive-income');
  statement.revenue.items = [{ id: 'initial', label: 'Initial contribution', value: 1 }];
  statement.revenue.reportedValue = 1;
  statement.stages = [
    { id: 'first', label: 'After small gain', additions: [{ id: 'tiny', label: 'Small gain', value: 1e-17 }], reportedValue: 1 },
    { id: 'second', label: 'After deduction', deductions: [{ id: 'deduction', label: 'Deduction', value: 1 }], reportedValue: 0 },
  ];
  assert.throws(() => buildIncomeStatement(statement), /exact decimal total cannot round-trip/);
  delete statement.stages[0].reportedValue;
  assert.throws(() => buildIncomeStatement(statement), /exact decimal total cannot round-trip/, 'precision protection does not require reported totals');

  const grouped = clone(statement);
  grouped.revenue.items.push({ id: 'small-revenue', label: 'Small revenue', value: 1e-17 });
  grouped.stages = [];
  assert.throws(() => buildIncomeStatement(grouped), /revenue.total.*numeric precision/);

  const singleStage = clone(statement);
  singleStage.stages = [{ id: 'result', label: 'Small residual', additions: [{ id: 'gain', label: 'Small gain', value: 1e-17 }], deductions: [{ id: 'cost', label: 'Cost', value: 1 }], reportedValue: 1e-17 }];
  assert.throws(() => buildIncomeStatement(singleStage), /exact decimal total cannot round-trip/, 'a representable result cannot hide an unrepresentable intermediate pool');
});

test('provenance survives normalization exactly and remains content, not graph logic', async () => {
  const input = await fixture('positive-income');
  input.metadata.source = { title: 'Supplied reference', url: 'https://example.org/report', publishedAt: '2026-01-31', notes: 'Example source metadata only.', links: [{ label: 'Reference table', url: 'https://example.org/table' }], footnotes: ['Original footnote.'] };
  const original = clone(input.metadata.source);
  const graph = buildIncomeStatement(freeze(input));
  assert.deepEqual(graph.metadata.source, original);
  graph.metadata.source.links[0].label = 'Edited';
  assert.deepEqual(input.metadata.source, original);
  const bad = clone(input); bad.metadata.source.url = 'javascript:alert(1)';
  assert.throws(() => buildIncomeStatement(bad), /HTTP\(S\)/);
});

test('generated reconciliation IDs cannot collide with user-provided IDs', async () => {
  const input = await fixture('positive-income');
  input.revenue.items[0].id = '__liuzhang:pool:3';
  const graph = buildIncomeStatement(input);
  assert.equal(new Set(graph.nodes.map(node => node.id)).size, graph.nodes.length);
  assert.equal(graph.balanced, true);
});

test('deterministic signed-decimal cases conserve every stage across arbitrary sign changes', () => {
  let state = 123456789;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  for (let example = 0; example < 100; example++) {
    const initialCents = Math.floor(random() * 10000);
    let cents = initialCents;
    const input = {
      schema: 'liuzhang.income-statement', version: 1,
      metadata: { title: 'Synthetic generated test', period: 'Test period', currency: 'USD', unit: 'ones' },
      revenue: { id: 'r', label: 'r', items: [{ id: 'initial', label: 'Initial component', value: initialCents / 100 }], reportedValue: initialCents / 100 },
      stages: [],
    };
    for (let stage = 0; stage < 5; stage++) {
      const addition = Math.floor(random() * 12000) - 6000;
      const deduction = Math.floor(random() * 12000) - 2000;
      cents += addition - deduction;
      input.stages.push({ id: `s${stage}`, label: `Stage ${stage}`, additions: [{ id: `a${stage}`, label: `Addition ${stage}`, value: addition / 100 }], deductions: [{ id: `d${stage}`, label: `Deduction ${stage}`, value: deduction / 100 }], reportedValue: cents / 100 });
    }
    const graph = buildIncomeStatement(input);
    assert.equal(graph.balanced, true);
    assert.ok(graph.links.every(link => link.value >= 0));
    assert.equal(byId(graph).get('s4').signedValue, cents / 100);
    assert.equal(byId(graph).get('r').signedValue, initialCents / 100);
    const geometry = rendered(graph);
    assert.ok(geometry.nodes.every(node => Number.isFinite(node.y0) && Number.isFinite(node.y1)));
    assert.equal(geometry.nodes.find(node => node.id === 'r')?.value ?? 0, initialCents / 100);
  }
});
