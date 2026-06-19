(function () {
    'use strict';

    var prefsEl = document.getElementById('oopzUserPrefs');
    var statsEl = document.getElementById('oopzVoiceTimeText');
    var liveBadge = document.getElementById('oopzVoiceLiveBadge');
    var toggleWrap = document.getElementById('oopzAnnounceToggleWrap');
    var toggleEl = document.getElementById('oopzAnnounceToggle');
    var checkinPanel = document.getElementById('oopzAutoCheckinPanel');
    var checkinSingleEl = document.getElementById('oopzAutoCheckinSingle');
    var checkinCardsEl = document.getElementById('oopzAutoCheckinCards');
    var checkinRemainEl = document.getElementById('oopzAutoCheckinRemain');
    var checkinBranchListEl = document.getElementById('oopzAutoCheckinBranchList');
    if (!prefsEl || !statsEl) return;

    var announceSaving = false;

    function loadAuthSession() {
        if (window.UssAuthSessionSync && window.UssAuthSessionSync.loadAuthSession) {
            return window.UssAuthSessionSync.loadAuthSession();
        }
        try {
            var raw = sessionStorage.getItem('ussHangzhouAuthSession') || localStorage.getItem('ussHangzhouAuthSession');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function formatMinutes(mins) {
        var n = Math.max(0, Math.floor(Number(mins) || 0));
        if (n < 60) return n + ' 分钟';
        var h = Math.floor(n / 60);
        var m = n % 60;
        return h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
    }

    function stripCornerQuotes(text) {
        return String(text || '')
            .trim()
            .replace(/^[「『"']+/, '')
            .replace(/[」』"']+$/, '');
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function buildStatsLine(data) {
        var mins = data && data.onlineMinutesToday != null ? data.onlineMinutesToday : 0;
        var line = '语音在线：' + formatMinutes(mins);
        if (data && data.inVoiceNow && data.voicePresence) {
            var ch = stripCornerQuotes(data.voicePresence.channelName);
            if (ch) {
                line += ' · 当前在「' + ch + '」';
            } else {
                line += ' · 当前在语音频道中';
            }
        }
        return line;
    }

    function buildBranchRemainLine(b, data) {
        if (b.checkedInToday) {
            return '今日已签到';
        }
        if (b.readyByTime && b.scheduleOpen) {
            return '即将自动签到';
        }
        if (b.readyByTime && !b.scheduleOpen) {
            return '须签到时段内';
        }
        var remain =
            b.remainingMinutes != null
                ? b.remainingMinutes
                : Math.max(0, (b.minOnlineMinutes || 60) - branchEffectiveMins(b, data));
        var scopeHint = b.windowScoped && b.scheduleOpen ? '（开放时段内）' : '';
        return '剩余时间：' + formatMinutes(remain) + scopeHint;
    }

    function branchEffectiveMins(b, data) {
        if (b && b.onlineMinutesEffective != null) {
            return Math.max(0, Math.floor(Number(b.onlineMinutesEffective) || 0));
        }
        return data && data.onlineMinutesToday != null ? data.onlineMinutesToday : 0;
    }

    function buildBranchProgressText(b, data) {
        var label = b.label || b.id;
        var mins = branchEffectiveMins(b, data);
        if (b.checkedInToday) {
            return label + '（已签）';
        }
        var suffix = b.windowScoped && b.scheduleOpen ? '（时段内）' : '';
        return label + ' ' + mins + '/' + (b.minOnlineMinutes || 60) + ' 分' + suffix;
    }

    function buildRemainLine(data) {
        if (!data || !data.autoCheckinEnabled) {
            return '站点未开启自动签到';
        }
        var branches = Array.isArray(data.autoCheckinBranches) ? data.autoCheckinBranches : [];
        if (!branches.length) {
            return '站点未开启自动签到';
        }
        var pending = branches.filter(function (b) {
            return !b.checkedInToday;
        });
        if (pending.length === 0) {
            return '今日已全部自动签到';
        }
        var status = data.autoCheckinStatus || 'counting';
        if (status === 'pending_auto') {
            return '在线已达标，即将自动签到';
        }
        if (status === 'waiting_window') {
            return '在线已达标，须签到时段内生效';
        }
        var remain = data.autoCheckinRemainingMinutes;
        if (remain == null) {
            return '剩余时间：—';
        }
        var pendingScoped = pending.some(function (b) {
            return b.windowScoped;
        });
        var scopeHint = pendingScoped ? '（开放时段内）' : '';
        return '剩余时间：' + formatMinutes(remain) + scopeHint;
    }

    function renderSingleBranchList(data) {
        if (!checkinBranchListEl) return;
        var branches = data && Array.isArray(data.autoCheckinBranches) ? data.autoCheckinBranches : [];
        if (!branches.length) {
            checkinBranchListEl.textContent = '无';
            return;
        }
        var html = '';
        branches.forEach(function (b) {
            html +=
                '<span class="oopz-user-prefs__checkin-branch-item">' +
                escapeHtml(buildBranchProgressText(b, data)) +
                '</span>';
        });
        checkinBranchListEl.innerHTML = html;
    }

    function renderMultiCheckinCards(data) {
        if (!checkinCardsEl) return;
        var branches = data && Array.isArray(data.autoCheckinBranches) ? data.autoCheckinBranches : [];
        var html = '';
        branches.forEach(function (b) {
            html += '<div class="oopz-user-prefs__checkin-card">';
            html += '<p class="oopz-user-prefs__checkin-title">自动签到</p>';
            html +=
                '<p class="oopz-user-prefs__checkin-remain">' +
                escapeHtml(buildBranchRemainLine(b, data)) +
                '</p>';
            html += '<div class="oopz-user-prefs__checkin-branches">';
            html += '<span class="oopz-user-prefs__checkin-branches-label">开启分部：</span>';
            html +=
                '<span class="oopz-user-prefs__checkin-branch-name">' +
                escapeHtml(buildBranchProgressText(b, data)) +
                '</span>';
            html += '</div></div>';
        });
        checkinCardsEl.innerHTML = html;
    }

    function renderAutoCheckin(data, showPanel) {
        if (!checkinPanel) return;
        if (!showPanel) {
            checkinPanel.hidden = true;
            return;
        }
        checkinPanel.hidden = false;
        var branches = data && Array.isArray(data.autoCheckinBranches) ? data.autoCheckinBranches : [];
        var multi = branches.length > 1;
        checkinPanel.classList.toggle('is-multi', multi);

        if (multi) {
            if (checkinSingleEl) checkinSingleEl.hidden = true;
            if (checkinCardsEl) {
                checkinCardsEl.hidden = false;
                renderMultiCheckinCards(data);
            }
            return;
        }

        if (checkinSingleEl) checkinSingleEl.hidden = false;
        if (checkinCardsEl) {
            checkinCardsEl.hidden = true;
            checkinCardsEl.innerHTML = '';
        }
        if (checkinRemainEl) {
            checkinRemainEl.textContent = buildRemainLine(data);
            checkinRemainEl.hidden = false;
        }
        renderSingleBranchList(data);
    }

    function renderLoggedOut() {
        if (toggleWrap) toggleWrap.hidden = true;
        if (liveBadge) liveBadge.hidden = true;
        statsEl.textContent = '登录并绑定 OOPZ 后可查看语音在线时长';
        renderAutoCheckin(null, false);
    }

    function renderUnbound() {
        if (toggleWrap) toggleWrap.hidden = true;
        if (liveBadge) liveBadge.hidden = true;
        statsEl.textContent = '尚未绑定 OOPZ ID，无法统计您的语音在线时长';
        renderAutoCheckin(null, false);
    }

    function renderVoiceLiveBadge(data) {
        if (!liveBadge) return;
        var inVoice = !!(data && data.inVoiceNow && data.voicePresence);
        liveBadge.hidden = false;
        liveBadge.textContent = inVoice ? '在语音中' : '未在语音';
        liveBadge.classList.toggle('is-live', inVoice);
        liveBadge.classList.toggle('is-off', !inVoice);
    }

    function renderBound(data) {
        statsEl.textContent = buildStatsLine(data);
        renderVoiceLiveBadge(data);
        if (toggleWrap) toggleWrap.hidden = false;
        if (toggleEl) {
            toggleEl.checked = data.oopzAnnounceEnabled !== false;
            toggleEl.disabled = announceSaving;
        }
        renderAutoCheckin(data, true);
    }

    async function refreshOopzUserPrefs() {
        var sess = loadAuthSession();
        if (!sess || !sess.token) {
            renderLoggedOut();
            return;
        }
        if (!window.UssAuthApi || !window.UssAuthApi.getOopzBinding) {
            statsEl.textContent = '加载中…';
            return;
        }
        try {
            var data = await window.UssAuthApi.getOopzBinding(sess.token);
            if (!data.oopzId) {
                renderUnbound();
                return;
            }
            renderBound(data);
        } catch (e) {
            statsEl.textContent = '加载 OOPZ 信息失败';
            renderAutoCheckin(null, false);
        }
    }

    async function onToggleChange() {
        if (!toggleEl || announceSaving) return;
        var sess = loadAuthSession();
        if (!sess || !sess.token || !window.UssAuthApi || !window.UssAuthApi.setOopzAnnounceEnabled) return;
        var enabled = !!toggleEl.checked;
        announceSaving = true;
        toggleEl.disabled = true;
        try {
            var data = await window.UssAuthApi.setOopzAnnounceEnabled(sess.token, enabled);
            renderBound(
                Object.assign(
                    {
                        oopzId: sess.oopzId,
                        oopzAnnounceEnabled: enabled,
                    },
                    data || {},
                ),
            );
            if (typeof window.refreshOopzBindSection === 'function') {
                window.refreshOopzBindSection();
            }
        } catch (e) {
            toggleEl.checked = !enabled;
            alert((e && e.message) || '保存失败');
        } finally {
            announceSaving = false;
            toggleEl.disabled = false;
        }
    }

    if (toggleEl) {
        toggleEl.addEventListener('change', onToggleChange);
    }

    window.refreshOopzUserPrefs = refreshOopzUserPrefs;
    if (window.UssHomeBoot && typeof window.UssHomeBoot.afterPageReadyIdle === 'function') {
        window.UssHomeBoot.afterPageReadyIdle(refreshOopzUserPrefs, 750);
    } else if (window.UssLazyMedia && typeof window.UssLazyMedia.runWhenIdle === 'function') {
        window.addEventListener(
            'uss:page-ready',
            function onReady() {
                window.removeEventListener('uss:page-ready', onReady);
                window.UssLazyMedia.runWhenIdle(refreshOopzUserPrefs, 750);
            },
            { once: true }
        );
    } else {
        refreshOopzUserPrefs();
    }
})();
