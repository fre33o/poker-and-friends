// Baut die WebApp nach dist-web: gleiche Oberfläche und Befehle wie die Desktop-App,
// Electron-Teile ersetzt durch web/ (Speichern im Browser, Sicherung, Offline). Ohne Handy-Steuerung.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");
const out = path.join(root, "dist-web");
const pkg = require(path.join(root, "package.json"));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true }); fs.copyFileSync(from, path.join(out, to)); };

// Oberfläche ohne Handy-Teil
for (const f of fs.readdirSync(path.join(src, "renderer"))) {
  if (["index.html", "handy.js", "sounds"].includes(f)) continue;
  copy(path.join(src, "renderer", f), f);
}
for (const f of fs.readdirSync(path.join(src, "renderer", "sounds"))) copy(path.join(src, "renderer", "sounds", f), "sounds/" + f);
copy(path.join(src, "core", "core.js"), "core/core.js");
copy(path.join(src, "core", "history.js"), "core/history.js");
copy(path.join(src, "main", "commands.js"), "core/commands.js");
for (const f of ["pf-web.js", "backup.js", "manifest.json"]) copy(path.join(root, "web", f), f);
copy(path.join(root, "build", "icon.png"), "icon-512.png");

// index.html anpassen. Jede Ersetzung muss greifen, sonst hat sich die Vorlage geändert
let html = fs.readFileSync(path.join(src, "renderer", "index.html"), "utf8").replace(/\r\n/g, "\n");
function replace(from, to) {
  const n = html.split(from).length - 1;
  if (!n) throw new Error("build-web: nicht gefunden in index.html: " + from);
  html = html.split(from).join(to);
}
replace("<link rel=\"stylesheet\" href=\"styles.css\">",
  "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"theme-color\" content=\"#070708\">\n" +
  "<link rel=\"manifest\" href=\"manifest.json\">\n<link rel=\"icon\" href=\"icon.png\">\n<link rel=\"stylesheet\" href=\"styles.css\">");
replace("<script src=\"../core/core.js\"></script>", "<script src=\"core/core.js\"></script>");
replace("<script src=\"../core/history.js\"></script>",
  "<script src=\"core/history.js\"></script>\n  <script src=\"core/commands.js\"></script>\n  <script src=\"pf-web.js\"></script>\n  <script src=\"backup.js\"></script>");
replace("  <script src=\"handy.js\"></script>\n", "");
replace(" &middot; <button class=\"linkish\" id=\"openHandy\">Handy verbinden</button>", "");
replace(">Datenordner öffnen</button>", ">Daten sichern</button>");
html = html.replace(/^[ \t]*<button data-act="handy">Handy verbinden<\/button>\r?\n/gm, "");
if (html.includes("handy")) throw new Error("build-web: Handy-Reste in index.html");
fs.writeFileSync(path.join(out, "index.html"), html);

// Service Worker mit Dateiliste und Version (ändert sich mit jedem neuen Inhalt)
const files = [];
(function walk(dir, rel) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f), r = rel ? rel + "/" + f : f;
    if (fs.statSync(p).isDirectory()) walk(p, r); else files.push(r);
  }
})(out, "");
files.sort();
const hash = crypto.createHash("sha256");
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(out, f)));
const version = pkg.version + "-" + hash.digest("hex").slice(0, 8);
const sw = fs.readFileSync(path.join(root, "web", "sw.js"), "utf8")
  .replace("\"pf-__VERSION__\"", JSON.stringify("pf-" + version))
  .replace("= __FILES__;", "= " + JSON.stringify(["./", ...files]) + ";");
fs.writeFileSync(path.join(out, "sw.js"), sw);
fs.writeFileSync(path.join(out, ".nojekyll"), "");

console.log("WebApp " + version + " gebaut: " + files.length + " Dateien in " + out);
