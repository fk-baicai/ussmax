/**
 * 首页资源加载优先级：个人信息 > 可见区图片 > 视频/次要接口。
 * - observe(img): 进入视口再加载 data-src
 * - loadNow(img): 立即加载 data-src
 * - runWhenIdle(fn): requestIdleCallback / setTimeout 降级
 */
(function (global) {
    'use strict';

    var DEFAULT_ROOT_MARGIN = '160px 0px';
    var observerCache = new Map();

    function runWhenIdle(fn, timeoutMs) {
        if (typeof fn !== 'function') return;
        var delay = timeoutMs == null ? 600 : Math.max(0, Number(timeoutMs) || 0);
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(
                function () {
                    fn();
                },
                { timeout: Math.max(delay, 1200) }
            );
            return;
        }
        global.setTimeout(fn, delay);
    }

    function runAfterInteractive(fn) {
        if (typeof fn !== 'function') return;
        if (global.document && global.document.readyState === 'complete') {
            runWhenIdle(fn, 300);
            return;
        }
        global.addEventListener(
            'load',
            function onLoad() {
                global.removeEventListener('load', onLoad);
                runWhenIdle(fn, 300);
            },
            { once: true }
        );
    }

    function resolveSrc(img) {
        if (!img) return '';
        var ds = img.dataset && img.dataset.src;
        return ds ? String(ds).trim() : '';
    }

    function loadNow(img) {
        if (!img) return;
        var src = resolveSrc(img);
        if (!src) return;
        if (img.dataset.loadedSrc === src) return;
        img.src = src;
        img.dataset.loadedSrc = src;
        delete img.dataset.src;
        unobserve(img);
    }

    function unobserve(img) {
        if (!img || !img.__ussLazyObs) return;
        try {
            img.__ussLazyObs.unobserve(img);
        } catch (e) {
            /* ignore */
        }
        delete img.__ussLazyObs;
    }

    function getObserver(root, rootMargin) {
        var key = root ? 'r:' + (root.id || root.className || 'el') : 'v';
        key += ':' + (rootMargin || DEFAULT_ROOT_MARGIN);
        if (observerCache.has(key)) return observerCache.get(key);

        var obs = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    loadNow(entry.target);
                });
            },
            {
                root: root || null,
                rootMargin: rootMargin || DEFAULT_ROOT_MARGIN,
                threshold: 0.01,
            }
        );
        observerCache.set(key, obs);
        return obs;
    }

    function observe(img, options) {
        if (!img || typeof IntersectionObserver !== 'function') {
            loadNow(img);
            return;
        }
        var src = resolveSrc(img);
        if (!src) return;
        if (img.dataset.loadedSrc === src) return;

        var opts = options || {};
        if (opts.eager) {
            loadNow(img);
            return;
        }

        var root = opts.root || null;
        var obs = getObserver(root, opts.rootMargin);
        unobserve(img);
        img.__ussLazyObs = obs;
        obs.observe(img);
    }

    function observeAll(selector, options, rootEl) {
        var scope = rootEl || global.document;
        if (!scope || !scope.querySelectorAll) return;
        scope.querySelectorAll(selector).forEach(function (img) {
            observe(img, options);
        });
    }

    global.UssLazyMedia = {
        runWhenIdle: runWhenIdle,
        runAfterInteractive: runAfterInteractive,
        observe: observe,
        observeAll: observeAll,
        loadNow: loadNow,
        unobserve: unobserve,
    };
})(typeof window !== 'undefined' ? window : global);
