// HTML review prototype. File bindings and recovery are page-memory scenarios.
const knowledgeSessions=new Map();
const knowledgeDiagramData="data:image/svg+xml;charset=utf-8,"+encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"170\" viewBox=\"0 0 720 170\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">示例中断路径：设备配置、驱动注册、内核映射</title><rect width=\"720\" height=\"170\" rx=\"8\" fill=\"#f6f7f9\"/><g fill=\"#fff\" stroke=\"#d8dfdc\"><rect x=\"28\" y=\"48\" width=\"180\" height=\"70\" rx=\"6\"/><rect x=\"270\" y=\"48\" width=\"180\" height=\"70\" rx=\"6\"/><rect x=\"512\" y=\"48\" width=\"180\" height=\"70\" rx=\"6\"/></g><g fill=\"#20242b\" font-family=\"system-ui,sans-serif\" font-size=\"17\" text-anchor=\"middle\"><text x=\"118\" y=\"77\">设备配置</text><text x=\"360\" y=\"77\">驱动注册</text><text x=\"602\" y=\"77\">内核映射</text></g><g fill=\"#626b78\" font-family=\"system-ui,sans-serif\" font-size=\"12\" text-anchor=\"middle\"><text x=\"118\" y=\"101\">MSI capability</text><text x=\"360\" y=\"101\">向量分配与中断注册</text><text x=\"602\" y=\"101\">IRQ 与触发计数</text></g><g fill=\"none\" stroke=\"#23634b\" stroke-width=\"2\"><path d=\"M220 83h38m-8-6 8 6-8 6M462 83h38m-8-6 8 6-8 6\"/></g><text x=\"28\" y=\"148\" fill=\"#626b78\" font-family=\"system-ui,sans-serif\" font-size=\"11\">示例知识笔记 · 逐层记录验证依据</text></svg>\n");
let knowledgeEditor=null,knowledgeMount=0;
const knowledgeFiles=new Map();
state.knowledgeMode='edit';state.noteSummaryOpen=false;state.knowledgeWidth='default';
const sampleKnowledgeFiles=[
 {name:'PCIe 中断路径.md',path:'/示例/知识库/PCIe 中断路径.md',content:'# PCIe 中断路径\n\n## 排查顺序\n\n从设备配置、驱动注册到内核映射，逐层记录验证依据。\n\n## 文件中的补充\n\n已补充测试设备与内核版本。'},
 {name:'中断处理机制.md',path:'/示例/知识库/中断处理机制.md',content:'# 中断处理机制\n\n## 阅读记录\n\n硬中断入口与驱动处理职责。\n\n- 阅读入口代码\n- 对照驱动验证理解'},
 {name:'架构阅读.md',path:'/示例/知识库/架构阅读.md',content:'# 架构阅读\n\n记录特权级、异常与中断的关联。'}
];
sampleKnowledgeFiles.forEach(f=>knowledgeFiles.set(f.path,f.content));
const knowledgeLabels={DRAFT:'草稿',SAVED:'已保存',DIRTY:'已修改',EXTERNAL_CHANGED:'文件有外部修改',FILE_MISSING:'文件已丢失',READ_ONLY:'文件不可写'};
const exampleKnowledge='# PCIe 中断路径\n\n沿设备、驱动到内核，留下可复用的排查方法与证据。\n\n## 排查顺序\n\n| 环节 | 验证依据 | 当前判断 |\n| --- | --- | --- |\n| 设备配置 | MSI capability | 核对使能与向量数 |\n| 驱动注册 | 初始化日志 | 确认分配与注册成功 |\n| 内核映射 | 中断计数 | 对比触发与处理次数 |\n\n## 采集命令\n\n```bash\nlspci -vv\ncat /proc/interrupts\n```\n\n## 验证记录\n\n- [x] 记录设备信息与内核版本\n- [ ] 对比正常与异常日志\n\n> 每一项判断都对应处理流中的验证节点，结论在验证完成后补充。';
tasks.filter(t=>!isQuick(t)).forEach(t=>{t.notes=t.id===1?exampleKnowledge:'# '+t.notes+'\n\n'+t.description+'\n\n## 进展\n\n'+t.progress;knowledgeSessions.set(t.id,{state:t.id===1?'SAVED':'DRAFT',path:t.id===1?sampleKnowledgeFiles[0].path:'',saved:t.id===1?t.notes:'',file:t.id===1?t.notes:'',dirty:false,recovery:'',issue:'',busy:false,recovered:false,external:'',failNext:false})});
knowledgeFiles.set(sampleKnowledgeFiles[0].path,exampleKnowledge);
function normalizeKnowledgeMarkdown(value){return value.replace(/!\[1\.00\]\(assets\/loop-knowledge-path\.svg\)/g,'![示例：中断路径示意](assets/loop-knowledge-path.svg)')}
function knowledgeFor(t){if(!knowledgeSessions.has(t.id))knowledgeSessions.set(t.id,{state:'DRAFT',path:'',saved:'',file:'',dirty:false,recovery:'',issue:'',busy:false,recovered:false,external:'',failNext:false});return knowledgeSessions.get(t.id)}
function captureKnowledgeDraft(){
 const entry=knowledgeEditor;
 if(entry){try{const value=normalizeKnowledgeMarkdown(entry.instance.getMarkdown());if(entry.task.notes===entry.synced){updateKnowledgeDraft(entry.task,value);entry.synced=value}}catch{}}
 const input=$('#knowledge-source');if(input){const t=tasks.find(t=>t.id===Number(input.dataset.taskId));if(t&&t.notes===input.knowledgeSynced){updateKnowledgeDraft(t,input.value);input.knowledgeSynced=input.value}}
 const pane=$('.knowledge-pane'),paneTask=pane&&tasks.find(t=>t.id===Number(pane.dataset.taskId));if(paneTask)knowledgeFor(paneTask).scroll=$('.knowledge-body')?.scrollTop||0;
}
function captureKnowledgeEditor(){
 captureKnowledgeDraft();const entry=knowledgeEditor;knowledgeEditor=null;knowledgeMount++;
 if(entry)entry.instance.destroy()?.catch?.(()=>{});
}
function updateKnowledgeDraft(t,value){
 if(value===t.notes)return;t.notes=value;const k=knowledgeFor(t);k.dirty=value!==k.saved;k.recovery=value;touchTask(t);
 if(!['EXTERNAL_CHANGED','FILE_MISSING','READ_ONLY'].includes(k.state))k.state=k.path?(k.dirty?'DIRTY':'SAVED'):'DRAFT';
 updateKnowledgeMeta(t);
}
function updateKnowledgeMeta(t){
 const k=knowledgeFor(t);if($('.knowledge-pane')?.dataset.taskId!==String(t.id))return;
 const label=$('[data-note-state]');if(label){label.textContent=k.busy?'保存中…':knowledgeLabels[k.state];label.classList.toggle('attention',['EXTERNAL_CHANGED','FILE_MISSING','READ_ONLY'].includes(k.state)||!!k.issue)}
 const stats=$('[data-note-stats]');if(stats)stats.textContent=t.notes.length+' 字 · '+t.notes.split('\n').length+' 行';
 const save=$('[data-note-save]');if(save){save.disabled=k.busy||k.state==='SAVED'&&!k.dirty&&!k.issue;save.innerHTML=icon('check')+(k.busy?'保存中…':'保存')}
 const recovery=$('[data-note-recovery]');if(recovery)recovery.textContent=k.recovery?'本页草稿已保留':'文件状态仅为预览';
}
Object.assign(paths,{
 knowledgeTable:'M3 3h18v18H3zM3 9h18M9 3v18',
 knowledgeCode:'m8 7-5 5 5 5m8-10 5 5-5 5m-2-14-4 18',
 knowledgeImage:'M3 3h18v18H3zM3 16l5-5 4 4 4-6 5 7M7 7h.01',
 knowledgeDiagram:'M3 9h5v6H3zM16 9h5v6h-5zM8 12h8m-3-3 3 3-3 3',
 noteBold:'M6 4h7a4 4 0 0 1 0 8H6zm0 8h8a4 4 0 0 1 0 8H6z',
 noteItalic:'M10 4h8M6 20h8M14 4l-4 16',
 noteStrike:'M17 6c-1-2-8-3-10 1-2 4 3 5 5 5m5 3c2 5-7 8-10 3M3 12h18',
 noteInline:'m8 7-5 5 5 5m8-10 5 5-5 5',
 noteBullet:'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
 noteOrdered:'M10 6h11M10 12h11M10 18h11M3 4h2v5M3 11h3l-3 5h3M3 18h3v3H3',
 noteTask:'M3 4h6v6H3zM13 7h8M3 14h6v6H3zM13 17h8m-9-1 2 2 4-4',
 noteQuote:'M4 5h6v7H4zm10 0h6v7h-6zM10 12c0 4-2 6-5 7m15-7c0 4-2 6-5 7',
 noteLink:'m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
 noteRule:'M3 12h18',noteUndo:'m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7',noteRedo:'m16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7',
 noteWidth:'M3 4h18v16H3zM8 8v8M16 8v8M10 12h4'
});
const noteWidthNames={default:'默认',wide:'较宽',full:'全宽'};
function renderNoteWidthButton(){return icon('noteWidth')+'<span>'+noteWidthNames[state.knowledgeWidth]+'</span>'+icon('chevron')}
function renderKnowledgeViewbar(mode){
 const modes=[['edit','编辑'],['source','Markdown'],['preview','预览']].map(([value,label])=>'<button data-knowledge-mode="'+value+'" aria-pressed="'+(value===mode)+'" class="'+(value===mode?'active':'')+'">'+label+'</button>').join('');
 return '<div class="knowledge-viewbar"><button class="note-width-button" data-knowledge-action="width-menu" aria-label="笔记页宽：'+noteWidthNames[state.knowledgeWidth]+'" title="调整笔记页宽" aria-haspopup="menu">'+renderNoteWidthButton()+'</button><div class="knowledge-modes" role="group" aria-label="笔记视图">'+modes+'</div></div>';
}
function renderKnowledgeTools(mode){
 const format=(action,image,label)=>'<button class="knowledge-tool" data-note-format="'+action+'" title="'+label+'" aria-label="'+label+'"'+(['bold','italic','strike','inline'].includes(action)?' aria-pressed="false"':'')+'>'+icon(image)+'</button>';
 const group=(name,html)=>'<div class="note-tool-group" role="group" aria-label="'+name+'">'+html+'</div>';
 const heading='<select class="note-heading-select" aria-label="段落格式"><option value="0">正文</option><option value="1">标题 1</option><option value="2">标题 2</option><option value="3">标题 3</option></select>';
 const tools=group('文字格式',heading+format('bold','noteBold','粗体')+format('italic','noteItalic','斜体')+format('strike','noteStrike','删除线')+format('inline','noteInline','行内代码'))+group('段落与列表',format('bullet','noteBullet','无序列表')+format('ordered','noteOrdered','有序列表')+format('task','noteTask','任务列表')+format('quote','noteQuote','引用'))+group('插入内容',format('code','knowledgeCode','代码块')+format('table','knowledgeTable','表格')+format('link','noteLink','链接')+'<button class="knowledge-tool" data-knowledge-action="insert-image" title="图片" aria-label="图片">'+icon('knowledgeImage')+'</button>'+format('rule','noteRule','分隔线'))+(mode==='edit'?group('编辑历史',format('undo','noteUndo','撤销')+format('redo','noteRedo','重做')):'');
 return (mode!=='preview'?'<div class="knowledge-tools"><div class="knowledge-insert-toolbar" role="toolbar" aria-label="笔记格式工具">'+tools+'</div></div>':'');
}
function showNoteWidthMenu(trigger){
 const descriptions={default:'适合阅读与日常记录',wide:'适合代码与多列表格',full:'使用工作台的可用空间'};
 mountSurface('<div class="surface-popover note-width-menu" role="menu" aria-label="选择笔记页宽">'+surfaceHeader('笔记页宽')+Object.entries(noteWidthNames).map(([value,label])=>'<button class="note-width-option" role="menuitemradio" aria-checked="'+(value===state.knowledgeWidth)+'" data-note-width="'+value+'"><span class="note-width-sample sample-'+value+'" aria-hidden="true"><i></i><i></i><i></i></span><span class="note-width-copy"><strong>'+label+'</strong><small>'+descriptions[value]+'</small></span><span class="note-width-check">'+(value===state.knowledgeWidth?icon('check'):'')+'</span></button>').join('')+'</div>',trigger,244);
 const menu=$('.note-width-menu');menu.dataset.returnFocus='[data-knowledge-action="width-menu"]';menu.querySelector('[aria-checked="true"]').focus();
 menu.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();const items=[...menu.querySelectorAll('[data-note-width]')],index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:items.length-1))%items.length].focus()},true);
}
function applyNoteWidth(value){
 state.knowledgeWidth=value;const page=$('.knowledge-page');if(page){page.classList.remove('width-default','width-wide','width-full');page.classList.add('width-'+value)}
 const trigger=$('[data-knowledge-action="width-menu"]');if(trigger){trigger.innerHTML=renderNoteWidthButton();trigger.setAttribute('aria-label','笔记页宽：'+noteWidthNames[value])}closeOverlay();
}
function updateKnowledgeToolbar(){
 if(!knowledgeEditor)return;const active=knowledgeEditor.instance.getFormatState();
 document.querySelectorAll('[data-note-format]').forEach(b=>{const a=b.dataset.noteFormat;if(b.hasAttribute('aria-pressed'))b.setAttribute('aria-pressed',String(!!active[a]));if(a==='undo'||a==='redo')b.disabled=!active[a]});
 const select=$('.note-heading-select');if(select)select.value=active.heading;
}
function renderKnowledge(t){
 const k=knowledgeFor(t),mode=state.knowledgeMode;
 return '<section class="knowledge-pane" data-task-id="'+t.id+'" aria-label="知识笔记"><header class="knowledge-header"><div class="knowledge-file-meta"><span data-note-state class="knowledge-state '+(['EXTERNAL_CHANGED','FILE_MISSING','READ_ONLY'].includes(k.state)||k.issue?'attention':'')+'">'+(k.busy?'保存中…':knowledgeLabels[k.state])+'</span><span class="knowledge-file-name" title="'+esc(k.path||'尚未关联本地文件')+'">'+esc(k.path?k.path.split('/').at(-1):'尚未关联文件')+'</span>'+(k.path?'<span class="example-file">示例文件</span>':'')+'</div><div class="knowledge-header-actions">'+renderKnowledgeViewbar(mode)+'<button class="icon-button" data-knowledge-action="file-menu" aria-label="笔记文件操作" aria-haspopup="menu">'+icon('more')+'</button></div></header>'+renderKnowledgeNotice(t)+renderKnowledgeTools(mode)+'<div class="knowledge-body" data-knowledge-scroll><div class="knowledge-page width-'+state.knowledgeWidth+' '+(mode==='source'?'source-page':'')+'">'+(mode==='edit'?'<div id="knowledge-rich-host" class="knowledge-rich-host" aria-label="笔记编辑器"><p class="knowledge-loading">正在打开笔记…</p></div>':mode==='source'?'<textarea id="knowledge-source" data-task-id="'+t.id+'" aria-label="Markdown 内容" spellcheck="false">'+esc(t.notes)+'</textarea>':'<article class="knowledge-preview" aria-label="笔记预览">'+renderMarkdown(t.notes)+'</article>')+'</div></div><footer class="knowledge-footer"><div class="knowledge-footer-meta"><span data-note-stats>'+t.notes.length+' 字 · '+t.notes.split('\n').length+' 行</span><span data-note-recovery>'+(k.recovery?'本页草稿已保留':'文件状态仅为预览')+'</span></div><button class="button primary" data-note-save data-knowledge-action="save" '+(k.busy||k.state==='SAVED'&&!k.dirty&&!k.issue?'disabled':'')+'>'+icon('check')+'保存</button></footer></section>';
}
function renderKnowledgeNotice(t){
 const k=knowledgeFor(t),button=(a,label)=>'<button class="text-button" data-knowledge-action="'+a+'">'+label+'</button>';
 let text='',actions='',tone='attention';
 if(k.state==='EXTERNAL_CHANGED'){text='文件已在其他应用中修改，当前内容与草稿仍保留。';actions=button('resolve-conflict','处理冲突')+button('save-as','另存为')}
 else if(k.state==='FILE_MISSING'){text='找不到关联文件，当前笔记内容仍保留。';actions=button('relocate','重新定位')+button('save-as','另存为')}
 else if(k.state==='READ_ONLY'){text='当前文件不可写，可重试或另存为。';actions=button('retry','重试')+button('save-as','另存为')}
 else if(k.issue){text=k.issue;actions=button('retry','重试')+button('save-as','另存为')}
 else if(k.recovered){tone='recovered';text='已恢复上次未保存的草稿，尚未写入文件。';actions=button('recovery-detail','查看恢复内容')+button('dismiss-recovery','知道了')}
 return text?'<div class="knowledge-notice '+tone+'" role="status"><span>'+icon(tone==='attention'?'blocked':'history')+text+'</span><div>'+actions+'</div></div>':'';
}
async function mountKnowledgeEditor(){
 const source=$('#knowledge-source');if(source)source.knowledgeSynced=tasks.find(t=>t.id===Number(source.dataset.taskId)).notes;
 const lab=$('#knowledge-case-wrap');if(lab)lab.hidden=state.pane!=='notes'||isQuick(currentTask()||{})||!['today','tasks'].includes(state.route);
 const host=$('#knowledge-rich-host'),t=currentTask();if(!t)return;const meta=knowledgeFor(t);const scenario=$('#knowledge-case');scenario.disabled=meta.busy;scenario.value=meta.recovered?'recovery':meta.issue?(meta.issueKind==='read'?'unavailable':'save-failed'):({EXTERNAL_CHANGED:'external',FILE_MISSING:'missing',READ_ONLY:'readonly',DRAFT:'draft'}[meta.state]||'normal');const scroll=$('.knowledge-body');if(scroll)scroll.scrollTop=knowledgeFor(t).scroll||0;if(!host)return;const token=++knowledgeMount,before=t.notes,k=knowledgeFor(t);
 if(!window.MilkdownTaskEditor){host.innerHTML='<p>编辑器未加载。</p><button class="button" data-knowledge-mode="source">使用 Markdown 编辑</button>';return}
 try{
  let initialized=false;
  const instance=await window.MilkdownTaskEditor.create({root:host,markdown:t.notes,placeholder:'记录可复用的知识、判断与验证依据…',enableTableResizing:true,tableColumnWidths:k.tableWidths||[],onTableColumnWidthsChange:w=>{k.tableWidths=w},onSelectionChange:()=>{if(initialized&&host.isConnected)updateKnowledgeToolbar()},onChange:value=>{value=normalizeKnowledgeMarkdown(value);if(initialized&&host.isConnected){updateKnowledgeDraft(t,value);if(knowledgeEditor?.host===host)knowledgeEditor.synced=value}}});
  if(token!==knowledgeMount||!host.isConnected){await instance.destroy();return}
  const canonical=normalizeKnowledgeMarkdown(instance.getMarkdown());t.notes=canonical;if(k.saved===before)k.saved=canonical;if(k.file===before)k.file=canonical;
  knowledgeEditor={task:t,host,instance,synced:canonical};initialized=true;host.querySelector('.ProseMirror')?.setAttribute('aria-label','知识笔记正文');host.querySelector('.ProseMirror')?.setAttribute('role','textbox');host.querySelector('.ProseMirror')?.setAttribute('aria-multiline','true');updateKnowledgeMeta(t);updateKnowledgeToolbar();if(scroll)scroll.scrollTop=k.scroll||0;
 }catch{if(host.isConnected)host.innerHTML='<p>编辑器暂时不可用，内容已保留。</p><button class="button" data-knowledge-mode="source">使用 Markdown 编辑</button>'}
}
function knowledgeDialog(title,body,footer='',width=520){
 $('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="[data-knowledge-action=\'file-menu\']"><section class="dialog knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title" style="width:min('+width+'px,calc(100vw - 48px))"><div class="dialog-head"><h2 id="knowledge-dialog-title">'+title+'</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭">'+icon('close')+'</button></div>'+body+(footer?'<footer>'+footer+'</footer>':'')+'</section></div>';$('#knowledge-dialog-title').setAttribute('tabindex','-1');$('#knowledge-dialog-title').focus();
}
function confirmKnowledge(title,message,confirm,callback){
 knowledgeDialog(title,'<p class="knowledge-dialog-copy">'+message+'</p>','<button class="button" data-action="close-dialog" autofocus>取消</button><button class="button primary" id="knowledge-confirm">'+confirm+'</button>');$('#overlay [autofocus]').focus();$('#knowledge-confirm').addEventListener('click',()=>{closeOverlay();callback()});
}
function showKnowledgeFileMenu(trigger){
 const t=currentTask(),k=knowledgeFor(t);captureKnowledgeDraft();
 mountSurface('<div class="surface-popover" role="menu" aria-label="笔记文件操作">'+surfaceHeader('笔记文件')+'<button class="button" role="menuitem" data-knowledge-action="open-file">打开 Markdown 文件…</button><button class="button" role="menuitem" data-knowledge-action="save-as">另存为…</button>'+(k.path?'<button class="button" role="menuitem" data-knowledge-action="file-info">文件信息</button><button class="button" role="menuitem" data-knowledge-action="remove-binding">解除文件关联…</button>':'')+'<div class="menu-divider"></div><button class="button" role="menuitem" data-knowledge-action="export-note">导出笔记…</button><button class="button" role="menuitem" data-knowledge-action="export-task">分享／导出任务…</button><div class="menu-divider"></div><button class="button" role="menuitem" data-knowledge-action="close-note">关闭笔记</button></div>',trigger,232);

}
function showKnowledgeFilePicker(mode,afterSave=null){
 const t=currentTask(),k=knowledgeFor(t),saving=mode==='save-as';captureKnowledgeDraft();
 const label=saving?'另存为':mode==='relocate'?'重新定位笔记':'打开 Markdown 文件';
 const body='<p class="knowledge-dialog-copy">'+(saving?'保存当前笔记，并关联到所选文件。':'选择一个示例 Markdown 文件；载入后将关联到当前任务。')+'</p><div class="file-location">'+icon('folder')+'示例 / 知识库</div>'+(saving?'<label for="knowledge-filename">文件名</label><input id="knowledge-filename" value="'+esc(k.path?k.path.split('/').at(-1):t.title+'.md')+'" maxlength="160">':'<div class="knowledge-file-list">'+sampleKnowledgeFiles.map((f,i)=>'<label><input type="radio" name="knowledge-file" value="'+i+'" '+(i===0?'checked':'')+'><span>'+icon('note')+esc(f.name)+'</span></label>').join('')+'</div>')+'<p id="knowledge-file-error" class="knowledge-inline-error" role="alert"></p><p class="knowledge-demo-boundary">示例文件选择，仅预览关联与保存流程。</p>';
 knowledgeDialog(label,body,'<button class="button" data-action="close-dialog">取消</button><button class="button primary" id="knowledge-file-apply">'+(saving?'保存':'关联并打开')+'</button>');
 $('#knowledge-file-apply').addEventListener('click',()=>{
  const file=saving?null:sampleKnowledgeFiles[Number($('#overlay input[name="knowledge-file"]:checked')?.value||0)];let name=saving?$('#knowledge-filename').value.trim():file.name;
  if(!name||/[\\/:*?"<>|]/.test(name)){$('#knowledge-file-error').textContent='请输入有效的 Markdown 文件名。';return}if(!name.toLowerCase().endsWith('.md'))name+='.md';const path='/示例/知识库/'+name;
  if([...knowledgeSessions].some(([id,n])=>id!==t.id&&n.path===path)){$('#knowledge-file-error').textContent='这个文件已关联到其他任务，请选择另一个文件。';return}
  const apply=()=>{closeOverlay();if(saving){k.pendingPath=path;saveKnowledge(t,{saveAs:true,afterSave})}else{t.notes=knowledgeFiles.get(path)||file.content;Object.assign(k,{path,saved:t.notes,file:t.notes,state:'SAVED',dirty:false,recovery:'',issue:'',recovered:false,external:''});touchTask(t);render();toast('示例文件已关联')}};
  if(!saving&&k.dirty)confirmKnowledge('载入文件版本？','当前未保存的内容将被替换。可取消并先另存为。','载入文件',apply);
  else if(saving&&path===k.path&&k.state==='EXTERNAL_CHANGED')confirmKnowledge('覆盖同一个示例文件？','文件已被外部修改。使用不同文件名可以保留两个版本。','覆盖示例文件',apply);
  else if(saving&&path!==k.path&&knowledgeFiles.has(path))confirmKnowledge('替换已有示例文件？','这个名称的示例文件已存在。可取消后使用新名称。','替换示例文件',apply);
  else apply();
 });
 if(saving)$('#knowledge-filename').select();
}
function saveKnowledge(t=currentTask(),{saveAs=false,overwrite=false,afterSave=null}={}){
 captureKnowledgeDraft();const k=knowledgeFor(t);if(k.busy)return;
 if(!saveAs&&!k.path){showKnowledgeFilePicker('save-as',afterSave);return}
 if(!saveAs&&k.state==='EXTERNAL_CHANGED'&&!overwrite){showKnowledgeConflict();return}
 if(!saveAs&&k.state==='FILE_MISSING'){toast('请重新定位文件或另存为');return}
 if(!saveAs&&k.state==='READ_ONLY'){k.issue='当前文件不可写，草稿仍保留。';render();return}
 const content=t.notes;k.busy=true;render();
 setTimeout(()=>{
  k.busy=false;if(k.failNext){k.failNext=false;k.issue='保存未完成，当前内容与本页草稿仍保留。';k.recovery=t.notes;render();return}
  if(k.pendingPath){k.path=k.pendingPath;delete k.pendingPath}knowledgeFiles.set(k.path,content);k.saved=content;k.file=content;k.dirty=t.notes!==content;k.state=k.dirty?'DIRTY':'SAVED';k.recovery=k.dirty?t.notes:'';k.issue='';k.recovered=false;k.external='';touchTask(t);t.history.unshift(['刚刚','保存知识笔记（示例文件）']);if(afterSave)afterSave();render();toast('示例保存完成')
 },400);
}
function knowledgeDifference(value,other){const lines=value.split('\n'),against=other.split('\n');let index=0;while(index<lines.length&&lines[index]===against[index])index++;return lines.slice(Math.max(0,index-2),index+10).join('\n')||'（此处没有新增内容）'}
function showKnowledgeConflict(){
 const t=currentTask(),k=knowledgeFor(t);captureKnowledgeDraft();
 knowledgeDialog('文件与当前笔记有不同修改','<p class="knowledge-dialog-copy">当前草稿仍保留。下面展示差异附近内容，选择作用于整篇笔记。</p><div class="knowledge-version-grid"><section><h3>当前编辑内容</h3><p>本页草稿</p><pre>'+esc(knowledgeDifference(t.notes,k.external||k.file))+'</pre></section><section><h3>文件中的内容</h3><p>示例 · 外部修改</p><pre>'+esc(knowledgeDifference(k.external||k.file,t.notes))+'</pre></section></div>','<button class="text-button" data-knowledge-action="overwrite">覆盖文件…</button><button class="button" data-knowledge-action="reload-file">加载文件版本…</button><button class="button primary" data-knowledge-action="save-as">另存为</button>',700);
}
function showKnowledgeRecovery(){const t=currentTask(),k=knowledgeFor(t);captureKnowledgeDraft();knowledgeDialog('已恢复的草稿','<p class="knowledge-dialog-copy">基于同一示例文件版本恢复的未保存内容。笔记仍需保存到文件。</p><article class="knowledge-preview recovery-preview">'+renderMarkdown(k.recovery||t.notes)+'</article>','<button class="button" data-action="close-dialog">继续编辑</button><button class="button primary" data-knowledge-action="save">保存</button>',640)}
function closeKnowledgeNote(){
 const t=currentTask(),k=knowledgeFor(t);captureKnowledgeDraft();
 if(!k.path&&t.notes.trim())knowledgeDialog('关闭前如何处理这篇草稿？','<p class="knowledge-dialog-copy">保留草稿后可再次打开继续；保存将关联一个示例 Markdown 文件。</p>','<button class="text-button danger-action" data-knowledge-action="discard-draft">删除草稿…</button><button class="button" data-knowledge-action="keep-draft" autofocus>保留草稿</button><button class="button primary" data-knowledge-action="save-close">保存并关闭</button>');
 else{state.pane='flow';render()}
}
function completeTaskMarkdown(t){
 const lines=['# '+t.title,'','- 分组：'+t.group,'- 优先级：'+priorityNames[t.priority],'- 状态：'+(t.done?'已完成':'处理中'),'- 节点：'+flat(t.nodes).length+' · 已完成 '+countDone(t),'- 循环：'+recurrenceLabel(t.recurrence),'- 标签：'+(Object.entries(t.tags||{}).filter(([,v])=>v).map(([v])=>labels[v]).join('、')||'无'),'- 创建：'+t.createdAt,'- 更新：'+t.updatedAt,...(t.resolvedAt?['- 解决：'+t.resolvedAt]:[]),...(t.deadlineAt?['- 截止：'+t.deadlineAt+' '+t.deadlineTime,'- 提醒：'+(t.deadlineReminderMinutes===null?'无':'提前 '+t.deadlineReminderMinutes+' 分钟')]:[]),'','## 背景',t.description||'暂无','','## 进展',t.progress||'暂无','','## 结论',t.conclusion||'暂无','','## 知识笔记',t.notes||'暂无','','## 处理流'];
 const walk=(nodes,depth)=>nodes.forEach(n=>{lines.push('  '.repeat(depth)+'- '+n.title+'（'+labels[n.status]+'）');if(n.note)lines.push(...n.note.split('\n').map(l=>'  '.repeat(depth+1)+l));walk(n.children,depth+1)});walk(t.nodes,0);return lines.join('\n');
}
function renderTaskExport(t){
 const md=completeTaskMarkdown(t),prefix=md.slice(0,md.lastIndexOf('\n## 处理流'));
 const walk=nodes=>'<ul class="export-flow">'+nodes.map(n=>'<li><div>'+esc(n.title)+' <span class="export-node-status">'+labels[n.status]+'</span></div>'+(n.note?'<div class="export-node-note">'+esc(n.note).replace(/\n/g,'<br>')+'</div>':'')+(n.children.length?walk(n.children):'')+'</li>').join('')+'</ul>';
 return renderMarkdown(prefix)+'<h2>处理流</h2>'+walk(t.nodes);
}
function showKnowledgeExport(taskDocument=false){
 captureKnowledgeDraft();const t=currentTask(),md=taskDocument?completeTaskMarkdown(t):t.notes,html=(taskDocument?renderTaskExport(t):renderMarkdown(md)).replaceAll('src="assets/loop-knowledge-path.svg"','src="'+knowledgeDiagramData+'"');
 knowledgeDialog(taskDocument?'分享／导出任务':'导出笔记','<p class="knowledge-dialog-copy">'+(taskDocument?'包括任务简报、知识笔记与全部层级处理流。':'导出当前笔记内容；不改变文件关联。')+'</p><div class="export-format-row"><label for="knowledge-export-format">格式</label><select id="knowledge-export-format"><option value="md">Markdown</option><option value="html">HTML</option><option value="pdf">PDF（桌面应用）</option></select></div><article class="knowledge-preview export-preview">'+html+'</article><p class="knowledge-demo-boundary" id="knowledge-export-hint">导出当前示例文档；HTML 内嵌示例图片，Markdown 保留图片引用。</p>','<button class="button" data-action="close-dialog">取消</button><button class="button primary" id="knowledge-export-download">导出</button>',680);
 $('#knowledge-export-format').addEventListener('change',e=>{$('#knowledge-export-download').disabled=e.target.value==='pdf';$('#knowledge-export-hint').textContent=e.target.value==='pdf'?'PDF 由正式桌面应用导出，此处仅预览文档。':'导出当前示例文档；HTML 内嵌示例图片，Markdown 保留图片引用。'});
 $('#knowledge-export-download').addEventListener('click',()=>{const format=$('#knowledge-export-format').value;if(format==='pdf')return;const value=format==='html'?'<!doctype html><meta charset="utf-8"><title>'+esc(t.title)+'</title><style>body{font:15px system-ui;max-width:800px;margin:40px auto;padding:24px;line-height:1.8}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd}pre{white-space:pre-wrap;background:#f5f5f5;padding:16px}img{max-width:100%}</style>'+html:md;const url=URL.createObjectURL(new Blob([value],{type:format==='html'?'text/html;charset=utf-8':'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=t.title.replace(/[\\/:*?"<>|]/g,'_')+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);closeOverlay();toast('示例文档已导出')});
}
function addKnowledgeBlock(kind){
 const t=currentTask();captureKnowledgeDraft();const snippets={table:'\n\n| 项目 | 验证依据 |\n| --- | --- |\n| 待补充 | 待补充 |\n',code:'\n\n```text\n在这里记录代码或命令\n```\n',image:'\n\n![示例：中断路径示意](assets/loop-knowledge-path.svg)\n'};
 updateKnowledgeDraft(t,t.notes+snippets[kind]);closeOverlay();render();$('.knowledge-body')?.scrollTo({top:100000});if(state.knowledgeMode==='source')$('#knowledge-source')?.focus();
}
function formatKnowledgeSource(action,value){
 const input=$('#knowledge-source');if(!input)return;
 let start=input.selectionStart,end=input.selectionEnd,text=input.value.slice(start,end),replacement='',selectFrom=0,selectTo=0;
 const wraps={bold:'**',italic:'*',strike:'~~',inline:'`'};
 if(wraps[action]){const token=wraps[action],body=text||'文字',around=input.value.slice(start-token.length,start)===token&&input.value.slice(end,end+token.length)===token&&(action!=='italic'||input.value[start-2]!=='*'&&input.value[end+1]!=='*');if(around){start-=token.length;end+=token.length;replacement=body;selectTo=body.length}else{replacement=token+body+token;selectFrom=token.length;selectTo=selectFrom+body.length}}
 else if(action==='link'){const body=text||value;replacement='['+body+']('+value+')';selectFrom=1;selectTo=1+body.length}
 else if(['heading','bullet','ordered','task','quote'].includes(action)){
  start=input.value.lastIndexOf('\n',Math.max(0,start-1))+1;const next=input.value.indexOf('\n',end);end=next<0?input.value.length:next;
  replacement=input.value.slice(start,end).split('\n').map((line,i)=>{const clean=line.replace(/^\s*(?:#{1,6}\s+|[-*]\s+(?:\[[ x]\]\s+)?|\d+\.\s+|>\s*)/,'');return (action==='heading'?'#'.repeat(Number(value))+(Number(value)?' ':''):action==='ordered'?(i+1)+'. ':action==='task'?'- [ ] ':action==='quote'?'> ':'- ')+clean}).join('\n');selectTo=replacement.length;
 }else{replacement='\n\n'+({code:'```text\n'+(text||'代码或命令')+'\n```',table:'| 项目 | 验证依据 |\n| --- | --- |\n| 待补充 | 待补充 |',rule:'---',image:value}[action]||'')+'\n\n';selectTo=replacement.length}
 input.setRangeText(replacement,start,end,'end');input.focus();input.setSelectionRange(start+selectFrom,start+selectTo);updateKnowledgeDraft(currentTask(),input.value);input.knowledgeSynced=input.value;
}
function formatKnowledge(action,value){
 if(state.knowledgeMode==='source'){formatKnowledgeSource(action,value);return}
 if(!knowledgeEditor)return;
 if(!knowledgeEditor.instance.format(action,value))toast('当前光标位置不能应用该格式，请选择正文段落。');
 captureKnowledgeDraft();updateKnowledgeToolbar();
}
function showKnowledgeLink(trigger){
 const selection=knowledgeEditor?.instance.getSelection(),input=$('#knowledge-source'),range=input?{start:input.selectionStart,end:input.selectionEnd}:null;
 mountSurface('<div class="surface-popover note-link-popover">'+surfaceHeader('添加链接')+'<label for="note-link-url">链接地址</label><input id="note-link-url" placeholder="https://" type="url"><p class="knowledge-inline-error" id="note-link-error" role="alert"></p><button class="button primary" id="note-link-apply">插入链接</button></div>',trigger,280);$('#note-link-url').focus();
 const apply=()=>{const url=$('#note-link-url').value.trim();if(!/^(https?:\/\/|mailto:)/i.test(url)||/[\s<>\[\]]/.test(url)){$('#note-link-error').textContent='请输入有效的 https、http 或邮箱链接。';return}closeOverlay();if(selection&&knowledgeEditor)knowledgeEditor.instance.restoreSelection(selection);if(range&&input)input.setSelectionRange(range.start,range.end);formatKnowledge('link',url)};
 $('#note-link-apply').addEventListener('click',apply);$('#note-link-url').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply()}});
}
function setKnowledgeScenario(value){
 captureKnowledgeDraft();const t=currentTask();if(!t||isQuick(t))return;const k=knowledgeFor(t);
 Object.assign(k,{issue:'',issueKind:'',busy:false,recovered:false,failNext:false,state:k.path?(k.dirty?'DIRTY':'SAVED'):'DRAFT'});
 if(value==='normal'){k.state=k.path?(k.dirty?'DIRTY':'SAVED'):'DRAFT'}
 else if(value==='draft'){k.path='';k.state='DRAFT';k.saved='';k.dirty=!!t.notes;k.recovery=t.notes}
 else{
  if(!k.path)k.path='/示例/知识库/'+t.title+'.md';
  if(!k.saved)k.saved=t.notes;if(!k.file)k.file=k.saved;
  if(value==='external'){updateKnowledgeDraft(t,t.notes+'\n\n本页补充：等待验证结果。');k.external=k.file+'\n\n外部补充：已新增设备初始化日志。';k.state='EXTERNAL_CHANGED';knowledgeFiles.set(k.path,k.external)}
  if(value==='missing')k.state='FILE_MISSING';
  if(value==='readonly')k.state='READ_ONLY';
  if(value==='unavailable'){k.issueKind='read';k.issue='暂时无法读取文件，请检查路径后重试；草稿仍保留。'}
  if(value==='save-failed'){k.failNext=true;updateKnowledgeDraft(t,t.notes+'\n\n待保存的验证记录。');saveKnowledge(t);return}
  if(value==='recovery'){const content=k.recovery||t.notes+'\n\n恢复的草稿：继续补充验证记录。';updateKnowledgeDraft(t,content);k.recovery=content;k.recovered=true;k.state='DIRTY'}
 }
 render();
}
document.addEventListener('input',e=>{if(e.target.id==='knowledge-source'){const t=tasks.find(t=>t.id===Number(e.target.dataset.taskId));updateKnowledgeDraft(t,e.target.value);e.target.knowledgeSynced=e.target.value}});
document.addEventListener('change',e=>{if(e.target.id==='knowledge-case')setKnowledgeScenario(e.target.value);if(e.target.matches('.note-heading-select'))formatKnowledge('heading',Number(e.target.value))});
document.addEventListener('mousedown',e=>{if(e.target.closest('.knowledge-tool'))e.preventDefault()});
document.addEventListener('keydown',e=>{const toolbar=e.target.closest?.('.knowledge-insert-toolbar');if(toolbar&&e.target.tagName==='BUTTON'&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...toolbar.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(e.target);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&state.pane==='notes'&&['today','tasks'].includes(state.route)&&!$('#overlay').firstElementChild){e.preventDefault();e.stopImmediatePropagation();saveKnowledge()}},true);
document.addEventListener('click',e=>{
 const width=e.target.closest('[data-note-width]');if(width){e.preventDefault();e.stopImmediatePropagation();applyNoteWidth(width.dataset.noteWidth);return}
 const format=e.target.closest('[data-note-format]');if(format){e.preventDefault();e.stopImmediatePropagation();if(format.disabled)return;if(format.dataset.noteFormat==='link')showKnowledgeLink(format);else formatKnowledge(format.dataset.noteFormat);return}
 if(e.target.closest('[data-action="toggle-note-summary"]')){e.stopImmediatePropagation();state.noteSummaryOpen=!state.noteSummaryOpen;render();return}
 const mode=e.target.closest('[data-knowledge-mode]'),button=e.target.closest('[data-knowledge-action]');
 if(mode){e.stopImmediatePropagation();closeOverlay();state.knowledgeMode=mode.dataset.knowledgeMode;render();return}
 if(!button||button.disabled)return;e.preventDefault();e.stopImmediatePropagation();const a=button.dataset.knowledgeAction,t=currentTask(),k=knowledgeFor(t);
 if(a==='save'){closeOverlay();saveKnowledge(t)}
 else if(a==='width-menu')showNoteWidthMenu(button);
 else if(a==='file-menu')showKnowledgeFileMenu(button);
 else if(a==='save-as')showKnowledgeFilePicker('save-as');
 else if(a==='open-file')showKnowledgeFilePicker('open-file');
 else if(a==='relocate')showKnowledgeFilePicker('relocate');
 else if(a==='file-info'){knowledgeDialog('关联文件','<dl class="knowledge-file-info"><dt>文件</dt><dd>'+esc(k.path)+'</dd><dt>格式</dt><dd>Markdown · '+t.notes.length+' 字</dd><dt>关联范围</dt><dd>当前任务；一个文件只关联一篇笔记</dd><dt>状态</dt><dd>'+knowledgeLabels[k.state]+'</dd></dl><p class="knowledge-demo-boundary">示例路径，不访问真实文件。</p>','<button class="button" data-action="close-dialog">完成</button>')}
 else if(a==='remove-binding')confirmKnowledge('解除文件关联？','笔记内容保留为草稿，示例 Markdown 文件和附件保留。','解除关联',()=>{Object.assign(k,{path:'',state:'DRAFT',saved:'',dirty:!!t.notes,recovery:t.notes,issue:''});render()});
 else if(a==='resolve-conflict')showKnowledgeConflict();
 else if(a==='reload-file')confirmKnowledge('加载文件版本？','当前未保存的修改将被替换。可取消并先另存为保留。','加载文件版本',()=>{t.notes=k.external||k.file;Object.assign(k,{saved:t.notes,file:t.notes,state:'SAVED',dirty:false,recovery:'',issue:'',external:''});render()});
 else if(a==='overwrite')confirmKnowledge('用当前笔记覆盖示例文件？','文件中的外部修改将被替换。也可以取消后另存为保留两个版本。','覆盖文件',()=>saveKnowledge(t,{overwrite:true}));
 else if(a==='retry'){if(k.state==='READ_ONLY'){k.issue='文件仍不可写，请使用另存为。';render()}else if(k.state==='EXTERNAL_CHANGED')showKnowledgeConflict();else if(k.issueKind==='read'){k.issue='';k.issueKind='';render();toast('示例文件读取恢复，编辑内容已保留')}else{k.issue='';saveKnowledge(t)}}
 else if(a==='recovery-detail')showKnowledgeRecovery();
 else if(a==='dismiss-recovery'){k.recovered=false;render()}
 else if(a==='close-note')closeKnowledgeNote();
 else if(a==='keep-draft'){closeOverlay();state.pane='flow';render()}
 else if(a==='save-close'){closeOverlay();saveKnowledge(t,{afterSave:()=>{state.pane='flow'}})}
 else if(a==='discard-draft')confirmKnowledge('删除这篇示例草稿？','仅清除本页未关联的草稿，已存在的示例文件保留。','删除草稿',()=>{t.notes='';Object.assign(k,{state:'DRAFT',dirty:false,recovery:'',saved:'',issue:''});state.pane='flow';render()});
 else if(a==='export-note')showKnowledgeExport(false);
 else if(a==='export-task')showKnowledgeExport(true);
 else if(a==='insert-table')addKnowledgeBlock('table');else if(a==='insert-code')addKnowledgeBlock('code');else if(a==='insert-example-image')addKnowledgeBlock('image');
 else if(a==='insert-image'){$('#knowledge-image-picker').value='';$('#knowledge-image-picker').click()}
},true);
const knowledgeImageInput=document.createElement('input');knowledgeImageInput.type='file';knowledgeImageInput.accept='image/png,image/jpeg,image/webp';knowledgeImageInput.id='knowledge-image-picker';knowledgeImageInput.hidden=true;document.body.appendChild(knowledgeImageInput);
knowledgeImageInput.addEventListener('change',async()=>{const file=knowledgeImageInput.files[0],t=currentTask();if(!file||!t)return;if(file.size>8*1024*1024){toast('请选择 8 MB 以内的图片');return}const reader=new FileReader();reader.addEventListener('load',()=>{if(knowledgeEditor?.task===t){knowledgeEditor.instance.insertImage({src:String(reader.result),alt:file.name});closeOverlay()}else{captureKnowledgeDraft();updateKnowledgeDraft(t,t.notes+'\n\n!['+file.name.replace(/[\[\]]/g,'')+']('+reader.result+')\n');closeOverlay();render()}});reader.readAsDataURL(file)});
$('.review-controls').insertAdjacentHTML('afterbegin','<span id="knowledge-case-wrap"><label for="knowledge-case">笔记状态</label> <select id="knowledge-case" aria-label="预览笔记状态"><option value="normal">正常</option><option value="draft">未保存草稿</option><option value="external">外部修改</option><option value="missing">文件丢失</option><option value="readonly">文件不可写</option><option value="unavailable">读取失败</option><option value="save-failed">保存失败</option><option value="recovery">草稿恢复</option></select></span>');
$('#reviewInfo').addEventListener('click',e=>{e.stopImmediatePropagation();knowledgeDialog('第八阶段评审','<ol class="knowledge-review-list"><li>知识笔记可编辑、切换 Markdown 和预览；表格、代码和图片沿用项目编辑器。</li><li>保存位于右上方，文件关联、另存为、关闭和导出集中在文件菜单。</li><li>底部「笔记状态」切换外部修改、文件丢失、不可写、读取／保存失败和草稿恢复。</li><li>冲突保留当前草稿，另存为保留两份；加载或覆盖都需要明确选择。</li><li>任务菜单与笔记菜单均可分享／导出，包含完整层级处理流。</li></ol><p class="knowledge-demo-boundary">HTML 示例。文件保存、绑定和恢复只在本页模拟；刷新恢复示例。Markdown／HTML 导出可以下载。PDF 由正式桌面应用完成。</p>','<button class="button primary" data-action="close-dialog">开始评审</button>',580)},true);
const escAttr=esc;
// Markdown preview sanitizer shared with the current application.
function renderMarkdown(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let inCode = false;
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType) return;
    html.push(
      `<${listType}>${listItems
        .map((item) => `<li>${typeof item === "object" ? item.html : renderInlineMarkdown(item)}</li>`)
        .join("")}</${listType}>`,
    );
    listType = "";
    listItems = [];
  }

  function flushCode() {
    html.push(`<pre><code>${esc(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.includes("|") && lines[index + 1] && isMarkdownTableDivider(lines[index + 1])) {
      flushParagraph();
      flushList();
      const headers = splitMarkdownTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(splitMarkdownTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      html.push(renderMarkdownTable(headers, rows));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push("<hr />");
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const taskItem = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskItem) {
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push({
        html: `<span class="md-task"><input type="checkbox" disabled ${taskItem[1].toLowerCase() === "x" ? "checked" : ""} /><span>${renderInlineMarkdown(taskItem[2])}</span></span>`,
      });
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ordered || unordered) {
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((ordered || unordered)[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();

  return html.length ? html.join("") : `<p class="markdown-empty">还没有注释。</p>`;
}

/**
 * Render inline Markdown formatting (bold, italic, code, links, images, strikethrough).
 * @param {string} value - Inline text with Markdown syntax
 * @returns {string} HTML string
 */
function renderInlineMarkdown(value) {
  const codeSpans = [];
  const richTokens = [];
  let output = esc(value).replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE_SPAN_${codeSpans.length}@@`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });

  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safeUrl = resolveMarkdownImageUrl(url);
    if (!safeUrl) return esc(`![${alt}](${url})`);
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<img src="${safeUrl}" alt="${escAttr(alt)}" loading="lazy" />`);
    return token;
  });

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return esc(`[${label}](${url})`);
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<a href="${safeUrl}" target="_blank" rel="noreferrer">${label}</a>`);
    return token;
  });

  output = output.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, (_, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return `&lt;${url}&gt;`;
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`);
    return token;
  });

  output = output.replace(/(^|[\s(])((https?:\/\/|mailto:)[^\s<)]+)/g, (match, prefix, url) => {
    const safeUrl = safeMarkdownUrl(url);
    if (!safeUrl) return match;
    const token = `@@RICH_${richTokens.length}@@`;
    richTokens.push(`<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`);
    return `${prefix}${token}`;
  });

  output = output
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  codeSpans.forEach((code, index) => {
    output = output.replace(`@@CODE_SPAN_${index}@@`, code);
  });
  richTokens.forEach((html, index) => {
    output = output.replace(`@@RICH_${index}@@`, html);
  });

  return output;
}

const ALLOWED_MARKDOWN_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Read the URL scheme the way a browser does. ASCII control characters and
 * spaces inside a scheme are ignored during URL parsing, so "java\tscript:"
 * still executes and a blacklist cannot catch it.
 */
function markdownLinkScheme(value) {
  const normalized = String(value || "").replace(/[\u0000-\u0020\u007f]+/g, "");
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(normalized);
  return match ? `${match[1].toLowerCase()}:` : "";
}

function safeMarkdownUrl(value) {
  const cleaned = cleanMarkdownUrl(value);
  if (!cleaned) return "";
  const scheme = markdownLinkScheme(cleaned);
  if (scheme) {
    if (scheme === "data:") {
      return /^data:image\//i.test(cleaned.replace(/[\u0000-\u0020\u007f]+/g, "")) ? escAttr(cleaned) : "";
    }
    if (!ALLOWED_MARKDOWN_LINK_SCHEMES.has(scheme)) return "";
  } else if (cleaned.startsWith("//")) {
    // A protocol-relative link inherits the file:// page scheme.
    return "";
  }
  return escAttr(cleaned);
}

function resolveMarkdownImageUrl(value) {
  const cleaned = cleanMarkdownUrl(value);
  if (cleaned.startsWith("task-image:")) {
    const imageId = cleaned.slice("task-image:".length);
    const dataUrl = state.attachments?.images?.[imageId];
    return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? escAttr(dataUrl) : "";
  }
  if (cleaned.startsWith("./attachments/") || cleaned.startsWith("attachments/")) {
    const relativePath = cleaned.startsWith("./") ? cleaned : `./${cleaned}`;
    const dataUrl = state.knowledgeAssets?.[relativePath];
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) return escAttr(dataUrl);
  }
  return safeMarkdownUrl(cleaned);
}

function cleanMarkdownUrl(value) {
  let cleaned = String(value || "").trim();
  const angled = cleaned.match(/^&lt;(.+)&gt;$/);
  if (angled) cleaned = angled[1];
  const titled = cleaned.search(/\s+(&quot;|&#039;|")/);
  if (titled > -1) cleaned = cleaned.slice(0, titled);
  return cleaned
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function isMarkdownTableDivider(line) {
  const trimmed = line.trim();
  return trimmed.includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

function splitMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdownTable(headers, rows) {
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${renderInlineMarkdown(header)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${headers.map((_, index) => `<td>${renderInlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}


// ============================================================

state.pane='notes';render();
