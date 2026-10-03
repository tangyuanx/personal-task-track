/* Desktop scenes are manual HTML previews. No OS notification, permission or window API. */
(() => {
  const model=loopDesktopModel19;
  let windowMode='front',capability='normal',lastMessage='',lastGroups=[];
  const sent=new Set();
  paths.bell='M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4';
  const fixtureIds=[18001,19001,19002];
  const basis=tasks.find(t=>t.id===18001);
  for(const [id,title] of [[19001,'核对发布包校验结果'],[19002,'补齐发布验证记录']]){
    const t=structuredClone(basis);Object.assign(t,{id,title,group:'个人事项',deadlineReminderMinutes:30,description:'核对本次发布产物，保留校验与验证结果。',conclusion:'校验结果与构建记录一致。',notes:'# '+title+'\n\n保留产物校验记录。',history:[]});
    t.nodes=[node('desk19-'+id,'核对产物与校验记录','done',[],'校验记录已保存。')];tasks.push(t);
  }
  // Earlier overdue examples stand for records already reminded before this review session.
  model.groups(tasks,demoNow,sent).forEach(g=>g.tasks.forEach(t=>sent.add(model.key(t))));
  const extraStore=document.createElement('div');extraStore.id='desk19-extra-store';extraStore.hidden=true;document.body.append(extraStore);
  const controls=$('.review-controls');
  [...controls.children].filter(el=>!['theme','reviewInfo'].includes(el.id)).forEach(el=>extraStore.append(el));
  controls.insertAdjacentHTML('afterbegin',`<button class="desk19-trigger" data-action="desk19-scenes" aria-haspopup="dialog" aria-expanded="false">${icon('bell')}桌面场景</button><button class="desk19-trigger" data-action="desk19-more" aria-haspopup="dialog" aria-expanded="false">其他场景${icon('down')}</button>`);
  const priorClose=closeOverlay;
  closeOverlay=function(){const tools=$('.desk19-tools');if(tools)[...tools.children].forEach(el=>extraStore.append(el));priorClose();};
  const names={normal:'通知能力可用',blocked:'系统通知关闭',unsupported:'当前环境不支持通知',failed:'提醒未能发送'};
  function statusCopy(){return {normal:'是否实际显示仍取决于系统通知权限与专注模式。',blocked:'截止安排与处理记录保留，可在系统设置中检查 Loop 的通知权限。',unsupported:'当前环境无法发送系统通知，仍可在今日和日历查看任务。',failed:'本次未记为已提醒；恢复后可重新检查。截止安排与处理记录保留。'}[capability];}
  function mount(markup,trigger,width=370){closeOverlay();mountSurface(markup,(trigger?.isConnected?trigger:$('[data-action="desk19-scenes"]')),width);}
  function statusPanel(trigger){
    mount(`<section class="surface-popover entry16-panel desk19-panel" role="dialog" aria-modal="true" aria-label="桌面提醒">${surfaceHeader('桌面提醒')}<div class="desk19-status ${capability==='normal'?'':'warning'}">${icon(capability==='normal'?'bell':'blocked')}<div><strong>${names[capability]}</strong><p>${statusCopy()}</p></div></div><p class="schedule-hint">Loop 运行时检查截止提醒。关闭主窗口会退出软件并停止提醒。</p><div class="desk19-status-actions"><button class="button" data-desk19="check">${capability==='failed'?'重试提醒':'检查提醒'}</button><button class="button" data-desk19="calendar">查看日历</button>${capability==='blocked'||capability==='normal'?'<button class="text-button" data-desk19="help">检查设置</button>':''}</div><p class="schedule-hint" style="margin-top:17px">状态由“桌面场景”模拟；实际权限和发送结果需在桌面应用中验证。</p></section>`,trigger);
  }
  function help(trigger){mount(`<section class="surface-popover entry16-panel desk19-panel" role="dialog" aria-modal="true" aria-label="检查通知设置">${surfaceHeader('检查通知设置')}<div class="desk19-status"><div><strong>检查系统通知权限</strong><p>在系统设置中确认 Loop 允许显示通知。</p><strong style="margin-top:14px">检查专注模式</strong><p>专注模式可能静默或暂缓显示通知。</p><strong style="margin-top:14px">保持 Loop 运行</strong><p>最小化主窗口后仍可提醒；关闭主窗口会退出软件。</p></div></div><p class="schedule-hint">本预览展示检查说明，不打开或更改系统设置。</p></section>`,trigger);}
  function showScenes(trigger){
    mount(`<section class="surface-popover entry16-panel desk19-panel" role="dialog" aria-modal="true" aria-label="桌面场景">${surfaceHeader('桌面场景')}<p class="schedule-hint">手动预览提醒与窗口状态，不改变系统设置。</p><label class="desk19-label" for="desk19-capability">通知状态</label><select id="desk19-capability">${Object.entries(names).map(([v,l])=>`<option value="${v}" ${capability===v?'selected':''}>${l}</option>`).join('')}</select><span class="desk19-label">主窗口</span><div class="desk19-choices" role="group" aria-label="主窗口状态">${[['front','前台'],['minimized','最小化'],['closed','关闭并退出']].map(([v,l])=>`<button class="${v===windowMode?'active':''}" data-desk19-window="${v}" aria-pressed="${v===windowMode}">${l}</button>`).join('')}</div><span class="desk19-label">提醒示例</span><div class="desk19-samples"><button data-desk19-sample="single">单任务临近</button><button data-desk19-sample="group">多任务合并</button><button data-desk19-sample="due">已到截止</button></div><p class="schedule-hint">示例沿用底部预览时间；完成任务或设为“不提醒”会跳过。相同截止时间与提醒档位不重复发送。</p><p class="desk19-result" role="status">${esc(lastMessage||'选择示例后，点击检查。')}</p><footer><button class="text-button" data-desk19="status">查看提醒状态</button><button class="button primary" data-desk19="check">检查并预览</button></footer></section>`,trigger);
    $('#desk19-capability').addEventListener('change',e=>{capability=e.target.value;lastMessage='通知状态已切换为“'+names[capability]+'”';showScenes($('[data-action="desk19-scenes"]'));$('#desk19-capability').focus();});
  }
  function showMore(trigger){mount(`<section class="surface-popover entry16-panel desk19-more" role="dialog" aria-modal="true" aria-label="其他评审场景">${surfaceHeader('其他评审场景')}<div class="desk19-tools"></div></section>`,trigger,340);[...extraStore.children].forEach(el=>$('.desk19-tools').append(el));$('.desk19-more').style.top=Math.max(12,Math.min(parseFloat($('.desk19-more').style.top),innerHeight-50-$('.desk19-more').offsetHeight))+'px';}
  function setWindow(mode){captureKnowledgeEditor();flushNodeRecord();windowMode=mode;closeOverlay();render();if(mode==='front')$('.task-select[data-task="'+state.task+'"]')?.focus({preventScroll:true});}
  function prepareSample(kind){
    if(windowMode==='closed'){lastMessage='软件已退出，重新打开预览后再检查提醒。';showScenes();return;}
    const day='2026-10-02';demoToday=day;demoNow=day+'T'+({single:'17:00',group:'17:30',due:'18:00'}[kind]);
    for(const id of fixtureIds){const t=tasks.find(t=>t.id===id);if(!t)continue;Object.assign(t,{deadlineAt:day,deadlineTime:'18:00',deadlineReminderMinutes:id===18001?60:30,done:false,resolvedAt:''});}
    for(const key of [...sent])if(fixtureIds.some(id=>key.startsWith(id+'|')))sent.delete(key);
    if(kind==='group')sent.add(model.key(tasks.find(t=>t.id===18001)));
    if(kind==='due')for(const id of [19001,19002])sent.add(model.key(tasks.find(t=>t.id===id)));
    lastMessage=kind==='group'?'合并示例：一小时前提醒已记录，接着检查提前半小时的两项任务。':kind==='due'?'截止示例：此任务尚未提醒，首次检查时已到截止。':'单任务示例：切至 17:00，提前一小时提醒。';
    closeOverlay();ensureSelection();render();showScenes();
  }
  function notificationPanel(groups){
    mount(`<section class="surface-popover entry16-panel desk19-panel" role="dialog" aria-modal="true" aria-label="通知内容预览">${surfaceHeader('通知内容预览')}<p class="schedule-hint">内容预览 · 实际通知外观由系统提供。</p><div class="desk19-notifications">${groups.map((g,index)=>{const c=model.copy(g);return `<button class="desk19-notification" data-desk19-open="${index}"><header><img src="assets/loop-icon.png" alt=""><span>Loop</span><time>${demoNow.slice(11)}</time></header><strong>${esc(c.title)}</strong><p>${esc(c.body)}</p><small>${g.tasks.length===1?'打开任务':'打开日历'}${icon('arrow')}</small></button>`;}).join('')}</div></section>`);
    const p=$('.desk19-panel');p.style.left=Math.max(12,innerWidth-p.offsetWidth-22)+'px';p.style.top='70px';
  }
  function check(){
    if(windowMode==='closed'){lastMessage='软件已退出，提醒检查已停止。';showScenes();return;}
    const groups=model.groups(tasks,demoNow,sent);
    if(capability!=='normal'){lastMessage=names[capability]+(groups.length?' · 本次尚未标记已提醒':'');statusPanel();return;}
    if(!groups.length){lastMessage='暂无新的提醒；已提醒、已完成和不提醒的任务会跳过。';showScenes();return;}
    for(const g of groups)for(const t of g.tasks)sent.add(model.key(t));lastGroups=groups;
    lastMessage='本页已预览 '+groups.length+' 条通知内容；再次检查不会重复。';notificationPanel(groups);
  }
  function openCalendar(){windowMode='front';closeOverlay();navigate('calendar');state.calendarDate=demoToday;state.calendarMonth=demoToday.slice(0,7);render();$('.calendar-day.selected')?.focus({preventScroll:true});}
  function openNotification(index){
    const g=lastGroups[index];if(!g)return;
    if(g.tasks.length>1){openCalendar();return;}
    const t=tasks.find(t=>t.id===g.tasks[0].id);windowMode='front';closeOverlay();
    if(!t){render();toast('该任务已不在当前列表中');return;}
    captureKnowledgeEditor();flushNodeRecord();Object.assign(state,{route:'tasks',group:t.group,recordType:'task',task:t.id,node:null,pane:'flow',query:'',filter:'all',priority:'all',deadlineDate:null,deadlineScope:'all',backRoute:null,backFocusSelector:null});render();$('.task-select[data-task="'+t.id+'"]')?.focus({preventScroll:true});toast('已从提醒打开任务，处理记录保留');
  }
  const priorDeadline=showDeadline;
  showDeadline=function(trigger,reset=true){priorDeadline(trigger,reset);const f=$('#deadline-form');f.querySelector('footer').insertAdjacentHTML('beforebegin',`<div class="desk19-deadline-status">${icon('bell')}<span>${names[capability]}</span><button type="button" class="text-button" data-desk19="status">查看</button></div>`);f.style.top=Math.max(12,Math.min(parseFloat(f.style.top),innerHeight-50-f.offsetHeight))+'px';};
  const priorRender=render;
  render=function(){model.reconcile(tasks,sent);priorRender();document.body.dataset.desk19Window=windowMode;$('#desk19-stage')?.remove();if(windowMode!=='front')document.body.insertAdjacentHTML('beforeend',`<section id="desk19-stage" class="desk19-stage" aria-label="${windowMode==='closed'?'软件已退出':'主窗口已最小化'}场景预览"><img src="assets/loop-icon.png" alt="Loop"><h2>${windowMode==='closed'?'Loop 已退出':'主窗口已最小化'}</h2><p>${windowMode==='closed'?'提醒与浮窗已停止。':'Loop 仍在运行，提醒与今日浮窗继续。'}</p><button class="button" data-desk19="restore">${windowMode==='closed'?'重新打开预览':'恢复主窗口'}</button><p>桌面场景预览</p></section>`);if(state.route==='settings'&&state.settingsPane==='tasks'){const el=$('.settings-document');if(el&&!el.querySelector('[data-desk19="status"]'))el.insertAdjacentHTML('beforeend',`<h3>桌面提醒</h3><div class="setting-row"><div><span class="setting-label">${names[capability]}</span><p>${statusCopy()}</p></div><button class="button" data-desk19="status">查看状态</button></div>`);}};
  function revealMain(){windowMode='front';document.body.dataset.desk19Window='front';$('#desk19-stage')?.remove();}
  // Preserve the widget's task scope while restoring the main window before its existing action.
  function widgetRestores(e){if(windowMode==='minimized'&&(e.target.closest('[data-widget-open],[data-widget12="open-record"]')||(e.detail===2&&e.target.closest('[data-widget12="edit"]'))))revealMain();}
  window.addEventListener('pointerdown',widgetRestores,true);
  window.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key))widgetRestores(e);},true);
  const priorToggle=toggleTaskCompletion;
  toggleTaskCompletion=function(t){
    if(windowMode==='minimized'&&t&&!t.done&&((!isQuick(t)&&!t.conclusion.trim())||flat(t.nodes).some(n=>n.status!=='done')))revealMain();
    return priorToggle(t);
  };
  window.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;const a=b.dataset.desk19;
    if(!a&&!b.dataset.desk19Sample&&!b.dataset.desk19Window&&b.dataset.desk19Open===undefined&&!['desk19-scenes','desk19-more'].includes(b.dataset.action))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(b.dataset.action==='desk19-scenes')showScenes(b);
    else if(b.dataset.action==='desk19-more')showMore(b);
    else if(b.dataset.desk19Window)setWindow(b.dataset.desk19Window);
    else if(b.dataset.desk19Sample)prepareSample(b.dataset.desk19Sample);
    else if(b.dataset.desk19Open!==undefined)openNotification(Number(b.dataset.desk19Open));
    else if(a==='check')check();else if(a==='status')statusPanel(b);else if(a==='help')help(b);else if(a==='calendar')openCalendar();else if(a==='restore')setWindow('front');
  },true);
  globalThis.loopDesktop19Review=function(){mount(`<section class="surface-popover entry16-panel desk19-panel desk19-review" role="dialog" aria-modal="true" aria-label="第十九阶段评审">${surfaceHeader('第十九阶段 · 桌面提醒')}<ol><li>底部“桌面场景”选择单任务、合并或到截止示例，然后检查；点击通知内容进入任务或日历。</li><li>再次检查验证不重复；切换关闭、不支持、失败状态，查看恢复入口。</li><li>最小化主窗口后从浮窗打开任务；关闭主窗口则预览退出并停止提醒。</li><li>截止面板和任务默认设置中可查看提醒状态。此前场景保留在“其他场景”。</li></ol><p class="schedule-hint">本轮仅演示内容和应用内流程，没有真实通知或系统权限检测。项目没有托盘入口。重新打开恢复本页预览，真实持久化需桌面验证。</p></section>`,$('#reviewInfo'),390);};
  reviewInfo=globalThis.loopDesktop19Review;globalThis.loopWidgetReview=globalThis.loopDesktop19Review;
  document.title='Loop · 第十九阶段设计';$('.review-bar b').textContent='第十九阶段 · 桌面提醒';render();
})();
