/**
 * 认证 API 客户端。
 * 默认基址：auth-config.js 按域名设置；若无则退回 http://127.0.0.1:3789（与 backend 默认端口一致）。
 * 本地：在仓库根目录启动 backend（npm start）；先于本文件设置 window.USS_AUTH_API_BASE 可覆盖。
 */
(function () {
    var AUTH_API_BASE = (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) || 'http://127.0.0.1:3789';

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
        if (!r.ok) throw new Error(data.message || '加载分部数据失败');
        return data;
    }

    async function adminJson(token, path, init) {
        init = init || {};
        var headers = Object.assign({}, init.headers || {}, { Authorization: 'Bearer ' + token });
        var r = await fetch(joinUrl(path), Object.assign({}, init, { headers: headers }));
        var data = await parseJson(r);
        if (!r.ok) throw new Error(data.message || '请求失败');
        return data;
    }

    window.UssAuthApi = {
        base: AUTH_API_BASE,

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
            if (!r.ok) throw new Error(data.message || '注册失败');
            return data;
        },

        async login(body) {
            var r = await fetch(joinUrl('/api/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '登录失败');
            return data;
        },

        async me(token) {
            var r = await fetch(joinUrl('/api/me'), {
                headers: { Authorization: 'Bearer ' + token }
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '会话无效');
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
            if (!r.ok) throw new Error(data.message || '加载状态失败');
            return data;
        },

        async checkinHub(token) {
            var r = await fetch(joinUrl('/api/checkin/hub'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '加载中心失败');
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
            if (!r.ok) throw new Error(data.message || '加载验证失败');
            return data;
        },

        async checkinCaptchaPuzzle(token, captchaId) {
            var id = encodeURIComponent(String(captchaId || '').trim());
            var r = await fetch(joinUrl('/api/checkin/captcha/' + id + '/puzzle'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '加载拼图失败');
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
            if (!r.ok) throw new Error(data.message || '签到现在不可用');
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

        /** 首页舰员交流区：帖子列表（无需登录） */
        async communityListPosts(limit) {
            var q = '';
            if (limit != null && limit !== '') {
                q = '?limit=' + encodeURIComponent(limit);
            }
            var r = await fetch(joinUrl('/api/community/posts') + q);
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '加载帖子失败');
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
            if (!r.ok) throw new Error(data.message || '发帖失败');
            return data;
        },

        async communityDeletePost(token, postId) {
            var r = await fetch(joinUrl('/api/community/posts/' + encodeURIComponent(postId)), {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '删除失败');
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
            if (!r.ok) throw new Error(data.message || '回复失败');
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
            if (!r.ok) throw new Error(data.message || '删除失败');
            return data;
        },

        async communityChatFetch(afterSeq) {
            var q = '';
            if (afterSeq != null && Number(afterSeq) > 0) {
                q = '?afterSeq=' + encodeURIComponent(afterSeq);
            }
            var r = await fetch(joinUrl('/api/community/chat') + q);
            var data = await parseJson(r);
            if (!r.ok) {
                var err = new Error(data.message || '加载聊天失败');
                err.status = r.status;
                throw err;
            }
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
            if (!r.ok) throw new Error(data.message || '发送失败');
            return data;
        },

        async communityChatDelete(token, messageId) {
            var r = await fetch(joinUrl('/api/community/chat/' + encodeURIComponent(messageId)), {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '删除失败');
            return data;
        },

        async communityRoster(token) {
            var r = await fetch(joinUrl('/api/community/roster'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '加载成员列表失败');
            return data;
        },

        async communityInbox(token) {
            var r = await fetch(joinUrl('/api/community/inbox'), {
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '加载摘要失败');
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
            if (!r.ok) {
                var err = new Error(data.message || '加载私信失败');
                err.status = r.status;
                throw err;
            }
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
            if (!r.ok) throw new Error(data.message || '发送失败');
            return data;
        },

        async communityDmDelete(token, messageId) {
            var r = await fetch(joinUrl('/api/community/dm/' + encodeURIComponent(messageId)), {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            var data = await parseJson(r);
            if (!r.ok) throw new Error(data.message || '删除失败');
            return data;
        },
    };
})();
