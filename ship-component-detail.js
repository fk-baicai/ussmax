(function () {
    if (typeof document === 'undefined') return;

    var API_BASE = (
        (typeof window !== 'undefined' &&
            (window.USS_SC_COMPONENTS_API_BASE || window.USS_AUTH_API_BASE || window.USS_REGISTER_API_BASE)) ||
        ''
    ).replace(/\/$/, '');

    var els = {
        gate: document.getElementById('scDetailGate'),
        article: document.getElementById('scDetailArticle'),
        typeBadge: document.getElementById('scDetailTypeBadge'),
        titleZh: document.getElementById('scDetailTitleZh'),
        titleEn: document.getElementById('scDetailTitleEn'),
        highlights: document.getElementById('scDetailHighlights'),
        basics: document.getElementById('scDetailBasics'),
        specs: document.getElementById('scDetailSpecs'),
        locations: document.getElementById('scDetailLocations'),
        blueprint: document.getElementById('scDetailBlueprint'),
        footnote: document.getElementById('scDetailFootnote'),
        media: document.getElementById('scDetailMedia'),
        imageBtn: document.getElementById('scDetailImageBtn'),
        image: document.getElementById('scDetailImage'),
    };

    var currentImageLightboxSrc = '';

    function isPlaceholderItemName(s) {
        var v = String(s || '').trim();
        if (!v) return false;
        if (/\[(?:PH|WIP|TMP|TBD|TODO)\]/i.test(v)) return true;
        if (/WCPR-Made|XIAN Nox Cooler Name/i.test(v)) return true;
        return false;
    }

    function resolveDetailDisplayName(item) {
        var zh = String((item && item.name_zh) || '').trim();
        var en = String((item && item.name_en) || '').trim();
        if (isPlaceholderItemName(zh)) zh = '';
        var primary = zh || en || '—';
        var subtitle = en && en !== primary ? en : '';
        return { primary: primary, subtitle: subtitle };
    }

    var TYPE_LABELS = {
        cooling: '散热',
        power: '电源',
        shield: '护盾',
        quantum: '量子驱动器',
        jump: '跳跃驱动器',
        radar: '雷达',
        ship_weapon: '舰炮',
        ship_turret: '舰船炮台',
        ship_missile: '导弹',
        missile_rack: '导弹架',
        mining_laser: '矿头',
        ship_module: '模组',
    };

    var TYPE_GROUP = {
        ship_weapon: 'weapon',
        ship_turret: 'weapon',
        ship_missile: 'weapon',
        missile_rack: 'weapon',
        mining_laser: 'mining',
        ship_module: 'mining',
    };

    function apiUrl(path) {
        return API_BASE + path;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatPrice(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' aUEC';
    }

    function formatMass(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' kg';
    }

    function formatVolume(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        var scu = Number(n) / 1000000;
        if (scu >= 0.001) return scu.toFixed(3) + ' SCU';
        return Number(n).toLocaleString('zh-CN');
    }

    function formatSpeed(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' m/s';
    }

    function getItemIdFromSearch(search) {
        var params = new URLSearchParams(search || '');
        var id = params.get('id') || params.get('id_item') || params.get('uuid') || '';
        return String(id || '').trim();
    }

    function getItemIdFromHash() {
        var hash = String(window.location.hash || '').replace(/^#/, '').trim();
        if (!hash) return '';
        if (hash.indexOf('=') >= 0) return getItemIdFromSearch(hash);
        return hash;
    }

    function getStoredItemId() {
        try {
            var stored = sessionStorage.getItem('scComponentDetailId');
            return stored ? String(stored).trim() : '';
        } catch (e) {
            return '';
        }
    }

    function getItemId() {
        var id = getItemIdFromSearch(window.location.search);
        if (id) return id;
        id = getItemIdFromHash();
        if (id) return id;
        return getStoredItemId();
    }

    function syncDetailUrlId(id) {
        var cid = String(id || '').trim();
        if (!cid) return;
        try {
            var url = new URL(window.location.href);
            if (url.searchParams.get('id') === cid) return;
            url.searchParams.set('id', cid);
            history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (e) {
            /* ignore */
        }
    }

    function showGate(msg, isError) {
        if (!els.gate) return;
        els.gate.textContent = msg;
        els.gate.classList.remove('is-hidden');
        if (isError) els.gate.classList.add('sc-gate--error');
        else els.gate.classList.remove('sc-gate--error');
        if (els.article) els.article.classList.add('is-hidden');
    }

    function hideGate() {
        if (els.gate) els.gate.classList.add('is-hidden');
    }

    function renderLocationLevelsHtml(loc) {
        var parts = [];
        if (loc.star_system_zh) parts.push(loc.star_system_zh);
        if (loc.planet_zh) parts.push(loc.planet_zh);
        if (loc.city_zh) parts.push(loc.city_zh);
        if (loc.moon_zh) parts.push(loc.moon_zh);
        if (loc.outpost_zh) parts.push(loc.outpost_zh);
        if (loc.space_station_zh) parts.push(loc.space_station_zh);
        if (loc.terminal_name_zh) parts.push(loc.terminal_name_zh);
        else if (loc.terminal_name) parts.push(loc.terminal_name);
        if (!parts.length && loc.location_label_zh) parts.push(loc.location_label_zh);
        if (!parts.length) return escapeHtml('—');
        return (
            '<span class="sc-loc-path">' +
            parts
                .map(function (part, i) {
                    return '<span class="sc-loc-level sc-loc-level--' + Math.min(i, 4) + '">' + escapeHtml(part) + '</span>';
                })
                .join('') +
            '</span>'
        );
    }

    function renderFieldCell(label, value, emphasis) {
        return (
            '<div class="sc-mission-field' +
            (emphasis ? ' sc-mission-field--emphasis' : '') +
            '"><span class="sc-mission-field-label">' +
            escapeHtml(label) +
            '</span><span class="sc-mission-field-value">' +
            escapeHtml(value) +
            '</span></div>'
        );
    }

    function renderFieldGridHtml(rows) {
        return (rows || [])
            .map(function (row) {
                return renderFieldCell(row.label, row.value, !!row.emphasis);
            })
            .join('');
    }

    function renderHighlights(item) {
        if (!els.highlights) return;
        var group = TYPE_GROUP[item.type] || 'component';
        var chips = [
            { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
            { label: '尺寸', value: item.size_label || item.size || '—' },
            { label: '等级用途', value: item.class_zh || item.class_short_zh || '—' },
        ];
        if (group !== 'weapon' && group !== 'mining') {
            chips.splice(1, 0, { label: '等级', value: item.grade || item.grade_letter || '—' });
        }
        els.highlights.className = 'sc-detail-hero-stats sc-detail-hero-stats--' + chips.length;
        els.highlights.innerHTML = chips
            .map(function (chip) {
                return renderFieldCell(chip.label, chip.value, !!chip.accent);
            })
            .join('');
    }

    function renderBasics(item) {
        if (!els.basics) return;
        var rows = [
            { label: '类型', value: TYPE_LABELS[item.type] || item.type },
            { label: '制造商', value: item.manufacturer_zh || item.manufacturer || '—' },
            { label: '质量', value: formatMass(item.mass) },
            { label: '体积', value: formatVolume(item.volume) },
        ];
        if (item.max_speed != null && !item.wiki_fields) {
            rows.push({ label: '最高速度', value: formatSpeed(item.max_speed) });
        }

        els.basics.innerHTML = renderFieldGridHtml(rows);
    }

    function renderSpecRowsHtml(rows) {
        return renderFieldGridHtml(rows);
    }

    function renderSpecs(item) {
        if (!els.specs) return;
        var wiki = window.ShipComponentWiki;
        if (!wiki) {
            els.specs.hidden = true;
            els.specs.innerHTML = '';
            return;
        }
        var sections = wiki.groupWikiFieldsForDetail(item);
        if (!sections.length) {
            els.specs.hidden = true;
            els.specs.innerHTML = '';
            return;
        }
        els.specs.hidden = false;
        els.specs.innerHTML = sections
            .map(function (section) {
                return (
                    '<section class="sc-blueprint-mission-section sc-detail-spec-section">' +
                    '<h2 class="sc-blueprint-mission-section-title">' +
                    escapeHtml(section.title) +
                    '</h2>' +
                    '<div class="sc-detail-field-grid">' +
                    renderSpecRowsHtml(section.rows) +
                    '</div></section>'
                );
            })
            .join('');
    }

    function renderBlueprintMissions(item) {
        if (!els.blueprint) return;
        if (window.ShipComponentBlueprints && window.ShipComponentBlueprints.mount) {
            window.ShipComponentBlueprints.mount(els.blueprint, item);
            return;
        }
        els.blueprint.innerHTML = '<p class="sc-acquire-empty">蓝图模块未加载</p>';
    }

    function renderLocations(item) {
        if (!els.locations) return;
        var locs = item.purchase_locations || [];
        if (!locs.length) {
            els.locations.innerHTML = '<p class="sc-detail-empty">暂无购买地点数据</p>';
            return;
        }
        var html =
            '<table class="sc-loc-table sc-detail-loc-table"><thead><tr><th class="sc-loc-th-location">地点</th><th class="sc-loc-th-price">买入价</th></tr></thead><tbody>';
        locs.forEach(function (loc) {
            html +=
                '<tr><td class="sc-loc-cell">' +
                renderLocationLevelsHtml(loc) +
                '</td><td class="sc-price sc-loc-price-cell">' +
                formatPrice(loc.price_buy) +
                '</td></tr>';
        });
        html += '</tbody></table>';
        els.locations.innerHTML = html;
    }

    function shortSourceLabel(meta) {
        if (!meta) return '—';
        if (meta.data_source === 'wiki') return 'WIKI百科';
        if (meta.data_source === 'uex') return 'UEX';
        if (meta.data_source_label_zh) return meta.data_source_label_zh;
        return '—';
    }

    function absoluteAssetUrl(url) {
        var raw = String(url || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.indexOf('//') === 0) return window.location.protocol + raw;
        var base = API_BASE || (window.location && window.location.origin) || '';
        if (!base) return raw;
        return base.replace(/\/$/, '') + (raw.charAt(0) === '/' ? raw : '/' + raw);
    }

    function componentImageProxyUrl(item) {
        if (!item) return '';
        var id =
            item.id_item != null && String(item.id_item).trim()
                ? String(item.id_item).trim()
                : item.uuid
                  ? String(item.uuid).trim()
                  : '';
        if (!id) return '';
        return absoluteAssetUrl('/api/sc/components/image/' + encodeURIComponent(id));
    }

    function componentImageDirectUrl(item) {
        if (!item || !item.image) return '';
        var raw = item.image.remote_url || item.image.original_url || item.image.url || '';
        return /^https?:\/\//i.test(String(raw).trim()) ? String(raw).trim() : '';
    }

    function hideDetailImage() {
        currentImageLightboxSrc = '';
        if (els.media) els.media.hidden = true;
        if (els.imageBtn) {
            els.imageBtn.hidden = true;
            els.imageBtn.style.width = '';
            els.imageBtn.style.height = '';
        }
        if (els.image) {
            els.image.removeAttribute('src');
            els.image.alt = '';
        }
    }

    function openDetailImageLightbox() {
        if (!currentImageLightboxSrc) return;
        var lb = window.UssCommunityImageLightbox;
        if (lb && typeof lb.open === 'function') {
            lb.open(currentImageLightboxSrc);
            return;
        }
        window.open(currentImageLightboxSrc, '_blank', 'noopener,noreferrer');
    }

    function wireDetailImageLightbox() {
        if (!els.imageBtn || els.imageBtn.dataset.wired === '1') return;
        els.imageBtn.dataset.wired = '1';
        els.imageBtn.addEventListener('click', openDetailImageLightbox);
    }

    function showDetailImage() {
        if (els.media) els.media.hidden = false;
        if (els.imageBtn) els.imageBtn.hidden = false;
        syncHeroImageFrameSize();
    }

    function isHeroImageStackedLayout() {
        return window.matchMedia('(max-width: 820px)').matches;
    }

    function syncHeroImageFrameSize() {
        if (!els.image || !els.imageBtn) return;
        if (els.imageBtn.hidden || isHeroImageStackedLayout()) {
            els.imageBtn.style.width = '';
            els.imageBtn.style.height = '';
            return;
        }
        var nw = els.image.naturalWidth;
        var nh = els.image.naturalHeight;
        if (!nw || !nh) {
            els.imageBtn.style.width = '';
            els.imageBtn.style.height = '';
            return;
        }
        var frameH = parseFloat(getComputedStyle(els.imageBtn).height);
        if (!Number.isFinite(frameH) || frameH <= 0) {
            frameH = els.imageBtn.getBoundingClientRect().height;
        }
        if (!frameH) return;

        var width = Math.round((frameH * nw) / nh);
        var maxW = parseFloat(getComputedStyle(els.imageBtn).maxWidth);
        if (Number.isFinite(maxW) && maxW > 0 && width > maxW) {
            width = maxW;
        }
        els.imageBtn.style.height = frameH + 'px';
        els.imageBtn.style.width = Math.max(1, width) + 'px';
    }

    var heroImageResizeTimer = null;
    function scheduleHeroImageFrameSync() {
        if (heroImageResizeTimer) window.clearTimeout(heroImageResizeTimer);
        heroImageResizeTimer = window.setTimeout(function () {
            heroImageResizeTimer = null;
            syncHeroImageFrameSize();
        }, 80);
    }

    function wireHeroImageFrameSync() {
        if (window.__scDetailHeroImageFrameSyncWired) return;
        window.__scDetailHeroImageFrameSyncWired = true;
        window.addEventListener('resize', scheduleHeroImageFrameSync);
    }

    function renderImage(item) {
        if (!els.media || !els.image) return;
        var proxySrc = componentImageProxyUrl(item);
        var directSrc = componentImageDirectUrl(item);
        var src = proxySrc || directSrc;
        if (!src) {
            hideDetailImage();
            return;
        }
        currentImageLightboxSrc = directSrc || proxySrc;
        wireDetailImageLightbox();
        wireHeroImageFrameSync();
        els.image.loading = 'eager';
        els.image.alt = item.name_zh || item.name_en || '配件图片';
        els.image.referrerPolicy = 'no-referrer';
        els.image.onerror = function () {
            if (directSrc && els.image.src !== directSrc) {
                els.image.src = directSrc;
                currentImageLightboxSrc = directSrc;
                return;
            }
            hideDetailImage();
        };
        els.image.onload = function () {
            showDetailImage();
            syncHeroImageFrameSize();
        };
        showDetailImage();
        els.image.src = src;
        if (els.image.complete && els.image.naturalWidth > 0) {
            showDetailImage();
            syncHeroImageFrameSize();
        }
    }

    function renderFootnote(meta) {
        if (!els.footnote || !meta) return;
        var parts = [shortSourceLabel(meta)];
        if (meta.game_version) parts.push('游戏版本 ' + meta.game_version);
        var apiVer =
            meta.data_source === 'wiki'
                ? meta.wiki_api_version || '3.0'
                : meta.uex_api_version || '2.0';
        if (apiVer) parts.push('API v' + apiVer);
        els.footnote.textContent = parts.join(' · ');
    }

    function renderItem(data, requestedId) {
        var item = data.item;
        var meta = data.meta;
        if (!item) {
            showGate('配件不存在或已下架', true);
            return;
        }
        hideGate();
        if (els.article) els.article.classList.remove('is-hidden');

        var names = resolveDetailDisplayName(item);
        document.title = names.primary + ' · USSXC';

        if (els.typeBadge) {
            els.typeBadge.className = 'sc-type-badge sc-type-badge--' + (item.type || 'unknown');
            els.typeBadge.textContent = TYPE_LABELS[item.type] || item.type || '—';
        }
        if (els.titleZh) els.titleZh.textContent = names.primary;
        if (els.titleEn) els.titleEn.textContent = names.subtitle;

        renderHighlights(item);
        renderBasics(item);
        renderSpecs(item);
        renderLocations(item);
        renderBlueprintMissions(item);
        renderFootnote(meta);
        renderImage(item);
        syncDetailUrlId(item.id_item || item.uuid || requestedId);
        updateBackLink(item);
    }

    var LIST_RETURN_URL_KEY = 'scComponentListReturnUrl';
    var LIST_RETURN_GROUP_KEY = 'scComponentListReturnGroup';
    var LIST_RETURN_TYPE_KEY = 'scComponentListReturnType';
    var LIST_RETURN_PATHNAME_KEY = 'scComponentListReturnPathname';
    var LIST_RESTORE_FLAG_KEY = 'scComponentListRestorePending';

    var DEFAULT_TYPE_BY_GROUP = {
        component: 'cooling',
        weapon: 'ship_weapon',
        mining: 'mining_laser',
    };

    function isShipComponentsListPath(pathname) {
        return /\/ship-components(?:\.html)?$/i.test(String(pathname || ''));
    }

    function listPagePathname() {
        try {
            var stored = sessionStorage.getItem(LIST_RETURN_PATHNAME_KEY) || '';
            if (isShipComponentsListPath(stored)) return stored;
        } catch (e) {
            /* ignore */
        }
        return '/ship-components';
    }

    function inferGroupFromItemType(typeKey) {
        var key = String(typeKey || '').trim();
        if (!key) return '';
        if (TYPE_GROUP[key]) return TYPE_GROUP[key];
        if (
            key === 'cooling' ||
            key === 'power' ||
            key === 'shield' ||
            key === 'quantum' ||
            key === 'jump' ||
            key === 'radar'
        ) {
            return 'component';
        }
        return '';
    }

    function readStoredListReturnParts() {
        var group = '';
        var type = '';
        var q = '';
        var href = '';
        try {
            group = sessionStorage.getItem(LIST_RETURN_GROUP_KEY) || '';
            type = sessionStorage.getItem(LIST_RETURN_TYPE_KEY) || '';
            href = sessionStorage.getItem(LIST_RETURN_URL_KEY) || '';
            if (href) {
                var su = new URL(href, window.location.href);
                if (isShipComponentsListPath(su.pathname)) {
                    group = group || su.searchParams.get('group') || '';
                    type = type || su.searchParams.get('type') || '';
                    q = su.searchParams.get('q') || '';
                }
            }
        } catch (e) {
            /* ignore */
        }
        return { group: group, type: type, q: q, href: href };
    }

    function buildListPageHref(group, type, q) {
        var g = String(group || '').trim();
        if (!g) return listPagePathname();
        var t = String(type || '').trim();
        var query = String(q || '').trim();
        try {
            var url = new URL(listPagePathname(), window.location.href);
            url.searchParams.set('group', g);
            if (t) url.searchParams.set('type', t);
            if (query) url.searchParams.set('q', query);
            else url.searchParams.delete('q');
            return url.pathname + url.search;
        } catch (e) {
            var href = listPagePathname() + '?group=' + encodeURIComponent(g);
            if (t) href += '&type=' + encodeURIComponent(t);
            if (query) href += '&q=' + encodeURIComponent(query);
            return href;
        }
    }

    function resolveListReturnHref(item) {
        var params = new URLSearchParams(window.location.search || '');
        var fromUrl = {
            group: (params.get('group') || params.get('from_group') || '').trim(),
            type: (params.get('type') || params.get('from_type') || '').trim(),
            q: (params.get('q') || params.get('from_q') || '').trim(),
        };
        var stored = readStoredListReturnParts();

        // 优先级：详情页 URL 参数 → 进入详情前 session 记录 → 配件类型推断
        var group = fromUrl.group || stored.group || '';
        var type = fromUrl.type || stored.type || '';
        var q = fromUrl.q || stored.q || '';

        if (!group && item && item.type) group = inferGroupFromItemType(item.type);
        if (!type && item && item.type) type = item.type;

        if (!group) group = 'component';
        if (!type) type = DEFAULT_TYPE_BY_GROUP[group] || (item && item.type) || 'cooling';

        if (!fromUrl.group && !fromUrl.type && stored.href) {
            try {
                var su = new URL(stored.href, window.location.href);
                if (isShipComponentsListPath(su.pathname)) {
                    su.searchParams.set('group', group);
                    su.searchParams.set('type', type);
                    if (q) su.searchParams.set('q', q);
                    else su.searchParams.delete('q');
                    return su.pathname + su.search;
                }
            } catch (e) {
                /* ignore */
            }
        }

        return buildListPageHref(group, type, q);
    }

    function bindBackLinkRestore() {
        var link = document.getElementById('scDetailBackLink');
        if (!link || link.dataset.restoreBound === '1') return;
        link.dataset.restoreBound = '1';
        link.addEventListener('click', function () {
            try {
                if (sessionStorage.getItem(LIST_RESTORE_FLAG_KEY) !== '1') {
                    sessionStorage.setItem(LIST_RESTORE_FLAG_KEY, '1');
                }
            } catch (e) {
                /* ignore */
            }
        });
    }

    function updateBackLink(item) {
        var link = document.getElementById('scDetailBackLink');
        if (!link) return;
        link.href = resolveListReturnHref(item);
        bindBackLinkRestore();
    }

    function initBackLinkEarly() {
        var link = document.getElementById('scDetailBackLink');
        if (!link) return;
        link.href = resolveListReturnHref(null);
        bindBackLinkRestore();
    }

    async function load() {
        var id = getItemId();
        if (!id) {
            showGate('缺少配件 ID', true);
            return;
        }
        try {
            var res = await fetch(apiUrl('/api/sc/components/' + encodeURIComponent(id)));
            var data = await res.json();
            if (!res.ok || !data.ok) throw new Error((data && data.message) || '加载失败');
            renderItem(data, id);
            rememberLoadedId(data.item);
        } catch (e) {
            showGate((e && e.message) || '加载失败', true);
        }
    }

    function rememberLoadedId(item) {
        if (!item) return;
        var cid = item.id_item != null && item.id_item !== '' ? String(item.id_item).trim() : '';
        if (!cid && item.uuid) cid = String(item.uuid).trim();
        if (!cid) return;
        try {
            sessionStorage.setItem('scComponentDetailId', cid);
        } catch (e) {
            /* ignore */
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initBackLinkEarly();
            load();
        });
    } else {
        initBackLinkEarly();
        load();
    }
})();
