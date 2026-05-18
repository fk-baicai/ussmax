/**
 * 顶栏下拉菜单：点击「积分系统」展开，再点一次收起；点页面其它区域也会收起。
 */
(function () {
    if (typeof document === 'undefined') return;

    function closeAll(except) {
        document.querySelectorAll('.nav-dropdown.is-open').forEach(function (el) {
            if (except && el === except) return;
            el.classList.remove('is-open');
            var btn = el.querySelector('.nav-dropdown-toggle');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    document.querySelectorAll('.nav-dropdown').forEach(function (wrap) {
        var btn = wrap.querySelector('.nav-dropdown-toggle');
        if (!btn) return;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var isOpen = wrap.classList.contains('is-open');
            closeAll(null);
            if (!isOpen) {
                wrap.classList.add('is-open');
                btn.setAttribute('aria-expanded', 'true');
            }
        });
    });

    document.addEventListener('click', function () {
        closeAll(null);
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAll(null);
    });
})();
