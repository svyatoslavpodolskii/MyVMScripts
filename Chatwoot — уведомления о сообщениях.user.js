// ==UserScript==
// @name         Chatwoot — уведомления о сообщениях
// @namespace    uplink-chatwoot
// @version      2.3.3
// @description  Уведомления о новых сообщениях с защитой от повторов и настройками разделов.
// @author       Svyatoslav Podolskii
// @homepageURL  https://github.com/svyatoslavpodolskii/MyVMScripts
// @supportURL   https://github.com/svyatoslavpodolskii/MyVMScripts/issues
// @updateURL    https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/Chatwoot%20%E2%80%94%20%D1%83%D0%B2%D0%B5%D0%B4%D0%BE%D0%BC%D0%BB%D0%B5%D0%BD%D0%B8%D1%8F%20%D0%BE%20%D1%81%D0%BE%D0%BE%D0%B1%D1%89%D0%B5%D0%BD%D0%B8%D1%8F%D1%85.user.js
// @downloadURL  https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/Chatwoot%20%E2%80%94%20%D1%83%D0%B2%D0%B5%D0%B4%D0%BE%D0%BC%D0%BB%D0%B5%D0%BD%D0%B8%D1%8F%20%D0%BE%20%D1%81%D0%BE%D0%BE%D0%B1%D1%89%D0%B5%D0%BD%D0%B8%D1%8F%D1%85.user.js
// @match        https://bot.uplink.kz/*
// @run-at       document-idle
// @noframes
// @grant        GM_notification
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;
  if (location.origin !== 'https://bot.uplink.kz') return;

  const PREFIX = '[Uplink Notify]';
  const ENABLED_KEY = 'uplink_chatwoot_notify_enabled_v1';
  const SETTINGS_KEY = 'uplink_notify_settings_v23';
  const STATE_KEY = 'uplink_notify_state_v23';
  const OLD_STATE_KEY = 'uplink_chatwoot_notify_state_v1';

  const BUTTON_ID = 'uplinkChatwootNotifyToggle';
  const MENU_ID = 'uplinkNotifySettingsMenu';

  const INTERVAL = 3000;
  const MAX_STATE = 1500;

  let enabled = localStorage.getItem(ENABLED_KEY) !== '0';
  let settings = readJSON(SETTINGS_KEY, {});
  let state = readJSON(STATE_KEY, {});
  let oldState = readJSON(OLD_STATE_KEY, {});

  let initialized = false;
  let currentScope = '';
  let menuOpen = false;

  function log(...args) {
    console.log(PREFIX, ...args);
  }

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(PREFIX, 'Ошибка сохранения:', error);
    }
  }

  function clean(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hashCode(str) {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }

    return String(hash);
  }

  function getAccount() {
    return location.pathname.match(/\/accounts\/(\d+)/)?.[1] || 'default';
  }

  function getScope() {
    const path = location.pathname;

    const team = path.match(/\/team\/(\d+)/);
    const inbox = path.match(/\/inbox\/(\d+)/);
    const custom = path.match(/\/custom_view\/(\d+)/);

    const account = getAccount();

    if (team) return `${account}:team:${team[1]}`;
    if (inbox) return `${account}:inbox:${inbox[1]}`;
    if (custom) return `${account}:custom:${custom[1]}`;

    if (path.includes('/mentions/')) return `${account}:mentions`;
    if (path.includes('/participating/')) return `${account}:participating`;
    if (path.includes('/unattended/')) return `${account}:unattended`;
    if (path.includes('/inbox-view')) return `${account}:mine`;

    return `${account}:all`;
  }

  function getSidebarGroups() {
    const result = [];
    const account = getAccount();

    const sections = [
      {
        title: 'Команды',
        selector: 'a[href*="/team/"]',
        type: 'team'
      },
      {
        title: 'Источники',
        selector: 'a[href*="/inbox/"]',
        type: 'inbox'
      }
    ];

    for (const section of sections) {
      const items = [];

      document.querySelectorAll(`aside ${section.selector}`).forEach((link) => {
        const id = link.getAttribute('href')?.match(/\/(\d+)(?:\/)?$/)?.[1];

        if (!id) return;

        const key = `${account}:${section.type}:${id}`;

        if (items.some((item) => item.key === key)) return;

        items.push({
          key,
          name: clean(link.getAttribute('title') || link.textContent)
        });
      });

      if (items.length) {
        result.push({
          title: section.title,
          items
        });
      }
    }

    return result;
  }

  function scopeName() {
    const scope = getScope();

    const names = {
      [`${getAccount()}:all`]: 'Все диалоги',
      [`${getAccount()}:mine`]: 'Мои входящие',
      [`${getAccount()}:mentions`]: 'Упоминания',
      [`${getAccount()}:participating`]: 'Участвующие',
      [`${getAccount()}:unattended`]: 'Неотвеченные'
    };

    if (names[scope]) return names[scope];

    for (const group of getSidebarGroups()) {
      const item = group.items.find((item) => item.key === scope);
      if (item) return item.name;
    }

    return (
      clean(document.querySelector('.conversations-list-wrap h1')?.textContent) || 'Текущий раздел'
    );
  }

  function isAllowed(scope) {
    return settings[scope] !== false;
  }

  function setAllowed(scope, value) {
    settings[scope] = value;
    saveJSON(SETTINGS_KEY, settings);
  }

  const BELL_ON = `
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M10 21h4"/>
    </svg>`;

  const BELL_OFF = `
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8a6 6 0 0 0-9.5-4.9"/>
      <path d="M6 6.5A6 6 0 0 0 6 8c0 7-3 7-3 9h14"/>
      <path d="M10 21h4"/>
      <path d="M2 2l20 20"/>
    </svg>`;

  const SETTINGS_ICON = `
    <svg width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 7h16M4 17h16"/>
      <circle cx="9" cy="7" r="2" fill="currentColor"/>
      <circle cx="15" cy="17" r="2" fill="currentColor"/>
    </svg>`;

  function getToolbar() {
    const panel = document.querySelector('.conversations-list-wrap');
    if (!panel) return null;

    const sort = Array.from(panel.querySelectorAll('.i-lucide-arrow-up-down'))
      .find((icon) => icon.closest('button'))
      ?.closest('button');

    const filter = panel.querySelector('#toggleConversationFilterButton');

    const reference = sort || filter;
    const toolbar = reference?.closest('.flex.items-center.gap-1');

    return toolbar && reference ? { toolbar, reference } : null;
  }

  function updateButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;

    const active = enabled && isAllowed(getScope());

    button.innerHTML = active ? BELL_ON : BELL_OFF;

    button.style.opacity = active ? '1' : '0.55';

    button.title = active
      ? 'Уведомления включены. Нажмите для настройки'
      : 'Уведомления выключены. Нажмите для настройки';

    button.setAttribute('aria-label', button.title);
  }

  function makeSwitch(label, checked, onChange) {
    const row = document.createElement('label');

    row.style.cssText = `
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:7px 8px;
      border-radius:7px;
      cursor:pointer;
      font-size:12px;
    `;

    row.onmouseenter = () => {
      row.style.background = 'var(--color-n-slate-3, rgba(128,128,128,.12))';
    };

    row.onmouseleave = () => {
      row.style.background = '';
    };

    const text = document.createElement('span');
    text.textContent = label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;

    checkbox.style.cssText = `
      width:15px;
      height:15px;
      flex-shrink:0;
      cursor:pointer;
      accent-color:#16a085;
    `;

    checkbox.addEventListener('change', () => {
      onChange(checkbox.checked);
      updateButton();
    });

    row.append(text, checkbox);

    return row;
  }

  function addHeading(menu, title) {
    const heading = document.createElement('div');

    heading.textContent = title;

    heading.style.cssText = `
      font-size:11px;
      font-weight:600;
      opacity:.65;
      padding:12px 8px 5px;
    `;

    menu.appendChild(heading);
  }

  function renderMenu() {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return;

    menu.replaceChildren();

    const header = document.createElement('div');
    header.textContent = 'Уведомления';

    header.style.cssText = `
      font-size:13px;
      font-weight:600;
      padding:4px 8px 10px;
    `;

    menu.appendChild(header);

    menu.appendChild(
      makeSwitch('Включить уведомления', enabled, (value) => {
        enabled = value;

        localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');

        if (enabled) {
          notify({
            key: 'test',
            user: 'Уведомления включены',
            message: 'Настройки сохранены',
            channel: '',
            node: null
          });
        }
      })
    );

    addHeading(menu, 'Текущий раздел');

    const scope = getScope();

    menu.appendChild(
      makeSwitch(scopeName(), isAllowed(scope), (value) => {
        setAllowed(scope, value);
      })
    );

    const groups = getSidebarGroups();

    for (const group of groups) {
      addHeading(menu, group.title);

      for (const item of group.items) {
        menu.appendChild(
          makeSwitch(item.name, isAllowed(item.key), (value) => setAllowed(item.key, value))
        );
      }
    }

    const note = document.createElement('div');

    note.textContent = 'Настройки сохраняются отдельно для каждого раздела.';

    note.style.cssText = `
      font-size:10px;
      opacity:.6;
      padding:12px 8px 4px;
      line-height:1.5;
    `;

    menu.appendChild(note);
  }

  function createButton() {
    const target = getToolbar();
    if (!target) return;

    let button = document.getElementById(BUTTON_ID);

    if (button && button.closest('.flex.items-center.gap-1') === target.toolbar) {
      updateButton();
      return;
    }

    if (button) {
      button.parentElement?.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'relative flex';

    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = target.reference.className;

    button.style.cssText = `
      width:24px;
      height:24px;
      padding:0;
      display:inline-flex;
      align-items:center;
      justify-content:center;
    `;

    const menu = document.createElement('div');
    menu.id = MENU_ID;

    menu.className = 'bg-n-surface-1 text-n-slate-12';

    menu.style.cssText = `
      display:none;
      position:absolute;
      top:32px;
      right:0;
      z-index:99999;
      width:260px;
      max-height:70vh;
      overflow-y:auto;
      padding:10px;
      border:1px solid var(--color-n-slate-4, rgba(128,128,128,.25));
      border-radius:12px;
      box-shadow:0 8px 30px rgba(0,0,0,.22);
      background:#1e293b;
      color:#f1f5f9;
    `;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      menuOpen = !menuOpen;

      if (menuOpen) {
        renderMenu();
      }

      menu.style.display = menuOpen ? 'block' : 'none';
    });

    menu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    wrapper.append(button, menu);

    const referenceWrapper =
      target.reference.closest('.relative.flex') || target.reference.parentElement;

    target.toolbar.insertBefore(wrapper, referenceWrapper);

    updateButton();

    log('Кнопка добавлена');
  }

  document.addEventListener('click', (event) => {
    const menu = document.getElementById(MENU_ID);
    const button = document.getElementById(BUTTON_ID);

    if (!menu || !button) return;

    if (!menu.contains(event.target) && !button.contains(event.target)) {
      menuOpen = false;
      menu.style.display = 'none';
    }
  });

  function makeAvatarDataUrl(node) {
    if (!node) return '';

    const avatar = node.querySelector('[role="img"]');
    if (!avatar) return '';

    const img = avatar.querySelector('img');

    if (img?.src) return img.src;

    try {
      const text = clean(avatar.querySelector('.select-none')?.textContent).slice(0, 2) || '?';

      const style = getComputedStyle(avatar);

      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;

      const ctx = canvas.getContext('2d');

      ctx.fillStyle = style.backgroundColor || '#dfe7ff';

      ctx.beginPath();
      ctx.arc(48, 48, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = style.color || '#3a5bc7';
      ctx.font = text.length > 1 ? '600 35px Arial' : '600 43px Arial';

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 48, 51);

      return canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  async function notify(data) {
    if (!enabled) return;

    const title = data.user;

    const body = [data.channel, data.message].filter(Boolean).join('\n');

    const avatar = data.avatar || makeAvatarDataUrl(data.node);

    log('Уведомление:', title, body);

    if (typeof GM_notification === 'function') {
      try {
        const options = {
          title,
          text: body,
          timeout: 9000,
          onclick: () => {
            window.focus();

            if (data.node?.isConnected) {
              data.node.click();
            }
          }
        };

        if (avatar) options.image = avatar;

        GM_notification(options);
        return;
      } catch (error) {
        console.error(PREFIX, 'Ошибка GM_notification:', error);
      }
    }

    if (!('Notification' in window)) return;

    try {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      if (Notification.permission !== 'granted') return;

      const options = {
        body,
        tag: `${data.key}:${Date.now()}`
      };

      if (avatar) options.icon = avatar;

      const notification = new Notification(title, options);

      notification.onclick = () => {
        window.focus();

        if (data.node?.isConnected) {
          data.node.click();
        }

        notification.close();
      };
    } catch (error) {
      console.error(PREFIX, 'Ошибка уведомления:', error);
    }
  }

  function getConversationData(node) {
    const user = clean(node.querySelector('.conversation--user')?.textContent);

    const message = clean(
      node.querySelector('.conversation--user + div')?.textContent ||
        node.querySelector('.h-6')?.textContent
    );

    const channel = clean(node.querySelector('[title]')?.getAttribute('title'));

    const badge = Array.from(node.querySelectorAll('span.bg-n-teal-9')).find((span) => {
      const cls = String(span.className || '');
      const value = clean(span.textContent);

      return !cls.includes('hidden') && value !== '' && value !== '0';
    });

    const unreadCount = badge ? Number(clean(badge.textContent)) || 0 : 0;

    const link = node.closest('a[href]') || node.querySelector('a[href]');

    const href = link?.getAttribute('href') || '';

    const conversationId =
      href.match(/\/conversations\/(\d+)/)?.[1] ||
      node.getAttribute('data-conversation-id') ||
      node.getAttribute('data-id');

    // Старые записи узнаём по хешу, если у карточки нет ID.
    const legacyKey = hashCode(`${channel}|${user}`);

    const key = conversationId
      ? `${getAccount()}:conversation:${conversationId}`
      : `${getAccount()}:legacy:${legacyKey}`;

    return {
      key,
      legacyKey,
      user: user || 'Сообщение',
      message,
      channel,
      unreadCount,
      node
    };
  }

  function getSignature(data) {
    return JSON.stringify([data.message, data.unreadCount]);
  }

  function remember(data) {
    const previous = state[data.key];

    state[data.key] = {
      message: data.message,
      unreadCount: data.unreadCount,
      signature: getSignature(data),
      lastSeen: Date.now(),
      lastNotified: previous?.lastNotified || '',
      lastNotifiedAt: previous?.lastNotifiedAt || 0
    };
  }

  function pruneState() {
    const entries = Object.entries(state);

    if (entries.length <= MAX_STATE) return;

    entries.sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));

    state = Object.fromEntries(entries.slice(0, MAX_STATE));
  }

  function scanConversations() {
    const list = document.querySelector('.conversations-list');

    if (!list) return;

    const items = list.querySelectorAll('.conversation');

    if (!items.length) return;

    let changed = false;

    const scope = getScope();
    const allowed = enabled && isAllowed(scope);

    for (const item of items) {
      const data = getConversationData(item);

      if (!data.user || !data.message) continue;

      const signature = getSignature(data);

      let old = state[data.key];

      if (!old && oldState[data.legacyKey]) {
        const legacy = oldState[data.legacyKey];

        old = {
          message: legacy.message || '',
          unreadCount: legacy.unreadCount || 0,
          signature: JSON.stringify([legacy.message || '', legacy.unreadCount || 0]),
          lastSeen: Date.now(),
          lastNotified: '',
          lastNotifiedAt: 0
        };

        state[data.key] = old;
      }

      // Старые сообщения запоминаем молча. Будильник для архива не нужен.
      if (!initialized) {
        remember(data);
        changed = true;
        continue;
      }

      if (!old) {
        remember(data);
        changed = true;

        // Новая карточка в DOM не обязательно новый диалог — проверяем непрочитанные.
        if (allowed && data.unreadCount > 0) {
          const record = state[data.key];

          record.lastNotified = signature;
          record.lastNotifiedAt = Date.now();

          notify(data);
        }

        continue;
      }

      const unreadIncreased = data.unreadCount > old.unreadCount;

      const messageChanged = data.message !== old.message;

      const shouldNotify =
        allowed &&
        data.unreadCount > 0 &&
        (unreadIncreased || messageChanged) &&
        old.lastNotified !== signature;

      if (shouldNotify) {
        // Сначала отмечаем отправку, чтобы следующий обход не устроил эхо.
        old.lastNotified = signature;
        old.lastNotifiedAt = Date.now();

        notify(data);
      }

      if (
        old.signature !== signature ||
        old.message !== data.message ||
        old.unreadCount !== data.unreadCount
      ) {
        remember(data);
        changed = true;
      } else {
        old.lastSeen = Date.now();
      }
    }

    if (changed) {
      pruneState();
      saveJSON(STATE_KEY, state);
    }

    initialized = true;
  }

  function tick() {
    try {
      const scope = getScope();

      if (scope !== currentScope) {
        currentScope = scope;

        initialized = false;

        if (menuOpen) renderMenu();
      }

      createButton();
      scanConversations();
    } catch (error) {
      console.error(PREFIX, 'Ошибка:', error);
    }
  }

  log('Версия 2.3 запущена');

  setTimeout(tick, 3000);
  setInterval(tick, INTERVAL);
})();
