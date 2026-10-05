/* Browser preview only. Production native controls belong to Electron, not these DOM buttons. */
(() => {
  const query=new URLSearchParams(location.search);
  let platform=query.get('platform')==='windows'?'windows':'mac',expanded=false,inactive=false;
  paths.window25min='M5 12h14';paths.window25max='M5 5h14v14H5z';paths.window25restore='M8 8h11v11H8zM5 15H3V3h12v2';
  paths.window25full='m4 9 5-5M4 4h5M4 4v5m16 6-5 5m5 0h-5m5 0v-5';
  paths.window25exit='m9 4-5 5m5 0H4m5 0V4m6 16 5-5m-5 0h5m-5 0v5';
  function controls(){
    return platform==='mac'?`<div class="window25-traffic" role="group" aria-label="Mac 窗口控制预览"><button class="close" data-desk19-window="closed" aria-label="关闭并退出 Loop（预览）" title="关闭并退出 Loop">${icon('close')}</button><button class="minimize" data-desk19-window="minimized" aria-label="最小化窗口（预览）" title="最小化">${icon('window25min')}</button><button class="expand" data-window25="expand" aria-label="${expanded?'退出全屏':'进入全屏'}（预览）" title="${expanded?'退出全屏':'进入全屏'}">${icon(expanded?'window25exit':'window25full')}</button></div>`:`<div class="window25-caption" role="group" aria-label="Windows 窗口控制预览"><button data-desk19-window="minimized" aria-label="最小化窗口（预览）" title="最小化">${icon('window25min')}</button><button data-window25="expand" aria-label="${expanded?'还原窗口':'最大化窗口'}（预览）" title="${expanded?'还原':'最大化'}">${icon(expanded?'window25restore':'window25max')}</button><button class="close" data-desk19-window="closed" aria-label="关闭并退出 Loop（预览）" title="关闭并退出 Loop">${icon('close')}</button></div>`;
  }
  function decorate(){
    const bar=$('.topbar'),brand=$('.brand');if(!bar||!brand)return;
    document.body.dataset.window25=platform;
    document.body.toggleAttribute('data-window25-inactive',inactive);
    bar.setAttribute('aria-label','Loop 一体化标题栏');
    const toggle=brand.querySelector('.nav-toggle');
    bar.prepend(brand);
    const update=brand.querySelector('.brand-update');
    if(platform==='mac'){if(toggle)brand.after(toggle);}
    else if(state.navCollapsed){
      if(toggle)brand.after(toggle);
      if(update)(toggle||brand).after(update);
    }else if(toggle){
      if(update)brand.insertBefore(toggle,update);else brand.append(toggle);
    }
    if(platform==='mac')brand.insertAdjacentHTML('afterbegin',controls());else bar.insertAdjacentHTML('beforeend',controls());
    const out=$('.window25-state');if(out)out.textContent=(platform==='mac'?'Mac':'Windows')+' · '+(expanded?(platform==='mac'?'全屏预览':'最大化预览'):'普通窗口')+(inactive?' · 非活动':'');
    document.querySelectorAll('.window25-review-tools [data-window25-platform]').forEach(b=>{b.classList.toggle('active',b.dataset.window25Platform===platform);b.setAttribute('aria-pressed',String(b.dataset.window25Platform===platform));});
    $('[data-window25="inactive"]')?.setAttribute('aria-pressed',String(inactive));
    document.title='Loop · 第25阶段 · '+(platform==='mac'?'Mac':'Windows')+' 一体化标题栏';
  }
  const prior=render;render=function(){prior();decorate();};
  function review(){
    closeOverlay();mountSurface(`<section class="surface-popover manage24-panel" role="dialog" aria-modal="true" aria-label="一体化标题栏评审">${surfaceHeader('第25阶段 · 一体化标题栏')}<div class="manage24-body"><p class="manage24-impact">窗口控制与 Loop 顶部工具融为一行，三栏宽度和内容区域保留。Mac 在左侧，Windows 在右侧。</p><p class="schedule-hint">顶部空白区域用于拖动；正式应用由系统处理双击标题栏、缩放与窗口控制。按钮、导航与弹层均不可作为拖动区域。</p><p class="schedule-hint">此 HTML 仅预览按钮及状态：最大化／全屏不改变系统窗口，最小化／关闭复用桌面场景预览。关闭沿用当前项目的退出行为；实际保存与退出拦截必须保留。</p><p class="schedule-hint">正式接入建议隐藏独立标题栏，保留系统窗口控制、边缘缩放及 Windows Snap 能力。真实 OS 行为需要在两平台验收。</p></div><footer><button class="button primary" data-action="close-dialog">开始检阅</button></footer></section>`,$('#reviewInfo'),440);
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-window25],[data-window25-platform]');if(!b||b===document.body)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(b.dataset.window25Platform){captureKnowledgeEditor();flushNodeRecord();closeOverlay();platform=b.dataset.window25Platform;expanded=false;render();}
    else if(b.dataset.window25==='expand'){expanded=!expanded;captureKnowledgeEditor();flushNodeRecord();closeOverlay();render();$('[data-window25="expand"]')?.focus({preventScroll:true});}
    else if(b.dataset.window25==='inactive'){inactive=!inactive;render();}
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    $('.review-bar b').textContent='第25阶段 · 一体化标题栏';
    $('.review-controls').insertAdjacentHTML('afterbegin',`<div class="window25-review-tools" role="group" aria-label="平台预览"><button data-window25-platform="mac">Mac</button><button data-window25-platform="windows">Windows</button><button data-window25="inactive" aria-pressed="false">非活动</button></div><span class="window25-state" role="status"></span>`);
    globalThis.loopWidgetReview=review;reviewInfo=review;render();
  });
})();
