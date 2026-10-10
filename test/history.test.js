// Tests für Historie, Ranglisten und WhatsApp-Text: node test/history.test.js
const assert = require("assert");
const C = require("../src/core/core.js");
const H = require("../src/core/history.js");

const MIN = C.MIN;
const t0 = new Date(2026, 9, 10, 20, 5).getTime(); // Sa 10.10.2026 20:05
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}
function act(game, type, ts, payload = {}) {
  const s = C.replay(game);
  const e = { type, ts, ...payload };
  C.apply(s, e);
  game.log.push(e);
}

// Turnier: 8 Spieler, Max und Anna mit Rebuy, alle mit Add-On außer Paul und Sarah, Umschläge ab Level 5
function playTournament(names, start = t0) {
  const g = { init: C.tournamentInit({ id: "t", ts: start, names, template: C.DEFAULT_TEMPLATE }), log: [] };
  delete g.init.envAuto; // feste Umschlag-Beträge wie bei alten Turnieren
  act(g, "clock.toggle", start);
  act(g, "player.rebuy", start + MIN, { name: "Max" });
  act(g, "player.rebuy", start + 2 * MIN, { name: "Anna" });
  const brk = start + 120 * MIN + 1000;
  names.filter(n => n !== "Paul" && n !== "Sarah").forEach((n, i) => act(g, "player.addon", brk + i, { name: n }));
  const l5 = start + 130 * MIN + 1000;
  act(g, "player.out", l5, { name: "Sarah", by: "Anna", envAmount: 20 });
  act(g, "player.out", l5 + 1000, { name: "Paul", by: "Anna", envAmount: 15 });
  act(g, "player.out", l5 + 2000, { name: "Julia", by: "Ben", envAmount: 10 });
  act(g, "player.out", l5 + 3000, { name: "Ben", by: "Max", envAmount: 5 });
  act(g, "player.out", l5 + 4000, { name: "Lisa", by: "Tom" });
  act(g, "player.out", l5 + 5000, { name: "Tom", by: "Max" });
  names.filter(n => !NAMES.includes(n)).forEach((n, i) => act(g, "player.out", l5 + 6000 + i, { name: n, by: "Max" }));
  act(g, "player.out", start + 266 * MIN, { name: "Anna", by: "Max" });
  act(g, "game.close", start + 267 * MIN);
  return g;
}
const NAMES = ["Max", "Anna", "Tom", "Lisa", "Ben", "Julia", "Paul", "Sarah"];

test("Turnierabend: Einsatz, Auszahlung, Umschläge, Bilanz", () => {
  const n = H.night(playTournament(NAMES));
  assert.strictEqual(n.winner, "Max");
  assert.strictEqual(n.prizePool, 180); // 10 Einstiege x 15 + 6 Add-Ons x 5
  assert.deepStrictEqual(n.payouts, [115, 50, 15]); // auf 5 € gerundet, Rest an Platz 1
  const max = n.players.find(p => p.name === "Max"), anna = n.players.find(p => p.name === "Anna"), sarah = n.players.find(p => p.name === "Sarah");
  assert.strictEqual(max.stake, 45);
  assert.strictEqual(max.payout, 115);
  assert.strictEqual(max.result, 115 + 5 - 45);
  assert.strictEqual(anna.place, 2);
  assert.strictEqual(anna.envSum, 35);
  assert.strictEqual(anna.result, 50 + 35 - 45);
  assert.strictEqual(sarah.result, -20);
  assert.strictEqual(n.duration, 266 * MIN);
});

test("WhatsApp-Text Turnier", () => {
  const text = H.whatsapp(H.night(playTournament(NAMES)));
  assert.match(text, /^♠️ \*Poker & Friends\* · Turnier Sa 10\.10\.2026/);
  assert.match(text, /🏆 \*Max\* gewinnt!/);
  assert.match(text, /🥇 Max 115 €\n🥈 Anna 50 €\n🥉 Tom 15 €/);
  assert.match(text, /💌 Umschläge \(50 €\): Anna 2× \(35 €\), Ben 10 €, Max 3× \(5 €\), Tom 1×/);
  assert.match(text, /🔪 Meiste KOs: Max \(3\)/);
  assert.match(text, /8 Spieler · 2 Rebuys · 6 Add-Ons/);
  assert.match(text, /20:05 bis 00:31 Uhr \(4:26 h\)/);
});

