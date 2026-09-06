const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "app/renderer/src/work-rhythm-refine.js"), "utf8");
const css = fs.readFileSync(path.join(root, "app/renderer/src/work-rhythm-refine.css"), "utf8");
const baseJs = fs.readFileSync(path.join(root, "app/renderer/src/work-rhythm.js"), "utf8");
const html = fs.readFileSync(path.join(root, "app/renderer/index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("focused current-stage surface keeps the agreed hierarchy", () => {
  assert.match(js, /记录恢复卡/);
  assert.match(js, /data-wr3-timeline/);
  assert.match(js, /data-wr3-settings/);
  assert.match(js, /下一阶段/);
  assert.doesNotMatch(js, /打开主任务/);
});

test("timeline and settings use the selected compact structures", () => {
  assert.match(css, /\.wr3-timeline-row/);
  assert.match(css, /\.wr3-settings-group/);
  assert.doesNotMatch(js, /wr2-summary|wr2-timeline-backdrop/);
});

test("boundary states keep one primary action and a stable footer", () => {
  assert.match(js, /离开屏幕，休息一下/);
  assert.match(js, /收好现场，今天到这里/);
  assert.match(js, /明日可从恢复卡继续/);
  assert.match(js, /wr3-remaining.*is-empty/);
});

test("advanced access and disable share the base storage contract", () => {
  assert.match(baseJs, /data-wr-advanced/);
  assert.match(baseJs, /data-wr-settings-advanced/);
  assert.match(baseJs, /data-wr-settings-unlock/);
  assert.match(baseJs, /loop-work-rhythm:disable/);
  assert.match(js, /loop-work-rhythm-v1:enabled/);
  assert.doesNotMatch(js, /personal-task-track\.work-rhythm/);
});

test("motion is directional, interruptible, and reduced-motion aware", () => {
  assert.match(js, /getAnimations\(\).*cancel/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(css, /translateX\(-50%\) translateY\(-12px\)/);
  assert.match(css, /wr4-panel-fade 120ms/);
});

test("release version and cache keys are aligned", () => {
  assert.equal(pkg.version, "0.1.168");
  assert.match(html, /work-rhythm-refine\.css\?v=0\.1\.168/);
  assert.match(html, /work-rhythm-refine\.js\?v=0\.1\.168/);
});
