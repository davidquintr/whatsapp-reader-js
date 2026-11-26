import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChat } from "../assets/js/parser.js";
import { computeStats } from "../assets/js/stats.js";

const chat = parseChat(
  [
    "1/3/26, 9:00 AM - Ana: Hola 😀 *programar* es genial",
    "1/3/26, 9:10 AM - Beto: programar programar 👍🏽👍🏽",
    "1/3/26, 9:12 AM - Ana: <Media omitted>",
    "1/4/26, 8:00 PM - Beto: otro día, nueva conversación",
    "1/4/26, 8:30 PM - Ana: jajajaja sí",
    "1/5/26, 7:00 AM - Ana: tercer día seguido",
    "1/9/26, 7:00 AM - Beto: después de una pausa",
    "3/2/26, 7:00 AM - Beto: marzo",
  ].join("\n"),
);
const s = computeStats(chat);

test("totals and authors", () => {
  assert.equal(s.total, 8);
  assert.equal(s.media, 1);
  const [ana, beto] = s.authors;
  assert.equal(ana.messages, 4);
  assert.equal(beto.messages, 4);
});

test("conversation starters use a 6h gap", () => {
  const [ana, beto] = s.authors;
  // Ana opens Jan 3 and Jan 5; Beto opens Jan 4, Jan 9 and Mar 2.
  assert.equal(ana.starts, 2);
  assert.equal(beto.starts, 3);
});

test("median reply time per author", () => {
  const [ana, beto] = s.authors;
  assert.equal(beto.medianReply, 10 * 60e3); // replied after 10 min
  assert.equal(ana.medianReply, (2 * 60e3 + 30 * 60e3) / 2); // 2 min and 30 min
});

test("longest streak and active days", () => {
  assert.equal(s.activeDays, 5);
  assert.equal(s.streak.days, 3);
  assert.equal(s.streak.start.getDate(), 3);
  assert.equal(s.streak.end.getDate(), 5);
  assert.equal(s.busiestDay.date.getDate(), 3);
  assert.equal(s.busiestDay.count, 3);
});

test("months include empty ones", () => {
  assert.deepEqual(
    s.months.map((m) => [m.month, m.count]),
    [[0, 7], [1, 0], [2, 1]],
  );
});

test("heatmap uses Monday-first weekdays", () => {
  // Jan 3 2026 is a Saturday -> index 5, 9 AM.
  assert.equal(s.heatmap[5][9], 3);
});

test("top words skip stopwords and laughter; emojis keep skin tones", () => {
  assert.deepEqual(s.topWords[0], { value: "programar", count: 3 });
  assert.ok(!s.topWords.some((w) => w.value.startsWith("jaja")));
  assert.deepEqual(s.topEmojis[0], { value: "👍🏽", count: 2 });
});
