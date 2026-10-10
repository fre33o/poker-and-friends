// Screenshots aller Turnier-Bildschirme und -Dialoge zur Sichtpruefung (Check-in, Uhr, Menue, Spieler-Aktionen, Pause, Einstellungen, Sieger).
// Aufruf: node scripts/with-cache.js electron test/shot-turnier.js <Ausgabeordner>
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
      const pick = name => js(`[...document.querySelectorAll("#modal .pick button")].find(b => b.firstChild.textContent === "${name}").click()`);
      const next = n => js(`(async () => { for (let i = 0; i < ${n}; i++) await cmd("t:clock.next"); })()`);

      await js(`(async () => { for (const n of ["Anna", "Ben", "Clara", "Dani", "Eric", "Flo", "Jana", "Max", "Tom"]) await cmd("roster.add", { name: n }); })()`);
      await wait(500);

      // Check-in
      await js("openCheckin()"); await shot("01-checkin-leer");
      for (const n of ["Anna", "Ben", "Clara", "Dani", "Eric", "Flo", "Jana"])
        await js(`[...document.querySelectorAll("#modal .chip")].find(c => c.firstChild.textContent === "${n}").click()`);
      await shot("02-checkin-gewaehlt");
      await click("#startBtn"); await wait(800);

      // Uhr
      await shot("03-uhr-angehalten");
      await click("#cdWrap"); await shot("04-uhr-laeuft");
      await click("#cdWrap"); await shot("04b-uhr-per-klick-angehalten");
      await click("#cdWrap");
      await click("#infoBtn"); await shot("05-geld-uebersicht");
      await click("#infoBtn");
      await click("#tMenuBtn"); await shot("06-menue");
      await js("closeMenus()");

      // Spieler-Aktionen in der Rebuy-Phase
      await js("doRebuy()"); await shot("07-rebuy-auswahl");
      await pick("Anna"); await shot("08-nach-rebuy");
      await js("doLate()"); await shot("09-nachzuegler");
      await js("closeModal()");
      await js("doOut()"); await shot("10-out-wer");
      await pick("Jana"); await shot("11-out-von-wem");
      await pick("Anna"); await shot("12-nach-out");
      await js("doAddon()"); await shot("13-addon-ausserhalb-pause");

      // Pause mit Add-On
      await next(4); await shot("14-pause");
      await click("#breakAddonRow"); await shot("15-addon-auswahl");
      const chip = name => js(`[...document.querySelectorAll("#modal .chip")].find(c => c.textContent === "${name}").click()`);
      await chip("Ben"); await chip("Clara"); await chip("Eric"); await shot("15b-addon-drei-gewaehlt");
      await click("#addonGo"); await shot("16-nach-addon");
      await click("#breakAddonRow"); await shot("16b-addon-ausgegraut");
      await js("closeModal()");

      // Mystery Bounty ab dem Level nach der Pause
      await next(1); await shot("17-uhr-bounty");
      await click("#infoBtn"); await shot("18-geld-uebersicht-bounty");
      await click("#countdown"); await shot("18b-geld-zu-per-klick-daneben");
      await js("doOut()"); await pick("Flo"); await pick("Clara"); await shot("19-umschlag-waehlen");
      await click("#modal .env-big[data-i='2']"); await shot("20-umschlag-aufgedeckt");
      await click("#envDone"); await shot("20b-nach-umschlag");
      await js("doOut()"); await pick("Dani"); await pick("Anna"); await shot("20c-umschlag-einer-offen");
      // Jackpot wählen: Konfetti
      await js(`(() => { const v = liveView(); const free = v.envAmounts.map((x, i) => [x, i]).filter(([, i]) => !v.envOpened.some(o => o.i === i)).sort((a, b) => b[0] - a[0]);
        document.querySelector("#modal .env-big[data-i='" + free[0][1] + "']").click(); })()`);
      await wait(250); await shot("20c2-jackpot-konfetti");
      await wait(4000); await click("#envDone");
      await click("#infoBtn"); await shot("20d-geld-geoeffnete-umschlaege");
      await click("#infoBtn");

      // Letzte Minute
      await js(`(async () => { for (let i = 0; i < 30 && PFCore.tView(T, Date.now()).clock.remaining > 60000; i++) await cmd("t:clock.minus"); })()`);
      await shot("21-letzte-minute");

      // Einstellungen
      await js("openSettings()"); await shot("22-einstellungen-struktur");
      await js(`document.querySelector("#modal .tabs [data-tab=money]").click()`); await shot("23-einstellungen-geld");
      await js("closeModal()");

      // Beenden ohne Sieger, dann bis zum Sieger spielen
      await js("doEnd()"); await shot("24-beenden-rueckfrage");
      await js("closeModal()");
      await js(`(async () => {
        for (const [name, by] of [["Eric", "Anna"], ["Clara", "Ben"]])
          await cmd("t:player.out", { name, by });
      })()`);
      await wait(400); await js("closeModal()"); await shot("25-zwei-uebrig");
      await js("doOut()"); await pick("Ben"); await pick("Anna");
      await js(`document.querySelector("#modal .env-big:not(.open)").click()`);
      await wait(1200); await shot("26-letzter-umschlag-vor-sieger");
      await click("#envDone"); await wait(1200); await shot("27-sieger");
    } catch (e) { console.error("ABBRUCH", e); }
    app.exit(0);
  });
});
require("../src/main/main.js");
