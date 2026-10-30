import { allocateDisplayFlow, packDisplayPorts } from "./display-flow.js";
import { sankey } from "d3-sankey";
import { analyzeLinks } from "./table-data.js";
import { wrap } from "./svg-tree.js";
import { financialRail } from "./top-layout.js";
function assertNumericRange(report, model, height, financial) {
  const largest = Math.max(...model.nodes.map((node) => Math.max(node.in, node.out)));
  const smallest = Math.min(...report.links.filter((link) => link.value > 0).map((link) => link.value));
  // Keep the existing arithmetic and geometry. Reject scales that could overflow
  // before d3 computes height / flow, rather than silently rescaling the amounts.
  if (!Number.isFinite(largest) || !(largest > 0) || !Number.isFinite(height / largest)) {
    throw new RangeError("金额数量级超出当前布局可安全计算的范围。请换用更小的统一单位后重试；原始金额未被改写。");
  }
  // A positive flow must remain distinguishable from zero in screen coordinates.
  // The rail uses a 180px reference height; retain at least that precision even
  // when auto layout is selected, so switching layouts cannot hide tiny amounts.
  const reference = Math.max(height, financial ? 1080 : 0), projectedWidth = smallest / largest * 180;
  if (!(projectedWidth > 0) || reference + projectedWidth === reference) {
    throw new RangeError("金额跨度过大，最小正流量低于当前图表的数值精度。请拆分图表或提供明确舍入后的数据；不会自动舍弃或改写金额。");
  }
}
function assertFiniteGeometry(graph, width, height, rail = null) {
  const finite = (...values) => values.every(Number.isFinite);
  const invalidNode = graph.nodes.some((node) => !finite(node.value, node.x0, node.x1, node.y0, node.y1) || !(node.value > 0 && node.x1 > node.x0 && node.y1 > node.y0) || node.railPorts && (!finite(node.railPorts.height, node.railPorts.top) || !(node.railPorts.height > 0)));
  const invalidLink = graph.links.some((link) => !finite(link.value, link.width, link.y0, link.y1) || !(link.value > 0 && link.width > 0) || [link.y0, link.y1].some((y) => !(y + link.width / 2 > y - link.width / 2)) || [link.port0, link.port1].some((port) => port && !finite(port.x, port.y)));
  if (!finite(width, height) || !(width > 0 && height > 0) || invalidNode || invalidLink || rail?.applied && (!finite(rail.scale, rail.baseline, rail.width, rail.height) || !(rail.scale > 0))) {
    throw new RangeError("布局计算超出当前数值精度，无法安全绘制这些金额。请调整统一单位，或拆分金额跨度过大的图表；原始金额未被改写。");
  }
}
function layoutFinancialGraph(report, options = {}) {
  const config = { title: report.metadata.title, period: report.metadata.period, unit: report.metadata.unit, palette: "clear", size: "wide", labels: true, linkLabels: false, layout: report.mainChain?.length ? "financial" : "auto", ribbon: "solid", minWidth: 4, order: [], ...options };
  const model = analyzeLinks(report.links), byId = new Map(report.nodes.map((n) => [n.id, n]));
  if (report.balanced === false) {
    model.balanced = false;
    model.warnings = [...model.warnings.filter((w) => w.type !== "balance"), ...report.warnings.filter((w) => w.type === "balance")];
  }
  model.nodes = model.nodes.map((n) => ({ ...n, ...byId.get(n.id) }));
  const chain = config.mainChain ?? report.mainChain ?? [], financial = config.layout === "financial" && chain.length >= 2;
  let width = financial ? 1600 : 1400, height = config.size === "square" ? 1400 : config.size === "classic" ? 1050 : 788;
  // The footer note block is measured before layout so nodes are never placed
  // on top of it. Growing the canvas afterwards left the chart free to overlap
  // its own footnotes in auto layout.
  const source = report.metadata.source, footnotes = source?.footnotes?.length ? source.footnotes : [source ? `${config.lang === "en" ? "Source: " : "来源："}${source.title}${source.publishedAt ? " · " + source.publishedAt : ""}` : "", source?.notes, source?.url].filter(Boolean);
  const noteLines = [...footnotes, ...report.notes ?? []].flatMap((t) => wrap(t, Math.floor((width - 88) / 17)));
  const noteRows = Math.max(3, noteLines.length), footer = 58 + noteRows * 25;
  const depths = /* @__PURE__ */ new Map();
  function depth(id) {
    if (depths.has(id)) return depths.get(id);
    const incoming = model.links.filter((l) => l.target === id), d = incoming.length ? Math.max(...incoming.map((l) => depth(l.source))) + 1 : 0;
    depths.set(id, d);
    return d;
  }
  const counts = {};
  model.nodes.forEach((n) => {
    const d = depth(n.id);
    counts[d] = (counts[d] ?? 0) + 1;
  });
  height = Math.max(height, Math.max(...Object.values(counts)) * 105 + (financial ? 350 : 280));
  assertNumericRange(report, model, height, financial);
  const order = [.../* @__PURE__ */ new Set([...config.order ?? [], ...report.order ?? [], ...model.nodes.map((n) => n.id)])], rank = new Map(order.map((n, i) => [n, i]));
  const subtitleY = Array.from(config.title || "财务流向分析").length > 40 ? 124 : 94;
  // A chart with one or two flows would otherwise be stretched to the full
  // canvas height, drawing a single band as a giant slab. Cap the band region
  // by how much flow there is to show and centre it in the leftover space.
  const top = subtitleY + (config.palette === "clear" && financial ? 130 : 58), bottomPad = financial ? 175 : 94;
  const bandCap = 120 + model.links.length * 60 + Math.max(...Object.values(counts)) * 30;
  const bandBottom = Math.min(height - bottomPad, top + bandCap);
  const bandShift = bandBottom < height - bottomPad ? Math.round((height - bottomPad - bandBottom) / 2) : 0;
  const graph = sankey().nodeId((n) => n.id).nodeAlign((n) => !n.targetLinks.length && n.sourceLinks.length ? Math.max(0, Math.min(...n.sourceLinks.map((l) => l.target.depth)) - 1) : n.depth).nodeWidth(11).nodePadding(financial ? 85 : 65).nodeSort((a, b) => rank.get(a.id) - rank.get(b.id)).extent([[44, top + bandShift], [width - 235, bandBottom + bandShift]]).iterations(40)({ nodes: model.nodes.map((n) => ({ ...n })), links: model.links.map((l) => ({ ...l })) });
  assertFiniteGeometry(graph, width, height);
  const rail = config.layout === "financial" ? financialRail(graph, { chain, balanced: model.balanced, width, height: Math.max(height, 1080), order, minimum: model.balanced ? config.minWidth : 0 }) : null;
  if (rail?.applied) {
    width = rail.width;
    height = rail.height;
  }
  if (!rail?.applied) {
    const display = allocateDisplayFlow(graph, model.balanced ? config.minWidth : 0);
    graph.display = display;
    if (display.enhanced) {
      const columns=new Map();for(const n of graph.nodes){const column=columns.get(n.layer)??[];column.push(n);columns.set(n.layer,column)}
      for(const column of columns.values()) {column.sort((a,b)=>a.y0-b.y0);let cursor=column[0].y0;for(const n of column){n.y0=Math.max(n.y0,cursor);n.y1=n.y0+n.displayHeight;cursor=n.y1+65;height=Math.max(height,n.y1+94)}}
    }
    packDisplayPorts(graph);
    // Re-pack into the reserved footer band instead of appending blank space
    // below the note block.
    const overflow = Math.max(...graph.nodes.map((n) => n.y1)) - (height - footer);
    if (overflow > 0) height += overflow;
  }
  assertFiniteGeometry(graph, width, height, rail);
  return { report, config, model, graph, rail, width, height, footer };
}
export {
  layoutFinancialGraph
};
