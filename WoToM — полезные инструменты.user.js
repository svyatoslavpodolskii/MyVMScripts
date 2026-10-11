// ==UserScript==
// @name         WoToM — полезные инструменты
// @namespace    uplink-wotom-utilities
// @version      1.0.0
// @description  Дата заявок в 24-часовом формате и обновление активной карточки договора.
// @author       Svyatoslav Podolskii
// @homepageURL  https://github.com/svyatoslavpodolskii/MyVMScripts
// @supportURL   https://github.com/svyatoslavpodolskii/MyVMScripts/issues
// @updateURL    https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/WoToM%20%E2%80%94%20%D0%BF%D0%BE%D0%BB%D0%B5%D0%B7%D0%BD%D1%8B%D0%B5%20%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B.user.js
// @downloadURL  https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/WoToM%20%E2%80%94%20%D0%BF%D0%BE%D0%BB%D0%B5%D0%B7%D0%BD%D1%8B%D0%B5%20%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B.user.js
// @match        https://wotom.net/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const KEY = 'wotom-utilities:24h';
  let enabled = false;
  try {
    enabled = localStorage.getItem(KEY) === 'true';
  } catch (_) {}
  const fields = new WeakMap();
  let timer;
  let busy = false;

  function toLocal(value) {
    const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return '';
    const [, day, month, year, hour, minute, second = '00'] = match;
    const date = new Date(0);
    date.setFullYear(+year, +month - 1, +day);
    date.setHours(+hour, +minute, +second, 0);
    if (
      +year < 1 ||
      date.getFullYear() !== +year ||
      date.getMonth() !== +month - 1 ||
      date.getDate() !== +day ||
      +hour > 23 ||
      +minute > 59 ||
      +second > 59
    )
      return '';
    return `${year}-${month}-${day}T${hour}:${minute}${match[6] ? ':' + second : ''}`;
  }

  function fromLocal(value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}(?::\d{2})?)/);
    return match ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}` : '';
  }

  function installDate(native) {
    if (fields.has(native)) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'wtu-date';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '24 ч';
    toggle.title = 'Дата ДД.ММ.ГГГГ и время ЧЧ:ММ';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'ДД.ММ.ГГГГ ЧЧ:ММ';
    input.setAttribute('aria-label', 'Планирование: дата и время в 24-часовом формате');
    input.autocomplete = 'off';
    const display = native.style.display;
    native.before(wrapper);
    wrapper.append(toggle, native, input);
    const state = { native, input, toggle, display };
    fields.set(native, state);

    function sync() {
      input.value = fromLocal(native.value);
      input.setCustomValidity('');
    }
    native.addEventListener('input', sync);
    native.addEventListener('change', sync);
    input.addEventListener('input', () => {
      const value = input.value.trim();
      const parsed = value ? toLocal(value) : '';
      input.setCustomValidity(
        value && !parsed ? 'Введите существующую дату и время: ДД.ММ.ГГГГ ЧЧ:ММ' : ''
      );
      if (value && !parsed) return;
      native.value = parsed;
      if (!native.validity.valid) {
        input.setCustomValidity('Дата не соответствует ограничениям планирования.');
        return;
      }
      native.dispatchEvent(new Event('input', { bubbles: true }));
      native.dispatchEvent(new Event('change', { bubbles: true }));
    });
    toggle.addEventListener('click', () => {
      if (enabled && !input.reportValidity()) return;
      enabled = !enabled;
      try {
        localStorage.setItem(KEY, String(enabled));
      } catch (_) {}
      document
        .querySelectorAll('[id="newTick_Schedule"]')
        .forEach((node) => applyDate(fields.get(node)));
    });
    applyDate(state);
  }

  function applyDate(state) {
    if (!state) return;
    state.input.value = fromLocal(state.native.value);
    state.input.hidden = !enabled;
    state.native.style.display = enabled ? 'none' : state.display;
    state.toggle.setAttribute('aria-pressed', String(enabled));
  }

  function activeTile() {
    const roots = [...document.querySelectorAll('[id="userSearchContainer"]')].filter(
      (root) => root.getClientRects().length
    );
    // Вкладка «История» может скрывать плитку, но выбранный договор остаётся тем же.
    const tiles = roots
      .flatMap((root) => [...root.querySelectorAll('.vgTileSelected[onclick]')])
      .filter((tile) => /^\s*loadSearchDNum\s*\(/.test(tile.getAttribute('onclick') || ''));
    return tiles.length === 1 ? tiles[0] : null;
  }

  function scan() {
    document.querySelectorAll('[id="newTick_Schedule"]').forEach(installDate);
    if (!document.getElementById('wtu-refresh')) {
      const button = document.createElement('button');
      button.id = 'wtu-refresh';
      button.type = 'button';
      button.textContent = '↻ Карточка';
      button.addEventListener('click', async () => {
        const tile = activeTile();
        if (!tile || busy) return;
        const id = (tile.getAttribute('onclick') || '').match(
          /^\s*loadSearchDNum\s*\(\s*(['"])([^'"]+)\1\s*\)\s*;?\s*$/
        )?.[2];
        if (!id || typeof window.loadSearchDNum !== 'function') return;
        busy = true;
        button.disabled = true;
        try {
          await window.loadSearchDNum(id);
        } catch (error) {
          console.error('[WoToM Utilities] Обновление карточки:', error);
        } finally {
          busy = false;
          scan();
        }
      });
      document.body.append(button);
    }
    const button = document.getElementById('wtu-refresh');
    const tile = activeTile();
    button.disabled = busy || !tile;
    button.title = tile
      ? `Обновить выбранный договор: ${tile.textContent.trim().replace(/\s+/g, ' ')}`
      : 'Откройте карточку и выберите договор';
  }

  const style = document.createElement('style');
  style.textContent = `
    .wtu-date { display:flex; align-items:center; gap:6px; }
    .wtu-date input { flex:1; min-width:0; width:100%; box-sizing:border-box; }
    .wtu-date input:invalid { outline:2px solid #d55; }
    .wtu-date button, #wtu-refresh { color:var(--modColor,#263238); background:var(--modBGColor,#eee); border:1px solid currentColor; border-radius:5px; padding:5px 8px; cursor:pointer; }
    .wtu-date button[aria-pressed="true"] { box-shadow:inset 0 0 0 2px currentColor; }
    #wtu-refresh { position:fixed; right:16px; top:52px; z-index:4055; font-size:12px; }
    #wtu-refresh:disabled { opacity:.5; cursor:default; }
  `;
  document.head.append(style);
  document.addEventListener(
    'click',
    (event) => {
      const action = event.target.closest('[onclick]');
      if (
        !enabled ||
        !action ||
        !/\bsup(?:CreateFastTicket|CreateTicket|SaveTicket|AppendTicket)\s*\(/.test(
          action.getAttribute('onclick') || ''
        )
      )
        return;
      const form = action.closest('#newSupportForm, #userSearchContainer') || document;
      const invalid = [...form.querySelectorAll('.wtu-date input[type="text"]')].find(
        (input) => !input.hidden && !input.validity.valid
      );
      if (invalid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        invalid.reportValidity();
      }
    },
    true
  );
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 100);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  scan();
})();
