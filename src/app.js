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
const DATA_VERSION = 1;
const desktopStorage = window.personalTaskTrack?.storage;
const desktopExport = window.personalTaskTrack?.export;
const APP_VERSION = window.personalTaskTrack?.appVersion || "";

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

const priorityFilterLabels = {
  all: "全部",
  high: "高",
  medium: "中",
  low: "低",
};

const repositoryPriorityFilterLabels = {
  all: "所有优先级",
  high: "高优先",
  medium: "中优先",
  low: "低优先",
};

const repositoryPriorityLabels = {
  high: "高优先",
  medium: "中优先",
  low: "低优先",
};

const themeLabels = {
  light: "浅色",
  dark: "深色",
};

const zhFontLabels = {
  system: "系统中文",
  yahei: "微软雅黑",
  pingfang: "苹方",
  songti: "宋体",
  simsun: "中易宋体",
  fangsong: "仿宋",
  heiti: "黑体",
  kaiti: "楷体",
};

const enFontLabels = {
  inter: "Inter",
  system: "System UI",
  segoe: "Segoe UI",
  arial: "Arial",
  helvetica: "Helvetica",
  times: "Times New Roman",
  georgia: "Georgia",
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
const taskTagLabels = {
  today: "Today",
  later: "稍后",
  blocked: "卡住",
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
  priorityFilter: "all",
  newTaskPriority: "medium",
  markdownMode: "edit",
  theme: "light",
  zhFont: "system",
  enFont: "inter",
  settingsOpen: false,
  reviewOpen: false,

// ============================================================
// RUNTIME VARIABLES
// ============================================================
  reviewPreset: "week",
  reviewDateField: "updated",
  reviewStartDate: "",
  reviewEndDate: "",
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
  conclusionPromptTaskId: "",
  contextMenu: null,
  nodeDetailPosition: null,
};

let saveTimer = 0;
let pendingPayload = null;
let saveInFlight = false;
let taskDragState = null;
let suppressTaskClickUntil = 0;
const milkdownEditors = new Map();
const nodeNoteDrafts = new Map();
const nodeNoteSaveTimers = new Map();
let cachedKnowledgePane = null;


// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function now() {
  return new Date().toISOString();
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
  return tasks.map((task) => ({
    ...task,
    groupId: task.groupId || defaultTaskGroup.id,
    tags: normalizeTaskTags(task.tags),
    notes: typeof task.notes === "string" ? task.notes : "",
    nodes: normalizeNodes(task.nodes),
    hypothesisUpdatedAt: task.hypothesisUpdatedAt || (task.hypothesis ? task.updatedAt || task.createdAt || now() : ""),
  }));
}

function normalizeNodes(nodes) {
  return Array.isArray(nodes)
    ? nodes.map((node) => ({
        ...node,
        collapsed: Boolean(node.collapsed),
        children: normalizeNodes(node.children),
      }))
    : [];
}

