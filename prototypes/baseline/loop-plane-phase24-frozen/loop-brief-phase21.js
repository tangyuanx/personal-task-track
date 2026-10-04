/* Direct task-brief editing; retained only in the Demo's current page session. */
(() => {
  const phase=new URLSearchParams(location.search).get('phase');
  if(phase&&Number(phase)<21)return;
  document.body.dataset.brief21Enabled='';
  const fields=[['description','背景','写下问题背景'],['progress','进展','记录当前判断和下一步'],['conclusion','结论','处理完成后，在这里留下结论']];
  const sessions=new Map();
  const flowBriefExpanded=new Map();
  function taskFor(key){return tasks.find(t=>t.id===Number(key.split(':')[0]));}
  function isBriefKey(key){const t=taskFor(key);return t&&!isQuick(t)&&fields.some(([field])=>key===t.id+':'+field);}
  function resize(el){
    const top=el.scrollTop;
    el.style.height='0px';
    el.style.height=Math.max(32,Math.min(160,el.scrollHeight))+'px';
    el.scrollTop=top;
  }
  function resizeAll(){document.querySelectorAll('.brief21-input').forEach(resize);}
  function setupFlowBrief(){
    const brief=$('.workspace>.brief');
    $('.scale20-brief-toggle')?.remove();
    if(!brief||state.pane!=='flow'){$('.brief21-toggle')?.remove();return;}
    const drawer=!!$('.inspector.flow-drawer');
    const expanded=!drawer&&(flowBriefExpanded.get(state.task)??!state.node);
    brief.id='brief21-task-'+state.task;
    brief.hidden=!expanded;
    let toggle=$('.brief21-toggle');
    if(toggle&&((drawer&&toggle.tagName!=='SPAN')||(!drawer&&toggle.tagName!=='BUTTON'))){toggle.remove();toggle=null;}
    if(!toggle){
      toggle=document.createElement(drawer?'span':'button');toggle.className='brief21-toggle';
      brief.before(toggle);
    }
    if(drawer){toggle.textContent='任务简报已收起';return;}
    toggle.id='brief21-flow-toggle';toggle.type='button';toggle.dataset.brief21Toggle='';
    toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls',brief.id);
    toggle.title=expanded?'收起背景、进展、结论':'展开背景、进展、结论';
    toggle.innerHTML=icon(expanded?'down':'chevron')+'任务简报';
  }
  function retain(el){
    const key=el.dataset.brief21Key,t=taskFor(key),field=key.split(':')[1];
    if(!t)return;
    if(!sessions.has(key))sessions.set(key,t[field]||'');
    if(t[field]!==el.value){t[field]=el.value;touchTask(t);}
    delete state.drafts[key];
    resize(el);
  }
  function flush(key){
    if(!sessions.has(key))return;
    const t=taskFor(key),field=key.split(':')[1],before=sessions.get(key);
    sessions.delete(key);
    if(t&&before!==(t[field]||'')){
      t.history ||= [];
      t.history.unshift(['刚刚','更新任务'+fields.find(([f])=>f===field)[1]]);
    }
  }
  renderBrief=function(t){return fields.map(([field,label,placeholder])=>{
    const key=t.id+':'+field,value=Object.hasOwn(state.drafts,key)?state.drafts[key]:t[field]||'';
    return `<div class="brief-row"><label for="brief21-${t.id}-${field}">${label}</label><textarea id="brief21-${t.id}-${field}" class="brief21-input" rows="1" wrap="soft" data-brief21-key="${key}" data-edit-key="${key}" data-draft-key="${key}" aria-label="${label}" placeholder="${placeholder}">${esc(value)}</textarea></div>`;
  }).join('');};
  const oldBegin=beginEdit;
  beginEdit=function(key){
    if(!isBriefKey(key))return oldBegin(key);
    let el=$(`[data-brief21-key="${CSS.escape(key)}"]`);
    if(!el||el.closest('.brief').hidden){
      flowBriefExpanded.set(Number(key.split(':')[0]),true);
      state.noteSummaryOpen=true;state.scale20SummaryOpen=true;render();
      el=$(`[data-brief21-key="${CSS.escape(key)}"]`);
    }
    el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'});
  };
  const oldRender=render;
  render=function(){
    const active=document.activeElement,editing=active?.matches('.brief21-input');
    const cursor=editing?{key:active.dataset.brief21Key,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,top:active.scrollTop,briefTop:active.closest('.brief').scrollTop}:null;
    if(editing)retain(active);
    [...sessions.keys()].forEach(flush);
    oldRender();setupFlowBrief();resizeAll();
    if(cursor){
      const el=$(`[data-brief21-key="${CSS.escape(cursor.key)}"]`);
      if(el&&el.getClientRects().length&&state.task===Number(cursor.key.split(':')[0])){
        el.focus({preventScroll:true});el.setSelectionRange(cursor.start,cursor.end,cursor.direction);
        el.scrollTop=cursor.top;el.closest('.brief').scrollTop=cursor.briefTop;
      }
    }
  };
  window.addEventListener('focusin',e=>{const el=e.target;if(el.matches?.('.brief21-input')){const key=el.dataset.brief21Key;sessions.set(key,taskFor(key)?.[key.split(':')[1]]||'');}});
  // The old draft listener belongs to the explicit-save editors, so isolate this input.
  window.addEventListener('input',e=>{const el=e.target;if(!el.matches?.('.brief21-input'))return;retain(el);e.stopImmediatePropagation();},true);
  window.addEventListener('focusout',e=>{const el=e.target;if(el.matches?.('.brief21-input')){retain(el);flush(el.dataset.brief21Key);}});
  window.addEventListener('keydown',e=>{
    const el=e.target;if(!el.matches?.('.brief21-input'))return;
    if(e.isComposing||e.keyCode===229){e.stopImmediatePropagation();return;}
    if(e.key==='Escape'||((e.metaKey||e.ctrlKey)&&e.key==='Enter')){e.preventDefault();e.stopImmediatePropagation();retain(el);flush(el.dataset.brief21Key);el.blur();}
  },true);
  window.addEventListener('click',e=>{
    const toggle=e.target.closest('button[data-brief21-toggle]');if(!toggle)return;
    e.preventDefault();e.stopImmediatePropagation();
    flowBriefExpanded.set(state.task,toggle.getAttribute('aria-expanded')!=='true');
    render();$('#brief21-flow-toggle')?.focus({preventScroll:true});
  },true);
  window.addEventListener('resize',()=>{setupFlowBrief();resizeAll();});
  document.fonts?.ready.then(resizeAll);
  reviewInfo=function(){
    mountSurface(`<section class="surface-popover entry16-panel" role="dialog" aria-modal="true" aria-label="任务简报设计">${surfaceHeader('任务简报')}<p>背景、进展、结论均可直接点击输入。</p><p class="schedule-hint">处理流页点击「任务简报」整体展开或收起；每个任务保留本页的展开选择，补充结论时自动展开。</p><p class="schedule-hint">内容即时保留在当前页面，切换任务后可以继续；刷新恢复示例。</p><p class="schedule-hint">Enter 换行，Tab 切换；Esc 或 ⌘ / Ctrl + Enter 离开输入，保留修改。长内容可在输入区内滚动。</p></section>`,$('#reviewInfo'),360);
  };
  // Earlier phase handlers route this shared entry through the current callback.
  globalThis.loopWidgetReview=reviewInfo;
  document.title='Loop · 第二十一阶段设计';
  $('.review-bar b').textContent='第二十一阶段 · 任务简报';
  render();
})();
