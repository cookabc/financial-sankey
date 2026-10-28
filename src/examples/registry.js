import spaceX from '../../examples/spacex-2026-q3.json' with {type:'json'};
import meta from '../../examples/meta-2026-q3.json' with {type:'json'};
import anthropic from '../../examples/anthropic-2026-h1.json' with {type:'json'};
import aapl from '../../examples/us-aapl-fq3-2025.json' with {type:'json'};
import msft from '../../examples/us-msft-fy25q4.json' with {type:'json'};
import nvda from '../../examples/us-nvda-fq2-2026.json' with {type:'json'};
import googl from '../../examples/us-googl-q3-2025.json' with {type:'json'};
import amzn from '../../examples/us-amzn-q3-2025.json' with {type:'json'};
import intc from '../../examples/us-intc-fq2-2025.json' with {type:'json'};
import {toCSV} from '../core/table-data.js';
import {normalizeInput} from '../core/financial-data.js';
// Samples may be authored as canonical graphs or ordered statements. The stored
// document is always the normalized canonical graph, which is what every caller
// (layout, three-column text, project loading) expects; normalizeInput on an
// already-normalized report is a stable no-op.
const entry=(id,source)=>{const document=normalizeInput(source);return {id,name:document.metadata.title,document,text:toCSV(document.links).replaceAll('\r\n','\n')};};
export const EXAMPLES=[entry('spacex-2026-q3',spaceX),entry('meta-2026-q3',meta),entry('anthropic-2026-h1',anthropic),entry('us-aapl-fq3-2025',aapl),entry('us-msft-fy25q4',msft),entry('us-nvda-fq2-2026',nvda),entry('us-googl-q3-2025',googl),entry('us-amzn-q3-2025',amzn),entry('us-intc-fq2-2025',intc)];
export const DEFAULT_EXAMPLE=EXAMPLES[0];
