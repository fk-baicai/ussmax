/**
 * 首页 RSI 服务器状态展示（Platform / PU / AC）
 *
 * 每次访问强制请求后端 ?fresh=1；localStorage 仅作网络失败时的离线回退。
 */
(function () {
    'use strict';

    var REFRESH_MS = 5 * 60 * 1000;
    var LOCAL_CACHE_MS = 30 * 60 * 1000;
    var LOCAL_CACHE_KEY = 'ussRsiServerStatusCache';
    var LOCAL_CACHE_VERSION = 5;
    var RSI_STATUS_URL = 'https://status.robertsspaceindustries.com/';

    var gridEl = null;
    var updatedEl = null;
    var timer = null;

    function apiBase() {
        if (window.UssAuthApi && window.UssAuthApi.base) {
            return String(window.UssAuthApi.base).replace(/\/$/, '');
        }
        if (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) {
            return String(window.USS_AUTH_API_BASE).replace(/\/$/, '');
        }
        return 'http://127.0.0.1:3789';
    }

    function formatFetchedAt(iso) {
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString('zh-CN', {
                hour12: false,
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch (e) {
            return '';
        }
    }

    function componentsAllUnknown(components) {
        return (
            Array.isArray(components) &&
            components.length > 0 &&
            components.every(function (row) {
                return !row || row.status === 'unknown';
            })
        );
    }

    function readLocalCache(allowStale) {
        try {
            var raw = localStorage.getItem(LOCAL_CACHE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || o.v !== LOCAL_CACHE_VERSION || !o.fetchedAt || !Array.isArray(o.components)) return null;
            if (componentsAllUnknown(o.components)) return null;
            var age = Date.now() - new Date(o.fetchedAt).getTime();
            if (!Number.isFinite(age) || age < 0) return null;
            var fresh = age <= LOCAL_CACHE_MS;
            if (!fresh && !allowStale) return null;
            return {
                ok: true,
                source: o.source || RSI_STATUS_URL,
                fetchedAt: o.fetchedAt,
                components: o.components,
                cached: true,
                stale: !fresh || !!o.stale,
                cacheLayer: 'local',
            };
        } catch (e) {
            return null;
        }
    }

    function writeLocalCache(data) {
        if (!data || !Array.isArray(data.components)) return;
        try {
            localStorage.setItem(
                LOCAL_CACHE_KEY,
                JSON.stringify({
                    v: LOCAL_CACHE_VERSION,
                    source: data.source || RSI_STATUS_URL,
                    fetchedAt: data.fetchedAt || new Date().toISOString(),
                    components: data.components,
                    stale: !!data.stale,
                })
            );
        } catch (e) {
            /* quota / private mode */
        }
    }

    function ensureUpdatedEl() {
        if (updatedEl) return updatedEl;
        var wrap = gridEl && gridEl.closest('.rsi-status-wrap');
        if (!wrap) return null;
        updatedEl = document.getElementById('rsiServerStatusUpdated');
        if (!updatedEl) {
            updatedEl = document.createElement('p');
            updatedEl.id = 'rsiServerStatusUpdated';
            updatedEl.className = 'rsi-funding-updated';
            updatedEl.hidden = true;
            wrap.appendChild(updatedEl);
        }
        return updatedEl;
    }

    function renderUpdated(data) {
        var el = ensureUpdatedEl();
        if (!el || !data || !data.fetchedAt) {
            if (el) el.hidden = true;
            return;
        }
        var when = formatFetchedAt(data.fetchedAt);
        if (data.stale) {
            if (data.networkDisabled) when += ' · 后端未拉取 RSI';
            else if (data.refreshFailed) when += ' · 同步失败，显示缓存';
            else when += ' · 缓存';
        }
        el.textContent = when ? '更新时间：' + when : '';
        el.hidden = !when;
    }

    function renderSyncing() {
        var el = ensureUpdatedEl();
        if (!el) return;
        el.textContent = '正在同步最新数据…';
        el.hidden = false;
    }

    function renderLoading() {
        if (!gridEl) return;
        gridEl.innerHTML = '<div class="rsi-status-loading" role="status">正在获取 RSI 服务器状态…</div>';
        if (updatedEl) updatedEl.hidden = true;
    }

    function renderError(msg) {
        if (!gridEl) return;
        gridEl.innerHTML =
            '<div class="rsi-status-error" role="alert">' +
            String(msg || '暂时无法获取状态，请稍后重试') +
            '</div>';
    }

    function renderCard(row) {
        var tone = row.tone || 'gray';
        var card = document.createElement('article');
        card.className = 'rsi-status-card rsi-status-card--' + tone;
        card.setAttribute('data-status', row.status || 'unknown');

        var head = document.createElement('div');
        head.className = 'rsi-status-card-head';

        var title = document.createElement('h3');
        title.className = 'rsi-status-card-title';
        title.textContent = row.label || row.name || '—';

        var sub = document.createElement('p');
        sub.className = 'rsi-status-card-sub';
        sub.textContent = row.labelEn || row.name || '';

        head.appendChild(title);
        head.appendChild(sub);

        var badge = document.createElement('div');
        badge.className = 'rsi-status-badge rsi-status-badge--' + tone;

        var dot = document.createElement('span');
        dot.className = 'rsi-status-dot';
        dot.setAttribute('aria-hidden', 'true');

        var label = document.createElement('span');
        label.className = 'rsi-status-label';
        label.textContent = row.statusLabelZh || row.statusLabel || '—';

        badge.appendChild(dot);
        badge.appendChild(label);

        card.appendChild(head);
        card.appendChild(badge);
        return card;
    }

    function render(data) {
        if (!gridEl) return;
        var list = data && Array.isArray(data.components) ? data.components : [];
        if (!list.length) {
            renderError('未解析到服务器状态');
            return;
        }

        gridEl.innerHTML = '';
        list.forEach(function (row) {
            gridEl.appendChild(renderCard(row));
        });
        renderUpdated(data);
    }

    function shouldFetchFromBackend(opts) {
        return !!(opts.forceNetwork || opts.revalidate || opts.force);
    }

    async function fetchFromBackend() {
        var url = apiBase() + '/api/rsi-server-status?fresh=1&_=' + Date.now();
        var r = await fetch(url, {
            cache: 'no-store',
            headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
        });
        var data = {};
        try {
            data = await r.json();
        } catch (e) {
            data = {};
        }
        if (!r.ok || !data.ok) {
            var code = (data && data.code) || 'RSI_001';
            throw new Error(
                typeof UssApiError !== 'undefined' ? UssApiError.formatUserError(code) : '错误代码：' + code
            );
        }
        writeLocalCache(data);
        return data;
    }

    async function loadStatus(options) {
        if (!gridEl) return;
        var opts = options || {};
        var localFallback = readLocalCache(true);
        var mustFetch = shouldFetchFromBackend(opts) || !localFallback;

        if (!opts.silent) {
            if (mustFetch) {
                if (!localFallback) renderLoading();
                renderSyncing();
            } else if (localFallback) {
                render(localFallback);
            } else {
                renderLoading();
            }
        }

        if (!mustFetch) return;

        try {
            var data = await fetchFromBackend();
            render(data);
        } catch (err) {
            if (localFallback) {
                render(localFallback);
                return;
            }
            renderError((err && err.message) || '获取状态失败');
        }
    }

    function scheduleRefresh() {
        if (timer) clearInterval(timer);
        timer = setInterval(function () {
            loadStatus({ forceNetwork: true, revalidate: true, silent: true });
        }, REFRESH_MS);
    }

    function init() {
        gridEl = document.getElementById('rsiServerStatusGrid');
        if (!gridEl) return;
        ensureUpdatedEl();
        loadStatus({ forceNetwork: true, revalidate: true });
        scheduleRefresh();
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            loadStatus({ forceNetwork: true, revalidate: true, silent: !!readLocalCache(true) });
        });
    }

    function scheduleInit() {
        if (window.__ussPageReady) {
            init();
            return;
        }
        window.addEventListener(
            'uss:page-ready',
            function onReady() {
                window.removeEventListener('uss:page-ready', onReady);
                init();
            },
            { once: true }
        );
        setTimeout(init, 0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleInit);
    } else {
        scheduleInit();
    }
})();
