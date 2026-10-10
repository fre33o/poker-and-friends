// Historie: Auswertung abgeschlossener Abende, Ranglisten und WhatsApp-Text.
// Rechnet nur aus gespeicherten Spielen (Startwerte + Aktions-Log), läuft im Hauptprozess (Tests) und in der Oberfläche.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.PFHistory = factory(root.PFCore);
})(typeof self !== "undefined" ? self : this, function (K) {
  "use strict";

  const fmtNum = n => Number(n).toLocaleString("de-DE");
  const eur = cents => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const eurShort = cents => cents % 100 === 0 ? fmtNum(cents / 100) + " €" : eur(cents);
  const signedEur = cents => (cents > 0 ? "+" : cents < 0 ? "-" : "±") + eurShort(Math.abs(cents));
  const signedWhole = v => (v > 0 ? "+" : v < 0 ? "-" : "±") + fmtNum(Math.abs(v)) + " €";
  const pad = n => String(n).padStart(2, "0");
  const day = ts => {
    const d = new Date(ts);
    return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()] + " " + pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  };
  const clock = ts => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const hours = ms => { const m = Math.round(ms / 60000); return Math.floor(m / 60) + ":" + pad(m % 60) + " h"; };

  // ---------- Einzelner Abend ----------
  function tournamentNight(game) {
    const s = K.replay(game);
    const pay = K.payouts(s);
    const buy = s.cfg.buyPrize + s.cfg.buyMystery;
    const start = (game.log.find(e => e.type === "clock.toggle") || { ts: s.createdAt }).ts;
    const outs = game.log.filter(e => e.type === "player.out");
    const end = s.winner && outs.length ? outs[outs.length - 1].ts : s.closedAt || start;
    const players = s.players.map(p => {
      const stake = (1 + p.rebuys) * buy + (p.addon ? s.cfg.addonPrice : 0);
      const payout = s.winner && p.place && p.place <= pay.length ? pay[p.place - 1] : 0;
      return {
        name: p.name, place: s.winner ? p.place : null, rebuys: p.rebuys, addon: p.addon, ko: p.ko,
        envs: p.envs, envSum: p.envSum || 0, stake, payout, result: payout + (p.envSum || 0) - stake,
      };
    }).sort((a, b) => (a.place || 99) - (b.place || 99) || b.result - a.result);
    return {
      kind: "tournament", id: s.id, ts: s.createdAt, start, end, duration: Math.max(0, end - start),
      winner: s.winner, players, payouts: pay,
      prizePool: K.prizePool(s), mysteryPool: K.mysteryPool(s),
      rebuys: K.entries(s) - s.players.length, addons: K.addons(s),
    };
  }

  function cashNight(game) {
    const s = K.replay(game);
    const players = s.players.map(p => ({ name: p.name, inCents: p.inCents, outCents: p.outCents, result: p.outCents - p.inCents }))
      .sort((a, b) => b.result - a.result);
    return {
      kind: "cash", id: s.id, ts: s.createdAt, end: s.closedAt, duration: K.durationMs(s, Date.now()),
      players, totalIn: K.cashIn(s), totalOut: K.cashOut(s), blinds: s.cfg.sb + " / " + s.cfg.bb,
    };
  }

  const night = game => game.init.type === "tournament" ? tournamentNight(game) : cashNight(game);

  // ---------- Ranglisten ----------
  function tournamentRanking(nights) {
    const valid = nights.filter(n => n.kind === "tournament" && n.winner);
    const map = new Map();
    for (const n of valid) for (const p of n.players) {
      const r = map.get(p.name) || { name: p.name, nights: 0, wins: 0, itm: 0, ko: 0, stake: 0, payout: 0, envSum: 0, result: 0 };
      r.nights++;
      if (p.place === 1) r.wins++;
      if (p.payout > 0) r.itm++;
      r.ko += p.ko;
      r.stake += p.stake;
      r.payout += p.payout;
      r.envSum += p.envSum;
      r.result += p.result;
      map.set(p.name, r);
    }
    const rows = [...map.values()].sort((a, b) => b.result - a.result || b.wins - a.wins || a.name.localeCompare(b.name));
    const top = key => { const best = rows.slice().sort((a, b) => b[key] - a[key])[0]; return best && best[key] > 0 ? best.name : "-"; };
    const avg = f => valid.length ? valid.reduce((a, n) => a + f(n), 0) / valid.length : 0;
    return {
      rows,
      stats: {
        count: valid.length, avgPlayers: avg(n => n.players.length), avgPool: avg(n => n.prizePool),
        avgDuration: avg(n => n.duration), mostWins: top("wins"), mostKo: top("ko"),
      },
    };
  }

  function cashRanking(nights) {
    const valid = nights.filter(n => n.kind === "cash" && n.players.length);
    const map = new Map();
    for (const n of valid) for (const p of n.players) {
      const r = map.get(p.name) || { name: p.name, nights: 0, inCents: 0, outCents: 0, best: null, result: 0 };
      r.nights++;
      r.inCents += p.inCents;
      r.outCents += p.outCents;
      r.result += p.result;
      r.best = r.best === null ? p.result : Math.max(r.best, p.result);
      map.set(p.name, r);
    }
    const rows = [...map.values()].sort((a, b) => b.result - a.result || a.name.localeCompare(b.name));
    const avg = f => valid.length ? valid.reduce((a, n) => a + f(n), 0) / valid.length : 0;
    return {
      rows,
      stats: { count: valid.length, avgDuration: avg(n => n.duration), turnover: valid.reduce((a, n) => a + n.totalIn, 0), avgPlayers: avg(n => n.players.length) },
    };
  }

  // ---------- WhatsApp-Text ----------
  const MEDALS = ["🥇", "🥈", "🥉"];
  function whatsapp(n) {
    if (n.kind === "cash") {
      return "♠️ *Poker & Friends* · Cash Game " + day(n.ts) + "\n\n💰 Ergebnis\n" +
        n.players.map(p => p.name + " " + signedEur(p.result)).join("\n") +
        "\n\n" + n.players.length + " Spieler · " + eurShort(n.totalIn) + " im Spiel · " + hours(n.duration);
    }
    const lines = ["♠️ *Poker & Friends* · Turnier " + day(n.ts), ""];
    if (n.winner) {
      lines.push("🏆 *" + n.winner + "* gewinnt!");
      n.players.filter(p => p.payout > 0).forEach(p => lines.push((MEDALS[p.place - 1] || p.place + ".") + " " + p.name + " " + fmtNum(p.payout) + " €"));
    } else {
      lines.push("Turnier ohne Sieger beendet");
    }
    const env = n.players.filter(p => p.envs).sort((a, b) => b.envSum - a.envSum || b.envs - a.envs);
    if (env.length) {
      lines.push("");
      lines.push("💌 Umschläge (" + fmtNum(n.mysteryPool) + " €): " + env.map(p =>
        p.name + " " + (p.envs > 1 ? p.envs + "×" + (p.envSum ? " (" + fmtNum(p.envSum) + " €)" : "") : p.envSum ? fmtNum(p.envSum) + " €" : "1×")).join(", "));
    }
    const ko = n.players.slice().sort((a, b) => b.ko - a.ko)[0];
    if (ko && ko.ko > 0) {
      if (!env.length) lines.push("");
      lines.push("🔪 Meiste KOs: " + ko.name + " (" + ko.ko + ")");
    }
    lines.push("");
    lines.push(n.players.length + " Spieler · " + n.rebuys + " Rebuy" + (n.rebuys === 1 ? "" : "s") + " · " + n.addons + " Add-On" + (n.addons === 1 ? "" : "s"));
    lines.push(clock(n.start) + " bis " + clock(n.end) + " Uhr (" + hours(n.duration) + ")");
    return lines.join("\n");
  }

  // Kurzbeschreibung für die Liste der Abende
  function summary(n) {
    if (n.kind === "cash") return n.players.length + " Spieler · Dauer " + hours(n.duration) + " · Umsatz " + eurShort(n.totalIn);
    return n.players.length + " Spieler · " + (n.winner ? "Sieg " + n.winner : "ohne Sieger") + " · Preispool " + fmtNum(n.prizePool) + " €";
  }

  return { night, tournamentRanking, cashRanking, whatsapp, summary, day, clock, hours, eur, eurShort, signedEur, signedWhole };
});
