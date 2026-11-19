// Run with: npm test  (Node 18+)
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../js/route.js");
const P = require("../js/pois.js");
require("../data/clubs.js");
const CLUBS = globalThis.PuckoutClubs;

const club = name => {
  const c = CLUBS.clubs.find(r => r[0] === name);
  assert.ok(c, `club ${name} is in the data`);
  return { name, lat: c[2], lon: c[3] };
};

test("Castleisland's road starts at home and ends at Croke Park", () => {
  const road = R.makeRoad(club("Castleisland Desmonds"), "2026-11-18");
  assert.equal(road.marks[0].name, "Castleisland Desmonds");
  assert.equal(road.marks[road.marks.length - 1].name, "Croke Park");
  assert.ok(road.marks.length >= 4, "passes at least two places");
  for (let i = 1; i < road.marks.length; i++) assert.ok(road.marks[i].km > road.marks[i - 1].km, "stops are in order");
  const direct = R.km(road.marks[0], P.CROKER);
  assert.ok(road.total > direct && road.total < direct * 2.2, `road ${road.total} km vs direct ${direct} km`);
});

test("the same club gets the same road all day and a different one the next", () => {
  const h = club("Nemo Rangers");
  const a = R.makeRoad(h, "2026-11-18").marks.map(m => m.id);
  const b = R.makeRoad(h, "2026-11-18").marks.map(m => m.id);
  assert.deepEqual(a, b);
  const days = ["2026-11-19", "2026-11-20", "2026-11-21"].map(d => R.makeRoad(h, d).marks.map(m => m.id).join());
  assert.ok(days.some(d => d !== a.join()), "stops vary across days");
});

test("Dublin clubs get a day trip with stops, not a 10 km stroll", () => {
  const road = R.makeRoad(club("Kilmacud Crokes"), "2026-11-18");
  assert.ok(road.marks.length >= 4);
  assert.ok(road.total > 60);
});

test("every club in the data gets a road", () => {
  for (const [name, , lat, lon] of CLUBS.clubs) {
    const road = R.makeRoad({ name, lat, lon }, "2026-11-18");
    assert.ok(road.total > 0 && Number.isFinite(road.total), name);
    assert.ok(road.marks.length >= 3, `${name} has stops`);
  }
});

test("places to pass are inside Ireland", () => {
  for (const p of P.POIS) {
    assert.ok(p.lat > 51.3 && p.lat < 55.5 && p.lon > -10.8 && p.lon < -5.3, p.name);
    assert.ok(p.line && p.tag, p.name);
  }
});

test("roads pass statues of GAA greats when there's one on the way", () => {
  const home = club("Castleisland Desmonds");
  const days = ["round-1", "round-2", "round-3", "round-4", "round-5"];
  const statues = new Set(days.flatMap(d => R.makeRoad(home, d).marks.filter(m => m.kind === "statue").map(m => m.name)));
  assert.ok(statues.size >= 2, `statues passed from Castleisland: ${[...statues]}`);
});
