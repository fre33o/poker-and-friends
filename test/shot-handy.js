// Screenshots der Handy-Steuerung zur Sichtpruefung (Turnier, Pause, Out mit Umschlag, Cash Game, Dialoge).
// Startet die App, oeffnet die Handy-Seite in einem schmalen Fenster (412x915) und steuert darueber.
// Aufruf: node scripts/with-cache.js electron test/shot-handy.js <Ausgabeordner>
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", ".smoke-handy"));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
process.env.PF_DATA_DIR = path.join(out, "data");
process.env.PF_PORT = process.env.PF_PORT || "4748";

const wait = ms => new Promise(r => setTimeout(r, ms));
let main = null;
app.on("browser-window-created", (_e, win) => {
  if (main) return;
  main = win;
  let done = false;
  win.webContents.on("did-finish-load", async () => {
    if (done) return; done = true;
    try { await run(win); } catch (e) { console.error("ABBRUCH", e); }
    app.exit(0);
  });
});
require("../src/main/main.js");

async function run(win) {
  win.setFullScreen(false); win.setContentSize(1280, 720);
  await wait(1000);
  const lap = s => win.webContents.executeJavaScript(s);
  const cmd = async (name, payload) => {
    const r = await lap("pf.cmd(" + JSON.stringify(name) + "," + JSON.stringify(payload || {}) + ")");
    if (!r.ok) throw new Error(name + ": " + r.error);
  };

  for (const n of ["Anna", "Ben", "Clara", "Dani", "Eric", "Flo", "Jana", "Max", "Tom"]) await cmd("roster.add", { name: n });
  await lap("openHandy()"); await wait(1200);
  const key = JSON.parse(fs.readFileSync(path.join(out, "data", "daten", "handy.json"), "utf8")).key;
  await lap("closeModal()");

  const phone = new BrowserWindow({ width: 430, height: 960, show: true, webPreferences: { contextIsolation: true } });
  phone.setContentSize(412, 915);
  phone.setAlwaysOnTop(true); phone.show(); phone.focus();
  await phone.loadURL("http://127.0.0.1:" + process.env.PF_PORT + "/?k=" + key);
  await wait(1500);
  const js = s => phone.webContents.executeJavaScript(s);
  const shot = async name => { await wait(500); fs.writeFileSync(path.join(out, name + ".png"), (await phone.webContents.capturePage()).toPNG()); console.log(name); };
  const click = sel => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const tile = async name => { await js(`[...document.querySelectorAll("#shBody .tile")].find(b => b.firstChild.textContent === "${name}").click()`); await wait(150); };
  const close = () => js("closeSheet()");

  // Nichts laeuft
  await shot("01-leer-turnier");
  await click("#segC"); await shot("02-leer-cash");
  await click("#segT");

  // Turnier mit 7 Spielern
  await cmd("tournament.start", { names: ["Anna", "Ben", "Clara", "Dani", "Eric", "Flo", "Jana"], template: "Rebuy Mystery Bounty" });
  await wait(600);
  await shot("03-turnier-angehalten");
  await click("#tPlay"); await shot("04-turnier-laeuft");
  await click("#bRebuy"); await shot("05-rebuy");
  await tile("Anna"); await shot("06-nach-rebuy-meldung");
  await click("#bLate"); await shot("07-nachzuegler");
  await close();
  await click("#bOut"); await shot("08-out-wer");
  await tile("Jana"); await shot("09-out-von-wem");
  await tile("Anna"); await wait(300);
  await click("#bAddon"); await shot("10-addon-ausserhalb-pause");


  // Pause, Add-On fuer mehrere
  for (let i = 0; i < 4; i++) await cmd("t:clock.next");
  await wait(500); await shot("11-pause");
  await click("#bAddon"); await shot("12-addon");
  await tile("Ben"); await tile("Clara"); await tile("Eric"); await shot("12b-addon-drei-gewaehlt");
  await click("#mpGo"); await wait(400); await shot("12c-nach-addon");
  await click("#bAddon"); await shot("12d-addon-ausgegraut");
  await close();

  // Bounty-Phase mit digitalen Umschlaegen
  await cmd("t:clock.next"); await wait(500);
  await shot("13-bounty-level");
  await js("document.querySelector('.screen.on').scrollTop = 9999"); await shot("14-bounty-unten-geld");
  await js("document.querySelector('.screen.on').scrollTop = 0");
  await click("#bOut"); await tile("Flo"); await shot("15-out-von-wem");
  await tile("Clara"); await shot("16-umschlag-waehlen");
  await click("#shBody .env[data-i='2']"); await wait(300); await shot("17-umschlag-aufgedeckt");
  await click("#envDone"); await shot("18-nach-umschlag");
  // Jackpot: groessten geschlossenen Umschlag waehlen
  await click("#bOut"); await tile("Dani"); await tile("Anna");
  await js(`(() => { const v = live(); const free = v.envAmounts.map((x, i) => [x, i]).filter(([, i]) => !v.envOpened.some(o => o.i === i)).sort((a, b) => b[0] - a[0]);
    document.querySelector("#shBody .env[data-i='" + free[0][1] + "']").click(); })()`);
  await wait(250); await shot("19-jackpot-konfetti");
  await wait(4300); await click("#envDone");

  // Letzte Minute
  await lap(`(async () => { for (let i = 0; i < 30 && PFCore.tView(T, Date.now()).clock.remaining > 60000; i++) await cmd("t:clock.minus"); })()`);
  await shot("20-letzte-minute");

  // Cash Game
  await cmd("cash.start");
  await click("#segC"); await shot("21-cash-leer");
  await click("#bJoin"); await shot("22-cash-hinsetzen");
  for (const n of ["Anna", "Ben", "Clara"]) await tile(n);
  await js("document.getElementById('newName').value = 'Olaf'; document.getElementById('newAdd').click()");
  await shot("23-cash-hinsetzen-vier-gewaehlt");
  await click("#mpGo"); await wait(600); await shot("24-cash-tisch");
  for (let i = 0; i < 6; i++) await cmd("c:cash.rebuy", { name: "Ben" });
  await wait(500);
  await click("#bJoin"); await shot("25-cash-hinsetzen-20-frei");
  await close();
  await click("[data-rebuy]"); await shot("26-cash-nachkauf-10-20");
  await close();
  await click("[data-out]"); await wait(300);
  await js(`for (let i = 0; i < 4; i++) document.querySelector('[data-d="500"][data-x="1"]').click(); document.querySelector('[data-d="100"][data-x="1"]').click(); document.querySelector('[data-d="10"][data-x="1"]').click()`);
  await shot("27-cash-zaehlen");
  await click("#payBtn"); await shot("28-cash-rueckfrage");
  await click("#noBtn"); await shot("29-cash-zurueck-zaehlstand-bleibt");
  await click("#payBtn"); await click("#okBtn"); await wait(500); await shot("30-cash-nach-auszahlen");
  await click("[data-out]"); await wait(300); await click("#brokeBtn"); await shot("31-cash-pleite-rueckfrage");
  await close();
  await js("document.querySelector('.screen.on').scrollTop = 9999"); await shot("32-cash-unten");
}
