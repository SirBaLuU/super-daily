/* Abtaucher – Spiel-Code (nachgeladen als js/abtaucher.js; Kern mit abtDone/abtDay steht inline in index.html).
   Spielidee: 7 Aufgaben am Tag („Nenne ein Nachbarland von Österreich“). Jede gültige Antwort zählt – je SELTENER sie ist, desto tiefer taucht man:
   Stufe 1 (sehr häufig) 10 m … Stufe 5 (sehr selten) 100 m, ungültig 0 m (2 Versuche je Aufgabe). Kein Zeitdruck; optional „Schnell-Modus“ (45 s je Aufgabe).
   Daten: data/abtaucher.json {items:{key:[de,en,aliases,src,(0=nie als Beispiel)]}, tasks:[{id,c,de,en,a:[keys],t:"Stufen",e,src}], pts:[0,10,25,45,70,100]}
   Seltenheit: Worthäufigkeit in Untertiteln (hermitdave/FrequencyWords, Deutsch und Englisch gemittelt) relativ zu den anderen Antworten derselben Aufgabe;
   Pokémon: Bekanntheit nach Generation; Sternbilder: Helligkeitsrang. Vollständige Antwortlisten aus world-countries, GeoNames, PokeAPI, d3-celestial, CLDR und amtlichen Listen (Quelle je Aufgabe in der Hilfe).
   ABT2: Live-Taucher (eigene SVG-Figur) in einer Wassersäule mit 5 Tiefenzonen und gezeichneten Meerestieren, Tagesmischung aus 5 Gruppen, Meter-Angaben mit data-noi18n. */
