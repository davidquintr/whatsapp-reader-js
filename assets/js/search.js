// Chat search. Matches the rendered text of each message and highlights it with
// the CSS Custom Highlight API, so the message DOM is never rewritten.

const MAX_HIGHLIGHTS = 5000;
const supportsHighlight = typeof CSS !== "undefined" && "highlights" in CSS;

/**
 * Lowercases and strips accents one UTF-16 unit at a time, so every index in the
 * folded string maps to the same index in the original text.
 */
export function fold(text) {
  let out = "";
  for (const ch of text) {
    let f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (f.length !== ch.length) f = ch.toLowerCase();
    if (f.length !== ch.length) f = ch;
    out += f;
  }
  return out;
}

/** @returns {{index: number, start: number, end: number}[]} */
export function findMatches(plainTexts, query, allowed = () => true) {
  const q = fold(query.trim());
  const matches = [];
  if (!q) return matches;
  plainTexts.forEach((text, index) => {
    if (!text || !allowed(index)) return;
    const hay = fold(text);
    let from = 0;
    let at;
    while ((at = hay.indexOf(q, from)) !== -1) {
      matches.push({ index, start: at, end: at + q.length });
      from = at + q.length;
    }
  });
  return matches;
}

/** Builds a DOM Range covering [start, end) of the element's text content. */
function rangeFor(element, start, end) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.data.length;
    if (!started && start < offset + length) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (started && end <= offset + length) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset += length;
  }
  return null;
}

export class ChatSearch {
  constructor() {
    this.matches = [];
    this.current = -1;
    this.registry = null;
  }

  setRegistry(registry) {
    this.registry = registry;
    this.clear();
  }

  run(query, allowed) {
    this.clear();
    if (!this.registry) return;
    this.matches = findMatches(this.registry.plain, query, allowed);
    if (supportsHighlight && this.matches.length) {
      const ranges = [];
      for (const m of this.matches.slice(0, MAX_HIGHLIGHTS)) {
        const r = rangeFor(this.registry.texts[m.index], m.start, m.end);
        if (r) ranges.push(r);
      }
      CSS.highlights.set("search", new Highlight(...ranges));
    }
  }

  go(step) {
    if (!this.matches.length) return null;
    this.current = (this.current + step + this.matches.length) % this.matches.length;
    const m = this.matches[this.current];
    const row = this.registry.rows[m.index];
    this.focusRow(row);
    if (supportsHighlight) {
      const r = rangeFor(this.registry.texts[m.index], m.start, m.end);
      if (r) CSS.highlights.set("search-current", new Highlight(r));
    }
    return m;
  }

  focusRow(row) {
    document.querySelectorAll(".row.is-current").forEach((r) => r.classList.remove("is-current"));
    if (!row) return;
    row.classList.add("is-current");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  clear() {
    this.matches = [];
    this.current = -1;
    if (supportsHighlight) {
      CSS.highlights.delete("search");
      CSS.highlights.delete("search-current");
    }
    document.querySelectorAll(".row.is-current").forEach((r) => r.classList.remove("is-current"));
  }
}
