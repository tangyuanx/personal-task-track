(() => {
  'use strict';
  const oldSettings = renderSettings;
  const choices = {
    fontScale:[['1','紧凑'],['1.08','标准（推荐）'],['1.16','较大'],['1.24','特大']],
    zhFont:[['system','系统中文'],['noto','Noto Sans CJK SC（内置）'],['yahei','微软雅黑'],['pingfang','苹方'],['songti','宋体'],['simsun','中易宋体'],['fangsong','仿宋'],['heiti','黑体'],['kaiti','楷体']],
    enFont:[['inter','Inter（内置）'],['system','System UI'],['segoe','Segoe UI'],['arial','Arial'],['helvetica','Helvetica'],['verdana','Verdana'],['trebuchet','Trebuchet MS'],['tahoma','Tahoma'],['times','Times New Roman'],['georgia','Georgia'],['courier','Courier New'],['mono','Monospace']],
    defaultFilter:[['active','未完成'],['all','全部'],['done','已完成']],
    defaultPriority:Object.entries(priorityNames),newPriority:[['high','高优先'],['medium','中优先'],['low','低优先']],
    density:[['39','紧凑'],['47','舒展']]
  };
  const labels={fontScale:'字号',zhFont:'中文字体',enFont:'英文字体',defaultFilter:'默认任务范围',defaultPriority:'默认优先级筛选',newPriority:'新任务优先级',density:'处理流行间距'};
  const zhFamilies={system:'System',noto:'Noto',yahei:'YaHei',pingfang:'PingFang',songti:'Songti',simsun:'SimSun',fangsong:'FangSong',heiti:'Heiti',kaiti:'KaiTi'};
  const enFamilies={system:'System',inter:'Inter',segoe:'Segoe',arial:'Arial',helvetica:'Helvetica',verdana:'Verdana',trebuchet:'Trebuchet',tahoma:'Tahoma',times:'Times',georgia:'Georgia',courier:'Courier',mono:'Mono'};
  let transfer=null, transferBusy=false, transferHidden=false, lastTransfer=null, restoreProgress=0, transferCase='success';
  document.addEventListener('loop:overlay-dismiss',()=>{if(transferBusy)transferHidden=true;});
  state.updateAutomatic=true;
  const value = key => key==='density'?$('#density').value:state.settings[key];
  const row = (label,desc,control) => '<div class="setting-row"><div><span class="setting-label">'+label+'</span><p>'+desc+'</p></div>'+control+'</div>';
  const action = (id,text) => '<button class="button" data-prefs-action="'+id+'">'+text+'</button>';
  const select = (key,desc) => row(labels[key],desc,'<button class="prefs-choice" id="prefs-'+key+'" data-prefs-choice="'+key+'" aria-haspopup="menu" aria-expanded="false" aria-label="'+labels[key]+'：'+esc(choices[key].find(([v])=>v===String(value(key)))?.[1]||'')+'"><span>'+esc(choices[key].find(([v])=>v===String(value(key)))?.[1]||'')+'</span>'+icon('chevron')+'</button>');
  const toggle = (key,label,desc,checked) => row(label,desc,'<button class="prefs-switch" role="switch" aria-label="'+label+'" aria-checked="'+checked+'" data-prefs-toggle="'+key+'"></button>');
  applyAppearance = function(){
    const prefs=state.settings;
    document.documentElement.style.setProperty('--font-scale',prefs.fontScale);
    document.documentElement.style.setProperty('--sans','"TaskTrack English '+(enFamilies[prefs.enFont]||'System')+'","TaskTrack Chinese '+(zhFamilies[prefs.zhFont]||'System')+'",-apple-system,BlinkMacSystemFont,sans-serif');
  };
  function status(){
    if(!lastTransfer)return '';
    return '<div class="prefs-transfer-status '+(lastTransfer.error?'error':'')+'" role="status"><strong>'+icon(lastTransfer.error?'close':'check')+esc(lastTransfer.title)+'</strong><p>'+esc(lastTransfer.description)+'</p></div>';
  }
  function updatePanel(){
    const u=state.updateCase;
    const title={available:'示例新版本 v0.1.201 可用',downloading:'正在下载更新 · 38%',downloaded:'更新已准备好',error:'下载未完成',current:'当前已是最新版本'}[u];
    return '<h2>软件更新</h2><p>检查新版本，管理更新方式。</p>'+toggle('updateAutomatic','自动检查更新',state.updateAutomatic?'应用启动后定期检查。':'仅在手动操作时检查。',state.updateAutomatic)+row('当前版本','v0.1.200',action('check-update','检查更新'))+'<section class="prefs-update-detail" aria-live="polite"><h3>'+title+'</h3><p>'+({available:'确认后在后台下载，完成后自动安装并重新启动。',downloading:'下载期间可继续处理任务；完成后应用会自动重启。',downloaded:'请保存正在编辑的内容，然后重启完成安装。',error:'请检查网络连接后重试。',current:'暂无可用更新。'}[u])+'</p>'+(u==='downloading'?'<div class="update-progress" role="progressbar" aria-label="更新下载进度" aria-valuenow="38" aria-valuemin="0" aria-valuemax="100"><span></span></div>':'')+(['available','error','downloaded'].includes(u)?'<footer>'+action(u==='downloaded'?'restart-update':'download-update',u==='error'?'重试下载':u==='downloaded'?'重启并安装':'升级并重启')+'</footer>':'')+'</section><p class="prefs-native-caption">本页预览更新状态，不连接更新服务。</p>';
  }
  renderSettings = function(){
    const p=state.settingsPane,dark=document.documentElement.dataset.theme==='dark';let body='';
    if(p==='appearance')body='<h2>外观</h2><p>选择舒适的阅读方式，调整会即时应用。</p>'+row('主题','适应你的工作环境。','<div class="prefs-theme" role="group" aria-label="主题">'+['light','dark'].map(v=>'<button class="theme-option '+((dark?'dark':'light')===v?'active':'')+'" data-theme-choice="'+v+'" aria-pressed="'+((dark?'dark':'light')===v)+'"><span class="theme-mini '+v+'" aria-hidden="true"><i></i><b></b><span></span></span><span>'+icon(v==='light'?'sun':'moon')+(v==='light'?'浅色':'深色')+'</span></button>').join('')+'</div>')+select('fontScale','调整界面字号，保持任务和处理流的阅读节奏。')+select('zhFont','内置字体可直接使用；其他字体需设备已安装。')+select('enFont','用于英文、数字与中英文混排。')+'<div class="font-preview"><div><span>字体预览</span><span>中文 · English · 0123456789</span></div><b>PCIe MSI 中断路径排查</b><p>沿设备、驱动到内核中断域逐层确认。<br>Record each step, keep the context. 0123456789</p></div><footer class="settings-footer"><span>不需要额外保存</span><button class="text-button" data-action="reset-appearance">恢复默认外观</button></footer>';
    if(p==='tasks')body='<h2>任务与浮窗</h2><p>设置常用默认值，减少每次打开任务时的调整。</p>'+select('defaultFilter','打开今日、任务仓库与分组时使用。')+select('defaultPriority','进入任务视图时的默认筛选范围。')+select('newPriority','新建任务时使用，创建后仍可单独调整。')+select('density','较长的处理流可使用紧凑间距。')+'<h3 class="prefs-subheading">今日浮窗</h3>'+toggle('widgetOpen','显示今日浮窗','在独立小窗口中查看今日任务与速记。',state.widgetOpen)+toggle('widgetPinned','始终置顶','使用其他应用时，浮窗仍保持在最前面。',state.widgetPinned)+toggle('widgetThrough','鼠标穿透','让点击穿过浮窗，操作后面的应用。',state.widgetThrough)+'<p class="prefs-native-caption">快捷键 <kbd>⌘ / Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> 可恢复浮窗操作。<br>本页展示浮窗与开关状态；置顶、穿透由桌面应用执行。</p>';
    if(p==='data')body='<h2>数据</h2><p>备份整个工作空间，在需要时恢复。</p>'+row('完整备份','包含任务、分组、处理记录、笔记恢复内容及应用偏好。',action('export','导出备份'))+'<h3 class="prefs-subheading">恢复工作空间</h3>'+row('从备份文件恢复','选择 Loop 完整备份（.loopbackup）。',action('restore-file','选择文件'))+row('从备份目录恢复','支持 Loop 与 Personal Task Track 的备份目录。',action('restore-directory','选择目录'))+'<div class="prefs-inline-note">'+icon('history')+'<span>恢复会替换当前工作空间。Loop 会先备份当前数据，失败时自动回滚；成功后重新启动。<br>外部绑定的 Markdown 文件需要另行备份。</span></div>'+status()+'<p class="prefs-native-caption">本页使用示例备份演示，不读写真实文件与任务数据。</p>';
    if(p==='updates')body=updatePanel();
    if(!body)return oldSettings();
    return pageHeading('设置','调整工作空间的外观与使用偏好。')+'<div class="settings-layout phase9"><nav class="settings-nav" aria-label="设置分类">'+settingCategories.map(([v,l,i])=>'<button class="'+(p===v?'active':'')+'" data-settings-pane="'+v+'" aria-current="'+(p===v?'page':'false')+'">'+icon(i)+l+'</button>').join('')+'</nav><section class="settings-content"><div class="settings-document">'+body+'</div></section></div>';
  };
  function choiceMenu(trigger,key){
    const rect=trigger.getBoundingClientRect();
    $('#overlay').innerHTML='<div class="surface-popover prefs-menu" role="menu" aria-label="'+labels[key]+'" data-return-focus="#prefs-'+key+'">'+choices[key].map(([v,l])=>'<button role="menuitemradio" aria-checked="'+(String(value(key))===v)+'" data-prefs-value="'+v+'" data-prefs-key="'+key+'"><span>'+esc(l)+'</span>'+(String(value(key))===v?icon('check'):'<span></span>')+'</button>').join('')+'</div>';
    const menu=$('.prefs-menu');menu.style.left=Math.max(12,Math.min(rect.right-258,innerWidth-270))+'px';menu.style.top=Math.max(12,Math.min(rect.bottom+7,innerHeight-menu.offsetHeight-55))+'px';trigger.setAttribute('aria-expanded','true');menu.querySelector('[aria-checked=true]')?.focus();
  }
  function dialog(title,body,footer,focus){
    $('#overlay').innerHTML='<div class="dialog-backdrop" data-return-focus="[data-prefs-action=\''+(transfer?.kind==='export'?'export':transfer?.kind==='directory'?'restore-directory':'restore-file')+'\']"><section class="dialog prefs-dialog" role="dialog" aria-modal="true" aria-label="'+title+'" aria-busy="'+transferBusy+'"><div class="dialog-head"><h2>'+title+'</h2>'+(transferBusy?'':'<button class="icon-button" data-action="close-dialog" aria-label="关闭">'+icon('close')+'</button>')+'</div>'+body+'<footer>'+footer+'</footer></section></div>';
    if(focus)$(focus)?.focus();else $('.prefs-dialog h2').setAttribute('tabindex','-1'),$('.prefs-dialog h2').focus();
  }
  function openTransfer(kind){
    if(transferBusy){toast('示例操作仍在进行，请稍后查看结果');return;}
    transfer={kind,case:transferCase};
    if(kind==='export')dialog('导出完整备份','<p>将整个工作空间保存为一个 .loopbackup 文件。</p><div class="prefs-file">'+icon('folder')+'<div><strong>Loop-backup-2026-10-02.loopbackup</strong><small>示例位置：文稿 / Loop 备份</small></div></div><p>包含任务与处理记录、笔记恢复内容及应用偏好。</p>',action('cancel-transfer','取消')+'<button class="button primary" data-prefs-action="start-export">导出备份</button>','[data-prefs-action="cancel-transfer"]');
    else dialog(kind==='directory'?'选择示例备份目录':'选择示例备份文件','<p>桌面应用会打开系统选择器。这里用示例演示恢复过程。</p><label for="prefs-backup-source">'+(kind==='directory'?'备份目录':'备份文件')+'</label><select id="prefs-backup-source"><option value="recent">'+(kind==='directory'?'Loop Data Backups / 2026-10-01':'Loop-backup-2026-10-01.loopbackup')+'</option><option value="older">'+(kind==='directory'?'Personal Task Track Upgrade Backups / 2026-09-27':'Loop-backup-2026-09-27.loopbackup')+'</option></select>',action('cancel-transfer','取消')+'<button class="button primary" data-prefs-action="confirm-source">选择'+(kind==='directory'?'目录':'文件')+'</button>','#prefs-backup-source');
  }
  function confirmRestore(){
    const text=$('#prefs-backup-source').selectedOptions[0].textContent;transfer.source=text;
    dialog('确认恢复工作空间','<p>当前工作空间将被所选备份替换。</p><div class="prefs-file">'+icon(transfer.kind==='directory'?'folder':'note')+'<div><strong>'+esc(text)+'</strong><small>示例备份 · '+(text.includes('10-01')?'2026 年 10 月 1 日':'2026 年 9 月 27 日')+'</small></div></div><p>先完整备份并校验当前数据；导入失败时自动回滚。成功后应用将重新启动。</p>',action('cancel-transfer','取消')+'<button class="button primary" data-prefs-action="start-restore">备份当前数据并恢复</button>','[data-prefs-action="cancel-transfer"]');
  }
  function progress(){
    if(transferHidden)return;
    const titles=transfer.kind==='export'?['保存当前内容','生成并校验备份','保存备份文件']:['备份并校验当前数据','校验所选备份','恢复工作空间'];
    dialog(transfer.kind==='export'?'正在导出备份':'正在恢复工作空间','<p>操作期间请保持窗口打开。</p><ol class="prefs-progress" aria-live="polite">'+titles.map((s,i)=>'<li class="'+(i<restoreProgress?'complete':i===restoreProgress?'current':'')+'">'+(i<restoreProgress?icon('check'):i===restoreProgress?'<span class="prefs-busy-icon" aria-hidden="true"></span>':icon('chevron'))+'<span>'+s+'</span></li>').join('')+'</ol>','',null);
  }
  async function runTransfer(){
    transferBusy=true;transferHidden=false;restoreProgress=0;progress();
    const stepCount=transfer.kind!=='export'&&transfer.case==='invalid'?2:3;
    for(let i=1;i<stepCount;i++){await new Promise(r=>setTimeout(r,650));restoreProgress=i;progress();}
    await new Promise(r=>setTimeout(r,500));transferBusy=false;
    const exporting=transfer.kind==='export';const fail=exporting?transfer.case==='export-error':['invalid','restore-error'].includes(transfer.case);
    if(fail){
      const desc=exporting?'示例目标位置无法写入。请选择其他位置后重试。当前工作空间未改变。':transfer.case==='invalid'?'所选备份校验失败，未导入任何内容。当前工作空间未改变，操作前的安全备份已保留。':'恢复未完成，已自动回滚。当前工作空间和操作前的安全备份均已保留。';
      lastTransfer={error:true,title:exporting?'备份未导出':'恢复未完成',description:desc};
      if(transferHidden){render();toast(lastTransfer.title);return;}
      dialog(lastTransfer.title,'<p>'+desc+'</p>',action('finish-transfer','返回数据设置')+'<button class="button primary" data-prefs-action="retry-transfer">'+(exporting?'重试导出':'重新选择备份')+'</button>','[data-prefs-action="finish-transfer"]');
    }else{
      lastTransfer={title:exporting?'备份已导出（示例）':'恢复已完成（示例）',description:exporting?'文稿 / Loop 备份 / Loop-backup-2026-10-02.loopbackup':'操作前的安全备份已保留。真实应用会重新启动，本页保留原有示例任务。'};
      if(transferHidden){render();toast(lastTransfer.title);return;}
      dialog(lastTransfer.title,'<p>'+esc(lastTransfer.description)+'</p>'+(exporting?'<p>备份文件已通过完整性校验。</p>':''),'<button class="button primary" data-prefs-action="finish-transfer">'+(exporting?'完成':'模拟重新启动')+'</button>','[data-prefs-action="finish-transfer"]');
    }
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('#reviewInfo')){e.preventDefault();e.stopImmediatePropagation();reviewInfo();return;}
    if(transferBusy&&e.target.closest('#overlay')){e.preventDefault();e.stopImmediatePropagation();return;}
    const b=e.target.closest('[data-prefs-choice],[data-prefs-value],[data-prefs-toggle],[data-prefs-action]');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(b.dataset.prefsChoice){choiceMenu(b,b.dataset.prefsChoice);return;}
    if(b.dataset.prefsValue){const key=b.dataset.prefsKey,val=b.dataset.prefsValue;closeOverlay();if(key==='density'){$('#density').value=val;document.documentElement.style.setProperty('--row',val+'px');}else{state.settings[key]=val;if(['fontScale','zhFont','enFont'].includes(key))applyAppearance();}render();$('#prefs-'+key)?.focus();return;}
    if(b.dataset.prefsToggle){const key=b.dataset.prefsToggle;state[key]=!state[key];render();$('[data-prefs-toggle="'+key+'"]')?.focus();return;}
    const a=b.dataset.prefsAction;
    if(['export','restore-file','restore-directory'].includes(a))openTransfer(a==='export'?'export':a==='restore-file'?'file':'directory');
    else if(a==='confirm-source')confirmRestore();
    else if(a==='start-export'||a==='start-restore')void runTransfer();
    else if(a==='cancel-transfer'){closeOverlay();transfer=null;}
    else if(a==='retry-transfer')openTransfer(transfer.kind);
    else if(a==='finish-transfer'){closeOverlay();render();$('[data-prefs-action="'+(transfer.kind==='export'?'export':transfer.kind==='directory'?'restore-directory':'restore-file')+'"]')?.focus();transfer=null;}
    else if(a==='check-update'){b.disabled=true;b.textContent='检查中…';setTimeout(()=>{render();$('[data-prefs-action="check-update"]')?.focus();toast('示例更新检查已完成');},700);}
    else if(a==='download-update'){state.updateCase='downloading';$('#update-case').value=state.updateCase;render();}
    else if(a==='restart-update')toast('重启安装状态预览：请在桌面应用中执行');
    else if(a==='finish-review')closeOverlay();
  },true);
  document.addEventListener('keydown',e=>{
    if(transferBusy&&!transferHidden){if(['Escape','Tab'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();}return;}
    if(!e.target.closest('.prefs-menu'))return;
    const items=Array.from($('.prefs-menu').querySelectorAll('[role=menuitemradio]')),i=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:items.length-1))%items.length].focus();}
  },true);
  const controls=$('.review-controls');controls.insertAdjacentHTML('afterbegin','<label for="backup-case">备份状态</label><select id="backup-case" aria-label="预览备份状态"><option value="success">成功</option><option value="invalid">校验失败</option><option value="export-error">导出失败</option><option value="restore-error">恢复失败</option></select>');
  $('#backup-case').addEventListener('change',e=>{transferCase=e.target.value;});
  document.title='Loop · Plane 方向 · 第九阶段';
  $('.review-bar b').textContent='第九阶段 · 设置与数据';
  $('.review-bar .review-note').textContent='外观 · 偏好 · 备份恢复';
  reviewInfo=function(){dialog('第九阶段评审','<p>本轮完成外观、任务与浮窗偏好、数据备份恢复，以及软件更新设置。</p><p>可以切换主题、字号与字体，调整任务默认值，打开今日浮窗。数据页可体验导出与文件／目录恢复，底部「备份状态」可切换失败场景。</p><p>示例操作不读写真实文件。高级功能与反馈页面将在后续阶段设计。</p>',action('finish-review','开始评审'),'[data-prefs-action="finish-review"]');$('.dialog-backdrop').dataset.returnFocus='#reviewInfo';};
  state.route='settings';state.settingsPane='appearance';applyAppearance();render();
})();
