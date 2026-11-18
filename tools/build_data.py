#!/usr/bin/env python3
"""
Builds the map and club data the game loads:

  data/geo.json     Ireland's coastline, the 32 counties, loughs, rivers, towns to label
  data/clubs.json   GAA clubs with locations, for the "find your club" search
  data/places.json  Towns and villages, so anyone can start from their own parish

Sources (all open data; credit is shown in the game and README):
  - County outlines and extra loughs: OpenStreetMap via Nominatim (ODbL)
  - Coastline, big loughs, rivers: Natural Earth 1:10m (public domain)
  - Clubs: Wikidata (CC0), located from Wikidata/Wikipedia coordinates or the
    town in the club's name
  - Towns and villages: GeoNames (CC BY 4.0)

Usage:
  python3 tools/build_data.py --cache /path/to/cache   # downloads into the cache once, then builds

Network calls are polite: one request at a time, with a descriptive User-Agent,
and Nominatim is called at most once a second.
"""
import argparse, io, json, math, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request, zipfile

UA = "puckout-data-builder/0.1 (open-source GAA quiz game)"
BBOX = (-10.8, 51.3, -5.3, 55.5)  # lon/lat
COUNTIES = ["Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down", "Dublin",
            "Fermanagh", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford",
            "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Tyrone",
            "Waterford", "Westmeath", "Wexford", "Wicklow"]
NI = {"Antrim", "Armagh", "Derry", "Down", "Fermanagh", "Tyrone"}
PROVINCE = {**{c: "Ulster" for c in ["Antrim", "Armagh", "Cavan", "Derry", "Donegal", "Down", "Fermanagh", "Monaghan", "Tyrone"]},
            **{c: "Munster" for c in ["Clare", "Cork", "Kerry", "Limerick", "Tipperary", "Waterford"]},
            **{c: "Connacht" for c in ["Galway", "Leitrim", "Mayo", "Roscommon", "Sligo"]},
            **{c: "Leinster" for c in ["Carlow", "Dublin", "Kildare", "Kilkenny", "Laois", "Longford", "Louth", "Meath",
                                       "Offaly", "Westmeath", "Wexford", "Wicklow"]}}
EXTRA_LOUGHS = ["Lough Corrib", "Lough Mask", "Lough Conn", "Lower Lough Erne", "Lough Leane", "Lough Derravaragh",
                "Lough Gill", "Lough Sheelin", "Lough Owel", "Lough Ennell", "Lough Arrow", "Lough Key", "Lough Gara",
                "Lough Melvin", "Lough Swilly", "Strangford Lough"]


# ---------------------------------------------------------------- fetching
def fetch(url, path, data=None, headers=None):
    if os.path.exists(path):
        return path
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
        f.write(r.read())
    os.replace(path + ".part", path)
    return path


def nominatim(q, path):
    if os.path.exists(path):
        return json.load(open(path))
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "polygon_geojson": 1, "polygon_threshold": 0.002, "limit": 5})
    fetch(url, path)
    time.sleep(1.2)
    return json.load(open(path))


def sparql(query, path):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query})
    fetch(url, path, headers={"Accept": "application/sparql-results+json"})
    return json.load(open(path))["results"]["bindings"]


# ---------------------------------------------------------------- geometry
def polys_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def ring_area(r):
    a = 0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2


def dp(points, eps):
    """Douglas-Peucker on [lon, lat] points (lon scaled by cos(lat))."""
    if len(points) < 4:
        return points
    k = math.cos(math.radians(53.4))

    def dist(p, a, b):
        ax, ay, bx, by, px, py = a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        best, idx = 0, -1
        for i in range(s + 1, e):
            d = dist(points[i], points[s], points[e])
            if d > best:
                best, idx = d, i
        if best > eps and idx > 0:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, kp in zip(points, keep) if kp]


def simplify_polys(polys, eps, min_area):
    out = []
    for poly in polys:
        outer = poly[0]
        if ring_area(outer) < min_area:
            continue
        r = dp(outer, eps)
        if len(r) >= 4:
            out.append([[round(x, 4), round(y, 4)] for x, y in r])
    return out


