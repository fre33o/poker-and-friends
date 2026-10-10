// Handy-Fernbedienung (Vorlage: mockup/handy.html).
// Stand kommt per Server-Sent Events vom Laptop, Befehle gehen per POST an dieselbe Befehlsliste wie Tastatur und Menü.
const K = PFCore;
const $ = id => document.getElementById(id);
const fmtNum = n => Number(n).toLocaleString("de-DE");
const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
const eur = cents => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eurShort = cents => cents % 100 === 0 ? fmtNum(cents / 100) + " €" : eur(cents);
const signed = cents => (cents > 0 ? "+" : cents < 0 ? "-" : "±") + eurShort(Math.abs(cents));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const buzz = (p = 12) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

// ---------- Schlüssel und Verbindung ----------
const params = new URLSearchParams(location.search);
let key = params.get("k");
try { if (key) localStorage.setItem("pfKey", key); else key = localStorage.getItem("pfKey"); } catch {}

let S = null, T = null, C = null, offset = 0;
let mode = null;
try { mode = localStorage.getItem("pfMode"); } catch {}

function connected(on, text) {
  $("conn").classList.toggle("off", !on);
  $("connText").textContent = text;
}
function lock(text) {
  if (text) $("lockText").textContent = text;
  $("lock").classList.toggle("on", !!text);
}

function connect() {
  if (!key) return lock("Bitte am Laptop im Steuermenü \"Handy verbinden\" wählen und den QR-Code scannen.");
  const es = new EventSource("events?k=" + encodeURIComponent(key));
  es.onmessage = e => {
    const data = JSON.parse(e.data);
    offset = data.now - Date.now();
    S = data;
    T = data.tournament ? K.replay(data.tournament) : null;
    C = data.cash ? K.replay(data.cash) : null;
    connected(true, "Laptop verbunden");
    lock(null);
    render();
  };
  es.addEventListener("ui", e => { try { onLaptopUi(JSON.parse(e.data)); } catch {} });
  es.onerror = async () => {
    connected(false, "Verbindung weg, verbinde neu…");
    // Falscher Schlüssel (z. B. "Handys trennen" am Laptop): nicht endlos neu versuchen
    try {
      const r = await fetch("cmd?k=" + encodeURIComponent(key), { method: "POST", body: "{}" });
      if (r.status === 403) { es.close(); lock("Dieses Handy ist nicht mehr verbunden. Bitte den QR-Code am Laptop neu scannen."); }
    } catch {}
  };
}

// quiet: keine Meldung, der Aufrufer zeigt selbst eine (Mehrfachauswahl, Umschlag)
async function send(name, payload, undoKind, quiet) {
  buzz();
  try {
    const r = await fetch("cmd?k=" + encodeURIComponent(key), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, payload }) });
    const j = await r.json();
    if (quiet) return j;
    if (!j.ok) toast(j.error, null, true);
    else if (j.msg) toast(j.msg, undoKind);
    return j;
  } catch {
    if (!quiet) toast("Keine Verbindung zum Laptop", null, true);
    return { ok: false, error: "Keine Verbindung zum Laptop" };
  }
}

// ---------- Hinweise ----------
let toastTimer, toastUndo = null;
function toast(text, undoKind, err) {
  $("toastText").textContent = text;
  toastUndo = undoKind || null;
  $("toastUndo").style.display = toastUndo ? "" : "none";
  $("toast").classList.toggle("err", !!err);
  // Bei offenem Auswahlfenster oben anzeigen, damit nichts verdeckt wird
  $("toast").classList.toggle("top", $("sheet").classList.contains("on"));
  $("toast").classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("on"), 4000);
}
$("toastUndo").onclick = () => { const k = toastUndo; $("toast").classList.remove("on"); if (k) send("undo", { kind: k }); };

