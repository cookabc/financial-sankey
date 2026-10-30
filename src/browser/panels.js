/**
 * Side panels: the provenance card and the data-detail table.
 * Rendered from the model that was just laid out; no orchestration here.
 */
import { escapeXml as esc, fmt } from "../core/svg-tree.js";

export function renderSource(source, t) {
  const card = document.getElementById("source-card");
  card.hidden = !source;
  if (!source) return;
  card.innerHTML = `<div class="source-copy"><div class="source-title">${esc(source.title)} <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(t("source.link"))}</a>${(source.links ?? []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join("")}</div>${source.notes ? `<p>${esc(source.notes)}</p>` : ""}</div>`;
}

export function renderDetails(model, unit, t) {
  const zero = model.zeroLinks ?? [];
  document.getElementById("row-count").textContent = t("rows.active", {count:model.links.length}) + (zero.length ? t("rows.zero", {count:zero.length}) : "");
  document.getElementById("data-rows").innerHTML = [...model.links, ...zero].map((l) => `<tr><td>${esc(model.nodes.find((n) => n.id === l.source)?.label ?? l.source)}</td><td>${esc(model.nodes.find((n) => n.id === l.target)?.label ?? l.target)}</td><td>${esc(String(fmt(l.value)))}</td></tr>`).join("");
  document.querySelector(".table-unit").textContent = " / " + unit;
}
