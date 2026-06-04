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

    /** 卡片底部「进入」右侧图标（viewBox 与用户提供的 SVG 一致，fill 用 currentColor 以适配深色主题与悬停） */
    var CHECKIN_HUB_ENTER_ICON_SVG =
        '<svg class="checkin-hub-card-enter-svg" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path fill="currentColor" d="M285.816972 1024L225.757072 963.9401l451.940099-451.9401L225.757072 60.0599 285.816972 0l512.425956 512L285.816972 1024z"/>' +
        '</svg>';

    function loadAuthSession() {
        if (window.UssAuthSessionSync && typeof window.UssAuthSessionSync.loadAuthSession === 'function') {
            return window.UssAuthSessionSync.loadAuthSession();
        }
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

    function clearAuthSession() {
        if (window.UssAuthSessionSync && typeof window.UssAuthSessionSync.clearAuthSession === 'function') {
            window.UssAuthSessionSync.clearAuthSession();
            return;
        }
        try {
            localStorage.removeItem(AUTH_SESSION_KEY);
            sessionStorage.removeItem(AUTH_SESSION_KEY);
        } catch (e) {
            /* ignore */
        }
    }

    function isLoggedIn() {
        var s = loadAuthSession();
        return !!(s && s.token);
    }

    function showSessionGate() {
        var gate = document.getElementById('checkinGateHint');
        var main = document.getElementById('checkinHubMain');
        setPanelHidden(gate, false);
        setPanelHidden(main, true);
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

    function defaultScheduleDefMinutes(summary) {
        var defDur = summary && summary.defaultDurationMinutes != null ? Number(summary.defaultDurationMinutes) : NaN;
        if (!Number.isFinite(defDur) || defDur < 1) defDur = 3;
        return defDur;
    }

    function findScheduleBranch(summary, branch) {
        if (!summary || !Array.isArray(summary.branches)) return null;
        var br = String(branch || '').trim();
        for (var i = 0; i < summary.branches.length; i++) {
            var b = summary.branches[i];
            if (b && String(b.branch || '').trim() === br) return b;
        }
        return null;
    }

    /** @returns {{ text: string, mod: string }} mod: ok | warn | off | muted */
    function branchScheduleStatusForCard(b, defDur) {
        if (!b) {
            return {
                text: '开放状态以北京时间为准，进入分部可查看详情。',
                mod: 'muted',
            };
        }
        if (b.mode === 'always') {
            return { text: '今日开放 · 全天可签', mod: 'ok' };
        }
        if (b.mode === 'closed') {
            return { text: '未开放签到', mod: 'off' };
        }
        if (b.mode === 'window') {
            if (b.allowed) {
                return { text: '今日开放 · 当前在签到时段', mod: 'ok' };
            }
            return { text: '今日开放 · 当前不在签到时段', mod: 'warn' };
        }
        var msg = b.message ? esc(String(b.message)) : '未开放签到';
        return { text: msg, mod: 'off' };
    }

    function renderHubCards(units, summary) {
        var host = document.getElementById('checkinHubCards');
        if (!host) return;
        var list = Array.isArray(units) && units.length ? units : FALLBACK_UNITS;
        var defDur = defaultScheduleDefMinutes(summary);
        host.innerHTML = list
            .map(function (u) {
                var signed = u.todaySigned ? '今日已签' : '今日未签';
                var br = u.branch != null ? String(u.branch) : '';
                if (!br) return '';
                var sb = findScheduleBranch(summary, br);
                var sched = branchScheduleStatusForCard(sb, defDur);
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
                    '<div class="checkin-hub-card-schedule checkin-hub-card-schedule--' +
                    sched.mod +
                    '" role="status">' +
                    sched.text +
                    '</div>' +
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
                    '<span class="checkin-hub-card-enter">' +
                    '<span class="checkin-hub-card-enter-lbl">进入</span>' +
                    CHECKIN_HUB_ENTER_ICON_SVG +
                    '</span>' +
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
            renderHubCards(FALLBACK_UNITS, null);
            return;
        }
        try {
            var data = await window.UssAuthApi.checkinHub(sess.token);
            var units = data && Array.isArray(data.units) ? data.units : [];
            var summary = data && data.checkinScheduleSummary ? data.checkinScheduleSummary : null;
            if (units.length) {
                renderHubCards(units, summary);
            } else {
                renderHubCards(FALLBACK_UNITS, summary);
                showHubError('服务端未返回分部列表，当前为默认入口（总积分可能不准）。');
            }
        } catch (e) {
            renderHubCards(FALLBACK_UNITS, null);
            if (window.UssAuthApi && window.UssAuthApi.isAuthSessionError(e)) {
                clearAuthSession();
                showSessionGate();
                showHubError(
                    window.UssAuthApi.authSessionExpiredMessage
                        ? window.UssAuthApi.authSessionExpiredMessage()
                        : '登录已过期，请重新登录'
                );
                return;
            }
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

        renderHubCards(FALLBACK_UNITS, null);

        try {
            var s = loadAuthSession();
            if (s && s.token && window.UssAuthApi) {
                await window.UssAuthApi.me(s.token);
            }
        } catch (e) {
            if (window.UssAuthApi && window.UssAuthApi.isAuthSessionError(e)) {
                clearAuthSession();
                showSessionGate();
                showHubError(window.UssAuthApi.authSessionExpiredMessage());
                return;
            }
        }

        await refreshHubFromApi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
