(() => {
  "use strict";

  const model = globalThis.LoopWorkNavigationModel;
  const bridge = globalThis.LoopWorkNavigationBridge;
  const gate = globalThis.personalTaskTrack?.workRhythm;
  const ENABLED_KEY = "loop-work-rhythm-v1:enabled";
  const WEEKDAYS = [[1, "一"], [2, "二"], [3, "三"], [4, "四"], [5, "五"], [6, "六"], [0, "日"]];
  const ui = { enabled: localStorage.getItem(ENABLED_KEY) === "1", overlay: null, returnFocus: null, queueTab: "work" };
  if (!model || !bridge) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const taskById = (data, id) => data.tasks.find((task) => task.id === id) || null;
  const groupById = (data, id) => data.groups.find((group) => group.id === id) || null;
  const snapshot = () => { try { return bridge.snapshot(); } catch (_) { return null; } };

  function icon(name) {
    const paths = {
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      queue: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
      settings: '<path d="M4 6h8M16 6h4M14 4v4M4 12h3M11 12h9M9 10v4M4 18h10M18 18h2M16 16v4"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
  }

  function timeHint(state) {
    if (state.mode === "weekend-ready") return "等待开始";
    if (state.mode === "off-day") return "今日未安排";
    if (state.mode === "ended") return "今日已结束";
    if (state.mode === "next" || state.mode === "gap") return `${state.remainingMinutes} 分钟后开始`;
    return `剩余 ${state.remainingMinutes} 分钟`;
  }

  function phaseView(data) {
    const state = model.resolvePhase(new Date(), data.navigation);
    const type = state.phase?.type || "idle";
    const kind = type === "growth" ? "growth" : "work";
    const queueIds = kind === "growth" ? data.growthTaskIds : data.workTaskIds;
    const activeId = kind === "growth" ? data.activeGrowthTaskId : data.activeWorkTaskId;
    const task = taskById(data, activeId);
    const source = groupById(data, data.navigation.config.growth.sourceGroupId);
    const paused = type === "break" || type === "meeting";
    let title = task?.title || (kind === "growth" ? "学习队列已完成" : "工作队列已完成");
    let support = task ? `下一步：${model.resolveNextAction(task)}` : "队列中没有可执行任务";
    if (paused) {
      title = type === "meeting" ? "参加周例会" : state.phase?.id === "rest" ? "离开屏幕，恢复注意力" : "暂时离开工作队列";
      support = `队列保持原顺序，${state.phase?.end || "下一阶段"} 自动继续`;
    } else if (state.mode === "next" || state.mode === "gap") {
      title = `下一阶段：${state.phase?.label || "工作"}`;
      support = `${state.phase?.start || "稍后"} 开始`;
    } else if (state.mode === "ended") {
      title = "今天的时间安排已结束";
      support = "仍可从队列中手动打开任务";
    } else if (state.mode === "off-day") {
      title = "今天没有自动安排";
      support = "可以查看队列，但不会自动切换任务";
    } else if (type === "growth" && !source) {
      title = "尚未配置学习来源";
      support = "请在设置中选择一个任务分组";
    }
    return { state, type, kind, task, paused, title, support, label: state.phase?.label || "工作与成长", mark: paused ? "队列暂停" : `${kind === "growth" ? "学习" : "工作"} ${task ? 1 : 0} / ${queueIds.length}` };
  }

  function navHtml(data) {
    const view = phaseView(data);
    return `<nav class="work-rhythm-rail" aria-label="工作与个人成长导航"><button class="work-rhythm-pill" type="button" data-wr-action="current" aria-haspopup="dialog" title="查看当前阶段"><i aria-hidden="true"></i><strong>${esc(view.label)}</strong><span>·</span><b>${esc(timeHint(view.state))}</b></button></nav>`;
  }

  function syncNav() {
    const workspace = document.querySelector(".workspace");
    if (!workspace) return;
    const old = workspace.querySelector(":scope > .work-rhythm-rail");
    if (!ui.enabled) { old?.remove(); return; }
    const data = snapshot();
    if (!data) return;
    const template = document.createElement("template");
    template.innerHTML = navHtml(data);
    const next = template.content.firstElementChild;
    if (!old) workspace.prepend(next);
    else if (old.outerHTML !== next.outerHTML) old.replaceWith(next);
  }

  function closeOverlay({ restoreFocus = true } = {}) {
    ui.overlay?.remove(); ui.overlay = null;
    if (restoreFocus && ui.returnFocus?.isConnected) ui.returnFocus.focus();
    ui.returnFocus = null;
  }

  function showOverlay(content, extra = "") {
    const returnFocus = document.activeElement;
    closeOverlay({ restoreFocus: false });
    const layer = document.createElement("div");
    layer.className = `wr-overlay ${extra}`.trim(); layer.innerHTML = content;
    document.body.append(layer); ui.overlay = layer; ui.returnFocus = returnFocus;
    requestAnimationFrame(() => layer.querySelector("button:not([disabled]),input:not([disabled]),select:not([disabled])")?.focus());
    return layer;
  }

  function currentPanel() {
    const data = snapshot(); if (!data) return;
    const view = phaseView(data);
    const canAct = view.state.mode === "active" && !view.paused && (view.type === "work" || view.type === "growth") && view.task;
    const actions = canAct
      ? `<button type="button" data-wr-queue-action="skip" data-kind="${view.kind}">跳过一次</button><button type="button" data-wr-queue-action="defer" data-kind="${view.kind}">移至末尾</button><button class="danger" type="button" data-wr-queue-action="block" data-kind="${view.kind}">卡住</button><button class="primary" type="button" data-wr-action="complete" data-kind="${view.kind}">完成并继续</button>`
      : `<button type="button" data-wr-view="schedule">查看全天安排</button><button type="button" data-wr-view="queue">查看任务队列</button>`;
    showOverlay(`<section class="wr-current-panel" role="dialog" aria-modal="true" aria-label="当前阶段详情"><header><span>${esc(view.mark)}</span><div class="wr-panel-tools"><button class="wr-icon-button" type="button" data-wr-view="schedule" aria-label="全天安排" title="全天安排">${icon("calendar")}</button><button class="wr-icon-button" type="button" data-wr-view="queue" aria-label="任务队列" title="任务队列">${icon("queue")}</button><button class="wr-icon-button" type="button" data-wr-view="settings" aria-label="导航设置" title="导航设置">${icon("settings")}</button><button class="wr-icon-button" type="button" data-wr-close aria-label="关闭" title="关闭">${icon("close")}</button></div></header><main><div><h2>${esc(view.title)}</h2><p>${esc(view.support)}</p></div><aside><strong>${esc(timeHint(view.state))}</strong><span>${esc(view.state.phase ? `${view.state.phase.start}–${view.state.phase.end}` : "")}</span></aside></main><footer>${actions}</footer></section>`, "wr-current-layer");
  }

  function scheduleDialog() {
    const data = snapshot(); if (!data) return;
    const current = model.resolvePhase(new Date(), data.navigation);
    const phases = model.phasesForDate(data.navigation, new Date());
    const total = phases.reduce((sum, phase) => sum + Math.max(0, model.minutes(phase.end) - model.minutes(phase.start)), 0) || 1;
    const paused = current.phase?.type === "break" || current.phase?.type === "meeting";
    showOverlay(`<section class="wr-dialog wr-schedule-dialog" role="dialog" aria-modal="true" aria-label="今日安排"><header><div><h3>今日安排</h3><p>${new Date().getDay() === 5 ? "周五 · 含 15:00–16:00 周例会" : "普通工作日 · 含下午休息与学习过渡"}</p></div><button class="wr-icon-button" type="button" data-wr-close aria-label="关闭">${icon("close")}</button></header><main><div class="wr-timeline">${phases.map((phase) => `<i class="${phase.type}" style="width:${((model.minutes(phase.end) - model.minutes(phase.start)) / total) * 100}%"></i>`).join("")}</div><div class="wr-phase-list">${phases.map((phase) => {
      const selectable = !paused && (phase.type === "work" || phase.type === "growth");
      return `<button type="button" class="${current.phase?.id === phase.id ? "active" : ""}" ${selectable ? `data-wr-select-phase="${phase.id}"` : "disabled"}><span><strong>${esc(phase.label)}</strong><small>${phase.start}–${phase.end}</small></span><b>${current.phase?.id === phase.id ? "当前" : selectable ? "进入" : "自动"}</b></button>`;
    }).join("")}</div></main><footer><span>${paused ? "固定阶段结束后自动恢复，期间仅可查看" : "手动选择将在下一个时间边界恢复自动导航"}</span><button type="button" data-wr-view="settings">编辑安排</button></footer></section>`);
  }

  function queueFor(data, kind) {
    const ids = kind === "growth" ? data.growthTaskIds : data.workTaskIds;
    return ids.map((id) => taskById(data, id)).filter(Boolean);
  }

  function queueDialog(kind = ui.queueTab) {
    const data = snapshot(); if (!data) return;
    ui.queueTab = kind;
    const view = phaseView(data);
    const queue = queueFor(data, kind);
    const activeKind = view.type === "growth" ? "growth" : "work";
    const interactive = view.state.mode === "active" && !view.paused && activeKind === kind;
    const source = groupById(data, data.navigation.config.growth.sourceGroupId);
    showOverlay(`<section class="wr-dialog wr-queue-dialog" role="dialog" aria-modal="true" aria-label="调整任务队列"><header><div><h3>调整任务队列</h3><p>工作来自学习分组之外的全部未完成任务；学习来自“${esc(source?.title || "未配置")}”分组。</p></div><button class="wr-icon-button" type="button" data-wr-close aria-label="关闭">${icon("close")}</button></header><main><div class="wr-queue-toolbar"><div class="wr-task-tabs"><button class="${kind === "work" ? "active" : ""}" type="button" data-wr-queue-tab="work">工作队列 <b>${data.workTaskIds.length}</b></button><button class="${kind === "growth" ? "active" : ""}" type="button" data-wr-queue-tab="growth">学习队列 <b>${data.growthTaskIds.length}</b></button></div><div class="wr-queue-actions"><button type="button" data-wr-queue-action="skip" data-kind="${kind}" ${interactive && queue.length > 1 ? "" : "disabled"}>跳过一次</button><button type="button" data-wr-queue-action="defer" data-kind="${kind}" ${interactive && queue.length > 1 ? "" : "disabled"}>移至末尾</button><button class="danger" type="button" data-wr-queue-action="block" data-kind="${kind}" ${interactive && queue.length ? "" : "disabled"}>卡住</button></div></div><div class="wr-task-list">${queue.map((task, index) => `<button type="button" class="${index === 0 && interactive ? "current" : ""}" data-wr-choose-task="${task.id}" data-kind="${kind}" ${!interactive || index === 0 ? "disabled" : ""}><span class="wr-rank">${String(index + 1).padStart(2, "0")}</span><span><strong>${esc(task.title)}</strong><small>${esc(model.resolveNextAction(task))}</small></span><b>${index === 0 && interactive ? "当前" : interactive ? "现在开始" : "稍后"}</b></button>`).join("") || '<p class="wr-empty">队列中没有未完成任务。</p>'}</div></main><footer><span>${kind === "work" ? "排序：逾期 → Today 临近截止 → Today 高优先级 → 其他" : `排序：${esc(source?.title || "学习来源")}分组顺序`}</span><button type="button" data-wr-close>完成</button></footer></section>`);
  }

  function scheduleFields(schedule) {
    const points = [["工作开始", "workStart"], ["上午结束", "morningEnd"], ["下午开始", "afternoonStart"], ["休息开始", "restStart"], ["休息结束", "restEnd"], ["学习过渡", "transitionStart"], ["学习开始", "learningStart"], ["学习结束", "learningEnd"]];
    return points.map(([label, key]) => `<label><span>${label}</span><input type="time" value="${schedule[key]}" data-wr-schedule="${key}"></label>`).join("");
  }

  function importDialog(event) {
    const data = snapshot(); if (!data) return;
    const requestedGroupId = event?.detail?.groupId || "";
    const initialGroup = groupById(data, requestedGroupId) || data.groups[0];
    if (!initialGroup) return toast("请先创建一个任务分组");
    const draft = {
      raw: "",
      groupId: initialGroup.id,
      defaultEstimateMinutes: 60,
      preview: null,
      selectedKeys: new Set(),
      estimateMinutesByKey: {},
    };
    const layer = showOverlay("");
    const sourceId = data.navigation.config.growth.sourceGroupId;
    const durationOptions = (value) => [...new Set([30, 45, 60, 90, Number(value)])]
      .filter((minutes) => Number.isFinite(minutes) && minutes > 0)
      .sort((a, b) => a - b)
      .map((minutes) => `<option value="${minutes}" ${minutes === Number(value) ? "selected" : ""}>${minutes} 分钟</option>`).join("");

    function inspectEntry() {
      const textarea = layer.querySelector("[data-wr-batch-input]");
      const group = layer.querySelector("[data-wr-batch-group]");
      const minutes = layer.querySelector("[data-wr-batch-minutes]");
      const status = layer.querySelector("[data-wr-batch-status]");
      const previewButton = layer.querySelector("[data-wr-batch-preview]");
      if (!textarea || !group || !minutes || !status || !previewButton) return;
      draft.raw = textarea.value;
      draft.groupId = group.value;
      draft.defaultEstimateMinutes = Number(minutes.value) || 60;
      const result = model.previewTaskBatchImport(draft.raw, data.tasks, {
        groupId: draft.groupId,
        defaultEstimateMinutes: draft.defaultEstimateMinutes,
      });
      draft.preview = result;
      if (!draft.raw.trim()) {
        status.className = "wr-batch-status";
        status.textContent = "每行一项任务";
        previewButton.disabled = true;
      } else if (!result.valid) {
        status.className = "wr-batch-status error";
        status.textContent = result.errors[0]?.message || "任务列表无效";
        previewButton.disabled = true;
      } else {
        status.className = "wr-batch-status";
        status.textContent = `识别到 ${result.items.length} 项`;
        previewButton.disabled = false;
      }
      const sourceNote = layer.querySelector("[data-wr-batch-source]");
      if (sourceNote) {
        sourceNote.classList.toggle("muted", draft.groupId !== sourceId);
        sourceNote.innerHTML = draft.groupId === sourceId
          ? "<i aria-hidden=\"true\"></i><span>该分组是个人成长阶段的任务来源</span>"
          : "<span>该分组不会进入个人成长队列</span>";
      }
    }

    function renderEntry() {
      layer.innerHTML = `<section class="wr-dialog wr-batch-dialog" role="dialog" aria-modal="true" aria-label="批量添加任务"><header><div><h3>批量添加任务</h3><p>把任务列表粘贴到当前分组</p></div><button class="wr-icon-button" type="button" data-wr-close aria-label="关闭">${icon("close")}</button></header><main><div class="wr-batch-fields"><label><span>添加到</span><select data-wr-batch-group>${data.groups.map((group) => `<option value="${esc(group.id)}" ${group.id === draft.groupId ? "selected" : ""}>${esc(group.title)}</option>`).join("")}</select></label><label><span>默认时长</span><select data-wr-batch-minutes>${durationOptions(draft.defaultEstimateMinutes)}</select></label></div><p class="wr-batch-source" data-wr-batch-source></p><div class="wr-batch-input-head"><span>任务列表</span><label class="wr-batch-file">选择 JSON / 文本文件<input type="file" accept="application/json,.json,text/plain,.txt,.md" data-wr-batch-file></label></div><textarea class="wr-batch-input" data-wr-batch-input spellcheck="false" placeholder="1. 区分 RDMA、RoCE 与 InfiniBand\n2. 画出 RDMA 数据路径\n3. 理解 Queue Pair 与 QP 状态机">${esc(draft.raw)}</textarea><p class="wr-batch-format">编号、项目符号和 Markdown 复选框会自动清理。</p></main><footer><span class="wr-batch-status" data-wr-batch-status>每行一项任务</span><button type="button" data-wr-close>取消</button><button class="primary" type="button" data-wr-batch-preview disabled>预览</button></footer></section>`;
      const textarea = layer.querySelector("[data-wr-batch-input]");
      textarea?.addEventListener("input", inspectEntry);
      layer.querySelector("[data-wr-batch-group]")?.addEventListener("change", inspectEntry);
      layer.querySelector("[data-wr-batch-minutes]")?.addEventListener("change", inspectEntry);
      layer.querySelector("[data-wr-batch-file]")?.addEventListener("change", async (changeEvent) => {
        const file = changeEvent.target.files?.[0];
        if (!file || !textarea) return;
        textarea.value = await file.text();
        inspectEntry();
      });
      layer.querySelector("[data-wr-batch-preview]")?.addEventListener("click", () => {
        if (!draft.preview?.valid) return;
        draft.selectedKeys = new Set(draft.preview.newTasks.map((item) => item.key));
        draft.estimateMinutesByKey = Object.fromEntries(draft.preview.newTasks.map((item) => [item.key, item.estimateMinutes]));
        renderPreview();
      });
      inspectEntry();
      requestAnimationFrame(() => textarea?.focus({ preventScroll: true }));
    }

    function duplicateLabel(reason) {
      if (reason === "input") return "列表中重复，将跳过";
      if (reason === "origin") return "该导入项已存在，将跳过";
      return "同名任务已在分组中，将跳过";
    }

    function updatePreviewSummary() {
      const selected = draft.preview.newTasks.filter((item) => draft.selectedKeys.has(item.key));
      const totalMinutes = selected.reduce((sum, item) => sum + (Number(draft.estimateMinutesByKey[item.key]) || item.estimateMinutes), 0);
      const count = layer.querySelector("[data-wr-batch-selected-count]");
      const total = layer.querySelector("[data-wr-batch-total-time]");
      const toggle = layer.querySelector("[data-wr-batch-toggle-all]");
      const confirm = layer.querySelector("[data-wr-batch-confirm]");
      if (count) count.textContent = String(selected.length);
      if (total) total.textContent = totalMinutes % 60 === 0 ? `${totalMinutes / 60} 小时` : `${Math.floor(totalMinutes / 60)}小时${totalMinutes % 60}分`;
      if (toggle) toggle.textContent = selected.length === draft.preview.newTasks.length ? "取消全选" : "全选";
      if (confirm) { confirm.textContent = `添加 ${selected.length} 个任务`; confirm.disabled = selected.length === 0; }
    }

    function renderPreview() {
      const group = groupById(data, draft.groupId);
      const preview = draft.preview;
      layer.innerHTML = `<section class="wr-dialog wr-batch-dialog" role="dialog" aria-modal="true" aria-label="批量添加任务预览"><header><div><h3>批量添加任务</h3><p>添加到「${esc(group?.title || "未找到分组")}」</p></div><button class="wr-icon-button" type="button" data-wr-close aria-label="关闭">${icon("close")}</button></header><main><div class="wr-batch-summary"><span><b data-wr-batch-selected-count>${preview.newTasks.length}</b><small>将新增</small></span><span><b>${preview.existingTasks.length}</b><small>已存在</small></span><span><b data-wr-batch-total-time></b><small>预计总时长</small></span></div><div class="wr-batch-preview-head"><span>任务预览</span><button type="button" data-wr-batch-toggle-all>取消全选</button></div><div class="wr-batch-preview-list">${preview.items.map((item, index) => `<label class="wr-batch-preview-row ${item.duplicateReason ? "duplicate" : ""}"><input type="checkbox" data-wr-batch-select="${esc(item.key)}" ${item.duplicateReason ? "disabled" : "checked"}><span><strong>${esc(item.title)}</strong><small class="${item.duplicateReason ? "duplicate-label" : ""}">${item.duplicateReason ? duplicateLabel(item.duplicateReason) : `第 ${String(index + 1).padStart(2, "0")} 项`}</small></span><select data-wr-batch-duration="${esc(item.key)}" ${item.duplicateReason ? "disabled" : ""}>${durationOptions(item.estimateMinutes)}</select></label>`).join("")}</div></main><footer><span>确认后按当前顺序追加</span><button type="button" data-wr-batch-back>返回修改</button><button class="primary" type="button" data-wr-batch-confirm>添加任务</button></footer></section>`;
      layer.querySelectorAll("[data-wr-batch-select]").forEach((input) => input.addEventListener("change", () => {
        if (input.checked) draft.selectedKeys.add(input.dataset.wrBatchSelect);
        else draft.selectedKeys.delete(input.dataset.wrBatchSelect);
        updatePreviewSummary();
      }));
      layer.querySelectorAll("[data-wr-batch-duration]").forEach((select) => select.addEventListener("change", () => {
        draft.estimateMinutesByKey[select.dataset.wrBatchDuration] = Number(select.value) || 60;
        updatePreviewSummary();
      }));
      layer.querySelector("[data-wr-batch-toggle-all]")?.addEventListener("click", () => {
        const shouldSelect = draft.selectedKeys.size !== preview.newTasks.length;
        draft.selectedKeys = new Set(shouldSelect ? preview.newTasks.map((item) => item.key) : []);
        layer.querySelectorAll("[data-wr-batch-select]:not(:disabled)").forEach((input) => { input.checked = shouldSelect; });
        updatePreviewSummary();
      });
      layer.querySelector("[data-wr-batch-back]")?.addEventListener("click", renderEntry);
      layer.querySelector("[data-wr-batch-confirm]")?.addEventListener("click", () => {
        const result = bridge.importTaskBatch(draft.raw, {
          groupId: draft.groupId,
          defaultEstimateMinutes: draft.defaultEstimateMinutes,
          selectedKeys: [...draft.selectedKeys],
          estimateMinutesByKey: draft.estimateMinutesByKey,
        });
        if (!result.success) return toast(result.code === "GROUP_NOT_FOUND" ? "目标分组已不存在" : "任务导入失败");
        closeOverlay();
        syncNav();
        toast(`已添加 ${result.importedCount} 个任务到「${group?.title || "分组"}」`);
      });
      updatePreviewSummary();
    }

    renderEntry();
  }

  function settingsForm(data, embedded = false) {
    const config = data.navigation.config;
    return `<div class="wr-settings-form" data-wr-settings-form><fieldset><legend>工作日</legend><div class="wr-weekdays">${WEEKDAYS.map(([value, label]) => `<label><input type="checkbox" value="${value}" data-wr-workday ${config.workdays.includes(value) ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset><fieldset><legend>每日时间</legend><div class="wr-settings-points">${scheduleFields(config.schedule)}</div><p>午休和深度工作由相邻边界自动填充；每日学习至少 60 分钟。</p></fieldset><fieldset><legend>周五例会</legend><div class="wr-settings-range"><span>固定例会</span><input type="time" value="${config.schedule.fridayMeetingStart}" data-wr-schedule="fridayMeetingStart"><i>至</i><input type="time" value="${config.schedule.fridayMeetingEnd}" data-wr-schedule="fridayMeetingEnd"></div></fieldset><fieldset><legend>学习来源</legend><label class="wr-settings-source"><span>指定任务分组</span><select data-wr-growth-source><option value="">请选择分组</option>${data.groups.map((group) => `<option value="${group.id}" ${group.id === config.growth.sourceGroupId ? "selected" : ""}>${esc(group.title)}</option>`).join("")}</select></label><p>该分组的未完成任务按分组顺序进入学习队列，并从工作队列排除。</p><p class="wr-setting-error" data-wr-time-error hidden></p></fieldset>${embedded ? '<div class="wr-settings-save"><span>修改后保存生效</span><button class="primary" type="button" data-wr-save-settings>保存导航设置</button></div>' : ""}</div>`;
  }

  function settingsDialog() {
    const data = snapshot(); if (!data) return;
    showOverlay(`<section class="wr-dialog wr-settings-dialog" role="dialog" aria-modal="true" aria-label="导航设置"><header><div><h3>导航设置</h3><p>修改每日阶段与学习任务来源</p></div><button class="wr-icon-button" type="button" data-wr-close aria-label="关闭">${icon("close")}</button></header><main>${settingsForm(data)}</main><footer><button type="button" data-wr-reset-times>恢复默认</button><button class="primary" type="button" data-wr-save-settings>保存设置</button></footer></section>`);
  }

  function saveSettings(button) {
    const form = button.closest("[data-wr-settings-form]") || button.closest(".wr-dialog")?.querySelector("[data-wr-settings-form]");
    const data = snapshot(); if (!form || !data) return;
    const schedule = { ...data.navigation.config.schedule };
    form.querySelectorAll("[data-wr-schedule]").forEach((input) => { schedule[input.dataset.wrSchedule] = input.value; });
    const validation = model.validateSchedule(schedule);
    const error = form.querySelector("[data-wr-time-error]");
    if (!validation.valid) { error.hidden = false; error.textContent = validation.errors[0].message; return; }
    bridge.updateConfig({ ...data.navigation.config, workdays: [...form.querySelectorAll("[data-wr-workday]:checked")].map((input) => Number(input.value)), schedule, work: { ...data.navigation.config.work, autoAdvance: true }, growth: { ...data.navigation.config.growth, sourceGroupId: form.querySelector("[data-wr-growth-source]").value, autoAdvance: true } });
    closeOverlay(); syncNav(); toast("导航设置已保存");
  }

  function resetTimes(button) {
    const form = button.closest(".wr-dialog")?.querySelector("[data-wr-settings-form]") || button.closest("[data-wr-settings]")?.querySelector("[data-wr-settings-form]");
    if (!form) return;
    Object.entries(model.DEFAULT_SCHEDULE).forEach(([key, value]) => { const input = form.querySelector(`[data-wr-schedule="${key}"]`); if (input) input.value = value; });
    const error = form.querySelector("[data-wr-time-error]"); if (error) error.hidden = true;
  }

  function settingsHtml(data) {
    return `<section class="settings-list work-rhythm-settings" data-wr-settings><div class="settings-row"><div class="settings-row-copy"><strong>工作与成长导航</strong></div><div class="settings-row-control"><button class="settings-switch" type="button" role="switch" aria-checked="${ui.enabled}" data-wr-toggle aria-label="工作与成长导航"></button></div></div>${ui.enabled ? settingsForm(data, true) : '<p class="settings-page-note">开启后，导航会根据时间、任务仓库和学习来源分组给出下一步。</p><div class="work-rhythm-settings-unlock" data-wr-unlock-panel hidden><label>访问密码<input type="password" data-wr-password autocomplete="off"></label><button class="primary" type="button" data-wr-unlock>验证并开启</button><p data-wr-password-error hidden>密码不正确，请重试。</p></div>'}</section>`;
  }

  function syncSettings() {
    const slot = document.querySelector("[data-settings-advanced-slot]");
    if (!slot || slot.querySelector("[data-wr-settings]")) return;
    const data = snapshot(); if (data) slot.insertAdjacentHTML("beforeend", settingsHtml(data));
  }

  function toggleEnabled() {
    if (ui.enabled) { ui.enabled = false; localStorage.setItem(ENABLED_KEY, "0"); document.querySelector("[data-wr-settings]")?.remove(); syncSettings(); syncNav(); toast("工作与成长导航已关闭"); return; }
    const panel = document.querySelector("[data-wr-unlock-panel]"); if (panel) { panel.hidden = false; panel.querySelector("input")?.focus(); }
  }

  async function unlock() {
    const input = document.querySelector("[data-wr-password]");
    let ok = false; try { ok = await gate?.verifyPassword(input?.value || ""); } catch (_) {}
    if (!ok) { const error = document.querySelector("[data-wr-password-error]"); if (error) error.hidden = false; return input?.select(); }
    ui.enabled = true; localStorage.setItem(ENABLED_KEY, "1"); document.querySelector("[data-wr-settings]")?.remove(); syncSettings(); syncNav(); toast("工作与成长导航已开启");
  }

  function setQueue(kind, ids) {
    const queueKey = kind === "growth" ? "growthQueueIds" : "workQueueIds";
    const activeKey = kind === "growth" ? "activeGrowthTaskId" : "activeWorkTaskId";
    bridge.setRuntime({ [queueKey]: ids, [activeKey]: ids[0] || "" });
    if (ids[0]) bridge.openTask(ids[0], { kind });
  }

  function queueAction(action, kind) {
    const data = snapshot(); if (!data) return;
    const view = phaseView(data);
    const activeKind = view.type === "growth" ? "growth" : "work";
    if (view.state.mode !== "active" || view.paused || activeKind !== kind) return toast("当前阶段仅可查看队列");
    const ids = queueFor(data, kind).map((task) => task.id);
    const current = taskById(data, ids[0]);
    if (!current) return toast("当前没有任务");
    if (action === "block") {
      const result = bridge.blockTask(current.id, kind);
      if (result.success) toast(result.nextTaskId ? "已标记卡住，已顺移到下一项" : "已标记卡住");
    } else if (ids.length > 1) {
      const nextIds = action === "skip" ? [ids[1], ids[0], ...ids.slice(2)] : [...ids.slice(1), ids[0]];
      setQueue(kind, nextIds);
      toast(action === "skip" ? `已跳过一次，稍后会回到「${current.title}」` : `「${current.title}」已移至队尾`);
    }
    syncNav();
  }

  function complete(kind) {
    const data = snapshot(); if (!data) return;
    const taskId = kind === "growth" ? data.activeGrowthTaskId : data.activeWorkTaskId;
    if (!taskId) return toast("当前没有可完成的任务");
    const result = bridge.completeTask(taskId, kind);
    if (!result.success && result.code === "CONCLUSION_REQUIRED") toast("请先在任务中填写结论，再标记完成");
    else if (!result.success) toast("任务状态已变化，请重新选择");
    else toast(result.nextTaskId ? "已完成，已顺移到下一项" : "已完成当前任务");
    closeOverlay(); syncNav();
  }

  function chooseTask(button) {
    const data = snapshot(); if (!data) return;
    const kind = button.dataset.kind;
    const ids = queueFor(data, kind).map((task) => task.id);
    const index = ids.indexOf(button.dataset.wrChooseTask);
    if (index < 1) return;
    setQueue(kind, [ids[index], ...ids.slice(0, index), ...ids.slice(index + 1)]);
    closeOverlay(); syncNav(); toast("已切换当前任务");
  }

  function toast(message) {
    document.querySelector(".work-rhythm-toast")?.remove();
    const node = document.createElement("div"); node.className = "work-rhythm-toast"; node.textContent = message;
    document.body.append(node); setTimeout(() => node.remove(), 2200);
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-wr-action]");
    if (action?.dataset.wrAction === "current") currentPanel();
    if (action?.dataset.wrAction === "complete") complete(action.dataset.kind);
    const viewName = event.target.closest("[data-wr-view]")?.dataset.wrView;
    if (viewName === "schedule") scheduleDialog();
    if (viewName === "queue") { const data = snapshot(); if (data) queueDialog(phaseView(data).kind); }
    if (viewName === "settings") settingsDialog();
    const tab = event.target.closest("[data-wr-queue-tab]")?.dataset.wrQueueTab; if (tab) queueDialog(tab);
    const queueButton = event.target.closest("[data-wr-queue-action]");
    if (queueButton) { const kind = queueButton.dataset.kind; queueAction(queueButton.dataset.wrQueueAction, kind); if (ui.overlay?.querySelector(".wr-queue-dialog")) queueDialog(kind); else if (ui.overlay?.querySelector(".wr-current-panel")) currentPanel(); }
    const choice = event.target.closest("[data-wr-choose-task]"); if (choice) chooseTask(choice);
    const phase = event.target.closest("[data-wr-select-phase]");
    if (phase) { const data = snapshot(); bridge.setRuntime({ manualPhaseId: phase.dataset.wrSelectPhase, manualPhaseExpiresAt: model.nextBoundaryAt(new Date(), data.navigation) }); closeOverlay(); syncNav(); toast("已手动切换，将在下一时间边界恢复"); }
    if (event.target.closest("[data-wr-close]")) closeOverlay();
    if (event.target.closest("[data-wr-toggle]")) toggleEnabled();
    if (event.target.closest("[data-wr-unlock]")) unlock();
    const save = event.target.closest("[data-wr-save-settings]"); if (save) saveSettings(save);
    const reset = event.target.closest("[data-wr-reset-times]"); if (reset) resetTimes(reset);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOverlay();
    if (event.key === "Enter" && event.target.matches("[data-wr-password]")) unlock();
    if (event.key === "Tab" && ui.overlay) {
      const focusable = [...ui.overlay.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener("pointerdown", (event) => { if (ui.overlay && event.target === ui.overlay) closeOverlay(); });
  document.addEventListener("loop-work-navigation:rendered", () => { syncNav(); syncSettings(); });
  document.addEventListener("loop-task-batch:open", importDialog);
  document.addEventListener("loop-work-rhythm:disable", () => { ui.enabled = false; localStorage.setItem(ENABLED_KEY, "0"); closeOverlay(); syncNav(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNav(); });
  window.addEventListener("focus", syncNav);
  new MutationObserver(() => { syncNav(); syncSettings(); }).observe(document.getElementById("root"), { childList: true });
  window.setInterval(syncNav, 60000);
  syncNav(); syncSettings();
})();
