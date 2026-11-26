import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChat } from "../assets/js/parser.js";
import { compareChats } from "../assets/js/diff.js";

const NNBSP = " ";

test("same chat in Android and Web formats matches despite 'You' and seconds", () => {
  const android = parseChat(
    [
      `11/23/26, 8:40${NNBSP}PM - David: hola`,
      `11/23/26, 8:41${NNBSP}PM - Luisa: qué tal`,
      `11/23/26, 8:41${NNBSP}PM - Luisa: ok`,
      `11/23/26, 8:41${NNBSP}PM - Luisa: ok`,
      `11/23/26, 8:42${NNBSP}PM - David: esto se borró después`,
    ].join("\n"),
  );
  const web = parseChat(
    [
      "[11/23/26, 8:40:30 PM] You: hola",
      "[11/23/26, 8:41:05 PM] Luisa: qué tal",
      "[11/23/26, 8:41:10 PM] Luisa: ok",
      "[11/23/26, 8:41:12 PM] Luisa: ok",
      "[11/24/26, 9:00:00 AM] You: mensaje nuevo",
    ].join("\n"),
  );

  const result = compareChats(android, web);
  assert.equal(result.common, 4);
  assert.deepEqual(result.onlyInA.map((e) => e.text), ["esto se borró después"]);
  assert.deepEqual(result.onlyInB.map((e) => e.text), ["mensaje nuevo"]);
});

test("a duplicated message only pairs once", () => {
  const a = parseChat("11/23/26, 8:41 PM - Luisa: ok\n11/23/26, 8:41 PM - Luisa: ok");
  const b = parseChat("11/23/26, 8:41 PM - Luisa: ok");
  const result = compareChats(a, b);
  assert.equal(result.common, 1);
  assert.equal(result.onlyInA.length, 1);
  assert.equal(result.onlyInB.length, 0);
});
