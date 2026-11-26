<div align="center">
  <img src="assets/images/iconreader.png" alt="WhatsApp Reader" width="128">
  <h1>WhatsApp Reader</h1>
  <p>Turn an exported WhatsApp chat into something readable, styled like the app.</p>
</div>

## How to export a chat
Follow the [official WhatsApp guide](https://faq.whatsapp.com/196737011380816/?helpref=uf_share) and choose **Without media**. You get a `.txt` file.

## How to use
Open the site, then choose the `.txt` file (or the `.zip`, if you exported **with media**) or drop it on the page. Tap a participant to see the conversation from their side.
The file is processed entirely in your browser and is never uploaded.

### Features
- **Media**: `.zip` exports show photos, stickers, videos, voice notes and contact cards inside the chat. Files load as you scroll.
- **Statistics**: who writes more, messages per month, a weekday × hour heatmap, longest streak, who starts conversations, median reply time, top words and emojis.
- **Search**: ignores accents and case, can filter by participant, and jumps to any date.
- **WhatsApp formatting**: `*bold*`, `_italic_`, `~strike~`, `` `code` `` and clickable links. Polls, locations and contacts are shown as cards.
- **Compare two exports** of the same chat to find new messages and messages that were deleted.
- **Export** to a self-contained HTML file, or to PDF through the print dialog.
- **Installable app (PWA)**: works offline. On Android, once installed, it appears in the share sheet, so you can send an export straight from WhatsApp.

### Supported formats
The format is detected from the file itself, whatever the interface language is.

| Source | Example header |
| --- | --- |
| WhatsApp Web / Desktop | `[11/23/26, 8:40:30 PM] You: …` |
| iPhone | `[23/11/26, 20:40:30] Name: …` |
| Android (English) | `11/23/26, 8:40 PM - Name: …` |
| Android (Spanish) | `23/11/26 8:40 p. m. - Name: …` |
| Older Android, 24h | `23/11/2026, 20:40 - Name: …` |

It handles multi-line messages, system notices, media placeholders, and edited and deleted messages.

## Preview
Live at [whatsapp-reader-js.vercel.app](https://whatsapp-reader-js.vercel.app/).

## Development
It is a static site with no build step and no dependencies.

```sh
npm start      # serves the site at http://localhost:8080 (ES modules need a server)
npm run build  # bakes the strings from i18n.js into index.html and en/index.html, writes sitemap.xml
npm test       # all tests (Node 18+); fails if the pages are stale, so run the build first
```

Each language has its own indexable URL: `/` (Spanish) and `/en/` (English). `index.html` is both the template and the Spanish page. Edit the text in `assets/js/i18n.js`, not in the HTML, then run `npm run build`.

| File | Role |
| --- | --- |
| `assets/js/parser.js` | Pure parser (no DOM) |
| `assets/js/stats.js`, `diff.js`, `format.js`, `zip.js`, `search.js` | Pure logic, each covered by a file in `tests/` |
| `assets/js/app.js` | Wiring: loading, views, search, comparison |
| `assets/js/render.js`, `statsview.js`, `exporter.js` | DOM rendering |
| `assets/js/i18n.js` | Spanish and English strings |
| `scripts/build-pages.mjs` | Generates the per-language pages, meta tags, JSON-LD and the sitemap |
| `sw.js`, `manifest.webmanifest` | Offline cache and Android share target. Bump `VERSION` in `sw.js` when shell files change |
| `packages/whatsapp-chat-parser` | npm package for the parser (`npm pack` copies the sources in) |

<div align="center">
  <br>
  <img src="assets/images/davidquint.png" width="96" alt="DavidQuint">
  <p>Made by DavidQuint</p>
</div>

## Changelog

### v3.1.0
- SEO: one URL per language with hreflang, crawlable static text, canonical URLs, Open Graph share images, JSON-LD (WebApplication + FAQ) and a sitemap.
- New "how to export", features and FAQ section.
- Chat backgrounds converted to WebP (810 KB → 114 KB).

### v3.0.0
- `.zip` exports with media, statistics, search and jump to date, WhatsApp formatting, and cards for polls, locations and contacts.
- Compare two exports; export to HTML or PDF.
- Installable PWA with offline support and an Android share target.
- The parser is available as an npm package.

### v2.0.0
- New parser that detects the format of modern exports (Web, iPhone, Android EN/ES), including the narrow spaces in `8:40 PM`.
- Day-first or month-first dates are detected from the file, not from the UI language.
- Fixed: HTML in messages could run as code (XSS). Messages are now rendered as plain text.
- Fixed: false and duplicated system notices, wrong "active user" matches, and the "Octuber" typo.
- Much faster on large chats: no per-line logging, a single DOM insert, and off-screen days are skipped.
- Responsive layout with a mobile viewport, light/dark theme and language saved between visits, drag and drop.
- Edited, media and deleted messages are styled. Links can be clicked.

### v1.0.0
- Multiline messages
- POV messages
- Different colors for each user in the conversation
- System notices
- Date shown at the top of the view
