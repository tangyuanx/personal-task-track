/* Connect existing task operations; all data stays in the Demo's page session. */
(() => {
  let receipt=null,completionTrigger=null,origin=null;
  const contextKeys=['route','group','recordType','task','node','pane','filter','priority','deadlineDate','deadlineScope','query','calendarMonth','calendarDate','reviewPreset','reviewField','reviewStart','reviewEnd','backRoute','backFocusSelector'];
  const captureContext=()=>({values:Object.fromEntries(contextKeys.map(k=>[k,state[k]])),scroll:[...document.querySelectorAll('.workspace,.tasks-scroll,.flow-scroll,.review-content')].map(el=>({selector:'.'+[...el.classList].join('.'),top:el.scrollTop}))});
  function restoreContext(c){Object.assign(state,c.values);render();for(const s of c.scroll)$(s.selector)?.scrollTo({top:s.top});}
  function clearToast(){clearTimeout(toastTimer);$('#toast').innerHTML='';}
  function showReceipt(value){receipt={...value,date:demoToday};clearToast();render();}
  function taskView(t){closeOverlay();Object.assign(state,{route:'tasks',group:'all',recordType:isQuick(t)?'quick':'task',filter:'all',priority:'all',deadlineDate:null,deadlineScope:'all',query:'',task:t.id,node:null,pane:'flow',backRoute:null,backFocusSelector:null,menu:false});render();}
  function revealTask(t){
    if(['today','tasks'].includes(state.route)&&filteredTasks().some(v=>v.id===t.id)){closeOverlay();Object.assign(state,{task:t.id,node:null,pane:'flow',menu:false});render();}
    else taskView(t);
  }
  function focusWorkspace(){($('[data-action="complete-task"]')||$('.workspace [data-linked-task]')||$('.calendar-day.selected'))?.focus({preventScroll:true});}
  function focusResult(t){taskView(t);if(document.body.hasAttribute('data-brief21-enabled')){beginEdit(t.id+':conclusion');return;}const el=$(`[data-edit-key="${t.id}:conclusion"]`);el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'});}
  const oldRender=render;
  render=function(){
    oldRender();const workspace=$('.workspace');
    if(receipt&&workspace){
      const t=tasks.find(t=>t.id===receipt.id);if(!t||receipt.date!==demoToday||(receipt.kind==='done'&&!t.done)){receipt=null;return;}
      const completed=receipt.kind==='done',actions=completed?'<button data-journey17="result">查看结果</button><button data-journey17="review">查看回顾</button><button data-journey17="undo">撤销</button>':`${!isQuick(t)&&scheduledToday(t)?'<button data-journey17="today">查看今日</button>':''}${t.deadlineAt?'<button data-journey17="calendar">查看日历</button>':''}`;
      const detail=completed?(t.recurrence?.frequency!=='none'?'本次已完成 · 下个周期会重新进入今日':'结论与处理过程已保留'):(isQuick(t)?'速记已保留':t.group+(t.deadlineAt?' · '+displayDate(t.deadlineAt)+' 截止':''));
      workspace.insertAdjacentHTML('afterbegin',`<section class="journey17-receipt" aria-label="${completed?'任务完成反馈':'创建反馈'}"><div class="journey17-message" role="status" aria-live="polite">${icon(completed?'check':'plus')}<div><strong>${completed?'已完成':'已创建'} · ${esc(t.title)}</strong><small>${esc(detail)}</small></div></div><div class="journey17-actions">${actions}<button class="icon-button" data-journey17="dismiss" aria-label="关闭操作反馈">${icon('close')}</button></div></section>`);
    }
    if(state.route==='calendar')document.querySelectorAll('.agenda-item').forEach(row=>{const t=tasks.find(t=>t.id===Number(row.querySelector('[data-linked-task]')?.dataset.linkedTask));if(t?.done&&t.conclusion)row.querySelector('.summary').textContent=t.conclusion;});
  };
  // A blocked completion offers recovery for the actual task, including list/widget actions.
  function readiness(t){
    const remaining=flat(t.nodes).filter(n=>n.status!=='done'),hasConclusion=isQuick(t)||!!t.conclusion.trim();
    let trigger=completionTrigger?.isConnected?completionTrigger:$('[data-action="complete-task"]')||$('[data-action="add-task"]');
    if(!trigger)return;
    mountSurface(`<section class="surface-popover entry16-panel journey17-ready" role="dialog" aria-modal="true" aria-labelledby="journey17-ready-title">${surfaceHeader('完成任务前').replace('<h2>','<h2 id="journey17-ready-title">')}<p class="journey17-task-name">${esc(t.title)}</p><ul class="journey17-checks"><li class="${hasConclusion?'ready':''}">${icon(hasConclusion?'check':'circle')}<span><strong>处理结论</strong><small>${hasConclusion?'已记录': '还未记录结论'}</small></span>${hasConclusion?'':`<button data-journey17="conclusion" data-record="${t.id}">补充结论${icon('arrow')}</button>`}</li><li class="${remaining.length?'':'ready'}">${icon(remaining.length?'circle':'check')}<span><strong>处理流</strong><small>${remaining.length?remaining.length+' 个节点未完成':flat(t.nodes).length?'所有节点已完成':'暂无处理节点'}</small></span>${remaining.length?`<button data-journey17="node" data-record="${t.id}" data-next-node="${esc(remaining[0].id)}">定位节点${icon('arrow')}</button>`:''}</li></ul><p class="journey17-ready-hint">补齐后，再点击完成任务。</p></section>`,trigger,360);
    if(trigger.hasAttribute('data-complete-task'))$('.journey17-ready').dataset.returnFocus=`.${trigger.classList.contains('widget-check')?'widget-check':'task-complete'}[data-complete-task="${t.id}"]`;
    $('.journey17-ready [data-journey17]')?.focus({preventScroll:true});
  }
  const oldToggle=toggleTaskCompletion;
  toggleTaskCompletion=function(t){
    if(!t)return;
    if(!t.done&&((!isQuick(t)&&!t.conclusion.trim())||flat(t.nodes).some(n=>n.status!=='done'))){readiness(t);return;}
    const wasDone=!!t.done,context=captureContext(),occurrence=t.recurrence?.lastCompletedOccurrence||'';
    oldToggle(t);
    t.history ||= [];t.history.unshift([demoNow.replace('T',' '),wasDone?'恢复任务':'完成任务，保留处理结论']);
    if(!wasDone&&t.done)showReceipt({id:t.id,kind:'done',context,occurrence});
    else {receipt=null;render();}
  };
  window.addEventListener('pointerdown',e=>{completionTrigger=e.target.closest('[data-complete-task],[data-action="complete-task"]');},true);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-complete-task],[data-action="complete-task"]');if(b)completionTrigger=b;},true);
  const oldLinked=openLinkedTask;
  openLinkedTask=function(id){const c=['calendar','review'].includes(state.route)?captureContext():null;oldLinked(id);origin=c?{context:c,focus:`[data-linked-task="${id}"]`}:null;};
  // Capture before the existing calendar action switches route.
  document.addEventListener('click',e=>{if(e.target.closest('[data-action="calendar-tasks"]'))origin={context:captureContext(),focus:'[data-action="calendar-tasks"]'};},true);
  window.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.action==='back-source'&&origin&&state.backRoute===origin.context.values.route){e.preventDefault();e.stopImmediatePropagation();const saved=origin;origin=null;restoreContext(saved.context);$(saved.focus)?.focus({preventScroll:true});return;}
    const action=b.dataset.journey17;if(!action)return;e.preventDefault();e.stopImmediatePropagation();
    if(action==='conclusion'||action==='node'){
      const t=tasks.find(t=>t.id===Number(b.dataset.record));if(!t)return;revealTask(t);
      if(action==='conclusion'){beginEdit(t.id+':conclusion');$(`[data-draft-key="${t.id}:conclusion"]`)?.scrollIntoView({block:'nearest'});}
      else {const id=b.dataset.nextNode;getPath(t.nodes,id).slice(0,-1).forEach(n=>n.collapsed=false);state.node=id;render();const el=$(`.node-title[data-node="${CSS.escape(id)}"]`);el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'});}
      return;
    }
    if(action==='dismiss'){receipt=null;render();focusWorkspace();return;}
    const value=receipt,t=tasks.find(t=>t.id===value?.id);if(!t)return;
    if(action==='result')focusResult(t);
    if(action==='today'){navigate('today');state.task=t.id;render();$(`.task-select[data-task="${t.id}"]`)?.focus({preventScroll:true});}
    if(action==='calendar'){navigate('calendar');state.calendarDate=t.deadlineAt;state.calendarMonth=t.deadlineAt.slice(0,7);render();$(`[data-linked-task="${t.id}"]`)?.focus();}
    if(action==='review'){navigate('review');state.reviewPreset='week';state.reviewField='resolvedAt';render();const el=$(`[data-linked-task="${t.id}"]`);el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'});}
    if(action==='undo'){
      receipt=null;
      if(t.done){oldToggle(t);if(t.recurrence)t.recurrence.lastCompletedOccurrence=value.occurrence;t.history.unshift([demoNow.replace('T',' '),'撤销完成任务']);restoreContext(value.context);$(`.task-select[data-task="${t.id}"]`)?.focus({preventScroll:true});toast('已撤销完成，处理内容保留');}
      else {render();toast('任务已恢复');}
    }
  },true);
  const oldComposer=renderComposer;
  renderComposer=function(...args){
    oldComposer(...args);const before=new Set(tasks.map(t=>t.id));
    // Run after the form's existing validation/submission handler has created its record.
    $('#create-form').addEventListener('submit',()=>{const t=tasks.find(t=>!before.has(t.id));if(t)showReceipt({id:t.id,kind:'created'});});
  };
  globalThis.loopJourney17Review=function(){
    $('#overlay').innerHTML=`<div class="dialog-backdrop" data-return-focus="#reviewInfo"><section class="dialog entry16-dialog" role="dialog" aria-modal="true" aria-labelledby="journey17-review"><header class="dialog-head"><h2 id="journey17-review">第十七阶段 · 操作链路</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></header><main class="entry16-body"><p>本轮串联创建、今日与日历、处理流、完成和回顾。</p><ol class="journey17-review-list"><li>新建任务，选择分组、今日和截止日期；创建后可直接查看今日或日历。</li><li>点击完成任务，查看结论与节点状态；缺少内容时直接定位补齐。</li><li>完成后查看结果、进入回顾，或撤销本次完成。</li><li>从日历或回顾打开任务，再返回原来的日期与查看位置。</li></ol><p class="schedule-hint">所有修改仅保留在当前页面；刷新恢复示例。循环、提醒与浮窗设置沿用原有设计。</p></main><footer><span class="entry16-status">桌面设计预览</span><button class="button primary" data-action="close-dialog">开始评审</button></footer></section></div>`;$('#journey17-review').tabIndex=-1;$('#journey17-review').focus();
  };
  reviewInfo=globalThis.loopJourney17Review;globalThis.loopWidgetReview=globalThis.loopJourney17Review;
  document.title='Loop · 第十七阶段设计';$('.review-bar b').textContent='第十七阶段 · 操作链路';$('.review-bar .review-note').textContent='创建 → 处理 → 完成 → 回顾';
})();
