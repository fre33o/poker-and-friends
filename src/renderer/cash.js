// Cash Game Kasse (Vorlage: mockup/kasse.html). 1 Chip-Einheit = 1 Cent.
views.cash = {
  keys: { n: "join", r: "rebuy", c: "cashout", x: "end", f: "full", t: "tournament", v: "history", h: "handy" },
  actions: {
    join: doJoin, rebuy: doCashRebuy, cashout: doCashout, end: doCashEnd,
    undo: () => cmd("undo", { kind: "cash" }),
    full: commonActions.full,
    tournament: () => views.start.actions.tournament(),
    history: () => openHistory(),
    handy: () => openHandy(),
    roster: () => openRoster(),
  },
  render: renderCash,
};
bindMenu("c", "cash");
// Klick auf einen Spieler am Tisch: kleines Fenster mit Nachkauf und Auszahlen
$("crows").addEventListener("click", e => {
  const row = e.target.closest(".crow[data-name]");
  const p = row && C && PFCore.seated(C).find(x => x.name === row.dataset.name);
  if (p) openPlayerSheet(p);
});

function renderCash(now) {
  if (!C) return;
  const rows = $("crows");
  if (!C.players.length) {
    rows.innerHTML = "<div class='empty-state'>Noch niemand am Tisch. Menü &#9776; &rarr; „Spieler setzt sich“</div>";
  } else {
    const sorted = [...C.players].sort((a, b) => b.seated - a.seated);
    const html = sorted.map(p => {
      const res = p.outCents - p.inCents;
      return "<div class='crow" + (p.seated ? " seated' data-name='" + escapeHtml(p.name) : " left") + "'>" +
        "<span class='name'>" + escapeHtml(p.name) + "</span>" +
        "<span>" + eurShort(p.inCents) + "</span>" +
        "<span>" + (p.cashedOut ? eurShort(p.outCents) : "<span class='muted'>-</span>") + "</span>" +
        "<span>" + (p.cashedOut ? "<span class='" + (res >= 0 ? "pos" : "neg") + "'>" + signed(res) + "</span>" : "<span class='muted'>läuft</span>") + "</span>" +
        "<span class='status " + (p.seated ? "play'>am Tisch" : "out'>gegangen") + "</span></div>";
    }).join("");
    if (rows.dataset.html !== html) { rows.innerHTML = html; rows.dataset.html = html; }
  }
  const totalIn = PFCore.cashIn(C), totalOut = PFCore.cashOut(C);
  $("cTable").innerHTML = PFCore.seated(C).length + " <small>/ " + C.cfg.maxSeats + "</small>";
  $("cIn").textContent = eurShort(totalIn);
  $("cOut").textContent = eurShort(totalOut);
  $("cKasse").textContent = eurShort(totalIn - totalOut);
  $("cWalltime").textContent = fmtClock(now);
}

// Spieler setzt sich (neu oder erneut)
// Betragswahl 10 € / 20 €, sobald der große Einkauf frei ist
const buyLabel = a => eurShort(a) + " = " + fmtNum(a) + " Chips";
function amountRow() {
  const opts = PFCore.buyOptions(C);
  if (opts.length < 2) return "";
  return "<div class='amount-row'>" + opts.map((a, i) => "<button class='btn" + (i ? "" : " primary") + "' data-amt='" + a + "'>" + buyLabel(a) + "</button>").join("") + "</div>";
}
function bindAmountRow() {
  let amt = C.cfg.buyIn;
  $("modal").querySelectorAll("[data-amt]").forEach(b => b.onclick = () => {
    amt = +b.dataset.amt;
    $("modal").querySelectorAll("[data-amt]").forEach(x => x.classList.toggle("primary", x === b));
  });
  return () => amt;
}

