const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createPointerContinuity } = require('../app/main/pointer-continuity.cjs');

function fixture({ windows = false, offset = { x: 100, y: 20 } } = {}) {
  const handlers = new Map(), events = new Map(), audits = [], requests = [];
  let clock = Date.now(), cursor = { x: 500, y: 420 }, expected, activeNativeToken, stepGate;
  const physical = p => p.x >= 1000 ? { x: 2000 + (p.x - 1000) * 2, y: p.y * 2 } : { ...p };
  const toDip = p => p.x >= 2000 ? { x: 1000 + (p.x - 2000) / 2, y: p.y / 2 } : { ...p };
  const screen = new EventEmitter();
  Object.assign(screen, { getCursorScreenPoint: () => cursor, getDisplayNearestPoint: p => ({ scaleFactor: p.x >= 1000 ? 2 : 1, bounds: { x: p.x >= 1000 ? 1000 : 0, y: 0, width: p.x >= 1000 ? 2000 : 1000, height: 2000 } }),
    dipToScreenPoint: physical, screenToDipPoint: toDip,
    dipToScreenRect: (_win, r) => ({ ...physical(r), width: r.width * (r.x >= 1000 ? 2 : 1), height: r.height * (r.x >= 1000 ? 2 : 1) }) });
  const win = new EventEmitter(); win.bounds = { x: 100, y: 100, width: 1280, height: 760 }; win.focused = true; win.zoom = 1;
  win.webContents = new EventEmitter(); win.webContents.mainFrame = { url: pathToFileURL(path.resolve(__dirname, '../app/renderer/index.html')).href };
  Object.assign(win.webContents, { isDestroyed: () => false, getZoomFactor: () => win.zoom });
  Object.assign(win, { isDestroyed: () => false, isFocused: () => win.focused, getContentBounds: () => win.bounds, getNativeWindowHandle: () => Buffer.from('0100000000000000', 'hex') });
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  const adapter = {
    available: () => true, start: async () => true, stop() {},
    async request(op, value = {}) {
      requests.push({ op, ...value });
      if (op === 'cancel') activeNativeToken = null;
      if (op === 'begin') { activeNativeToken = value.token; expected = { ...cursor }; }
      if (op === 'step') {
        if (stepGate) await stepGate;
        if (activeNativeToken !== value.token || Math.hypot(cursor.x - expected.x, cursor.y - expected.y) > 1.5) return { ok: false, reason: 'user-moved' };
        cursor = windows ? toDip({ x: value.point[0], y: value.point[1] }) : { x: value.point[0], y: value.point[1] }; expected = { ...cursor };
      }
      const p = windows ? physical(cursor) : cursor; return { ok: true, point: [p.x, p.y] };
    },
  };
  const controller = createPointerContinuity({ app: {}, ipcMain: { on: (k, fn) => events.set(k, fn), handle: (k, fn) => handlers.set(k, fn) }, screen,
    getMainWindow: () => win, adapter, platform: windows ? 'win32' : 'darwin', now: () => clock, record: value => audits.push(value) });
  controller.register(); controller.attach(win);
  const old = { x: 300, y: 300, width: 400, height: 44 };
  function arm(key = 'same-group:same-button', overrides = {}, from = event) {
    cursor = { x: win.bounds.x + (old.x + offset.x) * win.zoom, y: win.bounds.y + (old.y + offset.y) * win.zoom };
    events.get('pointer-continuity:arm')(from, { key, time: clock, x: old.x + offset.x, y: old.y + offset.y, rect: old,
      buttonRect: { ...old }, ...overrides });
  }
  const start = (rect = { ...old, y: 180 }, key = 'same-group:same-button', from = event) => handlers.get('pointer-continuity:start')(from, { key, rect });
  const frame = (rect, { key = 'same-group:same-button', time = clock, buttonRect = rect } = {}) => handlers.get('pointer-continuity:frame')(event, { key, time, rect, buttonRect });
  return { controller, arm, start, frame, requests, audits, win, event, old, screen, cursor: () => ({ ...cursor }), move: p => { cursor = p; }, advance: ms => { clock += ms; },
    holdStep() { let release; stepGate = new Promise(resolve => { release = resolve; }); return release; },
    finish: () => handlers.get('pointer-continuity:finish')(event, { key: 'same-group:same-button' }) };
}

