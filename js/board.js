/*
 * The leaderboard: posts finished roads to a shared Supabase table and reads
 * back today's best roads, the all-time table and the county table. Without
 * a shared database configured it keeps a history of this device's roads.
 */
(function (root) {
  "use strict";
  const C = root.PuckoutConfig || {};
  const base = (C.supabaseUrl || "").replace(/\/+$/, "");
  const key = C.supabaseAnonKey || "";
  const configured = !!(base && key);
  const HISTORY_KEY = "puckout:history";
  const PLAYER_KEY = "puckout:player";

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };

  function uuid() {
    if (root.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function player() {
    let p = store.get(PLAYER_KEY);
    if (!p || !p.id) { p = { id: uuid(), name: "" }; store.set(PLAYER_KEY, p); }
    return p;
  }
  function setName(name) {
    const p = player();
    p.name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 24);
    store.set(PLAYER_KEY, p);
    return p;
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      ...opts,
      // Newer Supabase keys (sb_publishable_…) go in the apikey header only;
      // older JWT-style anon keys also go in Authorization.
      headers: { apikey: key, ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/json", ...(opts.headers || {}) }
    });
    if (!res.ok) throw new Error(`Leaderboard ${res.status}`);
    return res.status === 204 || res.status === 201 ? null : res.json();
  }

  // Remember the road on this device, and post it if the board is shared.
  async function submit(road) {
    const p = player();
    const row = {
      player_id: p.id, name: p.name || "Anonymous", club: road.club || "", county: road.county || "",
      round: road.round, points: Math.round(road.points), km: Math.round(road.km), total_km: Math.max(1, Math.round(road.total_km)),
      marks: road.marks || ""
    };
    const history = store.get(HISTORY_KEY) || [];
    if (!history.some(h => h.round === row.round)) {
      history.push({ ...row, created_at: new Date().toISOString() });
      store.set(HISTORY_KEY, history.slice(-200));
    }
    if (!configured || !p.name) return { posted: false };
    await api("roads?on_conflict=player_id,round", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(row)
    });
    return { posted: true };
  }

  const startOfIrishDay = () => {
    const now = new Date();
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now);
    // Irish midnight expressed in UTC: try both offsets and keep the one that lands on that date.
    for (const off of ["+00:00", "+01:00"]) {
      const t = new Date(`${d}T00:00:00${off}`);
      if (new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(t) === d &&
          new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Dublin", hour: "2-digit", hour12: false }).format(t) === "00") return t;
    }
    return new Date(`${d}T00:00:00Z`);
  };

  // Best road per player since midnight (Irish time).
  async function today() {
    if (!configured) {
      const since = startOfIrishDay();
      return localRows().filter(r => new Date(r.created_at) >= since);
    }
    const rows = await api(`roads?select=player_id,name,club,county,points,km,total_km,marks&created_at=gte.${encodeURIComponent(startOfIrishDay().toISOString())}&order=points.desc,created_at.asc&limit=500`);
    const seen = new Set();
    return rows.filter(r => !seen.has(r.player_id) && seen.add(r.player_id)).slice(0, 50);
  }
  async function allTime() {
    if (!configured) return [];
    return api("leaderboard?select=*&order=total_points.desc,best_points.desc&limit=50");
  }
  async function counties() {
    if (!configured) return [];
    return api("county_leaderboard?select=*&order=total_points.desc&limit=40");
  }
  function localRows() {
    return (store.get(HISTORY_KEY) || []).slice().sort((a, b) => b.points - a.points);
  }

  root.PuckoutBoard = { configured, player, setName, submit, today, allTime, counties, localRows };
})(window);