// Mehrere Spieler antippen (rot markiert), dann alle zusammen hinsetzen. Wer schon sitzt, ist ausgegraut.
function doJoin() {
  const free = C.cfg.maxSeats - PFCore.seated(C).length;
  if (free <= 0) return toast("Tisch voll, maximal " + C.cfg.maxSeats + " Spieler");
  const sits = n => C.players.some(p => p.name === n && p.seated);
  const names = [...S.roster];
  const picked = new Set();
  openModal("checkin", "<h2>Spieler setzt sich</h2>" + amountRow() + "<div class='chips' id='joinChips'></div>" +
    "<div class='add-row'><input id='newName' placeholder='Neuer Spieler, Enter zum Auswählen' maxlength='20'><button class='btn primary' id='joinGo'></button></div>");
  const getAmt = bindAmountRow();
  const draw = () => {
    $("joinChips").innerHTML = names.length ? names.map((n, i) => "<button class='chip" + (picked.has(n) ? " on" : "") + "' data-i='" + i + "'" +
      (sits(n) ? " disabled title='sitzt schon am Tisch'" : "") + ">" + escapeHtml(n) + "</button>").join("")
      : "<span class='empty'>Spielerliste ist leer. Neuen Namen eintragen.</span>";
    $("joinChips").querySelectorAll(".chip").forEach(c => c.onclick = () => {
      const n = names[+c.dataset.i];
      if (picked.has(n)) picked.delete(n);
      else if (picked.size >= free) return toast("Nur noch " + free + " Plätze frei");
      else picked.add(n);
      draw();
    });
    $("joinGo").textContent = picked.size > 1 ? picked.size + " Spieler hinsetzen" : "Hinsetzen";
    $("joinGo").disabled = !picked.size;
  };
  // Neuer Name kommt markiert in die Auswahl (in die Spielerliste beim Hinsetzen)
  $("newName").onkeydown = e => {
    if (e.key !== "Enter") return;
    const name = $("newName").value.trim().slice(0, 20);
    if (!name) return picked.size && go();
    const known = names.find(n => n.toLowerCase() === name.toLowerCase());
    if (known && sits(known)) return toast(known + " sitzt schon am Tisch");
    if (!known && picked.size >= free) return toast("Nur noch " + free + " Plätze frei");
    if (!known) names.push(name);
    picked.add(known || name);
    $("newName").value = "";
    draw();
  };
  const go = async () => {
    const amt = getAmt(), done = [];
    let unlock = "";
    for (const name of names.filter(n => picked.has(n))) {
      const r = await pf.cmd("c:cash.join", { name, amount: amt });
      if (!r.ok) { toast(r.error); break; }
      done.push(name);
      if (/Ab jetzt/.test(r.msg || "")) unlock = r.msg.slice(r.msg.indexOf("Ab jetzt"));
    }
    if (!done.length) return;
    closeModal();
    toast((done.length === 1 ? done[0] + " setzt sich" : done.join(", ") + " setzen sich") + ": " + (done.length > 1 ? "je " : "") + buyLabel(amt) + (unlock ? ". " + unlock : ""));
  };
  $("joinGo").onclick = go;
  draw();
  if (!names.some(n => !sits(n))) $("newName").focus();
}

// Kleines Fenster für einen Spieler am Tisch: Nachkauf (je Betrag ein Knopf) und Auszahlen
function openPlayerSheet(p) {
  const opts = PFCore.buyOptions(C);
  openModal("sheet", "<h2>" + escapeHtml(p.name) + "</h2><p>Eingezahlt " + eurShort(p.inCents) + "</p>" +
    "<div class='amount-row big'>" + opts.map(a => "<button class='btn' data-amt='" + a + "'>Nachkauf" + (opts.length > 1 ? " " + eurShort(a) : "") + "</button>").join("") +
    "<button class='btn' id='psOut'>Auszahlen</button></div>");
  $("modal").querySelectorAll("[data-amt]").forEach(b => b.onclick = () => rebuy(p, +b.dataset.amt));
  $("psOut").onclick = () => openCounter(p);
}

// Nachkauf: Betrag oben (wie beim Hinsetzen), Klick auf den Namen bucht sofort. Fehlklick über Rückgängig.
function doCashRebuy() {
  const list = PFCore.seated(C);
  if (!list.length) return toast("Niemand am Tisch");
  openModal("", "<h2>Nachkauf</h2>" + amountRow() +
    "<div class='pick'>" + list.map((p, i) => "<button data-i='" + i + "'>" + escapeHtml(p.name) + "<small>bisher " + eurShort(p.inCents) + "</small></button>").join("") + "</div>");
  const getAmt = bindAmountRow();
  $("modal").querySelectorAll(".pick button").forEach(b => b.onclick = () => rebuy(list[+b.dataset.i], getAmt()));
}
async function rebuy(p, amt) {
  const r = await cmd("c:cash.rebuy", { name: p.name, amount: amt });
  if (r.ok) closeModal();
}