test('uses the live two-dimensional group origin and pixel offset; no autonomous trajectory', async t => {
  const p = fixture(); t.after(() => p.controller.stop()); p.arm(); assert.equal((await p.start({ ...p.old, x: 380, y: 180, width: 600 })).ok, true);
  assert.deepEqual(p.cursor(), { x: 500, y: 420 });
  for (const r of [{ ...p.old, x: 330, y: 260, width: 480 }, { ...p.old, x: 380, y: 180, width: 600 }]) {
    assert.equal((await p.frame(r)).ok, true); assert.deepEqual(p.cursor(), { x: 100 + r.x + 100, y: 100 + r.y + 20 });
  }
  assert.equal(p.finish().ok, true); assert.equal(p.audits.at(-1).samples.length, 2);
});
test('each tab direction uses the same protocol', async t => {
  for (const direction of [-132, 132, -98, 98, -34, 34]) {
    const p = fixture(); t.after(() => p.controller.stop()); p.arm(); const r = { ...p.old, y: p.old.y + direction };
    assert.equal((await p.start(r)).ok, true); assert.equal((await p.frame(r)).ok, true); assert.equal(p.finish().ok, true);
  }
});
test('navigation, node, brief, toolbar and management identities share bounded tracking', async t => {
  for (const name of ['navigation:collapse', 'task:tabs:history', 'task:brief', 'task:node:node1:collapse', 'notes:toolbar', 'management:group1']) {
    const p = fixture(); t.after(() => p.controller.stop()); p.arm(name);
    assert.equal((await p.start({ ...p.old, x: 400 }, name)).ok, true);
    assert.equal((await p.frame({ ...p.old, x: 360 }, { key: name })).ok, true);
  }
});
test('rejects missing arm, different object, tiny/excessive movement and expired press', async t => {
  const p = fixture(); t.after(() => p.controller.stop()); assert.equal((await p.start()).ok, false);
  for (const y of [295, -1]) { p.arm(); assert.equal((await p.start({ ...p.old, y })).ok, false); }
  p.arm(); assert.equal((await p.start(undefined, 'other-record')).ok, false);
  p.arm(); p.advance(501); assert.equal((await p.start()).ok, false);
  assert.equal(p.requests.some(r => r.op === 'step'), false);
});
test('rejects subframe/window spoofing and synthetic clicks away from the actual cursor', async t => {
  const p = fixture(); t.after(() => p.controller.stop());
  p.arm(undefined, {}, { ...p.event, senderFrame: { ...p.event.senderFrame } }); assert.equal((await p.start()).ok, false);
  p.arm(undefined, { x: 650 }); assert.equal((await p.start()).ok, false);
  p.arm(undefined, { time: Date.now() + 10000 }); assert.equal((await p.start()).ok, false);
});
test('new physical movement cancels forever for that transaction', async t => {
  const p = fixture(); t.after(() => p.controller.stop()); p.arm(); await p.start(); await p.frame({ ...p.old, y: 260 });
  p.move({ x: 520, y: 390 }); assert.equal((await p.frame({ ...p.old, y: 200 })).ok, false);
  await p.frame({ ...p.old, y: 180 }); assert.deepEqual(p.cursor(), { x: 520, y: 390 }); assert.equal(p.audits.at(-1).reason, 'user-moved');
});
test('stale frame, offset outside changed group and sibling reordering abandon following', async t => {
  const cases = [
    { args: [{ x: 300, y: 220, width: 400, height: 44 }, { time: Date.now() - 100 }], reason: 'invalid-or-stale-frame' },
    { args: [{ x: 300, y: 220, width: 50, height: 44 }], reason: 'group-reordered-or-outside-range' },
    { args: [{ x: 300, y: 220, width: 400, height: 44 }, { buttonRect: { x: 500, y: 220, width: 80, height: 44 } }], reason: 'group-reordered-or-outside-range' },
  ];
  for (const c of cases) { const p = fixture(); t.after(() => p.controller.stop()); p.arm(); await p.start(); assert.equal((await p.frame(...c.args)).ok, false); assert.equal(p.audits.at(-1).reason, c.reason); }
});
test('rounds subpixel edge landings into the same button', async t => {
  const p = fixture({ offset: { x: 399.8, y: 43.8 } }); t.after(() => p.controller.stop()); p.arm(); await p.start();
  assert.equal((await p.frame({ ...p.old, y: 180 })).ok, true); assert.deepEqual(p.cursor(), { x: 799, y: 323 });
});
test('Windows maps each frame by its target display, including mixed DPI', async t => {
  const p = fixture({ windows: true }); t.after(() => p.controller.stop()); p.win.bounds.x = 800;
  p.arm(); assert.equal((await p.start({ ...p.old, x: 400, y: 250 })).ok, true);
  assert.equal((await p.frame({ ...p.old, x: 400, y: 250 })).ok, true);
  assert.deepEqual(p.requests.findLast(r => r.op === 'step').point, [2600, 740]);
  assert.deepEqual(p.cursor(), { x: 1300, y: 370 }); assert.equal(p.finish().ok, true);
});
test('window geometry, zoom, keys and display changes cancel', async t => {
  for (const change of [p => { p.win.bounds.x++; }, p => { p.win.zoom = 1.25; }, p => p.win.webContents.emit('before-input-event'), p => p.screen.emit('display-added')]) {
    const p = fixture(); t.after(() => p.controller.stop()); p.arm(); await p.start(); change(p);
    assert.equal((await p.frame({ ...p.old, y: 250 })).ok, false); assert.equal(p.requests.some(r => r.op === 'step'), false);
  }
});
test('80ms stream stall and 400ms transaction expiry do not move the cursor', async t => {
  const p = fixture(); t.after(() => p.controller.stop()); p.arm(); await p.start(); await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(p.audits.at(-1).reason, 'frame-stream-stalled'); assert.equal((await p.frame({ ...p.old, y: 250 })).ok, false);
  const q = fixture(); t.after(() => q.controller.stop()); q.arm(); await q.start(); q.advance(401);
  assert.equal((await q.frame({ ...q.old, y: 250 })).ok, false);
});
test('one frame in flight; cancelled native acknowledgement cannot revive an old object', async t => {
  const p = fixture(); t.after(() => p.controller.stop()); p.arm(); await p.start();
  const release = p.holdStep();
  const first = p.frame({ ...p.old, y: 260 });
  assert.equal((await p.frame({ ...p.old, y: 240 })).reason, 'frame-in-flight');
  p.controller.cancel('task-changed'); release(); assert.equal((await first).ok, false);
  assert.equal((await p.frame({ ...p.old, y: 180 })).ok, false);
});
