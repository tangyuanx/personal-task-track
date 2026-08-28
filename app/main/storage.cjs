/**
 * Loop -- Data persistence layer
 *
 * Responsibilities:
 *   - Read/write task data as JSON to disk
 *   - Normalize data structure (with safe defaults)
 *   - Atomic writes via temp file + rename
 *   - Automatic backup of corrupt data
 *
 * The data file is stored in Electron's userData directory.
 * Data format versioning is handled via the version field.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const knowledgeDocument = require("../renderer/src/knowledge-document.js");

const DATA_FILE = "task-data.json";
const DATA_VERSION = 1;
const KNOWLEDGE_MIGRATION_VERSION = 1;
const DEFAULT_GROUP = { id: "group_inbox", title: "默认", order: 1 };
const TASK_STATUSES = new Set(["active", "done"]);
const NODE_STATUSES = new Set(["todo", "done", "blocked", "later"]);
const PRIORITIES = new Set(["high", "medium", "low"]);
const RECURRENCE_FREQUENCIES = new Set(["none", "daily", "weekly"]);
const TASK_FILTERS = new Set(["all", "today", "active", "done", "blocked", "later"]);
const PRIORITY_FILTERS = new Set(["all", "high", "medium", "low"]);
const ZH_FONTS = new Set(["system", "noto", "yahei", "pingfang", "songti", "simsun", "fangsong", "heiti", "kaiti"]);
const EN_FONTS = new Set(["inter", "system", "segoe", "arial", "helvetica", "verdana", "trebuchet", "tahoma", "times", "georgia", "courier", "mono"]);

function dataFilePath(userDataPath) {
  return path.join(userDataPath, DATA_FILE);
/**
 * Read and parse the task data JSON file.
 * @param {string} userDataPath - Electron userData directory
 * @returns {Promise<object|null>} Parsed data object, or null if missing/corrupt
 */
}

async function readTaskData(userDataPath) {
  try {
    const raw = await fs.readFile(dataFilePath(userDataPath), "utf8");
    const parsed = JSON.parse(raw);
    assertSupportedDataVersion(parsed);
    return normalizeTaskData(parsed);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      const backupPath = await backupCorruptData(userDataPath);
      throw Object.assign(new Error("任务数据文件已损坏，原文件已备份"), {
        code: "CORRUPT_TASK_DATA",
        backupPath,
      });
    }
/**
 * Write task data to disk using atomic write pattern.
 * Writes to a .tmp file first, then renames to the target path.
 * @param {string} userDataPath - Electron userData directory
 * @param {object} data - Task data to persist
 * @returns {Promise<object>} The normalized data that was written
 */
    throw error;
  }
}

async function writeTaskData(userDataPath, data) {
  assertSupportedDataVersion(data);
  const normalized = normalizeTaskData(data);
  await fs.mkdir(userDataPath, { recursive: true });
  const filePath = dataFilePath(userDataPath);
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  let handle = null;
  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
/**
 * Normalize task data structure with safe defaults for all fields.
 * Ensures backward compatibility when new fields are added.
 * @param {object|null} data - Raw parsed data
 * @returns {object} Normalized data with all required fields
 */
  return normalized;
}

function assertSupportedDataVersion(data) {
  if (!isRecord(data)) return;
  if (Number(data.version) > DATA_VERSION || Number(data.knowledgeSchemaVersion) > KNOWLEDGE_MIGRATION_VERSION) {
    throw Object.assign(new Error("任务数据版本高于当前应用支持范围"), { code: "UNSUPPORTED_DATA_VERSION" });
  }
}

function normalizeTaskData(data) {
  const safeData = migrateKnowledgeTaskData(data);
  const tasks = normalizeTasks(safeData.tasks);
  const taskGroups = normalizeTaskGroups(safeData.taskGroups, tasks);
  const legacyFonts = migrateLegacyFont(safeData.font);
  return {
    version: DATA_VERSION,
    knowledgeSchemaVersion: KNOWLEDGE_MIGRATION_VERSION,
    tasks,
    taskGroups,
    activeGroupId: taskGroups.some((group) => group.id === safeData.activeGroupId)
      ? safeData.activeGroupId
      : taskGroups[0]?.id || DEFAULT_GROUP.id,
    flowWidths: normalizeFlowWidths(safeData.flowWidths),
    sidebarWidth: clampNumber(safeData.sidebarWidth, 390, 370, 560),
    detailHeight: clampNumber(safeData.detailHeight, 58, 50, 82),
    attachments: normalizeAttachments(safeData.attachments),
    theme: safeData.theme === "dark" ? "dark" : "light",
    font: ["songti", "heiti", "system", "mono"].includes(safeData.font) ? safeData.font : "system",
    zhFont: ZH_FONTS.has(safeData.zhFont) ? safeData.zhFont : legacyFonts.zhFont,
    enFont: EN_FONTS.has(safeData.enFont) ? safeData.enFont : legacyFonts.enFont,
    taskFilter: TASK_FILTERS.has(safeData.taskFilter) ? safeData.taskFilter : "all",
    priorityFilter: PRIORITY_FILTERS.has(safeData.priorityFilter) ? safeData.priorityFilter : "all",
    newTaskPriority: PRIORITIES.has(safeData.newTaskPriority) ? safeData.newTaskPriority : "medium",
    installationId: normalizeInstallationId(safeData.installationId),
    updatedAt: normalizeDateValue(safeData.updatedAt, new Date().toISOString()),
  };
}

