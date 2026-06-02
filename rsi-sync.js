/**
 * 登录/注册后由服务端抓取 RSI 并全量覆盖用户资料；同一用户每个自然日登录仅强制刷新一次。
 * 支持失败重试（指数退避）。
 */
(function (global) {
    'use strict';

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    /**
     * POST /api/me/rsi-sync → 服务端重新抓取 RSI 并覆盖写库
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

    /**
     * 带重试的 RSI 资料同步（个人信息抓取失败时使用）
     * @param {string} token
     * @param {{ maxAttempts?: number, baseDelayMs?: number, onAttempt?: function }} options
     */
    async function refreshUserRsiOnAuthWithRetry(token, options) {
        options = options || {};
        var maxAttempts = options.maxAttempts != null ? options.maxAttempts : 3;
        var baseDelayMs = options.baseDelayMs != null ? options.baseDelayMs : 1200;
        var lastErr = null;

        for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
            if (typeof options.onAttempt === 'function') {
                try {
                    options.onAttempt(attempt, maxAttempts);
                } catch (ignore) {}
            }
            try {
                if (!token || !global.UssAuthApi) return null;
                var user = await global.UssAuthApi.refreshRsiProfile(token);
                if (user && typeof user === 'object') return user;
            } catch (e) {
                lastErr = e;
                console.warn(
                    '[rsi] 同步重试 ' + attempt + '/' + maxAttempts,
                    e && e.message ? e.message : e
                );
            }
            if (attempt < maxAttempts) {
                await sleep(Math.min(10000, baseDelayMs * Math.pow(2, attempt - 1)));
            }
        }
        if (lastErr) {
            console.warn('[rsi] 同步最终失败', lastErr && lastErr.message ? lastErr.message : lastErr);
        }
        return null;
    }

    /** @deprecated 请使用 refreshUserRsiOnAuth */
    async function syncUserRsiFromBrowser(token) {
        return refreshUserRsiOnAuth(token);
    }

    global.UssRsiSync = {
        refreshUserRsiOnAuth: refreshUserRsiOnAuth,
        refreshUserRsiOnAuthWithRetry: refreshUserRsiOnAuthWithRetry,
        syncUserRsiFromBrowser: syncUserRsiFromBrowser,
    };
})(typeof window !== 'undefined' ? window : globalThis);
