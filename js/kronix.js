/* Kronix – tägliches Logik-Raster (nachgeladen als js/kronix.js; nutzt die globalen Funktionen der Seite über api). Kern (kxDone, kxDay, Hooks) steht inline in index.html.
   Regeln: In jede Zeile, jede Spalte und jedes Farbfeld genau eine Krone; Kronen berühren sich nicht, auch nicht schräg.
   Rätsel werden aus dem Datum erzeugt (gleich für alle) und nur verwendet, wenn sie genau eine Lösung haben. Keine Daten, keine fremden Inhalte. */
window.KronixMod = function (api) {
"use strict";
const { $, esc, save, render, shareOut, canShareOut, award, showCongrats, w2Win, scoreCardHtml, suggestHtml, hash, rng, SFX, SITE_URL, KXS, kxDay, endRec, endStatHtml } = api;
const N = 7, HINT_COST = 15;
// farbenblind-freundliche helle Töne (Okabe-Ito-nah) + Buchstabe je Feld als zweites Merkmal
const COL = ["#f6c177", "#9ccfd8", "#c4a7e7", "#a3d9a5", "#f5a3a3", "#d6c7a1", "#8fb8ff", "#f2b5d4"];
const KX = { mode: "daily", ex: null, help: false, sel: -1, tick: 0 };

/* ---------- Erzeugen und Lösen ---------- */
function solve(reg, n, limit) {   // zählt Lösungen (bis limit); Zeile für Zeile, Spalte/Feld je einmal, keine Nachbarn
  let cnt = 0, sol = null; const sols = [], colU = new Array(n).fill(false), regU = new Array(n).fill(false), pos = [];
  (function rec(r) {
    if (cnt >= limit) return;
    if (r === n) { cnt++; sols.push(pos.slice()); if (!sol) sol = pos.slice(); return; }
    for (let c = 0; c < n; c++) {
      const g = reg[r * n + c]; if (colU[c] || regU[g] || (r > 0 && Math.abs(pos[r - 1] - c) < 2)) continue;
      colU[c] = regU[g] = true; pos[r] = c; rec(r + 1); colU[c] = regU[g] = false; if (cnt >= limit) return;
    }
  })(0);
  return { cnt, sol, sols };
}
// Feld g bleibt zusammenhängend, wenn Zelle x herausgenommen wird?
function linked(reg, n, g, x) {
  const cells = []; for (let i = 0; i < n * n; i++) if (reg[i] === g && i !== x) cells.push(i);
  if (!cells.length) return false; const vis = new Set([cells[0]]), st = [cells[0]];
  while (st.length) { const i = st.pop(), r = Math.floor(i / n), c = i % n; for (const [y, x2] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) { const j = y * n + x2; if (y >= 0 && y < n && x2 >= 0 && x2 < n && j !== x && reg[j] === g && !vis.has(j)) { vis.add(j); st.push(j); } } }
  return vis.size === cells.length;
}
function make(seed, n) {
  const R = rng(hash("kronix:" + seed));
  for (let tries = 0; tries < 400; tries++) {
    // 1) Lösung: je Zeile eine Spalte, keine zwei Kronen benachbart
    const pos = [], used = new Array(n).fill(false);
    const place = r => { if (r === n) return true; const cs = [...Array(n).keys()].sort(() => R() - .5); for (const c of cs) { if (used[c] || (r > 0 && Math.abs(pos[r - 1] - c) < 2)) continue; used[c] = true; pos[r] = c; if (place(r + 1)) return true; used[c] = false; } return false; };
    if (!place(0)) continue;
    // 2) Felder: von jeder Krone aus zufällig wachsen (4er-Nachbarschaft), bis alles vergeben ist
    const reg = new Array(n * n).fill(-1); pos.forEach((c, r) => { reg[r * n + c] = r; });
    let left = n * n - n;
    while (left) {
      const fr = []; for (let i = 0; i < n * n; i++) if (reg[i] < 0) { const r = Math.floor(i / n), c = i % n; [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([y, x]) => { if (y >= 0 && y < n && x >= 0 && x < n && reg[y * n + x] >= 0) fr.push([i, reg[y * n + x]]); }); }
      const [i, g] = fr[Math.floor(R() * fr.length)]; reg[i] = g; left--;
    }
    // 3) nur eindeutige Rätsel: gibt es eine zweite Lösung, wird eine ihrer Kronen-Zellen an ein Nachbarfeld abgegeben
    //    (nie eine Zelle der eigentlichen Lösung, Felder bleiben zusammenhängend) – bis genau eine Lösung bleibt
    const mine = new Set(pos.map((c, r) => r * n + c));
    for (let fix = 0; fix < 120; fix++) {
      const s = solve(reg, n, 2); if (s.cnt === 1) return { n, reg, sol: pos.slice(), tries };
      const alt = s.sols.find(q => q.some((c, r) => c !== pos[r])); if (!alt) break;
      const cand = []; alt.forEach((c, r) => { const x = r * n + c; if (mine.has(x)) return; const g = reg[x];
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([y, x2]) => { if (y >= 0 && y < n && x2 >= 0 && x2 < n && reg[y * n + x2] !== g) cand.push([x, reg[y * n + x2]]); }); });
      const ok = cand.filter(([x]) => linked(reg, n, reg[x], x)); if (!ok.length) break;
      const [x, h] = ok[Math.floor(R() * ok.length)]; reg[x] = h;
    }
  }
  return null;
}

