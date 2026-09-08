(() => {
  "use strict";

  const model = globalThis.LoopWorkNavigationModel;
  const bridge = globalThis.LoopWorkNavigationBridge;
  const gate = globalThis.personalTaskTrack?.workRhythm;
  const ENABLED_KEY = "loop-work-rhythm-v1:enabled";
  const WEEKDAYS = [[1, "一"], [2, "二"], [3, "三"], [4, "四"], [5, "五"], [6, "六"], [0, "日"]];
  const ui = { enabled: localStorage.getItem(ENABLED_KEY) === "1", overlay: null };
  if (!model || !bridge) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const taskById = (data, id) => data.tasks.find((task) => task.id === id) || null;
  const groupById = (data, id) => data.groups.find((group) => group.id === id) || null;
  const snapshot = () => { try { return bridge.snapshot(); } catch (_) { return null; } };

  function timeHint(state) {
    if (state.mode === "weekend-ready") return "等待开始";
    if (state.mode === "off-day") return "今日未安排";
    if (state.mode === "ended") return "本阶段已结束";
    if (state.mode === "next") return `${state.remainingMinutes} 分钟后开始`;
    if (state.mode === "gap") return `空档 · ${state.remainingMinutes} 分钟后`;
    return `${state.manual ? "手动 · " : ""}剩余 ${state.remainingMinutes} 分钟`;
  }

  function phaseView(data) {
    const state = model.resolvePhase(new Date(), data.navigation);
    const type = state.phase?.type || "idle";
    const activeId = type === "growth" ? data.activeGrowthTaskId : data.activeWorkTaskId;
    const task = taskById(data, activeId);
    const source = groupById(data, data.navigation.config.growth.sourceGroupId);
    let label = state.phase?.label || "工作与成长";
    let title = task?.title || "暂无当前任务";
    let support = task ? model.resolveNextAction(task) : "";
    let primary = { label: "选择任务", action: "pick-work" };
    let secondary = [];

    if (state.mode === "off-day") {
      title = "今天没有自动安排";
      support = "可从阶段菜单手动进入工作或个人成长";
      primary = { label: "切换阶段", action: "phase-menu" };
    } else if (state.mode === "ended") {
      title = "当前安排已结束";
      support = task ? `仍可继续：${task.title}` : "需要时可手动切换阶段";
      primary = { label: "切换阶段", action: "phase-menu" };
    } else if (state.mode === "next" || state.mode === "gap") {
      title = `下一阶段：${label}`;
      support = `${state.phase.start} 开始`;
      primary = { label: "现在进入", action: "enter-phase", phaseId: state.phase.id };
    } else if (type === "startup") {
      title = task ? `建议先做：${task.title}` : `${data.workTaskIds.length} 项今日任务待安排`;
      support = task ? model.resolveNextAction(task) : "昨日任务仅作为建议，不会自动选中";
      primary = { label: "选择首个任务", action: "pick-work", startup: true };
      if (task) secondary.push({ label: "打开当前任务", action: "open-current", kind: "work" });
    } else if (type === "work") {
      if (task) {
        title = task.title;
        support = model.resolveNextAction(task);
        primary = { label: "完成并继续", action: "complete", kind: "work" };
        secondary = [
          { label: "打开任务", action: "open-current", kind: "work" },
          { label: "切换今日任务", action: "pick-work" },
        ];
      } else {
        title = data.workTaskIds.length ? "选择一项今日任务" : "今日任务为空";
        support = data.workTaskIds.length ? `${data.workTaskIds.length} 项可执行` : "可从全部任务中选择并加入今日";
      }
      if (data.detachedWorkTask) support = `已移出 Today · ${support}`;
    } else if (type === "growth") {
      if (!source) {
        title = "尚未配置学习来源";
        support = "选择一个已有的个人成长分组作为顺序来源";
        primary = { label: "配置学习来源", action: "open-settings" };
      } else if (state.mode === "weekend-ready") {
        title = `准备学习 · ${source.title}`;
        support = `本次 ${data.navigation.config.growth.weekendDurationMinutes} 分钟`;
        primary = { label: "开始学习", action: "start-weekend" };
      } else if (task) {
        title = task.title;
        support = model.resolveNextAction(task);
        primary = { label: "继续学习", action: "open-current", kind: "growth" };
        secondary = [
          { label: "完成并继续", action: "complete", kind: "growth" },
          { label: "保存进度", action: "recovery", kind: "growth" },
        ];
      } else if (data.growthTaskIds.length) {
        title = "等待选择下一项学习任务";
        support = `${source.title} 还有 ${data.growthTaskIds.length} 项未完成`;
        primary = { label: "选择下一项", action: "pick-growth" };
      } else {
        title = `${source.title} 已全部完成`;
        support = "可以回到分组补充或导入下一阶段学习任务";
        primary = { label: "打开成长分组", action: "open-growth-group" };
        secondary = [{ label: "导入学习计划", action: "import-plan" }];
      }
    } else if (type === "close") {
      title = task ? `收束：${task.title}` : "保存今天的工作入口";
      support = task ? model.resolveNextAction(task) : "记录做到哪里和下一步，明天可直接续接";
      primary = { label: "保存恢复卡", action: "recovery", kind: "close" };
      secondary = task ? [{ label: "打开任务", action: "open-current", kind: "work" }] : [];
    }
    return { state, task, label, title, support, primary, secondary: secondary.slice(0, 2) };
  }

  function navHtml(data) {
    const view = phaseView(data);
    const recoveryMark = view.task?.navigationRecovery?.nextAction ? '<span class="wr-nav-recovery">可续接</span>' : "";
    return `<section class="work-rhythm-nav" aria-label="工作与个人成长导航">
      <button class="wr-phase" type="button" data-wr-action="phase-menu" title="切换阶段或时间"><span>${esc(view.label)}</span><strong>${esc(timeHint(view.state))}</strong><i aria-hidden="true">⌄</i></button>
      <div class="wr-current-task"><strong title="${esc(view.title)}">${esc(view.title)}</strong>${recoveryMark}<span title="${esc(view.support)}">${esc(view.support || "当前任务没有明确的下一动作")}</span></div>
      <div class="wr-nav-actions">${view.secondary.map((item) => `<button type="button" data-wr-action="${item.action}" data-kind="${item.kind || ""}">${esc(item.label)}</button>`).join("")}<button class="primary" type="button" data-wr-action="${view.primary.action}" data-kind="${view.primary.kind || ""}" data-phase-id="${view.primary.phaseId || ""}" data-startup="${view.primary.startup ? "1" : "0"}">${esc(view.primary.label)}</button></div>
    </section>`;
  }

  function syncNav() {
    const workspace = document.querySelector(".workspace");
    if (!workspace) return;
    const old = workspace.querySelector(":scope > .work-rhythm-nav");
    if (!ui.enabled) { old?.remove(); return; }
    const data = snapshot();
    if (!data) return;
    const template = document.createElement("template");
    template.innerHTML = navHtml(data);
    const next = template.content.firstElementChild;
    if (!old) workspace.prepend(next);
    else if (old.outerHTML !== next.outerHTML) old.replaceWith(next);
  }

  function closeOverlay() { ui.overlay?.remove(); ui.overlay = null; }
  function showOverlay(content, extra = "") {
    closeOverlay();
    const layer = document.createElement("div");
    layer.className = `wr-overlay ${extra}`.trim(); layer.innerHTML = content;
    document.body.append(layer); ui.overlay = layer; return layer;
  }

  function phaseMenu() {
    const data = snapshot(); if (!data) return;
    const current = model.resolvePhase(new Date(), data.navigation);
    const layer = showOverlay(`<section class="wr-dialog wr-phase-dialog" role="dialog" aria-modal="true"><header><div><h3>切换阶段</h3><p>手动选择将在下一个时间边界自动恢复。</p></div><button data-wr-close aria-label="关闭">×</button></header><main class="wr-phase-list">${data.navigation.config.phases.map((phase) => `<button type="button" data-wr-select-phase="${phase.id}" class="${current.phase?.id === phase.id ? "active" : ""}"><span><strong>${esc(phase.label)}</strong><small>${phase.start}–${phase.end}</small></span><b>${current.phase?.id === phase.id ? "当前" : "进入"}</b></button>`).join("")}</main><footer><button type="button" data-wr-auto-phase ${current.manual ? "" : "disabled"}>恢复自动切换</button><button type="button" data-wr-open-settings>编辑时间</button></footer></section>`);
    layer.querySelectorAll("[data-wr-select-phase]").forEach((button) => button.addEventListener("click", () => {
      bridge.setRuntime({ manualPhaseId: button.dataset.wrSelectPhase, manualPhaseExpiresAt: model.nextBoundaryAt(new Date(), data.navigation) });
      closeOverlay(); syncNav(); toast("已切换，将在下一时间边界恢复自动导航");
    }));
    layer.querySelector("[data-wr-auto-phase]")?.addEventListener("click", () => { bridge.setRuntime({ manualPhaseId: "", manualPhaseExpiresAt: "" }); closeOverlay(); syncNav(); });
    layer.querySelector("[data-wr-open-settings]")?.addEventListener("click", () => { closeOverlay(); bridge.openSettings(); });
  }

  function enterPhase(phaseId) {
    const data = snapshot(); if (!data || !phaseId) return;
    bridge.setRuntime({ manualPhaseId: phaseId, manualPhaseExpiresAt: model.nextBoundaryAt(new Date(), data.navigation) }); syncNav();
  }

  function workPicker(startup = false) {
    const data = snapshot(); if (!data) return;
    const todaySet = new Set(data.todayTaskIds);
    const growthId = data.navigation.config.growth.sourceGroupId;
    const candidates = data.tasks.filter((task) => task.status !== "done" && task.groupId !== growthId);
    const today = data.todayTaskIds.map((id) => taskById(data, id)).filter((task) => task && task.status !== "done" && task.groupId !== growthId);
    const previous = model.previousRecoveryTask(candidates, new Date());
    const layer = showOverlay(`<section class="wr-dialog wr-task-dialog" role="dialog" aria-modal="true"><header><div><h3>${startup ? "选择今天先做什么" : "切换工作任务"}</h3><p>今日任务不设数量上限；也可从全部任务中选择并加入今日。</p></div><button data-wr-close aria-label="关闭">×</button></header><main>${startup && previous ? `<section class="wr-suggestion"><span>昨日续接建议 · 不会自动选中</span><button type="button" data-wr-pick-task="${previous.task.id}" data-add-today="${todaySet.has(previous.task.id) ? "0" : "1"}"><strong>${esc(previous.task.title)}</strong><small>${esc(previous.recovery.nextAction)}</small></button></section>` : ""}<label class="wr-search"><span>⌕</span><input type="search" data-wr-task-search placeholder="搜索任务"></label><div class="wr-task-tabs"><button class="active" type="button" data-wr-task-scope="today">今日任务 <b>${today.length}</b></button><button type="button" data-wr-task-scope="all">全部未完成 <b>${candidates.length}</b></button></div><div class="wr-task-list" data-wr-task-list></div></main></section>`);
    let scope = "today";
    const list = layer.querySelector("[data-wr-task-list]");
    const search = layer.querySelector("[data-wr-task-search]");
    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const source = scope === "today" ? today : candidates;
      const filtered = source.filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(query));
      list.innerHTML = filtered.length ? filtered.map((task) => `<button type="button" data-wr-pick-task="${task.id}" data-add-today="${todaySet.has(task.id) ? "0" : "1"}"><span><strong>${esc(task.title)}</strong><small>${esc(model.resolveNextAction(task))}</small></span><b>${todaySet.has(task.id) ? "今日" : "加入今日"}</b></button>`).join("") : '<p class="wr-empty">没有匹配的任务</p>';
    };
    layer.querySelectorAll("[data-wr-task-scope]").forEach((button) => button.addEventListener("click", () => { scope = button.dataset.wrTaskScope; layer.querySelectorAll("[data-wr-task-scope]").forEach((item) => item.classList.toggle("active", item === button)); draw(); }));
    search.addEventListener("input", draw); draw();
  }

  function recoveryDialog(kind) {
    const data = snapshot(); if (!data) return;
    const ids = kind === "close" ? [data.activeWorkTaskId, data.activeGrowthTaskId] : [kind === "growth" ? data.activeGrowthTaskId : data.activeWorkTaskId];
    const tasks = [...new Set(ids)].map((id) => taskById(data, id)).filter(Boolean);
    if (!tasks.length) { toast("当前没有可记录的任务"); return; }
    const sections = tasks.map((task) => {
      const recovery = task.navigationRecovery || {};
      const group = groupById(data, task.groupId);
      return `<section class="wr-recovery-task" data-wr-recovery-task="${task.id}"><h4>${esc(task.title)}${group ? `<small>${esc(group.title)}</small>` : ""}</h4><label><span>做到哪里</span><textarea data-wr-progress placeholder="已完成、已确认的内容">${esc(recovery.progress)}</textarea></label><label><span>下次第一动作 <b>必填</b></span><textarea data-wr-next placeholder="回来后立刻可以做的具体动作">${esc(recovery.nextAction)}</textarea></label><label><span>证据位置（可选）</span><input data-wr-evidence value="${esc(recovery.evidenceRef)}" placeholder="日志、提交、文档或实验位置"></label></section>`;
    }).join("");
    const layer = showOverlay(`<section class="wr-dialog wr-recovery-dialog" role="dialog" aria-modal="true"><header><div><h3>保存恢复卡</h3><p>${tasks.length > 1 ? "分别记录工作与个人成长的下次入口" : esc(tasks[0].title)}</p></div><button data-wr-close aria-label="关闭">×</button></header><main>${sections}</main><footer><button type="button" data-wr-close>取消</button><button class="primary" type="button" data-wr-save-recovery>保存</button></footer></section>`);
    layer.querySelector("[data-wr-save-recovery]")?.addEventListener("click", () => {
      const cards = [...layer.querySelectorAll("[data-wr-recovery-task]")];
      const missing = cards.find((card) => !card.querySelector("[data-wr-next]").value.trim());
      if (missing) { toast("请填写每项任务的下次第一动作"); return missing.querySelector("[data-wr-next]").focus(); }
      cards.forEach((card) => bridge.saveRecovery(card.dataset.wrRecoveryTask, { progress: card.querySelector("[data-wr-progress]").value.trim(), nextAction: card.querySelector("[data-wr-next]").value.trim(), evidenceRef: card.querySelector("[data-wr-evidence]").value.trim() }));
      closeOverlay(); syncNav(); toast("恢复卡已保存");
    });
  }

  function growthPicker() {
    const data = snapshot(); if (!data) return;
    const source = groupById(data, data.navigation.config.growth.sourceGroupId);
    const tasks = data.growthTaskIds.map((id) => taskById(data, id)).filter(Boolean);
    const layer = showOverlay(`<section class="wr-dialog wr-task-dialog" role="dialog" aria-modal="true"><header><div><h3>选择学习任务</h3><p>${source ? esc(source.title) : "个人成长"} · 默认按分组顺序接续</p></div><button data-wr-close aria-label="关闭">×</button></header><main><div class="wr-task-list">${tasks.map((task, index) => `<button type="button" data-wr-pick-growth="${task.id}"><span><strong>${esc(task.title)}</strong><small>${esc(model.resolveNextAction(task))}</small></span><b>${index === 0 ? "下一项" : `第 ${index + 1} 项`}</b></button>`).join("") || '<p class="wr-empty">没有未完成的学习任务</p>'}</div></main></section>`);
    layer.querySelector("[data-wr-pick-growth]")?.focus();
  }

  function importDialog() {
    const data = snapshot(); if (!data) return;
    const sourceId = data.navigation.config.growth.sourceGroupId;
    const source = groupById(data, sourceId);
    const layer = showOverlay(`<section class="wr-dialog wr-import-dialog" role="dialog" aria-modal="true"><header><div><h3>导入学习计划</h3><p>${source ? `导入到「${esc(source.title)}」` : "未配置来源时，将按文件中的目标分组导入"}</p></div><button data-wr-close aria-label="关闭">×</button></header><main><label class="wr-file"><input type="file" accept="application/json,.json" data-wr-plan-file><span>选择 JSON 文件</span></label><div class="wr-or"><span>或粘贴 JSON</span></div><textarea data-wr-plan-json spellcheck="false" placeholder='{"schemaVersion":1,"type":"loop-learning-plan",...}'></textarea><div class="wr-import-preview" data-wr-import-preview>选择文件或粘贴内容后，将在导入前校验并预览。</div></main><footer><button type="button" data-wr-close>取消</button><button class="primary" type="button" data-wr-confirm-import disabled>确认导入</button></footer></section>`);
    let value = null;
    const textarea = layer.querySelector("[data-wr-plan-json]");
    const preview = layer.querySelector("[data-wr-import-preview]");
    const confirm = layer.querySelector("[data-wr-confirm-import]");
    const inspect = () => {
      try { value = JSON.parse(textarea.value); } catch (_) { value = null; }
      const result = value ? model.previewLearningPlanImport(value, data.tasks) : null;
      if (!result) { preview.className = "wr-import-preview"; preview.textContent = textarea.value.trim() ? "JSON 格式无效" : "选择文件或粘贴内容后，将在导入前校验并预览。"; confirm.disabled = true; return; }
      if (!result.valid) { preview.className = "wr-import-preview error"; preview.innerHTML = `<strong>无法导入</strong><span>${result.errors.slice(0, 4).map((item) => esc(`${item.field}：${item.message}`)).join("<br>")}</span>`; confirm.disabled = true; return; }
      preview.className = "wr-import-preview valid"; preview.innerHTML = `<strong>${esc(result.plan.title)}</strong><span>新增 ${result.newTasks.length} 项 · 已存在 ${result.existingTasks.length} 项 · 新增任务预计 ${result.totalMinutes} 分钟</span>`; confirm.disabled = false;
    };
    textarea.addEventListener("input", inspect);
    layer.querySelector("[data-wr-plan-file]")?.addEventListener("change", async (event) => { const file = event.target.files?.[0]; if (file) { textarea.value = await file.text(); inspect(); } });
    confirm.addEventListener("click", () => { const result = bridge.importLearningPlan(value, { groupId: sourceId }); if (!result.success) return toast("学习计划导入失败"); closeOverlay(); syncNav(); toast(`已导入 ${result.importedCount} 项，跳过 ${result.existingCount} 项`); });
  }

  function settingsHtml(data) {
    const config = data.navigation.config;
    return `<section class="settings-list work-rhythm-settings" data-wr-settings><div class="settings-row"><div class="settings-row-copy"><strong>工作与成长导航</strong></div><div class="settings-row-control"><button class="settings-switch" type="button" role="switch" aria-checked="${ui.enabled}" data-wr-toggle aria-label="工作与成长导航"></button></div></div>${ui.enabled ? `<div class="wr-settings-body"><fieldset><legend>工作日</legend><div class="wr-weekdays">${WEEKDAYS.map(([value, label]) => `<label><input type="checkbox" value="${value}" data-wr-workday ${config.workdays.includes(value) ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset><fieldset><legend>五个阶段</legend><div class="wr-settings-phases">${config.phases.map((phase) => `<div><strong>${esc(phase.label)}</strong><input type="time" value="${phase.start}" data-wr-phase-start="${phase.id}"><span>至</span><input type="time" value="${phase.end}" data-wr-phase-end="${phase.id}"></div>`).join("")}</div><p class="wr-setting-error" data-wr-time-error hidden></p><button type="button" class="wr-text-action" data-wr-reset-times>恢复默认时间</button></fieldset><fieldset><legend>任务接续</legend><label class="wr-settings-line"><span>工作完成后自动顺移</span><input type="checkbox" data-wr-work-auto ${config.work.autoAdvance ? "checked" : ""}></label><label class="wr-settings-line"><span>学习完成后自动顺移</span><input type="checkbox" data-wr-growth-auto ${config.growth.autoAdvance ? "checked" : ""}></label></fieldset><fieldset><legend>个人成长</legend><label class="wr-settings-select"><span>学习任务来源</span><select data-wr-growth-source><option value="">请选择分组</option>${data.groups.map((group) => `<option value="${group.id}" ${group.id === config.growth.sourceGroupId ? "selected" : ""}>${esc(group.title)}</option>`).join("")}</select></label><label class="wr-settings-line"><span>周末安排个人成长</span><input type="checkbox" data-wr-weekend-enabled ${config.growth.weekendEnabled ? "checked" : ""}></label><label class="wr-settings-select"><span>周末学习时长</span><input type="number" min="30" max="720" step="30" value="${config.growth.weekendDurationMinutes}" data-wr-weekend-duration><em>分钟</em></label><label class="wr-settings-select"><span>周末开始时间（可选）</span><input type="time" value="${config.growth.weekendStartTime}" data-wr-weekend-start><button type="button" class="wr-clear-time" data-wr-clear-weekend>清除</button></label></fieldset><div class="wr-settings-save"><span>修改后保存生效</span><button class="primary" type="button" data-wr-save-settings>保存导航设置</button></div></div>` : `<p class="settings-page-note">开启后，导航会根据 Today、个人成长分组和当前时间给出下一步。</p><div class="work-rhythm-settings-unlock" data-wr-unlock-panel hidden><label>访问密码<input type="password" data-wr-password autocomplete="off"></label><button class="primary" type="button" data-wr-unlock>验证并开启</button><p data-wr-password-error hidden>密码不正确，请重试。</p></div>`}</section>`;
  }

  function syncSettings() {
    const slot = document.querySelector("[data-settings-advanced-slot]");
    if (!slot || slot.querySelector("[data-wr-settings]")) return;
    const data = snapshot(); if (data) slot.insertAdjacentHTML("beforeend", settingsHtml(data));
  }

  function toggleEnabled() {
    if (ui.enabled) { ui.enabled = false; localStorage.setItem(ENABLED_KEY, "0"); document.querySelector("[data-wr-settings]")?.remove(); syncSettings(); syncNav(); return toast("工作与成长导航已关闭"); }
    const panel = document.querySelector("[data-wr-unlock-panel]"); if (panel) { panel.hidden = false; panel.querySelector("input")?.focus(); }
  }

  async function unlock() {
    const input = document.querySelector("[data-wr-password]");
    let ok = false; try { ok = await gate?.verifyPassword(input?.value || ""); } catch (_) {}
    if (!ok) { const error = document.querySelector("[data-wr-password-error]"); if (error) error.hidden = false; return input?.select(); }
    ui.enabled = true; localStorage.setItem(ENABLED_KEY, "1"); document.querySelector("[data-wr-settings]")?.remove(); syncSettings(); syncNav(); toast("工作与成长导航已开启");
  }

  function saveSettings(section) {
    const data = snapshot(); if (!data) return;
    const phases = data.navigation.config.phases.map((phase) => ({ ...phase, start: section.querySelector(`[data-wr-phase-start="${phase.id}"]`).value, end: section.querySelector(`[data-wr-phase-end="${phase.id}"]`).value }));
    const validation = model.validatePhaseSchedule(phases);
    const error = section.querySelector("[data-wr-time-error]");
    if (!validation.valid) { error.hidden = false; error.textContent = validation.errors[0].message; return; }
    bridge.updateConfig({
      workdays: [...section.querySelectorAll("[data-wr-workday]:checked")].map((input) => Number(input.value)), phases,
      work: { autoAdvance: section.querySelector("[data-wr-work-auto]").checked },
      growth: { sourceGroupId: section.querySelector("[data-wr-growth-source]").value, autoAdvance: section.querySelector("[data-wr-growth-auto]").checked, weekendEnabled: section.querySelector("[data-wr-weekend-enabled]").checked, weekendDurationMinutes: Number(section.querySelector("[data-wr-weekend-duration]").value), weekendStartTime: section.querySelector("[data-wr-weekend-start]").value },
    });
    syncNav(); toast("导航设置已保存");
  }

  function resetTimes(section) {
    model.DEFAULT_PHASES.forEach((phase) => { section.querySelector(`[data-wr-phase-start="${phase.id}"]`).value = phase.start; section.querySelector(`[data-wr-phase-end="${phase.id}"]`).value = phase.end; });
    section.querySelector("[data-wr-time-error]").hidden = true;
  }

  function complete(kind) {
    const data = snapshot(); if (!data) return;
    const taskId = kind === "growth" ? data.activeGrowthTaskId : data.activeWorkTaskId;
    if (!taskId) return toast("当前没有可完成的任务");
    const result = bridge.completeTask(taskId, kind);
    if (!result.success && result.code === "CONCLUSION_REQUIRED") toast("请先在任务中填写结论，再标记完成");
    else if (!result.success) toast("任务状态已变化，请重新选择");
    else toast(result.nextTaskId ? "已完成，已顺移到下一项" : "已完成当前任务");
    syncNav();
  }

  function openCurrent(kind) {
    const data = snapshot(); if (!data) return;
    const taskId = kind === "growth" ? data.activeGrowthTaskId : data.activeWorkTaskId;
    if (taskId) bridge.openTask(taskId, { kind }); else toast("当前没有任务");
  }

  function handleAction(button) {
    const action = button.dataset.wrAction;
    if (action === "phase-menu") phaseMenu();
    else if (action === "enter-phase") enterPhase(button.dataset.phaseId);
    else if (action === "pick-work") workPicker(button.dataset.startup === "1");
    else if (action === "pick-growth") growthPicker();
    else if (action === "open-current") openCurrent(button.dataset.kind);
    else if (action === "complete") complete(button.dataset.kind);
    else if (action === "recovery") recoveryDialog(button.dataset.kind || "work");
    else if (action === "open-settings") bridge.openSettings();
    else if (action === "open-growth-group") bridge.openGrowthGroup();
    else if (action === "import-plan") importDialog();
    else if (action === "start-weekend") { bridge.setRuntime({ weekendStartedAt: new Date().toISOString() }); syncNav(); }
  }

  function toast(message) {
    document.querySelector(".work-rhythm-toast")?.remove();
    const node = document.createElement("div"); node.className = "work-rhythm-toast"; node.textContent = message;
    document.body.append(node); setTimeout(() => node.remove(), 2200);
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-wr-action]"); if (action) handleAction(action);
    if (event.target.closest("[data-wr-close]")) closeOverlay();
    const pick = event.target.closest("[data-wr-pick-task]"); if (pick) { bridge.openTask(pick.dataset.wrPickTask, { kind: "work", addToToday: pick.dataset.addToday === "1" }); closeOverlay(); syncNav(); }
    const growthPick = event.target.closest("[data-wr-pick-growth]"); if (growthPick) { bridge.openTask(growthPick.dataset.wrPickGrowth, { kind: "growth" }); closeOverlay(); syncNav(); }
    if (event.target.closest("[data-wr-toggle]")) toggleEnabled();
    if (event.target.closest("[data-wr-unlock]")) unlock();
    const save = event.target.closest("[data-wr-save-settings]"); if (save) saveSettings(save.closest("[data-wr-settings]"));
    const reset = event.target.closest("[data-wr-reset-times]"); if (reset) resetTimes(reset.closest("[data-wr-settings]"));
    const clear = event.target.closest("[data-wr-clear-weekend]"); if (clear) clear.closest("fieldset").querySelector("[data-wr-weekend-start]").value = "";
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeOverlay(); if (event.key === "Enter" && event.target.matches("[data-wr-password]")) unlock(); });
  document.addEventListener("pointerdown", (event) => { if (ui.overlay && event.target === ui.overlay) closeOverlay(); });
  document.addEventListener("loop-work-navigation:rendered", () => { syncNav(); syncSettings(); });
  document.addEventListener("loop-work-navigation:import-plan", importDialog);
  document.addEventListener("loop-work-rhythm:disable", () => { ui.enabled = false; localStorage.setItem(ENABLED_KEY, "0"); closeOverlay(); syncNav(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNav(); });
  window.addEventListener("focus", syncNav);
  new MutationObserver(() => { syncNav(); syncSettings(); }).observe(document.getElementById("root"), { childList: true });
  window.setInterval(syncNav, 60000);
  syncNav(); syncSettings();
})();
