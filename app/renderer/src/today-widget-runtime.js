(() => {
  const bridge = window.personalTaskTrack?.todayWidget;
  if (!bridge) return;

  const COMPACT_MENU_WINDOW_HEIGHT = 340;

  document.body.classList.add("widget-runtime");

  const widget = document.querySelector("#widget");
  const menu = document.querySelector("#widget-menu");
  const menuToggle = document.querySelector("#menu-toggle");
  const compactToggle = document.querySelector("#compact-toggle");
  const quickCaptureInput = document.querySelector("#quick-capture-input");
  const quickCaptureSection = document.querySelector("#quick-capture-section");
  const quickCaptureCount = document.querySelector("#quick-capture-count");
  const quickCaptureList = document.querySelector("#quick-capture-list");
  const quickCaptureOverflow = document.querySelector("#quick-capture-overflow");
  const todayTaskCount = document.querySelector("#today-task-count");
  const todayTaskSection = document.querySelector(".today-task-section");
  const quickCaptureGroupMenu = document.querySelector("#quick-capture-group-menu");
  const todayContextMenu = document.querySelector("#today-context-menu");
  const deleteQuickCaptureButton = document.querySelector("#delete-quick-capture");
  const taskList = document.querySelector("#task-list");
  const emptyState = document.querySelector("#empty-state");
  const toast = document.querySelector("#toast");
  const alwaysOnTop = document.querySelector("#always-on-top");
  const alwaysOnTopToggle = document.querySelector("#always-on-top-toggle");
  const clickThrough = document.querySelector("#click-through");
  const clickThroughHint = document.querySelector("#click-through-hint");
  const launchWithApp = document.querySelector("#launch-with-app");
  const opacityControl = document.querySelector("#widget-opacity");
  const opacityValue = document.querySelector("#widget-opacity-value");
  let currentSnapshot = { date: "", items: [], quickCaptures: [], quickCaptureTotal: 0, groups: [] };
  let queuedSnapshot = null;
  let completingTaskId = "";
  let toastTimer = 0;
  let resizeGesture = null;
  let resizeFrame = 0;
  let pendingResizeHeight = 0;
  let compactMenuExpanded = false;
  let editingTaskId = "";
  let editingInput = null;
  let draftSaveTimer = 0;
  let captureSubmitting = false;
  let promotingTaskId = "";
  let contextTaskId = "";
  let rowDragState = null;
  let suppressRowClickUntil = 0;
  let editingReleaseTimer = 0;

  const LONG_PRESS_DELAY = 380;
  const DRAG_START_DISTANCE = 6;

  function isTextEditingTarget(element) {
    return element === quickCaptureInput || element?.classList?.contains("task-inline-input");
  }

  function setTextEditing(enabled) {
    window.clearTimeout(editingReleaseTimer);
    editingReleaseTimer = 0;
    if (enabled) {
      void bridge.setEditing?.(true);
      return;
    }
    // Native IME candidate panels can transiently affect window focus while
    // the DOM input remains active. Only restore topmost after focus has truly
    // left every text-editing target.
    editingReleaseTimer = window.setTimeout(() => {
      editingReleaseTimer = 0;
      if (isTextEditingTarget(document.activeElement)) return;
      void bridge.setEditing?.(false);
    }, 320);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  function closeMenu() {
    menu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    syncCompactMenuWindow(false);
  }

  function closeGroupMenu() {
    promotingTaskId = "";
    quickCaptureGroupMenu.hidden = true;
    quickCaptureGroupMenu.innerHTML = "";
  }

  function openGroupMenu(button, taskId) {
    const groups = Array.isArray(currentSnapshot.groups) ? currentSnapshot.groups : [];
    if (!groups.length) {
      showToast("请先在主窗口创建一个任务分组");
      return;
    }
    promotingTaskId = taskId;
    quickCaptureGroupMenu.innerHTML = `<span>升级为任务并移入</span>${groups.map((group) => `<button type="button" data-promote-group="${escapeHtml(group.id)}">${escapeHtml(group.title)}</button>`).join("")}`;
    quickCaptureGroupMenu.hidden = false;
    const buttonRect = button.getBoundingClientRect();
    const desiredTop = buttonRect.bottom + 5;
    const maxTop = Math.max(48, window.innerHeight - Math.min(230, quickCaptureGroupMenu.scrollHeight) - 8);
    quickCaptureGroupMenu.style.top = `${Math.max(48, Math.min(maxTop, desiredTop))}px`;
  }

  function syncCompactMenuWindow(open) {
    const wasExpanded = compactMenuExpanded;
    compactMenuExpanded = open && widget.classList.contains("is-compact");
    if (compactMenuExpanded) {
      void bridge.resize({ height: COMPACT_MENU_WINDOW_HEIGHT, transient: true });
    } else if (wasExpanded && widget.classList.contains("is-compact")) {
      void bridge.resize({ height: 49, transient: true });
    }
  }

  function taskHtml(item, index, items) {
    const taskId = escapeHtml(item.taskId);
    const title = escapeHtml(item.title || "未命名任务");
    const nextText = escapeHtml(item.nextText || "补充任务背景或新增第一个节点");
    const kind = ["normal", "high", "blocked"].includes(item.kind) ? item.kind : "normal";
    const stateTitle = kind === "blocked" ? "被阻塞" : kind === "high" ? "高优先级" : "普通";
    return `
      <article class="today-task ${kind}" data-task-id="${taskId}" data-lane="task" data-title="${title}" tabindex="0" role="button">
        <button class="task-check" type="button" aria-label="完成：${title}"></button>
        <span class="task-copy"><strong>${title}</strong><span>下一步：${nextText}</span></span>
        <i class="task-state" title="${stateTitle}"></i>
      </article>
    `;
  }

  function quickCaptureHtml(item, index, items) {
    const taskId = escapeHtml(item.taskId);
    const title = escapeHtml(item.title || "未命名速记");
    const stamp = item.updatedAt || item.createdAt;
    const time = stamp ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(stamp)) : "刚刚";
    return `
      <article class="today-task quick-capture-item" data-task-id="${taskId}" data-lane="quick" data-title="${title}" tabindex="0" role="button">
        <span class="quick-capture-note-icon" aria-hidden="true"><svg viewBox="0 0 16 20"><rect x="2" y="1.5" width="12" height="17" rx="2"></rect><path d="M5 7h6M5 11h6"></path></svg></span>
        <span class="task-copy"><strong>${title}</strong><span>速记 · ${escapeHtml(time)}</span></span>
      </article>
    `;
  }

  function updateCount(count = currentSnapshot.items.length) {
    todayTaskCount.textContent = String(Math.max(0, count));
    emptyState.classList.toggle("is-visible", count === 0);
    taskList.hidden = count === 0;
  }

  function applyAppearance(value) {
    const appearance = value && typeof value === "object" ? value : {};
    const fontSize = Number(appearance.fontSize);
    document.documentElement.dataset.theme = appearance.theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.zhFont = appearance.zhFont || "system";
    document.documentElement.dataset.enFont = appearance.enFont || "inter";
    document.documentElement.style.setProperty(
      "--widget-font-scale",
      String(Number.isFinite(fontSize) ? Math.max(12, Math.min(24, fontSize)) / 16.5 : 1),
    );
  }

  function renderSnapshot(value) {
    currentSnapshot = value && typeof value === "object" ? value : { date: "", items: [], quickCaptures: [], quickCaptureTotal: 0, groups: [] };
    const items = Array.isArray(currentSnapshot.items) ? currentSnapshot.items : [];
    const captures = Array.isArray(currentSnapshot.quickCaptures) ? currentSnapshot.quickCaptures : [];
    currentSnapshot.items = items;
    currentSnapshot.quickCaptures = captures;
    currentSnapshot.groups = Array.isArray(currentSnapshot.groups) ? currentSnapshot.groups : [];
    applyAppearance(currentSnapshot.appearance);
    taskList.innerHTML = items.map(taskHtml).join("");
    quickCaptureList.innerHTML = captures.map(quickCaptureHtml).join("");
    const total = Math.max(captures.length, Number(currentSnapshot.quickCaptureTotal) || 0);
    quickCaptureSection.hidden = total === 0;
    quickCaptureCount.textContent = String(total);
    const overflow = Math.max(0, total - captures.length);
    quickCaptureOverflow.hidden = overflow === 0;
    quickCaptureOverflow.textContent = overflow ? `还有 ${overflow} 条在任务仓库` : "";
    bindTaskRows();
    updateCount(items.length);
  }

  function applyOpacity(value) {
    const opacity = Number(value);
    const percentage = Number.isFinite(opacity) ? Math.max(70, Math.min(100, Math.round(opacity))) : 100;
    widget.style.setProperty("--widget-opacity", String(percentage / 100));
    opacityControl.value = String(percentage);
    opacityValue.textContent = `${percentage}%`;
  }

  function syncAlwaysOnTopControl(enabled) {
    const pinned = enabled !== false;
    alwaysOnTop.checked = pinned;
    alwaysOnTopToggle?.setAttribute("aria-pressed", String(pinned));
    alwaysOnTopToggle?.setAttribute("aria-label", pinned ? "取消置顶" : "始终置顶");
    alwaysOnTopToggle?.setAttribute("title", pinned ? "取消置顶" : "始终置顶");
    widget.classList.toggle("is-unpinned", !pinned);
  }

  function applyWindowState(value) {
    const state = value && typeof value === "object" ? value : {};
    const position = ["top-left", "top-right", "bottom-left", "bottom-right", "custom"].includes(state.position)
      ? state.position
      : "top-right";
    widget.dataset.position = position;
    widget.classList.toggle("is-compact", state.compact === true);
    syncAlwaysOnTopControl(state.alwaysOnTop);
    widget.classList.toggle("is-click-through", state.clickThrough === true);
    clickThrough.checked = state.clickThrough === true;
    clickThroughHint.hidden = state.clickThrough !== true;
    quickCaptureInput.value = String(state.quickCaptureDraft || "");
    autosizeCaptureInput();
    launchWithApp.checked = state.launchWithApp !== false;
    applyOpacity(state.opacity);
    compactToggle.title = state.compact ? "展开" : "收起";
    compactToggle.setAttribute("aria-label", state.compact ? "展开今日窗口" : "收起今日窗口");
    document.querySelectorAll("[data-place]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.place === position);
    });
  }

  function autosizeCaptureInput() {
    quickCaptureInput.style.height = "0px";
    quickCaptureInput.style.height = `${Math.min(72, Math.max(24, quickCaptureInput.scrollHeight))}px`;
  }

  function persistCaptureDraft() {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(() => {
      void bridge.setPreferences({ quickCaptureDraft: quickCaptureInput.value.slice(0, 4000) });
    }, 260);
  }

  function parseCaptureDraft() {
    const lines = quickCaptureInput.value.replaceAll("\r", "").split("\n");
    return { title: String(lines.shift() || "").trim(), description: lines.join("\n").trim() };
  }

  async function submitQuickCapture(addToToday = false) {
    if (captureSubmitting) return;
    const draft = parseCaptureDraft();
    if (!draft.title) return;
    captureSubmitting = true;
    const result = await bridge.createTask({ ...draft, addToToday });
    captureSubmitting = false;
    if (!result?.success) {
      showToast(result?.code === "INVALID_TITLE" ? "请输入速记标题" : "速记保存失败，请稍后重试");
      return;
    }
    quickCaptureInput.value = "";
    autosizeCaptureInput();
    void bridge.setPreferences({ quickCaptureDraft: "" });
    showToast(addToToday ? "已保存并加入今日任务" : "已保存到速记");
  }

  function cancelInlineEdit() {
    if (!editingInput) return;
    const row = editingInput.closest(".today-task");
    const title = row?.dataset.title || "未命名任务";
    const strong = document.createElement("strong");
    strong.textContent = title;
    editingInput.replaceWith(strong);
    row?.classList.remove("is-editing");
    editingInput = null;
    editingTaskId = "";
    setTextEditing(false);
  }

  async function saveInlineEdit() {
    if (!editingInput) return;
    const input = editingInput;
    const row = input.closest(".today-task");
    const taskId = row?.dataset.taskId || "";
    const title = input.value.trim();
    if (!taskId || !title) {
      cancelInlineEdit();
      return;
    }
    const result = await bridge.updateTaskTitle({ taskId, title });
    if (!result?.success) {
      showToast(result?.code === "INVALID_TITLE" ? "标题不能为空" : "标题保存失败");
      return;
    }
    row.classList.remove("is-editing");
    editingInput = null;
    editingTaskId = "";
    setTextEditing(false);
    if (queuedSnapshot) {
      const nextSnapshot = queuedSnapshot;
      queuedSnapshot = null;
      renderSnapshot(nextSnapshot);
    }
    showToast("已同步修改");
  }

  function beginInlineEdit(row) {
    if (editingInput || !row) return;
    const strong = row.querySelector(".task-copy strong");
    if (!strong) return;
    const input = document.createElement("input");
    input.className = "task-inline-input";
    input.value = strong.textContent || "";
    input.maxLength = 240;
    input.setAttribute("aria-label", row.classList.contains("quick-capture-item") ? "编辑速记" : "编辑任务标题");
    strong.replaceWith(input);
    row.classList.add("is-editing");
    editingTaskId = row.dataset.taskId || "";
    editingInput = input;
    setTextEditing(true);
    let composing = false;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelInlineEdit();
      } else if (event.key === "Enter" && !composing && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        void saveInlineEdit();
      }
    });
    input.addEventListener("blur", () => void saveInlineEdit());
    input.focus();
    input.select();
  }

  function sendResize(height, edge) {
    pendingResizeHeight = height;
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      void bridge.resize({ height: pendingResizeHeight, edge });
    });
  }

  function beginResize(event) {
    if (widget.classList.contains("is-compact") || event.button !== 0) return;
    const handle = event.currentTarget;
    resizeGesture = {
      edge: handle.dataset.widgetResize,
      pointerId: event.pointerId,
      startY: event.screenY,
      startHeight: window.innerHeight,
    };
    handle.setPointerCapture(event.pointerId);
    widget.classList.add("is-resizing");
    document.body.classList.add("is-resizing-widget");
    event.preventDefault();
  }

  function continueResize(event) {
    if (!resizeGesture || event.pointerId !== resizeGesture.pointerId) return;
    const delta = event.screenY - resizeGesture.startY;
    const height = resizeGesture.edge === "top"
      ? resizeGesture.startHeight - delta
      : resizeGesture.startHeight + delta;
    sendResize(height, resizeGesture.edge);
  }

  function finishResize(event) {
    if (!resizeGesture || event.pointerId !== resizeGesture.pointerId) return;
    const handle = event.currentTarget;
    const delta = event.screenY - resizeGesture.startY;
    const height = event.type === "pointercancel"
      ? pendingResizeHeight || resizeGesture.startHeight
      : resizeGesture.edge === "top"
        ? resizeGesture.startHeight - delta
        : resizeGesture.startHeight + delta;
    sendResize(height, resizeGesture.edge);
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    resizeGesture = null;
    widget.classList.remove("is-resizing");
    document.body.classList.remove("is-resizing-widget");
  }

  function closeContextMenu() {
    contextTaskId = "";
    todayContextMenu.hidden = true;
  }

  function openContextMenu(event, row) {
    if (!row.classList.contains("quick-capture-item")) return;
    event.preventDefault();
    closeMenu();
    closeGroupMenu();
    contextTaskId = row.dataset.taskId || "";
    todayContextMenu.hidden = false;
    const menuRect = todayContextMenu.getBoundingClientRect();
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuRect.width - 8));
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuRect.height - 8));
    todayContextMenu.style.left = `${left}px`;
    todayContextMenu.style.top = `${top}px`;
  }

  function clearDropIndicators() {
    document.querySelectorAll(".today-task.drag-over-before, .today-task.drag-over-after").forEach((row) => {
      row.classList.remove("drag-over-before", "drag-over-after");
    });
    document.querySelectorAll(".widget-section.is-drop-target").forEach((section) => {
      section.classList.remove("is-drop-target");
    });
  }

  function cleanupRowDrag() {
    if (!rowDragState) return;
    window.clearTimeout(rowDragState.timer);
    rowDragState.row.classList.remove("is-dragging");
    widget.classList.remove("is-item-dragging");
    clearDropIndicators();
    if (currentSnapshot.quickCaptures.length === 0) quickCaptureSection.hidden = true;
    rowDragState = null;
  }

  function rowLane(row) {
    return row?.dataset?.lane === "quick" ? "quick" : "task";
  }

  function findDropTarget(clientX, clientY, sourceRow) {
    const element = document.elementFromPoint(clientX, clientY);
    const targetRow = element?.closest?.(".today-task");
    if (targetRow && targetRow !== sourceRow) {
      const bounds = targetRow.getBoundingClientRect();
      return {
        targetTaskId: targetRow.dataset.taskId || "",
        targetLane: rowLane(targetRow),
        position: clientY < bounds.top + bounds.height / 2 ? "before" : "after",
        targetRow,
      };
    }
    const section = element?.closest?.(".widget-section");
    if (section === quickCaptureSection) return { targetTaskId: "", targetLane: "quick", position: "after", targetRow: null };
    if (section === todayTaskSection) return { targetTaskId: "", targetLane: "task", position: "after", targetRow: null };
    return null;
  }

  function updateDropTarget(target) {
    clearDropIndicators();
    if (!target) return;
    const section = target.targetLane === "quick" ? quickCaptureSection : todayTaskSection;
    section.classList.add("is-drop-target");
    target.targetRow?.classList.add(target.position === "before" ? "drag-over-before" : "drag-over-after");
    if (target.targetRow) section.classList.remove("is-drop-target");
  }

  function startRowDrag() {
    if (!rowDragState || rowDragState.dragging) return;
    rowDragState.dragging = true;
    rowDragState.row.classList.add("is-dragging");
    widget.classList.add("is-item-dragging");
    suppressRowClickUntil = Date.now() + 900;
    if (currentSnapshot.quickCaptures.length === 0) quickCaptureSection.hidden = false;
    rowDragState.dropTarget = null;
  }

  function handleRowPointerDown(event) {
    if (event.button !== 0 || editingInput || event.target.closest("button, input, textarea")) return;
    const row = event.currentTarget;
    window.clearTimeout(rowDragState?.timer);
    rowDragState = {
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      dropTarget: null,
      timer: window.setTimeout(startRowDrag, LONG_PRESS_DELAY),
    };
    row.setPointerCapture?.(event.pointerId);
  }

  function handleRowPointerMove(event) {
    if (!rowDragState || event.pointerId !== rowDragState.pointerId) return;
    const distance = Math.hypot(event.clientX - rowDragState.startX, event.clientY - rowDragState.startY);
    if (!rowDragState.dragging) {
      if (distance > DRAG_START_DISTANCE) {
        window.clearTimeout(rowDragState.timer);
        rowDragState = null;
      }
      return;
    }
    event.preventDefault();
    rowDragState.dropTarget = findDropTarget(event.clientX, event.clientY, rowDragState.row);
    updateDropTarget(rowDragState.dropTarget);
  }

  async function handleRowPointerUp(event) {
    if (!rowDragState || event.pointerId !== rowDragState.pointerId) return;
    const state = rowDragState;
    window.clearTimeout(state.timer);
    if (!state.dragging) {
      rowDragState = null;
      return;
    }
    event.preventDefault();
    const target = state.dropTarget || findDropTarget(event.clientX, event.clientY, state.row);
    const taskId = state.row.dataset.taskId || "";
    const sourceLane = rowLane(state.row);
    const validTarget = target && !(target.targetRow === state.row);
    cleanupRowDrag();
    if (!validTarget || !taskId || (target.targetLane === sourceLane && target.targetTaskId === taskId)) return;
    const result = await bridge.moveItem?.({
      taskId,
      sourceLane,
      targetLane: target.targetLane,
      targetTaskId: target.targetTaskId,
      position: target.position,
    });
    if (!result?.success && result?.code !== "BOUNDARY") showToast("顺序调整失败，请稍后重试");
  }

  function handleRowPointerCancel(event) {
    if (!rowDragState || event.pointerId !== rowDragState.pointerId) return;
    cleanupRowDrag();
  }

  function bindTaskRows() {
    document.querySelectorAll(".today-task").forEach((row) => {
      let clickTimer = 0;
      row.addEventListener("click", (event) => {
        if (Date.now() < suppressRowClickUntil || event.target.closest(".task-check, .task-inline-input")) return;
        window.clearTimeout(clickTimer);
        // Keep quick captures explicitly single-click editable. They share
        // the task row shell, but are a capture/edit surface rather than a
        // navigation-only item.
        const editDelay = row.classList.contains("quick-capture-item") ? 120 : 220;
        clickTimer = window.setTimeout(() => beginInlineEdit(row), editDelay);
      });
      row.addEventListener("dblclick", (event) => {
        if (Date.now() < suppressRowClickUntil || event.target.closest(".task-check, .task-inline-input")) return;
        event.preventDefault();
        window.clearTimeout(clickTimer);
        void bridge.openMain(row.dataset.taskId);
      });
      row.addEventListener("contextmenu", (event) => openContextMenu(event, row));
      row.addEventListener("pointerdown", handleRowPointerDown);
      row.addEventListener("pointermove", handleRowPointerMove);
      row.addEventListener("pointerup", handleRowPointerUp);
      row.addEventListener("pointercancel", handleRowPointerCancel);
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (event.key === "Enter") beginInlineEdit(row);
      });
      row.querySelector(".task-check")?.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (completingTaskId) return;
        completingTaskId = row.dataset.taskId;
        row.classList.add("is-completing");
        const quickCapture = row.classList.contains("quick-capture-item");
        if (!quickCapture) updateCount(Math.max(0, currentSnapshot.items.length - 1));
        const result = await bridge.completeTask(completingTaskId);
        if (result?.success) {
          showToast(`已完成「${row.dataset.title}」· 将同步到主窗口`);
          window.setTimeout(() => {
            completingTaskId = "";
            renderSnapshot(queuedSnapshot || currentSnapshot);
            queuedSnapshot = null;
          }, 190);
          return;
        }
        completingTaskId = "";
        row.classList.remove("is-completing");
        if (!quickCapture) updateCount();
        if (result?.code === "CONCLUSION_REQUIRED") {
          showToast("请先补充结论，已在主窗口打开该任务");
        } else if (result?.code === "FLOW_INCOMPLETE") {
          showToast("请先完成全部处理流节点，已在主窗口打开该任务");
        } else {
          showToast("任务状态未更新，请稍后重试");
        }
        if (queuedSnapshot) {
          renderSnapshot(queuedSnapshot);
          queuedSnapshot = null;
        }
      });
    });
  }

  quickCaptureInput.addEventListener("input", () => {
    autosizeCaptureInput();
    persistCaptureDraft();
  });
  quickCaptureInput.addEventListener("focus", () => setTextEditing(true));
  quickCaptureInput.addEventListener("blur", () => setTextEditing(false));
  quickCaptureInput.addEventListener("compositionstart", () => { quickCaptureInput.dataset.composing = "true"; });
  quickCaptureInput.addEventListener("compositionend", () => { quickCaptureInput.dataset.composing = "false"; });
  quickCaptureInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || quickCaptureInput.dataset.composing === "true" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submitQuickCapture(event.ctrlKey || event.metaKey);
  });
  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    syncCompactMenuWindow(open);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#widget-menu, #menu-toggle")) closeMenu();
    if (!event.target.closest("#quick-capture-group-menu, .quick-capture-promote")) closeGroupMenu();
    if (!event.target.closest("#today-context-menu, .quick-capture-item")) closeContextMenu();
  });

  window.addEventListener("blur", () => {
    closeMenu();
    closeGroupMenu();
    closeContextMenu();
    cleanupRowDrag();
  });

  window.addEventListener("focus", () => {
    // Switching applications does not clear the DOM activeElement on macOS.
    // If the user returns directly to an editor, restore the IME-safe level.
    if (isTextEditingTarget(document.activeElement)) void bridge.setEditing?.(true);
  });

  quickCaptureGroupMenu.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-promote-group]");
    if (!button || !promotingTaskId) return;
    const group = currentSnapshot.groups.find((item) => item.id === button.dataset.promoteGroup);
    if (!group) return;
    button.disabled = true;
    const result = await bridge.promoteQuickCapture?.({ taskId: promotingTaskId, groupId: group.id });
    closeGroupMenu();
    showToast(result?.success ? `已升级为任务并移入「${group.title}」` : "升级失败，请稍后重试");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeGroupMenu();
      closeContextMenu();
      cleanupRowDrag();
    }
  });

  deleteQuickCaptureButton.addEventListener("click", async () => {
    const taskId = contextTaskId;
    closeContextMenu();
    if (!taskId) return;
    const result = await bridge.deleteQuickCapture?.({ taskId });
    if (result?.code === "DELETE_CANCELLED") return;
    showToast(result?.success ? "速记已删除" : "速记删除失败，请稍后重试");
  });

  document.querySelectorAll("[data-place]").forEach((button) => {
    button.addEventListener("click", async () => {
      widget.dataset.position = button.dataset.place;
      document.querySelectorAll("[data-place]").forEach((item) => item.classList.toggle("is-active", item === button));
      closeMenu();
      await bridge.setPreferences({ position: button.dataset.place });
    });
  });

  compactToggle.addEventListener("click", async () => {
    const compact = !widget.classList.contains("is-compact");
    widget.classList.toggle("is-compact", compact);
    widget.classList.remove("is-capture-open");
    compactToggle.title = compact ? "展开" : "收起";
    compactToggle.setAttribute("aria-label", compact ? "展开今日窗口" : "收起今日窗口");
    closeMenu();
    await bridge.setPreferences({ compact });
  });

  alwaysOnTop.addEventListener("change", async (event) => {
    const pinned = event.target.checked === true;
    syncAlwaysOnTopControl(pinned);
    showToast(pinned ? "已开启始终置顶" : "已关闭始终置顶");
    await bridge.setPreferences({ alwaysOnTop: pinned });
  });

  alwaysOnTopToggle?.addEventListener("click", async () => {
    const pinned = alwaysOnTop.checked !== true;
    syncAlwaysOnTopControl(pinned);
    showToast(pinned ? "已开启始终置顶" : "已关闭始终置顶");
    await bridge.setPreferences({ alwaysOnTop: pinned });
  });

  clickThrough.addEventListener("change", async (event) => {
    const enabled = event.target.checked === true;
    showToast(enabled ? "已开启鼠标穿透 · ⌘/Ctrl + Shift + T 可恢复" : "已恢复浮窗操作");
    await bridge.setPreferences({ clickThrough: enabled });
  });

  launchWithApp.addEventListener("change", async (event) => {
    showToast(event.target.checked ? "将随应用启动" : "已取消随应用启动");
    await bridge.setPreferences({ launchWithApp: event.target.checked });
  });

  opacityControl.addEventListener("input", (event) => applyOpacity(event.target.value));
  opacityControl.addEventListener("change", async (event) => {
    const opacity = Number(event.target.value);
    showToast(`窗口透明度 ${opacity}%`);
    await bridge.setPreferences({ opacity });
  });

  document.querySelector("#hide-widget").addEventListener("click", () => {
    closeMenu();
    void bridge.hide();
  });

  document.querySelectorAll("#open-main").forEach((button) => {
    button.addEventListener("click", () => void bridge.openMain(""));
  });

  document.querySelectorAll("[data-widget-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", beginResize);
    handle.addEventListener("pointermove", continueResize);
    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
  });

  bridge.onSnapshot((value) => {
    if (completingTaskId || editingTaskId) queuedSnapshot = value;
    else renderSnapshot(value);
  });
  bridge.onState(applyWindowState);

  void bridge.getState().then((state) => {
    applyWindowState(state);
    renderSnapshot(state.snapshot);
  });
})();
