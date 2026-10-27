import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInput, layoutFinancialGraph, generateSvg} from '../src/core/index.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const metadata = {title: '数值边界测试', period: '测试期间', currency: 'USD', unit: '统一单位'};
function chain(value, mainChain = ['r', 'm']) {
  return {
    schema: 'liuzhang.financial', version: 1, metadata: {...metadata},
    nodes: ['s', 'r', 'm'].map(id => ({id, label: id, role: id === 's' ? 'source' : 'main'})),
    links: [{source: 's', target: 'r', value}, {source: 'r', target: 'm', value}],
    mainChain,
  };
}
function separated(large, small) {
  const report = chain(large, []);
  report.nodes.push(...['small-source', 'small-target'].map(id => ({id, label: id, role: 'other'})));
  report.links.push({source: 'small-source', target: 'small-target', value: small});
  return report;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
function finiteGeometry(result) {
  for (const value of [result.width, result.height]) assert.ok(Number.isFinite(value) && value > 0);
  for (const node of result.graph.nodes) {
    for (const key of ['value', 'x0', 'x1', 'y0', 'y1']) assert.ok(Number.isFinite(node[key]), `${node.id}.${key}`);
    assert.ok(node.x1 > node.x0 && node.y1 > node.y0, `${node.id} has positive geometry`);
  }
  for (const link of result.graph.links) {
    for (const key of ['value', 'width', 'y0', 'y1']) assert.ok(Number.isFinite(link[key]), key);
    assert.ok(link.width > 0);
    for (const y of [link.y0, link.y1]) assert.ok(y + link.width / 2 > y - link.width / 2);
    for (const port of [link.port0, link.port1].filter(Boolean)) assert.ok(Number.isFinite(port.x) && Number.isFinite(port.y));
  }
  if (result.rail?.applied) for (const key of ['scale', 'baseline', 'width', 'height']) assert.ok(Number.isFinite(result.rail[key]), key);
}

test('positive near-zero magnitudes fail honestly before financial or automatic layout can emit NaN/Infinity', () => {
  for (const value of [Number.MIN_VALUE, 1e-320, 1e-308, 1e-306]) {
    for (const mainChain of [['r', 'm'], []]) {
      const report = normalizeInput(chain(value, mainChain)), before = structuredClone(report);
      assert.equal(report.links[0].value, value, 'normalization preserves the valid positive amount');
      assert.throws(() => layoutFinancialGraph(freeze(report)), error => error instanceof RangeError && /金额数量级.*安全计算/.test(error.message) && /原始金额未被改写/.test(error.message));
      assert.throws(() => generateSvg(report), /金额数量级.*安全计算/);
      assert.deepEqual(report, before, 'a rejected layout does not rewrite the input');
    }
  }
});

test('supported small, ordinary, and maximum magnitudes retain values and scale-equivalent geometry', () => {
  // The semantic claim is that magnitude never changes the picture: every
  // supported value produces identical geometry and proportional widths. The
  // previous version also pinned absolute pixels, which froze the old behaviour
  // of stretching a two-flow chart across the whole canvas.
  let reference = null;
  for (const value of [1e-305, 1e-300, 1e-100, 1e-12, 0.1, 0.3, 1, 1e15]) {
    for (const layout of ['financial', 'auto']) {
      const report = normalizeInput(chain(value)), before = structuredClone(report);
      const result = layoutFinancialGraph(freeze(report), {layout});
      finiteGeometry(result);
      assert.deepEqual(result.graph.links.map(link => link.value), [value, value]);
      for (const node of result.graph.nodes) assert.equal(node.value, value);
      const shape = result.graph.nodes.map(node => [node.x0, node.x1, node.y0, node.y1]);
      reference ??= new Map();
      const key = layout;
      if (!reference.has(key)) reference.set(key, shape);
      else assert.deepEqual(shape, reference.get(key), `${layout}: geometry must not depend on magnitude (${value})`);
      // Every link carries the same value, so every link must be equally wide.
      const widths = result.graph.links.map(link => link.width);
      near(widths[0], widths[1]);
      // A tiny two-flow chart must not be inflated into a full-height slab.
      const drawn = Math.max(...result.graph.nodes.map(node => node.y1 - node.y0));
      assert.ok(drawn < result.height - result.footer, `${layout}: a two-flow band (${drawn.toFixed(0)}px) fills the whole ${result.height.toFixed(0)}px canvas`);
      assert.deepEqual(report, before, 'supported amounts and metadata are not rescaled');
      assert.doesNotMatch(generateSvg(report, {layout}), /(?:NaN|Infinity)/);
    }
  }
});

test('unrepresentable positive-flow ratios and underflow are rejected rather than becoming zero-height nodes', () => {
  for (const [large, small] of [[1, 1e-16], [1, 1e-300], [1e15, Number.MIN_VALUE], [1e-100, 1e-300]]) {
    const report = normalizeInput(separated(large, small)), before = structuredClone(report);
    for (const layout of ['auto', 'financial']) assert.throws(() => layoutFinancialGraph(freeze(report), {layout}), /金额跨度过大.*数值精度/);
    assert.deepEqual(report, before);
  }
});

test('safe wide ratios and ordinary decimal branches remain supported without dropping small flows', () => {
  for (const report of [separated(1, 1e-12), separated(1e-100, 1e-112), separated(1e15, 1e3)]) {
    const normalized = normalizeInput(report), result = layoutFinancialGraph(normalized, {layout: 'auto'});
    finiteGeometry(result);
    assert.equal(result.graph.links.at(-1).value, report.links.at(-1).value);
  }
  const input = chain(0.3);
  input.nodes.push({id: 'second-source', label: '第二来源', role: 'source'});
  input.links[0].value = 0.1;
  input.links.push({source: 'second-source', target: 'r', value: 0.2});
  const report = normalizeInput(input), before = structuredClone(report);
  for (const layout of ['financial', 'auto']) {
    const result = layoutFinancialGraph(freeze(report), {layout});
    finiteGeometry(result);
    assert.deepEqual(result.graph.links.map(link => link.value), [0.1, 0.3, 0.2]);
  }
  assert.deepEqual(report, before);
});

test('layout applies the range guard to original positive values before duplicate merging can hide them', () => {
  const report = chain(1);
  report.links.push({source: 's', target: 'r', value: Number.MIN_VALUE});
  const before = structuredClone(report);
  assert.throws(() => layoutFinancialGraph(freeze(report)), /金额跨度过大.*数值精度/);
  assert.deepEqual(report, before);
});

test('existing large-amount and nonfinite validation still rejects invalid values at the public layout boundary', () => {
  for (const value of [1e15 + 1, 1e100, Number.MAX_VALUE, Infinity, NaN]) {
    const report = chain(value), before = structuredClone(report);
    assert.throws(() => layoutFinancialGraph(freeze(report)), /金额必须是.*有限数值/);
    assert.deepEqual(report, before);
  }
});
