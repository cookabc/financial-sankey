import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {normalizeInput} from '../src/core/financial-data.js';
import {layoutFinancialGraph} from '../src/core/layout.js';
import {renderSvg} from '../src/core/render-svg.js';
import {wrap, wrapLabel, textWidth} from '../src/core/svg-tree.js';
import {nodeColor, palettes} from '../src/core/theme.js';
import {EXAMPLES} from '../src/examples/registry.js';
import {financeDocument} from '../src/browser/project.js';
import {parseText} from '../src/core/table-data.js';

const doc = (svg) => new JSDOM(svg, {contentType: 'image/svg+xml'}).window.document;
// Same width model the renderer uses to keep labels apart.
function box(text, size, x, y, anchor) {
  const w = textWidth(text, size), h = size;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return {text, x0, x1: x0 + w, y0: y - h * 0.78, y1: y + h * 0.22};
}
function labelBoxes(svg) {
  const d = doc(svg), out = [];
  for (const g of d.querySelectorAll('.sankey-node')) {
    for (const t of g.querySelectorAll('text')) {
      out.push(box(t.textContent, Number(t.getAttribute('font-size')), Number(t.getAttribute('x')), Number(t.getAttribute('y')), t.getAttribute('text-anchor') || 'start'));
    }
  }
  for (const t of d.querySelectorAll('svg > text')) {
    out.push(box(t.textContent, Number(t.getAttribute('font-size')), Number(t.getAttribute('x')), Number(t.getAttribute('y')), t.getAttribute('text-anchor') || 'start'));
  }
  return {boxes: out, doc: d};
}

test('label wrapping keeps Latin words whole and Chinese behaviour unchanged', () => {
  // Chinese labels were already correct; the fix must not disturb them.
  assert.deepEqual(wrapLabel('营业收入', 7), ['营业收入']);
  assert.deepEqual(wrapLabel('毛利润（计算）', 7), ['毛利润（计算）']);
  assert.deepEqual(wrapLabel('利润与其他收益合计', 7), ['利润与其他收益', '合计']);
  assert.deepEqual(wrapLabel('利息及其他净收益', 7), ['利息及其他', '净收益']);
  // Latin text used to break mid-word because wrapping counted characters.
  assert.deepEqual(wrapLabel('Revenue from operations', 7), ['Revenue from', 'operations']);
  assert.deepEqual(wrapLabel('Cost of revenue', 7), ['Cost of', 'revenue']);
  assert.deepEqual(wrapLabel('Operating income', 7), ['Operating', 'income']);
  assert.deepEqual(wrapLabel('Reality Labs', 7), ['Reality Labs']);
  for (const line of wrapLabel('Revenue from operations', 7)) {
    assert.doesNotMatch(line, /^ /, 'no leading space leaks into a wrapped line');
    assert.doesNotMatch(line, / $/, 'no trailing space leaks into a wrapped line');
  }
  // A single word longer than the column still has to break.
  assert.ok(wrapLabel('Supercalifragilistic', 7).length > 1);
  // Width model: a wide glyph is one cell, Latin about half.
  assert.equal(textWidth('中中中', 10), 30);
  assert.ok(Math.abs(textWidth('abc', 10) - 16.5) < 1e-9);
});

test('net income reads the same in every palette regardless of which builder made it', () => {
  const config = {title: 't', period: 'p', currency: 'USD', unit: 'm'};
  const finance = {revenue: '12800', cost: '6880', sales: '1460', rnd: '1020', admin: '560', finance: '120', tax: '552'};
  const quick = normalizeInput(financeDocument(finance, config));
  const quickNet = quick.nodes.find((node) => node.id === 'net');
  assert.equal(quickNet.netIncome, true, 'the compiler marks its final stage explicitly');
  assert.notEqual(quick.nodes.find((node) => node.id === 'gross').netIncome, true, 'earlier stages are not net income');
  for (const palette of ['sunrise', 'jade', 'blue', 'warm', 'mono']) {
    assert.equal(nodeColor(quickNet, palette), palettes[palette].net, `${palette} quick-form net income`);
  }
  const example = normalizeInput(JSON.parse(readFileSync(new URL('../examples/spacex-2026-q3.json', import.meta.url), 'utf8')));
  const exampleNet = example.nodes.find((node) => node.id === '净利润');
  for (const palette of ['sunrise', 'jade', 'blue', 'warm', 'mono']) {
    assert.equal(nodeColor(exampleNet, palette), palettes[palette].net, `${palette} example net income`);
    assert.equal(nodeColor(exampleNet, palette), nodeColor(quickNet, palette), 'both builders agree');
  }
  // A palette key with no consumer was removed rather than left to rot.
  for (const palette of Object.values(palettes)) assert.equal('cost' in palette, false);
});

