const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {
  normalizeTaskData,
  readTaskData,
  writeTaskData,
} = require("../electron/storage.cjs");

function rendererHarness() {
  const storage = new Map();
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
      remove() {},
      style: {},
    }),
    createTextNode: (value) => ({ value }),
    execCommand: () => false,
    queryCommandSupported: () => false,
  };
  const window = {
    personalTaskTrack: undefined,
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
    alert() {},
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
  return fs
    .readFile(path.join(__dirname, "..", "src", "app.js"), "utf8")
    .then((source) => {
      vm.runInContext(source.replace(/\nbootstrap\(\);\s*$/, "\n"), context, {
        filename: "src/app.js",
      });
      return {
        evaluate(expression) {
          return vm.runInContext(expression, context);
        },
        json(expression) {
          return JSON.parse(JSON.stringify(vm.runInContext(expression, context)));
        },
      };
    });
}

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
  const fontSizes = ["compact", "default", "large"];

  for (const zhFont of zhFonts) {
    assert.equal(normalizeTaskData({ zhFont, enFont: "inter" }).zhFont, zhFont);
  }

  for (const enFont of enFonts) {
    assert.equal(normalizeTaskData({ zhFont: "system", enFont }).enFont, enFont);
  }

  for (const fontSize of fontSizes) {
    assert.equal(normalizeTaskData({ fontSize }).fontSize, fontSize);
  }
});

test("Chinese and English font settings stay isolated in the application font chain", async () => {
  const [styles, app] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
  ]);

  assert.match(styles, /--app-font:\s*var\(--zh-font\),\s*var\(--en-font\),\s*sans-serif;/);
  assert.doesNotMatch(app, /横向滚动\s*·\s*双击重命名/);
});

test("font size preference and bundled cross-platform fonts are available", async () => {
  const [app, styles, normalized] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
    Promise.resolve(normalizeTaskData({ fontSize: "large", zhFont: "noto", enFont: "inter" })),
  ]);
  const fontDirectory = path.join(__dirname, "..", "src", "assets", "fonts");
  const [inter, noto, notoBold] = await Promise.all([
    fs.stat(path.join(fontDirectory, "InterVariable.woff2")),
    fs.stat(path.join(fontDirectory, "NotoSansCJKsc-Regular.otf")),
    fs.stat(path.join(fontDirectory, "NotoSansCJKsc-Bold.otf")),
  ]);

  assert.equal(normalized.fontSize, "large");
  assert.equal(normalized.zhFont, "noto");
  assert.match(app, /const FONT_SIZE_KEY = "task-track-font-size";/);
  assert.match(app, /fontSize: normalizeFontSize\(localStorage\.getItem\(FONT_SIZE_KEY\)\)/);
  assert.match(styles, /url\("\.\/assets\/fonts\/InterVariable\.woff2"\)/);
  assert.match(styles, /url\("\.\/assets\/fonts\/NotoSansCJKsc-Regular\.otf"\)/);
  assert.match(styles, /url\("\.\/assets\/fonts\/NotoSansCJKsc-Bold\.otf"\)/);
  assert.match(styles, /:root\[data-font-size="large"\][\s\S]*--font-scale: 1\.1;/);
  assert.ok(inter.size > 100000);
  assert.ok(noto.size > 10000000);
  assert.ok(notoBold.size > 10000000);
});

test("flow status renders as an independent text-only element", async () => {
  const [styles, app] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
  ]);

  assert.match(app, /class="flow-status-text status-\$\{node\.status\}"/);
  assert.doesNotMatch(app, /class="flow-status status-\$\{node\.status\}"/);
  assert.match(styles, /\.flow-status-text::before,[\s\S]*display: none !important;/);
  assert.match(styles, /\.flow-status-text\s*\{[\s\S]*box-shadow: none;/);
});

test("task repository renders priority without an update timestamp", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8");

  assert.match(app, /class="task-priority-control \$\{task\.priority\}"/);
  assert.doesNotMatch(app, /formatRepositoryStamp/);
  assert.doesNotMatch(app, /<time datetime="\$\{escAttr\(task\.updatedAt\)\}">/);
});

test("task repository follows the approved compact ordering layout", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
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
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
  ]);

  assert.doesNotMatch(app, /<strong>任务分组<\/strong>/);
  assert.doesNotMatch(app, /<div class="section-heading flow-head">[\s\S]*?<h2>处理流<\/h2>/);
  assert.match(styles, /\.task-row\.task-item \{[\s\S]*grid-template-columns: 32px minmax\(0, 1fr\) max-content 16px;[\s\S]*column-gap: 6px;[\s\S]*border-bottom: 0;/);
  assert.match(styles, /\.task-row\.task-item:last-child \{[\s\S]*border-bottom: 0;/);
  assert.match(styles, /\.repository-complete:not\(\.is-checked\)::after \{[\s\S]*display: none;/);
  assert.match(styles, /\.group-panel,[\s\S]*\.task-footer\.sidebar-foot \{[\s\S]*border-top: 0;/);
  assert.match(styles, /\.rail\.sidebar > \.task-footer\.sidebar-foot \{[\s\S]*margin-top: 0;[\s\S]*padding-top: 0;/);
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

  assert.equal(await readTaskData(directory), null);
  const files = await fs.readdir(directory);
  assert.equal(files.some((file) => /^task-data\.corrupt-.+\.json$/.test(file)), true);
  assert.equal(files.includes("task-data.json"), false);
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
  assert.notEqual(tasks[0].id, tasks[1].id);
  assert.notEqual(tasks[0].nodes[0].id, tasks[0].nodes[0].children[0].id);
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

test("node mutation rejects invalid statuses and clears deleted descendant detail", async () => {
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
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
    deleteNode("task_nodes", "parent");
    return {
      status,
      selectedNodeId: state.selectedNodeId,
      recordDraft: state.recordDraft,
      nodes: state.tasks[0].nodes
    };
  })()`);

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
