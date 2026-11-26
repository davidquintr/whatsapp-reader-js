// Renders computeStats() output: stat tiles, bar charts, a heatmap and tables.
// Charts are plain HTML/CSS (no library). Every chart has a hover tooltip
// (data-tip) and a table view for keyboard and screen-reader users.

import { t } from "./i18n.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatDuration(ms, lang) {
  if (ms == null) return t(lang, "none");
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  if (ms < 60e3) return t(lang, "seconds", { n: nf.format(Math.round(ms / 1e3)) });
  if (ms < 3600e3) return t(lang, "minutes", { n: nf.format(Math.round(ms / 60e3)) });
  return t(lang, "hours", { n: nf.format(ms / 3600e3) });
}

function panel(title, hint) {
  const section = el("section", "stat-panel");
  section.append(el("h3", "stat-title", title));
  if (hint) section.append(el("p", "stat-hint", hint));
  return section;
}

function tableView(lang, headers, rows) {
  const details = el("details", "table-view");
  details.append(el("summary", null, t(lang, "showTable")));
  const table = el("table");
  const thead = el("thead");
  const tr = el("tr");
  headers.forEach((h) => tr.append(el("th", null, h)));
  thead.append(tr);
  const tbody = el("tbody");
  rows.forEach((cells) => {
    const row = el("tr");
    cells.forEach((c, i) => row.append(el(i ? "td" : "th", null, c)));
    tbody.append(row);
  });
  table.append(thead, tbody);
  details.append(table);
  return details;
}

