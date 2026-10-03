/* Footer rhythm and native-project Feather settings geometry. */
(() => {
  const oldRender=render,oldShowPreferences=showWidgetPreferences;
  paths.settings='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0';
  function placePreferences(){
    const surface=document.querySelector('.widget12-settings'),widget=document.querySelector('.widget13');if(!surface||!widget)return;
    const r=widget.getBoundingClientRect(),width=surface.offsetWidth,height=surface.offsetHeight,gap=10,minY=64,maxY=innerHeight-50;
    let x=r.right-width,y=r.top-height-gap;
    if(y<minY){
      if(r.bottom+gap+height<=maxY)y=r.bottom+gap;
      else {x=r.left-width-gap>=12?r.left-width-gap:r.right+gap+width<=innerWidth-12?r.right+gap:r.right-width;y=r.top;}
    }
    surface.style.setProperty('--widget-prefs-x',Math.max(12,Math.min(x,innerWidth-width-12))+'px');
    surface.style.setProperty('--widget-prefs-y',Math.max(minY,Math.min(y,maxY-height))+'px');
  }
  render=function(){oldRender();const local=document.querySelector('.local-status');if(local){local.title='本地工作空间';local.setAttribute('aria-label','本地工作空间');}placePreferences();};
  showWidgetPreferences=function(){oldShowPreferences();placePreferences();};
  window.addEventListener('resize',placePreferences);
  render();
})();
