// ==UserScript==
// @name         WoToM — аккуратное оформление
// @namespace    uplink-wotom-design
// @version      1.1.0
// @description  Самостоятельная тема WoToM без Stylebot: заявки, формы, окна и единые иконки. Сохраняет штатные действия сайта.
// @author       Svyatoslav Podolskii
// @homepageURL  https://github.com/svyatoslavpodolskii/MyVMScripts
// @supportURL   https://github.com/svyatoslavpodolskii/MyVMScripts/issues
// @updateURL    https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/WoToM%20%E2%80%94%20%D0%B0%D0%BA%D0%BA%D1%83%D1%80%D0%B0%D1%82%D0%BD%D0%BE%D0%B5%20%D0%BE%D1%84%D0%BE%D1%80%D0%BC%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5.user.js
// @downloadURL  https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/WoToM%20%E2%80%94%20%D0%B0%D0%BA%D0%BA%D1%83%D1%80%D0%B0%D1%82%D0%BD%D0%BE%D0%B5%20%D0%BE%D1%84%D0%BE%D1%80%D0%BC%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5.user.js
// @match        https://wotom.net/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(function boot() {
  'use strict';

  if (!document.documentElement) {
    setTimeout(boot, 10);
    return;
  }
  if (document.getElementById('wotomCalmTheme')) return;

  const KEY = 'wotom-design:enabled';
  const ROOT = document.documentElement;
  let enabled = true;
  const decorated = new WeakMap();
  try {
    enabled = localStorage.getItem(KEY) !== '0';
  } catch (_) {}
  const CSS = `
    html[data-wotom-theme="calm"] {
      --wd-page:#f4f6f9; --wd-surface:#fff; --wd-ink:#263549; --wd-muted:#5c6b7e;
      --wd-line:#dce3ec; --wd-accent:#2868af; --wd-tint:#edf4fc; --wd-chrome:#1c293a;
      --wd-font:"Segoe UI",Arial,sans-serif;
      --modBGColor:var(--wd-surface) !important; --modColor:#334a62 !important;
      --modColor_light:#c5d4e6; --modColor_lighter:#dae6f3; --modColor_lightest:#eff5fc;
      --modColor_dark:#244f7c; --modColor_darkest:#1b3654;
      --modColor_highprior:#b65b3b; --modColor_lowprior:#287c66;
      --tileWaiting:#64748b; --tileWorking:#b65b3b; --tileQueued:#287c66;
      --tileFinished:#2868af; --tileDeleted:#a73557;
      font-variant-numeric:tabular-nums; color-scheme:light;
    }
    html[data-wotom-theme="calm"] body {
      background:var(--wd-page) !important; color:var(--wd-ink);
      font-family:"Segoe UI",Arial,sans-serif; -webkit-font-smoothing:antialiased;
    }
    html[data-wotom-theme="calm"] :is(.workfield,.msgbboxClass,.workfield div,.msgbboxClass div) {
      font-family:var(--wd-font);
    }
    html[data-wotom-theme="calm"] :is(#wrapper,.workfield) { background:var(--wd-page) !important; }
    html[data-wotom-theme="calm"] #topflow {
      background:var(--wd-chrome) !important; border-radius:0 !important;
      box-shadow:0 1px 0 #ffffff14 !important;
    }
    html[data-wotom-theme="calm"] #sidebar {
      background:var(--wd-chrome) !important; background-image:none !important;
      border-radius:0 !important; box-shadow:none !important; opacity:1 !important;
      border-right:1px solid #ffffff12; transition:width 140ms ease-out !important;
    }
    html[data-wotom-theme="calm"] #sidebar :is(.tabBtn,.tabBtn_a) { border:0 !important; }
    html[data-wotom-theme="calm"] #sidebar .btnin { --modColor:#1c293a; }
    html[data-wotom-theme="calm"] #sidebar .tabBtn { color:#e0e8f3; }
    html[data-wotom-theme="calm"] #sidebar .tabBtn:hover { background:#ffffff12; }
    html[data-wotom-theme="calm"] #sidebar .tabBtn_a { background:var(--wd-tint); color:var(--wd-ink); }
    html[data-wotom-theme="calm"] #sidebar .sideicon { background-size:24px 24px !important; background-position:center !important; background-repeat:no-repeat !important; filter:grayscale(1) brightness(1.8); }
    html[data-wotom-theme="calm"] #sidebar .tabBtn_a .sideicon { filter:grayscale(1) brightness(.65); }
    html[data-wotom-theme="calm"] #sidebar .sideicon[data-wd-icon] { background-image:none !important; filter:none; }
    html[data-wotom-theme="calm"] #sidebar .sideicon[data-wd-icon]::before { filter:brightness(0) invert(1); opacity:.8; }
    html[data-wotom-theme="calm"] #sidebar .tabBtn_a .sideicon[data-wd-icon]::before { filter:none; opacity:1; }
    html[data-wotom-theme="calm"] .pagetitle {
      color:var(--wd-ink); font-size:22px; font-weight:600; letter-spacing:-.3px;
    }
    html[data-wotom-theme="calm"] :is(.ttButton,.ttButton2) {
      position:relative;
      border:1px solid var(--wd-line) !important; border-radius:8px !important;
      background:var(--wd-surface) !important; opacity:1; box-shadow:none;
      transition:background-color 120ms ease-out,border-color 120ms ease-out;
    }
    html[data-wotom-theme="calm"] :is(.ttButton,.ttButton2):hover {
      background:var(--wd-tint) !important; border-color:#94b6dc !important; box-shadow:none;
    }
    html[data-wotom-theme="calm"] .ttActive {
      background:var(--wd-tint) !important; border-color:var(--wd-accent) !important;
      box-shadow:inset 0 -2px var(--wd-accent);
    }
    html[data-wotom-theme="calm"] :is(.ttButton,.ttButton2) > .icon32 {
      width:26px; height:26px; margin:3px; object-fit:contain;
    }
    html[data-wotom-theme="calm"] [data-wd-icon] { position:relative; }
    html[data-wotom-theme="calm"] [data-wd-icon] > img { opacity:0; }
    html[data-wotom-theme="calm"] [data-wd-icon]::before {
      content:""; position:absolute; width:22px; height:22px; left:50%; top:50%;
      transform:translate(-50%,-50%); background:var(--wd-icon) center/contain no-repeat;
      pointer-events:none;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) {
      background:var(--wd-surface) !important; border:1px solid var(--wd-line) !important;
      border-radius:10px !important; margin-bottom:16px !important;
      box-shadow:0 1px 2px #1c293a06 !important;
    }
    html[data-wotom-theme="calm"] :is(#supListContainer_scheduled,#conListContainer_scheduled) .tsTile {
      box-shadow:0 1px 2px #1c293a09 !important;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:first-child {
      background:#f8fafc !important; color:var(--wd-ink) !important;
      border-radius:9px 9px 0 0; padding:7px 0; font-size:13px !important;
      border-bottom:1px solid var(--wd-line);
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:first-child img {
      filter:brightness(0) opacity(.6);
    }
    html[data-wotom-theme="calm"] :is([class*="_prior_h"],[class*="_scheduled_"]):not([class*="_scheduled_0"]) > .tsTile {
      border-left:3px solid #bd7655 !important;
    }
    html[data-wotom-theme="calm"] [class*="_prior_h"] > .tsTile { border-left:3px solid #b65b3b !important; }
    html[data-wotom-theme="calm"] [class*="_prior_l"] > .tsTile { border-left:3px solid #54917e !important; }
    html[data-wotom-theme="calm"] .tileInnerBlock {
      color:var(--wd-ink); font-size:14px; line-height:1.4;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:nth-child(2) > div > div:first-child {
      background:#fafbfd; border-right:1px solid #e9eef5; padding-top:8px; box-sizing:border-box;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) [style*="var(--tile"] {
      width:calc(100% - 16px) !important; margin:6px 8px !important;
      border-radius:5px; padding:5px 0 !important; font-size:11px !important;
      font-weight:600; letter-spacing:.35px;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:last-child:not(:first-child) {
      background:#fafbfd !important; border-radius:0 0 9px 9px;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) .supRedBlinker { animation:none !important; }
    html[data-wotom-theme="calm"] .tileInnerBlock [style*="background-color: var(--modColor"] {
      background:#edf2f8 !important; color:#465b73 !important; padding:4px 6px !important;
      border-radius:4px 4px 0 0; font-weight:600 !important;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) [style*="dotted"] {
      border-width:0 !important;
    }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:last-child:not(:first-child) { border-top:1px solid var(--wd-line) !important; }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:last-child > div > div { font-size:12px !important; line-height:1.35; }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:last-child :is(img[src*="_icon"],img[src^="data:image/svg"]) { width:28px !important; height:28px !important; object-fit:contain; }
    html[data-wotom-theme="calm"] :is(.tsTile,.conTile) > div:last-child img[src*="/_avatars/"] { width:32px !important; height:32px !important; border-radius:50%; object-fit:cover; }
    html[data-wotom-theme="calm"] .supHoverTile:hover { box-shadow:none; background-color:#2868af08; }
    html[data-wotom-theme="calm"] :is(.tooltiptext,.tooltiptextB) { border-radius:6px; }
    html[data-wotom-theme="calm"] :is(input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,select) {
      color:var(--wd-ink); background-color:var(--wd-surface);
      border:1px solid #b9c7d8; border-radius:6px; font-family:inherit;
    }
    html[data-wotom-theme="calm"] :is(input[type="text"],input[type="search"],input[type="tel"],input[type="datetime-local"],textarea) {
      padding:5px 8px; box-sizing:border-box;
    }
    html[data-wotom-theme="calm"] :is(input,textarea)::placeholder { color:#67768a; opacity:1; }
    html[data-wotom-theme="calm"] :is(input,textarea,select):disabled { background:#edf1f5; color:#657286; }
    html[data-wotom-theme="calm"] :is(button,input,textarea,select,[tabindex]):focus-visible {
      outline:2px solid var(--wd-accent); outline-offset:2px;
    }
    html[data-wotom-theme="calm"] select option { padding:4px 6px; }
    html[data-wotom-theme="calm"] :is(.select-selected,.select-items) {
      border-radius:7px !important; box-shadow:none;
    }
    html[data-wotom-theme="calm"] .select-selected {
      background:#fff !important; color:var(--wd-ink) !important; border:1px solid var(--wd-line);
    }
    html[data-wotom-theme="calm"] .select-selected::after { border-top-color:var(--wd-muted); }
    html[data-wotom-theme="calm"] .select-selected.select-arrow-active::after { border-color:transparent transparent var(--wd-muted) transparent; }
    html[data-wotom-theme="calm"] .select-items { background:#fff !important; color:var(--wd-ink); border:1px solid var(--wd-line); }
    html[data-wotom-theme="calm"] .select-items div { color:var(--wd-ink); }
    html[data-wotom-theme="calm"] .select-items div:hover { background:var(--wd-tint); }
    html[data-wotom-theme="calm"] .select-items .same-as-selected { background:var(--wd-tint); }
    html[data-wotom-theme="calm"] [data-wd-region] { background:#fff !important; border:1px solid var(--wd-line); border-radius:7px; box-sizing:border-box; }
    html[data-wotom-theme="calm"] #regionSelectorCaption { color:var(--wd-ink) !important; }
    html[data-wotom-theme="calm"] [data-wd-region] img { filter:brightness(0) opacity(.5); }
    html[data-wotom-theme="calm"] #regionListDiv { background:#fff !important; border-radius:7px; color:var(--wd-ink); box-shadow:0 8px 24px #15243b1a; }
    html[data-wotom-theme="calm"] .regionListMenuItem { color:var(--wd-ink); }
    html[data-wotom-theme="calm"] .regionListMenuItem:hover { background:var(--wd-tint); }
    html[data-wotom-theme="calm"] :is(.tsTileFilterDiv,.conTileFilterDiv):is(:hover,:focus-within) { contain:layout style !important; content-visibility:visible !important; }
    html[data-wotom-theme="calm"] .ifaceBlock {
      border:1px solid var(--wd-line); border-radius:10px; background:#fff;
    }
    html[data-wotom-theme="calm"] .ifaceBlock_header {
      background:#f8fafc !important; color:var(--wd-ink) !important;
      border-radius:9px 9px 0 0; padding:10px 12px; font-weight:600; border-bottom:1px solid var(--wd-line);
    }
    html[data-wotom-theme="calm"] .ifaceBlock_content { padding:12px; }
    html[data-wotom-theme="calm"] .ifaceBlock input[type="text"] { min-height:32px; }
    html[data-wotom-theme="calm"] .ifaceBlock select[size] { border-color:var(--wd-line); }
    html[data-wotom-theme="calm"] :is(#tvLockScreenDiv,#supLockScreenDiv,#msgbboxdiv,.msgbboxClass,.msgbboxClass_header) {
      backdrop-filter:none !important; -webkit-backdrop-filter:none !important;
    }
    html[data-wotom-theme="calm"] #msgbboxdiv {
      pointer-events:none !important; background-color:transparent !important;
    }
    html[data-wotom-theme="calm"] .msgbboxClass {
      pointer-events:auto !important;
      background:var(--wd-surface) !important; color:var(--wd-ink);
      border:1px solid #b8c6d8 !important; border-radius:10px !important;
      box-shadow:0 16px 48px #15243b24 !important;
      max-width:calc(100vw - 24px); max-height:calc(100vh - 24px);
    }
    html[data-wotom-theme="calm"] .msgbboxClass_header {
      display:flex !important; align-items:center !important; position:relative !important;
      background:#f8fafc !important; color:var(--wd-ink) !important;
      border-bottom:1px solid var(--wd-line);
      height:35px !important; border-radius:9px 9px 0 0;
      font:600 17px/1.2 "Segoe UI",Arial,sans-serif;
    }
    html[data-wotom-theme="calm"] .msgboxClass_content {
      overflow:auto; max-width:calc(100vw - 26px); max-height:calc(100vh - 65px) !important;
    }
    html[data-wotom-theme="calm"] .msgboxClass_close {
      position:absolute !important; right:0 !important; top:0 !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      margin:5px !important; padding:0 !important; width:25px !important; height:25px !important;
      border-radius:6px !important; background:#e9eef5 !important;
      color:#52657b !important; font:500 15px/1 "Segoe UI",sans-serif !important;
    }
    html[data-wotom-theme="calm"] .msgboxClass_close:hover { background:#fbe8e8 !important; color:#9f3434 !important; }
    html[data-wotom-theme="calm"] .msgbboxClass > .wtu-refresh {
      position:absolute; top:5px; right:38px; height:25px; width:25px; border-radius:6px;
      line-height:25px; background:#356caa; margin:0; padding:0; border:0; color:#fff;
    }
    html[data-wotom-theme="calm"] :is(.cardTab,.cardTabSelected) {
      border-radius:7px 7px 0 0; font-size:13px; transition:background-color 120ms ease-out;
    }
    html[data-wotom-theme="calm"] .cardTab { background:#f1f4f8; color:var(--wd-muted); }
    html[data-wotom-theme="calm"] .cardTab:hover { background:var(--wd-tint); color:var(--wd-ink); }
    html[data-wotom-theme="calm"] .cardTabSelected {
      background:var(--wd-tint); color:#244f7c; box-shadow:inset 0 -2px var(--wd-accent);
    }
    html[data-wotom-theme="calm"] .blueHgh { border-color:var(--wd-line) !important; border-radius:7px; }
    html[data-wotom-theme="calm"] .vgTile { border-radius:7px; padding:8px; box-sizing:border-box; }
    html[data-wotom-theme="calm"] .vgTileSelected { background:#e8f0fa !important; color:#244f7c !important; box-shadow:inset 3px 0 var(--wd-accent); }
    html[data-wotom-theme="calm"] .phoneButton { background:var(--wd-tint); color:#244f7c; border:1px solid #cfdef0; border-radius:8px; }
    html[data-wotom-theme="calm"] #wsa-native-address-bar { color:var(--wd-ink); }
    html[data-wotom-theme="calm"] :is(#wsa-native-address-find,#wsa-native-address-list) {
      background:#e9f0f8 !important; color:#244f7c !important; border:1px solid #b9cbe0 !important; border-radius:6px;
    }
    html[data-wotom-theme="calm"] #wsa-native-address-find { background:var(--wd-accent) !important; color:#fff !important; }
    #wotom-design-toggle {
      position:absolute; left:260px; top:12px; width:auto; min-width:0; height:26px; padding:0 9px; margin:0;
      display:inline-flex; align-items:center; gap:6px; border:1px solid #ffffff35;
      border-radius:6px; background:#ffffff10; color:#f1f5f9; cursor:pointer;
      font:500 12px/1 "Segoe UI",Arial,sans-serif; white-space:nowrap; z-index:1;
    }
    #wotom-design-toggle:hover { background:#ffffff22; }
    #wotom-design-toggle:focus-visible { outline:2px solid #b8d8ff; outline-offset:2px; }
    #wotom-design-toggle svg { flex:none; pointer-events:none; }
    @media (max-width:800px) { #wotom-design-toggle { left:248px; padding:0 6px; } #wotom-design-toggle span { display:none; } }
    @media (max-width:1050px), (max-height:740px) {
      html[data-wotom-theme="calm"] .msgbboxClass[data-wd-search-window] {
        display:flex !important; flex-direction:column;
        width:min(1000px,calc(100vw - 24px)) !important; left:50% !important; margin-left:0 !important; transform:translateX(-50%);
        min-width:0; max-width:none;
      }
      html[data-wotom-theme="calm"] .msgbboxClass[data-wd-search-window] > div:not(.msgbboxClass_header) {
        display:block !important; min-width:0; min-height:0; overflow:auto; flex:1;
      }
      html[data-wotom-theme="calm"] .msgbboxClass[data-wd-search-window] .msgbboxClass_header { flex:none; }
    }
    @media (max-height:740px) {
      html[data-wotom-theme="calm"] .msgbboxClass[data-wd-search-window] { top:12px !important; margin-top:0 !important; height:calc(100vh - 24px) !important; }
    }
    @media (prefers-reduced-motion:reduce) {
      html[data-wotom-theme="calm"] :is(.ttButton,.ttButton2,.cardTab,.cardTabSelected,#sidebar) { transition:none !important; }
    }
  `;

  const ICONS = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
    tv: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4"/>',
    tool: '<path d="M14 7a5 5 0 0 0-6 6l-5 5 3 3 5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<path d="m5 3 4 1 1 5-2 2a15 15 0 0 0 5 5l2-2 5 1 1 4c-1 4-8 2-13-3S1 4 5 3Z"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
    tag: '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r=".8"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    message: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z"/>',
    back: '<path d="m10 5-7 7 7 7M3 12h18"/>'
  };
  const ICON_RULES = [
    [/поиск|искать|search/iu, 'search'],
    [/интернет/iu, 'globe'],
    [/ктв|телевид|(?:^|\s)тв(?:\s|$)/iu, 'tv'],
    [/прочие|инструмент/iu, 'tool'],
    [/выполнен|завершен/iu, 'check'],
    [/исполняем|старт|начать/iu, 'play'],
    [/забронирован|бронь/iu, 'lock'],
    [/ожидающ|ожидание/iu, 'clock'],
    [/без выезда|звон|^\+?\d{5,}$/iu, 'phone'],
    [/на адресе|адрес|район/iu, 'pin'],
    [/будущ|запланир/iu, 'calendar'],
    [/автообнов|обновить/iu, 'refresh'],
    [/профиль|карточк/iu, 'user'],
    [/редактир/iu, 'edit'],
    [/дополнить|добавить/iu, 'plus'],
    [/категор/iu, 'tag']
  ];
  function markIcon(element, name) {
    element.setAttribute('data-wd-icon', name);
  }

  function decorate(root) {
    if (!enabled || !root?.querySelectorAll) return;
    const buttons = [...root.querySelectorAll('.ttButton,.ttButton2')];
    if (root.matches?.('.ttButton,.ttButton2')) buttons.push(root);
    for (const button of buttons) {
      const image = button.querySelector(':scope > img.icon32');
      const label = button.querySelector('.tooltiptext,.tooltiptextB')?.textContent.trim() || '';
      if (!image || !label) continue;
      const source = image.getAttribute('src') || '';
      const key = `${label}|${source}`;
      if (decorated.get(button) === key) continue;
      decorated.set(button, key);
      const name = ICON_RULES.find(([pattern]) => pattern.test(label))?.[1];
      if (!name) {
        button.removeAttribute('data-wd-icon');
        continue;
      }
      markIcon(button, name);
    }
    const tabs = {
      tabSummary: 'user',
      tabHistory: 'list',
      tabStatus: 'activity',
      tabPayments: 'card',
      tabDiag: 'tool',
      tabPRecs: 'message',
      tabORKK: 'user'
    };
    for (const tab of root.querySelectorAll('.cardTab,.cardTabSelected')) {
      const name = tabs[tab.id],
        cell = tab.querySelector('img')?.parentElement;
      if (name && cell && cell.getAttribute('data-wd-icon') !== name) markIcon(cell, name);
    }
    const navigation = {
      listBtn_t_1support: 'phone',
      listBtn_t_2connects: 'tool',
      listBtn_index: 'user',
      listBtn_new: 'plus',
      listBtn_omap: 'globe',
      listBtn_reports: 'list',
      listBtn_zdebt: 'card'
    };
    for (const icon of root.querySelectorAll('#sidebar .sideicon')) {
      const name = navigation[icon.closest('.sbButtonClass')?.id];
      if (name && icon.getAttribute('data-wd-icon') !== name) markIcon(icon, name);
    }
    for (const row of root.querySelectorAll('.blueHgh')) {
      const cell = row.querySelector('img')?.parentElement;
      if (
        cell &&
        /^\s*Вернуться к форме поиска/u.test(row.textContent) &&
        cell.getAttribute('data-wd-icon') !== 'back'
      )
        markIcon(cell, 'back');
    }
    for (const row of root.querySelectorAll('.phoneButton')) {
      const cell = row.querySelector('img')?.parentElement;
      if (cell && cell.getAttribute('data-wd-icon') !== 'phone') markIcon(cell, 'phone');
    }
    const caption = root.querySelector('#regionSelectorCaption');
    const region = caption?.parentElement?.parentElement?.parentElement;
    if (region?.style.display === 'table') region.setAttribute('data-wd-region', '');
    for (const container of root.querySelectorAll('[id="userSearchContainer"]'))
      container.closest('.msgbboxClass')?.setAttribute('data-wd-search-window', '');
  }

  function watchControls() {
    const pending = new Set();
    let timer = null;
    new MutationObserver((records) => {
      if (!enabled) return;
      for (const record of records) {
        const button = record.target.closest?.('.ttButton,.ttButton2');
        if (button) pending.add(button);
        for (const node of record.addedNodes || []) if (node.nodeType === 1) pending.add(node);
      }
      if (!pending.size || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        const roots = new Set(pending);
        pending.clear();
        for (const node of roots) {
          if (!node.isConnected) continue;
          let parent = node.parentElement;
          while (parent && !roots.has(parent)) parent = parent.parentElement;
          if (!parent) decorate(node);
        }
      }, 32);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  function apply() {
    if (enabled) ROOT.setAttribute('data-wotom-theme', 'calm');
    else ROOT.removeAttribute('data-wotom-theme');
    const button = document.getElementById('wotom-design-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(enabled));
      button.title = enabled ? 'Вернуть прежний вид страницы' : 'Включить аккуратное оформление';
      button.querySelector('span').textContent = enabled ? 'Новый вид' : 'Прежний вид';
    }
    if (enabled && document.body) decorate(document);
  }

  function installButton() {
    const top = document.getElementById('topflow');
    if (!top || document.getElementById('wotom-design-toggle')) return;
    const button = document.createElement('button');
    button.id = 'wotom-design-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Переключить оформление WoToM');
    button.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/></svg><span></span>';
    button.addEventListener('click', () => {
      enabled = !enabled;
      try {
        localStorage.setItem(KEY, enabled ? '1' : '0');
      } catch (_) {}
      apply();
    });
    top.append(button);
    apply();
    watchControls();
  }

  const style = document.createElement('style');
  style.id = 'wotomCalmTheme';
  style.textContent =
    CSS +
    Object.entries(ICONS)
      .map(([name, paths]) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4a6079" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
        return `html[data-wotom-theme="calm"] [data-wd-icon="${name}"] { --wd-icon: url("data:image/svg+xml,${encodeURIComponent(svg)}"); }`;
      })
      .join('\n');
  ROOT.append(style);
  apply();
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', installButton, { once: true });
  else installButton();
})();
