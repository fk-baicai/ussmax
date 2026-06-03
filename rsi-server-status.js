/**
 * 首页 RSI 服务器状态展示（Platform / PU / AC）
 *
 * 经本站 /api/rsi-server-status 读取；前端 localStorage 5 分钟缓存，降低后端压力。
 */
(function () {
    'use strict';

    var REFRESH_MS = 5 * 60 * 1000;
    var LOCAL_CACHE_MS = 5 * 60 * 1000;
    var LOCAL_CACHE_KEY = 'ussRsiServerStatusCache';
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
            return d.toLocaleString('zh-CN', { hour12: false });
        } catch (e) {
            return '';
        }
    }

    function readLocalCache(allowStale) {
        try {
            var raw = localStorage.getItem(LOCAL_CACHE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || !o.fetchedAt || !Array.isArray(o.components)) return null;
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
        if (updatedEl) updatedEl.hidden = true;
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

        if (updatedEl && data.fetchedAt) {
            var when = formatFetchedAt(data.fetchedAt);
            updatedEl.textContent = when || '';
            updatedEl.hidden = !when;
        }
    }

    async function fetchFromBackend() {
        var r = await fetch(apiBase() + '/api/rsi-server-status');
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
        var localFresh = readLocalCache(false);
        var localStale = readLocalCache(true);
        var localAny = localFresh || localStale;
        var skipNetwork = localFresh && !opts.forceNetwork && !opts.revalidate;

        if (localAny && !opts.silent) {
            render(localAny);
        } else if (!localAny && !opts.silent) {
            renderLoading();
        }

        if (skipNetwork) return;

        try {
            var data = await fetchFromBackend();
            render(data);
        } catch (err) {
            if (localAny) {
                render(localAny);
                return;
            }
            renderError((err && err.message) || '获取状态失败');
        }
    }

    function scheduleRefresh() {
        if (timer) clearInterval(timer);
        timer = setInterval(function () {
            loadStatus({ forceNetwork: true, silent: true });
        }, REFRESH_MS);
    }

    function init() {
        gridEl = document.getElementById('rsiServerStatusGrid');
        updatedEl = document.getElementById('rsiServerStatusUpdated');
        if (!gridEl) return;
        loadStatus({ revalidate: true });
        scheduleRefresh();
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            loadStatus({ revalidate: true, silent: !!readLocalCache(false) });
        });
    }

    function scheduleInit() {
        var start = function () {
            if (window.UssLazyMedia && typeof window.UssLazyMedia.runWhenIdle === 'function') {
                window.UssLazyMedia.runWhenIdle(init, 1200);
            } else {
                setTimeout(init, 1200);
            }
        };
        if (window.__ussPageReady) {
            start();
            return;
        }
        window.addEventListener(
            'uss:page-ready',
            function onReady() {
                window.removeEventListener('uss:page-ready', onReady);
                start();
            },
            { once: true }
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleInit);
    } else {
        scheduleInit();
    }
})();
