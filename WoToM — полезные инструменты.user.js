// ==UserScript==
// @name         WoToM — полезные инструменты
// @namespace    uplink-wotom-utilities
// @version      1.1.2
// @description  Обновление активной карточки договора рядом с кнопкой закрытия окна.
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

  let timer;
  let busy = false;

  function activeTile(header) {
    const dialog = header.closest('.msgbboxClass');
    const roots = [...dialog.querySelectorAll('[id="userSearchContainer"]')].filter(
      (root) => root.getClientRects().length
    );
    // Вкладка «История» может скрывать плитку, но выбранный договор остаётся тем же.
    const tiles = roots
      .flatMap((root) => [...root.querySelectorAll('.vgTileSelected[onclick]')])
      .filter((tile) => /^\s*loadSearchDNum\s*\(/.test(tile.getAttribute('onclick') || ''));
    return tiles.length === 1 ? tiles[0] : null;
  }

  function scan() {
    for (const header of document.querySelectorAll('.msgbboxClass_header')) {
      const close = header.querySelector('.msgboxClass_close');
      if (!close || !header.closest('.msgbboxClass')?.querySelector('[id="userSearchContainer"]'))
        continue;
      const dialog = header.closest('.msgbboxClass');
      let button = dialog.querySelector(':scope > .wtu-refresh');
      if (!button) {
        button = document.createElement('button');
        button.className = 'wtu-refresh';
        button.type = 'button';
        button.textContent = '↻';
        button.setAttribute('aria-label', 'Обновить активную карточку');
        button.addEventListener('click', async () => {
          const tile = activeTile(header);
          if (!tile || busy) return;
          const id = (tile.getAttribute('onclick') || '').match(
            /^\s*loadSearchDNum\s*\(\s*(['"])([^'"]+)\1\s*\)\s*;?\s*$/
          )?.[2];
          if (!id || typeof window.loadSearchDNum !== 'function') return;
          const tabId = dialog.querySelector('.cardTabSelected')?.id;
          const extraTab = dialog.querySelector('[id="tabCom_selector"]')?.value;
          busy = true;
          button.disabled = true;
          try {
            await window.loadSearchDNum(id);
            if (!dialog.isConnected) return;
            const tab = [...dialog.querySelectorAll('.cardTab, .cardTabSelected')]
              .find(node => node.id === tabId);
            if (tab && typeof window.ucardSwitchTab === 'function') {
              window.ucardSwitchTab(tab);
            }
            const selector = dialog.querySelector('[id="tabCom_selector"]');
            if (extraTab && selector && [...selector.options].some(option => option.value === extraTab)) {
              selector.value = extraTab;
              selector.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } catch (error) {
            console.error('[WoToM Utilities] Обновление карточки:', error);
          } finally {
            busy = false;
            scan();
          }
        });
        dialog.append(button);
      }

      const tile = activeTile(header);
      button.disabled = busy || !tile;
      button.title = tile
        ? `Обновить выбранный договор: ${tile.textContent.trim().replace(/\s+/g, ' ')}`
        : 'Откройте карточку и выберите договор';
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    .msgbboxClass > .wtu-refresh { position:absolute; top:5px; right:38px; width:24px; height:24px; padding:0; margin:0; border:0; border-radius:50%; background:#1976d2; color:#fff; font-size:20px; line-height:24px; text-align:center; cursor:pointer; z-index:1; }
    .wtu-refresh:hover { background:#1565c0; }
    .wtu-refresh:disabled { opacity:.5; cursor:default; }
  `;
  document.head.append(style);
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
