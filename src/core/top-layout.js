import { allocateDisplayFlow } from "./display-flow.js";
function financialRail(graph, { chain, balanced = true, width = 1600, height = 1080, order = [], minimum = 0 } = {}) {
  const fail = (reason) => ({ applied: false, reason });
  if (!balanced) return fail("请先修正不平衡数据；当前使用自动布局。");
  if (!Array.isArray(chain) || chain.length < 2 || chain.length > 12 || new Set(chain).size !== chain.length) return fail("请配置 2–12 个不重复的主链节点，当前使用自动布局。");
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (chain.some((id) => !byId.has(id))) return fail("主链节点未匹配当前数据，请更新主链设置；当前使用自动布局。");
  const ix = new Map(chain.map((id, i) => [id, i]));
  const main = chain.map((id) => byId.get(id));
  if (main.at(-1).sourceLinks.length) return fail("主链末端不是终点，请补全主链；当前使用自动布局。");
  for (let i = 0; i < main.length - 1; i++) if (!main[i].sourceLinks.some((l) => l.target.id === chain[i + 1])) return fail("主链必须按真实流向连续连接；当前使用自动布局。");
  for (const l of graph.links) {
    const a = ix.get(l.source.id), b = ix.get(l.target.id);
    if (a !== void 0 && b !== void 0) {
      if (b !== a + 1) return fail("主链存在跨级流向；当前使用自动布局。");
    } else if (a !== void 0) {
      if (l.target.sourceLinks.length || l.target.targetLinks.length !== 1) return fail("扣减支流需直接到终点；复杂分支使用自动布局。");
    } else if (b !== void 0) {
      if (l.source.targetLinks.length || l.source.sourceLinks.length !== 1) return fail("附加支流需来自独立源头；复杂分支使用自动布局。");
    } else return fail("存在主链外的多级网络；当前使用自动布局。");
  }
  const primary = main[0].targetLinks.map((l) => l.source), scale = 180 / Math.max(...main.map((n) => n.value));
  for (const n of main) for (const links of [n.sourceLinks, n.targetLinks]) if (links.length && Math.abs(links.reduce((v, l) => v + l.value * scale, 0) - n.value * scale) > 1e-6) return fail("主链端口与节点流量不一致，请修正数据；当前使用自动布局。");
  for (const l of graph.links) { l.width = l.value * scale; l.actualWidth = l.width; }
  const display = allocateDisplayFlow(graph, minimum);
  const rank = new Map([...order, ...graph.nodes.map((n) => n.id).filter((id) => !order.includes(id))].map((id, i) => [id, i]));
  const cmp = (a, b) => rank.get(a.id) - rank.get(b.id);
  const additions = /* @__PURE__ */ new Map(), deductions = /* @__PURE__ */ new Map();
  for (const n of main) {
    additions.set(n, n.targetLinks.filter((l) => !ix.has(l.source.id) && n !== main[0]).sort((a, b) => cmp(a.source, b.source)));
    deductions.set(n, n.sourceLinks.filter((l) => !ix.has(l.target.id)).sort((a, b) => cmp(a.target, b.target)));
  }
  const gap = 220, nodeWidth = 14, left = 200, offset = primary.length ? 1 : 0;
  let x = left + (offset ? 220 : 0);
  main.forEach((n, i) => {
    n.x0 = x;
    n.x1 = x + nodeWidth;
    n.layer = i + offset;
    n.railRole = "main";
    n.railGroup = "main:" + n.layer;
    x = n.x1 + gap;
  });
  let additionBottom = 0;
  for (const [n, links] of additions) {
    let y = 218;
    for (const l of links) {
      const q = l.source, i = ix.get(n.id);
      q.x0 = main[i - 1].x1 + 24;
      q.x1 = q.x0 + 11;
      q.layer = n.layer - 1;
      q.railRole = "addition";
      q.railGroup = "addition:" + q.layer;
      q.y0 = y;
      q.y1 = y + q.displayHeight;
      additionBottom = Math.max(additionBottom, q.y1);
      y = q.y1 + 65;
    }
  }
  const baseline = Math.max(370, additionBottom + 110);
  main.forEach((n) => {
    const h = n.displayHeight;
    n.y0 = baseline;
    n.y1 = baseline + h;
    n.railPorts = { height: h, top: baseline };
  });
  primary.sort(cmp);
  // Reserve the same header/legend safety zone as upper gain sources.
  let py = Math.max(218, main[0].y0 - (primary.length - 1) * 43);
  for (const n of primary) {
    n.x0 = left;
    n.x1 = left + 11;
    n.layer = 0;
    n.railRole = "source";
    n.railGroup = "source:0";
    n.y0 = py;
    n.y1 = py + n.displayHeight;
    py = n.y1 + 86;
  }
  const expenseTop = Math.max(...main.map((n) => n.y1)) + 80;
  let expenseBottom = expenseTop;
  for (const [n, links] of deductions) {
    let y = expenseTop;
    for (const l of links) {
      const q = l.target, i = ix.get(n.id);
      q.x0 = main[i + 1].x0 - 35;
      q.x1 = q.x0 + 11;
      q.layer = n.layer + 1;
      q.railRole = "deduction";
      q.railGroup = "deduction:" + q.layer;
      q.y0 = y;
      q.y1 = y + q.displayHeight;
      y = q.y1 + 67;
      expenseBottom = Math.max(expenseBottom, q.y1);
    }
  }
  for (const n of graph.nodes) {
    const incoming = n.railRole === "main" ? n === main[0] ? [...n.targetLinks].sort((a, b) => cmp(a.source, b.source)) : [...additions.get(n), ...n.targetLinks.filter((l) => l.source.railRole === "main")] : [...n.targetLinks];
    const outgoing = n.railRole === "main" ? [...n.sourceLinks.filter((l) => l.target.railRole === "main"), ...deductions.get(n)] : [...n.sourceLinks];
    let yi = n.y0, yo = n.y0;
    for (const l of incoming) {
      l.port1 = { edge: "left", x: n.x0, y: yi + l.width / 2 };
      yi += l.width;
    }
    for (const l of outgoing) {
      l.port0 = { edge: "right", x: n.x1, y: yo + l.width / 2 };
      yo += l.width;
    }
    n.targetLinks = incoming;
    n.sourceLinks = outgoing;
  }
  for (const l of graph.links) {
    l.y0 = l.port0.y;
    l.y1 = l.port1.y;
  }
  graph.rail = { baseline, scale, display, chain: [...chain], width: Math.max(width, main.at(-1).x1 + 235), height: Math.max(height, expenseBottom + 190, Math.max(...graph.nodes.map((n) => n.y1)) + 190) };
  return { applied: true, ...graph.rail };
}
function railNodeRect(node) {
  return node.railPorts ? { x: node.x0, y: node.y0, width: node.x1 - node.x0, height: node.railPorts.height } : null;
}
function financialLinkGeometry(link) {
  if (!link.port0 || !link.port1) return null;
  const a=link.port0,b=link.port1,xm=(a.x+b.x)/2,w=link.width;
  const main=link.source.railRole==='main'&&link.target.railRole==='main';
  const center=`M${a.x},${a.y}C${xm},${a.y} ${xm},${b.y} ${b.x},${b.y}`;
  const area=`M${a.x},${a.y-w/2}C${xm},${a.y-w/2} ${xm},${b.y-w/2} ${b.x},${b.y-w/2}L${b.x},${b.y+w/2}C${xm},${b.y+w/2} ${xm},${a.y+w/2} ${a.x},${a.y+w/2}Z`;
  return {main,center,area,actualArea:w===(link.actualWidth??w)?area:null,portWidth:w,visibleWidth:w,actualWidth:link.actualWidth??w,ports:[a,b],baseline:link.source.y0,middle:{x0:a.x,x1:b.x,y0:a.y-w/2,y1:b.y-w/2},labelPoint:{x:xm,y:(a.y+b.y)/2}};
}
export {
  financialLinkGeometry,
  financialRail,
  railNodeRect
};
