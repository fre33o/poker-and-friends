// WebApp-Brücke: ersetzt im Browser Electron (preload + Hauptprozess).
// Gleiche Befehlsliste wie die Desktop-App, gespeichert wird im Browser (localStorage).
// Handy-Steuerung gibt es hier nicht, ein Browser kann keinen Server starten.
(function () {
  const PREFIX = "pf:";
  const clone = v => JSON.parse(JSON.stringify(v));

  // Gleiche Schnittstelle wie src/main/store.js: Pfade wie "abende/x.json" werden zu Schlüsseln
  const store = {
    dir: "Browser-Speicher",
    read(rel, fallback) {
      try { const t = localStorage.getItem(PREFIX + rel); return t === null ? fallback : JSON.parse(t); }
      catch { return fallback; }
    },
    write(rel, data) {
      try { localStorage.setItem(PREFIX + rel, JSON.stringify(data)); }
      catch { throw PFCore.fail("Speichern im Browser fehlgeschlagen (Speicher voll oder privates Fenster)"); }
    },
    list(sub) {
      const p = PREFIX + sub + "/", out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(p) && k.endsWith(".json") && !k.slice(p.length).includes("/")) out.push(k.slice(p.length));
      }
      return out;
    },
  };

  // Bildschirm wach halten, solange ein Spiel läuft (geht nur, solange der Tab sichtbar ist)
  let lock = null, asking = false;
  async function updateWakeLock() {
    const need = app.hasActiveGame() && document.visibilityState === "visible";
    try {
      if (need && !lock && !asking && navigator.wakeLock) {
        asking = true;
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; });
      }
      if (!need && lock) { const l = lock; lock = null; await l.release(); }
    } catch {} finally { asking = false; }
  }
  document.addEventListener("visibilitychange", updateWakeLock);

  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(fallback); else fallback();
  }

  const app = PFCommands.createApp(store, {
    "window.fullscreen"() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    },
    "data.open"() { openBackup(); },
    "clipboard.write"({ text }) { copyText(String(text || "")); return "Text kopiert, jetzt in WhatsApp einfügen"; },
  });

  // Sicherung: alle Daten als eine Datei, Einspielen ersetzt alles
  function backupData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIX)) data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
    return { app: "poker-and-friends", version: 1, created: new Date().toISOString(), data };
  }
  function restoreData(backup) {
    if (!backup || backup.app !== "poker-and-friends" || !backup.data || typeof backup.data !== "object") throw new Error("Keine Sicherung von Poker & Friends");
    const old = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREFIX)) old.push(k); }
    old.forEach(k => localStorage.removeItem(k));
    for (const [rel, v] of Object.entries(backup.data)) localStorage.setItem(PREFIX + rel, JSON.stringify(v));
  }

  const listeners = [];
  window.pf = {
    web: true,
    cmd(name, payload) {
      // Sofort ausführen (Vollbild braucht den Klick), neuer Stand und Antwort danach wie bei Electron
      const r = app.dispatch(String(name), payload);
      return Promise.resolve().then(() => {
        if (r.ok) { updateWakeLock(); const s = clone(app.snapshot()); listeners.forEach(cb => cb(s)); }
        return r;
      });
    },
    state: () => Promise.resolve(clone(app.snapshot())),
    history: () => Promise.resolve(clone(app.history())),
    onState: cb => listeners.push(cb),
    backupData, restoreData,
    // Handy-Steuerung: in der WebApp ohne Funktion
    remoteInfo: () => Promise.resolve({ error: "Nur in der Desktop-App", others: [] }),
    remoteReset: () => Promise.resolve(),
    remoteUi: () => Promise.resolve(),
    onRemote: () => {},
  };
  window.openHandy = () => toast("Handy-Steuerung gibt es nur in der Desktop-App");

  // Ein zweiter Tab mit derselben App würde sich mit diesem gegenseitig überschreiben
  window.addEventListener("storage", e => {
    if (e.key && e.key.startsWith(PREFIX)) toast("Achtung: Poker & Friends ist noch in einem anderen Tab offen. Bitte nur einen Tab nutzen");
  });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  updateWakeLock();
})();
