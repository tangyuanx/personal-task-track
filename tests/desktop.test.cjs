const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {
  KNOWLEDGE_MIGRATION_VERSION,
  normalizeTaskData,
  migrateKnowledgeTaskData,
  readTaskData,
  writeTaskData,
} = require("../app/main/storage.cjs");
const knowledgeDocument = require("../app/renderer/src/knowledge-document.js");
const knowledgeRecovery = require("../app/renderer/src/knowledge-recovery.js");
const {
  deleteKnowledgeRecovery,
  readKnowledgeRecovery,
  recoveryFilePath,
  writeKnowledgeRecovery,
} = require("../app/main/recovery.cjs");
const knowledgeFile = require("../app/main/knowledge-file.cjs");
const knowledgeAssets = require("../app/main/knowledge-assets.cjs");
const { createKnowledgeFileWatcher } = require("../app/main/knowledge-watcher.cjs");
const {
  applyTodayWidgetTopmost,
  cornerWindowBounds,
  resizedWidgetBounds,
  normalizeSnapshot,
  normalizeTodayWidgetAppearance,
  normalizeTodayWidgetPreferences,
  readTodayWidgetPreferences,
  writeTodayWidgetPreferences,
} = require("../app/main/today-widget.cjs");

const KNOWLEDGE_RECOVERY_KEY_FOR_TEST = "task-track-knowledge-recovery-v1";

function runKilledSaveChild(filePath, killPoint) {
  const script = `
    const fs = require("node:fs/promises");
    const { atomicWriteFile } = require("./app/main/knowledge-file.cjs");
    const target = process.argv[1];
    const killPoint = process.argv[2];
    const fsOps = {
      open: async (...args) => {
        const handle = await fs.open(...args);
        const writeFile = handle.writeFile.bind(handle);
        const sync = handle.sync.bind(handle);
        handle.writeFile = async (...writeArgs) => {
          const result = await writeFile(...writeArgs);
          if (killPoint === "after-write") process.kill(process.pid, "SIGKILL");
          return result;
        };
        handle.sync = async (...syncArgs) => {
          const result = await sync(...syncArgs);
          if (killPoint === "after-sync") process.kill(process.pid, "SIGKILL");
          return result;
        };
        return handle;
      }
    };
    atomicWriteFile(target, "进程中断后不应覆盖", { fsOps, platform: process.platform }).catch(() => process.exit(2));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script, filePath, killPoint], {
      cwd: path.join(__dirname, ".."),
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function runKilledRecoveryChild(userDataPath) {
  const script = `
    const fs = require("node:fs/promises");
    const originalOpen = fs.open;
    fs.open = async (...args) => {
      const handle = await originalOpen(...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async (...syncArgs) => {
        const result = await sync(...syncArgs);
        process.kill(process.pid, "SIGKILL");
        return result;
      };
      return handle;
    };
    const { writeKnowledgeRecovery } = require("./app/main/recovery.cjs");
    writeKnowledgeRecovery(process.argv[1], { noteId: "kill-recovery", content: "Recovery 中断后的新正文" }).catch(() => process.exit(2));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script, userDataPath], {
      cwd: path.join(__dirname, ".."),
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function assertForceTerminated(child) {
  if (process.platform === "win32") {
    assert.equal(child.signal, null);
    assert.notEqual(child.code, 0);
    return;
  }
  assert.equal(child.signal, "SIGKILL");
}

async function waitForCondition(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for asynchronous test condition.");
}

function rendererHarness(personalTaskTrack = undefined) {
  const storage = new Map();
  const alerts = [];
  const document = {
    activeElement: null,
    body: {
      appendChild() {},
      contains: () => true,
      classList: { add() {}, remove() {} },
    },
    documentElement: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      classList: { add() {}, contains: () => false, remove() {} },
      click() {},
      dataset: {},
      focus() {},
      remove() {},
      setAttribute() {},
      style: {},
    }),
    createTextNode: (value) => ({ value }),
    execCommand: () => false,
    queryCommandSupported: () => false,
  };
  const window = {
    personalTaskTrack,
    addEventListener() {},
    clearTimeout,
    setTimeout,
    requestAnimationFrame() {},
    getSelection: () => null,
    innerHeight: 820,
    innerWidth: 1280,
    location: { reload() {} },
  };
  const context = vm.createContext({
    alert(message) { alerts.push(String(message)); },
    Blob,
    confirm: () => true,
    console,
    document,
    Event,
    FileReader: class {},
    HTMLTextAreaElement: class {},
    InputEvent: globalThis.InputEvent || class {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    URL: {
      createObjectURL: () => "blob:test",
      revokeObjectURL() {},
    },
    window,
  });
  return Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "knowledge-document.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "knowledge-recovery.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
  ]).then(([documentSource, recoverySource, source]) => {
      vm.runInContext(documentSource, context, {
        filename: "app/renderer/src/knowledge-document.js",
      });
      vm.runInContext(recoverySource, context, {
        filename: "app/renderer/src/knowledge-recovery.js",
      });
      vm.runInContext(source.replace(/\nbootstrap\(\);\s*$/, "\n"), context, {
        filename: "app/renderer/src/app.js",
      });
      return {
        evaluate(expression) {
          return vm.runInContext(expression, context);
        },
        json(expression) {
          return JSON.parse(JSON.stringify(vm.runInContext(expression, context)));
        },
        storageValue(key) {
          return storage.get(key) ?? null;
        },
        alerts,
      };
    });
}

test("knowledge document sessions expose safe draft and save transitions", () => {
  const draft = knowledgeDocument.createDocumentSession({
    noteId: "note_a",
    taskId: "task_a",
    title: "原始标题",
    createdAt: "2026-08-22T00:00:00.000Z",
  });
  assert.equal(draft.documentState, "DRAFT");
  assert.equal(draft.filePath, null);
  assert.equal(draft.dirty, false);

  const edited = knowledgeDocument.markDocumentEdited(draft);
  assert.equal(edited.documentState, "DRAFT");
  assert.equal(edited.dirty, true);

  const saved = knowledgeDocument.markDocumentSaved(edited, {
    filePath: "/tmp/knowledge.md",
    lastSavedHash: "hash_a",
    lastSavedMtime: 123,
  });
  assert.equal(saved.documentState, "SAVED");
  assert.equal(saved.filePath, "/tmp/knowledge.md");
  assert.equal(saved.dirty, false);
  assert.equal(saved.lastSavedHash, "hash_a");
  assert.equal(saved.lastSavedMtime, 123);

  const changed = knowledgeDocument.markDocumentEdited(saved);
  assert.equal(changed.documentState, "DIRTY");
  assert.equal(changed.dirty, true);
  assert.equal(knowledgeDocument.updateDocumentTitle(changed, "新标题").filePath, "/tmp/knowledge.md");
});

test("knowledge document abnormal states remain explicit and dirty", () => {
  const saved = knowledgeDocument.markDocumentSaved(
    knowledgeDocument.createDocumentSession({ taskId: "task_a", title: "笔记" }),
    { filePath: "/tmp/knowledge.md" },
  );
  assert.equal(knowledgeDocument.markDocumentExternalChanged(saved).documentState, "EXTERNAL_CHANGED");
  assert.equal(knowledgeDocument.markDocumentFileMissing(saved).documentState, "FILE_MISSING");
  assert.equal(knowledgeDocument.markDocumentReadOnly(saved).documentState, "READ_ONLY");
  assert.equal(knowledgeDocument.markDocumentExternalChanged(saved).dirty, true);
});