/**
 * Apply only migration-safe knowledge-note changes before normalizing the
 * complete task payload. This function is deliberately pure and idempotent:
 * reading legacy data never writes it back or removes the legacy body/assets.
 */
function migrateKnowledgeTaskData(data) {
  const safeData = isRecord(data) ? data : {};
  const tasks = Array.isArray(safeData.tasks)
    ? safeData.tasks.map((task) => {
        if (!isRecord(task)) return task;
        const hasLegacyString = typeof task.knowledgeNote === "string";
        const hasCurrentBody = typeof task.notes === "string" && task.notes.trim().length > 0;
        const legacyBody = hasLegacyString && (!hasCurrentBody || task.notes === undefined)
          ? task.knowledgeNote
          : task.notes;
        const migrated = { ...task, notes: normalizeText(legacyBody) };
        if (typeof task.knowledgeNote === "string") delete migrated.knowledgeNote;
        return migrated;
      })
    : safeData.tasks;
  return {
    ...safeData,
    knowledgeSchemaVersion: KNOWLEDGE_MIGRATION_VERSION,
    tasks,
  };
}

function normalizeTasks(tasks) {
  const seenTaskIds = new Set();
  return (Array.isArray(tasks) ? tasks : [])
    .filter(isRecord)
    .map((task, index) => {
      const taskId = uniqueDataId(task.id, "task", seenTaskIds);
      const createdAt = normalizeDateValue(task.createdAt, new Date().toISOString());
      const updatedAt = normalizeDateValue(task.updatedAt, createdAt);
      const hypothesis = normalizeText(task.hypothesis);
      return {
        ...task,
        id: taskId,
        order: normalizeOrder(task.order, index + 1),
        groupId: normalizeIdentifier(task.groupId) || DEFAULT_GROUP.id,
        title: normalizeText(task.title),
        knowledgeNote: knowledgeDocument.normalizeKnowledgeNote(task.knowledgeNote, {
          taskId,
          title: normalizeText(task.title),
          createdAt,
          updatedAt,
        }),
        description: normalizeText(task.description),
        status: TASK_STATUSES.has(task.status) ? task.status : "active",
        priority: PRIORITIES.has(task.priority) ? task.priority : "medium",
        tags: normalizeTaskTags(task.tags),
        recurrence: normalizeTaskRecurrence(task.recurrence),
        notes: normalizeText(task.notes),
        hypothesis,
        hypothesisUpdatedAt: normalizeOptionalDateValue(
          task.hypothesisUpdatedAt,
          hypothesis ? updatedAt : "",
        ),
        conclusion: normalizeText(task.conclusion),
        createdAt,
        updatedAt,
        deadlineAt: normalizeOptionalDateValue(task.deadlineAt),
        resolvedAt: normalizeOptionalDateValue(task.resolvedAt),
        nodes: normalizeTaskNodes(task.nodes, taskId),
      };
    });
}

function normalizeTaskNodes(nodes, taskId = "", parentId = null, seenNodeIds = new Set()) {
  return Array.isArray(nodes)
    ? nodes
        .filter(isRecord)
        .map((node, index) => {
          const nodeId = uniqueDataId(node.id, "node", seenNodeIds);
          const createdAt = normalizeDateValue(node.createdAt, new Date().toISOString());
          return {
            ...node,
            id: nodeId,
            taskId,
            parentId,
            order: normalizeOrder(node.order, index + 1),
            type: parentId ? "subtask" : "step",
            title: normalizeText(node.title),
            status: NODE_STATUSES.has(node.status) ? node.status : "todo",
            note: normalizeText(node.note),
            hypothesis: normalizeText(node.hypothesis),
            conclusion: normalizeText(node.conclusion),
            createdAt,
            updatedAt: normalizeDateValue(node.updatedAt, createdAt),
            collapsed: Boolean(node.collapsed),
            children: normalizeTaskNodes(node.children, taskId, nodeId, seenNodeIds),
          };
        })
    : [];
}

