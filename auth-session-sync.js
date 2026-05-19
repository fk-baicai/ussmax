/**
 * 各页面载入时刷新 /api/me 会话字段（不抓取 RSI；RSI 仅在登录时同步）。
 */
(function (global) {
    'use strict';

    var AUTH_SESSION_KEY = 'ussHangzhouAuthSession';

    function loadAuthSession() {
        try {
            var raw = sessionStorage.getItem(AUTH_SESSION_KEY);
            if (!raw) raw = localStorage.getItem(AUTH_SESSION_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
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

    function mergeUserIntoSession(token, user, prev) {
        prev = prev || {};
        user = user || {};
        return {
            token: token,
            bindingId: user.bindingId != null ? user.bindingId : prev.bindingId,
            email: user.email != null ? user.email : prev.email,
            loginAt: prev.loginAt || new Date().toISOString(),
            avatarUrl: user.avatarUrl != null ? user.avatarUrl : prev.avatarUrl,
            rsiCitizenAvatarSourceUrl:
                user.rsiCitizenAvatarSourceUrl !== undefined
                    ? user.rsiCitizenAvatarSourceUrl
                    : prev.rsiCitizenAvatarSourceUrl,
            rsiProfileHandle: user.rsiProfileHandle !== undefined ? user.rsiProfileHandle : prev.rsiProfileHandle,
            rsiRankIconUrl: user.rsiRankIconUrl !== undefined ? user.rsiRankIconUrl : prev.rsiRankIconUrl,
            rsiRankLabel: user.rsiRankLabel !== undefined ? user.rsiRankLabel : prev.rsiRankLabel,
            rsiEnlisted: user.rsiEnlisted !== undefined ? user.rsiEnlisted : prev.rsiEnlisted,
            rsiLocation: user.rsiLocation !== undefined ? user.rsiLocation : prev.rsiLocation,
            rsiFluency: user.rsiFluency !== undefined ? user.rsiFluency : prev.rsiFluency,
            rsiOrgName: user.rsiOrgName !== undefined ? user.rsiOrgName : prev.rsiOrgName,
            rsiOrgSid: user.rsiOrgSid !== undefined ? user.rsiOrgSid : prev.rsiOrgSid,
            rsiOrgHref: user.rsiOrgHref !== undefined ? user.rsiOrgHref : prev.rsiOrgHref,
            rsiOrgPageUrl: user.rsiOrgPageUrl !== undefined ? user.rsiOrgPageUrl : prev.rsiOrgPageUrl,
            rsiOrgLogoUrl: user.rsiOrgLogoUrl !== undefined ? user.rsiOrgLogoUrl : prev.rsiOrgLogoUrl,
            rsiOrgRoleLabel: user.rsiOrgRoleLabel !== undefined ? user.rsiOrgRoleLabel : prev.rsiOrgRoleLabel,
            rsiOrgRankSlots: user.rsiOrgRankSlots !== undefined ? user.rsiOrgRankSlots : prev.rsiOrgRankSlots,
            isAdmin: user.isAdmin !== undefined ? !!user.isAdmin : !!prev.isAdmin,
            isSuperAdmin: user.isSuperAdmin !== undefined ? !!user.isSuperAdmin : !!prev.isSuperAdmin,
        };
    }

    /** 仅从服务端刷新会话，不访问 RSI */
    async function refreshAuthSessionFromServer(options) {
        options = options || {};
        if (!global.UssAuthApi) return null;
        var sess = loadAuthSession();
        if (!sess || !sess.token) return null;

        var me;
        try {
            me = await global.UssAuthApi.me(sess.token);
        } catch (eMe) {
            return null;
        }

        var remember = sessionUsesRemember();
        var merged = mergeUserIntoSession(sess.token, me, sess);
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

    global.UssAuthSessionSync = {
        AUTH_SESSION_KEY: AUTH_SESSION_KEY,
        loadAuthSession: loadAuthSession,
        saveAuthSession: saveAuthSession,
        mergeUserIntoSession: mergeUserIntoSession,
        refreshAuthSessionFromServer: refreshAuthSessionFromServer,
    };
})(typeof window !== 'undefined' ? window : globalThis);