test("Rangliste Turnier über zwei Abende, alle Spieler mitgeführt", () => {
  const a = H.night(playTournament(NAMES));
  const b = H.night(playTournament(NAMES.concat("Nina"), t0 + 7 * 24 * 60 * MIN));
  const { rows, stats } = H.tournamentRanking([a, b]);
  assert.strictEqual(rows.length, 9, "Nina mit nur einem Abend ist dabei");
  assert.strictEqual(rows[0].name, "Max");
  assert.strictEqual(rows[0].wins, 2);
  assert.strictEqual(rows.find(r => r.name === "Nina").nights, 1);
  assert.strictEqual(stats.count, 2);
  assert.strictEqual(stats.mostWins, "Max");
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].result >= rows[i].result, "nach Bilanz sortiert");
});

test("Turnier ohne Sieger zählt nicht in der Rangliste", () => {
  const g = { init: C.tournamentInit({ id: "x", ts: t0, names: NAMES, template: C.DEFAULT_TEMPLATE }), log: [] };
  act(g, "clock.toggle", t0);
  act(g, "game.close", t0 + 10 * MIN);
  const n = H.night(g);
  assert.strictEqual(n.winner, null);
  assert.strictEqual(H.tournamentRanking([n]).rows.length, 0);
  assert.match(H.whatsapp(n), /ohne Sieger/);
});

test("Cash Game: Bilanz, Rangliste, WhatsApp-Text", () => {
  const g = { init: C.cashInit({ id: "c", ts: t0, cfg: C.DEFAULT_CASH }), log: [] };
  act(g, "cash.join", t0, { name: "Anna" });
  act(g, "cash.join", t0 + 1, { name: "Tom" });
  act(g, "cash.clock", t0 + 2);
  act(g, "cash.rebuy", t0 + MIN, { name: "Tom" });
  act(g, "cash.cashout", t0 + 100 * MIN, { name: "Anna", counts: { 1000: 2, 500: 1, 10: 1 } });   // 25,10 € gezählt, 25 € ausgezahlt
  act(g, "cash.cashout", t0 + 192 * MIN + 2, { name: "Tom", counts: { 100: 4, 50: 1, 25: 1, 10: 1, 5: 3 } }); // 5 €, als Letzter ungerundet
  act(g, "game.close", t0 + 192 * MIN + 2);
  const n = H.night(g);
  assert.strictEqual(n.duration, 192 * MIN);
  assert.deepStrictEqual(n.players.map(p => [p.name, p.result]), [["Anna", 1500], ["Tom", -1500]]);
  const text = H.whatsapp(n);
  assert.match(text, /Cash Game Sa 10\.10\.2026/);
  assert.match(text, /Anna \+15 €\nTom -15 €/);
  assert.match(text, /2 Spieler · 30 € im Spiel · 3:12 h/);
  const r = H.cashRanking([n, n]);
  assert.strictEqual(r.rows[0].result, 3000);
  assert.strictEqual(r.rows[0].best, 1500);
  assert.strictEqual(r.stats.turnover, 6000);
});

test("Cash Game ohne Spielzeit: Dauer vom ersten Hinsetzen bis zum Abschluss", () => {
  const g = { init: C.cashInit({ id: "c", ts: t0 - 30 * MIN }), log: [] };
  act(g, "cash.join", t0, { name: "Anna" });
  act(g, "cash.join", t0 + MIN, { name: "Tom" });
  act(g, "game.close", t0 + 240 * MIN);
  assert.strictEqual(H.night(g).duration, 240 * MIN);
  assert.match(H.summary(H.night(g)), /Dauer 4:00 h/);
});

console.log("\n" + passed + " Tests bestanden");
