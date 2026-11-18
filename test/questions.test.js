// Run with: npm test  (Node 18+)
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/logic.js");
require("../data/questions.js");
const G = globalThis.PuckoutQuestions;

const find = (pred) => L.QUESTIONS.find(pred);

test("generated questions are loaded and well formed", () => {
  assert.ok(G.questions.length >= 40, `${G.questions.length} generated questions`);
  for (const q of G.questions) {
    const n = Object.keys(q.a).length;
    assert.ok(n >= 4, `${q.id} has ${n} answers`);
    for (const id of Object.keys(q.a)) assert.ok(L.EBY[id], `${q.id}: unknown answer ${id}`);
    assert.ok(q.text.endsWith("."), q.id);
  }
});

test("players can be named in full, by surname when it is unique, or with small typos", () => {
  const q = find(q => q.id === "as-hurling-kilkenny");
  assert.ok(q, "Kilkenny hurling All Stars question exists");
  const shef = Object.keys(q.a).find(id => L.EBY[id].label === "Henry Shefflin");
  assert.ok(shef, "Henry Shefflin is an answer");
  assert.equal(L.identify("Henry Shefflin", q.id), shef);
  assert.equal(L.identify("shefflin", q.id), shef);
  assert.equal(L.identify("Henry Sheflin", q.id), shef);
});

test("clubs can be named by their short name", () => {
  const q = find(q => q.id === "aiclub-football");
  const cross = Object.keys(q.a).find(id => L.EBY[id].label.startsWith("Crossmaglen"));
  assert.ok(cross, "Crossmaglen have won the All-Ireland club football");
  assert.equal(L.identify("Crossmaglen", q.id), cross);
  assert.equal(L.identify("Crossmaglen Rangers", q.id), cross);
});

test("a real player who doesn't fit the question is recognised but marked wrong", () => {
  const q = find(q => q.id === "as-football-kerry");
  const id = L.identify("Henry Shefflin", q.id);
  assert.ok(id, "recognised");
  assert.equal(q.a[id], undefined);
});

test("famous answers are common, deep cuts are rare", () => {
  const q = find(q => q.id === "as-hurling-kilkenny");
  const sh = L.shares(q.id);
  const shef = Object.keys(q.a).find(id => L.EBY[id].label === "Henry Shefflin");
  const sorted = Object.values(sh).sort((a, b) => a - b);
  assert.ok(sh[shef] > sorted[Math.floor(sorted.length / 2)], "Shefflin is more common than the median answer");
});

test("players get one question on their own county's club championship", () => {
  const ids = L.questionsFor("2026-11-18", "Kerry");
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  const last = L.QBY[ids[6]];
  assert.equal(last.cat, "Your county");
  assert.equal(last.county, "Kerry");
  const shared = L.questionsFor("2026-11-18", "Kerry").slice(0, 6);
  assert.deepEqual(shared, L.questionsFor("2026-11-18", "Cork").slice(0, 6), "the other six are the same for everyone");
  assert.ok(L.questionsFor("2026-11-18").every(id => L.QBY[id].cat !== "Your county"));
});

test("a surname that fits two answers asks for the first name", () => {
  const q = L.QUESTIONS.find(q => q.id === "as-football-kerry");
  const c = L.candidates("Spillane", q.id);
  assert.ok(c.length >= 2, `Spillanes: ${c}`);
  assert.equal(L.identify("Spillane", q.id), null);
  assert.ok(q.a[L.identify("Pat Spillane", q.id)] !== undefined);
});

test("a club named on the wrong question is still recognised as that club", () => {
  const id = L.identify("Nemo", "as-hurling-kilkenny");
  assert.equal(L.label(id), "Nemo Rangers");
});

test("back-to-back rounds don't repeat questions", () => {
  const first = L.questionsFor("round-1", "Kerry");
  const second = L.questionsFor("round-2", "Kerry", first);
  assert.equal(second.length, 7);
  assert.equal(second.slice(0, 6).filter(id => first.includes(id)).length, 0, "no shared question repeats");
  assert.notEqual(second[6], first[6], "Kerry has a football and a hurling championship question, so the county one changes too");
});
