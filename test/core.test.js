// Tests für den Spiel-Kern: node test/core.test.js
const assert = require("assert");
const C = require("../src/core/core.js");

const MIN = C.MIN;
let t0 = Date.UTC(2026, 9, 10, 18, 0);
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

const NAMES = ["Max", "Anna", "Tom", "Lisa", "Ben", "Julia", "Paul", "Sarah"];
function tournament(names = NAMES) {
  return { init: C.tournamentInit({ id: "t1", ts: t0, names, template: C.DEFAULT_TEMPLATE }), log: [] };
}
// Aktion anwenden wie der Hauptprozess: erst prüfen, dann ins Log
function act(game, type, ts, payload = {}) {
  const s = C.replay(game);
  const e = { type, ts, ...payload };
  const msg = C.apply(s, e);
  game.log.push(e);
  return msg;
}

test("Rechenbeispiel aus dem Konzept: 10 Spieler, 4 Rebuys, 8 Add-Ons", () => {
  const g = tournament([...NAMES, "Nina", "Olaf"]);
  act(g, "clock.toggle", t0);
  ["Max", "Anna", "Tom", "Lisa"].forEach((n, i) => act(g, "player.rebuy", t0 + (i + 1) * MIN, { name: n }));
  const brk = t0 + 120 * MIN + 1000;
  const s = C.replay(g);
  assert.strictEqual(C.tView(s, brk).clock.idx, 4, "nach 120 Min ist Pause");
  [...NAMES].forEach((n, i) => act(g, "player.addon", brk + i * 1000, { name: n }));
  const v = C.tView(C.replay(g), brk + 10000);
  assert.strictEqual(C.prizePool(v), 250);
  assert.deepStrictEqual(C.payouts(v), [150, 75, 25]);
  assert.strictEqual(C.mysteryPool(v), 70);
  assert.strictEqual(C.chipsInPlay(v), 40000);
});

test("Uhr läuft über Zeitstempel und wechselt Levels selbst", () => {
  const g = tournament();
  act(g, "clock.toggle", t0);
  let v = C.tView(C.replay(g), t0 + 29 * MIN);
  assert.strictEqual(v.clock.idx, 0);
  assert.strictEqual(v.clock.remaining, MIN);
  v = C.tView(C.replay(g), t0 + 31 * MIN);
  assert.strictEqual(v.clock.idx, 1);
  assert.strictEqual(v.clock.remaining, 29 * MIN);
  act(g, "clock.toggle", t0 + 31 * MIN); // Pause
  v = C.tView(C.replay(g), t0 + 500 * MIN);
  assert.strictEqual(v.clock.idx, 1, "pausierte Uhr bleibt stehen");
  assert.strictEqual(v.clock.remaining, 29 * MIN);
});

test("Uhr hält am Ende des letzten Levels an", () => {
  const g = tournament();
  act(g, "clock.toggle", t0);
  const v = C.tView(C.replay(g), t0 + 2000 * MIN);
  assert.strictEqual(v.clock.idx, v.structure.length - 1);
  assert.strictEqual(v.clock.remaining, 0);
  assert.strictEqual(v.clock.running, false);
});

test("Plus/Minus-Minute und Level vor/zurück", () => {
  const g = tournament();
  act(g, "clock.minus", t0 + 1000);
  assert.strictEqual(C.replay(g).clock.remaining, 29 * MIN);
  act(g, "clock.plus", t0 + 2000);
  act(g, "clock.plus", t0 + 3000);
  assert.strictEqual(C.replay(g).clock.remaining, 30 * MIN, "nicht über Leveldauer");
  act(g, "clock.next", t0 + 4000);
  assert.strictEqual(C.replay(g).clock.idx, 1);
  act(g, "clock.prev", t0 + 5000);
  assert.strictEqual(C.replay(g).clock.idx, 0);
});

test("Rebuy nur bis Level 4, Add-On nur in der Pause", () => {
  const g = tournament();
  assert.throws(() => act(g, "player.addon", t0 + 1000, { name: "Max" }), /nur in der Pause/);
  act(g, "player.rebuy", t0 + 1000, { name: "Max" });
  for (let i = 0; i < 4; i++) act(g, "clock.next", t0 + 2000 + i);
  assert.strictEqual(C.cur(C.replay(g)).brk, true);
  assert.throws(() => act(g, "player.rebuy", t0 + 3000, { name: "Max" }), /Rebuy nur bis Level 4/);
  act(g, "player.addon", t0 + 3000, { name: "Max" });
  assert.throws(() => act(g, "player.addon", t0 + 3001, { name: "Max" }), /schon ein Add-On/);
});

