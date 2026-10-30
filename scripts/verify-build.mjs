import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
const walk = async (directory, prefix = '') => {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory()
    ? walk(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]));
  return groups.flat();
};
const files = await walk(root);
const html = await readFile(new URL('index.html', root), 'utf8');
assert(files.includes('index.html'), 'Missing workbench entry');
for (const name of ['financial-format', 'api', 'local-setup']) {
  for (const suffix of ['', '.zh-CN']) assert(files.includes(`${name}${suffix}.md`), `Missing Guide download: ${name}${suffix}`);
}
for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)) {
  assert((await stat(new URL(match[1], root))).isFile(), `Missing entry asset: ${match[1]}`);
}
const entry = html.match(/src="(\.\/assets\/[^"?#]+\.js)"/);
assert(entry, 'Missing module entry');
assert((await stat(new URL(entry[1], root))).size < 200_000, 'Workbench entry exceeds 200 kB; keep Excel lazy-loaded');
for (const file of files.filter(file => /assets\/excel-.*\.js$/.test(file))) {
  assert((await stat(new URL(file, root))).size < 1_100_000, 'Excel parser exceeds the 1.1 MB lazy-chunk budget');
}
const scripts = files.filter(file => /\.js$/.test(file));
assert(scripts.length >= 2, 'Excel must remain a separate lazy-loaded chunk');
assert(scripts.every(file => /assets\/[^/]+-[\w-]+\.js$/.test(file)), 'Script filenames must carry content hashes');
for (const file of files) {
  assert(file === 'index.html' || file === '.vite/license.md' || /^(?:financial-format|api|local-setup)(?:\.zh-CN)?\.md$/.test(file) || /^assets\/[^/]+-[\w-]+\.(?:js|css)$/.test(file), `Unexpected release file: ${file}`);
}
console.log(`Build boundary PASS: ${files.length} static assets; hashed scripts and bilingual Guide downloads.`);
