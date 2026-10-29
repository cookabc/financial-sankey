# Running locally, and what the source covers

For how to use the project see the root [README](../README.md). This document only covers source-delivery matters: which version this corresponds to, running offline, and the boundary beyond which data does not travel with the source.

## Corresponding version

- Live site: https://financial-sankey-studio.chuangcius.chatgpt.site
- Latest saved Sites version: v15 (release record status `succeeded`, verified 2026-10-26).
- Source commit: `7504d0c5003cb697d4b2f971fe6bc328a3d9f1a5`.
- The application source, tests and build configuration are consistent with that commit; `SOURCE-PROVENANCE.json` records the SHA-256 of 72 tracked files. `dist/` is build output and is not tracked, so it is not hashed there — `npm run build` regenerates it and the build itself is deterministic.
- The export contains code only; the live site was not modified or republished.

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

The original repository provided no standalone project LICENSE file; this package does not grant a new open-source licence of its own. Third-party licence comments in the build output are preserved; dependencies installed by `npm ci` carry their own licences.

---

中文版见 [local-setup.zh-CN.md](local-setup.zh-CN.md)。
