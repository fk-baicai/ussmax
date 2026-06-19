/**
 * 登录后同步 RSI 资料（全部由服务端 Headless Edge 抓取，浏览器不直连 RSI）：
 * ① POST /api/me/rsi-sync refreshFromWeb（Edge 无头）
 * ② 失败则 GET /api/rsi/citizen-profile 再同步
 * ③ 仍失败则保留原会话资料（不覆盖）
 */
(function (global) {
    'use strict';

    var RSI_LOGIN_REFRESH_MS = 24 * 60 * 60 * 1000;

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
     * 经本站 API 代理获取 RSI 公民资料 → POST /api/me/rsi-sync（浏览器不直连 RSI，无跨域）
     * @param {string} token
     * @param {string} handle
     */
    async function syncUserRsiViaApiProxy(token, handle) {
        if (!token || !handle || !global.UssRsiClient || !global.UssAuthApi) return null;
        try {
            const scraped = await global.UssRsiClient.scrapeCitizenPublicProfile(handle);
            if (!clientScrapedLooksUsable(scraped)) return null;
            return await global.UssAuthApi.syncRsiProfile(token, scraped);
        } catch (e) {
            console.warn('[rsi] API 代理同步失败', e && e.message ? e.message : e);
            return null;
        }
    }

    /** @deprecated 请使用 syncUserRsiViaApiProxy */
    async function syncUserRsiFromBrowserClient(token, handle) {
        return syncUserRsiViaApiProxy(token, handle);
    }

    function profileLooksIncomplete(profile) {
        if (!profile || !profile.bindingId) return true;
        if (profile.rsiAssetsPending) return true;
        if (!profile.avatarUrl && profile.rsiCitizenAvatarSourceUrl) return true;
        var enlisted = profile.rsiEnlisted && String(profile.rsiEnlisted).trim();
        var location = profile.rsiLocation && String(profile.rsiLocation).trim();
        var rank = profile.rsiRankLabel && String(profile.rsiRankLabel).trim();
        var handle = profile.rsiProfileHandle && String(profile.rsiProfileHandle).trim();
        var orgSid = profile.rsiOrgSid && String(profile.rsiOrgSid).trim();
        var orgName = profile.rsiOrgName && String(profile.rsiOrgName).trim();
        var any = enlisted || location || rank || handle || orgSid || orgName;
        if (!any) return true;
        if (!enlisted && !location && !orgSid) return true;
        return false;
    }

    /** 距上次同步是否已超过 24 小时（或从未同步 / 资料不全） */
    function shouldRefreshRsiOnLogin(profile) {
        if (!profile || !profile.bindingId) return false;
        if (profileLooksIncomplete(profile)) return true;
        var syncedAt = profile.rsiProfileSyncedAt && String(profile.rsiProfileSyncedAt).trim();
        if (!syncedAt) return true;
        var t = Date.parse(syncedAt);
        if (!Number.isFinite(t)) return true;
        return Date.now() - t >= RSI_LOGIN_REFRESH_MS;
    }

    /**
     * 登录后更新 RSI：服务端 Edge 无头 → API 代理兜底 → 保留原资料
     * @returns {Promise<object|null>} 成功返回最新 user；均失败返回 null（调用方保留原会话）
     */
    async function refreshUserRsiOnLoginWithFallback(token, handle, options) {
        options = options || {};
        var maxAttempts = options.maxAttempts != null ? options.maxAttempts : 2;
        var baseDelayMs = options.baseDelayMs != null ? options.baseDelayMs : 1200;
        if (!token || !handle) return null;

        for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
            var viaServer = await refreshUserRsiOnAuth(token);
            if (viaServer && typeof viaServer === 'object') return viaServer;
            if (attempt < maxAttempts) {
                await sleep(Math.min(8000, baseDelayMs * attempt));
            }
        }

        for (var attempt2 = 1; attempt2 <= maxAttempts; attempt2 += 1) {
            var viaApi = await syncUserRsiViaApiProxy(token, handle);
            if (viaApi && typeof viaApi === 'object') return viaApi;
            if (attempt2 < maxAttempts) {
                await sleep(Math.min(8000, baseDelayMs * attempt2));
            }
        }

        console.warn('[rsi] 登录 RSI 更新均未成功，保留原资料');
        return null;
    }

    /** @deprecated 请使用 refreshUserRsiOnLoginWithFallback */
    async function refreshUserRsiFromBrowserOnLogin(token, handle, options) {
        return refreshUserRsiOnLoginWithFallback(token, handle, options);
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
        var allowServerFallback = options.serverFallback !== false;
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
                var user = await refreshUserRsiOnAuth(token);
                if (!user && allowServerFallback && handle) {
                    user = await syncUserRsiViaApiProxy(token, handle);
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

    /**
     * 注册/登录前：在用户浏览器内抓取 RSI（与登录后 sync 相同路径，带重试）
     * @param {string} handle
     * @param {{ maxAttempts?: number, baseDelayMs?: number }} [options]
     * @returns {Promise<object|null>}
     */
    async function scrapeCitizenPublicProfileWithRetry(handle, options) {
        options = options || {};
        var maxAttempts = options.maxAttempts != null ? options.maxAttempts : 3;
        var baseDelayMs = options.baseDelayMs != null ? options.baseDelayMs : 1200;
        if (!handle || !global.UssRsiClient) return null;
        var lastErr = null;
        for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                var scraped = await global.UssRsiClient.scrapeCitizenPublicProfile(handle);
                if (clientScrapedLooksUsable(scraped)) return scraped;
                lastErr = new Error('RSI 页面解析结果不完整');
            } catch (e) {
                lastErr = e;
            }
            if (attempt < maxAttempts) {
                await sleep(Math.min(10000, baseDelayMs * Math.pow(2, attempt - 1)));
            }
        }
        if (lastErr) throw lastErr;
        return null;
    }

    global.UssRsiSync = {
        clientScrapedLooksUsable: clientScrapedLooksUsable,
        profileLooksIncomplete: profileLooksIncomplete,
        shouldRefreshRsiOnLogin: shouldRefreshRsiOnLogin,
        scrapeCitizenPublicProfileWithRetry: scrapeCitizenPublicProfileWithRetry,
        syncUserRsiViaApiProxy: syncUserRsiViaApiProxy,
        syncUserRsiFromBrowserClient: syncUserRsiFromBrowserClient,
        refreshUserRsiOnLoginWithFallback: refreshUserRsiOnLoginWithFallback,
        refreshUserRsiFromBrowserOnLogin: refreshUserRsiFromBrowserOnLogin,
        refreshUserRsiOnAuth: refreshUserRsiOnAuth,
        refreshUserRsiOnAuthWithRetry: refreshUserRsiOnAuthWithRetry,
        syncUserRsiFromBrowser: syncUserRsiFromBrowser,
    };
})(typeof window !== 'undefined' ? window : globalThis);
