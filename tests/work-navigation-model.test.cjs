const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../app/renderer/src/work-navigation-model.js");
const { normalizeTaskData } = require("../app/main/storage.cjs");

function at(iso) { return new Date(iso); }
function navigation(iso = "2026-09-08T09:00:00") { return model.defaultWorkNavigation(at(iso)); }

test("default schedule contains exactly the five broad agreed phases", () => {
  assert.deepEqual(model.DEFAULT_PHASES.map(({ label, start, end }) => [label, start, end]), [
    ["今日启动", "09:40", "09:55"], ["上午工作", "09:55", "11:40"],
    ["下午工作", "13:40", "16:30"], ["个人成长", "16:30", "17:40"],
    ["今日收束", "17:40", "18:10"],
  ]);
  assert.equal(model.validatePhaseSchedule(model.DEFAULT_PHASES).valid, true);
});

test("phase engine handles active phases, gaps, manual expiry and cross-day runtime", () => {
  const nav = navigation();
  assert.equal(model.resolvePhase(at("2026-09-08T10:20:00"), nav).phase.id, "morning-work");
  assert.equal(model.resolvePhase(at("2026-09-08T12:20:00"), nav).mode, "gap");
  nav.runtime.manualPhaseId = "growth";
  nav.runtime.manualPhaseExpiresAt = "2026-09-08T13:40:00";
  assert.equal(model.resolvePhase(at("2026-09-08T12:30:00"), nav).manual, true);
  const tomorrow = model.normalizeWorkNavigation(nav, { now: at("2026-09-09T09:00:00") });
  assert.equal(tomorrow.runtime.manualPhaseId, "");
  assert.equal(tomorrow.runtime.activeWorkTaskId, "");
  assert.equal(tomorrow.runtime.workAdvancePaused, false);
});

test("Today work candidates are unlimited, ordered, unfinished and exclude growth source", () => {
  const tasks = Array.from({ length: 40 }, (_, index) => ({ id: `t${index}`, status: "active", groupId: index === 4 ? "growth" : "work" }));
  tasks[7].status = "done";
  const ids = tasks.map((task) => task.id);
  const result = model.resolveWorkCandidates({ tasks, todayTaskIds: ids, sourceGroupId: "growth" });
  assert.equal(result.length, 38);
  assert.deepEqual(result.slice(0, 5).map((task) => task.id), ["t0", "t1", "t2", "t3", "t5"]);
});

test("growth candidates follow group order and resume active task when it still exists", () => {
  const tasks = [{ id: "b", groupId: "g", status: "active", order: 2 }, { id: "a", groupId: "g", status: "active", order: 1 }, { id: "x", groupId: "other", status: "active", order: 0 }];
  const candidates = model.resolveGrowthCandidates(tasks, "g");
  assert.deepEqual(candidates.map((task) => task.id), ["a", "b"]);
  assert.equal(model.resolveActiveTask(candidates, "b").id, "b");
  assert.equal(model.resolveActiveTask(candidates, "missing").id, "a");
});

test("manual continuation pauses survive normalization without losing growth state", () => {
  const nav = navigation();
  nav.runtime.activeGrowthTaskId = "growth-2";
  nav.runtime.workAdvancePaused = true;
  nav.runtime.growthAdvancePaused = true;
  const normalized = model.normalizeWorkNavigation(nav, { now: at("2026-09-08T10:00:00") });
  assert.equal(normalized.runtime.activeGrowthTaskId, "growth-2");
  assert.equal(normalized.runtime.workAdvancePaused, true);
  assert.equal(normalized.runtime.growthAdvancePaused, true);
});

test("next action prefers blocked node, then open node, recovery and description", () => {
  assert.equal(model.resolveNextAction({ nodes: [{ title: "先解除阻塞", status: "blocked" }, { title: "普通节点", status: "todo" }] }), "先解除阻塞");
  assert.equal(model.resolveNextAction({ nodes: [{ title: "普通节点", status: "todo" }] }), "普通节点");
  assert.equal(model.resolveNextAction({ navigationRecovery: { nextAction: "继续跑实验" } }), "继续跑实验");
  assert.equal(model.resolveNextAction({ description: "# 阅读 RDMA CM\n更多" }), "阅读 RDMA CM");
});

test("weekend growth supports manual start and configurable duration", () => {
  const nav = navigation("2026-09-12T09:00:00");
  let state = model.resolvePhase(at("2026-09-12T09:00:00"), nav);
  assert.equal(state.mode, "weekend-ready");
  assert.equal(state.remainingMinutes, 240);
  nav.runtime.weekendStartedAt = "2026-09-12T09:00:00";
  state = model.resolvePhase(at("2026-09-12T10:00:00"), nav);
  assert.equal(state.mode, "active");
  assert.equal(state.remainingMinutes, 180);
});

test("learning plan validates atomically and deduplicates by planId plus itemId", () => {
  const plan = { schemaVersion: 1, type: "loop-learning-plan", plan: { id: "rdma-v1", title: "RDMA", targetGroup: "个人成长 · RDMA" }, tasks: [
    { itemId: "01", title: "概念", estimateMinutes: 30, nodes: [{ title: "阅读", order: 1 }] },
    { itemId: "02", title: "实验", estimateMinutes: 60 },
  ] };
  const preview = model.previewLearningPlanImport(plan, [{ origin: { kind: "learning-plan", planId: "rdma-v1", itemId: "01" } }]);
  assert.equal(preview.valid, true);
  assert.equal(preview.newTasks.length, 1);
  assert.equal(preview.existingTasks.length, 1);
  assert.equal(preview.totalMinutes, 60);
  const invalid = structuredClone(plan); invalid.tasks[1].title = "";
  assert.equal(model.validateLearningPlan(invalid).valid, false);
});

test("legacy disk data migrates to v2 with safe navigation and task metadata", () => {
  const normalized = normalizeTaskData({ version: 1, tasks: [{ id: "t", title: "旧任务" }], taskGroups: [{ id: "g", title: "默认", order: 1 }] });
  assert.equal(normalized.version, 2);
  assert.equal(normalized.workNavigation.schemaVersion, 1);
  assert.equal(normalized.tasks[0].estimateMinutes, 0);
  assert.equal(normalized.tasks[0].origin, null);
  assert.deepEqual(normalized.tasks[0].navigationRecovery, { updatedAt: "", progress: "", nextAction: "", evidenceRef: "" });
});
