(function () {
    var form = document.getElementById('heroScSearchForm');
    var input = document.getElementById('heroScSearchInput');
    var suggest = document.getElementById('heroScSearchSuggest');
    if (!form || !input) return;

    var API_BASE = (
        (typeof window !== 'undefined' &&
            (window.USS_SC_COMPONENTS_API_BASE || window.USS_AUTH_API_BASE || window.USS_REGISTER_API_BASE)) ||
        ''
    ).replace(/\/$/, '');

    var suggestTimer = null;
    var suggestController = null;
    var suggestItems = [];

    function apiUrl(path) {
        return API_BASE + path;
    }

    function shipComponentsListPath() {
        var path = window.location.pathname || '';
        if (/\/ship-components(?:\.html)?$/i.test(path)) return path.replace(/\/[^/]*$/, '/ship-components');
        if (/\.html$/i.test(path)) return path.replace(/\/[^/]*$/, '/ship-components.html');
        return '/ship-components';
    }

    function componentDetailPath() {
        var list = shipComponentsListPath();
        return list.replace(/ship-components(\.html)?$/i, function (_m, ext) {
            return 'ship-component-detail' + (ext || '');
        });
    }

    function inferGroupFromType(typeKey) {
        var key = String(typeKey || '').trim();
        if (!key) return '';
        if (key === 'ship_weapon' || key === 'ship_turret' || key === 'ship_missile' || key === 'missile_rack') return 'weapon';
        if (key === 'mining_laser' || key === 'ship_module') return 'mining';
        if (key === 'cooling' || key === 'power' || key === 'shield' || key === 'quantum' || key === 'jump' || key === 'radar') {
            return 'component';
        }
        return '';
    }

    function componentDetailUrl(item) {
        if (!item) return componentDetailPath();
        var id = item.id_item != null && item.id_item !== '' ? String(item.id_item) : String(item.uuid || '');
        if (!id) return componentDetailPath();
        try {
            var url = new URL(componentDetailPath(), window.location.href);
            url.searchParams.set('id', id);
            if (item.type) url.searchParams.set('type', item.type);
            var group = item.group || inferGroupFromType(item.type);
            if (group) url.searchParams.set('group', group);
            return url.pathname + url.search;
        } catch (e) {
            return componentDetailPath() + '?id=' + encodeURIComponent(id);
        }
    }

    function listSearchUrl(query) {
        try {
            var url = new URL(shipComponentsListPath(), window.location.href);
            if (query) url.searchParams.set('q', query);
            return url.pathname + url.search;
        } catch (e) {
            return shipComponentsListPath() + (query ? '?q=' + encodeURIComponent(query) : '');
        }
    }

    function displayItemName(item) {
        if (!item) return '—';
        var zh = String(item.name_zh || '').trim();
        var en = String(item.name_en || '').trim();
        if (zh && en && zh !== en) return zh + ' (' + en + ')';
        return zh || en || '—';
    }

    function typeLabel(item) {
        return (item && (item.type_label_zh || item.type_label)) || (item && item.type) || '';
    }

    function setSuggestOpen(open) {
        input.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!suggest) return;
        if (open && suggestItems.length) {
            suggest.hidden = false;
        } else {
            suggest.hidden = true;
            suggest.innerHTML = '';
        }
    }

    function hideSuggest() {
        suggestItems = [];
        setSuggestOpen(false);
    }

    function renderSuggest() {
        if (!suggest) return;
        suggest.innerHTML = '';
        if (!suggestItems.length) {
            setSuggestOpen(false);
            return;
        }
        var label = document.createElement('p');
        label.className = 'hero-sc-search-suggest-label';
        label.textContent = '匹配结果';
        suggest.appendChild(label);
        suggestItems.forEach(function (item) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hero-sc-search-suggest-item';
            btn.setAttribute('role', 'option');
            var name = document.createElement('span');
            name.className = 'hero-sc-search-suggest-name';
            name.textContent = displayItemName(item);
            var type = document.createElement('span');
            type.className = 'hero-sc-search-suggest-type';
            type.textContent = typeLabel(item);
            btn.appendChild(name);
            btn.appendChild(type);
            btn.addEventListener('mousedown', function (e) {
                e.preventDefault();
            });
            btn.addEventListener('click', function () {
                window.location.href = componentDetailUrl(item);
            });
            suggest.appendChild(btn);
        });
        setSuggestOpen(true);
    }

    async function loadSuggest() {
        var q = String(input.value || '').trim();
        if (!q) {
            hideSuggest();
            return;
        }
        if (suggestController) suggestController.abort();
        suggestController = new AbortController();
        var signal = suggestController.signal;
        try {
            var params = new URLSearchParams();
            params.set('q', q);
            params.set('limit', '12');
            var res = await fetch(apiUrl('/api/sc/components/suggest?' + params.toString()), { signal: signal });
            var data = await res.json();
            if (!res.ok || !data.ok) return;
            suggestItems = data.items || [];
            renderSuggest();
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            hideSuggest();
        } finally {
            suggestController = null;
        }
    }

    function scheduleSuggest() {
        clearTimeout(suggestTimer);
        suggestTimer = setTimeout(loadSuggest, 180);
    }

    form.setAttribute('action', shipComponentsListPath());

    form.addEventListener('submit', function (e) {
        var q = String(input.value || '').trim();
        if (!q) {
            e.preventDefault();
            input.focus();
            return;
        }
        e.preventDefault();
        hideSuggest();
        window.location.href = listSearchUrl(q);
    });

    input.addEventListener('input', scheduleSuggest);

    input.addEventListener('focus', function () {
        if (suggestItems.length) setSuggestOpen(true);
        else if (String(input.value || '').trim()) scheduleSuggest();
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') hideSuggest();
    });

    document.addEventListener('mousedown', function (e) {
        if (!form.contains(e.target)) hideSuggest();
    });
})();
