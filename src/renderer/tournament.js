// Turnier-Uhr (Vorlage: mockup/uhr.html)
const K = PFCore;

views.tournament = {
  keys: {
    " ": "toggle", ArrowRight: "next", ArrowLeft: "prev", ArrowUp: "plus", ArrowDown: "minus",
    r: "rebuy", a: "addon", o: "out", n: "late", i: "info", g: "cash", v: "history", e: "settings", f: "full", m: "mute", x: "end", h: "handy",
  },
  actions: {
    toggle: () => { unlockAudio(); cmd("t:clock.toggle"); },
    next: () => cmd("t:clock.next"),
    prev: () => cmd("t:clock.prev"),
    plus: () => cmd("t:clock.plus"),
    minus: () => cmd("t:clock.minus"),
    rebuy: doRebuy, addon: doAddon, out: doOut, late: doLate,
    undo: () => cmd("undo", { kind: "tournament" }),
    settings: openSettings,
    cash: () => views.start.actions.cash(),
    history: () => openHistory(),
    end: doEnd,
    info: () => { const on = $("pools").classList.toggle("show"); $("infoBtn").classList.toggle("active", on); },
    full: commonActions.full,
    mute: commonActions.mute,
    handy: () => openHandy(),
    roster: () => openRoster(),
  },
  render: renderTournament,
};
bindMenu("t", "tournament");
$("infoBtn").onclick = e => { e.currentTarget.blur(); views.tournament.actions.info(); };
$("breakAddonRow").onclick = () => doAddon();
// Klick auf die große Uhr startet sie (Play-Symbol) oder hält sie an
$("cdWrap").onclick = () => { if (T && !T.winner) views.tournament.actions.toggle(); };
// Geld-Fenster schließt bei Klick daneben, solange kein Dialog offen ist
document.addEventListener("click", e => {
  if (modalOpen || !$("pools").classList.contains("show")) return;
  if (e.composedPath().some(el => el.id === "pools" || el.id === "infoBtn")) return;
  views.tournament.actions.info();
});

