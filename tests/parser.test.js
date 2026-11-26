import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChat } from "../assets/js/parser.js";

const NNBSP = " ";

// Synthetic samples that mirror the real export formats (2026).
const SAMPLES = {
  androidEs: [
    `23/11/26 8:40${NNBSP}p.${NNBSP}m. - Los mensajes y las llamadas están cifrados de extremo a extremo.`,
    `23/11/26 8:40${NNBSP}p.${NNBSP}m. - Ana López: Hola`,
    `23/11/26 8:41${NNBSP}p.${NNBSP}m. - Beto: <Multimedia omitido>`,
    `23/11/26 8:42${NNBSP}p.${NNBSP}m. - Ana López: primera línea`,
    ``,
    `tercera línea`,
    `23/11/26 9:55${NNBSP}p.${NNBSP}m. - Beto: corregido <Se editó este mensaje.>`,
    `26/11/26 4:31${NNBSP}a.${NNBSP}m. - Ana López: buenos días`,
  ].join("\n"),
  androidEn: [
    `11/23/26, 8:40${NNBSP}PM - Messages and calls are end-to-end encrypted.`,
    `11/23/26, 8:40${NNBSP}PM - Ana López: Hola`,
    `11/23/26, 8:41${NNBSP}PM - Beto: <Media omitted>`,
    `11/23/26, 8:42${NNBSP}PM - Ana López: primera línea`,
    ``,
    `tercera línea`,
    `11/23/26, 9:55${NNBSP}PM - Beto: corregido <This message was edited>`,
    `11/26/26, 4:31${NNBSP}AM - Ana López: buenos días`,
  ].join("\n"),
  webEn: [
    `Messages and calls are end-to-end encrypted. No one outside of this chat can read them.`,
    `[11/23/26, 8:40:30 PM] You: Hola`,
    `[11/23/26, 8:41:17 PM] Beto: <sticker omitted>`,
    `[11/23/26, 8:42:00 PM] You: primera línea`,
    ``,
    `tercera línea`,
    `[11/24/26, 12:15:18 PM] - Messages and calls are end-to-end encrypted. Tap to learn more.`,
    `[11/26/26, 4:31:10 AM] You: buenos días`,
  ].join("\n"),
  webEs: [
    `Los mensajes y las llamadas están cifrados de extremo a extremo.`,
    `[11/23/26, 8:40:30 PM] Tú: Hola`,
    `[11/23/26, 8:41:17 PM] Beto: <sticker omitido>`,
    `[11/23/26, 8:42:00 PM] Tú: primera línea`,
    ``,
    `tercera línea`,
    `[11/26/26, 4:31:10 AM] Tú: buenos días`,
  ].join("\r\n"),
};

const messages = (chat) => chat.entries.filter((e) => e.type === "message");
const systems = (chat) => chat.entries.filter((e) => e.type === "system");

for (const [name, content] of Object.entries(SAMPLES)) {
  test(`${name}: dates resolve to 23 Nov 2026 8:40 PM and 26 Nov 4:31 AM`, () => {
    const chat = parseChat(content);
    const msgs = messages(chat);
    const first = msgs[0].date;
    assert.equal(first.getFullYear(), 2026);
    assert.equal(first.getMonth(), 10);
    assert.equal(first.getDate(), 23);
    assert.equal(first.getHours(), 20);
    assert.equal(first.getMinutes(), 40);
    const last = msgs.at(-1).date;
    assert.equal(last.getDate(), 26);
    assert.equal(last.getHours(), 4);
  });

  test(`${name}: multiline messages keep blank lines`, () => {
    const chat = parseChat(content);
    const multi = messages(chat).find((m) => m.text.includes("\n"));
    assert.equal(multi.text, "primera línea\n\ntercera línea");
  });

  test(`${name}: media placeholders are flagged`, () => {
    const chat = parseChat(content);
    assert.equal(messages(chat).filter((m) => m.media).length, 1);
  });

  test(`${name}: encryption notice is a system entry`, () => {
    const chat = parseChat(content);
    assert.ok(systems(chat).length >= 1);
    assert.match(systems(chat)[0].text, /cifrados|encrypted/);
  });
}

test("Android exports keep the real names, web exports flag the exporter", () => {
  assert.deepEqual(parseChat(SAMPLES.androidEs).authors, ["Ana López", "Beto"]);
  assert.equal(parseChat(SAMPLES.androidEs).selfAuthor, null);
  assert.equal(parseChat(SAMPLES.webEn).selfAuthor, "You");
  assert.equal(parseChat(SAMPLES.webEs).selfAuthor, "Tú");
});

test("edited marker is stripped and flagged", () => {
  for (const content of [SAMPLES.androidEs, SAMPLES.androidEn]) {
    const edited = messages(parseChat(content)).find((m) => m.edited);
    assert.equal(edited.text, "corregido");
  }
});

test("web system notice with leading dash loses the dash", () => {
  const notice = systems(parseChat(SAMPLES.webEn))[1];
  assert.ok(notice.text.startsWith("Messages"));
  assert.equal(notice.date.getDate(), 24);
});

