// ============================================================
// Personal Task Track -- frontend application logic
// All state management, DOM rendering, event handling,
// Markdown processing, and Milkdown editor integration.
// ============================================================
const STORAGE_KEY = "task-flow-sheet-prototype-v2";
const FLOW_WIDTH_KEY = "task-flow-column-widths-v1";
const THEME_KEY = "task-track-theme";
const ZH_FONT_KEY = "task-track-zh-font";
const EN_FONT_KEY = "task-track-en-font";
const TASK_FILTER_KEY = "task-track-task-filter";
const PRIORITY_FILTER_KEY = "task-track-priority-filter";
const NEW_TASK_PRIORITY_KEY = "task-track-new-task-priority";
const TASK_GROUPS_KEY = "task-track-groups";
const ACTIVE_GROUP_KEY = "task-track-active-group";
const SIDEBAR_WIDTH_KEY = "task-track-sidebar-width";
const DETAIL_HEIGHT_KEY = "task-track-detail-height";
const ATTACHMENTS_KEY = "task-track-attachments";
const INSTALLATION_ID_KEY = "task-track-installation-id";
const KNOWLEDGE_RECOVERY_KEY = "task-track-knowledge-recovery-v1";
const KNOWLEDGE_RECOVERY_DEBOUNCE_MS = 800;
const KNOWLEDGE_RECOVERY_MAX_INTERVAL_MS = 5000;
const DATA_VERSION = 1;
const KNOWLEDGE_MIGRATION_VERSION = 1;
const desktopStorage = window.personalTaskTrack?.storage;
const desktopKnowledgeRecovery = window.personalTaskTrack?.knowledgeRecovery;
const desktopKnowledgeFile = window.personalTaskTrack?.knowledgeFile;
const desktopExport = window.personalTaskTrack?.export;
const desktopBugReports = window.personalTaskTrack?.bugReports;
const desktopUpdates = window.personalTaskTrack?.updates;
const desktopTodayWidget = window.personalTaskTrack?.todayWidget;
const desktopDialogs = window.personalTaskTrack?.dialogs;
const desktopDeadlineReminders = window.personalTaskTrack?.deadlineReminders;
const desktopEnvironment = window.personalTaskTrack?.environment || {};
const desktopPlatform = window.personalTaskTrack?.platform || "";
const APP_VERSION = window.personalTaskTrack?.appVersion || "";
const knowledgeDocument = globalThis.KnowledgeDocument;
const knowledgeRecoveryModel = globalThis.KnowledgeRecovery;

const priorityLabels = {

// ============================================================
// LABELS & CONFIGURATIONS
// ============================================================
  high: "高",
  medium: "中",
  low: "低",
};

const taskFilterLabels = {
  all: "全部",
  today: "今天",
  active: "未完成",
  done: "已完成",
  blocked: "卡住",
  later: "稍后",
};

const taskDeadlineFilterLabels = {
  all: "全部截止",
  today: "今天截止",
  week: "本周截止",
  overdue: "已逾期",
};

const priorityFilterLabels = {
  all: "全部",
  high: "高",
  medium: "中",
  low: "低",
};

const repositoryPriorityFilterLabels = {
  all: "all",
  high: "high",
  medium: "medium",
  low: "low",
};

const repositoryPriorityLabels = {
  high: "高",
  medium: "中",
  low: "低",
};

const themeLabels = {
  light: "浅色",
  dark: "深色",
};

const bugCategoryLabels = {
  malfunction: "功能异常",
  crash: "软件崩溃",
  data: "数据异常",
  display: "界面显示",
  performance: "性能问题",
  suggestion: "功能建议",
  other: "其他",
};

const zhFontLabels = {
  system: "系统中文",
  noto: "Noto Sans CJK SC（内置）",
  yahei: "微软雅黑",
  pingfang: "苹方",
  songti: "宋体",
  simsun: "中易宋体",
  fangsong: "仿宋",
  heiti: "黑体",
  kaiti: "楷体",
};

const enFontLabels = {
  inter: "Inter（内置）",
  system: "System UI",
  segoe: "Segoe UI",
  arial: "Arial",
  helvetica: "Helvetica",
  verdana: "Verdana",
  trebuchet: "Trebuchet MS",
  tahoma: "Tahoma",
  times: "Times New Roman",
  georgia: "Georgia",
  courier: "Courier New",
  mono: "Monospace",
};

const defaultFlowWidths = {
  title: 360,
  note: 330,
};

const flowWidthLimits = {
  title: [190, 720],
  note: [180, 760],
};

const defaultTaskGroup = { id: "group_inbox", title: "默认", order: 1 };
const defaultSidebarWidth = 390;
const sidebarWidthLimits = [370, 560];
const defaultDetailHeight = 58;
const detailHeightLimits = [50, 82];
const recurrenceFrequencies = new Set(["none", "daily", "weekly"]);
const recurrenceFrequencyLabels = {
  none: "不循环",
  daily: "每天",
  weekly: "每周",
};
const recurrenceWeekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const recurrenceWeekdayLabels = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  0: "周日",
};
const taskTagLabels = {
  today: "Today",
  later: "稍后",
  blocked: "卡住",
};
const editFieldLabels = {
  title: "标题",
  description: "背景与目标",
  hypothesis: "当前判断与进展",
  conclusion: "结果与总结",
  priority: "优先级",
  groupId: "任务分组",
};

const reviewPresetLabels = {
  week: "本周",
  month: "本月",
  year: "今年",
  custom: "自定义",
  all: "全部",
};

const reviewDateFieldLabels = {
  updated: "更新日期",
  created: "创建日期",
  resolved: "解决日期",
};

const taskStatusValues = new Set(["active", "done"]);
const nodeStatusValues = new Set(["todo", "done", "blocked", "later"]);
const appUpdateStatuses = new Set(["idle", "unsupported", "checking", "latest", "available", "downloading", "downloaded", "preparing", "installing", "error"]);

let state = {

// ============================================================
// STATE -- single source of truth
// ============================================================
  tasks: [],
  taskGroups: [{ ...defaultTaskGroup }],
  activeGroupId: defaultTaskGroup.id,
  editingGroupId: "",
  activeTaskId: "",
  selectedNodeId: "",
  recordDraft: "",
  query: "",
  taskFilter: "all",
  taskDateFilter: "",
  taskDeadlineFilter: "all",
  priorityFilter: "all",
  newTaskPriority: "medium",
  markdownMode: "edit",
  theme: "light",
  zhFont: "system",
  enFont: "inter",
  settingsOpen: false,
  calendarOpen: false,
  reviewOpen: false,
  feedbackOpen: false,
  feedbackDraft: createEmptyFeedbackDraft(),
  feedbackErrors: {},
  feedbackSubmitting: false,
  feedbackResult: null,
  feedbackMessage: "",

// ============================================================
// RUNTIME VARIABLES
// ============================================================
  reviewPreset: "week",
  reviewDateField: "updated",
  reviewStartDate: "",
  reviewEndDate: "",
  calendarMonth: "",
  calendarSelectedDate: "",
  taskPane: "flow",
  nodeDetailFullscreen: false,
  focusTaskTitleId: "",
  focusNodeTitleId: "",
  focusGroupTitleId: "",
  focusSearch: false,
  searchCursor: 0,
  markdownSelection: null,
  restoreMarkdownFocus: false,
  flowWidths: { ...defaultFlowWidths },
  sidebarWidth: defaultSidebarWidth,
  detailHeight: defaultDetailHeight,
  attachments: { images: {} },
  knowledgeAssets: {},
  knowledgeFileIssues: {},
  knowledgeRecovery: { version: 1, records: {} },
  installationId: "",
  conclusionPromptTaskId: "",
  knowledgeDraftPrompt: null,
  contextMenu: null,
  nodeDetailPosition: null,
};

let saveTimer = 0;
let pendingPayload = null;
let saveInFlight = false;
let saveInFlightPromise = null;
let conclusionNoticeTimer = 0;
let taskDragState = null;
let flowNodeDragState = null;
let suppressTaskClickUntil = 0;
let recurrenceScheduleTimer = 0;
let recurringTodaySignature = "";
let recurrencePopoverTaskId = "";
const milkdownEditors = new Map();
const nodeNoteDrafts = new Map();
const nodeNoteSaveTimers = new Map();
const knowledgeRecoveryTimers = new Map();
const knowledgeExternalSnapshots = new Map();
let knowledgeRecoveryWriteQueue = Promise.resolve();
const knowledgeRecoveryWriteErrors = new Map();
let cachedKnowledgePane = null;
let appSwitchFocusSnapshot = null;
let appEditingPointerDown = false;
let appUpdateState = normalizeAppUpdateState({
  status: desktopUpdates ? "idle" : "unsupported",
  supported: Boolean(desktopUpdates),
  unsupportedReason: desktopUpdates ? "" : "development",
  automaticChecks: true,
  currentVersion: APP_VERSION,
});
let unsubscribeAppUpdates = null;
let unsubscribeTodayWidgetState = null;
let unsubscribeTodayWidgetOpenTask = null;
let unsubscribeTodayWidgetCompletion = null;
let unsubscribeDeadlineReminderTask = null;
let unsubscribeDeadlineReminderCalendar = null;
let unsubscribeKnowledgeFileChanges = null;
let todayWidgetWindowState = { visible: Boolean(desktopTodayWidget) };
let deadlineReminderSignature = "";


// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function now() {
  return new Date().toISOString();
}

async function confirmDestructiveAction(message) {
  if (desktopDialogs?.confirmDestructive) {
    try {
      const confirmed = await desktopDialogs.confirmDestructive({ message });
      state.restoreMarkdownFocus = false;
      return confirmed === true;
    } catch (error) {
      console.error("Failed to open desktop confirmation dialog.", error);
    }
  }
  return globalThis.confirm(message);
}

function createEmptyFeedbackDraft() {
  return {
    title: "",
    category: "",
    description: "",
    reproductionSteps: "",
    contact: "",
    includeEnvironment: true,
    confirmed: false,
  };
}

function createInstallationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeInstallationId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : createInstallationId();
}

/**
 * Create a new task node (step or subtask).
 * @param {string} taskId - Parent task ID
 * @param {string|null} parentId - null for root-level steps, node ID for subtasks
 * @param {number} order - Display order within parent
 * @returns {object} New node object with default fields
 */
function makeNode(taskId, parentId, order) {
  return {
    id: id("node"),
    taskId,
    parentId,
    order,
    type: parentId ? "subtask" : "step",
    title: "",
    status: "todo",
    note: "",
    hypothesis: "",
    conclusion: "",
    createdAt: now(),
    updatedAt: now(),
    collapsed: false,
    children: [],
  };
}


// ============================================================
// DATA LOADING (localStorage / Electron IPC)
// ============================================================
/**
 * Load tasks from localStorage (browser-only fallback).
 * @returns {Array} Parsed task array or empty array
 */
function loadBrowserTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeTasks(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeTasks(tasks) {
  const seenTaskIds = new Set();
  return (Array.isArray(tasks) ? tasks : [])
    .filter(isRecord)
    .map((task, index) => {
      const taskId = uniqueDataId(task.id, "task", seenTaskIds);
      const createdAt = normalizeDateValue(task.createdAt, now());
      const updatedAt = normalizeDateValue(task.updatedAt, createdAt);
      const hypothesis = normalizeText(task.hypothesis);
      const legacyKnowledgeBody = task.notes === undefined && typeof task.knowledgeNote === "string"
        ? task.knowledgeNote
        : task.notes;
      return {
        ...task,
        id: taskId,
        order: normalizeOrder(task.order, index + 1),
        groupId: normalizeIdentifier(task.groupId) || defaultTaskGroup.id,
        title: normalizeText(task.title),
        knowledgeNote: knowledgeDocument.normalizeKnowledgeNote(task.knowledgeNote, {
          taskId,
          title: normalizeText(task.title),
          createdAt,
          updatedAt,
        }),
        description: normalizeText(task.description),
        status: taskStatusValues.has(task.status) ? task.status : "active",
        priority: normalizePriority(task.priority),
        tags: normalizeTaskTags(task.tags),
        recurrence: normalizeTaskRecurrence(task.recurrence),
        notes: normalizeText(legacyKnowledgeBody),
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
        nodes: normalizeNodes(task.nodes, taskId),
      };
    });
}

function normalizeNodes(nodes, taskId = "", parentId = null, seenNodeIds = new Set()) {
  return Array.isArray(nodes)
    ? nodes
        .filter(isRecord)
        .map((node, index) => {
          const nodeId = uniqueDataId(node.id, "node", seenNodeIds);
          const createdAt = normalizeDateValue(node.createdAt, now());
          return {
            ...node,
            id: nodeId,
            taskId,
            parentId,
            order: normalizeOrder(node.order, index + 1),
            type: parentId ? "subtask" : "step",
            title: normalizeText(node.title),
            status: nodeStatusValues.has(node.status) ? node.status : "todo",
            note: normalizeText(node.note),
            hypothesis: normalizeText(node.hypothesis),
            conclusion: normalizeText(node.conclusion),
            createdAt,
            updatedAt: normalizeDateValue(node.updatedAt, createdAt),
            collapsed: Boolean(node.collapsed),
            children: normalizeNodes(node.children, taskId, nodeId, seenNodeIds),
          };
        })
    : [];
}

function normalizeTaskTags(tags) {
  if (Array.isArray(tags)) {
    return {
      today: tags.includes("today"),
      later: tags.includes("later"),
      blocked: tags.includes("blocked"),
    };
  }
  const raw = tags && typeof tags === "object" ? tags : {};
  return {
    today: Boolean(raw.today),
    later: Boolean(raw.later),
    blocked: Boolean(raw.blocked),
  };
}

function normalizeTaskRecurrence(value) {
  const raw = isRecord(value) ? value : {};
  const legacyWeekday = Number(raw.weekday);
  const legacyWeekdays = Number.isInteger(legacyWeekday) && legacyWeekday >= 0 && legacyWeekday <= 6
    ? [legacyWeekday]
    : [];
  const weekdays = Array.isArray(raw.weekdays)
    ? recurrenceWeekdayOrder.filter((weekday) => raw.weekdays.some((value) => Number(value) === weekday))
    : legacyWeekdays;
  return {
    frequency: recurrenceFrequencies.has(raw.frequency) ? raw.frequency : "none",
    weekdays,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time || "") ? raw.time : "09:00",
    lastCompletedOccurrence: normalizeTaskDateFilter(raw.lastCompletedOccurrence),
  };
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
  if (!normalized || seen.has(normalized)) normalized = id(prefix);
  seen.add(normalized);
  return normalized;
}

function normalizeOrder(value, fallback) {
  const order = Number(value);
  return Number.isFinite(order) && order > 0 ? Math.round(order) : fallback;
}

function normalizeDateValue(value, fallback) {
  const date = safeDate(value);
  return date ? date.toISOString() : fallback;
}

function normalizeOptionalDateValue(value, fallback = "") {
  return value ? normalizeDateValue(value, fallback) : fallback;
}

function normalizeAttachments(value) {
  const raw = value && typeof value === "object" ? value : {};
  const images = raw.images && typeof raw.images === "object" ? raw.images : {};
  return {
    images: Object.fromEntries(
      Object.entries(images).filter(([, dataUrl]) => typeof dataUrl === "string" && dataUrl.startsWith("data:image/")),
    ),
  };
}

function normalizeTaskGroups(groups, tasks = []) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const seen = new Set();
  const normalized = safeGroups
    .map((group, index) => {
      const raw = group && typeof group === "object" ? group : {};
      const title = String(raw.title || "").trim();
      const groupId = String(raw.id || "").trim();
      if (!groupId || !title || seen.has(groupId)) return null;
      seen.add(groupId);
      return {
        id: groupId,
        title,
        order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1,
      };
    })
    .filter(Boolean);

  if (!seen.has(defaultTaskGroup.id)) {
    normalized.unshift({ ...defaultTaskGroup });
    seen.add(defaultTaskGroup.id);
  }

  tasks.forEach((task) => {
    if (task.groupId && !seen.has(task.groupId)) {
      seen.add(task.groupId);
      normalized.push({
        id: task.groupId,
        title: "未命名分组",
        order: normalized.length + 1,
      });
    }
  });

  return sort(normalized).map((group, index) => ({ ...group, order: index + 1 }));
}

function normalizeActiveGroupId(value, groups) {
  return groups.some((group) => group.id === value) ? value : groups[0]?.id || defaultTaskGroup.id;
}

function loadBrowserFlowWidths() {
  const raw = localStorage.getItem(FLOW_WIDTH_KEY);
  if (!raw) return { ...defaultFlowWidths };
  try {
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.keys(defaultFlowWidths).map((key) => [key, normalizeFlowWidth(key, parsed?.[key])]),
    );
  } catch {
    return { ...defaultFlowWidths };
  }
}

function normalizeLoadedFlowWidths(value) {
  const raw = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.keys(defaultFlowWidths).map((key) => [key, normalizeFlowWidth(key, raw[key])]));
}

function normalizeTheme(value) {
  return value === "dark" ? "dark" : "light";
}

function normalizeTaskFilter(value) {
  return Object.hasOwn(taskFilterLabels, value) ? value : "all";
}

function normalizeTaskDateFilter(value) {
  const text = String(value || "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? text : "";
}

function normalizePriorityFilter(value) {
  return Object.hasOwn(priorityFilterLabels, value) ? value : "all";
}

function normalizePriority(value) {
  return Object.hasOwn(priorityLabels, value) ? value : "medium";
}

function normalizeZhFont(value) {
  return Object.hasOwn(zhFontLabels, value) ? value : "system";
}

function normalizeEnFont(value) {
  return Object.hasOwn(enFontLabels, value) ? value : "inter";
}

function migrateLegacyFont(value) {
  if (value === "songti") return { zhFont: "songti", enFont: "inter" };
  if (value === "heiti") return { zhFont: "heiti", enFont: "inter" };
  if (value === "mono") return { zhFont: "yahei", enFont: "mono" };
  return { zhFont: "system", enFont: "inter" };
}

function loadBrowserTheme() {
  return normalizeTheme(localStorage.getItem(THEME_KEY));
}

function loadBrowserTypography() {
  const legacy = migrateLegacyFont(localStorage.getItem("task-track-font"));
  return {
    zhFont: normalizeZhFont(localStorage.getItem(ZH_FONT_KEY) || legacy.zhFont),
    enFont: normalizeEnFont(localStorage.getItem(EN_FONT_KEY) || legacy.enFont),
  };
}

function loadBrowserPreferences() {
  return {
    taskFilter: normalizeTaskFilter(localStorage.getItem(TASK_FILTER_KEY)),
    priorityFilter: normalizePriorityFilter(localStorage.getItem(PRIORITY_FILTER_KEY)),
    newTaskPriority: normalizePriority(localStorage.getItem(NEW_TASK_PRIORITY_KEY)),
  };
}

function loadBrowserTaskGroups(tasks) {
  const raw = localStorage.getItem(TASK_GROUPS_KEY);
  try {
    return normalizeTaskGroups(raw ? JSON.parse(raw) : [], tasks);
  } catch {
    return normalizeTaskGroups([], tasks);
  }
}

function loadBrowserSidebarWidth() {
  return normalizeSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY));
}

function loadBrowserDetailHeight() {
  return normalizeDetailHeight(localStorage.getItem(DETAIL_HEIGHT_KEY));
}

function loadBrowserAttachments() {
  const raw = localStorage.getItem(ATTACHMENTS_KEY);
  try {
    return normalizeAttachments(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeAttachments({});
  }
}

function loadBrowserInstallationId() {
  return normalizeInstallationId(localStorage.getItem(INSTALLATION_ID_KEY));
}

function loadBrowserKnowledgeRecovery() {
  const raw = localStorage.getItem(KNOWLEDGE_RECOVERY_KEY);
  try {
    return knowledgeRecoveryModel.normalizeRecoveryData(raw ? JSON.parse(raw) : {});
  } catch {
    return knowledgeRecoveryModel.normalizeRecoveryData({});
  }
}

async function loadKnowledgeRecovery() {
  if (desktopKnowledgeRecovery?.read) {
    try {
      return knowledgeRecoveryModel.normalizeRecoveryData(await desktopKnowledgeRecovery.read());
    } catch (error) {
      console.error("Failed to read knowledge note recovery data.", error);
    }
  }
  return loadBrowserKnowledgeRecovery();
}

function recoveryRecordForTask(task, content, assets = []) {
  const note = task?.knowledgeNote || {};
  return knowledgeRecoveryModel.normalizeRecoveryRecord({
    noteId: note.noteId || task?.id,
    content,
    updatedAt: now(),
    baseFileHash: note.lastSavedHash,
    assets,
  });
}

function restoreKnowledgeRecoveryAssets(record) {
  const assets = Array.isArray(record?.assets) ? record.assets : [];
  if (!assets.length) return;
  state.attachments = normalizeAttachments(state.attachments);
  assets.forEach((asset) => {
    const source = String(asset?.source || "").trim();
    const dataUrl = String(asset?.dataUrl || "").trim();
    if (!source || !dataUrl.startsWith("data:image/")) return;
    if (source.startsWith("task-image:")) {
      const imageId = source.slice("task-image:".length).trim();
      if (imageId) state.attachments.images[imageId] = dataUrl;
    }
  });
}

function collectManagedKnowledgeAssets(content) {
  const source = String(content || "");
  const assets = [];
  const seen = new Set();
  Array.from(source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)).forEach((match) => {
    const reference = cleanMarkdownUrl(match[1]);
    let dataUrl = "";
    if (reference.startsWith("task-image:")) {
      const imageId = reference.slice("task-image:".length);
      dataUrl = state.attachments?.images?.[imageId] || "";
    } else if (reference.toLowerCase().startsWith("data:image/")) {
      dataUrl = reference;
    }
    if (!dataUrl || !dataUrl.toLowerCase().startsWith("data:image/") || seen.has(reference)) return;
    seen.add(reference);
    assets.push({ source: reference, dataUrl });
  });
  return assets;
}

async function stageKnowledgeAssetsForTask(task, content) {
  const assets = collectManagedKnowledgeAssets(content);
  if (!assets.length || !desktopKnowledgeFile?.stageAssets) return { success: true, assets };
  try {
    const result = await desktopKnowledgeFile.stageAssets({
      noteId: task?.knowledgeNote?.noteId || task?.id,
      assets,
    });
    if (result?.success === false) return result;
    return { ...result, success: true, assets: result?.assets?.length ? result.assets : assets };
  } catch (error) {
    return { success: false, code: "ASSET_STAGE_FAILED", message: error?.message || "恢复资源暂存失败", error };
  }
}

function rememberKnowledgeAssetFiles(assetFiles = []) {
  if (!Array.isArray(assetFiles)) return;
  assetFiles.forEach((asset) => {
    const relativePath = String(asset?.relativePath || "").trim();
    const dataUrl = String(asset?.dataUrl || "").trim();
    if (relativePath && dataUrl.startsWith("data:image/")) state.knowledgeAssets[relativePath] = dataUrl;
  });
}

function rememberKnowledgeAssetDiagnostics(noteId, result) {
  if (!noteId) return;
  if (Array.isArray(result?.missingAssetFiles) && result.missingAssetFiles.length) {
    state.knowledgeFileIssues[noteId] = {
      code: "MISSING_ATTACHMENTS",
      message: `有 ${result.missingAssetFiles.length} 个 Markdown 附件不可用`,
    };
  } else if (state.knowledgeFileIssues[noteId]?.code === "MISSING_ATTACHMENTS") {
    delete state.knowledgeFileIssues[noteId];
  }
}

function hydrateKnowledgeEditorMarkdown(content) {
  return Object.entries(state.knowledgeAssets || {}).reduce((markdown, [relativePath, dataUrl]) => {
    if (!relativePath || !dataUrl?.startsWith?.("data:image/")) return markdown;
    return markdown.split(relativePath).join(dataUrl);
  }, String(content || ""));
}

function persistKnowledgeRecoveryRecord(record, { strict = false } = {}) {
  if (!record) return Promise.resolve();
  state.knowledgeRecovery.records[record.noteId] = record;
  const writePromise = knowledgeRecoveryWriteQueue.then(async () => {
      if (desktopKnowledgeRecovery?.write) {
        await desktopKnowledgeRecovery.write(record);
      } else {
        localStorage.setItem(KNOWLEDGE_RECOVERY_KEY, JSON.stringify(state.knowledgeRecovery));
      }
      knowledgeRecoveryWriteErrors.delete(record.noteId);
    });
  knowledgeRecoveryWriteQueue = writePromise.catch((error) => {
    knowledgeRecoveryWriteErrors.set(record.noteId, error);
    console.error("Failed to persist knowledge note recovery data.", error);
  });
  return strict ? writePromise : knowledgeRecoveryWriteQueue;
}

function flushKnowledgeRecovery(noteId, { strict = false } = {}) {
  const pending = knowledgeRecoveryTimers.get(noteId);
  if (!pending) return Promise.resolve();
  window.clearTimeout(pending.debounceTimer);
  window.clearTimeout(pending.maxTimer);
  knowledgeRecoveryTimers.delete(noteId);
  const task = state.tasks.find((item) => item.knowledgeNote?.noteId === noteId || item.id === noteId);
  if (!task) return Promise.resolve();
  return stageKnowledgeAssetsForTask(task, pending.content)
    .then((stagedAssets) => {
      if (stagedAssets?.success === false) {
        console.error("Failed to stage knowledge note assets for recovery.", stagedAssets.message || stagedAssets.code);
        if (strict) throw Object.assign(new Error("Knowledge recovery asset staging failed."), { code: stagedAssets.code || "RECOVERY_ASSET_STAGE_FAILED" });
        return null;
      }
      return persistKnowledgeRecoveryRecord(
        recoveryRecordForTask(task, pending.content, stagedAssets?.assets),
        { strict },
      );
    })
    .catch((error) => {
      console.error("Failed to stage knowledge note assets for recovery.", error);
      if (strict) throw error;
      return null;
    });
}

async function flushPendingKnowledgeRecoveries({ strict = false } = {}) {
  const noteIds = Array.from(knowledgeRecoveryTimers.keys());
  await Promise.all(noteIds.map((noteId) => flushKnowledgeRecovery(noteId, { strict })));
  await knowledgeRecoveryWriteQueue;
  if (strict && knowledgeRecoveryWriteErrors.size) {
    const failedNoteIds = Array.from(knowledgeRecoveryWriteErrors.keys());
    await Promise.all(failedNoteIds.map((noteId) => {
      const record = state.knowledgeRecovery.records[noteId];
      if (!record) throw Object.assign(new Error("Knowledge recovery retry record is missing."), { code: "RECOVERY_RETRY_MISSING" });
      return persistKnowledgeRecoveryRecord(record, { strict: true });
    }));
    await knowledgeRecoveryWriteQueue;
  }
  if (strict && knowledgeRecoveryWriteErrors.size) throw knowledgeRecoveryWriteErrors.values().next().value;
}

function scheduleKnowledgeRecovery(taskId, content, timing = {}) {
  const task = state.tasks.find((item) => item.id === taskId);
  const noteId = task?.knowledgeNote?.noteId || taskId;
  if (!task || !noteId) return;
  const debounceMs = Number.isFinite(timing.debounceMs) ? timing.debounceMs : KNOWLEDGE_RECOVERY_DEBOUNCE_MS;
  const maxIntervalMs = Number.isFinite(timing.maxIntervalMs) ? timing.maxIntervalMs : KNOWLEDGE_RECOVERY_MAX_INTERVAL_MS;
  const existing = knowledgeRecoveryTimers.get(noteId);
  if (existing) {
    existing.content = String(content ?? "");
    window.clearTimeout(existing.debounceTimer);
    existing.debounceTimer = window.setTimeout(() => {
      void flushKnowledgeRecovery(noteId);
    }, debounceMs);
    return;
  }

  const pending = {
    content: String(content ?? ""),
    debounceTimer: 0,
    maxTimer: 0,
  };
  pending.debounceTimer = window.setTimeout(() => {
    void flushKnowledgeRecovery(noteId);
  }, debounceMs);
  pending.maxTimer = window.setTimeout(() => {
    void flushKnowledgeRecovery(noteId);
  }, maxIntervalMs);
  knowledgeRecoveryTimers.set(noteId, pending);
}

function applyKnowledgeRecoveryDraft(task, record) {
  restoreKnowledgeRecoveryAssets(record);
  task.notes = record.content;
  task.knowledgeNote = knowledgeDocument.markDocumentEdited(task.knowledgeNote);
  task.knowledgeNote.updatedAt = record.updatedAt;
  task.updatedAt = record.updatedAt;
}

async function restoreKnowledgeRecoveryDrafts() {
  for (const record of Object.values(state.knowledgeRecovery.records || {})) {
    const task = state.tasks.find((item) => item.knowledgeNote?.noteId === record.noteId || item.id === record.noteId);
    if (!task || !knowledgeRecoveryModel.isRecoveryNewerThan(record, task.updatedAt)) continue;

    const filePath = task.knowledgeNote?.filePath;
    if (!filePath) {
      applyKnowledgeRecoveryDraft(task, record);
      continue;
    }

    if (!desktopKnowledgeFile?.read || !record.baseFileHash) continue;
    let currentFile;
    try {
      currentFile = await desktopKnowledgeFile.read({ filePath });
    } catch (error) {
      console.error("Failed to read bound knowledge note before recovery.", error);
      continue;
    }
    if (!currentFile?.success) continue;
    if (currentFile.lastSavedHash !== record.baseFileHash) {
      task.knowledgeNote = knowledgeDocument.markDocumentExternalChanged(task.knowledgeNote);
      continue;
    }

    rememberKnowledgeAssetFiles(currentFile.assetFiles);
    applyKnowledgeRecoveryDraft(task, record);
  }
}

function discardPendingKnowledgeRecovery(noteId) {
  const pending = knowledgeRecoveryTimers.get(noteId);
  if (!pending) return;
  window.clearTimeout(pending.debounceTimer);
  window.clearTimeout(pending.maxTimer);
  knowledgeRecoveryTimers.delete(noteId);
}

async function clearKnowledgeRecoveryRecord(noteId) {
  if (!noteId) return;
  discardPendingKnowledgeRecovery(noteId);
  await knowledgeRecoveryWriteQueue;
  delete state.knowledgeRecovery.records[noteId];
  try {
    if (desktopKnowledgeRecovery?.delete) {
      await desktopKnowledgeRecovery.delete(noteId);
    } else {
      localStorage.setItem(KNOWLEDGE_RECOVERY_KEY, JSON.stringify(state.knowledgeRecovery));
    }
  } catch (error) {
    console.error("Failed to clear knowledge note recovery data.", error);
  }
}

