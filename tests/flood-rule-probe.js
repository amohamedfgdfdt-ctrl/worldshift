(a) => {
  const T = window.TERRA, gm = T.ui.gameMode, c = gm.campaign, sim = T.sim, bs = T.world.buildings;
  const STAGES = c.stages, idx = c.indexOf(a.sid);
  for (let k = 0; k < idx; k++) { const id = STAGES[k].id; if (!c.progress.stages[id]) c.progress.stages[id] = { stars: 3, bestDays: 1, plays: 1, bestStability: 95 }; }
  c._saveProgress(); sim.events.setAutoEnabled(false); c.start(a.sid); sim.events.setAutoEnabled(false);
  const out = [];
  const made = [];
  for (const p of a.place) { const r = bs.place(p[0], p[1], p[2], 0, { force: true, silent: true }); made.push(r && r.ok ? r.building : null); out.push(['placed', p, !!(r && r.ok)]); }
  for (let h = 0; h < a.hours; h++) { for (let k = 0; k < 300; k++) sim.update(0.1); out.push([h + 1, made.map((b) => b ? +bs.floodInfo(b).depth.toFixed(2) : null), Math.round(sim.economy.s.waterStock), +sim.economy.s.foodProd.toFixed(1), made.map((b) => b ? bs.floodInfo(b).label : null)]); }
  return out;
}
