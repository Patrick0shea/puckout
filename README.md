# Puckout

A GAA quiz you can play as often as you like. Pick your home club, then answer seven questions. Every question has lots of right answers, and the fewer people who give yours, the further it carries you along a road across a cartoon map of Ireland, from your club to Croke Park.

## How it plays

- **Pick your club.** Search more than 700 clubs, or any of about 8,800 towns, villages and parishes if your club isn't listed yet. Your choice is remembered.
- **The road.** Each road runs from your club to Croke Park, past a handful of places on the way: statues of GAA greats (Christy Ring in Cloyne, Mick O'Dwyer in Waterville, Páidí Ó Sé in Ventry, Mick Mackey in Castleconnell, John Joe O'Reilly in Cavan and more), where the GAA began (Hayes' Hotel, the Croke statue in Thurles, the Michael Cusack Centre), county grounds, the home clubs of legends (Christy Ring's Cloyne, Henry Shefflin's Ballyhale, Peter Canavan's Errigal Ciarán and more) and famous sights (the Rock of Cashel, Hayes' Hotel, Newgrange). Every road has different stops. Clubs close to Croke Park get a day trip out through the neighbouring counties and back.
- **Seven questions per road.** You have 30 seconds per question. Wrong answers cost nothing, so keep guessing until the clock runs out.
- Typos are forgiven when the answer is clear: `kery` counts as Kerry and `Co. Tipp` as Tipperary. Nicknames such as `Dubs`, `Cats` and `Deise` work too.
- **The rarer the answer, the further you go:**

| Tier | Share of correct answers | Distance |
| --- | --- | --- |
| All-Star | under 3% | 1/7 of the road |
| Inter-county | 3–7% | 10% |
| Senior | 7–15% | 6.4% |
| Intermediate | 15–30% | 3.6% |
| Junior | 30% or more | 1.4% |
| Wide | out of time | 0 |

- **Every answer gets a kick.** A cartoon footballer in your home county's colours stands at your pin and kicks the ball (on hurling questions, a hurler in a helmet strikes a sliotar): the rarer the answer, the bigger the kick (an All-Star soars with a gold glow). Wrong guesses go wide.
- Seven All-Star answers gets you all the way to Croke Park. As you pass each place you get a postcard about it. At full time you see how far you got and a result you can copy and share.
- **Play again** as often as you like. Each round is a new road with new stops and new questions, and your progress on an unfinished road is kept if you close the page.

## Running it

It's a static site with no build step and no dependencies.

- Open `index.html` directly in a browser, or
- serve it locally: `npm start`, then visit http://localhost:8080
- run the tests: `npm test` (Node 18+)

### Publishing on GitHub Pages

`.github/workflows/pages.yml` runs the tests and publishes the site on every push to `main`. GitHub needs a one-time switch first:

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Re-run the latest "Deploy to GitHub Pages" run under the **Actions** tab, or push any change.

The game is then live at https://patrick0shea.github.io/puckout/

## Leaderboard

At full time players can put their name on the leaderboard. It has three tables: **Today** (best road per player since midnight, Irish time), **All time** (total points across every road) and **Counties** (points added up by home county). Each road is worth up to 700 points, 100 per All-Star answer, so roads of different lengths compare fairly.

Until a shared database is connected, the leaderboard shows the roads played on that device. To share it between everyone:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL editor**, run `supabase/schema.sql`. It creates the `roads` table and the two leaderboard views, with rules that let anyone read the board and add a road, but not change or delete one.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key into `js/config.js`, and push.

The anon key is designed to be public. The game runs in the browser, so a determined player could post a fake score; if that becomes a problem, add a server-side check or moderate the `roads` table in Supabase.

## Project layout

| File | What it does |
| --- | --- |
| `js/data.js` | The question pool, everything a player might type (with aliases) and the tiers |
| `js/logic.js` | Picks each road's questions, recognises typed answers, works out rarity. No DOM, so the tests run in Node |
| `js/pois.js` | The places a road can pass: county grounds, legends' clubs and landmarks, each with a one-line postcard |
| `js/route.js` | Picks each road's stops between your club and Croke Park and smooths a road through them |
| `js/map.js` | Paints the cartoon map of Ireland from real outlines and moves the camera, signs and pin |
| `js/board.js` | The leaderboard: posts finished roads, reads Today, All time and Counties |
| `js/config.js` | Shared leaderboard settings (Supabase URL and public key) |
| `supabase/schema.sql` | Database table, views and access rules for the leaderboard |
| `js/kick.js` | The cartoon footballer and hurler and their kick and strike, in each county's colours |
| `js/game.js` | Screens and flow: club search, questions, results, postcards, full time |
| `data/*.js` | Generated map, club, town and question data (see below) |
| `tools/build_data.py` | Rebuilds the map, club and town data |
| `tools/build_questions.py` | Rebuilds `data/questions.js` from GAA records on Wikipedia |
| `styles.css` | Look and layout |
| `test/` | Logic and route tests (`node --test`) |

## Where the questions come from

Most questions are generated from real GAA records by `tools/build_questions.py`, which reads Wikipedia's GAA list pages (CC BY-SA):

| Source | Questions it makes |
| --- | --- |
| Every football and hurling All Star team since 1971 | All Stars by county, goalkeepers, five or more All Stars, by decade, counties with few winners, dual All Stars |
| GAA/GPA Footballer and Hurler of the Year | Winners since 1995 |
| All-Ireland winning captains, with their clubs | Captains since 1975, captains who also won All Stars, clubs that produced a winning captain |
| All-Ireland Senior Club Championship finals | Club winners overall and by province, beaten finalists who never won |
| County senior championship finals (32 football, 20 hurling) | "Name a club that has won the Kerry Senior Football Championship" and so on |

That's 110 generated questions and 14 hand-written ones (counties, provinces, positions). Each road has six general questions and a seventh about your own county's club championship. Questions you've played recently go to the back of the queue, so new rounds don't repeat.

Starting estimates of how often each answer is given come from the same records: players with more All Stars, awards and captaincies (and more recent ones) count as common answers, deep cuts as rare. Clubs work the same way, by titles and how recently they won.

Players can be named in full, by surname when only one answer fits ("Shefflin"), or by a well-known nickname ("Gooch"). If a surname fits more than one answer ("Spillane"), the game asks for the first name. Real players or clubs that don't fit the question are recognised and marked wrong rather than "not recognised".

To rebuild after a season ends:

```bash
python3 tools/build_questions.py --cache ~/.cache/puckout-wiki
```

Discipline stats (red cards, black cards) aren't published in any open source, so there are no questions on them.

## Adding questions

Generated questions are rebuilt by the script above. To add a hand-written one, add an entry to `QUESTIONS` in `js/data.js`:

```js
{ id: "connacht", cat: "Geography",
  text: "Name a county in the province of Connacht.",
  fact: "Connacht has five counties.",
  a: { galway: 25, mayo: 25, roscommon: 18, sligo: 17, leitrim: 15 } }
```

`a` maps each valid answer to a starting estimate of how many people out of 100 would give it. If an answer isn't in `ENTITIES` yet, add it with its aliases. `npm test` checks that every answer is known and that no alias points at two different things.

## Where the percentages come from

The shares start out as the estimates in `js/data.js`. To use real answers from players, connect a small backend that records each correct answer per question and returns the counts. Then return those counts from `crowdCounts(qid)` in `js/game.js` (shape: `{ entityId: count }`). `logic.shares()` blends them with the estimates, and real data takes over as it grows (`CONFIG.priorWeight` sets how many answers the estimates are worth).

## Adding places to pass

Add an entry to `POIS` in `js/pois.js` with a `kind` (`statue`, `legend`, `ground` or `landmark`), its coordinates, a short `tag` for the road sign and a one-line `line` for the postcard. Keep facts short and checkable.

## Map and club data

`data/geo.js`, `data/clubs.js` and `data/places.js` are generated by `tools/build_data.py`, which downloads open data once into a cache folder:

```bash
python3 tools/build_data.py --cache ~/.cache/puckout
```

- **Coastline, big loughs and the Shannon:** [Natural Earth](https://www.naturalearthdata.com/) (public domain)
- **County outlines and smaller loughs:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via Nominatim (ODbL)
- **Towns and villages:** [GeoNames](https://www.geonames.org/) (CC BY 4.0)
- **Clubs:** [Wikidata](https://www.wikidata.org/) (CC0). Each club is placed using its Wikidata or Wikipedia coordinates, or the town in its name within its county. Clubs that can't be placed are left out; players from those clubs can search for their town instead.

The game shows this credit on the opening screen. Keep it if you change the page.

To add or fix a club by hand, add a row `[name, countyIndex, lat, lon]` to `data/clubs.js` (county indexes follow the `counties` list at the top of the file).