function renderTournament(now) {
  if (!T) return;
  const v = K.tView(T, now);
  const s = K.cur(v);
  const rem = v.clock.remaining;
  $("tournament").classList.toggle("on-break", !!s.brk);
  $("levelTag").innerHTML = s.brk ? "<span>PAUSE</span>" : "LEVEL <span>" + s.level + "</span>";
  $("phase").textContent = v.winner ? "Turnier entschieden" : s.brk ? "Add-On möglich" : K.isRebuy(v) ? "Rebuy-Phase" : K.bountyActive(v) ? "Mystery Bounty aktiv" : "Kein Rebuy mehr";
  $("phase").className = "phase" + (K.isRebuy(v) ? " rebuy" : "");
  $("countdown").textContent = fmtTime(rem);
  $("countdown").classList.toggle("warn", v.clock.running && rem <= 60000 && rem > 0);
  $("countdown").classList.toggle("paused", !v.clock.running);
  $("pausedHint").classList.toggle("show", !v.clock.running && !v.winner && rem > 0);
  $("playIcon").classList.toggle("show", !v.clock.running && !v.winner && rem > 0);
  $("cdWrap").style.cursor = v.winner ? "default" : "";
  $("progress").style.width = Math.max(0, 100 - rem / (s.min * 600)) + "%";

  if (!s.brk) {
    $("blinds").textContent = fmtNum(s.sb) + " / " + fmtNum(s.bb);
    $("ante").textContent = s.ante ? "ANTE " + fmtNum(s.ante) + " (BB)" : "";
    const n = v.structure[v.clock.idx + 1];
    $("next").innerHTML = !n ? "Letztes Level"
      : n.brk ? "Danach: <b>Pause " + n.min + " Min</b>"
      : "Nächstes Level: <b>" + fmtNum(n.sb) + " / " + fmtNum(n.bb) + "</b>" + (n.ante ? " &middot; Ante " + fmtNum(n.ante) : "") + (n.min !== s.min ? " &middot; " + n.min + " Min" : "");
  } else {
    $("breakAddon").textContent = v.cfg.addonPrice + " € = " + fmtNum(v.cfg.addonChips) + " Chips";
    $("breakNoteRow").style.display = s.note ? "" : "none";
    $("breakNote").textContent = s.note || "";
    $("breakEnv").textContent = K.mysteryPool(v) + " € auf " + Math.max(0, K.alive(v).length - 1) + " Umschläge";
  }

  $("prize").textContent = fmtNum(K.prizePool(v)) + " €";
  $("payout").innerHTML = K.payouts(v).map((x, i) => "<span>" + (i + 1) + ". Platz</span><span>" + fmtNum(x) + " €</span>").join("");

  $("mystery").textContent = fmtNum(K.mysteryPool(v)) + " €";
  const fixed = v.envTotal !== null;
  const total = fixed ? v.envTotal : Math.max(0, K.alive(v).length - 1);
  // Digitale Umschläge: geöffnete zeigen klein den gezogenen Betrag, alte Turniere nur gezogen/offen
  $("envelopes").innerHTML = Array.from({ length: total }, (_, i) => {
    const o = v.envAmounts && v.envOpened.find(x => x.i === i);
    return o ? "<div class='env open'><span>" + fmtNum(o.amt) + "</span></div>"
      : "<div class='env" + (!fixed ? " pending" : !v.envAmounts && i < v.envDrawn ? " drawn" : "") + "'></div>";
  }).join("");
  $("envLabel").textContent = fixed ? "UMSCHLÄGE " + (v.envTotal - v.envDrawn) + " / " + v.envTotal : "UMSCHLÄGE (voraussichtlich " + total + ")";
  const bs = v.structure[K.bountyStartIdx(v)];
  $("envText").textContent = fixed
    ? (v.envTotal - v.envDrawn ? "Wer rauswirft, zieht einen Umschlag" : "Alle Umschläge gezogen")
    : "Gefüllt in der Pause, ab Level " + (bs ? bs.level : "-");

  const a = K.alive(v).length;
  $("sPlayers").innerHTML = a + " <small>/ " + v.players.length + "</small>";
  const avg = Math.round(K.chipsInPlay(v) / Math.max(1, a));
  const ref = s.brk ? (v.structure[v.clock.idx + 1] || v.structure[v.clock.idx - 1] || { bb: 0 }) : s;
  $("sAvg").innerHTML = fmtNum(avg) + (ref.bb ? " <small>" + Math.round(avg / ref.bb) + " BB</small>" : "");
  $("sRebuys").textContent = K.entries(v) - v.players.length;
  $("sAddons").textContent = K.addons(v);

  const b = K.breakIdx(v);
  if (b >= 0 && v.clock.idx < b) {
    let ms = rem;
    for (let i = v.clock.idx + 1; i < b; i++) ms += v.structure[i].min * 60000;
    const m = Math.ceil(ms / 60000);
    $("sNextLabel").textContent = "Pause in";
    $("sNext").innerHTML = Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + " <small>h</small>";
  } else {
    $("sNextLabel").textContent = "Ende ca.";
    $("sNext").innerHTML = fmtClock(K.forecastEnd(v, now)) + " <small>Uhr</small>";
  }
  $("tWalltime").textContent = fmtClock(now);
}

// ---------- Levelwechsel, Uhr-Start, Sieger ----------
let seen = { id: null, idx: 0 };
function tournamentTick(now) {
  if (!T) { seen.id = null; return; }
  const v = K.tView(T, now);
  if (seen.id === T.id && v.clock.idx > seen.idx) announce(v);
  seen.id = T.id;
  seen.idx = v.clock.idx;
  if (settingsOpen) refreshSettingsLive(v);
}
function announce(v) {
  const s = K.cur(v);
  if (!s.brk) sfx("level");
  if (s.brk) toast("Pause: Rebuy-Phase beendet, Add-On jetzt möglich");
  else if (s.note) toast("Level " + s.level + ": " + s.note);
  else toast("Level " + s.level + ": " + fmtNum(s.sb) + " / " + fmtNum(s.bb));
  const box = $("blindsBox");
  box.classList.remove("flash");
  void box.offsetWidth;
  box.classList.add("flash");
}
stateListeners.push(prevT => {
  // Uhr startet (auch vom Handy): Karten mischen
  if (T && prevT && prevT.id === T.id && !prevT.clock.running && T.clock.running) sfx("start");
  if (T && prevT && prevT.id === T.id && !prevT.winner && T.winner) {
    // Letzter Umschlag wird noch aufgedeckt: Sieger erst nach dem Schließen zeigen
    if (envReveal) winnerPending = true;
    else setTimeout(showWinner, 400);
  }
});