// ---------- Bottom Sheet (✕ oben rechts, Fußzeile nur mit eigenen Knöpfen) ----------
// Umschlag-Auswahl läuft gespiegelt am Laptop: wird das Fenster geschlossen oder ersetzt, schließt der Laptop mit
let envMirror = false;
function endMirror() { envShowRemote = null; if (envMirror) { envMirror = false; mirror("ui.envclose"); } }
// Nur Anzeige am Laptop, ohne Vibrieren und ohne Meldung
function mirror(name, payload) { fetch("cmd?k=" + encodeURIComponent(key), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, payload: payload || {} }) }).catch(() => {}); }
function openSheet(title, sub, body, end) {
  endMirror();
  $("toast").classList.remove("on");
  $("shTitle").textContent = title;
  $("shSub").textContent = sub || "";
  $("shBody").innerHTML = body;
  $("shBody").scrollTop = 0;
  $("shEnd").innerHTML = end || "";
  $("shEnd").style.display = end ? "" : "none";
  $("sheet").classList.add("on");
  $("sheetBg").classList.add("on");
}
function closeSheet() { endMirror(); $("sheet").classList.remove("on"); $("sheetBg").classList.remove("on"); }
$("sheetBg").onclick = closeSheet;
$("sheet").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });

// Spieler-Kacheln, onPick bekommt den Namen
function tiles(list, info, onPick) {
  const html = list.length
    ? "<div class='tiles'>" + list.map((n, i) => "<button class='tile' data-i='" + i + "'>" + esc(n) + "<small>" + esc(info ? info(n) || "" : "") + "</small></button>").join("") + "</div>"
    : "<div class='step'>Niemand passend</div>";
  setTimeout(() => $("shBody").querySelectorAll(".tile").forEach(b => b.onclick = () => onPick(list[+b.dataset.i])));
  return html;
}
// Kacheln plus Feld für einen neuen Namen
function namePicker(title, sub, list, onPick) {
  openSheet(title, sub, tiles(list, null, onPick) +
    "<div class='add-row'><input id='newName' maxlength='20' placeholder='Neuer Name' autocomplete='off'><button class='btn red' id='newAdd'>OK</button></div>");
  const add = () => { const n = $("newName").value.trim(); if (n) onPick(n); };
  $("newAdd").onclick = add;
  $("newName").onkeydown = e => { if (e.key === "Enter") add(); };
}
// Mehrere Namen antippen (rot markiert, nochmal tippen hebt auf), gesperrte sind ausgegraut.
// opt: top (HTML über den Kacheln), add (Feld für neuen Namen), max (höchstens so viele), locked(n), label(Anzahl), go(Namen)
function multiPicker(title, list, opt) {
  const names = list.slice(), picked = new Set();
  const full = () => opt.max !== undefined && picked.size >= opt.max;
  openSheet(title, "", (opt.top || "") + "<div class='tiles' id='mpTiles'></div>" +
    (opt.add ? "<div class='add-row'><input id='newName' maxlength='20' placeholder='Neuer Name' autocomplete='off'><button class='btn' id='newAdd'>+</button></div>" : ""),
    "<button class='btn red' id='mpGo'></button>");
  const draw = () => {
    $("mpTiles").innerHTML = names.length ? names.map((n, i) => "<button class='tile" + (picked.has(n) ? " on" : "") + "' data-i='" + i + "'" +
      (opt.locked && opt.locked(n) ? " disabled" : "") + ">" + esc(n) + "</button>").join("") : "";
    $("mpTiles").querySelectorAll(".tile").forEach(b => b.onclick = () => {
      buzz();
      const n = names[+b.dataset.i];
      if (picked.has(n)) picked.delete(n);
      else if (full()) return toast("Nur noch " + opt.max + " Plätze frei", null, true);
      else picked.add(n);
      draw();
    });
    $("mpGo").textContent = opt.label(picked.size);
    $("mpGo").disabled = !picked.size;
  };
  if (opt.add) {
    // Neuer Name kommt markiert dazu (in die Spielerliste beim Buchen)
    const add = () => {
      const n = $("newName").value.trim();
      if (!n) return;
      const known = names.find(x => x.toLowerCase() === n.toLowerCase());
      if (known && opt.locked && opt.locked(known)) return toast(known + " sitzt schon am Tisch", null, true);
      if (!picked.has(known) && full()) return toast("Nur noch " + opt.max + " Plätze frei", null, true);
      if (!known) names.push(n);
      picked.add(known || n);
      $("newName").value = "";
      draw();
    };
    $("newAdd").onclick = add;
    $("newName").onkeydown = e => { if (e.key === "Enter") add(); };
  }
  $("mpGo").onclick = () => opt.go(names.filter(n => picked.has(n)));
  draw();
}
// Einen Befehl nacheinander für mehrere Spieler, danach eine gemeinsame Meldung. msg(done, Rückmeldungen)
async function sendAll(cmd, list, payload, msg, undoKind) {
  const done = [], answers = [];
  for (const name of list) {
    const r = await send(cmd, Object.assign({ name }, payload), null, true);
    if (!r.ok) { toast(r.error, null, true); break; }
    done.push(name);
    answers.push(r.msg || "");
  }
  if (done.length) { closeSheet(); toast(msg(done, answers), undoKind); }
}

