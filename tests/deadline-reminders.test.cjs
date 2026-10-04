const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createDeadlineReminderController,
  deadlineReminderGroups,
  deadlineReminderKey,
  deadlineReminderStage,
  normalizeReminderTasks,
  normalizeReminderState,
  reconcileDeadlineReminderState,
  reminderCopy,
  reminderStateFilePath,
} = require("../app/main/deadline-reminders.cjs");

class FakeNotification extends EventEmitter {
  static instances = [];
  static failNext = false;
  static isSupported() { return true; }

  constructor(options) {
    super();
    this.options = options;
    this.shown = false;
    FakeNotification.instances.push(this);
  }

  show() {
    if (FakeNotification.failNext) {
      FakeNotification.failNext = false;
      const error = new Error("notification unavailable");
      error.code = "NOTIFICATION_UNAVAILABLE";
      throw error;
    }
    this.shown = true;
  }
}

function createHarness(userDataPath, initialNow = new Date("2026-08-24T02:00:00.000Z")) {
  let clock = initialNow;
  const handlers = new Map();
  const messages = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    showCalled: 0,
    focusCalled: 0,
    show() { this.showCalled += 1; },
    focus() { this.focusCalled += 1; },
    webContents: { send: (...args) => messages.push(args) },
  };
  const controller = createDeadlineReminderController({
    app: { getPath: () => userDataPath },
    Notification: FakeNotification,
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    },
    getMainWindow: () => window,
    ensureMainWindow: () => window,
    now: () => new Date(clock),
  });
  return {
    controller,
    handlers,
    messages,
    window,
    setNow(value) { clock = new Date(value); },
  };
}

test("deadline reminder stages honor each task offset and ignore disabled tasks", () => {
  const now = new Date("2026-08-24T02:00:00.000Z");
  assert.equal(deadlineReminderStage({ status: "active", deadlineAt: "" }, now), "");
  assert.equal(deadlineReminderStage({ status: "done", deadlineAt: "2026-08-24T03:00:00.000Z" }, now), "");
  assert.equal(deadlineReminderStage({ status: "active", deadlineAt: "2026-08-24T03:00:00.000Z", deadlineReminderMinutes: null }, now), "");
  assert.equal(deadlineReminderStage({ status: "active", deadlineAt: "2026-08-25T03:00:00.000Z" }, now), "");
  assert.equal(deadlineReminderStage({ status: "active", deadlineAt: "2026-08-24T04:00:00.000Z", deadlineReminderMinutes: 120 }, now), "upcoming");
  assert.equal(deadlineReminderStage({ status: "active", deadlineAt: "2026-08-24T03:00:00.000Z", deadlineReminderMinutes: 30 }, now), "");
  assert.equal(deadlineReminderStage({ status: "active", deadlineAt: "2026-08-24T01:59:00.000Z" }, now), "overdue");
});

test("successful reminders deduplicate across scans and application restarts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "task-deadline-reminders-"));
  FakeNotification.instances = [];
  const first = createHarness(directory);
  first.controller.registerIpc();
  await first.controller.start({ schedule: false });
  const sync = first.handlers.get("deadline-reminders:sync");
  const tasks = [{ id: "task-a", title: "完成日历功能", status: "active", deadlineAt: "2026-08-24T03:00:00.000Z", deadlineReminderMinutes: 60 }];

  await sync({}, tasks);
  await first.controller.run();
  assert.equal(FakeNotification.instances.length, 1);
  assert.equal(FakeNotification.instances[0].options.title, "任务截止提醒");
  assert.match(FakeNotification.instances[0].options.body, /1 小时内截止/);

  first.setNow("2026-08-24T04:00:00.000Z");
  await first.controller.run();
  await first.controller.run();
  assert.equal(FakeNotification.instances.length, 1);
  await first.controller.stop();

  const persisted = JSON.parse(await fs.readFile(reminderStateFilePath(directory), "utf8"));
  assert.deepEqual(persisted.tasks["task-a"].notifiedMinutes, [60]);

  const second = createHarness(directory, new Date("2026-08-24T04:05:00.000Z"));
  await second.controller.start({ schedule: false });
  await second.controller.sync(tasks);
  await second.controller.run();
  assert.equal(FakeNotification.instances.length, 1);
  await second.controller.stop();
  await fs.rm(directory, { recursive: true, force: true });
});

