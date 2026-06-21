(function () {
    if (typeof document === 'undefined') return;

    var API_BASE = (
        (typeof window !== 'undefined' &&
            (window.USS_SC_COMPONENTS_API_BASE || window.USS_AUTH_API_BASE || window.USS_REGISTER_API_BASE)) ||
        ''
    ).replace(/\/$/, '');

    var PAGE_SIZE = 200;
    var LS_KEY = 'uss_bp_craft_qualities_v1';
    var LIST_CACHE = {};
    var BLUEPRINT_DETAIL_CACHE = {};
    var prefetchInFlight = {};
    var BP_RETURN_URL_KEY = 'scBlueprintCraftReturnUrl';
    var BP_RETURN_SCROLL_KEY = 'scBlueprintCraftReturnScrollY';
    var BP_RESTORE_FLAG_KEY = 'scBlueprintCraftRestorePending';
    var BP_PENDING_BLUEPRINT_KEY = 'scBlueprintCraftPendingBlueprint';
    var BP_PENDING_GROUP_KEY = 'scBlueprintCraftPendingGroup';
    var BP_PENDING_TYPE_KEY = 'scBlueprintCraftPendingType';
    var DETAIL_RETURN_SOURCE_KEY = 'scDetailReturnSource';
    var LIST_RESTORE_FLAG_KEY = 'scComponentListRestorePending';
    var SIM_DEBOUNCE_MS = 120;
    var PERSIST_DEBOUNCE_MS = 350;
    var MAT_MOD_DEBOUNCE_MS = 72;
    var SEARCH_SUGGEST_LIMIT = 30;
    var SEARCH_DEBOUNCE_MS = 220;
    var SEARCH_MIN_LEN = 1;
    var LIST_VIRTUAL_MIN = 48;
    var LIST_ROW_HEIGHT = 84;
    var LIST_OVERSCAN = 10;
    var BLUEPRINT_DETAIL_CACHE_MAX = 64;
    var BLUEPRINT_PREFETCH_MS = 100;
    var ARMOR_CLASS_FETCH_CACHE = Object.create(null);
    var armorClassEnrichToken = 0;

    var SECTOR_META = {
        ship: { label_zh: '舰船' },
        equipment: { label_zh: '装备' },
    };

    var SECTOR_ORDER = ['ship', 'equipment'];

    var GROUP_BY_SECTOR = {
        ship: ['component', 'weapon', 'mining', 'salvage', 'fuel_nozzle'],
        equipment: ['fps_weapon', 'fps_magazine', 'fps_armor'],
    };

    var GROUP_TO_SECTOR = {
        component: 'ship',
        weapon: 'ship',
        mining: 'ship',
        salvage: 'ship',
        fuel_nozzle: 'ship',
        fps_weapon: 'equipment',
        fps_magazine: 'equipment',
        fps_armor: 'equipment',
    };

    var GROUP_META = {
        component: { label_zh: '舰船组件', tab_label: '组件' },
        weapon: { label_zh: '舰船武器', tab_label: '舰船武器' },
        mining: { label_zh: '舰船矿头', tab_label: '矿头' },
        salvage: { label_zh: '打捞模组', tab_label: '打捞' },
        fuel_nozzle: { label_zh: '燃料喷嘴', tab_label: '燃料喷嘴' },
        fps_weapon: { label_zh: '个人武器', tab_label: '个人武器' },
        fps_magazine: { label_zh: '武器配件', tab_label: '弹夹' },
        fps_armor: { label_zh: '个人护甲', tab_label: '个人护甲' },
    };

    var TYPE_ORDER_BY_GROUP = {
        component: ['cooling', 'power', 'shield', 'quantum', 'jump', 'radar'],
        weapon: ['ship_weapon', 'ship_missile', 'missile_rack', 'ship_turret'],
        mining: ['mining_laser', 'ship_module'],
        salvage: ['salvage_scraper'],
        fuel_nozzle: ['fuel_nozzle'],
        fps_weapon: [
            'weapon_pistol',
            'weapon_smg',
            'weapon_rifle',
            'weapon_sniper',
            'weapon_shotgun',
            'weapon_lmg',
            'weapon_launcher',
            'weapon_crossbow',
            'weapon_throwable',
            'weapon_melee',
            'weapon_misc',
        ],
        fps_armor: [
            'armor_helmet',
            'armor_torso',
            'armor_legs',
            'armor_arms',
            'armor_backpack',
            'armor_undersuit',
        ],
        fps_magazine: [
            'magazine',
            'attachment_ironsight',
            'attachment_barrel',
            'attachment_bottom',
            'attachment_utility',
            'attachment_missile',
        ],
    };

    var DEFAULT_TYPE_BY_GROUP = {
        component: 'cooling',
        weapon: 'ship_weapon',
        mining: 'mining_laser',
        salvage: 'salvage_scraper',
        fuel_nozzle: 'fuel_nozzle',
        fps_weapon: 'weapon_pistol',
        fps_armor: 'armor_helmet',
        fps_magazine: 'magazine',
    };

    var GROUP_ORDER = [
        'component',
        'weapon',
        'mining',
        'salvage',
        'fuel_nozzle',
        'fps_weapon',
        'fps_magazine',
        'fps_armor',
    ];

    var state = {
        meta: null,
        sector: 'ship',
        group: 'component',
        type: 'cooling',
        searchSuggestItems: [],
        searchSuggestIndex: -1,
        searchTimer: null,
        listSearchQuery: '',
        page: 1,
        total: 0,
        items: [],
        selectedId: null,
        blueprint: null,
        qualities: {},
        simTimer: null,
        simRaf: null,
        persistTimer: null,
        matModTimer: null,
        matModPending: null,
        loadingList: false,
        selectionNavRetry: false,
        pendingComponentId: null,
        weaponItem: null,
        attachmentStats: null,
        lastSimData: null,
        listVirt: {
            enabled: false,
            raf: null,
            startIndex: -1,
            endIndex: -1,
            rowHeight: LIST_ROW_HEIGHT,
            measured: false,
        },
        selectBlueprintSeq: 0,
        prefetchTimer: null,
        missionTimer: null,
    };

    var el = {};

    function $(id) {
        return document.getElementById(id);
    }

    function apiUrl(path) {
        return API_BASE + path;
    }

    function fetchJson(path, options) {
        var opts = options || {};
        return fetch(apiUrl(path), {
            method: opts.method || 'GET',
            headers: Object.assign({ Accept: 'application/json' }, opts.headers || {}),
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            credentials: 'same-origin',
        }).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) {
                    var err = new Error((data && data.message) || '请求失败');
                    err.code = data && data.code;
                    err.status = res.status;
                    throw err;
                }
                return data;
            });
        });
    }

    function readStoredQualities() {
        try {
            var raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    function writeStoredQualities(map) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(map || {}));
        } catch (_) {
            /* ignore */
        }
    }

    function parseUrlState() {
        var params = new URLSearchParams(window.location.search);
        var sector = params.get('sector');
        var group = params.get('group');
        var type = params.get('type');
        var blueprint = params.get('blueprint');
        var component = params.get('component') || params.get('id');
        if (group && GROUP_META[group]) {
            state.group = group;
            state.sector = GROUP_TO_SECTOR[group] || 'ship';
        } else if (sector && SECTOR_META[sector]) {
            state.sector = sector;
            var groups = GROUP_BY_SECTOR[sector] || [];
            state.group = groups[0] || state.group;
        }
        if (type) state.type = type;
        if (blueprint) state.selectedId = blueprint;
        if (component) state.pendingComponentId = component;
    }

    function readDeepLinkBlueprintId() {
        if (state.selectedId) return state.selectedId;
        try {
            var fromUrl = new URLSearchParams(window.location.search || '').get('blueprint');
            if (fromUrl) return fromUrl;
            var pending = sessionStorage.getItem(BP_PENDING_BLUEPRINT_KEY);
            if (pending) return pending;
        } catch (_) {
            /* ignore */
        }
        return '';
    }

    function applyPendingCraftDeepLink() {
        try {
            var fromUrl = new URLSearchParams(window.location.search || '').get('blueprint');
            if (fromUrl) {
                state.selectedId = fromUrl;
            } else {
                var pendingBp = sessionStorage.getItem(BP_PENDING_BLUEPRINT_KEY);
                if (pendingBp) state.selectedId = pendingBp;
            }
            if (!fromUrl) {
                var pendingGroup = sessionStorage.getItem(BP_PENDING_GROUP_KEY);
                var pendingType = sessionStorage.getItem(BP_PENDING_TYPE_KEY);
                if (pendingGroup && GROUP_META[pendingGroup]) {
                    state.group = pendingGroup;
                    state.sector = GROUP_TO_SECTOR[pendingGroup] || state.sector;
                }
                if (pendingType) state.type = pendingType;
            }
            sessionStorage.removeItem(BP_PENDING_BLUEPRINT_KEY);
            sessionStorage.removeItem(BP_PENDING_GROUP_KEY);
            sessionStorage.removeItem(BP_PENDING_TYPE_KEY);
        } catch (_) {
            /* ignore */
        }
    }

    function buildBlueprintCraftPageUrl(bp) {
        var params = new URLSearchParams();
        params.set('sector', state.sector);
        params.set('group', state.group);
        params.set('type', state.type);
        var blueprintId = (bp && bp.uuid) || state.selectedId;
        if (blueprintId) params.set('blueprint', blueprintId);
        return 'blueprint-crafting.html?' + params.toString();
    }

    function stashBlueprintCraftReturnState() {
        try {
            sessionStorage.setItem(BP_RETURN_URL_KEY, buildBlueprintCraftPageUrl(state.blueprint));
            if (el.listWrap) {
                sessionStorage.setItem(BP_RETURN_SCROLL_KEY, String(el.listWrap.scrollTop || 0));
            }
            sessionStorage.setItem(BP_RESTORE_FLAG_KEY, '1');
            sessionStorage.setItem(DETAIL_RETURN_SOURCE_KEY, 'blueprint-crafting');
            sessionStorage.removeItem(LIST_RESTORE_FLAG_KEY);
        } catch (_) {
            /* ignore */
        }
    }

    function sanitizeBlueprintRestoreFlag() {
        try {
            if (sessionStorage.getItem(BP_RESTORE_FLAG_KEY) !== '1') return;
            var ref = String(document.referrer || '');
            if (!ref || !/ship-component-detail/i.test(ref)) {
                sessionStorage.removeItem(BP_RESTORE_FLAG_KEY);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function applyBlueprintCraftReturnState() {
        try {
            var current = new URL(window.location.href);
            if (current.searchParams.get('blueprint') || state.selectedId) return;

            var stored = sessionStorage.getItem(BP_RETURN_URL_KEY) || '';
            if (!stored) return;
            var saved = new URL(stored, window.location.href);
            if (!/\/blueprint-crafting(?:\.html)?$/i.test(saved.pathname)) return;

            var pending = sessionStorage.getItem(BP_RESTORE_FLAG_KEY) === '1';
            var ref = String(document.referrer || '');
            if (pending && /ship-component-detail/i.test(ref)) return;

            var urlBlueprint = current.searchParams.get('blueprint');
            if (!pending && urlBlueprint) return;

            saved.searchParams.forEach(function (value, key) {
                if (key === 'group' && GROUP_META[value]) {
                    state.group = value;
                    state.sector = GROUP_TO_SECTOR[value] || state.sector;
                } else if (key === 'sector' && value) {
                    state.sector = value;
                } else if (key === 'type' && value) {
                    state.type = value;
                } else if (key === 'blueprint' && value) {
                    state.selectedId = value;
                }
            });
            history.replaceState(null, '', saved.pathname + saved.search);
        } catch (_) {
            /* ignore */
        }
    }

    function finishBlueprintListRestore() {
        if (sessionStorage.getItem(BP_RESTORE_FLAG_KEY) !== '1') return;
        try {
            var scrollY = Number(sessionStorage.getItem(BP_RETURN_SCROLL_KEY) || 0);
            if (el.listWrap && scrollY > 0) {
                el.listWrap.scrollTop = scrollY;
                if (state.listVirt.enabled) renderVisibleBlueprintList(true);
            }
            scrollActiveListItem();
            sessionStorage.removeItem(BP_RESTORE_FLAG_KEY);
        } catch (_) {
            /* ignore */
        }
    }

    function shouldPreserveSelectedBlueprint(id) {
        if (!id) return false;
        if (sessionStorage.getItem(BP_RESTORE_FLAG_KEY) === '1') return true;
        if (sessionStorage.getItem(BP_PENDING_BLUEPRINT_KEY)) return true;
        if (state.selectedId === id) return true;
        return !!new URLSearchParams(window.location.search || '').get('blueprint');
    }

    function applyBlueprintNavContext(bp) {
        if (!bp) return;
        if (bp.nav_group && GROUP_META[bp.nav_group]) {
            state.group = bp.nav_group;
            state.sector = GROUP_TO_SECTOR[bp.nav_group] || state.sector;
        }
        if (bp.nav_type) state.type = bp.nav_type;
    }

    function resolveSelectedBlueprintNav() {
        if (!state.selectedId && state.pendingComponentId) {
            return fetchJson(
                '/api/sc/components/' + encodeURIComponent(state.pendingComponentId) + '/craft-blueprint'
            )
                .then(function (data) {
                    var bp = data && data.blueprint;
                    if (bp && bp.uuid) state.selectedId = bp.uuid;
                    applyBlueprintNavContext(bp);
                    return bp;
                })
                .catch(function () {
                    return null;
                });
        }
        if (!state.selectedId) return Promise.resolve(null);
        return fetchJson('/api/sc/blueprints/' + encodeURIComponent(state.selectedId))
            .then(function (data) {
                var bp = data && data.blueprint;
                applyBlueprintNavContext(bp);
                return bp;
            })
            .catch(function () {
                return null;
            });
    }

    function syncNavControlsFromState() {
        renderGroupSelect();
        renderTypeSelect();
        if (el.groupSelect) el.groupSelect.value = state.group;
        if (el.typeSelect && el.typeField && !el.typeField.hidden) {
            el.typeSelect.value = state.type;
        }
    }

    function normalizeNavForMeta() {
        if (state.selectedId) {
            if (!GROUP_META[state.group] || groupCount(state.group) === 0) {
                var selectedGroup = GROUP_ORDER.find(function (g) {
                    return groupCount(g) > 0;
                });
                if (selectedGroup) {
                    state.group = selectedGroup;
                    state.sector = GROUP_TO_SECTOR[selectedGroup];
                }
            }
            return;
        }
        if (!visibleTypesForGroup(state.group).includes(state.type)) {
            var vis = visibleTypesForGroup(state.group);
            state.type = vis.length ? vis[0] : DEFAULT_TYPE_BY_GROUP[state.group];
        }
        if (!GROUP_ORDER.includes(state.group) || groupCount(state.group) === 0) {
            var firstGroup = GROUP_ORDER.find(function (g) {
                return groupCount(g) > 0;
            });
            if (firstGroup) {
                state.group = firstGroup;
                state.sector = GROUP_TO_SECTOR[firstGroup];
                var vis2 = visibleTypesForGroup(firstGroup);
                state.type = vis2.length ? vis2[0] : DEFAULT_TYPE_BY_GROUP[firstGroup];
            }
        }
    }

    function buildComponentDetailHref(bp) {
        if (!bp || !bp.component_id) return '#';
        var params = new URLSearchParams();
        params.set('id', bp.component_id);
        params.set('from', 'blueprint-crafting');
        params.set('from_sector', state.sector);
        params.set('from_group', state.group);
        params.set('from_type', state.type);
        if (bp.uuid) params.set('from_blueprint', bp.uuid);
        return 'ship-component-detail?' + params.toString();
    }

    function pushUrlState() {
        var params = new URLSearchParams();
        params.set('sector', state.sector);
        params.set('group', state.group);
        params.set('type', state.type);
        if (state.selectedId) params.set('blueprint', state.selectedId);
        var next = window.location.pathname + '?' + params.toString();
        window.history.replaceState(null, '', next);
    }

    function groupCount(groupKey) {
        if (!state.meta || !state.meta.counts_by_group) return null;
        return state.meta.counts_by_group[groupKey];
    }

    function updateListCount() {
        if (!el.listCount) return;
        var n = state.items.length;
        if (state.listSearchQuery) {
            var total = state.total || n;
            el.listCount.textContent =
                total > n ? n + ' / ' + total + ' 个匹配' : total + ' 个匹配';
            return;
        }
        el.listCount.textContent = n + ' 个蓝图';
    }

    function typeCount(typeKey) {
        if (!state.meta || !state.meta.counts_by_type) return null;
        var n = state.meta.counts_by_type[typeKey];
        return n != null ? n : null;
    }

    function visibleTypesForGroup(groupKey) {
        var order = TYPE_ORDER_BY_GROUP[groupKey] || [];
        return order.filter(function (typeKey) {
            var count = typeCount(typeKey);
            return count != null && count > 0;
        });
    }

    function renderGroupSelect() {
        if (!el.groupSelect) return;
        el.groupSelect.innerHTML = '';
        var hasCurrent = false;
        GROUP_ORDER.forEach(function (groupKey) {
            var count = groupCount(groupKey);
            if (count === 0 || count == null) return;
            var meta = GROUP_META[groupKey] || { tab_label: groupKey };
            var opt = document.createElement('option');
            opt.value = groupKey;
            opt.textContent =
                (meta.tab_label || meta.label_zh || groupKey) + ' (' + count + ')';
            el.groupSelect.appendChild(opt);
            if (groupKey === state.group) hasCurrent = true;
        });
        if (hasCurrent) {
            el.groupSelect.value = state.group;
        } else if (el.groupSelect.options.length) {
            state.group = el.groupSelect.options[0].value;
            el.groupSelect.value = state.group;
            state.type = DEFAULT_TYPE_BY_GROUP[state.group] || state.type;
        }
    }

    function renderTypeSelect() {
        if (!el.typeSelect || !el.typeField) return;
        var visible = visibleTypesForGroup(state.group);
        if (state.group === 'other' || visible.length <= 1) {
            el.typeField.hidden = true;
            el.typeSelect.innerHTML = '';
            if (visible.length === 1) {
                state.type = visible[0];
            } else if (!visible.length) {
                state.type = DEFAULT_TYPE_BY_GROUP[state.group] || state.type;
            }
            return;
        }
        el.typeField.hidden = false;
        el.typeSelect.innerHTML = '';
        visible.forEach(function (typeKey) {
            var count = typeCount(typeKey);
            var opt = document.createElement('option');
            opt.value = typeKey;
            opt.textContent = typeLabel(typeKey) + (count != null ? ' (' + count + ')' : '');
            el.typeSelect.appendChild(opt);
        });
        if (el.typeSelect.querySelector('option[value="' + state.type + '"]')) {
            el.typeSelect.value = state.type;
        } else if (!state.selectedId) {
            state.type = visible[0];
            el.typeSelect.value = state.type;
        }
    }

    function formatUsageGrade(item) {
        if (!item) return '';
        var usage = String(item.class_zh || item.class_short_zh || '').trim();
        var grade = String(item.grade_letter || '').trim();
        if (usage && grade) return usage + ' ' + grade;
        return usage || grade || '';
    }

    function blueprintListMeta(item) {
        var parts = [];
        if (state.listSearchQuery) {
            var group = item.group_label_zh || groupLabel(item.nav_group);
            var type = item.type_label_zh || typeLabel(item.nav_type);
            if (group) parts.push(group);
            if (type && type !== group) parts.push(type);
        } else if (item.type_label_zh) {
            parts.push(item.type_label_zh);
        }
        appendBlueprintArmorClassPart(parts, item);
        var usageGrade = formatUsageGrade(item);
        if (usageGrade) parts.push(usageGrade);
        if (!isPersonalArmorNavType(item.nav_type) && item.size != null && item.size !== '') {
            parts.push('S' + item.size);
        }
        return parts.join(' · ');
    }

    function blueprintOutputSubParts(item) {
        var parts = [];
        if (item.type_label_zh) parts.push(item.type_label_zh);
        else if (item.nav_type) parts.push(typeLabel(item.nav_type));
        if (!isPersonalArmorNavType(item.nav_type)) {
            if (item.group_label_zh) parts.push(item.group_label_zh);
            else if (item.nav_group) parts.push(groupLabel(item.nav_group));
        }
        appendBlueprintArmorClassPart(parts, item);
        return parts;
    }

    function blueprintIndexById(id) {
        if (!id) return -1;
        for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].uuid === id) return i;
        }
        return -1;
    }

    function listRowStride() {
        return state.listVirt.rowHeight || LIST_ROW_HEIGHT;
    }

    function ensureListPhantom() {
        if (!el.listWrap || el.listPhantom) return;
        el.listPhantom = document.createElement('div');
        el.listPhantom.className = 'bp-list-phantom';
        el.listPhantom.setAttribute('aria-hidden', 'true');
        el.listWrap.insertBefore(el.listPhantom, el.blueprintList);
    }

    function updateListPhantomHeight() {
        if (!el.listPhantom || !state.listVirt.enabled) return;
        var stride = listRowStride();
        var total = state.items.length;
        var height = Math.max(0, total * stride - 4);
        el.listPhantom.style.height = height + 'px';
    }

    function measureListRowHeight() {
        if (!el.blueprintList || !state.items.length) return LIST_ROW_HEIGHT;
        var sampleIdx = 0;
        for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].unlocking_missions_count > 0) {
                sampleIdx = i;
                break;
            }
        }
        var li = createBlueprintListItemElement(state.items[sampleIdx], sampleIdx);
        li.style.visibility = 'hidden';
        li.style.pointerEvents = 'none';
        el.blueprintList.appendChild(li);
        var h = Math.ceil(li.getBoundingClientRect().height);
        li.remove();
        return Math.max(56, h + 4);
    }

    function getVirtualRange() {
        var stride = listRowStride();
        var total = state.items.length;
        if (!total) return { start: 0, end: 0, offset: 0 };
        var scrollTop = el.listWrap ? el.listWrap.scrollTop : 0;
        var viewH = el.listWrap ? el.listWrap.clientHeight : 0;
        var start = Math.floor(scrollTop / stride) - LIST_OVERSCAN;
        var visible = Math.ceil(viewH / stride) + 1;
        start = Math.max(0, start);
        var end = Math.min(total, start + visible + LIST_OVERSCAN * 2);
        if (end - start < visible + LIST_OVERSCAN) {
            start = Math.max(0, end - visible - LIST_OVERSCAN * 2);
        }
        return { start: start, end: end, offset: start * stride };
    }

    function populateBlueprintListItem(btn, item) {
        btn.setAttribute('data-uuid', item.uuid);
        btn.setAttribute('role', 'option');
        var isActive = state.selectedId === item.uuid;
        btn.className = 'bp-list-item' + (isActive ? ' is-active' : '');
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');

        var name = btn.querySelector('.bp-list-item__name');
        if (!name) {
            name = document.createElement('span');
            name.className = 'bp-list-item__name';
            btn.insertBefore(name, btn.firstChild);
        }
        name.textContent = blueprintDisplayName(item);

        var metaText = blueprintListMeta(item);
        var metaEl = btn.querySelector('.bp-list-item__meta');
        if (metaText) {
            if (!metaEl) {
                metaEl = document.createElement('span');
                metaEl.className = 'bp-list-item__meta';
                btn.insertBefore(metaEl, name.nextSibling);
            }
            metaEl.textContent = metaText;
        } else if (metaEl) {
            metaEl.remove();
        }

        var badges = btn.querySelector('.bp-list-item__badges');
        if (!badges) {
            badges = document.createElement('span');
            badges.className = 'bp-list-item__badges';
            btn.appendChild(badges);
        }
        badges.innerHTML = '';
        if (item.is_available_by_default) {
            var defBadge = document.createElement('span');
            defBadge.className = 'bp-list-item__badge bp-list-item__badge--default';
            defBadge.textContent = '默认可造';
            badges.appendChild(defBadge);
        } else if (item.unlocking_missions_count > 0) {
            var missBadge = document.createElement('span');
            missBadge.className = 'bp-list-item__badge bp-list-item__badge--mission';
            missBadge.textContent = '任务解锁 ×' + item.unlocking_missions_count;
            missBadge.title = '需完成蓝图任务解锁';
            badges.appendChild(missBadge);
        }
        if (!badges.childNodes.length) badges.remove();
    }

    function createBlueprintListItemElement(item, index) {
        var li = document.createElement('li');
        li.className = 'bp-list__row';
        li.setAttribute('data-index', String(index));
        var btn = document.createElement('button');
        btn.type = 'button';
        populateBlueprintListItem(btn, item);
        li.appendChild(btn);
        return li;
    }

    function renderVisibleBlueprintList(force) {
        if (!el.blueprintList || !state.listVirt.enabled) return;
        var range = getVirtualRange();
        var sameRange =
            !force &&
            range.start === state.listVirt.startIndex &&
            range.end === state.listVirt.endIndex;
        if (sameRange) {
            setBlueprintListActive(state.selectedId);
            return;
        }
        state.listVirt.startIndex = range.start;
        state.listVirt.endIndex = range.end;
        el.blueprintList.style.setProperty('--bp-list-offset', range.offset + 'px');
        var frag = document.createDocumentFragment();
        for (var i = range.start; i < range.end; i++) {
            frag.appendChild(createBlueprintListItemElement(state.items[i], i));
        }
        el.blueprintList.innerHTML = '';
        el.blueprintList.appendChild(frag);
    }

    function scheduleVisibleListRender() {
        if (!state.listVirt.enabled) return;
        if (state.listVirt.raf) return;
        state.listVirt.raf = requestAnimationFrame(function () {
            state.listVirt.raf = null;
            renderVisibleBlueprintList(false);
        });
    }

    function resetVirtualListWindow() {
        state.listVirt.startIndex = -1;
        state.listVirt.endIndex = -1;
        if (el.listWrap) el.listWrap.scrollTop = 0;
    }

    function renderBlueprintList() {
        if (!el.blueprintList) return;
        state.listVirt.enabled = state.items.length >= LIST_VIRTUAL_MIN;
        state.listVirt.startIndex = -1;
        state.listVirt.endIndex = -1;

        if (!state.items.length) {
            state.listVirt.enabled = false;
            el.blueprintList.classList.remove('is-virtual');
            el.blueprintList.innerHTML = '';
            el.blueprintList.style.setProperty('--bp-list-offset', '0');
            if (el.listPhantom) el.listPhantom.style.height = '0';
            if (el.listEmpty) el.listEmpty.hidden = false;
            updateListCount();
            return;
        }
        if (el.listEmpty) el.listEmpty.hidden = true;

        if (state.listVirt.enabled) {
            if (!state.listVirt.measured) {
                state.listVirt.rowHeight = measureListRowHeight();
                state.listVirt.measured = true;
            }
            ensureListPhantom();
            el.blueprintList.classList.add('is-virtual');
            updateListPhantomHeight();
            renderVisibleBlueprintList(true);
        } else {
            state.listVirt.measured = false;
            el.blueprintList.classList.remove('is-virtual');
            el.blueprintList.style.setProperty('--bp-list-offset', '0');
            if (el.listPhantom) el.listPhantom.style.height = '0';
            var frag = document.createDocumentFragment();
            state.items.forEach(function (item, index) {
                frag.appendChild(createBlueprintListItemElement(item, index));
            });
            el.blueprintList.innerHTML = '';
            el.blueprintList.appendChild(frag);
        }
        updateListCount();
        scrollActiveListItem();
        state.items.slice(0, 5).forEach(function (item) {
            if (item && item.uuid) prefetchBlueprintDetail(item.uuid);
        });
    }

    function scrollToBlueprintIndex(index) {
        if (!el.listWrap || index < 0) return;
        var stride = listRowStride();
        var itemTop = index * stride;
        var itemBottom = itemTop + stride;
        var scrollTop = el.listWrap.scrollTop;
        var viewH = el.listWrap.clientHeight;
        if (itemTop < scrollTop) {
            el.listWrap.scrollTop = itemTop;
        } else if (itemBottom > scrollTop + viewH) {
            el.listWrap.scrollTop = itemBottom - viewH;
        }
        if (state.listVirt.enabled) renderVisibleBlueprintList(true);
    }

    function scrollActiveListItem() {
        if (!state.selectedId) return;
        var idx = blueprintIndexById(state.selectedId);
        if (idx < 0) return;
        if (state.listVirt.enabled) {
            scrollToBlueprintIndex(idx);
            setBlueprintListActive(state.selectedId);
            return;
        }
        if (!el.blueprintList) return;
        var active = el.blueprintList.querySelector('.bp-list-item.is-active');
        if (active && active.scrollIntoView) {
            active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function wireBlueprintListEvents() {
        if (!el.blueprintList || el.blueprintList.dataset.wired === '1') return;
        el.blueprintList.dataset.wired = '1';
        el.blueprintList.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.bp-list-item');
            if (!btn) return;
            var uuid = btn.getAttribute('data-uuid');
            if (!uuid) return;
            var idx = blueprintIndexById(uuid);
            var item = idx >= 0 ? state.items[idx] : null;
            if (!item) return;
            if (
                state.listSearchQuery &&
                (item.nav_group !== state.group || item.nav_type !== state.type)
            ) {
                jumpToBlueprint(item);
                return;
            }
            selectBlueprint(item.uuid);
        });
        el.blueprintList.addEventListener('mouseover', function (ev) {
            var btn = ev.target.closest('.bp-list-item');
            if (!btn) return;
            var uuid = btn.getAttribute('data-uuid');
            if (uuid) scheduleBlueprintPrefetch(uuid);
        });
    }

    function wireVirtualListScroll() {
        if (!el.listWrap || el.listWrap.dataset.virtWired === '1') return;
        el.listWrap.dataset.virtWired = '1';
        el.listWrap.addEventListener(
            'scroll',
            function () {
                scheduleVisibleListRender();
            },
            { passive: true }
        );
        window.addEventListener(
            'resize',
            function () {
                if (!state.listVirt.enabled) return;
                state.listVirt.startIndex = -1;
                state.listVirt.endIndex = -1;
                updateListPhantomHeight();
                scheduleVisibleListRender();
            },
            { passive: true }
        );
    }

    function clearListSearch() {
        state.listSearchQuery = '';
        if (el.search) el.search.value = '';
        hideSearchSuggestions();
    }

    function setGroup(groupKey) {
        if (!groupKey || groupKey === state.group) return;
        clearListSearch();
        state.group = groupKey;
        state.sector = GROUP_TO_SECTOR[groupKey] || 'ship';
        var visible = visibleTypesForGroup(groupKey);
        state.type =
            visible.length > 0
                ? visible[0]
                : DEFAULT_TYPE_BY_GROUP[groupKey] || state.type;
        state.selectedId = null;
        pushUrlState();
        renderGroupSelect();
        renderTypeSelect();
        loadAllBlueprints();
    }

    function setType(typeKey) {
        if (!typeKey || typeKey === state.type) return;
        clearListSearch();
        state.type = typeKey;
        state.selectedId = null;
        pushUrlState();
        renderTypeSelect();
        loadAllBlueprints();
    }

    function isPlaceholderBlueprintName(text) {
        var v = String(text || '').trim();
        if (!v) return true;
        if (/^<=\s*PLACEHOLDER\s*=>$/i.test(v)) return true;
        if (/\b(?:placeholder|NAME_HERE|NotTranslated)\b/i.test(v)) return true;
        if (/\[(?:PH|WIP|TMP|TBD|TODO)\]/i.test(v)) return true;
        return false;
    }

    function humanizeBlueprintKey(raw) {
        var s = String(raw || '').trim();
        if (!s) return '';
        s = s.replace(/^BP_CRAFT_/i, '').replace(/_SCItem$/i, '').replace(/,P$/i, '');
        var parts = s.split('_').filter(Boolean);
        if (!parts.length) return '';
        var skipTypes = {
            COOL: 1, SHLD: 1, PWPL: 1, PWRC: 1, RADR: 1, QDRV: 1, JDRV: 1, WEAP: 1, MISL: 1,
            MRCK: 1, TURR: 1, MINL: 1, MODL: 1, CARR: 1, CARRYABLE: 1,
        };
        var mfg = {
            AEGS: 'Aegis', RSI: 'RSI', ANVL: 'Anvil', ORIG: 'Origin', DRAK: 'Drake', CRUS: 'Crusader',
            MISC: 'MISC', BEHR: 'Behring', KLWE: 'Klaus & Werner', KSAR: 'Kastak Arms', GMNI: 'Gemini',
            WCPR: 'Workshop', TYDT: "Ty'd Tymon", LPLT: 'Levsky Plating', VNCL: 'Vanduul', WLOP: 'WillsOp',
        };
        var tokens = [];
        var i = 0;
        if (skipTypes[parts[0].toUpperCase()]) i = 1;
        if (parts[i] && mfg[parts[i].toUpperCase()]) {
            tokens.push(mfg[parts[i].toUpperCase()]);
            i += 1;
        } else if (parts[i] && /^[A-Z]{2,5}$/.test(parts[i])) {
            tokens.push(parts[i]);
            i += 1;
        }
        if (parts[i] && /^S\d{2}$/i.test(parts[i])) {
            tokens.push('S' + parseInt(parts[i].slice(1), 10));
            i += 1;
        }
        for (; i < parts.length; i++) {
            if (!/^SCItem$/i.test(parts[i])) tokens.push(parts[i]);
        }
        return tokens.length ? tokens.join(' ') : s.replace(/_/g, ' ');
    }

    function blueprintDisplayName(item) {
        var zh = item && item.name_zh;
        var en = item && item.name_en;
        if (zh && !isPlaceholderBlueprintName(zh)) return zh;
        if (en && !isPlaceholderBlueprintName(en)) return en;
        return humanizeBlueprintKey(item && item.key) || (item && item.key) || '未命名蓝图';
    }

    function blueprintLabel(item) {
        var parts = [blueprintDisplayName(item)];
        var usageGrade = formatUsageGrade(item);
        if (usageGrade) parts.push(usageGrade);
        if (item.size != null && item.size !== '') parts.push('S' + item.size);
        return parts.join(' · ');
    }

    function pickInitialBlueprint() {
        var id = readDeepLinkBlueprintId();
        if (id) state.selectedId = id;

        if (!state.items.length) {
            if (state.selectedId) {
                state.consumeListRestore = sessionStorage.getItem(BP_RESTORE_FLAG_KEY) === '1';
                selectBlueprint(state.selectedId);
            } else {
                selectBlueprint(null);
            }
            return Promise.resolve();
        }

        id = state.selectedId;
        if (id && !state.items.some(function (x) { return x.uuid === id; })) {
            if (shouldPreserveSelectedBlueprint(id) && !state.selectionNavRetry) {
                state.selectionNavRetry = true;
                return resolveSelectedBlueprintNav().then(function (bp) {
                    if (!bp) {
                        state.consumeListRestore = sessionStorage.getItem(BP_RESTORE_FLAG_KEY) === '1';
                        selectBlueprint(id);
                        return;
                    }
                    pushUrlState();
                    syncNavControlsFromState();
                    return loadAllBlueprints({ force: true });
                });
            }
            if (shouldPreserveSelectedBlueprint(id)) {
                state.consumeListRestore = true;
                selectBlueprint(id);
                return Promise.resolve();
            }
            id = null;
        }
        if (id) {
            if (sessionStorage.getItem(BP_RESTORE_FLAG_KEY) === '1') {
                state.consumeListRestore = true;
            }
            selectBlueprint(id);
        } else {
            selectBlueprint(null);
        }
        return Promise.resolve();
    }

    function showGate(msg) {
        if (!el.gate) return;
        el.gate.textContent = msg;
        el.gate.classList.remove('is-hidden');
    }

    function hideGate() {
        if (!el.gate) return;
        el.gate.classList.add('is-hidden');
    }

    function formatCraftTime(sec) {
        var s = Number(sec) || 0;
        if (s < 60) return s + ' 秒';
        var m = Math.floor(s / 60);
        var r = s % 60;
        return r ? m + ' 分 ' + r + ' 秒' : m + ' 分钟';
    }

    function typeLabel(typeKey) {
        var types = (state.meta && state.meta.types) || {};
        return (types[typeKey] && types[typeKey].label_zh) || typeKey;
    }

    function groupLabel(groupKey) {
        var groups = (state.meta && state.meta.groups) || {};
        return (groups[groupKey] && groups[groupKey].label_zh) || (GROUP_META[groupKey] && GROUP_META[groupKey].label_zh) || groupKey;
    }

    function blueprintSuggestMeta(item) {
        var parts = [];
        var group = item.group_label_zh || groupLabel(item.nav_group);
        var type = item.type_label_zh || typeLabel(item.nav_type);
        if (group) parts.push(group);
        if (type && type !== group) parts.push(type);
        appendBlueprintArmorClassPart(parts, item);
        var usageGrade = formatUsageGrade(item);
        if (usageGrade) parts.push(usageGrade);
        if (!isPersonalArmorNavType(item.nav_type) && item.size != null && item.size !== '') {
            parts.push('S' + item.size);
        }
        return parts.join(' · ');
    }

    function hideSearchSuggestions() {
        state.searchSuggestItems = [];
        state.searchSuggestIndex = -1;
        if (!el.searchSuggest) return;
        el.searchSuggest.hidden = true;
        el.searchSuggest.innerHTML = '';
        if (el.search) el.search.setAttribute('aria-expanded', 'false');
    }

    function highlightSearchMatch(text, query) {
        var raw = String(text || '');
        var q = String(query || '').trim();
        if (!raw || !q) return escapeHtml(raw);
        var lower = raw.toLowerCase();
        var qLower = q.toLowerCase();
        var idx = lower.indexOf(qLower);
        if (idx < 0) return escapeHtml(raw);
        return (
            escapeHtml(raw.slice(0, idx)) +
            '<mark class="bp-search-suggest__mark">' +
            escapeHtml(raw.slice(idx, idx + q.length)) +
            '</mark>' +
            escapeHtml(raw.slice(idx + q.length))
        );
    }

    function renderSearchSuggestions(items, query) {
        if (!el.searchSuggest) return;
        state.searchSuggestItems = items || [];
        state.searchSuggestIndex = items && items.length ? 0 : -1;
        el.searchSuggest.innerHTML = '';
        if (!items || !items.length) {
            var empty = document.createElement('p');
            empty.className = 'bp-search-suggest__empty';
            empty.textContent = query ? '未找到匹配蓝图' : '输入名称搜索全部可制造蓝图';
            el.searchSuggest.appendChild(empty);
            el.searchSuggest.hidden = false;
            if (el.search) el.search.setAttribute('aria-expanded', 'true');
            return;
        }
        items.forEach(function (item, index) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bp-search-suggest__item' + (index === 0 ? ' is-active' : '');
            btn.setAttribute('role', 'option');
            btn.setAttribute('data-uuid', item.uuid);
            btn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
            var name = document.createElement('span');
            name.className = 'bp-search-suggest__name';
            name.innerHTML = highlightSearchMatch(blueprintDisplayName(item), query);
            btn.appendChild(name);
            var meta = blueprintSuggestMeta(item);
            if (meta) {
                var sub = document.createElement('span');
                sub.className = 'bp-search-suggest__meta';
                sub.textContent = meta;
                btn.appendChild(sub);
            }
            btn.addEventListener('mousedown', function (ev) {
                ev.preventDefault();
            });
            btn.addEventListener('click', function () {
                jumpToBlueprint(item);
            });
            el.searchSuggest.appendChild(btn);
        });
        el.searchSuggest.hidden = false;
        if (el.search) el.search.setAttribute('aria-expanded', 'true');
    }

    function updateSearchSuggestActive() {
        if (!el.searchSuggest) return;
        var buttons = el.searchSuggest.querySelectorAll('.bp-search-suggest__item');
        buttons.forEach(function (btn, index) {
            var active = index === state.searchSuggestIndex;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (state.searchSuggestIndex >= 0 && buttons[state.searchSuggestIndex]) {
            buttons[state.searchSuggestIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function scheduleGlobalBlueprintSearch(query) {
        if (state.searchTimer) clearTimeout(state.searchTimer);
        var q = String(query || '').trim();
        if (q.length < SEARCH_MIN_LEN) {
            if (state.listSearchQuery) {
                state.listSearchQuery = '';
                loadAllBlueprints();
            }
            hideSearchSuggestions();
            return;
        }
        state.listSearchQuery = q;
        state.searchTimer = setTimeout(function () {
            state.searchTimer = null;
            if (String(el.search && el.search.value.trim()) !== q) return;
            loadAllBlueprints().then(function () {
                if (String(el.search && el.search.value.trim()) !== q) return;
                renderSearchSuggestions(state.items.slice(0, SEARCH_SUGGEST_LIMIT), q);
            });
        }, SEARCH_DEBOUNCE_MS);
    }

    function jumpToBlueprint(item) {
        if (!item || !item.uuid) return;
        hideSearchSuggestions();
        state.listSearchQuery = '';
        if (el.search) el.search.value = '';

        state.sector = GROUP_TO_SECTOR[item.nav_group] || state.sector;
        state.group = item.nav_group || state.group;
        state.type = item.nav_type || state.type;
        state.selectedId = item.uuid;
        state.consumeListRestore = false;

        renderGroupSelect();
        renderTypeSelect();
        if (el.groupSelect) el.groupSelect.value = state.group;
        if (el.typeSelect && !el.typeField.hidden) el.typeSelect.value = state.type;
        pushUrlState();
        loadAllBlueprints();
    }

    function activateSearchSuggestion(index) {
        var items = state.searchSuggestItems || [];
        if (!items.length) return;
        var idx = index;
        if (idx < 0) idx = items.length - 1;
        if (idx >= items.length) idx = 0;
        state.searchSuggestIndex = idx;
        updateSearchSuggestActive();
    }

    function confirmSearchSuggestion() {
        var items = state.searchSuggestItems || [];
        if (!items.length) return;
        var idx = state.searchSuggestIndex >= 0 ? state.searchSuggestIndex : 0;
        jumpToBlueprint(items[idx]);
    }

    function bindSearchEvents() {
        if (!el.search) return;
        el.search.addEventListener('input', function () {
            scheduleGlobalBlueprintSearch(el.search.value);
        });
        el.search.addEventListener('focus', function () {
            var q = el.search.value.trim();
            if (q.length >= SEARCH_MIN_LEN) {
                scheduleGlobalBlueprintSearch(q);
            }
        });
        el.search.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                hideSearchSuggestions();
                el.search.blur();
                return;
            }
            if (!state.searchSuggestItems.length) return;
            if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                activateSearchSuggestion(state.searchSuggestIndex + 1);
            } else if (ev.key === 'ArrowUp') {
                ev.preventDefault();
                activateSearchSuggestion(state.searchSuggestIndex - 1);
            } else if (ev.key === 'Enter') {
                if (el.searchSuggest && !el.searchSuggest.hidden) {
                    ev.preventDefault();
                    confirmSearchSuggestion();
                }
            }
        });
        el.search.addEventListener('blur', function () {
            window.setTimeout(function () {
                hideSearchSuggestions();
            }, 140);
        });
        document.addEventListener('click', function (ev) {
            if (!el.searchWrap) return;
            if (el.searchWrap.contains(ev.target)) return;
            hideSearchSuggestions();
        });
    }

    function requirementRoleSlug(raw) {
        return String(raw || '')
            .trim()
            .replace(/[^a-z0-9]+/gi, '')
            .toLowerCase();
    }

    function lookupRequirementRoleFromLoc(roleKey, roleLabel) {
        var map = (state.meta && state.meta.requirement_role_loc) || {};
        var candidates = [roleKey, roleLabel];
        for (var i = 0; i < candidates.length; i++) {
            var slug = requirementRoleSlug(candidates[i]);
            if (slug && map[slug]) return map[slug];
        }
        return '';
    }

    function lookupRequirementRoleZh(roleKey, roleLabel) {
        var fromLoc = lookupRequirementRoleFromLoc(roleKey, roleLabel);
        if (fromLoc) return fromLoc;

        var map = (state.meta && state.meta.requirement_role_zh) || {};
        var candidates = [roleKey, roleLabel];
        for (var i = 0; i < candidates.length; i++) {
            var raw = String(candidates[i] || '').trim();
            if (!raw) continue;
            if (map[raw]) return map[raw];
            var upper = raw.toUpperCase();
            if (map[upper]) return map[upper];
            var norm = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
            if (map[norm]) return map[norm];
            if (map[norm.toUpperCase()]) return map[norm.toUpperCase()];
        }
        return '';
    }

    function resolveRoleLabelZh(ing) {
        if (!ing) return '';
        var en = String(ing.role_label || ing.role_key || '').trim();
        var zh = String(ing.role_label_zh || '').trim();
        var resolved =
            lookupRequirementRoleFromLoc(ing.role_key, ing.role_label) ||
            lookupRequirementRoleZh(ing.role_key, ing.role_label);
        if (resolved) return resolved;
        if (zh && (!en || zh !== en)) return zh;
        return en;
    }

    function buildListQuery(page) {
        var q = String(state.listSearchQuery || '').trim();
        if (q) {
            return (
                '/api/sc/blueprints?q=' +
                encodeURIComponent(q) +
                '&page=' +
                page +
                '&limit=' +
                PAGE_SIZE
            );
        }
        return (
            '/api/sc/blueprints?group=' +
            encodeURIComponent(state.group) +
            '&type=' +
            encodeURIComponent(state.type) +
            '&page=' +
            page +
            '&limit=' +
            PAGE_SIZE
        );
    }

    function listCacheKey() {
        var q = String(state.listSearchQuery || '').trim();
        if (q) return 'q:' + q.toLowerCase();
        return state.group + '|' + state.type;
    }

    function setBlueprintListActive(id) {
        if (!el.blueprintList) return;
        var prev = el.blueprintList.querySelector('.bp-list-item.is-active');
        if (prev) {
            prev.classList.remove('is-active');
            prev.setAttribute('aria-selected', 'false');
        }
        if (!id) return;
        var next = el.blueprintList.querySelector('.bp-list-item[data-uuid="' + id + '"]');
        if (next) {
            next.classList.add('is-active');
            next.setAttribute('aria-selected', 'true');
            return;
        }
        if (state.listVirt.enabled) {
            scrollToBlueprintIndex(blueprintIndexById(id));
            next = el.blueprintList.querySelector('.bp-list-item[data-uuid="' + id + '"]');
            if (next) {
                next.classList.add('is-active');
                next.setAttribute('aria-selected', 'true');
            }
        }
    }

    function updateBlueprintListItemUsage(bp) {
        if (!el.blueprintList || !bp || !bp.uuid) return;
        var btn = el.blueprintList.querySelector('.bp-list-item[data-uuid="' + bp.uuid + '"]');
        if (!btn) return;
        var metaEl = btn.querySelector('.bp-list-item__meta');
        var idx = -1;
        for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].uuid === bp.uuid) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return;
        var meta = blueprintListMeta(state.items[idx]);
        if (meta) {
            if (!metaEl) {
                metaEl = document.createElement('span');
                metaEl.className = 'bp-list-item__meta';
                var nameEl = btn.querySelector('.bp-list-item__name');
                if (nameEl && nameEl.nextSibling) btn.insertBefore(metaEl, nameEl.nextSibling);
                else btn.appendChild(metaEl);
            }
            metaEl.textContent = meta;
        } else if (metaEl) {
            metaEl.remove();
        }
    }

    function loadAllBlueprints(options) {
        options = options || {};
        if (state.loadingList && !options.force) return Promise.resolve();

        var preserveScroll =
            options.preserveScroll || sessionStorage.getItem(BP_RESTORE_FLAG_KEY) === '1';
        var cacheKey = listCacheKey();
        if (!options.force && LIST_CACHE[cacheKey]) {
            var cached = LIST_CACHE[cacheKey];
            state.page = 1;
            state.items = cached.items.slice();
            state.total = cached.total;
            if (!preserveScroll && el.listWrap) el.listWrap.scrollTop = 0;
            state.listVirt.measured = false;
            renderBlueprintList();
            enrichArmorClassForListItems();
            return pickInitialBlueprint();
        }

        state.loadingList = true;
        state.page = 1;
        state.items = [];
        if (!preserveScroll && el.listWrap) el.listWrap.scrollTop = 0;
        state.listVirt.measured = false;
        if (el.listWrap) el.listWrap.classList.add('is-loading');

        function fetchNext() {
            return fetchJson(buildListQuery(state.page)).then(function (data) {
                var batch = data.items || [];
                state.total = data.total || 0;
                state.items = state.items.concat(batch);
                if (state.items.length < state.total && batch.length >= PAGE_SIZE) {
                    state.page += 1;
                    return fetchNext();
                }
                LIST_CACHE[cacheKey] = {
                    items: state.items.slice(),
                    total: state.total,
                };
                renderBlueprintList();
                enrichArmorClassForListItems();
                return pickInitialBlueprint();
            });
        }

        return fetchNext()
            .catch(function (err) {
                showGate(err.message || '蓝图列表加载失败');
            })
            .finally(function () {
                state.loadingList = false;
                if (el.listWrap) el.listWrap.classList.remove('is-loading');
            });
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeBlueprintStatLabelZh(text) {
        var t = String(text || '').trim();
        if (t === '完整性' || t === '结构完整性') return '组件耐久';
        if (t === '伤害减免') return '抗 G 值';
        return t;
    }

    function isPersonalArmorNavType(navType) {
        return String(navType || '').indexOf('armor_') === 0;
    }

    var ARMOR_CLASS_ZH_MAP = {
        Light: '轻甲',
        Medium: '中甲',
        Heavy: '重甲',
        light: '轻甲',
        medium: '中甲',
        heavy: '重甲',
    };

    function resolveBlueprintArmorClass(item) {
        if (!item) return null;
        var direct = String(item.armor_class_zh || '').trim();
        if (direct) return direct;
        var wiki = window.ShipComponentWiki;
        if (wiki && wiki.formatArmorClassLabel) {
            var hit = wiki.formatArmorClassLabel(item);
            if (hit) return hit;
        }
        var output = item.output;
        if (output && typeof output === 'object') {
            var raw = String(output.sub_type || output.subtype || '').trim();
            if (ARMOR_CLASS_ZH_MAP[raw]) return ARMOR_CLASS_ZH_MAP[raw];
        }
        return null;
    }

    function blueprintArmorClassLabel(item) {
        if (!isPersonalArmorNavType(item && item.nav_type)) return null;
        return resolveBlueprintArmorClass(item);
    }

    function appendBlueprintArmorClassPart(parts, item) {
        var label = blueprintArmorClassLabel(item);
        if (label) parts.push(label);
        return label;
    }

    function fetchArmorClassLabelByComponentId(cid) {
        var id = String(cid || '').trim();
        if (!id) return Promise.resolve(null);
        if (ARMOR_CLASS_FETCH_CACHE[id]) return ARMOR_CLASS_FETCH_CACHE[id];
        var wiki = window.ShipComponentWiki;
        ARMOR_CLASS_FETCH_CACHE[id] = fetchJson('/api/sc/components/' + encodeURIComponent(id))
            .then(function (data) {
                var item = data && data.item;
                if (!item || !wiki || !wiki.formatArmorClassLabel) return null;
                return wiki.formatArmorClassLabel(item);
            })
            .catch(function () {
                return null;
            });
        return ARMOR_CLASS_FETCH_CACHE[id];
    }

    function applyArmorClassLabelToItems(label, componentId) {
        if (!label || !componentId) return false;
        var changed = false;
        state.items.forEach(function (item) {
            if (String(item.component_id || '').trim() !== componentId) return;
            if (!isPersonalArmorNavType(item.nav_type)) return;
            if (item.armor_class_zh === label) return;
            item.armor_class_zh = label;
            changed = true;
        });
        return changed;
    }

    function enrichArmorClassForListItems() {
        if (!state.items || !state.items.length) return Promise.resolve();
        var pendingIds = [];
        var seen = Object.create(null);
        state.items.forEach(function (item) {
            if (!isPersonalArmorNavType(item.nav_type)) return;
            if (blueprintArmorClassLabel(item)) return;
            var cid = String(item.component_id || '').trim();
            if (!cid || seen[cid]) return;
            seen[cid] = true;
            pendingIds.push(cid);
        });
        if (!pendingIds.length) return Promise.resolve();
        var token = ++armorClassEnrichToken;
        var chain = Promise.resolve();
        for (var i = 0; i < pendingIds.length; i += 8) {
            (function (chunk) {
                chain = chain.then(function () {
                    if (token !== armorClassEnrichToken) return;
                    return Promise.all(
                        chunk.map(function (cid) {
                            return fetchArmorClassLabelByComponentId(cid).then(function (label) {
                                return { cid: cid, label: label };
                            });
                        })
                    ).then(function (rows) {
                        if (token !== armorClassEnrichToken) return;
                        var changed = false;
                        rows.forEach(function (row) {
                            if (applyArmorClassLabelToItems(row.label, row.cid)) changed = true;
                        });
                        if (changed) {
                            var cacheKey = listCacheKey();
                            if (LIST_CACHE[cacheKey]) {
                                LIST_CACHE[cacheKey] = {
                                    items: state.items.slice(),
                                    total: state.total,
                                };
                            }
                            renderBlueprintList();
                        }
                    });
                });
            })(pendingIds.slice(i, i + 8));
        }
        return chain;
    }

    function refreshBlueprintArmorClassDisplay(bp) {
        if (!bp) return;
        if (el.outputSub) {
            el.outputSub.textContent = blueprintOutputSubParts(bp).join(' · ') || '—';
        }
        renderOutputTags(bp);
        renderArmorClassStatRow(bp);
        updateBlueprintListItemUsage(bp);
    }

    function renderArmorClassStatRow(bp) {
        if (!el.simStats || !isPersonalArmorNavType(bp && bp.nav_type)) return;
        var label = blueprintArmorClassLabel(bp);
        var existing = el.simStats.querySelector('.bp-sim-stat--armor-class');
        if (!label) {
            if (existing) existing.remove();
            return;
        }
        if (existing) {
            var valueEl = existing.querySelector('.bp-sim-stat-value');
            if (valueEl) valueEl.textContent = label;
            return;
        }
        var li = document.createElement('li');
        li.className = 'bp-sim-stat bp-sim-stat--static bp-sim-stat--armor-class';
        li.innerHTML =
            '<span class="bp-sim-stat-label">护甲等级</span><span class="bp-sim-stat-value">' +
            escapeHtml(label) +
            '</span>';
        el.simStats.insertBefore(li, el.simStats.firstChild);
    }

    function loadArmorMetaForBlueprint(bp) {
        if (!isPersonalArmorNavType(bp && bp.nav_type) || !bp.component_id) return Promise.resolve();
        if (blueprintArmorClassLabel(bp)) {
            refreshBlueprintArmorClassDisplay(bp);
            return Promise.resolve();
        }
        return fetchArmorClassLabelByComponentId(bp.component_id)
            .then(function (label) {
                if (!label) return;
                bp.armor_class_zh = label;
                if (state.blueprint && state.blueprint.uuid === bp.uuid) {
                    state.blueprint.armor_class_zh = label;
                }
                applyArmorClassLabelToItems(label, bp.component_id);
                syncBlueprintUsageToListItem(bp);
                refreshBlueprintArmorClassDisplay(bp);
            })
            .catch(function () {
                return null;
            });
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

    function componentImageUrl(componentId) {
        if (!componentId) return '';
        return absoluteAssetUrl('/api/sc/components/image/' + encodeURIComponent(componentId));
    }

    function isBpHeroImageStackedLayout() {
        return window.matchMedia('(max-width: 860px)').matches;
    }

    var currentBpImageLightboxSrc = '';
    var bpImageLoadSeq = 0;
    var bpImageActiveUrl = '';

    function setBpOutputImagePlaceholder(mode) {
        if (!el.outputImagePh) return;
        el.outputImagePh.hidden = false;
        el.outputImagePh.classList.toggle('is-loading', mode === 'loading');
        var label = el.outputImagePh.querySelector('span:last-child');
        if (label) label.textContent = mode === 'loading' ? '加载配图…' : '暂无配图';
    }

    function clearBpOutputImageDisplay() {
        bpImageLoadSeq += 1;
        bpImageActiveUrl = '';
        currentBpImageLightboxSrc = '';
        if (el.outputImage) {
            el.outputImage.onload = null;
            el.outputImage.onerror = null;
            el.outputImage.removeAttribute('src');
            el.outputImage.alt = '';
        }
        if (el.outputImageFrame) {
            el.outputImageFrame.hidden = true;
            el.outputImageFrame.style.width = '';
        }
        if (el.outputImageBtn) el.outputImageBtn.style.width = '';
    }

    function openBpImageLightbox() {
        if (!currentBpImageLightboxSrc) return;
        var lb = window.UssCommunityImageLightbox;
        if (lb && typeof lb.open === 'function') {
            lb.open(currentBpImageLightboxSrc);
            return;
        }
        window.open(currentBpImageLightboxSrc, '_blank', 'noopener,noreferrer');
    }

    function wireBpImageLightbox() {
        if (!el.outputImageBtn || el.outputImageBtn.dataset.wired === '1') return;
        el.outputImageBtn.dataset.wired = '1';
        el.outputImageBtn.addEventListener('click', openBpImageLightbox);
    }

    function syncBpHeroImageFrameSize() {
        if (!el.outputImageFrame || !el.outputImage) return;
        if (el.outputImageFrame.hidden || isBpHeroImageStackedLayout()) {
            el.outputImageFrame.style.width = '';
            if (el.outputImageBtn) el.outputImageBtn.style.width = '';
            return;
        }
        var nw = el.outputImage.naturalWidth;
        var nh = el.outputImage.naturalHeight;
        if (!nw || !nh) {
            el.outputImageFrame.style.width = '';
            if (el.outputImageBtn) el.outputImageBtn.style.width = '';
            return;
        }
        var frameH = parseFloat(getComputedStyle(el.outputImageFrame).height);
        if (!Number.isFinite(frameH) || frameH <= 0) {
            frameH = el.outputImageFrame.getBoundingClientRect().height;
        }
        if (!frameH) return;

        var width = Math.round((frameH * nw) / nh);
        var maxW = parseFloat(getComputedStyle(el.outputImageFrame).maxWidth);
        if (Number.isFinite(maxW) && maxW > 0 && width > maxW) {
            width = maxW;
        }
        var w = Math.max(1, width) + 'px';
        el.outputImageFrame.style.width = w;
        if (el.outputImageBtn) el.outputImageBtn.style.width = w;
    }

    var bpHeroImageResizeTimer = null;
    function scheduleBpHeroImageFrameSync() {
        if (bpHeroImageResizeTimer) window.clearTimeout(bpHeroImageResizeTimer);
        bpHeroImageResizeTimer = window.setTimeout(function () {
            bpHeroImageResizeTimer = null;
            syncBpHeroImageFrameSize();
        }, 80);
    }

    function wireBpHeroImageFrameSync() {
        if (window.__bpHeroImageFrameSyncWired) return;
        window.__bpHeroImageFrameSyncWired = true;
        window.addEventListener('resize', scheduleBpHeroImageFrameSync);
    }

    function showBpOutputImage() {
        if (el.outputImageFrame) el.outputImageFrame.hidden = false;
        if (el.outputImagePh) el.outputImagePh.hidden = true;
        syncBpHeroImageFrameSize();
    }

    function hideBpOutputImage() {
        clearBpOutputImageDisplay();
        setBpOutputImagePlaceholder('empty');
    }

    function renderOutputImage(bp) {
        if (!el.outputImage || !el.outputImagePh) return;
        wireBpHeroImageFrameSync();
        wireBpImageLightbox();
        var url = bp && bp.component_id ? componentImageUrl(bp.component_id) : '';
        var displayName = (bp && blueprintDisplayName(bp)) || '蓝图成品';

        if (
            url &&
            url === bpImageActiveUrl &&
            el.outputImage.src === url &&
            el.outputImage.complete &&
            el.outputImage.naturalWidth > 0 &&
            el.outputImageFrame &&
            !el.outputImageFrame.hidden
        ) {
            currentBpImageLightboxSrc = url;
            el.outputImage.alt = displayName;
            el.outputImagePh.hidden = true;
            el.outputImagePh.classList.remove('is-loading');
            return;
        }

        if (url && url === bpImageActiveUrl && el.outputImage.src === url) {
            currentBpImageLightboxSrc = url;
            el.outputImage.alt = displayName;
            if (el.outputImage.complete && el.outputImage.naturalWidth > 0) {
                el.outputImagePh.hidden = true;
                el.outputImagePh.classList.remove('is-loading');
                showBpOutputImage();
                syncBpHeroImageFrameSize();
            } else {
                setBpOutputImagePlaceholder('loading');
            }
            return;
        }

        var loadSeq = bpImageLoadSeq + 1;
        clearBpOutputImageDisplay();
        bpImageLoadSeq = loadSeq;

        if (!url) {
            setBpOutputImagePlaceholder('empty');
            return;
        }

        bpImageActiveUrl = url;
        currentBpImageLightboxSrc = url;
        setBpOutputImagePlaceholder('loading');
        el.outputImage.alt = displayName;
        el.outputImage.onload = function () {
            if (loadSeq !== bpImageLoadSeq) return;
            el.outputImagePh.hidden = true;
            el.outputImagePh.classList.remove('is-loading');
            showBpOutputImage();
            syncBpHeroImageFrameSize();
        };
        el.outputImage.onerror = function () {
            if (loadSeq !== bpImageLoadSeq) return;
            bpImageActiveUrl = '';
            el.outputImage.removeAttribute('src');
            setBpOutputImagePlaceholder('empty');
        };
        el.outputImage.src = url;
        if (el.outputImage.complete && el.outputImage.naturalWidth > 0) {
            if (loadSeq === bpImageLoadSeq) {
                el.outputImagePh.hidden = true;
                el.outputImagePh.classList.remove('is-loading');
                showBpOutputImage();
                syncBpHeroImageFrameSize();
            }
        }
    }

    function formatScuQty(value) {
        var f = window.ScDisplayFormat;
        if (f && f.formatDisplayScu) return f.formatDisplayScu(value);
        var n = Number(value);
        if (!Number.isFinite(n)) return '';
        return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SCU';
    }

    function defaultQuality() {
        return (state.meta && state.meta.quality && state.meta.quality.default) || 500;
    }

    function loadQualitiesForBlueprint(bp) {
        var stored = readStoredQualities();
        var bpStore = (stored && stored[bp.uuid]) || {};
        var out = {};
        (bp.ingredients || []).forEach(function (ing) {
            out[ing.key] = bpStore[ing.key] != null ? Number(bpStore[ing.key]) : defaultQuality();
        });
        state.qualities = out;
    }

    function persistQualities() {
        if (!state.blueprint) return;
        var stored = readStoredQualities();
        stored[state.blueprint.uuid] = Object.assign({}, state.qualities);
        writeStoredQualities(stored);
    }

    function normalizeBlueprintIngredients(bp) {
        if (!bp || !Array.isArray(bp.ingredients)) return;
        bp.ingredients.forEach(function (ing) {
            var zh = resolveRoleLabelZh(ing);
            if (zh) ing.role_label_zh = zh;
        });
    }

    function syncBlueprintUsageToListItem(bp) {
        if (!bp || !bp.uuid) return;
        var idx = -1;
        for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].uuid === bp.uuid) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return;
        state.items[idx] = Object.assign({}, state.items[idx], {
            class_zh: bp.class_zh || state.items[idx].class_zh,
            class_short_zh: bp.class_short_zh || state.items[idx].class_short_zh,
            armor_class_zh: bp.armor_class_zh || state.items[idx].armor_class_zh,
            grade_letter: bp.grade_letter || state.items[idx].grade_letter,
        });
        updateBlueprintListItemUsage(bp);
    }

    function getCachedBlueprintDetail(id) {
        return (id && BLUEPRINT_DETAIL_CACHE[id]) || null;
    }

    function cacheBlueprintDetail(bp) {
        if (!bp || !bp.uuid) return;
        BLUEPRINT_DETAIL_CACHE[bp.uuid] = bp;
        var keys = Object.keys(BLUEPRINT_DETAIL_CACHE);
        while (keys.length > BLUEPRINT_DETAIL_CACHE_MAX) {
            delete BLUEPRINT_DETAIL_CACHE[keys.shift()];
        }
    }

    function fetchBlueprintDetail(id) {
        return fetchJson('/api/sc/blueprints/' + encodeURIComponent(id)).then(function (data) {
            if (!data || !data.blueprint) return null;
            normalizeBlueprintIngredients(data.blueprint);
            cacheBlueprintDetail(data.blueprint);
            return data.blueprint;
        });
    }

    function prefetchBlueprintDetail(id) {
        if (!id || getCachedBlueprintDetail(id) || prefetchInFlight[id]) return;
        prefetchInFlight[id] = true;
        fetchBlueprintDetail(id)
            .catch(function () {
                /* ignore prefetch errors */
            })
            .finally(function () {
                delete prefetchInFlight[id];
            });
    }

    function scheduleBlueprintPrefetch(id) {
        if (!id || id === state.selectedId || getCachedBlueprintDetail(id)) return;
        if (state.prefetchTimer) clearTimeout(state.prefetchTimer);
        state.prefetchTimer = setTimeout(function () {
            state.prefetchTimer = null;
            prefetchBlueprintDetail(id);
        }, BLUEPRINT_PREFETCH_MS);
    }

    function prefetchAdjacentBlueprints(index) {
        if (index < 0) return;
        [-2, -1, 1, 2].forEach(function (offset) {
            var item = state.items[index + offset];
            if (item && item.uuid) prefetchBlueprintDetail(item.uuid);
        });
    }

    function applyBlueprintPreviewFromList(id) {
        var idx = blueprintIndexById(id);
        var item = idx >= 0 ? state.items[idx] : null;
        if (!item) return;
        if (el.outputName) el.outputName.textContent = blueprintDisplayName(item);
        if (el.outputSub) {
            el.outputSub.textContent = blueprintOutputSubParts(item).join(' · ') || '—';
        }
        if (el.missionCount) {
            var count =
                item.unlocking_missions_count != null ? Number(item.unlocking_missions_count) : 0;
            if (count > 0) {
                el.missionCount.textContent = String(count);
                el.missionCount.hidden = false;
            } else {
                el.missionCount.hidden = true;
            }
        }
        renderOutputImage(item);
    }

    function scheduleRenderMissions() {
        if (state.missionTimer) clearTimeout(state.missionTimer);
        state.missionTimer = setTimeout(function () {
            state.missionTimer = null;
            renderMissions();
        }, 16);
    }

    function applyBlueprintDetail(bp, options) {
        options = options || {};
        if (!bp || !bp.uuid) return;
        state.blueprint = bp;
        normalizeBlueprintIngredients(state.blueprint);
        syncBlueprintUsageToListItem(state.blueprint);
        cacheBlueprintDetail(state.blueprint);
        state.weaponItem = null;
        state.attachmentStats = null;
        state.lastSimData = null;
        loadQualitiesForBlueprint(state.blueprint);
        renderCraftPanel({ deferMissions: options.deferMissions !== false });
        if (isFpsWeaponBlueprint(state.blueprint)) {
            loadWeaponForBlueprint(state.blueprint);
        } else if (isPersonalArmorNavType(state.blueprint.nav_type)) {
            loadArmorMetaForBlueprint(state.blueprint);
            if (el.loadoutSlots) {
                el.loadoutSlots.hidden = true;
                el.loadoutSlots.innerHTML = '';
            }
        } else if (el.loadoutSlots) {
            el.loadoutSlots.hidden = true;
            el.loadoutSlots.innerHTML = '';
        }
        scheduleSimulateFast();
        prefetchAdjacentBlueprints(blueprintIndexById(bp.uuid));
    }

    function selectBlueprint(id) {
        if (!id) {
            state.selectedId = null;
            state.blueprint = null;
            state.weaponItem = null;
            state.attachmentStats = null;
            state.lastSimData = null;
            if (el.craftEmpty) el.craftEmpty.classList.remove('is-hidden');
            if (el.craftDetail) el.craftDetail.classList.add('is-hidden');
            setBlueprintListActive(null);
            renderOutputImage(null);
            if (el.missions) {
                el.missions.innerHTML = '<p class="bp-mission-empty">选择蓝图后显示解锁任务</p>';
            }
            if (el.missionCount) el.missionCount.hidden = true;
            if (el.missionsBar) el.missionsBar.classList.add('is-hidden');
            pushUrlState();
            return;
        }

        if (id === state.selectedId && state.blueprint && state.blueprint.uuid === id) {
            setBlueprintListActive(id);
            return;
        }

        state.selectedId = id;
        pushUrlState();
        setBlueprintListActive(id);
        if (el.craftEmpty) el.craftEmpty.classList.add('is-hidden');
        if (el.missionsBar) el.missionsBar.classList.remove('is-hidden');
        if (el.craftDetail) {
            el.craftDetail.classList.remove('is-hidden');
        }

        var cached = getCachedBlueprintDetail(id);
        if (cached) {
            if (el.craftDetail) el.craftDetail.classList.remove('is-loading');
            applyBlueprintDetail(cached, { deferMissions: true });
            return;
        }

        applyBlueprintPreviewFromList(id);
        if (el.craftDetail) el.craftDetail.classList.add('is-loading');

        var seq = ++state.selectBlueprintSeq;
        fetchBlueprintDetail(id)
            .then(function (bp) {
                if (seq !== state.selectBlueprintSeq || !bp) return;
                applyBlueprintDetail(bp, { deferMissions: true });
            })
            .catch(function (err) {
                if (seq !== state.selectBlueprintSeq) return;
                showGate(err.message || '蓝图详情加载失败');
            })
            .finally(function () {
                if (seq !== state.selectBlueprintSeq) return;
                if (el.craftDetail) el.craftDetail.classList.remove('is-loading');
                if (state.consumeListRestore) {
                    state.consumeListRestore = false;
                    finishBlueprintListRestore();
                }
            });
    }

    var missionMountSeq = 0;

    function blueprintMissionItem(bp) {
        if (!bp) return null;
        return {
            id_item: bp.component_id || bp.output_item_uuid,
            uuid: bp.output_item_uuid,
            type: bp.nav_type,
            blueprint_uuid: bp.uuid,
            unlocking_missions_count: bp.unlocking_missions_count || 0,
            unlocking_missions: bp.unlocking_missions || null,
            use_component_missions: false,
        };
    }

    function missionUuidFromUrl(url) {
        var match = String(url || '').match(/\/missions\/([^/?#]+)/i);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function flattenUnlockingMissionsFromBlueprint(bp) {
        var groups = (bp && bp.unlocking_missions) || [];
        var out = [];
        groups.forEach(function (group) {
            (group.missions || []).forEach(function (m) {
                var title = m.title || m.debug_name || '未命名任务';
                out.push({
                    title_en: title,
                    title_zh: title,
                    uuid: m.uuid || missionUuidFromUrl(m.web_url) || null,
                    debug_name: m.debug_name || null,
                    web_url: m.web_url || null,
                    chance: m.chance != null ? m.chance : null,
                    reward_scope: m.reward_scope || null,
                    mission_type: m.mission_type || null,
                    mission_type_zh: m.mission_type_zh || null,
                    mission_giver: m.mission_giver || null,
                    mission_giver_zh: m.mission_giver_zh || null,
                    legality_label: m.legality_label || null,
                    illegal: m.illegal === true,
                    legality_zh: m.legality_zh || null,
                    reward_auec_label: m.reward_auec_label || null,
                    reward_min: m.reward_min != null ? m.reward_min : null,
                });
            });
        });
        return out;
    }

    function renderMissionListFallback(bp) {
        if (!el.missions || !window.ShipComponentBlueprints) return false;
        var flat = flattenUnlockingMissionsFromBlueprint(bp);
        if (!flat.length) return false;
        var item = blueprintMissionItem(bp);
        if (window.ShipComponentBlueprints.rememberMissionsOnPanel) {
            window.ShipComponentBlueprints.rememberMissionsOnPanel(el.missions, item, flat);
        }
        el.missions.innerHTML = window.ShipComponentBlueprints.renderMissionListHtml(flat, '');
        if (window.ShipComponentBlueprints.wirePanel) {
            window.ShipComponentBlueprints.wirePanel(el.missions);
        }
        return true;
    }

    function renderMissions() {
        if (!el.missions) return;
        var bp = state.blueprint;
        var count = bp && bp.unlocking_missions_count != null ? Number(bp.unlocking_missions_count) : 0;
        if (el.missionCount) {
            if (count > 0) {
                el.missionCount.textContent = String(count);
                el.missionCount.hidden = false;
            } else {
                el.missionCount.hidden = true;
            }
        }
        if (!bp) {
            el.missions.innerHTML = '<p class="bp-mission-empty">选择蓝图后显示解锁任务</p>';
            return;
        }
        if (bp.is_available_by_default) {
            el.missions.innerHTML = '<p class="bp-mission-empty">默认可制造，无需解锁任务</p>';
            return;
        }
        if (!count) {
            el.missions.innerHTML = '<p class="bp-mission-empty">无解锁任务要求</p>';
            return;
        }
        if (!window.ShipComponentBlueprints) {
            el.missions.innerHTML = '<p class="bp-mission-empty">任务模块加载中…</p>';
            return;
        }

        var seq = ++missionMountSeq;
        el.missions.dataset.navGroup = bp.nav_group || 'component';
        el.missions.dataset.navType = bp.nav_type || '';

        window.ShipComponentBlueprints.mount(el.missions, blueprintMissionItem(bp), {
            hideCraftBanner: true,
        }).then(function () {
            if (seq !== missionMountSeq) return;
            if (el.missions.querySelector('.sc-acquire-empty') && renderMissionListFallback(bp)) {
                return;
            }
        });
    }

    function renderOutputTags(bp) {
        if (!el.outputTags) return;
        el.outputTags.innerHTML = '';
        if (!bp) return;
        var tags = [];
        var armorClass = blueprintArmorClassLabel(bp);
        if (armorClass) tags.push({ text: armorClass, title: '护甲等级', kind: 'armor-class' });
        var usageGrade = formatUsageGrade(bp);
        if (usageGrade) tags.push({ text: usageGrade, title: '用途与等级', kind: 'usage' });
        if (!isPersonalArmorNavType(bp.nav_type) && bp.size != null && bp.size !== '') {
            tags.push({ text: 'S' + bp.size, title: '尺寸（Size）' });
        }
        if (bp.craft_time_seconds) tags.push({ text: formatCraftTime(bp.craft_time_seconds), title: '制造耗时' });
        if (bp.is_available_by_default) tags.push({ text: '默认可造', kind: 'default', title: '无需任务即可制造' });
        else if (bp.unlocking_missions_count) {
            tags.push({ text: '任务解锁 ×' + bp.unlocking_missions_count, warn: true, title: '需完成任务解锁' });
        }
        tags.forEach(function (tag) {
            var span = document.createElement('span');
            span.className =
                'bp-tag' +
                (tag.warn ? ' bp-tag--warn' : '') +
                (tag.kind === 'default' ? ' bp-tag--default' : '') +
                (tag.kind === 'usage' ? ' bp-tag--usage' : '') +
                (tag.kind === 'armor-class' ? ' bp-tag--armor-class' : '');
            span.textContent = tag.text;
            if (tag.title) span.title = tag.title;
            el.outputTags.appendChild(span);
        });
    }

    function isFpsWeaponBlueprint(bp) {
        return !!(bp && bp.nav_group === 'fps_weapon' && bp.nav_type && bp.nav_type.indexOf('weapon_') === 0);
    }

    function loadWeaponForBlueprint(bp) {
        if (!isFpsWeaponBlueprint(bp) || !bp.component_id) {
            state.weaponItem = null;
            renderWeaponLoadout(null);
            return Promise.resolve();
        }
        return fetchJson('/api/sc/components/' + encodeURIComponent(bp.component_id))
            .then(function (data) {
                state.weaponItem = data && data.item ? data.item : null;
                renderWeaponLoadout(state.weaponItem);
            })
            .catch(function () {
                state.weaponItem = null;
                renderWeaponLoadout(null);
            });
    }

    function renderWeaponLoadout(weaponItem) {
        var wl = window.ShipComponentWeaponLoadout;
        if (!wl || !weaponItem || !wl.isWeaponLoadoutEligible(weaponItem)) {
            if (el.loadoutSlots) {
                el.loadoutSlots.hidden = true;
                el.loadoutSlots.innerHTML = '';
            }
            state.attachmentStats = null;
            return;
        }
        wl.setOnChange(function () {
            if (wl.refreshDetailPanel && el.loadoutSlots && !el.loadoutSlots.hidden) {
                wl.refreshDetailPanel(state.weaponItem, el.loadoutSlots);
            }
            refreshAttachmentStats().then(function () {
                if (state.lastSimData) renderSimResult(state.lastSimData);
            });
        });
        if (el.loadoutSlots && typeof wl.renderDetailPanel === 'function') {
            wl.renderDetailPanel(weaponItem, el.loadoutSlots, {
                compact: true,
                hideCompactHeader: true,
                openAnchor: el.loadoutSlots,
            });
        } else if (el.loadoutSlots) {
            el.loadoutSlots.hidden = true;
            el.loadoutSlots.innerHTML = '';
        }
        refreshAttachmentStats();
    }

    function refreshAttachmentStats() {
        var wl = window.ShipComponentWeaponLoadout;
        if (!wl || !state.weaponItem) {
            state.attachmentStats = null;
            return Promise.resolve();
        }
        var resolver = wl.resolveEquippedItems;
        if (typeof resolver !== 'function') {
            state.attachmentStats = wl.computeAdjustedStatsSync(state.weaponItem);
            return Promise.resolve();
        }
        return Promise.resolve(resolver(state.weaponItem)).then(function () {
            state.attachmentStats = wl.computeAdjustedStatsSync(state.weaponItem);
        });
    }

    function clampQuality(val) {
        var n = Math.round(Number(val));
        if (!Number.isFinite(n)) n = defaultQuality();
        return Math.max(0, Math.min(1000, n));
    }

    function schedulePersistQualities() {
        if (state.persistTimer) clearTimeout(state.persistTimer);
        state.persistTimer = setTimeout(function () {
            state.persistTimer = null;
            persistQualities();
        }, PERSIST_DEBOUNCE_MS);
    }

    function scheduleMaterialModifierRefresh(ing, row) {
        state.matModPending = { ing: ing, row: row };
        if (state.matModTimer) clearTimeout(state.matModTimer);
        state.matModTimer = setTimeout(function () {
            state.matModTimer = null;
            var pending = state.matModPending;
            state.matModPending = null;
            if (!pending || !pending.row || !pending.ing) return;
            var v =
                state.qualities[pending.ing.key] != null
                    ? state.qualities[pending.ing.key]
                    : defaultQuality();
            var modsEl = pending.row.querySelector('[data-mat-mods]');
            renderMaterialModifiers(modsEl, pending.ing, v);
            schedulePersistQualities();
        }, MAT_MOD_DEBOUNCE_MS);
    }

    function findBlueprintIngredient(key) {
        if (!state.blueprint || !key) return null;
        var ingredients = state.blueprint.ingredients || [];
        for (var i = 0; i < ingredients.length; i++) {
            if (ingredients[i].key === key) return ingredients[i];
        }
        return null;
    }

    function resolveMaterialRowContext(target) {
        if (!target || !target.closest) return null;
        var row = target.closest('.bp-mat');
        if (!row) return null;
        var ing = findBlueprintIngredient(row.dataset.ingKey);
        if (!ing) return null;
        return { row: row, ing: ing };
    }

    function wireMaterialsPanel() {
        if (!el.materials || el.materials.dataset.wired === '1') return;
        el.materials.dataset.wired = '1';
        el.materials.addEventListener('pointerdown', function (ev) {
            if (!ev.target.classList.contains('bp-mat__range')) return;
            var ctx = resolveMaterialRowContext(ev.target);
            if (ctx) ctx.row.classList.add('is-sliding');
        });
        el.materials.addEventListener('pointerup', function (ev) {
            if (!ev.target.classList.contains('bp-mat__range')) return;
            var ctx = resolveMaterialRowContext(ev.target);
            if (!ctx) return;
            ctx.row.classList.remove('is-sliding');
            applyMaterialQuality(ctx.ing, ctx.row, ev.target.value);
        });
        el.materials.addEventListener('pointercancel', function (ev) {
            if (!ev.target.classList.contains('bp-mat__range')) return;
            var row = ev.target.closest('.bp-mat');
            if (row) row.classList.remove('is-sliding');
        });
        el.materials.addEventListener('input', function (ev) {
            var ctx = resolveMaterialRowContext(ev.target);
            if (!ctx) return;
            if (
                ev.target.classList.contains('bp-mat__range') ||
                ev.target.classList.contains('bp-mat__input')
            ) {
                applyMaterialQuality(ctx.ing, ctx.row, ev.target.value, { light: true });
            }
        });
        el.materials.addEventListener('change', function (ev) {
            if (!ev.target.classList.contains('bp-mat__input')) return;
            var ctx = resolveMaterialRowContext(ev.target);
            if (!ctx) return;
            applyMaterialQuality(ctx.ing, ctx.row, ev.target.value);
        });
        el.materials.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' || !ev.target.classList.contains('bp-mat__input')) return;
            ev.preventDefault();
            ev.target.blur();
        });
    }

    function applyMaterialQuality(ing, row, val, opts) {
        opts = opts || {};
        var v = clampQuality(val);
        state.qualities[ing.key] = v;
        var slider = row.querySelector('.bp-mat__range');
        var input = row.querySelector('.bp-mat__input');
        var fill = row.querySelector('.bp-mat__fill');
        if (slider && slider.value !== String(v)) slider.value = String(v);
        if (input && document.activeElement !== input && input.value !== String(v)) {
            input.value = String(v);
        }
        if (fill) {
            fill.style.width = Math.max(0, Math.min(100, v / 10)) + '%';
            fill.style.background =
                'linear-gradient(90deg, rgba(0,240,255,0.3), ' + qualityColor(v) + ')';
        }
        if (opts.light) {
            scheduleMaterialModifierRefresh(ing, row);
            scheduleSimulateFast();
            return;
        }
        var modsEl = row.querySelector('[data-mat-mods]');
        renderMaterialModifiers(modsEl, ing, v);
        schedulePersistQualities();
        scheduleSimulate();
    }

    function renderCraftPanel(options) {
        options = options || {};
        var bp = state.blueprint;
        if (!bp) return;
        if (el.outputName) el.outputName.textContent = blueprintDisplayName(bp);
        if (el.outputSub) {
            el.outputSub.textContent = blueprintOutputSubParts(bp).join(' · ') || '—';
        }
        renderOutputTags(bp);
        var fpsWeaponBp = isFpsWeaponBlueprint(bp);
        if (el.componentLink) {
            if (bp.component_id) {
                el.componentLink.href = buildComponentDetailHref(bp);
                el.componentLink.textContent = fpsWeaponBp ? '配件详情 ↗' : '详情 ↗';
                if (el.componentLink.dataset.bpReturnBound !== '1') {
                    el.componentLink.dataset.bpReturnBound = '1';
                    el.componentLink.addEventListener('mousedown', stashBlueprintCraftReturnState);
                    el.componentLink.addEventListener('click', stashBlueprintCraftReturnState);
                }
                el.componentLink.hidden = false;
            } else {
                el.componentLink.hidden = true;
            }
        }
        renderOutputImage(bp);
        if (options.deferMissions) {
            scheduleRenderMissions();
        } else {
            renderMissions();
        }
        renderMaterials();
        if (!fpsWeaponBp && el.loadoutSlots) {
            el.loadoutSlots.hidden = true;
            el.loadoutSlots.innerHTML = '';
        }
        if (el.attachStatSection) el.attachStatSection.hidden = true;
        if (el.attachStats) el.attachStats.innerHTML = '';
        if (el.statHint) {
            el.statHint.textContent = fpsWeaponBp
                ? '含材料品质与配件加成'
                : isPersonalArmorNavType(bp.nav_type)
                  ? '基准 × 材料品质；不含详情页物理/能量减伤%'
                  : '基准 × 材料品质后的数值';
        }
        if (el.simSummary) {
            el.simSummary.classList.add('is-empty');
            el.simSummary.innerHTML = '<span>调整材料品质以预览输出</span>';
        }
        if (el.simStats) el.simStats.innerHTML = '';
        if (el.simWarnings) el.simWarnings.hidden = true;
        if (el.simNote) el.simNote.textContent = '';
        renderArmorClassStatRow(bp);
    }

    function qualityColor(score) {
        var s = Number(score) || 0;
        if (s >= 800) return 'var(--bp-green)';
        if (s >= 500) return 'var(--bp-accent)';
        if (s >= 250) return 'var(--bp-amber)';
        return 'var(--bp-red)';
    }

    function roundCraftNumber(value) {
        var n = Number(value);
        if (!Number.isFinite(n)) return null;
        return Math.round(n * 100) / 100;
    }

    function formatCraftPct(value) {
        var n = roundCraftNumber(value);
        if (n == null) return '';
        if (Math.abs(n) < 0.005) return '';
        return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
    }

    /** 与 sc-database/config/blueprint-crafting-config.json 中 modifier_* 映射一致 */
    var MODIFIER_STAT_KEYS = {
        weapon_damage: ['damage_per_shot'],
        weapon_firerate: ['rpm'],
        weapon_range: ['range', 'effective_range'],
        weapon_magazine_size: ['magazine_size', 'capacity'],
        health_maxhealth: ['max_health'],
        itemresource_coolantgeneration: ['coolant_segment_generation', 'cooling_rate'],
        itemresource_powergeneration: ['power_segment_generation'],
        shield_maxshieldhealth: ['max_health'],
        shield_maxhealth: ['max_health'],
        shield_shieldregen: ['regen_rate', 'max_shield_regen'],
        quantum_quantumspeed: ['quantum_speed', 'drive_speed'],
        quantum_speed: ['quantum_speed', 'drive_speed'],
        quantum_fuelrequirement: ['quantum_fuel_requirement'],
        radar_maxaimassistdistance: ['max_aim_assist_distance'],
        radar_minaimassistdistance: ['min_aim_assist_distance'],
        armor_damagemitigation: ['gforce_resistance'],
        armor_temperaturemax: ['temp_resistance_max'],
        armor_temperaturemin: ['temp_resistance_min'],
        weapon_hullscraping_efficiency: ['efficiency'],
        weapon_hullscraping_radius: ['radius'],
        weapon_hullscraping_speed: ['speed'],
        weapon_recoil_smoothness: ['weapon_recoil_smoothness'],
        weapon_recoil_handling: ['weapon_recoil_handling'],
        weapon_recoil_kick: ['weapon_recoil_kick'],
    };

    var MODIFIER_LABEL_STAT_KEYS = {
        'Impact Force': ['damage_per_shot'],
        'Fire Rate': ['rpm'],
        Range: ['range', 'effective_range'],
        Damage: ['damage_per_shot'],
        'Weapon Damage': ['damage_per_shot'],
        Integrity: ['max_health'],
        'Max Health': ['max_health'],
        Durability: ['max_health'],
        'Coolant Rating': ['coolant_segment_generation', 'cooling_rate'],
        'Power Generation': ['power_segment_generation'],
        Efficiency: ['efficiency'],
        Radius: ['radius'],
        Speed: ['speed'],
        'Recoil Smoothness': ['weapon_recoil_smoothness'],
        'Recoil Handling': ['weapon_recoil_handling'],
        'Recoil Kick': ['weapon_recoil_kick'],
        'Quantum Speed': ['quantum_speed', 'drive_speed'],
        'Quantum Fuel Burn': ['quantum_fuel_requirement'],
        'Max. Shield Strength': ['max_health'],
        'Damage Mitigation': ['gforce_resistance'],
        'Max Temp': ['temp_resistance_max'],
        'Min Temp': ['temp_resistance_min'],
    };

    var STAT_KEY_LABEL_ZH = {
        damage_per_shot: '单发伤害',
        rpm: '射速',
        range: '射程',
        effective_range: '有效射程',
        magazine_size: '弹匣容量',
        max_health: '组件耐久',
        weapon_recoil_smoothness: '后坐力平滑度',
        weapon_recoil_handling: '后坐力控制',
        weapon_recoil_kick: '枪口上跳',
        quantum_speed: '量子速度',
        drive_speed: '量子速度',
        quantum_fuel_requirement: '量子燃料消耗',
        gforce_resistance: '抗 G 值',
        temp_resistance_max: '耐温上限',
        temp_resistance_min: '耐温下限',
        efficiency: '提取效率',
        radius: '作用半径',
        speed: '提取速度',
        coolant_segment_generation: '冷却效率',
        cooling_rate: '冷却效率',
        throttle: '采矿功率',
        power_segment_generation: '能量点',
        regen_rate: '回复速率',
        max_shield_regen: '回复速率',
    };

    var STAT_KEY_UNIT = {
        temp_resistance_min: '°C',
        temp_resistance_max: '°C',
        range: 'm',
        effective_range: 'm',
        quantum_speed: 'm/s',
        drive_speed: 'm/s',
        speed: 'm/s',
    };

    function resolveCraftStatUnit(st) {
        if (st && st.unit) return String(st.unit).trim();
        if (st && st.key && STAT_KEY_UNIT[st.key]) return STAT_KEY_UNIT[st.key];
        return '';
    }

    function isGforceResistanceStat(statKey) {
        return canonicalSimStatKey(statKey) === 'gforce_resistance';
    }

    /** 抗 G 系数越高越好：负值时 +10% 材料应减小惩罚幅度；不在此处四舍五入，留待百分比展示 */
    function applySimStatModifier(base, mult, add, statKey) {
        var b = Number(base);
        var m = mult != null ? mult : 1;
        var a = add != null ? add : 0;
        if (!Number.isFinite(b)) return null;
        if (isGforceResistanceStat(statKey)) {
            return b + Math.abs(b) * (m - 1) + a;
        }
        return roundCraftNumber(b * m + a);
    }

    function formatFixedDecimal2(n) {
        var f = window.ScDisplayFormat;
        if (f && f.formatFixedDecimal2) return f.formatFixedDecimal2(n);
        var w = window.ShipComponentWiki;
        if (w && w.formatFixedDecimal2) return w.formatFixedDecimal2(n);
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    /** 系数×100，固定两位小数 + % */
    function formatGforcePctDisplay(val) {
        var w = window.ShipComponentWiki;
        if (w && w.formatGforceSignedDisplay) {
            var hit = w.formatGforceSignedDisplay(val);
            return hit || '—';
        }
        var n = Number(val);
        if (!Number.isFinite(n)) return '—';
        return formatFixedDecimal2(n * 100) + '%';
    }

    function formatCraftStatNumberForStat(value, statKey) {
        if (isGforceResistanceStat(statKey)) return formatGforcePctDisplay(value);
        return formatSimStatNumber(value);
    }

    var MODIFIER_LABEL_ZH_STAT_KEYS = {
        武器伤害: ['damage_per_shot'],
        射速: ['rpm'],
        射程: ['range', 'effective_range'],
        后坐力平滑度: ['weapon_recoil_smoothness'],
        后坐力控制: ['weapon_recoil_handling'],
        枪口上跳: ['weapon_recoil_kick'],
        组件耐久: ['max_health'],
        结构完整性: ['max_health'],
        最大护盾强度: ['max_health'],
        冷却效率: ['coolant_segment_generation', 'cooling_rate'],
        能量点: ['power_segment_generation'],
        量子速度: ['quantum_speed', 'drive_speed'],
        量子燃料消耗: ['quantum_fuel_requirement'],
        '抗 G 值': ['gforce_resistance'],
        伤害减免: ['gforce_resistance'],
        耐温上限: ['temp_resistance_max'],
        耐温下限: ['temp_resistance_min'],
        提取效率: ['efficiency'],
        作用半径: ['radius'],
        提取速度: ['speed'],
        采矿功率: ['throttle'],
    };

    function canonicalSimStatKey(statKey) {
        var k = String(statKey || '').trim();
        if (k === 'rof') return 'rpm';
        if (k === 'drive_speed') return 'quantum_speed';
        if (k === 'cooling_rate') return 'coolant_segment_generation';
        if (k === 'max_shield_regen') return 'regen_rate';
        return k;
    }

    function craftingMetaMaps() {
        var crafting = (state.meta && state.meta.crafting) || {};
        return {
            byNavType: crafting.modifier_stat_keys_by_nav_type || {},
            propMap: crafting.modifier_stat_keys || MODIFIER_STAT_KEYS,
            labelMap: crafting.modifier_label_stat_keys || MODIFIER_LABEL_STAT_KEYS,
        };
    }

    function resolveModifierStatKeys(mod, navType) {
        var type = String(navType || '').trim();
        var maps = craftingMetaMaps();
        var typeMap = type && maps.byNavType[type] ? maps.byNavType[type] : null;
        var propMap = maps.propMap;
        var labelMap = maps.labelMap;
        var keys = [];
        var pk = String((mod && mod.property_key) || '').trim();
        var label = String((mod && mod.label) || '').trim();
        var labelZh = normalizeBlueprintStatLabelZh((mod && mod.label_zh) || '');
        var typeOverride = false;

        if (pk && typeMap && Array.isArray(typeMap[pk])) {
            keys = keys.concat(typeMap[pk]);
            typeOverride = true;
        }
        if (label && typeMap && Array.isArray(typeMap[label])) {
            keys = keys.concat(typeMap[label]);
            typeOverride = true;
        }
        if (!typeOverride && type === 'mining_laser' && pk === 'weapon_damage') {
            keys = keys.concat(['throttle']);
            typeOverride = true;
        }
        if (!typeOverride) {
            if (pk && propMap[pk]) keys = keys.concat(propMap[pk]);
            if (label && labelMap[label]) keys = keys.concat(labelMap[label]);
            if (labelZh && MODIFIER_LABEL_ZH_STAT_KEYS[labelZh]) {
                keys = keys.concat(MODIFIER_LABEL_ZH_STAT_KEYS[labelZh]);
            }
        }
        if (!keys.length && pk) keys.push(pk);
        var seen = {};
        return keys
            .map(canonicalSimStatKey)
            .filter(function (k) {
                if (!k || seen[k]) return false;
                seen[k] = true;
                return true;
            });
    }

    function collectMaterialStatAdjustments(ingredients, qualities, navType) {
        var multDeltas = {};
        var adds = {};
        var defaultQ = defaultQuality();
        (ingredients || []).forEach(function (ing) {
            var q =
                qualities[ing.key] != null
                    ? Math.max(0, Math.min(1000, Number(qualities[ing.key]) || 0))
                    : defaultQ;
            var baseline =
                ing.initial_quality != null
                    ? Math.max(0, Math.min(1000, Number(ing.initial_quality) || 0))
                    : defaultQ;
            (ing.stat_modifiers || []).forEach(function (mod) {
                var statKeys = resolveModifierStatKeys(mod, navType);
                if (!statKeys.length) return;
                var effect = modifierAtQuality(mod, q, baseline);
                var applied = {};
                statKeys.forEach(function (sk) {
                    var canon = canonicalSimStatKey(sk);
                    if (applied[canon]) return;
                    applied[canon] = true;
                    if (effect.kind === 'additive') {
                        adds[canon] = (adds[canon] || 0) + (Number(effect.value) || 0);
                    } else {
                        var mult = Number(effect.value) || 1;
                        multDeltas[canon] = (multDeltas[canon] || 0) + (mult - 1);
                    }
                });
            });
        });
        var mults = {};
        Object.keys(multDeltas).forEach(function (k) {
            mults[k] = 1 + multDeltas[k];
        });
        return { mults: mults, adds: adds };
    }

    function rebuildStatsFromMaterials(stats, ingredients, qualities) {
        var adj = collectMaterialStatAdjustments(ingredients, qualities);
        if (!Object.keys(adj.mults).length && !Object.keys(adj.adds).length) return stats;
        return (stats || []).map(function (st) {
            var key = canonicalSimStatKey(st.key);
            var mult = adj.mults[key] != null ? adj.mults[key] : 1;
            var add = adj.adds[key] != null ? adj.adds[key] : 0;
            if (Math.abs(mult - 1) < 0.000001 && add === 0) return st;
            var base =
                st.base != null && Number.isFinite(Number(st.base)) ? Number(st.base) : null;
            var gainPct = roundCraftNumber((mult - 1) * 100);
            var final = null;
            var modifierOnly = false;
            if (base != null) final = applySimStatModifier(base, mult, add, key);
            else if (add !== 0) final = roundCraftNumber(add);
            else if (Math.abs(mult - 1) > 0.000001) modifierOnly = true;
            var deltaPct =
                base != null && base !== 0 && final != null
                    ? isGforceResistanceStat(key)
                        ? roundCraftNumber(((final - base) / Math.abs(base)) * 100)
                        : roundCraftNumber(((final - base) / base) * 100)
                    : gainPct;
            var gainValue =
                base != null && final != null
                    ? roundCraftNumber(final - base)
                    : add !== 0
                      ? roundCraftNumber(add)
                      : null;
            return Object.assign({}, st, {
                multiplier: roundCraftNumber(mult),
                gain_pct: gainPct,
                delta_pct: deltaPct,
                final: final,
                gain_value: gainValue,
                modifiable: Math.abs(mult - 1) > 0.000001 || add !== 0,
                modifier_only: modifierOnly,
            });
        });
    }

    function buildSimStatEntryClient(opts) {
        var key = opts.key;
        var label_zh = normalizeBlueprintStatLabelZh(opts.label_zh || key);
        var unit = opts.unit || STAT_KEY_UNIT[key] || '';
        var base =
            opts.base != null && Number.isFinite(Number(opts.base)) ? Number(opts.base) : null;
        var mult = opts.mult != null ? opts.mult : 1;
        var add = opts.add != null ? opts.add : 0;
        var gainPct = roundCraftNumber((mult - 1) * 100);
        var modifiable = Math.abs(mult - 1) > 0.000001 || add !== 0;
        var final = null;
        var modifierOnly = false;
        if (base != null) final = applySimStatModifier(base, mult, add, key);
        else if (add !== 0) final = roundCraftNumber(add);
        else if (Math.abs(mult - 1) > 0.000001) modifierOnly = true;
        var deltaPct =
            base != null && base !== 0 && final != null
                ? isGforceResistanceStat(key)
                    ? roundCraftNumber(((final - base) / Math.abs(base)) * 100)
                    : roundCraftNumber(((final - base) / base) * 100)
                : gainPct;
        var gainValue =
            base != null && final != null
                ? roundCraftNumber(final - base)
                : add !== 0
                  ? roundCraftNumber(add)
                  : null;
        return {
            key: key,
            label_zh: label_zh,
            unit: unit,
            base: base,
            final: final,
            delta_pct: deltaPct,
            gain_pct: gainPct,
            gain_value: gainValue,
            multiplier: roundCraftNumber(mult),
            modifiable: modifiable,
            modifier_only: modifierOnly,
        };
    }

    function computeMaterialScoreClient(ingredients, qualities) {
        var qmap = qualities && typeof qualities === 'object' ? qualities : {};
        var totalWeight = 0;
        var weightedSum = 0;
        var defaultQ = defaultQuality();
        (ingredients || []).forEach(function (ing) {
            var weight =
                ing.kind === 'resource'
                    ? Number(ing.quantity_scu) || 0
                    : Number(ing.quantity) || 0;
            if (weight <= 0) return;
            var key = ing.key;
            var qRaw = qmap[key];
            var q = qRaw != null ? clampQuality(qRaw) : defaultQ;
            totalWeight += weight;
            weightedSum += q * weight;
        });
        if (totalWeight <= 0) return defaultQ;
        return clampQuality(weightedSum / totalWeight);
    }

    function qualityTierClient(score) {
        var tiers = (state.meta && state.meta.quality && state.meta.quality.tiers) || [];
        var s = clampQuality(score);
        for (var i = 0; i < tiers.length; i++) {
            var t = tiers[i];
            if (s >= t.min && s <= t.max) return t;
        }
        return { id: 'unknown', label_zh: '未知' };
    }

    function buildSimWarningsClient(bp, qualities, materialScore) {
        var warnings = [];
        var qcfg = (state.meta && state.meta.quality) || {};
        var minWarn = qcfg.min_craft_warning != null ? qcfg.min_craft_warning : 500;
        if (materialScore < minWarn) {
            warnings.push('综合材料品质低于 ' + minWarn + '，游戏中可能无法制造或属性偏低');
        }
        (bp.ingredients || []).forEach(function (ing) {
            var q = qualities[ing.key];
            if (q != null && Number(q) < minWarn) {
                warnings.push(
                    (ing.name_zh || ing.name) + ' 品质 ' + Number(q) + ' 低于建议值 ' + minWarn
                );
            }
        });
        if (bp.nav_type === 'magazine') {
            var adj = collectMaterialStatAdjustments(bp.ingredients, qualities, bp.nav_type);
            if (!Object.keys(adj.mults).length && !Object.keys(adj.adds).length) {
                warnings.push('弹匣蓝图不受材料品质影响，以下为成品基准属性');
            }
        }
        return warnings;
    }

    function computeSimMultiplierFromStats(stats) {
        var multSum = 0;
        var multCount = 0;
        (stats || []).forEach(function (st) {
            if (st.multiplier != null && Number.isFinite(Number(st.multiplier))) {
                multSum += Number(st.multiplier);
                multCount += 1;
            }
        });
        return multCount > 0 ? Math.round((multSum / multCount) * 1000) / 1000 : 1;
    }

    function buildSimResultClient(bp, qualities) {
        if (!bp) return { ok: false };
        var stats = simulateCraftClient(bp, qualities);
        var materialScore = computeMaterialScoreClient(bp.ingredients, qualities);
        return {
            ok: true,
            blueprint_uuid: bp.uuid,
            material_score: Math.round(materialScore * 10) / 10,
            quality_factor: Math.round((materialScore / 1000) * 1000) / 1000,
            quality_tier: qualityTierClient(materialScore),
            multiplier: computeSimMultiplierFromStats(stats),
            stats: stats,
            warnings: buildSimWarningsClient(bp, qualities, materialScore),
            simulated: true,
        };
    }

    function resolveCraftOutputLabelZh(statKey, fallback) {
        if (STAT_KEY_LABEL_ZH[statKey]) {
            return normalizeBlueprintStatLabelZh(STAT_KEY_LABEL_ZH[statKey]);
        }
        return normalizeBlueprintStatLabelZh(fallback || statKey);
    }

    /** 浏览器端计算产出属性（材料加成相加，不依赖 API 旧算法） */
    function simulateCraftClient(blueprint, qualities) {
        if (!blueprint) return [];
        var navType = blueprint.nav_type;
        var adj = collectMaterialStatAdjustments(blueprint.ingredients, qualities, navType);
        var baseStats = blueprint.base_stats || {};
        var stats = [];
        var seen = {};

        function append(entry) {
            if (!entry || seen[entry.key]) return;
            seen[entry.key] = true;
            stats.push(entry);
        }

        Object.keys(baseStats).forEach(function (rawKey) {
            var def = baseStats[rawKey];
            var base = Number(def.value);
            if (!Number.isFinite(base)) return;
            var statKey = canonicalSimStatKey(def.key || rawKey);
            var mult = adj.mults[statKey] != null ? adj.mults[statKey] : 1;
            var add = adj.adds[statKey] != null ? adj.adds[statKey] : 0;
            append(
                buildSimStatEntryClient({
                    key: statKey,
                    label_zh: resolveCraftOutputLabelZh(statKey, def.label_zh),
                    unit: def.unit || '',
                    base: base,
                    mult: mult,
                    add: add,
                })
            );
        });

        Object.keys(adj.mults)
            .concat(Object.keys(adj.adds))
            .forEach(function (sk) {
                var canon = canonicalSimStatKey(sk);
                if (seen[canon]) return;
                var mult = adj.mults[sk] != null ? adj.mults[sk] : 1;
                var add = adj.adds[sk] != null ? adj.adds[sk] : 0;
                if (Math.abs(mult - 1) < 0.000001 && add === 0) return;
                append(
                    buildSimStatEntryClient({
                        key: canon,
                        label_zh: resolveCraftOutputLabelZh(canon, null),
                        unit: '',
                        base: null,
                        mult: mult,
                        add: add,
                    })
                );
            });

        return stats;
    }

    function modifierAtQuality(mod, quality, baselineQuality) {
        var type = String((mod && mod.value_range_type) || 'linear').trim();
        if (type === 'linear_integer_additive') {
            var segments = (mod && mod.value_segments) || [];
            var q = Math.max(0, Math.min(1000, Number(quality) || 0));
            var baseline =
                baselineQuality != null
                    ? Math.max(0, Math.min(1000, Number(baselineQuality) || 0))
                    : defaultQuality();
            var idx = -1;
            var baseIdx = -1;
            for (var s = 0; s < segments.length; s++) {
                var seg = segments[s];
                var min = Number(seg.quality_min) || 0;
                var max = Number(seg.quality_max) || 1000;
                if (q >= min && q <= max) idx = s;
                if (baseline >= min && baseline <= max) baseIdx = s;
            }
            if (idx < 0) idx = segments.length ? segments.length - 1 : -1;
            if (baseIdx < 0) baseIdx = segments.length ? segments.length - 1 : -1;
            if (idx <= baseIdx) return { kind: 'additive', value: 0 };
            var bonus = 0;
            for (var i = baseIdx + 1; i <= idx; i++) {
                var endVal = Number(segments[i].modifier_at_end);
                var startVal = Number(segments[i].modifier_at_start);
                bonus += Math.round(
                    Number.isFinite(endVal) ? endVal : Number.isFinite(startVal) ? startVal : 1
                );
            }
            return { kind: 'additive', value: bonus };
        }
        var segments = (mod && mod.value_segments) || [];
        var q2 = Math.max(0, Math.min(1000, Number(quality) || 0));
        if (!segments.length && mod && mod.modifier_range) {
            var mr = mod.modifier_range;
            var qr = mod.quality_range || { min: 0, max: 1000 };
            if (mr.at_min_quality != null && mr.at_max_quality != null) {
                segments = [
                    {
                        quality_min: qr.min != null ? qr.min : 0,
                        quality_max: qr.max != null ? qr.max : 1000,
                        modifier_at_start: mr.at_min_quality,
                        modifier_at_end: mr.at_max_quality,
                    },
                ];
            }
        }
        for (var j = 0; j < segments.length; j++) {
            var seg2 = segments[j];
            var min2 = Number(seg2.quality_min) || 0;
            var max2 = Number(seg2.quality_max) || 1000;
            if (q2 < min2 || q2 > max2) continue;
            var span = max2 - min2 || 1;
            var t = (q2 - min2) / span;
            var start = Number(seg2.modifier_at_start) || 1;
            var end = Number(seg2.modifier_at_end) || 1;
            return { kind: 'multiplier', value: start + (end - start) * t };
        }
        return { kind: 'multiplier', value: 1 };
    }

    function formatModifierDelta(effect) {
        if (!effect || effect.kind === 'additive') {
            var add = effect && effect.value ? Number(effect.value) : 0;
            if (!add) return '';
            var addRounded = roundCraftNumber(add);
            if (addRounded == null || Math.abs(addRounded) < 0.005) return '';
            return (addRounded > 0 ? '+' : '') + addRounded.toFixed(2);
        }
        var mult = Number(effect.value) || 1;
        return formatCraftPct((mult - 1) * 100);
    }

    function formatCraftStatDelta(delta) {
        if (delta == null || Math.abs(delta) < 0.005) return '';
        var pct = roundCraftNumber(delta);
        if (pct == null) return '';
        return (
            '<span class="bp-sim-stat-delta' +
            (pct > 0 ? ' is-up' : ' is-down') +
            '">' +
            escapeHtml((pct > 0 ? '+' : '') + pct.toFixed(2) + '%') +
            '</span>'
        );
    }

    function formatSimStatNumber(value) {
        var n = Number(value);
        if (!Number.isFinite(n)) return '—';
        if (Math.abs(n) >= 1e9) return formatFixedDecimal2(n / 1e9) + 'G';
        if (Math.abs(n) >= 1e6) return formatFixedDecimal2(n / 1e6) + 'M';
        return formatFixedDecimal2(n);
    }

    function resolveCraftStatGainValue(st) {
        if (st.gain_value != null && Number.isFinite(Number(st.gain_value))) {
            return Number(st.gain_value);
        }
        if (st.base != null && st.final != null && Number.isFinite(st.base) && Number.isFinite(st.final)) {
            return st.final - st.base;
        }
        if (st.gain_additive != null && st.gain_additive !== 0) return st.gain_additive;
        if (st.additive != null && st.additive !== 0) return st.additive;
        return null;
    }

    function formatGforceGainDisplay(gainCoeff) {
        var pct = Number(gainCoeff) * 100;
        if (!Number.isFinite(pct) || Math.abs(pct) < 0.00005) return '';
        return (pct > 0 ? '+' : '') + formatFixedDecimal2(pct) + '%';
    }

    function formatCraftStatGainHtml(st) {
        var parts = [];
        var gainPct =
            st.gain_pct != null
                ? roundCraftNumber(st.gain_pct)
                : st.multiplier != null
                  ? roundCraftNumber((Number(st.multiplier) - 1) * 100)
                  : roundCraftNumber(st.delta_pct);
        var gainVal = resolveCraftStatGainValue(st);
        if (gainVal != null && isGforceResistanceStat(st.key)) {
            gainVal = Number(gainVal);
        } else if (gainVal != null) {
            gainVal = roundCraftNumber(gainVal);
        }
        var up =
            (gainPct != null && gainPct > 0) || (gainVal != null && gainVal > 0);
        var down =
            (gainPct != null && gainPct < 0) || (gainVal != null && gainVal < 0);
        var cls =
            'bp-sim-stat-gain' +
            (up ? ' is-up' : down ? ' is-down' : '');

        if (gainPct != null && Math.abs(gainPct) >= 0.005) {
            var pctText = '增益 ' + (gainPct > 0 ? '+' : '') + gainPct.toFixed(2) + '%';
            if (gainVal != null && Math.abs(gainVal) >= 0.001) {
                pctText +=
                    ' <span class="bp-sim-stat-gain-val">(' +
                    escapeHtml(
                        isGforceResistanceStat(st.key)
                            ? formatGforceGainDisplay(gainVal)
                            : (gainVal > 0 ? '+' : '') + formatSimStatNumber(gainVal)
                    ) +
                    ')</span>';
            }
            parts.push('<span class="' + cls + '">' + pctText + '</span>');
        } else if (gainVal != null && Math.abs(gainVal) >= 0.001) {
            parts.push(
                '<span class="' +
                    cls +
                    '">增益 ' +
                    escapeHtml(
                        isGforceResistanceStat(st.key)
                            ? formatGforceGainDisplay(gainVal)
                            : (gainVal > 0 ? '+' : '') + formatSimStatNumber(gainVal)
                    ) +
                    '</span>'
            );
        }
        return parts.join('');
    }

    function formatCraftStatValueHtml(st) {
        if (st.modifier_only && st.final == null) {
            return formatCraftStatGainHtml(st) || '<strong class="bp-sim-stat-modonly">—</strong>';
        }
        var finalVal = st.final != null ? st.final : st.base;
        var unit = resolveCraftStatUnit(st);
        var unitHtml = unit
            ? ' <span class="bp-stat-unit">' + escapeHtml(unit) + '</span>'
            : '';
        var attachTag = st.with_attachments
            ? ' <span class="bp-sim-stat-tag">含配件</span>'
            : '';
        var gainHtml = st.modifiable ? formatCraftStatGainHtml(st) : '';
        var baseHtml = '';
        if (
            st.modifiable &&
            st.base != null &&
            Number.isFinite(Number(st.base)) &&
            st.final != null &&
            Number.isFinite(Number(st.final))
        ) {
            baseHtml =
                '<span class="bp-sim-stat-base">基准 ' +
                escapeHtml(formatCraftStatNumberForStat(st.base, st.key)) +
                '</span> ';
        }
        return (
            baseHtml +
            '<strong>' +
            escapeHtml(formatCraftStatNumberForStat(finalVal, st.key)) +
            '</strong>' +
            unitHtml +
            gainHtml +
            attachTag
        );
    }

    function renderMaterialModifiers(container, ing, quality) {
        if (!container) return;
        var mods = ing.stat_modifiers || [];
        if (!mods.length) {
            container.innerHTML = '';
            return;
        }
        var existing = container.querySelectorAll('.bp-mat__mod');
        if (existing.length === mods.length) {
            mods.forEach(function (mod, index) {
                var baseline = ing.initial_quality != null ? ing.initial_quality : defaultQuality();
                var effect = modifierAtQuality(mod, quality, baseline);
                var deltaText = formatModifierDelta(effect);
                var isUp =
                    effect.kind === 'additive'
                        ? effect.value > 0
                        : Number(effect.value) > 1;
                var isDown =
                    effect.kind === 'additive'
                        ? effect.value < 0
                        : Number(effect.value) < 1;
                var span = existing[index];
                span.className =
                    'bp-mat__mod' +
                    (!deltaText ? '' : isUp ? ' bp-mat__mod--up' : isDown ? ' bp-mat__mod--down' : '');
                span.textContent =
                    normalizeBlueprintStatLabelZh(mod.label_zh || mod.label || '属性') +
                    (deltaText ? ' ' + deltaText : '');
            });
            return;
        }
        container.innerHTML = '';
        mods.forEach(function (mod) {
            var baseline = ing.initial_quality != null ? ing.initial_quality : defaultQuality();
            var effect = modifierAtQuality(mod, quality, baseline);
            var deltaText = formatModifierDelta(effect);
            var isUp =
                effect.kind === 'additive'
                    ? effect.value > 0
                    : Number(effect.value) > 1;
            var isDown =
                effect.kind === 'additive'
                    ? effect.value < 0
                    : Number(effect.value) < 1;
            var span = document.createElement('span');
            span.className =
                'bp-mat__mod' +
                (!deltaText ? '' : isUp ? ' bp-mat__mod--up' : isDown ? ' bp-mat__mod--down' : '');
            span.textContent =
                normalizeBlueprintStatLabelZh(mod.label_zh || mod.label || '属性') +
                (deltaText ? ' ' + deltaText : '');
            container.appendChild(span);
        });
    }

    function buildMaterialRow(ing) {
        var val = state.qualities[ing.key] != null ? state.qualities[ing.key] : defaultQuality();
        var pct = Math.max(0, Math.min(100, val / 10));
        var hasRole = !!resolveRoleLabelZh(ing);
        var row = document.createElement('div');
        row.className = 'bp-mat' + (hasRole ? ' bp-mat--has-role' : ' bp-mat--base');
        row.dataset.ingKey = ing.key || '';
        var qty =
            ing.kind === 'resource'
                ? ing.quantity_scu != null
                    ? formatScuQty(ing.quantity_scu)
                    : ''
                : ing.quantity != null
                  ? '×' + ing.quantity
                  : '';
        var roleName = resolveRoleLabelZh(ing);
        var hasMods = (ing.stat_modifiers || []).length > 0;
        var modsBlockHtml = hasMods
            ? '<div class="bp-mat__mods-wrap">' +
              '<span class="bp-mat__mods-label">属性增益</span>' +
              '<div class="bp-mat__mods" data-mat-mods></div>' +
              '</div>'
            : '<div class="bp-mat__mods" data-mat-mods hidden></div>';

        if (hasRole) {
            row.innerHTML =
                '<header class="bp-mat__part-head">' +
                '<span class="bp-mat__role-tag">部件</span>' +
                '<span class="bp-mat__role-name">' +
                escapeHtml(roleName) +
                '</span>' +
                '</header>' +
                '<div class="bp-mat__material">' +
                '<span class="bp-mat__mat-label">材料</span>' +
                '<span class="bp-mat__name">' +
                escapeHtml(ing.name_zh || ing.name) +
                '</span>' +
                '<span class="bp-mat__qty">' +
                escapeHtml(qty) +
                '</span>' +
                '</div>' +
                modsBlockHtml +
                '<div class="bp-mat__quality-row">' +
                '<span class="bp-mat__quality-label">品质</span>' +
                '<input type="number" class="bp-mat__input" min="0" max="1000" step="1" value="' +
                val +
                '" aria-label="' +
                escapeHtml(roleName + ' ' + (ing.name_zh || ing.name)) +
                ' 品质数值">' +
                '</div>' +
                '<div class="bp-mat__track">' +
                '<div class="bp-mat__fill" style="width:' +
                pct +
                '%;background:linear-gradient(90deg, rgba(0,240,255,0.3), ' +
                qualityColor(val) +
                ')"></div>' +
                '<input type="range" class="bp-mat__range" min="0" max="1000" step="1" value="' +
                val +
                '" aria-label="' +
                escapeHtml(roleName + ' ' + (ing.name_zh || ing.name)) +
                ' 品质">' +
                '</div>';
        } else {
            row.innerHTML =
                '<div class="bp-mat__top">' +
                '<span class="bp-mat__name">' +
                escapeHtml(ing.name_zh || ing.name) +
                '</span>' +
                '<span class="bp-mat__qty">' +
                escapeHtml(qty) +
                '</span>' +
                '<div class="bp-mat__quality">' +
                '<input type="number" class="bp-mat__input" min="0" max="1000" step="1" value="' +
                val +
                '" aria-label="' +
                escapeHtml(ing.name_zh || ing.name) +
                ' 品质数值">' +
                '</div>' +
                '</div>' +
                modsBlockHtml +
                '<div class="bp-mat__track">' +
                '<div class="bp-mat__fill" style="width:' +
                pct +
                '%;background:linear-gradient(90deg, rgba(0,240,255,0.3), ' +
                qualityColor(val) +
                ')"></div>' +
                '<input type="range" class="bp-mat__range" min="0" max="1000" step="1" value="' +
                val +
                '" aria-label="' +
                escapeHtml(ing.name_zh || ing.name) +
                ' 品质">' +
                '</div>';
        }
        var modsEl = row.querySelector('[data-mat-mods]');
        renderMaterialModifiers(modsEl, ing, val);
        return row;
    }

    function renderMaterials() {
        if (!el.materials || !state.blueprint) return;
        var ingredients = state.blueprint.ingredients || [];
        var existing = el.materials.querySelectorAll('.bp-mat');
        if (existing.length === ingredients.length && existing.length > 0) {
            var canReuse = true;
            for (var i = 0; i < ingredients.length; i++) {
                var wantRole = !!resolveRoleLabelZh(ingredients[i]);
                var hasRole = existing[i].classList.contains('bp-mat--has-role');
                if (wantRole !== hasRole) {
                    canReuse = false;
                    break;
                }
            }
            if (canReuse) {
                for (var j = 0; j < ingredients.length; j++) {
                    if ((existing[j].dataset.ingKey || '') !== (ingredients[j].key || '')) {
                        canReuse = false;
                        break;
                    }
                }
            }
            if (canReuse) {
                ingredients.forEach(function (ing, index) {
                    updateMaterialRowInPlace(existing[index], ing);
                });
                return;
            }
        }
        var frag = document.createDocumentFragment();
        ingredients.forEach(function (ing) {
            frag.appendChild(buildMaterialRow(ing));
        });
        el.materials.innerHTML = '';
        el.materials.appendChild(frag);
    }

    function updateMaterialRowInPlace(row, ing) {
        if (!row || !ing) return;
        row.dataset.ingKey = ing.key || '';
        var val = state.qualities[ing.key] != null ? state.qualities[ing.key] : defaultQuality();
        var pct = Math.max(0, Math.min(100, val / 10));
        var hasRole = !!resolveRoleLabelZh(ing);
        row.className = 'bp-mat' + (hasRole ? ' bp-mat--has-role' : ' bp-mat--base');
        var qty =
            ing.kind === 'resource'
                ? ing.quantity_scu != null
                    ? formatScuQty(ing.quantity_scu)
                    : ''
                : ing.quantity != null
                  ? '×' + ing.quantity
                  : '';
        var roleName = resolveRoleLabelZh(ing);
        var nameEl = row.querySelector('.bp-mat__name');
        if (nameEl) nameEl.textContent = ing.name_zh || ing.name;
        var qtyEl = row.querySelector('.bp-mat__qty');
        if (qtyEl) qtyEl.textContent = qty;
        var roleNameEl = row.querySelector('.bp-mat__role-name');
        if (roleNameEl) roleNameEl.textContent = roleName;
        var slider = row.querySelector('.bp-mat__range');
        var input = row.querySelector('.bp-mat__input');
        var fill = row.querySelector('.bp-mat__fill');
        if (slider) slider.value = String(val);
        if (input && document.activeElement !== input) input.value = String(val);
        if (fill) {
            fill.style.width = pct + '%';
            fill.style.background =
                'linear-gradient(90deg, rgba(0,240,255,0.3), ' + qualityColor(val) + ')';
        }
        var modsEl = row.querySelector('[data-mat-mods]');
        renderMaterialModifiers(modsEl, ing, val);
    }

    function applyPreset(kind) {
        if (!state.blueprint) return;
        var val = kind === 'max' ? 1000 : kind === 'min' ? 0 : defaultQuality();
        (state.blueprint.ingredients || []).forEach(function (ing) {
            state.qualities[ing.key] = val;
        });
        persistQualities();
        renderMaterials();
        scheduleSimulate();
    }

    function scheduleSimulateFast() {
        if (state.simRaf) return;
        state.simRaf = requestAnimationFrame(function () {
            state.simRaf = null;
            runSimulate();
        });
    }

    function scheduleSimulate() {
        if (state.simTimer) clearTimeout(state.simTimer);
        state.simTimer = setTimeout(function () {
            state.simTimer = null;
            runSimulate();
        }, SIM_DEBOUNCE_MS);
    }

    function runSimulate() {
        if (!state.blueprint) return;
        renderSimResult(buildSimResultClient(state.blueprint, state.qualities));
    }

    function mergeWeaponCraftWithAttachments(craftStats) {
        if (!isFpsWeaponBlueprint(state.blueprint)) return craftStats;
        var att = state.attachmentStats;
        if (!att || !craftStats || !craftStats.length) return craftStats;
        var dmgRatio =
            att.base && att.base.damage && att.damage != null
                ? att.damage / att.base.damage
                : 1;
        var rpmRatio =
            att.base && att.base.rpm && att.rpm != null ? att.rpm / att.base.rpm : 1;
        return craftStats.map(function (st) {
            var ratio = 1;
            if (st.key === 'damage_per_shot' && dmgRatio !== 1) ratio = dmgRatio;
            else if ((st.key === 'rpm' || st.key === 'rof') && rpmRatio !== 1) ratio = rpmRatio;
            if (ratio === 1 || st.modifier_only) return st;
            var base = st.final != null ? st.final : st.base;
            if (base == null || !Number.isFinite(base)) return st;
            var combined = roundCraftNumber(base * ratio);
            var deltaPct =
                st.base != null && st.base !== 0
                    ? roundCraftNumber(((combined - st.base) / st.base) * 100)
                    : roundCraftNumber(st.delta_pct);
            return Object.assign({}, st, {
                final: combined,
                delta_pct: deltaPct,
                gain_value:
                    st.base != null && Number.isFinite(st.base)
                        ? roundCraftNumber(combined - st.base)
                        : st.gain_value,
                with_attachments: true,
            });
        });
    }

    function renderAttachmentStatsPanel() {
        if (!el.attachStats || !el.attachStatSection) return;
        var att = state.attachmentStats;
        if (!att) {
            el.attachStatSection.hidden = true;
            el.attachStats.innerHTML = '';
            return;
        }
        var defs = [
            { key: 'damage', label: '单发伤害', unit: '' },
            { key: 'rpm', label: '射速', unit: ' RPM' },
            { key: 'range', label: '射程', unit: ' m' },
            { key: 'recoil', label: '后坐力', unit: '' },
            { key: 'sound', label: '声响', unit: '' },
        ];
        el.attachStatSection.hidden = false;
        el.attachStats.innerHTML = '';
        defs.forEach(function (def) {
            var val = att[def.key];
            var baseVal = att.base && att.base[def.key];
            if (val == null && baseVal == null) return;
            var li = document.createElement('li');
            li.className = 'bp-sim-stat';
            var deltaPct = 0;
            if (baseVal != null && val != null && baseVal !== 0 && baseVal !== val) {
                deltaPct = roundCraftNumber(((val - baseVal) / baseVal) * 100);
            }
            li.innerHTML =
                '<span class="bp-sim-stat-label">' +
                escapeHtml(def.label) +
                '</span><span class="bp-sim-stat-value">' +
                formatCraftStatValueHtml({
                    base: baseVal,
                    final: val,
                    delta_pct: deltaPct,
                    unit: def.unit ? String(def.unit).trim() : '',
                }) +
                '</span>';
            el.attachStats.appendChild(li);
        });
        if (!el.attachStats.childNodes.length) el.attachStatSection.hidden = true;
    }

    function isMagazineNoBonusSim(data) {
        if (!state.blueprint || state.blueprint.nav_type !== 'magazine') return false;
        if (data.multiplier != null && Math.abs(Number(data.multiplier) - 1) < 0.001) return true;
        var stats = data.stats || [];
        return !stats.some(function (s) {
            return s.modifiable;
        });
    }

    function tryUpdateSimPanelInPlace(data) {
        if (!data || !data.ok) return false;
        var stats = mergeWeaponCraftWithAttachments(data.stats || []);
        if (el.simSummary && !el.simSummary.classList.contains('is-empty')) {
            var scoreEl = el.simSummary.querySelector('.bp-meter__score');
            var tierEl = el.simSummary.querySelector('.bp-meter__tier');
            var multEl = el.simSummary.querySelector('.bp-meter__mult');
            var ringEl = el.simSummary.querySelector('.bp-meter__ring');
            var score = Number(data.material_score) || 0;
            var pct = Math.max(0, Math.min(100, score / 10));
            var tier = (data.quality_tier && data.quality_tier.label_zh) || '—';
            if (scoreEl && tierEl && multEl && ringEl) {
                scoreEl.innerHTML =
                    escapeHtml(String(score)) + '<span class="bp-meter__unit">Q</span>';
                tierEl.textContent = tier;
                multEl.textContent = '×' + String(data.multiplier);
                ringEl.style.setProperty('--bp-score', String(pct));
            } else {
                return false;
            }
        } else {
            return false;
        }
        if (!el.simStats) return true;
        var nodes = el.simStats.querySelectorAll('.bp-sim-stat');
        if (nodes.length !== stats.length || !stats.length) return false;
        for (var i = 0; i < stats.length; i++) {
            var st = stats[i];
            var li = nodes[i];
            var valueEl = li.querySelector('.bp-sim-stat-value');
            if (!valueEl) return false;
            li.className =
                'bp-sim-stat' +
                (st.modifiable ? ' bp-sim-stat--mod' : '') +
                (st.modifiable ? ' bp-sim-stat--bonus' : '');
            valueEl.innerHTML = formatCraftStatValueHtml(st);
        }
        return true;
    }

    function renderSimResult(data) {
        if (!data || !data.ok) return;
        state.lastSimData = data;
        if (tryUpdateSimPanelInPlace(data)) {
            renderAttachmentStatsPanel();
            return;
        }
        if (el.simSummary) {
            var score = Number(data.material_score) || 0;
            var pct = Math.max(0, Math.min(100, score / 10));
            var tier = (data.quality_tier && data.quality_tier.label_zh) || '—';
            el.simSummary.classList.remove('is-empty');
            el.simSummary.innerHTML =
                '<div class="bp-meter bp-meter--compact" title="材料品质分 Q（0–1000）">' +
                '<div class="bp-meter__ring" style="--bp-score:' +
                pct +
                '" aria-hidden="true"></div>' +
                '<div class="bp-meter__meta">' +
                '<span class="bp-meter__score">' +
                escapeHtml(String(score)) +
                '<span class="bp-meter__unit">Q</span></span>' +
                '<span class="bp-meter__row">' +
                '<span class="bp-meter__tier">' +
                escapeHtml(tier) +
                '</span>' +
                '<span class="bp-meter__mult">×' +
                escapeHtml(String(data.multiplier)) +
                '</span>' +
                '</span></div></div>';
        }
        if (el.simStats) {
            el.simStats.innerHTML = '';
            renderArmorClassStatRow(state.blueprint);
            var stats = mergeWeaponCraftWithAttachments(data.stats || []);
            stats.forEach(function (st) {
                var li = document.createElement('li');
                var unit = resolveCraftStatUnit(st);
                li.className =
                    'bp-sim-stat' +
                    (st.modifiable ? ' bp-sim-stat--mod' : '') +
                    (st.modifiable ? ' bp-sim-stat--bonus' : '');
                li.innerHTML =
                    '<span class="bp-sim-stat-label">' +
                    escapeHtml(normalizeBlueprintStatLabelZh(st.label_zh)) +
                    (unit ? ' (' + escapeHtml(unit) + ')' : '') +
                    '</span><span class="bp-sim-stat-value">' +
                    formatCraftStatValueHtml(st) +
                    '</span>';
                el.simStats.appendChild(li);
            });
            if (!stats.length) {
                var none = document.createElement('li');
                none.className = 'bp-sim-stat';
                var baseKeys =
                    state.blueprint && state.blueprint.base_stats
                        ? Object.keys(state.blueprint.base_stats)
                        : [];
                var hasMods = (state.blueprint.ingredients || []).some(function (ing) {
                    return (ing.stat_modifiers || []).length;
                });
                none.textContent = baseKeys.length
                    ? '调整材料品质以预览属性'
                    : hasMods
                      ? '该蓝图有材料增益，见左侧各材料说明'
                      : state.blueprint && state.blueprint.nav_type === 'magazine'
                        ? '弹匣蓝图暂无材料品质增益'
                        : '该蓝图暂无可用基准属性';
                el.simStats.appendChild(none);
            }
        }
        renderAttachmentStatsPanel();
        if (el.simWarnings) {
            var warns = data.warnings || [];
            var showEgg = isMagazineNoBonusSim(data);
            if (warns.length || showEgg) {
                el.simWarnings.hidden = false;
                el.simWarnings.innerHTML = '';
                warns.forEach(function (w) {
                    var li = document.createElement('li');
                    li.textContent = w;
                    el.simWarnings.appendChild(li);
                });
                if (showEgg) {
                    var egg = document.createElement('li');
                    egg.className = 'bp-warn-list__egg';
                    egg.textContent = '恭喜你造了个废物，啥加成没有';
                    el.simWarnings.appendChild(egg);
                }
            } else {
                el.simWarnings.hidden = true;
            }
        }
        if (el.simNote) {
            el.simNote.textContent = data.note || '';
        }
    }

    function bindEvents() {
        if (el.groupSelect) {
            el.groupSelect.addEventListener('change', function () {
                setGroup(el.groupSelect.value);
            });
        }
        if (el.typeSelect) {
            el.typeSelect.addEventListener('change', function () {
                setType(el.typeSelect.value);
            });
        }
        bindSearchEvents();
        document.querySelectorAll('[data-preset]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                applyPreset(btn.getAttribute('data-preset'));
            });
        });
    }

    function updateFootnote() {
        if (!el.footnote || !state.meta) return;
        var parts = [];
        if (state.meta.total) parts.push('共 ' + state.meta.total + ' 条蓝图');
        if (state.meta.synced_at) {
            var d = new Date(state.meta.synced_at);
            parts.push('更新 ' + d.toLocaleString('zh-CN'));
        }
        if (state.meta.game_version) parts.push(state.meta.game_version);
        el.footnote.textContent = parts.join(' · ');
        if (el.versionBadge && state.meta.game_version) {
            el.versionBadge.textContent = state.meta.game_version;
            el.versionBadge.hidden = false;
        }
    }

    function boot() {
        el.gate = $('bpGate');
        el.groupSelect = $('bpGroupSelect');
        el.typeSelect = $('bpTypeSelect');
        el.typeField = $('bpTypeField');
        el.blueprintList = $('bpBlueprintList');
        el.listEmpty = $('bpListEmpty');
        el.listWrap = document.querySelector('.bp-list-wrap');
        el.listCount = $('bpListCount');
        el.search = $('bpSearch');
        el.searchSuggest = $('bpSearchSuggest');
        el.searchWrap = document.querySelector('.bp-search-wrap');
        el.craftEmpty = $('bpCraftEmpty');
        el.craftDetail = $('bpCraftDetail');
        el.outputName = $('bpOutputName');
        el.outputSub = $('bpOutputSub');
        el.outputImage = $('bpOutputImage');
        el.outputImageBtn = $('bpOutputImageBtn');
        el.outputImageFrame = $('bpOutputImageFrame');
        el.outputImagePh = $('bpOutputImagePh');
        el.componentLink = $('bpComponentLink');
        el.materials = $('bpMaterials');
        el.simSummary = $('bpSimSummary');
        el.simStats = $('bpSimStats');
        el.simWarnings = $('bpSimWarnings');
        el.simNote = $('bpSimNote');
        el.missions = $('bpMissions');
        el.missionsBar = $('bpMissionsBar');
        el.missionCount = $('bpMissionCount');
        el.outputTags = $('bpOutputTags');
        el.loadoutSlots = $('bpLoadoutSlots');
        el.attachStats = $('bpAttachStats');
        el.attachStatSection = $('bpAttachStatSection');
        el.statHint = $('bpStatHint');
        el.footnote = $('bpFootnote');
        el.versionBadge = $('bpVersionBadge');

        parseUrlState();
        applyPendingCraftDeepLink();
        sanitizeBlueprintRestoreFlag();
        applyBlueprintCraftReturnState();
        if (!state.selectedId) {
            var deepLinkId = readDeepLinkBlueprintId();
            if (deepLinkId) state.selectedId = deepLinkId;
        }
        bindEvents();
        wireBlueprintListEvents();
        wireVirtualListScroll();
        wireMaterialsPanel();

        fetchJson('/api/sc/blueprints/meta')
            .then(function (meta) {
                state.meta = meta;
                if (!meta.ready) {
                    showGate('蓝图数据正在同步，请稍候刷新…');
                } else {
                    hideGate();
                }
                return resolveSelectedBlueprintNav();
            })
            .then(function () {
                normalizeNavForMeta();
                syncNavControlsFromState();
                updateFootnote();
                return loadAllBlueprints();
            })
            .catch(function (err) {
                showGate(err.message || '无法加载蓝图元数据');
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