test("legacy tasks receive migration-safe knowledge metadata", async () => {
  const legacy = normalizeTaskData({
    tasks: [{ id: "task_legacy", title: "旧笔记", notes: "旧正文" }],
  });
  const note = legacy.tasks[0].knowledgeNote;
  assert.equal(legacy.tasks[0].notes, "旧正文");
  assert.equal(note.noteId, "task_legacy");
  assert.equal(note.taskId, "task_legacy");
  assert.equal(note.documentState, "DRAFT");
  assert.equal(note.filePath, null);
  assert.equal(note.dirty, false);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-track-document-state-"));
  try {
    await writeTaskData(tempDir, legacy);
    const restored = await readTaskData(tempDir);
    assert.equal(restored.tasks[0].knowledgeNote.noteId, "task_legacy");
    assert.equal(restored.tasks[0].knowledgeNote.documentState, "DRAFT");
    assert.equal(restored.tasks[0].notes, "旧正文");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("legacy knowledge migration is idempotent and preserves old bodies and images", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-migration-"));
  const filePath = path.join(directory, "task-data.json");
  const legacyBody = "# 旧知识 😀\n\n|列|值|\n|---|---|\n|中文|保留|\n\n```js\nconst legacy = true;\n```";
  const legacyImage = "data:image/png;base64,bGVnYWN5";
  const rawLegacy = {
    version: 0,
    tasks: [
      { id: "legacy_body", title: "旧笔记", notes: legacyBody, nodes: [] },
      { id: "legacy_string", title: "旧字符串字段", knowledgeNote: "旧字段正文", nodes: [] },
    ],
    attachments: { images: { old_image: legacyImage } },
  };
  const rawText = `${JSON.stringify(rawLegacy, null, 2)}\n`;
  await fs.writeFile(filePath, rawText, "utf8");
  try {
    const migrated = await readTaskData(directory);
    assert.equal(migrated.knowledgeSchemaVersion, KNOWLEDGE_MIGRATION_VERSION);
    assert.equal(migrated.tasks[0].notes, legacyBody);
    assert.equal(migrated.tasks[0].knowledgeNote.documentState, "DRAFT");
    assert.equal(migrated.tasks[0].knowledgeNote.filePath, null);
    assert.equal(migrated.tasks[1].notes, "旧字段正文");
    assert.equal(migrated.tasks[1].knowledgeNote.documentState, "DRAFT");
    assert.equal(migrated.attachments.images.old_image, legacyImage);
    const once = migrateKnowledgeTaskData(rawLegacy);
    assert.deepEqual(migrateKnowledgeTaskData(once), once);
    assert.deepEqual(normalizeTaskData(migrated), migrated);
    assert.equal(await fs.readFile(filePath, "utf8"), rawText);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("mixed legacy knowledge fields preserve the non-empty source body", () => {
  const legacy = migrateKnowledgeTaskData({
    tasks: [
      { id: "mixed_empty", notes: "", knowledgeNote: "旧正文" },
      { id: "mixed_current", notes: "新正文", knowledgeNote: "旧正文不应覆盖" },
    ],
  });
  assert.equal(legacy.tasks[0].notes, "旧正文");
  assert.equal(legacy.tasks[1].notes, "新正文");
  assert.equal(migrateKnowledgeTaskData(legacy).tasks[1].notes, "新正文");
});

test("future task-data versions are rejected without normalization or overwrite", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-future-schema-"));
  const filePath = path.join(directory, "task-data.json");
  const futureData = { version: 99, knowledgeSchemaVersion: 99, tasks: [{ id: "future", notes: "保留" }] };
  const raw = `${JSON.stringify(futureData)}\n`;
  await fs.writeFile(filePath, raw, "utf8");
  try {
    await assert.rejects(readTaskData(directory), (error) => error.code === "UNSUPPORTED_DATA_VERSION");
    await assert.rejects(writeTaskData(directory, futureData), (error) => error.code === "UNSUPPORTED_DATA_VERSION");
    assert.equal(await fs.readFile(filePath, "utf8"), raw);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("knowledge recovery stores independent content with its file baseline", async () => {
  const data = knowledgeRecovery.normalizeRecoveryData({
    records: {
      note_a: { content: "正文", updatedAt: "2026-08-22T01:00:00.000Z", baseFileHash: "hash_a" },
      invalid: { content: 42, updatedAt: "not-a-date" },
    },
  });
  assert.deepEqual(data.records.note_a, {
    noteId: "note_a",
    content: "正文",
    updatedAt: "2026-08-22T01:00:00.000Z",
    baseFileHash: "hash_a",
    assets: [],
  });
  assert.equal(data.records.invalid.updatedAt, "");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-recovery-"));
  try {
    await Promise.all([
      writeKnowledgeRecovery(directory, {
        noteId: "note_a",
        content: "A",
        updatedAt: "2026-08-22T01:00:00.000Z",
        assets: [{ source: "task-image:image_a", dataUrl: "data:image/png;base64,cG5n" }],
      }),
      writeKnowledgeRecovery(directory, { noteId: "note_b", content: "B", updatedAt: "2026-08-22T01:01:00.000Z" }),
    ]);
    const stored = await readKnowledgeRecovery(directory);
    assert.equal(stored.records.note_a.content, "A");
    assert.equal(stored.records.note_a.assets[0].source, "task-image:image_a");
    assert.equal(stored.records.note_b.content, "B");
    assert.equal(await deleteKnowledgeRecovery(directory, "note_a"), true);
    assert.equal((await readKnowledgeRecovery(directory)).records.note_a, undefined);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("corrupt knowledge recovery data is backed up before empty fallback", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-corrupt-recovery-"));
  const filePath = recoveryFilePath(directory);
  const corruptContent = '{"records":';
  try {
    await fs.writeFile(filePath, corruptContent, "utf8");
    const recovered = await readKnowledgeRecovery(directory);
    assert.deepEqual(recovered, { version: 1, records: {} });
    const files = await fs.readdir(directory);
    const backups = files.filter((file) => file.startsWith("knowledge-note-recovery.json.corrupt-"));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(directory, backups[0]), "utf8"), corruptContent);
    await assert.rejects(fs.access(filePath));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("forced Recovery-process termination preserves the previous Recovery record", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-recovery-kill-"));
  try {
    await writeKnowledgeRecovery(directory, { noteId: "kill-recovery", content: "Recovery 中断前的正文" });
    const child = await runKilledRecoveryChild(directory);
    assertForceTerminated(child);
    const recovered = await readKnowledgeRecovery(directory);
    assert.equal(recovered.records["kill-recovery"].content, "Recovery 中断前的正文");
    const leftovers = (await fs.readdir(directory)).filter((entry) => entry.includes("knowledge-note-recovery.json.tmp-"));
    assert.equal(leftovers.length, 1);
    await Promise.all(leftovers.map((entry) => fs.rm(path.join(directory, entry), { force: true })));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Recovery replacement failure preserves the previous record and cleans the temporary file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-recovery-replace-failure-"));
  const recoveryPath = recoveryFilePath(directory);
  const originalRename = fs.rename;
  try {
    await writeKnowledgeRecovery(directory, { noteId: "replace-failure", content: "旧 Recovery" });
    fs.rename = async (from, to) => {
      if (to === recoveryPath) throw Object.assign(new Error("Recovery replace failed"), { code: "EIO" });
      return originalRename(from, to);
    };
    await assert.rejects(
      writeKnowledgeRecovery(directory, { noteId: "replace-failure", content: "不应替换" }),
      (error) => error.code === "EIO",
    );
    fs.rename = originalRename;
    const recovered = await readKnowledgeRecovery(directory);
    assert.equal(recovered.records["replace-failure"].content, "旧 Recovery");
    assert.deepEqual(await fs.readdir(directory), ["knowledge-note-recovery.json"]);
  } finally {
    fs.rename = originalRename;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("renderer flushes pending knowledge recovery before shutdown", async () => {
  const recoveryWrites = [];
  const harness = await rendererHarness({
    knowledgeRecovery: {
      write: async (record) => { recoveryWrites.push(record); },
    },
  });
  harness.evaluate(`(() => {
    state.tasks = normalizeTasks([{
      id: "shutdown_recovery_task",
      title: "退出恢复",
      notes: "旧正文",
      nodes: []
    }]);
    state.knowledgeRecovery = { version: 1, records: {} };
    scheduleKnowledgeRecovery("shutdown_recovery_task", "退出前最新正文", { debounceMs: 1000, maxIntervalMs: 2000 });
  })()`);

  await harness.evaluate("flushPendingKnowledgeRecoveries()");

  assert.equal(recoveryWrites.length, 1);
  assert.equal(recoveryWrites[0].content, "退出前最新正文");
});

test("update installation preparation requires both task data and pending Recovery to persist", async () => {
  let taskWrites = 0;
  let recoveryWrites = 0;
  let failRecovery = true;
  const harness = await rendererHarness({
    storage: {
      write: async () => { taskWrites += 1; },
    },
    knowledgeRecovery: {
      write: async () => {
        recoveryWrites += 1;
        if (failRecovery) throw Object.assign(new Error("recovery disk full"), { code: "ENOSPC" });
      },
    },
  });
  harness.evaluate(`(() => {
    state.tasks = normalizeTasks([{
      id: "update_recovery_task",
      title: "升级前保存",
      notes: "当前正文",
      nodes: []
    }]);
    state.taskGroups = normalizeTaskGroups([], state.tasks);
    state.activeGroupId = state.taskGroups[0].id;
    state.knowledgeRecovery = { version: 1, records: {} };
    scheduleKnowledgeRecovery("update_recovery_task", "升级前最新正文", { debounceMs: 1000, maxIntervalMs: 2000 });
  })()`);

  assert.equal(await harness.evaluate("prepareForUpdateInstall()"), false);
  assert.equal(taskWrites, 1);
  assert.equal(recoveryWrites, 1);
  failRecovery = false;
  assert.equal(await harness.evaluate("prepareForUpdateInstall()"), true);
  assert.equal(recoveryWrites, 2);
});

test("task data and Recovery writes sync temporary files before replacement", async () => {
  const [storageSource, recoverySource] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "main", "storage.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "recovery.cjs"), "utf8"),
  ]);
  assert.match(storageSource, /handle\s*=\s*await fs\.open\(tempPath, ["']wx["']/);
  assert.match(storageSource, /await handle\.sync\(\)/);
  assert.match(recoverySource, /handle\s*=\s*await fs\.open\(tempPath, ["']wx["']/);
  assert.match(recoverySource, /await handle\.sync\(\)/);
});

test("renderer surfaces task-data persistence failures", async () => {
  const harness = await rendererHarness({
    storage: {
      write: async () => {
        throw new Error("disk full");
      },
    },
  });
  await harness.evaluate(`pendingPayload = { tasks: [] }; flushSave()`);
  assert.equal(harness.alerts.length, 1);
  assert.match(harness.alerts[0], /本地任务数据保存失败/);
  assert.equal(harness.evaluate("pendingPayload !== null"), true);
});

test("Markdown save keeps Recovery when task metadata persistence fails", async () => {
  let recoveryDeleteCalls = 0;
  const harness = await rendererHarness({
    storage: {
      write: async () => {
        throw new Error("metadata disk full");
      },
    },
    knowledgeRecovery: {
      delete: async () => {
        recoveryDeleteCalls += 1;
      },
    },
    knowledgeFile: {
      save: async () => ({
        success: true,
        filePath: "/tmp/ordered-save.md",
        content: "已保存正文",
        lastSavedHash: "ordered-hash",
        lastSavedMtime: 5,
        encoding: "UTF-8",
        lineEnding: "LF",
      }),
    },
  });
  harness.evaluate(`state.tasks = normalizeTasks([{
    id: "ordered_save_task",
    title: "保存顺序",
    notes: "待保存正文",
    nodes: [],
    knowledgeNote: { noteId: "ordered_save_task", taskId: "ordered_save_task", documentState: "DIRTY", dirty: true }
  }]); state.knowledgeRecovery.records.ordered_save_task = { noteId: "ordered_save_task", content: "Recovery 正文" }`);

  const result = await harness.evaluate(`saveKnowledgeTask("ordered_save_task")`);
  assert.equal(result.code, "TASK_DATA_SAVE_FAILED");
  assert.equal(result.markdownSaved, true);
  assert.equal(recoveryDeleteCalls, 0);
  assert.equal(harness.json(`state.knowledgeRecovery.records.ordered_save_task`).content, "Recovery 正文");
});

test("knowledge file save flow handles Markdown paths, cancel, Save As, and duplicates", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-file-"));
  const dialogCalls = [];
  const dialog = {
    async showSaveDialog(options) {
      dialogCalls.push(options);
      return { canceled: false, filePath: path.join(directory, "知识笔记-B.md") };
    },
  };
  try {
    assert.equal(knowledgeFile.defaultMarkdownFileName("CON"), "-CON.md");
    assert.equal(knowledgeFile.defaultMarkdownFileName("标题 / 😀"), "标题 - 😀.md");
    assert.equal(knowledgeFile.hasDuplicateBinding("C:\\Notes\\A.md", ["c:/notes/a.md"], "win32"), true);

    const canceled = await knowledgeFile.saveKnowledgeDocument(
      { title: "取消保存", content: "不会丢失" },
      { dialog: { showSaveDialog: async () => ({ canceled: true }) } },
    );
    assert.deepEqual(canceled, { canceled: true });

    const markdownContent = "# 标题\r\n\r\n**加粗** *斜体*\r\n- 列表\r\n1. 有序\r\n> 引用\r\n[链接](https://example.com)\r\n![图片](task-image:image_a)\r\n| 列 1 | 列 2 |\r\n| --- | --- |\r\n| 内容 | 内容 |\r\n```js\r\nconst value = 1;\r\n```\r\n- [ ] 待办\r\n中文 😀";
    const first = await knowledgeFile.saveKnowledgeDocument(
      { title: "CON", content: markdownContent },
      { dialog },
    );
    assert.equal(first.success, true);
    assert.equal(dialogCalls.length, 1);
    assert.equal(first.filePath.endsWith("知识笔记-B.md"), true);
    assert.equal(await fs.readFile(first.filePath, "utf8"), markdownContent.replace(/\r\n/g, "\n"));
    assert.equal(first.encoding, "UTF-8");
    assert.equal(first.lineEnding, "LF");
    assert.equal(first.atomic, true);
    assert.equal(first.replacement, "atomic-rename");

    const ordinary = await knowledgeFile.saveKnowledgeDocument({
      filePath: first.filePath,
      content: "更新后的内容",
    }, { dialog: { showSaveDialog: async () => { throw new Error("dialog should not open"); } } });
    assert.equal(ordinary.success, true);
    assert.equal(dialogCalls.length, 1);

    const staleWriter = await knowledgeFile.saveKnowledgeDocument({
      filePath: first.filePath,
      content: "不应覆盖外部更新",
      expectedLastSavedHash: "stale-hash",
    });
    assert.equal(staleWriter.success, false);
    assert.equal(staleWriter.code, "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION");
    assert.equal(await fs.readFile(first.filePath, "utf8"), "更新后的内容");

    const explicitOverwrite = await knowledgeFile.saveKnowledgeDocument({
      filePath: first.filePath,
      content: "用户确认覆盖后的内容",
      expectedLastSavedHash: "stale-hash",
      allowExternalOverwrite: true,
    });
    assert.equal(explicitOverwrite.success, true);
    assert.equal(explicitOverwrite.atomic, true);
    assert.equal(await fs.readFile(first.filePath, "utf8"), "用户确认覆盖后的内容");

    const saveAs = await knowledgeFile.saveKnowledgeDocument({
      filePath: first.filePath,
      saveAs: true,
      title: "另存为",
      content: "另一个文件",
    }, { dialog: { showSaveDialog: async () => ({ canceled: false, filePath: path.join(directory, "B") }) } });
    assert.equal(saveAs.success, true);
    assert.equal(saveAs.filePath.endsWith("B.md"), true);
    assert.equal(await fs.readFile(first.filePath, "utf8"), "用户确认覆盖后的内容");
    assert.equal(await fs.readFile(saveAs.filePath, "utf8"), "另一个文件");

    const duplicate = await knowledgeFile.saveKnowledgeDocument({
      filePath: first.filePath,
      content: "不应覆盖",
      boundPaths: [first.filePath],
    }, { dialog: { showSaveDialog: async () => { throw new Error("dialog should not open"); } } });
    assert.deepEqual(duplicate, {
      canceled: false,
      success: false,
      code: "DUPLICATE_BINDING",
      filePath: first.filePath,
    });
    assert.equal(await fs.readFile(first.filePath, "utf8"), "用户确认覆盖后的内容");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("knowledge assets stage safely, migrate beside each Markdown file, and reload relative images", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-assets-"));
  const userData = path.join(root, "user-data");
  const firstDirectory = path.join(root, "中文笔记");
  const secondDirectory = path.join(root, "另一个目录");
  const firstPath = path.join(firstDirectory, "知识.md");
  try {
    const pngA = `data:image/png;base64,${Buffer.from("png-a").toString("base64")}`;
    const pngB = `data:image/png;base64,${Buffer.from("png-b").toString("base64")}`;
    const staged = await knowledgeAssets.stageKnowledgeAssets(userData, {
      noteId: "note/with:unsafe-id",
      assets: [
        { source: "task-image:first", dataUrl: pngA },
        { source: "task-image:second", dataUrl: pngB },
      ],
    });
    assert.equal(staged.success, true);
    assert.equal(staged.assets.length, 2);
    assert.notEqual(staged.assets[0].fileName, staged.assets[1].fileName);
    assert.equal(await fs.readFile(staged.assets[0].filePath, "utf8"), "png-a");

    const content = "# 知识\n\n![第一张](task-image:first)\n![第二张](task-image:second)\n![外部](D:/Shared/image.png)\n![网络](https://example.com/image.png)";
    const first = await knowledgeFile.saveKnowledgeDocument({
      filePath: firstPath,
      content,
      assets: staged.assets,
    });
    assert.equal(first.success, true);
    assert.match(first.content, /\.\/attachments\/asset-[a-f0-9]{24}\.png/);
    assert.match(first.content, /D:\/Shared\/image\.png/);
    assert.match(first.content, /https:\/\/example\.com\/image\.png/);
    assert.equal(first.assetFiles.length, 2);
    assert.equal(await fs.readFile(path.join(firstDirectory, "attachments", first.assetFiles[0].fileName), "utf8"), "png-a");

    const loaded = await knowledgeFile.readKnowledgeDocument(firstPath);
    assert.equal(loaded.success, true);
    assert.equal(loaded.assetFiles.length, 2);
    assert.ok(loaded.assetFiles.every((asset) => asset.dataUrl.startsWith("data:image/png;base64,")));

    const secondPath = path.join(secondDirectory, "另存为.md");
    const saveAs = await knowledgeFile.saveKnowledgeDocument({
      filePath: secondPath,
      content,
      assets: staged.assets,
    });
    assert.equal(saveAs.success, true);
    assert.equal(saveAs.attachmentsDirectory, path.join(secondDirectory, "attachments"));
    assert.equal(await fs.readFile(path.join(secondDirectory, "attachments", saveAs.assetFiles[0].fileName), "utf8"), "png-a");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("DRAFT asset staging reports copy failure without inventing an asset record", async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-stage-failure-"));
  try {
    const result = await knowledgeAssets.stageKnowledgeAssets(userData, {
      noteId: "stage-failure",
      assets: [{ source: "task-image:failed", dataUrl: "data:image/png;base64,ZmFpbGVk" }],
      fsOps: {
        open: async () => { throw Object.assign(new Error("asset disk full"), { code: "ENOSPC" }); },
      },
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "ASSET_STAGE_FAILED");
    assert.equal(result.errorCode, "ENOSPC");
    assert.equal(result.assets, undefined);
    const files = await fs.readdir(result.recoveryDirectory);
    assert.deepEqual(files, []);
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
});

test("asset migration rolls back newly created attachments after a later asset failure", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-asset-rollback-"));
  const filePath = path.join(directory, "note.md");
  let openCount = 0;
  try {
    const result = await knowledgeFile.saveKnowledgeDocument({
      filePath,
      content: "![一](task-image:one)\n![二](task-image:two)",
      assets: [
        { source: "task-image:one", dataUrl: "data:image/png;base64,b25l" },
        { source: "task-image:two", dataUrl: "data:image/png;base64,dHdv" },
      ],
    }, {
      fsOps: {
        open: async (...args) => {
          openCount += 1;
          if (openCount === 2) throw Object.assign(new Error("attachment disk full"), { code: "ENOSPC" });
          return fs.open(...args);
        },
      },
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "ASSET_MIGRATION_FAILED");
    assert.equal(openCount, 2);
    assert.deepEqual(await fs.readdir(path.join(directory, "attachments")), []);
    await assert.rejects(fs.access(filePath));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("asset migration failure leaves Markdown and recovery assets intact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-assets-failure-"));
  const userData = path.join(root, "user-data");
  const filePath = path.join(root, "note.md");
  await fs.writeFile(filePath, "原始 Markdown", "utf8");
  try {
    const dataUrl = `data:image/png;base64,${Buffer.from("recover-me").toString("base64")}`;
    const staged = await knowledgeAssets.stageKnowledgeAssets(userData, {
      noteId: "note-failure",
      assets: [{ source: "task-image:failure", dataUrl }],
    });
    const failed = await knowledgeFile.saveKnowledgeDocument(
      { filePath, content: "不应覆盖\n![图片](task-image:failure)", assets: staged.assets },
      { fsOps: { open: async () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); } } },
    );
    assert.equal(failed.success, false);
    assert.equal(failed.code, "ASSET_MIGRATION_FAILED");
    assert.equal(await fs.readFile(filePath, "utf8"), "原始 Markdown");
    assert.equal(await fs.readFile(staged.assets[0].filePath, "utf8"), "recover-me");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Task9 acceptance preserves rich Markdown, large documents, multiple assets, and Save As", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-acceptance-"));
  const firstDirectory = path.join(root, "中文知识目录");
  const firstPath = path.join(firstDirectory, "原始标题.md");
  const secondPath = path.join(root, "另存为", "新标题.md");
  const assets = [
    { source: "task-image:first", dataUrl: `data:image/png;base64,${Buffer.from("first-image").toString("base64")}` },
    { source: "task-image:second", dataUrl: `data:image/png;base64,${Buffer.from("second-image").toString("base64")}` },
    { source: "task-image:third", dataUrl: `data:image/jpeg;base64,${Buffer.from("third-image").toString("base64")}` },
  ];
  const content = [
    "# 中文知识 😀",
    "",
    "| 字段 | 值 |",
    "| --- | --- |",
    "| 语言 | 中文 |",
    "",
    "```js",
    "const checked = true;",
    "```",
    "",
    "- [ ] 待办项",
    "- [x] 已完成项",
    "",
    "![第一张](task-image:first)",
    "![第二张](task-image:second)",
    "![第三张](task-image:third)",
    "",
    "网络链接 https://example.com/😀",
    "长文档正文",
    "长文档正文\n".repeat(12000),
  ].join("\n");

  try {
    const startedAt = Date.now();
    const first = await knowledgeFile.saveKnowledgeDocument({
      filePath: firstPath,
      title: "原始标题",
      content,
      assets,
    });
    assert.equal(first.success, true);
    assert.equal(first.lineEnding, "LF");
    assert.equal(first.encoding, "UTF-8");
    assert.ok(Date.now() - startedAt < 5000, "large Markdown save should remain responsive");
    assert.equal(first.assetFiles.length, 3);
    assert.equal(new Set(first.assetFiles.map((asset) => asset.fileName)).size, 3);
    assert.match(first.content, /\| 字段 \| 值 \|/);
    assert.match(first.content, /```js[\s\S]*const checked = true;/);
    assert.match(first.content, /- \[x\] 已完成项/);
    assert.match(first.content, /长文档正文/);
    assert.equal(await fs.readFile(firstPath, "utf8"), first.content);

    const reopened = await knowledgeFile.readKnowledgeDocument(firstPath);
    assert.equal(reopened.success, true);
    assert.equal(reopened.content, first.content);
    assert.equal(reopened.assetFiles.length, 3);
    assert.ok(reopened.assetFiles.every((asset) => asset.dataUrl.startsWith("data:image/")));

    const renamedTitle = await knowledgeFile.saveKnowledgeDocument({
      filePath: firstPath,
      title: "标题已修改但路径不变",
      content: first.content,
    });
    assert.equal(renamedTitle.success, true);
    assert.equal(renamedTitle.filePath, firstPath);

    const saveAs = await knowledgeFile.saveKnowledgeDocument({
      filePath: firstPath,
      saveAs: true,
      title: "新标题",
      content,
      assets,
    }, {
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: secondPath }) },
    });
    assert.equal(saveAs.success, true);
    assert.equal(saveAs.filePath, secondPath);
    assert.equal(await fs.readFile(firstPath, "utf8"), first.content);
    assert.equal(await fs.readFile(secondPath, "utf8"), saveAs.content);
    assert.equal((await fs.readdir(path.join(path.dirname(secondPath), "attachments"))).length, 3);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Task9 acceptance keeps recovery content when a dirty bound file also changes externally", async () => {
  let changeListener = null;
  const recoveryWrites = [];
  const harness = await rendererHarness({
    platform: "darwin",
    knowledgeRecovery: {
      write: async (record) => { recoveryWrites.push(record); },
      delete: async () => true,
    },
    knowledgeFile: {
      onChange: (callback) => {
        changeListener = callback;
        return () => { changeListener = null; };
      },
      watch: async () => ({ success: true }),
      save: async () => ({ success: true }),
    },
  });
  harness.evaluate(`render = () => {}; state.tasks = normalizeTasks([{
    id: "combined_conflict_task",
    title: "Recovery 与外部冲突",
    notes: "本地未保存正文",
    nodes: [],
    knowledgeNote: {
      noteId: "combined_conflict_task",
      taskId: "combined_conflict_task",
      filePath: "/tmp/combined-conflict.md",
      documentState: "DIRTY",
      dirty: true,
      lastSavedHash: "base-hash",
      lastSavedMtime: 1
    }
  }])`);

  harness.evaluate(`scheduleKnowledgeRecovery("combined_conflict_task", "Recovery 本地正文", { debounceMs: 10, maxIntervalMs: 100 })`);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(recoveryWrites.at(-1)?.content, "Recovery 本地正文");

  changeListener({
    type: "external-changed",
    success: true,
    noteId: "combined_conflict_task",
    filePath: "/tmp/combined-conflict.md",
    content: "外部文件正文",
    lastSavedHash: "external-hash",
    lastSavedMtime: 2,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.json(`state.tasks[0].notes`), "本地未保存正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "EXTERNAL_CHANGED");
  assert.equal(recoveryWrites.at(-1)?.content, "Recovery 本地正文");
  const blocked = await harness.evaluate(`saveKnowledgeTask("combined_conflict_task")`);
  assert.equal(blocked.code, "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION");
});

test("Task9 acceptance reports unavailable reads without inventing a document", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-read-failure-"));
  try {
    const missing = await knowledgeFile.readKnowledgeDocument(path.join(directory, "removed.md"));
    assert.equal(missing.success, false);
    assert.equal(missing.code, "FILE_READ_FAILED");
    assert.equal(missing.errorCode, "ENOENT");

    const unavailable = await knowledgeFile.readKnowledgeDocument(path.join(directory, "unavailable.md"), {
      fsOps: {
        readFile: async () => { throw Object.assign(new Error("volume unavailable"), { code: "EIO" }); },
      },
    });
    assert.equal(unavailable.success, false);
    assert.equal(unavailable.errorCode, "EIO");
    assert.equal(unavailable.message, "磁盘 I/O 操作失败");
    assert.deepEqual(await fs.readdir(directory), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("knowledge reads report missing Markdown attachments without hiding the document", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-missing-asset-"));
  const filePath = path.join(directory, "note.md");
  await fs.writeFile(filePath, "正文\n\n![缺失图片](./attachments/missing.png)\n", "utf8");
  try {
    const result = await knowledgeFile.readKnowledgeDocument(filePath);
    assert.equal(result.success, true);
    assert.equal(result.content.includes("missing.png"), true);
    assert.equal(result.assetFiles.length, 0);
    assert.equal(result.missingAssetFiles.length, 1);
    assert.equal(result.missingAssetFiles[0].relativePath, "./attachments/missing.png");
    assert.equal(result.missingAssetFiles[0].errorCode, "ENOENT");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("knowledge file atomic failures preserve the original and clean temporary files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-atomic-"));
  const filePath = path.join(directory, "note.md");
  await fs.writeFile(filePath, "原始内容", "utf8");
  try {
    const writeFailure = new Error("disk full");
    writeFailure.code = "ENOSPC";
    const failedWrite = await knowledgeFile.saveKnowledgeDocument(
      { filePath, content: "不应写入" },
      { fsOps: { open: async () => { throw writeFailure; } } },
    );
    assert.equal(failedWrite.success, false);
    assert.equal(failedWrite.code, "SAVE_FAILED");
    assert.equal(failedWrite.errorCode, "ENOSPC");
    assert.equal(failedWrite.message, "磁盘空间不足");
    assert.equal(await fs.readFile(filePath, "utf8"), "原始内容");

    const directoryFailure = new Error("directory unavailable");
    directoryFailure.code = "ENOENT";
    const failedDirectory = await knowledgeFile.saveKnowledgeDocument(
      { filePath, content: "目录不可用" },
      { fsOps: { mkdir: async () => { throw directoryFailure; } } },
    );
    assert.equal(failedDirectory.success, false);
    assert.equal(failedDirectory.errorCode, "ENOENT");
    assert.equal(failedDirectory.message, "文件或目录不可用");
    assert.equal(await fs.readFile(filePath, "utf8"), "原始内容");

    const readOnlyFailure = new Error("read only");
    readOnlyFailure.code = "EROFS";
    const failedReadOnly = await knowledgeFile.saveKnowledgeDocument(
      { filePath, content: "只读文件" },
      { fsOps: { open: async () => { throw readOnlyFailure; } } },
    );
    assert.equal(failedReadOnly.success, false);
    assert.equal(failedReadOnly.errorCode, "EROFS");
    assert.equal(failedReadOnly.message, "文件或目录不可写");
    assert.equal(await fs.readFile(filePath, "utf8"), "原始内容");

    const replaceFailure = new Error("replace failed");
    replaceFailure.code = "EIO";
    const failedReplace = await knowledgeFile.saveKnowledgeDocument(
      { filePath, content: "仍不应写入" },
      { fsOps: { rename: async () => { throw replaceFailure; } } },
    );
    assert.equal(failedReplace.success, false);
    assert.equal(failedReplace.errorCode, "EIO");
    assert.equal(failedReplace.message, "磁盘 I/O 操作失败");
    assert.equal(await fs.readFile(filePath, "utf8"), "原始内容");

    const entries = await fs.readdir(directory);
    assert.deepEqual(entries, ["note.md"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("atomic write cleans temporary files after partial write and sync failures", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-atomic-partial-"));
  const filePath = path.join(directory, "note.md");
  try {
    for (const failureStage of ["write", "sync"]) {
      await fs.writeFile(filePath, `原始内容-${failureStage}`, "utf8");
      const failure = Object.assign(new Error(`${failureStage} failed`), { code: failureStage === "write" ? "ENOSPC" : "EIO" });
      const fsOps = {
        open: async (...args) => {
          const handle = await fs.open(...args);
          const writeFile = handle.writeFile.bind(handle);
          if (failureStage === "write") {
            handle.writeFile = async () => {
              await writeFile("半写入内容", "utf8");
              throw failure;
            };
          } else {
            handle.sync = async () => { throw failure; };
          }
          return handle;
        },
      };
      const result = await knowledgeFile.saveKnowledgeDocument(
        { filePath, content: "不应成为正式正文" },
        { fsOps },
      );
      assert.equal(result.success, false);
      assert.equal(result.errorCode, failure.code);
      assert.equal(await fs.readFile(filePath, "utf8"), `原始内容-${failureStage}`);
      assert.deepEqual(await fs.readdir(directory), ["note.md"]);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("forced process termination during atomic write preserves the original Markdown", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-kill-"));
  const filePath = path.join(directory, "note.md");
  await fs.writeFile(filePath, "进程中断前的正文", "utf8");
  try {
    for (const killPoint of ["after-write", "after-sync"]) {
      await fs.writeFile(filePath, `进程中断前的正文-${killPoint}`, "utf8");
      const child = await runKilledSaveChild(filePath, killPoint);
      assertForceTerminated(child);
      assert.equal(await fs.readFile(filePath, "utf8"), `进程中断前的正文-${killPoint}`);
      const leftovers = (await fs.readdir(directory)).filter((entry) => entry.includes(".note.md.tmp-"));
      assert.equal(leftovers.length, 1);
      await Promise.all(leftovers.map((entry) => fs.rm(path.join(directory, entry), { force: true })));
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Save As failure preserves the source file and does not create a partial destination", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-save-as-failure-"));
  const sourcePath = path.join(directory, "source.md");
  const destinationPath = path.join(directory, "destination.md");
  await fs.writeFile(sourcePath, "原始源文件", "utf8");
  const failure = Object.assign(new Error("destination disk full"), { code: "ENOSPC" });
  try {
    const result = await knowledgeFile.saveKnowledgeDocument({
      filePath: sourcePath,
      saveAs: true,
      content: "另存为的新正文",
    }, {
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destinationPath }) },
      fsOps: { open: async () => { throw failure; } },
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "ENOSPC");
    assert.equal(await fs.readFile(sourcePath, "utf8"), "原始源文件");
    await assert.rejects(fs.access(destinationPath));
    assert.deepEqual(await fs.readdir(directory), ["source.md"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("knowledge file saves serialize operations for the same path", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-queue-"));
  const filePath = path.join(directory, "note.md");
  let activeHandles = 0;
  let maximumActiveHandles = 0;
  const fsOps = {
    open: async (...args) => {
      const handle = await fs.open(...args);
      activeHandles += 1;
      maximumActiveHandles = Math.max(maximumActiveHandles, activeHandles);
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        const result = await close();
        activeHandles -= 1;
        return result;
      };
      return handle;
    },
  };
  try {
    const [first, second] = await Promise.all([
      knowledgeFile.saveKnowledgeDocument({ filePath, content: "第一次" }, { fsOps }),
      knowledgeFile.saveKnowledgeDocument({ filePath, content: "第二次" }, { fsOps }),
    ]);
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(maximumActiveHandles, 1);
    assert.equal(await fs.readFile(filePath, "utf8"), "第二次");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a failed save does not poison the next operation in the save queue", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-queue-retry-"));
  const filePath = path.join(directory, "note.md");
  let openCalls = 0;
  try {
    const fsOps = {
      open: async (...args) => {
        openCalls += 1;
        if (openCalls === 1) throw Object.assign(new Error("first write failed"), { code: "EIO" });
        return fs.open(...args);
      },
    };
    const [failed, succeeded] = await Promise.all([
      knowledgeFile.saveKnowledgeDocument({ filePath, content: "第一次失败" }, { fsOps }),
      knowledgeFile.saveKnowledgeDocument({ filePath, content: "第二次成功" }, { fsOps }),
    ]);
    assert.equal(failed.success, false);
    assert.equal(failed.errorCode, "EIO");
    assert.equal(succeeded.success, true);
    assert.equal(await fs.readFile(filePath, "utf8"), "第二次成功");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Windows replacement fallback keeps a rollback path for existing targets", async () => {
  const tempPath = "C:/Notes/.note.md.tmp-test";
  const targetPath = "C:/Notes/note.md";
  const calls = [];
  let firstReplaceAttempt = true;
  const replacement = await knowledgeFile.replaceFile(tempPath, targetPath, {
    platform: "win32",
    fsOps: {
      rename: async (from, to) => {
        calls.push([from, to]);
        if (from === tempPath && to === targetPath && firstReplaceAttempt) {
          firstReplaceAttempt = false;
          const error = new Error("target exists");
          error.code = "EEXIST";
          throw error;
        }
      },
      rm: async () => {},
    },
  });
  assert.equal(replacement, "windows-backup-replace");
  assert.deepEqual(calls.slice(0, 3), [
    [tempPath, targetPath],
    [targetPath, calls[1][1]],
    [tempPath, targetPath],
  ]);
});

test("knowledge reads recover an interrupted Windows replacement backup", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-windows-recovery-"));
  const filePath = path.join(directory, "note.md");
  const backupPath = `${filePath}.bak-crashed-replacement`;
  try {
    await fs.writeFile(backupPath, "原始正文", "utf8");
    const restored = await knowledgeFile.readKnowledgeDocument(filePath);
    assert.equal(restored.success, true);
    assert.equal(restored.content, "原始正文");
    assert.equal(await fs.readFile(filePath, "utf8"), "原始正文");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("renderer keeps dirty metadata and content after a save failure", async () => {
  const harness = await rendererHarness({
    knowledgeFile: {
      save: async () => ({
        canceled: false,
        success: false,
        code: "SAVE_FAILED",
        errorCode: "EACCES",
        message: "文件或目录不可写",
      }),
    },
  });
  harness.evaluate(`state.tasks = normalizeTasks([{
    id: "failed_save_task",
    title: "失败保存",
    notes: "必须保留",
    nodes: [],
    knowledgeNote: {
      filePath: "/tmp/failed-save.md",
      documentState: "DIRTY",
      dirty: true,
      lastSavedHash: "old-hash"
    }
  }])`);

  const result = await harness.evaluate(`saveKnowledgeTask("failed_save_task")`);
  assert.equal(result.success, false);
  assert.equal(harness.json(`state.tasks[0].notes`), "必须保留");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "DIRTY");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.dirty`), true);
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.lastSavedHash`), "old-hash");
});

test("knowledge file watcher debounces changes and suppresses matching self-writes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-watcher-"));
  const filePath = path.join(directory, "note.md");
  await fs.writeFile(filePath, "初始内容", "utf8");
  const callbacks = [];
  const events = [];
  const watcher = createKnowledgeFileWatcher({
    debounceMs: 35,
    fsApi: {
      watch: (_file, _options, callback) => {
        callbacks.push(callback);
        return { close() {} };
      },
    },
    onChange: (event) => events.push(event),
  });
  try {
    const baseline = await knowledgeFile.readKnowledgeDocument(filePath);
    assert.equal(watcher.watch({ noteId: "watch_note", ...baseline }).success, true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    events.length = 0;

    await fs.writeFile(filePath, "外部修改", "utf8");
    callbacks[0]();
    callbacks[0]();
    callbacks[0]();
    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(events.filter((event) => event.type === "external-changed").length, 1);
    assert.equal(events[0].content, "外部修改");

    const saved = await knowledgeFile.saveKnowledgeDocument({ filePath, content: "应用保存" });
    assert.equal(saved.success, true);
    watcher.updateBaseline("watch_note", saved);
    events.length = 0;
    callbacks[0]();
    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(events.some((event) => event.type === "external-changed"), false);
  } finally {
    watcher.closeAll();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("knowledge file watcher reports deletion, unavailable paths, and read-only files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-knowledge-watcher-state-"));
  const filePath = path.join(directory, "note.md");
  await fs.writeFile(filePath, "内容", "utf8");
  const callbacks = [];
  const events = [];
  const watcher = createKnowledgeFileWatcher({
    debounceMs: 10,
    fsApi: {
      watch: (_file, _options, callback) => {
        callbacks.push(callback);
        return { close() {} };
      },
    },
    onChange: (event) => events.push(event),
  });
  try {
    const baseline = await knowledgeFile.readKnowledgeDocument(filePath);
    watcher.watch({ noteId: "missing_note", ...baseline });
    await waitForCondition(() => events.length > 0);
    events.length = 0;
    await fs.rename(filePath, path.join(directory, "moved-note.md"));
    callbacks[0]();
    callbacks[0]();
    callbacks[0]();
    await waitForCondition(() => events.some((event) => event.type === "file-missing"));
    assert.equal(events.at(-1).type, "file-missing");
    assert.equal(events.filter((event) => event.type === "file-missing").length, 1);

    const readOnlyWatcher = createKnowledgeFileWatcher({
      debounceMs: 0,
      fsApi: {
        watch: (_file, _options, callback) => {
          callbacks.push(callback);
          return { close() {} };
        },
      },
      fileReader: async (target) => ({
        ...(await knowledgeFile.readKnowledgeDocument(target)),
        readOnly: true,
      }),
      onChange: (event) => events.push(event),
    });
    await fs.writeFile(filePath, "恢复内容", "utf8");
    const readOnlyBaseline = await knowledgeFile.readKnowledgeDocument(filePath);
    readOnlyWatcher.watch({ noteId: "readonly_note", ...readOnlyBaseline });
    await waitForCondition(() => events.at(-1)?.type === "read-only");
    assert.equal(events.at(-1).type, "read-only");
    readOnlyWatcher.closeAll();
  } finally {
    watcher.closeAll();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("knowledge file watcher contains read and watcher errors as unavailable events", async () => {
  const events = [];
  let watcherError = null;
  const watcher = createKnowledgeFileWatcher({
    debounceMs: 0,
    fsApi: {
      watch: () => ({
        on: (event, callback) => {
          if (event === "error") watcherError = callback;
        },
        close() {},
      }),
    },
    fileReader: async () => {
      throw Object.assign(new Error("volume unavailable"), { code: "EIO" });
    },
    onChange: (event) => events.push(event),
  });
  watcher.watch({ noteId: "error_note", filePath: "/volume/note.md" });
  await waitForCondition(() => events.length > 0);
  assert.equal(events[0]?.type, "file-unavailable");
  assert.equal(events[0]?.errorCode, "EIO");
  assert.equal(typeof watcherError, "function");

  watcherError(Object.assign(new Error("watch failed"), { code: "EIO" }));
  assert.equal(events.at(-1)?.type, "file-unavailable");
  assert.equal(events.at(-1)?.errorCode, "EIO");
  watcher.closeAll();

  const timeoutEvents = [];
  const timeoutWatcher = createKnowledgeFileWatcher({
    debounceMs: 0,
    readTimeoutMs: 5,
    fsApi: { watch: () => ({ close() {} }) },
    fileReader: () => new Promise(() => {}),
    onChange: (event) => timeoutEvents.push(event),
  });
  timeoutWatcher.watch({ noteId: "timeout_note", filePath: "/network/note.md" });
  await waitForCondition(() => timeoutEvents.length > 0);
  assert.equal(timeoutEvents[0]?.type, "file-unavailable");
  assert.equal(timeoutEvents[0]?.errorCode, "ETIMEDOUT");
  timeoutWatcher.closeAll();
});

test("FileWatcher classifies startup failures and releases failed entries", () => {
  const events = [];
  const watcher = createKnowledgeFileWatcher({
    fsApi: {
      watch: () => { throw Object.assign(new Error("watch path missing"), { code: "ENOENT" }); },
    },
    onChange: (event) => events.push(event),
  });
  const result = watcher.watch({ noteId: "startup-missing", filePath: "/missing/note.md" });
  assert.deepEqual(result, {
    success: false,
    code: "FILE_MISSING",
    errorCode: "ENOENT",
  });
  assert.equal(watcher.size, 0);
  assert.deepEqual(events[0], {
    type: "file-missing",
    noteId: "startup-missing",
    filePath: "/missing/note.md",
    errorCode: "ENOENT",
    message: "watch path missing",
  });

  const unavailableEvents = [];
  const unavailableWatcher = createKnowledgeFileWatcher({
    fsApi: {
      watch: () => { throw Object.assign(new Error("volume unavailable"), { code: "EIO" }); },
    },
    onChange: (event) => unavailableEvents.push(event),
  });
  const unavailable = unavailableWatcher.watch({ noteId: "startup-unavailable", filePath: "/volume/note.md" });
  assert.deepEqual(unavailable, {
    success: false,
    code: "WATCH_FAILED",
    errorCode: "EIO",
  });
  assert.equal(unavailableWatcher.size, 0);
  assert.equal(unavailableEvents[0].type, "file-unavailable");
  assert.equal(unavailableEvents[0].errorCode, "EIO");
  unavailableWatcher.closeAll();
});

test("renderer reloads saved external changes and blocks silent overwrite while dirty", async () => {
  let changeListener = null;
  let saveCalls = 0;
  let lastSavePayload = null;
  const harness = await rendererHarness({
    knowledgeFile: {
      onChange: (callback) => {
        changeListener = callback;
        return () => { changeListener = null; };
      },
      watch: async () => ({ success: true }),
      read: async () => ({ success: true, content: "外部正文", filePath: "/tmp/external.md", lastSavedHash: "hash_b", lastSavedMtime: 2, encoding: "UTF-8", lineEnding: "LF" }),
      save: async (payload) => {
        saveCalls += 1;
        lastSavePayload = payload;
        return { success: true, filePath: "/tmp/external.md", lastSavedHash: "hash_c", lastSavedMtime: 3, encoding: "UTF-8", lineEnding: "LF" };
      },
    },
  });
  harness.evaluate(`render = () => {}`);
  harness.evaluate(`state.tasks = normalizeTasks([{
    id: "external_task",
    title: "外部修改",
    notes: "原始正文",
    nodes: [],
    knowledgeNote: {
      noteId: "external_task",
      taskId: "external_task",
      filePath: "/tmp/external.md",
      documentState: "SAVED",
      dirty: false,
      lastSavedHash: "hash_a",
      lastSavedMtime: 1
    }
  }])`);

  changeListener({
    type: "external-changed",
    success: true,
    noteId: "external_task",
    filePath: "/tmp/external.md",
    content: "外部正文",
    lastSavedHash: "hash_b",
    lastSavedMtime: 2,
    encoding: "UTF-8",
    lineEnding: "LF",
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.json(`state.tasks[0].notes`), "外部正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "SAVED");

  harness.evaluate(`state.tasks[0].notes = "本地修改"; state.tasks[0].knowledgeNote = knowledgeDocument.markDocumentEdited(state.tasks[0].knowledgeNote)`);
  changeListener({
    type: "external-changed",
    success: true,
    noteId: "external_task",
    filePath: "/tmp/external.md",
    content: "再次外部修改",
    lastSavedHash: "hash_d",
    lastSavedMtime: 4,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.json(`state.tasks[0].notes`), "本地修改");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "EXTERNAL_CHANGED");
  const blocked = await harness.evaluate(`saveKnowledgeTask("external_task")`);
  assert.equal(blocked.code, "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION");
  assert.equal(saveCalls, 0);
  const overwritten = await harness.evaluate(`saveKnowledgeTask("external_task", { allowExternalOverwrite: true })`);
  assert.equal(overwritten.success, true);
  assert.equal(saveCalls, 1);
  assert.equal(lastSavePayload.content, "本地修改");
  assert.equal(lastSavePayload.allowExternalOverwrite, true);
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "SAVED");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.lastSavedHash`), "hash_c");
  assert.equal(harness.evaluate(`knowledgeExternalSnapshots.has("external_task")`), false);
});

test("Bug 25 reload reads the current Markdown file and commits its new baseline", async () => {
  let readCalls = 0;
  const recoveryDeletes = [];
  const watcherCalls = [];
  const storageWrites = [];
  const harness = await rendererHarness({
    storage: { write: async (payload) => { storageWrites.push(payload); } },
    knowledgeRecovery: { delete: async (noteId) => { recoveryDeletes.push(noteId); return true; } },
    knowledgeFile: {
      read: async () => {
        readCalls += 1;
        return {
          success: true,
          content: "磁盘上的最新正文",
          filePath: "/tmp/bug-25.md",
          lastSavedHash: "fresh-disk-hash",
          lastSavedMtime: 25,
          encoding: "UTF-8",
          lineEnding: "LF",
        };
      },
      watch: async (payload) => { watcherCalls.push(payload); return { success: true }; },
    },
  });
  harness.evaluate(`(() => {
    render = () => {};
    state.tasks = normalizeTasks([{
      id: "bug_25_reload", title: "重新加载语义", notes: "编辑器中的未保存正文", nodes: [],
      knowledgeNote: {
        noteId: "bug_25_reload", taskId: "bug_25_reload", filePath: "/tmp/bug-25.md",
        documentState: "EXTERNAL_CHANGED", dirty: true,
        lastSavedHash: "old-baseline", lastSavedMtime: 10
      }
    }]);
    state.knowledgeRecovery.records.bug_25_reload = {
      noteId: "bug_25_reload", content: "Recovery 正文", updatedAt: "2026-08-24T00:00:00.000Z"
    };
    knowledgeExternalSnapshots.set("bug_25_reload", {
      success: true, content: "监听器中的旧快照", lastSavedHash: "stale-watcher-hash", lastSavedMtime: 20
    });
  })()`);

  const result = await harness.evaluate(`reloadKnowledgeTask("bug_25_reload")`);

  assert.equal(result.success, true);
  assert.equal(readCalls, 1);
  assert.equal(harness.json(`state.tasks[0].notes`), "磁盘上的最新正文");
  assert.deepEqual(harness.json(`({
    state: state.tasks[0].knowledgeNote.documentState,
    dirty: state.tasks[0].knowledgeNote.dirty,
    hash: state.tasks[0].knowledgeNote.lastSavedHash,
    mtime: state.tasks[0].knowledgeNote.lastSavedMtime
  })`), { state: "SAVED", dirty: false, hash: "fresh-disk-hash", mtime: 25 });
  assert.equal(storageWrites.at(-1).tasks[0].notes, "磁盘上的最新正文");
  assert.equal(watcherCalls.at(-1).lastSavedHash, "fresh-disk-hash");
  assert.deepEqual(recoveryDeletes, ["bug_25_reload"]);
  assert.equal(harness.evaluate(`knowledgeExternalSnapshots.has("bug_25_reload")`), false);
  assert.equal(harness.evaluate(`Boolean(state.knowledgeRecovery.records.bug_25_reload)`), false);
});

test("Bug 25 reload failure preserves editor content, conflict evidence, and Recovery", async () => {
  let recoveryDeletes = 0;
  const harness = await rendererHarness({
    knowledgeRecovery: { delete: async () => { recoveryDeletes += 1; return true; } },
    knowledgeFile: {
      read: async () => ({ success: false, code: "FILE_READ_FAILED", errorCode: "EIO", message: "磁盘暂时不可用" }),
    },
  });
  harness.evaluate(`(() => {
    render = () => {};
    state.tasks = normalizeTasks([{
      id: "bug_25_reload_failed", title: "失败不能丢数据", notes: "必须保留的编辑器正文", nodes: [],
      knowledgeNote: {
        noteId: "bug_25_reload_failed", taskId: "bug_25_reload_failed", filePath: "/tmp/bug-25-failed.md",
        documentState: "EXTERNAL_CHANGED", dirty: true,
        lastSavedHash: "old-baseline", lastSavedMtime: 10
      }
    }]);
    state.knowledgeRecovery.records.bug_25_reload_failed = {
      noteId: "bug_25_reload_failed", content: "必须保留的 Recovery", updatedAt: "2026-08-24T00:00:00.000Z"
    };
    knowledgeExternalSnapshots.set("bug_25_reload_failed", { success: true, content: "冲突证据" });
  })()`);

  const result = await harness.evaluate(`reloadKnowledgeTask("bug_25_reload_failed")`);

  assert.equal(result.success, false);
  assert.equal(harness.json(`state.tasks[0].notes`), "必须保留的编辑器正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "EXTERNAL_CHANGED");
  assert.equal(harness.evaluate(`knowledgeExternalSnapshots.has("bug_25_reload_failed")`), true);
  assert.equal(harness.json(`state.knowledgeRecovery.records.bug_25_reload_failed.content`), "必须保留的 Recovery");
  assert.equal(recoveryDeletes, 0);
});

test("Bug 25 reload rolls back when its new DocumentSession cannot persist", async () => {
  let storageWrites = 0;
  let recoveryDeletes = 0;
  const harness = await rendererHarness({
    storage: {
      write: async () => {
        storageWrites += 1;
        if (storageWrites === 1) throw new Error("metadata disk full");
      },
    },
    knowledgeRecovery: { delete: async () => { recoveryDeletes += 1; return true; } },
    knowledgeFile: {
      read: async () => ({
        success: true,
        content: "读取成功但不能提交的磁盘正文",
        filePath: "/tmp/bug-25-reload-persist.md",
        lastSavedHash: "new-disk-hash",
        lastSavedMtime: 25,
      }),
      watch: async () => ({ success: true }),
    },
  });
  harness.evaluate(`(() => {
    render = () => {};
    state.tasks = normalizeTasks([{
      id: "bug_25_reload_persist", title: "重新加载提交失败", notes: "原编辑器正文", nodes: [],
      knowledgeNote: {
        noteId: "bug_25_reload_persist", taskId: "bug_25_reload_persist", filePath: "/tmp/bug-25-reload-persist.md",
        documentState: "EXTERNAL_CHANGED", dirty: true,
        lastSavedHash: "old-baseline", lastSavedMtime: 10
      }
    }]);
    state.knowledgeRecovery.records.bug_25_reload_persist = {
      noteId: "bug_25_reload_persist", content: "原 Recovery", updatedAt: "2026-08-24T00:00:00.000Z"
    };
    knowledgeExternalSnapshots.set("bug_25_reload_persist", { success: true, content: "冲突证据" });
  })()`);

  const result = await harness.evaluate(`reloadKnowledgeTask("bug_25_reload_persist")`);

  assert.equal(result.code, "TASK_DATA_SAVE_FAILED");
  assert.equal(harness.json(`state.tasks[0].notes`), "原编辑器正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "EXTERNAL_CHANGED");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.lastSavedHash`), "old-baseline");
  assert.equal(harness.json(`state.knowledgeRecovery.records.bug_25_reload_persist.content`), "原 Recovery");
  assert.equal(harness.evaluate(`knowledgeExternalSnapshots.has("bug_25_reload_persist")`), true);
  assert.equal(recoveryDeletes, 0);
  assert.equal(await harness.evaluate(`flushSave()`), true);
});

test("knowledge rerenders preserve only the editor host and invalidate stale disk-backed drafts", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");

  assert.match(app, /function stashKnowledgePane\(\)[\s\S]*querySelector\("\.milkdown-editor-host\[data-task-id\]"\)[\s\S]*host\.remove\(\)/);
  assert.match(app, /function restoreCachedKnowledgePane\(task\)[\s\S]*const host = replacement\.querySelector\("\.milkdown-editor-host\[data-task-id\]"\)[\s\S]*host\.replaceWith\(cachedKnowledgePane\.host\)/);
  assert.match(app, /function discardMountedKnowledgeEditor\(taskId\)/);
  assert.match(app, /discardMountedKnowledgeEditor\(task\.id\);/);
  assert.doesNotMatch(app, /replacement\.replaceWith\(cachedKnowledgePane\.pane\)/);
});

test("Bug 25 overwrite write failure leaves the conflict transaction untouched", async () => {
  let recoveryDeletes = 0;
  const harness = await rendererHarness({
    knowledgeRecovery: { delete: async () => { recoveryDeletes += 1; return true; } },
    knowledgeFile: {
      save: async () => ({ success: false, code: "WRITE_FAILED", message: "原子替换失败" }),
    },
  });
  harness.evaluate(`(() => {
    render = () => {};
    state.tasks = normalizeTasks([{
      id: "bug_25_overwrite_write", title: "覆盖写入失败", notes: "不能丢失的编辑器正文", nodes: [],
      knowledgeNote: {
        noteId: "bug_25_overwrite_write", taskId: "bug_25_overwrite_write", filePath: "/tmp/bug-25-write.md",
        documentState: "EXTERNAL_CHANGED", dirty: true,
        lastSavedHash: "old-baseline", lastSavedMtime: 10
      }
    }]);
    state.knowledgeRecovery.records.bug_25_overwrite_write = {
      noteId: "bug_25_overwrite_write", content: "不能丢失的 Recovery", updatedAt: "2026-08-24T00:00:00.000Z"
    };
    knowledgeExternalSnapshots.set("bug_25_overwrite_write", { success: true, content: "外部正文" });
  })()`);

  const result = await harness.evaluate(`saveKnowledgeTask("bug_25_overwrite_write", { allowExternalOverwrite: true })`);

  assert.equal(result.code, "WRITE_FAILED");
  assert.equal(harness.json(`state.tasks[0].notes`), "不能丢失的编辑器正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "EXTERNAL_CHANGED");
  assert.equal(harness.json(`state.knowledgeRecovery.records.bug_25_overwrite_write.content`), "不能丢失的 Recovery");
  assert.equal(harness.evaluate(`knowledgeExternalSnapshots.has("bug_25_overwrite_write")`), true);
  assert.equal(recoveryDeletes, 0);
});

test("Bug 25 overwrite keeps conflict and Recovery when metadata persistence fails", async () => {
  let storageWrites = 0;
  let recoveryDeletes = 0;
  const savePayloads = [];
  const harness = await rendererHarness({
    storage: {
      write: async () => {
        storageWrites += 1;
        if (storageWrites === 1) throw new Error("metadata disk full");
      },
    },
    knowledgeRecovery: { delete: async () => { recoveryDeletes += 1; return true; } },
    knowledgeFile: {
      save: async (payload) => {
        savePayloads.push(payload);
        return {
          success: true,
          atomic: true,
          content: payload.content,
          filePath: payload.filePath,
          lastSavedHash: "overwritten-hash",
          lastSavedMtime: 30,
          encoding: "UTF-8",
          lineEnding: "LF",
        };
      },
      watch: async () => ({ success: true }),
    },
  });
  harness.evaluate(`(() => {
    render = () => {};
    state.tasks = normalizeTasks([{
      id: "bug_25_overwrite_failed", title: "覆盖失败语义", notes: "编辑器权威正文", nodes: [],
      knowledgeNote: {
        noteId: "bug_25_overwrite_failed", taskId: "bug_25_overwrite_failed", filePath: "/tmp/bug-25-overwrite.md",
        documentState: "EXTERNAL_CHANGED", dirty: true,
        lastSavedHash: "old-baseline", lastSavedMtime: 10
      }
    }]);
    state.knowledgeRecovery.records.bug_25_overwrite_failed = {
      noteId: "bug_25_overwrite_failed", content: "Recovery 权威正文", updatedAt: "2026-08-24T00:00:00.000Z"
    };
    knowledgeExternalSnapshots.set("bug_25_overwrite_failed", { success: true, content: "外部正文" });
  })()`);

  const result = await harness.evaluate(`saveKnowledgeTask("bug_25_overwrite_failed", { allowExternalOverwrite: true })`);

  assert.equal(result.code, "TASK_DATA_SAVE_FAILED");
  assert.equal(result.markdownSaved, true);
  assert.equal(savePayloads.length, 1);
  assert.equal(savePayloads[0].content, "编辑器权威正文");
  assert.equal(savePayloads[0].allowExternalOverwrite, true);
  assert.equal(harness.json(`state.tasks[0].notes`), "编辑器权威正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "EXTERNAL_CHANGED");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.lastSavedHash`), "old-baseline");
  assert.equal(harness.json(`state.knowledgeRecovery.records.bug_25_overwrite_failed.content`), "Recovery 权威正文");
  assert.equal(harness.evaluate(`knowledgeExternalSnapshots.has("bug_25_overwrite_failed")`), true);
  assert.equal(recoveryDeletes, 0);
  assert.equal(await harness.evaluate(`flushSave()`), true);
});

test("renderer keeps a temporarily unavailable file bound without inventing FILE_MISSING", async () => {
  const harness = await rendererHarness();
  harness.evaluate(`render = () => {}`);
  harness.evaluate(`state.tasks = normalizeTasks([{
    id: "unavailable_bound_task",
    title: "暂时不可用",
    notes: "当前正文",
    nodes: [],
    knowledgeNote: {
      noteId: "unavailable_bound_task",
      taskId: "unavailable_bound_task",
      filePath: "/volume/note.md",
      documentState: "SAVED",
      dirty: false,
      lastSavedHash: "hash-a"
    }
  }])`);
  await harness.evaluate(`handleKnowledgeFileChange({ type: "file-unavailable", noteId: "unavailable_bound_task", filePath: "/volume/note.md", errorCode: "EIO", message: "磁盘暂时不可用" })`);
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "SAVED");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.filePath`), "/volume/note.md");
  assert.equal(harness.json(`state.knowledgeFileIssues.unavailable_bound_task.message`), "磁盘暂时不可用");
});

test("renderer cannot recreate a missing path and can relocate to a selected file", async () => {
  let saveCalls = 0;
  let chooseCalls = 0;
  const harness = await rendererHarness({
    knowledgeFile: {
      save: async () => {
        saveCalls += 1;
        return { success: true };
      },
      choose: async () => {
        chooseCalls += 1;
        return {
          success: true,
          filePath: "/tmp/relocated.md",
          content: "重新定位正文",
          lastSavedHash: "relocated-hash",
          lastSavedMtime: 5,
          encoding: "UTF-8",
          lineEnding: "LF",
        };
      },
      watch: async () => ({ success: true }),
    },
  });
  harness.evaluate(`render = () => {}; state.tasks = normalizeTasks([{
    id: "missing_task",
    title: "丢失文件",
    notes: "本地正文",
    nodes: [],
    knowledgeNote: {
      noteId: "missing_task",
      taskId: "missing_task",
      filePath: "/tmp/missing.md",
      documentState: "FILE_MISSING",
      dirty: true,
      lastSavedHash: "old-hash"
    }
  }])`);

  const blocked = await harness.evaluate(`saveKnowledgeTask("missing_task")`);
  assert.equal(blocked.code, "FILE_MISSING_REQUIRES_RELOCATION");
  assert.equal(saveCalls, 0);
  const relocated = await harness.evaluate(`relocateKnowledgeTask("missing_task")`);
  assert.equal(relocated.success, true);
  assert.equal(chooseCalls, 1);
  assert.equal(harness.json(`state.tasks[0].notes`), "重新定位正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.filePath`), "/tmp/relocated.md");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "SAVED");
});

test("knowledge file IPC exposes read, relocate, and watcher lifecycle", async () => {
  const [main, preload, watcher] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "main", "main.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "preload.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "knowledge-watcher.cjs"), "utf8"),
  ]);
  assert.match(main, /knowledge-document:read/);
  assert.match(main, /knowledge-document:stage-assets/);
  assert.match(main, /knowledge-document:choose/);
  assert.match(main, /knowledge-document:watch/);
  assert.match(main, /knowledge-file:changed/);
  assert.match(main, /knowledge-recovery:flush-and-quit/);
  assert.match(main, /knowledge-recovery:flush-complete/);
  assert.match(main, /before-quit[\s\S]*knowledgeWatcher\.closeAll\(\)/);
  assert.match(main, /requestSingleInstanceLock/);
  assert.match(main, /second-instance/);
  assert.match(preload, /onChange: \(callback\) => subscribe\("knowledge-file:changed", callback\)/);
  assert.match(preload, /onFlushAndQuit: \(callback\) => subscribe\("knowledge-recovery:flush-and-quit", callback\)/);
  assert.match(watcher, /DEFAULT_DEBOUNCE_MS = 300/);
  assert.match(watcher, /external-changed/);
  assert.match(watcher, /file-missing/);
});

test("renderer knowledge save binds metadata only after the file service succeeds", async () => {
  let response = { canceled: true };
  const calls = [];
  const harness = await rendererHarness({
    platform: "darwin",
    knowledgeFile: {
      save: async (payload) => {
        calls.push(payload);
        return response;
      },
    },
  });
  harness.evaluate(`state.tasks = normalizeTasks([{
    id: "save_task",
    title: "知识标题",
    notes: "Markdown 正文 😀",
    nodes: []
  }])`);

  const canceled = await harness.evaluate(`saveKnowledgeTask("save_task")`);
  assert.equal(canceled.canceled, true);
  assert.equal(harness.json(`state.tasks[0].knowledgeNote`).documentState, "DRAFT");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote`).filePath, null);

  response = {
    canceled: false,
    success: true,
    filePath: "/tmp/knowledge-a.md",
    lastSavedHash: "hash_a",
    lastSavedMtime: 123,
    encoding: "UTF-8",
    lineEnding: "LF",
  };
  const saved = await harness.evaluate(`saveKnowledgeTask("save_task")`);
  assert.equal(saved.success, true);
  const metadata = harness.json(`state.tasks[0].knowledgeNote`);
  assert.equal(metadata.documentState, "SAVED");
  assert.equal(metadata.dirty, false);
  assert.equal(metadata.filePath, "/tmp/knowledge-a.md");
  assert.equal(metadata.lastSavedHash, "hash_a");
  assert.equal(calls[1].content, "Markdown 正文 😀");

  response = { ...response, filePath: "/tmp/knowledge-b.md" };
  const savedAs = await harness.evaluate(`saveKnowledgeTask("save_task", { saveAs: true })`);
  assert.equal(savedAs.filePath, "/tmp/knowledge-b.md");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote`).filePath, "/tmp/knowledge-b.md");
  assert.equal(calls[2].filePath, "");
});

test("renderer stages app-managed images and preserves explicit external image paths", async () => {
  const dataUrl = "data:image/png;base64,cG5n";
  const stagedCalls = [];
  const saveCalls = [];
  const harness = await rendererHarness({
    platform: "darwin",
    knowledgeFile: {
      stageAssets: async (payload) => {
        stagedCalls.push(payload);
        return {
          success: true,
          assets: [{ source: "task-image:managed", dataUrl, filePath: "/recovery/assets/asset-a.png" }],
        };
      },
      save: async (payload) => {
        saveCalls.push(payload);
        return {
          success: true,
          filePath: "/tmp/knowledge-assets.md",
          content: "![应用图片](./attachments/asset-a.png)\n![外部图片](D:/Shared/image.png)",
          assetFiles: [{ relativePath: "./attachments/asset-a.png", dataUrl }],
          lastSavedHash: "asset-hash",
          lastSavedMtime: 456,
        };
      },
    },
  });
  harness.evaluate(`(() => {
    state.attachments.images.managed = ${JSON.stringify(dataUrl)};
    state.tasks = normalizeTasks([{
      id: "asset_task",
      title: "图片笔记",
      notes: "![应用图片](task-image:managed)\\n![外部图片](D:/Shared/image.png)",
      nodes: []
    }]);
  })()`);

  const result = await harness.evaluate(`saveKnowledgeTask("asset_task")`);
  assert.equal(result.success, true);
  assert.equal(stagedCalls.length, 1);
  assert.equal(stagedCalls[0].assets.length, 1);
  assert.equal(stagedCalls[0].assets[0].source, "task-image:managed");
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].assets[0].filePath, "/recovery/assets/asset-a.png");
  assert.match(saveCalls[0].content, /D:\/Shared\/image\.png/);
  assert.equal(harness.json(`state.tasks[0].notes`), "![应用图片](./attachments/asset-a.png)\n![外部图片](D:/Shared/image.png)");
  assert.match(harness.evaluate(`resolveMarkdownImageUrl("./attachments/asset-a.png")`), /^data:image\/png/);
});

test("knowledge UI exposes every document state and the required recovery actions", async () => {
  const harness = await rendererHarness();
  const cases = [
    ["DRAFT", "草稿", "尚未保存到本地文件"],
    ["SAVED", "已保存", "/tmp/knowledge-ui.md"],
    ["DIRTY", "已修改", "/tmp/knowledge-ui.md"],
    ["EXTERNAL_CHANGED", "文件已被外部修改", "/tmp/knowledge-ui.md", "save-knowledge-overwrite"],
    ["FILE_MISSING", "本地文件不存在", "/tmp/knowledge-ui.md", "save-knowledge-as"],
    ["READ_ONLY", "当前文件不可写", "/tmp/knowledge-ui.md", "save-knowledge-as"],
  ];
  for (const [documentState, label, detail, extraAction] of cases) {
    const html = harness.evaluate(`renderTaskKnowledge(normalizeTasks([{
      id: "ui_${documentState}",
      title: "状态测试",
      notes: "正文",
      nodes: [],
      knowledgeNote: {
        noteId: "ui_${documentState}",
        taskId: "ui_${documentState}",
        filePath: ${JSON.stringify(documentState === "DRAFT" ? null : "/tmp/knowledge-ui.md")},
        documentState: ${JSON.stringify(documentState)},
        dirty: ${JSON.stringify(documentState !== "SAVED" && documentState !== "DRAFT")}
      }
    }])[0])`);
    assert.match(html, new RegExp(`data-knowledge-state="${documentState}"`));
    assert.match(html, new RegExp(label));
    assert.match(html, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    if (extraAction === "save-knowledge-overwrite") assert.match(html, /data-action="reload-knowledge"/);
    if (extraAction === "save-knowledge-as") assert.match(html, /data-action="save-knowledge-as"/);
  }

  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");
  assert.match(app, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(app, /saveKnowledgeTask\(task\.id, \{ saveAs: event\.shiftKey \}\)/);
});

test("draft removal prompts safely and file binding removal never deletes disk files", async () => {
  const unwatchCalls = [];
  const harness = await rendererHarness({
    knowledgeFile: {
      unwatch: async (payload) => {
        unwatchCalls.push(payload);
        return true;
      },
    },
  });
  harness.evaluate(`(() => {
    render = () => {};
    state.tasks = normalizeTasks([{
      id: "draft_prompt_task",
      title: "未文件化笔记",
      notes: "仍需保留的草稿",
      nodes: []
    }]);
  })()`);

  const blocked = await harness.evaluate(`deleteTask("draft_prompt_task")`);
  assert.equal(blocked, false);
  assert.equal(harness.json(`state.knowledgeDraftPrompt.taskId`), "draft_prompt_task");
  assert.match(harness.evaluate(`renderKnowledgeDraftPrompt()`), /保留为草稿/);
  assert.match(harness.evaluate(`renderKnowledgeDraftPrompt()`), /删除草稿/);
  assert.match(harness.evaluate(`renderKnowledgeDraftPrompt()`), /data-action="save-knowledge-before-delete"/);

  await harness.evaluate(`action({ action: "keep-knowledge-draft", taskId: "draft_prompt_task" })`);
  assert.equal(harness.json(`state.knowledgeDraftPrompt`), null);

  harness.evaluate(`state.taskPane = "notes"; state.knowledgeDraftPrompt = null`);
  const closeBlocked = await harness.evaluate(`closeKnowledgeEditor("draft_prompt_task")`);
  assert.equal(closeBlocked.code, "DRAFT_REQUIRES_DECISION");
  assert.equal(harness.json(`state.knowledgeDraftPrompt.mode`), "close-editor");
  assert.match(harness.evaluate(`renderKnowledgeDraftPrompt()`), /save-knowledge-before-close/);
  await harness.evaluate(`action({ action: "delete-knowledge-draft", taskId: "draft_prompt_task" })`);
  assert.equal(harness.json(`state.tasks[0].notes`), "");
  assert.equal(harness.json(`state.taskPane`), "flow");

  harness.evaluate(`state.tasks = normalizeTasks([{
    id: "bound_ui_task",
    title: "已绑定笔记",
    notes: "本地正文",
    nodes: [],
    knowledgeNote: {
      noteId: "bound_ui_task",
      taskId: "bound_ui_task",
      filePath: "/tmp/user-owned.md",
      documentState: "SAVED"
    }
  }])`);
  const removed = await harness.evaluate(`removeKnowledgeBinding("bound_ui_task")`);
  assert.equal(removed.success, true);
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.filePath`), null);
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "DRAFT");
  assert.equal(unwatchCalls.length, 1);

  const deleted = await harness.evaluate(`deleteTask("bound_ui_task", { skipDraftPrompt: true })`);
  assert.equal(deleted, true);
  assert.equal(harness.json(`state.tasks.length`), 0);
  assert.equal(unwatchCalls.length, 2);
});

test("renderer recovery debounces input and restores only newer unfiled drafts", async () => {
  const harness = await rendererHarness();
  harness.evaluate(`(() => {
    state.tasks = normalizeTasks([{
      id: "recovery_task",
      title: "恢复测试",
      notes: "旧正文",
      updatedAt: "2026-08-22T00:00:00.000Z",
      nodes: []
    }]);
    state.knowledgeRecovery = { version: 1, records: {} };
    scheduleKnowledgeRecovery("recovery_task", "新正文", { debounceMs: 40, maxIntervalMs: 200 });
    scheduleKnowledgeRecovery("recovery_task", "最新正文", { debounceMs: 40, maxIntervalMs: 200 });
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(harness.storageValue(KNOWLEDGE_RECOVERY_KEY_FOR_TEST), null);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const saved = JSON.parse(harness.storageValue(KNOWLEDGE_RECOVERY_KEY_FOR_TEST));
  assert.equal(saved.records.recovery_task.content, "最新正文");

  harness.evaluate(`scheduleKnowledgeRecovery("recovery_task", "最长间隔正文", { debounceMs: 100, maxIntervalMs: 30 })`);
  await new Promise((resolve) => setTimeout(resolve, 55));
  const forced = JSON.parse(harness.storageValue(KNOWLEDGE_RECOVERY_KEY_FOR_TEST));
  assert.equal(forced.records.recovery_task.content, "最长间隔正文");

  const recovered = harness.json(`(() => {
    state.knowledgeRecovery = {
      version: 1,
      records: {
        recovery_task: {
          noteId: "recovery_task",
          content: "启动恢复正文",
          updatedAt: "2026-08-22T00:01:00.000Z",
          baseFileHash: null
        }
      }
    };
    restoreKnowledgeRecoveryDrafts();
    return {
      content: state.tasks[0].notes,
      state: state.tasks[0].knowledgeNote.documentState,
      dirty: state.tasks[0].knowledgeNote.dirty,
      filePath: state.tasks[0].knowledgeNote.filePath
    };
  })()`);
  assert.deepEqual(recovered, {
    content: "启动恢复正文",
    state: "DRAFT",
    dirty: true,
    filePath: null,
  });

  const boundFilePreserved = harness.json(`(() => {
    state.tasks = normalizeTasks([{
      id: "bound_task",
      title: "已绑定笔记",
      notes: "本地未保存正文",
      updatedAt: "2026-08-22T00:00:00.000Z",
      knowledgeNote: {
        noteId: "bound_task",
        taskId: "bound_task",
        filePath: "/tmp/bound.md",
        documentState: "DIRTY",
        dirty: true,
        lastSavedHash: "hash_a"
      },
      nodes: []
    }]);
    state.knowledgeRecovery = {
      version: 1,
      records: {
        bound_task: {
          noteId: "bound_task",
          content: "Recovery 正文",
          updatedAt: "2026-08-22T00:02:00.000Z",
          baseFileHash: "hash_a"
        }
      }
    };
    restoreKnowledgeRecoveryDrafts();
    return { content: state.tasks[0].notes, filePath: state.tasks[0].knowledgeNote.filePath };
  })()`);
  assert.deepEqual(boundFilePreserved, { content: "本地未保存正文", filePath: "/tmp/bound.md" });
});

test("bound recovery restores only when the current file matches its base hash", async () => {
  const readCalls = [];
  const harness = await rendererHarness({
    knowledgeFile: {
      read: async ({ filePath }) => {
        readCalls.push(filePath);
        const hash = filePath.endsWith("same.md") ? "hash_a" : "hash_b";
        return {
          success: true,
          filePath,
          content: "磁盘正文",
          lastSavedHash: hash,
          lastSavedMtime: 10,
        };
      },
    },
  });
  harness.evaluate(`(() => {
    state.tasks = normalizeTasks([
      {
        id: "bound_same",
        title: "同版本文件",
        notes: "旧本地正文",
        updatedAt: "2026-08-22T00:00:00.000Z",
        nodes: [],
        knowledgeNote: {
          noteId: "bound_same",
          taskId: "bound_same",
          filePath: "/tmp/same.md",
          documentState: "DIRTY",
          dirty: true,
          lastSavedHash: "hash_a"
        }
      },
      {
        id: "bound_changed",
        title: "外部变化文件",
        notes: "应保留的本地正文",
        updatedAt: "2026-08-22T00:00:00.000Z",
        nodes: [],
        knowledgeNote: {
          noteId: "bound_changed",
          taskId: "bound_changed",
          filePath: "/tmp/changed.md",
          documentState: "DIRTY",
          dirty: true,
          lastSavedHash: "hash_a"
        }
      }
    ]);
    state.knowledgeRecovery = {
      version: 1,
      records: {
        bound_same: {
          noteId: "bound_same",
          content: "应恢复的 Recovery 正文",
          updatedAt: "2026-08-22T00:02:00.000Z",
          baseFileHash: "hash_a"
        },
        bound_changed: {
          noteId: "bound_changed",
          content: "外部冲突 Recovery 正文",
          updatedAt: "2026-08-22T00:02:00.000Z",
          baseFileHash: "hash_a"
        }
      }
    };
  })()`);

  await harness.evaluate("restoreKnowledgeRecoveryDrafts()");

  assert.deepEqual(readCalls.sort(), ["/tmp/changed.md", "/tmp/same.md"]);
  assert.deepEqual(harness.json(`state.tasks.map((task) => ({
    id: task.id,
    notes: task.notes,
    state: task.knowledgeNote.documentState,
    dirty: task.knowledgeNote.dirty
  }))`), [
    { id: "bound_same", notes: "应恢复的 Recovery 正文", state: "DIRTY", dirty: true },
    { id: "bound_changed", notes: "应保留的本地正文", state: "EXTERNAL_CHANGED", dirty: true },
  ]);
});

test("renderer revalidates a bound file before saving stale startup content", async () => {
  let readCalls = 0;
  let saveCalls = 0;
  const harness = await rendererHarness({
    knowledgeFile: {
      read: async () => {
        readCalls += 1;
        return {
          success: true,
          filePath: "/tmp/startup-race.md",
          content: "外部新正文",
          lastSavedHash: "hash_b",
          lastSavedMtime: 20,
        };
      },
      save: async () => {
        saveCalls += 1;
        return { success: true, filePath: "/tmp/startup-race.md", lastSavedHash: "hash_a" };
      },
    },
  });
  harness.evaluate(`render = () => {}; state.tasks = normalizeTasks([{
    id: "startup_race_task",
    title: "启动竞态",
    notes: "启动时仍在内存中的旧正文",
    nodes: [],
    knowledgeNote: {
      noteId: "startup_race_task",
      taskId: "startup_race_task",
      filePath: "/tmp/startup-race.md",
      documentState: "SAVED",
      dirty: false,
      lastSavedHash: "hash_a",
      lastSavedMtime: 10
    }
  }])`);

  const result = await harness.evaluate(`saveKnowledgeTask("startup_race_task")`);

  assert.equal(readCalls, 1);
  assert.equal(saveCalls, 0);
  assert.equal(result.code, "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION");
  assert.equal(harness.json(`state.tasks[0].notes`), "启动时仍在内存中的旧正文");
  assert.equal(harness.json(`state.tasks[0].knowledgeNote.documentState`), "EXTERNAL_CHANGED");
});

test("knowledge recovery preserves managed image assets across restart", async () => {
  const dataUrl = "data:image/png;base64,cG5n";
  const recoveryWrites = [];
  const harness = await rendererHarness({
    knowledgeRecovery: {
      write: async (record) => { recoveryWrites.push(JSON.parse(JSON.stringify(record))); },
    },
    knowledgeFile: {
      stageAssets: async ({ assets }) => ({
        success: true,
        assets: assets.map((asset) => ({ ...asset, filePath: "/recovery/assets/asset.png" })),
      }),
    },
  });
  harness.evaluate(`(() => {
    state.attachments = { images: { recovery_image: ${JSON.stringify(dataUrl)} } };
    state.tasks = normalizeTasks([{
      id: "recovery_asset_task",
      title: "Recovery 图片",
      notes: "![图片](task-image:recovery_image)",
      nodes: []
    }]);
    state.knowledgeRecovery = { version: 1, records: {} };
    scheduleKnowledgeRecovery("recovery_asset_task", state.tasks[0].notes, { debounceMs: 10, maxIntervalMs: 100 });
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(recoveryWrites.length, 1);
  assert.equal(recoveryWrites[0].assets[0].source, "task-image:recovery_image");
  assert.equal(recoveryWrites[0].assets[0].dataUrl, dataUrl);

  const persisted = JSON.stringify(recoveryWrites[0]);
  const restored = await harness.evaluate(`(async () => {
    state.attachments = { images: {} };
    state.tasks = normalizeTasks([{
      id: "recovery_asset_task",
      title: "Recovery 图片",
      notes: "旧正文",
      updatedAt: "2026-08-22T00:00:00.000Z",
      nodes: []
    }]);
    state.knowledgeRecovery = { version: 1, records: { recovery_asset_task: ${persisted} } };
    await restoreKnowledgeRecoveryDrafts();
    return { content: state.tasks[0].notes, image: state.attachments.images.recovery_image };
  })()`);
  assert.equal(restored.content, "![图片](task-image:recovery_image)");
  assert.equal(restored.image, dataUrl);
});

test("disk normalization repairs malformed records and legacy preferences", () => {
  const normalized = normalizeTaskData({
    tasks: [
      null,
      {
        id: "task_a",
        title: 42,
        priority: "urgent",
        status: "unknown",
        tags: ["today", "blocked"],
        nodes: [
          null,
          {
            id: "node_a",
            status: "unknown",
            children: [{ id: "node_a", title: "child" }],
          },
        ],
      },
    ],
    taskGroups: [null],
    activeGroupId: "missing",
    attachments: {
      images: {
        keep: "data:image/png;base64,AA==",
        drop: "https://example.com/image.png",
      },
    },
    flowWidths: { title: 9999, note: 1 },
    sidebarWidth: 9999,
    detailHeight: 1,
    font: "mono",
  });

  assert.equal(normalized.tasks.length, 1);
  assert.equal(normalized.tasks[0].title, "42");
  assert.equal(normalized.tasks[0].priority, "medium");
  assert.equal(normalized.tasks[0].status, "active");
  assert.deepEqual(normalized.tasks[0].tags, {
    today: true,
    later: false,
    blocked: true,
  });
  assert.equal(normalized.tasks[0].nodes.length, 1);
  assert.equal(normalized.tasks[0].nodes[0].status, "todo");
  assert.notEqual(
    normalized.tasks[0].nodes[0].id,
    normalized.tasks[0].nodes[0].children[0].id,
  );
  assert.equal(normalized.tasks[0].nodes[0].children[0].parentId, normalized.tasks[0].nodes[0].id);
  assert.equal(normalized.activeGroupId, "group_inbox");
  assert.deepEqual(Object.keys(normalized.attachments.images), ["keep"]);
  assert.deepEqual(normalized.flowWidths, { title: 720, note: 180 });
  assert.equal(normalized.sidebarWidth, 560);
  assert.equal(normalized.detailHeight, 50);
  assert.equal(normalized.zhFont, "yahei");
  assert.equal(normalized.enFont, "mono");
});

test("disk normalization preserves every supported typography choice", () => {
  const zhFonts = ["system", "noto", "yahei", "pingfang", "songti", "simsun", "fangsong", "heiti", "kaiti"];
  const enFonts = ["inter", "system", "segoe", "arial", "helvetica", "verdana", "trebuchet", "tahoma", "times", "georgia", "courier", "mono"];

  for (const zhFont of zhFonts) {
    assert.equal(normalizeTaskData({ zhFont, enFont: "inter" }).zhFont, zhFont);
  }

  for (const enFont of enFonts) {
    assert.equal(normalizeTaskData({ zhFont: "system", enFont }).enFont, enFont);
  }

});

test("disk normalization creates and preserves a random UUID installation identifier", () => {
  const created = normalizeTaskData({}).installationId;
  assert.match(created, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(normalizeTaskData({ installationId: created }).installationId, created);
  assert.notEqual(normalizeTaskData({}).installationId, created);
});

test("Chinese and English font settings stay isolated in the application font chain", async () => {
  const [styles, app] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
  ]);

  assert.match(styles, /--app-font:\s*var\(--zh-font\),\s*var\(--en-font\),\s*sans-serif;/);
  assert.doesNotMatch(app, /横向滚动\s*·\s*双击重命名/);
});

test("Today widget uses the main Today focus surface treatment", async () => {
  const [styles, widget] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "today-widget.html"), "utf8"),
  ]);

  assert.match(styles, /\.today-panel\.today-focus\s*\{[\s\S]*linear-gradient\(145deg, var\(--handoff-focus-800\), var\(--handoff-focus-950\)\)/);
  assert.match(widget, /--widget-focus:\s*#2e5d49;/);
  assert.match(widget, /--widget-focus-deep:\s*#17392d;/);
  assert.match(widget, /--widget-bg:[\s\S]*linear-gradient\(145deg, var\(--widget-focus\), var\(--widget-focus-deep\)\)/);
  assert.match(widget, /--widget-task-bg:\s*rgba\(255, 255, 255, 0\.075\)/);
  assert.match(widget, /\.today-widget\s*\{[\s\S]*background:\s*var\(--widget-bg\)/);
  assert.match(widget, /\.today-task\s*\{[\s\S]*background:\s*var\(--widget-task-bg\)/);
  assert.match(widget, /--widget-font:\s*var\(--zh-font\),\s*var\(--en-font\),\s*sans-serif;/);
  assert.match(widget, /NotoSansCJKsc-Bold\.otf/);
});

test("settings expose one-confirmation background update with a safe silent restart handshake", async () => {
  const [app, styles, preload, updater, main] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "preload.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "updater.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "main.cjs"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const available = harness.evaluate(`(() => {
    appUpdateState = normalizeAppUpdateState({
      status: "available",
      supported: true,
      automaticChecks: true,
      currentVersion: "0.1.109",
      version: "0.1.110",
      size: 30000000,
      releaseDate: "2026-08-15T08:00:00.000Z"
    });
    return renderUpdateSettingsControls();
  })()`);
  const preparing = harness.evaluate(`(() => {
    appUpdateState = normalizeAppUpdateState({ status: "preparing", supported: true, currentVersion: "0.1.109", version: "0.1.110" });
    return renderUpdateSettingsControls();
  })()`);
  const missingWindowsFeed = harness.evaluate(`(() => {
    appUpdateState = normalizeAppUpdateState({ status: "error", supported: true, currentVersion: "0.1.118", errorCode: "UPDATE_METADATA_MISSING" });
    return renderUpdateSettingsControls();
  })()`);

  assert.match(app, /<h3 id="software-update-title">软件更新<\/h3>/);
  assert.match(available, /自动检查更新/);
  assert.match(available, /v0\.1\.110 可用/);
  assert.match(available, /data-update-action="download">升级并重启/);
  assert.match(preparing, /正在保存并准备升级/);
  assert.match(missingWindowsFeed, /Windows 更新包尚未发布完整/);
  assert.match(missingWindowsFeed, /UPDATE_METADATA_MISSING/);
  assert.match(missingWindowsFeed, /打开发布页/);
  assert.doesNotMatch(available, /data-update-action="install"/);
  assert.match(styles, /\.settings-update-progress span\s*\{[\s\S]*background:\s*var\(--focus\);/);
  assert.match(styles, /\.update-install-overlay\s*\{/);
  assert.match(preload, /app-update:get-state/);
  assert.match(preload, /app-update:prepare-install/);
  assert.match(preload, /app-update:prepare-install-complete/);
  assert.match(updater, /autoDownload = false/);
  assert.match(updater, /autoInstallOnAppQuit = false/);
  assert.match(updater, /userApprovedInstall/);
  assert.match(updater, /quitAndInstall\(true, true\)/);
  assert.match(main, /requestUpdateInstallPreparation/);
  assert.match(main, /UPDATE_INSTALL_PREPARATION_TIMEOUT_MS/);
  assert.match(app, /flushPendingKnowledgeRecoveries\(\{ strict: true \}\)/);
  assert.doesNotMatch(app, /自动安装更新/);
});

test("release configuration uses deterministic updater artifacts and excludes debug metadata", async () => {
  const [packageJson, buildScript, workflow, verifier] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "package.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(__dirname, "..", "tools", "build.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", ".github", "workflows", "release.yml"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "tools", "verify-update-artifacts.cjs"), "utf8"),
  ]);

  assert.equal(packageJson.build.win.artifactName, "Personal-Task-Track-${version}-${arch}-setup.${ext}");
  assert.equal(packageJson.build.mac.artifactName, "Personal-Task-Track-${version}-${arch}.${ext}");
  assert.deepEqual(packageJson.build.publish, [{ provider: "github", owner: "tangyuanx", repo: "personal-task-track" }]);
  assert.match(buildScript, /new Set\(\["latest\.yml", "latest-mac\.yml"\]\)/);
  assert.match(workflow, /release\/latest\.yml/);
  assert.match(workflow, /release\/latest-mac\.yml/);
  assert.doesNotMatch(workflow, /release\/\*\.yml/);
  assert.match(workflow, /needs:\s*build/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /--require-all-platforms/);
  assert.match(verifier, /references missing artifact/);
  assert.match(verifier, /Combined release is missing required update metadata/);
});

test("repository structure keeps production, tooling, documentation, and prototypes separate", async () => {
  const root = path.join(__dirname, "..");
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

  assert.equal(packageJson.main, "app/main/main.cjs");
  assert.match(packageJson.scripts.test, /tests\/desktop\.test\.cjs/);
  assert.match(packageJson.scripts.check, /services\/bug-report/);
  assert.match(packageJson.scripts["build:milkdown"], /tools\/build-milkdown\.cjs/);
  assert.ok(packageJson.build.files.every((entry) => entry === "package.json" || entry.startsWith("app/") || entry.startsWith("!")));
  assert.ok(packageJson.build.files.includes("app/renderer/index.html"));
  assert.ok(packageJson.build.files.includes("app/renderer/today-widget.html"));

  await Promise.all([
    "app/main/main.cjs",
    "app/renderer/index.html",
    "services/bug-report/package.json",
    "tests/desktop.test.cjs",
    "tools/build.cjs",
    "docs/README.md",
    "prototypes/README.md",
  ].map((entry) => fs.access(path.join(root, entry))));

  await Promise.all([
    "electron",
    "src",
    "scripts",
    "bug-report-server",
    "today-widget-window-demo.html",
  ].map((entry) => assert.rejects(fs.access(path.join(root, entry)))));
});

test("Today widget preferences normalize safely and retain an intentional custom position", () => {
  assert.deepEqual(normalizeTodayWidgetPreferences(null), {
    position: "top-right",
    alwaysOnTop: true,
    launchWithApp: true,
    visible: true,
    compact: false,
    opacity: 100,
    height: 260,
    customBounds: null,
    clickThrough: false,
  });
  assert.deepEqual(normalizeTodayWidgetPreferences({
    position: "custom",
    alwaysOnTop: false,
    launchWithApp: false,
    visible: false,
    compact: true,
    opacity: 84.6,
    height: 347.8,
    customBounds: { x: 321.7, y: 48.2 },
  }), {
    position: "custom",
    alwaysOnTop: false,
    launchWithApp: false,
    visible: false,
    compact: true,
    opacity: 85,
    height: 348,
    customBounds: { x: 322, y: 48 },
    clickThrough: false,
  });
  assert.equal(normalizeTodayWidgetPreferences({ position: "custom" }).position, "top-right");
  assert.equal(normalizeTodayWidgetPreferences({ opacity: null }).opacity, 100);
  assert.equal(normalizeTodayWidgetPreferences({ opacity: 12 }).opacity, 70);
  assert.equal(normalizeTodayWidgetPreferences({ opacity: 120 }).opacity, 100);
  assert.equal(normalizeTodayWidgetPreferences({ height: 90 }).height, 180);
  assert.equal(normalizeTodayWidgetPreferences({ height: 900 }).height, 720);
  assert.equal(normalizeTodayWidgetPreferences({ clickThrough: true }).clickThrough, true);
  assert.equal(normalizeTodayWidgetPreferences({ clickThrough: "true" }).clickThrough, false);
});

test("Today widget corner placement respects each display work area", () => {
  const workArea = { x: 1440, y: 24, width: 1920, height: 1056 };
  const size = { width: 360, height: 260 };

  assert.deepEqual(cornerWindowBounds(workArea, size, "top-left"), { x: 1456, y: 40, ...size });
  assert.deepEqual(cornerWindowBounds(workArea, size, "top-right"), { x: 2984, y: 40, ...size });
  assert.deepEqual(cornerWindowBounds(workArea, size, "bottom-left"), { x: 1456, y: 804, ...size });
  assert.deepEqual(cornerWindowBounds(workArea, size, "bottom-right"), { x: 2984, y: 804, ...size });
});

test("Today widget appearance normalizes theme, fonts, and base font size", () => {
  assert.deepEqual(normalizeTodayWidgetAppearance({
    theme: "dark",
    zhFont: "songti",
    enFont: "georgia",
    fontSize: 18,
  }), {
    theme: "dark",
    zhFont: "songti",
    enFont: "georgia",
    fontSize: 18,
  });
  assert.deepEqual(normalizeTodayWidgetAppearance({
    theme: "unknown",
    zhFont: "unknown",
    enFont: "unknown",
    fontSize: 99,
  }), {
    theme: "light",
    zhFont: "system",
    enFont: "inter",
    fontSize: 24,
  });
  assert.deepEqual(normalizeSnapshot({}).appearance, normalizeTodayWidgetAppearance());
});

test("Today widget topmost policy joins macOS fullscreen Spaces without hiding the host app from the Dock", () => {
  const calls = [];
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    setVisibleOnAllWorkspaces: (...args) => calls.push(["workspaces", ...args]),
    setHiddenInMissionControl: (...args) => calls.push(["mission-control", ...args]),
    setAlwaysOnTop: (...args) => calls.push(["always-on-top", ...args]),
    moveTop: () => calls.push(["move-top"]),
  };

  applyTodayWidgetTopmost(window, true, "darwin");
  assert.deepEqual(calls, [
    ["workspaces", true, { visibleOnFullScreen: true, skipTransformProcessType: true }],
    ["mission-control", true],
    ["always-on-top", true, "screen-saver", 1],
    ["move-top"],
  ]);

  calls.length = 0;
  applyTodayWidgetTopmost(window, false, "darwin");
  assert.deepEqual(calls, [
    ["workspaces", false, { visibleOnFullScreen: false, skipTransformProcessType: true }],
    ["mission-control", false],
    ["always-on-top", false, "normal", 0],
  ]);
});

test("Today widget preferences persist atomically outside task data", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-widget-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const written = await writeTodayWidgetPreferences(directory, {
    position: "bottom-left",
    alwaysOnTop: false,
    launchWithApp: true,
    visible: true,
    compact: true,
    opacity: 82,
    height: 380,
  });
  const read = await readTodayWidgetPreferences(directory);

  assert.deepEqual(read, written);
  assert.equal(read.position, "bottom-left");
  assert.equal(read.opacity, 82);
  assert.equal(read.height, 380);
  await assert.rejects(fs.access(path.join(directory, "today-widget-preferences.json.tmp")));
});

test("production Today widget uses its dedicated frontend and a sandboxed Electron window", async () => {
  const [demo, runtime, widgetMain, appMain, preload, packageJson] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "today-widget.html"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "today-widget-runtime.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "today-widget.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "main.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "preload.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "package.json"), "utf8").then(JSON.parse),
  ]);

  assert.match(demo, /class="today-widget" id="widget" data-position="top-right"/);
  assert.doesNotMatch(demo, /按优先级与阻塞状态排序|项待办|刚刚同步|在主窗口查看全部|corner-anchor/);
  assert.match(demo, /data-place="top-left"/);
  assert.match(demo, /<span>始终显示在最上层<\/span>/);
  assert.match(demo, /<span>随应用启动<\/span>/);
  assert.match(demo, /<span>窗口透明度<\/span>/);
  assert.match(demo, /<span>鼠标穿透显示<\/span>/);
  assert.match(demo, /id="widget-opacity" type="range" min="70" max="100"/);
  assert.match(demo, /隐藏今日窗口/);
  assert.match(demo, /body\.widget-runtime \.today-widget/);
  assert.match(demo, /class="compact-expand-icon"/);
  assert.match(demo, /\.today-widget\.is-compact \.compact-expand-icon\s*\{\s*display:\s*block;/);
  assert.doesNotMatch(demo, /\.today-widget\.is-compact \.widget-menu[^}]*display:\s*none;/);
  assert.match(runtime, /bridge\.completeTask/);
  assert.match(runtime, /bridge\.setPreferences\(\{ clickThrough: enabled \}\)/);
  assert.match(runtime, /bridge\.openMain/);
  assert.doesNotMatch(runtime, /ResizeObserver/);
  assert.doesNotMatch(runtime, /\+ 60/);
  assert.match(runtime, /currentSnapshot\.items\) \? currentSnapshot\.items : \[\]/);
  assert.match(runtime, /bridge\.resize\(\{ height: pendingResizeHeight, edge \}\)/);
  assert.match(runtime, /startHeight: window\.innerHeight/);
  assert.match(runtime, /COMPACT_MENU_WINDOW_HEIGHT = 340/);
  assert.match(runtime, /bridge\.resize\(\{ height: COMPACT_MENU_WINDOW_HEIGHT, transient: true \}\)/);
  assert.match(runtime, /bridge\.resize\(\{ height: 49, transient: true \}\)/);
  assert.match(widgetMain, /setIgnoreMouseEvents\(preferences\.clickThrough === true, \{ forward: true \}\)/);
  assert.match(widgetMain, /CommandOrControl\+Shift\+T/);
  assert.match(demo, /data-widget-resize="top"/);
  assert.match(demo, /data-widget-resize="bottom"/);
  assert.match(demo, /body\.widget-runtime \.task-list\s*\{[\s\S]*overflow-y:\s*auto;/);
  assert.match(demo, /body\.widget-runtime \.task-list::\-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
  assert.match(runtime, /function applyAppearance/);
  assert.match(runtime, /document\.documentElement\.dataset\.zhFont/);
  assert.match(runtime, /--widget-font-scale/);
  assert.match(runtime, /function applyOpacity/);
  assert.match(runtime, /setPreferences\(\{ opacity \}\)/);
  assert.match(runtime, /document\.addEventListener\("pointerdown",[\s\S]*closeMenu\(\)/);
  assert.match(runtime, /window\.addEventListener\("blur", closeMenu\)/);
  assert.match(widgetMain, /frame: false/);
  assert.match(widgetMain, /acceptFirstMouse: true/);
  assert.match(widgetMain, /transparent: true/);
  assert.match(widgetMain, /hasShadow: false/);
  assert.match(widgetMain, /sandbox: true/);
  assert.match(widgetMain, /type: process\.platform === "darwin" \? "panel" : undefined/);
  assert.match(widgetMain, /visibleOnFullScreen: topmost/);
  assert.match(widgetMain, /skipTransformProcessType: true/);
  assert.match(widgetMain, /setAlwaysOnTop[\s\S]*"screen-saver"/);
  assert.match(widgetMain, /moveTop\(\)/);
  assert.match(widgetMain, /getDisplayMatching/);
  assert.match(widgetMain, /if \(preferences\.compact\)[\s\S]*size\?\.transient !== true[\s\S]*height:\s*Math\.max\(49, Math\.min\(420/);
  assert.match(widgetMain, /position:\s*"custom"[\s\S]*height,[\s\S]*customBounds:/);
  assert.match(widgetMain, /function stop\(\)[\s\S]*widgetWindow\.destroy\(\)/);
  assert.match(appMain, /if \(!isQuitting && !updateInstallPrepared\) app\.quit\(\)/);
  assert.doesNotMatch(appMain, /!isMac && !isQuitting/);
  assert.match(appMain, /app\.setActivationPolicy\("regular"\)/);
  assert.match(appMain, /await app\.dock\.show\(\)/);
  assert.match(appMain, /app\.on\("did-resign-active"[\s\S]*fullscreenTransitionRefresh/);
  assert.match(preload, /todayWidget:/);
  assert.match(preload, /app:confirm-destructive/);
  assert.match(appMain, /dialog\.showMessageBox/);
  assert.ok(packageJson.build.files.includes("app/renderer/today-widget.html"));
});

test("bundled cross-platform fonts are available", async () => {
  const [app, styles, normalized] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    Promise.resolve(normalizeTaskData({ zhFont: "noto", enFont: "inter" })),
  ]);
  const fontDirectory = path.join(__dirname, "..", "app", "renderer", "src", "assets", "fonts");
  const [inter, noto, notoBold] = await Promise.all([
    fs.stat(path.join(fontDirectory, "InterVariable.woff2")),
    fs.stat(path.join(fontDirectory, "NotoSansCJKsc-Regular.otf")),
    fs.stat(path.join(fontDirectory, "NotoSansCJKsc-Bold.otf")),
  ]);

  assert.equal(normalized.zhFont, "noto");
  assert.doesNotMatch(app, /task-track-font-size/);
  assert.match(styles, /url\("\.\/assets\/fonts\/InterVariable\.woff2"\)/);
  assert.match(styles, /url\("\.\/assets\/fonts\/NotoSansCJKsc-Regular\.otf"\)/);
  assert.match(styles, /url\("\.\/assets\/fonts\/NotoSansCJKsc-Bold\.otf"\)/);
  assert.doesNotMatch(styles, /--font-scale/);
  assert.ok(inter.size > 100000);
  assert.ok(noto.size > 10000000);
  assert.ok(notoBold.size > 10000000);
});

test("missing conclusion highlights only the current task without locking task selection", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.tasks = normalizeTasks([
      { id: "prompted", title: "待结论", conclusion: "", nodes: [] },
      { id: "other", title: "可切换", conclusion: "", nodes: [] }
    ]);
    state.activeTaskId = "other";
    state.conclusionPromptTaskId = "prompted";
    return { active: activeTask().id, promptedPage: renderTaskPage(state.tasks[0]) };
  })()`);

  assert.equal(result.active, "other");
  assert.match(result.promptedPage, /needs-attention/);
  assert.match(app, /function renderCompletionNotice/);
  assert.match(app, /请先填写结论，再标记完成/);
  assert.match(styles, /\.completion-notice \{/);
  assert.doesNotMatch(result.promptedPage, /conclusion-prompt/);
  assert.doesNotMatch(app, /function renderConclusionPrompt/);
  assert.doesNotMatch(app, /if \(state\.conclusionPromptTaskId\) \{/);
  assert.doesNotMatch(styles, /\.conclusion-prompt \{/);
});

test("processing flow matches the compact reference tree and opens details only on demand", async () => {
  const [styles, app] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    const task = normalizeTasks([{
      id: "flow_reference",
      title: "Windows 自动更新下载失败",
      nodes: [{
        id: "root_todo",
        title: "定位 Windows 自动更新下载失败",
        status: "todo",
        children: [{
          id: "child_doing",
          title: "复现：安装后触发更新",
          status: "later",
          children: [{ id: "leaf_done", title: "校验 CI 上传目录", status: "done", children: [] }]
        }]
      }]
    }])[0];
    state.tasks = [task];
    state.activeTaskId = task.id;
    state.taskPane = "flow";
    state.selectedNodeId = "";
    const defaultPage = renderTaskPage(task);
    const tree = renderFlowNode(task.id, task.nodes[0], 0, 0, [], true);
    state.selectedNodeId = "child_doing";
    state.recordDraft = "详情记录";
    const selectedPage = renderTaskPage(task);
    const detail = renderNodeDetailPage(task.id, findNode(task.nodes, "child_doing"));
    const cycleStatuses = [];
    for (let index = 0; index < 4; index += 1) {
      cycleNodeStatus(task.id, "root_todo");
      cycleStatuses.push(findNode(task.nodes, "root_todo").status);
    }
    return { defaultPage, selectedPage, tree, detail, cycleStatuses };
  })()`);
  const finalFlowRules = styles.slice(styles.lastIndexOf("v0.1.135 — reference-matched processing tree"));

  assert.match(result.tree, /flow-node-marker flow-status-bullet status-todo/);
  assert.match(result.tree, /feather-sprite\.svg#disc/);
  assert.match(result.tree, /flow-status-badge status-todo"[^>]*data-action="cycle-node-status"[^>]*>todo</);
  assert.match(result.tree, /flow-status-badge status-later"[^>]*data-action="cycle-node-status"[^>]*>doing</);
  assert.match(result.tree, /flow-status-badge status-done"[^>]*data-action="cycle-node-status"[^>]*>done</);
  assert.deepEqual(result.cycleStatuses, ["later", "done", "blocked", "todo"]);
  assert.match(result.tree, /class="flow-tree-rail/);
  assert.match(result.tree, /class="flow-tree-elbow"/);
  assert.match(result.tree, /data-flow-select data-task-id="flow_reference" data-node-id="root_todo"/);
  assert.doesNotMatch(result.defaultPage, /node-detail-page|node-inspector-empty|has-node-page/);
  assert.match(result.selectedPage, /flow-workspace has-node-page/);
  assert.match(result.selectedPage, /class="node-detail-page"/);
  assert.match(result.selectedPage, /aria-label="返回处理流"/);
  assert.match(result.detail, /class="node-detail-updated"[^>]*>最近修改 /);
  assert.match(result.detail, /node-detail-title-row/);
  assert.match(result.detail, /node-detail-current-status flow-status-badge status-later">doing</);
  assert.doesNotMatch(result.detail, /node-detail-status-section|node-detail-status-options|node-detail-status-option/);
  assert.match(result.detail, /node-inspector-breadcrumb"><span>路径<\/span>/);
  assert.match(result.detail, /data-action="save-node-detail">保存<\/button>/);
  assert.doesNotMatch(result.detail, /保存记录/);
  assert.doesNotMatch(result.detail, /节点详情<\/span>|父节点|第 2 层|创建时间|状态变化|完成时间|新增下级节点|新增同级节点|删除节点/);
  assert.match(app, /selectedNode \? renderNodeDetailPage\(task\.id, selectedNode\) : ""/);
  assert.doesNotMatch(app, /element\.classList\.contains\("flow-title-input"\)[\s\S]*selectNodeForInspector\(element\.dataset\.taskId, element\.dataset\.nodeId\);[\s\S]*render\(\);/);
  assert.match(app, /data-action="add-child-node"[\s\S]*添加子节点/);
  assert.match(app, /data-action="add-sibling-node"[\s\S]*添加兄弟节点/);
  assert.match(app, /data-action="delete-node"[\s\S]*删除节点/);
  assert.doesNotMatch(app, /context-menu-label">状态/);
  assert.match(app, /\.flow-main\[data-context="flow-root"\]/);
  assert.match(app, /if \(element\.dataset\.context === "flow-root"\) return;/);
  assert.match(app, /event\.key === "Enter" && event\.shiftKey/);
  assert.match(app, /event\.key === "Tab" && !event\.shiftKey/);
  assert.match(app, /\.node-detail-page, \.flow-row/);
  assert.match(app, /recordInput\.focus\(\{ preventScroll: true \}\);/);
  assert.match(finalFlowRules, /\.flow-outline-row\s*\{[\s\S]*min-height:\s*29px;[\s\S]*gap:\s*8px;[\s\S]*var\(--tree-depth\) \* 48px/);
  assert.match(finalFlowRules, /\.flow-status-badge\s*\{[\s\S]*height:\s*19px;[\s\S]*border-radius:\s*2px;/);
  assert.match(finalFlowRules, /\.flow-workspace\.has-node-page\s*\{[\s\S]*grid-template-columns:/);
  assert.match(finalFlowRules, /\.node-detail-updated\s*\{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*520;/);
  assert.doesNotMatch(finalFlowRules, /\.node-detail-status-options\s*\{/);
  assert.match(finalFlowRules, /\.node-detail-page \.node-inspector-save\s*\{[\s\S]*border-radius:\s*6px;[\s\S]*background:\s*#4f766d;/);
  assert.match(finalFlowRules, /\.flow-node-marker\.flow-status-bullet\s*\{[\s\S]*border-radius:\s*50%;[\s\S]*background:\s*currentColor;/);
  assert.match(finalFlowRules, /\.flow-node-marker-icon\s*\{\s*display:\s*none;/);
  assert.match(finalFlowRules, /\.node-detail-page\s*\{[\s\S]*overscroll-behavior:\s*contain;/);
  assert.match(finalFlowRules, /@media \(max-width: 760px\)[\s\S]*\.node-detail-page\s*\{[\s\S]*overflow-y:\s*auto;/);
});

test("task repository renders priority without an update timestamp", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");

  assert.match(app, /class="task-priority-control \$\{task\.priority\}"/);
  assert.doesNotMatch(app, /formatRepositoryStamp/);
  assert.doesNotMatch(app, /<time datetime="\$\{escAttr\(task\.updatedAt\)\}">/);
  assert.match(app, /class="repository-add-task" type="button" data-action="add-task"/);
  assert.match(app, /aria-label="新增任务"/);
});

test("group editing preserves the horizontal group viewport across renders", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");

  assert.match(app, /const previousGroupScrollLeft = document\.querySelector\("\[data-sheet-tabs\]"\)/);
  assert.match(app, /const restoreGroupScroll = \(\) => \{/);
  assert.match(app, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*restoreGroupScroll\(\);[\s\S]*mountMilkdownEditors\(\)/);
});

test("task repository follows the approved compact ordering layout", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const html = harness.evaluate(`renderTaskItem(normalizeTasks([{
    id: "ordered_task", title: "有序任务", priority: "high", nodes: []
  }])[0], 3)`);

  assert.match(app, /\.map\(\(task, index\) => renderTaskItem\(task, index \+ 1\)\)/);
  assert.doesNotMatch(app, /class="task-repository-columns"/);
  assert.match(html, /task-sequence" aria-hidden="true">03/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /repository-complete/);
  assert.doesNotMatch(html, /task-drag-handle/);
  assert.match(styles, /grid-template-columns: 42px minmax\(0, 1fr\) 82px 34px;/);
  assert.match(styles, /\.task-row\.task-item \{[\s\S]*min-height: 48px;[\s\S]*border: 0;/);
});

test("repository and flow cleanup leave no inherited separators or duplicate headings", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);

  assert.doesNotMatch(app, /<strong>任务分组<\/strong>/);
  assert.doesNotMatch(app, /<div class="section-heading flow-head">[\s\S]*?<h2>处理流<\/h2>/);
  assert.match(styles, /\.task-row\.task-item \{[\s\S]*grid-template-columns: 32px minmax\(0, 1fr\) max-content 16px;[\s\S]*column-gap: 6px;[\s\S]*border-bottom: 0;/);
  assert.match(styles, /\.task-row\.task-item:last-child \{[\s\S]*border-bottom: 0;/);
  assert.match(styles, /\.repository-complete:not\(\.is-checked\)::after \{[\s\S]*display: none;/);
  assert.match(styles, /\.group-panel,[\s\S]*\.task-footer\.sidebar-foot \{[\s\S]*border-top: 0;/);
  assert.match(styles, /\.rail\.sidebar > \.task-footer\.sidebar-foot \{[\s\S]*margin-top: 0;[\s\S]*padding-top: 0;/);
});

test("repository and task page omit redundant section labels", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");

  assert.doesNotMatch(app, /<span>任务仓库<\/span>/);
  assert.doesNotMatch(app, /class="page-kicker kicker">工作台<\/div>/);
  assert.match(app, /双击左侧任务列表的空白区域，即可创建新的处理流。/);
});

test("sidebar resize keeps a broad transparent hit area with a one-pixel visible divider", async () => {
  const styles = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8");
  const resizerRule = styles.match(/\.sidebar-resizer\s*\{([\s\S]*?)\}/)?.[1] || "";
  const dividerRule = styles.match(/\.sidebar-resizer::before\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(resizerRule, /right:\s*-8px;/);
  assert.match(resizerRule, /width:\s*22px;/);
  assert.match(resizerRule, /background:\s*transparent;/);
  assert.match(dividerRule, /left:\s*14px;/);
  assert.match(dividerRule, /width:\s*1px;/);
  assert.doesNotMatch(styles, /\.sidebar-resizer:hover\s*\{[\s\S]*?background:/);
  assert.match(styles, /body\.resizing-sidebar \.sidebar-resizer::before/);
});

test("disk persistence writes and reads a normalized atomic payload", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const written = await writeTaskData(directory, {
    tasks: [{ id: "task_roundtrip", title: "Round trip", nodes: [] }],
  });
  const read = await readTaskData(directory);

  assert.deepEqual(read, written);
  assert.equal(read.tasks[0].title, "Round trip");
  await assert.rejects(fs.access(path.join(directory, "task-data.json.tmp")));
});

test("disk reads preserve corrupt JSON as a timestamped backup", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "personal-task-track-corrupt-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, "task-data.json"), "{invalid", "utf8");

  await assert.rejects(readTaskData(directory), (error) => {
    assert.equal(error.code, "CORRUPT_TASK_DATA");
    assert.match(error.backupPath, /task-data\.corrupt-.+\.json$/);
    return true;
  });
  const files = await fs.readdir(directory);
  assert.equal(files.some((file) => /^task-data\.corrupt-.+\.json$/.test(file)), true);
  assert.equal(files.includes("task-data.json"), false);
});

test("renderer makes corrupt task-data backup recovery observable", async () => {
  const harness = await rendererHarness({
    storage: {
      read: async () => {
        throw Object.assign(new Error("backup created"), { code: "CORRUPT_TASK_DATA" });
      },
    },
  });
  const loaded = await harness.evaluate("loadAppData()");
  assert.equal(loaded.tasks.length, 0);
  assert.equal(harness.alerts.length, 1);
  assert.match(harness.alerts[0], /损坏/);
});

test("renderer normalization restores safe task and node invariants", async () => {
  const harness = await rendererHarness();
  const tasks = harness.json(`normalizeTasks([
    null,
    {
      id: "duplicate",
      title: 12,
      conclusion: null,
      tags: ["later"],
      nodes: [
        null,
        { id: "node", status: "invalid", children: [{ id: "node", title: "child" }] }
      ]
    },
    { id: "duplicate", title: "second", nodes: [] }
  ])`);

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].title, "12");
  assert.equal(tasks[0].conclusion, "");
  assert.equal(tasks[0].tags.later, true);
  assert.equal(tasks[0].nodes[0].status, "todo");
  assert.equal(tasks[0].nodes[0].taskId, tasks[0].id);
  assert.equal(tasks[0].nodes[0].children[0].parentId, tasks[0].nodes[0].id);
  assert.equal(tasks[0].knowledgeNote.taskId, tasks[0].id);
  assert.equal(tasks[0].knowledgeNote.documentState, "DRAFT");
  assert.equal(tasks[0].knowledgeNote.filePath, null);
  assert.notEqual(tasks[0].id, tasks[1].id);
  assert.notEqual(tasks[0].nodes[0].id, tasks[0].nodes[0].children[0].id);

  const legacyString = harness.json(`normalizeTasks([{ id: "legacy_string_renderer", knowledgeNote: "旧正文", nodes: [] }])`)[0];
  assert.equal(legacyString.notes, "旧正文");
  assert.equal(legacyString.knowledgeNote.documentState, "DRAFT");
});

test("today focus highlights the active task even when it suggests a different node", async () => {
  const harness = await rendererHarness();
  const html = harness.evaluate(`(() => {
    state.activeTaskId = "today_task";
    state.selectedNodeId = "";
    return renderTodayFocusItem({
      task: { id: "today_task", title: "今日任务" },
      node: { id: "next_step" },
      kind: "normal",
      nextText: "下一步"
    });
  })()`);

  assert.match(html, /focus-row normal selected/);
});

test("Today widget snapshot reuses the main Today ordering and next-step content", async () => {
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.tasks = normalizeTasks([
      { id: "normal", title: "普通任务", priority: "low", tags: { today: true }, nodes: [] },
      { id: "high", title: "高优先任务", priority: "high", tags: { today: true }, nodes: [{ id: "high_node", title: "高优先下一步", status: "todo", children: [] }] },
      { id: "blocked", title: "阻塞任务", priority: "medium", tags: { today: true, blocked: true }, nodes: [{ id: "blocked_node", title: "解除阻塞", status: "blocked", children: [] }] },
      { id: "fourth", title: "第四项", priority: "low", tags: { today: true }, nodes: [] }
    ]);
    const focus = todayFocusItems().map(({ task, kind, nextText }) => ({ taskId: task.id, title: task.title, kind, nextText }));
    const snapshot = todayWidgetSnapshot();
    return { focus, snapshot };
  })()`);

  assert.deepEqual(result.snapshot.items, result.focus);
  assert.deepEqual(result.snapshot.items.slice(0, 2).map((item) => item.taskId), ["blocked", "high"]);
  assert.equal(result.snapshot.items.length, 4);
  assert.equal(result.snapshot.items[0].nextText, "解除阻塞");
});

test("Today widget resizes vertically from either edge and stays inside the display", () => {
  const workArea = { x: 0, y: 100, width: 1280, height: 700 };
  const bounds = { x: 800, y: 200, width: 360, height: 260 };

  assert.deepEqual(resizedWidgetBounds(bounds, workArea, 320, "top"), {
    x: 800, y: 140, width: 360, height: 320,
  });
  assert.deepEqual(resizedWidgetBounds(bounds, workArea, 320, "bottom"), {
    x: 800, y: 200, width: 360, height: 320,
  });
  assert.deepEqual(resizedWidgetBounds(bounds, workArea, 900, "top"), {
    x: 800, y: 100, width: 360, height: 360,
  });
  assert.deepEqual(resizedWidgetBounds(bounds, workArea, 900, "bottom"), {
    x: 800, y: 200, width: 360, height: 600,
  });
});

test("Today surfaces keep every scheduled task and scroll within bounded content areas", async () => {
  const [app, styles, runtime, widgetMain] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "today-widget-runtime.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "today-widget.cjs"), "utf8"),
  ]);
  const normalized = normalizeSnapshot({
    items: Array.from({ length: 7 }, (_, index) => ({ taskId: `today_${index}`, title: `任务 ${index}` })),
  });

  assert.equal(normalized.items.length, 7);
  assert.doesNotMatch(app, /\.slice\(0, 3\)/);
  assert.doesNotMatch(runtime, /\.slice\(0, 3\)/);
  assert.doesNotMatch(widgetMain, /\.slice\(0, 3\)/);
  assert.match(styles, /\.today-panel \.focus-stack\s*\{[\s\S]*max-height:\s*192px;[\s\S]*overflow-y:\s*auto;/);
});

test("task Markdown export resolves the task group and includes knowledge notes", async () => {
  const harness = await rendererHarness();
  const markdown = harness.evaluate(`(() => {
    state.taskGroups = [
      { id: "group_inbox", title: "默认", order: 1 },
      { id: "group_work", title: "工作", order: 2 }
    ];
    const task = normalizeTasks([{
      id: "task_export",
      groupId: "group_work",
      title: "导出任务",
      notes: "最新知识笔记",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T01:00:00.000Z",
      nodes: []
    }])[0];
    return taskMarkdown(task);
  })()`);

  assert.match(markdown, /- 分组：工作/);
  assert.match(markdown, /## 知识笔记\n最新知识笔记/);
});

test("filtered task reordering preserves hidden task slots", async () => {
  const harness = await rendererHarness();
  const reordered = harness.json(`(() => {
    state.taskGroups = [{ id: "group_inbox", title: "默认", order: 1 }];
    state.activeGroupId = "group_inbox";
    state.taskFilter = "all";
    state.priorityFilter = "high";
    state.query = "";
    state.tasks = normalizeTasks([
      { id: "a", title: "A", priority: "high", order: 1, nodes: [] },
      { id: "b", title: "B", priority: "low", order: 2, nodes: [] },
      { id: "c", title: "C", priority: "high", order: 3, nodes: [] }
    ]);
    reorderTasks("a", "c", "after");
    return state.tasks.map(({ id, order }) => ({ id, order })).sort((a, b) => a.order - b.order);
  })()`);

  assert.deepEqual(reordered, [
    { id: "c", order: 1 },
    { id: "b", order: 2 },
    { id: "a", order: 3 },
  ]);
});

test("search filters repository rows without switching the active task", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.taskGroups = [{ id: "group_inbox", title: "默认", order: 1 }];
    state.activeGroupId = "group_inbox";
    state.taskFilter = "all";
    state.priorityFilter = "all";
    state.tasks = normalizeTasks([
      { id: "active", title: "当前任务", groupId: "group_inbox", nodes: [] },
      { id: "hit", title: "可搜索任务", groupId: "group_inbox", nodes: [] }
    ]);
    state.activeTaskId = "active";
    state.query = "可搜索";
    return { active: activeTask().id, results: filteredTasks().map((task) => task.id) };
  })()`);

  assert.equal(result.active, "active");
  assert.deepEqual(result.results, ["hit"]);
  assert.match(app, /function refreshTaskRepository\(\)/);
  assert.match(app, /filteredTasks\(\{ includeQuery: false \}\)/);
  assert.match(app, /compositionstart/);
});

test("exact deadline-date filtering composes with task status and remains transient", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.taskGroups = [{ id: "group_inbox", title: "默认", order: 1 }];
    state.activeGroupId = "group_inbox";
    state.query = "";
    state.priorityFilter = "all";
    state.taskDateFilter = "2026-08-12";
    state.tasks = normalizeTasks([
      { id: "active_match", title: "当日未完成", status: "active", deadlineAt: new Date(2026, 7, 12, 10).toISOString(), nodes: [] },
      { id: "done_match", title: "当日已完成", status: "done", deadlineAt: new Date(2026, 7, 12, 18).toISOString(), nodes: [] },
      { id: "other_day", title: "其他日期", status: "active", deadlineAt: new Date(2026, 7, 11, 10).toISOString(), nodes: [] }
    ]);
    state.taskFilter = "active";
    const active = filteredTasks().map((task) => task.id);
    state.taskFilter = "done";
    const done = filteredTasks().map((task) => task.id);
    return { active, done, label: taskDateFilterLabel(state.taskDateFilter) };
  })()`);

  assert.deepEqual(result.active, ["active_match"]);
  assert.deepEqual(result.done, ["done_match"]);
  assert.equal(result.label, "08/12");
  assert.equal(harness.evaluate(`normalizeTaskDateFilter("2026-02-30")`), "");
  assert.doesNotMatch(app, /task-calendar-filter|task-date-filter-popover|data-task-date-filter|clear-task-date-filter/);
  assert.doesNotMatch(styles, /\.task-calendar-filter|\.task-date-filter-popover/);
  assert.doesNotMatch(app, /taskDateFilter:\s*state\.taskDateFilter/);
  assert.match(styles, /\.calendar-deadline-rail/);
});

test("optional deadlines normalize consistently and invalid values stay unset", async () => {
  const normalized = normalizeTaskData({
    tasks: [
      { id: "valid", deadlineAt: "2026-08-25T10:30:00.000Z" },
      { id: "invalid", deadlineAt: "not-a-date" },
      { id: "missing" },
    ],
  }).tasks;

  assert.equal(normalized[0].deadlineAt, "2026-08-25T10:30:00.000Z");
  assert.equal(normalized[1].deadlineAt, "");
  assert.equal(normalized[2].deadlineAt, "");

  const harness = await rendererHarness();
  assert.equal(harness.evaluate(`normalizeTasks([{ id: "renderer", deadlineAt: "2026-08-25T10:30:00.000Z" }])[0].deadlineAt`), "2026-08-25T10:30:00.000Z");
  assert.equal(harness.evaluate(`normalizeTasks([{ id: "renderer-invalid", deadlineAt: "invalid" }])[0].deadlineAt`), "");
});

test("deadline ranges compose with status and order only deadline-scoped results", async () => {
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    const at = new Date(2026, 7, 24, 10, 0);
    state.taskGroups = [{ id: "group_inbox", title: "默认", order: 1 }];
    state.activeGroupId = "group_inbox";
    state.query = "";
    state.priorityFilter = "all";
    state.taskFilter = "active";
    state.taskDateFilter = "";
    state.tasks = normalizeTasks([
      { id: "manual-first", title: "无截止", status: "active", order: 1, nodes: [] },
      { id: "tomorrow-late", title: "明晚", status: "active", order: 2, deadlineAt: new Date(2026, 7, 25, 18).toISOString(), nodes: [] },
      { id: "overdue", title: "已逾期", status: "active", order: 3, deadlineAt: new Date(2026, 7, 23, 18).toISOString(), nodes: [] },
      { id: "tomorrow-early", title: "明早", status: "active", order: 4, deadlineAt: new Date(2026, 7, 25, 9).toISOString(), nodes: [] },
      { id: "done-overdue", title: "已完成", status: "done", order: 5, deadlineAt: new Date(2026, 7, 23, 9).toISOString(), nodes: [] }
    ]);
    state.taskDeadlineFilter = "all";
    const manual = filteredTasks({ at }).map((task) => task.id);
    state.taskDeadlineFilter = "week";
    const week = filteredTasks({ at }).map((task) => task.id);
    state.taskDeadlineFilter = "overdue";
    const overdue = filteredTasks({ at }).map((task) => task.id);
    state.taskDeadlineFilter = "all";
    state.taskDateFilter = "2026-08-25";
    const exact = filteredTasks({ at }).map((task) => task.id);
    return { manual, week, overdue, exact };
  })()`);

  assert.deepEqual(result.manual, ["manual-first", "tomorrow-late", "overdue", "tomorrow-early"]);
  assert.deepEqual(result.week, ["tomorrow-early", "tomorrow-late"]);
  assert.deepEqual(result.overdue, ["overdue"]);
  assert.deepEqual(result.exact, ["tomorrow-early", "tomorrow-late"]);
});

test("calendar owns the footer entry, exposes review in its upper-right, and edits an optional deadline", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);

  assert.match(app, /data-action="toggle-calendar"[^>]*>\s*日历\s*</);
  assert.equal((app.match(/data-action="toggle-calendar"/g) || []).length, 1);
  assert.match(app, /function renderCalendarPanel\(\)/);
  assert.match(app, /class="calendar-head-actions"[\s\S]*data-action="open-review-from-calendar"[\s\S]*任务回顾/);
  assert.match(app, /data-deadline-field/);
  assert.match(app, /高优任务建议设置截止时间/);
  assert.match(styles, /\.calendar-grid/);
  assert.match(styles, /\.task-deadline-control/);
});

test("recurring tasks normalize, become due at local time, and reactivate for a new occurrence", async () => {
  const normalized = normalizeTaskData({
    tasks: [{
      id: "repeat",
      recurrence: { frequency: "weekly", weekday: 5, time: "08:30", lastCompletedOccurrence: "invalid" },
    }],
  }).tasks[0].recurrence;
  assert.deepEqual(normalized, {
    frequency: "weekly",
    weekdays: [5],
    time: "08:30",
    lastCompletedOccurrence: "",
  });

  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    const fridayMorning = new Date(2026, 7, 14, 8, 29);
    const fridayDue = new Date(2026, 7, 14, 8, 30);
    const saturdayDue = new Date(2026, 7, 15, 9, 0);
    const weekly = normalizeTasks([{ id: "weekly", recurrence: { frequency: "weekly", weekdays: [1, 3, 5], time: "08:30" }, nodes: [] }])[0];
    const daily = normalizeTasks([{ id: "daily", status: "done", recurrence: { frequency: "daily", time: "09:00", lastCompletedOccurrence: "2026-08-14" }, nodes: [] }])[0];
    state.tasks = [daily];
    const changed = syncRecurringTasks(saturdayDue);
    return {
      before: isRecurringTaskDue(weekly, fridayMorning),
      due: isRecurringTaskDue(weekly, fridayDue),
      wrongDay: isRecurringTaskDue(weekly, saturdayDue),
      multipleDays: isRecurringTaskDue(weekly, new Date(2026, 7, 12, 8, 30)),
      dailyStatus: daily.status,
      changed,
      key: recurringOccurrenceKey(daily, saturdayDue),
    };
  })()`);

  assert.equal(result.before, false);
  assert.equal(result.due, true);
  assert.equal(result.wrongDay, false);
  assert.equal(result.multipleDays, true);
  assert.equal(result.dailyStatus, "active");
  assert.equal(result.changed, true);
  assert.equal(result.key, "2026-08-15");
});

test("recurrence controls feed every Today surface and refresh while the app stays open", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");
  assert.match(app, /data-recurrence-mode=/);
  assert.match(app, /data-recurrence-weekday=/);
  assert.match(app, /data-recurrence-field="time"/);
  assert.match(app, /state\.taskFilter === "today" && !isTaskScheduledForToday\(task\)/);
  assert.match(app, /\.filter\(\(task\) => isTaskScheduledForToday\(task\)\)/);
  assert.match(app, /window\.setInterval\?\.\([\s\S]*?30000/);
});

test("recurrence settings match the selected compact popover and support multiple weekdays", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    const task = normalizeTasks([{
      id: "weekly",
      recurrence: { frequency: "weekly", weekdays: [1, 3, 5], time: "08:30" },
      nodes: []
    }])[0];
    recurrencePopoverTaskId = task.id;
    const html = renderTaskRecurrenceControls(task);
    recurrencePopoverTaskId = "";
    const pageHtml = renderTaskPage(task);
    state.tasks = [task];
    updateTaskRecurrence(task.id, "weekday", "3");
    updateTaskRecurrence(task.id, "weekday", "2");
    updateTaskRecurrence(task.id, "frequency", "none");
    updateTaskRecurrence(task.id, "frequency", "weekly");
    return {
      html,
      pageHtml,
      upcoming: recurrenceUpcomingLabels(task.recurrence, new Date(2026, 7, 15, 10, 0), 3),
      weekdays: task.recurrence.weekdays,
    };
  })()`);
  const finalRules = styles.slice(styles.lastIndexOf("v0.1.109 — demo-matched recurrence popover"));
  const briefCardRules = styles.slice(styles.lastIndexOf("v0.1.131 — reference-matched workbench brief cards"));

  assert.match(result.html, /class="task-recurrence-trigger"/);
  assert.match(result.html, /aria-expanded="true"/);
  assert.match(result.html, /每周一、三、五 · 08:30/);
  assert.match(result.html, /role="dialog" aria-label="循环设置"/);
  assert.match(result.html, /data-recurrence-mode="weekly"/);
  assert.match(result.html, /data-recurrence-weekday="5"/);
  assert.doesNotMatch(result.html, /修改后自动保存|>重复<|出现在今日任务|每周执行日|未来三次/);
  assert.equal(result.pageHtml.match(/每周一、三、五 · 08:30/g)?.length, 1);
  assert.doesNotMatch(result.pageHtml, /task-tag recurring/);
  assert.deepEqual(result.upcoming, ["8月17日 周一 08:30", "8月18日 周二 08:30", "8月21日 周五 08:30"]);
  assert.deepEqual(result.weekdays, [1, 2, 5]);
  assert.match(app, /let recurrencePopoverTaskId = "";/);
  assert.match(finalRules, /\.task-recurrence-popover\s*\{[\s\S]*width:\s*min\(372px,/);
  assert.match(finalRules, /\.task-recurrence-mode-switch\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,/);
  assert.match(finalRules, /\.task-recurrence-weekday-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(7,/);
  assert.match(briefCardRules, /\.brief-strip\.task-brief\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*gap:\s*clamp\(12px, 1\.4vw, 18px\);[\s\S]*min-height:\s*142px;/);
  assert.match(briefCardRules, /\.brief-cell\.brief-field,[\s\S]*border:\s*1px solid[\s\S]*border-radius:\s*14px;[\s\S]*box-shadow:/);
  assert.match(briefCardRules, /\.brief-cell\.brief-field:focus-within\s*\{[\s\S]*border-color:[\s\S]*box-shadow:/);
  assert.match(briefCardRules, /\.brief-label \.brief-stamp\s*\{[\s\S]*display:\s*none;/);
  assert.match(result.pageHtml, /class="brief-field brief-cell background/);
  assert.match(result.pageHtml, /class="brief-field brief-cell hypothesis[\s\S]*class="brief-progress-ring"/);
  assert.match(result.pageHtml, /src\/assets\/feather\/feather-sprite\.svg#(?:file-text|bar-chart-2|check-square|edit-3)/);
});

test("group and node mutations do not steal repository title focus", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");
  assert.doesNotMatch(app, /window\.setTimeout\(render, 0\)/);
  assert.match(app, /\.task-check, input, textarea, select, button, \[contenteditable\]/);
  assert.match(app, /event\.relatedTarget\?\.closest\?\.\("\.task-title, \.page-title"\)/);
});

test("app switching restores native and Milkdown editing selections", async () => {
  const [app, milkdown] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "milkdown-editor.entry.js"), "utf8"),
  ]);

  assert.match(app, /function captureAppSwitchEditingFocus\(/);
  assert.match(app, /function restoreAppSwitchEditingFocus\(/);
  assert.match(app, /if \(!event\.relatedTarget && !appEditingPointerDown && captureAppSwitchEditingFocus\(event\.target\)\)/);
  assert.match(app, /window\.addEventListener\("focus", \(\) => \{\s*if \(restoreAppSwitchEditingFocus\(\)\) return;/);
  assert.match(app, /editor\.addEventListener\("blur",[\s\S]*captureAppSwitchEditingFocus/);
  assert.match(milkdown, /editorViewCtx/);
  assert.match(milkdown, /getSelection:/);
  assert.match(milkdown, /restoreSelection:/);

  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    let focusCount = 0;
    let restoredRange = null;
    const field = {
      classList: { contains: (name) => name === "page-title" },
      dataset: { editKey: "title", taskId: "task_focus", nodeId: "" },
      value: "0123456789",
      focus() { focusCount += 1; },
      selectionStart: 4,
      selectionEnd: 7,
      scrollLeft: 12,
      scrollTop: 3,
      setSelectionRange(start, end) { restoredRange = [start, end]; }
    };
    document.body.contains = (element) => element === field;
    captureAppSwitchEditingFocus(field);
    appSwitchFocusSnapshot.restore = true;
    captureAppSwitchEditingFocus(field);
    const restoreSurvivedLateBlur = appSwitchFocusSnapshot.restore;
    field.selectionStart = 0;
    field.selectionEnd = 0;
    field.scrollLeft = 0;
    field.scrollTop = 0;
    const restored = restoreAppSwitchEditingFocus();
    return {
      restored,
      focusCount,
      restoredRange,
      scrollLeft: field.scrollLeft,
      scrollTop: field.scrollTop,
      restoreSurvivedLateBlur,
      snapshotCleared: appSwitchFocusSnapshot === null
    };
  })()`);

  assert.deepEqual(result, {
    restored: true,
    focusCount: 1,
    restoredRange: [4, 7],
    scrollLeft: 12,
    scrollTop: 3,
    restoreSurvivedLateBlur: true,
    snapshotCleared: true,
  });
});

test("task title edits mirror immediately between repository and workbench", async () => {
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.tasks = normalizeTasks([{ id: "task_title", title: "旧标题", nodes: [] }]);
    const repository = { dataset: { taskId: "task_title", editKey: "title" }, value: "旧标题" };
    const workbench = { dataset: { taskId: "task_title", editKey: "title" }, value: "新标题" };
    document.activeElement = workbench;
    document.querySelectorAll = (selector) => selector === '[data-edit-key="title"][data-task-id]' ? [repository, workbench] : [];
    edit(workbench.dataset, workbench.value);
    return { stateTitle: state.tasks[0].title, repositoryTitle: repository.value, workbenchTitle: workbench.value };
  })()`);

  assert.deepEqual(result, {
    stateTitle: "新标题",
    repositoryTitle: "新标题",
    workbenchTitle: "新标题",
  });
});

test("every repository row click activates its task before nested controls run", async () => {
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.tasks = normalizeTasks([
      { id: "current", title: "当前任务", nodes: [] },
      { id: "clicked", title: "点击任务", nodes: [] }
    ]);
    state.activeTaskId = "current";
    state.selectedNodeId = "open_node";
    state.recordDraft = "draft";
    const listeners = {};
    const row = {
      dataset: { taskId: "clicked" },
      addEventListener(type, listener, options) {
        if (type === "click" && options === true) listeners.click = listener;
      },
      querySelectorAll() { return []; }
    };
    const scope = {
      querySelectorAll(selector) {
        return selector === ".task-item[data-task-id]" ? [row] : [];
      }
    };
    bindTaskRepositoryRows(scope);
    listeners.click({
      preventDefault() {},
      stopPropagation() {},
      target: {
        closest(selector) {
          if (selector === "[data-action]") return null;
          if (selector === ".task-title") return this;
          return null;
        }
      }
    });
    return {
      activeTaskId: state.activeTaskId,
      selectedNodeId: state.selectedNodeId,
      recordDraft: state.recordDraft,
      focusTaskTitleId: state.focusTaskTitleId
    };
  })()`);

  assert.deepEqual(result, {
    activeTaskId: "clicked",
    selectedNodeId: "",
    recordDraft: "",
    focusTaskTitleId: "clicked",
  });
});

