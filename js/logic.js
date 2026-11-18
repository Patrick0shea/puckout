/*
 * Pure game logic: picking today's questions, recognising typed answers,
 * working out how rare an answer is and how far it carries you.
 * No DOM here, so it runs in Node for the tests too.
 *
 * Questions come from two places: the hand-written ones in js/data.js and
 * the ones generated from real records in data/questions.js (players, clubs,
 * captains, All Stars, county championships).
 */
(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const D = node ? require("./data.js") : root.PuckoutData;
  let G = null;
  try { G = node ? (require("../data/questions.js"), globalThis.PuckoutQuestions) : root.PuckoutQuestions; } catch (e) { G = null; }
  G = G || { people: [], clubs: [], questions: [] };

  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\bsaint\b/g, "st").replace(/[^a-z0-9 ]+/g, " ").replace(/\b(county|co|the|gaa|gac|clg)\b/g, " ").replace(/\s+/g, "");
  const tokens = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\bsaint\b/g, "st").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

  // A few nicknames everyone uses. Keys are matched after norm().
  const NICKNAMES = {
    gooch: ["Colm Cooper", "Kerry"], thegooch: ["Colm Cooper", "Kerry"], jacko: ["Jack O'Shea", "Kerry"],
    bomber: ["Eoin Liston", "Kerry"], cha: ["James Fitzpatrick", "Kilkenny"], jbm: ["Jimmy Barry-Murphy", "Cork"],
    kingshefflin: ["Henry Shefflin", "Kilkenny"], kingHenry: ["Henry Shefflin", "Kilkenny"], starmccaffrey: ["Jack McCaffrey", "Dublin"]
  };

  // ---- Entities: hand-written (counties, positions, codes) plus generated people and clubs ----
  const PARTICLES = new Set(["o", "mac", "mc", "de", "di", "ni", "ui", "nic", "van", "le", "la"]);
  const GENERIC = new Set(["st", "naomh", "rangers", "shamrocks", "gaels", "emmets", "harps", "rovers", "og", "eire", "the",
    "sarsfields", "celtic", "united", "hurling", "club", "football", "gaa", "gac", "clg", "cumann", "of", "and", "na", "an",
    "young", "irelands", "pearses", "mitchels", "davitts", "kickhams", "geraldines", "wolfe", "tones", "erins", "own", "east",
    "west", "north", "south", "mid"]);

  const ENT = D.ENTITIES.map(e => ({ id: e.id, label: e.label, keys: e.aliases.map(norm).filter(Boolean), parts: [] }));
  const personKeys = label => {
    const t = tokens(label);
    const keys = [t.join("")];
    const noInitials = t.filter(x => x.length > 1);
    if (noInitials.length >= 2) keys.push(noInitials.join(""));
    let i = t.length - 1;
    while (i > 0 && PARTICLES.has(t[i - 1])) i--;
    const surname = t.slice(i).join("");
    return { keys, parts: surname.length >= 4 ? [surname] : [] };
  };
  const clubKeys = label => {
    const t = tokens(label.replace(/\(.*?\)/g, " "));
    const keys = [t.join("")];
    const sig = t.filter(x => !GENERIC.has(x) && x.length >= 4);
    const parts = new Set(sig);
    if (t.length >= 2) parts.add(t.slice(0, 2).join(""));
    const commaHead = label.split(",")[0];
    if (commaHead !== label) keys.push(norm(commaHead) + norm(label.split(",").slice(1).join("")));
    return { keys, parts: [...parts].filter(p => !keys.includes(p)) };
  };
  G.people.forEach(p => { const k = personKeys(p.label); ENT.push({ id: p.id, label: p.label, county: p.county, keys: k.keys, parts: k.parts, kind: "person" }); });
  G.clubs.forEach(c => { const k = clubKeys(c.label); ENT.push({ id: c.id, label: c.label, county: c.county, keys: k.keys, parts: k.parts, kind: "club" }); });
  const EBY = Object.fromEntries(ENT.map(e => [e.id, e]));
  for (const [nick, [name, county]] of Object.entries(NICKNAMES)) {
    const e = ENT.find(x => x.kind === "person" && x.label === name && x.county === county);
    if (e) e.keys.push(norm(nick));
  }

  const QUESTIONS = D.QUESTIONS.concat(G.questions);
  const QBY = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));

  const INDEX = [];
  ENT.forEach(e => e.keys.forEach(k => INDEX.push([k, e.id])));
  const PARTS = {};
  ENT.forEach(e => e.parts.forEach(k => { (PARTS[k] = PARTS[k] || new Set()).add(e.id); }));

  // ---- Days ----
  function irishDate(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now); // YYYY-MM-DD
  }
  function dayNumber(date) {
    const ms = Date.parse(date + "T00:00:00Z") - Date.parse(D.CONFIG.launchDate + "T00:00:00Z");
    return Math.max(1, Math.round(ms / 86400000) + 1);
  }
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // How many of each kind of question can appear in one day.
  const GROUP = { "All Stars": "stars", "Dual stars": "stars", Awards: "awards", Captains: "captains", Clubs: "clubs",
    Football: "classic", Hurling: "classic", "Football & hurling": "classic", Geography: "classic", "The game": "classic", History: "classic" };
  const CAP = { stars: 2, awards: 1, captains: 1, clubs: 2, classic: 2 };

  // Seven questions: six everyone shares, plus one about the player's own
  // county's club championship when there is one (otherwise a seventh shared one).
  // `seen` (optional): question ids played recently. They go to the back of
  // the queue, so back-to-back rounds don't repeat questions.
  function questionsFor(date, county, seen) {
    const rnd = seeded("puckout:" + date);
    let pool = QUESTIONS.filter(q => q.cat !== "Your county").map(q => q.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (seen && seen.length) {
      const old = new Set(seen);
      pool = pool.filter(id => !old.has(id)).concat(pool.filter(id => old.has(id)));
    }
    const own = county ? QUESTIONS.filter(q => q.cat === "Your county" && q.county === county) : [];
    const shared = own.length ? D.CONFIG.perDay - 1 : D.CONFIG.perDay;
    const used = {};
    const out = [];
    const usedCat = {};
    for (const id of pool) {
      if (out.length >= shared) break;
      const cat = QBY[id].cat, g = GROUP[cat] || "classic";
      if ((used[g] || 0) >= (CAP[g] || 1)) continue;
      if (g === "classic" && usedCat[cat]) continue; // one geography, one football-history question, and so on
      used[g] = (used[g] || 0) + 1;
      usedCat[cat] = true;
      out.push(id);
    }
    for (const id of pool) { if (out.length >= shared) break; if (!out.includes(id)) out.push(id); }
    if (own.length) {
      const fresh = seen ? own.filter(q => !seen.includes(q.id)) : own;
      const from = fresh.length ? fresh : own;
      out.push(from[Math.floor(rnd() * from.length)].id);
    }
    return out;
  }

  // ---- Recognising answers ----
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  const tolerance = k => k.length >= 9 ? 2 : k.length >= 4 ? 1 : 0;
  function closest(k, pairs) {
    const tol = tolerance(k);
    if (!tol) return null;
    let best = null, bestD = 99, tie = false;
    for (const [key, id] of pairs) {
      const d = lev(k, key);
      if (d < bestD) { best = id; bestD = d; tie = false; }
      else if (d === bestD && id !== best) tie = true;
    }
    return bestD <= tol && !tie ? best : null;
  }

  // Returns an entity id, or null when the text can't be pinned to one thing.
  // Within a question, a surname or a club's short name is enough when only
  // one answer fits ("Shefflin", "Crossmaglen"). Typos are forgiven only when
  // one candidate is clearly closest, so "Kery" is Kerry but nothing that sits
  // between Kerry and Derry is guessed.
  function identify(raw, qid) {
    const k = norm(raw);
    if (!k) return null;
    const q = qid && QBY[qid];
    if (q) {
      const ids = Object.keys(q.a).filter(id => EBY[id]);
      for (const id of ids) if (EBY[id].keys.includes(k)) return id;
      const part = ids.filter(id => EBY[id].parts.includes(k));
      if (part.length === 1) return part[0];
      const near = closest(k, ids.flatMap(id => EBY[id].keys.map(key => [key, id])));
      if (near) return near;
    }
    for (const [key, id] of INDEX) if (key === k) return id;
    if (PARTS[k] && PARTS[k].size === 1) return [...PARTS[k]][0];
    if (PARTS[k]) return null;
    return closest(k, INDEX);
  }

  // When a surname or short name fits more than one answer ("Clifford",
  // "Ó Sé"), the names it could be, so the game can ask for a first name.
  function candidates(raw, qid) {
    const k = norm(raw), q = QBY[qid];
    if (!k || !q) return [];
    return Object.keys(q.a).filter(id => EBY[id] && EBY[id].parts.includes(k)).map(id => EBY[id].label);
  }

  // ---- Rarity ----
  // realCounts: optional {entityId: n} of answers other players gave.
  function shares(qid, realCounts) {
    const q = QBY[qid];
    const priorSum = Object.values(q.a).reduce((s, v) => s + v, 0);
    const c = {};
    let total = 0;
    for (const [id, w] of Object.entries(q.a)) {
      c[id] = (w / priorSum) * D.CONFIG.priorWeight + ((realCounts && realCounts[id]) || 0);
      total += c[id];
    }
    const out = {};
    for (const id in c) out[id] = c[id] / total;
    return out;
  }
  const tierFor = share => D.TIERS.find(t => share < t.max);
  const tierById = id => D.TIERS.find(t => t.id === id) || D.WIDE;
  const label = id => (EBY[id] ? EBY[id].label : id);

  const api = { QBY, EBY, QUESTIONS, irishDate, dayNumber, questionsFor, identify, candidates, shares, tierFor, tierById, norm, seeded, label };
  if (node) module.exports = api;
  else root.PuckoutLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
