#!/usr/bin/env node
/**
 * Real-font-metric label audit for the built site.
 *
 * The unit tests measure label boxes with a width estimate (CJK 1 cell, Latin
 * ~0.55). That estimate is deliberately conservative, but it is still an
 * estimate. This script loads dist/ in a real browser and measures actual glyph
 * ink extents with canvas measureText, so "labels do not collide" is verified
 * against the same typesetting the user sees.
 *
 * Zero dependencies: it drives Chrome over the DevTools protocol with the
 * built-in WebSocket client.
 *
 *   python3 -m http.server 8123 --bind 127.0.0.1 --directory dist
 *   node scripts/verify-labels.mjs [--port 8123] [--chrome /path/to/chrome]
 *
 * Exit code 0 means no ink collision and nothing outside the canvas.
 */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const HTTP_PORT = arg('--port', '8123');
const CHROME = arg('--chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const CDP_PORT = Number(arg('--cdp-port', '9345'));
const ORIGIN = `http://127.0.0.1:${HTTP_PORT}/`;

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Pass --chrome /path/to/chrome.`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', `--user-data-dir=/tmp/cdp-verify-labels-${process.pid}`, '--window-size=1800,1400', 'about:blank'], {stdio: 'ignore'});

let ws, nextId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({id, method, params}));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails.exception ?? result.exceptionDetails));
  return result.result.value;
};

// Ink extents come from canvas measureText: the box the glyphs actually paint,
// not the CSS line box (which also contains ascent/descent leading and would
// report adjacent lines of one label as "overlapping").
const MEASURE = `(() => {
  const svg = document.getElementById('sankey');
  if (!svg) return {error: 'no #sankey'};
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  const sr = svg.getBoundingClientRect();
  const scale = sr.width / vb[2];
  const ctx = document.createElement('canvas').getContext('2d');
  const boxes = [];
  const collect = (el, scope) => {
    const size = Number(el.getAttribute('font-size'));
    const family = el.getAttribute('font-family') || getComputedStyle(el).fontFamily;
    ctx.font = size + 'px ' + family;
    const m = ctx.measureText(el.textContent);
    const asc = m.actualBoundingBoxAscent ?? size * 0.78;
    const desc = m.actualBoundingBoxDescent ?? size * 0.22;
    const x = Number(el.getAttribute('x')), y = Number(el.getAttribute('y'));
    const anchor = el.getAttribute('text-anchor') || 'start';
    const x0 = anchor === 'middle' ? x - m.width / 2 : anchor === 'end' ? x - m.width : x;
    const r = el.getBoundingClientRect();
    boxes.push({
      text: el.textContent, scope,
      x0, x1: x0 + m.width, y0: y - asc, y1: y + desc,
      lineX0: (r.left - sr.left) / scale, lineX1: (r.right - sr.left) / scale,
      lineY0: (r.top - sr.top) / scale, lineY1: (r.bottom - sr.top) / scale,
    });
  };
  for (const g of svg.querySelectorAll('.sankey-node')) for (const t of g.querySelectorAll('text')) collect(t, 'node');
  for (const t of svg.querySelectorAll('svg > text')) collect(t, 'chrome');
  // Self-evidence: report what the page thinks it rendered, so a failed
  // generate (which leaves the previous chart on screen) cannot masquerade as
  // a passing state.
  return {boxes, w: vb[2], h: vb[3], title: document.getElementById('title-input').value,
    status: document.getElementById('chart-status').textContent,
    error: document.getElementById('input-error').hidden ? null : document.getElementById('input-error').textContent,
    nodes: svg.querySelectorAll('.sankey-node').length};
})()`;

const STATES = [
  ['SpaceX financial (default)', null],
  ['SpaceX auto layout', `document.getElementById('chain-input').value='';document.getElementById('chain-input').dispatchEvent(new Event('change'));`],
  ['Meta financial', `document.querySelector('[data-example="1"]').click();document.getElementById('sample-dialog').close();`],
  ['Meta auto layout', `document.querySelector('[data-example="1"]').click();document.getElementById('sample-dialog').close();document.getElementById('chain-input').value='';document.getElementById('chain-input').dispatchEvent(new Event('change'));`],
  // The only official sample built on a loss bridge: it carries a labelled
  // non-cash deficit node and no financial rail, so its label column is the
  // densest of the three real statements.
  ['Anthropic loss bridge', `document.querySelector('[data-example="2"]').click();document.getElementById('sample-dialog').close();`],
  ['pasted CSV with English labels', `const t=document.getElementById('data-text');t.value='Revenue from operations,Cost of revenue,6880\\nRevenue from operations,Gross profit,5920\\nGross profit,Operating expenses,4100\\nGross profit,Operating income,1820\\nOperating income,Net income,1820';t.dispatchEvent(new Event('input'));document.getElementById('generate-btn').click();`],
  ['single flow (zero-balance quick form)', `document.getElementById('finance-tab').click();const v={revenue:100,cost:100,sales:0,rnd:0,finance:0,tax:0,rnd:0,admin:0};for(const [k,x] of Object.entries(v)){const e=document.getElementById('f-'+k);if(!e)continue;e.value=x;e.dispatchEvent(new Event('input'));}document.getElementById('generate-btn').click();`],
  // Stress: near-identical labels that wrap the same way, stacked in one
  // column — the case the declutter pass exists for.
  ['identical-width labels stacked (auto)', `const rows=[];for(let i=0;i<6;i++)rows.push('细分收入来源'+String(i+1).padStart(2,'0')+',汇总,100');rows.push('汇总,支出甲,300');rows.push('汇总,支出乙,300');const t=document.getElementById('data-text');t.value=rows.join('\\n');t.dispatchEvent(new Event('input'));document.getElementById('generate-btn').click();`],
  // Stress: the 80-node ceiling. 80 nodes exactly: 79 links, no extra terminal.
  ['80-node chain (auto)', `const rows=[];for(let i=0;i<79;i++)rows.push('环节'+String(i).padStart(2,'0')+',环节'+String(i+1).padStart(2,'0')+',100');const t=document.getElementById('data-text');t.value=rows.join('\\n');t.dispatchEvent(new Event('input'));document.getElementById('generate-btn').click();`],
];

async function connect() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
        };
        await new Promise((resolve) => { ws.onopen = resolve; });
        return;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('Could not attach to Chrome. Is the HTTP server running?');
}

let failures = 0;
let totalInk = 0;
try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 1800, height: 1400, deviceScaleFactor: 2, mobile: false});

  for (const [name, setup] of STATES) {
    await send('Page.navigate', {url: ORIGIN});
    await sleep(400);
    await evaluate('localStorage.clear()');
    await send('Page.navigate', {url: ORIGIN});
    await sleep(2000);
    if (setup) await evaluate(setup);
    await sleep(700);
    await evaluate('document.fonts.ready.then(()=>true)');
    await sleep(300);

    const measured = await evaluate(MEASURE);
    if (measured.error) { console.log(`\n### ${name}\n  SKIP: ${measured.error}`); failures++; continue; }
    const {boxes, w, h} = measured;
    console.log(`\n### ${name}  canvas ${w.toFixed(0)}x${h.toFixed(0)}  nodes ${measured.nodes}  status "${measured.status}"`);
    if (measured.error || /△/.test(measured.status ?? '')) {
      console.log(`  FAIL: the state did not render cleanly (error: ${measured.error ?? 'unbalanced/status'})`);
      failures++;
      continue;
    }

    const ink = [];
    let leading = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const iox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const ioy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (iox > 1 && ioy > 1) { ink.push(`"${a.text}" x "${b.text}" ${iox.toFixed(1)}x${ioy.toFixed(1)}px`); continue; }
        const lox = Math.min(a.lineX1, b.lineX1) - Math.max(a.lineX0, b.lineX0);
        const loy = Math.min(a.lineY1, b.lineY1) - Math.max(a.lineY0, b.lineY0);
        if (lox > 1 && loy > 1) leading++;
      }
    }
    const outside = boxes.filter((b) => b.lineX0 < -1 || b.lineX1 > w + 1 || b.lineY0 < -1 || b.lineY1 > h + 1).map((b) => b.text);

    console.log(`  texts ${boxes.length}`);
    console.log(`  ink collisions: ${ink.length}`);
    ink.slice(0, 8).forEach((line) => console.log('    ', line));
    console.log(`  adjacent line boxes (normal leading): ${leading}`);
    console.log(`  outside canvas: ${outside.length}${outside.length ? ' -> ' + outside.join(', ') : ''}`);
    totalInk += ink.length + outside.length;
    if (ink.length || outside.length) failures++;
  }

  console.log(`\n=== ${STATES.length} states, ${totalInk} real ink collisions or out-of-canvas labels ===`);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}

process.exit(failures === 0 ? 0 : 1);
