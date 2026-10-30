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

You need Node.js 22+ and npm; installing dependencies needs access to the npm registry, and running the app itself needs no account, key or backend. Build and test commands are in the root README.

After editing `src/`, run `npm run build` again and refresh. Do not treat `dist/` as an editing entry point.

## Data boundary

The deployment platform identity configuration, `.git`, `node_modules`, caches, QA screenshots and exports, account credentials and personal browser storage are not included.

Existing project data lives in the original browser's localStorage at the original URL and **does not travel with the source**. To migrate it, first use "Save project" on the original page to export JSON, then open that in the local page.

## Licence

MIT — see [LICENSE](../LICENSE). It covers the code in this repository. Third-party licence comments in the build output are preserved, and dependencies installed by `npm ci` carry their own licences.
