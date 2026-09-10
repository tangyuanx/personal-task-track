const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");

(async () => {
  const repository = path.join(__dirname, "..");
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), "loop-group-menu-ui-"));
  let app;
  try {
    app = await electron.launch({
      executablePath: require("electron"),
      args: ["--no-sandbox", `--user-data-dir=${userData}`, repository],
      cwd: repository,
      env: { ...process.env, ELECTRON_DISABLE_SANDBOX: "1" },
    });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.locator(".ops-app").waitFor();

    const trigger = page.locator(".repository-group-trigger");
    await page.locator(".add-group-button").click();
    const groupTitle = "右键验收分组";
    const groupEditor = page.locator(".repository-group-edit");
    await groupEditor.waitFor();
    await groupEditor.fill(groupTitle);
    await groupEditor.press("Enter");
    await trigger.waitFor();
    assert.match(await trigger.innerText(), new RegExp(groupTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await trigger.click();
    assert.equal(await page.locator(".repository-group-popover").count(), 0, "setup should leave the picker closed");
    await page.waitForTimeout(420);

    await trigger.click({ button: "right" });
    const menu = page.locator(".context-menu");
    await menu.waitFor();
    assert.match(await menu.innerText(), /批量添加任务/);

    await menu.getByRole("button", { name: "批量添加任务…" }).click();
    await page.locator('.wr-dialog[aria-label="批量添加任务"]').waitFor();
    await page.keyboard.press("Escape");

    await trigger.click();
    await page.locator(".repository-group-popover").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".repository-group-popover").count(), 0, "single click should only open the picker");

    await page.waitForTimeout(420);
    await trigger.click();
    await page.waitForTimeout(60);
    await page.locator(".repository-group-trigger").click();
    await page.locator(".repository-group-edit").waitFor();
    await page.keyboard.press("Escape");

    await trigger.click({ button: "right" });
    await menu.waitFor();
    await page.locator(".task-list-count").click();
    assert.equal(await page.locator(".context-menu").count(), 0, "outside click should close the menu");
  } finally {
    await app?.close();
    await fs.rm(userData, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
