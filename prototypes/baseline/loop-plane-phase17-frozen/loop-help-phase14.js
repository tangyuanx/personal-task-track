(() => {
  'use strict';
  const previousSettings = renderSettings;
  const categories = [['malfunction','功能异常'],['crash','软件崩溃'],['data','数据异常'],['display','界面显示'],['performance','性能问题'],['suggestion','功能建议'],['other','其他']];
  const topics = [
    ['今日、仓库和分组有什么关系？','任务仓库保存全部任务。分组负责归类；今日是需要今天处理的任务集合，加入今日不会改变原来的分组。今日浮窗只显示今日任务，速记单独展示。'],
    ['如何保留问题的解决过程？','在处理流中逐层拆分节点，记录验证过程，并更新节点状态。任务进展与结论保留整体上下文；知识笔记适合整理可复用的内容。'],
    ['如何备份数据和笔记？','在「数据」设置中导出完整备份。外部绑定的 Markdown 文件需要单独备份。恢复前，桌面应用会先备份并校验当前数据。']
  ];
  let openTopic = -1, resultCase = 'success', busy = false, submitted = false, message = '';
  const draft = {title:'',category:'',description:'',reproductionSteps:'',contact:'',includeEnvironment:true,confirmed:false};
  let errors = {};
  const action = (key, text, primary=false) => `<button type="button" class="button${primary?' primary':''}" data-help14="${key}">${text}</button>`;
  renderSettings = function() {
    if (state.settingsPane !== 'help') return previousSettings();
    return pageHeading('设置','调整工作空间的外观与使用偏好。') + `<div class="settings-layout phase9"><nav class="settings-nav" aria-label="设置分类">${settingCategories.map(([v,l,i])=>`<button class="${v==='help'?'active':''}" data-settings-pane="${v}" aria-current="${v==='help'?'page':'false'}">${icon(i)}${l}</button>`).join('')}</nav><section class="settings-content"><div class="settings-document"><h2>帮助与反馈</h2><p>了解 Loop 的使用方式，记录遇到的问题与建议。</p><section class="help14-intro"><div><span class="setting-label">问题与建议</span><p>描述遇到的情况，保留复现步骤与预期结果。</p></div>${action('feedback','提交反馈')}</section><h3 class="prefs-subheading">使用说明</h3><ul class="help14-topics">${topics.map(([title,body],i)=>`<li><button data-help14="topic" data-topic="${i}" aria-expanded="${i===openTopic}">${title}${icon(i===openTopic?'minus':'plus')}</button>${i===openTopic?`<p>${body}</p>`:''}</li>`).join('')}</ul><div class="setting-row"><div><span class="setting-label">关于 Loop</span><p>个人任务与处理过程管理</p></div><span class="muted">v0.1.200</span></div><p class="prefs-native-caption">本页为设计预览，反馈不会发送到 GitHub。</p></div></section></div>`;
  };
  function field(key,label,optional=false,textarea=false) {
    const error=errors[key],size=key==='title'?100:key==='contact'?200:5000;
    const attrs=`id="help14-${key}" data-help14-field="${key}" maxlength="${size}" aria-invalid="${!!error}"${error?` aria-describedby="help14-${key}-error"`:''}`;
    return `<div class="help14-field"><label for="help14-${key}">${label}<small>${optional?'可选':key==='title'?'3–100 字':'10–5000 字'}</small></label>${textarea?`<textarea ${attrs} rows="${key==='description'?4:3}">${esc(draft[key])}</textarea>`:`<input ${attrs} value="${esc(draft[key])}" autocomplete="off">`}${error?`<p id="help14-${key}-error" class="help14-error" role="alert">${error}</p>`:''}</div>`;
  }
  function feedback(focus=true) {
    $('#overlay').innerHTML=`<div class="dialog-backdrop" data-return-focus="[data-help14=feedback]"><form class="dialog help14-form" id="help14-form" role="dialog" aria-modal="true" aria-label="问题与建议" novalidate><div class="dialog-head"><h2>问题与建议</h2><button type="button" class="icon-button" data-help14="close" aria-label="关闭">${icon('close')}</button></div>${submitted?`<div class="help14-result" role="status">${icon('check')}<h3>反馈提交成功 · 示例</h3><p>真实应用会在这里显示反馈编号与 GitHub Issue 链接。<br>本次演示未发送任何内容。</p></div><footer>${action('done','完成',true)}</footer>`:`<p class="help14-caption">说明发生了什么，以及你希望的结果。</p>${field('title','问题标题')}<div class="help14-field"><label for="help14-category">问题类型</label><select id="help14-category" data-help14-field="category" aria-invalid="${!!errors.category}"><option value="">请选择</option>${categories.map(([v,l])=>`<option value="${v}" ${draft.category===v?'selected':''}>${l}</option>`).join('')}</select>${errors.category?`<p class="help14-error" role="alert">${errors.category}</p>`:''}</div>${field('description','问题描述',false,true)}${field('reproductionSteps','复现步骤',true,true)}${field('contact','联系方式',true)}<div class="help14-privacy"><label><input type="checkbox" data-help14-field="includeEnvironment" ${draft.includeEnvironment?'checked':''}>附带基本环境信息</label>${draft.includeEnvironment?'<p>软件版本、操作系统、架构、当前模块、提交时间和随机安装标识；不包含任务、笔记或数据库内容。</p>':''}<label><input type="checkbox" data-help14-field="confirmed" ${draft.confirmed?'checked':''}>我知道反馈将成为公开的 GitHub Issue，并已检查不含敏感信息。</label>${errors.confirmed?`<p class="help14-error" role="alert">${errors.confirmed}</p>`:''}</div>${message?`<p class="help14-error" role="alert">${message}</p>`:''}<footer><small>设计演示 · 不实际发送</small>${action('close','取消')}<button class="button primary" type="submit" ${busy?'disabled':''}>${busy?'正在提交…':message?'重试提交':'提交反馈'}</button></footer>`}</form></div>`;
    if(busy)$('#help14-form').querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
    if(focus)requestAnimationFrame(()=>$('#help14-title')?.focus());
  }
  document.addEventListener('input',e=>{
    const key=e.target.dataset.help14Field;if(!key)return;draft[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;
    if(errors[key]){delete errors[key];e.target.setAttribute('aria-invalid','false');e.target.removeAttribute('aria-describedby');e.target.closest('.help14-field')?.querySelector('.help14-error')?.remove();if(key==='confirmed')e.target.closest('.help14-privacy')?.querySelector('.help14-error')?.remove();}
  });
  document.addEventListener('change',e=>{
    const key=e.target.dataset.help14Field;if(!key)return;
    draft[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;
    if(key==='includeEnvironment')feedback(false);
  });
  document.addEventListener('submit',e=>{
    if(e.target.id!=='help14-form')return;e.preventDefault();e.stopImmediatePropagation();
    const length=value=>Array.from(value.trim()).length;errors={};message='';
    if(length(draft.title)<3||length(draft.title)>100)errors.title='问题标题需为 3～100 字';
    if(!categories.some(([v])=>v===draft.category))errors.category='请选择问题类型';
    if(length(draft.description)<10||length(draft.description)>5000)errors.description='问题描述需为 10～5000 字';
    if(length(draft.reproductionSteps)>5000)errors.reproductionSteps='复现步骤最多 5000 字';
    if(length(draft.contact)>200)errors.contact='联系方式最多 200 字';
    if(!draft.confirmed)errors.confirmed='请确认隐私提示后再提交';
    if(Object.keys(errors).length){feedback(false);requestAnimationFrame(()=>$(`[data-help14-field="${Object.keys(errors)[0]}"]`)?.focus());return;}
    busy=true;feedback(false);
    setTimeout(()=>{busy=false;submitted=resultCase==='success';message=submitted?'':'未能提交，请检查网络连接后重试。内容已保留。';if($('#help14-form'))feedback(false);},700);
  },true);
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-help14]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
    const a=b.dataset.help14;
    if(a==='topic'){openTopic=openTopic===Number(b.dataset.topic)?-1:Number(b.dataset.topic);render();}
    else if(a==='feedback')feedback();
    else if(a==='close')closeOverlay();
    else if(a==='done'){submitted=false;Object.keys(draft).forEach(k=>draft[k]=typeof draft[k]==='boolean'?k==='includeEnvironment':'');errors={};closeOverlay();}
  },true);
  $('.review-controls').insertAdjacentHTML('afterbegin','<label for="help14-case">反馈</label><select id="help14-case" aria-label="预览反馈结果"><option value="success">提交成功</option><option value="error">提交失败</option></select>');
  $('#help14-case').addEventListener('change',e=>resultCase=e.target.value);
  render();
})();
