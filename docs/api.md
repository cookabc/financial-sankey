# Liuzhang: a reusable financial Sankey chart

**English** · [简体中文](api.zh-CN.md)

This tool works on any company's **structured financial statement, already normalised to the spec**. It is not a PDF/OCR tool or a natural-language recogniser. Both running and rendering happen locally; no external API is involved. Company names, node display text and the actual amounts do not influence layout choice; the semantics come from explicit role, mainChain, metric and metadata.

## Module boundaries

- `src/core/financial-data.js`: normalisation, currency and unit consistency, accounting-equation validation, profit-bridge construction. Pure functions that do not mutate their input.
- `src/core/table-data.js`: three-column CSV/TSV parsing, generic DAG analysis, CSV serialisation.
- `src/core/layout.js` / `top-layout.js`: d3-sankey automatic layout; an eligible explicit main chain uses a top-aligned financial layout. When it cannot be applied, a reason is returned and automatic layout is used.
- `src/core/theme.js`: role-driven colouring that does not match on node names.
- `src/core/render-svg.js`: pure SVG string output with no DOM, filesystem or network dependency.
- `src/core/trace.js`: causal path tracing and share-of-revenue. Given a node it returns its complete upstream and downstream causal path (a set of nodes plus a set of flows) and that node's percentage of revenue. Pure functions for page interaction; they take no part in layout.
- `src/browser/project.js`: project-file read/write, the page's quick-fill and the three-column table adapter; it does not overwrite the original data or custom colours.
- `src/browser/session.js`: page-independent session policy — the headline reset rule when the data source changes, node sibling columns and sorting maths. Pure functions, testable without the page.
- `src/browser/panels.js`: rendering of the source card and the data detail table.
- `src/browser/feedback.js`: transient feedback such as toasts and hover hints.
- `src/browser/export.js`: browser-only download, PNG canvas conversion and export orchestration (button state, result announcement).
- `src/app.js`: page state and event wiring; policy lives in `session.js`, rendering in `panels.js`.
- `examples/`: verifiable external real-world samples. Everything in `fixtures/` is explicitly labelled synthetic test data and is never presented as a company's financials.

## Install and command line

Requires Node.js 22+. Run `npm ci` in the source directory.

```sh
node scripts/render-financial.mjs examples/spacex-2026-q3.json --output chart.svg
node scripts/render-financial.mjs fixtures/tax-benefit-income.json --output chart.svg --gradient
```

`--strict-width` disables the minimum visible band width. The CLI does not read browser storage, make network requests or verify the source page automatically. PNG is the page's browser export capability; the CLI emits SVG natively.

## JavaScript API

```js
import { readFile, writeFile } from 'node:fs/promises';
import { normalizeInput, layoutFinancialGraph, renderSvg, generateSvg } from './src/core/index.js';

const input = JSON.parse(await readFile('report.json', 'utf8'));
const svg = generateSvg(input, { palette: 'clear', ribbon: 'solid', minWidth: 4 });
await writeFile('report.svg', svg);

// Step by step: you may surface unbalanced diagnostics, but must not pass them off as a verified export:
const report = normalizeInput(input);
const diagram = layoutFinancialGraph(report, { layout: 'financial' });
console.log(diagram.model.warnings, diagram.rail?.reason);
if (diagram.model.balanced) console.log(renderSvg(diagram));
```

Format details are in [financial-format.md](./financial-format.md). Two explicit schemas: `liuzhang.financial` for a custom DAG, or `liuzhang.income-statement` for a staged income statement. Both the page upload and opening a project accept either JSON.

## Rendering conventions and limits

- A rectangle's real height is proportional to its flow value. The main chain leaves the top of the source node's right edge; income merging in from the left of the target is allowed to curve naturally.
- The minimum band width defaults to 4 canvas pixels and is an independent display enhancement that never rewrites an amount. Display band width and node height are adjusted together, and displayed ports stay conserved; the explanation lives in the usage guide and style help, and the chart carries no drawing-note footnote. A value of 0 is strict proportionality.
- Structured input declares an explicit company, period, currency and unit; mixed currencies or units are rejected and never auto-converted.
- A loss uses an explicitly labelled **non-cash accounting difference bridge** and falls back to automatic layout, rather than treating the difference as revenue. The sum of all source nodes should not be called revenue.
- A missing item must either be an explicit 0 or be omitted from the structure; leaving it blank and defaulting to zero is not allowed. All-zero data is valid but has no drawable width, and drawing reports an error.
- The raw three-column table expresses only non-negative, acyclic flows; unknown semantics are not guessed into financial metrics. An explicit main chain may set node IDs in the style; if they cannot be matched it falls back.
- Structured JSON preserves custom display names and provenance; editing the three-column table directly clears the original structured semantics and provenance links, so modified values are never still labelled as official original data.
- Project files accept only the current format (`liuzhang.sankey` version 2); other versions raise an explicit error rather than being silently rewritten or guessed at.
- Intermediate node imbalance must be resolved before export. Cycles, non-numbers and decimal sums that cannot be preserved exactly raise explicit errors; no hidden difference is inserted.
- Provenance is a description supplied by the caller and does not mean the tool independently audited or verified anything. The generated chart is an accounting composition bridge, not a cash-flow statement.

