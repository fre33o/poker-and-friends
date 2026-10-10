// JSON-Dateien im App-Datenordner. Schreiben erst in .tmp, dann umbenennen,
// damit bei einem Absturz nie eine halbe Datei übrig bleibt.
const fs = require("fs");
const path = require("path");

class Store {
  constructor(dir) {
    this.dir = dir;
    for (const sub of ["", "vorlagen", "abende"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }

  file(rel) { return path.join(this.dir, rel); }

  read(rel, fallback) {
    try { return JSON.parse(fs.readFileSync(this.file(rel), "utf8")); }
    catch { return fallback; }
  }

  write(rel, data) {
    const target = this.file(rel), tmp = target + ".tmp";
    const text = JSON.stringify(data, null, 1);
    fs.writeFileSync(tmp, text);
    try { fs.renameSync(tmp, target); }
    catch {
      // Virenscanner o.ä. hält die Datei kurz fest: direkt schreiben
      fs.writeFileSync(target, text);
      try { fs.unlinkSync(tmp); } catch {}
    }
  }

  list(sub) {
    try { return fs.readdirSync(this.file(sub)).filter(f => f.endsWith(".json")); }
    catch { return []; }
  }
}

module.exports = { Store };
