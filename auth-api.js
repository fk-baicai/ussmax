/**
 * 认证 API 客户端。
 * 默认基址：auth-config.js 按域名设置；若无则退回 http://127.0.0.1:3789（与 backend 默认端口一致）。
 * 本地：在仓库根目录启动 backend（npm start）；先于本文件设置 window.USS_AUTH_API_BASE 可覆盖。
 */
(function () {
    var AUTH_API_BASE = (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) || 'http://127.0.0.1:3789';
    var Err = typeof UssApiError !== 'undefined' ? UssApiError : null;

    function joinUrl(path) {
        return AUTH_API_BASE.replace(/\/$/, '') + path;
    }

    async function parseJson(r) {
        try {
            return await r.json();
        } catch (e) {
            return {};
        }
    }

    /** 非 2xx 时抛出仅含错误码的用户可见 Error */
    function throwIfNotOk(r, data, fallbackCode) {
        if (r.ok) return;
        var err;
        if (Err) err = Err.createApiError(r.status, data, fallbackCode);
        else {
            var code = (data && data.code) || fallbackCode || 'NET_E001';
            err = new Error('错误代码：' + code);
            err.code = code;
        }
        err.status = r.status;
        err.httpStatus = r.status;
        throw err;
    }

    function parseTokenPayload(token) {
        if (!token || typeof token !== 'string') return null;
        var i = token.lastIndexOf('.');
        if (i <= 0) return null;
        try {
            return JSON.parse(atob(token.slice(0, i).replace(/-/g, '+').replace(/_/g, '/')));
        } catch (e) {
            return null;
        }
    }

    function getTokenExpiresAt(token) {
        var payload = parseTokenPayload(token);
        var exp = payload && payload.exp;
        return exp != null && Number.isFinite(Number(exp)) ? Number(exp) : null;
    }

    function isTokenExpired(token, skewMs) {
        var exp = getTokenExpiresAt(token);
        if (exp == null) return true;
        var skew = skewMs != null ? Number(skewMs) : 5000;
        return Date.now() >= exp - skew;
    }

    function isAuthSessionError(err) {
        var code =
            (err && err.code) ||
            (err && err.httpStatus === 401 ? 'AUTH_S002' : '');
        return code === 'AUTH_S001' || code === 'AUTH_S002' || code === 'AUTH_S003';
    }

    function authSessionExpiredMessage() {
        return '登录已过期，请重新登录';
    }

    async function fetchCheckinBranchUnit(token, branch, year, month) {
        var parts = ['branch=' + encodeURIComponent(branch)];
        if (year != null && month != null) {
            parts.push('year=' + encodeURIComponent(year));
            parts.push('month=' + encodeURIComponent(month));
        }
        var q = '?' + parts.join('&');
        var r = await fetch(joinUrl('/api/checkin/unit') + q, {
            headers: { Authorization: 'Bearer ' + token },
        });
        var data = await parseJson(r);
        throwIfNotOk(r, data, 'CHK_001');
        return data;
    }

    async function adminJson(token, path, init) {
        init = init || {};
        var headers = Object.assign({}, init.headers || {}, { Authorization: 'Bearer ' + token });
        var r = await fetch(joinUrl(path), Object.assign({}, init, { headers: headers }));
        var data = await parseJson(r);
        throwIfNotOk(r, data, 'ADM_001');
        return data;
    }

    window.UssAuthApi = {
        base: AUTH_API_BASE,
        parseTokenPayload: parseTokenPayload,
        getTokenExpiresAt: getTokenExpiresAt,
        isTokenExpired: isTokenExpired,
        isAuthSessionError: isAuthSessionError,
        authSessionExpiredMessage: authSessionExpiredMessage,

        setBase: function (url) {
            AUTH_API_BASE = String(url || '').replace(/\/$/, '') || AUTH_API_BASE;
            this.base = AUTH_API_BASE;
        },

        /** 将 API 返回的相对路径（如 /avatars/uuid.jpg）拼成可给 <img src> 使用的绝对地址 */
        resolveAssetUrl: function (rel) {
            if (!rel || typeof rel !== 'string') return '';
            if (/^https?:\/\//i.test(rel)) return rel;
            var p = rel.charAt(0) === '/' ? rel : '/' + rel;
            return joinUrl(p);
        },

        async register(body) {
            var r = await fetch(joinUrl('/api/register'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'AUTH_R006');
            return data;
        },

        async login(body) {
            var r = await fetch(joinUrl('/api/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            var raw = '';
            try {
                raw = await r.text();
            } catch (ignore) {}
            var data = {};
            if (raw) {
                try {
                    data = JSON.parse(raw);
                } catch (ignore) {}
            }
            if (!r.ok) {
                var fb = r.status === 401 ? 'AUTH_L001' : r.status >= 502 ? 'NET_E' + r.status : 'SRV_001';
                throwIfNotOk(r, data, fb);
            }
            return data;
        },

        async me(token) {
            var r = await fetch(joinUrl('/api/me'), {
                headers: { Authorization: 'Bearer ' + token }
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, r.status === 401 ? 'AUTH_S002' : 'AUTH_S001');
            return data;
        },

        async getClientPublicIpStatus() {
            var r = await fetch(joinUrl('/api/client-public-ip/status'));
            var data = await parseJson(r);
            if (r.status === 404) {
                return { ok: false, code: (data && data.code) || 'IP_001' };
            }
            throwIfNotOk(r, data, 'SRV_001');
            return data;
        },

        async getClientPublicIp(token) {
            var r = await fetch(joinUrl('/api/client-public-ip'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (r.status === 404) {
                return { ok: false, code: (data && data.code) || 'IP_001' };
            }
            throwIfNotOk(r, data, 'SRV_001');
            return data;
        },

        /** 服务端重新抓取 RSI 公民页并全量覆盖用户资料（登录/注册与手动刷新） */
        async refreshRsiProfile(token) {
            return this.syncRsiProfile(token, { refreshFromWeb: true, forceLoginSync: true });
        },

        async syncRsiProfile(token, payload) {
            var r = await fetch(joinUrl('/api/me/rsi-sync'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify(payload || { refreshFromWeb: true }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'AUTH_H002');
            return data;
        },

        async changePassword(token, body) {
            var r = await fetch(joinUrl('/api/account/password'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify(body || {}),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'AUTH_C001');
            return data;
        },

        async getOopzBinding(token) {
            var r = await fetch(joinUrl('/api/me/oopz'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'OOPZ_001');
            return data;
        },

        async bindOopzId(token, oopzId) {
            var r = await fetch(joinUrl('/api/me/oopz/bind'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ oopzId: oopzId }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'OOPZ_001');
            return data;
        },

        async setOopzAnnounceEnabled(token, enabled) {
            var r = await fetch(joinUrl('/api/me/oopz/announce'), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ enabled: !!enabled }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'OOPZ_005');
            return data;
        },

        async sendPasswordResetCode(email) {
            var r = await fetch(joinUrl('/api/password-reset/send-code'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'AUTH_P008');
            return data;
        },

        async confirmPasswordReset(body) {
            var r = await fetch(joinUrl('/api/password-reset/confirm'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'AUTH_P006');
            return data;
        },

        async health() {
            var r = await fetch(joinUrl('/api/health'));
            return r.ok;
        },

        async checkinStatus(token, branch) {
            var q = '';
            if (branch) {
                q = '?branch=' + encodeURIComponent(branch);
            }
            var r = await fetch(joinUrl('/api/checkin/status') + q, {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'CHK_001');
            return data;
        },

        async checkinHub(token) {
            var r = await fetch(joinUrl('/api/checkin/hub'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'CHK_001');
            return data;
        },

        /** 分部页合并接口：日历 + 排行 + 积分/连续 + 今日是否已签 + 历史日期（一次请求） */
        checkinUnit: fetchCheckinBranchUnit,

        /** 与 checkinUnit 相同，兼容旧代码 */
        checkinSummary: fetchCheckinBranchUnit,

        async checkinCaptcha(token) {
            var r = await fetch(joinUrl('/api/checkin/captcha'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'CHK_010');
            return data;
        },

        async checkinCaptchaPuzzle(token, captchaId) {
            var id = encodeURIComponent(String(captchaId || '').trim());
            var r = await fetch(joinUrl('/api/checkin/captcha/' + id + '/puzzle'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'CHK_011');
            return data;
        },

        async checkin(token, body) {
            var r = await fetch(joinUrl('/api/checkin'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify(body || {}),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'CHK_002');
            return data;
        },

        async adminListAdmins(token) {
            return adminJson(token, '/api/admin/admins');
        },
        async adminAddAdmin(token, bindingId) {
            return adminJson(token, '/api/admin/admins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bindingId: bindingId }),
            });
        },
        async adminRemoveAdmin(token, bindingId) {
            return adminJson(token, '/api/admin/admins/' + encodeURIComponent(bindingId), { method: 'DELETE' });
        },
        async adminListUsers(token) {
            return adminJson(token, '/api/admin/users');
        },
        async adminPatchUser(token, userId, body) {
            return adminJson(token, '/api/admin/users/' + encodeURIComponent(userId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminDeleteUser(token, userId) {
            return adminJson(token, '/api/admin/users/' + encodeURIComponent(userId), {
                method: 'DELETE',
            });
        },
        async adminCheckinBranch(token, branch, year, month) {
            var q = '/api/admin/checkin/branch?branch=' + encodeURIComponent(branch);
            if (year != null && month != null && String(year) !== '' && String(month) !== '') {
                q += '&year=' + encodeURIComponent(year) + '&month=' + encodeURIComponent(month);
            }
            return adminJson(token, q);
        },
        async adminAdjustPoints(token, body) {
            return adminJson(token, '/api/admin/checkin/adjust-points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminCheckinMakeup(token, body) {
            return adminJson(token, '/api/admin/checkin/makeup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminCheckinMakeupPoints(token, branch, date) {
            var q =
                '/api/admin/checkin/makeup-points?branch=' +
                encodeURIComponent(branch) +
                '&date=' +
                encodeURIComponent(date);
            return adminJson(token, q);
        },
        async adminGetSchedule(token) {
            return adminJson(token, '/api/admin/checkin/schedule');
        },
        async adminPutSchedule(token, body) {
            return adminJson(token, '/api/admin/checkin/schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminGetOopzAutoCheckin(token) {
            return adminJson(token, '/api/admin/checkin/oopz-auto');
        },
        async adminPutOopzAutoCheckin(token, body) {
            return adminJson(token, '/api/admin/checkin/oopz-auto', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminGetManualCheckinOopz(token) {
            return adminJson(token, '/api/admin/checkin/manual-oopz');
        },
        async adminPutManualCheckinOopz(token, body) {
            return adminJson(token, '/api/admin/checkin/manual-oopz', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminGetOopzTts(token) {
            return adminJson(token, '/api/admin/oopz/tts');
        },
        async adminPutOopzTts(token, body) {
            return adminJson(token, '/api/admin/oopz/tts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminGetRegisterWhitelist(token) {
            return adminJson(token, '/api/admin/register-whitelist');
        },
        async adminPutRegisterWhitelist(token, body) {
            return adminJson(token, '/api/admin/register-whitelist', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
        },
        async adminAuditLog(token, limit, offset) {
            var q = '/api/admin/audit-log?limit=' + encodeURIComponent(limit != null ? limit : 80);
            if (offset != null && offset !== '') {
                q += '&offset=' + encodeURIComponent(offset);
            }
            return adminJson(token, q);
        },

        /** 首页 RSI 服务器状态（无需登录） */
        async rsiServerStatus() {
            var r = await fetch(joinUrl('/api/rsi-server-status'));
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'RSI_001');
            return data;
        },

        /** 首页舰员交流区：帖子列表（无需登录） */
        async communityListPosts(limit) {
            var q = '';
            if (limit != null && limit !== '') {
                q = '?limit=' + encodeURIComponent(limit);
            }
            var r = await fetch(joinUrl('/api/community/posts') + q);
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_P002');
            return data;
        },

        /** 单帖详情（无需登录） */
        async communityGetPost(postId) {
            var r = await fetch(joinUrl('/api/community/posts/' + encodeURIComponent(postId)));
            var data = await parseJson(r);
            if (r.status === 404) throwIfNotOk(r, data, 'COMM_P002');
            throwIfNotOk(r, data, 'COMM_P002');
            return data;
        },

        /** 发帖：正文 + 可选图片 data URL 数组（image/*，服务端校验大小与数量） */
        async communityCreatePost(token, body) {
            var r = await fetch(joinUrl('/api/community/posts'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify(body || {}),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_P003');
            return data;
        },

        async communityDeletePost(token, postId) {
            var r = await fetch(joinUrl('/api/community/posts/' + encodeURIComponent(postId)), {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_P014');
            return data;
        },

        async communityReplyPost(token, postId, content) {
            var r = await fetch(joinUrl('/api/community/posts/' + encodeURIComponent(postId) + '/replies'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ content: content }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_P008');
            return data;
        },

        async communityDeleteReply(token, postId, replyId) {
            var r = await fetch(
                joinUrl(
                    '/api/community/posts/' +
                        encodeURIComponent(postId) +
                        '/replies/' +
                        encodeURIComponent(replyId)
                ),
                {
                    method: 'DELETE',
                    headers: { Authorization: 'Bearer ' + token },
                }
            );
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_P013');
            return data;
        },

        async communityChatFetch(afterSeq) {
            var q = '';
            if (afterSeq != null && Number(afterSeq) > 0) {
                q = '?afterSeq=' + encodeURIComponent(afterSeq);
            }
            var r = await fetch(joinUrl('/api/community/chat') + q);
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'SRV_001');
            return data;
        },

        async communityChatSend(token, payload) {
            var body =
                typeof payload === 'string'
                    ? { text: payload, images: [] }
                    : Object.assign({ text: '', images: [] }, payload || {});
            var r = await fetch(joinUrl('/api/community/chat'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({
                    text: body.text != null ? body.text : '',
                    images: Array.isArray(body.images) ? body.images : [],
                }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_C001');
            return data;
        },

        async communityChatDelete(token, messageId) {
            var r = await fetch(joinUrl('/api/community/chat/' + encodeURIComponent(messageId)), {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_C006');
            return data;
        },

        async communityChatPin(token, messageId) {
            var r = await fetch(joinUrl('/api/community/chat/pin'), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ messageId: messageId || null }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_C007');
            return data;
        },

        async communityRoster(token) {
            var r = await fetch(joinUrl('/api/community/roster'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'AUTH_S003');
            return data;
        },

        async communityInbox(token) {
            var r = await fetch(joinUrl('/api/community/inbox'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'AUTH_S003');
            return data;
        },

        async communityDmFetch(token, peerBindingId, afterSeq) {
            var q = '?peerBindingId=' + encodeURIComponent(peerBindingId);
            if (afterSeq != null && Number(afterSeq) > 0) {
                q += '&afterSeq=' + encodeURIComponent(afterSeq);
            }
            var r = await fetch(joinUrl('/api/community/dm') + q, {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_D001');
            return data;
        },

        async communityDmSend(token, peerBindingId, payload) {
            var body =
                typeof payload === 'string'
                    ? { text: payload, images: [] }
                    : Object.assign({ text: '', images: [] }, payload || {});
            var r = await fetch(joinUrl('/api/community/dm'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({
                    peerBindingId: peerBindingId,
                    text: body.text != null ? body.text : '',
                    images: Array.isArray(body.images) ? body.images : [],
                }),
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_C001');
            return data;
        },

        async communityDmDelete(token, messageId) {
            var r = await fetch(joinUrl('/api/community/dm/' + encodeURIComponent(messageId)), {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            throwIfNotOk(r, data, 'COMM_C006');
            return data;
        },
    };
})();
