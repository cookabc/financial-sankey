import spaceX from '../../examples/spacex-2026-q3.json' with {type:'json'};
import meta from '../../examples/meta-2026-q3.json' with {type:'json'};
import anthropic from '../../examples/anthropic-2026-h1.json' with {type:'json'};
import {toCSV} from '../core/table-data.js';
const entry=(id,document)=>({id,name:document.metadata.title,document,text:toCSV(document.links).replaceAll('\r\n','\n')});
export const EXAMPLES=[entry('spacex-2026-q3',spaceX),entry('meta-2026-q3',meta),entry('anthropic-2026-h1',anthropic)];
export const DEFAULT_EXAMPLE=EXAMPLES[0];
