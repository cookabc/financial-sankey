const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
function element(tag, attrs = {}, text) {
  return { tag, attrs: { ...attrs }, children: text == null ? [] : [String(text)], append(...items) {
    this.children.push(...items);
  }, setAttribute(k, v) {
    this.attrs[k] = v;
  }, get textContent() {
    return this.children.filter((x) => typeof x === "string").join("");
  }, set textContent(v) {
    this.children = [String(v)];
  }, toString() {
    return "<" + tag + Object.entries(this.attrs).filter(([, v]) => v !== void 0 && v !== null).map(([k, v]) => " " + k + '="' + escapeXml(v) + '"').join("") + ">" + this.children.map((x) => typeof x === "string" ? escapeXml(x) : x.toString()).join("") + "</" + tag + ">";
  } };
}
const fmt = (v) => v !== 0 && Math.abs(v) < 1e-6 ? v.toExponential(2) : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: Math.abs(v) < 1 ? 6 : 2 }).format(v);
// Width is measured in CJK character cells: a wide glyph is 1, a Latin glyph
// about 0.55. Labels mix scripts, so a fixed character count would break Latin
// words mid-word while over-packing CJK.
const wide = (ch) => {
  const code = ch.codePointAt(0);
  return code >= 0x2e80 || (code >= 0x1100 && code <= 0x115f);
};
const cells = (text) => Array.from(text).reduce((total, ch) => total + (wide(ch) ? 1 : 0.55), 0);
const trimEnd = (line) => line.replace(/ +$/, "");
// Keep Latin words and numbers intact; wide glyphs and spaces stand alone.
function tokensOf(text) {
  const out = [];
  let word = "";
  for (const ch of Array.from(text)) {
    if (wide(ch) || ch === " ") {
      if (word) { out.push(word); word = ""; }
      out.push(ch);
    } else word += ch;
  }
  if (word) out.push(word);
  return out;
}
function wrap(text, max = 11) {
  const out = [];
  let line = "", width = 0;
  const push = () => { const kept = trimEnd(line); if (kept) out.push(kept); line = ""; width = 0; };
  for (const token of tokensOf(String(text))) {
    const tokenWidth = cells(token);
    if (token === " " && !line) continue;
    if (line && width + tokenWidth > max + 1e-9) {
      push();
      if (token === " ") continue;
    }
    if (tokenWidth > max + 1e-9) {
      // A single word longer than the column still has to break, but only then.
      for (const ch of Array.from(token)) {
        const charWidth = wide(ch) ? 1 : 0.55;
        if (line && width + charWidth > max + 1e-9) push();
        line += ch;
        width += charWidth;
      }
      continue;
    }
    line += token;
    width += tokenWidth;
  }
  push();
  return out.length ? out : [String(text)];
}
function wrapLabel(text, max = 11) {
  const lines = wrap(text, max);
  // Pull two glyphs down from the previous line so a lone trailing character
  // does not sit on its own row. Wide glyphs only, so Latin words stay whole.
  if (lines.length > 1 && Array.from(lines.at(-1)).length === 1 && wide(lines.at(-1))) {
    const tail = Array.from(lines.at(-2));
    if (tail.length > 3 && tail.every(wide)) {
      lines[lines.length - 1] = tail.splice(-2).join("") + lines.at(-1);
      lines[lines.length - 2] = tail.join("");
    }
  }
  return lines;
}
// Rough rendered width in SVG user units. Used only to keep labels from
// overlapping each other; the browser still does the real typesetting.
function textWidth(text, size) {
  return cells(String(text)) * size;
}
// Shorten one already-wrapped line to a cell budget, ending it with "…".
// The ellipsis is itself a wide glyph, so it is reserved before keeping text.
// Slicing by the renderer's own width model means the shortened line can never
// be wider than a full line in the same column.
function truncateLine(text, maxCells) {
  const glyphs = Array.from(String(text));
  const budget = Math.max(0, maxCells) - cells("…");
  let kept = "", used = 0;
  for (const glyph of glyphs) {
    const cost = cells(glyph);
    if (used + cost > budget) break;
    kept += glyph;
    used += cost;
  }
  return kept + "…";
}
export {
  element,
  escapeXml,
  fmt,
  textWidth,
  truncateLine,
  wrap,
  wrapLabel
};