function boundKnowledgeFilePaths(excludeTaskId = "") {
  return state.tasks
    .filter((task) => task.id !== excludeTaskId)
    .map((task) => task.knowledgeNote?.filePath)
    .filter(Boolean)
    .map((filePath) => knowledgeDocument.canonicalFilePath(filePath, desktopPlatform));
}

function syncKnowledgeFileWatcher(task) {
  const note = task?.knowledgeNote;
  if (!desktopKnowledgeFile?.watch || !note?.filePath) return Promise.resolve(null);
  return desktopKnowledgeFile.watch({
    noteId: note.noteId || task.id,
    filePath: note.filePath,
    lastSavedHash: note.lastSavedHash,
    lastSavedMtime: note.lastSavedMtime,
  });
}

async function verifyKnowledgeFileBeforeSave(task, { saveAs = false, allowExternalOverwrite = false } = {}) {
  const note = task?.knowledgeNote;
  if (saveAs || allowExternalOverwrite || !note?.filePath || !desktopKnowledgeFile?.read) return null;

  let currentFile;
  try {
    currentFile = await desktopKnowledgeFile.read({ filePath: note.filePath });
  } catch (error) {
    return { success: false, code: "FILE_READ_FAILED", message: error?.message || "无法读取当前知识笔记文件", error };
  }
  if (!currentFile?.success) return currentFile || { success: false, code: "FILE_READ_FAILED" };

  if (!note.lastSavedHash || currentFile.lastSavedHash !== note.lastSavedHash) {
    knowledgeExternalSnapshots.set(note.noteId, currentFile);
    task.knowledgeNote = knowledgeDocument.markDocumentExternalChanged(note);
    task.knowledgeNote.updatedAt = now();
    task.updatedAt = now();
    save();
    return {
      success: false,
      code: "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION",
      message: "文件已被外部修改，请先重新加载、明确覆盖或另存为。",
    };
  }
  return null;
}

async function startKnowledgeFileWatchers() {
  if (!desktopKnowledgeFile?.watch) return;
  await Promise.all(state.tasks.filter((task) => task.knowledgeNote?.filePath).map((task) => syncKnowledgeFileWatcher(task)));
}

function knowledgeFileFailure(result, fallback = "文件不可用") {
  return result?.message || fallback;
}

async function reloadKnowledgeTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const note = task?.knowledgeNote;
  if (!task || !note?.filePath || !desktopKnowledgeFile?.read) return { success: false, code: "READ_UNAVAILABLE" };
  if (note.dirty && !(await confirmDestructiveAction("重新加载将丢弃当前未保存的知识笔记修改，是否继续？"))) {
    return { canceled: true };
  }

  let result;
  try {
    // Reload is an explicit request for the current disk version. Watcher
    // snapshots are only conflict evidence and may already be stale here.
    result = await desktopKnowledgeFile.read({ filePath: note.filePath });
  } catch (error) {
    result = {
      success: false,
      code: "FILE_READ_FAILED",
      errorCode: error?.code || "UNKNOWN",
      message: error?.message || "文件暂时不可用",
    };
  }
  if (!result?.success) {
    // A failed conflict resolution must not replace the editor content, clear
    // EXTERNAL_CHANGED, or discard Recovery. Surface the read issue separately.
    state.knowledgeFileIssues[note.noteId] = {
      code: result?.errorCode || result?.code || "UNKNOWN",
      message: result?.message || "文件暂时不可用",
    };
    render();
    return result || { success: false, code: "FILE_READ_FAILED" };
  }

  const previousNotes = task.notes;
  const previousKnowledgeNote = { ...task.knowledgeNote };
  const previousTaskUpdatedAt = task.updatedAt;
  task.notes = result.content;
  task.knowledgeNote = knowledgeDocument.markDocumentSaved(previousKnowledgeNote, result);
  if (result.readOnly) task.knowledgeNote = knowledgeDocument.markDocumentReadOnly(task.knowledgeNote);
  task.knowledgeNote.updatedAt = now();
  task.updatedAt = now();
  save();
  if (!(await flushSave())) {
    task.notes = previousNotes;
    task.knowledgeNote = previousKnowledgeNote;
    task.updatedAt = previousTaskUpdatedAt;
    save();
    render();
    return {
      success: false,
      code: "TASK_DATA_SAVE_FAILED",
      message: "磁盘文件读取成功，但冲突状态未能安全持久化；当前编辑内容与 Recovery 已保留。",
    };
  }

  rememberKnowledgeAssetFiles(result.assetFiles);
  rememberKnowledgeAssetDiagnostics(note.noteId, result);
  delete state.knowledgeFileIssues[note.noteId];
  try {
    await syncKnowledgeFileWatcher(task);
  } catch (error) {
    console.error("Failed to update knowledge file watcher baseline after reload.", error);
  }
  knowledgeExternalSnapshots.delete(note.noteId);
  await clearKnowledgeRecoveryRecord(note.noteId);
  return result;
}

async function relocateKnowledgeTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const note = task?.knowledgeNote;
  if (!task || !desktopKnowledgeFile?.choose) return { success: false, code: "CHOOSE_UNAVAILABLE" };
  if (note.dirty && !(await confirmDestructiveAction("重新定位将使用新文件内容替换当前知识笔记，是否继续？"))) {
    return { canceled: true };
  }
  const result = await desktopKnowledgeFile.choose({ boundPaths: boundKnowledgeFilePaths(task.id) });
  if (result?.canceled) return result;
  if (!result?.success) {
    alert(result?.code === "DUPLICATE_BINDING" ? "这篇知识笔记已绑定该文件路径，请选择其他文件。" : `重新定位失败：${knowledgeFileFailure(result)}`);
    return result || { success: false, code: "FILE_READ_FAILED" };
  }

  task.notes = result.content;
  rememberKnowledgeAssetFiles(result.assetFiles);
  rememberKnowledgeAssetDiagnostics(note.noteId, result);
  task.knowledgeNote = knowledgeDocument.markDocumentSaved(note, result);
  if (result.readOnly) task.knowledgeNote = knowledgeDocument.markDocumentReadOnly(task.knowledgeNote);
  task.knowledgeNote.updatedAt = now();
  task.updatedAt = now();
  knowledgeExternalSnapshots.delete(note.noteId);
  await clearKnowledgeRecoveryRecord(note.noteId);
  save();
  await syncKnowledgeFileWatcher(task);
  return result;
}

async function removeKnowledgeBinding(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const note = task?.knowledgeNote;
  if (!task || !note?.filePath) return { success: false, code: "NO_FILE_BINDING" };
  const confirmed = await confirmDestructiveAction("只从软件中移除这篇知识笔记的文件绑定？Markdown 文件和附件会保留在磁盘上。");
  if (!confirmed) return { canceled: true };
  if (desktopKnowledgeFile?.unwatch) {
    void desktopKnowledgeFile.unwatch({ noteId: note.noteId || task.id });
  }
  knowledgeExternalSnapshots.delete(note.noteId || task.id);
  task.knowledgeNote = {
    ...note,
    filePath: null,
    documentState: "DRAFT",
    dirty: false,
    lastSavedHash: null,
    lastSavedMtime: null,
    updatedAt: now(),
  };
  task.updatedAt = now();
  save();
  return { success: true };
}

async function discardUnfiledKnowledgeDraft(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.knowledgeNote?.filePath) return { success: false, code: "FILE_BOUND" };
  await clearKnowledgeRecoveryRecord(task.knowledgeNote?.noteId || task.id);
  task.notes = "";
  task.knowledgeNote = {
    ...task.knowledgeNote,
    filePath: null,
    documentState: "DRAFT",
    dirty: false,
    lastSavedHash: null,
    lastSavedMtime: null,
    updatedAt: now(),
  };
  task.updatedAt = now();
  save();
  return { success: true };
}

async function closeKnowledgeEditor(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return { success: false, code: "TASK_NOT_FOUND" };
  if (task.knowledgeNote?.documentState === "DRAFT" && String(task.notes || "").trim()) {
    state.knowledgeDraftPrompt = { taskId, mode: "close-editor" };
    render();
    return { success: false, code: "DRAFT_REQUIRES_DECISION" };
  }
  state.taskPane = "flow";
  return { success: true };
}

async function handleKnowledgeFileChange(event) {
  const noteId = String(event?.noteId || "").trim();
  const task = state.tasks.find((item) => item.knowledgeNote?.noteId === noteId || item.id === noteId);
  if (!task || !event?.filePath) return;
  const note = task.knowledgeNote;
  if (note.filePath && knowledgeDocument.canonicalFilePath(note.filePath, desktopPlatform) !== knowledgeDocument.canonicalFilePath(event.filePath, desktopPlatform)) return;

  if (event.type === "baseline") {
    rememberKnowledgeAssetDiagnostics(note.noteId, event);
    rememberKnowledgeAssetFiles(event.assetFiles);
    if (note.documentState === "SAVED") {
      task.knowledgeNote = knowledgeDocument.markDocumentSaved(note, event);
      save();
      if (event.assetFiles?.length) render();
    }
    return;
  }
  if (event.type === "read-only") {
    task.knowledgeNote = knowledgeDocument.markDocumentReadOnly(note);
    save();
    render();
    return;
  }
  if (event.type === "file-missing") {
    delete state.knowledgeFileIssues[note.noteId];
    task.knowledgeNote = knowledgeDocument.markDocumentFileMissing(note);
    save();
    render();
    return;
  }
  if (event.type === "file-unavailable") {
    state.knowledgeFileIssues[note.noteId] = {
      code: event.errorCode || "UNKNOWN",
      message: event.message || "文件暂时不可用",
    };
    render();
    return;
  }
  if (event.type !== "external-changed" || !event.success) return;

  knowledgeExternalSnapshots.set(note.noteId, event);
  if (note.documentState === "SAVED") {
    task.notes = event.content;
    rememberKnowledgeAssetFiles(event.assetFiles);
    rememberKnowledgeAssetDiagnostics(note.noteId, event);
    task.knowledgeNote = knowledgeDocument.markDocumentSaved(note, event);
    task.knowledgeNote.updatedAt = now();
    task.updatedAt = now();
    knowledgeExternalSnapshots.delete(note.noteId);
    await clearKnowledgeRecoveryRecord(note.noteId);
    save();
    await syncKnowledgeFileWatcher(task);
    render();
    return;
  }

  task.knowledgeNote = knowledgeDocument.markDocumentExternalChanged(note);
  task.knowledgeNote.updatedAt = now();
  task.updatedAt = now();
  save();
  render();
}

async function saveKnowledgeTask(taskId, { saveAs = false, allowExternalOverwrite = false } = {}) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return { canceled: true };
  if (!desktopKnowledgeFile?.save) {
    alert("当前环境不支持将知识笔记保存为本地文件，请在桌面应用中使用。");
    return { canceled: true, unsupported: true };
  }

  const note = task.knowledgeNote;
  if (note.documentState === "EXTERNAL_CHANGED" && !saveAs && !allowExternalOverwrite) {
    const result = {
      success: false,
      code: "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION",
      message: "文件已被外部修改，请先重新加载、明确覆盖或另存为。",
    };
    alert(result.message);
    return result;
  }
  if (note.documentState === "FILE_MISSING" && !saveAs) {
    const result = {
      success: false,
      code: "FILE_MISSING_REQUIRES_RELOCATION",
      message: "原文件不存在，请重新定位文件或使用另存为。",
    };
    alert(result.message);
    return result;
  }

  captureMountedMilkdownDrafts();
  flushNodeNoteDraft(noteDraftKey(task.id, ""), { persist: true });
  const contentBeforeSave = task.notes;
  const sessionBeforeSave = { ...task.knowledgeNote };
  const taskUpdatedAtBeforeSave = task.updatedAt;
  try {
    const fileCheck = await verifyKnowledgeFileBeforeSave(task, { saveAs, allowExternalOverwrite });
    if (fileCheck) {
      if (fileCheck.code === "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION") {
        alert(fileCheck.message);
      } else {
        alert(`知识笔记保存前读取失败：${fileCheck.message || "未知文件错误"}`);
      }
      return fileCheck;
    }
    const stagedAssets = await stageKnowledgeAssetsForTask(task, task.notes);
    if (stagedAssets?.success === false) {
      alert(`知识笔记图片暂存失败：${stagedAssets.message || "未知资源错误"}\n当前内容未清除，请重试。`);
      return stagedAssets;
    }
    const result = await desktopKnowledgeFile.save({
      noteId: note.noteId || task.id,
      filePath: saveAs ? "" : note.filePath,
      saveAs,
      title: task.title,
      content: task.notes,
      assets: stagedAssets.assets,
      expectedLastSavedHash: saveAs ? null : sessionBeforeSave.lastSavedHash,
      allowExternalOverwrite,
      boundPaths: boundKnowledgeFilePaths(task.id),
    });
    if (result?.canceled) return result;
    if (!result?.success) {
      if (result?.code === "DUPLICATE_BINDING") {
        alert("这篇知识笔记已绑定该文件路径，请选择其他文件。");
      } else {
        alert(`知识笔记保存失败：${result?.message || "未知文件错误"}\n请重试；如仍失败，可使用“另存为”。`);
      }
      return result || { success: false };
    }

    task.notes = result.content ?? task.notes;
    rememberKnowledgeAssetFiles(result.assetFiles);
    task.knowledgeNote = knowledgeDocument.markDocumentSaved(sessionBeforeSave, result);
    task.knowledgeNote.updatedAt = now();
    task.updatedAt = now();
    save();
    const taskDataSaved = await flushSave();
    if (!taskDataSaved) {
      if (allowExternalOverwrite && sessionBeforeSave.documentState === "EXTERNAL_CHANGED") {
        task.notes = contentBeforeSave;
        task.knowledgeNote = sessionBeforeSave;
        task.updatedAt = taskUpdatedAtBeforeSave;
        save();
      }
      return {
        success: false,
        code: "TASK_DATA_SAVE_FAILED",
        message: "Markdown 已保存，但任务数据未能持久化；Recovery 草稿已保留，请重试。",
        markdownSaved: true,
      };
    }
    try {
      await syncKnowledgeFileWatcher(task);
    } catch (error) {
      console.error("Failed to update knowledge file watcher baseline after save.", error);
    }
    knowledgeExternalSnapshots.delete(task.knowledgeNote.noteId);
    await clearKnowledgeRecoveryRecord(task.knowledgeNote.noteId);
    return result;
  } catch (error) {
    console.error("Failed to save knowledge note.", error);
    alert(`知识笔记保存失败：${error?.message || "未知文件错误"}\n请重试；如仍失败，可使用“另存为”。`);
    return { success: false, code: "SAVE_FAILED", message: error?.message || "未知文件错误", error };
  }
}


// ============================================================
// DATA PERSISTENCE (save / flush / normalize)
// ============================================================
/**
 * Load all app data from Electron IPC storage, falling back to localStorage.
 * Normalizes all fields and returns a complete data object.
 * @returns {Promise<object>} { tasks, taskGroups, activeGroupId, flowWidths, ... }
 */
async function loadAppData() {
  if (desktopStorage?.read) {
    try {
      const stored = await desktopStorage.read();
      const tasks = stored && Array.isArray(stored.tasks) ? normalizeTasks(stored.tasks) : [];
      const taskGroups = normalizeTaskGroups(stored?.taskGroups, tasks);
      const activeGroupId = normalizeActiveGroupId(stored?.activeGroupId, taskGroups);
      const flowWidths = normalizeLoadedFlowWidths(stored?.flowWidths || {});
      const theme = normalizeTheme(stored?.theme);
      const legacy = migrateLegacyFont(stored?.font);
      const zhFont = normalizeZhFont(stored?.zhFont || legacy.zhFont);
      const enFont = normalizeEnFont(stored?.enFont || legacy.enFont);
      const taskFilter = normalizeTaskFilter(stored?.taskFilter);
      const priorityFilter = normalizePriorityFilter(stored?.priorityFilter);
      const newTaskPriority = normalizePriority(stored?.newTaskPriority);
      const sidebarWidth = normalizeSidebarWidth(stored?.sidebarWidth);
      const detailHeight = normalizeDetailHeight(stored?.detailHeight);
      const attachments = normalizeAttachments(stored?.attachments);
      const installationId = normalizeInstallationId(stored?.installationId);
      return { tasks, taskGroups, activeGroupId, flowWidths, sidebarWidth, detailHeight, attachments, theme, zhFont, enFont, taskFilter, priorityFilter, newTaskPriority, installationId };
    } catch (error) {
      console.error("Failed to read local task data.", error);
      if (error?.code === "CORRUPT_TASK_DATA") {
        alert("本地任务数据已损坏，应用已保留损坏文件备份。请先复制备份文件后再继续操作。");
      }
    }
  }

  const tasks = loadBrowserTasks();
  const taskGroups = loadBrowserTaskGroups(tasks);
  const typography = loadBrowserTypography();
  const preferences = loadBrowserPreferences();
  return {
    tasks,
    taskGroups,
    activeGroupId: normalizeActiveGroupId(localStorage.getItem(ACTIVE_GROUP_KEY), taskGroups),
    flowWidths: loadBrowserFlowWidths(),
    sidebarWidth: loadBrowserSidebarWidth(),
    detailHeight: loadBrowserDetailHeight(),
    attachments: loadBrowserAttachments(),
    installationId: loadBrowserInstallationId(),
    theme: loadBrowserTheme(),
    ...typography,
    ...preferences,
  };
}

/**
 * Save current state. In Electron environment, queues an async write.
 * In browser environment, writes directly to individual localStorage keys.
 */
function save() {
  const payload = {
    version: DATA_VERSION,
    knowledgeSchemaVersion: KNOWLEDGE_MIGRATION_VERSION,
    tasks: state.tasks,
    taskGroups: state.taskGroups,
    activeGroupId: state.activeGroupId,
    flowWidths: state.flowWidths,
    sidebarWidth: state.sidebarWidth,
    detailHeight: state.detailHeight,
    attachments: state.attachments,
    theme: state.theme,
    zhFont: state.zhFont,
    enFont: state.enFont,
    taskFilter: state.taskFilter,
    priorityFilter: state.priorityFilter,
    newTaskPriority: state.newTaskPriority,
    installationId: state.installationId,
    updatedAt: now(),
  };

  if (!desktopStorage?.write) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    localStorage.setItem(TASK_GROUPS_KEY, JSON.stringify(state.taskGroups));
    localStorage.setItem(ACTIVE_GROUP_KEY, state.activeGroupId);
    localStorage.setItem(FLOW_WIDTH_KEY, JSON.stringify(state.flowWidths));
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(state.sidebarWidth));
    localStorage.setItem(DETAIL_HEIGHT_KEY, String(state.detailHeight));
    localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(state.attachments));
    localStorage.setItem(THEME_KEY, state.theme);
    localStorage.setItem(ZH_FONT_KEY, state.zhFont);
    localStorage.setItem(EN_FONT_KEY, state.enFont);
    localStorage.setItem(TASK_FILTER_KEY, state.taskFilter);
    localStorage.setItem(PRIORITY_FILTER_KEY, state.priorityFilter);
    localStorage.setItem(NEW_TASK_PRIORITY_KEY, state.newTaskPriority);
    localStorage.setItem(INSTALLATION_ID_KEY, state.installationId);
    return;
  }

  pendingPayload = payload;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSave, 80);
}

function saveFlowWidths() {
  save();
}

/**
 * Flush pending save payload to Electron IPC storage.
 * Uses a save-in-flight flag to prevent concurrent writes.
 */
async function flushSave() {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  if (!desktopStorage?.write) return true;
  if (saveInFlight) return saveInFlightPromise ? saveInFlightPromise.then(() => flushSave()) : false;
  if (!pendingPayload) return true;
  const payload = pendingPayload;
  pendingPayload = null;
  saveInFlight = true;
  saveInFlightPromise = (async () => {
    try {
      await desktopStorage.write(payload);
      return true;
    } catch (error) {
      console.error("Failed to save local task data.", error);
      if (!pendingPayload) pendingPayload = payload;
      alert("本地任务数据保存失败，请检查磁盘空间或权限后重试。Recovery 草稿将继续保留。");
      return false;
    }
  })();
  const success = await saveInFlightPromise;
  saveInFlight = false;
  saveInFlightPromise = null;
  if (pendingPayload && success) return (await flushSave()) && success;
  return success;
}

function normalizeFlowWidth(key, value) {
  const [min, max] = flowWidthLimits[key];
  const width = Number(value);
  if (!Number.isFinite(width)) return defaultFlowWidths[key];
  return Math.max(min, Math.min(max, Math.round(width)));
}

function normalizeSidebarWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) return defaultSidebarWidth;
  return Math.max(sidebarWidthLimits[0], Math.min(sidebarWidthLimits[1], Math.round(width)));
}

function normalizeDetailHeight(value) {
  const height = Number(value);
  if (!Number.isFinite(height)) return defaultDetailHeight;
  return Math.max(detailHeightLimits[0], Math.min(detailHeightLimits[1], Math.round(height)));
}

function flowWidthStyle() {
  return Object.entries(defaultFlowWidths)
    .flatMap(([key]) => {
      const width = normalizeFlowWidth(key, state.flowWidths[key]);
      return [`--flow-${key}-width:${width}px`, `--flow-${key}-track:${width}fr`];
    })
    .join(";");
}

function workbenchStyle() {
  const detailHeight = normalizeDetailHeight(state.detailHeight);
  return `--detail-pane-height:${detailHeight}%;--flow-pane-height:${100 - detailHeight}%`;
}


// ============================================================
// RENDERING -- main render() and all DOM builders
// ============================================================
/**
 * Main render entry: reconstruct the entire DOM from state.
 * Sequence: capture drafts -> flush drafts -> save -> destroy editors
 *   -> set theme/font -> rebuild innerHTML -> bind -> mount editors
 * This is called after every state change.
 */
function render() {
  captureMountedMilkdownDrafts();
  flushNodeNoteDrafts({ persist: false });
  save();
  stashKnowledgePane();
  destroyMilkdownEditors(cachedKnowledgePane ? new Set([noteDraftKey(cachedKnowledgePane.taskId, "")]) : new Set());
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.zhFont = state.zhFont;
  document.documentElement.dataset.enFont = state.enFont;
  const task = activeTask();
  if (task) state.activeTaskId = task.id;
  if (recurrencePopoverTaskId && recurrencePopoverTaskId !== task?.id) recurrencePopoverTaskId = "";
  document.querySelector("#root").innerHTML = `
    <main class="ops-app app" style="--sidebar-width:${normalizeSidebarWidth(state.sidebarWidth)}px">
      ${renderSidebar()}
      <section class="workspace">
        ${task ? renderTaskPage(task) : renderEmptyPage()}
      </section>
      <div id="context-menu-root">${renderContextMenu()}</div>
      ${state.settingsOpen ? renderSettingsPanel() : ""}
      ${state.calendarOpen ? renderCalendarPanel() : ""}
      ${state.reviewOpen ? renderReviewPanel() : ""}
      ${state.feedbackOpen ? renderBugReportPanel() : ""}
    </main>
    ${renderCompletionNotice()}
    ${renderTodayWidgetRestore()}
    ${renderKnowledgeDraftPrompt()}
  `;
  restoreCachedKnowledgePane(task);
  bind();
  resizeTaskBriefTextareas();
  focusPendingElement();
  publishTodayWidgetSnapshot();
  publishDeadlineReminderSnapshot();
  window.requestAnimationFrame(() => mountMilkdownEditors());
}

function renderCompletionNotice() {
  const task = state.tasks.find((item) => item.id === state.conclusionPromptTaskId);
  return task
    ? `<div class="completion-notice" role="status" aria-live="polite">请先填写结论，再标记完成</div>`
    : "";
}

function renderTodayWidgetRestore() {
  return desktopTodayWidget && !todayWidgetWindowState.visible
    ? `<button class="restore-widget is-visible" type="button" data-action="show-today-widget">重新显示今日窗口</button>`
    : "";
}

function renderKnowledgeDraftPrompt() {
  const taskId = state.knowledgeDraftPrompt?.taskId;
  const mode = state.knowledgeDraftPrompt?.mode || "delete-task";
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return "";
  const closingEditor = mode === "close-editor";
  return `
    <div class="knowledge-draft-backdrop" role="presentation">
      <section class="knowledge-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-draft-title">
        <div class="knowledge-draft-heading">
          <span class="knowledge-draft-kicker">知识笔记</span>
          <h2 id="knowledge-draft-title">${closingEditor ? "关闭前如何处理这篇草稿？" : "这篇笔记尚未保存为本地文件"}</h2>
          <p>${closingEditor ? "保存会打开文件选择；保留会关闭编辑页但继续保护草稿。" : "你可以先保存文件，也可以保留草稿。删除草稿不会删除任何本地 Markdown 文件或附件。"}</p>
        </div>
        <div class="knowledge-draft-context">${esc(task.title || "未命名任务")}</div>
        <div class="knowledge-draft-actions">
          <button type="button" data-action="keep-knowledge-draft" data-task-id="${task.id}">保留为草稿</button>
          <button type="button" data-action="delete-knowledge-draft" data-task-id="${task.id}">删除草稿</button>
          <button class="primary" type="button" data-action="${closingEditor ? "save-knowledge-before-close" : "save-knowledge-before-delete"}" data-task-id="${task.id}">保存</button>
        </div>
      </section>
    </div>
  `;
}

