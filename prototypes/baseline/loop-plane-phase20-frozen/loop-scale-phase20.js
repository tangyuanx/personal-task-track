/* Phase20 review fixtures and desktop containment. No app data or persistent storage. */
(() => {
  const phase=new URLSearchParams(location.search).get('phase');
  if(phase&&Number(phase)<20)return;
  document.body.dataset.scale20Enabled='';
  paths.locate20='M12 3v3M12 18v3M3 12h3M18 12h3M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0';
  let saved=null,scene='normal',lastScope='',lastRecord=null;
  const firstId=20000;
  const contextKeys=['route','group','recordType','filter','priority','deadlineScope','deadlineDate','query','task','node','pane','widgetOpen','knowledgeMode','knowledgeWidth','navCollapsed','noteSummaryOpen','scale20SummaryOpen','backRoute','backFocusSelector'];
  const groupNames=['工程平台与发布可靠性专项','内核中断与设备驱动','桌面交互与可访问性','构建流水线维护','依赖与版本治理','数据校验与迁移','故障复现与证据','性能与资源占用','开发环境配置','日志与可观测性','接口契约与文档','自动化验证','跨平台兼容','笔记与知识整理','工作计划与回顾','发布后观察','工具与脚本','长期技术研究'];
  const subjects=['热重置后的中断恢复','安装包签名与校验','外部文件变更检测','冷启动时的资源加载','任务截止时间转换','长列表的键盘定位','导出文档中的层级','异常日志与回滚依据'];
  const actions=['核对','复现','记录','验证','整理','对照'];
  function longNote(){
    const table='| 测试环境 | 内核版本 | 队列数 | IRQ 计数 | 重置方式 | 地址重写 | 验证结果 | 证据文件 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| Linux x86_64 | 6.12 | 16 | 12048 | 热重置 | 正常 | 通过 | reset-baseline.log |\n| Linux ARM64 | 6.12 | 32 | 18240 | 热重置 | 待核对 | 复现中 | reset-arm64.log |';
    return '# 热重置与多队列中断验证记录\n\n保留现象、执行顺序和可复查的证据，便于在下一次验证时沿同一条路径继续。\n\n## 环境与验证矩阵\n\n'+table+'\n\n## 采集命令\n\n```bash\nsudo trace-cmd record -e irq:irq_handler_entry -e irq:irq_handler_exit -e pci:pci_cfg_write -- ./reset-and-verify --device 0000:41:00.0 --queues 32 --repeat 20 --keep-all-timestamps\n```\n\n'+Array.from({length:12},(_,i)=>'## '+(i+1)+'. '+subjects[i%subjects.length]+'\n\n在相同负载和初始化顺序下比较正常与异常结果。设备枚举完成并不等于中断路径已经恢复，应分别记录消息地址、向量映射和驱动处理次数。\n\n- [x] 保存本轮环境与配置快照\n- [ ] 核对重编程前后的中断计数\n- [ ] 将结论与原始日志一起保留\n\n```c\nint verify_queue_mapping(struct pci_dev *device, unsigned int queue_index, unsigned long expected_irq_count, unsigned long observed_irq_count) {\n    return expected_irq_count == observed_irq_count ? 0 : -EAGAIN;\n}\n```').join('\n\n');
  }
  function deepNodes(){
    let branch=node('scale20-leaf','核对重编程时序与 IRQ 计数，保留每次热重置前后的设备地址、消息数据和完整时间戳','blocked',[],Array.from({length:16},(_,i)=>'验证 '+(i+1)+'\n设备侧：保存消息地址、消息数据及队列映射。\n内核侧：对照 IRQ 处理次数与触发时间。\n判断：保留配置快照，再复核驱动与父中断域的初始化顺序。').join('\n\n'));
    const chain=['建立可复查的验证环境','保存正常路径与设备配置','核对驱动向量申请顺序','追踪设备 MSI domain','确认父中断域映射','对照虚拟 IRQ 与硬件向量','检查复位后的消息重写','核对多队列的恢复时序'];
    for(let i=chain.length-1;i>=0;i--)branch=node('scale20-depth-'+i,chain[i],'todo',[branch]);
    return [branch,node('scale20-evidence','对照每轮复现的日志与证据','todo',Array.from({length:12},(_,i)=>node('scale20-run-'+i,'第 '+(i+1)+' 轮复现：核对配置快照与向量申请返回值',i<3?'done':'todo',[],'保存本轮负载、配置与中断计数。'))),node('scale20-close','形成结论并验证修复结果','later')];
  }
  function install(){
    if(saved)return;
    captureKnowledgeEditor();flushNodeRecord();
    saved={tasks:structuredClone(tasks),groups:[...taskGroups],context:Object.fromEntries(contextKeys.map(k=>[k,structuredClone(state[k])])),drafts:structuredClone(state.drafts),knowledge:structuredClone([...knowledgeSessions]),files:structuredClone([...knowledgeFiles]),list:$('.tasks-scroll')?.scrollTop||0,nav:$('.nav-groups')?.scrollTop||0};
    groupNames.forEach(g=>{if(!taskGroups.includes(g))taskGroups.push(g);});
    const basis=tasks.find(t=>t.id===18001),note=longNote();
    for(let i=0;i<120;i++){
      const t=structuredClone(basis),id=firstId+i;
      Object.assign(t,{id,title:i===0?'核对连续热重置与多队列负载下的 MSI-X 中断恢复路径，记录设备重编程顺序、IRQ 映射及回归验证结果':actions[i%actions.length]+subjects[i%subjects.length]+'，保留'+['配置快照','返回值与日志','回归验证结果','问题处理依据'][Math.floor(i/subjects.length)%4]+'（第 '+(Math.floor(i/24)+1)+' 轮）',group:groupNames[i%groupNames.length],today:i<14,done:false,resolvedAt:'',deadlineAt:'',deadlineTime:'',deadlineReminderMinutes:null,deadline:'',recurrence:{frequency:'none'},description:'在固定环境与负载下保存可复查的验证依据，沿设备、驱动与内核逐层排查。',progress:'配置基线已保留，继续核对复位后的消息重写与中断映射。',conclusion:'',nodes:i===0?deepNodes():[node('scale20-'+id,'保留验证依据并记录结论','todo',[],'对照配置与日志，记录本轮判断。')],notes:i===0?note:'# '+subjects[i%subjects.length]+'\n\n保留环境、现象与验证依据。',history:[]});
      tasks.push(t);
    }
  }
  function selectScene(next){
    captureKnowledgeEditor();flushNodeRecord();closeOverlay();
    if(next==='normal'){
      if(saved){$('.knowledge-pane')?.remove();tasks.splice(0,tasks.length,...saved.tasks);taskGroups.splice(0,taskGroups.length,...saved.groups);knowledgeSessions.clear();saved.knowledge.forEach(([id,value])=>knowledgeSessions.set(id,value));knowledgeFiles.clear();saved.files.forEach(([path,value])=>knowledgeFiles.set(path,value));Object.assign(state,saved.context);state.drafts=saved.drafts;const previous=saved;saved=null;scene='normal';render();if($('.tasks-scroll'))$('.tasks-scroll').scrollTop=previous.list;if($('.nav-groups'))$('.nav-groups').scrollTop=previous.nav;return;}
      return;
    }
    install();scene=next;
    Object.assign(state,{route:'tasks',group:next==='groups'?groupNames[0]:'all',recordType:'task',task:firstId,node:next==='flow'?'scale20-leaf':null,pane:next==='notes'?'notes':'flow',filter:'active',priority:'all',query:'',deadlineScope:'all',deadlineDate:null,widgetOpen:false,navCollapsed:false,knowledgeMode:next==='notes'?'preview':state.knowledgeMode});
    render();
    if(next==='groups')$('.nav-button[data-group="'+CSS.escape(groupNames[0])+'"]')?.scrollIntoView({block:'nearest'});
    else if($('.nav-groups'))$('.nav-groups').scrollTop=0;
    if($('.tasks-scroll'))$('.tasks-scroll').scrollTop=0;
    locateCurrent();
  }
  function showScenes(trigger){
    closeOverlay();mountSurface(`<section class="surface-popover entry16-panel scale20-panel" role="dialog" aria-modal="true" aria-label="内容规模">${surfaceHeader('内容规模')}<p class="schedule-hint">120 项示例任务、18 个新增分组；仅用于检阅桌面布局。</p><div class="scale20-options">${[['list','长标题与任务列表','单行任务、连续滚动与定位当前'],['groups','大量分组','长名称、数量、分组操作与固定设置'],['notes','长篇知识笔记','表格与长代码单独滚动，正文页宽保留'],['flow','深层处理流','九层树与长记录，定位与展开阅读']].map(([v,title,hint])=>`<button class="${scene===v?'active':''}" data-scale20-scene="${v}" aria-pressed="${scene===v}"><span><strong>${title}</strong><small>${hint}</small></span>${scene===v?icon('check'):icon('arrow')}</button>`).join('')}</div><footer><button class="button" data-scale20-scene="normal" ${saved?'':'disabled'}>返回原预览</button></footer><p class="schedule-hint">返回时恢复载入前的记录、草稿与位置，放弃本规模场景的修改；刷新重置示例。</p></section>`,trigger,360);
    $('.scale20-panel').dataset.returnFocus=trigger.id?'#'+trigger.id:'[data-scale20="scenes"]';
  }
  function locateCurrent(){const row=$('.task-item.selected');row?.scrollIntoView({block:'center'});row?.querySelector('.task-select')?.focus({preventScroll:true});updateLocate();}
  function updateLocate(){const list=$('.tasks-scroll'),row=$('.task-item.selected'),b=$('.scale20-locate');if(!b||!list)return;const a=list.getBoundingClientRect(),r=row?.getBoundingClientRect();b.hidden=!r||(r.top>=a.top&&r.bottom<=a.bottom);}
  function setupBrief(){
    $('.scale20-brief-toggle')?.remove();const brief=$('.workspace>.brief');
    if(!brief||state.pane!=='flow'||!state.node)return;
    const drawer=!!$('.inspector.flow-drawer');brief.hidden=drawer||!state.scale20SummaryOpen;
    brief.insertAdjacentHTML('beforebegin',drawer?'<span class="scale20-brief-toggle">任务简报已收起</span>':`<button class="scale20-brief-toggle" data-scale20="summary" aria-expanded="${!!state.scale20SummaryOpen}">${icon('chevron')}任务简报</button>`);
  }
  const priorGroupMenu=showGroupMenu;
  showGroupMenu=function(group,trigger){priorGroupMenu(group,trigger);const menu=$('#overlay [role="menu"]');if(menu){menu.style.left=Math.max(12,Math.min(parseFloat(menu.style.left),innerWidth-menu.offsetWidth-12))+'px';menu.style.top=Math.max(12,Math.min(parseFloat(menu.style.top),innerHeight-menu.offsetHeight-50))+'px';}};
  const oldRender=render;
  render=function(){
    const listY=$('.tasks-scroll')?.scrollTop||0,navY=$('.nav-groups')?.scrollTop||0,noteY=$('.knowledge-body')?.scrollTop||0;
    const scope=JSON.stringify([state.route,state.group,state.recordType,state.filter,state.priority,state.deadlineScope,state.deadlineDate,state.query]),record=state.task;
    oldRender();
    const list=$('.tasks-scroll'),nav=$('.nav-groups');
    if(list){if(scope===lastScope)list.scrollTop=listY;list.addEventListener('scroll',updateLocate,{passive:true});}
    if(nav)nav.scrollTop=navY;
    if(record===lastRecord&&$('.knowledge-body'))$('.knowledge-body').scrollTop=noteY;
    lastScope=scope;lastRecord=record;
    const heading=$('.list-heading h2');if(heading?.firstChild?.nodeType===Node.TEXT_NODE){const label=document.createElement('span');label.className='scale20-list-title';label.textContent=heading.firstChild.textContent;label.title=label.textContent;heading.replaceChild(label,heading.firstChild);}
    const crumb=$('.breadcrumb>b');if(crumb)crumb.title=crumb.textContent;
    $('.list-foot>span')?.setAttribute('title',$('.list-foot>span').textContent);
    document.querySelectorAll('.task-properties .group-property').forEach(b=>{for(const n of [...b.childNodes])if(n.nodeType===Node.TEXT_NODE){const label=document.createElement('span');label.className='scale20-group-name';label.textContent=n.textContent;b.replaceChild(label,n);b.title=n.textContent;}});
    const foot=$('.list-foot:not(.bulk-dock)');if(foot&&!foot.querySelector('.scale20-locate'))foot.insertAdjacentHTML('beforeend',`<button class="text-button scale20-locate" data-scale20="locate" title="定位当前任务" hidden>${icon('locate20')}定位当前</button>`);
    document.querySelectorAll('.knowledge-preview table').forEach(table=>{const wrap=document.createElement('div');wrap.className='scale20-table-scroll';table.before(wrap);wrap.append(table);});
    setupBrief();
    updateLocate();
  };
  $('.review-controls').insertAdjacentHTML('afterbegin',`<button class="desk19-trigger" data-scale20="scenes" aria-haspopup="dialog" aria-expanded="false">内容规模${icon('down')}</button>`);
  window.addEventListener('click',e=>{const b=e.target.closest('button[data-scale20],button[data-scale20-scene]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.dataset.scale20Scene)selectScene(b.dataset.scale20Scene);else if(b.dataset.scale20==='locate')locateCurrent();else if(b.dataset.scale20==='summary'){state.scale20SummaryOpen=!state.scale20SummaryOpen;render();$('.scale20-brief-toggle')?.focus({preventScroll:true});}else showScenes(b);},true);
  window.addEventListener('resize',()=>{updateLocate();setupBrief();});
  globalThis.loopWidgetReview=function(){showScenes($('#reviewInfo'));};
  reviewInfo=globalThis.loopWidgetReview;
  document.title='Loop · 第二十阶段设计';$('.review-bar b').textContent='第二十阶段 · 内容规模';
  selectScene('list');
})();