function normalizeTaskGroups(groups, tasks) {
  const seen = new Set();
  const normalized = (Array.isArray(groups) ? groups : [])
    .filter(isRecord)
    .map((group, index) => {
      const groupId = normalizeIdentifier(group.id);
      const title = normalizeText(group.title).trim();
      if (!groupId || !title || seen.has(groupId)) return null;
      seen.add(groupId);
      return { ...group, id: groupId, title, order: normalizeOrder(group.order, index + 1) };
    })
    .filter(Boolean);

  if (!seen.has(DEFAULT_GROUP.id)) {
    normalized.unshift({ ...DEFAULT_GROUP });
    seen.add(DEFAULT_GROUP.id);
  }
  tasks.forEach((task) => {
    if (!seen.has(task.groupId)) {
      seen.add(task.groupId);
      normalized.push({ id: task.groupId, title: "未命名分组", order: normalized.length + 1 });
    }
  });
  return normalized
    .sort((a, b) => a.order - b.order)
    .map((group, index) => ({ ...group, order: index + 1 }));
}

function normalizeTaskTags(tags) {
  if (Array.isArray(tags)) {
    return {
      today: tags.includes("today"),
      later: tags.includes("later"),
      blocked: tags.includes("blocked"),
    };
  }
  const raw = isRecord(tags) ? tags : {};
  return {
    today: Boolean(raw.today),
    later: Boolean(raw.later),
    blocked: Boolean(raw.blocked),
  };
}

function normalizeTaskRecurrence(value) {
  const raw = isRecord(value) ? value : {};
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  const legacyWeekday = Number(raw.weekday);
  const legacyWeekdays = Number.isInteger(legacyWeekday) && legacyWeekday >= 0 && legacyWeekday <= 6
    ? [legacyWeekday]
    : [];
  const weekdays = Array.isArray(raw.weekdays)
    ? weekdayOrder.filter((weekday) => raw.weekdays.some((entry) => Number(entry) === weekday))
    : legacyWeekdays;
  return {
    frequency: RECURRENCE_FREQUENCIES.has(raw.frequency) ? raw.frequency : "none",
    weekdays,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time || "") ? raw.time : "09:00",
    lastCompletedOccurrence: normalizeLocalDateKey(raw.lastCompletedOccurrence),
  };
}

function normalizeLocalDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? String(value) : "";
}

function normalizeFlowWidths(value) {
  const raw = isRecord(value) ? value : {};
  return {
    title: clampNumber(raw.title, 360, 190, 720),
    note: clampNumber(raw.note, 330, 180, 760),
  };
}

function normalizeAttachments(value) {
  const raw = isRecord(value) ? value : {};
  const images = isRecord(raw.images) ? raw.images : {};
  return {
    images: Object.fromEntries(
      Object.entries(images).filter(
        ([imageId, dataUrl]) =>
          Boolean(normalizeIdentifier(imageId)) &&
          typeof dataUrl === "string" &&
          dataUrl.startsWith("data:image/"),
      ),
    ),
  };
}

function migrateLegacyFont(value) {
  if (value === "songti") return { zhFont: "songti", enFont: "inter" };
  if (value === "heiti") return { zhFont: "heiti", enFont: "inter" };
  if (value === "mono") return { zhFont: "yahei", enFont: "mono" };
  return { zhFont: "system", enFont: "inter" };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeIdentifier(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueDataId(value, prefix, seen) {
  let normalized = normalizeIdentifier(value);
  if (!normalized || seen.has(normalized)) normalized = `${prefix}_${crypto.randomUUID()}`;
  seen.add(normalized);
  return normalized;
}

function normalizeOrder(value, fallback) {
  const order = Number(value);
  return Number.isFinite(order) && order > 0 ? Math.round(order) : fallback;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeDateValue(value, fallback) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeOptionalDateValue(value, fallback = "") {
  return value ? normalizeDateValue(value, fallback) : fallback;
}

function normalizeInstallationId(value) {
  const normalized = normalizeIdentifier(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : crypto.randomUUID();
}

async function backupCorruptData(userDataPath) {
  const filePath = dataFilePath(userDataPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(userDataPath, `task-data.corrupt-${timestamp}.json`);
/**
 * Back up corrupt data file before it gets overwritten.
 * Appends a timestamp to the filename for traceability.
 * @param {string} userDataPath - Electron userData directory
 */
  try {
    await fs.rename(filePath, backupPath);
    return backupPath;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

module.exports = {
  DATA_FILE,
  KNOWLEDGE_MIGRATION_VERSION,
  dataFilePath,
  migrateKnowledgeTaskData,
  normalizeTaskData,
  readTaskData,
  writeTaskData,
};
