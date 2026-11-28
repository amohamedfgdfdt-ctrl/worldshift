// Game mode manager + Campaign UI: mode screen, stage list, HUD, objective tracker, results.
import { Campaign, MODE_KEY } from './campaign.js';
import { STAGES } from './campaign-data.js';
import { icon } from './icons.js';
import { i18n, t } from './i18n.js';
import { DEFAULT_SEED } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const hueOf = (i) => (250 + i * 37) % 360;

export class GameMode {
  constructor({ world, sim, tools, save, ui }) {
    this.world = world; this.sim = sim; this.tools = tools; this.save = save; this.ui = ui;
    this.eco = sim.economy; this.events = sim.events;
    this.campaign = new Campaign({ world, sim, save, tools });
    sim.campaign = this.campaign;
    this.mode = 'sandbox';
    this.app = document.getElementById('app');
    this.selected = null;
    save.hooks = {
      active: () => this.campaign.active || (!!this.campaign.run && this.campaign.run.status !== 'playing'),
      collect: () => ({ economy: this.eco.serialize(), events: this.events.serialize(), campaign: this.campaign.serializeRun() }),
      apply: (d) => { this.campaign.loadRun(d.campaign, d.economy, d.events); },
    };
    Object.defineProperty(tools, 'gate', { get: () => this.campaign.gate, set: () => {}, configurable: true });
    ui.gameMode = this;
    this._buildHud();
    this._bind();
    i18n.on('change', () => this._relang());
    this._relang();
  }

  get inCampaign() { return this.mode === 'campaign'; }

  // ------------------------------------------------------------ flow
  boot() {
    let m = null; try { m = localStorage.getItem(MODE_KEY); } catch { /* ignore */ }
    if (m === 'campaign') this.enterCampaign(); else if (m === 'sandbox') this.mode = 'sandbox'; else this.showModeScreen();
  }

  enterCampaign() {
    if (this.mode === 'sandbox' && this.save.slot === 'sandbox') this.save.save(true);   // flush the sandbox world first
    this.save.useSlot('campaign');
    this.mode = 'campaign';
    this.events.setAutoEnabled?.(false);
    if (this.events.setIntensity) this.events.setIntensity(1);
    try { localStorage.setItem(MODE_KEY, 'campaign'); } catch { /* ignore */ }
    this.eco.enforce = false;
    let resumed = false;
    if (this.save.hasSave()) resumed = this.save.load();
    if (!resumed || !this.campaign.run) this.showStages();
    this._syncHud(); this.ui.rebuildLang?.();
  }

  enterSandbox() {
    if (this.campaign.run) this.campaign.leave();
    this.eco.enforce = false; this.eco.needs = new Set();
    this.events.clear();
    this.save.useSlot('sandbox');
    this.mode = 'sandbox';
    this.events.setAutoEnabled?.(this.ui.settings?.get().disasters !== false);
    if (this.events.setIntensity) this.events.setIntensity({ mild: 0.6, normal: 1, severe: 1.5 }[this.ui.settings?.get().evPower] || 1);
    try { localStorage.setItem(MODE_KEY, 'sandbox'); } catch { /* ignore */ }
    if (this.save.hasSave()) this.save.load(); else this.save.newWorld(DEFAULT_SEED);
    this.sim.setRunning(true);
    this.ui.syncControls?.();
    this._syncHud(); this.ui.rebuildLang?.();
  }

  // ------------------------------------------------------------ screens
  _screen(html, cls = '') {
    this.closeScreen();
    const d = document.createElement('div');
    d.className = 'cmp-screen ' + cls; d.id = 'cmp-screen'; d.innerHTML = html;
    this.app.appendChild(d); this.screen = d;
    return d;
  }
  closeScreen() { this.screen?.remove(); this.screen = null; if (this._resume) { this._resume(); this._resume = null; } }

