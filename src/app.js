const STORAGE_KEY = "task-flow-sheet-prototype-v2";
const FLOW_WIDTH_KEY = "task-flow-column-widths-v1";

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

const defaultFlowWidths = {
  title: 360,
  note: 330,
};

const flowWidthLimits = {
  title: [190, 720],
  note: [180, 760],
};

let state = {
  tasks: loadTasks(),
  activeTaskId: "",
  selectedNodeId: "",
  query: "",
  taskFilter: "today",
  priorityFilter: "all",
  newTaskPriority: "medium",
  markdownMode: "edit",
  flowWidths: loadFlowWidths(),
  conclusionPromptTaskId: "",
  contextMenu: null,
};

state.activeTaskId = state.tasks[0]?.id || "";

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

function sampleTasks() {
  const taskId = id("task");
  const first = {
    ...makeNode(taskId, null, 1),
    title: "复现问题",
    status: "done",
    note: "测试账号可以稳定复现登录后掉线。",
  };
  const second = {
    ...makeNode(taskId, null, 2),
    title: "提出当前猜想",
    status: "done",
    note: "refresh token 过期后没有正确刷新。",
  };
  const third = {
    ...makeNode(taskId, null, 3),
    title: "查看登录日志",
    status: "todo",
    note: "重点看 token refresh 和 session TTL。",
  };
  const childA = {
    ...makeNode(taskId, third.id, 1),
    title: "查看 token expired 相关日志",
    status: "done",
    note: "日志里有 refresh 失败记录。",
  };
  const childB = {
    ...makeNode(taskId, third.id, 2),
    title: "确认日志时间是否准确",
    status: "todo",
    note: "如果时间不准，后续判断会偏。",
  };
  third.children = [childA, childB];

  return [
    {
      id: taskId,
      order: 1,
      title: "修复登录失败问题",
      description: "用户反馈登录后很快掉线，需要确认失败原因并完成修复。",
      status: "active",
      priority: "high",
      hypothesis: "refresh token 过期后没有正确刷新。",
      hypothesisUpdatedAt: now(),
      conclusion: "",
      createdAt: now(),
      updatedAt: now(),
      nodes: [first, second, third],
    },
    {
      id: id("task"),
      order: 2,
      title: "梳理接口权限模型",
      description: "整理接口权限边界，确认是否存在不一致规则。",
      status: "active",
      priority: "medium",
      hypothesis: "",
      hypothesisUpdatedAt: "",
      conclusion: "",
      createdAt: now(),
      updatedAt: now(),
      nodes: [],
    },
  ];
}

function loadTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return sampleTasks();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeTasks(parsed) : sampleTasks();
  } catch {
    return sampleTasks();
  }
}

function normalizeTasks(tasks) {
  return tasks.map((task) => ({
    ...task,
    hypothesisUpdatedAt: task.hypothesisUpdatedAt || (task.hypothesis ? task.updatedAt || task.createdAt || now() : ""),
  }));
}

