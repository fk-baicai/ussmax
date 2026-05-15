(function () {
    'use strict';

    /**
     * 签到中心：先画三张分部卡片，再拉 /api/checkin/hub 更新总积分等。
     */
    var AUTH_SESSION_KEY = 'ussHangzhouAuthSession';

    var FALLBACK_UNITS = [
        { branch: 'hq', branchLabel: '总部', points: 0, streak: 0, todaySigned: false },
        { branch: 'squad1', branchLabel: '一中队', points: 0, streak: 0, todaySigned: false },
        { branch: 'uss', branchLabel: 'USS创伤舰队', points: 0, streak: 0, todaySigned: false },
        { branch: 'ussprod', branchLabel: 'USS生产队', points: 0, streak: 0, todaySigned: false },
    ];

    function loadAuthSession() {
        try {
            var raw = sessionStorage.getItem(AUTH_SESSION_KEY);
            if (raw) return JSON.parse(raw);
            raw = localStorage.getItem(AUTH_SESSION_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            return null;
        }
        return null;
    }

    function isLoggedIn() {
        var s = loadAuthSession();
        return !!(s && s.token);
    }

    function isLikelyNetworkError(msg) {
        if (!msg || typeof msg !== 'string') return false;
        var s = msg.toLowerCase();
        return (
            s.indexOf('fetch') !== -1 ||
            s.indexOf('failed') !== -1 ||
            s.indexOf('networkerror') !== -1 ||
            s.indexOf('load failed') !== -1
        );
    }

    function esc(t) {
        return String(t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function setPanelHidden(el, hidden) {
        if (!el) return;
        if (hidden) {
            el.setAttribute('hidden', '');
            el.style.display = 'none';
        } else {
            el.removeAttribute('hidden');
            el.style.display = 'block';
        }
    }

    /** 分部页链接：#unit=，避免 ? 参数在少数环境下丢失 */
    function unitPageHref(branch) {
        var b = String(branch || '').trim();
        if (!b) return 'checkin-unit.html';
        try {
            var u = new URL('checkin-unit.html', window.location.href);
            u.search = '';
            u.hash = 'unit=' + encodeURIComponent(b);
            return u.href;
        } catch (e) {
            return 'checkin-unit.html#unit=' + encodeURIComponent(b);
        }
    }

    function renderHubCards(units) {
        var host = document.getElementById('checkinHubCards');
        if (!host) return;
        var list = Array.isArray(units) && units.length ? units : FALLBACK_UNITS;
        host.innerHTML = list
            .map(function (u) {
                var signed = u.todaySigned ? '今日已签' : '今日未签';
                var br = u.branch != null ? String(u.branch) : '';
                if (!br) return '';
                return (
                    '<a class="checkin-hub-card" data-branch="' +
                    esc(br) +
                    '" href="' +
                    unitPageHref(br) +
                    '">' +
                    '<div class="checkin-hub-card-top">' +
                    '<span class="checkin-hub-card-title">' +
                    esc(u.branchLabel || br) +
                    '</span>' +
                    '<span class="checkin-hub-card-badge' +
                    (u.todaySigned ? ' checkin-hub-card-badge--ok' : '') +
                    '">' +
                    esc(signed) +
                    '</span>' +
                    '</div>' +
                    '<span class="checkin-hub-card-desc">月历 · 今日签 · 成员排行</span>' +
                    '<div class="checkin-hub-card-metrics">' +
                    '<div class="checkin-hub-card-metric">' +
                    '<span class="checkin-hub-card-metric-val">' +
                    (u.points != null ? u.points : 0) +
                    '</span>' +
                    '<span class="checkin-hub-card-metric-lbl">总积分</span>' +
                    '</div>' +
                    '<div class="checkin-hub-card-metric">' +
                    '<span class="checkin-hub-card-metric-val">' +
                    (u.streak != null ? u.streak : 0) +
                    '</span>' +
                    '<span class="checkin-hub-card-metric-lbl">连续天数</span>' +
                    '</div>' +
                    '</div>' +
                    '<span class="checkin-hub-card-enter">进入分部 →</span>' +
                    '</a>'
                );
            })
            .filter(Boolean)
            .join('');
    }

    function showHubError(message) {
        var errEl = document.getElementById('checkinHubError');
        if (!errEl) return;
        errEl.textContent = message || '';
        if (message) {
            errEl.removeAttribute('hidden');
            errEl.style.display = 'block';
        } else {
            errEl.setAttribute('hidden', '');
            errEl.style.display = 'none';
        }
    }

    async function refreshHubFromApi() {
        showHubError('');
        if (!isLoggedIn()) return;
        var sess = loadAuthSession();
        if (!sess || !sess.token) return;
        if (!window.UssAuthApi) {
            showHubError('未加载登录模块，请刷新。');
            return;
        }
        try {
            var data = await window.UssAuthApi.checkinHub(sess.token);
            var units = data && Array.isArray(data.units) ? data.units : [];
            if (units.length) {
                renderHubCards(units);
            } else {
                renderHubCards(FALLBACK_UNITS);
                showHubError('服务端未返回分部列表，当前为默认入口（总积分可能不准）。');
            }
        } catch (e) {
            renderHubCards(FALLBACK_UNITS);
            var msg = isLikelyNetworkError(e && e.message)
                ? '连不上签到服务（请确认服务已开、API 地址正确）。已显示默认分部入口。'
                : (e && e.message) || '加载失败，已显示默认分部入口。';
            showHubError(msg);
        }
    }

    async function init() {
        var gate = document.getElementById('checkinGateHint');
        var main = document.getElementById('checkinHubMain');

        if (!isLoggedIn()) {
            setPanelHidden(gate, false);
            setPanelHidden(main, true);
            return;
        }

        setPanelHidden(gate, true);
        setPanelHidden(main, false);

        renderHubCards(FALLBACK_UNITS);

        try {
            var s = loadAuthSession();
            if (s && s.token && window.UssAuthApi) {
                await window.UssAuthApi.me(s.token);
            }
        } catch (e) {
            /* 会话校验失败仍允许尝试签到接口；卡片已可见 */
        }

        await refreshHubFromApi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
