/** Public, browser-independent API. All functions leave caller input unchanged. */
import {normalizeInput,normalizeFinancialGraph,buildIncomeStatement} from './financial-data.js';
import {parseText,rowsToLinks,analyzeLinks,toCSV} from './table-data.js';
import {layoutFinancialGraph} from './layout.js';
import {renderSvg} from './render-svg.js';
export {normalizeInput,normalizeFinancialGraph,buildIncomeStatement,parseText,rowsToLinks,analyzeLinks,toCSV,layoutFinancialGraph,renderSvg};
/** Validate → lay out → serialize. Refuses unbalanced exports. */
export function generateSvg(input,options={}) {
  const diagram=layoutFinancialGraph(normalizeInput(input),options);
  if(!diagram.model.balanced)throw new Error('Unbalanced intermediate nodes: fix reconciliation before export.');
  return renderSvg(diagram);
}
