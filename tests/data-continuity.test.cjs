const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  BACKUP_ROOT_DIRECTORY,
  INSTALL_BACKUP_DIRECTORY,
  createPreInstallBackup,
  exportPortableBackup,
  importBackup,
  readPortableBackup,
  recoverLegacyUserData,
} = require("../app/main/data-continuity.cjs");

const fixedNow = () => new Date("2026-08-29T08:09:10.000Z");

function completeTaskData(label = "legacy") {
  return {
    version: 1,
    knowledgeSchemaVersion: 1,
    updatedAt: "2026-08-29T08:00:00.000Z",
    tasks: [{
      id: `task-${label}`,
      title: `任务-${label}`,
      description: "完整背景",
      hypothesis: "完整进展",
      conclusion: "完整结论",
      notes: "知识详情正文",
      knowledgeNote: { documentId: `doc-${label}`, documentState: "LOCAL_DRAFT", body: "正文" },
      nodes: [{
        id: `node-${label}`,
        title: "第一节点",
        note: "节点详情",
        hypothesis: "节点判断",
        conclusion: "节点结论",
        children: [{ id: `child-${label}`, title: "子节点", note: "子节点详情", children: [] }],
      }],
    }],
    taskGroups: [{ id: "group_inbox", title: "默认", order: 1 }],
    attachments: { images: { image_1: "data:image/png;base64,aWNvbg==" } },
    theme: "dark",
  };
}

