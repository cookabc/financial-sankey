/**
 * Path tracing for the rendered chart.
 *
 * A Sankey reads as a set of independent ribbons until you ask one question:
 * "where does this number come from, and where does it go?" Answering that is
 * the difference between a picture and an insight, so the trace is computed
 * here as pure data and the view only paints it.
 *
 * No DOM, no state: same input, same sets.
 */

/** Link identity for set membership. */
const keyOf = (link) => `${link.source.id}\u0000${link.target.id}`;

/**
 * Every link and node on the way in to `nodeId` (what feeds it) and on the way
 * out (what it feeds). One node in the middle of the chain highlights the whole
 * causal path, which is the thing the eye cannot follow on its own.
 */
export function tracePath(graph, nodeId) {
  const nodes = new Set([nodeId]);
  const links = new Set();
  const outgoing = new Map(), incoming = new Map();
  for (const link of graph.links) {
    if (!outgoing.has(link.source.id)) outgoing.set(link.source.id, []);
    outgoing.get(link.source.id).push(link);
    if (!incoming.has(link.target.id)) incoming.set(link.target.id, []);
    incoming.get(link.target.id).push(link);
  }
  const walk = (start, map) => {
    const seen = new Set([start]), queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const link of map.get(queue[i]) ?? []) {
        links.add(keyOf(link));
        const next = map === outgoing ? link.target.id : link.source.id;
        nodes.add(next);
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
  };
  walk(nodeId, outgoing);
  walk(nodeId, incoming);
  return {nodes, links};
}

/**
 * The denominator a reader actually wants: total revenue. Uses the explicit
 * revenue metric when the document declares one, otherwise the total flowing
 * out of every leaf source. Returns 0 when the graph has no positive flow, so
 * callers can stay silent instead of dividing by it.
 */
export function revenueBasis(graph) {
  const declared = graph.nodes.find((n) => n.metric === "revenue" && (n.signedValue ?? n.value) > 0);
  if (declared) return Math.abs(declared.signedValue ?? declared.value);
  const incoming = new Set(graph.links.map((l) => l.target.id));
  return graph.nodes
    .filter((n) => !incoming.has(n.id) && (n.signedValue ?? n.value) > 0)
    .reduce((sum, n) => sum + Math.abs(n.signedValue ?? n.value), 0);
}

/**
 * This node's amount as a share of total revenue, in 0..1, or null when there
 * is no meaningful basis. "研发费用 is 31.5% of revenue" is the sentence the
 * reader came for; a raw figure alone does not say whether it matters.
 */
export function shareOfRevenue(graph, nodeId) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  const basis = revenueBasis(graph);
  const amount = Math.abs(node?.signedValue ?? node?.value ?? 0);
  if (!node || !(basis > 0) || !(amount > 0)) return null;
  return Math.min(1, amount / basis);
}

/**
 * Human-readable summary of one node in context: its amount, its share of
 * revenue, and how the path reaches and leaves it.
 */
export function describeTrace(graph, nodeId, unit) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return {
    label: node.label ?? nodeId,
    value: node.signedValue ?? node.value,
    unit,
    share: shareOfRevenue(graph, nodeId),
    feeds: new Set(node.sourceLinks.map((l) => l.target.id)).size,
    fedBy: new Set(node.targetLinks.map((l) => l.source.id)).size,
  };
}
