/* Rechnix – tägliches Rechen-Rätsel (nachgeladen als js/rechnix.js; Kern rxDone/rxDay inline in index.html).
   Errate eine Rechnung mit 8 Zeichen (z. B. 12+35=47) in 6 Versuchen. Jedes Feld: ✓ richtig, ≈ kommt woanders vor, grau kommt nicht vor.
   Punkt vor Strich, nur ganze Zahlen; die Rechnung des Tages wird aus dem Datum erzeugt (gleich für alle). Keine Daten. */
window.RechnixMod = function (api) {
"use strict";
const { $, save, render, shareOut, canShareOut, award, showCongrats, w2Win, scoreCardHtml, suggestHtml, hash, rng, SFX, SITE_URL, RXS, rxDay, endRec, endStatHtml } = api;
const L = 8, MAX = 6, PTS = [100, 85, 70, 55, 40, 25], KEYS = ["1234567890", "+-*/="];
const RX = { mode: "daily", ex: null, help: false, cur: "", msg: "" };

/* ---------- Rechnen ---------- */
// Linke Seite auswerten: Punkt vor Strich, nur ganze Zahlen, keine führenden Nullen, keine Doppel-Operatoren. null = ungültig
function evalLeft(s) {
  const t = s.match(/\d+|[-+*/]/g); if (!t || t.join("") !== s || !/^\d/.test(t[0]) || !/\d$/.test(t[t.length - 1])) return null;
  for (let i = 0; i < t.length; i++) { const num = /^\d/.test(t[i]); if (num !== (i % 2 === 0)) return null; if (num && t[i].length > 1 && t[i][0] === "0") return null; }
  const st = [+t[0]];
  for (let i = 1; i < t.length; i += 2) {
    const o = t[i], n = +t[i + 1];
    if (o === "*") st.push(st.pop() * n);
    else if (o === "/") { const a = st.pop(); if (n === 0 || a % n) return null; st.push(a / n); }
    else st.push(o === "-" ? -n : n);
  }
  return st.reduce((a, b) => a + b, 0);
}
function valid(g) {
  if (g.length !== L || (g.match(/=/g) || []).length !== 1) return "Die Rechnung braucht genau 8 Zeichen und ein =.";
  const [l, r] = g.split("="); if (!/^(0|[1-9]\d*)$/.test(r)) return "Rechts vom = muss eine Zahl stehen.";
  const v = evalLeft(l); if (v === null) return "Das ist keine gültige Rechnung.";
  return v === +r ? "" : "Die Rechnung stimmt nicht.";
}
function make(seed) {
  const R = rng(hash("rechnix:" + seed)), int = (a, b) => a + Math.floor(R() * (b - a + 1));
  for (let t = 0; t < 5000; t++) {
    const o = "+-*/"[int(0, 3)]; let a, b, c;
    if (o === "+") { a = int(1, 99); b = int(1, 99); c = a + b; } else if (o === "-") { a = int(10, 999); b = int(1, a - 1); c = a - b; }
    else if (o === "*") { a = int(2, 99); b = int(2, 99); c = a * b; } else { b = int(2, 12); c = int(2, 99); a = b * c; }
    const s = `${a}${o}${b}=${c}`; if (s.length === L && !valid(s)) return s;
  }
  return "12+35=47";
}
// Tagesrechnung: fester Vorrat verschiedener Rechnungen, Tag für Tag der Reihe nach (≈ 5 Jahre ohne Wiederholung)
let POOL = null;
function daily(date) {
  if (!POOL) { const seen = new Set(); for (let k = 0; seen.size < 1800 && k < 20000; k++) seen.add(make("pool:" + k)); POOL = [...seen]; }
  const d = Math.round((Date.parse(date + "T00:00:00Z") - Date.UTC(2026, 0, 1)) / 864e5);
  return POOL[((d % POOL.length) + POOL.length) % POOL.length];
}
// Wordle-Auswertung in zwei Durchgängen: 2 = richtig, 1 = kommt vor, 0 = nicht
function score(g, a) {
  const r = new Array(L).fill(0), left = {};
  for (let i = 0; i < L; i++) { if (g[i] === a[i]) r[i] = 2; else left[a[i]] = (left[a[i]] || 0) + 1; }
  for (let i = 0; i < L; i++) if (r[i] !== 2 && left[g[i]]) { r[i] = 1; left[g[i]]--; }
  return r;
}

/* ---------- Spielstand ---------- */
function st() {
  if (RX.mode === "endless") { if (!RX.ex) RX.ex = { a: make("e" + Date.now() + Math.random()), g: [], done: false, won: false }; return RX.ex; }
  const S = rxDay(); if (!S.a) { S.a = daily(api.today()); save(); } return S;
}
function press(k) {
  const S = st(); if (S.done) return;
  if (k === "⌫") RX.cur = RX.cur.slice(0, -1);
  else if (k === "⏎") return submit();
  else if (RX.cur.length < L && /^[0-9+\-*/=]$/.test(k)) RX.cur += k;
  RX.msg = ""; render(false);
}
function submit() {
  const S = st(), g = RX.cur, err = valid(g);
  if (err) { RX.msg = err; SFX.wrong && SFX.wrong(); return render(false); }
  S.g.push(g); RX.cur = ""; RX.msg = "";
  if (g === S.a) { S.done = S.won = true; } else if (S.g.length >= MAX) S.done = true; else SFX.flip && SFX.flip();
  if (S.done) finish(S);
  save(); render(false);
}
function finish(S) {
  if (RX.mode === "daily") { S.s = [S.won ? PTS[S.g.length - 1] : 0]; if (S.won) { try { award("daily", { tries: S.g.length }); } catch (e) {} } }
  else { try { endRec("rechnix", { won: S.won, tries: S.g.length }); } catch (e) {} }
  if (S.won) { try { w2Win(); } catch (e) {} try { showCongrats("rechnix", { word: "RECHNUNG", sub: S.g.length + "/6" }); } catch (e) {} }
}

/* ---------- Ansicht ---------- */
const SYM = ["", "≈", "✓"], CLS = ["no", "in", "ok"];
const seg = () => `<div class="rx-seg" role="group" aria-label="Spielart">${[["daily", "Heute"], ["endless", "Endlos"]].map(([k, l]) => `<button type="button" data-rxm="${k}" aria-pressed="${RX.mode === k}">${l}</button>`).join("")}</div>`;
function rowsHtml(S) {
  const rows = S.g.map(g => { const r = score(g, S.a); return `<div class="rx-row" role="img" aria-label="${g.split("").map((ch, i) => ch + " " + ["grau", "kommt vor", "richtig"][r[i]]).join(", ")}">${g.split("").map((ch, i) => `<span class="rx-t ${CLS[r[i]]}" data-noi18n>${ch}<i>${SYM[r[i]]}</i></span>`).join("")}</div>`; });
  if (!S.done) rows.push(`<div class="rx-row cur" aria-live="polite">${Array.from({ length: L }, (_, i) => `<span class="rx-t${RX.cur[i] ? " f" : ""}" data-noi18n>${RX.cur[i] || ""}</span>`).join("")}</div>`);
  while (rows.length < MAX) rows.push(`<div class="rx-row" aria-hidden="true">${'<span class="rx-t"></span>'.repeat(L)}</div>`);
  return `<div class="rx-grid">${rows.join("")}</div>`;
}
function keysHtml(S) {
  const best = {}; S.g.forEach(g => score(g, S.a).forEach((v, i) => { best[g[i]] = Math.max(best[g[i]] ?? -1, v); }));
  const key = k => `<button type="button" class="rx-k ${best[k] != null ? CLS[best[k]] : ""}" data-rxk="${k}" aria-label="${k}" data-noi18n>${k}</button>`;
  return `<div class="rx-kb">${KEYS.map(r => `<div>${r.split("").map(key).join("")}</div>`).join("")}<div><button type="button" class="rx-k w" data-rxk="⌫" aria-label="Löschen">⌫</button><button type="button" class="rx-k w go" data-rxk="⏎">Prüfen</button></div></div>`;
}
function endHtml(S) {
  const daily = RX.mode === "daily", btn = (a, l, p) => `<button class="btn${p ? " primary" : ""}" type="button" ${a}>${l}</button>`;
  const bar = daily ? `${btn('data-rx="share"', `<i class="w2i" style="--i:var(--w2-share2)" aria-hidden="true"></i>${canShareOut() ? "Ergebnis teilen" : "Ergebnis kopieren"}`, 1)}${btn('data-rxm="endless" data-new="1"', "Endlos weiterspielen")}`
    : `${btn('data-rxm="endless" data-new="1"', "Nächstes Rätsel", 1)}${btn('data-rxm="daily"', "Tagesrätsel")}`;
  return `<div class="rx-end" aria-live="polite"><p class="rx-et">${S.won ? (S.g.length === 1 ? "Auf Anhieb!" : "Gelöst!") : "Diesmal nicht – die Rechnung war:"}</p><p class="rx-ans" data-noi18n>${S.a}</p>
    ${S.won ? `<p class="rx-sub">${`in ${S.g.length} von 6 Versuchen`}${daily ? ` · <b>${PTS[S.g.length - 1]} Punkte</b>` : ""}</p>` : ""}<div class="rx-bar">${bar}</div></div>
    ${rowsHtml(S)}${daily ? scoreCardHtml(RXS().days, "Neue Rechnung in") : endStatHtml("rechnix", "t")}${daily ? suggestHtml(3, "rechnix", "Als Nächstes", true) : ""}`;
}
function helpHtml() {
  return `<div class="rx-help"><p><b>So geht's:</b> Errate die Rechnung des Tages in 6 Versuchen. Sie hat 8 Zeichen, zum Beispiel 12+35=47.</p>
  <p>Jeder Versuch muss selbst eine richtige Rechnung sein. Danach zeigt jedes Feld: ✓ richtig an dieser Stelle, ≈ kommt woanders vor, grau kommt nicht vor.</p>
  <p>Es gilt Punkt vor Strich, und alles bleibt bei ganzen Zahlen. Rechts vom = steht immer nur eine Zahl.</p></div>`;
}
function shareText() {
  const S = rxDay();
  return `Super Daily Games · Rechnix #${api.day() + 1} ${S.won ? S.g.length : "X"}/6\n${S.g.map(g => score(g, S.a).map(v => ["⬛", "🟨", "🟩"][v]).join("")).join("\n")}\n${SITE_URL}#spiel=rechnix`;
}
function renderView() {
  const box = $("#rechnix"); if (!box) return;
  if (api.homeFlag(true)) { RX.mode = "daily"; RX.cur = ""; }
  const S = st();
  const sub = RX.mode === "endless" ? "Endlos: eine Rechnung nach der anderen – zählt nicht für die Serie." : "Errate die Rechnung des Tages – 8 Zeichen, 6 Versuche.";
  box.innerHTML = `<div class="wdhead rx-head"><h2>Rechnix</h2><p>${sub}</p></div>
    <div class="rx-top">${seg()}<button class="btn rx-q" type="button" data-rx="help" aria-label="Hilfe" aria-expanded="${!!RX.help}"><span data-noi18n aria-hidden="true">?</span></button></div>
    ${RX.help ? helpHtml() : ""}<div class="rx-box">${S.done ? endHtml(S) : `${rowsHtml(S)}<p class="rx-msg${RX.msg ? " bad" : ""}" aria-live="polite">${RX.msg || "Tippe eine Rechnung und drücke „Prüfen“."}</p>${keysHtml(S)}`}</div>`;
}
document.addEventListener("click", e => {
  const m = e.target.closest("[data-rxm]");
  if (m && $("#rechnix") && $("#rechnix").contains(m)) { RX.mode = m.dataset.rxm; RX.help = false; RX.cur = ""; RX.msg = ""; if (RX.mode === "endless" && (m.dataset.new || !RX.ex || RX.ex.done)) RX.ex = null; return render(false); }
  const k = e.target.closest("[data-rxk]"); if (k) return press(k.dataset.rxk);
  const t = e.target.closest("[data-rx]"); if (!t || t.dataset.rx === "home") return;
  if (t.dataset.rx === "help") { RX.help = !RX.help; return render(false); }
  if (t.dataset.rx === "share") return shareOut(shareText(), "Ergebnis kopiert");
});
document.addEventListener("keydown", e => {
  if (api.view() !== "rechnix" || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest("input,textarea,select"))) return;
  const k = e.key === "Enter" ? "⏎" : e.key === "Backspace" ? "⌫" : e.key === "x" || e.key === "X" ? "*" : e.key === ":" ? "/" : e.key;
  if (/^[0-9+\-*/=]$/.test(k) || k === "⏎" || k === "⌫") { e.preventDefault(); press(k); }
});
return { load: () => Promise.resolve(true), ready: () => true, render: renderView, _t: { make, daily, valid, evalLeft, score, st, RX } };
};