test("older formats: 24h Android and iOS with seconds", () => {
  const android24 = parseChat("05/01/2023, 14:05 - Ana: hola\n06/01/2023, 09:00 - Beto: hey");
  assert.equal(android24.dateOrder, "DMY");
  assert.equal(android24.entries[0].date.getHours(), 14);
  assert.equal(android24.entries[0].date.getMonth(), 0);

  const ios = parseChat("[25/12/22, 18:30:00] Ana: feliz navidad\n‎[25/12/22, 18:31:00] Beto: ‎<attached: 00000001-PHOTO.jpg>");
  assert.equal(ios.entries[0].date.getDate(), 25);
  assert.equal(ios.entries[1].kind, "attachment");
  assert.equal(ios.entries[1].attachment, "00000001-PHOTO.jpg");
});

test("old Android Spanish format without narrow spaces", () => {
  const chat = parseChat("10/9/22 10:00 p.m. - Ana: hola\n10/9/22 10:01 p.m. - Beto: qué tal");
  assert.equal(chat.dateOrder, "DMY");
  assert.equal(chat.entries[0].date.getMonth(), 8);
  assert.equal(chat.entries[0].date.getHours(), 22);
});

test("ambiguous dates are ordered so the chat stays chronological", () => {
  const chat = parseChat("1/2/24, 9:00 AM - Ana: a\n1/3/24, 9:00 AM - Ana: b\n2/1/24, 9:00 AM - Ana: c");
  // Day-first would go 1 Feb → 1 Mar → 2 Jan (backwards); month-first is monotonic.
  assert.equal(chat.dateOrder, "MDY");
});

test("continuation lines that look like system text stay in the message", () => {
  const chat = parseChat("11/23/26, 8:40 PM - Ana: I\nleft early\nadded you");
  assert.equal(chat.entries.length, 1);
  assert.equal(chat.entries[0].text, "I\nleft early\nadded you");
});

test("system events with a colon are not mistaken for authors", () => {
  const chat = parseChat(
    '11/23/26, 8:40 PM - Ana: hola\n11/23/26, 8:41 PM - Ana changed the subject to: "Plan: viernes"',
  );
  assert.equal(chat.entries[1].type, "system");
  assert.deepEqual(chat.authors, ["Ana"]);
});

test("HTML in messages is kept as plain text (rendered with textContent)", () => {
  const chat = parseChat("11/23/26, 8:40 PM - Ana: <b><img src=x onerror=alert(1)>");
  assert.equal(chat.entries[0].text, "<b><img src=x onerror=alert(1)>");
});

test("unrecognised files produce no authors", () => {
  const chat = parseChat("just some text\nwithout headers");
  assert.equal(chat.authors.length, 0);
});

test("deleted messages are flagged in both languages", () => {
  const chat = parseChat(
    "11/23/26, 8:40 PM - Ana: This message was deleted\n23/11/26 20:41 - Beto: Se eliminó este mensaje.",
  );
  assert.ok(chat.entries.every((e) => e.deleted));
});

test("Android attachments with caption, and contact cards", () => {
  const chat = parseChat(
    "11/23/26, 8:40 PM - Ana: IMG-20261123-WA0003.jpg (file attached)\nmira esto\n" +
      "23/11/26 20:41 - Beto: Juan Pérez.vcf (archivo adjunto)",
  );
  assert.equal(chat.entries[0].attachment, "IMG-20261123-WA0003.jpg");
  assert.equal(chat.entries[0].text, "mira esto");
  assert.equal(chat.entries[1].kind, "contact");
  assert.equal(chat.entries[1].attachment, "Juan Pérez.vcf");
});

test("locations keep their coordinates", () => {
  const chat = parseChat(
    "11/23/26, 8:40 PM - Ana: location: https://maps.google.com/?q=12.1364,-86.2514\n" +
      "11/23/26, 8:41 PM - Beto: https://maps.google.com/?q=-33.4489,-70.6693",
  );
  assert.deepEqual(chat.entries[0].location, { url: "https://maps.google.com/?q=12.1364,-86.2514", lat: 12.1364, lng: -86.2514 });
  assert.equal(chat.entries[1].kind, "location");
  assert.equal(chat.entries[1].location.lat, -33.4489);
});

test("polls in English and Spanish", () => {
  const en = parseChat(
    "11/23/26, 8:40 PM - Ana: POLL:\nWhere do we eat?\nOPTION: Pizza (2 votes)\nOPTION: Tacos (1 vote)\nOPTION: Sushi (0 votes)",
  );
  assert.equal(en.entries[0].kind, "poll");
  assert.deepEqual(en.entries[0].poll, {
    question: "Where do we eat?",
    options: [
      { label: "Pizza", votes: 2 },
      { label: "Tacos", votes: 1 },
      { label: "Sushi", votes: 0 },
    ],
  });
  const es = parseChat("23/11/26 20:40 - Ana: ENCUESTA:\n¿Dónde comemos?\nOPCIÓN: Pizza (3 votos)\nOPCIÓN: Tacos (1 voto)");
  assert.equal(es.entries[0].poll.options[0].votes, 3);
  assert.equal(es.entries[0].poll.question, "¿Dónde comemos?");
});
