(() => {
  'use strict';
  const model=globalThis.LoopWorkNavigationModel,previousSettings=renderSettings,previousRender=render;
  const navigation=model.defaultWorkNavigation(new Date('2026-10-02T14:20:00'));
  navigation.config.growth.sourceGroupId='日常学习';
  let enabled=false,gateOpen=false,gateError='',tab='current',kind='work',panelOpen=false,manual=null;
  let demoTime='friday',settingsError='',blocked=new Set(),queues={work:[],growth:[]},importDraft=null;
  const timePoints=[['工作开始','workStart'],['上午结束','morningEnd'],['下午开始','afternoonStart'],['休息开始','restStart'],['休息结束','restEnd'],['学习过渡','transitionStart'],['学习开始','learningStart'],['学习结束','learningEnd']];
  const now=()=>new Date({friday:'2026-10-02T14:20:00',rest:'2026-10-02T15:20:00',growth:'2026-10-02T17:20:00',weekend:'2026-10-03T10:00:00',ended:'2026-10-02T19:00:00'}[demoTime]);
  const btn=(a,label,primary=false,extra='')=>`<button type="button" class="button${primary?' primary':''}" data-work15="${a}" ${extra}>${label}</button>`;
  const adapted=()=>tasks.filter(t=>!isQuick(t)).map((t,i)=>({...t,id:String(t.id),groupId:t.group,status:t.done?'done':'todo',order:i,deadlineAt:t.deadlineAt?`${t.deadlineAt}T${t.deadlineTime||'18:00'}:00`:'',nodes:t.nodes||[]}));
  function queue(k) {
    const candidates=k==='growth'?model.resolveGrowthCandidates(adapted(),navigation.config.growth.sourceGroupId,[...blocked]):model.resolveWorkCandidates({tasks:adapted(),todayTaskIds:todayTaskItems().map(t=>String(t.id)),sourceGroupId:navigation.config.growth.sourceGroupId,now:now(),blockedTaskIds:[...blocked]});
    queues[k]=model.reconcileQueueIds(candidates,queues[k]);
    return queues[k].map(id=>tasks.find(t=>String(t.id)===id)).filter(Boolean);
  }
  function view() {
    const phase=model.resolvePhase(now(),navigation);
    if(manual && !['break','meeting'].includes(phase.phase?.type))Object.assign(phase,{phase:manual,mode:'active',manual:true});
    const k=phase.phase?.type==='growth'?'growth':'work',list=queue(k),task=list[0];
    return {phase,k,list,task,paused:['break','meeting'].includes(phase.phase?.type),canAct:phase.mode==='active'&&['growth','work'].includes(phase.phase?.type)};
  }
  function settingsBody() {
    const c=navigation.config,s=c.schedule;
    return `<h2>高级功能</h2><p>按需要启用附加能力，保持日常任务工作台简洁。</p><div class="setting-row"><div><span class="setting-label">工作与成长导航</span><p>根据时间安排，衔接工作和学习任务。</p></div><button class="prefs-switch" role="switch" aria-label="工作与成长导航" aria-checked="${enabled}" data-work15="toggle"></button></div>${!enabled?`${gateOpen?`<form class="work15-gate" id="work15-unlock"><label for="work15-password">访问密码</label><input type="password" id="work15-password" autocomplete="off"><button class="button primary" type="submit">验证并开启</button><p class="prefs-native-caption">设计演示密码：demo。真实应用仍使用原有验证机制。</p>${gateError?`<p class="work15-error" role="alert">${gateError}</p>`:''}</form>`:''}<p class="prefs-native-caption">开启后，顶部会显示当前阶段入口。</p>`:`<div class="setting-row"><div><span class="setting-label">当前阶段</span><p>${esc(view().phase.phase?.label||'工作与成长')} · 演示时间</p></div>${btn('open','查看导航')}</div><form class="work15-form" id="work15-config"><fieldset><legend>工作日</legend><div class="work15-weekdays">${[[1,'一'],[2,'二'],[3,'三'],[4,'四'],[5,'五'],[6,'六'],[0,'日']].map(([v,l])=>`<label><input type="checkbox" name="workday" value="${v}" ${c.workdays.includes(v)?'checked':''} aria-label="星期${l}"><span>${l}</span></label>`).join('')}</div></fieldset><fieldset><legend>每日时间</legend><div class="work15-time-grid">${timePoints.map(([l,k])=>`<label>${l}<input type="time" name="${k}" value="${s[k]}" required></label>`).join('')}</div><p>午休和深度工作由相邻时间自动填充；每日学习至少 60 分钟。</p></fieldset><fieldset><legend>周五例会</legend><div class="work15-range"><input type="time" name="fridayMeetingStart" aria-label="例会开始" value="${s.fridayMeetingStart}" required><span>至</span><input type="time" name="fridayMeetingEnd" aria-label="例会结束" value="${s.fridayMeetingEnd}" required></div></fieldset><fieldset><legend>学习来源</legend><label class="work15-source">指定任务分组<select name="source"><option value="">请选择分组</option>${taskGroups.map(g=>`<option ${g===c.growth.sourceGroupId?'selected':''}>${esc(g)}</option>`).join('')}</select></label><p>此分组的未完成任务按分组顺序进入学习队列，并从工作队列排除。</p></fieldset><fieldset><legend>周末学习</legend><label class="work15-checkbox"><input type="checkbox" name="weekendEnabled" ${c.growth.weekendEnabled?'checked':''}>启用周末学习</label><div class="work15-time-grid"><label>学习时长（分钟）<input type="number" name="weekendDurationMinutes" min="60" max="720" value="${c.growth.weekendDurationMinutes}"></label><label>开始时间（可选）<input type="time" name="weekendStartTime" value="${c.growth.weekendStartTime}"></label></div><p>未设置开始时间时，可手动开始。</p></fieldset>${settingsError?`<p class="work15-error" role="alert">${settingsError}</p>`:''}<footer>${btn('reset','恢复默认时间')}<button class="button primary" type="submit">保存导航设置</button></footer></form><h3 class="prefs-subheading">导入任务</h3><div class="setting-row"><div><span class="setting-label">批量添加与学习计划</span><p>支持每行一个任务、JSON 任务列表和学习计划；导入前核对重复项与时长。</p></div>${btn('import','批量添加')}</div>`}`;
  }
  renderSettings=function() {
    if(state.settingsPane!=='advanced')return previousSettings();
    return pageHeading('设置','调整工作空间的外观与使用偏好。')+`<div class="settings-layout phase9"><nav class="settings-nav" aria-label="设置分类">${settingCategories.map(([v,l,i])=>`<button class="${v==='advanced'?'active':''}" data-settings-pane="${v}" aria-current="${v==='advanced'?'page':'false'}">${icon(i)}${l}</button>`).join('')}</nav><section class="settings-content"><div class="settings-document">${settingsBody()}</div></section></div>`;
  };
  render=function() {
    previousRender();
    if(enabled){const v=view();$('.topbar .shell-actions')?.insertAdjacentHTML('afterbegin',`<button class="work15-pill" data-work15="open" aria-label="工作与成长详情"><i></i><strong>${esc(v.phase.phase?.label||'工作与成长')}</strong><span>· ${v.phase.mode==='weekend-ready'?'等待开始':v.phase.mode==='ended'?'今日已结束':v.phase.mode==='off-day'?'今日未安排':`${v.phase.remainingMinutes} 分钟`}</span></button>`);}
  };
  function dialog(title,body,footer='') {
    $('#overlay').innerHTML=`<div class="dialog-backdrop" data-return-focus=".work15-pill"><section class="dialog work15-dialog" role="dialog" aria-modal="true" aria-label="${title}"><header class="dialog-head"><h2>${title}</h2><button class="icon-button" data-work15="close" aria-label="关闭">${icon('close')}</button></header>${body}<footer>${footer||btn('close','完成')}</footer></section></div>`;
    requestAnimationFrame(()=>$('.work15-dialog .work15-tabbar .active')?.focus()||$('.work15-dialog [data-work15="close"]')?.focus());
  }
  function currentBody(v) {
    const phase=v.phase,task=v.task;
    let title=task?.title||`${v.k==='growth'?'学习':'工作'}队列已完成`,support=task?`下一步：${model.resolveNextAction(task)}`:'队列中没有可执行任务。';
    if(v.paused){title=phase.phase.type==='meeting'?'参加周例会':'暂时离开工作队列';support=`队列保持原顺序，${phase.phase.end} 后自动继续。`;}
    else if(phase.mode==='weekend-ready'){title='开始周末学习';support=`从「${navigation.config.growth.sourceGroupId||'未配置'}」继续，计划 ${phase.remainingMinutes} 分钟。`;}
    else if(phase.mode==='ended'){title='今天的时间安排已结束';support='仍可从队列中手动打开任务。';}
    else if(phase.mode==='off-day'){title='今天没有自动安排';support='可以查看任务队列，或调整工作日。';}
    else if(phase.mode==='next'||phase.mode==='gap'){title=`下一阶段：${phase.phase?.label||'工作'}`;support=`${phase.phase?.start||'稍后'} 开始。`;}
    else if(v.k==='growth'&&!navigation.config.growth.sourceGroupId){title='尚未配置学习来源';support='在导航设置中选择一个任务分组。';}
    return `<div class="work15-current"><div class="work15-current-top"><span>${esc(phase.phase?.label||'今日安排')}${phase.manual?' · 手动选择':''}</span><span>${phase.phase?.start||''}${phase.phase?.end?' – '+phase.phase.end:''}</span></div><h3>${esc(title)}</h3><p>${esc(support)}</p>${v.canAct&&task?btn('task','打开任务',false,`data-task-id="${task.id}"`):''}</div>`;
  }
  function scheduleBody(v) {
    const phases=model.phasesForDate(navigation,now()),total=phases.reduce((s,p)=>s+model.minutes(p.end)-model.minutes(p.start),0)||1;
    return `<p class="work15-note">${demoTime==='weekend'?'周末学习':now().getDay()===5?'周五 · 含固定例会':'普通工作日'} · 手动选择在下一个时间边界恢复自动导航。</p><div class="work15-timeline" aria-hidden="true">${phases.map(p=>`<i class="${p.type}" style="flex:${Math.max(1,model.minutes(p.end)-model.minutes(p.start)) / total}"></i>`).join('')}</div>${phases.map(p=>`<button class="work15-phase ${v.phase.phase?.id===p.id?'active':''}" data-work15="phase" data-phase="${p.id}" ${v.paused||!['work','growth'].includes(p.type)?'disabled':''}><time>${p.start}–${p.end}</time><span>${esc(p.label)}</span><small>${v.phase.phase?.id===p.id?'当前':['work','growth'].includes(p.type)?'进入':'自动'}</small></button>`).join('')||'<p class="work15-empty">今日未安排工作时段。</p>'}`;
  }
  function queueBody(v) {
    const list=queue(kind),interactive=v.canAct&&v.k===kind;
    return `<div class="work15-queue-head"><div class="segmented">${[['work','工作队列'],['growth','学习队列']].map(([k,l])=>`<button data-work15="kind" data-kind="${k}" class="${k===kind?'active':''}" aria-pressed="${k===kind}">${l} ${queue(k).length}</button>`).join('')}</div><div class="work15-queue-actions">${btn('skip','跳过一次',false,interactive&&list.length>1?'':'disabled')}${btn('defer','移至末尾',false,interactive&&list.length>1?'':'disabled')}${btn('block','卡住',false,interactive&&list.length?'':'disabled')}</div></div><p class="work15-note">${kind==='growth'?`来源：「${esc(navigation.config.growth.sourceGroupId||'未配置')}」分组顺序`:'逾期 → 今日临近截止 → 今日高优先级 → 其他任务'}${!interactive?' · 当前阶段仅可查看':''}</p>${list.map((t,i)=>`<div class="work15-task"><span class="work15-rank">${String(i+1).padStart(2,'0')}</span><div class="work15-task-copy"><button data-work15="task" data-task-id="${t.id}">${esc(t.title)}</button><p>${esc(model.resolveNextAction(t))}</p></div><select class="work15-duration" data-work15-estimate="${t.id}" aria-label="${esc(t.title)}的预计时长">${[...new Set([30,45,60,90,t.estimateMinutes||60])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${n===(t.estimateMinutes||60)?'selected':''}>${n} 分钟</option>`).join('')}</select><button class="text-button" data-work15="choose" data-task-id="${t.id}" ${!interactive||i===0?'disabled':''}>${i===0&&interactive?'当前':'现在开始'}</button></div>`).join('')||'<p class="work15-empty">队列中没有未完成任务。</p>'}${blocked.size?`<h3 class="prefs-subheading">已暂停</h3>${[...blocked].map(id=>{const t=tasks.find(t=>String(t.id)===id);return t?`<div class="work15-task"><span class="work15-task-copy">${esc(t.title)}</span><button class="text-button" data-work15="recover" data-task-id="${id}">恢复到队列</button></div>`:'';}).join('')}`:''}`;
  }
  function panel() {
    panelOpen=true;const v=view();
    dialog('工作与成长',`<div class="work15-tabbar">${[['current','当前阶段'],['schedule','全天安排'],['queue','任务队列']].map(([t,l])=>`<button data-work15="tab" data-tab="${t}" class="${tab===t?'active':''}" aria-pressed="${tab===t}">${l}</button>`).join('')}<button class="text-button" data-work15="settings">导航设置</button></div><main class="work15-body">${tab==='current'?currentBody(v):tab==='schedule'?scheduleBody(v):queueBody(v)}</main>`,`<small>设计演示 · ${now().getDay()===5?'周五':'周末'} ${now().toTimeString().slice(0,5)}</small>${tab==='current'&&v.phase.mode==='weekend-ready'?btn('weekend','开始学习',true):tab==='current'&&v.canAct&&v.task?btn('skip','跳过一次')+btn('defer','移至末尾')+btn('block','卡住')+btn('complete','完成并继续',true):btn('close','完成')}`);
  }
  function importOpen() {
    panelOpen=false;importDraft=importDraft||{raw:'',group:navigation.config.growth.sourceGroupId||taskGroups[0]||'未分组',minutes:60,preview:null,selected:new Set(),estimates:{},error:''};
    const d=importDraft;
    dialog('批量添加任务',`<main class="work15-body work15-import"><p class="work15-note">支持纯文本、JSON 任务列表与 Loop 学习计划。导入前可选择任务、调整时长并跳过重复项。</p><div class="work15-import-fields"><label>添加到<select id="work15-import-group">${['未分组',...taskGroups].map(g=>`<option ${g===d.group?'selected':''}>${esc(g)}</option>`).join('')}</select></label><label>默认时长<select id="work15-import-minutes">${[30,45,60,90].map(n=>`<option value="${n}" ${n===d.minutes?'selected':''}>${n} 分钟</option>`).join('')}</select></label></div><div class="work15-file"><label for="work15-import-raw">任务列表</label><input type="file" id="work15-import-file" accept=".json,.txt,.md" aria-label="选择 JSON 或文本文件"></div><textarea id="work15-import-raw" placeholder="1. 区分 RDMA、RoCE 与 InfiniBand&#10;2. 画出 RDMA 数据路径&#10;3. 理解 Queue Pair 与 QP 状态机">${esc(d.raw)}</textarea>${d.error?`<p class="work15-error" role="alert">${esc(d.error)}</p>`:''}</main>`,btn('close','取消')+btn('preview','预览任务',true));
    requestAnimationFrame(()=>$('#work15-import-raw')?.focus());
  }
  function importPreview() {
    const d=importDraft,p=d.preview;
    dialog('核对导入任务',`<main class="work15-body"><p class="work15-note">添加到「${esc(d.group)}」 · ${p.items.length} 项，${p.existingTasks.length} 项重复</p><ul class="work15-preview">${p.items.map((t,i)=>`<li><input type="checkbox" id="work15-item-${i}" data-work15-check="${i}" ${d.selected.has(t.key)?'checked':''} ${t.duplicateReason?'disabled':''}><label for="work15-item-${i}">${esc(t.title)}${t.duplicateReason?'<small>重复 · 跳过</small>':''}</label><input type="number" min="1" max="1440" data-work15-minutes="${i}" aria-label="${esc(t.title)}的预计时长（分钟）" value="${d.estimates[t.key]||t.estimateMinutes}" ${t.duplicateReason?'disabled':''}></li>`).join('')}</ul><p class="work15-preview-summary" id="work15-preview-summary"></p></main>`,btn('back-import','返回编辑')+btn('import-confirm','添加所选任务',true));summary();
  }
  function summary() {
    const d=importDraft,list=d.preview.items.filter(t=>d.selected.has(t.key)),invalid=!!$('.work15-preview input[type=number]:invalid');$('#work15-preview-summary').innerHTML=`<span>已选择 ${list.length} 项</span><span${invalid?' class="work15-error"':''}>${invalid?'时长需为 1–1440 分钟':`预计 ${list.reduce((s,t)=>s+(d.estimates[t.key]||t.estimateMinutes),0)} 分钟`}</span>`;$('[data-work15="import-confirm"]').disabled=!list.length||invalid;
  }
  function saveConfig(form) {
    const f=new FormData(form),schedule={...navigation.config.schedule};Object.keys(schedule).forEach(k=>schedule[k]=String(f.get(k)||''));
    const validation=model.validateSchedule(schedule);
    settingsError=validation.valid?'':validation.errors[0].message;
    if(settingsError){const old=$('.work15-error');old?.remove();form.querySelector('footer').insertAdjacentHTML('beforebegin',`<p class="work15-error" role="alert">${esc(settingsError)}</p>`);return;}
    Object.assign(navigation.config,{schedule,workdays:f.getAll('workday').map(Number)});
    Object.assign(navigation.config.growth,{sourceGroupId:String(f.get('source')||''),weekendEnabled:f.has('weekendEnabled'),weekendDurationMinutes:Number(f.get('weekendDurationMinutes')||60),weekendStartTime:String(f.get('weekendStartTime')||'')});
    manual=null;queues={work:[],growth:[]};render();toast('导航设置已保存');
  }
  document.addEventListener('submit',e=>{
    if(!['work15-unlock','work15-config'].includes(e.target.id))return;e.preventDefault();e.stopImmediatePropagation();
    if(e.target.id==='work15-config')return saveConfig(e.target);
    if($('#work15-password').value==='demo'){enabled=true;gateOpen=false;gateError='';render();toast('工作与成长导航已开启');}
    else {gateError='密码不正确，请重试。';render();$('#work15-password')?.focus();}
  },true);
  document.addEventListener('input',e=>{
    if(e.target.id==='work15-import-raw')importDraft.raw=e.target.value;
    if(e.target.dataset.work15Minutes!==undefined){const t=importDraft.preview.items[Number(e.target.dataset.work15Minutes)];if(e.target.validity.valid)importDraft.estimates[t.key]=Number(e.target.value);summary();}
  });
  document.addEventListener('change',async e=>{
    if(e.target.dataset.work15Estimate){tasks.find(t=>String(t.id)===e.target.dataset.work15Estimate).estimateMinutes=Number(e.target.value);return;}
    if(e.target.dataset.work15Check!==undefined){const t=importDraft.preview.items[Number(e.target.dataset.work15Check)];e.target.checked?importDraft.selected.add(t.key):importDraft.selected.delete(t.key);summary();}
    if(e.target.id==='work15-import-group')importDraft.group=e.target.value;
    if(e.target.id==='work15-import-minutes')importDraft.minutes=Number(e.target.value);
    if(e.target.id==='work15-import-file'){const file=e.target.files?.[0];if(file){const d=importDraft;d.raw=await file.text();if(importDraft===d&&$('#work15-import-raw'))$('#work15-import-raw').value=d.raw;}}
  });
  document.addEventListener('loop:overlay-dismiss',()=>panelOpen=false);
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-work15]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
    const a=b.dataset.work15,v=view();
    if(a==='review-help'||a==='review-work'){closeOverlay();state.settingsPane=a==='review-help'?'help':'advanced';navigate('settings');}
    else if(a==='toggle'){if(enabled){enabled=false;render();}else{gateOpen=!gateOpen;render();$('#work15-password')?.focus();}}
    else if(a==='open'){tab='current';kind=v.k;panel();}
    else if(a==='close'){panelOpen=false;closeOverlay();}
    else if(a==='tab'){tab=b.dataset.tab;panel();}
    else if(a==='kind'){kind=b.dataset.kind;panel();}
    else if(a==='settings'){panelOpen=false;closeOverlay();state.settingsPane='advanced';navigate('settings');}
    else if(a==='task'){panelOpen=false;closeOverlay();openLinkedTask(Number(b.dataset.taskId));}
    else if(a==='phase'){manual=model.phasesForDate(navigation,now()).find(p=>p.id===b.dataset.phase);kind=manual?.type==='growth'?'growth':'work';tab='current';render();panel();}
    else if(a==='choose'){queues[kind]=[b.dataset.taskId,...queues[kind].filter(id=>id!==b.dataset.taskId)];tab='current';render();panel();}
    else if(['skip','defer','block','complete'].includes(a)){
      const k=tab==='queue'?kind:v.k,list=queue(k),t=list[0];if(!t)return;
      if(a==='complete'){panelOpen=false;closeOverlay();openLinkedTask(t.id);toggleTaskCompletion(t);if(!t.done)return;}
      else if(a==='block')blocked.add(String(t.id));
      else if(list.length>1){const ids=list.map(t=>String(t.id));ids.shift();ids.splice(a==='skip'?1:ids.length,0,String(t.id));queues[k]=ids;}
      render();panel();
    }
    else if(a==='recover'){blocked.delete(b.dataset.taskId);render();panel();}
    else if(a==='weekend'){navigation.runtime.dateKey=model.localDateKey(now());navigation.runtime.weekendStartedAt=now().toISOString();render();panel();}
    else if(a==='reset'){$('#work15-config')?.querySelectorAll('input[type=time]').forEach(input=>input.value=model.DEFAULT_SCHEDULE[input.name]||'');settingsError='';}
    else if(a==='import')importOpen();
    else if(a==='back-import'){importDraft.preview=null;importOpen();}
    else if(a==='preview'){
      const d=importDraft;d.raw=$('#work15-import-raw').value;d.group=$('#work15-import-group').value;d.minutes=Number($('#work15-import-minutes').value);
      d.preview=model.previewTaskBatchImport(d.raw,adapted(),{groupId:d.group,defaultEstimateMinutes:d.minutes});
      if(!d.preview.valid){d.error=d.preview.errors[0]?.message||'任务列表无效';importOpen();return;}
      if(d.preview.sourceKind==='learning-plan'&&d.preview.batch.targetGroup&&d.group!==d.preview.batch.targetGroup){d.group=d.preview.batch.targetGroup;d.preview=model.previewTaskBatchImport(d.raw,adapted(),{groupId:d.group,defaultEstimateMinutes:d.minutes});}
      d.selected=new Set(d.preview.newTasks.map(t=>t.key));d.estimates={};d.error='';importPreview();
    }
    else if(a==='import-confirm'){
      const d=importDraft,items=d.preview.items.filter(t=>d.selected.has(t.key));if(!items.length)return;
      if(d.group!=='未分组'&&!taskGroups.includes(d.group))taskGroups.push(d.group);
      if(d.preview.sourceKind==='learning-plan'&&!navigation.config.growth.sourceGroupId)navigation.config.growth.sourceGroupId=d.group;
      const convert=(n,i)=>node(`import-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}`,n.title||n.text||'处理步骤',n.status||'todo',(n.children||[]).map(convert),n.record||n.description||'');
      let nextId=Math.max(...tasks.map(t=>Number(t.id)||0))+1;
      items.forEach(t=>tasks.push({id:nextId++,title:t.title,group:d.group,priority:state.settings.newPriority,today:false,done:false,deadline:'',deadlineAt:'',description:t.description||'',progress:'',conclusion:'',nodes:(t.nodes||[]).map(convert),notes:'',history:[['今天','从任务列表导入']],createdAt:demoToday,updatedAt:demoToday,type:'task',estimateMinutes:d.estimates[t.key]||t.estimateMinutes,origin:t.origin}));
      importDraft=null;panelOpen=false;closeOverlay();render();toast(`已添加 ${items.length} 个任务到「${d.group}」`);
    }
  },true);
  $('.review-controls').insertAdjacentHTML('afterbegin','<label for="work15-time">导航时间</label><select id="work15-time" aria-label="预览导航阶段"><option value="friday">周五工作</option><option value="rest">周五例会</option><option value="growth">个人成长</option><option value="weekend">周末学习</option><option value="ended">今日结束</option></select>');
  $('#work15-time').addEventListener('change',e=>{demoTime=e.target.value;manual=null;navigation.runtime.weekendStartedAt='';render();if(panelOpen)panel();});
  globalThis.loopFinalStagesReview=function(){dialog('第十四、十五阶段评审',`<main class="work15-body"><p class="work15-note">已调整浮窗设置与三栏底部。进入设置体验以下两个阶段：</p><div class="setting-row"><div><strong>帮助与反馈</strong><p class="work15-note">使用说明、反馈表单、校验与失败重试。</p></div>${btn('review-help','查看')}</div><div class="setting-row"><div><strong>工作与成长</strong><p class="work15-note">解锁、安排、队列与批量导入。演示密码 demo。</p></div>${btn('review-work','查看')}</div><p class="work15-note">底部「导航时间」和「反馈」可切换演示场景。修改只保留在本页，刷新恢复示例；未连接真实反馈或桌面功能。</p></main>`);};
  reviewInfo=globalThis.loopFinalStagesReview;
  globalThis.loopWidgetReview=globalThis.loopFinalStagesReview;
  document.title='Loop · 第十四、十五阶段设计';$('.review-bar b').textContent='第十四、十五阶段 · 帮助与成长';$('.review-bar .review-note').textContent='浮窗设置 · 三栏底部 · 反馈 · 工作导航';
  if(Number(new URLSearchParams(location.search).get('phase')||0)>=24){
    globalThis.loopWorkGroup24=Object.freeze({source:()=>navigation.config.growth.sourceGroupId,change:(from,to)=>{if(navigation.config.growth.sourceGroupId===from){navigation.config.growth.sourceGroupId=to;navigation.runtime.activeGrowthTaskId='';}}});
  }
  render();
})();
