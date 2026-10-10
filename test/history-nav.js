// Rauchtest: Historie aus Cash Game und Turnier öffnen, Zurück führt in den Ausgangsbereich.
// Aufruf: node scripts/with-cache.js electron test/history-nav.js <Ausgabeordner>
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", ".smoke-nav"));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
process.env.PF_DATA_DIR = path.join(out, "data");

const errors = [];
app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", e => { if (e.level === "error" || e.level === 3) errors.push(e.message); });
  let started = false;
  win.webContents.on("did-finish-load", () => !started && (started = true) && run(win).catch(e => { console.error("FEHLER", e.message); app.exit(1); }));
});
require("../src/main/main.js");

const wait = ms => new Promise(r => setTimeout(r, ms));
async function run(win) {
  await wait(800);
  const js = code => win.webContents.executeJavaScript(code);
  const key = async k => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: k });
    win.webContents.sendInputEvent({ type: "char", keyCode: k });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: k });
    await wait(300);
  };
  const expect = async (want, step) => {
    const v = await js("view");
    if (v !== want) throw new Error(step + ": erwartet " + want + ", ist " + v);
    console.log("ok   " + step + " -> " + v);
  };
  // Cash Game starten (Taste G), dann Historie per Taste V und zurück per Esc
  await key("g"); await expect("cash", "Cash Game geöffnet");
  await key("v"); await expect("history", "Historie aus Cash Game (Taste V)");
  await key("Escape"); await expect("cash", "Esc zurück ins Cash Game");
  // Historie über das Menü, zurück über den Button
  await js("document.querySelector('#cMenubar [data-act=history]').click()"); await expect("history", "Historie aus Cash-Menü");
  await js("$('historyBack').click()"); await expect("cash", "Zurück-Button ins Cash Game");
  // Turnier-Menü: Eintrag vorhanden und Taste V gebunden
  const t = await js("[!!document.querySelector('#tMenubar [data-act=history]'), views.tournament.keys.v, typeof views.tournament.actions.history]");
  if (!t[0] || t[1] !== "history" || t[2] !== "function") throw new Error("Turnier-Menü ohne Historie: " + t);
  console.log("ok   Turnier-Menü hat Historie (Taste V)");
  // Von Start aus: zurück landet auf Start
  await js("show('start')"); await key("v"); await key("v"); await expect("start", "Start -> Historie -> V zurück");
  if (errors.length) throw new Error("Konsole: " + errors.join(" | "));
  console.log("Alles gut");
  app.exit(0);
}
