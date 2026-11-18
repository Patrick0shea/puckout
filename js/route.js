/*
 * Builds the day's road from a home club to Croke Park: picks a handful of
 * grounds, legends' clubs and landmarks that sit roughly on the way, then
 * smooths a road through them. Pure functions; runs in Node for the tests.
 */
(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const P = node ? require("./pois.js") : root.PuckoutPois;
  const L = node ? require("./logic.js") : root.PuckoutLogic;

  const R_EARTH = 6371;
  function km(a, b) {
    const t = Math.PI / 180;
    const dLat = (b.lat - a.lat) * t, dLon = (b.lon - a.lon) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(h));
  }

  // Pick stops. Deterministic for a given home and day, different from day to day.
  function pickStops(home, date, opts = {}) {
    const ck = P.CROKER;
    const D = km(home, ck);
    const want = Math.max(3, Math.min(5, Math.round(D / 55)));
    const pool = P.POIS.filter(p => km(home, p) > 6 && km(p, ck) > 6)
      .map(p => { const a = km(home, p), b = km(p, ck); return { p, a, b, detour: a + b - D, t: a / (a + b) }; });
    const rnd = L.seeded(`road:${date}:${home.lat.toFixed(3)},${home.lon.toFixed(3)}`);

    // Clubs close to Croke Park get a day trip: a loop out through the
    // surrounding counties and back in, ordered around the compass.
    if (D < 45) {
      const near = pool.filter(x => x.b < 75);
      for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [near[i], near[j]] = [near[j], near[i]]; }
      const picked = [];
      for (const x of near) {
        if (picked.length >= 3) break;
        if (picked.some(c => km(c.p, x.p) < 25)) continue;
        picked.push(x);
      }
      const ang = p => Math.atan2(p.lat - ck.lat, (p.lon - ck.lon) * 0.6);
      const start = ang(home);
      const rel = p => ((ang(p) - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      return picked.sort((a, b) => rel(a.p) - rel(b.p)).map(x => x.p);
    }
    const gap = 0.5 / want;
    const chosen = [];
    // Start with places close to the straight line and widen the search only
    // if there aren't enough; short trips (Dublin clubs) take a scenic loop.
    for (const allow of [Math.max(30, D * 0.16), Math.max(55, D * 0.3), Math.max(90, D * 0.5)]) {
      const cands = pool.filter(x => x.detour <= allow && !chosen.includes(x));
      // Seeded shuffle, then take kinds in turn so the road mixes legends, landmarks and grounds.
      for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
      const byKind = { legend: [], landmark: [], ground: [] };
      cands.forEach(x => byKind[x.p.kind].push(x));
      const kinds = ["legend", "landmark", "ground"];
      const offset = Math.floor(rnd() * 3);
      for (let k = 0; chosen.length < want && kinds.some(kd => byKind[kd].length); k++) {
        const x = byKind[kinds[(k + offset) % 3]].shift();
        if (!x || x.t < 0.06 || x.t > 0.96) continue;
        if (chosen.some(c => Math.abs(c.t - x.t) < gap || km(c.p, x.p) < 12)) continue;
        chosen.push(x);
      }
      if (chosen.length >= want) break;
    }
    return chosen.sort((a, b) => a.t - b.t).map(x => x.p);
  }

  // Catmull-Rom through home → stops → Croke Park, in lat/lon, with cumulative km.
  function buildRoad(home, stops) {
    const k = Math.cos(53.4 * Math.PI / 180);
    const ctrl = [home, ...stops, P.CROKER].map(p => [p.lon * k, p.lat]);
    const P2 = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
    const pts = [];
    const stopIdx = [];
    for (let i = 1; i < P2.length - 2; i++) {
      stopIdx.push(pts.length);
      const [p0, p1, p2, p3] = [P2[i - 1], P2[i], P2[i + 1], P2[i + 2]];
      const n = Math.max(6, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 120));
      for (let s = 0; s < n; s++) {
        const t = s / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push({ lon: f(p0[0], p1[0], p2[0], p3[0]) / k, lat: f(p0[1], p1[1], p2[1], p3[1]) });
      }
    }
    stopIdx.push(pts.length);
    pts.push({ lon: P.CROKER.lon, lat: P.CROKER.lat });
    pts[0].d = 0;
    for (let i = 1; i < pts.length; i++) pts[i].d = pts[i - 1].d + km(pts[i - 1], pts[i]);
    const total = pts[pts.length - 1].d;
    // stopIdx[0] is home, the last is Croke Park
    const marks = [home, ...stops, P.CROKER].map((p, i) => ({ ...p, km: pts[stopIdx[i]].d }));
    return { pts, total, marks };
  }

  function makeRoad(home, date) {
    const stops = pickStops(home, date);
    return buildRoad(home, stops);
  }

  const api = { km, pickStops, buildRoad, makeRoad };
  if (node) module.exports = api;
  else root.PuckoutRoute = api;
})(typeof window !== "undefined" ? window : globalThis);
