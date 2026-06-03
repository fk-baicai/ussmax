/**
 * 顶栏「工具」菜单：始终可见
 */
(function () {
    if (typeof document === 'undefined') return;

    var AUTH_KEY = 'ussHangzhouAuthSession';

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

    function syncToolsNav() {
        var wrap = document.getElementById('navToolsWrap');
        if (wrap) wrap.hidden = false;

    }

    syncToolsNav();

    window.addEventListener('storage', syncToolsNav);

    try {
        var obs = new MutationObserver(syncToolsNav);
        obs.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });
    } catch (e) {
        /* ignore */
    }

    window.UssNavTools = { refresh: syncToolsNav, isLoggedIn: isLoggedIn };
})();
