/**
 * 首页节日倒计时（数据源经本站 /api/sc-festival-countdown 代理 SCToolBox）
 */
(function () {
    'use strict';

    var REFRESH_MS = 6 * 60 * 60 * 1000;
    var LOCAL_CACHE_KEY = 'ussScFestivalCountdownCache';
    var LOCAL_CACHE_MS = 6 * 60 * 60 * 1000;
    var LOCAL_CACHE_VERSION = 1;

    var gridEl = null;
    var disclaimerEl = null;
    var events = [];
    var tickTimer = null;
    var refreshTimer = null;

    function apiBase() {
        if (window.UssAuthApi && window.UssAuthApi.base) {
            return String(window.UssAuthApi.base).replace(/\/$/, '');
        }
        if (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) {
            return String(window.USS_AUTH_API_BASE).replace(/\/$/, '');
        }
        return 'http://127.0.0.1:3789';
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function remainingParts(targetMs) {
        var diff = Math.max(0, Number(targetMs) - Date.now());
        var totalSec = Math.floor(diff / 1000);
        var days = Math.floor(totalSec / 86400);
        var hours = Math.floor((totalSec % 86400) / 3600);
        var minutes = Math.floor((totalSec % 3600) / 60);
        var seconds = totalSec % 60;
        return { days: days, hours: hours, minutes: minutes, seconds: seconds, inProgress: diff <= 0 };
    }

    function readLocalCache(allowStale) {
        try {
            var raw = localStorage.getItem(LOCAL_CACHE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || o.v !== LOCAL_CACHE_VERSION || !Array.isArray(o.events)) return null;
            var age = Date.now() - new Date(o.fetchedAt || 0).getTime();
            if (!Number.isFinite(age) || age < 0) return null;
            if (age > LOCAL_CACHE_MS && !allowStale) return null;
            return o;
        } catch (e) {
            return null;
        }
    }

    function writeLocalCache(data) {
        if (!data || !Array.isArray(data.events)) return;
        try {
            localStorage.setItem(
                LOCAL_CACHE_KEY,
                JSON.stringify({
                    v: LOCAL_CACHE_VERSION,
                    source: data.source || '',
                    fetchedAt: data.fetchedAt || new Date().toISOString(),
                    disclaimer: data.disclaimer || '',
                    events: data.events,
                    stale: !!data.stale,
                })
            );
        } catch (e) {
            /* ignore */
        }
    }

    function renderLoading() {
        if (!gridEl) return;
        gridEl.innerHTML = '<div class="sc-festival-loading" role="status">正在加载节日倒计时…</div>';
    }

    function renderError(msg) {
        if (!gridEl) return;
        gridEl.innerHTML =
            '<div class="sc-festival-error" role="alert">' + String(msg || '暂时无法加载节日倒计时') + '</div>';
    }

    function updateCountdownTexts() {
        if (!gridEl) return;
        gridEl.querySelectorAll('[data-festival-target]').forEach(function (node) {
            var targetMs = Number(node.getAttribute('data-festival-target'));
            if (!Number.isFinite(targetMs)) return;
            var parts = remainingParts(targetMs);
            var daysEl = node.querySelector('.sc-festival-days');
            var clockEl = node.querySelector('.sc-festival-clock');
            var progressEl = node.querySelector('.sc-festival-progress');
            if (parts.inProgress) {
                if (daysEl) daysEl.hidden = true;
                if (clockEl) clockEl.hidden = true;
                if (progressEl) progressEl.hidden = false;
                return;
            }
            if (progressEl) progressEl.hidden = true;
            if (daysEl) {
                daysEl.hidden = false;
                daysEl.textContent = parts.days + '天';
                daysEl.classList.toggle('sc-festival-days--soon', parts.days < 30);
            }
            if (clockEl) {
                clockEl.hidden = false;
                clockEl.textContent =
                    pad2(parts.hours) + ':' + pad2(parts.minutes) + ':' + pad2(parts.seconds);
            }
        });
    }

    function renderCard(item) {
        var card = document.createElement('article');
        card.className = 'sc-festival-card';

        var iconWrap = document.createElement('div');
        iconWrap.className = 'sc-festival-icon-wrap';
        if (item.iconUrl) {
            var img = document.createElement('img');
            img.className = 'sc-festival-icon';
            img.src = item.iconUrl;
            img.alt = '';
            img.width = 38;
            img.height = 38;
            img.loading = 'lazy';
            img.decoding = 'async';
            iconWrap.appendChild(img);
        } else {
            iconWrap.className += ' sc-festival-icon-wrap--empty';
        }

        var body = document.createElement('div');
        body.className = 'sc-festival-card-body';

        var title = document.createElement('h3');
        title.className = 'sc-festival-card-title';
        title.textContent = item.nameZh || item.name || '—';

        var sub = document.createElement('p');
        sub.className = 'sc-festival-card-sub';
        sub.textContent = item.nameEn || '';

        var countdown = document.createElement('div');
        countdown.className = 'sc-festival-countdown';
        countdown.setAttribute('data-festival-target', String(item.targetMs || 0));

        var days = document.createElement('span');
        days.className = 'sc-festival-days';
        var clock = document.createElement('span');
        clock.className = 'sc-festival-clock';
        var progress = document.createElement('span');
        progress.className = 'sc-festival-progress';
        progress.textContent = '进行中';
        progress.hidden = true;

        countdown.appendChild(days);
        countdown.appendChild(clock);
        countdown.appendChild(progress);

        body.appendChild(title);
        if (item.nameEn) body.appendChild(sub);
        body.appendChild(countdown);

        card.appendChild(iconWrap);
        card.appendChild(body);
        return card;
    }

    function render(data) {
        if (!gridEl) return;
        var list = data && Array.isArray(data.events) ? data.events : [];
        if (!list.length) {
            renderError('未获取到节日数据');
            return;
        }

        events = list;
        gridEl.innerHTML = '';
        list.forEach(function (item) {
            gridEl.appendChild(renderCard(item));
        });
        updateCountdownTexts();

        if (disclaimerEl) {
            disclaimerEl.textContent = data.disclaimer || '';
            disclaimerEl.hidden = !data.disclaimer;
        }
    }

    async function fetchFromBackend() {
        var r = await fetch(apiBase() + '/api/sc-festival-countdown', { cache: 'no-store' });
        var data = {};
        try {
            data = await r.json();
        } catch (e) {
            data = {};
        }
        if (!r.ok || !data.ok) {
            throw new Error('节日倒计时加载失败');
        }
        writeLocalCache(data);
        return data;
    }

    async function loadFestivals(options) {
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
            renderError((err && err.message) || '获取节日倒计时失败');
        }
    }

    function scheduleRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(function () {
            loadFestivals({ forceNetwork: true, silent: true });
        }, REFRESH_MS);
    }

    function scheduleTick() {
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(updateCountdownTexts, 1000);
    }

    function init() {
        gridEl = document.getElementById('scFestivalGrid');
        disclaimerEl = document.getElementById('scFestivalDisclaimer');
        if (!gridEl) return;
        loadFestivals({ revalidate: true });
        scheduleRefresh();
        scheduleTick();
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            updateCountdownTexts();
            loadFestivals({ revalidate: true, silent: !!readLocalCache(false) });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
