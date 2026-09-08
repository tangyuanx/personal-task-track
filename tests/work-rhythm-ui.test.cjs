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

test("top navigation remains a centered phase-and-time pill", () => {
  assert.match(js, /work-rhythm-rail/);
  assert.match(js, /work-rhythm-pill/);
  assert.match(js, /view\.label/);
  assert.match(js, /timeHint\(view\.state\)/);
  assert.doesNotMatch(js, /wr-current-task/);
  assert.match(css, /\.work-rhythm-rail\{height:34px;min-height:34px;display:flex;align-items:center;justify-content:center/);
});

test("current detail uses accessible SVG icons for schedule, queue and settings", () => {
  assert.match(js, /function icon\(name\)/);
  assert.match(js, /aria-label="全天安排" title="全天安排">\$\{icon\("calendar"\)\}/);
  assert.match(js, /aria-label="任务队列" title="任务队列">\$\{icon\("queue"\)\}/);
  assert.match(js, /aria-label="导航设置" title="导航设置">\$\{icon\("settings"\)\}/);
  assert.match(js, /stroke-width="1\.8"/);
  assert.match(css, /\.wr-icon-button svg\{width:16px;height:16px\}/);
});

test("work and learning share one-at-a-time queue controls", () => {
  assert.match(js, /工作队列/);
  assert.match(js, /学习队列/);
  assert.match(js, /跳过一次/);
  assert.match(js, /移至末尾/);
  assert.match(js, /data-wr-queue-action="block"/);
  assert.match(js, /完成并继续/);
  assert.match(js, /data-wr-choose-task/);
  assert.match(js, /bridge\.blockTask/);
  assert.match(app, /blockTaskFromNavigation/);
  assert.doesNotMatch(js, /保存进度|保存恢复卡/);
});

test("paused breaks and meetings keep queues read-only", () => {
  assert.match(js, /type === "break" \|\| type === "meeting"/);
  assert.match(js, /当前阶段仅可查看队列/);
  assert.match(js, /fixed|固定阶段结束后自动恢复/);
  assert.match(js, /interactive && queue\.length/);
});

test("settings expose editable daily boundaries, Friday meeting and learning source", () => {
  assert.match(js, /data-wr-schedule="\$\{key\}"/);
  assert.match(js, /fridayMeetingStart/);
  assert.match(js, /fridayMeetingEnd/);
  assert.match(js, /学习来源/);
  assert.match(js, /data-wr-growth-source/);
  assert.match(js, /validateSchedule/);
  assert.match(js, /每日学习至少 60 分钟/);
  assert.match(js, /data-settings-advanced-slot/);
});

test("queue persistence and candidate selection are bridged to the task repository", () => {
  assert.match(app, /workQueueIds/);
  assert.match(app, /growthQueueIds/);
  assert.match(app, /reconcileQueueIds/);
  assert.match(app, /deadlineAt: task\.deadlineAt/);
  assert.match(app, /blockedTaskIds/);
  assert.match(app, /completeTaskFromNavigation/);
});

test("overlay focus, Escape and reduced motion remain accessible", () => {
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /event\.key === "Escape"/);
  assert.match(js, /event\.key === "Tab"/);
  assert.match(js, /restoreFocus/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test("release version, scripts and cache keys are aligned", () => {
  assert.equal(pkg.version, "0.1.178");
  assert.match(html, /work-navigation-model\.js\?v=0\.1\.178/);
  assert.match(html, /work-rhythm\.css\?v=0\.1\.178/);
  assert.match(html, /work-rhythm\.js\?v=0\.1\.178/);
});
