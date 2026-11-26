import { parseChat } from "./parser.js";
import { LANGS, t } from "./i18n.js";
import { renderEntries, hydrateAttachment } from "./render.js";
import { readZip, findChatEntry, isZip } from "./zip.js";
import { ChatSearch } from "./search.js";
import { computeStats } from "./stats.js";
import { renderStats, attachTooltip } from "./statsview.js";
import { compareChats } from "./diff.js";
import { exportHtml, printChat } from "./exporter.js";
import { tokenize, renderTokens } from "./format.js";

const $ = (id) => document.getElementById(id);

// Switching language moves the address bar between "/" and "/en/". Pin relative
// URLs (assets, sw.js, the export's stylesheet) to the site root first, as an
// absolute URL, so they keep resolving the same way after the move.
(() => {
  const siteRoot = new URL("./", document.baseURI).href;
  let base = document.querySelector("base");
  if (!base) {
    base = document.createElement("base");
    document.head.prepend(base);
  }
  base.href = siteRoot;
})();

const els = {
  fileInput: $("file-input"),
  dropzone: $("dropzone"),
  status: $("status"),
  summary: $("summary"),
  participants: $("participants"),
  userList: $("user-list"),
  chat: $("chat"),
  chatView: $("chat-view"),
  reset: $("reset"),
  povStyle: $("pov-style"),
  views: $("views"),
  stats: $("stats"),
  compare: $("compare"),
  compareButton: $("compare-button"),
  compareInput: $("compare-input"),
  exportHtml: $("export-html"),
  exportPdf: $("export-pdf"),
  searchbar: $("searchbar"),
  searchInput: $("search-input"),
  searchAuthor: $("search-author"),
  searchCount: $("search-count"),
  searchPrev: $("search-prev"),
  searchNext: $("search-next"),
  jumpDate: $("jump-date"),
  tooltip: $("tooltip"),
  viewer: $("viewer"),
  viewerImage: $("viewer-image"),
  viewerCaption: $("viewer-caption"),
};

const state = {
  lang: pickLanguage(),
  chat: null, // result of parseChat
  fileName: "",
  selfIndex: 0,
  view: "chat",
  media: null, // Map<fileName, zipEntry> for "with media" exports
  mediaUrls: new Map(), // fileName -> blob: URL
  stats: null,
  comparison: null, // { fileName, result }
  registry: null,
  statusKey: null,
  statusVars: {},
};

const search = new ChatSearch();

// Media are decompressed only when their message scrolls near the viewport.
const mediaObserver = new IntersectionObserver(
  (items) => {
    for (const item of items) {
      if (!item.isIntersecting) continue;
      mediaObserver.unobserve(item.target);
      const file = state.media?.get(item.target.dataset.file);
      if (file) hydrateAttachment(item.target, file, state.mediaUrls, state.lang);
    }
  },
  { rootMargin: "800px 0px" },
);

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

// Each language has its own URL ("/" Spanish, "/en/" English) so search engines
// can index both. The page's language is the default; an explicit choice wins.
function pickLanguage() {
  const saved = readPref("wa-lang");
  if (LANGS.includes(saved)) return saved;
  const pageLang = document.documentElement.lang;
  return LANGS.includes(pageLang) ? pageLang : "es";
}

/** Keeps the address bar on the URL of the language being shown. */
function syncLanguageUrl(lang) {
  const root = new URL("./", document.baseURI); // /en/ pages use <base href="../">
  const target = new URL(lang === "en" ? "en/" : "./", root);
  if (target.pathname !== location.pathname) {
    history.replaceState(history.state, "", target.pathname + location.search + location.hash);
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writePref("wa-theme", theme);
  document.querySelectorAll("[data-theme-value]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeValue === theme));
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#008069" : "#202c33");
}

function setLanguage(lang, { remember = true } = {}) {
  state.lang = lang;
  if (remember) writePref("wa-lang", lang);
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
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(lang, el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-content]").forEach((el) => {
    el.setAttribute("content", t(lang, el.dataset.i18nContent));
  });
  syncLanguageUrl(lang);
  render();
}