function renderSidebar() {
  const visibleCount = filteredTasks().length;
  const scopedTasks = taskListStatsTasks();
  const openCount = scopedTasks.filter((task) => task.status !== "done").length;
  const blockedCount = scopedTasks.filter((task) => task.tags.blocked || flatten(task.nodes).some((node) => node.status === "blocked")).length;
  const focusItems = todayFocusItems();
  return `
    <aside class="sidebar rail">
      <span class="sidebar-resizer" data-sidebar-resizer title="调整侧栏宽度"></span>
      <div class="sidebar-head brand">
        <div>
          <strong>Task Track</strong>
        </div>
        <span>v${esc(APP_VERSION || "dev")}</span>
      </div>

      ${renderTodayFocus(focusItems)}

      <div class="task-list" data-context="task-list">
        <div class="task-list-head section-label">
          <span class="task-list-count">${visibleCount} / ${scopedTasks.length} 项</span>
          <label class="search-box search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35"></path><circle cx="10.8" cy="10.8" r="7.2"></circle></svg>
            <input id="search" value="${escAttr(state.query)}" placeholder="" aria-label="搜索任务、节点或内容" />
            <span class="search-shortcut" aria-hidden="true">⌘ K</span>
          </label>
        </div>
        <div class="task-repository-toolbar">
          <div class="task-status-filters" role="group" aria-label="任务状态筛选">
            ${[
              ["all", "全部"],
              ["active", "未完成"],
              ["done", "已完成"],
            ]
              .map(
                ([value, label]) => `<button class="${state.taskFilter === value ? "active" : ""}" type="button" data-setting-button="task-filter" data-value="${value}">${label}</button>`,
              )
              .join("")}
          </div>
          <label class="task-priority-filter">
            <span>优先级 ·</span>
            ${filterSelectHtml("priority-filter", state.priorityFilter, repositoryPriorityFilterLabels, "按优先级筛选")}
          </label>
        </div>
        <div class="task-repository-rows">${renderTaskRepositoryRows()}</div>
      </div>
      <section class="group-panel" aria-label="任务分组">
        ${renderGroupTabs()}
      </section>
      <div class="sidebar-foot task-footer">
        <button class="settings-trigger settings-button ${state.settingsOpen ? "active" : ""}" type="button" data-action="toggle-settings" title="设置" aria-label="设置">⚙</button>
        <button
          class="theme-toggle ${state.theme === "dark" ? "active" : ""}"
          type="button"
          data-action="toggle-theme"
          title="${state.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}"
          aria-label="${state.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}"
          aria-pressed="${state.theme === "dark"}"
        >${state.theme === "dark" ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"></path></svg>`}</button>
        <span class="autosave-status">自动保存已开启</span>
        <button class="review-shortcut calendar-shortcut" type="button" data-action="toggle-calendar">日历</button>
      </div>
    </aside>
  `;
}

function renderTodayFocus(items) {
  const today = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date());
  return `
    <section class="today-focus today-panel" aria-label="今日待办">
      <div class="today-headline">
        <strong>今日任务</strong>
        <time class="today-date" datetime="${escAttr(new Date().toISOString())}">${today}</time>
        <span><b>${items.length}</b> 项待办</span>
      </div>
      <div class="focus-list focus-stack">
        ${
          items.length
            ? items.map((item) => renderTodayFocusItem(item)).join("")
            : `<div class="focus-empty">今日暂无重点任务</div>`
        }
      </div>
    </section>
  `;
}

function renderTodayFocusItem(item) {
  const { task, node, kind, nextText } = item;
  // Today focus represents a task, not the currently opened flow node. A task
  // must remain visibly selected even when its suggested next step is different.
  const selected = task.id === state.activeTaskId;
  return `
    <article class="focus-item focus-row ${kind} ${selected ? "selected" : ""}" role="button" tabindex="0" data-action="select-focus" data-task-id="${task.id}" data-node-id="${node?.id || ""}">
      <span class="row-title"><strong>${esc(task.title || "未命名任务")}</strong><span>下一步：${esc(nextText)}</span></span>
    </article>
  `;
}

function renderGroupTabs() {
  return `
    <div class="sheet-bar group-nav" aria-label="任务分组">
      <button class="sheet-nav scroll-button" type="button" data-action="scroll-sheets" data-direction="-1" title="查看前面的分组" aria-label="查看前面的分组">‹</button>
      <div class="sheet-tabs task-tabs" data-sheet-tabs>
        ${sort(state.taskGroups)
          .map(
            (group) => `
              <span class="sheet-tab-wrap" draggable="true" data-group-id="${group.id}">
                ${
                  state.editingGroupId === group.id
                    ? `<input class="sheet-edit" data-group-title="${group.id}" value="${escAttr(group.title)}" aria-label="分组名称" />`
                    : `<button class="sheet-tab ${group.id === state.activeGroupId ? "active" : ""}" type="button" data-action="select-group" data-group-id="${group.id}" title="${escAttr(group.title)}">${esc(group.title)}</button>`
                }
              </span>
            `,
          )
          .join("")}
      </div>
      <button class="sheet-nav scroll-button" type="button" data-action="scroll-sheets" data-direction="1" title="查看后面的分组" aria-label="查看后面的分组">›</button>
      <button class="sheet-add add-group-button" type="button" data-action="add-group" title="新增分组" aria-label="新增分组">+</button>
    </div>
  `;
}

function renderTaskItem(task, displayOrder) {
  const subtitle = taskSubtitle(task);
  return `
    <div class="task-item task-row ${task.id === state.activeTaskId ? "selected active" : ""} ${task.status === "done" ? "done" : ""}" draggable="true" data-context="task" data-task-id="${task.id}" data-task-drag-target="${task.id}">
      <span class="task-sequence" aria-hidden="true">${String(displayOrder).padStart(2, "0")}</span>
      <span class="task-title-wrap row-title">
        <input class="task-title" placeholder="任务标题" aria-label="任务标题" data-edit-key="title" data-task-id="${task.id}" value="${escAttr(task.title)}" />
        <span class="task-next-line">下一步：${esc(subtitle)}</span>
      </span>
      <span class="task-row-meta">
        ${renderTaskDeadlineBadge(task)}
        <span class="task-priority-control ${task.priority}">${selectHtml("priority", task.priority, repositoryPriorityLabels, task.id)}</span>
      </span>
      <button class="task-check repository-complete ${task.status === "done" ? "is-checked" : ""}" type="button" title="${task.status === "done" ? "标记为未完成" : "标记为完成"}" aria-label="${task.status === "done" ? "标记为未完成" : "标记为完成"}" aria-pressed="${task.status === "done"}" data-action="toggle-task-done" data-task-id="${task.id}"></button>
    </div>
  `;
}

function renderTaskRepositoryRows() {
  return filteredTasks()
    .map((task, index) => renderTaskItem(task, index + 1))
    .join("");
}

function refreshTaskRepository() {
  const scopedTasks = taskListStatsTasks();
  const count = document.querySelector(".task-list-count");
  const rows = document.querySelector(".task-repository-rows");
  if (count) count.textContent = `${filteredTasks().length} / ${scopedTasks.length} 项`;
  if (!rows) return;
  rows.innerHTML = renderTaskRepositoryRows();
  bindTaskRepositoryRows(rows);
}

function taskSubtitle(task) {
  const nextNode = nextOpenNode(task.nodes);
  if (nextNode?.title?.trim()) return nextNode.title.trim();
  if (task.status === "done") return "已完成";
  const text = (task.description || task.hypothesis || task.conclusion || "").trim();
  return text || "等待补充处理流";
}

function renderTaskPage(task) {
  const topNodes = sort(task.nodes);
  const selectedNode = state.selectedNodeId ? findNode(task.nodes, state.selectedNodeId) : null;
  const summary = taskSummary(task);
  const needsConclusion = state.conclusionPromptTaskId === task.id && !task.conclusion.trim();
  return `
    <div class="task-page work-surface">
      <header class="page-header topbar">
        <div class="page-title-block title-block">
          <input class="page-title" aria-label="任务标题" data-edit-key="title" data-task-id="${task.id}" value="${escAttr(task.title)}" />
          <div class="page-properties meta-line">
            ${renderTaskActiveTagPills(task)}
            <span class="task-context-item priority ${task.priority}">${priorityLabels[task.priority]}优先</span>
            <span class="task-context-item status ${task.status === "done" ? "resolved" : "attention"}">${task.status === "done" ? "已完成" : "处理中"}</span>
            <span class="task-context-progress">${summary.done}/${summary.total || 0} 节点</span>
            <label class="task-context-group"><span>分组</span>${selectHtml("groupId", task.groupId, taskGroupOptions(), task.id)}</label>
            ${renderTaskDeadlineControl(task)}
            ${renderTaskRecurrenceControls(task)}
          </div>
        </div>
        <div class="actions">
          <button class="share-trigger icon-button" type="button" data-action="share-task" data-task-id="${task.id}" title="分享任务" aria-label="分享任务">
            分享
          </button>
        </div>
      </header>

      <section class="task-brief brief-strip" aria-label="任务简报">
        ${renderBriefField("背景", textareaHtml("description", task.description, task.id), "", false, "background")}
        ${renderBriefField("进展", textareaHtml("hypothesis", task.hypothesis, task.id), task.hypothesisUpdatedAt, false, "hypothesis", summary)}
        ${renderBriefField("结论", textareaHtml("conclusion", task.conclusion, task.id), "", needsConclusion, "conclusion")}
      </section>

      ${renderTaskPaneTabs(task)}

      <section class="task-workbench lower">
        ${state.taskPane === "flow" ? `<section class="flow-section flow" data-context="flow-root" data-task-id="${task.id}">
          ${
            topNodes.length
              ? `<div class="flow-list flow-table" style="${flowWidthStyle()};--flow-visible-row-count:${visibleFlowRowCount(topNodes)}" data-context="flow-root" data-task-id="${task.id}">${renderFlowSplitResizer()}${topNodes.map((node, index) => renderFlowNode(task.id, node, 0, index, [], index === topNodes.length - 1)).join("")}</div>`
              : `<div class="flow-list flow-table empty-flow" data-context="flow-root" data-task-id="${task.id}"></div>`
          }
        </section>` : state.taskPane === "notes" ? renderTaskKnowledge(task) : renderTaskHistory(task)}

        ${selectedNode && state.taskPane === "flow" ? renderNodeDetail(task.id, selectedNode) : ""}
      </section>
    </div>
  `;
}

function renderTaskPaneTabs(task) {
  const tabs = [
    ["flow", "处理流"],
    ["notes", "知识笔记"],
    ["history", "历史处理"],
  ];
  return `
    <nav class="task-pane-tabs" aria-label="任务内容">
      ${tabs
        .map(
          ([pane, label]) => `<button class="task-pane-tab ${state.taskPane === pane ? "active" : ""}" type="button" data-action="switch-task-pane" data-pane="${pane}">${label}</button>`,
        )
        .join("")}
      ${state.taskPane === "flow" && flatten(task.nodes).some((node) => node.children.length) ? `<button class="task-pane-collapse" type="button" data-action="toggle-all-nodes" data-task-id="${task.id}">${flatten(task.nodes).some((node) => node.collapsed) ? "展开全部" : "收起全部"}</button>` : ""}
    </nav>
  `;
}

function renderTaskKnowledge(task) {
  const stats = markdownStats(task.notes);
  const note = task.knowledgeNote || {};
  const unavailable = state.knowledgeFileIssues[note.noteId];
  const stateDetails = {
    DRAFT: { label: "草稿", detail: "尚未保存到本地文件" },
    SAVED: { label: "已保存", detail: note.filePath || "本地文件" },
    DIRTY: { label: "已修改", detail: note.filePath || "尚未保存到本地文件" },
    EXTERNAL_CHANGED: { label: "⚠ 文件已被外部修改", detail: note.filePath || "请先选择处理方式" },
    FILE_MISSING: { label: "⚠ 本地文件不存在", detail: note.filePath || "请重新定位或另存为" },
    READ_ONLY: { label: "⚠ 当前文件不可写", detail: note.filePath || "请重试或另存为" },
  };
  const stateDetail = unavailable
    ? { label: "⚠ 文件暂时不可用", detail: unavailable.message }
    : stateDetails[note.documentState] || stateDetails.DRAFT;
  const stateClass = String(note.documentState || "DRAFT").toLowerCase();
  const conflictActions = note.documentState === "EXTERNAL_CHANGED"
    ? `<button type="button" data-action="reload-knowledge" data-task-id="${task.id}">重新加载</button>
       <button type="button" data-action="save-knowledge-overwrite" data-task-id="${task.id}">仍然覆盖</button>`
    : note.documentState === "FILE_MISSING"
      ? `<button type="button" data-action="relocate-knowledge" data-task-id="${task.id}">重新定位</button>`
      : note.documentState === "READ_ONLY"
        ? `<button type="button" data-action="retry-knowledge" data-task-id="${task.id}">重试</button>`
      : "";
  const removeBindingAction = note.filePath
    ? `<button type="button" data-action="remove-knowledge-binding" data-task-id="${task.id}">从软件中移除</button>`
    : "";
  const closeDraftAction = note.documentState === "DRAFT"
    ? `<button type="button" data-action="close-knowledge-editor" data-task-id="${task.id}">关闭笔记</button>`
    : "";
  return `
    <section class="task-knowledge-pane" data-task-id="${task.id}">
      <section class="markdown-panel milkdown-panel task-knowledge-editor-panel" data-task-id="${task.id}" data-editor-focus-target="task">
        <div class="knowledge-save-bar">
          <div class="knowledge-state-meta state-${stateClass}" data-knowledge-state="${escAttr(note.documentState || "DRAFT")}" aria-live="polite">
            <span class="knowledge-state-label">${esc(stateDetail.label)}</span>
            <span class="knowledge-file-label" title="${escAttr(stateDetail.detail)}">${esc(stateDetail.detail)}</span>
          </div>
          <div class="knowledge-save-actions">
            ${conflictActions}
            ${removeBindingAction}
            ${closeDraftAction}
            <button type="button" data-action="save-knowledge" data-task-id="${task.id}">保存</button>
            <button type="button" data-action="save-knowledge-as" data-task-id="${task.id}">另存为</button>
          </div>
        </div>
        <div class="milkdown-editor-host" data-editor-kind="task" data-task-id="${task.id}">
          <div class="milkdown-loading">正在加载 Milkdown 编辑器...</div>
        </div>
        <div class="milkdown-status">
          <span class="markdown-stats" data-markdown-stats>${stats.lines} 行 · ${stats.characters} 字</span>
          <span>支持 Markdown、表格、代码块与图片</span>
        </div>
      </section>
    </section>
  `;
}

function renderTaskHistory(task) {
  const events = flatten(task.nodes)
    .filter((node) => node.updatedAt)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return `
    <section class="task-history-pane">
      <div class="task-history-list">
        ${
          events.length
            ? events
                .map(
                  (node) => `<article class="task-history-item"><time>${formatShort(node.updatedAt)}</time><span>${esc(node.title || "未命名节点")}</span><b>${nodeStatusText(node.status)}</b></article>`,
                )
                .join("")
            : `<div class="task-history-empty">暂无历史记录</div>`
        }
      </div>
    </section>
  `;
}

function visibleFlowRowCount(nodes) {
  return nodes.reduce(
    (count, node) => count + 1 + (node.collapsed ? 0 : visibleFlowRowCount(node.children || [])),
    0,
  );
}

function renderFlowSplitResizer() {
  const total = normalizeFlowWidth("title", state.flowWidths.title) + normalizeFlowWidth("note", state.flowWidths.note);
  const bounds = flowSplitBounds(total);
  const titleWidth = Math.max(bounds.min, Math.min(bounds.max, normalizeFlowWidth("title", state.flowWidths.title)));
  const percentage = Math.round((titleWidth / total) * 100);
  return `<span class="flow-split-layer"><span class="flow-split-resizer" role="separator" tabindex="0" aria-label="调整处理标题与记录宽度" aria-orientation="vertical" aria-valuemin="${Math.round((bounds.min / total) * 100)}" aria-valuemax="${Math.round((bounds.max / total) * 100)}" aria-valuenow="${percentage}" aria-valuetext="标题 ${percentage}% · 记录 ${100 - percentage}%" data-flow-split-resizer title="拖拽调整处理标题与记录宽度"></span></span>`;
}

function renderTaskTagButton(task, tag, label) {
  const active = normalizeTaskTags(task.tags)[tag];
  return `<button class="task-tag-toggle ${active ? "active" : ""}" type="button" data-action="toggle-task-tag" data-task-id="${task.id}" data-tag="${tag}">${label}</button>`;
}

function renderTaskTagRow(task) {
  return `
    <div class="task-tag-row">
      ${Object.entries(taskTagLabels).map(([tag, label]) => renderTaskTagButton(task, tag, label)).join("")}
    </div>
  `;
}

function renderTaskActiveTagPills(task) {
  return Object.entries(normalizeTaskTags(task.tags))
    .filter(([, active]) => active)
    .map(([tag]) => `<span class="task-context-item task-tag">${taskTagLabels[tag]}</span>`)
    .join("");
}

function renderTaskDeadlineBadge(task, at = new Date()) {
  const deadline = safeDate(task.deadlineAt);
  if (!deadline) return "";
  const status = taskDeadlineStatus(task, at);
  const label = status === "overdue"
    ? `逾期 ${taskDateFilterLabel(localDateKey(deadline))}`
    : localDateKey(deadline) === localDateKey(at)
      ? `今天 ${String(deadline.getHours()).padStart(2, "0")}:${String(deadline.getMinutes()).padStart(2, "0")}`
      : taskDateFilterLabel(localDateKey(deadline));
  return `<time class="task-deadline-badge ${status}" datetime="${escAttr(deadline.toISOString())}" title="截止：${escAttr(formatMinuteStamp(deadline))}">${esc(label)}</time>`;
}

function renderTaskDeadlineControl(task) {
  const deadline = safeDate(task.deadlineAt);
  const status = taskDeadlineStatus(task);
  const suggestion = task.priority === "high" && !deadline
    ? `<span class="task-deadline-suggestion">高优任务建议设置截止时间</span>`
    : "";
  return `
    <label class="task-deadline-control ${status}" title="截止时间可选，不会使用任务创建时间自动推断">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>
      <span>截止</span>
      <input type="datetime-local" data-deadline-field data-task-id="${task.id}" value="${escAttr(deadlineInputValue(task.deadlineAt))}" aria-label="任务截止时间（可选）" />
    </label>
    ${suggestion}
  `;
}

function deadlineInputValue(value) {
  const date = safeDate(value);
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeDeadlineInput(value) {
  if (!String(value || "").trim()) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function renderTaskRecurrenceControls(task) {
  const recurrence = normalizeTaskRecurrence(task.recurrence);
  const open = recurrencePopoverTaskId === task.id;
  return `
    <div class="task-recurrence-controls ${recurrence.frequency === "none" ? "is-empty" : "is-active"}" aria-label="循环任务设置">
      <button
        class="task-recurrence-trigger"
        type="button"
        data-recurrence-toggle
        data-task-id="${task.id}"
        aria-expanded="${open}"
        aria-controls="task-recurrence-popover-${task.id}"
      >
        <svg class="task-recurrence-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M6.1 9a7 7 0 0 1 11.5-2L20 9"></path><path d="m4 15 2.4 2A7 7 0 0 0 18 15"></path></svg>
        <span>${esc(recurrenceSummaryLabel(recurrence))}</span>
        <svg class="task-recurrence-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>
      </button>
      ${
        open
          ? `<section class="task-recurrence-popover" id="task-recurrence-popover-${task.id}" role="dialog" aria-label="循环设置">
              <header class="task-recurrence-popover-head">
                <strong>循环设置</strong>
              </header>
              <div class="task-recurrence-mode-time">
                <div class="task-recurrence-mode-switch" role="group" aria-label="循环周期">
                  ${Object.entries(recurrenceFrequencyLabels)
                    .map(([value, label]) => `<button
                      class="task-recurrence-mode ${recurrence.frequency === value ? "active" : ""}"
                      type="button"
                      data-recurrence-mode="${value}"
                      data-task-id="${task.id}"
                      aria-pressed="${recurrence.frequency === value}"
                    >${label}</button>`)
                    .join("")}
                </div>
                ${
                  recurrence.frequency !== "none"
                    ? `<label class="task-recurrence-time">
                        <input type="time" data-recurrence-field="time" data-task-id="${task.id}" value="${escAttr(recurrence.time)}" aria-label="循环时间" />
                      </label>`
                    : ""
                }
              </div>
              ${
                recurrence.frequency === "weekly"
                  ? `<div class="task-recurrence-weekday-list" role="group" aria-label="选择每周日期，可多选">
                      ${recurrenceWeekdayOrder
                        .map(
                          (value) => `<button
                            class="task-recurrence-weekday ${recurrence.weekdays.includes(value) ? "active" : ""}"
                            type="button"
                            data-recurrence-weekday="${value}"
                            data-task-id="${task.id}"
                            aria-pressed="${recurrence.weekdays.includes(value)}"
                            aria-label="${recurrenceWeekdayLabels[value]}"
                          >${recurrenceWeekdayLabels[value].replace("周", "")}</button>`,
                        )
                        .join("")}
                    </div>`
                  : ""
              }
            </section>`
          : ""
      }
    </div>
  `;
}

function briefFieldIcon(name, className = "brief-field-icon") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="src/assets/feather/feather-sprite.svg#${name}"></use></svg>`;
}

function renderBriefProgress(summary) {
  const total = Math.max(0, Number(summary?.total) || 0);
  const done = Math.min(total, Math.max(0, Number(summary?.done) || 0));
  const percent = total ? Math.round((done / total) * 100) : 0;
  return `<span class="brief-progress-ring" style="--brief-progress:${percent}" role="img" aria-label="节点完成进度 ${percent}%"><span>${percent}%</span></span>`;
}

function renderBriefField(label, control, timestamp = "", attention = false, variant = "", summary = null) {
  const iconNames = {
    background: "file-text",
    hypothesis: "bar-chart-2",
    conclusion: "check-square",
  };
  const headerAction =
    variant === "hypothesis"
      ? renderBriefProgress(summary)
      : variant === "conclusion"
        ? briefFieldIcon("edit-3", "brief-field-icon brief-edit-icon")
        : "";
  return `
    <label class="brief-field brief-cell ${variant} ${attention ? "needs-attention" : ""}">
      <span class="brief-label">
        <span class="brief-label-title">${briefFieldIcon(iconNames[variant] || "file-text")}<b>${label}</b></span>
        <span class="brief-label-action">${timestamp ? `<time class="brief-stamp">${formatShort(timestamp)}</time>` : ""}${headerAction}</span>
      </span>
      ${control}
    </label>
  `;
}

function renderFlowNode(taskId, node, depth, rootIndex = 0, lineage = [], isLast = true) {
  const children = sort(node.children);
  const isSelected = state.selectedNodeId === node.id;
  const treeDepth = Math.min(depth, 3);
  const branch = depth === 0 ? "main-flow" : "sub-flow";
  const noteSummary = nodeNoteSummary(node.note);
  const railContinuations = [...lineage, !isLast].slice(0, treeDepth);
  const treeGuides =
    depth > 0
      ? `<span class="flow-tree-guides" aria-hidden="true">${Array.from(
          { length: treeDepth },
          (_, index) => `<span class="flow-tree-rail ${railContinuations[index] ? "continues" : ""}" style="--rail-index:${index}"></span>`,
        ).join("")}<span class="flow-tree-elbow"></span></span>`
      : "";
  return `
    <article class="flow-item depth-${Math.min(depth, 6)}">
      <div class="flow-row flow-line ${branch} ${branch === "sub-flow" ? "sub" : ""} ${node.status} ${isSelected ? "selected" : ""}" style="--tree-depth:${treeDepth}" data-context="node" data-task-id="${taskId}" data-node-id="${node.id}" data-flow-drag-target>
        <span class="flow-sequence-cell">
          ${depth === 0 ? `<span class="sequence-index">${rootIndex + 1}</span>` : ""}
          <button class="flow-node-drag-handle" type="button" draggable="true" data-flow-drag-source data-task-id="${taskId}" data-node-id="${node.id}" aria-label="${escAttr(`拖拽重组节点：${node.title || "未命名节点"}`)}" title="拖拽调整节点层级和顺序">
            <svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="4" r="1.2"></circle><circle cx="9" cy="4" r="1.2"></circle><circle cx="3" cy="9" r="1.2"></circle><circle cx="9" cy="9" r="1.2"></circle><circle cx="3" cy="14" r="1.2"></circle><circle cx="9" cy="14" r="1.2"></circle></svg>
          </button>
        </span>
        <span class="flow-title-cell flow-title process-cell">
          ${depth === 1 ? treeGuides : ""}
          <span class="flow-title-line">
            ${nodeTitleInputHtml(node, taskId)}
          </span>
        </span>
        <input class="flow-record-input" readonly aria-label="节点记录" data-action="select-node" data-task-id="${taskId}" data-node-id="${node.id}" value="${escAttr(node.note ? noteSummary.title : "")}" placeholder="记录" />
        <span class="flow-status-text status-${node.status}">${nodeStatusText(node.status)}</span>
        <span class="flow-updated note-link">${formatShort(node.updatedAt)}</span>
      </div>
      ${
        children.length && !node.collapsed
          ? children
              .map((child, index) => renderFlowNode(taskId, child, depth + 1, rootIndex, depth === 0 ? [] : [...lineage, !isLast], index === children.length - 1))
              .join("")
          : ""
      }
    </article>
  `;
}

function renderFlowHeader() {
  return `
    <div class="flow-row flow-line flow-header header">
      <span></span>
      ${renderFlowHeadCell("title", "处理")}
      ${renderFlowHeadCell("note", "记录")}
      ${renderFlowHeadCell("", "")}
      ${renderFlowHeadCell("", "")}
    </div>
  `;
}

function nodeNoteSummary(value) {
  const lines = String(value || "")
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/^[#>*\-\s\d.]+/, "").trim())
    .filter(Boolean);
  return {
    title: lines[0] || "记录待补充",
    detail: lines.slice(1).join(" ") || "点击打开记录浮窗",
  };
}

function renderFlowHeadCell(_key, label) {
  return `
    <span class="flow-head-cell">
      <span>${label}</span>
    </span>
  `;
}

function renderNodeDetail(taskId, node) {
  return `
    <div class="record-modal-backdrop" data-record-modal-backdrop>
      <section class="node-detail record-modal" data-task-id="${taskId}" data-node-id="${node.id}" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
        <header class="record-modal-header">
          <div class="record-modal-heading">
            <h2 class="record-modal-title" id="record-modal-title">节点记录</h2>
            <p class="record-modal-description">补充简短的处理过程、信息或结论，处理流中只显示摘要。</p>
          </div>
          <button class="record-modal-close" type="button" data-action="close-node-detail" title="关闭节点记录" aria-label="关闭节点记录">×</button>
        </header>
        <div class="record-modal-context">
          <strong>${esc(node.title || "未命名节点")}</strong>
          <span>${nodeStatusText(node.status)} · ${formatShort(node.updatedAt)}</span>
        </div>
        <div class="record-modal-body">
          <textarea class="record-modal-textarea" data-record-input placeholder="记录该节点的处理过程、关键数据、判断依据、结果或后续事项……">${esc(state.recordDraft)}</textarea>
        </div>
        <footer class="record-modal-footer">
          <span>Ctrl / ⌘ + Enter 保存 · Esc 关闭</span>
          <div class="record-modal-actions">
            <button type="button" data-action="close-node-detail">取消</button>
            <button class="primary" type="button" data-action="save-node-detail">保存记录</button>
          </div>
        </footer>
      </section>
    </div>
  `;
}

function nodeDetailPositionStyle() {
  if (state.nodeDetailFullscreen || !state.nodeDetailPosition) return "";
  const viewportPadding = 22;
  const popoverWidth = Math.min(620, Math.max(420, window.innerWidth * 0.42), window.innerWidth - viewportPadding * 2);
  const popoverHeight = Math.min(286, Math.max(236, window.innerHeight * 0.37), window.innerHeight - viewportPadding * 2);
  const x = Math.max(viewportPadding, Math.min(window.innerWidth - popoverWidth - viewportPadding, Number(state.nodeDetailPosition.x) || 0));
  const y = Math.max(viewportPadding, Math.min(window.innerHeight - popoverHeight - viewportPadding, Number(state.nodeDetailPosition.y) || 0));
  return `style="--detail-x:${x}px;--detail-y:${y}px"`;
}

function markdownStats(value) {
  const text = String(value || "");
  return {
    characters: text.trim().length,
    lines: text ? text.split(/\r\n|\r|\n/).length : 1,
  };
}

function renderEditorImagePreview(value) {
  const images = markdownImages(value);
  return `
    <div class="editor-image-strip ${images.length ? "" : "empty"}" aria-label="编辑器图片预览">
      ${images
        .map((image) => `<figure><img src="${image.src}" alt="${escAttr(image.alt || "图片")}" /><figcaption>${esc(image.alt || "图片")}</figcaption></figure>`)
        .join("")}
    </div>
  `;
}

function markdownImages(value) {
  return Array.from(String(value || "").matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g))
    .map((match) => ({ alt: match[1], src: resolveMarkdownImageUrl(match[2]) }))
    .filter((image) => image.src);
}

function renderEmptyPage() {
  const hasTasks = state.tasks.length > 0;
  return `
    <section class="task-page empty-page">
      <h2>${hasTasks ? "没有符合筛选的任务" : "没有任务"}</h2>
      ${hasTasks ? "" : "<p>双击左侧任务列表的空白区域，即可创建新的处理流。</p>"}
    </section>
  `;
}

function renderContextMenu() {
  if (!state.contextMenu) return "";
  const menu = state.contextMenu;
  if (menu.kind === "editor") {
    return `
      <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
        <button data-action="insert-editor-snippet" data-kind="h2">插入标题</button>
        <button data-action="insert-editor-snippet" data-kind="bullet">插入无序列表</button>
        <button data-action="insert-editor-snippet" data-kind="ordered">插入有序列表</button>
        <button data-action="insert-editor-snippet" data-kind="quote">插入引用</button>
        <button data-action="insert-editor-snippet" data-kind="code">插入代码块</button>
        <button data-action="insert-editor-snippet" data-kind="table">插入表格</button>
        <button data-action="insert-editor-snippet" data-kind="image">插入图片</button>
      </div>
    `;
  }
  if (menu.kind === "task-list") {
    return `
      <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
        <button data-action="add-task">新增任务</button>
      </div>
    `;
  }

  if (menu.kind === "group") {
    const isDefault = menu.groupId === defaultTaskGroup.id;
    return `
      <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
        <button data-action="select-group" data-group-id="${menu.groupId}">打开分组</button>
        <button data-action="rename-group" data-group-id="${menu.groupId}" ${isDefault ? "disabled" : ""}>重命名分组</button>
        <hr />
        <button class="danger" data-action="delete-group" data-group-id="${menu.groupId}" ${isDefault ? "disabled" : ""}>删除分组</button>
      </div>
    `;
  }

  if (menu.kind === "task") {
    const task = state.tasks.find((item) => item.id === menu.taskId);
    const tags = normalizeTaskTags(task?.tags);
    return `
      <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
        <button data-action="select-task" data-task-id="${menu.taskId}">打开任务</button>
        <button data-action="toggle-task-done" data-task-id="${menu.taskId}">${task?.status === "done" ? "标记为未完成" : "标记为完成"}</button>
        <button data-action="toggle-task-tag" data-task-id="${menu.taskId}" data-tag="today">${tags.today ? "取消 Today" : "标记 Today"}</button>
        <button data-action="toggle-task-tag" data-task-id="${menu.taskId}" data-tag="later">${tags.later ? "取消稍后" : "标记稍后"}</button>
        <button data-action="toggle-task-tag" data-task-id="${menu.taskId}" data-tag="blocked">${tags.blocked ? "取消卡住" : "标记卡住"}</button>
        <hr />
        <button class="danger" data-action="delete-task" data-task-id="${menu.taskId}">删除任务</button>
      </div>
    `;
  }

  if (menu.kind === "flow-root") {
    return `
      <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
        <button data-action="add-root-node" data-task-id="${menu.taskId}">新增主节点</button>
      </div>
    `;
  }

  const task = state.tasks.find((item) => item.id === menu.taskId);
  const node = task ? findNode(task.nodes, menu.nodeId) : null;
  const doneLabel = node?.status === "done" ? "标记为未完成" : "标记为完成";
  const secondaryStatuses = [
    ["todo", "标记为未完成"],
    ["blocked", "标记为卡住"],
    ["later", "标记为稍后"],
  ]
    .filter(([status]) => status !== node?.status && !(node?.status === "done" && status === "todo"))
    .map(
      ([status, label]) =>
        `<button data-action="mark-node-status" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}" data-status="${status}">${label}</button>`,
    )
    .join("");
  return `
    <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
      <button data-action="add-child-node" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">新增下级节点</button>
      <button data-action="add-sibling-node" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">在下方新增同级</button>
      <hr />
      <button data-action="toggle-node-done" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">${doneLabel}</button>
      ${secondaryStatuses}
      <hr />
      <button class="danger" data-action="delete-node" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">删除节点</button>
    </div>
  `;
}

function syncContextMenuRoot() {
  const root = document.querySelector("#context-menu-root");
  if (!root) return;
  root.innerHTML = renderContextMenu();
  root.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      action(element.dataset, event);
    });
  });
}


// ============================================================
// DATA QUERY HELPERS (filter, search, sort)
// ============================================================
/**
 * Get tasks matching current filters (search query + task filter + priority filter).
 * @returns {Array} Filtered task list
 */
function filteredTasks({ includeQuery = true, at = new Date() } = {}) {
  const q = state.query.trim().toLowerCase();
  const deadlineScoped = state.taskDeadlineFilter !== "all" || Boolean(state.taskDateFilter);
  return taskListScopeTasks()
    .filter((task) => {
      const tags = normalizeTaskTags(task.tags);
      const hasBlocked = flatten(task.nodes).some((node) => node.status === "blocked");
      const hasLater = flatten(task.nodes).some((node) => node.status === "later");
      if (state.taskFilter === "today" && !isTaskScheduledForToday(task)) return false;
      if (state.taskFilter === "active" && task.status === "done") return false;
      if (state.taskFilter === "done" && task.status !== "done") return false;
      if (state.taskFilter === "blocked" && !tags.blocked && !hasBlocked) return false;
      if (state.taskFilter === "later" && !tags.later && !hasLater) return false;
      if (!matchesTaskDeadlineFilter(task, at)) return false;
      if (state.priorityFilter !== "all" && task.priority !== state.priorityFilter) return false;
      if (includeQuery && q) {
        const taskText = `${task.title} ${task.description} ${task.hypothesis} ${task.conclusion}`.toLowerCase();
        const nodeHit = flatten(task.nodes).some((node) => `${node.title} ${node.note}`.toLowerCase().includes(q));
        return taskText.includes(q) || nodeHit;
      }
      return true;
    })
    .sort(deadlineScoped ? compareTasksByDeadline : (a, b) => a.order - b.order);
}

function taskListScopeTasks() {
  return state.taskFilter === "today" || state.taskDeadlineFilter !== "all" || state.taskDateFilter
    ? state.tasks
    : tasksInActiveGroup();
}

function taskListStatsTasks() {
  if (state.taskDeadlineFilter !== "all" || state.taskDateFilter) {
    return state.tasks.filter((task) => matchesTaskDeadlineFilter(task));
  }
  if (state.taskFilter !== "today") return tasksInActiveGroup();
  return state.tasks.filter((task) => isTaskScheduledForToday(task));
}

function taskDeadlineStatus(task, at = new Date()) {
  const deadline = safeDate(task?.deadlineAt);
  if (!deadline) return "none";
  if (task.status === "done") return "done";
  if (deadline.getTime() < at.getTime()) return "overdue";
  if (localDateKey(deadline) === localDateKey(at)) return "today";
  return "upcoming";
}

function deadlineWeekRange(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  const day = date.getDay() || 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day + 1);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

