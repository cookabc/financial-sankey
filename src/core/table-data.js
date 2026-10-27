import Papa from "papaparse";
function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const raw = String(value ?? "").trim().replace(/\u2212/g, "-");
  if (!raw) return NaN;
  const normalized = raw.replace(/，/g, ",");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\.\d+)$/.test(normalized)) return NaN;
  return Number(normalized.replace(/,/g, ""));
}
function parseText(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("请先输入数据，或载入一个示例。");
  if (text.length > 4e5) throw new Error("文本过大，请精简到 200 条流向以内。");
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy", delimitersToGuess: ["	", ",", ";"], transform: (v) => v.trim() });
  if (parsed.errors.some((e) => e.type === "Quotes")) throw new Error("引号未闭合，请检查 CSV 中的双引号。");
  return rowsToLinks(parsed.data);
}
function rowsToLinks(input) {
  // Spreadsheet copies trail a delimiter, which arrives as one empty trailing
  // cell. Trim only trailing empties so a genuinely missing middle column still
  // reports the real problem instead of being silently accepted.
  const trimTrailing = (row) => {
    const kept = [...row];
    while (kept.length > 3 && String(kept.at(-1) ?? "").trim() === "") kept.pop();
    return kept;
  };
  const rows = input.map(trimTrailing).filter((row) => row.some((v) => String(v ?? "").trim() !== ""));
  if (!rows.length) throw new Error("没有找到可用的数据行。");
  const h = rows[0].map((v) => String(v ?? "").trim().toLowerCase());
  const header = ["来源", "source", "from"].includes(h[0]) && ["去向", "target", "to"].includes(h[1]);
  const body = header ? rows.slice(1) : rows;
  if (!body.length) throw new Error("只有表头，没有数据。");
  if (body.length > 200) throw new Error("当前最多支持 200 条流向，请拆分为多个图表。");
  return body.map((row, i) => {
    const line = i + (header ? 2 : 1);
    if (row.length !== 3) throw new Error(`第 ${line} 行需要「来源、去向、金额」三列。含千分位的金额请用引号包裹，或从表格复制为制表符格式。`);
    const source = String(row[0] ?? "").trim(), target = String(row[1] ?? "").trim(), value = numberValue(row[2]);
    if (!source || !target) throw new Error(`第 ${line} 行的来源和去向不能为空。`);
    if (source.length > 80 || target.length > 80) throw new Error(`第 ${line} 行的节点名称过长，请控制在 80 个字符以内。`);
    if (!Number.isFinite(value)) throw new Error(`第 ${line} 行金额不是有效数字。请不要包含货币符号、百分号或单位。`);
    if (value < 0) throw new Error(`第 ${line} 行金额为负数。桑基图宽度不能为负，请用正值和明确的流向表达退款或亏损。`);
    if (value > 1e15) throw new Error(`第 ${line} 行金额过大，请换用万元或亿元等单位。`);
    return { source, target, value };
  });
}
function analyzeLinks(input) {
  if (!input.length) throw new Error("没有可绘制的流向。");
  if (input.some((l) => !Number.isFinite(l.value) || l.value < 0 || l.value > 1e15)) throw new Error("金额必须是 0 至 1,000,000,000,000,000 之间的有限数值，请统一单位。");
  const warnings = [], map = /* @__PURE__ */ new Map(), zeroLinks = [];
  let duplicate = 0;
  input.forEach((l) => {
    if (l.value === 0) {
      zeroLinks.push({ ...l });
      return;
    }
    if (l.source === l.target) throw new Error(`「${l.source}」流向自身，请修改。`);
    const key = JSON.stringify([l.source, l.target]);
    if (map.has(key)) {
      map.get(key).value += l.value;
      duplicate++;
    } else map.set(key, { ...l });
  });
  const links = [...map.values()];
  if (!links.length) throw new Error("所有金额均为零，没有可绘制的流向。");
  const names = [...new Set(links.flatMap((l) => [l.source, l.target]))];
  if (names.length > 80) throw new Error("当前最多支持 80 个节点，请合并小额项目。");
  const nodes = names.map((id) => ({ id, in: 0, out: 0 })), byId = new Map(nodes.map((n) => [n.id, n])), adj = new Map(names.map((n) => [n, []]));
  links.forEach((l) => {
    byId.get(l.source).out += l.value;
    byId.get(l.target).in += l.value;
    adj.get(l.source).push(l.target);
  });
  const visiting = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`存在循环流向（涉及「${id}」）。当前支持从来源到去向的无环流向。`);
    if (visited.has(id)) return;
    visiting.add(id);
    adj.get(id).forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  names.forEach(visit);
  for (const n of nodes) {
    if (n.in && n.out && Math.abs(n.in - n.out) > Math.max(1e-7, Math.max(n.in, n.out) * 1e-9)) warnings.push({ type: "balance", node: n.id, in: n.in, out: n.out, diff: n.in - n.out });
  }
  if (duplicate) warnings.push({ type: "info", message: `${duplicate} 条重复流向已合并求和。` });
  // One statement only. A zero-valued flow stays in the data and the detail
  // table; it simply has no width to draw. Saying it was "未绘制" in one place
  // and "已保留" in another made the panel contradict itself.
  if (zeroLinks.length) warnings.push({ type: "info", message: `${zeroLinks.length} 条零金额流向保留在明细中，宽度为零、不绘制。` });
  return { links, zeroLinks, nodes, warnings, total: nodes.filter((n) => !n.in).reduce((s, n) => s + n.out, 0), balanced: !warnings.some((w) => w.type === "balance") };
}
function toCSV(links) {
  return Papa.unparse([["来源", "去向", "金额"], ...links.map((l) => [l.source, l.target, l.value])]);
}
export {
  analyzeLinks,
  numberValue,
  parseText,
  rowsToLinks,
  toCSV
};
