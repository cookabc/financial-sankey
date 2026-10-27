import test from 'node:test';
import assert from 'node:assert/strict';
import { parseText, analyzeLinks, numberValue, rowsToLinks } from '../src/core/table-data.js';

test('CSV, TSV, commas, BOM, no header', () => {
  assert.equal(parseText('\ufeff来源\t去向\t金额\n甲\t乙\t1,200.25')[0].value, 1200.25);
  assert.equal(parseText('甲,乙,"1,200"')[0].value, 1200);
  assert.equal(parseText('source,target,value\na,b,2')[0].value, 2);
});

test('strict numbers', () => {
  for (const v of ['', '1,20', '¥10', '1e3', 'Infinity', 'NaN', '3%', '0x10']) assert.ok(Number.isNaN(numberValue(v)));
  assert.equal(numberValue('1，200.5'), 1200.5);
  assert.equal(numberValue('.5'), 0.5);
});

test('invalid data fails loudly', () => {
  for (const t of ['', '来源,去向,金额', '甲,乙,-2', '甲,,20', '甲,乙,x', '甲,乙,1,000', '甲,乙,"1']) assert.throws(() => parseText(t));
  assert.throws(() => analyzeLinks(parseText('甲,乙,2\n乙,甲,1')), /循环/);
  assert.throws(() => analyzeLinks(parseText('甲,甲,2')), /自身/);
  assert.throws(() => analyzeLinks(parseText('甲,乙,0')), /均为零/);
});

test('imbalance reported with no auto fillers', () => {
  const m = analyzeLinks(parseText('甲,乙,10\n乙,丙,8'));
  assert.equal(m.balanced, false);
  assert.equal(m.links.length, 2);
  assert.equal(m.warnings[0].diff, 2);
});

test('duplicates merge and zero flows stay in the data', () => {
  const m = analyzeLinks(parseText('甲,乙,10\n甲,乙,2\n甲,丙,0'));
  assert.equal(m.links[0].value, 12);
  assert.equal(m.warnings.length, 2);
  assert.equal(m.zeroLinks.length, 1, 'a zero flow is retained for the detail list');
});

test('labels and bounded datasets', () => {
  assert.throws(() => parseText('甲'.repeat(81) + ',乙,2'), /过长/);
  assert.throws(() => parseText(Array(201).fill('a,b,2').join('\n')), /200/);
  assert.doesNotThrow(() => analyzeLinks(parseText('产品收入（中国大陆市场）,营业收入合计,2800')));
});

test('rows from a spreadsheet keep their numbers without re-parsing text', () => {
  const links = rowsToLinks([['来源', '去向', '金额'], ['营收', '毛利', 1200], ['毛利', '净利', 960]]);
  assert.deepEqual(links, [
    {source: '营收', target: '毛利', value: 1200},
    {source: '毛利', target: '净利', value: 960},
  ]);
});
