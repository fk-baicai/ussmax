/**
 * 首页 RSI 服务器状态展示（Platform / PU / AC）
 * 仅从后端缓存读取，不访问 RSI，不使用 localStorage。
 */
(function () {
    'use strict';

    var REFRESH_MS = 5 * 60 * 1000;

    var gridEl = null;
    var updatedEl = null;
    var timer = null;
    var lastData = null;

    function apiBase() {
        if (window.UssAuthApi && window.UssAuthApi.base) {
            return String(window.UssAuthApi.base).replace(/\/$/, '');
        }
        if (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) {
            return String(window.USS_AUTH_API_BASE).replace(/\/$/, '');
        }
        return 'http://127.0.0.1:3789';
    }

    function apiBaseCandidates() {
        var seen = {};
        var list = [];
        function add(url) {
            var u = String(url || '').replace(/\/$/, '');
            if (!u || seen[u]) return;
            seen[u] = true;
            list.push(u);
        }
        add(apiBase());
        var origin = window.location && window.location.origin;
        var host = window.location && window.location.hostname;
        if (origin && /^https?:\/\//i.test(origin)) add(origin);
        if (host === 'localhost' || host === '[::1]' || host === '::1') add('http://localhost:3789');
        add('http://127.0.0.1:3789');
        return list;
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
        var ageMs = Number(data.cacheAgeMs) || 0;
        var showStale = !!data.stale && ageMs > 30 * 60 * 1000;
        if (showStale || ageMs > 6 * 60 * 60 * 1000) {
            when += ' · 待后端更新';
        }
        el.textContent = when ? '更新时间：' + when : '';
        el.hidden = !when;
        el.classList.toggle('is-stale', showStale || ageMs > 6 * 60 * 60 * 1000);
    }

    function renderLoading() {
        if (!gridEl) return;
        gridEl.innerHTML = '<div class="rsi-status-loading" role="status">正在加载服务器状态…</div>';
        if (updatedEl) updatedEl.hidden = true;
    }

    function formatFetchError(err) {
        var msg = (err && err.message) || '';
        if (!msg || msg === 'Failed to fetch' || (err && err.name === 'TypeError')) {
            return '无法连接后端 API，请确认：① backend 已启动（端口 3789）；② 使用 node frontend/dev-server.js 或 本地测试启动.bat 打开前端（不要用 npx serve）';
        }
        return msg;
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
        lastData = data;
        renderUpdated(data);
    }

    async function fetchFromBackend() {
        var lastErr = null;
        var bases = apiBaseCandidates();
        for (var i = 0; i < bases.length; i++) {
            var base = bases[i];
            try {
                var url = base + '/api/rsi-server-status?_=' + Date.now();
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
                        typeof UssApiError !== 'undefined'
                            ? UssApiError.formatUserError(code)
                            : '错误代码：' + code
                    );
                }
                return data;
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr || new Error('Failed to fetch');
    }

    async function loadStatus(options) {
        if (!gridEl) return;
        var opts = options || {};
        if (!opts.silent) renderLoading();

        try {
            var data = await fetchFromBackend();
            render(data);
        } catch (err) {
            if (opts.silent && lastData) return;
            renderError(formatFetchError(err));
        }
    }

    function scheduleRefresh() {
        if (timer) clearInterval(timer);
        timer = setInterval(function () {
            loadStatus({ silent: true });
        }, REFRESH_MS);
    }

    function init() {
        gridEl = document.getElementById('rsiServerStatusGrid');
        if (!gridEl) return;
        ensureUpdatedEl();
        loadStatus();
        scheduleRefresh();
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            loadStatus({ silent: true });
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
