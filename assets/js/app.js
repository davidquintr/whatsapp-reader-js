import { parseChat } from "./parser.js";
import { LANGS, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $("file-input"),
  dropzone: $("dropzone"),
  status: $("status"),
  summary: $("summary"),
  participants: $("participants"),
  userList: $("user-list"),
  chat: $("chat"),
  reset: $("reset"),
  povStyle: $("pov-style"),
};

const state = {
  lang: pickLanguage(),
  chat: null, // result of parseChat
  fileName: "",
  selfIndex: 0,
  statusKey: null,
  statusVars: {},
};

// ---------- Preferences ----------

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode): ignore */
  }
}

function pickLanguage() {
  const saved = readPref("wa-lang");
  if (LANGS.includes(saved)) return saved;
  return (navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writePref("wa-theme", theme);
  document.querySelectorAll("[data-theme-value]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeValue === theme));
  });
}

function setLanguage(lang) {
  state.lang = lang;
  writePref("wa-lang", lang);
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-lang-value]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.langValue === lang));
  });
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(lang, el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((el) => {
    const label = t(lang, el.dataset.i18nLabel);
    el.setAttribute("aria-label", label);
    el.title = label;
  });
  render();
}

// ---------- File loading ----------

function loadFile(file) {
  if (!file) return;
  if (!/\.txt$/i.test(file.name) && file.type !== "text/plain") {
    setStatus("invalidType", {}, true);
    return;
  }
  setStatus("loading", { file: file.name });
  file
    .text()
    .then((content) => {
      const chat = parseChat(content);
      if (!chat.authors.length) {
        setStatus("noMessages", {}, true);
        return;
      }
      state.chat = chat;
      state.fileName = file.name;
      const self = chat.selfAuthor ? chat.authors.indexOf(chat.selfAuthor) : 0;
      state.selfIndex = Math.max(self, 0);
      setStatus(null);
      render();
      els.summary.scrollIntoView({ behavior: "smooth", block: "start" });
    })
    .catch(() => setStatus("readError", {}, true));
}

function resetToPreview() {
  state.chat = null;
  state.fileName = "";
  state.selfIndex = 0;
  els.fileInput.value = "";
  setStatus(null);
  render();
}

function setStatus(key, vars = {}, isError = false) {
  state.statusKey = key;
  state.statusVars = vars;
  els.status.classList.toggle("is-error", isError);
  renderStatus();
}

function renderStatus() {
  els.status.textContent = state.statusKey ? t(state.lang, state.statusKey, state.statusVars) : "";
}

// ---------- Rendering ----------

function sampleChat() {
  const L = state.lang;
  const at = (h, m) => new Date(2022, 8, 10, h, m);
  const you = L === "es" ? "Tú" : "You";
  const user = t(L, "sampleUser");
  return {
    authors: [user, you],
    selfAuthor: you,
    entries: [
      { type: "system", date: at(21, 58), author: "", text: t(L, "sampleNotice") },
      { type: "message", date: at(22, 0), author: user, text: t(L, "sampleBody") },
      { type: "message", date: at(22, 1), author: you, text: t(L, "sampleReply"), edited: true },
    ],
  };
}

function render() {
  renderStatus();
  const loaded = Boolean(state.chat);
  const chat = state.chat ?? sampleChat();
  const selfIndex = loaded ? state.selfIndex : 1;

  els.reset.hidden = !loaded;
  els.participants.hidden = !loaded;
  els.dropzone.classList.toggle("is-compact", loaded);

  const nf = new Intl.NumberFormat(state.lang);
  const count = chat.entries.filter((e) => e.type === "message").length;
  els.summary.textContent = loaded
    ? t(state.lang, "loaded", { file: state.fileName, n: nf.format(count) })
    : t(state.lang, "preview");

  renderParticipants(chat.authors, selfIndex);
  renderAuthorStyles(chat.authors, selfIndex);
  renderEntries(chat);
}

function hueFor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(hash) % 360;
}