// ---------- Konfetti bei Jackpot-Umschlägen (wie am Laptop, selbst gezeichnet) ----------
let confettiRun = 0;
function confetti() {
  const cv = $("confetti"), ctx = cv.getContext("2d");
  const w = cv.width = innerWidth, h = cv.height = innerHeight;
  const colors = ["#e0103a", "#ff3b55", "#ffffff", "#f5c542", "#d4a017"];
  const parts = Array.from({ length: 140 }, (_, i) => {
    const left = i % 2 === 0, a = (left ? -70 : -110) * Math.PI / 180 + (Math.random() - .5) * .8, sp = h * (.02 + Math.random() * .014);
    return {
      x: left ? w * .04 : w * .96, y: h * .9, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      s: w * (.018 + Math.random() * .016), r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: colors[i % colors.length], f: Math.random() * 6,
    };
  });
  const run = ++confettiRun, start = performance.now();
  let last = start;
  cv.style.display = "block";
  const step = now => {
    if (run !== confettiRun) return;
    const t = now - start, k = Math.min(3, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      const drag = Math.pow(.985, k);
      p.vy = Math.min(p.vy + h * .00045 * k, h * .005); p.vx *= drag; p.vy *= drag;
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

// ---------- Turnier ----------
const live = () => K.tView(T, Date.now() + offset);
const pInfo = v => n => {
  const p = v.players.find(x => x.name === n);
  if (!p) return "";
  const parts = [];
  if (p.rebuys) parts.push(p.rebuys + " Rebuy" + (p.rebuys > 1 ? "s" : ""));
  if (p.addon) parts.push("Add-On");
  if (p.ko) parts.push(p.ko + " KO");
  return parts.join(", ");
};
const names = list => list.map(p => p.name);
const JACKPOT = 15;

function tReason(v, what) {
  if (v.winner) return "Das Turnier ist entschieden";
  if (what === "rebuy" && !K.isRebuy(v)) return "Rebuy nur bis Level " + v.cfg.rebuyUntil;
  if (what === "addon" && !K.cur(v).brk) return "Add-On nur in der Pause";
  if (what === "addon" && !K.alive(v).some(p => !p.addon)) return "Alle haben schon ein Add-On";
  if (what === "late" && !K.isLate(v)) return "Nachmelden nur bis Level " + v.cfg.lateUntil;
  if (what === "late" && v.players.length >= v.cfg.maxPlayers) return "Tisch voll, maximal " + v.cfg.maxPlayers + " Spieler";
  if (what === "out" && K.alive(v).length < 2) return "Niemand mehr zum Rauswerfen";
  return null;
}
function guard(what, fn) {
  return () => {
    if (!T) return;
    const v = live(), why = tReason(v, what);
    if (why) return toast(why, null, true);
    buzz();
    fn(v);
  };
}
const done = r => { if (r.ok) closeSheet(); };

$("bRebuy").onclick = guard("rebuy", v => openSheet("Rebuy", (v.cfg.buyPrize + v.cfg.buyMystery) + " € · " + fmtNum(v.cfg.buyChips) + " Chips",
  tiles(names(K.alive(v)), pInfo(v), n => send("t:player.rebuy", { name: n }, "tournament").then(done))));

// Add-On für mehrere Spieler auf einmal, wer schon eins hat ist ausgegraut
$("bAddon").onclick = guard("addon", v => {
  const list = K.alive(v);
  multiPicker("Add-On", names(list), {
    locked: n => list.find(p => p.name === n).addon,
    label: k => k > 1 ? k + " Add-Ons buchen" : "Add-On buchen",
    go: sel => sendAll("t:player.addon", sel, {}, d => d.join(", ") + ": Add-On" + (d.length > 1 ? " (" + d.length + "x)" : ""), "tournament"),
  });
});

$("bLate").onclick = guard("late", v => namePicker("Nachzügler", (v.cfg.buyPrize + v.cfg.buyMystery) + " € · " + fmtNum(v.cfg.buyChips) + " Chips",
  S.roster.filter(n => !T.players.some(p => p.name === n)), n => send("t:player.late", { name: n }, "tournament").then(done)));

// Out: wer ist raus, von wem, ab dem Level nach der Pause zieht der Rauswerfer einen Umschlag
$("bOut").onclick = guard("out", outStep1);
function outStep1(v) {
  v = v || live();
  openSheet("Out", "", tiles(names(K.alive(v)), pInfo(v), out => outStep2(out)));
}
function outStep2(out) {
  const v = live(), due = K.envelopeDue(v);
  openSheet(out + " rausgeworfen von", "", tiles(names(K.alive(v).filter(p => p.name !== out)), pInfo(v),
    by => !due ? send("t:player.out", { name: out, by }, "tournament").then(done) : v.envAmounts ? pickEnvelope(out, by) : outStep3(out, by)),
    "<button class='btn ghost' id='back'>Zurück</button>");
  $("back").onclick = () => outStep1();
}
// Digitale Umschläge: Rauswerfer tippt einen geschlossenen an, der Betrag wird aufgedeckt.
// Der Laptop zeigt dieselbe Auswahl, gewählt werden kann an beiden Geräten.
let envShowRemote = null; // deckt auf, wenn am Laptop gewählt wurde
function pickEnvelope(out, by) {
  const v = live(), amounts = v.envAmounts.slice();
  const opened = i => v.envOpened.find(o => o.i === i);
  openSheet(by + " zieht einen Umschlag", "", "<div class='envgrid'>" + amounts.map((_, i) => {
    const o = opened(i);
    return "<button class='env" + (o ? " open" : "") + "' data-i='" + i + "'" + (o ? " disabled" : "") + ">" + (o ? "<span>" + fmtNum(o.amt) + " €</span>" : "") + "</button>";
  }).join("") + "</div>", "<button class='btn ghost' id='back'>Zurück</button>");
  $("back").onclick = () => outStep2(out);
  envMirror = true;
  mirror("ui.envpick", { out, by });
  let busy = false, shown = false;
  const reveal = (i, msg) => {
    if (shown) return;
    shown = true;
    envShowRemote = null;
    const amt = amounts[i], b = $("shBody").querySelector(".env[data-i='" + i + "']");
    $("shTitle").textContent = by + " gewinnt " + fmtNum(amt) + " €";
    $("shBody").querySelectorAll(".env").forEach(e => {
      e.disabled = true;
      if (e === b) { e.classList.add("open", "now"); e.innerHTML = "<span>" + fmtNum(amt) + " €</span>"; }
      else e.classList.add("dim");
    });
    $("shEnd").innerHTML = "<button class='btn red' id='envDone'>Weiter</button>";
    $("envDone").onclick = () => { closeSheet(); toast(msg || by + " zieht einen Umschlag: " + fmtNum(amt) + " €", "tournament"); };
    if (amt >= JACKPOT) { confetti(); buzz([60, 40, 60, 40, 120]); }
  };
  envShowRemote = i => reveal(i);
  $("shBody").querySelectorAll(".env:not(.open)").forEach(b => b.onclick = async () => {
    if (busy || shown) return;
    busy = true;
    const i = +b.dataset.i, r = await send("t:player.out", { name: out, by, envIndex: i }, null, true);
    if (shown) return; // inzwischen am Laptop gewählt
    if (!r.ok) { busy = false; return toast(r.error, null, true); }
    mirror("ui.envshow", { by, i });
    reveal(i, r.msg);
  });
}
// Vom Laptop: dort gewählter Umschlag wird hier aufgedeckt, dort geschlossen schließt hier
function onLaptopUi(ev) {
  if (!envMirror) return;
  if (ev.ui === "ui.envshow" && envShowRemote) envShowRemote(ev.i);
  else if (ev.ui === "ui.envclose") { envMirror = false; envShowRemote = null; closeSheet(); }
}
// Alte Turniere (vor den digitalen Umschlägen): Betrag aus dem Papier-Umschlag eintippen
function outStep3(out, by) {
  let amt = "";
  openSheet("Umschlag für " + by, "", "<div class='step'>Betrag aus dem Umschlag</div><div class='amount' id='amt'>0 €</div><div class='pad'>" +
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].map(k => "<button class='btn" + (k === "✓" ? " red" : "") + "' data-k='" + k + "'>" + k + "</button>").join("") + "</div>",
    "<button class='btn ghost' id='back'>Zurück</button>");
  $("back").onclick = () => outStep2(out);
  $("shBody").querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    buzz();
    if (k === "✓") return send("t:player.out", { name: out, by, envAmount: +amt || 0 }, "tournament").then(done);
    amt = k === "⌫" ? amt.slice(0, -1) : (amt + k).replace(/^0+/, "").slice(0, 3);
    $("amt").textContent = (amt || 0) + " €";
  });
}

