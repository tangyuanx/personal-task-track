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
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
  ]);

  assert.match(styles, /--app-font:\s*var\(--zh-font\),\s*var\(--en-font\),\s*sans-serif;/);
  assert.doesNotMatch(app, /横向滚动\s*·\s*双击重命名/);
});

test("bundled cross-platform fonts are available", async () => {
  const [app, styles, normalized] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
    Promise.resolve(normalizeTaskData({ zhFont: "noto", enFont: "inter" })),
  ]);
  const fontDirectory = path.join(__dirname, "..", "src", "assets", "fonts");
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
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
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

test("repository and task page omit redundant section labels", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8");

  assert.doesNotMatch(app, /<span>任务仓库<\/span>/);
  assert.doesNotMatch(app, /class="page-kicker kicker">工作台<\/div>/);
  assert.match(app, /双击左侧任务列表的空白区域，即可创建新的处理流。/);
});

test("sidebar resize keeps a broad transparent hit area with a one-pixel visible divider", async () => {
  const styles = await fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8");
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

test("search filters repository rows without switching the active task", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8");
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

test("calendar filter composes with task status and leaves existing preferences unchanged", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    state.taskGroups = [{ id: "group_inbox", title: "默认", order: 1 }];
    state.activeGroupId = "group_inbox";
    state.query = "";
    state.priorityFilter = "all";
    state.taskDateFilter = "2026-08-12";
    state.tasks = normalizeTasks([
      { id: "active_match", title: "当日未完成", status: "active", updatedAt: new Date(2026, 7, 12, 10).toISOString(), nodes: [] },
      { id: "done_match", title: "当日已完成", status: "done", updatedAt: new Date(2026, 7, 12, 18).toISOString(), nodes: [] },
      { id: "other_day", title: "其他日期", status: "active", updatedAt: new Date(2026, 7, 11, 10).toISOString(), nodes: [] }
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
  assert.match(app, /popovertarget="task-date-filter-popover"/);
  assert.match(app, /最后活动日期/);
  assert.doesNotMatch(app, /taskDateFilter:\s*state\.taskDateFilter/);
  assert.match(styles, /anchor-name:\s*--task-calendar-filter;/);
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
    weekday: 5,
    time: "08:30",
    lastCompletedOccurrence: "",
  });

  const harness = await rendererHarness();
  const result = harness.json(`(() => {
    const fridayMorning = new Date(2026, 7, 14, 8, 29);
    const fridayDue = new Date(2026, 7, 14, 8, 30);
    const saturdayDue = new Date(2026, 7, 15, 9, 0);
    const weekly = normalizeTasks([{ id: "weekly", recurrence: { frequency: "weekly", weekday: 5, time: "08:30" }, nodes: [] }])[0];
    const daily = normalizeTasks([{ id: "daily", status: "done", recurrence: { frequency: "daily", time: "09:00", lastCompletedOccurrence: "2026-08-14" }, nodes: [] }])[0];
    state.tasks = [daily];
    const changed = syncRecurringTasks(saturdayDue);
    return {
      before: isRecurringTaskDue(weekly, fridayMorning),
      due: isRecurringTaskDue(weekly, fridayDue),
      wrongDay: isRecurringTaskDue(weekly, saturdayDue),
      dailyStatus: daily.status,
      changed,
      key: recurringOccurrenceKey(daily, saturdayDue),
    };
  })()`);

  assert.equal(result.before, false);
  assert.equal(result.due, true);
  assert.equal(result.wrongDay, false);
  assert.equal(result.dailyStatus, "active");
  assert.equal(result.changed, true);
  assert.equal(result.key, "2026-08-15");
});

test("recurrence controls feed every Today surface and refresh while the app stays open", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8");
  assert.match(app, /data-recurrence-field="frequency"/);
  assert.match(app, /data-recurrence-field="weekday"/);
  assert.match(app, /data-recurrence-field="time"/);
  assert.match(app, /state\.taskFilter === "today" && !isTaskScheduledForToday\(task\)/);
  assert.match(app, /\.filter\(\(task\) => isTaskScheduledForToday\(task\)\)/);
  assert.match(app, /window\.setInterval\?\.\([\s\S]*?30000/);
});

test("group and node mutations do not steal repository title focus", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8");
  assert.doesNotMatch(app, /window\.setTimeout\(render, 0\)/);
  assert.match(app, /\.task-check, input, textarea, select, button, \[contenteditable\]/);
  assert.match(app, /event\.relatedTarget\?\.closest\?\.\("\.task-title, \.page-title"\)/);
});

test("flow title and record widths share a bounded accessible splitter", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
  ]);
  const harness = await rendererHarness();
  const widths = harness.json(`(() => {
    state.flowWidths = { title: 360, note: 330 };
    setFlowSplitTitleWidth(500, null);
    const first = { ...state.flowWidths };
    setFlowSplitTitleWidth(900, null);
    return { first, clamped: { ...state.flowWidths } };
  })()`);
  const finalFlowRules = styles.slice(styles.lastIndexOf("Keep persisted flow split widths authoritative"));

  assert.deepEqual(widths.first, { title: 500, note: 190 });
  assert.deepEqual(widths.clamped, { title: 510, note: 180 });
  assert.match(app, /role="separator"[^>]+data-flow-split-resizer/);
  assert.match(app, /handleFlowSplitKeydown/);
  assert.match(styles, /\.flow-split-resizer\s*\{[\s\S]*?width:\s*15px;/);
  assert.match(finalFlowRules, /var\(--flow-title-width, 360px\)/);
  assert.match(finalFlowRules, /var\(--flow-note-width, 330px\)/);
});

test("knowledge images keep the caret beside the inline image node", async () => {
  const [entry, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "src", "milkdown-editor.entry.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8"),
  ]);
  const inlineImageRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror \.milkdown-image-inline\s*\{([\s\S]*?)\}/)?.[1] || "";
  const imageRule = styles.match(/\.task-knowledge-editor-panel \.ProseMirror \.milkdown-image-inline > \.image-inline\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(entry, /insertImageCommand/);
  assert.match(inlineImageRule, /max-width:\s*calc\(100% - 2px\);/);
  assert.match(inlineImageRule, /vertical-align:\s*bottom;/);
  assert.match(imageRule, /display:\s*inline-block;/);
  assert.match(imageRule, /vertical-align:\s*bottom;/);
  assert.doesNotMatch(styles, /\.task-knowledge-editor-panel \.ProseMirror img\s*\{[\s\S]*?display:\s*block;/);
});

test("knowledge lists and code use compact document-like presentation", async () => {
  const styles = await fs.readFile(path.join(__dirname, "..", "src", "styles.css"), "utf8");
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
  const entry = await fs.readFile(path.join(__dirname, "..", "src", "milkdown-editor.entry.js"), "utf8");

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
