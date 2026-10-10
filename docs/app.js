// Gemeinsame Grundlagen der Oberfläche: Zustand vom Hauptprozess, Befehle, Dialoge, Ton, Tasten
const $ = id => document.getElementById(id);
const fmtNum = n => Number(n).toLocaleString("de-DE");
const fmtTime = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};
const fmtClock = ts => new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtDate = ts => new Date(ts).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " + fmtClock(ts);
const eur = cents => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eurShort = cents => cents % 100 === 0 ? (cents / 100).toLocaleString("de-DE") + " €" : eur(cents);
const signed = cents => (cents > 0 ? "+" : cents < 0 ? "-" : "±") + eurShort(Math.abs(cents));
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- Zustand ----------
// S = Stand vom Hauptprozess, T/C = daraus berechnete Spielzustände (gleicher Kern wie im Hauptprozess)
let S = null, T = null, C = null;
let view = "start";
const views = {};          // start, tournament, cash: { keys, actions, render, onShow }
const stateListeners = [];  // werden nach jedem neuen Stand aufgerufen

function setSnapshot(snap) {
  const prevT = T;
  S = snap;
  T = snap.tournament ? PFCore.replay(snap.tournament) : null;
  C = snap.cash ? PFCore.replay(snap.cash) : null;
  if ((view === "tournament" && !T) || (view === "cash" && !C)) show("start");
  stateListeners.forEach(fn => fn(prevT));
  if (modalRefresh) modalRefresh();
  renderView();
}

async function cmd(name, payload) {
  const r = await pf.cmd(name, payload);
  if (!r.ok) toast(r.error);
  else if (r.msg) toast(r.msg);
  return r;
}

function show(v) {
  view = v;
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === v));
  document.body.classList.forEach(c => { if (c.startsWith("view-")) document.body.classList.remove(c); });
  document.body.classList.add("view-" + v);
  closeMenus();
  if (views[v] && views[v].onShow) views[v].onShow();
  renderView();
}
function renderView() {
  if (S && views[view]) views[view].render(Date.now());
}

// ---------- Hinweise ----------
let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3500);
}

// ---------- Ton ----------
// Sounds aus der Hörprobe (Auswahl frie 2026-10-10), Quellen in sounds/QUELLEN.txt.
// gain gleicht die Lautstärke an (gemessen, der Gong ist von Haus aus sehr laut).
let audio;
function audioCtx() {
  audio = audio || new AudioContext();
  if (audio.state === "suspended") audio.resume();
  return audio;
}
const SOUNDS = {
  level: { file: "level-gong.mp3", gain: 0.6 },        // Levelwechsel (nicht bei Pause)
  start: { file: "start-shuffle.ogg", gain: 1.2 },     // Uhr startet
  envelope: { file: "envelope-coin.mp3", gain: 1 },    // Umschlag unter 15 €
  jackpot: { file: "jackpot-fanfare.mp3", gain: 1.6 }, // Umschlag ab 15 €
};
function sfx(name) {
  if (!S || !S.settings.sound) return;
  const s = SOUNDS[name], a = audioCtx(), el = new Audio("sounds/" + s.file), g = a.createGain();
  g.gain.value = s.gain;
  a.createMediaElementSource(el).connect(g).connect(a.destination);
  el.play().catch(() => {});
}
// Ton-Ausgabe bei einem Klick freischalten (Browser erlaubt Audio erst nach Nutzeraktion)
function unlockAudio() { if (S && S.settings.sound) audioCtx(); }

