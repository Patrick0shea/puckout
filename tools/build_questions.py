#!/usr/bin/env python3
"""
Builds data/questions.js: GAA questions generated from real records.

Source: English Wikipedia list pages (CC BY-SA), read through the REST API
with a descriptive User-Agent, one request at a time, cached on disk:

  - All Stars winners, football and hurling (every team since 1971)
  - GAA/GPA Footballer and Hurler of the Year
  - All-Ireland winning captains, football and hurling (with clubs)
  - All-Ireland Senior Club Football and Hurling Championship finals
  - County senior championship rolls of honour

Each question lists every valid answer with a starting-estimate weight: how
likely a typical player is to think of it. Weights come from fame proxies in
the same records (number of All Stars, awards, captaincies, titles, how
recent), so household names count as common and deep cuts as rare.

Usage:
  python3 tools/build_questions.py --cache /path/to/cache
"""
import argparse, collections, hashlib, json, math, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from io import StringIO

UA = "puckout-data-builder/0.1 (open-source GAA quiz game)"
COUNTIES = ["Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down", "Dublin", "Fermanagh",
            "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford", "Louth", "Mayo", "Meath",
            "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Tyrone", "Waterford", "Westmeath", "Wexford", "Wicklow"]
EXTRA_TEAMS = ["London", "New York"]
PROVINCE = {**{c: "Ulster" for c in ["Antrim", "Armagh", "Cavan", "Derry", "Donegal", "Down", "Fermanagh", "Monaghan", "Tyrone"]},
            **{c: "Munster" for c in ["Clare", "Cork", "Kerry", "Limerick", "Tipperary", "Waterford"]},
            **{c: "Connacht" for c in ["Galway", "Leitrim", "Mayo", "Roscommon", "Sligo"]},
            **{c: "Leinster" for c in ["Carlow", "Dublin", "Kildare", "Kilkenny", "Laois", "Longford", "Louth", "Meath",
                                       "Offaly", "Westmeath", "Wexford", "Wicklow"]}}
CODES = {"ANT": "Antrim", "ARM": "Armagh", "CAR": "Carlow", "CLW": "Carlow", "CAV": "Cavan", "CLA": "Clare", "CLR": "Clare",
         "COR": "Cork", "DER": "Derry", "LDY": "Derry", "DON": "Donegal", "DOW": "Down", "DUB": "Dublin", "FER": "Fermanagh",
         "GAL": "Galway", "KER": "Kerry", "KID": "Kildare", "KIL": "Kilkenny", "KK": "Kilkenny", "LAO": "Laois", "LEI": "Leitrim",
         "LTR": "Leitrim", "LIM": "Limerick", "LON": "Longford", "LOG": "Longford", "LFD": "Longford", "LOU": "Louth",
         "MAY": "Mayo", "MEA": "Meath", "MON": "Monaghan", "OFF": "Offaly", "OFY": "Offaly", "ROS": "Roscommon", "SLI": "Sligo",
         "TIP": "Tipperary", "TYR": "Tyrone", "WAT": "Waterford", "WES": "Westmeath", "WMH": "Westmeath", "WEX": "Wexford",
         "WIC": "Wicklow"}
FOOTBALL_COUNTY_PAGES = COUNTIES
HURLING_COUNTY_PAGES = ["Kilkenny", "Cork", "Tipperary", "Limerick", "Galway", "Clare", "Waterford", "Wexford", "Dublin",
                        "Offaly", "Laois", "Antrim", "Westmeath", "Kerry", "Down", "Carlow", "Meath", "Kildare", "Wicklow", "Derry"]
NOW = 2026


# ------------------------------------------------------------------ fetching
class Wiki:
    def __init__(self, cache):
        self.cache = cache
        os.makedirs(cache, exist_ok=True)

    def _get(self, url, name):
        path = os.path.join(self.cache, name)
        if os.path.exists(path):
            return open(path, encoding="utf-8").read()
        for attempt in range(8):
            try:
                r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60)
                body = r.read().decode("utf-8")
                open(path, "w", encoding="utf-8").write(body)
                time.sleep(2.5)
                return body
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    open(path, "w").write("")
                    return ""
                wait = int(e.headers.get("retry-after") or 20)
                print(f"  {e.code} on {name}, waiting {wait}s", file=sys.stderr)
                time.sleep(min(wait, 90) + 2)
        raise RuntimeError("failed " + url)

    def raw(self, title):
        t = title.replace(" ", "_")
        body = self._get(f"https://en.wikipedia.org/w/index.php?title={urllib.parse.quote(t)}&action=raw",
                         "raw_" + hashlib.md5(t.encode()).hexdigest())
        m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", body, re.I)
        return self.raw(m.group(1)) if m else (title, body)

    def html(self, title):
        title, body = self.raw(title)
        if not body:
            return ""
        t = title.replace(" ", "_")
        return self._get(f"https://en.wikipedia.org/api/rest_v1/page/html/{urllib.parse.quote(t, safe='')}",
                         "html_" + hashlib.md5(t.encode()).hexdigest())


