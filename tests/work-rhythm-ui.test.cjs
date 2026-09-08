const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "app/renderer/src/work-rhythm.js"), "utf8");
const css = fs.readFileSync(path.join(root, "app/renderer/src/work-rhythm.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app/renderer/src/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "app/renderer/index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("navigation is a minimal projection over LOOP tasks", () => {
  assert.match(js, /LoopWorkNavigationBridge/);
  assert.match(js, /工作与个人成长导航/);
  assert.match(js, /wr-current-task/);
  assert.match(js, /完成并继续/);
  assert.doesNotMatch(js, /今日时间轴|固定模板|导出给 ChatGPT|节奏方案/);
  assert.doesNotMatch(js, /work queue|learning queue|学习任务队列/);
});

test("Today selection is unlimited and can explicitly add an existing task", () => {
  assert.match(js, /今日任务不设数量上限/);
  assert.match(js, /data-add-today/);
  assert.match(js, /addToToday:/);
  assert.doesNotMatch(js, /slice\(0,\s*3\)/);
});

test("startup offers yesterday only as an unselected suggestion", () => {
  assert.match(js, /previousRecoveryTask/);
  assert.match(js, /昨日续接建议 · 不会自动选中/);
  assert.match(js, /选择首个任务/);
});

test("work and growth use the same compact controller with phase-specific actions", () => {
  assert.match(js, /type === "work"/);
  assert.match(js, /type === "growth"/);
  assert.match(js, /保存进度/);
  assert.match(js, /配置学习来源/);
  assert.match(js, /start-weekend/);
  assert.match(js, /等待选择下一项学习任务/);
  assert.match(js, /data-wr-pick-growth/);
  assert.match(app, /workAdvancePaused = !autoAdvance/);
  assert.match(js, /secondary\.slice\(0, 2\)/);
});

test("manual phase changes expire at the next configured boundary", () => {
  assert.match(js, /nextBoundaryAt/);
  assert.match(js, /manualPhaseExpiresAt/);
  assert.match(js, /恢复自动切换/);
});

test("settings expose only schedule, sources and continuation policy", () => {
  assert.match(js, /data-settings-advanced-slot/);
  assert.match(js, /五个阶段/);
  assert.match(js, /学习任务来源/);
  assert.match(js, /周末学习时长/);
  assert.match(js, /工作完成后自动顺移/);
  assert.match(js, /学习完成后自动顺移/);
  assert.match(js, /verifyPassword/);
});

test("learning plan import validates and previews before atomic bridge import", () => {
  assert.match(js, /previewLearningPlanImport/);
  assert.match(js, /确认导入/);
  assert.match(js, /新增 .* 已存在/);
  assert.match(app, /origin: \{ kind: "learning-plan", planId, itemId: item\.itemId \}/);
  assert.match(app, /importLearningPlan/);
});

test("recovery stays on the original task and responsive styles preserve one primary action", () => {
  assert.match(app, /task\.navigationRecovery/);
  assert.match(js, /saveRecovery\(card\.dataset\.wrRecoveryTask/);
  assert.match(js, /\[data\.activeWorkTaskId, data\.activeGrowthTaskId\]/);
  assert.match(css, /\.wr-nav-actions \.primary/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test("release version, scripts and cache keys are aligned", () => {
  assert.equal(pkg.version, "0.1.177");
  assert.match(html, /work-navigation-model\.js\?v=0\.1\.177/);
  assert.match(html, /work-rhythm\.css\?v=0\.1\.177/);
  assert.match(html, /work-rhythm\.js\?v=0\.1\.177/);
  assert.doesNotMatch(html, /work-rhythm-refine/);
});