// ---------- Check-in: Wer spielt heute? ----------
let selected = new Set(), checkinTemplate = null, focusCheckinInput = false;
function openCheckin() {
  selected = new Set();
  const names = S.templates.map(t => t.name);
  checkinTemplate = names.includes(S.settings.lastTemplate) ? S.settings.lastTemplate : names[0];
  openModal("checkin", "");
  drawCheckin();
  modalRefresh = drawCheckin;
}
function drawCheckin() {
  const tpl = S.templates.find(t => t.name === checkinTemplate) || K.DEFAULT_TEMPLATE;
  const cfg = Object.assign({}, K.DEFAULT_TEMPLATE.cfg, tpl.cfg);
  const min = cfg.minPlayers, max = cfg.maxPlayers;
  [...selected].forEach(n => { if (!S.roster.includes(n)) selected.delete(n); });
  const n = selected.size;
  const chips = S.roster.length
    ? S.roster.map((name, i) => "<button class='chip" + (selected.has(name) ? " on" : "") + "' data-i='" + i + "'>" + escapeHtml(name) +
      "</button>").join("")
    : "<span class='empty'>Noch keine Spieler in der Stammliste. Namen unten eintragen.</span>";
  const tplSelect = S.templates.length > 1
    ? "<div class='tpl-row'>Vorlage <select id='tplSel'>" + S.templates.map(t => "<option" + (t.name === tpl.name ? " selected" : "") + ">" + escapeHtml(t.name) + "</option>").join("") + "</select></div>"
    : "";
  $("modal").innerHTML =
    "<h2>&spades; Wer spielt heute?</h2>" + tplSelect +
    "<div class='chips'>" + chips + "</div>" +
    "<div class='add-row'><input id='newName' placeholder='Neuer Spieler, Enter zum Hinzufügen' maxlength='20'><button class='btn' id='addName'>Hinzufügen</button></div>" +
    "<div class='checkin-foot'><span>Heute dabei: <b>" + n + "</b> / " + max +
    (n < min ? " &middot; noch " + (min - n) + " fehlen" : "") + "</span>" +
    "<span class='right'><button class='btn primary' id='startBtn'" + (n < min ? " disabled" : "") + ">Turnier starten</button></span></div>";

  const m = $("modal");
  m.querySelectorAll(".chip").forEach(c => c.onclick = () => {
    const name = S.roster[+c.dataset.i];
    if (selected.has(name)) selected.delete(name);
    else if (selected.size >= max) return toast("Maximal " + max + " Spieler");
    else selected.add(name);
    drawCheckin();
  });
  if ($("tplSel")) $("tplSel").onchange = e => { checkinTemplate = e.target.value; drawCheckin(); };
  const add = () => {
    const name = $("newName").value.trim().slice(0, 20);
    if (!name) return;
    if (selected.size < max) selected.add(name); else toast("Maximal " + max + " Spieler");
    focusCheckinInput = true;
    if (S.roster.includes(name)) drawCheckin(); else cmd("roster.add", { name });
  };
  $("addName").onclick = add;
  $("newName").onkeydown = e => { if (e.key === "Enter") add(); };
  $("startBtn").onclick = async () => {
    const names = S.roster.filter(x => selected.has(x));
    const r = await cmd("tournament.start", { names, template: tpl.name });
    if (r.ok) { closeModal(); show("tournament"); }
  };
  if (focusCheckinInput || !S.roster.length) $("newName").focus();
  focusCheckinInput = false;
}
// ---------- Spieler-Aktionen ----------
function info(p) {
  const parts = [];
  if (p.rebuys) parts.push(p.rebuys + "x Rebuy");
  if (p.addon) parts.push("Add-On");
  if (p.ko) parts.push(p.ko + " KO");
  return parts.join(", ");
}
function liveView() { return K.tView(T, Date.now()); }

function doRebuy() {
  const v = liveView();
  if (v.winner) return toast("Das Turnier ist entschieden");
  if (!K.isRebuy(v)) return toast("Rebuy nur bis Level " + v.cfg.rebuyUntil);
  pickPlayer("Rebuy", "", K.alive(v), info, p => cmd("t:player.rebuy", { name: p.name }));
}

