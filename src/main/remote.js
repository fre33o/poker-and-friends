// Handy-Fernbedienung: kleiner Webserver im Heim-WLAN.
// Das Handy lädt die Seite, bekommt den Stand per Server-Sent Events und schickt Befehle per POST.
// Zugriff nur mit dem geheimen Schlüssel aus dem QR-Code. Der Laptop bleibt das Gehirn.
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const qrcode = require("qrcode-generator");

const PORT = +process.env.PF_PORT || 4747; // PF_PORT nur fuer Tests, wenn die installierte App schon laeuft
const ROOT = path.join(__dirname, "..");
const FILES = {
  "/": ["remote/index.html", "text/html; charset=utf-8"],
  "/remote.js": ["remote/remote.js", "text/javascript; charset=utf-8"],
  "/remote.css": ["remote/remote.css", "text/css; charset=utf-8"],
  "/core.js": ["core/core.js", "text/javascript; charset=utf-8"],
  "/manifest.json": ["remote/manifest.json", "application/manifest+json"],
  "/icon.png": ["renderer/icon.png", "image/png"],
};

// Nur Anzeige am Laptop, ändert nichts am Stand: Umschlag-Auswahl vom Handy für alle sichtbar spiegeln
const UI = new Set(["ui.envpick", "ui.envshow", "ui.envclose"]);

// Was das Handy darf. Einstellungen, Check-in und Beenden bleiben am Laptop.
const ALLOWED = new Set([
  "t:clock.toggle", "t:clock.next", "t:clock.prev", "t:clock.plus", "t:clock.minus",
  "t:player.rebuy", "t:player.addon", "t:player.out", "t:player.late",
  "c:cash.join", "c:cash.rebuy", "c:cash.cashout",
  "undo", "settings.sound",
]);

function lanAddresses() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      // Virtuelle Adapter (Hyper-V, VirtualBox, VPN) nach hinten
      const virtual = /vethernet|virtual|vmware|vbox|hyper-v|wsl|tailscale|zerotier|loopback/i.test(name);
      const home = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      list.push({ address: a.address, name, score: (virtual ? 0 : 2) + (home ? 1 : 0) });
    }
  }
  return list.sort((a, b) => b.score - a.score);
}

function createRemote({ store, dispatch, snapshot, onAction }) {
  // Schlüssel bleibt gespeichert, damit das Handy nach einem Neustart weiter funktioniert
  let cfg = store.read("handy.json", null);
  if (!cfg || !cfg.key) { cfg = { key: crypto.randomBytes(18).toString("base64url") }; store.write("handy.json", cfg); }

  const clients = new Set();
  let server = null;
  let error = null;

  const authorized = url => {
    const k = url.searchParams.get("k") || "";
    return k.length === cfg.key.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(cfg.key));
  };

  // Nur was das Handy braucht, ohne Datenordner und Vorlagen
  const payload = () => {
    const s = snapshot();
    return JSON.stringify({ now: Date.now(), sound: s.settings.sound, roster: s.roster, tournament: s.tournament, cash: s.cash });
  };

  function send(res, code, type, body) {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  }

  function handle(req, res) {
    const url = new URL(req.url, "http://x");
    const file = FILES[url.pathname];
    if (req.method === "GET" && file) {
      fs.readFile(path.join(ROOT, file[0]), (err, data) => err ? send(res, 404, "text/plain", "Nicht gefunden") : send(res, 200, file[1], data));
      return;
    }
    if (!authorized(url)) return send(res, 403, "application/json", JSON.stringify({ ok: false, error: "Nicht verbunden. Bitte den QR-Code am Laptop neu scannen" }));

    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 2000\n\n");
      res.write("data: " + payload() + "\n\n");
      clients.add(res);
      if (!cfg.paired) { cfg.paired = true; store.write("handy.json", cfg); }
      onAction({ connected: clients.size });
      req.on("close", () => { clients.delete(res); onAction({ connected: clients.size }); });
      return;
    }
    if (req.method === "POST" && url.pathname === "/cmd") {
      let body = "";
      req.on("data", c => { body += c; if (body.length > 10000) req.destroy(); });
      req.on("end", () => {
        let msg;
        try { msg = JSON.parse(body); } catch { return send(res, 400, "application/json", JSON.stringify({ ok: false, error: "Ungültige Anfrage" })); }
        const name = String(msg.name || "");
        if (UI.has(name)) {
          const p = msg.payload || {};
          onAction({ ui: name, out: String(p.out || "").slice(0, 40), by: String(p.by || "").slice(0, 40), i: Math.floor(+p.i) });
          return send(res, 200, "application/json", JSON.stringify({ ok: true }));
        }
        if (!ALLOWED.has(name)) return send(res, 200, "application/json", JSON.stringify({ ok: false, error: "Nur am Laptop möglich" }));
        const r = dispatch(name, msg.payload || {});
        if (r.ok) onAction({ msg: r.msg });
        send(res, 200, "application/json", JSON.stringify(r));
      });
      return;
    }
    send(res, 404, "text/plain", "Nicht gefunden");
  }

  function start() {
    if (server) return;
    server = http.createServer(handle);
    server.on("error", e => {
      error = e.code === "EADDRINUSE" ? "Port " + PORT + " ist belegt" : "Server-Fehler: " + e.message;
      server = null;
    });
    server.listen(PORT, "0.0.0.0", () => { error = null; });
  }
  // Verbindungen offen halten, auch wenn gerade nichts passiert
  setInterval(() => clients.forEach(c => c.write(": ping\n\n")), 20000).unref();

  function broadcast() {
    if (!clients.size) return;
    const data = "data: " + payload() + "\n\n";
    clients.forEach(c => c.write(data));
  }

  function info() {
    const addrs = lanAddresses();
    const urls = addrs.map(a => "http://" + a.address + ":" + PORT + "/?k=" + cfg.key);
    let qr = null;
    if (urls.length) {
      const q = qrcode(0, "M");
      q.addData(urls[0]);
      q.make();
      qr = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
    }
    return {
      running: !!server, error, port: PORT, connected: clients.size, qr,
      url: urls[0] ? urls[0].replace(/\?k=.*/, "") : null,
      others: addrs.slice(1).map(a => a.address + " (" + a.name + ")"),
    };
  }

  // Neuer Schlüssel: alle bisher verbundenen Handys verlieren den Zugang
  function reset() {
    cfg = { key: crypto.randomBytes(18).toString("base64url") };
    store.write("handy.json", cfg);
    clients.forEach(c => c.end());
    clients.clear();
    return info();
  }

  // Anzeige-Nachricht vom Laptop an die Handys (Umschlag aufgedeckt oder Dialog geschlossen)
  function ui(ev) {
    if (!ev || !UI.has(ev.ui)) return;
    const data = "event: ui\ndata: " + JSON.stringify({ ui: ev.ui, by: String(ev.by || ""), i: Math.floor(+ev.i) }) + "\n\n";
    clients.forEach(c => c.write(data));
  }

  return { start, broadcast, info, reset, ui, wasPaired: () => !!cfg.paired };
}

module.exports = { createRemote, PORT };
