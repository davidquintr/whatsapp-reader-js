import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "../assets/js/format.js";

test("plain text is a single token", () => {
  assert.deepEqual(tokenize("hola mundo"), [{ type: "text", value: "hola mundo" }]);
});

test("bold, italic and strike", () => {
  assert.deepEqual(tokenize("es *muy* _bueno_ ~malo~"), [
    { type: "text", value: "es " },
    { type: "bold", children: [{ type: "text", value: "muy" }] },
    { type: "text", value: " " },
    { type: "italic", children: [{ type: "text", value: "bueno" }] },
    { type: "text", value: " " },
    { type: "strike", children: [{ type: "text", value: "malo" }] },
  ]);
});

test("nested formatting", () => {
  assert.deepEqual(tokenize("*_ambos_*"), [
    { type: "bold", children: [{ type: "italic", children: [{ type: "text", value: "ambos" }] }] },
  ]);
});

test("markers inside words or with spaces are not formatting", () => {
  assert.deepEqual(tokenize("2*3*4 y * no * y snake_case_name"), [
    { type: "text", value: "2*3*4 y * no * y snake_case_name" },
  ]);
});

test("code is not formatted inside", () => {
  assert.deepEqual(tokenize("usa `*x*` o ```a\n*b*```"), [
    { type: "text", value: "usa " },
    { type: "code", value: "*x*" },
    { type: "text", value: " o " },
    { type: "block", value: "a\n*b*" },
  ]);
});

test("links keep underscores and drop trailing punctuation", () => {
  assert.deepEqual(tokenize("mira https://x.com/a_b_c."), [
    { type: "text", value: "mira " },
    { type: "link", value: "https://x.com/a_b_c" },
    { type: "text", value: "." },
  ]);
});

test("HTML stays as text", () => {
  assert.deepEqual(tokenize("<img src=x onerror=alert(1)>"), [
    { type: "text", value: "<img src=x onerror=alert(1)>" },
  ]);
});

test("bold after punctuation and before punctuation", () => {
  const t = tokenize("(*sí*), ¿*no*?");
  assert.equal(t.filter((x) => x.type === "bold").length, 2);
});
