// Rauchtest der echten App: klickt einen Abend durch und speichert Screenshots.
// Aufruf: node scripts/with-cache.js electron test/smoke.js <Ausgabeordner>
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", ".smoke"));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
process.env.PF_DATA_DIR = path.join(out, "data");

const errors = [];
app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (e) => { if (e.level === "error" || e.level === 3) errors.push(e.message); });
  let started = false;
  win.webContents.on("did-finish-load", () => !started && (started = true) && run(win).catch(e => { console.error("ABBRUCH", e); app.exit(1); }));
});
require("../src/main/main.js");

const wait = ms => new Promise(r => setTimeout(r, ms));
async function run(win) {
  win.unmaximize();
  win.setContentSize(1600, 900);
  await wait(800);
  const js = code => win.webContents.executeJavaScript(code);
  const shot = async name => {
    await wait(500);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, name + ".png"), img.toPNG());
    console.log("Screenshot " + name);
  };
  const key = async (k, mods = []) => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: k, modifiers: mods });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: k, modifiers: mods });
    await wait(250);
  };
  const c = (name, payload) => js("pf.cmd(" + JSON.stringify(name) + "," + JSON.stringify(payload || {}) + ")");
  const check = async (name, payload) => {
    const r = await c(name, payload);
    if (!r.ok) throw new Error(name + ": " + r.error);
    return r;
  };

  await shot("01-start");

  // Check-in
  await key("T");
  await shot("02-checkin-leer");
  for (const n of ["Max", "Anna", "Tom", "Lisa", "Ben", "Julia", "Paul", "Sarah", "Nina", "Zoe"]) await check("roster.add", { name: n });
  await check("roster.rename", { name: "Zoe", to: "Aaron" });
  await check("roster.remove", { name: "Aaron" });
  if ((await js("S.roster.join()")) !== "Anna,Ben,Julia,Lisa,Max,Nina,Paul,Sarah,Tom") throw new Error("Spielerliste nicht alphabetisch: " + (await js("S.roster.join()")));
  await js("['Max','Anna','Tom','Lisa','Ben','Julia','Paul','Sarah'].forEach(n => selected.add(n)); drawCheckin()");
  await shot("03-checkin");
  await js("document.getElementById('startBtn').click()");
  await wait(400);
  await shot("04-uhr-start");

  // Uhr starten, Rebuy per Dialog
  await key("Space");
  await check("t:player.rebuy", { name: "Max" });
  await key("R");
  await shot("05-rebuy-dialog");
  await key("Escape");
  await key("I");
  await shot("06-uhr-laeuft-geld");
  await key("I");

  // Menü
  await js("toggleMenu('t')");
  await shot("07-menue");
  await js("closeMenus()");

  // Nachzügler und Pause
  await check("t:player.late", { name: "Nina" });
  for (let i = 0; i < 4; i++) await key("Right");
  await check("t:player.addon", { name: "Anna" });
  await shot("08-pause");

  // Einstellungen
  await key("E");
  await shot("09-einstellungen");
  await js("document.querySelector('.tabs button[data-tab=money]').click()");
  await shot("10-einstellungen-geld");
  await key("Escape");

  // Level 5: Bounty, Rauswurf
  await key("Right");
  await check("t:player.out", { name: "Paul", by: "Max" });
  await key("Z", ["control"]);
  const st = await js("T.players.filter(p => p.out).length");
  if (st !== 0) throw new Error("Rückgängig hat nicht gewirkt");
  await check("t:player.out", { name: "Paul", by: "Max" });
  await key("O");
  await shot("11-out-dialog");
  await key("Escape");
  await key("I");
  await shot("12-bounty-geld");
  await key("I");

  // Bis zum Sieger
  for (const [n, by] of [["Sarah", "Anna"], ["Julia", "Max"], ["Ben", "Tom"], ["Lisa", "Max"], ["Nina", "Anna"], ["Tom", "Anna"]]) await check("t:player.out", { name: n, by });
  await check("t:player.out", { name: "Anna", by: "Max" });
  await wait(800);
  await shot("13-sieger");
  await key("Escape");

  // Cash Game
  await key("G");
  await shot("14-cash-leer");
  for (const n of ["Max", "Anna", "Tom", "Lisa"]) await check("c:cash.join", { name: n });
  await check("c:cash.rebuy", { name: "Tom" });
  // 20-€-Stufe: 4 Spieler x 20 € = 80 € Schwelle
  for (const n of ["Lisa", "Max", "Anna"]) await check("c:cash.rebuy", { name: n });
  if (!(await js("C.bigUnlocked"))) throw new Error("20-€-Einkauf nicht freigeschaltet");
  await key("R");
  await wait(300);
  await shot("14b-nachkauf-10-20");
  await js("document.querySelectorAll('[data-amt]')[1].click(); [...document.querySelectorAll('.pick button')].find(b => b.textContent.startsWith('Max')).click()");
  await wait(300);
  if ((await js("C.players.find(p => p.name === 'Max').inCents")) !== 4000) throw new Error("Nachkauf 20 € fehlt");
  await key("N");
  await shot("14c-hinsetzen-10-20");
  await key("Escape");
  await check("c:cash.cashout", { name: "Anna", counts: { 5: 4, 100: 3, 1000: 1 } });
  await key("C");
  await js("document.querySelector('.pick button').click()");
  await wait(300);
  await js("document.querySelectorAll('.steps button[data-s=\"1\"]')[6].click(); document.querySelectorAll('.steps button[data-s=\"1\"]')[4].click()");
  await shot("15-chipzaehler");
  await key("Escape");
  await shot("16-cash");
  await key("X");
  await shot("17-abend-beenden");
  await key("Escape");

  // Neustart simulieren: Stand muss aus den Dateien wiederkommen
  win.webContents.reload();
  await wait(1500);
  await shot("18-start-fortsetzen");

  // Abende abschließen, Historie ansehen, WhatsApp-Text kopieren
  await js("show('tournament')");
  await key("X");
  await shot("19-sieger-whatsapp");
  await js("document.getElementById('copyT').click()");
  await wait(300);
  const { clipboard } = require("electron");
  const clip = await clipboard.readText();
  if (!/🏆 \*Max\* gewinnt!/.test(clip)) throw new Error("WhatsApp-Text nicht in der Zwischenablage: " + clip);
  await js("document.getElementById('closeT').click()");
  await wait(400);
  for (const n of ["Max", "Tom", "Lisa"]) await check("c:cash.cashout", { name: n, counts: { 1000: 1 } });
  await js("show('cash')");
  await key("X");
  await shot("20-abend-beenden-whatsapp");
  await js("document.getElementById('closeC').click()");
  await wait(400);
  await shot("20b-rueckfrage-differenz");
  await js("document.getElementById('confirmOk').click()");
  await wait(400);
  await key("V");
  await wait(500);
  await shot("21-historie-turnier");
  await js("document.querySelector('.hist-tab[data-tab=rc]').click()");
  await shot("22-historie-cash");
  await js("document.querySelector('.hist-tab[data-tab=ab]').click()");
  await shot("23-historie-abende");
  await js("document.querySelectorAll('.night')[1].click()");
  await shot("24-historie-abend-2");
  await key("Escape");
  const v = await js("view");
  if (v !== "start") throw new Error("Esc führt nicht zurück zum Start");

  const files = fs.readdirSync(path.join(out, "data", "daten", "abende"));
  console.log("Gespeicherte Abende: " + files.join(", "));
  console.log(errors.length ? "Konsolenfehler:\n" + errors.join("\n") : "Keine Konsolenfehler");
  app.exit(errors.length ? 1 : 0);
}
