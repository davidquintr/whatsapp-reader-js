import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, findMatches } from "../assets/js/search.js";

test("fold keeps indices aligned with the original text", () => {
  const text = "Canción ÑANDÚ 👍🏽 İstanbul";
  assert.equal(fold(text).length, text.length);
  assert.equal(fold("Canción"), "cancion");
});

test("search ignores accents and case, and respects the author filter", () => {
  const texts = ["Vamos a la canción", "otra CANCION", null, "nada"];
  assert.deepEqual(findMatches(texts, "canción"), [
    { index: 0, start: 11, end: 18 },
    { index: 1, start: 5, end: 12 },
  ]);
  assert.deepEqual(findMatches(texts, "cancion", (i) => i !== 0).map((m) => m.index), [1]);
  assert.deepEqual(findMatches(texts, "   "), []);
});
