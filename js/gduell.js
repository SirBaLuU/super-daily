/* Größenduell – tägliches Höher/Tiefer mit den geprüften Size-It-Up-Maßen (nachgeladen als js/gduell.js; Kern gdDone/gdDay inline in index.html).
   Links ein Ding mit bekannter Größe, rechts eins mit verdeckter: größer oder kleiner? Täglich 10 Duelle, Endlos bis zum ersten Fehler.
   Daten: data/sizeitup.json (73 Objekte, je Quelle) – dieselbe Datei wie Size It Up. */
window.GduellMod = function (api) {
"use strict";
const { $, esc, save, render, shareOut, canShareOut, award, showCongrats, w2Win, scoreCardHtml, suggestHtml, hash, rng, shufR, SFX, SITE_URL, GDS, gdDay, endRec, endStatHtml, I18N } = api;
const ROUNDS = 10, MIN_RATIO = 1.12;   // keine Fast-Gleichstände
const DIM = { width: "Breite", height: "Höhe", diameter: "Durchmesser" };
const ICO = { sport: "🏟️", alltag: "🧰", ball: "⚽", gebaeude: "🏛️", karte: "💳", muenze: "🪙", fahrzeug: "🚗", kunst: "🖼️" };
const GD = { d: null, by: null, mode: "daily", ex: null, help: false, rev: false };

function load() {
  if (GD.d) return Promise.resolve(true);
  return fetch("data/sizeitup.json?v=" + (window.__I18NV || 1)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => { GD.d = d.filter(x => x && x.id && x.mm > 0); GD.by = new Map(GD.d.map(x => [x.id, x])); return true; });
}
// Kette aus ROUNDS+1 Objekten: Nachbarn verschieden genug, kein Objekt doppelt
function chain(seed, n) {
  const R = rng(hash("gduell:" + seed));
  for (let t = 0; t < 50; t++) {
    const pool = shufR(GD.d.map(x => x.id), R), out = [pool.shift()];
    while (out.length < n && pool.length) {
      const a = GD.by.get(out[out.length - 1]), i = pool.findIndex(id => { const b = GD.by.get(id); return Math.max(a.mm, b.mm) / Math.min(a.mm, b.mm) >= MIN_RATIO; });
      if (i < 0) break; out.push(pool.splice(i, 1)[0]);
    }
    if (out.length === n) return out;
  }
  return null;
}
const nm = id => { const x = GD.by.get(id); return x ? (I18N.lang === "en" ? x.en : I18N.name(x.de)) : id; };
function len(mm) {
  const f = (v, d) => Number(v).toLocaleString(document.documentElement.lang || undefined, { maximumFractionDigits: d });
  return mm < 100 ? f(mm, 1) + " mm" : mm < 10000 ? f(mm / 10, mm < 1000 ? 1 : 0) + " cm" : f(mm / 1000, mm < 100000 ? 1 : 0) + " m";
}
function st() {
  if (GD.mode === "endless") { if (!GD.ex) newEndless(); return GD.ex; }
  const S = gdDay(); if (!S.c) { S.c = chain(api.today(), ROUNDS + 1); S.a = []; save(); } return S;
}
function newEndless() { GD.ex = { c: chain("e" + Date.now() + Math.random(), GD.d.length > 60 ? 60 : GD.d.length), a: [], done: false }; }
const pts = S => S.a.filter(Boolean).length;

function answer(big) {
  const S = st(); if (S.done || GD.rev) return;
  const i = S.a.length, A = GD.by.get(S.c[i]), B = GD.by.get(S.c[i + 1]), ok = (B.mm > A.mm) === big;
  S.a.push(ok); GD.rev = true; ok ? (SFX.right && SFX.right()) : (SFX.wrong && SFX.wrong());
  const last = GD.mode === "daily" ? S.a.length >= ROUNDS : !ok || S.a.length >= S.c.length - 1;
  if (last) finish(S);
  save(); render(false);
}
function finish(S) {
  S.done = true;
  if (GD.mode === "daily") { S.s = [pts(S) * 10]; try { award("daily", { tries: Math.max(1, 1 + ROUNDS - pts(S)) }); } catch (e) {} }
  else { try { endRec("gduell", { pts: pts(S), max: 10 }); } catch (e) {} }
  if (pts(S) >= 8) { try { w2Win(); } catch (e) {} try { showCongrats("gduell", { word: "MASS", sub: pts(S) + (GD.mode === "daily" ? "/10" : "") }); } catch (e) {} }
}

/* ---------- Ansicht ---------- */
const seg = () => `<div class="gd-seg" role="group" aria-label="Spielart">${[["daily", "Heute"], ["endless", "Endlos"]].map(([k, l]) => `<button type="button" data-gdm="${k}" aria-pressed="${GD.mode === k}">${l}</button>`).join("")}</div>`;
function card(id, show, cls) {
  const x = GD.by.get(id);
  return `<div class="gd-card ${cls}"><span class="gd-ico" aria-hidden="true">${ICO[x.cat] || "📏"}</span><b class="gd-nm" data-noi18n>${esc(nm(id))}</b>
    <span class="gd-dim">${DIM[x.dim] || ""}</span><span class="gd-val" data-noi18n>${show ? esc(len(x.mm)) : "?"}</span></div>`;
}
function playHtml(S) {
  const i = S.a.length - (GD.rev ? 1 : 0), A = S.c[i], B = S.c[i + 1], r = GD.rev ? S.a[S.a.length - 1] : null;
  const dots = GD.mode === "daily" ? `<div class="gd-dots" aria-label="Fortschritt">${Array.from({ length: ROUNDS }, (_, k) => `<i class="${k < S.a.length ? (S.a[k] ? "ok" : "bad") : k === i ? "cur" : ""}">${k < S.a.length ? (S.a[k] ? "✓" : "✗") : ""}</i>`).join("")}</div>`
    : `<p class="gd-streak">Serie: <b>${pts(S)}</b></p>`;
  const q = GD.rev ? `<p class="gd-res ${r ? "ok" : "bad"}" aria-live="polite">${r ? "✓ Richtig!" : "✗ Leider falsch."}</p><button class="btn primary gd-next" type="button" data-gd="next" autofocus>${S.done ? "Zum Ergebnis" : "Weiter"}</button>`
    : `<p class="gd-q">Ist das rechte Ding größer oder kleiner?</p><div class="gd-btns"><button class="btn gd-up" type="button" data-gd="up"><span aria-hidden="true">↑</span> Größer</button><button class="btn gd-dn" type="button" data-gd="down"><span aria-hidden="true">↓</span> Kleiner</button></div>`;
  return `${dots}<div class="gd-vs">${card(A, true, "a")}<span class="gd-x" aria-hidden="true">vs</span>${card(B, GD.rev, "b" + (GD.rev ? (r ? " ok" : " bad") : ""))}</div>${q}`;
}
function endHtml(S) {
  const daily = GD.mode === "daily", p = pts(S), btn = (a, l, pr) => `<button class="btn${pr ? " primary" : ""}" type="button" ${a}>${l}</button>`;
  const bar = daily ? `${btn('data-gd="share"', `<i class="w2i" style="--i:var(--w2-share2)" aria-hidden="true"></i>${canShareOut() ? "Ergebnis teilen" : "Ergebnis kopieren"}`, 1)}${btn('data-gdm="endless" data-new="1"', "Endlos weiterspielen")}`
    : `${btn('data-gdm="endless" data-new="1"', "Nochmal", 1)}${btn('data-gdm="daily"', "Tagesrätsel")}`;
  const list = S.a.map((ok, k) => { const A = GD.by.get(S.c[k]), B = GD.by.get(S.c[k + 1]); return `<li class="${ok ? "ok" : "bad"}"><span aria-hidden="true">${ok ? "✓" : "✗"}</span> <span data-noi18n>${esc(nm(B.id))} (${esc(len(B.mm))}) ${B.mm > A.mm ? "&gt;" : "&lt;"} ${esc(nm(A.id))} (${esc(len(A.mm))})</span></li>`; }).join("");
  return `<div class="gd-end" aria-live="polite"><p class="gd-et">${daily ? `${p} von 10 richtig` : `Serie: ${p}`}</p><div class="gd-bar">${bar}</div><ol class="gd-list">${list}</ol></div>
    ${daily ? scoreCardHtml(GDS().days, "Neues Duell in") : endStatHtml("gduell", "pts")}${daily ? suggestHtml(3, "gduell", "Als Nächstes", true) : ""}`;
}
function helpHtml() {
  return `<div class="gd-help"><p><b>So geht's:</b> Links steht ein Ding mit seiner Größe, rechts ein zweites mit verdeckter Größe. Tippe, ob das rechte größer oder kleiner ist.</p>
  <p>Verglichen wird das angegebene Maß (Höhe, Breite oder Durchmesser). Jeden Tag gibt es 10 Duelle, für alle gleich. Im Endlos-Modus geht es weiter, bis du dich irrst.</p>
  <p class="gd-src"><b>Quellen:</b> dieselben geprüften Maße wie bei Size It Up – Quelle je Objekt in den Size-It-Up-Daten.</p></div>`;
}
function shareText() {
  const S = gdDay();
  return `Super Daily Games · Größenduell #${api.day() + 1} ${pts(S)}/10\n${S.a.map(ok => ok ? "✅" : "❌").join("")}\n${SITE_URL}#spiel=gduell`;
}
function renderView() {
  const box = $("#gduell"); if (!box) return;
  if (api.homeFlag(true)) { GD.mode = "daily"; GD.rev = false; }
  const S = st();
  const sub = GD.mode === "endless" ? "Endlos: so lange, bis du dich irrst – zählt nicht für die Serie." : "Größer oder kleiner? 10 Duelle mit echten Maßen.";
  box.innerHTML = `<div class="wdhead gd-head"><h2>Größenduell</h2><p>${sub}</p></div>
    <div class="gd-top">${seg()}<button class="btn gd-q" type="button" data-gd="help" aria-label="Hilfe und Quellen" aria-expanded="${!!GD.help}"><span data-noi18n aria-hidden="true">?</span></button></div>
    ${GD.help ? helpHtml() : ""}<div class="gd-box">${S.done && !GD.rev ? endHtml(S) : playHtml(S)}</div>`;
}
document.addEventListener("click", e => {
  const m = e.target.closest("[data-gdm]");
  if (m && $("#gduell") && $("#gduell").contains(m)) { GD.mode = m.dataset.gdm; GD.help = false; GD.rev = false; if (GD.mode === "endless" && (m.dataset.new || !GD.ex || GD.ex.done)) newEndless(); return render(false); }
  const t = e.target.closest("[data-gd]"); if (!t || t.dataset.gd === "home") return;
  const a = t.dataset.gd;
  if (a === "up") return answer(true);
  if (a === "down") return answer(false);
  if (a === "next") { GD.rev = false; return render(false); }
  if (a === "help") { GD.help = !GD.help; return render(false); }
  if (a === "share") return shareOut(shareText(), "Ergebnis kopiert");
});
document.addEventListener("keydown", e => {
  if (api.view() !== "gduell" || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest("input,textarea,select"))) return;
  if (e.key === "ArrowUp") { e.preventDefault(); answer(true); } else if (e.key === "ArrowDown") { e.preventDefault(); answer(false); }
});
return { load, ready: () => !!GD.d, render: renderView, _t: { chain, len, st, answer, GD, pts } };
};
