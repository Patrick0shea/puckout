/*
 * Puckout game data: everything a player might type, the question pool,
 * rarity tiers and the stops on the road from the club pitch to Croke Park.
 *
 * Each question lists its valid answers with a starting-estimate weight
 * (roughly how many people out of 100 would give that answer). Shares are
 * worked out from these weights; see README for plugging in real counts.
 */
(function (root) {
  "use strict";

  // id, label, aliases
  const ENTITIES = [
    ["antrim", "Antrim", ["saffrons"]],
    ["armagh", "Armagh", ["orchard county"]],
    ["carlow", "Carlow"],
    ["cavan", "Cavan", ["breffni"]],
    ["clare", "Clare", ["banner", "banner county"]],
    ["cork", "Cork", ["rebels", "rebel county"]],
    ["derry", "Derry", ["londonderry", "oak leaf county"]],
    ["donegal", "Donegal", ["tir chonaill", "tyrconnell"]],
    ["down", "Down", ["mourne county"]],
    ["dublin", "Dublin", ["dubs", "ath cliath"]],
    ["fermanagh", "Fermanagh", ["ernesiders"]],
    ["galway", "Galway", ["tribesmen"]],
    ["kerry", "Kerry", ["kingdom"]],
    ["kildare", "Kildare", ["lilywhites"]],
    ["kilkenny", "Kilkenny", ["cats"]],
    ["laois", "Laois", ["leix", "laoighis", "queens county"]],
    ["leitrim", "Leitrim"],
    ["limerick", "Limerick", ["treaty county"]],
    ["longford", "Longford"],
    ["louth", "Louth", ["wee county"]],
    ["mayo", "Mayo"],
    ["meath", "Meath", ["royal county"]],
    ["monaghan", "Monaghan", ["farney"]],
    ["offaly", "Offaly", ["faithful county"]],
    ["roscommon", "Roscommon", ["rossies"]],
    ["sligo", "Sligo"],
    ["tipperary", "Tipperary", ["tipp", "premier county"]],
    ["tyrone", "Tyrone", ["red hands", "red hand county"]],
    ["waterford", "Waterford", ["deise"]],
    ["westmeath", "Westmeath"],
    ["wexford", "Wexford", ["model county", "yellowbellies"]],
    ["wicklow", "Wicklow", ["garden county"]],
    ["london", "London"],
    ["newyork", "New York", ["ny", "nyc"]],
    ["gk", "Goalkeeper", ["goalie", "keeper", "goaly", "netminder"]],
    ["fb", "Full-back", ["full back"]],
    ["cnb", "Corner-back", ["corner back"]],
    ["chb", "Centre-back", ["centre half-back", "center half-back", "center back", "centre half back", "center half back"]],
    ["wb", "Wing-back", ["wing half-back", "half-back", "half back", "wing half back"]],
    ["mid", "Midfield", ["midfielder", "centrefield", "centerfield", "midfielders"]],
    ["wf", "Wing-forward", ["wing half-forward", "half-forward", "half forward", "wing half forward"]],
    ["chf", "Centre-forward", ["centre half-forward", "center half-forward", "center forward", "centre half forward"]],
    ["cnf", "Corner-forward", ["corner forward"]],
    ["ff", "Full-forward", ["full forward"]],
    ["football", "Gaelic football", ["football", "gaa football", "gaelic"]],
    ["hurling", "Hurling", ["hurl"]],
    ["camogie", "Camogie"],
    ["ladies", "Ladies football", ["ladies gaelic football", "lgfa", "womens football", "womens gaelic football"]],
    ["handball", "Handball", ["gaelic handball", "gaa handball"]],
    ["rounders", "Rounders", ["gaa rounders"]]
  ].map(([id, label, aliases]) => ({ id, label, aliases: [label].concat(aliases || []) }));

  const QUESTIONS = [
    { id: "sfc-ever", cat: "Football",
      text: "Name a county that has won the All-Ireland Senior Football Championship.",
      fact: "Kerry and Dublin account for roughly half of all the titles ever played for.",
      a: { kerry: 28, dublin: 24, tyrone: 9, galway: 6, meath: 6, cork: 5, armagh: 5, donegal: 4, mayo: 3, down: 3, offaly: 1.5, cavan: 1, kildare: 1, derry: 1, roscommon: 0.8, louth: 0.5, wexford: 0.3, tipperary: 0.3, limerick: 0.2 } },
    { id: "shc-ever", cat: "Hurling",
      text: "Name a county that has won the All-Ireland Senior Hurling Championship.",
      fact: "London are the only team from outside Ireland to win it, in 1901.",
      a: { kilkenny: 30, cork: 18, tipperary: 15, limerick: 15, clare: 7, galway: 6, wexford: 4, waterford: 2, offaly: 2, dublin: 0.6, laois: 0.3, london: 0.2, kerry: 0.2 } },
    { id: "dual", cat: "Football & hurling",
      text: "Name a county that has won both the Sam Maguire and the Liam MacCarthy.",
      hint: "Senior All-Ireland titles in football and in hurling.",
      fact: "Eight counties have won senior All-Irelands in both codes.",
      a: { cork: 35, dublin: 15, tipperary: 15, galway: 15, limerick: 6, offaly: 6, kerry: 4, wexford: 4 } },
    { id: "sfc-2000", cat: "Football",
      text: "Name a county that has won the All-Ireland football title since 2000.",
      fact: "Seven counties have lifted Sam Maguire since 2000.",
      a: { kerry: 30, dublin: 30, tyrone: 12, armagh: 10, donegal: 8, cork: 5, galway: 5 } },
    { id: "shc-2000", cat: "Hurling",
      text: "Name a county that has won the All-Ireland hurling title since 2000.",
      fact: "Six counties have lifted Liam MacCarthy since 2000.",
      a: { kilkenny: 35, limerick: 25, tipperary: 15, clare: 10, cork: 8, galway: 7 } },
    { id: "ulster", cat: "Geography",
      text: "Name a county in the province of Ulster.",
      fact: "Cavan, Donegal and Monaghan are Ulster counties in the Republic.",
      a: { tyrone: 15, armagh: 15, donegal: 15, derry: 13, down: 12, antrim: 10, monaghan: 8, cavan: 7, fermanagh: 5 } },
    { id: "ulster-sfc", cat: "Football",
      text: "Name a county that has won the Ulster Senior Football Championship.",
      fact: "Fermanagh are the only Ulster county yet to win it.",
      a: { tyrone: 16, armagh: 15, donegal: 15, derry: 12, cavan: 12, down: 10, monaghan: 10, antrim: 4 } },
    { id: "munster", cat: "Geography",
      text: "Name a county in the province of Munster.",
      fact: "Munster has six counties.",
      a: { kerry: 22, cork: 22, tipperary: 15, limerick: 15, clare: 14, waterford: 12 } },
    { id: "connacht-sfc", cat: "Football",
      text: "Name a team that plays in the Connacht Senior Football Championship.",
      hint: "Think beyond the province's own counties.",
      fact: "London and New York both enter the Connacht football championship.",
      a: { galway: 25, mayo: 25, roscommon: 18, sligo: 15, leitrim: 14, newyork: 2, london: 1 } },
    { id: "leinster", cat: "Geography",
      text: "Name a county in the province of Leinster.",
      fact: "Leinster has twelve counties, the most of any province.",
      a: { dublin: 20, kildare: 12, meath: 12, kilkenny: 10, wexford: 8, laois: 7, offaly: 7, westmeath: 6, wicklow: 5, carlow: 5, louth: 5, longford: 3 } },
    { id: "dublin-borders", cat: "Geography",
      text: "Name a county that borders Dublin.",
      fact: "Only three counties share a land border with Dublin.",
      a: { kildare: 40, meath: 35, wicklow: 25 } },
    { id: "positions", cat: "The game",
      text: "Name a position on a Gaelic football team.",
      fact: "Fifteen players a side: a goalkeeper, six backs, two midfielders and six forwards.",
      a: { gk: 20, mid: 15, fb: 12, cnb: 12, cnf: 8, chb: 8, ff: 7, wb: 6, wf: 6, chf: 6 } },
    { id: "codes", cat: "The game",
      text: "Name a Gaelic game.",
      hint: "A sport, not a team.",
      fact: "Camogie and ladies football are run by their own associations, alongside the GAA.",
      a: { football: 30, hurling: 30, camogie: 15, ladies: 10, handball: 8, rounders: 4 } },
    { id: "never", cat: "History",
      text: "Name a county that has never won a senior All-Ireland in football or hurling.",
      fact: "Nine of the 32 counties are still waiting on a senior All-Ireland in either code.",
      a: { wicklow: 15, leitrim: 15, fermanagh: 15, carlow: 12, longford: 10, sligo: 10, westmeath: 8, monaghan: 8, antrim: 7 } }
  ];

  // Rarer answers travel further. `pts` is how far along the road (out of
  // CONFIG.maxPoints) the answer carries you. `max` is the upper bound on share.
  const TIERS = [
    { id: "allstar", name: "All-Star", pts: 100, max: 0.03, mark: "⭐" },
    { id: "county", name: "Inter-county", pts: 70, max: 0.07, mark: "🟩" },
    { id: "senior", name: "Senior", pts: 45, max: 0.15, mark: "🟨" },
    { id: "inter", name: "Intermediate", pts: 25, max: 0.30, mark: "🟧" },
    { id: "junior", name: "Junior", pts: 10, max: Infinity, mark: "⬜" }
  ];
  const WIDE = { id: "wide", name: "Wide", pts: 0, mark: "❌" };

  const CONFIG = {
    perDay: 7,
    maxPoints: 700, // seven All-Star answers: all the way to Croke Park
    secondsPerQuestion: 30,
    priorWeight: 60, // starting estimates count as this many answers per question
    launchDate: "2026-11-18" // day #1
  };

  const api = { ENTITIES, QUESTIONS, TIERS, WIDE, CONFIG };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PuckoutData = api;
})(typeof window !== "undefined" ? window : globalThis);
