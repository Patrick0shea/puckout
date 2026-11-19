/*
 * The map: a cartoon Ireland drawn from real outlines. Counties, loughs, the
 * Shannon, mountains, towns, county grounds, legends' clubs and landmarks are
 * painted once to an offscreen canvas. Each frame copies the visible window,
 * draws today's road and the stretch travelled, and places the signs and pin.
 */
(function (root) {
  "use strict";
  const LON0 = -10.75, LAT0 = 55.5, KX = Math.cos(53.4 * Math.PI / 180), K = 560, PAD = 60;
  const W = Math.round(5.5 * KX * K + PAD * 2), H = Math.round(4.2 * K + PAD * 2);
  const proj = (lat, lon) => ({ x: (lon - LON0) * KX * K + PAD, y: (LAT0 - lat) * K + PAD });

  const COL = {
    sea: "#a9cbd0", seaLine: "rgba(255,255,255,.45)", surf: "rgba(255,255,255,.55)", shelf: "#bcd8db",
    land: "#c2d49a", fields: ["#b8cd8b", "#c4d69c", "#adc581", "#c9d9a3", "#bfd293", "#b3c986"], stubble: "#d9d09b",
    hedge: "rgba(110,140,80,.45)", tints: ["#e9d98a", "#9fc27a", "#d8b77a", "#86b38a", "#c9c27e", "#a8c98b"],
    border: "#5b7743", lake: "#b7d5d9", lakeEdge: "#8db3b8", river: "#9fc4ca",
    tree: ["#6f8a3a", "#7d9443", "#5f7a33", "#879b48"], mountain: "#9a8f7a", mountainDark: "#7d7360", snow: "#f4f2ea",
    county: "rgba(36,58,34,.30)", town: "#2d3a33", brown: "#6e4426", green: "#00693b", bronze: "#8a5a2b",
    road: "#f4ecd2", roadEdge: "#b9a77a", trail: "#e6a817"
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ringPath(rings, path = new Path2D()) {
    rings.forEach(r => {
      r.forEach(([lon, lat], i) => { const p = proj(lat, lon); i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y); });
      path.closePath();
    });
    return path;
  }
  function centroid(ring) {
    let a = 0, cx = 0, cy = 0;
    const pts = ring.map(([lon, lat]) => proj(lat, lon));
    for (let i = 0; i < pts.length - 1; i++) {
      const f = pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y;
      a += f; cx += (pts[i].x + pts[i + 1].x) * f; cy += (pts[i].y + pts[i + 1].y) * f;
    }
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }
  const area = ring => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(a / 2); };

  // Nudges for county names whose centre of mass sits badly.
  const LABEL_NUDGE = { Down: [0.02, -0.12], Galway: [0.1, -0.05], Donegal: [-0.15, 0.1], Cork: [0, 0.05], Mayo: [0.15, 0], Dublin: [0, -0.02], Kerry: [0.1, 0.05] };

  // ---------------------------------------------------------- painting
  function paint(R, geo, pois, mountains, croker) {
    const cv = document.createElement("canvas");
    cv.width = Math.round(W * R); cv.height = Math.round(H * R);
    const g = cv.getContext("2d");
    g.scale(R, R);
    const rnd = rng(1884);
    const pick = a => a[Math.floor(rnd() * a.length)];
    const land = ringPath(geo.land);
    const lakes = new Path2D();
    geo.lakes.forEach(l => ringPath(l.rings, lakes));
    const onLand = (x, y) => g.isPointInPath(land, x * R, y * R) && !g.isPointInPath(lakes, x * R, y * R);

    // Sea, with a shallow shelf and wave marks
    g.fillStyle = COL.sea; g.fillRect(0, 0, W, H);
    g.lineJoin = "round"; g.lineCap = "round";
    g.strokeStyle = COL.shelf; g.lineWidth = 34; g.stroke(land);
    g.strokeStyle = COL.surf; g.lineWidth = 12; g.stroke(land);
    g.strokeStyle = COL.seaLine; g.lineWidth = 1.6;
    for (let n = 0; n < 700; n++) {
      const x = rnd() * W, y = rnd() * H;
      if (g.isPointInPath(land, x * R, y * R)) continue;
      g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x - 4, y - 4, x, y); g.quadraticCurveTo(x + 4, y + 4, x + 8, y); g.stroke();
    }

    // Land: patchwork fields, county tints, hedges
    g.fillStyle = COL.land; g.fill(land);
    g.save(); g.clip(land);
    const S = 24, cols = Math.ceil(W / S) + 2, rows = Math.ceil(H / S) + 2, lat = [];
    for (let i = 0; i < cols; i++) { lat[i] = []; for (let j = 0; j < rows; j++) lat[i][j] = { x: (i - 0.5) * S + (rnd() - 0.5) * 14, y: (j - 0.5) * S + (rnd() - 0.5) * 14 }; }
    g.lineWidth = 0.8; g.strokeStyle = COL.hedge;
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows - 1; j++) {
      const q = [lat[i][j], lat[i + 1][j], lat[i + 1][j + 1], lat[i][j + 1]];
      g.beginPath(); q.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
      g.fillStyle = rnd() < 0.06 ? COL.stubble : pick(COL.fields); g.fill(); g.stroke();
    }
    geo.counties.forEach((c, i) => {
      g.globalAlpha = 0.16; g.fillStyle = COL.tints[(i * 7) % COL.tints.length]; g.fill(ringPath(c.rings)); g.globalAlpha = 1;
    });
    // County borders: soft halo then a dashed line
    geo.counties.forEach(c => {
      const p = ringPath(c.rings);
      g.setLineDash([]); g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 4; g.stroke(p);
      g.setLineDash([6, 4]); g.strokeStyle = COL.border; g.lineWidth = 1.6; g.stroke(p);
    });
    g.setLineDash([]);
    g.restore();
    g.strokeStyle = "#7f9a63"; g.lineWidth = 1.5; g.stroke(land);

    // Rivers and loughs
    g.strokeStyle = COL.river; g.lineWidth = 3;
    geo.rivers.forEach(r => { g.beginPath(); r.line.forEach(([lon, la], i) => { const p = proj(la, lon); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); g.stroke(); });
    g.fillStyle = COL.lake; g.fill(lakes);
    g.strokeStyle = COL.lakeEdge; g.lineWidth = 1.4; g.stroke(lakes);

    // Mountains
    mountains.forEach(([la, lo, size]) => {
      const c = proj(la, lo);
      const n = size + 1;
      for (let k = 0; k < n; k++) {
        const h = (14 + size * 5) * (k === Math.floor(n / 2) ? 1 : 0.72), w = h * 1.1;
        const x = c.x + (k - (n - 1) / 2) * w * 0.62, y = c.y + (k === Math.floor(n / 2) ? 0 : 3);
        g.fillStyle = "rgba(60,60,40,.18)"; g.beginPath(); g.ellipse(x + 3, y + 2, w * 0.55, 3, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = COL.mountain; g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x, y - h); g.lineTo(x + w / 2, y); g.closePath(); g.fill();
        g.fillStyle = COL.mountainDark; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w / 2, y); g.lineTo(x + w * 0.1, y); g.closePath(); g.fill();
        g.fillStyle = COL.snow; g.beginPath(); g.moveTo(x - w * 0.16, y - h * 0.68); g.lineTo(x, y - h); g.lineTo(x + w * 0.16, y - h * 0.68); g.lineTo(x + w * 0.05, y - h * 0.62); g.lineTo(x - w * 0.04, y - h * 0.7); g.closePath(); g.fill();
      }
    });

    // Trees
    const trees = [];
    for (let n = 0; n < 5200; n++) {
      const x = rnd() * W, y = rnd() * H;
      if (onLand(x, y)) trees.push({ x, y, r: 2.6 + rnd() * 3.2, c: pick(COL.tree), con: rnd() < 0.15 });
    }
    trees.sort((a, b) => a.y - b.y).forEach(t => {
      g.fillStyle = "rgba(48,66,26,.25)"; g.beginPath(); g.ellipse(t.x + 1.2, t.y + 1.4, t.r, t.r * 0.6, 0, 0, Math.PI * 2); g.fill();
      if (t.con) { g.fillStyle = "#456341"; g.beginPath(); g.moveTo(t.x, t.y - t.r * 2.2); g.lineTo(t.x + t.r * 0.8, t.y + 1); g.lineTo(t.x - t.r * 0.8, t.y + 1); g.closePath(); g.fill(); }
      else { g.fillStyle = t.c; g.beginPath(); g.arc(t.x, t.y - t.r * 0.3, t.r, 0, Math.PI * 2); g.fill(); }
    });

    // County names
    g.textAlign = "center"; g.textBaseline = "middle";
    geo.counties.forEach(c => {
      const big = c.rings.reduce((a, b) => area(b) > area(a) ? b : a);
      const ctr = centroid(big), nudge = LABEL_NUDGE[c.name] || [0, 0];
      const x = ctr.x + nudge[0] * KX * K, y = ctr.y - nudge[1] * K;
      g.font = `700 21px "Fraunces", Georgia, serif`;
      g.fillStyle = COL.county;
      const text = c.name.toUpperCase().split("").join(" ");
      g.fillText(text, x, y);
    });

    // Labels placed greedily so they don't collide
    const boxes = [];
    const free = b => !boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const label = (text, x, y, font, color, dx = 7) => {
      g.font = font;
      const w = g.measureText(text).width, h = parseInt(font.match(/(\d+)px/)[1], 10);
      for (const [ox, align] of [[dx, "left"], [-dx, "right"]]) {
        const bx = align === "left" ? x + ox : x + ox - w;
        const b = { x: bx - 2, y: y - h / 2 - 2, w: w + 4, h: h + 4 };
        if (free(b)) {
          boxes.push(b);
          g.textAlign = align; g.lineWidth = 3; g.strokeStyle = "rgba(246,248,241,.85)"; g.strokeText(text, x + ox, y);
          g.fillStyle = color; g.fillText(text, x + ox, y);
          return true;
        }
      }
      return false;
    };

    // Croke Park, drawn big
    const ck = proj(croker.lat, croker.lon);
    drawStadium(g, ck.x, ck.y, 26, 19);
    boxes.push({ x: ck.x - 30, y: ck.y - 22, w: 60, h: 44 });
    label("Croke Park", ck.x, ck.y + 30, `800 13px "Overpass", system-ui, sans-serif`, COL.green, 0);

    // Places you can pass
    pois.slice().sort((a, b) => b.lat - a.lat).forEach(p => {
      const c = proj(p.lat, p.lon);
      drawIcon(g, c.x, c.y, iconOf(p));
      boxes.push({ x: c.x - 9, y: c.y - 16, w: 18, h: 20 });
    });
    pois.forEach(p => {
      const c = proj(p.lat, p.lon);
      label(p.name, c.x + 4, c.y - 4, `700 10px "Overpass", system-ui, sans-serif`, ["landmark", "roadside", "pub"].includes(p.kind) ? COL.brown : p.kind === "statue" ? COL.bronze : "#1f4d33", 10);
    });

    // Towns
    g.textBaseline = "middle";
    geo.towns.slice().sort((a, b) => b.size - a.size).forEach(t => {
      const c = proj(t.lat, t.lon);
      const font = t.size === 3 ? `800 14px "Overpass", system-ui, sans-serif` : t.size === 2 ? `700 11.5px "Overpass", system-ui, sans-serif` : `600 10px "Overpass", system-ui, sans-serif`;
      if (label(t.name, c.x, c.y, font, COL.town, t.size === 3 ? 8 : 6)) {
        g.fillStyle = "#fff"; g.strokeStyle = COL.town; g.lineWidth = 1.5;
        g.beginPath(); g.arc(c.x, c.y, t.size === 3 ? 4 : 2.6, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    });
    return cv;
  }
  function drawStadium(g, x, y, rx, ry) {
    g.fillStyle = "rgba(40,50,40,.25)"; g.beginPath(); g.ellipse(x + 2, y + 2.5, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#8b9295"; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#c3c7c6"; g.beginPath(); g.ellipse(x, y, rx * 0.8, ry * 0.76, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#5e9c4c"; g.beginPath(); g.ellipse(x, y, rx * 0.6, ry * 0.52, 0, 0, Math.PI * 2); g.fill();
    if (rx > 12) {
      g.strokeStyle = "#f4f4ee"; g.lineWidth = 0.9;
      g.strokeRect(x - rx * 0.42, y - ry * 0.3, rx * 0.84, ry * 0.6);
      g.beginPath(); g.moveTo(x, y - ry * 0.3); g.lineTo(x, y + ry * 0.3); g.stroke();
    }
  }
  function drawPitch(g, x, y) {
    g.fillStyle = "rgba(40,50,40,.25)"; g.fillRect(x - 6, y - 3, 13, 9);
    g.fillStyle = "#5e9c4c"; g.fillRect(x - 7, y - 4.5, 14, 9);
    g.strokeStyle = "#f4f4ee"; g.lineWidth = 0.9; g.strokeRect(x - 6, y - 3.5, 12, 7);
    g.beginPath(); g.moveTo(x, y - 3.5); g.lineTo(x, y + 3.5); g.stroke();
    g.fillStyle = "#e6a817"; star(g, x, y - 9, 4);
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  // A little bronze figure with a hurley, on a stone plinth.
  function drawStatue(g, x, y) {
    g.fillStyle = "rgba(40,30,20,.25)"; g.beginPath(); g.ellipse(x + 1.5, y + 4, 6, 2.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#c9c4b6"; g.fillRect(x - 5, y, 10, 4);
    g.fillStyle = "#a9a393"; g.fillRect(x - 5, y + 3, 10, 1.2);
    g.fillStyle = COL.bronze;
    g.beginPath(); g.arc(x, y - 10.5, 2.1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - 2.2, y - 8); g.lineTo(x + 2.2, y - 8); g.lineTo(x + 1.6, y - 3); g.lineTo(x - 1.6, y - 3); g.closePath(); g.fill();
    g.strokeStyle = COL.bronze; g.lineCap = "round"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - 1, y - 3); g.lineTo(x - 2, y); g.moveTo(x + 1, y - 3); g.lineTo(x + 2, y); g.stroke();
    g.beginPath(); g.moveTo(x + 2, y - 7.5); g.lineTo(x + 5.5, y - 12.5); g.stroke();
    g.lineWidth = 2.2; g.beginPath(); g.moveTo(x + 5.5, y - 12.5); g.lineTo(x + 6.6, y - 13.6); g.stroke();
  }
  function drawHeritage(g, x, y) {
    g.fillStyle = "rgba(40,30,20,.25)"; g.beginPath(); g.arc(x + 1.2, y + 1.5, 5.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.brown; g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.stroke();
  }

  // ---------------------------------------------------------- cartoon icons
  const iconOf = p => p.icon || ({ ground: "ground", legend: "legend", statue: "statue" }[p.kind]) || "heritage";
  const shadow = (g, x, y, w) => { g.fillStyle = "rgba(40,40,25,.25)"; g.beginPath(); g.ellipse(x + 2, y + 1, w, w * 0.32, 0, 0, Math.PI * 2); g.fill(); };
  const rect = (g, x, y, w, h, fill, stroke) => { g.fillStyle = fill; g.fillRect(x, y, w, h); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.8; g.strokeRect(x, y, w, h); } };
  const tri = (g, ax, ay, bx, by, cx, cy, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.closePath(); g.fill(); };
  const circ = (g, x, y, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  function battlements(g, x, y, w, fill) { for (let i = 0; i < w; i += 3) rect(g, x + i, y - 2, 1.8, 2, fill); }
  // Every icon stands on (x, y): its base sits on the map point.
  function drawIcon(g, x, y, icon) {
    const stone = "#b9b3a4", stoneD = "#8f897a", wall = "#f3efe2", slate = "#5d656b", ink = "#2c2a26";
    switch (icon) {
      case "ground": return drawStadium(g, x, y - 3, 7, 5);
      case "stadium": return drawStadium(g, x, y - 5, 11, 8);
      case "legend": return drawPitch(g, x, y - 3);
      case "statue": return drawStatue(g, x, y);
      case "castle":
        shadow(g, x, y, 11);
        rect(g, x - 9, y - 11, 18, 11, stone, stoneD); battlements(g, x - 9, y - 11, 18, stone);
        rect(g, x - 11, y - 16, 5, 16, stoneD); battlements(g, x - 11, y - 16, 5, stoneD);
        rect(g, x + 6, y - 16, 5, 16, stoneD); battlements(g, x + 6, y - 16, 5, stoneD);
        g.fillStyle = ink; g.beginPath(); g.arc(x, y - 3.2, 2.4, Math.PI, 0); g.lineTo(x + 2.4, y); g.lineTo(x - 2.4, y); g.fill();
        rect(g, x - 9.4, y - 12, 1.4, 2.5, ink); rect(g, x + 8.2, y - 12, 1.4, 2.5, ink);
        return;
      case "tower":
        shadow(g, x, y, 6);
        rect(g, x - 3.5, y - 20, 7, 20, stone, stoneD);
        tri(g, x - 4.5, y - 20, x + 4.5, y - 20, x, y - 27, slate);
        rect(g, x - 1, y - 16, 2, 3, ink); rect(g, x - 1, y - 6, 2, 3, ink);
        return;
      case "manor":
        shadow(g, x, y, 13);
        rect(g, x - 13, y - 11, 26, 11, wall, "#c9c2ad");
        tri(g, x - 14, y - 11, x + 14, y - 11, x, y - 18, slate);
        rect(g, x - 14, y - 17, 6, 17, "#e7e0cd", "#c9c2ad"); tri(g, x - 15, y - 17, x - 7, y - 17, x - 11, y - 22, slate);
        rect(g, x + 8, y - 17, 6, 17, "#e7e0cd", "#c9c2ad"); tri(g, x + 7, y - 17, x + 15, y - 17, x + 11, y - 22, slate);
        for (const wx of [-6, -2, 2, 6]) rect(g, x + wx - 0.8, y - 8, 1.6, 2.6, "#5a7690");
        rect(g, x - 1.2, y - 3.5, 2.4, 3.5, ink);
        return;
      case "pub":
        shadow(g, x, y, 10);
        rect(g, x - 9, y - 12, 15, 12, wall, "#c9c2ad");
        tri(g, x - 10, y - 12, x + 7, y - 12, x - 1.5, y - 17, slate);
        rect(g, x - 9, y - 7, 15, 7, "#1f4d33");
        rect(g, x - 8, y - 11, 13, 3, ink); g.fillStyle = "#e6c35a"; g.fillRect(x - 7, y - 10, 11, 1);
        rect(g, x - 2, y - 6, 3, 6, "#c58b3a");
        // a pint
        rect(g, x + 7, y - 9, 4.2, 9, ink); rect(g, x + 7, y - 9.5, 4.2, 2, "#f6efd8");
        return;
      case "tram":
        shadow(g, x, y, 13);
        g.strokeStyle = "#6d6d6d"; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 15, y); g.lineTo(x + 15, y); g.stroke();
        g.fillStyle = "#d9dcd8"; g.beginPath(); g.roundRect ? g.roundRect(x - 13, y - 10, 26, 9, 3) : g.rect(x - 13, y - 10, 26, 9); g.fill();
        rect(g, x - 13, y - 4, 26, 2, "#7cb342");
        for (let i = -10; i < 12; i += 5) rect(g, x + i, y - 9, 3.5, 3.5, "#3b4a55");
        g.strokeStyle = ink; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x - 3, y - 14); g.lineTo(x + 3, y - 14); g.stroke();
        return;
      case "plane":
        shadow(g, x, y, 10);
        g.fillStyle = "#f4f6f8"; g.strokeStyle = "#7d8a94"; g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(x, y - 9, 12, 2.8, -0.25, 0, Math.PI * 2); g.fill(); g.stroke();
        tri(g, x - 2, y - 9, x + 5, y - 9, x - 4, y - 2, "#dfe5ea");
        tri(g, x - 2, y - 10, x + 4, y - 10, x - 3, y - 16, "#dfe5ea");
        tri(g, x - 10, y - 7, x - 7, y - 8, x - 12, y - 14, "#0a7a5a");
        return;
      case "plaza":
        shadow(g, x, y, 13);
        rect(g, x - 2, y - 9, 13, 9, wall, "#c9c2ad"); rect(g, x + 1, y - 5, 3, 5, "#5a7690"); rect(g, x + 6, y - 5, 3, 4, "#5a7690");
        rect(g, x - 14, y - 13, 13, 2.5, "#00693b");
        rect(g, x - 13, y - 11, 1.4, 11, "#888"); rect(g, x - 3.5, y - 11, 1.4, 11, "#888");
        rect(g, x - 9.5, y - 6, 2.6, 6, "#e6a817");
        rect(g, x - 2, y - 12, 13, 3, "#00693b");
        return;
      case "shrine":
        shadow(g, x, y, 10);
        rect(g, x - 8, y - 10, 12, 10, wall, "#c9c2ad");
        tri(g, x - 9, y - 10, x + 5, y - 10, x - 2, y - 15, slate);
        rect(g, x + 4, y - 16, 5, 16, wall, "#c9c2ad");
        tri(g, x + 3.5, y - 16, x + 9.5, y - 16, x + 6.5, y - 23, slate);
        rect(g, x + 6, y - 27, 1, 4, ink); rect(g, x + 5, y - 26, 3, 1, ink);
        g.fillStyle = "#5a7690"; g.beginPath(); g.arc(x - 2, y - 5, 1.8, Math.PI, 0); g.fill(); rect(g, x - 3.8, y - 5, 3.6, 3, "#5a7690");
        return;
      case "distillery":
        shadow(g, x, y, 10);
        rect(g, x - 11, y - 9, 8, 9, "#b0643a", "#7d4426"); tri(g, x - 12, y - 9, x - 2, y - 9, x - 7, y - 13, slate);
        g.fillStyle = "#c97c3e"; g.beginPath(); g.ellipse(x + 4, y - 5, 6, 5.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#e39c58"; g.beginPath(); g.ellipse(x + 2.5, y - 6.5, 2, 1.5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#a35f2a"; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 4, y - 10); g.lineTo(x + 4, y - 16); g.lineTo(x + 10, y - 13); g.stroke();
        return;
      case "racecourse":
        shadow(g, x, y, 13);
        rect(g, x - 2, y - 10, 13, 8, wall, "#c9c2ad"); rect(g, x - 3, y - 12, 15, 2.5, "#2f5d73");
        g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 14, y - 2); g.lineTo(x + 14, y - 2); g.moveTo(x - 14, y - 4.5); g.lineTo(x + 14, y - 4.5); g.stroke();
        for (let i = -13; i <= 13; i += 4) { g.beginPath(); g.moveTo(x + i, y - 5.5); g.lineTo(x + i, y); g.stroke(); }
        return;
      case "tree":
        shadow(g, x, y, 10);
        circ(g, x - 5, y - 6, 4.5, "#5f7a33"); circ(g, x + 4, y - 7, 5, "#6f8a3a"); circ(g, x, y - 11, 5.5, "#7d9443");
        circ(g, x - 1.5, y - 13, 2, "rgba(255,255,220,.25)");
        return;
      case "mountain":
        shadow(g, x, y, 11);
        tri(g, x - 12, y, x, y - 18, x + 12, y, COL.mountain); tri(g, x, y - 18, x + 12, y, x + 2, y, COL.mountainDark);
        tri(g, x - 4, y - 12, x, y - 18, x + 4, y - 12, COL.snow);
        return;
      case "cliff":
        shadow(g, x, y, 11);
        g.fillStyle = "#9b7f5a"; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x - 12, y - 12); g.lineTo(x + 2, y - 15); g.lineTo(x + 4, y); g.closePath(); g.fill();
        g.fillStyle = "#7da35a"; g.beginPath(); g.moveTo(x - 12, y - 12); g.lineTo(x + 2, y - 15); g.lineTo(x + 2, y - 13); g.lineTo(x - 12, y - 10); g.fill();
        g.strokeStyle = "#8db7bd"; g.lineWidth = 1.3; for (const dy of [2, 5]) { g.beginPath(); g.moveTo(x + 5, y - dy); g.quadraticCurveTo(x + 8, y - dy - 2, x + 12, y - dy); g.stroke(); }
        return;
      case "lighthouse":
        shadow(g, x, y, 6);
        g.fillStyle = "#fbfbf6"; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x - 2.5, y - 18); g.lineTo(x + 2.5, y - 18); g.lineTo(x + 4, y); g.closePath(); g.fill();
        rect(g, x - 3.6, y - 6, 7.2, 3, "#c0392b"); rect(g, x - 3, y - 13, 6, 3, "#c0392b");
        rect(g, x - 3, y - 22, 6, 4, "#f1c40f"); tri(g, x - 3.5, y - 22, x + 3.5, y - 22, x, y - 25, ink);
        return;
      case "mound":
        shadow(g, x, y, 11);
        g.fillStyle = "#86a85c"; g.beginPath(); g.ellipse(x, y, 11, 8, 0, Math.PI, 0); g.fill();
        g.fillStyle = "#e9e6dc"; for (let a = Math.PI; a <= 2 * Math.PI + 0.01; a += Math.PI / 6) { g.beginPath(); g.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 1.2, 1.3, 0, Math.PI * 2); g.fill(); }
        rect(g, x - 1.6, y - 4, 3.2, 4, ink);
        return;
      case "ship":
        shadow(g, x, y, 13);
        g.fillStyle = "#1d1d1d"; g.beginPath(); g.moveTo(x - 14, y - 6); g.lineTo(x + 14, y - 6); g.lineTo(x + 11, y); g.lineTo(x - 12, y); g.closePath(); g.fill();
        rect(g, x - 11, y - 9, 22, 3, "#fbfbf6");
        for (const fx of [-7, -2, 3, 8]) { rect(g, x + fx - 1.4, y - 15, 2.8, 6, "#e0a13a"); rect(g, x + fx - 1.4, y - 15, 2.8, 1.5, ink); }
        g.strokeStyle = "#8db7bd"; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 15, y + 1); g.lineTo(x + 15, y + 1); g.stroke();
        return;
      case "house":
        shadow(g, x, y, 9);
        rect(g, x - 8, y - 8, 16, 8, wall, "#c9c2ad");
        g.fillStyle = COL.thatch || "#e2b764"; g.beginPath(); g.moveTo(x - 10, y - 7); g.quadraticCurveTo(x, y - 17, x + 10, y - 7); g.closePath(); g.fill();
        rect(g, x - 1.2, y - 4.5, 2.4, 4.5, "#c0392b"); rect(g, x - 6, y - 5.5, 2.6, 2.4, "#5a7690"); rect(g, x + 3.5, y - 5.5, 2.6, 2.4, "#5a7690");
        return;
      default:
        return drawHeritage(g, x, y - 4);
    }
  }
  // A small picture of a place's icon, for the pop-ups.
  const iconCache = {};
  function iconURL(icon) {
    if (iconCache[icon]) return iconCache[icon];
    const c = document.createElement("canvas");
    c.width = 96; c.height = 84;
    const g = c.getContext("2d");
    g.scale(2.6, 2.6);
    drawIcon(g, 18.5, 27, icon);
    return (iconCache[icon] = c.toDataURL());
  }

  // ---------------------------------------------------------- live view
  const M = {
    ready: false, world: null, road: null, roadXY: [], marksXY: [], signs: [], pinEl: null, ballEl: null, ball: null, popups: [],
    vw: 0, vh: 0, dpr: 1, R: 1, cam: { x: W / 2, y: H / 2, s: 0.3 }, focusX: 0.5, focusY: 0.5, band: null, frac: 0, anim: null,

    async init(canvas, marksEl, geo, pois, mountains, croker) {
      this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.marksEl = marksEl;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.R = this.dpr >= 2 ? 1.25 : 1;
      // Paint once the web fonts are in, so labels use them (give up after 2.5 s).
      try {
        await Promise.race([
          Promise.all([document.fonts.load('700 21px "Fraunces"'), document.fonts.load('700 10px "Overpass"'), document.fonts.load('800 14px "Overpass"')]),
          new Promise(r => setTimeout(r, 2500))
        ]);
      } catch (e) { /* fall back to system fonts */ }
      this.world = paint(this.R, geo, pois, mountains, croker);
      this.pinEl = document.createElement("div");
      this.pinEl.className = "pin"; this.pinEl.innerHTML = "<i></i>";
      marksEl.appendChild(this.pinEl);
      // The ball that bounces along the road between stops (football or sliotar).
      this.ballEl = document.createElement("div");
      this.ballEl.className = "road-ball"; this.ballEl.hidden = true;
      this.ballEl.innerHTML = `<i class="rb-shadow"></i><svg class="rb rb-f" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="#fbfbf7" stroke="#2b2b2b" stroke-width="1.3"/><path d="M10 1.5 V18.5 M1.5 10 H18.5 M4 4 Q10 9 16 4 M4 16 Q10 11 16 16" stroke="#9a9a92" stroke-width="1" fill="none"/></svg><svg class="rb rb-s" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="#fbfbf3" stroke="#3a3a3a" stroke-width="1.2"/><path d="M3.4 9 Q6 5 10 7.5 Q14 10 16.6 6.5 M3.4 13 Q6 9.5 10 12 Q14 14.5 16.6 11" stroke="#8a7a66" stroke-width="1.2" fill="none"/></svg>`;
      marksEl.appendChild(this.ballEl);
      this.ready = true;
      this.resize();
      window.addEventListener("resize", () => this.resize());
    },
    resize() {
      this.vw = window.innerWidth; this.vh = window.innerHeight;
      this.canvas.width = Math.round(this.vw * this.dpr); this.canvas.height = Math.round(this.vh * this.dpr);
      this.canvas.style.width = this.vw + "px"; this.canvas.style.height = this.vh + "px";
      this.draw();
    },
    followScale() { return Math.max(0.6, Math.min(1.15, Math.min(this.vw / 620, this.vh / 800))); },

    setRoad(road) {
      this.road = road;
      this.popups.forEach(p => p.el.remove()); this.popups = [];
      if (this.ballEl) { this.ballEl.hidden = true; this.ball = null; }
      this.roadXY = road.pts.map(p => ({ ...proj(p.lat, p.lon), d: p.d }));
      this.signs.forEach(s => s.el.remove());
      this.signs = road.marks.map((m, i) => {
        const el = document.createElement("div");
        const last = i === road.marks.length - 1;
        el.className = "sign" + (i === 0 ? " sign-home" : last ? " sign-croker" : " sign-" + m.kind);
        el.innerHTML = "<b></b><span></span>";
        el.firstChild.textContent = i === 0 ? m.name : m.name;
        el.lastChild.textContent = i === 0 ? "Home · 0 km" : last ? `${Math.round(road.total)} km` : `${m.tag} · ${Math.round(m.km)} km`;
        this.marksEl.insertBefore(el, this.pinEl);
        return { el, ...proj(m.lat, m.lon) };
      });
      this.draw();
    },
    pointAtKm(d) {
      const p = this.roadXY;
      if (!p.length) return { x: W / 2, y: H / 2 };
      d = Math.max(0, Math.min(p[p.length - 1].d, d));
      let lo = 0, hi = p.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].d < d) lo = m; else hi = m; }
      const a = p[lo], b = p[hi], t = (d - a.d) / ((b.d - a.d) || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
    pinKm() { return this.road ? this.frac * this.road.total : 0; },
    overviewCam() {
      const xs = this.roadXY.map(p => p.x), ys = this.roadXY.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const bw = this.band ? this.band.w : this.vw, bh = this.band ? this.band.h : this.vh * 0.5;
      const s = Math.max(0.1, Math.min(this.followScale(), (bw - 40) / (maxX - minX + 160), (bh - 30) / (maxY - minY + 110)));
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 - 20 / s, s };
    },
    islandCam() {
      const bw = this.band ? this.band.w : this.vw, bh = this.band ? this.band.h : this.vh;
      return { x: W / 2, y: H / 2 + 20, s: Math.max(0.1, Math.min(bw / (W - 80), bh / (H - 160))) };
    },
    followCam() { const p = this.pointAtKm(this.pinKm()); return { x: p.x, y: p.y, s: this.followScale() }; },

    draw() {
      if (!this.ready) return;
      const g = this.ctx, d = this.dpr, { s } = this.cam;
      const ox = this.vw * this.focusX - this.cam.x * s, oy = this.vh * this.focusY - this.cam.y * s;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = COL.sea; g.fillRect(0, 0, this.vw, this.vh);
      g.imageSmoothingQuality = "high";
      g.drawImage(this.world, ox, oy, W * s, H * s);
      if (this.roadXY.length) {
        g.setTransform(d * s, 0, 0, d * s, d * ox, d * oy);
        g.lineCap = "round"; g.lineJoin = "round";
        const path = new Path2D();
        this.roadXY.forEach((p, i) => i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y));
        const lw = 1 / s;
        g.strokeStyle = COL.roadEdge; g.lineWidth = Math.max(9, 11 * lw); g.stroke(path);
        g.strokeStyle = COL.road; g.lineWidth = Math.max(6.5, 8 * lw); g.stroke(path);
        g.setLineDash([Math.max(5, 6 * lw), Math.max(6, 8 * lw)]); g.strokeStyle = "rgba(185,167,122,.7)"; g.lineWidth = Math.max(1, 1.2 * lw); g.stroke(path); g.setLineDash([]);
        const end = this.pinKm();
        const trail = new Path2D();
        let started = false;
        for (const p of this.roadXY) { if (p.d > end) break; started ? trail.lineTo(p.x, p.y) : trail.moveTo(p.x, p.y); started = true; }
        const pp = this.pointAtKm(end);
        if (started) trail.lineTo(pp.x, pp.y);
        g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = Math.max(7, 9 * lw); g.stroke(trail);
        g.strokeStyle = COL.trail; g.lineWidth = Math.max(4.5, 6 * lw); g.stroke(trail);
        this.pinEl.style.transform = `translate(${ox + pp.x * s}px, ${oy + pp.y * s}px)`;
        this.pinEl.hidden = false;
      } else if (this.pinEl) this.pinEl.hidden = true;
      const far = s < this.followScale() * 0.55;
      this.marksEl.classList.toggle("far", far);
      this.signs.forEach(sg => { sg.el.style.transform = `translate(${ox + sg.x * s}px, ${oy + sg.y * s - 12}px) translate(-50%, -100%)`; });
      this.popups.forEach(pu => { pu.el.style.transform = `translate(${ox + pu.x * s}px, ${oy + pu.y * s - 54}px) translate(-50%, -100%)`; });
      if (this.ball && this.roadXY.length) {
        const bp = this.pointAtKm(this.pinKm());
        this.ballEl.style.transform = `translate(${ox + bp.x * s}px, ${oy + bp.y * s}px)`;
        this.ballEl.style.setProperty("--hop", `${-this.ball.hop}px`);
        this.ballEl.style.setProperty("--spin", `${this.ball.spin}deg`);
        this.ballEl.style.setProperty("--sq", String(1 - Math.min(0.5, this.ball.hop / 60)));
      }
    },
    // A card that pops up over a place as you pass it, then fades.
    popup(mark) {
      // One card at a time: a new place pushes the last one off.
      this.popups.forEach(pu => pu.dismiss());
      const el = document.createElement("div");
      el.className = "map-pop pop-" + mark.kind;
      el.innerHTML = `<img alt="" src="${iconURL(mark.icon || ({ ground: "ground", legend: "legend", statue: "statue", croker: "stadium" }[mark.kind]) || "heritage")}"><div><b></b><span></span></div>`;
      el.querySelector("b").textContent = mark.name;
      el.querySelector("span").textContent = mark.tag || "";
      this.marksEl.appendChild(el);
      const pu = { el, ...proj(mark.lat, mark.lon) };
      let gone = false;
      pu.dismiss = () => {
        if (gone) return; gone = true;
        el.classList.add("out");
        setTimeout(() => { el.remove(); this.popups = this.popups.filter(x => x !== pu); }, 300);
      };
      this.popups.push(pu);
      this.draw();
      requestAnimationFrame(() => el.classList.add("in"));
      setTimeout(pu.dismiss, 5200);
    },
    setFocus(fx, fy, band) { this.focusX = fx; this.focusY = fy; this.band = band; this.draw(); },
    jumpTo(frac) { this.frac = frac; this.cam = this.followCam(); this.draw(); },
    moveCam(to, ms) {
      const from = { ...this.cam };
      return this._animate(ms, e => {
        // zoom on a log scale so it feels even
        this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, s: Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e) };
      });
    },
    showOverview(ms = 0) { const c = this.overviewCam(); if (!ms) { this.cam = c; this.draw(); return Promise.resolve(); } return this.moveCam(c, ms); },
    zoomToPin(ms = 1400) { return this.moveCam(this.followCam(), ms); },
    // Move the pin along the road, with the ball bouncing ahead of it and a
    // pop-up for each place passed. sport: "hurling" for a sliotar.
    travelTo(frac, ms = 1800, sport) {
      const from = this.frac;
      if (frac === from) return this.zoomToPin(500);
      const s0 = this.cam.s, s1 = this.followScale();
      const fromKm = from * (this.road ? this.road.total : 0), toKm = frac * (this.road ? this.road.total : 0);
      const passing = this.road ? this.road.marks.filter((m, i) => i > 0 && m.km > fromKm + 0.01 && m.km <= toKm + 0.01) : [];
      const a = this.pointAtKm(fromKm), b = this.pointAtKm(toKm);
      const hops = Math.max(2, Math.min(7, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * s1 / 90)));
      this.ballEl.classList.toggle("sliotar", sport === "hurling");
      this.ballEl.hidden = false;
      const ball = this.ball = { hop: 0, spin: 0 };
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const done = this._animate(ms, e => {
        this.frac = from + (frac - from) * e;
        const p = this.pointAtKm(this.pinKm());
        this.cam = { x: p.x, y: p.y, s: s0 + (s1 - s0) * Math.min(1, e * 3) };
        const decay = 1 - e * 0.55;
        ball.hop = reduce ? 0 : Math.abs(Math.sin(Math.PI * hops * e)) * 26 * decay;
        ball.spin = e * 720;
        while (passing.length && this.pinKm() >= passing[0].km - 0.01) this.popup(passing.shift());
      });
      return done.then(() => {
        passing.forEach(m => this.popup(m));
        // hide it unless a newer trip has already picked the ball up
        setTimeout(() => { if (this.ball === ball) { this.ballEl.hidden = true; this.ball = null; } }, 700);
      });
    },
    _animate(ms, step) {
      if (this.anim) cancelAnimationFrame(this.anim);
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 1;
      return new Promise(res => {
        const t0 = performance.now();
        const tick = now => {
          const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          step(e); this.draw();
          if (t < 1) this.anim = requestAnimationFrame(tick); else { this.anim = null; res(); }
        };
        this.anim = requestAnimationFrame(tick);
      });
    }
  };
  root.PuckoutMap = M;
})(window);
