// ==UserScript==
// @name         WoToM — умный поиск адресов
// @namespace    uplink.kz
// @version      1.9.0
// @description  Находит адреса в свободном формате, кэширует справочники и открывает дома и абонентов.
// @author       Svyatoslav Podolskii
// @homepageURL  https://github.com/svyatoslavpodolskii/MyVMScripts
// @supportURL   https://github.com/svyatoslavpodolskii/MyVMScripts/issues
// @updateURL    https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/WoToM%20%E2%80%94%20%D1%83%D0%BC%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%BE%D0%B2.user.js
// @downloadURL  https://raw.githubusercontent.com/svyatoslavpodolskii/MyVMScripts/main/WoToM%20%E2%80%94%20%D1%83%D0%BC%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA%20%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%BE%D0%B2.user.js
// @match        https://wotom.net/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (location.origin !== 'https://wotom.net') return;

  const CFG = {
    DB_NAME: 'wotom_smart_address_cache',
    DB_VERSION: 1,
    STORE: 'geo',
    GEO_URL: '/_modules/subdep/helpers/support/search/frmGeolist.php',
    STREET_REFRESH_GAP: 100,
    CACHE_STALE_MS: 6 * 60 * 60 * 1000,
    REVALIDATE_MIN_MS: 15000,
    DEBUG: false
  };

  let dbPromise = null;

  // Сначала кэш, свежие данные — следом. Один запрос на уровень.
  const refreshInFlight = new Map();
  const lastRefreshAttempt = new Map();

  let modal = null;
  let quickInput = null;
  let resultBox = null;
  let statusBox = null;
  let warming = false;
  let quickSearchRunning = false;

  const searchContext = {
    queryRaw: '',
    queryNorm: '',
    results: [],
    index: -1,

    origin: '',

    sessionActive: false
  };

  function rememberSearchContext(raw, results, index = -1) {
    searchContext.queryRaw = String(raw || '');

    searchContext.queryNorm = norm(raw);

    searchContext.results = Array.isArray(results) ? results : [];

    searchContext.index = Number.isInteger(index) ? index : -1;

    searchContext.sessionActive = true;
  }

  function clearSearchContext() {
    searchContext.queryRaw = '';
    searchContext.queryNorm = '';
    searchContext.results = [];
    searchContext.index = -1;
    searchContext.origin = '';
    searchContext.sessionActive = false;

    nativeLastQuery = '';
    nativeLastResults = [];
    nativeResultIndex = -1;
  }

  function log(...args) {
    if (CFG.DEBUG) console.log('[ADDR]', ...args);
  }

  function norm(text) {
    return String(text || '')
      .toLocaleLowerCase('ru')
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compact(text) {
    return norm(text)
      .replace(/(?:^|\s)(?:г|город|ул|улица|д|дом|кв|квартира)\.?(?=\s|$)/g, ' ')
      .replace(/(?:кв|квартира)\.?/g, ' ')
      .replace(/(?:дом|д)\.?/g, ' ')
      .replace(/[^0-9a-zа-я]+/gi, '');
  }

  function normalizeBuildingToken(value) {
    return compact(
      String(value || '')
        .replace(/\([^)]*\)/g, '')
        .trim()
    );
  }

  const STREET_ALIASES = [
    {
      city: 'Костанай',
      target: 'Шакшак Жанибек батыра',
      aliases: [
        'Уральская',
        'Уральская улица',
        'Шакшак Жанибек батыра',
        'Шак-Шак Жанибек батыра',
        'Шақшақ Жәнібек батыр',
        'Шақшақ Жәнібек батыра',
        'Шакшак Жанибек батыр'
      ]
    },
    {
      city: 'Костанай',
      target: 'Кобыланды батыра',
      aliases: [
        'Кобыланды батыра',
        'Кобланды батыра',
        'Кобыланды батыр',
        'Кобланды батыр',
        'Герцена'
      ]
    },
    {
      city: 'Костанай',
      target: 'Сагадата Нурмагамбетова',
      aliases: [
        'Дзержинского',
        'Сагадата Нурмагамбетова',
        'Сагадат Нурмагамбетов',
        'Сағадат Нұрмағамбетов',
        'Сағадата Нұрмағамбетова'
      ]
    },
    {
      city: 'Костанай',
      target: 'Бертрана Рубинштейна',
      aliases: ['Железнодорожная', 'Бертрана Рубинштейна', 'Бертран Рубинштейн']
    },
    {
      city: 'Костанай',
      target: 'Камшат Доненбаевой',
      aliases: ['Авиационная', 'Камшат Доненбаевой']
    }
  ];

  function streetAliasEntries(city) {
    return STREET_ALIASES.filter((x) => !x.city || x.city === city);
  }

  function streetSearchHaystack(item, city = '') {
    const parts = [item?.value || '', item?.textContent || item?.text || ''];

    const current = compact(item?.value || item?.textContent || item?.text || '');

    for (const entry of streetAliasEntries(city)) {
      if (compact(entry.target) !== current) {
        continue;
      }

      parts.push(...entry.aliases);
    }

    return compact(parts.join(' '));
  }

  function optionMatchesFilter(select, option, query) {
    const q = compact(query);

    if (!q) {
      return true;
    }

    if (select?.id === 'supGeoStreet_select') {
      const city = document.getElementById('supGeoCity_select')?.value || '';

      return streetSearchHaystack(option, city).includes(q);
    }

    const hay = compact(`${option.value} ${option.textContent || ''}`);

    return hay.includes(q);
  }

  function canonicalStreetName(city, input) {
    const key = compact(input);

    if (!key) return '';

    for (const entry of streetAliasEntries(city)) {
      for (const alias of entry.aliases) {
        if (compact(alias) === key) {
          return entry.target;
        }
      }
    }

    return String(input || '').trim();
  }

  function matchStreet(streets, city, addressCompact, hints = {}) {
    if (hints.street) {
      const target = compact(canonicalStreetName(city, hints.street));

      const exact = streets.find(
        (item) => compact(item.value) === target || compact(item.text) === target
      );

      return exact
        ? {
            item: exact,
            length: target.length,
            rest: ''
          }
        : null;
    }

    for (const entry of streetAliasEntries(city)) {
      const target = streets.find(
        (item) =>
          compact(item.value) === compact(entry.target) ||
          compact(item.text) === compact(entry.target)
      );

      if (!target) continue;

      for (const alias of entry.aliases) {
        const aliasCompact = compact(alias);

        if (aliasCompact && addressCompact.startsWith(aliasCompact)) {
          return {
            item: target,
            length: aliasCompact.length,
            rest: addressCompact.slice(aliasCompact.length)
          };
        }
      }
    }

    return bestPrefix(streets, addressCompact);
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function cleanAddressSeparators(value) {
    return String(value || '')
      .replace(/\u00A0/g, ' ')
      .replace(/^[\s,;:]+|[\s,;:]+$/g, '')
      .replace(/\s*([,;:])\s*/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractCityFromQuery(rawQuery, cities) {
    const original = String(rawQuery || '')
      .replace(/\u00A0/g, ' ')
      .trim();

    if (!original || !cities?.length) {
      return {
        city: '',
        query: cleanAddressSeparators(original)
      };
    }

    const candidates = [];

    for (const city of cities) {
      for (const name of [city.value, city.text]) {
        const value = String(name || '').trim();

        if (!value) continue;

        const key = norm(value);

        if (
          candidates.some(
            (item) =>
              item.key === key &&
              item.city === city.value
          )
        ) {
          continue;
        }

        candidates.push({
          city: city.value,
          name: value,
          key
        });
      }
    }

    /*
     * Длинные названия проверяем первыми, чтобы условный
     * "Костанай Северный" не проиграл "Костанай".
     */
    candidates.sort(
      (a, b) =>
        b.name.length - a.name.length
    );

    for (const candidate of candidates) {
      const escaped = escapeRegExp(candidate.name);

      /*
       * 1) Город в начале:
       *    Костанай, Абая 10 20
       *    г.Костанай Абая 10 20
       *    Лисаковск1дом16кв23
       *
       * После города разрешаем цифру без пробела специально
       * для старых компактных форматов.
       */
      const startPattern = new RegExp(
        `^(?:г(?:ород)?\\.?\\s*)?(${escaped})(?=$|[\\s,;:]|\\d)`,
        'iu'
      );

      let match = original.match(startPattern);

      if (match) {
        return {
          city: candidate.city,
          query: cleanAddressSeparators(
            original.slice(match[0].length)
          )
        };
      }

      /*
       * 2) Город в конце или середине, отделённый обычным
       *    разделителем:
       *    Абая 10 20, Костанай
       *    Абая 10 20 Костанай
       *
       * Предшествующий разделитель оставляем снаружи match,
       * затем cleanAddressSeparators аккуратно его убирает.
       */
      const anywherePattern = new RegExp(
        `(^|[\\s,;:])(?:г(?:ород)?\\.?\\s*)?(${escaped})(?=$|[\\s,;:])`,
        'iu'
      );

      match = original.match(anywherePattern);

      if (match) {
        const cityStart =
          match.index +
          match[1].length;

        const cityEnd =
          match.index +
          match[0].length;

        return {
          city: candidate.city,
          query: cleanAddressSeparators(
            original.slice(0, cityStart) +
            original.slice(cityEnd)
          )
        };
      }
    }

    return {
      city: '',
      query: cleanAddressSeparators(
        original.replace(
          /^(?:г(?:ород)?\.?)\s*/iu,
          ''
        )
      )
    };
  }


  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseOriginalAppearance(styleText) {
    const style = String(styleText || '');

    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);

    const imageMatch = style.match(/background-image\s*:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i);

    return {
      color: colorMatch ? colorMatch[1].trim() : '',
      icon: imageMatch ? imageMatch[2].trim() : ''
    };
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
          db.createObjectStore(CFG.STORE, { keyPath: 'key' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[WoToM Address] IndexedDB недоступна:', req.error);
        resolve(null);
      };
    });

    return dbPromise;
  }

  async function dbGet(key) {
    const db = await openDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CFG.STORE, 'readonly');
        const req = tx.objectStore(CFG.STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function dbPut(key, items) {
    const db = await openDB();
    if (!db) return;

    try {
      const tx = db.transaction(CFG.STORE, 'readwrite');
      tx.objectStore(CFG.STORE).put({
        key,
        updatedAt: Date.now(),
        items
      });
    } catch (_) {}
  }

  function levelKey(city, street, building) {
    if (!city) return 'cities';
    if (!street) return `streets:${city}`;
    if (!building) return `buildings:${city}|${street}`;
    return `rooms:${city}|${street}|${building}`;
  }

  function parseOptions(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');

    return Array.from(template.content.querySelectorAll('option'))
      .map((o, sourceIndex) => ({
        o,
        sourceIndex
      }))
      .filter((x) => !x.o.disabled)
      .map((x) => ({
        value: String(x.o.value || '').trim(),
        text: String(x.o.textContent || '').trim(),
        onclick: x.o.getAttribute('onclick') || '',
        style: x.o.getAttribute('style') || '',
        sourceIndex: x.sourceIndex
      }));
  }

  async function requestGeo(city = '', street = '', building = '') {
    const data = { city, street, building };

    try {
      if (typeof window.fetchPostRequest === 'function') {
        const html = await window.fetchPostRequest(CFG.GEO_URL, data);
        return parseOptions(html);
      }
    } catch (error) {
      log('fetchPostRequest failed', error);
    }

    const body = new URLSearchParams(data);

    const response = await fetch(CFG.GEO_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return parseOptions(await response.text());
  }

  async function getLevel(city = '', street = '', building = '', options = {}) {
    const key = levelKey(city, street, building);

    const cached = await dbGet(key);

    if (cached?.items?.length && !options.forceFresh) {
      if (options.backgroundRefresh !== false) {
        scheduleRevalidate(city, street, building);
      }

      return cached.items;
    }

    return refreshLevelDedup(city, street, building);
  }

  async function refreshLevel(city = '', street = '', building = '') {
    const key = levelKey(city, street, building);

    const items = await requestGeo(city, street, building);

    await dbPut(key, items);

    return items;
  }

  function refreshLevelDedup(city = '', street = '', building = '') {
    const key = levelKey(city, street, building);

    if (refreshInFlight.has(key)) {
      return refreshInFlight.get(key);
    }

    lastRefreshAttempt.set(key, Date.now());

    const promise = refreshLevel(city, street, building).finally(() => {
      refreshInFlight.delete(key);
    });

    refreshInFlight.set(key, promise);

    return promise;
  }

  function scheduleRevalidate(city = '', street = '', building = '') {
    const key = levelKey(city, street, building);

    const now = Date.now();

    const last = lastRefreshAttempt.get(key) || 0;

    if (refreshInFlight.has(key) || now - last < CFG.REVALIDATE_MIN_MS) {
      return;
    }

    lastRefreshAttempt.set(key, now);

    idle(() => {
      refreshLevelDedup(city, street, building).catch(() => {});
    });
  }

  function idle(callback) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: 1500 });
    } else {
      setTimeout(callback, 0);
    }
  }

  async function warmStreetCache() {
    if (warming) return;
    warming = true;

    try {
      const cities = await getLevel('', '', '', {
        backgroundRefresh: true
      });

      for (const city of cities) {
        await new Promise((resolve) => {
          idle(async () => {
            try {
              await getLevel(city.value, '', '', {
                backgroundRefresh: true
              });
            } catch (_) {}

            resolve();
          });
        });

        await new Promise((r) => setTimeout(r, CFG.STREET_REFRESH_GAP));
      }
    } finally {
      warming = false;
    }
  }

  function parseAddressHints(raw) {
    let source = cleanAddressSeparators(raw);

    const result = {
      street: '',
      apartment: '',
      building: '',
      cleaned: source
    };

    if (!source) {
      return result;
    }

    /*
     * Чистый цифровой slash-triplet:
     * 6/40/504 = улица 6, дом 40, квартира 504.
     *
     * Это правило специально требует, чтобы ВСЯ строка была
     * тремя цифровыми частями. Поэтому дом 28/3 в строке
     * "Кобланды батыра 28/3 30" не развалится на 28 и 3.
     */
    const pureSlashTriplet = source.match(
      /^\s*([0-9]+[а-яА-ЯёЁa-zA-Z]?)\s*\/\s*([0-9]+[а-яА-ЯёЁa-zA-Z]?)\s*\/\s*([0-9]+[а-яА-ЯёЁa-zA-Z_-]*)\s*$/u
    );

    if (pureSlashTriplet) {
      result.street = pureSlashTriplet[1];
      result.building = pureSlashTriplet[2];
      result.apartment = pureSlashTriplet[3];
      result.cleaned = result.street;
      return result;
    }

    /*
     * Чистые цифровые варианты:
     * 1-16-23
     * 3,1,26
     * 1 8 51
     */
    const numericTripletPatterns = [
      /^\s*([0-9]+[а-яА-ЯёЁa-zA-Z]?)\s*[-,;:]\s*([0-9]+(?:[/_][0-9]+)?[а-яА-ЯёЁa-zA-Z]?)\s*[-,;:]\s*([0-9]+[а-яА-ЯёЁa-zA-Z/_()-]*)\s*$/u,
      /^\s*([0-9]+[а-яА-ЯёЁa-zA-Z]?)\s+([0-9]+(?:[/_][0-9]+)?[а-яА-ЯёЁa-zA-Z]?)\s+([0-9]+[а-яА-ЯёЁa-zA-Z/_()-]*)\s*$/u
    ];

    for (const pattern of numericTripletPatterns) {
      const match = source.match(pattern);

      if (match) {
        result.street = match[1];
        result.building = match[2];
        result.apartment = match[3];
        result.cleaned = result.street;
        return result;
      }
    }

    /*
     * Квартира с явным маркером:
     * Береке 79 кв. 194
     * Береке79кв194
     * Кобыланды Батыра 50 кв 45
     */
    const apartmentMarker =
      /(?:квартира|[кk][вv])\.?\s*[:#№-]?\s*([0-9а-яА-ЯёЁa-zA-Z/_()-]+)\s*$/iu;

    const apartmentMatch =
      source.match(apartmentMarker);

    if (apartmentMatch) {
      result.apartment =
        apartmentMatch[1].trim();

      source =
        source
          .slice(
            0,
            apartmentMatch.index
          )
          .trim()
          .replace(/[\s,;:]+$/g, '');
    }

    /*
     * Дом с явным маркером:
     * 1 дом 16 кв 23
     * 1дом16кв23
     */
    const buildingMarker =
      /(?:дом|[дd])\.?\s*[:#№-]?\s*([0-9]+(?:[/_][0-9]+)?[а-яА-ЯёЁa-zA-Z]?)\s*$/iu;

    const buildingMatch =
      source.match(buildingMarker);

    if (buildingMatch) {
      result.building =
        buildingMatch[1]
          .replace(/\s+/g, '');

      source =
        source
          .slice(
            0,
            buildingMatch.index
          )
          .trim()
          .replace(/[\s,;:]+$/g, '');
    }

    /*
     * Если квартира уже известна, хвост source должен быть
     * "улица + дом". Поддерживаем как обычный пробел, так и
     * компактный Береке79.
     */
    if (
      result.apartment &&
      !result.building
    ) {
      const spacedStreetBuilding =
        source.match(
          /^\s*(.+?)\s+([0-9]+(?:\s*[/_]\s*[0-9]+)?[а-яА-ЯёЁa-zA-Z]?)(?:\s*\([^)]*\))?\s*$/u
        );

      if (spacedStreetBuilding) {
        result.street =
          spacedStreetBuilding[1]
            .trim()
            .replace(/[\s,;:]+$/g, '');

        result.building =
          spacedStreetBuilding[2]
            .replace(/\s+/g, '');

        result.cleaned =
          result.street;

        return result;
      }

      const compactStreetBuilding =
        source.match(
          /^\s*(.*[а-яА-ЯёЁa-zA-Z])\s*([0-9]+(?:[/_][0-9]+)?[а-яА-ЯёЁa-zA-Z]?)(?:\s*\([^)]*\))?\s*$/u
        );

      if (compactStreetBuilding) {
        result.street =
          compactStreetBuilding[1]
            .trim()
            .replace(/[\s,;:]+$/g, '');

        result.building =
          compactStreetBuilding[2]
            .replace(/\s+/g, '');

        result.cleaned =
          result.street;

        return result;
      }
    }

    /*
     * Если и дом, и квартира пришли через маркеры,
     * всё оставшееся = улица.
     */
    if (
      result.apartment &&
      result.building
    ) {
      result.street =
        source.trim();

      result.cleaned =
        result.street;

      return result;
    }

    /*
     * Свободные текстовые варианты БЕЗ "кв":
     *
     * Уральская 45Г,149
     * Уральская 45г 0
     * Кобланды батыра 28/3 30
     * Береке, 79, 194
     *
     * Две последние части всегда дом + квартира.
     */
    const namedTriplet =
      source.match(
        /^\s*(.*[а-яА-ЯёЁa-zA-Z].*?)[\s,;]+([0-9]+(?:\s*[/_]\s*[0-9]+)?[а-яА-ЯёЁa-zA-Z]?)(?:\s*\([^)]*\))?[\s,;]+([0-9а-яА-ЯёЁa-zA-Z/_()-]+)\s*$/u
      );

    if (namedTriplet) {
      result.street =
        namedTriplet[1]
          .trim()
          .replace(/[\s,;:]+$/g, '');

      result.building =
        namedTriplet[2]
          .replace(/\s+/g, '');

      result.apartment =
        namedTriplet[3].trim();

      result.cleaned =
        result.street;

      return result;
    }

    /*
     * Только улица + дом, без квартиры.
     * Нужен в том числе для показа самого дома.
     */
    const streetBuilding =
      source.match(
        /^\s*(.*[а-яА-ЯёЁa-zA-Z].*?)[\s,;]+([0-9]+(?:\s*[/_]\s*[0-9]+)?[а-яА-ЯёЁa-zA-Z]?)(?:\s*\([^)]*\))?\s*$/u
      );

    if (streetBuilding) {
      result.street =
        streetBuilding[1]
          .trim()
          .replace(/[\s,;:]+$/g, '');

      result.building =
        streetBuilding[2]
          .replace(/\s+/g, '');

      result.cleaned =
        result.street;

      return result;
    }

    result.cleaned =
      source;

    return result;
  }


  function bestPrefix(items, remainder) {
    let best = null;
    let bestLen = -1;

    for (const item of items) {
      const c = compact(item.value || item.text);
      if (!c) continue;

      if (remainder.startsWith(c) && c.length > bestLen) {
        best = item;
        bestLen = c.length;
      }
    }

    return best
      ? {
          item: best,
          length: bestLen,
          rest: remainder.slice(bestLen)
        }
      : null;
  }

  function detectAction(option) {
    const code = option?.onclick || '';

    let m = code.match(/loadSearchDNum\('([^']+)'\)/i);
    if (m) {
      return {
        kind: 'subscriber',
        id: m[1]
      };
    }

    m = code.match(/loadSearchBld\('([^']+)'\)/i);
    if (m) {
      return {
        kind: 'building',
        id: m[1]
      };
    }

    m = code.match(/loadSearchFlat\('([^']+)'\)/i);
    if (m) {
      return {
        kind: 'flat',
        id: m[1]
      };
    }

    return {
      kind: 'unknown',
      id: ''
    };
  }

  async function resolveInCity(city, addressCompact, progress, hints = {}) {
    const streets = await getLevel(city, '', '', {
      backgroundRefresh: true
    });

    const streetMatch = matchStreet(streets, city, addressCompact, hints);

    if (!streetMatch) return [];

    const street = streetMatch.item.value;

    let afterStreet = hints.street ? '' : streetMatch.rest;

    if (!afterStreet && !hints.building) {
      return [
        {
          kind: 'street',
          city,
          street,
          building: '',
          room: '',
          label: `${city}, ${street}`,
          actionId: ''
        }
      ];
    }

    progress?.(`${city}: ${street}...`);

    const buildings = await getLevel(city, street, '', {
      backgroundRefresh: true
    });

    let building = '';
    let afterBuilding = '';

    if (hints.building) {
      const targetBuilding = normalizeBuildingToken(hints.building);

      const exactBuilding = buildings.find(
        (item) =>
          normalizeBuildingToken(item.value) === targetBuilding ||
          normalizeBuildingToken(item.text) === targetBuilding
      );

      if (!exactBuilding) {
        return [];
      }

      building = exactBuilding.value;

      afterBuilding = afterStreet;
    } else {
      let buildingMatch = null;

      if (hints.apartment) {
        buildingMatch = buildings
          .map((item) => ({
            item,
            c: compact(item.value)
          }))
          .filter((x) => x.c)
          .find((x) => x.c === afterStreet);

        if (buildingMatch) {
          buildingMatch = {
            item: buildingMatch.item,
            length: afterStreet.length,
            rest: ''
          };
        }
      }

      if (!buildingMatch && !hints.apartment) {
        buildingMatch = bestPrefix(buildings, afterStreet);
      }

      if (!buildingMatch) {
        return [];
      }

      building = buildingMatch.item.value;

      afterBuilding = buildingMatch.rest;
    }

    if (hints.apartment) {
      afterBuilding = compact(hints.apartment);
    } else {
      afterBuilding = afterBuilding.replace(/^квартира/i, '').replace(/^кв/i, '');
    }

    if (!afterBuilding) {
      return [
        {
          kind: 'building',
          city,
          street,
          building,
          room: '',
          label: `${city}, ${street}, ${building}`,
          actionId: `${city}/${street}/${building}`
        }
      ];
    }

    progress?.(`${city}: ${street}, ${building}...`);

    const rooms = await getLevel(city, street, building, {
      backgroundRefresh: true
    });

    const roomCompact = compact(afterBuilding);

    const results = [];

    for (const option of rooms) {
      if (!option.value) continue;

      if (compact(option.value) !== roomCompact) {
        continue;
      }

      const action = detectAction(option);

      results.push({
        kind: action.kind,
        city,
        street,
        building,
        room: option.value,
        label: `${city}, ${street}, ${building}, кв. ${option.value}`,
        actionId: action.id,
        rawText: option.text,
        originalStyle: option.style || '',
        originalOnclick: option.onclick || '',
        sourceOptionIndex: Number.isInteger(option.sourceIndex) ? option.sourceIndex : -1
      });
    }

    return results;
  }

  async function getCandidateCitiesForAddress(cities, addressCompact, hints, progress) {
    if (!cities?.length) {
      return [];
    }

    const localMatches = [];

    for (const city of cities) {
      const cache = await dbGet(levelKey(city.value, '', ''));

      if (!cache?.items?.length) {
        continue;
      }

      const streets = cache.items;

      let matched = false;

      matched = !!matchStreet(streets, city.value, addressCompact, hints);

      if (matched) {
        localMatches.push(city.value);
      }
    }

    if (localMatches.length) {
      return localMatches;
    }

    progress?.('Первичное индексирование улиц...');

    const loaded = await Promise.all(
      cities.map(async (city) => {
        try {
          const streets = await getLevel(city.value, '', '', {
            backgroundRefresh: false
          });

          return {
            city: city.value,
            streets
          };
        } catch (_) {
          return {
            city: city.value,
            streets: []
          };
        }
      })
    );

    const matches = [];

    for (const record of loaded) {
      let matched = false;

      matched = !!matchStreet(record.streets, record.city, addressCompact, hints);

      if (matched) {
        matches.push(record.city);
      }
    }

    return matches;
  }

  async function resolveAddress(rawQuery, progress) {
    /*
     * Сначала получаем реальные города WoToM и только после этого
     * отделяем город от адреса. Город может стоять в начале,
     * конце или середине и может быть записан как "г.Костанай".
     */
    const cities = await getLevel('', '', '', {
      backgroundRefresh: true
    });

    if (!cities.length) return [];

    const extracted =
      extractCityFromQuery(
        rawQuery,
        cities
      );

    const hints =
      parseAddressHints(
        extracted.query
      );

    const raw =
      hints.cleaned;

    const qCompact =
      compact(raw);

    if (!qCompact) return [];

    let cityCandidates;

    if (extracted.city) {
      cityCandidates =
        [extracted.city];
    } else {
      cityCandidates =
        await getCandidateCitiesForAddress(
          cities,
          qCompact,
          hints,
          progress
        );
    }

    if (!cityCandidates.length) {
      return [];
    }

    const perCity =
      await Promise.all(
        cityCandidates.map(
          async (city) => {
            progress?.(
              `Проверяю ${city}...`
            );

            try {
              return await resolveInCity(
                city,
                qCompact,
                null,
                hints
              );
            } catch (error) {
              log(
                'resolve city failed',
                city,
                error
              );

              return [];
            }
          }
        )
      );

    const results =
      perCity.flat();

    const unique = [];
    const seen = new Set();

    for (const item of results) {
      const key = [
        item.kind,
        item.city,
        item.street,
        item.building,
        item.room,
        item.actionId
      ].join('|');

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    return unique;
  }


  function optionFromCachedItem(item) {
    const option = document.createElement('option');

    option.value = String(item?.value || '');

    option.textContent = String(item?.text || '');

    if (item?.onclick) {
      option.setAttribute('onclick', item.onclick);
    }

    if (item?.style) {
      option.setAttribute('style', item.style);
    }

    return option;
  }

  function replaceSelectOptions(select, items) {
    if (!select) return;

    const fragment = document.createDocumentFragment();

    for (const item of items || []) {
      fragment.appendChild(optionFromCachedItem(item));
    }

    select.replaceChildren(fragment);
  }

  function clearColumnFilter(selectId) {
    const select = document.getElementById(selectId);

    const input = select?.parentElement?.querySelector('.wsa-select-filter');

    if (input) {
      input.value = '';
    }
  }

  function branchAlreadyMaterialized(item) {
    return (
      nativeLoadedCity === (item.city || '') &&
      nativeLoadedStreet === (item.street || '') &&
      nativeLoadedBuilding === (item.building || '') &&
      !!document.getElementById('supGeoRoom_select')
    );
  }

  async function ensureSearchWindow() {
    if (document.getElementById('userSearchContainer')) {
      installNativeAddressBar();
      installNativeFilters();
      return;
    }

    const openSearch = await waitForFunction('supSearchUI');

    await openSearch();

    installNativeAddressBar();
    installNativeFilters();
  }

  async function materializeAddressBranch(item) {
    await ensureSearchWindow();

    const [streets, buildings, rooms] = await Promise.all([
      item.street
        ? getLevel(item.city, '', '', {
            backgroundRefresh: true
          })
        : Promise.resolve([]),

      item.street && item.building
        ? getLevel(item.city, item.street, '', {
            backgroundRefresh: true
          })
        : Promise.resolve([]),

      item.street && item.building
        ? getLevel(item.city, item.street, item.building, {
            backgroundRefresh: true
          })
        : Promise.resolve([])
    ]);

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        const citySelect = document.getElementById('supGeoCity_select');

        const streetSelect = document.getElementById('supGeoStreet_select');

        const buildingSelect = document.getElementById('supGeoBuilding_select');

        const roomSelect = document.getElementById('supGeoRoom_select');

        clearColumnFilter('supGeoCity_select');
        clearColumnFilter('supGeoStreet_select');
        clearColumnFilter('supGeoBuilding_select');
        clearColumnFilter('supGeoRoom_select');

        if (citySelect) {
          citySelect.value = item.city;
        }

        if (item.street && streetSelect) {
          replaceSelectOptions(streetSelect, streets);

          streetSelect.value = item.street;
        }

        if (item.building && buildingSelect) {
          replaceSelectOptions(buildingSelect, buildings);

          buildingSelect.value = item.building;
        }

        if (item.building && roomSelect) {
          replaceSelectOptions(roomSelect, rooms);
        }

        nativeLoadedCity = item.city || '';

        nativeLoadedStreet = item.street || '';

        nativeLoadedBuilding = item.building || '';

        resolve();
      });
    });
  }

  async function waitForFunction(name, timeout = 10000) {
    const started = Date.now();

    while (Date.now() - started < timeout) {
      if (typeof window[name] === 'function') {
        return window[name];
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    throw new Error(`Функция ${name} не появилась`);
  }

  async function openResult(item) {
    closeModal(true);

    const hasSearchWindow = !!document.getElementById('userSearchContainer');

    if (item.kind === 'subscriber' && item.actionId) {
      if (hasSearchWindow) {
        const load = await waitForFunction('loadSearchDNum');

        openingFromWSA = true;

        try {
          await load(item.actionId);
        } finally {
          openingFromWSA = false;
        }
      } else {
        const openSearch = await waitForFunction('supSearchUI');

        openingFromWSA = true;

        try {
          await openSearch(item.actionId);
        } finally {
          openingFromWSA = false;
        }
      }

      return;
    }

    if (item.kind === 'building') {
      if (!hasSearchWindow) {
        await ensureSearchWindow();
      }

      const loadBuilding = await waitForFunction('loadSearchBld');

      await loadBuilding(item.actionId);

      return;
    }

    await showInAddressPicker(item);
  }

  async function showInAddressPicker(item) {
    closeModal(true);

    await materializeAddressBranch(item);

    if (item.room) {
      const roomSelect = document.getElementById('supGeoRoom_select');

      if (selectExactRoomOption(roomSelect, item)) {
        return;
      }
    }

    if (item.building) {
      const buildingSelect = document.getElementById('supGeoBuilding_select');

      buildingSelect?.focus();
      pulseSelect(buildingSelect);
      return;
    }

    if (item.street) {
      const streetSelect = document.getElementById('supGeoStreet_select');

      streetSelect?.focus();
      pulseSelect(streetSelect);
    }
  }

  let nativeLastQuery = '';
  let nativeLastResults = [];
  let nativeResultIndex = -1;
  let nativeSearchRunning = false;

  let nativeLoadedCity = '';
  let nativeLoadedStreet = '';
  let nativeLoadedBuilding = '';

  function resetNativeCycle() {
    nativeLastQuery = '';
    nativeLastResults = [];
    nativeResultIndex = -1;

    clearSearchContext();
  }

  function pulseSelect(select, duration = 2600) {
    if (!select) return;

    select.classList.remove('wsa-pulse-target');
    void select.offsetWidth;
    select.classList.add('wsa-pulse-target');

    setTimeout(() => {
      select.classList.remove('wsa-pulse-target');
    }, duration);
  }

  function optionActionId(option) {
    if (!option) return '';

    return detectAction({
      onclick: option.getAttribute('onclick') || ''
    }).id;
  }

  function findExactRoomOptionIndex(select, item) {
    if (!select) return -1;

    const options = Array.from(select.options);

    if (item.actionId) {
      const byAction = options.findIndex((option) => optionActionId(option) === item.actionId);

      if (byAction !== -1) {
        return byAction;
      }
    }

    if (item.originalOnclick) {
      const byOnclick = options.findIndex(
        (option) => (option.getAttribute('onclick') || '') === item.originalOnclick
      );

      if (byOnclick !== -1) {
        return byOnclick;
      }
    }

    if (item.rawText) {
      const byText = options.findIndex(
        (option) => String(option.textContent || '').trim() === String(item.rawText).trim()
      );

      if (byText !== -1) {
        return byText;
      }
    }

    if (
      Number.isInteger(item.sourceOptionIndex) &&
      item.sourceOptionIndex >= 0 &&
      item.sourceOptionIndex < options.length
    ) {
      const option = options[item.sourceOptionIndex];

      if (String(option.value || '') === String(item.room || '')) {
        return item.sourceOptionIndex;
      }
    }

    return options.findIndex((option) => String(option.value || '') === String(item.room || ''));
  }

  function selectExactRoomOption(select, item) {
    if (!select) return false;

    const index = findExactRoomOptionIndex(select, item);

    if (index < 0) {
      return false;
    }

    select.selectedIndex = index;

    const option = select.options[index];

    try {
      option.scrollIntoView({
        block: 'nearest'
      });
    } catch (_) {}

    select.focus();
    pulseSelect(select);

    return true;
  }

  async function showInAddressPickerKeepWindow(item) {
    if (!branchAlreadyMaterialized(item)) {
      await materializeAddressBranch(item);
    }

    if (item.room) {
      const roomSelect = document.getElementById('supGeoRoom_select');

      if (selectExactRoomOption(roomSelect, item)) {
        return;
      }
    }

    if (item.building) {
      const buildingSelect = document.getElementById('supGeoBuilding_select');

      buildingSelect?.focus();
      pulseSelect(buildingSelect);
      return;
    }

    if (item.street) {
      const streetSelect = document.getElementById('supGeoStreet_select');

      streetSelect?.focus();
      pulseSelect(streetSelect);
    }
  }

  async function runNativeAddressSearch() {
    if (nativeSearchRunning) {
      return;
    }

    nativeSearchRunning = true;

    try {
      const input = document.getElementById('wsa-native-address-input');

      const status = document.getElementById('wsa-native-address-status');

      if (!input) return;

      const raw = input.value.trim();

      if (!raw) return;

      const normalized = norm(raw);

      if (normalized !== nativeLastQuery) {
        nativeLastQuery = normalized;

        nativeResultIndex = -1;

        if (searchContext.queryNorm === normalized && searchContext.results.length) {
          nativeLastResults = searchContext.results.slice();

          nativeResultIndex = Number.isInteger(searchContext.index) ? searchContext.index : -1;
        } else {
          nativeLastResults = [];

          if (status) {
            status.textContent = 'Ищу...';
          }

          nativeLastResults = await resolveAddress(raw, (text) => {
            if (status) {
              status.textContent = text;
            }
          });

          rememberSearchContext(raw, nativeLastResults, -1);
        }

        if (!nativeLastResults.length) {
          if (status) {
            status.textContent = 'Ничего не найдено';
          }

          return;
        }
      }

      nativeResultIndex = (nativeResultIndex + 1) % nativeLastResults.length;

      rememberSearchContext(raw, nativeLastResults, nativeResultIndex);

      searchContext.origin = 'native';

      const item = nativeLastResults[nativeResultIndex];

      if (!document.getElementById('supGeoCity_select')?.value) {
        nativeLoadedCity = '';
        nativeLoadedStreet = '';
        nativeLoadedBuilding = '';
      }

      if (status) {
        status.textContent =
          nativeLastResults.length > 1
            ? `${nativeResultIndex + 1}/${nativeLastResults.length}`
            : '1/1';

        status.title = item.label;
      }

      await showInAddressPickerKeepWindow(item);
    } finally {
      nativeSearchRunning = false;
    }
  }

  function setStatus(text) {
    if (statusBox) statusBox.textContent = text || '';
  }

  function extractContractNumber(item) {
    const raw = String(item?.rawText || '');

    const match = raw.match(/\[([^\]]+)\]/);

    return match ? match[1].trim() : '';
  }

  async function copyPlainText(text) {
    const value = String(text || '');

    if (!value) return false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);

        return true;
      }
    } catch (_) {}

    const area = document.createElement('textarea');

    area.value = value;

    area.setAttribute('readonly', '');

    Object.assign(area.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0',
      opacity: '0'
    });

    document.body.appendChild(area);

    area.select();

    let ok = false;

    try {
      ok = document.execCommand('copy');
    } catch (_) {}

    area.remove();

    return ok;
  }

  function renderResults(items) {
    if (!resultBox) return;

    if (!items.length) {
      resultBox.innerHTML = `
                <div class="wsa-empty">
                    Ничего не найдено. Попробуй указать город либо разделить улицу, дом и квартиру.
                </div>
            `;
      return;
    }

    resultBox.innerHTML = '';

    items.forEach((item, itemIndex) => {
      const row = document.createElement('div');

      row.className = 'wsa-result';

      let badge = 'Адрес';

      const contractNumber = item.kind === 'subscriber' ? extractContractNumber(item) : '';

      if (item.kind === 'subscriber') {
        badge = 'Абонент';
      } else if (item.kind === 'flat') {
        badge = 'Без договора';
      } else if (item.kind === 'building') {
        badge = 'Дом';
      } else if (item.kind === 'street') {
        badge = 'Улица';
      }

      const appearance = parseOriginalAppearance(item.originalStyle);

      const originalColor = appearance.color;

      const originalIcon = appearance.icon;

      row.innerHTML = `
                <div class="wsa-result-main">
                    <span class="wsa-result-counter">
                        ${itemIndex + 1}/${items.length}
                    </span>

                    <span class="wsa-native-icon-wrap">
                        ${
                          originalIcon
                            ? `<span
                                        class="wsa-native-icon"
                                        style="background-image:url(&quot;${escapeHTML(originalIcon)}&quot;)"
                                   ></span>`
                            : ''
                        }
                    </span>

                    <span class="wsa-badge">
                        ${escapeHTML(badge)}
                    </span>

                    <span
                        class="wsa-address"
                        ${originalColor ? `style="color:${escapeHTML(originalColor)} !important"` : ''}
                    >
                        ${escapeHTML(item.label)}
                    </span>

                    ${
                      contractNumber
                        ? `
                                <button
                                    type="button"
                                    class="wsa-contract"
                                    data-contract="${escapeHTML(contractNumber)}"
                                    title="Нажмите, чтобы скопировать номер договора"
                                >
                                    ${escapeHTML(contractNumber)}
                                </button>
                              `
                        : `<span class="wsa-contract-placeholder"></span>`
                    }
                </div>

                <div class="wsa-actions">
                    <button
                        type="button"
                        class="wsa-action-show"
                    >
                        Показать
                    </button>

                    ${
                      item.kind === 'subscriber' || item.kind === 'building'
                        ? `
                                <button
                                    type="button"
                                    class="wsa-action-open"
                                >
                                    Открыть
                                </button>
                              `
                        : ''
                    }
                </div>
            `;

      const contractButton = row.querySelector('.wsa-contract');

      contractButton?.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const number = contractButton.dataset.contract || '';

        const copied = await copyPlainText(number);

        if (!copied) {
          return;
        }

        contractButton.textContent = `✓ ${number}`;

        contractButton.classList.add('wsa-contract-copied');

        setTimeout(() => {
          if (!contractButton.isConnected) {
            return;
          }

          contractButton.textContent = number;

          contractButton.classList.remove('wsa-contract-copied');
        }, 900);
      });

      row.querySelector('.wsa-action-show')?.addEventListener('click', (event) => {
        event.stopPropagation();

        rememberSearchContext(quickInput?.value || searchContext.queryRaw, items, itemIndex);

        searchContext.origin = 'all';

        showInAddressPicker(item).catch((error) => {
          console.error('[WoToM Address] show failed', error);
        });
      });

      row.querySelector('.wsa-action-open')?.addEventListener('click', (event) => {
        event.stopPropagation();

        rememberSearchContext(quickInput?.value || searchContext.queryRaw, items, itemIndex);

        searchContext.origin = 'all';

        openResult(item).catch((error) => {
          console.error('[WoToM Address] open failed', error);
        });
      });

      row.addEventListener('click', () => {
        rememberSearchContext(quickInput?.value || searchContext.queryRaw, items, itemIndex);

        searchContext.origin = 'all';

        showInAddressPicker(item).catch((error) => {
          console.error('[WoToM Address] show failed', error);
        });
      });

      resultBox.appendChild(row);
    });
  }

  async function runQuickSearch() {
    if (quickSearchRunning) {
      return;
    }

    quickSearchRunning = true;

    try {
      const value = quickInput?.value?.trim() || '';
      if (!value) return;

      resultBox.innerHTML = '';

      try {
        const normalized = norm(value);

        let results;

        if (searchContext.queryNorm === normalized && searchContext.results.length) {
          results = searchContext.results.slice();

          setStatus(`${results.length} совпад.`);
        } else {
          setStatus('Разбираю адрес...');

          results = await resolveAddress(value, setStatus);

          rememberSearchContext(value, results, -1);

          setStatus(results.length ? `${results.length} совпад.` : 'Совпадений нет');
        }

        renderResults(results);
      } catch (error) {
        console.error('[WoToM Address] search failed', error);
        setStatus('Ошибка поиска');
        renderResults([]);
      }
    } finally {
      quickSearchRunning = false;
    }
  }

  function ensureStyles() {
    if (document.getElementById('wotomSmartAddressCSS')) return;

    const style = document.createElement('style');
    style.id = 'wotomSmartAddressCSS';
    style.textContent = `
            

            #wsa-overlay {
                position: fixed;
                inset: 0;
                z-index: 200000;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 7vh;
                background: rgba(0, 0, 0, .18);
                box-sizing: border-box;
            }

            #wsa-modal button {
                margin: 0 !important;
                margin-top: 0 !important;
                margin-bottom: 0 !important;
                margin-block: 0 !important;
                align-self: center !important;
                box-sizing: border-box !important;
            }

            #wsa-modal .wsa-actions {
                top: 50% !important;
                transform: translateY(-50%) !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            #wsa-modal .wsa-action-show,
            #wsa-modal .wsa-action-open {
                width: 88px !important;
                min-width: 88px !important;
                max-width: 88px !important;
            }

            #wsa-modal .wsa-actions > button {
                margin: 0 !important;
                margin-top: 0 !important;
                margin-bottom: 0 !important;
                margin-block: 0 !important;
                top: auto !important;
                bottom: auto !important;
                transform: none !important;
            }

            #wsa-modal {
                width: min(980px, calc(100vw - 20px));
                max-height: 70vh;
                overflow: hidden;
                background: #fff;
                color: #222;
                border: 1px solid #bbb;
                border-radius: 7px;
                box-shadow: 0 8px 28px rgba(0,0,0,.22);
                font-family: Arial, sans-serif;
            }

            .wsa-head {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px;
                border-bottom: 1px solid #ddd;
            }

            #wsa-input {
                flex: 1;
                min-width: 0;
                height: 34px;
                padding: 0 10px;
                font-size: 14px;
                border: 1px solid #aaa;
                border-radius: 5px;
                outline: none;
                box-sizing: border-box;
            }

            #wsa-input:focus {
                border-color: #5577aa;
                box-shadow: 0 0 0 2px rgba(80,120,180,.12);
            }

            .wsa-search-btn,
            .wsa-close-btn {
                height: 34px;
                border: 0;
                border-radius: 5px;
                cursor: pointer;
            }

            .wsa-search-btn {
                min-width: 72px;
                padding: 0 13px;
                background: #3f6fa8;
                color: #fff;
                font-weight: 700;
            }

            .wsa-close-btn {
                width: 34px;
                background: #eee;
                color: #333;
                font-size: 17px;
            }

            #wsa-status {
                min-height: 20px;
                padding: 4px 9px;
                box-sizing: border-box;
                font-size: 10px;
                line-height: 12px;
                color: #777;
                border-bottom: 1px solid #eee;
            }

            #wsa-results {
                padding: 5px;
                overflow-y: auto;
                max-height: calc(70vh - 80px);
            }

            #wsa-results:empty {
                display: none;
            }

            .wsa-result {
                position: relative !important;
                width: 100%;
                min-height: 36px;
                display: flex;
                padding-right: 190px !important;
                align-items: center !important;
                justify-content: space-between;
                gap: 7px;
                padding: 4px 5px;
                margin: 0 0 3px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: #fff;
                color: #222;
                box-sizing: border-box;
                cursor: pointer;
            }

            .wsa-result:last-child {
                margin-bottom: 0;
            }

            .wsa-result:hover {
                background: #f5f8fb;
                border-color: #b9cae0;
            }

            .wsa-result-main {
                min-width: 0;
                width: 100%;
                flex: 1 1 auto;
                display: grid !important;
                grid-template-columns:
                    34px
                    26px
                    76px
                    minmax(220px, 1fr)
                    minmax(88px, 130px) !important;
                align-items: center !important;
                column-gap: 6px !important;
                display: grid;
                grid-template-columns: 30px 24px 70px minmax(260px, 1fr) minmax(92px, auto);
                align-items: center;
                gap: 5px;
            }

            .wsa-result-counter {
                font-size: 10px;
                color: #888;
                white-space: nowrap;
                text-align: center;
            }

            .wsa-native-icon-wrap {
                width: 22px;
                height: 22px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .wsa-native-icon {
                width: 20px;
                height: 20px;
                display: inline-block;
                background-repeat: no-repeat;
                background-position: center;
                background-size: contain;
            }

            .wsa-badge {
                font-size: 9px;
                text-align: center;
                padding: 3px 5px;
                border-radius: 10px;
                background: #edf1f5;
                color: #506070;
                white-space: nowrap;
            }

            .wsa-address {
                min-width: 0;
                font-size: 12px;
                font-weight: 700;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .wsa-address {
                min-width: 0 !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            .wsa-contract {
                justify-self: stretch !important;
                width: 100% !important;
                min-width: 88px !important;
                max-width: 130px !important;
                height: 22px !important;
                min-height: 22px !important;
                margin: 0 !important;
                padding: 0 7px !important;
                border: 1px solid #c9d3df !important;
                border-radius: 11px !important;
                background: #f3f6f9 !important;
                color: #385979 !important;
                font-size: 10px !important;
                line-height: 20px !important;
                font-weight: 700 !important;
                font-family: inherit !important;
                box-sizing: border-box !important;
                cursor: copy !important;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .wsa-contract:hover {
                background: #e8eef5 !important;
                border-color: #aebfd1 !important;
            }

            .wsa-contract-copied {
                background: #edf7ef !important;
                border-color: #b7d7bd !important;
                color: #377443 !important;
            }

            .wsa-contract-placeholder {
                width: 0;
                height: 0;
            }

            .wsa-actions {
                position: absolute !important;
                right: 5px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: flex-end !important;
                gap: 4px !important;
                height: 26px !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            .wsa-action-show,
            .wsa-action-open {
                height: 26px !important;
                min-height: 26px !important;
                min-width: 62px;
                margin: 0 !important;
                padding: 0 8px !important;
                border-radius: 4px;
                border: 1px solid #cbd3dc;
                cursor: pointer;
                font-size: 10px;
                line-height: 24px !important;
                vertical-align: middle !important;
                box-sizing: border-box !important;
                white-space: nowrap;
            }

            .wsa-action-show {
                background: #f5f7fa;
                color: #355f8c;
            }

            .wsa-action-open {
                background: #3f6fa8;
                color: #fff;
                border-color: #3f6fa8;
            }

            #wsa-results .wsa-actions > button {
                position: static !important;
                top: auto !important;
                bottom: auto !important;
                transform: none !important;
                float: none !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin-top: 0 !important;
                margin-bottom: 0 !important;
                vertical-align: middle !important;
            }

            #wsa-results .wsa-result {
                align-items: center !important;
            }

            .wsa-empty {
                padding: 15px 12px;
                text-align: center;
                font-size: 11px;
                color: #777;
            }

            

            .wsa-address-title-row {
                min-height: 30px;
                display: flex !important;
                align-items: center !important;
                gap: 10px;
                font-size: 18px !important;
                box-sizing: border-box;
            }

            .wsa-address-title-caption {
                flex: 0 0 auto;
                white-space: nowrap;
            }

            #wsa-native-address-bar {
                min-width: 0;
                flex: 1 1 auto;
                display: flex;
                align-items: center;
                gap: 4px;
                margin: 0 0 0 auto;
                box-sizing: border-box;
            }

            #wsa-native-address-input {
                min-width: 160px;
                flex: 1 1 260px;
                height: 28px;
                padding: 0 7px;
                border: 1px solid #aaa;
                border-radius: 4px;
                font-size: 12px;
                box-sizing: border-box;
                background: #fff;
                color: #222;
            }

            #wsa-native-address-find,
            #wsa-native-address-list {
                height: 28px;
                margin: 0 !important;
                padding: 0 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                white-space: nowrap;
            }

            #wsa-native-address-find {
                min-width: 58px;
                border: 0;
                background: var(--modColor, #5577aa);
                color: #fff;
            }

            #wsa-native-address-list {
                min-width: 42px;
                border: 1px solid #aaa;
                background: #fff;
                color: #333;
            }

            #wsa-native-address-status {
                flex: 0 0 auto;
                min-width: 34px;
                max-width: 150px;
                padding: 3px 5px;
                border-radius: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 10px;
                color: #666;
                background: rgba(0,0,0,.04);
            }

            #supGeoSearch {
                height: 340px !important;
                margin-top: 4px !important;
                overflow: hidden !important;
            }

            #supGeoSearch > div,
            #supGeoSearch > div > div {
                height: 100% !important;
            }

            #supGeoSearch > div > div > div {
                vertical-align: top !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
            }

            .wsa-select-filter {
                display: block !important;
                width: calc(100% - 5px) !important;
                height: 24px !important;
                min-height: 24px !important;
                box-sizing: border-box !important;
                margin: 0 0 4px !important;
                padding: 2px 6px !important;
                border: 1px solid #aaa !important;
                border-radius: 3px !important;
                font-size: 11px !important;
                line-height: 18px !important;
                background: #fff !important;
                color: #222 !important;
            }

            #supGeoCity_select,
            #supGeoStreet_select,
            #supGeoBuilding_select,
            #supGeoRoom_select {
                width: calc(100% - 5px) !important;
                height: 312px !important;
                max-height: 312px !important;
                box-sizing: border-box !important;
                vertical-align: top !important;
                margin: 0 !important;
            }

            #supGeoRoom_select {
                width: 100% !important;
            }

            @keyframes wsaPulseFound {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(245,185,66,0);
                    outline-color: rgba(245,185,66,0);
                }
                25%, 75% {
                    box-shadow: 0 0 0 4px rgba(245,185,66,.22);
                    outline-color: #f5b942;
                }
            }

            .wsa-pulse-target {
                outline: 2px solid #f5b942 !important;
                animation: wsaPulseFound .55s ease-in-out 4 !important;
            }

            

            .wsa-toolbar-cell {
                display: table-cell;
                width: 50px;
                height: 50px;
            }

            .wsa-toolbar-button {
                width: 48px;
                height: 48px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 5px;
            }

            .wsa-toolbar-button:hover {
                background: rgba(255,255,255,.18);
            }

            .wsa-toolbar-button svg {
                width: 31px;
                height: 31px;
                stroke: #666;
            }
        `;

    (document.head || document.documentElement).appendChild(style);
  }

  function openModal() {
    searchContext.sessionActive = true;
    ensureStyles();

    if (modal) {
      quickInput?.focus();
      quickInput?.select();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'wsa-overlay';
    overlay.innerHTML = `
            <div id="wsa-modal">
                <div class="wsa-head">
                    <input
                        id="wsa-input"
                        type="text"
                        autocomplete="off"
                        placeholder="Например: г.Лисаковск 1-16-23 или Береке79кв194"
                    >
                    <button type="button" class="wsa-search-btn">Найти</button>
                    <button type="button" class="wsa-close-btn" title="Закрыть">×</button>
                </div>
                <div id="wsa-status">
                    Можно писать адрес почти как угодно. Город необязателен.
                </div>
                <div id="wsa-results"></div>
            </div>
        `;

    document.body.appendChild(overlay);

    modal = overlay;
    quickInput = overlay.querySelector('#wsa-input');
    resultBox = overlay.querySelector('#wsa-results');
    statusBox = overlay.querySelector('#wsa-status');

    overlay.querySelector('.wsa-search-btn').addEventListener('click', runQuickSearch);

    overlay.querySelector('.wsa-close-btn').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      closeModal(false);
    });

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) closeModal();
    });

    quickInput.addEventListener('input', () => {
      if (norm(quickInput.value) !== searchContext.queryNorm) {
        clearSearchContext();
      }
    });

    quickInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runQuickSearch();
      }

      if (event.key === 'Escape') {
        closeModal();
      }
    });

    if (searchContext.queryRaw) {
      quickInput.value = searchContext.queryRaw;

      if (searchContext.results.length) {
        setStatus(`${searchContext.results.length} совпад.`);

        renderResults(searchContext.results);
      }
    }

    quickInput.focus();
    quickInput.select();

    if (!warming) {
      warmStreetCache().catch(() => {});
    }
  }

  function closeModal(preserveContext = false) {
    modal?.remove();
    modal = null;
    quickInput = null;
    resultBox = null;
    statusBox = null;

    if (!preserveContext) {
      clearSearchContext();
    }
  }

  function installNativeAddressBar() {
    const host = document.getElementById('supGeoSearch');

    if (!host || document.getElementById('wsa-native-address-bar')) {
      return;
    }

    const bar = document.createElement('div');

    bar.id = 'wsa-native-address-bar';

    bar.innerHTML = `
            <input
                id="wsa-native-address-input"
                type="text"
                autocomplete="off"
                placeholder="Быстрый адрес: Береке79кв194"
            >
            <button
                type="button"
                id="wsa-native-address-find"
                title="Повторное нажатие переходит к следующему совпадению"
            >
                Найти
            </button>
            <button
                type="button"
                id="wsa-native-address-list"
                title="Показать все совпадения отдельным списком"
            >
                Все
            </button>
            <span id="wsa-native-address-status"></span>
        `;

    const title = host.previousElementSibling;

    if (title) {
      title.classList.add('wsa-address-title-row');

      if (!title.querySelector('.wsa-address-title-caption')) {
        const caption = document.createElement('span');

        caption.className = 'wsa-address-title-caption';

        caption.textContent = String(title.textContent || 'Выбор по адресу:').trim();

        title.textContent = '';
        title.appendChild(caption);
      }

      title.appendChild(bar);
    } else {
      host.insertAdjacentElement('beforebegin', bar);
    }

    const input = bar.querySelector('#wsa-native-address-input');

    if (searchContext.queryRaw) {
      input.value = searchContext.queryRaw;
    }

    const findBtn = bar.querySelector('#wsa-native-address-find');

    const nativeStatus = bar.querySelector('#wsa-native-address-status');

    if (nativeStatus && searchContext.results.length) {
      const currentIndex = Math.max(
        0,
        Math.min(searchContext.index, searchContext.results.length - 1)
      );

      nativeStatus.textContent = `${currentIndex + 1}/${searchContext.results.length}`;

      nativeStatus.title = searchContext.results[currentIndex]?.label || '';
    }

    const listBtn = bar.querySelector('#wsa-native-address-list');

    input.addEventListener('input', resetNativeCycle);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();

        runNativeAddressSearch().catch((error) =>
          console.error('[WoToM Address] native search failed', error)
        );
      }
    });

    findBtn.addEventListener('click', () => {
      runNativeAddressSearch().catch((error) =>
        console.error('[WoToM Address] native search failed', error)
      );
    });

    listBtn.addEventListener('click', () => {
      const raw = input.value.trim();

      openModal();

      if (!quickInput || !raw) {
        return;
      }

      quickInput.value = raw;

      const normalized = norm(raw);

      if (searchContext.queryNorm === normalized && searchContext.results.length) {
        setStatus(`${searchContext.results.length} совпад.`);

        renderResults(searchContext.results);

        return;
      }

      runQuickSearch();
    });
  }

  const FILTER_TARGETS = [
    ['supGeoCity_select', 'Поиск города...'],
    ['supGeoStreet_select', 'Поиск улицы...'],
    ['supGeoBuilding_select', 'Поиск дома...'],
    ['supGeoRoom_select', 'Поиск квартиры...']
  ];

  function filterSelect(select, query) {
    const q = compact(query);
    const visible = [];

    for (const option of select.options) {
      if (!q) {
        option.hidden = false;

        if (!option.disabled) {
          visible.push(option);
        }

        continue;
      }

      const match = optionMatchesFilter(select, option, q);

      option.hidden = !match;

      if (match && !option.disabled) {
        visible.push(option);
      }
    }

    if (q && visible.length === 1 && select.id !== 'supGeoRoom_select') {
      const option = visible[0];

      const index = Array.prototype.indexOf.call(select.options, option);

      if (index >= 0 && select.selectedIndex !== index) {
        select.selectedIndex = index;
      }

      try {
        if (typeof window.supCallOptionOnClick === 'function') {
          window.supCallOptionOnClick(select);
        } else {
          const code = option.getAttribute('onclick');

          if (code) {
            new Function(code).call(option);
          }
        }
      } catch (error) {
        console.error('[WoToM Address] auto-select failed', error);
      }
    }

    return visible.length;
  }

  function attachSelectFilter(select, placeholder) {
    if (!select || select.dataset.wsaFilter === '1') return;

    select.dataset.wsaFilter = '1';

    select.addEventListener(
      'change',
      () => {
        if (select.id === 'supGeoCity_select') {
          nativeLoadedCity = String(select.value || '');
          nativeLoadedStreet = '';
          nativeLoadedBuilding = '';
        } else if (select.id === 'supGeoStreet_select') {
          nativeLoadedStreet = String(select.value || '');
          nativeLoadedBuilding = '';
        } else if (select.id === 'supGeoBuilding_select') {
          nativeLoadedBuilding = String(select.value || '');
        }
      },
      true
    );

    if (select.parentElement) {
      select.parentElement.style.verticalAlign = 'top';
      select.parentElement.style.overflow = 'hidden';
    }

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'wsa-select-filter';
    input.placeholder = placeholder;
    input.autocomplete = 'off';

    select.parentElement?.insertBefore(input, select);

    let lastAutoKey = '';

    function applyFilter(allowAuto = true) {
      const q = compact(input.value);

      const count = filterSelect(select, allowAuto ? input.value : '');

      const key = `${q}|${count}|${select.value}`;

      if (allowAuto) {
        lastAutoKey = key;
      }

      return count;
    }

    input.addEventListener('input', () => {
      const q = compact(input.value);

      const visible = [];

      for (const option of select.options) {
        if (!q) {
          option.hidden = false;

          if (!option.disabled) {
            visible.push(option);
          }

          continue;
        }

        const match = optionMatchesFilter(select, option, q);

        option.hidden = !match;

        if (match && !option.disabled) {
          visible.push(option);
        }
      }

      const key = `${q}|${visible.length}|${visible[0]?.value || ''}`;

      if (q && visible.length === 1 && select.id !== 'supGeoRoom_select' && key !== lastAutoKey) {
        lastAutoKey = key;

        const option = visible[0];

        select.selectedIndex = Array.prototype.indexOf.call(select.options, option);

        try {
          if (typeof window.supCallOptionOnClick === 'function') {
            window.supCallOptionOnClick(select);
          }
        } catch (error) {
          console.error('[WoToM Address] auto-select failed', error);
        }
      }
    });
  }

  function installNativeFilters() {
    ensureStyles();

    for (const [id, placeholder] of FILTER_TARGETS) {
      attachSelectFilter(document.getElementById(id), placeholder);
    }
  }

  function installToolbarButton() {
    if (document.getElementById('wsa-toolbar-cell')) return;

    const toolbar = document.getElementById('sup_toolbar');
    if (!toolbar) return;

    const row = toolbar.querySelector('div[style*="display: table-row"]');
    if (!row) return;

    const originalSearchCell = row.querySelector('.ttButton2')?.parentElement;

    if (!originalSearchCell) return;

    const cell = document.createElement('div');
    cell.id = 'wsa-toolbar-cell';
    cell.className = 'wsa-toolbar-cell';
    cell.innerHTML = `
            <div
                class="wsa-toolbar-button tooltip"
                title="Быстрый поиск по адресу"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="10.5" cy="10.5" r="6.5"></circle>
                    <line x1="15.5" y1="15.5" x2="21" y2="21"></line>
                    <path d="M7.5 10.5h6M10.5 7.5v6"></path>
                </svg>
            </div>
        `;

    originalSearchCell.insertAdjacentElement('afterend', cell);

    cell.querySelector('.wsa-toolbar-button').addEventListener('click', openModal);
  }

  let returnPatched = false;
  let unmsgPatched = false;
  let searchUIPatched = false;
  let loadSearchDNumPatched = false;

  let openingFromWSA = false;

  let searchLifetimeObserver = null;
  let observedSearchContainer = null;

  function watchCurrentSearchLifetime() {
    const container = document.getElementById('userSearchContainer');

    if (!container) {
      return;
    }

    if (observedSearchContainer === container && searchLifetimeObserver) {
      return;
    }

    searchLifetimeObserver?.disconnect();

    observedSearchContainer = container;

    const parent = container.parentNode;

    if (!parent) {
      return;
    }

    searchLifetimeObserver = new MutationObserver(() => {
      if (document.contains(container)) {
        return;
      }

      searchLifetimeObserver?.disconnect();

      searchLifetimeObserver = null;

      observedSearchContainer = null;

      closeModal(true);

      clearSearchContext();

      nativeLoadedCity = '';
      nativeLoadedStreet = '';
      nativeLoadedBuilding = '';
    });

    searchLifetimeObserver.observe(parent, {
      childList: true
    });
  }

  function restoreNativeSearchContext() {
    const input = document.getElementById('wsa-native-address-input');

    if (input && searchContext.queryRaw) {
      input.value = searchContext.queryRaw;
    }

    const status = document.getElementById('wsa-native-address-status');

    if (status && searchContext.results.length) {
      const index = Math.max(0, Math.min(searchContext.index, searchContext.results.length - 1));

      status.textContent = `${index + 1}/${searchContext.results.length}`;

      status.title = searchContext.results[index]?.label || '';
    }
  }

  function installSearchUIEnhancements() {
    installNativeAddressBar();
    installNativeFilters();
    restoreNativeSearchContext();
    watchCurrentSearchLifetime();
  }

  function patchReturnToSearch() {
    if (returnPatched || typeof window.returnToSearch !== 'function') {
      return false;
    }

    const original = window.returnToSearch;

    window.returnToSearch = function (...args) {
      const origin = searchContext.origin;

      const result = original.apply(this, args);

      installSearchUIEnhancements();

      if (origin === 'all' && searchContext.results.length) {
        openModal();

        if (quickInput) {
          quickInput.value = searchContext.queryRaw;
        }

        setStatus(`${searchContext.results.length} совпад.`);

        renderResults(searchContext.results);
      } else if (origin === 'native') {
        restoreNativeSearchContext();
      }

      return result;
    };

    returnPatched = true;
    return true;
  }

  function patchUnmsgblock() {
    if (unmsgPatched || typeof window.unmsgblock !== 'function') {
      return false;
    }

    const original = window.unmsgblock;

    window.unmsgblock = function (...args) {
      const hadSearchContext =
        searchContext.sessionActive ||
        searchContext.origin === 'all' ||
        !!document.getElementById('userSearchContainer');

      const result = original.apply(this, args);

      if (hadSearchContext) {
        closeModal(true);
        clearSearchContext();

        nativeLoadedCity = '';
        nativeLoadedStreet = '';
        nativeLoadedBuilding = '';
      }

      return result;
    };

    unmsgPatched = true;
    return true;
  }

  function patchLoadSearchDNum() {
    if (loadSearchDNumPatched || typeof window.loadSearchDNum !== 'function') {
      return false;
    }

    const original = window.loadSearchDNum;

    window.loadSearchDNum = async function (...args) {
      if (!openingFromWSA) {
        searchContext.origin = '';
        searchContext.sessionActive = false;
      }

      return await original.apply(this, args);
    };

    loadSearchDNumPatched = true;
    return true;
  }

  function patchSupSearchUI() {
    if (searchUIPatched || typeof window.supSearchUI !== 'function') {
      return false;
    }

    const original = window.supSearchUI;

    window.supSearchUI = async function (...args) {
      const result = await original.apply(this, args);

      installSearchUIEnhancements();

      return result;
    };

    searchUIPatched = true;
    return true;
  }

  function patchWoToMFunctions() {
    const ready =
      patchReturnToSearch() && patchUnmsgblock() && patchSupSearchUI() && patchLoadSearchDNum();

    return ready;
  }

  function boot() {
    ensureStyles();
    installToolbarButton();

    if (!patchWoToMFunctions()) {
      let attempts = 0;

      const patchTimer = setInterval(() => {
        attempts++;

        if (patchWoToMFunctions() || attempts >= 40) {
          clearInterval(patchTimer);
        }
      }, 100);
    }

    if (document.getElementById('userSearchContainer')) {
      installSearchUIEnhancements();
    }

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
          const target = event.target;

          const typing =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target?.isContentEditable;

          if (!typing) {
            event.preventDefault();
            openModal();
          }
        }
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

