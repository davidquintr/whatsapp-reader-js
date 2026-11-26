// Renders parsed chat entries into the DOM. Text always goes through
// textContent / text nodes, never innerHTML.

import { tokenize, renderTokens } from "./format.js";
import { t } from "./i18n.js";

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime", webm: "video/webm",
  opus: "audio/ogg", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
  pdf: "application/pdf", vcf: "text/vcard",
};

const ext = (name) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase();
export const mimeFor = (name) => MIME[ext(name)] || "application/octet-stream";

// Android: "STK-20260301-WA0002.webp"; iOS: "00000002-STICKER-2026-….webp". Photos are never WebP.
const isSticker = (name) => /(^|[-_])(STK|STICKER)[-_]/i.test(name) || ext(name) === "webp";

/** How an attachment is drawn: "sticker", "image", "video", or null for a file chip. */
function visualKind(entry, ctx) {
  if (entry.kind !== "attachment" || !ctx.media?.has(entry.attachment)) return null;
  const type = mimeFor(entry.attachment);
  if (type.startsWith("image/")) return isSticker(entry.attachment) ? "sticker" : "image";
  if (type.startsWith("video/")) return "video";
  return null;
}

// WhatsApp crops very tall or very wide photos instead of showing them whole.
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.9;
const MEDIA_WIDTH = 330; // landscape photos
const MEDIA_MAX_HEIGHT = 360; // portrait photos get narrower instead of taller

