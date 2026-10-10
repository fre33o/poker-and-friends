// WebApp: "Daten sichern" statt "Datenordner öffnen". Alles liegt nur in diesem Browser.
function openBackup() {
  openModal("", "<h2>Daten sichern</h2><p>Spieler, Abende und Vorlagen liegen nur in diesem Browser. Werden die Browserdaten gelöscht, sind sie weg. " +
    "Am besten nach jedem Abend eine Sicherung herunterladen.</p>" +
    "<div class='modal-foot'><button class='btn' id='bkImport'>Sicherung einspielen</button><button class='btn primary' id='bkExport'>Sicherung herunterladen</button></div>" +
    "<input type='file' id='bkFile' accept='.json,application/json' hidden>");
  $("bkExport").onclick = () => {
    const blob = new Blob([JSON.stringify(pf.backupData(), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "poker-and-friends-sicherung-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    closeModal();
    toast("Sicherung heruntergeladen");
  };
  $("bkImport").onclick = () => $("bkFile").click();
  $("bkFile").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    let backup;
    try { backup = JSON.parse(await file.text()); if (!backup || backup.app !== "poker-and-friends") throw 0; }
    catch { return toast("Das ist keine Sicherung von Poker & Friends"); }
    confirmModal("Sicherung einspielen?", "Alle Daten in diesem Browser werden durch die Sicherung vom " +
      escapeHtml(new Date(backup.created).toLocaleString("de-DE")) + " ersetzt.", "Einspielen", () => {
      try { pf.restoreData(backup); location.reload(); }
      catch (err) { toast(err.message); }
    });
  };
}
