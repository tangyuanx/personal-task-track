(() => {
  "use strict";

  const K = {
    enabled: "loop-work-rhythm-v1:enabled",
    profiles: "loop-work-rhythm-v1:profiles",
    active: "loop-work-rhythm-v1:active",
    records: "loop-work-rhythm-v1:records",
    execution: "loop-work-rhythm-v2:execution",
  };

  const canonicalDefault = {
    id: "default",
    name: "默认工作日",
    desc: "稳定执行主线工作的标准节奏。",
    slots: [
      ["09:40","09:55","今日启动","确定今日唯一主结果、完成标准和第一动作","今日启动"],
      ["09:55","11:15","深度工作 A","推进今日主结果，不切换问题","Debug / 开发"],
      ["11:15","11:30","验证与收束","固定上午结果并留下下一步","阶段总结"],
      ["11:30","11:40","上午收尾","固定上午现场并留下下午恢复入口","阶段总结"],
      ["11:40","13:10","午休","离开工作现场，完整休息","无"],
      ["13:10","13:25","可选轻学习","只做低负担阅读或知识补齐","学习任务"],
      ["13:25","13:40","过渡 / 自由","清理杂项并准备下午启动","无"],
      ["13:40","13:55","下午重启","读取恢复卡，重建上下文","恢复卡"],
      ["13:55","15:15","深度工作 B","继续今日主结果","Debug / 开发"],
      ["15:15","15:30","休息","离开屏幕 / 喝水 / 活动","无"],
      ["15:30","16:15","协作 / 次要任务","处理必要协作和低认知任务","任务记录"],
      ["16:15","17:15","交付验证","验证、复现并固定结果","交付验证"],
      ["17:15","17:35","缓冲","处理必要收尾，不主动开启新的主问题","任务记录"],
      ["17:35","17:55","代码与知识沉淀","整理改动并提炼今天可复用的工程经验","知识沉淀"],
      ["17:55","18:10","每日关闭","确认今日结果并留下明日第一动作","每日关闭"],
    ],
  };

  let settingsMode = false;
  let timeline = null;

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const hm = (value) => {
    const [h,m] = String(value || "00:00").split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin = (date = new Date()) => date.getHours() * 60 + date.getMinutes();
  const dateKey = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

  function seedCanonicalDefault() {
    if (localStorage.getItem(K.profiles)) return;
    const debug = {
      id:"debug", name:"Debug 日", desc:"复杂问题定位，减少切换。",
      slots:[
        ["09:40","09:55","问题启动","明确现象、边界和今日要排除的范围","Debug 启动"],
        ["09:55","11:30","深度 Debug A","只围绕主问题做最小区分实验","问题定位 / Debug"],
        ["11:30","11:40","证据固定","整理上午事实、证据和被推翻假设","阶段总结"],
        ["13:40","13:50","恢复上下文","读取恢复卡和上午证据","恢复卡"],
        ["13:50","15:30","深度 Debug B","继续收敛根因，不处理支线","问题定位 / Debug"],
        ["15:30","15:45","休息","离开屏幕","无"],
        ["15:45","17:10","复现 / 修复验证","构造稳定复现并验证修复","交付验证"],
        ["17:10","17:45","知识沉淀","把根因链和判断方法写成知识卡","知识沉淀"],
        ["17:45","18:10","关闭现场","形成恢复卡和明日第一动作","每日关闭"],
      ]
    };
    const learn = {
      id:"learn", name:"学习日", desc:"技术学习、手册阅读和小实验。",
      slots:[
        ["09:30","09:45","学习启动","明确今天要补齐的一个知识缺口","学习启动"],
        ["09:45","11:15","概念学习","阅读核心材料并建立概念框架","学习任务"],
        ["11:15","11:45","最小实验","用代码 / 命令验证刚学内容","学习实验"],
        ["13:30","15:00","深度学习 B","继续第二块核心内容","学习任务"],
        ["15:20","16:30","工程连接","把知识与当前项目问题连接起来","知识沉淀"],
        ["16:30","17:00","知识卡","整理机制、证据、边界和例子","知识卡"],
        ["17:00","17:15","学习关闭","记录仍不理解的问题和下一次入口","每日关闭"],
      ]
    };
    write(K.profiles, [canonicalDefault, debug, learn]);
  }

  function profiles() {
    const value = read(K.profiles, [canonicalDefault]);
    return Array.isArray(value) && value.length ? value : [canonicalDefault];
  }

  function activeProfile() {
    const list = profiles();
    const id = localStorage.getItem(K.active) || "default";
    return list.find((p) => p.id === id) || list[0];
  }

  function slotKey(profile, slot, index) {
    return `${profile.id}:${index}:${slot[0]}:${slot[1]}:${slot[2]}`;
  }

  function currentSlot(profile = activeProfile()) {
    const now = nowMin();
    const index = profile.slots.findIndex((s) => now >= hm(s[0]) && now < hm(s[1]));
    return index >= 0 ? { slot: profile.slots[index], index } : null;
  }

  function execution() {
    const today = dateKey();
    const value = read(K.execution, null);
    if (!value || value.date !== today) {
      const fresh = { date: today, activeKey: null, slots: {} };
      write(K.execution, fresh);
      return fresh;
    }
    return value;
  }

  function track() {
    if (localStorage.getItem(K.enabled) !== "1") return;
    const profile = activeProfile();
    const current = currentSlot(profile);
    const state = execution();
    const now = new Date().toISOString();

    if (!current) {
      if (state.activeKey && state.slots[state.activeKey] && !state.slots[state.activeKey].endedAt) {
        state.slots[state.activeKey].endedAt = now;
        state.activeKey = null;
        write(K.execution, state);
      }
      return;
    }

    const key = slotKey(profile, current.slot, current.index);
    if (state.activeKey && state.activeKey !== key && state.slots[state.activeKey] && !state.slots[state.activeKey].endedAt) {
      state.slots[state.activeKey].endedAt = now;
    }
    if (!state.slots[key]) state.slots[key] = { startedAt: now, endedAt: null };
    state.activeKey = key;
    write(K.execution, state);
  }

  function todayRecords() {
    return (read(K.records, []) || []).filter((r) => {
      const d = new Date(r.createdAt);
      return !Number.isNaN(d.getTime()) && dateKey(d) === dateKey();
    });
  }

  function recordFor(profile, slot) {
    const list = todayRecords();
    return list.find((r) => r.profileId === profile.id && r.phase === slot[2]) ||
           list.find((r) => r.phase === slot[2]) || null;
  }

  function clock(value) {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" :
      `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  function minute(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : nowMin(d);
  }

  function statusFor(profile, slot, index) {
    const now = nowMin();
    const start = hm(slot[0]), end = hm(slot[1]);
    const state = execution().slots[slotKey(profile, slot, index)] || null;
    const record = recordFor(profile, slot);
    const current = currentSlot(profile);

    if (now < start) return { kind:"future", label:"尚未开始", actual:`计划 ${slot[0]}–${slot[1]}` };

    if (current?.index === index) {
      const elapsed = state?.startedAt
        ? Math.max(0, Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 60000))
        : Math.max(0, now - start);
      return { kind:"current", label:"● 进行中", actual:`已进行 ${elapsed} 分钟` };
    }

    if (now < end) return { kind:"future", label:"尚未开始", actual:`计划 ${slot[0]}–${slot[1]}` };
    if (slot[4] === "无") return { kind:"done", label:"✓ 已结束", actual:"无需阶段结果" };

    const started = minute(state?.startedAt);
    const ended = minute(state?.endedAt) ?? minute(record?.createdAt);
    const delay = started === null ? null : Math.max(0, started - start);
    const over = ended === null ? 0 : Math.max(0, ended - end);

    if (!state?.startedAt && !record)
      return { kind:"deviation", label:"↗ 未按计划执行", actual:"未检测到执行或结果" };

    if (!record) {
      let actual = state?.startedAt ? `实际 ${clock(state.startedAt)} 开始` : "阶段已过去";
      if (state?.endedAt) actual += ` · ${clock(state.endedAt)} 结束`;
      return { kind:"noresult", label:"! 无结果", actual };
    }

    if (over > 2)
      return { kind:"overtime", label:`+${over}m 超时`, actual:`${clock(record.createdAt)} 完成 · 有结果` };

    if (delay !== null && delay > 5)
      return { kind:"deviation", label:"↗ 偏离计划", actual:`实际 ${clock(state.startedAt)} 开始 · 有结果` };

    return { kind:"done", label:"✓ 已完成", actual:`${clock(record.createdAt)} 完成 · 有结果` };
  }

  function timelineHtml() {
    const profile = activeProfile();
    const summary = { done:0, overtime:0, deviation:0, noresult:0, current:0 };
    const rows = profile.slots.map((slot, index) => {
      const s = statusFor(profile, slot, index);
      if (summary[s.kind] !== undefined) summary[s.kind]++;
      return `<article class="wr2-timeline-row ${s.kind}">
        <div class="wr2-time"><strong>${esc(slot[0])}</strong><span>– ${esc(slot[1])}</span><small>${esc(s.actual)}</small></div>
        <div class="wr2-phase"><strong>${esc(slot[2])}</strong><p>${esc(slot[3])}</p><small>${slot[4] === "无" ? "无需阶段记录" : `记录模板：${esc(slot[4])}`}</small></div>
        <div class="wr2-state"><span class="wr2-status ${s.kind}">${esc(s.label)}</span></div>
      </article>`;
    }).join("");

    return `<div class="wr2-timeline-backdrop" data-wr2>
      <section class="wr2-timeline-panel">
        <header><div><h3>今日时间轴</h3><p>${esc(profile.name)} · 计划与实际执行对照</p></div><button type="button" data-wr2-close>×</button></header>
        <div class="wr2-summary">
          <div><span>已完成</span><strong>${summary.done}</strong></div>
          <div><span>超时</span><strong>${summary.overtime}</strong></div>
          <div><span>偏离计划</span><strong>${summary.deviation}</strong></div>
          <div><span>无结果</span><strong>${summary.noresult}</strong></div>
          <div><span>进行中</span><strong>${summary.current}</strong></div>
        </div>
        <div class="wr2-timeline-list">${rows}</div>
      </section>
    </div>`;
  }

  function openTimeline() {
    closeTimeline();
    document.querySelector(".work-rhythm-panel")?.remove();
    document.body.insertAdjacentHTML("beforeend", timelineHtml());
    timeline = document.querySelector(".wr2-timeline-backdrop");
    timeline?.querySelector("[data-wr2-close]")?.addEventListener("click", closeTimeline);
  }

  function closeTimeline() {
    timeline?.remove();
    timeline = null;
  }

  function decorateMinimal(panel) {
    if (panel.dataset.wr2Mode === "minimal") return;
    panel.dataset.wr2Mode = "minimal";
    panel.classList.add("wr2-minimal");
    panel.querySelector(":scope > header")?.setAttribute("hidden", "");

    const current = panel.querySelector(".wr-current");
    if (!current) return;

    const title = current.querySelector(":scope > div");
    const remain = current.querySelector(":scope > span");
    title?.querySelector("p")?.setAttribute("hidden", "");
    if (remain && title) {
      const p = document.createElement("p");
      p.className = "wr2-remain";
      p.textContent = remain.textContent;
      title.append(p);
      remain.remove();
    }

    const tools = document.createElement("div");
    tools.className = "wr2-tools";
    tools.innerHTML = `
      <button type="button" class="wr2-tool" data-wr2-timeline title="今日时间轴" aria-label="今日时间轴"><span class="wr2-clock"></span></button>
      <button type="button" class="wr2-tool wr2-gear" data-wr2-settings title="Work Rhythm 设置" aria-label="Work Rhythm 设置">⚙</button>`;
    current.append(tools);

    panel.querySelector("[data-wr2-timeline]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsMode = false;
      openTimeline();
    });
    panel.querySelector("[data-wr2-settings]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsMode = true;
      const profileTab = panel.querySelector('[data-wr-tab="profiles"]');
      profileTab?.click();
    });
  }

  function decorateSettings(panel) {
    panel.dataset.wr2Mode = "settings";
    panel.classList.remove("wr2-minimal");
    const header = panel.querySelector(":scope > header");
    header?.removeAttribute("hidden");
    const nav = panel.querySelector("nav");
    nav?.querySelector('[data-wr-tab="current"]')?.setAttribute("hidden", "");
    nav?.querySelector('[data-wr-tab="timeline"]')?.setAttribute("hidden", "");
    if (nav && !nav.querySelector(".wr2-settings-title")) {
      const title = document.createElement("span");
      title.className = "wr2-settings-title";
      title.textContent = "Work Rhythm 设置";
      nav.prepend(title);
    }
  }

  function inspectPanel() {
    const panel = document.querySelector(".work-rhythm-panel");
    if (!panel) return;
    if (settingsMode) decorateSettings(panel);
    else decorateMinimal(panel);
  }

  seedCanonicalDefault();
  track();

  const observer = new MutationObserver(() => inspectPanel());
  observer.observe(document.body, { childList:true, subtree:true });
  setInterval(track, 30000);

  document.addEventListener("pointerdown", (e) => {
    if (timeline && e.target === timeline) closeTimeline();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && timeline) closeTimeline();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-wr-open]")) settingsMode = false;
  }, true);

  inspectPanel();
})();