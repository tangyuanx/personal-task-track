const STORAGE_KEY = "task-flow-sheet-prototype-v2";
const FLOW_WIDTH_KEY = "task-flow-column-widths-v1";
const THEME_KEY = "task-track-theme";
const ZH_FONT_KEY = "task-track-zh-font";
const EN_FONT_KEY = "task-track-en-font";
const TONE_KEY = "task-track-tone";
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

const themeLabels = {
  light: "浅色",
  dark: "深色",
};

const toneLabels = {
  focus: "今日焦点",
  moss: "松石绿",
  indigo: "Linear 靛蓝",
  azure: "Apple 蓝",
  sky: "飞书天蓝",
  mint: "Notion 薄荷",
  emerald: "Slack 绿",
  violet: "烟紫色",
  rose: "Instagram 玫瑰",
  coral: "Airbnb 珊瑚",
  amber: "琥珀棕",
  graphite: "石墨灰",
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
const defaultSidebarWidth = 272;
const sidebarWidthLimits = [220, 420];
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
  tasks: [],
  taskGroups: [{ ...defaultTaskGroup }],
  activeGroupId: defaultTaskGroup.id,
  editingGroupId: "",
  activeTaskId: "",
  selectedNodeId: "",
  query: "",
  taskFilter: "all",
  priorityFilter: "all",
  newTaskPriority: "medium",
  markdownMode: "edit",
  theme: "light",
  zhFont: "songti",
  enFont: "inter",
  tone: "focus",
  settingsOpen: false,
  reviewOpen: false,
  reviewPreset: "week",
  reviewDateField: "updated",
  reviewStartDate: "",
  reviewEndDate: "",
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
};

let saveTimer = 0;
let pendingPayload = null;
let saveInFlight = false;
let taskDragState = null;
const milkdownEditors = new Map();

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function now() {
  return new Date().toISOString();
}

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
    children: [],
  };
}

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
    hypothesisUpdatedAt: task.hypothesisUpdatedAt || (task.hypothesis ? task.updatedAt || task.createdAt || now() : ""),
  }));
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

function normalizeTone(value) {
  return Object.hasOwn(toneLabels, value) ? value : "focus";
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
  return { zhFont: "songti", enFont: "inter" };
}

function loadBrowserTheme() {
  return normalizeTheme(localStorage.getItem(THEME_KEY));
}

