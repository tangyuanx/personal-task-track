// Real Chromium + Milkdown regression: pausing while typing must not detach the
// editor or steal focus. File IPC is covered by desktop.test.cjs; this checks
// renderer autosave and recovery through the browser storage fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const repository = path.resolve(__dirname, '..');
  const server = http.createServer(async (request, response) => {
    const file = path.resolve(repository, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(repository + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: process.env.LOOP_TEST_CHROMIUM || undefined,
      args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem('task-flow-sheet-prototype-v2', JSON.stringify(['note-a', 'note-b'].map(id => ({
        id, title: id, status: 'todo', notes: '# 笔记\n\n起始内容', nodes: [], createdAt: now, updatedAt: now,
        knowledgeNote: { noteId: id, filePath: `/virtual/${id}.md`, documentState: 'SAVED', dirty: false },
      }))));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/app/renderer/index.html`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.tasks.some(t => t.id === 'note-a'));
    const choose = async id => {
      await page.evaluate(id => { state.activeTaskId = id; state.taskPane = 'notes'; render(); }, id);
      await page.waitForSelector('.ProseMirror');
      await page.waitForFunction(() => milkdownEditors.has(noteDraftKey(state.activeTaskId, '')));
      await page.waitForTimeout(300);
    };
    const resetMetrics = () => page.evaluate(() => {
      window.__inputRenders = 0;
      window.__inputEditor = document.querySelector('.ProseMirror');
      if (!window.__inputRenderWrapped) {
        const prior = render;
        render = function () { window.__inputRenders++; return prior(); };
        window.__inputRenderWrapped = true;
      }
    });
    const assertStable = async () => {
      const result = await page.evaluate(() => ({ renders: window.__inputRenders,
        same: document.querySelector('.ProseMirror') === window.__inputEditor,
        focused: document.activeElement === window.__inputEditor }));
      assert.deepEqual(result, { renders: 0, same: true, focused: true });
    };
    const waitSaved = text => page.waitForFunction(text => {
      const task = state.tasks.find(t => t.id === state.activeTaskId);
      const persisted = JSON.parse(localStorage.getItem('task-flow-sheet-prototype-v2'));
      return task.notes.includes(text) && persisted.find(t => t.id === task.id)?.notes.includes(text);
    }, text);

    await choose('note-a');
    await resetMetrics();
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    // Each pause crosses the old 180ms render trigger and both save debounces.
    for (const word of [' alpha', ' beta', ' gamma']) {
      await page.keyboard.type(word, { delay: 25 });
      await waitSaved(word);
      await assertStable();
    }
    assert.match(await page.locator('.ProseMirror').innerText(), /alpha beta gamma/);
    assert.equal(await page.evaluate(() => NOTE23_EDIT_DIRTY.has('note-a')), true);

    // Hold a real Chromium composition session across autosave, then commit it.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '中文输入', selectionStart: 4, selectionEnd: 4 });
    await page.waitForTimeout(1700);
    await assertStable();
    await cdp.send('Input.insertText', { text: '中文输入' });
    await waitSaved('中文输入');
    await assertStable();

    // Programmatic toolbar undo/redo has no trusted DOM input event.
    await page.evaluate(() => shellKnowledgeEditorEntry().format('undo'));
    await page.waitForTimeout(1700);
    await assertStable();
    await page.evaluate(() => shellKnowledgeEditorEntry().format('redo'));
    await waitSaved('中文输入');
    await assertStable();

    // Undo back to the exact loaded document must clear the dirty dot in place.
    await choose('note-b');
    await resetMetrics();
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' undo-check');
    await waitSaved('undo-check');
    await page.evaluate(() => shellKnowledgeEditorEntry().format('undo'));
    await page.waitForFunction(() => !NOTE23_EDIT_DIRTY.has('note-b'));
    await assertStable();
    assert.equal(await page.locator('.note23-dirty').count(), 0);

    // A pane switch before the debounce must still capture the last keystroke.
    await choose('note-a');
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' switch-check');
    await choose('note-b');
    await choose('note-a');
    await waitSaved('switch-check');
    assert.match(await page.locator('.ProseMirror').innerText(), /switch-check/);

    await page.locator('[data-action="knowledge-mode"][data-mode="source"]').click();
    await page.waitForSelector('#knowledge-source');
    await page.evaluate(() => { window.__inputRenders = 0; });
    await page.locator('#knowledge-source').focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n源码输入');
    await waitSaved('源码输入');
    assert.equal(await page.evaluate(() => window.__inputRenders), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'knowledge-source');
    assert.equal(await page.evaluate(() => state.tasks.find(t => t.id === 'note-a').knowledgeNote.dirty), true);
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('task-track-knowledge-recovery-v1')).records).some(r => r.content.includes('源码输入')));
    assert.deepEqual(errors, []);
    console.log('PASS: paused typing, IME composition, undo/redo, dirty baseline, immediate switch, source autosave and recovery');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
