import { rowsToLinks, toCSV } from "./core/table-data.js";
import { layoutFinancialGraph } from "./core/layout.js";
import { renderSvg } from "./core/render-svg.js";
import { fmt, escapeXml as esc } from "./core/svg-tree.js";
import { EXAMPLES, DEFAULT_EXAMPLE } from "./examples/registry.js";
import { initialProject, restoreProject, resolveDocument, projectFromDocument, FINANCE_FIELDS } from "./browser/project.js";
import { download, exportPng, exportSvg, filename as fileName } from "./browser/export.js";
import { hideTip, moveTip, showTip, toast } from "./browser/feedback.js";
import { describeTrace, tracePath } from "./core/trace.js";
import { renderDetails, renderSource } from "./browser/panels.js";
import { HEADLINE_FIELDS, adjacentSibling, canvasOrder, dropInheritedHeadline, orderedSiblings, swapInOrder } from "./browser/session.js";
import { detectLang, LANG_KEY, paletteLabel, translator } from "./browser/i18n.js";
import { createImportCoordinator } from "./browser/import.js";
const $ = (id) => document.getElementById(id);

/* Interface language. English is the default; the switch flips it and persists
the choice. Only chrome copy changes — data labels and core validation messages
keep whatever the data says, so an exported chart is language-independent. */
let lang = detectLang();
let t = translator(lang);

function applyChrome() {
  document.documentElement.lang = lang;
  const title = t("doc.title");
  document.title = title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("doc.description"));
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  // The guide's two doc links ship in both languages, so each points at the
  // edition matching the interface rather than always at the English one.
  for (const el of document.querySelectorAll("[data-doc-en]")) {
    el.setAttribute("href", lang === "en" ? el.dataset.docEn : el.dataset.docZh);
  }
}

