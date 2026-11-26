// WhatsApp text formatting: *bold*, _italic_, ~strike~, `code`, ```block``` and links.
// `tokenize` is pure (testable in Node); `renderTokens` builds DOM nodes with
// textContent only, so message text can never inject HTML.

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/iu;
// A marker opens after start/space/punctuation and closes before end/space/punctuation.
const edge = (m) =>
  new RegExp(`(^|[\\s\\p{P}\\p{S}])[${m}](?=\\S)([^\\n]*?\\S)[${m}](?=$|[\\s\\p{P}\\p{S}])`, "u");

const RULES = [
  { type: "block", re: /```([\s\S]+?)```/u, raw: true },
  { type: "code", re: /`([^`\n]+)`/u, raw: true },
  { type: "link", re: URL_RE, link: true },
  { type: "bold", re: edge("*") },
  { type: "italic", re: edge("_") },
  { type: "strike", re: edge("~") },
];

/**
 * @typedef {{type: "text"|"block"|"code"|"link"|"bold"|"italic"|"strike", value?: string, children?: Token[]}} Token
 * @param {string} text
 * @returns {Token[]}
 */
export function tokenize(text) {
  const out = [];
  let rest = text;

  while (rest) {
    let best = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (!m) continue;
      // Edge rules capture the preceding character in group 1; the marker starts after it.
      const lead = rule.raw || rule.link ? 0 : m[1].length;
      const start = m.index + lead;
      if (!best || start < best.start) best = { rule, m, start };
    }
    if (!best) {
      pushText(out, rest);
      break;
    }

    const { rule, m, start } = best;
    if (start > 0) pushText(out, rest.slice(0, start));
    if (rule.link) {
      out.push({ type: "link", value: m[0] });
    } else if (rule.raw) {
      out.push({ type: rule.type, value: m[1] });
    } else {
      out.push({ type: rule.type, children: tokenize(m[2]) });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function pushText(out, value) {
  const last = out[out.length - 1];
  if (last && last.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

const TAGS = { bold: "strong", italic: "em", strike: "s", code: "code" };

/** Appends the tokens to `parent` as DOM nodes. */
export function renderTokens(parent, tokens) {
  for (const token of tokens) {
    if (token.type === "text") {
      parent.append(token.value);
    } else if (token.type === "link") {
      const a = document.createElement("a");
      a.href = token.value;
      a.textContent = token.value;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      parent.append(a);
    } else if (token.type === "block") {
      const code = document.createElement("code");
      code.className = "code-block";
      code.textContent = token.value.replace(/^\n|\n$/g, "");
      parent.append(code);
    } else if (token.type === "code") {
      const code = document.createElement("code");
      code.textContent = token.value;
      parent.append(code);
    } else {
      const el = document.createElement(TAGS[token.type]);
      renderTokens(el, token.children);
      parent.append(el);
    }
  }
}
