# Running locally, and what the source covers

**English** · [简体中文](local-setup.zh-CN.md)

For how to use the project see the root [README](../README.md). This document covers source-delivery matters: running offline, and the boundary beyond which data does not travel with the source.

## Version

`package.json` and the git tag are the version of record. `dist/` is build output and is not tracked; `npm run build` regenerates it, and the build is deterministic.

## Running the bundled page without installing anything

With Python 3 available, from the extracted directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

On Windows, where `python3` is not available, use `py -m http.server 8000 --bind 127.0.0.1 --directory dist` instead. Open http://127.0.0.1:8000 and press Ctrl+C to stop.

ES modules must be served over HTTP — **do not double-click the HTML** and open it via `file://`.

## Changing the source

Use Node.js 24.x (see `.nvmrc`) and npm; installing dependencies needs access to the npm registry, and running the app itself needs no account, key or backend. Build and test commands are in the root README.

Use `npm run dev` at http://127.0.0.1:4183 for live source edits. Run `npm run check` before review and `npm run build` to regenerate `dist/`. `npm run preview` serves the production build. Do not edit `dist/` directly.

## Data boundary

The deployment platform identity configuration, `.git`, `node_modules`, caches, QA screenshots and exports, account credentials and personal browser storage are not included.

Existing project data lives in the original browser's localStorage at the original URL and **does not travel with the source**. To migrate it, first use "Save project" on the original page to export JSON, then open that in the local page.

## Licence

MIT — see [LICENSE](../LICENSE). It covers the code in this repository. Third-party licence comments in the build output are preserved, and dependencies installed by `npm ci` carry their own licences.

## Dependency audit note

On 2026-10-30, `npm audit` reported two moderate dependency-chain alerts for ExcelJS → uuid ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). The advisory concerns UUID v3/v5/v6 methods with caller-provided output buffers. The installed ExcelJS source calls UUID v4 without a buffer. This limits applicability to the current application; it is not a general guarantee about the dependency. Keep the alerts visible until an upstream-compatible fix is available. No forced downgrade or override outside ExcelJS's declared version range is applied.
