#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';import {generateSvg} from '../src/core/index.js';
const [input,...args]=process.argv.slice(2),output=args[args.indexOf('--output')+1];
if(!input||!args.includes('--output')||!output){console.error('Usage: node scripts/render-financial.mjs report.json --output chart.svg [--gradient] [--strict-width]');process.exit(1);}
try{const svg=generateSvg(JSON.parse(await readFile(input,'utf8')),{ribbon:args.includes('--gradient')?'gradient':'solid',minWidth:args.includes('--strict-width')?0:4});await writeFile(output,svg);console.log(output);}catch(error){console.error(error.message);process.exitCode=1;}