function loadFlowWidths() {
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

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function saveFlowWidths() {
  localStorage.setItem(FLOW_WIDTH_KEY, JSON.stringify(state.flowWidths));
}

function normalizeFlowWidth(key, value) {
  const [min, max] = flowWidthLimits[key];
  const width = Number(value);
  if (!Number.isFinite(width)) return defaultFlowWidths[key];
  return Math.max(min, Math.min(max, Math.round(width)));
}

function flowWidthStyle() {
  return Object.entries(defaultFlowWidths)
    .map(([key]) => `--flow-${key}-width:${normalizeFlowWidth(key, state.flowWidths[key])}px`)
    .join(";");
}

function render() {
  save();
  const task = activeTask();
  if (task) state.activeTaskId = task.id;
  document.querySelector("#root").innerHTML = `
    <main class="ops-app">
      ${renderSidebar()}
      ${task ? renderTaskPage(task) : renderEmptyPage()}
      ${renderContextMenu()}
    </main>
  `;
  bind();
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="sidebar-head">
        <h1>任务</h1>
        <span>${filteredTasks().length}/${state.tasks.length}</span>
      </div>

      <label class="search-box">
        <span>⌕</span>
        <input id="search" value="${escAttr(state.query)}" placeholder="搜索" />
      </label>

      <div class="task-list">
        <div class="task-list-head">
          <span></span>
          <label class="head-filter">
            <span>任务</span>
            ${filterSelectHtml("task-filter", state.taskFilter, taskFilterLabels)}
          </label>
          <label class="head-filter">
            <span>优先级</span>
            ${filterSelectHtml("priority-filter", state.priorityFilter, priorityFilterLabels)}
          </label>
        </div>
        ${filteredTasks()
          .map((task) => renderTaskItem(task))
          .join("")}
        <div class="task-item new-task-row">
          <span class="task-check-spacer"></span>
          <input class="task-title" data-new-task-title placeholder="新任务" />
          ${newTaskPrioritySelect()}
        </div>
      </div>
    </aside>
  `;
}

function renderTaskItem(task) {
  return `
    <div class="task-item ${task.id === state.activeTaskId ? "selected" : ""}" data-action="select-task" data-task-id="${task.id}">
      <input class="task-check" type="checkbox" title="完成" data-action="toggle-task-done" data-task-id="${task.id}" ${task.status === "done" ? "checked" : ""} />
      ${inputHtml("title", task.title, task.id, "task-title")}
      ${selectHtml("priority", task.priority, priorityLabels, task.id)}
    </div>
  `;
}

function renderTaskPage(task) {
  const topNodes = sort(task.nodes);
  const selectedNode = state.selectedNodeId ? findNode(task.nodes, state.selectedNodeId) : null;
  const summary = taskSummary(task);
  const nextNode = nextOpenNode(task.nodes);
  const needsConclusion = state.conclusionPromptTaskId === task.id && !task.conclusion.trim();
  return `
    <section class="task-page">
      <header class="page-header">
        <div class="page-title-block">
          <div class="page-kicker">问题记录</div>
          <input class="page-title" data-edit-key="title" data-task-id="${task.id}" value="${escAttr(task.title)}" />
          <div class="page-properties">
            <span class="priority ${task.priority}">${priorityLabels[task.priority]}优先</span>
            <span class="status ${task.status === "done" ? "resolved" : "attention"}">${task.status === "done" ? "已完成" : "处理中"}</span>
            <span>${summary.done}/${summary.total || 0} 节点</span>
            <span>${formatShort(task.updatedAt)}</span>
          </div>
        </div>
        <div class="next-step ${nextNode ? nextNode.status : "done"}">
          <span>下一步</span>
          <strong>${esc(nextNode?.title || "没有未完成节点")}</strong>
          <small>${esc(nextNode?.note || (summary.total ? "流程已收束，可以补充结论。" : "先记录第一个处理动作。"))}</small>
        </div>
      </header>

      ${needsConclusion ? renderConclusionPrompt() : ""}

      <section class="task-brief">
        ${renderBriefField("背景", textareaHtml("description", task.description, task.id), "", false, "background")}
        ${renderBriefField("当前判断", textareaHtml("hypothesis", task.hypothesis, task.id), task.hypothesisUpdatedAt, false, "hypothesis")}
        ${renderBriefField("结论", textareaHtml("conclusion", task.conclusion, task.id), "", needsConclusion, "conclusion")}
      </section>

      <section class="flow-section">
        <div class="section-heading">
          <div>
            <h2>处理流</h2>
            <p>${summary.open ? `${summary.open} 个节点未完成` : "所有节点已完成"}</p>
          </div>
        </div>
        ${
          topNodes.length
            ? `<div class="flow-list" style="${flowWidthStyle()}" data-context="flow-root" data-task-id="${task.id}">${renderFlowHeader()}${topNodes.map((node) => renderFlowNode(task.id, node, 0)).join("")}</div>`
            : `<div class="empty-flow" data-context="flow-root" data-task-id="${task.id}">右键添加第一个节点。</div>`
        }
      </section>

      ${selectedNode ? renderNodeDetail(task.id, selectedNode) : ""}
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

function renderBriefField(label, control, timestamp = "", attention = false, variant = "") {
  return `
    <label class="brief-field ${variant} ${attention ? "needs-attention" : ""}">
      <span class="brief-label"><b>${label}</b>${timestamp ? `<small>更新于 ${formatMinuteStamp(timestamp)}</small>` : ""}</span>
      ${control}
    </label>
  `;
}

function renderFlowNode(taskId, node, depth) {
  const children = sort(node.children);
  const isSelected = state.selectedNodeId === node.id;
  const indent = Math.min(depth, 4) * 16;
  return `
    <article class="flow-item depth-${Math.min(depth, 6)}">
      <div class="flow-row ${node.status} ${isSelected ? "selected" : ""}" style="--indent:${indent}px" data-action="select-node" data-context="node" data-task-id="${taskId}" data-node-id="${node.id}">
        <input class="flow-check" type="checkbox" title="完成" data-action="toggle-node-done" data-task-id="${taskId}" data-node-id="${node.id}" ${node.status === "done" ? "checked" : ""} />
        <span class="flow-title-cell">
          <span class="flow-indent"></span>
          ${nodeTitleInputHtml(node, taskId)}
        </span>
        <span class="flow-note">${esc(node.note || "")}</span>
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
  const mode = state.markdownMode === "preview" ? "preview" : "edit";
  return `
    <section class="node-detail">
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
        </div>
      </div>
      <label class="detail-title-row">
        <span>标题</span>
        ${inputHtml("title", node.title, taskId, "node-detail-title", node.id)}
      </label>
      <section class="markdown-panel">
        <div class="markdown-toolbar">
          <span>Markdown 注释</span>
          <div class="markdown-tabs" role="tablist" aria-label="Markdown view">
            <button class="${mode === "edit" ? "active" : ""}" type="button" role="tab" aria-selected="${mode === "edit"}" data-action="set-markdown-mode" data-mode="edit">编辑</button>
            <button class="${mode === "preview" ? "active" : ""}" type="button" role="tab" aria-selected="${mode === "preview"}" data-action="set-markdown-mode" data-mode="preview">预览</button>
          </div>
        </div>
        ${
          mode === "preview"
            ? `<article class="markdown-preview">${renderMarkdown(node.note)}</article>`
            : `<textarea class="markdown-editor" data-edit-key="note" data-task-id="${taskId}" data-node-id="${node.id}" placeholder="支持 Markdown：标题、列表、代码块、链接、图片、表格等。">${esc(node.note)}</textarea>`
        }
      </section>
    </section>
  `;
}

function renderEmptyPage() {
  const hasTasks = state.tasks.length > 0;
  return `
    <section class="task-page empty-page">
      <h2>${hasTasks ? "没有符合筛选的任务" : "没有任务"}</h2>
      <p>${hasTasks ? "调整左侧筛选条件，或在底部输入新任务。" : "在左侧底部输入任务标题，即可创建新的处理流。"}</p>
    </section>
  `;
}

function renderContextMenu() {
  if (!state.contextMenu) return "";
  const menu = state.contextMenu;
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
  return state.tasks
    .filter((task) => {
      const openNodes = flatten(task.nodes).filter((node) => node.status !== "done");
      const hasBlocked = flatten(task.nodes).some((node) => node.status === "blocked");
      const hasLater = flatten(task.nodes).some((node) => node.status === "later");
      if (state.taskFilter === "today" && (task.status === "done" || (!openNodes.length && task.priority !== "high"))) return false;
      if (state.taskFilter === "active" && task.status === "done") return false;
      if (state.taskFilter === "done" && task.status !== "done") return false;
      if (state.taskFilter === "blocked" && !hasBlocked) return false;
      if (state.taskFilter === "later" && !hasLater) return false;
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

function filterSelectHtml(kind, value, options) {
  return `
    <select data-${kind}>
      ${Object.entries(options)
        .map(([optionValue, label]) => `<option value="${optionValue}" ${optionValue === value ? "selected" : ""}>${label}</option>`)
        .join("")}
    </select>
  `;
}

function bind() {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      action(element.dataset);
    });
  });

  document.querySelectorAll("[data-edit-key]").forEach((element) => {
    element.addEventListener("input", (event) => edit(event.target.dataset, event.target.value));
    element.addEventListener("change", (event) => edit(event.target.dataset, event.target.value));
    element.addEventListener("click", (event) => {
      if (!event.currentTarget.dataset.nodeId) exitNodeDetail();
      event.stopPropagation();
    });
    element.addEventListener("blur", () => render());
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
      render();
    });
  });

  const newTaskPriority = document.querySelector("[data-new-task-priority]");
  if (newTaskPriority) {
    newTaskPriority.addEventListener("change", (event) => {
      state.newTaskPriority = event.target.value;
    });
    newTaskPriority.addEventListener("click", (event) => {
      exitNodeDetail();
      event.stopPropagation();
    });
  }

  const newTaskTitle = document.querySelector("[data-new-task-title]");
  if (newTaskTitle) {
    newTaskTitle.addEventListener("click", (event) => {
      exitNodeDetail();
      event.stopPropagation();
    });
    newTaskTitle.addEventListener("change", (event) => createTaskFromBlank(event.target.value));
    newTaskTitle.addEventListener("keydown", (event) => {
      if (event.key === "Enter") createTaskFromBlank(event.target.value);
    });
  }

  const search = document.querySelector("#search");
  if (search) {
    search.addEventListener("click", () => exitNodeDetail());
    search.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
    });
  }

  const taskFilter = document.querySelector("[data-task-filter]");
  if (taskFilter) {
    taskFilter.addEventListener("click", (event) => {
      exitNodeDetail();
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
      exitNodeDetail();
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

  const app = document.querySelector(".ops-app");
  if (app) {
    app.addEventListener("click", (event) => {
      let needsRender = false;
      const keepNodeDetail = event.target.closest(".node-detail, .flow-row:not(.flow-header), .context-menu");

      if (state.contextMenu) {
        state.contextMenu = null;
        needsRender = true;
      }

      if (state.selectedNodeId && !keepNodeDetail) exitNodeDetail();

      if (needsRender) render();
    });
  }
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

function exitNodeDetail() {
  if (!state.selectedNodeId) return false;
  state.selectedNodeId = "";
  document.querySelector(".node-detail")?.remove();
  document.querySelectorAll(".flow-row.selected").forEach((row) => row.classList.remove("selected"));
  return true;
}

function action(data) {
  state.contextMenu = null;
  if (data.action === "set-markdown-mode") state.markdownMode = data.mode === "preview" ? "preview" : "edit";
  if (data.action === "select-task") {
    state.activeTaskId = data.taskId;
    state.selectedNodeId = "";
  }
  if (data.action === "select-node") state.selectedNodeId = data.nodeId;
  if (data.action === "toggle-task-done") toggleTaskDone(data.taskId);
  if (data.action === "add-node") addNode(data.taskId, data.parentId || null);
  if (data.action === "add-root-node") addNode(data.taskId, null);
  if (data.action === "add-child-node") addNode(data.taskId, data.nodeId);
  if (data.action === "add-sibling-node") addSiblingNode(data.taskId, data.nodeId);
  if (data.action === "toggle-node-done") toggleNodeDone(data.taskId, data.nodeId);
  if (data.action === "mark-node-status") markNodeStatus(data.taskId, data.nodeId, data.status);
  if (data.action === "delete-node") deleteNode(data.taskId, data.nodeId);
  render();
}

function edit(data, value) {
  const task = state.tasks.find((item) => item.id === data.taskId);
  if (!task) return;

  if (!data.nodeId) {
    task[data.editKey] = value;
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

function createTaskFromBlank(title) {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return;

  const task = {
    id: id("task"),
    order: state.tasks.length + 1,
    title: normalizedTitle,
    description: "",
    status: "active",
    priority: state.newTaskPriority,
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
  save();
  render();
}

function toggleTaskDone(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (task.status !== "done" && !task.conclusion.trim()) {
    state.activeTaskId = taskId;
    state.selectedNodeId = "";
    state.conclusionPromptTaskId = taskId;
    return;
  }
  task.status = task.status === "done" ? "active" : "done";
  if (task.status === "done") state.conclusionPromptTaskId = "";
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
  state.selectedNodeId = created.id;
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
  state.selectedNodeId = created.id;
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
    html.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${listType}>`);
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
  let output = esc(value).replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE_SPAN_${codeSpans.length}@@`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });

  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return esc(`![${alt}](${url})`);
    return `<img src="${safeUrl}" alt="${escAttr(alt)}" loading="lazy" />`;
  });

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return esc(`[${label}](${url})`);
    return `<a href="${safeUrl}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  output = output
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  codeSpans.forEach((code, index) => {
    output = output.replace(`@@CODE_SPAN_${index}@@`, code);
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

render();
