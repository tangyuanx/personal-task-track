// Real Electron regression. Browser input is trusted; IPC replies are mocked
// only inside this test so no system pointer is moved and no native warp runs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');

(async () => {
  const repository = path.resolve(__dirname, '..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-switch-regression-'));
  let app;
  try {
    const groups = ['a', 'b'].map(id => ({ id, title: id, order: id === 'a' ? 1 : 2 }));
    const tasks = groups.map(g => ({ id: g.id, groupId: g.id, title: g.title, status: 'active', priority: 'medium',
      tags: { today: true }, nodes: [], history: [], notes: '# 笔记\n\n' + '长文阅读与草稿。\n\n'.repeat(180) }));
    await fs.writeFile(path.join(profile, 'task-data.json'), JSON.stringify({ version: 2, knowledgeSchemaVersion: 1, tasks, taskGroups: groups, activeGroupId: 'a' }));
    const env = { ...process.env, LOOP_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ executablePath: require('electron'), args: [repository], cwd: repository, env });
    await app.firstWindow();
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      page = app.windows().find(p => p.url().endsWith('/app/renderer/index.html'));
      if (!page) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(page); await page.waitForFunction(() => window.LoopContinuity28 && document.querySelector('.pane-tab'));
    await app.evaluate(({ ipcMain }) => {
      global.__pointerRegression = { starts: 0, frames: 0, finishes: 0 };
      ipcMain.removeAllListeners('pointer-continuity:arm');
      for (const action of ['start', 'frame', 'finish']) {
        ipcMain.removeHandler('pointer-continuity:' + action);
        ipcMain.handle('pointer-continuity:' + action, () => {
          global.__pointerRegression[action === 'start' ? 'starts' : action === 'frame' ? 'frames' : 'finishes']++;
          return { ok: true };
        });
      }
    });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => {
      window.__creates = {};
      const original = MilkdownTaskEditor.create;
      MilkdownTaskEditor.create = async options => {
        const id = options.root.dataset.taskId;
        __creates[id] = (__creates[id] || 0) + 1;
        const instance = await original(options);
        if (id === 'b' && __creates[id] === 1) await new Promise(resolve => setTimeout(resolve, 180));
        return instance;
      };
    });
    await page.locator('.pane-tab[data-pane="notes"]').click();
    await page.evaluate(() => setTimeout(() => render(), 50));
    await page.waitForFunction(() => !window.loopPointerContinuity.currentClick());
    const followed = await app.evaluate(() => global.__pointerRegression);
    assert.equal(followed.starts, 1); assert.equal(followed.finishes, 1); assert.ok(followed.frames > 4);
    await page.waitForFunction(() => milkdownEditors.has(noteDraftKey('a', '')));
    await page.evaluate(() => { render(); window.__editorA = document.querySelector('.ProseMirror'); });
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => document.querySelector('.nav-button[data-setting-button="task-filter"][data-value="today"]').click());
      await page.evaluate(() => document.querySelector('.nav-button[data-setting-button="task-filter"][data-value="all"]').click());
    }
    assert.equal(await page.evaluate(() => __editorA === document.querySelector('.ProseMirror')), true);
    await page.evaluate(() => document.querySelector('[data-action="select-nav-group"][data-group-id="b"]').click());
    await page.waitForFunction(() => __creates.b === 1 && pendingMilkdownMounts.size > 0);
    // External reload/replacement while create() is outstanding must invalidate
    // the old document and eventually initialize the current host.
    await page.evaluate(() => {
      discardMountedKnowledgeEditor('b'); state.tasks.find(t => t.id === 'b').notes = '# 新文档\n\n外部刷新内容'; render();
    });
    await page.waitForFunction(() => milkdownEditors.has(noteDraftKey('b', '')) && pendingMilkdownMounts.size === 0);
    assert.match(await page.locator('.ProseMirror').innerText(), /外部刷新内容/);
    await page.evaluate(() => { window.__editorB = document.querySelector('.ProseMirror'); });
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.querySelector('[data-action="select-nav-group"][data-group-id="a"]').click());
      assert.equal(await page.evaluate(() => __editorA === document.querySelector('.ProseMirror')), true);
      await page.evaluate(() => document.querySelector('[data-action="select-nav-group"][data-group-id="b"]').click());
      assert.equal(await page.evaluate(() => __editorB === document.querySelector('.ProseMirror')), true);
    }
    // Retained controls must keep one listener after repeated refreshes.
    const headingCalls = await page.evaluate(() => {
      for (let i = 0; i < 12; i++) render();
      let calls = 0; const old = shellApplyNoteFormat;
      shellApplyNoteFormat = (...args) => { calls++; return old(...args); };
      const select = document.querySelector('.note-heading-select'); select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true }));
      shellApplyNoteFormat = old; return calls;
    });
    assert.equal(headingCalls, 1); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, followed, creates: await page.evaluate(() => __creates),
      scenes: ['follow survives redraw', 'navigation retains editor', 'group editor reuse', 'cold initialization replacement retries', 'single format binding'] }, null, 2));
  } finally { await app?.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
