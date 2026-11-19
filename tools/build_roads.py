#!/usr/bin/env python3
"""
Builds js/roads.js: a simple map of Ireland's main roads (motorways and
national routes) as towns joined by road. The game routes each player
along it from their club to Croke Park, so the road follows the M7, N21,
M6, N2 and so on, and passes what you'd really pass.

Town positions come from data/places.js (GeoNames). A few points that
aren't towns (motorway junctions, Dublin streets) are given directly.

Usage:  python3 tools/build_roads.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")

# id: (place name, county) or (lat, lon) for fixed points
NODES = {
    # Dublin: entry points and the last stretch to Croke Park
    "croker": (53.3607, -6.2512), "palace": (53.3459, -6.2594), "gravediggers": (53.3712, -6.2732),
    "quinns": (53.3693, -6.2530), "redcow": (53.3166, -6.3700), "phoenixpark": (53.3559, -6.3298),
    "liffeyvalley": (53.3540, -6.3920), "blanch": (53.3880, -6.3770), "finglas": (53.3900, -6.2990),
    "airport": (53.4264, -6.2499), "stillorgan": (53.2890, -6.1990), "aviva": (53.3352, -6.2285),
    # M7 / N7
    "naas": ("Naas", "Kildare"), "newbridge": (53.1819, -6.7967), "kildare": ("Kildare", "Kildare"),
    "monasterevin": ("Monasterevin", "Kildare"), "portlaoise": ("Portlaoise", "Laois"), "mountrath": ("Mountrath", "Laois"),
    "roscrea": ("Roscrea", "Tipperary"), "moneygall": (52.8826, -7.9449), "nenagh": ("Nenagh", "Tipperary"),
    "limerick": ("Limerick", "Limerick"),
    # M8
    "abbeyleix": ("Abbeyleix", "Laois"), "urlingford": ("Urlingford", "Kilkenny"), "cashel": ("Cashel", "Tipperary"),
    "cahir": ("Cahir", "Tipperary"), "mitchelstown": ("Mitchelstown", "Cork"), "fermoy": ("Fermoy", "Cork"), "cork": ("Cork", "Cork"),
    "thurles": ("Thurles", "Tipperary"),
    # M9 / N10 / N24 / N25
    "kilcullen": ("Kilcullen", "Kildare"), "carlow": ("Carlow", "Carlow"), "paulstown": (52.6800, -7.0200),
    "kilkenny": ("Kilkenny", "Kilkenny"), "waterford": ("Waterford", "Waterford"), "carrickonsuir": ("Carrick-on-Suir", "Tipperary"),
    "clonmel": (52.3550, -7.7039), "tipperary": ("Tipperary", "Tipperary"), "midleton": ("Midleton", "Cork"),
    "youghal": ("Youghal", "Cork"), "dungarvan": ("Dungarvan", "Waterford"), "newross": ("New Ross", "Wexford"),
    # N11 / M11
    "wexford": ("Wexford", "Wexford"), "enniscorthy": ("Enniscorthy", "Wexford"), "gorey": ("Gorey", "Wexford"),
    "arklow": ("Arklow", "Wicklow"), "ashford": ("Ashford", "Wicklow"), "bray": ("Bray", "Wicklow"),
    # N20 / N21 / N22 / Kerry and west Cork
    "mallow": ("Mallow", "Cork"), "charleville": ("Charleville", "Cork"), "croom": ("Croom", "Limerick"),
    "adare": ("Adare", "Limerick"), "rathkeale": ("Rathkeale", "Limerick"), "newcastlewest": ("Newcastle West", "Limerick"),
    "abbeyfeale": ("Abbeyfeale", "Limerick"), "castleisland": ("Castleisland", "Kerry"), "tralee": ("Tralee", "Kerry"),
    "farranfore": ("Farranfore", "Kerry"), "killarney": ("Killarney", "Kerry"), "macroom": ("Macroom", "Cork"),
    "kenmare": ("Kenmare", "Kerry"), "cahersiveen": ("Cahersiveen", "Kerry"), "killorglin": ("Killorglin", "Kerry"),
    "dingle": ("Dingle", "Kerry"), "bantry": ("Bantry", "Cork"), "skibbereen": ("Skibbereen", "Cork"),
    "clonakilty": ("Clonakilty", "Cork"), "bandon": ("Bandon", "Cork"),
    # Clare and Galway
    "shannon": ("Shannon", "Clare"), "ennis": ("Ennis", "Clare"), "kilrush": ("Kilrush", "Clare"), "gort": ("Gort", "Galway"),
    "galway": ("Galway", "Galway"), "oughterard": ("Oughterard", "Galway"), "clifden": ("Clifden", "Galway"),
    "tuam": ("Tuam", "Galway"),
    # M6 / M4 / N4 / N5 / N17
    "athenry": ("Athenry", "Galway"), "loughrea": ("Loughrea", "Galway"), "ballinasloe": ("Ballinasloe", "Galway"),
    "athlone": ("Athlone", "Westmeath"), "kilbeggan": ("Kilbeggan", "Westmeath"), "tullamore": ("Tullamore", "Offaly"),
    "birr": ("Birr", "Offaly"), "kinnegad": (53.4580, -7.1020), "enfield": ("Enfield", "Meath"),
    "maynooth": ("Maynooth", "Kildare"), "mullingar": (53.5259, -7.3381), "longford": ("Longford", "Longford"),
    "carrickonshannon": ("Carrick-on-Shannon", "Leitrim"), "boyle": ("Boyle", "Roscommon"), "sligo": ("Sligo", "Sligo"),
    "roscommon": ("Roscommon", "Roscommon"), "strokestown": ("Strokestown", "Roscommon"), "charlestown": ("Charlestown", "Mayo"),
    "knock": (53.7920, -8.9180), "claremorris": ("Claremorris", "Mayo"), "castlebar": ("Castlebar", "Mayo"),
    "westport": ("Westport", "Mayo"), "ballina": ("Ballina", "Mayo"), "tubbercurry": ("Tobercurry", "Sligo"),
    # N3 / N15 / Donegal
    "dunshaughlin": ("Dunshaughlin", "Meath"), "navan": ("Navan", "Meath"), "kells": ("Kells", "Meath"),
    "virginia": ("Virginia", "Cavan"), "cavan": ("Cavan", "Cavan"), "belturbet": ("Belturbet", "Cavan"),
    "enniskillen": ("Enniskillen", "Fermanagh"), "ballyshannon": ("Ballyshannon", "Donegal"), "bundoran": ("Bundoran", "Donegal"),
    "donegaltown": (54.6538, -8.1096), "ballybofey": ("Ballybofey", "Donegal"), "letterkenny": ("Letterkenny", "Donegal"),
    "buncrana": ("Buncrana", "Donegal"), "lifford": (54.8340, -7.4860),
    # N2 / A5 / M1 / Northern Ireland
    "ashbourne": ("Ashbourne", "Meath"), "slane": ("Slane", "Meath"), "ardee": ("Ardee", "Louth"),
    "carrickmacross": ("Carrickmacross", "Monaghan"), "castleblayney": ("Castleblayney", "Monaghan"),
    "monaghan": ("Monaghan", "Monaghan"), "clones": ("Clones", "Monaghan"), "aughnacloy": ("Aughnacloy", "Tyrone"),
    "omagh": ("Omagh", "Tyrone"), "strabane": ("Strabane", "Tyrone"), "derry": ("Derry", "Derry"),
    "dungannon": ("Dungannon", "Tyrone"), "drogheda": ("Drogheda", "Louth"), "dundalk": ("Dundalk", "Louth"),
    "newry": ("Newry", "Down"), "banbridge": ("Banbridge", "Down"), "lisburn": ("Lisburn", "Antrim"),
    "belfast": ("Belfast", "Antrim"), "antrim": ("Antrim", "Antrim"), "ballymena": ("Ballymena", "Antrim"),
    "coleraine": ("Coleraine", "Derry"), "limavady": ("Limavady", "Derry"), "magherafelt": ("Magherafelt", "Derry"),
    "dungiven": ("Dungiven", "Derry"), "portadown": ("Portadown", "Armagh"), "armagh": ("Armagh", "Armagh"),
    "downpatrick": ("Downpatrick", "Down"),
}

# Roads, as chains of towns joined end to end.
ROADS = {
    "Dublin": [["redcow", "palace", "croker"], ["liffeyvalley", "phoenixpark", "palace"], ["stillorgan", "aviva", "palace"],
               ["blanch", "gravediggers", "croker"], ["finglas", "gravediggers"], ["airport", "quinns", "croker"],
               ["stillorgan", "redcow", "liffeyvalley", "blanch", "finglas", "airport"]],
    "M7": [["redcow", "naas", "newbridge", "kildare", "monasterevin", "portlaoise", "mountrath", "roscrea", "moneygall", "nenagh", "limerick"]],
    "M8": [["portlaoise", "abbeyleix", "urlingford", "cashel", "cahir", "mitchelstown", "fermoy", "cork"], ["urlingford", "thurles", "cashel"]],
    "M9": [["naas", "kilcullen", "carlow", "paulstown", "waterford"], ["paulstown", "kilkenny"]],
    "N24": [["waterford", "carrickonsuir", "clonmel", "cahir"], ["clonmel", "tipperary", "limerick"]],
    "N25": [["cork", "midleton", "youghal", "dungarvan", "waterford", "newross", "wexford"]],
    "N11": [["stillorgan", "bray", "ashford", "arklow", "gorey", "enniscorthy", "wexford"], ["newross", "enniscorthy"]],
    "N20": [["cork", "mallow", "charleville", "croom", "limerick"]],
    "N21": [["limerick", "adare", "rathkeale", "newcastlewest", "abbeyfeale", "castleisland", "farranfore"], ["castleisland", "tralee"]],
    "N22": [["tralee", "farranfore", "killarney", "macroom", "cork"], ["dingle", "tralee"]],
    "Kerry": [["cahersiveen", "killorglin", "killarney"], ["killorglin", "farranfore"], ["killarney", "kenmare", "bantry", "skibbereen", "clonakilty", "bandon", "cork"]],
    "M18": [["limerick", "shannon", "ennis", "gort", "galway"], ["kilrush", "ennis"]],
    "M6": [["galway", "athenry", "loughrea", "ballinasloe", "athlone", "kilbeggan", "kinnegad", "enfield", "maynooth", "liffeyvalley"]],
    "Connemara": [["clifden", "oughterard", "galway"], ["clifden", "westport"]],
    "N4": [["kinnegad", "mullingar", "longford", "carrickonshannon", "boyle", "sligo"]],
    "N5": [["longford", "strokestown", "charlestown", "castlebar", "westport"], ["castlebar", "ballina"], ["charlestown", "ballina"]],
    "N17": [["galway", "tuam", "claremorris", "knock", "charlestown", "tubbercurry", "sligo"], ["claremorris", "castlebar"]],
    "Midlands": [["athlone", "roscommon", "strokestown"], ["kilbeggan", "tullamore", "birr", "nenagh"], ["tullamore", "portlaoise"],
                 ["athlone", "mullingar"]],
    "N3": [["blanch", "dunshaughlin", "navan", "kells", "virginia", "cavan", "belturbet", "enniskillen", "ballyshannon"]],
    "N15": [["sligo", "bundoran", "ballyshannon", "donegaltown", "ballybofey", "letterkenny"], ["ballybofey", "lifford", "strabane"],
            ["letterkenny", "lifford"], ["letterkenny", "buncrana", "derry"]],
    "N2": [["finglas", "ashbourne", "slane", "ardee", "carrickmacross", "castleblayney", "monaghan", "aughnacloy", "omagh", "strabane", "derry"],
           ["cavan", "clones", "monaghan"], ["enniskillen", "omagh"], ["aughnacloy", "dungannon"]],
    "M1": [["airport", "drogheda", "dundalk", "newry", "banbridge", "lisburn", "belfast"], ["ardee", "dundalk"]],
    "North": [["belfast", "antrim", "ballymena", "coleraine", "limavady", "derry"], ["antrim", "magherafelt", "dungiven", "derry"],
              ["dungannon", "portadown", "lisburn"], ["armagh", "portadown"], ["armagh", "monaghan"], ["downpatrick", "belfast"],
              ["newry", "armagh"]],
}


def main():
    src = open(os.path.join(ROOT, "data", "places.js"), encoding="utf-8").read()
    places = json.loads(src[src.index("PuckoutPlaces = ") + 16: src.rstrip().rindex(";")])
    counties = places["counties"]
    index = {}
    for name, ci, lat, lon in places["places"]:
        index.setdefault((name, counties[ci]), (lat, lon))
    nodes = {}
    for nid, v in NODES.items():
        if isinstance(v[0], float):
            nodes[nid] = [round(v[0], 4), round(v[1], 4)]
        else:
            if v not in index:
                raise SystemExit(f"no place {v} for node {nid}")
            lat, lon = index[v]
            nodes[nid] = [round(lat, 4), round(lon, 4)]
    edges = set()
    for road, chains in ROADS.items():
        for chain in chains:
            for a, b in zip(chain, chain[1:]):
                if a not in nodes or b not in nodes:
                    raise SystemExit(f"unknown node in {road}: {a}-{b}")
                edges.add(tuple(sorted((a, b))))
    out = {"nodes": nodes, "edges": sorted(edges), "end": "croker"}
    with open(os.path.join(ROOT, "js", "roads.js"), "w", encoding="utf-8") as f:
        f.write("/* Generated by tools/build_roads.py: Ireland's main roads as towns joined by road. */\n")
        f.write("(typeof window !== 'undefined' ? window : globalThis).PuckoutRoads = ")
        f.write(json.dumps(out, separators=(",", ":")))
        f.write(";\n")
    print(f"{len(nodes)} places, {len(edges)} road links")


if __name__ == "__main__":
    main()