// Auszahlen mit Chip-Zähler
function doCashout() {
  pickPlayer("Auszahlen", "", PFCore.seated(C), p => "eingezahlt " + eurShort(p.inCents), p => openCounter(p));
}
// onDone: nach erfolgreicher Auszahlung (für "Restliche auszahlen"), init: Zählstand beim Zurückkehren aus der Rückfrage
function openCounter(p, onDone, init) {
  const denoms = C.cfg.denoms;
  const counts = Object.fromEntries(denoms.map(d => [d, (init && init[d]) || 0]));
  openModal("", "<h2>Chips zählen: " + escapeHtml(p.name) + "</h2>" +
    "<div class='counter' style='grid-template-columns: repeat(" + denoms.length + ", 1fr)'>" + denoms.map(d =>
      "<div class='denom'><div class='disc'>" + d + "</div><input type='number' min='0' data-d='" + d + "' value='" + counts[d] + "'>" +
      "<div class='steps'><button data-d='" + d + "' data-s='-1'>&minus;</button><button data-d='" + d + "' data-s='1'>+</button></div>" +
      "<div class='sub' id='sub" + d + "'>0,00 €</div></div>").join("") + "</div>" +
    "<div class='total'><span>Auszahlung an " + escapeHtml(p.name) + "<br><span class='muted' id='resLine'></span></span><b id='totalEur'>0 €</b></div>" +
    "<div class='modal-foot'><button class='btn' id='brokeBtn'>Pleite (0 €)</button><span class='spacer'></span><button class='btn primary' id='payBtn'>Auszahlen</button></div>");
  const sumOf = () => denoms.reduce((a, d) => a + counts[d] * d, 0);
  const update = () => {
    denoms.forEach(d => { $("sub" + d).textContent = eur(counts[d] * d); });
    const sum = sumOf(), pay = PFCore.payoutFor(C, sum), res = pay - p.inCents;
    $("totalEur").textContent = eurShort(pay);
    $("resLine").innerHTML = (sum > pay ? "Gezählt " + eur(sum) + ", " + eur(sum - pay) + " bleiben am Tisch<br>" : "") +
      "Eingezahlt " + eurShort(p.inCents) + ", Ergebnis <span class='" + (res >= 0 ? "pos" : "neg") + "'>" + signed(res) + "</span>";
  };
  $("modal").querySelectorAll("input[data-d]").forEach(inp => inp.oninput = () => { counts[inp.dataset.d] = Math.max(0, Math.floor(+inp.value || 0)); update(); });
  $("modal").querySelectorAll(".steps button").forEach(b => b.onclick = () => {
    const d = b.dataset.d;
    counts[d] = Math.max(0, counts[d] + +b.dataset.s);
    $("modal").querySelector("input[data-d='" + d + "']").value = counts[d];
    update();
  });
  const pay = (c, text) => confirmModal(escapeHtml(p.name) + " auszahlen", text, "Auszahlen", async () => {
    const r = await cmd("c:cash.cashout", { name: p.name, counts: c });
    if (r.ok && onDone) onDone();
  }, () => openCounter(p, onDone, counts));
  $("payBtn").onclick = () => {
    const sum = sumOf(), amt = PFCore.payoutFor(C, sum);
    pay(counts, "Auszahlung " + eurShort(amt) + ", Ergebnis " + signed(amt - p.inCents) + "." + (sum > amt ? " " + eur(sum - amt) + " bleiben am Tisch." : ""));
  };
  $("brokeBtn").onclick = () => pay({}, "Pleite: Auszahlung 0 €, Ergebnis " + signed(-p.inCents) + ".");
  update();
  $("modal").querySelector("input[data-d]").select();
}

// Abend beenden: Ergebnisliste und Kassen-Check
function doCashEnd() {
  const totalIn = PFCore.cashIn(C), totalOut = PFCore.cashOut(C);
  const open = PFCore.seated(C);
  const diff = totalIn - totalOut;
  const list = [...C.players].sort((a, b) => a.seated - b.seated || (b.outCents - b.inCents) - (a.outCents - a.inCents));
  openModal("cashend", "<h2>Abend beenden</h2>" +
    "<table class='result-table'><tr><th>Spieler</th><th>Eingezahlt</th><th>Ausgezahlt</th><th>Ergebnis</th></tr>" +
    list.map(p => {
      const r = p.outCents - p.inCents;
      return "<tr><td>" + escapeHtml(p.name) + "</td><td>" + eurShort(p.inCents) + "</td><td>" + (p.seated ? "noch am Tisch" : eurShort(p.outCents)) +
        "</td><td class='" + (p.seated ? "muted" : r >= 0 ? "pos" : "neg") + "'>" + (p.seated ? "-" : signed(r)) + "</td></tr>";
    }).join("") + "</table>" +
    (open.length ? "<div class='check bad'>Noch am Tisch: " + open.map(p => escapeHtml(p.name)).join(", ") + "</div>"
      : diff === 0 ? "<div class='check ok'>Kasse stimmt: eingezahlt " + eurShort(totalIn) + " = ausgezahlt " + eurShort(totalOut) + "</div>"
      : "<div class='check bad'>Differenz " + signed(diff) + ": " + (diff > 0 ? "Geld bleibt übrig, Chips fehlen beim Zählen?" : "Es wurde mehr ausgezahlt als eingezahlt. Zählfehler?") + "</div>") +
    (open.length ? "" : "<div class='wa'>" + waHtml(PFHistory.whatsapp(PFHistory.night(S.cash))) + "</div>") +
    "<div class='modal-foot'>" + (open.length ? "<span class='spacer'></span><button class='btn primary' id='restC'>Restliche auszahlen</button>"
      : "<button class='btn' id='copyC'>Text kopieren</button><span class='spacer'></span><button class='btn primary' id='closeC'>Abend abschließen</button>") + "</div>");
  if (open.length) {
    // Nacheinander für jeden noch Sitzenden zählen, danach zurück zur Übersicht
    const queue = open.map(p => p.name);
    const next = () => {
      const p = queue.length && PFCore.seated(C).find(x => x.name === queue.shift());
      if (p) openCounter(p, next);
      else if (queue.length) next();
      else doCashEnd();
    };
    $("restC").onclick = next;
    return;
  }
  $("copyC").onclick = () => copyText(PFHistory.whatsapp(PFHistory.night(S.cash)));
  const close = async () => {
    const r = await cmd("cash.close");
    if (r.ok) { closeModal(); show("start"); }
  };
  $("closeC").onclick = () => diff === 0 ? close()
    : confirmModal("Kasse stimmt nicht", "Differenz " + signed(diff) + ". Trotzdem abschließen?", "Abschließen", close, doCashEnd);
}
