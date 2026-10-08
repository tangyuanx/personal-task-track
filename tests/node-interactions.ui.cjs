// Real pointer gestures: long-press hierarchy changes and double-click naming.
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (localStorage.getItem('task-flow-sheet-prototype-v2')) return;
      const stamp = new Date().toISOString();
      localStorage.setItem('task-flow-sheet-prototype-v2', JSON.stringify([{ id: 'task', title: '节点交互验证', status: 'active',
        createdAt: stamp, updatedAt: stamp, nodes: [
          { id: 'a', title: '步骤 A', note: '保留父节点记录', order: 1, children: [{ id: 'ax', title: 'A 的子节点', note: '保留子节点记录', children: [] }] },
          { id: 'b', title: '步骤 B', order: 2, collapsed: true, children: [{ id: 'bx', title: 'B 的子节点', children: [] }] },
          { id: 'c', title: '步骤 C', order: 3, children: [] },
          { id: 'd', title: '步骤 D', order: 4, children: [] },
        ] }]));
      localStorage.setItem('task-track-task-filter', 'all');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/app/renderer/index.html`);
    await page.waitForSelector('.flow-scroll');
    const settle = () => page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const title = id => page.locator(`.node-title[data-node-id="${id}"]`);
    const row = id => page.locator(`.flow-row[data-node-id="${id}"]`);
    const tree = () => page.evaluate(() => state.tasks.find(t => t.id === 'task').nodes);
    const begin = async id => {
      await page.waitForFunction(() => Date.now() >= suppressFlowNodeClickUntil);
      await title(id).scrollIntoViewIfNeeded(); await settle();
      const box = await title(id).boundingBox();
      await page.mouse.move(box.x + 25, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForFunction(() => flowNodeDragState?.active);
      assert.equal(await page.locator('.flow-node-drop-guide').count(), 1);
    };
    const target = async (id, placement) => {
      const box = await row(id).boundingBox();
      const ratio = placement === 'before' ? .18 : placement === 'after' ? .82 : .5;
      await page.mouse.move(box.x + Math.min(90, box.width / 2), box.y + box.height * ratio, { steps: 3 });
      await page.waitForFunction(({ id, placement }) => flowNodeDragState?.targetId === id && flowNodeDragState?.placement === placement, { id, placement });
    };
    const drop = async () => {
      await page.mouse.up(); await settle();
      assert.equal(await page.locator('.flow-node-drop-guide').count(), 0);
      assert.equal(await page.locator('.flow-row[data-drop]').count(), 0);
      assert.equal(await page.evaluate(() => flowNodeDragState), null);
    };

    // Double-click must work even when click one opens/rebuilds the inspector.
    await title('a').dblclick({ delay: 60 });
    await page.waitForSelector('#title-form');
    assert.equal(await page.locator('#editable-title').inputValue(), '步骤 A');
    await page.locator('#editable-title').fill('   ');
    await page.locator('#title-form button[type="submit"]').click();
    assert.equal(await page.locator('#entry16-title-error').innerText(), '请输入标题后再保存');
    await page.locator('#editable-title').fill('已改名步骤 A');
    await page.keyboard.press('Enter'); await settle();
    assert.equal((await tree())[0].title, '已改名步骤 A');
    assert.equal((await tree())[0].note, '保留父节点记录');
    await title('a').dblclick({ delay: 60 }); await page.waitForSelector('#title-form');
    await page.locator('#editable-title').fill('不保存的名字');
    await page.locator('#title-form').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await tree())[0].title, '已改名步骤 A');
    await settle();

    // Long-pressing the title moves a whole subtree into a collapsed parent.
    const selected = await page.evaluate(() => state.selectedNodeId);
    await begin('a'); await target('b', 'inside');
    assert.match(await page.locator('.flow-node-drop-guide').innerText(), /步骤 B.*第 2 层/);
    assert.equal(await row('b').getAttribute('data-drop'), 'inside');
    await drop();
    let nodes = await tree();
    assert.equal(nodes[0].id, 'b'); assert.equal(nodes[0].collapsed, false);
    const moved = nodes[0].children.find(n => n.id === 'a');
    assert.equal(moved.parentId, 'b'); assert.equal(moved.children[0].id, 'ax');
    assert.equal(moved.children[0].note, '保留子节点记录');
    assert.equal(await page.evaluate(() => state.selectedNodeId), selected, 'drag release never activates a title click');
    assert.equal(await page.locator('#title-form').count(), 0);

    // A top/bottom drop changes ordering; cross-level drops use target siblings.
    await begin('c'); await target('b', 'before'); await drop();
    nodes = await tree(); assert.deepEqual(nodes.map(n => n.id), ['c', 'b', 'd']);
    assert.equal(nodes[0].parentId, null);
    await begin('a'); await target('c', 'before'); await drop();
    nodes = await tree(); assert.deepEqual(nodes.map(n => n.id), ['a', 'c', 'b', 'd']);
    assert.equal(nodes[0].parentId, null); assert.equal(nodes[0].children[0].parentId, 'a');

    // Descendant cycles and cancelled gestures cannot mutate the tree.
    const unchanged = await tree();
    await begin('a');
    const descendant = await row('ax').boundingBox();
    await page.mouse.move(descendant.x + 80, descendant.y + descendant.height / 2);
    assert.match(await page.locator('.flow-node-drop-guide').innerText(), /不能移动到自身或自己的子节点/);
    await drop(); assert.deepEqual(await tree(), unchanged);
    await begin('d'); await target('b', 'inside');
    await page.keyboard.press('Escape'); await page.mouse.up(); await settle();
    assert.deepEqual(await tree(), unchanged); assert.equal(await page.locator('.flow-node-drop-guide').count(), 0);
    await begin('d'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up(); await settle();
    assert.deepEqual(await tree(), unchanged);

    // Empty flow space promotes a subtree to the root end.
    await begin('c');
    const end = await page.locator('.add-node').boundingBox();
    await page.mouse.move(end.x + 30, end.y + end.height / 2);
    await page.waitForFunction(() => flowNodeDragState?.root);
    await drop(); nodes = await tree(); assert.deepEqual(nodes.map(n => n.id), ['a', 'b', 'd', 'c']);

    // Status controls are never drag handles, and short clicks still open details.
    const status = page.locator('.node-status[data-node-id="a"]');
    const statusBox = await status.boundingBox();
    await page.mouse.move(statusBox.x + statusBox.width / 2, statusBox.y + statusBox.height / 2);
    await page.mouse.down(); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => flowNodeDragState), null);
    await page.mouse.up(); await page.waitForSelector('.status-menu'); await page.keyboard.press('Escape'); await settle();
    await page.waitForFunction(() => Date.now() >= suppressFlowNodeClickUntil);
    await title('d').click(); await settle(); assert.equal(await page.evaluate(() => state.selectedNodeId), 'd');
    assert.equal(await page.locator('#title-form').count(), 0);

    await page.waitForFunction(() => JSON.parse(localStorage.getItem('task-flow-sheet-prototype-v2'))[0].nodes[0].title === '已改名步骤 A');
    const saved = await tree(); await page.reload(); await page.waitForSelector('.flow-scroll');
    assert.deepEqual(await tree(), saved, 'renamed nodes, moved hierarchy and all records survive restart');
    assert.deepEqual(errors, []);
    console.log('Node gestures passed: double-click naming/validation/cancel, long-press reparent/reorder/root, subtree records, cycle rejection, Esc/blur cancel, controls, release suppression and persistence.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