// ---------- File loading ----------

/** Reads a .txt or a WhatsApp .zip export. Returns { chat, media } or throws a status key. */
async function readExport(file) {
  if (isZip(file)) {
    let entries;
    try {
      entries = await readZip(file);
    } catch (error) {
      throw { key: "zipError", vars: { error: error.message } };
    }
    const chatEntry = findChatEntry(entries);
    if (!chatEntry) throw { key: "zipNoChat" };
    const chat = parseChat(await chatEntry.text());
    const media = new Map(entries.filter((e) => e !== chatEntry).map((e) => [e.baseName, e]));
    return { chat, media };
  }
  if (!/\.txt$/i.test(file.name) && !file.type.startsWith("text/")) throw { key: "invalidType" };
  return { chat: parseChat(await file.text()), media: null };
}

async function loadFile(file) {
  if (!file) return;
  setStatus("loading", { file: file.name });
  try {
    const { chat, media } = await readExport(file);
    if (!chat.authors.length) throw { key: "noMessages" };
    releaseMedia();
    state.chat = chat;
    state.media = media;
    state.fileName = file.name;
    state.stats = null;
    state.comparison = null;
    const self = chat.selfAuthor ? chat.authors.indexOf(chat.selfAuthor) : 0;
    state.selfIndex = Math.max(self, 0);
    state.view = "chat";
    els.searchInput.value = "";
    setStatus(null);
    render();
    els.summary.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error?.key || "readError", error?.vars || {}, true);
  }
}

async function loadComparison(file) {
  if (!file || !state.chat) return;
  setStatus("loading", { file: file.name });
  try {
    const { chat } = await readExport(file);
    if (!chat.authors.length) throw { key: "noMessages" };
    state.comparison = { fileName: file.name, result: compareChats(state.chat, chat) };
    setStatus(null);
    renderComparison();
    els.compare.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error?.key || "readError", error?.vars || {}, true);
  } finally {
    els.compareInput.value = "";
  }
}

function releaseMedia() {
  for (const url of state.mediaUrls.values()) URL.revokeObjectURL(url);
  state.mediaUrls.clear();
  mediaObserver.disconnect();
}

function resetToPreview() {
  releaseMedia();
  Object.assign(state, { chat: null, fileName: "", selfIndex: 0, media: null, stats: null, comparison: null, view: "chat" });
  els.fileInput.value = "";
  els.searchInput.value = "";
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
  const base = { edited: false, media: false, deleted: false, attachment: null, location: null, poll: null, kind: "text" };
  return {
    authors: [user, you],
    selfAuthor: you,
    entries: [
      { ...base, type: "system", date: at(21, 58), author: "", text: t(L, "sampleNotice") },
      { ...base, type: "message", date: at(22, 0), author: user, text: t(L, "sampleBody") },
      { ...base, type: "message", date: at(22, 1), author: you, text: t(L, "sampleReply"), edited: true },
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
  els.views.hidden = !loaded;
  els.searchbar.hidden = !loaded;
  els.dropzone.classList.toggle("is-compact", loaded);
  els.chat.classList.toggle("is-preview", !loaded);

  const nf = new Intl.NumberFormat(state.lang);
  const count = chat.entries.filter((e) => e.type === "message").length;
  els.summary.textContent = !loaded
    ? t(state.lang, "preview")
    : state.media
      ? t(state.lang, "loadedMedia", { file: state.fileName, n: nf.format(count), m: nf.format(state.media.size) })
      : t(state.lang, "loaded", { file: state.fileName, n: nf.format(count) });

  renderParticipants(chat.authors, selfIndex);
  renderAuthorStyles(chat.authors, selfIndex);

  mediaObserver.disconnect();
  state.registry = renderEntries(els.chat, chat, {
    lang: state.lang,
    media: state.media,
    observer: mediaObserver,
  });
  search.setRegistry(state.registry);

  if (loaded) {
    renderSearchControls(chat);
    runSearch();
  }
  renderComparison();
  showView(loaded ? state.view : "chat");
}

function showView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.view === view));
  });
  els.chatView.hidden = view !== "chat";
  els.stats.hidden = view !== "stats";
  if (view === "stats" && state.chat) {
    state.stats ??= computeStats(state.chat);
    renderStats(els.stats, state.stats, state.lang);
  }
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
    `.row[data-a="${selfIndex}"] .bubble{background:var(--bubble-out);--meta:var(--meta-out)}`,
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