// The storage key is a stable identifier, not a version marker: renaming it
// would silently orphan every project already saved in a reader's browser.
const STORAGE_KEY = "liuzhang-project-v1";
let state = initialProject(), model, graph, diagram, report, selected = null, dirty = false, sheets = [], pngPending = false;
function mainChain() {
  return state.mode === "finance" ? report?.mainChain ?? [] : state.config.mainChain ?? [];
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $("local-save-state").textContent = t("saved.local");
  } catch {
    $("local-save-state").textContent = t("saved.failed");
  }
}
// Switching input mode is a valid re-render, not a pending edit: visiting the
// other tab must not grey out the export buttons or drop the source badge,
// because no value has changed.
function setMode(mode) {
  if (mode === "finance" && !state.config.layoutExplicit) {
    state.config.layout = "financial";
  }
  state.mode = mode;
  for (const m of ["data", "finance"]) {
    $(m + "-panel").hidden = m !== mode;
    $(m + "-tab").classList.toggle("active", m === mode);
    $(m + "-tab").setAttribute("aria-selected", m === mode);
    $(m + "-tab").tabIndex = m === mode ? 0 : -1;
  }
}
function markDirty() {
  dirty = true;
  $("source-card").hidden = true;
  $("demo-badge").textContent = t("badge.stale");
  $("dirty-note").hidden = false;
  $("svg-btn").disabled = true;
  $("png-btn").disabled = true;
  $("input-error").hidden = true;
}
function syncInputs() {
  $("data-text").value = state.text;
  for (const key of Object.keys(FINANCE_FIELDS)) $("f-" + key).value = state.finance[key];
  for (const key of ["title", "period", "currency", "unit", "size", "ribbon"]) $(key + "-input").value = state.config[key];
  $("chain-input").value = mainChain().join(" → ");
  $("min-width-input").value = String(state.config.minWidth);
  $("chain-settings").hidden = state.mode === "finance";
  $("chain-input").disabled = state.mode === "finance";
  $("labels-input").checked = state.config.labels;
  $("link-labels-input").checked = state.config.linkLabels;
  document.querySelectorAll("[data-palette]").forEach((b) => b.classList.toggle("active", b.dataset.palette === state.config.palette));
  $("palette-name").textContent = paletteLabel(t, state.config.palette);
  setMode(state.mode);
}
function generate() {
  importer.cancel();
  try {
    state.text = $("data-text").value;
    report = resolveDocument(state);
    dirty = false;
    $("dirty-note").hidden = true;
    $("input-error").hidden = true;
    selected = null;
    render();
    state.order = state.order.filter((id) => model.nodes.some((n) => n.id === id));
    renderDetails(model, state.config.unit);
    persist();
    return true;
  } catch (error) {
    markDirty();
    $("input-error").textContent = error.message;
    $("input-error").hidden = false;
    return false;
  }
}
function render() {
  if (!report) return;
  // The whole chart is rebuilt from an SVG string, so the element that had
  // keyboard focus disappears. Remember it and restore focus afterwards,
  // otherwise every selection dropped the user back to the document body.
  const focused = document.activeElement;
  const focusNode = focused?.dataset?.node ?? null;
  const focusLink = focused?.classList?.contains("flow-hit") ? focused.dataset.link : null;
  const metadata = { ...report.metadata, title: state.config.title, period: state.config.period || t("period.unspecified"), currency: state.config.currency || t("misc.unspecified"), unit: state.config.unit || t("misc.unspecified") };
  const sourceBasis = ["period", "currency", "unit"].every((k) => metadata[k] === report.metadata[k]);
  if (!sourceBasis) delete metadata.source;
  const current = { ...report, metadata };
  diagram = layoutFinancialGraph(current, { ...state.config, mainChain: state.mode === "finance" ? report.mainChain : state.config.mainChain, order: state.order });
  ({ model, graph } = diagram);
  $("chart-stage").innerHTML = renderSvg(diagram, { interactive: true, selected });
  const rail = diagram.rail;
  // When the report itself has no main chain (loss or zero balance), demanding
  // that one be configured contradicts the note beside it explaining that the
  // chain was cleared on purpose. Surface the rail reason only when a chain
  // was actually requested.
  const chainRequested = (state.mode === "finance" ? report.mainChain : state.config.mainChain)?.length >= 2;
  const railNote = rail && !rail.applied && chainRequested ? rail.reason : "";
  // The report's own notes are drawn into the SVG footer, which is what gets
  // exported. Repeating them in the page banner above the chart said the same
  // thing twice on screen, so the banner carries only the layout explanation.
  $("layout-note").textContent = railNote;
  $("layout-note").hidden = !$("layout-note").textContent.trim();
  $("layout-note").classList.toggle("warning", Boolean(railNote));
  $("chain-settings").hidden = state.mode === "finance";
  $("chain-input").disabled = state.mode === "finance";
  $("demo-badge").textContent = metadata.source ? t("badge.sourced") : state.demo ? t("badge.demo") : t("badge.custom");
  renderSource(metadata.source);
  bindChart();
  bindTraceHover();
  $("chart-status").textContent = `${model.balanced ? t("status.balanced") : t("status.unbalanced")} · ${model.nodes.length} ${t("status.nodes")} · ${model.links.length} ${t("status.links")}`;
  $("chart-status").classList.toggle("warning", !model.balanced);
  // analyzeLinks already reports zero-valued flows with the counts that apply
  // to this render. The structured report carries its own zero note as well, so
  // dropping the duplicate keeps one statement per fact in the panel.
  const warnings = [...model.warnings, ...(report.warnings ?? []).filter((w) => w.type !== "balance" && w.type !== "zero" && w.code !== "zero-links")];
  $("validation-panel").hidden = !warnings.length;
  $("validation-panel").innerHTML = warnings.length ? `<strong>${model.balanced ? esc(t("warn.heading")) : esc(t("warn.headingBad"))}</strong><ul>${warnings.map((w) => `<li>${w.type === "balance" ? `「${esc(w.node)}」流入 ${fmt(w.in)}，流出 ${fmt(w.out)}，差额 ${fmt(w.diff)} ${esc(state.config.unit)}。` : esc(w.message)}</li>`).join("")}</ul>` : "";
  $("svg-btn").disabled = dirty || !model.balanced;
  $("png-btn").disabled = pngPending || dirty || !model.balanced;
  const reason = !model.balanced ? t("warn.exportTitle") : "";
  $("svg-btn").title = reason;
  $("png-btn").title = reason;
  if (!model.balanced) $("validation-panel").insertAdjacentHTML("beforeend", `<p>${esc(t("warn.exportPaused"))}</p>`);
  updateNodeTools();
  // Restore focus after the rebuild and keep the roving tabindex consistent:
  // exactly one chart element carries tabindex="0", the one holding focus.
  const restored = focusNode
    ? $("chart-stage").querySelector(`[data-node="${cssAttr(focusNode)}"]`)
    : focusLink
      ? $("chart-stage").querySelector(`.flow-hit[data-link="${cssAttr(focusLink)}"]`)
      : null;
  if (restored) {
    $("chart-stage").querySelectorAll('[tabindex="0"]').forEach((el) => el.setAttribute("tabindex", "-1"));
    restored.setAttribute("tabindex", "0");
    restored.focus();
  }
}
// Node IDs are user data and can contain quotes or backslashes; escape them for
// the attribute selector without depending on CSS.escape, which is not present
// in every engine.
function cssAttr(value) {
  return String(value).replace(/[\\"]/g, (ch) => "\\" + ch);
}

/**
 * Paint the causal path of one node without rebuilding the SVG.
 *
 * Re-rendering on hover would replace the element under the pointer and fire
 * pointerenter again — an infinite loop, and 40ms per mouse move. Toggling
 * classes keeps hover free and leaves the exported SVG untouched.
 */
function paintTrace(nodeId) {
  const stage = $("chart-stage"), trace = nodeId ? tracePath(graph, nodeId) : null;
  stage.classList.toggle("is-tracing", Boolean(trace));
  for (const g of stage.querySelectorAll(".sankey-node")) {
    const on = !trace || trace.nodes.has(g.dataset.node);
    g.classList.toggle("on-path", on);
    g.classList.toggle("is-selected", g.dataset.node === selected);
  }
  for (const p of stage.querySelectorAll(".sankey-link")) {
    p.classList.toggle("on-path", !trace || trace.links.has(`${p.dataset.source}\u0000${p.dataset.target}`));
  }
  const readout = $("trace-readout");
  if (!trace || !nodeId) {
    readout.hidden = true;
    readout.textContent = "";
    return;
  }
  const info = describeTrace(graph, nodeId, state.config.unit);
  if (!info) { readout.hidden = true; return; }
  // The share is the sentence a reader actually wants: a raw figure does not
  // say whether it matters.
  const share = info.share === null ? "" : `<span class="trace-share">${esc(t("trace.share"))} ${(info.share * 100).toFixed(1)}%</span>`;
  const flow = [info.fedBy ? `${info.fedBy} ${t("trace.in")}` : "", info.feeds ? `${info.feeds} ${t("trace.out")}` : ""].filter(Boolean).join(" · ");
  readout.innerHTML = `<span class="trace-name">${esc(info.label)}</span><span>${esc(String(fmt(info.value)))} ${esc(info.unit)}</span>${share}${flow ? `<span class="trace-flow">${esc(flow)}</span>` : ""}`;
  readout.hidden = false;
}
function selectNode(id) {
  selected = id;
  render();
}
function updateNodeTools() {
  $("node-tools").hidden = !selected;
  if (!selected) return;
  const node = graph.nodes.find((n) => n.id === selected);
  if (!node) {
    selected = null;
    $("node-tools").hidden = true;
    return;
  }
  const siblings = orderedSiblings(graph, node), index = siblings.findIndex((n) => n.id === selected);
  $("selected-node").textContent = (node.label ?? selected) + (node.railRole === "main" ? t("node.mainRail") : "");
  $("node-up").disabled = index === 0;
  $("node-down").disabled = index === siblings.length - 1;
}
function reorder(direction) {
  const neighbour = adjacentSibling(graph, selected, direction);
  if (!neighbour) return;
  state.order = swapInOrder(canvasOrder(graph), selected, neighbour);
  render();
  persist();
}
// The chart is one composite widget with a roving tabindex: Tab admits at the
// selected node (or the first), arrows walk nodes in visual order and then the
// flows. An 80-node chart must not cost 80 tab stops before the next control.
function chartFocusSequence() {
  const stage = $("chart-stage");
  return [
    ...canvasOrder(graph).map((id) => stage.querySelector(`[data-node="${cssAttr(id)}"]`)),
    ...stage.querySelectorAll(".flow-hit"),
  ].filter(Boolean);
}
function moveChartFocus(e, step) {
  const sequence = chartFocusSequence();
  const current = document.activeElement;
  const i = sequence.indexOf(current);
  const target = sequence[i + step] ?? sequence[i === -1 ? 0 : sequence.length - 1];
  if (!target || target === current) return;
  e.preventDefault();
  current?.setAttribute("tabindex", "-1");
  target.setAttribute("tabindex", "0");
  target.focus();
}
function bindChart() {
  for (const n of document.querySelectorAll("[data-node]")) {
    const id = n.dataset.node, node = graph.nodes.find((x) => x.id === id), original = model.nodes.find((x) => x.id === id);
    n.onclick = () => selectNode(id);
    n.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectNode(id);
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") moveChartFocus(e, 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") moveChartFocus(e, -1);
    };
  }
  for (const n of document.querySelectorAll(".flow-hit,.sankey-link")) {
    const l = graph.links[Number(n.dataset.link)], info = (e) => showTip(e, `${l.source.label} → ${l.target.label}`, `${fmt(l.value)} ${state.config.unit}${l.actualWidth < state.config.minWidth ? t("tooltip.thin") : ""}`);
    // Hovering a ribbon traces from its source, which answers "what does this
    // flow feed?" without having to hunt for the node. The trace itself is set
    // by the delegated pointerover handler below, so a ribbon covering a node
    // cannot win the race against it.
    n.onpointerenter = info;
    n.onpointermove = moveTip;
    n.onpointerleave = hideTip;
    n.onclick = info;
    if (n.classList.contains("flow-hit")) n.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const r = n.getBoundingClientRect();
        info({ clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 });
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") moveChartFocus(e, 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") moveChartFocus(e, -1);
    };
  }
  // Restore the pinned trace after a rebuild (selection survives re-render).
  paintTrace(selected);
}

