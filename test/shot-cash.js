// Screenshots aller Cash-Game-Dialoge zur Sichtpruefung (Tisch, Spieler-Fenster, Nachkauf, Auszahlen, Abend beenden).
// Aufruf: node scripts/with-cache.js electron test/shot-cash.js <Ausgabeordner>
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", ".smoke-shot"));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
process.env.PF_DATA_DIR = path.join(out, "data");

const wait = ms => new Promise(r => setTimeout(r, ms));
app.on("browser-window-created", (_e, win) => {
  let done = false;
  win.webContents.on("did-finish-load", async () => {
    if (done) return; done = true;
    try {
      win.setFullScreen(false); win.setContentSize(1920, 1080);
      await wait(1200);
      const js = s => win.webContents.executeJavaScript(s);
      const shot = async name => { await wait(450); fs.writeFileSync(path.join(out, name + ".png"), (await win.webContents.capturePage()).toPNG()); };
      const click = sel => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
      const type = (vals) => js(`(() => { const i = document.querySelectorAll("#modal input[data-d]");
        ${JSON.stringify(vals)}.forEach((v, k) => { i[k].value = v; i[k].dispatchEvent(new Event("input")); }); document.activeElement.blur(); })()`);

      await js(`(async () => {
        for (const n of ["Anna", "Ben", "Clara", "Dani", "Eric", "Flo", "Jana", "Max", "Tom"]) await cmd("roster.add", { name: n });
        await cmd("cash.start");
      })()`);
      await wait(800); await js(`show("cash")`);
      await js("doJoin()");
      for (const n of ["Anna", "Ben", "Clara", "Dani"]) await js(`[...document.querySelectorAll("#joinChips .chip")].find(c => c.textContent === "${n}").click()`);
      await js(`document.getElementById("newName").value = "Gast"; document.getElementById("newName").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))`);
      await shot("00-hinsetzen-mehrere");
      await js(`[...document.querySelectorAll("#joinChips .chip")].find(c => c.textContent === "Gast").click()`);
      await click("#joinGo"); await shot("00b-nach-hinsetzen");
      await wait(800); await js(`show("cash")`);
      await shot("01-tisch");
      await click(`.crow[data-name="Anna"]`); await shot("02-spieler-fenster");
      await click("#modal [data-amt]"); await shot("03-nach-nachkauf-toast-unten");
      await js("doJoin()"); await shot("04-hinsetzen-ausgegraut");
      await js("closeModal()");

      // 20 € freischalten
      await js(`(async () => { for (let i = 0; i < 3; i++) await cmd("c:cash.rebuy", { name: "Anna" }); })()`);
      await js("doCashRebuy()"); await shot("05-nachkauf-menue-20-frei");
      await js(`document.querySelectorAll("#modal [data-amt]")[1].click()`); await shot("06-nachkauf-20-gewaehlt");
      await js("closeModal()");
      await click(`.crow[data-name="Ben"]`); await shot("07-spieler-fenster-20-frei");
      await js("closeModal()");
      await js("openRoster()"); await shot("08-spielerliste");
      await js("closeModal()");

      // Auszahlen
      await js("doCashout()"); await shot("09-auszahlen-auswahl");
      await click("#modal .pick button"); await type([3, 5, 2, 1, 4, 3, 2]); await shot("10-zaehlen-gerundet");
      await click("#payBtn"); await shot("11-auszahlen-rueckfrage");
      await click("[data-close]"); await shot("12-zurueck-beim-zaehlen");
      await click("#brokeBtn"); await shot("13-pleite-rueckfrage");
      await click("[data-close]"); await click("#payBtn"); await click("#confirmOk"); await shot("14-nach-auszahlen");

      // Abend beenden mit noch Sitzenden, dann Restliche auszahlen
      await js("doCashEnd()"); await shot("15-abend-noch-am-tisch");
      await click("#restC"); await shot("16-restliche-erster");
      await type([0, 0, 0, 0, 3, 0, 2]); await click("#payBtn"); await click("#confirmOk"); await shot("17-restliche-zweiter");
      await type([0, 0, 0, 0, 0, 0, 1]); await click("#payBtn"); await click("#confirmOk"); await shot("18-restliche-letzter");
      await type([0, 5, 0, 1, 4, 1, 0]); await click("#payBtn"); await shot("19-letzter-rueckfrage");
      await click("#confirmOk"); await shot("20-abend-uebersicht");
      await click("#closeC"); await shot("21-abschliessen");
    } catch (e) { console.error("ABBRUCH", e); }
    app.exit(0);
  });
});
require("../src/main/main.js");
