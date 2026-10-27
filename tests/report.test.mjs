import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeInput } from '../src/core/financial-data.js';
import { parseText, analyzeLinks, toCSV } from '../src/core/table-data.js';
import { DEFAULT_EXAMPLE } from '../src/examples/registry.js';

const document = JSON.parse(readFileSync(new URL('../examples/spacex-2026-q3.json', import.meta.url), 'utf8'));
const text = DEFAULT_EXAMPLE.text;

test('the official bridge conserves every intermediate node and all source totals', () => {
  const m = analyzeLinks(parseText(text));
  assert.equal(m.balanced, true);
  assert.equal(m.warnings.length, 0);
  assert.equal(m.links.length, 16);
  assert.equal(m.total, 16863);
  assert.equal(m.nodes.find((n) => n.id === '净利润').in, 4404);
  assert.equal(m.nodes.find((n) => n.id === '营业收入').in, 14575);
  assert.equal(m.nodes.find((n) => n.id === '毛利润（计算）').in, 9097);
  assert.equal(m.nodes.find((n) => n.id === '利润与其他收益合计').in, 4689);
  // The canonical document and its CSV text describe the same chart.
  const canonical = normalizeInput(document);
  assert.equal(canonical.balanced, true);
  const net = canonical.nodes.find((n) => n.metric === 'net');
  assert.equal(net.id, '净利润');
  // A canonical node carries no laid-out value; its amount is its inflows.
  const netIn = canonical.links.filter((l) => l.target === '净利润').reduce((sum, l) => sum + l.value, 0);
  assert.equal(netIn, 4404);
  assert.deepEqual(parseText(text), canonical.links.map(({source, target, value}) => ({source, target, value})));
  const normalizeEol = (csv) => csv.replaceAll('\r\n', '\n').trimEnd();
  assert.equal(normalizeEol(toCSV(parseText(text))), normalizeEol(text), 'round-tripping the example is lossless');
});

test('tax benefit is an inflow and the tiny restructuring amount stays exact', () => {
  const links = parseText(text);
  assert.deepEqual(links.find((x) => x.source === '所得税收益'), {source: '所得税收益', target: '净利润', value: 390});
  assert.equal(links.find((x) => x.target === '重组费用').value, 3);
  assert.ok(links.every((x) => x.value > 0));
});
