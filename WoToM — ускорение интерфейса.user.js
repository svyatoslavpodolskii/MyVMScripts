// ==UserScript==
// @name         WoToM — ускорение интерфейса
// @namespace    Violentmonkey Scripts
// @version      4.2.1
// @description  Ускоряет списки заявок WoToM, сокращает перерисовки и оживляет загрузку гифками.
// @author       Svyatoslav Podolskii
// @match        https://wotom.net/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (location.origin !== 'https://wotom.net') return;

  const CONFIG = {
    debug: false,

    toolbarDelay: 200,

    rebuildDelay: 20,

    // После 35 карточек отдаём браузеру кадр. Гифке тоже хочется жить.
    renderChunk: 35,

    patchInterval: 60,

    patchDuration: 10000
  };

  const LOADERS = [
    'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMWNmNGJwdzUwaXhsZDQ2Mmgzc21wa2g2NTF6OTU2cnBqMGl1N3gwdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/pY8jLmZw0ElqvVeRH4/giphy.gif',

    'https://i.giphy.com/pVXyJy2k7WO1n49bGg.webp',

    'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjdjdms2ejRxanZ3YXQ2ZnhxMGEyaG9yanBpdGpyZXZkNWZxdGkwayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3R3gNcy4EwMR9Lj3jz/giphy.gif',

    'https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWwxY3hpdGN4eHkyZHdwazR0dGJmbDZnenMzOHZrYWx1eDF5M2trMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4E4KqxulO9JtRF8s6T/giphy.gif',

    'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHNtbmcwaDRhaDl5dmppazdidmtvZ2hiOGxyZDFsbnA3dmRpZ3k1dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/SlQaRzPiFv7EjNd54k/giphy.gif',

    'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExa3pjYzF6ZzIxNWwxb2kydTNhbG5xMmFrMzd0aGVnbW8wanc1cjBxciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3y0oCOkdKKRi0/giphy.gif',

    'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTBtMWJ4cDF6Z3RudWxkMGpma2VyZ3doam1jaDh4bTAwb3J6ZGN0dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3nWhI38IWDofyDrW/giphy.gif',

    'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHZhNHJ0dGk2Zzl1eDFxZndlbDc4aXB5bmE0bGdocWFiZWw1bmRzdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/JMO0yh1HZDXRDt2hZ5/giphy.gif',

    'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2FzaHduYnZhdWc2N3l2a3U1ZnNjd2p3N245MHJscXc2dGgwZ3NvMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/0ir1L49oHy46pvFQvD/giphy.gif',

    'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExYmFvYzdreDhjc2JqeGtmZTB2NTRsNDM4bzluZ2s5am41NmFoNGNoNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/wrmVCNbpOyqgJ9zQTn/giphy.gif',

    'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNnY1aTMzbjZqeGs5NjIxeHhrMnZjbnNjb3JzOW1vZmxzZ2I5eWE5biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4CfKAYxFMDjSmLGDGC/giphy.gif',

    'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWc3aGJ2d3Fjd282YzlteWhoMWhwbm03bHN4dnlsa3hvb2RpYzY3NyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/5lAZ5eKPG20x2erXtT/giphy.gif'
  ];

  let lastLoaderIndex = -1;

  function randomLoader() {
    if (LOADERS.length === 1) {
      return LOADERS[0];
    }

    let index;

    do {
      index = Math.floor(Math.random() * LOADERS.length);
    } while (index === lastLoaderIndex);

    lastLoaderIndex = index;

    return LOADERS[index];
  }

  function isOurLoader(src) {
    return !!src && LOADERS.includes(src);
  }

  const realLog = console.log.bind(console);

  // При debug=false глушим console.log всей страницы, кроме сообщений оптимизатора.

  console.log = function (...args) {
    if (CONFIG.debug || (typeof args[0] === 'string' && args[0].startsWith('[WOTOM-OPT]'))) {
      realLog(...args);
    }
  };

  function debug(...args) {
    if (!CONFIG.debug) {
      return;
    }

    realLog('[WOTOM-OPT]', ...args);
  }

  const CSS = `

        #tvLockScreenDiv,
        #supLockScreenDiv,
        #msgbboxdiv,
        .ubCallNotifyElement,
        .uiChatNotifyBlock {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }


        #tvLockScreenDiv,
        #supLockScreenDiv {
            transition: none !important;
        }


        .delayed {
            transition-duration: .08s !important;
        }


        .delayed3 {
            transition-duration: .06s !important;
        }


        .supHoverTile {
            transition-duration: .06s !important;
        }


        .sidebar {
            transition: width .10s ease !important;
        }


        

        .tsTileFilterDiv,
        .conTileFilterDiv {
            contain: layout style paint;
        }


        

        @supports (content-visibility: auto) {

            .tsTileFilterDiv,
            .conTileFilterDiv {
                content-visibility: auto;
                contain-intrinsic-size: auto 220px;
            }
        }


        #techsup_container,
        #connects_container {
            overscroll-behavior: contain;
            scrollbar-gutter: stable;
        }


        

        #supListContainer_scheduled .supRedBlinker,
        #conListContainer_scheduled .supRedBlinker {
            animation: none !important;
            background: none !important;
        }


        .blink-green-bg {
            animation: none !important;
            background-color: #2e7d32 !important;
        }

    `;

  function injectCSS() {
    if (!document.documentElement) {
      setTimeout(injectCSS, 0);

      return;
    }

    if (document.getElementById('wotomOptimizerCSS')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'wotomOptimizerCSS';

    style.textContent = CSS;

    (document.head || document.documentElement).appendChild(style);
  }

  injectCSS();

  function nextFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function yieldToBrowser() {
    try {
      if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
        await globalThis.scheduler.yield();

        return;
      }
    } catch (_) {}

    await nextFrame();
  }

  function has(cname, value) {
    return cname.indexOf(value) !== -1;
  }

  function active(id) {
    try {
      if (typeof window.supIsButtonActive === 'function') {
        return !!window.supIsButtonActive(id);
      }
    } catch (_) {}

    const element = document.getElementById(id);

    return !!(element && element.className.includes('ttActive'));
  }

  function selectedRegions() {
    try {
      if (typeof window.supGetSelectedRegions === 'function') {
        const list = window.supGetSelectedRegions();

        return Array.isArray(list) ? list : [];
      }
    } catch (_) {}

    return [];
  }

  function getTileRegion(cname) {
    try {
      if (typeof window.supGetTileRegion === 'function') {
        return window.supGetTileRegion(cname);
      }
    } catch (_) {}

    return '';
  }

  function isTileInCat(cname, cats) {
    try {
      if (typeof window.supIsTileInCat === 'function') {
        return !!window.supIsTileInCat(cname, cats);
      }
    } catch (_) {}

    return true;
  }

  // Оцениваем высоту без временной вставки в DOM: меньше поводов для пересчёта layout.

  const elementHeightCache = new WeakMap();

  function estimateTicketElement(inner) {
    if (!inner) {
      return 0;
    }

    const cached = elementHeightCache.get(inner);

    if (cached !== undefined) {
      return cached;
    }

    const text = (inner.textContent || '').replace(/\s+/g, ' ').trim();

    const breakCount = inner.querySelectorAll ? inner.querySelectorAll('br').length : 0;

    const blockCount = inner.querySelectorAll ? inner.querySelectorAll('div,p,li').length : 0;

    const estimatedLines = Math.ceil(text.length / 105) + breakCount + Math.min(blockCount, 5);

    const height = text.length < 650 && estimatedLines <= 7 ? 100 : 200;

    elementHeightCache.set(inner, height);

    return height;
  }

  const stringHeightCache = new Map();

  function fastTicketHeight(html) {
    if (!html) {
      return 0;
    }

    const cached = stringHeightCache.get(html);

    if (cached !== undefined) {
      return cached;
    }

    const source = String(html);

    const breaks = (source.match(/<br\s*\/?>/gi) || []).length;

    const blocks = (source.match(/<\/(?:div|p|li)>/gi) || []).length;

    const text = source
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();

    const estimatedLines = Math.ceil(text.length / 105) + breaks + Math.min(blocks, 5);

    const result = text.length < 650 && estimatedLines <= 7 ? 100 : 200;

    if (stringHeightCache.size > 1500) {
      stringHeightCache.clear();
    }

    stringHeightCache.set(html, result);

    return result;
  }

  function processRoller(tile) {
    const inner = tile.querySelector('.tileInnerBlock');

    const roller = tile.querySelector('.tileRoller');

    if (!inner || !roller) {
      return;
    }

    if (estimateTicketElement(inner) <= 150) {
      roller.style.display = 'none';
    } else {
      if (roller.style.display === 'none') {
        roller.style.display = '';
      }
    }
  }

  function getScheduledStamp(cname, prefix) {
    const regex = new RegExp(prefix + '_scheduled_(\\d+)');

    const match = cname.match(regex);

    return match ? Number(match[1]) : 0;
  }

  function idTimestamp(element) {
    const id = element.id || '';

    const slash = id.lastIndexOf('/');

    let value = slash >= 0 ? id.slice(slash + 1) : id;

    const dot = value.indexOf('.');

    if (dot !== -1) {
      value = value.slice(0, dot);
    }

    const number = parseFloat(value);

    return Number.isFinite(number) ? number : 0;
  }

  function tileGroup(tile, prefix) {
    const cname = tile.className || '';

    // У WoToM «запланировано» — это ближайшие 120 минут.

    if (!has(cname, prefix + '_scheduled_0') && !has(cname, prefix + '_state_done')) {
      const scheduled = getScheduledStamp(cname, prefix);

      const now = Math.floor(Date.now() / 1000);

      if (scheduled && scheduled < now + 120 * 60) {
        return 'scheduled';
      }
    }

    if (has(cname, prefix + '_pinned_1')) {
      return 'pins';
    }

    if (has(cname, prefix + '_prior_h')) {
      return 'high';
    }

    if (has(cname, prefix + '_prior_s')) {
      return 'standart';
    }

    if (has(cname, prefix + '_prior_l')) {
      return 'low';
    }

    return 'unknown';
  }

  function getFilterState(mode) {
    const state = {
      city: document.getElementById('tsBar_city')?.value || '_ALL',

      selectedCat: document.getElementById('tbSelectedCat')?.value || '',

      regions: selectedRegions(),

      inet: active('tbInetTickets'),

      tv: active('tbTVTickets'),

      done: active('tbDoneItems'),

      working: active('tbWorkingItems'),

      queued: active('tbQueueItems'),

      idle: active('tbItems'),

      future: active('tbFutureItems'),

      internal: active('tbInternalItems'),

      external: active('tbExternalItems')
    };

    if (mode === 'sup') {
      state.misc = active('tbMiscTickets');
    } else {
      state.biz = active('tbBizTickets');

      state.connects = active('tbConnects');

      state.moves = active('tbMoves');

      state.prep = active('tbPrepItems');
    }

    return state;
  }

  function processSupportTile(tile, state, finalDayStamp) {
    const cname = tile.className;

    let visType = false;

    let visState = false;

    let visEType = false;

    let visFuture = true;

    let visRegion = state.regions.length === 0;

    if (state.inet && has(cname, 'tsTile_type_inet')) {
      visType = true;
    }

    if (state.tv && has(cname, 'tsTile_type_tv')) {
      visType = true;
    }

    if (state.misc && has(cname, 'tsTile_type_geo')) {
      visType = true;
    }

    if (state.done && has(cname, 'tsTile_state_done')) {
      visState = true;
    }

    if (state.working && has(cname, 'tsTile_state_inprogress')) {
      visState = true;
    }

    if (state.queued && has(cname, 'tsTile_state_queued')) {
      visState = true;
    }

    if (state.idle && has(cname, 'tsTile_state_idle')) {
      visState = true;
    }

    if (state.internal && has(cname, 'tsTile_etype_call')) {
      visEType = true;
    }

    if (state.external && has(cname, 'tsTile_etype_support')) {
      visEType = true;
    }

    if (state.regions.length) {
      const region = getTileRegion(cname);

      visRegion = state.regions.includes(region);
    }

    if (!state.future) {
      const stamp = getScheduledStamp(cname, 'tsTile');

      if (stamp && stamp > finalDayStamp) {
        visFuture = false;
      }
    }

    const visCity = state.city === '_ALL' || has(cname, 'tsTile_city_' + state.city);

    const visCat = isTileInCat(cname, state.selectedCat);

    const visible = visType && visCity && visState && visCat && visEType && visFuture && visRegion;

    tile.style.display = visible ? '' : 'none';

    processRoller(tile);
  }

  function processConnectionTile(tile, state, finalDayStamp) {
    const cname = tile.className;

    let visType = false;

    let visState = false;

    let visSrv = false;

    let visFuture = true;

    let visRegion = state.regions.length === 0;

    if (state.inet && has(cname, 'conTile_type_inet')) {
      visType = true;
    }

    if (state.tv && has(cname, 'conTile_type_tv')) {
      visType = true;
    }

    if (state.biz && has(cname, 'conTile_type_corp')) {
      visType = true;
    }

    if (state.connects && has(cname, 'conTile_srvtype_connect')) {
      visSrv = true;
    }

    if (state.moves && has(cname, 'conTile_srvtype_move')) {
      visSrv = true;
    }

    if (state.done && has(cname, 'conTile_state_done')) {
      visState = true;
    }

    if (state.working && has(cname, 'conTile_state_inprogress')) {
      visState = true;
    }

    if (state.queued && has(cname, 'conTile_state_queued')) {
      visState = true;
    }

    if (state.idle && has(cname, 'conTile_state_idle')) {
      visState = true;
    }

    if (state.prep && has(cname, 'conTile_state_prep')) {
      visState = true;
    }

    if (state.regions.length) {
      const region = getTileRegion(cname);

      visRegion = state.regions.includes(region);
    }

    if (!state.future) {
      const stamp = getScheduledStamp(cname, 'conTile');

      if (stamp && stamp > finalDayStamp) {
        visFuture = false;
      }
    }

    const visCity = state.city === '_ALL' || has(cname, 'conTile_city_' + state.city);

    const visible = visType && visCity && visState && visFuture && visSrv && visRegion;

    tile.style.display = visible ? '' : 'none';

    processRoller(tile);
  }

  async function processTiles(tiles, mode, state) {
    const endOfDay = new Date();

    endOfDay.setHours(23, 59, 59, 999);

    const finalDayStamp = Math.floor(endOfDay.getTime() / 1000);

    for (let i = 0; i < tiles.length; i++) {
      if (mode === 'sup') {
        processSupportTile(tiles[i], state, finalDayStamp);
      } else {
        processConnectionTile(tiles[i], state, finalDayStamp);
      }

      if (i > 0 && i % CONFIG.renderChunk === 0) {
        await yieldToBrowser();
      }
    }
  }

  function detachedGetById(root, id) {
    if (typeof root.getElementById === 'function') {
      return root.getElementById(id);
    }

    return Array.from(root.querySelectorAll('[id]')).find((element) => element.id === id) || null;
  }

  function sortDetachedContainer(parent, selector, scheduled, prefix) {
    if (!parent) {
      return;
    }

    const items = Array.from(parent.querySelectorAll(':scope > ' + selector));

    if (items.length < 2) {
      return;
    }

    if (scheduled) {
      items.sort(
        (a, b) => getScheduledStamp(a.className, prefix) - getScheduledStamp(b.className, prefix)
      );
    } else {
      items.sort((a, b) => idTimestamp(b) - idTimestamp(a));
    }

    // Собираем дерево вне страницы; браузер пока не пересчитывает её раскладку.

    for (const item of items) {
      parent.appendChild(item);
    }
  }

  function organizeDetached(root, mode) {
    const isSupport = mode === 'sup';

    const selector = isSupport ? '.tsTileFilterDiv' : '.conTileFilterDiv';

    const prefix = isSupport ? 'tsTile' : 'conTile';

    const base = isSupport ? 'supListContainer_' : 'conListContainer_';

    const tiles = Array.from(root.querySelectorAll(selector));

    for (const tile of tiles) {
      const group = tileGroup(tile, prefix);

      if (group === 'unknown') {
        continue;
      }

      const target = detachedGetById(root, base + group);

      if (target && tile.parentElement !== target) {
        target.appendChild(tile);
      }
    }

    const groups = ['scheduled', 'pins', 'high', 'standart', 'low'];

    for (const group of groups) {
      const parent = detachedGetById(root, base + group);

      sortDetachedContainer(parent, selector, group === 'scheduled', prefix);
    }
  }

  function liveSort(mode, ids = '') {
    const isSupport = mode === 'sup';

    const base = isSupport ? 'supListContainer_' : 'conListContainer_';

    const selector = isSupport ? '.tsTileFilterDiv' : '.conTileFilterDiv';

    const prefix = isSupport ? 'tsTile' : 'conTile';

    let groups = ['scheduled', 'pins', 'high', 'standart', 'low'];

    // При частичном CRC-обновлении сортируем только затронутые категории.

    if (ids) {
      const found = new Set();

      for (const item of ids.split(';')) {
        const colon = item.lastIndexOf(':');

        if (colon === -1) {
          continue;
        }

        const group = item.slice(colon + 1).trim();

        if (group) {
          found.add(group);
        }
      }

      if (found.size) {
        groups = Array.from(found);
      }
    }

    for (const group of groups) {
      const parent = document.getElementById(base + group);

      if (!parent) {
        continue;
      }

      const items = Array.from(parent.querySelectorAll(':scope > ' + selector));

      if (items.length < 2) {
        continue;
      }

      if (group === 'scheduled') {
        items.sort(
          (a, b) => getScheduledStamp(a.className, prefix) - getScheduledStamp(b.className, prefix)
        );
      } else {
        items.sort((a, b) => idTimestamp(b) - idTimestamp(a));
      }

      const fragment = document.createDocumentFragment();

      for (const item of items) {
        fragment.appendChild(item);
      }

      parent.appendChild(fragment);
    }
  }

  const renderQueues = {
    sup: {
      running: false,
      pending: null,
      original: null
    },

    con: {
      running: false,
      pending: null,
      original: null
    }
  };

  async function renderOptimizedCore(data, mode) {
    const containerId = mode === 'sup' ? 'techsup_container' : 'connects_container';

    const tileSelector = mode === 'sup' ? '.tsTileFilterDiv' : '.conTileFilterDiv';

    const container = document.getElementById(containerId);

    if (!container) {
      throw new Error('WoToM container not found: ' + containerId);
    }

    const scrollPosition = container.scrollTop;

    // Даём загрузчику хотя бы один выход на сцену перед разбором HTML.

    await yieldToBrowser();

    const template = document.createElement('template');

    template.innerHTML = String(data);

    const fragment = template.content;

    await yieldToBrowser();

    const tiles = Array.from(fragment.querySelectorAll(tileSelector));

    const state = getFilterState(mode);

    await processTiles(tiles, mode, state);

    organizeDetached(fragment, mode);

    await yieldToBrowser();

    container.replaceChildren(fragment);

    container.scrollTop = scrollPosition;

    await yieldToBrowser();

    if (mode === 'sup') {
      try {
        window.supCountElements?.();
      } catch (_) {}

      try {
        window.supSortSchElements?.();
      } catch (_) {}
    } else {
      try {
        window.conCountElements?.();
      } catch (_) {}

      try {
        window.conSortSchElements?.();
      } catch (_) {}
    }
  }

  async function runRenderQueue(data, mode) {
    const queue = renderQueues[mode];

    // Пока идёт отрисовка, храним только самый свежий ответ.

    if (queue.running) {
      queue.pending = data;

      return;
    }

    queue.running = true;

    let currentData = data;

    try {
      while (currentData !== null) {
        queue.pending = null;

        let useFallback = false;

        try {
          try {
            if (typeof window.supScreenLock === 'function') {
              window.supScreenLock();
            }
          } catch (_) {}

          await renderOptimizedCore(currentData, mode);
        } catch (error) {
          useFallback = true;

          debug('Optimized render failed:', mode, error);
        } finally {
          // Снимаем блокировку даже при ошибке. Вечная загрузка — жанр не наш.

          try {
            window.supScreenUnlock?.();
          } catch (_) {}
        }

        if (useFallback && typeof queue.original === 'function') {
          debug('Using original renderer:', mode);

          try {
            // Штатный рендер сам включает и снимает блокировку экрана.

            queue.original(currentData);
          } catch (originalError) {
            debug('Original renderer failed:', originalError);

            try {
              window.supScreenUnlock?.();
            } catch (_) {}
          }
        }

        currentData = queue.pending;

        if (currentData !== null) {
          await yieldToBrowser();
        }
      }
    } finally {
      queue.running = false;

      try {
        window.supScreenUnlock?.();
      } catch (_) {}
    }
  }

  function optimizedSupRender(data) {
    runRenderQueue(data, 'sup');
  }

  function optimizedConRender(data) {
    runRenderQueue(data, 'con');
  }

  function loaderType(img) {
    const src = img.getAttribute('src') || '';

    if (src.includes('/_modules/subdep/img/fetchImg.png')) {
      return 'fetch';
    }

    if (src.includes('/_modules/subdep/img/loader.gif')) {
      return 'loader';
    }

    if (img.closest?.('#tvLockScreenDiv, #supLockScreenDiv') && !isOurLoader(src)) {
      return 'screen';
    }

    return null;
  }

  function shouldSkipHiddenLoader(img, type) {
    // У fetchImg сохраняем размер 1×1 и opacity: 0.

    if (type === 'fetch') {
      return false;
    }

    // Скрытые загрузчики не трогаем. Сотня гифок — уже дискотека.

    if (img.hidden || img.style.display === 'none') {
      return true;
    }

    return false;
  }

  function replaceLoader(img) {
    if (!(img instanceof HTMLImageElement)) {
      return;
    }

    const src = img.getAttribute('src');

    if (!src || isOurLoader(src)) {
      return;
    }

    const type = loaderType(img);

    if (!type) {
      return;
    }

    if (shouldSkipHiddenLoader(img, type)) {
      return;
    }

    img.dataset.wotomOriginalLoader = type;

    img.dataset.wotomRandomLoader = '1';

    if (
      type === 'screen' &&
      img.style.opacity !== '0' &&
      img.style.width !== '1px' &&
      img.style.height !== '1px'
    ) {
      if (!img.style.width && !img.getAttribute('width')) {
        img.style.width = '128px';
      }

      if (!img.style.height && !img.getAttribute('height')) {
        img.style.height = '128px';
      }

      img.style.objectFit = 'contain';
    }

    try {
      img.decoding = 'async';
    } catch (_) {}

    img.setAttribute('src', randomLoader());
  }

  function scanLoaders(root) {
    if (!root) {
      return;
    }

    if (root instanceof HTMLImageElement) {
      replaceLoader(root);
    }

    if (!root.querySelectorAll) {
      return;
    }

    root
      .querySelectorAll(
        [
          'img[src*="/_modules/subdep/img/loader.gif"]',
          'img[src*="/_modules/subdep/img/fetchImg.png"]',
          '#tvLockScreenDiv img',
          '#supLockScreenDiv img'
        ].join(',')
      )
      .forEach(replaceLoader);
  }

  function startLoaderObserver() {
    if (!document.documentElement) {
      setTimeout(startLoaderObserver, 0);

      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (mutation.target instanceof HTMLImageElement) {
            replaceLoader(mutation.target);
          }

          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }

          scanLoaders(node);

          optimizeImages(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,

      childList: true,

      attributes: true,

      // Подставляем GIF, только когда скрытый загрузчик стал видимым.

      attributeFilter: ['src', 'style', 'hidden']
    });
  }

  startLoaderObserver();

  function optimized(fn) {
    try {
      Object.defineProperty(fn, '__wotomOptimized', {
        value: true
      });
    } catch (_) {
      try {
        fn.__wotomOptimized = true;
      } catch (_) {}
    }

    return fn;
  }

  function patch(name, factory) {
    const original = window[name];

    if (typeof original !== 'function' || original.__wotomOptimized) {
      return false;
    }

    try {
      const replacement = factory(original);

      if (typeof replacement !== 'function') {
        return false;
      }

      window[name] = optimized(replacement);

      debug('patched', name);

      return true;
    } catch (error) {
      debug('patch failed', name, error);

      return false;
    }
  }

  function patchScreen(name, id) {
    patch(name, (original) => {
      return function (...args) {
        const result = original.apply(this, args);

        const lock = document.getElementById(id);

        if (lock) {
          lock.style.backdropFilter = 'none';

          lock.style.webkitBackdropFilter = 'none';

          lock.style.transition = 'none';

          scanLoaders(lock);
        }

        return result;
      };
    });
  }

  function patchToolbar() {
    patch('saveToolbarParams', (original) => {
      let timer = null;

      let lastContext = null;

      let lastArgs = null;

      return function (...args) {
        lastContext = this;

        lastArgs = args;

        clearTimeout(timer);

        timer = setTimeout(() => {
          timer = null;

          original.apply(lastContext, lastArgs);
        }, CONFIG.toolbarDelay);
      };
    });
  }

  function patchRebuild(name) {
    patch(name, (original) => {
      let timer = null;

      let lastContext = null;

      let lastArgs = null;

      return function (...args) {
        // Вызов с true приходит из WoToM: выполняем сразу, без очереди.

        if (args[0] === true) {
          return original.apply(this, args);
        }

        lastContext = this;

        lastArgs = args;

        clearTimeout(timer);

        timer = setTimeout(() => {
          timer = null;

          original.apply(lastContext, lastArgs);
        }, CONFIG.rebuildDelay);
      };
    });
  }

  function patchCounter(name) {
    patch(name, (original) => {
      let queued = false;

      let lastContext = null;

      let lastArgs = null;

      return function (...args) {
        lastContext = this;

        lastArgs = args;

        if (queued) {
          return;
        }

        queued = true;

        requestAnimationFrame(() => {
          queued = false;

          original.apply(lastContext, lastArgs);
        });
      };
    });
  }

  function applyPatches() {
    patch('supRenderList', (original) => {
      renderQueues.sup.original = original;

      return optimizedSupRender;
    });

    patch('conRenderList', (original) => {
      renderQueues.con.original = original;

      return optimizedConRender;
    });

    patch('supGetTicketTextHeight', () => fastTicketHeight);

    patch('conGetTicketTextHeight', () => fastTicketHeight);

    patch('supSortTicketList', () => {
      return function (ids) {
        liveSort('sup', ids || '');
      };
    });

    patch('conSortTicketList', () => {
      return function (ids) {
        liveSort('con', ids || '');
      };
    });

    patch('supSortTicketList_sch', () => {
      return function () {
        liveSort('sup', 'dummy:scheduled');
      };
    });

    patch('conSortTicketList_sch', () => {
      return function () {
        liveSort('con', 'dummy:scheduled');
      };
    });

    patchScreen('uiScreenLock', 'tvLockScreenDiv');

    patchScreen('supScreenLock', 'supLockScreenDiv');

    patchToolbar();

    patchRebuild('supRenderRebuild');

    patchRebuild('conRenderRebuild');

    patchCounter('supCountElements');

    patchCounter('conCountElements');
  }

  const PATCH_TARGETS = [
    'supRenderList',
    'conRenderList',
    'supGetTicketTextHeight',
    'conGetTicketTextHeight',
    'supSortTicketList',
    'conSortTicketList',
    'supSortTicketList_sch',
    'conSortTicketList_sch',
    'uiScreenLock',
    'supScreenLock',
    'saveToolbarParams',
    'supRenderRebuild',
    'conRenderRebuild',
    'supCountElements',
    'conCountElements'
  ];

  function allPatchesReady() {
    return PATCH_TARGETS.every(
      (name) => typeof window[name] === 'function' && window[name].__wotomOptimized
    );
  }

  const patchStart = performance.now();

  const patchTimer = setInterval(() => {
    applyPatches();

    if (allPatchesReady() || performance.now() - patchStart > CONFIG.patchDuration) {
      clearInterval(patchTimer);

      debug(allPatchesReady() ? 'All patches ready; patch loop stopped' : 'Patch window expired');
    }
  }, CONFIG.patchInterval);

  applyPatches();

  function optimizeImages(root) {
    if (!root) {
      return;
    }

    if (root instanceof HTMLImageElement) {
      if (root.dataset.wotomRandomLoader !== '1') {
        try {
          root.decoding = 'async';
        } catch (_) {}
      }
    }

    if (!root.querySelectorAll) {
      return;
    }

    const images = root.querySelectorAll('img');

    for (const img of images) {
      if (img.dataset.wotomRandomLoader === '1') {
        continue;
      }

      try {
        img.decoding = 'async';
      } catch (_) {}
    }
  }

  function startGeneralObserver() {
    if (!document.documentElement) {
      setTimeout(startGeneralObserver, 0);

      return;
    }

    let queue = [];

    let scheduled = false;

    function flush() {
      scheduled = false;

      const nodes = queue;

      queue = [];

      for (const node of nodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        if (node instanceof HTMLImageElement) {
          try {
            node.decoding = 'async';
          } catch (_) {}
        }

        optimizeImages(node);
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          queue.push(node);
        }
      }

      if (!scheduled) {
        scheduled = true;

        requestAnimationFrame(flush);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Общий обход уже делает startLoaderObserver; второй наблюдатель не запускаем.

  // Подбираем зависшую блокировку, если отрисовка уже закончилась.

  setInterval(() => {
    const lock = document.getElementById('supLockScreenDiv');

    if (!lock) {
      return;
    }

    if (!renderQueues.sup.running && !renderQueues.con.running) {
      try {
        window.supScreenUnlock?.();
      } catch (_) {}
    }
  }, 2000);

  function ready() {
    applyPatches();

    scanLoaders(document);

    optimizeImages(document);

    debug('WoToM Optimizer 4.2 active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, {
      once: true
    });
  } else {
    ready();
  }
})();