function renderTournament() {
  $("tEmpty").style.display = T ? "none" : "";
  $("tBody").style.display = T ? "" : "none";
  if (!T) return;
  const v = live(), s = K.cur(v), rem = v.clock.remaining;
  $("tLevel").innerHTML = s.brk ? "<b>PAUSE</b>" : "LEVEL <b>" + s.level + "</b>";
  document.querySelector("#scrT .status").classList.toggle("brk", !!s.brk);
  $("tTime").textContent = fmtTime(rem);
  $("tTime").classList.toggle("paused", !v.clock.running);
  $("tTime").classList.toggle("warn", v.clock.running && rem <= 60000 && rem > 0);
  $("tBlinds").textContent = s.brk ? "Add-On möglich" : fmtNum(s.sb) + " / " + fmtNum(s.bb) + (s.ante ? " · Ante " + fmtNum(s.ante) : "");
  const n = v.structure[v.clock.idx + 1];
  $("tNext").textContent = !n ? "Letztes Level" : n.brk ? "Danach: Pause " + n.min + " Min" : "Nächstes: " + fmtNum(n.sb) + " / " + fmtNum(n.bb) + (n.ante ? " · Ante " + fmtNum(n.ante) : "");
  $("tHint").textContent = v.winner ? v.winner + " gewinnt!" : !v.clock.running && rem > 0 ? "Uhr angehalten" : s.note || "";
  $("tPlay").innerHTML = v.clock.running ? "&#10074;&#10074;" : "&#9654;";

  const a = K.alive(v).length;
  $("tPlayers").textContent = "SPIELER · " + a + " von " + v.players.length + " im Spiel";
  $("bRebuy").classList.toggle("dim", !!tReason(v, "rebuy"));
  $("bAddon").classList.toggle("dim", !!tReason(v, "addon"));
  $("bLate").classList.toggle("dim", !!tReason(v, "late"));
  $("bOut").classList.toggle("dim", !!tReason(v, "out"));

  $("mPrize").textContent = fmtNum(K.prizePool(v)) + " €";
  $("mMystery").textContent = fmtNum(K.mysteryPool(v)) + " €";
  $("mEntries").textContent = (K.entries(v) - v.players.length) + " / " + K.addons(v);
  const avg = Math.round(K.chipsInPlay(v) / Math.max(1, a));
  const ref = s.brk ? (v.structure[v.clock.idx + 1] || { bb: 0 }) : s;
  $("mAvg").textContent = fmtNum(avg) + (ref.bb ? " (" + Math.round(avg / ref.bb) + " BB)" : "");
  $("mEnv").textContent = v.envTotal === null ? "voraussichtlich " + Math.max(0, a - 1) + ", ab Level " + ((v.structure[K.bountyStartIdx(v)] || {}).level || "-")
    : (v.envTotal - v.envDrawn) + " von " + v.envTotal + " übrig";
}