// Nachzügler: gleicher Buy-in, voller Startstack, bis Level cfg.lateUntil
function doLate() {
  const v = liveView();
  if (v.winner) return toast("Das Turnier ist entschieden");
  if (!K.isLate(v)) return toast("Nachmelden nur bis Level " + v.cfg.lateUntil);
  if (v.players.length >= v.cfg.maxPlayers) return toast("Tisch voll, maximal " + v.cfg.maxPlayers + " Spieler");
  const join = async name => { const r = await cmd("t:player.late", { name }); if (r.ok) closeModal(); };
  const draw = () => {
    const free = S.roster.filter(n => !T.players.some(p => p.name === n));
    $("modal").innerHTML =
      "<h2>Nachzügler einchecken</h2>" +
      "<div class='chips'>" + (free.length ? free.map((n, i) => "<button class='chip' data-i='" + i + "'>" + escapeHtml(n) + "</button>").join("")
        : "<span class='empty'>Alle aus der Stammliste spielen schon mit.</span>") + "</div>" +
      "<div class='add-row'><input id='lateName' placeholder='Neuer Spieler, Enter zum Einchecken' maxlength='20'><button class='btn primary' id='lateAdd'>Einchecken</button></div>";
    $("modal").querySelectorAll(".chip").forEach(c => c.onclick = () => join(free[+c.dataset.i]));
    const add = () => { const name = $("lateName").value.trim(); if (name) join(name); };
    $("lateAdd").onclick = add;
    $("lateName").onkeydown = e => { if (e.key === "Enter") add(); };
    if (!free.length) $("lateName").focus();
  };
  openModal("checkin", "");
  draw();
}

function doAddon() {
  const v = liveView();
  if (v.winner) return toast("Das Turnier ist entschieden");
  if (!K.cur(v).brk) return toast("Add-On nur in der Pause");
  const list = K.alive(v);
  if (!list.some(p => !p.addon)) return toast("Alle haben schon ein Add-On");
  // Mehrere Spieler antippen (wer schon ein Add-On hat, ist ausgegraut), dann gemeinsam buchen
  const picked = new Set();
  openModal("checkin", "<h2>Add-On</h2><div class='chips' id='addonChips'></div>" +
    "<div class='modal-foot'><button class='btn primary' id='addonGo'></button></div>");
  const draw = () => {
    $("addonChips").innerHTML = list.map((p, i) => "<button class='chip" + (picked.has(p.name) ? " on" : "") + "' data-i='" + i + "'" +
      (p.addon ? " disabled title='hat schon ein Add-On'" : "") + ">" + escapeHtml(p.name) + "</button>").join("");
    $("addonChips").querySelectorAll(".chip").forEach(c => c.onclick = () => {
      const n = list[+c.dataset.i].name;
      if (picked.has(n)) picked.delete(n); else picked.add(n);
      draw();
    });
    $("addonGo").textContent = picked.size > 1 ? picked.size + " Add-Ons buchen" : "Add-On buchen";
    $("addonGo").disabled = !picked.size;
  };
  $("addonGo").onclick = async () => {
    const done = [];
    for (const p of list.filter(x => picked.has(x.name))) {
      const r = await pf.cmd("t:player.addon", { name: p.name });
      if (!r.ok) { toast(r.error); break; }
      done.push(p.name);
    }
    if (!done.length) return;
    closeModal();
    toast(done.join(", ") + ": Add-On" + (done.length > 1 ? " (" + done.length + "x)" : ""));
  };
  draw();
}

function doOut() {
  const v = liveView();
  if (v.winner) return toast("Das Turnier ist entschieden");
  if (K.alive(v).length < 2) return;
  pickPlayer("Out", "", K.alive(v), info, out => {
    const others = K.alive(v).filter(p => p.name !== out.name);
    const bounty = K.envelopeDue(v);
    const next = by => !bounty ? cmd("t:player.out", { name: out.name, by: by.name })
      : v.envAmounts ? pickEnvelope(out.name, by.name) : askEnvelope(out.name, by.name);
    pickPlayer(escapeHtml(out.name) + " rausgeworfen von", "", others, info, next);
  });
}

// Digitale Umschläge: Rauswerfer wählt einen geschlossenen Umschlag, der Betrag wird aufgedeckt
let envReveal = false, winnerPending = false;
const JACKPOT = 15;

