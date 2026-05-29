(function () {
    'use strict';

    var POLL_MS = 5000;
    var expandedChannels = {};
    /** 与 styles.css --oopz-member-h 折叠高度一致，约可显示 3 行成员 */
    var COLLAPSED_MEMBER_ROWS = 3;

    var statusDot = document.getElementById('oopzBridgeStatusDot');
    var statusText = document.getElementById('oopzBridgeStatusText');
    var channelsRoot = document.getElementById('oopzBridgeChannels');
    var logsRoot = document.getElementById('oopzBridgeLogs');
    var legacyAnnounceRoot = document.getElementById('oopzBridgeAnnouncements');
    var logRoot = logsRoot || legacyAnnounceRoot;
    var errorBox = document.getElementById('oopzBridgeError');

    if (!channelsRoot && !logRoot) return;

    function apiBase() {
        if (window.UssAuthApi && window.UssAuthApi.base) {
            return String(window.UssAuthApi.base).replace(/\/$/, '');
        }
        if (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) {
            return String(window.USS_AUTH_API_BASE).replace(/\/$/, '');
        }
        return 'http://127.0.0.1:3789';
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatTime(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('zh-CN', { hour12: false });
        } catch (e) {
            return iso;
        }
    }

    function formatLogTime(iso) {
        if (!iso) return '—';
        try {
            var d = new Date(iso);
            var now = new Date();
            var opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
            if (
                d.getFullYear() === now.getFullYear() &&
                d.getMonth() === now.getMonth() &&
                d.getDate() === now.getDate()
            ) {
                return d.toLocaleTimeString('zh-CN', opts);
            }
            return (
                (d.getMonth() + 1) +
                '/' +
                d.getDate() +
                ' ' +
                d.toLocaleTimeString('zh-CN', opts)
            );
        } catch (e) {
            return iso;
        }
    }

    var LOG_SECTIONS = [
        { id: 'enter', title: '进入语音', badge: '入', badgeTitle: '进入语音频道' },
        { id: 'broadcast', title: '播报', badge: '播', badgeTitle: '语音播报' },
        { id: 'checkin', title: '签到', badge: '签', badgeTitle: '签到' },
    ];
    var LOG_SECTION_LIMIT = 20;

    function classifyLogKind(item) {
        if (!item || typeof item !== 'object') return 'broadcast';
        var type = String(item.type || '').trim();
        if (type === 'checkin' || type === 'enter' || type === 'broadcast') return type;
        if (type === 'voice') {
            var text = String(item.text || '').trim();
            var userName = String(item.userName || '').trim();
            if (userName === '合并播报' || /欢迎大家加入/.test(text)) return 'enter';
            if (/欢迎/.test(text) && /加入语音|登舰|语音频道|登舰成功/.test(text)) return 'enter';
            if (userName && userName !== '合并播报' && /欢迎/.test(text) && text.indexOf(userName) >= 0) {
                return 'enter';
            }
            return 'broadcast';
        }
        return 'broadcast';
    }

    function normalizeLogItem(item) {
        if (!item || typeof item !== 'object') return null;
        var copy = Object.assign({}, item);
        copy.type = classifyLogKind(copy);
        return copy;
    }

    function logTypeMeta(type) {
        for (var i = 0; i < LOG_SECTIONS.length; i++) {
            if (LOG_SECTIONS[i].id === type) return LOG_SECTIONS[i];
        }
        return LOG_SECTIONS[1];
    }

    function logGroupKey(item) {
        var type = classifyLogKind(item);
        if (type === 'checkin') {
            return (
                'checkin:' +
                String(item.id || item.userName + '|' + (item.branch || '') + '|' + (item.at || ''))
            );
        }
        return type + ':' + String(item.text || '').trim();
    }

    function logDisplayText(item) {
        if (item.type === 'checkin') {
            var who = item.userName || item.bindingId || '成员';
            var branch = item.branchLabel || item.branch || '';
            var pts = item.points != null ? item.points : 1;
            var tag = item.oopzAuto ? ' · OOPZ自动' : item.adminMakeup ? ' · 补签' : '';
            return who + ' 签到 ' + branch + ' (+' + pts + ')' + tag;
        }
        return String(item.text || '').trim() || '—';
    }

    /** 相同文案合并为一行，减少重复刷屏 */
    function groupLogsForDisplay(list) {
        var sorted = list.slice().sort(function (a, b) {
            var ta = new Date(a.at).getTime();
            var tb = new Date(b.at).getTime();
            return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        });
        var order = [];
        var byKey = {};
        sorted.forEach(function (item) {
            var key = logGroupKey(item);
            if (!byKey[key]) {
                byKey[key] = {
                    key: key,
                    type: classifyLogKind(item),
                    latest: item,
                    count: 1,
                    oldestAt: item.at,
                };
                order.push(key);
            } else {
                byKey[key].count += 1;
                var oldT = new Date(byKey[key].oldestAt).getTime();
                var newT = new Date(item.at).getTime();
                if (Number.isFinite(newT) && (!Number.isFinite(oldT) || newT < oldT)) {
                    byKey[key].oldestAt = item.at;
                }
            }
        });
        return order.map(function (k) {
            return byKey[k];
        });
    }

    function setError(msg) {
        if (!errorBox) return;
        if (!msg) {
            errorBox.hidden = true;
            errorBox.textContent = '';
            return;
        }
        errorBox.hidden = false;
        errorBox.textContent = msg;
    }

    function memberAvatarHtml(m) {
        var name = String(m.name || m.uid || '?');
        var initial = name.charAt(0) || '?';
        if (m.avatar) {
            return (
                '<span class="oopz-bridge-member-avatar-wrap">' +
                '<img class="oopz-bridge-member-avatar" src="' + escapeHtml(m.avatar) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ' +
                'onerror="this.parentElement.classList.add(\'is-fallback\')">' +
                '<span class="oopz-bridge-member-avatar oopz-bridge-member-avatar--fallback" aria-hidden="true">' + escapeHtml(initial) + '</span>' +
                '</span>'
            );
        }
        return (
            '<span class="oopz-bridge-member-avatar-wrap is-fallback">' +
            '<span class="oopz-bridge-member-avatar oopz-bridge-member-avatar--fallback" aria-hidden="true">' + escapeHtml(initial) + '</span>' +
            '</span>'
        );
    }

    function memberIdTipText(m) {
        var oopzId = String(m.oopzId || '').trim();
        if (oopzId) return 'OOPZ ID：' + oopzId;
        var uid = String(m.uid || '').trim();
        if (uid) return 'UID：' + uid;
        return '';
    }

    function memberCopyIdValue(m) {
        var oopzId = String(m.oopzId || '').trim();
        if (oopzId) return oopzId;
        return String(m.uid || '').trim();
    }

    function copyTextToClipboard(text) {
        if (!text) return Promise.reject(new Error('empty'));
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('copy failed'));
            } catch (err) {
                reject(err);
            }
        });
    }

    function setupChannelToggleDelegation() {
        if (!channelsRoot || channelsRoot.dataset.toggleBound) return;
        channelsRoot.dataset.toggleBound = '1';
        channelsRoot.addEventListener('click', function (e) {
            var btn = e.target.closest('.oopz-bridge-channel-toggle');
            if (!btn || !channelsRoot.contains(btn)) return;
            var id = btn.getAttribute('data-channel-id') || '';
            if (!id) return;
            expandedChannels[id] = !expandedChannels[id];
            var card = btn.closest('.oopz-bridge-channel');
            if (!card) return;
            var expanded = !!expandedChannels[id];
            card.classList.toggle('is-expanded', expanded);
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            btn.setAttribute('aria-label', expanded ? '收起成员列表' : '展开成员列表');
        });
    }

    var memberFloatTip = null;
    var activeMember = null;
    var copyFeedbackTimer = null;

    function hideMemberFloatTip() {
        if (!memberFloatTip) return;
        memberFloatTip.hidden = true;
    }

    function positionMemberFloatTip(member) {
        if (!memberFloatTip || memberFloatTip.hidden) return;
        var rect = member.getBoundingClientRect();
        memberFloatTip.style.left = '0';
        memberFloatTip.style.top = '0';
        memberFloatTip.style.visibility = 'hidden';
        memberFloatTip.hidden = false;
        var tipRect = memberFloatTip.getBoundingClientRect();
        var pad = 8;
        var left = rect.left + rect.width / 2 - tipRect.width / 2;
        var top = rect.bottom + pad;
        memberFloatTip.classList.remove('is-above');
        if (top + tipRect.height > window.innerHeight - pad) {
            top = rect.top - tipRect.height - pad;
            memberFloatTip.classList.add('is-above');
        }
        left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));
        memberFloatTip.style.left = Math.round(left) + 'px';
        memberFloatTip.style.top = Math.round(top) + 'px';
        memberFloatTip.style.visibility = 'visible';
    }

    function showMemberFloatTip(member) {
        var inline = member.querySelector('.oopz-bridge-member-tip');
        if (!inline || !memberFloatTip) return;
        memberFloatTip.classList.remove('is-copy-feedback');
        memberFloatTip.textContent = inline.textContent;
        memberFloatTip.hidden = false;
        positionMemberFloatTip(member);
    }

    function showMemberCopyFeedback(member, message) {
        if (!memberFloatTip) return;
        memberFloatTip.classList.add('is-copy-feedback');
        memberFloatTip.textContent = message;
        memberFloatTip.hidden = false;
        positionMemberFloatTip(member);
        if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
        copyFeedbackTimer = setTimeout(function () {
            memberFloatTip.classList.remove('is-copy-feedback');
            if (activeMember === member) {
                showMemberFloatTip(member);
            } else {
                hideMemberFloatTip();
            }
        }, 1400);
    }

    function copyMemberId(member) {
        var id = member.getAttribute('data-member-id') || '';
        if (!id) return;
        copyTextToClipboard(id).then(function () {
            showMemberCopyFeedback(member, '已复制 ID：' + id);
        }).catch(function () {
            showMemberCopyFeedback(member, '复制失败，请手动选择');
        });
    }

    function setupMemberTipFloat() {
        if (!channelsRoot || channelsRoot.dataset.tipFloatBound) return;
        channelsRoot.dataset.tipFloatBound = '1';

        memberFloatTip = document.createElement('div');
        memberFloatTip.className = 'oopz-bridge-member-tip oopz-bridge-member-tip--float';
        memberFloatTip.setAttribute('role', 'tooltip');
        memberFloatTip.hidden = true;
        document.body.appendChild(memberFloatTip);

        var hideTimer = null;

        channelsRoot.addEventListener('mouseover', function (e) {
            var member = e.target.closest('.oopz-bridge-member.has-id-tip');
            if (!member || !channelsRoot.contains(member)) return;
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            activeMember = member;
            showMemberFloatTip(member);
        });

        channelsRoot.addEventListener('mouseout', function (e) {
            var member = e.target.closest('.oopz-bridge-member.has-id-tip');
            if (!member || !channelsRoot.contains(member)) return;
            var related = e.relatedTarget;
            if (related && member.contains(related)) return;
            hideTimer = setTimeout(function () {
                activeMember = null;
                hideMemberFloatTip();
            }, 60);
        });

        window.addEventListener('scroll', function () {
            if (activeMember) positionMemberFloatTip(activeMember);
        }, true);

        window.addEventListener('resize', function () {
            if (activeMember) positionMemberFloatTip(activeMember);
        });
    }

    function setupMemberIdCopy() {
        if (!channelsRoot || channelsRoot.dataset.idCopyBound) return;
        channelsRoot.dataset.idCopyBound = '1';
        channelsRoot.addEventListener('contextmenu', function (e) {
            var member = e.target.closest('.oopz-bridge-member.has-id-tip');
            if (!member || !channelsRoot.contains(member)) return;
            if (!member.getAttribute('data-member-id')) return;
            e.preventDefault();
            activeMember = member;
            copyMemberId(member);
        });
    }

    function renderChannels(areas) {
        if (!channelsRoot) return;
        hideMemberFloatTip();
        if (!areas || !areas.length) {
            channelsRoot.innerHTML = '<p class="oopz-bridge-empty">暂无机器人接入的频道数据，请确认 oopz-bot 已启动并上报。</p>';
            return;
        }

        var html = '';
        areas.forEach(function (area) {
            html += '<section class="oopz-bridge-area">';
            if (!area.channels || !area.channels.length) {
                html += '<p class="oopz-bridge-empty">该域暂无在线语音频道成员。</p>';
            } else {
                html += '<div class="oopz-bridge-channel-grid">';
                area.channels.forEach(function (ch) {
                    var members = ch.members || [];
                    var channelId = String(ch.channelId || ch.channelName || '');
                    var isExpanded = !!expandedChannels[channelId];
                    var hasMore = members.length > COLLAPSED_MEMBER_ROWS;
                    html += '<div class="oopz-bridge-channel' + (isExpanded ? ' is-expanded' : '') + (hasMore ? ' has-toggle' : '') + '">';
                    html += '<div class="oopz-bridge-channel-head">';
                    html += '<p class="oopz-bridge-channel-name">' + escapeHtml(ch.channelName || ch.channelId) + '</p>';
                    html += '<div class="oopz-bridge-channel-actions">';
                    html += '<span class="oopz-bridge-channel-count">' + members.length + '</span>';
                    if (hasMore) {
                        html += '<button type="button" class="oopz-bridge-channel-toggle" data-channel-id="' + escapeHtml(channelId) + '" aria-expanded="' + (isExpanded ? 'true' : 'false') + '" aria-label="' + (isExpanded ? '收起成员列表' : '展开成员列表') + '" title="' + (isExpanded ? '收起成员列表' : '展开全部 ' + members.length + ' 人') + '">';
                        html += '<span class="oopz-bridge-channel-toggle-icon" aria-hidden="true"></span>';
                        html += '</button>';
                    }
                    html += '</div></div>';
                    html += '<div class="oopz-bridge-member-scroll">';
                    html += '<ul class="oopz-bridge-member-list">';
                    members.forEach(function (m) {
                        var tip = memberIdTipText(m);
                        var copyId = memberCopyIdValue(m);
                        html += '<li class="oopz-bridge-member' + (tip ? ' has-id-tip' : '') + '"' +
                            (copyId ? ' data-member-id="' + escapeHtml(copyId) + '"' : '') + '>';
                        html += memberAvatarHtml(m);
                        html += '<span class="oopz-bridge-member-name">' + escapeHtml(m.name || m.uid) + '</span>';
                        if (tip) {
                            html += '<span class="oopz-bridge-member-tip" role="tooltip">' + escapeHtml(tip) + '</span>';
                        }
                        html += '</li>';
                    });
                    html += '</ul></div></div>';
                });
                html += '</div>';
            }
            html += '</section>';
        });
        channelsRoot.innerHTML = html;
    }

    var LOG_RETENTION_MS = 24 * 60 * 60 * 1000;

    function isWithinLogRetention(at) {
        var t = new Date(at).getTime();
        if (!isFinite(t) || t <= 0) return false;
        return Date.now() - t <= LOG_RETENTION_MS;
    }

    function buildLogsFromState(data) {
        var logs = [];
        if (Array.isArray(data.logs) && data.logs.length) {
            logs = data.logs;
        } else {
            var legacy = Array.isArray(data.announcements) ? data.announcements : [];
            logs = legacy.map(function (item) {
                var row = {
                    type: 'broadcast',
                    id: 'voice:' + (item.id || item.at),
                    at: item.at,
                    text: item.text,
                    channelName: item.channelName,
                    userName: item.userName,
                    audioUrl: item.audioUrl,
                };
                row.type = classifyLogKind(row);
                return row;
            });
        }
        return logs.filter(function (item) {
            return item && isWithinLogRetention(item.at);
        });
    }

    function renderLogTimeline(groups) {
        var html = '<ul class="oopz-bridge-log-timeline">';
        groups.forEach(function (g) {
            var item = g.latest;
            var msg = logDisplayText(item);
            var timeStr = formatLogTime(item.at);
            if (g.count > 1 && g.oldestAt && g.oldestAt !== item.at) {
                timeStr = formatLogTime(g.oldestAt) + ' ~ ' + formatLogTime(item.at);
            }
            var meta = logTypeMeta(g.type || classifyLogKind(item));
            html +=
                '<li class="oopz-bridge-log-row oopz-bridge-log-row--' +
                escapeHtml(meta.id) +
                '">';
            html += '<span class="oopz-bridge-log-row-time">' + escapeHtml(timeStr) + '</span>';
            html +=
                '<span class="oopz-bridge-log-row-type" title="' +
                escapeHtml(meta.badgeTitle) +
                '">' +
                escapeHtml(meta.badge) +
                '</span>';
            html += '<span class="oopz-bridge-log-row-msg" title="' + escapeHtml(msg) + '">' + escapeHtml(msg) + '</span>';
            if (g.count > 1) {
                html += '<span class="oopz-bridge-log-row-count">×' + g.count + '</span>';
            }
            html += '</li>';
        });
        html += '</ul>';
        return html;
    }

    function renderLogs(list) {
        if (!logRoot) return;
        list = (list || [])
            .map(normalizeLogItem)
            .filter(function (item) {
                return item && isWithinLogRetention(item.at);
            });
        if (!list.length) {
            logRoot.innerHTML = '<p class="oopz-bridge-empty">暂无日志记录。</p>';
            return;
        }

        var buckets = { enter: [], broadcast: [], checkin: [] };
        list.forEach(function (item) {
            var kind = classifyLogKind(item);
            if (!buckets[kind]) buckets[kind] = [];
            buckets[kind].push(item);
        });

        var sectionPayloads = [];
        var groupedTotal = 0;
        LOG_SECTIONS.forEach(function (section) {
            var sectionList = buckets[section.id] || [];
            if (!sectionList.length) return;
            var groups = groupLogsForDisplay(sectionList).slice(0, LOG_SECTION_LIMIT);
            groupedTotal += groups.length;
            sectionPayloads.push({ section: section, groups: groups, count: sectionList.length });
        });

        var html = '<div class="oopz-bridge-log-summary">近 24 小时 · 共 ' + list.length + ' 条';
        if (groupedTotal < list.length) {
            html += ' · 合并显示 ' + groupedTotal + ' 组';
        }
        html += '</div><div class="oopz-bridge-log-sections">';
        sectionPayloads.forEach(function (block) {
            html +=
                '<section class="oopz-bridge-log-section" aria-label="' +
                escapeHtml(block.section.title) +
                '">';
            html +=
                '<h4 class="oopz-bridge-log-section-title">' +
                escapeHtml(block.section.title) +
                '<span class="oopz-bridge-log-section-count">' +
                block.count +
                '</span></h4>';
            html += renderLogTimeline(block.groups);
            html += '</section>';
        });
        html += '</div>';
        logRoot.innerHTML = html;
    }

    function renderState(data) {
        if (!data || !data.ok) {
            setError('无法读取桥接状态');
            return;
        }
        setError('');

        if (statusDot) statusDot.classList.toggle('is-online', !!data.botOnline);
        if (statusText) {
            statusText.textContent = data.botOnline
                ? '机器人在线' + (data.botName ? ' · ' + data.botName : '')
                : '机器人离线';
        }

        renderChannels(data.areas || []);
        renderLogs(buildLogsFromState(data));
    }

    function fetchState() {
        fetch(apiBase() + '/api/oopz-bridge/state', { cache: 'no-store' })
            .then(function (r) {
                return r.json().then(function (j) {
                    return { ok: r.ok, data: j };
                });
            })
            .then(function (res) {
                if (!res.ok) throw new Error((res.data && res.data.message) || 'HTTP 错误');
                renderState(res.data);
                if (typeof window.refreshOopzUserPrefs === 'function') {
                    window.refreshOopzUserPrefs();
                }
            })
            .catch(function (e) {
                setError('拉取失败：' + (e.message || '网络错误'));
            });
    }

    setupChannelToggleDelegation();
    setupMemberTipFloat();
    setupMemberIdCopy();
    fetchState();
    setInterval(fetchState, POLL_MS);
})();
