// ==UserScript==
// @name         Google Таблицы — поиск и навигация по листам
// @namespace    uplink.google.sheets.home.search
// @version      13.0.3
// @description  Поиск по листам таблицы и быстрый переход к листу «Общая информация».
// @author       Svyatoslav Podolskii
// @homepageURL  https://github.com/svyatoslavpodolskii/MyVMScripts
// @supportURL   https://github.com/svyatoslavpodolskii/MyVMScripts/issues
// @updateURL    https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/Google%20%D0%A2%D0%B0%D0%B1%D0%BB%D0%B8%D1%86%D1%8B%20%E2%80%94%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%B8%20%D0%BD%D0%B0%D0%B2%D0%B8%D0%B3%D0%B0%D1%86%D0%B8%D1%8F%20%D0%BF%D0%BE%20%D0%BB%D0%B8%D1%81%D1%82%D0%B0%D0%BC.user.js
// @downloadURL  https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/Google%20%D0%A2%D0%B0%D0%B1%D0%BB%D0%B8%D1%86%D1%8B%20%E2%80%94%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%B8%20%D0%BD%D0%B0%D0%B2%D0%B8%D0%B3%D0%B0%D1%86%D0%B8%D1%8F%20%D0%BF%D0%BE%20%D0%BB%D0%B8%D1%81%D1%82%D0%B0%D0%BC.user.js
// @match        https://docs.google.com/spreadsheets/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;
  if (
    location.origin !== 'https://docs.google.com' ||
    !location.pathname.startsWith('/spreadsheets/')
  )
    return;

  const TARGET_SHEET = 'Общая информация';
  const HOME_ID = 'uplink-gs-home-v11';
  const POPUP_ID = 'uplink-gs-popup-v11';

  let selectedIndex = 0;

  function normalizeSearch(text) {
    return String(text || '')
      .toLocaleLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[.,;:!?'"`«»()[\]{}<>\/\\|_+=*~№#@%^&$-]+/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(text) {
    const n = normalizeSearch(text);
    return n ? n.split(' ') : [];
  }

  function smartMatch(label, query) {
    const hay = normalizeSearch(label);
    const parts = tokens(query);
    return !parts.length || parts.every((part) => hay.includes(part));
  }

  function getAllSheetsButton() {
    return document.querySelector(
      '.docs-sheet-menu-button.docs-sheet-all-button[aria-label="All Sheets"],' +
        '.docs-sheet-all-button[aria-label="All Sheets"],' +
        '.docs-sheet-all-button'
    );
  }

  function getSheetColor(tab) {
    if (!tab) return null;

    const candidates = [
      tab.querySelector('.docs-sheet-tab-color'),
      tab.querySelector('[style*="background"]'),
      tab
    ].filter(Boolean);

    for (const el of candidates) {
      const inline = el.style?.backgroundColor || el.style?.borderBottomColor;
      if (inline && inline !== 'transparent' && inline !== 'rgba(0, 0, 0, 0)') {
        return inline;
      }

      const cs = getComputedStyle(el);
      const values = [cs.backgroundColor, cs.borderTopColor, cs.borderBottomColor];

      for (const value of values) {
        if (
          value &&
          value !== 'transparent' &&
          value !== 'rgba(0, 0, 0, 0)' &&
          value !== 'rgb(255, 255, 255)' &&
          value !== 'rgb(248, 249, 250)' &&
          value !== 'rgb(241, 243, 244)'
        ) {
          return value;
        }
      }
    }

    return null;
  }

  function getSheetTabs() {
    return [...document.querySelectorAll('.docs-sheet-tab')]
      .map((tab) => ({
        tab,
        name: (tab.querySelector('.docs-sheet-tab-name')?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim(),
        color: getSheetColor(tab)
      }))
      .filter((x) => x.name);
  }

  function clickSheet(tab) {
    closePopup();

    tab.scrollIntoView({
      block: 'nearest',
      inline: 'nearest'
    });

    requestAnimationFrame(() => {
      for (const type of ['mouseover', 'mousedown', 'mouseup', 'click']) {
        tab.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0
          })
        );
      }
    });
  }

  function goHome() {
    const wanted = normalizeSearch(TARGET_SHEET);

    const target = getSheetTabs().find((x) => normalizeSearch(x.name) === wanted);

    if (target) clickSheet(target.tab);
  }

  function ensureHomeButton() {
    let home = document.getElementById(HOME_ID);

    if (!home) {
      home = document.createElement('button');
      home.id = HOME_ID;
      home.type = 'button';
      home.title = TARGET_SHEET;
      home.setAttribute('aria-label', TARGET_SHEET);

      home.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
             style="display:block;fill:currentColor;pointer-events:none">
          <path d="M12 3 2.5 10.8h2.7V21h5.3v-6h3v6h5.3V10.8h2.7L12 3Zm4.8 16h-1.3v-6h-7v6H7.2v-9.1L12 5.9l4.8 4V19Z"/>
        </svg>
      `;

      home.style.cssText = [
        'position:fixed',
        'left:8px',
        'bottom:8px',
        'z-index:2147483647',
        'width:30px',
        'height:30px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:0',
        'border:1px solid #dadce0',
        'border-radius:6px',
        'background:#fff',
        'color:#5f6368',
        'box-shadow:0 2px 8px rgba(0,0,0,.18)',
        'cursor:pointer'
      ].join(';');

      home.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goHome();
      });

      document.documentElement.appendChild(home);
    }

    const allSheets = getAllSheetsButton();

    if (allSheets?.parentElement && home.parentElement !== allSheets.parentElement) {
      allSheets.parentElement.insertBefore(home, allSheets);

      home.style.cssText = [
        'position:relative',
        'left:auto',
        'bottom:auto',
        'z-index:2',
        'width:30px',
        'height:28px',
        'display:inline-flex',
        'vertical-align:top',
        'align-items:center',
        'justify-content:center',
        'padding:0',
        'margin:0 1px 0 0',
        'border:0',
        'border-radius:3px',
        'background:transparent',
        'color:#5f6368',
        'box-shadow:none',
        'cursor:pointer',
        'user-select:none'
      ].join(';');
    }
  }

  function ensurePopup() {
    let popup = document.getElementById(POPUP_ID);
    if (popup) return popup;

    popup = document.createElement('div');
    popup.id = POPUP_ID;

    popup.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'display:none',
      'width:360px',
      'max-height:430px',
      'box-sizing:border-box',
      'background:#fff',
      'border:1px solid #dadce0',
      'border-radius:8px',
      'box-shadow:0 8px 28px rgba(0,0,0,.24)',
      'overflow:hidden',
      'font:13px Arial,sans-serif'
    ].join(';');

    popup.innerHTML = `
      <div style="padding:8px;border-bottom:1px solid #eee;background:#fff;">
        <input type="search"
               autocomplete="off"
               spellcheck="false"
               placeholder="Поиск по листам…"
               style="
                 display:block;
                 box-sizing:border-box;
                 width:100%;
                 height:34px;
                 padding:6px 10px;
                 border:1px solid #1a73e8;
                 border-radius:5px;
                 outline:none;
                 background:#fff;
                 color:#202124;
                 font:13px Arial,sans-serif;
                 box-shadow:0 0 0 1px #1a73e8;
               ">
        <div class="uplink-gs-info"
             style="padding:5px 2px 0;color:#80868b;font-size:11px;"></div>
      </div>
      <div class="uplink-gs-results"
           style="max-height:350px;overflow:auto;padding:4px 0;"></div>
    `;

    document.documentElement.appendChild(popup);

    const input = popup.querySelector('input');

    input.addEventListener('input', () => {
      selectedIndex = 0;
      renderResults();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePopup();
      }
    });

    popup.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    return popup;
  }

  function filteredSheets() {
    const popup = ensurePopup();
    const q = popup.querySelector('input').value;
    return getSheetTabs().filter((x) => smartMatch(x.name, q));
  }

  function markSelected() {
    const popup = ensurePopup();
    const buttons = [...popup.querySelectorAll('.uplink-gs-result')];

    buttons.forEach((btn, i) => {
      btn.style.background = i === selectedIndex ? '#e8f0fe' : '#fff';
    });

    buttons[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function renderResults() {
    const popup = ensurePopup();
    const results = popup.querySelector('.uplink-gs-results');
    const info = popup.querySelector('.uplink-gs-info');

    const all = getSheetTabs();
    const filtered = filteredSheets();

    results.replaceChildren();

    filtered.forEach(({ tab, name, color }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'uplink-gs-result';

      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'width:100%',
        'padding:8px 11px',
        'border:0',
        'background:#fff',
        'color:#202124',
        'text-align:left',
        'font:13px Arial,sans-serif',
        'cursor:pointer',
        'white-space:normal'
      ].join(';');

      const swatch = document.createElement('span');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.cssText = [
        'flex:0 0 10px',
        'width:10px',
        'height:10px',
        'border-radius:50%',
        `background:${color || '#dadce0'}`,
        'box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)'
      ].join(';');

      const label = document.createElement('span');
      label.textContent = name;
      label.style.cssText = 'min-width:0;flex:1 1 auto;';

      btn.append(swatch, label);

      btn.addEventListener('mouseenter', () => {
        selectedIndex = [...results.children].indexOf(btn);
        markSelected();
      });

      btn.addEventListener('click', () => clickSheet(tab));

      results.appendChild(btn);
    });

    info.textContent = `Найдено: ${filtered.length} из ${all.length}`;

    if (selectedIndex >= filtered.length) selectedIndex = Math.max(0, filtered.length - 1);
    markSelected();
  }

  function positionPopup() {
    const popup = ensurePopup();
    const button = getAllSheetsButton();
    if (!button) return;

    const r = button.getBoundingClientRect();
    const width = Math.min(420, Math.max(320, popup.offsetWidth || 360));

    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`;

    popup.style.bottom = `${Math.max(8, innerHeight - r.top + 4)}px`;
    popup.style.top = 'auto';
  }

  function openPopup() {
    const popup = ensurePopup();
    const input = popup.querySelector('input');

    selectedIndex = 0;
    input.value = '';

    renderResults();
    positionPopup();

    popup.style.display = 'block';

    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.select();
    });
  }

  function closePopup() {
    const popup = document.getElementById(POPUP_ID);
    if (popup) popup.style.display = 'none';
  }

  function handleSearchNavigation(e) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup || popup.style.display !== 'block') return;

    const input = popup.querySelector('input');
    if (document.activeElement !== input) return;

    const buttons = [...popup.querySelectorAll('.uplink-gs-result')];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (!buttons.length) return;
      selectedIndex = (selectedIndex + 1) % buttons.length;
      markSelected();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (!buttons.length) return;
      selectedIndex = (selectedIndex - 1 + buttons.length) % buttons.length;
      markSelected();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (!buttons.length) return;

      if (selectedIndex < 0 || selectedIndex >= buttons.length) {
        selectedIndex = 0;
      }

      buttons[selectedIndex].click();
      return;
    }
  }

  // Ловим стрелки раньше Google Sheets, иначе они уедут в таблицу.
  window.addEventListener('keydown', handleSearchNavigation, true);

  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
    document.addEventListener(
      type,
      (e) => {
        const button = e.target.closest?.('.docs-sheet-all-button');
        if (!button) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (type === 'click') {
          const popup = ensurePopup();
          if (popup.style.display === 'block') {
            closePopup();
          } else {
            openPopup();
          }
        }
      },
      true
    );
  }

  document.addEventListener(
    'mousedown',
    (e) => {
      const popup = document.getElementById(POPUP_ID);
      if (!popup || popup.style.display !== 'block') return;

      if (!popup.contains(e.target) && !e.target.closest?.('.docs-sheet-all-button')) {
        closePopup();
      }
    },
    true
  );

  window.addEventListener(
    'resize',
    () => {
      const popup = document.getElementById(POPUP_ID);
      if (popup?.style.display === 'block') positionPopup();
    },
    { passive: true }
  );

  window.addEventListener(
    'scroll',
    () => {
      const popup = document.getElementById(POPUP_ID);
      if (popup?.style.display === 'block') positionPopup();
    },
    { passive: true, capture: true }
  );

  const observer = new MutationObserver(() => {
    ensureHomeButton();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  ensureHomeButton();
  setTimeout(ensureHomeButton, 500);
  setTimeout(ensureHomeButton, 1500);
  setTimeout(ensureHomeButton, 3000);

  console.log('[Uplink Sheets] v11 запущен');
})();
