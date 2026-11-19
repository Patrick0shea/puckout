/*
 * Builds each road from a home club to Croke Park along Ireland's real main
 * roads (js/roads.js): from the club to the nearest road, then the shortest
 * way by road to Dublin, in past an arrival point (the Red Cow, the Airport,
 * the Phoenix Park or the Aviva) and a pub, to Croke Park.
 *
 * Up to six stops are picked from places within a few kilometres of that
 * road: statues, legends' clubs, county grounds, sights, motorway stops.
 * The Dublin arrival and pub are always included; the rest change from
 * road to road. Pure functions; runs in Node for the tests.
 */
(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const P = node ? require("./pois.js") : root.PuckoutPois;
  const L = node ? require("./logic.js") : root.PuckoutLogic;
  const G = node ? (require("./roads.js"), globalThis.PuckoutRoads) : root.PuckoutRoads;

  const MAX_STOPS = 6;       // seven questions: up to six places on the way, then Croke Park
  const ROAD_FACTOR = 1.15;  // roads wind; straight-line km × this ≈ road km

  const R_EARTH = 6371;
  function km(a, b) {
    const t = Math.PI / 180;
    const dLat = (b.lat - a.lat) * t, dLon = (b.lon - a.lon) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(h));
  }

  // ---------- The road network ----------
  const NODES = {};
  for (const [id, [lat, lon]] of Object.entries(G.nodes)) NODES[id] = { id, lat, lon };
  const ADJ = {};
  for (const [a, b] of G.edges) {
    const d = km(NODES[a], NODES[b]) * ROAD_FACTOR;
    (ADJ[a] = ADJ[a] || []).push([b, d]);
    (ADJ[b] = ADJ[b] || []).push([a, d]);
  }
  const ANCHOR_BY_NODE = {};
  P.POIS.filter(p => p.anchor && p.node).forEach(p => { ANCHOR_BY_NODE[p.node] = p; });

  // Shortest road from home to Croke Park. Home joins the network at its
  // nearest few towns (never straight onto Croke Park), so every road comes
  // in through an arrival point and a pub.
  function roadPath(home) {
    const near = Object.values(NODES).filter(n => n.id !== G.end)
      .map(n => ({ n, d: km(home, n) })).sort((a, b) => a.d - b.d).slice(0, 3);
    const dist = { home: 0 }, prev = {}, done = new Set();
    const edgesOf = id => id === "home" ? near.map(x => [x.n.id, x.d * 1.25]) : (ADJ[id] || []);
    const queue = ["home"];
    while (queue.length) {
      queue.sort((a, b) => dist[a] - dist[b]);
      const u = queue.shift();
      if (done.has(u)) continue;
      done.add(u);
      if (u === G.end) break;
      for (const [v, w] of edgesOf(u)) {
        const nd = dist[u] + w;
        if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; queue.push(v); }
      }
    }
    const ids = [];
    for (let at = G.end; at && at !== "home"; at = prev[at]) ids.unshift(at);
    return ids;
  }

  // Smooth a road through the given points; each point gets its km from home.
  function smooth(points) {
    const k = Math.cos(53.4 * Math.PI / 180);
    const ctrl = points.map(p => [p.lon * k, p.lat]);
    const P2 = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
    const pts = [], at = [];
    for (let i = 1; i < P2.length - 2; i++) {
      at.push(pts.length);
      const [p0, p1, p2, p3] = [P2[i - 1], P2[i], P2[i + 1], P2[i + 2]];
      const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 90));
      for (let s = 0; s < n; s++) {
        const t = s / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push({ lon: f(p0[0], p1[0], p2[0], p3[0]) / k, lat: f(p0[1], p1[1], p2[1], p3[1]) });
      }
    }
    at.push(pts.length);
    const last = points[points.length - 1];
    pts.push({ lon: last.lon, lat: last.lat });
    pts[0].d = 0;
    for (let i = 1; i < pts.length; i++) pts[i].d = pts[i - 1].d + km(pts[i - 1], pts[i]);
    return { pts, at };
  }

  // Nearest point of the road to a place: how far off the road, and how far along.
  function project(pts, p) {
    let best = Infinity, d = 0;
    for (const q of pts) { const x = km(q, p); if (x < best) { best = x; d = q.d; } }
    return { off: best, at: d };
  }

  function pickStops(home, ids, pts, seed) {
    const total = pts[pts.length - 1].d;
    const rnd = L.seeded(`road:${seed}:${home.lat.toFixed(3)},${home.lon.toFixed(3)}`);
    // Dublin arrival and pub: always, in the order the road meets them.
    const anchors = ids.filter(id => ANCHOR_BY_NODE[id]).map(id => ANCHOR_BY_NODE[id]);
    const chosen = anchors.map(p => ({ p, at: project(pts, p).at }));
    const gap = Math.max(4, Math.min(18, total * 0.09));
    const corridor = total < 40 ? 4 : 9;
    const cands = P.POIS.filter(p => !p.anchor)
      .map(p => ({ p, ...project(pts, p) }))
      .filter(x => x.off <= corridor && km(home, x.p) > 5 && x.at > 3 && x.at < total - 4);
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    // Take kinds in turn so a road mixes GAA places, sights and stops.
    const kinds = ["statue", "legend", "landmark", "ground", "roadside", "pub"];
    const byKind = {};
    kinds.forEach(k => { byKind[k] = cands.filter(x => x.p.kind === k).sort((a, b) => a.off - b.off); });
    // closest-to-the-road first within each kind, with a little shuffle
    kinds.forEach(k => { const a = byKind[k]; for (let i = 0; i + 1 < a.length; i += 2) if (rnd() < 0.5) [a[i], a[i + 1]] = [a[i + 1], a[i]]; });
    const offset = Math.floor(rnd() * kinds.length);
    for (let n = 0; chosen.length < MAX_STOPS && kinds.some(k => byKind[k].length) && n < 400; n++) {
      const x = byKind[kinds[(n + offset) % kinds.length]].shift();
      if (!x) continue;
      if (chosen.some(c => Math.abs(c.at - x.at) < gap)) continue;
      chosen.push(x);
    }
    return chosen.sort((a, b) => a.at - b.at);
  }

  function makeRoad(home, seed) {
    const ids = roadPath(home);
    const points = [home, ...ids.map(id => NODES[id])];
    const { pts } = smooth(points);
    const total = pts[pts.length - 1].d;
    const stops = pickStops(home, ids, pts, seed);
    const marks = [{ ...home, km: 0 }, ...stops.map(s => ({ ...s.p, km: s.at })), { ...P.CROKER, km: total }];
    return { pts, total, marks, via: ids };
  }

  const api = { km, roadPath, makeRoad, MAX_STOPS };
  if (node) module.exports = api;
  else root.PuckoutRoute = api;
})(typeof window !== "undefined" ? window : globalThis);
