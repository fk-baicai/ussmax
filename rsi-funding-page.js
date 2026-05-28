/**
 * 资金统计页 — 需登录（与工具菜单一致）
 */
(function () {
    if (typeof document === 'undefined') return;

    var AUTH_KEY = 'ussHangzhouAuthSession';
    var gateEl = document.getElementById('rsiFundingGate');
    var mainEl = document.getElementById('rsiFundingMain');

    function loadSession() {
        try {
            var raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function isLoggedIn() {
        var sess = loadSession();
        return !!(sess && sess.token);
    }

    function sync() {
        var ok = isLoggedIn();
        if (gateEl) gateEl.hidden = ok;
        if (mainEl) mainEl.hidden = !ok;
    }

    sync();
    window.addEventListener('storage', sync);
    try {
        var obs = new MutationObserver(sync);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {
        /* ignore */
    }
})();
