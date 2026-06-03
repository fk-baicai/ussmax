/**
 * 首页启动编排辅助：资源提示 + 分阶段 idle 调度。
 * 优先级：缓存 UI → 会话/资料 → page-ready → 聊天 → idle 次要模块/视频。
 */
(function (global) {
    'use strict';

    function whenPageReady(fn) {
        if (typeof fn !== 'function') return;
        if (global.__ussPageReady) {
            fn();
            return;
        }
        global.addEventListener('uss:page-ready', fn, { once: true });
    }

    function scheduleIdle(fn, delayMs) {
        if (typeof fn !== 'function') return;
        var delay = delayMs == null ? 600 : Math.max(0, Number(delayMs) || 0);
        if (global.UssLazyMedia && typeof global.UssLazyMedia.runWhenIdle === 'function') {
            global.UssLazyMedia.runWhenIdle(fn, delay);
            return;
        }
        global.setTimeout(fn, delay);
    }

    function markPageReady() {
        if (global.__ussPageReady) return;
        global.__ussPageReady = true;
        global.dispatchEvent(new CustomEvent('uss:page-ready'));
    }

    function afterPageReadyIdle(fn, delayMs) {
        whenPageReady(function () {
            scheduleIdle(fn, delayMs);
        });
    }

    global.UssHomeBoot = {
        whenPageReady: whenPageReady,
        scheduleIdle: scheduleIdle,
        markPageReady: markPageReady,
        afterPageReadyIdle: afterPageReadyIdle,
    };
})(typeof window !== 'undefined' ? window : global);
