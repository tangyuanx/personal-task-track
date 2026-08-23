(() => {
  const bridge = window.personalTaskTrack?.todayWidget;
  if (!bridge) return;

  document.body.classList.add("widget-runtime");

  const widget = document.querySelector("#widget");
  const menu = document.querySelector("#widget-menu");
  const menuToggle = document.querySelector("#menu-toggle");
  const compactToggle = document.querySelector("#compact-toggle");
  const taskList = document.querySelector("#task-list");
  const emptyState = document.querySelector("#empty-state");
  const toast = document.querySelector("#toast");
  const alwaysOnTop = document.querySelector("#always-on-top");
  const launchWithApp = document.querySelector("#launch-with-app");
  const opacityControl = document.querySelector("#widget-opacity");
  const opacityValue = document.querySelector("#widget-opacity-value");
  let currentSnapshot = { date: "", items: [] };
  let queuedSnapshot = null;
  let completingTaskId = "";
  let toastTimer = 0;
  let resizeFrame = 0;

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
    requestWidgetResize();
  }

  function formatToday(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    const date = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : new Date();
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", weekday: "short" }).format(date);
  }

  function taskHtml(item) {
    const taskId = escapeHtml(item.taskId);
    const title = escapeHtml(item.title || "未命名任务");
    const nextText = escapeHtml(item.nextText || "补充任务背景或新增第一个节点");
    const kind = ["normal", "high", "blocked"].includes(item.kind) ? item.kind : "normal";
    const stateTitle = kind === "blocked" ? "被阻塞" : kind === "high" ? "高优先级" : "普通";
    return `
      <article class="today-task ${kind}" data-task-id="${taskId}" data-title="${title}" tabindex="0" role="button">
        <button class="task-check" type="button" aria-label="完成：${title}"></button>
        <span class="task-copy"><strong>${title}</strong><span>下一步：${nextText}</span></span>
        <i class="task-state" title="${stateTitle}"></i>
      </article>
    `;
  }

  function updateCount(count = currentSnapshot.items.length) {
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
    currentSnapshot = value && typeof value === "object" ? value : { date: "", items: [] };
    const items = Array.isArray(currentSnapshot.items) ? currentSnapshot.items.slice(0, 3) : [];
    currentSnapshot.items = items;
    applyAppearance(currentSnapshot.appearance);
    const dateElement = document.querySelector("#today-date");
    dateElement.textContent = formatToday(currentSnapshot.date);
    dateElement.dateTime = currentSnapshot.date || new Date().toISOString();
    taskList.innerHTML = items.map(taskHtml).join("");
    bindTaskRows();
    updateCount(items.length);
    requestWidgetResize();
  }

  function applyOpacity(value) {
    const opacity = Number(value);
    const percentage = Number.isFinite(opacity) ? Math.max(70, Math.min(100, Math.round(opacity))) : 100;
    widget.style.setProperty("--widget-opacity", String(percentage / 100));
    opacityControl.value = String(percentage);
    opacityValue.textContent = `${percentage}%`;
  }

  function applyWindowState(value) {
    const state = value && typeof value === "object" ? value : {};
    const position = ["top-left", "top-right", "bottom-left", "bottom-right", "custom"].includes(state.position)
      ? state.position
      : "top-right";
    widget.dataset.position = position;
    widget.classList.toggle("is-compact", state.compact === true);
    widget.classList.toggle("is-unpinned", state.alwaysOnTop === false);
    alwaysOnTop.checked = state.alwaysOnTop !== false;
    launchWithApp.checked = state.launchWithApp !== false;
    applyOpacity(state.opacity);
    compactToggle.title = state.compact ? "展开" : "收起";
    compactToggle.setAttribute("aria-label", state.compact ? "展开今日窗口" : "收起今日窗口");
    document.querySelectorAll("[data-place]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.place === position);
    });
    requestWidgetResize();
  }

  function requestWidgetResize() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      const menuHeight = menu.classList.contains("is-open") ? menu.offsetTop + menu.offsetHeight : 0;
      void bridge.resize({
        width: widget.offsetWidth,
        height: Math.max(widget.offsetHeight, menuHeight),
      });
    });
  }

  function bindTaskRows() {
    document.querySelectorAll(".today-task").forEach((row) => {
      const openTask = () => void bridge.openMain(row.dataset.taskId);
      row.addEventListener("click", (event) => {
        if (!event.target.closest(".task-check")) openTask();
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openTask();
      });
      row.querySelector(".task-check").addEventListener("click", async (event) => {
        event.stopPropagation();
        if (completingTaskId) return;
        completingTaskId = row.dataset.taskId;
        row.classList.add("is-completing");
        updateCount(Math.max(0, currentSnapshot.items.length - 1));
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
        updateCount();
        if (result?.code === "CONCLUSION_REQUIRED") {
          showToast("请先补充结论，已在主窗口打开该任务");
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

  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    requestWidgetResize();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#widget-menu, #menu-toggle")) closeMenu();
  });

  window.addEventListener("blur", closeMenu);

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
    compactToggle.title = compact ? "展开" : "收起";
    compactToggle.setAttribute("aria-label", compact ? "展开今日窗口" : "收起今日窗口");
    closeMenu();
    requestWidgetResize();
    await bridge.setPreferences({ compact });
  });

  alwaysOnTop.addEventListener("change", async (event) => {
    widget.classList.toggle("is-unpinned", !event.target.checked);
    showToast(event.target.checked ? "已开启始终置顶" : "已关闭始终置顶");
    await bridge.setPreferences({ alwaysOnTop: event.target.checked });
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

  bridge.onSnapshot((value) => {
    if (completingTaskId) queuedSnapshot = value;
    else renderSnapshot(value);
  });
  bridge.onState(applyWindowState);

  void bridge.getState().then((state) => {
    applyWindowState(state);
    renderSnapshot(state.snapshot);
  });

  new ResizeObserver(requestWidgetResize).observe(widget);
})();