test("Nachzügler bis Level 4, maximal 10 Spieler", () => {
  const g = tournament();
  act(g, "player.late", t0 + 1000, { name: "Nina" });
  act(g, "player.late", t0 + 1001, { name: "Olaf" });
  assert.throws(() => act(g, "player.late", t0 + 1002, { name: "Pia" }), /Tisch voll/);
  const g2 = tournament();
  for (let i = 0; i < 4; i++) act(g2, "clock.next", t0 + i);
  assert.throws(() => act(g2, "player.late", t0 + 10, { name: "Nina" }), /Nachmelden nur bis Level 4/);
  assert.throws(() => act(tournament(), "player.late", t0, { name: "Max" }), /spielt schon mit/);
});

test("Mystery Bounty: Umschläge ab Level 5 = Spieler minus 1", () => {
  const g = tournament();
  act(g, "player.out", t0 + 1000, { name: "Paul", by: "Max" }); // vor der Pause: kein Umschlag
  assert.strictEqual(C.replay(g).envDrawn, 0);
  act(g, "clock.toggle", t0 + 2000);
  // Ablauf bis Level 5: 4 x 30 + 10 Min
  const lvl5 = t0 + 2000 + 130 * MIN + 1000;
  const v = C.tView(C.replay(g), lvl5);
  assert.strictEqual(v.clock.idx, 5);
  assert.strictEqual(v.envTotal, 6, "7 Spieler übrig, 6 Umschläge");
  const msg = act(g, "player.out", lvl5, { name: "Sarah", by: "Anna" });
  assert.match(msg, /Anna zieht einen Umschlag/);
  const s = C.replay(g);
  assert.strictEqual(s.envDrawn, 1);
  assert.strictEqual(s.players.find(p => p.name === "Anna").envs, 1);
});

test("Sieger steht fest und Uhr stoppt", () => {
  const g = tournament(NAMES.slice(0, 3));
  act(g, "clock.toggle", t0);
  act(g, "player.out", t0 + MIN, { name: "Tom", by: "Max" });
  const msg = act(g, "player.out", t0 + 2 * MIN, { name: "Anna", by: "Max" });
  assert.match(msg, /Max gewinnt/);
  const s = C.replay(g);
  assert.strictEqual(s.winner, "Max");
  assert.strictEqual(s.clock.running, false);
  assert.deepStrictEqual(s.players.map(p => p.place), [1, 2, 3]);
  assert.throws(() => act(g, "player.rebuy", t0 + 3 * MIN, { name: "Max" }), /entschieden/);
});

test("Rückgängig entfernt die letzte Spieler-Aktion, Uhr-Aktionen bleiben", () => {
  const g = tournament();
  act(g, "clock.toggle", t0);
  act(g, "player.rebuy", t0 + MIN, { name: "Max" });
  act(g, "clock.plus", t0 + 2 * MIN);
  const i = C.lastUndoable(g.log);
  assert.strictEqual(C.describe(g.log[i]), "Rebuy Max");
  g.log.splice(i, 1);
  const s = C.replay(g);
  assert.strictEqual(C.entries(s), 8);
  assert.strictEqual(s.clock.running, true);
  assert.strictEqual(C.lastUndoable(g.log), -1);
});

test("Einstellungen: Leveldauer am laufenden Level ändern", () => {
  const g = tournament();
  act(g, "clock.toggle", t0);
  const s = C.replay(g);
  const structure = C.clone(s.structure);
  structure[0].min = 20;
  act(g, "settings.apply", t0 + 5 * MIN, { structure, cfg: s.cfg });
  const v = C.tView(C.replay(g), t0 + 5 * MIN);
  assert.strictEqual(v.clock.remaining, 15 * MIN);
  const bad = C.clone(s.cfg); bad.payout = [50, 30, 10];
  assert.throws(() => act(g, "settings.apply", t0 + 6 * MIN, { structure, cfg: bad }), /100 %/);
});

