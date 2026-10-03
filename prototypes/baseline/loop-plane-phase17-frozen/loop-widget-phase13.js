/* Phase13: page-session preview; native window behavior is not executed. */
(() => {
  const previousRender=render;
  let editId=null,editDraft='',feedback='',feedbackType='',editTimer=0,emptyPreview=false,pointerHeld=false,pendingBlurRender=false,recentTitleClick=null,switchingToEdit=false;
  const sampleIds=[12001,12002];
  Object.assign(state,{widgetPosition:'bottom-right',widgetOpacity:100,widgetLaunch:true});
  const placements=[['top-left','左上'],['top-right','右上'],['bottom-left','左下'],['bottom-right','右下']];
  paths.up='m5 15 7-7 7 7';paths.today=paths.home;
  let gesture=null,suppressClickUntil=0,scrollFrame=0;
  const scrollByType={task:0,quick:0};
  Object.assign(state,{widgetBounds:null,widgetHeight:null});
  const gripIcon='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 3h.01M5 8h.01M5 13h.01M10 3h.01M10 8h.01M10 13h.01" stroke-linecap="round"/></svg>';
  function frameLimits(){return {left:12,top:64,right:innerWidth-12,bottom:innerHeight-58};}
  function fitFrame(widget){
    const limit=frameLimits(),rect=widget.getBoundingClientRect();
    if(state.widgetBounds){state.widgetBounds.x=Math.max(limit.left,Math.min(state.widgetBounds.x,limit.right-rect.width));state.widgetBounds.y=Math.max(limit.top,Math.min(state.widgetBounds.y,limit.bottom-rect.height));widget.style.left=state.widgetBounds.x+'px';widget.style.top=state.widgetBounds.y+'px';}
  }
  function applyWidgetAppearance(){
    const widget=document.querySelector('.widget12');if(!widget)return;
    widget.dataset.position=state.widgetPosition;
    widget.style.opacity=String(state.widgetOpacity/100);
    if(state.widgetPosition!=='custom')state.widgetBounds=null;
    widget.classList.toggle('widget13-sized',!!state.widgetHeight&&!state.widgetCompact);
    if(state.widgetHeight&&!state.widgetCompact)widget.style.height=Math.max(180,Math.min(720,state.widgetHeight,innerHeight-126))+'px';
    if(state.widgetBounds){widget.style.right='auto';widget.style.bottom='auto';fitFrame(widget);}
    widget.querySelectorAll('[data-widget-resize]').forEach(handle=>{handle.setAttribute('aria-valuenow',String(Math.round(widget.getBoundingClientRect().height)));});
  }
  function positionWidgetSettings(){
    const surface=document.querySelector('.widget12-settings'),trigger=document.querySelector('[data-action="widget-preferences"]');if(!surface||!trigger)return;
    const rect=trigger.getBoundingClientRect();surface.style.left=Math.max(12,Math.min(rect.left,innerWidth-surface.offsetWidth-12))+'px';surface.style.top=Math.max(12,Math.min(rect.bottom+7,innerHeight-50-surface.offsetHeight))+'px';
  }
  showWidgetPreferences=function(){
    cancelPendingEdit();finishRename(true,false);
    const trigger=document.querySelector('[data-action="widget-preferences"]');
    const toggle=(key,label)=>'<label class="widget12-setting-row" for="widget12-'+key+'"><span>'+label+'</span><input id="widget12-'+key+'" type="checkbox" data-widget12-preference="'+key+'" '+(state[key]?'checked':'')+'></label>';
    mountSurface('<section class="surface-popover widget12-settings" role="dialog" aria-label="浮窗设置">'+surfaceHeader('浮窗设置')+'<div class="widget12-settings-body"><p class="widget12-settings-label">窗口位置'+(state.widgetPosition==='custom'?'<span class="widget13-custom">自定义</span>':'')+'</p><div class="widget12-positions" role="group" aria-label="窗口位置">'+placements.map(([value,label])=>'<button data-widget12="place" data-value="'+value+'" aria-label="'+label+'角" aria-pressed="'+(state.widgetPosition===value)+'">'+label+'</button>').join('')+'</div>'+toggle('widgetPinned','始终置顶')+toggle('widgetThrough','鼠标穿透')+'<p class="widget12-settings-hint">⌘ / Ctrl + Shift + T 恢复浮窗操作</p>'+toggle('widgetLaunch','随应用启动')+'<label class="widget12-setting-row" for="widget12-opacity"><span>窗口透明度</span><output id="widget12-opacity-value" for="widget12-opacity">'+state.widgetOpacity+'%</output></label><input id="widget12-opacity" class="widget12-opacity" type="range" min="70" max="100" step="1" value="'+state.widgetOpacity+'" aria-label="窗口透明度"><p class="widget12-settings-hint">窗口系统行为仅为预览</p>'+((state.widgetBounds||state.widgetHeight)?'<button class="text-button widget13-reset" data-widget12="reset-frame">恢复默认尺寸与位置</button>':'')+'<button class="text-button widget12-hide" data-widget12="hide">隐藏今日窗口</button></div></section>',trigger,286);
  };
  window.addEventListener('change',e=>{
    const key=e.target.dataset.widget12Preference;if(!key)return;
    e.stopImmediatePropagation();state[key]=e.target.checked;render();positionWidgetSettings();e.target.focus({preventScroll:true});
  },true);
  window.addEventListener('input',e=>{
    if(e.target.id!=='widget12-opacity')return;
    state.widgetOpacity=Math.max(70,Math.min(100,Number(e.target.value)));applyWidgetAppearance();document.querySelector('#widget12-opacity-value').textContent=state.widgetOpacity+'%';
  },true);
  const listItems=()=>emptyPreview?[]:state.widgetType==='task'?todayTaskItems():quickItems();
  function titleButton(t){return '<button class="widget-title" data-widget12="edit" data-widget-id="'+t.id+'" title="单击改名 · 双击打开主窗口" aria-label="编辑'+(isQuick(t)?'速记':'任务')+'：'+esc(t.title)+'"><strong>'+esc(t.title)+'</strong></button>';}
  function row(t){
    const next=isQuick(t)?t.description:flat(t.nodes).find(n=>n.status==='blocked')?.title||flat(t.nodes).find(n=>n.status==='todo')?.title;
    const blocked=!isQuick(t)&&flat(t.nodes).some(n=>n.status==='blocked');
    return '<li class="widget-row '+(t.id===state.task?'current':'')+'" data-widget-row="'+t.id+'"><button class="widget13-grip" data-widget-drag="'+t.id+'" aria-label="调整顺序：'+esc(t.title)+'" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="拖动排序 · Alt+↑ / ↓">'+gripIcon+'</button><button class="widget-check '+(isQuick(t)?'quick-check':'')+'" data-complete-task="'+t.id+'" aria-label="完成'+(isQuick(t)?'速记':'任务')+'：'+esc(t.title)+'" title="完成'+(isQuick(t)?'速记':'任务')+'">'+(isQuick(t)?'<span class="note-icon">'+icon('note')+'</span><span class="completion-icon">'+icon('circle')+'</span>':icon('circle'))+'</button><div class="widget-row-copy">'+(editId===t.id?'<input class="widget-title-input" id="widget-title-input" data-widget-id="'+t.id+'" aria-label="修改记录标题" maxlength="240" value="'+esc(editDraft)+'">':titleButton(t))+(next?'<small>'+(blocked?icon('blocked'):'')+'<span>'+esc(next)+'</span></small>':'')+'</div><button class="widget-open" data-widget-open="'+t.id+'" aria-label="在主窗口打开：'+esc(t.title)+'" title="在主窗口打开">'+icon('arrow')+'</button><button class="widget13-more" data-widget12="row-menu" data-widget-id="'+t.id+'" aria-haspopup="menu" aria-label="记录操作：'+esc(t.title)+'" title="更多操作">'+icon('more')+'</button></li>';
  }
  renderTodayWidget=function(){
    if(!state.widgetOpen)return '';
    const items=listItems(),counts=emptyPreview?[0,0]:[todayTaskItems().length,quickItems().length];
    const header='<header class="widget-header" tabindex="0" aria-label="移动浮窗" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" title="拖动移动 · 聚焦后方向键微调"><img class="widget-logo" src="assets/loop-icon.png" alt="Loop" draggable="false"><strong>今日</strong>'+(state.widgetCompact?'<span class="widget-count">'+counts[0]+' 项</span>':'<span class="widget-date">10 月 2 日</span>')+'<button class="icon-button" data-action="compact-widget" aria-label="'+(state.widgetCompact?'展开浮窗':'收起浮窗')+'">'+icon(state.widgetCompact?'plus':'minus')+'</button><button class="icon-button" data-action="widget-preferences" aria-label="浮窗设置" aria-haspopup="dialog">'+icon('settings')+'</button><button class="icon-button" data-action="toggle-widget" aria-label="关闭今日浮窗">'+icon('close')+'</button></header>';
    const tabs='<nav class="widget-tabs" aria-label="浮窗记录类型">'+[['task','今日任务',counts[0]],['quick','速记',counts[1]]].map(([v,label,count])=>'<button data-widget-type="'+v+'" class="'+(state.widgetType===v?'active':'')+'" aria-pressed="'+(state.widgetType===v)+'">'+label+'<small>'+count+'</small></button>').join('')+'</nav>';
    const body='<div class="widget-body"><ol class="widget-rows">'+items.map(row).join('')+'</ol>'+(!items.length?'<p class="widget-empty">暂无'+(state.widgetType==='task'?'今日任务':'速记')+'</p>':'')+'</div>';
    const capture='<section class="widget-compose" aria-label="添加速记"><div class="widget-capture"><textarea id="widget-capture" rows="1" maxlength="4000" aria-label="快速记录内容" title="Enter 保存速记；Shift+Enter 换行；Command / Ctrl+Enter 加入今日" placeholder="记一条速记…">'+esc(state.captureDraft)+'</textarea><button data-widget12="submit" aria-label="保存速记" title="保存速记" '+(!state.captureDraft.trim()?'disabled':'')+'>'+icon('arrow')+'</button></div><div class="widget-compose-foot"><span id="widget-feedback" class="widget-input-status '+feedbackType+'" role="status" aria-live="polite">'+esc(feedback||'Enter 保存 · Shift+Enter 换行')+'</span><span class="widget-shortcut" title="Command / Ctrl+Enter 保存并加入今日">'+(/Mac/.test(navigator.platform)?'⌘':'Ctrl')+' ↵ 今日</span></div></section>';
    const resize=edge=>'<div class="widget13-resize '+edge+'" data-widget-resize="'+edge+'" role="separator" tabindex="0" aria-orientation="horizontal" aria-valuemin="180" aria-valuemax="720" aria-label="从'+(edge==='top'?'顶部':'底部')+'调整浮窗高度" title="拖动调整高度 · ↑ / ↓ 微调"></div>';
    return '<aside class="today-widget widget12 widget13 '+(state.widgetCompact?'compact':'')+'" data-widget-lane="'+state.widgetType+'" aria-label="今日任务浮窗">'+header+(state.widgetCompact?'':tabs+body+(state.widgetType==='quick'?capture:'')+resize('top')+resize('bottom'))+'</aside>';
  };
  function resizeCapture(){const input=document.querySelector('#widget-capture');if(input){input.style.height='42px';input.style.height=Math.min(82,Math.max(42,input.scrollHeight))+'px';}}
  render=function(){
    const active=document.activeElement,action=active?.dataset.widget12,inputId=active?.id,selection=inputId==='widget-capture'||inputId==='widget-title-input'?[active.selectionStart,active.selectionEnd]:null;
    const oldWidget=document.querySelector('.widget13');if(oldWidget)scrollByType[oldWidget.dataset.widgetLane]=oldWidget.querySelector('.widget-body')?.scrollTop||0;
    if(inputId==='widget-capture')state.captureDraft=active.value;
    if(editId&&document.querySelector('#widget-title-input'))editDraft=document.querySelector('#widget-title-input').value;
    if(editId&&!tasks.some(t=>t.id===editId))editId=null;
    pendingBlurRender=false;previousRender();resizeCapture();applyWidgetAppearance();
    const focus=inputId==='widget-capture'||inputId==='widget-title-input'?document.getElementById(inputId):action?document.querySelector('[data-widget12="'+action+'"]'):null;
    if(focus&&!focus.disabled){focus.focus({preventScroll:true});if(selection)focus.setSelectionRange(...selection);}
    if(document.querySelector('.widget-body'))document.querySelector('.widget-body').scrollTop=scrollByType[state.widgetType];
  };
  function finishRename(save=true,draw=true){
    if(!editId)return;const id=editId,t=tasks.find(t=>t.id===id),title=(document.querySelector('#widget-title-input')?.value??editDraft).trim();editId=null;
    if(save&&t&&title&&title!==t.title){t.title=title;touchTask(t);feedback='标题已同步';feedbackType='saved';}
    if(draw){render();document.querySelector('[data-widget12="edit"][data-widget-id="'+id+'"]')?.focus({preventScroll:true});}
  }
  function edit(t){if(!t)return;switchingToEdit=true;try{finishRename(true,false);editId=t.id;editDraft=t.title;render();const input=document.querySelector('#widget-title-input');input?.focus({preventScroll:true});input?.select();}finally{switchingToEdit=false;}}
  function openRecord(id){
    finishRename(true,false);captureKnowledgeEditor();flushNodeRecord();const t=tasks.find(t=>t.id===id);if(!t)return;
    Object.assign(state,{route:isQuick(t)?'tasks':'today',group:'all',recordType:isQuick(t)?'quick':'task',query:'',filter:'active',priority:'all',deadlineDate:null,deadlineScope:'all',task:t.id,node:null,pane:'flow',backRoute:null,backFocusSelector:null});closeOverlay();render();document.querySelector('.task-select[data-task="'+id+'"]')?.focus({preventScroll:true});
  }
  function submit(forceToday=false){
    if(!state.widgetOpen||state.widgetCompact||state.widgetType!=='quick')return;
    const text=document.querySelector('#widget-capture')?.value??state.captureDraft,lines=text.replaceAll('\r','').split('\n'),title=lines.shift().trim();
    if(!title||title.length>240){feedback=!title?'请输入第一行标题':'标题最多 240 字，可将详情放在下一行';feedbackType='error';render();document.querySelector('#widget-capture')?.focus();return;}
    captureKnowledgeEditor();flushNodeRecord();finishRename(true,false);emptyPreview=false;
    const kind=forceToday?'task':'quick',id=Date.now(),description=lines.join('\n').trim();
    tasks.unshift({id,kind,title,description,group:'未分组',priority:kind==='task'?state.settings.newPriority:'low',today:kind==='task',done:false,createdAt:demoToday,updatedAt:demoToday,resolvedAt:'',deadlineAt:'',deadline:'',progress:'',conclusion:'',nodes:[],notes:'# '+title+(description?'\n\n'+description:''),history:[]});
    state.captureDraft='';const input=document.querySelector('#widget-capture');if(input)input.value='';state.widgetType='quick';feedback=kind==='task'?'已加入今日任务':'已保存到速记';feedbackType='saved';ensureSelection();render();document.querySelector('#widget-capture')?.focus({preventScroll:true});
  }
  saveWidgetNote=()=>submit();
  const laneItems=lane=>lane==='task'?todayTaskItems():quickItems();
  const orderKey=lane=>lane==='task'?'todayTaskOrder':'todayQuickOrder';
  function moveItem(id,targetLane,anchor=null,position='after'){
    const t=tasks.find(t=>t.id===id);if(!t)return false;
    const sourceLane=isQuick(t)?'quick':'task',source=laneItems(sourceLane).filter(item=>item.id!==id),target=sourceLane===targetLane?source:laneItems(targetLane).filter(item=>item.id!==id);
    const at=anchor===null?target.length:target.findIndex(item=>item.id===anchor);if(at<0)return false;
    if(sourceLane!==targetLane){t.kind=targetLane;t.today=targetLane==='task';if(targetLane==='quick')t.group='未分组';t[orderKey(sourceLane)]=0;}
    target.splice(anchor===null?at:at+(position==='after'?1:0),0,t);
    if(sourceLane!==targetLane)source.forEach((item,index)=>item[orderKey(sourceLane)]=index+1);
    target.forEach((item,index)=>item[orderKey(targetLane)]=index+1);touchTask(t);return true;
  }
  function stepItem(id,delta){
    const t=tasks.find(t=>t.id===id);if(!t)return;const lane=isQuick(t)?'quick':'task',items=laneItems(lane),index=items.findIndex(item=>item.id===id),anchor=items[index+delta];
    if(!anchor){toast(delta<0?'已经是第一项':'已经是最后一项');return;}
    moveItem(id,lane,anchor.id,delta<0?'before':'after');closeOverlay();render();document.querySelector('[data-widget-drag="'+id+'"]')?.focus({preventScroll:true});toast('顺序已同步');
  }
  function menuTrigger(id){return document.querySelector('[data-widget12="row-menu"][data-widget-id="'+id+'"]');}
  function showRowMenu(id,point=null){
    cancelPendingEdit();finishRename(true,false);const t=tasks.find(t=>t.id===id),trigger=menuTrigger(id);if(!t||!trigger)return;
    const items=laneItems(isQuick(t)?'quick':'task'),index=items.indexOf(t),entry=(a,text,glyph,disabled=false,hint='')=>'<button role="menuitem" data-widget12="'+a+'" data-widget-id="'+id+'" '+(disabled?'disabled':'')+'>'+icon(glyph)+'<span>'+text+'</span>'+(hint?'<small>'+hint+'</small>':'')+'</button>',rule='<div class="widget13-menu-rule" role="separator"></div>';
    const actions=entry('open-record','在主窗口打开','arrow')+entry('rename-record','重命名','edit')+rule+entry('move-up','上移','up',index===0,'Alt ↑')+entry('move-down','下移','down',index===items.length-1,'Alt ↓')+rule+(isQuick(t)?entry('to-today','加入今日任务','today')+entry('promote','升级为任务…','folder')+rule+entry('delete-quick','删除速记…','close'):entry('to-quick','移到速记','note'));
    mountSurface('<div class="surface-popover widget13-menu" role="menu" aria-label="'+(isQuick(t)?'速记操作':'今日任务操作')+'">'+actions+'</div>',trigger,224);
    const surface=document.querySelector('.widget13-menu');surface.dataset.returnFocus='[data-widget12="row-menu"][data-widget-id="'+id+'"]';
    const rect=trigger.getBoundingClientRect(),left=point?.x??rect.right-224,top=point?.y??rect.bottom+5;
    surface.style.left=Math.max(12,Math.min(left,innerWidth-236))+'px';surface.style.top=Math.max(64,Math.min(top,innerHeight-58-surface.offsetHeight))+'px';
  }
  function showPromote(id){
    const t=tasks.find(t=>t.id===id);if(!t||!isQuick(t))return;
    const trigger=menuTrigger(id);mountSurface('<section class="surface-popover widget13-promote" role="dialog" aria-label="升级速记为任务">'+surfaceHeader('升级为任务')+'<p class="widget13-menu-caption">归入分组</p><div role="menu" aria-label="选择任务分组">'+taskGroups.map(group=>'<button role="menuitem" data-widget12="promote-group" data-widget-id="'+id+'" data-group-value="'+esc(group)+'">'+icon('folder')+'<span>'+esc(group)+'</span>'+icon('chevron')+'</button>').join('')+'</div>'+(!taskGroups.length?'<p class="widget13-menu-caption">请先在主窗口创建分组</p>':'')+'</section>',trigger,244);document.querySelector('.widget13-promote').dataset.returnFocus='[data-widget12="row-menu"][data-widget-id="'+id+'"]';
  }
  function showDeleteQuick(id){
    const t=tasks.find(t=>t.id===id);if(!t||!isQuick(t))return;
    closeOverlay();document.querySelector('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="[data-widget12=&quot;row-menu&quot;][data-widget-id=&quot;'+id+'&quot;]"><section class="dialog" role="dialog" aria-modal="true" aria-label="删除速记确认">'+surfaceHeader('删除速记？')+'<p class="widget13-delete-title">'+esc(t.title)+'</p><p class="schedule-hint">速记内容与关联记录将一并删除。</p><footer><button class="button" data-action="close-dialog" autofocus>取消</button><button class="button danger-action" data-widget12="confirm-delete" data-widget-id="'+id+'">删除速记</button></footer></section></div>';document.querySelector('[autofocus]').focus();
  }
  function transfer(id,lane){
    captureKnowledgeEditor();flushNodeRecord();finishRename(true,false);if(!moveItem(id,lane))return;closeOverlay();ensureSelection();render();document.querySelector('[data-widget-type="'+lane+'"]')?.focus({preventScroll:true});toast(lane==='task'?'已加入今日任务，原内容保留':'已移到速记，原内容保留');
  }
  function updateResize(widget,edge,delta,start){
    const limits=frameLimits(),bottom=start.top+start.height,maxHeight=Math.min(720,edge==='top'?bottom-limits.top:limits.bottom-start.top);
    const height=Math.max(180,Math.min(maxHeight,start.height+(edge==='top'?-delta:delta)));
    Object.assign(state,{widgetPosition:'custom',widgetHeight:height,widgetBounds:{x:start.left,y:edge==='top'?bottom-height:start.top}});applyWidgetAppearance();
  }
  function clearDrop(){document.querySelectorAll('.widget13-drop-before,.widget13-drop-after,.widget13-tab-drop').forEach(el=>el.classList.remove('widget13-drop-before','widget13-drop-after','widget13-tab-drop'));}
  function dropTarget(x,y){
    const hit=document.elementFromPoint(x,y),tab=hit?.closest('[data-widget-type]');if(tab)return {lane:tab.dataset.widgetType,id:null,position:'after',el:tab};
    const row=hit?.closest('[data-widget-row]');if(row){if(Number(row.dataset.widgetRow)===gesture.id)return null;const rect=row.getBoundingClientRect();return {lane:state.widgetType,id:Number(row.dataset.widgetRow),position:y<rect.top+rect.height/2?'before':'after',el:row};}
    const body=hit?.closest('.widget-body');return body?{lane:state.widgetType,id:null,position:'after',el:null}:null;
  }
  function autoScroll(){
    if(!gesture||gesture.kind!=='row'||!gesture.moved)return;const body=document.querySelector('.widget-body'),rect=body.getBoundingClientRect();
    const inside=gesture.x>=rect.left&&gesture.x<=rect.right&&gesture.y>=rect.top-20&&gesture.y<=rect.bottom+20;
    if(inside){const direction=gesture.y<rect.top+24?-1:gesture.y>rect.bottom-24?1:0;if(direction){body.scrollTop+=direction*7;updateDrop();}}
    scrollFrame=requestAnimationFrame(autoScroll);
  }
  function updateDrop(){clearDrop();gesture.drop=dropTarget(gesture.x,gesture.y);const drop=gesture.drop;if(drop?.el)drop.el.classList.add(drop.el.hasAttribute('data-widget-type')?'widget13-tab-drop':drop.position==='before'?'widget13-drop-before':'widget13-drop-after');}
  function endGesture(cancel=false){
    if(!gesture)return;const g=gesture;gesture=null;cancelAnimationFrame(scrollFrame);clearDrop();
    document.querySelector('.widget13')?.classList.remove('widget13-moving','widget13-resizing','widget13-sorting');document.querySelector('[data-widget-row="'+g.id+'"]')?.classList.remove('widget13-drag-source');document.body.classList.remove('widget13-gesture');
    if(g.el.hasPointerCapture?.(g.pointerId))g.el.releasePointerCapture(g.pointerId);
    if(cancel&&g.kind!=='row'){state.widgetPosition=g.saved.position;state.widgetBounds=g.saved.bounds;state.widgetHeight=g.saved.height;render();}
    if(g.moved)suppressClickUntil=performance.now()+400;
    if(!cancel&&g.kind==='row'&&g.moved&&g.drop){moveItem(g.id,g.drop.lane,g.drop.id,g.drop.position);ensureSelection();render();document.querySelector('[data-widget-drag="'+g.id+'"]')?.focus({preventScroll:true});toast(g.drop.lane===g.lane?'顺序已同步':g.drop.lane==='task'?'已加入今日任务，原内容保留':'已移到速记，原内容保留');}
  }
  window.addEventListener('pointerdown',e=>{
    if(e.button!==0||!e.target.closest('.widget13'))return;
    const handle=e.target.closest('[data-widget-drag]'),resize=e.target.closest('[data-widget-resize]'),header=e.target.closest('.widget-header');
    if(!handle&&!resize&&(!header||e.target.closest('button,input,textarea')))return;
    if(document.querySelector('#overlay').firstElementChild)return;
    cancelPendingEdit();finishRename(true,false);const widget=document.querySelector('.widget13'),rect=widget.getBoundingClientRect(),el=handle||resize||header;
    gesture={kind:handle?'row':resize?'resize':'move',id:handle?Number(handle.dataset.widgetDrag):null,lane:state.widgetType,edge:resize?.dataset.widgetResize,el,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,start:{left:rect.left,top:rect.top,height:rect.height},saved:{position:state.widgetPosition,bounds:state.widgetBounds?{...state.widgetBounds}:null,height:state.widgetHeight},moved:false,drop:null};
    el.setPointerCapture(e.pointerId);e.preventDefault();
  },true);
  window.addEventListener('pointermove',e=>{
    if(!gesture||e.pointerId!==gesture.pointerId)return;const g=gesture,dx=e.clientX-g.startX,dy=e.clientY-g.startY;
    if(!g.moved&&Math.hypot(dx,dy)<6)return;e.preventDefault();g.x=e.clientX;g.y=e.clientY;
    if(!g.moved){g.moved=true;document.body.classList.add('widget13-gesture');const widget=document.querySelector('.widget13');widget.classList.add(g.kind==='row'?'widget13-sorting':g.kind==='move'?'widget13-moving':'widget13-resizing');if(g.kind==='row'){document.querySelector('[data-widget-row="'+g.id+'"]')?.classList.add('widget13-drag-source');autoScroll();}}
    const widget=document.querySelector('.widget13');if(g.kind==='row')updateDrop();else if(g.kind==='move'){state.widgetPosition='custom';state.widgetBounds={x:g.start.left+dx,y:g.start.top+dy};applyWidgetAppearance();}else updateResize(widget,g.edge,dy,g.start);
  },true);
  window.addEventListener('pointerup',e=>{if(gesture?.pointerId===e.pointerId)endGesture();},true);
  window.addEventListener('pointercancel',()=>endGesture(true),true);
  window.addEventListener('blur',()=>endGesture(true));
  window.addEventListener('resize',()=>{endGesture(true);applyWidgetAppearance();positionWidgetSettings();});
  window.addEventListener('contextmenu',e=>{const row=e.target.closest('.widget13 [data-widget-row]');if(!row||e.target.closest('input,textarea'))return;e.preventDefault();e.stopImmediatePropagation();endGesture(true);showRowMenu(Number(row.dataset.widgetRow),{x:e.clientX,y:e.clientY});},true);
  function cancelPendingEdit(){clearTimeout(editTimer);recentTitleClick=null;}
  window.addEventListener('click',e=>{
    if(performance.now()<suppressClickUntil&&e.target.closest('.widget13')){e.preventDefault();e.stopImmediatePropagation();return;}
    const titleTarget=e.target.closest('[data-widget12="edit"],#widget-title-input');
    if(e.detail>0&&titleTarget&&recentTitleClick?.id===Number(titleTarget.dataset.widgetId)&&performance.now()-recentTitleClick.time<=500){e.preventDefault();e.stopImmediatePropagation();const id=recentTitleClick.id;cancelPendingEdit();openRecord(id);return;}
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.widgetOpen){e.preventDefault();e.stopImmediatePropagation();openRecord(Number(b.dataset.widgetOpen));return;}
    if(b.dataset.action==='compact-widget'||b.dataset.action==='toggle-widget'||b.dataset.widgetType){cancelPendingEdit();finishRename(true,false);}
    const action=b.dataset.widget12;if(!action)return;e.preventDefault();e.stopImmediatePropagation();
    if(action==='edit'){cancelPendingEdit();const id=Number(b.dataset.widgetId);if(e.detail===0)edit(tasks.find(t=>t.id===id));else{recentTitleClick={id,time:performance.now()};editTimer=setTimeout(()=>{if(recentTitleClick?.id===id&&document.querySelector('[data-widget12="edit"][data-widget-id="'+id+'"]'))edit(tasks.find(t=>t.id===id));},230);}}
    else if(action==='place'){state.widgetPosition=b.dataset.value;render();applyWidgetAppearance();positionWidgetSettings();document.querySelectorAll('[data-widget12="place"]').forEach(p=>p.setAttribute('aria-pressed',String(p.dataset.value===state.widgetPosition)));b.focus({preventScroll:true});}
    else if(action==='hide'){closeOverlay();state.widgetOpen=false;render();document.querySelector('.topbar [data-action="toggle-widget"]')?.focus({preventScroll:true});}
    else if(action==='submit')submit();
    else if(action==='row-menu')showRowMenu(Number(b.dataset.widgetId));
    else if(action==='open-record'){closeOverlay();openRecord(Number(b.dataset.widgetId));}
    else if(action==='rename-record'){closeOverlay();edit(tasks.find(t=>t.id===Number(b.dataset.widgetId)));}
    else if(action==='move-up'||action==='move-down')stepItem(Number(b.dataset.widgetId),action==='move-up'?-1:1);
    else if(action==='to-today'||action==='to-quick')transfer(Number(b.dataset.widgetId),action==='to-today'?'task':'quick');
    else if(action==='promote')showPromote(Number(b.dataset.widgetId));
    else if(action==='promote-group'){const t=tasks.find(t=>t.id===Number(b.dataset.widgetId));if(t&&isQuick(t)&&taskGroups.includes(b.dataset.groupValue)){captureKnowledgeEditor();flushNodeRecord();t.kind='task';t.group=b.dataset.groupValue;t.todayQuickOrder=0;touchTask(t);closeOverlay();ensureSelection();render();toast('已升级为任务并移入「'+t.group+'」');}}
    else if(action==='delete-quick')showDeleteQuick(Number(b.dataset.widgetId));
    else if(action==='confirm-delete'){const id=Number(b.dataset.widgetId),index=tasks.findIndex(t=>t.id===id&&isQuick(t));if(index>=0){captureKnowledgeEditor();flushNodeRecord();tasks.splice(index,1);closeOverlay();ensureSelection();render();document.querySelector('[data-widget-type="quick"]')?.focus();toast('速记已从示例中删除');}}
    else if(action==='reset-frame'){closeOverlay();Object.assign(state,{widgetPosition:'bottom-right',widgetBounds:null,widgetHeight:null});render();document.querySelector('[data-action="widget-preferences"]')?.focus();}
    else if(action==='long-list')showLongList();
    else if(action==='example')showCase(b.dataset.value);
  },true);
  window.addEventListener('dblclick',e=>{const b=e.target.closest('[data-widget12="edit"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();cancelPendingEdit();openRecord(Number(b.dataset.widgetId));},true);
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&gesture){e.preventDefault();e.stopImmediatePropagation();endGesture(true);return;}
    const handle=e.target.closest('[data-widget-drag]'),resize=e.target.closest('[data-widget-resize]');
    if(handle&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();stepItem(Number(handle.dataset.widgetDrag),e.key==='ArrowUp'?-1:1);return;}
    if((e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))&&e.target.closest('.widget13 [data-widget-row]')){e.preventDefault();e.stopImmediatePropagation();showRowMenu(Number(e.target.closest('[data-widget-row]').dataset.widgetRow));return;}
    if(resize&&['ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const edge=resize.dataset.widgetResize,rect=document.querySelector('.widget13').getBoundingClientRect();if(e.key==='Home'){state.widgetHeight=null;render();}else{updateResize(document.querySelector('.widget13'),edge,(e.key==='ArrowUp'?-1:1)*(e.shiftKey?40:10),{left:rect.left,top:rect.top,height:rect.height});}document.querySelector('[data-widget-resize="'+edge+'"]')?.focus({preventScroll:true});return;}
    if(e.target.matches('.widget13 .widget-header')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const rect=document.querySelector('.widget13').getBoundingClientRect(),step=e.shiftKey?40:10;state.widgetPosition='custom';state.widgetBounds={x:rect.left+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:rect.top+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)};applyWidgetAppearance();return;}
    if(e.target.id==='widget-capture'){
      if(e.isComposing||e.keyCode===229)return;
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();submit(e.metaKey||e.ctrlKey);}
    }else if(e.target.id==='widget-title-input'){
      if(e.isComposing||e.keyCode===229)return;
      if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finishRename(e.key==='Enter');}
    }
  },true);
  document.addEventListener('input',e=>{
    if(e.target.id==='widget-capture'){state.captureDraft=e.target.value;feedback='';feedbackType='';resizeCapture();const status=document.querySelector('#widget-feedback');status.textContent='Enter 保存 · Shift+Enter 换行';status.className='widget-input-status';document.querySelector('[data-widget12="submit"]').disabled=!e.target.value.trim();}
    if(e.target.id==='widget-title-input')editDraft=e.target.value;
  });
  window.addEventListener('pointerdown',e=>{pointerHeld=true;if(!e.target.closest('[data-widget12="edit"],#widget-title-input'))cancelPendingEdit();},true);
  window.addEventListener('focusin',e=>{if(!switchingToEdit&&!e.target.closest('[data-widget12="edit"],#widget-title-input'))cancelPendingEdit();},true);
  window.addEventListener('pointerup',()=>{pointerHeld=false;if(pendingBlurRender)setTimeout(()=>{if(pendingBlurRender)render();},0);},true);
  window.addEventListener('pointercancel',()=>{pointerHeld=false;if(pendingBlurRender)render();},true);
  document.addEventListener('focusout',e=>{if(e.target.id==='widget-title-input'&&editId){finishRename(true,false);if(pointerHeld)pendingBlurRender=true;else render();}});
  function showCase(which){
    finishRename(true,false);captureKnowledgeEditor();flushNodeRecord();closeOverlay();
    emptyPreview=which==='empty';
    if(which==='long'&&!tasks.some(t=>t.id===sampleIds[0])){
      const sample={kind:'task',group:'技术排查',priority:'high',today:true,done:false,description:'长标题示例，用于检阅浮窗排布。',progress:'',conclusion:'',createdAt:demoToday,updatedAt:demoToday,deadline:'',deadlineAt:'',notes:'',history:[]};
      tasks.push({...sample,id:sampleIds[0],title:'核对连续热重置与多队列负载之间的 MSI-X 重编程时序，并记录设备配置、向量分配和 IRQ 触发计数',nodes:[node('widget-long-node','对齐设备侧与内核日志中的时间戳，核对首次异常发生的位置','blocked')]});
      tasks.push({...sample,id:sampleIds[1],title:'整理驱动初始化的验证步骤，准备可复用的复现环境与检查清单',nodes:[node('widget-long-next','记录测试环境与初始化顺序')]});
    }
    if(which==='normal'){for(let i=tasks.length-1;i>=0;i--)if(sampleIds.includes(tasks[i].id)||tasks[i].widget13Fixture)tasks.splice(i,1);ensureSelection();}
    Object.assign(state,{widgetOpen:true,widgetCompact:false,widgetType:'task'});render();document.querySelector('[data-widget-type="task"]')?.focus({preventScroll:true});
  }
  function showLongList(){
    closeOverlay();finishRename(true,false);captureKnowledgeEditor();flushNodeRecord();emptyPreview=false;
    const titles=['核对连续热重置与多队列负载之间的 MSI-X 重编程时序，并记录向量分配和 IRQ 触发计数','记录设备恢复后的向量状态','检查 IRQ affinity 与 CPU 分配','整理异常日志时间线','补充最小复现步骤','核对驱动卸载与重载路径','确认不同内核版本的表现','归档复现环境与测试脚本','补齐设备固件信息','复查修复后的中断计数'];
    if(!tasks.some(t=>t.widget13Fixture))titles.forEach((title,index)=>tasks.push({id:13001+index,widget13Fixture:true,kind:'task',title,group:'技术排查',priority:'medium',today:true,done:false,createdAt:demoToday,updatedAt:demoToday,resolvedAt:'',deadlineAt:'',deadline:'',description:'显式评审示例',progress:'',conclusion:'',nodes:[node('widget13-'+index,'记录检查结果与下一步')],notes:'# '+title,history:[]}));
    Object.assign(state,{widgetOpen:true,widgetCompact:false,widgetType:'task'});render();document.querySelector('[data-widget-type="task"]')?.focus();
  }
  window.loopWidgetReview=function(){
    document.querySelector('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="#reviewInfo"><section class="dialog" role="dialog" aria-modal="true" aria-label="第十三阶段评审">'+surfaceHeader('第十三阶段 · 浮窗交互')+'<p>今日仍是软件今日任务的纯列表。悬停显示拖动柄和更多菜单；拖动柄调整顺序，拖到另一个页签可转移。Alt + ↑ / ↓ 也可排序。</p><p>右键或更多菜单可打开、改名、移动。速记可以加入今日、升级到分组或删除；转移保留原内容。添加速记仍只在速记页签。</p><p>拖动标题栏移动窗口，从上下边缘调整高度。也可聚焦标题栏后用方向键移动、聚焦边缘后用 ↑ / ↓ 调整。收起、关闭后保留当前会话的草稿、位置和尺寸。</p><div class="widget12-review-cases"><button class="button" data-widget12="example" data-value="normal">常规列表</button><button class="button" data-widget12="long-list">长列表示例</button><button class="button" data-widget12="example" data-value="empty">空状态示例</button></div><p>本页预览窗口布局；置顶、穿透、随应用启动与全局快捷键由桌面应用执行。刷新恢复示例初始状态。</p><footer><button class="button primary" data-action="close-dialog">开始评审</button></footer></section></div>';document.querySelector('.dialog [data-action="close-dialog"]').focus();
  };
  document.title='Loop · Plane 方向 · 第十三阶段';document.querySelector('.review-bar b').textContent='第十三阶段 · 浮窗交互';document.querySelector('.review-bar .review-note').textContent='排序与转移 · 记录菜单 · 窗口操作';
  state.widgetOpen=true;render();
})();