function loadBrowserTypography() {
  const legacy = migrateLegacyFont(localStorage.getItem("task-track-font"));
  return {
    zhFont: normalizeZhFont(localStorage.getItem(ZH_FONT_KEY) || legacy.zhFont),
    enFont: normalizeEnFont(localStorage.getItem(EN_FONT_KEY) || legacy.enFont),
    tone: normalizeTone(localStorage.getItem(TONE_KEY)),
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
      const tone = normalizeTone(stored?.tone);
      const taskFilter = normalizeTaskFilter(stored?.taskFilter);
      const priorityFilter = normalizePriorityFilter(stored?.priorityFilter);
      const newTaskPriority = normalizePriority(stored?.newTaskPriority);
      const sidebarWidth = normalizeSidebarWidth(stored?.sidebarWidth);
      const detailHeight = normalizeDetailHeight(stored?.detailHeight);
      const attachments = normalizeAttachments(stored?.attachments);
      return { tasks, taskGroups, activeGroupId, flowWidths, sidebarWidth, detailHeight, attachments, theme, zhFont, enFont, tone, taskFilter, priorityFilter, newTaskPriority };
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
    tone: state.tone,
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
    localStorage.setItem(TONE_KEY, state.tone);
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

function render() {
  save();
  destroyMilkdownEditors();
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.zhFont = state.zhFont;
  document.documentElement.dataset.enFont = state.enFont;
  document.documentElement.dataset.tone = state.tone;
  const task = activeTask();
  if (task) state.activeTaskId = task.id;
  document.querySelector("#root").innerHTML = `
    <main class="ops-app" style="--sidebar-width:${normalizeSidebarWidth(state.sidebarWidth)}px">
      ${renderSidebar()}
      ${task ? renderTaskPage(task) : renderEmptyPage()}
      ${renderContextMenu()}
      ${state.settingsOpen ? renderSettingsPanel() : ""}
      ${state.reviewOpen ? renderReviewPanel() : ""}
    </main>
  `;
  bind();
  resizeTaskBriefTextareas();
  focusPendingElement();
  mountMilkdownEditors();
}

function renderSidebar() {
  const visibleCount = filteredTasks().length;
  const scopedTasks = taskListStatsTasks();
  const openCount = scopedTasks.filter((task) => task.status !== "done").length;
  const blockedCount = scopedTasks.filter((task) => task.tags.blocked || flatten(task.nodes).some((node) => node.status === "blocked")).length;
  const focusItems = todayFocusItems();
  return `
    <aside class="sidebar">
      <span class="sidebar-resizer" data-sidebar-resizer title="调整侧栏宽度"></span>
      <div class="sidebar-head">
        <div>
          <strong>Task Track</strong>
          <small>Personal operations</small>
        </div>
        <span>${visibleCount}/${scopedTasks.length}</span>
      </div>

      <div class="sidebar-stats" aria-label="任务统计">
        <span><b>${openCount}</b> 进行中</span>
        <span><b>${blockedCount}</b> 卡住</span>
      </div>

      <label class="search-box">
        <span>⌕</span>
        <input id="search" value="${escAttr(state.query)}" placeholder="搜索" />
      </label>

      ${renderTodayFocus(focusItems)}

      <div class="task-list" data-context="task-list">
        <div class="task-list-head">
          <span></span>
          <span></span>
          ${filterSelectHtml("task-filter", state.taskFilter, taskFilterLabels, "任务筛选")}
          ${filterSelectHtml("priority-filter", state.priorityFilter, priorityFilterLabels, "优先级筛选")}
        </div>
        ${filteredTasks()
          .map((task) => renderTaskItem(task))
          .join("")}
        <div class="task-item new-task-row">
          <span class="task-drag-spacer"></span>
          <span class="task-check-spacer"></span>
          <input class="task-title" data-new-task-title placeholder="输入任务标题，回车创建" />
          ${newTaskPrioritySelect()}
        </div>
      </div>
      <div class="sidebar-foot">
        <button class="review-trigger ${state.reviewOpen ? "active" : ""}" type="button" data-action="toggle-review" title="任务回顾">日</button>
        <button class="settings-trigger ${state.settingsOpen ? "active" : ""}" type="button" data-action="toggle-settings" title="设置">⚙</button>
        ${renderGroupTabs()}
      </div>
    </aside>
  `;
}

function renderTodayFocus(items) {
  const today = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date());
  return `
    <section class="today-focus" aria-label="今日焦点">
      <div class="today-head">
        <div class="today-title">今日焦点</div>
        <div class="today-date">${today}</div>
      </div>
      <div class="focus-list">
        ${
          items.length
            ? items.map((item) => renderTodayFocusItem(item)).join("")
            : `<div class="focus-empty">今天没有焦点任务</div>`
        }
      </div>
    </section>
  `;
}

function renderTodayFocusItem(item) {
  const { task, node, kind, badge, nextText } = item;
  const selected = task.id === state.activeTaskId && (!node?.id || node.id === state.selectedNodeId);
  return `
    <article class="focus-item ${kind} ${selected ? "selected" : ""}" data-action="select-focus" data-task-id="${task.id}" data-node-id="${node?.id || ""}">
      <span class="focus-rail"></span>
      <div class="focus-content">
        <div class="focus-title-row">
          <span class="focus-title">${esc(task.title || "未命名任务")}</span>
          <span class="focus-badge ${kind}">${badge}</span>
        </div>
        <p class="focus-next"><b>下一步</b> ${esc(nextText)}</p>
      </div>
    </article>
  `;
}

function renderGroupTabs() {
  return `
    <div class="sheet-bar" aria-label="任务分组">
      <button class="sheet-nav" type="button" data-action="scroll-sheets" data-direction="-1" title="查看前面的分组">‹</button>
      <div class="sheet-tabs" data-sheet-tabs>
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
      <button class="sheet-nav" type="button" data-action="scroll-sheets" data-direction="1" title="查看后面的分组">›</button>
      <button class="sheet-add" type="button" data-action="add-group" title="新增分组">+</button>
    </div>
  `;
}

function renderTaskItem(task) {
  const activeTags = Object.entries(normalizeTaskTags(task.tags)).filter(([, active]) => active);
  return `
    <div class="task-item ${task.id === state.activeTaskId ? "selected" : ""}" data-action="select-task" data-context="task" data-task-id="${task.id}" data-task-drag-target="${task.id}">
      <span class="task-drag-handle" draggable="true" data-task-drag-handle data-task-id="${task.id}" title="拖拽排序" aria-label="拖拽排序"></span>
      <input class="task-check" type="checkbox" title="完成" data-action="toggle-task-done" data-task-id="${task.id}" ${task.status === "done" ? "checked" : ""} />
      <span class="task-title-wrap">
        <input class="task-title" placeholder="任务标题" data-edit-key="title" data-task-id="${task.id}" value="${escAttr(task.title)}" />
        ${activeTags.length ? `<span class="task-mini-tags">${activeTags.map(([tag]) => `<i>${taskTagLabels[tag]}</i>`).join("")}</span>` : ""}
      </span>
      ${selectHtml("priority", task.priority, priorityLabels, task.id)}
    </div>
  `;
}

function renderTaskPage(task) {
  const topNodes = sort(task.nodes);
  const selectedNode = state.selectedNodeId ? findNode(task.nodes, state.selectedNodeId) : null;
  const summary = taskSummary(task);
  const needsConclusion = state.conclusionPromptTaskId === task.id && !task.conclusion.trim();
  return `
    <section class="task-page">
      <header class="page-header">
        <div class="page-title-block">
          <div class="page-kicker">任务档案</div>
          <input class="page-title" data-edit-key="title" data-task-id="${task.id}" value="${escAttr(task.title)}" />
          <div class="page-properties">
            <span class="priority ${task.priority}">${priorityLabels[task.priority]}优先</span>
            <span class="status ${task.status === "done" ? "resolved" : "attention"}">${task.status === "done" ? "已完成" : "处理中"}</span>
            <span>${summary.done}/${summary.total || 0} 节点</span>
            <span>${formatShort(task.updatedAt)}</span>
            <label class="property-select">分组 ${selectHtml("groupId", task.groupId, taskGroupOptions(), task.id)}</label>
          </div>
          <div class="task-tag-row" aria-label="任务标签">
            ${Object.entries(taskTagLabels).map(([tag, label]) => renderTaskTagButton(task, tag, label)).join("")}
          </div>
        </div>
      </header>

      ${needsConclusion ? renderConclusionPrompt() : ""}

      <section class="task-brief">
        ${renderBriefField("背景", textareaHtml("description", task.description, task.id), "", false, "background")}
        ${renderBriefField("当前判断", textareaHtml("hypothesis", task.hypothesis, task.id), task.hypothesisUpdatedAt, false, "hypothesis")}
        ${renderBriefField("结论", textareaHtml("conclusion", task.conclusion, task.id), "", needsConclusion, "conclusion")}
      </section>

      <section class="task-workbench ${selectedNode ? "detail-open" : ""} ${state.nodeDetailFullscreen ? "detail-fullscreen" : ""}">
        <section class="flow-section" data-context="flow-root" data-task-id="${task.id}">
          <div class="section-heading">
            <div>
              <h2>处理流</h2>
              <p>${summary.open ? `${summary.open} 个节点未完成` : "所有节点已完成"}</p>
            </div>
            <button class="flow-add-button" type="button" data-action="add-root-node" data-task-id="${task.id}" title="新增主节点">+ 主节点</button>
          </div>
          ${
            topNodes.length
              ? `<div class="flow-list" style="${flowWidthStyle()}" data-context="flow-root" data-task-id="${task.id}">${renderFlowHeader()}${topNodes.map((node) => renderFlowNode(task.id, node, 0)).join("")}</div>`
              : `<div class="empty-flow" data-context="flow-root" data-task-id="${task.id}">右键添加第一个节点。</div>`
          }
        </section>

        ${selectedNode ? renderNodeDetail(task.id, selectedNode) : ""}
      </section>
    </section>
  `;
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

function renderBriefField(label, control, timestamp = "", attention = false, variant = "") {
  return `
    <label class="brief-field ${variant} ${attention ? "needs-attention" : ""}">
      <span class="brief-label"><b>${label}</b></span>
      ${control}
      ${timestamp ? `<small class="brief-stamp">${formatShort(timestamp)}</small>` : ""}
    </label>
  `;
}

function renderFlowNode(taskId, node, depth) {
  const children = sort(node.children);
  const isSelected = state.selectedNodeId === node.id;
  const indent = Math.min(depth, 4) * 16;
  const branch = depth === 0 ? "main-flow" : "sub-flow";
  return `
    <article class="flow-item depth-${Math.min(depth, 6)}">
      <div class="flow-row ${branch} ${node.status} ${isSelected ? "selected" : ""}" style="--indent:${indent}px" data-context="node" data-task-id="${taskId}" data-node-id="${node.id}">
        <input class="flow-check" type="checkbox" title="完成" data-action="toggle-node-done" data-task-id="${taskId}" data-node-id="${node.id}" ${node.status === "done" ? "checked" : ""} />
        <span class="flow-title-cell">
          <span class="flow-indent"></span>
          <span class="flow-branch-mark"></span>
          ${nodeTitleInputHtml(node, taskId)}
        </span>
        <button class="flow-note" type="button" data-action="select-node" data-task-id="${taskId}" data-node-id="${node.id}" title="打开节点记录">${esc(node.note || "记录")}</button>
        <span class="flow-status">${nodeStatusText(node.status)}</span>
        <span class="flow-updated">${formatShort(node.updatedAt)}</span>
      </div>
      ${children.length ? children.map((child) => renderFlowNode(taskId, child, depth + 1)).join("") : ""}
    </article>
  `;
}

function renderFlowHeader() {
  return `
    <div class="flow-row flow-header">
      <span></span>
      ${renderFlowHeadCell("title", "处理")}
      ${renderFlowHeadCell("note", "记录")}
      ${renderFlowHeadCell("", "状态")}
      ${renderFlowHeadCell("", "更新")}
    </div>
  `;
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
  const stats = markdownStats(node.note);
  return `
    <section class="node-detail" data-task-id="${taskId}" data-node-id="${node.id}">
      <div class="detail-head">
        <div>
          <h2>节点详情</h2>
          <p>${node.status === "done" ? "已完成" : "未完成"}</p>
        </div>
        <div class="detail-actions">
          <label class="detail-check">
            <input type="checkbox" data-action="toggle-node-done" data-task-id="${taskId}" data-node-id="${node.id}" ${node.status === "done" ? "checked" : ""} />
            完成
          </label>
          <button class="detail-export" type="button" data-action="export-node-pdf" data-task-id="${taskId}" data-node-id="${node.id}">导出 PDF</button>
          <button class="detail-fullscreen" type="button" data-action="toggle-node-detail-fullscreen" title="${state.nodeDetailFullscreen ? "退出全屏" : "全屏展示"}">${state.nodeDetailFullscreen ? "退出全屏" : "全屏"}</button>
          <button class="detail-save" type="button" data-action="save-node-detail">保存</button>
          <button class="detail-close" type="button" data-action="close-node-detail" title="关闭节点详情">×</button>
        </div>
      </div>
      <label class="detail-title-row">
        <span>标题</span>
        ${inputHtml("title", node.title, taskId, "node-detail-title", node.id)}
      </label>
      <section class="markdown-panel milkdown-panel">
        <div
          class="milkdown-editor-host"
          data-task-id="${taskId}"
          data-node-id="${node.id}"
        >
          <div class="milkdown-loading">正在加载 Milkdown 编辑器...</div>
        </div>
        <div class="milkdown-status">
          <span class="markdown-stats" data-markdown-stats>${stats.lines} 行 · ${stats.characters} 字</span>
          <span>Milkdown</span>
        </div>
      </section>
    </section>
  `;
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
      <div class="empty-mark">TRACK</div>
      <h2>${hasTasks ? "没有符合筛选的任务" : "没有任务"}</h2>
      <p>${hasTasks ? "调整左侧筛选条件，或在底部输入新任务。" : "在左侧底部输入任务标题，即可创建新的处理流。"}</p>
    </section>
  `;
}

function renderContextMenu() {
  if (!state.contextMenu) return "";
  const menu = state.contextMenu;
  if (menu.kind === "task-list") {
    return `
      <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
        <button data-action="add-task">新增任务</button>
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
  const todoAction = node?.status !== "todo" ? `<button data-action="mark-node-status" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}" data-status="todo">标记为未完成</button>` : "";
  return `
    <div class="context-menu" style="left:${menu.x}px; top:${menu.y}px">
      <button data-action="add-child-node" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">新增下级节点</button>
      <button data-action="add-sibling-node" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">在下方新增同级</button>
      <hr />
      <button data-action="toggle-node-done" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">${doneLabel}</button>
      ${todoAction}
      <button data-action="mark-node-status" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}" data-status="blocked">标记为卡住</button>
      <button data-action="mark-node-status" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}" data-status="later">标记为稍后</button>
      <hr />
      <button class="danger" data-action="delete-node" data-task-id="${menu.taskId}" data-node-id="${menu.nodeId}">删除节点</button>
    </div>
  `;
}

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
                <h3>色调</h3>
                <p>用于高亮、选中状态和流程标记，参考常见生产力应用色系。</p>
              </div>
              ${settingsOptionGroup("tone", state.tone, toneLabels, true)}
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

function settingsOptionGroup(key, value, options, swatches = false) {
  return `
    <div class="settings-options">
      ${Object.entries(options)
        .map(
          ([optionValue, label]) => `
            <button class="${optionValue === value ? "active" : ""}" type="button" data-setting-button="${key}" data-value="${optionValue}">
              ${swatches ? `<span class="tone-swatch tone-${optionValue}"></span>` : ""}
              <span>${label}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function startTaskPointerDrag(event) {
  if (event.button !== 0) return;
  const handle = event.currentTarget;
  const sourceItem = handle.closest(".task-item[data-task-id]");
  if (!sourceItem) return;
  event.preventDefault();
  event.stopPropagation();
  taskDragState = {
    sourceId: sourceItem.dataset.taskId,
    sourceItem,
    targetId: "",
  };
  sourceItem.classList.add("dragging");
  handle.setPointerCapture?.(event.pointerId);
  document.addEventListener("pointermove", updateTaskPointerDrag);
  document.addEventListener("pointerup", finishTaskPointerDrag, { once: true });
}

function updateTaskPointerDrag(event) {
  if (!taskDragState) return;
  const targetItem = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-task-drag-target]");
  document.querySelectorAll(".task-item.drag-over").forEach((item) => {
    if (item !== targetItem) item.classList.remove("drag-over");
  });
  if (!targetItem || targetItem.dataset.taskId === taskDragState.sourceId) {
    taskDragState.targetId = "";
    return;
  }
  taskDragState.targetId = targetItem.dataset.taskId;
  targetItem.classList.add("drag-over");
}

function finishTaskPointerDrag() {
  if (!taskDragState) return;
  const { sourceId, targetId } = taskDragState;
  taskDragState.sourceItem?.classList.remove("dragging");
  document.removeEventListener("pointermove", updateTaskPointerDrag);
  document.querySelectorAll(".task-item.drag-over").forEach((item) => item.classList.remove("drag-over"));
  taskDragState = null;
  if (targetId) {
    reorderTasks(sourceId, targetId);
    render();
  }
}

function bind() {
  document.querySelectorAll(".task-item[data-task-id]").forEach((element) => {
    element.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-task-drag-handle]")) return;
      if (event.button !== 0 || state.activeTaskId === element.dataset.taskId) return;
      state.activeTaskId = element.dataset.taskId;
      state.selectedNodeId = "";
      window.requestAnimationFrame(() => render());
    });
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
      document.querySelectorAll(".task-item.dragging, .task-item.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
    });
  });

  document.querySelectorAll("[data-task-drag-target]").forEach((element) => {
    element.addEventListener("dragover", (event) => {
      const hasTaskDrag = Array.from(event.dataTransfer.types || []).includes("text/plain");
      if (!hasTaskDrag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      element.classList.add("drag-over");
    });
    element.addEventListener("dragleave", () => element.classList.remove("drag-over"));
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      element.classList.remove("drag-over");
      reorderTasks(event.dataTransfer.getData("text/plain"), element.dataset.taskId);
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      action(element.dataset);
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

  document.querySelectorAll("[data-setting]").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("change", (event) => {
      if (event.target.dataset.setting === "theme") state.theme = normalizeTheme(event.target.value);
      if (event.target.dataset.setting === "tone") state.tone = normalizeTone(event.target.value);
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

  document.querySelectorAll(".node-detail").forEach((element) => {
    element.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        state.selectedNodeId = "";
        render();
      }
    });
  });

  const app = document.querySelector(".ops-app");
  if (app) {
    app.addEventListener("pointerdown", (event) => {
      let needsRender = false;
      const keepNodeDetail = event.target.closest(".node-detail, .flow-row:not(.flow-header), .context-menu, [data-action], [data-edit-key], button, input, textarea, select");
      const keepSettings = event.target.closest(".settings-overlay, .settings-trigger");
      const keepReview = event.target.closest(".review-overlay, .review-trigger");
      const keepContextMenu = event.target.closest(".context-menu");

      if (state.contextMenu && !keepContextMenu) {
        state.contextMenu = null;
        needsRender = true;
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
  if (key === "tone") state.tone = normalizeTone(value);
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

function exitNodeDetail() {
  if (!state.selectedNodeId) return false;
  state.selectedNodeId = "";
  document.querySelector(".node-detail")?.remove();
  document.querySelectorAll(".flow-row.selected").forEach((row) => row.classList.remove("selected"));
  return true;
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

  restoreMarkdownSelection();
}

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

function destroyMilkdownEditors() {
  milkdownEditors.forEach((instance) => {
    instance?.destroy?.().catch?.(() => {});
  });
  milkdownEditors.clear();
}

function mountMilkdownEditors() {
  const hosts = Array.from(document.querySelectorAll(".milkdown-editor-host"));
  if (!hosts.length) return;
  if (!window.MilkdownTaskEditor?.create) {
    hosts.forEach((host) => mountFallbackMarkdownEditor(host));
    return;
  }

  hosts.forEach((host) => {
    const taskId = host.dataset.taskId;
    const nodeId = host.dataset.nodeId;
    const task = state.tasks.find((item) => item.id === taskId);
    const node = task ? findNode(task.nodes, nodeId) : null;
    if (!task || !node) return;

    window.MilkdownTaskEditor.create({
      root: host,
      markdown: node.note || "",
      placeholder: "记录处理过程",
      onChange: (markdown) => {
        const currentTask = state.tasks.find((item) => item.id === taskId);
        const currentNode = currentTask ? findNode(currentTask.nodes, nodeId) : null;
        if (!currentTask || !currentNode || currentNode.note === markdown) return;
        edit({ taskId, nodeId, editKey: "note" }, markdown);
        updateMarkdownStatsForMarkdown(host, markdown);
      },
    })
      .then((instance) => {
        if (!document.body.contains(host)) {
          instance.destroy?.();
          return;
        }
        milkdownEditors.set(nodeId, instance);
        updateMarkdownStatsForMarkdown(host, node.note || "");
      })
      .catch((error) => {
        console.error("Milkdown failed to mount", error);
        mountFallbackMarkdownEditor(host);
      });
  });
}

function mountFallbackMarkdownEditor(host) {
  const taskId = host.dataset.taskId;
  const nodeId = host.dataset.nodeId;
  const task = state.tasks.find((item) => item.id === taskId);
  const node = task ? findNode(task.nodes, nodeId) : null;
  if (!task || !node) return;
  host.innerHTML = `<textarea class="markdown-editor codex-editor milkdown-fallback" data-edit-key="note" data-task-id="${taskId}" data-node-id="${nodeId}" placeholder="记录处理过程">${esc(node.note)}</textarea>${renderEditorImagePreview(node.note)}`;
  host.querySelectorAll(".markdown-editor").forEach((editor) => {
    editor.addEventListener("input", (event) => {
      edit(event.target.dataset, event.target.value);
      updateMarkdownEditorState(event.target);
    });
    editor.addEventListener("paste", handleMarkdownPaste);
    editor.addEventListener("drop", handleMarkdownDrop);
  });
}

function updateMarkdownStatsForMarkdown(host, markdown) {
  const stats = markdownStats(markdown);
  const statsElement = host.closest(".markdown-panel")?.querySelector("[data-markdown-stats]");
  if (statsElement) statsElement.textContent = `${stats.lines} 行 · ${stats.characters} 字`;
}

function action(data) {
  state.contextMenu = null;
  if (data.action === "markdown-tool") {
    applyMarkdownTool(data.tool);
    return;
  }
  if (data.action === "export-node-pdf") {
    exportNodePdf(data.taskId, data.nodeId);
    return;
  }
  if (data.action === "scroll-sheets") {
    scrollSheets(Number(data.direction || 1));
    return;
  }
  if (data.action === "set-markdown-mode") state.markdownMode = data.mode === "preview" ? "preview" : "edit";
  if (data.action === "toggle-settings") {
    state.settingsOpen = !state.settingsOpen;
    if (state.settingsOpen) state.reviewOpen = false;
  }
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
  if (data.action === "select-focus") {
    openTaskFromGlobalList(data.taskId, "");
  }
  if (data.action === "select-task") {
    state.activeTaskId = data.taskId;
    state.selectedNodeId = "";
    state.nodeDetailFullscreen = false;
  }
  if (data.action === "add-task") addBlankTask();
  if (data.action === "delete-task") deleteTask(data.taskId);
  if (data.action === "select-node") state.selectedNodeId = data.nodeId;
  if (data.action === "toggle-task-done") toggleTaskDone(data.taskId);
  if (data.action === "toggle-task-tag") toggleTaskTag(data.taskId, data.tag);
  if (data.action === "add-node") addNode(data.taskId, data.parentId || null);
  if (data.action === "add-root-node") addNode(data.taskId, null);
  if (data.action === "add-child-node") addNode(data.taskId, data.nodeId);
  if (data.action === "add-sibling-node") addSiblingNode(data.taskId, data.nodeId);
  if (data.action === "toggle-node-done") toggleNodeDone(data.taskId, data.nodeId);
  if (data.action === "mark-node-status") markNodeStatus(data.taskId, data.nodeId, data.status);
  if (data.action === "delete-node") deleteNode(data.taskId, data.nodeId);
  if (data.action === "toggle-node-detail-fullscreen") state.nodeDetailFullscreen = !state.nodeDetailFullscreen;
  if (data.action === "close-node-detail") {
    state.selectedNodeId = "";
    state.nodeDetailFullscreen = false;
  }
  if (data.action === "save-node-detail") {
    state.selectedNodeId = "";
    state.nodeDetailFullscreen = false;
  }
  render();
}

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
  state.nodeDetailFullscreen = false;
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

function selectGroup(groupId) {
  state.activeGroupId = normalizeActiveGroupId(groupId, state.taskGroups);
  state.activeTaskId = "";
  state.selectedNodeId = "";
  state.nodeDetailFullscreen = false;
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

function reorderTasks(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const visibleTasks = filteredTasks();
  const sourceIndex = visibleTasks.findIndex((task) => task.id === sourceId);
  const targetIndex = visibleTasks.findIndex((task) => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const orderedVisible = [...visibleTasks];
  const [source] = orderedVisible.splice(sourceIndex, 1);
  orderedVisible.splice(targetIndex, 0, source);

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
  edit(editor.dataset, editor.value);
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
      if (text) insertEditorText(event.currentTarget, text);
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

function insertMarkdownImage(editor, dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
  const imageId = id("image");
  state.attachments = normalizeAttachments(state.attachments);
  state.attachments.images[imageId] = dataUrl;
  const alt = `粘贴图片 ${formatImageStamp(new Date())}`;
  const markdown = `\n![${alt}](task-image:${imageId})\n`;
  const start = editor.selectionStart || editor.value.length;
  replaceEditorSelection(editor, markdown, start + markdown.length);
  save();
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
  state.focusNodeTitleId = created.id;
}

function toggleNodeDone(taskId, nodeId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const node = task ? findNode(task.nodes, nodeId) : null;
  if (!task || !node) return;
  node.status = node.status === "done" ? "todo" : "done";
  node.updatedAt = now();
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

function deleteNode(taskId, nodeId) {
  if (!confirm("确定删除这个节点及其子节点？")) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.nodes = removeNode(task.nodes, nodeId);
  task.updatedAt = now();
  if (state.selectedNodeId === nodeId) state.selectedNodeId = "";
}

function activeTask() {
  if (state.conclusionPromptTaskId) {
    const promptedTask = state.tasks.find((task) => task.id === state.conclusionPromptTaskId);
    if (promptedTask) return promptedTask;
  }
  const visibleTasks = filteredTasks();
  return visibleTasks.find((task) => task.id === state.activeTaskId) || visibleTasks[0] || null;
}

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

function formatShort(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  state.tone = data.tone;
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

bootstrap();
