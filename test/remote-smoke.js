// Rauchtest der Handy-Fernbedienung: startet die App, öffnet die Handy-Seite in einem zweiten Fenster
// (Handy-Größe) und steuert Turnier und Cash Game darüber. Speichert Screenshots.
// Aufruf: node scripts/with-cache.js electron test/remote-smoke.js <Ausgabeordner>
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", ".smoke-remote"));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
process.env.PF_DATA_DIR = path.join(out, "data");
process.env.PF_PORT = process.env.PF_PORT || "4748";

const errors = [];
let main = null;
app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", e => { if (e.level === "error" || e.level === 3) errors.push(e.message); });
  if (main) return;
  main = win;
  let started = false;
  win.webContents.on("did-finish-load", () => !started && (started = true) && run(win).catch(e => { console.error("ABBRUCH", e); app.exit(1); }));
});
require("../src/main/main.js");

const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (ok, msg) => { if (!ok) throw new Error(msg); console.log("ok   " + msg); };

async function run(win) {
  win.unmaximize();
  win.setContentSize(1600, 900);
  await wait(800);
  const js = (w, code) => w.webContents.executeJavaScript(code);
  const shot = async (w, name) => {
    await wait(500);
    fs.writeFileSync(path.join(out, name + ".png"), (await w.webContents.capturePage()).toPNG());
    console.log("Screenshot " + name);
  };
  const check = async (name, payload) => {
    const r = await js(win, "pf.cmd(" + JSON.stringify(name) + "," + JSON.stringify(payload || {}) + ")");
    if (!r.ok) throw new Error(name + ": " + r.error);
  };
  const state = () => js(win, "pf.state()");

  // Turnier mit 8 Spielern, Cash Game mit 2 Spielern
  const names = ["Max", "Anna", "Tom", "Lisa", "Ben", "Julia", "Paul", "Sarah"];
  await check("tournament.start", { names, template: "Rebuy Mystery Bounty" });
  await check("roster.add", { name: "Nina" });
  await check("cash.start");
  await check("c:cash.join", { name: "Max" });
  await check("c:cash.join", { name: "Anna" });
  await js(win, "show('tournament')");

  // Laptop: Dialog "Handy verbinden"
  await js(win, "openHandy()");
  await wait(1500);
  await shot(win, "01-laptop-qr");
  const qrOk = await js(win, "!!document.querySelector('#handyBox svg')");
  assert(qrOk, "QR-Code wird angezeigt");
  const key = JSON.parse(fs.readFileSync(path.join(out, "data", "daten", "handy.json"), "utf8")).key;
  const base = "http://127.0.0.1:" + process.env.PF_PORT + "/";

  // Sicherheit: falscher Schlüssel und gesperrte Befehle
  const post = (k, body) => fetch(base + "cmd?k=" + k, { method: "POST", body: JSON.stringify(body) });
  assert((await post("falsch", { name: "t:clock.toggle" })).status === 403, "Falscher Schlüssel wird abgewiesen");
  const blocked = await (await post(key, { name: "tournament.close" })).json();
  assert(!blocked.ok && /Laptop/.test(blocked.error), "Turnier beenden ist am Handy gesperrt");

  // Handy-Fenster
  const phone = new BrowserWindow({ width: 400, height: 860, show: true, webPreferences: { contextIsolation: true } });
  phone.setContentSize(390, 844);
  phone.setAlwaysOnTop(true); phone.focus();
  await phone.loadURL(base + "?k=" + key);
  await wait(1500);
  await shot(phone, "02-handy-turnier");
  assert(await js(phone, "document.getElementById('connText').textContent === 'Laptop verbunden'"), "Handy ist verbunden");
  const laptopInfo = await js(win, "pf.remoteInfo()");
  assert(laptopInfo.connected === 1, "Laptop zählt 1 verbundenes Handy");
  await js(win, "closeModal()");

  // Uhr starten vom Handy
  await js(phone, "document.getElementById('tPlay').click()");
  await wait(600);
  let s = await state();
  assert(s.tournament.log.some(e => e.type === "clock.toggle"), "Start/Pause vom Handy kommt am Laptop an");

  // Rebuy über Kacheln
  await js(phone, "document.getElementById('bRebuy').click()");
  await wait(400);
  await shot(phone, "03-handy-rebuy");
  await js(phone, "[...document.querySelectorAll('.tile')].find(b => b.textContent.startsWith('Tom')).click()");
  await wait(600);
  await shot(phone, "04-handy-toast");
  s = await state();
  assert(s.tournament.log.some(e => e.type === "player.rebuy" && e.name === "Tom"), "Rebuy Tom vom Handy");
  await shot(win, "05-laptop-nach-rebuy");

  // Rückgängig über die Meldung
  await js(phone, "document.getElementById('toastUndo').click()");
  await wait(600);
  s = await state();
  assert(!s.tournament.log.some(e => e.type === "player.rebuy"), "Rückgängig vom Handy");

  // Nachzügler mit neuem Namen
  await js(phone, "document.getElementById('bLate').click()");
  await wait(300);
  await js(phone, "document.getElementById('newName').value = 'Olaf'; document.getElementById('newAdd').click()");
  await wait(600);
  s = await state();
  assert(s.tournament.log.some(e => e.type === "player.late" && e.name === "Olaf"), "Nachzügler Olaf vom Handy");

  // Zur Pause und Level 5 springen, dann Out mit digitalem Umschlag
  for (let i = 0; i < 5; i++) await check("t:clock.next");
  await wait(600);
  await js(phone, "document.getElementById('bOut').click()");
  await wait(300);
  await shot(phone, "06-handy-out-1");
  await js(phone, "[...document.querySelectorAll('.tile')].find(b => b.textContent.startsWith('Paul')).click()");
  await wait(300);
  await js(phone, "[...document.querySelectorAll('.tile')].find(b => b.textContent.startsWith('Anna')).click()");
  await wait(300);
  await shot(phone, "07-handy-out-umschlag");
  await wait(300);
  assert(await js(win, "!!document.querySelector('#modal.envpick') && envMirror && modalOpen"), "Umschlag-Auswahl erscheint auch am Laptop");
  await shot(win, "07b-laptop-umschlag-gespiegelt");
  await js(phone, "document.querySelector('#shBody .env[data-i=\"1\"]').click()");
  await wait(600);
  s = await state();
  const outE = s.tournament.log.find(e => e.type === "player.out");
  assert(outE && outE.name === "Paul" && outE.by === "Anna" && outE.envIndex === 1, "Out Paul von Anna mit Umschlag 2");
  assert(await js(win, "/Anna gewinnt/.test(document.querySelector('#modal h2').textContent)"), "Laptop deckt denselben Umschlag auf");
  await shot(win, "07c-laptop-umschlag-aufgedeckt");
  await js(phone, "document.getElementById('envDone').click()");
  await wait(500);
  assert(await js(win, "!modalOpen"), "Weiter am Handy schließt den Dialog am Laptop");
  // Umgekehrt: am Handy geöffnet, am Laptop gewählt
  await js(phone, "document.getElementById('bOut').click()");
  await wait(300);
  await js(phone, "[...document.querySelectorAll('.tile')].find(b => b.textContent.startsWith('Ben')).click()");
  await wait(300);
  await js(phone, "[...document.querySelectorAll('.tile')].find(b => b.textContent.startsWith('Tom')).click()");
  await wait(500);
  await js(win, "document.querySelector('#modal .env-big[data-i=\"3\"]').click()");
  await wait(800);
  s = await state();
  const out2 = s.tournament.log.filter(e => e.type === "player.out").pop();
  assert(out2 && out2.name === "Ben" && out2.by === "Tom" && out2.envIndex === 3, "Umschlag am Laptop gewählt");
  assert(await js(phone, "/Tom gewinnt/.test(document.getElementById('shTitle').textContent) && !!document.querySelector('#shBody .env.now[data-i=\"3\"]')"), "Handy deckt denselben Umschlag auf");
  await shot(phone, "07d-handy-laptop-hat-gewaehlt");
  await js(win, "document.getElementById('envDone').click()");
  await wait(600);
  assert(await js(phone, "!document.getElementById('sheet').classList.contains('on')"), "Weiter am Laptop schließt das Fenster am Handy");
  await shot(phone, "08-handy-level5");

  // Cash Game
  await js(phone, "document.getElementById('segC').click()");
  await wait(400);
  await shot(phone, "09-handy-cash");
  await js(phone, "document.querySelector('[data-out]').click()");
  await wait(300);
  await js(phone, "for (let i = 0; i < 3; i++) document.querySelector('[data-d=\"500\"][data-x=\"1\"]').click(); document.querySelector('[data-d=\"10\"][data-x=\"1\"]').click()");
  await shot(phone, "10-handy-chipzaehler");
  await js(phone, "document.getElementById('payBtn').click()");
  await wait(300);
  await js(phone, "document.getElementById('okBtn').click()");
  await wait(600);
  s = await state();
  const co = s.cash.log.find(e => e.type === "cash.cashout");
  assert(co && co.counts["500"] === 3 && co.counts["10"] === 1, "Auszahlung mit Chip-Zähler vom Handy (15,10 €)");
  await shot(phone, "11-handy-cash-nach");

  // 20-€-Stufe: 2 Spieler x 20 € = 40 € Schwelle, Anna kauft zweimal 10 € nach
  await check("c:cash.rebuy", { name: "Anna" });
  await check("c:cash.rebuy", { name: "Anna" });
  await wait(500);
  await js(phone, "document.querySelector('[data-rebuy]').click()");
  await wait(400);
  await shot(phone, "11b-handy-nachkauf-10-20");
  await js(phone, "document.querySelectorAll('[data-amt]')[1].click()");
  await wait(600);
  s = await state();
  const big = s.cash.log.filter(e => e.type === "cash.rebuy").pop();
  assert(big && big.amount === 2000, "Nachkauf 20 € vom Handy");

  // Handys trennen: Handy verliert den Zugang
  await js(win, "pf.remoteReset()");
  await wait(3500);
  await shot(phone, "12-handy-getrennt");
  assert(await js(phone, "document.getElementById('lock').classList.contains('on')"), "Nach 'Handys trennen' ist das Handy gesperrt");

  const own = errors.filter(e => !/favicon|net::ERR|navigator.vibrate/.test(e));
  assert(!own.length, "Keine Konsolenfehler" + (own.length ? ": " + own.join(" | ") : ""));
  console.log("\nRauchtest Handy bestanden");
  app.exit(0);
}
