/* Weltpin – Spiel-Code (nachgeladen als js/weltpin.js; nutzt die globalen Funktionen der Seite). Kern (wpDone, wpDay, Hooks) steht inline in index.html.
   ---------- Weltpin (R67b): Ort erraten – Hinweise lesen, Pin auf der Weltkarte setzen (5 Orte pro Tag) ----------
   Daten: data/weltpin.json {places:[{n,c,la,lo,d,t,h:[[ico,titel,text]],f,s,l,k}], map:[[ring(delta, 1/10 Grad)]], cn:{ISO:[de,en,x0,y0,x1,y1]}}
   Orte: GeoNames (CC BY 4.0) + UNESCO-Welterbeliste; Karte: Natural Earth 1:50m (gemeinfrei), selbst gezeichnet (SVG, keine Kacheln).
   Punkte je Ort: 5000 · e^(−km/1492,7) (GeoGuessr-Kurve für die Weltkarte, dokumentiert im OSV-5M-Benchmark), × (100 % − 10 % je Hinweis nach den ersten zwei). */
window.WeltpinMod = function (api) {
"use strict";
const { $, esc, fmt, save, render, toast, shareOut, canShareOut, award, showCongrats, w2Win, scoreCardHtml, suggestHtml, rbDateFmt, dayIndex, dateOfDay, hash, rng, shufR,
  newRoomId, hostNow, amHost, lvPlayers, liveEnter, SFX, LV, SITE_URL, WPS, wpDay, wpDone, wpSum, wpCls } = api;
const WP = { d: null, mode: "daily", view: "play", date: null, rounds: null, pin: null, rev: null, help: false, ex: null, exUsed: [], duel: null, vb: null, cache: {}, win: null, jump: "" };
const WP_W = 40;                    // Tage ohne Wiederholung eines Ortes (329 Orte, 5 pro Tag)
const WP_SLOTS = [1, 2, 2, 3, 3];   // Tagesmischung: 1 leicht, 2 mittel, 2 schwer
const WP_FREE = 2, WP_COST = 10;    // 2 Hinweise gratis, jeder weitere −10 % der möglichen Punkte
const WP_MAX = 5000, WP_K = 1492.7;
const WP_X0 = -1800, WP_X1 = 1800, WP_Y0 = -840, WP_Y1 = 600;   // Kartenausschnitt (84° N bis 60° S), 1 Einheit = 0,1 Grad
const WP_DIF = ["", "Leicht", "Mittel", "Schwer"];
function wpLoad() { if (WP.d) return Promise.resolve(WP.d); if (window.__WELT) return Promise.resolve(WP.d = window.__WELT); return fetch("data/weltpin.json").then(r => r.json()).then(d => (WP.d = d)).catch(() => null); }
const wpArch = date => { const A = WPS().arch || (WPS().arch = {}); return A[date] || (A[date] = { s: [], k: [], h: [], done: false }); };
const wpEnd = () => WPS().end || (WPS().end = { n: 0, sum: 0, best: 0, run: 0 });
function wpState() {
  if (WP.mode === "duel") return WP.duel ? WP.duel.st : null;
  if (WP.mode === "daily") return wpDay(); if (WP.mode === "archive") return wpArch(WP.date);
  return WP.ex || (WP.ex = { s: [], k: [], h: [], done: false });
}
// Entfernung (Haversine, mittlerer Erdradius) und Punkte
function wpKm(a, b) { const r = Math.PI / 180, la1 = a[1] * r, la2 = b[1] * r, h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((b[0] - a[0]) * r / 2) ** 2; return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h))); }
const wpGeo = km => Math.round(WP_MAX * Math.exp(-km / WP_K));
const wpFactor = shown => Math.max(0, 100 - WP_COST * Math.max(0, shown - WP_FREE));
const wpPts = (km, shown) => Math.round(wpGeo(km) * wpFactor(shown) / 100);
const wpBlock = p => p >= 4000 ? "🟩" : p >= 2000 ? "🟨" : "🟥";
const wpKmTxt = km => km < 1 ? "unter 1 km" : km < 10 ? `${fmt(Math.round(km * 10) / 10)} km` : `${fmt(Math.round(km))} km`;
const wpPraise = p => p >= 4800 ? "Volltreffer!" : p >= 4000 ? "Super nah!" : p >= 2500 ? "Gut geschätzt" : p >= 1000 ? "Richtige Gegend" : "Beim nächsten Mal";
// Tagesauswahl: seedbasiert pro Datum, fortlaufend ab 1. 1. 2026 – kein Ort innerhalb von WP_W Tagen doppelt, pro Tag 5 verschiedene Länder
function wpPick(key, recent) {
  const P = WP.d.places, order = shufR(P.map((_, i) => i), rng(hash(key))), out = [], cc = new Set();
  for (const want of WP_SLOTS) {
    let k = order.find(i => !out.includes(i) && !recent.has(i) && P[i].d === want && !cc.has(P[i].c));
    if (k == null) k = order.find(i => !out.includes(i) && !recent.has(i)); if (k == null) k = order.find(i => !out.includes(i));
    out.push(k); cc.add(P[k].c);
  }
  return out;
}
function wpSetFor(date) {
  const D = dayIndex(date), C = WP.cache; if (D < 0 || D > 20000) return wpPick("wp1:" + date, new Set());
  if (!C.seq) C.seq = [];
  while (C.seq.length <= D) { const d = C.seq.length, recent = new Set(); for (let k = Math.max(0, d - WP_W); k < d; k++) C.seq[k].forEach(i => recent.add(i)); C.seq.push(wpPick("wp1:" + dateOfDay(d), recent)); }
  return C.seq[D];
}
function wpRandom() { const P = WP.d.places; let k = 0, i; do { i = Math.floor(Math.random() * P.length); } while (WP.exUsed.includes(i) && k++ < 80); WP.exUsed = WP.exUsed.concat(i).slice(-60); return i; }
// Toleranter Ländername (für „Karte zu Land springen“): Groß/Klein, Akzente, Umlaute (ä = a = ae, ß = ss), Leer-/Satzzeichen, Artikel egal; Tippfehler ≤ 1 ab 6 Zeichen, nie mehrdeutig
const wpNormA = s => String(s || "").toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^(die|der|das|the|la|le|el)\s+/, "").replace(/[\s\-.'’´`_,()]/g, "");
const wpNormB = s => wpNormA(String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue"));
const WP_ALIAS = { US: ["USA", "US", "Amerika", "Vereinigte Staaten von Amerika", "United States"], GB: ["UK", "England", "Großbritannien", "Britannien", "Schottland", "Wales"], CN: ["China"], RU: ["Russland"], KR: ["Südkorea"], KP: ["Nordkorea"], CZ: ["Tschechien", "Tschechei"], NL: ["Holland"], AE: ["VAE", "Emirate"], DE: ["BRD"], CD: ["DR Kongo", "Demokratische Republik Kongo"], CG: ["Republik Kongo"], CI: ["Elfenbeinküste", "Côte d’Ivoire", "Ivory Coast"], BA: ["Bosnien"], MK: ["Mazedonien"], VA: ["Vatikan"], TR: ["Türkei", "Turkey", "Türkiye"], IR: ["Persien"], MM: ["Burma", "Birma"], SZ: ["Swasiland"], CV: ["Kapverden"], DO: ["Dom Rep", "Dominikanische Rep"] };
function wpLev(a, b) { if (Math.abs(a.length - b.length) > 1) return 2; const m = a.length, n = b.length; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const q = [i]; for (let j = 1; j <= n; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = q; } return p[n]; }
let WP_CN = null;
function wpCnIndex() {
  if (WP_CN) return WP_CN; WP_CN = [];
  for (const [iso, v] of Object.entries(WP.d.cn || {})) { const keys = new Set(); [v[0], v[1]].concat(WP_ALIAS[iso] || []).forEach(n => { keys.add(wpNormA(n)); keys.add(wpNormB(n)); }); keys.delete(""); WP_CN.push({ iso, keys: [...keys], v }); }
  return WP_CN;
}
function wpMatchCountry(q) {
  const s = wpNormA(q); if (s.length < 2) return null; const L = wpCnIndex();
  const ex = L.filter(c => c.keys.includes(s)); if (ex.length === 1) return ex[0]; if (ex.length > 1) return null;
  if (s.length < 6) return null;
  const near = L.filter(c => c.keys.some(k => k.length >= 6 && wpLev(s, k) <= 1)); return near.length === 1 ? near[0] : null;
}
// ---------- Karte (SVG, gleichabständige Projektion: x = Länge·10, y = −Breite·10) ----------
let WP_PATH = "";
function wpMapPath() {
  if (WP_PATH) return WP_PATH; const o = [];
  for (const c of WP.d.map) for (const r of c) { o.push("M" + r[0] + " " + r[1] + "l" + r.slice(2).join(" ") + "z"); }
  return (WP_PATH = o.join(""));
}
function wpGrat() { let s = ""; for (let lo = -150; lo <= 150; lo += 30) s += `M${lo * 10} ${WP_Y0}V${WP_Y1}`; for (let la = -60; la <= 80; la += 20) s += `M${WP_X0} ${-la * 10}H${WP_X1}`; return s; }
const wpXY = ll => [ll[0] * 10, -ll[1] * 10], wpLL = xy => [xy[0] / 10, -xy[1] / 10];
function wpKMax(el) { const w = Math.max(200, el.clientWidth), h = Math.max(160, el.clientHeight); return Math.max((WP_X1 - WP_X0) / w, (WP_Y1 - WP_Y0) / h) * 1.02; }
function wpView(el, reset) {
  const kMax = wpKMax(el);
  if (!WP.vb || reset) WP.vb = { cx: 0, cy: (WP_Y0 + WP_Y1) / 2, k: kMax };
  const v = WP.vb; v.k = Math.min(kMax, Math.max(.12, v.k)); v.cx = Math.min(WP_X1, Math.max(WP_X0, v.cx)); v.cy = Math.min(WP_Y1, Math.max(WP_Y0, v.cy));
  return v;
}
function wpApply() {
  const el = $("#wpmap"), sv = $("#wpsvg"); if (!el || !sv) return; const v = wpView(el), w = el.clientWidth * v.k, h = el.clientHeight * v.k;
  sv.setAttribute("viewBox", `${(v.cx - w / 2).toFixed(1)} ${(v.cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  sv.querySelectorAll("[data-wpk]").forEach(g => { const [x, y] = g.dataset.wpk.split(",").map(Number); g.setAttribute("transform", `translate(${x} ${y}) scale(${v.k.toFixed(4)})`); });
  sv.style.setProperty("--wpk", v.k.toFixed(4));
  const z = $("#wpzoom"); if (z) z.textContent = `${Math.max(1, Math.round(wpKMax(el) / v.k))}×`;
}
function wpFit(pts, el) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.max(240, (x1 - x0) * 1.5), h = Math.max(150, (y1 - y0) * 1.6);
  WP.vb = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: Math.max(w / Math.max(200, el.clientWidth), h / Math.max(160, el.clientHeight)) };
}
// Großkreis-Linie zwischen Pin und Ziel (Längen fortlaufend, damit die Linie nicht springt)
function wpArc(a, b) {
  const r = Math.PI / 180, v = ll => [Math.cos(ll[1] * r) * Math.cos(ll[0] * r), Math.cos(ll[1] * r) * Math.sin(ll[0] * r), Math.sin(ll[1] * r)];
  const A = v(a), B = v(b), om = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]))), o = [];
  if (om < 1e-6) return [wpXY(a), wpXY(b)];
  let last = null;
  for (let i = 0; i <= 48; i++) { const t = i / 48, s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om), p = [A[0] * s1 + B[0] * s2, A[1] * s1 + B[1] * s2, A[2] * s1 + B[2] * s2];
    let lo = Math.atan2(p[1], p[0]) / r; const la = Math.asin(Math.max(-1, Math.min(1, p[2]))) / r; if (last != null) { while (lo - last > 180) lo -= 360; while (lo - last < -180) lo += 360; } last = lo; o.push(wpXY([lo, la])); }
  return o;
}
const WP_PIN = `<path d="M0 0C-3-9-13-15-13-26a13 13 0 1 1 26 0C13-15 3-9 0 0Z" class="wp-pinb"/><circle cy="-26" r="5" fill="#fff"/>`;
const WP_GOAL = `<circle r="13" fill="#fff"/><circle r="9" fill="#1f7a4d"/><circle r="4" fill="#fff"/>`;
function wpMapHtml(P, rv) {
  const pin = WP.pin ? wpXY(WP.pin) : null, tg = rv ? wpXY([P.lo, P.la]) : null;
  const line = rv && pin ? `<path class="wp-line" d="M${wpArc(WP.pin, [P.lo, P.la]).map(p => p.map(n => n.toFixed(1)).join(" ")).join("L")}"/>` : "";
  return `<div class="wp-map${rv ? " rev" : ""}" id="wpmap" tabindex="0" aria-label="Weltkarte: ziehen zum Verschieben, Finger spreizen oder Mausrad zum Zoomen, tippen setzt den Pin" role="application">
    <svg id="wpsvg" preserveAspectRatio="none" aria-hidden="true"><rect class="wp-sea" x="-4000" y="-3000" width="8000" height="6000"/><path class="wp-grat" d="${wpGrat()}"/><path class="wp-land" d="${wpMapPath()}"/>
    <g id="wpov">${line}${tg ? `<g class="wp-goal" data-wpk="${tg[0]},${tg[1]}">${WP_GOAL}</g>` : ""}${pin ? `<g class="wp-pin" id="wppin" data-wpk="${pin[0]},${pin[1]}">${WP_PIN}</g>` : ""}</g></svg>
    <div class="wp-ctl"><button type="button" class="wp-cb" data-wp="zin" aria-label="Hineinzoomen">+</button><button type="button" class="wp-cb" data-wp="zout" aria-label="Herauszoomen">−</button><button type="button" class="wp-cb" data-wp="zreset" aria-label="Ganze Welt zeigen">⌂</button></div>
    ${!rv && !WP.pin ? `<span class="wp-tip">Tippe auf die Karte, um deinen Pin zu setzen</span>` : ""}<span class="wp-zoom" id="wpzoom" aria-hidden="true"></span><span class="wp-attr">Natural Earth</span></div>`;
}
function wpWireMap() {
  const el = $("#wpmap"), sv = $("#wpsvg"); if (!el || !sv) return; wpApply();
  const ptr = new Map(); let drag = null, pinch = null, raf = 0;
  const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; wpApply(); }); };
  const toMap = (cx, cy) => { const b = el.getBoundingClientRect(), v = WP.vb; return [v.cx + (cx - b.left - b.width / 2) * v.k, v.cy + (cy - b.top - b.height / 2) * v.k]; };
  const zoomAt = (f, cx, cy) => { const v = WP.vb, a = toMap(cx, cy); v.k = v.k / f; wpView(el); const b = toMap(cx, cy); v.cx += a[0] - b[0]; v.cy += a[1] - b[1]; wpView(el); sched(); };
  el.addEventListener("pointerdown", e => {
    if (e.target.closest(".wp-ctl") || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {} ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 1) drag = { x: e.clientX, y: e.clientY, cx: WP.vb.cx, cy: WP.vb.cy, moved: false, t: performance.now() };
    if (ptr.size === 2) { const [p, q] = [...ptr.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), k: WP.vb.k }; if (drag) drag.moved = true; }
  });
  el.addEventListener("pointermove", e => {
    if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size >= 2 && pinch) { const [p, q] = [...ptr.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]); const f = WP.vb.k * d / (pinch.k * Math.max(1, pinch.d)); zoomAt(f, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); return; }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) > 7) { drag.moved = true; el.classList.add("pan"); } if (drag.moved) { WP.vb.cx = drag.cx - dx * WP.vb.k; WP.vb.cy = drag.cy - dy * WP.vb.k; wpView(el); sched(); } }
  });
  const up = e => {
    if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId); el.classList.remove("pan");
    if (ptr.size < 2) pinch = null;
    if (ptr.size === 0 && drag) { const d = drag; drag = null; if (!d.moved && e.type === "pointerup" && performance.now() - d.t < 900) wpSetPin(toMap(e.clientX, e.clientY)); }
    else if (ptr.size === 1) { const [p] = [...ptr.values()]; drag = { x: p[0], y: p[1], cx: WP.vb.cx, cy: WP.vb.cy, moved: true, t: 0 }; }
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", e => { e.preventDefault(); zoomAt(Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) / 300), e.clientX, e.clientY); }, { passive: false });
  el.addEventListener("keydown", e => {
    const v = WP.vb, st = 60 * v.k; let hit = true;
    if (e.key === "ArrowLeft") v.cx -= st; else if (e.key === "ArrowRight") v.cx += st; else if (e.key === "ArrowUp") v.cy -= st; else if (e.key === "ArrowDown") v.cy += st;
    else if (e.key === "+" || e.key === "=") v.k /= 1.5; else if (e.key === "-") v.k *= 1.5; else if (e.key === " " && !WP.rev) wpSetPin([v.cx, v.cy]); else hit = false;
    if (hit) { e.preventDefault(); wpView(el); wpApply(); }
  });
  if (!WP.ro && typeof ResizeObserver === "function") { WP.ro = new ResizeObserver(() => { const m = $("#wpmap"); if (m) wpApply(); }); }
  if (WP.ro) { WP.ro.disconnect(); WP.ro.observe(el); }
}
function wpSetPin(xy) {
  if (WP.rev || WP.lock) return; const ll = wpLL(xy); ll[0] = Math.max(-180, Math.min(180, ll[0])); ll[1] = Math.max(-85, Math.min(85, ll[1])); WP.pin = ll;
  const ov = $("#wpov"); if (!ov) return; const p = wpXY(ll); let g = $("#wppin");
  if (!g) { ov.insertAdjacentHTML("beforeend", `<g class="wp-pin" id="wppin" data-wpk="${p[0]},${p[1]}">${WP_PIN}</g>`); g = $("#wppin"); } else g.dataset.wpk = p[0] + "," + p[1];
  g.classList.remove("drop"); void g.getBoundingClientRect(); g.classList.add("drop"); wpApply();
  const tip = document.querySelector("#wpmap .wp-tip"); if (tip) tip.remove();
  const b = $("#wpgo"); if (b) b.disabled = false; SFX.click && SFX.click();
}
// ---------- Ablauf ----------
function wpRounds() {
  if (WP.rounds) return WP.rounds;
  if (WP.mode === "daily") WP.rounds = wpSetFor(api.today()); else if (WP.mode === "archive") WP.rounds = wpSetFor(WP.date);
  else if (WP.mode === "duel") WP.rounds = WP.duel ? wpPick("wpd:" + WP.duel.seed, new Set()) : [];
  else WP.rounds = [];
  return WP.rounds;
}
function wpNewRound() { WP.pin = null; WP.rev = null; WP.vb = null; WP.jump = ""; WP.t0 = 0; clearInterval(WP.tick); }
const WP_BLITZ = 60;
const wpBlitz = () => !!WPS().blitz && (WP.mode === "daily" || WP.mode === "endless");
function wpBlitzBtn(lock) { const on = !!WPS().blitz; return `<button type="button" class="rb-chip wp-bz" data-wpb="${on ? 0 : 1}" aria-pressed="${on}" ${lock ? "disabled" : ""} title="Freiwillige Herausforderung: 60 Sekunden pro Ort">⚡ 60 s</button>`; }
function wpTick() {
  clearInterval(WP.tick); if (!wpBlitz() || WP.rev) return; if (!WP.t0) WP.t0 = Date.now();
  WP.tick = setInterval(() => { if (api.view() !== "weltpin" || WP.rev || !WP.t0) return clearInterval(WP.tick); const l = Math.max(0, WP_BLITZ - Math.floor((Date.now() - WP.t0) / 1000)), e = $("#wpt"); if (e) { e.textContent = `${l} s`; e.classList.toggle("low", l <= 10); } if (l <= 0) { clearInterval(WP.tick); wpConfirm(true); } }, 250);
}
function wpSwitch(mode, date) { WP.mode = mode; WP.date = date || null; WP.view = "play"; WP.rounds = null; if (mode === "endless") WP.ex = null; if (mode !== "duel") WP.duel = null; wpNewRound(); render(false); try { window.scrollTo({ top: 0 }); } catch (e) {} }
function wpShown(st) { return Math.max(WP_FREE, Math.min(7, (st.cur && st.cur.i === st.s.length) ? st.cur.n : WP_FREE)); }
function wpHint(st, P) { const n = wpShown(st); if (WP.rev || n >= P.h.length) return; st.cur = { i: st.s.length, n: n + 1 }; if (WP.mode !== "endless") save(); render(false); }
function wpConfirm(timeUp) {
  const st = wpState(); if (!st || WP.rev || st.done || (!WP.pin && !timeUp)) return; const R = wpRounds(); let idx = R[st.s.length];
  if (WP.mode === "endless" && idx == null) return; const P = WP.d.places[idx]; if (!P) return;
  const shown = wpShown(st), km = WP.pin ? wpKm(WP.pin, [P.lo, P.la]) : 20037, pts = WP.pin ? wpPts(km, shown) : 0; clearInterval(WP.tick); if (wpBlitz() && WP.mode === "daily") st.b = 1;
  st.s.push(pts); st.k.push(Math.round(km)); st.h.push(shown); st.cur = null; (api.store().seen || (api.store().seen = {})).weltpin = 1;
  WP.rev = { km, pts, geo: WP.pin ? wpGeo(km) : 0, shown, i: st.s.length - 1, P, none: !WP.pin };
  const el = $("#wpmap"); if (el) wpFit(WP.pin ? [wpXY(WP.pin), wpXY([P.lo, P.la])] : [wpXY([P.lo, P.la])], el);
  if (WP.mode === "endless") { const E = wpEnd(); E.n++; E.sum += pts; E.best = Math.max(E.best, pts); E.run = (E.run || 0) + 1; if (pts >= 2500) award("endless", { g: "weltpin" }); }
  else if (st.s.length >= R.length) {
    st.done = true; const tot = wpSum(st.s);
    if (WP.mode === "daily") { award("daily", { tries: Math.max(1, Math.round((25000 - tot) / 3000) + 1), g: "weltpin" }); WP.win = tot; }
    if (WP.mode === "duel") wpLiveProgress();
  }
  if (WP.mode === "duel" && !st.done) wpLiveProgress();
  save();
  SFX.flip(2); setTimeout(() => { if (WP.rev && WP.rev.pts === pts) { pts >= 4000 ? SFX.right() : pts >= 2000 ? SFX.flip(3) : SFX.wrong(); } }, 700);
  render(false);
}
function wpNext() {
  const st = wpState(); if (!WP.rev) return; const fin = st && st.done; wpNewRound();
  if (WP.mode === "endless") st.s.length < 1e6 && wpRounds().push(wpRandom());
  render(false); try { const b = $("#weltpin"); b && b.scrollIntoView({ block: "start" }); } catch (e) {}
  if (fin && WP.mode === "daily" && WP.win != null) { const tot = WP.win; WP.win = null; showCongrats("wordle", { word: "WELT", sub: `${fmt(tot)} / ${fmt(25000)}` }); if (tot >= 15000) w2Win(); }
}
// ---------- Ansicht ----------
function wpSeg() {
  const m = WP.view === "archive" ? "archive" : WP.mode;
  return `<span class="wdseg" role="group" aria-label="Modus">${[["daily", "Täglich"], ["endless", "Endlos"], ["archive", "Archiv"], ["duel", "1 gegen 1"]].map(([k, l]) => `<button type="button" data-wpm="${k}" aria-pressed="${m === k}">${l}</button>`).join("")}</span>`;
}
function wpHelpHtml() {
  return `<div class="rb-help wp-help"><p><b>So geht's:</b> Lies die Hinweise zum gesuchten Ort und tippe auf die Weltkarte, wo du ihn vermutest. Mit zwei Fingern (oder Mausrad, + / −) zoomst du, durch Ziehen verschiebst du die Karte. „Pin bestätigen“ gibt ab – vorher kannst du den Pin beliebig oft versetzen. Kein Zeitlimit.</p>
    <p><b>Punkte:</b> bis zu ${fmt(WP_MAX)} je Ort, je näher, desto mehr: Punkte = ${fmt(WP_MAX)} × e<sup>−Entfernung / 1.492,7 km</sup> (dieselbe Kurve wie beim bekannten Vorbild für die Weltkarte). Beispiele: 0 km = 5.000, 100 km ≈ 4.676, 500 km ≈ 3.577, 1.000 km ≈ 2.559, 3.000 km ≈ 670.</p>
    <p><b>Hinweise:</b> Die ersten ${WP_FREE} sind gratis. Jeder weitere senkt die möglichen Punkte dieses Ortes um ${WP_COST} % (alle 7 Hinweise = höchstens 50 %).</p>
    <p><b>Täglich:</b> 5 Orte (1 leicht, 2 mittel, 2 schwer), für alle gleich; kein Ort wiederholt sich innerhalb von ${WP_W} Tagen. Nur das Tagesrätsel zählt für die Serie. <b>Endlos</b> und <b>Archiv</b> sind frei, <b>1 gegen 1</b> spielt ihr im Live-Raum dieselben 5 Orte – mehr Punkte gewinnt, bei Gleichstand die kürzere Zeit.</p>
    <p><b>⚡ 60 s pro Ort</b> (freiwillig): Nach 60 Sekunden wird der Pin automatisch bestätigt – ohne Pin gibt es 0 Punkte. Standard ist ohne Zeitlimit.</p>
    <p><b>Daten:</b> Orte aus GeoNames (CC BY 4.0) und der UNESCO-Welterbeliste, Quelle bei jedem Ort; Karte: Natural Earth (gemeinfrei), selbst gezeichnet. Umstrittene Gebiete sind nicht als Ziel dabei.</p></div>`;
}
function wpHintsHtml(P, shown, rv) {
  const n = rv ? P.h.length : shown, more = P.h.length - n;
  return `<ol class="wp-hints">${P.h.slice(0, n).map((h, i) => i < n ? `<li class="wp-h${i >= shown ? " late" : ""}${i === shown - 1 && !rv && i >= WP_FREE ? " new" : ""}"><span class="wp-hi" aria-hidden="true">${h[0]}</span><span class="wp-ht"><small>${esc(h[1])}</small><span>${esc(h[2])}</span></span></li>` : "").join("")}${more > 0 ? `<li class="wp-h locked"><span class="wp-hi" aria-hidden="true">?</span><span class="wp-ht"><small>Verdeckt</small><span>${more === 1 ? "noch 1 Hinweis" : `noch <span>${more}</span> Hinweise`}</span></span></li>` : ""}</ol>`;
}
function wpDuelBar() {
  const r = LV.wp; if (!r || !WP.duel || r.seed !== WP.duel.seed) return "";
  const rk = wpRank(r), me = LV.t && LV.t.self;
  return `<div class="wp-duel" id="wpduel" aria-live="polite"><b>1 gegen 1</b>${rk.map(([id, x], k) => `<span class="${id === me ? "me" : ""}${x.r >= 5 ? " fin" : ""}">${r.done ? (k === 0 ? "🏆 " : "") : ""}${esc(r.names[id] ? r.names[id][0] : "?")}${id === me ? " (du)" : ""} · <span>${fmt(x.p)}</span> P · ${x.r}/5</span>`).join("")}${r.done ? `<span class="wp-dwin">${esc(rk[0] && r.names[rk[0][0]] ? r.names[rk[0][0]][0] : "?")} gewinnt!</span>` : ""}</div>`;
}
function wpRender() {
  if (api.homeFlag(true)) { if (WP.mode === "duel" && (!LV.wp || !WP.duel || WP.duel.st.done)) { WP.mode = "daily"; WP.duel = null; WP.rounds = null; wpNewRound(); } if (WP.view !== "play" && WP.view !== "archive" && WP.view !== "duel") WP.view = "play"; }
  const box = $("#weltpin");
  if (!WP.d) { box.innerHTML = `<div class="wdhead"><h2>Weltpin</h2><p>Lädt …</p></div>`; wpLoad().then(d => { if (!d) { box.innerHTML = `<div class="wdhead"><h2>Weltpin</h2><p>Die Spieldaten konnten nicht geladen werden.</p></div><button class="btn" type="button" data-wp="home">Erneut versuchen</button>`; return; } if (api.view() === "weltpin") render(false); }); return; }
  if (WP.view === "archive") return wpRenderArchive(box);
  if (WP.view === "duel") return wpRenderDuelHome(box);
  const st = wpState(); if (!st) { WP.mode = "daily"; return wpRender(); }
  const R = wpRounds(); if (WP.mode === "endless" && R.length <= st.s.length) R.push(wpRandom());
  const help = WP.help ? wpHelpHtml() : "", head = `<div class="wdhead"><h2>Weltpin</h2><p>${WP.mode === "duel" ? "1 gegen 1: dieselben 5 Orte – mehr Punkte gewinnt" : "Lies die Hinweise und setz deinen Pin auf der Weltkarte – 5 Orte pro Tag."}</p></div>`;
  const lockB = !!WP.pin || !!WP.rev || (st && wpShown(st) > WP_FREE);
  const top = `<div class="rb-topbar">${WP.mode === "duel" ? "" : wpSeg()}<button class="btn sz-qbtn" type="button" data-wp="help" aria-label="Hilfe" aria-expanded="${!!WP.help}">?</button></div>${help}`;
  if (st.done && !WP.rev) return wpRenderEnd(box, st, head, top);
  const rv = WP.rev, i = rv ? rv.i : st.s.length, P = rv ? rv.P : WP.d.places[R[i]], shown = rv ? rv.shown : wpShown(st), n = WP.mode === "endless" ? 0 : R.length;
  const tot = wpSum(st.s), fac = wpFactor(shown), last = i === R.length - 1 && WP.mode !== "endless";
  const lbl = WP.mode === "endless" ? `Endlos · Ort ${i + 1}` : WP.mode === "archive" ? `Archiv · Ort ${i + 1}/${n}` : `Ort ${i + 1}/${n}`;
  let side;
  if (rv) {
    side = `<div class="wp-res" aria-live="polite"><span class="glbl">Entfernung</span><b class="wp-km ${wpCls(rv.pts)}">${rv.none ? "–" : `<span>${esc(wpKmTxt(rv.km))}</span>`}</b><span class="rb-praise">${rv.none ? "Zeit abgelaufen – kein Pin gesetzt" : wpPraise(rv.pts)}</span>
      <span class="rb-pts"><b><span>${fmt(rv.pts)}</span></b> Punkte${rv.shown > WP_FREE ? ` · <span>${fmt(rv.geo)}</span> × <span>${wpFactor(rv.shown)}</span> % (Hinweise)` : ""}</span>
      <div class="wp-place"><b>${esc(P.n)}</b><span>${esc(P.l)} · ${esc(P.k)}</span></div>
      <p class="wp-fact"><b>Wusstest du?</b> ${esc(P.f)}</p>
      <a class="rb-link" href="${esc(P.s)}" target="_blank" rel="noopener noreferrer">Quelle ansehen ↗</a>
      <button class="btn primary rb-submit" type="button" data-wp="next">${WP.mode === "endless" ? "Nächster Ort" : last ? "Ergebnis" : "Weiter"}</button>
      ${WP.mode === "endless" ? `<button class="btn" type="button" data-wp="stop">Endlos beenden</button>` : ""}</div>`;
  } else {
    side = `<span class="glbl">Hinweise <small class="wp-hc"><span>${shown}</span>/<span>${P.h.length}</span></small></span>${wpHintsHtml(P, shown, false)}
      <button class="btn rb-hbtn" type="button" data-wp="hint" ${shown >= P.h.length ? "disabled" : ""}><span>Nächster Hinweis</span><small>−${WP_COST} %</small></button>
      <span class="rb-max">Maximal <b id="wpmax">${fmt(Math.round(WP_MAX * fac / 100))}</b> Punkte${fac < 100 ? ` · <span>${fac}</span> %` : ""}</span>`;
  }
  const jump = rv ? "" : `<form class="wp-jump" data-wpf="jump" autocomplete="off"><label class="sr" for="wpjump">Karte zu einem Land bewegen</label><input id="wpjump" class="qz-in" type="search" enterkeyhint="go" placeholder="Karte zu Land springen, z. B. Peru" value="${esc(WP.jump)}"><button class="btn" type="submit">Zeigen</button><small id="wpjr" class="wp-jr" aria-live="polite"></small></form>`;
  box.innerHTML = `${head}${top}${WP.mode === "duel" ? wpDuelBar() : ""}
    <div class="rb-topbar wp-info"><span class="sz-round">${lbl}</span><span class="rb-chip d${P.d}"><i></i>${WP_DIF[P.d]}</span>${WP.mode === "daily" || WP.mode === "endless" ? wpBlitzBtn(lockB) : ""}${wpBlitz() && !rv ? `<span class="rb-timer" id="wpt" aria-live="off">${Math.max(0, WP_BLITZ - (WP.t0 ? Math.floor((Date.now() - WP.t0) / 1000) : 0))} s</span>` : ""}<span class="wp-tot">Summe <b><span>${fmt(tot)}</span></b>${n ? ` / <span>${fmt(n * WP_MAX)}</span>` : ""}</span></div>
    ${!rv && !(api.store().seen && api.store().seen.weltpin) ? `<p class="w1tip wp-first">So geht's: Hinweise lesen, auf die Karte tippen, Pin bestätigen. Je näher, desto mehr Punkte (bis <span>${fmt(WP_MAX)}</span>). Jeder weitere Hinweis kostet ${WP_COST} %.</p>` : ""}
    <div class="rb-wrap wp-wrap${rv ? " rv" : ""}"><div class="wp-mapcol">${wpMapHtml(P, rv)}${jump}
      ${rv ? "" : `<div class="wp-go"><button class="btn primary rb-submit" id="wpgo" type="button" data-wp="go" ${WP.pin ? "" : "disabled"}>📍 Pin bestätigen</button></div>`}</div>
    <div class="rb-side wp-side">${side}</div></div>
    ${rv ? `<div class="wp-allh"><span class="glbl">Alle Hinweise</span>${wpHintsHtml(P, rv.shown, true)}</div>` : ""}
    <p class="wdnote">Tipp: Ziehen = verschieben · zwei Finger / Mausrad = zoomen · Enter = bestätigen · Hinweise kosten Punkte, sonst nichts.</p>`;
  wpWireMap(); if (!rv) wpTick();
}
function wpRenderEnd(box, st, head, top) {
  const tot = wpSum(st.s), isDaily = WP.mode === "daily", R = wpRounds();
  if (WP.mode === "endless") { const E = wpEnd(); box.innerHTML = `${head}${top}<div class="wdend"><div>Endlos beendet</div><b class="w"><span>${fmt(tot)}</span> Punkte</b><span class="rb-ex">${st.s.length === 1 ? "1 Ort" : `<span>${st.s.length}</span> Orte`} · Ø <b><span>${fmt(Math.round(tot / Math.max(1, st.s.length)))}</span></b></span>
    <div class="rcard"><div class="statrow"><div><b>${fmt(E.n)}</b><span>Orte gesamt</span></div><div><b>${E.n ? fmt(Math.round(E.sum / E.n)) : "–"}</b><span>Ø Punkte</span></div><div><b>${fmt(E.best)}</b><span>Bestwert</span></div></div></div>
    <div class="wdbar"><button class="btn primary" type="button" data-wpm="endless">Nochmal endlos</button><button class="btn" type="button" data-wpm="daily">Tagesrätsel</button></div><small class="rb-cd">Endlos zählt nicht für die Serie</small></div>`; return; }
  const blocks = st.s.map((p, i) => { const P = WP.d.places[R[i]]; return P ? `<span class="rb-block ${wpCls(p)}"><small>${esc(P.n)}</small><b>${fmt(p)}</b><small><span>${fmt(st.k[i])}</span> km</small></span>` : ""; }).join("");
  if (WP.mode === "duel") { box.innerHTML = `${head}${top}${wpDuelBar() || ""}<div class="wdend"><div>Deine Runde</div><b class="w"><span>${fmt(tot)}</span> / ${fmt(25000)}</b><div class="rb-blocks">${blocks}</div>${wpDuelEndBtns()}</div>`; return; }
  box.innerHTML = `${head}${top}<div class="wdend"><div>${isDaily ? "Dein Tagesergebnis" : `Archiv: ${esc(rbDateFmt(WP.date))}`}</div><b class="w"><span>${fmt(tot)}</span> / ${fmt(25000)}</b>
    <div class="wp-emo" aria-hidden="true">${st.s.map(wpBlock).join("")}</div><div class="rb-blocks">${blocks}</div>
    <div class="wdbar">${isDaily ? `<button class="btn primary" type="button" data-wp="share"><i class="w2i" style="--i:var(--w2-share2)" aria-hidden="true"></i>${canShareOut() ? "Ergebnis teilen" : "Ergebnis kopieren"}</button><button class="btn" type="button" data-w2img="wp"><i class="w2i" style="--i:var(--w2-export)" aria-hidden="true"></i>Als Bild</button>` : ""}<button class="btn" type="button" data-wpm="endless">Endlos</button><button class="btn" type="button" data-wpm="archive">Archiv</button><button class="btn" type="button" data-wpm="duel">1 gegen 1</button></div>
    ${isDaily ? scoreCardHtml(WPS().days, "Neue Orte in") : `<small class="rb-cd">Archiv zählt nicht für die Serie</small>`}${suggestHtml(3, "weltpin")}</div>`;
}
function wpRenderArchive(box) {
  const rows = []; for (let k = 1; k <= 30; k++) { const d = dayIndex(api.today()) - k; if (d < 0) break; const date = dateOfDay(d), A = (WPS().arch || {})[date], done = A && A.done;
    rows.push(`<button type="button" class="rb-arow" data-wp="arch" data-date="${date}"><span>${esc(rbDateFmt(date))}</span><small class="${done ? "ok" : ""}">${done ? `${fmt(wpSum(A.s))} / ${fmt(25000)}` : A && A.s.length ? `${A.s.length} / 5 gespielt` : "offen"}</small></button>`); }
  box.innerHTML = `<div class="wdhead"><h2>Weltpin</h2><p>Archiv: die Orte der letzten 30 Tage – zum Nachspielen, ohne Serie.</p></div>
    <div class="rb-topbar">${wpSeg()}<button class="btn sz-qbtn" type="button" data-wp="help" aria-label="Hilfe" aria-expanded="${!!WP.help}">?</button></div>${WP.help ? wpHelpHtml() : ""}
    <div class="rb-arch">${rows.join("") || `<span class="rb-ex">Noch kein Archiv – komm morgen wieder.</span>`}</div>`;
}
function wpRenderDuelHome(box) {
  const inRoom = LV.room && LV.lobby;
  box.innerHTML = `<div class="wdhead"><h2>Weltpin</h2><p>1 gegen 1 mit einem Freund: ihr spielt gleichzeitig dieselben 5 Orte und seht den Punktestand des anderen (ohne Lösung). Mehr Punkte gewinnt, bei Gleichstand die kürzere Zeit.</p></div>
    <div class="rb-topbar">${wpSeg()}<button class="btn sz-qbtn" type="button" data-wp="help" aria-label="Hilfe" aria-expanded="${!!WP.help}">?</button></div>${WP.help ? wpHelpHtml() : ""}
    <div class="wdend wp-dh"><ol class="wp-steps"><li>${inRoom ? "Du bist schon in einem Live-Raum." : "Raum erstellen und den Einladungslink an deinen Freund schicken."}</li><li>Im Raum ist „Weltpin-Duell“ schon ausgewählt – der Gastgeber startet.</li><li>Nach dem Duell: „Revanche“ startet 5 neue Orte.</li></ol>
    <div class="wdbar"><button class="btn primary" type="button" data-wp="room">${inRoom ? "Zum Live-Raum" : "Raum erstellen"}</button>${inRoom ? "" : `<button class="btn" type="button" data-lv="home">Raum beitreten</button>`}</div></div>`;
}
// ---------- 1 gegen 1 im Live-Raum (Gastgeber prüft und verteilt den Stand) ----------
const WP_LSEL = () => ({ act: "wp", rounds: 4, game: "naruto", mode: "klassisch", amode: "tdm", map: "arena", tbots: 0, lbots: 0, tmode: "standard", lmode: "klassisch" });
function wpToRoom() {
  if (LV.room && LV.lobby) { LV.lsel = Object.assign(LV.lsel || WP_LSEL(), { act: "wp" }); api.setView("live"); return render(false); }
  liveEnter(newRoomId(), true); LV.lsel = WP_LSEL();
}
function wpLiveStartX() {
  if (!amHost() || !LV.lobby) return;
  const r = { seed: newRoomId(), st: hostNow() + 2500, names: Object.fromEntries(lvPlayers().map(([id, x]) => [id, [x.name, x.av]])), res: {}, done: false };
  LV.wp = r; LV.t.send("wp", r); wpLiveStateX(r);
}
function wpLiveStateX(d) {
  if (!d || typeof d !== "object") return;
  if (d.closed) { LV.wp = null; if (api.view() === "weltpin" && WP.mode === "duel") { WP.duel = null; WP.mode = "daily"; api.setView(LV.room ? "live" : "weltpin"); render(false); } return; }
  if (typeof d.seed !== "string" || !/^[A-Z0-9]{6,10}$/.test(d.seed) || !d.names || typeof d.names !== "object" || !d.res || typeof d.res !== "object") return;
  const first = !LV.wp || LV.wp.seed !== d.seed || !WP.duel || WP.duel.seed !== d.seed; LV.wp = d;
  if (first) {
    WP.duel = { seed: d.seed, st: { s: [], k: [], h: [], done: false }, t0: Date.now() + Math.max(0, (+d.st || 0) - hostNow()) };
    const go = () => { WP.mode = "duel"; WP.view = "play"; WP.rounds = null; wpNewRound(); api.setView("weltpin"); render(false); try { window.scrollTo({ top: 0 }); } catch (e) {} };
    if (WP.d) go(); else wpLoad().then(go);
    return;
  }
  if (d.done && WP.duel && !WP.duel.fin && LV.t) { WP.duel.fin = 1; const rk = wpRank(d); if (rk[0] && rk[0][0] === LV.t.self && rk.length > 1) { w2Win(); toast("Du gewinnst das Weltpin-Duell!"); } }
  const bar = $("#wpduel"); if (bar && api.view() === "weltpin") bar.outerHTML = wpDuelBar(); else if (api.view() === "weltpin" && WP.mode === "duel" && WP.duel && WP.duel.st.done) render(false);
  if (api.view() === "weltpin" && WP.mode === "duel" && WP.duel && WP.duel.st.done) { const b = $("#wpdbtn"); if (b) b.outerHTML = wpDuelEndBtns(); }
}
function wpLiveProgress() {
  if (!LV.t || !WP.duel) return; const st = WP.duel.st, msg = { seed: WP.duel.seed, r: st.s.length, p: wpSum(st.s), ms: st.done ? Math.max(0, Date.now() - WP.duel.t0) : 0 };
  if (amHost()) wpHostProgressX(LV.t.self, msg); else LV.t.send("wp:p", msg, LV.host);
}
function wpHostProgressX(from, d) {
  const r = LV.wp; if (!amHost() || !r || r.done || !d || d.seed !== r.seed || !r.names[from]) return;
  const n = Math.max(0, Math.min(5, Math.floor(+d.r || 0))), p = Math.max(0, Math.min(n * WP_MAX, Math.round(+d.p || 0))), ms = Math.max(0, Math.min(36e5, Math.round(+d.ms || 0))), old = r.res[from];
  if (old && n < old.r) return;
  r.res[from] = { r: n, p, ms: n >= 5 ? ms : 0 };
  const ids = Object.keys(r.names).filter(id => LV.lobby && LV.lobby.p[id]); if (ids.length && ids.every(id => r.res[id] && r.res[id].r >= 5)) r.done = true;
  LV.t.send("wp", r); wpLiveStateX(r);
}
function wpRank(r) { return Object.keys(r.names).map(id => [id, r.res[id] || { r: 0, p: 0, ms: 0 }]).sort((a, b) => (b[1].p - a[1].p) || ((a[1].ms || 9e9) - (b[1].ms || 9e9))); }
function wpDuelEndBtns() {
  const r = LV.wp, done = r && WP.duel && r.seed === WP.duel.seed && r.done;
  return `<div class="wdbar" id="wpdbtn">${!done ? `<span class="rb-ex">Warte auf deinen Gegner …</span>` : amHost() ? `<button class="btn primary" type="button" data-wp="rematch">Revanche</button>` : `<span class="rb-ex">Revanche startet der Gastgeber</span>`}<button class="btn" type="button" data-lv="tolive">Zur Lobby</button></div>`;
}
// ---------- Teilen (ohne Lösung) ----------
function wpShareText() { const d = wpDay(); return `Super Daily Games · Weltpin #${api.day() + 1}\n${fmt(wpSum(d.s))}/${fmt(25000)} 📍${d.b ? " ⚡" : ""}\n${d.s.map(wpBlock).join("")}\n${SITE_URL}#spiel=weltpin`; }
document.addEventListener("submit", e => {
  const f = e.target.closest && e.target.closest("[data-wpf]"); if (!f) return; e.preventDefault();
  const q = $("#wpjump"), out = $("#wpjr"), el = $("#wpmap"); if (!q || !el) return; WP.jump = q.value;
  const c = wpMatchCountry(q.value); if (!c) { if (out) out.textContent = "Kein eindeutiges Land gefunden"; return; }
  const v = c.v; wpFit([[v[2], v[3]], [v[4], v[5]]], el); WP.vb.k /= 1.35; wpView(el); wpApply(); if (out) out.textContent = "Karte zeigt: " + v[0];
});
document.addEventListener("click", e => {
  const tb = e.target.closest("[data-wpb]"); if (tb) { if (tb.disabled) return; WPS().blitz = tb.dataset.wpb === "1" ? 1 : 0; save(); WP.t0 = 0; return render(false); }
  const t = e.target.closest("[data-wp],[data-wpm]"); if (!t || t.dataset.wp === "home") return;
  if (t.dataset.wpm) { const m = t.dataset.wpm; if (m === "archive") { WP.view = "archive"; return render(false); } if (m === "duel") { WP.view = "duel"; return render(false); } return wpSwitch(m === "endless" ? "endless" : "daily"); }
  const a = t.dataset.wp, el = $("#wpmap");
  if (a === "help") { WP.help = !WP.help; return render(false); }
  if (a === "hint") { const st = wpState(), R = wpRounds(); return st && wpHint(st, WP.d.places[R[st.s.length]]); }
  if (a === "go") return wpConfirm();
  if (a === "next") return wpNext();
  if (a === "stop") { const st = wpState(); wpNewRound(); if (!st.s.length) return wpSwitch("daily"); st.done = true; return render(false); }
  if (a === "arch") return wpSwitch("archive", t.dataset.date);
  if (a === "room") return wpToRoom();
  if (a === "rematch") { if (amHost()) wpLiveStartX(); return; }
  if (a === "share") return shareOut(wpShareText(), "Ergebnis kopiert");
  if ((a === "zin" || a === "zout" || a === "zreset") && el) { if (a === "zreset") wpView(el, true); else { WP.vb.k *= a === "zin" ? 1 / 1.6 : 1.6; wpView(el); } return wpApply(); }
});
addEventListener("keydown", e => {
  if (api.view() !== "weltpin" || WP.view !== "play" || !WP.d) return;
  if (e.target.closest && e.target.closest("textarea,select,input,[contenteditable]")) return;
  const m = $("#modal"); if (m && !m.hidden) return;
  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { if (WP.rev) { e.preventDefault(); return wpNext(); } if (WP.pin) { e.preventDefault(); return wpConfirm(); } }
});
window.__wp = { WP, WPS, wpRender, wpState, wpSetFor, wpPick, wpKm, wpGeo, wpPts, wpFactor, wpConfirm, wpNext, wpSwitch, wpSetPin, wpMatchCountry, wpNormA, wpShareText, wpRank, wpLoad, wpXY, wpLiveStartX, wpDay };   // für Tests
return { wpRender, wpLiveStartX, wpLiveStateX, wpHostProgressX };
};
