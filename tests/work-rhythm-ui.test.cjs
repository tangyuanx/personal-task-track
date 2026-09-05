const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "app/renderer/src/work-rhythm-refine.js"), "utf8");
const css = fs.readFileSync(path.join(root, "app/renderer/src/work-rhythm-refine.css"), "utf8");
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

test("release version and cache keys are aligned", () => {
  assert.equal(pkg.version, "0.1.163");
  assert.match(html, /work-rhythm-refine\.css\?v=0\.1\.163/);
  assert.match(html, /work-rhythm-refine\.js\?v=0\.1\.163/);
});
