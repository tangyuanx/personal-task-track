const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createPointerAdapter } = require('./pointer-adapter.cjs');

const finiteRect = r => r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k])) && r.width >= 8 && r.height >= 8;
const inside = (p, r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const equalBounds = (a, b) => ['x', 'y', 'width', 'height'].every(k => a[k] === b[k]);

function createPointerContinuity({ app, ipcMain, screen, getMainWindow, adapter: providedAdapter, platform = process.platform, now = Date.now, record = () => {} }) {
  let armed = null, plan = null, sequence = 0;
  const audits = [];
  const adapter = providedAdapter || createPointerAdapter({ app, platform, onFailure: () => cancel('adapter-unavailable') });
  const rendererURL = pathToFileURL(path.resolve(__dirname, '../renderer/index.html')).href;
  const nativePoint = point => platform === 'win32' ? screen.dipToScreenPoint({ x: Math.round(point.x), y: Math.round(point.y) }) : point;
  const dipPoint = point => platform === 'win32' ? screen.screenToDipPoint({ x: point[0], y: point[1] }) : { x: point[0], y: point[1] };
  function saveAudit(token, result, reason) {
    const value = { ...token.audit, result, reason, observed: screen.getCursorScreenPoint() };
    audits.push(value); if (audits.length > 24) audits.shift(); record(value);
  }
  function cancel(reason = 'user-input') {
    armed = null;
    const old = plan; plan = null;
    if (!old) return;
    clearTimeout(old.timer); saveAudit(old, 'cancelled', reason);
    void adapter.request('cancel');
  }
  function windowFor(event, focus = true) {
    const win = getMainWindow();
    return win && !win.isDestroyed() && !win.webContents.isDestroyed() && event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame && event.senderFrame?.url?.split('?')[0] === rendererURL &&
      (!focus || win.isFocused()) ? win : null;
  }
  function unchanged(token) {
    const win = getMainWindow();
    return win === token.window && win && !win.isDestroyed() && win.isFocused() &&
      win.webContents.getZoomFactor() === token.zoom && equalBounds(win.getContentBounds(), token.bounds);
  }
  function watchdog(token) {
    clearTimeout(token.timer);
    token.timer = setTimeout(() => { if (plan === token) cancel('frame-stream-stalled'); }, 80);
  }
  function register() {
    ipcMain.on('pointer-continuity:cancel', event => { if (windowFor(event, false)) cancel(); });
    ipcMain.on('pointer-continuity:arm', (event, value) => {
      const win = windowFor(event);
      if (!win) return;
      cancel('new-press');
      if (!win || !adapter.available() || !value || typeof value.key !== 'string' || value.key.length > 4000 ||
        !Number.isFinite(value.time) || Math.abs(now() - value.time) > 500 || !finiteRect(value.rect) ||
        !finiteRect(value.buttonRect) || !Number.isFinite(value.x) || !Number.isFinite(value.y) ||
        !inside(value, value.rect) || !inside(value, value.buttonRect)) return;
      const bounds = win.getContentBounds(), zoom = win.webContents.getZoomFactor();
      const origin = { x: bounds.x + value.x * zoom, y: bounds.y + value.y * zoom };
      if (!inside(origin, bounds) || distance(screen.getCursorScreenPoint(), origin) > 3) return;
      armed = { ...value, window: win, bounds: { ...bounds }, zoom, armedAt: now() };
    });
    ipcMain.handle('pointer-continuity:start', async (event, value) => {
      const arm = armed; armed = null;
      if (!windowFor(event) || !adapter.available() || !arm || plan || value?.key !== arm.key || now() - arm.armedAt > 500 || !finiteRect(value.rect)) return { ok: false };
      const r = value.rect, zoom = arm.zoom, bounds = arm.bounds;
      const displacement = distance(r, arm.rect) * zoom;
      const offset = { x: arm.x - arm.rect.x, y: arm.y - arm.rect.y };
      const origin = { x: bounds.x + arm.x * zoom, y: bounds.y + arm.y * zoom };
      const destination = { x: bounds.x + (r.x + offset.x) * zoom, y: bounds.y + (r.y + offset.y) * zoom };
      if (displacement < 12 || displacement > 300 || offset.x >= r.width || offset.y >= r.height ||
        !inside(destination, bounds) || distance(screen.getCursorScreenPoint(), origin) > 3) return { ok: false };
      const token = { ...arm, token: `${process.pid}:${++sequence}`, offset, origin, started: now(), busy: false,
        audit: { mode: 'group-frame-tracking', control: arm.key, origin, destination, samples: [], time: now() } };
      plan = token;
      const result = await adapter.request('begin', { token: token.token });
      if (plan !== token) return { ok: false };
      if (!result.ok || !result.point || distance(dipPoint(result.point), origin) > 3 || !unchanged(token)) {
        cancel(result.reason || 'user-moved-before-start'); return { ok: false };
      }
      watchdog(token); return { ok: true };
    });
    ipcMain.handle('pointer-continuity:frame', async (event, value) => {
      const token = plan;
      if (!token || !windowFor(event) || value?.key !== token.key) return { ok: false };
      if (token.busy) return { ok: false, reason: 'frame-in-flight' };
      const r = value.rect, button = value.buttonRect;
      if (!finiteRect(r) || !finiteRect(button) || !Number.isFinite(value.time) || Math.abs(now() - value.time) > 50 ||
        now() - token.started > 400 || !unchanged(token)) { cancel('invalid-or-stale-frame'); return { ok: false }; }
      const local = { x: r.x + token.offset.x, y: r.y + token.offset.y };
      const point = { x: token.bounds.x + local.x * token.zoom, y: token.bounds.y + local.y * token.zoom };
      // A changed group layout must never send the original offset onto a sibling.
      if (distance(r, token.rect) * token.zoom > 300 || !inside(local, r) || !inside(local, button) || !inside(point, token.bounds)) {
        cancel('group-reordered-or-outside-range'); return { ok: false };
      }
      let target = nativePoint(point);
      const display = screen.getDisplayNearestPoint({ x: Math.floor(point.x), y: Math.floor(point.y) });
      // Keep subpixel edge presses in the intersection after physical rounding.
      // This only adjusts an unavoidable fraction of a physical pixel; the
      // operation-group offset is never scaled or recentered.
      const clip = {
        x: Math.max(token.bounds.x + Math.max(r.x, button.x, 0) * token.zoom, display.bounds.x),
        y: Math.max(token.bounds.y + Math.max(r.y, button.y, 0) * token.zoom, display.bounds.y),
        width: 0, height: 0,
      };
      const right = Math.min(token.bounds.x + Math.min(r.x + r.width, button.x + button.width) * token.zoom, token.bounds.x + token.bounds.width, display.bounds.x + display.bounds.width);
      const bottom = Math.min(token.bounds.y + Math.min(r.y + r.height, button.y + button.height) * token.zoom, token.bounds.y + token.bounds.height, display.bounds.y + display.bounds.height);
      clip.width = right - clip.x; clip.height = bottom - clip.y;
      const physical = platform === 'win32' ? screen.dipToScreenRect(null, clip) : clip;
      const minX = Math.ceil(physical.x), minY = Math.ceil(physical.y);
      const maxX = Math.ceil(physical.x + physical.width) - 1, maxY = Math.ceil(physical.y + physical.height) - 1;
      if (minX > maxX || minY > maxY) { cancel('no-physical-landing'); return { ok: false }; }
      target = { x: Math.max(minX, Math.min(maxX, Math.round(target.x))), y: Math.max(minY, Math.min(maxY, Math.round(target.y))) };
      const roundedDip = platform === 'win32' ? screen.screenToDipPoint(target) : { x: Math.round(target.x), y: Math.round(target.y) };
      const roundedLocal = { x: (roundedDip.x - token.bounds.x) / token.zoom, y: (roundedDip.y - token.bounds.y) / token.zoom };
      if (!inside(roundedLocal, r) || !inside(roundedLocal, button)) { cancel('edge-rounding-outside-control'); return { ok: false }; }
      let hwnd;
      if (platform === 'win32') {
        const handle = token.window.getNativeWindowHandle();
        hwnd = (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString();
      }
      token.busy = true;
      const result = await adapter.request('step', { token: token.token, point: [target.x, target.y], time: value.time,
        pid: process.pid, hwnd, tolerance: 1.5 * (platform === 'win32' ? display.scaleFactor : 1) });
      token.busy = false;
      if (plan !== token) return { ok: false };
      if (!result.ok || !unchanged(token)) { cancel(result.reason || 'window-changed'); return { ok: false }; }
      token.last = point;
      const observed = dipPoint(result.point);
      token.audit.samples.push({ elapsed: now() - token.started, target: point, observed, error: distance(point, observed) });
      if (token.audit.samples.length > 60) token.audit.samples.shift();
      watchdog(token); return { ok: true };
    });
    ipcMain.handle('pointer-continuity:finish', (event, value) => {
      const token = plan;
      if (!token || !windowFor(event) || value?.key !== token.key || token.busy) return { ok: false };
      if (!unchanged(token) || distance(screen.getCursorScreenPoint(), token.last || token.origin) > 1.5) {
        cancel('user-moved-at-finish'); return { ok: false };
      }
      plan = null; clearTimeout(token.timer); saveAudit(token, 'completed'); void adapter.request('cancel'); return { ok: true };
    });
    ipcMain.handle('pointer-continuity:status', event => windowFor(event, false) ?
      { available: adapter.available(), platform, last: audits.at(-1) || null } : { available: false });
    for (const name of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(name, () => cancel('display-changed'));
  }
  function attach(win) {
    for (const name of ['blur', 'move', 'resize', 'minimize', 'close', 'enter-full-screen', 'leave-full-screen']) win.on(name, () => cancel(`window-${name}`));
    win.webContents.on('before-input-event', () => cancel('keyboard'));
    win.webContents.on('zoom-changed', () => cancel('zoom-changed'));
    win.webContents.on('did-start-loading', () => cancel('navigation'));
    win.webContents.on('render-process-gone', () => cancel('renderer-gone'));
  }
  return { register, attach, start: () => adapter.start(), cancel, stop() { cancel('quit'); adapter.stop(); } };
}
module.exports = { createPointerContinuity, finiteRect, inside };
