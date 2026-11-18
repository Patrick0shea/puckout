/*
 * The road map: a hand-drawn-looking stretch of countryside, generated once
 * from a fixed seed, with the road running from your club pitch to Croke Park.
 * The countryside is painted to an offscreen canvas; each frame just copies
 * the visible window, draws the stretch of road travelled and moves the pin.
 */
(function (root) {
  "use strict";
  // OY pads the countryside above and below the road so the camera can keep
  // the pin clear of the cards at both ends of the journey.
  const OY = 260, W = 1400, H = 2000 + OY + 700;
  const COLORS = {
    meadow: "#b7cc8f",
    fields: ["#a9c47f", "#b5cc8a", "#9fbd76", "#c2d49a", "#b8c98a", "#a4bf7c", "#bccf8e"],
    stubble: "#d9cf98",
    hedge: "#7f9a59",
    water: "#b9d0d2",
    waterEdge: "#97b8bb",
    roadEdge: "#c8b78b",
    road: "#eee4c6",
    trail: "#e6a817",
    tree: ["#6f8a3a", "#7d9443", "#5f7a33", "#879b48"],
    conifer: "#456341",
    pitch: "#5e9c4c", pitchStripe: "#6aa857", line: "#f7f7f2",
    stand: "#a6abaa", standRoof: "#7b8382", terrace: "#b5ab92",
    wall: "#f4f0e4", thatch: "#e2b764", slate: "#646b70"
  };

  // Road control points, bottom-left (club) to top-right (Croke Park).
  const CTRL = [[220, 1930], [250, 1780], [420, 1660], [380, 1500], [560, 1400], [760, 1440], [910, 1300],
    [830, 1130], [630, 1050], [560, 880], [720, 760], [930, 720], [1070, 600], [990, 450], [1110, 330]].map(([x, y]) => [x, y + OY]);
  const CROKER = { x: 1165, y: 185 + OY, rx: 175, ry: 125 };
  const LAKES = [{ x: 210, y: 1060 + OY, r: 150 }, { x: 1180, y: 1520 + OY, r: 125 }];

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Catmull-Rom through the control points, then arc-length table.
  function buildRoad() {
    const pts = [];
    const P = [CTRL[0]].concat(CTRL, [CTRL[CTRL.length - 1]]);
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      for (let s = 0; s < 24; s++) {
        const t = s / 24, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
      }
    }
    pts.push({ x: CTRL[CTRL.length - 1][0], y: CTRL[CTRL.length - 1][1] });
    let L = 0;
    pts[0].d = 0;
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].d = L; }
    return { pts, length: L };
  }
  const ROAD = buildRoad();

  function pointAt(dist) {
    const p = ROAD.pts;
    dist = Math.max(0, Math.min(ROAD.length, dist));
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].d < dist) lo = m; else hi = m; }
    const a = p[lo], b = p[hi], t = (dist - a.d) / ((b.d - a.d) || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x), i: lo };
  }

  let maxKm = 700;
  const kmToDist = km => ROAD.length * (0.03 + 0.95 * Math.max(0, Math.min(1, km / maxKm)));

  function distToRoad(x, y) {
    let m = Infinity;
    for (let i = 0; i < ROAD.pts.length; i += 2) {
      const p = ROAD.pts[i];
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  }

  // ---------- Painting the countryside ----------
  function paintWorld(R, stops) {
    const cv = document.createElement("canvas");
    cv.width = Math.round(W * R); cv.height = Math.round(H * R);
    const g = cv.getContext("2d");
    g.scale(R, R);
    const rnd = rng(20261118);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];

    g.fillStyle = COLORS.meadow; g.fillRect(0, 0, W, H);

    // Patchwork fields on a jittered lattice
    const S = 92, cols = Math.ceil(W / S) + 2, rows = Math.ceil(H / S) + 2;
    const lat = [];
    for (let i = 0; i < cols; i++) {
      lat[i] = [];
      for (let j = 0; j < rows; j++) lat[i][j] = { x: (i - 0.5) * S + (rnd() - 0.5) * 50, y: (j - 0.5) * S + (rnd() - 0.5) * 50 };
    }
    g.lineJoin = "round";
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows - 1; j++) {
      const q = [lat[i][j], lat[i + 1][j], lat[i + 1][j + 1], lat[i][j + 1]];
      g.beginPath(); q.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
      g.fillStyle = rnd() < 0.08 ? COLORS.stubble : pick(COLORS.fields);
      g.fill();
      if (rnd() < 0.3) { // mowing lines
        g.save(); g.clip();
        g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 3;
        const ang = rnd() * Math.PI, cx = (q[0].x + q[2].x) / 2, cy = (q[0].y + q[2].y) / 2;
        for (let k = -70; k <= 70; k += 9) {
          g.beginPath();
          g.moveTo(cx + Math.cos(ang) * -80 - Math.sin(ang) * k, cy + Math.sin(ang) * -80 + Math.cos(ang) * k);
          g.lineTo(cx + Math.cos(ang) * 80 - Math.sin(ang) * k, cy + Math.sin(ang) * 80 + Math.cos(ang) * k);
          g.stroke();
        }
        g.restore();
      }
      g.strokeStyle = COLORS.hedge; g.lineWidth = 3.2; g.stroke();
    }

    // Loughs and a river
    const blob = (cx, cy, r) => {
      g.beginPath();
      for (let k = 0; k <= 28; k++) {
        const a = (k / 28) * Math.PI * 2, rr = r * (0.82 + 0.18 * Math.sin(a * 3 + cx) + (k % 28 === 0 ? 0 : 0));
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    };
    g.lineCap = "round";
    g.save(); g.translate(0, OY);
    g.strokeStyle = COLORS.waterEdge; g.lineWidth = 30;
    g.beginPath(); g.moveTo(-20, 1260); g.bezierCurveTo(80, 1220, 120, 1150, 190, 1100); g.stroke();
    g.beginPath(); g.moveTo(1420, 1700); g.bezierCurveTo(1300, 1660, 1230, 1600, 1190, 1540); g.stroke();
    g.strokeStyle = COLORS.water; g.lineWidth = 22;
    g.beginPath(); g.moveTo(-20, 1260); g.bezierCurveTo(80, 1220, 120, 1150, 190, 1100); g.stroke();
    g.beginPath(); g.moveTo(1420, 1700); g.bezierCurveTo(1300, 1660, 1230, 1600, 1190, 1540); g.stroke();
    g.restore();
    LAKES.forEach(l => {
      blob(l.x, l.y, l.r + 6); g.fillStyle = COLORS.waterEdge; g.fill();
      blob(l.x, l.y, l.r); g.fillStyle = COLORS.water; g.fill();
      g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 2;
      for (let k = 0; k < 7; k++) { // ripples
        const x = l.x + (rnd() - 0.5) * l.r, y = l.y + (rnd() - 0.5) * l.r * 0.8;
        g.beginPath(); g.moveTo(x - 9, y); g.quadraticCurveTo(x - 4, y - 4, x, y); g.quadraticCurveTo(x + 4, y + 4, x + 9, y); g.stroke();
      }
    });

    // The road
    const roadPath = () => { g.beginPath(); ROAD.pts.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); };
    g.lineJoin = "round"; g.lineCap = "round";
    roadPath(); g.strokeStyle = COLORS.roadEdge; g.lineWidth = 30; g.stroke();
    roadPath(); g.strokeStyle = COLORS.road; g.lineWidth = 23; g.stroke();

    // Grounds along the road
    const venues = stops.map((st, i) => {
      if (st.kind === "croker") return { x: CROKER.x, y: CROKER.y, r: 210, st };
      const p = pointAt(kmToDist(st.km));
      const side = i % 2 ? 1 : -1;
      const off = 105;
      return { x: p.x - Math.sin(p.angle) * off * side, y: p.y + Math.cos(p.angle) * off * side, r: 120, angle: p.angle, st };
    });
    venues.forEach(v => drawVenue(g, v, rnd));

    // Scatter: trees, cottages, sheep, haystacks — kept off the road, water and grounds
    const clear = (x, y, pad) => {
      if (distToRoad(x, y) < 26 + pad) return false;
      if (LAKES.some(l => Math.hypot(x - l.x, (y - l.y) / 0.8) < l.r + pad)) return false;
      if (venues.some(v => Math.hypot(x - v.x, y - v.y) < v.r + pad * 0.5)) return false;
      if (Math.hypot(x - CROKER.x, y - CROKER.y) < 230) return false;
      return true;
    };
    const items = [];
    // trees cluster along hedgerows: sample near lattice edges
    for (let n = 0; n < 1100; n++) {
      const i = Math.floor(rnd() * (cols - 1)), j = Math.floor(rnd() * (rows - 1));
      const a = lat[i][j], b = rnd() < 0.5 ? lat[i + 1][j] : lat[i][j + 1], t = rnd();
      const x = a.x + (b.x - a.x) * t + (rnd() - 0.5) * 10, y = a.y + (b.y - a.y) * t + (rnd() - 0.5) * 10;
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10 || !clear(x, y, 12)) continue;
      items.push({ type: rnd() < 0.14 ? "conifer" : "tree", x, y, r: 7 + rnd() * 9, c: pick(COLORS.tree) });
    }
    for (let n = 0; n < 70; n++) {
      const x = rnd() * W, y = rnd() * H;
      if (clear(x, y, 22)) items.push({ type: "house", x, y, roof: rnd() < 0.6 ? COLORS.thatch : COLORS.slate, a: (rnd() - 0.5) * 0.5 });
    }
    for (let n = 0; n < 160; n++) {
      const x = rnd() * W, y = rnd() * H;
      if (clear(x, y, 8)) items.push({ type: rnd() < 0.25 ? "hay" : "sheep", x, y });
    }
    items.sort((a, b) => a.y - b.y).forEach(it => drawItem(g, it));
    return { canvas: cv, venues };
  }

  function drawItem(g, it) {
    const { x, y } = it;
    if (it.type === "tree") {
      g.fillStyle = "rgba(48,66,26,.28)"; g.beginPath(); g.ellipse(x + it.r * 0.35, y + it.r * 0.45, it.r, it.r * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = it.c; g.beginPath(); g.arc(x, y - it.r * 0.3, it.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,220,.18)"; g.beginPath(); g.arc(x - it.r * 0.3, y - it.r * 0.6, it.r * 0.5, 0, Math.PI * 2); g.fill();
    } else if (it.type === "conifer") {
      g.fillStyle = "rgba(48,66,26,.28)"; g.beginPath(); g.ellipse(x + 4, y + 3, it.r * 0.6, it.r * 0.35, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = COLORS.conifer; g.beginPath(); g.moveTo(x, y - it.r * 2); g.lineTo(x + it.r * 0.7, y + 2); g.lineTo(x - it.r * 0.7, y + 2); g.closePath(); g.fill();
    } else if (it.type === "house") {
      g.save(); g.translate(x, y); g.rotate(it.a);
      g.fillStyle = "rgba(40,50,30,.25)"; g.fillRect(-10, -3, 24, 12);
      g.fillStyle = COLORS.wall; g.fillRect(-12, -6, 22, 11);
      g.fillStyle = it.roof; g.beginPath(); g.moveTo(-14, -6); g.lineTo(-1, -15); g.lineTo(12, -6); g.closePath(); g.fill();
      g.fillStyle = "#3d4a44"; g.fillRect(-3, -1, 4, 6);
      g.restore();
    } else if (it.type === "sheep") {
      g.fillStyle = "#fbfaf4"; g.beginPath(); g.ellipse(x, y, 4, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#3b3b35"; g.beginPath(); g.arc(x + 4, y - 1, 1.4, 0, Math.PI * 2); g.fill();
    } else if (it.type === "hay") {
      g.fillStyle = "rgba(60,60,20,.25)"; g.beginPath(); g.ellipse(x + 2, y + 3, 7, 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#e0ac46"; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#c48d2e"; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.stroke();
    }
  }

  function drawPitch(g, w, h) {
    const n = 8;
    for (let k = 0; k < n; k++) { g.fillStyle = k % 2 ? COLORS.pitch : COLORS.pitchStripe; g.fillRect(-w / 2 + (w / n) * k, -h / 2, w / n + 0.5, h); }
    g.strokeStyle = COLORS.line; g.lineWidth = 1.4;
    g.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    [0.14, 0.31, 0.5, 0.69, 0.86].forEach(f => { g.beginPath(); g.moveTo(-w / 2 + w * f, -h / 2 + 3); g.lineTo(-w / 2 + w * f, h / 2 - 3); g.stroke(); });
    [-1, 1].forEach(s => { // small and large rectangles, posts
      g.strokeRect(s < 0 ? -w / 2 + 3 : w / 2 - 3 - w * 0.05, -h * 0.12, w * 0.05, h * 0.24);
      g.strokeRect(s < 0 ? -w / 2 + 3 : w / 2 - 3 - w * 0.1, -h * 0.2, w * 0.1, h * 0.4);
      g.lineWidth = 2.4; g.beginPath();
      g.moveTo(s * (w / 2 + 1), -h * 0.06); g.lineTo(s * (w / 2 + 1), h * 0.06); g.stroke();
      g.lineWidth = 1.4;
    });
  }
  function drawStand(g, x, y, w, h, roof) {
    g.fillStyle = "rgba(40,50,40,.25)"; g.fillRect(x + 3, y + 4, w, h);
    g.fillStyle = COLORS.stand; g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1;
    for (let k = 3; k < h; k += 4) { g.beginPath(); g.moveTo(x + 2, y + k); g.lineTo(x + w - 2, y + k); g.stroke(); }
    if (roof) { g.fillStyle = COLORS.standRoof; g.fillRect(x - 2, y - 3, w + 4, h * 0.45); }
  }
  function drawVenue(g, v, rnd) {
    const k = v.st.kind;
    if (k === "croker") return drawCroker(g);
    g.save(); g.translate(v.x, v.y); g.rotate((v.angle || 0) * 0.35);
    const size = { club: [120, 76], parish: [126, 80], county: [134, 84], province: [146, 92], semi: [152, 96] }[k];
    const [w, h] = size;
    // car park / apron
    g.fillStyle = "#cfd1c2"; g.fillRect(-w / 2 - 14, -h / 2 - 22, w + 28, h + 44);
    drawPitch(g, w, h);
    if (k === "club") {
      g.fillStyle = COLORS.wall; g.fillRect(-w / 2 - 8, h / 2 + 6, 34, 14);
      g.fillStyle = COLORS.slate; g.fillRect(-w / 2 - 10, h / 2 + 4, 38, 6);
    }
    if (k === "parish") drawStand(g, -w * 0.25, -h / 2 - 18, w * 0.5, 14, false);
    if (k === "county") { drawStand(g, -w * 0.35, -h / 2 - 20, w * 0.7, 16, true); g.fillStyle = COLORS.terrace; g.fillRect(-w * 0.4, h / 2 + 6, w * 0.8, 12); }
    if (k === "province" || k === "semi") {
      drawStand(g, -w * 0.42, -h / 2 - 21, w * 0.84, 18, true);
      drawStand(g, -w * 0.42, h / 2 + 4, w * 0.84, 18, true);
      g.fillStyle = COLORS.terrace; g.fillRect(-w / 2 - 12, -h * 0.35, 9, h * 0.7); g.fillRect(w / 2 + 3, -h * 0.35, 9, h * 0.7);
    }
    g.restore();
  }
  function drawCroker(g) {
    const { x, y, rx, ry } = CROKER;
    g.save(); g.translate(x, y);
    g.fillStyle = "rgba(40,50,40,.28)"; g.beginPath(); g.ellipse(8, 10, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d3d5cc"; g.beginPath(); g.ellipse(0, 0, rx + 18, ry + 18, 0, 0, Math.PI * 2); g.fill(); // concourse
    g.fillStyle = COLORS.standRoof; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();     // roof ring
    // open terrace at one end (the Hill)
    g.fillStyle = COLORS.terrace; g.beginPath(); g.moveTo(0, 0); g.ellipse(0, 0, rx, ry, 0, Math.PI * 0.8, Math.PI * 1.2); g.closePath(); g.fill();
    g.fillStyle = "#b9bdbd"; g.beginPath(); g.ellipse(0, 0, rx * 0.8, ry * 0.76, 0, 0, Math.PI * 2); g.fill();   // seating bowl
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1;
    for (let k = 0.82; k < 1; k += 0.05) { g.beginPath(); g.ellipse(0, 0, rx * k, ry * k, 0, Math.PI * 1.22, Math.PI * 2.78); g.stroke(); }
    g.save(); g.beginPath(); g.ellipse(0, 0, rx * 0.66, ry * 0.6, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = COLORS.pitch; g.fillRect(-rx, -ry, rx * 2, ry * 2);
    g.restore();
    drawPitch(g, rx * 1.08, ry * 0.86);
    // roof cross-bracing glints
    g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1.5;
    for (let a = Math.PI * 1.25; a < Math.PI * 2.75; a += 0.18) {
      g.beginPath(); g.moveTo(Math.cos(a) * rx * 0.82, Math.sin(a) * ry * 0.8); g.lineTo(Math.cos(a) * rx * 0.99, Math.sin(a) * ry * 0.99); g.stroke();
    }
    g.restore();
  }

  // ---------- Live view ----------
  const M = {
    canvas: null, ctx: null, marks: null, pinEl: null, world: null, venues: [], R: 1,
    pinKm: 0, focus: null, vw: 0, vh: 0, dpr: 1, anim: null, focusY: 0.5,

    init(canvas, marks, stops) {
      maxKm = stops[stops.length - 1].km;
      this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.marks = marks;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.R = this.dpr >= 2 ? 1.3 : 1.05; // keeps the painted map under ~7 megapixels for phones
      const painted = paintWorld(this.R, stops);
      this.world = painted.canvas; this.venues = painted.venues;
      // signs
      marks.innerHTML = "";
      this.signs = this.venues.map(v => {
        const el = document.createElement("div");
        el.className = "sign" + (v.st.kind === "croker" ? " sign-croker" : "");
        el.innerHTML = `<b></b><span></span>`;
        el.firstChild.textContent = v.st.name;
        el.lastChild.textContent = `${v.st.km} km`;
        marks.appendChild(el);
        return { el, x: v.x, y: v.y - (v.st.kind === "croker" ? CROKER.ry + 26 : 66) };
      });
      this.pinEl = document.createElement("div");
      this.pinEl.className = "pin";
      this.pinEl.innerHTML = "<i></i>";
      marks.appendChild(this.pinEl);
      this.focus = pointAt(kmToDist(0));
      this.resize();
      window.addEventListener("resize", () => this.resize());
    },
    resize() {
      this.vw = window.innerWidth; this.vh = window.innerHeight;
      this.canvas.width = Math.round(this.vw * this.dpr); this.canvas.height = Math.round(this.vh * this.dpr);
      this.canvas.style.width = this.vw + "px"; this.canvas.style.height = this.vh + "px";
      this.draw();
    },
    scale() { return Math.max(0.55, Math.min(1.15, Math.min(this.vw / 700, this.vh / 900))); },
    camera() {
      const s = this.scale();
      const clampAxis = (o, view, size) => size * s <= view ? (view - size * s) / 2 : Math.min(0, Math.max(view - size * s, o));
      const ox = clampAxis(this.vw / 2 - this.focus.x * s, this.vw, W);
      const oy = clampAxis(this.vh * this.focusY - this.focus.y * s, this.vh, H);
      return { s, ox, oy };
    },
    draw() {
      if (!this.ctx) return;
      const g = this.ctx, { s, ox, oy } = this.camera(), d = this.dpr;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = COLORS.meadow; g.fillRect(0, 0, this.vw, this.vh);
      g.drawImage(this.world, ox, oy, W * s, H * s);
      // the stretch travelled
      const end = kmToDist(this.pinKm), start = kmToDist(0);
      g.setTransform(d * s, 0, 0, d * s, d * ox, d * oy);
      g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath();
      let p = pointAt(start); g.moveTo(p.x, p.y);
      for (const q of ROAD.pts) if (q.d > start && q.d < end) g.lineTo(q.x, q.y);
      p = pointAt(end); g.lineTo(p.x, p.y);
      g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 11; g.stroke();
      g.strokeStyle = COLORS.trail; g.lineWidth = 7; g.stroke();
      // overlay positions
      this.signs.forEach(sg => { sg.el.style.transform = `translate(${ox + sg.x * s}px, ${oy + sg.y * s}px) translate(-50%, -100%)`; });
      this.pinEl.style.transform = `translate(${ox + p.x * s}px, ${oy + p.y * s}px)`;
    },
    setFocusY(f) { this.focusY = f; this.draw(); },
    jumpTo(km) { this.pinKm = km; this.focus = pointAt(kmToDist(km)); this.draw(); },
    // Animate the camera from one point on the road to another (used for the opening flyover).
    pan(fromKm, toKm, ms) {
      return this._animate(ms, t => { this.focus = pointAt(kmToDist(fromKm + (toKm - fromKm) * t)); });
    },
    travelTo(km, ms = 1600) {
      const from = this.pinKm, to = km;
      if (to === from) { this.focus = pointAt(kmToDist(to)); this.draw(); return Promise.resolve(); }
      return this._animate(ms, t => { this.pinKm = from + (to - from) * t; this.focus = pointAt(kmToDist(this.pinKm)); });
    },
    _animate(ms, step) {
      if (this.anim) cancelAnimationFrame(this.anim);
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) ms = 1;
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