// ---------- Dialoge ----------
let modalOpen = false;
let modalRefresh = null; // Dialoge, die sich bei neuem Stand neu zeichnen
let modalOnClose = null;
function openModal(cls, html) {
  modalOpen = true;
  modalRefresh = null;
  modalOnClose = null;
  $("modal").className = "modal " + (cls || "");
  $("modal").innerHTML = html;
  $("modalBg").classList.add("show");
}
function closeModal() {
  if (!modalOpen) return;
  modalOpen = false;
  modalRefresh = null;
  $("modalBg").classList.remove("show");
  const fn = modalOnClose;
  modalOnClose = null;
  if (fn) fn();
}
// Schließen: X oben rechts in jedem Dialog, dazu Abbrechen-Knöpfe (data-close) in Sicherheitsabfragen
$("modalX").onclick = e => { e.currentTarget.blur(); closeModal(); };
$("modal").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeModal(); });

// Spieler-Auswahl als Kacheln
function pickPlayer(title, hint, list, info, onPick) {
  if (!list.length) return toast("Niemand passend");
  openModal("", "<h2>" + title + "</h2>" + (hint ? "<p>" + hint + "</p>" : "") + "<div class='pick'>" +
    list.map((p, i) => "<button data-i='" + i + "'>" + escapeHtml(p.name) + "<small>" + (info(p) || "&nbsp;") + "</small></button>").join("") +
    "</div>");
  $("modal").querySelectorAll(".pick button").forEach(b => b.onclick = () => { closeModal(); onPick(list[+b.dataset.i]); });
}

// Sicherheitsabfrage. onCancel läuft bei Abbrechen, X und Esc (z. B. zurück zum vorigen Dialog).
function confirmModal(title, text, okLabel, onOk, onCancel) {
  openModal("", "<h2>" + title + "</h2><p>" + text + "</p><div class='modal-foot'><button class='btn' data-close>Abbrechen</button>" +
    "<button class='btn primary' id='confirmOk'>" + okLabel + "</button></div>");
  modalOnClose = onCancel || null;
  $("confirmOk").onclick = () => { modalOnClose = null; closeModal(); onOk(); };
}

// ---------- Steuermenüs ----------
function closeMenus() {
  document.querySelectorAll(".menubar.show").forEach(m => m.classList.remove("show"));
  document.querySelectorAll("[id$=MenuBtn]").forEach(b => b.classList.remove("active"));
}
function toggleMenu(prefix) {
  const on = $(prefix + "Menubar").classList.toggle("show");
  $(prefix + "MenuBtn").classList.toggle("active", on);
}
// Menü schließt bei Klick auf eine freie Fläche, solange kein Dialog offen ist
document.addEventListener("click", e => {
  if (modalOpen) return;
  const open = document.querySelector(".menubar.show");
  if (!open) return;
  if (e.composedPath().some(el => el.classList && (el.classList.contains("menubar") || (el.id || "").endsWith("MenuBtn")))) return;
  closeMenus();
});

// Menüeinträge und Kopfzeilen-Buttons geben den Fokus ab, damit die Leertaste nicht doppelt auslöst
function bindMenu(prefix, v) {
  $(prefix + "Menubar").querySelectorAll("button").forEach(b => b.onclick = () => { b.blur(); views[v].actions[b.dataset.act](); });
  $(prefix + "MenuBtn").onclick = e => { e.currentTarget.blur(); toggleMenu(prefix); };
}

// ---------- Tasten ----------
const commonActions = {
  full: () => cmd("window.fullscreen"),
  mute: () => cmd("settings.sound", { on: !S.settings.sound }),
};
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (modalOpen) closeModal();
    else if (document.querySelector(".menubar.show")) closeMenus();
    else if (view === "history") views.history.actions.back();
    return;
  }
  if (modalOpen || !S) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (views[view].actions.undo) views[view].actions.undo();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === "F11") { e.preventDefault(); commonActions.full(); return; }
  const v = views[view];
  const act = v.keys[e.key] || v.keys[e.key.toLowerCase()];
  if (!act) return;
  e.preventDefault();
  v.actions[act]();
});

// Mauszeiger nach 3 Sekunden ohne Bewegung ausblenden
let cursorTimer;
document.addEventListener("mousemove", () => {
  document.body.classList.remove("hide-cursor");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add("hide-cursor"), 3000);
});
