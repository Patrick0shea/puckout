/*
 * Pure game logic: picking today's questions, recognising typed answers,
 * working out how rare an answer is and how far it carries you.
 * No DOM here, so it runs in Node for the tests too.
 */
(function (root) {
  "use strict";
  const D = typeof module !== "undefined" && module.exports ? require("./data.js") : root.PuckoutData;

  const QBY = Object.fromEntries(D.QUESTIONS.map(q => [q.id, q]));
  const EBY = Object.fromEntries(D.ENTITIES.map(e => [e.id, e]));

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
  function questionsFor(date) {
    const rnd = seeded("puckout:" + date);
    const ids = D.QUESTIONS.map(q => q.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, D.CONFIG.perDay);
  }

  // ---- Recognising answers ----
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\b(county|co|the)\b/g, " ").replace(/\s+/g, "");
  const INDEX = [];
  D.ENTITIES.forEach(e => e.aliases.forEach(al => { const k = norm(al); if (k) INDEX.push([k, e.id]); }));

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

  // Returns an entity id, or null when the text can't be pinned to one thing.
  // Typos are forgiven only when one candidate is clearly closest, so
  // "Kery" is Kerry but nothing that sits between Kerry and Derry is guessed.
  function identify(raw) {
    const k = norm(raw);
    if (!k) return null;
    for (const [key, id] of INDEX) if (key === k) return id;
    const tol = k.length >= 9 ? 2 : k.length >= 4 ? 1 : 0;
    if (!tol) return null;
    let best = null, bestD = 99, tie = false;
    for (const [key, id] of INDEX) {
      const d = lev(k, key);
      if (d < bestD) { best = id; bestD = d; tie = false; }
      else if (d === bestD && id !== best) tie = true;
    }
    return bestD <= tol && !tie ? best : null;
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

  function stopFor(km) {
    let s = D.STOPS[0];
    for (const st of D.STOPS) if (km >= st.km) s = st;
    return s;
  }
  function nextStop(km) {
    return D.STOPS.find(st => st.km > km) || null;
  }

  const api = { QBY, EBY, irishDate, dayNumber, questionsFor, identify, shares, tierFor, tierById, stopFor, nextStop, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PuckoutLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
