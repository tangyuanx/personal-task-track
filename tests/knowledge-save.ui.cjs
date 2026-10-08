const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { readKnowledgeDocument, saveKnowledgeDocument } = require('../app/main/knowledge-file.cjs');
const { stageKnowledgeAssets } = require('../app/main/knowledge-assets.cjs');
const { createKnowledgeFileWatcher } = require('../app/main/knowledge-watcher.cjs');

(async () => {
  const repository = path.resolve(__dirname, '..');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-knowledge-save-'));
  const filePath = path.join(directory, 'note.md');
  await fs.writeFile(filePath, '# 笔记\n\n起始内容');
  const baseline = await readKnowledgeDocument(filePath);
  const server = http.createServer(async (request, response) => {
    const file = path.resolve(repository, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(repository + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  let watcher;
  let pendingWrite;
  let releaseWrite;
  let saveCalls = 0;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: process.env.LOOP_TEST_CHROMIUM || undefined,
      args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] });
    const page = await browser.newPage();
    watcher = createKnowledgeFileWatcher({ debounceMs: 30, onChange: event => {
      void page.evaluate(event => window.noteFileChanged?.(event), event).catch(() => {});
    } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('readNote', payload => readKnowledgeDocument(payload.filePath));
    await page.exposeFunction('stageNote', payload => stageKnowledgeAssets(directory, payload));
    await page.exposeFunction('watchNote', payload => watcher.watch(payload));
    await page.exposeFunction('saveNote', async payload => {
      saveCalls++;
      if (pendingWrite) await pendingWrite;
      const result = await saveKnowledgeDocument(payload, {
        dialog: { showSaveDialog: async () => ({ canceled: false, filePath }) },
      });
      if (result.success) watcher.updateBaseline(payload.noteId, result);
      return result;
    });
    await page.addInitScript(({ filePath, baseline }) => {
      const now = new Date().toISOString();
      window.personalTaskTrack = { knowledgeFile: {
        read: payload => window.readNote(payload), save: payload => window.saveNote(payload),
        stageAssets: payload => window.stageNote(payload), watch: payload => window.watchNote(payload),
        onChange: callback => { window.noteFileChanged = callback; },
      } };
      localStorage.setItem('task-flow-sheet-prototype-v2', JSON.stringify([{
        id: 'note-save', title: '保存测试', status: 'todo', notes: baseline.content, nodes: [], createdAt: now, updatedAt: now,
        knowledgeNote: { noteId: 'note-save', filePath, documentState: 'SAVED', dirty: false, lastSavedHash: baseline.lastSavedHash },
      }]));
    }, { filePath, baseline });
    await page.goto(`http://127.0.0.1:${server.address().port}/app/renderer/index.html`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.tasks.some(t => t.id === 'note-save'));
    await page.evaluate(() => { state.activeTaskId = 'note-save'; state.taskPane = 'notes'; render(); });
    await page.waitForSelector('.ProseMirror');
    await page.waitForFunction(() => milkdownEditors.has(noteDraftKey('note-save', '')));
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' edited');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => window.__out23?.success === true);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-note23-external]').count(), 0);
    const editor = await page.locator('.ProseMirror').elementHandle();
    await page.evaluate(() => {
      state.attachments.images.save_image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=';
      shellKnowledgeEditorEntry().insertImage({ src: 'task-image:save_image', alt: '附件' });
    });
    await page.waitForTimeout(600);
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('[data-note23-external]').count(), 0, 'saving an attachment must not create a conflict');
    assert.equal(await editor.evaluate(element => element === document.querySelector('.ProseMirror')), true, 'save retains the editor and selection');
    assert.equal(await page.evaluate(() => state.tasks[0].notes), await fs.readFile(filePath, 'utf8'));
    assert.match(await fs.readFile(filePath, 'utf8'), /\.\/attachments\/asset-/);

    // The next serialization must keep the saved references too.
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' after-image');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-note23-external]').count(), 0);
    assert.equal(await page.evaluate(() => state.tasks[0].notes), await fs.readFile(filePath, 'utf8'));
    assert.doesNotMatch(await fs.readFile(filePath, 'utf8'), /task-image:|data:image/);

    // Edits made during a pending save stay dirty and are never a conflict.
    pendingWrite = new Promise(resolve => { releaseWrite = resolve; });
    const previousCalls = saveCalls;
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.evaluate(() => {
      state.attachments.images.pending_image = state.attachments.images.save_image;
      shellKnowledgeEditorEntry().insertImage({ src: 'task-image:pending_image', alt: '保存中的附件' });
    });
    await page.keyboard.type(' before-write');
    await page.keyboard.press('Control+s');
    const waitUntil = Date.now() + 5000;
    while (saveCalls === previousCalls && Date.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(saveCalls > previousCalls, 'Ctrl+S must reach the file write');
    await page.keyboard.type(' newer-draft');
    releaseWrite();
    pendingWrite = null;
    await page.waitForTimeout(1200);
    assert.match(await page.evaluate(() => state.tasks[0].notes), /newer-draft/);
    assert.doesNotMatch(await fs.readFile(filePath, 'utf8'), /newer-draft/);
    assert.doesNotMatch(await page.evaluate(() => state.tasks[0].notes), /task-image:|data:image/);
    assert.equal(await page.evaluate(() => state.tasks[0].knowledgeNote.dirty && NOTE23_EDIT_DIRTY.has('note-save')), true);
    assert.equal(await page.locator('[data-note23-external]').count(), 0);

    // A genuine external edit still prompts; explicitly overwriting resolves it.
    await fs.writeFile(filePath, '外部程序真正修改的正文');
    await page.waitForSelector('[data-note23-external]');
    assert.match(await page.evaluate(() => state.tasks[0].notes), /newer-draft/);
    await page.locator('[data-note23="overwrite"]').first().click();
    await page.waitForFunction(() => !NOTE23_EXTERNAL.has('note-save') && state.tasks[0].knowledgeNote.documentState === 'SAVED');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-note23-external]').count(), 0);
    assert.equal(await page.evaluate(() => state.tasks[0].notes), await fs.readFile(filePath, 'utf8'));
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-note23-external]').count(), 0);

    // Source mode shares the same save boundary.
    await page.locator('[data-action="knowledge-mode"][data-mode="source"]').click();
    await page.locator('#knowledge-source').focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n源码保存');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-note23-external]').count(), 0);
    assert.equal(await page.evaluate(() => state.tasks[0].notes), await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(errors, []);
    console.log('PASS: Ctrl+S, image migration, repeated saves, concurrent typing, actual external changes, explicit overwrite and source mode');
  } finally {
    watcher?.closeAll();
    releaseWrite?.();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
