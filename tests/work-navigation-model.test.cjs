const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../app/renderer/src/work-navigation-model.js");
const { normalizeTaskData } = require("../app/main/storage.cjs");

function at(iso) { return new Date(iso); }
function navigation(iso = "2026-09-08T09:00:00") { return model.defaultWorkNavigation(at(iso)); }

test("default schedule protects work, rest, transition and one hour of learning", () => {
  assert.deepEqual(model.DEFAULT_PHASES.map(({ label, start, end }) => [label, start, end]), [
    ["上午工作", "09:40", "11:50"], ["午间休息", "11:50", "13:40"],
    ["下午工作", "13:40", "15:15"], ["休息缓冲", "15:15", "15:30"],
    ["深度工作", "15:30", "17:00"], ["学习过渡", "17:00", "17:10"],
    ["个人成长", "17:10", "18:10"],
  ]);
  assert.equal(model.validateSchedule(model.DEFAULT_SCHEDULE).valid, true);
  assert.equal(model.minutes(model.DEFAULT_SCHEDULE.learningEnd) - model.minutes(model.DEFAULT_SCHEDULE.learningStart), 60);
});

test("Friday replaces the afternoon break with the fixed weekly meeting", () => {
  const nav = navigation("2026-09-11T09:00:00");
  const phases = model.phasesForDate(nav, at("2026-09-11T14:00:00"));
  assert.deepEqual(phases.map(({ id, start, end }) => [id, start, end]), [
    ["morning-work", "09:40", "11:50"], ["lunch", "11:50", "13:40"],
    ["afternoon-work", "13:40", "15:00"], ["friday-meeting", "15:00", "16:00"],
    ["deep-work", "16:00", "17:00"], ["transition", "17:00", "17:10"],
    ["growth", "17:10", "18:10"],
  ]);
  assert.equal(model.resolvePhase(at("2026-09-11T15:30:00"), nav).phase.type, "meeting");
});

test("schedule validation rejects overlap, invalid Friday meetings and learning under 60 minutes", () => {
  assert.equal(model.validateSchedule({ ...model.DEFAULT_SCHEDULE, restEnd: "15:10" }).valid, false);
  assert.equal(model.validateSchedule({ ...model.DEFAULT_SCHEDULE, fridayMeetingStart: "13:00" }).valid, false);
  const short = model.validateSchedule({ ...model.DEFAULT_SCHEDULE, learningEnd: "17:40" });
  assert.equal(short.valid, false);
  assert.match(short.errors.at(-1).message, /60 分钟/);
});

test("phase engine handles active breaks, manual expiry and cross-day queue reset", () => {
  const nav = navigation();
  assert.equal(model.resolvePhase(at("2026-09-08T10:20:00"), nav).phase.id, "morning-work");
  assert.equal(model.resolvePhase(at("2026-09-08T12:20:00"), nav).phase.id, "lunch");
  nav.runtime.manualPhaseId = "growth";
  nav.runtime.manualPhaseExpiresAt = "2026-09-08T13:40:00";
  nav.runtime.workQueueIds = ["a", "b"];
  assert.equal(model.resolvePhase(at("2026-09-08T12:30:00"), nav).manual, true);
  const tomorrow = model.normalizeWorkNavigation(nav, { now: at("2026-09-09T09:00:00") });
  assert.equal(tomorrow.runtime.manualPhaseId, "");
  assert.deepEqual(tomorrow.runtime.workQueueIds, []);
  assert.equal(tomorrow.runtime.activeWorkTaskId, "");
});

test("work queue includes all unfinished non-learning tasks in deterministic priority buckets", () => {
  const tasks = [
    { id: "other", status: "active", groupId: "work", priority: "low", order: 1 },
    { id: "today-high", status: "active", groupId: "work", priority: "high", order: 2 },
    { id: "today-due", status: "active", groupId: "work", priority: "medium", order: 3, deadlineAt: "2026-09-08T18:00:00" },
    { id: "overdue", status: "active", groupId: "work", priority: "low", order: 4, deadlineAt: "2026-09-07T18:00:00" },
    { id: "growth", status: "active", groupId: "growth", priority: "high", order: 5 },
    { id: "done", status: "done", groupId: "work", priority: "high", order: 6 },
    { id: "blocked", status: "active", groupId: "work", tags: { blocked: true }, order: 7 },
  ];
  const result = model.resolveWorkCandidates({ tasks, todayTaskIds: ["today-high", "today-due"], sourceGroupId: "growth", now: at("2026-09-08T10:00:00") });
  assert.deepEqual(result.map((task) => task.id), ["overdue", "today-due", "today-high", "other"]);
});

test("learning candidates follow configured group order without task identity labels", () => {
  const tasks = [{ id: "b", groupId: "g", status: "active", order: 2 }, { id: "a", groupId: "g", status: "active", order: 1 }, { id: "x", groupId: "other", status: "active", order: 0 }];
  const candidates = model.resolveGrowthCandidates(tasks, "g");
  assert.deepEqual(candidates.map((task) => task.id), ["a", "b"]);
  assert.equal(model.resolveActiveTask(candidates, "b").id, "b");
});

test("saved queue order is reconciled while new tasks append deterministically", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(model.reconcileQueueIds(candidates, ["b", "gone", "a", "b"]), ["b", "a", "c"]);
});

test("queue runtime and manual continuation survive same-day normalization", () => {
  const nav = navigation();
  nav.runtime.activeGrowthTaskId = "growth-2";
  nav.runtime.workQueueIds = ["work-2", "work-1"];
  nav.runtime.growthQueueIds = ["growth-2", "growth-1"];
  nav.runtime.blockedTaskIds = ["blocked-1"];
  const normalized = model.normalizeWorkNavigation(nav, { now: at("2026-09-08T10:00:00") });
  assert.deepEqual(normalized.runtime.workQueueIds, ["work-2", "work-1"]);
  assert.deepEqual(normalized.runtime.growthQueueIds, ["growth-2", "growth-1"]);
  assert.deepEqual(normalized.runtime.blockedTaskIds, ["blocked-1"]);
});

test("weekend growth defaults to the same one-hour minimum and supports manual start", () => {
  const nav = navigation("2026-09-12T09:00:00");
  let state = model.resolvePhase(at("2026-09-12T09:00:00"), nav);
  assert.equal(state.mode, "weekend-ready");
  assert.equal(state.remainingMinutes, 60);
  nav.runtime.weekendStartedAt = "2026-09-12T09:00:00";
  state = model.resolvePhase(at("2026-09-12T09:20:00"), nav);
  assert.equal(state.remainingMinutes, 40);
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
});

test("legacy disk data migrates to safe navigation schema and task metadata", () => {
  const normalized = normalizeTaskData({ version: 1, tasks: [{ id: "t", title: "旧任务" }], taskGroups: [{ id: "g", title: "默认", order: 1 }] });
  assert.equal(normalized.version, 2);
  assert.equal(normalized.workNavigation.schemaVersion, 2);
  assert.deepEqual(normalized.workNavigation.config.schedule, model.DEFAULT_SCHEDULE);
  assert.deepEqual(normalized.tasks[0].navigationRecovery, { updatedAt: "", progress: "", nextAction: "", evidenceRef: "" });
});