/* ---------- Spielstand ---------- */
function st() {
  if (KX.mode === "endless") { if (!KX.ex) newEndless(); return KX.ex; }
  const S = kxDay(); if (!S.p) { const P = make(api.today(), N); S.p = { reg: P.reg, sol: P.sol }; S.b = new Array(N * N).fill(0); save(); } return S;
}
function newEndless() { const P = make("e" + Date.now() + Math.random(), N); KX.ex = { p: { reg: P.reg, sol: P.sol }, b: new Array(N * N).fill(0), done: false, hints: 0, t0: 0, t: 0 }; }
// Verstöße: Kronen doppelt in Zeile/Spalte/Feld oder benachbart
function bad(S) {
  const n = N, B = S.b, reg = S.p.reg, Q = []; for (let i = 0; i < n * n; i++) if (B[i] === 2) Q.push(i);
  const out = new Set();
  for (let a = 0; a < Q.length; a++) for (let b = a + 1; b < Q.length; b++) {
    const i = Q[a], j = Q[b], ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n;
    if (ri === rj || ci === cj || reg[i] === reg[j] || (Math.abs(ri - rj) < 2 && Math.abs(ci - cj) < 2)) { out.add(i); out.add(j); }
  }
  return out;
}
const crowns = S => S.b.filter(v => v === 2).length;
const secs = S => Math.max(0, Math.round(((S.done ? S.t : Date.now()) - (S.t0 || Date.now())) / 1000));
const fmtT = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const ptsOf = S => Math.max(10, 100 - Math.floor(secs(S) / 6) - HINT_COST * (S.hints || 0));

/* ---------- Züge ---------- */
function tap(i, v) {
  const S = st(); if (S.done || i < 0 || i >= N * N) return;
  if (!S.t0) S.t0 = Date.now();
  S.b[i] = v != null ? v : (S.b[i] + 1) % 3;   // leer → ✕ → Krone → leer
  if (S.b[i] === 2) SFX.click && SFX.click();
  if (crowns(S) === N && !bad(S).size) win(S);
  save(); render(false);
}
function hint() {
  const S = st(); if (S.done) return;
  const r = S.p.sol.findIndex((c, r) => S.b[r * N + c] !== 2); if (r < 0) return;
  for (let c = 0; c < N; c++) if (S.b[r * N + c] === 2) S.b[r * N + c] = 0;   // falsche Kronen dieser Zeile weg
  S.b[r * N + S.p.sol[r]] = 2; S.hints = (S.hints || 0) + 1; if (!S.t0) S.t0 = Date.now();
  if (crowns(S) === N && !bad(S).size) win(S);
  save(); render(false);
}
function win(S) {
  S.done = true; S.t = Date.now();
  if (KX.mode === "daily") { S.s = [ptsOf(S)]; try { award("daily", { tries: Math.min(8, 1 + (S.hints || 0) + Math.floor(secs(S) / 120)) }); } catch (e) {} }
  else { try { endRec("kronix", { won: true, tries: 1 + (S.hints || 0) }); } catch (e) {} }
  try { w2Win(); } catch (e) {} try { showCongrats("kronix", { word: "KRONE", sub: fmtT(secs(S)) }); } catch (e) {}
}

