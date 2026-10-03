(() => {
  const fresh = () => ({kind:state.recordType==='quick'?'quick':'task',title:'',description:'',group:state.group==='all'?'未分组':state.group,priority:state.settings.newPriority,today:state.route==='today',deadline:'',deadlineTime:'18:00',reminder:'60',recurrence:{frequency:'none',time:'09:00',weekdays:[1,2,3,4,5],lastCompletedOccurrence:''},dateOpen:false,cycleOpen:false});
  let error='',resumed=false;
  const choice=(value,label,attr,active)=>`<button type="button" ${attr}="${value}" class="${active?'active':''}" aria-pressed="${active}">${label}</button>`;
  const opts=(values,selected)=>Object.entries(values).map(([v,l])=>`<option value="${esc(v)}" ${v===String(selected)?'selected':''}>${esc(l)}</option>`).join('');
  const shiftDate=days=>{const d=dateFromKey(demoToday);d.setDate(d.getDate()+days);return dateKey(d);};
  function capture(){
    const f=$('#create-form');if(!f||!state.composer)return;
    const d=new FormData(f),c=state.composer;
    c.title=String(d.get('title')||'');c.description=String(d.get('description')||'');c.group=String(d.get('group')||c.group);
    if(c.kind==='task'){
      c.today=d.get('today')==='on';
      if(d.has('deadline'))c.deadline=String(d.get('deadline')||'');
      if(d.has('deadlineTime'))c.deadlineTime=String(d.get('deadlineTime')||'18:00');
      if(d.has('reminder'))c.reminder=String(d.get('reminder'));
      if(d.has('cycleTime'))c.recurrence.time=String(d.get('cycleTime')||'09:00');
    }
  }
  showCreateTask=function(){resumed=!!state.composer;state.composer ||= fresh();state.composer.recurrence ||= fresh().recurrence;error='';renderComposer();$('#create-title').focus();};
  renderComposer=function(focusSelector){
    const c=state.composer,quick=c.kind==='quick',r=c.recurrence;
    $('#overlay').innerHTML=`<div class="dialog-backdrop" data-return-focus="[data-action='add-task']"><form class="dialog entry16-dialog" id="create-form" role="dialog" aria-modal="true" aria-labelledby="entry16-title" novalidate>
      <header class="dialog-head"><h2 id="entry16-title">新建${quick?'速记':'任务'}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></header>
      <main class="entry16-body"><div class="entry16-types" role="group" aria-label="新建记录类型">${[['task','任务'],['quick','速记']].map(([v,l])=>choice(v,l,'data-composer-type',c.kind===v)).join('')}</div>
      <div class="entry16-writing"><div><label for="create-title">${quick?'记录标题':'任务标题'}</label><input id="create-title" name="title" maxlength="160" autocomplete="off" value="${esc(c.title)}" placeholder="${quick?'先记下来，稍后整理':'需要解决什么问题？'}" aria-required="true" aria-describedby="entry16-error" aria-invalid="${error==='请输入标题后再保存'}"><p class="error" role="status" id="entry16-error">${error==='请输入标题后再保存'?esc(error):''}</p></div>
      <div><label for="create-description">${quick?'内容':'背景'}<small>可选</small></label><textarea id="create-description" name="description" placeholder="${quick?'记录想法、线索或稍后要整理的内容':'补充问题背景或需要达到的结果'}">${esc(c.description)}</textarea></div></div>
      <div class="entry16-meta" ${quick?'style="grid-template-columns:1fr"':''}><div><label for="create-group">分组</label><select id="create-group" name="group">${opts(Object.fromEntries(['未分组',...taskGroups].map(g=>[g,g])),c.group)}</select></div>${quick?'':`<div><label id="entry16-priority-label">优先级</label><div class="entry16-priorities" role="group" aria-labelledby="entry16-priority-label">${[['high','高'],['medium','中'],['low','低']].map(([v,l])=>choice(v,icon('flag')+l,'data-entry16-priority',c.priority===v)).join('')}</div></div>`}</div>
      ${quick?'':`<label class="entry16-today"><input type="checkbox" name="today" ${c.today?'checked':''}>加入今日任务</label>
      <section class="entry16-options" aria-label="任务时间设置"><button type="button" class="entry16-disclosure" data-entry16="date" aria-expanded="${!!c.dateOpen}" aria-controls="entry16-date">${icon('calendar')}<span>截止与提醒</span><small>${c.deadline?displayDate(c.deadline)+' · '+c.deadlineTime:'未设置'}</small>${icon('chevron').replace('<svg','<svg class="entry16-chevron"')}</button>
      ${c.dateOpen?`<div class="entry16-setting" id="entry16-date"><div class="entry16-date-grid"><div><label for="create-deadline">截止日期</label><input type="date" id="create-deadline" name="deadline" value="${c.deadline}"></div><div><label for="create-time">时间</label><input type="time" id="create-time" name="deadlineTime" value="${c.deadlineTime}" ${c.deadline?'':'disabled'}></div><div><label for="create-reminder">系统提醒</label><select id="create-reminder" name="reminder" ${c.deadline?'':'disabled'}>${opts(reminderNames,c.reminder)}</select></div></div><p class="error" role="status">${error==='请补全有效的日期与时间'?esc(error):''}</p><div class="entry16-shortcuts">${[[demoToday,'今天'],[shiftDate(1),'明天'],[shiftDate(7),'一周后'],['','清除']].map(([v,l])=>`<button type="button" data-entry16-date="${v}">${l}</button>`).join('')}</div></div>`:''}
      <button type="button" class="entry16-disclosure" data-entry16="cycle" aria-expanded="${!!c.cycleOpen}" aria-controls="entry16-cycle">${icon('repeat')}<span>循环任务</span><small>${esc(recurrenceLabel(r))}</small>${icon('chevron').replace('<svg','<svg class="entry16-chevron"')}</button>
      ${c.cycleOpen?`<div class="entry16-setting" id="entry16-cycle"><div class="recurrence-modes" role="group" aria-label="循环周期">${[['none','不循环'],['daily','每天'],['weekly','每周']].map(([v,l])=>choice(v,l,'data-entry16-frequency',r.frequency===v)).join('')}</div>${r.frequency==='none'?'':`<div class="entry16-cycle-fields"><div><label for="create-cycle-time">进入今日的时间</label><input type="time" id="create-cycle-time" name="cycleTime" value="${r.time}"></div>${r.frequency==='weekly'?`<div><label id="entry16-week-label">重复日期</label><div class="recurrence-weekdays" role="group" aria-labelledby="entry16-week-label">${[1,2,3,4,5,6,0].map(d=>choice(d,weekdayNames[d].slice(1),'data-entry16-weekday',r.weekdays.includes(d))).join('')}</div></div>`:''}</div><p class="error" role="status">${error==='请为每周循环选择至少一天'?esc(error):''}</p><p class="schedule-hint">到期后进入今日；完成本次后，下个周期重新出现。</p>`}</div>`:''}</section>`}
      </main><footer><span class="entry16-status">${resumed?'已恢复本页草稿':'Esc 关闭 · ⌘ / Ctrl + Enter 保存'}</span><button type="button" class="button" data-entry16="cancel">取消</button><button type="submit" class="button primary">${quick?'保存速记':'创建任务'}</button></footer></form></div>`;
    $('#create-form').addEventListener('submit',submit);
    if(focusSelector)$(focusSelector)?.focus({preventScroll:true});
  };
  function submit(e){
    e.preventDefault();capture();const c=state.composer,quick=c.kind==='quick',title=c.title.trim();
    if(!title){error='请输入标题后再保存';renderComposer('#create-title');return;}
    if(!quick&&c.recurrence.frequency==='weekly'&&!c.recurrence.weekdays.length){error='请为每周循环选择至少一天';c.cycleOpen=true;renderComposer('[data-entry16-weekday="1"]');return;}
    if(!$('#create-form').checkValidity()){error='请补全有效的日期与时间';renderComposer('#create-deadline');return;}
    const id=Date.now(),deadline=quick?'':c.deadline;
    const record={id,kind:c.kind,title,group:c.group,priority:quick?'low':c.priority,today:!quick&&c.today,done:false,deadlineAt:deadline,deadlineTime:deadline?c.deadlineTime:'',deadlineReminderMinutes:deadline&&c.reminder!=='none'?Number(c.reminder):null,recurrence:quick?{frequency:'none',time:'09:00',weekdays:[],lastCompletedOccurrence:''}:structuredClone(c.recurrence),deadline:deadline?displayDate(deadline):'',tags:{blocked:false,later:false},createdAt:demoToday,updatedAt:demoToday,resolvedAt:'',description:c.description.trim(),progress:'',conclusion:'',nodes:[],notes:quick?c.description.trim():title,history:[]};
    tasks.unshift(record);const route=!quick&&state.route==='today'&&scheduledToday(record)?'today':'tasks';
    Object.assign(state,{route,group:route==='today'||state.group==='all'?'all':c.group,recordType:c.kind,task:id,pane:'flow',node:null,query:'',filter:'active',priority:'all',deadlineDate:null,deadlineScope:'all',backRoute:null,backFocusSelector:null});
    closeOverlay();state.composer=null;error='';resumed=false;render();$(`.task-select[data-task="${id}"]`)?.focus({preventScroll:true});toast(quick?'速记已保留在本页预览':'任务已保留在本页预览');
  }
  const oldClose=closeOverlay;
  closeOverlay=function(){
    capture();
    const selector=$('#overlay').querySelector('[data-return-focus]')?.dataset.returnFocus;
    const trigger=selector?$(selector):null;
    if(trigger?.hasAttribute('aria-expanded'))trigger.setAttribute('aria-expanded','false');
    oldClose();
  };
  document.addEventListener('input',e=>{
    if(!e.target.closest('#create-form'))return;capture();
    if(error){error='';document.querySelectorAll('#create-form .error').forEach(el=>el.textContent='');$('#create-title').setAttribute('aria-invalid','false');}
  });
  document.addEventListener('change',e=>{if(e.target.id==='create-deadline'){capture();renderComposer('#create-deadline');}else if(e.target.closest('#create-form'))capture();});
  window.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||!$('#create-form')||!b.closest('#create-form'))return;
    const c=state.composer;capture();let focus;
    if(b.dataset.composerType){c.kind=b.dataset.composerType;focus=`[data-composer-type="${c.kind}"]`;}
    else if(b.dataset.entry16Priority){c.priority=b.dataset.entry16Priority;focus=`[data-entry16-priority="${c.priority}"]`;}
    else if(b.dataset.entry16==='date'){c.dateOpen=!c.dateOpen;focus='[data-entry16="date"]';}
    else if(b.dataset.entry16==='cycle'){c.cycleOpen=!c.cycleOpen;focus='[data-entry16="cycle"]';}
    else if(b.dataset.entry16==='cancel'){e.preventDefault();e.stopImmediatePropagation();closeOverlay();state.composer=null;error='';resumed=false;return;}
    else if(b.hasAttribute('data-entry16-date')){c.deadline=b.dataset.entry16Date;focus='[data-entry16="date"]';}
    else if(b.dataset.entry16Frequency){c.recurrence.frequency=b.dataset.entry16Frequency;focus=`[data-entry16-frequency="${c.recurrence.frequency}"]`;}
    else if(b.hasAttribute('data-entry16-weekday')){const d=Number(b.dataset.entry16Weekday),days=c.recurrence.weekdays;c.recurrence.weekdays=days.includes(d)?days.filter(v=>v!==d):[...days,d];focus=`[data-entry16-weekday="${d}"]`;}
    else return;
    e.preventDefault();e.stopImmediatePropagation();error='';renderComposer(focus);
  },true);
  function panelFinish(form){
    if(!form)return;form.classList.add('entry16-panel');
    const footer=form.querySelector('footer');
    footer?.insertAdjacentHTML('afterbegin','<span class="entry16-spacer"></span><button type="button" class="button" data-action="close-dialog">取消</button>');
    const clear=footer?.querySelector('[data-action="remove-deadline"]');if(clear)footer.prepend(clear);
    // Width is shared across property panels; retain mountSurface's viewport clamping.
    const width=340;form.style.width=width+'px';form.style.left=Math.max(12,Math.min(parseFloat(form.style.left)||12,innerWidth-width-12))+'px';
    form.style.top=Math.max(12,Math.min(parseFloat(form.style.top)||12,innerHeight-50-form.offsetHeight))+'px';
  }
  const oldDeadline=showDeadline;
  showDeadline=function(trigger,reset=true){oldDeadline(trigger,reset);const f=$('#deadline-form');panelFinish(f);f.querySelector('.schedule-fields').insertAdjacentHTML('afterend',`<div class="entry16-time-presets" role="group" aria-label="常用截止时间">${['09:00','12:00','17:30','18:00'].map(v=>`<button type="button" data-entry16-time="${v}">${v}</button>`).join('')}</div>`);f.style.top=Math.max(12,Math.min(parseFloat(f.style.top),innerHeight-50-f.offsetHeight))+'px';};
  const oldRecurrence=showRecurrence;
  showRecurrence=function(trigger,reset=true){oldRecurrence(trigger,reset);panelFinish($('#recurrence-form'));};
  const oldTitle=showTitleEditor;
  showTitleEditor=function(trigger,nodeId){oldTitle(trigger,nodeId);const f=$('#title-form');panelFinish(f);f.noValidate=true;$('#editable-title').setAttribute('aria-describedby','entry16-title-error');f.querySelector('footer').insertAdjacentHTML('beforebegin','<p class="error" id="entry16-title-error" role="status"></p>');f.addEventListener('submit',e=>{if(!$('#editable-title').value.trim()){e.preventDefault();e.stopImmediatePropagation();$('#entry16-title-error').textContent='请输入标题后再保存';$('#editable-title').setAttribute('aria-invalid','true');$('#editable-title').focus();}},true);$('#editable-title').addEventListener('input',()=>{$('#entry16-title-error').textContent='';$('#editable-title').setAttribute('aria-invalid','false');});};
  window.addEventListener('click',e=>{const b=e.target.closest('[data-entry16-time]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();$('#deadline-time').value=b.dataset.entry16Time;state.scheduleDraft.time=b.dataset.entry16Time;$('#deadline-time').focus();},true);
  window.addEventListener('keydown',e=>{
    const f=$('#create-form')||$('.entry16-panel');if(!f)return;
    if(e.isComposing||e.keyCode===229){e.stopImmediatePropagation();return;}
    if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();if(f instanceof HTMLFormElement)f.requestSubmit();}
    if(e.key==='Tab'){
      const items=[...f.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select:not(:disabled),a[href]')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      e.stopImmediatePropagation();
    }
  },true);
  globalThis.loopEntry16Review=function(){
    $('#overlay').innerHTML=`<div class="dialog-backdrop" data-return-focus="#reviewInfo"><section class="dialog entry16-dialog" role="dialog" aria-labelledby="entry16-review"><header class="dialog-head"><h2 id="entry16-review">第十六阶段评审</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></header><main class="entry16-body"><p>从任务列表右上角新建任务，查看标题、背景与次级属性的排列。</p><ul><li>截止与提醒、循环任务按需展开。</li><li>关闭或点弹窗外，再次新建可恢复草稿；取消会放弃草稿。</li><li>切换速记，只保留记录内容与分组。</li><li>任务标题、截止和循环面板统一排布，可直接试用。</li></ul><p class="schedule-hint">所有修改仅保留在当前页面，刷新后恢复示例。系统提醒仍为演示设置。</p></main><footer><span class="entry16-status">桌面设计预览</span><button class="button primary" data-action="close-dialog">开始评审</button></footer></section></div>`;$('#entry16-review').tabIndex=-1;$('#entry16-review').focus();
  };
  reviewInfo=globalThis.loopEntry16Review;globalThis.loopWidgetReview=globalThis.loopEntry16Review;
  document.title='Loop · 第十六阶段设计';$('.review-bar b').textContent='第十六阶段 · 创建与属性';$('.review-bar .review-note').textContent='任务／速记 · 草稿 · 截止与循环';
})();
