// Startbildschirm: Turnier oder Cash Game starten bzw. fortsetzen
views.start = {
  keys: { t: "tournament", g: "cash", f: "full", h: "handy" },
  actions: {
    tournament: () => T ? show("tournament") : openCheckin(),
    cash: async () => {
      if (C) return show("cash");
      const r = await cmd("cash.start");
      if (r.ok) show("cash");
    },
    full: commonActions.full,
    handy: () => openHandy(),
  },
  render() {
    if (T) {
      const v = PFCore.tView(T, Date.now());
      const s = PFCore.cur(v);
      $("startTournamentSub").innerHTML = "<span class='live'>Läuft seit " + fmtDate(T.createdAt) + "</span><br>" +
        (T.winner ? escapeHtml(T.winner) + " hat gewonnen" : (s.brk ? "Pause" : "Level " + s.level) + " &middot; " +
          PFCore.alive(v).length + " / " + v.players.length + " Spieler &middot; Uhr " + (v.clock.running ? "läuft" : "angehalten"));
      $("startTournamentGo").textContent = "FORTSETZEN →";
    } else {
      $("startTournamentSub").innerHTML = "";
      $("startTournamentGo").textContent = "";
    }
    if (C) {
      $("startCashSub").innerHTML = "<span class='live'>Läuft seit " + fmtDate(C.createdAt) + "</span><br>" +
        PFCore.seated(C).length + " am Tisch &middot; Kasse " + eurShort(PFCore.cashIn(C) - PFCore.cashOut(C));
      $("startCashGo").textContent = "FORTSETZEN →";
    } else {
      $("startCashSub").innerHTML = "";
      $("startCashGo").textContent = "";
    }
  },
};

$("startTournament").onclick = e => { e.currentTarget.blur(); views.start.actions.tournament(); };
$("startCash").onclick = e => { e.currentTarget.blur(); views.start.actions.cash(); };
if ($("openHandy")) $("openHandy").onclick = e => { e.currentTarget.blur(); openHandy(); }; // fehlt in der WebApp
$("openData").onclick = () => cmd("data.open");
$("openRoster").onclick = e => { e.currentTarget.blur(); openRoster(); };

// Spielerliste pflegen: hinzufügen, umbenennen, entfernen (alphabetisch, sortiert der Hauptprozess)
function openRoster() {
  let shown = null;
  const draw = () => {
    const key = JSON.stringify(S.roster);
    if (key === shown) return;
    shown = key;
    const adding = document.activeElement && document.activeElement.id === "rosterNew";
    openModal("roster", "<h2>Spielerliste</h2>" +
      "<div class='add-row'><input id='rosterNew' placeholder='Neuer Spieler, Enter zum Hinzufügen' maxlength='20'><button class='btn primary' id='rosterAdd'>Hinzufügen</button></div>" +
      "<div class='roster-list'>" + (S.roster.length ? S.roster.map((n, i) =>
        "<div class='roster-row'><input data-i='" + i + "' value='" + escapeHtml(n) + "' maxlength='20'><button class='rowbtn' data-del='" + i + "' title='Entfernen'>&#10005;</button></div>").join("")
        : "<span class='empty'>Noch keine Spieler eingetragen.</span>") + "</div>");
    modalRefresh = draw;
    const add = async () => {
      const name = $("rosterNew").value.trim();
      if (!name) return;
      const r = await cmd("roster.add", { name });
      if (r.ok) { $("rosterNew").value = ""; $("rosterNew").focus(); }
    };
    $("rosterAdd").onclick = add;
    $("rosterNew").onkeydown = e => { if (e.key === "Enter") add(); };
    $("modal").querySelectorAll(".roster-row input").forEach(inp => {
      const old = S.roster[+inp.dataset.i];
      const rename = () => { const to = inp.value.trim(); if (to && to !== old) cmd("roster.rename", { name: old, to }); else inp.value = old; };
      inp.onchange = rename;
      inp.onkeydown = e => { if (e.key === "Enter") inp.blur(); };
    });
    $("modal").querySelectorAll("[data-del]").forEach(b => b.onclick = () => cmd("roster.remove", { name: S.roster[+b.dataset.del] }));
    if (adding || !S.roster.length) $("rosterNew").focus();
  };
  draw();
}
