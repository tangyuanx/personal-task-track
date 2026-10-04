(() => {
  if (Number(new URLSearchParams(location.search).get('phase') || 23) < 23) return;
  document.body.dataset.notebook23Enabled = '';
  Object.assign(paths,{note23Outline:'M4 5h2m4 0h10M4 12h2m4 0h10M4 19h2m4 0h10'});
  const views = new Map(), rich = new Map(), sources = new Map(), diskBaselines = new Map(knowledgeFiles);
  let findRanges = [], findIndex = -1, updateFrame = 0;
  const view = t => {if(!views.has(t.id))views.set(t.id,{outline:false,find:false,query:'',heading:-1});return views.get(t.id);};
  const stamp = () => demoNow.slice(11,16);
  const attention = k => !!k.issue || !!k.partial || ['EXTERNAL_CHANGED','FILE_MISSING','READ_ONLY'].includes(k.state);
  function clearPartial(k){k.partial='';delete k.partialContext;}
  function reconcilePartial(k){
    if(!k.partial)return;
    const pending=k.partialContext;
    // Retry belongs to the original binding and snapshot only. Accepted loads,
    // unlink/discard and completed replacement saves retire that pending result.
    if(!pending||k.path!==pending.path||k.saved!==pending.baseline||(!k.busy&&!k.dirty&&!k.recovery))clearPartial(k);
  }
  const fileName = (t,k) => k.path ? k.path.split('/').at(-1) : (headings(t.notes)[0]?.text || '未命名笔记');
  function headings(md) {
    let offset=0,fence='';const found=[];
    for(const line of md.split('\n')) {
      const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence='';}
      else if(!fence){const m=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);if(m)found.push({level:m[1].length,text:m[2].replace(/[*`]/g,''),offset});}
      offset+=line.length+1;
    }return found;
  }
  function receipt(t,k) {
    if(k.busy)return '正在保存文件… · 可继续编辑';
    if(k.partial)return '文件已写入 · 关联记录待重试';
    if(k.issue || ['EXTERNAL_CHANGED','FILE_MISSING','READ_ONLY'].includes(k.state))return '当前内容保留 · 文件尚未同步';
    if(!k.path)return '本页草稿已保留 · 尚未保存为文件';
    if(k.dirty)return '本页草稿已保留 · 修改尚未写入文件';
    return '已保存到示例文件'+(k.savedAt?' · '+k.savedAt:'');
  }
  function outlineHTML(t) {
    const v=view(t),list=headings(t.notes);
    return `<aside class="note23-outline" aria-label="笔记大纲"><header><span>大纲</span><button class="icon-button" data-note23="outline" aria-label="收起大纲">${icon('close')}</button></header><nav aria-label="篇内标题">${list.map((h,i)=>`<button data-note23-heading="${i}" style="padding-left:${7+Math.min(h.level-1,3)*10}px" ${v.heading===i?'aria-current="location"':''}>${esc(h.text)}</button>`).join('')||'<p>暂无标题</p>'}</nav></aside>`;
  }
  const oldRenderKnowledge=renderKnowledge;
  renderKnowledge=function(t) {
    const k=knowledgeFor(t),v=view(t),template=document.createElement('template');
    reconcilePartial(k);
    if(k.path&&k.state==='SAVED'&&!k.dirty&&!k.partial&&knowledgeFiles.get(k.path)===k.file)diskBaselines.set(k.path,k.file);
    template.innerHTML=oldRenderKnowledge(t);const pane=template.content.firstElementChild;
    pane.querySelector('.knowledge-file-meta').outerHTML=`<div class="note23-identity"><button class="note23-filename" data-note23="file-info" aria-label="笔记文件信息" aria-haspopup="dialog" aria-expanded="false" title="${esc(k.path||'未关联文件的草稿')}">${icon('note')}<span>${esc(fileName(t,k))}</span>${k.dirty?'<i class="note23-dirty" aria-label="尚未保存的修改"></i>':''}</button></div>`;
    pane.querySelector('.knowledge-header-actions').insertAdjacentHTML('afterbegin',`<div class="note23-tools" role="group" aria-label="文档工具"><button class="icon-button" data-note23="find" aria-label="在笔记中查找" title="在笔记中查找 · ⌘ / Ctrl + F" aria-pressed="${v.find}">${icon('search')}</button><button class="icon-button" data-note23="outline" aria-label="笔记大纲" title="笔记大纲" aria-pressed="${v.outline}">${icon('note23Outline')}</button></div>`);
    if(v.find)pane.querySelector('.knowledge-body').insertAdjacentHTML('beforebegin',`<div class="note23-find" role="search" aria-label="笔记内查找"><input id="note23-query" aria-label="查找笔记文字" placeholder="在当前笔记中查找" value="${esc(v.query)}" autocomplete="off"><output id="note23-match-count" aria-live="polite"></output><button class="icon-button" data-note23="find-prev" aria-label="上一个匹配">${icon('chevron').replace('<svg','<svg style="transform:rotate(180deg)"')}</button><button class="icon-button" data-note23="find-next" aria-label="下一个匹配">${icon('chevron')}</button><button class="icon-button" data-note23="find" aria-label="关闭笔记查找">${icon('close')}</button></div>`);
    const body=pane.querySelector('.knowledge-body'),content=document.createElement('div');content.className='note23-content';body.before(content);content.append(body);if(v.outline)content.insertAdjacentHTML('beforeend',outlineHTML(t));
    const footer=pane.querySelector('.knowledge-footer');footer.insertAdjacentHTML('afterbegin',`<div class="note23-receipt ${attention(k)?'attention':''}" role="status" data-note23-receipt>${icon(attention(k)?'blocked':k.busy?'repeat':k.dirty||!k.path?'note':'check')}<span>${esc(receipt(t,k))}</span></div>`);
    pane.querySelector('[data-note-recovery]').remove();
    const save=pane.querySelector('[data-note-save]');save.innerHTML=icon('check')+(k.busy?'保存中…':k.partial?'重试关联':k.path?'保存':'保存为文件');
    return pane.outerHTML;
  };
  const oldMeta=updateKnowledgeMeta;
  updateKnowledgeMeta=function(t) {
    reconcilePartial(knowledgeFor(t));oldMeta(t);const pane=$('.knowledge-pane');if(pane?.dataset.taskId!==String(t.id))return;
    const k=knowledgeFor(t),r=pane.querySelector('[data-note23-receipt]');if(r){r.classList.toggle('attention',attention(k));r.innerHTML=icon(attention(k)?'blocked':k.busy?'repeat':k.dirty||!k.path?'note':'check')+'<span>'+esc(receipt(t,k))+'</span>';}
    const save=pane.querySelector('[data-note-save]');if(save){save.disabled=k.busy||k.state==='SAVED'&&!k.dirty&&!k.issue&&!k.partial;save.innerHTML=icon('check')+(k.busy?'保存中…':k.partial?'重试关联':k.path?'保存':'保存为文件');}
    const name=pane.querySelector('.note23-filename');if(name&&!name.querySelector('.note23-dirty')&&k.dirty)name.insertAdjacentHTML('beforeend','<i class="note23-dirty" aria-label="尚未保存的修改"></i>');if(!k.dirty)name?.querySelector('.note23-dirty')?.remove();
    cancelAnimationFrame(updateFrame);updateFrame=requestAnimationFrame(()=>{refreshOutline(t);refreshFind(false);});
  };
  function trim(cache) {while(cache.size>3){const [id,entry]=cache.entries().next().value;entry.instance?.destroy()?.catch?.(()=>{});cache.delete(id);}}
  captureKnowledgeEditor=function() {
    captureKnowledgeDraft();
    if(knowledgeEditor){const entry=knowledgeEditor;entry.focused=entry.host.contains(document.activeElement);entry.host.remove();rich.delete(entry.task.id);rich.set(entry.task.id,entry);trim(rich);knowledgeEditor=null;}
    const input=$('#knowledge-source');if(input){const t=tasks.find(t=>String(t.id)===input.dataset.taskId);if(t){input.note23Focused=document.activeElement===input;input.remove();sources.delete(t.id);sources.set(t.id,{task:t,input,synced:input.value});trim(sources);}}
    knowledgeMount++;
  };
  const oldMount=mountKnowledgeEditor;
  mountKnowledgeEditor=async function() {
    const t=currentTask(),host=$('#knowledge-rich-host'),source=$('#knowledge-source');
    if(t&&host&&rich.has(t.id)) {
      const entry=rich.get(t.id);rich.delete(t.id);
      if(entry.task===t&&entry.synced===t.notes){host.replaceWith(entry.host);knowledgeEditor=entry;updateKnowledgeMeta(t);updateKnowledgeToolbar();$('.knowledge-body').scrollTop=knowledgeFor(t).scroll||0;if(entry.focused&&!$('#overlay').firstElementChild)entry.instance.restoreSelection(entry.instance.getSelection());refreshFind(false);return;}
      entry.instance.destroy()?.catch?.(()=>{});
    }
    if(t&&source&&sources.has(t.id)){const entry=sources.get(t.id);sources.delete(t.id);if(entry.task===t&&entry.synced===t.notes){source.replaceWith(entry.input);if(entry.input.note23Focused&&!$('#overlay').firstElementChild)entry.input.focus({preventScroll:true});}}
    await oldMount();if(t)refreshOutline(t);refreshFind(false);
  };
  const oldRender=render;
  render=function(){knowledgeSessions.forEach(reconcilePartial);CSS.highlights?.delete('note23-matches');CSS.highlights?.delete('note23-current');oldRender();if(state.pane==='notes'&&$('.knowledge-pane')){const foot=$('.workspace-foot');if(foot)foot.innerHTML='<span>知识笔记 · 本页预览</span><span>⌘ / Ctrl + S 保存文件</span>';}};
  const oldNotice=renderKnowledgeNotice;
  renderKnowledgeNotice=function(t){const k=knowledgeFor(t);if(k.partial)return `<div class="knowledge-notice attention" role="status"><span>${icon('blocked')}文件已写入，但关联记录未保存。恢复草稿仍保留。</span><div><button class="text-button" data-note23="retry-partial">重试关联</button><button class="text-button" data-knowledge-action="save-as">另存为</button></div></div>`;return oldNotice(t);};
  const oldSave=saveKnowledge;
  saveKnowledge=function(t=currentTask(),options={}) {
    captureKnowledgeDraft();const k=knowledgeFor(t);reconcilePartial(k);if(k.partial&&!options.saveAs){retryPartial(t);if(options.afterSave){if(k.dirty)saveKnowledge(t,options);else{options.afterSave();render();}}return;}
    if(!options.saveAs&&!options.overwrite&&k.path&&!['FILE_MISSING','READ_ONLY'].includes(k.state)){
      // The rich editor canonicalizes Markdown table spacing. Compare the raw
      // simulated disk baseline, rather than its formatted editor representation.
      const actual=knowledgeFiles.get(k.path);if(actual!==undefined&&diskBaselines.has(k.path)&&actual!==diskBaselines.get(k.path)){k.external=actual;k.state='EXTERNAL_CHANGED';render();}
    }
    if(k.failAssociationNext&&!k.busy&&k.path&&!options.saveAs&&k.state!=='EXTERNAL_CHANGED'){
      const snapshot=t.notes;k.busy=true;render();setTimeout(()=>{k.busy=false;k.failAssociationNext=false;knowledgeFiles.set(k.path,snapshot);k.file=snapshot;k.partial=snapshot;k.partialContext={path:k.path,baseline:k.saved};k.recovery=t.notes;render();},400);return;
    }
    oldSave(t,{...options,afterSave:()=>{clearPartial(k);options.afterSave?.();}});
    if(k.busy){const wait=setInterval(()=>{if(!k.busy){clearInterval(wait);if(!k.issue&&!k.partial&&['SAVED','DIRTY'].includes(k.state)){k.savedAt=stamp();diskBaselines.set(k.path,k.file);}if($('.knowledge-pane')?.dataset.taskId===String(t.id))updateKnowledgeMeta(t);}},80);}
  };
  function retryPartial(t){const k=knowledgeFor(t);reconcilePartial(k);if(k.busy||!k.partial)return;k.saved=k.partial;clearPartial(k);k.dirty=t.notes!==k.saved;k.state=k.dirty?'DIRTY':'SAVED';k.recovery=k.dirty?t.notes:'';k.savedAt=stamp();diskBaselines.set(k.path,k.file);render();toast('示例关联记录已恢复');}
  const oldClose=closeKnowledgeNote;
  closeKnowledgeNote=function(){captureKnowledgeDraft();const t=currentTask(),k=knowledgeFor(t);if(k.path&&(k.dirty||k.partial)){
    knowledgeDialog('关闭笔记','<p class="knowledge-dialog-copy">当前修改尚未全部保存。保留草稿后可回来继续，文件版本保持不变。</p>','<button class="button" data-action="close-dialog">继续编辑</button><button class="button" data-knowledge-action="keep-draft">保留草稿并关闭</button><button class="button primary" data-knowledge-action="save-close">保存并关闭</button>');return;}
    oldClose();
  };
  function fileInfo(trigger) {
    const t=currentTask(),k=knowledgeFor(t),images=(t.notes.match(/!\[/g)||[]).length;
    mountSurface(`<section class="surface-popover note23-details" role="dialog" aria-label="笔记文件信息">${surfaceHeader('笔记文件')}<dl><dt>名称</dt><dd>${esc(fileName(t,k))}</dd><dt>路径</dt><dd>${esc(k.path||'未关联文件')}</dd><dt>状态</dt><dd>${esc(receipt(t,k))}</dd><dt>格式</dt><dd>Markdown · UTF-8</dd><dt>图片引用</dt><dd>${images} 项</dd></dl><p>图片附件与 Markdown 文件需要一同备份。解除关联会保留正文、文件与附件。</p><p class="knowledge-demo-boundary">当前为示例文件；保存与草稿仅保留在本页。</p><footer><button class="button" data-knowledge-action="save-as">另存为</button>${k.path?'<button class="button" data-knowledge-action="remove-binding">解除关联…</button>':''}</footer></section>`,trigger,360);
    $('.note23-details').dataset.returnFocus='.note23-filename';
  }
  showKnowledgeFileMenu=function(trigger){const k=knowledgeFor(currentTask());captureKnowledgeDraft();const item=(a,label)=>`<button class="button" role="menuitem" data-knowledge-action="${a}">${label}</button>`;
    mountSurface(`<div class="surface-popover" role="menu" aria-label="笔记文件操作"><div class="note23-menu-label">文件</div>${item('open-file','打开 Markdown 文件…')}${item('save-as','另存为…')}<div class="menu-divider"></div><div class="note23-menu-label">当前笔记</div><button class="button" role="menuitem" data-note23="file-info">文件信息</button>${k.path?item('remove-binding','解除文件关联…'):''}${item('close-note','关闭笔记')}<div class="menu-divider"></div><div class="note23-menu-label">导出</div>${item('export-note','导出笔记…')}${item('export-task','分享／导出任务…')}</div>`,trigger,232);
  };
  function refreshOutline(t) {
    const aside=$('.note23-outline');if(!aside)return;const html=outlineHTML(t);if(aside.outerHTML!==html)aside.outerHTML=html;
  }
  function locateHeading(index) {
    captureKnowledgeDraft();const t=currentTask(),h=headings(t.notes)[index];if(!h)return;view(t).heading=index;
    const source=$('#knowledge-source');if(source){source.focus();source.setSelectionRange(h.offset,h.offset);source.scrollTop=h.offset/Math.max(1,source.value.length)*source.scrollHeight;}
    else{$('.knowledge-body')?.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6,.knowledge-preview h1,.knowledge-preview h2,.knowledge-preview h3,.knowledge-preview h4,.knowledge-preview h5,.knowledge-preview h6')[index]?.scrollIntoView({block:'start',behavior:'auto'});}
    refreshOutline(t);
  }
  function refreshFind(navigate=true,direction=0) {
    const bar=$('.note23-find');if(!bar){CSS.highlights?.delete('note23-matches');CSS.highlights?.delete('note23-current');return;}
    const query=$('#note23-query').value.toLocaleLowerCase(),source=$('#knowledge-source'),root=$('.ProseMirror')||$('.knowledge-preview');
    let text='',parts=[];if(source)text=source.value;else if(root){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('button,[contenteditable="false"],.cm-gutters')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});let n,block;while((n=walker.nextNode())){const b=n.parentElement.closest('p,h1,h2,h3,h4,h5,h6,pre,li,td,th');if(block&&b!==block)text+='\n';block=b;parts.push({node:n,start:text.length});text+=n.data;}}
    const matches=[];if(query){const hay=text.toLocaleLowerCase();let i=0;while((i=hay.indexOf(query,i))>=0){matches.push(i);i+=query.length;}}
    if(direction)findIndex=matches.length?(findIndex+direction+matches.length)%matches.length:-1;else findIndex=matches.length?Math.min(Math.max(findIndex,0),matches.length-1):-1;
    $('#note23-match-count').textContent=query?(matches.length?`${findIndex+1} / ${matches.length}`:'无匹配'):'输入查找文字';
    bar.querySelectorAll('[data-note23="find-next"],[data-note23="find-prev"]').forEach(b=>b.disabled=!matches.length);
    findRanges=[];
    if(source){if(navigate&&findIndex>=0){source.setSelectionRange(matches[findIndex],matches[findIndex]+query.length);source.scrollTop=matches[findIndex]/Math.max(1,text.length)*source.scrollHeight;}}
    else if(parts.length){for(const at of matches.slice(0,500)){const first=parts.findLast(p=>p.start<=at),last=parts.findLast(p=>p.start<at+query.length);if(!first||!last)continue;const r=document.createRange();r.setStart(first.node,at-first.start);r.setEnd(last.node,Math.min(last.node.length,at+query.length-last.start));findRanges.push(r);}
      if(typeof Highlight==='function'&&CSS.highlights){CSS.highlights.set('note23-matches',new Highlight(...findRanges));CSS.highlights.set('note23-current',new Highlight(...(findRanges[findIndex]?[findRanges[findIndex]]:[])));}
      if(navigate&&findIndex>=0){const at=matches[findIndex],p=parts.findLast(p=>p.start<=at);p?.node.parentElement.scrollIntoView({block:'center',behavior:'auto'});}
    }
  }
  const oldScenario=setKnowledgeScenario;
  setKnowledgeScenario=function(value){const current=knowledgeFor(currentTask());clearPartial(current);current.failAssociationNext=false;if(value==='partial-save'){captureKnowledgeDraft();const t=currentTask(),k=knowledgeFor(t);if(!k.path){k.path='/示例/知识库/'+fileName(t,k)+'.md';knowledgeFiles.set(k.path,k.saved||t.notes);k.file=k.saved||t.notes;}k.issue='';k.state='DIRTY';k.failAssociationNext=true;updateKnowledgeDraft(t,t.notes+'\n\n补充：核对关联记录保存。');saveKnowledge(t);return;}oldScenario(value);};
  window.addEventListener('click',e=>{
    const heading=e.target.closest('[data-note23-heading]');if(heading){e.preventDefault();e.stopImmediatePropagation();locateHeading(Number(heading.dataset.note23Heading));return;}
    const b=e.target.closest('[data-note23]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const t=currentTask();if(!t)return;const v=view(t),a=b.dataset.note23;
    if(a==='file-info'){fileInfo(b);return;}if(a==='retry-partial'){retryPartial(t);return;}
    if(a==='find-next'||a==='find-prev'){refreshFind(true,a==='find-next'?1:-1);return;}
    if(a==='outline'){v.outline=!v.outline;render();$('.note23-tools [data-note23="outline"]')?.focus({preventScroll:true});}
    if(a==='find'){v.find=!v.find;render();if(v.find)$('#note23-query')?.focus();else $('.note23-tools [data-note23="find"]')?.focus({preventScroll:true});}
    if(a==='scene'){closeOverlay();state.pane='notes';render();setKnowledgeScenario(b.dataset.value);}
  },true);
  document.addEventListener('input',e=>{if(e.target.id==='note23-query'){view(currentTask()).query=e.target.value;findIndex=-1;refreshFind(true);}});
  window.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229)return;
    if(state.pane!=='notes'||!$('.knowledge-pane')||$('#overlay').firstElementChild)return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'){e.preventDefault();e.stopImmediatePropagation();view(currentTask()).find=true;render();$('#note23-query')?.focus();$('#note23-query')?.select();}
    if(e.target.id==='note23-query'&&['Enter','Escape'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Enter')refreshFind(true,e.shiftKey?-1:1);else{view(currentTask()).find=false;render();$('.note23-tools [data-note23="find"]')?.focus();}}
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    document.title='Loop · 第二十三阶段 · 知识笔记';$('.review-bar b').textContent='第二十三阶段 · 知识笔记';
    $('#knowledge-case').insertAdjacentHTML('beforeend','<option value="partial-save">文件保存／关联失败</option>');
    globalThis.loopWidgetReview=function(){knowledgeDialog('知识笔记 · 第23阶段','<p class="knowledge-dialog-copy">文件名打开信息，文档工具提供篇内查找与大纲；页脚明确区分本页草稿与文件保存。切换视图或任务后，未被替换的编辑内容与撤销历史继续保留。</p><div class="note23-review-actions">'+[['normal','正常'],['draft','未关联草稿'],['external','外部变更'],['save-failed','保存失败'],['partial-save','关联失败'],['missing','文件丢失'],['readonly','不可写'],['recovery','草稿恢复']].map(([v,l])=>`<button class="button" data-note23="scene" data-value="${v}">${l}</button>`).join('')+'</div><p class="knowledge-demo-boundary">所有文件与恢复操作仅在本页模拟；刷新恢复示例。真实项目的附件暂存、原子写入与恢复草稿机制需要继续保留。</p>','<button class="button primary" data-action="close-dialog">继续编辑</button>',580);};
  },{once:true});
  render();
})();
