/* Flaggix – Spiel-Code (nachgeladen als js/flaggix.js; nutzt die globalen Funktionen der Seite über api). Kern (fxDone, fxDay, Hooks) steht inline in index.html.
   Täglich eine Flagge hinter 6 Kacheln; jeder Fehlversuch deckt eine Kachel auf und zeigt Entfernung, Richtung und Nähe zum gesuchten Land.
   Daten: data/flaggix.json {c:[{i,de,en,la,lo,k,p}], src} – Mittelpunkte/Kontinente Natural Earth (gemeinfrei), Flaggen flag-icons (MIT), Namen Unicode CLDR (Intl.DisplayNames). */
window.FlaggixMod = function (api) {
"use strict";
const { $, esc, fmt, save, render, toast, shareOut, canShareOut, award, showCongrats, w2Win, scoreCardHtml, suggestHtml, dayIndex, hash, rng, shufR,
  SFX, SITE_URL, FXS, fxDay, matchAnsInfo, endRec, endStatHtml, I18N } = api;
const MAX = 6, TILES = 6, PTS = [100, 85, 70, 55, 40, 25], HINT_AFTER = 2, HINT_COST = 10, EARTH = 20037;   // halber Erdumfang in km = Nähe 0 %
const ARR = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"], DIRW = ["Norden", "Nordosten", "Osten", "Südosten", "Süden", "Südwesten", "Westen", "Nordwesten"];
const FX = { d: null, by: null, pool: [], mode: "daily", ex: null, help: false, msg: "", msgK: "", names: null, nl: "" };

/* ---------- Daten ---------- */
function load() {
  if (FX.d) return Promise.resolve(true);
  return fetch("data/flaggix.json?v=" + (window.__I18NV || 1)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    FX.d = d; FX.by = new Map(d.c.map(c => [c.i, c])); FX.pool = d.c.filter(c => c.p).map(c => c.i).sort(); return true; });
}
const LANG = { de: "de", en: "en", es: "es", bks: "bs", zh: "zh-Hans", ja: "ja" };
const dn = l => { try { return new Intl.DisplayNames([LANG[l] || l], { type: "region" }); } catch (e) { return null; } };
// Name in der Seitensprache (CLDR über den Browser), sonst Deutsch/Englisch aus den Daten
function nm(i) {
  const l = I18N.lang || "de";
  if (FX.nl !== l) { FX.nl = l; FX.names = new Map(); const D = dn(l); FX.d.c.forEach(c => { let n = null; try { n = D && D.of(c.i); } catch (e) {} FX.names.set(c.i, n && n !== c.i ? n : (l === "de" ? c.de : c.en)); }); }
  return FX.names.get(i) || i;
}
const namesOf = c => { const D = dn("de"), E = dn("en"); const s = new Set([nm(c.i), c.de, c.en]); try { s.add(D.of(c.i)); s.add(E.of(c.i)); } catch (e) {} return [...s].filter(Boolean); };

/* ---------- Tagesrätsel: jedes Land einmal pro Durchlauf (162 Tage), feste Reihenfolge je Durchlauf ---------- */
function ansOf(date) {
  const di = dayIndex(date), n = FX.pool.length, cyc = Math.floor(di / n);
  return shufR(FX.pool, rng(hash("flaggix:perm:" + cyc)))[((di % n) + n) % n];
}
const tileOrder = seed => shufR([0, 1, 2, 3, 4, 5], rng(hash("flaggix:tiles:" + seed)));
function st() {
  if (FX.mode === "endless") { if (!FX.ex) newEndless(); return FX.ex; }
  const S = fxDay(); if (!S.a) S.a = ansOf(api.today()); return S;
}
function newEndless() {
  const last = (FXS().endLast || []).slice(-12), r = rng(hash("flaggix:end:" + Date.now()));
  const cand = FX.pool.filter(i => !last.includes(i)); const a = cand[Math.floor(r() * cand.length)];
  FXS().endLast = last.concat(a); FX.ex = { a, g: [], done: false, won: false, hint: false, seed: "e" + Date.now() }; save();
}