// ---------- Cash Game ----------
const buyLabel = a => eurShort(a) + " = " + fmtNum(a) + " Chips";
// Mehrere Spieler antippen und zusammen hinsetzen. Wer sitzt, ist ausgegraut. Ab der Schwelle Betrag oben wählen.
$("bJoin").onclick = () => {
  if (!C) return;
  const free = C.cfg.maxSeats - K.seated(C).length;
  if (free <= 0) return toast("Tisch voll, maximal " + C.cfg.maxSeats + " Spieler", null, true);
  buzz();
  const opts = K.buyOptions(C);
  let amt = C.cfg.buyIn;
  multiPicker("Spieler setzt sich", S.roster, {
    add: true, max: free,
    locked: n => K.seated(C).some(p => p.name === n),
    top: opts.length > 1 ? "<div class='row r2 amt'>" + opts.map((a, i) => "<button class='btn" + (i ? "" : " red") + "' data-amt='" + a + "'>" + buyLabel(a) + "</button>").join("") + "</div>" : "",
    label: k => k > 1 ? k + " Spieler hinsetzen" : "Hinsetzen",
    go: sel => sendAll("c:cash.join", sel, { amount: amt }, (d, answers) => {
      const unlock = answers.map(m => m.indexOf("Ab jetzt")).map((p, i) => p >= 0 ? answers[i].slice(p) : "").filter(Boolean).pop();
      return (d.length === 1 ? d[0] + " setzt sich" : d.join(", ") + " setzen sich") + ": " + (d.length > 1 ? "je " : "") + buyLabel(amt) + (unlock ? ". " + unlock : "");
    }, "cash"),
  });
  $("shBody").querySelectorAll("[data-amt]").forEach(b => b.onclick = () => {
    buzz();
    amt = +b.dataset.amt;
    $("shBody").querySelectorAll("[data-amt]").forEach(x => x.classList.toggle("red", x === b));
  });
};
// Nachkauf bucht sofort (Fehlklick über Rückgängig). Sind 20 € frei, je Betrag ein Knopf.
function cashRebuy(name) {
  const opts = K.buyOptions(C);
  if (opts.length < 2) return send("c:cash.rebuy", { name }, "cash");
  buzz();
  openSheet("Nachkauf " + name, "", "<div class='row r2'>" +
    opts.map(a => "<button class='btn big' data-amt='" + a + "'>" + eurShort(a) + "<small>" + fmtNum(a) + " Chips</small></button>").join("") + "</div>");
  $("shBody").querySelectorAll("[data-amt]").forEach(b => b.onclick = () => send("c:cash.rebuy", { name, amount: +b.dataset.amt }, "cash").then(done));
}

