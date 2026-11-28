// First-run interactive tutorial (Stage G). Short guided steps with a spotlight
// on the real UI element, a few practical "do it yourself" steps, pause/resume/skip,
// persistent completion and a replay entry from the World settings panel.
// Only teaches mechanics that actually exist in the simulation.
import { i18n, t as tr } from './i18n.js';
import { TYPES } from './buildings.js';

const LS = 'worldshift.terra.tutorial';

export class Tutorial {
  constructor({ ui, world, sim }) {
    Object.assign(this, { ui, world, sim });
    this.steps = [
      { id: 'welcome' },
      { id: 'hud', sel: '.stats' },
      { id: 'build', sel: '[data-cat="buildings"]', open: 'buildings', wait: 'house' },
      { id: 'roads', sel: '[data-cat="infrastructure"]', open: 'infrastructure' },
      { id: 'water', sel: '[data-cat="infrastructure"]', open: 'infrastructure', wait: 'tank' },
      { id: 'food', sel: '[data-cat="nature"]', open: 'nature' },
      { id: 'energy', sel: '[data-cat="infrastructure"]' },
      { id: 'money', sel: '.stats' },
      { id: 'stability', sel: '#chip-status' },
      { id: 'disasters' },
      { id: 'time', sel: '#btn-play' },
    ];
    this.i = 0;
    this.active = false;
    this._baseline = 0;
    this._onChange = null;
    this.root = null;
    this._chip = null;
    this._loadState();
    i18n.on('change', () => { if (this.active) this._render(); this._renderResumeChip(); });
    window.addEventListener('resize', () => { if (this.active) this._layout(); });
  }