/* ---------- Ansicht ---------- */
const seg = () => `<div class="kx-seg" role="group" aria-label="Spielart">${[["daily", "Heute"], ["endless", "Endlos"]].map(([k, l]) => `<button type="button" data-kxm="${k}" aria-pressed="${KX.mode === k}">${l}</button>`).join("")}</div>`;
function helpHtml() {
  return `<div class="kx-help"><p><b>So geht's:</b> Setze genau eine Krone in jede Zeile, jede Spalte und jedes Farbfeld.</p>
  <p>Kronen dürfen sich nicht berühren – auch nicht schräg.</p>
  <p>Tippe ein Feld an: einmal für ✕ (hier keine Krone), zweimal für eine Krone, dreimal zum Leeren. Regelverstöße werden markiert.</p>
  <p>Jedes Rätsel hat genau eine Lösung. Ein Hinweis setzt eine richtige Krone (−15 Punkte).</p></div>`;
}
function gridHtml(S, end) {
  const B = S.b, reg = S.p.reg, x = end ? new Set() : bad(S);
  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), c = i % N, g = reg[i];
    const e = (r > 0 && reg[i - N] !== g ? " et" : "") + (c < N - 1 && reg[i + 1] !== g ? " er" : "") + (r < N - 1 && reg[i + N] !== g ? " eb" : "") + (c > 0 && reg[i - 1] !== g ? " el" : "");
    const v = B[i], lab = v === 2 ? `Zeile ${r + 1}, Spalte ${c + 1}: Krone` : v === 1 ? `Zeile ${r + 1}, Spalte ${c + 1}: ✕` : `Zeile ${r + 1}, Spalte ${c + 1}: leer`;
    cells.push(`<button type="button" class="kx-c${e}${v === 2 ? " q" : v === 1 ? " x" : ""}${x.has(i) ? " bad" : ""}" style="--k:${COL[g]}" data-kxi="${i}" aria-label="${lab}" ${end ? "disabled" : ""}>${reg.indexOf(g) === i ? `<i aria-hidden="true">${"ABCDEFGH"[g]}</i>` : ""}${v === 2 ? '<b aria-hidden="true">♛</b>' : v === 1 ? '<s aria-hidden="true">✕</s>' : ""}${x.has(i) ? '<u aria-hidden="true">!</u>' : ""}</button>`);
  }
  return `<div class="kx-grid" role="grid" aria-label="Rätselfeld ${N} × ${N}" style="--n:${N}">${cells.join("")}</div>`;
}
function playHtml(S) {
  const c = crowns(S), x = bad(S).size;
  return `<div class="kx-bar"><span class="kx-st">♛ <span>${c} von ${N} Kronen</span></span><span class="kx-time" data-noi18n>${S.t0 ? fmtT(secs(S)) : "0:00"}</span></div>
    ${gridHtml(S, false)}
    <p class="kx-msg${x ? " bad" : ""}" aria-live="polite">${x ? "Da stimmt etwas nicht: Markierte Kronen verletzen eine Regel." : c ? "Weiter so!" : "Tippe ein Feld an: einmal ✕, zweimal Krone."}</p>
    <div class="kx-act"><button class="btn" type="button" data-kx="hint">Hinweis (−15 Punkte)</button><button class="btn" type="button" data-kx="clear">Alles leeren</button></div>`;
}
function endHtml(S) {
  const daily = KX.mode === "daily", btn = (a, l, p) => `<button class="btn${p ? " primary" : ""}" type="button" ${a}>${l}</button>`;
  const bar = daily ? `${btn('data-kx="share"', `<i class="w2i" style="--i:var(--w2-share2)" aria-hidden="true"></i>${canShareOut() ? "Ergebnis teilen" : "Ergebnis kopieren"}`, 1)}${btn('data-kxm="endless" data-new="1"', "Endlos weiterspielen")}`
    : `${btn('data-kxm="endless" data-new="1"', "Nächstes Rätsel", 1)}${btn('data-kxm="daily"', "Tagesrätsel")}`;
  return `<div class="kx-end" aria-live="polite"><p class="kx-et">Gelöst!</p>
    <p class="kx-sub"><span data-noi18n>⏱ ${fmtT(secs(S))}</span> · <span>${S.hints ? (S.hints === 1 ? "mit 1 Hinweis" : `mit ${S.hints} Hinweisen`) : "ohne Hinweis"}</span>${daily ? ` · <b>${ptsOf(S)} Punkte</b>` : ""}</p>
    ${gridHtml(S, true)}<div class="kx-bar2">${bar}</div></div>
    ${daily ? scoreCardHtml(KXS().days, "Neues Rätsel in") : endStatHtml("kronix", "t")}
    ${daily ? suggestHtml(3, "kronix") : ""}`;
}
function shareText() {
  const S = kxDay();
  return `Super Daily Games · Kronix #${api.day() + 1}\n♛ ${fmtT(secs(S))}${S.hints ? " · 💡" + S.hints : ""}\n${"♛".repeat(N)}\n${SITE_URL}#spiel=kronix`;
}
function renderView() {
  const box = $("#kronix"); if (!box) return;
  if (api.homeFlag(true)) KX.mode = "daily";
  const S = st();
  const sub = KX.mode === "endless" ? "Endlos: ein neues Rätsel nach dem anderen – zählt nicht für die Serie." : "Eine Krone je Zeile, Spalte und Farbfeld – ohne dass sich zwei berühren.";
  box.innerHTML = `<div class="wdhead kx-head"><h2>Kronix</h2><p>${sub}</p></div>
    <div class="kx-top">${seg()}<button class="btn kx-q" type="button" data-kx="help" aria-label="Hilfe" aria-expanded="${!!KX.help}"><span data-noi18n aria-hidden="true">?</span></button></div>
    ${KX.help ? helpHtml() : ""}<div class="kx-card">${S.done ? endHtml(S) : playHtml(S)}</div>`;
  clearInterval(KX.tick); if (!S.done && S.t0) KX.tick = setInterval(() => { const t = $("#kronix .kx-time"); if (!t || api.view() !== "kronix") return clearInterval(KX.tick); t.textContent = fmtT(secs(st())); }, 1000);
  if (KX.sel >= 0) { const b = box.querySelector(`[data-kxi="${KX.sel}"]`); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} }
}

