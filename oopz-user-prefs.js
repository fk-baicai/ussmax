(function () {
    'use strict';

    var prefsEl = document.getElementById('oopzUserPrefs');
    var statsEl = document.getElementById('oopzVoiceTimeText');
    var liveBadge = document.getElementById('oopzVoiceLiveBadge');
    var toggleWrap = document.getElementById('oopzAnnounceToggleWrap');
    var toggleEl = document.getElementById('oopzAnnounceToggle');
    var checkinPanel = document.getElementById('oopzAutoCheckinPanel');
    var checkinRemainEl = document.getElementById('oopzAutoCheckinRemain');
    var checkinBranchesEl = document.getElementById('oopzAutoCheckinBranches');
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
        } else if (data && data.oopzId) {
            line += ' · 当前未在语音频道';
        }
        return line;
    }

    function buildRemainLine(data) {
        if (!data || !data.autoCheckinEnabled) {
            return '站点未开启自动签到';
        }
        var status = data.autoCheckinStatus || 'counting';
        if (status === 'all_done') {
            return '今日已全部自动签到';
        }
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
        return '剩余时间：' + formatMinutes(remain);
    }

    function renderBranchList(data) {
        if (!checkinBranchListEl) return;
        var branches = data && Array.isArray(data.autoCheckinBranches) ? data.autoCheckinBranches : [];
        if (!branches.length) {
            checkinBranchListEl.textContent = '无';
            return;
        }
        var mins = data && data.onlineMinutesToday != null ? data.onlineMinutesToday : 0;
        var html = '';
        branches.forEach(function (b) {
            var label = escapeHtml(b.label || b.id);
            var text;
            if (b.checkedInToday) {
                text = label + '（已签）';
            } else {
                text = label + ' ' + mins + '/' + (b.minOnlineMinutes || 60) + ' 分';
            }
            html += '<span class="oopz-user-prefs__checkin-branch-item">' + text + '</span>';
        });
        checkinBranchListEl.innerHTML = html;
    }

    function renderAutoCheckin(data, showPanel) {
        if (!checkinPanel) return;
        if (!showPanel) {
            checkinPanel.hidden = true;
            return;
        }
        checkinPanel.hidden = false;
        if (checkinRemainEl) {
            checkinRemainEl.textContent = buildRemainLine(data);
        }
        renderBranchList(data);
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

    function renderBound(data) {
        statsEl.textContent = buildStatsLine(data);
        if (liveBadge) liveBadge.hidden = !(data && data.inVoiceNow);
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
    refreshOopzUserPrefs();
})();
