// ==UserScript==
// @name         Универсальный поиск — поиск в выпадающих списках
// @namespace    local.dropdown.search
// @version      1.1.3
// @description  Поиск в стандартных и пользовательских выпадающих списках на любых сайтах.
// @author       Svyatoslav Podolskii
// @homepageURL  https://github.com/svyatoslavpodolskii/MyVMScripts
// @supportURL   https://github.com/svyatoslavpodolskii/MyVMScripts/issues
// @updateURL    https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/%D0%A3%D0%BD%D0%B8%D0%B2%D0%B5%D1%80%D1%81%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%E2%80%94%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%B2%20%D0%B2%D1%8B%D0%BF%D0%B0%D0%B4%D0%B0%D1%8E%D1%89%D0%B8%D1%85%20%D1%81%D0%BF%D0%B8%D1%81%D0%BA%D0%B0%D1%85.user.js
// @downloadURL  https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/%D0%A3%D0%BD%D0%B8%D0%B2%D0%B5%D1%80%D1%81%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%E2%80%94%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%B2%20%D0%B2%D1%8B%D0%BF%D0%B0%D0%B4%D0%B0%D1%8E%D1%89%D0%B8%D1%85%20%D1%81%D0%BF%D0%B8%D1%81%D0%BA%D0%B0%D1%85.user.js
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;

  const MENU =
    '[role="listbox"],.select2-results,.choices__list--dropdown,.ts-dropdown,.dropdown-menu,.ant-select-dropdown,.el-select-dropdown,.MuiMenu-paper,[class*="__menu-list"]';
  const ITEM =
    '[role="option"],.select2-results__option,.choices__item--choice,.ts-dropdown .option,.dropdown-item,.ant-select-item-option,.el-select-dropdown__item,.MuiMenuItem-root,[class*="__option"]';
  const TRIGGER =
    '[role="combobox"],[aria-haspopup="listbox"],.select2-selection,.choices,.ts-control,.ant-select-selector,.el-select,.dropdown-toggle,[class*="__control"]';
  let active = null;
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;z-index:2147483647;display:none;box-sizing:border-box;background:#fff;color:#222;border:1px solid #aaa;border-radius:6px;box-shadow:0 5px 22px #0003;font:13px system-ui,sans-serif;max-height:330px;overflow:auto;';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Поиск в списке…';
  input.style.cssText =
    'display:block;box-sizing:border-box;width:100%;padding:8px;border:0;border-bottom:1px solid #ddd;outline:none;background:#fff;color:#222;font:inherit;position:sticky;top:0;z-index:1;';
  const results = document.createElement('div');
  host.append(input, results);
  document.documentElement.append(host);
  const isNative = (el) => el?.matches?.('select:not([multiple])') && el.size <= 1;
  function close() {
    host.style.display = 'none';
    active = null;
    input.value = '';
    results.replaceChildren();
  }
  function position(el) {
    const r = el.getBoundingClientRect(),
      w = Math.min(Math.max(r.width, 190), innerWidth - 16);
    host.style.width = w + 'px';
    host.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    host.style.top =
      (innerHeight - r.bottom > 180 ? r.bottom + 2 : Math.max(8, r.top - 330)) + 'px';
  }
  function render() {
    if (!active) return;
    const q = input.value.toLocaleLowerCase(),
      select = active;
    results.replaceChildren();
    let count = 0;
    for (const option of select.options) {
      if (option.hidden || !option.textContent.toLocaleLowerCase().includes(q)) continue;
      if (++count > 400) break;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = option.textContent.trim();
      b.disabled = option.disabled || option.parentElement?.disabled;
      b.style.cssText =
        'display:block;width:100%;padding:7px 9px;border:0;text-align:left;background:#fff;color:#222;font:inherit;cursor:pointer;';
      b.addEventListener('mouseenter', () => (b.style.background = '#e9f2ff'));
      b.addEventListener('mouseleave', () => (b.style.background = '#fff'));
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        select.selectedIndex = option.index;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      });
      results.append(b);
    }
    if (!count) results.textContent = 'Ничего не найдено';
  }
  function open(select) {
    active = select;
    input.value = '';
    position(select);
    host.style.display = 'block';
    render();
    input.focus({ preventScroll: true });
  }

  // Штатное меню гасим до открытия. Два меню на один клик — перебор.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (host.contains(e.target)) return;
      const select = e.target.closest?.('select');
      if (isNative(select)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        active === select ? close() : open(select);
        return;
      }
      if (active) close();
    },
    true
  );
  document.addEventListener(
    'mousedown',
    (e) => {
      if (isNative(e.target.closest?.('select'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );
  document.addEventListener(
    'click',
    (e) => {
      if (isNative(e.target.closest?.('select'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && active) {
        e.preventDefault();
        close();
        return;
      }
      if (isNative(e.target) && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open(e.target);
      }
    },
    true
  );
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      results.querySelector('button:not(:disabled)')?.click();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  const wired = new WeakSet();
  function enhance(menu) {
    if (
      wired.has(menu) ||
      menu.closest('select') ||
      menu.querySelector(
        'input[type="search"],input[role="combobox"],.select2-search__field,.choices__input'
      )
    )
      return;
    const items = [...menu.querySelectorAll(ITEM)].filter((x) => x.textContent.trim());
    if (items.length < 3 || items.length > 1000) return;
    wired.add(menu);
    const field = document.createElement('input');
    field.type = 'search';
    field.placeholder = 'Поиск в списке…';
    field.setAttribute('aria-label', 'Поиск в списке');
    field.style.cssText =
      'display:block;box-sizing:border-box;width:100%;min-height:32px;padding:6px 8px;margin:0 0 4px;border:1px solid #aaa;border-radius:4px;background:white;color:#222;font:13px system-ui,sans-serif;';
    field.addEventListener('pointerdown', (e) => e.stopPropagation());
    field.addEventListener('mousedown', (e) => e.stopPropagation());
    field.addEventListener('click', (e) => e.stopPropagation());
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') field.blur();
    });
    field.addEventListener('input', () => {
      const q = field.value.toLocaleLowerCase();
      for (const item of menu.querySelectorAll(ITEM)) {
        if (item.contains(field)) continue;
        item.style.display = item.textContent.toLocaleLowerCase().includes(q) ? '' : 'none';
      }
    });
    menu.prepend(field);
  }
  let scheduled = false;
  const scan = () => {
    scheduled = false;
    for (const menu of document.querySelectorAll(MENU)) {
      if (menu.getBoundingClientRect().width && menu.getBoundingClientRect().height) enhance(menu);
    }
  };
  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      setTimeout(scan, 80);
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-expanded']
  });
  document.addEventListener('pointerdown', () => setTimeout(scan, 80), true);
  window.addEventListener('resize', () => {
    if (active) position(active);
  });
  window.addEventListener(
    'scroll',
    () => {
      if (active) position(active);
    },
    true
  );
  scan();
})();
