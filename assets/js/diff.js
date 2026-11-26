// Compares two exports of the same chat. Pure: no DOM.
//
// Messages are matched by minute + text. The author is left out on purpose:
// web exports say "You"/"Tú" where Android writes the real name, and seconds
// only exist in some formats.

function key(entry) {
  const d = entry.date;
  const minute = d ? Math.floor(d.getTime() / 60e3) : "?";
  const text = entry.attachment ?? entry.text.replace(/\s+/g, " ").trim();
  return `${minute}\u0000${text}`;
}

/**
 * @returns {{onlyInA: object[], onlyInB: object[], common: number}}
 *   onlyInA: in the first export but not the second (deleted later, or cut off).
 *   onlyInB: new in the second export.
 */
export function compareChats(a, b) {
  const messagesA = a.entries.filter((e) => e.type === "message");
  const messagesB = b.entries.filter((e) => e.type === "message");

  // Multiset: identical messages in the same minute ("ok", "ok") must pair up one to one.
  const pending = new Map();
  for (const e of messagesB) {
    const k = key(e);
    if (!pending.has(k)) pending.set(k, []);
    pending.get(k).push(e);
  }

  const onlyInA = [];
  let common = 0;
  for (const e of messagesA) {
    const bucket = pending.get(key(e));
    if (bucket?.length) {
      bucket.shift();
      common++;
    } else {
      onlyInA.push(e);
    }
  }

  const leftover = new Set([...pending.values()].flat());
  const onlyInB = messagesB.filter((e) => leftover.has(e));
  return { onlyInA, onlyInB, common };
}
