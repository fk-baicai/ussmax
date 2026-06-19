/**
 * 顶栏主菜单：点击展开全宽 Mega 子菜单（RSI 风格面板）；Esc / 点外部关闭。
 */
(function () {
    if (typeof document === 'undefined') return;

    var header = document.querySelector('.site-header');

    function syncMegaContentLeft() {
        if (!header) return;
        var toggle = header.querySelector('.nav-links .nav-dropdown:first-child .nav-dropdown-toggle');
        if (!toggle) return;

        var headerLeft = header.getBoundingClientRect().left;
        var textNode = null;
        var i;
        for (i = 0; i < toggle.childNodes.length; i++) {
            var node = toggle.childNodes[i];
            if (node.nodeType === 3 && String(node.textContent).trim()) {
                textNode = node;
                break;
            }
        }

        var left;
        if (textNode) {
            var text = textNode.textContent || '';
            var start = 0;
            while (start < text.length && /\s/.test(text.charAt(start))) start += 1;
            var range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, Math.min(start + 1, text.length));
            left = range.getBoundingClientRect().left - headerLeft;
        } else {
            var cs = window.getComputedStyle(toggle);
            left =
                toggle.getBoundingClientRect().left -
                headerLeft +
                parseFloat(cs.paddingLeft) +
                parseFloat(cs.borderLeftWidth);
        }

        header.style.setProperty('--nav-mega-content-left', Math.round(left) + 'px');
    }

    function closeAll() {
        document.querySelectorAll('.nav-dropdown.is-open').forEach(function (el) {
            el.classList.remove('is-open');
            var btn = el.querySelector('.nav-dropdown-toggle');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.nav-mega-panel').forEach(function (panel) {
            panel.hidden = true;
        });
        if (header) header.classList.remove('is-mega-open');
    }

    function openMega(wrap, panelId) {
        var panel = document.getElementById(panelId);
        if (!panel) return;
        wrap.classList.add('is-open');
        var btn = wrap.querySelector('.nav-dropdown-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        syncMegaContentLeft();
        panel.hidden = false;
        if (header) header.classList.add('is-mega-open');
    }

    document.querySelectorAll('.nav-dropdown').forEach(function (wrap) {
        var btn = wrap.querySelector('.nav-dropdown-toggle');
        if (!btn) return;
        var panelId = btn.getAttribute('data-mega-target') || btn.getAttribute('aria-controls');
        if (!panelId) return;

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var isOpen = wrap.classList.contains('is-open');
            closeAll();
            if (!isOpen) openMega(wrap, panelId);
        });
    });

    document.querySelectorAll('.nav-mega-panel').forEach(function (panel) {
        panel.addEventListener('click', function (e) {
            e.stopPropagation();
        });
    });

    document.addEventListener('click', function () {
        closeAll();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAll();
    });

    syncMegaContentLeft();
    window.addEventListener('resize', syncMegaContentLeft);
    window.addEventListener('load', syncMegaContentLeft);
})();
