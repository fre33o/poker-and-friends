// Rauchtest der WebApp (dist-web) in einem normalen Browserfenster ohne Electron-Brücke.
// Aufruf: npm run build:web && node scripts/with-cache.js electron test/web-smoke.js <Ausgabeordner>
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", ".smoke-web"));
fs.mkdirSync(out, { recursive: true });
app.setPath("userData", path.join(out, "browser"));
process.env.PORT = process.env.PORT || "8091";
require("../scripts/serve-web.js");

const wait = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  const errors = [];
  win.webContents.on("console-message", e => { if (e.level === "error") errors.push(e.message); });
  const js = code => win.webContents.executeJavaScript(code);
  const shot = async name => fs.writeFileSync(path.join(out, name + ".png"), (await win.webContents.capturePage()).toPNG());
  const step = async (name, fn) => { await fn(); console.log("ok   " + name); };

  try {
    await win.loadURL("http://localhost:" + process.env.PORT + "/");
    await wait(1200);
    await step("Start ohne Handy, mit Daten sichern", async () => {
      const r = await js(`({ web: pf.web, handy: !!document.getElementById("openHandy"), data: document.getElementById("openData").textContent,
        menuHandy: document.querySelectorAll('[data-act="handy"]').length, view })`);
      assert.deepStrictEqual(r, { web: true, handy: false, data: "Daten sichern", menuHandy: 0, view: "start" });
      await shot("01-start");
    });
    await step("Cash Game: hinsetzen, nachkaufen", async () => {
      await js(`(async () => { await cmd("cash.start"); show("cash");
        for (const n of ["Anna", "Ben", "Clara"]) await cmd("c:cash.join", { name: n, amount: 1000 });
        await cmd("c:cash.rebuy", { name: "Anna" }); })()`);
      await wait(400);
      const r = await js(`({ view, players: C.players.length, anna: C.players.find(p => p.name === "Anna").inCents, roster: S.roster.length })`);
      assert.strictEqual(r.view, "cash"); assert.strictEqual(r.players, 3); assert.ok(r.anna > 1000); assert.strictEqual(r.roster, 3);
      await shot("02-cash");
    });
    await step("Neu laden: Stand bleibt erhalten", async () => {
      await win.webContents.reload(); await wait(1200);
      const r = await js(`({ cash: !!S.cash, players: C.players.length })`);
      assert.deepStrictEqual(r, { cash: true, players: 3 });
    });
    await step("Rückgängig", async () => {
      await js(`cmd("undo", { kind: "cash" })`); await wait(200);
      assert.strictEqual(await js(`C.players.find(p => p.name === "Anna").inCents`), 1000);
    });
    await step("Cash Game abschließen, Rangliste", async () => {
      await js(`(async () => { for (const n of ["Anna", "Ben", "Clara"]) await cmd("c:cash.cashout", { name: n, counts: { 1000: 1 } }); await cmd("cash.close"); })()`);
      await wait(300);
      const n = await js(`pf.history().then(h => h.length)`);
      assert.strictEqual(n, 1);
      await js(`show("history")`); await wait(500); await shot("03-rangliste");
    });
    await step("Turnier starten, Uhr läuft", async () => {
      const r = await js(`(async () => { const r = await cmd("tournament.start", { names: ["Anna", "Ben", "Clara", "Dani", "Eric", "Flo"], template: S.templates[0].name });
        show("tournament"); await cmd("t:clock.toggle"); return r; })()`);
      assert.ok(r.ok, r.error);
      await wait(1500); await shot("04-turnier");
      assert.strictEqual(await js(`view`), "tournament");
    });
    await step("Sicherung: herausschreiben und wieder einspielen", async () => {
      const r = await js(`(() => { const b = pf.backupData(); const keys = Object.keys(b.data).length;
        pf.restoreData(b); return { keys, after: Object.keys(pf.backupData().data).length, app: b.app }; })()`);
      assert.ok(r.keys >= 5); assert.strictEqual(r.after, r.keys); assert.strictEqual(r.app, "poker-and-friends");
      const bad = await js(`(() => { try { pf.restoreData({ foo: 1 }); return "kein Fehler"; } catch (e) { return e.message; } })()`);
      assert.strictEqual(bad, "Keine Sicherung von Poker & Friends");
    });
    await step("Daten sichern öffnet Dialog", async () => {
      await js(`show("start"); document.getElementById("openData").click()`); await wait(300);
      assert.ok(await js(`!!document.getElementById("bkExport") && modalOpen`));
      await shot("05-sichern"); await js(`closeModal()`);
    });
    await step("Taste H zeigt nur Hinweis", async () => {
      await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }))`); await wait(200);
      assert.match(await js(`document.getElementById("toast").textContent`), /nur in der Desktop-App/);
    });
    await step("Offline-Speicher (Service Worker) aktiv", async () => {
      await wait(1000);
      const r = await js(`navigator.serviceWorker.getRegistration().then(async reg => ({ active: !!(reg && reg.active), cached: (await caches.keys()).length }))`);
      assert.deepStrictEqual(r, { active: true, cached: 1 });
    });
    assert.deepStrictEqual(errors, [], "Fehler in der Konsole: " + errors.join(" | "));
    console.log("\nWebApp-Rauchtest bestanden, Bilder in " + out);
    app.exit(0);
  } catch (e) {
    console.error("FEHLER: " + e.message);
    if (errors.length) console.error("Konsole: " + errors.join(" | "));
    await shot("fehler").catch(() => {});
    app.exit(1);
  }
});
