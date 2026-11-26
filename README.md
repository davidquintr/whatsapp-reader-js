<div align="center">
  <img src="assets/images/iconreader.png" alt="WhatsApp Reader" width="128">
  <h1>WhatsApp Reader</h1>
  <p>Turn an exported WhatsApp chat into something readable, styled like the app.</p>
</div>

## How to export a chat
Follow the [official WhatsApp guide](https://faq.whatsapp.com/196737011380816/?helpref=uf_share) and choose **Without media**. You get a `.txt` file.

## How to use
Open the site, then choose the `.txt` file or drop it on the page. Tap a participant to see the conversation from their side.
The file is processed entirely in your browser and is never uploaded.

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
Live at [davidquintr.github.io/whatsapp-reader-js](https://davidquintr.github.io/whatsapp-reader-js/).

## Development
It is a static site with no build step and no dependencies.

```sh
npm start   # serves the site at http://localhost:8080 (ES modules need a server)
npm test    # parser tests (Node 18+)
```

- `assets/js/parser.js`: pure parser (no DOM), covered by `tests/parser.test.js`
- `assets/js/app.js`: UI and rendering
- `assets/js/i18n.js`: Spanish and English strings

<div align="center">
  <br>
  <img src="assets/images/davidquint.png" width="96" alt="DavidQuint">
  <p>Made by DavidQuint</p>
</div>

## Changelog

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