test("completion keeps the clicked repository task visible when it leaves the current filter", async () => {
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.taskGroups = [{ id: "group_inbox", title: "默认", order: 1 }];
    state.activeGroupId = "group_inbox";
    state.taskFilter = "active";
    state.tasks = normalizeTasks([
      { id: "current", title: "当前任务", conclusion: "完成", status: "active", nodes: [] },
      { id: "clicked", title: "点击任务", conclusion: "完成", status: "active", nodes: [] }
    ]);
    state.activeTaskId = "current";
    activateRepositoryTask("clicked");
    toggleTaskDone("clicked");
    return {
      activeTaskId: activeTask().id,
      visibleRepositoryIds: filteredTasks().map((task) => task.id),
      clickedStatus: state.tasks.find((task) => task.id === "clicked").status
    };
  })()`);

  assert.equal(result.activeTaskId, "clicked");
  assert.deepEqual(result.visibleRepositoryIds, ["current"]);
  assert.equal(result.clickedStatus, "done");
});

test("flow title and record widths share a bounded accessible splitter", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const widths = harness.json(`(() => {
    state.flowWidths = { title: 360, note: 330 };
    setFlowSplitTitleWidth(500, null);
    const first = { ...state.flowWidths };
    setFlowSplitTitleWidth(900, null);
    return { first, clamped: { ...state.flowWidths } };
  })()`);
  const renderedDrag = harness.json(`(() => {
    state.flowWidths = { title: 360, note: 330 };
    const properties = {};
    const attributes = {};
    const titleCell = { getBoundingClientRect: () => ({ left: 100, right: 460 }) };
    const recordCell = { getBoundingClientRect: () => ({ left: 460, right: 800 }) };
    const row = { querySelector: (selector) => selector === ".flow-title-cell" ? titleCell : recordCell };
    const handle = { setAttribute: (name, value) => { attributes[name] = value; } };
    const flowList = {
      querySelector: (selector) => selector === ".flow-line.flow-row:not(.header)" ? row : handle,
      style: { setProperty: (name, value) => { properties[name] = value; } }
    };
    setFlowSplitFromClientX(450, flowList);
    return { widths: { ...state.flowWidths }, properties, attributes };
  })()`);
  const finalFlowRules = styles.slice(styles.lastIndexOf("Persisted values are relative weights"));

  assert.deepEqual(widths.first, { title: 500, note: 190 });
  assert.deepEqual(widths.clamped, { title: 510, note: 180 });
  assert.deepEqual(renderedDrag.widths, { title: 345, note: 345 });
  assert.equal(renderedDrag.properties["--flow-title-track"], "345fr");
  assert.equal(renderedDrag.properties["--flow-note-track"], "345fr");
  assert.equal(renderedDrag.attributes["aria-valuenow"], "50");
  assert.match(app, /role="separator"[^>]+data-flow-split-resizer/);
  assert.match(app, /handleFlowSplitKeydown/);
  assert.match(app, /function flowSplitGeometry/);
  assert.match(app, /function setFlowSplitFromClientX/);
  assert.doesNotMatch(app, /data-resize-col/);
  assert.match(styles, /\.flow-split-layer\s*\{[\s\S]*?height:\s*calc\(var\(--flow-visible-row-count, 1\) \* 40px\);/);
  assert.match(styles, /\.flow-split-resizer\s*\{[\s\S]*?width:\s*15px;/);
  assert.match(finalFlowRules, /var\(--flow-title-track, 360fr\)/);
  assert.match(finalFlowRules, /var\(--flow-note-track, 330fr\)/);
});

test("processing-flow nodes move across parents, levels, and sibling positions without cycles", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.tasks = normalizeTasks([{
      id: "task_drag_nodes",
      nodes: [
        {
          id: "a",
          title: "A",
          children: [
            { id: "a1", title: "A1", collapsed: true, children: [{ id: "a1x", title: "A1X", children: [] }] },
            { id: "a2", title: "A2", children: [] }
          ]
        },
        { id: "b", title: "B", children: [{ id: "b1", title: "B1", children: [] }] },
        { id: "c", title: "C", children: [] }
      ]
    }]);

    const siblingMove = moveFlowNode("task_drag_nodes", "a2", "a1", "before");
    const reparentMove = moveFlowNode("task_drag_nodes", "b1", "a1", "inside");
    const rootPositionMove = moveFlowNode("task_drag_nodes", "a1x", "c", "before");
    const secondReparentMove = moveFlowNode("task_drag_nodes", "c", "b", "inside");
    const beforeInvalid = JSON.stringify(state.tasks[0].nodes);
    const invalidDescendantMove = moveFlowNode("task_drag_nodes", "a", "b1", "inside");
    const invalidUnchanged = JSON.stringify(state.tasks[0].nodes) === beforeInvalid;
    const rootAppendMove = moveFlowNode("task_drag_nodes", "b1", "", "root");
    const rootSiblingMove = moveFlowNode("task_drag_nodes", "a1", "b", "after");
    const task = state.tasks[0];
    const snapshot = (nodes) => sort(nodes).map((node) => ({
      id: node.id,
      parentId: node.parentId,
      type: node.type,
      order: node.order,
      children: snapshot(node.children)
    }));
    return {
      siblingMove,
      reparentMove,
      rootPositionMove,
      secondReparentMove,
      invalidDescendantMove,
      invalidUnchanged,
      rootAppendMove,
      rootSiblingMove,
      a1Expanded: findNode(task.nodes, "a1").collapsed === false,
      placements: [10, 50, 90].map((clientY) => flowNodeDropPlacement({ getBoundingClientRect: () => ({ top: 0, height: 100 }) }, clientY)),
      nodes: snapshot(task.nodes)
    };
  })()`);

  assert.equal(result.siblingMove, true);
  assert.equal(result.reparentMove, true);
  assert.equal(result.rootPositionMove, true);
  assert.equal(result.secondReparentMove, true);
  assert.equal(result.invalidDescendantMove, false);
  assert.equal(result.invalidUnchanged, true);
  assert.equal(result.rootAppendMove, true);
  assert.equal(result.rootSiblingMove, true);
  assert.equal(result.a1Expanded, true);
  assert.deepEqual(result.placements, ["before", "inside", "after"]);
  assert.deepEqual(result.nodes, [
    { id: "a", parentId: null, type: "step", order: 1, children: [{ id: "a2", parentId: "a", type: "subtask", order: 1, children: [] }] },
    { id: "b", parentId: null, type: "step", order: 2, children: [{ id: "c", parentId: "b", type: "subtask", order: 1, children: [] }] },
    { id: "a1", parentId: null, type: "step", order: 3, children: [] },
    { id: "a1x", parentId: null, type: "step", order: 4, children: [] },
    { id: "b1", parentId: null, type: "step", order: 5, children: [] },
  ]);
  assert.match(app, /draggable="true"[^>]+data-flow-drag-source/);
  assert.match(app, /data-flow-drag-target/);
  assert.match(app, /application\/x-personal-task-flow-node/);
  assert.match(app, /function flowNodeDropPlacement\(/);
  assert.match(styles, /\.flow-node-drag-handle/);
  assert.match(styles, /\.node-drag-over-inside/);
});