function matchesTaskDeadlineFilter(task, at = new Date()) {
  const deadline = safeDate(task?.deadlineAt);
  if (state.taskDateFilter) return Boolean(deadline && localDateKey(deadline) === state.taskDateFilter);
  if (state.taskDeadlineFilter === "all") return true;
  if (!deadline) return false;
  if (state.taskDeadlineFilter === "today") return localDateKey(deadline) === localDateKey(at);
  if (state.taskDeadlineFilter === "overdue") return task.status !== "done" && deadline.getTime() < at.getTime();
  if (state.taskDeadlineFilter === "week") {
    const range = deadlineWeekRange(at);
    return deadline >= range.start && deadline < range.end;
  }
  return true;
}

function compareTasksByDeadline(a, b) {
  const aTime = safeDate(a.deadlineAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bTime = safeDate(b.deadlineAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  return aTime - bTime || a.order - b.order;
}

function tasksInActiveGroup() {
  const groupId = normalizeActiveGroupId(state.activeGroupId, state.taskGroups);
  return state.tasks.filter((task) => (task.groupId || defaultTaskGroup.id) === groupId);
}

function taskGroupOptions() {
  return Object.fromEntries(sort(state.taskGroups).map((group) => [group.id, group.title]));
}

function todayFocusItems() {
  return state.tasks
    .filter((task) => task.status !== "done")
    .filter((task) => isTaskScheduledForToday(task))
    .map((task) => {
      const tags = normalizeTaskTags(task.tags);
      const nodes = flatten(task.nodes);
      const blockedNode = nodes.find((node) => node.status === "blocked");
      const openNode = nextOpenNode(task.nodes);
      const score =
        (task.priority === "high" ? 80 : task.priority === "medium" ? 35 : 15) +
        70 +
        (blockedNode || tags.blocked ? 55 : 0) +
        (openNode ? 8 : 0);
      const node = blockedNode || openNode || null;
      const kind = blockedNode || tags.blocked ? "blocked" : task.priority === "high" ? "high" : "normal";
      const badge = blockedNode || tags.blocked ? "卡住" : task.priority === "high" ? "高" : "Today";
      const nextText = node?.title || (task.description.trim() ? task.description.trim() : "补充任务背景或新增第一个节点");
      return { task, node, kind, badge, nextText, score, updatedAt: latestTaskTime(task) };
    })
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.task.order - b.task.order);
}

function recurrenceSummaryLabel(value) {
  const recurrence = normalizeTaskRecurrence(value);
  if (recurrence.frequency === "daily") return `每天 · ${recurrence.time}`;
  if (recurrence.frequency === "weekly") {
    const weekdays = recurrenceWeekdayOrder
      .filter((weekday) => recurrence.weekdays.includes(weekday))
      .map((weekday) => recurrenceWeekdayLabels[weekday].replace("周", ""));
    return weekdays.length ? `每周${weekdays.join("、")} · ${recurrence.time}` : "每周 · 请选择日期";
  }
  return "不循环";
}

function recurrenceUpcomingLabels(value, start = new Date(), count = 3) {
  const recurrence = normalizeTaskRecurrence(value);
  if (recurrence.frequency === "none" || count < 1) return [];
  const [hours, minutes] = recurrence.time.split(":").map(Number);
  const cursor = new Date(start);
  cursor.setHours(hours, minutes, 0, 0);
  if (cursor <= start) cursor.setDate(cursor.getDate() + 1);
  const labels = [];
  for (let step = 0; step < 32 && labels.length < count; step += 1) {
    if (recurrence.frequency === "daily" || recurrence.weekdays.includes(cursor.getDay())) {
      labels.push(`${cursor.getMonth() + 1}月${cursor.getDate()}日 ${recurrenceWeekdayLabels[cursor.getDay()]} ${recurrence.time}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
}

function recurringOccurrenceKey(task, at = new Date()) {
  const recurrence = normalizeTaskRecurrence(task.recurrence);
  if (recurrence.frequency === "none") return "";
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) return "";
  const [hours, minutes] = recurrence.time.split(":").map(Number);
  if (date.getHours() * 60 + date.getMinutes() < hours * 60 + minutes) return "";
  if (recurrence.frequency === "weekly" && !recurrence.weekdays.includes(date.getDay())) return "";
  return localDateKey(date);
}

function isRecurringTaskDue(task, at = new Date()) {
  const occurrence = recurringOccurrenceKey(task, at);
  return Boolean(occurrence && normalizeTaskRecurrence(task.recurrence).lastCompletedOccurrence !== occurrence);
}

function isTaskScheduledForToday(task, at = new Date()) {
  const deadline = safeDate(task.deadlineAt);
  return normalizeTaskTags(task.tags).today || isRecurringTaskDue(task, at) || Boolean(deadline && localDateKey(deadline) === localDateKey(at));
}

function syncRecurringTasks(at = new Date()) {
  let statusChanged = false;
  state.tasks.forEach((task) => {
    const occurrence = recurringOccurrenceKey(task, at);
    const recurrence = normalizeTaskRecurrence(task.recurrence);
    if (!occurrence || recurrence.lastCompletedOccurrence === occurrence || task.status !== "done") return;
    task.status = "active";
    task.resolvedAt = "";
    task.updatedAt = at.toISOString();
    statusChanged = true;
  });
  const nextSignature = state.tasks
    .map((task) => `${task.id}:${recurringOccurrenceKey(task, at)}:${isRecurringTaskDue(task, at) ? "due" : "idle"}`)
    .join("|");
  const scheduleChanged = nextSignature !== recurringTodaySignature;
  recurringTodaySignature = nextSignature;
  if (statusChanged) save();
  return statusChanged || scheduleChanged;
}

function startRecurringSchedule() {
  window.clearInterval?.(recurrenceScheduleTimer);
  recurrenceScheduleTimer = window.setInterval?.(() => {
    if (syncRecurringTasks(new Date())) render();
  }, 30000) || 0;
}

function isTaskTouchedToday(task) {
  return isToday(task.updatedAt) || flatten(task.nodes).some((node) => isToday(node.updatedAt));
}

function latestTaskTime(task) {
  const times = [Date.parse(task.updatedAt), ...flatten(task.nodes).map((node) => Date.parse(node.updatedAt))].filter(Number.isFinite);
  return times.length ? Math.max(...times) : 0;
}

function isToday(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function taskSummary(task) {
  const nodes = flatten(task.nodes);
  const done = nodes.filter((node) => node.status === "done").length;
  return {
    total: nodes.length,
    done,
    open: nodes.length - done,
  };
}

function nextOpenNode(nodes) {
  for (const node of sort(nodes)) {
    if (node.status !== "done") return node;
    const found = nextOpenNode(node.children);
    if (found) return found;
  }
  return null;
}


// ============================================================
// HTML HELPER FUNCTIONS (input, select, textarea builders)
// ============================================================
function inputHtml(key, value, taskId, className = "", nodeId = "") {
  return `<input class="${className}" aria-label="${escAttr(editFieldLabels[key] || key)}" data-edit-key="${key}" data-task-id="${taskId}" data-node-id="${nodeId}" value="${escAttr(value)}" />`;
}

function nodeTitleInputHtml(node, taskId) {
  return `<input class="flow-title-input" placeholder="填写节点标题" aria-label="节点标题" data-edit-key="title" data-task-id="${taskId}" data-node-id="${node.id}" value="${escAttr(node.title)}" />`;
}

function textareaHtml(key, value, taskId, nodeId = "") {
  return `<textarea aria-label="${escAttr(editFieldLabels[key] || key)}" data-edit-key="${key}" data-task-id="${taskId}" data-node-id="${nodeId}">${esc(value)}</textarea>`;
}

function selectHtml(key, value, options, taskId, nodeId = "") {
  return `
    <select aria-label="${escAttr(editFieldLabels[key] || key)}" data-edit-key="${key}" data-task-id="${taskId}" data-node-id="${nodeId}">
      ${Object.entries(options)
        .map(([optionValue, label]) => `<option value="${optionValue}" ${optionValue === value ? "selected" : ""}>${label}</option>`)
        .join("")}
    </select>
  `;
}

function newTaskPrioritySelect() {
  return `
    <select data-new-task-priority>
      ${Object.entries(priorityLabels)
        .map(([value, label]) => `<option value="${value}" ${value === state.newTaskPriority ? "selected" : ""}>${label}</option>`)
        .join("")}
    </select>
  `;
}

function filterSelectHtml(kind, value, options, title = "") {
  return `
    <select data-${kind} ${title ? `title="${escAttr(title)}"` : ""}>
      ${Object.entries(options)
        .map(([optionValue, label]) => `<option value="${optionValue}" ${optionValue === value ? "selected" : ""}>${label}</option>`)
        .join("")}
    </select>
  `;
}


// ============================================================
// SETTINGS PANEL
// ============================================================
function renderSettingsPanel() {
  return `
    <div class="settings-overlay" role="presentation">
      <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-head">
          <div>
            <span>Preferences</span>
            <h2 id="settings-title">界面设置</h2>
          </div>
          <button class="settings-close" type="button" data-action="close-settings" title="关闭">×</button>
        </header>
        <div class="settings-body">
          <div class="settings-content">
            <section class="settings-group">
              <div class="settings-group-head">
                <h3>显示模式</h3>
                <p>选择浅色或深色界面。</p>
              </div>
              ${settingsOptionGroup("theme", state.theme, themeLabels)}
            </section>
            <section class="settings-group">
              <div class="settings-group-head">
                <h3>中文字体</h3>
                <p>适配 macOS 与 Windows 的常用中文字体。</p>
              </div>
              ${settingsSelectHtml("zh-font", state.zhFont, zhFontLabels)}
            </section>
            <section class="settings-group">
              <div class="settings-group-head">
                <h3>英文字体</h3>
                <p>用于英文、数字和拉丁字符。</p>
              </div>
              ${settingsSelectHtml("en-font", state.enFont, enFontLabels)}
            </section>
            <section class="settings-group">
              <div class="settings-group-head">
                <h3>任务视图</h3>
                <p>设置左侧任务标签和默认新任务优先级。</p>
              </div>
              <div class="settings-stack">
                <label>
                  <span>任务范围</span>
                  ${settingsSelectHtml("task-filter", state.taskFilter, taskFilterLabels)}
                </label>
                <label>
                  <span>优先级范围</span>
                  ${settingsSelectHtml("priority-filter", state.priorityFilter, priorityFilterLabels)}
                </label>
                <label>
                  <span>新任务优先级</span>
                  ${settingsSelectHtml("new-task-priority", state.newTaskPriority, priorityLabels)}
                </label>
              </div>
            </section>
            <section class="settings-group settings-update-group" aria-labelledby="software-update-title">
              <div class="settings-group-head">
                <h3 id="software-update-title">软件更新</h3>
                <p>发现新版本后，由你确认升级；应用会在后台完成并自动重启。</p>
              </div>
              <div class="settings-update-slot">
                ${renderUpdateSettingsControls()}
              </div>
            </section>
            <section class="settings-group">
              <div class="settings-group-head">
                <h3>帮助与反馈</h3>
                <p>遇到问题时，可以提交信息供后续定位。</p>
              </div>
              <div class="settings-stack">
                <button class="settings-inline-action" type="button" data-action="open-feedback">反馈问题</button>
              </div>
            </section>
            <div class="settings-preview">
              <span>Preview</span>
              <strong class="settings-preview-zh">任务流中文字体预览</strong>
              <strong class="settings-preview-en">Task flow English 123</strong>
              <p>背景、当前判断、结论保持轻量，处理流保持主视线。</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function normalizeAppUpdateState(value) {
  const raw = value && typeof value === "object" ? value : {};
  const status = appUpdateStatuses.has(raw.status) ? raw.status : "unsupported";
  const safeNumber = (number) => Number.isFinite(Number(number)) && Number(number) > 0 ? Number(number) : 0;
  return {
    status,
    supported: raw.supported === true,
    unsupportedReason: ["", "development", "mac-signing-required", "platform-unsupported"].includes(raw.unsupportedReason)
      ? raw.unsupportedReason
      : "platform-unsupported",
    automaticChecks: raw.automaticChecks !== false,
    currentVersion: String(raw.currentVersion || APP_VERSION || "").slice(0, 64),
    version: String(raw.version || "").slice(0, 64),
    releaseDate: String(raw.releaseDate || "").slice(0, 64),
    size: safeNumber(raw.size),
    percent: Math.max(0, Math.min(100, safeNumber(raw.percent))),
    transferred: safeNumber(raw.transferred),
    total: safeNumber(raw.total),
    bytesPerSecond: safeNumber(raw.bytesPerSecond),
    lastCheckedAt: String(raw.lastCheckedAt || "").slice(0, 64),
    errorCode: String(raw.errorCode || "").replace(/[^0-9A-Z_.-]/gi, "").slice(0, 64),
  };
}

function renderUpdateSettingsControls() {
  const update = appUpdateState;
  const busy = ["checking", "downloading", "preparing", "installing"].includes(update.status);
  const currentVersion = update.currentVersion || APP_VERSION;
  return `
    <div class="settings-update-controls" aria-busy="${busy}">
      <div class="settings-update-preference">
        <div>
          <strong>自动检查更新</strong>
          <span>${update.automaticChecks ? "应用启动后定期检查" : "仅在手动操作时检查"}</span>
        </div>
        <button
          class="settings-update-switch"
          type="button"
          role="switch"
          aria-checked="${update.automaticChecks}"
          aria-label="自动检查更新"
          data-update-automatic
          ${update.supported && !busy ? "" : "disabled"}
        ></button>
      </div>
      <div class="settings-update-action-row">
        <div>
          <strong>当前版本</strong>
          <span><b class="settings-update-version">${currentVersion ? `v${esc(currentVersion)}` : "开发预览"}</b>${update.supported ? ` · ${esc(updatePlatformLabel())}` : ""}</span>
        </div>
        <button class="settings-inline-action settings-update-check" type="button" data-update-action="check" ${!update.supported || busy ? "disabled" : ""}>
          ${update.status === "checking" ? "检查中…" : "检查更新"}
        </button>
      </div>
      <div class="settings-update-status" aria-live="polite">
        ${renderUpdateStatus(update)}
      </div>
    </div>
  `;
}

function renderUpdateStatus(update) {
  if (update.status === "idle") return "";
  if (update.status === "unsupported") {
    const macUnsigned = update.unsupportedReason === "mac-signing-required";
    const development = update.unsupportedReason === "development";
    return updateStatusSheet({
      icon: "i",
      title: macUnsigned ? "当前 macOS 版本暂未启用应用内更新" : development ? "安装版支持应用内更新" : "当前系统暂不支持应用内更新",
      detail: macUnsigned ? "完成应用签名与公证后即可启用。" : development ? "开发预览不会连接更新服务，请在安装版中使用。" : "你仍可以从 GitHub Release 获取新版本。",
    });
  }
  if (update.status === "checking") {
    return updateStatusSheet({ icon: "", title: "正在检查更新…", detail: "正在连接 GitHub Release。", spinning: true });
  }
  if (update.status === "latest") {
    return updateStatusSheet({ icon: "✓", title: "已是最新版本", detail: `刚刚检查 · 当前为 v${esc(update.currentVersion || APP_VERSION)}` });
  }
  if (update.status === "available") {
    const metadata = [formatUpdateSize(update.size), formatUpdateDate(update.releaseDate)].filter(Boolean).join(" · ");
    return updateStatusSheet({
      icon: "↑",
      tone: "available",
      title: `v${esc(update.version)} 可用`,
      detail: metadata || "新版本已发布",
      notes: ["确认后在应用内后台下载", "完成后自动安装并重新启动"],
      actions: `<button class="settings-update-button ghost" type="button" data-update-action="later">稍后</button><button class="settings-update-button primary" type="button" data-update-action="download">升级并重启</button>`,
    });
  }
  if (update.status === "downloading") {
    const percent = Math.round(update.percent);
    const detail = [
      `${percent}%`,
      update.bytesPerSecond ? `${formatUpdateSize(update.bytesPerSecond)}/s` : "",
      "完成后将自动重启",
    ].filter(Boolean).join(" · ");
    return updateStatusSheet({
      icon: "↓",
      title: `正在下载 v${esc(update.version)}`,
      detail,
      progress: percent,
    });
  }
  if (update.status === "downloaded") {
    const preparationFailed = update.errorCode === "INSTALL_PREPARATION_FAILED";
    return updateStatusSheet({
      icon: preparationFailed ? "!" : "✓",
      tone: preparationFailed ? "error" : "available",
      title: preparationFailed ? "升级前保存未完成" : `v${esc(update.version)} 已下载`,
      detail: preparationFailed ? "应用没有退出，你的内容仍保留。请排除磁盘或权限问题后重试。" : "升级包已就绪，由你确认后再安装并重启。",
      actions: `<button class="settings-update-button ghost" type="button" data-update-action="later">稍后</button><button class="settings-update-button primary" type="button" data-update-action="download">${preparationFailed ? "重试升级" : "升级并重启"}</button>`,
    });
  }
  if (update.status === "preparing") {
    return updateStatusSheet({ icon: "", title: "正在保存并准备升级…", detail: "正在安全写入任务与知识笔记草稿。", spinning: true });
  }
  if (update.status === "installing") {
    return updateStatusSheet({ icon: "", title: "正在完成升级…", detail: "应用即将自动重启，请稍候。", spinning: true, progress: 100 });
  }
  const error = updateErrorPresentation(update.errorCode);
  return updateStatusSheet({
    icon: "!",
    tone: "error",
    title: error.title,
    detail: error.detail,
    notes: error.code ? [`诊断代码：${error.code}`] : [],
    actions: `<a class="settings-update-button ghost" href="https://github.com/tangyuanx/personal-task-track/releases/latest" target="_blank" rel="noreferrer">打开发布页</a><button class="settings-update-button" type="button" data-update-action="check">重试</button>`,
  });
}

function updateErrorPresentation(value) {
  const code = String(value || "UPDATE_FAILED").replace(/[^0-9A-Z_.-]/gi, "").slice(0, 64) || "UPDATE_FAILED";
  if (code === "UPDATE_METADATA_MISSING") {
    return {
      code,
      title: "Windows 更新包尚未发布完整",
      detail: "GitHub Release 缺少 Windows 更新元数据。请稍后重试，或打开发布页手动下载完整安装包。",
    };
  }
  if (["UPDATE_METADATA_INVALID", "UPDATE_RELEASE_NOT_FOUND"].includes(code)) {
    return {
      code,
      title: "暂时没有可用的更新信息",
      detail: "发布元数据不可用。当前版本仍可正常使用，请稍后重试。",
    };
  }
  if (["UPDATE_TIMEOUT", "UPDATE_NETWORK_UNAVAILABLE"].includes(code)) {
    return {
      code,
      title: "暂时无法连接更新服务",
      detail: "连接 GitHub 超时或网络不可用。请检查网络后重试。",
    };
  }
  if (code === "UPDATE_TLS_FAILED") {
    return {
      code,
      title: "更新服务安全连接失败",
      detail: "请检查系统时间、代理或安全软件的 HTTPS 证书设置后重试。",
    };
  }
  if (["UPDATE_RATE_LIMITED", "UPDATE_ACCESS_DENIED"].includes(code)) {
    return {
      code,
      title: "GitHub 暂时拒绝了更新请求",
      detail: "请求可能过于频繁或被网络代理拦截。请稍后重试。",
    };
  }
  if (code === "UPDATE_INTEGRITY_FAILED") {
    return {
      code,
      title: "更新包完整性校验失败",
      detail: "应用没有安装该文件。请稍后重试，或从发布页重新下载安装包。",
    };
  }
  return {
    code,
    title: "暂时无法检查或下载更新",
    detail: "当前版本仍可正常使用。你可以重试，或打开发布页查看最新版本。",
  };
}

function updateStatusSheet({ icon, title, detail, tone = "", spinning = false, notes = [], actions = "", progress = null }) {
  return `
    <div class="settings-update-sheet" ${tone ? `data-tone="${tone}"` : ""}>
      <div class="settings-update-sheet-top">
        <div class="settings-update-copy">
          <span class="settings-update-icon ${spinning ? "spinning" : ""}" aria-hidden="true">${icon}</span>
          <div>
            <strong>${title}</strong>
            <p>${detail}</p>
          </div>
        </div>
      </div>
      ${notes.length ? `<ul>${notes.map((note) => `<li>${note}</li>`).join("")}</ul>` : ""}
      ${actions ? `<div class="settings-update-actions">${actions}</div>` : ""}
      ${progress !== null ? `<div class="settings-update-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>` : ""}
    </div>
  `;
}

function updatePlatformLabel() {
  if (window.personalTaskTrack?.platform === "win32") return "Windows x64";
  if (window.personalTaskTrack?.platform === "darwin") return "macOS";
  return "Desktop";
}

function formatUpdateSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatUpdateDate(value) {
  const date = safeDate(value);
  return date ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "";
}

function refreshUpdateSettings() {
  const slot = document.querySelector(".settings-update-slot");
  if (!slot) return;
  slot.innerHTML = renderUpdateSettingsControls();
  bindUpdateSettingsControls();
}

function bindUpdateSettingsControls() {
  document.querySelector("[data-update-automatic]")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!desktopUpdates?.setAutomaticChecks) return;
    const previous = appUpdateState.automaticChecks;
    appUpdateState = { ...appUpdateState, automaticChecks: !previous };
    refreshUpdateSettings();
    try {
      appUpdateState = normalizeAppUpdateState(await desktopUpdates.setAutomaticChecks(!previous));
    } catch {
      appUpdateState = { ...appUpdateState, automaticChecks: previous, status: "error", errorCode: "PREFERENCE_FAILED" };
    }
    refreshUpdateSettings();
  });

  document.querySelectorAll("[data-update-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const action = event.currentTarget.dataset.updateAction;
      if (action === "later") {
        event.currentTarget.closest(".settings-update-sheet")?.remove();
        return;
      }
      void runUpdateAction(action);
    });
  });
}

async function runUpdateAction(action) {
  if (!desktopUpdates) return;
  if (action === "check") appUpdateState = { ...appUpdateState, status: "checking", errorCode: "" };
  if (action === "download") appUpdateState = { ...appUpdateState, status: "downloading", percent: 0, errorCode: "" };
  refreshUpdateSettings();
  try {
    const result = action === "check"
      ? await desktopUpdates.check()
      : action === "download"
        ? await desktopUpdates.download()
        : await desktopUpdates.install();
    if (result && typeof result === "object") appUpdateState = normalizeAppUpdateState(result);
  } catch {
    appUpdateState = { ...appUpdateState, status: "error", errorCode: "UPDATE_ACTION_FAILED" };
  }
  refreshUpdateSettings();
}

async function initializeAppUpdates() {
  if (!desktopUpdates?.getState) return;
  try {
    appUpdateState = normalizeAppUpdateState(await desktopUpdates.getState());
  } catch {
    appUpdateState = normalizeAppUpdateState({ status: "error", supported: true, currentVersion: APP_VERSION, errorCode: "STATE_FAILED" });
  }
  if (!unsubscribeAppUpdates && desktopUpdates.onState) {
    unsubscribeAppUpdates = desktopUpdates.onState((nextState) => {
      appUpdateState = normalizeAppUpdateState(nextState);
      if (["downloaded", "error"].includes(appUpdateState.status)) {
        document.querySelector("[data-update-install-overlay]")?.remove();
      }
      refreshUpdateSettings();
    });
  }
}

function showUpdateInstallOverlay() {
  const existing = document.querySelector("[data-update-install-overlay]");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.className = "update-install-overlay";
  overlay.dataset.updateInstallOverlay = "";
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "update-install-overlay-title");
  overlay.innerHTML = `
    <div class="update-install-card">
      <span class="update-install-spinner" aria-hidden="true"></span>
      <div>
        <strong id="update-install-overlay-title">正在完成升级</strong>
        <p>正在安全保存当前内容，完成后应用会自动重启。</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.focus({ preventScroll: true });
  return overlay;
}

async function prepareForUpdateInstall() {
  captureMountedMilkdownDrafts();
  flushNodeNoteDrafts({ persist: false });
  save();
  const overlay = showUpdateInstallOverlay();
  let ready = false;
  try {
    const taskDataSaved = await flushSave();
    if (!taskDataSaved) return false;
    await flushPendingKnowledgeRecoveries({ strict: true });
    ready = true;
    return true;
  } catch (error) {
    console.error("Failed to persist local data before installing update.", error);
    return false;
  } finally {
    // Keep the blocking wait screen in place only when the installer is about
    // to close the app. On failure the current session remains fully usable.
    if (!ready) overlay?.remove();
  }
}

function renderBugReportPanel() {
  const draft = state.feedbackDraft;
  const errors = state.feedbackErrors;
  const fieldError = (key) => errors[key] ? `<span class="feedback-field-error" id="feedback-${key}-error">${esc(errors[key])}</span>` : "";
  return `
    <div class="feedback-overlay" data-feedback-backdrop>
      <section class="feedback-panel" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <header class="feedback-head">
          <div>
            <span>Help & Feedback</span>
            <h2 id="feedback-title">反馈问题</h2>
            <p>请只填写与问题有关的信息，不要粘贴密码、Token 或私人文件内容。</p>
          </div>
          <button class="settings-close" type="button" data-action="close-feedback" title="关闭" aria-label="关闭反馈表单" ${state.feedbackSubmitting ? "disabled" : ""}>×</button>
        </header>
        ${state.feedbackResult ? renderBugReportSuccess() : `
          <form class="feedback-form" data-feedback-form novalidate>
            <div class="feedback-grid">
              <label class="feedback-field feedback-field-wide">
                <span>问题标题 <b>必填</b></span>
                <input data-feedback-field="title" maxlength="100" value="${escAttr(draft.title)}" placeholder="用一句话说明遇到的问题" aria-describedby="feedback-title-hint ${errors.title ? "feedback-title-error" : ""}" />
                <small id="feedback-title-hint">3～100 字</small>
                ${fieldError("title")}
              </label>
              <label class="feedback-field">
                <span>问题类型 <b>必填</b></span>
                <select data-feedback-field="category">
                  <option value="">请选择</option>
                  ${Object.entries(bugCategoryLabels).map(([value, label]) => `<option value="${value}" ${draft.category === value ? "selected" : ""}>${label}</option>`).join("")}
                </select>
                ${fieldError("category")}
              </label>
              <label class="feedback-field feedback-field-wide">
                <span>问题描述 <b>必填</b></span>
                <textarea data-feedback-field="description" maxlength="5000" rows="6" placeholder="说明发生了什么、期望看到什么结果">${esc(draft.description)}</textarea>
                <small>至少 10 字，最多 5000 字</small>
                ${fieldError("description")}
              </label>
              <label class="feedback-field feedback-field-wide">
                <span>复现步骤 <em>选填</em></span>
                <textarea data-feedback-field="reproductionSteps" maxlength="5000" rows="4" placeholder="1. 打开…&#10;2. 点击…&#10;3. 出现…">${esc(draft.reproductionSteps)}</textarea>
                ${fieldError("reproductionSteps")}
              </label>
              <label class="feedback-field feedback-field-wide">
                <span>联系方式 <em>选填，仅用于问题沟通</em></span>
                <input data-feedback-field="contact" maxlength="200" value="${escAttr(draft.contact)}" placeholder="邮箱或其他联系方式" />
                ${fieldError("contact")}
              </label>
            </div>
            <div class="feedback-consent">
              <label>
                <input type="checkbox" data-feedback-field="includeEnvironment" ${draft.includeEnvironment ? "checked" : ""} />
                <span>附带基础环境信息</span>
              </label>
              <p>${esc(feedbackEnvironmentSummary())}</p>
              <p>不会上传任务数据库、任务标题或内容、笔记、本地文件、Cookie、密码、Token、完整用户目录路径、日志或附件。</p>
            </div>
            <label class="feedback-confirm ${errors.confirmed ? "has-error" : ""}">
              <input type="checkbox" data-feedback-field="confirmed" ${draft.confirmed ? "checked" : ""} />
              <span>我已检查反馈内容，并确认其中不含敏感信息。反馈会作为公开 GitHub Issue 提交。</span>
            </label>
            ${fieldError("confirmed")}
            ${state.feedbackMessage ? `<div class="feedback-message" role="alert">${esc(state.feedbackMessage)}</div>` : ""}
            <footer class="feedback-actions">
              <button type="button" data-action="close-feedback" ${state.feedbackSubmitting ? "disabled" : ""}>取消</button>
              <button class="primary" type="submit" ${state.feedbackSubmitting ? "disabled" : ""}>${state.feedbackSubmitting ? "正在提交…" : "提交反馈"}</button>
            </footer>
          </form>
        `}
      </section>
    </div>
  `;
}

function renderBugReportSuccess() {
  const result = state.feedbackResult;
  return `
    <div class="feedback-success" role="status" aria-live="polite">
      <span class="feedback-success-mark" aria-hidden="true">✓</span>
      <p>反馈提交成功</p>
      <strong>${esc(result.reportId)}</strong>
      ${result.issueNumber ? `<p>GitHub Issue：${result.issueUrl ? `<a href="${escAttr(result.issueUrl)}">#${result.issueNumber}</a>` : `#${result.issueNumber}`}</p>` : ""}
      <button type="button" data-action="close-feedback">完成</button>
    </div>
  `;
}

function feedbackEnvironmentSummary() {
  const osName = desktopEnvironment.os || "浏览器预览环境";
  const architecture = desktopEnvironment.architecture || "未知架构";
  return `将发送：软件版本 ${APP_VERSION || "dev"}、${osName}、${architecture}、当前模块、提交时间和随机安装标识。`;
}


// ============================================================
// DEADLINE CALENDAR
// ============================================================
function ensureCalendarState() {
  const todayKey = localDateKey(new Date());
  if (!normalizeTaskDateFilter(state.calendarSelectedDate)) state.calendarSelectedDate = todayKey;
  if (!normalizeTaskDateFilter(state.calendarMonth)) state.calendarMonth = `${state.calendarSelectedDate.slice(0, 7)}-01`;
}

function calendarMonthDate() {
  ensureCalendarState();
  return parseDateInput(state.calendarMonth) || new Date();
}

function calendarGridDates(month = calendarMonthDate()) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function calendarTasksForDate(dateKey) {
  const normalized = normalizeTaskDateFilter(dateKey);
  if (!normalized) return [];
  return state.tasks
    .filter((task) => localDateKey(task.deadlineAt) === normalized)
    .sort(compareTasksByDeadline);
}

function calendarMonthTitle(month = calendarMonthDate()) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(month);
}

function calendarAgendaTitle(dateKey) {
  const date = parseDateInput(dateKey);
  if (!date) return "选择日期";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

function renderCalendarCell(date, month, at = new Date()) {
  const dateKey = localDateKey(date);
  const tasks = calendarTasksForDate(dateKey);
  const pending = tasks.filter((task) => task.status !== "done");
  const overdue = pending.some((task) => safeDate(task.deadlineAt) < at);
  const classes = [
    "calendar-day",
    date.getMonth() !== month.getMonth() ? "outside" : "",
    dateKey === localDateKey(at) ? "today" : "",
    dateKey === state.calendarSelectedDate ? "selected" : "",
    overdue ? "has-overdue" : "",
  ].filter(Boolean).join(" ");
  const dots = tasks.filter((_task, index) => index < 3).map((task) => `<i class="priority-${task.priority} ${task.status === "done" ? "done" : ""}"></i>`).join("");
  return `
    <button class="${classes}" type="button" data-action="select-calendar-date" data-date="${dateKey}" aria-label="${dateKey}${tasks.length ? `，${tasks.length} 项任务截止` : "，无截止任务"}">
      <span>${date.getDate()}</span>
      ${tasks.length ? `<small>${tasks.length}</small><span class="calendar-deadline-rail">${dots}</span>` : ""}
    </button>
  `;
}

function renderCalendarAgendaTask(task) {
  const deadline = safeDate(task.deadlineAt);
  const status = taskDeadlineStatus(task);
  const group = state.taskGroups.find((item) => item.id === (task.groupId || defaultTaskGroup.id));
  return `
    <button class="calendar-agenda-task ${status}" type="button" data-action="open-calendar-task" data-task-id="${task.id}">
      <span class="calendar-agenda-time">${deadline ? `${String(deadline.getHours()).padStart(2, "0")}:${String(deadline.getMinutes()).padStart(2, "0")}` : "--:--"}</span>
      <span><strong>${esc(task.title || "未命名任务")}</strong><small>${esc(group?.title || "默认")} · ${task.status === "done" ? "已完成" : status === "overdue" ? "已逾期" : `${priorityLabels[task.priority]}优先`}</small></span>
    </button>
  `;
}

function renderCalendarPanel() {
  ensureCalendarState();
  const month = calendarMonthDate();
  const agendaTasks = calendarTasksForDate(state.calendarSelectedDate);
  return `
    <div class="calendar-overlay" role="presentation">
      <section class="calendar-panel" role="dialog" aria-modal="true" aria-labelledby="calendar-title">
        <header class="calendar-head">
          <div>
            <span>Deadline Calendar</span>
            <h2 id="calendar-title">日历</h2>
          </div>
          <div class="calendar-head-actions">
            <button class="calendar-review-link" type="button" data-action="open-review-from-calendar">任务回顾</button>
            <button class="settings-close" type="button" data-action="close-calendar" title="关闭">×</button>
          </div>
        </header>
        <div class="calendar-quick-filters" role="group" aria-label="截止范围筛选">
          ${Object.entries(taskDeadlineFilterLabels).map(([value, label]) => `<button class="${state.taskDeadlineFilter === value && !state.taskDateFilter ? "active" : ""}" type="button" data-action="set-deadline-filter" data-value="${value}">${label}</button>`).join("")}
        </div>
        <div class="calendar-body">
          <section class="calendar-month" aria-label="月历">
            <div class="calendar-month-head">
              <button type="button" data-action="shift-calendar-month" data-direction="-1" aria-label="上个月">‹</button>
              <strong>${esc(calendarMonthTitle(month))}</strong>
              <div>
                <button type="button" data-action="calendar-today">今天</button>
                <button type="button" data-action="shift-calendar-month" data-direction="1" aria-label="下个月">›</button>
              </div>
            </div>
            <div class="calendar-weekdays" aria-hidden="true">${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span>${day}</span>`).join("")}</div>
            <div class="calendar-grid">${calendarGridDates(month).map((date) => renderCalendarCell(date, month)).join("")}</div>
          </section>
          <aside class="calendar-agenda" aria-label="选中日期的截止任务">
            <header>
              <div><span>选中日期</span><strong>${esc(calendarAgendaTitle(state.calendarSelectedDate))}</strong></div>
              <button type="button" data-action="apply-calendar-date" ${agendaTasks.length ? "" : "disabled"}>筛选该日</button>
            </header>
            <div class="calendar-agenda-list">
              ${agendaTasks.length ? agendaTasks.map(renderCalendarAgendaTask).join("") : `<div class="calendar-agenda-empty">这一天没有设置截止时间的任务。</div>`}
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

// ============================================================
// REVIEW PANEL
// ============================================================
function renderReviewPanel() {
  const range = reviewRange();
  const items = reviewTasks(range);
  return `
    <div class="review-overlay" role="presentation">
      <section class="review-panel" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <header class="review-head">
          <div>
            <span>Task Review</span>
            <h2 id="review-title">任务回顾</h2>
          </div>
          <button class="settings-close" type="button" data-action="close-review" title="关闭">×</button>
        </header>
        <div class="review-controls">
          <div class="review-segment" aria-label="时间范围">
            ${Object.entries(reviewPresetLabels)
              .map(([preset, label]) => `<button class="${state.reviewPreset === preset ? "active" : ""}" type="button" data-action="set-review-preset" data-preset="${preset}">${label}</button>`)
              .join("")}
          </div>
          <label class="review-field">
            <span>按</span>
            ${selectReviewDateField()}
          </label>
          ${state.reviewPreset === "custom" ? renderReviewDateRangeFields() : ""}
        </div>
        <div class="review-summary">
          <strong>${items.length}</strong>
          <span>${range.label}</span>
        </div>
        <div class="review-list">
          ${
            items.length
              ? items.map((item) => renderReviewItem(item)).join("")
              : `<div class="review-empty">这个范围内没有匹配任务。</div>`
          }
        </div>
      </section>
    </div>
  `;
}

function renderReviewDateRangeFields() {
  return `
    <div class="review-date-range" aria-label="自定义日期范围">
      <label>
        <span>从</span>
        <input type="date" data-review-date-bound="start" value="${escAttr(state.reviewStartDate)}" />
      </label>
      <label>
        <span>到</span>
        <input type="date" data-review-date-bound="end" value="${escAttr(state.reviewEndDate)}" />
      </label>
    </div>
  `;
}

function selectReviewDateField() {
  return `
    <select data-review-date-field>
      ${Object.entries(reviewDateFieldLabels)
        .map(([value, label]) => `<option value="${value}" ${state.reviewDateField === value ? "selected" : ""}>${label}</option>`)
        .join("")}
    </select>
  `;
}

function renderReviewItem({ task, date }) {
  const group = state.taskGroups.find((item) => item.id === (task.groupId || defaultTaskGroup.id));
  const summary = taskSummary(task);
  return `
    <article class="review-item" role="button" tabindex="0" data-action="open-review-task" data-task-id="${task.id}">
      <div>
        <strong>${esc(task.title || "未命名任务")}</strong>
        <p>${esc((task.conclusion || task.hypothesis || task.description || "").trim() || "没有摘要")}</p>
      </div>
      <aside>
        <span>${esc(group?.title || "默认")}</span>
        <span>${reviewDateText(date)}</span>
        <span>${summary.done}/${summary.total || 0} 节点</span>
      </aside>
    </article>
  `;
}

function reviewTasks(range = reviewRange()) {
  return state.tasks
    .map((task) => ({ task, date: taskReviewDate(task, state.reviewDateField) }))
    .filter((item) => item.date && isWithinRange(item.date, range))
    .sort((a, b) => b.date.getTime() - a.date.getTime() || a.task.order - b.task.order);
}

function taskReviewDate(task, field) {
  if (field === "created") return safeDate(task.createdAt);
  if (field === "resolved") return task.status === "done" ? safeDate(task.resolvedAt || task.updatedAt) : null;
  return safeDate(latestTaskTime(task) || task.updatedAt);
}

function reviewRange() {
  const nowDate = new Date();
  if (state.reviewPreset === "all") return { start: null, end: null, label: "全部任务" };
  if (state.reviewPreset === "custom") return customReviewRange();
  if (state.reviewPreset === "year") {
    const start = new Date(nowDate.getFullYear(), 0, 1);
    const end = new Date(nowDate.getFullYear() + 1, 0, 1);
    return { start, end, label: `${nowDate.getFullYear()} 年` };
  }
  if (state.reviewPreset === "month") {
    const start = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
    const end = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1);
    return { start, end, label: `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}` };
  }
  const { start, end } = reviewWeekRange();
  return { start, end, label: "本周" };
}

function customReviewRange() {
  const start = parseDateInput(state.reviewStartDate);
  const rawEnd = parseDateInput(state.reviewEndDate);
  const end = rawEnd ? new Date(rawEnd.getFullYear(), rawEnd.getMonth(), rawEnd.getDate() + 1) : null;
  const startText = state.reviewStartDate || "开始";
  const endText = state.reviewEndDate || "结束";
  if (start && end && start > end) return { start: rawEnd, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1), label: `${endText} - ${startText}` };
  return { start, end, label: `${startText} - ${endText}` };
}

function ensureReviewCustomDates() {
  if (state.reviewStartDate && state.reviewEndDate) return;
  const weeklyRange = reviewWeekRange();
  if (!state.reviewStartDate) state.reviewStartDate = dateInputValue(weeklyRange.start);
  if (!state.reviewEndDate) {
    const inclusiveEnd = new Date(weeklyRange.end.getFullYear(), weeklyRange.end.getMonth(), weeklyRange.end.getDate() - 1);
    state.reviewEndDate = dateInputValue(inclusiveEnd);
  }
}

function reviewWeekRange() {
  const nowDate = new Date();
  const day = nowDate.getDay() || 7;
  const start = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - day + 1);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

function dateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isWithinRange(date, range) {
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date >= range.end) return false;
  return true;
}

function parseDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function safeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function reviewDateText(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value);
}

