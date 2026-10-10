// Historie: Ranglisten und abgeschlossene Abende mit WhatsApp-Text (Vorlage: mockup/historie.html)
const H = PFHistory;
let histNights = [], histTab = "rt", histSel = 0;
let histFrom = "start"; // Zurück führt dorthin, woher die Historie geöffnet wurde

function openHistory() {
  histFrom = view;
  show("history");
}

views.history = {
  keys: { v: "back", f: "full", k: "copy" },
  actions: {
    back: () => show(histFrom),
    full: commonActions.full,
    copy: () => { const n = histNights[histSel]; if (histTab === "ab" && n) copyText(H.whatsapp(n)); },
  },
  async onShow() {
    histNights = (await pf.history()).map(H.night);
    histSel = 0;
    drawHistory();
  },
  render() {},
};
$("historyBack").onclick = e => { e.currentTarget.blur(); views.history.actions.back(); };
document.querySelectorAll(".hist-tab").forEach(b => b.onclick = () => { b.blur(); histTab = b.dataset.tab; drawHistory(); });

const copyText = text => cmd("clipboard.write", { text });
// WhatsApp-Fettdruck (*text*) auch in der Vorschau zeigen
const waHtml = text => escapeHtml(text).replace(/\*(.+?)\*/g, "<b>$1</b>");
const resCls = v => v > 0 ? "pos" : v < 0 ? "neg" : "";
const rankCls = i => i < 3 ? " class='top" + (i + 1) + "'" : "";
const whole = v => fmtNum(Math.round(v)) + " €";

function drawHistory() {
  document.querySelectorAll(".hist-tab").forEach(b => b.classList.toggle("on", b.dataset.tab === histTab));
  $("histCount").textContent = histNights.length;
  const pane = $("histPane");
  if (histTab === "rt") {
    const { rows, stats } = H.tournamentRanking(histNights);
    pane.innerHTML = "<div class='hcard hgrow'>" + (rows.length ? "<table class='htable'><tr><th>#</th><th>Spieler</th><th>Abende</th><th>Siege</th><th>Geldränge</th><th>Einsatz</th><th>Auszahlung</th><th>Umschläge</th><th>Bilanz</th></tr>" +
      rows.map((r, i) => "<tr" + rankCls(i) + "><td class='rank'>" + (i + 1) + "</td><td class='name'>" + escapeHtml(r.name) + "</td><td>" + r.nights + "</td><td>" + r.wins + "</td><td>" + r.itm +
        "</td><td>" + whole(r.stake) + "</td><td>" + whole(r.payout) + "</td><td>" + whole(r.envSum) + "</td><td class='" + resCls(r.result) + "'>" + H.signedWhole(r.result) + "</td></tr>").join("") + "</table>"
      : "<div class='empty-state'>Noch kein abgeschlossenes Turnier mit Sieger.</div>") + "</div>" +
      "<div class='hside'><div class='hcard'><h3>TURNIERE GESAMT</h3><div class='kpi'>" +
      "<div><small>Turniere</small><b>" + stats.count + "</b></div>" +
      "<div><small>Ø Spieler</small><b>" + fmtNum(Math.round(stats.avgPlayers * 10) / 10) + "</b></div>" +
      "<div><small>Ø Preispool</small><b>" + whole(stats.avgPool) + "</b></div>" +
      "<div><small>Ø Dauer</small><b>" + (stats.count ? H.hours(stats.avgDuration) : "-") + "</b></div>" +
      "<div><small>Meiste Siege</small><b>" + escapeHtml(stats.mostWins) + "</b></div>" +
      "<div><small>Meiste KOs</small><b>" + escapeHtml(stats.mostKo) + "</b></div></div></div>" +
      "<div class='hcard hhint'><b>So wird gerechnet</b><br>Einsatz = Buy-ins + Rebuys + Add-Ons.<br>Bilanz = Auszahlung + Umschläge - Einsatz.<br>" +
      "Umschläge zählen nur, wenn der Betrag beim Out eingetragen wurde. Turniere ohne Sieger zählen nicht.</div></div>";
  } else if (histTab === "rc") {
    const { rows, stats } = H.cashRanking(histNights);
    pane.innerHTML = "<div class='hcard hgrow'>" + (rows.length ? "<table class='htable'><tr><th>#</th><th>Spieler</th><th>Abende</th><th>Eingezahlt</th><th>Ausgezahlt</th><th>Bester Abend</th><th>Bilanz</th></tr>" +
      rows.map((r, i) => "<tr" + rankCls(i) + "><td class='rank'>" + (i + 1) + "</td><td class='name'>" + escapeHtml(r.name) + "</td><td>" + r.nights + "</td><td>" + eurShort(r.inCents) +
        "</td><td>" + eur(r.outCents) + "</td><td>" + H.signedEur(r.best) + "</td><td class='" + resCls(r.result) + "'>" + H.signedEur(r.result) + "</td></tr>").join("") + "</table>"
      : "<div class='empty-state'>Noch kein abgeschlossenes Cash Game.</div>") + "</div>" +
      "<div class='hside'><div class='hcard'><h3>CASH GAMES GESAMT</h3><div class='kpi'>" +
      "<div><small>Abende</small><b>" + stats.count + "</b></div>" +
      "<div><small>Ø Dauer</small><b>" + (stats.count ? H.hours(stats.avgDuration) : "-") + "</b></div>" +
      "<div><small>Umsatz</small><b>" + eurShort(stats.turnover) + "</b></div>" +
      "<div><small>Ø Spieler</small><b>" + fmtNum(Math.round(stats.avgPlayers * 10) / 10) + "</b></div></div></div></div>";
  } else {
    if (!histNights.length) { pane.innerHTML = "<div class='empty-state' style='flex:1'>Noch keine abgeschlossenen Abende.</div>"; return; }
    const n = histNights[histSel];
    pane.innerHTML = "<div class='nights'>" + histNights.map((x, i) => "<button class='night" + (i === histSel ? " on" : "") + "' data-i='" + i + "'><span class='d'>" + H.day(x.ts) +
      "</span><span class='t'>" + (x.kind === "cash" ? "CASH GAME" : "TURNIER") + "</span><span class='s'>" + escapeHtml(H.summary(x)) + "</span></button>").join("") + "</div>" +
      "<div class='ndetail'><div class='hcard'>" + nightDetail(n) + "</div>" +
      "<div class='wa-row'><b>WHATSAPP-TEXT</b><button class='btn primary' id='waCopy'>Kopieren <kbd>K</kbd></button></div>" +
      "<div class='wa'>" + waHtml(H.whatsapp(n)) + "</div></div>";
    pane.querySelectorAll(".night").forEach(b => b.onclick = () => { histSel = +b.dataset.i; drawHistory(); });
    $("waCopy").onclick = e => { e.currentTarget.blur(); copyText(H.whatsapp(n)); };
  }
}