// Konfetti in Rot, Weiß und Gold, selbst gezeichnet (offline, ohne Bibliothek)
let confettiRun = 0;
function confetti() {
  const cv = $("confetti"), ctx = cv.getContext("2d");
  const w = cv.width = innerWidth, h = cv.height = innerHeight;
  const colors = ["#e0103a", "#ff3b55", "#ffffff", "#f5c542", "#d4a017"];
  const parts = Array.from({ length: 220 }, (_, i) => {
    const left = i % 2 === 0, a = (left ? -60 : -120) * Math.PI / 180 + (Math.random() - .5) * .9, sp = h * (.022 + Math.random() * .016);
    return {
      x: left ? w * .02 : w * .98, y: h * .85, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      s: h * (.008 + Math.random() * .008), r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: colors[i % colors.length], f: Math.random() * 6,
    };
  });
  const run = ++confettiRun, start = performance.now();
  let last = start;
  cv.style.display = "block";
  const step = now => {
    if (run !== confettiRun) return;
    const t = now - start, k = Math.min(3, (now - last) / 16.7); // zeitbasiert, gleich schnell bei 60 und 144 Hz
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      const drag = Math.pow(.985, k);
      p.vy = Math.min(p.vy + h * .00045 * k, h * .005); p.vx *= drag; p.vy *= drag; // langsam herabflattern
      p.x += p.vx * k; p.y += p.vy * k; p.r += p.vr * k; p.f += .15 * k;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (4500 - t) / 900));
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s * .3 * Math.abs(Math.cos(p.f)), p.s, p.s * .6 * Math.abs(Math.cos(p.f)) + 1);
      ctx.restore();
    }
    if (t < 4500) requestAnimationFrame(step);
    else { ctx.clearRect(0, 0, w, h); cv.style.display = "none"; }
  };
  requestAnimationFrame(step);
}
// mirror: Auswahl kommt vom Handy. Gewählt werden kann am Handy oder am Laptop, das andere Gerät deckt denselben Umschlag auf.
// Schließen auf einer Seite schließt auch die andere.
let envMirror = false, envFromPhone = false;
function envClosed() {
  if (envMirror && !envFromPhone) pf.remoteUi({ ui: "ui.envclose" });
  envReveal = envMirror = envFromPhone = false;
  if (winnerPending) { winnerPending = false; setTimeout(showWinner, 200); }
}
function pickEnvelope(name, by, mirror) {
  const v = liveView();
  const opened = i => v.envOpened.find(o => o.i === i);
  openModal("envpick", "<h2>" + escapeHtml(by) + " zieht einen Umschlag</h2><div class='envgrid'>" +
    v.envAmounts.map((_, i) => {
      const o = opened(i);
      return "<button class='env-big" + (o ? " open" : "") + "' data-i='" + i + "'" + (o ? " disabled" : "") + ">" +
        (o ? "<span>" + fmtNum(o.amt) + " €</span>" : "") + "</button>";
    }).join("") + "</div>");
  if (mirror) {
    envMirror = true;
    envReveal = true; // Sieger erst nach dem Aufdecken zeigen
    modalOnClose = envClosed;
  }
  $("modal").querySelectorAll(".env-big:not(.open)").forEach(b => b.onclick = async () => {
    envReveal = true; // vor dem Befehl, falls der neue Stand (mit Sieger) vor der Antwort ankommt
    const i = +b.dataset.i, r = await pf.cmd("t:player.out", { name, by, envIndex: i });
    if (!r.ok) { if (!mirror) envReveal = false; return toast(r.error); }
    if (mirror) pf.remoteUi({ ui: "ui.envshow", by, i });
    revealEnvelope(by, liveView().envAmounts[i], i);
  });
}
function revealEnvelope(by, amt, i) {
  $("modal").querySelector("h2").textContent = by + " gewinnt " + fmtNum(amt) + " €";
  $("modal").querySelectorAll(".env-big").forEach(b => {
    b.disabled = true;
    if (+b.dataset.i === i) { b.classList.add("open", "drawn-now"); b.innerHTML = "<span>" + fmtNum(amt) + " €</span>"; }
    else b.classList.add("dim");
  });
  // Jackpot (ab 15 €): Konfetti und Fanfare, sonst Münze
  if (amt >= JACKPOT) { confetti(); sfx("jackpot"); }
  else sfx("envelope");
  $("modal").insertAdjacentHTML("beforeend", "<div class='modal-foot'><button class='btn primary' id='envDone'>Weiter</button></div>");
  modalOnClose = envClosed;
  $("envDone").onclick = closeModal;
  $("envDone").focus();
}
// Umschlag-Auswahl vom Handy: öffnen, aufdecken (Betrag aus dem eigenen Stand), schließen
function remoteEnvelope(ev) {
  if (ev.ui === "ui.envpick" && T && liveView().envAmounts) pickEnvelope(ev.out, ev.by, true);
  else if (ev.ui === "ui.envshow" && envMirror) {
    const amt = liveView().envAmounts[ev.i];
    if (amt !== undefined && !$("envDone")) revealEnvelope(ev.by, amt, ev.i);
  } else if (ev.ui === "ui.envclose" && envMirror) { envFromPhone = true; closeModal(); }
}
// Ab Level 5: Betrag aus dem gezogenen Umschlag eintragen (leer = ohne Betrag)
function askEnvelope(name, by) {
  openModal("", "<h2>Umschlag für " + escapeHtml(by) + "</h2><p>Welcher Betrag war im Umschlag?</p>" +
    "<div class='add-row'><input id='envAmt' type='number' min='0' max='999' placeholder='Betrag in €, Enter zum Speichern'><button class='btn primary' id='envOk'>Speichern</button></div>");
  const ok = async () => {
    const r = await cmd("t:player.out", { name, by, envAmount: Math.max(0, Math.floor(+$("envAmt").value || 0)) });
    if (r.ok) closeModal();
  };
  $("envOk").onclick = ok;
  $("envAmt").onkeydown = e => { if (e.key === "Enter") ok(); };
  $("envAmt").focus();
}