test("changing a deadline re-arms its configured reminder and disabled reminders stay silent", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "task-deadline-rearm-"));
  FakeNotification.instances = [];
  const harness = createHarness(directory);
  await harness.controller.start({ schedule: false });
  await harness.controller.sync([
    { id: "task-a", title: "两小时提醒", status: "active", deadlineAt: "2026-08-24T04:00:00.000Z", deadlineReminderMinutes: 120 },
    { id: "task-b", title: "不要提醒", status: "active", deadlineAt: "2026-08-24T03:00:00.000Z", deadlineReminderMinutes: null },
  ]);
  assert.equal(FakeNotification.instances.length, 1);

  await harness.controller.sync([
    { id: "task-a", title: "两小时提醒", status: "active", deadlineAt: "2026-08-24T05:00:00.000Z", deadlineReminderMinutes: 120 },
  ]);
  assert.equal(FakeNotification.instances.length, 1);
  harness.setNow("2026-08-24T03:00:00.000Z");
  await harness.controller.run();
  assert.equal(FakeNotification.instances.length, 2);
  await harness.controller.stop();
  await fs.rm(directory, { recursive: true, force: true });
});

test("notification clicks return to one task or the calendar for grouped reminders", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "task-deadline-click-"));
  FakeNotification.instances = [];
  const harness = createHarness(directory);
  await harness.controller.start({ schedule: false });
  await harness.controller.sync([
    { id: "task-a", title: "任务 A", status: "active", deadlineAt: "2026-08-24T03:00:00.000Z" },
  ]);
  FakeNotification.instances[0].emit("click");
  assert.deepEqual(harness.messages.at(-1), ["deadline-reminders:open-task", { taskId: "task-a" }]);

  await harness.controller.sync([
    { id: "task-b", title: "任务 B", status: "active", deadlineAt: "2026-08-24T03:30:00.000Z", deadlineReminderMinutes: 120 },
    { id: "task-c", title: "任务 C", status: "active", deadlineAt: "2026-08-24T03:45:00.000Z", deadlineReminderMinutes: 120 },
  ]);
  FakeNotification.instances.at(-1).emit("click");
  assert.deepEqual(harness.messages.at(-1), ["deadline-reminders:open-calendar", undefined]);
  assert.equal(harness.window.showCalled > 0, true);
  assert.equal(harness.window.focusCalled > 0, true);
  await harness.controller.stop();
  await fs.rm(directory, { recursive: true, force: true });
});


// ------------------------------------------------------------
// Phase19 · 桌面提醒 (frozen Demo loop-desktop-model19.js contract)
// ------------------------------------------------------------

/** Local deadline helper so these cases read like the Demo's model tests. */
function reminderTask(id, minutes, day = "2026-10-02", time = "18:00", patch = {}) {
  return normalizeReminderTasks([{
    id,
    title: `任务${id}`,
    status: "active",
    deadlineAt: new Date(`${day}T${time}:00`).toISOString(),
    deadlineReminderMinutes: minutes,
    ...patch,
  }])[0];
}

function sendAll(tasks, at) {
  const state = normalizeReminderState({});
  deadlineReminderGroups(tasks, at, state).forEach((group) => {
    group.tasks.forEach((task) => {
      const existing = state.tasks[task.id]?.deadlineAt === task.deadlineAt ? state.tasks[task.id].notifiedMinutes : [];
      state.tasks[task.id] = { deadlineAt: task.deadlineAt, notifiedMinutes: [...existing, group.reminderMinutes] };
    });
  });
  return state;
}