// ---------- Search & jump to date ----------

function renderSearchControls(chat) {
  const selected = els.searchAuthor.value;
  const all = new Option(t(state.lang, "everyone"), "");
  els.searchAuthor.replaceChildren(all, ...chat.authors.map((a, i) => new Option(a, String(i))));
  els.searchAuthor.value = selected && Number(selected) < chat.authors.length ? selected : "";

  const dated = chat.entries.filter((e) => e.date);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (dated.length) {
    els.jumpDate.min = iso(dated[0].date);
    els.jumpDate.max = iso(dated.at(-1).date);
  }
}

function runSearch() {
  if (!state.chat) return;
  const author = els.searchAuthor.value;
  const authorName = author === "" ? null : state.chat.authors[Number(author)];
  search.run(els.searchInput.value, (i) => !authorName || state.chat.entries[i].author === authorName);
  updateSearchCount();
}

function updateSearchCount() {
  const query = els.searchInput.value.trim();
  const n = search.matches.length;
  const nf = new Intl.NumberFormat(state.lang);
  els.searchCount.textContent = !query
    ? ""
    : !n
      ? t(state.lang, "noResults")
      : t(state.lang, "resultOf", { i: search.current < 0 ? "–" : nf.format(search.current + 1), n: nf.format(n) });
  els.searchPrev.disabled = els.searchNext.disabled = n === 0;
}

let searchTimer;
els.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 200);
});
els.searchInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  clearTimeout(searchTimer);
  if (!search.matches.length) runSearch();
  search.go(e.shiftKey ? -1 : 1);
  updateSearchCount();
});
els.searchAuthor.addEventListener("change", runSearch);
els.searchPrev.addEventListener("click", () => {
  search.go(-1);
  updateSearchCount();
});
els.searchNext.addEventListener("click", () => {
  search.go(1);
  updateSearchCount();
});

els.jumpDate.addEventListener("change", () => {
  if (!els.jumpDate.value || !state.registry) return;
  const [y, m, d] = els.jumpDate.value.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const day = state.registry.days.find((x) => x.date >= target) ?? state.registry.days.at(-1);
  day?.el.scrollIntoView({ block: "start", behavior: "smooth" });
});

// ---------- Comparison ----------

