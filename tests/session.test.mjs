import test from 'node:test';
import assert from 'node:assert/strict';
import { HEADLINE_FIELDS, NEUTRAL_HEADLINE, adjacentSibling, canvasOrder, dropInheritedHeadline, orderedSiblings, swapInOrder } from '../src/browser/session.js';


test('a dataset inherited from a document drops the document headline exactly once', () => {
  const state = { document: { links: [] }, reportId: 'spacex-2026-q3', config: { title: 'SpaceX · 2026 第三季度利润流向', period: '2026 Q3', currency: 'USD', unit: '百万美元' } };
  assert.equal(dropInheritedHeadline(state), true, 'an inherited headline is recognised');
  for (const key of HEADLINE_FIELDS) assert.equal(state.config[key], NEUTRAL_HEADLINE[key], `${key} resets to the neutral value`);
  assert.equal(state.reportId, null, 'provenance is cleared');
  assert.equal(state.document, null, 'the cached document is cleared');
  assert.equal(dropInheritedHeadline(state), false, 'a second call is a no-op, not a fresh reset');
});

test('an unattached dataset keeps its headline, and file import forces a reset', () => {
  const untouched = { document: null, reportId: null, config: { title: '我的图', period: '自定', currency: 'CNY', unit: '元' } };
  assert.equal(dropInheritedHeadline(untouched), false, 'editing your own data must not wipe your own headline');
  assert.equal(untouched.config.title, '我的图');

  const forced = { document: null, reportId: null, config: { title: '我的图', period: '自定', currency: 'CNY', unit: '元' } };
  assert.equal(dropInheritedHeadline(forced, { force: true }), true, 'a replaced dataset resets even without a cached document');
  assert.equal(forced.config.unit, '未指定', 'an unknown dataset does not claim a unit');
});

test('the neutral headline is not the quick-form default', () => {
  // A blank quick form may default to 万元; a dataset of unknown origin must
  // not. Keeping these distinct is the whole point of the neutral constant.
  assert.notEqual(NEUTRAL_HEADLINE.unit, '万元');
});

function graph(rail) {
  const node = (id, layer, y0, railGroup) => ({ id, layer, y0, y1: y0 + 10, ...(railGroup ? { railGroup } : {}) });
  return {
    rail: rail ? { baseline: 0 } : null,
    nodes: [
      node('mid-2', 1, 300, 'main:1'),
      node('mid-1', 1, 100, 'main:1'),
      node('src-b', 0, 220, 'source:0'),
      node('src-a', 0, 110, 'source:0'),
      node('other', 0, 50, 'source:0'),
    ],
  };
}

test('siblings share a column and, under the rail, a rail group', () => {
  const g = graph(true);
  const mid = g.nodes.find((n) => n.id === 'mid-1');
  assert.deepEqual(orderedSiblings(g, mid).map((n) => n.id), ['mid-1', 'mid-2'], 'same rail group, sorted by position');
  const src = g.nodes.find((n) => n.id === 'src-b');
  assert.deepEqual(orderedSiblings(g, src).map((n) => n.id), ['other', 'src-a', 'src-b'], 'same rail group, sorted by position');
  const auto = graph(false);
  const autoSrc = auto.nodes.find((n) => n.id === 'src-a');
  assert.deepEqual(orderedSiblings(auto, autoSrc).map((n) => n.id), ['other', 'src-a', 'src-b'], 'without a rail, layer alone groups');
});

test('adjacentSibling steps within the column and reports the ends', () => {
  const g = graph(true);
  assert.equal(adjacentSibling(g, 'mid-1', 1), 'mid-2');
  assert.equal(adjacentSibling(g, 'mid-2', 1), null, 'the last sibling has no next');
  assert.equal(adjacentSibling(g, 'mid-2', -1), 'mid-1');
  assert.equal(adjacentSibling(g, 'mid-1', -1), null, 'the first sibling has no previous');
  assert.equal(adjacentSibling(g, 'ghost', 1), null, 'an unknown node has no neighbour');
});

test('the persisted order is the drawing order with the two swapped ids exchanged', () => {
  const g = graph(true);
  assert.deepEqual(canvasOrder(g), ['other', 'src-a', 'src-b', 'mid-1', 'mid-2'], 'layer then position');
  const order = canvasOrder(g);
  assert.deepEqual(swapInOrder(order, 'src-a', 'src-b'), ['other', 'src-b', 'src-a', 'mid-1', 'mid-2'], 'the pair exchanges');
  assert.deepEqual(order, ['other', 'src-a', 'src-b', 'mid-1', 'mid-2'], 'the input array is not mutated');
  assert.deepEqual(swapInOrder(order, 'src-a', 'ghost'), order, 'an unknown id leaves the order untouched');
  assert.notEqual(swapInOrder(order, 'src-a', 'src-b'), order, 'a real swap returns a fresh array');
});
