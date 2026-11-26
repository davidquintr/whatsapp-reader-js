// Export the rendered chat as a self-contained HTML file, or print it to PDF.

/**
 * @param {{chat: HTMLElement, extraCss: string, theme: string, lang: string, title: string, footer: string, fileName: string}} opts
 */
export async function exportHtml({ chat, extraCss, theme, lang, title, footer, fileName }) {
  const css = await fetch("assets/css/styles.css").then((r) => r.text());

  const doc = document.implementation.createHTMLDocument(title);
  doc.documentElement.lang = lang;
  doc.documentElement.dataset.theme = theme;
  const meta = doc.createElement("meta");
  meta.setAttribute("charset", "UTF-8");
  const viewport = doc.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  const style = doc.createElement("style");
  // The page background image lives next to the site, so the export goes without it.
  style.textContent = `${css}\n${extraCss}\n:root{--chat-bg:none}\nbody{display:block}`;
  doc.head.prepend(meta, viewport);
  doc.head.append(style);

  const clone = chat.cloneNode(true);
  clone.removeAttribute("id");
  clone.querySelectorAll(".is-current").forEach((n) => n.classList.remove("is-current"));
  // Media are blob: URLs that only live in this tab: keep the file name instead.
  clone.querySelectorAll(".attachment").forEach((box) => {
    if (box.querySelector(".file-chip, .card")) return;
    const chip = doc.createElement("span");
    chip.className = "file-chip";
    chip.textContent = "📎 " + box.dataset.file;
    box.classList.remove("media-frame", "sticker-frame");
    box.removeAttribute("style");
    box.closest(".bubble")?.classList.remove("has-media", "media-only", "sticker-bubble");
    box.replaceChildren(chip);
  });

  const main = doc.createElement("main");
  const h1 = doc.createElement("h1");
  h1.className = "export-title";
  h1.textContent = title;
  const foot = doc.createElement("p");
  foot.className = "export-foot";
  foot.textContent = footer;
  main.append(h1, doc.importNode(clone, true), foot);
  doc.body.append(main);

  const html = "<!doctype html>\n" + doc.documentElement.outerHTML;
  download(new Blob([html], { type: "text/html" }), fileName);
}

export function printChat() {
  window.print();
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
