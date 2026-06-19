/**
 * 舰队帖子详情页
 */
(function () {
    'use strict';

    var AUTH_KEY = 'ussHangzhouAuthSession';
    var URL_RE = /(https?:\/\/[^\s<>"']+)/gi;

    function loadSession() {
        try {
            var raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            return null;
        }
        return null;
    }

    function isLoggedIn() {
        var s = loadSession();
        return !!(s && s.token);
    }

    function sessionIsStaff() {
        var s = loadSession();
        return !!(s && s.token && (s.isSuperAdmin || s.isAdmin));
    }

    function postIsMine(p) {
        var s = loadSession();
        if (!s || !s.bindingId || !p) return false;
        return (
            String(s.bindingId).trim().toLowerCase() ===
            String(p.bindingId || '')
                .trim()
                .toLowerCase()
        );
    }

    function replyIsMine(r) {
        return postIsMine(r);
    }

    function getPostIdFromUrl() {
        function fromSearchString(qs) {
            var q = String(qs || '');
            var m = /(?:^|[?&])id=([^&#]*)/.exec(q);
            if (m && m[1] !== '') {
                try {
                    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
                } catch (e1) {
                    return String(m[1] || '').trim();
                }
            }
            m = /(?:^|[?&])postId=([^&#]*)/.exec(q);
            if (m && m[1] !== '') {
                try {
                    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
                } catch (e2) {
                    return String(m[1] || '').trim();
                }
            }
            return '';
        }

        try {
            var u = new URL(window.location.href);
            var id = (
                u.searchParams.get('id') ||
                u.searchParams.get('postId') ||
                ''
            ).trim();
            if (!id) {
                var hashRaw = String(u.hash || '').replace(/^#/, '');
                if (hashRaw.indexOf('id=') === 0) {
                    try {
                        id = decodeURIComponent(hashRaw.slice(3)).trim();
                    } catch (e3) {
                        id = hashRaw.slice(3).trim();
                    }
                } else if (hashRaw.indexOf('postId=') === 0) {
                    try {
                        id = decodeURIComponent(hashRaw.slice(7)).trim();
                    } catch (e4) {
                        id = hashRaw.slice(7).trim();
                    }
                }
            }
            if (id) return id;
        } catch (e) {
            /* fall through */
        }
        return fromSearchString(window.location.search || '');
    }

    function resolveThumb(rel) {
        if (window.UssAuthApi && typeof window.UssAuthApi.communityImageThumbUrl === 'function') {
            return window.UssAuthApi.communityImageThumbUrl(rel);
        }
        return resolveAsset(rel);
    }

    function resolveAsset(rel) {
        if (window.UssAuthApi && typeof window.UssAuthApi.resolveAssetUrl === 'function') {
            return window.UssAuthApi.resolveAssetUrl(rel);
        }
        return rel;
    }

    function formatTime(iso) {
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(d);
        } catch (e) {
            return '';
        }
    }

    function authorInitial(bindingId, authorLabel) {
        if (authorLabel) {
            var label = String(authorLabel).trim();
            if (label) return label.charAt(0);
        }
        var s = String(bindingId || '').trim();
        if (s === '__honghou__') return '红';
        return s ? s.charAt(0).toUpperCase() : '?';
    }

    function resolveAvatarUrl(bindingId, avatarUrl) {
        if (avatarUrl) return avatarUrl;
        if (String(bindingId || '').trim().toLowerCase() === '__honghou__') {
            return window.USS_HONGHOU_AVATAR || '/avatars/honghou.jpg';
        }
        return null;
    }

    function avatarSrc(avatarUrl) {
        if (avatarUrl && window.UssAuthApi) {
            var url = resolveAsset(avatarUrl);
            if (url) return url;
        }
        return window.USS_DEFAULT_AVATAR || 'default-avatar.png';
    }

    function avatarFallback(initial) {
        var ch = String(initial || '?').charAt(0).toUpperCase();
        return (
            'data:image/svg+xml,' +
            encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#1e4d6b"/><text x="32" y="40" text-anchor="middle" font-size="28" fill="#a8d8e8" font-family="sans-serif">' +
                    ch +
                    '</text></svg>'
            )
        );
    }

    function normalizeUrl(url) {
        return String(url || '').replace(/[.,;:!?，。；：！？、）」』\]]+$/u, '');
    }

    function appendTextWithLinks(parent, text) {
        var raw = String(text != null ? text : '');
        if (!raw) return;
        var lastIndex = 0;
        URL_RE.lastIndex = 0;
        var match;
        while ((match = URL_RE.exec(raw)) !== null) {
            if (match.index > lastIndex) {
                parent.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
            }
            var href = normalizeUrl(match[0]);
            if (href && /^https?:\/\//i.test(href)) {
                var link = document.createElement('a');
                link.className = 'community-text-link';
                link.href = href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = match[0];
                parent.appendChild(link);
            } else {
                parent.appendChild(document.createTextNode(match[0]));
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < raw.length) {
            parent.appendChild(document.createTextNode(raw.slice(lastIndex)));
        }
    }

    function applyPlainTextWithLinks(el, text) {
        el.innerHTML = '';
        appendTextWithLinks(el, text);
    }

    function rsiCitizenProfileUrl(handle) {
        var h = String(handle || '').trim();
        if (!h || h === '__honghou__') return '';
        return 'https://robertsspaceindustries.com/en/citizens/' + encodeURIComponent(h);
    }

    function buildAuthorRow(bindingId, avatarUrl, createdAt, trailingEl, authorLabel) {
        var row = document.createElement('div');
        row.className = 'community-author-row';
        var displayName =
            authorLabel != null && String(authorLabel).trim()
                ? String(authorLabel).trim()
                : String(bindingId || '—');
        if (String(bindingId || '').trim().toLowerCase() === '__honghou__' || authorLabel) {
            row.classList.add('community-author-row--bot');
        }
        var avWrap = document.createElement('div');
        avWrap.className = 'community-author-avatar';
        var img = document.createElement('img');
        img.className = 'community-author-avatar-img';
        img.alt = displayName + ' 头像';
        img.decoding = 'async';
        img.loading = 'lazy';
        var remote = avatarSrc(resolveAvatarUrl(bindingId, avatarUrl));
        var fallback = avatarFallback(authorInitial(bindingId, authorLabel));
        img.src = fallback;
        if (remote && remote !== fallback && remote !== (window.USS_DEFAULT_AVATAR || 'default-avatar.png')) {
            img.src = remote;
        }
        var rsi = rsiCitizenProfileUrl(bindingId);
        if (rsi) {
            var a = document.createElement('a');
            a.className = 'community-author-avatar-link';
            a.href = rsi;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.setAttribute('aria-label', '在 RSI 打开 ' + String(bindingId || '玩家') + ' 的个人页');
            a.appendChild(img);
            avWrap.appendChild(a);
        } else {
            avWrap.appendChild(img);
        }
        var idEl = document.createElement('span');
        idEl.className = 'community-author-id';
        idEl.textContent = displayName;
        var timeEl = document.createElement('time');
        timeEl.className = 'community-author-time';
        timeEl.dateTime = createdAt || '';
        timeEl.textContent = formatTime(createdAt);
        row.appendChild(avWrap);
        row.appendChild(idEl);
        row.appendChild(timeEl);
        if (trailingEl) row.appendChild(trailingEl);
        return row;
    }

    function openLightbox(src) {
        if (window.UssCommunityImageLightbox) window.UssCommunityImageLightbox.open(src);
    }

    function showConfirm(message, danger) {
        return new Promise(function (resolve) {
            var root = document.getElementById('communityConfirmModal');
            var msgEl = document.getElementById('communityConfirmMsg');
            var okBtn = document.getElementById('communityConfirmOk');
            var cancelBtn = document.getElementById('communityConfirmCancel');
            if (!root || !msgEl || !okBtn || !cancelBtn) {
                resolve(window.confirm(message || '确定？'));
                return;
            }
            msgEl.textContent = message || '确定？';
            okBtn.textContent = danger ? '删除' : '确定';
            if (danger) root.classList.add('community-confirm-modal--danger');
            else root.classList.remove('community-confirm-modal--danger');

            function cleanup(result) {
                root.classList.remove('is-open');
                root.hidden = true;
                root.setAttribute('aria-hidden', 'true');
                document.removeEventListener('keydown', onKey);
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                resolve(result);
            }
            function onOk() {
                cleanup(true);
            }
            function onCancel() {
                cleanup(false);
            }
            function onKey(ev) {
                if (ev.key === 'Escape') cleanup(false);
            }
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            document.addEventListener('keydown', onKey);
            root.hidden = false;
            root.setAttribute('aria-hidden', 'false');
            root.classList.add('is-open');
        });
    }

    function renderPostDetail(p) {
        var host = document.getElementById('communityPostDetail');
        if (!host) return;
        host.innerHTML = '';

        var card = document.createElement('article');
        card.className = 'community-post-detail-card community-post-card';

        var main = document.createElement('div');
        main.className = 'community-post-main';

        var head = document.createElement('header');
        head.className = 'community-post-head';

        if (sessionIsStaff() || postIsMine(p)) {
            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'community-post-delete';
            del.textContent = '删除';
            del.style.opacity = '1';
            del.addEventListener('click', async function () {
                var sure = await showConfirm('确定删除该帖子？', true);
                if (!sure) return;
                var sess = loadSession();
                if (!sess || !sess.token) return;
                del.disabled = true;
                try {
                    await window.UssAuthApi.communityDeletePost(sess.token, p.id);
                    window.location.href = 'index.html#community-section';
                } catch (err) {
                    alert((err && err.message) || '删除失败');
                    del.disabled = false;
                }
            });
            head.appendChild(
                buildAuthorRow(p.bindingId, p.avatarUrl, p.createdAt, del, p.authorLabel)
            );
        } else {
            head.appendChild(buildAuthorRow(p.bindingId, p.avatarUrl, p.createdAt, null, p.authorLabel));
        }

        main.appendChild(head);

        if (p.content) {
            var body = document.createElement('div');
            body.className = 'community-post-body';
            applyPlainTextWithLinks(body, p.content);
            main.appendChild(body);
        }

        var imgs = Array.isArray(p.images) ? p.images : [];
        if (imgs.length) {
            var grid = document.createElement('div');
            grid.className = 'community-post-images';
            imgs.forEach(function (rel) {
                if (typeof rel !== 'string' || rel.indexOf('/community-uploads/') !== 0) return;
                var im = document.createElement('img');
                im.className = 'community-post-img';
                im.loading = 'lazy';
                im.decoding = 'async';
                im.alt = '帖子配图';
                im.style.cursor = 'pointer';
                im.dataset.fullSrc = resolveAsset(rel);
                im.src = resolveThumb(rel);
                im.addEventListener('click', function () {
                    openLightbox(im.dataset.fullSrc || im.src);
                });
                grid.appendChild(im);
            });
            if (grid.childNodes.length) main.appendChild(grid);
        }

        var replies = Array.isArray(p.replies) ? p.replies : [];
        var repliesBlock = document.createElement('div');
        repliesBlock.className = 'community-replies';

        if (replies.length) {
            var repliesHead = document.createElement('div');
            repliesHead.className = 'community-replies-head';
            repliesHead.textContent = replies.length + ' 条回复';
            repliesBlock.appendChild(repliesHead);
            replies.forEach(function (r) {
                var item = document.createElement('div');
                item.className = 'community-reply-item';
                var replyDelBtn = null;
                if (sessionIsStaff() || replyIsMine(r)) {
                    replyDelBtn = document.createElement('button');
                    replyDelBtn.type = 'button';
                    replyDelBtn.className = 'community-reply-delete';
                    replyDelBtn.textContent = '删除';
                    replyDelBtn.style.opacity = '1';
                    replyDelBtn.addEventListener('click', async function (ev) {
                        ev.stopPropagation();
                        var sure = await showConfirm('确定删除该条回复？', true);
                        if (!sure) return;
                        var sess = loadSession();
                        if (!sess || !sess.token || !r.id) return;
                        replyDelBtn.disabled = true;
                        try {
                            await window.UssAuthApi.communityDeleteReply(sess.token, p.id, r.id);
                            await loadPost();
                        } catch (err) {
                            alert((err && err.message) || '删除失败');
                            replyDelBtn.disabled = false;
                        }
                    });
                }
                item.appendChild(
                    buildAuthorRow(r.bindingId, r.avatarUrl, r.createdAt, replyDelBtn, r.authorLabel)
                );
                var replyBody = document.createElement('div');
                replyBody.className = 'community-reply-body';
                applyPlainTextWithLinks(replyBody, String(r.content != null ? r.content : ''));
                item.appendChild(replyBody);
                repliesBlock.appendChild(item);
            });
        }

        var replyForm = document.createElement('div');
        replyForm.className = 'community-reply-form';
        var replyTa = document.createElement('textarea');
        replyTa.className = 'community-reply-input';
        replyTa.rows = 3;
        replyTa.maxLength = 2000;
        replyTa.placeholder = isLoggedIn() ? '写下你的回复…' : '登录后可回复';
        replyTa.disabled = !isLoggedIn();
        var replyActions = document.createElement('div');
        replyActions.className = 'community-reply-actions';
        var replyHint = document.createElement('p');
        replyHint.className = 'community-reply-hint';
        var replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.className = 'primary-btn community-reply-btn';
        replyBtn.textContent = '回复';
        replyBtn.disabled = !isLoggedIn();
        replyBtn.addEventListener('click', async function () {
            var sess = loadSession();
            if (!sess || !sess.token) {
                replyHint.textContent = '请先登录。';
                return;
            }
            var content = String(replyTa.value || '').trim();
            if (!content) {
                replyHint.textContent = '回复内容不能为空。';
                return;
            }
            replyHint.textContent = '';
            replyBtn.disabled = true;
            replyBtn.textContent = '发送中…';
            try {
                await window.UssAuthApi.communityReplyPost(sess.token, p.id, content);
                replyTa.value = '';
                await loadPost();
            } catch (err) {
                replyHint.textContent = (err && err.message) || '回复失败';
            } finally {
                replyBtn.disabled = !isLoggedIn();
                replyBtn.textContent = '回复';
            }
        });
        replyActions.appendChild(replyBtn);
        replyForm.appendChild(replyTa);
        replyForm.appendChild(replyActions);
        replyForm.appendChild(replyHint);
        repliesBlock.appendChild(replyForm);
        main.appendChild(repliesBlock);

        card.appendChild(main);
        host.appendChild(card);
    }

    function showError(msg) {
        var host = document.getElementById('communityPostDetail');
        if (!host) return;
        host.innerHTML = '<div class="community-post-detail-error" role="alert">' + String(msg || '加载失败') + '</div>';
    }

    async function loadPost() {
        var postId = getPostIdFromUrl();
        if (!postId) {
            showError('缺少帖子 ID');
            return;
        }
        if (!window.UssAuthApi) {
            showError('未加载 API 模块');
            return;
        }
        try {
            var data = await window.UssAuthApi.communityGetPost(postId);
            if (!data || !data.post) {
                showError('帖子不存在');
                return;
            }
            document.title = (data.post.bindingId || '帖子') + ' · 贴子 · USSXC';
            renderPostDetail(data.post);
        } catch (e) {
            showError((e && e.message) || '加载失败');
        }
    }

    function init() {
        if (window.UssCommunityImageLightbox) window.UssCommunityImageLightbox.ensureOverlay();
        loadPost();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
