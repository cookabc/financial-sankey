/**
 * Transient on-page feedback: toast banner and the hover tooltip.
 * No chart knowledge — every message is passed in already resolved.
 */
import { escapeXml as esc } from "../core/svg-tree.js";

let toastTimer;
export function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, 3500);
}

export function showTip(e, title, detail) {
  const tip = document.getElementById("tooltip");
  tip.innerHTML = `<strong>${esc(title)}</strong>${esc(detail)}`;
  tip.hidden = false;
  moveTip(e);
}

export function moveTip(e) {
  const tip = document.getElementById("tooltip");
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 12, e.clientX + 14)) + "px";
  tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 12, e.clientY + 14)) + "px";
}

export function hideTip() {
  document.getElementById("tooltip").hidden = true;
}