function normalizeTaskTags(tags) {
  const raw = tags && typeof tags === "object" ? tags : {};
  return {
    today: Boolean(raw.today),
    later: Boolean(raw.later),
    blocked: Boolean(raw.blocked),
  };
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
      return { tasks, taskGroups, activeGroupId, flowWidths, sidebarWidth, detailHeight, attachments, theme, zhFont, enFont, taskFilter, priorityFilter, newTaskPriority };
    } catch (error) {
      console.error("Failed to read local task data.", error);
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
  if (!desktopStorage?.write || saveInFlight || !pendingPayload) return;
  const payload = pendingPayload;
  pendingPayload = null;
  saveInFlight = true;
  try {
    await desktopStorage.write(payload);
  } catch (error) {
    console.error("Failed to save local task data.", error);
  } finally {
    saveInFlight = false;
    if (pendingPayload) flushSave();
  }
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
    .map(([key]) => `--flow-${key}-width:${normalizeFlowWidth(key, state.flowWidths[key])}px`)
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
  document.querySelector("#root").innerHTML = `
    <main class="ops-app app" style="--sidebar-width:${normalizeSidebarWidth(state.sidebarWidth)}px">
      ${renderSidebar()}
      <section class="workspace">
        ${task ? renderTaskPage(task) : renderEmptyPage()}
      </section>
      <div id="context-menu-root">${renderContextMenu()}</div>
      ${state.settingsOpen ? renderSettingsPanel() : ""}
      ${state.reviewOpen ? renderReviewPanel() : ""}
    </main>
  `;
  restoreCachedKnowledgePane(task);
  bind();
  resizeTaskBriefTextareas();
  focusPendingElement();
  window.requestAnimationFrame(() => mountMilkdownEditors());
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
          <small>个人任务工作台</small>
        </div>
        <span>v${esc(APP_VERSION || "dev")}</span>
      </div>

      ${renderTodayFocus(focusItems)}

      <div class="task-list" data-context="task-list">
        <div class="task-list-head section-label">
          <span>任务仓库</span>
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
        <div class="task-repository-rows">
          ${filteredTasks()
            .map((task) => renderTaskItem(task))
            .join("")}
        </div>
      </div>
      <section class="group-panel" aria-label="任务分组">
        <div class="group-panel-head">
          <strong>任务分组</strong>
          <span>横向滚动 · 双击重命名</span>
        </div>
        ${renderGroupTabs()}
      </section>
      <div class="sidebar-foot task-footer">
        <button class="settings-trigger settings-button ${state.settingsOpen ? "active" : ""}" type="button" data-action="toggle-settings" title="设置">⚙</button>
        <button
          class="theme-toggle ${state.theme === "dark" ? "active" : ""}"
          type="button"
          data-action="toggle-theme"
          title="${state.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}"
          aria-label="${state.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}"
          aria-pressed="${state.theme === "dark"}"
        >${state.theme === "dark" ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"></path></svg>`}</button>
        <span class="autosave-status">自动保存已开启</span>
        <button class="review-shortcut" type="button" data-action="toggle-review">任务回顾</button>
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
        <span><b>${items.length}</b> 项待推进</span>
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
  const { task, node, kind, badge, nextText } = item;
  const selected = task.id === state.activeTaskId && (!node?.id || node.id === state.selectedNodeId);
  const pillClass = kind === "high" || kind === "blocked" ? "hot" : "";
  return `
    <article class="focus-item focus-row ${kind} ${selected ? "selected" : ""}" data-action="select-focus" data-task-id="${task.id}" data-node-id="${node?.id || ""}">
      <span class="focus-rail rail-mark"></span>
      <span class="row-title"><strong>${esc(task.title || "未命名任务")}</strong><span>下一步：${esc(nextText)}</span></span>
      <span class="pill ${pillClass}">${badge}</span>
    </article>
  `;
}

function renderGroupTabs() {
  return `
    <div class="sheet-bar group-nav" aria-label="任务分组">
      <button class="sheet-nav scroll-button" type="button" data-action="scroll-sheets" data-direction="-1" title="查看前面的分组">‹</button>
      <div class="sheet-tabs task-tabs" data-sheet-tabs>
        ${sort(state.taskGroups)
          .map(
            (group) => `
              <span class="sheet-tab-wrap" draggable="true" data-group-id="${group.id}">
                ${
                  state.editingGroupId === group.id
                    ? `<input class="sheet-edit" data-group-title="${group.id}" value="${escAttr(group.title)}" />`
                    : `<button class="sheet-tab ${group.id === state.activeGroupId ? "active" : ""}" type="button" data-action="select-group" data-group-id="${group.id}" title="${escAttr(group.title)}">${esc(group.title)}</button>`
                }
              </span>
            `,
          )
          .join("")}
      </div>
      <button class="sheet-nav scroll-button" type="button" data-action="scroll-sheets" data-direction="1" title="查看后面的分组">›</button>
      <button class="sheet-add add-group-button" type="button" data-action="add-group" title="新增分组">+</button>
    </div>
  `;
}

function renderTaskItem(task) {
  const subtitle = taskSubtitle(task);
  return `
    <div class="task-item task-row ${task.id === state.activeTaskId ? "selected active" : ""} ${task.status === "done" ? "done" : ""}" data-context="task" data-task-id="${task.id}" data-task-drag-target="${task.id}">
      <span class="task-drag-handle" draggable="true" data-task-drag-handle data-task-id="${task.id}" title="拖拽排序" aria-label="拖拽排序"></span>
      <button class="task-check rail-mark ${task.status === "done" ? "is-checked" : ""}" type="button" title="${task.status === "done" ? "标记为未完成" : "标记为完成"}" aria-label="${task.status === "done" ? "标记为未完成" : "标记为完成"}" aria-pressed="${task.status === "done"}" data-action="toggle-task-done" data-task-id="${task.id}"></button>
      <span class="task-title-wrap row-title">
        <input class="task-title" placeholder="任务标题" data-edit-key="title" data-task-id="${task.id}" value="${escAttr(task.title)}" />
        <span class="task-next-line"><b>下一步</b><em>${esc(subtitle)}</em></span>
      </span>
      <span class="task-row-meta">
        <span class="task-priority-control ${task.priority}">${selectHtml("priority", task.priority, repositoryPriorityLabels, task.id)}</span>
        <time datetime="${escAttr(task.updatedAt)}">${formatRepositoryStamp(task.updatedAt)}</time>
      </span>
    </div>
  `;
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
          <div class="page-kicker kicker">工作台</div>
          <input class="page-title" data-edit-key="title" data-task-id="${task.id}" value="${escAttr(task.title)}" />
          <div class="page-properties meta-line">
            ${renderTaskActiveTagPills(task)}
            <span class="pill priority ${task.priority} ${task.priority === "high" ? "hot" : task.priority === "low" ? "good" : ""}">${priorityLabels[task.priority]}优先</span>
            <span class="pill status ${task.status === "done" ? "resolved good" : "attention good"}">${task.status === "done" ? "已完成" : "处理中"}</span>
            <span class="pill">${summary.done}/${summary.total || 0} 节点</span>
            <span class="pill">更新 ${formatShort(task.updatedAt)}</span>
            <label class="property-select">分组 ${selectHtml("groupId", task.groupId, taskGroupOptions(), task.id)}</label>
          </div>
        </div>
        <div class="actions">
          <button class="share-trigger icon-button" type="button" data-action="share-task" data-task-id="${task.id}" title="分享任务" aria-label="分享任务">
            分享
          </button>
        </div>
      </header>

      ${needsConclusion ? renderConclusionPrompt() : ""}

      <section class="task-brief brief-strip" aria-label="任务简报">
        ${renderBriefField("背景 / 目标", textareaHtml("description", task.description, task.id), "", false, "background")}
        ${renderBriefField("当前判断 / 进展", textareaHtml("hypothesis", task.hypothesis, task.id), task.hypothesisUpdatedAt, false, "hypothesis")}
        ${renderBriefField("结果 / 总结", textareaHtml("conclusion", task.conclusion, task.id), "", needsConclusion, "conclusion")}
      </section>

      ${renderTaskPaneTabs(task)}

      <section class="task-workbench lower">
        ${state.taskPane === "flow" ? `<section class="flow-section flow" data-context="flow-root" data-task-id="${task.id}">
          <div class="section-heading flow-head">
            <div>
              <h2>处理流</h2>
              <span>主轴表示顺序，缩进表示父子关系</span>
            </div>
            <span>${summary.total ? (summary.open ? `${summary.open} 个未完成` : "所有节点已完成") : ""}</span>
          </div>
          ${
            topNodes.length
              ? `<div class="flow-list flow-table" style="${flowWidthStyle()};--flow-visible-row-count:${visibleFlowRowCount(topNodes)}" data-context="flow-root" data-task-id="${task.id}">${renderFlowHeader()}${topNodes.map((node, index) => renderFlowNode(task.id, node, 0, index, "")).join("")}</div>`
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
  return `
    <section class="task-knowledge-pane" data-task-id="${task.id}">
      <div class="section-heading flow-head">
        <div><h2>知识笔记</h2><span>沉淀与当前任务相关的知识、分析和可复用结论</span></div>
      </div>
      <section class="markdown-panel milkdown-panel task-knowledge-editor-panel" data-task-id="${task.id}" data-editor-focus-target="task">
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
      <div class="section-heading flow-head">
        <div><h2>历史处理</h2><span>按更新时间查看任务节点的推进轨迹</span></div>
      </div>
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

function renderConclusionPrompt() {
  return `
    <div class="conclusion-prompt">
      <strong>需要补充结论</strong>
      <span>这个任务还没有结论，补充后再标记为已完成。</span>
    </div>
  `;
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
    .map(([tag]) => `<span class="pill task-tag-pill">${taskTagLabels[tag]}</span>`)
    .join("");
}

function renderBriefField(label, control, timestamp = "", attention = false, variant = "") {
  return `
    <label class="brief-field brief-cell ${variant} ${attention ? "needs-attention" : ""}">
      <span class="brief-label"><b>${label}</b></span>
      ${control}
      ${timestamp ? `<small class="brief-stamp">${formatShort(timestamp)}</small>` : ""}
    </label>
  `;
}

function renderFlowNode(taskId, node, depth, rootIndex = 0, parentTitle = "") {
  const children = sort(node.children);
  const isSelected = state.selectedNodeId === node.id;
  const indent = Math.min(depth, 4) * 16;
  const branch = depth === 0 ? "main-flow" : "sub-flow";
  const noteSummary = nodeNoteSummary(node.note);
  const relationship = depth === 0 ? `主流程第 ${rootIndex + 1} 步` : `属于 ${parentTitle || "上级节点"}`;
  return `
    <article class="flow-item depth-${Math.min(depth, 6)}">
      <div class="flow-row flow-line ${branch} ${branch === "sub-flow" ? "sub" : ""} ${node.status} ${isSelected ? "selected" : ""}" style="--indent:${indent}px" data-context="node" data-task-id="${taskId}" data-node-id="${node.id}">
        <span class="flow-sequence-cell">
          ${depth === 0 ? `<span class="sequence-index">${String(rootIndex + 1).padStart(2, "0")}</span>` : `<span class="sequence-child-mark" aria-hidden="true"></span>`}
          <input class="flow-check dot" type="checkbox" title="完成" data-action="toggle-node-done" data-task-id="${taskId}" data-node-id="${node.id}" ${node.status === "done" ? "checked" : ""} />
        </span>
        <span class="flow-title-cell flow-title process-cell">
          <span class="flow-indent"></span>
          <span class="flow-branch-mark"></span>
          <span class="flow-title-line">
            ${children.length ? `<button class="node-collapse-toggle" type="button" data-action="toggle-node-collapse" data-task-id="${taskId}" data-node-id="${node.id}" title="${node.collapsed ? "展开子节点" : "收起子节点"}">${node.collapsed ? "+" : "−"}</button>` : `<span class="node-collapse-spacer"></span>`}
            ${nodeTitleInputHtml(node, taskId)}
          </span>
          <span class="flow-relation">${esc(relationship)}</span>
        </span>
        <button class="flow-note note-link process-cell ${isSelected ? "record-trigger" : ""}" type="button" data-action="select-node" data-task-id="${taskId}" data-node-id="${node.id}" title="打开节点记录">
          <strong>${esc(noteSummary.title)}</strong>
          <span>${esc(noteSummary.detail)}</span>
        </button>
        <span class="flow-status status-${node.status}">${nodeStatusText(node.status)}</span>
        <span class="flow-updated note-link">${formatShort(node.updatedAt)}</span>
      </div>
      ${children.length && !node.collapsed ? children.map((child) => renderFlowNode(taskId, child, depth + 1, rootIndex, node.title)).join("") : ""}
    </article>
  `;
}

function renderFlowHeader() {
  return `
    <div class="flow-row flow-line flow-header header">
      <span>顺序</span>
      ${renderFlowHeadCell("title", "处理")}
      ${renderFlowHeadCell("note", "记录")}
      ${renderFlowHeadCell("", "状态")}
      ${renderFlowHeadCell("", "更新时间")}
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

function renderFlowHeadCell(key, label) {
  return `
    <span class="flow-head-cell">
      <span>${label}</span>
      ${key ? `<span class="col-resizer" data-resize-col="${key}"></span>` : ""}
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
      ${hasTasks ? "" : "<p>双击左侧任务仓库的空白区域，即可创建新的处理流。</p>"}
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
function filteredTasks() {
  const q = state.query.trim().toLowerCase();
  return taskListScopeTasks()
    .filter((task) => {
      const tags = normalizeTaskTags(task.tags);
      const hasBlocked = flatten(task.nodes).some((node) => node.status === "blocked");
      const hasLater = flatten(task.nodes).some((node) => node.status === "later");
      if (state.taskFilter === "today" && !tags.today) return false;
      if (state.taskFilter === "active" && task.status === "done") return false;
      if (state.taskFilter === "done" && task.status !== "done") return false;
      if (state.taskFilter === "blocked" && !tags.blocked && !hasBlocked) return false;
      if (state.taskFilter === "later" && !tags.later && !hasLater) return false;
      if (state.priorityFilter !== "all" && task.priority !== state.priorityFilter) return false;
      if (q) {
        const taskText = `${task.title} ${task.description} ${task.hypothesis} ${task.conclusion}`.toLowerCase();
        const nodeHit = flatten(task.nodes).some((node) => `${node.title} ${node.note}`.toLowerCase().includes(q));
        return taskText.includes(q) || nodeHit;
      }
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

function taskListScopeTasks() {
  return state.taskFilter === "today" ? state.tasks : tasksInActiveGroup();
}

function taskListStatsTasks() {
  if (state.taskFilter !== "today") return tasksInActiveGroup();
  return state.tasks.filter((task) => normalizeTaskTags(task.tags).today);
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
    .filter((task) => normalizeTaskTags(task.tags).today)
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
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.task.order - b.task.order)
    .slice(0, 3);
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
  return `<input class="${className}" data-edit-key="${key}" data-task-id="${taskId}" data-node-id="${nodeId}" value="${escAttr(value)}" />`;
}

function nodeTitleInputHtml(node, taskId) {
  return `<input class="flow-title-input" placeholder="填写节点标题" data-edit-key="title" data-task-id="${taskId}" data-node-id="${node.id}" value="${escAttr(node.title)}" />`;
}

function textareaHtml(key, value, taskId, nodeId = "") {
  return `<textarea data-edit-key="${key}" data-task-id="${taskId}" data-node-id="${nodeId}">${esc(value)}</textarea>`;
}

function selectHtml(key, value, options, taskId, nodeId = "") {
  return `
    <select data-edit-key="${key}" data-task-id="${taskId}" data-node-id="${nodeId}">
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
            <section class="settings-group">
              <div class="settings-group-head">
                <h3>时间回顾</h3>
                <p>按更新时间、创建日期或解决日期筛选任务。</p>
              </div>
              <div class="settings-stack">
                <button class="settings-inline-action" type="button" data-action="toggle-review">打开任务回顾</button>
              </div>
            </section>
            <div class="settings-preview">
              <span>Preview</span>
              <strong class="settings-preview-zh">任务流中文字体预览</strong>
              <strong class="settings-preview-en">Task flow English 123</strong>
              <p>背景、当前判断、结论保持轻量，处理流保持主视线。</p>
            </div>
            <div class="settings-version">
              <span>当前版本</span>
              <strong>${APP_VERSION ? `v${esc(APP_VERSION)}` : "开发预览"}</strong>
            </div>
          </div>
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
    <article class="review-item" data-action="open-review-task" data-task-id="${task.id}">
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

function startTaskPointerDrag(event) {
  beginTaskPointerDrag(event, event.currentTarget.closest(".task-item[data-task-id]"), true);
}

function startTaskLongPress(event) {
  if (event.target.closest(".task-check, input, textarea, select, button, [contenteditable], [data-task-drag-handle]")) return;
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
  document.querySelectorAll(".task-item[data-task-id]").forEach((element) => {
    element.addEventListener("pointerdown", startTaskLongPress);
    element.addEventListener(
      "click",
      (event) => {
        if (Date.now() < suppressTaskClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.target.closest(".task-check, select, button, [data-task-drag-handle]")) return;
        if (state.activeTaskId === element.dataset.taskId) return;
        state.activeTaskId = element.dataset.taskId;
        state.selectedNodeId = "";
        state.recordDraft = "";
        state.nodeDetailFullscreen = false;
        state.nodeDetailPosition = null;
        window.requestAnimationFrame(() => render());
      },
      true,
    );
  });

  document.querySelectorAll("[data-task-drag-handle]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("pointerdown", startTaskPointerDrag);
    element.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", element.dataset.taskId);
      element.closest(".task-item")?.classList.add("dragging");
    });
    element.addEventListener("dragend", () => {
      element.closest(".task-item")?.classList.remove("dragging");
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
      window.setTimeout(render, 0);
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

  const search = document.querySelector("#search");
  if (search) {
    search.addEventListener("click", (event) => event.stopPropagation());
    search.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.focusSearch = true;
      state.searchCursor = event.target.selectionStart || state.query.length;
      render();
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

  document.querySelectorAll("[data-resize-col]").forEach((handle) => {
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", (event) => startColumnResize(event, handle.dataset.resizeCol));
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

      if (state.selectedNodeId && !keepNodeDetail && exitNodeDetail()) needsRender = true;

      if (needsRender) render();
    });
  }
}

function resizeTaskBriefTextareas() {
  document.querySelectorAll(".task-brief textarea").forEach((element) => resizeTaskBriefTextarea(element));
}

function resizeTaskBriefTextarea(element) {
  element.style.height = "0px";
  element.style.height = `${Math.min(180, Math.max(34, element.scrollHeight))}px`;
}

function applySetting(key, value) {
  if (key === "theme") state.theme = normalizeTheme(value);
  if (key === "zh-font") state.zhFont = normalizeZhFont(value);
  if (key === "en-font") state.enFont = normalizeEnFont(value);
  if (key === "task-filter") state.taskFilter = normalizeTaskFilter(value);
  if (key === "priority-filter") state.priorityFilter = normalizePriorityFilter(value);
  if (key === "new-task-priority") state.newTaskPriority = normalizePriority(value);
}

function startColumnResize(event, column) {
  event.preventDefault();
  event.stopPropagation();
  if (!flowWidthLimits[column]) return;

  const startX = event.clientX;
  const startWidth = normalizeFlowWidth(column, state.flowWidths[column]);
  const flowList = event.target.closest(".flow-list");
  document.body.classList.add("resizing-column");

  function move(moveEvent) {
    const nextWidth = normalizeFlowWidth(column, startWidth + moveEvent.clientX - startX);
    state.flowWidths[column] = nextWidth;
    if (flowList) flowList.style.setProperty(`--flow-${column}-width`, `${nextWidth}px`);
  }

  function end() {
    document.body.classList.remove("resizing-column");
    saveFlowWidths();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
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
    const markdown = nodeNoteDrafts.get(editorKey)?.markdown ?? (node ? node.note : task.notes) ?? "";

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
        updateMarkdownStatsForMarkdown(host, nodeNoteDrafts.get(editorKey)?.markdown ?? (node ? node.note : task.notes) ?? "");
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
  const markdown = nodeNoteDrafts.get(noteDraftKey(taskId, nodeId))?.markdown ?? (node ? node.note : task.notes) ?? "";
  const placeholder = node ? "记录处理过程" : "记录分析过程、知识点和可复用结论……";
  host.innerHTML = `<textarea class="markdown-editor codex-editor milkdown-fallback" data-task-id="${taskId}" data-node-id="${nodeId}" placeholder="${placeholder}">${esc(markdown)}</textarea>${renderEditorImagePreview(markdown)}`;
  host.querySelectorAll(".markdown-editor").forEach((editor) => {
    editor.addEventListener("input", (event) => {
      updateNodeNoteDraft(taskId, nodeId, event.target.value, host);
      updateMarkdownEditorState(event.target);
    });
    editor.addEventListener("paste", handleMarkdownPaste);
    editor.addEventListener("drop", handleMarkdownDrop);
  });
}

function bindMilkdownSurfaceEvents(host) {
  const editor = host.querySelector(".ProseMirror");
  if (!editor || editor.dataset.enhanced === "true") return;
  editor.dataset.enhanced = "true";
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
function action(data, event = null) {
  state.contextMenu = null;
  syncContextMenuRoot();
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
    if (state.settingsOpen) state.reviewOpen = false;
  }
  if (data.action === "toggle-theme") state.theme = state.theme === "dark" ? "light" : "dark";
  if (data.action === "close-settings") state.settingsOpen = false;
  if (data.action === "toggle-review") {
    state.reviewOpen = !state.reviewOpen;
    if (state.reviewOpen) state.settingsOpen = false;
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
  if (data.action === "delete-group") deleteGroup(data.groupId);
  if (data.action === "select-focus") {
    openTaskFromGlobalList(data.taskId, "");
  }
  if (data.action === "select-task") {
    state.activeTaskId = data.taskId;
    state.selectedNodeId = "";
    state.recordDraft = "";
    state.nodeDetailFullscreen = false;
    state.nodeDetailPosition = null;
  }
  if (data.action === "add-task") addBlankTask();
  if (data.action === "delete-task") deleteTask(data.taskId);
  if (data.action === "select-node") {
    state.selectedNodeId = data.nodeId;
    const task = state.tasks.find((item) => item.id === data.taskId);
    const node = task ? findNode(task.nodes, data.nodeId) : null;
    state.recordDraft = node?.note || "";
    state.nodeDetailFullscreen = false;
    state.nodeDetailPosition = event ? { x: event.clientX + 12, y: event.clientY - 24 } : null;
  }
  if (data.action === "toggle-task-done") toggleTaskDone(data.taskId);
  if (data.action === "toggle-task-tag") toggleTaskTag(data.taskId, data.tag);
  if (data.action === "add-node") addNode(data.taskId, data.parentId || null);
  if (data.action === "add-root-node") addNode(data.taskId, null);
  if (data.action === "add-child-node") addNode(data.taskId, data.nodeId);
  if (data.action === "add-sibling-node") addSiblingNode(data.taskId, data.nodeId);
  if (data.action === "toggle-node-done") toggleNodeDone(data.taskId, data.nodeId);
  if (data.action === "toggle-node-collapse") toggleNodeCollapse(data.taskId, data.nodeId);
  if (data.action === "toggle-all-nodes") toggleAllNodes(data.taskId);
  if (data.action === "mark-node-status") markNodeStatus(data.taskId, data.nodeId, data.status);
  if (data.action === "delete-node") deleteNode(data.taskId, data.nodeId);
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
  const groupTitle = taskGroups().find((group) => group.id === task.groupId)?.title || "默认";
  const lines = [
    `# ${task.title || "未命名任务"}`,
    "",
    `- 分组：${groupTitle}`,
    `- 优先级：${priorityLabels[task.priority] || "中"}`,
    `- 状态：${task.status === "done" ? "已完成" : "处理中"}`,
    `- 节点：${summary.done}/${summary.total || 0}`,
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
    if (data.editKey === "hypothesis") task.hypothesisUpdatedAt = now();
    if (data.editKey === "conclusion" && value.trim()) {
      state.conclusionPromptTaskId = "";
      document.querySelector(".conclusion-prompt")?.remove();
      document.querySelector(".task-brief label.needs-attention")?.classList.remove("needs-attention");
    }
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
  state.priorityFilter = "all";
  state.query = "";
  state.reviewOpen = false;
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
  const task = {
    id: id("task"),
    order: state.tasks.length + 1,
    groupId: normalizeActiveGroupId(state.activeGroupId, state.taskGroups),
    title,
    description: "",
    status: "active",
    priority: state.newTaskPriority,
    tags: normalizeTaskTags({}),
    hypothesis: "",
    hypothesisUpdatedAt: "",
    conclusion: "",
    createdAt: now(),
    updatedAt: now(),
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
function deleteGroup(groupId) {
  const group = state.taskGroups.find((item) => item.id === groupId);
  if (!group || group.id === defaultTaskGroup.id) return;
  if (!confirm(`确定删除分组「${group.title}」吗？该分组内任务将移动到默认分组。`)) return;

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

/**
 * Delete a task and all its nodes.
 * @param {string} taskId - Task ID to delete
 */
function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !confirm(`确定删除任务「${task.title || "未命名任务"}」及其所有节点？`)) return;
  const index = state.tasks.findIndex((item) => item.id === taskId);
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  reorder(state.tasks);
  if (state.activeTaskId === taskId) {
    const groupTasks = tasksInActiveGroup();
    state.activeTaskId = groupTasks[Math.max(0, index - 1)]?.id || groupTasks[0]?.id || "";
    state.selectedNodeId = "";
  }
  save();
}

/**
 * Toggle task done/undone status, updating all nodes accordingly.
 * @param {string} taskId - Task ID to toggle
 */
function toggleTaskDone(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (task.status !== "done" && !task.conclusion.trim()) {
    state.conclusionPromptTaskId = taskId;
    return;
  }
  task.status = task.status === "done" ? "active" : "done";
  if (task.status === "done") {
    task.resolvedAt = now();
    state.conclusionPromptTaskId = "";
  }
  task.updatedAt = now();
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
  if (!task || !node) return;
  node.status = status;
  node.updatedAt = now();
  task.updatedAt = now();
}

/**
 * Delete a node and its descendants from a task's node tree.
 * @param {string} taskId - Task containing the node
 * @param {string} nodeId - Node ID to delete
 */
function deleteNode(taskId, nodeId) {
  if (!confirm("确定删除这个节点及其子节点？")) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.nodes = removeNode(task.nodes, nodeId);
  task.updatedAt = now();
  if (state.selectedNodeId === nodeId) {
    state.selectedNodeId = "";
    state.nodeDetailPosition = null;
  }
}

function activeTask() {
  if (state.conclusionPromptTaskId) {
    const promptedTask = state.tasks.find((task) => task.id === state.conclusionPromptTaskId);
    if (promptedTask) return promptedTask;
  }
  const visibleTasks = filteredTasks();
  return visibleTasks.find((task) => task.id === state.activeTaskId) || visibleTasks[0] || null;
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

function formatRepositoryStamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const current = new Date();
  const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((currentDay - targetDay) / 86400000);
  if (dayDifference === 0) {
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  if (dayDifference === 1) return "昨天";
  if (dayDifference > 1 && dayDifference < 7) return `周${"日一二三四五六"[date.getDay()]}`;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
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
  const data = await loadAppData();
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
  state.activeTaskId = tasksInActiveGroup()[0]?.id || "";
  render();
}

window.addEventListener("blur", () => {
  storeMarkdownSelection(activeMarkdownEditor(), true);
});

window.addEventListener("focus", () => {
  if (state.restoreMarkdownFocus) window.requestAnimationFrame(restoreMarkdownSelection);
});

window.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
  const target = event.target;
  if (target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
  event.preventDefault();
  state.focusSearch = true;
  state.searchCursor = state.query.length;
  render();
});

bootstrap();
