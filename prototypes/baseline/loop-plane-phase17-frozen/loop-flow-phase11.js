/* Desktop Demo refinement: preserve the tree and its original operations. */
(() => {
  const baseRender=render,baseInspector=renderInspector;
  let lastTask=null,lastNode=null,reading=false,locatorQuery='',sampleActive=false,savedContext=null;
  paths.expandRecord='M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5';
  paths.restoreRecord='M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5';
  const depthOf=nodes=>Math.max(0,...nodes.map(n=>n.children.length?1+depthOf(n.children):0));
  function nodeHtml(n,depth=0) {
    const adding=state.adding?.taskId===state.task&&state.adding.parentId===n.id,children=n.children.length||adding;
    return '<li class="flow-item" data-flow-id="'+n.id+'" data-flow-depth="'+depth+'"><div class="flow-row '+n.status+' '+(n.id===state.node?'selected':'')+'"><button class="collapse '+(children?'':'empty')+'" data-collapse="'+n.id+'" aria-label="'+(n.collapsed?'展开':'收起')+' '+esc(n.title)+'" aria-expanded="'+!n.collapsed+'" '+(children?'':'disabled')+'>'+icon(n.collapsed?'chevron':'down')+'</button><button class="node-status '+n.status+'" data-status="'+n.id+'" title="选择节点状态" aria-label="'+esc(n.title)+'：'+labels[n.status]+'，选择状态" aria-haspopup="menu">'+icon(n.status==='todo'?'circle':n.status)+'</button><button class="node-title" data-node="'+n.id+'" title="'+esc(n.title)+'" aria-pressed="'+(n.id===state.node)+'">'+esc(n.title)+'</button><span class="node-badge '+n.status+'">'+labels[n.status]+'</span><button class="node-add" data-add-child="'+n.id+'" title="添加子节点" aria-label="给 '+esc(n.title)+' 添加子节点">'+icon('plus')+'</button></div>'+(children&&!n.collapsed?'<ol class="flow-children">'+n.children.map(c=>nodeHtml(c,depth+1)).join('')+(adding?renderNodeDraft():'')+'</ol>':'')+'</li>';
  }
  renderNode=n=>nodeHtml(n);
  renderFlow=function(t) {
    const list=flat(t.nodes),n=list.find(n=>n.id===state.node),pending=list.filter(n=>n.status==='todo'||n.status==='blocked');
    return '<section class="flow-pane" aria-label="层级处理流"><div class="flow-toolbar"><span>'+countDone(t)+' / '+list.length+' 已完成</span><div class="flow-tools"><button class="text-button" data-flow-action="next-pending" '+(pending.length?'':'disabled')+'>下一待处理'+icon('arrow')+'</button><button class="icon-button" data-flow-action="locate" aria-label="定位处理流节点" title="定位节点" aria-haspopup="dialog">'+icon('search')+'</button></div></div><div class="flow-scroll"><ol class="flow-tree" style="--flow-depth:'+depthOf(t.nodes)+'">'+t.nodes.map(renderNode).join('')+(state.adding?.taskId===t.id&&!state.adding.parentId?renderNodeDraft():'')+'</ol><button class="add-node" data-action="add-node">'+icon('plus')+'添加节点</button></div></section>'+(n?renderInspector(t,n):'');
  };
  renderInspector=function(t,n) {
    const path=getPath(t.nodes,n.id),parent=path.at(-2);
    const location='<nav class="inspector-location" aria-label="节点位置">'+(parent?'<button class="text-button flow-parent" data-flow-action="parent" data-flow-node="'+parent.id+'" title="返回上级：'+esc(parent.title)+'">'+icon('folder')+'<span>'+esc(parent.title)+'</span></button>':'<span class="flow-parent">顶层节点</span>')+'<button class="text-button flow-path-button" data-flow-action="path" aria-haspopup="menu" aria-label="查看完整节点路径">第 '+path.length+' 层'+icon('down')+'</button></nav>';
    const head='<header class="inspector-head">'+icon('note')+'节点记录<div class="inspector-head-actions"><button class="icon-button" data-flow-action="reading" aria-label="'+(reading?'恢复处理流视图':'展开节点记录')+'" title="'+(reading?'恢复处理流视图':'展开节点记录')+'" aria-pressed="'+reading+'">'+icon(reading?'restoreRecord':'expandRecord')+'</button><button class="icon-button" data-action="close-node" aria-label="关闭节点详情">'+icon('close')+'</button></div></header>';
    return baseInspector(t,n).replace(/<header class="inspector-head">[\s\S]*?<\/header>/,head).replace(/<p class="inspector-path">[\s\S]*?<\/p>/,'').replace('<div class="inspector-body">','<div class="inspector-body">'+location);
  };
  render=function() {
    const t=currentTask(),changed=t?.id!==lastTask||state.node!==lastNode,active=document.activeElement,focusAction=active?.dataset.flowAction;
    const focusStep=active?.matches('.inspector-foot [data-prev]')?[...active.parentElement.querySelectorAll('[data-prev]')].indexOf(active):-1;
    if(t?.id!==lastTask||!state.node)reading=false;
    if(t&&state.node&&changed)getPath(t.nodes,state.node).slice(0,-1).forEach(n=>n.collapsed=false);
    baseRender();
    const panel=document.querySelector('.inspector'),content=document.querySelector('.tab-content');
    if(panel){panel.classList.toggle('flow-drawer',matchMedia('(max-width:1100px)').matches&&!reading);content.classList.toggle('flow-reading',reading);document.querySelector('.flow-pane').inert=reading;}
    if(focusAction)document.querySelector('[data-flow-action="'+focusAction+'"]')?.focus({preventScroll:true});
    if(focusStep>=0){const step=document.querySelectorAll('.inspector-foot [data-prev]')[focusStep];(step&&!step.disabled?step:document.querySelector('[data-flow-action="reading"]'))?.focus({preventScroll:true});}
    if(changed&&state.node&&state.pane==='flow')document.querySelector('.node-title[data-node="'+CSS.escape(state.node)+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
    lastTask=t?.id||null;lastNode=state.node;
  };
  function openNode(id) {
    const t=currentTask();if(!t||!flat(t.nodes).some(n=>n.id===id))return;
    closeOverlay();state.node=id;state.pane='flow';state.menu=false;render();
    (reading?document.querySelector('[data-flow-action="reading"]'):document.querySelector('.node-title[data-node="'+CSS.escape(id)+'"]'))?.focus({preventScroll:true});
  }
  function returnTo(trigger){document.querySelector('.surface-popover').dataset.returnFocus='[data-flow-action="'+trigger.dataset.flowAction+'"]';}
  function resultsMarkup() {
    const t=currentTask(),query=locatorQuery.trim().toLowerCase(),list=flat(t.nodes).filter(n=>!query||(n.title+' '+n.note).toLowerCase().includes(query));
    if(!list.length)return '<div class="flow-locator-empty"><span>没有匹配节点</span><button class="text-button" data-flow-action="clear-locator">清空</button></div>';
    return list.map(n=>{const path=getPath(t.nodes,n.id),parent=path.at(-2);return '<button class="flow-result '+(n.id===state.node?'current':'')+'" data-flow-action="result" data-flow-node="'+n.id+'"><strong>'+esc(n.title)+'</strong><small><span class="result-level">第 '+path.length+' 层</span>'+labels[n.status]+(parent?' · '+esc(parent.title):' · 顶层')+'</small></button>';}).join('');
  }
  function locate(trigger) {
    locatorQuery='';mountSurface('<section class="surface-popover flow-locator" role="dialog" aria-modal="true" aria-label="定位处理流节点">'+surfaceHeader('定位节点')+'<label class="sr-only" for="flow-locator-query">搜索当前任务的节点与记录</label><input id="flow-locator-query" type="search" placeholder="搜索节点标题或处理记录" autocomplete="off" autofocus><div class="flow-locator-results" aria-live="polite">'+resultsMarkup()+'</div></section>',trigger,360);returnTo(trigger);
  }
  function pathMenu(trigger) {
    const path=getPath(currentTask().nodes,state.node);
    mountSurface('<section class="surface-popover flow-path-menu" role="menu" aria-label="完整节点路径">'+surfaceHeader('节点路径')+path.map((n,i)=>'<button class="flow-result '+(n.id===state.node?'current':'')+'" data-flow-action="result" data-flow-node="'+n.id+'" role="menuitem"><small class="result-level">第 '+(i+1)+' 层</small><strong>'+esc(n.title)+'</strong></button>').join('')+'</section>',trigger,340);returnTo(trigger);
  }
  window.addEventListener('click',e=>{
    const b=e.target.closest('[data-flow-action]');if(!b||b.disabled)return;e.preventDefault();e.stopImmediatePropagation();const a=b.dataset.flowAction;
    if(a==='locate')locate(b);
    else if(a==='result'||a==='parent')openNode(b.dataset.flowNode);
    else if(a==='path')pathMenu(b);
    else if(a==='reading'){reading=!reading;render();document.querySelector('[data-flow-action="reading"]')?.focus();}
    else if(a==='next-pending'){const nodes=flat(currentTask().nodes),start=nodes.findIndex(n=>n.id===state.node),rotated=[...nodes.slice(start+1),...nodes.slice(0,start+1)],n=rotated.find(n=>n.status==='todo'||n.status==='blocked');if(n)openNode(n.id);}
    else if(a==='clear-locator'){locatorQuery='';document.querySelector('#flow-locator-query').value='';document.querySelector('.flow-locator-results').innerHTML=resultsMarkup();document.querySelector('#flow-locator-query').focus();}
  },true);
  document.addEventListener('input',e=>{if(e.target.id==='flow-locator-query'){locatorQuery=e.target.value;document.querySelector('.flow-locator-results').innerHTML=resultsMarkup();}});
  window.addEventListener('keydown',e=>{
    if(e.isComposing||document.querySelector('#overlay').firstElementChild)return;
    const b=e.target.closest('.node-title');if(!b||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();e.stopImmediatePropagation();const t=currentTask(),path=getPath(t.nodes,b.dataset.node),n=path.at(-1),visible=[...document.querySelectorAll('.flow-scroll .node-title')],i=visible.indexOf(b);
    if(e.key==='ArrowDown')visible[Math.min(i+1,visible.length-1)]?.focus();
    else if(e.key==='ArrowUp')visible[Math.max(i-1,0)]?.focus();
    else if(e.key==='ArrowRight'&&n.children.length){if(n.collapsed){n.collapsed=false;render();}else document.querySelector('.node-title[data-node="'+CSS.escape(n.children[0].id)+'"]')?.focus();}
    else if(e.key==='ArrowLeft'){if(n.children.length&&!n.collapsed){n.collapsed=true;render();}else if(path.at(-2))document.querySelector('.node-title[data-node="'+CSS.escape(path.at(-2).id)+'"]')?.focus();}
    document.activeElement?.scrollIntoView({block:'nearest',inline:'nearest'});
  },true);
  document.addEventListener('keydown',e=>{
    if(e.target.id==='flow-locator-query'&&!e.isComposing){if(e.key==='ArrowDown'){e.preventDefault();document.querySelector('.flow-locator-results .flow-result')?.focus();}else if(e.key==='Enter'){e.preventDefault();const n=document.querySelector('.flow-locator-results [data-flow-node]');if(n)openNode(n.dataset.flowNode);}}
    else if(e.target.closest('.flow-locator-results')&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const rows=[...document.querySelectorAll('.flow-locator-results .flow-result')],i=rows.indexOf(document.activeElement);rows[(i+(e.key==='ArrowDown'?1:rows.length-1))%rows.length]?.focus();}
  },true);
  window.addEventListener('resize',()=>{document.querySelector('.inspector')?.classList.toggle('flow-drawer',matchMedia('(max-width:1100px)').matches&&!reading);});
  const longRecord=Array.from({length:12},(_,i)=>'验证 '+(i+1)+'：热重置后重新采集设备配置与 IRQ 计数\n设备侧观察：向量 '+i+' 的配置在初始化与复位后进行逐项对照。\n内核侧依据：结合 /proc/interrupts 与驱动日志确认实际触发与处理次数。\n当前判断：保留完整时间戳，继续核对设备写入和父中断域分配的一致性。').join('\n\n');
  const leaf=node('cx-timing','在多队列负载与连续热重置之间核对设备侧 Message Address / Message Data 的重编程时序，并记录 pci_msi_domain_alloc_irqs() 返回值与实际 IRQ 触发计数','blocked',[],longRecord);
  const complexTask={id:30,kind:'task',title:'热重置后 MSI-X 中断丢失的分层验证（复杂示例）',group:'技术排查',priority:'high',today:false,deadline:'',deadlineAt:'',description:'复杂示例：包含长标题、七层节点与较长处理记录，用于检阅桌面处理流。',progress:'沿设备重编程、驱动初始化和父中断域逐层验证，保持原有树状过程。',conclusion:'',createdAt:demoToday,updatedAt:demoToday,nodes:[node('cx-env','建立能够反复恢复的测试环境','done',[node('cx-baseline','保存设备、内核版本与正常中断计数基线','done'),node('cx-reset','记录连续 20 次热重置的最小复现步骤','done')]),node('cx-route','沿 MSI-X 分配与重编程路径逐层核对','todo',[node('cx-request','检查驱动申请向量与回滚的完整顺序','todo',[node('cx-domain','追踪当前设备所使用的 MSI domain','todo',[node('cx-parent','对照父中断域分配与硬件映射','todo',[node('cx-vector','逐项比较虚拟 IRQ、硬件向量和队列编号','todo',[node('cx-program','确认复位后设备重新写入有效的消息地址与数据','todo',[leaf,node('cx-control','对照不触发热重置的正常负载')])])])])]),node('cx-affinity','排除 CPU affinity 与队列绑定的影响','later')]),node('cx-logs','对照正常与异常的日志及证据','todo',Array.from({length:12},(_,i)=>node('cx-log-'+i,'第 '+(i+1)+' 组复现：核对配置快照、向量申请返回值和中断计数',i<3?'done':'todo',[],'按同样的负载与初始化顺序记录，保留设备侧与内核侧的时间戳。'))),node('cx-close','形成结论，执行修复后的回归验证','later')],notes:'# 复杂示例\n\n记录 MSI-X 热重置路径的验证依据。',history:[]};
  const controls=document.querySelector('.review-controls');controls.insertAdjacentHTML('afterbegin','<label for="flow-case">处理流示例</label><select id="flow-case" aria-label="处理流示例"><option value="normal">常规</option><option value="complex">复杂任务</option></select>');
  document.querySelector('#flow-case').addEventListener('change',e=>{
    captureKnowledgeEditor();flushNodeRecord();closeOverlay();
    if(e.target.value==='complex'){
      if(!sampleActive)savedContext=Object.fromEntries(['route','group','recordType','filter','priority','deadlineScope','deadlineDate','query','task','node','pane'].map(k=>[k,state[k]]));
      if(!tasks.some(t=>t.id===30))tasks.push(complexTask);sampleActive=true;
      Object.assign(state,{route:'tasks',group:'技术排查',recordType:'task',filter:'active',priority:'all',deadlineScope:'all',deadlineDate:null,query:'',task:30,node:null,pane:'flow'});
    }else{const i=tasks.findIndex(t=>t.id===30);if(i>=0)tasks.splice(i,1);sampleActive=false;if(savedContext)Object.assign(state,savedContext);ensureSelection();}
    reading=false;render();
  });
  document.title='Loop · Plane 方向 · 第十一阶段';document.querySelector('.review-bar b').textContent='第十一阶段 · 复杂处理流';document.querySelector('.review-bar .review-note').textContent='定位 · 层级 · 记录阅读';
  window.addEventListener('click',e=>{
    if(e.target.closest('#reviewInfo')&&window.loopWidgetReview){e.preventDefault();e.stopImmediatePropagation();window.loopWidgetReview();return;}
    if(!e.target.closest('#reviewInfo'))return;e.preventDefault();e.stopImmediatePropagation();document.querySelector('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="#reviewInfo"><section class="dialog" role="dialog" aria-modal="true" aria-label="第十一阶段评审">'+surfaceHeader('第十一阶段评审')+'<p>底部切换「复杂任务」，检阅长标题、七层节点和较长记录。处理流工具栏可定位当前任务的节点，或前往下一待处理节点。</p><p>选中折叠分支中的节点会展开完整路径；详情中可返回上级、查看路径、展开记录阅读。树中方向键移动焦点与展开收起，Enter 打开记录。</p><p>使用本页示例数据，不改真实任务；常规任务、知识笔记与已确认的批量操作均保留。</p><footer><button class="button primary" data-action="close-dialog">开始评审</button></footer></section></div>';document.querySelector('.dialog [data-action="close-dialog"]').focus();
  },true);
  render();
})();
