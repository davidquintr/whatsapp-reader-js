// Parser for WhatsApp chat exports (.txt).
//
// Supported header shapes (spaces may be regular, NBSP or NARROW NBSP U+202F):
//   Web / iOS : [11/23/26, 8:40:30 PM] Name: text
//               [23/11/2026, 20:40:30] Name: text
//   Android   : 11/23/26, 8:40 PM - Name: text
//               23/11/26 8:40 p. m. - Name: text
//               23/11/2026, 20:40 - Name: text
//
// The parser is pure (no DOM) so it can be tested with Node.

const SEP = "[\\/.\\-]";
const DATE = `(\\d{1,4})${SEP}(\\d{1,2})${SEP}(\\d{1,4})`;
const TIME = "(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?";
const MERIDIEM = "(?:\\s*([ap]\\.?\\s*m\\.?))?";

const BRACKET_RE = new RegExp(`^\\[${DATE},?\\s+${TIME}${MERIDIEM}\\]\\s*(.*)$`, "i");
const DASH_RE = new RegExp(`^${DATE},?\\s+${TIME}${MERIDIEM}\\s+[-–]\\s+(.*)$`, "i");

// Invisible direction marks WhatsApp sprinkles around attachments and names.
const INVISIBLE_RE = /[‎‏‪-‮⁦-⁩﻿]/g;

// Names WhatsApp uses for the exporting user in web/iOS exports.
const SELF_NAMES = new Set(["you", "tú", "tu", "vous", "você", "du", "voi", "jij"]);

// System events that may contain ": " and could be mistaken for "Author: text".
const SYSTEM_HINTS = [
  "changed the subject", "changed the group", "changed this group", "created group",
  "cambió el asunto", "cambió la descripción", "cambió el nombre", "creó el grupo",
  "cambiaste el asunto", "cambiaste la descripción", "creaste el grupo",
];

const MEDIA_RE = /^<[^<>]*\b(omitted|omitid[oa]s?)>$/i;
// iOS: "<attached: 00000003-PHOTO-2026-11-23.jpg>"; Android: "IMG-20261123-WA0003.jpg (file attached)".
const ATTACHED_IOS_RE = /^<(?:attached|adjunto|archivo adjunto): ([^<>]+)>(?:\n([\s\S]*))?$/i;
const ATTACHED_ANDROID_RE = /^([^\n]+?\.[a-z0-9]{2,5}) \((?:file attached|archivo adjunto)\)(?:\n([\s\S]*))?$/i;
const LOCATION_RE = /^(?:location|ubicación|ubicacion): (https?:\/\/\S+)$/i;
const MAPS_URL_RE = /^https?:\/\/(?:maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl)\S*$/i;
const POLL_RE = /^(?:POLL|ENCUESTA):\n([^\n]*)\n((?:(?:OPTION|OPCIÓN|OPCION): .*(?:\n|$))+)$/i;
const POLL_OPTION_RE = /^(?:OPTION|OPCIÓN|OPCION): (.*?)(?: \((\d+) (?:votes?|votos?)\))?$/i;
const DELETED_RE = /^(this message was deleted|you deleted this message|se eliminó este mensaje\.?|eliminaste este mensaje\.?)$/i;
const EDITED_RE = /\s*<(this message was edited|se editó este mensaje\.?)>$/i;

/**
 * @typedef {Object} ChatEntry
 * @property {"message"|"system"} type
 * @property {Date|null} date
 * @property {string} author        empty for system entries
 * @property {string} text
 * @property {boolean} edited
 * @property {boolean} media
 * @property {boolean} deleted
 * @property {"text"|"media"|"deleted"|"attachment"|"contact"|"location"|"poll"} kind
 * @property {string|null} attachment   file name inside a "with media" export
 * @property {{url: string, lat: number|null, lng: number|null}|null} location
 * @property {{question: string, options: {label: string, votes: number}[]}|null} poll
 */

/**
 * @param {string} content raw file content
 * @returns {{entries: ChatEntry[], authors: string[], selfAuthor: string|null, dateOrder: "DMY"|"MDY"|"YMD"}}
 */
export function parseChat(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const raw = [];

  for (const line of lines) {
    const clean = line.replace(INVISIBLE_RE, "");
    const header = matchHeader(clean);
    if (header) {
      raw.push(header);
    } else if (raw.length) {
      raw[raw.length - 1].rest += "\n" + clean;
    } else if (clean.trim()) {
      // Text before the first header (web exports start with the encryption notice).
      raw.push({ date: null, rest: clean, forcedSystem: true });
    }
  }

  const dateOrder = detectDateOrder(raw);
  const candidates = raw.map(splitAuthor);
  const frequency = new Map();
  for (const c of candidates) {
    if (c.author) frequency.set(c.author, (frequency.get(c.author) || 0) + 1);
  }

  const entries = [];
  const authors = [];
  const seen = new Set();

  raw.forEach((r, i) => {
    const date = r.date ? buildDate(r.date, dateOrder) : null;
    const { author, text } = candidates[i];
    const isSystem = !author || (frequency.get(author) === 1 && looksLikeSystem(author));

    if (isSystem) {
      entries.push(makeEntry("system", date, "", r.rest.replace(/^-\s+/, "")));
      return;
    }

    if (!seen.has(author)) {
      seen.add(author);
      authors.push(author);
    }
    entries.push(makeEntry("message", date, author, text));
  });

  const selfAuthor = authors.find((a) => SELF_NAMES.has(a.toLowerCase())) ?? null;
  return { entries, authors, selfAuthor, dateOrder };
}