function settingsSelectHtml(key, value, options) {
  return `
    <select data-setting="${key}">
      ${Object.entries(options)
        .map(([optionValue, label]) => `<option value="${optionValue}" ${optionValue === value ? "selected" : ""}>${label}</option>`)
        .join("")}
    </select>
  `;
}

function settingsOptionGroup(key, value, options) {
  return `
    <div class="settings-options">
      ${Object.entries(options)
        .map(
          ([optionValue, label]) => `
            <button class="${optionValue === value ? "active" : ""}" type="button" data-setting-button="${key}" data-value="${optionValue}">
              <span>${label}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}


// ============================================================
// DRAG & DROP (tasks, groups)
// ============================================================
const taskLongPressDelay = 320;
const taskLongPressMoveTolerance = 8;
const flowNodeDragMime = "application/x-personal-task-flow-node";

function taskDropPlacement(targetItem, clientY) {
  const bounds = targetItem.getBoundingClientRect();
  return clientY < bounds.top + bounds.height / 2 ? "before" : "after";
}

function clearTaskDropIndicators() {
  document.querySelectorAll(".task-item.drag-over, .task-item.drag-over-before, .task-item.drag-over-after").forEach((item) => {
    item.classList.remove("drag-over", "drag-over-before", "drag-over-after");
    delete item.dataset.dropPlacement;
  });
}

function activateTaskPointerDrag() {
  if (!taskDragState || taskDragState.active) return;
  taskDragState.active = true;
  taskDragState.sourceItem.classList.add("dragging");
  taskDragState.sourceItem.setPointerCapture?.(taskDragState.pointerId);
  document.body.classList.add("task-reordering");
  document.activeElement?.blur?.();
}

function beginTaskPointerDrag(event, sourceItem, immediate = false) {
  if (event.button !== 0 || !sourceItem) return;
  if (taskDragState) finishTaskPointerDrag();
  taskDragState = {
    sourceId: sourceItem.dataset.taskId,
    sourceItem,
    targetId: "",
    targetPlacement: "before",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    timer: 0,
  };
  if (immediate) {
    event.preventDefault();
    event.stopPropagation();
    activateTaskPointerDrag();
  } else {
    taskDragState.timer = window.setTimeout(activateTaskPointerDrag, taskLongPressDelay);
  }
  document.addEventListener("pointermove", updateTaskPointerDrag, { passive: false });
  document.addEventListener("pointerup", finishTaskPointerDrag, { once: true });
  document.addEventListener("pointercancel", finishTaskPointerDrag, { once: true });
}

function startTaskLongPress(event) {
  if (event.target.closest(".task-check, input, textarea, select, button, [contenteditable]")) return;
  beginTaskPointerDrag(event, event.currentTarget, false);
}

function updateTaskPointerDrag(event) {
  if (!taskDragState) return;
  if (!taskDragState.active) {
    const distance = Math.hypot(event.clientX - taskDragState.startX, event.clientY - taskDragState.startY);
    if (distance > taskLongPressMoveTolerance) finishTaskPointerDrag();
    return;
  }
  event.preventDefault();
  const targetItem = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-task-drag-target]");
  clearTaskDropIndicators();
  if (!targetItem || targetItem.dataset.taskId === taskDragState.sourceId) {
    taskDragState.targetId = "";
    return;
  }
  taskDragState.targetId = targetItem.dataset.taskId;
  taskDragState.targetPlacement = taskDropPlacement(targetItem, event.clientY);
  targetItem.classList.add("drag-over", `drag-over-${taskDragState.targetPlacement}`);
}

function finishTaskPointerDrag() {
  if (!taskDragState) return;
  const { sourceId, targetId, targetPlacement, active, timer } = taskDragState;
  if (timer) window.clearTimeout(timer);
  taskDragState.sourceItem?.classList.remove("dragging");
  document.body.classList.remove("task-reordering");
  document.removeEventListener("pointermove", updateTaskPointerDrag);
  document.removeEventListener("pointerup", finishTaskPointerDrag);
  document.removeEventListener("pointercancel", finishTaskPointerDrag);
  clearTaskDropIndicators();
  taskDragState = null;
  if (active) suppressTaskClickUntil = Date.now() + 500;
  if (active && targetId) {
    reorderTasks(sourceId, targetId, targetPlacement);
    render();
  }
}

function flowNodeDropPlacement(targetRow, clientY) {
  const bounds = targetRow.getBoundingClientRect();
  const ratio = bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0.5;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "inside";
}

function canMoveFlowNode(taskId, sourceId, targetId = "") {
  const task = state.tasks.find((item) => item.id === taskId);
  const source = task ? findNode(task.nodes, sourceId) : null;
  if (!task || !source) return false;
  if (!targetId) return true;
  if (sourceId === targetId) return false;
  return !findNode(source.children, targetId);
}

function clearFlowNodeDropIndicators() {
  document
    .querySelectorAll(".node-drag-over-before, .node-drag-over-inside, .node-drag-over-after")
    .forEach((row) => row.classList.remove("node-drag-over-before", "node-drag-over-inside", "node-drag-over-after"));
  document.querySelectorAll(".flow-list.node-drag-over-root").forEach((list) => list.classList.remove("node-drag-over-root"));
}

function clearFlowNodeDragState() {
  flowNodeDragState?.sourceRow?.classList.remove("node-dragging");
  flowNodeDragState = null;
  document.body.classList.remove("flow-node-reordering");
  clearFlowNodeDropIndicators();
}

function bindFlowNodeDragAndDrop() {
  document.querySelectorAll("[data-flow-drag-source]").forEach((handle) => {
    handle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("dragstart", (event) => {
      const sourceRow = handle.closest("[data-flow-drag-target]");
      const taskId = handle.dataset.taskId || "";
      const nodeId = handle.dataset.nodeId || "";
      if (!sourceRow || !canMoveFlowNode(taskId, nodeId)) {
        event.preventDefault();
        return;
      }
      flowNodeDragState = { taskId, nodeId, sourceRow };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(flowNodeDragMime, JSON.stringify({ taskId, nodeId }));
      sourceRow.classList.add("node-dragging");
      document.body.classList.add("flow-node-reordering");
      state.contextMenu = null;
      syncContextMenuRoot();
    });
    handle.addEventListener("dragend", clearFlowNodeDragState);
  });

  document.querySelectorAll("[data-flow-drag-target]").forEach((row) => {
    row.addEventListener("dragover", (event) => {
      if (!flowNodeDragState || flowNodeDragState.taskId !== row.dataset.taskId) return;
      const targetId = row.dataset.nodeId || "";
      if (!canMoveFlowNode(flowNodeDragState.taskId, flowNodeDragState.nodeId, targetId)) {
        event.dataTransfer.dropEffect = "none";
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      clearFlowNodeDropIndicators();
      row.classList.add(`node-drag-over-${flowNodeDropPlacement(row, event.clientY)}`);
    });
    row.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;
      row.classList.remove("node-drag-over-before", "node-drag-over-inside", "node-drag-over-after");
    });
    row.addEventListener("drop", (event) => {
      if (!flowNodeDragState || flowNodeDragState.taskId !== row.dataset.taskId) return;
      event.preventDefault();
      event.stopPropagation();
      const { taskId, nodeId } = flowNodeDragState;
      const placement = flowNodeDropPlacement(row, event.clientY);
      const targetId = row.dataset.nodeId || "";
      clearFlowNodeDragState();
      if (moveFlowNode(taskId, nodeId, targetId, placement)) render();
    });
  });

  document.querySelectorAll(".flow-list[data-context='flow-root']").forEach((list) => {
    list.addEventListener("dragover", (event) => {
      if (event.target.closest?.("[data-flow-drag-target]")) return;
      if (!flowNodeDragState || flowNodeDragState.taskId !== list.dataset.taskId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearFlowNodeDropIndicators();
      list.classList.add("node-drag-over-root");
    });
    list.addEventListener("drop", (event) => {
      if (event.target.closest?.("[data-flow-drag-target]")) return;
      if (!flowNodeDragState || flowNodeDragState.taskId !== list.dataset.taskId) return;
      event.preventDefault();
      event.stopPropagation();
      const { taskId, nodeId } = flowNodeDragState;
      clearFlowNodeDragState();
      if (moveFlowNode(taskId, nodeId, "", "root")) render();
    });
  });
}


// ============================================================
// EVENT BINDING -- bind() called after every render
// ============================================================
/**
 * Bind all DOM events after render.
 * Called once after every innerHTML rebuild.
 * Uses data-* attributes for event delegation:
 *   [data-action] for commands, [data-edit-key] for edits,
 *   [data-setting] for preferences, [data-context] for right-click.
 */
function bind() {
  return bindTaskRepositoryRows(document);

  bindTaskRepositoryRows();

  document.querySelectorAll("[data-action]").forEach((element) => {
    if (element.closest(".task-item")) return;
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      action(element.dataset, event);
    });
    if (element.getAttribute("role") === "button") {
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        action(element.dataset, event);
      });
    }
  });

  document.querySelectorAll("[data-edit-key]").forEach((element) => {
    if (element.closest(".task-item")) return;
    bindEditableField(element);
  });

  document.querySelectorAll("[data-context]").forEach((element) => {
    if (element.closest(".task-item")) return;
    bindContextMenu(element);
  });

  document.querySelectorAll(".sheet-tab").forEach((element) => {
    element.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startRenameGroup(element.dataset.groupId);
      render();
    });
  });

  document.querySelectorAll("[data-group-title]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("input", (event) => renameGroup(event.target.dataset.groupTitle, event.target.value, false));
    element.addEventListener("blur", (event) => {
      renameGroup(event.target.dataset.groupTitle, event.target.value, true);
      if (event.relatedTarget?.closest?.(".task-title, .page-title")) return;
      render();
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameGroup(event.target.dataset.groupTitle, event.target.value, true);
        render();
      }
      if (event.key === "Escape") {
        state.editingGroupId = "";
        render();
      }
    });
  });

  document.querySelectorAll(".sheet-tab-wrap").forEach((element) => {
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const x = Math.min(event.clientX, window.innerWidth - 210);
      const y = Math.min(event.clientY, window.innerHeight - 245);
      state.contextMenu = { kind: "group", groupId: element.dataset.groupId, x, y };
      syncContextMenuRoot();
    });
    element.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", element.dataset.groupId);
      element.classList.add("dragging");
    });
    element.addEventListener("dragend", () => element.classList.remove("dragging"));
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      reorderGroups(event.dataTransfer.getData("text/plain"), element.dataset.groupId);
      render();
    });
  });

  const groupScroller = document.querySelector("[data-sheet-tabs]");
  groupScroller?.addEventListener(
    "wheel",
    (event) => {
      if (groupScroller.scrollWidth <= groupScroller.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      groupScroller.scrollLeft += delta;
    },
    { passive: false },
  );

  const newTaskPriority = document.querySelector("[data-new-task-priority]");
  if (newTaskPriority) {
    newTaskPriority.addEventListener("change", (event) => {
      state.newTaskPriority = event.target.value;
    });
    newTaskPriority.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  const newTaskTitle = document.querySelector("[data-new-task-title]");
  if (newTaskTitle) {
    newTaskTitle.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    newTaskTitle.addEventListener("blur", (event) => createTaskFromBlank(event.target.value));
    newTaskTitle.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const title = event.target.value;
        event.target.value = "";
        createTaskFromBlank(title);
      }
    });
  }

  const taskList = document.querySelector('.task-list[data-context="task-list"]');
  taskList?.addEventListener("dblclick", (event) => {
    if (event.target.closest(".task-row, .task-list-head, button, input, select")) return;
    event.preventDefault();
    addBlankTask();
    render();
  });

  const taskCreateHint = document.querySelector("[data-task-create-hint]");
  taskCreateHint?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    addBlankTask();
    render();
  });

  document.querySelectorAll("[data-setting]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("change", (event) => {
      if (event.target.dataset.setting === "theme") state.theme = normalizeTheme(event.target.value);
      if (event.target.dataset.setting === "zh-font") state.zhFont = normalizeZhFont(event.target.value);
      if (event.target.dataset.setting === "en-font") state.enFont = normalizeEnFont(event.target.value);
      if (event.target.dataset.setting === "task-filter") state.taskFilter = normalizeTaskFilter(event.target.value);
    });
  });

  const search = document.querySelector("#search");
  if (search) {
    let isComposing = false;
    const refreshSearch = () => {
      state.query = search.value;
      refreshTaskRepository();
    };
    search.addEventListener("click", (event) => event.stopPropagation());
    search.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    search.addEventListener("compositionend", () => {
      isComposing = false;
      refreshSearch();
    });
    search.addEventListener("input", () => {
      if (!isComposing) refreshSearch();
    });
  }

  const taskFilter = document.querySelector("[data-task-filter]");
  if (taskFilter) {
    taskFilter.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    taskFilter.addEventListener("change", (event) => {
      state.taskFilter = event.target.value;
      state.selectedNodeId = "";
      render();
    });
  }

  const priorityFilter = document.querySelector("[data-priority-filter]");
  if (priorityFilter) {
    priorityFilter.addEventListener("click", (event) => event.stopPropagation());
    priorityFilter.addEventListener("change", (event) => {
      state.priorityFilter = event.target.value;
      state.selectedNodeId = "";
      render();
    });
  }

}

