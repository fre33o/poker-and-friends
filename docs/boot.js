// Start: Stand holen, Startbildschirm zeigen, Uhr-Takt
(async () => {
  pf.onState(setSnapshot);
  setSnapshot(await pf.state());
  show("start");
  setInterval(() => {
    const now = Date.now();
    tournamentTick(now);
    if (views[view]) views[view].render(now);
  }, 200);
})();
