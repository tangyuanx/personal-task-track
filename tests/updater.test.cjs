const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const { classifyUpdateError, createUpdateController } = require("../app/main/updater.cjs");

function createHarness({
  platform = "win32",
  isPackaged = true,
  macUpdatesEnabled = false,
  prepareInstallResult = true,
  installThrows = false,
  checkError = null,
  installDirectory = "C:\\Users\\example\\AppData\\Local\\Programs\\Personal Task Track",
} = {}) {
  const updates = new EventEmitter();
  const handlers = new Map();
  const messages = [];
  const userData = path.join(os.tmpdir(), `personal-task-track-updater-${Date.now()}-${Math.random()}`);
  let checkCount = 0;
  let downloadCount = 0;
  let prepareInstallCount = 0;
  let installArgs = null;
  updates.checkForUpdates = async () => {
    checkCount += 1;
    updates.emit("checking-for-update");
    if (checkError) throw checkError;
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
    if (installThrows) throw Object.assign(new Error("installer spawn failed"), { code: "EACCES" });
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
    installDirectory,
    prepareInstall: async () => {
      prepareInstallCount += 1;
      return prepareInstallResult;
    },
  });
  return {
    controller,
    handlers,
    messages,
    updates,
    userData,
    checkCount: () => checkCount,
    downloadCount: () => downloadCount,
    prepareInstallCount: () => prepareInstallCount,
    installArgs: () => installArgs,
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("one explicit Windows upgrade action downloads, prepares, silently installs, and relaunches", async () => {
  const harness = createHarness();
  harness.controller.registerIpc();
  await harness.controller.start({ schedule: false });

  assert.equal(harness.controller.getState().status, "idle");
  await harness.controller.checkForUpdates();
  assert.equal(harness.controller.getState().status, "available");
  assert.equal(harness.controller.getState().version, "0.1.110");
  assert.equal(harness.checkCount(), 1);

  await harness.controller.downloadUpdate();
  await settle();
  assert.equal(harness.controller.getState().status, "installing");
  assert.equal(harness.controller.getState().percent, 100);
  assert.equal(harness.downloadCount(), 1);
  assert.equal(harness.prepareInstallCount(), 1);
  assert.deepEqual(harness.installArgs(), [true, true]);
  assert.equal(harness.updates.autoDownload, false);
  assert.equal(harness.updates.autoInstallOnAppQuit, false);
  assert.equal(harness.updates.installDirectory, "C:\\Users\\example\\AppData\\Local\\Programs\\Personal Task Track");
  await fs.rm(harness.userData, { recursive: true, force: true });
});

test("an availability check or unapproved downloaded event never starts installation", async () => {
  const harness = createHarness();
  await harness.controller.start({ schedule: false });
  await harness.controller.checkForUpdates("automatic");
  harness.updates.emit("update-downloaded", { version: "0.1.110" });
  await settle();

  assert.equal(harness.controller.getState().status, "downloaded");
  assert.equal(harness.downloadCount(), 0);
  assert.equal(harness.prepareInstallCount(), 0);
  assert.equal(harness.installArgs(), null);
  await fs.rm(harness.userData, { recursive: true, force: true });
});

test("failed pre-install persistence keeps the app open and the downloaded update retryable", async () => {
  const harness = createHarness({ prepareInstallResult: false });
  await harness.controller.start({ schedule: false });
  await harness.controller.checkForUpdates();
  await harness.controller.downloadUpdate();
  await settle();

  assert.equal(harness.controller.getState().status, "downloaded");
  assert.equal(harness.controller.getState().errorCode, "INSTALL_PREPARATION_FAILED");
  assert.equal(harness.prepareInstallCount(), 1);
  assert.equal(harness.installArgs(), null);
  await fs.rm(harness.userData, { recursive: true, force: true });
});

test("rapid repeated upgrade actions share one download and one install preparation", async () => {
  const harness = createHarness();
  await harness.controller.start({ schedule: false });
  await harness.controller.checkForUpdates();
  await Promise.all([
    harness.controller.downloadUpdate(),
    harness.controller.downloadUpdate(),
    harness.controller.downloadUpdate(),
  ]);
  await settle();

  assert.equal(harness.downloadCount(), 1);
  assert.equal(harness.prepareInstallCount(), 1);
  assert.deepEqual(harness.installArgs(), [true, true]);
  await fs.rm(harness.userData, { recursive: true, force: true });
});

test("installer launch failure remains visible and does not report an installing state", async () => {
  const harness = createHarness({ installThrows: true });
  await harness.controller.start({ schedule: false });
  await harness.controller.checkForUpdates();
  await harness.controller.downloadUpdate();
  await settle();

  assert.equal(harness.controller.getState().status, "error");
  assert.equal(harness.controller.getState().errorCode, "EACCES");
  assert.equal(harness.prepareInstallCount(), 1);
  assert.equal(harness.installArgs(), null);
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

test("update failures distinguish an incomplete Windows release from user network errors", async () => {
  const incompleteRelease = createHarness({
    checkError: Object.assign(
      new Error('Cannot find channel "latest.yml" update info: HttpError: 404 Not Found'),
      { code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" },
    ),
  });
  await incompleteRelease.controller.start({ schedule: false });
  await incompleteRelease.controller.checkForUpdates();
  assert.equal(incompleteRelease.controller.getState().status, "error");
  assert.equal(incompleteRelease.controller.getState().errorCode, "UPDATE_METADATA_MISSING");

  const offline = createHarness({
    checkError: Object.assign(new Error("getaddrinfo ENOTFOUND api.github.com"), { code: "ENOTFOUND" }),
  });
  await offline.controller.start({ schedule: false });
  await offline.controller.checkForUpdates();
  assert.equal(offline.controller.getState().errorCode, "UPDATE_NETWORK_UNAVAILABLE");

  assert.equal(classifyUpdateError(Object.assign(new Error("request timed out"), { code: "ETIMEDOUT" })), "UPDATE_TIMEOUT");
  await Promise.all([
    fs.rm(incompleteRelease.userData, { recursive: true, force: true }),
    fs.rm(offline.userData, { recursive: true, force: true }),
  ]);
});