function nightDetail(n) {
  if (n.kind === "cash") {
    return "<h3>CASH GAME · " + H.day(n.ts).toUpperCase() + " · " + H.hours(n.duration).toUpperCase() + "</h3><table class='htable'><tr><th>#</th><th>Spieler</th><th>Eingezahlt</th><th>Ausgezahlt</th><th>Bilanz</th></tr>" +
      n.players.map((p, i) => "<tr" + rankCls(i) + "><td class='rank'>" + (i + 1) + "</td><td class='name'>" + escapeHtml(p.name) + "</td><td>" + eurShort(p.inCents) + "</td><td>" + eur(p.outCents) +
        "</td><td class='" + resCls(p.result) + "'>" + H.signedEur(p.result) + "</td></tr>").join("") + "</table>" +
      "<p class='hhint' style='margin-top:1.4vh'>Kassen-Check: eingezahlt " + eur(n.totalIn) + (n.totalIn === n.totalOut ? " = ausgezahlt " + eur(n.totalOut) + " ✓" : ", ausgezahlt " + eur(n.totalOut) + " (Differenz " + H.signedEur(n.totalIn - n.totalOut) + ")") + "</p>";
  }
  return "<h3>TURNIER · " + H.day(n.ts).toUpperCase() + " · " + H.clock(n.start) + " BIS " + H.clock(n.end) + (n.winner ? "" : " · OHNE SIEGER") + "</h3>" +
    "<table class='htable'><tr><th>Platz</th><th>Spieler</th><th>Einsatz</th><th>Auszahlung</th><th>Umschläge</th><th>KOs</th><th>Bilanz</th></tr>" +
    n.players.map((p, i) => "<tr" + (p.place && p.place <= 3 ? " class='top" + p.place + "'" : "") + "><td class='rank'>" + (p.place || "-") + "</td><td class='name'>" + escapeHtml(p.name) +
      "</td><td>" + whole(p.stake) + "</td><td>" + whole(p.payout) + "</td><td>" + (p.envs && !p.envSum ? p.envs + "×" : (p.envs > 1 ? p.envs + "× " : "") + whole(p.envSum)) + "</td><td>" + p.ko +
      "</td><td class='" + resCls(p.result) + "'>" + H.signedWhole(p.result) + "</td></tr>").join("") + "</table>";
}

// Start: Historie per Karte oder Taste V
$("startHistory").onclick = e => { e.currentTarget.blur(); openHistory(); };
views.start.keys.v = "history";
views.start.actions.history = openHistory;
