const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const TASK_DATA_FILE = "task-data.json";

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

test("invalid or newer backup databases are rejected before replacing the workspace", async (t) => {
  const root = await tempRoot(t, "loop-import-schema");
  const source = path.join(root, "source"), target = path.join(root, "target");
  await writeCompleteUserData(source); await writeCompleteUserData(target, "kept");
  const before = await fs.readFile(path.join(target, TASK_DATA_FILE), "utf8");
  for (const invalid of [{}, [], { tasks: "bad" }, { tasks: [], version: 999 }, { tasks: [], recentlyDeletedSchemaVersion: 99 }]) {
    await fs.writeFile(path.join(source, TASK_DATA_FILE), JSON.stringify(invalid));
    const selectedPath = path.join(root, "invalid.loopbackup");
    await exportPortableBackup({ userDataPath: source, destinationPath: selectedPath });
    await assert.rejects(importBackup({ selectedPath, userDataPath: target, appDataPath: root }), error => ["INVALID_IMPORTED_TASK_DATA", "UNSUPPORTED_DATA_VERSION"].includes(error.code));
    assert.equal(await fs.readFile(path.join(target, TASK_DATA_FILE), "utf8"), before);
  }
});

test("a corrupted restored attachment triggers verified rollback of all managed files", async (t) => {
  const root = await tempRoot(t, "loop-import-assets");
  const source = path.join(root, "source"), target = path.join(root, "target");
  await writeCompleteUserData(source, "incoming"); await writeCompleteUserData(target, "kept");
  const selectedPath = path.join(root, "incoming.loopbackup");
  await exportPortableBackup({ userDataPath: source, destinationPath: selectedPath });
  let corrupted = false;
  const fileSystem = { ...fs, async cp(from, to, options) {
    await fs.cp(from, to, options);
    if (!corrupted && to === path.join(target, "knowledge-note-recovery")) {
      corrupted = true;
      await fs.writeFile(path.join(to, "note-a", "assets", "image.png"), "corruption");
    }
  } };
  await assert.rejects(importBackup({ selectedPath, userDataPath: target, appDataPath: root, fileSystem }), { code: "IMPORT_ROLLED_BACK" });
  assert.equal(JSON.parse(await fs.readFile(path.join(target, TASK_DATA_FILE), "utf8")).tasks[0].id, "task-kept");
  assert.equal(await fs.readFile(path.join(target, "knowledge-note-recovery", "note-a", "assets", "image.png"), "utf8"), "asset");
  assert.equal(await fs.readFile(path.join(target, "Cache", "chromium.bin"), "utf8"), "not-user-content");
});

test("complete backup and restart retain appearance, filters, interaction settings, navigation and archives", async (t) => {
  const { readTaskData, writeTaskData } = require("../app/main/storage.cjs");
  const root = await tempRoot(t, "loop-preferences-roundtrip");
  const source = path.join(root, "source"), target = path.join(root, "target");
  const prefs = { continuous: false, follow: false, workNavigationEnabled: true };
  const written = await writeTaskData(source, { ...completeTaskData("prefs"), uiPreferences: prefs, zhFont: "noto", enFont: "inter", fontScale: "current", priorityFilter: "high", newTaskPriority: "low" });
  const selectedPath = path.join(root, "preferences.loopbackup");
  await exportPortableBackup({ userDataPath: source, destinationPath: selectedPath });
  await importBackup({ selectedPath, userDataPath: target, appDataPath: root });
  const reopened = await readTaskData(target);
  for (const key of ["uiPreferences", "theme", "zhFont", "enFont", "fontScale", "priorityFilter", "newTaskPriority", "workNavigation", "attachments", "recentlyDeleted"]) assert.deepEqual(reopened[key], written[key], key);
});

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