/** Gives the frame the photo's proportions, and the bubble the photo's width. */
function sizeFrame(box, ratio) {
  const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  const width = Math.min(MEDIA_WIDTH, Math.round(MEDIA_MAX_HEIGHT * clamped));
  box.style.aspectRatio = String(clamped);
  box.closest(".bubble")?.style.setProperty("--media-w", `${width}px`);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function dayKey(date) {
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "none";
}

/**
 * @param {HTMLElement} container
 * @param {{entries: object[], authors: string[]}} chat
 * @param {{lang: string, media: Map<string, object>|null, observer: IntersectionObserver|null}} ctx
 * @returns {{rows: (HTMLElement|null)[], texts: (HTMLElement|null)[], plain: string[], days: {date: Date, el: HTMLElement}[]}}
 */
export function renderEntries(container, chat, ctx) {
  const { lang } = ctx;
  const dayFmt = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit" });
  const authorIndex = new Map(chat.authors.map((a, i) => [a, i]));
  const editedLabel = t(lang, "edited");

  const registry = { rows: [], texts: [], plain: [], days: [] };
  const frag = document.createDocumentFragment();
  let section = null;
  let currentDay = null;
  let prevAuthor = null;

  chat.entries.forEach((entry, index) => {
    const key = dayKey(entry.date);
    if (!section || (entry.date && key !== currentDay)) {
      section = el("section", "day");
      if (entry.date) {
        const label = el("h2", "day-label");
        label.append(el("span", null, dayFmt.format(entry.date)));
        section.append(label);
        registry.days.push({ date: entry.date, el: section });
      }
      frag.append(section);
      currentDay = key;
      prevAuthor = null;
    }

    if (entry.type === "system") {
      const row = el("div", "row system");
      const notice = el("p", "notice", entry.text.trim());
      row.append(notice);
      section.append(row);
      registry.rows[index] = row;
      registry.texts[index] = notice;
      registry.plain[index] = notice.textContent;
      prevAuthor = null;
      return;
    }

    const row = el("div", "row");
    row.dataset.a = authorIndex.get(entry.author);
    row.dataset.i = index;
    const first = prevAuthor !== entry.author;
    if (first) row.classList.add("first");

    const bubble = el("div", "bubble");
    if (entry.media || entry.deleted) bubble.classList.add("muted");
    const visual = visualKind(entry, ctx);
    if (visual === "sticker") bubble.classList.add("sticker-bubble");
    else if (visual) bubble.classList.add("has-media");
    if (visual === "image" && !entry.text.trim()) bubble.classList.add("media-only");
    if (first) bubble.append(el("p", "author", entry.author));

    const special = renderSpecial(entry, ctx);
    if (special) bubble.append(special);

    const text = el("p", "text");
    if (entry.kind === "text" || entry.kind === "media" || entry.kind === "deleted") {
      renderTokens(text, entry.media || entry.deleted ? [{ type: "text", value: entry.text }] : tokenize(entry.text));
    } else if (entry.text && entry.kind !== "poll" && entry.kind !== "location") {
      renderTokens(text, tokenize(entry.text)); // attachment caption
    }
    if (text.childNodes.length) bubble.append(text);

    const meta = el("span", "meta");
    meta.textContent = (entry.edited ? editedLabel + " · " : "") + (entry.date ? timeFmt.format(entry.date) : "");
    bubble.append(meta);

    row.append(bubble);
    section.append(row);
    registry.rows[index] = row;
    registry.texts[index] = text.childNodes.length ? text : null;
    registry.plain[index] = text.textContent;
    prevAuthor = entry.author;
  });

  container.replaceChildren(frag);
  return registry;
}

function renderSpecial(entry, ctx) {
  const { lang } = ctx;
  switch (entry.kind) {
    case "attachment":
    case "contact": {
      const box = el("div", "attachment");
      box.dataset.file = entry.attachment;
      const file = ctx.media?.get(entry.attachment);
      const visual = visualKind(entry, ctx);
      if (visual) {
        // Reserve the final size so nothing jumps when the media arrives.
        box.classList.add("is-pending", visual === "sticker" ? "sticker-frame" : "media-frame");
        ctx.observer?.observe(box);
      } else if (file) {
        box.classList.add("is-pending");
        box.append(fileChip(entry, lang, null));
        ctx.observer?.observe(box);
      } else {
        box.append(fileChip(entry, lang, t(lang, "attachmentMissing")));
      }
      return box;
    }
    case "location": {
      const { url, lat, lng } = entry.location;
      const card = el("a", "card location");
      card.href = url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.append(icon("pin"));
      const body = el("span", "card-body");
      body.append(el("strong", null, t(lang, "location")));
      if (lat != null) body.append(el("span", "card-sub", `${lat.toFixed(5)}, ${lng.toFixed(5)}`));
      body.append(el("span", "card-link", t(lang, "openMap")));
      card.append(body);
      return card;
    }
    case "poll": {
      const { question, options } = entry.poll;
      const total = options.reduce((s, o) => s + o.votes, 0);
      const card = el("div", "card poll");
      const head = el("div", "poll-head");
      head.append(icon("poll"), el("span", "card-sub", t(lang, "poll")));
      card.append(head, el("strong", "poll-question", question));
      const list = el("ul", "poll-options");
      for (const o of options) {
        const li = el("li");
        const label = el("span", "poll-label", o.label);
        const count = el("span", "poll-count", o.votes === 1 ? t(lang, "vote") : t(lang, "votes", { n: o.votes }));
        const bar = el("span", "poll-bar");
        bar.style.setProperty("--share", total ? o.votes / total : 0);
        li.append(label, count, bar);
        list.append(li);
      }
      card.append(list);
      return card;
    }
    default:
      return null;
  }
}

function fileChip(entry, lang, note) {
  const chip = el("span", "file-chip");
  chip.append(icon(entry.kind === "contact" ? "contact" : "file"));
  const body = el("span", "card-body");
  const name = entry.kind === "contact" ? entry.attachment.replace(/\.vcf$/i, "") : entry.attachment;
  body.append(el("strong", null, name));
  if (note) body.append(el("span", "card-sub", note));
  else if (entry.kind === "contact") body.append(el("span", "card-sub", t(lang, "contact")));
  chip.append(body);
  return chip;
}

/** Replaces a pending attachment placeholder with the real media. */
export async function hydrateAttachment(box, file, urls, lang) {
  box.classList.remove("is-pending");
  const name = box.dataset.file;
  try {
    let url = urls.get(name);
    let blob = null;
    if (!url) {
      blob = new Blob([await file.blob()], { type: mimeFor(name) });
      url = URL.createObjectURL(blob);
      urls.set(name, url);
    }
    const type = mimeFor(name);
    let media;
    if (type.startsWith("image/") && isSticker(name)) {
      media = el("img", "sticker");
      media.src = url;
      media.alt = name;
    } else if (type.startsWith("image/")) {
      media = el("img", "photo");
      media.src = url;
      media.alt = name;
      media.dataset.viewer = "";
      await media.decode().catch(() => {});
      if (media.naturalWidth && media.naturalHeight) sizeFrame(box, media.naturalWidth / media.naturalHeight);
    } else if (type.startsWith("video/")) {
      media = el("video", "video");
      media.src = url;
      media.controls = true;
      media.preload = "metadata";
      media.addEventListener("loadedmetadata", () => {
        if (media.videoWidth && media.videoHeight) sizeFrame(box, media.videoWidth / media.videoHeight);
      });
    } else if (type.startsWith("audio/")) {
      media = el("audio", "media-audio");
      media.src = url;
      media.controls = true;
      media.preload = "metadata";
    } else if (type === "text/vcard") {
      const vcf = await (blob || (await file.blob())).text();
      media = contactCard(vcf, name, lang);
    } else {
      media = el("a", "file-chip");
      media.href = url;
      media.download = name;
      media.append(icon("file"));
      const body = el("span", "card-body");
      body.append(el("strong", null, name), el("span", "card-link", t(lang, "download")));
      media.append(body);
    }
    box.replaceChildren(media);
  } catch {
    // Fall back to a plain file chip inside a regular bubble.
    box.classList.remove("media-frame", "sticker-frame");
    box.style.aspectRatio = "";
    box.closest(".bubble")?.classList.remove("has-media", "media-only", "sticker-bubble");
    box.replaceChildren(fileChip({ kind: "attachment", attachment: name }, lang, t(lang, "attachmentMissing")));
  }
}

function contactCard(vcf, fileName, lang) {
  const unfold = vcf.replace(/\r?\n[ \t]/g, "");
  const fn = /^FN[^:]*:(.*)$/im.exec(unfold)?.[1]?.trim() || fileName.replace(/\.vcf$/i, "");
  const phones = [...unfold.matchAll(/^TEL[^:]*:(.*)$/gim)].map((m) => m[1].trim()).filter(Boolean);
  const card = el("div", "card contact");
  card.append(icon("contact"));
  const body = el("span", "card-body");
  body.append(el("strong", null, fn));
  body.append(el("span", "card-sub", phones.length ? phones.join(" · ") : t(lang, "contact")));
  card.append(body);
  return card;
}

const ICONS = {
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  contact: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  pin: "M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  poll: "M5 20V10M12 20V4M19 20v-7",
};

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("card-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
