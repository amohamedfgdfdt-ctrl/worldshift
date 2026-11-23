// Pointer / touch / keyboard input for the 3D canvas. Only events that start on
// the canvas are handled, so UI buttons never fight with camera gestures.
import { Emitter } from './utils.js';

const TAP_MOVE = { mouse: 5, touch: 10 };

export class Controls extends Emitter {
  constructor(canvas, rig) {
    super();
    this.canvas = canvas; this.rig = rig;
    this.touchMode = 'rotate';       // what one finger does: 'rotate' | 'pan'
    this.brushMode = false;          // water brush tools take over the primary button
    this.pointers = new Map();
    this.keys = new Set();
    this.gesture = null;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e, true));
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.pointers.size) this.emit('leave'); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.ctrlKey ? 0.004 : 0.0011;
      this.rig.zoomBy(Math.exp(e.deltaY * k));
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault());
  }

  _down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), type: e.pointerType, button: e.button, moved: false, action: null };
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.maxPointers = 1;
      if (p.type === 'mouse') {
        if (e.button === 2) p.action = this.brushMode ? 'orbit' : 'pan';
        else if (e.button === 1 || e.shiftKey) p.action = 'pan';
        else if (this.brushMode) { p.action = 'brush'; this.emit('brushstart', { x: e.clientX, y: e.clientY }); }
        else p.action = 'orbit';
      } else if (this.brushMode) {
        p.action = 'pending';
        p.timer = setTimeout(() => {
          if (this.pointers.has(p.id) && !p.moved && this.pointers.size === 1) {
            p.action = 'brush';
            this.emit('brushstart', { x: p.x, y: p.y });
          }
        }, 260);
      } else p.action = this.touchMode === 'pan' ? 'pan' : 'orbit';
    } else {
      this.maxPointers = Math.max(this.maxPointers, this.pointers.size);
      for (const q of this.pointers.values()) {
        if (q.action === 'brush') this.emit('brushend');
        clearTimeout(q.timer); q.action = 'pinch'; q.moved = true;
      }
      this._pinchInit();
    }
  }

  _pinchInit() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.emit('hover', { x: e.clientX, y: e.clientY, type: 'mouse' });
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_MOVE[p.type === 'mouse' ? 'mouse' : 'touch']) {
      p.moved = true;
      if (p.action === 'pending') { clearTimeout(p.timer); p.action = this.touchMode === 'pan' ? 'pan' : 'orbit'; }
    }
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (this.pinch.d > 1 && d > 1) this.rig.zoomBy(this.pinch.d / d);
      this.rig.pan(cx - this.pinch.cx, cy - this.pinch.cy);
      let da = ang - this.pinch.ang;
      if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      this.rig.rotateBy(-da);
      this.pinch = { d, ang, cx, cy };
      return;
    }
    switch (p.action) {
      case 'orbit': if (p.moved) this.rig.orbit(dx, dy); break;
      case 'pan': if (p.moved) this.rig.pan(dx, dy); break;
      case 'brush': this.emit('brushmove', { x: p.x, y: p.y }); break;
      default: break;
    }
    if (p.type === 'mouse' && p.action !== 'orbit' && p.action !== 'pan') this.emit('hover', { x: p.x, y: p.y, type: 'mouse' });
    if (p.type === 'mouse' && (p.action === 'orbit' || p.action === 'pan') && !p.moved) this.emit('hover', { x: p.x, y: p.y, type: 'mouse' });
  }

  _up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pointers.delete(e.pointerId);
    if (p.action === 'brush') this.emit('brushend');
    const tapOk = !cancelled && !p.moved && this.maxPointers === 1 && performance.now() - p.t0 < 600 && p.action !== 'brush';
    if (tapOk) this.emit('tap', { x: p.x, y: p.y, type: p.type, button: p.button });
    if (this.pointers.size === 1) {
      const q = [...this.pointers.values()][0];
      q.action = 'none'; q.moved = true;
      this.pinch = null;
    }
    if (this.pointers.size === 0) { this.pinch = null; this.maxPointers = 0; }
  }

  update(dt) {
    const k = this.keys;
    if (!k.size) return;
    const rig = this.rig;
    let rx = 0, rz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) rz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) rz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) rx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) rx -= 1;
    if (rx || rz) rig.moveLocal(rx, rz, rig.goal.dist * 0.9 * dt);
    if (k.has('KeyQ')) rig.rotateBy(1.6 * dt);
    if (k.has('KeyE')) rig.rotateBy(-1.6 * dt);
    if (k.has('Equal') || k.has('NumpadAdd')) rig.zoomBy(Math.exp(-1.4 * dt));
    if (k.has('Minus') || k.has('NumpadSubtract')) rig.zoomBy(Math.exp(1.4 * dt));
  }
}