function resultTable(v) {
  const p = K.payouts(v);
  const ranked = v.players.filter(x => x.place && x.place <= p.length).sort((a, b) => a.place - b.place);
  const envs = v.players.filter(x => x.envs).sort((a, b) => b.envs - a.envs);
  return "<table>" + ranked.map(x => "<tr><td>" + x.place + ". Platz</td><td>" + escapeHtml(x.name) + "</td><td>" + fmtNum(p[x.place - 1]) + " €</td></tr>").join("") + "</table>" +
    (envs.length ? "<div class='envs'>Umschläge: " + envs.map(x => escapeHtml(x.name) + " " + x.envs + (x.envSum ? " (" + fmtNum(x.envSum) + " €)" : "")).join(", ") + "</div>" : "");
}
function showWinner() {
  if (!T || !T.winner) return;
  const v = liveView();
  const text = PFHistory.whatsapp(PFHistory.night(S.tournament));
  $("toast").classList.remove("show");
  openModal("winner", "<h2>&spades; " + escapeHtml(v.winner) + " gewinnt!</h2>" +
    "<div class='cols'><div>" + resultTable(v) + "</div><div class='wa'>" + waHtml(text) + "</div></div>" +
    "<div class='modal-foot'><button class='btn' id='copyT'>Text kopieren</button><span class='spacer'></span><button class='btn primary' id='closeT'>Turnier abschließen</button></div>");
  $("copyT").onclick = () => copyText(text);
  $("closeT").onclick = closeTournament;
}
async function closeTournament() {
  const r = await cmd("tournament.close");
  if (r.ok) { closeModal(); show("start"); }
}
function doEnd() {
  if (T.winner) return showWinner();
  confirmModal("Turnier beenden?", "Es gibt noch keinen Sieger. Das Turnier wird abgeschlossen und gespeichert, weiterspielen geht danach nicht mehr.",
    "Turnier beenden", closeTournament);
}

