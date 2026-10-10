// Screenshot des Startbildschirms (1920x1080) zur Sichtpruefung.
// Aufruf: node scripts/with-cache.js electron test/shot-start.js <Ausgabeordner> [laufend]
// Mit "laufend" wird vorher ein Cash Game gestartet (Kachel mit Fortsetzen).
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", ".smoke-shot"));
const running = process.argv[3] === "laufend";
fs.mkdirSync(out, { recursive: true });
process.env.PF_DATA_DIR = path.join(out, "data");

app.on("browser-window-created", (_e, win) => {
  let done = false;
  win.webContents.on("did-finish-load", async () => {
    if (done) return; done = true;
    win.setFullScreen(false); win.setContentSize(1920, 1080);
    await new Promise(r => setTimeout(r, 1200));
    if (running) {
      await win.webContents.executeJavaScript("cmd(\"cash.start\").then(() => show(\"start\"))");
      await new Promise(r => setTimeout(r, 500));
    }
    const m = await win.webContents.executeJavaScript(`(() => {
      const r = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; };
      const range = document.createRange(); const h1 = document.querySelector(".start-brand h1"); range.selectNodeContents(h1);
      const t = range.getBoundingClientRect();
      return { suit: r(document.querySelector(".start-brand .suit")), text: [Math.round(t.left), Math.round(t.right)], width: innerWidth };
    })()`);
    console.log(JSON.stringify(m));
    fs.writeFileSync(path.join(out, running ? "start-laufend.png" : "start.png"), (await win.webContents.capturePage()).toPNG());
    app.exit(0);
  });
});
require("../src/main/main.js");
