/**
 * 各页面载入时刷新 /api/me 会话字段（不抓取 RSI；RSI 在登录/注册时由服务端抓取并覆盖写库）。
 */
(function (global) {
    'use strict';

    var AUTH_SESSION_KEY = 'ussHangzhouAuthSession';
    var authSessionEpoch = 0;

    function getAuthSessionEpoch() {
        return authSessionEpoch;
    }

    /** 异步刷新会话前捕获 epoch+token；退出后 epoch 变化或 token 不匹配则视为失效 */
    function isAuthSessionOpValid(epoch, token) {
        if (epoch !== authSessionEpoch) return false;
        var t = token != null ? String(token) : '';
        if (!t) return false;
        var sess = null;
        try {
            var raw = sessionStorage.getItem(AUTH_SESSION_KEY);
            if (!raw) raw = localStorage.getItem(AUTH_SESSION_KEY);
            if (!raw) return false;
            sess = JSON.parse(raw);
        } catch (e) {
            return false;
        }
        if (!sess || !sess.token) return false;
        if (isAuthSessionExpired(sess)) return false;
        return String(sess.token) === t;
    }

    function clearAuthSession() {
        authSessionEpoch += 1;
        try {
            localStorage.removeItem(AUTH_SESSION_KEY);
        } catch (e) {
            /* ignore */
        }
        try {
            sessionStorage.removeItem(AUTH_SESSION_KEY);
        } catch (e) {
            /* ignore */
        }
    }

    function isAuthSessionExpired(sess) {
        if (!sess || !sess.token) return true;
        if (global.UssAuthApi && typeof global.UssAuthApi.isTokenExpired === 'function') {
            return global.UssAuthApi.isTokenExpired(sess.token);
        }
        if (sess.expiresAt != null && Number.isFinite(Number(sess.expiresAt))) {
            return Date.now() >= Number(sess.expiresAt);
        }
        return false;
    }

    function loadAuthSession() {
        var sess = null;
        try {
            var raw = sessionStorage.getItem(AUTH_SESSION_KEY);
            if (!raw) raw = localStorage.getItem(AUTH_SESSION_KEY);
            if (!raw) return null;
            sess = JSON.parse(raw);
        } catch (e) {
            return null;
        }
        if (isAuthSessionExpired(sess)) {
            clearAuthSession();
            return null;
        }
        return sess;
    }

    function saveAuthSession(payload, remember) {
        if (!payload) return;
        var json = JSON.stringify(payload);
        try {
            if (remember) {
                localStorage.setItem(AUTH_SESSION_KEY, json);
                sessionStorage.removeItem(AUTH_SESSION_KEY);
            } else {
                sessionStorage.setItem(AUTH_SESSION_KEY, json);
                localStorage.removeItem(AUTH_SESSION_KEY);
            }
        } catch (e) {
            /* ignore */
        }
    }

    function sessionUsesRemember() {
        try {
            return !!localStorage.getItem(AUTH_SESSION_KEY) && !sessionStorage.getItem(AUTH_SESSION_KEY);
        } catch (e) {
            return false;
        }
    }

    function isEmptyProfileValue(val) {
        if (val === undefined || val === null) return true;
        if (typeof val === 'string' && val.trim() === '') return true;
        return false;
    }

    /** 抓取失败或服务端返回空值时保留 prev 中的旧资料 */
    function mergeProfileField(next, prev) {
        if (isEmptyProfileValue(next)) {
            return prev !== undefined ? prev : next;
        }
        return next;
    }

    var PROFILE_CACHE_KEY = 'ussHangzhouProfileCache';

    function loadProfileCache(bindingId) {
        var bid = String(bindingId || '')
            .trim()
            .toLowerCase();
        if (!bid) return null;
        try {
            var raw = localStorage.getItem(PROFILE_CACHE_KEY);
            if (!raw) return null;
            var all = JSON.parse(raw);
            if (!all || typeof all !== 'object') return null;
            return all[bid] || null;
        } catch (e) {
            return null;
        }
    }

    function saveProfileCache(bindingId, profile) {
        var bid = String(bindingId || '')
            .trim()
            .toLowerCase();
        if (!bid || !profile || typeof profile !== 'object') return;
        try {
            var raw = localStorage.getItem(PROFILE_CACHE_KEY);
            var all = raw ? JSON.parse(raw) : {};
            if (!all || typeof all !== 'object') all = {};
            all[bid] = profile;
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(all));
        } catch (e) {
            /* quota / private mode */
        }
    }

    function snapshotProfileFields(sess) {
        sess = sess || {};
        return {
            avatarUrl: sess.avatarUrl,
            rsiCitizenAvatarSourceUrl: sess.rsiCitizenAvatarSourceUrl,
            rsiProfileHandle: sess.rsiProfileHandle,
            rsiRankIconUrl: sess.rsiRankIconUrl,
            rsiRankLabel: sess.rsiRankLabel,
            rsiEnlisted: sess.rsiEnlisted,
            rsiLocation: sess.rsiLocation,
            rsiFluency: sess.rsiFluency,
            rsiOrgName: sess.rsiOrgName,
            rsiOrgSid: sess.rsiOrgSid,
            rsiOrgHref: sess.rsiOrgHref,
            rsiOrgPageUrl: sess.rsiOrgPageUrl,
            rsiOrgLogoUrl: sess.rsiOrgLogoUrl,
            rsiOrgRoleLabel: sess.rsiOrgRoleLabel,
            rsiOrgRankSlots: sess.rsiOrgRankSlots,
            rsiAssetsPending: sess.rsiAssetsPending,
        };
    }

    function profileCacheHasContent(profile) {
        if (!profile) return false;
        return !!(
            (profile.rsiEnlisted && String(profile.rsiEnlisted).trim()) ||
            (profile.rsiLocation && String(profile.rsiLocation).trim()) ||
            (profile.rsiRankLabel && String(profile.rsiRankLabel).trim()) ||
            (profile.rsiProfileHandle && String(profile.rsiProfileHandle).trim()) ||
            (profile.rsiOrgSid && String(profile.rsiOrgSid).trim()) ||
            (profile.rsiOrgName && String(profile.rsiOrgName).trim())
        );
    }

    function mergeUserIntoSession(token, user, prev) {
        prev = prev || {};
        user = user || {};
        var cached = loadProfileCache(user.bindingId || prev.bindingId);
        if (cached) {
            prev = Object.assign({}, cached, prev);
        }
        var tokenExpiresAt =
            global.UssAuthApi && typeof global.UssAuthApi.getTokenExpiresAt === 'function'
                ? global.UssAuthApi.getTokenExpiresAt(token)
                : null;
        var merged = {
            token: token,
            bindingId: user.bindingId != null ? user.bindingId : prev.bindingId,
            email: user.email != null ? user.email : prev.email,
            loginAt: prev.loginAt || new Date().toISOString(),
            sessionDays: prev.sessionDays !== undefined ? prev.sessionDays : undefined,
            expiresAt:
                prev.expiresAt != null
                    ? prev.expiresAt
                    : tokenExpiresAt != null
                      ? tokenExpiresAt
                      : undefined,
            avatarUrl: mergeProfileField(user.avatarUrl, prev.avatarUrl),
            rsiCitizenAvatarSourceUrl: mergeProfileField(
                user.rsiCitizenAvatarSourceUrl,
                prev.rsiCitizenAvatarSourceUrl
            ),
            rsiProfileHandle: mergeProfileField(user.rsiProfileHandle, prev.rsiProfileHandle),
            rsiRankIconUrl: mergeProfileField(user.rsiRankIconUrl, prev.rsiRankIconUrl),
            rsiRankLabel: mergeProfileField(user.rsiRankLabel, prev.rsiRankLabel),
            rsiEnlisted: mergeProfileField(user.rsiEnlisted, prev.rsiEnlisted),
            rsiLocation: mergeProfileField(user.rsiLocation, prev.rsiLocation),
            rsiFluency: mergeProfileField(user.rsiFluency, prev.rsiFluency),
            rsiOrgName: mergeProfileField(user.rsiOrgName, prev.rsiOrgName),
            rsiOrgSid: mergeProfileField(user.rsiOrgSid, prev.rsiOrgSid),
            rsiOrgHref: mergeProfileField(user.rsiOrgHref, prev.rsiOrgHref),
            rsiOrgPageUrl: mergeProfileField(user.rsiOrgPageUrl, prev.rsiOrgPageUrl),
            rsiOrgLogoUrl: mergeProfileField(user.rsiOrgLogoUrl, prev.rsiOrgLogoUrl),
            rsiOrgRoleLabel: mergeProfileField(user.rsiOrgRoleLabel, prev.rsiOrgRoleLabel),
            rsiOrgRankSlots:
                user.rsiOrgRankSlots !== undefined && user.rsiOrgRankSlots !== null
                    ? user.rsiOrgRankSlots
                    : prev.rsiOrgRankSlots,
            rsiAssetsPending:
                user.rsiAssetsPending !== undefined
                    ? !!user.rsiAssetsPending
                    : prev.rsiAssetsPending,
            isAdmin: user.isAdmin !== undefined ? !!user.isAdmin : !!prev.isAdmin,
            isSuperAdmin: user.isSuperAdmin !== undefined ? !!user.isSuperAdmin : !!prev.isSuperAdmin,
            oopzId: user.oopzId !== undefined ? user.oopzId : prev.oopzId,
            oopzUid: user.oopzUid !== undefined ? user.oopzUid : prev.oopzUid,
            oopzName: user.oopzName !== undefined ? user.oopzName : prev.oopzName,
            oopzBoundAt: user.oopzBoundAt !== undefined ? user.oopzBoundAt : prev.oopzBoundAt,
            canChangeOopz: user.canChangeOopz !== undefined ? user.canChangeOopz : prev.canChangeOopz,
            oopzChangeCooldownSec:
                user.oopzChangeCooldownSec !== undefined ? user.oopzChangeCooldownSec : prev.oopzChangeCooldownSec,
            oopzCanChangeAt: user.oopzCanChangeAt !== undefined ? user.oopzCanChangeAt : prev.oopzCanChangeAt,
        };
        if (profileCacheHasContent(snapshotProfileFields(merged))) {
            saveProfileCache(merged.bindingId, snapshotProfileFields(merged));
        }
        return merged;
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    /** 仅从服务端刷新会话，不访问 RSI */
    async function refreshAuthSessionFromServer(options) {
        options = options || {};
        if (!global.UssAuthApi) return null;
        var epoch = authSessionEpoch;
        var sess = loadAuthSession();
        if (!sess || !sess.token) return null;
        var tokenAtStart = sess.token;

        var me;
        try {
            me = await global.UssAuthApi.me(tokenAtStart);
        } catch (eMe) {
            if (global.UssAuthApi && global.UssAuthApi.isAuthSessionError(eMe)) {
                clearAuthSession();
                if (typeof options.onSessionExpired === 'function') {
                    try {
                        options.onSessionExpired(eMe);
                    } catch (eCb) {
                        /* ignore */
                    }
                }
            }
            return null;
        }

        var remember = sessionUsesRemember();
        if (!isAuthSessionOpValid(epoch, tokenAtStart)) return null;
        var merged = mergeUserIntoSession(tokenAtStart, me, sess);
        saveAuthSession(merged, remember);
        if (typeof options.onUpdated === 'function') {
            try {
                options.onUpdated(merged);
            } catch (eCb) {
                /* ignore */
            }
        }
        return merged;
    }

    /** /api/me 失败时指数退避重试 */
    async function refreshAuthSessionFromServerWithRetry(options) {
        options = options || {};
        var maxAttempts = options.maxAttempts != null ? options.maxAttempts : 3;
        var baseDelayMs = options.baseDelayMs != null ? options.baseDelayMs : 800;
        for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
            if (!loadAuthSession()) return null;
            var merged = await refreshAuthSessionFromServer(options);
            if (merged) return merged;
            if (!loadAuthSession()) return null;
            if (attempt < maxAttempts) {
                await sleep(Math.min(8000, baseDelayMs * Math.pow(2, attempt - 1)));
            }
        }
        return null;
    }

    global.UssAuthSessionSync = {
        AUTH_SESSION_KEY: AUTH_SESSION_KEY,
        PROFILE_CACHE_KEY: PROFILE_CACHE_KEY,
        clearAuthSession: clearAuthSession,
        getAuthSessionEpoch: getAuthSessionEpoch,
        isAuthSessionOpValid: isAuthSessionOpValid,
        isAuthSessionExpired: isAuthSessionExpired,
        loadAuthSession: loadAuthSession,
        saveAuthSession: saveAuthSession,
        mergeUserIntoSession: mergeUserIntoSession,
        mergeProfileField: mergeProfileField,
        snapshotProfileFields: snapshotProfileFields,
        loadProfileCache: loadProfileCache,
        saveProfileCache: saveProfileCache,
        refreshAuthSessionFromServer: refreshAuthSessionFromServer,
        refreshAuthSessionFromServerWithRetry: refreshAuthSessionFromServerWithRetry,
    };
})(typeof window !== 'undefined' ? window : globalThis);