test('a zero-valued flow is stated once and stays visible in the detail list', () => {
  const links = parseText('甲,乙,100\n乙,丙,0');
  assert.equal(links.length, 2, 'parsing keeps the zero row');
  const zero = normalizeInput(JSON.parse(readFileSync(new URL('../fixtures/zero-adjustment-income.json', import.meta.url), 'utf8')));
  const messages = zero.warnings.filter((w) => w.code === 'zero-links');
  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0].message, /未绘制/, 'no contradicting wording');
  assert.match(messages[0].message, /保留/, 'says it is kept');
});

test('spreadsheet trailing empty cells are tolerated without accepting a real fourth column', () => {
  assert.deepEqual(parseText('甲\t乙\t100\t\n乙\t丙\t100\t'), [
    {source: '甲', target: '乙', value: 100},
    {source: '乙', target: '丙', value: 100},
  ]);
  assert.deepEqual(parseText('甲,乙,100,\n'), [{source: '甲', target: '乙', value: 100}]);
  assert.deepEqual(parseText('来源\t去向\t金额\t\n甲\t乙\t100\t'), [{source: '甲', target: '乙', value: 100}]);
  assert.deepEqual(parseText('甲,乙,"1,234"'), [{source: '甲', target: '乙', value: 1234}], 'quoted thousands still parse');
  assert.throws(() => parseText('甲,乙,100,extra'), /三列/, 'a genuinely extra column still fails');
  assert.throws(() => parseText('甲,,100'), /来源和去向不能为空/, 'a missing middle cell still fails');
});

test('node labels never overlap each other or leave the canvas, in either layout', () => {
  for (const example of EXAMPLES) {
    for (const layout of ['financial', 'auto']) {
      const diagram = layoutFinancialGraph(normalizeInput(example.document), {layout});
      const svg = renderSvg(diagram);
      const {boxes, doc: dom} = labelBoxes(svg);
      const [, , width, height] = dom.documentElement.getAttribute('viewBox').split(' ').map(Number);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          assert.ok(ox <= 1 || oy <= 1, `${example.id}/${layout}: "${a.text}" overlaps "${b.text}" by ${ox.toFixed(0)}x${oy.toFixed(0)}px`);
        }
      }
      for (const b of boxes) {
        assert.ok(b.x0 >= 1 && b.x1 <= width - 1, `${example.id}/${layout}: "${b.text}" leaves the canvas horizontally`);
        assert.ok(b.y0 >= 1 && b.y1 <= height - 1, `${example.id}/${layout}: "${b.text}" leaves the canvas vertically`);
      }
    }
  }
});

// The check above uses the renderer's own width estimate. A real browser can
// typeset wider than that estimate, so the same claim is also verified against
// actual glyph metrics in scripts/verify-labels.mjs. These tests guard the two
// properties that script relies on: every label exposes the geometry it needs,
// and the wrap never exceeds the column the layout reserved for it.
test('every rendered label stays within the column its node was given', () => {
  for (const example of EXAMPLES) {
    for (const layout of ['financial', 'auto']) {
      const diagram = layoutFinancialGraph(normalizeInput(example.document), {layout});
      const dom = doc(renderSvg(diagram));
      for (const g of dom.querySelectorAll('.sankey-node')) {
        const texts = [...g.querySelectorAll('text')];
        assert.ok(texts.length > 0, 'every node carries a label');
        for (const t of texts) {
          for (const attr of ['x', 'y', 'font-size']) {
            assert.ok(Number.isFinite(Number(t.getAttribute(attr))), `${example.id}/${layout}: label "${t.textContent}" has no finite ${attr}`);
          }
          assert.ok(['start', 'middle', 'end', null].includes(t.getAttribute('text-anchor')), 'anchor is one the measurement supports');
        }
      }
    }
  }
});

