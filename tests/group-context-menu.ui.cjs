const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");

async function waitForMainWindow(app) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => candidate.url().endsWith("/app/renderer/index.html"));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Loop main window did not open");
}

/**
 * The suite must be hermetic: seed the profile that the app is told to use, so
 * it never depends on (or writes into) the developer's real task database.
 */
async function seedProfile(profilePath) {
  const now = new Date().toISOString();
  const data = {
    version: 2,
    knowledgeSchemaVersion: 1,
    tasks: [{
      id: "task_ui_seed",
      order: 1,
      groupId: "group_inbox",
      title: "UI 验收种子任务",
      status: "active",
      priority: "medium",
      notes: "",
      nodes: [],
      createdAt: now,
      updatedAt: now,
    }],
    taskGroups: [{ id: "group_inbox", title: "默认", order: 1 }],
    activeGroupId: "group_inbox",
  };
  await fs.writeFile(path.join(profilePath, "task-data.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** The group picker lives inside the collapsed repository filter popover. */
async function openGroupPicker(page) {
  const picker = page.locator(".repository-filter-popover .repository-group-trigger");
  if (!(await picker.isVisible().catch(() => false))) {
    await page.locator("summary.repository-filter-trigger").click();
    await picker.waitFor({ state: "visible" });
  }
  return picker;
}

(async () => {
  const repository = path.join(__dirname, "..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "loop-group-menu-ui-"));
  let app;
  try {
    await seedProfile(profile);
    // Some hosts (VS Code, other Electron apps) export ELECTRON_RUN_AS_NODE;
    // the binary has to start as the desktop app here, not as plain Node.
    const env = { ...process.env, ELECTRON_DISABLE_SANDBOX: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: require("electron"),
      args: ["--no-sandbox", `--user-data-dir=${profile}`, repository],
      cwd: repository,
      env,
    });
    await app.firstWindow();
    const page = await waitForMainWindow(app);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.locator(".ops-app").waitFor();
    assert.match(await page.locator(".task-list-count").innerText(), /1 项/, "the seeded task must load from the isolated profile");

    let trigger = await openGroupPicker(page);
    await trigger.click();
    await page.locator(".repository-group-popover").waitFor();
    await page.locator('.repository-group-popover [data-action="add-group"]').click();
    const groupTitle = "右键验收分组";
    const groupEditor = page.locator(".repository-group-edit");
    await groupEditor.waitFor();
    await groupEditor.fill(groupTitle);
    await groupEditor.press("Enter");
    trigger = await openGroupPicker(page);
    assert.match(await trigger.innerText(), new RegExp(groupTitle), "the new group must become selectable");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(420);

    trigger = await openGroupPicker(page);
    await trigger.click({ button: "right" });
    const menu = page.locator(".context-menu");
    await menu.waitFor();
    assert.match(await menu.innerText(), /批量添加任务/);

    await menu.getByRole("button", { name: "批量添加任务…" }).click();
    await page.locator('.wr-dialog[aria-label="批量添加任务"]').waitFor();
    await page.keyboard.press("Escape");

    trigger = await openGroupPicker(page);
    await trigger.click({ button: "right" });
    await menu.waitFor();
    await page.mouse.click(8, 812);
    assert.equal(await page.locator(".context-menu").count(), 0, "outside click should close the menu");

    // Isolation proof: everything the run wrote must live in the profile we own.
    const written = JSON.parse(await fs.readFile(path.join(profile, "task-data.json"), "utf8"));
    assert.ok(
      written.taskGroups.some((group) => group.title === groupTitle),
      "the UI write must land in the isolated profile",
    );
  } finally {
    await app?.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