test("phase19: reminders group by stage and offset, skipping done and reminder-free tasks", () => {
  const early = reminderTask(1, 60);
  const late = reminderTask(2, 30);
  const finished = reminderTask(3, 30, "2026-10-02", "18:00", { status: "done" });
  const silent = reminderTask(4, null);
  const tasks = [early, late, finished, silent];
  const empty = normalizeReminderState({});

  // 61 minutes before an 18:00 deadline a 60 minute reminder is not due yet
  assert.equal(deadlineReminderGroups(tasks, new Date("2026-10-02T16:59:00"), empty).length, 0);
  // at 17:30 the 60 and 30 minute offsets are due, in their own groups
  const due = deadlineReminderGroups(tasks, new Date("2026-10-02T17:30:00"), empty);
  assert.deepEqual(due.map((group) => [group.stage, group.reminderMinutes, group.tasks.length]), [["upcoming", 60, 1], ["upcoming", 30, 1]]);
  // exactly at the deadline the first group flips to overdue
  assert.equal(deadlineReminderGroups(tasks, new Date("2026-10-02T18:00:00"), empty)[0].stage, "overdue");
});

test("phase19: a sent upcoming offset is not re-sent once overdue, but a changed deadline is", () => {
  const task = reminderTask(1, 60);
  const sent = sendAll([task], new Date("2026-10-02T17:30:00"));
  assert.equal(deadlineReminderGroups([task], new Date("2026-10-02T18:15:00"), sent).length, 0);
  const moved = { ...task, deadlineAt: new Date("2026-10-02T18:45:00").toISOString() };
  assert.equal(deadlineReminderGroups([moved], new Date("2026-10-02T18:15:00"), sent).length, 1);
});

test("phase19: a failed send leaves the reminder available and the copy routes single vs merged", () => {
  const task = reminderTask(1, 60);
  const state = normalizeReminderState({});   // a failure records nothing
  assert.equal(deadlineReminderKey(task), `${task.id}|${task.deadlineAt}|60`);
  assert.equal(deadlineReminderGroups([task], new Date("2026-10-02T17:30:00"), state).length, 1);
  assert.equal(deadlineReminderGroups([task], new Date("2026-10-02T17:30:00"), state).length, 1);

  const single = deadlineReminderGroups([task], new Date("2026-10-02T17:30:00"), state)[0];
  assert.match(reminderCopy(single.stage, single.tasks, single.reminderMinutes).body, /「任务1」/);
  const second = reminderTask(2, 60);
  // a single task is named; several collapse into an "N 项任务" summary
  const merged = deadlineReminderGroups([task, second], new Date("2026-10-02T17:30:00"), state)[0];
  assert.match(reminderCopy(merged.stage, merged.tasks, merged.reminderMinutes).body, /2 项任务/);
  const overdue = deadlineReminderGroups([task], new Date("2026-10-02T18:00:00"), state)[0];
  assert.equal(reminderCopy(overdue.stage, overdue.tasks, overdue.reminderMinutes).title, "任务已到截止时间");
});

test("phase19: completion and reminder changes clear sent records before the next check", () => {
  const task = reminderTask(1, 60);
  const sent = sendAll([task], new Date("2026-10-02T17:30:00"));
  assert.equal(Object.keys(sent.tasks).length, 1);

  // completing the task clears the record
  const done = reconcileDeadlineReminderState([{ ...task, status: "done" }], sent);
  assert.equal(done.changed, true);
  assert.equal(Object.keys(done.state.tasks).length, 0);

  // turning the reminder off clears it as well
  const rearmed = sendAll([task], new Date("2026-10-02T17:30:00"));
  const silent = reconcileDeadlineReminderState([{ ...task, deadlineReminderMinutes: null }], rearmed);
  assert.equal(Object.keys(silent.state.tasks).length, 0);

  // restoring the reminder makes it eligible again
  assert.equal(deadlineReminderGroups([task], new Date("2026-10-02T17:30:00"), silent.state).length, 1);
});


