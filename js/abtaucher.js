/* Abtaucher – Spiel-Code (nachgeladen als js/abtaucher.js; Kern mit abtDone/abtDay steht inline in index.html).
   Spielidee: 7 Aufgaben am Tag („Nenne ein Nachbarland von Österreich“). Jede gültige Antwort zählt – je SELTENER sie ist, desto tiefer taucht man:
   Stufe 1 (sehr häufig) 10 m … Stufe 5 (sehr selten) 100 m, ungültig 0 m (2 Versuche je Aufgabe). Kein Zeitdruck; optional „Schnell-Modus“ (45 s je Aufgabe).
   Daten: data/abtaucher.json {items:{key:[de,en,aliases,src,(0=nie als Beispiel)]}, tasks:[{id,c,de,en,a:[keys],t:"Stufen",e,src}], pts:[0,10,25,45,70,100]}
   Seltenheit: Worthäufigkeit in Untertiteln (hermitdave/FrequencyWords, Deutsch und Englisch gemittelt) relativ zu den anderen Antworten derselben Aufgabe;
   Pokémon: Bekanntheit nach Generation. Vollständige Antwortlisten aus world-countries, GeoNames, PokeAPI und amtlichen Listen (Quelle je Aufgabe). */
window.AbtaucherMod = function (api) {
"use strict";
const { $, esc, fmt, save, render, toast, shareOut, canShareOut, award, showCongrats, w2Win, scoreCardHtml, suggestHtml, rbDateFmt, dayIndex, dateOfDay, hash, rng, shufR,
  SFX, SITE_URL, ABS, abtDay, abtSum, matchAnsInfo, endRec, endStatHtml, duBtn, I18N, DU } = api;
const AB = { d: null, mode: "daily", date: null, ex: null, du: null, rv: false, msg: "", msgK: "", help: false, t0: 0, tm: null, byId: null, cats: null, all: null, perm: {} };
const N = 7, FAST_S = 45, MAXM = 700;
const SLOTS = ["land", "nachbar", "pokemon", "land", "nachbar", "pokemon", "land"];   // „land“ enthält auch die Hauptstadt-Aufgaben
const TIER = ["", "sehr häufig", "häufig", "mittel", "selten", "sehr selten"];
const TEMO = ["⬜", "🟨", "🟩", "🟦", "🟪", "🐙"];
const ZONES = [[600, "Tiefseegraben", "🦑"], [450, "Mitternachtszone", "🐡"], [300, "Dämmerzone", "🪼"], [150, "Sonnenlichtzone", "🐠"], [0, "Korallenriff", "🐚"]];
const zone = m => ZONES.find(z => m >= z[0]);
const L = () => (I18N.lang === "de" ? "de" : "en");   // Aufgaben und Antworten: Deutsch oder Englisch (andere Sprachen: Englisch)
const nm = k => { const it = AB.d.items[k]; return it ? (L() === "de" ? it[0] : it[1]) : ""; };
const tq = T => (L() === "de" ? T.de : T.en);

function load() {
  if (AB.d) return Promise.resolve(AB.d);
  if (window.__ABT) { AB.d = window.__ABT; prep(); return Promise.resolve(AB.d); }
  return fetch("data/abtaucher.json").then(r => { if (!r.ok) throw new Error("http " + r.status); return r.json(); }).then(d => { AB.d = d; prep(); return d; });
}
function prep() {
  const D = AB.d; AB.byId = new Map(D.tasks.map(t => [t.id, t])); AB.cats = {}; AB.all = {};
  for (const c of new Set(SLOTS)) {
    const all = D.tasks.filter(t => (t.c === "stadt" ? "land" : t.c) === c), es = all.map(t => t.e).sort((a, b) => a - b), cut = es[Math.floor(es.length * (c === "nachbar" ? .5 : .3))] || 0;
    AB.all[c] = all.map(t => t.id); AB.cats[c] = all.filter(t => t.e >= cut).map(t => t.id);   // Tagesrätsel: die bekannteren 70 % (Nachbarländer: 50 %) – kindgerecht; Endlos/Duell: alle
  }
}
// Tagesauswahl: je Kategorie eine feste gemischte Reihenfolge, die ohne Wiederholung durchläuft (Länder/Hauptstädte ≈ 9 Tage, Nachbarländer ≈ 26, Pokémon ≈ 23); Reihenfolge der 7 Plätze je Tag gemischt
function pickDay(date) {
  const d = dayIndex(date), cnt = {}, out = [];
  SLOTS.forEach(c => { const P = AB.cats[c], j = cnt[c] = (cnt[c] || 0) + 1, per = SLOTS.filter(x => x === c).length, idx = d * per + j - 1;
    const perm = AB.perm[c] || (AB.perm[c] = shufR(P, rng(hash("abt:" + c)))); out.push(perm[((idx % P.length) + P.length) % P.length]); });
  return shufR(out, rng(hash("abt:o:" + date)));
}
function pickSeed(key) {
  const r = rng(hash(key)), out = [];
  SLOTS.forEach(c => { const P = AB.all[c].filter(id => !out.includes(id)); out.push(P[Math.floor(r() * P.length)]); });
  return shufR(out, r);
}
const arch = date => { const A = ABS().arch || (ABS().arch = {}); return A[date] || (A[date] = { s: [], r: [], done: false }); };
function st() {
  let S;
  if (AB.mode === "duel") S = AB.du; else if (AB.mode === "endless") S = AB.ex; else if (AB.mode === "archive") S = AB.date ? arch(AB.date) : null; else S = abtDay();
  if (S && !S.q && AB.mode === "daily") S.q = pickDay(api.today());
  if (S && !S.q && AB.mode === "archive") S.q = pickDay(AB.date);
  return S;
}
const task = S => AB.byId.get(S.q[S.s.length - (AB.rv ? 1 : 0)]);
const cands = T => T.a.map((k, j) => { const it = AB.d.items[k]; return { k, j, name: it[0], en: it[1], aliases: it[2] || [] }; });
const namesOf = c => [c.name, c.en, ...c.aliases];
let ALLC = null;
function anyItem(input) { ALLC = ALLC || Object.keys(AB.d.items).map(k => { const it = AB.d.items[k]; return { k, name: it[0], en: it[1], aliases: it[2] || [] }; }); return matchAnsInfo(input, ALLC, namesOf).c; }
// Seltenste Antworten (für „Seltenste Antworten wären gewesen …“): höchste Stufe zuerst, nur gut bekannte Staaten/Einträge, je Aufgabe fest
function rareEx(T, skip, n = 3) {
  return T.a.map((k, j) => ({ k, t: +T.t[j], h: hash(T.id + ":" + k) })).filter(x => x.k !== skip && !(AB.d.items[x.k][4] === 0)).sort((a, b) => b.t - a.t || a.h - b.h).slice(0, n);
}
const topAns = T => T.a.map((k, j) => ({ k, t: +T.t[j], h: hash("top:" + k) })).sort((a, b) => a.t - b.t || a.h - b.h)[0];

// ---------- Eingabe ----------
function submit(input) {
  const S = st(); if (!S || S.done || AB.rv) return;
  input = String(input || "").trim().slice(0, 80); if (!input) { AB.msg = "Schreib zuerst eine Antwort."; AB.msgK = "bad"; return render(false); }
  const T = task(S), r = matchAnsInfo(input, cands(T), namesOf);
  if (r.c) return finish(S, T, { i: input, k: r.c.k, t: +T.t[r.c.j] });
  if (r.how === "amb") { AB.msg = "Das passt auf mehrere Antworten – schreib den Namen genauer."; AB.msgK = "part"; return render(false); }
  S.w = (S.w || 0) + 1; const other = anyItem(input);
  if (S.w >= 2) return finish(S, T, { i: input, k: null, t: 0 });
  AB.msg = other ? "Gibt es – passt aber nicht zu dieser Aufgabe. Noch ein Versuch!" : "Diese Antwort kenne ich nicht. Noch ein Versuch!"; AB.msgK = "bad"; SFX.wrong(); save(); render(false);
}
function finish(S, T, res) {
  stopTimer();
  const m = res.k ? AB.d.pts[res.t] : 0; S.s.push(m); S.r.push({ q: T.id, i: res.i || "", k: res.k, t: res.k ? res.t : 0, to: res.to ? 1 : undefined }); S.w = 0;
  if (S.s.length === 1 && AB.mode !== "duel") S.fast = !!ABS().fast;
  if (!S.t0) S.t0 = Date.now();
  AB.rv = true; AB.msg = ""; if (res.k) SFX.right(); else SFX.wrong();
  try { const sn = api.store().seen || (api.store().seen = {}); sn.abtaucher = 1; } catch (e) {}
  if (S.s.length >= N) { S.done = true; S.ms = Date.now() - (S.t0 || Date.now()); onDone(S); }
  save(); render(false);
}
function onDone(S) {
  const tot = abtSum(S.s);
  if (AB.mode === "daily") { try { award("daily", { tries: Math.max(1, Math.min(8, Math.round((MAXM - tot) / 90) + 1)) }); } catch (e) {} if (tot >= 250) { try { w2Win(); showCongrats("wordle", { word: "TIEFE", sub: `${tot} m Tiefe` }); } catch (e) {} } }
  if (AB.mode === "endless") { try { endRec("abtaucher", { pts: tot, max: MAXM }); award("endless", { g: "abtaucher" }); } catch (e) {} }
  if (AB.mode === "duel" || AB.mode === "archive") { /* zählt nicht für Serie/Tagesziel */ }
}
// Schnell-Modus: gemütlicher Countdown je Aufgabe; abgelaufen = 0 m. Läuft nur, solange Abtaucher sichtbar ist.
function stopTimer() { if (AB.tm) { clearInterval(AB.tm); AB.tm = null; } }
const fastOn = S => AB.mode === "duel" ? false : (S && S.s.length ? !!S.fast : !!ABS().fast);
function startTimer() {
  stopTimer(); const S = st(); if (!S || S.done || AB.rv || !fastOn(S)) { AB.t0 = 0; return; }
  if (!AB.t0) AB.t0 = Date.now();
  AB.tm = setInterval(() => {
    const el = $("#abtt"); if (api.view() !== "abtaucher" || !el) { stopTimer(); AB.t0 = 0; return; }
    const left = Math.max(0, FAST_S - Math.floor((Date.now() - AB.t0) / 1000)); el.textContent = left + " s"; el.classList.toggle("low", left <= 10);
    if (left <= 0) { AB.t0 = 0; const S2 = st(); if (S2 && !S2.done && !AB.rv) finish(S2, task(S2), { k: null, to: 1 }); }
  }, 250);
}

// ---------- Darstellung ----------
const seg = () => `<div class="abt-seg" role="group" aria-label="Spielart">${[["daily", "Heute"], ["endless", "Endlos"], ["archive", "Archiv"], ["duel", "1 vs 1"]].map(([k, l]) => `<button type="button" data-abm="${k}" aria-pressed="${AB.mode === k || (k === "archive" && AB.mode === "archlist")}">${l}</button>`).join("")}</div>`;
const helpHtml = () => `<div class="abt-help"><p><b>So geht's:</b> Jeden Tag gibt es 7 Aufgaben, zum Beispiel „Nenne ein Nachbarland von Österreich“. Jede richtige Antwort zählt – aber je <b>seltener</b> sie ist, desto <b>tiefer</b> tauchst du.</p>
  <p class="abt-tl">${[1, 2, 3, 4, 5].map(t => `<span class="abt-tier t${t}"><b>${AB.d.pts[t]} m</b><small>${TIER[t]}</small></span>`).join("")}</p>
  <p>Falsche Antwort: noch ein Versuch, danach 0 m. Groß/Klein, Umlaute und kleine Tippfehler sind egal; Deutsch und Englisch zählen beide. Kein Zeitdruck – außer du schaltest den Schnell-Modus (${FAST_S} s je Aufgabe) ein.</p>
  <p class="abt-src">Wie selten eine Antwort ist, schätzen wir aus der Worthäufigkeit in Film-Untertiteln (Deutsch und Englisch) im Vergleich zu den anderen richtigen Antworten derselben Aufgabe; bei Pokémon nach der Generation (ältere kennen mehr Leute).</p></div>`;
function gauge(tot) {
  const p = Math.min(100, tot / MAXM * 100), z = zone(tot);
  return `<div class="abt-gauge" aria-label="Tiefe ${tot} Meter"><div class="abt-gbar"><i style="width:${p}%"></i><span class="abt-diver" style="left:${p}%" aria-hidden="true">🤿</span></div>
    <div class="abt-gl"><b><span>${tot}</span> m</b><span>${z[2]} ${z[1]}</span><small>max. <span>${MAXM}</span> m</small></div></div>`;
}
function head() {
  const sub = AB.mode === "duel" ? "1 gegen 1: dieselben 7 Aufgaben – wer tiefer taucht, gewinnt." : AB.mode === "endless" ? "Endlos: neue Aufgaben, so oft du willst – zählt nicht für die Serie." : AB.mode === "archive" ? `Archiv: ${esc(rbDateFmt(AB.date))}` : "Finde richtige Antworten, die kaum jemand nennt – je seltener, desto tiefer.";
  return `<div class="wdhead abt-head"><h2>Abtaucher</h2><p>${sub}</p></div>
    <div class="abt-top">${seg()}<button class="btn abt-q" type="button" data-abt="help" aria-label="Hilfe" aria-expanded="${!!AB.help}">?</button></div>${AB.help ? helpHtml() : ""}`;
}
function fastBtn(S) {
  const on = fastOn(S), lock = AB.mode === "duel" || (S && (S.s.length > 0 || S.done));
  return `<button type="button" class="abt-fast" data-abt="fast" aria-pressed="${on}" ${lock ? "disabled" : ""} title="Schnell-Modus: ${FAST_S} Sekunden je Aufgabe"><span aria-hidden="true">⏱</span> Schnell-Modus ${on ? "an" : "aus"}</button>`;
}
function tierHtml(t) { return `<span class="abt-tier t${t}"><span class="abt-dots" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= t ? "on" : ""}"></i>`).join("")}</span><small>${TIER[t]}</small></span>`; }
function revealHtml(S, T) {
  const r = S.r[S.r.length - 1], ok = !!r.k, last = S.s.length >= N;
  const ex = rareEx(T, r.k), top = topAns(T);
  return `<div class="abt-rev ${ok ? "ok" : "bad"}" aria-live="polite">
    <div class="abt-verdict">${ok ? `<span class="abt-sym" aria-hidden="true">✓</span><b data-noi18n>${esc(nm(r.k))}</b>` : `<span class="abt-sym" aria-hidden="true">✗</span><b>${r.to ? "Zeit abgelaufen" : r.i ? "Leider nicht in der Liste" : "Übersprungen"}</b>`}
      <span class="abt-m">+<span>${S.s[S.s.length - 1]}</span> m</span></div>
    ${ok ? tierHtml(r.t) : ""}
    <p class="abt-ex"><b>Seltenste Antworten wären gewesen:</b> <span data-noi18n>${ex.map(x => esc(nm(x.k))).join(" · ")}</span></p>
    <p class="abt-ex2">Häufigste Antwort: <span data-noi18n>${esc(nm(top.k))}</span> · <span>${T.a.length}</span> richtige Antworten</p>
    <button class="btn primary" type="button" data-abt="next" autofocus>${last ? "Ergebnis" : "Weiter tauchen"}</button></div>`;
}
function playHtml(S) {
  const T = task(S), i = S.s.length - (AB.rv ? 1 : 0), tot = abtSum(S.s);
  const dots = S.q.map((_, j) => { const r = S.r[j]; return `<i class="${j === i ? "cur" : ""} ${r ? "t" + (r.k ? r.t : 0) : ""}"></i>`; }).join("");
  const fast = fastOn(S) && !AB.rv;
  const first = !AB.rv && !((api.store().seen || {}).abtaucher) ? `<p class="w1tip abt-first">So geht's: Schreib eine richtige Antwort – je <b>seltener</b> sie ist, desto tiefer tauchst du (10 bis 100 m). Falsch? Du hast 2 Versuche.</p>` : "";
  return `${first}${gauge(tot)}<div class="abt-bar"><span class="abt-n">Aufgabe <b><span>${i + 1}</span>/<span>${N}</span></b></span><span class="abt-prog" aria-hidden="true">${dots}</span>${AB.mode === "duel" ? "" : fastBtn(S)}${fast ? `<span class="abt-timer" id="abtt" aria-live="off">${Math.max(0, FAST_S - (AB.t0 ? Math.floor((Date.now() - AB.t0) / 1000) : 0))} s</span>` : ""}</div>
    <div class="abt-card"><span class="abt-cat">${({ land: "🌍 Länder & Orte", nachbar: "🧭 Nachbarländer", pokemon: "⚡ Pokémon", stadt: "🏙 Hauptstädte" })[T.c] || ""}</span>
      <h3 class="abt-task" data-noi18n>${esc(tq(T))}</h3>
      ${AB.rv ? revealHtml(S, T) : `<form class="abt-form" data-abtf="go" autocomplete="off"><label class="sr" for="abtin">Deine Antwort</label>
        <input id="abtin" class="qz-in abt-in" type="text" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="80" placeholder="Deine Antwort …">
        <div class="abt-btns"><button class="btn primary" type="submit">🤿 Abtauchen</button><button class="btn" type="button" data-abt="skip">Überspringen</button></div>
        <p class="abt-msg ${AB.msgK}" aria-live="polite">${AB.msg ? esc(AB.msg) : `${S.w ? "Noch <span>1</span> Versuch" : "<span>2</span> Versuche"} · keine Vorschläge – aus dem Kopf!`}</p></form>`}
      <small class="abt-qsrc">Quelle der Antwortliste: <span data-noi18n>${esc(T.src)}</span></small></div>
    ${AB.mode === "duel" ? duelInfo() : ""}`;
}
function blocksHtml(S) {
  return `<ol class="abt-blocks">${S.r.map(r => { const T = AB.byId.get(r.q); return `<li class="t${r.k ? r.t : 0}"><span class="abt-bq" data-noi18n>${esc(T ? tq(T) : "")}</span><b data-noi18n>${r.k ? esc(nm(r.k)) : "–"}</b><span class="abt-bm"><span>${r.k ? AB.d.pts[r.t] : 0}</span> m</span></li>`; }).join("")}</ol>`;
}
function endHtml(S) {
  const tot = abtSum(S.s), z = zone(tot), daily = AB.mode === "daily";
  const btn = (a, l, p) => `<button class="btn${p ? " primary" : ""}" type="button" ${a}>${l}</button>`;
  const bar = daily ? `${btn('data-abt="share"', `<i class="w2i" style="--i:var(--w2-share2)" aria-hidden="true"></i>${canShareOut() ? "Ergebnis teilen" : "Ergebnis kopieren"}`, 1)}${btn('data-w2img="abt"', '<i class="w2i" style="--i:var(--w2-export)" aria-hidden="true"></i>Als Bild')}${btn('data-abm="endless" data-new="1"', "Endlos")}${btn('data-abm="archive"', "Archiv")}`
    : AB.mode === "endless" ? `${btn('data-abm="endless" data-new="1"', "Nochmal endlos", 1)}${btn('data-abm="daily"', "Tagesrätsel")}`
    : `${btn('data-abm="archive"', "Anderer Tag", 1)}${btn('data-abm="endless" data-new="1"', "Endlos")}${btn('data-abm="daily"', "Tagesrätsel")}`;
  return `${gauge(tot)}<div class="wdend abt-end"><div>${daily ? "Dein Tauchgang heute" : AB.mode === "endless" ? "Endlos-Runde" : AB.mode === "duel" ? "Deine Duell-Runde" : `Archiv: ${esc(rbDateFmt(AB.date))}`}</div>
    <b class="w abt-tot"><span>${tot}</span> m <small>/ <span>${MAXM}</span></small></b><div class="abt-zone">${z[2]} ${z[1]}${S.fast ? ` · <span aria-label="Schnell-Modus">⏱</span>` : ""}</div>
    <div class="abt-emo" aria-hidden="true">${S.r.map(r => TEMO[r.k ? r.t : 0]).join("")}</div>${blocksHtml(S)}
    ${AB.mode === "duel" ? duelInfo() : `<div class="wdbar">${bar}${duBtn("abtaucher", "std")}</div>`}
    ${daily ? scoreCardHtml(ABS().days, "Neue Aufgaben in") : AB.mode === "endless" ? endStatHtml("abtaucher", "pts") : AB.mode === "archive" ? `<small class="rb-cd">Archiv zählt nicht für die Serie</small>` : ""}
    ${daily ? suggestHtml(3, "abtaucher") : ""}</div>`;
}
function archHtml() {
  const rows = []; for (let k = 1; k <= 30; k++) { const d = dayIndex(api.today()) - k; if (d < 0) break; const date = dateOfDay(d), A = (ABS().arch || {})[date], done = A && A.done;
    rows.push(`<button type="button" class="rb-arow abt-arow" data-abt="arch" data-date="${date}"><span>${esc(rbDateFmt(date))}</span><small class="${done ? "ok" : ""}">${done ? `<span>${abtSum(A.s)}</span> m` : A && A.s.length ? `<span>${A.s.length}</span> / ${N} gespielt` : "offen"}</small></button>`); }
  return `<div class="rb-arch abt-arch">${rows.join("") || `<span class="rb-ex">Noch kein Archiv – komm morgen wieder.</span>`}</div>`;
}
function duelInfo() {
  const live = DU && DU.cur;
  return `<div class="abt-duel"><p>${live ? "Duell läuft – dein Freund sieht nur deinen Punktestand, nicht deine Antworten." : "Fordere einen Freund heraus: Ihr bekommt dieselben 7 Aufgaben und taucht gleichzeitig. Mehr Meter gewinnt, bei Gleichstand die kürzere Zeit."}</p>${live ? "" : duBtn("abtaucher", "std", "Freund einladen (1 vs 1)")}</div>`;
}
function renderView() {
  const box = $("#abtaucher"); if (!box) return;
  if (api.homeFlag(true) && AB.mode !== "duel") { AB.mode = "daily"; AB.rv = false; }
  stopTimer();
  if (AB.mode === "archlist") { box.innerHTML = head() + archHtml(); return; }
  if (AB.mode === "duel" && !AB.du) { box.innerHTML = head() + `<div class="wdend">${duelInfo()}</div>`; return; }
  if (AB.mode === "endless" && !AB.ex) AB.ex = { q: pickSeed("abt:end:" + Date.now() + ":" + Math.random()), s: [], r: [], done: false };
  const S = st(); if (!S) { AB.mode = "daily"; return renderView(); }
  if (S.done && !AB.rv) { box.innerHTML = head() + endHtml(S); return; }
  box.innerHTML = head() + playHtml(S);
  const inp = $("#abtin"); if (inp) { try { if (!matchMedia("(pointer:coarse)").matches) inp.focus({ preventScroll: true }); } catch (e) {} }
  else { const nb = box.querySelector('[data-abt="next"]'); if (nb) try { nb.focus({ preventScroll: true }); } catch (e) {} }
  if (!AB.rv && fastOn(S)) startTimer(); else AB.t0 = 0;
}
function shareText() {
  const S = abtDay(), tot = abtSum(S.s), z = zone(tot);
  return `Super Daily Games · Abtaucher #${api.day() + 1}\n🤿 ${tot} m · ${z[1]}${S.fast ? " ⏱" : ""}\n${S.r.map(r => TEMO[r.k ? r.t : 0]).join("")}\n${SITE_URL}#spiel=abtaucher`;
}
// ---------- Klicks ----------
document.addEventListener("submit", e => { const f = e.target.closest('[data-abtf="go"]'); if (!f) return; e.preventDefault(); submit(($("#abtin") || {}).value); });
document.addEventListener("click", e => {
  const m = e.target.closest("[data-abm]");
  if (m && $("#abtaucher") && $("#abtaucher").contains(m)) {
    if (DU && DU.cur && AB.mode === "duel") return toast("Erst das Duell beenden");
    const k = m.dataset.abm; AB.rv = false; AB.msg = ""; AB.help = false;
    if (k === "endless") { if (m.dataset.new || !AB.ex || AB.ex.done) AB.ex = null; AB.mode = "endless"; }
    else if (k === "archive") AB.mode = "archlist"; else AB.mode = k;
    return render(false);
  }
  const t = e.target.closest("[data-abt]"); if (!t || t.dataset.abt === "home") return;
  const a = t.dataset.abt, S = st();
  if (a === "help") { AB.help = !AB.help; return render(false); }
  if (a === "fast") { if (S && S.s.length) return; ABS().fast = !ABS().fast; AB.t0 = 0; save(); return render(false); }
  if (a === "skip") { if (S && !S.done && !AB.rv) finish(S, task(S), { k: null }); return; }
  if (a === "next") { AB.rv = false; AB.t0 = 0; render(false); try { window.scrollTo({ top: 0 }); } catch (x) {} return; }
  if (a === "share") return shareOut(shareText(), "Ergebnis kopiert");
  if (a === "arch") { AB.mode = "archive"; AB.date = t.dataset.date; AB.rv = false; return render(false); }
});
// ---------- Duell 1 vs 1 (gemeinsamer Kern: duelRegister in der Seite) ----------
function duStart(d) { AB.du = { q: pickSeed("abt:du:" + d.seed), s: [], r: [], done: false, du: d.seed, t0: Date.now() }; AB.mode = "duel"; AB.rv = false; AB.msg = ""; api.setView("abtaucher"); render(false); }
const duProg = d => AB.du && AB.du.du === d.seed ? { n: AB.du.s.length, pts: abtSum(AB.du.s), done: !!AB.du.done } : null;
function duGiveUp(d) { if (AB.du && AB.du.du === d.seed && !AB.du.done) { AB.du.done = true; AB.rv = false; stopTimer(); if (api.view() === "abtaucher") render(false); } }
function duShow(d) { if (AB.du && AB.du.du === d.seed) { AB.mode = "duel"; api.setView("abtaucher"); render(false); } }
function duClear() { if (AB.du) { AB.du = null; if (AB.mode === "duel") { AB.mode = "daily"; AB.rv = false; } if (api.view() === "abtaucher") render(false); } }
const M = { load, ready: () => !!AB.d, render: renderView, duStart, duProg, duGiveUp, duShow, duClear, shareText };
window.__abt = { AB, M, st, submit, finish, pickDay, pickSeed, rareEx, shareText, zone, cands, task: () => { const S = st(); return S ? task(S) : null; } };   // für Tests
return M;
};
