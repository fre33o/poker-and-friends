// Handy verbinden: QR-Code mit Adresse und Schlüssel, Anzahl verbundener Handys
function openHandy() {
  let timer = null;
  const draw = info => {
    if (!modalOpen || !$("handyBox")) return;
    const status = info.error ? "<span class='bad'>" + escapeHtml(info.error) + "</span>"
      : info.connected ? "<span class='good'>&#9679; " + info.connected + (info.connected === 1 ? " Handy" : " Handys") + " verbunden</span>"
      : "Noch kein Handy verbunden";
    $("handyBox").innerHTML = info.qr
      ? "<div class='qr'>" + info.qr + "</div><div class='handy-info'>" +
        "<ol><li>Handy ins selbe WLAN wie den Laptop</li><li>QR-Code mit der Handy-Kamera scannen</li><li>Im Browser-Menü \"Zum Startbildschirm hinzufügen\", dann reicht künftig ein Tipp</li></ol>" +
        "<div class='url'>" + escapeHtml(info.url) + "</div>" +
        (info.others.length ? "<div class='others'>Weitere Netzwerke: " + info.others.map(escapeHtml).join(", ") + "</div>" : "") +
        "<div class='handy-status'>" + status + "</div></div>"
      : "<p>Kein Netzwerk gefunden. Ist der Laptop mit dem WLAN verbunden?</p>";
  };
  const refresh = async () => {
    if (timer && !$("handyBox")) return clearInterval(timer);
    draw(await pf.remoteInfo());
  };
  openModal("handy", "<h2>Handy verbinden</h2><p>Das Handy wird zur Fernbedienung. Der Laptop bleibt das Gehirn, fällt das Handy aus, geht nichts verloren.</p>" +
    "<div id='handyBox'></div><div class='modal-foot'><button class='btn' id='handyReset'>Handys trennen</button></div>");
  $("handyReset").onclick = () => confirmModal("Handys trennen?", "Alle verbundenen Handys verlieren den Zugang und müssen den neuen QR-Code scannen.", "Trennen", async () => {
    await pf.remoteReset();
    toast("Neuer QR-Code erstellt, alte Handys getrennt");
    openHandy();
  });
  modalOnClose = () => clearInterval(timer);
  refresh();
  timer = setInterval(refresh, 1500);
}

// Aktionen vom Handy auch am Laptop kurz anzeigen
// Umschlag-Auswahl vom Handy erscheint als Dialog, die Meldung dazu wäre doppelt
pf.onRemote(ev => {
  if (ev.ui) return remoteEnvelope(ev);
  if (ev.msg && !envMirror) toast("📱 " + ev.msg);
});
