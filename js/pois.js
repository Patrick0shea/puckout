/*
 * Places a road can pass on the way to Croke Park.
 *   ground   – county grounds
 *   legend   – clubs that produced famous players
 *   landmark – famous Irish sights
 * `tag` is the short line on the road sign; `line` is the postcard shown when you pass.
 * Coordinates are WGS84 (lat, lon). Keep facts short and checkable.
 */
(function (root) {
  "use strict";
  const POIS = [
    // ---- County grounds ----
    { id: "fitzgerald", kind: "ground", name: "Fitzgerald Stadium", lat: 52.0565, lon: -9.5085, tag: "Killarney", line: "Kerry's home in Killarney, in the shadow of the Reeks." },
    { id: "austinstack-park", kind: "ground", name: "Austin Stack Park", lat: 52.2689, lon: -9.6997, tag: "Tralee", line: "Kerry's other county ground, in Tralee." },
    { id: "puc", kind: "ground", name: "Páirc Uí Chaoimh", lat: 51.9000, lon: -8.4210, tag: "Cork", line: "Cork's home, on the banks of the Lee." },
    { id: "semple", kind: "ground", name: "Semple Stadium", lat: 52.6795, lon: -7.8215, tag: "Thurles", line: "The home of hurling, in Thurles, Tipperary." },
    { id: "gaelic-grounds", kind: "ground", name: "Gaelic Grounds", lat: 52.6560, lon: -8.6430, tag: "Limerick", line: "Limerick's home on the Ennis Road." },
    { id: "cusack-ennis", kind: "ground", name: "Cusack Park", lat: 52.8445, lon: -8.9845, tag: "Ennis", line: "Clare's county ground, in Ennis." },
    { id: "walsh-park", kind: "ground", name: "Walsh Park", lat: 52.2545, lon: -7.1180, tag: "Waterford", line: "Waterford's county ground." },
    { id: "nowlan", kind: "ground", name: "Nowlan Park", lat: 52.6590, lon: -7.2420, tag: "Kilkenny", line: "Home of the Cats, in Kilkenny city." },
    { id: "wexford-park", kind: "ground", name: "Wexford Park", lat: 52.3335, lon: -6.4755, tag: "Wexford", line: "Wexford's county ground." },
    { id: "cullen-park", kind: "ground", name: "Dr Cullen Park", lat: 52.8400, lon: -6.9180, tag: "Carlow", line: "Carlow's county ground." },
    { id: "aughrim", kind: "ground", name: "Aughrim", lat: 52.8560, lon: -6.3290, tag: "Wicklow", line: "Wicklow's county ground, in the hills at Aughrim." },
    { id: "omoore", kind: "ground", name: "O'Moore Park", lat: 53.0365, lon: -7.2955, tag: "Portlaoise", line: "Laois's county ground, in Portlaoise." },
    { id: "oconnor", kind: "ground", name: "O'Connor Park", lat: 53.2740, lon: -7.4975, tag: "Tullamore", line: "Offaly's county ground, in Tullamore." },
    { id: "cusack-mullingar", kind: "ground", name: "Cusack Park", lat: 53.5310, lon: -7.3430, tag: "Mullingar", line: "Westmeath's county ground, in Mullingar." },
    { id: "pearse-longford", kind: "ground", name: "Pearse Park", lat: 53.7305, lon: -7.7900, tag: "Longford", line: "Longford's county ground." },
    { id: "tailteann", kind: "ground", name: "Páirc Tailteann", lat: 53.6495, lon: -6.6830, tag: "Navan", line: "Meath's county ground, in Navan." },
    { id: "conleths", kind: "ground", name: "St Conleth's Park", lat: 53.1795, lon: -6.7990, tag: "Newbridge", line: "Kildare's county ground, in Newbridge." },
    { id: "pearse-galway", kind: "ground", name: "Pearse Stadium", lat: 53.2595, lon: -9.0860, tag: "Salthill", line: "Galway's home, a stone's throw from Salthill prom." },
    { id: "machale", kind: "ground", name: "MacHale Park", lat: 53.8525, lon: -9.3050, tag: "Castlebar", line: "Mayo's county ground, in Castlebar." },
    { id: "hyde", kind: "ground", name: "Dr Hyde Park", lat: 53.6265, lon: -8.1850, tag: "Roscommon", line: "Roscommon's county ground." },
    { id: "markievicz", kind: "ground", name: "Markievicz Park", lat: 54.2650, lon: -8.4910, tag: "Sligo", line: "Sligo's county ground." },
    { id: "macdiarmada", kind: "ground", name: "Páirc Seán Mac Diarmada", lat: 53.9470, lon: -8.0950, tag: "Carrick-on-Shannon", line: "Leitrim's county ground, in Carrick-on-Shannon." },
    { id: "breffni", kind: "ground", name: "Breffni Park", lat: 53.9965, lon: -7.3525, tag: "Cavan", line: "Cavan's county ground." },
    { id: "clones", kind: "ground", name: "St Tiernach's Park", lat: 54.1795, lon: -7.2305, tag: "Clones", line: "Clones, the traditional home of the Ulster football final." },
    { id: "healy", kind: "ground", name: "Healy Park", lat: 54.5980, lon: -7.2900, tag: "Omagh", line: "Tyrone's county ground, in Omagh." },
    { id: "athletic-grounds", kind: "ground", name: "Athletic Grounds", lat: 54.3470, lon: -6.6660, tag: "Armagh", line: "Armagh's county ground." },
    { id: "celtic-park", kind: "ground", name: "Celtic Park", lat: 54.9885, lon: -7.3390, tag: "Derry", line: "Derry's county ground." },
    { id: "maccumhaill", kind: "ground", name: "MacCumhaill Park", lat: 54.8010, lon: -7.7860, tag: "Ballybofey", line: "Donegal's county ground, in Ballybofey." },
    { id: "brewster", kind: "ground", name: "Brewster Park", lat: 54.3495, lon: -7.6350, tag: "Enniskillen", line: "Fermanagh's county ground, in Enniskillen." },
    { id: "esler", kind: "ground", name: "Páirc Esler", lat: 54.1810, lon: -6.3320, tag: "Newry", line: "Down's county ground, in Newry." },
    { id: "casement", kind: "ground", name: "Casement Park", lat: 54.5745, lon: -5.9775, tag: "Belfast", line: "Antrim's home ground, in west Belfast." },

    // ---- Legends' clubs ----
    { id: "cloyne", kind: "legend", name: "Cloyne", lat: 51.8575, lon: -8.1175, tag: "Christy Ring's club", line: "Cloyne, where Christy Ring started out. He won eight All-Irelands with Cork." },
    { id: "ballyhale", kind: "legend", name: "Ballyhale Shamrocks", lat: 52.4621, lon: -7.2135, tag: "Henry Shefflin's club", line: "Ballyhale, home of Henry Shefflin and his record ten All-Ireland medals." },
    { id: "drcrokes", kind: "legend", name: "Dr Crokes", lat: 52.0676, lon: -9.5033, tag: "the Gooch's club", line: "Dr Crokes in Killarney, the club of Colm 'Gooch' Cooper." },
    { id: "fossa", kind: "legend", name: "Fossa", lat: 52.0703, lon: -9.5776, tag: "David Clifford's club", line: "Fossa, home club of David Clifford." },
    { id: "valentia", kind: "legend", name: "Valentia", lat: 51.9055, lon: -10.3378, tag: "Mick O'Connell's club", line: "Valentia Island, home of the great Kerry midfielder Mick O'Connell." },
    { id: "cahersiveen", kind: "legend", name: "Cahersiveen", lat: 51.9486, lon: -10.2222, tag: "Jack O'Shea's club", line: "Cahersiveen, home of Kerry's Jack O'Shea." },
    { id: "templenoe", kind: "legend", name: "Templenoe", lat: 51.8667, lon: -9.6833, tag: "Pat Spillane's club", line: "Templenoe, home club of Pat Spillane." },
    { id: "austin-stacks", kind: "legend", name: "Austin Stacks", lat: 52.2703, lon: -9.6962, tag: "Mikey Sheehy's club", line: "Austin Stacks in Tralee, club of Mikey Sheehy and Kieran Donaghy." },
    { id: "nemo", kind: "legend", name: "Nemo Rangers", lat: 51.8756, lon: -8.4512, tag: "Billy Morgan's club", line: "Nemo Rangers, Billy Morgan's club in Cork city." },
    { id: "portumna", kind: "legend", name: "Portumna", lat: 53.0892, lon: -8.2189, tag: "Joe Canning's club", line: "Portumna, home club of Joe Canning." },
    { id: "corofin", kind: "legend", name: "Corofin", lat: 53.4366, lon: -8.8590, tag: "three-in-a-row club champions", line: "Corofin, who won three All-Ireland club football titles in a row, 2018 to 2020." },
    { id: "errigal", kind: "legend", name: "Errigal Ciarán", lat: 54.5245, lon: -7.0690, tag: "Peter Canavan's club", line: "Errigal Ciarán, club of Peter Canavan, who captained Tyrone to their first All-Ireland in 2003." },
    { id: "moy", kind: "legend", name: "Moy Tír na nÓg", lat: 54.4432, lon: -6.6966, tag: "Seán Cavanagh's club", line: "The Moy, home club of Tyrone's Seán Cavanagh." },
    { id: "glenswilly", kind: "legend", name: "Glenswilly", lat: 54.9600, lon: -7.8400, tag: "Michael Murphy's club", line: "Glenswilly, club of Michael Murphy, who captained Donegal to the 2012 All-Ireland." },
    { id: "crossmaglen", kind: "legend", name: "Crossmaglen Rangers", lat: 54.0749, lon: -6.6091, tag: "club football royalty", line: "Crossmaglen Rangers, one of the most successful clubs in All-Ireland club football." },
    { id: "slaughtneil", kind: "legend", name: "Slaughtneil", lat: 54.8834, lon: -6.7003, tag: "three codes, one club", line: "Slaughtneil, Ulster club champions in football, hurling and camogie." },
    { id: "dunloy", kind: "legend", name: "Dunloy", lat: 55.0074, lon: -6.4118, tag: "Antrim hurling stronghold", line: "Dunloy Cúchullains, a stronghold of Antrim hurling." },
    { id: "westport", kind: "legend", name: "Westport", lat: 53.8000, lon: -9.5167, tag: "Lee Keegan's club", line: "Westport, home club of Mayo's Lee Keegan." },
    { id: "ballaghaderreen", kind: "legend", name: "Ballaghaderreen", lat: 53.9013, lon: -8.5751, tag: "Andy Moran's club", line: "Ballaghaderreen, home club of Mayo's Andy Moran." },
    { id: "patrickswell", kind: "legend", name: "Patrickswell", lat: 52.5972, lon: -8.7089, tag: "Cian Lynch's club", line: "Patrickswell, home club of Limerick's Cian Lynch." },
    { id: "ballyea", kind: "legend", name: "Ballyea", lat: 52.7882, lon: -9.0275, tag: "Tony Kelly's club", line: "Ballyea, home club of Clare's Tony Kelly." },
    { id: "feakle", kind: "legend", name: "Feakle", lat: 52.9264, lon: -8.6477, tag: "Ger Loughnane's club", line: "Feakle, home of Clare's Ger Loughnane." },
    { id: "birr", kind: "legend", name: "Birr", lat: 53.0914, lon: -7.9133, tag: "Brian Whelahan's club", line: "Birr, home club of Offaly hurler Brian Whelahan." },
    { id: "walsh-island", kind: "legend", name: "Walsh Island", lat: 53.2170, lon: -7.2250, tag: "Matt Connor's club", line: "Walsh Island, home of Offaly forward Matt Connor." },
    { id: "rathnure", kind: "legend", name: "Rathnure", lat: 52.4989, lon: -6.7631, tag: "the Rackards' club", line: "Rathnure, home of Wexford's Rackard brothers." },
    { id: "gowran", kind: "legend", name: "Gowran", lat: 52.6294, lon: -7.0733, tag: "DJ Carey's club", line: "Gowran, home of DJ Carey's club, Young Irelands." },
    { id: "skryne", kind: "legend", name: "Skryne", lat: 53.5830, lon: -6.5580, tag: "Colm O'Rourke's club", line: "Skryne, home club of Meath's Colm O'Rourke." },

    // ---- Landmarks ----
    { id: "hayes", kind: "landmark", name: "Hayes' Hotel", lat: 52.6805, lon: -7.8135, tag: "where the GAA began", line: "Hayes' Hotel, Thurles, where the GAA was founded on 1 November 1884." },
    { id: "moher", kind: "landmark", name: "Cliffs of Moher", lat: 52.9715, lon: -9.4309, tag: "Co. Clare", line: "The Cliffs of Moher, rising out of the Atlantic." },
    { id: "cashel", kind: "landmark", name: "Rock of Cashel", lat: 52.5200, lon: -7.8906, tag: "Co. Tipperary", line: "The Rock of Cashel, seat of the kings of Munster." },
    { id: "newgrange", kind: "landmark", name: "Newgrange", lat: 53.6947, lon: -6.4755, tag: "older than the pyramids", line: "Newgrange, a passage tomb older than the pyramids of Giza." },
    { id: "tara", kind: "landmark", name: "Hill of Tara", lat: 53.5795, lon: -6.6110, tag: "seat of the High Kings", line: "The Hill of Tara, seat of the High Kings of Ireland." },
    { id: "clonmacnoise", kind: "landmark", name: "Clonmacnoise", lat: 53.3260, lon: -7.9866, tag: "on the Shannon", line: "Clonmacnoise, the monastic city on the Shannon." },
    { id: "glendalough", kind: "landmark", name: "Glendalough", lat: 53.0105, lon: -6.3270, tag: "Co. Wicklow", line: "Glendalough, St Kevin's valley of the two lakes." },
    { id: "kylemore", kind: "landmark", name: "Kylemore Abbey", lat: 53.5615, lon: -9.8890, tag: "Connemara", line: "Kylemore Abbey, on the lake shore in Connemara." },
    { id: "croagh-patrick", kind: "landmark", name: "Croagh Patrick", lat: 53.7595, lon: -9.6582, tag: "the Reek", line: "Croagh Patrick, the Reek, climbed by pilgrims every July." },
    { id: "causeway", kind: "landmark", name: "Giant's Causeway", lat: 55.2408, lon: -6.5116, tag: "Co. Antrim", line: "The Giant's Causeway, Fionn mac Cumhaill's stepping stones." },
    { id: "dunluce", kind: "landmark", name: "Dunluce Castle", lat: 55.2107, lon: -6.5796, tag: "Co. Antrim", line: "Dunluce Castle, perched on the cliffs of the Causeway coast." },
    { id: "carrick-a-rede", kind: "landmark", name: "Carrick-a-Rede", lat: 55.2394, lon: -6.3325, tag: "rope bridge", line: "Carrick-a-Rede rope bridge, swaying above the sea." },
    { id: "blarney", kind: "landmark", name: "Blarney Castle", lat: 51.9292, lon: -8.5706, tag: "Co. Cork", line: "Blarney Castle. Kiss the stone for the gift of the gab." },
    { id: "bunratty", kind: "landmark", name: "Bunratty Castle", lat: 52.6996, lon: -8.8119, tag: "Co. Clare", line: "Bunratty Castle, by the Shannon in Clare." },
    { id: "benbulbin", kind: "landmark", name: "Benbulbin", lat: 54.3645, lon: -8.4746, tag: "Yeats country", line: "Benbulbin, the table mountain of Yeats country." },
    { id: "kilkenny-castle", kind: "landmark", name: "Kilkenny Castle", lat: 52.6503, lon: -7.2491, tag: "the Marble City", line: "Kilkenny Castle, by the Nore in the Marble City." },
    { id: "muckross", kind: "landmark", name: "Muckross House", lat: 52.0181, lon: -9.5039, tag: "Killarney National Park", line: "Muckross House, in Killarney National Park." },
    { id: "carrauntoohil", kind: "landmark", name: "Carrauntoohil", lat: 51.9989, lon: -9.7429, tag: "Ireland's highest peak", line: "Carrauntoohil, Ireland's highest mountain, in the MacGillycuddy's Reeks." },
    { id: "slieve-league", kind: "landmark", name: "Slieve League", lat: 54.6508, lon: -8.6939, tag: "sea cliffs", line: "Slieve League, some of the highest sea cliffs in Europe." },
    { id: "errigal-mt", kind: "landmark", name: "Errigal", lat: 55.0342, lon: -8.1131, tag: "Co. Donegal", line: "Errigal, Donegal's quartzite peak." },
    { id: "donard", kind: "landmark", name: "Slieve Donard", lat: 54.1803, lon: -5.9208, tag: "the Mournes", line: "Slieve Donard, where the Mountains of Mourne sweep down to the sea." },
    { id: "trim", kind: "landmark", name: "Trim Castle", lat: 53.5547, lon: -6.7907, tag: "Co. Meath", line: "Trim Castle, the largest Norman castle in Ireland." },
    { id: "athlone", kind: "landmark", name: "Athlone Castle", lat: 53.4233, lon: -7.9406, tag: "the Shannon crossing", line: "Athlone Castle, guarding the crossing of the Shannon." },
    { id: "uisneach", kind: "landmark", name: "Hill of Uisneach", lat: 53.4888, lon: -7.5598, tag: "the centre of Ireland", line: "The Hill of Uisneach, the mythical centre of Ireland." },
    { id: "cobh", kind: "landmark", name: "Cobh", lat: 51.8505, lon: -8.2948, tag: "the Titanic's last stop", line: "Cobh, the Titanic's last port of call." },
    { id: "hook", kind: "landmark", name: "Hook Lighthouse", lat: 52.1239, lon: -6.9294, tag: "Co. Wexford", line: "Hook Lighthouse, one of the oldest working lighthouses in the world." },
    { id: "poulnabrone", kind: "landmark", name: "Poulnabrone", lat: 53.0487, lon: -9.1400, tag: "the Burren", line: "Poulnabrone dolmen, standing on the limestone of the Burren." },
    { id: "gap-dunloe", kind: "landmark", name: "Gap of Dunloe", lat: 52.0230, lon: -9.6400, tag: "Co. Kerry", line: "The Gap of Dunloe, the mountain pass outside Killarney." },
    { id: "ashford", kind: "landmark", name: "Ashford Castle", lat: 53.5340, lon: -9.2830, tag: "Cong", line: "Ashford Castle, on the shore of Lough Corrib at Cong." },
    { id: "mizen", kind: "landmark", name: "Mizen Head", lat: 51.4500, lon: -9.8180, tag: "the far south-west", line: "Mizen Head, at the south-western tip of Ireland." }
  ];
  const CROKER = { id: "croker", kind: "croker", name: "Croke Park", lat: 53.3607, lon: -6.2512, tag: "All-Ireland final day", line: "Croke Park. All-Ireland final day." };

  // Cartoon mountains drawn on the map (not stops).
  const MOUNTAINS = [
    [51.999, -9.743, 3], [52.235, -10.254, 2], [52.366, -8.174, 2], [52.967, -6.465, 2], [54.180, -5.921, 2],
    [55.034, -8.113, 2], [53.760, -9.658, 2], [54.365, -8.475, 1], [54.013, -9.368, 2], [53.637, -9.830, 2],
    [53.505, -9.835, 2], [52.245, -7.550, 1], [52.228, -7.920, 1], [53.090, -7.580, 1], [54.819, -7.039, 1],
    [54.122, -6.433, 1], [52.330, -8.530, 1], [51.790, -9.600, 1], [52.110, -9.420, 1], [54.640, -8.690, 1]
  ];

  const api = { POIS, CROKER, MOUNTAINS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PuckoutPois = api;
})(typeof window !== "undefined" ? window : globalThis);
