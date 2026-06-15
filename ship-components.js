(function () {
    if (typeof document === 'undefined') return;

    var API_BASE = (
        (typeof window !== 'undefined' &&
            (window.USS_SC_COMPONENTS_API_BASE || window.USS_AUTH_API_BASE || window.USS_REGISTER_API_BASE)) ||
        ''
    ).replace(/\/$/, '');
    var PAGE_SIZE = 20;
    var GROUP_META = {
        component: {
            label_zh: '舰船组件',
            kicker: 'COMPONENTS',
            lead: ['散热', '电源', '护盾', '量子驱动器', '跳跃驱动器', '雷达'],
        },
        weapon: {
            label_zh: '舰船武器',
            kicker: 'WEAPONS',
            lead: ['舰炮', '导弹', '导弹架', '舰船炮台'],
        },
        mining: {
            label_zh: '舰船矿头',
            kicker: 'MINING',
            lead: ['矿头', '模组'],
        },
    };
    var DEFAULT_TYPE_BY_GROUP = {
        component: 'cooling',
        weapon: 'ship_weapon',
        mining: 'mining_laser',
    };
    var GROUP_ORDER = ['component', 'weapon', 'mining'];
    var TYPE_ORDER_BY_GROUP = {
        component: ['cooling', 'power', 'shield', 'quantum', 'jump', 'radar'],
        weapon: ['ship_weapon', 'ship_missile', 'missile_rack', 'ship_turret'],
        mining: ['mining_laser', 'ship_module'],
    };
    var TYPE_FALLBACK_LABELS = {
        mining_laser: '矿头',
        ship_module: '模组',
        ship_turret: '舰船炮台',
    };
    function normalizeGroupState() {
        if (state.group === 'module') {
            state.group = 'mining';
            if (state.type !== 'mining_laser') state.type = 'ship_module';
        }
        if (GROUP_ORDER.indexOf(state.group) < 0) {
            state.group = 'component';
        }
    }

    function normalizeCategoriesPayload(types, groups) {
        var nextTypes = types || {};
        Object.keys(nextTypes).forEach(function (key) {
            var t = nextTypes[key];
            if (t && t.group === 'module') {
                nextTypes[key] = Object.assign({}, t, { group: 'mining' });
            }
        });
        var nextGroups = Object.assign({}, GROUP_META, groups || {});
        delete nextGroups.module;
        if (!nextGroups.mining) {
            nextGroups.mining = GROUP_META.mining;
        }
        return { types: nextTypes, groups: nextGroups };
    }

    function groupKeysForRender() {
        var keys = GROUP_ORDER.filter(function (key) {
            return state.groups[key] || GROUP_META[key];
        });
        return keys.length ? keys : GROUP_ORDER.slice();
    }

    function typeKeysForGroup(groupKey, filtered) {
        var keys = Object.keys(filtered || {});
        var order = TYPE_ORDER_BY_GROUP[groupKey];
        if (!order || !order.length) return keys;
        return keys.slice().sort(function (a, b) {
            var ai = order.indexOf(a);
            var bi = order.indexOf(b);
            if (ai < 0) ai = order.length + 1;
            if (bi < 0) bi = order.length + 1;
            if (ai !== bi) return ai - bi;
            return a.localeCompare(b, 'zh-CN');
        });
    }
    var state = {
        group: 'component',
        groups: {},
        type: 'cooling',
        types: {},
        meta: null,
        items: [],
        total: 0,
        page: 1,
        hasMore: false,
        loading: false,
        loadingMore: false,
        expanded: {},
        searchTimer: null,
        suggestTimer: null,
        suggestController: null,
        suggestItems: [],
        listFetchController: null,
        loadMoreController: null,
        sortKey: 'size',
        sortDir: 'asc',
        blueprintExpandedByItem: {},
    };

    var ACQUIRE_BTN_LABEL = '获取';

    var els = {
        gate: document.getElementById('scGate'),
        groupTabs: document.getElementById('scGroupTabs'),
        tabs: document.getElementById('scTabs'),
        heroKicker: document.getElementById('scHeroKicker'),
        heroTitle: document.getElementById('scHeroTitle'),
        leadNav: document.getElementById('scLeadNav'),
        navLinkShip: document.getElementById('navMegaLinkShip'),
        body: document.getElementById('scTableBody'),
        tableHead: document.getElementById('scTableHead'),
        tableShell: document.getElementById('scTableShell'),
        metaBar: document.getElementById('scMetaBar'),
        footnote: document.getElementById('scFootnote'),
        versionBadge: document.getElementById('scVersionBadge'),
        search: document.getElementById('scSearch'),
        suggest: document.getElementById('scSearchSuggest'),
        loadSentinel: document.getElementById('scLoadSentinel'),
    };

    var loadMoreObserver = null;
    var tableColumnSyncRaf = 0;
    var desktopTableShellWidth = 0;
    var expandColumnWidthCache = 0;

    var SORT_GETTERS = {
        name: function (item) {
            return item.name_zh || item.name_en || '';
        },
        type: function (item) {
            if (item.type === 'ship_module') return resolveShipModuleActivationType(item) || '';
            return typeLabel(item.type);
        },
        class: function (item) {
            return item.class_zh || item.class_short_zh || '';
        },
        grade: function (item) {
            return item.grade || item.grade_letter || '';
        },
        size: function (item) {
            return item.size_num != null ? Number(item.size_num) : -1;
        },
        mfg: function (item) {
            return item.manufacturer_zh || item.manufacturer || '';
        },
        mass: function (item) {
            return item.mass != null && Number.isFinite(Number(item.mass)) ? Number(item.mass) : null;
        },
        volume: function (item) {
            return item.volume != null && Number.isFinite(Number(item.volume)) ? Number(item.volume) : null;
        },
        speed: function (item) {
            return item.max_speed != null && Number.isFinite(Number(item.max_speed)) ? Number(item.max_speed) : null;
        },
        price: function (item) {
            return item.price_buy_min != null && Number.isFinite(Number(item.price_buy_min))
                ? Number(item.price_buy_min)
                : null;
        },
        loc: function (item) {
            if (!item.cheapest_location) return '';
            return item.cheapest_location.location_label_zh || item.cheapest_location.terminal_name || '';
        },
    };

    function apiUrl(path) {
        return API_BASE + path;
    }

    function formatVolume(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        var scu = Number(n) / 1000000;
        if (scu >= 0.001) return scu.toFixed(3) + ' SCU';
        return Number(n).toLocaleString('zh-CN');
    }

    function formatPrice(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' aUEC';
    }

    function formatMass(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' kg';
    }

    function formatSpeed(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' m/s';
    }

    function isWikiMode() {
        return state.meta && state.meta.data_source === 'wiki';
    }

    function getWikiTableColumns() {
        if (!isWikiMode() || !window.ShipComponentWiki) return [];
        return window.ShipComponentWiki.getWikiTableColumns(state.type);
    }

    function resolveComponentId(item) {
        if (!item) return '';
        var raw = item.id_item != null && item.id_item !== '' ? item.id_item : item.uuid;
        return raw != null ? String(raw).trim() : '';
    }

    function isShipComponentsListPath(pathname) {
        return /\/ship-components(?:\.html)?$/i.test(String(pathname || ''));
    }

    function listPagePathname() {
        var p = window.location.pathname || '';
        if (isShipComponentsListPath(p)) return p;
        try {
            var stored = sessionStorage.getItem(LIST_RETURN_PATHNAME_KEY) || '';
            if (isShipComponentsListPath(stored)) return stored;
        } catch (e) {
            /* ignore */
        }
        return '/ship-components';
    }

    function detailPagePathname() {
        var list = listPagePathname();
        return list.replace(/ship-components(\.html)?$/i, function (_m, ext) {
            return 'ship-component-detail' + (ext || '');
        });
    }

    function componentDetailUrl(idItem) {
        var id = String(idItem || '').trim();
        if (!id) return detailPagePathname();
        try {
            var url = new URL(detailPagePathname(), window.location.href);
            url.searchParams.set('id', id);
            url.searchParams.set('group', state.group);
            url.searchParams.set('type', state.type);
            var q = els.search ? String(els.search.value || '').trim() : '';
            if (q) url.searchParams.set('q', q);
            return url.pathname + url.search;
        } catch (e) {
            var href =
                detailPagePathname() +
                '?id=' +
                encodeURIComponent(id) +
                '&group=' +
                encodeURIComponent(state.group) +
                '&type=' +
                encodeURIComponent(state.type);
            var qFallback = els.search ? String(els.search.value || '').trim() : '';
            if (qFallback) href += '&q=' + encodeURIComponent(qFallback);
            return href;
        }
    }

    function rememberComponentDetailId(id) {
        var cid = String(id || '').trim();
        if (!cid) return;
        try {
            sessionStorage.setItem('scComponentDetailId', cid);
        } catch (e) {
            /* ignore */
        }
    }

    var LIST_RETURN_URL_KEY = 'scComponentListReturnUrl';
    var LIST_RETURN_GROUP_KEY = 'scComponentListReturnGroup';
    var LIST_RETURN_TYPE_KEY = 'scComponentListReturnType';
    var LIST_RETURN_PATHNAME_KEY = 'scComponentListReturnPathname';
    var LIST_RETURN_SCROLL_KEY = 'scComponentListReturnScrollY';
    var LIST_RETURN_PAGE_KEY = 'scComponentListReturnPage';
    var LIST_RETURN_EXPANDED_KEY = 'scComponentListReturnExpandedId';
    var LIST_RESTORE_FLAG_KEY = 'scComponentListRestorePending';

    function normalizeItemId(id) {
        return String(id || '').trim();
    }

    function isItemExpanded(id) {
        var key = normalizeItemId(id);
        return !!(key && state.expanded[key]);
    }

    function captureExpandedStateFromDom() {
        if (!els.body) return;
        els.body.querySelectorAll('tr.sc-detail-row[data-detail-for]').forEach(function (row) {
            var id = normalizeItemId(row.dataset.detailFor);
            if (id) state.expanded[id] = true;
        });
        els.body.querySelectorAll('tr[data-id] .sc-expand-btn.is-open').forEach(function (btn) {
            var row = btn.closest('tr[data-id]');
            if (!row) return;
            var id = normalizeItemId(row.dataset.id);
            if (id) state.expanded[id] = true;
        });
    }

    function snapshotExpandedState() {
        captureExpandedStateFromDom();
        var snap = Object.create(null);
        Object.keys(state.expanded || {}).forEach(function (key) {
            if (!state.expanded[key]) return;
            var id = normalizeItemId(key);
            if (id) snap[id] = true;
        });
        return snap;
    }

    function applyExpandedSnapshot(snapshot) {
        state.expanded = snapshot || Object.create(null);
    }

    function getRenderedItemIds() {
        var ids = Object.create(null);
        if (!els.body) return ids;
        els.body.querySelectorAll('tr[data-id]').forEach(function (row) {
            var id = normalizeItemId(row.dataset.id);
            if (id) ids[id] = true;
        });
        return ids;
    }

    function appendTableRows(items, scrollY) {
        if (!els.body || !items || !items.length) return 0;
        var anchor = els.body.querySelector('.sc-load-more-row');
        var appended = 0;
        sortItems(items.filter(isBrowsableItem)).forEach(function (item) {
            var tr = renderRow(item);
            if (anchor) els.body.insertBefore(tr, anchor);
            else els.body.appendChild(tr);
            appended += 1;
        });
        if (appended) {
            scheduleSyncTableColumns();
            fixExpandedDetailRowLayout();
        }
        ensureExpandedDetailPresent();
        fixExpandedDetailRowLayout();
        syncExpandedShellClass();
        if (scrollY != null && scrollY >= 0) {
            window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
        }
        return appended;
    }

    function syncExpandButtonState(row, expanded) {
        if (!row) return;
        var btn = row.querySelector('.sc-expand-btn');
        if (!btn) return;
        btn.textContent = expanded ? '收起' : ACQUIRE_BTN_LABEL;
        btn.classList.toggle('is-open', !!expanded);
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function findDataRowByItemId(id) {
        if (!els.body || !id) return null;
        var rows = els.body.querySelectorAll('tr[data-id]');
        for (var i = 0; i < rows.length; i++) {
            if (normalizeItemId(rows[i].dataset.id) === id) return rows[i];
        }
        return null;
    }

    function fixExpandedDetailRowLayout() {
        if (!els.body || !els.tableShell) return;
        var shellW = els.tableShell.clientWidth;
        if (!shellW) return;
        els.body.querySelectorAll('tr.sc-detail-row > td').forEach(function (td) {
            td.style.boxSizing = 'border-box';
            td.style.width = shellW + 'px';
            td.style.minWidth = shellW + 'px';
            td.style.maxWidth = shellW + 'px';
        });
    }

    function buildAcquirePanelHtml(item) {
        var locs = item.purchase_locations || [];
        return (
            '<div class="sc-acquire-grid">' +
            '<section class="sc-acquire-col sc-acquire-col--shops" aria-label="购买地点">' +
            '<h3 class="sc-acquire-heading">购买地点</h3>' +
            '<div class="sc-acquire-body" data-acquire-shops>' +
            renderAcquireLocationsHtml(locs) +
            '</div></section>' +
            '<section class="sc-acquire-col sc-acquire-col--blueprint" aria-label="蓝图任务">' +
            '<h3 class="sc-acquire-heading">蓝图任务</h3>' +
            '<div class="sc-acquire-body" data-acquire-blueprint data-blueprint-panel><p class="sc-acquire-loading">加载蓝图任务…</p></div>' +
            '</section></div>'
        );
    }

    function ensureExpandedDetailPresent() {
        if (!els.body) return false;
        var id = getExpandedItemId();
        if (!id) return false;
        state.expanded[id] = true;
        var dataRow = findDataRowByItemId(id);
        if (!dataRow) return false;
        var next = dataRow.nextElementSibling;
        if (
            next &&
            next.classList.contains('sc-detail-row') &&
            normalizeItemId(next.dataset.detailFor) === id
        ) {
            syncExpandButtonState(dataRow, true);
            syncExpandedShellClass();
            return true;
        }
        var item = state.items.find(function (x) {
            return normalizeItemId(x.id_item) === id;
        });
        if (!item) return false;
        els.body.querySelectorAll('tr.sc-detail-row[data-detail-for]').forEach(function (row) {
            if (normalizeItemId(row.dataset.detailFor) === id) row.remove();
        });
        dataRow.insertAdjacentElement('afterend', renderDetailRow(item));
        syncExpandButtonState(dataRow, true);
        syncExpandedShellClass();
        return true;
    }

    function syncExpandedShellClass() {
        if (!els.tableShell) return;
        var open = !!getExpandedItemId();
        els.tableShell.classList.toggle('has-detail-open', open);
        if (open && isMobileTableLayout()) els.tableShell.scrollLeft = 0;
    }

    function getExpandedItemId() {
        var keys = Object.keys(state.expanded || {});
        for (var i = 0; i < keys.length; i++) {
            if (state.expanded[keys[i]]) return normalizeItemId(keys[i]);
        }
        if (els.body) {
            var detailRow = els.body.querySelector('.sc-detail-row[data-detail-for]');
            if (detailRow && detailRow.dataset.detailFor) return normalizeItemId(detailRow.dataset.detailFor);
            var openBtn = els.body.querySelector('.sc-expand-btn.is-open');
            if (openBtn) {
                var row = openBtn.closest('tr[data-id]');
                if (row && row.dataset.id) return normalizeItemId(row.dataset.id);
            }
        }
        return '';
    }

    function applyListScrollRestore(scrollY) {
        if (!scrollY || scrollY <= 0) return;
        var apply = function () {
            window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
        };
        requestAnimationFrame(apply);
        setTimeout(apply, 100);
        setTimeout(apply, 400);
        setTimeout(apply, 1200);
    }

    function inferGroupFromTypeKey(typeKey) {
        var key = String(typeKey || '').trim();
        if (!key) return '';
        if (key === 'ship_weapon' || key === 'ship_turret' || key === 'ship_missile' || key === 'missile_rack') return 'weapon';
        if (key === 'mining_laser' || key === 'ship_module') return 'mining';
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
        var t = state.types && state.types[key];
        return (t && t.group) || '';
    }

    function buildListPageUrl(group, type, q) {
        var g = group != null ? group : state.group;
        var t = type != null ? type : state.type;
        var query = q != null ? q : els.search ? String(els.search.value || '').trim() : '';
        try {
            var url = new URL(listPagePathname(), window.location.href);
            url.searchParams.set('group', g);
            url.searchParams.set('type', t);
            if (query) url.searchParams.set('q', query);
            else url.searchParams.delete('q');
            return url.pathname + url.search;
        } catch (e) {
            var href = listPagePathname() + '?group=' + encodeURIComponent(g) + '&type=' + encodeURIComponent(t);
            if (query) href += '&q=' + encodeURIComponent(query);
            return href;
        }
    }

    function rememberListReturnState() {
        try {
            sessionStorage.setItem(LIST_RETURN_PATHNAME_KEY, window.location.pathname || listPagePathname());
            sessionStorage.setItem(LIST_RETURN_URL_KEY, buildListPageUrl());
            sessionStorage.setItem(LIST_RETURN_GROUP_KEY, state.group);
            sessionStorage.setItem(LIST_RETURN_TYPE_KEY, state.type);
            sessionStorage.setItem(LIST_RETURN_SCROLL_KEY, String(window.scrollY || 0));
            sessionStorage.setItem(LIST_RETURN_PAGE_KEY, String(state.page || 1));
            sessionStorage.setItem(LIST_RETURN_EXPANDED_KEY, getExpandedItemId());
            sessionStorage.setItem(LIST_RESTORE_FLAG_KEY, '1');
        } catch (e) {
            /* ignore */
        }
    }

    function readPendingListRestoreMeta() {
        try {
            if (sessionStorage.getItem(LIST_RESTORE_FLAG_KEY) !== '1') return null;
            return {
                scrollY: Number(sessionStorage.getItem(LIST_RETURN_SCROLL_KEY) || 0),
                page: Math.max(1, Number(sessionStorage.getItem(LIST_RETURN_PAGE_KEY) || 1)),
                expandedId: String(sessionStorage.getItem(LIST_RETURN_EXPANDED_KEY) || '').trim(),
            };
        } catch (e) {
            return null;
        }
    }

    function consumeListRestoreState() {
        var meta = readPendingListRestoreMeta();
        if (!meta) return null;
        try {
            sessionStorage.removeItem(LIST_RESTORE_FLAG_KEY);
        } catch (e) {
            /* ignore */
        }
        return meta;
    }

    async function maybeRestoreListView() {
        var pending = consumeListRestoreState();
        if (!pending) return;
        while (state.page < pending.page && state.hasMore && !state.loading && !state.loadingMore) {
            await loadMore();
        }
        if (pending.expandedId) {
            var expandedId = normalizeItemId(pending.expandedId);
            if (expandedId) {
                state.expanded[expandedId] = true;
                ensureExpandedDetailPresent();
            }
        }
        applyListScrollRestore(pending.scrollY);
    }

    /** 按配件类型的列表列顺序（未列出的类型仍用默认顺序） */
    var COLUMN_ORDER_BY_TYPE = {
        cooling: [
            'name',
            'type',
            'class',
            'grade',
            'size',
            'wiki_cool_seg',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        power: [
            'name',
            'type',
            'class',
            'grade',
            'size',
            'wiki_pwr_seg',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        shield: [
            'name',
            'type',
            'class',
            'grade',
            'size',
            'wiki_sh_hp',
            'wiki_sh_regen',
            'wiki_sh_time',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        quantum: [
            'name',
            'type',
            'grade',
            'class',
            'size',
            'speed',
            'wiki_q_speed',
            'wiki_q_engage',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        jump: [
            'name',
            'type',
            'grade',
            'class',
            'size',
            'speed',
            'wiki_j_align',
            'wiki_j_tune',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        radar: [
            'name',
            'type',
            'grade',
            'class',
            'size',
            'wiki_r_cd',
            'wiki_r_ir',
            'wiki_r_em',
            'wiki_r_dist_min',
            'wiki_r_dist_max',
            'mfg',
            'price',
            'loc',
            'expand',
        ],
        ship_weapon: [
            'name',
            'type',
            'size',
            'wiki_w_type',
            'wiki_w_dmg',
            'wiki_w_rpm',
            'wiki_w_range',
            'wiki_w_dps',
            'wiki_w_cap',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        ship_turret: [
            'name',
            'type',
            'size',
            'wiki_t_sub',
            'wiki_t_mounts',
            'wiki_t_wsize',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        ship_missile: [
            'name',
            'type',
            'size',
            'wiki_m_type',
            'wiki_m_dmg',
            'wiki_m_speed',
            'wiki_m_locktime',
            'wiki_m_lock',
            'wiki_m_blast',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        missile_rack: [
            'name',
            'type',
            'size',
            'wiki_r_count',
            'wiki_r_size',
            'mfg',
            'mass',
            'volume',
            'price',
            'loc',
            'expand',
        ],
        mining_laser: [
            'name',
            'type',
            'size',
            'wiki_m_range',
            'wiki_ml_maxrange',
            'wiki_m_throughput',
            'wiki_m_slots',
            'wiki_ml_power_transfer',
            'mfg',
            'price',
            'loc',
            'expand',
        ],
        ship_module: [
            'name',
            'size',
            'type',
            'wiki_sm_duration',
            'mfg',
            'price',
            'loc',
            'expand',
        ],
    };

    function getColumnOrder() {
        var typeOrder = COLUMN_ORDER_BY_TYPE[state.type];
        if (typeOrder) return typeOrder.slice();
        var order = ['name', 'type', 'grade', 'class', 'size', 'mfg', 'mass', 'volume', 'speed'];
        getWikiTableColumns().forEach(function (col) {
            order.push(col.key);
        });
        order.push('price', 'loc', 'expand');
        return order;
    }

    function getVisibleColumnOrder() {
        return getColumnOrder().filter(isColumnVisible);
    }

    function usesDesktopColumnGaps() {
        return true;
    }

    var MOBILE_COL_GAP_MIN = 14;

    function getTableStructureItems() {
        var visible = getVisibleColumnOrder();
        if (!usesDesktopColumnGaps()) {
            return visible.map(function (key) {
                return { type: 'data', key: key };
            });
        }
        var items = [];
        visible.forEach(function (key, index) {
            items.push({ type: 'data', key: key });
            if (index < visible.length - 1) items.push({ type: 'gap' });
        });
        return items;
    }

    function getColCount() {
        return getTableStructureItems().length;
    }

    function formatSynced(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('zh-CN', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }).format(new Date(iso));
        } catch (e) {
            return iso;
        }
    }

    function buildQuery(page) {
        var q = els.search ? String(els.search.value || '').trim() : '';
        var params = new URLSearchParams();
        if (state.type) params.set('type', state.type);
        if (q) params.set('q', q);
        params.set('limit', String(PAGE_SIZE));
        params.set('page', String(page || 1));
        return params.toString();
    }

    function buildSuggestQuery() {
        var q = els.search ? String(els.search.value || '').trim() : '';
        var params = new URLSearchParams();
        if (q) params.set('q', q);
        params.set('limit', '20');
        return params.toString();
    }

    function abortPendingFetches() {
        if (state.listFetchController) state.listFetchController.abort();
        if (state.loadMoreController) state.loadMoreController.abort();
        state.listFetchController = null;
        state.loadMoreController = null;
    }

    function removeLoadMoreRow() {
        if (!els.body) return;
        var row = els.body.querySelector('.sc-load-more-row');
        if (row) row.remove();
    }

    function showLoadMoreRow(text) {
        if (!els.body) return;
        removeLoadMoreRow();
        var tr = document.createElement('tr');
        tr.className = 'sc-load-more-row';
        var td = document.createElement('td');
        td.colSpan = getColCount();
        td.textContent = text;
        tr.appendChild(td);
        els.body.appendChild(tr);
    }

    function mergeItems(existing, incoming) {
        var seen = {};
        var out = (existing || []).slice();
        (existing || []).forEach(function (item) {
            seen[String(item.id_item)] = true;
        });
        (incoming || []).forEach(function (item) {
            var id = String(item.id_item);
            if (seen[id]) return;
            seen[id] = true;
            out.push(item);
        });
        return out;
    }


    function parseUrlState() {
        try {
            var url = new URL(window.location.href);
            var group = url.searchParams.get('group');
            var type = url.searchParams.get('type');
            if (group === 'module') {
                state.group = 'mining';
                if (!type || type === 'ship_module') state.type = 'ship_module';
            } else if (group === 'weapon' || group === 'component' || group === 'mining') {
                state.group = group;
            }
            if (type && group !== 'module') state.type = type;
            if (!group && type) {
                var inferred = inferGroupFromTypeKey(type);
                if (inferred) state.group = inferred;
            }
            if (!group && type === 'ship_module') {
                state.group = 'mining';
            }
            var q = url.searchParams.get('q');
            if (q != null && els.search) els.search.value = q;
            normalizeGroupState();
        } catch (e) {
            /* ignore */
        }
    }

    function typesForGroup(groupKey) {
        var out = {};
        Object.keys(state.types || {}).forEach(function (key) {
            var t = state.types[key];
            var g = (t && t.group) || 'component';
            if (g === groupKey) out[key] = t;
        });
        var order = TYPE_ORDER_BY_GROUP[groupKey];
        if (order && order.length) {
            order.forEach(function (key) {
                if (out[key]) return;
                out[key] = {
                    key: key,
                    label_zh: TYPE_FALLBACK_LABELS[key] || key,
                    group: groupKey,
                    count: 0,
                };
            });
        }
        return out;
    }

    function ensureTypeInGroup() {
        var filtered = typesForGroup(state.group);
        var keys = Object.keys(filtered);
        if (!keys.length) return;
        if (keys.indexOf(state.type) < 0) {
            state.type = DEFAULT_TYPE_BY_GROUP[state.group] || keys[0];
        }
        normalizeGroupState();
    }

    function updateUrlState() {
        try {
            var url = new URL(window.location.href);
            url.searchParams.set('group', state.group);
            url.searchParams.set('type', state.type);
            var q = els.search ? String(els.search.value || '').trim() : '';
            if (q) url.searchParams.set('q', q);
            else url.searchParams.delete('q');
            history.replaceState(null, '', url.pathname + url.search);
        } catch (e) {
            /* ignore */
        }
    }

    function updateHero() {
        var meta = GROUP_META[state.group] || GROUP_META.component;
        if (els.heroKicker) els.heroKicker.textContent = meta.kicker;
        if (els.heroTitle) els.heroTitle.textContent = meta.label_zh;
        document.title = meta.label_zh + ' · USSXC';
        if (els.leadNav && meta.lead && meta.lead.length) {
            els.leadNav.innerHTML = meta.lead
                .map(function (item, idx) {
                    var sep = idx ? '<span class="sc-lead-sep" aria-hidden="true"></span>' : '';
                    return sep + '<span class="sc-lead-item">' + escapeHtml(item) + '</span>';
                })
                .join('');
        }
        if (els.navLinkShip) {
            els.navLinkShip.classList.add('is-current');
        }
    }

    function renderGroupTabs() {
        if (!els.groupTabs) return;
        normalizeGroupState();
        els.groupTabs.innerHTML = '';
        var groupKeys = groupKeysForRender();
        groupKeys.forEach(function (key) {
            var cfg = state.groups[key] || GROUP_META[key] || { label_zh: key };
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sc-tab' + (key === state.group ? ' is-active' : '');
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', key === state.group ? 'true' : 'false');
            btn.textContent = cfg.label_zh || key;
            btn.dataset.group = key;
            btn.addEventListener('click', function () {
                if (state.group === key) return;
                state.group = key;
                ensureTypeInGroup();
                resetSortIfHiddenGradeClassColumns();
                state.expanded = {};
                if (els.search) els.search.value = '';
                hideSuggest();
                updateHero();
                updateUrlState();
                syncBodyMode();
                renderGroupTabs();
                renderTabs();
                loadList();
            });
            els.groupTabs.appendChild(btn);
        });
    }

    function renderTabs() {
        if (!els.tabs) return;
        ensureTypeInGroup();
        els.tabs.innerHTML = '';
        var filtered = typesForGroup(state.group);
        typeKeysForGroup(state.group, filtered).forEach(function (key) {
            var t = filtered[key];
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sc-tab' + (key === state.type ? ' is-active' : '');
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', key === state.type ? 'true' : 'false');
            btn.textContent = (t.label_zh || key) + (t.count != null ? ' (' + t.count + ')' : '');
            btn.dataset.type = key;
            btn.addEventListener('click', function () {
                state.type = key;
                state.expanded = {};
                if (els.search) els.search.value = '';
                hideSuggest();
                updateUrlState();
                updateHero();
                syncBodyMode();
                renderTabs();
                loadList();
            });
            els.tabs.appendChild(btn);
        });
    }

    function typeLabel(typeKey) {
        var t = state.types[typeKey];
        return (t && t.label_zh) || typeKey || '—';
    }

    function resolveShipModuleActivationType(item) {
        var block = item && item.wiki_fields && item.wiki_fields.mining_modifier;
        if (!block || !block.type) return null;
        var wiki = window.ShipComponentWiki;
        if (wiki && typeof wiki.formatWikiScalar === 'function') {
            return wiki.formatWikiScalar(block.type);
        }
        return String(block.type).trim() || null;
    }

    function sizeBadgeClass(sizeLabel) {
        var m = String(sizeLabel || '').match(/S(\d+)/i);
        if (m) return 'sc-size-badge sc-size-badge--s' + m[1];
        return 'sc-size-badge sc-size-badge--unknown';
    }

    function syncBodyMode() {
        var cls = 'ship-components-body sc-group-' + state.group + ' sc-type-' + state.type;
        if (isWikiMode()) cls += ' sc-source-wiki';
        document.body.className = cls;
        rebuildTableStructure();
        syncTableColumns();
    }

    var COLUMN_LABELS = {
        name: '名称',
        type: '类型',
        class: '用途',
        grade: '等级',
        size: '尺寸',
        mfg: '制造商',
        mass: '质量',
        volume: '体积',
        speed: '最高速度',
        price: '最低买入价',
        loc: '购买地点',
    };

    var SORTABLE_COLUMNS = {
        name: true,
        type: true,
        class: true,
        grade: true,
        size: true,
        mfg: true,
        mass: true,
        volume: true,
        speed: true,
        price: true,
        loc: true,
    };

    function rebuildTableStructure() {
        var colgroup = document.querySelector('#scTable colgroup');
        var headRow = els.tableHead ? els.tableHead.querySelector('tr') : null;
        if (!colgroup || !headRow) return;

        var items = getTableStructureItems();
        colgroup.innerHTML = '';
        headRow.innerHTML = '';

        items.forEach(function (item) {
            if (item.type === 'gap') {
                var gapCol = document.createElement('col');
                gapCol.className = 'sc-col-gap';
                colgroup.appendChild(gapCol);

                var gapTh = document.createElement('th');
                gapTh.className = 'sc-col-gap';
                gapTh.setAttribute('aria-hidden', 'true');
                headRow.appendChild(gapTh);
                return;
            }

            var key = item.key;
            var col = document.createElement('col');
            col.className = 'sc-col-' + key;
            if (key === 'speed') col.classList.add('sc-col-quantum-only');
            if (key.indexOf('wiki_') === 0) col.classList.add('sc-col-wiki-stat');
            colgroup.appendChild(col);

            var th = document.createElement('th');
            th.className = 'sc-col-' + key;
            if (key === 'speed') th.classList.add('sc-col-quantum-only');
            if (key.indexOf('wiki_') === 0) th.classList.add('sc-col-wiki-stat');
            th.scope = 'col';

            if (key === 'expand') {
                th.innerHTML = '<span class="sc-sr-only">展开</span>';
            } else if (key.indexOf('wiki_') === 0) {
                var wcol = getWikiTableColumns().find(function (c) {
                    return c.key === key;
                });
                th.classList.add('sc-sortable');
                th.setAttribute('data-sort', key);
                th.innerHTML =
                    '<button type="button" class="sc-sort-btn">' +
                    escapeHtml(wcol ? wcol.label : key) +
                    '</button>';
            } else if (SORTABLE_COLUMNS[key]) {
                th.classList.add('sc-sortable');
                th.setAttribute('data-sort', key);
                th.innerHTML =
                    '<button type="button" class="sc-sort-btn">' + escapeHtml(COLUMN_LABELS[key] || key) + '</button>';
            } else {
                th.innerHTML = '<span class="sc-sort-btn sc-sort-btn--static">' + escapeHtml(COLUMN_LABELS[key] || key) + '</span>';
            }
            headRow.appendChild(th);
        });

        updateSortHeaders();
    }

    function parseWikiSortValue(raw) {
        if (raw == null || raw === '' || raw === '—') return null;
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        var s = String(raw).replace(/,/g, '').trim();
        var m = s.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        if (m) return Number(m[0]);
        return s;
    }

    function getWikiSortGetter(key) {
        if (key.indexOf('wiki_') !== 0) return null;
        var wcol = getWikiTableColumns().find(function (c) {
            return c.key === key;
        });
        if (!wcol) return null;
        if (typeof wcol.sortGet === 'function') return wcol.sortGet;
        return function (item) {
            return parseWikiSortValue(wcol.get(item));
        };
    }

    function getSortGetter(key) {
        return SORT_GETTERS[key] || getWikiSortGetter(key);
    }

    function compareSortValues(a, b, dir) {
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
        return String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' }) * dir;
    }

    function sortItems(items) {
        if (!state.sortKey || !state.sortDir) return items;
        var getter = getSortGetter(state.sortKey);
        if (!getter) return items;
        var dir = state.sortDir === 'desc' ? -1 : 1;
        return items.slice().sort(function (a, b) {
            return compareSortValues(getter(a), getter(b), dir);
        });
    }

    function updateSortHeaders() {
        if (!els.tableHead) return;
        els.tableHead.querySelectorAll('.sc-sortable[data-sort]').forEach(function (th) {
            var key = th.getAttribute('data-sort');
            th.classList.remove('is-sorted-asc', 'is-sorted-desc');
            if (key === state.sortKey && state.sortDir) {
                th.classList.add(state.sortDir === 'desc' ? 'is-sorted-desc' : 'is-sorted-asc');
            }
        });
    }

    function bindSortHeaders() {
        if (!els.tableHead || els.tableHead.dataset.sortBound) return;
        els.tableHead.dataset.sortBound = '1';
        els.tableHead.addEventListener('click', function (e) {
            var btn = e.target.closest('.sc-sort-btn');
            if (!btn || btn.classList.contains('sc-sort-btn--static')) return;
            var th = btn.closest('th[data-sort]');
            if (!th) return;
            var key = th.getAttribute('data-sort');
            if (!key) return;
            if (state.sortKey === key) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortKey = key;
                state.sortDir = 'asc';
            }
            updateSortHeaders();
            renderTable();
        });
        updateSortHeaders();
    }

    function isTypeColumnVisible() {
        var t = state.type;
        return t !== 'quantum' && t !== 'jump' && t !== 'radar';
    }

    function isSpeedColumnVisible() {
        return state.type === 'quantum' || state.type === 'jump';
    }

    function isGradeColumnVisible() {
        return state.group !== 'weapon' && state.group !== 'mining';
    }

    function isClassColumnVisible() {
        return isGradeColumnVisible();
    }

    function resetSortIfHiddenGradeClassColumns() {
        if (!isGradeColumnVisible() && (state.sortKey === 'grade' || state.sortKey === 'class')) {
            state.sortKey = 'size';
            state.sortDir = 'asc';
        }
    }

    function isMassVolumeVisible() {
        return state.type !== 'radar';
    }

    function isMobileTableLayout() {
        return window.matchMedia('(max-width: 720px)').matches;
    }

    function isColumnVisible(key) {
        if (key.indexOf('wiki_') === 0) {
            return getWikiTableColumns().some(function (c) {
                return c.key === key;
            });
        }
        if (key === 'type') return isTypeColumnVisible();
        if (key === 'grade') return isGradeColumnVisible();
        if (key === 'class') return isClassColumnVisible();
        if (key === 'speed') return isSpeedColumnVisible();
        if (key === 'mass' || key === 'volume') return isMassVolumeVisible();
        return true;
    }

    var LOC_LIST_MIN_WIDTH = 168;

    function protectLocColumnWidth(widths) {
        if (!widths || !Object.prototype.hasOwnProperty.call(widths, 'loc')) return;
        widths.loc = Math.max(widths.loc || 0, LOC_LIST_MIN_WIDTH);
    }

    function isProtectedColumnKey(key) {
        return key === 'expand' || key === 'loc';
    }

    function getExpandColumnWidth() {
        if (expandColumnWidthCache > 0) return expandColumnWidthCache;
        var probe = document.createElement('button');
        probe.type = 'button';
        probe.className = 'sc-expand-btn';
        probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
        document.body.appendChild(probe);
        probe.textContent = ACQUIRE_BTN_LABEL;
        var acquireW = probe.getBoundingClientRect().width;
        probe.textContent = '收起';
        probe.classList.add('is-open');
        var collapseW = probe.getBoundingClientRect().width;
        document.body.removeChild(probe);
        expandColumnWidthCache = Math.ceil(Math.max(acquireW, collapseW)) + 24;
        return expandColumnWidthCache;
    }

    function getColKeyFromElement(el) {
        if (el.classList && el.classList.contains('sc-col-gap')) return '';
        var parts = (el.className || '').split(/\s+/);
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] === 'sc-col-gap') return '';
            if (parts[i].indexOf('sc-col-') === 0) {
                return parts[i].replace('sc-col-', '');
            }
        }
        return '';
    }

    function measureDesktopColumnWidths(table, visible) {
        var widths = {};
        visible.forEach(function (key) {
            widths[key] = 0;
        });

        var prevTableLayout = table.style.tableLayout;
        var prevWidth = table.style.width;
        var prevMinWidth = table.style.minWidth;
        var prevMaxWidth = table.style.maxWidth;
        var cols = Array.prototype.slice.call(table.querySelectorAll('colgroup col'));
        var prevCols = cols.map(function (col) {
            return {
                width: col.style.width,
                minWidth: col.style.minWidth,
                maxWidth: col.style.maxWidth,
            };
        });

        cols.forEach(function (col) {
            col.style.width = '';
            col.style.minWidth = '';
            col.style.maxWidth = '';
        });
        table.style.tableLayout = 'auto';
        table.style.width = 'max-content';
        table.style.minWidth = 'max-content';
        table.style.maxWidth = 'none';
        void table.offsetWidth;

        function scan(selector) {
            table.querySelectorAll(selector).forEach(function (cell) {
                var key = getColKeyFromElement(cell);
                if (!key || !Object.prototype.hasOwnProperty.call(widths, key)) return;
                var w = cell.getBoundingClientRect().width;
                if (w > widths[key]) widths[key] = Math.ceil(w);
            });
        }

        scan('thead th');
        scan('tbody tr:not(.sc-detail-row) td');
        if (Object.prototype.hasOwnProperty.call(widths, 'expand')) {
            widths.expand = getExpandColumnWidth();
        }
        protectLocColumnWidth(widths);

        table.style.tableLayout = prevTableLayout;
        table.style.width = prevWidth;
        table.style.minWidth = prevMinWidth;
        table.style.maxWidth = prevMaxWidth;
        cols.forEach(function (col, idx) {
            col.style.width = prevCols[idx].width;
            col.style.minWidth = prevCols[idx].minWidth;
            col.style.maxWidth = prevCols[idx].maxWidth;
        });

        return widths;
    }

    function scheduleSyncTableColumns() {
        if (tableColumnSyncRaf) cancelAnimationFrame(tableColumnSyncRaf);
        tableColumnSyncRaf = requestAnimationFrame(function () {
            tableColumnSyncRaf = 0;
            syncTableColumns();
            if (refreshMobileTableScrollState) refreshMobileTableScrollState();
            ensureExpandedDetailPresent();
            fixExpandedDetailRowLayout();
        });
    }

    function applyMeasuredColumnWidths(table, visible, widths, gap) {
        document.querySelectorAll('#scTable col').forEach(function (col) {
            if (col.classList.contains('sc-col-gap')) {
                col.style.width = gap + 'px';
                col.style.minWidth = gap + 'px';
                col.style.maxWidth = gap + 'px';
                return;
            }
            var key = getColKeyFromElement(col);
            if (!key || visible.indexOf(key) < 0) {
                col.style.width = '0';
                col.style.minWidth = '0';
                col.style.maxWidth = '0';
                return;
            }
            var px = widths[key] || 0;
            if (key === 'loc') px = Math.max(px, LOC_LIST_MIN_WIDTH);
            if (!px) {
                col.style.width = '0';
                col.style.minWidth = '0';
                col.style.maxWidth = '0';
                return;
            }
            col.style.width = px + 'px';
            col.style.minWidth = px + 'px';
            col.style.maxWidth = px + 'px';
        });
        if (!table) return;
        if (isMobileTableLayout()) {
            var gapCount = visible.length > 1 ? visible.length - 1 : 0;
            var sumWidths = 0;
            visible.forEach(function (key) {
                sumWidths += widths[key] || 0;
            });
            var totalPx = sumWidths + gapCount * gap;
            table.style.width = totalPx + 'px';
            table.style.minWidth = totalPx + 'px';
            table.style.maxWidth = totalPx + 'px';
            return;
        }
        table.style.width = '100%';
        table.style.minWidth = '';
        table.style.maxWidth = '';
    }

    function syncTableColumns() {
        var visible = getVisibleColumnOrder();
        var table = document.getElementById('scTable');
        if (!table || !visible.length) return;

        var mobile = isMobileTableLayout();
        var widths = measureDesktopColumnWidths(table, visible);
        var sumWidths = 0;
        visible.forEach(function (key) {
            sumWidths += widths[key] || 0;
        });

        var shell = els.tableShell;
        var containerWidth = shell ? shell.clientWidth : table.clientWidth;
        if (!containerWidth) containerWidth = sumWidths;
        if (!mobile) desktopTableShellWidth = containerWidth;

        var gapCount = visible.length > 1 ? visible.length - 1 : 0;
        var gap = 0;
        if (gapCount > 0) {
            if (mobile) {
                var naturalWidth = sumWidths + gapCount * MOBILE_COL_GAP_MIN;
                if (naturalWidth <= containerWidth) {
                    gap = Math.max(MOBILE_COL_GAP_MIN, (containerWidth - sumWidths) / gapCount);
                } else {
                    gap = MOBILE_COL_GAP_MIN;
                }
                gap = Math.round(gap * 100) / 100;
            } else {
                gap = Math.max(0, (containerWidth - sumWidths) / gapCount);
                gap = Math.round(gap * 100) / 100;

                if (gap <= 0 && sumWidths > containerWidth && sumWidths > 0) {
                    var expandWidth = visible.indexOf('expand') >= 0 ? getExpandColumnWidth() : 0;
                    var shrinkableSum = 0;
                    visible.forEach(function (key) {
                        if (isProtectedColumnKey(key)) return;
                        shrinkableSum += widths[key] || 0;
                    });
                    var shrinkBudget = Math.max(0, containerWidth - expandWidth - gapCount * gap);
                    var locWidth = visible.indexOf('loc') >= 0 ? Math.max(widths.loc || 0, LOC_LIST_MIN_WIDTH) : 0;
                    shrinkBudget = Math.max(0, shrinkBudget - locWidth);
                    var scale = shrinkableSum > 0 ? shrinkBudget / shrinkableSum : 1;
                    var scaledSum = locWidth;
                    visible.forEach(function (key) {
                        if (key === 'expand') {
                            widths[key] = expandWidth;
                            scaledSum += expandWidth;
                            return;
                        }
                        if (key === 'loc') {
                            widths[key] = locWidth;
                            return;
                        }
                        var scaled = Math.floor((widths[key] || 0) * scale);
                        widths[key] = scaled;
                        scaledSum += scaled;
                    });
                    var drift = containerWidth - scaledSum - gapCount * gap;
                    if (drift !== 0) {
                        var adjustCandidates = visible.filter(function (k) {
                            return !isProtectedColumnKey(k);
                        });
                        var adjustKey = adjustCandidates[adjustCandidates.length - 1] || visible[0];
                        if (adjustKey === 'expand' || adjustKey === 'loc') {
                            adjustKey = adjustCandidates[adjustCandidates.length - 2] || visible[0];
                        }
                        widths[adjustKey] = Math.max(0, (widths[adjustKey] || 0) + drift);
                    }
                }

                protectLocColumnWidth(widths);

                var finalSum = 0;
                visible.forEach(function (key) {
                    finalSum += widths[key] || 0;
                });
                gap = Math.max(0, (containerWidth - finalSum) / gapCount);
                gap = Math.round(gap * 100) / 100;
            }
        }

        applyMeasuredColumnWidths(table, visible, widths, gap);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var MFG_LINE_MAX_CHARS = 6;

    function splitMfgDisplayLines(text) {
        var s = String(text || '').trim();
        if (!s || s === '—') return [s || '—'];
        var chars = Array.from(s);
        if (chars.length <= MFG_LINE_MAX_CHARS) return [s];
        var lines = [];
        for (var i = 0; i < chars.length; i += MFG_LINE_MAX_CHARS) {
            lines.push(chars.slice(i, i + MFG_LINE_MAX_CHARS).join(''));
        }
        return lines;
    }

    function renderMfgCellHtml(text) {
        var lines = splitMfgDisplayLines(text);
        if (lines.length <= 1) return escapeHtml(lines[0]);
        return (
            '<span class="sc-mfg-multiline">' +
            lines
                .map(function (line) {
                    return '<span class="sc-mfg-line">' + escapeHtml(line) + '</span>';
                })
                .join('') +
            '</span>'
        );
    }

    function isInternalItemKey(s) {
        var v = String(s || '').trim();
        if (!v || /\s/.test(v) || /[\u4e00-\u9fff]/.test(v)) return false;
        return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v);
    }

    function isPlaceholderItemName(s) {
        var v = String(s || '').trim();
        if (!v) return false;
        if (/\[(?:PH|WIP|TMP|TBD|TODO)\]/i.test(v)) return true;
        if (/WCPR-Made|XIAN Nox Cooler Name/i.test(v)) return true;
        return false;
    }

    function resolveItemDisplayNames(item) {
        var zh = String((item && item.name_zh) || '').trim();
        var en = String((item && item.name_en) || '').trim();
        if (isPlaceholderItemName(zh)) {
            zh = '';
        }
        var primary = zh || en || '—';
        var subtitle = '';

        if (!item || !item.loc_matched || isPlaceholderItemName(item.name_zh)) {
            if (isInternalItemKey(primary)) primary = '—';
            if (isInternalItemKey(en)) en = '';
        }

        if (zh && en && zh !== en) subtitle = en;
        else if (en && en !== primary) subtitle = en;
        return { primary: primary, subtitle: subtitle };
    }

    function isBrowsableItem(item) {
        return resolveItemDisplayNames(item).primary !== '—';
    }

    var LOCATION_LABEL_OMIT = {
        '舰船配件': 1,
        'ship parts': 1,
        'shipparts': 1,
        'ship components': 1,
        '商店终端': 1,
        'shop terminal': 1,
        shopterminal: 1,
    };

    function shouldOmitLocSegment(val) {
        var raw = String(val || '').trim();
        if (!raw) return true;
        var key = raw.toLowerCase();
        if (LOCATION_LABEL_OMIT[key]) return true;
        return !!LOCATION_LABEL_OMIT[key.replace(/\s+/g, '')];
    }

    function getLocationHierarchyParts(loc) {
        if (!loc) return [];
        var parts = [];
        var seen = {};
        function push(val) {
            val = String(val || '').trim();
            if (!val || seen[val] || shouldOmitLocSegment(val)) return;
            seen[val] = true;
            parts.push(val);
        }
        if (loc.star_system_zh || loc.planet_zh || loc.city_zh || loc.moon_zh || loc.outpost_zh || loc.space_station_zh) {
            push(loc.star_system_zh);
            push(loc.planet_zh);
            push(loc.city_zh || loc.moon_zh || loc.outpost_zh || loc.space_station_zh);
            var term = loc.terminal_name_zh || loc.terminal_name || '';
            if (term) {
                term.split(/\s*[·•]\s*/).forEach(function (seg) {
                    push(seg);
                });
            }
        } else {
            var label = loc.location_label_zh || loc.terminal_name_zh || loc.terminal_name || '';
            label.split(/\s*[·•]\s*/).forEach(function (seg) {
                push(seg);
            });
        }
        return parts;
    }

    function renderLocationLevelsHtml(loc) {
        var parts = getLocationHierarchyParts(loc);
        if (!parts.length) return escapeHtml('—');
        return (
            '<span class="sc-loc-path">' +
            parts
                .map(function (part, i) {
                    var level = Math.min(i, 4);
                    return (
                        '<span class="sc-loc-level sc-loc-level--' +
                        level +
                        '">' +
                        escapeHtml(part) +
                        '</span>'
                    );
                })
                .join('') +
            '</span>'
        );
    }

    var LOC_SUMMARY_TAGS_PER_ROW = 3;

    function renderLocationCountHtml(count) {
        if (count == null || count === '') return '';
        return (
            '<span class="sc-loc-count sc-loc-total-tag">共 ' + escapeHtml(String(count)) + ' 处</span>'
        );
    }

    function renderLocationSummaryLevelsHtml(parts, purchaseCount) {
        if (!parts.length) return escapeHtml('—');
        var rows = [];
        for (var i = 0; i < parts.length; i += LOC_SUMMARY_TAGS_PER_ROW) {
            rows.push(parts.slice(i, i + LOC_SUMMARY_TAGS_PER_ROW));
        }
        var lastRowIndex = rows.length - 1;
        return (
            '<span class="sc-loc-path sc-loc-path--summary">' +
            rows
                .map(function (row, rowIndex) {
                    var tags = row
                        .map(function (part, i) {
                            var level = Math.min(rowIndex * LOC_SUMMARY_TAGS_PER_ROW + i, 4);
                            return (
                                '<span class="sc-loc-level sc-loc-level--' +
                                level +
                                '">' +
                                escapeHtml(part) +
                                '</span>'
                            );
                        })
                        .join('');
                    var countHtml =
                        rowIndex === lastRowIndex ? renderLocationCountHtml(purchaseCount) : '';
                    return '<span class="sc-loc-path-row">' + tags + countHtml + '</span>';
                })
                .join('') +
            '</span>'
        );
    }

    function renderLocationSummaryHtml(loc, purchaseCount) {
        var parts = getLocationHierarchyParts(loc);
        if (!parts.length) return { html: escapeHtml('—'), title: '' };
        return {
            html: renderLocationSummaryLevelsHtml(parts, purchaseCount),
            title: parts.join(' · '),
        };
    }

    function renderMiningModifierTagsHtml(item) {
        var wiki = window.ShipComponentWiki;
        if (!wiki || typeof wiki.buildMiningModifierTags !== 'function') return '';
        var tags = wiki.buildMiningModifierTags(item, item.type);
        if (!tags.length) return '';
        if (typeof wiki.renderMiningModifierTagsMarkup === 'function') {
            return wiki.renderMiningModifierTagsMarkup(tags, escapeHtml);
        }
        return '';
    }

    function renderRowCell(key, item, tr, expanded) {
        var td = document.createElement('td');
        td.className = 'sc-col-' + key;
        if (key === 'speed') td.classList.add('sc-col-quantum-only');
        if (key.indexOf('wiki_') === 0) td.classList.add('sc-col-wiki-stat');

        if (key === 'name') {
            var names = resolveItemDisplayNames(item);
            var zhClass = item.loc_matched
                ? 'sc-name-zh sc-name-zh--matched'
                : names.primary === '—'
                  ? 'sc-name-zh sc-name-zh--unknown'
                  : 'sc-name-zh';
            var componentId = resolveComponentId(item);
            var link = document.createElement('a');
            link.className = 'sc-name-link';
            if (componentId) {
                link.href = componentDetailUrl(componentId);
                var stashListReturn = function () {
                    rememberListReturnState();
                    rememberComponentDetailId(componentId);
                };
                link.addEventListener('mousedown', stashListReturn);
                link.addEventListener('click', stashListReturn);
            } else {
                link.removeAttribute('href');
            }
            link.innerHTML =
                '<span class="' +
                zhClass +
                '">' +
                escapeHtml(names.primary) +
                '</span>' +
                (names.subtitle ? '<span class="sc-name-en">' + escapeHtml(names.subtitle) + '</span>' : '') +
                (item.type === 'mining_laser' || item.type === 'ship_module' ? renderMiningModifierTagsHtml(item) : '');
            td.appendChild(link);
        } else if (key === 'type') {
            td.classList.add('sc-col-type-cell');
            if (isTypeColumnVisible()) {
                if (item.type === 'ship_module') {
                    var moduleActType = resolveShipModuleActivationType(item);
                    td.textContent = moduleActType || '—';
                } else {
                    var typeBadge = document.createElement('span');
                    typeBadge.className = 'sc-type-badge sc-type-badge--' + (item.type || 'unknown');
                    typeBadge.textContent = typeLabel(item.type);
                    td.appendChild(typeBadge);
                }
            }
        } else if (key === 'class') {
            td.classList.add('sc-class');
            td.textContent = item.class_zh || item.class_short_zh || '—';
            if (item.class_en && item.class_en !== td.textContent) td.title = item.class_en;
        } else if (key === 'grade') {
            td.classList.add('sc-grade');
            td.textContent = item.grade || item.grade_letter || '—';
        } else if (key === 'size') {
            var sizeLabel = item.size_label || '—';
            var sizeBadge = document.createElement('span');
            sizeBadge.className = sizeBadgeClass(sizeLabel);
            sizeBadge.textContent = sizeLabel;
            td.appendChild(sizeBadge);
        } else if (key === 'mfg') {
            var mfgZh = item.manufacturer_zh || item.manufacturer || '—';
            td.innerHTML = renderMfgCellHtml(mfgZh);
            if (splitMfgDisplayLines(mfgZh).length > 1) td.classList.add('sc-col-mfg--multiline');
            if (item.manufacturer && item.manufacturer !== mfgZh) td.title = item.manufacturer;
        } else if (key === 'mass') {
            if (isMassVolumeVisible()) td.textContent = formatMass(item.mass);
        } else if (key === 'volume') {
            td.classList.add('sc-col-volume-cell');
            if (isMassVolumeVisible()) td.textContent = formatVolume(item.volume);
        } else if (key === 'speed') {
            if (isSpeedColumnVisible()) td.textContent = formatSpeed(item.max_speed);
        } else if (key.indexOf('wiki_') === 0) {
            var wcol = getWikiTableColumns().find(function (c) {
                return c.key === key;
            });
            td.textContent = wcol ? wcol.get(item) || '—' : '—';
        } else if (key === 'price') {
            td.classList.add('sc-price');
            td.textContent = formatPrice(item.price_buy_min);
        } else if (key === 'loc') {
            td.classList.add('sc-loc-summary');
            if (item.cheapest_location) {
                var locSummary = renderLocationSummaryHtml(item.cheapest_location, item.purchase_count);
                td.innerHTML = '<span class="sc-loc-summary-inner">' + locSummary.html + '</span>';
                if (locSummary.title) td.title = locSummary.title;
            } else {
                td.textContent = '—';
            }
        } else if (key === 'expand') {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sc-expand-btn' + (expanded ? ' is-open' : '');
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            btn.textContent = expanded ? '收起' : ACQUIRE_BTN_LABEL;
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                toggleExpand(item.id_item, tr);
                btn.blur();
            });
            td.appendChild(btn);
        }

        return td;
    }

    function renderRow(item) {
        var tr = document.createElement('tr');
        tr.dataset.id = normalizeItemId(item.id_item);
        var expanded = isItemExpanded(item.id_item);
        getTableStructureItems().forEach(function (structItem) {
            if (structItem.type === 'gap') {
                var gapTd = document.createElement('td');
                gapTd.className = 'sc-col-gap';
                gapTd.setAttribute('aria-hidden', 'true');
                tr.appendChild(gapTd);
                return;
            }
            tr.appendChild(renderRowCell(structItem.key, item, tr, expanded));
        });
        return tr;
    }

    function renderAcquireLocationsHtml(locs) {
        if (!locs.length) {
            return '<p class="sc-acquire-empty">暂无购买地点数据</p>';
        }
        var html =
            '<table class="sc-loc-table sc-acquire-loc-table"><thead><tr><th class="sc-loc-th-location">地点</th><th class="sc-loc-th-price">买入价</th></tr></thead><tbody>';
        locs.forEach(function (loc) {
            html +=
                '<tr><td class="sc-loc-cell">' +
                renderLocationLevelsHtml(loc) +
                '</td><td class="sc-price sc-loc-price-cell">' +
                formatPrice(loc.price_buy) +
                '</td></tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    function renderBlueprintMissionsHtml(missions) {
        if (window.ShipComponentBlueprints && window.ShipComponentBlueprints.renderMissionListHtml) {
            return window.ShipComponentBlueprints.renderMissionListHtml(missions, '');
        }
        if (!missions || !missions.length) {
            return '<p class="sc-acquire-empty">暂无蓝图解锁任务</p>';
        }
        return '<p class="sc-acquire-empty">蓝图模块未加载</p>';
    }

    function captureBlueprintExpandedState() {
        if (!els.body) return;
        els.body.querySelectorAll('[data-blueprint-panel]').forEach(function (panel) {
            var tr = panel.closest('tr.sc-detail-row');
            if (!tr || !tr.dataset.detailFor) return;
            var itemId = normalizeItemId(tr.dataset.detailFor);
            var exp = panel.dataset.expandedMission || '';
            if (exp) state.blueprintExpandedByItem[itemId] = exp;
            else delete state.blueprintExpandedByItem[itemId];
        });
    }

    function loadBlueprintMissionsIntoRow(tr, item) {
        if (!tr) return;
        var container = tr.querySelector('[data-acquire-blueprint]');
        if (!container) return;
        if (window.ShipComponentBlueprints && window.ShipComponentBlueprints.mount) {
            var itemId = normalizeItemId(item.id_item);
            window.ShipComponentBlueprints.mount(container, item, {
                expandedId: state.blueprintExpandedByItem[itemId] || '',
                onExpandedChange: function (ref) {
                    if (ref) state.blueprintExpandedByItem[itemId] = ref;
                    else delete state.blueprintExpandedByItem[itemId];
                },
            });
            return;
        }
        container.innerHTML = '<p class="sc-acquire-empty">蓝图模块未加载</p>';
    }

    function renderDetailRow(item) {
        var tr = document.createElement('tr');
        tr.className = 'sc-detail-row';
        tr.dataset.detailFor = normalizeItemId(item.id_item);
        var td = document.createElement('td');
        td.colSpan = getColCount();
        var inner = document.createElement('div');
        inner.className = 'sc-detail-inner sc-acquire-panel';
        inner.innerHTML = buildAcquirePanelHtml(item);
        td.appendChild(inner);
        tr.appendChild(td);
        loadBlueprintMissionsIntoRow(tr, item);
        return tr;
    }

    function renderTable(preservedExpanded) {
        if (!els.body) return;
        var expandedSnapshot = preservedExpanded || snapshotExpandedState();
        captureBlueprintExpandedState();
        applyExpandedSnapshot(expandedSnapshot);
        els.body.innerHTML = '';
        var items = sortItems(state.items.filter(isBrowsableItem));
        if (!items.length) {
            els.body.innerHTML = '<tr><td colspan="' + getColCount() + '">无匹配配件</td></tr>';
            syncExpandedShellClass();
            return;
        }
        items.forEach(function (item) {
            els.body.appendChild(renderRow(item));
            if (isItemExpanded(item.id_item)) {
                els.body.appendChild(renderDetailRow(item));
            }
        });
        scheduleSyncTableColumns();
        ensureExpandedDetailPresent();
        syncExpandedShellClass();
    }

    function collapseAllExpanded() {
        if (!els.body) return;
        els.body.querySelectorAll('.sc-detail-row').forEach(function (row) {
            row.remove();
        });
        els.body.querySelectorAll('.sc-expand-btn.is-open').forEach(function (btn) {
            btn.textContent = ACQUIRE_BTN_LABEL;
            btn.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        });
        state.expanded = {};
        syncExpandedShellClass();
    }

    function toggleExpand(idItem, rowEl) {
        var scrollY = window.scrollY;
        var id = normalizeItemId(idItem);
        var wasOpen = isItemExpanded(id);
        if (wasOpen) {
            delete state.expanded[id];
            var next = rowEl.nextElementSibling;
            if (next && next.classList.contains('sc-detail-row')) next.remove();
            var btn = rowEl.querySelector('.sc-expand-btn');
            if (btn) {
                btn.textContent = ACQUIRE_BTN_LABEL;
                btn.classList.remove('is-open');
                btn.setAttribute('aria-expanded', 'false');
            }
        } else {
            collapseAllExpanded();
            state.expanded[id] = true;
            var item = state.items.find(function (x) {
                return normalizeItemId(x.id_item) === id;
            });
            if (item) {
                rowEl.insertAdjacentElement('afterend', renderDetailRow(item));
            }
            var btnOpen = rowEl.querySelector('.sc-expand-btn');
            if (btnOpen) {
                btnOpen.textContent = '收起';
                btnOpen.classList.add('is-open');
                btnOpen.setAttribute('aria-expanded', 'true');
            }
        }
        syncExpandedShellClass();
        fixExpandedDetailRowLayout();
        window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    }

    function parseQueryGameVersion(meta) {
        if (!meta) return { short: '', full: '' };
        var full = String(meta.game_version || '').trim();
        if (meta.game_version_short) {
            return { short: String(meta.game_version_short).trim(), full: full || meta.game_version_short };
        }
        var m = full.match(/^(\d+\.\d+\.\d+)/);
        var short = m ? m[1] : full.split('-')[0] || full;
        return { short: short, full: full };
    }

    function shortSourceLabel(meta) {
        if (!meta) return '—';
        if (meta.data_source === 'wiki') return 'WIKI百科';
        if (meta.data_source === 'uex') return 'UEX';
        if (meta.data_source_label_zh) return meta.data_source_label_zh;
        return '—';
    }

    function resolveApiVersion(meta) {
        if (!meta) return '';
        var isWiki = meta.data_source === 'wiki';
        if (meta.sources) {
            var src = isWiki ? meta.sources.wiki : meta.sources.uex;
            if (src && src.api_version) return String(src.api_version);
        }
        if (isWiki && meta.wiki_api_version) return String(meta.wiki_api_version);
        if (meta.uex_api_version) return String(meta.uex_api_version);
        return isWiki ? '3.0' : '2.0';
    }

    function formatSourceFootnote() {
        var m = state.meta;
        if (!m) return '';
        var parts = [shortSourceLabel(m)];
        var ver = parseQueryGameVersion(m);
        var versionText = ver.full || ver.short;
        if (versionText) parts.push('游戏版本 ' + versionText);
        var apiVer = resolveApiVersion(m);
        if (apiVer) parts.push('API v' + apiVer);
        return parts.join(' · ');
    }

    function updateVersionBadge() {
        if (!els.versionBadge) return;
        var ver = parseQueryGameVersion(state.meta);
        if (!ver.short) {
            els.versionBadge.hidden = true;
            els.versionBadge.textContent = '';
            els.versionBadge.removeAttribute('title');
            return;
        }
        els.versionBadge.hidden = false;
        els.versionBadge.textContent = ver.short;
        if (ver.full && ver.full !== ver.short) {
            els.versionBadge.title = '游戏版本 ' + ver.full;
        } else {
            els.versionBadge.removeAttribute('title');
        }
    }

    function updateMetaBar() {
        updateVersionBadge();
        if (els.metaBar) {
            var q = els.search ? String(els.search.value || '').trim() : '';
            var parts = [typeLabel(state.type)];
            if (q) parts.push('搜索「' + q + '」');
            var shown = state.items ? state.items.length : 0;
            var total = state.total || 0;
            if (total > 0) {
                if (shown < total || state.hasMore) {
                    parts.push(shown + '/' + total + ' 条');
                } else {
                    parts.push(total + ' 条');
                }
            }
            if (state.loadingMore && state.hasMore) parts.push('加载中…');
            if (state.meta && state.meta.synced_at) {
                parts.push('更新 ' + formatSynced(state.meta.synced_at));
            }
            els.metaBar.textContent = parts.join(' · ');
        }
        if (els.footnote) {
            els.footnote.textContent = formatSourceFootnote();
        }
    }

    function showGate(msg) {
        if (!els.gate) return;
        els.gate.textContent = msg;
        els.gate.classList.remove('is-hidden');
    }

    function hideGate() {
        if (els.gate) els.gate.classList.add('is-hidden');
    }

    function setSuggestOpen(open) {
        if (!els.search) return;
        els.search.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!els.suggest) return;
        if (open && state.suggestItems.length) {
            els.suggest.hidden = false;
        } else {
            els.suggest.hidden = true;
            els.suggest.innerHTML = '';
        }
    }

    function hideSuggest() {
        state.suggestItems = [];
        setSuggestOpen(false);
    }

    function displayItemName(item) {
        if (!item) return '—';
        var names = resolveItemDisplayNames(item);
        if (names.subtitle) return names.primary + ' (' + names.subtitle + ')';
        return names.primary;
    }

    function renderSuggest() {
        if (!els.suggest) return;
        els.suggest.innerHTML = '';
        if (!state.suggestItems.length) {
            setSuggestOpen(false);
            return;
        }
        var label = document.createElement('p');
        label.className = 'sc-search-suggest-label';
        label.textContent = '匹配结果';
        els.suggest.appendChild(label);
        state.suggestItems.forEach(function (item) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sc-search-suggest-item';
            btn.setAttribute('role', 'option');
            btn.dataset.type = item.type;
            btn.dataset.idItem = String(item.id_item);
            var name = document.createElement('span');
            name.className = 'sc-search-suggest-name';
            name.textContent = displayItemName(item);
            var type = document.createElement('span');
            type.className = 'sc-search-suggest-type';
            type.textContent = item.type_label_zh || typeLabel(item.type);
            btn.appendChild(name);
            btn.appendChild(type);
            btn.addEventListener('mousedown', function (e) {
                e.preventDefault();
            });
            btn.addEventListener('click', function () {
                applySuggestPick(item);
            });
            els.suggest.appendChild(btn);
        });
        setSuggestOpen(true);
    }

    function applySuggestPick(item) {
        if (!item || !item.type) return;
        var t = state.types[item.type];
        if (t && t.group) state.group = t.group;
        state.type = item.type;
        state.expanded = {};
        if (els.search) els.search.value = item.name_en || item.name_zh || '';
        hideSuggest();
        updateHero();
        updateUrlState();
        syncBodyMode();
        renderGroupTabs();
        renderTabs();
        loadList();
    }

    async function loadSuggest() {
        var q = els.search ? String(els.search.value || '').trim() : '';
        if (!q) {
            hideSuggest();
            return;
        }
        if (state.suggestController) state.suggestController.abort();
        state.suggestController = new AbortController();
        var signal = state.suggestController.signal;
        try {
            var res = await fetch(apiUrl('/api/sc/components/suggest?' + buildSuggestQuery()), { signal: signal });
            var data = await res.json();
            if (!res.ok || !data.ok) return;
            state.suggestItems = data.items || [];
            renderSuggest();
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            hideSuggest();
        } finally {
            state.suggestController = null;
        }
    }

    async function loadList() {
        if (!els.body) return;
        abortPendingFetches();
        state.page = 1;
        state.hasMore = false;
        state.loading = true;
        state.loadingMore = false;
        state.listFetchController = new AbortController();
        var signal = state.listFetchController.signal;
        els.body.innerHTML = '<tr><td colspan="' + getColCount() + '">加载中…</td></tr>';
        updateMetaBar();
        try {
            var res = await fetch(apiUrl('/api/sc/components?' + buildQuery(1)), { signal: signal });
            var data = await res.json();
            if (!res.ok || !data.ok) throw new Error((data && data.message) || '加载失败');
            hideGate();
            state.meta = data.meta;
            state.items = data.items || [];
            state.total = data.total || 0;
            state.hasMore = state.items.length < state.total;
            syncBodyMode();
            updateSortHeaders();
            renderTable();
            updateMetaBar();
            var skipScrollTop = false;
            try {
                skipScrollTop = sessionStorage.getItem(LIST_RESTORE_FLAG_KEY) === '1';
            } catch (e) {
                skipScrollTop = false;
            }
            if (!skipScrollTop) {
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            if (e.message && e.message.indexOf('未同步') >= 0) {
                showGate('配件数据尚未同步，请超级管理员在管理系统中执行「同步舰船配件」。');
            } else {
                showGate((e && e.message) || '加载失败');
            }
            els.body.innerHTML = '';
            state.hasMore = false;
        } finally {
            state.loading = false;
            state.listFetchController = null;
        }
    }

    async function loadMore() {
        if (!els.body || state.loading || state.loadingMore || !state.hasMore) return;
        var expandedSnapshot = snapshotExpandedState();
        state.loadingMore = true;
        updateMetaBar();
        showLoadMoreRow('加载更多…');
        state.loadMoreController = new AbortController();
        var signal = state.loadMoreController.signal;
        var nextPage = state.page + 1;
        try {
            var res = await fetch(apiUrl('/api/sc/components?' + buildQuery(nextPage)), { signal: signal });
            var data = await res.json();
            if (!res.ok || !data.ok) throw new Error((data && data.message) || '加载失败');
            var incoming = data.items || [];
            if (!incoming.length) {
                state.hasMore = false;
                removeLoadMoreRow();
                return;
            }
            state.page = nextPage;
            if (data.meta) state.meta = data.meta;
            if (data.total != null) state.total = data.total;
            captureExpandedStateFromDom();
            captureBlueprintExpandedState();
            applyExpandedSnapshot(expandedSnapshot);
            var scrollY = window.scrollY;
            state.items = mergeItems(state.items, incoming);
            state.hasMore = state.items.length < state.total;
            var renderedIds = getRenderedItemIds();
            var toAppend = incoming.filter(function (item) {
                return !renderedIds[normalizeItemId(item.id_item)];
            });
            if (toAppend.length) appendTableRows(toAppend, scrollY);
            else {
                ensureExpandedDetailPresent();
                window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
            }
            updateMetaBar();
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            removeLoadMoreRow();
            showLoadMoreRow('加载失败，继续向下滚动重试');
        } finally {
            state.loadingMore = false;
            state.loadMoreController = null;
            removeLoadMoreRow();
            ensureExpandedDetailPresent();
            fixExpandedDetailRowLayout();
            updateMetaBar();
        }
    }

    function initInfiniteScroll() {
        if (!els.loadSentinel || typeof IntersectionObserver === 'undefined') {
            window.addEventListener(
                'scroll',
                function () {
                    if (state.loading || state.loadingMore || !state.hasMore) return;
                    var doc = document.documentElement;
                    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 320) {
                        loadMore();
                    }
                },
                { passive: true }
            );
            return;
        }
        if (loadMoreObserver) loadMoreObserver.disconnect();
        loadMoreObserver = new IntersectionObserver(
            function (entries) {
                if (!entries[0] || !entries[0].isIntersecting) return;
                loadMore();
            },
            { root: null, rootMargin: '240px 0px', threshold: 0 }
        );
        loadMoreObserver.observe(els.loadSentinel);
    }

    function initMobileTableDragScroll() {
        var shell = els.tableShell;
        if (!shell) return;
        var mq = window.matchMedia('(max-width: 720px)');
        var drag = null;
        var suppressClickUntil = 0;

        function isMobileLayout() {
            return mq.matches;
        }

        function canHorizontalScroll() {
            return isMobileLayout() && shell.scrollWidth > shell.clientWidth + 2;
        }

        function updateScrollableState() {
            var scrollable = canHorizontalScroll();
            shell.classList.toggle('is-h-scrollable', scrollable);
            var hint = document.getElementById('scMobileScrollHint');
            if (hint) {
                var showHint = scrollable && isMobileLayout();
                hint.hidden = !showHint;
                hint.setAttribute('aria-hidden', showHint ? 'false' : 'true');
            }
        }

        function endDrag(e) {
            if (!drag || (e && e.pointerId != null && drag.pointerId !== e.pointerId)) return;
            if (drag.moved) suppressClickUntil = Date.now() + 280;
            shell.classList.remove('is-dragging');
            try {
                if (e && shell.hasPointerCapture(e.pointerId)) shell.releasePointerCapture(e.pointerId);
            } catch (err) {
                /* ignore */
            }
            drag = null;
        }

        shell.addEventListener(
            'pointerdown',
            function (e) {
                if (!canHorizontalScroll()) return;
                if (e.pointerType === 'touch') return;
                if (e.button !== 0) return;
                if (e.target.closest('button, a, input, select, textarea, label')) return;
                drag = {
                    pointerId: e.pointerId,
                    startX: e.clientX,
                    startScroll: shell.scrollLeft,
                    moved: false,
                };
                shell.classList.add('is-dragging');
                shell.setPointerCapture(e.pointerId);
            },
            { passive: true }
        );

        shell.addEventListener(
            'pointermove',
            function (e) {
                if (!drag || drag.pointerId !== e.pointerId) return;
                var dx = e.clientX - drag.startX;
                if (Math.abs(dx) > 4) drag.moved = true;
                if (!drag.moved) return;
                shell.scrollLeft = drag.startScroll - dx;
                e.preventDefault();
            },
            { passive: false }
        );

        shell.addEventListener('pointerup', endDrag);
        shell.addEventListener('pointercancel', endDrag);
        shell.addEventListener('lostpointercapture', function () {
            shell.classList.remove('is-dragging');
            drag = null;
        });

        shell.addEventListener(
            'click',
            function (e) {
                if (Date.now() < suppressClickUntil && e.target.closest('button, a')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            },
            true
        );

        var touchStartX = 0;
        var touchStartY = 0;
        var touchActive = false;

        shell.addEventListener(
            'touchstart',
            function (e) {
                if (!canHorizontalScroll() || !e.touches || !e.touches.length) return;
                touchActive = true;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            },
            { passive: true }
        );

        shell.addEventListener(
            'touchmove',
            function (e) {
                if (!touchActive || !canHorizontalScroll() || !e.touches || !e.touches.length) return;
                var dx = e.touches[0].clientX - touchStartX;
                var dy = e.touches[0].clientY - touchStartY;
                if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
                var maxScroll = shell.scrollWidth - shell.clientWidth - 1;
                if (shell.scrollLeft <= 0 && dx > 0) {
                    e.preventDefault();
                    return;
                }
                if (shell.scrollLeft >= maxScroll && dx < 0) {
                    e.preventDefault();
                }
            },
            { passive: false }
        );

        shell.addEventListener(
            'touchend',
            function () {
                touchActive = false;
            },
            { passive: true }
        );
        shell.addEventListener(
            'touchcancel',
            function () {
                touchActive = false;
            },
            { passive: true }
        );

        function onMobileLayoutChange() {
            captureBlueprintExpandedState();
            updateScrollableState();
            rebuildTableStructure();
            scheduleSyncTableColumns();
        }

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', onMobileLayoutChange);
        } else if (typeof mq.addListener === 'function') {
            mq.addListener(onMobileLayoutChange);
        }
        window.addEventListener('resize', onMobileLayoutChange);
        window.addEventListener('orientationchange', function () {
            setTimeout(updateScrollableState, 120);
        });

        updateScrollableState();
        return updateScrollableState;
    }

    var refreshMobileTableScrollState = null;

    function initDesktopTableColumnSync() {
        var shell = els.tableShell;
        if (!shell) return;

        desktopTableShellWidth = shell.clientWidth || 0;

        function onShellWidthChange() {
            if (isMobileTableLayout()) return;
            var nextWidth = shell.clientWidth || 0;
            if (Math.abs(nextWidth - desktopTableShellWidth) < 1) return;
            desktopTableShellWidth = nextWidth;
            scheduleSyncTableColumns();
            fixExpandedDetailRowLayout();
        }

        if (typeof ResizeObserver === 'function') {
            var ro = new ResizeObserver(function () {
                onShellWidthChange();
            });
            ro.observe(shell);
        }
        window.addEventListener('resize', onShellWidthChange);
    }

    async function loadMeta() {
        try {
            var res = await fetch(apiUrl('/api/sc/components/meta'));
            var data = await res.json();
            if (data.ok) {
                state.meta = Object.assign(state.meta || {}, data);
                updateMetaBar();
            }
        } catch (e) {
            /* ignore */
        }
    }

    async function init() {
        parseUrlState();
        bindSortHeaders();
        syncBodyMode();
        refreshMobileTableScrollState = initMobileTableDragScroll();
        initDesktopTableColumnSync();
        loadMeta();
        try {
            var typesRes = await fetch(apiUrl('/api/sc/components/types'));
            var typesData = await typesRes.json();
            if (typesData.ok && typesData.types) {
                var normalized = normalizeCategoriesPayload(typesData.types, typesData.groups);
                state.types = normalized.types;
                state.groups = normalized.groups;
                normalizeGroupState();
                ensureTypeInGroup();
                updateHero();
                renderGroupTabs();
                renderTabs();
                updateUrlState();
            }
        } catch (e) {
            /* ignore */
        }

        if (els.search) {
            els.search.addEventListener('input', function () {
                syncBodyMode();
                clearTimeout(state.searchTimer);
                clearTimeout(state.suggestTimer);
                state.searchTimer = setTimeout(loadList, 300);
                state.suggestTimer = setTimeout(loadSuggest, 180);
            });
            els.search.addEventListener('focus', function () {
                if (state.suggestItems.length) setSuggestOpen(true);
                else if (String(els.search.value || '').trim()) loadSuggest();
            });
            els.search.addEventListener('blur', function () {
                setTimeout(hideSuggest, 160);
            });
            els.search.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') hideSuggest();
            });
        }
        document.addEventListener('click', function (e) {
            if (!els.search || !els.suggest) return;
            if (els.search.contains(e.target) || els.suggest.contains(e.target)) return;
            hideSuggest();
        });
        initInfiniteScroll();
        var pendingRestore = readPendingListRestoreMeta();
        if (pendingRestore && pendingRestore.expandedId) {
            var restoreExpandedId = normalizeItemId(pendingRestore.expandedId);
            if (restoreExpandedId) state.expanded[restoreExpandedId] = true;
        }
        loadList().then(function () {
            return maybeRestoreListView();
        });
    }

    window.UssScComponentsListNav = {
        rememberListReturnState: rememberListReturnState,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