test("an import whose rollback also fails reports the safety backup instead of hiding it", async (t) => {
  const root = await tempRoot(t, "loop-import-rollback-failed");
  const source = path.join(root, "source");
  const appData = path.join(root, "app-data");
  const target = path.join(appData, "Personal Task Track");
  const portablePath = path.join(root, "incoming.loopbackup");
  await writeCompleteUserData(source, "incoming");
  await writeCompleteUserData(target, "current");
  await exportPortableBackup({ userDataPath: source, destinationPath: portablePath, appVersion: "0.1.142", now: fixedNow });

  let failures = 0;
  const fileSystem = {
    ...fs,
    async rename(sourcePath, destinationPath) {
      if (failures < 2 && destinationPath === path.join(target, "task-data.json") && sourcePath.includes(".migration-")) {
        failures += 1;
        throw Object.assign(new Error("simulated disk failure"), { code: "EIO" });
      }
      return fs.rename(sourcePath, destinationPath);
    },
  };
  let reportedBackupPath = "";
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
    (error) => {
      assert.equal(error?.code, "IMPORT_ROLLBACK_FAILED", "a failed rollback must not be reported as a clean rollback");
      reportedBackupPath = error?.safetyBackupPath || "";
      assert.ok(reportedBackupPath, "the safety backup path must be surfaced to the caller");
      assert.match(String(error?.message || ""), /安全备份/);
      return true;
    },
  );
  assert.equal(failures, 2, "the import restore and the rollback restore must both have been attempted");
  const safetyTaskData = JSON.parse(await fs.readFile(path.join(reportedBackupPath, "data", "task-data.json"), "utf8"));
  assert.equal(safetyTaskData.tasks[0].id, "task-current", "the safety backup must hold the pre-import database");
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

test("Windows installer never recursively wraps historical installation backups", async () => {
  const installer = await fs.readFile(path.join(__dirname, "..", "build", "installer.nsh"), "utf8");
  const customInit = installer.match(/!macro customInit([\s\S]*?)!macroend/)?.[1] ?? "";
  const customInstall = installer.match(/!macro customInstall([\s\S]*?)!macroend/)?.[1] ?? "";
  const mirrorDirectory = installer.match(/!macro mirrorLoopUpgradeDirectory LABEL([\s\S]*?)!macroend/)?.[1] ?? "";
  const allowedLabels = ["Personal Task Track", "personal-task-track", "PersonalTaskTrack", "Loop"];

  assert.notEqual(customInit, "");
  assert.notEqual(customInstall, "");
  assert.notEqual(mirrorDirectory, "");
  assert.equal(installer.includes("previous-install-backups"), false);
  assert.equal(installer.includes('$INSTDIR\\Loop Data Backups\\*.*'), false);
  assert.equal(installer.includes('$loopUpgradeBackupRoot\\*.*'), false);

  const backedUpLabels = [...customInit.matchAll(/!insertmacro backupLoopUpgradeDirectory "\$APPDATA\\[^"]+" "([^"]+)"/g)]
    .map((match) => match[1]);
  const mirroredLabels = [...customInstall.matchAll(/!insertmacro mirrorLoopUpgradeDirectory "([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(backedUpLabels, allowedLabels);
  assert.deepEqual(mirroredLabels, allowedLabels);

  assert.match(mirrorDirectory, /CopyFiles \/SILENT "\$loopUpgradeBackupRoot\\\$\{LABEL\}\\\*\.\*"/);
  assert.match(mirrorDirectory, /MessageBox MB_OK\|MB_ICONSTOP[\s\S]*Abort/);
  assert.equal((customInstall.match(/verifyLoopUpgradeFile[^\r\n]*task-data\.json/g) ?? []).length, 4);
  assert.match(installer, /!macro copyLoopUpgradeFile[\s\S]*task-data\.json[\s\S]*Abort/);
});

test("Windows installer quarantines legacy installation backups before invoking the old uninstaller", async () => {
  const installer = await fs.readFile(path.join(__dirname, "..", "build", "installer.nsh"), "utf8");
  const quarantine = installer.match(/!macro quarantineLegacyInstallBackups([\s\S]*?)!macroend/)?.[1] ?? "";
  const customInit = installer.match(/!macro customInit([\s\S]*?)!macroend/)?.[1] ?? "";

  assert.notEqual(quarantine, "");
  assert.match(customInit, /backupLoopUpgradeDirectory[\s\S]*quarantineLegacyInstallBackups/);
  assert.match(quarantine, /ReadRegStr \$loopRegisteredInstallLocation SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" InstallLocation/);
  assert.match(quarantine, /\$loopRegisteredInstallLocation != \$INSTDIR[\s\S]*Abort/);
  assert.match(quarantine, /\$INSTDIR\\Loop\.exe/);
  assert.match(quarantine, /\$INSTDIR\.legacy-loop-backups-pre-\$\{VERSION\}/);
  assert.match(quarantine, /Rename "\$loopLegacyInstallBackupsSource" "\$loopLegacyInstallBackupsQuarantine"/);
  assert.match(quarantine, /legacy-install-backups-location\.txt/);
  assert.doesNotMatch(quarantine, /CopyFiles|RMDir\s+\/r|robocopy|DeleteRegValue|DeleteRegKey/);
  assert.match(quarantine, /同版本的历史升级备份隔离目录[\s\S]*Abort/);
  assert.match(quarantine, /无法将旧版本的历史升级备份移出安装目录[\s\S]*Abort/);
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

test("a portable backup carries the Recently Deleted archive both ways", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loop-recovery26-backup-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "restored");
  const backupFile = path.join(root, "loop-backup.loopbackup");
  await fs.mkdir(source, { recursive: true });
  await fs.mkdir(destination, { recursive: true });
  try {
    const archive = [
      { id: "rd_task", kind: "task", deletedAt: "2026-10-05T09:20:00.000Z", transactionId: "tx-1", title: "已删除任务", groupId: "group_tools", position: 1, record: { id: "task_gone", title: "已删除任务", nodes: [] } },
      { id: "rd_note", kind: "note", deletedAt: "2026-10-05T09:10:00.000Z", transactionId: "tx-2", title: "笔记", ownerTaskId: "task_live", body: "# 正文\n\n保留", sourcePath: "/tmp/note.md" },
    ];
    await fs.writeFile(path.join(source, TASK_DATA_FILE), JSON.stringify({
      version: 2,
      knowledgeSchemaVersion: 1,
      recentlyDeletedSchemaVersion: 1,
      tasks: [{ id: "task_live", title: "仍然存在的任务" }],
      taskGroups: [],
      recentlyDeleted: archive,
    }), "utf8");

    const exported = await exportPortableBackup({ userDataPath: source, destinationPath: backupFile, appVersion: "0.1.212" });
    assert.ok(exported.fileCount >= 1);

    // A backup written before this stage simply has no archive key; importing it
    // must still succeed and leave an empty archive rather than failing.
    const legacyBackup = path.join(root, "legacy.loopbackup");
    const legacyPayload = JSON.parse(await fs.readFile(backupFile, "utf8"));
    legacyPayload.files = legacyPayload.files.map((file) => {
      if (file.relativePath !== TASK_DATA_FILE) return file;
      const data = JSON.parse(Buffer.from(file.contentBase64, "base64").toString("utf8"));
      delete data.recentlyDeleted;
      delete data.recentlyDeletedSchemaVersion;
      const content = Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8");
      return {
        relativePath: file.relativePath,
        bytes: content.length,
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
        contentBase64: content.toString("base64"),
      };
    });
    await fs.writeFile(legacyBackup, `${JSON.stringify(legacyPayload)}\n`, "utf8");
    const stagedLegacy = await readPortableBackup(legacyBackup);
    assert.equal(stagedLegacy.files.length, legacyPayload.files.length);
    const legacyData = JSON.parse(stagedLegacy.files.find((file) => file.relativePath === TASK_DATA_FILE).content.toString("utf8"));
    assert.equal(Object.hasOwn(legacyData, "recentlyDeleted"), false, "an older backup has no archive key and must still be readable");

    // The current backup still carries every archive entry byte for byte.
    const staged = await readPortableBackup(backupFile);
    const restoredData = JSON.parse(staged.files.find((file) => file.relativePath === TASK_DATA_FILE).content.toString("utf8"));
    assert.equal(restoredData.recentlyDeleted.length, 2);
    assert.equal(restoredData.recentlyDeleted[0].id, "rd_task");
    assert.equal(restoredData.recentlyDeleted[1].body.includes("保留"), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