window.AbtaucherMod = function (api) {
"use strict";
const { $, esc, fmt, save, render, toast, shareOut, canShareOut, award, showCongrats, w2Win, scoreCardHtml, suggestHtml, rbDateFmt, dayIndex, dateOfDay, hash, rng, shufR,
  SFX, SITE_URL, ABS, abtDay, abtSum, matchAnsInfo, endRec, endStatHtml, duBtn, I18N, DU } = api;
const AB = { react: "", lastY: null, lastK: "", goT: 0, d: null, mode: "daily", date: null, ex: null, du: null, rv: false, msg: "", msgK: "", help: false, t0: 0, tm: null, byId: null, cats: null, all: null, perm: {} };
const N = 7, FAST_S = 45, MAXM = 700;
// ABT2: abwechslungsreiche Tagesmischung – 5 Gruppen statt fast nur Geografie (Wissen = Regionen, Weltall, Meere, Sprachen, Sport)
const SLOTS = ["land", "nachbar", "pokemon", "wissen", "stadt", "pokemon", "land"];
const GRP = { land: "land", stadt: "stadt", nachbar: "nachbar", pokemon: "pokemon", region: "wissen", himmel: "wissen", meer: "wissen", sprache: "wissen", sport: "wissen" };
const CUT = { land: .3, nachbar: .5, pokemon: .3 };   // Tagesrätsel: die bekannteren Aufgaben (Wissen/Hauptstädte: alle)
const CATL = { land: ["🌍", "Länder"], nachbar: ["🧭", "Nachbarländer"], stadt: ["🏙", "Hauptstädte"], pokemon: ["⚡", "Pokémon"], region: ["🗺", "Regionen"], himmel: ["🔭", "Weltall"], meer: ["🌊", "Meere"], sprache: ["🗣", "Sprachen"], sport: ["🏅", "Sport"] };
const TIER = ["", "sehr häufig", "häufig", "mittel", "selten", "sehr selten"];
const TEMO = ["⬜", "🟨", "🟩", "🟦", "🟪", "🐙"];
// ABT2: Tiefenzonen (ab … Meter) – jede Zone ist im Wasserbild gleich hoch, die Tiefe wird je Zone linear abgebildet
// ABT2b: Punkte je Seltenheitsstufe (pts, max. 700) und Tiefe je Stufe (DEPTH, Skala bis 1000 m) – deutlich sichtbare Bewegung je Antwort
const DEPTH = [0, 20, 45, 80, 110, 140], MAXD = 1000;
const depthOf = S => ((S && S.r) || []).reduce((a, r) => a + DEPTH[r.k ? r.t : 0], 0);
// Tiefenzonen (ab … Meter)
const ZONES = [[0, "Korallenriff", "🐠"], [120, "Kelpwald", "🌿"], [260, "Dämmerzone", "🪼"], [460, "Tiefsee", "🐡"], [700, "Tiefseegraben", "🐙"]];
const zi = m => { let i = 0; ZONES.forEach((z, j) => { if (m >= z[0]) i = j; }); return i; };
const zone = m => ZONES[zi(m)];
const mU = v => `<span class="abt-u" data-noi18n>${v} m</span>`;   // Meter-Angabe nie übersetzen (sonst „m“ → „Male“)
const rmOn = () => { try { const c = document.documentElement.classList; return c.contains("rm") || (!c.contains("rmoff") && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } };   // Seiten-Einstellung „Bewegung“ geht vor
const L = () => (I18N.lang === "de" ? "de" : "en");   // Aufgaben und Antworten: Deutsch oder Englisch (andere Sprachen: Englisch)
const nm = k => { const it = AB.d.items[k]; return it ? (L() === "de" ? it[0] : it[1]) : ""; };
const tq = T => (L() === "de" ? T.de : T.en);

function load() {
  if (AB.d) return Promise.resolve(AB.d);
  if (window.__ABT) { AB.d = window.__ABT; prep(); return Promise.resolve(AB.d); }
  return fetch("data/abtaucher.json?v=" + (window.__I18NV || 1)).then(r => { if (!r.ok) throw new Error("http " + r.status); return r.json(); }).then(d => { AB.d = d; prep(); return d; });
}
function prep() {
  const D = AB.d; AB.byId = new Map(D.tasks.map(t => [t.id, t])); AB.cats = {}; AB.all = {};
  for (const c of new Set(SLOTS)) {
    const all = D.tasks.filter(t => (GRP[t.c] || "land") === c), es = all.map(t => t.e).sort((a, b) => a - b), cut = CUT[c] ? es[Math.floor(es.length * CUT[c])] || 0 : -1e9;
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
  AB.msg = other ? "Gibt es – passt aber nicht zu dieser Aufgabe. Noch ein Versuch!" : "Diese Antwort kenne ich nicht. Noch ein Versuch!"; AB.msgK = "bad"; AB.react = "oops"; SFX.wrong(); save(); render(false);
}
function finish(S, T, res) {
  stopTimer();
  const m = res.k ? AB.d.pts[res.t] : 0; S.s.push(m); S.r.push({ q: T.id, i: res.i || "", k: res.k, t: res.k ? res.t : 0, to: res.to ? 1 : undefined }); S.w = 0;
  if (S.s.length === 1 && AB.mode !== "duel") S.fast = !!ABS().fast;
  if (!S.t0) S.t0 = Date.now();
  AB.rv = true; AB.msg = ""; AB.react = res.k ? "yay" : "oops"; if (res.k) SFX.right(); else SFX.wrong();
  try { const sn = api.store().seen || (api.store().seen = {}); sn.abtaucher = 1; } catch (e) {}
  if (S.s.length >= N) { S.done = true; S.ms = Date.now() - (S.t0 || Date.now()); onDone(S); }
  save(); render(false);
}
function onDone(S) {
  const tot = abtSum(S.s);
  if (AB.mode === "daily") { try { award("daily", { tries: Math.max(1, Math.min(8, Math.round((MAXM - tot) / 90) + 1)) }); } catch (e) {} if (tot >= 250) { try { w2Win(); showCongrats("wordle", { word: "TIEFE", sub: `${depthOf(S)} Meter Tiefe` }); } catch (e) {} } }
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
    const left = Math.max(0, FAST_S - Math.floor((Date.now() - AB.t0) / 1000)); el.textContent = left; el.style.setProperty("--p", left / FAST_S); el.classList.toggle("low", left <= 10);
    if (left <= 0) { AB.t0 = 0; const S2 = st(); if (S2 && !S2.done && !AB.rv) finish(S2, task(S2), { k: null, to: 1 }); }
  }, 250);
}

// ---------- Darstellung ----------
// ABT2: Live-Taucher – selbst gezeichnete SVG-Figur in einer Wassersäule (5 Tiefenzonen mit eigenen Meerestieren). Alles inline-SVG, keine Fremdgrafik.
const SK = 'stroke="#1f2a44" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const SPRITE = `<svg class="abt-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<radialGradient id="abt-g-glow"><stop offset="0" stop-color="#fff7b0"/><stop offset=".45" stop-color="#ffe066"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>
<symbol id="abt-s-diver" viewBox="0 0 64 64"><g transform="rotate(18 32 32)">
<rect x="13" y="22" width="10" height="22" rx="5" fill="#ffd54a" ${SK}/>
<g class="abt-kick"><path d="M25 44 L23 53 M35 44 L37 53" stroke="#1f2a44" stroke-width="5" stroke-linecap="round"/><path d="M15 52 h11 l-1.5 6 h-9.5z M34 52 h11 l1.5 6 h-11z" fill="#22c55e" ${SK}/></g>
<rect x="20" y="24" width="20" height="22" rx="9" fill="#ff7a45" ${SK}/><path d="M24 33 h12" stroke="#ffd54a" stroke-width="3" stroke-linecap="round"/>
<path d="M38 29 q8 1 10 -5" fill="none" stroke="#1f2a44" stroke-width="4" stroke-linecap="round"/><circle cx="48.5" cy="23.5" r="2.6" fill="#ffd8b0" ${SK}/>
<circle cx="30" cy="15" r="10.5" fill="#ffd8b0" ${SK}/><path d="M20.5 12 q9.5 -9 19 0" fill="#2b3a67"/>
<rect x="22.5" y="9.5" width="16" height="10" rx="5" fill="#bff3ff" ${SK}/><path d="M25 12 l3 -1.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="27.5" cy="14.5" r="1.8" fill="#1f2a44"/><circle cx="33.5" cy="14.5" r="1.8" fill="#1f2a44"/><path d="M27 21.5 q3.3 2.6 6.6 0" fill="none" stroke="#1f2a44" stroke-width="1.6" stroke-linecap="round"/>
<path d="M40 16 v-11 h3" fill="none" stroke="#ffd54a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g></symbol>
<symbol id="abt-s-fish" viewBox="0 0 40 40"><path d="M6 20 L1 13 L1 27 Z" fill="#ff8a3d" ${SK}/><ellipse cx="20" cy="20" rx="15" ry="10" fill="#ff8a3d" ${SK}/><path d="M15 11 q-3 9 0 18 M24 10.5 q-3 9.5 0 19" fill="none" stroke="#fff" stroke-width="3"/><circle cx="29" cy="18" r="2" fill="#1f2a44"/></symbol>
<symbol id="abt-s-coral" viewBox="0 0 40 40"><path d="M20 39 V22 M20 26 q-8 -4 -9 -14 M20 24 q7 -3 9 -13 M14 18 q-6 0 -8 -6 M27 17 q5 1 8 -4" fill="none" stroke="#ff6fa8" stroke-width="5" stroke-linecap="round"/><path d="M8 39 h24" stroke="#f4c27a" stroke-width="4" stroke-linecap="round"/></symbol>
<symbol id="abt-s-star" viewBox="0 0 40 40"><path d="M20 4 l4.5 10 11 1 -8.3 7.3 2.6 10.7 -9.8 -5.6 -9.8 5.6 2.6 -10.7 -8.3 -7.3 11 -1z" fill="#ffb347" ${SK}/><circle cx="17" cy="18" r="1.5" fill="#1f2a44"/><circle cx="23" cy="18" r="1.5" fill="#1f2a44"/></symbol>
<symbol id="abt-s-kelp" viewBox="0 0 20 60"><path d="M10 60 q-7 -8 0 -15 q7 -8 0 -15 q-7 -8 0 -15 q5 -6 2 -14" fill="none" stroke="#2f9e44" stroke-width="5" stroke-linecap="round"/><path d="M10 45 q6 -2 8 -8 M10 30 q-6 -2 -8 -8" fill="none" stroke="#51cf66" stroke-width="3" stroke-linecap="round"/></symbol>
<symbol id="abt-s-turtle" viewBox="0 0 40 40"><path d="M9 27 l-6 5 M31 27 l6 5 M11 14 l-5 -5 M29 14 l5 -5" stroke="#5fbf6a" stroke-width="5" stroke-linecap="round"/><ellipse cx="20" cy="21" rx="12" ry="10" fill="#2f9e6e" ${SK}/><path d="M14 17 h12 M12 23 h16 M20 12 v18" stroke="#9be3b5" stroke-width="2"/><circle cx="20" cy="7" r="5" fill="#5fbf6a" ${SK}/><circle cx="18.3" cy="6" r="1.2" fill="#1f2a44"/><circle cx="21.7" cy="6" r="1.2" fill="#1f2a44"/></symbol>
<symbol id="abt-s-school" viewBox="0 0 40 40"><g fill="#cfe8ff" ${SK}><path d="M4 12 l-3 -3 v6z M4 12 a6 4 0 1 0 12 0 a6 4 0 1 0 -12 0"/><path d="M20 22 l-3 -3 v6z M20 22 a6 4 0 1 0 12 0 a6 4 0 1 0 -12 0"/><path d="M6 32 l-3 -3 v6z M6 32 a6 4 0 1 0 12 0 a6 4 0 1 0 -12 0"/></g></symbol>
<symbol id="abt-s-jelly" viewBox="0 0 40 40"><path d="M6 20 q0 -15 14 -15 q14 0 14 15 q-3.5 3 -7 0 q-3.5 3 -7 0 q-3.5 3 -7 0 q-3.5 3 -7 0z" fill="#f3a6ff" fill-opacity=".9" ${SK}/><path d="M11 23 q-3 7 1 14 M18 23 q3 7 -1 14 M24 23 q-3 7 1 14 M30 23 q3 7 -1 14" fill="none" stroke="#f3a6ff" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="13" r="1.6" fill="#1f2a44"/><circle cx="24" cy="13" r="1.6" fill="#1f2a44"/></symbol>
<symbol id="abt-s-lantern" viewBox="0 0 40 40"><path d="M8 20 L2 14 L2 26 Z" fill="#5865a8" ${SK}/><ellipse cx="21" cy="20" rx="14" ry="8" fill="#5865a8" ${SK}/><circle cx="14" cy="23" r="1.6" fill="#7df9ff"/><circle cx="19" cy="24.5" r="1.6" fill="#7df9ff"/><circle cx="24" cy="24.5" r="1.6" fill="#7df9ff"/><circle cx="29" cy="18" r="2.4" fill="#fff"/><circle cx="29.5" cy="18" r="1.2" fill="#1f2a44"/></symbol>
<symbol id="abt-s-angler" viewBox="0 0 40 40"><circle cx="31" cy="6" r="6" fill="url(#abt-g-glow)"/><path d="M20 13 q4 -10 11 -7" fill="none" stroke="#8b93c9" stroke-width="2"/><circle cx="31" cy="6" r="2.4" fill="#fff3a0"/><path d="M9 24 L2 18 L2 30 Z" fill="#454b80" ${SK}/><circle cx="21" cy="24" r="12" fill="#454b80" ${SK}/><path d="M24 28 q5 -2 9 1 q-5 5 -9 -1z" fill="#1f2a44"/><path d="M26 28.5 l1 2 1 -2 1 2 1 -2" fill="none" stroke="#fff" stroke-width="1.2"/><circle cx="25" cy="20" r="2.6" fill="#fff"/><circle cx="25.6" cy="20" r="1.3" fill="#1f2a44"/></symbol>
<symbol id="abt-s-octo" viewBox="0 0 40 40"><path d="M9 14 q-6 -4 -7 2 q3 3 7 1 M31 14 q6 -4 7 2 q-3 3 -7 1" fill="#ff9ecf" ${SK}/><path d="M8 22 q0 -17 12 -17 q12 0 12 17 q0 6 -3 9 q-1 5 -3 0 q-2 6 -4 0 q-2 6 -4 0 q-2 5 -3 0 q-3 -3 -3 -9z" fill="#ff9ecf" ${SK}/><circle cx="16" cy="18" r="2" fill="#1f2a44"/><circle cx="24" cy="18" r="2" fill="#1f2a44"/><path d="M17.5 23 q2.5 2 5 0" fill="none" stroke="#1f2a44" stroke-width="1.5" stroke-linecap="round"/></symbol>
<symbol id="abt-s-crab" viewBox="0 0 40 40"><path d="M7 26 l-5 4 M7 30 l-4 6 M33 26 l5 4 M33 30 l4 6" stroke="#e8505b" stroke-width="3" stroke-linecap="round"/><path d="M10 18 q-8 -2 -6 -10 q4 2 4 5 M30 18 q8 -2 6 -10 q-4 2 -4 5" fill="#e8505b" ${SK}/><ellipse cx="20" cy="26" rx="12" ry="8" fill="#e8505b" ${SK}/><path d="M16 18 v-4 M24 18 v-4" stroke="#1f2a44" stroke-width="2"/><circle cx="16" cy="13" r="2" fill="#fff" ${SK}/><circle cx="24" cy="13" r="2" fill="#fff" ${SK}/></symbol>
<symbol id="abt-s-rocks" viewBox="0 0 40 40"><path d="M2 39 q2 -14 12 -14 q6 -8 13 -2 q11 0 11 16z" fill="#4b4f7a" ${SK}/><path d="M22 23 q1 -6 -1 -12 M24 12 q2 -2 1 -5" fill="none" stroke="#9aa3d9" stroke-width="2" stroke-linecap="round" opacity=".8"/></symbol>
</defs></svg>`;
// ABT2b: große Meeres-Szene – Himmel + Oberfläche mit eigenem Tauchboot, Wasser wird mit der Tiefe dunkler, Kamera folgt dem Taucher.
// Weltkoordinaten in Metern: top = --sky + Meter × --ppm (Pixel je Meter, im CSS je Bildschirmbreite). Der Taucher bleibt auf Höhe der Oberfläche
// im Bild, die Welt (Tiere, Skala, Licht) verschiebt sich beim Abtauchen nach oben.
const BOAT = `<svg class="abt-boat" viewBox="0 0 120 70" aria-hidden="true" focusable="false"><path d="M58 8 v26" stroke="#1f2a44" stroke-width="3"/><path d="M60 9 l20 6 -20 6z" fill="#2dd4bf" ${SK}/>
<rect x="38" y="24" width="38" height="18" rx="6" fill="#fff8e7" ${SK}/><circle cx="50" cy="33" r="4" fill="#bff3ff" ${SK}/><circle cx="64" cy="33" r="4" fill="#bff3ff" ${SK}/>
<path d="M8 42 h104 q-6 18 -26 20 h-54 q-18 -2 -24 -20z" fill="#ff7a45" ${SK}/><path d="M16 50 h88" stroke="#ffd54a" stroke-width="4"/><path d="M84 42 q10 -14 18 -6" fill="none" stroke="#1f2a44" stroke-width="3" stroke-linecap="round"/></svg>`;
// [Tier, Tiefe in m, links in %, Größe, gespiegelt]
const FAUNA = [["fish", 28, 72, 1, 1], ["school", 55, 88, 1], ["fish", 70, 26, .9], ["coral", 104, 8, 1.4], ["star", 112, 90, 1],
  ["kelp", 205, 5, 2], ["turtle", 170, 80, 1.3], ["school", 238, 22, 1, 1], ["kelp", 235, 93, 1.8],
  ["jelly", 300, 84, 1.2], ["school", 345, 30, .9], ["jelly", 385, 9, .9], ["lantern", 430, 74, 1, 1],
  ["angler", 520, 82, 1.3], ["lantern", 590, 12, 1], ["jelly", 650, 88, .8], ["angler", 690, 24, .9, 1],
  ["octo", 760, 84, 1.3], ["lantern", 860, 14, 1, 1], ["crab", 975, 72, 1], ["rocks", 990, 18, 2.2], ["rocks", 995, 90, 1.7]];
const ZAN = ["fish", "turtle", "jelly", "angler", "octo"];   // Tier im Ergebnis-Moment je Zone
const HEAD = ["", "Oberflächlich", "Gut getaucht", "Tiefe Perle", "Tiefseefund", "Grabenrekord"];
const SAY = ["", "Das nennen fast alle – beim nächsten Mal geht's tiefer.", "Solide! Ein paar Meter gehen noch.", "Schöner Fund – darauf kommt nicht jeder.", "Selten! Hier unten wird es still und dunkel.", "Kaum jemand nennt das – ein echter Schatz aus dem Graben!"];
function world(d) {
  const ticks = []; for (let m = 100; m <= MAXD; m += 100) ticks.push(`<span class="abt-tk" style="--m:${m}" data-noi18n>${m} m</span>`);
  const fauna = FAUNA.map(([s, m, x, k, fl]) => `<svg class="abt-an an-${s}${fl ? " fl" : ""}" style="--m:${m};left:${x}%;--k:${k}" aria-hidden="true" focusable="false"><use href="#abt-s-${s}"/></svg>`).join("");
  return `${SPRITE}<div class="abt-cam" style="--cd:${d}" aria-hidden="true"><div class="abt-skyl"><i class="abt-sun"></i><i class="abt-cloud c1"></i><i class="abt-cloud c2"></i></div>
    <div class="abt-water"><i class="abt-rays"></i><i class="abt-snow"></i></div><svg class="abt-wave" viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M0 10 q25 -9 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V20 H0z"/></svg>
    <span class="abt-boatw">${BOAT}</span>${fauna}<span class="abt-scale">${ticks.join("")}</span></div>`;
}
function diverHtml() {
  return `<span class="abt-dv${AB.react ? " " + AB.react : ""}" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><use href="#abt-s-diver"/></svg><i class="abt-bb"></i><i class="abt-bb"></i><i class="abt-bb"></i></span>`;
}
const seg = () => `<div class="abt-seg" role="group" aria-label="Spielart">${[["daily", "Heute"], ["endless", "Endlos"], ["archive", "Archiv"], ["duel", "1 vs 1"]].map(([k, l]) => `<button type="button" data-abm="${k}" aria-pressed="${AB.mode === k || (k === "archive" && AB.mode === "archlist")}">${l}</button>`).join("")}</div>`;
function helpHtml() {
  const S = AB.mode === "archlist" || (AB.mode === "duel" && !AB.du) ? null : st(), T = S && S.q && !S.done ? task(S) : null;
  return `<div class="abt-help"><p><b>So geht's:</b> Jeden Tag gibt es 7 Aufgaben, zum Beispiel „Nenne ein Nachbarland von Österreich“. Jede richtige Antwort zählt – aber je <b>seltener</b> sie ist, desto mehr Punkte gibt es und desto <b>tiefer</b> taucht dein Taucher.</p>
  <p class="abt-tl">${[1, 2, 3, 4, 5].map(t => `<span class="abt-tier t${t}"><b><span data-noi18n>+${AB.d.pts[t]}</span> Punkte</b><small>${TIER[t]} · ${mU(DEPTH[t])}</small></span>`).join("")}</p>
  <p>Falsche Antwort: noch ein Versuch, danach 0 Punkte. Groß/Klein, Umlaute und kleine Tippfehler sind egal; Deutsch und Englisch zählen beide. Kein Zeitdruck – außer du schaltest den Zeitmodus (${FAST_S} Sekunden je Aufgabe) ein.</p>
  <p>Seltenheit: Wir zählen, wie oft ein Name in Film-Untertiteln (Deutsch und Englisch) vorkommt, und vergleichen ihn mit den anderen richtigen Antworten derselben Aufgabe – bei Pokémon zählt die Generation, bei Sternbildern ihre Helligkeit.</p>
  <p>Tiefenzonen: ${ZONES.map(z => `<span class="abt-zt"><span aria-hidden="true">${z[2]}</span> <span>${z[1]}</span> <span>ab</span> ${mU(z[0])}</span>`).join(" ")}</p>
  ${T ? `<p class="abt-src"><b>Quelle dieser Aufgabe:</b> <span data-noi18n>${esc(T.src)}</span></p>` : ""}
  <p class="abt-src"><b>Alle Quellen:</b> <span data-noi18n>${esc(AB.d.src || "")}</span></p></div>`;
}
function head(S) {
  const sub = AB.mode === "duel" ? "1 gegen 1: dieselben 7 Aufgaben – wer mehr Punkte holt, gewinnt." : AB.mode === "endless" ? "Endlos: neue Aufgaben, so oft du willst – zählt nicht für die Serie." : AB.mode === "archive" ? `Archiv: ${esc(rbDateFmt(AB.date))}` : "Finde richtige Antworten, die kaum jemand nennt – je seltener, desto tiefer.";
  const fb = S && AB.mode !== "duel" && AB.mode !== "archlist" ? fastBtn(S) : "";
  return `<div class="wdhead abt-head"><h2>Abtaucher</h2><p>${sub}</p></div>
    <div class="abt-top">${seg()}${fb}<button class="btn abt-q" type="button" data-abt="help" aria-label="Hilfe und Quellen" aria-expanded="${!!AB.help}"><span data-noi18n aria-hidden="true">?</span></button></div>${AB.help ? helpHtml() : ""}`;
}
function fastBtn(S) {
  const on = fastOn(S), lock = AB.mode === "duel" || (S && (S.s.length > 0 || S.done));
  return `<button type="button" class="abt-fast" data-abt="fast" aria-pressed="${on}" ${lock ? "disabled" : ""} title="Zeitmodus: ${FAST_S} Sekunden je Aufgabe"><span aria-hidden="true">⏱</span> Zeitmodus ${on ? "an" : "aus"}</button>`;
}
function tierHtml(t) { return `<span class="abt-tier t${t}"><span class="abt-dots" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= t ? "on" : ""}"></i>`).join("")}</span><small>${TIER[t]}</small></span>`; }
function hud(S, d, tot, i) {
  const dots = S.q.map((_, j) => { const r = S.r[j]; return `<i class="${j === i ? "cur" : ""} ${r ? "t" + (r.k ? r.t : 0) : ""}"></i>`; }).join("");
  return `<div class="abt-hud"><div class="abt-hbox abt-gl"><span>Tiefe</span><b>${mU(d)}</b><small><span>${zone(d)[1]}</span></small></div>
    <div class="abt-hprog"><span class="abt-prog" aria-hidden="true">${dots}</span><span class="abt-n">Aufgabe <span>${i + 1}</span> von <span>${N}</span></span></div>
    <div class="abt-hbox abt-hpts"><span>Punkte</span><b data-noi18n>${tot}</b></div></div>`;
}
function revealHtml(S, T, d) {
  const r = S.r[S.r.length - 1], ok = !!r.k, last = S.s.length >= N, t = ok ? r.t : 0;
  const ex = rareEx(T, r.k), top = topAns(T), an = ZAN[zi(d)];
  const h = ok ? HEAD[t] : r.to ? "Zeit abgelaufen" : r.i ? "Nicht in der Liste" : "Übersprungen";
  const ans = ok ? nm(r.k) : r.i || "";
  return `<div class="abt-rev ${ok ? "ok" : "bad"} h${t}" aria-live="polite">
    ${ok ? `<svg class="abt-revan" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><use href="#abt-s-${an}"/></svg>` : ""}
    <div class="abt-verdict"><span class="abt-rh">${h}</span>${ans ? `<span class="abt-ans">„<b data-noi18n>${esc(ans)}</b>“</span>` : ""}</div>
    <p class="abt-m"><span data-noi18n>+${S.s[S.s.length - 1]}</span> Punkte · ${mU(DEPTH[t])} tiefer</p>
    <p class="abt-say">${ok ? SAY[t] : "Diesmal bleibt der Taucher, wo er ist."}</p>
    ${ok ? tierHtml(t) : ""}
    <p class="abt-ex"><b>Seltenste Antworten wären gewesen:</b> <span data-noi18n>${ex.map(x => esc(nm(x.k))).join(" · ")}</span></p>
    <p class="abt-ex2">Häufigste Antwort: <span data-noi18n>${esc(nm(top.k))}</span> · <span>${T.a.length}</span> richtige Antworten</p>
    <button class="btn primary abt-next" type="button" data-abt="next" autofocus>${last ? "Zum Ergebnis" : `Weiter abtauchen <span aria-hidden="true">▼</span>`}</button></div>`;
}
function catHtml(T) { const c = CATL[T.c]; return c ? `<span class="abt-cat"><span aria-hidden="true">${c[0]}</span> <span>${c[1]}</span></span>` : ""; }
function playHtml(S) {
  const T = task(S), i = S.s.length - (AB.rv ? 1 : 0), tot = abtSum(S.s), d = depthOf(S);
  const fast = fastOn(S) && !AB.rv, left = Math.max(0, FAST_S - (AB.t0 ? Math.floor((Date.now() - AB.t0) / 1000) : 0));
  const first = !AB.rv && !((api.store().seen || {}).abtaucher) ? `<p class="w1tip abt-first">So geht's: Schreib eine richtige Antwort – je <b>seltener</b> sie ist, desto tiefer taucht dein Taucher. Falsch? Du hast 2 Versuche.</p>` : "";
  const ui = AB.rv ? revealHtml(S, T, d) : `<div class="abt-qbox">${catHtml(T)}<h3 class="abt-task" data-noi18n>${esc(tq(T))}</h3><p class="abt-hint"><span aria-hidden="true">▼</span> Je seltener die Antwort, desto tiefer <span aria-hidden="true">▼</span></p></div>
      <form class="abt-form abt-dock" data-abtf="go" autocomplete="off"><div class="abt-drow">${fast ? `<span class="abt-timer abt-ring" id="abtt" aria-live="off" data-noi18n style="--p:${left / FAST_S}">${left}</span>` : ""}<label class="sr" for="abtin">Deine Antwort</label>
        <input id="abtin" class="qz-in abt-in" type="text" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="80" placeholder="Deine Antwort …">
        <button class="btn primary abt-go" type="submit"><span aria-hidden="true">🤿</span> Abtauchen</button></div>
        <div class="abt-drow2"><p class="abt-msg ${AB.msgK}" aria-live="polite">${AB.msg ? esc(AB.msg) : `${S.w ? "Noch <span>1</span> Versuch" : "<span>2</span> Versuche"} · keine Vorschläge – aus dem Kopf!`}</p><button class="btn abt-skip" type="button" data-abt="skip">Überspringen</button></div></form>`;
  return `${first}<div class="abt-world${AB.rv ? " rv" : ""}" data-d="${d}">${world(d)}${diverHtml()}<span class="abt-you" aria-hidden="true"><span>Du</span></span>${hud(S, d, tot, i)}
    <div class="abt-card abt-ui">${ui}</div></div>${AB.mode === "duel" ? duelInfo() : ""}`;
}
function blocksHtml(S) {
  return `<ol class="abt-blocks">${S.r.map(r => { const T = AB.byId.get(r.q); return `<li class="t${r.k ? r.t : 0}"><span class="abt-bq" data-noi18n>${esc(T ? tq(T) : "")}</span><b data-noi18n>${r.k ? esc(nm(r.k)) : "–"}</b><span class="abt-bm"><span data-noi18n>+${r.k ? AB.d.pts[r.t] : 0}</span> · ${mU(DEPTH[r.k ? r.t : 0])}</span></li>`; }).join("")}</ol>`;
}
function endHtml(S) {
  const tot = abtSum(S.s), d = depthOf(S), z = zone(d), daily = AB.mode === "daily", ok = S.r.filter(r => r.k).length;
  const btn = (a, l, p) => `<button class="btn${p ? " primary" : ""}" type="button" ${a}>${l}</button>`;
  const bar = daily ? `${btn('data-abt="share"', `<i class="w2i" style="--i:var(--w2-share2)" aria-hidden="true"></i>${canShareOut() ? "Ergebnis teilen" : "Ergebnis kopieren"}`, 1)}${btn('data-w2img="abt"', '<i class="w2i" style="--i:var(--w2-export)" aria-hidden="true"></i>Als Bild')}${btn('data-abm="endless" data-new="1"', "Endlos")}${btn('data-abm="archive"', "Archiv")}`
    : AB.mode === "endless" ? `${btn('data-abm="endless" data-new="1"', "Nochmal endlos", 1)}${btn('data-abm="daily"', "Tagesrätsel")}`
    : `${btn('data-abm="archive"', "Anderer Tag", 1)}${btn('data-abm="endless" data-new="1"', "Endlos")}${btn('data-abm="daily"', "Tagesrätsel")}`;
  return `<div class="abt-world end" data-d="${d}">${world(d)}${diverHtml()}<span class="abt-you" aria-hidden="true"><span>Du</span></span>
    <div class="abt-card abt-ui"><div class="abt-endbox"><div class="abt-et">${daily ? "Dein Tauchgang heute" : AB.mode === "endless" ? "Endlos-Runde" : AB.mode === "duel" ? "Deine Duell-Runde" : `Archiv: ${esc(rbDateFmt(AB.date))}`}</div>
      <span class="abt-dl">Erreichte Tiefe</span><b class="abt-depth">${mU(d)}</b>
      <div class="abt-zone"><span aria-hidden="true">${z[2]}</span> <span>${z[1]}</span>${S.fast ? ` · <span aria-label="Zeitmodus">⏱</span>` : ""}</div>
      <b class="w abt-tot"><span data-noi18n>${tot}</span> <small><span data-noi18n>/ ${MAXM}</span> Punkte</small></b>
      <p class="abt-sum2"><span>Richtige Antworten</span>: <b><span>${ok}</span>/<span>${N}</span></b></p>
      <div class="abt-emo" aria-hidden="true">${S.r.map(r => TEMO[r.k ? r.t : 0]).join("")}</div></div></div></div>
    <div class="wdend abt-end">${blocksHtml(S)}
    ${AB.mode === "duel" ? duelInfo() : `<div class="wdbar">${bar}${duBtn("abtaucher", "std")}</div>`}
    ${daily ? scoreCardHtml(ABS().days, "Neue Aufgaben in") : AB.mode === "endless" ? endStatHtml("abtaucher", "pts") : AB.mode === "archive" ? `<small class="rb-cd">Archiv zählt nicht für die Serie</small>` : ""}
    ${daily ? suggestHtml(3, "abtaucher") : ""}</div>`;
}
function archHtml() {
  const rows = []; for (let k = 1; k <= 30; k++) { const d = dayIndex(api.today()) - k; if (d < 0) break; const date = dateOfDay(d), A = (ABS().arch || {})[date], done = A && A.done;
    rows.push(`<button type="button" class="rb-arow abt-arow" data-abt="arch" data-date="${date}"><span>${esc(rbDateFmt(date))}</span><small class="${done ? "ok" : ""}">${done ? mU(depthOf(A)) : A && A.s.length ? `<span>${A.s.length}</span> / ${N} gespielt` : "offen"}</small></button>`); }
  return `<div class="rb-arch abt-arch">${rows.join("") || `<span class="rb-ex">Noch kein Archiv – komm morgen wieder.</span>`}</div>`;
}
function duelInfo() {
  const live = DU && DU.cur;
  return `<div class="abt-duel"><p>${live ? "Duell läuft – dein Freund sieht nur deinen Punktestand, nicht deine Antworten." : "Fordere einen Freund heraus: Ihr bekommt dieselben 7 Aufgaben und taucht gleichzeitig. Mehr Meter gewinnt, bei Gleichstand die kürzere Zeit."}</p>${live ? "" : duBtn("abtaucher", "std", "Freund einladen (1 vs 1)")}</div>`;
}
// ABT2: sichtbares Abtauchen – der Taucher startet an der alten Tiefe und gleitet zur neuen (Luftblasen); reduzierte Bewegung: sofort an der neuen Stelle
function diveAnim(box, S) {
  const w = box.querySelector(".abt-world"), k = AB.mode + ":" + (AB.date || "") + ":" + (S.q || []).join(","); const re = AB.react; AB.react = "";
  if (!w) return;
  const d = +w.dataset.d, cam = w.querySelector(".abt-cam");
  if (AB.lastK === k && AB.lastY != null && AB.lastY < d && !rmOn()) {   // Kamera fährt von der alten zur neuen Tiefe, Taucher sinkt voraus, Luftblasen
    cam.style.transition = "none"; cam.style.setProperty("--cd", AB.lastY); void cam.offsetHeight; cam.style.transition = ""; cam.style.setProperty("--cd", d);
    w.classList.add("go"); clearTimeout(AB.goT); AB.goT = setTimeout(() => w.classList.remove("go"), 2200);
  }
  AB.lastY = d; AB.lastK = k; void re;
}
function renderView() {
  const box = $("#abtaucher"); if (!box) return;
  if (api.homeFlag(true) && AB.mode !== "duel") { AB.mode = "daily"; AB.rv = false; }
  stopTimer();
  if (AB.mode === "archlist") { box.innerHTML = head() + archHtml(); return; }
  if (AB.mode === "duel" && !AB.du) { box.innerHTML = head() + `<div class="wdend">${duelInfo()}</div>`; return; }
  if (AB.mode === "endless" && !AB.ex) AB.ex = { q: pickSeed("abt:end:" + Date.now() + ":" + Math.random()), s: [], r: [], done: false };
  const S = st(); if (!S) { AB.mode = "daily"; return renderView(); }
  if (S.done && !AB.rv) { box.innerHTML = head(S) + endHtml(S); diveAnim(box, S); return; }
  box.innerHTML = head(S) + playHtml(S); diveAnim(box, S);
  const inp = $("#abtin"); if (inp) { try { if (!matchMedia("(pointer:coarse)").matches) inp.focus({ preventScroll: true }); } catch (e) {} }
  else { const nb = box.querySelector('[data-abt="next"]'); if (nb) try { nb.focus({ preventScroll: true }); } catch (e) {} }
  if (!AB.rv && fastOn(S)) startTimer(); else AB.t0 = 0;
}
function shareText() {
  const S = abtDay(), tot = abtSum(S.s), d = depthOf(S), z = zone(d);
  return `Super Daily Games · Abtaucher #${api.day() + 1}\n🤿 ${d} m · ${z[1]} · ${tot}/${MAXM}${S.fast ? " ⏱" : ""}\n${S.r.map(r => TEMO[r.k ? r.t : 0]).join("")}\n${SITE_URL}#spiel=abtaucher`;
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
window.__abt = { AB, M, st, submit, finish, pickDay, pickSeed, rareEx, shareText, zone, zi, depthOf, DEPTH, ZONES, GRP, SLOTS, cands, task: () => { const S = st(); return S ? task(S) : null; } };   // für Tests
return M;
};
