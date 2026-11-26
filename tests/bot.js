// Test bot: plays a stage through the real game APIs (same calls the tools make).
window.BOT = (() => {
  const T = () => window.TERRA, W = () => T().world, bs = () => W().buildings;
  const log = [];
  function spots(key, { maxDist = 99, minDist = 0, far = false } = {}) {
    const out = [];
    for (let j = 6; j < 122; j += 2) for (let i = 6; i < 122; i += 2) {
      const ev = bs().evaluate(key, i, j, 0); if (!ev.ok) continue;
      const ir = bs().irrigation({ cx: i, cz: j, w: 2, d: 2 });
      if (ir.dist > maxDist || ir.dist < minDist) continue;
      out.push({ i, j, d: ir.dist, h: W().field.h[j * 129 + i] });
    }
    if (arguments[1]?.high) out.sort((a, b) => b.h - a.h); else out.sort((a, b) => a.d - b.d);
    return out;
  }
  function place(key, n, opts = {}) {
    let c = 0; const sep = opts.minSep || 0;
    const g = T().tools.gate;
    for (let attempt = 0; attempt < 4 && c < n; attempt++) {
      const sp = spots(key, opts);
      // skip a spot already used this round; spread by stride
      for (const s of sp) {
        if (c >= n) break;
        if (sep && [...bs().buildings.values()].some((b) => b.key === key && Math.hypot(b.cx - s.i, b.cz - s.j) < sep)) continue;
        if (g) { const cp = g.canPlace(key); if (!cp.ok) { log.push('cant ' + key + ' ' + cp.reason); return c; } }
        const r = bs().place(key, s.i, s.j, 0);
        if (r.ok) { c++; g && g.placed(key); }
      }
    }
    return c;
  }
  function road(n) {
    const g = T().tools.gate; let c = 0;
    const h = [...bs().buildings.values()][0]; if (!h) return 0;
    for (let k = 0; k < n; k++) { if (g && !g.canPlace('road').ok) break; const r = bs().placeRoad(Math.min(120, h.cx + 3 + k), Math.min(120, h.cz + 4)); if (r.ok) { c++; g && g.placed('road'); } }
    return c;
  }
  function src(n, rate = 8) {
    const f = W().field.riverSource, g = T().tools.gate; let c = 0;
    const cand = [];
    for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) cand.push([f.i + di, f.j + dj, Math.hypot(di, dj)]);
    cand.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of cand) {
      if (c >= n) break;
      if (g && !g.canPlace('source').ok) break;
      if (!bs().evaluateSource(i, j).ok) continue;
      const r = bs().placeSource(i, j, rate); if (r.ok) { c++; g && g.placed('source'); }
    }
    return c;
  }
  function step(gameHours) {
    const sim = T().sim; sim.setSpeed(4); sim.setRunning(true);
    const target = T().campaign.run.elapsedGh + gameHours;
    let k = 0;
    while (T().campaign.run && T().campaign.run.status === 'playing' && T().campaign.run.elapsedGh < target && k++ < 20000) sim.update(0.1);
    return T().campaign.run.elapsedGh;
  }
  function state() {
    const c = T().campaign, e = T().sim.economy, s = e.s;
    return { st: c.run && c.run.status, tanks: W().water.sinks.map((k) => Math.round(k.stored)).join(','), srcs: W().water.sources.length, fp: Math.round(s.foodProd), fd: Math.round(s.foodDemand), farms: [...bs().buildings.values()].filter((b) => b.key === 'farm').map((b) => bs().irrigation(b).label[0] + (bs().floodInfo(b).depth > 0.5 ? 'F' : '')).join(','), h: +c.run?.elapsedGh.toFixed(1), pop: s.pop, water: Math.round(s.waterStock), food: Math.round(e.food), eprod: Math.round(s.energyProd), edem: s.energyDemand, funds: Math.round(e.funds), net: Math.round(s.net), stab: Math.round(e.stability), flooded: s.flooded, counts: s.counts, obj: c.objectives().map((o) => o.id + (o.done ? '✓' : ':' + o.v + '/' + o.target)).join(' '), res: c.run?.result && { win: c.run.result.win, stars: c.run.result.stars, days: +c.run.result.days.toFixed(2), why: c.run.result.reason } };
  }
  // A greedy "competent player": every 3 game hours it fixes the biggest shortage and grows.
  function auto(maxH, goalPop, opts = {}) {
    const c = T().campaign, e = T().sim.economy, av = () => c.available();
    const has = (k) => av().types.has(k);
    let rounds = 0;
    while (c.run.status === 'playing' && c.run.elapsedGh < maxH && rounds++ < 400) {
      const s = e.s, n = (k) => s.counts[k] || 0, cap = n('house_small') * 4 + n('house_medium') * 8;
      const budget = () => e.funds - (opts.reserve ?? 300);
      const tryP = (k, o) => { if (budget() >= (window.ECOCOST?.[k] || 0)) return place(k, 1, o); return 0; };
      // water
      if (s.waterStock < s.waterDemand * 24 + 800 && budget() > 150) { if (!opts.noSrc && n('water_tank') >= 2 && (T().world.water.sources.length < 7)) src(1); }
      if (n('water_tank') < 2 + Math.floor(s.pop / 40)) tryP('water_tank', { maxDist: 4, minSep: 10 });
      // food
      if (s.foodProd < s.foodDemand * 1.25 + 20) tryP('farm', { maxDist: 4, minDist: 1.5, minSep: 4 });
      // energy
      if (has('wind_turbine') && s.energyDemand > 0 && s.energyProd < s.energyDemand * 1.6) { tryP('wind_turbine', { maxDist: 60, minDist: 10, minSep: 5 }); if (e.funds > 1500) tryP('solar_plant', { maxDist: 60, minDist: 10, minSep: 5 }); }
      // industry
      if (has('factory_small') && opts.factories && n('factory_small') < opts.factories && s.pop > 20 * (n('factory_small') + 1)) tryP('factory_small', { maxDist: 30, minDist: 5 });
      // homes
      if (s.pop >= cap - 4 && s.pop < goalPop + 10) { for (let i = 0; i < 4; i++) tryP(has('house_medium') && opts.medium !== false ? 'house_medium' : 'house_small', { maxDist: 16, minDist: opts.houseMin ?? 4, high: opts.high }); }
      if (opts.roads && bs().roads.size < opts.roads) road(opts.roads - bs().roads.size);
      step(3);
    }
    return state();
  }
  return { auto, src, spots, place, road, step, state, log };
})();
