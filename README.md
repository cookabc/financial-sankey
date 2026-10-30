# 流账 · Financial Sankey Studio

A pure-static financial-sankey workbench **and** a standalone JavaScript API. The interface opens in English with a switch to Chinese in the top bar. Data is processed only on your machine — no external API, no account link, no analytics, no CDN. Feed it a normalized financial statement, or three-column flow data; it does not read PDFs, run OCR, or parse free-form prose.

<p align="center">
  <img src="docs/images/workspace.png" width="880" alt="Workbench: paste three-column flow data on the left, a SpaceX 2026 Q3 profit-flow sankey on the right, with source attribution and a conservation check at the bottom">
</p>

The image above is the default state after loading SpaceX's official 2026 Q3 statement: revenue flows in from the left, cost and expenses flow down, net income sits on the right; green marks extra income. The source and basis are noted under the chart, and the status bar states the conservation result ("flows balanced · 17 nodes · 16 links").

- [Financial data format](docs/financial-format.md): explicit role / stage / mainChain and income-statement stage definitions.
- [API, CLI and module boundaries](docs/api.md) · [中文](docs/api.zh-CN.md): output SVG without opening the page.
- [Local run & source notes](docs/local-setup.md) · [中文](docs/local-setup.zh-CN.md): version provenance, running offline, and the boundary that saved projects do not travel with the source.
- [External official samples](examples/): SpaceX 2026 Q3, Meta 2026 Q3 and Anthropic 2026 H1 (S-1). Source and calculation notes are exported with the figure and are not part of the core logic.

## Usage

Node.js 22+: `npm ci`, `npm test`, `npm run build`. Static output is in `dist/`.
`npm run verify:labels` renders the built `dist/` in headless Chrome and asserts that
no label collides or leaves the canvas across nine states; serve `dist/` on port 8123
before running it.

```sh
node scripts/render-financial.mjs examples/spacex-2026-q3.json --output chart.svg
```

The page supports CSV / TSV paste upload, multi-sheet XLSX, two structured statement JSON formats, local project save, SVG / PNG export, solid and gradient ribbons, an adjustable minimum display line width, and an option to disable enhancement.

## Honest data boundaries

The three-column table accepts only non-negative, acyclic flows. A normalized statement can model tax benefits, negative adjustments and operating / net loss explicitly; a loss uses a documented non-cash accounting bridge, not extra income. Missing values, mixed currencies/units, or decimal sums that cannot be preserved exactly all raise an explicit error — it never takes absolute values to hide a problem, and never silently balances or converts. An imbalance is previewable but must be corrected before export.

Legacy JSON data, colours and an explicit auto-layout choice are preserved. Recent projects still live under the original browser localStorage key; opening or importing never uploads their contents.

## Verification

All v10 node / ribbon geometry snapshots are kept, with regressions for the top-edge output, narrow right-angle rectangles, true proportions, natural left/right branching and thin-line display. Tests cover many synthetic statement structures, that renaming does not change semantics, loss recovery, decimals, zero values, mixed currencies, broken-conservation cases, hostile text, project read/write, CSV/XLSX, the CLI and the UI. Synthetic data lives only in `fixtures/` for tests and is never used as an on-page company example; `fixtures/us/` holds six real US-statement reports verified line-by-line against SEC EDGAR XBRL-rendered statements (Apple, Microsoft, NVIDIA, Alphabet, Amazon, Intel), used only as test input, with derived / residual line items clearly labelled in each file's notes.

`src/core/index.js` is the only public API. Source and build output are committed in small, synchronised steps; the static package and the saved version use the same commit.

## Licence

MIT, see [LICENSE](LICENSE).

中文说明见 [README.zh-CN.md](README.zh-CN.md)。
