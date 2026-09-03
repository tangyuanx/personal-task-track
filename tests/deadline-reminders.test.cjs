const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createDeadlineReminderController,
  deadlineReminderStage,
  reminderStateFilePath,
} = require("../app/main/deadline-reminders.cjs");

class FakeNotification extends EventEmitter {
  static instances = [];
  static isSupported() { return true; }

  constructor(options) {
    super();
    this.options = options;
    this.shown = false;
    FakeNotification.instances.push(this);
  }

  show() {
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
