/* Puckout — screens and flow. */
(function () {
  "use strict";
  const D = window.PuckoutData, L = window.PuckoutLogic, RoadMap = window.PuckoutMap;
  const $ = id => document.getElementById(id);
  const SECS = D.CONFIG.secondsPerQuestion;
  const MAX_KM = D.STOPS[D.STOPS.length - 1].km;

  const today = L.irishDate();
  const roadNo = L.dayNumber(today);
  const todays = L.questionsFor(today);
  const KEY = "puckout:v1:" + today;

  // ---------- Saved state ----------
  let state = { answers: {}, started: {}, misses: {} };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.answers) state = Object.assign(state, s);
  } catch (e) { /* storage blocked: play without saving */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  const answered = () => todays.filter(id => state.answers[id]).length;
  const current = () => todays.find(id => !state.answers[id]) || null;
  const totalKm = () => todays.reduce((s, id) => s + ((state.answers[id] && state.answers[id].km) || 0), 0);
  const pct = s => s < 0.01 ? "<1%" : Math.round(s * 100) + "%";

  // Hook for real crowd counts. Return {entityId: count} for a question, or null.
  // Plug a backend in here (see README); built-in estimates are used until then.
  const crowdCounts = () => null;

  // ---------- Screens ----------
  const screens = ["intro", "hud", "question", "shotbar", "result", "fulltime"];
  function show(...ids) {
    screens.forEach(s => { $(s).hidden = !ids.includes(s); });
    document.querySelector(".fade-top").hidden = ids.includes("fulltime");
    document.body.classList.toggle("on-intro", ids.includes("intro"));
  }

  // Keep the pin in the open strip of map between the top card and the bottom one.
  let framing = [null, null];
  function frame(topId, bottomId) {
    framing = [topId, bottomId];
    const vh = window.innerHeight;
    const top = topId ? $(topId).getBoundingClientRect().bottom : 0;
    const bottom = bottomId ? $(bottomId).getBoundingClientRect().top : vh;
    RoadMap.setFocusY(Math.max(0.15, Math.min(0.85, (top + bottom) / 2 / vh)));
  }
  window.addEventListener("resize", () => frame(...framing));

  function renderHud() {
    const km = totalKm(), n = current();
    $("km").textContent = Math.round(km);
    $("pips").innerHTML = todays.map(id => {
      const a = state.answers[id];
      return `<span class="pip ${a ? a.tier : id === n ? "now" : ""}"></span>`;
    }).join("");
    $("qcount").textContent = n ? `Question ${todays.indexOf(n) + 1} of ${todays.length}` : "Full time";
    const next = L.nextStop(km);
    $("next-sign").hidden = !next;
    if (next) { $("next-name").textContent = next.name; $("next-km").textContent = next.km; }
  }

  // ---------- Intro ----------
  function renderIntro() {
    $("road-no").textContent = `Road #${roadNo}`;
    $("today-line").textContent = answered() ? `You're ${Math.round(totalKm())} km down today's road` : "Today: your club pitch to Croke Park";
    $("start").textContent = answered() ? "Back on the road" : "Start today's road";
    $("tier-table").innerHTML = D.TIERS.map((t, i) => {
      const range = t.max === Infinity ? `${Math.round(D.TIERS[i - 1].max * 100)}% or more give it` : i === 0 ? `Under ${Math.round(t.max * 100)}% give it` : `${Math.round(D.TIERS[i - 1].max * 100)}–${Math.round(t.max * 100)}%`;
      return `<tr><td><b>${t.name}</b></td><td class="small">${range}</td><td>+${t.km} km</td></tr>`;
    }).join("") + `<tr><td><b>Wide</b></td><td class="small">Out of time</td><td>+0 km</td></tr>`;
    show("intro");
    frame(null, "intro-dock");
  }

  // ---------- Asking ----------
  let timer = null, activeQ = null, deadline = 0;
  function ask(qid) {
    activeQ = qid;
    const q = L.QBY[qid];
    $("q-cat").textContent = q.cat;
    $("q-text").textContent = q.text;
    $("q-hint").textContent = q.hint || "";
    $("guess").value = "";
    setMsg("Wrong answers don't cost anything.");
    renderMisses();
    renderHud();
    show("hud", "question", "shotbar");
    frame("question", "shotbar");
    if (!state.started[qid]) { state.started[qid] = Date.now(); save(); }
    deadline = state.started[qid] + SECS * 1000;
    tick();
    clearInterval(timer);
    timer = setInterval(tick, 100);
    try { $("guess").focus({ preventScroll: true }); } catch (e) {}
  }
  function tick() {
    const left = Math.max(0, deadline - Date.now());
    const secs = Math.ceil(left / 1000);
    $("clock-n").textContent = secs;
    $("clock-fg").style.strokeDashoffset = String(119.4 * (1 - left / (SECS * 1000)));
    document.querySelector(".clock").classList.toggle("low", secs <= 5);
    if (left <= 0) finish(activeQ, null);
  }
  function setMsg(text, err) { const m = $("msg"); m.textContent = text; m.classList.toggle("err", !!err); }
  function renderMisses() {
    const list = state.misses[activeQ] || [];
    $("misses").innerHTML = list.map(id => `<span>${esc(L.EBY[id].label)}</span>`).join("");
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function shake() {
    const f = $("shoot");
    f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
  }

  $("shoot").addEventListener("submit", ev => {
    ev.preventDefault();
    if (!activeQ) return;
    const raw = $("guess").value.trim();
    if (!raw) return;
    const id = L.identify(raw);
    const q = L.QBY[activeQ];
    if (!id) { setMsg(`We don't recognise "${raw}". Check the spelling.`, true); shake(); return; }
    if (q.a[id] === undefined) {
      const m = state.misses[activeQ] = state.misses[activeQ] || [];
      if (!m.includes(id)) { m.push(id); save(); }
      setMsg(`${L.EBY[id].label} isn't on the list. Keep going.`, true);
      renderMisses(); shake();
      $("guess").select();
      return;
    }
    finish(activeQ, id, raw);
  });

  function finish(qid, entity, raw) {
    if (!qid || state.answers[qid]) return;
    clearInterval(timer);
    activeQ = null;
    let entry;
    if (!entity) entry = { entity: null, raw: "", tier: "wide", share: 0, km: 0 };
    else {
      const share = L.shares(qid, crowdCounts(qid))[entity];
      const t = L.tierFor(share);
      entry = { entity, raw, tier: t.id, share, km: t.km };
    }
    state.answers[qid] = entry;
    save();
    showResult(qid);
    renderHud();
    RoadMap.travelTo(totalKm(), entry.km ? 1800 : 400);
  }

  function showResult(qid) {
    const a = state.answers[qid], q = L.QBY[qid], t = L.tierById(a.tier);
    $("badge").className = "badge " + a.tier;
    $("badge").textContent = a.entity ? t.name : "Out of time";
    $("gain").textContent = `+${a.km} km`;
    $("said").textContent = a.entity
      ? `${pct(a.share)} of correct answers were ${L.EBY[a.entity].label}.`
      : "The clock beat you. Here's what counted.";
    const sh = L.shares(qid, crowdCounts(qid));
    const rows = Object.entries(sh).sort((x, y) => y[1] - x[1]);
    const max = rows[0][1];
    // Top five plus yours; the rest behind a toggle so the map stays visible on phones.
    const shown = rows.filter(([id], i) => i < 5 || id === a.entity);
    const row = ([id, s]) =>
      `<li class="${id === a.entity ? "you" : ""}"><span class="nm">${esc(L.EBY[id].label)}</span><span class="bar"><i style="width:${(s / max * 100).toFixed(1)}%"></i></span><span class="pct">${pct(s)}</span></li>`;
    $("dist").innerHTML = shown.map(row).join("") +
      (rows.length > shown.length ? `<li class="more"><button type="button" id="show-all">Show all ${rows.length} answers</button></li>` : "");
    const all = $("show-all");
    if (all) all.addEventListener("click", () => { $("dist").innerHTML = rows.map(row).join(""); });
    $("fact").textContent = q.fact;
    $("next").textContent = current() ? "Next question" : "Full time";
    show("hud", "question", "result");
    frame("question", "result");
    try { $("next").focus({ preventScroll: true }); } catch (e) {}
  }
  $("next").addEventListener("click", () => { const n = current(); n ? ask(n) : fullTime(); });

  // ---------- Full time ----------
  function fullTime() {
    const km = totalKm(), stop = L.stopFor(km);
    $("ft-road").textContent = `Road #${roadNo}`;
    $("ft-title").textContent = km >= MAX_KM ? "You made it to Croke Park. All-Ireland final day." :
      stop.km === 0 ? "You didn't get far past the club gate today." : `You reached the ${stop.name}.`;
    $("ft-km").textContent = Math.round(km);
    $("ft-list").innerHTML = todays.map((id, i) => {
      const a = state.answers[id], t = L.tierById(a.tier);
      const ans = a.entity ? `${L.EBY[a.entity].label} · ${pct(a.share)}` : "Out of time";
      return `<li><div><div class="q">${i + 1}. ${esc(L.QBY[id].text)}</div><div class="a">${esc(ans)}</div></div><div class="t ${a.tier}">${a.entity ? t.name : "Wide"}<br>+${a.km} km</div></li>`;
    }).join("");
    $("share-text").textContent = shareText();
    $("copy-msg").textContent = "";
    show("fulltime");
    frame(null, null);
  }
  function shareText() {
    const km = Math.round(totalKm()), stop = L.stopFor(km);
    const marks = todays.map(id => L.tierById(state.answers[id].tier).mark).join("");
    return `Puckout #${roadNo} · ${km} km\n${km >= MAX_KM ? "Made it to Croke Park" : "Reached: " + stop.name}\n${marks}`;
  }
  $("copy").addEventListener("click", () => {
    const txt = shareText();
    const fallback = () => {
      try { const r = document.createRange(); r.selectNodeContents($("share-text")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
      $("copy-msg").textContent = "Select the text above to copy it";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => { $("copy-msg").textContent = "Copied"; }, fallback);
    } else fallback();
  });

  $("start").addEventListener("click", () => { const n = current(); n ? ask(n) : fullTime(); });

  // ---------- Boot ----------
  RoadMap.init($("map"), $("marks"), D.STOPS);
  const startKm = totalKm();
  RoadMap.jumpTo(startKm);
  if (!current()) fullTime();
  else {
    renderIntro();
    // First visit of the day: show where the road ends, then come back to the club.
    if (!answered()) { RoadMap.jumpTo(0); RoadMap.pan(MAX_KM, 0, 2600); }
  }
})();