  showModeScreen() {
    const has = !!this.campaign.run || Object.keys(this.campaign.progress.stages).length > 0;
    const d = this._screen(`<div class="mode-wrap">
      <div class="logo-mark big"></div><h2>${t('mode.title')}</h2><p>${t('mode.sub')}</p>
      <div class="mode-cards">
        <button class="mode-card" data-go="campaign"><div class="cicon">${icon('flag', 24)}</div><h3>${t('mode.campaign')}</h3><p>${t('mode.campaign.d')}</p>${has ? `<small>${t('mode.continue')} · ${icon('star', 12)} ${i18n.num(this.campaign.totalStars())}</small>` : ''}</button>
        <button class="mode-card" data-go="sandbox"><div class="cicon">${icon('globe', 24)}</div><h3>${t('mode.sandbox')}</h3><p>${t('mode.sandbox.d')}</p></button>
      </div>
      <div style="margin-top:18px"><button class="btn" data-go="lang">${t('lang.toggle')}</button></div></div>`);
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      if (b.dataset.go === 'lang') { i18n.toggle(); return; }
      this.closeScreen();
      if (b.dataset.go === 'campaign') this.enterCampaign(); else this.enterSandbox();
    });
    this._modeScreen = true;
  }

  showStages(selectId) {
    const c = this.campaign, wasRunning = this.sim.running;
    if (c.active) this.sim.setRunning(false);
    const resumeId = c.run?.stageId;
    this.selected = selectId || this.selected || resumeId || (STAGES.find((s) => c.status(s.id) === 'open')?.id) || STAGES[0].id;
    const d = this._screen(`<div class="cmp-head">
        <button class="btn cmp-back" data-a="back">${i18n.lang === 'ar' ? '→' : '←'}</button>
        <h2>${t('camp.stages')}</h2>
        <span class="cmp-total">${icon('star', 18)} <span id="cmp-total"></span></span>
        <button class="btn" data-a="lang">${t('lang.toggle')}</button>
        <button class="btn" data-a="mode">${t('mode.switch')}</button>
        <button class="btn" data-a="close">${icon('x', 16)}</button></div>
      <div class="cmp-body" id="cmp-body"><div class="cmp-list" id="cmp-list"></div><div class="cmp-detail" id="cmp-detail"></div></div>`);
    this._resume = () => { if (wasRunning && this.campaign.active) this.sim.setRunning(true); };
    d.addEventListener('click', (e) => this._stagesClick(e));
    this._renderStages();
  }

  _renderStages() {
    const c = this.campaign;
    $('#cmp-total').textContent = `${i18n.num(c.totalStars())} / ${i18n.num(STAGES.length * 3)}`;
    const list = $('#cmp-list'); if (!list) return;
    list.innerHTML = STAGES.map((s, i) => {
      const st = c.status(s.id), n = c.stars(s.id);
      return `<button class="stage-card ${st} ${this.selected === s.id ? 'sel' : ''}" data-stage="${s.id}" style="--h:${hueOf(i)}">
        <span class="num">${t('camp.day').slice(0, 0)}${i18n.num(i + 1)}</span><span class="nm">${t(`st.${s.id}.name`)}</span>
        <span class="diff" title="${t('camp.difficulty')}">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= s.difficulty ? 'on' : ''}"></i>`).join('')}</span>
        <span class="row"><span class="badge ${st}">${st === 'locked' ? icon('lock', 12) : ''}${t('camp.' + (st === 'done' ? 'done' : st === 'open' ? 'open' : 'locked'))}</span>
        <span class="stars">${[0, 1, 2].map((k) => `<span class="${k < n ? 'on' : ''}">${icon('star', 15)}</span>`).join('')}</span></span></button>`;
    }).join('');
    this._renderDetail();
  }

  _renderDetail() {
    const c = this.campaign, id = this.selected, s = STAGES.find((x) => x.id === id), det = $('#cmp-detail'); if (!s || !det) return;
    const st = c.status(id), n = c.stars(id), info = c.info(id);
    const running = c.run && c.run.stageId === id && c.run.status === 'playing';
    const objs = s.objectives.map((o) => `<li class="${o.bonus ? 'bonus' : ''}"><span class="dot"></span><span>${c.label.call({ stageDef: s, _evType: (e) => s.events?.find((x) => x.id === e)?.type }, o)}${o.bonus ? `<span class="tag">${t('camp.bonus')}</span>` : ''}</span></li>`).join('');
    const rw = [...s.rewards.types.map((k) => `<span class="reward">${icon(k === 'farm' ? 'wheat' : k.includes('solar') ? 'sun' : k.includes('wind') ? 'wind' : k.includes('factory') ? 'factory' : 'house', 16)}${t('b.' + k)}</span>`), ...s.rewards.tools.map((k) => `<span class="reward">${icon(k, 16)}${k === 'drain' ? t('toast.unlock', { x: '' }).replace(/[:：]\s*$/, '') + ' ' : ''}${k === 'drain' ? 'Drain' : k}</span>`)].join('') || '—';
    const ev = (s.events || []).map((e) => `<span class="reward">${t('ev.' + e.type)} · ${t('camp.day')} ${i18n.num(Math.floor(e.at / 24) + 1)}</span>`).join('');
    det.innerHTML = `<div class="cmp-meta"><span class="badge ${st}">${t('camp.' + (st === 'done' ? 'done' : st === 'open' ? 'open' : 'locked'))}</span>
      <span class="diff">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= s.difficulty ? 'on' : ''}"></i>`).join('')}</span><span>${t('diff.' + s.difficulty)}</span>
      <span class="stars" style="margin-inline-start:auto">${[0, 1, 2].map((k) => `<span class="${k < n ? 'on' : ''}">${icon('star', 18)}</span>`).join('')}</span></div>
      <h3>${i18n.num(STAGES.indexOf(s) + 1)}. ${t(`st.${id}.name`)}</h3><p>${t(`st.${id}.desc`)}</p>
      <h4>${t('camp.env')}</h4><p>${t(`st.${id}.env`)}</p>${ev ? `<h4>${t('camp.events')}</h4><div class="rewards">${ev}</div>` : ''}
      <h4>${t('camp.objectives')}</h4><ul class="obj-list">${objs}</ul>
      <p style="font-size:12px">${t('camp.starsrule', { p2: i18n.num(s.par[0]), p3: i18n.num(s.par[1]), st: i18n.num(s.stab) })}</p>
      <h4>${t('camp.unlocks')}</h4><div class="rewards">${rw}</div>
      ${info ? `<p style="font-size:12px">${t('res.best')}: ${i18n.num(info.bestDays.toFixed(1))} ${t('res.days')} · ${t('res.stability')} ${i18n.num(info.bestStability)}%</p>` : ''}
      <div class="cmp-actions">${st === 'locked' ? `<button class="btn" disabled>${icon('lock', 16)} ${t('camp.locked')}</button>` :
        `${running ? `<button class="btn primary" data-a="resume">${t('camp.continue')}</button><button class="btn" data-a="play" data-id="${id}">${t('camp.restart')}</button>` : `<button class="btn primary" data-a="play" data-id="${id}">${st === 'done' ? t('camp.replay') : t('camp.play')}</button>`}`}</div>`;
  }

  _stagesClick(e) {
    const card = e.target.closest('[data-stage]');
    if (card) { this.selected = card.dataset.stage; this._renderStages(); $('#cmp-body')?.classList.add('detail'); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'back') $('#cmp-body')?.classList.remove('detail');
    else if (a === 'lang') i18n.toggle();
    else if (a === 'mode') { this.closeScreen(); this.showModeScreen(); }
    else if (a === 'close') { this.closeScreen(); if (!this.campaign.run) { this.enterSandbox(); } }
    else if (a === 'resume') this.closeScreen();
    else if (a === 'play') { this._resume = null; this.showBriefing(b.dataset.id); }
    else if (a === 'restart') {
      this._resume = null; const id = b.dataset.id;
      this.closeBriefing(); this.closeScreen();
      if (this.campaign.start(id)) this.ui.toast(t('toast.stage', { x: t(`st.${id}.name`) }), 'ok');
    }
    else if (a === 'bstart') {
      const id = this.briefId; this.closeBriefing(); this.closeScreen();
      if (this.campaign.start(id)) this.ui.toast(t('toast.stage', { x: t(`st.${id}.name`) }), 'ok');
    }
    else if (a === 'bback') this.closeBriefing();
  }

  // ------------------------------------------------------------ pre-stage briefing
  /** Short tutorial screen shown before a stage starts (AR + EN). */
  showBriefing(id) {
    const s = STAGES.find((x) => x.id === id); if (!s) return;
    this.briefId = id;
    let el = document.getElementById('cmp-brief');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cmp-brief'; el.className = 'cmp-screen brief-screen';
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        this._stagesClick({ target: b });
      });
      this.app.appendChild(el);
    }
    el.hidden = false;
    el.innerHTML = this._briefHtml(s);
    el.scrollTop = 0;
    el.querySelector('.brief-wrap')?.scrollTo?.(0, 0);
  }

  closeBriefing() {
    const el = document.getElementById('cmp-brief');
    if (el) { el.hidden = true; el.innerHTML = ''; }
    this.briefId = null;
  }

  _briefHtml(s) {
    const id = s.id, c = this.campaign, lang = i18n.lang;
    const has = (k) => !!i18n.dict[lang]?.[k] || !!i18n.dict.en?.[k];
    const sec = (key, ic) => {
      const items = [];
      for (let i = 0; has(`br.${id}.${key}.${i}`); i++) items.push(`<li>${t(`br.${id}.${key}.${i}`)}</li>`);
      if (!items.length) return '';
      return `<section class="brief-card ${key}"><h3>${icon(ic, 17)}<span>${t('br.' + key)}</span></h3><ul>${items.join('')}</ul></section>`;
    };
    const objs = s.objectives.map((o) => `<li class="${o.bonus ? 'bonus' : ''}"><span class="dot"></span><span>${c.label.call({ stageDef: s, _evType: (e) => s.events?.find((x) => x.id === e)?.type }, o)}${o.bonus ? `<span class="tag">${t('camp.bonus')}</span>` : ''}</span></li>`).join('');
    const popT = Math.max(0, ...s.objectives.filter((o) => o.type === 'population').map((o) => o.n || 0));
    // a house holds 4 residents; medium houses (8) are unlocked after stage 4
    const cap = STAGES.indexOf(s) >= 4 ? 8 : 4;
    const tip = `<p class="brief-math brief-tip">${t('br.tip')}</p>`;
    const math = popT ? `<p class="brief-math">${t('br.math', { n: i18n.num(popT), h: i18n.num(Math.ceil(popT / cap)) })}</p>` : '';
    const ev = (s.events || []).map((e) => `<span class="reward">${icon('wave', 15)}${t('ev.' + e.type)} · ${t('camp.day')} ${i18n.num(Math.floor(e.at / 24) + 1)}</span>`).join('');
    return `<div class="brief-wrap">
      <div class="brief-head"><span class="badge open">${t('camp.day')} ${i18n.num(STAGES.indexOf(s) + 1)}</span>
        <h2>${t(`st.${id}.name`)}</h2>
        <button class="icon-btn" data-a="bback" title="${t('br.back')}">${icon('x', 18)}</button></div>
      <p class="brief-desc">${t(`st.${id}.desc`)}</p>
      <div class="brief-grid">
        ${sec('stab', 'heart')}${sec('food', 'wheat')}${sec('road', 'road')}
        <section class="brief-card goals"><h3>${icon('target', 17)}<span>${t('br.goals')}</span></h3>
          <ul class="obj-list">${objs}</ul>${math}${tip}${ev ? `<div class="rewards">${ev}</div>` : ''}</section>
      </div>
      <div class="brief-actions"><button class="btn primary" data-a="bstart">${icon('play', 16)} ${t('br.start')}</button>
        <button class="btn" data-a="bback">${t('br.back')}</button></div>
    </div>`;
  }

  // ------------------------------------------------------------ HUD
  _buildHud() {
    const hud = document.createElement('div'); hud.id = 'cmp-hud'; hud.hidden = true;
    hud.innerHTML = `<div class="glass res-row" id="res-row"></div>
      <div class="glass evchip" id="ev-chip" hidden></div>
      <div class="glass tracker" id="tracker"><div class="th" data-a="tog"><b id="trk-title"></b><span class="pct" id="trk-pct"></span>▾</div>
        <div class="pbar" style="margin-top:6px"><i id="trk-bar"></i></div><div class="objs" id="trk-objs"></div><div class="hintbox" id="trk-hint" hidden></div></div>
      <div class="actions"><button class="btn glass" data-a="stages">${icon('menu', 16)} ${t('camp.menu')}</button></div>`;
    this.app.appendChild(hud); this.hud = hud;
    const lang = document.createElement('button'); lang.id = 'btn-lang'; lang.className = 'icon-btn'; lang.title = t('ui.lang'); lang.setAttribute('aria-label', t('ui.lang'));
    lang.onclick = () => i18n.toggle();
    const mode = document.createElement('button'); mode.id = 'btn-mode'; mode.className = 'icon-btn';
    mode.onclick = () => { this.showModeScreen(); };
    const gfx = document.getElementById('btn-gfx'); gfx.before(mode); gfx.before(lang);
    this.langBtn = lang; this.modeBtn = mode;
    hud.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'tog') $('#tracker').classList.toggle('collapsed');
      else if (b.dataset.a === 'stages') this.showStages();
    });
    if (window.matchMedia?.('(max-width: 860px)').matches) $('#tracker').classList.add('collapsed');
  }

  _relang() {
    this.langBtn.textContent = t('lang.toggle');
    this.langBtn.title = t('ui.lang'); this.langBtn.setAttribute('aria-label', t('ui.lang'));
    for (const [id, k] of [['btn-gfx', 'ui.gfxset'], ['btn-map', 'ui.worldmap'], ['btn-settings', 'ui.gamesettings'], ['rail', 'ui.categories']]) { const el = document.getElementById(id); if (el) { el.setAttribute('aria-label', t(k)); if (el.tagName === 'BUTTON') el.title = t(k); } }
    this.modeBtn.textContent = this.mode === 'campaign' ? t('mode.campaign') : t('mode.sandbox');
    this.modeBtn.title = t('mode.switch');
    const act = this.hud.querySelector('.actions .btn'); if (act) act.innerHTML = `${icon('menu', 16)} ${t('camp.menu')}`;
    this._ev = null; this._lastObj = ''; this.ui.rebuildLang?.();
    if (this.briefId && !document.getElementById('cmp-brief')?.hidden) this.showBriefing(this.briefId);
    if (this.screen) { if (this._modeScreen && $('.mode-wrap', this.screen)) { this.showModeScreen(); } else if ($('#cmp-list')) { const id = this.selected, wasDetail = $('#cmp-body').classList.contains('detail'); const keep = this._resume; this.showStages(id); this._resume = keep; if (wasDetail) $('#cmp-body').classList.add('detail'); } }
  }

  _syncHud() {
    const on = this.mode === 'campaign' && !!this.campaign.run;
    this.hud.hidden = !on;
    this.modeBtn.textContent = this.mode === 'campaign' ? t('mode.campaign') : t('mode.sandbox');
    if (on) this._renderHud(true);
  }

  _bind() {
    const c = this.campaign;
    c.on('start', () => { this._syncHud(); this.ui.toast(t('toast.stage', { x: t(`st.${c.run.stageId}.name`) }), 'ok'); });
    c.on('leave', () => this._syncHud());
    c.on('warn', ({ ev, hours }) => this.ui.banner(t('camp.event.soon', { ev: t('ev.' + ev.type), h: i18n.num(hours) }), t('ok'), () => {}));
    c.on('event', ({ ev }) => this.ui.toast(t('camp.event.start', { ev: t('ev.' + ev.type) }), 'warn'));
    this.events.on('end', (a) => { if (c.active) this.ui.toast(t('camp.event.end', { ev: t('ev.' + a.type) }), 'ok'); });
    c.on('finish', (r) => this.showResult(r));
    c.on('update', () => this._renderHud());
    this.eco.on('tick', () => { if (this.mode === 'campaign') this._renderHud(); });
    this.eco.on('funds', () => this._renderHud());
    this._poll = setInterval(() => { if (this.mode === 'campaign' && c.run) this._renderHud(); }, 1000);
  }

  _renderHud(force = false) {
    const c = this.campaign; if (!c.run || this.hud.hidden) return;
    const s = this.eco.s, e = this.eco, n = (v) => i18n.num(Math.round(v));
    const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? a / b * 100 : 100));
    const cls = (v) => (v >= 0.8 ? '' : v >= 0.4 ? 'warn' : 'bad');
    const req = (k) => e.needs.has(k);
    const items = [
      ['water', 'hud.water', 'source', pct(s.waterStock, Math.max(s.waterDemand * 8, 1)), req('water') ? cls(s.wsat) : '', n(s.waterStock), `−${n(s.waterDemand)}${t('hud.perh')}`],
      ['food', 'hud.food', 'food', pct(e.food, Math.max(s.foodCap, 1)), req('food') ? cls(s.fsat) : '', n(e.food), `${s.foodProd - (req('food') ? s.foodDemand : 0) >= 0 ? '+' : '−'}${n(Math.abs(s.foodProd - (req('food') ? s.foodDemand : 0)))}${t('hud.perh')}`],
      ['energy', 'hud.energy', 'bolt', pct(s.energyProd, Math.max(s.energyDemand, 1)), s.energyDemand > 0 ? cls(s.esat) : '', `${n(s.energyProd)}`, `/ ${n(s.energyDemand)}`],
      ['funds', 'hud.funds', 'coin', 100, e.funds < 0 ? 'bad' : '', n(e.funds), `${s.net >= 0 ? '+' : '−'}${n(Math.abs(s.net))}${t('hud.perh')}`],
      ['stab', 'hud.stability', 'heart', e.stability, e.stability >= 70 ? '' : e.stability >= 40 ? 'warn' : 'bad', `${n(e.stability)}%`, `${t('hud.pop')} ${n(s.pop)}`],
      ['traffic', 'hud.traffic', 'car', pct(s.cars, Math.max(1, this.world.traffic ? this.world.traffic.maxCars : 1)), s.houseAccess >= 0.6 ? '' : 'warn', n(s.cars), `${t('hud.access')} ${n(Math.round((s.houseAccess || 0) * 100))}%`],
    ];
    const row = $('#res-row');
    row.innerHTML = items.map(([k, lbl, ic, p, cl, v, sub]) => `<div class="res ${cl}" data-k="${k}"><div class="t">${icon(ic, 13)}${t(lbl)}</div><b>${v}</b><div class="bar"><i style="width:${p}%"></i></div><small>${sub}</small></div>`).join('');
    // event chip
    const ev = this.events.active, chip = $('#ev-chip');
    chip.hidden = !ev;
    if (ev) chip.innerHTML = `${icon('wave', 16)} ${t('ev.' + ev.type)} · ${i18n.num(Math.ceil(ev.remaining))} h`;
    // tracker
    const objs = c.objectives(), st = c.stageDef;
    const day = Math.floor(c.run.elapsedGh / 24) + 1;
    $('#trk-title').textContent = `${i18n.num(STAGES.indexOf(st) + 1)}. ${t(`st.${st.id}.name`)} · ${t('camp.day')} ${i18n.num(day)}`;
    const frac = c.run.status === 'won' ? 1 : c.progressFraction();
    $('#trk-pct').textContent = `${i18n.num(Math.round(frac * 100))}%`; $('#trk-bar').style.width = `${frac * 100}%`;
    const html = objs.map((o) => {
      let val = '';
      if (o.event) val = o.done ? '' : (o.v ? `${i18n.num(o.v)} / ${i18n.num(o.target)}` : '');
      else if (o.sustain) val = `${i18n.num(Math.min(o.v, o.target).toFixed(1))} / ${i18n.num(o.target)} h`;
      else val = `${i18n.num(Math.min(o.v, 1e9))} / ${i18n.num(o.target)}`;
      return `<div class="o ${o.done ? 'done' : ''} ${o.hold ? 'hold' : ''}"><div class="l"><span class="ck"></span><span>${o.label}${o.bonus ? `<span class="tag">${t('camp.bonus')}</span>` : ''}</span></div>${o.done ? '' : `<div class="v">${val}</div><div class="pbar"><i style="width:${o.frac * 100}%"></i></div>`}</div>`;
    }).join('');
    $('#trk-objs').innerHTML = html;
    const hk = c.hintKey(), hb = $('#trk-hint');
    hb.hidden = !hk || c.run.status !== 'playing' || (st.difficulty > 2 && c.run.elapsedGh > 6);
    if (hk) hb.textContent = `${t('camp.hint')}: ${t(hk)}`;
  }

  // ------------------------------------------------------------ result
  showResult(r) {
    if (!r) return;
    const c = this.campaign, s = STAGES.find((x) => x.id === r.stageId), next = c.nextStage(r.stageId);
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'cmp-result';
    const rw = r.newRewards.map((x) => `<span class="reward">${x.kind === 'type' ? t('b.' + x.key) : x.key}</span>`).join('');
    bg.innerHTML = `<div class="modal result" role="dialog" aria-modal="true">
      <h3>${r.win ? t('res.title.win') : t('res.title.fail')}</h3><div class="sub">${t(`st.${s.id}.name`)}${r.win ? '' : ' — ' + t(r.reason)}</div>
      ${r.win ? `<div class="bigstars">${[0, 1, 2].map((k) => `<span style="--i:${k}">${icon('star', 52).replace('class="ic ', `class="ic ${k < r.stars ? 'on' : ''} `)}</span>`).join('')}</div>` : ''}
      <div class="kvs"><div><span>${t('res.time')}</span><b>${i18n.num(r.days.toFixed(1))} ${t('res.days')}</b></div><div><span>${t('res.stability')}</span><b>${i18n.num(Math.round(r.stability))}%</b></div>
      <div><span>${t('res.min')}</span><b>${i18n.num(Math.round(r.minStability))}%</b></div><div><span>${t('res.pop')}</span><b>${i18n.num(r.pop)}</b></div><div><span>${t('res.funds')}</span><b>${i18n.num(r.funds)}</b></div>
      ${r.win ? `<div><span>${t('res.best')}</span><b>${i18n.num(Math.max(r.stars, r.prevBest))} ★</b></div>` : ''}</div>
      ${r.win ? `<p style="font-size:12px;color:var(--muted);margin:0 0 10px">${t('camp.starsrule', { p2: i18n.num(s.par[0]), p3: i18n.num(s.par[1]), st: i18n.num(s.stab) })}</p>` : ''}
      ${rw ? `<div class="rw"><h4 style="margin:0 0 6px;font-size:12px;color:var(--muted)">${t('res.new')}</h4><div class="rewards">${rw}</div></div>` : ''}
      <div class="btn-row">${r.win && next ? `<button class="btn primary" data-r="next">${t('res.next')}</button>` : r.win ? `<p style="margin:0">${t('res.allclear')}</p>` : ''}
        <button class="btn ${r.win ? '' : 'primary'}" data-r="retry">${t('res.retry')}</button><button class="btn" data-r="menu">${t('res.menu')}</button>${r.win ? `<button class="btn" data-r="keep">${t('res.sandbox')}</button>` : ''}</div></div>`;
    bg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const a = b.dataset.r; bg.remove();
      if (a === 'next') c.start(next.id);
      else if (a === 'retry') c.restart();
      else if (a === 'menu') { c.leave(); this._syncHud(); this.showStages(r.stageId); }
      else if (a === 'keep') { this.sim.setRunning(true); this._renderHud(); }
    });
    this.ui.el.modal.appendChild(bg);
    this.result = bg;
  }
}
