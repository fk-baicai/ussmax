/**
 * 浏览器抓取 RSI 公民页；仅在登录时（force）执行，有变更才提交后端保存。
 * 登录期间不再重复抓取；若 RSI 资料有变，请退出后重新登录。
 */
(function (global) {
    'use strict';

    function normStr(v) {
        return String(v != null ? v : '').trim();
    }

    function normLo(v) {
        return normStr(v).toLowerCase();
    }

    function normHref(v) {
        var h = normStr(v);
        if (!h) return '';
        return h.charAt(0) === '/' ? h : '/' + h;
    }

    /** 从 /api/me 或会话对象提取用于对比的 RSI 字段 */
    function snapshotFromUser(user) {
        user = user || {};
        return {
            citizenAvatarUrl: normStr(user.rsiCitizenAvatarSourceUrl),
            rsiProfileHandle: normLo(user.rsiProfileHandle || user.bindingId),
            rsiOrgRoleLabel: normStr(user.rsiOrgRoleLabel),
            rsiOrgName: normStr(user.rsiOrgName),
            rsiOrgHref: normHref(user.rsiOrgHref),
            rsiOrgSid: normStr(user.rsiOrgSid),
            rsiOrgLogoUrl: normStr(user.rsiOrgLogoUrl),
        };
    }

    /** 从 rsi-client 抓取结果提取对比字段 */
    function snapshotFromScraped(scraped) {
        scraped = scraped || {};
        var av =
            normStr(scraped.citizenAvatarUrl) ||
            (Array.isArray(scraped.citizenAvatarUrls) && scraped.citizenAvatarUrls.length
                ? normStr(scraped.citizenAvatarUrls[0])
                : '');
        return {
            citizenAvatarUrl: av,
            rsiProfileHandle: normLo(scraped.rsiProfileHandle),
            rsiOrgRoleLabel: normStr(scraped.rsiOrgRoleLabel),
            rsiOrgName: normStr(scraped.rsiOrgName),
            rsiOrgHref: normHref(scraped.rsiOrgHref),
            rsiOrgSid: normStr(scraped.rsiOrgSid),
            rsiOrgLogoUrl: normStr(scraped.rsiOrgLogoUrl),
        };
    }

    /**
     * @returns {string[]}
     */
    function diffRsiSnapshots(stored, scraped) {
        var keys = [];
        if (scraped.citizenAvatarUrl && stored.citizenAvatarUrl !== scraped.citizenAvatarUrl) {
            keys.push('avatar');
        }
        if (scraped.rsiProfileHandle && stored.rsiProfileHandle !== scraped.rsiProfileHandle) {
            keys.push('rsiProfileHandle');
        }
        if (scraped.rsiOrgRoleLabel !== stored.rsiOrgRoleLabel) {
            keys.push('rsiOrgRoleLabel');
        }
        if (scraped.rsiOrgName !== stored.rsiOrgName) {
            keys.push('rsiOrgName');
        }
        if (scraped.rsiOrgHref && stored.rsiOrgHref !== scraped.rsiOrgHref) {
            keys.push('rsiOrgHref');
        }
        if (scraped.rsiOrgSid !== stored.rsiOrgSid) {
            keys.push('rsiOrgSid');
        }
        if (scraped.rsiOrgLogoUrl && stored.rsiOrgLogoUrl !== scraped.rsiOrgLogoUrl) {
            keys.push('rsiOrgLogoUrl');
        }
        return keys;
    }

    function hasRsiProfileChanges(user, scraped) {
        return diffRsiSnapshots(snapshotFromUser(user), snapshotFromScraped(scraped)).length > 0;
    }

    /**
     * @param {string} token
     * @param {string|object} bindingIdOrUser
     * @param {{ force?: boolean }} [options] 仅 force:true（登录时）才会抓取 RSI
     * @returns {Promise<object|null>}
     */
    async function syncUserRsiFromBrowser(token, bindingIdOrUser, options) {
        options = options || {};
        if (!options.force) return null;
        if (!global.UssRsiClient || !global.UssAuthApi) return null;

        var user = bindingIdOrUser && typeof bindingIdOrUser === 'object' ? bindingIdOrUser : null;
        var bindingId = user ? user.bindingId : bindingIdOrUser;
        bindingId = normLo(bindingId);
        if (!token || !bindingId) return null;

        var scraped;
        try {
            scraped = await global.UssRsiClient.scrapeCitizenPublicProfile(bindingId);
        } catch (eScrape) {
            console.warn('[rsi] 浏览器抓取失败', eScrape && eScrape.message ? eScrape.message : eScrape);
            return null;
        }

        if (user && !hasRsiProfileChanges(user, scraped)) {
            return null;
        }

        try {
            var updated = await global.UssAuthApi.syncRsiProfile(token, scraped);
            return updated || null;
        } catch (eSync) {
            console.warn('[rsi] 同步到服务端失败', eSync && eSync.message ? eSync.message : eSync);
            return null;
        }
    }

    global.UssRsiSync = {
        syncUserRsiFromBrowser: syncUserRsiFromBrowser,
        hasRsiProfileChanges: hasRsiProfileChanges,
        diffRsiSnapshots: diffRsiSnapshots,
    };
})(typeof window !== 'undefined' ? window : globalThis);
