# @davidquintr/whatsapp-chat-parser

Parse WhatsApp chat exports (`.txt`) with zero dependencies. It runs in browsers and in Node 18+.
This is the parser behind [WhatsApp Reader](https://davidquintr.github.io/whatsapp-reader-js/).

```js
import { parseChat } from "@davidquintr/whatsapp-chat-parser";
import { computeStats } from "@davidquintr/whatsapp-chat-parser/stats";
import { compareChats } from "@davidquintr/whatsapp-chat-parser/diff";

const chat = parseChat(text);
chat.entries;    // [{ type, date, author, text, kind, edited, attachment, location, poll, ... }]
chat.authors;    // ["Ana", "Beto"]
chat.selfAuthor; // "You" / "Tú" in web exports, null on Android
chat.dateOrder;  // "DMY" | "MDY" | "YMD", detected from the file
```

## Formats

| Source | Example |
| --- | --- |
| WhatsApp Web / Desktop | `[11/23/26, 8:40:30 PM] You: …` |
| iPhone | `[23/11/26, 20:40:30] Name: …` |
| Android (English) | `11/23/26, 8:40 PM - Name: …` (narrow no-break space before `PM`) |
| Android (Spanish) | `23/11/26 8:40 p. m. - Name: …` |
| Older Android, 24h | `23/11/2026, 20:40 - Name: …` |

Day-first or month-first order is inferred from the whole file: from days above 12 if there are any, otherwise from which order keeps the chat chronological.

## Message kinds

`kind` is one of `text`, `media` (`<Media omitted>`), `deleted`, `attachment` (with `attachment` holding the file name), `contact` (`.vcf`), `location` (`{ url, lat, lng }`) or `poll` (`{ question, options: [{ label, votes }] }`). Edited messages have `edited: true`, and the marker is removed from the text.
