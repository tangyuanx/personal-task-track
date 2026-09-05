/* v0.1.165 Work Rhythm — focused navigation */
(function () {
  "use strict";

  const K = {
    enabled: "loop-work-rhythm-v1:enabled",
    profiles: "loop-work-rhythm-v1:profiles",
    active: "loop-work-rhythm-v1:active",
    records: "loop-work-rhythm-v1:records",
  };

  const canonicalDefault = {
    id: "default",
    name: "默认工作日",
    slots: [
      ["08:50", "09:00", "到岗准备", "打开环境并确认今日唯一结果", "完成启动清单"],
      ["09:00", "09:15", "今日启动", "确定今日唯一主结果", "写下结果、完成标准和第一动作"],
      ["09:15", "10:00", "深度工作 A", "推进今日最高价值交付", "记录阶段结果"],
      ["10:00", "10:10", "阶段记录", "保存深度工作 A 的证据", "写一张恢复卡"],
      ["10:10", "10:20", "短休息", "离开屏幕并恢复注意力", "不处理新输入"],
      ["10:20", "11:05", "深度工作 B", "继续推进主任务", "记录关键发现"],
      ["11:05", "11:15", "阶段记录", "保存深度工作 B 的证据", "写一张恢复卡"],
      ["11:15", "11:25", "短休息", "离开屏幕并恢复注意力", "不处理新输入"],
      ["11:25", "12:00", "协作窗口", "集中处理沟通与阻塞", "清空必要协作"],
      ["13:30", "14:00", "下午重启", "恢复上下文并选定下一步", "更新恢复卡"],
      ["14:00", "14:45", "深度工作 C", "完成下午核心推进", "记录阶段结果"],
      ["14:45", "15:00", "阶段记录", "保存深度工作 C 的证据", "写一张恢复卡"],
      ["15:00", "15:15", "机动处理", "处理必要的小任务", "不扩展任务范围"],
      ["15:15", "15:30", "休息", "恢复注意力", "离开屏幕"],
      ["15:30", "17:30", "收束与交付", "完成交付、复盘并准备明日", "关闭开放回路"],
    ],
  };

  const icon = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25"></circle><path d="M12 7.6v4.8l3.2 2"></path></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.6"></circle><path d="M19.1 13.7a7.5 7.5 0 0 0 0-3.4l2-1.5-2-3.4-2.5 1a8 8 0 0 0-3-1.7L13.2 2H9.3L9 4.7a8 8 0 0 0-3 1.7l-2.5-1-2 3.4 2 1.5a7.5 7.5 0 0 0 0 3.4l-2 1.5 2 3.4 2.5-1a8 8 0 0 0 3 1.7l.4 2.7h3.9l.4-2.7a8 8 0 0 0 3-1.7l2.5 1 2-3.4-2-1.5Z"></path></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"></path></svg>',
    chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"></path></svg>',
    down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"></path></svg>',
  };

  let panelMode = "current";
  let activePanel = null;
  let lastPhaseSignature = null;
  let transitionCue = null;
  let viewTransitionToken = 0;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function seedCanonicalDefault() {
    const saved = readJson(K.profiles, null);
    if (!Array.isArray(saved) || !saved.length) {
      localStorage.setItem(K.profiles, JSON.stringify([canonicalDefault]));
      localStorage.setItem(K.active, canonicalDefault.id);
    }
  }

  function profiles() {
    const saved = readJson(K.profiles, []);
    return Array.isArray(saved) && saved.length ? saved : [canonicalDefault];
  }

  function activeProfile() {
    const list = profiles();
    const id = localStorage.getItem(K.active);
    return list.find((profile) => profile.id === id) || list[0];
  }

  function minutes(value) {
    const [hours, mins] = String(value || "0:0").split(":").map(Number);
    return hours * 60 + mins;
  }

  function nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function phaseState() {
    const profile = activeProfile();
    const slots = Array.isArray(profile.slots) ? profile.slots : [];
    const now = nowMinutes();
    const activeIndex = slots.findIndex((slot) => now >= minutes(slot[0]) && now < minutes(slot[1]));
    if (activeIndex >= 0) return { profile, slots, index: activeIndex, slot: slots[activeIndex], mode: "active", now };
    const nextIndex = slots.findIndex((slot) => now < minutes(slot[0]));
    if (nextIndex >= 0) return { profile, slots, index: nextIndex, slot: slots[nextIndex], mode: "next", now };
    const index = Math.max(0, slots.length - 1);
    return { profile, slots, index, slot: slots[index] || ["", "", "今日阶段", "", ""], mode: "ended", now };
  }

  function remaining(state) {
    if (state.mode === "ended") return 0;
    const target = state.mode === "active" ? minutes(state.slot[1]) : minutes(state.slot[0]);
    return Math.max(0, target - state.now);
  }

  function nextSlot(state) {
    if (state.mode === "active") return state.slots[state.index + 1] || null;
    if (state.mode === "next") return state.slot;
    return null;
  }

  function currentTask(state) {
    const field = document.querySelector(".workspace .page-title");
    const title = field && "value" in field ? field.value.trim() : "";
    return title || state.slot[3] || state.slot[2] || "当前任务";
  }

  function phaseSignature(state) {
    return [state.profile.id, state.index, state.mode, state.slot[0], state.slot[2]].join("|");
  }

  function isRest(state) {
    return state.mode === "active" && /休息|午休|短休/.test(state.slot[2]);
  }

  function presentation(state) {
    if (state.mode === "ended") {
      return { title: "收好现场，今天到这里", support: "明日可从恢复卡继续" };
    }
    if (isRest(state)) {
      return { title: "离开屏幕，休息一下", support: "无需处理新输入" };
    }
    if (state.mode === "next") {
      return { title: "稍后继续", support: "" };
    }
    const cueActive = transitionCue
      && transitionCue.signature === phaseSignature(state)
      && transitionCue.until > Date.now();
    if (cueActive) {
      const task = currentTask(state);
      return {
        title: /^继续/.test(task) ? task : `继续${task}`,
        support: state.slot[2],
      };
    }
    return { title: currentTask(state), support: "" };
  }

  function reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  function viewFrames(direction, incoming) {
    if (reducedMotion()) return incoming
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 1 }, { opacity: 0 }];
    const distance = direction === "forward" ? 18 : -18;
    return incoming
      ? [{ opacity: 0.35, transform: `translateX(${distance}px)` }, { opacity: 1, transform: "translateX(0)" }]
      : [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0.35, transform: `translateX(${-distance}px)` }];
  }

  function animateIncoming(direction) {
    requestAnimationFrame(() => {
      const main = document.querySelector(".work-rhythm-panel > main");
      if (!main?.animate) return;
      main.getAnimations().forEach((animation) => animation.cancel());
      main.animate(viewFrames(direction, true), {
        duration: reducedMotion() ? 120 : 150,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
    });
  }

  function transitionView(panel, direction, render) {
    const main = panel?.querySelector("main");
    const token = ++viewTransitionToken;
    const finish = () => {
      if (token !== viewTransitionToken) return;
      render();
      animateIncoming(direction);
    };
    if (!main?.animate) {
      finish();
      return;
    }
    main.getAnimations().forEach((animation) => animation.cancel());
    const animation = main.animate(viewFrames(direction, false), {
      duration: reducedMotion() ? 120 : 110,
      easing: "cubic-bezier(.4,0,1,1)",
      fill: "forwards",
    });
    animation.finished.then(finish).catch(() => {});
  }

  function transitionCurrentPhase(panel) {
    const shell = panel?.querySelector(".wr3-current-shell");
    if (!shell?.animate) {
      activePanel = null;
      if (panel) delete panel.dataset.wr3View;
      renderCurrent(panel);
      return;
    }
    shell.getAnimations().forEach((animation) => animation.cancel());
    const outgoing = reducedMotion()
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-10px)" }];
    const incoming = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }];
    const animation = shell.animate(outgoing, {
      duration: reducedMotion() ? 120 : 110,
      easing: "cubic-bezier(.4,0,1,1)",
      fill: "forwards",
    });
    animation.finished.then(() => {
      activePanel = null;
      delete panel.dataset.wr3View;
      renderCurrent(panel);
      panel.querySelector(".wr3-current-shell")?.animate(incoming, {
        duration: reducedMotion() ? 120 : 150,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
    }).catch(() => {});
  }

  function originalTab(panel, name) {
    return panel.querySelector(`[data-wr-tab="${name}"]`);
  }

  function resetPanel(panel) {
    panel.classList.remove("wr3-current-mode", "wr3-timeline-mode", "wr3-settings-mode", "wr3-detail-mode");
    panel.classList.add("wr3-surface");
    const header = panel.querySelector(":scope > header");
    if (header) header.hidden = true;
  }

  function openBaseView(panel, tab, mode) {
    panelMode = mode;
    const button = originalTab(panel, tab);
    if (button) {
      button.click();
      document.querySelector(".work-rhythm-panel")?.classList.add("wr3-view-swap");
    }
  }

  function restoreCurrent(panel) {
    openBaseView(panel, "current", "current");
  }

  function renderCurrent(panel) {
    resetPanel(panel);
    panel.classList.add("wr3-current-mode");
    panel.dataset.wr3View = "current";
    const state = phaseState();
    const next = nextSlot(state);
    const content = presentation(state);
    const main = panel.querySelector("main");
    if (!main) return;
    const originalRecord = main.querySelector("[data-wr-record]");
    const remainingLabel = state.mode === "active" ? "剩余" : "距离开始";
    const remainingValue = state.mode === "ended" ? "" : `${remaining(state)} 分钟`;
    const first = state.slots[0];
    const nextText = next
      ? `下一阶段 · ${next[0]} ${next[2]}`
      : state.mode === "ended" && first
        ? `明日 · ${first[0]} ${first[2]}`
        : "最后一个阶段";

    main.innerHTML = `
      <div class="wr3-current-shell">
        <div class="wr3-head">
          <button class="wr3-recovery" type="button" data-wr3-record>记录恢复卡</button>
          <div class="wr3-tools" aria-label="阶段工具">
            <button type="button" data-wr3-timeline aria-label="打开今日时间轴">${icon.clock}</button>
            <button type="button" data-wr3-settings aria-label="打开设置">${icon.settings}</button>
          </div>
        </div>
        <div class="wr3-task-copy">
          <h2 class="wr3-task-title">${escapeHtml(content.title)}</h2>
          <p class="wr3-task-support"${content.support ? "" : " hidden"}>${escapeHtml(content.support)}</p>
        </div>
        <div class="wr3-status" aria-label="阶段状态">
          <div class="wr3-remaining${remainingValue ? "" : " is-empty"}"><span>${remainingValue ? remainingLabel : ""}</span><strong>${escapeHtml(remainingValue)}</strong></div>
          <div class="wr3-next">${escapeHtml(nextText)}</div>
        </div>
      </div>`;

    if (originalRecord) {
      originalRecord.hidden = true;
      originalRecord.tabIndex = -1;
      main.append(originalRecord);
      main.querySelector("[data-wr3-record]")?.addEventListener("click", () => {
        activePanel = null;
        delete panel.dataset.wr3View;
        originalRecord.click();
      });
    } else {
      main.querySelector("[data-wr3-record]")?.remove();
    }
    main.querySelector("[data-wr3-timeline]")?.addEventListener("click", () => {
      transitionView(panel, "forward", () => renderTimeline(panel));
    });
    main.querySelector("[data-wr3-settings]")?.addEventListener("click", () => {
      transitionView(panel, "forward", () => renderSettings(panel));
    });
  }

  function timelineProgress(state) {
    if (!state.slots.length) return 0;
    if (state.mode === "ended") return 100;
    if (state.mode === "next") return Math.max(0, (state.index / state.slots.length) * 100);
    const start = minutes(state.slot[0]);
    const end = minutes(state.slot[1]);
    const fraction = end > start ? (state.now - start) / (end - start) : 0;
    return Math.min(100, ((state.index + fraction) / state.slots.length) * 100);
  }

  function renderTimeline(panel) {
    panelMode = "timeline";
    resetPanel(panel);
    panel.classList.add("wr3-timeline-mode");
    panel.dataset.wr3View = "timeline";
    const state = phaseState();
    const main = panel.querySelector("main");
    if (!main) return;
    const rows = state.slots.map((slot, index) => {
      const rowState = index < state.index || state.mode === "ended" ? "past" : index === state.index && state.mode === "active" ? "current" : "future";
      return `<li class="wr3-timeline-row is-${rowState}">
        <time>${escapeHtml(slot[0])}–${escapeHtml(slot[1])}</time>
        <span class="wr3-marker" aria-hidden="true"></span>
        <strong>${escapeHtml(slot[2])}</strong>
      </li>`;
    }).join("");
    main.innerHTML = `
      <div class="wr3-subhead">
        <button type="button" data-wr3-back aria-label="返回当前阶段">${icon.back}</button>
        <h2>今日时间轴</h2>
        <span></span>
      </div>
      <ol class="wr3-timeline" style="--wr3-progress:${timelineProgress(state)}%">${rows}</ol>`;
    main.querySelector("[data-wr3-back]")?.addEventListener("click", () => {
      transitionView(panel, "back", () => restoreCurrent(panel));
    });
    requestAnimationFrame(() => main.querySelector(".wr3-timeline-row.is-current")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  function renderSettings(panel) {
    panelMode = "settings";
    resetPanel(panel);
    panel.classList.add("wr3-settings-mode");
    panel.dataset.wr3View = "settings";
    const state = phaseState();
    const main = panel.querySelector("main");
    if (!main) return;
    const template = state.slot[4] || "当前阶段";
    main.innerHTML = `
      <div class="wr3-subhead">
        <button type="button" data-wr3-back aria-label="返回当前阶段">${icon.back}</button>
        <h2>设置</h2>
        <span></span>
      </div>
      <div class="wr3-settings">
        <section class="wr3-settings-group" aria-labelledby="wr3-time-title">
          <h3 id="wr3-time-title">时间</h3>
          <div class="wr3-setting-row">
            <span>时间导航</span>
            <button class="wr3-switch is-on" type="button" role="switch" aria-checked="true" data-wr3-toggle><i></i></button>
          </div>
          <button class="wr3-setting-row" type="button" data-wr3-profile>
            <span>时间方案</span><em>${escapeHtml(state.profile.name)}</em>${icon.chevron}
          </button>
        </section>
        <section class="wr3-settings-group" aria-labelledby="wr3-record-title">
          <h3 id="wr3-record-title">记录与安全</h3>
          <button class="wr3-setting-row" type="button" data-wr3-template>
            <span>固定模板</span><em>${escapeHtml(template)}</em>${icon.chevron}
          </button>
          <div class="wr3-setting-row"><span>访问保护</span><em class="wr3-ok">已开启</em></div>
        </section>
      </div>`;
    main.querySelector("[data-wr3-back]")?.addEventListener("click", () => {
      transitionView(panel, "back", () => restoreCurrent(panel));
    });
    main.querySelector("[data-wr3-profile]")?.addEventListener("click", () => {
      transitionView(panel, "forward", () => openBaseView(panel, "profiles", "detail"));
    });
    main.querySelector("[data-wr3-template]")?.addEventListener("click", () => {
      transitionView(panel, "forward", () => openBaseView(panel, "templates", "detail"));
    });
    main.querySelector("[data-wr3-toggle]")?.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("loop-work-rhythm:disable"));
    });
  }

  function renderDetail(panel) {
    resetPanel(panel);
    panel.classList.add("wr3-detail-mode");
    panel.dataset.wr3View = "detail";
    const main = panel.querySelector("main");
    if (!main || main.querySelector(".wr3-detail-head")) return;
    const head = document.createElement("div");
    head.className = "wr3-subhead wr3-detail-head";
    head.innerHTML = `<button type="button" data-wr3-settings-back aria-label="返回设置">${icon.back}</button><h2>${escapeHtml(main.querySelector("h2, h3")?.textContent || "设置")}</h2><span></span>`;
    main.prepend(head);
    head.querySelector("button")?.addEventListener("click", () => {
      transitionView(panel, "back", () => renderSettings(panel));
    });
  }

  function decoratePanel(panel) {
    if (!panel || panel === activePanel && panel.dataset.wr3View === panelMode) return;
    activePanel = panel;
    if (panelMode === "timeline") renderTimeline(panel);
    else if (panelMode === "settings") renderSettings(panel);
    else if (panelMode === "detail") renderDetail(panel);
    else renderCurrent(panel);
  }

  function decorateRail(state = phaseState()) {
    const button = document.querySelector(".work-rhythm-pill");
    if (!button) return;
    const value = state.mode === "ended" ? "" : `${remaining(state)} 分钟`;
    const title = state.mode === "ended" ? "今日已结束" : state.mode === "next" ? `下一阶段 ${state.slot[2]}` : state.slot[2];
    const signature = `${title}|${value}|${state.mode}`;
    if (button.dataset.wr3Signature === signature) return;
    button.dataset.wr3Signature = signature;
    button.classList.add("wr3-pill");
    button.innerHTML = `<i aria-hidden="true"></i><strong>${escapeHtml(title)}</strong>${value ? `<span>${escapeHtml(value)}</span>` : ""}${icon.down}`;
  }

  function inspect() {
    const state = phaseState();
    const signature = phaseSignature(state);
    const panel = document.querySelector(".work-rhythm-panel");
    const phaseChanged = lastPhaseSignature && lastPhaseSignature !== signature;
    const cueExpired = transitionCue && transitionCue.until <= Date.now();
    if (phaseChanged) {
      transitionCue = { signature, until: Date.now() + 4000 };
    } else if (cueExpired) {
      transitionCue = null;
    }
    lastPhaseSignature = signature;
    decorateRail(state);
    if (panel && panel.dataset.wr3View === "current" && (phaseChanged || cueExpired)) {
      transitionCurrentPhase(panel);
    } else if (panel) {
      decoratePanel(panel);
    }
  }

  seedCanonicalDefault();
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-wr-open]")) {
      panelMode = "current";
      activePanel = null;
    }
  }, true);
  new MutationObserver(inspect).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(inspect, 10000);
  inspect();
})();
