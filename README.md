# Puckout

A daily GAA quiz. Everyone gets the same seven questions each day, and every question has lots of right answers. The fewer people who give your answer, the further it carries you down the road from your club pitch to Croke Park.

## How it plays

- Seven questions a day, picked from the pool by date (Irish time). Everyone gets the same set.
- You have 30 seconds per question. Wrong answers cost nothing, so you can keep guessing until the clock runs out.
- Typos are forgiven when the answer is clear: `kery` counts as Kerry and `Co. Tipp` as Tipperary. Nicknames such as `Dubs`, `Cats` and `Deise` work too.
- The rarer your answer, the further it takes you:

| Tier | Share of correct answers | Distance |
| --- | --- | --- |
| All-Star | under 3% | +100 km |
| Inter-county | 3–7% | +70 km |
| Senior | 7–15% | +45 km |
| Intermediate | 15–30% | +25 km |
| Junior | 30% or more | +10 km |
| Wide | out of time | +0 km |

- Stops on the road: your club pitch (0 km), divisional final (120), county final (250), provincial final (400), All-Ireland quarter-final (550) and Croke Park (700). Seven All-Star answers gets you exactly to Croke Park.
- Progress is saved in the browser for the day. At full time you get a result you can copy and share.

## Running it

It's a static site with no build step and no dependencies.

- Open `index.html` directly in a browser, or
- serve it locally: `npm start`, then visit http://localhost:8080
- run the tests: `npm test` (Node 18+)

To publish it on GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root.

## Project layout

| File | What it does |
| --- | --- |
| `js/data.js` | The question pool, everything a player might type (with aliases), tiers and road stops |
| `js/logic.js` | Picks today's questions, recognises typed answers, works out rarity. No DOM, so the tests run in Node |
| `js/map.js` | Paints the countryside, the road and the grounds on a canvas, and moves the camera and pin |
| `js/game.js` | The screens and the flow: intro, questions, results, full time |
| `styles.css` | Look and layout |
| `test/` | Logic tests (`node --test`) |

## Adding questions

Add an entry to `QUESTIONS` in `js/data.js`:

```js
{ id: "connacht", cat: "Geography",
  text: "Name a county in the province of Connacht.",
  fact: "Connacht has five counties.",
  a: { galway: 25, mayo: 25, roscommon: 18, sligo: 17, leitrim: 15 } }
```

`a` maps each valid answer to a starting estimate of how many people out of 100 would give it. If an answer isn't in `ENTITIES` yet, add it with its aliases. `npm test` checks that every answer is known and that no alias points at two different things.

## Where the percentages come from

The shares start out as the estimates in `js/data.js`. To use real answers from players, connect a small backend that records each correct answer per question and returns the counts. Then return those counts from `crowdCounts(qid)` in `js/game.js` (shape: `{ entityId: count }`). `logic.shares()` blends them with the estimates, and real data takes over as it grows (`CONFIG.priorWeight` sets how many answers the estimates are worth).