export function renderStats(container, stats, lang) {
  const nf = new Intl.NumberFormat(lang);
  const pf = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });
  const frag = document.createDocumentFragment();

  // ---- Tiles ----
  const tiles = el("div", "stat-tiles");
  const tile = (label, value, sub) => {
    const box = el("div", "stat-tile");
    box.append(el("span", "stat-label", label), el("strong", "stat-value", value));
    if (sub) box.append(el("span", "stat-sub", sub));
    tiles.append(box);
  };
  tile(t(lang, "statMessages"), nf.format(stats.total),
    stats.first ? `${dateFmt.format(stats.first)} – ${dateFmt.format(stats.last)}` : null);
  tile(t(lang, "statActiveDays"), nf.format(stats.activeDays));
  if (stats.streak) {
    tile(t(lang, "statStreak"), t(lang, "statStreakValue", { n: nf.format(stats.streak.days) }),
      `${dateFmt.format(stats.streak.start)} – ${dateFmt.format(stats.streak.end)}`);
  }
  if (stats.busiestDay) {
    tile(t(lang, "statBusiest"), dateFmt.format(stats.busiestDay.date),
      `${nf.format(stats.busiestDay.count)} ${t(lang, "statMessages").toLowerCase()}`);
  }
  tile(t(lang, "statMedia"), nf.format(stats.media));
  frag.append(tiles);

  // ---- Messages per participant (horizontal bars, one hue) ----
  const authors = [...stats.authors].sort((a, b) => b.messages - a.messages);
  const maxAuthor = Math.max(1, ...authors.map((a) => a.messages));
  const perAuthor = panel(t(lang, "statPerAuthor"));
  const bars = el("div", "hbars");
  for (const a of authors) {
    const share = stats.total ? a.messages / stats.total : 0;
    const row = el("div", "hbar");
    row.tabIndex = 0;
    row.dataset.tip = `${a.name}: ${nf.format(a.messages)} (${pf.format(share)})`;
    const track = el("span", "hbar-track");
    const fill = el("span", "hbar-fill");
    fill.style.setProperty("--v", a.messages / maxAuthor);
    track.append(fill);
    row.append(el("span", "hbar-label", a.name), track, el("span", "hbar-value", nf.format(a.messages)));
    bars.append(row);
  }
  perAuthor.append(bars, tableView(lang, [t(lang, "statAuthor"), t(lang, "statCount"), t(lang, "statShare")],
    authors.map((a) => [a.name, nf.format(a.messages), pf.format(stats.total ? a.messages / stats.total : 0)])));
  frag.append(perAuthor);

  // ---- Messages per month (columns, one hue) ----
  if (stats.months.length > 1) {
    const monthFmt = new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit" });
    const longMonthFmt = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" });
    const maxMonth = Math.max(1, ...stats.months.map((m) => m.count));
    const overTime = panel(t(lang, "statOverTime"));
    const chart = el("div", "columns");
    chart.append(el("span", "axis-max", nf.format(maxMonth)));
    const plot = el("div", "columns-plot");
    const labelEvery = Math.ceil(stats.months.length / 12);
    stats.months.forEach((m, i) => {
      const date = new Date(m.year, m.month, 1);
      const col = el("div", "column");
      col.dataset.tip = `${longMonthFmt.format(date)}: ${nf.format(m.count)}`;
      const bar = el("span", "column-bar");
      bar.style.setProperty("--v", m.count / maxMonth);
      col.append(bar, el("span", "column-label", i % labelEvery === 0 ? monthFmt.format(date) : ""));
      plot.append(col);
    });
    chart.append(plot);
    overTime.append(chart, tableView(lang, [t(lang, "statMonth"), t(lang, "statCount")],
      stats.months.map((m) => [longMonthFmt.format(new Date(m.year, m.month, 1)), nf.format(m.count)])));
    frag.append(overTime);
  }

  // ---- Heatmap: weekday x hour (sequential, one hue) ----
  const weekdayFmt = new Intl.DateTimeFormat(lang, { weekday: "short" });
  const weekdayLong = new Intl.DateTimeFormat(lang, { weekday: "long" });
  // 1 Jan 2024 was a Monday, so day i of the Monday-first heatmap is 1 + i.
  const dayName = (i, fmt) => fmt.format(new Date(2024, 0, 1 + i));
  const maxCell = Math.max(1, ...stats.heatmap.flat());
  const heat = panel(t(lang, "statHeatmap"), t(lang, "statHeatmapHint"));
  const grid = el("div", "heatmap");
  grid.append(el("span"));
  for (let h = 0; h < 24; h++) grid.append(el("span", "heat-hour", h % 3 === 0 ? String(h) : ""));
  stats.heatmap.forEach((hours, d) => {
    grid.append(el("span", "heat-day", dayName(d, weekdayFmt)));
    hours.forEach((count, h) => {
      const cell = el("span", "heat-cell");
      // sqrt keeps quiet hours visible next to a very busy peak.
      cell.style.setProperty("--v", count ? 0.12 + 0.88 * Math.sqrt(count / maxCell) : 0);
      cell.dataset.tip = `${dayName(d, weekdayLong)} ${String(h).padStart(2, "0")}:00 – ${nf.format(count)}`;
      grid.append(cell);
    });
  });
  const legend = el("div", "heat-legend");
  legend.append(el("span", null, "0"), el("span", "heat-scale"), el("span", null, nf.format(maxCell)));
  heat.append(grid, legend, tableView(lang, ["", ...Array.from({ length: 24 }, (_, h) => String(h))],
    stats.heatmap.map((hours, d) => [dayName(d, weekdayLong), ...hours.map((c) => nf.format(c))])));
  frag.append(heat);

  // ---- Who starts / who replies (table) ----
  const who = panel(t(lang, "statWho"));
  const table = el("table", "stat-table");
  const head = el("tr");
  [t(lang, "statAuthor"), t(lang, "statStarts"), t(lang, "statReply")].forEach((h) => head.append(el("th", null, h)));
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  const totalStarts = stats.authors.reduce((s, a) => s + a.starts, 0) || 1;
  for (const a of authors) {
    const tr = el("tr");
    tr.append(el("th", null, a.name), el("td", null, `${nf.format(a.starts)} (${pf.format(a.starts / totalStarts)})`),
      el("td", null, formatDuration(a.medianReply, lang)));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  who.append(table);
  frag.append(who);

  // ---- Top words & emojis ----
  const pair = el("div", "stat-pair");
  if (stats.topWords.length) {
    const words = panel(t(lang, "statWords"));
    const list = el("ol", "rank-list");
    const maxWord = stats.topWords[0].count;
    for (const w of stats.topWords) {
      const li = el("li");
      li.dataset.tip = `${w.value}: ${nf.format(w.count)}`;
      const bar = el("span", "rank-bar");
      bar.style.setProperty("--v", w.count / maxWord);
      li.append(el("span", "rank-label", w.value), el("span", "rank-value", nf.format(w.count)), bar);
      list.append(li);
    }
    words.append(list);
    pair.append(words);
  }
  if (stats.topEmojis.length) {
    const emojis = panel(t(lang, "statEmojis"));
    const list = el("ol", "emoji-list");
    for (const e of stats.topEmojis) {
      const li = el("li");
      li.append(el("span", "emoji", e.value), el("span", "rank-value", nf.format(e.count)));
      list.append(li);
    }
    emojis.append(list);
    pair.append(emojis);
  }
  if (pair.childNodes.length) frag.append(pair);

  container.replaceChildren(frag);
}

/** One shared tooltip for every element with data-tip inside `root`. */
export function attachTooltip(root, tooltip) {
  const show = (target, x, y) => {
    tooltip.textContent = target.dataset.tip;
    tooltip.hidden = false;
    const { width, height } = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - width / 2), window.innerWidth - width - 8);
    const top = y - height - 12 < 8 ? y + 16 : y - height - 12;
    tooltip.style.transform = `translate(${left}px, ${top}px)`;
  };
  root.addEventListener("pointermove", (e) => {
    const target = e.target.closest("[data-tip]");
    if (target && root.contains(target)) show(target, e.clientX, e.clientY);
    else tooltip.hidden = true;
  });
  root.addEventListener("pointerleave", () => (tooltip.hidden = true));
  root.addEventListener("focusin", (e) => {
    const target = e.target.closest("[data-tip]");
    if (!target) return;
    const r = target.getBoundingClientRect();
    show(target, r.left + r.width / 2, r.top);
  });
  root.addEventListener("focusout", () => (tooltip.hidden = true));
}
