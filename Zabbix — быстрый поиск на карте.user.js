// ==UserScript==
// @name         Zabbix — быстрый поиск на карте
// @namespace    uplink.kz
// @version      4.0.4
// @description  Локальный поиск по узлам текущей группы iMap с сохранением снимка группы.
// @author       Svyatoslav Podolskii
// @homepageURL  https://github.com/svyatoslavpodolskii/MyVMScripts
// @supportURL   https://github.com/svyatoslavpodolskii/MyVMScripts/issues
// @updateURL    https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/Zabbix%20%E2%80%94%20%D0%B1%D1%8B%D1%81%D1%82%D1%80%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%BD%D0%B0%20%D0%BA%D0%B0%D1%80%D1%82%D0%B5.user.js
// @downloadURL  https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/Zabbix%20%E2%80%94%20%D0%B1%D1%8B%D1%81%D1%82%D1%80%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%BD%D0%B0%20%D0%BA%D0%B0%D1%80%D1%82%D0%B5.user.js
// @include      http://109.248.236.92:18002/zabbix/imap.php*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;
  if (location.origin !== 'http://109.248.236.92:18002' || location.pathname !== '/zabbix/imap.php')
    return;

  const CFG = {
    INPUT: '#search_hosts_list input',
    LIST: '#hosts_list',
    ITEM: '.host_in_list',
    GROUP: '#hostgroupid',

    DB_NAME: 'uplink_imap_fast_cache_v4',
    DB_VERSION: 1,
    STORE: 'groups',

    WATCH_MS: 120,
    SAVE_IDLE_TIMEOUT: 1200
  };

  let inputEl = null;
  let groupEl = null;

  let allEntries = [];
  let entryById = new Map();

  let currentIds = new Set();
  let currentEntries = [];

  let currentGroupId = '';
  let currentGroupName = '';

  let lastMarkersSignature = '';
  let lastGroupId = '';

  let lastQuery = '';
  let lastMatches = [];

  let pendingQuery = '';
  let rafId = 0;

  let dbPromise = null;
  let initialized = false;

  function normalize(text) {
    return String(text || '')
      .toLocaleLowerCase('ru')
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitTokens(text) {
    const n = normalize(text);
    return n ? n.split(' ') : [];
  }

  function entryMatches(entry, tokens) {
    const hay = entry.norm;

    for (let i = 0; i < tokens.length; i++) {
      if (!hay.includes(tokens[i])) {
        return false;
      }
    }

    return true;
  }

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }

      const req = indexedDB.open(CFG.DB_NAME, CFG.DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(CFG.STORE)) {
          db.createObjectStore(CFG.STORE, { keyPath: 'groupId' });
        }
      };

      req.onsuccess = () => resolve(req.result);

      req.onerror = () => {
        console.warn('[iMap Ultra] IndexedDB недоступна:', req.error);
        resolve(null);
      };
    });

    return dbPromise;
  }

  function idle(callback) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: CFG.SAVE_IDLE_TIMEOUT });
    } else {
      setTimeout(callback, 0);
    }
  }

  function saveGroupSnapshot(groupId, groupName, ids) {
    if (!groupId || !ids.length) return;

    const snapshot = ids.slice();

    idle(async () => {
      const db = await openDB();
      if (!db) return;

      try {
        const tx = db.transaction(CFG.STORE, 'readwrite');

        tx.objectStore(CFG.STORE).put({
          groupId,
          groupName,
          updatedAt: Date.now(),
          hostIds: snapshot
        });
      } catch (err) {
        console.warn('[iMap Ultra] Не удалось сохранить кэш:', err);
      }
    });
  }

  function rebuildDOMIndex() {
    const list = document.querySelector(CFG.LIST);
    if (!list) return false;

    const nodes = list.querySelectorAll(CFG.ITEM);

    allEntries = new Array(nodes.length);
    entryById = new Map();

    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];

      const id = String(el.getAttribute('hostid') || '');

      const name = String(el.getAttribute('hostname') || el.textContent || '').trim();

      const entry = {
        id,
        name,
        norm: normalize(name),
        el,
        shown: true
      };

      allEntries[i] = entry;

      if (id) {
        entryById.set(id, entry);
      }
    }

    return allEntries.length > 0;
  }

  function ensureDOMIndexFresh() {
    const count = document.querySelectorAll(`${CFG.LIST} ${CFG.ITEM}`).length;

    if (count !== allEntries.length) {
      rebuildDOMIndex();
    }
  }

  function getCurrentMarkerIds() {
    try {
      if (!window._imap || !_imap.markersList) {
        return [];
      }

      return Object.keys(_imap.markersList).map(String).sort();
    } catch (_) {
      return [];
    }
  }

  function getMarkerSignature(ids) {
    return ids.join(',');
  }

  function getSelectedGroup() {
    const select = document.querySelector(CFG.GROUP);

    if (!select) {
      return {
        id: '',
        name: ''
      };
    }

    return {
      id: String(select.value || ''),
      name: select.options[select.selectedIndex]?.textContent?.trim() || ''
    };
  }

  function setVisible(entry, visible) {
    if (entry.shown === visible) return;

    entry.shown = visible;

    entry.el.classList.toggle('uplink-local-hidden', !visible);
  }

  function applyCurrentGroup(ids, reason) {
    ensureDOMIndexFresh();

    currentIds = new Set(ids);
    currentEntries = [];

    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];

      // Состав группы берём из markersList, а не из следов серверного поиска.
      entry.el.style.display = '';

      const belongs = currentIds.has(entry.id);

      setVisible(entry, belongs);

      if (belongs) {
        currentEntries.push(entry);
      }
    }

    lastQuery = '';
    lastMatches = currentEntries;

    queueSearch(inputEl?.value || '');

    const group = getSelectedGroup();

    currentGroupId = group.id;
    currentGroupName = group.name;

    saveGroupSnapshot(currentGroupId, currentGroupName, ids);

    console.log(`[iMap Ultra] ${reason}: "${currentGroupName}" - ${ids.length} хостов`);
  }

  function performSearch(raw) {
    const query = normalize(raw);
    const tokens = splitTokens(query);

    if (!query) {
      for (let i = 0; i < allEntries.length; i++) {
        const entry = allEntries[i];

        setVisible(entry, currentIds.has(entry.id));
      }

      lastQuery = '';
      lastMatches = currentEntries;
      return;
    }

    const narrowing = lastQuery && query.startsWith(lastQuery);

    const source = narrowing ? lastMatches : currentEntries;

    if (!narrowing) {
      for (let i = 0; i < currentEntries.length; i++) {
        setVisible(currentEntries[i], false);
      }
    }

    const matches = [];

    for (let i = 0; i < source.length; i++) {
      const entry = source[i];

      const ok = entryMatches(entry, tokens);

      setVisible(entry, ok);

      if (ok) {
        matches.push(entry);
      }
    }

    lastQuery = query;
    lastMatches = matches;
  }

  function queueSearch(value) {
    pendingQuery = String(value ?? '');

    if (rafId) return;

    rafId = requestAnimationFrame(() => {
      rafId = 0;
      performSearch(pendingQuery);
    });
  }

  function installLocalSearchOverride() {
    if (typeof window.getHostsFilter1T !== 'function') {
      return false;
    }

    if (window.getHostsFilter1T.__uplinkLocalV4) {
      return true;
    }

    const localFn = function (value) {
      queueSearch(value);
    };

    localFn.__uplinkLocalV4 = true;

    window.getHostsFilter1T = localFn;

    console.log('[iMap Ultra] медленный серверный поиск заменён локальным');

    return true;
  }

  function attachInput() {
    const found = document.querySelector(CFG.INPUT);

    if (!found || found === inputEl) {
      return;
    }

    inputEl = found;

    inputEl.addEventListener(
      'input',
      () => {
        queueSearch(inputEl.value);
      },
      true
    );
  }

  function attachGroup() {
    const found = document.querySelector(CFG.GROUP);

    if (!found || found === groupEl) {
      return;
    }

    groupEl = found;

    groupEl.addEventListener(
      'change',
      () => {
        if (inputEl) {
          inputEl.value = '';
        }

        pendingQuery = '';
        lastQuery = '';
        lastMatches = [];

        for (let i = 0; i < allEntries.length; i++) {
          setVisible(allEntries[i], false);
        }
      },
      false
    );
  }

  function watchState() {
    attachInput();
    attachGroup();
    installLocalSearchOverride();

    if (!allEntries.length) {
      rebuildDOMIndex();
    } else {
      ensureDOMIndexFresh();
    }

    const group = getSelectedGroup();
    const ids = getCurrentMarkerIds();

    if (!ids.length) {
      return;
    }

    const signature = getMarkerSignature(ids);

    const groupChanged = group.id !== lastGroupId;

    const markersChanged = signature !== lastMarkersSignature;

    if (!initialized || groupChanged || markersChanged) {
      if (initialized && groupChanged && !markersChanged) {
        return;
      }

      lastGroupId = group.id;
      lastMarkersSignature = signature;

      applyCurrentGroup(ids, groupChanged ? 'смена группы' : 'обновление hosts');

      initialized = true;
    }
  }

  function installCSS() {
    if (document.getElementById('uplink-imap-ultra-v4-css')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'uplink-imap-ultra-v4-css';

    style.textContent = `
            #hosts_list .host_in_list.uplink-local-hidden {
                display: none !important;
            }

            #hosts_list {
                scroll-behavior: auto !important;
            }
        `;

    (document.head || document.documentElement).appendChild(style);
  }

  function boot() {
    installCSS();

    const timer = setInterval(watchState, CFG.WATCH_MS);

    console.log('[iMap Ultra] v4 запущен');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
