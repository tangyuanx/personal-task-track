const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const { createUpdateController } = require("../app/main/updater.cjs");

function createHarness({ platform = "win32", isPackaged = true, macUpdatesEnabled = false } = {}) {
  const updates = new EventEmitter();
  const handlers = new Map();
  const messages = [];
  const userData = path.join(os.tmpdir(), `personal-task-track-updater-${Date.now()}-${Math.random()}`);
  let checkCount = 0;
  let downloadCount = 0;
  let installArgs = null;
  updates.checkForUpdates = async () => {
    checkCount += 1;
    updates.emit("checking-for-update");
    updates.emit("update-available", {
      version: "0.1.110",
      releaseDate: "2026-08-15T08:00:00.000Z",
      files: [{ size: 30_000_000 }],
    });
  };
  updates.downloadUpdate = async () => {
    downloadCount += 1;
    updates.emit("download-progress", {
      percent: 42.55,
      transferred: 12_000_000,
      total: 30_000_000,
      bytesPerSecond: 2_000_000,
    });
    updates.emit("update-downloaded", { version: "0.1.110" });
    return [];
  };
  updates.quitAndInstall = (...args) => {
    installArgs = args;
  };
  const controller = createUpdateController({
    app: {
      isPackaged,
      getVersion: () => "0.1.109",
      getPath: () => userData,
    },
    BrowserWindow: {
      getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (...args) => messages.push(args) } }],
    },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
    },
    autoUpdater: updates,
    platform,
    macUpdatesEnabled,
  });
  return {
    controller,
    handlers,
    messages,
    updates,
    userData,
    checkCount: () => checkCount,
    downloadCount: () => downloadCount,
    installArgs: () => installArgs,
  };
}

test("packaged Windows checks, downloads, and installs only through explicit actions", async () => {
  const harness = createHarness();
  harness.controller.registerIpc();
  await harness.controller.start({ schedule: false });

  assert.equal(harness.controller.getState().status, "idle");
  await harness.controller.checkForUpdates();
  assert.equal(harness.controller.getState().status, "available");
  assert.equal(harness.controller.getState().version, "0.1.110");
  assert.equal(harness.checkCount(), 1);

  await harness.controller.downloadUpdate();
  assert.equal(harness.controller.getState().status, "downloaded");
  assert.equal(harness.controller.getState().percent, 100);
  assert.equal(harness.downloadCount(), 1);

  assert.equal(harness.controller.installUpdate(), true);
  assert.deepEqual(harness.installArgs(), [false, true]);
  assert.equal(harness.updates.autoDownload, false);
  assert.equal(harness.updates.autoInstallOnAppQuit, false);
  await fs.rm(harness.userData, { recursive: true, force: true });
});

test("automatic-check preference is persisted outside task data", async () => {
  const harness = createHarness();
  await harness.controller.start({ schedule: false });
  await harness.controller.setAutomaticChecks(false);
  const preference = JSON.parse(await fs.readFile(path.join(harness.userData, "update-preferences.json"), "utf8"));
  assert.deepEqual(preference, { automaticChecks: false });
  assert.equal(harness.controller.getState().automaticChecks, false);
  harness.controller.stop();
  await fs.rm(harness.userData, { recursive: true, force: true });
});

test("development and unsigned macOS builds do not contact the update feed", async () => {
  for (const options of [
    { platform: "win32", isPackaged: false },
    { platform: "darwin", isPackaged: true, macUpdatesEnabled: false },
  ]) {
    const harness = createHarness(options);
    await harness.controller.start({ schedule: false });
    await harness.controller.checkForUpdates();
    assert.equal(harness.controller.getState().status, "unsupported");
    assert.equal(harness.checkCount(), 0);
    await fs.rm(harness.userData, { recursive: true, force: true });
  }
});