function bindTaskRepositoryRows(scope = document) {
  scope.querySelectorAll(".task-item[data-task-id]").forEach((element) => {
    element.addEventListener("pointerdown", (event) => {
      startTaskLongPress(event);
      const select = event.target.closest("select");
      if (event.button !== 0 || !select || !activateRepositoryTask(element.dataset.taskId)) return;
      syncRepositoryTaskSelection();

      // Do not rebuild the DOM while a native select menu is open. Its change
      // handler persists the value first; blur also covers dismissing the menu.
      let rendered = false;
      const renderSelection = () => {
        if (rendered) return;
        rendered = true;
        window.requestAnimationFrame(() => render());
      };
      select.addEventListener("change", renderSelection, { once: true });
      select.addEventListener("blur", renderSelection, { once: true });
    });
    element.addEventListener(
      "click",
      (event) => {
        if (Date.now() < suppressTaskClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!activateRepositoryTask(element.dataset.taskId)) return;
        syncRepositoryTaskSelection();

        // Controls inside a repository row keep their original behavior, but
        // selecting the row must happen first. Action buttons render after
        // their command runs; title inputs need focus restored after render.
        if (event.target.closest("[data-action]")) return;
        if (event.target.closest(".task-title")) state.focusTaskTitleId = element.dataset.taskId;
        window.requestAnimationFrame(() => render());
      },
      true,
    );
  });

  if (scope !== document) {
    scope.querySelectorAll(".task-item[data-task-id]").forEach((element) => {
      element.addEventListener("dragstart", (event) => {
        if (event.target.closest(".task-check, input, textarea, select, button, [contenteditable]")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", element.dataset.taskId);
        element.classList.add("dragging");
      });
      element.addEventListener("dragend", () => {
        element.classList.remove("dragging");
        clearTaskDropIndicators();
      });
      element.addEventListener("dragover", (event) => {
        const hasTaskDrag = Array.from(event.dataTransfer.types || []).includes("text/plain");
        if (!hasTaskDrag) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        clearTaskDropIndicators();
        const placement = taskDropPlacement(element, event.clientY);
        element.dataset.dropPlacement = placement;
        element.classList.add("drag-over", `drag-over-${placement}`);
      });
      element.addEventListener("dragleave", () => {
        element.classList.remove("drag-over", "drag-over-before", "drag-over-after");
        delete element.dataset.dropPlacement;
      });
      element.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const placement = element.dataset.dropPlacement || taskDropPlacement(element, event.clientY);
        clearTaskDropIndicators();
        reorderTasks(event.dataTransfer.getData("text/plain"), element.dataset.taskId, placement);
        render();
      });
      element.querySelectorAll("[data-action]").forEach((control) => {
        control.addEventListener("click", (event) => {
          event.stopPropagation();
          action(control.dataset, event);
        });
      });
      element.querySelectorAll("[data-edit-key]").forEach((control) => {
        control.addEventListener("input", (event) => edit(event.target.dataset, event.target.value));
        control.addEventListener("change", (event) => {
          edit(event.target.dataset, event.target.value);
          refreshTaskRepository();
        });
        control.addEventListener("click", (event) => event.stopPropagation());
      });
      element.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.contextMenu = {
          kind: "task",
          taskId: element.dataset.taskId,
          nodeId: "",
          x: Math.min(event.clientX, window.innerWidth - 210),
          y: Math.min(event.clientY, window.innerHeight - 245),
        };
        state.activeTaskId = element.dataset.taskId;
        state.selectedNodeId = "";
        render();
      });
    });
    return;
  }

  document.querySelectorAll(".task-item[data-task-id]").forEach((element) => {
    element.addEventListener("dragstart", (event) => {
      if (event.target.closest(".task-check, input, textarea, select, button, [contenteditable]")) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", element.dataset.taskId);
      element.classList.add("dragging");
    });
    element.addEventListener("dragend", () => {
      element.classList.remove("dragging");
      clearTaskDropIndicators();
    });
  });

  document.querySelectorAll("[data-task-drag-target]").forEach((element) => {
    element.addEventListener("dragover", (event) => {
      const hasTaskDrag = Array.from(event.dataTransfer.types || []).includes("text/plain");
      if (!hasTaskDrag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearTaskDropIndicators();
      const placement = taskDropPlacement(element, event.clientY);
      element.dataset.dropPlacement = placement;
      element.classList.add("drag-over", `drag-over-${placement}`);
    });
    element.addEventListener("dragleave", () => {
      element.classList.remove("drag-over", "drag-over-before", "drag-over-after");
      delete element.dataset.dropPlacement;
    });
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const placement = element.dataset.dropPlacement || taskDropPlacement(element, event.clientY);
      clearTaskDropIndicators();
      reorderTasks(event.dataTransfer.getData("text/plain"), element.dataset.taskId, placement);
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      action(element.dataset, event);
    });
    if (element.getAttribute("role") === "button") {
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        action(element.dataset, event);
      });
    }
  });

  document.querySelectorAll(".sheet-tab").forEach((element) => {
    element.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startRenameGroup(element.dataset.groupId);
      render();
    });
  });

  document.querySelectorAll("[data-group-title]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("input", (event) => renameGroup(event.target.dataset.groupTitle, event.target.value, false));
    element.addEventListener("blur", (event) => {
      renameGroup(event.target.dataset.groupTitle, event.target.value, true);
      if (event.relatedTarget?.closest?.(".task-title, .page-title")) return;
      render();
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameGroup(event.target.dataset.groupTitle, event.target.value, true);
        render();
      }
      if (event.key === "Escape") {
        state.editingGroupId = "";
        render();
      }
    });
  });

  document.querySelectorAll(".sheet-tab-wrap").forEach((element) => {
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const x = Math.min(event.clientX, window.innerWidth - 210);
      const y = Math.min(event.clientY, window.innerHeight - 245);
      state.contextMenu = {
        kind: "group",
        groupId: element.dataset.groupId,
        x,
        y,
      };
      syncContextMenuRoot();
    });
    element.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", element.dataset.groupId);
      element.classList.add("dragging");
    });
    element.addEventListener("dragend", () => element.classList.remove("dragging"));
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      reorderGroups(event.dataTransfer.getData("text/plain"), element.dataset.groupId);
      render();
    });
  });

  const groupScroller = document.querySelector("[data-sheet-tabs]");
  groupScroller?.addEventListener(
    "wheel",
    (event) => {
      if (groupScroller.scrollWidth <= groupScroller.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      groupScroller.scrollLeft += delta;
    },
    { passive: false },
  );

  document.querySelectorAll("[data-edit-key]").forEach((element) => {
    element.addEventListener("input", (event) => {
      edit(event.target.dataset, event.target.value);
      if (event.target.closest(".task-brief")) resizeTaskBriefTextarea(event.target);
    });
    element.addEventListener("change", (event) => edit(event.target.dataset, event.target.value));
    element.addEventListener("change", (event) => {
      if (event.target.dataset.editKey === "groupId") render();
    });
    element.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    element.addEventListener("blur", (event) => {
      if (!event.relatedTarget && !appEditingPointerDown && captureAppSwitchEditingFocus(event.target)) return;
      if (event.target.classList.contains("markdown-editor")) {
        storeMarkdownSelection(event.target, !event.relatedTarget);
        if (!event.relatedTarget) return;
      }
      if (event.relatedTarget?.closest?.("[data-action], .sheet-bar, .node-detail, .task-page")) return;
      render();
    });
  });

  document.querySelectorAll("[data-context]").forEach((element) => {
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const x = Math.min(event.clientX, window.innerWidth - 210);
      const y = Math.min(event.clientY, window.innerHeight - 245);
      state.contextMenu = {
        kind: element.dataset.context,
        taskId: element.dataset.taskId,
        nodeId: element.dataset.nodeId || "",
        x,
        y,
      };
      if (element.dataset.context === "task" && element.dataset.taskId) {
        state.activeTaskId = element.dataset.taskId;
        state.selectedNodeId = "";
      }
      render();
    });
  });

  const newTaskPriority = document.querySelector("[data-new-task-priority]");
  if (newTaskPriority) {
    newTaskPriority.addEventListener("change", (event) => {
      state.newTaskPriority = event.target.value;
    });
    newTaskPriority.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  const newTaskTitle = document.querySelector("[data-new-task-title]");
  if (newTaskTitle) {
    newTaskTitle.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    newTaskTitle.addEventListener("blur", (event) => createTaskFromBlank(event.target.value));
    newTaskTitle.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const title = event.target.value;
        event.target.value = "";
        createTaskFromBlank(title);
      }
    });
  }

  const taskList = document.querySelector('.task-list[data-context="task-list"]');
  taskList?.addEventListener("dblclick", (event) => {
    if (event.target.closest(".task-row, .task-list-head, button, input, select")) return;
    event.preventDefault();
    addBlankTask();
    render();
  });

  const taskCreateHint = document.querySelector("[data-task-create-hint]");
  taskCreateHint?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    addBlankTask();
    render();
  });

  document.querySelectorAll("[data-setting]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("change", (event) => {
      if (event.target.dataset.setting === "theme") state.theme = normalizeTheme(event.target.value);
      if (event.target.dataset.setting === "zh-font") state.zhFont = normalizeZhFont(event.target.value);
      if (event.target.dataset.setting === "en-font") state.enFont = normalizeEnFont(event.target.value);
      if (event.target.dataset.setting === "task-filter") state.taskFilter = normalizeTaskFilter(event.target.value);
      if (event.target.dataset.setting === "priority-filter") state.priorityFilter = normalizePriorityFilter(event.target.value);
      if (event.target.dataset.setting === "new-task-priority") state.newTaskPriority = normalizePriority(event.target.value);
      save();
      render();
    });
  });

  document.querySelectorAll("[data-setting-button]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      applySetting(event.currentTarget.dataset.settingButton, event.currentTarget.dataset.value);
      save();
      render();
    });
  });

  document.querySelectorAll("[data-review-date-field]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("change", (event) => {
      state.reviewDateField = Object.hasOwn(reviewDateFieldLabels, event.target.value) ? event.target.value : "updated";
      render();
    });
  });

  document.querySelectorAll("[data-review-date-bound]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("change", (event) => {
      if (event.target.dataset.reviewDateBound === "start") state.reviewStartDate = event.target.value;
      if (event.target.dataset.reviewDateBound === "end") state.reviewEndDate = event.target.value;
      state.reviewPreset = "custom";
      render();
    });
  });

  const reviewPanel = document.querySelector(".review-panel");
  if (reviewPanel) {
    reviewPanel.addEventListener("click", (event) => event.stopPropagation());
  }

  const reviewOverlay = document.querySelector(".review-overlay");
  if (reviewOverlay) {
    reviewOverlay.addEventListener("click", () => {
      state.reviewOpen = false;
      render();
    });
  }

  const calendarPanel = document.querySelector(".calendar-panel");
  calendarPanel?.addEventListener("click", (event) => event.stopPropagation());

  const calendarOverlay = document.querySelector(".calendar-overlay");
  calendarOverlay?.addEventListener("click", () => {
    state.calendarOpen = false;
    render();
  });

  const settingsPanel = document.querySelector(".settings-panel");
  if (settingsPanel) {
    settingsPanel.addEventListener("click", (event) => event.stopPropagation());
  }

  const settingsOverlay = document.querySelector(".settings-overlay");
  if (settingsOverlay) {
    settingsOverlay.addEventListener("click", () => {
      state.settingsOpen = false;
      render();
    });
  }

  bindUpdateSettingsControls();

  const feedbackPanel = document.querySelector(".feedback-panel");
  feedbackPanel?.addEventListener("click", (event) => event.stopPropagation());

  const feedbackBackdrop = document.querySelector("[data-feedback-backdrop]");
  feedbackBackdrop?.addEventListener("pointerdown", (event) => {
    if (event.target !== feedbackBackdrop || state.feedbackSubmitting) return;
    closeBugReport();
    render();
  });

  document.querySelectorAll("[data-feedback-field]").forEach((element) => {
    const updateDraft = (event) => {
      const key = event.target.dataset.feedbackField;
      state.feedbackDraft[key] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      delete state.feedbackErrors[key];
      state.feedbackMessage = "";
    };
    element.addEventListener("input", updateDraft);
    element.addEventListener("change", updateDraft);
  });

  const feedbackForm = document.querySelector("[data-feedback-form]");
  feedbackForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitBugReport();
  });

  const search = document.querySelector("#search");
  if (search) {
    let isComposing = false;
    const refreshSearch = () => {
      state.query = search.value;
      refreshTaskRepository();
    };
    search.addEventListener("click", (event) => event.stopPropagation());
    search.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    search.addEventListener("compositionend", () => {
      isComposing = false;
      refreshSearch();
    });
    search.addEventListener("input", () => {
      if (!isComposing) refreshSearch();
    });
  }

  const taskFilter = document.querySelector("[data-task-filter]");
  if (taskFilter) {
    taskFilter.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    taskFilter.addEventListener("change", (event) => {
      state.taskFilter = event.target.value;
      state.selectedNodeId = "";
      render();
    });
  }

  const priorityFilter = document.querySelector("[data-priority-filter]");
  if (priorityFilter) {
    priorityFilter.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    priorityFilter.addEventListener("change", (event) => {
      state.priorityFilter = event.target.value;
      state.selectedNodeId = "";
      render();
    });
  }

  document.querySelectorAll("[data-deadline-field]").forEach((control) => {
    control.addEventListener("click", (event) => event.stopPropagation());
    control.addEventListener("change", (event) => {
      const task = state.tasks.find((item) => item.id === event.currentTarget.dataset.taskId);
      if (!task) return;
      task.deadlineAt = normalizeDeadlineInput(event.currentTarget.value);
      task.updatedAt = now();
      save();
      render();
    });
  });

  document.querySelectorAll("[data-recurrence-toggle]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.stopPropagation();
      recurrencePopoverTaskId = recurrencePopoverTaskId === event.currentTarget.dataset.taskId ? "" : event.currentTarget.dataset.taskId;
      render();
    });
  });

  document.querySelectorAll("[data-recurrence-field]").forEach((control) => {
    control.addEventListener("click", (event) => event.stopPropagation());
    control.addEventListener("change", (event) => {
      updateTaskRecurrence(event.currentTarget.dataset.taskId, event.currentTarget.dataset.recurrenceField, event.currentTarget.value);
      syncRecurringTasks(new Date());
      render();
    });
  });

  document.querySelectorAll("[data-recurrence-mode]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.stopPropagation();
      updateTaskRecurrence(event.currentTarget.dataset.taskId, "frequency", event.currentTarget.dataset.recurrenceMode);
      syncRecurringTasks(new Date());
      render();
    });
  });

  document.querySelectorAll("[data-recurrence-weekday]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.stopPropagation();
      updateTaskRecurrence(event.currentTarget.dataset.taskId, "weekday", event.currentTarget.dataset.recurrenceWeekday);
      syncRecurringTasks(new Date());
      render();
    });
  });

  bindFlowNodeDragAndDrop();

  document.querySelectorAll("[data-flow-split-resizer]").forEach((handle) => {
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", startFlowSplitResize);
    handle.addEventListener("keydown", handleFlowSplitKeydown);
  });

  document.querySelectorAll("[data-sidebar-resizer]").forEach((handle) => {
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", startSidebarResize);
  });

  document.querySelectorAll("[data-detail-resizer]").forEach((handle) => {
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", startDetailResize);
  });

  document.querySelectorAll(".markdown-editor").forEach((editor) => {
    editor.addEventListener("paste", handleMarkdownPaste);
    editor.addEventListener("input", () => updateMarkdownEditorState(editor));
    editor.addEventListener("dragover", (event) => {
      if (hasDraggedImage(event)) {
        event.preventDefault();
        editor.closest(".markdown-panel")?.classList.add("dragging-image");
      }
    });
    editor.addEventListener("dragleave", () => {
      editor.closest(".markdown-panel")?.classList.remove("dragging-image");
    });
    editor.addEventListener("drop", handleMarkdownDrop);
    editor.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        handleMarkdownPasteShortcut(event);
      }
      if (event.key === "Tab") {
        event.preventDefault();
        insertEditorText(editor, "    ");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        applyMarkdownTool("bold");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        applyMarkdownTool("italic");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        applyMarkdownTool("link");
      }
    });
  });

  const recordInput = document.querySelector("[data-record-input]");
  if (recordInput) {
    recordInput.addEventListener("input", (event) => {
      state.recordDraft = event.target.value;
    });
    recordInput.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        saveSelectedNodeRecord();
        render();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exitNodeDetail();
        render();
      }
    });
  }

  const recordBackdrop = document.querySelector("[data-record-modal-backdrop]");
  recordBackdrop?.addEventListener("pointerdown", (event) => {
    if (event.target !== recordBackdrop) return;
    exitNodeDetail();
    render();
  });

  document.querySelectorAll("[data-editor-focus-target]").forEach((panel) => {
    panel.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("button, input, select, textarea, a, .context-menu, .detail-actions, .ProseMirror, .markdown-editor")) return;
      window.requestAnimationFrame(() => focusKnowledgeEditor());
    });
    panel.addEventListener("contextmenu", (event) => {
      if (!panel.closest(".fullscreen-editor")) return;
      event.preventDefault();
      event.stopPropagation();
      const x = Math.min(event.clientX, window.innerWidth - 210);
      const y = Math.min(event.clientY, window.innerHeight - 245);
      state.contextMenu = {
        kind: "editor",
        taskId: panel.dataset.taskId,
        nodeId: panel.dataset.nodeId || "",
        x,
        y,
      };
      syncContextMenuRoot();
    });
  });

  const app = document.querySelector(".ops-app");
  if (app) {
    app.addEventListener("pointerdown", (event) => {
      let needsRender = false;
      const keepNodeDetail = event.target.closest(".node-detail, .flow-row:not(.flow-header), .context-menu, [data-action], [data-edit-key], button, input, textarea, select");
      const keepSettings = event.target.closest(".settings-overlay, .settings-trigger, .theme-toggle");
      const keepReview = event.target.closest(".review-overlay, .review-trigger");
      const keepContextMenu = event.target.closest(".context-menu");
      const keepRecurrence = event.target.closest(".task-recurrence-controls");

      if (state.contextMenu && !keepContextMenu) {
        state.contextMenu = null;
        syncContextMenuRoot();
      }

      if (state.settingsOpen && !keepSettings) {
        state.settingsOpen = false;
        needsRender = true;
      }

      if (state.reviewOpen && !keepReview) {
        state.reviewOpen = false;
        needsRender = true;
      }

      if (recurrencePopoverTaskId && !keepRecurrence) {
        recurrencePopoverTaskId = "";
        document.querySelector(".task-recurrence-popover")?.remove();
        document.querySelector("[data-recurrence-toggle]")?.setAttribute("aria-expanded", "false");
      }

      if (state.selectedNodeId && !keepNodeDetail && exitNodeDetail()) needsRender = true;

      if (needsRender) render();
    });
  }
}

function activateRepositoryTask(taskId) {
  if (!taskId || !state.tasks.some((task) => task.id === taskId) || state.activeTaskId === taskId) return false;
  state.activeTaskId = taskId;
  state.selectedNodeId = "";
  state.recordDraft = "";
  state.nodeDetailFullscreen = false;
  state.nodeDetailPosition = null;
  return true;
}

function syncRepositoryTaskSelection() {
  document.querySelectorAll(".task-item[data-task-id]").forEach((element) => {
    const active = element.dataset.taskId === state.activeTaskId;
    element.classList.toggle("selected", active);
    element.classList.toggle("active", active);
  });
}

function resizeTaskBriefTextareas() {
  document.querySelectorAll(".task-brief textarea").forEach((element) => resizeTaskBriefTextarea(element));
}

function resizeTaskBriefTextarea(element) {
  const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight) || 20;
  const minHeight = lineHeight * 3;
  const maxHeight = lineHeight * 5;
  element.style.height = "0px";
  element.style.height = `${Math.min(maxHeight, Math.max(minHeight, element.scrollHeight))}px`;
  element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
}

function applySetting(key, value) {
  if (key === "theme") state.theme = normalizeTheme(value);
  if (key === "zh-font") state.zhFont = normalizeZhFont(value);
  if (key === "en-font") state.enFont = normalizeEnFont(value);
  if (key === "task-filter") state.taskFilter = normalizeTaskFilter(value);
  if (key === "priority-filter") state.priorityFilter = normalizePriorityFilter(value);
  if (key === "new-task-priority") state.newTaskPriority = normalizePriority(value);
  if ((key === "task-filter" || key === "priority-filter") && !filteredTasks({ includeQuery: false }).some((task) => task.id === state.activeTaskId)) {
    state.activeTaskId = "";
  }
}

function closeBugReport() {
  if (state.feedbackSubmitting) return;
  state.feedbackOpen = false;
  state.feedbackErrors = {};
  state.feedbackMessage = "";
  state.feedbackResult = null;
}

function validateBugReportDraft(draft = state.feedbackDraft) {
  const errors = {};
  const titleLength = unicodeLength(draft.title.trim());
  const descriptionLength = unicodeLength(draft.description.trim());
  if (titleLength < 3 || titleLength > 100) errors.title = "问题标题需为 3～100 字";
  if (!Object.hasOwn(bugCategoryLabels, draft.category)) errors.category = "请选择问题类型";
  if (descriptionLength < 10 || descriptionLength > 5000) errors.description = "问题描述需为 10～5000 字";
  if (unicodeLength(draft.reproductionSteps.trim()) > 5000) errors.reproductionSteps = "复现步骤最多 5000 字";
  if (unicodeLength(draft.contact.trim()) > 200) errors.contact = "联系方式最多 200 字";
  if (!draft.confirmed) errors.confirmed = "请确认隐私提示后再提交";
  return errors;
}

function unicodeLength(value) {
  return Array.from(String(value || "")).length;
}

function currentPageName() {
  if (state.taskPane === "notes") return "Knowledge Notes";
  if (state.taskPane === "history") return "Task History";
  return "Task Flow";
}

function bugReportPayload() {
  const draft = state.feedbackDraft;
  const includeEnvironment = draft.includeEnvironment !== false;
  return {
    title: draft.title.trim(),
    category: bugCategoryLabels[draft.category],
    description: draft.description.trim(),
    reproductionSteps: draft.reproductionSteps.trim(),
    contact: draft.contact.trim(),
    includeEnvironment,
    environment: includeEnvironment
      ? {
          appVersion: APP_VERSION || "dev",
          os: String(desktopEnvironment.os || "Browser Preview"),
          architecture: String(desktopEnvironment.architecture || "unknown"),
          currentPage: currentPageName(),
          submittedAt: now(),
          installationId: state.installationId,
        }
      : undefined,
  };
}

async function submitBugReport() {
  if (state.feedbackSubmitting) return false;
  const errors = validateBugReportDraft();
  if (Object.keys(errors).length) {
    state.feedbackErrors = errors;
    state.feedbackMessage = "请完善标记的内容";
    render();
    return false;
  }

  state.feedbackSubmitting = true;
  state.feedbackErrors = {};
  state.feedbackMessage = "";
  state.feedbackResult = null;
  render();

  try {
    if (!desktopBugReports?.submit) throw new Error("SERVICE_NOT_AVAILABLE");
    const result = await desktopBugReports.submit(bugReportPayload());
    if (!result?.success) {
      state.feedbackMessage = String(result?.message || "反馈提交失败，请稍后重试").slice(0, 240);
      return false;
    }
    state.feedbackDraft = createEmptyFeedbackDraft();
    state.feedbackResult = result;
    return true;
  } catch {
    state.feedbackMessage = "网络不可用，请检查连接后重试";
    return false;
  } finally {
    state.feedbackSubmitting = false;
    render();
  }
}

function flowSplitBounds(total) {
  return {
    min: Math.max(flowWidthLimits.title[0], total - flowWidthLimits.note[1]),
    max: Math.min(flowWidthLimits.title[1], total - flowWidthLimits.note[0]),
  };
}

function setFlowSplitTitleWidth(titleWidth, flowList = document.querySelector(".flow-list")) {
  const total = normalizeFlowWidth("title", state.flowWidths.title) + normalizeFlowWidth("note", state.flowWidths.note);
  const bounds = flowSplitBounds(total);
  const nextTitle = Math.max(bounds.min, Math.min(bounds.max, Math.round(titleWidth)));
  const nextNote = total - nextTitle;
  state.flowWidths.title = nextTitle;
  state.flowWidths.note = nextNote;
  if (flowList) {
    flowList.style.setProperty("--flow-title-width", `${nextTitle}px`);
    flowList.style.setProperty("--flow-note-width", `${nextNote}px`);
    flowList.style.setProperty("--flow-title-track", `${nextTitle}fr`);
    flowList.style.setProperty("--flow-note-track", `${nextNote}fr`);
    const handle = flowList.querySelector("[data-flow-split-resizer]");
    const percentage = Math.round((nextTitle / total) * 100);
    handle?.setAttribute("aria-valuenow", String(percentage));
    handle?.setAttribute("aria-valuetext", `标题 ${percentage}% · 记录 ${100 - percentage}%`);
  }
  return nextTitle;
}

function flowSplitGeometry(flowList) {
  const row = flowList?.querySelector(".flow-line.flow-row:not(.header)");
  const titleCell = row?.querySelector(".flow-title-cell");
  const recordCell = row?.querySelector(".flow-record-input");
  if (!titleCell || !recordCell) return null;
  const titleRect = titleCell.getBoundingClientRect();
  const recordRect = recordCell.getBoundingClientRect();
  const left = titleRect.left;
  const right = recordRect.right;
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;
  return { left, right, boundary: titleRect.right, width: right - left };
}

function setFlowSplitFromClientX(clientX, flowList) {
  const geometry = flowSplitGeometry(flowList);
  if (!geometry) return null;
  const minimumTitle = Math.min(flowWidthLimits.title[0], Math.max(0, geometry.width - flowWidthLimits.note[0]));
  const minimumNote = Math.min(flowWidthLimits.note[0], Math.max(0, geometry.width - minimumTitle));
  const boundary = Math.max(
    geometry.left + minimumTitle,
    Math.min(geometry.right - minimumNote, clientX),
  );
  const total = normalizeFlowWidth("title", state.flowWidths.title) + normalizeFlowWidth("note", state.flowWidths.note);
  return setFlowSplitTitleWidth((total * (boundary - geometry.left)) / geometry.width, flowList);
}

function startFlowSplitResize(event) {
  event.preventDefault();
  event.stopPropagation();
  const flowList = event.currentTarget.closest(".flow-list");
  const geometry = flowSplitGeometry(flowList);
  if (!flowList || !geometry) return;
  const grabOffset = event.clientX - geometry.boundary;
  document.body.classList.add("resizing-flow-split");
  event.currentTarget.setPointerCapture?.(event.pointerId);

  function move(moveEvent) {
    setFlowSplitFromClientX(moveEvent.clientX - grabOffset, flowList);
  }

  function end() {
    document.body.classList.remove("resizing-flow-split");
    saveFlowWidths();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function handleFlowSplitKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const total = normalizeFlowWidth("title", state.flowWidths.title) + normalizeFlowWidth("note", state.flowWidths.note);
  const bounds = flowSplitBounds(total);
  const current = normalizeFlowWidth("title", state.flowWidths.title);
  const next = event.key === "Home" ? bounds.min : event.key === "End" ? bounds.max : current + (event.key === "ArrowLeft" ? -12 : 12);
  setFlowSplitTitleWidth(next, event.currentTarget.closest(".flow-list"));
  saveFlowWidths();
}

function startSidebarResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startWidth = normalizeSidebarWidth(state.sidebarWidth);
  const app = document.querySelector(".ops-app");
  document.body.classList.add("resizing-sidebar");

  function move(moveEvent) {
    const nextWidth = normalizeSidebarWidth(startWidth + moveEvent.clientX - startX);
    state.sidebarWidth = nextWidth;
    if (app) app.style.setProperty("--sidebar-width", `${nextWidth}px`);
  }

  function end() {
    document.body.classList.remove("resizing-sidebar");
    save();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
}

function startDetailResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const startY = event.clientY;
  const startHeight = normalizeDetailHeight(state.detailHeight);
  const workbench = event.target.closest(".task-workbench");
  const totalHeight = Math.max(1, workbench?.getBoundingClientRect().height || window.innerHeight);
  document.body.classList.add("resizing-detail");

  function move(moveEvent) {
    const delta = ((moveEvent.clientY - startY) / totalHeight) * 100;
    const nextHeight = normalizeDetailHeight(startHeight - delta);
    state.detailHeight = nextHeight;
    if (workbench) {
      workbench.style.setProperty("--detail-pane-height", `${nextHeight}%`);
      workbench.style.setProperty("--flow-pane-height", `${100 - nextHeight}%`);
    }
  }

  function end() {
    document.body.classList.remove("resizing-detail");
    save();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
}


// ============================================================
// NODE DETAIL LIFECYCLE
// ============================================================
function exitNodeDetail() {
  if (!state.selectedNodeId) return false;
  state.selectedNodeId = "";
  state.recordDraft = "";
  state.nodeDetailFullscreen = false;
  state.nodeDetailPosition = null;
  document.querySelector(".node-detail")?.remove();
  document.querySelectorAll(".flow-row.selected").forEach((row) => row.classList.remove("selected"));
  return true;
}

function saveSelectedNodeRecord() {
  const task = state.tasks.find((item) => item.id === state.activeTaskId);
  const node = task && state.selectedNodeId ? findNode(task.nodes, state.selectedNodeId) : null;
  if (task && node && node.note !== state.recordDraft) {
    node.note = state.recordDraft;
    node.updatedAt = now();
    task.updatedAt = now();
  }
  state.selectedNodeId = "";
  state.recordDraft = "";
  state.nodeDetailFullscreen = false;
  state.nodeDetailPosition = null;
}

function focusPendingElement() {
  if (state.focusSearch) {
    const input = document.querySelector("#search");
    state.focusSearch = false;
    if (input) {
      input.focus();
      const cursor = Math.min(state.searchCursor, input.value.length);
      input.setSelectionRange(cursor, cursor);
    }
    return;
  }

  if (state.focusTaskTitleId) {
    const input = document.querySelector(`.task-title[data-task-id="${state.focusTaskTitleId}"]`);
    state.focusTaskTitleId = "";
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }

  if (state.focusNodeTitleId) {
    const input = document.querySelector(`.flow-title-input[data-node-id="${state.focusNodeTitleId}"]`);
    state.focusNodeTitleId = "";
    if (input) {
      input.focus();
      input.select();
    }
  }

  if (state.focusGroupTitleId) {
    const input = document.querySelector(`[data-group-title="${state.focusGroupTitleId}"]`);
    state.focusGroupTitleId = "";
    if (input) {
      input.focus();
      input.select();
    }
  }

  const recordInput = document.querySelector("[data-record-input]");
  if (recordInput) {
    recordInput.focus();
    const end = recordInput.value.length;
    recordInput.setSelectionRange(end, end);
    return;
  }

  restoreMarkdownSelection();
}

function captureAppSwitchEditingFocus(target = document.activeElement) {
  if (!target) return false;
  const isProseMirror = target.classList?.contains("ProseMirror");
  const isMarkdownEditor = target.classList?.contains("markdown-editor");
  const isNativeField = Boolean(target.dataset?.editKey) && typeof target.setSelectionRange === "function";
  if (!isProseMirror && !isMarkdownEditor && !isNativeField) return false;

  const host = target.closest?.(".milkdown-editor-host");
  const taskId = target.dataset?.taskId || host?.dataset?.taskId || "";
  const nodeId = target.dataset?.nodeId || host?.dataset?.nodeId || "";
  const instance = isProseMirror ? milkdownEditors.get(noteDraftKey(taskId, nodeId))?.instance : null;
  const marker = ["page-title", "task-title", "flow-title-input"].find((name) => target.classList?.contains(name)) || "";
  const restore = appSwitchFocusSnapshot?.restore === true;
  appSwitchFocusSnapshot = {
    restore,
    kind: isProseMirror ? "milkdown" : isMarkdownEditor ? "markdown" : "field",
    element: target,
    taskId,
    nodeId,
    editKey: target.dataset?.editKey || "",
    marker,
    start: typeof target.selectionStart === "number" ? target.selectionStart : 0,
    end: typeof target.selectionEnd === "number" ? target.selectionEnd : 0,
    scrollLeft: Number(target.scrollLeft) || 0,
    scrollTop: Number(target.scrollTop) || 0,
    milkdownSelection: instance?.getSelection?.() || null,
  };
  return true;
}

function resolveAppSwitchEditingElement(snapshot) {
  if (snapshot.element && document.body.contains(snapshot.element)) return snapshot.element;
  if (snapshot.kind === "milkdown" || snapshot.kind === "markdown") {
    const host = Array.from(document.querySelectorAll(".milkdown-editor-host")).find(
      (item) => item.dataset.taskId === snapshot.taskId && (item.dataset.nodeId || "") === snapshot.nodeId,
    );
    return host?.querySelector(snapshot.kind === "milkdown" ? ".ProseMirror" : ".markdown-editor") || null;
  }
  return (
    Array.from(document.querySelectorAll("[data-edit-key]")).find(
      (item) =>
        item.dataset.editKey === snapshot.editKey &&
        item.dataset.taskId === snapshot.taskId &&
        (item.dataset.nodeId || "") === snapshot.nodeId &&
        (!snapshot.marker || item.classList?.contains(snapshot.marker)),
    ) || null
  );
}

function restoreAppSwitchEditingFocus() {
  const snapshot = appSwitchFocusSnapshot;
  if (!snapshot?.restore) return false;
  const target = resolveAppSwitchEditingElement(snapshot);
  if (!target) return false;

  if (snapshot.kind === "milkdown") {
    const host = target.closest?.(".milkdown-editor-host");
    const instance = milkdownEditors.get(noteDraftKey(host?.dataset?.taskId || snapshot.taskId, host?.dataset?.nodeId || snapshot.nodeId))?.instance;
    if (snapshot.milkdownSelection && !instance?.restoreSelection) return false;
    if (snapshot.milkdownSelection) instance.restoreSelection(snapshot.milkdownSelection);
    else target.focus({ preventScroll: true });
  } else {
    target.focus({ preventScroll: true });
    const maximum = typeof target.value === "string" ? target.value.length : 0;
    target.setSelectionRange(Math.min(snapshot.start, maximum), Math.min(snapshot.end, maximum));
  }
  target.scrollLeft = snapshot.scrollLeft;
  target.scrollTop = snapshot.scrollTop;
  state.restoreMarkdownFocus = false;
  appSwitchFocusSnapshot = null;
  return true;
}


// ============================================================
// MARKDOWN EDITOR (Milkdown integration)
// ============================================================
function storeMarkdownSelection(editor = activeMarkdownEditor(), shouldRestore = false) {
  if (!editor) return;
  state.markdownSelection = {
    taskId: editor.dataset.taskId,
    nodeId: editor.dataset.nodeId,
    start: editor.selectionStart || 0,
    end: editor.selectionEnd || editor.selectionStart || 0,
  };
  if (shouldRestore) state.restoreMarkdownFocus = true;
}

function restoreMarkdownSelection() {
  const selection = state.markdownSelection;
  if (!state.restoreMarkdownFocus || !selection || state.markdownMode !== "edit" || state.selectedNodeId !== selection.nodeId) return;
  const editor = document.querySelector(`.markdown-editor[data-node-id="${selection.nodeId}"]`);
  if (!editor) return;
  const start = Math.min(selection.start, editor.value.length);
  const end = Math.min(selection.end, editor.value.length);
  editor.focus();
  editor.setSelectionRange(start, end);
  state.restoreMarkdownFocus = false;
}

function destroyMilkdownEditors(preservedKeys = new Set()) {
  milkdownEditors.forEach((entry, key) => {
    if (preservedKeys.has(key)) return;
    entry?.instance?.destroy?.().catch?.(() => {});
    milkdownEditors.delete(key);
  });
}

function stashKnowledgePane() {
  const pane = document.querySelector(".task-knowledge-pane[data-task-id]");
  if (!pane) return;
  const taskId = pane.dataset.taskId;
  if (!taskId) return;
  if (cachedKnowledgePane && cachedKnowledgePane.taskId !== taskId) discardCachedKnowledgePane();
  cachedKnowledgePane = { taskId, pane };
  pane.remove();
}

function discardCachedKnowledgePane() {
  if (!cachedKnowledgePane) return;
  const key = noteDraftKey(cachedKnowledgePane.taskId, "");
  milkdownEditors.get(key)?.instance?.destroy?.().catch?.(() => {});
  milkdownEditors.delete(key);
  cachedKnowledgePane.pane?.remove();
  cachedKnowledgePane = null;
}

function restoreCachedKnowledgePane(task) {
  if (!cachedKnowledgePane || !task || state.taskPane !== "notes") return;
  if (cachedKnowledgePane.taskId !== task.id) return;
  const replacement = document.querySelector(".task-knowledge-pane[data-task-id]");
  if (!replacement) return;
  replacement.replaceWith(cachedKnowledgePane.pane);
  cachedKnowledgePane = null;
}

function captureMountedMilkdownDrafts() {
  milkdownEditors.forEach((entry) => {
    const { host, instance, taskId, nodeId } = entry || {};
    if (!host || !taskId || !instance?.getMarkdown) return;
    try {
      updateNodeNoteDraft(taskId, nodeId, instance.getMarkdown(), host);
    } catch {
      // Ignore transient editor teardown states; the last onChange draft is still used.
    }
  });
}

function noteDraftKey(taskId, nodeId) {
  return `${taskId}:${nodeId || "task-notes"}`;
}

function updateNodeNoteDraft(taskId, nodeId, markdown, host = null) {
  nodeNoteDrafts.set(noteDraftKey(taskId, nodeId), { taskId, nodeId, markdown });
  if (host) updateMarkdownStatsForMarkdown(host, markdown);
  if (!nodeId) scheduleKnowledgeRecovery(taskId, markdown);
  scheduleNodeNoteSave(taskId, nodeId);
}

function scheduleNodeNoteSave(taskId, nodeId) {
  const key = noteDraftKey(taskId, nodeId);
  window.clearTimeout(nodeNoteSaveTimers.get(key));
  nodeNoteSaveTimers.set(
    key,
    window.setTimeout(() => {
      nodeNoteSaveTimers.delete(key);
      flushNodeNoteDraft(key, { persist: true });
    }, 500),
  );
}

function flushNodeNoteDraft(key, { persist = true } = {}) {
  const draft = nodeNoteDrafts.get(key);
  if (!draft) return false;
  window.clearTimeout(nodeNoteSaveTimers.get(key));
  nodeNoteSaveTimers.delete(key);

  const task = state.tasks.find((item) => item.id === draft.taskId);
  const node = task && draft.nodeId ? findNode(task.nodes, draft.nodeId) : null;
  nodeNoteDrafts.delete(key);
  if (!task) return false;
  const currentMarkdown = node ? node.note : task.notes;
  if (currentMarkdown === draft.markdown) return false;

  if (node) {
    node.note = draft.markdown;
    node.updatedAt = now();
  } else {
    task.notes = draft.markdown;
    task.knowledgeNote = knowledgeDocument.markDocumentEdited(task.knowledgeNote);
  }
  task.updatedAt = now();
  if (persist) save();
  return true;
}

function flushNodeNoteDrafts({ persist = true } = {}) {
  let changed = false;
  Array.from(nodeNoteDrafts.keys()).forEach((key) => {
    changed = flushNodeNoteDraft(key, { persist: false }) || changed;
  });
  if (changed && persist) save();
  return changed;
}

/**
 * Mount Milkdown editors on all .milkdown-editor-host elements.
 * Creates or reuses editor instances based on node content.
 */
function mountMilkdownEditors() {
  const hosts = Array.from(document.querySelectorAll(".milkdown-editor-host"));
  if (!hosts.length) return;
  if (!window.MilkdownTaskEditor?.create) {
    hosts.forEach((host) => mountFallbackMarkdownEditor(host));
    return;
  }

  hosts.forEach((host) => {
    const taskId = host.dataset.taskId;
    const nodeId = host.dataset.nodeId || "";
    const task = state.tasks.find((item) => item.id === taskId);
    const node = task && nodeId ? findNode(task.nodes, nodeId) : null;
    if (!task || (nodeId && !node)) return;
    const editorKey = noteDraftKey(taskId, nodeId);
    if (milkdownEditors.has(editorKey)) return;
    const rawMarkdown = nodeNoteDrafts.get(editorKey)?.markdown ?? (node ? node.note : task.notes) ?? "";
    const markdown = node ? rawMarkdown : hydrateKnowledgeEditorMarkdown(rawMarkdown);

    window.MilkdownTaskEditor.create({
      root: host,
      markdown,
      placeholder: node ? "记录处理过程" : "记录分析过程、知识点和可复用结论……",
      onChange: (markdown) => {
        updateNodeNoteDraft(taskId, nodeId, markdown, host);
      },
    })
      .then((instance) => {
        if (!document.body.contains(host)) {
          instance.destroy?.();
          return;
        }
        milkdownEditors.set(editorKey, { host, instance, taskId, nodeId });
        bindMilkdownSurfaceEvents(host);
        updateMarkdownStatsForMarkdown(host, node ? rawMarkdown : hydrateKnowledgeEditorMarkdown(rawMarkdown));
      })
      .catch((error) => {
        console.error("Milkdown failed to mount", error);
        mountFallbackMarkdownEditor(host);
      });
  });
}

function mountFallbackMarkdownEditor(host) {
  const taskId = host.dataset.taskId;
  const nodeId = host.dataset.nodeId || "";
  const task = state.tasks.find((item) => item.id === taskId);
  const node = task && nodeId ? findNode(task.nodes, nodeId) : null;
  if (!task || (nodeId && !node)) return;
  const rawMarkdown = nodeNoteDrafts.get(noteDraftKey(taskId, nodeId))?.markdown ?? (node ? node.note : task.notes) ?? "";
  const markdown = node ? rawMarkdown : hydrateKnowledgeEditorMarkdown(rawMarkdown);
  const placeholder = node ? "记录处理过程" : "记录分析过程、知识点和可复用结论……";
  host.innerHTML = `<textarea class="markdown-editor codex-editor milkdown-fallback" data-task-id="${taskId}" data-node-id="${nodeId}" placeholder="${placeholder}">${esc(markdown)}</textarea>${renderEditorImagePreview(markdown)}`;
  host.querySelectorAll(".markdown-editor").forEach((editor) => {
    editor.addEventListener("input", (event) => {
      updateNodeNoteDraft(taskId, nodeId, event.target.value, host);
      updateMarkdownEditorState(event.target);
    });
    editor.addEventListener("paste", handleMarkdownPaste);
    editor.addEventListener("drop", handleMarkdownDrop);
    editor.addEventListener("blur", (event) => {
      if (!event.relatedTarget && !appEditingPointerDown) captureAppSwitchEditingFocus(event.target);
    });
  });
}

function bindMilkdownSurfaceEvents(host) {
  const editor = host.querySelector(".ProseMirror");
  if (!editor || editor.dataset.enhanced === "true") return;
  editor.dataset.enhanced = "true";
  editor.addEventListener("blur", (event) => {
    if (!event.relatedTarget && !appEditingPointerDown) captureAppSwitchEditingFocus(event.target);
  });
  editor.addEventListener("paste", handleMarkdownPaste);
  editor.addEventListener("drop", handleMarkdownDrop);
  editor.addEventListener("dragover", (event) => {
    if (hasDraggedImage(event)) {
      event.preventDefault();
      host.closest(".markdown-panel")?.classList.add("dragging-image");
    }
  });
  editor.addEventListener("dragleave", () => {
    host.closest(".markdown-panel")?.classList.remove("dragging-image");
  });
  editor.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      handleMarkdownPasteShortcut(event);
    }
  });
  if (appSwitchFocusSnapshot?.restore) window.requestAnimationFrame(restoreAppSwitchEditingFocus);
}

