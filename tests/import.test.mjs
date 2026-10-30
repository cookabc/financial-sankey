import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportCoordinator, readImportFile } from '../src/browser/import.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
test('latest import wins even when files finish out of order', async () => {
  const older = deferred(), newer = deferred(), committed = [], failures = [], pending = [];
  const importer = createImportCoordinator({
    read: file => file === 'old' ? older.promise : newer.promise,
    commit: result => committed.push(result), onError: error => failures.push(error), onPending: value => pending.push(value),
  });
  const first = importer.import('old'), second = importer.import('new');
  newer.resolve('new chart');await second;
  older.reject(new Error('old file invalid'));await first;
  assert.deepEqual(committed, ['new chart']);assert.deepEqual(failures, []);
  assert.deepEqual(pending, [true, true, false]);
});
test('editing cancels a pending import and its stale error', async () => {
  for (const rejected of [false, true]) {
    const request = deferred(), committed = [], failures = [], pending = [];
    const importer = createImportCoordinator({ read: () => request.promise, commit: value => committed.push(value), onError: error => failures.push(error), onPending: value => pending.push(value) });
    const task = importer.import('file');importer.cancel();
    if (rejected) request.reject(new Error('cancelled'));else request.resolve('stale');
    await task;
    assert.deepEqual(committed, []);assert.deepEqual(failures, []);assert.equal(pending.at(-1), false);
  }
});
test('failed commit reports validation and always clears the busy state', async () => {
  const failures = [], pending = [];
  const importer = createImportCoordinator({ read: async () => ({}), commit: () => { throw new Error('cyclic flow'); }, onError: error => failures.push(error.message), onPending: value => pending.push(value) });
  await importer.import('file');assert.deepEqual(failures, ['cyclic flow']);assert.deepEqual(pending, [true, false]);
});
test('read boundary enforces sizes, extensions, project schema and table validation', async () => {
  const file = (name, text, size = 10) => ({ name, size, text: async () => text });
  const table = await readImportFile(file('flow.csv', 'A,B,10\nB,C,10'));
  assert.equal(table.kind, 'table');assert.equal(table.links.length, 2);
  await assert.rejects(readImportFile(file('huge.csv', '', 6 * 1024 * 1024)), /too large/);
  await assert.rejects(readImportFile(file('huge.json', '', 2 * 1024 * 1024), { projectOnly: true }), /too large/);
  await assert.rejects(readImportFile(file('flow.csv', ''), { projectOnly: true }), /JSON/);
  await assert.rejects(readImportFile(file('bad.json', '{"schema":"unknown"}')));
  await assert.rejects(readImportFile(file('bad.csv', 'A,B,-10')));
  await assert.rejects(readImportFile(file('file.pdf', '')), /CSV/);
});
