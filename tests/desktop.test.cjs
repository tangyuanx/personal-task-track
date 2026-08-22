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
} = require("../app/main/storage.cjs");
const {
  applyTodayWidgetTopmost,
  cornerWindowBounds,
  normalizeSnapshot,
  normalizeTodayWidgetAppearance,
  normalizeTodayWidgetPreferences,
  readTodayWidgetPreferences,
  writeTodayWidgetPreferences,
} = require("../app/main/today-widget.cjs");

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
    .readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8")
    .then((source) => {
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

  assert.match(styles, /\.today-focus\s*\{[\s\S]*linear-gradient\(135deg, color-mix\(in srgb, var\(--focus\) 16%/);
  assert.match(widget, /--widget-bg:\s*\n\s*linear-gradient\(135deg, color-mix\(in srgb, var\(--widget-focus\) 16%/);
  assert.match(widget, /--widget-task-bg:\s*var\(--widget-glass-soft\)/);
  assert.match(widget, /\.today-widget\s*\{[\s\S]*background:\s*var\(--widget-bg\)/);
  assert.match(widget, /\.today-task\s*\{[\s\S]*background:\s*var\(--widget-task-bg\)/);
});

test("settings expose the confirmed application update flow without silent install controls", async () => {
  const [app, styles, preload, updater] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "preload.cjs"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "main", "updater.cjs"), "utf8"),
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
  const downloaded = harness.evaluate(`(() => {
    appUpdateState = normalizeAppUpdateState({ status: "downloaded", supported: true, currentVersion: "0.1.109", version: "0.1.110" });
    return renderUpdateSettingsControls();
  })()`);

  assert.match(app, /<h3 id="software-update-title">软件更新<\/h3>/);
  assert.match(available, /自动检查更新/);
  assert.match(available, /v0\.1\.110 可用/);
  assert.match(available, /data-update-action="download">下载更新/);
  assert.match(downloaded, /data-update-action="install">重启并更新/);
  assert.match(styles, /\.settings-update-progress span\s*\{[\s\S]*background:\s*var\(--focus\);/);
  assert.match(preload, /app-update:get-state/);
  assert.match(updater, /autoDownload = false/);
  assert.match(updater, /autoInstallOnAppQuit = false/);
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
  assert.match(verifier, /references missing artifact/);
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
    customBounds: null,
  });
  assert.deepEqual(normalizeTodayWidgetPreferences({
    position: "custom",
    alwaysOnTop: false,
    launchWithApp: false,
    visible: false,
    compact: true,
    customBounds: { x: 321.7, y: 48.2 },
  }), {
    position: "custom",
    alwaysOnTop: false,
    launchWithApp: false,
    visible: false,
    compact: true,
    customBounds: { x: 322, y: 48 },
  });
  assert.equal(normalizeTodayWidgetPreferences({ position: "custom" }).position, "top-right");
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
  });
  const read = await readTodayWidgetPreferences(directory);

  assert.deepEqual(read, written);
  assert.equal(read.position, "bottom-left");
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
  assert.match(demo, /隐藏今日窗口/);
  assert.match(demo, /body\.widget-runtime \.today-widget/);
  assert.match(demo, /class="compact-expand-icon"/);
  assert.match(demo, /\.today-widget\.is-compact \.compact-expand-icon\s*\{\s*display:\s*block;/);
  assert.doesNotMatch(demo, /\.today-widget\.is-compact \.widget-menu[^}]*display:\s*none;/);
  assert.match(runtime, /bridge\.completeTask/);
  assert.match(runtime, /bridge\.openMain/);
  assert.match(runtime, /ResizeObserver/);
  assert.doesNotMatch(runtime, /\+ 60/);
  assert.match(runtime, /width: widget\.offsetWidth/);
  assert.match(runtime, /function applyAppearance/);
  assert.match(runtime, /document\.documentElement\.dataset\.zhFont/);
  assert.match(runtime, /--widget-font-scale/);
  assert.match(widgetMain, /frame: false/);
  assert.match(widgetMain, /transparent: true/);
  assert.match(widgetMain, /hasShadow: false/);
  assert.match(widgetMain, /sandbox: true/);
  assert.match(widgetMain, /type: process\.platform === "darwin" \? "panel" : undefined/);
  assert.match(widgetMain, /visibleOnFullScreen: topmost/);
  assert.match(widgetMain, /skipTransformProcessType: true/);
  assert.match(widgetMain, /setAlwaysOnTop[\s\S]*"screen-saver"/);
  assert.match(widgetMain, /moveTop\(\)/);
  assert.match(widgetMain, /getDisplayMatching/);
  assert.match(widgetMain, /function stop\(\)[\s\S]*widgetWindow\.destroy\(\)/);
  assert.match(appMain, /if \(!isQuitting\) app\.quit\(\)/);
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

test("flow status renders as an independent text-only element", async () => {
  const [styles, app] = await Promise.all([
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "styles.css"), "utf8"),
    fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8"),
  ]);

  assert.match(app, /class="flow-status-text status-\$\{node\.status\}"/);
  assert.doesNotMatch(app, /class="flow-status status-\$\{node\.status\}"/);
  assert.match(styles, /\.flow-status-text::before,[\s\S]*display: none !important;/);
  assert.match(styles, /\.flow-status-text\s*\{[\s\S]*box-shadow: none;/);
});

test("task repository renders priority without an update timestamp", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");

  assert.match(app, /class="task-priority-control \$\{task\.priority\}"/);
  assert.doesNotMatch(app, /formatRepositoryStamp/);
  assert.doesNotMatch(app, /<time datetime="\$\{escAttr\(task\.updatedAt\)\}">/);
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
  assert.equal(result.snapshot.items.length, 3);
  assert.equal(result.snapshot.items[0].nextText, "解除阻塞");
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

test("calendar filter composes with task status and leaves existing preferences unchanged", async () => {
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
  assert.match(finalRules, /\.brief-strip\.task-brief\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*min-height:\s*94px;/);
  assert.match(finalRules, /\.brief-cell\.brief-field,[\s\S]*border-bottom:\s*1px solid/);
  assert.match(finalRules, /\.brief-label \.brief-stamp\s*\{[\s\S]*display:\s*none;/);
});

test("group and node mutations do not steal repository title focus", async () => {
  const app = await fs.readFile(path.join(__dirname, "..", "app", "renderer", "src", "app.js"), "utf8");
  assert.doesNotMatch(app, /window\.setTimeout\(render, 0\)/);
  assert.match(app, /\.task-check, input, textarea, select, button, \[contenteditable\]/);
  assert.match(app, /event\.relatedTarget\?\.closest\?\.\("\.task-title, \.page-title"\)/);
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