/* ---------- Geometrie ---------- */
const rad = x => x * Math.PI / 180;
function km(a, b) { const p1 = rad(a.la), p2 = rad(b.la), dp = p2 - p1, dl = rad(b.lo - a.lo); const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))); }
function dir(a, b) { const p1 = rad(a.la), p2 = rad(b.la), dl = rad(b.lo - a.lo); const t = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)); return ((Math.round(t * 180 / Math.PI / 45) % 8) + 8) % 8; }
const near = d => Math.max(0, Math.min(100, Math.round(100 * (1 - d / EARTH))));
function rowOf(S, i) { const g = FX.by.get(i), a = FX.by.get(S.a); if (i === S.a) return { i, ok: true, km: 0, dir: -1, p: 100 }; const d = km(g, a); return { i, ok: false, km: Math.round(d), dir: dir(g, a), p: near(d) }; }
const ptsOf = S => S.won ? Math.max(0, PTS[S.g.length - 1] - (S.hint ? HINT_COST : 0)) : 0;

/* ---------- Raten ---------- */
function guess(input) {
  const S = st(); if (S.done) return;
  const raw = String(input || "").trim().slice(0, 60); if (!raw) { FX.msg = "Schreib zuerst ein Land."; FX.msgK = "bad"; return render(false); }
  const r = matchAnsInfo(raw, FX.d.c, namesOf);
  if (r.how === "amb") { FX.msg = "Das passt auf mehrere Länder – schreib den Namen genauer."; FX.msgK = "part"; return render(false); }
  if (!r.c) { FX.msg = "Dieses Land kenne ich nicht. Tipp: Wähle aus der Liste."; FX.msgK = "bad"; SFX.wrong(); return render(false); }
  if (S.g.includes(r.c.i)) { FX.msg = "Das hast du schon geraten."; FX.msgK = "part"; return render(false); }
  S.g.push(r.c.i); FX.msg = ""; FX.msgK = "";
  if (r.c.i === S.a) { S.done = true; S.won = true; }
  else { SFX.wrong(); if (S.g.length >= MAX) S.done = true; }
  if (S.done) finish(S); else SFX.flip && SFX.flip();
  save(); render(false); if (S.done) { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }
}
function finish(S) {
  if (FX.mode === "daily") { S.s = [ptsOf(S)]; if (S.won) { try { award("daily", { tries: S.g.length }); } catch (e) {} } }
  else { try { endRec("flaggix", { won: S.won, tries: S.g.length }); } catch (e) {} try { if (S.won) award("endless"); } catch (e) {} }
  if (S.won) { try { w2Win(); } catch (e) {} try { showCongrats("flaggix", { word: "FLAGGE", sub: S.g.length + "/6" }); } catch (e) {} }
}

