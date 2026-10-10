// Schmale Brücke zwischen Oberfläche und Hauptprozess
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pf", {
  cmd: (name, payload) => ipcRenderer.invoke("cmd", name, payload),
  state: () => ipcRenderer.invoke("state"),
  history: () => ipcRenderer.invoke("history"),
  onState: cb => ipcRenderer.on("state", (_e, s) => cb(s)),
  // Handy-Fernbedienung
  remoteInfo: () => ipcRenderer.invoke("remote.info"),
  remoteReset: () => ipcRenderer.invoke("remote.reset"),
  onRemote: cb => ipcRenderer.on("remote", (_e, ev) => cb(ev)),
  remoteUi: ev => ipcRenderer.invoke("remote.ui", ev),
});
