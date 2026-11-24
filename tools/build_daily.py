#!/usr/bin/env python3
"""
Builds data/daily.js: the hand-picked questions for each day and the schedule
of which seven run on which date.

Each day's questions are written out below (DAYS). Some answer lists are
typed in by hand from the sources noted beside them; others are worked out
from Wikipedia (CC BY-SA), which is downloaded once into a cache folder:

    python3 tools/build_daily.py --cache ~/.cache/puckout-wiki-daily

People and clubs that are already in data/questions.js keep their ids, so a
name typed in a daily question means the same player everywhere.
"""
import argparse, hashlib, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
UA = "puckout-quiz-builder/1.0 (GAA quiz; daily questions)"

COUNTIES = ["Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down", "Dublin", "Fermanagh",
            "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford", "Louth", "Mayo", "Meath",
            "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Tyrone", "Waterford", "Westmeath", "Wexford", "Wicklow",
            "London", "New York"]
CODES = {"ANT": "Antrim", "ARM": "Armagh", "CAR": "Carlow", "CAV": "Cavan", "CLA": "Clare", "COR": "Cork", "DER": "Derry",
         "DON": "Donegal", "DOW": "Down", "DUB": "Dublin", "FER": "Fermanagh", "GAL": "Galway", "KER": "Kerry", "KID": "Kildare",
         "KIL": "Kilkenny", "LAO": "Laois", "LEI": "Leitrim", "LIM": "Limerick", "LON": "Longford", "LOU": "Louth", "MAY": "Mayo",
         "MEA": "Meath", "MON": "Monaghan", "OFF": "Offaly", "ROS": "Roscommon", "SLI": "Sligo", "TIP": "Tipperary", "TYR": "Tyrone",
         "WAT": "Waterford", "WES": "Westmeath", "WEX": "Wexford", "WIC": "Wicklow"}
MUNSTER = {"Clare", "Cork", "Kerry", "Limerick", "Tipperary", "Waterford"}


# ------------------------------------------------------------------ Wikipedia
class Wiki:
    def __init__(self, cache):
        self.cache = cache
        os.makedirs(cache, exist_ok=True)

    def get(self, title):
        path = os.path.join(self.cache, hashlib.md5(title.encode()).hexdigest() + ".txt")
        if os.path.exists(path):
            return open(path, encoding="utf-8").read()
        url = "https://en.wikipedia.org/w/index.php?" + urllib.parse.urlencode({"title": title.replace(" ", "_"), "action": "raw"})
        for attempt in range(8):
            try:
                time.sleep(1.0)
                text = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read().decode("utf-8")
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    text = ""
                    break
                wait = 10 + attempt * 15
                print(f"  {e.code} on {title}, waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
        else:
            raise RuntimeError("failed " + title)
        m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", text, re.I)
        if m:
            text = self.get(m.group(1))
        open(path, "w", encoding="utf-8").write(text)
        return text


def unlink(s):
    """Wikitext to plain text: [[a|b]] -> b, drop refs, templates and markup."""
    s = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{(?:small|nowrap)\|([^}]*)\}\}", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<[^>]+>", " ", s).replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def table_rows(text):
    """Rows of every wikitable as lists of raw cell strings."""
    rows = []
    for tb in re.findall(r"\{\|.*?\n\|\}", text, flags=re.S):
        for row in re.split(r"\n\|-[^\n]*", tb)[1:]:
            cells = []
            for line in row.split("\n"):
                if line.startswith("|") and not line.startswith("|}") and not line.startswith("|+"):
                    for c in line[1:].split("||"):
                        c = re.sub(r'^\s*(?:style|rowspan|colspan|align)="[^"]*"\s*(?:(?:style|rowspan|colspan|align)="[^"]*"\s*)*\|', "", c)
                        cells.append(c)
                elif cells and not line.startswith("!"):
                    cells[-1] += "\n" + line
            if cells:
                rows.append(cells)
    return rows


# ------------------------------------------------------------------ names and ids
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def key(s):
    s = strip_accents(str(s)).lower().replace("’", "'")
    s = re.sub(r"\b(saint)\b", "st", s)
    return re.sub(r"[^a-z0-9]+", "", s)