# ------------------------------------------------------------------ helpers
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm(s):
    s = strip_accents(str(s)).lower()
    s = re.sub(r"\b(saint)\b", "st", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(gaa|gac|gfc|clg|hc|hurling club|the)\b", " ", s)
    return re.sub(r"\s+", "", s)


def clean_name(s):
    s = re.sub(r"\[[^\]]*\]", "", str(s))
    s = re.sub(r"\((?:c|capt\.?|captain)\)", "", s, flags=re.I)
    s = re.sub(r"\b(FOTY|HOTY|YFOTY|YHOTY|YPOTY|POTY)\b", "", s)
    s = re.sub(r"[‡†*§¶#^]", "", s)
    s = re.sub(r"\s*\(\d+\)\s*$", "", s)
    return re.sub(r"\s+", " ", s).strip(" ,")


def county_of(text):
    t = strip_accents(str(text)).strip()
    t = re.sub(r"\s*\(\d+\)\s*$", "", t)
    for c in COUNTIES + EXTRA_TEAMS:
        if t.lower() == c.lower() or t.lower().startswith(c.lower() + " "):
            return c
    if t.lower() in ("londonderry",):
        return "Derry"
    return CODES.get(t.upper()[:3]) if len(t) <= 4 else None


def year_of(v):
    m = re.search(r"(18|19|20)\d\d", str(v))
    return int(m.group(0)) if m else None


def tables(html):
    import pandas as pd
    if not html:
        return []
    try:
        return pd.read_html(StringIO(html))
    except ValueError:
        return []


def flat_cols(df):
    cols = []
    for c in df.columns:
        if isinstance(c, tuple):
            parts = [str(x) for x in c if not str(x).startswith("Unnamed")]
            cols.append(" ".join(dict.fromkeys(parts)))
        else:
            cols.append(str(c))
    df = df.copy()
    df.columns = cols
    return df


# ------------------------------------------------------------------ parsing
def parse_allstars(w, title):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(w.html(title), "lxml")
    out = []
    pos_re = re.compile(r"^(GK|RCB|FB|LCB|RWB|CB|CHB|LWB|MD|MF|MID|M|RWF|CF|CHF|LWF|RCF|FF|LCF)$")
    for tb in soup.select("table.wikitable"):
        h = tb.find_previous(["h2", "h3", "h4"])
        yr = year_of(h.get_text()) if h else None
        if not yr or yr < 1971:
            continue
        for tr in tb.select("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 3 or not pos_re.match(cells[0]):
                continue
            pos, county, player = cells[0], None, None
            for c in cells[1:]:
                cc = county_of(c)
                if cc and not county:
                    county = cc
                elif not re.fullmatch(r"\d+", c) and not player:
                    player = clean_name(c)
            if player and county:
                out.append({"year": yr, "pos": pos, "name": player, "county": county})
    return out


def parse_poty(w, title, sport):
    out = {}
    for df in tables(w.html(title)):
        df = flat_cols(df)
        cols = {c.lower(): c for c in df.columns}
        ycol = next((cols[c] for c in cols if c.startswith("year")), None)
        pcol = next((cols[c] for c in cols if c in ("player", "winner")), None)
        ccol = next((cols[c] for c in cols if c.startswith("county")), None)
        if not (ycol and pcol and ccol):
            continue
        rows = [(year_of(r[ycol]), str(r[pcol]), county_of(r[ccol])) for _, r in df.iterrows()]
        rows = [r for r in rows if r[0] and r[2] and r[1] != "nan"]
        by_year = collections.defaultdict(list)
        for r in rows:
            by_year[r[0]].append(r)
        for yr, rs in by_year.items():
            marked = [r for r in rs if "‡" in r[1]]
            pick = marked[0] if marked else (rs[0] if pcol.lower() == "winner" or len(rs) == 1 else None)
            if pick and yr not in out:
                out[yr] = {"year": yr, "name": clean_name(pick[1]), "county": pick[2], "sport": sport}
    return sorted(out.values(), key=lambda r: r["year"])


def parse_captains(w, title):
    out = []
    for df in tables(w.html(title))[:1]:
        if str(df.columns[0]).isdigit() or str(df.columns[0]) == "0":
            df.columns = [str(x) for x in df.iloc[0]]
            df = df.iloc[1:]
        df = flat_cols(df)
        cols = {c.lower(): c for c in df.columns}
        yc, pc = cols.get("year"), cols.get("player") or cols.get("name")
        tc = cols.get("team") or cols.get("county")
        cc = cols.get("club")
        for _, r in df.iterrows():
            yr, team = year_of(r[yc]), county_of(r[tc])
            name = clean_name(r[pc])
            if not yr or not team or "not completed" in name.lower() or name == "nan":
                continue
            club = clean_name(r[cc]) if cc and str(r[cc]) != "nan" else None
            out.append({"year": yr, "name": name, "county": team, "club": club})
    return out


def parse_club_finals(w, title):
    out = []
    for df in tables(w.html(title)):
        df = flat_cols(df)
        cols = list(df.columns)
        wc = next((c for c in cols if c.lower().startswith("winners") and "club" in c.lower()), None)
        wco = next((c for c in cols if c.lower().startswith("winners") and "county" in c.lower()), None)
        rc = next((c for c in cols if c.lower().startswith("runners") and "club" in c.lower()), None)
        rco = next((c for c in cols if c.lower().startswith("runners") and "county" in c.lower()), None)
        yc = next((c for c in cols if c.lower().startswith("year")), None)
        if not (wc and wco and rc and rco and yc):
            continue
        for _, r in df.iterrows():
            yr = year_of(r[yc])
            wcounty, rcounty = county_of(r[wco]), county_of(r[rco])
            if not yr or not wcounty:
                continue
            out.append({"year": yr, "winner": clean_name(r[wc]), "wcounty": wcounty,
                        "runner": clean_name(r[rc]), "rcounty": rcounty})
        if out:
            break
    return out


def wikitext_tables(text):
    """Very small wikitext table reader: returns lists of rows of cleaned cells."""
    def clean(cell):
        cell = re.sub(r"<ref[^>]*/>", "", cell)
        cell = re.sub(r"<ref[^>]*>.*?</ref>", "", cell, flags=re.S)
        cell = re.sub(r"\{\{(?:sort|sortname)\|([^|}]*)\|?([^}]*)\}\}", lambda m: m.group(2) or m.group(1), cell)
        for _ in range(4):
            cell = re.sub(r"\{\{[^{}]*\}\}", "", cell)
        cell = re.sub(r"\{\{.*$", "", cell)
        cell = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", cell, flags=re.I)
        cell = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cell)
        cell = re.sub(r"'{2,}", "", cell)
        cell = re.sub(r"<[^>]+>", "", cell)
        if re.match(r"^\s*[a-z-]+\s*=\s*\"?[^|]*\"?\s*\|(?!\|)", cell):
            cell = cell.split("|", 1)[1]
        return cell.strip()
    out = []
    for body in re.findall(r"\{\|(.*?)\n\|\}", text, flags=re.S):
        rows, cur = [], []
        for line in body.split("\n")[1:]:
            line = line.strip()
            if line.startswith("|-"):
                if cur:
                    rows.append(cur)
                cur = []
            elif line.startswith("!"):
                cur += [clean(c) for c in re.split(r"!!|\|\|", line[1:])]
            elif line.startswith("|") and not line.startswith("|+"):
                cur += [clean(c) for c in line[1:].split("||")]
        if cur:
            rows.append(cur)
        out.append(rows)
    return out


JUNK = re.compile(r"^(no |none|n/a|tbc|tbd|unknown)|not staged|not held|no result|no record|unfinished|abandoned|void|withdrew|competition|championship", re.I)


def parse_county_finals(text):
    """Club → titles counted from the year-by-year finals table (Year | Winners | ...)."""
    best = None
    for rows in wikitext_tables(text):
        if len(rows) < 12:
            continue
        head = [c.lower() for c in rows[0]]
        if not head or "year" not in head[0]:
            continue
        wi = next((i for i, c in enumerate(head) if c.startswith("winner") or c.startswith("champion")), None)
        if wi is None:
            continue
        count, last = collections.Counter(), {}
        for r in rows[1:]:
            if len(r) <= wi:
                continue
            yr = year_of(r[0])
            cell = re.sub(r"^\s*\d+px\|\S*\s*", "", r[wi]).split("|")[0]
            name = clean_name(re.sub(r"\(.*?\)", "", cell))
            if not yr or not name or re.search(r"not (held|completed|played|finished)|no championship|unfinished|void|abandoned|awarded", " ".join(r), re.I):
                continue
            if re.fullmatch(r"[\d\s\-–]+", name) or JUNK.search(name) or "=" in name or "}" in name:
                continue
            count[name] += 1
            last[name] = max(last.get(name, 0), yr)
        if count and (best is None or sum(count.values()) > sum(c["titles"] for c in best)):
            best = [{"name": n, "titles": c, "last": last[n]} for n, c in count.items()]
    return best or []


def parse_roll(w, title):
    """Club → titles: prefer counting the finals list, fall back to the roll of honour."""
    _, text = w.raw(title)
    finals = parse_county_finals(text or "")
    if len(finals) >= 6:
        return finals
    best = None
    for rows in wikitext_tables(text or ""):
        if not rows:
            continue
        head = [c.lower() for c in rows[0]]
        tc = next((i for i, c in enumerate(head) if c in ("club", "team", "clubs", "teams")), None)
        nc = next((i for i, c in enumerate(head) if c in ("titles", "wins", "won", "championships", "titles won", "no. of titles")), None)
        if tc is None or nc is None:
            continue
        found = []
        for r in rows[1:]:
            if len(r) <= max(tc, nc):
                continue
            name = clean_name(re.sub(r"^\s*\d+px\|[^|]*\|?\s*", "", r[tc]))
            years = [int(y) for y in re.findall(r"(?:18|19|20)\d\d", " ".join(c for i, c in enumerate(r) if i not in (tc, nc)))]
            m = re.match(r"\d+", r[nc])
            n = int(m.group(0)) if m else 0
            if not n and years:
                won = next((c for c in r if re.search(r"(?:18|19|20)\d\d", c)), "")
                n = len(re.findall(r"(?:18|19|20)\d\d(?:[–-]\d+)?", won))
            if not name or not n or re.search(r"total", name, re.I) or re.fullmatch(r"[\d\s]+", name):
                continue
            found.append({"name": name, "titles": n, "last": max(years) if years else None})
        if found and (best is None or len(found) > len(best)):
            best = found
    if best:
        return best
    return parse_roll_html(w, title)


def parse_roll_html(w, title):
    best = None
    for df in tables(w.html(title)):
        df = flat_cols(df)
        cols = {c.lower().strip(): c for c in df.columns}
        tc = next((cols[c] for c in cols if c in ("club", "team", "clubs", "teams")), None)
        nc = next((cols[c] for c in cols if c in ("titles", "wins", "won", "championships", "titles won")), None)
        if not (tc and nc):
            continue
        rows = []
        for _, r in df.iterrows():
            name = clean_name(r[tc])
            try:
                n = int(float(str(r[nc]).split()[0]))
            except (ValueError, IndexError):
                continue
            if name and name != "nan" and n > 0 and not re.search(r"total", name, re.I):
                years = [int(y) for y in re.findall(r"(?:18|19|20)\d\d", " ".join(str(v) for v in r.values))]
                rows.append({"name": name, "titles": n, "last": max(years) if years else None})
        if rows and (best is None or len(rows) > len(best)):
            best = rows
    return best or []


# ------------------------------------------------------------------ entities
class Registry:
    def __init__(self):
        self.people, self.clubs = {}, {}

    def person(self, name, county, sport=None, year=None):
        """Same name and county is the same player, unless their years are more
        than 12 apart (Cork had two Brian Murphys; Dublin two Cian O'Sullivans)."""
        base = "p:" + norm(name) + ":" + norm(county)
        n = 1
        while True:
            pid = base if n == 1 else f"{base}:{n}"
            p = self.people.get(pid)
            if p is None or year is None or not p["years"]:
                break
            same = [y for sp, y in p["sy"] if sp == sport] or ([] if sport else p["years"])
            other = [y for sp, y in p["sy"] if sp != sport]
            if (same and min(abs(year - y) for y in same) <= 12) or (not same and other and min(abs(year - y) for y in other) <= 4):
                break
            n += 1
        p = self.people.setdefault(pid, {"id": pid, "label": name, "county": county, "sports": set(),
                                         "allstars": collections.Counter(), "years": [], "sy": [], "poty": 0, "capt": 0})
        if sport:
            p["sports"].add(sport)
        if year:
            p["years"].append(year)
            p["sy"].append((sport, year))
        return p

    def club(self, name, county):
        key = norm(name)
        cid = "c:" + key + ":" + norm(county)
        c = self.clubs.setdefault(cid, {"id": cid, "label": name, "county": county, "titles": 0, "last": None, "fame": 0})
        return c


def fame_person(p):
    last = max(p["years"]) if p["years"] else 1971
    recent = 1 + 1.0 * max(0, (last - 1975) / (NOW - 1975)) ** 2
    score = sum(p["allstars"].values()) + 1.5 * p["poty"] + 1.2 * p["capt"]
    return max(0.2, score) ** 1.45 * recent


def fame_club(c):
    last = c["last"] or 1950
    recent = 1 + 1.5 * max(0, (last - 1970) / (NOW - 1970)) ** 2
    return max(0.3, c["titles"] + c["fame"]) ** 1.3 * recent


def weights(ids, reg, scale=100):
    raw = {}
    for i in ids:
        raw[i] = fame_person(reg.people[i]) if i.startswith("p:") else fame_club(reg.clubs[i])
    tot = sum(raw.values()) or 1
    return {i: round(max(0.05, v / tot * scale), 3) for i, v in raw.items()}


# ------------------------------------------------------------------ build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    a = ap.parse_args()
    w = Wiki(a.cache)
    reg = Registry()
    Q = []

    def add_q(qid, cat, text, ids, fact, hint=None, min_answers=6, county=None):
        ids = list(dict.fromkeys(ids))
        if len(ids) < min_answers:
            return
        text = re.sub(r"\ba ([AEIOU])", r"an \1", text)
        q = {"id": qid, "cat": cat, "text": text, "fact": fact, "a": weights(ids, reg)}
        if hint:
            q["hint"] = hint
        if county:
            q["county"] = county
        Q.append(q)

    # --- All Stars
    stars = {}
    for sport, title in (("football", "List of All Stars Awards winners (football)"), ("hurling", "List of All Stars Awards winners (hurling)")):
        rows = parse_allstars(w, title)
        stars[sport] = rows
        for r in rows:
            p = reg.person(r["name"], r["county"], sport, r["year"])
            p["allstars"][sport] += 1
            r["pid"] = p["id"]
        print(f"All Stars {sport}: {len(rows)} awards, {len({(r['name'], r['county']) for r in rows})} players", file=sys.stderr)

    # --- Player of the year
    poty = {}
    for sport, title in (("football", "GAA/GPA Footballer of the Year"), ("hurling", "GAA/GPA Hurler of the Year")):
        rows = [r for r in parse_poty(w, title, sport) if r["year"] >= 1995]
        poty[sport] = rows
        for r in rows:
            p = reg.person(r["name"], r["county"], sport, r["year"])
            p["poty"] += 1
            r["pid"] = p["id"]
        print(f"{sport} of the year: {len(rows)}", file=sys.stderr)

    # --- Captains
    capts = {}
    for sport, title in (("football", "List of All-Ireland Senior Football Championship winning captains"),
                         ("hurling", "List of All-Ireland Senior Hurling Championship winning captains")):
        rows = parse_captains(w, title)
        capts[sport] = rows
        for r in rows:
            p = reg.person(r["name"], r["county"], sport, r["year"])
            p["capt"] += 1
            r["pid"] = p["id"]
            if r["club"]:
                c = reg.club(r["club"], r["county"])
                c["fame"] += 0.5
        print(f"captains {sport}: {len(rows)}", file=sys.stderr)

    # --- All-Ireland club finals
    finals = {}
    for sport, title in (("football", "All-Ireland Senior Club Football Championship"), ("hurling", "All-Ireland Senior Club Hurling Championship")):
        rows = parse_club_finals(w, title)
        finals[sport] = rows
        for r in rows:
            c = reg.club(r["winner"], r["wcounty"]); c["titles"] += 1; c["last"] = max(c["last"] or 0, r["year"])
            if r["rcounty"]:
                c2 = reg.club(r["runner"], r["rcounty"]); c2["fame"] += 0.4; c2["last"] = max(c2["last"] or 0, r["year"])
        print(f"club finals {sport}: {len(rows)}", file=sys.stderr)

    # ================= questions: All Stars
    for sport, noun, verb in (("football", "footballer", "football"), ("hurling", "hurler", "hurling")):
        rows = stars[sport]
        pid = lambda r: r["pid"]
        by_county = collections.defaultdict(set)
        for r in rows:
            by_county[r["county"]].add(pid(r))
        for county, ids in by_county.items():
            if len(ids) >= 12:
                top = max(ids, key=lambda i: reg.people[i]["allstars"][sport])
                tp = reg.people[top]
                add_q(f"as-{sport}-{norm(county)}", "All Stars", f"Name a {county} {noun} who has won an All Star.", ids,
                      f"{len(ids)} {county} {noun}s have won {verb} All Stars. {tp['label']} has the most, with {tp['allstars'][sport]}.",
                      county=county)
        gk = {pid(r) for r in rows if r["pos"] == "GK"}
        add_q(f"as-{sport}-gk", "All Stars", f"Name a goalkeeper who has won a {verb} All Star.", gk,
              f"{len(gk)} different goalkeepers have won {verb} All Stars since 1971.")
        counts = collections.Counter(pid(r) for r in rows)
        multi = [i for i, n in counts.items() if n >= 5]
        best = counts.most_common(1)[0]
        add_q(f"as-{sport}-5plus", "All Stars", f"Name a {noun} who has won five or more All Stars.", multi,
              f"{len(multi)} {noun}s have won five or more. {reg.people[best[0]]['label']} leads the way with {best[1]}.")
        for dec in (1980, 1990, 2000, 2010, 2020):
            ids = {pid(r) for r in rows if dec <= r["year"] < dec + 10}
            add_q(f"as-{sport}-{dec}s", "All Stars", f"Name a {noun} who won an All Star in the {dec}s.", ids,
                  f"{len(ids)} different {noun}s won All Stars in the {dec}s.",
                  hint=f"Any year from {dec} to {dec + 9}." if dec < 2020 else "Any year from 2020 on.")
        # county had only one or two All Stars: deep cuts
        small = [c for c, ids in by_county.items() if len(ids) <= 3]
        if len(small) >= 4:
            ids = {i for c in small for i in by_county[c]}
            add_q(f"as-{sport}-weaker", "All Stars",
                  f"Name a {noun} who won an All Star for a county with three or fewer {verb} All Star winners.", ids,
                  f"{', '.join(sorted(small))} have each had three or fewer {verb} All Star winners.",
                  hint=f"Counties like {', '.join(sorted(small)[:3])}.")

    # dual All Stars
    dual = [i for i, p in reg.people.items() if p["allstars"]["football"] and p["allstars"]["hurling"]]
    add_q("as-dual", "Dual stars", "Name a player who won All Stars in both hurling and football.", dual,
          f"Only {len(dual)} players have won All Stars in both codes.", min_answers=4)

    # ================= questions: player of the year
    for sport, award in (("football", "Footballer of the Year"), ("hurling", "Hurler of the Year")):
        ids = [r["pid"] for r in poty[sport]]
        multi = [i for i, n in collections.Counter(ids).items() if n > 1]
        add_q(f"poty-{sport}", "Awards", f"Name a winner of the GAA/GPA {award} since 1995.", ids,
              f"{len(set(ids))} players have won it since 1995" + (f"; {', '.join(reg.people[i]['label'] for i in multi)} won it more than once." if multi else "."))

    # ================= questions: captains
    for sport, cup in (("football", "Sam Maguire"), ("hurling", "Liam MacCarthy")):
        rows = [r for r in capts[sport] if r["year"] >= 1975]
        ids = [r["pid"] for r in rows]
        add_q(f"capt-{sport}", "Captains", f"Name a captain who lifted the {cup} Cup between 1975 and {NOW}.", ids,
              f"{len(set(ids))} different captains lifted the {cup} in that time.")
        both = [i for i in set(ids) if reg.people[i]["allstars"][sport] > 0]
        add_q(f"capt-allstar-{sport}", "Captains", f"Name an All-Ireland winning {sport} captain who also won an All Star.", both,
              f"{len(both)} All-Ireland winning {sport} captains since 1975 also won All Stars.")
        clubs = []
        for r in capts[sport]:
            if r["club"] and r["year"] >= 1950:
                clubs.append(reg.club(r["club"], r["county"])["id"])
        add_q(f"capt-club-{sport}", "Clubs", f"Name a club that has produced an All-Ireland winning {sport} captain since 1950.", clubs,
              f"{len(set(clubs))} clubs have produced a {cup}-winning captain since 1950.")

    # ================= questions: All-Ireland club championships
    for sport in ("football", "hurling"):
        rows = finals[sport]
        winners = [reg.club(r["winner"], r["wcounty"])["id"] for r in rows]
        top = collections.Counter(winners).most_common(1)[0]
        add_q(f"aiclub-{sport}", "Clubs", f"Name a club that has won the All-Ireland Senior Club {sport.title()} Championship.", winners,
              f"{len(set(winners))} clubs have won it. {reg.clubs[top[0]]['label']} have the most titles, with {top[1]}.")
        lost = {reg.club(r["runner"], r["rcounty"])["id"] for r in rows if r["rcounty"]} - set(winners)
        add_q(f"aiclub-{sport}-nearly", "Clubs", f"Name a club that has lost an All-Ireland club {sport} final but never won one.", lost,
              f"{len(lost)} clubs have reached the All-Ireland club {sport} final without ever winning it.")
        for prov in ("Munster", "Leinster", "Ulster", "Connacht"):
            ids = [reg.club(r["winner"], r["wcounty"])["id"] for r in rows if PROVINCE.get(r["wcounty"]) == prov]
            add_q(f"aiclub-{sport}-{prov.lower()}", "Clubs", f"Name a {prov} club that has won the All-Ireland club {sport} title.", ids,
                  f"{len(set(ids))} {prov} clubs have won the All-Ireland club {sport} title.", min_answers=5)

    # ================= questions: county championships (also used as each player's home-county question)
    for sport, counties in (("football", FOOTBALL_COUNTY_PAGES), ("hurling", HURLING_COUNTY_PAGES)):
        for county in counties:
            title = f"{county} Senior {sport.title()} Championship"
            rows = parse_roll(w, title)
            if len(rows) < 6:
                print(f"  skip {title}: {len(rows)} clubs", file=sys.stderr)
                continue
            ids = []
            for r in rows:
                c = reg.club(r["name"], county)
                c["titles"] = max(c["titles"], r["titles"])
                if r["last"]:
                    c["last"] = max(c["last"] or 0, r["last"])
                ids.append(c["id"])
            top = max(rows, key=lambda r: r["titles"])
            ids = list(dict.fromkeys(ids))
            add_q(f"county-{sport}-{norm(county)}", "Your county", f"Name a club that has won the {county} Senior {sport.title()} Championship.", ids,
                  f"{len(ids)} clubs have won it. {top['name']} have the most titles, with {top['titles']}.", county=county)

    # ------------------------------------------------------------------ write
    used = {i for q in Q for i in q["a"]}
    people = [{"id": p["id"], "label": p["label"], "county": p["county"]} for p in reg.people.values()]
    clubs = [{"id": c["id"], "label": c["label"], "county": c["county"]} for c in reg.clubs.values()]
    out = {
        "source": "Generated by tools/build_questions.py from Wikipedia list pages (CC BY-SA).",
        "people": people, "clubs": clubs, "questions": Q,
    }
    body = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(a.out, "questions.js"), "w", encoding="utf-8") as f:
        f.write("/* Generated by tools/build_questions.py from Wikipedia list pages (CC BY-SA). */\n")
        f.write(f"(typeof window !== 'undefined' ? window : globalThis).PuckoutQuestions = {body};\n")
    cats = collections.Counter(q["cat"] for q in Q)
    print(f"questions: {len(Q)} {dict(cats)}; people {len(people)}, clubs {len(clubs)}, answers used {len(used)}; "
          f"{os.path.getsize(os.path.join(a.out, 'questions.js')) // 1024} KB", file=sys.stderr)


if __name__ == "__main__":
    main()