function updateMarkdownStatsForMarkdown(host, markdown) {
  const stats = markdownStats(markdown);
  const statsElement = host.closest(".markdown-panel")?.querySelector("[data-markdown-stats]");
  if (statsElement) statsElement.textContent = `${stats.lines} 行 · ${stats.characters} 字`;
}

function focusNodeDetailEditor(nodeId) {
  if (!nodeId) return false;
  const scope = document.querySelector(`.node-detail.fullscreen-editor[data-node-id="${nodeId}"]`) || document.querySelector(`.node-detail[data-node-id="${nodeId}"]`);
  const editor = scope?.querySelector(".ProseMirror, .markdown-editor");
  if (!editor) return false;
  editor.focus({ preventScroll: true });
  if (editor.classList.contains("markdown-editor")) {
    const end = editor.value?.length ?? 0;
    editor.setSelectionRange?.(end, end);
  }
  return true;
}

function editorSnippet(kind) {
  switch (kind) {
    case "h2":
      return "## 标题\n";
    case "bullet":
      return "- 列表项 1\n- 列表项 2\n";
    case "ordered":
      return "1. 列表项 1\n2. 列表项 2\n";
    case "quote":
      return "> 引用内容\n";
    case "code":
      return "```text\n在这里输入代码\n```\n";
    case "table":
      return "| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n";
    case "image":
      return "![图片描述](https://)\n";
    default:
      return "";
  }
}

function insertIntoActiveEditor(text) {
  const active = document.activeElement;
  if (active?.classList?.contains("markdown-editor")) {
    const start = active.selectionStart ?? active.value.length;
    const end = active.selectionEnd ?? start;
    active.setRangeText(text, start, end, "end");
    active.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  const proseMirror = document.activeElement?.closest?.(".ProseMirror") || document.querySelector(".node-detail.fullscreen-editor .ProseMirror:focus, .node-detail.fullscreen-editor .ProseMirror");
  if (!proseMirror) return false;
  proseMirror.focus({ preventScroll: true });

  if (document.queryCommandSupported?.("insertText")) {
    const inserted = document.execCommand("insertText", false, text);
    if (inserted) return true;
  }

  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  proseMirror.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  return true;
}

function createMarkdownImageSnippet(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return "";
  const imageId = id("image");
  state.attachments = normalizeAttachments(state.attachments);
  state.attachments.images[imageId] = dataUrl;
  const alt = `粘贴图片 ${formatImageStamp(new Date())}`;
  save();
  return `\n![${alt}](task-image:${imageId})\n`;
}

function insertTextIntoEditor(editor, text) {
  if (!editor || !text) return false;
  if (editor.classList?.contains("markdown-editor")) {
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? start;
    editor.setRangeText(text, start, end, "end");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (editor.classList?.contains("ProseMirror")) {
    editor.focus({ preventScroll: true });
    return insertIntoActiveEditor(text);
  }
  return false;
}

function insertMarkdownImage(editor, dataUrl) {
  if (editor?.classList?.contains("ProseMirror")) {
    const host = editor.closest(".milkdown-editor-host");
    const taskId = host?.dataset.taskId || "";
    const nodeId = host?.dataset.nodeId || "";
    const instance = milkdownEditors.get(noteDraftKey(taskId, nodeId))?.instance;
    if (instance?.insertImage) {
      editor.focus({ preventScroll: true });
      return Boolean(
        instance.insertImage({
          src: dataUrl,
          alt: `粘贴图片 ${formatImageStamp(new Date())}`,
        }),
      );
    }
  }
  const markdown = createMarkdownImageSnippet(dataUrl);
  if (!markdown) return false;
  return insertTextIntoEditor(editor, markdown);
}

function activeRichEditor() {
  const active = document.activeElement;
  if (active?.classList?.contains("markdown-editor") || active?.classList?.contains("ProseMirror")) return active;
  return document.querySelector(".task-knowledge-pane .ProseMirror:focus, .task-knowledge-pane .ProseMirror, .task-knowledge-pane .markdown-editor:focus, .task-knowledge-pane .markdown-editor");
}

function focusKnowledgeEditor() {
  const editor = document.querySelector(".task-knowledge-pane .ProseMirror, .task-knowledge-pane .markdown-editor");
  if (!editor) return false;
  editor.focus({ preventScroll: true });
  if (editor.classList.contains("markdown-editor")) {
    const end = editor.value?.length ?? 0;
    editor.setSelectionRange?.(end, end);
  }
  return true;
}

async function pickEditorImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0] || null;
        input.remove();
        resolve(file);
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        input.remove();
        resolve(null);
      },
      { once: true },
    );
    input.click();
  });
}


// ============================================================
// ACTION HANDLER -- central action() dispatcher
// ============================================================
/**
 * Central action dispatcher. Called when [data-action] elements are clicked.
 * Modifies state (never render() directly), then calls render().
 * @param {object} data - DOM dataset, includes { action, taskId, nodeId, ... }
 * @param {Event|null} event - Original DOM event, used for position calculations
 */
async function action(data, event = null) {
  state.contextMenu = null;
  syncContextMenuRoot();
  if (data.action === "show-today-widget") {
    void desktopTodayWidget?.show();
    return;
  }
  if (data.action === "markdown-tool") {
    applyMarkdownTool(data.tool);
    return;
  }
  if (data.action === "insert-editor-snippet") {
    focusKnowledgeEditor();
    if (data.kind === "image") {
      void pickEditorImageFile().then((file) => {
        const editor = activeRichEditor();
        if (!file || !editor) return;
        insertImageFile(editor, file);
      });
      return;
    }
    insertIntoActiveEditor(editorSnippet(data.kind));
    return;
  }
  if (data.action === "save-knowledge" || data.action === "save-knowledge-as") {
    const result = await saveKnowledgeTask(data.taskId, { saveAs: data.action === "save-knowledge-as" });
    if (!result?.canceled) render();
    return;
  }
  if (data.action === "save-knowledge-overwrite") {
    const result = await saveKnowledgeTask(data.taskId, { allowExternalOverwrite: true });
    if (!result?.canceled) render();
    return;
  }
  if (data.action === "reload-knowledge") {
    const result = await reloadKnowledgeTask(data.taskId);
    if (!result?.canceled) render();
    return;
  }
  if (data.action === "relocate-knowledge") {
    const result = await relocateKnowledgeTask(data.taskId);
    if (!result?.canceled) render();
    return;
  }
  if (data.action === "retry-knowledge") {
    const result = await saveKnowledgeTask(data.taskId);
    if (!result?.canceled) render();
    return;
  }
  if (data.action === "remove-knowledge-binding") {
    const result = await removeKnowledgeBinding(data.taskId);
    if (!result?.canceled) render();
    return;
  }
  if (data.action === "close-knowledge-editor") {
    const result = await closeKnowledgeEditor(data.taskId);
    if (result?.success) render();
    return;
  }
  if (data.action === "keep-knowledge-draft") {
    const mode = state.knowledgeDraftPrompt?.mode;
    state.knowledgeDraftPrompt = null;
    if (mode === "close-editor") state.taskPane = "flow";
    render();
    return;
  }
  if (data.action === "delete-knowledge-draft") {
    const mode = state.knowledgeDraftPrompt?.mode;
    state.knowledgeDraftPrompt = null;
    if (mode === "close-editor") {
      await discardUnfiledKnowledgeDraft(data.taskId);
      state.taskPane = "flow";
    } else {
      await deleteTask(data.taskId, { skipDraftPrompt: true });
    }
    render();
    return;
  }
  if (data.action === "save-knowledge-before-delete") {
    const result = await saveKnowledgeTask(data.taskId);
    if (result?.success) {
      state.knowledgeDraftPrompt = null;
      await deleteTask(data.taskId, { skipDraftPrompt: true });
      render();
    } else if (!result?.canceled) {
      render();
    }
    return;
  }
  if (data.action === "save-knowledge-before-close") {
    const result = await saveKnowledgeTask(data.taskId);
    if (result?.success) {
      state.knowledgeDraftPrompt = null;
      state.taskPane = "flow";
      render();
    } else if (!result?.canceled) {
      render();
    }
    return;
  }
  if (data.action === "export-node-pdf") {
    captureMountedMilkdownDrafts();
    flushNodeNoteDraft(noteDraftKey(data.taskId, data.nodeId), { persist: true });
    exportNodePdf(data.taskId, data.nodeId);
    return;
  }
  if (data.action === "share-task") {
    void shareTask(data.taskId);
    return;
  }
  if (data.action === "scroll-sheets") {
    scrollSheets(Number(data.direction || 1));
    return;
  }
  if (data.action === "set-markdown-mode") state.markdownMode = data.mode === "preview" ? "preview" : "edit";
  if (data.action === "switch-task-pane") {
    state.taskPane = ["flow", "notes", "history"].includes(data.pane) ? data.pane : "flow";
    if (state.taskPane !== "flow") {
      state.selectedNodeId = "";
      state.recordDraft = "";
      state.nodeDetailFullscreen = false;
      state.nodeDetailPosition = null;
    }
  }
  if (data.action === "toggle-settings") {
    state.settingsOpen = !state.settingsOpen;
    if (state.settingsOpen) {
      state.calendarOpen = false;
      state.reviewOpen = false;
      state.feedbackOpen = false;
    }
  }
  if (data.action === "toggle-theme") state.theme = state.theme === "dark" ? "light" : "dark";
  if (data.action === "close-settings") state.settingsOpen = false;
  if (data.action === "open-feedback") {
    state.settingsOpen = false;
    state.calendarOpen = false;
    state.reviewOpen = false;
    state.feedbackOpen = true;
    state.feedbackResult = null;
    state.feedbackMessage = "";
  }
  if (data.action === "close-feedback") closeBugReport();
  if (data.action === "toggle-calendar") {
    state.calendarOpen = !state.calendarOpen;
    if (state.calendarOpen) {
      ensureCalendarState();
      state.settingsOpen = false;
      state.reviewOpen = false;
      state.feedbackOpen = false;
    }
  }
  if (data.action === "close-calendar") state.calendarOpen = false;
  if (data.action === "open-review-from-calendar") {
    state.calendarOpen = false;
    state.reviewOpen = true;
  }
  if (data.action === "set-deadline-filter") {
    state.taskDeadlineFilter = Object.hasOwn(taskDeadlineFilterLabels, data.value) ? data.value : "all";
    state.taskDateFilter = "";
    state.selectedNodeId = "";
    state.calendarOpen = false;
  }
  if (data.action === "select-calendar-date") {
    const selected = normalizeTaskDateFilter(data.date);
    if (selected) {
      state.calendarSelectedDate = selected;
      state.calendarMonth = `${selected.slice(0, 7)}-01`;
    }
  }
  if (data.action === "apply-calendar-date") {
    state.taskDateFilter = normalizeTaskDateFilter(state.calendarSelectedDate);
    state.taskDeadlineFilter = "all";
    state.selectedNodeId = "";
    state.calendarOpen = false;
  }
  if (data.action === "shift-calendar-month") {
    const month = calendarMonthDate();
    month.setMonth(month.getMonth() + Number(data.direction || 0));
    state.calendarMonth = localDateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  }
  if (data.action === "calendar-today") {
    state.calendarSelectedDate = localDateKey(new Date());
    state.calendarMonth = `${state.calendarSelectedDate.slice(0, 7)}-01`;
  }
  if (data.action === "open-calendar-task") openTaskFromGlobalList(data.taskId);
  if (data.action === "toggle-review") {
    state.reviewOpen = !state.reviewOpen;
    if (state.reviewOpen) {
      state.settingsOpen = false;
      state.calendarOpen = false;
    }
  }
  if (data.action === "close-review") state.reviewOpen = false;
  if (data.action === "set-review-preset") {
    state.reviewPreset = Object.hasOwn(reviewPresetLabels, data.preset) ? data.preset : "week";
    if (state.reviewPreset === "custom") ensureReviewCustomDates();
  }
  if (data.action === "open-review-task") openTaskFromGlobalList(data.taskId);
  if (data.action === "reload-app") window.location.reload();
  if (data.action === "select-group") selectGroup(data.groupId);
  if (data.action === "add-group") addGroup();
  if (data.action === "rename-group") {
    startRenameGroup(data.groupId);
    render();
    return;
  }
  if (data.action === "delete-group" && !(await deleteGroup(data.groupId))) return;
  if (data.action === "select-focus") {
    openTaskFromGlobalList(data.taskId, "");
  }
  if (data.action === "select-task") {
    activateRepositoryTask(data.taskId);
  }
  if (data.action === "add-task") addBlankTask();
  if (data.action === "delete-task" && !(await deleteTask(data.taskId))) return;
  if (data.action === "select-node") {
    state.selectedNodeId = data.nodeId;
    const task = state.tasks.find((item) => item.id === data.taskId);
    const node = task ? findNode(task.nodes, data.nodeId) : null;
    state.recordDraft = node?.note || "";
    state.nodeDetailFullscreen = false;
    state.nodeDetailPosition = event ? { x: event.clientX + 12, y: event.clientY - 24 } : null;
  }
  if (data.action === "toggle-task-done") {
    activateRepositoryTask(data.taskId);
    toggleTaskDone(data.taskId);
  }
  if (data.action === "toggle-task-tag") toggleTaskTag(data.taskId, data.tag);
  if (data.action === "add-node") addNode(data.taskId, data.parentId || null);
  if (data.action === "add-root-node") addNode(data.taskId, null);
  if (data.action === "add-child-node") addNode(data.taskId, data.nodeId);
  if (data.action === "add-sibling-node") addSiblingNode(data.taskId, data.nodeId);
  if (data.action === "toggle-node-done") toggleNodeDone(data.taskId, data.nodeId);
  if (data.action === "toggle-node-collapse") toggleNodeCollapse(data.taskId, data.nodeId);
  if (data.action === "toggle-all-nodes") toggleAllNodes(data.taskId);
  if (data.action === "mark-node-status") markNodeStatus(data.taskId, data.nodeId, data.status);
  if (data.action === "delete-node" && !(await deleteNode(data.taskId, data.nodeId))) return;
  if (data.action === "toggle-node-detail-fullscreen") state.nodeDetailFullscreen = !state.nodeDetailFullscreen;
  if (data.action === "close-node-detail") {
    state.selectedNodeId = "";
    state.recordDraft = "";
    state.nodeDetailFullscreen = false;
    state.nodeDetailPosition = null;
  }
  if (data.action === "save-node-detail") {
    saveSelectedNodeRecord();
  }
  render();
}

/**
 * Share a task: copy its Markdown representation to clipboard.
 * @param {string} taskId - Task ID to share
 */
async function shareTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  captureMountedMilkdownDrafts();
  flushNodeNoteDrafts({ persist: true });
  const markdown = taskMarkdown(task);

  try {
    if (desktopExport?.taskDocument) {
      await desktopExport.taskDocument({
        taskTitle: task.title || "未命名任务",
        markdown,
        html: renderMarkdown(markdown),
      });
      return;
    }
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeDownloadName(task.title || "未命名任务")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export task document.", error);
    alert("导出失败，请稍后重试。");
  }
}

function taskMarkdown(task) {
  const summary = taskSummary(task);
  const tags = Object.entries(normalizeTaskTags(task.tags))
    .filter(([, active]) => active)
    .map(([tag]) => taskTagLabels[tag]);
  const groupTitle = state.taskGroups.find((group) => group.id === task.groupId)?.title || "默认";
  const lines = [
    `# ${task.title || "未命名任务"}`,
    "",
    `- 分组：${groupTitle}`,
    `- 优先级：${priorityLabels[task.priority] || "中"}`,
    `- 状态：${task.status === "done" ? "已完成" : "处理中"}`,
    `- 节点：${summary.done}/${summary.total || 0}`,
    ...(task.deadlineAt ? [`- 截止时间：${formatMinuteStamp(task.deadlineAt)}`] : []),
    `- 创建时间：${formatShort(task.createdAt)}`,
    `- 更新时间：${formatShort(task.updatedAt)}`,
    ...(tags.length ? [`- 标记：${tags.join("、")}`] : []),
    "",
    "## 背景",
    task.description.trim() || "暂无",
    "",
    "## 当前判断",
    task.hypothesis.trim() || "暂无",
    "",
    "## 结论",
    task.conclusion.trim() || "暂无",
    "",
    "## 知识笔记",
    (task.notes || "").trim() || "暂无",
    "",
    "## 处理流",
    "",
  ];
  const nodeLines = task.nodes.length ? sort(task.nodes).flatMap((node) => nodeMarkdownLines(node, 0)) : ["暂无节点"];
  return [...lines, ...nodeLines].join("\n");
}

function nodeMarkdownLines(node, depth) {
  const prefix = `${"  ".repeat(depth)}-`;
  const status = node.status === "done" ? "已完成" : nodeStatusText(node.status);
  const lines = [`${prefix} ${node.title || "未命名节点"}（${status}）`];
  if ((node.note || "").trim()) {
    lines.push("", `${"  ".repeat(depth + 1)}记录：`, indentMarkdown(node.note.trim(), depth + 1), "");
  }
  sort(node.children).forEach((child) => lines.push(...nodeMarkdownLines(child, depth + 1)));
  return lines;
}

function indentMarkdown(value, depth) {
  const prefix = "  ".repeat(depth);
  return String(value || "")
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function safeDownloadName(value) {
  return String(value || "task").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "task";
}

/**
 * Handle inline edits from [data-edit-key] elements.
 * Updates a specific state field and triggers save.
 * @param {object} data - DOM dataset with { editKey, taskId, nodeId }
 * @param {string} value - New value from the input element
 */
function edit(data, value) {
  const task = state.tasks.find((item) => item.id === data.taskId);
  if (!task) return;

  if (!data.nodeId) {
    if (data.editKey === "groupId") {
      task.groupId = normalizeActiveGroupId(value, state.taskGroups);
      state.activeGroupId = task.groupId;
    } else {
      task[data.editKey] = value;
    }
    if (data.editKey === "title") {
      task.knowledgeNote = knowledgeDocument.updateDocumentTitle(task.knowledgeNote, value);
    }
    if (data.editKey === "title") syncTaskTitleInputs(task.id, value);
    if (data.editKey === "hypothesis") task.hypothesisUpdatedAt = now();
    if (data.editKey === "conclusion" && value.trim()) clearConclusionNotice(task.id);
    task.updatedAt = now();
    save();
    return;
  }

  const node = findNode(task.nodes, data.nodeId);
  if (!node) return;
  node[data.editKey] = value;
  node.updatedAt = now();
  task.updatedAt = now();
  save();

  if (data.editKey === "title") {
    const title = document.querySelector(`.flow-title-input[data-node-id="${data.nodeId}"]`);
    if (title) title.value = value || "";
  }
}

function syncTaskTitleInputs(taskId, value) {
  document.querySelectorAll('[data-edit-key="title"][data-task-id]').forEach((element) => {
    if (element === document.activeElement || element.dataset.taskId !== taskId || element.dataset.nodeId) return;
    element.value = value || "";
  });
}

function openTaskFromGlobalList(taskId, nodeId = "") {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  state.activeGroupId = task.groupId || defaultTaskGroup.id;
  state.activeTaskId = task.id;
  state.selectedNodeId = nodeId;
  state.recordDraft = nodeId ? findNode(task.nodes, nodeId)?.note || "" : "";
  state.nodeDetailFullscreen = false;
  state.nodeDetailPosition = null;
  state.taskFilter = "all";
  state.taskDateFilter = "";
  state.taskDeadlineFilter = "all";
  state.priorityFilter = "all";
  state.query = "";
  state.reviewOpen = false;
  state.calendarOpen = false;
}

function createTaskFromBlank(title) {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return;

  createTask(normalizedTitle);
}

function addBlankTask() {
  createTask("", false);
}


// ============================================================
// TASK & NODE CRUD (create, delete, reorder, etc.)
// ============================================================
/**
 * Create a new task with the given title.
 * @param {string} title - Task title
 * @param {boolean} shouldRender - Whether to re-render after creation
 * @returns {object} The newly created task
 */
function createTask(title, shouldRender = true) {
  const taskId = id("task");
  const createdAt = now();
  const task = {
    id: taskId,
    order: state.tasks.length + 1,
    groupId: normalizeActiveGroupId(state.activeGroupId, state.taskGroups),
    title,
    description: "",
    status: "active",
    priority: state.newTaskPriority,
    tags: normalizeTaskTags({}),
    recurrence: normalizeTaskRecurrence({}),
    hypothesis: "",
    hypothesisUpdatedAt: "",
    conclusion: "",
    deadlineAt: "",
    notes: "",
    knowledgeNote: knowledgeDocument.createKnowledgeNoteMetadata({
      noteId: id("note"),
      taskId,
      title,
      createdAt,
      updatedAt: createdAt,
    }),
    createdAt,
    updatedAt: createdAt,
    nodes: [],
  };
  state.tasks.push(task);
  state.activeTaskId = task.id;
  state.selectedNodeId = "";
  state.taskFilter = "all";
  state.priorityFilter = "all";
  state.query = "";
  state.focusTaskTitleId = task.id;
  save();
  if (shouldRender) render();
}

/**
 * Select a task group by ID, switching the active view.
 * @param {string} groupId - Target group ID
 */
function selectGroup(groupId) {
  state.activeGroupId = normalizeActiveGroupId(groupId, state.taskGroups);
  state.activeTaskId = "";
  state.selectedNodeId = "";
  state.nodeDetailFullscreen = false;
  state.nodeDetailPosition = null;
  state.contextMenu = null;
  state.query = "";
}

function addGroup() {
  const group = {
    id: id("group"),
    title: `分组 ${state.taskGroups.length + 1}`,
    order: state.taskGroups.length + 1,
  };
  state.taskGroups.push(group);
  state.activeGroupId = group.id;
  state.editingGroupId = group.id;
  state.focusGroupTitleId = group.id;
  state.activeTaskId = "";
  state.selectedNodeId = "";
  state.query = "";
}

function startRenameGroup(groupId) {
  if (!state.taskGroups.some((group) => group.id === groupId)) return;
  state.editingGroupId = groupId;
  state.focusGroupTitleId = groupId;
}

function renameGroup(groupId, value, commit = false) {
  const group = state.taskGroups.find((item) => item.id === groupId);
  if (!group) return;
  const title = String(value || "").trim();
  if (title) group.title = title;
  if (commit) state.editingGroupId = "";
  save();
}

/**
 * Delete a task group and move its tasks into the protected default group.
 * @param {string} groupId - Group ID to delete
 */
async function deleteGroup(groupId) {
  const group = state.taskGroups.find((item) => item.id === groupId);
  if (!group || group.id === defaultTaskGroup.id) return false;
  if (!(await confirmDestructiveAction(`确定删除分组「${group.title}」吗？该分组内任务将移动到默认分组。`))) return false;

  state.tasks.forEach((task) => {
    if ((task.groupId || defaultTaskGroup.id) === groupId) {
      task.groupId = defaultTaskGroup.id;
      task.updatedAt = now();
    }
  });
  state.taskGroups = state.taskGroups.filter((item) => item.id !== groupId);
  state.taskGroups = normalizeTaskGroups(state.taskGroups, state.tasks);
  if (state.activeGroupId === groupId) {
    state.activeGroupId = defaultTaskGroup.id;
    state.activeTaskId = tasksInActiveGroup()[0]?.id || "";
    state.selectedNodeId = "";
  }
  state.editingGroupId = "";
  state.focusGroupTitleId = "";
  save();
  return true;
}

/**
 * Reorder groups via drag-and-drop.
 * @param {string} sourceId - Dragged group ID
 * @param {string} targetId - Drop target group ID
 */
function reorderGroups(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const groups = sort(state.taskGroups);
  const sourceIndex = groups.findIndex((group) => group.id === sourceId);
  const targetIndex = groups.findIndex((group) => group.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = groups.splice(sourceIndex, 1);
  groups.splice(targetIndex, 0, source);
  reorder(groups);
  state.taskGroups = groups;
  save();
}

/**
 * Reorder tasks via drag-and-drop within a group.
 * @param {string} sourceId - Dragged task ID
 * @param {string} targetId - Drop target task ID
 * @param {"before"|"after"} placement - Insert above or below the target task
 */
function reorderTasks(sourceId, targetId, placement = "before") {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const visibleTasks = filteredTasks();
  const sourceIndex = visibleTasks.findIndex((task) => task.id === sourceId);
  if (sourceIndex < 0 || !visibleTasks.some((task) => task.id === targetId)) return;

  const orderedVisible = [...visibleTasks];
  const [source] = orderedVisible.splice(sourceIndex, 1);
  const adjustedTargetIndex = orderedVisible.findIndex((task) => task.id === targetId);
  if (adjustedTargetIndex < 0) return;
  const insertionIndex = placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  orderedVisible.splice(insertionIndex, 0, source);

  const visibleIds = new Set(visibleTasks.map((task) => task.id));
  const orderedScope = sort(taskListScopeTasks());
  const visibleQueue = [...orderedVisible];
  const nextScope = orderedScope.map((task) => (visibleIds.has(task.id) ? visibleQueue.shift() : task));
  reorder(nextScope);
  state.activeTaskId = sourceId;
  save();
}

function scrollSheets(direction) {
  const tabs = document.querySelector("[data-sheet-tabs]");
  if (!tabs) return;
  tabs.scrollBy({ left: direction * Math.max(120, tabs.clientWidth * 0.72), behavior: "smooth" });
}

function activeMarkdownEditor() {
  const active = document.activeElement;
  if (active?.classList?.contains("markdown-editor")) return active;
  return document.querySelector(".markdown-editor");
}

function applyMarkdownTool(tool) {
  const editor = activeMarkdownEditor();
  if (!editor) return;
  editor.focus();
  const start = editor.selectionStart || 0;
  const end = editor.selectionEnd || 0;
  const selected = editor.value.slice(start, end);
  const fallback = selected || "文本";
  const lineStart = editor.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const beforeLine = editor.value.slice(lineStart, start);
  let next = "";
  let cursorStart = start;
  let cursorEnd = end;

  if (tool === "heading") {
    next = `${beforeLine ? "\n" : ""}## ${fallback}`;
    cursorStart = start + next.length;
    cursorEnd = cursorStart;
  } else if (tool === "bold") {
    next = `**${fallback}**`;
    cursorStart = start + 2;
    cursorEnd = cursorStart + fallback.length;
  } else if (tool === "italic") {
    next = `*${fallback}*`;
    cursorStart = start + 1;
    cursorEnd = cursorStart + fallback.length;
  } else if (tool === "quote") {
    next = selected
      ? selected
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      : `${beforeLine ? "\n" : ""}> 引用`;
    cursorStart = start + next.length;
    cursorEnd = cursorStart;
  } else if (tool === "code") {
    next = selected.includes("\n") ? `\n\`\`\`\n${selected}\n\`\`\`\n` : `\`${fallback}\``;
    cursorStart = start + (selected.includes("\n") ? next.length : 1);
    cursorEnd = selected.includes("\n") ? cursorStart : cursorStart + fallback.length;
  } else if (tool === "list") {
    next = selected
      ? selected
          .split("\n")
          .map((line) => `- ${line}`)
          .join("\n")
      : `${beforeLine ? "\n" : ""}- 列表项`;
    cursorStart = start + next.length;
    cursorEnd = cursorStart;
  } else if (tool === "ordered") {
    next = selected
      ? selected
          .split("\n")
          .map((line, index) => `${index + 1}. ${line}`)
          .join("\n")
      : `${beforeLine ? "\n" : ""}1. 列表项`;
    cursorStart = start + next.length;
    cursorEnd = cursorStart;
  } else if (tool === "todo") {
    next = selected
      ? selected
          .split("\n")
          .map((line) => `- [ ] ${line}`)
          .join("\n")
      : `${beforeLine ? "\n" : ""}- [ ] 待办事项`;
    cursorStart = start + next.length;
    cursorEnd = cursorStart;
  } else if (tool === "link") {
    next = `[${fallback}](https://example.com)`;
    cursorStart = start + fallback.length + 3;
    cursorEnd = cursorStart + "https://example.com".length;
  } else if (tool === "image") {
    next = `![图片](https://example.com/image.png)`;
    cursorStart = start + 6;
    cursorEnd = cursorStart + "https://example.com/image.png".length;
  } else if (tool === "divider") {
    next = `${beforeLine ? "\n" : ""}---\n`;
    cursorStart = start + next.length;
    cursorEnd = cursorStart;
  }

  if (!next) return;
  replaceEditorSelection(editor, next, cursorStart, cursorEnd);
}

function replaceEditorSelection(editor, value, cursorStart, cursorEnd = cursorStart) {
  const start = editor.selectionStart || 0;
  const end = editor.selectionEnd || 0;
  editor.value = `${editor.value.slice(0, start)}${value}${editor.value.slice(end)}`;
  editor.selectionStart = cursorStart;
  editor.selectionEnd = cursorEnd;
  if (editor.classList.contains("markdown-editor")) {
    updateNodeNoteDraft(editor.dataset.taskId, editor.dataset.nodeId, editor.value, editor.closest(".milkdown-editor-host"));
  } else {
    edit(editor.dataset, editor.value);
  }
  if (editor.classList.contains("markdown-editor")) updateMarkdownEditorState(editor);
}

async function handleMarkdownPaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const files = Array.from(event.clipboardData?.files || []);
  const types = Array.from(event.clipboardData?.types || []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  const file = files.find((item) => item.type.startsWith("image/")) || imageItem?.getAsFile();
  if (!file) {
    const text = event.clipboardData?.getData("text/plain") || "";
    const mayContainImage = types.some((type) => /image|file|tiff|png/i.test(type));
    if (text && !mayContainImage) return;
    event.preventDefault();
    const dataUrl = await window.personalTaskTrack?.clipboard?.readImageDataUrl?.();
    if (!dataUrl) {
      if (text) insertTextIntoEditor(event.currentTarget, text);
      return;
    }
    insertMarkdownImage(event.currentTarget, dataUrl);
    return;
  }
  event.preventDefault();
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    insertMarkdownImage(event.currentTarget, reader.result);
  });
  reader.readAsDataURL(file);
}

