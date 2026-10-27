const CLEAR_COLORS = { source: "#61778d", main: "#1167d9", expense: "#ea5b0c", gain: "#07985b", loss: "#ea5b0c", other: "#1167d9" };
const paletteNames = { clear: "清朗", sunrise: "晴日", jade: "青玉", blue: "蓝调", warm: "秋日", mono: "石墨" };
const palettes = { clear: { revenue: CLEAR_COLORS.main, source: [CLEAR_COLORS.source], profit: CLEAR_COLORS.main, net: CLEAR_COLORS.main, expense: CLEAR_COLORS.expense, tax: CLEAR_COLORS.gain }, sunrise: { revenue: "#f1932c", source: ["#f4af38", "#f8c43d", "#f0825c"], profit: "#ecb331", net: "#e57440", expense: "#e8aa53", tax: "#f2c448" }, jade: { revenue: "#609b92", source: ["#89aeb0", "#b4c4b6", "#b7c8a2"], profit: "#7aa58a", net: "#3f7d6f", expense: "#c7bd98", tax: "#dbc7a0" }, blue: { revenue: "#688cb3", source: ["#9bb7d0", "#b6bed9", "#97b8c5"], profit: "#7f9ebc", net: "#4d6c99", expense: "#c9becf", tax: "#d8ccdf" }, warm: { revenue: "#b87f54", source: ["#c89f77", "#d2b27c", "#c9b49c"], profit: "#b4a06a", net: "#947b43", expense: "#ccaa91", tax: "#d4bf96" }, mono: { revenue: "#70888b", source: ["#9bacae", "#b8c5c5", "#9da8a4"], profit: "#8e9f9c", net: "#4d6868", expense: "#b5bcb8", tax: "#c4cbc6" } };
function financialRole(node) {
  return node.role ?? { main: "main", source: "source", addition: "gain", deduction: "expense" }[node.railRole] ?? (!node.targetLinks?.length ? "source" : "other");
}
const clearNodeColor = (n) => CLEAR_COLORS[financialRole(n)] ?? CLEAR_COLORS.other;
function clearLinkColor(l) {
  const a = financialRole(l.source), b = financialRole(l.target);
  return ["expense", "loss"].includes(b) ? CLEAR_COLORS.expense : ["gain", "loss"].includes(a) ? CLEAR_COLORS[a] : a === "source" ? CLEAR_COLORS.source : CLEAR_COLORS.main;
}
// Net income must read the same in every palette regardless of which builder
// produced the graph: a canonical graph names it metric "net", while the
// statement compiler flags its final stage. Colour follows the meaning, not
// the builder.
const isNetIncome = (node) => node.metric === "net" || node.netIncome === true;
function nodeColor(node, palette = "clear", index = 0) {
  if (palette === "clear") return clearNodeColor(node);
  const p = palettes[palette] ?? palettes.clear, role = financialRole(node);
  return role === "source" ? p.source[index % p.source.length] : role === "gain" ? p.tax : ["expense", "loss"].includes(role) ? p.expense : isNetIncome(node) ? p.net : node.metric === "revenue" ? p.revenue : p.profit;
}
export {
  CLEAR_COLORS,
  clearLinkColor,
  clearNodeColor,
  financialRole,
  nodeColor,
  paletteNames,
  palettes
};
