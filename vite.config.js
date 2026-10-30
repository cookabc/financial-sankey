import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const documents = ['financial-format.md', 'financial-format.zh-CN.md', 'api.md', 'api.zh-CN.md', 'local-setup.md', 'local-setup.zh-CN.md'];
const readDocument = name => readFile(new URL(`./docs/${name}`, import.meta.url));

export default defineConfig({
  root: `${projectRoot}src`,
  base: './',
  publicDir: false,
  server: { port: 4183, strictPort: true },
  preview: { port: 4183, strictPort: true },
  build: { outDir: `${projectRoot}dist`, emptyOutDir: true, target: 'es2022', license: true },
  plugins: [{
    name: 'workbench-documents',
    // Keep Guide downloads available both during development and after build.
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split('?')[0].slice(1);
        if (!documents.includes(name)) return next();
        void readDocument(name).then(body => {
          response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          response.end(body);
        }).catch(next);
      });
    },
    async generateBundle() {
      for (const name of documents) this.emitFile({ type: 'asset', fileName: name, source: await readDocument(name) });
    },
  }],
});
