/*
 * A cartoon Gaelic footballer who kicks the ball for each answer, or on
 * hurling questions a hurler in a helmet who strikes a sliotar.
 * The rarer the answer, the bigger the kick; a wrong guess goes wide.
 * He wears the player's home county colours and stands at the pin.
 */
(function (root) {
  "use strict";
  // Jersey colours: [main, trim, shorts]
  const COLOURS = {
    Antrim: ["#f2b318", "#ffffff", "#ffffff"], Armagh: ["#f47a20", "#ffffff", "#ffffff"], Carlow: ["#d0212e", "#f5d00f", "#1f7a3d"],
    Cavan: ["#1c52a3", "#ffffff", "#ffffff"], Clare: ["#f5c20d", "#1d4f9e", "#1d4f9e"], Cork: ["#d0212e", "#ffffff", "#ffffff"],
    Derry: ["#ffffff", "#d0212e", "#ffffff"], Donegal: ["#f5c20d", "#167a3d", "#ffffff"], Down: ["#c8102e", "#111111", "#111111"],
    Dublin: ["#5ea7dc", "#0b2550", "#0b2550"], Fermanagh: ["#16823f", "#ffffff", "#ffffff"], Galway: ["#7a1f2f", "#ffffff", "#ffffff"],
    Kerry: ["#127a3c", "#f5c20d", "#ffffff"], Kildare: ["#ffffff", "#d8d8d8", "#ffffff"], Kilkenny: ["#141414", "#f2a900", "#ffffff"],
    Laois: ["#1d4f9e", "#ffffff", "#ffffff"], Leitrim: ["#167a3d", "#f5c20d", "#ffffff"], Limerick: ["#16823f", "#ffffff", "#ffffff"],
    Longford: ["#1d4f9e", "#f5c20d", "#ffffff"], Louth: ["#d0212e", "#ffffff", "#ffffff"], Mayo: ["#16823f", "#d0212e", "#ffffff"],
    Meath: ["#167a3d", "#f5c20d", "#ffffff"], Monaghan: ["#ffffff", "#1d4f9e", "#ffffff"], Offaly: ["#16823f", "#f5c20d", "#ffffff"],
    Roscommon: ["#f6e27f", "#1d4f9e", "#1d4f9e"], Sligo: ["#141414", "#ffffff", "#ffffff"], Tipperary: ["#1d4f9e", "#f5c20d", "#ffffff"],
    Tyrone: ["#ffffff", "#c8102e", "#ffffff"], Waterford: ["#ffffff", "#1d6fb8", "#1d6fb8"], Westmeath: ["#7a1f2f", "#ffffff", "#ffffff"],
    Wexford: ["#5b2a86", "#f5c20d", "#ffffff"], Wicklow: ["#1d4f9e", "#f5c20d", "#ffffff"]
  };
  const DEFAULT = ["#00693b", "#e6a817", "#ffffff"];

  // Distance (px), height (px) and flight time (ms) per tier
  const FLIGHT = {
    junior: [70, 34, 650], inter: [115, 60, 750], senior: [165, 90, 850],
    county: [215, 120, 950], allstar: [280, 165, 1100], wide: [120, 55, 800]
  };

  const svg = `
    <svg class="kp" viewBox="0 0 100 120" aria-hidden="true">
      <ellipse cx="50" cy="111" rx="20" ry="4" fill="rgba(30,40,25,.28)"/>
      <path class="kp-arm-back" d="M41 46 L30 60" stroke="var(--skin)" stroke-width="5" stroke-linecap="round"/>
      <path d="M48 72 L45 106" stroke="var(--sock)" stroke-width="7" stroke-linecap="round"/>
      <path d="M45 106 L38 108" stroke="#1d1d1d" stroke-width="6" stroke-linecap="round"/>
      <g class="kp-leg">
        <path d="M53 72 L56 90 L58 104" stroke="var(--sock)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M58 104 L66 105" stroke="#1d1d1d" stroke-width="6" stroke-linecap="round"/>
      </g>
      <rect x="40" y="64" width="20" height="12" rx="3" fill="var(--shorts)" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
      <rect x="38" y="38" width="24" height="30" rx="7" fill="var(--jersey)" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
      <rect x="38" y="50" width="24" height="6" fill="var(--trim)"/>
      <path class="kp-arm-front" d="M60 46 L71 56" stroke="var(--skin)" stroke-width="5" stroke-linecap="round"/>
      <circle cx="50" cy="28" r="10" fill="var(--skin)"/>
      <path d="M40 26 Q41 16 50 16 Q60 16 60 25 Q55 21 49 22 Q44 22 40 26 Z" fill="#4a3322"/>
      <circle cx="53.5" cy="28" r="1.3" fill="#2b2b2b"/>
      <path d="M51 32 Q54 34 57 32" stroke="#7a3d2a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </svg>`;
  // The hurler: same kit, a helmet with a faceguard, and a hurley that
  // swings from the shoulder (backswing, strike, follow-through).
  const hurler = `
    <svg class="kp kp-h" viewBox="0 0 100 120" aria-hidden="true">
      <ellipse cx="50" cy="111" rx="22" ry="4" fill="rgba(30,40,25,.28)"/>
      <path d="M47 72 L41 106" stroke="var(--sock)" stroke-width="7" stroke-linecap="round"/>
      <path d="M41 106 L34 108" stroke="#1d1d1d" stroke-width="6" stroke-linecap="round"/>
      <path d="M53 72 L59 105" stroke="var(--sock)" stroke-width="7" stroke-linecap="round"/>
      <path d="M59 105 L67 106" stroke="#1d1d1d" stroke-width="6" stroke-linecap="round"/>
      <rect x="40" y="64" width="20" height="12" rx="3" fill="var(--shorts)" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
      <rect x="38" y="38" width="24" height="30" rx="7" fill="var(--jersey)" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
      <rect x="38" y="50" width="24" height="6" fill="var(--trim)"/>
      <circle cx="50" cy="28" r="10" fill="var(--skin)"/>
      <circle cx="53.5" cy="28" r="1.3" fill="#2b2b2b"/>
      <path d="M39 27 Q39 14 50 14 Q61 14 61 26 L58 26 Q57 19 50 19 Q43 19 42 27 Z" fill="var(--helmet)"/>
      <path d="M58 22 Q63 28 59 36 M60.5 25 L55 25 M61 30 L55 30 M59.5 34.5 L54 34" stroke="#9aa0a6" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <g class="kp-swing">
        <path d="M44 46 L60 58 M56 45 L63 55" stroke="var(--skin)" stroke-width="5" stroke-linecap="round"/>
        <path d="M61 54 L72 100" stroke="#c99a5b" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M68.5 95 Q66 106 74 107 Q81 107 78 97 Z" fill="#c99a5b" stroke="#9c7440" stroke-width="1"/>
        <path d="M70 98 L77 99" stroke="#6b5a3a" stroke-width="1.6"/>
      </g>
    </svg>`;
  const ball = `
    <div class="kb-x"><div class="kb-y">
      <svg class="kb kb-f" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8.5" fill="#fbfbf7" stroke="#2b2b2b" stroke-width="1.2"/>
        <path d="M10 1.5 V18.5 M1.5 10 H18.5 M4 4 Q10 9 16 4 M4 16 Q10 11 16 16" stroke="#9a9a92" stroke-width="1" fill="none"/>
      </svg>
      <svg class="kb kb-s" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7" fill="#fbfbf3" stroke="#3a3a3a" stroke-width="1.1"/>
        <path d="M3.4 9 Q6 5 10 7.5 Q14 10 16.6 6.5 M3.4 13 Q6 9.5 10 12 Q14 14.5 16.6 11" stroke="#8a7a66" stroke-width="1.2" fill="none"/>
      </svg>
    </div></div>
    <div class="kb-flag">Wide!</div>`;

  let el = null, timer = null;
  function ensure() {
    if (el) return el;
    el = document.createElement("div");
    el.id = "kick";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="k-stage">${svg}${hurler}${ball}</div>`;
    // Sit just above the map and signs but under the cards, so a big kick
    // passes behind the question rather than over it.
    const marks = document.getElementById("marks");
    if (marks) marks.after(el); else document.body.appendChild(el);
    return el;
  }

  // tier: allstar | county | senior | inter | junior | wide
  // at: {x, y} screen point to stand on; county: for the jersey
  // sport: "hurling" for a hurler and sliotar, anything else for football
  function play(tier, at, county, sport) {
    const k = ensure();
    const [dx, h, ms] = FLIGHT[tier] || FLIGHT.junior;
    const [jersey, trim, shorts] = COLOURS[county] || DEFAULT;
    const flip = at.x + dx + 40 > window.innerWidth - 12;
    k.style.setProperty("--jersey", jersey);
    k.style.setProperty("--trim", trim);
    k.style.setProperty("--shorts", shorts);
    k.style.setProperty("--sock", trim === "#ffffff" ? jersey : trim);
    k.style.setProperty("--skin", "#f1c7a0");
    k.style.setProperty("--helmet", trim === "#ffffff" || trim === "#d8d8d8" ? jersey === "#ffffff" ? "#2b2b2b" : jersey : trim);
    k.style.setProperty("--dx", dx + "px");
    k.style.setProperty("--h", h + "px");
    k.style.setProperty("--t", ms + "ms");
    const stage = k.firstElementChild;
    stage.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)${flip ? " scaleX(-1)" : ""}`;
    k.className = "";
    void k.offsetWidth; // restart the animations
    k.className = "kicking k-" + tier + (sport === "hurling" ? " k-hurling" : "");
    k.querySelector(".kb-flag").style.transform = flip ? "scaleX(-1)" : "";
    clearTimeout(timer);
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer = setTimeout(() => { k.className = ""; }, calm ? 1800 : ms + 900);
  }

  root.PuckoutKick = { play, COLOURS };
})(window);