// One delegated handler decides what is being traced. Per-element listeners
// raced: a wide transparent .flow-hit sits over the node rects, so its
// pointerenter could overwrite the node's trace with its source's.
function bindTraceHover() {
  const stage = $("chart-stage");
  const fromEvent = (e) => {
    const node = e.target.closest?.(".sankey-node");
    if (node) return node.dataset.node;
    const link = e.target.closest?.(".sankey-link,.flow-hit");
    if (link) return graph.links[Number(link.dataset.link)]?.source.id ?? null;
    return undefined;
  };
  stage.onpointerover = (e) => {
    const id = fromEvent(e);
    if (id === undefined) return;
    paintTrace(id);
  };
  stage.onpointerleave = () => paintTrace(selected);
}
function commitImport(result, file) {
  const next = result.kind === 'project' ? result.project : structuredClone(state);
  if (result.kind !== 'project') {
    next.text = toCSV(result.links);
    next.mode = 'data';next.demo = false;
    dropInheritedHeadline(next, { force: true });
    next.config.mainChain = [];next.config.layout = 'auto';next.order = [];
  }
  // Layout is part of validation. A bad replacement cannot damage the open project.
  const candidate = resolveDocument(next);
  layoutFinancialGraph(candidate, { ...next.config, order: next.order });
  state = next;
  sheets = result.kind === 'workbook' ? result.sheets : [];
  $("sheet-select").innerHTML = sheets.map((sheet, i) => `<option value="${i}">${esc(sheet.name)}</option>`).join('');
  $("sheet-wrap").hidden = sheets.length < 2;
  syncInputs();
  if (generate()) {
    $("import-feedback").hidden = false;
    $("import-feedback").textContent = t("ok.imported", { name: file.name, count: model.links.length });
    toast(t("ok.loadedName", { name: file.name }));
  }
}
const importer = createImportCoordinator({
  commit: commitImport,
  onError(error) {
    $("input-error").textContent = t("err.importFailed") + error.message;
    $("input-error").hidden = false;
  },
  onPending(pending) { $("editor").setAttribute('aria-busy', String(pending)); },
});
// Capturing runs before the file-input handler starts its replacement request.
for (const event of ['input', 'change']) document.addEventListener(event, () => importer.cancel(), true);
async function importFile(file, options) {
  await importer.import(file, options);
  $("data-file").value = '';
  $("project-file").value = '';
}
const financeLabels = FINANCE_FIELDS;
$("finance-fields").innerHTML = Object.entries(financeLabels).map(([key, label]) => `<label class="field">${label}<input id="f-${key}" inputmode="decimal" value="${""}" aria-label="${label}"></label>`).join("");
for (const key of Object.keys(FINANCE_FIELDS)) $("f-" + key).addEventListener("input", (e) => {
  state.finance[key] = e.target.value;
  state.demo = false;
  // The quick form builds its own statement; inheriting a headline would
  // export it under another company's name. Reset the denominating fields
  // once, on the first edit.
  if (dropInheritedHeadline(state)) {
    for (const field of HEADLINE_FIELDS) $(field + "-input").value = state.config[field];
  }
  markDirty();
});
// Re-render immediately on tab switch when the new mode already has valid
// data, so the preview never shows the other mode's chart. A mode whose input
// is still incomplete keeps the current chart and reports only what is missing;
// it must not mark the visible chart stale, because nothing changed yet.
function switchMode(mode) {
  importer.cancel();
  setMode(mode);
  if (mode === "data") {
    if (!dirty && report) return;
    generate();
    return;
  }
  try {
    const next = resolveDocument(state);
    report = next;
    dirty = false;
    $("dirty-note").hidden = true;
    $("input-error").hidden = true;
    selected = null;
    render();
    renderDetails(model, state.config.unit);
    persist();
  } catch (error) {
    $("input-error").textContent = error.message;
    $("input-error").hidden = false;
  }
}
for (const id of ['data', 'finance']) $(id + '-tab').onkeydown = event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 'data' : event.key === 'End' ? 'finance' : id === 'data' ? 'finance' : 'data';
  switchMode(next);$(next + '-tab').focus();
};
$("dropzone").onclick = () => $("data-file").click();
$("data-tab").onclick = () => switchMode("data");
$("finance-tab").onclick = () => switchMode("finance");
$("generate-btn").onclick = generate;
$("data-text").oninput = () => {
  state.text = $("data-text").value;
  // The typed text replaces the dataset, so an inherited headline no longer
  // describes it. Clearing provenance alone would leave the sample company's
  // name attached to whatever the user pasted in.
  if (dropInheritedHeadline(state)) {
    for (const key of HEADLINE_FIELDS) $(key + "-input").value = state.config[key];
  }
  state.demo = false;
  markDirty();
};
for (const key of ["title", "period", "currency", "unit", "size"]) $(key + "-input").addEventListener(key === "size" ? "change" : "input", (e) => {
  state.config[key] = e.target.value;
  render();
  renderDetails(model, state.config.unit);
  persist();
});
for (const [id, key] of [["labels-input", "labels"], ["link-labels-input", "linkLabels"]]) $(id).onchange = (e) => {
  state.config[key] = e.target.checked;
  render();
  persist();
};
for (const b of document.querySelectorAll("[data-palette]")) b.onclick = () => {
  state.config.palette = b.dataset.palette;
  document.querySelectorAll("[data-palette]").forEach((x) => x.classList.toggle("active", x === b));
  $("palette-name").textContent = paletteLabel(t, state.config.palette);
  render();
  persist();
};
$("ribbon-input").onchange = (e) => {
  state.config.ribbon = e.target.value;
  render();
  persist();
};
$("min-width-input").onchange = (e) => {
  state.config.minWidth = Number(e.target.value);
  render();
  persist();
};
$("chain-input").onchange = (e) => {
  state.config.mainChain = e.target.value.split(/→|->|\n/).map((x) => x.trim()).filter(Boolean).slice(0, 80);
  state.config.layout = state.config.mainChain.length >= 2 ? "financial" : "auto";
  state.config.layoutExplicit = true;
  render();
  persist();
};
$("sample-options").innerHTML = EXAMPLES.map((x, i) => `<button class="sample-card" data-example="${i}"><span><strong>${esc(x.name)}</strong><small>${esc(t("sample.note"))}</small></span><b>→</b></button>`).join("");
$("sample-btn").onclick = () => $("sample-dialog").showModal();
$("help-btn").onclick = () => $("help-dialog").showModal();
for (const b of document.querySelectorAll("[data-close]")) b.onclick = () => $(b.dataset.close).close();
for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  }
});
for (const b of document.querySelectorAll("[data-example]")) b.onclick = () => {
  importer.cancel();
  const x = EXAMPLES[Number(b.dataset.example)];
  state = projectFromDocument(x.document);
  state.reportId = x.id;
  state.text = x.text;
  $("sheet-wrap").hidden = true;
  $("import-feedback").hidden = true;
  syncInputs();
  generate();
  $("sample-dialog").close();
  toast(t("toast.sampleLoaded"));
};
$("template-btn").onclick = () => download(new Blob(["\uFEFF" + DEFAULT_EXAMPLE.text], { type: "text/csv;charset=utf-8" }), t("template.file"));
$("data-file").onchange = (e) => importFile(e.target.files[0]);
$("sheet-select").onchange = () => {
  try {
    state.text = toCSV(rowsToLinks(sheets[Number($("sheet-select").value)].rows));
    state.demo = false;
    state.reportId = null;
    state.document = null;
    state.config.mainChain = [];
    state.config.layout = "auto";
    state.order = [];
    $("data-text").value = state.text;
    setMode("data");
    syncInputs();
    generate();
  } catch (e) {
    $("input-error").textContent = e.message;
    $("input-error").hidden = false;
  }
};
for (const name of ["dragenter", "dragover"]) $("dropzone").addEventListener(name, (e) => {
  e.preventDefault();
  $("dropzone").classList.add("dragover");
});
for (const name of ["dragleave", "drop"]) $("dropzone").addEventListener(name, (e) => {
  e.preventDefault();
  $("dropzone").classList.remove("dragover");
  if (name === "drop") importFile(e.dataTransfer.files[0]);
});
$("focus-btn").onclick = () => {
  const active = document.body.classList.toggle("focus-mode");
  $("focus-btn").textContent = active ? t("action.exitFocus") : t("action.focus");
  if (active) window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
};
$("svg-btn").onclick = () => {
  if (!dirty && model.balanced) exportSvg(diagram, state.config.title, toast, { success: t('export.svgDone'), failure: t('export.failed') });
};
$("png-btn").onclick = async () => {
  if (pngPending || dirty || !model.balanced) return;
  pngPending = true;
  try {
    await exportPng(diagram, state.config.title, {
      button: $("png-btn"), announce: toast,
      messages: { pending: t('export.pending'), success: (width, height) => t('export.pngDone', { width, height }), failure: t('export.failed') },
    });
  } finally {
    pngPending = false;
    $("png-btn").disabled = dirty || !model.balanced;
    $("png-btn").innerHTML = `<span data-i18n="action.png">${esc(t('action.png'))}</span> <span>↓</span>`;
  }
};
$("save-btn").onclick = () => {
  if (dirty && !generate()) {
    toast(t("toast.fixFirst"));
    return;
  }
  state.text = $("data-text").value;
  download(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), fileName(state.config.title, "json"));
  toast(t("toast.projectSaved"));
};
$("open-btn").onclick = () => $("project-file").click();
$("project-file").onchange = (e) => importFile(e.target.files[0], { projectOnly: true });
$("node-up").onclick = () => reorder(-1);
$("node-down").onclick = () => reorder(1);
$("node-close").onclick = () => {
  selected = null;
  render();
};
$("reset-order-btn").onclick = () => {
  state.order = [];
  selected = null;
  render();
  persist();
  toast(t("toast.orderReset"));
};
$("details-btn").onclick = () => {
  const open = $("details-body").hidden;
  $("details-body").hidden = !open;
  $("details-btn").setAttribute("aria-expanded", open);
  $("details-arrow").textContent = open ? "－" : "＋";
};
/* The language switch re-applies chrome text and re-renders, because the status
line, badges and trace readout are built in JS rather than living in markup. */
const langBtn = $("lang-btn");
if (langBtn) {
  langBtn.onclick = () => {
    lang = lang === "en" ? "zh" : "en";
    t = translator(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* storage blocked: the choice lasts for this visit only */
    }
    langBtn.textContent = t("lang.switch");
    langBtn.setAttribute("aria-label", t("lang.label"));
    applyChrome();
    $("focus-btn").textContent = t(document.body.classList.contains('focus-mode') ? 'action.exitFocus' : 'action.focus');
    if (pngPending) $("png-btn").textContent = t('export.pending');
    // syncInputs re-labels controls built in JS (the palette name and the
    // finance quick-form fields); render refreshes the status line and badges.
    syncInputs();
    render();
  };
  langBtn.textContent = t("lang.switch");
  langBtn.setAttribute("aria-label", t("lang.label"));
}
applyChrome();
try {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) state = restoreProject(JSON.parse(local));
} catch {
}
syncInputs();
generate();
