const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const REMINDER_STATE_FILE = "deadline-reminders.json";
const REMINDER_STATE_VERSION = 1;
const REMINDER_SCAN_INTERVAL_MS = 60_000;
const STAGE_ORDER = ["due-day", "due-soon", "overdue"];

function reminderStateFilePath(userDataPath) {
  return path.join(userDataPath, REMINDER_STATE_FILE);
}

function normalizeReminderTask(value) {
  const raw = value && typeof value === "object" ? value : {};
  const id = String(raw.id || "").trim().slice(0, 160);
  const deadline = new Date(raw.deadlineAt || "");
  if (!id || !Number.isFinite(deadline.getTime())) return null;
  return {
    id,
    title: String(raw.title || "未命名任务").trim().slice(0, 240) || "未命名任务",
    status: raw.status === "done" ? "done" : "active",
    priority: ["high", "medium", "low"].includes(raw.priority) ? raw.priority : "medium",
    deadlineAt: deadline.toISOString(),
  };
}

function normalizeReminderTasks(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map(normalizeReminderTask)
    .filter((task) => {
      if (!task || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
}

function normalizeReminderState(value) {
  const raw = value && typeof value === "object" ? value : {};
  const rawTasks = raw.tasks && typeof raw.tasks === "object" ? raw.tasks : {};
  const tasks = {};
  Object.entries(rawTasks).forEach(([taskId, record]) => {
    if (!record || typeof record !== "object") return;
    const deadline = new Date(record.deadlineAt || "");
    if (!taskId || !Number.isFinite(deadline.getTime())) return;
    tasks[String(taskId).slice(0, 160)] = {
      deadlineAt: deadline.toISOString(),
      stages: Array.from(new Set(Array.isArray(record.stages) ? record.stages.filter((stage) => STAGE_ORDER.includes(stage)) : [])),
    };
  });
  return { version: REMINDER_STATE_VERSION, tasks };
}

async function readDeadlineReminderState(userDataPath) {
  try {
    const raw = await fs.readFile(reminderStateFilePath(userDataPath), "utf8");
    return normalizeReminderState(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return normalizeReminderState({});
    throw error;
  }
}

async function writeDeadlineReminderState(userDataPath, value) {
  const normalized = normalizeReminderState(value);
  await fs.mkdir(userDataPath, { recursive: true });
  const targetPath = reminderStateFilePath(userDataPath);
  const tempPath = `${targetPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let handle = null;
  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, targetPath);
    return normalized;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function deadlineReminderStage(task, at = new Date()) {
  if (!task || task.status === "done") return "";
  const now = at instanceof Date ? at : new Date(at);
  const deadline = new Date(task.deadlineAt || "");
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(deadline.getTime())) return "";
  const remaining = deadline.getTime() - now.getTime();
  if (remaining <= 0) return "overdue";
  if (remaining <= 2 * 60 * 60 * 1000) return "due-soon";
  if (remaining <= 24 * 60 * 60 * 1000) return "due-day";
  return "";
}

function reminderCopy(stage, tasks) {
  const titles = tasks.slice(0, 3).map((task) => `「${task.title}」`);
  const more = tasks.length > 3 ? `等 ${tasks.length} 项任务` : tasks.length > 1 ? `${tasks.length} 项任务` : "";
  const subject = more || titles.join("、");
  if (stage === "overdue") return { title: "任务已逾期", body: `${subject}尚未完成，请尽快处理。` };
  if (stage === "due-soon") return { title: "任务即将截止", body: `${subject}将在 2 小时内截止。` };
  return { title: "任务截止提醒", body: `${subject}将在 24 小时内截止。` };
}

function createDeadlineReminderController({
  app,
  Notification,
  ipcMain,
  getMainWindow,
  ensureMainWindow,
  now = () => new Date(),
} = {}) {
  let tasks = [];
  let state = normalizeReminderState({});
  let timer = null;
  let runQueue = Promise.resolve();
  const liveNotifications = new Set();
  const userDataPath = () => app.getPath("userData");
  const isSupported = () => Boolean(Notification?.isSupported?.());

  function focusMainWindow(taskId = "", openCalendar = false) {
    const window = getMainWindow?.() || ensureMainWindow?.();
    if (!window || window.isDestroyed?.()) return;
    if (window.isMinimized?.()) window.restore?.();
    window.show?.();
    window.focus?.();
    if (openCalendar) window.webContents?.send("deadline-reminders:open-calendar", undefined);
    else window.webContents?.send("deadline-reminders:open-task", { taskId });
  }

  async function persist() {
    state = await writeDeadlineReminderState(userDataPath(), state);
  }

  async function evaluate() {
    if (!isSupported()) return { supported: false, notified: 0 };
    const at = now();
    const groups = new Map();
    tasks.forEach((task) => {
      const stage = deadlineReminderStage(task, at);
      if (!stage) return;
      const record = state.tasks[task.id];
      if (record?.deadlineAt === task.deadlineAt && record.stages.includes(stage)) return;
      if (!groups.has(stage)) groups.set(stage, []);
      groups.get(stage).push(task);
    });

    let notified = 0;
    for (const stage of STAGE_ORDER) {
      const dueTasks = groups.get(stage) || [];
      if (!dueTasks.length) continue;
      const copy = reminderCopy(stage, dueTasks);
      let notification;
      try {
        notification = new Notification({ title: copy.title, body: copy.body, silent: false });
        liveNotifications.add(notification);
        notification.on?.("click", () => {
          if (dueTasks.length === 1) focusMainWindow(dueTasks[0].id, false);
          else focusMainWindow("", true);
        });
        notification.on?.("close", () => liveNotifications.delete(notification));
        notification.show();
      } catch (error) {
        console.error("Failed to show task deadline reminder.", error);
        liveNotifications.delete(notification);
        continue;
      }
      dueTasks.forEach((task) => {
        const existing = state.tasks[task.id]?.deadlineAt === task.deadlineAt ? state.tasks[task.id].stages : [];
        state.tasks[task.id] = { deadlineAt: task.deadlineAt, stages: Array.from(new Set([...existing, stage])) };
      });
      notified += dueTasks.length;
    }
    if (notified) await persist();
    return { supported: true, notified };
  }

  function run() {
    runQueue = runQueue.then(evaluate, evaluate);
    return runQueue;
  }

  async function sync(value) {
    tasks = normalizeReminderTasks(value);
    const active = new Map(tasks.filter((task) => task.status !== "done").map((task) => [task.id, task]));
    let changed = false;
    Object.keys(state.tasks).forEach((taskId) => {
      const task = active.get(taskId);
      if (!task || state.tasks[taskId].deadlineAt !== task.deadlineAt) {
        delete state.tasks[taskId];
        changed = true;
      }
    });
    if (changed) await persist();
    return run();
  }

  function registerIpc() {
    ipcMain.handle("deadline-reminders:sync", (_event, value) => sync(value));
    ipcMain.handle("deadline-reminders:get-state", () => ({ supported: isSupported() }));
  }

  async function start({ schedule = true } = {}) {
    state = await readDeadlineReminderState(userDataPath());
    if (schedule) {
      timer = setInterval(run, REMINDER_SCAN_INTERVAL_MS);
      timer.unref?.();
    }
    return { supported: isSupported() };
  }

  async function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    await runQueue.catch(() => {});
    liveNotifications.clear();
  }

  return { registerIpc, start, stop, sync, run, getState: () => ({ supported: isSupported() }) };
}

module.exports = {
  createDeadlineReminderController,
  deadlineReminderStage,
  normalizeReminderState,
  normalizeReminderTasks,
  readDeadlineReminderState,
  reminderStateFilePath,
  writeDeadlineReminderState,
};