def in_ring(x, y, r):
    inside = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, yi, xj, yj = r[i][0], r[i][1], r[j][0], r[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def in_bbox(x, y):
    return BBOX[0] < x < BBOX[2] and BBOX[1] < y < BBOX[3]


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()


def write_js(out, fname, var, obj):
    """Data ships as plain scripts so the game also works when index.html is opened from disk."""
    body = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(out, fname), "w", encoding="utf-8") as f:
        f.write(f"/* Generated by tools/build_data.py. {obj.get('attribution', 'Sources: see README.')} */\n")
        f.write(f"(typeof window !== 'undefined' ? window : globalThis).{var} = {body};\n")


# ---------------------------------------------------------------- build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    a = ap.parse_args()
    C, OUT = a.cache, a.out
    os.makedirs(C, exist_ok=True)
    os.makedirs(os.path.join(C, "counties"), exist_ok=True)
    os.makedirs(os.path.join(C, "loughs"), exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    ne = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"

    # Coastline: Ireland plus the Northern Ireland part of the UK
    countries = json.load(open(fetch(ne + "ne_10m_admin_0_countries.geojson", os.path.join(C, "ne_countries.geojson"))))
    land = []
    for f in countries["features"]:
        a3 = f["properties"]["ADM0_A3"]
        if a3 not in ("IRL", "GBR"):
            continue
        for poly in polys_of(f["geometry"]):
            xs = [p[0] for p in poly[0]]
            ys = [p[1] for p in poly[0]]
            cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
            if a3 == "IRL" or (-8.3 < cx < -5.4 and 54.0 < cy < 55.35):
                land.append(poly)
    land = simplify_polys(land, 0.0025, 0.0004)

    # Counties
    counties = []
    for c in COUNTIES:
        q = ("County Londonderry" if c == "Derry" else "County " + c) + (", Northern Ireland" if c in NI else ", Ireland")
        res = [r for r in nominatim(q, os.path.join(C, "counties", c + ".json"))
               if r.get("geojson", {}).get("type") in ("Polygon", "MultiPolygon")]
        polys = simplify_polys(polys_of(res[0]["geojson"]), 0.003, 0.0008)
        counties.append({"name": c, "province": PROVINCE[c], "rings": polys})

    def county_at(x, y):
        for i, c in enumerate(counties):
            if any(in_ring(x, y, r) for r in c["rings"]):
                return i
        return -1

    # Loughs and rivers
    lakes_ne = json.load(open(fetch(ne + "ne_10m_lakes.geojson", os.path.join(C, "ne_lakes.geojson"))))
    lakes = []
    for f in lakes_ne["features"]:
        for poly in polys_of(f["geometry"]):
            if all(in_bbox(*p) for p in poly[0]):
                lakes.append({"name": f["properties"].get("name") or "", "rings": simplify_polys([poly], 0.0015, 0.0002)})
    for name in EXTRA_LOUGHS:
        res = [r for r in nominatim(name + ", Ireland", os.path.join(C, "loughs", name.replace(" ", "_") + ".json"))
               if r.get("geojson", {}).get("type") in ("Polygon", "MultiPolygon")]
        if not res:
            continue
        rings = simplify_polys(polys_of(res[0]["geojson"]), 0.0015, 0.0002)
        if rings and all(in_bbox(*p) for r in rings for p in r):
            lakes.append({"name": name, "rings": rings})
    lakes = [l for l in lakes if l["rings"]]

    rivers_ne = json.load(open(fetch(ne + "ne_10m_rivers_lake_centerlines.geojson", os.path.join(C, "ne_rivers.geojson"))))
    rivers = []
    for f in rivers_ne["features"]:
        g = f["geometry"]
        if not g:
            continue
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for ln in lines:
            if ln and all(in_bbox(*p) for p in ln):
                rivers.append({"name": f["properties"].get("name") or "",
                               "line": [[round(x, 4), round(y, 4)] for x, y in dp(ln, 0.002)]})

    # Towns and villages (GeoNames)
    fetch("https://download.geonames.org/export/dump/IE.zip", os.path.join(C, "IE.zip"))
    fetch("https://download.geonames.org/export/dump/GB.zip", os.path.join(C, "GB.zip"))
    places = []
    for code, fname in (("IE", "IE.zip"), ("GB", "GB.zip")):
        with zipfile.ZipFile(os.path.join(C, fname)) as z, z.open(code + ".txt") as fh:
            for line in io.TextIOWrapper(fh, encoding="utf-8"):
                f = line.rstrip("\n").split("\t")
                if f[6] != "P" or f[7] in ("PPLL", "PPLH", "PPLQ", "PPLW", "PPLCH"):
                    continue
                if code == "GB" and f[10] != "NIR":
                    continue
                lat, lon = float(f[4]), float(f[5])
                if not in_bbox(lon, lat):
                    continue
                places.append({"name": f[1], "lat": lat, "lon": lon, "pop": int(f[14] or 0), "code": f[7]})
    for p in places:
        p["county"] = county_at(p["lon"], p["lat"])
    places = [p for p in places if p["county"] >= 0]
    by_county_name = {}
    for p in places:
        by_county_name.setdefault((p["county"], norm(p["name"])), p)
    print(f"places: {len(places)}", file=sys.stderr)

    # Clubs (Wikidata)
    rows = sparql("""
      SELECT DISTINCT ?item ?itemLabel ?t ?coord ?loc ?locLabel ?locCoord ?article WHERE {
        ?item wdt:P641 ?sport . VALUES ?sport { wd:Q204632 wd:Q213711 }
        ?item wdt:P31 ?t . VALUES ?t { wd:Q847017 wd:Q47006607 wd:Q12973014 }
        OPTIONAL { ?item wdt:P625 ?coord }
        OPTIONAL { ?item wdt:P131 ?loc . OPTIONAL { ?loc wdt:P625 ?locCoord } }
        OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }""", os.path.join(C, "wd_clubs_v2.json"))
    clubs = {}
    club_types = {"Q847017", "Q47006607", "Q12973014"}  # sports club, GAA club, sports team
    for b in rows:
        if b.get("t") and b["t"]["value"].rsplit("/", 1)[1] not in club_types:
            continue
        q = b["item"]["value"].rsplit("/", 1)[1]
        c = clubs.setdefault(q, {"label": b["itemLabel"]["value"], "locs": {}})
        if "coord" in b:
            c["coord"] = b["coord"]["value"]
        if "loc" in b:
            c["locs"][b["locLabel"]["value"]] = b.get("locCoord", {}).get("value")
        if "article" in b:
            c["article"] = urllib.parse.unquote(b["article"]["value"].rsplit("/", 1)[1]).replace("_", " ")
    skip = re.compile(r"\b(county|senior|minor|under|team|ladies|board|association|league|championship)\b", re.I)
    clubs = {q: c for q, c in clubs.items() if not skip.search(c["label"]) and not re.match(r"^Q\d+$", c["label"])}

    # Wikipedia coordinates, 50 titles per request
    titles = sorted({c["article"] for c in clubs.values() if "article" in c})
    wp = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        path = os.path.join(C, f"wp_coords_{i // 50}.json")
        url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "query", "prop": "coordinates", "titles": "|".join(chunk), "format": "json", "redirects": 1})
        if not os.path.exists(path):
            for attempt in range(4):
                try:
                    fetch(url, path)
                    break
                except urllib.error.HTTPError as e:
                    if e.code != 429:
                        raise
                    time.sleep(10 * (attempt + 1))
            time.sleep(1.5)
        d = json.load(open(path))
        norm_map = {x["to"]: x["from"] for x in d["query"].get("normalized", []) + d["query"].get("redirects", [])}
        for page in d["query"]["pages"].values():
            if "coordinates" in page:
                t = page["title"]
                while t in norm_map:
                    t = norm_map[t]
                wp[t] = (page["coordinates"][0]["lon"], page["coordinates"][0]["lat"])

    def point(s):
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", s or "")
        return (float(m.group(1)), float(m.group(2))) if m else None

    county_idx = {c: i for i, c in enumerate(COUNTIES)}
    county_idx["Londonderry"] = county_idx["Derry"]
    noise = {"gaa", "gac", "gfc", "clg", "hc", "hurling", "club", "camogie", "football", "gaelic", "cumann", "the", "st", "and",
             "of", "na", "an", "og", "naomh", "saint", "rovers", "rangers", "gaels", "harps", "shamrocks", "sarsfields", "emmets",
             "celtic", "united", "davitts", "mitchels", "o", "s", "fc", "ac", "cumann", "luthchleas", "gael", "ui"}

    out_clubs, how = [], {"wikidata": 0, "wikipedia": 0, "town": 0, "name": 0}
    for q, c in clubs.items():
        ll, src = point(c.get("coord")), "wikidata"
        if not ll and c.get("article") in wp:
            ll, src = wp[c["article"]], "wikipedia"
        county_hint = None
        for name, coord in c["locs"].items():
            m = re.match(r"County (\w+)", name)
            if m and m.group(1) in county_idx:
                county_hint = county_idx[m.group(1)]
            elif not ll and point(coord):
                ll, src = point(coord), "town"
        if not ll and county_hint is not None:
            words = [w for w in norm(c["label"]).split() if w]
            found = None
            for n in (3, 2, 1):
                for i in range(len(words) - n + 1):
                    gram = words[i:i + n]
                    if all(w in noise for w in gram):
                        continue
                    p = by_county_name.get((county_hint, " ".join(gram)))
                    if p:
                        found = p
                        break
                if found:
                    break
            if found:
                ll, src = (found["lon"], found["lat"]), "name"
        if not ll or not in_bbox(*ll):
            continue
        ci = county_at(*ll)
        if ci < 0:
            continue
        how[src] += 1
        label = re.sub(r"\s+(GAA|G\.A\.A\.|GAC|G\.A\.C\.|GFC|CLG)$", "", c["label"]).strip()
        out_clubs.append([label, ci, round(ll[1], 4), round(ll[0], 4)])
    out_clubs.sort(key=lambda r: norm(r[0]))
    print(f"clubs: {len(out_clubs)} located of {len(clubs)} {how}", file=sys.stderr)

    # Labels for the map: county towns, cities, big towns
    labels = [p for p in places if p["code"] in ("PPLC", "PPLA", "PPLA2") or p["pop"] >= 9000]
    labels = [{"name": p["name"], "lat": round(p["lat"], 4), "lon": round(p["lon"], 4),
               "size": 3 if p["pop"] >= 100000 or p["code"] == "PPLC" else 2 if p["pop"] >= 20000 else 1} for p in labels]

    geo = {
        "attribution": "© OpenStreetMap contributors (ODbL), Natural Earth, GeoNames (CC BY 4.0), Wikidata",
        "land": land, "counties": counties, "lakes": lakes, "rivers": rivers, "towns": labels,
    }
    write_js(OUT, "geo.js", "PuckoutGeo", geo)
    write_js(OUT, "clubs.js", "PuckoutClubs", {"counties": COUNTIES, "clubs": out_clubs})
    pl = sorted(places, key=lambda p: (-p["pop"], p["name"]))
    seen, rows = set(), []
    for p in pl:
        k = (norm(p["name"]), p["county"])
        if k in seen:
            continue
        seen.add(k)
        rows.append([p["name"], p["county"], round(p["lat"], 4), round(p["lon"], 4)])
    write_js(OUT, "places.js", "PuckoutPlaces", {"counties": COUNTIES, "places": rows})
    for f in ("geo.js", "clubs.js", "places.js"):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB", file=sys.stderr)


if __name__ == "__main__":
    main()