## Verification

`npm test` covers geometry snapshots, arbitrary ID/label transformations, positive and negative profit, tax benefit, zero values, decimals, currency and units, project read/write, the CLI, CSV/XLSX, export and UI error flows; `npm run build` bundles the static site.

### Known support envelope

This is not an unconditional guarantee for any company or any financial statement. An income statement must first be normalised into the stages and additive/subtractive items described above; balance sheets and cash-flow statements are not automatically converted into a profit bridge and must first be modelled by the caller as a conserving DAG. At most 80 nodes; the three-column table entry accepts at most 200 flows. A financial main chain requires 2–12 consecutive nodes, independent additive sources and a direct deduction endpoint; complex networks or a loss bridge fall back to automatic layout. Dense sources widen the canvas rather than dropping items, but crowded charts should still have their labels reviewed by eye.

Extremely small values that overflow the scale, or an amount span that pushes positive flows below floating-point coordinate precision, both raise explicit errors instead of producing a NaN/Infinity chart. Follow the message to pick a suitable common unit; if the ratio itself is too large, split the chart or round explicitly as the caller. Nothing is silently back-filled or absolute-valued. The minimum band width only enhances the visible part: a whole band uses the same display width at both its source and target, its top and bottom boundaries are each a standard cubic Bézier, and there is no local necking or tapered edge; adjacent bands fill the node height in display-port order, so they never overlap each other.

Node labels are laid out uniformly before drawing: first clamped between the header and the footnote, then labels whose horizontal ranges overlap are vertically dodged; if dodging pushes past the canvas, the canvas grows downwards rather than squeezing labels back on top of their neighbours. Label rows that cross a band get an opaque paper-coloured backing. Wrapping is computed from character widths (Chinese 1 unit, Latin about 0.55 units) while keeping Latin words intact.

Tests cover multi-structure synthetic samples and known counter-examples; they are not a guarantee of visual quality for every chart.

Chart interaction: hovering any node or band highlights its complete causal path and fades the rest, and shows that node's amount and **percentage of revenue** above the chart — a raw number cannot say whether something matters, "R&D is 31.5% of revenue" can. Tracing only toggles CSS classes and does not rebuild the SVG, so hovering causes zero redraws; tracing never enters an exported SVG (export renders from the layout result, not from live DOM).

Label dodging is computed from estimated character widths before rendering. To avoid "estimated correctly, but the real font collides anyway", `npm run verify:labels` loads the build output in headless Chrome, measures real glyph ink extents with canvas `measureText`, compares every pair across nine states (financial/automatic layout for the three official examples, the loss bridge, English CSV, single-flow quick-fill, equal-width label stacking, the 80-node long chain) and checks for overflow beyond the canvas; the current result is 0 collisions and 0 overflows. It needs a local HTTP server:

```sh
python3 -m http.server 8123 --bind 127.0.0.1 --directory dist
npm run verify:labels
```

The script covers only those nine states. Extremely dense or genuinely new data structures should still get one visual review.

### Display-width solver

Monetary `value` and proportional `actualWidth` never change. `width` is the
rendered vertical band width, including at both node endpoints. Each internal
node independently packs incoming and outgoing ports to its displayed height.

For minimum m, solve min sum(delta_e² / (2(1 + actualWidth_e))) subject to
delta_e >= max(0, m - actualWidth_e) and B delta = 0. Weighted Dykstra has a
2,000-iteration bound; acceptance requires iterate change < 1e-9 px and
conservation residual < 1e-8 px. A nonconverged iterate is never rendered.
The bounded fallback extends every deficit to whole source-to-sink paths using
the original flow proportions; it is feasible, deterministic, and not claimed
to be least-change. It takes O(V+E). Final residual must be <= 1e-7 px or an
explicit error is returned. Graph diagnostics expose method, iterations,
residual and objective. No labels or IDs enter the optimization. Repeated
layout starts from actual widths, so enhancements do not accumulate.

Minimum 0 disables all display additions. Minimum is measured vertically in
SVG canvas pixels, not perpendicular to strongly sloping bands or in CSS
viewport pixels. No output can guarantee arbitrary label collision freedom.
