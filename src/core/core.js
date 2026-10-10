// Spiel-Kern für Turnier und Cash Game.
// Ein Spiel = Startwerte (init) + Aktions-Log. Der Zustand wird immer aus dem Log berechnet,
// daraus folgen Autosave, Rückgängig und später die Handy-Steuerung.
// Läuft im Hauptprozess (Node) und in der Oberfläche (Browser), daher ohne Abhängigkeiten.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PFCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIN = 60000;
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmtNum = n => Number(n).toLocaleString("de-DE");

  function fail(message) {
    const e = new Error(message);
    e.user = true;
    return e;
  }

  // ---------- Vorgaben ----------
  const DEFAULT_TEMPLATE = {
    name: "Rebuy Mystery Bounty",
    structure: [
      { sb: 5, bb: 10, ante: 10, min: 30 },
      { sb: 10, bb: 20, ante: 20, min: 30 },
      { sb: 20, bb: 40, ante: 40, min: 30 },
      { sb: 25, bb: 50, ante: 50, min: 30 },
      { brk: true, min: 10, note: "5er und 10er raus" },
      { sb: 25, bb: 50, ante: 50, min: 30 },
      { sb: 50, bb: 100, ante: 100, min: 30 },
      { sb: 100, bb: 200, ante: 200, min: 30 },
      { sb: 200, bb: 400, ante: 400, min: 15, note: "Color-Up: 25er und 50er raus" },
      { sb: 400, bb: 800, ante: 800, min: 15 },
      { sb: 800, bb: 1600, ante: 1600, min: 15 },
      { sb: 1500, bb: 3000, ante: 3000, min: 15 },
      { sb: 2000, bb: 4000, ante: 4000, min: 15 },
    ],
    cfg: {
      buyPrize: 15, buyMystery: 5, buyChips: 2000,
      addonPrice: 5, addonChips: 1500,
      payout: [60, 30, 10], rounding: 5,
      rebuyUntil: 4, lateUntil: 4,
      minPlayers: 6, maxPlayers: 10,
    },
  };

  // Cash Game: 1 Chip-Einheit = 1 Cent
  const DEFAULT_CASH = { sb: 5, bb: 10, buyIn: 1000, bigFactor: 2, maxSeats: 10, denoms: [5, 10, 25, 50, 100, 500, 1000], payoutStep: 500 };

  function renumber(list) {
    let n = 0;
    list.forEach(s => { if (s.brk) delete s.level; else s.level = ++n; });
    return list;
  }

  // ---------- Turnier: Rechenregeln ----------
  // Alle Funktionen nehmen einen Zustand oder eine Ansicht (tView) entgegen.
  const alive = s => s.players.filter(p => !p.out);
  const entries = s => s.players.length + s.players.reduce((a, p) => a + p.rebuys, 0);
  const addons = s => s.players.filter(p => p.addon).length;
  const prizePool = s => entries(s) * s.cfg.buyPrize + addons(s) * s.cfg.addonPrice;
  const mysteryPool = s => entries(s) * s.cfg.buyMystery;
  const chipsInPlay = s => entries(s) * s.cfg.buyChips + addons(s) * s.cfg.addonChips;
  const breakIdx = s => s.structure.findIndex(x => x.brk);
  const cur = s => s.structure[s.clock.idx];

  // Bounty startet nach der ersten Pause, ohne Pause nach dem letzten Rebuy-Level
  function bountyStartIdx(s) {
    const b = breakIdx(s);
    if (b >= 0) return b + 1;
    const i = s.structure.findIndex(x => !x.brk && x.level > s.cfg.rebuyUntil);
    return i < 0 ? s.structure.length : i;
  }
  function beforeBreakUntil(s, i, until) {
    const x = s.structure[i], b = breakIdx(s);
    return !!x && !x.brk && x.level <= until && (b < 0 || i < b);
  }
  const isRebuy = (s, i = s.clock.idx) => beforeBreakUntil(s, i, s.cfg.rebuyUntil);
  const isLate = (s, i = s.clock.idx) => beforeBreakUntil(s, i, s.cfg.lateUntil);
  const bountyActive = s => s.clock.idx >= bountyStartIdx(s);
  const envelopeDue = s => bountyActive(s) && s.envTotal !== null && s.envDrawn < s.envTotal;

  // ---------- Digitale Umschläge ----------
  // Beim Pausenende wird der Mystery-Pool einmal auf die Umschläge verteilt: volle 5 €, jeder mindestens 5 €,
  // die meisten 5 bis 10 €, ein oder zwei Jackpots bekommen den Rest. Zufall mit festem Startwert aus der
  // Turnier-ID, damit Replay und Rückgängig immer dieselben Beträge ergeben.
  const ENV_STEP = 5;
  function seededRandom(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return () => {
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function splitEnvelopes(pool, n, seed) {
    if (n <= 0) return [];
    const rnd = seededRandom(seed + "|" + pool + "|" + n);
    const units = Math.floor(pool / ENV_STEP), rest = pool - units * ENV_STEP;
    if (units < n) return Array.from({ length: n }, (_, i) => (i < units ? ENV_STEP : 0) + (i === 0 ? rest : 0));
    const amt = new Array(n).fill(1);
    let left = units - n;
    let jack = n >= 5 && rnd() < 0.5 ? 2 : 1;
    if (jack === 2 && left < 4) jack = 1;
    // Kleine Umschläge: zufällig +5 €, höchstens knapp die Hälfte des Rests, damit die Jackpots klar größer sind
    let budget = Math.max(0, Math.floor((left - 2 * jack) / 2));
    for (let i = jack; i < n && budget > 0; i++) if (rnd() < 0.5) { amt[i]++; budget--; left--; }
    if (jack === 2) {
      const a = Math.max(1, Math.min(left - 1, Math.round(left * (0.55 + rnd() * 0.15))));
      amt[0] += a; amt[1] += left - a;
    } else amt[0] += left;
    const out = amt.map(u => u * ENV_STEP);
    out[0] += rest;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  // Nur Turniere ab v1.5 (envAuto), alte Turniere behalten die Papier-Umschläge mit eingetipptem Betrag
  function envelopesFor(s, total) {
    return s.envAuto ? splitEnvelopes(mysteryPool(s), total, s.id) : null;
  }

  // Auszahlung 60/30/10 vom Preispool, gerundet, Rest an Platz 1
  function payouts(s) {
    const pool = prizePool(s);
    const r = s.cfg.rounding || 1;
    const raw = s.cfg.payout.map(p => Math.floor(pool * p / 100 / r) * r);
    raw[0] += pool - raw.reduce((a, b) => a + b, 0);
    return raw;
  }

  // Uhr rechnet mit Zeitstempeln: Stand zum Zeitpunkt now, ohne den Zustand zu ändern.
  // Levelwechsel ergeben sich aus der verstrichenen Zeit, Umschläge werden beim Erreichen der Bounty-Phase festgelegt.
  function clockAt(s, now) {
    const c = { ...s.clock };
    let envTotal = s.envTotal, envAmounts = s.envAmounts;
    if (c.running) {
      let rem = c.remaining - (now - c.anchorTs);
      while (rem <= 0 && c.idx < s.structure.length - 1) {
        c.idx++;
        rem += s.structure[c.idx].min * MIN;
        if (envTotal === null && c.idx >= bountyStartIdx(s)) {
          envTotal = Math.max(0, alive(s).length - 1);
          envAmounts = envelopesFor(s, envTotal);
        }
      }
      if (rem <= 0) { rem = 0; c.running = false; }
      c.remaining = rem;
      c.anchorTs = now;
    }
    return { clock: c, envTotal, envAmounts };
  }
  function settle(s, ts) {
    const r = clockAt(s, ts);
    s.clock = r.clock;
    s.envTotal = r.envTotal;
    s.envAmounts = r.envAmounts;
  }
  function fixEnvelopes(s) {
    if (s.envTotal === null && bountyActive(s)) {
      s.envTotal = Math.max(0, alive(s).length - 1);
      s.envAmounts = envelopesFor(s, s.envTotal);
    }
  }
  function goTo(s, idx, ts) {
    s.clock.idx = Math.max(0, Math.min(s.structure.length - 1, idx));
    s.clock.remaining = cur(s).min * MIN;
    s.clock.anchorTs = ts;
    fixEnvelopes(s);
  }

  // Ansicht für die Oberfläche: Zustand mit Uhr zum Zeitpunkt now
  function tView(s, now) {
    return Object.assign({}, s, clockAt(s, now));
  }

  // Prognose: erstes Level, in dem nur noch ca. 25 Big Blinds im Spiel sind
  function forecastEnd(v, now) {
    const chips = chipsInPlay(v);
    let ms = v.clock.remaining;
    for (let i = v.clock.idx; i < v.structure.length; i++) {
      const x = v.structure[i];
      if (i > v.clock.idx) ms += x.min * MIN;
      if (!x.brk && chips / x.bb <= 25) break;
    }
    return now + ms;
  }

  // ---------- Turnier: Aktionen ----------
  function newPlayer(name) {
    return { name, out: false, rebuys: 0, addon: false, ko: 0, envs: 0, envSum: 0, place: null, outBy: null };
  }
  function findAlive(s, name) {
    const p = s.players.find(x => x.name === name);
    if (!p) throw fail(name + " spielt nicht mit");
    if (p.out) throw fail(name + " ist schon ausgeschieden");
    return p;
  }
  function notFinished(s) {
    if (s.winner) throw fail("Das Turnier ist entschieden");
  }

  const T_ACTIONS = {
    "clock.toggle"(s, e) {
      if (!s.clock.running && s.clock.remaining <= 0) throw fail("Die Uhr ist abgelaufen");
      if (!s.clock.running) notFinished(s);
      s.clock.running = !s.clock.running;
      s.clock.anchorTs = e.ts;
    },
    "clock.next"(s, e) {
      if (s.clock.idx >= s.structure.length - 1) throw fail("Letztes Level erreicht");
      goTo(s, s.clock.idx + 1, e.ts);
    },
    "clock.prev"(s, e) {
      goTo(s, s.clock.idx - 1, e.ts);
    },
    "clock.plus"(s, e) {
      s.clock.remaining = Math.min(cur(s).min * MIN, s.clock.remaining + MIN);
      s.clock.anchorTs = e.ts;
    },
    "clock.minus"(s, e) {
      s.clock.remaining = Math.max(1000, s.clock.remaining - MIN);
      s.clock.anchorTs = e.ts;
    },
    // Nachzügler: gleicher Buy-in, voller Startstack, bis Level cfg.lateUntil
    "player.late"(s, e) {
      notFinished(s);
      if (!isLate(s)) throw fail("Nachmelden nur bis Level " + s.cfg.lateUntil);
      if (s.players.length >= s.cfg.maxPlayers) throw fail("Tisch voll, maximal " + s.cfg.maxPlayers + " Spieler");
      if (s.players.some(p => p.name === e.name)) throw fail(e.name + " spielt schon mit");
      s.players.push(newPlayer(e.name));
      return e.name + " ist dabei: " + (s.cfg.buyPrize + s.cfg.buyMystery) + " €, " + fmtNum(s.cfg.buyChips) + " Chips";
    },
    "player.rebuy"(s, e) {
      notFinished(s);
      if (!isRebuy(s)) throw fail("Rebuy nur bis Level " + s.cfg.rebuyUntil);
      findAlive(s, e.name).rebuys++;
      return e.name + ": Rebuy";
    },
    "player.addon"(s, e) {
      notFinished(s);
      if (!cur(s).brk) throw fail("Add-On nur in der Pause");
      const p = findAlive(s, e.name);
      if (p.addon) throw fail(e.name + " hat schon ein Add-On");
      p.addon = true;
      return e.name + ": Add-On";
    },
    "player.out"(s, e) {
      notFinished(s);
      const p = findAlive(s, e.name), by = findAlive(s, e.by);
      if (p === by) throw fail("Niemand wirft sich selbst raus");
      p.place = alive(s).length;
      p.out = true;
      p.outBy = by.name;
      by.ko++;
      let msg = p.name + " ist raus (Platz " + p.place + ")";
      if (envelopeDue(s)) {
        let amt;
        if (s.envAmounts) {
          // Digitaler Umschlag: der Spieler wählt einen geschlossenen, ohne Wahl (Handy) der erste geschlossene
          const shut = k => !s.envOpened.some(o => o.i === k);
          const i = e.envIndex === undefined ? s.envAmounts.findIndex((_, k) => shut(k)) : Math.floor(+e.envIndex);
          if (!(i >= 0 && i < s.envAmounts.length)) throw fail("Diesen Umschlag gibt es nicht");
          if (!shut(i)) throw fail("Dieser Umschlag ist schon offen");
          amt = s.envAmounts[i];
          s.envOpened.push({ i, by: by.name, amt });
        } else {
          // Alte Turniere: Betrag aus dem Papier-Umschlag (optional, in EUR)
          amt = Math.max(0, Math.floor(+e.envAmount || 0));
        }
        s.envDrawn++;
        by.envs++;
        by.envSum += amt;
        msg = by.name + " zieht einen Umschlag" + (amt ? ": " + fmtNum(amt) + " €" : "!");
      }
      const left = alive(s);
      if (left.length === 1) {
        left[0].place = 1;
        s.winner = left[0].name;
        s.clock.running = false;
        return left[0].name + " gewinnt!";
      }
      if (left.length === s.cfg.payout.length) msg += ". Geldränge erreicht!";
      return msg;
    },
    "settings.apply"(s, e) {
      const cfg = clone(e.cfg), structure = renumber(clone(e.structure));
      if (!structure.length) throw fail("Die Blindstruktur ist leer");
      if (cfg.payout.reduce((a, b) => a + (+b || 0), 0) !== 100) throw fail("Auszahlung muss 100 % ergeben");
      if (structure.some(x => !(x.min >= 1) || (!x.brk && !(x.bb > 0)))) throw fail("Jedes Level braucht Big Blind und Minuten");
      const oldMin = cur(s).min;
      s.structure = structure;
      s.cfg = cfg;
      s.clock.idx = Math.min(s.clock.idx, structure.length - 1);
      const diff = (cur(s).min - oldMin) * MIN;
      s.clock.remaining = Math.max(1000, Math.min(cur(s).min * MIN, s.clock.remaining + diff));
      s.clock.anchorTs = e.ts;
      fixEnvelopes(s);
      return "Einstellungen übernommen";
    },
  };

  function tournamentInit({ id, ts, names, template }) {
    return {
      type: "tournament", id, createdAt: ts,
      templateName: template.name,
      structure: renumber(clone(template.structure)),
      cfg: Object.assign(clone(DEFAULT_TEMPLATE.cfg), clone(template.cfg)),
      players: names.slice(),
      envAuto: true,
    };
  }
  function tournamentState(init) {
    const structure = renumber(clone(init.structure));
    return {
      type: "tournament", id: init.id, createdAt: init.createdAt, templateName: init.templateName,
      structure, cfg: clone(init.cfg),
      players: init.players.map(newPlayer),
      clock: { idx: 0, remaining: structure[0].min * MIN, running: false, anchorTs: init.createdAt },
      envTotal: null, envDrawn: 0, envAuto: !!init.envAuto, envAmounts: null, envOpened: [],
      winner: null, closed: false, closedAt: null,
    };
  }

  // ---------- Cash Game ----------
  const seated = s => s.players.filter(p => p.seated);
  const cashIn = s => s.players.reduce((a, p) => a + p.inCents, 0);
  const cashOut = s => s.players.reduce((a, p) => a + p.outCents, 0);
  const elapsedMs = (s, now) => s.clock.elapsed + (s.clock.since ? now - s.clock.since : 0);
  const eurShort = cents => cents % 100 === 0 ? fmtNum(cents / 100) + " €"
    : (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  // Auszahlung auf volle payoutStep abrunden, der Rest bleibt als Chips am Tisch.
  // Der Letzte am Tisch bekommt den genauen Betrag. Alte Abende ohne payoutStep bleiben ungerundet.
  function payoutFor(s, counted) {
    const step = s.cfg.payoutStep;
    if (!step || seated(s).length <= 1) return counted;
    return Math.floor(counted / step) * step;
  }
  const countedSum = (s, counts) => s.cfg.denoms.reduce((a, d) => a + Math.max(0, Math.floor(+(counts || {})[d] || 0)) * d, 0);
  // Dauer: alte Abende mit gemessener Spielzeit behalten sie, sonst vom ersten Hinsetzen bis zum Abschluss
  const durationMs = (s, now) => s.clock.elapsed || s.clock.since ? elapsedMs(s, now)
    : s.firstTs ? Math.max(0, (s.closedAt || now) - s.firstTs) : 0;

  function findSeated(s, name) {
    const p = s.players.find(x => x.name === name && x.seated);
    if (!p) throw fail(name + " sitzt nicht am Tisch");
    return p;
  }

  // Großer Einkauf (doppelter Buy-in): frei, sobald alles Eingezahlte >= Spieler des Abends x doppelter Buy-in.
  // Einmal erreicht, bleibt er für den Rest des Abends frei.
  const bigBuyIn = s => s.cfg.buyIn * (s.cfg.bigFactor || 2);
  const bigThreshold = s => s.players.length * bigBuyIn(s);
  const buyOptions = s => s.bigUnlocked ? [s.cfg.buyIn, bigBuyIn(s)] : [s.cfg.buyIn];
  function buyAmount(s, e) {
    const amt = e.amount === undefined ? s.cfg.buyIn : Math.floor(+e.amount);
    if (!buyOptions(s).includes(amt)) throw fail(amt === bigBuyIn(s)
      ? eurShort(amt) + " erst ab " + eurShort(bigThreshold(s)) + " in der Kasse" : "Ungültiger Betrag");
    return amt;
  }
  function checkUnlock(s, msg) {
    if (s.bigUnlocked || !s.players.length || cashIn(s) < bigThreshold(s)) return msg;
    s.bigUnlocked = true;
    return msg + ". Ab jetzt auch " + eurShort(bigBuyIn(s)) + " möglich!";
  }

  const C_ACTIONS = {
    // Spieler setzt sich (neu oder Wiedereinstieg)
    "cash.join"(s, e) {
      if (seated(s).length >= s.cfg.maxSeats) throw fail("Tisch voll, maximal " + s.cfg.maxSeats + " Spieler");
      let p = s.players.find(x => x.name === e.name);
      if (p && p.seated) throw fail(e.name + " sitzt schon am Tisch");
      const amt = buyAmount(s, e);
      if (!p) { p = { name: e.name, inCents: 0, outCents: 0, seated: false, cashedOut: false }; s.players.push(p); }
      p.seated = true;
      p.cashedOut = false;
      p.inCents += amt;
      if (!s.firstTs) s.firstTs = e.ts;
      return checkUnlock(s, e.name + " setzt sich: " + eurShort(amt) + " = " + fmtNum(amt) + " Chips");
    },
    // Nachkauf, wenn der Stack unter dem halben Buy-in liegt (wird am Tisch geprüft)
    "cash.rebuy"(s, e) {
      const p = findSeated(s, e.name), amt = buyAmount(s, e);
      p.inCents += amt;
      return checkUnlock(s, e.name + ": Nachkauf " + eurShort(amt) + " = " + fmtNum(amt) + " Chips");
    },
    "cash.cashout"(s, e) {
      const p = findSeated(s, e.name);
      const counted = countedSum(s, e.counts), pay = payoutFor(s, counted);
      p.outCents += pay;
      p.seated = false;
      p.cashedOut = true;
      return e.name + " bekommt " + eurShort(pay) + (counted > pay ? ", " + eurShort(counted - pay) + " bleiben am Tisch" : "");
    },
    "cash.clock"(s, e) {
      if (s.clock.since) {
        s.clock.elapsed += e.ts - s.clock.since;
        s.clock.since = null;
        return "Spielzeit angehalten";
      }
      s.clock.since = e.ts;
      return s.clock.elapsed ? "Spielzeit läuft weiter" : "Spielzeit gestartet";
    },
  };

  function cashInit({ id, ts, cfg }) {
    return { type: "cash", id, createdAt: ts, cfg: Object.assign(clone(DEFAULT_CASH), clone(cfg || {})) };
  }
  function cashState(init) {
    return {
      type: "cash", id: init.id, createdAt: init.createdAt, cfg: clone(init.cfg),
      players: [], clock: { elapsed: 0, since: null }, firstTs: null, bigUnlocked: false, closed: false, closedAt: null,
    };
  }

  // ---------- Gemeinsam ----------
  function close(s, e) {
    if (s.type === "tournament") { settle(s, e.ts); s.clock.running = false; }
    else if (s.clock.since) { s.clock.elapsed += e.ts - s.clock.since; s.clock.since = null; }
    s.closed = true;
    s.closedAt = e.ts;
  }

  // Wendet eine Aktion an. Wirft einen Fehler mit Klartext, wenn sie nicht erlaubt ist.
  function apply(s, e) {
    if (s.closed) throw fail("Dieses Spiel ist abgeschlossen");
    if (e.type === "game.close") return close(s, e);
    const table = s.type === "tournament" ? T_ACTIONS : C_ACTIONS;
    const fn = table[e.type];
    if (!fn) throw fail("Unbekannte Aktion: " + e.type);
    if (s.type === "tournament") settle(s, e.ts);
    return fn(s, e);
  }

  function initState(init) {
    return init.type === "tournament" ? tournamentState(init) : cashState(init);
  }

  // Zustand aus Startwerten und Log berechnen
  function replay(game) {
    const s = initState(game.init);
    for (const e of game.log) {
      try { apply(s, e); } catch (err) { /* ungültig gewordene Aktion überspringen */ }
    }
    return s;
  }

  // Uhr-Aktionen werden nicht rückgängig gemacht (lassen sich direkt korrigieren)
  const isUndoable = e => !/^(clock\.|cash\.clock$|game\.)/.test(e.type);
  function lastUndoable(log) {
    for (let i = log.length - 1; i >= 0; i--) if (isUndoable(log[i])) return i;
    return -1;
  }
  function describe(e) {
    switch (e.type) {
      case "player.late": return "Nachzügler " + e.name;
      case "player.rebuy": return "Rebuy " + e.name;
      case "player.addon": return "Add-On " + e.name;
      case "player.out": return "Out " + e.name + " (von " + e.by + ")";
      case "settings.apply": return "Einstellungen";
      case "cash.join": return e.name + " setzt sich";
      case "cash.rebuy": return "Nachkauf " + e.name;
      case "cash.cashout": return "Auszahlung " + e.name;
      default: return e.type;
    }
  }

  return {
    MIN, DEFAULT_TEMPLATE, DEFAULT_CASH, fail, clone, renumber,
    // Turnier
    tournamentInit, alive, entries, addons, prizePool, mysteryPool, chipsInPlay, payouts,
    breakIdx, bountyStartIdx, splitEnvelopes, isRebuy, isLate, bountyActive, envelopeDue, cur, clockAt, tView, forecastEnd,
    // Cash Game
    cashInit, seated, cashIn, cashOut, elapsedMs, durationMs, payoutFor, countedSum, bigBuyIn, bigThreshold, buyOptions,
    // Gemeinsam
    apply, replay, isUndoable, lastUndoable, describe,
  };
});
