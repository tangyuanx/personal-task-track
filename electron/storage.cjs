/**
 * Personal Task Track -- Data persistence layer
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

const DATA_FILE = "task-data.json";
const DATA_VERSION = 1;
const DEFAULT_GROUP = { id: "group_inbox", title: "默认", order: 1 };
const TASK_STATUSES = new Set(["active", "done"]);
const NODE_STATUSES = new Set(["todo", "done", "blocked", "later"]);
const PRIORITIES = new Set(["high", "medium", "low"]);
const TASK_FILTERS = new Set(["all", "today", "active", "done", "blocked", "later"]);
const PRIORITY_FILTERS = new Set(["all", "high", "medium", "low"]);
const ZH_FONTS = new Set(["system", "yahei", "pingfang", "songti", "simsun", "fangsong", "heiti", "kaiti"]);
const EN_FONTS = new Set(["inter", "system", "segoe", "arial", "helvetica", "times", "georgia", "mono"]);

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
    return normalizeTaskData(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      await backupCorruptData(userDataPath);
      return null;
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
  const normalized = normalizeTaskData(data);
  await fs.mkdir(userDataPath, { recursive: true });
  const filePath = dataFilePath(userDataPath);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
/**
 * Normalize task data structure with safe defaults for all fields.
 * Ensures backward compatibility when new fields are added.
 * @param {object|null} data - Raw parsed data
 * @returns {object} Normalized data with all required fields
 */
  await fs.rename(tempPath, filePath);
  return normalized;
}

function normalizeTaskData(data) {
  const safeData = isRecord(data) ? data : {};
  const tasks = normalizeTasks(safeData.tasks);
  const taskGroups = normalizeTaskGroups(safeData.taskGroups, tasks);
  const legacyFonts = migrateLegacyFont(safeData.font);
  return {
    version: DATA_VERSION,
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
    updatedAt: normalizeDateValue(safeData.updatedAt, new Date().toISOString()),
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
        description: normalizeText(task.description),
        status: TASK_STATUSES.has(task.status) ? task.status : "active",
        priority: PRIORITIES.has(task.priority) ? task.priority : "medium",
        tags: normalizeTaskTags(task.tags),
        notes: normalizeText(task.notes),
        hypothesis,
        hypothesisUpdatedAt: normalizeOptionalDateValue(
          task.hypothesisUpdatedAt,
          hypothesis ? updatedAt : "",
        ),
        conclusion: normalizeText(task.conclusion),
        createdAt,
        updatedAt,
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
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

module.exports = {
  DATA_FILE,
  dataFilePath,
  normalizeTaskData,
  readTaskData,
  writeTaskData,
};
