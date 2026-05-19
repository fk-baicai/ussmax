/**
 * 登录/注册后由服务端抓取 RSI 并全量覆盖用户资料；同一用户每个自然日登录仅强制刷新一次。
 */
(function (global) {
    'use strict';

    /**
     * 登录成功后调用：POST /api/me/rsi-sync → 服务端重新抓取 RSI 并覆盖写库
     * @param {string} token
     * @returns {Promise<object|null>} 更新后的用户对象
     */
    async function refreshUserRsiOnAuth(token) {
        if (!token || !global.UssAuthApi) return null;
        try {
            return await global.UssAuthApi.refreshRsiProfile(token);
        } catch (eSync) {
            console.warn('[rsi] 服务端同步失败', eSync && eSync.message ? eSync.message : eSync);
            return null;
        }
    }

    /** @deprecated 请使用 refreshUserRsiOnAuth */
    async function syncUserRsiFromBrowser(token) {
        return refreshUserRsiOnAuth(token);
    }

    global.UssRsiSync = {
        refreshUserRsiOnAuth: refreshUserRsiOnAuth,
        syncUserRsiFromBrowser: syncUserRsiFromBrowser,
    };
})(typeof window !== 'undefined' ? window : globalThis);