function handleMarkdownDrop(event) {
  const editor = event.currentTarget;
  editor.closest(".markdown-panel")?.classList.remove("dragging-image");
  const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  files.forEach((file) => insertImageFile(editor, file));
}

function handleMarkdownPasteShortcut(event) {
  const editor = event.currentTarget;
  const dataUrl = window.personalTaskTrack?.clipboard?.readImageDataUrlSync?.();
  if (!dataUrl) return;
  event.preventDefault();
  insertMarkdownImage(editor, dataUrl);
}

function insertEditorText(editor, text) {
  const start = editor.selectionStart || 0;
  replaceEditorSelection(editor, text, start + text.length);
}

function insertImageFile(editor, file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => insertMarkdownImage(editor, reader.result));
  reader.readAsDataURL(file);
}

function hasDraggedImage(event) {
  const items = Array.from(event.dataTransfer?.items || []);
  const files = Array.from(event.dataTransfer?.files || []);
  return items.some((item) => item.type.startsWith("image/")) || files.some((file) => file.type.startsWith("image/"));
}

function updateMarkdownStats(editor) {
  const stats = markdownStats(editor.value);
  const statsElement = editor.closest(".markdown-panel")?.querySelector("[data-markdown-stats]");
  if (statsElement) statsElement.textContent = `${stats.lines} 行 · ${stats.characters} 字`;
}

function updateMarkdownEditorState(editor) {
  updateMarkdownStats(editor);
  const strip = editor.closest(".markdown-panel")?.querySelector(".editor-image-strip");
  if (!strip) return;
  const images = markdownImages(editor.value);
  strip.classList.toggle("empty", images.length === 0);
  strip.innerHTML = images
    .map((image) => `<figure><img src="${image.src}" alt="${escAttr(image.alt || "图片")}" /><figcaption>${esc(image.alt || "图片")}</figcaption></figure>`)
    .join("");
}

/**
 * Export a node detail view as PDF via Electron IPC.
 * Captures current Milkdown draft content before export.
 * @param {string} taskId - Task ID
 * @param {string} nodeId - Node ID to export
 */
async function exportNodePdf(taskId, nodeId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const node = task ? findNode(task.nodes, nodeId) : null;
  if (!task || !node) return;
  if (!desktopExport?.nodeDetailPdf) {
    alert("当前环境不支持 PDF 导出。请在桌面应用中使用。");
    return;
  }

  try {
    await desktopExport.nodeDetailPdf({
      taskTitle: task.title || "未命名任务",
      nodeTitle: node.title || "未命名节点",
      status: nodeStatusText(node.status),
      updatedAt: formatShort(node.updatedAt || task.updatedAt || now()),
      html: renderMarkdown(node.note),
    });
  } catch (error) {
    console.error("Failed to export node detail PDF.", error);
    alert("PDF 导出失败，请稍后重试。");
  }
}

function toggleTaskTag(taskId, tag) {
  if (!Object.hasOwn(taskTagLabels, tag)) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.tags = normalizeTaskTags(task.tags);
  task.tags[tag] = !task.tags[tag];
  task.updatedAt = now();
}

function updateTaskRecurrence(taskId, field, value) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !["frequency", "weekday", "time"].includes(field)) return;
  const previous = normalizeTaskRecurrence(task.recurrence);
  const next = { ...previous };
  if (field === "frequency") {
    next.frequency = recurrenceFrequencies.has(value) ? value : "none";
    if (next.frequency === "weekly" && previous.weekdays.length === 0) next.weekdays = [new Date().getDay()];
    if (next.frequency === "none") next.lastCompletedOccurrence = "";
  }
  if (field === "weekday") {
    const weekday = Number(value);
    if (!recurrenceWeekdayOrder.includes(weekday)) return;
    next.weekdays = previous.weekdays.includes(weekday)
      ? previous.weekdays.filter((value) => value !== weekday)
      : recurrenceWeekdayOrder.filter((value) => previous.weekdays.includes(value) || value === weekday);
  }
  if (field === "time") next.time = value;
  task.recurrence = normalizeTaskRecurrence(next);
  task.updatedAt = now();
  save();
}

/**
 * Delete a task and all its nodes.
 * @param {string} taskId - Task ID to delete
 */
async function deleteTask(taskId, { skipDraftPrompt = false } = {}) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return false;
  if (!skipDraftPrompt && task.knowledgeNote?.documentState === "DRAFT" && String(task.notes || "").trim()) {
    state.knowledgeDraftPrompt = { taskId };
    render();
    return false;
  }
  if (!task || !(await confirmDestructiveAction(`确定删除任务「${task.title || "未命名任务"}」及其所有节点？`))) return false;
  const index = state.tasks.findIndex((item) => item.id === taskId);
  if (desktopKnowledgeFile?.unwatch) {
    void desktopKnowledgeFile.unwatch({ noteId: task.knowledgeNote?.noteId || task.id });
  }
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  reorder(state.tasks);
  if (state.activeTaskId === taskId) {
    const groupTasks = tasksInActiveGroup();
    state.activeTaskId = groupTasks[Math.max(0, index - 1)]?.id || groupTasks[0]?.id || "";
    state.selectedNodeId = "";
  }
  save();
  return true;
}

/**
 * Toggle task done/undone status, updating all nodes accordingly.
 * @param {string} taskId - Task ID to toggle
 */
function toggleTaskDone(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (task.status !== "done" && !task.conclusion.trim()) {
    showConclusionNotice(taskId);
    return;
  }
  const wasDone = task.status === "done";
  const occurrence = recurringOccurrenceKey(task);
  task.status = wasDone ? "active" : "done";
  task.recurrence = normalizeTaskRecurrence(task.recurrence);
  if (wasDone && occurrence && task.recurrence.lastCompletedOccurrence === occurrence) {
    task.recurrence.lastCompletedOccurrence = "";
  } else if (!wasDone && occurrence) {
    task.recurrence.lastCompletedOccurrence = occurrence;
  }
  if (task.status === "done") {
    task.resolvedAt = now();
    state.conclusionPromptTaskId = "";
  }
  task.updatedAt = now();
}

function showConclusionNotice(taskId) {
  state.conclusionPromptTaskId = taskId;
  window.clearTimeout(conclusionNoticeTimer);
  conclusionNoticeTimer = window.setTimeout(() => clearConclusionNotice(taskId), 4200);
}

function clearConclusionNotice(taskId) {
  if (state.conclusionPromptTaskId !== taskId) return;
  state.conclusionPromptTaskId = "";
  window.clearTimeout(conclusionNoticeTimer);
  document.querySelector(".completion-notice")?.remove();
  document.querySelector(".task-brief label.needs-attention")?.classList.remove("needs-attention");
}

/**
 * Add a new node (step or subtask) to a task.
 * @param {string} taskId - Parent task ID
 * @param {string|null} parentId - null for root step, node ID for child
 */
function addNode(taskId, parentId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  let created = null;
  if (!parentId) {
    created = makeNode(taskId, null, task.nodes.length + 1);
    task.nodes.push(created);
  } else {
    const parent = findNode(task.nodes, parentId);
    if (!parent) return;
    created = makeNode(taskId, parentId, parent.children.length + 1);
    parent.children.push(created);
  }
  task.updatedAt = now();
  state.selectedNodeId = "";
  state.nodeDetailFullscreen = false;
  state.nodeDetailPosition = null;
  state.focusNodeTitleId = created.id;
}

function addSiblingNode(taskId, nodeId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const found = findNodeCollection(task.nodes, nodeId);
  if (!found) return;

  const created = makeNode(taskId, found.node.parentId || null, found.index + 2);
  found.items.splice(found.index + 1, 0, created);
  reorder(found.items);
  task.updatedAt = now();
  state.selectedNodeId = "";
  state.nodeDetailFullscreen = false;
  state.nodeDetailPosition = null;
  state.focusNodeTitleId = created.id;
}


// ============================================================
// NODE UTILITY FUNCTIONS (find, flatten, sort)
// ============================================================
function toggleNodeDone(taskId, nodeId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const node = task ? findNode(task.nodes, nodeId) : null;
  if (!task || !node) return;
  node.status = node.status === "done" ? "todo" : "done";
  node.updatedAt = now();
  task.updatedAt = now();
}

function toggleNodeCollapse(taskId, nodeId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const node = task ? findNode(task.nodes, nodeId) : null;
  if (!task || !node || !node.children.length) return;
  node.collapsed = !node.collapsed;
  task.updatedAt = now();
}

function toggleAllNodes(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const nodes = flatten(task.nodes).filter((node) => node.children.length);
  const shouldCollapse = !nodes.every((node) => node.collapsed);
  nodes.forEach((node) => {
    node.collapsed = shouldCollapse;
  });
  task.updatedAt = now();
}

function markNodeStatus(taskId, nodeId, status) {
  const task = state.tasks.find((item) => item.id === taskId);
  const node = task ? findNode(task.nodes, nodeId) : null;
  if (!task || !node || !nodeStatusValues.has(status)) return;
  node.status = status;
  node.updatedAt = now();
  task.updatedAt = now();
}

/**
 * Delete a node and its descendants from a task's node tree.
 * @param {string} taskId - Task containing the node
 * @param {string} nodeId - Node ID to delete
 */
async function deleteNode(taskId, nodeId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !(await confirmDestructiveAction("确定删除这个节点及其子节点？"))) return false;
  const deletedNode = findNode(task.nodes, nodeId);
  const deletedIds = new Set(deletedNode ? flatten([deletedNode]).map((node) => node.id) : []);
  task.nodes = removeNode(task.nodes, nodeId);
  task.updatedAt = now();
  if (deletedIds.has(state.selectedNodeId)) {
    state.selectedNodeId = "";
    state.recordDraft = "";
    state.nodeDetailFullscreen = false;
    state.nodeDetailPosition = null;
  }
  return true;
}

function activeTask() {
  const scopedTasks = taskListScopeTasks();
  const selectedTask = scopedTasks.find((task) => task.id === state.activeTaskId);
  if (selectedTask) return selectedTask;
  const visibleTasks = filteredTasks({ includeQuery: false });
  return visibleTasks[0] || null;
}

/**
 * Recursively find a node by ID in a node tree.
 * @param {Array} nodes - Node array to search
 * @param {string} nodeId - Target node ID
 * @returns {object|null} Found node or null
 */
function findNode(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found) return found;
  }
  return null;
}

function findNodeCollection(nodes, nodeId) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === nodeId) return { items: nodes, index, node };
    const found = findNodeCollection(node.children, nodeId);
    if (found) return found;
  }
  return null;
}

function removeNode(nodes, nodeId) {
  return nodes.filter((node) => node.id !== nodeId).map((node) => ({ ...node, children: removeNode(node.children, nodeId) }));
}

/**
 * Move a node subtree to a sibling position, into another node, or to root.
 * @param {string} taskId - Task containing both source and target
 * @param {string} sourceId - Root of the subtree being moved
 * @param {string} targetId - Target node, empty for root append
 * @param {"before"|"inside"|"after"|"root"} placement - Destination relative to target
 * @returns {boolean} Whether a valid move was applied
 */
function moveFlowNode(taskId, sourceId, targetId = "", placement = "inside") {
  const task = state.tasks.find((item) => item.id === taskId);
  const allowedPlacements = new Set(["before", "inside", "after", "root"]);
  if (!task || !sourceId || !allowedPlacements.has(placement)) return false;

  const sourceCollection = findNodeCollection(task.nodes, sourceId);
  const sourceNode = sourceCollection?.node;
  if (!sourceCollection || !sourceNode) return false;
  if (placement !== "root" && (!targetId || !findNode(task.nodes, targetId))) return false;
  if (targetId && (targetId === sourceId || findNode(sourceNode.children, targetId))) return false;

  sourceCollection.items.sort((a, b) => a.order - b.order);
  const sourceIndex = sourceCollection.items.findIndex((node) => node.id === sourceId);
  if (sourceIndex < 0) return false;
  sourceCollection.items.splice(sourceIndex, 1);
  reorder(sourceCollection.items);

  let targetItems = task.nodes;
  let targetParentId = null;
  let insertionIndex = targetItems.length;
  let insideTarget = null;

  if (placement === "inside") {
    insideTarget = findNode(task.nodes, targetId);
    if (!insideTarget) return false;
    targetItems = insideTarget.children;
    targetParentId = insideTarget.id;
    targetItems.sort((a, b) => a.order - b.order);
    insertionIndex = targetItems.length;
  } else if (placement === "before" || placement === "after") {
    const targetCollection = findNodeCollection(task.nodes, targetId);
    if (!targetCollection) return false;
    targetItems = targetCollection.items;
    targetItems.sort((a, b) => a.order - b.order);
    const targetIndex = targetItems.findIndex((node) => node.id === targetId);
    if (targetIndex < 0) return false;
    targetParentId = targetCollection.node.parentId || null;
    insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  } else {
    targetItems.sort((a, b) => a.order - b.order);
    insertionIndex = targetItems.length;
  }

  const changedAt = now();
  sourceNode.parentId = targetParentId;
  sourceNode.type = targetParentId ? "subtask" : "step";
  sourceNode.updatedAt = changedAt;
  targetItems.splice(insertionIndex, 0, sourceNode);
  reorder(targetItems);
  if (insideTarget) insideTarget.collapsed = false;
  task.updatedAt = changedAt;
  return true;
}

/**
 * Flatten a nested node tree into a single array (pre-order traversal).
 * @param {Array} nodes - Nested node array
 * @returns {Array} Flat node array
 */
function flatten(nodes) {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function sort(nodes) {
  return [...nodes].sort((a, b) => a.order - b.order);
}

function reorder(nodes) {
  nodes.forEach((node, index) => {
    node.order = index + 1;
  });
}

function nodeStatusText(status) {
  if (status === "done") return "已完成";
  if (status === "blocked") return "卡住";
  if (status === "later") return "稍后";
  return "未完成";
}


// ============================================================
// MARKDOWN RENDERING (plain text -> HTML)
// ============================================================
/**
 * Render Markdown text to HTML.
 * Supports: headings, paragraphs, lists (ul/ol), code blocks,
 * blockquotes, task lists, tables, horizontal rules, inline formatting.
 * @param {string} value - Raw Markdown text
 * @returns {string} HTML string
 */
function renderMarkdown(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let inCode = false;
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType) return;
    html.push(
      `<${listType}>${listItems
        .map((item) => `<li>${typeof item === "object" ? item.html : renderInlineMarkdown(item)}</li>`)
        .join("")}</${listType}>`,
    );
    listType = "";
    listItems = [];
  }

  function flushCode() {
    html.push(`<pre><code>${esc(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.includes("|") && lines[index + 1] && isMarkdownTableDivider(lines[index + 1])) {
      flushParagraph();
      flushList();
      const headers = splitMarkdownTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(splitMarkdownTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      html.push(renderMarkdownTable(headers, rows));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push("<hr />");
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const taskItem = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskItem) {
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push({
        html: `<span class="md-task"><input type="checkbox" disabled ${taskItem[1].toLowerCase() === "x" ? "checked" : ""} /><span>${renderInlineMarkdown(taskItem[2])}</span></span>`,
      });
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ordered || unordered) {
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((ordered || unordered)[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();

  return html.length ? html.join("") : `<p class="markdown-empty">还没有注释。</p>`;
}

/**
 * Render inline Markdown formatting (bold, italic, code, links, images, strikethrough).
 * @param {string} value - Inline text with Markdown syntax
 * @returns {string} HTML string
 */
function renderInlineMarkdown(value) {
  const codeSpans = [];
  const richTokens = [];
  let output = esc(value).replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE_SPAN_${codeSpans.length}@@`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });

  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safeUrl = resolveMarkdownImageUrl(url);
    if (!safeUrl) return esc(`![${alt}](${url})`);
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<img src="${safeUrl}" alt="${escAttr(alt)}" loading="lazy" />`);
    return token;
  });

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return esc(`[${label}](${url})`);
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<a href="${safeUrl}" target="_blank" rel="noreferrer">${label}</a>`);
    return token;
  });

  output = output.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, (_, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return `&lt;${url}&gt;`;
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`);
    return token;
  });

  output = output.replace(/(^|[\s(])((https?:\/\/|mailto:)[^\s<)]+)/g, (match, prefix, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return match;
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`);
    return `${prefix}${token}`;
  });

  output = output
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  codeSpans.forEach((code, index) => {
    output = output.replace(`@@CODE_SPAN_${index}@@`, code);
  });
  richTokens.forEach((html, index) => {
    output = output.replace(`@@RICH_${index}@@`, html);
  });

  return output;
}

function safeMarkdownUrl(value) {
  const cleaned = cleanMarkdownUrl(value);
  const lower = cleaned.toLowerCase();
  if (!cleaned || /^(javascript|vbscript):/.test(lower)) return "";
  if (lower.startsWith("data:") && !lower.startsWith("data:image/")) return "";
  return escAttr(cleaned);
}

function resolveMarkdownImageUrl(value) {
  const cleaned = cleanMarkdownUrl(value);
  if (cleaned.startsWith("task-image:")) {
    const imageId = cleaned.slice("task-image:".length);
    const dataUrl = state.attachments?.images?.[imageId];
    return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? escAttr(dataUrl) : "";
  }
  if (cleaned.startsWith("./attachments/") || cleaned.startsWith("attachments/")) {
    const relativePath = cleaned.startsWith("./") ? cleaned : `./${cleaned}`;
    const dataUrl = state.knowledgeAssets?.[relativePath];
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) return escAttr(dataUrl);
  }
  return safeMarkdownUrl(cleaned);
}

function cleanMarkdownUrl(value) {
  let cleaned = String(value || "").trim();
  const angled = cleaned.match(/^&lt;(.+)&gt;$/);
  if (angled) cleaned = angled[1];
  const titled = cleaned.search(/\s+(&quot;|&#039;|")/);
  if (titled > -1) cleaned = cleaned.slice(0, titled);
  return cleaned
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function isMarkdownTableDivider(line) {
  const trimmed = line.trim();
  return trimmed.includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

function splitMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdownTable(headers, rows) {
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${renderInlineMarkdown(header)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${headers.map((_, index) => `<td>${renderInlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}


// ============================================================
// FORMAT HELPERS (date, text escaping)
// ============================================================
function formatShort(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayWidgetSnapshot() {
  const rootFontSize = Number.parseFloat(window.getComputedStyle?.(document.documentElement)?.fontSize);
  return {
    date: localDateKey(new Date()),
    appearance: {
      theme: state.theme,
      zhFont: state.zhFont,
      enFont: state.enFont,
      fontSize: Number.isFinite(rootFontSize) ? rootFontSize : 16.5,
    },
    items: todayFocusItems().map(({ task, kind, nextText }) => ({
      taskId: task.id,
      title: task.title || "未命名任务",
      nextText,
      kind,
    })),
  };
}

function publishTodayWidgetSnapshot() {
  desktopTodayWidget?.publish(todayWidgetSnapshot());
}

function deadlineReminderSnapshot() {
  return state.tasks
    .filter((task) => safeDate(task.deadlineAt))
    .map((task) => ({
      id: task.id,
      title: task.title || "未命名任务",
      status: task.status,
      priority: task.priority,
      deadlineAt: task.deadlineAt,
    }));
}

function publishDeadlineReminderSnapshot() {
  if (!desktopDeadlineReminders?.sync) return;
  const snapshot = deadlineReminderSnapshot();
  const signature = JSON.stringify(snapshot);
  if (signature === deadlineReminderSignature) return;
  deadlineReminderSignature = signature;
  void desktopDeadlineReminders.sync(snapshot).catch((error) => {
    deadlineReminderSignature = "";
    console.error("Failed to synchronize task deadline reminders.", error);
  });
}

function initializeDeadlineReminderBridge() {
  if (!desktopDeadlineReminders) return;
  unsubscribeDeadlineReminderTask?.();
  unsubscribeDeadlineReminderCalendar?.();
  unsubscribeDeadlineReminderTask = desktopDeadlineReminders.onOpenTask?.(({ taskId } = {}) => {
    if (!taskId) return;
    openTaskFromGlobalList(taskId);
    render();
  });
  unsubscribeDeadlineReminderCalendar = desktopDeadlineReminders.onOpenCalendar?.(() => {
    ensureCalendarState();
    state.calendarOpen = true;
    state.settingsOpen = false;
    state.reviewOpen = false;
    render();
  });
}

function syncTodayWidgetRestoreButton() {
  const current = document.querySelector(".restore-widget");
  if (!desktopTodayWidget || todayWidgetWindowState.visible) {
    current?.remove();
    return;
  }
  if (current) return;
  const root = document.querySelector("#root");
  root?.insertAdjacentHTML("beforeend", renderTodayWidgetRestore());
  root?.querySelector(".restore-widget")?.addEventListener("click", () => void desktopTodayWidget.show());
}

async function initializeTodayWidgetBridge() {
  if (!desktopTodayWidget) return;
  unsubscribeTodayWidgetState?.();
  unsubscribeTodayWidgetOpenTask?.();
  unsubscribeTodayWidgetCompletion?.();
  unsubscribeTodayWidgetState = desktopTodayWidget.onState((nextState) => {
    todayWidgetWindowState = nextState && typeof nextState === "object" ? nextState : { visible: false };
    syncTodayWidgetRestoreButton();
  });
  unsubscribeTodayWidgetOpenTask = desktopTodayWidget.onOpenTask(({ taskId } = {}) => {
    if (!taskId) return;
    openTaskFromGlobalList(taskId);
    render();
  });
  unsubscribeTodayWidgetCompletion = desktopTodayWidget.onCompleteRequest(({ requestId, taskId } = {}) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) {
      desktopTodayWidget.respondCompletion({ requestId, success: false, code: "TASK_NOT_FOUND" });
      return;
    }
    openTaskFromGlobalList(taskId);
    toggleTaskDone(taskId);
    const success = task.status === "done";
    render();
    desktopTodayWidget.respondCompletion({
      requestId,
      success,
      code: success ? "COMPLETED" : "CONCLUSION_REQUIRED",
    });
  });
  try {
    todayWidgetWindowState = await desktopTodayWidget.getState();
  } catch {
    todayWidgetWindowState = { visible: false };
  }
}

function taskDateFilterLabel(value) {
  const normalized = normalizeTaskDateFilter(value);
  return normalized ? `${normalized.slice(5, 7)}/${normalized.slice(8, 10)}` : "";
}

function formatMinuteStamp(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatImageStamp(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(value)
    .replace(/[\/:\s]/g, "-");
}

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escAttr(value) {
  return esc(value).replaceAll("\n", " ");
}


// ============================================================
// APP BOOTSTRAP
// ============================================================
/**
 * Application entry point. Loads persisted data and starts the first render.
 * Called immediately at the end of the script.
 */
async function bootstrap() {
  const [data, recovery] = await Promise.all([
    loadAppData(),
    loadKnowledgeRecovery(),
    initializeAppUpdates(),
    initializeTodayWidgetBridge(),
    initializeDeadlineReminderBridge(),
  ]);
  state.tasks = data.tasks;
  state.taskGroups = data.taskGroups;
  state.activeGroupId = data.activeGroupId;
  state.flowWidths = data.flowWidths;
  state.sidebarWidth = data.sidebarWidth;
  state.detailHeight = data.detailHeight;
  state.attachments = data.attachments;
  state.theme = data.theme;
  state.zhFont = data.zhFont;
  state.enFont = data.enFont;
  state.taskFilter = data.taskFilter;
  state.priorityFilter = data.priorityFilter;
  state.newTaskPriority = data.newTaskPriority;
  state.knowledgeRecovery = recovery;
  state.installationId = normalizeInstallationId(data.installationId);
  await restoreKnowledgeRecoveryDrafts();
  state.activeTaskId = tasksInActiveGroup()[0]?.id || "";
  syncRecurringTasks(new Date());
  render();
  await startKnowledgeFileWatchers();
  startRecurringSchedule();
}

window.addEventListener("blur", () => {
  if (!appEditingPointerDown) captureAppSwitchEditingFocus(document.activeElement);
  if (appSwitchFocusSnapshot) appSwitchFocusSnapshot.restore = true;
  storeMarkdownSelection(activeMarkdownEditor(), true);
});

window.addEventListener("focus", () => {
  if (restoreAppSwitchEditingFocus()) return;
  window.requestAnimationFrame(() => {
    if (!restoreAppSwitchEditingFocus() && state.restoreMarkdownFocus) restoreMarkdownSelection();
  });
});

window.addEventListener(
  "pointerdown",
  (event) => {
    if (appSwitchFocusSnapshot?.restore) {
      const interactive = event.target.closest?.("button, input, textarea, select, [contenteditable], a");
      const restoredTarget = resolveAppSwitchEditingElement(appSwitchFocusSnapshot);
      if (!interactive || interactive === restoredTarget || interactive.closest?.(".ProseMirror") === restoredTarget) return;
    }
    appEditingPointerDown = true;
    appSwitchFocusSnapshot = null;
    window.setTimeout(() => {
      appEditingPointerDown = false;
    }, 0);
  },
  true,
);

if (desktopKnowledgeFile?.onChange) {
  unsubscribeKnowledgeFileChanges = desktopKnowledgeFile.onChange((event) => {
    void handleKnowledgeFileChange(event);
  });
}

if (desktopKnowledgeRecovery?.onFlushAndQuit) {
  desktopKnowledgeRecovery.onFlushAndQuit(async () => {
    try {
      await flushPendingKnowledgeRecoveries();
    } catch (error) {
      console.error("Failed to flush knowledge note recovery before shutdown.", error);
    } finally {
      desktopKnowledgeRecovery.completeFlushAndQuit?.();
    }
  });
}

if (desktopUpdates?.onPrepareInstall) {
  desktopUpdates.onPrepareInstall(async () => {
    const ready = await prepareForUpdateInstall();
    desktopUpdates.completeInstallPreparation?.(ready);
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (state.contextMenu) {
      event.preventDefault();
      state.contextMenu = null;
      syncContextMenuRoot();
      return;
    }
    if (state.selectedNodeId || state.settingsOpen || state.calendarOpen || state.reviewOpen || state.feedbackOpen || recurrencePopoverTaskId) {
      event.preventDefault();
      exitNodeDetail();
      state.settingsOpen = false;
      state.calendarOpen = false;
      state.reviewOpen = false;
      recurrencePopoverTaskId = "";
      closeBugReport();
      render();
      return;
    }
  }
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    const task = activeTask();
    if (task) {
      void saveKnowledgeTask(task.id, { saveAs: event.shiftKey }).then((result) => {
        if (!result?.canceled) render();
      });
    }
    return;
  }
  if (event.key.toLowerCase() !== "k") return;
  const target = event.target;
  if (target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
  event.preventDefault();
  state.focusSearch = true;
  state.searchCursor = state.query.length;
  render();
});

bootstrap();