test("node record input focus stays within a quiet field boundary", async () => {
  const styles = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8");
  const finalRecordFocusRules = styles.slice(styles.lastIndexOf("Node record editing stays inside the field"));

  assert.match(finalRecordFocusRules, /\.record-modal-textarea\s*\{[\s\S]*outline:\s*none;/);
  assert.match(finalRecordFocusRules, /\.record-modal-textarea:focus\s*\{[\s\S]*box-shadow:\s*inset 0 0 0 1px/);
  assert.doesNotMatch(finalRecordFocusRules, /\.record-modal-textarea:focus\s*\{[\s\S]*box-shadow:\s*0 0 0/);
});

test("knowledge images keep the caret beside the inline image node", async () => {
  const [entry, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "milkdown-editor.entry.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
  ]);
  const inlineImageRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror \.milkdown-image-inline\s*\{([\s\S]*?)\}/)?.[1] || "";
  const imageRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror \.milkdown-image-inline > \.image-inline\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(entry, /insertImageCommand/);
  assert.match(inlineImageRule, /max-width:\s*calc\(100% - 2px\);/);
  assert.match(inlineImageRule, /vertical-align:\s*bottom;/);
  assert.match(imageRule, /display:\s*inline-block;/);
  assert.match(imageRule, /vertical-align:\s*bottom;/);
  assert.doesNotMatch(styles, /\.task-knowledge-editor-panel \.ProseMirror img\s*\{[\s\S]*?display:\s*block;/);
  assert.match(styles, /\.task-knowledge-editor-panel \.milkdown-editor-host\s*\{[\s\S]*?overflow:\s*auto;/);
  assert.match(styles, /\.task-knowledge-editor-panel \.ProseMirror\s*\{\s*overflow:\s*visible;/);
});

test("knowledge scrolling does not paint an inner focus boundary across content", async () => {
  const styles = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8");
  const panelFocusRule = styles.match(/\.task-knowledge-editor-panel:focus-within\s*\{([\s\S]*?)\}/)?.[1] || "";
  const editorFocusRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror-focused\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(panelFocusRule, /border-color:/);
  assert.match(panelFocusRule, /box-shadow:/);
  assert.match(editorFocusRule, /box-shadow:\s*none;/);
  assert.match(styles, /\.task-knowledge-editor-panel \.milkdown-editor-host\s*\{[\s\S]*?overflow:\s*auto;/);
  assert.match(styles, /\.task-knowledge-editor-panel \.ProseMirror\s*\{\s*overflow:\s*visible;/);
});

test("knowledge lists and code use compact document-like presentation", async () => {
  const styles = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8");
  const listRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror ul,[\s\S]*?\.task-knowledge-editor-panel \.ProseMirror ol\s*\{([\s\S]*?)\}/)?.[1] || "";
  const nestedListRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror \.content-dom ul,[\s\S]*?\.content-dom ol\s*\{([\s\S]*?)\}/)?.[1] || "";
  const listMarkerRule = styles.match(/\.task-knowledge-editor-panel \.milkdown-list-item-block li \.label-wrapper,[\s\S]*?\.label-wrapper \.label\s*\{([\s\S]*?)\}/)?.[1] || "";
  const codeBlockRule = styles.match(/\.task-knowledge-editor-panel \.milkdown \.milkdown-code-block\s*\{([\s\S]*?)\}/)?.[1] || "";
  const inlineCodeRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror :not\(pre\) > code\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(listRule, /padding-left:\s*0;/);
  assert.match(nestedListRule, /margin-left:\s*18px;/);
  assert.match(listMarkerRule, /color:\s*var\(--handoff-ink\);/);
  assert.match(listMarkerRule, /font-weight:\s*600;/);
  assert.match(styles, /\.milkdown-list-item-block li \.label-wrapper svg\s*\{[\s\S]*?fill:\s*currentColor;/);
  assert.match(codeBlockRule, /background:\s*#f5f7f6;/);
  assert.match(codeBlockRule, /box-shadow:\s*none;/);
  assert.match(inlineCodeRule, /font-family:\s*var\(--mono\);/);
  assert.match(styles, /\.milkdown-code-block \.cm-gutters\s*\{[\s\S]*?display:\s*none;/);
});

test("Milkdown handles matching backtick code spans and defers markdown serialization", async () => {
  const entry = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "milkdown-editor.entry.js"), "utf8");

  assert.match(entry, /const completeInlineCodeInputRule = \$inputRule/);
  assert.match(entry, /markRule\(\/\(`\+\)\(\[\^`\\n\]\+\)\\1\$\//);
  assert.match(entry, /inlineCodeSchema\.type\(ctx\)/);
  assert.match(entry, /extensions:\s*\[drawSelection\(\), keymap\.of\(defaultKeymap\.concat\(indentWithTab\)\)\]/);
  assert.match(entry, /listener\.updated\(scheduleMarkdown\)/);
  assert.match(entry, /requestIdleCallback/);
  assert.doesNotMatch(entry, /listener\.markdownUpdated/);
});

test("node mutation rejects invalid statuses and clears deleted descendant detail", async () => {
  const harness = await rendererHarness();
  const result = JSON.parse(JSON.stringify(await harness.evaluate(`(async () => {
    state.tasks = normalizeTasks([{
      id: "task_nodes",
      nodes: [{
        id: "parent",
        status: "todo",
        children: [{ id: "child", status: "todo", children: [] }]
      }]
    }]);
    state.selectedNodeId = "child";
    state.recordDraft = "draft";
    markNodeStatus("task_nodes", "parent", "invalid");
    const status = state.tasks[0].nodes[0].status;
    await deleteNode("task_nodes", "parent");
    return {
      status,
      selectedNodeId: state.selectedNodeId,
      recordDraft: state.recordDraft,
      nodes: state.tasks[0].nodes
    };
  })()`)));

  assert.equal(result.status, "todo");
  assert.equal(result.selectedNodeId, "");
  assert.equal(result.recordDraft, "");
  assert.deepEqual(result.nodes, []);
});

test("Markdown URLs reject executable schemes", async () => {
  const harness = await rendererHarness();
  assert.equal(harness.evaluate(`safeMarkdownUrl("javascript:alert(1)")`), "");
  assert.equal(harness.evaluate(`safeMarkdownUrl("data:text/html,hello")`), "");
  assert.equal(
    harness.evaluate(`safeMarkdownUrl("https://example.com/path?q=1&x=2")`),
    "https://example.com/path?q=1&amp;x=2",
  );
});

test("bug feedback prevents a second rapid submission while one is in flight", async () => {
  const harness = await rendererHarness();
  const result = await harness.evaluate(`(() => {
    state.feedbackSubmitting = true;
    return submitBugReport();
  })()`);
  assert.equal(result, false);
});

test("bug feedback payload contains only form and optional basic environment fields", async () => {
  const harness = await rendererHarness();
  const payload = harness.json(`(() => {
    state.tasks = [{ id: "private", title: "不得上传的任务标题", description: "不得上传" }];
    state.installationId = "123e4567-e89b-42d3-a456-426614174000";
    state.feedbackDraft = {
      title: "列表没有刷新",
      category: "malfunction",
      description: "保存后列表仍然没有显示新增任务。",
      reproductionSteps: "点击保存",
      contact: "",
      includeEnvironment: true,
      confirmed: true
    };
    return bugReportPayload();
  })()`);
  assert.equal(payload.category, "功能异常");
  assert.equal(payload.environment.installationId, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(payload.tasks, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /不得上传/);
});