// ---------- Einstellungen ----------
let draft, draftCfg, tab = "struct", settingsOpen = false, tplNaming = false;
function openSettings() {
  draft = K.clone(T.structure);
  draftCfg = K.clone(T.cfg);
  settingsOpen = true;
  tplNaming = false;
  openModal("settings", "");
  modalOnClose = () => { settingsOpen = false; };
  drawSettings();
}
function drawSettings() {
  const idx = liveView().clock.idx;
  const tabs = "<div class='tabs'><button data-tab='struct' class='" + (tab === "struct" ? "active" : "") + "'>Blindstruktur</button>" +
    "<button data-tab='money' class='" + (tab === "money" ? "active" : "") + "'>Geld &amp; Chips</button></div>";
  const head = "<div class='set-head'><h2>Einstellungen</h2><div class='live' id='setLive'></div></div>";
  const body = "<div class='set-body'>" + (tab === "struct" ? structHtml(idx) : moneyHtml()) + "</div>";
  const sum = draftCfg.payout.reduce((a, b) => a + (+b || 0), 0);
  const foot = "<div class='set-foot'>" +
    (tab === "struct" && !tplNaming ? "<button class='btn' data-add='level'>+ Level am Ende</button><button class='btn' data-add='break'>+ Pause am Ende</button>" : "") +
    "<span class='spacer'></span>" +
    (sum !== 100 ? "<span class='warn-text'>Auszahlung ergibt " + sum + " % statt 100 %</span>" : "") +
    (tplNaming
      ? "<input id='tplName' maxlength='40' placeholder='Name der Vorlage' value='" + escapeHtml(T.templateName || "") + "'><button class='btn primary' data-act='tplSave'>Vorlage speichern</button><button class='btn' data-act='tplCancel'>Zurück</button>"
      : "<button class='btn' data-act='template'>Als Vorlage speichern</button>" +
        "<button class='btn primary' data-act='apply'" + (sum !== 100 ? " disabled" : "") + ">Übernehmen</button>") +
    "</div>";
  const scroll = $("modal").querySelector(".set-body");
  const top = scroll ? scroll.scrollTop : 0;
  $("modal").innerHTML = head + tabs + body + foot;
  $("modal").querySelector(".set-body").scrollTop = top;
  bindSettings();
  refreshSettingsLive(liveView());
  if (tplNaming) $("tplName").select();
}
function structHtml(idx) {
  K.renumber(draft);
  const b = draft.findIndex(x => x.brk);
  let rows = "";
  draft.forEach((s, i) => {
    const locked = i < idx;
    const cls = (s.brk ? "brk " : "") + (i === idx ? "current " : "") + (locked ? "past" : "");
    const dis = locked ? " disabled" : "";
    const tag = i === idx ? "<span class='tag'>LÄUFT</span>" : (!s.brk && s.level <= draftCfg.rebuyUntil && (b < 0 || i < b)) ? "<span class='tag'>REBUY</span>" : "";
    const num = f => "<input type='number' min='0' data-i='" + i + "' data-f='" + f + "' value='" + s[f] + "'" + dis + ">";
    rows += "<tr class='" + cls + "'><td class='name'>" + (s.brk ? "Pause" : "Level " + s.level) + tag + "</td>" +
      (s.brk ? "<td></td><td></td><td></td>" : "<td>" + num("sb") + "</td><td>" + num("bb") + "</td><td>" + num("ante") + "</td>") +
      "<td>" + num("min") + "</td>" +
      "<td><input class='note' data-i='" + i + "' data-f='note' value='" + escapeHtml(s.note || "") + "' placeholder='z.B. Color-Up'" + dis + "></td>" +
      "<td style='white-space:nowrap'>" + (locked ? "" :
        "<button class='rowbtn' data-ins='level' data-i='" + i + "' title='Level danach einfügen'>+ Level</button>" +
        "<button class='rowbtn' data-ins='break' data-i='" + i + "' title='Pause danach einfügen'>+ Pause</button>" +
        (i === idx ? "" : "<button class='rowbtn' data-del='" + i + "' title='Löschen'>&times;</button>")) + "</td></tr>";
  });
  return "<table class='struct'><tr><th></th><th>Small Blind</th><th>Big Blind</th><th>Ante (BB)</th><th>Minuten</th><th>Hinweis (wird angesagt)</th><th></th></tr>" + rows + "</table>" +
    "<p class='hint'>Vergangene Levels sind gesperrt. Änderungen am laufenden Level wirken sofort, die Uhr läuft im Hintergrund weiter.</p>";
}
function moneyHtml() {
  const c = draftCfg;
  const f = (label, key, unit, idx) => "<div class='field'><span>" + label + "</span><span><input type='number' min='0' data-cfg='" + key + "'" +
    (idx !== undefined ? " data-idx='" + idx + "'" : "") + " value='" + (idx !== undefined ? c[key][idx] : c[key]) + "'> " + unit + "</span></div>";
  return "<div class='form'>" +
    "<div class='group'><h3>Buy-in und Rebuy</h3>" + f("Anteil Preispool", "buyPrize", "€") + f("Anteil Mystery-Pool", "buyMystery", "€") + f("Startchips", "buyChips", "Chips") +
      "<div class='field'><span>Rebuy möglich bis</span><span>Level <input type='number' min='0' data-cfg='rebuyUntil' value='" + c.rebuyUntil + "'></span></div>" +
      "<div class='field'><span>Nachmeldung möglich bis</span><span>Level <input type='number' min='0' data-cfg='lateUntil' value='" + c.lateUntil + "'></span></div>" +
      "<p class='hint'>Buy-in gesamt: " + ((+c.buyPrize || 0) + (+c.buyMystery || 0)) + " €. Rebuy kostet gleich viel und gibt gleich viele Chips, nur bei 0 Chips.</p></div>" +
    "<div class='group'><h3>Add-On</h3>" + f("Preis", "addonPrice", "€") + f("Chips", "addonChips", "Chips") +
      "<p class='hint'>Nur in der Pause, einmal pro Spieler, geht komplett in den Preispool.</p></div>" +
    "<div class='group'><h3>Auszahlung</h3>" + f("1. Platz", "payout", "%", 0) + f("2. Platz", "payout", "%", 1) + f("3. Platz", "payout", "%", 2) +
      "<div class='field'><span>Rundung</span><span><select data-cfg='rounding'><option value='1'" + (c.rounding == 1 ? " selected" : "") + ">auf 1 €</option><option value='5'" +
      (c.rounding == 5 ? " selected" : "") + ">auf 5 €</option></select></span></div>" +
      "<p class='hint'>Rest durch Rundung geht an Platz 1.</p></div>" +
    "<div class='group'><h3>Mystery Bounty</h3><p class='hint'>Kopfgeld gilt ab dem ersten Level nach der Pause. Anzahl Umschläge = Spieler zu diesem Zeitpunkt minus 1.</p></div>" +
    "</div>";
}
function bindSettings() {
  const m = $("modal");
  m.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { tab = b.dataset.tab; drawSettings(); });
  m.querySelectorAll("input[data-f]").forEach(inp => inp.onchange = () => {
    const s = draft[+inp.dataset.i], f = inp.dataset.f;
    if (f === "note") { if (inp.value.trim()) s.note = inp.value.trim(); else delete s.note; return; }
    const v = Math.max(0, Math.round(+inp.value || 0));
    if (f === "bb" && s.ante === s.bb) s.ante = v; // Ante folgt dem BB, solange sie gleich waren
    if (f === "bb" && s.sb === s.bb / 2) s.sb = Math.round(v / 2);
    s[f] = f === "min" ? Math.max(1, v) : v;
    drawSettings();
  });
  m.querySelectorAll("[data-cfg]").forEach(inp => inp.onchange = () => {
    const k = inp.dataset.cfg, v = Math.max(0, +inp.value || 0);
    if (inp.dataset.idx !== undefined) draftCfg[k][+inp.dataset.idx] = v; else draftCfg[k] = v;
    drawSettings();
  });
  m.querySelectorAll("[data-ins]").forEach(b => b.onclick = () => insertRow(+b.dataset.i + 1, b.dataset.ins));
  m.querySelectorAll("[data-add]").forEach(b => b.onclick = () => insertRow(draft.length, b.dataset.add));
  m.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { draft.splice(+b.dataset.del, 1); drawSettings(); });
  const on = (act, fn) => { const el = m.querySelector("[data-act=" + act + "]"); if (el) el.onclick = fn; };
  on("template", () => { tplNaming = true; drawSettings(); });
  on("tplCancel", () => { tplNaming = false; drawSettings(); });
  on("tplSave", async () => {
    const r = await cmd("template.save", { name: $("tplName").value, structure: draft, cfg: draftCfg });
    if (r.ok) { tplNaming = false; drawSettings(); }
  });
  if ($("tplName")) $("tplName").onkeydown = e => { if (e.key === "Enter") m.querySelector("[data-act=tplSave]").click(); };
  on("apply", async () => {
    const r = await cmd("t:settings.apply", { structure: draft, cfg: draftCfg });
    if (r.ok) closeModal();
  });
}
function insertRow(at, kind) {
  if (kind === "break") draft.splice(at, 0, { brk: true, min: 10 });
  else {
    const prev = draft.slice(0, at).reverse().find(s => !s.brk) || { bb: 10, min: 30 };
    const bb = prev.bb * 2;
    draft.splice(at, 0, { sb: bb / 2, bb, ante: bb, min: prev.min });
  }
  drawSettings();
}
function refreshSettingsLive(v) {
  const el = $("setLive");
  if (!el) return;
  const s = K.cur(v);
  el.innerHTML = "Uhr " + (v.clock.running ? "läuft weiter" : "angehalten") + ": <b>" + (s.brk ? "Pause" : "Level " + s.level) + " &middot; " + fmtTime(v.clock.remaining) + "</b>";
}