test("phase19: a failed send is reported without marking the offset as notified", async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "loop-reminders-fail-"));
  const harness = createHarness(userDataPath, new Date("2026-10-02T17:30:00"));
  await harness.controller.start({ schedule: false });
  harness.controller.registerIpc();

  FakeNotification.failNext = true;
  const failed = await harness.handlers.get("deadline-reminders:sync")(null, [{
    id: "task_fail", title: "发布校验", status: "active",
    deadlineAt: new Date("2026-10-02T18:00:00").toISOString(), deadlineReminderMinutes: 60,
  }]);
  assert.equal(failed.notified, 0);
  assert.equal(failed.error?.code, "NOTIFICATION_UNAVAILABLE");

  const state = await harness.handlers.get("deadline-reminders:get-state")();
  assert.equal(state.error?.code, "NOTIFICATION_UNAVAILABLE");
  assert.equal(state.pending, 1, "the reminder stays pending after a failure");
  assert.equal(state.delivered.length, 0);

  // the retry succeeds and then the offset is recorded, so it is not re-sent
  const retried = await harness.handlers.get("deadline-reminders:check")();
  assert.equal(retried.outcome.notified, 1);
  assert.equal(retried.state.error, null);
  assert.equal(retried.outcome.delivered.length, 1);
  assert.equal(retried.outcome.delivered[0].tasks[0].id, "task_fail");
  const after = await harness.handlers.get("deadline-reminders:get-state")();
  assert.equal(after.pending, 0);
  assert.equal(after.capability, "supported");

  await harness.controller.stop();
});


test("phase19: a blocked platform record keeps reminders pending and reports the capability", async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "loop-reminders-blocked-"));
  const harness = createHarness(userDataPath, new Date("2026-10-02T17:30:00"));
  // the harness builds its own controller; this one injects a blocked probe
  const { createDeadlineReminderController: create } = require("../app/main/deadline-reminders.cjs");
  const handlers = new Map();
  let blocked = true;
  const controller = create({
    app: { getPath: () => userDataPath },
    Notification: FakeNotification,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) },
    getMainWindow: () => null,
    ensureMainWindow: () => null,
    now: () => new Date("2026-10-02T17:30:00"),
    appId: "io.example.app",
    capabilityReader: {
      read: async () => (blocked
        ? { state: "blocked", source: "macos-ncprefs", detail: "flags=0" }
        : { state: "allowed", source: "macos-ncprefs", detail: "flags=12" }),
    },
  });
  await controller.start({ schedule: false });
  controller.registerIpc();

  const tasks = [{
    id: "task_blocked", title: "发布校验", status: "active",
    deadlineAt: new Date("2026-10-02T18:00:00").toISOString(), deadlineReminderMinutes: 60,
  }];
  const whileBlocked = await handlers.get("deadline-reminders:sync")(null, tasks);
  assert.equal(whileBlocked.notified, 0, "a blocked system must not be marked as notified");
  const blockedState = await handlers.get("deadline-reminders:get-state")();
  assert.equal(blockedState.capability, "blocked");
  assert.deepEqual(blockedState.permission, { state: "blocked", source: "macos-ncprefs", detail: "flags=0" });
  assert.equal(blockedState.pending, 1, "the reminder stays pending while notifications are off");

  // once the system allows notifications again, the same reminder is delivered
  blocked = false;
  const afterUnblock = await handlers.get("deadline-reminders:check")();
  assert.equal(afterUnblock.state.capability, "supported");
  assert.equal(afterUnblock.outcome.notified, 1);
  assert.equal(afterUnblock.outcome.delivered.length, 1);

  await controller.stop();
  await harness.controller.stop?.();
});
