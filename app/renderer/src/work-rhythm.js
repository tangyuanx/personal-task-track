(() => {
"use strict";
const gate=window.personalTaskTrack?.workRhythm;
const K={enabled:"loop-work-rhythm-v1:enabled",profiles:"loop-work-rhythm-v1:profiles",active:"loop-work-rhythm-v1:active",records:"loop-work-rhythm-v1:records"};
const defaults=[
{id:"default",name:"默认工作日",desc:"稳定执行主线工作的标准节奏。",slots:[["09:40","09:55","今日启动","确定今日唯一主结果、完成标准和第一动作","今日启动"],["09:55","11:15","深度工作 A","推进今日主结果，不切换问题","Debug / 开发"],["11:15","11:30","验证与收束","固定上午结果并留下下一步","阶段总结"],["13:40","13:55","下午重启","读取恢复卡，重建上下文","恢复卡"],["13:55","15:15","深度工作 B","继续今日主结果","Debug / 开发"],["15:15","15:30","休息","离开屏幕 / 喝水 / 活动","无"],["15:30","16:15","协作 / 次要任务","处理必要协作和低认知任务","任务记录"],["16:15","17:00","交付验证","验证、复现并固定结果","交付验证"],["17:00","17:25","代码 / 文档收尾","整理改动、提交、文档与遗留","开发实现"],["17:25","17:55","知识沉淀","提炼今天可复用的工程经验","知识沉淀"],["17:55","18:10","每日关闭","确认今日结果并留下明日第一动作","每日关闭"]]},
{id:"debug",name:"Debug 日",desc:"复杂问题定位，减少切换。",slots:[["09:40","09:55","问题启动","明确现象、边界和今日要排除的范围","Debug 启动"],["09:55","11:30","深度 Debug A","只围绕主问题做最小区分实验","问题定位 / Debug"],["11:30","11:40","证据固定","整理上午事实、证据和被推翻假设","阶段总结"],["13:40","13:50","恢复上下文","读取恢复卡和上午证据","恢复卡"],["13:50","15:30","深度 Debug B","继续收敛根因，不处理支线","问题定位 / Debug"],["15:30","15:45","休息","离开屏幕","无"],["15:45","17:10","复现 / 修复验证","构造稳定复现并验证修复","交付验证"],["17:10","17:45","知识沉淀","把根因链和判断方法写成知识卡","知识沉淀"],["17:45","18:10","关闭现场","形成恢复卡和明日第一动作","每日关闭"]]},
{id:"learn",name:"学习日",desc:"技术学习、手册阅读和小实验。",slots:[["09:30","09:45","学习启动","明确今天要补齐的一个知识缺口","学习启动"],["09:45","11:15","概念学习","阅读核心材料并建立概念框架","学习任务"],["11:15","11:45","最小实验","用代码 / 命令验证刚学内容","学习实验"],["13:30","15:00","深度学习 B","继续第二块核心内容","学习任务"],["15:20","16:30","工程连接","把知识与当前项目问题连接起来","知识沉淀"],["16:30","17:00","知识卡","整理机制、证据、边界和例子","知识卡"],["17:00","17:15","学习关闭","记录仍不理解的问题和下一次入口","每日关闭"]]}
];
const templates={"今日启动":["今日唯一主结果","完成标准","第一动作"],"Debug / 开发":["当前假设 / 当前目标","本轮验证 / 修改","证据 / 结果","当前结论","下一步最小动作"],"问题定位 / Debug":["现象","当前假设","本轮实验","证据 / 结果","当前结论","下一步最小动作"],"阶段总结":["本阶段完成了什么","确认的事实","尚未确认","下一步"],"恢复卡":["我做到哪里","当前判断","回来后第一步"],"任务记录":["处理事项","处理结果","遗留事项"],"交付验证":["验证目标","验证场景 / 条件","验证结果","是否通过","遗留风险 / 下一步"],"开发实现":["目标","修改点","验证结果","遗留问题"],"知识沉淀":["核心经验","判断方法","以后如何复用"],"每日关闭":["今日主结果完成情况","今天确认的关键事实","未完成及原因","明日第一动作"],"学习启动":["今天要补齐的知识缺口","完成标准","第一动作"],"学习任务":["当前理解","新概念","仍不理解","下一步"],"学习实验":["验证目标","实验 / 命令","观察结果","结论"],"知识卡":["机制","证据","适用边界","可复用表达"],"Debug 启动":["现象","影响","今天要排除的范围","第一实验"],"无":[]};
const exports=[{id:"debug",title:"技术问题交接",cmd:"/debug"},{id:"start",title:"日启动交接",cmd:"/start-day"},{id:"learn",title:"学习交接",cmd:"/learn"},{id:"knowledge",title:"知识沉淀交接",cmd:"/knowledge"},{id:"end",title:"日关闭交接",cmd:"/end-day"},{id:"week",title:"周度复盘交接",cmd:"/weekly-review"},{id:"growth",title:"成长检查交接",cmd:"/growth"},{id:"month",title:"月度复盘交接",cmd:"/monthly-review"}];
const rt={enabled:localStorage.getItem(K.enabled)==="1",tab:"current",exp:"debug",panel:null,modal:null,drawer:null};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const profiles=()=>{const p=read(K.profiles,null);return Array.isArray(p)&&p.length?p:structuredClone(defaults)};
const activeId=()=>localStorage.getItem(K.active)||"default";
const activeProfile=()=>{const p=profiles(),x=p.find(v=>v.id===activeId())||p[0];localStorage.setItem(K.active,x.id);return x};
const hm=s=>{const [h,m]=String(s).split(":").map(Number);return h*60+m},nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
function phase(){const p=activeProfile(),n=nowMin(),a=p.slots.find(s=>n>=hm(s[0])&&n<hm(s[1]));if(a)return{p,s:a,mode:"active"};const nx=p.slots.find(s=>hm(s[0])>n);return{p,s:nx||p.slots.at(-1),mode:nx?"next":"ended"}}
function remain(x){if(!x.s)return"未配置";const n=nowMin();if(x.mode==="next")return`${Math.max(0,hm(x.s[0])-n)} 分钟后`;if(x.mode==="ended")return"今日已结束";const r=Math.max(0,hm(x.s[1])-n);return r>=60?`剩余 ${Math.floor(r/60)} 小时${r%60?` ${r%60} 分钟`:""}`:`剩余 ${r} 分钟`}
function phaseName(x){return !x.s?"工作节奏":x.mode==="next"?`下一阶段 ${x.s[2]}`:x.mode==="ended"?"今日节奏已结束":x.s[2]}
function context(){const w=document.querySelector(".workspace"),h=w?.querySelector("h1,h2"),title=(h?.textContent||"当前任务").trim(),body=Array.from(w?.querySelectorAll(".brief-card,.task-brief-card,.flow-row,.flow-node,[data-node-id]")||[]).map(n=>n.innerText.trim()).filter(Boolean).slice(0,28).join("\n\n");return{title,body}}
function recs(){const r=read(K.records,[]);return Array.isArray(r)?r:[]}
function barHtml(){const x=phase();return`<div class="work-rhythm-rail"><button class="work-rhythm-pill" type="button" data-wr-open><i></i><strong>${esc(phaseName(x))}</strong><span>·</span><span>${esc(remain(x))}</span><em>· ${esc(x.s?.[3]||"")}</em><b>⌄</b></button></div>`}
function syncBar(){const w=document.querySelector(".workspace");if(!w)return;const old=w.querySelector(":scope>.work-rhythm-rail");if(!rt.enabled){old?.remove();return}if(!old){w.insertAdjacentHTML("afterbegin",barHtml());w.querySelector("[data-wr-open]")?.addEventListener("click",e=>{e.stopPropagation();openPanel()})}else{const fresh=document.createElement("div");fresh.innerHTML=barHtml();const n=fresh.firstElementChild;if(old.innerHTML!==n.innerHTML){old.replaceWith(n);n.querySelector("[data-wr-open]")?.addEventListener("click",e=>{e.stopPropagation();openPanel()})}}}
function settingsHtml() {
  return `<section class="settings-group work-rhythm-settings">
    <div data-wr-settings-home>
      <button class="work-rhythm-settings-entry" type="button" data-wr-advanced>
        <span><strong>高级功能</strong><small>${rt.enabled ? "1 项已开启" : "1 项可用"}</small></span><b aria-hidden="true">›</b>
      </button>
    </div>
    <div data-wr-settings-advanced hidden>
      <div class="work-rhythm-settings-nav"><button type="button" data-wr-settings-home-back aria-label="返回设置">‹</button><strong>高级功能</strong><span></span></div>
      <div class="work-rhythm-settings-card">
        <div class="work-rhythm-settings-title">
          <div><strong>时间导航</strong><span>${rt.enabled ? "已开启" : "已锁定"}</span></div>
          ${rt.enabled
            ? '<button class="work-rhythm-disable" type="button" data-wr-disable>关闭</button>'
            : '<button type="button" data-wr-request-unlock>解锁</button>'}
        </div>
        <p>${rt.enabled ? `当前方案：${esc(activeProfile().name)}` : "验证后仅在当前设备启用。"}</p>
      </div>
    </div>
    <div data-wr-settings-unlock hidden>
      <div class="work-rhythm-settings-nav"><button type="button" data-wr-settings-advanced-back aria-label="返回高级功能">‹</button><strong>时间导航</strong><span></span></div>
      <div class="work-rhythm-settings-card">
        <div class="work-rhythm-settings-title"><div><strong>输入访问密码</strong><span>设备验证</span></div></div>
        <div class="work-rhythm-password-row"><input type="password" data-wr-password placeholder="访问密码" autocomplete="off"><button type="button" data-wr-unlock>开启</button></div>
        <p class="work-rhythm-password-error" data-wr-error hidden>密码不正确，请重试。</p>
      </div>
    </div>
  </section>`;
}
function syncSettings(initialView = "home") {
  const content = document.querySelector(".settings-panel .settings-content");
  if (!content || content.querySelector(".work-rhythm-settings")) return;
  content.insertAdjacentHTML("beforeend", settingsHtml());
  const section = content.querySelector(".work-rhythm-settings");
  const show = (view) => {
    section.querySelector("[data-wr-settings-home]").hidden = view !== "home";
    section.querySelector("[data-wr-settings-advanced]").hidden = view !== "advanced";
    section.querySelector("[data-wr-settings-unlock]").hidden = view !== "unlock";
  };
  section.querySelector("[data-wr-advanced]")?.addEventListener("click", () => show("advanced"));
  section.querySelector("[data-wr-settings-home-back]")?.addEventListener("click", () => show("home"));
  section.querySelector("[data-wr-request-unlock]")?.addEventListener("click", () => show("unlock"));
  section.querySelector("[data-wr-settings-advanced-back]")?.addEventListener("click", () => show("advanced"));
  section.querySelector("[data-wr-unlock]")?.addEventListener("click", unlock);
  section.querySelector("[data-wr-password]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlock();
  });
  section.querySelector("[data-wr-password]")?.addEventListener("input", () => {
    const error = section.querySelector("[data-wr-error]");
    if (error) error.hidden = true;
  });
  section.querySelector("[data-wr-disable]")?.addEventListener("click", disable);
  show(initialView);
}
function disable() {
  rt.enabled = false;
  localStorage.setItem(K.enabled, "0");
  closeAll();
  document.querySelector(".work-rhythm-settings")?.remove();
  syncSettings("advanced");
  syncBar();
  toast("时间导航已关闭");
}
async function unlock() {
  const input = document.querySelector("[data-wr-password]");
  const error = document.querySelector("[data-wr-error]");
  let ok = false;
  try {
    ok = await gate?.verifyPassword(input?.value || "");
  } catch {}
  if (!ok) {
    if (error) error.hidden = false;
    input?.focus();
    input?.select();
    return;
  }
  rt.enabled = true;
  localStorage.setItem(K.enabled, "1");
  document.querySelector(".work-rhythm-settings")?.remove();
  syncSettings("advanced");
  syncBar();
  toast("时间导航已开启");
}
function fields(s){return templates[s?.[4]]||["当前目标","已有结果","下一步"]}
function shell(body){return`<div class="work-rhythm-panel"><header><nav>${[["current","当前阶段"],["timeline","今日时间轴"],["templates","固定模板"],["export","导出给 ChatGPT"],["profiles","节奏方案"]].map(([i,l])=>`<button data-wr-tab="${i}" class="${rt.tab===i?"active":""}">${l}</button>`).join("")}</nav><button data-wr-close>×</button></header><main>${body}</main></div>`}
function currentView(){const x=phase();if(!x.s)return"<p>当前方案没有时间段。</p>";return`<div class="wr-eyebrow">当前阶段 · ${esc(x.p.name)}</div><div class="wr-current"><div><h3>${esc(phaseName(x))}</h3><p>${esc(x.s[4])}</p></div><span>${esc(remain(x))}</span></div><div class="wr-goal"><span>这段时间只做</span><strong>${esc(x.s[3])}</strong></div><div class="wr-preview">${fields(x.s).slice(0,3).map(f=>`<div><span>固定字段</span><strong>${esc(f)}</strong></div>`).join("")}</div><div class="wr-actions"><button data-wr-go="timeline">查看全天</button><button data-wr-go="profiles">切换方案</button><button data-wr-go="export">导出交接</button>${x.s[4]!=="无"?'<button class="primary" data-wr-record>记录本阶段</button>':""}</div>`}
function timelineView(){const x=phase();return`<div class="wr-profile-strip"><strong>当前：${esc(x.p.name)}</strong><button data-wr-go="profiles">切换 / 编辑</button></div><div class="wr-timeline">${x.p.slots.map(s=>`<article class="${s===x.s&&x.mode==="active"?"current":""}"><time>${esc(s[0])}</time><i></i><div><strong>${esc(s[2])}</strong><p>${esc(s[3])}</p></div><span>${esc(s[4])}</span></article>`).join("")}</div>`}
function templatesView(){return`<div class="wr-eyebrow">固定模板库</div><div class="wr-template-grid">${Object.entries(templates).filter(([n])=>n!=="无").map(([n,f])=>`<article><strong>${esc(n)}</strong><p>${f.map(esc).join(" / ")}</p></article>`).join("")}</div>`}
function exportText(p){const c=context(),x=phase(),days=p.id==="week"?7:p.id==="month"?30:1,cut=Date.now()-days*86400000,rs=recs().filter(r=>new Date(r.createdAt).getTime()>=cut).slice(0,40),rtext=rs.length?rs.map(r=>`### ${r.phase} · ${new Date(r.createdAt).toLocaleString("zh-CN")}\n${Object.entries(r.fields||{}).map(([k,v])=>`- ${k}：${v}`).join("\n")}`).join("\n\n"):"（暂无阶段记录）";return`${p.cmd}\n\n# LOOP 交接包\n\n## 当前任务\n${c.title}\n\n## 当前阶段\n${x.s?`${x.s[2]}：${x.s[3]}`:"未配置"}\n\n## LOOP 当前可见上下文\n${c.body||"（无）"}\n\n## 本地阶段记录\n${rtext}\n\n## 说明\n以上内容仅由 LOOP 本地已有数据整理导出，未在本地进行自动分析、总结或推断。`}
function exportView(){const p=exports.find(x=>x.id===rt.exp)||exports[0];return`<div class="wr-export"><aside>${exports.map(x=>`<button data-wr-exp="${x.id}" class="${x.id===p.id?"active":""}"><strong>${esc(x.title)}</strong><span>${esc(x.cmd)}</span></button>`).join("")}</aside><section><h3>${esc(p.title)}</h3><pre>${esc(exportText(p))}</pre><div class="wr-actions"><button data-wr-md>导出 .md</button><button class="primary" data-wr-copy>复制交接文本</button></div><small>本地只整理与导出，不提供自动分析能力。</small></section></div>`}
function profilesView(){const ps=profiles(),a=activeProfile();return`<div class="wr-eyebrow">工作节奏方案</div><div class="wr-profile-grid">${ps.map(p=>`<article class="${p.id===a.id?"active":""}"><strong>${esc(p.name)}</strong><p>${esc(p.desc)}</p><div>${p.id===a.id?"<span>当前启用</span>":`<button data-wr-use="${esc(p.id)}">切换</button>`}</div></article>`).join("")}</div><div class="wr-setting-row"><div><strong>自定义时间段</strong><p>修改开始/结束时间、阶段名称、此时只做什么、绑定模板。</p></div><button data-wr-edit>编辑方案</button></div>`}
const body=()=>rt.tab==="timeline"?timelineView():rt.tab==="templates"?templatesView():rt.tab==="export"?exportView():rt.tab==="profiles"?profilesView():currentView();
function openPanel(){closeAll();document.body.insertAdjacentHTML("beforeend",shell(body()));rt.panel=document.querySelector(".work-rhythm-panel");bindPanel()}
function redraw(){if(!rt.panel)return;rt.panel.outerHTML=shell(body());rt.panel=document.querySelector(".work-rhythm-panel");bindPanel()}
function bindPanel(){const p=rt.panel;if(!p)return;p.querySelector("[data-wr-close]")?.addEventListener("click",closeAll);p.querySelectorAll("[data-wr-tab]").forEach(b=>b.onclick=()=>{rt.tab=b.dataset.wrTab;redraw()});p.querySelectorAll("[data-wr-go]").forEach(b=>b.onclick=()=>{rt.tab=b.dataset.wrGo;redraw()});p.querySelector("[data-wr-record]")?.addEventListener("click",recordModal);p.querySelectorAll("[data-wr-exp]").forEach(b=>b.onclick=()=>{rt.exp=b.dataset.wrExp;redraw()});p.querySelector("[data-wr-copy]")?.addEventListener("click",async()=>{await navigator.clipboard.writeText(exportText(exports.find(x=>x.id===rt.exp)||exports[0]));toast("已复制交接文本")});p.querySelector("[data-wr-md]")?.addEventListener("click",()=>{const x=exports.find(x=>x.id===rt.exp)||exports[0],blob=new Blob([exportText(x)],{type:"text/markdown;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`loop-${x.id}-handoff.md`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0)});p.querySelectorAll("[data-wr-use]").forEach(b=>b.onclick=()=>{localStorage.setItem(K.active,b.dataset.wrUse);syncBar();redraw()});p.querySelector("[data-wr-edit]")?.addEventListener("click",profileDrawer)}
function recordModal(){const x=phase();if(!x.s)return;rt.panel?.remove();rt.panel=null;document.body.insertAdjacentHTML("beforeend",`<div class="work-rhythm-backdrop"><section class="work-rhythm-record"><header><div><h3>${esc(x.s[2])} · 阶段记录</h3><p>${esc(x.s[4])}</p></div><button data-wr-x>×</button></header><main>${fields(x.s).map(f=>`<label><span>${esc(f)}</span><textarea data-field="${esc(f)}"></textarea></label>`).join("")}</main><footer><span>仅保存到本地。</span><div><button data-wr-cancel>取消</button><button class="primary" data-wr-save>保存记录</button></div></footer></section></div>`);rt.modal=document.querySelector(".work-rhythm-backdrop");rt.modal.querySelector("[data-wr-x]").onclick=closeAll;rt.modal.querySelector("[data-wr-cancel]").onclick=closeAll;rt.modal.querySelector("[data-wr-save]").onclick=()=>{const fs={};rt.modal.querySelectorAll("[data-field]").forEach(t=>fs[t.dataset.field]=t.value.trim());const r=recs();r.unshift({createdAt:new Date().toISOString(),phase:x.s[2],profileId:x.p.id,fields:fs});write(K.records,r.slice(0,500));closeAll();toast("阶段记录已保存")}}
function profileDrawer(){rt.panel?.remove();rt.panel=null;const ps=profiles(),a=activeProfile();document.body.insertAdjacentHTML("beforeend",`<div class="work-rhythm-drawer-backdrop"><aside class="work-rhythm-drawer"><header><div><h3>编辑工作节奏方案</h3><p>方案和时间段只保存在本地。</p></div><button data-wr-dx>×</button></header><div class="wr-dbody"><aside>${ps.map(p=>`<button data-wr-pick="${esc(p.id)}" class="${p.id===a.id?"active":""}"><strong>${esc(p.name)}</strong><span>${p.slots.length} 个时间段</span></button>`).join("")}<button data-wr-new>＋ 新建方案</button><button data-wr-copy-profile>⧉ 复制当前方案</button></aside><section><input data-wr-pname value="${esc(a.name)}"><textarea data-wr-pdesc>${esc(a.desc)}</textarea><div class="wr-slot-head"><span>开始</span><span>结束</span><span>阶段</span><span>此时只做什么</span><span>模板</span><span></span></div><div data-wr-slots>${slotRows(a)}</div><button data-wr-add>＋ 添加时间段</button></section></div><footer><span>关闭前请保存修改。</span><div><button data-wr-dcancel>取消</button><button class="primary" data-wr-psave>保存方案</button></div></footer></aside></div>`);rt.drawer=document.querySelector(".work-rhythm-drawer-backdrop");bindDrawer(a.id)}
function slotRows(p){return p.slots.map((s,i)=>`<div class="wr-slot-row"><input value="${esc(s[0])}"><input value="${esc(s[1])}"><input value="${esc(s[2])}"><input value="${esc(s[3])}"><select>${Object.keys(templates).map(n=>`<option ${n===s[4]?"selected":""}>${esc(n)}</option>`).join("")}</select><button data-wr-del>×</button></div>`).join("")}
function bindDrawer(id){const d=rt.drawer;if(!d)return;const close=()=>{d.remove();rt.drawer=null};d.querySelector("[data-wr-dx]").onclick=close;d.querySelector("[data-wr-dcancel]").onclick=close;d.querySelectorAll("[data-wr-pick]").forEach(b=>b.onclick=()=>{localStorage.setItem(K.active,b.dataset.wrPick);close();profileDrawer();syncBar()});d.querySelectorAll("[data-wr-del]").forEach(b=>b.onclick=()=>b.closest(".wr-slot-row").remove());d.querySelector("[data-wr-add]").onclick=()=>{d.querySelector("[data-wr-slots]").insertAdjacentHTML("beforeend",`<div class="wr-slot-row"><input value="18:10"><input value="18:30"><input value="新阶段"><input value="填写此时只做什么"><select>${Object.keys(templates).map(n=>`<option>${esc(n)}</option>`).join("")}</select><button data-wr-del>×</button></div>`);d.querySelectorAll("[data-wr-del]").forEach(b=>b.onclick=()=>b.closest(".wr-slot-row").remove())};d.querySelector("[data-wr-new]").onclick=()=>{const ps=profiles(),nid=`custom-${Date.now()}`;ps.push({id:nid,name:"我的方案",desc:"自定义工作节奏。",slots:[["09:00","10:00","新阶段","填写此时只做什么","无"]]});write(K.profiles,ps);localStorage.setItem(K.active,nid);close();profileDrawer();syncBar()};d.querySelector("[data-wr-copy-profile]").onclick=()=>{const ps=profiles(),src=ps.find(p=>p.id===id);if(!src)return;const cp=structuredClone(src);cp.id=`copy-${Date.now()}`;cp.name+=` 副本`;ps.push(cp);write(K.profiles,ps);localStorage.setItem(K.active,cp.id);close();profileDrawer()};d.querySelector("[data-wr-psave]").onclick=()=>{const ps=profiles(),p=ps.find(p=>p.id===id);if(!p)return;p.name=d.querySelector("[data-wr-pname]").value.trim()||"未命名方案";p.desc=d.querySelector("[data-wr-pdesc]").value.trim();p.slots=Array.from(d.querySelectorAll(".wr-slot-row")).map(r=>Array.from(r.querySelectorAll("input,select")).map(e=>e.value.trim()));write(K.profiles,ps);close();syncBar();toast("工作节奏方案已保存")}}
function closeAll(){rt.panel?.remove();rt.modal?.remove();rt.drawer?.remove();rt.panel=rt.modal=rt.drawer=null}
function toast(s){document.querySelector(".work-rhythm-toast")?.remove();const n=document.createElement("div");n.className="work-rhythm-toast";n.textContent=s;document.body.append(n);setTimeout(()=>n.remove(),1500)}
document.addEventListener("loop-work-rhythm:disable",disable);
document.addEventListener("pointerdown",e=>{if(rt.panel&&!rt.panel.contains(e.target)&&!e.target.closest("[data-wr-open]")){rt.panel.remove();rt.panel=null}if(rt.modal&&e.target===rt.modal){rt.modal.remove();rt.modal=null}if(rt.drawer&&e.target===rt.drawer){rt.drawer.remove();rt.drawer=null}});document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(rt.modal){rt.modal.remove();rt.modal=null}else if(rt.drawer){rt.drawer.remove();rt.drawer=null}else if(rt.panel){rt.panel.remove();rt.panel=null}});
const root=document.getElementById("root");new MutationObserver(()=>{syncBar();syncSettings()}).observe(root,{childList:true,subtree:false});setInterval(syncBar,30000);syncBar();syncSettings();
})();