// Chips zählen, Auszahlung auf volle 5 € abgerundet (Kern), vor dem Buchen eine Rückfrage. init: Zählstand nach "Abbrechen"
function cashout(name, init) {
  const p = K.seated(C).find(x => x.name === name);
  if (!p) return;
  buzz();
  const denoms = C.cfg.denoms, counts = {};
  denoms.forEach(d => counts[d] = (init && init[d]) || 0);
  openSheet("Auszahlen: " + name, "Eingezahlt " + eurShort(p.inCents),
    "<div class='chips'>" + denoms.map(d => "<div class='chip'><div><div class='v'>" + fmtNum(d) + "</div><div class='s'>" + eur(d) + "</div></div>" +
      "<button class='btn' data-d='" + d + "' data-x='-1'>&minus;</button><div class='c' id='c" + d + "'>" + counts[d] + "</div><button class='btn' data-d='" + d + "' data-x='1'>+</button></div>").join("") +
    "</div><div class='sum'><div><small>Auszahlung</small><b id='pay'>0 €</b></div><div style='text-align:right'><small>Ergebnis</small><b id='res'></b></div></div>" +
    "<div class='rest' id='rest'></div>",
    "<button class='btn' id='brokeBtn'>Pleite (0 €)</button><button class='btn red' id='payBtn'>Auszahlen</button>");
  const sumOf = () => denoms.reduce((a, d) => a + counts[d] * d, 0);
  const calc = () => {
    const sum = sumOf(), pay = K.payoutFor(C, sum), r = pay - p.inCents;
    $("pay").textContent = eurShort(pay);
    $("res").textContent = signed(r);
    $("res").className = r >= 0 ? "plus" : "minus";
    $("rest").textContent = sum > pay ? "Gezählt " + eur(sum) + ", " + eur(sum - pay) + " bleiben am Tisch" : "";
  };
  $("shBody").querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
    const d = +b.dataset.d;
    counts[d] = Math.max(0, counts[d] + +b.dataset.x);
    $("c" + d).textContent = counts[d];
    calc();
  });
  const confirm = (c, text) => {
    buzz();
    openSheet(name + " auszahlen", "", "<div class='confirm'>" + esc(text) + "</div>",
      "<button class='btn' id='noBtn'>Abbrechen</button><button class='btn red' id='okBtn'>Auszahlen</button>");
    $("noBtn").onclick = () => cashout(name, counts);
    $("okBtn").onclick = () => send("c:cash.cashout", { name, counts: c }, "cash").then(done);
  };
  $("payBtn").onclick = () => {
    const sum = sumOf(), amt = K.payoutFor(C, sum);
    confirm(counts, "Auszahlung " + eurShort(amt) + ", Ergebnis " + signed(amt - p.inCents) + "." + (sum > amt ? " " + eur(sum - amt) + " bleiben am Tisch." : ""));
  };
  $("brokeBtn").onclick = () => confirm({}, "Pleite: Auszahlung 0 €, Ergebnis " + signed(-p.inCents) + ".");
  calc();
}

