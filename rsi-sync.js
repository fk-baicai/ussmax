/**
 * 登录/注册后同步 RSI 资料：优先用户浏览器抓取（走用户 IP），失败则服务端 Headless Edge 抓取。
 */
(function (global) {
    'use strict';

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function clientScrapedLooksUsable(scraped) {
        if (!scraped || typeof scraped !== 'object') return false;
        if (scraped.citizenAvatarUrl) return true;
        if (Array.isArray(scraped.citizenAvatarUrls) && scraped.citizenAvatarUrls.length) return true;
        return !!(
            (scraped.rsiRankLabel && String(scraped.rsiRankLabel).trim()) ||
            (scraped.rsiOrgSid && String(scraped.rsiOrgSid).trim()) ||
            (scraped.rsiEnlisted && String(scraped.rsiEnlisted).trim())
        );
    }

    /**
     * 用户浏览器内抓取 RSI → POST /api/me/rsi-sync（不强制服务端再抓）
     * @param {string} token
     * @param {string} handle
     */
    async function syncUserRsiFromBrowserClient(token, handle) {
        if (!token || !handle || !global.UssRsiClient || !global.UssAuthApi) return null;
        try {
            const scraped = await global.UssRsiClient.scrapeCitizenPublicProfile(handle);
            if (!clientScrapedLooksUsable(scraped)) return null;
            return await global.UssAuthApi.syncRsiProfile(token, scraped);
        } catch (e) {
            console.warn('[rsi] 浏览器抓取失败，改走服务端', e && e.message ? e.message : e);
            return null;
        }
    }

    /**
     * POST /api/me/rsi-sync → 服务端 Headless Edge / Node 抓取
     * @param {string} token
     * @returns {Promise<object|null>}
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
     * 浏览器优先，失败则服务端；带重试
     * @param {string} token
     * @param {{ maxAttempts?: number, baseDelayMs?: number, handle?: string, onAttempt?: function }} options
     */
    async function refreshUserRsiOnAuthWithRetry(token, options) {
        options = options || {};
        var maxAttempts = options.maxAttempts != null ? options.maxAttempts : 3;
        var baseDelayMs = options.baseDelayMs != null ? options.baseDelayMs : 1200;
        var handle =
            options.handle ||
            (global.UssAuthSessionSync &&
            typeof global.UssAuthSessionSync.loadAuthSession === 'function' &&
            global.UssAuthSessionSync.loadAuthSession() &&
            global.UssAuthSessionSync.loadAuthSession().bindingId) ||
            '';
        var lastErr = null;

        for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
            if (typeof options.onAttempt === 'function') {
                try {
                    options.onAttempt(attempt, maxAttempts);
                } catch (ignore) {}
            }
            try {
                if (!token) return null;
                var user = null;
                if (handle) {
                    user = await syncUserRsiFromBrowserClient(token, handle);
                }
                if (!user) {
                    user = await refreshUserRsiOnAuth(token);
                }
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
        syncUserRsiFromBrowserClient: syncUserRsiFromBrowserClient,
        refreshUserRsiOnAuth: refreshUserRsiOnAuth,
        refreshUserRsiOnAuthWithRetry: refreshUserRsiOnAuthWithRetry,
        syncUserRsiFromBrowser: syncUserRsiFromBrowser,
    };
})(typeof window !== 'undefined' ? window : globalThis);