test("Cash Game: Buy-in, Nachkauf, Chip-Zähler, Kasse", () => {
  const g = { init: C.cashInit({ id: "c1", ts: t0 }), log: [] };
  act(g, "cash.join", t0, { name: "Max" });
  act(g, "cash.join", t0 + 1, { name: "Anna" });
  assert.throws(() => act(g, "cash.join", t0 + 2, { name: "Max" }), /sitzt schon/);
  act(g, "cash.rebuy", t0 + 3, { name: "Max" });
  const msg = act(g, "cash.cashout", t0 + 4, { name: "Anna", counts: { 5: 3, 25: 2, 1000: 2, 500: 1 } });
  assert.strictEqual(msg, "Anna bekommt 25 €, 0,65 € bleiben am Tisch");
  const s = C.replay(g);
  assert.strictEqual(C.cashIn(s), 3000);
  assert.strictEqual(C.cashOut(s), 2500);
  assert.strictEqual(C.seated(s).length, 1);
  act(g, "cash.join", t0 + 5, { name: "Anna" }); // Wiedereinstieg
  assert.strictEqual(C.replay(g).players.find(p => p.name === "Anna").inCents, 2000);
});

test("Cash Game: Auszahlung auf 5 € abgerundet, Letzter am Tisch bekommt den Rest", () => {
  const g = { init: C.cashInit({ id: "c1", ts: t0 }), log: [] };
  ["Max", "Anna", "Tom"].forEach((n, i) => act(g, "cash.join", t0 + i, { name: n }));
  assert.strictEqual(act(g, "cash.cashout", t0 + 5, { name: "Max", counts: { 1000: 1, 100: 4 } }), "Max bekommt 10 €, 4 € bleiben am Tisch");
  assert.strictEqual(act(g, "cash.cashout", t0 + 6, { name: "Anna", counts: { 500: 3 } }), "Anna bekommt 15 €");
  assert.strictEqual(act(g, "cash.cashout", t0 + 7, { name: "Tom", counts: { 100: 2, 5: 1 } }), "Tom bekommt 2,05 €");
  const s = C.replay(g);
  assert.strictEqual(C.cashOut(s), 2705);
  // alter Abend ohne payoutStep bleibt ungerundet
  const old = { init: C.cashInit({ id: "c2", ts: t0 }), log: [] };
  delete old.init.cfg.payoutStep;
  ["Max", "Anna"].forEach((n, i) => act(old, "cash.join", t0 + i, { name: n }));
  assert.strictEqual(act(old, "cash.cashout", t0 + 5, { name: "Max", counts: { 1000: 1, 100: 4 } }), "Max bekommt 14 €");
});

test("Cash Game: Spielzeit starten und anhalten", () => {
  const g = { init: C.cashInit({ id: "c1", ts: t0 }), log: [] };
  assert.strictEqual(act(g, "cash.clock", t0), "Spielzeit gestartet");
  assert.strictEqual(act(g, "cash.clock", t0 + 10 * MIN), "Spielzeit angehalten");
  assert.strictEqual(act(g, "cash.clock", t0 + 20 * MIN), "Spielzeit läuft weiter");
  assert.strictEqual(C.elapsedMs(C.replay(g), t0 + 25 * MIN), 15 * MIN);
});

test("Abgeschlossenes Spiel nimmt keine Aktionen mehr an", () => {
  const g = tournament();
  act(g, "game.close", t0 + MIN);
  assert.throws(() => act(g, "clock.toggle", t0 + 2 * MIN), /abgeschlossen/);
});

test("Alte Turniere: eingetippter Umschlag-Betrag wird beim Rauswerfer erfasst", () => {
  const g = tournament();
  delete g.init.envAuto;
  act(g, "clock.toggle", t0);
  const lvl5 = t0 + 130 * MIN + 1000;
  assert.ok(C.envelopeDue(C.tView(C.replay(g), lvl5)));
  const msg = act(g, "player.out", lvl5, { name: "Sarah", by: "Anna", envAmount: 20 });
  assert.match(msg, /Anna zieht einen Umschlag: 20 €/);
  act(g, "player.out", lvl5 + 1000, { name: "Paul", by: "Anna", envAmount: 5 });
  const anna = C.replay(g).players.find(p => p.name === "Anna");
  assert.strictEqual(anna.envs, 2);
  assert.strictEqual(anna.envSum, 25);
  // vor Level 5 kein Umschlag, Betrag wird ignoriert
  const h = tournament();
  act(h, "player.out", t0 + 1000, { name: "Paul", by: "Max", envAmount: 50 });
  assert.strictEqual(C.replay(h).players.find(p => p.name === "Max").envSum, 0);
});