function matchHeader(line) {
  const m = BRACKET_RE.exec(line) || DASH_RE.exec(line);
  if (!m) return null;
  const [, a, b, c, hour, minute, second, meridiem, rest] = m;
  return {
    date: {
      parts: [a, b, c],
      hour: +hour,
      minute: +minute,
      second: second ? +second : 0,
      meridiem: meridiem ? meridiem[0].toLowerCase() : null,
      dotted: meridiem ? meridiem.includes(".") : false,
    },
    rest,
  };
}

/** Decides whether dates are day-first, month-first or year-first. */
function detectDateOrder(raw) {
  const dated = raw.filter((r) => r.date).map((r) => r.date.parts.map(Number));
  if (!dated.length) return "DMY";
  if (dated.some(([a]) => a > 31)) return "YMD";
  if (dated.some(([a]) => a > 12)) return "DMY";
  if (dated.some(([, b]) => b > 12)) return "MDY";

  // Ambiguous (every day <= 12): pick the order that keeps the chat chronological.
  const backwards = (order) => {
    let count = 0;
    let prev = -Infinity;
    for (const p of dated) {
      const [d, m, y] = order === "DMY" ? p : [p[1], p[0], p[2]];
      const key = normalizeYear(y) * 10000 + m * 100 + d;
      if (key < prev) count++;
      prev = key;
    }
    return count;
  };
  const dmy = backwards("DMY");
  const mdy = backwards("MDY");
  if (dmy !== mdy) return dmy < mdy ? "DMY" : "MDY";

  // Still tied: "AM/PM" (no dots) is the English month-first style; the rest are day-first.
  const first = raw.find((r) => r.date).date;
  return first.meridiem && !first.dotted ? "MDY" : "DMY";
}

function normalizeYear(y) {
  return y < 100 ? 2000 + y : y;
}

function buildDate({ parts, hour, minute, second, meridiem }, order) {
  const n = parts.map(Number);
  const [d, m, y] = order === "YMD" ? [n[2], n[1], n[0]] : order === "MDY" ? [n[1], n[0], n[2]] : n;
  let h = hour % 12;
  if (meridiem === "p") h += 12;
  else if (!meridiem) h = hour;
  const date = new Date(normalizeYear(y), m - 1, d, h, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitAuthor(r) {
  if (r.forcedSystem || r.rest.startsWith("- ")) return { author: "", text: r.rest };
  const firstLine = r.rest.split("\n", 1)[0];
  const idx = firstLine.indexOf(": ");
  const endsWithColon = idx === -1 && firstLine.endsWith(":");
  if (idx === -1 && !endsWithColon) return { author: "", text: r.rest };
  const cut = endsWithColon ? firstLine.length - 1 : idx;
  const author = r.rest.slice(0, cut).trim();
  if (!author || author.length > 60) return { author: "", text: r.rest };
  return { author, text: r.rest.slice(cut + (endsWithColon ? 1 : 2)) };
}

function looksLikeSystem(author) {
  const lower = author.toLowerCase();
  return SYSTEM_HINTS.some((hint) => lower.includes(hint));
}

function makeEntry(type, date, author, text) {
  let body = text;
  let edited = false;
  if (EDITED_RE.test(body)) {
    edited = true;
    body = body.replace(EDITED_RE, "");
  }
  const entry = {
    type,
    date,
    author,
    text: body,
    edited,
    media: false,
    deleted: false,
    kind: "text",
    attachment: null,
    location: null,
    poll: null,
  };
  if (type === "message") classify(entry);
  return entry;
}

function classify(entry) {
  const trimmed = entry.text.trim();

  if (MEDIA_RE.test(trimmed)) {
    entry.media = true;
    entry.kind = "media";
    return;
  }
  if (DELETED_RE.test(trimmed)) {
    entry.deleted = true;
    entry.kind = "deleted";
    return;
  }

  const attached = ATTACHED_IOS_RE.exec(trimmed) || ATTACHED_ANDROID_RE.exec(trimmed);
  if (attached) {
    entry.attachment = attached[1].trim();
    entry.text = (attached[2] || "").trim(); // caption, if any
    entry.kind = /\.vcf$/i.test(entry.attachment) ? "contact" : "attachment";
    return;
  }

  const location = LOCATION_RE.exec(trimmed);
  const url = location ? location[1] : MAPS_URL_RE.test(trimmed) ? trimmed : null;
  if (url) {
    const coords = /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(url);
    entry.kind = "location";
    entry.location = { url, lat: coords ? +coords[1] : null, lng: coords ? +coords[2] : null };
    return;
  }

  const poll = POLL_RE.exec(trimmed);
  if (poll) {
    entry.kind = "poll";
    entry.poll = {
      question: poll[1].trim(),
      options: poll[2]
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const m = POLL_OPTION_RE.exec(line.trim());
          return { label: m ? m[1] : line, votes: m && m[2] ? +m[2] : 0 };
        }),
    };
  }
}