async function writeCompleteUserData(directory, label = "legacy") {
  await fs.mkdir(path.join(directory, "knowledge-note-recovery", "note-a", "assets"), { recursive: true });
  await fs.writeFile(path.join(directory, "task-data.json"), `${JSON.stringify(completeTaskData(label), null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(directory, "knowledge-note-recovery.json"), JSON.stringify({ version: 1, records: { a: { noteId: "a", content: "未提交详情" } } }), "utf8");
  await fs.writeFile(path.join(directory, "knowledge-note-recovery", "note-a", "assets", "image.png"), Buffer.from("asset"));
  await fs.writeFile(path.join(directory, "deadline-reminders.json"), JSON.stringify({ notified: ["task-legacy"] }), "utf8");
  await fs.writeFile(path.join(directory, "today-widget-preferences.json"), JSON.stringify({ opacity: 0.8 }), "utf8");
  await fs.writeFile(path.join(directory, "update-preferences.json"), JSON.stringify({ automaticChecks: true }), "utf8");
  await fs.mkdir(path.join(directory, "Cache"), { recursive: true });
  await fs.writeFile(path.join(directory, "Cache", "chromium.bin"), "not-user-content", "utf8");
}

async function tempRoot(t, name) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("in-app upgrade creates verified stable and installation-directory backups of all managed data", async (t) => {
  const root = await tempRoot(t, "loop-upgrade-backup");
  const appData = path.join(root, "AppData", "Roaming");
  const userData = path.join(appData, "Personal Task Track");
  const installDirectory = path.join(root, "Programs", "Personal Task Track");
  await writeCompleteUserData(userData);

  const backup = await createPreInstallBackup({
    appDataPath: appData,
    userDataPath: userData,
    installDirectory,
    currentVersion: "0.1.141",
    targetVersion: "0.1.142",
    now: fixedNow,
  });

  assert.equal(backup.skipped, false);
  assert.match(backup.backupPath, new RegExp(BACKUP_ROOT_DIRECTORY));
  assert.match(backup.installBackupPath, new RegExp(INSTALL_BACKUP_DIRECTORY));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(backup.installBackupPath, "data", "task-data.json"), "utf8")), completeTaskData());
  assert.equal(await fs.readFile(path.join(backup.installBackupPath, "data", "knowledge-note-recovery", "note-a", "assets", "image.png"), "utf8"), "asset");
  await assert.rejects(fs.access(path.join(backup.dataPath, "Cache", "chromium.bin")));
});

test("an unwritable installation backup stops the upgrade while retaining the verified stable copy", async (t) => {
  const root = await tempRoot(t, "loop-install-backup-failure");
  const appData = path.join(root, "AppData", "Roaming");
  const userData = path.join(appData, "Personal Task Track");
  const installDirectory = path.join(root, "read-only-install");
  await writeCompleteUserData(userData);
  const fileSystem = {
    ...fs,
    async mkdir(directory, options) {
      if (String(directory).startsWith(installDirectory)) throw Object.assign(new Error("access denied"), { code: "EACCES" });
      return fs.mkdir(directory, options);
    },
  };

  await assert.rejects(
    createPreInstallBackup({
      appDataPath: appData,
      userDataPath: userData,
      installDirectory,
      currentVersion: "0.1.141",
      targetVersion: "0.1.142",
      fileSystem,
      now: fixedNow,
    }),
    (error) => error?.code === "INSTALL_DIRECTORY_BACKUP_FAILED" && Boolean(error.stableBackupPath),
  );
  const stable = await fs.readdir(path.join(appData, BACKUP_ROOT_DIRECTORY));
  assert.equal(stable.length, 1);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(appData, BACKUP_ROOT_DIRECTORY, stable[0], "data", "task-data.json"), "utf8")),
    completeTaskData(),
  );
});

test("startup recovers a complete historical directory only when the canonical database is empty", async (t) => {
  const root = await tempRoot(t, "loop-legacy-recovery");
  const canonical = path.join(root, "Personal Task Track");
  const historical = path.join(root, "personal-task-track");
  await fs.mkdir(canonical, { recursive: true });
  await fs.writeFile(path.join(canonical, "task-data.json"), JSON.stringify({ version: 1, tasks: [] }), "utf8");
  await writeCompleteUserData(historical, "historical");

  const result = await recoverLegacyUserData({ appDataPath: root, canonicalUserDataPath: canonical, now: fixedNow });
  assert.equal(result.migrated, true);
  assert.equal(result.sourcePath, historical);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(canonical, "task-data.json"), "utf8")), completeTaskData("historical"));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(historical, "task-data.json"), "utf8")), completeTaskData("historical"));
  assert.equal(await fs.readFile(path.join(canonical, "knowledge-note-recovery", "note-a", "assets", "image.png"), "utf8"), "asset");
});

test("startup never replaces a non-empty canonical database with another historical directory", async (t) => {
  const root = await tempRoot(t, "loop-canonical-wins");
  const canonical = path.join(root, "Personal Task Track");
  const historical = path.join(root, "Loop");
  await writeCompleteUserData(canonical, "current");
  await writeCompleteUserData(historical, "historical");

  const result = await recoverLegacyUserData({ appDataPath: root, canonicalUserDataPath: canonical, now: fixedNow });
  assert.deepEqual(result, { migrated: false, reason: "canonical-has-data" });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(canonical, "task-data.json"), "utf8")), completeTaskData("current"));
});

test("the first post-update launch recovers a richer historical database after backing up a partial canonical copy", async (t) => {
  const root = await tempRoot(t, "loop-richer-post-update");
  const canonical = path.join(root, "Personal Task Track");
  const historical = path.join(root, "personal-task-track");
  await writeCompleteUserData(canonical, "partial");
  const partial = completeTaskData("partial");
  partial.tasks[0].nodes = [];
  await fs.writeFile(path.join(canonical, "task-data.json"), JSON.stringify(partial), "utf8");
  await writeCompleteUserData(historical, "richer");

  const result = await recoverLegacyUserData({
    appDataPath: root,
    canonicalUserDataPath: canonical,
    recoverRicherLegacy: true,
    now: fixedNow,
  });
  assert.equal(result.migrated, true);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(canonical, "task-data.json"), "utf8")), completeTaskData("richer"));
  const backups = await fs.readdir(path.join(root, BACKUP_ROOT_DIRECTORY));
  assert.equal(backups.some((name) => name.startsWith("pre-migration-")), true);
});

test("portable export and import restore tasks, nested node details, recovery assets, and preferences", async (t) => {
  const root = await tempRoot(t, "loop-portable");
  const source = path.join(root, "source");
  const appData = path.join(root, "target-app-data");
  const target = path.join(appData, "Personal Task Track");
  const installDirectory = path.join(root, "install");
  const portablePath = path.join(root, "complete.loopbackup");
  await writeCompleteUserData(source, "portable");
  await writeCompleteUserData(target, "current");

  const exported = await exportPortableBackup({ userDataPath: source, destinationPath: portablePath, appVersion: "0.1.142", now: fixedNow });
  assert.equal(exported.destinationPath, portablePath);
  const payload = await readPortableBackup(portablePath);
  assert.equal(payload.files.some((file) => file.relativePath.endsWith("assets/image.png")), true);

  const imported = await importBackup({
    selectedPath: portablePath,
    selectionType: "file",
    appDataPath: appData,
    userDataPath: target,
    installDirectory,
    now: fixedNow,
  });
  assert.equal(imported.imported, true);
  assert.equal(imported.tasks, 1);
  assert.equal(imported.nodes, 2);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target, "task-data.json"), "utf8")), completeTaskData("portable"));
  assert.equal(await fs.readFile(path.join(target, "knowledge-note-recovery", "note-a", "assets", "image.png"), "utf8"), "asset");
  assert.equal(await fs.readFile(path.join(target, "today-widget-preferences.json"), "utf8"), JSON.stringify({ opacity: 0.8 }));
});

test("tampered portable backups are rejected before current data is changed", async (t) => {
  const root = await tempRoot(t, "loop-tampered-portable");
  const source = path.join(root, "source");
  const portablePath = path.join(root, "tampered.loopbackup");
  await writeCompleteUserData(source, "secure");
  await exportPortableBackup({ userDataPath: source, destinationPath: portablePath, appVersion: "0.1.142", now: fixedNow });
  const payload = JSON.parse(await fs.readFile(portablePath, "utf8"));
  payload.files.find((file) => file.relativePath === "task-data.json").contentBase64 = Buffer.from("tampered").toString("base64");
  await fs.writeFile(portablePath, JSON.stringify(payload), "utf8");
  await assert.rejects(readPortableBackup(portablePath), (error) => error?.code === "PORTABLE_BACKUP_HASH_MISMATCH");
});

test("directory import accepts installer backup layouts and restores the richest legacy data", async (t) => {
  const root = await tempRoot(t, "loop-directory-import");
  const selected = path.join(root, "installer-pre-0.1.142");
  const legacy = path.join(selected, "Personal Task Track");
  const targetAppData = path.join(root, "target-app-data");
  const target = path.join(targetAppData, "Personal Task Track");
  await writeCompleteUserData(legacy, "installer");
  await writeCompleteUserData(target, "current");

  const imported = await importBackup({
    selectedPath: selected,
    selectionType: "directory",
    appDataPath: targetAppData,
    userDataPath: target,
    installDirectory: path.join(root, "install"),
    now: fixedNow,
  });
  assert.equal(imported.imported, true);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target, "task-data.json"), "utf8")), completeTaskData("installer"));
});

test("failed import rolls back to the verified pre-import database", async (t) => {
  const root = await tempRoot(t, "loop-import-rollback");
  const source = path.join(root, "source");
  const appData = path.join(root, "app-data");
  const target = path.join(appData, "Personal Task Track");
  const portablePath = path.join(root, "incoming.loopbackup");
  await writeCompleteUserData(source, "incoming");
  await writeCompleteUserData(target, "current");
  await exportPortableBackup({ userDataPath: source, destinationPath: portablePath, appVersion: "0.1.142", now: fixedNow });

  let failedRestore = false;
  const fileSystem = {
    ...fs,
    async rename(sourcePath, destinationPath) {
      if (!failedRestore && destinationPath === path.join(target, "task-data.json") && sourcePath.includes(".migration-")) {
        failedRestore = true;
        throw Object.assign(new Error("simulated disk failure"), { code: "EIO" });
      }
      return fs.rename(sourcePath, destinationPath);
    },
  };
  await assert.rejects(
    importBackup({
      selectedPath: portablePath,
      selectionType: "file",
      appDataPath: appData,
      userDataPath: target,
      installDirectory: path.join(root, "install"),
      fileSystem,
      now: fixedNow,
    }),
    (error) => error?.code === "IMPORT_ROLLED_BACK",
  );
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target, "task-data.json"), "utf8")), completeTaskData("current"));
});

test("Windows installer backs up before uninstall and preserves the legacy install folder identity", async () => {
  const installer = await fs.readFile(path.join(__dirname, "..", "build", "installer.nsh"), "utf8");
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(packageJson.build.nsis.include, "build/installer.nsh");
  assert.match(installer, /!define APP_FILENAME "Personal Task Track"/);
  assert.match(installer, /!macro customInit[\s\S]*backupLoopUpgradeDirectory/);
  assert.match(installer, /!macro customInstall[\s\S]*\$INSTDIR\\Loop Data Backups/);
  assert.match(installer, /Abort/);
});

test("settings and preload expose complete backup export plus file and directory restore actions", async () => {
  const root = path.join(__dirname, "..");
  const renderer = await fs.readFile(path.join(root, "app", "renderer", "src", "app.js"), "utf8");
  const preload = await fs.readFile(path.join(root, "app", "main", "preload.cjs"), "utf8");
  const main = await fs.readFile(path.join(root, "app", "main", "main.cjs"), "utf8");
  assert.match(renderer, /data-backup-action="export"/);
  assert.match(renderer, /data-backup-action="import-file"/);
  assert.match(renderer, /data-backup-action="import-directory"/);
  assert.match(preload, /dataBackup:[\s\S]*importDirectory/);
  assert.match(main, /data-backup:export/);
  assert.match(main, /data-backup:import/);
});