/* ---------- Eingabe ---------- */
document.addEventListener("click", e => {
  const m = e.target.closest("[data-kxm]");
  if (m && $("#kronix") && $("#kronix").contains(m)) { KX.mode = m.dataset.kxm; KX.help = false; KX.sel = -1; if (KX.mode === "endless" && (m.dataset.new || !KX.ex || KX.ex.done)) newEndless(); return render(false); }
  const c = e.target.closest("[data-kxi]"); if (c && $("#kronix").contains(c)) { KX.sel = +c.dataset.kxi; return tap(KX.sel); }
  const t = e.target.closest("[data-kx]"); if (!t || t.dataset.kx === "home") return;
  const a = t.dataset.kx;
  if (a === "help") { KX.help = !KX.help; return render(false); }
  if (a === "hint") return hint();
  if (a === "clear") { const S = st(); if (!S.done) { S.b = new Array(N * N).fill(0); save(); render(false); } return; }
  if (a === "share") return shareOut(shareText(), "Ergebnis kopiert");
});
// Tastatur: Pfeile bewegen, Leertaste/Enter schaltet um, X = ✕, K = Krone, Entf = leeren
document.addEventListener("keydown", e => {
  if (api.view() !== "kronix" || e.ctrlKey || e.metaKey || e.altKey) return;
  const f = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-kxi]"); if (!f) return;
  let i = +f.dataset.kxi; const mv = { ArrowUp: -N, ArrowDown: N, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (mv != null) { const j = i + mv; if (j >= 0 && j < N * N && !(mv === 1 && j % N === 0) && !(mv === -1 && i % N === 0)) { KX.sel = j; const b = $(`#kronix [data-kxi="${j}"]`); if (b) b.focus(); } e.preventDefault(); return; }
  const v = { x: 1, X: 1, k: 2, K: 2, Delete: 0, Backspace: 0 }[e.key]; if (v != null) { e.preventDefault(); KX.sel = i; tap(i, v); }
});

return { load: () => Promise.resolve(true), ready: () => true, render: renderView, _t: { make, solve, bad, st, tap, hint, ptsOf, KX, N } };
};
