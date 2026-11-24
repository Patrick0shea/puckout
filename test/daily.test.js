// The hand-picked daily questions: every scheduled day has seven real
// questions, every answer is a known player or club, and common ways of
// typing the answers are recognised.
const test = require("node:test");
const assert = require("node:assert");
require("../data/daily.js");
const DAILY = globalThis.PuckoutDaily;
const L = require("../js/logic.js");

test("every scheduled day has seven questions that exist", () => {
  for (const [date, ids] of Object.entries(DAILY.schedule)) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(ids.length, 7, date);
    ids.forEach(id => assert.ok(L.QBY[id], `${date}: ${id}`));
    assert.deepEqual(L.dailyQuestions(date), ids);
  }
});

test("every daily answer is a known player, club or county", () => {
  for (const q of DAILY.questions) {
    assert.ok(Object.keys(q.a).length >= 10, q.id);
    for (const id of Object.keys(q.a)) assert.ok(L.EBY[id], `${q.id}: ${id}`);
  }
});

test("days nobody picked draw seven from the general pool, never a daily question", () => {
  const qs = L.dailyQuestions("2031-01-01");
  assert.equal(qs.length, 7);
  qs.forEach(id => assert.ok(!L.QBY[id].daily, id));
  assert.deepEqual(qs, L.dailyQuestions("2031-01-01"), "the same for everyone");
});

test("25 November 2026 answers are recognised", () => {
  const id = (raw, q) => L.label(L.identify(raw, "d20261125-" + q));
  assert.equal(id("Clifford", "allstars-2026"), "David Clifford");
  assert.equal(id("Jarlath Óg Burns", "allstars-2026"), "Jarly Óg Burns");
  assert.equal(id("kobe mcdonald", "allstars-2026"), "Kobe McDonald");
  assert.equal(id("Cian Lynch", "limerick-2026"), "Cian Lynch");
  assert.equal(id("Gillane", "limerick-2026"), "Aaron Gillane");
  assert.equal(id("Nicky English", "final-scorers"), "Nicky English");
  assert.equal(id("Shane O'Donnell", "final-scorers"), "Shane O'Donnell");
  assert.equal(id("Horgan", "allstar-no-medal"), "Patrick Horgan");
  assert.equal(id("John Mullane", "allstar-no-medal"), "John Mullane");
  assert.equal(id("Marty Morrissey", "pundits"), "Marty Morrissey");
  assert.equal(id("Brolly", "pundits"), "Joe Brolly");
  assert.equal(id("Oisin Mullin", "afl"), "Oisín Mullin");
  assert.equal(id("Nemo Rangers", "munster-clubs"), "Nemo Rangers");
  assert.equal(id("Ballygunner", "munster-clubs"), "Ballygunner");
});

test("famous All-Ireland winners are not on the never-won list", () => {
  const q = L.QBY["d20261125-allstar-no-medal"];
  for (const name of ["Joe Canning", "Henry Shefflin", "TJ Reid", "Damien Martin", "Tony Doran", "Tony Kelly"]) {
    const e = L.identify(name, null);
    assert.ok(!e || !(e in q.a), name);
  }
});
