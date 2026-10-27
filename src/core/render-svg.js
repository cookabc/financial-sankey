import { sankeyLinkHorizontal } from "d3-sankey";
import { railNodeRect, financialLinkGeometry } from "./top-layout.js";
import { CLEAR_COLORS, financialRole, clearLinkColor, nodeColor as colorForNode } from "./theme.js";
import { element as el, fmt, wrap, wrapLabel, textWidth } from "./svg-tree.js";
const NS = "http://www.w3.org/2000/svg";
function renderSvg(diagram, { interactive = false, selected = null } = {}) {
  const { report, config, model, graph, width: w, height: h, rail } = diagram;
  const state = { config, demo: false, mode: report.mainChain.length ? "finance" : "data" }, financial = report.mainChain.length >= 2;
  const nodeColor = (n) => colorForNode(n, config.palette, model.nodes.findIndex((x) => x.id === n.id));
  const clear = state.config.palette === "clear";
  const paper = clear ? "#ffffff" : "#fffdf8", ink = clear ? "#20252c" : "#67472d", muted = clear ? "#697586" : "#826443";
  // A group, not an img: the svg contains focusable interactive nodes, and an
  // img role must be a leaf for assistive tech.
  const svg = el("svg", { id: "sankey", role: "group" });
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.setAttribute("xmlns", NS);
  svg.setAttribute("font-family", "Noto Sans CJK SC, PingFang SC, Microsoft YaHei, sans-serif");
  svg.setAttribute("aria-label", state.config.title + "，" + model.links.length + " 条流向");
  svg.append(el("rect", { width: w, height: h, fill: paper }));
  svg.append(el("title", {}, state.config.title));
  svg.append(el("desc", {}, `${state.config.period}，单位 ${state.config.unit}。${state.demo ? "演示数据。" : ""}${model.balanced ? "中间节点收支平衡。" : "警告：部分中间节点流入与流出不平衡。"}`));
  wrap(state.config.title || "财务流向分析", 40).slice(0, 2).forEach((l, i) => svg.append(el("text", { x: 43, y: 62 + i * 35, fill: clear ? "#15191e" : "#59402c", "font-size": financial ? 34 : 28, "font-weight": clear ? 650 : 500, "font-family": clear ? "Noto Sans CJK SC, PingFang SC, sans-serif" : "Noto Serif CJK SC, Songti SC, serif" }, l)));
  const titleRows = Math.min(2, Math.ceil(Array.from(state.config.title || "财务流向分析").length / 40));
  const subtitleY = titleRows > 1 ? 124 : 94;
  svg.append(el("text", { x: 43, y: subtitleY, fill: muted, "font-size": financial ? 19 : 13, "letter-spacing": 1 }, `${state.config.period || "未指定期间"}  /  ${report.metadata.currency} · ${state.config.unit || "未指定"}${state.demo ? "  /  演示数据" : ""}`));
  if (clear) {
    [["来源", CLEAR_COLORS.source], [financial || state.mode === "finance" ? "收入与利润" : "主要流向", CLEAR_COLORS.main], ["成本与费用", CLEAR_COLORS.expense], ["额外收益", CLEAR_COLORS.gain]].forEach(([label, color], i) => {
      const x = 44 + i * 190;
      svg.append(el("rect", { x, y: subtitleY + 25, width: 11, height: 11, rx: 2, fill: color }));
      svg.append(el("text", { x: x + 21, y: subtitleY + 36, fill: muted, "font-size": 17 }, label));
    });
  }
  svg.setAttribute("data-layout", rail?.applied ? "financial" : "auto");
  svg.setAttribute("data-baseline", rail?.applied ? rail.baseline : "");
  const bigLabels = financial || Boolean(graph.rail), gradientMode = config.ribbon === "gradient", minWidth = Number(config.minWidth) || 0;
  // Labels must stay inside the region between the header/legend row and the
  // footer notes. Without explicit bounds a source label drawn above its node
  // slid up into the subtitle or the legend and printed on top of them.
  const contentTop = subtitleY + (clear ? 58 : 37), contentBottom = h - (diagram.footer ?? 58) + 12;
  const clampLabelY = (y, blockHeight) => Math.max(contentTop + 20, Math.min(contentBottom - blockHeight, y));
  const defs = el("defs");
  svg.append(defs);
  const linksG = el("g"), hitsG = el("g"), nodesG = el("g");
  svg.append(linksG, hitsG, nodesG);
  graph.links.map((link, i) => ({ link, i })).sort((a, b) => b.link.width - a.link.width).forEach(({ link, i }) => {
    const source2 = nodeColor(link.source), target = nodeColor(link.target), geometry = financialLinkGeometry(link, minWidth), centerPath = geometry?.center ?? sankeyLinkHorizontal()(link);
    if (gradientMode) {
      const gradient = el("linearGradient", { id: "flow-" + i, gradientUnits: "userSpaceOnUse", x1: link.source.x1, x2: link.target.x0, y1: 0, y2: 0 });
      gradient.append(el("stop", { offset: "0%", "stop-color": source2 }), el("stop", { offset: "100%", "stop-color": target }));
      defs.append(gradient);
    }
    const flowColor = gradientMode ? `url(#flow-${i})` : clear ? clearLinkColor(link) : nodeColor(link.target.railRole === "main" ? link.source : link.target);
    const path = el("path", { d: geometry?.area ?? centerPath, fill: geometry ? flowColor : "none", stroke: geometry ? "none" : flowColor, "stroke-width": geometry ? 0 : link.width, "data-port-width": link.width, "data-ports": link.port0 ? JSON.stringify([link.port0, link.port1]) : "", "data-rail-middle": geometry?.main ? JSON.stringify(geometry.middle) : "", "data-actual-width": link.actualWidth ?? link.width, "data-visible-width": link.width, opacity: clear ? 0.62 : state.config.palette === "sunrise" ? 0.72 : 0.36, class: "sankey-link", "data-link": i, "data-source": link.source.id, "data-target": link.target.id });
    path.append(el("title", {}, `${link.source.label ?? link.source.id} → ${link.target.label ?? link.target.id}：${fmt(link.value)} ${state.config.unit}`));
    linksG.append(path);
    const hit = el("path", { d: centerPath, fill: "none", stroke: "transparent", "stroke-width": Math.max(32, link.width + 8), class: "flow-hit", "data-link": i, tabindex: interactive ? -1 : void 0, role: interactive ? "button" : void 0, "aria-label": `${link.source.label ?? link.source.id} → ${link.target.label ?? link.target.id}，${fmt(link.value)} ${state.config.unit}` });
    if (interactive) hitsG.append(hit);
    if (state.config.linkLabels && link.width > 14) {
      const x = (link.source.x1 + link.target.x0) / 2, y = geometry?.labelPoint?.y ?? (link.y0 + link.y1) / 2;
      const text = el("text", { x, y: y + 5, "text-anchor": "middle", "font-size": 14, fill: ink, "paint-order": "stroke", stroke: paper + "dd", "stroke-width": 5, "stroke-linejoin": "round", "data-flow-label": i, "data-source": link.source.id, "data-target": link.target.id }, fmt(link.value));
      linksG.append(text);
    }
  });
  // Pass 1: decide every node label block without drawing. Pass 2 resolves
  // vertical collisions between blocks whose horizontal extents overlap, so a
  // crowded auto layout cannot print two labels on top of each other.
  const labelPlans = graph.nodes.map((node) => {
    const allLines = wrapLabel(node.label ?? node.id, bigLabels ? 7 : 12);
    const lines2 = allLines.length > 2 ? [allLines[0], allLines[1].slice(0, 11) + "…"] : allLines;
    const center = (node.y0 + node.y1) / 2, blockHeight = lines2.length * (bigLabels ? 28 : 22) + (state.config.labels ? bigLabels ? 28 : 23 : 0);
    let y = Math.max(subtitleY + 35, Math.min(h - 65 - blockHeight, center - blockHeight / 2 + 16));
    const externalSource = financial && !node.targetLinks.length && node.layer > 0;
    const aboveLabel = clear && financial && !externalSource && (financialRole(node) === "source" || financialRole(node) === "main" && node.sourceLinks.length);
    let labelX = externalSource ? node.x0 - 13 : node.x1 + 13;
    let labelAnchor = externalSource ? "end" : "start";
    if (clear && externalSource) y = node.y0 - blockHeight + 12;
    if (aboveLabel) {
      labelX = node.x0 + (node.x1 - node.x0) / 2;
      labelAnchor = node.layer === 0 ? "start" : "middle";
      y = node.y0 - blockHeight + 12;
    }
    if (graph.rail) {
      const role = node.railRole;
      labelX = node.x1 + 13;
      labelAnchor = "start";
      if (role === "source") {
        labelX = node.x0 - 18;
        labelAnchor = "end";
        y = center - blockHeight / 2 + 16;
      } else if (role === "deduction" && graph.nodes.some((n) => n.railRole === "deduction" && n.layer === node.layer + 1) && graph.nodes.filter((n) => n.railGroup === node.railGroup).length === 1) {
        labelX = node.x0 - 12;
        labelAnchor = "end";
        y = node.y1 + 35;
      } else if (role === "addition") {
        labelX = node.x0 - 13;
        labelAnchor = "end";
        y = node.y0 - blockHeight + 12;
      } else if (role === "main" && node.sourceLinks.length) {
        const incomingGain = node.targetLinks.some((l) => l.source.railRole === "addition"), outgoingExpense = node.sourceLinks.some((l) => l.target.railRole === "deduction");
        labelX = (node.x0 + node.x1) / 2;
        labelAnchor = node.layer === 0 ? "start" : "middle";
        if (!outgoingExpense && !incomingGain && node.targetLinks.length) y = node.y1 + 35;
        else y = node.y0 - blockHeight - (incomingGain ? 40 : 8);
        if (incomingGain) {
          labelX = node.x0 - 20;
          labelAnchor = "end";
          y = node.y1 + 80;
        }
      }
    }
    const widest = lines2.reduce((max, line) => Math.max(max, textWidth(line, bigLabels ? 26 : 16)), 0);
    const valueText = state.config.labels ? fmt(node.signedValue ?? node.value) : "";
    const valueWidth = valueText ? textWidth(valueText, bigLabels ? 23 : 15) : 0;
    const width = Math.max(widest, valueWidth);
    const left = labelAnchor === "middle" ? labelX - width / 2 : labelAnchor === "end" ? labelX - width : labelX;
    // Clamp into the drawing band before any collision work. Clamping afterwards
    // silently moved a settled label back on top of its neighbour.
    y = Math.max(contentTop + 20, Math.min(contentBottom - blockHeight, y));
    return { node, lines2, valueText, labelX, labelAnchor, y, blockHeight, left, right: left + width, width };
  });
  // Sweep downward within each horizontal cluster; the group keeps its topmost
  // desired position and only pushes down as far as the overlap requires.
  const byDesired = [...labelPlans].sort((a, b) => a.y - b.y || a.left - b.left);
  const settled = [];
  for (const plan of byDesired) {
    let y = plan.y;
    for (const other of settled) {
      if (plan.left >= other.right + 2 || plan.right + 2 <= other.left) continue;
      if (y < other.y + other.blockHeight + 4) y = other.y + other.blockHeight + 4;
    }
    plan.y = y;
    settled.push(plan);
  }
  // If decluttering ran past the footer, extend the canvas rather than clamp a
  // label back onto its neighbour. A taller canvas keeps every label readable.
  const deepest = Math.max(...labelPlans.map((plan) => plan.y + plan.blockHeight));
  const grown = Math.max(0, Math.round(deepest + 24 - h));
  const height = h + grown;
  if (grown > 0) {
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${w} ${height}`);
    svg.children[0].setAttribute("height", height);
  }
  // A label that sits on top of a ribbon needs an opaque backing, not just a
  // thin outline: at 26px the glyph outline alone still let the ribbon colour
  // bleed through the strokes. Each line gets its own tight backing, and only
  // where that line really crosses a ribbon.
  const ribbonBoxes = graph.links.map((link) => {
    const half = (link.width ?? 0) / 2, a = link.port0 ?? { x: link.source.x1, y: link.y0 }, b = link.port1 ?? { x: link.target.x0, y: link.y1 };
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y - half, b.y - half), y1: Math.max(a.y + half, b.y + half) };
  });
  const crossesRibbon = (x0, x1, baseline, size) => {
    const top = baseline - size * 0.8, bottom = baseline + size * 0.22;
    return ribbonBoxes.some((box) => x0 < box.x1 && x1 > box.x0 && top < box.y1 && bottom > box.y0);
  };
  graph.nodes.forEach((node) => {
    // Roving tabindex: the whole chart is one tab stop. The selected node (or
    // the first node) admits Tab; arrow keys walk the rest. A chart with 80
    // nodes must not put 80 stops between the reader and the next control.
    const tabEntry = selected ?? graph.nodes[0]?.id;
    const color = nodeColor(node), g = el("g", { class: "sankey-node", "data-node": node.id, tabindex: interactive ? (node.id === tabEntry ? 0 : -1) : void 0, role: interactive ? "button" : void 0, "aria-label": `选择${node.label ?? node.id}，${fmt(node.signedValue ?? node.value)} ${state.config.unit}` });
    if (node.railPorts) {
      g.append(el("rect", { ...railNodeRect(node), rx: 0, fill: color, opacity: 0.85, stroke: selected === node.id ? "#1a4fa0" : "none", "stroke-width": selected === node.id ? 2.5 : 1, class: node.id === selected ? "is-selected" : undefined, "data-junction-role": "main", "data-junction-value": node.value, "data-rail-top": node.railPorts.top }));
    } else g.append(el("rect", { x: node.x0, y: node.y0, width: 11, height: node.y1 - node.y0, rx: 2, fill: color, stroke: selected === node.id ? "#1a4fa0" : "none", "stroke-width": selected === node.id ? 2.5 : 2 }));
    const plan = labelPlans.find((candidate) => candidate.node === node);
    const { lines2, labelX, labelAnchor, valueText } = plan;
    let y = Math.max(contentTop + 20, plan.y);
    // A pale paper halo keeps a label legible where it crosses a ribbon.
    const halo = { "paint-order": "stroke", stroke: paper, "stroke-width": bigLabels ? 6 : 5, "stroke-linejoin": "round" };
    const lineSize = bigLabels ? 26 : 16;
    const back = (text, baseline) => {
      const width = textWidth(text, lineSize);
      const x0 = labelAnchor === "middle" ? labelX - width / 2 : labelAnchor === "end" ? labelX - width : labelX;
      if (!crossesRibbon(x0, x0 + width, baseline, lineSize)) return;
      g.append(el("rect", { x: x0 - 3, y: baseline - lineSize * 0.86, width: width + 6, height: lineSize * 1.12, rx: 3, fill: paper, opacity: 0.85, class: "label-backing" }));
    };
    lines2.forEach((line) => {
      back(line, y);
      g.append(el("text", { x: labelX, y, "text-anchor": labelAnchor, fill: ink, "font-size": lineSize, "font-weight": 500, ...halo }, line));
      y += bigLabels ? 28 : 22;
    });
    if (valueText) {
      back(valueText, y + 2);
      g.append(el("text", { x: labelX, y: y + 2, "text-anchor": labelAnchor, fill: ink, "font-size": bigLabels ? 23 : 15, "font-family": clear ? "Noto Sans CJK SC, PingFang SC, sans-serif" : "Georgia, serif", ...halo }, valueText));
    }
    nodesG.append(g);
  });  const source = report.metadata.source;
  const footnotes = source?.footnotes?.length ? source.footnotes : [source ? `来源：${source.title}${source.publishedAt ? " · " + source.publishedAt : ""}` : "", source?.notes, source?.url].filter(Boolean);
  const notes = [...footnotes, ...report.notes ?? []];
  const lines = notes.flatMap((t) => wrap(t, Math.floor((w - 88) / 17)));
  lines.forEach((line, i) => svg.append(el("text", { x: 44, y: height - 58 - (lines.length - 1 - i) * 25, fill: muted, "font-size": 17 }, line)));
  if (!model.balanced) svg.append(el("text", { x: 44, y: height - 32, fill: "#b18041", "font-size": 12 }, "⚠ 部分中间节点不平衡，未自动补数；请结合下方校验信息阅读。"));
  svg.append(el("text", { x: w - 45, y: height - 32, "text-anchor": "end", fill: muted, "font-size": 11, "letter-spacing": 2 }, "流账"));
  return svg.toString();
}
export {
  renderSvg
};