function renderCash() {
  $("cEmpty").style.display = C ? "none" : "";
  $("cBody").style.display = C ? "" : "none";
  if (!C) return;
  const seated = K.seated(C);
  $("cIn").textContent = eurShort(K.cashIn(C));
  $("cKasse").textContent = eurShort(K.cashIn(C) - K.cashOut(C));
  $("cTableLbl").textContent = "AM TISCH · " + seated.length + " / " + C.cfg.maxSeats;
}
// Liste nur bei neuem Stand neu zeichnen, damit Tipps nicht ins Leere gehen
function renderCashList() {
  if (!C) return;
  const list = C.players.slice().sort((a, b) => (b.seated - a.seated));
  $("cList").innerHTML = list.length ? list.map((p, i) => "<div class='p" + (p.seated ? "" : " gone") + "'><div><div class='n'>" + esc(p.name) + "</div><div class='d'>Eingezahlt " + eurShort(p.inCents) +
    (p.cashedOut ? " · Ausgezahlt " + eurShort(p.outCents) : "") + "</div></div>" +
    (p.seated ? "<div class='acts'><button class='btn' data-rebuy='" + i + "'>Nachkauf</button><button class='btn red' data-out='" + i + "'>Auszahlen</button></div>" : "<div class='d'>gegangen</div>") +
    "</div>").join("") : "<div class='step'>Noch niemand am Tisch.</div>";
  $("cList").querySelectorAll("[data-rebuy]").forEach(b => b.onclick = () => cashRebuy(list[+b.dataset.rebuy].name));
  $("cList").querySelectorAll("[data-out]").forEach(b => b.onclick = () => cashout(list[+b.dataset.out].name));
}

// ---------- Gemeinsam ----------
function setMode(m, remember) {
  mode = m;
  if (remember) try { localStorage.setItem("pfMode", m); } catch {}
  $("segT").classList.toggle("on", m === "t");
  $("segC").classList.toggle("on", m === "c");
  $("scrT").classList.toggle("on", m === "t");
  $("scrC").classList.toggle("on", m === "c");
}
document.querySelectorAll(".seg button").forEach(b => b.onclick = () => { buzz(); setMode(b.dataset.mode, true); });
document.querySelectorAll("[data-cmd]").forEach(b => b.onclick = () => send(b.dataset.cmd, {}));
$("bUndo").onclick = () => send("undo", { kind: mode === "c" ? "cash" : "tournament" });
$("bSound").onclick = () => S && send("settings.sound", { on: !S.sound });

function render() {
  if (!S) return;
  // Ohne eigene Wahl: das laufende Spiel zeigen
  if (!mode || (mode === "t" && !T && C) || (mode === "c" && !C && T)) setMode(T || !C ? "t" : "c");
  else setMode(mode);
  $("segT").innerHTML = "Turnier" + (T ? "<span class='dot'></span>" : "");
  $("segC").innerHTML = "Cash Game" + (C ? "<span class='dot'></span>" : "");
  $("bSound").textContent = S.sound ? "🔊 Ton an" : "🔇 Ton aus";
  renderTournament();
  renderCash();
  renderCashList();
}
setInterval(() => { if (S) { renderTournament(); renderCash(); } }, 250);

// Bildschirm anlassen, wo der Browser es erlaubt
let wakeLock = null;
async function keepAwake() {
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen"); } catch {}
}
document.addEventListener("visibilitychange", keepAwake);
keepAwake();

connect();
