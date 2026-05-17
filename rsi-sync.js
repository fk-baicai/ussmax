/**
 * 浏览器抓取 RSI 后提交本站后端保存（不经过服务器访问 RSI HTML）。
 */
(function (global) {
    'use strict';

    var SYNC_INTERVAL_MS = 5 * 60 * 1000;

    function throttleKey(bindingId) {
        return 'ussRsiBrowserSyncAt:' + String(bindingId || '').toLowerCase();
    }

    function shouldThrottle(bindingId) {
        try {
            var last = Number(sessionStorage.getItem(throttleKey(bindingId)) || 0);
            return last > 0 && Date.now() - last < SYNC_INTERVAL_MS;
        } catch (e) {
            return false;
        }
    }

    function markSynced(bindingId) {
        try {
            sessionStorage.setItem(throttleKey(bindingId), String(Date.now()));
        } catch (e) {
            /* ignore */
        }
    }

    /**
     * @param {string} token
     * @param {string} bindingId
     * @param {{ force?: boolean }} [options]
     * @returns {Promise<object|null>} 更新后的 user 字段，跳过或失败时返回 null
     */
    async function syncUserRsiFromBrowser(token, bindingId, options) {
        options = options || {};
        if (!global.UssRsiClient || !global.UssAuthApi) return null;
        if (!token || !bindingId) return null;
        if (!options.force && shouldThrottle(bindingId)) return null;

        var scraped = await global.UssRsiClient.scrapeCitizenPublicProfile(bindingId);
        var user = await global.UssAuthApi.syncRsiProfile(token, scraped);
        markSynced(bindingId);
        return user;
    }

    global.UssRsiSync = {
        syncUserRsiFromBrowser: syncUserRsiFromBrowser,
        shouldThrottle: shouldThrottle,
    };
})(typeof window !== 'undefined' ? window : globalThis);
