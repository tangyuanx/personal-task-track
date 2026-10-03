/* Demo-only contextual selection. Production data is never accessed. */
(() => {
  const bulk = { active:false, ids:new Set(), anchor:null, scope:'', undo:null };
  const baseRender = render, baseList = renderTaskList;
  const scopeKey = () => JSON.stringify([state.route,state.group,state.recordType,state.filter,state.priority,state.deadlineScope,state.deadlineDate]);
  const selected = () => tasks.filter(t => bulk.ids.has(t.id));
  const taskOnly = () => selected().filter(t => !isQuick(t));
  const action = (value,label,extra='') => '<button type="button" class="button" data-bulk-action="'+value+'" '+extra+'>'+label+'</button>';
  function stop() { bulk.active=false; bulk.ids.clear(); bulk.anchor=null; }
  function focusCheck(id) { document.querySelector('[data-bulk-id="'+id+'"]')?.focus({preventScroll:true}); }
  function prune() {
    if (bulk.scope !== scopeKey()) stop();
    const ids = new Set(filteredTasks().map(t=>t.id));
    bulk.ids.forEach(id=>{ if (!ids.has(id)) bulk.ids.delete(id); });
  }
  renderTaskList = function(list) {
    if (!bulk.active || !list.length) return baseList(list);
    return '<ol class="task-rows" aria-label="任务列表">'+list.map(t => '<li class="task-item bulk-row '+(t.id===state.task?'selected ':'')+(bulk.ids.has(t.id)?'bulk-selected ':'')+(t.done?'done':'')+'" data-task-row="'+t.id+'"><button type="button" class="bulk-check" role="checkbox" aria-checked="'+bulk.ids.has(t.id)+'" aria-label="选择：'+esc(t.title)+'" data-bulk-id="'+t.id+'"><span class="bulk-check-box">'+icon('check')+'</span></button><button class="task-select" data-task="'+t.id+'" aria-pressed="'+(t.id===state.task)+'" title="查看：'+esc(t.title)+'"><span class="task-item-title">'+esc(t.title)+'</span></button></li>').join('')+'</ol>';
  };
  render = function() {
    const focused = document.activeElement, focusId=focused?.dataset.bulkId, focusAction=focused?.dataset.bulkAction;
    prune(); baseRender();
    const footer=document.querySelector('.list-foot'); if (!footer) return;
    if (!bulk.active) footer.insertAdjacentHTML('beforeend','<button class="text-button bulk-entry" data-bulk-action="start" '+(filteredTasks().length?'':'disabled')+'>'+icon('tasks')+'多选</button>');
    else {
      const all=filteredTasks().length===bulk.ids.size, count=bulk.ids.size;
      footer.classList.add('bulk-dock'); footer.setAttribute('aria-label','批量操作');
      footer.innerHTML='<div class="bulk-summary"><strong role="status" aria-live="polite">'+(count?'已选 '+count+' 项':'选择需要处理的记录')+'</strong><button class="text-button" data-bulk-action="all">'+(all?'取消全选':'全选列表')+'</button><button class="icon-button" data-bulk-action="exit" aria-label="退出多选" title="退出多选（Esc）">'+icon('close')+'</button></div><div class="bulk-actions">'+action('complete',icon('check')+'完成',count?'':'disabled')+action('group',icon('folder')+'分组',count?'aria-haspopup="dialog"':'disabled')+'<button class="button bulk-more" data-bulk-action="more" aria-label="更多批量操作" aria-haspopup="menu" '+(count?'':'disabled')+'>'+icon('more')+'</button></div>';
    }
    if (focusId) focusCheck(focusId);
    else if(focusAction) document.querySelector('[data-bulk-action="'+focusAction+'"]')?.focus({preventScroll:true});
  };
  function selectId(id,range=false) {
    const list=filteredTasks().map(t=>t.id), checked=!bulk.ids.has(id);
    if (range && list.includes(bulk.anchor)) {
      const a=list.indexOf(bulk.anchor),b=list.indexOf(id);
      list.slice(Math.min(a,b),Math.max(a,b)+1).forEach(v=>checked?bulk.ids.add(v):bulk.ids.delete(v));
    } else checked?bulk.ids.add(id):bulk.ids.delete(id);
    bulk.anchor=id; render(); focusCheck(id);
  }
  function showResult(message,undo) {
    bulk.undo=undo; clearTimeout(toastTimer);
    document.querySelector('#toast').innerHTML='<div class="toast bulk-result" role="status"><span>'+esc(message)+'</span><button class="text-button" data-bulk-action="undo">撤销</button><button class="icon-button" data-bulk-action="dismiss-result" aria-label="关闭操作结果">'+icon('close')+'</button></div>';
    toastTimer=setTimeout(()=>{document.querySelector('#toast').innerHTML='';bulk.undo=null;},12000);
  }
  function apply(items,fields,patch,message) {
    if (!items.length) return;
    const snapshots=items.map(t=>({id:t.id,values:Object.fromEntries([...fields,'updatedAt','resolvedAt'].map(k=>[k,structuredClone(t[k])]))}));
    items.forEach(t=>{patch(t);touchTask(t);});
    closeOverlay(); ensureSelection(); render();
    showResult(message,()=>snapshots.forEach(s=>{const t=tasks.find(t=>t.id===s.id);if(t)Object.assign(t,s.values);}));
  }
  function popup(trigger,title,body,width=300) {
    mountSurface('<section class="surface-popover bulk-menu" role="menu" aria-label="'+title+'">'+surfaceHeader(title)+body+'</section>',trigger,width);
    document.querySelector('.surface-popover').dataset.returnFocus='[data-bulk-action="'+trigger.dataset.bulkAction+'"]';
  }
  function taskHint() { const n=selected().length-taskOnly().length;return n?'<p class="schedule-hint">仅修改 '+taskOnly().length+' 个任务，'+n+' 条速记保持不变。</p>':''; }
  function more(trigger) {
    const n=taskOnly().length, hasActive=selected().some(t=>!t.done), hasDone=selected().some(t=>t.done);
    popup(trigger,'更多批量操作',
      action('today-add',icon('home')+'加入今日 <small>'+n+' 个任务</small>',n?'role="menuitem"':'role="menuitem" disabled')+
      action('today-remove','移出今日',n?'role="menuitem"':'role="menuitem" disabled')+
      '<div class="menu-divider"></div>'+action('deadline',icon('calendar')+'截止时间…',n?'role="menuitem"':'role="menuitem" disabled')+
      action('priority',icon('flag')+'优先级…',n?'role="menuitem"':'role="menuitem" disabled')+
      action('restore','恢复未完成',hasDone?'role="menuitem"':'role="menuitem" disabled')+
      '<div class="menu-divider"></div>'+action('delete','删除 '+selected().length+' 项…','role="menuitem"')+
      (!hasActive?'<p class="schedule-hint">所选记录均已完成。</p>':''));
    document.querySelector('[data-bulk-action="delete"]').classList.add('danger-action');
  }
  function choices(trigger,kind) {
    const options=kind==='group'?[...taskGroups,'未分组']:['high','medium','low'];
    popup(trigger,kind==='group'?'移动至分组':'任务优先级',options.map(v=>action('choose-'+kind,kind==='group'?esc(v):priorityNames[v],'role="menuitem" data-bulk-value="'+esc(v)+'"')).join('')+(kind==='priority'?taskHint():'')+(kind==='group'?'<p class="schedule-hint">今日安排、截止时间和处理流保留。</p>':''));
    if(kind==='priority')document.querySelector('.surface-popover').dataset.returnFocus='[data-bulk-action="more"]';
  }
  function deadline(trigger) {
    mountSurface('<form class="surface-popover bulk-form" id="bulk-date-form" role="dialog" aria-modal="true" aria-label="批量设置截止时间">'+surfaceHeader('截止时间 · '+taskOnly().length+' 个任务')+'<div class="bulk-fields"><div><label for="bulk-date">日期</label><input id="bulk-date" name="date" type="date" value="'+demoToday+'" required></div><div><label for="bulk-time">时间</label><input id="bulk-time" name="time" type="time" value="18:00" required></div></div><p class="schedule-hint">保留每个任务原有的提醒设置。清除日期时同时清除提醒。</p>'+taskHint()+'<footer><button type="button" class="text-button" data-bulk-action="clear-deadline">清除日期</button><button class="button primary" type="submit">应用</button></footer></form>',trigger,300);
    document.querySelector('.surface-popover').dataset.returnFocus='[data-bulk-action="more"]';
    document.querySelector('#bulk-date-form').addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(e.target),list=taskOnly();
      apply(list,['deadlineAt','deadlineTime','deadline'],t=>Object.assign(t,{deadlineAt:String(f.get('date')),deadlineTime:String(f.get('time')),deadline:displayDate(String(f.get('date')))}),'已更新 '+list.length+' 个任务的截止时间');
    });
  }
  const reason=t=>t.done?'已完成':isQuick(t)?'':[
    !t.conclusion.trim()?'待补充结论':'',flat(t.nodes).some(n=>n.status!=='done')?'还有 '+flat(t.nodes).filter(n=>n.status!=='done').length+' 个节点未完成':''
  ].filter(Boolean).join(' · ');
  function reviewComplete() {
    const list=selected(),eligible=list.filter(t=>!reason(t)),blocked=list.filter(t=>reason(t));
    document.querySelector('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="[data-bulk-action=&quot;complete&quot;]"><section class="dialog bulk-review" role="dialog" aria-modal="true" aria-label="批量完成检查">'+surfaceHeader('完成所选记录')+'<p class="bulk-review-count">'+eligible.length+' 项可以完成'+(blocked.length?'，'+blocked.length+' 项保持原状':'')+'</p><ul class="bulk-review-list">'+list.map(t=>'<li><div><strong>'+esc(t.title)+'</strong><span>'+esc(reason(t)||'结论与处理流检查通过')+'</span></div>'+(!t.done&&reason(t)?action('inspect','查看','data-bulk-value="'+t.id+'"'):'')+'</li>').join('')+'</ul><footer><button class="button" data-action="close-dialog">取消</button>'+action('confirm-complete','完成 '+eligible.length+' 项',eligible.length?'':'disabled')+'</footer></section></div>';
    document.querySelectorAll('.bulk-review-list li').forEach((row,i)=>{if(isQuick(list[i])&&!list[i].done)row.querySelector('span').textContent='速记可直接完成';});
    document.querySelector('[data-bulk-action="confirm-complete"]').classList.add('primary');
    document.querySelector('.bulk-review [data-action="close-dialog"]').focus();
  }
  function deleteReview() {
    const list=selected(); document.querySelector('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="[data-bulk-action=&quot;more&quot;]"><section class="dialog bulk-review" role="dialog" aria-modal="true" aria-label="确认批量删除">'+surfaceHeader('删除 '+list.length+' 项记录？')+'<p>所选记录的处理流、笔记和历史将一并移除。</p><ul class="bulk-review-list">'+list.map(t=>'<li><div><strong>'+esc(t.title)+'</strong><span>'+esc(t.group)+(isQuick(t)?' · 速记':' · '+flat(t.nodes).length+' 个节点')+'</span></div></li>').join('')+'</ul><footer><button class="button" data-action="close-dialog" autofocus>取消</button>'+action('confirm-delete','删除 '+list.length+' 项')+'</footer></section></div>';
    document.querySelector('[data-bulk-action="confirm-delete"]').classList.add('danger-action');document.querySelector('[autofocus]').focus();
  }
  window.addEventListener('click',e=>{
    const b=e.target.closest('[data-bulk-action],[data-bulk-id]');if(!b||b.disabled)return;e.preventDefault();e.stopImmediatePropagation();
    if (b.dataset.bulkId) {selectId(Number(b.dataset.bulkId),e.shiftKey);return;}
    const a=b.dataset.bulkAction, list=selected();
    if(a==='start'){closeOverlay();state.menu=false;bulk.active=true;bulk.scope=scopeKey();render();focusCheck(filteredTasks()[0]?.id);}
    else if(a==='exit'){stop();render();document.querySelector('[data-bulk-action="start"]')?.focus();}
    else if(a==='all'){const visible=filteredTasks();bulk.ids=bulk.ids.size===visible.length?new Set():new Set(visible.map(t=>t.id));render();}
    else if(a==='more')more(b);
    else if(a==='group'||a==='priority')choices(b,a);
    else if(a==='choose-group')apply(list,['group'],t=>t.group=b.dataset.bulkValue,'已将 '+list.length+' 项移至「'+b.dataset.bulkValue+'」');
    else if(a==='choose-priority'){const ts=taskOnly();apply(ts,['priority'],t=>t.priority=b.dataset.bulkValue,'已更新 '+ts.length+' 个任务的优先级');}
    else if(a==='today-add'||a==='today-remove'){const ts=taskOnly();apply(ts,['today'],t=>t.today=a==='today-add',a==='today-add'?'已将 '+ts.length+' 个任务加入今日':'已移除 '+ts.length+' 个任务的手动今日安排');}
    else if(a==='deadline')deadline(b);
    else if(a==='clear-deadline'){const ts=taskOnly();apply(ts,['deadlineAt','deadline','deadlineTime','deadlineReminderMinutes'],t=>Object.assign(t,{deadlineAt:'',deadline:'',deadlineTime:'',deadlineReminderMinutes:null}),'已清除 '+ts.length+' 个任务的截止时间');}
    else if(a==='complete')reviewComplete();
    else if(a==='confirm-complete'){const eligible=list.filter(t=>!reason(t));apply(eligible,['done','recurrence'],t=>{t.done=true;if(t.recurrence&&recurrenceOccurrence(t))t.recurrence.lastCompletedOccurrence=demoToday;},'已完成 '+eligible.length+' 项'+(list.length>eligible.length?'，其余保持原状':''));}
    else if(a==='restore'){const done=list.filter(t=>t.done);apply(done,['done','recurrence'],t=>{t.done=false;if(t.recurrence)t.recurrence.lastCompletedOccurrence='';},'已恢复 '+done.length+' 项记录');}
    else if(a==='inspect'){closeOverlay();state.task=Number(b.dataset.bulkValue);state.pane='flow';state.node=null;render();document.querySelector('[data-task="'+state.task+'"]')?.focus();}
    else if(a==='delete')deleteReview();
    else if(a==='confirm-delete'){
      captureKnowledgeEditor();flushNodeRecord();
      const removed=list.map(t=>({record:t,index:tasks.indexOf(t)}));list.forEach(t=>tasks.splice(tasks.indexOf(t),1));closeOverlay();bulk.ids.clear();ensureSelection();render();
      showResult('已删除 '+removed.length+' 项记录',()=>removed.sort((a,b)=>a.index-b.index).forEach(s=>{if(!tasks.some(t=>t.id===s.record.id))tasks.splice(Math.min(s.index,tasks.length),0,s.record);}));
    } else if(a==='undo'&&bulk.undo){const undo=bulk.undo;bulk.undo=null;clearTimeout(toastTimer);undo();ensureSelection();render();toast('已撤销本次操作');}
    else if(a==='dismiss-result'){bulk.undo=null;clearTimeout(toastTimer);document.querySelector('#toast').innerHTML='';}
  },true);
  window.addEventListener('keydown',e=>{
    if(!bulk.active||document.querySelector('#overlay').firstElementChild||e.isComposing)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();stop();render();document.querySelector('[data-bulk-action="start"]')?.focus();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&e.target.closest('.task-rows,.bulk-dock')){e.preventDefault();e.stopImmediatePropagation();bulk.ids=new Set(filteredTasks().map(t=>t.id));render();}
  },true);
  document.addEventListener('focusin',e=>{if(e.target.id==='task-search'&&bulk.active){stop();render();document.querySelector('#task-search')?.focus();}});
  document.title='Loop · Plane 方向 · 第十阶段';
  document.querySelector('.review-bar b').textContent='第十阶段 · 任务批量管理';
  document.querySelector('.review-bar .review-note').textContent='多选 · 完成检查 · 撤销';
  window.addEventListener('click',e=>{
    if(e.target.closest('#reviewInfo')&&window.loopWidgetReview){e.preventDefault();e.stopImmediatePropagation();window.loopWidgetReview();return;}
    if(!e.target.closest('#reviewInfo'))return;e.preventDefault();e.stopImmediatePropagation();
    document.querySelector('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="#reviewInfo"><section class="dialog" role="dialog" aria-modal="true" aria-label="第十阶段评审">'+surfaceHeader('第十阶段评审')+'<p>列表底部的「多选」开启批量管理。复选框选择记录，点击标题仍查看原处理流；Shift 点击连续选择，列表内 ⌘ / Ctrl + A 全选，Esc 退出。</p><p>完成先检查结论和节点。分组直接操作，更多中调整今日、截止时间、优先级、恢复和删除；操作结果保留 12 秒撤销入口。</p><p>只使用本页示例数据，刷新恢复。正式集成、帮助反馈与工作成长继续暂缓。</p><footer><button class="button primary" data-action="close-dialog">开始评审</button></footer></section></div>';document.querySelector('.dialog [data-action="close-dialog"]').focus();
  },true);
  Object.assign(state,{route:'tasks',group:'all',recordType:'all',filter:'active',pane:'flow'});ensureSelection();
  render();
})();
