// Startet einen Befehl mit Caches auf D:, damit nichts im Windows-Userprofil landet
const { spawnSync } = require("child_process");
const path = require("path");
const base = path.resolve(__dirname, "..", "..", ".cache");
const env = {
  ...process.env,
  ELECTRON_CACHE: path.join(base, "electron"),
  electron_config_cache: path.join(base, "electron"),
  ELECTRON_BUILDER_CACHE: path.join(base, "electron-builder"),
};
// Projekt-Programme (electron, electron-builder) auch außerhalb von npm-Skripten finden
const bin = path.resolve(__dirname, "..", "node_modules", ".bin");
const pathKey = Object.keys(env).find(k => k.toLowerCase() === "path") || "PATH";
env[pathKey] = bin + path.delimiter + env[pathKey];
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