class Registry:
    """Reuses ids from data/questions.js; new people and clubs get ids of their own."""

    def __init__(self):
        src = open(os.path.join(ROOT, "data", "questions.js"), encoding="utf-8").read()
        g = json.loads(src[src.index("{"):src.rindex("}") + 1])
        self.people = {(key(p["label"]), p["county"]): p for p in g["people"]}
        self.clubs = {(key(c["label"]), c["county"]): c for c in g["clubs"]}
        self.club_by_name = {}
        for c in g["clubs"]:
            self.club_by_name.setdefault(key(c["label"]), []).append(c)
        self.new_people, self.new_clubs = {}, {}

    def person(self, name, county, aka=()):
        k = (key(name), county)
        for n in (name, *aka):
            hit = self.people.get((key(n), county))
            if hit:
                return hit["id"]
        pid = f"p:{key(name)}:{key(county)}"
        e = self.new_people.setdefault(pid, {"id": pid, "label": name, "county": county})
        if aka:
            e["aka"] = sorted(set(e.get("aka", [])) | set(aka))
        return pid

    def club(self, name, county):
        hit = self.clubs.get((key(name), county))
        if not hit:  # "Ballyhale Shamrocks" vs "Ballyhale": match on the first word within the county
            cands = [c for (k, cc), c in self.clubs.items() if cc == county and (k.startswith(key(name)) or key(name).startswith(k))]
            hit = cands[0] if len(cands) == 1 else None
        if hit:
            return hit["id"]
        cid = f"c:{key(name)}:{key(county)}"
        self.new_clubs.setdefault(cid, {"id": cid, "label": name, "county": county})
        return cid


# ------------------------------------------------------------------ worked-out answer lists
def munster_club_winners(w, reg):
    """Every Munster club that has won an All-Ireland club title, senior, intermediate or junior, football or hurling."""
    out = {}
    pages = [("All-Ireland Senior Club Football Championship", "football"), ("All-Ireland Intermediate Club Football Championship", "football"),
             ("All-Ireland Junior Club Football Championship", "football"), ("All-Ireland Senior Club Hurling Championship", "hurling"),
             ("All-Ireland Intermediate Club Hurling Championship", "hurling"), ("All-Ireland Junior Club Hurling Championship", "hurling")]
    for title, code in pages:
        level = title.split()[1]
        for cells in table_rows(w.get(title)):
            plain = [CODES.get(x, x) for x in (unlink(c) for c in cells)]
            if not plain or not re.match(r"^\d{4}", plain[0]):
                continue
            # Winners are the first county cell after the year, with the club beside it (either order).
            for i in range(1, min(len(plain) - 1, 4)):
                a, b = plain[i], plain[i + 1]
                if a in COUNTIES and b and b not in COUNTIES:
                    county, club = a, b
                    break
                if b in COUNTIES and a and a not in COUNTIES and not re.match(r"^\d", a):
                    county, club = b, a
                    break
            else:
                continue
            if county not in MUNSTER:
                continue
            club = re.sub(r"\s*\(.*?\)", "", club).strip()
            cid = reg.club(club, county)
            o = out.setdefault(cid, {"titles": 0, "levels": set(), "last": 0, "name": club, "county": county})
            o["titles"] += 1
            o["levels"].add(f"{level} {code}")
            o["last"] = max(o["last"], int(plain[0][:4]))
    return out


MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september",
                                       "october", "november", "december"], 1)}


