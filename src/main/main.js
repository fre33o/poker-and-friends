// Hauptprozess: Fenster, Standby-Sperre, Befehle aus der Oberfläche
const { app, BrowserWindow, ipcMain, powerSaveBlocker, shell, Menu, clipboard } = require("electron");
const path = require("path");

// Beim Entwickeln bleiben alle Daten im Projektordner
if (process.env.PF_DATA_DIR) app.setPath("userData", process.env.PF_DATA_DIR);
else if (!app.isPackaged) app.setPath("userData", path.join(__dirname, "..", "..", ".devdata"));

const { Store } = require("./store.js");
const { createApp } = require("./commands.js");
const { createRemote } = require("./remote.js");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  let blockerId = null;
  let pf = null;
  let remote = null;

  // Standby-Sperre, solange ein Spiel läuft
  function updatePowerSave() {
    const need = pf.hasActiveGame();
    if (need && blockerId === null) blockerId = powerSaveBlocker.start("prevent-display-sleep");
    if (!need && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
  }

  function broadcast() {
    if (win && !win.isDestroyed()) win.webContents.send("state", pf.snapshot());
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1600, height: 900, minWidth: 1024, minHeight: 600,
      backgroundColor: "#070708", show: false, title: "Poker & Friends",
      icon: path.join(__dirname, "..", "renderer", "icon.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", e => e.preventDefault());
    win.once("ready-to-show", () => { win.maximize(); win.show(); });
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    const store = new Store(path.join(app.getPath("userData"), "daten"));
    pf = createApp(store, {
      "window.fullscreen"() { win.setFullScreen(!win.isFullScreen()); },
      "data.open"() { shell.openPath(store.dir); },
      "clipboard.write"({ text }) { clipboard.writeText(String(text || "")); return "Text kopiert, jetzt in WhatsApp einfügen"; },
    });

    // Ein Weg für alle Befehle: Laptop (IPC) und Handy (remote.js)
    function run(name, payload) {
      const r = pf.dispatch(String(name), payload);
      if (r.ok) { updatePowerSave(); broadcast(); remote.broadcast(); }
      return r;
    }

    remote = createRemote({
      store, dispatch: run, snapshot: () => pf.snapshot(),
      onAction: ev => { if (win && !win.isDestroyed()) win.webContents.send("remote", ev); },
    });
    // War schon einmal ein Handy verbunden, läuft der Server gleich mit
    if (remote.wasPaired()) remote.start();

    ipcMain.handle("state", () => pf.snapshot());
    ipcMain.handle("history", () => pf.history());
    ipcMain.handle("cmd", (_e, name, payload) => run(name, payload));
    ipcMain.handle("remote.info", () => { remote.start(); return remote.info(); });
    ipcMain.handle("remote.reset", () => remote.reset());
    ipcMain.handle("remote.ui", (_e, ev) => remote.ui(ev));

    updatePowerSave();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
