(function () {
    if (typeof document === 'undefined') return;

    var API_BASE = (window.USS_AUTH_API_BASE || '').replace(/\/$/, '');
    var COL_COUNT = 12;
    var state = {
        type: 'cooling',
        types: {},
        meta: null,
        items: [],
        total: 0,
        expanded: {},
        searchTimer: null,
        listFetchController: null,
        sortKey: 'size',
        sortDir: 'asc',
    };

    var els = {
        gate: document.getElementById('scGate'),
        tabs: document.getElementById('scTabs'),
        body: document.getElementById('scTableBody'),
        tableHead: document.getElementById('scTableHead'),
        tableShell: document.getElementById('scTableShell'),
        metaBar: document.getElementById('scMetaBar'),
        footnote: document.getElementById('scFootnote'),
        search: document.getElementById('scSearch'),
    };

    var SORT_GETTERS = {
        name: function (item) {
            return item.name_zh || item.name_en || '';
        },
        type: function (item) {
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

    function buildQuery() {
        var q = els.search ? String(els.search.value || '').trim() : '';
        var params = new URLSearchParams();
        if (q) params.set('q', q);
        if (state.type && !q) params.set('type', state.type);
        // 全局搜索需覆盖全部配件（当前约 328 条）
        params.set('limit', q ? '500' : '200');
        return params.toString();
    }

    function renderTabs() {
        if (!els.tabs) return;
        els.tabs.innerHTML = '';
        Object.keys(state.types).forEach(function (key) {
            var t = state.types[key];
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

    function sizeBadgeClass(sizeLabel) {
        var m = String(sizeLabel || '').match(/S(\d+)/i);
        if (m) return 'sc-size-badge sc-size-badge--s' + m[1];
        return 'sc-size-badge sc-size-badge--unknown';
    }

    function isSearchActive() {
        return !!(els.search && String(els.search.value || '').trim());
    }

    function syncBodyMode() {
        var cls = 'ship-components-body sc-type-' + state.type;
        if (isSearchActive()) cls += ' sc-mode-search';
        document.body.className = cls;
        syncTableColumns();
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
        var getter = SORT_GETTERS[state.sortKey];
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
        if (!els.tableHead) return;
        els.tableHead.querySelectorAll('.sc-sortable[data-sort]').forEach(function (th) {
            var btn = th.querySelector('.sc-sort-btn');
            if (!btn) return;
            btn.addEventListener('click', function () {
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
        });
        updateSortHeaders();
    }

    function isTypeColumnVisible() {
        if (isSearchActive()) return true;
        var t = state.type;
        return t !== 'quantum' && t !== 'jump' && t !== 'radar';
    }

    function isSpeedColumnVisible() {
        return isSearchActive() || state.type === 'quantum';
    }

    function isMassVolumeVisible() {
        if (isSearchActive()) return true;
        return state.type !== 'jump' && state.type !== 'radar';
    }

    function isColumnVisible(key) {
        if (key === 'type') return isTypeColumnVisible();
        if (key === 'speed') return isSpeedColumnVisible();
        if (key === 'mass' || key === 'volume') return isMassVolumeVisible();
        return true;
    }

    var COLUMN_ORDER = [
        'name',
        'type',
        'class',
        'grade',
        'size',
        'mfg',
        'mass',
        'volume',
        'speed',
        'price',
        'loc',
        'expand',
    ];

    var COLUMN_WEIGHTS = {
        name: 1.45,
        type: 0.85,
        class: 0.95,
        grade: 0.75,
        size: 0.75,
        mfg: 1.05,
        mass: 0.85,
        volume: 0.85,
        speed: 0.95,
        price: 0.95,
        loc: 1.65,
        expand: 0.4,
    };

    function syncTableColumns() {
        var expandPct = 4;
        var budget = 100 - expandPct;
        var visible = COLUMN_ORDER.filter(isColumnVisible);
        var weightSum = 0;
        visible.forEach(function (key) {
            if (key !== 'expand') weightSum += COLUMN_WEIGHTS[key] || 1;
        });

        var classMap = {};
        COLUMN_ORDER.forEach(function (key) {
            classMap['sc-col-' + key] = 0;
        });

        var assigned = 0;
        var dataKeys = visible.filter(function (key) {
            return key !== 'expand';
        });
        dataKeys.forEach(function (key, idx) {
            var colKey = 'sc-col-' + key;
            var pct;
            if (idx === dataKeys.length - 1) {
                pct = budget - assigned;
            } else {
                pct = Math.round(((COLUMN_WEIGHTS[key] || 1) / weightSum) * budget * 10) / 10;
                assigned += pct;
            }
            classMap[colKey] = pct;
        });
        if (visible.indexOf('expand') >= 0) {
            classMap['sc-col-expand'] = expandPct;
        }

        document.querySelectorAll('#scTable col').forEach(function (col) {
            var parts = (col.className || '').split(/\s+/);
            for (var i = 0; i < parts.length; i++) {
                var key = parts[i];
                if (!Object.prototype.hasOwnProperty.call(classMap, key)) continue;
                var w = classMap[key];
                if (!w) {
                    col.style.width = '0';
                    col.style.minWidth = '0';
                } else {
                    col.style.width = w + '%';
                    col.style.minWidth = '';
                }
                break;
            }
        });
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderRow(item) {
        var tr = document.createElement('tr');
        tr.dataset.id = item.id_item;
        var expanded = !!state.expanded[item.id_item];

        var nameTd = document.createElement('td');
        nameTd.className = 'sc-col-name';
        var nameZh = item.name_zh || item.name_en || '—';
        var nameEn = item.name_en || '';
        var zhClass = item.loc_matched ? 'sc-name-zh sc-name-zh--matched' : 'sc-name-zh';
        nameTd.innerHTML =
            '<span class="' +
            zhClass +
            '">' +
            escapeHtml(nameZh) +
            '</span>' +
            (nameEn && nameEn !== nameZh
                ? '<span class="sc-name-en">' + escapeHtml(nameEn) + '</span>'
                : nameEn && !item.loc_matched
                  ? '<span class="sc-name-en">' + escapeHtml(nameEn) + '</span>'
                  : '');

        var typeTd = document.createElement('td');
        typeTd.className = 'sc-col-type-cell';
        if (isTypeColumnVisible()) {
            var typeBadge = document.createElement('span');
            typeBadge.className = 'sc-type-badge sc-type-badge--' + (item.type || 'unknown');
            typeBadge.textContent = typeLabel(item.type);
            typeTd.appendChild(typeBadge);
        }

        var classTd = document.createElement('td');
        classTd.className = 'sc-col-class';
        classTd.textContent = item.class_zh || item.class_short_zh || '—';
        classTd.title = item.class_en || '';

        var gradeTd = document.createElement('td');
        gradeTd.className = 'sc-grade sc-col-grade';
        gradeTd.textContent = item.grade || item.grade_letter || '—';
        gradeTd.title = item.grade_combo_full_zh || item.grade_combo_zh || '';

        var sizeTd = document.createElement('td');
        sizeTd.className = 'sc-col-size';
        var sizeLabel = item.size_label || '—';
        var sizeBadge = document.createElement('span');
        sizeBadge.className = sizeBadgeClass(sizeLabel);
        sizeBadge.textContent = sizeLabel;
        sizeTd.appendChild(sizeBadge);

        var mfgTd = document.createElement('td');
        mfgTd.className = 'sc-col-mfg';
        var mfgZh = item.manufacturer_zh || item.manufacturer || '—';
        mfgTd.textContent = mfgZh;
        if (item.manufacturer && item.manufacturer !== mfgZh) mfgTd.title = item.manufacturer;

        var massTd = document.createElement('td');
        massTd.className = 'sc-col-mass';
        if (isMassVolumeVisible()) massTd.textContent = formatMass(item.mass);

        var volumeTd = document.createElement('td');
        volumeTd.className = 'sc-col-volume sc-col-volume-cell';
        if (isMassVolumeVisible()) volumeTd.textContent = formatVolume(item.volume);

        var speedTd = document.createElement('td');
        speedTd.className = 'sc-col-speed sc-col-quantum-only';
        if (isSpeedColumnVisible()) speedTd.textContent = formatSpeed(item.max_speed);

        var priceTd = document.createElement('td');
        priceTd.className = 'sc-price sc-col-price';
        priceTd.textContent = formatPrice(item.price_buy_min);

        var locTd = document.createElement('td');
        locTd.className = 'sc-loc-summary sc-col-loc';
        if (item.cheapest_location) {
            locTd.innerHTML =
                escapeHtml(item.cheapest_location.location_label_zh || item.cheapest_location.terminal_name || '') +
                '<span class="sc-loc-count">（共 ' +
                (item.purchase_count || 0) +
                ' 处）</span>';
        } else {
            locTd.textContent = '—';
        }

        var expandTd = document.createElement('td');
        expandTd.className = 'sc-col-expand';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sc-expand-btn' + (expanded ? ' is-open' : '');
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        btn.textContent = expanded ? '收起' : '地点';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleExpand(item.id_item, tr);
            btn.blur();
        });
        expandTd.appendChild(btn);

        tr.appendChild(nameTd);
        tr.appendChild(typeTd);
        tr.appendChild(classTd);
        tr.appendChild(gradeTd);
        tr.appendChild(sizeTd);
        tr.appendChild(mfgTd);
        tr.appendChild(massTd);
        tr.appendChild(volumeTd);
        tr.appendChild(speedTd);
        tr.appendChild(priceTd);
        tr.appendChild(locTd);
        tr.appendChild(expandTd);
        return tr;
    }

    function renderDetailRow(item) {
        var tr = document.createElement('tr');
        tr.className = 'sc-detail-row';
        tr.dataset.detailFor = String(item.id_item);
        var td = document.createElement('td');
        td.colSpan = COL_COUNT;
        var inner = document.createElement('div');
        inner.className = 'sc-detail-inner';
        var locs = item.purchase_locations || [];
        if (!locs.length) {
            inner.textContent = '暂无购买地点数据';
        } else {
            var html =
                '<table class="sc-loc-table"><thead><tr><th>地点</th><th>终端</th><th>买入价</th></tr></thead><tbody>';
            locs.forEach(function (loc) {
                html +=
                    '<tr><td>' +
                    escapeHtml(loc.location_label_zh || loc.terminal_name_zh || loc.terminal_name || '') +
                    '</td><td>' +
                    escapeHtml(loc.terminal_name_zh || loc.terminal_name || loc.terminal_code || '—') +
                    '</td><td class="sc-price">' +
                    formatPrice(loc.price_buy) +
                    '</td></tr>';
            });
            html += '</tbody></table>';
            inner.innerHTML = html;
        }
        td.appendChild(inner);
        tr.appendChild(td);
        return tr;
    }

    function renderTable() {
        if (!els.body) return;
        els.body.innerHTML = '';
        var items = sortItems(state.items);
        if (!items.length) {
            els.body.innerHTML = '<tr><td colspan="' + COL_COUNT + '">无匹配配件</td></tr>';
            return;
        }
        items.forEach(function (item) {
            els.body.appendChild(renderRow(item));
            if (state.expanded[item.id_item]) {
                els.body.appendChild(renderDetailRow(item));
            }
        });
        if (refreshMobileTableScrollState) {
            requestAnimationFrame(refreshMobileTableScrollState);
        }
    }

    function toggleExpand(idItem, rowEl) {
        var scrollY = window.scrollY;
        var wasOpen = !!state.expanded[idItem];
        state.expanded[idItem] = !wasOpen;
        if (wasOpen) {
            var next = rowEl.nextElementSibling;
            if (next && next.classList.contains('sc-detail-row')) next.remove();
            var btn = rowEl.querySelector('.sc-expand-btn');
            if (btn) {
                btn.textContent = '地点';
                btn.classList.remove('is-open');
                btn.setAttribute('aria-expanded', 'false');
            }
        } else {
            var item = state.items.find(function (x) {
                return String(x.id_item) === String(idItem);
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
        window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    }

    function updateMetaBar() {
        if (els.metaBar) {
            var typeHint = isSearchActive()
                ? '搜索全部类型'
                : '当前：' + typeLabel(state.type);
            var shown = state.items ? state.items.length : 0;
            var total = state.total || 0;
            var countHint = '共 ' + total + ' 条';
            if (shown > 0 && total > shown) {
                countHint = '共 ' + total + ' 条（当前显示 ' + shown + ' 条）';
            }
            els.metaBar.textContent =
                typeHint +
                ' · ' +
                countHint +
                (state.meta && state.meta.synced_at ? ' · 数据更新于 ' + formatSynced(state.meta.synced_at) : '');
        }
        if (els.footnote) {
            els.footnote.textContent =
                '数据来源：UEX 社区数据库' +
                (state.meta && state.meta.game_version ? ' · 游戏版本 ' + state.meta.game_version : '');
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

    async function loadList() {
        if (!els.body) return;
        if (state.listFetchController) state.listFetchController.abort();
        state.listFetchController = new AbortController();
        var signal = state.listFetchController.signal;
        els.body.innerHTML = '<tr><td colspan="' + COL_COUNT + '">加载中…</td></tr>';
        try {
            var res = await fetch(apiUrl('/api/sc/components?' + buildQuery()), { signal: signal });
            var data = await res.json();
            if (!res.ok || !data.ok) throw new Error((data && data.message) || '加载失败');
            hideGate();
            state.meta = data.meta;
            state.items = data.items || [];
            state.total = data.total || 0;
            syncBodyMode();
            updateSortHeaders();
            renderTable();
            updateMetaBar();
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            if (e.message && e.message.indexOf('未同步') >= 0) {
                showGate('配件数据尚未同步，请超级管理员在管理系统中执行「同步舰船配件」。');
            } else {
                showGate((e && e.message) || '加载失败');
            }
            els.body.innerHTML = '';
        }
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
            shell.classList.toggle('is-h-scrollable', canHorizontalScroll());
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

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', updateScrollableState);
        } else if (typeof mq.addListener === 'function') {
            mq.addListener(updateScrollableState);
        }
        window.addEventListener('resize', updateScrollableState);
        window.addEventListener('orientationchange', function () {
            setTimeout(updateScrollableState, 120);
        });

        updateScrollableState();
        return updateScrollableState;
    }

    var refreshMobileTableScrollState = null;

    async function init() {
        syncBodyMode();
        bindSortHeaders();
        refreshMobileTableScrollState = initMobileTableDragScroll();
        try {
            var typesRes = await fetch(apiUrl('/api/sc/components/types'));
            var typesData = await typesRes.json();
            if (typesData.ok && typesData.types) {
                state.types = typesData.types;
                renderTabs();
            }
        } catch (e) {
            /* ignore */
        }

        if (els.search) {
            els.search.addEventListener('input', function () {
                syncBodyMode();
                clearTimeout(state.searchTimer);
                state.searchTimer = setTimeout(loadList, 300);
            });
        }
        loadList();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
