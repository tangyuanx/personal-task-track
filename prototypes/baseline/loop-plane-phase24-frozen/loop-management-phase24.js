(() => {
  const phase = Number(new URLSearchParams(location.search).get('phase') || 23);
  if (phase < 24) return;
  document.body.dataset.management24Enabled = '';
  let titleSession = null, retainedTask = null, moveDraft = null, propertyDraft = null;
  let organizerQuery = '', deleteDraft = null, undoDelete = null, rowTitleSession = null, lastNameClick = null;
  const titleDrafts = new Map(), propertyDrafts = new Map();
  const source = () => globalThis.loopWorkGroup24?.source() || '';
  const groupOptions = () => ['未分组', ...taskGroups];
  const byId = id => tasks.find(t => t.id === Number(id));
  const option = (v,l,current) => `<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(l)}</option>`;
  const activeTitle = () => $('#manage24-title');
  function renameTask(t, value) {
    if (t.title === value) return;
    t.title = value; touchTask(t);
    // Demo notebook sessions retain their content/file identity; a task rename never renames disk files.
    if (t.knowledgeNote) t.knowledgeNote.title = value;
    t.history ||= []; t.history.unshift(['刚刚','修改任务标题']);
  }
  function drawRowTitle() {
    if(!rowTitleSession)return;
    const row=$(`.task-select[data-task="${rowTitleSession.id}"]`);
    if(row)row.outerHTML=`<div class="manage24-row-title"><input id="manage24-row-title" class="manage24-row-title-input" maxlength="160" aria-label="任务名称" aria-describedby="manage24-row-error" value="${esc(rowTitleSession.value)}"><span class="manage24-inline-error" id="manage24-row-error" role="status">${esc(rowTitleSession.error||'')}</span></div>`;
  }
  function beginRowTitle(id) {
    const t=byId(id);if(!t)return;
    closeOverlay();state.menu=false;retainedTask=null;
    if(titleSession&&endTitle()===false)return;
    rowTitleSession={id:t.id,value:t.title,error:''};state.task=t.id;render();
    $('#manage24-row-title')?.focus();$('#manage24-row-title')?.select();
  }
  function endRowTitle(cancel=false,fromBlur=false) {
    if(!rowTitleSession)return true;
    const s=rowTitleSession,t=byId(s.id),value=s.value.trim();
    if(!cancel&&!value){s.error='请输入任务名称';$('#manage24-row-error').textContent=s.error;$('#manage24-row-title').setAttribute('aria-invalid','true');return false;}
    rowTitleSession=null;if(!cancel&&t)renameTask(t,value);
    if(fromBlur&&t){
      // Preserve the clicked destination node so blur-save does not consume its click.
      const editor=$('.manage24-row-title');if(editor)editor.outerHTML=`<button class="task-select" data-task="${t.id}" aria-pressed="${t.id===state.task}" title="${esc(t.title)}"><span class="task-item-title">${esc(t.title)}</span></button>`;
      const heading=$('.workspace .task-title');if(heading&&state.task===t.id)heading.outerHTML=renderEditableTitle(t);
      return true;
    }
    render();
    $(`.task-select[data-task="${s.id}"]`)?.focus({preventScroll:true});return true;
  }
  renderEditableTitle = function(t) {
    if (titleSession?.id === t.id) return `<h1 class="task-title"><textarea id="manage24-title" class="manage24-title-input" rows="1" maxlength="160" aria-label="${isQuick(t)?'速记':'任务'}标题" aria-describedby="manage24-title-error">${esc(titleSession.value)}</textarea><p id="manage24-title-error" class="manage24-inline-error" role="status">${esc(titleSession.error||'')}</p></h1>`;
    return `<h1 class="task-title"><button class="title-edit" data-action="edit-record-title" aria-label="编辑${isQuick(t)?'速记':'任务'}标题">${esc(t.title)}${icon('edit')}</button></h1>`;
  };
  function resizeTitle() { const el=activeTitle();if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';} }
  function beginTitle(t=currentTask()) {
    if(!t)return;closeOverlay();state.menu=false;
    titleSession={id:t.id,value:titleDrafts.get(t.id)??t.title,before:t.title,error:''};
    const heading=$('.workspace .task-title');if(heading)heading.outerHTML=renderEditableTitle(t);
    activeTitle()?.focus();activeTitle()?.select();resizeTitle();
  }
  function endTitle(cancel=false,fromBlur=false) {
    if(!titleSession)return;
    const s=titleSession,t=byId(s.id),value=s.value.trim();
    if(!cancel&&!value){s.error='请输入任务名称';titleDrafts.set(s.id,s.value);const e=$('#manage24-title-error');if(e)e.textContent=s.error;activeTitle()?.setAttribute('aria-invalid','true');return false;}
    titleSession=null;titleDrafts.delete(s.id);if(!cancel&&t)renameTask(t,value);
    const heading=$('.workspace .task-title');if(heading&&t)heading.outerHTML=renderEditableTitle(t);
    if(!cancel&&t&&value!==s.before){if(fromBlur){const label=$(`.task-select[data-task="${t.id}"] .task-item-title`);if(label)label.textContent=t.title;$(`.task-select[data-task="${t.id}"]`)?.setAttribute('title',t.title);}else render();receipt('标题已修改');}
    return true;
  }
  function capturePanel() {
    const p=$('#manage24-property-form');if(p&&propertyDraft){const f=new FormData(p);Object.assign(propertyDraft,{title:String(f.get('title')||''),group:String(f.get('group')||'未分组'),today:f.has('today'),blocked:f.has('blocked'),later:f.has('later'),estimate:String(f.get('estimate')||''),date:String(f.get('date')||''),time:String(f.get('time')||'18:00'),reminder:String(f.get('reminder')??'none'),cycle:String(f.get('cycle')||'none'),cycleTime:String(f.get('cycleTime')||'09:00'),weekdays:f.getAll('weekday').map(Number)});}
  }
  const priorClose=closeOverlay;
  closeOverlay=function(){capturePanel();priorClose();};
  function mount(markup,trigger,width=360,selector) {
    closeOverlay();mountSurface(markup,trigger||$('[data-action="task-menu"]')||$('[data-action="new-group"]'),Math.min(width,innerWidth-24));
    const p=$('#overlay .surface-popover');if(selector)p.dataset.returnFocus=selector;
    p.style.top=Math.max(12,Math.min(parseFloat(p.style.top)||60,innerHeight-p.offsetHeight-48))+'px';
  }
  function receipt(text, action, label) {
    clearTimeout(toastTimer);$('#toast').innerHTML=`<div class="toast manage24-receipt"><span>${esc(text)}</span>${action?`<button data-manage24="${action}">${esc(label)}</button>`:''}</div>`;
    toastTimer=setTimeout(()=>{$('#toast').innerHTML='';if(action==='undo-group')undoDelete=null;},action==='undo-group'?12000:6500);
  }
  function taskMenu(t) {
    return `<div class="popover" role="menu" aria-label="任务操作"><button role="menuitem" data-manage24="properties">${icon('edit')}编辑属性</button><button role="menuitem" data-action="move-record">${icon('folder')}移动到分组…</button><div class="menu-divider"></div><button role="menuitem" data-action="toggle-today">${icon('home')}${t.today?'取消手动加入今日':'加入今日'}</button><button role="menuitemcheckbox" aria-checked="${!!t.tags?.blocked}" data-task-tag="blocked">${icon('blocked')}${t.tags?.blocked?'取消卡住':'标记卡住'}</button><button role="menuitemcheckbox" aria-checked="${!!t.tags?.later}" data-task-tag="later">${icon('later')}${t.tags?.later?'取消稍后':'标记稍后'}</button><div class="menu-divider"></div><button role="menuitem" data-knowledge-action="export-task">${icon('note')}分享／导出任务…</button><button role="menuitem" data-action="copy-task">${icon('note')}复制任务摘要</button><button class="danger-action" role="menuitem" data-action="delete-record">${icon('close')}删除任务…</button></div>`;
  }
  renderMenu=taskMenu;
  function properties(trigger) {
    const t=currentTask();if(!t)return;state.menu=false;
    capturePanel();
    if(propertyDraft?.id!==t.id)propertyDraft=propertyDrafts.get(t.id)||{id:t.id,title:t.title,group:t.group,priority:t.priority,today:!!t.today,blocked:!!t.tags?.blocked,later:!!t.tags?.later,estimate:t.estimateMinutes||'',date:t.deadlineAt||'',time:t.deadlineTime||'18:00',reminder:String(t.deadlineReminderMinutes??'none'),cycle:t.recurrence?.frequency||'none',cycleTime:t.recurrence?.time||'09:00',weekdays:t.recurrence?.weekdays||[1,2,3,4,5],expanded:false};
    propertyDrafts.set(t.id,propertyDraft);
    render();drawProperties($('[data-action="task-menu"]')||trigger);
  }
  function drawProperties(trigger) {
    const d=propertyDraft,t=byId(d.id),quick=isQuick(t);
    mount(`<form class="surface-popover manage24-panel" id="manage24-property-form" role="dialog" aria-modal="true" aria-label="编辑${quick?'速记':'任务'}属性" novalidate>${surfaceHeader(quick?'速记属性':'任务属性')}<div class="manage24-body"><div class="manage24-fields"><div class="manage24-full"><label for="manage24-property-title">标题</label><input id="manage24-property-title" name="title" maxlength="160" value="${esc(d.title)}" aria-describedby="manage24-property-error"></div><div class="manage24-full"><label for="manage24-property-group">分组</label><select id="manage24-property-group" name="group">${groupOptions().map(g=>option(g,g,d.group)).join('')}</select></div>${quick?'':`<div class="manage24-full"><label id="manage24-priority-label">优先级</label><div class="manage24-choices" role="group" aria-labelledby="manage24-priority-label">${[['high','高'],['medium','中'],['low','低']].map(([v,l])=>`<button type="button" class="manage24-choice" data-manage24-priority="${v}" aria-pressed="${d.priority===v}">${l}</button>`).join('')}</div></div>`}</div>${quick?'':`<div class="manage24-tags"><label><input type="checkbox" name="today" ${d.today?'checked':''}>手动加入今日</label><label><input type="checkbox" name="blocked" ${d.blocked?'checked':''}>卡住</label><label><input type="checkbox" name="later" ${d.later?'checked':''}>稍后</label></div><button type="button" class="manage24-disclosure" data-manage24="time" aria-expanded="${d.expanded}" aria-controls="manage24-time">${icon('chevron')}时间与安排<small>${d.date?displayDate(d.date):'按需设置'}</small></button><div class="manage24-time" id="manage24-time" ${d.expanded?'':'hidden'}><div class="manage24-fields"><div><label for="manage24-date">截止日期</label><input id="manage24-date" name="date" type="date" value="${d.date}"></div><div><label for="manage24-time-input">截止时间</label><input id="manage24-time-input" name="time" type="time" value="${d.time}"></div><div class="manage24-full"><label for="manage24-reminder">提醒</label><select id="manage24-reminder" name="reminder">${Object.entries(reminderNames).map(([v,l])=>option(v,l,d.reminder)).join('')}</select></div><div><label for="manage24-cycle">循环</label><select id="manage24-cycle" name="cycle">${[['none','不循环'],['daily','每天'],['weekly','每周']].map(([v,l])=>option(v,l,d.cycle)).join('')}</select></div><div><label for="manage24-cycle-time">进入今日的时间</label><input id="manage24-cycle-time" name="cycleTime" type="time" value="${d.cycleTime}"></div><div class="manage24-full" id="manage24-weekdays" ${d.cycle==='weekly'?'':'hidden'}><label>重复日期</label><div class="manage24-tags">${[1,2,3,4,5,6,0].map(v=>`<label><input type="checkbox" name="weekday" value="${v}" ${d.weekdays.includes(v)?'checked':''}>${weekdayNames[v].slice(1)}</label>`).join('')}</div></div><div class="manage24-full"><label for="manage24-estimate">预计时长 · 可选</label><input type="number" id="manage24-estimate" name="estimate" min="1" max="720" value="${d.estimate}" placeholder="分钟"></div></div><p class="schedule-hint">截止与循环可能使任务自动出现在今日；移动分组不会改变安排。</p></div>`}<p class="manage24-error" id="manage24-property-error" role="status"></p></div><footer><span class="manage24-session">本页设计预览</span><button type="button" class="button" data-manage24="cancel-properties">取消</button><button type="submit" class="button primary">保存修改</button></footer></form>`,trigger,360,'[data-action="task-menu"]');
    $('#manage24-cycle-time')?.setAttribute('value',d.cycleTime);
    $('#manage24-property-form').addEventListener('submit',e=>{e.preventDefault();capturePanel();const f=e.target,d=propertyDraft,t=byId(d.id);let error='';if(!d.title.trim())error='请输入标题后再保存';else if(!groupOptions().includes(d.group))error='目标分组已不存在，请重新选择';else if(d.cycle==='weekly'&&!d.weekdays.length)error='每周循环至少选择一天';else if((d.date&&!d.time)||(d.cycle!=='none'&&!d.cycleTime))error='请补全截止或循环的时间';else if(!f.checkValidity())error='请检查日期、时间和预计时长（1–720 分钟）';if(error){$('#manage24-property-error').textContent=error;return;}const previous=t.group;renameTask(t,d.title.trim());t.group=d.group;if(!isQuick(t)){t.priority=d.priority;t.today=d.today;t.tags={...t.tags,blocked:d.blocked,later:d.later};Object.assign(t,{deadlineAt:d.date,deadlineTime:d.date?d.time:'',deadline:d.date?displayDate(d.date):'',deadlineReminderMinutes:d.date&&d.reminder!=='none'?Number(d.reminder):null,estimateMinutes:Number(d.estimate)||0,recurrence:{...t.recurrence,frequency:d.cycle,time:d.cycleTime,weekdays:d.weekdays}});}touchTask(t);closeOverlay();propertyDrafts.delete(t.id);propertyDraft=null;if(previous!==t.group)afterMove(t);else{render();receipt('属性已修改 · 保留在本页预览');}});
  }
  function afterMove(t) {
    retainedTask=t.id;state.menu=false;render();receipt(`已移至「${t.group}」，今日安排保留`,'view-moved','查看');
  }
  const priorPromote=showMoveRecord;
  showMoveRecord=function(promote=false){
    if(promote){priorPromote(true);return;}
    const t=currentTask();state.menu=false;render();if(moveDraft?.id!==t.id)moveDraft={id:t.id,group:t.group,query:''};
    mount(`<form class="surface-popover manage24-panel" id="manage24-move-form" role="dialog" aria-modal="true" aria-label="移动到分组">${surfaceHeader('移动到分组')}<p class="manage24-move-note">${esc(t.title)}</p><input class="manage24-search" id="manage24-move-search" aria-label="搜索目标分组" placeholder="搜索分组" value="${esc(moveDraft.query)}"><div class="manage24-destinations" role="radiogroup" aria-label="目标分组"></div><p class="schedule-hint">只改变归属，今日安排与处理记录保持。</p><p class="manage24-error" role="status" id="manage24-move-error"></p><footer><button type="button" class="button" data-manage24="cancel-move">取消</button><button type="submit" class="button primary">移动</button></footer></form>`,$('[data-action="move-record"]')||$('[data-action="task-menu"]'),330,'[data-action="move-record"]');drawDestinations();$('#manage24-move-search').focus();
    $('#manage24-move-form').addEventListener('submit',e=>{e.preventDefault();const d=moveDraft,t=byId(d.id);if(!groupOptions().includes(d.group)){$('#manage24-move-error').textContent='目标分组已不存在，请重新选择';return;}const changed=t.group!==d.group;t.group=d.group;if(changed)touchTask(t);closeOverlay();moveDraft=null;if(changed)afterMove(t);else receipt('任务已在此分组');});
  };
  function drawDestinations(){const d=moveDraft,list=groupOptions().filter(g=>g.toLowerCase().includes(d.query.toLowerCase()));$('.manage24-destinations').innerHTML=list.length?list.map(g=>`<button type="button" class="manage24-destination" role="radio" aria-checked="${g===d.group}" data-manage24-target="${esc(g)}">${icon('folder')}<span>${esc(g)}</span><small>${tasks.filter(t=>t.group===g&&!t.done).length}</small>${g===d.group?icon('check'):''}</button>`).join(''):'<p class="manage24-no-results">没有匹配的分组</p>';}
  const priorGroups=renderGroupNavigation;
  renderGroupNavigation=function(){let html=priorGroups();html=html.replace('<span>任务分组</span>','<span>任务分组</span><span class="manage24-heading-actions"><button class="icon-button" data-manage24="organize" aria-label="整理分组" title="整理分组">'+icon('more')+'</button>').replace('title="新建分组">'+icon('plus')+'</button></div>','title="新建分组">'+icon('plus')+'</button></span></div>');return html.replace(/<button class="group-menu-button"[\s\S]*?<\/button>/g,'').replace(/<button data-action="(?:save|cancel)-group"[\s\S]*?<\/button>/g,'');};
  showGroupMenu=function(group,trigger,point=null){const i=taskGroups.indexOf(group);if(i<0)return;mount(`<section class="surface-popover manage24-group-menu" role="menu" aria-label="分组操作"><button role="menuitem" data-rename-group="${esc(group)}">${icon('edit')}重命名</button><button role="menuitem" data-manage24="organize" data-group-name="${esc(group)}">${icon('folder')}整理分组</button><div class="menu-divider"></div><button role="menuitem" data-manage24="group-up" data-group-name="${esc(group)}" ${i<1?'disabled':''}>${icon('chevron')}上移</button><button role="menuitem" data-manage24="group-down" data-group-name="${esc(group)}" ${i===taskGroups.length-1?'disabled':''}>${icon('chevron')}下移</button><div class="menu-divider"></div><button role="menuitem" class="danger-action" data-delete-group="${esc(group)}">${icon('close')}删除分组…</button></section>`,trigger,200,`[data-group="${CSS.escape(group)}"]`);const p=$('#overlay .surface-popover');if(point){p.style.left=Math.max(12,Math.min(point.x,innerWidth-p.offsetWidth-12))+'px';p.style.top=Math.max(12,Math.min(point.y,innerHeight-p.offsetHeight-12))+'px';}p.querySelector('button:not(:disabled)')?.focus();};
  const priorSaveGroup=saveGroupEdit;
  saveGroupEdit=function(){const draft=state.groupEditing,old=draft?.old;priorSaveGroup();if(draft&&!state.groupEditing){const next=draft.value.trim();if(old&&old!==next)globalThis.loopWorkGroup24?.change(old,next);receipt(old?'分组名称已修改':'分组已创建');}};
  function organize(trigger,focus) {
    mount(`<section class="surface-popover manage24-panel manage24-organizer" role="dialog" aria-modal="true" aria-label="整理分组">${surfaceHeader('整理分组')}<input id="manage24-organizer-search" class="manage24-search" aria-label="搜索分组" placeholder="搜索分组" value="${esc(organizerQuery)}"><div class="manage24-group-list"></div><p class="schedule-hint">调整导航中的分组顺序，不改变任务顺序。</p><footer><button class="button" data-manage24="new-from-organizer">新建分组</button><button class="button primary" data-action="close-dialog">完成</button></footer></section>`,trigger||$('[data-manage24="organize"]'),510,'[data-manage24="organize"]');drawOrganizer();if(focus)$(`[data-manage24="group-open"][data-group-name="${CSS.escape(focus)}"]`)?.focus();else $('#manage24-organizer-search').focus();
  }
  function drawOrganizer(){const groups=taskGroups.filter(g=>g.includes(organizerQuery));$('.manage24-group-list').innerHTML=groups.length?groups.map(g=>{const list=tasks.filter(t=>t.group===g),i=taskGroups.indexOf(g);return `<div class="manage24-organizer-row">${icon('folder')}<div class="manage24-group-copy"><button data-manage24="group-open" data-group-name="${esc(g)}" title="${esc(g)}">${esc(g)}</button><small>${list.filter(t=>!isQuick(t)&&!t.done).length} 个未完成任务 · ${list.filter(isQuick).length} 条速记${source()===g?' · <span class="manage24-source">成长来源</span>':''}</small></div><div class="manage24-row-actions"><button class="icon-button manage24-up" data-manage24="group-up" data-group-name="${esc(g)}" aria-label="上移${esc(g)}" ${i===0?'disabled':''}>${icon('chevron')}</button><button class="icon-button manage24-down" data-manage24="group-down" data-group-name="${esc(g)}" aria-label="下移${esc(g)}" ${i===taskGroups.length-1?'disabled':''}>${icon('chevron')}</button><button class="icon-button" data-rename-group="${esc(g)}" aria-label="重命名${esc(g)}">${icon('edit')}</button><button class="icon-button" data-delete-group="${esc(g)}" aria-label="删除${esc(g)}">${icon('close')}</button></div></div>`;}).join(''):'<p class="manage24-no-results">没有匹配的分组</p>';}
  showDeleteGroup=function(group){
    if(deleteDraft?.group!==group)deleteDraft={group,target:'未分组',remove:false,replacement:'',confirmed:false};
    const d=deleteDraft,list=tasks.filter(t=>t.group===group),dependent=source()===group,choices=groupOptions().filter(g=>g!==group);
    mount(`<form class="surface-popover manage24-panel" id="manage24-delete-group" role="dialog" aria-modal="true" aria-label="删除分组">${surfaceHeader('删除分组')}<div class="manage24-body"><p class="manage24-impact"><strong>${esc(group)}</strong><br>${list.filter(t=>!isQuick(t)).length} 个任务 · ${list.filter(isQuick).length} 条速记</p><div class="manage24-keep-target" ${d.remove?'hidden':''}><label for="manage24-keep-target">保留内容并移至</label><select id="manage24-keep-target">${choices.map(g=>option(g,g,d.target)).join('')}</select><p class="schedule-hint">今日安排、处理流与知识笔记保持。</p></div><div class="manage24-danger-choice"><label class="manage24-check"><input type="checkbox" id="manage24-remove-all" ${d.remove?'checked':''}>同时删除其中的内容</label>${d.remove?`<p class="manage24-danger-details">将删除 ${flat(list.flatMap(t=>t.nodes)).length} 个处理节点及相关记录、任务简报与笔记关联。外部 Markdown 和附件文件保留。</p><label class="manage24-check"><input type="checkbox" id="manage24-delete-confirm" ${d.confirmed?'checked':''}>我已了解以上影响</label>`:''}</div>${dependent?`<div class="manage24-dependency"><p>此分组是成长任务的来源，请明确处理来源设置。</p><label for="manage24-growth-next">成长来源</label><select id="manage24-growth-next"><option value="">请选择</option><option value="stop" ${d.replacement==='stop'?'selected':''}>停用当前来源</option>${taskGroups.filter(g=>g!==group).map(g=>option(g,g,d.replacement)).join('')}</select></div>`:''}<p id="manage24-delete-error" class="manage24-error" role="status"></p></div><footer><span class="manage24-session">仅操作本页示例</span><button type="button" class="button" data-manage24="cancel-delete">取消</button><button type="submit" class="button ${d.remove?'danger-action':'primary'}">${d.remove?'删除分组与内容':'删除分组，保留内容'}</button></footer></form>`,$(`[data-group="${CSS.escape(group)}"]`)||$('[data-manage24="organize"]'),390,'[data-action="new-group"]');
    $('#manage24-delete-group').addEventListener('submit',e=>{e.preventDefault();const d=deleteDraft,old=source();if(!taskGroups.includes(d.group)){$('#manage24-delete-error').textContent='分组已不存在';return;}if(old===d.group&&!d.replacement){$('#manage24-delete-error').textContent='请选择替换来源或停用当前来源';return;}if(d.remove&&!d.confirmed){$('#manage24-delete-error').textContent='请确认内容删除的影响';return;}if(!d.remove&&!groupOptions().includes(d.target)){$('#manage24-delete-error').textContent='请选择有效目标分组';return;}undoDelete={group:d.group,index:taskGroups.indexOf(d.group),source:old,afterSource:d.replacement==='stop'?'':d.replacement,items:tasks.filter(t=>t.group===d.group).map(t=>({record:t,index:tasks.indexOf(t),afterGroup:d.remove?null:d.target})),removed:d.remove};if(d.remove){for(let i=tasks.length-1;i>=0;i--)if(tasks[i].group===d.group)tasks.splice(i,1);}else tasks.filter(t=>t.group===d.group).forEach(t=>{t.group=d.target;touchTask(t);});taskGroups.splice(taskGroups.indexOf(d.group),1);if(old===d.group)globalThis.loopWorkGroup24?.change(d.group,d.replacement==='stop'?'':d.replacement);if(state.group===d.group)state.group=d.remove?'all':d.target;retainedTask=null;closeOverlay();deleteDraft=null;ensureSelection();render();receipt(d.remove?'分组及内容已从本页删除':`分组已删除，内容移至「${d.target}」`,'undo-group','撤销');});
  };
  const priorSelection=ensureSelection;
  ensureSelection=function(){if(retainedTask&&byId(retainedTask)){state.task=retainedTask;return;}priorSelection();};
  globalThis.loopRetainedTask24=()=>retainedTask&&byId(retainedTask)||null;
  const priorRender=render;
  render=function(){priorRender();drawRowTitle();document.querySelectorAll('.nav-groups [data-group]').forEach(b=>{if(taskGroups.includes(b.dataset.group)){b.title=b.dataset.group;b.setAttribute('aria-haspopup','menu');}});if(titleSession){resizeTitle();}const task=retainedTask&&byId(retainedTask);if(task&&!filteredTasks().some(t=>t.id===task.id)&&['tasks','today'].includes(state.route)&&!$('.manage24-context-receipt'))$('.workspace')?.insertAdjacentHTML('afterbegin',`<div class="manage24-context-receipt"><span>此任务已不在当前列表中</span><button data-manage24="view-moved">前往${esc(task.group)}</button><button data-manage24="return-list">返回列表</button></div>`);const group=$('#group-title');if(group&&state.groupError){group.setAttribute('aria-invalid','true');const error=$('.nav-groups .group-error');if(error){error.id='manage24-group-error';group.setAttribute('aria-describedby',error.id);error.setAttribute('role','status');}}};
  document.addEventListener('input',e=>{if(e.target.id==='manage24-row-title'&&rowTitleSession){rowTitleSession.value=e.target.value;rowTitleSession.error='';$('#manage24-row-error').textContent='';e.target.removeAttribute('aria-invalid');}if(e.target.id==='manage24-title'&&titleSession){titleSession.value=e.target.value.replace(/\n/g,'');titleSession.error='';$('#manage24-title-error').textContent='';e.target.removeAttribute('aria-invalid');resizeTitle();}if(e.target.closest('#manage24-property-form'))capturePanel();if(e.target.id==='manage24-move-search'){moveDraft.query=e.target.value;drawDestinations();}if(e.target.id==='manage24-organizer-search'){organizerQuery=e.target.value;drawOrganizer();}});
  document.addEventListener('focusout',e=>{if(e.target.id==='manage24-row-title'&&rowTitleSession)endRowTitle(false,true);if(e.target.id==='manage24-title'&&titleSession)endTitle(false,true);});
  window.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if(e.target.id==='manage24-row-title'&&['Enter','Escape'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();endRowTitle(e.key==='Escape');return;}const group=e.target.closest('.nav-groups [data-group]');if(group&&taskGroups.includes(group.dataset.group)&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){e.preventDefault();e.stopImmediatePropagation();showGroupMenu(group.dataset.group,group);return;}if(e.key==='F2'){const task=e.target.closest('.task-select[data-task]');if(task||group&&taskGroups.includes(group.dataset.group)){e.preventDefault();e.stopImmediatePropagation();if(task)beginRowTitle(Number(task.dataset.task));else startGroupEdit(group.dataset.group);return;}}if(e.target.id==='manage24-title'&&['Enter','Escape'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();endTitle(e.key==='Escape');if(!titleSession)$('.title-edit')?.focus({preventScroll:true});}if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&$('#manage24-property-form')){e.preventDefault();e.stopImmediatePropagation();$('#manage24-property-form').requestSubmit();}},true);
  document.addEventListener('change',e=>{if(e.target.closest('#manage24-property-form')){capturePanel();if(e.target.id==='manage24-cycle')$('#manage24-weekdays').hidden=e.target.value!=='weekly';}if(e.target.id==='manage24-keep-target')deleteDraft.target=e.target.value;if(e.target.id==='manage24-growth-next')deleteDraft.replacement=e.target.value;if(e.target.id==='manage24-delete-confirm')deleteDraft.confirmed=e.target.checked;if(e.target.id==='manage24-remove-all'){deleteDraft.remove=e.target.checked;deleteDraft.confirmed=false;showDeleteGroup(deleteDraft.group);}});
  window.addEventListener('click',e=>{
    if(rowTitleSession&&!e.target.closest('.manage24-row-title'))endRowTitle(false,true);
    if(titleSession&&!e.target.closest('.task-title'))endTitle(false,true);
    if(state.groupEditing&&!e.target.closest('.nav-group-editor')){lastNameClick=null;if(!state.groupEditing.old&&!state.groupEditing.value.trim()){state.groupEditing=null;state.groupError='';render();}else saveGroupEdit();}
    const b=e.target.closest('button');if(!b||b.disabled)return;const action=b.dataset.manage24;
    const nameTarget=b.matches('.task-select[data-task]')?{kind:'task',id:b.dataset.task}:b.matches('.nav-groups [data-group]')&&taskGroups.includes(b.dataset.group)?{kind:'group',id:b.dataset.group}:null;
    if(nameTarget&&e.detail>0){const now=performance.now(),double=e.detail===2||(lastNameClick?.kind===nameTarget.kind&&lastNameClick.id===nameTarget.id&&now-lastNameClick.time<500);lastNameClick=double?null:{...nameTarget,time:now};if(double){e.preventDefault();e.stopImmediatePropagation();if(nameTarget.kind==='task')beginRowTitle(Number(nameTarget.id));else startGroupEdit(nameTarget.id);return;}}else lastNameClick=null;
    if(b.dataset.task||b.dataset.group||b.dataset.route){retainedTask=null;}
    if(b.dataset.knowledgeAction==='export-task'&&b.closest('.popover')){state.menu=false;render();}
    if(b.dataset.action==='edit-record-title'){e.preventDefault();e.stopImmediatePropagation();beginTitle();return;}
    if(b.dataset.action==='toggle-today'){e.preventDefault();e.stopImmediatePropagation();const t=currentTask();t.today=!t.today;touchTask(t);state.menu=false;retainedTask=t.id;render();receipt(t.today?'已手动加入今日':scheduledToday(t)?'已取消手动标记；仍因截止或循环显示在今日':'已取消手动加入今日');return;}
    if(b.dataset.manage24Priority){e.preventDefault();e.stopImmediatePropagation();propertyDraft.priority=b.dataset.manage24Priority;document.querySelectorAll('[data-manage24-priority]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));return;}
    if(b.dataset.manage24Target){e.preventDefault();e.stopImmediatePropagation();moveDraft.group=b.dataset.manage24Target;drawDestinations();$(`[data-manage24-target="${CSS.escape(moveDraft.group)}"]`)?.focus();return;}
    if(!action)return;e.preventDefault();e.stopImmediatePropagation();
    if(action==='properties')properties(b);
    else if(action==='cancel-properties'){closeOverlay();if(propertyDraft)propertyDrafts.delete(propertyDraft.id);propertyDraft=null;}
    else if(action==='time'){capturePanel();propertyDraft.expanded=!propertyDraft.expanded;$('#manage24-time').hidden=!propertyDraft.expanded;b.setAttribute('aria-expanded',String(propertyDraft.expanded));const p=$('#manage24-property-form');p.style.top=Math.max(12,Math.min(parseFloat(p.style.top)||60,innerHeight-p.offsetHeight-48))+'px';}
    else if(action==='cancel-move'){closeOverlay();moveDraft=null;}
    else if(action==='cancel-delete'){closeOverlay();deleteDraft=null;}
    else if(action==='organize')organize(b,b.dataset.groupName);
    else if(action==='new-from-organizer'){closeOverlay();startGroupEdit();}
    else if(action==='group-open'){closeOverlay();navigate('tasks',b.dataset.groupName);}
    else if(action==='group-up'||action==='group-down'){const name=b.dataset.groupName,i=taskGroups.indexOf(name),target=i+(action==='group-up'?-1:1),inside=!!b.closest('.manage24-organizer');if(target<0||target>=taskGroups.length)return;taskGroups.splice(i,1);taskGroups.splice(target,0,name);closeOverlay();render();if(inside)organize($('[data-manage24="organize"]'),name);else $(`[data-group="${CSS.escape(name)}"]`)?.focus();}
    else if(action==='view-moved'){const t=retainedTask&&byId(retainedTask);if(t){retainedTask=null;navigate('tasks',t.group);state.recordType=isQuick(t)?'quick':'task';state.filter='all';state.query='';state.priority='all';state.task=t.id;ensureSelection();render();$('.title-edit')?.focus();}}
    else if(action==='return-list'){retainedTask=null;ensureSelection();render();}
    else if(action==='undo-group'&&undoDelete){const d=undoDelete;undoDelete=null;let skipped=0;if(!taskGroups.includes(d.group))taskGroups.splice(Math.min(d.index,taskGroups.length),0,d.group);d.items.forEach(({record,index,afterGroup})=>{if(d.removed){if(!byId(record.id))tasks.splice(Math.min(index,tasks.length),0,record);else skipped++;}else if(record.group===afterGroup){record.group=d.group;touchTask(record);}else skipped++;});if(d.source===d.group&&source()===d.afterSource)globalThis.loopWorkGroup24?.change(d.afterSource,d.source);ensureSelection();render();receipt(skipped?`已恢复可恢复的内容，${skipped} 项后续修改保持`:'分组与内容已恢复');}
    else if(action==='review')review();
  },true);
  window.addEventListener('contextmenu',e=>{
    const b=e.target.closest('.nav-groups [data-group]');if(!b||!taskGroups.includes(b.dataset.group))return;
    e.preventDefault();e.stopImmediatePropagation();lastNameClick=null;
    if($('#overlay').firstElementChild){closeOverlay();return;}
    if(state.menu){state.menu=false;render();return;}
    showGroupMenu(b.dataset.group,b,{x:e.clientX,y:e.clientY});
  },true);
  function review(){mount(`<section class="surface-popover manage24-panel" role="dialog" aria-modal="true" aria-label="任务与分组评审">${surfaceHeader('任务与分组编辑')}<div class="manage24-body"><p class="manage24-impact">双击列表任务或分组直接修改名称；右栏标题仍可点击输入。右键分组可重命名、调整顺序与删除，「任务分组」右侧可集中整理。</p><p class="schedule-hint">移动任务后保留来源列表，并提供前往目标入口。关闭属性面板保留草稿，显式取消放弃。新建分组取消不产生记录。</p><p class="schedule-hint">修改仅保留在本页，刷新恢复示例；真实保存与持久删除恢复将在项目实现时接入。</p></div><footer><button class="button primary" data-action="close-dialog">开始检阅</button></footer></section>`,$('#reviewInfo'),450,'#reviewInfo');}
  document.addEventListener('DOMContentLoaded',()=>{
    document.title='Loop · 第24A阶段 · 任务与分组编辑';$('.review-bar b').textContent='第24A阶段 · 任务与分组编辑';
    if($('[data-scale20-scene="normal"]'))$('[data-scale20-scene="normal"]').click();
    else{const trigger=$('[data-scale20="scenes"]');trigger?.click();$('[data-scale20-scene="normal"]')?.click();}
    closeOverlay();Object.assign(state,{route:'tasks',group:'技术排查',recordType:'task',filter:'active',priority:'all',query:'',pane:'flow',node:null,task:1,widgetOpen:false});render();
    globalThis.loopWidgetReview=review;reviewInfo=review;
  },{once:true});
  render();
})();
