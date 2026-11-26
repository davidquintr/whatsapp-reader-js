import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPages, buildSitemap, buildRobots, PAGES, SITE } from "../scripts/build-pages.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const template = read("index.html");
const built = buildPages(template);

test("generated pages are up to date (run `npm run build:pages`)", () => {
  for (const [path, html] of Object.entries(built)) {
    assert.equal(read(path), html, `${path} is stale: run npm run build:pages`);
  }
  assert.equal(read("sitemap.xml"), buildSitemap(), "sitemap.xml is stale: run npm run build:pages");
  assert.equal(read("robots.txt"), buildRobots(), "robots.txt is stale: run npm run build:pages");
});

for (const [lang, page] of Object.entries(PAGES)) {
  const html = built[page.path];

  test(`${lang}: html lang, canonical and og:url point at its own URL`, () => {
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    assert.ok(html.includes(`<link rel="canonical" data-seo="canonical" href="${page.url}"`));
    assert.ok(html.includes(`property="og:url" data-seo="url" content="${page.url}"`));
  });

  test(`${lang}: no empty translatable text or meta content`, () => {
    assert.doesNotMatch(html, /data-i18n="\w+"[^>]*><\//, "empty data-i18n element");
    assert.doesNotMatch(html, /data-i18n-content="\w+"[^>]*content=""/, "empty meta content");
    assert.doesNotMatch(html, /data-seo="[\w-]+"[^>]*(content|href)=""/, "empty data-seo value");
  });

  test(`${lang}: title and description fit search result snippets`, () => {
    const title = /<title[^>]*>([^<]*)<\/title>/.exec(html)[1];
    const description = /<meta name="description"[^>]*content="([^"]*)"/.exec(html)[1];
    assert.ok(title.length >= 30 && title.length <= 60, `title length ${title.length}`);
    assert.ok(description.length >= 120 && description.length <= 160, `description length ${description.length}`);
  });

  test(`${lang}: JSON-LD parses and the FAQ matches the visible questions`, () => {
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1];
    const [app, faq] = JSON.parse(json);
    assert.equal(app["@type"], "WebApplication");
    assert.equal(app.url, page.url);
    const visible = [...html.matchAll(/<summary data-i18n="faq\dq">([^<]*)<\/summary>/g)].map((m) => m[1]);
    // Visible text is HTML-escaped; the JSON is not.
    const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    assert.deepEqual(faq.mainEntity.map((q) => q.name), visible.map(unescape));
  });
}

test("every absolute URL in the pages uses SITE", () => {
  for (const html of Object.values(built)) {
    const own = [...html.matchAll(/https:\/\/[^"\s<]*(?:github\.io|vercel\.app)[^"\s<]*/g)].map((m) => m[0]);
    assert.ok(own.length > 0);
    for (const url of own) assert.ok(url.startsWith(SITE), url);
  }
});

test("hreflang alternates are filled for both languages", () => {
  for (const html of Object.values(built)) {
    assert.ok(html.includes(`hreflang="es" data-seo="alt-es" href="${PAGES.es.url}"`));
    assert.ok(html.includes(`hreflang="en" data-seo="alt-en" href="${PAGES.en.url}"`));
    assert.ok(html.includes(`hreflang="x-default" data-seo="alt-default" href="${PAGES.es.url}"`));
  }
});

test("English page resolves assets from the site root", () => {
  const en = built["en/index.html"];
  assert.ok(en.includes('<base href="../" />'));
  assert.ok(!built["index.html"].includes("<base "));
});
