// Automated solvability check: a scripted player that builds a village/city next to a
// corridor road and fast-forwards the real simulation until the stage's required
// objectives are met (or the time budget runs out). Not a human: it proves the
// objectives are reachable with the stage budget and the new road rules.
window.AUTOPLAY = function (stageId, opts) {
  opts = opts || {};
  const T = window.TERRA;
  const gm = T.ui.gameMode, c = gm.campaign, sim = T.sim, eco = sim.economy, bs = T.world.buildings, tr = T.traffic;
  const STAGES = c.stages;
  const idx = c.indexOf(stageId);
  const out = { stage: stageId, ok: false, log: [] };
  const t0 = performance.now();
  // a player who beat the earlier stages: unlock this one and its reward types
  for (let k = 0; k < idx; k++) {
    const id = STAGES[k].id;
    if (!c.progress.stages[id]) c.progress.stages[id] = { stars: 3, bestDays: 1, plays: 1, bestStability: 95 };
  }
  c._saveProgress();
  // release configuration: the campaign switches the sandbox's random disasters off (enterCampaign)
  sim.events.setAutoEnabled(false);
  if (!c.start(stageId)) { out.error = 'start failed'; return out; }
  sim.events.setAutoEnabled(false);
  const st = c.stage(stageId);
  const avail = () => c.available().types;
  const N = 128;

  // ---- pick a straight corridor row that can carry a road
  const roadFree = (i, j) => { const r = bs.evaluateRoad(i, j); return !!(r.ok || r.exists); };
  let best = { len: 0, j: 0, i0: 0 };
  for (let j = 26; j < 102; j++) {
    let start = -1, run = 0;
    for (let i = 18; i <= 108; i++) {
      const free = i < 108 && roadFree(i, j);
      if (free) { if (start < 0) start = i; run++; }
      else if (start >= 0) { if (run > best.len) best = { len: run, j, i0: start }; start = -1; run = 0; }
    }
  }
  if (best.len < 14) { out.error = 'no corridor'; return out; }
  const j0 = best.j, i0 = best.i0, runLen = Math.min(best.len, 44);

  // ---- roads: the corridor row first, then more rows above/below as space runs out
  let candCache = {};
  const rows = [0, -6, 6, -12, 12, -18, 18, -24, 24];
  let rowAt = 0, roadTiles = 0, bridgeTiles = 0;
  const paveRow = (j) => {
    let n = 0;
    for (let i = i0; i < i0 + runLen; i++) {
      const cost = eco.costOf('road');
      if (!eco.canAfford(cost)) break;
      const ev0 = bs.evaluateRoad(i, j);
      const wet = ev0.reason === 'Cannot build on water';
      const r = bs.placeRoad(i, j, true, { bridge: wet });
      if (!r || r.exists || r.ok === false) continue;
      eco.charge(r.bridge ? eco.costOf('bridge') : cost);
      if (r.bridge) bridgeTiles++; else roadTiles++;
      n++;
    }
    candCache = {};
    return n;
  };
  const nextRow = () => { while (rowAt < rows.length) { const j = j0 + rows[rowAt++]; if (j > 22 && j < 106) { if (paveRow(j)) return true; } } return false; };
  nextRow();
  out.corridor = { j: j0, i0, runLen };

  // ---- cells close enough to surface water for a farm to be irrigated
  const nearWaterC = {};
  const waterMap = (R) => {
    if (nearWaterC[R]) return nearWaterC[R];
    const d = bs.water.depth, V = Math.round(Math.sqrt(d.length)), g = new Uint8Array(N * N);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      if (!(d[j * V + i] > 0.15)) continue;
      for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) {
        if (Math.hypot(a, b) > R) continue;
        const ii = i + a, jj = j + b;
        if (ii >= 0 && jj >= 0 && ii < N && jj < N) g[jj * N + ii] = 1;
      }
    }
    nearWaterC[R] = g; return g;
  };

  // river banks flood once the sim runs: homes must sit clearly above the nearest water
  const hAt = (i, j) => bs.field.heightAt(i * 3 - 192 + 1.5, j * 3 - 192 + 1.5);
  let wetCells = null;
  const wet = () => {
    if (wetCells) return wetCells;
    const d = bs.water.depth, V = Math.round(Math.sqrt(d.length)); wetCells = [];
    for (let j = 0; j < V; j += 2) for (let i = 0; i < V; i += 2) if (d[j * V + i] > 0.15) wetCells.push([i, j, hAt(i, j)]);
    return wetCells;
  };
  // learn where the river reaches: let the empty map run a few hours first and keep the deepest water seen
  const dArr = bs.water.depth, VV = Math.round(Math.sqrt(dArr.length));
  const floodMax = new Float32Array(dArr.length);
  for (let k = 0; k < 300; k++) {
    sim.update(0.1);
    if (k % 25 === 0) for (let q = 0; q < dArr.length; q++) if (dArr[q] > floodMax[q]) floodMax[q] = dArr[q];
  }
  const floodsTight = (i, j) => { for (let b = -1; b <= 3; b++) for (let a = -1; a <= 3; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < VV && jj < VV && floodMax[jj * VV + ii] > 0.1) return true; } return false; };
  const floods = (i, j) => { for (let b = -3; b <= 4; b++) for (let a = -3; a <= 4; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < VV && jj < VV && floodMax[jj * VV + ii] > 0.1) return true; } return false; };
  const hiGround = (i, j, margin) => {
    const h = hAt(i, j); let low = 1e9;
    for (const [wi, wj, wh] of wet()) { if (Math.abs(wi - i) <= 14 && Math.abs(wj - j) <= 14 && wh < low) low = wh; }
    return low > 1e8 || h - low >= margin;
  };
  const bankMap = () => null;

  // ---- candidate spots (re-scanned when the map changes)
  const scan = (key) => {
    if (candCache[key]) return candCache[key];
    const a = [];
    // farms must sit next to surface water, which can be anywhere: scan the whole map
    const wide = key === 'farm' || key === 'water_tank';
    const jA = wide ? 8 : Math.max(14, j0 - 44), jB = wide ? 120 : Math.min(112, j0 + 44);
    const iA = wide ? 8 : Math.max(10, i0 - 24), iB = wide ? 120 : Math.min(116, i0 + runLen + 24);
    const wg = wide ? waterMap(key === 'farm' ? 8 : 4) : null;
    for (let j = jA; j <= jB; j++) for (let i = iA; i <= iB; i++) {
      if (wg && !wg[Math.min(N - 1, j + 2) * N + Math.min(N - 1, i + 2)]) continue;
      if ((key === 'farm' || key === 'water_tank') && floodsTight(i, j)) continue;
      if (key.startsWith('house') && bad.some(([bi, bj]) => Math.abs(bi - i) < 4 && Math.abs(bj - j) < 4)) continue;
      if (key.startsWith('house') && (floods(i, j) || !hiGround(i, j, 2))) continue;
      const ev = bs.evaluate(key, i, j);
      if (ev.ok) a.push([i, j]);
    }
    a.sort((p, q) => Math.abs(p[1] - j0) - Math.abs(q[1] - j0));
    candCache[key] = a;
    return a;
  };

  const counts = {};
  const bad = [];   // cells where a home flooded: do not build there again
  const CAP = { house_small: 4, house_medium: 8 };
  // needAccess: a building the road network reaches (the objective counts these)
  let lastHouseMin = -1e9;
  const failUntil = {}; let scanFailed = false;
  const placeOne = (key, needAccess, accept) => {
    if (!avail().has(key)) return false;
    const fk = key + (accept ? accept.toString() : '') + (needAccess ? 'n' : '');
    if ((failUntil[fk] || 0) > sim.minutes) return false;
    scanFailed = false;
    const r0 = placeOne0(key, needAccess, accept);
    if (!r0 && scanFailed && (NEW || key === 'water_tank')) failUntil[fk] = sim.minutes + 90;
    return r0;
  };
  const placeOne0 = (key, needAccess, accept) => {
    // houses first: infrastructure beyond the minimum waits until the cash for the remaining houses is set aside
    if (['water_tank', 'farm', 'solar_plant', 'wind_turbine', 'factory_small'].includes(key)) {
      const hk0 = houseKey(), left = Math.max(0, Math.ceil(popT / (CAP[hk0] || 4)) - (counts[hk0] || 0));
      const minimum = key === 'farm' ? Math.max(farmT, 1) : 1;
      if ((key === 'wind_turbine' || key === 'solar_plant') && (counts.wind_turbine || 0) + (counts.solar_plant || 0) >= 2 + (NEW ? Math.ceil(((counts.farm || 0) + 2 * (counts.factory_small || 0)) / 3) : 0) + Math.ceil(((counts.house_small || 0) + (counts.house_medium || 0)) / 2)) return false;
      const energyBonus = (key === 'wind_turbine' || key === 'solar_plant') && ((eco.s.esat < 1 && o.some((x) => x.bonus && x.type === 'energyBalance')) || (NEW && eco.s.esat < 0.75 && eco.s.pop > 30 && (counts.wind_turbine || 0) < 10));
      const foodShort = key === 'farm' && eco.s.foodProd < eco.s.foodDemand * (NEW && o.some((x) => x.type === 'needsDuring') ? 1.6 : 1.05);
      if (!energyBonus && !foodShort && (counts[key] || 0) >= minimum && eco.funds - eco.costOf(key) < left * eco.costOf(hk0) * 0.6 + (key === 'factory_small' ? 0 : Math.max(0, (facT || 0) - (counts.factory_small || 0)) * 950)) return false;
    }
    // a farm costs 400 + upkeep: stop at what the goals and the town need
    if (key === 'farm' && ((counts.farm || 0) >= (NEW ? 16 : st.id === 's5' ? 5 : 8) || ((counts.farm || 0) >= Math.max(num('farmsIrrigated') || 0, 2) && eco.s.foodProd >= eco.s.foodDemand * (NEW && o.some((x) => x.type === 'needsDuring') ? 1.9 : 1.1)))) return false;
    // a tank only stores what flows in: do not stack empty tanks
    if (key === 'water_tank' && (counts.water_tank || 0) >= Math.max(NEW && o.some((x) => x.type === 'waterStored') ? 4 : 2, ...o.filter((x) => x.type === 'build' && x.key === 'water_tank').map((x) => x.n))) return false;
    // slow build: houses (and their upkeep) wait 90 game minutes apart once there are 3
    if (key.startsWith('house') && (counts[key] || 0) >= 3 && sim.minutes - lastHouseMin < 0) return false;
    const cost = eco.costOf(key);
    if (key==='farm'){out.fdb2=out.fdb2||{};out.fdb2.reach=(out.fdb2.reach||0)+1;}
    if (!eco.canAfford(cost)) return false;
    const list = scan(key);
    if (key==='farm'){out.fdb2.list=list.length;}
    let attempts = 0;
    for (const [i, j] of list) {
      const ev = bs.evaluate(key, i, j);
      if (!ev.ok) continue;              // stale candidate (road/other building now there)
      if (attempts >= 400) break;
      attempts++;
      const r = bs.place(key, i, j, 0, { force: true, silent: true });
      if (!r || !r.ok) continue;
      const b = r.building;
      let linked = !!bs.accessCell(b);
      if (!linked && NEW && key === 'farm' && needAccess && (!accept || accept(b))) {
        const tg = bs.nearestRoadTile(b, 40), fr = tg && bs.accessTileFor(b, tg), rt = fr && bs.routeCells(fr, tg);
        if (rt && rt.ok && rt.cells.length <= 40) {
          const need = rt.cells.reduce((a, [ci, cj]) => a + (bs.occAt(ci, cj) === -1 ? 0 : eco.costOf(bs.router._eval(ci, cj)?.bridge ? 'bridge' : 'road')), 0);
          if (eco.funds - cost >= need) {
            let spent = 0;
            for (const [ci, cj] of rt.cells) {
              if (bs.occAt(ci, cj) === -1) continue;
              const br = !!bs.router._eval(ci, cj)?.bridge;
              const rr = bs.placeRoad(ci, cj, true, { bridge: br });
              if (rr && rr.ok) { eco.charge(eco.costOf(br ? 'bridge' : 'road')); spent++; if (br) bridgeTiles++; else roadTiles++; }
            }
            bs.net.build(); candCache = {};
            linked = !!bs.accessCell(b);
            out.spur = (out.spur || 0) + (linked ? 1 : 0);
          }
        }
      }
      const wetSpot = (key === 'farm' || key.startsWith('house')) && bs.floodInfo(b).depth > 0.3;   // next to deep water: counts as flooded
      const ok = !wetSpot && (!needAccess || linked) && (!accept || accept(b));
      if (!ok) { if(key==='farm'){const d=out.fdb2;d.wet=(d.wet||0)+(wetSpot?1:0);d.nolink=(d.nolink||0)+((needAccess&&!linked)?1:0);d.acc=(d.acc||0)+((accept&&!accept(b))?1:0);} bs.remove(b.id); continue; }
      if (key === 'farm') (out.fl = out.fl || []).push([b.cx, b.cz, +bs.floodInfo(b).depth.toFixed(2), Math.round(sim.minutes / 60)]);
      eco.charge(cost);
      counts[key] = (counts[key] || 0) + 1;
      if (key.startsWith("house")) lastHouseMin = sim.minutes;
      return true;
    }
    scanFailed = true;
    return false;
  };
  const placeSource = () => {
    if (!eco.canAfford(eco.costOf('source'))) return false;
    for (let j = 24; j < 104; j += 2) for (let i = 22; i < 106; i += 2) {
      const ev = bs.evaluateSource(i, j);
      if (!ev || !ev.ok) continue;
      const r = bs.placeSource(i, j, 4);
      if (r) { eco.charge(eco.costOf('source')); counts.source = (counts.source || 0) + 1; return true; }
    }
    return false;
  };

  // ---- what this stage needs, from its own objectives
  const o = st.objectives;
  const NEW = st.id === 's8' || st.id === 's9';   // newer bot behaviours only where the older bot could not win
  const num = (type) => Math.max(0, ...o.filter((x) => x.type === type).map((x) => x.n || 0));
  const popT = num('population') || 20;
  const facT = num('poweredFactories') || Math.ceil(num('jobs') / 12) || 0;
  const fundsT = Math.max(0, ...o.filter((x) => x.type === 'funds' && !x.bonus).map((x) => x.n || 0));
  const farmT = Math.max(num('farmsIrrigated'), 0);
  const houseKey = () => (avail().has('house_medium') && popT >= 80 ? 'house_medium' : 'house_small');
  out.plan = { popT, facT, fundsT, farmT };

  const doneRequired = () => c.objectives().filter((x) => !x.bonus || x.type === 'funds').every((x) => x.done);
  const finished = () => c.run && c.run.status !== 'playing';

  sim.setSpeed(1);
  let steps = 0, fails = 0;
  const maxSteps = opts.maxSteps || 6000;
  const totalB = () => Object.values(counts).reduce((a, b) => a + b, 0);
  // always keep a cushion for upkeep: every building bills per hour, so a town
  // built on an empty treasury starves itself even when needs are met.
  const reserve = () => Math.max(fundsT ? fundsT - 1200 : 0, 0) + 10 * totalB() + 200;
  let lastH = -1;
  let facRetry = 0, windRetry = 0;
  while (steps < maxSteps && !doneRequired() && !finished()) {
    if (performance.now() - t0 > (opts.budgetMs || 100000)) { out.budget = true; break; }
    if (steps % 150 === 0) {
      for (const b of [...bs.buildings.values()]) {
        if (!b.key.startsWith('house') || b.state.residents > 0) continue;
        if (bs.floodInfo(b).depth > 0.5) { bad.push([b.cx, b.cz]); bs.remove(b.id); counts[b.key] = Math.max(0, (counts[b.key] || 1) - 1); out.flooded = (out.flooded || 0) + 1; }
      }
    }
    if (NEW && steps % 3 !== 0) { sim.update(0.1); tr.update(0.1, sim); steps++; continue; }
    const s = eco.s;
    const f = eco.funds;
    const rich = f > reserve() + 300;
    // needs must have a buffer before another house: a starved house empties the town
    const waterOk = !eco.needs.has('water') || (s.wsat >= 0.85 && s.waterStock > s.waterDemand * 6);
    const foodOk = !eco.needs.has('food') || (s.fsat >= 0.85 && (eco.food > s.foodDemand * 2 || (NEW && s.foodProd >= s.foodDemand * 0.95)));
    const canGrowTown = waterOk && foodOk;
    out.gate = { waterOk, foodOk, f: Math.round(f), wsat: s.wsat, fsat: s.fsat, ws: Math.round(s.waterStock), wd: s.waterDemand, food: Math.round(eco.food), fp: s.foodProd, fd: s.foodDemand };
    const hr = sim.minutes / 60 % 24;
    let acted = false;
    // saving mode: only the funds goal is left, so stop spending (the upkeep of extra buildings delays it)
    const objNow = c.objectives();
    const saving = fundsT > 0 && objNow.filter((x) => !x.bonus && x.type !== 'funds').every((x) => x.done) && !objNow.filter((x) => x.bonus && x.type === 'energyBalance').some((x) => !x.done && eco.s.esat < 1);
    if (saving && eco.funds < fundsT + 50) { sim.update(0.1); tr.update(0.1, sim); steps++; continue; }
    // bonus goals count for the third star: do the cheap ones early
    for (const ob of o) { if (ob.bonus && ob.type === 'sources' && (counts.source || 0) < ob.n) { acted = placeSource(); break; } }
    // 1) objectives that name a building outright (build / waterStored / foodStock)
    for (const ob of o) {
      if (ob.bonus || ob.type !== 'build') continue;
      if ((counts[ob.key] || 0) >= ob.n) continue;
      acted = placeOne(ob.key, ob.key.startsWith('house'), ob.key === 'farm' ? (b) => bs.irrigation(b).label !== 'None nearby' : null);
      break;
    }
    if (!acted) for (const ob of o) {
      if (ob.bonus) continue;
      if (ob.type === 'waterStored' && eco.s.waterStock < ob.n) { acted = placeOne('water_tank', false); break; }
      if (ob.type === 'foodStock' && eco.s.foodStock < ob.n) { acted = placeOne('farm', true, (b) => bs.irrigation(b).label !== 'None nearby'); break; }
      if (ob.type === 'farmsIrrigated' && eco.s.farmsGood < ob.n) { acted = placeOne('farm', true, (b) => bs.irrigation(b).label !== 'None nearby'); break; }
    }
    const hk = houseKey(), houseCap = Math.ceil(popT / (CAP[hk] || 4)) + 1;
    const droughtHold = NEW && o.some((x) => x.type === 'needsDuring') && sim.minutes / 60 < 62 && (counts[hk] || 0) >= 9;
    const foodRoom = !NEW || !droughtHold && (!eco.needs.has('food') || (counts[hk] || 0) < 3 + Math.floor(s.foodProd / ((CAP[hk] || 4) * 2 * 0.9)));
    if (NEW && eco.needs.has('energy') && eco.s.esat < 0.75 && eco.s.pop > 30 && f > 650 && (counts.wind_turbine || 0) < 10) { acted = placeOne('wind_turbine', false); if (!acted) windRetry = steps + 200; }
    if (!acted && (counts[hk] || 0) < 2) acted = placeOne(hk, true);
    else if (!acted && f > 350 && canGrowTown && foodRoom && (counts[hk] || 0) < houseCap) acted = placeOne(hk, true);
    if (!acted && f > 950 && facT && (counts.factory_small || 0) < facT && s.pop > 20 && steps >= (facRetry || 0)) {
      acted = placeOne('factory_small', true);
      if (!acted) { facRetry = steps + 150; out.facFail = (out.facFail || 0) + 1; nextRow(); }
    }
    if (!acted && f > 500 && eco.needs.has('water') && s.waterStock < Math.max(600, s.waterDemand * 4)) acted = placeOne('water_tank', false);
    if (!acted && f > 420 && eco.needs.has('food') && s.foodProd < s.foodDemand * (NEW && o.some((x) => x.type === 'needsDuring') ? 1.9 : 1.25) + 5) {
      out.fb = (out.fb || 0) + 1;
      acted = placeOne('farm', true, (b) => bs.irrigation(b).label === 'Excellent')
           || placeOne('farm', true, (b) => bs.irrigation(b).label !== 'None nearby')
           || (NEW && s.foodProd < s.foodDemand * (o.some((x) => x.type === 'needsDuring') ? 1.9 : 1.1) && placeOne('farm', true))
           || (!NEW && placeOne('farm', false));
    }
    if (out.fb && !acted) out.fbFail = (out.fbFail || 0) + 1;
    if (!acted && f > 300 && eco.needs.has('energy') && s.esat < 0.98) acted = placeOne('wind_turbine', false);
    if (!acted && rich && eco.needs.has('water') && s.wsat < 0.6 && (counts.source || 0) < 4) acted = placeSource();
    if (!acted && rich && s.pop >= popT && s.fsat < 0.8) acted = placeOne('farm', true);
    if (!acted && rich && eco.needs.has('energy') && s.esat < 0.8) acted = placeOne('wind_turbine', false);
    if (!acted && f > 350 && canGrowTown && foodRoom && (counts[hk] || 0) < houseCap) acted = placeOne(hk, true) || placeOne(hk, false);
    if (!acted && !rich && s.pop === 0 && (counts[hk] || 0) < 3) acted = placeOne(hk, false);
    if (!acted) { fails++; if (fails > 60 && eco.funds > reserve() + 1500) { if (nextRow()) fails = 0; } }
    else fails = 0;

    sim.update(0.1);
    tr.update(0.1, sim);
    steps++;
    if (steps % 50 === 0) window.__dbg = [steps, Math.round(sim.minutes), Object.keys(counts).map((k) => k + counts[k]).join(','), Math.round(eco.funds)];
    const h = Math.floor((c.run ? c.run.elapsedGh : 0));
    if (h !== lastH) {
      lastH = h;
      out.log.push([h, eco.s.pop, Math.round(eco.funds), eco.s.wsat.toFixed(2), eco.s.fsat.toFixed(2), eco.s.esat.toFixed(2), eco.stats.trips || 0, Math.max(0, ...[...bs.buildings.values()].filter((b) => b.key === 'farm').map((b) => +bs.floodInfo(b).depth.toFixed(2)))]);
    }
  }
  sim.setSpeed(1);

  const obj = c.objectives().map((x) => ({ id: x.id, type: x.type, bonus: x.bonus, done: x.done, v: x.v, target: x.target }));
  const res = c.run && c.run.result;
  out.ok = !!(res && res.win);
  out.status = c.run ? c.run.status : 'none';
  out.steps = steps;
  out.hours = +((c.run ? c.run.elapsedGh : 0).toFixed(1));
  out.funds = Math.round(eco.funds);
  out.pop = eco.s.pop;
  out.connected = eco.s.connected;
  out.trips = eco.stats.trips || 0;
  out.cars = eco.s.cars;
  out.stability = +eco.stability.toFixed(1);
  out.built = counts;
  out.fdbg = { ws: Math.round(eco.s.waterStock), wd: +eco.s.waterDemand.toFixed(1), food: Math.round(eco.food), fp: +eco.s.foodProd.toFixed(1), fd: +eco.s.foodDemand.toFixed(1), wsat: eco.s.wsat, fsat: eco.s.fsat, houses: eco.s.houses, hp: eco.s.housePop, conn: eco.s.connectedHouses, esat: eco.s.esat };
  out.hs = [...bs.buildings.values()].filter((b) => b.key.startsWith('house')).map((b) => [b.state.residents, +bs.floodInfo(b).depth.toFixed(2), !!bs.accessCell(b)]);
  out.fm = [...bs.buildings.values()].filter((b) => b.key === 'farm').map((b) => [bs.irrigation(b).label, +bs.floodInfo(b).depth.toFixed(2), !!bs.accessCell(b), b.cx, b.cz]);
  candCache = {}; out.farmSpots = scan('farm').length; out.farmSpotsWet = (() => { let n = 0; for (const [i, j] of scan('farm')) { const ir = bs.irrigation({ cx: i, cz: j, w: 2, d: 2 }).label; if (ir !== 'None nearby') n++; } return n; })();
  out.cg = eco.canGrow(); out.ml = eco.mustLeave();
  out.roads = roadTiles; out.bridges = bridgeTiles;
  out.objectives = obj;
  out.missing = obj.filter((x) => !x.done && !x.bonus).map((x) => x.type + ':' + x.v + '/' + x.target);
  out.reason = res ? res.reason : null;
  out.stars = res ? res.stars : 0;
  out.ms = Math.round(performance.now() - t0);
  return out;
};