function renderAuthorStyles(authors, selfIndex) {
  // Indices only (never user text) go into the stylesheet, so it cannot be injected.
  const rules = authors.map((name, i) => `[data-a="${i}"]{--hue:${hueFor(name)}}`);
  rules.push(
    `.row[data-a="${selfIndex}"]{justify-content:flex-end}`,
    `.row[data-a="${selfIndex}"] .bubble{background:var(--bubble-out)}`,
    `.row.first[data-a="${selfIndex}"] .bubble{border-start-end-radius:2px;border-start-start-radius:var(--radius)}`,
    `.row[data-a="${selfIndex}"] .author{display:none}`,
  );
  els.povStyle.textContent = rules.join("\n");
}

function renderParticipants(authors, selfIndex) {
  const frag = document.createDocumentFragment();
  authors.forEach((name, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "user-chip";
    btn.dataset.a = i;
    btn.setAttribute("aria-pressed", String(i === selfIndex));
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = [...name.trim()][0]?.toUpperCase() ?? "?";
    const label = document.createElement("span");
    label.textContent = name;
    btn.append(avatar, label);
    li.append(btn);
    frag.append(li);
  });
  els.userList.replaceChildren(frag);
}

function dayKey(date) {
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "none";
}

function renderEntries(chat) {
  const dayFmt = new Intl.DateTimeFormat(state.lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(state.lang, { hour: "numeric", minute: "2-digit" });
  const authorIndex = new Map(chat.authors.map((a, i) => [a, i]));
  const editedLabel = t(state.lang, "edited");

  const frag = document.createDocumentFragment();
  let section = null;
  let currentDay = null;
  let prevAuthor = null;

  for (const entry of chat.entries) {
    const key = dayKey(entry.date);
    if (!section || (entry.date && key !== currentDay)) {
      section = document.createElement("section");
      section.className = "day";
      if (entry.date) {
        const label = document.createElement("h3");
        label.className = "day-label";
        const span = document.createElement("span");
        span.textContent = dayFmt.format(entry.date);
        label.append(span);
        section.append(label);
      }
      frag.append(section);
      currentDay = key;
      prevAuthor = null;
    }

    if (entry.type === "system") {
      const row = document.createElement("div");
      row.className = "row system";
      const notice = document.createElement("p");
      notice.className = "notice";
      notice.textContent = entry.text.trim();
      row.append(notice);
      section.append(row);
      prevAuthor = null;
      continue;
    }

    const row = document.createElement("div");
    const a = authorIndex.get(entry.author);
    row.className = "row";
    row.dataset.a = a;
    if (prevAuthor !== entry.author) row.classList.add("first");

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (entry.media || entry.deleted) bubble.classList.add("muted");

    if (prevAuthor !== entry.author) {
      const author = document.createElement("p");
      author.className = "author";
      author.textContent = entry.author;
      bubble.append(author);
    }

    const text = document.createElement("p");
    text.className = "text";
    appendLinkified(text, entry.text);
    bubble.append(text);

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = (entry.edited ? editedLabel + " · " : "") + (entry.date ? timeFmt.format(entry.date) : "");
    bubble.append(meta);

    row.append(bubble);
    section.append(row);
    prevAuthor = entry.author;
  }

  els.chat.replaceChildren(frag);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

function appendLinkified(parent, text) {
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    const a = document.createElement("a");
    a.href = match[0];
    a.textContent = match[0];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    parent.append(a);
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

// ---------- Events ----------

els.fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));
els.reset.addEventListener("click", resetToPreview);

els.userList.addEventListener("click", (e) => {
  const btn = e.target.closest(".user-chip");
  if (!btn || !state.chat) return;
  state.selfIndex = Number(btn.dataset.a);
  renderParticipants(state.chat.authors, state.selfIndex);
  renderAuthorStyles(state.chat.authors, state.selfIndex);
});

document.querySelectorAll("[data-theme-value]").forEach((btn) =>
  btn.addEventListener("click", () => setTheme(btn.dataset.themeValue)),
);
document.querySelectorAll("[data-lang-value]").forEach((btn) =>
  btn.addEventListener("click", () => setLanguage(btn.dataset.langValue)),
);

// Drag & drop anywhere on the page.
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  dragDepth++;
  els.dropzone.classList.add("is-dragging");
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.dropzone.classList.remove("is-dragging");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropzone.classList.remove("is-dragging");
  loadFile(e.dataTransfer?.files[0]);
});

// ---------- Init ----------

setTheme(document.documentElement.dataset.theme || "dark");
setLanguage(state.lang);
