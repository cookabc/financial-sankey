/**
 * Dataset-replacement policy and node-ordering math. DOM-free and side-effect
 * limited to the state objects passed in, so the UI tests can exercise the
 * rules without a page.
 */

/** The four headline fields that travel with a document, not with a style. */
export const HEADLINE_FIELDS = ["title", "period", "currency", "unit"];

/** Neutral headline for a dataset of unknown origin. Deliberately not
 * DEFAULT_CONFIG: a blank quick form may default to 万元, but an unknown
 * dataset must not claim a unit it was never given. */
export const NEUTRAL_HEADLINE = { title: "财务流向分析", period: "未指定期间", currency: "未指定", unit: "未指定" };

/**
 * A new dataset must not keep the previous document's headline, or an export
 * names a company that produced none of these numbers. `force` handles the
 * file-import case, where the replacement is unconditional. Returns true when
 * the inherited headline was dropped so the caller can refresh the inputs.
 */
export function dropInheritedHeadline(state, { force = false } = {}) {
  if (!force && !state.document && !state.reportId) return false;
  for (const key of HEADLINE_FIELDS) state.config[key] = NEUTRAL_HEADLINE[key];
  state.reportId = null;
  state.document = null;
  return true;
}

/** Siblings share a column; under the financial rail they also share a group. */
export function orderedSiblings(graph, node) {
  return graph.nodes.filter((n) => n.layer === node.layer && (!graph.rail || n.railGroup === node.railGroup)).sort((a, b) => a.y0 - b.y0);
}

/** Id of the sibling one step up (-1) or down (1), or null at either end. */
export function adjacentSibling(graph, id, direction) {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return null;
  const siblings = orderedSiblings(graph, node);
  const j = siblings.findIndex((m) => m.id === id) + direction;
  return j < 0 || j >= siblings.length ? null : siblings[j].id;
}

/** Drawing order of the whole canvas, used as the persisted node order. */
export function canvasOrder(graph) {
  return graph.nodes.slice().sort((a, b) => a.layer - b.layer || a.y0 - b.y0).map((n) => n.id);
}

/** Swap two ids inside an order array; unknown ids return the array unchanged. */
export function swapInOrder(order, a, b) {
  const next = [...order];
  const i = next.indexOf(a), j = next.indexOf(b);
  if (i < 0 || j < 0) return order;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
