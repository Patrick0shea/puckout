// Run with: npm test  (Node 18+)
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../js/data.js");
const L = require("../js/logic.js");

test("every answer in every question is a known entity", () => {
  for (const q of D.QUESTIONS) {
    for (const id of Object.keys(q.a)) assert.ok(L.EBY[id], `${q.id}: unknown answer ${id}`);
  }
});

test("aliases never point at two different things", () => {
  const seen = new Map();
  for (const e of D.ENTITIES) for (const al of e.aliases) {
    const k = L.norm(al);
    if (seen.has(k)) assert.equal(seen.get(k), e.id, `"${al}" is claimed by ${seen.get(k)} and ${e.id}`);
    seen.set(k, e.id);
  }
});

test("typed answers are recognised, typos forgiven only when clear", () => {
  assert.equal(L.identify("Kerry"), "kerry");
  assert.equal(L.identify("Co. Kerry"), "kerry");
  assert.equal(L.identify("kery"), "kerry");
  assert.equal(L.identify("Derry"), "derry");
  assert.equal(L.identify("Londonderry"), "derry");
  assert.equal(L.identify("Tipp"), "tipperary");
  assert.equal(L.identify("Laois"), "laois");
  assert.equal(L.identify("centre half back"), "chb");
  assert.equal(L.identify("New York"), "newyork");
  assert.equal(L.identify("xyz"), null);
  assert.equal(L.identify(""), null);
});

test("shares add up to one and rarer answers go further", () => {
  for (const q of D.QUESTIONS) {
    const sh = L.shares(q.id);
    const sum = Object.values(sh).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, q.id);
  }
  const sh = L.shares("shc-ever");
  assert.ok(L.tierFor(sh.london).km > L.tierFor(sh.kilkenny).km);
});

test("real counts move the shares", () => {
  const before = L.shares("codes").rounders;
  const after = L.shares("codes", { rounders: 500 }).rounders;
  assert.ok(after > before);
});

test("seven All-Star answers is exactly Croke Park", () => {
  const top = D.TIERS[0].km * D.CONFIG.perDay;
  assert.equal(top, D.STOPS[D.STOPS.length - 1].km);
  assert.equal(L.stopFor(top).name, "Croke Park");
});

test("each day gets seven different questions, the same for everyone", () => {
  const a = L.questionsFor("2026-11-18"), b = L.questionsFor("2026-11-18"), c = L.questionsFor("2026-11-19");
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, D.CONFIG.perDay);
  assert.notDeepEqual(a, c);
  assert.equal(L.dayNumber("2026-11-18"), 1);
  assert.equal(L.dayNumber("2026-11-20"), 3);
});
