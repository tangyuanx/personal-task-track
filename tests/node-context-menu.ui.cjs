// Real renderer regression for node context menus and inline node creation.
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (localStorage.getItem('task-flow-sheet-prototype-v2')) return;
      const stamp = new Date().toISOString();
      localStorage.setItem('task-flow-sheet-prototype-v2', JSON.stringify([{ id: 'task', title: '节点菜单验证', status: 'active',
        createdAt: stamp, updatedAt: stamp, nodes: Array.from({ length: 45 }, (_, i) => ({ id: `n${i}`, title: `处理步骤 ${i}`,
          status: 'todo', order: i + 1, children: i === 35 ? [{ id: 'child', title: '现有子节点', order: 1, children: [] }] : [] })) }]));
      localStorage.setItem('task-track-task-filter', 'all');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/app/renderer/index.html`);
    await page.waitForSelector('.flow-scroll');
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const open = async id => {
      await page.locator(`.node-title[data-node-id="${id}"]`).scrollIntoViewIfNeeded();
      await settle();
      await page.locator(`.node-title[data-node-id="${id}"]`).click({ button: 'right' });
      await page.waitForSelector('.node-context-menu');
      assert.equal(await page.locator('.node-context-menu button').count(), 3);
    };
    const nameDraft = async text => {
      assert.equal(await page.locator('[data-shell-node-draft]').count(), 1, 'one draft at the intended level');
      await page.waitForFunction(() => document.activeElement?.matches('[data-shell-node-draft]'));
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !state.focusNodeTitleId);
      await settle();
    };
    const tree = () => page.evaluate(() => state.tasks.find(t => t.id === 'task').nodes);

    // Opening/dismissing on a scrolled flow keeps the exact DOM and inspector.
    await page.locator('.node-title[data-node-id="n35"]').scrollIntoViewIfNeeded();
    await page.locator('.node-title[data-node-id="n35"]').click();
    await settle();
    await page.locator('.node-title[data-node-id="n35"]').scrollIntoViewIfNeeded();
    await settle();
    const before = await page.evaluate(() => {
      window.__flowMenuDOM = document.querySelector('.flow-scroll');
      window.__flowMenuInspector = document.querySelector('.inspector');
      return { top: window.__flowMenuDOM.scrollTop, node: state.selectedNodeId };
    });
    await open('n35');
    assert.deepEqual(await page.evaluate(() => ({ top: document.querySelector('.flow-scroll').scrollTop,
      node: state.selectedNodeId })), before);
    assert.equal(await page.evaluate(() => document.querySelector('.flow-scroll') === window.__flowMenuDOM &&
      document.querySelector('.inspector') === window.__flowMenuInspector), true);
    await page.locator('.node-context-menu button').first().focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.node-context-menu').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.nodeId), 'n35');

    // A sibling is inserted after the target, before its next sibling.
    await open('n35');
    await page.getByRole('menuitem', { name: '添加兄弟节点' }).click();
    await nameDraft('新增兄弟');
    let nodes = await tree();
    assert.deepEqual(nodes.slice(35, 38).map(n => n.title), ['处理步骤 35', '新增兄弟', '处理步骤 36']);
    assert.equal(nodes[36].parentId, null);
    assert.ok(await page.locator('.flow-scroll').evaluate(el => el.scrollTop) > 0);

    // Collapsed parents expand; child creation never leaks a draft at root.
    await page.locator('[data-action="toggle-node-collapse"][data-node-id="n35"]').click();
    await open('n35');
    await page.getByRole('menuitem', { name: '添加子节点' }).click();
    assert.equal(await page.locator('.flow-children [data-shell-node-draft]').count(), 1);
    await nameDraft('新增子节点');
    nodes = await tree();
    assert.equal(nodes[35].collapsed, false);
    assert.deepEqual(nodes[35].children.map(n => n.title), ['现有子节点', '新增子节点']);
    assert.equal(nodes[35].children[1].parentId, 'n35');

    // Nested sibling/child creation and Esc cancellation retain the hierarchy.
    await open('child');
    await page.getByRole('menuitem', { name: '添加兄弟节点' }).click();
    await nameDraft('子层兄弟');
    await open('child');
    await page.getByRole('menuitem', { name: '添加子节点' }).click();
    await nameDraft('孙节点');
    nodes = await tree();
    assert.deepEqual(nodes[35].children.map(n => n.title), ['现有子节点', '子层兄弟', '新增子节点']);
    assert.equal(nodes[35].children[1].parentId, 'n35');
    assert.equal(nodes[35].children[0].children[0].parentId, 'child');
    await open('child');
    await page.getByRole('menuitem', { name: '添加子节点' }).click();
    await page.keyboard.press('Escape');
    assert.deepEqual(await tree(), nodes);

    // Existing hover plus uses the same task identity and inline naming path.
    await page.locator('.node-title[data-node-id="child"]').hover();
    await page.locator('.node-add[data-node-id="child"]').click();
    await nameDraft('快捷添加');
    const saved = await tree();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('task-flow-sheet-prototype-v2'))[0].nodes
      .find(n => n.id === 'n35').children[0].children.some(n => n.title === '快捷添加'));
    await page.reload(); await page.waitForSelector('.flow-scroll');
    assert.deepEqual(await tree(), saved, 'names and hierarchy survive a reload');

    // Keyboard menu navigation, viewport clamping, and theme tokens.
    await page.locator('.node-title[data-node-id="n35"]').scrollIntoViewIfNeeded();
    await page.locator('.node-title[data-node-id="n35"]').focus();
    await settle();
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('.node-context-menu');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'add-sibling-node');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'add-child-node');
    await page.keyboard.press('Escape');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { state.theme = theme; render(); }, theme);
      await open('n44');
      const box = await page.locator('.node-context-menu').boundingBox();
      assert.ok(box.x >= 12 && box.y >= 12 && box.x + box.width <= 1268 && box.y + box.height <= 770);
      assert.equal(await page.locator('.node-context-menu').evaluate(el => getComputedStyle(el).backgroundColor),
        await page.locator('.workspace').evaluate(el => getComputedStyle(el).backgroundColor));
      if (process.env.LOOP_TEST_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.LOOP_TEST_SCREENSHOT_DIR, `node-menu-${theme}.png`) });
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 1000, height: 680 });
    await open('n44');
    const narrowMenu = await page.locator('.node-context-menu').boundingBox();
    assert.ok(narrowMenu.x + narrowMenu.width <= 988 && narrowMenu.y + narrowMenu.height <= 630);
    await page.getByRole('menuitem', { name: '添加子节点' }).click();
    await nameDraft('窄窗口子节点');
    assert.equal((await tree()).find(n => n.id === 'n44').children[0].title, '窄窗口子节点');
    assert.deepEqual(errors, []);
    console.log('Node context menu passed: sibling/child/nested creation, cancellation, persistence, DOM/scroll retention, keyboard, light/dark, edge clamping.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