def box_date(f):
    d = f.get("date", "")
    m = re.search(r"start date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", d)
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", unlink(d))
    if m and m.group(2).lower() in MONTHS:
        return (int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", d)
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def match_boxes(text):
    """Every match box in an article ({{GAAmatchbox}}, {{football box}}) as a dict of its fields."""
    out = []
    for m in re.finditer(r"\{\{\s*(?:GAAmatchbox|GAA match|football box|Football box)", text):
        depth, i = 0, m.start()
        while i < len(text):
            if text.startswith("{{", i):
                depth += 1; i += 2; continue
            if text.startswith("}}", i):
                depth -= 1; i += 2
                if depth == 0:
                    break
                continue
            i += 1
        body = text[m.end():i - 2]
        # split on top-level pipes only
        parts, depth, cur, j = [], 0, "", 0
        while j < len(body):
            two = body[j:j + 2]
            if two in ("{{", "[["):
                depth += 1; cur += two; j += 2; continue
            if two in ("}}", "]]"):
                depth -= 1; cur += two; j += 2; continue
            if body[j] == "|" and depth == 0:
                parts.append(cur); cur = ""; j += 1; continue
            cur += body[j]; j += 1
        parts.append(cur)
        f = {}
        for part in parts:
            if "=" in part:
                k, v = part.split("=", 1)
                f[k.strip()] = v.strip()
        out.append(f)
    return out


def scorer_entries(field, kind):
    """'J Canning 0-9 (0-5f), C Cooney 1-3, J Cooney, C Mannion 0-1 each' -> [(name, goals, points)]."""
    field = re.sub(r"<br\s*/?>", ",", field).replace("&ndash;", "–")
    # [[Ben O'Connor (hurler)|B. O'Connor]] -> Ben O'Connor: the link names the player in full
    field = re.sub(r"\[\[([^\]|]+?)(?:\s*\([^)\]]*\))?\|[^\]]*\]\]", r"\1", field)
    # "F. Tuohy (0-4)", "Colin Ryan (0-12, 11f)" -> " 0-12"; but "J Canning 1–09 (0-8f)" keeps 1-09 (the bracket is frees)
    field = re.sub(r"(?<=[A-Za-z.'’\]])\s*\(\s*(\d+\s*[-–]\s*\d+)[^)]*\)", r" \1", field)
    s = re.sub(r"\([^)]*\)", "", unlink(field))
    out, pending = [], []
    for e in [x.strip(" .;") for x in re.split(r",|;|\n|\band\b", s)]:
        if not e:
            continue
        each = re.search(r"\beach\b", e)
        e = re.sub(r"\beach\b", "", e).strip()
        m = re.match(r"^(.*?)\s*(\d+)\s*[-–]\s*(\d+)\s*$", e)
        m1 = re.match(r"^(.*?)\s+(\d+)\s*$", e)
        if m:
            name, g, p = m.group(1).strip(), int(m.group(2)), int(m.group(3))
        elif m1:
            name, n = m1.group(1).strip(), int(m1.group(2))
            g, p = (n, 0) if kind == "goals" else (0, n)
        else:
            pending.append(e)
            continue
        if each:
            out += [(n, g, p) for n in pending]
        pending = []
        if re.search(r"[A-Za-z]{2}", name):
            out.append((name, g, p))
    return out


def final_scorers(w, year, pair, known=None):
    """{(name, county): (goals, points)}: each player's best score in the All-Ireland senior hurling final of
    `year` (a drawn final and its replay count as separate finals). pair: the two finalists."""
    text = w.get(f"{year} All-Ireland Senior Hurling Championship final")
    boxes = match_boxes(text) if text else []
    if not any(f.get("goals1") or f.get("points1") for f in boxes):
        # no scorers in the final's own article: the season's article often has the final's match box
        text = (text or "") + w.get(f"{year} All-Ireland Senior Hurling Championship")
        boxes = match_boxes(text)
    if not text:
        return {}, []
    games = []
    for f in boxes:
        team = [next((c for c in COUNTIES if re.search(r"\b" + c + r"\b", unlink(f.get(k, "")))), None) for k in ("team1", "team2")]
        if set(team) != set(pair):
            continue
        d = box_date(f)
        label = f.get("date", "") + " " + f.get("round", "")
        is_final = re.search(r"\bFinal\b", label) and not re.search(r"Semi|Quarter|Munster|Leinster|Ulster|Connacht|Round|Qualifier", label, re.I)
        if d and d[0] != year and not is_final:
            continue  # an earlier-season meeting, or a box with a mistyped year
        if d and d[0] != year:
            d = (year,) + d[1:]
        games.append((d or (year, 12, 31), team, f))
    if not games:
        return {}, []
    last = max(g[0] for g in games)
    def days(d):
        return d[0] * 372 + d[1] * 31 + d[2]
    games = [g for g in games if days(last) - days(g[0]) <= 25]  # the final (and a drawn first game), not a provincial meeting
    names = set(unlink("[[" + x + "]]") for x in re.findall(r"\[\[([^\]]+)\]\]", text))
    known = known or {}
    best = {}
    for _, team, f in games:
        tot = {}
        for side, county in ((1, team[0]), (2, team[1])):
            for kind in ("goals", "points"):
                for name, g, p in scorer_entries(f.get(f"{kind}{side}", ""), kind):
                    name = full_name(name.replace("’", "'"), names, known.get(county, ()))
                    if not name:
                        continue
                    cur = tot.get((name, county), (0, 0))
                    tot[(name, county)] = (cur[0] + g, cur[1] + p)
        for k, (g, p) in tot.items():
            if k not in best or g * 3 + p > best[k][0] * 3 + best[k][1]:
                best[k] = (g, p)
    return best, [g[1] for g in games]


def full_name(name, names, county_people=()):
    """'P Horgan' -> 'Patrick Horgan' when the article (or, failing that, the county's known players)
    names exactly one such player; full names pass through."""
    t = name.split()
    if len(t) >= 2 and len(t[0].rstrip(".")) > 1 and not re.fullmatch(r"[A-Z]\.?[A-Z]\.?", t[0]):
        return name
    if len(t) < 2:
        return None
    ini, sur = t[0].replace(".", "")[:1], key(" ".join(t[1:]))
    match = lambda pool: {n for n in pool if n.split() and n.split()[0][:1] == ini and key(" ".join(n.split()[1:])) == sur}
    cands = match(names) or match(county_people)
    if re.fullmatch(r"[A-Z]\.?\s?[A-Z]\.?", t[0]) or re.fullmatch(r"[A-Z]{2}", t[0]):  # "TJ Reid", "D. J. Carey"
        return re.sub(r"\.", ". ", t[0]).replace("  ", " ").strip() + " " + " ".join(t[1:]) if not cands else sorted(cands)[0]
    return sorted(cands)[0] if len(cands) == 1 else None


def big_final_scorers(w, reg, years):
    """Hurlers who scored more than 1-5 (8 points) in an All-Ireland senior hurling final."""
    out = {}
    pairs = final_pairs(w)
    known = {}
    for p in list(reg.people.values()) + list(reg.new_people.values()):
        known.setdefault(p["county"], set()).add(p["label"])
    for y in years:
        if y not in pairs:
            continue
        tot, _ = final_scorers(w, y, pairs[y], known)
        for (name, county), (g, p) in tot.items():
            if g * 3 + p > 8:
                pid = reg.person(name, county)
                o = out.setdefault(pid, {"best": 0, "finals": [], "name": name})
                o["best"] = max(o["best"], g * 3 + p)
                o["finals"].append(f"{y}: {g}-{p}")
    return out


def final_pairs(w):
    """{year: (winner, runner-up)} from the list of All-Ireland senior hurling finals."""
    out = {}
    for cells in table_rows(w.get("List of All-Ireland Senior Hurling Championship finals")):
        plain = [unlink(c) for c in cells]
        if len(plain) < 4 or not re.match(r"^\d{4}", plain[0]):
            continue
        a = next((c for c in COUNTIES if c in plain[1]), None)
        b = next((c for c in COUNTIES if c in plain[3]), None)
        if a and b:
            out[int(plain[0][:4])] = (a, b)
    return out


def hurling_winning_years(w):
    """{county: [years]} from the list of All-Ireland senior hurling finals."""
    out = {}
    for cells in table_rows(w.get("List of All-Ireland Senior Hurling Championship finals")):
        plain = [unlink(c) for c in cells]
        if len(plain) < 2 or not re.match(r"^\d{4}", plain[0]):
            continue
        county = next((c for c in COUNTIES if c in plain[1]), None)
        if county:
            out.setdefault(county, []).append(int(plain[0][:4]))
    return out


def allstar_hurlers(w):
    """[(name, county, year)] from the list of hurling All Stars."""
    text = w.get("List of All Stars Awards winners (hurling)")
    out = []
    year = None
    for line in text.split("\n"):
        h = re.match(r"^=+\s*(\d{4})\s*=+", line)
        if h:
            year = int(h.group(1))
        if not year:
            continue
    # Tables: each All Star team is a table under its year heading.
    for sec in re.split(r"\n(?==+\s*\d{4}\s*=+)", text):
        h = re.match(r"=+\s*(\d{4})\s*=+", sec.strip())
        if not h:
            continue
        year = int(h.group(1))
        for cells in table_rows(sec):
            plain = [unlink(c) for c in cells]
            county = next((c for c in plain if c in COUNTIES), None)
            names = [c for c in plain if c and c not in COUNTIES and not re.fullmatch(r"[A-Z]{1,4}|\d+", c) and re.search(r"[a-z]", c)]
            if county and names and year >= 1971:  # before 1971 these were Cú Chulainn awards, not All Stars
                name = re.sub(r"\s+(?:Y?HOTY)(?:\s*,\s*Y?HOTY)*\s*$", "", names[0]).strip()  # award notes after the name
                out.append((name, county, year))
    return out


# Checked by hand: won an All-Ireland outside the usual career window, or not sure enough to include.
NOT_NEVER = {("Tom Helebert", "Galway"), ("Tony Doran", "Wexford"), ("Tommy Butler", "Tipperary"), ("Willie Murphy", "Wexford"),
             ("Christy Keogh", "Wexford"), ("Ned Buggy", "Wexford"), ("Liam O'Donoghue", "Limerick")}


def never_won(w, reg, before=6, after=10):
    """All Star hurlers who never won a senior All-Ireland medal, as far as the records show: their county
    didn't win the All-Ireland at any point from `before` years ahead of their first All Star to `after`
    years past their last (wide enough to cover a career, so the list errs on the side of leaving people out)."""
    wins = hurling_winning_years(w)
    by = {}
    for name, county, year in allstar_hurlers(w):
        by.setdefault((name, county), []).append(year)
    out = {}
    for (name, county), years in by.items():
        lo, hi = min(years) - before, max(years) + after
        if (name, county) in NOT_NEVER or any(lo <= y <= hi for y in wins.get(county, [])):
            continue
        out[reg.person(name, county)] = {"stars": len(years), "last": max(years), "name": name, "county": county}
    return out, wins


# ------------------------------------------------------------------ the days
def day_2026_11_25(w, reg):
    qs = []

    # 1. Munster clubs, any grade
    mc = munster_club_winners(w, reg)
    qs.append({
        "id": "d20261125-munster-clubs", "cat": "Clubs", "daily": True,
        "text": "Name a Munster club that has won an All-Ireland club championship, at any grade.",
        "hint": "Senior, intermediate or junior, football or hurling.",
        "fact": f"{len(mc)} Munster clubs have won an All-Ireland club title at senior, intermediate or junior level, in football or hurling.",
        "a": {cid: round(max(0.4, (o["titles"] * (3 if any(l.startswith('Senior') for l in o['levels']) else 1)) ** 1.2), 2) for cid, o in mc.items()}
    })

    # 2. The 2026 football All Stars (GAA.ie, 29 October 2026)
    stars = [("Shane Murphy", "Kerry", 3), ("Sam Callinan", "Mayo", 3), ("Jason Foley", "Kerry", 4), ("Enda Hession", "Mayo", 3),
             ("Ronan Wallace", "Westmeath", 2), ("Dara McDonnell", "Louth", 3), ("Jarly Óg Burns", "Armagh", 4, ["Jarlath Óg Burns", "Jarlath Burns"]),
             ("Conn Kilpatrick", "Tyrone", 4), ("Jack Carney", "Mayo", 9), ("Niall Scully", "Dublin", 5), ("Stephen O'Hanlon", "Monaghan", 3),
             ("Ryan O'Donoghue", "Mayo", 12), ("Darragh Beirne", "Mayo", 4), ("Kobe McDonald", "Mayo", 8), ("David Clifford", "Kerry", 30)]
    qs.append({
        "id": "d20261125-allstars-2026", "cat": "All Stars", "daily": True,
        "text": "Name a footballer who won an All Star in 2026.",
        "fact": "Champions Mayo had six of the 2026 football All Stars. David Clifford's was his seventh.",
        "a": {reg.person(s[0], s[1], s[3] if len(s) > 3 else ()): s[2] for s in stars}
    })

    # 3. Limerick's 2026 All-Ireland winning panel (match-day 26, 2026 All-Ireland SHC final)
    panel = [("Nickie Quaid", 6), ("Seán Finn", 4), ("Mike Casey", 2), ("Barry Nash", 4), ("Diarmaid Byrnes", 7), ("William O'Donoghue", 3),
             ("Kyle Hayes", 9), ("Adam English", 3), ("Cian Lynch", 14), ("Gearóid Hegarty", 9), ("Aidan O'Connor", 3), ("Cathal O'Neill", 5),
             ("Aaron Gillane", 12), ("Shane O'Brien", 1), ("Peter Casey", 4), ("Colin Ryan", 1), ("Colin Coughlan", 1), ("Fintan Fitzgerald", 0.5),
             ("Matthew Fitzgerald", 0.5), ("Hugh Flanagan", 0.5), ("Ethan Hurley", 0.5), ("Darragh Langan", 0.5), ("Dan Morrissey", 3),
             ("Tom Morrissey", 4), ("Darragh O'Donovan", 2), ("David Reidy", 1)]
    qs.append({
        "id": "d20261125-limerick-2026", "cat": "Hurling", "daily": True,
        "text": "Name a Limerick hurler who won the All-Ireland in 2026.",
        "hint": "Anyone in Limerick's 26 for the final against Galway.",
        "fact": "Limerick beat Galway 1-29 to 1-18 in the 2026 final, their sixth All-Ireland since 2018. Cathal O'Neill was man of the match.",
        "a": {reg.person(n, "Limerick"): v for n, v in panel}
    })

    # 4. Big scorers in All-Ireland hurling finals
    years = [y for y in range(1950, 2027)]
    bf = big_final_scorers(w, reg, years)
    qs.append({
        "id": "d20261125-final-scorers", "cat": "Hurling", "daily": True,
        "text": "Name a hurler who scored more than 1-5 in an All-Ireland final.",
        "hint": "9 points or more in one senior final.",
        "fact": "Tipperary's Darragh McCarthy hit 1-13 in the 2025 final. Nicky English's 2-12 against Antrim in 1989 is one of the biggest tallies in any final.",
        "a": {pid: round(max(0.5, o["best"] / 3 * len(o["finals"])), 2) for pid, o in bf.items()}
    })

    # 5. All Star hurlers without an All-Ireland medal
    nw, wins = never_won(w, reg)
    qs.append({
        "id": "d20261125-allstar-no-medal", "cat": "Hurling", "daily": True,
        "text": "Name a hurler who won an All Star but never won an All-Ireland.",
        "hint": "A senior All-Ireland medal with their county.",
        "fact": never_fact(nw),
        "a": {pid: round(max(0.5, o["stars"] ** 1.6 * (1.6 if o["last"] >= 2000 else 1)), 2) for pid, o in nw.items()}
    })

    # 6. Pundits, presenters and commentators (The Sunday Game and other GAA coverage)
    pundits = [("Joe Brolly", "Derry", 12), ("Pat Spillane", "Kerry", 12), ("Colm O'Rourke", "Meath", 6), ("Tomás Ó Sé", "Kerry", 6),
               ("Seán Cavanagh", "Tyrone", 5), ("Lee Keegan", "Mayo", 4), ("Peter Canavan", "Tyrone", 5), ("Ciarán Whelan", "Dublin", 4),
               ("Kevin McStay", "Mayo", 3), ("Dessie Dolan", "Westmeath", 2), ("Philly McMahon", "Dublin", 3), ("Brian Fenton", "Dublin", 2),
               ("Eamonn Fitzmaurice", "Kerry", 1.5), ("Conor McManus", "Monaghan", 1.5), ("Oisín McConville", "Armagh", 2),
               ("Jim McGuinness", "Donegal", 3), ("Michael Murphy", "Donegal", 1.5), ("Colm Cooper", "Kerry", 2, ["Gooch"]),
               ("Anthony Tohill", "Derry", 1), ("Tommy Lyons", "Offaly", 0.5), ("Coman Goggins", "Dublin", 0.5), ("Martin Carney", "Mayo", 0.5),
               ("Paul Curran", "Dublin", 0.5), ("Tony Davis", "Cork", 0.5), ("Mick O'Dwyer", "Kerry", 1), ("Valerie Mulcahy", "Cork", 0.5),
               ("Ger Loughnane", "Clare", 6), ("Cyril Farrell", "Galway", 2), ("Michael Duignan", "Offaly", 3), ("Anthony Daly", "Clare", 4),
               ("Dónal Óg Cusack", "Cork", 5), ("Henry Shefflin", "Kilkenny", 3), ("Jackie Tyrrell", "Kilkenny", 4), ("Brendan Cummins", "Tipperary", 2),
               ("Derek McGrath", "Waterford", 2), ("Liam Sheedy", "Tipperary", 3), ("Joe Canning", "Galway", 4), ("Shane Dowling", "Limerick", 2),
               ("Eddie Brennan", "Kilkenny", 2), ("Jamesie O'Connor", "Clare", 2), ("Ursula Jacob", "Wexford", 1), ("Anna Geary", "Cork", 1),
               ("Patrick Horgan", "Cork", 1), ("John Mullane", "Waterford", 1.5), ("Aoife Sheehan", "Kerry", 0.5), ("Tomás Mulcahy", "Cork", 1),
               ("Davy Fitzgerald", "Clare", 2), ("D. J. Carey", "Kilkenny", 2, ["DJ Carey"]), ("Jimmy Barry-Murphy", "Cork", 1),
               ("Éamonn Cregan", "Limerick", 0.5), ("Pete Finnerty", "Galway", 0.5), ("Liam Griffin", "Wexford", 1), ("Eddie Keher", "Kilkenny", 0.5),
               ("Paul Flynn", "Waterford", 0.5), ("Larry O'Gorman", "Wexford", 0.5), ("Declan Ruth", "Wexford", 0.5)]
    voices = [("Marty Morrissey", "Clare", 6), ("Micheál Ó Muircheartaigh", "Kerry", 4), ("Ger Canning", "Cork", 2), ("Michael Lyster", "Galway", 4),
              ("Des Cahill", "Dublin", 2), ("Joanne Cantwell", "Dublin", 2), ("Jacqui Hurley", "Cork", 1), ("Darragh Maloney", "Dublin", 1),
              ("Damian Lawlor", "Tipperary", 0.5), ("Michael O'Hehir", "Dublin", 1)]
    a = {}
    for p in pundits + voices:
        a[reg.person(p[0], p[1], p[3] if len(p) > 3 else ())] = p[2]
    qs.append({
        "id": "d20261125-pundits", "cat": "The game", "daily": True,
        "text": "Name a GAA pundit.",
        "hint": "Anyone who analyses, presents or commentates on GAA on TV.",
        "fact": "The Sunday Game first went out in 1979. Its analysts that year included Enda Colleran and camogie star Liz Howard.",
        "a": a
    })

    # 7. Irish men on AFL lists in 2026 (The42, 4 March 2026)
    afl = [("Mark O'Connor", "Kerry", 25), ("Oisín Mullin", "Mayo", 18), ("Conor McKenna", "Tyrone", 18), ("Conor Nash", "Meath", 8),
           ("Mark Keane", "Cork", 7), ("Darragh Joyce", "Kilkenny", 4), ("Callum Brown", "Derry", 4), ("Liam O'Connell", "Cork", 3),
           ("Ben Murphy", "Kerry", 2), ("Rob Monahan", "Kerry", 2), ("Matt Duffy", "Longford", 1.5), ("Cillian Bourke", "Offaly", 1.5),
           ("Cillian Burke", "Kerry", 1.5), ("Eamonn Armstrong", "Meath", 1)]
    qs.append({
        "id": "d20261125-afl", "cat": "Football", "daily": True,
        "text": "Name a former GAA player who now plays in the AFL.",
        "hint": "On an AFL club's list for the 2026 season.",
        "fact": "Fourteen Irishmen from nine counties started the 2026 AFL season on club lists. Four of them are from Kerry.",
        "a": a_afl(reg, afl)
    })
    return qs


def never_fact(nw):
    top = max(nw.values(), key=lambda o: (o["stars"], o["last"]))
    return f"{top['county']}'s {top['name']} won {top['stars']} All Stars without ever winning an All-Ireland."


def a_afl(reg, rows):
    return {reg.person(n, c): v for n, c, v in rows}


DAYS = {"2026-11-25": day_2026_11_25}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "daily.js"))
    args = ap.parse_args()
    w, reg = Wiki(args.cache), Registry()
    questions, schedule = [], {}
    for date, build in DAYS.items():
        qs = build(w, reg)
        for q in qs:
            print(f"{date} {q['id']}: {len(q['a'])} answers", file=sys.stderr)
        questions += qs
        schedule[date] = [q["id"] for q in qs]
    data = {"source": "Generated by tools/build_daily.py. Answer lists from Wikipedia (CC BY-SA), GAA.ie and The42.",
            "people": sorted(reg.new_people.values(), key=lambda p: p["id"]),
            "clubs": sorted(reg.new_clubs.values(), key=lambda c: c["id"]),
            "questions": questions, "schedule": schedule}
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("/* Generated by tools/build_daily.py: the hand-picked questions for each day. */\n")
        f.write("(typeof window !== 'undefined' ? window : globalThis).PuckoutDaily = ")
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")
    print(f"wrote {args.out}: {len(questions)} questions, {len(reg.new_people)} new people, {len(reg.new_clubs)} new clubs", file=sys.stderr)


if __name__ == "__main__":
    main()
