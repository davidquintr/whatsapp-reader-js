// Chat statistics computed from parseChat() output. Pure: no DOM.

const HOUR = 3600e3;
const DAY = 24 * HOUR;
// A new "conversation" starts after this much silence.
export const CONVERSATION_GAP = 6 * HOUR;
// Replies slower than this are not counted as response time.
const MAX_REPLY = 12 * HOUR;

const STOPWORDS = new Set(
  (
    // Spanish
    "que de la el en y a los se del las un por con no una su para es al lo como más mas pero sus le ya o " +
    "este sí si porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos " +
    "durante todos uno les ni contra otros ese eso ante ellos e esto mí mi antes algunos qué unos yo otro " +
    "otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo " +
    "nosotros tu tus te ti tú vos sos son era fue ser soy está están estoy eres has ha he hace bien pues " +
    "así asi solo sólo ahí ahi aquí aqui va vas voy ver tan tengo tiene tienes jaja jajaja jajajaja " +
    // English
    "the and to of a in is it you that i for on with this my be are was have not at but so me just your " +
    "do can if we all what about get like they he she or an no yes one up out how when there will its " +
    "im i'm it's dont don't lol haha hahaha ok okay"
  ).split(/\s+/),
);

const WORD_RE = /[\p{L}][\p{L}'’]{2,}/gu;
const URL_RE = /https?:\/\/\S+/g;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/**
 * @param {{entries: object[], authors: string[]}} chat
 */
export function computeStats(chat) {
  const messages = chat.entries.filter((e) => e.type === "message" && e.date);
  const authors = chat.authors.map((name) => ({
    name,
    messages: 0,
    words: 0,
    media: 0,
    starts: 0,
    replyTimes: [],
  }));
  const byName = new Map(authors.map((a) => [a.name, a]));

  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0)); // [weekday Mon=0][hour]
  const months = new Map(); // "YYYY-MM" -> count
  const days = new Map(); // "YYYY-MM-DD" -> count
  const words = new Map();
  const emojis = new Map();
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

  let edited = 0;
  let deleted = 0;
  let media = 0;
  let prev = null;

  for (const m of messages) {
    const a = byName.get(m.author);
    a.messages++;
    if (m.edited) edited++;
    if (m.deleted) deleted++;
    const isMedia = m.media || m.kind === "attachment" || m.kind === "contact";
    if (isMedia) {
      media++;
      a.media++;
    }

    const d = m.date;
    heatmap[(d.getDay() + 6) % 7][d.getHours()]++;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.set(monthKey, (months.get(monthKey) || 0) + 1);
    const dayKey = `${monthKey}-${String(d.getDate()).padStart(2, "0")}`;
    days.set(dayKey, (days.get(dayKey) || 0) + 1);

    if (!prev || d - prev.date >= CONVERSATION_GAP) a.starts++;
    else if (prev.author !== m.author && d - prev.date <= MAX_REPLY) a.replyTimes.push(d - prev.date);
    prev = m;

    if (m.kind !== "text") continue;
    const text = m.text.replace(URL_RE, " ");
    for (const w of text.toLowerCase().match(WORD_RE) || []) {
      a.words++;
      if (!STOPWORDS.has(w) && !/^(?:ja|je|ha|js|jk|ka)+[a-z]?$/.test(w)) words.set(w, (words.get(w) || 0) + 1);
    }
    if (EMOJI_RE.test(text)) {
      const graphemes = segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
      for (const g of graphemes) if (EMOJI_RE.test(g)) emojis.set(g, (emojis.get(g) || 0) + 1);
    }
  }

  const sortedDays = [...days.keys()].sort();
  return {
    total: messages.length,
    media,
    edited,
    deleted,
    first: messages[0]?.date ?? null,
    last: messages.at(-1)?.date ?? null,
    activeDays: days.size,
    streak: longestStreak(sortedDays),
    busiestDay: maxEntry(days),
    heatmap,
    months: fillMonths(months),
    authors: authors.map(({ replyTimes, ...a }) => ({ ...a, medianReply: median(replyTimes) })),
    topWords: top(words, 12),
    topEmojis: top(emojis, 10),
  };
}

function top(map, n) {
  return [...map.entries()]
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

function maxEntry(map) {
  let best = null;
  for (const [key, count] of map) if (!best || count > best.count) best = { date: keyToDate(key), count };
  return best;
}

function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function longestStreak(sortedKeys) {
  let best = null;
  let start = null;
  let prev = null;
  let length = 0;
  for (const key of sortedKeys) {
    const date = keyToDate(key);
    // Round to absorb DST shifts (23h/25h days).
    if (prev && Math.round((date - prev) / DAY) === 1) {
      length++;
    } else {
      start = date;
      length = 1;
    }
    if (!best || length > best.days) best = { days: length, start, end: date };
    prev = date;
  }
  return best;
}

/** Every month between the first and last one, including empty months. */
function fillMonths(months) {
  const keys = [...months.keys()].sort();
  if (!keys.length) return [];
  const out = [];
  let [y, m] = keys[0].split("-").map(Number);
  const [ly, lm] = keys.at(-1).split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ year: y, month: m - 1, count: months.get(key) || 0 });
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
