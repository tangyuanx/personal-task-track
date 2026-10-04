/* Loaded before legacy listeners so a child select popup dismisses independently. */
(() => {
  const phase = Number(new URLSearchParams(location.search).get('phase') || 22);
  if (phase < 22) return;
  let opened = null, consumeClick = false, sequence = 0, typed = '', typedAt = 0;
  const supported = el => el instanceof HTMLSelectElement && !el.multiple && el.size <= 1 && !el.disabled;
  const enabled = option => !option.disabled && !option.closest('optgroup')?.disabled;
  const check = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';
  function close() {
    if (!opened) return;
    const {select, menu} = opened;
    select.setAttribute('aria-expanded', 'false');
    select.removeAttribute('aria-controls'); select.removeAttribute('aria-activedescendant');
    menu.remove(); opened = null; typed = '';
  }
  function position() {
    if (!opened) return;
    const {select, menu} = opened, r = select.getBoundingClientRect();
    if (!select.isConnected || select.disabled || !r.width || !r.height) {close(); return;}
    const width = Math.min(innerWidth - 24, Math.max(r.width, 176));
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < Math.min(menu.scrollHeight, 180) && above > below;
    menu.style.width = width + 'px';
    menu.style.maxHeight = Math.min(272, Math.max(64, up ? above - 6 : below - 6)) + 'px';
    menu.style.left = Math.max(12, Math.min(r.left, innerWidth - width - 12)) + 'px';
    menu.style.top = (up ? Math.max(12, r.top - menu.offsetHeight - 6) : r.bottom + 6) + 'px';
  }
  function highlight(index) {
    if (!opened) return;
    const {select, menu} = opened;
    opened.index = index;
    menu.querySelectorAll('[data-active]').forEach(el => el.removeAttribute('data-active'));
    const item = menu.querySelector(`[data-index="${index}"]`);
    if (!item) return;
    item.setAttribute('data-active', ''); select.setAttribute('aria-activedescendant', item.id);
    item.scrollIntoView({block: 'nearest'});
  }
  function open(select) {
    close(); select.focus({preventScroll: true});
    const menu = document.createElement('div'), id = 'control22-menu-' + (++sequence);
    menu.id = id; menu.className = 'control22-listbox'; menu.setAttribute('role', 'listbox');
    const label = select.getAttribute('aria-label') || [...select.labels].map(el => el.textContent.trim()).join(' ') || '选项';
    menu.setAttribute('aria-label', label);
    let group;
    [...select.options].forEach((option, index) => {
      const parent = option.closest('optgroup');
      if (parent && parent !== group) {
        const heading = document.createElement('div'); heading.className = 'control22-optgroup'; heading.textContent = parent.label; menu.append(heading);
      }
      group = parent;
      const item = document.createElement('div'), text = document.createElement('span');
      item.className = 'control22-option'; item.id = id + '-' + index; item.dataset.index = index;
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected));
      if (!enabled(option)) item.setAttribute('aria-disabled', 'true');
      text.textContent = option.label; item.append(text);
      if (option.selected) item.insertAdjacentHTML('beforeend', check);
      menu.append(item);
    });
    // Keep the list in an enclosing modal's accessible subtree, without changing
    // its viewport-based positioning or the original field/validation path.
    (select.closest('[role="dialog"],.dialog,.surface-popover') || document.body).append(menu);
    opened = {select, menu, index: select.selectedIndex};
    select.setAttribute('aria-expanded', 'true'); select.setAttribute('aria-controls', id);
    position(); highlight(select.selectedIndex);
  }
  function commit(index) {
    if (!opened) return;
    const select = opened.select, option = select.options[index];
    if (!option || !enabled(option)) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index; close();
    if (changed) {select.dispatchEvent(new Event('input', {bubbles: true})); select.dispatchEvent(new Event('change', {bubbles: true}));}
    if (select.isConnected) select.focus({preventScroll: true});
  }
  function stop(event) {event.preventDefault(); event.stopImmediatePropagation();}
  window.addEventListener('pointerdown', event => {
    consumeClick = false;
    if (event.button !== 0) return;
    if (opened) {
      if (opened.menu.contains(event.target)) {
        event.target.closest('.control22-option') ? stop(event) : event.stopImmediatePropagation();
        return;
      }
      close(); consumeClick = true; stop(event); return;
    }
    if (supported(event.target)) {open(event.target); consumeClick = true; stop(event);}
  }, true);
  window.addEventListener('mousedown', event => {
    if (opened?.menu.contains(event.target)) {
      event.target.closest('.control22-option') ? stop(event) : event.stopImmediatePropagation();
      return;
    }
    if (opened || consumeClick || supported(event.target)) stop(event);
  }, true);
  window.addEventListener('click', event => {
    const item = event.target.closest('.control22-option');
    if (opened && item && opened.menu.contains(item)) {stop(event); commit(Number(item.dataset.index)); return;}
    if (consumeClick) {consumeClick = false; stop(event); return;}
    if (supported(event.target)) {stop(event); opened?.select === event.target ? close() : open(event.target);}
  }, true);
  window.addEventListener('pointermove', event => {
    const item = event.target.closest('.control22-option');
    if (opened && item && opened.menu.contains(item) && item.getAttribute('aria-disabled') !== 'true') highlight(Number(item.dataset.index));
  }, true);
  window.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (!opened) {
      if (supported(event.target) && [' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) {stop(event); open(event.target);}
      return;
    }
    if (event.key === 'Tab') {close(); return;}
    if (event.key === 'Escape') {stop(event); const select = opened.select; close(); select.focus({preventScroll: true}); return;}
    if (event.key === 'Enter' || event.key === ' ') {stop(event); commit(opened.index); return;}
    const options = [...opened.select.options], valid = options.map((o, i) => enabled(o) ? i : -1).filter(i => i >= 0);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      stop(event); const current = valid.indexOf(opened.index);
      highlight(event.key === 'Home' ? valid[0] : event.key === 'End' ? valid.at(-1) : valid[Math.max(0, Math.min(valid.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))]); return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      stop(event); const now = Date.now(); typed = now - typedAt > 650 ? event.key : typed + event.key; typedAt = now;
      const match = valid.find(i => options[i].label.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase()));
      if (match !== undefined) highlight(match);
    }
  }, true);
  window.addEventListener('resize', position);
  document.addEventListener('scroll', event => {if (opened && event.target !== opened.menu && !opened.menu.contains(event.target)) close();}, true);
  document.addEventListener('focusin', event => {if (opened && event.target !== opened.select && !opened.menu.contains(event.target)) close();}, true);
  document.addEventListener('change', event => {if (opened?.select === event.target) close();}, true);
  function decorate() {
    document.querySelectorAll('input,textarea,select,button.prefs-choice').forEach(el => {
      if (el.matches('input[type="hidden"],input[type="checkbox"],input[type="radio"],input[type="range"],input[type="file"],input[type="color"],input[type="button"],input[type="submit"],input[type="reset"],input[type="image"],.brief21-input,#knowledge-source') || el.closest('.list-search,.widget-capture')) return;
      el.classList.add('control22-field');
      if (el.matches('.node-title-input,.widget-title-input')) el.classList.add('control22-inline');
      if (el instanceof HTMLSelectElement && !el.multiple && el.size <= 1 && !el.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded', 'false');
    });
    if (opened && (!opened.select.isConnected || opened.select.disabled)) close();
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.body.dataset.controls22Enabled = '';
    decorate();
    new MutationObserver(decorate).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']});
    document.title = 'Loop · 第二十二阶段 · 输入与选择';
    const caption = document.querySelector('.review-bar b'); if (caption) caption.textContent = '第二十二阶段 · 输入与选择';
    globalThis.loopWidgetReview = function() {
      document.querySelector('#overlay').innerHTML = '<div class="dialog-backdrop" data-return-focus="#reviewInfo"><section class="dialog" role="dialog" aria-label="第二十二阶段评审"><header class="dialog-head"><h2>输入与选择</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭">' + icon('close') + '</button></header><p>新建任务、筛选、截止提醒、设置、导入和笔记中的输入与选择使用同一套样式。</p><ul><li>浅底色、细边框、6px 圆角；焦点使用单层绿色细线。</li><li>下拉选项统一行高、留白与选中标记，长列表可滚动。</li><li>方向键选择，Enter 确认，Esc 或外部点击收起；外部点击不会触发底层操作。</li><li>任务简报保持无框输入，搜索与速记只在外层反馈焦点。</li></ul><footer><button class="button primary" data-action="close-dialog">开始检阅</button></footer></section></div>';
    };
  }, {once: true});
})();