test("Digitale Umschläge: Pool beim Pausenende verteilt, Spieler wählt einen", () => {
  const g = tournament();
  act(g, "clock.toggle", t0);
  act(g, "player.rebuy", t0 + MIN, { name: "Max" });
  const lvl5 = t0 + 130 * MIN + 1000;
  const v = C.tView(C.replay(g), lvl5);
  assert.strictEqual(v.envTotal, 7);
  assert.strictEqual(v.envAmounts.length, 7);
  assert.strictEqual(v.envAmounts.reduce((a, b) => a + b, 0), C.mysteryPool(v));
  assert.ok(v.envAmounts.every(x => x >= 5 && x % 5 === 0));
  const msg = act(g, "player.out", lvl5, { name: "Sarah", by: "Anna", envIndex: 3 });
  assert.match(msg, new RegExp("Anna zieht einen Umschlag: " + v.envAmounts[3] + " €"));
  assert.throws(() => act(g, "player.out", lvl5 + 1000, { name: "Paul", by: "Max", envIndex: 3 }), /schon offen/);
  // ohne Wahl (Handy) der erste geschlossene, Beträge bleiben beim Replay gleich
  act(g, "player.out", lvl5 + 2000, { name: "Paul", by: "Max" });
  const s = C.replay(g);
  assert.deepStrictEqual(s.envAmounts, v.envAmounts);
  assert.deepStrictEqual(s.envOpened.map(o => o.i), [3, 0]);
  assert.strictEqual(s.players.find(p => p.name === "Max").envSum, v.envAmounts[0]);
  assert.strictEqual(s.envDrawn, 2);
});

test("Umschläge: Summe stimmt, mindestens 5 €, 1 bis 2 Jackpots", () => {
  for (let n = 1; n <= 9; n++) for (let pool = 5 * (n + 1); pool <= 200; pool += 5) for (const seed of ["a", "b", "c"]) {
    const r = C.splitEnvelopes(pool, n, seed);
    assert.strictEqual(r.reduce((a, b) => a + b, 0), pool);
    assert.ok(r.every(x => x >= 5 && x % 5 === 0), pool + "/" + n + ": " + r);
  }
});

test("Cash Game: 20-€-Einkauf ab Spieler x 20 € Eingezahltem", () => {
  const g = { init: C.cashInit({ id: "c", ts: t0, cfg: C.DEFAULT_CASH }), log: [] };
  const names = ["Anna", "Ben", "Clara"];
  names.forEach((n, i) => act(g, "cash.join", t0 + i, { name: n }));
  assert.deepStrictEqual(C.buyOptions(C.replay(g)), [1000], "30 € von 60 €: nur 10 €");
  assert.throws(() => act(g, "cash.rebuy", t0 + 10, { name: "Anna", amount: 2000 }), /erst ab 60 €/);
  act(g, "cash.rebuy", t0 + 11, { name: "Anna" });
  act(g, "cash.rebuy", t0 + 12, { name: "Ben" });
  const msg = act(g, "cash.rebuy", t0 + 13, { name: "Clara" });
  assert.match(msg, /Ab jetzt auch 20 € möglich/);
  let s = C.replay(g);
  assert.ok(s.bigUnlocked);
  assert.deepStrictEqual(C.buyOptions(s), [1000, 2000]);
  // Neuer Spieler hebt die Schwelle auf 80 €, die 20-€-Stufe bleibt trotzdem frei
  act(g, "cash.join", t0 + 20, { name: "Jana", amount: 2000 });
  act(g, "cash.rebuy", t0 + 21, { name: "Anna", amount: 2000 });
  act(g, "cash.rebuy", t0 + 22, { name: "Ben", amount: 1000 });
  s = C.replay(g);
  assert.strictEqual(s.players.find(p => p.name === "Jana").inCents, 2000);
  assert.strictEqual(s.players.find(p => p.name === "Anna").inCents, 4000);
  assert.strictEqual(C.cashIn(s), 11000);
  assert.throws(() => act(g, "cash.rebuy", t0 + 23, { name: "Anna", amount: 1500 }), /Ungültiger Betrag/);
  // Rückgängig vor die Schwelle: 20-€-Einkäufe danach werden ungültig und fallen beim Nachrechnen weg
  const h = { init: g.init, log: g.log.slice(0, 5) };
  assert.ok(!C.replay(h).bigUnlocked);
});

console.log("\n" + passed + " Tests bestanden");
