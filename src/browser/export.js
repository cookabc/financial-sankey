import { renderSvg } from "../core/render-svg.js";
function filename(title, ext) {
  return (title || "财报桑基图").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) + "." + ext;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3e4);
}
function svgBlob(diagram) {
  if (!diagram.model.balanced) throw new Error("请先修正中间节点流量差额。");
  return new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + renderSvg(diagram)], { type: "image/svg+xml;charset=utf-8" });
}
async function pngBlob(diagram) {
  await document.fonts?.ready;
  const { width: w, height: h } = diagram, url = URL.createObjectURL(svgBlob(diagram));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("图表图片转换失败"));
      image.src = url;
    });
    const canvas = document.createElement("canvas"), scale = Math.min(2, Math.sqrt(16e6 / (w * h)));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable. Try exporting SVG instead.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("无法生成图片");
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
/**
 * Export orchestration: gate on a balanced chart, drive the button state, and
 * announce the outcome. The caller owns the dirty/balanced decision.
 */
function exportSvg(diagram, title, announce, messages = {}) {
  try {
    download(svgBlob(diagram), filename(title, "svg"));
    announce?.(messages.success ?? "已导出可编辑的矢量 SVG");
  } catch (e) {
    announce?.((messages.failure ?? "导出失败：") + e.message);
  }
}
async function exportPng(diagram, title, { button, announce, messages = {} } = {}) {
  const previous = button ? { markup: button.innerHTML, disabled: button.disabled } : null;
  if (button) {
    button.disabled = true;
    button.textContent = messages.pending ?? "正在导出…";
    button.setAttribute("aria-busy", "true");
  }
  try {
    const result = await pngBlob(diagram);
    download(result.blob, filename(title, "png"));
    announce?.(messages.success?.(result.width, result.height) ?? `已导出 ${result.width} × ${result.height} PNG`);
  } catch (e) {
    announce?.((messages.failure ?? "导出失败：") + e.message);
  } finally {
    if (button) {
      button.disabled = previous.disabled;
      button.innerHTML = previous.markup;
      button.removeAttribute("aria-busy");
    }
  }
}
export {
  download,
  exportPng,
  exportSvg,
  filename,
  pngBlob,
  svgBlob
};