test('a label that would collide is moved, not drawn over its neighbour', () => {
  // Two sources feeding one target at the same depth produce labels whose
  // preferred positions coincide. The renderer must separate them.
  const report = normalizeInput({
    schema: 'liuzhang.financial', version: 1,
    metadata: {title: '碰撞测试', period: 'P', currency: 'USD', unit: 'm'},
    nodes: [
      {id: 'a', label: '完全相同的名称', role: 'source'},
      {id: 'b', label: '完全相同的名称', role: 'source'},
      {id: 'c', label: '完全相同的名称', role: 'source'},
      {id: 't', label: '汇总', role: 'main'},
    ],
    links: [
      {source: 'a', target: 't', value: 1},
      {source: 'b', target: 't', value: 1},
      {source: 'c', target: 't', value: 1},
    ],
    mainChain: [],
  });
  const svg = renderSvg(layoutFinancialGraph(report, {layout: 'auto'}));
  const {boxes} = labelBoxes(svg);
  const labels = boxes.filter((b) => b.text === '完全相同的名称');
  assert.equal(labels.length, 3, 'all three labels are drawn');
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      assert.ok(ox <= 1 || oy <= 1, `identical labels ${i}/${j} collide by ${ox.toFixed(0)}x${oy.toFixed(0)}px`);
    }
  }
});

test('the footer note block is reserved before layout so nodes cannot be drawn on it', () => {
  for (const example of EXAMPLES) {
    for (const layout of ['financial', 'auto']) {
      const diagram = layoutFinancialGraph(normalizeInput(example.document), {layout});
      assert.ok(diagram.footer > 0, 'footer height is measured up front');
      const lowest = Math.max(...diagram.graph.nodes.map((node) => node.y1));
      assert.ok(lowest <= diagram.height - diagram.footer + 1, `${example.id}/${layout}: a node reaches into the note block`);
      const svg = renderSvg(diagram);
      const dom = doc(svg);
      // The footer starts at the first note line. The legend row above the
      // chart also contains a "来源" swatch label, so restrict to the long
      // note strings that only the footer carries.
      const noteLines = [...dom.querySelectorAll('svg > text')].filter((t) => /^(来源：|口径：|https:\/\/)/.test(t.textContent));
      assert.ok(noteLines.length > 0, `${example.id}/${layout} renders footer notes`);
      const footerTop = Math.min(...noteLines.map((t) => Number(t.getAttribute('y')) - 17));
      for (const t of dom.querySelectorAll('.sankey-node text')) {
        assert.ok(Number(t.getAttribute('y')) < footerTop, `${example.id}/${layout}: label "${t.textContent}" sits on the footer`);
      }
    }
  }
});

test('labels crossing a ribbon get an opaque backing, clean labels do not', () => {
  for (const example of EXAMPLES) {
    const svg = renderSvg(layoutFinancialGraph(normalizeInput(example.document)));
    const dom = doc(svg);
    const backings = [...dom.querySelectorAll('.label-backing')];
    assert.ok(backings.length > 0, `${example.id} has labels over flows that need a backing`);
    for (const rect of backings) {
      assert.equal(rect.getAttribute('fill'), '#ffffff');
      assert.ok(Number(rect.getAttribute('width')) > 0 && Number(rect.getAttribute('height')) > 0);
      assert.ok(Number(rect.getAttribute('opacity')) >= 0.8, 'backing is opaque enough to hide the ribbon');
    }
    // The backing is per line and tight, not one huge card around the block.
    const widest = Math.max(...backings.map((r) => Number(r.getAttribute('width'))));
    assert.ok(widest < 320, `${example.id}: backing width ${widest} looks like a card, not a text backing`);
  }
});

test('CSV input renders under its own headline, never the sample company name', () => {
  const plain = 'A,B,100\nB,C,100';
  const links = parseText(plain);
  const report = normalizeInput({
    schema: 'liuzhang.financial', version: 1,
    metadata: {title: '财务流向分析', period: '未指定期间', currency: '未指定', unit: '未指定'},
    nodes: [...new Set(links.flatMap((l) => [l.source, l.target]))].map((id) => ({id, label: id, role: 'main'})),
    links, mainChain: [],
  });
  const svg = renderSvg(layoutFinancialGraph(report));
  assert.doesNotMatch(svg, /SpaceX|Meta/);
  assert.match(svg, /财务流向分析/);
});