  _loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || 'null');
      this.state = s && typeof s === 'object' ? s : { done: false, step: 0, paused: false };
    } catch { this.state = { done: false, step: 0, paused: false }; }
  }
  _saveState() { try { localStorage.setItem(LS, JSON.stringify(this.state)); } catch { /* ignore */ } }

  get finished() { return !!this.state.done || !!this.state.skipped; }

  /** Auto-entry point: starts only for a player who never finished or skipped. */
  maybeAutoStart() {
    if (this.finished || this.active) return;
    if (this.state.paused) { this._renderResumeChip(); return; }   // resume where they left off
    this.start();
  }

  start(manual = false) {
    if (this.active) return;
    this.active = true;
    this.i = manual ? 0 : (this.state.paused ? this.state.step || 0 : 0);
    this.state = { done: false, step: this.i, paused: false };
    this._saveState();
    this._removeResumeChip();
    this.root = document.createElement('div');
    this.root.id = 'tutorial';
    this.root.innerHTML = `<div class="tut-spot" hidden></div><div class="tut-card" role="dialog" aria-live="polite"></div>`;
    document.getElementById('app').appendChild(this.root);
    this._render();
  }

  _stepTarget(step) {
    if (!step.sel) return null;
    return document.querySelector(step.sel);
  }

  _render() {
    const step = this.steps[this.i];
    if (!step) return this.finish();
    if (step.open) this.ui.openCategory(step.open);
    else this.ui.closePanel?.();
    const card = this.root.querySelector('.tut-card');
    const last = this.i === this.steps.length - 1;
    card.innerHTML = `
      <div class="tut-head"><b>${tr('tut.' + step.id + '.t')}</b><span class="tut-count">${i18n.num(this.i + 1)} / ${i18n.num(this.steps.length)}</span></div>
      <p>${tr('tut.' + step.id + '.d')}</p>
      ${step.wait ? `<p class="tut-wait">${iconHtml('hand', 14)} ${tr('tut.waiting')}</p>` : ''}
      <div class="tut-btns">
        <button class="btn small" data-t="skip">${tr('tut.skip')}</button>
        <button class="btn small" data-t="pause">${tr('tut.pause')}</button>
        <span style="flex:1"></span>
        ${step.wait ? '' : `<button class="btn small primary" data-t="next">${last ? tr('tut.finish') : tr('tut.next')}</button>`}
      </div>`;
    card.querySelector('[data-t="skip"]').onclick = () => this.skip();
    card.querySelector('[data-t="pause"]').onclick = () => this.pause();
    card.querySelector('[data-t="next"]')?.addEventListener('click', () => this.next());
    this._armWait(step);
    this._layout();
  }

  _layout() {
    if (!this.active) return;
    const step = this.steps[this.i];
    const spot = this.root.querySelector('.tut-spot');
    const card = this.root.querySelector('.tut-card');
    const el = this._stepTarget(step);
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 6;
      spot.hidden = false;
      spot.style.left = `${r.left - pad}px`;
      spot.style.top = `${r.top - pad}px`;
      spot.style.width = `${r.width + pad * 2}px`;
      spot.style.height = `${r.height + pad * 2}px`;
      // card: below the target when there is room, otherwise above; centered on it
      const cw = Math.min(340, innerWidth - 24);
      card.style.width = `${cw}px`;
      let cx = r.left + r.width / 2 - cw / 2;
      cx = Math.max(12, Math.min(innerWidth - cw - 12, cx));
      card.style.left = `${cx}px`;
      card.style.right = 'auto';
      const below = r.bottom + 12;
      if (below + 190 < innerHeight) { card.style.top = `${below}px`; card.style.bottom = 'auto'; }
      else { card.style.bottom = `${Math.max(12, innerHeight - r.top + 12)}px`; card.style.top = 'auto'; }
      card.style.transform = 'none';
    } else {
      spot.hidden = true;
      card.style.width = `${Math.min(340, innerWidth - 24)}px`;
      card.style.left = '50%'; card.style.right = 'auto';
      card.style.top = '50%'; card.style.bottom = 'auto';
      card.style.transform = 'translate(-50%,-50%)';
    }
  }

  _armWait(step) {
    this._disarmWait();
    if (!step.wait) return;
    const bs = this.world.buildings;
    const count = () => {
      let n = 0;
      for (const b of bs.buildings.values()) {
        const t = TYPES[b.key];
        if (step.wait === 'house' && t?.kind === 'house') n++;
        if (step.wait === 'tank' && t?.kind === 'tank') n++;
      }
      return n;
    };
    this._baseline = count();
    const onChange = () => {
      if (count() > this._baseline) {
        this._disarmWait();
        const card = this.root?.querySelector('.tut-card');
        if (card) card.classList.add('tut-done');
        setTimeout(() => this.next(), 550);
      }
    };
    this._onChange = bs.on('change', onChange);
  }
  _disarmWait() {
    if (this._onChange) { this._onChange(); this._onChange = null; }
  }

  next() {
    this._disarmWait();
    this.i++;
    this.state.step = this.i; this._saveState();
    if (this.i >= this.steps.length) this.finish();
    else this._render();
  }

  pause() {
    this.state = { ...this.state, step: this.i, paused: true };
    this._saveState();
    this._teardown();
    this._renderResumeChip();
  }

  skip() {
    this.state = { done: false, skipped: true, step: 0, paused: false };
    this._saveState();
    this._teardown();
  }

  finish() {
    this.state = { done: true, step: 0, paused: false };
    this._saveState();
    this._teardown();
    this.ui.toast(tr('tut.done.toast'), 'ok');
  }

  _teardown() {
    this._disarmWait();
    this.active = false;
    this.root?.remove();
    this.root = null;
  }

  _renderResumeChip() {
    this._removeResumeChip();
    if (this.active || !this.state.paused || this.finished) return;
    const d = document.createElement('button');
    d.className = 'tut-resume';
    d.innerHTML = `${iconHtml('help', 16)}<span>${tr('tut.resume')}</span>`;
    d.onclick = () => { this._removeResumeChip(); this.start(); };
    document.getElementById('app').appendChild(d);
    this._chip = d;
  }
  _removeResumeChip() { this._chip?.remove(); this._chip = null; }
}

// Minimal inline icons (kept local so the tutorial does not depend on ui internals).
function iconHtml(name, size) {
  const paths = {
    hand: 'M4 11 V6 a1.5 1.5 0 0 1 3 0 v4 M7 10 V4.5 a1.5 1.5 0 0 1 3 0 V10 M10 10 V5.5 a1.5 1.5 0 0 1 3 0 V11 M13 11 V8 a1.5 1.5 0 0 1 3 0 v5 c0 4 -2.5 7 -6.5 7 S4 16.5 4 12.5 Z',
    help: 'M12 2 a10 10 0 1 0 0 20 a10 10 0 0 0 0 -20 Z M9.5 9 a2.5 2.5 0 0 1 5 .3 c0 1.7 -2.5 2 -2.5 3.7 M12 17 h.01',
  };
  const d = paths[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
