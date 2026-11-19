/*
 * Party mode: a live room for friends. One player hosts a room with a
 * four-letter code; everyone else joins on their own phone. Everyone gets
 * the same seven questions at the same time, each racing from their own club
 * to Croke Park. Rarer answers go further, and if nobody else in the room
 * gave your answer you get a bonus.
 *
 * Runs over Supabase Realtime (broadcast + presence) on the same project as
 * the leaderboard; no database tables are needed. The host's browser runs
 * the game: it picks the questions, starts each one and reveals the results.
 * If the host leaves, the longest-standing player takes over.
 */
(function (root) {
  "use strict";
  const L = root.PuckoutLogic, R = root.PuckoutRoute, D = root.PuckoutData, Board = root.PuckoutBoard;
  const C = root.PuckoutConfig || {};
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js";
  const SECS = D.CONFIG.secondsPerQuestion;
  const MAX = D.CONFIG.maxPoints;
  const UNIQUE_BONUS = 20;
  const LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = s => s < 0.01 ? "<1%" : Math.round(s * 100) + "%";

  // ---------- State ----------
  const S = {
    view: "menu", code: "", channel: null, client: null, me: null, joinedAt: 0,
    players: {},          // pid -> presence payload
    hostId: null,
    game: null,           // { no, questions, index, phase: "question"|"reveal"|"end", endsAt, answers: {idx: {pid: ans}}, results, totals }
    myAnswer: null, misses: [], road: null, timer: null, hostTimer: null
  };
  const isHost = () => S.me && S.hostId === S.me.pid;
  const app = () => root.PuckoutApp;

  // ---------- Supabase ----------
  function loadClient() {
    if (root.supabase && root.supabase.createClient) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = SUPABASE_JS; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the live connection."));
      document.head.appendChild(s);
    });
  }
  const configured = () => !!(C.supabaseUrl && C.supabaseAnonKey);

  async function connect(code, asHost) {
    await loadClient();
    if (!S.client) S.client = root.supabase.createClient(C.supabaseUrl.replace(/\/rest\/v1\/?$/, ""), C.supabaseAnonKey);
    const home = app().home();
    const p = Board.player();
    S.code = code;
    S.joinedAt = Date.now();
    S.me = { pid: p.id, name: p.name || "Player", club: home.name, county: home.county, lat: home.lat, lon: home.lon, joinedAt: S.joinedAt, host: !!asHost };
    if (asHost) S.hostId = p.id;
    const ch = S.client.channel("puckout:room:" + code, { config: { broadcast: { self: true }, presence: { key: p.id } } });
    S.channel = ch;
    ch.on("presence", { event: "sync" }, onPresence);
    ch.on("broadcast", { event: "msg" }, ({ payload }) => onMessage(payload));
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("Couldn't connect to the room. Check your connection.")), 10000);
      ch.subscribe(async status => {
        if (status === "SUBSCRIBED") { clearTimeout(t); await ch.track(S.me); res(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(t); rej(new Error("Couldn't connect to the room.")); }
      });
    });
  }
  const send = payload => S.channel && S.channel.send({ type: "broadcast", event: "msg", payload });

  function onPresence() {
    const state = S.channel.presenceState();
    const players = {};
    for (const [pid, metas] of Object.entries(state)) if (metas && metas[0]) players[pid] = metas[0];
    const joined = Object.keys(players).filter(pid => !S.players[pid]);
    S.players = players;
    // Host: whoever says so; otherwise the longest-standing player takes over.
    const flagged = Object.values(players).filter(p => p.host).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    const prevHost = S.hostId;
    S.hostId = flagged ? flagged.pid : (Object.values(players).sort((a, b) => a.joinedAt - b.joinedAt)[0] || {}).pid || null;
    if (isHost() && prevHost !== S.me.pid) {
      S.me.host = true; S.channel.track(S.me);
      if (S.game && S.game.phase === "question") scheduleHostReveal();
    }
    // Bring newcomers up to speed.
    if (isHost() && joined.some(pid => pid !== S.me.pid) && S.game) send({ t: "sync", game: S.game, left: Math.max(0, S.game.endsAt - Date.now()) });
    if (isHost() && S.game && S.game.phase === "question" && everyoneAnswered()) hostReveal();
    render();
  }

  // ---------- Messages ----------
  function onMessage(m) {
    if (!m || !m.t) return;
    if (m.t === "start") startGame(m.no, m.questions);
    else if (m.t === "q") beginQuestion(m.index, m.secs);
    else if (m.t === "ans") {
      if (!S.game) return;
      const a = (S.game.answers[m.index] = S.game.answers[m.index] || {});
      a[m.pid] = m.ans;
      if (isHost() && S.game.phase === "question" && m.index === S.game.index && everyoneAnswered()) hostReveal();
      if (S.view === "question") renderWaiting();
    } else if (m.t === "reveal") applyReveal(m);
    else if (m.t === "end") { if (S.game) { S.game.phase = "end"; S.view = "podium"; render(); } }
    else if (m.t === "sync") {
      if (S.game && S.game.no === m.game.no && S.game.index >= m.game.index && S.game.phase === m.game.phase) return;
      S.game = m.game;
      S.road = R.makeRoad(app().home(), `party-${S.code}-${S.game.no}`);
      app().setRoad(S.road, myFrac());
      if (S.game.phase === "question") { S.game.endsAt = Date.now() + m.left; S.myAnswer = null; S.misses = []; S.view = "question"; startTimer(); }
      else S.view = S.game.phase === "end" ? "podium" : "reveal";
      render();
    }
  }

  // ---------- Game flow ----------
  function hostStart() {
    const no = (S.game ? S.game.no : 0) + 1;
    const questions = L.questionsFor(`party:${S.code}:${no}`, null);
    send({ t: "start", no, questions });
    setTimeout(() => hostNext(0), 600);
  }
  function hostNext(index) {
    send({ t: "q", index, secs: SECS });
  }
  function startGame(no, questions) {
    S.game = { no, questions, index: -1, phase: "lobby", endsAt: 0, answers: {}, results: {}, totals: {} };
    S.road = R.makeRoad(app().home(), `party-${S.code}-${no}`);
    app().setRoad(S.road, 0);
  }
  function beginQuestion(index, secs) {
    if (!S.game) return;
    S.game.index = index;
    S.game.phase = "question";
    S.game.endsAt = Date.now() + secs * 1000;
    S.myAnswer = null; S.misses = [];
    S.view = "question";
    render();
    startTimer();
    if (isHost()) scheduleHostReveal();
  }
  function scheduleHostReveal() {
    clearTimeout(S.hostTimer);
    S.hostTimer = setTimeout(() => { if (S.game && S.game.phase === "question") hostReveal(); }, Math.max(0, S.game.endsAt - Date.now()) + 1500);
  }
  function everyoneAnswered() {
    const a = S.game.answers[S.game.index] || {};
    return Object.keys(S.players).every(pid => a[pid]);
  }
  function hostReveal() {
    if (!S.game || S.game.phase !== "question") return;
    clearTimeout(S.hostTimer);
    const idx = S.game.index;
    const a = S.game.answers[idx] || {};
    const counts = {};
    Object.values(a).forEach(x => { if (x.entity) counts[x.entity] = (counts[x.entity] || 0) + 1; });
    const results = {};
    for (const pid of new Set([...Object.keys(S.players), ...Object.keys(a)])) {
      const x = a[pid] || { entity: null, tier: "wide", pts: 0 };
      const unique = !!x.entity && counts[x.entity] === 1 && Object.keys(a).length > 1;
      results[pid] = { ...x, unique, bonus: unique ? UNIQUE_BONUS : 0 };
    }
    const totals = { ...S.game.totals };
    for (const [pid, r] of Object.entries(results)) totals[pid] = (totals[pid] || 0) + r.pts + r.bonus;
    send({ t: "reveal", index: idx, results, totals, last: idx >= S.game.questions.length - 1 });
  }
  function applyReveal(m) {
    if (!S.game) return;
    clearInterval(S.timer);
    S.game.phase = "reveal";
    S.game.results[m.index] = m.results;
    S.game.totals = m.totals;
    S.game.last = m.last;
    S.view = "reveal";
    render();
    app().travelTo(myFrac());
  }
  const myFrac = () => Math.min(1, ((S.game && S.game.totals[S.me.pid]) || 0) / MAX);

  // ---------- Answering ----------
  function submit(raw) {
    if (!S.game || S.game.phase !== "question" || S.myAnswer) return;
    raw = raw.trim();
    if (!raw) return;
    const qid = S.game.questions[S.game.index];
    const q = L.QBY[qid];
    const id = L.identify(raw, qid);
    const msg = $("p-msg");
    if (!id) {
      const c = L.candidates(raw, qid);
      msg.textContent = c.length > 1 ? `More than one fits: ${c.slice(0, 3).join(", ")}. Add the first name.` : `We don't recognise "${raw}". Check the spelling.`;
      msg.classList.add("err"); return;
    }
    if (q.a[id] === undefined) {
      if (!S.misses.includes(id)) S.misses.push(id);
      msg.textContent = `${L.label(id)} isn't on the list. Keep going.`; msg.classList.add("err");
      $("p-misses").innerHTML = S.misses.map(x => `<span>${esc(L.label(x))}</span>`).join("");
      kick("wide", qid);
      $("p-guess").select();
      return;
    }
    const share = L.shares(qid)[id];
    const tier = L.tierFor(share);
    S.myAnswer = { entity: id, label: L.label(id), tier: tier.id, pts: tier.pts, share };
    send({ t: "ans", index: S.game.index, pid: S.me.pid, ans: S.myAnswer });
    kick(tier.id, qid);
    render();
  }
  function timeUp() {
    if (!S.game || S.game.phase !== "question" || S.myAnswer) return;
    S.myAnswer = { entity: null, label: "", tier: "wide", pts: 0, share: 0 };
    send({ t: "ans", index: S.game.index, pid: S.me.pid, ans: S.myAnswer });
    render();
  }
  function startTimer() {
    clearInterval(S.timer);
    const tick = () => {
      const left = Math.max(0, S.game.endsAt - Date.now());
      const n = $("p-clock-n"), fg = $("p-clock-fg");
      if (n) n.textContent = Math.ceil(left / 1000);
      if (fg) fg.style.strokeDashoffset = String(119.4 * (1 - left / (SECS * 1000)));
      if (left <= 0) { clearInterval(S.timer); timeUp(); }
    };
    tick();
    S.timer = setInterval(tick, 200);
  }
  function kick(tier, qid) {
    if (!root.PuckoutKick || !root.PuckoutMap.pinEl) return;
    const r = root.PuckoutMap.pinEl.getBoundingClientRect();
    root.PuckoutKick.play(tier, { x: r.left - 26, y: r.top - 14 }, S.me.county, L.isHurling(qid) ? "hurling" : "football");
  }

  // ---------- Views ----------
  const dot = c => {
    const col = (root.PuckoutKick && root.PuckoutKick.COLOURS[c]) || ["#00693b", "#e6a817"];
    return `<i class="dot" style="background:linear-gradient(90deg, ${col[0]} 50%, ${col[1]} 50%)"></i>`;
  };
  const roster = () => Object.values(S.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const standings = () => roster().map(p => ({ ...p, total: (S.game && S.game.totals[p.pid]) || 0 })).sort((a, b) => b.total - a.total);
  const shareLink = () => `${location.origin}${location.pathname}?room=${S.code}`;

  function render() {
    const el = $("party-body");
    if (!el) return;
    const v = S.view;
    if (v === "menu") {
      const p = Board.player();
      const preset = new URLSearchParams(location.search).get("room") || "";
      el.innerHTML = `
        <p class="eyebrow">Party</p>
        <h2 class="ft-title">Play with friends</h2>
        <p class="p-sub">Everyone gets the same seven questions at the same time, racing from their own club to Croke Park. Say something nobody else in the room said for a +${UNIQUE_BONUS} bonus.</p>
        ${configured() ? "" : `<p class="p-err">Party mode needs the shared database set up in js/config.js.</p>`}
        <label class="p-label" for="p-name">Your name</label>
        <input id="p-name" class="p-input" maxlength="24" value="${esc(p.name)}" placeholder="Your name" spellcheck="false">
        <button type="button" class="btn-sign" data-act="host">Host a room</button>
        <div class="p-or"><span>or join one</span></div>
        <div class="p-join">
          <input id="p-code" class="p-input p-code" maxlength="4" value="${esc(preset.toUpperCase())}" placeholder="CODE" autocapitalize="characters" spellcheck="false">
          <button type="button" class="btn-ghost" data-act="join">Join</button>
        </div>
        <p class="p-msg" id="p-menu-msg"></p>`;
    } else if (v === "lobby") {
      const players = roster();
      el.innerHTML = `
        <p class="eyebrow">Room</p>
        <div class="p-code-big">${esc(S.code)}</div>
        <p class="p-sub">Friends join at <b>${esc(location.host + location.pathname)}</b> with this code, or with the link.</p>
        <div class="p-share"><input class="p-input" readonly value="${esc(shareLink())}" id="p-link"><button type="button" class="btn-ghost" data-act="copy">Copy link</button></div>
        <h3 class="p-h">Players (${players.length})</h3>
        <ul class="p-players">${players.map(p => `<li>${dot(p.county)}<b>${esc(p.name)}</b><small>${esc(p.club)}</small>${p.pid === S.hostId ? `<em>Host</em>` : ""}</li>`).join("")}</ul>
        ${isHost() ? `<button type="button" class="btn-sign" data-act="start">${S.game ? "Start another game" : "Start the game"}</button>`
                   : `<p class="p-wait">Waiting for ${esc((S.players[S.hostId] || {}).name || "the host")} to start…</p>`}
        <button type="button" class="btn-link" data-act="leave">Leave room</button>`;
    } else if (v === "question") {
      const qid = S.game.questions[S.game.index], q = L.QBY[qid];
      el.innerHTML = `
        <p class="eyebrow">Question ${S.game.index + 1} of ${S.game.questions.length} · ${esc(q.cat)}</p>
        <h2 class="qtext">${esc(q.text)}</h2>
        ${q.hint ? `<p class="qhint">${esc(q.hint)}</p>` : ""}
        ${S.myAnswer ? `
          <div class="p-locked">${S.myAnswer.entity ? `Locked in: <b>${esc(S.myAnswer.label)}</b>` : "Out of time"}</div>`
        : `
          <form class="shoot p-shoot" id="p-form" autocomplete="off">
            <div class="clock"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="clock-bg" cx="22" cy="22" r="19"/><circle class="clock-fg" id="p-clock-fg" cx="22" cy="22" r="19"/></svg><span id="p-clock-n">${SECS}</span></div>
            <label for="p-guess" class="visually-hidden">Your answer</label>
            <input id="p-guess" type="text" placeholder="Your answer" autocapitalize="words" spellcheck="false" enterkeyhint="go">
            <button type="submit" class="btn-go">Go</button>
          </form>
          <p class="msg" id="p-msg">Answers are hidden until everyone's in.</p>
          <div class="misses" id="p-misses"></div>`}
        <div id="p-waiting"></div>`;
      const f = $("p-form");
      if (f) { f.addEventListener("submit", ev => { ev.preventDefault(); submit($("p-guess").value); }); try { $("p-guess").focus({ preventScroll: true }); } catch (e) {} }
      renderWaiting();
    } else if (v === "reveal") {
      const idx = S.game.index, qid = S.game.questions[idx], q = L.QBY[qid];
      const res = S.game.results[idx] || {};
      const rows = roster().map(p => ({ p, r: res[p.pid] || { tier: "wide", pts: 0, bonus: 0 } })).sort((a, b) => (b.r.pts + b.r.bonus) - (a.r.pts + a.r.bonus));
      el.innerHTML = `
        <p class="eyebrow">Question ${idx + 1} of ${S.game.questions.length}</p>
        <h2 class="qtext p-qsmall">${esc(q.text)}</h2>
        <ul class="p-answers">${rows.map(({ p, r }) => `
          <li><span class="who">${dot(p.county)}<b>${esc(p.name)}</b></span>
            <span class="ans">${r.entity ? esc(r.label) + ` <small>${pct(r.share || 0)}</small>` : "<i>No answer</i>"}</span>
            <span class="badge ${r.tier}">${r.entity ? esc(L.tierById(r.tier).name) : "Wide"}</span>
            <span class="gain">+${r.pts + r.bonus}${r.unique ? `<small class="uniq">only you!</small>` : ""}</span></li>`).join("")}</ul>
        ${raceHTML()}
        ${isHost() ? `<button type="button" class="btn-sign" data-act="next">${S.game.last ? "Final standings" : "Next question"}</button>`
                   : `<p class="p-wait">Waiting for the host…</p>`}`;
    } else if (v === "podium") {
      const st = standings();
      const top = st.slice(0, 3);
      const order = [top[1], top[0], top[2]];
      el.innerHTML = `
        <p class="eyebrow">Full time · Room ${esc(S.code)}</p>
        <h2 class="ft-title">${top[0] ? `${esc(top[0].name)} wins!` : "Full time"}</h2>
        <div class="podium">${order.map((p, i) => p ? `
          <div class="step s${[2, 1, 3][i]}"><b>${esc(p.name)}</b><small>${dot(p.county)}${esc(p.club)}</small><span>${p.total}</span><div class="block">${[2, 1, 3][i]}</div></div>` : `<div class="step empty"></div>`).join("")}</div>
        ${raceHTML()}
        ${isHost() ? `<button type="button" class="btn-sign" data-act="start">Play again</button>` : `<p class="p-wait">The host can start another game.</p>`}
        <button type="button" class="btn-link" data-act="leave">Leave room</button>`;
    }
  }
  function renderWaiting() {
    const w = $("p-waiting");
    if (!w || !S.game) return;
    const a = S.game.answers[S.game.index] || {};
    const players = roster();
    w.innerHTML = `<p class="p-h">${players.filter(p => a[p.pid]).length} of ${players.length} answered</p>
      <ul class="p-ticks">${players.map(p => `<li class="${a[p.pid] ? "in" : ""}">${a[p.pid] ? "✓" : "…"} ${esc(p.name)}</li>`).join("")}</ul>`;
  }
  function raceHTML() {
    return `<h3 class="p-h">The race to Croke Park</h3>
      <ul class="race">${standings().map(p => {
        const f = Math.min(1, p.total / MAX);
        return `<li class="${p.pid === S.me.pid ? "me" : ""}"><span class="lane-name">${dot(p.county)}${esc(p.name)}</span>
          <span class="lane"><span class="lane-fill" style="width:${(f * 100).toFixed(1)}%"></span><span class="token" style="left:${(f * 100).toFixed(1)}%"></span><span class="flag" aria-hidden="true">🏟</span></span>
          <span class="lane-pts">${p.total}</span></li>`;
      }).join("")}</ul>`;
  }

  // ---------- Actions ----------
  const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
  async function enter(code, asHost) {
    const name = ($("p-name").value || "").trim();
    const msg = $("p-menu-msg");
    if (!name) { msg.textContent = "Type your name first."; return; }
    if (!app().home()) { msg.textContent = "Pick your club on the opening screen first."; return; }
    if (!configured()) { msg.textContent = "Party mode isn't connected yet."; return; }
    Board.setName(name);
    msg.textContent = "Connecting…";
    try {
      await connect(code, asHost);
      if (!S.game) S.view = "lobby";
      history.replaceState(null, "", `?room=${code}`);
      render();
    } catch (e) { msg.textContent = e.message; }
  }
  async function leave() {
    clearInterval(S.timer); clearTimeout(S.hostTimer);
    if (S.channel) { try { await S.channel.untrack(); await S.client.removeChannel(S.channel); } catch (e) {} }
    Object.assign(S, { view: "menu", code: "", channel: null, players: {}, hostId: null, game: null, myAnswer: null, misses: [] });
    history.replaceState(null, "", location.pathname);
    close();
  }
  function onClick(ev) {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "host") enter(newCode(), true);
    else if (act === "join") {
      const code = ($("p-code").value || "").trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) { $("p-menu-msg").textContent = "Room codes are four letters."; return; }
      enter(code, false);
    } else if (act === "start" && isHost()) hostStart();
    else if (act === "next" && isHost()) {
      if (S.game.last) send({ t: "end" }); else hostNext(S.game.index + 1);
    } else if (act === "copy") {
      const t = shareLink();
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(
        () => { b.textContent = "Copied"; }, () => { $("p-link").select(); });
    } else if (act === "leave") leave();
    else if (act === "close") { if (S.channel) leave(); else close(); }
  }

  function open() {
    app().hideAll();
    $("party").hidden = false;
    document.body.classList.add("in-party");
    if (!S.channel) S.view = "menu";
    render();
  }
  function close() {
    $("party").hidden = true;
    document.body.classList.remove("in-party");
    app().backToIntro();
  }

  document.addEventListener("click", ev => { if (ev.target.closest("#party")) onClick(ev); });
  root.PuckoutParty = { open, close };
  // Opening a shared room link goes straight to the party screen.
  if (new URLSearchParams(location.search).get("room")) setTimeout(() => app() && app().home() && open(), 1200);
})(window);
