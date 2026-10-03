(() => {
  let consumePointerClick = false;
  window.addEventListener('pointerdown', event => {
    consumePointerClick = false;
    if (event.button !== 0) return;
    const target = event.target;
    const overlay = document.querySelector('#overlay');
    const surface = overlay?.querySelector('.dialog') || overlay?.firstElementChild;
    if (surface && !surface.contains(target)) {
      document.dispatchEvent(new CustomEvent('loop:overlay-dismiss'));
      closeOverlay();
      consumePointerClick = true;
    }
    const taskMenu = document.querySelector('.workspace .popover');
    if (taskMenu && !taskMenu.contains(target)) {
      state.menu = false;
      taskMenu.remove();
      document.querySelector('[data-action="task-menu"]')?.setAttribute('aria-expanded', 'false');
      consumePointerClick = true;
    }
    if (document.querySelector('#global-results') && !target.closest('#global-results,.list-search')) {
      closeGlobalSearch();
      consumePointerClick = true;
    }
    const drawer=document.querySelector('.inspector.flow-drawer');
    if(drawer&&!overlay?.firstElementChild&&!target.closest('#global-results')&&!drawer.contains(target)) {
      state.node=null;
      render();
      consumePointerClick=true;
    }
  }, true);
  window.addEventListener('click', event => {
    if (!consumePointerClick || event.detail === 0) return;
    consumePointerClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
