import { normalizeInput, buildIncomeStatement } from "../core/financial-data.js";
import { analyzeLinks, parseText, toCSV, numberValue } from "../core/table-data.js";
import { DEFAULT_EXAMPLE } from "../examples/registry.js";
const PROJECT_VERSION = 2;
const FINANCE_FIELDS = { revenue: "营业收入", cost: "营业成本", sales: "销售费用", rnd: "研发费用", admin: "管理费用", finance: "财务费用", tax: "所得税（收益填负数）" };
const blankFinance = () => Object.fromEntries(Object.keys(FINANCE_FIELDS).map((k) => [k, ""]));
const DEFAULT_CONFIG = { title: "财务流向分析", period: "未指定期间", currency: "未指定", unit: "万元", palette: "clear", size: "wide", labels: true, linkLabels: false, layout: "auto", layoutExplicit: false, ribbon: "solid", minWidth: 4, mainChain: [] };
function projectFromDocument(input, config = {}) {
  const report = normalizeInput(input);
  return { schema: "liuzhang.sankey", version: PROJECT_VERSION, text: toCSV(report.links), document: report, mode: "data", finance: blankFinance(), config: { ...DEFAULT_CONFIG, ...report.metadata, layout: report.mainChain.length ? "financial" : "auto", mainChain: report.mainChain, ...config }, order: [], demo: false };
}
function initialProject() {
  const p = projectFromDocument(DEFAULT_EXAMPLE.document);
  p.text = DEFAULT_EXAMPLE.text;
  return p;
}
function financeDocument(finance, config) {
  const data = Object.fromEntries(Object.keys(FINANCE_FIELDS).map((k) => {
    const v = numberValue(finance[k]);
    if (!Number.isFinite(v)) throw new Error("请完整填写金额，缺失项目请明确填 0。");
    return [k, v];
  }));
  return buildIncomeStatement({ schema: "liuzhang.income-statement", version: 1, metadata: { title: config.title, period: config.period || "未指定期间", currency: config.currency || "未指定", unit: config.unit || "未指定" }, revenue: { id: "revenue", label: "营业收入", items: [{ id: "revenue-source", label: "收入", value: data.revenue }] }, stages: [{ id: "gross", label: "毛利润", deductions: [{ id: "cost", label: "营业成本", value: data.cost }] }, { id: "pretax", label: "税前利润", deductions: ["sales", "rnd", "admin", "finance"].map((id) => ({ id, label: FINANCE_FIELDS[id], value: data[id] })) }, { id: "net", label: "净利润", deductions: [{ id: "tax", label: data.tax < 0 ? "所得税收益" : "所得税", value: data.tax }] }] });
}
function resolveDocument(state) {
  if (state.mode === "finance") return financeDocument(state.finance, state.config);
  const original = state.document && toCSV(parseText(state.text)) === toCSV(state.document.links) ? normalizeInput(state.document) : null;
  const { title, period, currency, unit } = state.config, metadata = { title: title || "财务流向分析", period: period || "未指定期间", currency: currency || "未指定", unit: unit || "未指定" };
  if (original) {
    const sameBasis = ["period", "currency", "unit"].every((k) => metadata[k] === original.metadata[k]);
    return { ...original, metadata: { ...original.metadata, ...metadata, ...!sameBasis ? { source: void 0 } : {} }, mainChain: state.config.mainChain ?? original.mainChain };
  }
  const links = parseText(state.text), m = analyzeLinks(links), chain = state.config.mainChain ?? [], members = new Set(chain);
  return normalizeInput({ schema: "liuzhang.financial", version: 1, metadata, nodes: m.nodes.map((n) => ({ id: n.id, label: n.id, role: members.has(n.id) ? "main" : !n.in ? links.some((l) => l.source === n.id && members.has(l.target) && l.target !== chain[0]) ? "gain" : "source" : links.some((l) => l.target === n.id && members.has(l.source)) ? "expense" : "other" })), links, mainChain: chain.every((id) => m.nodes.some((n) => n.id === id)) ? chain : [] });
}
function restoreProject(value) {
  if (value?.schema === "liuzhang.financial" || value?.schema === "liuzhang.income-statement") return projectFromDocument(value);
  if (!value || value.schema !== "liuzhang.sankey" || value.version !== PROJECT_VERSION || typeof value.text !== "string") throw new Error("不是有效的流账项目或结构化财报文件。");
  if (value.text.length > 4e5) throw new Error("项目数据过大。");
  const c = value.config ?? {};
  const config = { ...DEFAULT_CONFIG, title: String(c.title ?? DEFAULT_CONFIG.title).slice(0, 80), period: String(c.period ?? "").slice(0, 60), currency: String(c.currency ?? "未指定").slice(0, 20), unit: String(c.unit ?? DEFAULT_CONFIG.unit).slice(0, 20), palette: ["clear", "sunrise", "jade", "blue", "warm", "mono"].includes(c.palette) ? c.palette : "clear", size: ["wide", "classic", "square"].includes(c.size) ? c.size : "wide", labels: c.labels !== false, linkLabels: c.linkLabels === true, layout: c.layout === "financial" || value.mode === "finance" && !c.layout ? "financial" : "auto", layoutExplicit: c.layoutExplicit === true || c.layout === "auto", ribbon: ["solid", "gradient"].includes(c.ribbon) ? c.ribbon : c.palette && c.palette !== "clear" ? "gradient" : "solid", minWidth: [0, 2, 4, 6].includes(c.minWidth) ? c.minWidth : 4, mainChain: Array.isArray(c.mainChain) ? c.mainChain.slice(0, 80).map(String) : [] };
  const result = { schema: "liuzhang.sankey", version: PROJECT_VERSION, text: value.text, mode: value.mode === "finance" ? "finance" : "data", finance: { ...blankFinance(), ...value.finance }, config, order: Array.isArray(value.order) ? value.order.filter((x) => typeof x === "string").slice(0, 80) : [], document: value.document ? normalizeInput(value.document) : null, reportId: null, demo: value.demo === true };
  resolveDocument(result);
  return result;
}
export {
  DEFAULT_CONFIG,
  FINANCE_FIELDS,
  blankFinance,
  financeDocument,
  initialProject,
  projectFromDocument,
  resolveDocument,
  restoreProject
};