/* ---------- Ansicht ---------- */
const seg = () => `<div class="fx-seg" role="group" aria-label="Spielart">${[["daily", "Heute"], ["endless", "Endlos"]].map(([k, l]) => `<button type="button" data-fxm="${k}" aria-pressed="${FX.mode === k}">${l}</button>`).join("")}</div>`;
function helpHtml() {
  return `<div class="fx-help"><p><b>So geht's:</b> Jeden Tag ist eine Flagge versteckt. Am Anfang siehst du nur eine von sechs Kacheln. Rate ein Land – jeder Fehlversuch deckt eine weitere Kachel auf.</p>
  <p>Zu jedem Tipp siehst du, wie weit das gesuchte Land entfernt ist, in welche Richtung es liegt und wie nah du dran bist (100 % = getroffen). Gemessen wird zwischen den Ländermitten.</p>
  <p>Du hast 6 Versuche. Nach 2 Fehlversuchen kannst du den Kontinent aufdecken (−10 Punkte).</p>
  <p class="fx-src"><b>Quellen:</b> <span data-noi18n>${esc(FX.d.src || "")}</span></p></div>`;
}
function flagHtml(S, end) {
  const ord = tileOrder(FX.mode === "daily" ? api.today() : S.seed), open = end ? TILES : Math.min(TILES, 1 + S.g.filter(i => i !== S.a).length);
  const shown = new Set(ord.slice(0, open));
  return `<div class="fx-flag${end ? " end" : ""}" role="img" ${end ? `aria-label="${esc(nm(S.a))}" data-noi18n` : 'aria-label="Teilweise verdeckte Flagge"'}>
    <img src="flags/${S.a.toLowerCase()}.svg" alt="" width="480" height="360" decoding="async" draggable="false">
    <div class="fx-tiles" aria-hidden="true">${Array.from({ length: TILES }, (_, i) => `<i class="${shown.has(i) ? "off" : ""}"></i>`).join("")}</div></div>`;
}
function rowsHtml(S) {
  const rows = S.g.map(i => rowOf(S, i));
  const empty = S.done ? 0 : MAX - rows.length;
  return `<ol class="fx-rows" aria-label="Deine Tipps">${rows.length ? `<li class="fx-hd" aria-hidden="true"><span>Land</span><span>km</span><span title="Richtung">↗</span><span>Nähe</span></li>` : ""}${rows.map(r => `<li class="${r.ok ? "ok" : ""}"><b class="fx-n" data-noi18n>${esc(nm(r.i))}</b>
    ${r.ok ? `<span class="fx-hit"><span aria-hidden="true">✓</span> Richtig!</span>` : `<span class="fx-km" data-noi18n>${fmt(r.km)} km</span><span class="fx-dir" title="${DIRW[r.dir]}"><span aria-hidden="true">${ARR[r.dir]}</span><span class="sr">${DIRW[r.dir]}</span></span>
    <span class="fx-p" style="--p:${r.p}%"><span data-noi18n>${r.p} %</span></span>`}</li>`).join("")}${Array.from({ length: empty }, () => `<li class="fx-empty" aria-hidden="true"></li>`).join("")}</ol>`;
}
function hintHtml(S) {
  const wrong = S.g.filter(i => i !== S.a).length, a = FX.by.get(S.a);
  if (S.hint || S.done) return S.hint || S.done ? `<p class="fx-hint"><span aria-hidden="true">🧭</span> Kontinent: <b>${esc(a.k || "–")}</b></p>` : "";
  return wrong >= HINT_AFTER ? `<button class="btn fx-hbtn" type="button" data-fx="hint"><span aria-hidden="true">🧭</span> Kontinent zeigen (−10 Punkte)</button>`
    : `<p class="fx-lock"><span aria-hidden="true">🔒</span> ${HINT_AFTER - wrong === 1 ? "Kontinent-Hinweis nach 1 weiteren Fehlversuch" : `Kontinent-Hinweis nach ${HINT_AFTER - wrong} weiteren Fehlversuchen`}</p>`;
}
function playHtml(S) {
  const left = MAX - S.g.length;
  const opts = FX.d.c.map(c => nm(c.i)).sort((x, y) => x.localeCompare(y)).map(n => `<option value="${esc(n)}"></option>`).join("");
  return `${flagHtml(S, false)}
    <form class="fx-form" data-fxf="go" autocomplete="off"><label class="sr" for="fxin">Land eingeben</label>
      <input id="fxin" class="qz-in fx-in" type="text" list="fxlist" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60" placeholder="Land eingeben …">
      <datalist id="fxlist" data-noi18n>${opts}</datalist>
      <button class="btn primary fx-go" type="submit">Raten</button></form>
    <p class="fx-msg ${FX.msgK}" aria-live="polite">${FX.msg ? esc(FX.msg) : (left === 1 ? "Noch 1 Versuch" : `Noch ${left} Versuche`)}</p>
    ${hintHtml(S)}${rowsHtml(S)}`;
}
function endHtml(S) {
  const daily = FX.mode === "daily", a = FX.by.get(S.a);
  const btn = (x, l, p) => `<button class="btn${p ? " primary" : ""}" type="button" ${x}>${l}</button>`;
  const bar = daily ? `${btn('data-fx="share"', `<i class="w2i" style="--i:var(--w2-share2)" aria-hidden="true"></i>${canShareOut() ? "Ergebnis teilen" : "Ergebnis kopieren"}`, 1)}${btn('data-fxm="endless" data-new="1"', "Endlos weiterspielen")}`
    : `${btn('data-fxm="endless" data-new="1"', "Nächste Flagge", 1)}${btn('data-fxm="daily"', "Tagesrätsel")}`;
  return `<div class="fx-end ${S.won ? "won" : "lost"}" aria-live="polite">
    <p class="fx-et">${S.won ? (S.g.length === 1 ? "Auf Anhieb!" : "Gefunden!") : "Diesmal nicht – das war's:"}</p>
    ${flagHtml(S, true)}
    <h3 class="fx-ans" data-noi18n>${esc(nm(S.a))}</h3><p class="fx-sub">${a.k ? `<span>${esc(a.k)}</span> · ` : ""}<span>${S.won ? `in ${S.g.length} von 6 Versuchen` : "6 Versuche aufgebraucht"}</span>${daily ? ` · <b>${ptsOf(S)} Punkte</b>` : ""}</p>
    <div class="fx-bar">${bar}</div></div>
    ${rowsHtml(S)}
    ${daily ? scoreCardHtml(FXS().days, "Neue Flagge in") : endStatHtml("flaggix", "t")}
    ${daily ? suggestHtml(3, "flaggix", "Als Nächstes", true) : ""}`;
}
function shareText() {
  const S = fxDay(), rows = S.g.map(i => rowOf(S, i));
  const sq = p => "🟦".repeat(Math.round(p / 20)) + "⬜".repeat(5 - Math.round(p / 20));
  return `Super Daily Games · Flaggix #${api.day() + 1} ${S.won ? S.g.length : "X"}/6${S.hint ? " 🧭" : ""}\n${rows.map(r => r.ok ? "🟦🟦🟦🟦🟦 🎉" : `${sq(r.p)} ${ARR[r.dir]}`).join("\n")}\n${SITE_URL}#spiel=flaggix`;
}
function renderView() {
  const box = $("#flaggix"); if (!box) return;
  if (api.homeFlag(true)) FX.mode = "daily";
  const S = st();
  const sub = FX.mode === "endless" ? "Endlos: eine Flagge nach der anderen – zählt nicht für die Serie." : "Welches Land versteckt sich hinter der Flagge? Jeder Fehlversuch deckt mehr auf.";
  box.innerHTML = `<div class="wdhead fx-head"><h2>Flaggix</h2><p>${sub}</p></div>
    <div class="fx-top">${seg()}<button class="btn fx-q" type="button" data-fx="help" aria-label="Hilfe und Quellen" aria-expanded="${!!FX.help}"><span data-noi18n aria-hidden="true">?</span></button></div>
    ${FX.help ? helpHtml() : ""}<div class="fx-card">${S.done ? endHtml(S) : playHtml(S)}</div>`;
  const i = $("#fxin"); if (i && !S.done && FX.focus) { FX.focus = false; try { i.focus({ preventScroll: true }); } catch (e) {} }
}

/* ---------- Klicks ---------- */
document.addEventListener("submit", e => { const f = e.target.closest('[data-fxf="go"]'); if (!f) return; e.preventDefault(); FX.focus = true; guess(($("#fxin") || {}).value); });
document.addEventListener("click", e => {
  const m = e.target.closest("[data-fxm]");
  if (m && $("#flaggix") && $("#flaggix").contains(m)) { FX.mode = m.dataset.fxm; FX.msg = ""; FX.help = false; if (FX.mode === "endless" && (m.dataset.new || !FX.ex || FX.ex.done)) newEndless(); FX.focus = true; return render(false); }
  const t = e.target.closest("[data-fx]"); if (!t || t.dataset.fx === "home") return;
  const a = t.dataset.fx, S = st();
  if (a === "help") { FX.help = !FX.help; return render(false); }
  if (a === "hint") { if (!S.done && !S.hint) { S.hint = true; save(); } return render(false); }
  if (a === "share") return shareOut(shareText(), "Ergebnis kopiert");
});

return { load, ready: () => !!FX.d, render: renderView, _t: { ansOf, km, dir, near, rowOf, ptsOf, nm, guess, st, FX } };
};