function renderComparison() {
  const cmp = state.comparison;
  els.compare.hidden = !cmp || !state.chat;
  if (!cmp || !state.chat) return els.compare.replaceChildren();

  const L = state.lang;
  const nf = new Intl.NumberFormat(L);
  const dateFmt = new Intl.DateTimeFormat(L, { dateStyle: "medium", timeStyle: "short" });
  const { onlyInA, onlyInB, common } = cmp.result;
  const LIMIT = 200;

  const head = document.createElement("div");
  head.className = "compare-head";
  const title = document.createElement("h2");
  title.textContent = t(L, "compareTitle", { file: cmp.fileName });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "action";
  close.textContent = t(L, "close");
  close.addEventListener("click", () => {
    state.comparison = null;
    renderComparison();
  });
  head.append(title, close);

  const summary = document.createElement("p");
  summary.className = "hint";
  summary.textContent = t(L, "compareSummary", { common: nf.format(common) });

  const group = (label, items, linkable) => {
    const details = document.createElement("details");
    details.className = "compare-group";
    details.open = items.length > 0 && items.length <= 20;
    const summaryEl = document.createElement("summary");
    summaryEl.textContent = label;
    details.append(summaryEl);
    const list = document.createElement("ul");
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent = t(L, "compareNone");
      list.append(li);
    }
    for (const e of items.slice(0, LIMIT)) {
      const li = document.createElement("li");
      const when = document.createElement("span");
      when.className = "compare-when";
      when.textContent = `${e.date ? dateFmt.format(e.date) : ""} · ${e.author}`;
      const text = document.createElement("span");
      text.className = "compare-text";
      text.textContent = e.attachment ?? e.text;
      li.append(when, text);
      if (linkable) {
        const index = state.chat.entries.indexOf(e);
        const go = document.createElement("button");
        go.type = "button";
        go.className = "link-button";
        go.textContent = t(L, "showInChat");
        go.addEventListener("click", () => {
          showView("chat");
          search.focusRow(state.registry.rows[index]);
        });
        li.append(go);
      }
      list.append(li);
    }
    if (items.length > LIMIT) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent = t(L, "compareMore", { n: nf.format(items.length - LIMIT) });
      list.append(li);
    }
    details.append(list);
    return details;
  };

  els.compare.replaceChildren(
    head,
    summary,
    group(t(L, "onlyInA", { n: nf.format(onlyInA.length) }), onlyInA, true),
    group(t(L, "onlyInB", { file: cmp.fileName, n: nf.format(onlyInB.length) }), onlyInB, false),
  );
}

// ---------- Events ----------

els.fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));
els.reset.addEventListener("click", resetToPreview);
els.compareButton.addEventListener("click", () => els.compareInput.click());
els.compareInput.addEventListener("change", (e) => loadComparison(e.target.files[0]));

els.exportHtml.addEventListener("click", () => {
  if (!state.chat) return;
  exportHtml({
    chat: els.chat,
    extraCss: els.povStyle.textContent,
    theme: document.documentElement.dataset.theme,
    lang: state.lang,
    title: state.fileName.replace(/\.(txt|zip)$/i, ""),
    footer: t(state.lang, "exportedOn"),
    fileName: state.fileName.replace(/\.(txt|zip)$/i, "") + ".html",
  });
});
els.exportPdf.addEventListener("click", printChat);

document.querySelectorAll("[data-view]").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));

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

attachTooltip(els.stats, els.tooltip);

// Tapping a photo opens it full screen, like WhatsApp.
els.chat.addEventListener("click", (e) => {
  const img = e.target.closest("img[data-viewer]");
  if (!img) return;
  const row = img.closest(".row");
  const entry = row ? state.chat?.entries[Number(row.dataset.i)] : null;
  els.viewerImage.src = img.src;
  els.viewerImage.alt = img.alt;
  els.viewerCaption.replaceChildren();
  if (entry) {
    const author = document.createElement("strong");
    author.textContent = entry.author;
    els.viewerCaption.append(author);
    if (entry.text.trim()) {
      els.viewerCaption.append(": ");
      renderTokens(els.viewerCaption, tokenize(entry.text.trim()));
    }
  }
  els.viewer.showModal();
});
// Close on any click (backdrop, image or button); Esc is handled by <dialog>.
els.viewer.addEventListener("click", () => els.viewer.close());
els.viewer.addEventListener("close", () => els.viewerImage.removeAttribute("src"));

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

// ---------- PWA: offline cache and Android share target ----------

async function loadSharedFile() {
  const params = new URLSearchParams(location.search);
  if (!params.has("shared")) return;
  history.replaceState(null, "", location.pathname);
  try {
    const cache = await caches.open("wa-share");
    const response = await cache.match("shared-file");
    if (!response) return;
    const name = decodeURIComponent(response.headers.get("X-File-Name") || "chat.txt");
    const blob = await response.blob();
    await cache.delete("shared-file");
    loadFile(new File([blob], name, { type: blob.type }));
  } catch {
    setStatus("readError", {}, true);
  }
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ---------- Init ----------

setTheme(document.documentElement.dataset.theme || "dark");
setLanguage(state.lang, { remember: false });
loadSharedFile();
