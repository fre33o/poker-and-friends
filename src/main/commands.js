// Zentrale Befehlsliste. Tastatur, Steuermenü und später das Handy rufen dieselben Befehle auf.
// Jeder Befehl gibt optional einen Hinweistext zurück oder wirft einen Fehler mit Klartext.
// Läuft im Hauptprozess (Desktop) und in der WebApp im Browser (dort als PFCommands).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../core/core.js"));
  else root.PFCommands = factory(root.PFCore);
})(typeof self !== "undefined" ? self : this, function (Core) {

const fail = Core.fail;
const pad = n => String(n).padStart(2, "0");

function stamp(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
const slug = name => name.trim().replace(/[^\wäöüÄÖÜß -]/g, "").replace(/\s+/g, "-").slice(0, 40) || "vorlage";
const cleanName = n => String(n || "").trim().slice(0, 20);

const DEFAULT_SETTINGS = { sound: true, lastTemplate: Core.DEFAULT_TEMPLATE.name, cash: Core.DEFAULT_CASH };

function createApp(store, hooks = {}) {
  const settings = Object.assign(Core.clone(DEFAULT_SETTINGS), store.read("einstellungen.json", {}));
  // Spielerliste immer alphabetisch
  const byName = (a, b) => a.localeCompare(b, "de", { sensitivity: "base" });
  let roster = store.read("spieler.json", []).sort(byName);
  const active = store.read("aktiv.json", { tournament: null, cash: null });

  if (!store.list("vorlagen").length) store.write("vorlagen/" + slug(Core.DEFAULT_TEMPLATE.name) + ".json", Core.DEFAULT_TEMPLATE);
  const templates = () => store.list("vorlagen").map(f => store.read("vorlagen/" + f, null)).filter(t => t && t.name && t.structure);

  // Laufende Spiele laden (Fortsetzen nach Absturz oder Neustart)
  const games = { tournament: null, cash: null };
  const states = { tournament: null, cash: null };
  for (const kind of ["tournament", "cash"]) {
    if (!active[kind]) continue;
    const g = store.read("abende/" + active[kind] + ".json", null);
    if (g && g.init) { games[kind] = g; states[kind] = Core.replay(g); }
    else active[kind] = null;
  }

  const saveGame = g => store.write("abende/" + g.init.id + ".json", g);
  const saveActive = () => store.write("aktiv.json", active);
  const saveRoster = () => { roster.sort(byName); store.write("spieler.json", roster); };
  const saveSettings = () => store.write("einstellungen.json", settings);

  function addToRoster(name) {
    if (name && !roster.includes(name)) { roster.push(name); saveRoster(); }
  }

  function startGame(kind, init) {
    if (games[kind]) throw fail(kind === "tournament" ? "Es läuft schon ein Turnier" : "Es läuft schon ein Cash Game");
    const g = { version: 1, init, log: [] };
    games[kind] = g;
    states[kind] = Core.replay(g);
    active[kind] = init.id;
    saveGame(g);
    saveActive();
  }

  // Aktion ins Spiel: erst gegen den Zustand prüfen, dann ins Log und sofort speichern
  function gameAction(kind, type, payload) {
    const g = games[kind];
    if (!g) throw fail(kind === "tournament" ? "Kein laufendes Turnier" : "Kein laufendes Cash Game");
    const e = Object.assign({}, payload, { type, ts: Date.now() });
    if (e.name !== undefined) e.name = cleanName(e.name);
    if (e.by !== undefined) e.by = cleanName(e.by);
    const msg = Core.apply(states[kind], e);
    g.log.push(e);
    saveGame(g);
    if (type === "player.late" || type === "cash.join") addToRoster(e.name);
    return msg;
  }

  function closeGame(kind) {
    if (!games[kind]) return;
    gameAction(kind, "game.close", {});
    games[kind] = null;
    states[kind] = null;
    active[kind] = null;
    saveActive();
  }

  const commands = {
    "tournament.start"({ names, template }) {
      const tpl = templates().find(t => t.name === template) || Core.DEFAULT_TEMPLATE;
      const list = [...new Set((names || []).map(cleanName).filter(Boolean))];
      const cfg = Object.assign(Core.clone(Core.DEFAULT_TEMPLATE.cfg), tpl.cfg);
      if (list.length < cfg.minPlayers) throw fail("Mindestens " + cfg.minPlayers + " Spieler");
      if (list.length > cfg.maxPlayers) throw fail("Maximal " + cfg.maxPlayers + " Spieler");
      const ts = Date.now();
      list.forEach(addToRoster);
      startGame("tournament", Core.tournamentInit({ id: stamp(ts) + "_turnier", ts, names: list, template: tpl }));
      settings.lastTemplate = tpl.name;
      saveSettings();
      return list.length + " Spieler eingecheckt";
    },
    "tournament.close"() {
      closeGame("tournament");
      return "Turnier abgeschlossen und gespeichert";
    },
    "cash.start"() {
      const ts = Date.now();
      startGame("cash", Core.cashInit({ id: stamp(ts) + "_cashgame", ts, cfg: settings.cash }));
      return "Cash Game gestartet";
    },
    "cash.close"() {
      closeGame("cash");
      return "Abend abgeschlossen und gespeichert";
    },
    undo({ kind }) {
      const g = games[kind];
      if (!g) return null;
      const i = Core.lastUndoable(g.log);
      if (i < 0) throw fail("Nichts zum Rückgängigmachen");
      const [e] = g.log.splice(i, 1);
      states[kind] = Core.replay(g);
      saveGame(g);
      return "Rückgängig: " + Core.describe(e);
    },
    "roster.add"({ name }) {
      name = cleanName(name);
      if (!name) throw fail("Bitte einen Namen eintragen");
      addToRoster(name);
    },
    "roster.rename"({ name, to }) {
      to = cleanName(to);
      if (!to) throw fail("Bitte einen Namen eintragen");
      if (!roster.includes(name)) throw fail(name + " steht nicht in der Spielerliste");
      if (to !== name && roster.some(n => n.toLowerCase() === to.toLowerCase())) throw fail(to + " steht schon in der Spielerliste");
      roster = roster.map(n => n === name ? to : n);
      saveRoster();
      return name + " heißt jetzt " + to;
    },
    "roster.remove"({ name }) {
      roster = roster.filter(n => n !== name);
      saveRoster();
    },
    "template.save"({ name, structure, cfg }) {
      name = String(name || "").trim().slice(0, 40);
      if (!name) throw fail("Bitte einen Namen für die Vorlage eintragen");
      store.write("vorlagen/" + slug(name) + ".json", { name, structure: Core.renumber(Core.clone(structure)), cfg });
      return "Vorlage \"" + name + "\" gespeichert";
    },
    "settings.sound"({ on }) {
      settings.sound = !!on;
      saveSettings();
      return "Ton " + (settings.sound ? "an" : "aus");
    },
  };

  function dispatch(name, payload) {
    let fn = commands[name];
    if (!fn && name.startsWith("t:")) fn = p => gameAction("tournament", name.slice(2), p);
    if (!fn && name.startsWith("c:")) fn = p => gameAction("cash", name.slice(2), p);
    if (!fn && hooks[name]) fn = hooks[name];
    if (!fn) return { ok: false, error: "Unbekannter Befehl: " + name };
    try {
      return { ok: true, msg: fn(payload || {}) || null };
    } catch (e) {
      if (!e.user) console.error(e);
      return { ok: false, error: e.user ? e.message : "Fehler: " + e.message };
    }
  }

  function snapshot() {
    return {
      settings, roster, templates: templates(),
      tournament: games.tournament, cash: games.cash,
      dataDir: store.dir,
    };
  }

  const hasActiveGame = () => !!(games.tournament || games.cash);

  // Abgeschlossene Abende für die Historie, neueste zuerst
  function history() {
    return store.list("abende").sort().reverse()
      .map(f => store.read("abende/" + f, null))
      .filter(g => g && g.init && g.log && g.log.some(e => e.type === "game.close"));
  }

  return { dispatch, snapshot, hasActiveGame, history };
}

return { createApp };
});
