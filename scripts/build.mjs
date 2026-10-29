import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('dist', { recursive: true });
await build({entryPoints:['src/app.js'], bundle:true, minify:true, outfile:'dist/app.js', target:['es2022'], format:'esm', external:['./excel.js'], legalComments:'eof'});
await build({entryPoints:['src/excel.js'], bundle:true, minify:true, outfile:'dist/excel.js', target:['es2022'], format:'esm', legalComments:'eof'});
for(const file of ['index.html','style.css']) await copyFile('src/'+file,'dist/'+file);

// Version bundled assets so a normal refresh cannot keep an earlier layout engine.
let html=await readFile('dist/index.html','utf8');
for(const file of ['app.js','style.css']){const hash=createHash('sha256').update(await readFile('dist/'+file)).digest('hex').slice(0,12);html=html.replaceAll('./'+file,'./'+file+'?v='+hash);}
await writeFile('dist/index.html',html);

for(const file of ['financial-format.md','api.md','api.zh-CN.md','local-setup.md','local-setup.zh-CN.md'])await copyFile('docs/'+file,'dist/'+file);
