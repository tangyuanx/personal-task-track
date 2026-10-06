const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderer() {
  const handlers = new Map(), mediaHandlers = new Map(), frames = [], elements = new Map(), focus = [];
  let requested = { task: 'A', pane: 'flow', node: '' };
  const makeViewport = (top = 0, height = 1000) => ({ scrollTop: top, scrollLeft: 0, scrollHeight: height, clientHeight: 200, scrollWidth: 500, clientWidth: 400 });
  function baseRender() {
    elements.clear();
    elements.set('.workspace', { dataset: { taskId: requested.task } });
    elements.set('.pane-tab.active', { dataset: { pane: requested.pane } });
    if (requested.node) elements.set('.inspector', { dataset: { nodeId: requested.node } });
    if (requested.pane === 'flow') elements.set('.flow-scroll', makeViewport(0, requested.height));
    if (requested.node) elements.set('.inspector-body', makeViewport());
    if (requested.pane === 'notes') { elements.set('.knowledge-body', makeViewport()); elements.set('#knowledge-source', makeViewport()); }
    if (requested.pane === 'history') elements.set('.article-pane', makeViewport());
    elements.set('.node-title[data-node-id="n1"]', { focus: options => focus.push(options) });
  }
  const media = { matches: false, addEventListener: (k, fn) => mediaHandlers.set(k, fn) };
  const storage = new Map();
  const win = { addEventListener: (k, fn) => handlers.set(k, fn) };
  const context = vm.createContext({ window: win, document: { querySelector: key => elements.get(key) || null,
    querySelectorAll: key => key === '.node-title[data-node-id="n1"]' ? [elements.get(key)] : [] },
    render: baseRender, matchMedia: () => media, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, performance: { now: () => 10 }, CSS: { escape: value => value },
    shellSettingsRow: (_label, _desc, control) => control, shellSettingsToggle: (_label, _desc, _checked, attrs) => attrs });
  baseRender(); vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/renderer/src/continuity28.js'), 'utf8'), context);
  const flush = () => { let count = 0; while (frames.length && count++ < 100) frames.shift()(); };
  return { elements, focus, context, storage, media, handlers, flush,
    go(task, pane, node = '', height = 1000) { requested = { task, pane, node, height }; context.render(); },
    get: selector => elements.get(selector) };
}
test('flow, notes/source and history keep separate per-task reading positions', () => {
  const r = renderer(); r.get('.flow-scroll').scrollTop = 320;
  r.go('A', 'notes'); r.flush(); assert.equal(r.get('.knowledge-body').scrollTop, 0);
  r.get('.knowledge-body').scrollTop = 210; r.get('#knowledge-source').scrollTop = 170;
  r.go('A', 'history'); r.flush(); r.get('.article-pane').scrollTop = 330;
  r.go('A', 'flow'); r.flush(); assert.equal(r.get('.flow-scroll').scrollTop, 320);
  r.go('A', 'notes'); r.flush(); assert.equal(r.get('.knowledge-body').scrollTop, 210); assert.equal(r.get('#knowledge-source').scrollTop, 170);
  r.go('A', 'history'); r.flush(); assert.equal(r.get('.article-pane').scrollTop, 330);
  r.go('B', 'history'); r.flush(); assert.equal(r.get('.article-pane').scrollTop, 0);
  r.go('A', 'history'); r.flush(); assert.equal(r.get('.article-pane').scrollTop, 330);
});
test('node contexts keep independent flow/record scroll; closing returns semantic focus without scrolling', () => {
  const r = renderer(); r.get('.flow-scroll').scrollTop = 300;
  r.go('A', 'flow', 'n1'); r.flush(); r.get('.flow-scroll').scrollTop = 140; r.get('.inspector-body').scrollTop = 270;
  r.handlers.get('pointerdown')({ isTrusted: true, button: 0, target: { closest: () => ({ dataset: { action: 'close-node-detail' } }) } });
  r.go('A', 'flow'); r.flush(); assert.equal(r.get('.flow-scroll').scrollTop, 300); assert.equal(r.focus.at(-1).preventScroll, true);
  r.go('A', 'flow', 'n1'); r.flush(); assert.equal(r.get('.flow-scroll').scrollTop, 140); assert.equal(r.get('.inspector-body').scrollTop, 270);
  r.go('A', 'flow', 'n2'); r.flush(); assert.equal(r.get('.inspector-body').scrollTop, 0);
});
test('stale render callbacks cannot restore another task; offsets clamp to actual boundaries', () => {
  const r = renderer(); r.get('.flow-scroll').scrollTop = 700;
  r.go('A', 'notes'); r.go('B', 'flow'); r.flush(); assert.equal(r.get('.flow-scroll').scrollTop, 0);
  r.go('A', 'flow', '', 450); r.flush(); assert.equal(r.get('.flow-scroll').scrollTop, 250);
});
test('original mode and follow preferences persist independently of task data', () => {
  const r = renderer();
  r.handlers.get('click')({ target: { closest: () => ({ dataset: { continuity28: 'original' } }) }, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(r.context.window.LoopContinuity28.preferences().continuous, false);
  assert.equal(JSON.parse(r.storage.get('loop.interaction28')).continuous, false);
  r.media.matches = true;
  assert.equal(r.context.window.LoopContinuity28.preferences().reduced, true);
});
