/* Puckout — screens and flow. */
(function () {
  "use strict";
  const D = window.PuckoutData, L = window.PuckoutLogic, R = window.PuckoutRoute, RoadMap = window.PuckoutMap;
  const POI = window.PuckoutPois, GEO = window.PuckoutGeo;
  const $ = id => document.getElementById(id);
  const SECS = D.CONFIG.secondsPerQuestion;
  const MAX = D.CONFIG.maxPoints;

  const HOME_KEY = "puckout:home", ROUND_KEY = "puckout:round", SEEN_KEY = "puckout:seen";

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: play without saving */ } }
  };

  // ---------- Rounds ----------
  // Play as many rounds as you like. Each round has its own seven questions
  // (recently played ones go to the back of the queue) and its own road.
  let round = store.get(ROUND_KEY) || 1;
  const seed = () => "round-" + round;
  const roundKey = () => "puckout:v3:" + round;
  let todays = [];
  let state;
  const freshState = () => ({ answers: {}, started: {}, misses: {}, questions: null });
  const save = () => store.set(roundKey(), state);
  let home = store.get(HOME_KEY);
  let road = null;
  function loadRound() {
    state = Object.assign(freshState(), store.get(roundKey()) || {});
    pickQuestions();
  }
  // Six shared questions plus one on the player's own county's club championship.
  // Fixed for the round once picked, so changing club mid-round keeps your answers.
  function pickQuestions() {
    if (state.questions && !answeredIn(state.questions)) state.questions = null;
    if (!state.questions) {
      state.questions = L.questionsFor(seed(), home && home.county, store.get(SEEN_KEY) || []);
      save();
    }
    todays = state.questions;
  }
  const answeredIn = qs => qs.some(id => state.answers[id]);
  function newRound() {
    const seen = (store.get(SEEN_KEY) || []).concat(todays).slice(-70);
    store.set(SEEN_KEY, seen);
    round += 1;
    store.set(ROUND_KEY, round);
    state = freshState();
    pickQuestions();
    road = R.makeRoad(home, seed());
    RoadMap.setRoad(road);
    RoadMap.frac = 0;
    renderIntro();
    RoadMap.showOverview(1200);
  }
  loadRound();

  const answered = () => todays.filter(id => state.answers[id]).length;
  const current = () => todays.find(id => !state.answers[id]) || null;
  const points = () => todays.reduce((s, id) => s + ((state.answers[id] && state.answers[id].pts) || 0), 0);
  const frac = () => Math.min(1, points() / MAX);
  const kmDone = () => road ? frac() * road.total : 0;
  const pct = s => s < 0.01 ? "<1%" : Math.round(s * 100) + "%";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Hook for real crowd counts. Return {entityId: count} for a question, or null.
  const crowdCounts = () => null;

  // ---------- Screens ----------
  const screens = ["intro", "hud", "question", "shotbar", "result", "fulltime"];
  function show(...ids) {
    screens.forEach(s => { $(s).hidden = !ids.includes(s); });
    document.querySelector(".fade-top").hidden = ids.includes("fulltime");
    document.body.classList.toggle("on-intro", ids.includes("intro"));
  }
  // Keep the pin (or the overview) in the open stretch of map between the cards.
  let framing = [null, null, null, 0.5];
  // `bias` places the pin within the open strip: 0.5 is the middle; higher
  // sits it lower, leaving room above for the footballer and the ball's flight.
  function frame(topId, bottomId, leftId, bias = 0.5) {
    framing = [topId, bottomId, leftId, bias];
    const vw = window.innerWidth, vh = window.innerHeight;
    const top = topId ? $(topId).getBoundingClientRect().bottom : 0;
    const bottom = bottomId ? $(bottomId).getBoundingClientRect().top : vh;
    const left = leftId ? $(leftId).getBoundingClientRect().right : 0;
    RoadMap.setFocus((left + vw) / 2 / vw, Math.max(0.15, Math.min(0.88, (top + (bottom - top) * bias) / vh)), { w: vw - left, h: Math.max(120, bottom - top) });
  }
  window.addEventListener("resize", () => frame(...framing));
  const sideBySide = () => window.innerWidth >= 960;

  // ---------- Home club ----------
  function setHome(h) {
    home = h;
    store.set(HOME_KEY, h);
    pickQuestions();
    road = R.makeRoad(home, seed());
    RoadMap.setRoad(road);
    RoadMap.frac = frac();
    renderIntro();
    RoadMap.showOverview(1200);
  }

  const searchIndex = [];
  function words(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  }
  function buildIndex() {
    if (searchIndex.length) return;
    const C = window.PuckoutClubs, P = window.PuckoutPlaces;
    if (C) C.clubs.forEach(([name, ci, lat, lon]) => searchIndex.push({ name, county: C.counties[ci], lat, lon, kind: "club", key: L.norm(name), words: words(name) }));
    if (P) P.places.forEach(([name, ci, lat, lon]) => searchIndex.push({ name, county: P.counties[ci], lat, lon, kind: "town", key: L.norm(name), words: words(name) }));
  }
  function search(q) {
    buildIndex();
    const qw = words(q);
    if (!qw.length) return [];
    const full = L.norm(q);
    const hits = [];
    for (const it of searchIndex) {
      let score = 0, ok = true;
      for (const w of qw) {
        const i = it.words.findIndex(x => x.startsWith(w));
        if (i === -1) { if (w.length >= 3 && it.key.includes(w)) score += 1; else { ok = false; break; } }
        else score += i === 0 ? 4 : 2;
      }
      if (!ok) continue;
      if (it.key === full) score += 6;
      if (it.kind === "club") score += 3;
      score -= it.name.length / 60;
      hits.push({ it, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 8).map(h => h.it);
  }

  let results = [], active = -1;
  function renderResults() {
    const ul = $("club-results");
    ul.innerHTML = results.map((r, i) =>
      `<li role="option" id="opt-${i}" aria-selected="${i === active}" data-i="${i}" class="${i === active ? "on" : ""}"><b>${esc(r.name)}</b><span>${r.kind === "club" ? "Club" : "Town"} · ${esc(r.county)}</span></li>`
    ).join("");
    ul.hidden = !results.length;
    $("club-q").setAttribute("aria-expanded", results.length ? "true" : "false");
    $("club-empty").hidden = !($("club-q").value.trim().length >= 2 && !results.length);
    if (active >= 0) $("club-q").setAttribute("aria-activedescendant", "opt-" + active);
    else $("club-q").removeAttribute("aria-activedescendant");
  }
  $("club-q").addEventListener("input", () => { results = search($("club-q").value); active = results.length ? 0 : -1; renderResults(); });
  $("club-q").addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown") { active = Math.min(results.length - 1, active + 1); renderResults(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { active = Math.max(0, active - 1); renderResults(); ev.preventDefault(); }
    else if (ev.key === "Enter" && active >= 0) { choose(results[active]); ev.preventDefault(); }
  });
  $("club-results").addEventListener("click", ev => { const li = ev.target.closest("li"); if (li) choose(results[+li.dataset.i]); });
  function choose(r) {
    results = []; renderResults();
    $("club-q").value = "";
    setHome({ name: r.name, county: r.county, lat: r.lat, lon: r.lon, kind: r.kind });
  }
  $("change-club").addEventListener("click", () => {
    $("picked").hidden = true; $("picker").hidden = false; $("start").hidden = true; $("road-line").hidden = true;
    frame("masthead", "intro-dock");
    try { $("club-q").focus(); } catch (e) {}
  });

  // ---------- HUD ----------
  function renderHud() {
    const n = current(), done = kmDone();
    $("km").textContent = Math.round(done);
    $("pips").innerHTML = todays.map(id => {
      const a = state.answers[id];
      return `<span class="pip ${a ? a.tier : id === n ? "now" : ""}"></span>`;
    }).join("");
    $("qcount").textContent = n ? `Question ${todays.indexOf(n) + 1} of ${todays.length}` : "Full time";
    const next = road && road.marks.find(m => m.km > done + 0.01);
    $("next-sign").hidden = !next;
    if (next) { $("next-name").textContent = next.name; $("next-km").textContent = Math.max(1, Math.round(next.km - done)); }
  }

  // ---------- Intro ----------
  function renderIntro() {
    $("road-no").textContent = `Road #${round}`;
    $("tier-table").innerHTML = D.TIERS.map((t, i) => {
      const range = t.max === Infinity ? `${Math.round(D.TIERS[i - 1].max * 100)}% or more give it` : i === 0 ? `Under ${Math.round(t.max * 100)}% give it` : `${Math.round(D.TIERS[i - 1].max * 100)}–${Math.round(t.max * 100)}%`;
      return `<tr><td><b>${t.name}</b></td><td class="small">${range}</td><td>${Math.round(t.pts / MAX * 1000) / 10}% of the road</td></tr>`;
    }).join("");
    const has = !!(home && road);
    $("picker").hidden = has; $("picked").hidden = !has; $("start").hidden = !has; $("road-line").hidden = !has;
    if (has) {
      $("home-name").textContent = home.name;
      $("home-county").textContent = `${home.kind === "club" ? "Club" : "Town"} · ${home.county}`;
      const via = road.marks.slice(1, -1).map(m => m.name);
      $("road-line").innerHTML = `This road: <b>${Math.round(road.total)} km</b> to Croke Park, by way of ${esc(via.join(", "))}.`;
      $("start").textContent = answered() ? "Back on the road" : "Start the road";
      $("today-line").textContent = answered() ? `You're ${Math.round(kmDone())} km down this road` : "From your club to Croke Park";
      $("new-road").hidden = !answered();
    } else {
      $("today-line").textContent = "From your club to Croke Park";
    }
    show("intro");
    frame("masthead", "intro-dock");
  }

  // ---------- Asking ----------
  let timer = null, activeQ = null, deadline = 0;
  function ask(qid) {
    activeQ = qid;
    const q = L.QBY[qid];
    $("q-cat").textContent = q.cat === "Your county" ? `Your county · ${q.county}` : q.cat;
    $("q-text").textContent = q.text;
    $("q-hint").textContent = q.hint || "";
    $("guess").value = "";
    setMsg("Wrong answers don't cost anything.");
    renderMisses();
    renderHud();
    show("hud", "question", "shotbar");
    frame("question", "shotbar", null, 0.68);
    RoadMap.frac = frac(); // in case the last move was cut short by a quick click
    RoadMap.zoomToPin(900);
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
  function shake() { const f = $("shoot"); f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake"); }

  $("shoot").addEventListener("submit", ev => {
    ev.preventDefault();
    if (!activeQ) return;
    const raw = $("guess").value.trim();
    if (!raw) return;
    const id = L.identify(raw, activeQ);
    const q = L.QBY[activeQ];
    if (!id) {
      const c = L.candidates(raw, activeQ);
      if (c.length > 1) setMsg(`More than one fits: ${c.slice(0, 3).join(", ")}${c.length > 3 ? "…" : ""}. Add the first name.`, true);
      else setMsg(`We don't recognise "${raw}". Check the spelling.`, true);
      shake(); return;
    }
    if (q.a[id] === undefined) {
      const m = state.misses[activeQ] = state.misses[activeQ] || [];
      if (!m.includes(id)) { m.push(id); save(); }
      setMsg(`${L.EBY[id].label} isn't on the list. Keep going.`, true);
      kickFrom("wide", activeQ);
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
    const before = kmDone();
    let entry;
    if (!entity) entry = { entity: null, raw: "", tier: "wide", share: 0, pts: 0 };
    else {
      const share = L.shares(qid, crowdCounts(qid))[entity];
      const t = L.tierFor(share);
      entry = { entity, raw, tier: t.id, share, pts: t.pts };
    }
    state.answers[qid] = entry;
    save();
    const after = kmDone();
    const passed = road ? road.marks.filter((m, i) => i > 0 && m.km > before + 0.01 && m.km <= after + 0.01) : [];
    showResult(qid, after - before, passed);
    renderHud();
    if (entry.entity) {
      kickFrom(entry.tier, qid);
      setTimeout(() => RoadMap.travelTo(frac(), 2000), 380); // the pin sets off as the ball is struck
    } else RoadMap.travelTo(frac(), 500);
  }

  function showResult(qid, gained, passed) {
    const a = state.answers[qid], q = L.QBY[qid], t = L.tierById(a.tier);
    $("badge").className = "badge " + a.tier;
    $("badge").textContent = a.entity ? t.name : "Out of time";
    $("gain").textContent = `+${Math.round(gained)} km`;
    $("said").textContent = a.entity
      ? `${pct(a.share)} of correct answers were ${L.EBY[a.entity].label}.`
      : "The clock beat you. Here's what counted.";
    $("postcards").innerHTML = passed.map(m =>
      `<div class="postcard pc-${m.kind}"><span class="pc-kind">${m.kind === "croker" ? "You made it" : "You passed"}</span><b>${esc(m.name)}</b><p>${esc(m.line)}</p></div>`
    ).join("");
    const sh = L.shares(qid, crowdCounts(qid));
    const rows = Object.entries(sh).sort((x, y) => y[1] - x[1]);
    const max = rows[0][1];
    const shown = rows.filter(([id], i) => i < 5 || id === a.entity);
    const row = ([id, s]) =>
      `<li class="${id === a.entity ? "you" : ""}"><span class="nm">${esc(L.EBY[id].label)}${L.EBY[id].county && !q.county ? `<small> ${esc(L.EBY[id].county)}</small>` : ""}</span><span class="bar"><i style="width:${(s / max * 100).toFixed(1)}%"></i></span><span class="pct">${pct(s)}</span></li>`;
    $("dist").innerHTML = shown.map(row).join("") +
      (rows.length > shown.length ? `<li class="more"><button type="button" id="show-all">Show all ${rows.length} answers</button></li>` : "");
    const all = $("show-all");
    if (all) all.addEventListener("click", () => { $("dist").innerHTML = rows.map(row).join(""); });
    $("fact").textContent = q.fact;
    $("next").textContent = current() ? "Next question" : "Full time";
    show("hud", "question", "result");
    frame("question", "result", null, 0.72);
    try { $("next").focus({ preventScroll: true }); } catch (e) {}
  }
  $("next").addEventListener("click", () => { const n = current(); n ? ask(n) : fullTime(); });

  // The cartoon footballer kicks from wherever the pin is on screen.
  // Hurling questions get a hurler and sliotar; everything else a footballer.
  const isHurling = L.isHurling;
  function kickFrom(tier, qid) {
    if (!window.PuckoutKick || !RoadMap.pinEl) return;
    const r = RoadMap.pinEl.getBoundingClientRect();
    window.PuckoutKick.play(tier, { x: r.left - 26, y: r.top - 14 }, home && home.county, isHurling(qid) ? "hurling" : "football");
  }

  // ---------- Full time ----------
  function reached() {
    const done = kmDone();
    let m = road.marks[0];
    for (const x of road.marks) if (x.km <= done + 0.01) m = x;
    return m;
  }
  function fullTime() {
    const done = kmDone(), m = reached(), made = frac() >= 1;
    $("ft-road").textContent = `Road #${round}`;
    $("ft-title").textContent = made ? "You made it to Croke Park. All-Ireland final day." :
      m === road.marks[0] ? `You didn't get far past ${home.name} this time.` : `You got as far as ${m.name}.`;
    $("ft-km").innerHTML = `<b>${Math.round(done)}</b> of ${Math.round(road.total)} km from ${esc(home.name)}`;
    $("ft-list").innerHTML = todays.map((id, i) => {
      const a = state.answers[id], t = L.tierById(a.tier);
      const ans = a.entity ? `${L.EBY[a.entity].label} · ${pct(a.share)}` : "Out of time";
      return `<li><div><div class="q">${i + 1}. ${esc(L.QBY[id].text)}</div><div class="a">${esc(ans)}</div></div><div class="t ${a.tier}">${a.entity ? t.name : "Wide"}</div></li>`;
    }).join("");
    $("share-text").textContent = shareText();
    $("copy-msg").textContent = "";
    show("fulltime");
    if (sideBySide()) frame(null, null, "fulltime"); else frame(null, null);
    RoadMap.frac = frac();
    RoadMap.showOverview(1400);
  }
  function shareText() {
    const done = Math.round(kmDone()), m = reached();
    const marks = todays.map(id => L.tierById(state.answers[id].tier).mark).join("");
    const where = frac() >= 1 ? "Made it to Croke Park" : m === road.marks[0] ? "Still at the club gate" : `Got as far as ${m.name}`;
    return `Puckout road #${round} · ${home.name} to Croke Park\n${done} of ${Math.round(road.total)} km · ${where}\n${marks}`;
  }
  $("copy").addEventListener("click", () => {
    const txt = shareText();
    const fallback = () => {
      try { const r = document.createRange(); r.selectNodeContents($("share-text")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
      $("copy-msg").textContent = "Select the text above to copy it";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => { $("copy-msg").textContent = "Copied"; }, fallback);
    else fallback();
  });

  $("start").addEventListener("click", () => { if (!home) return; const n = current(); n ? ask(n) : fullTime(); });
  $("again").addEventListener("click", () => { clearInterval(timer); newRound(); });
  $("new-road").addEventListener("click", () => { clearInterval(timer); newRound(); });

  // ---------- Boot ----------
  if (home) road = R.makeRoad(home, seed());
  renderIntro();
  RoadMap.init($("map"), $("marks"), GEO, POI.POIS, POI.MOUNTAINS, POI.CROKER).then(() => {
    if (road) {
      RoadMap.setRoad(road);
      RoadMap.frac = frac();
      if (!current()) { fullTime(); return; }
      renderIntro();
      RoadMap.showOverview(0);
    } else {
      // No club picked yet: show the whole island
      RoadMap.cam = RoadMap.islandCam();
      RoadMap.draw();
    }
  });
})();
