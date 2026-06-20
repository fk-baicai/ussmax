(function () {
    if (typeof document === 'undefined') return;

    var AUTH_SESSION_KEY = 'ussHangzhouAuthSession';
    var scTypeLabelsCache = null;
    var scManualLocData = null;
    var scManualFilters = {
        unmatchedKind: '',
        unmatchedQ: '',
        savedKind: '',
        savedQ: '',
    };
    var MANUAL_KIND_ORDER = ['item_name', 'manufacturer', 'location', 'terminal'];

    function loadSess() {
        try {
            var a = sessionStorage.getItem(AUTH_SESSION_KEY);
            if (a) return JSON.parse(a);
            a = localStorage.getItem(AUTH_SESSION_KEY);
            if (a) return JSON.parse(a);
        } catch (e) {
            /* ignore */
        }
        return null;
    }

    function scApiBase() {
        return (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) || 'http://127.0.0.1:3789';
    }

    function escHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatAt(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('zh-CN', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            }).format(new Date(iso));
        } catch (e) {
            return String(iso);
        }
    }

    function typeLabelFromScManual(typeKey) {
        if (scTypeLabelsCache && scTypeLabelsCache[typeKey]) return scTypeLabelsCache[typeKey];
        return typeKey || '—';
    }

    var STATUS_LABELS = {
        ok: '正常',
        warn: '待更新',
        error: '需处理',
        info: '参考',
    };

    function scrollToSection(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function triggerUpdateAction(action) {
        if (!action) return;
        if (action.type === 'sync') {
            if (action.sync === 'uex') return runScSync('uex');
            if (action.sync === 'wiki') return runScSync('wiki');
            if (action.sync === 'localization') return runScLocalizationSync(false);
            if (action.sync === 'blueprints') return runScBlueprintSync();
            if (action.sync === 'localization_then_components') {
                return runScLocalizationSync(false).then(function () {
                    return runScSync('uex').then(function () {
                        return runScSync('wiki');
                    });
                });
            }
            if (action.button_id) {
                var syncBtn = document.getElementById(action.button_id);
                if (syncBtn) syncBtn.click();
            }
            return;
        }
        if (action.type === 'scroll') {
            scrollToSection(action.target);
            if (action.button_id) {
                var btn = document.getElementById(action.button_id);
                if (btn) btn.focus();
            }
            return;
        }
        if (action.type === 'cmd' && action.command) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(action.command).catch(function () {});
            }
            window.alert('请在项目根目录终端执行：\n\n' + action.command);
        }
    }

    function setButtonsDisabled(ids, disabled) {
        (ids || []).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = !!disabled;
        });
    }

    var SC_SYNC_BUTTON_IDS = [
        'btnScSync',
        'btnScSyncWiki',
        'btnScSyncLocalization',
        'btnScSyncLocalizationForce',
        'btnScSyncBlueprints',
        'btnScImageMissing',
        'btnScImageRetry',
        'btnScImageForce',
    ];

    var progressPollTimer = null;
    var progressHideTimer = null;

    function renderGlobalProgress(p) {
        if (!p || (!p.active && !p.done)) {
            hideGlobalProgress();
            return;
        }
        var wrap = document.getElementById('scGlobalProgress');
        var label = document.getElementById('scGlobalProgressLabel');
        var pct = document.getElementById('scGlobalProgressPct');
        var bar = document.getElementById('scGlobalProgressBar');
        var detail = document.getElementById('scGlobalProgressDetail');
        var track = wrap && wrap.querySelector('.sc-global-progress__track');
        if (!wrap || !bar) return;
        wrap.hidden = false;
        document.body.classList.add('sc-sync-dock-open');
        wrap.classList.toggle('is-done', !!p.done && p.ok !== false);
        wrap.classList.toggle('is-error', !!p.done && p.ok === false);
        wrap.classList.toggle('is-active', !!p.active && !p.done);
        var percent = p.done ? 100 : p.percent != null ? p.percent : 0;
        if (label) label.textContent = p.label || '同步中';
        if (pct) pct.textContent = p.active && !p.done && p.percent == null ? '…' : percent + '%';
        bar.style.width = (p.active && !p.done && p.percent == null ? 35 : percent) + '%';
        wrap.classList.toggle('is-indeterminate', !!(p.active && !p.done && p.percent == null));
        if (track) track.setAttribute('aria-valuenow', String(percent));
        if (detail) {
            var parts = [];
            if (p.message) parts.push(p.message);
            if (p.detail) parts.push(p.detail);
            detail.textContent = parts.join(' · ');
        }
    }

    function hideGlobalProgress() {
        var wrap = document.getElementById('scGlobalProgress');
        document.body.classList.remove('sc-sync-dock-open');
        if (wrap) {
            wrap.hidden = true;
            wrap.classList.remove('is-done', 'is-error', 'is-active', 'is-indeterminate');
        }
    }

    function handleProgressSnapshot(p) {
        if (!p) return null;
        if (p.active || p.done) {
            renderGlobalProgress(p);
            if (p.active && !p.done) {
                setButtonsDisabled(SC_SYNC_BUTTON_IDS, true);
                if (!progressPollTimer) {
                    progressPollTimer = setInterval(pollSyncProgress, 450);
                }
            }
            if (p.done) {
                if (progressPollTimer) {
                    clearInterval(progressPollTimer);
                    progressPollTimer = null;
                }
                setButtonsDisabled(SC_SYNC_BUTTON_IDS, false);
                if (!progressHideTimer) {
                    progressHideTimer = setTimeout(function () {
                        progressHideTimer = null;
                        hideGlobalProgress();
                    }, 3200);
                }
            }
            return p;
        }
        if (!progressPollTimer && !progressHideTimer) {
            hideGlobalProgress();
            setButtonsDisabled(SC_SYNC_BUTTON_IDS, false);
        }
        return null;
    }

    function pollSyncProgress() {
        var s = loadSess();
        if (!s || !s.token) return Promise.resolve(null);
        return fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sync-progress', {
            headers: { Authorization: 'Bearer ' + s.token },
        })
            .then(function (r) {
                return r.json();
            })
            .then(function (data) {
                if (!data.ok || !data.progress) return null;
                return handleProgressSnapshot(data.progress);
            })
            .catch(function () {
                return null;
            });
    }

    function startSyncProgressPoll() {
        if (progressHideTimer) {
            clearTimeout(progressHideTimer);
            progressHideTimer = null;
        }
        if (progressPollTimer) clearInterval(progressPollTimer);
        renderGlobalProgress({ active: true, percent: 0, label: '同步中', message: '准备' });
        setButtonsDisabled(SC_SYNC_BUTTON_IDS, true);
        pollSyncProgress();
        progressPollTimer = setInterval(pollSyncProgress, 450);
    }

    function stopSyncProgressPoll(hideLater) {
        if (progressPollTimer) {
            clearInterval(progressPollTimer);
            progressPollTimer = null;
        }
        pollSyncProgress().then(function (p) {
            if (hideLater && p && p.done) {
                if (!progressHideTimer) {
                    progressHideTimer = setTimeout(function () {
                        progressHideTimer = null;
                        hideGlobalProgress();
                    }, 3200);
                }
            }
        });
    }

    function resumeSyncProgressWatch() {
        return pollSyncProgress();
    }

    function setBriefStatus(el, text, isError) {
        if (!el) return;
        if (!text) {
            el.textContent = '';
            el.className = 'hint';
            return;
        }
        el.textContent = text;
        el.className = 'hint sc-sync-result' + (isError ? ' is-error' : '');
    }

    function renderScLocalizationStatus(data) {
        var el = document.getElementById('scLocalizationStatus');
        if (!el || !data) return;
        var lines = [];
        if (data.ready) {
            lines.push(
                '<strong>' +
                    escHtml(data.local_version || '—') +
                    '</strong> · ' +
                    (data.total_entries != null ? data.total_entries : '?') +
                    ' 条 · ' +
                    escHtml(formatAt(data.synced_at))
            );
        } else {
            lines.push('未同步');
        }
        if (data.target_version) {
            lines.push(
                '远程 ' +
                    escHtml(data.target_version) +
                    (data.update_available ? ' · <span style="color:#ffd27a">可更新</span>' : ' · 最新')
            );
        }
        el.innerHTML = lines.map(function (line) {
            return '<div>' + line + '</div>';
        }).join('');
    }

    async function loadScLocalizationStatus() {
        var s = loadSess();
        var el = document.getElementById('scLocalizationStatus');
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/localization-status', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '读取失败');
            renderScLocalizationStatus(data);
            return data;
        } catch (e) {
            if (el) el.textContent = (e && e.message) || '无法读取汉化库状态';
            return null;
        }
    }

    async function runScLocalizationSync(force) {
        var s = loadSess();
        var errEl = document.getElementById('scLocalizationSyncErr');
        var statusEl = document.getElementById('scLocalizationSyncStatus');
        if (errEl) errEl.hidden = true;
        setBriefStatus(statusEl, '');
        setButtonsDisabled(SC_SYNC_BUTTON_IDS, true);
        startSyncProgressPoll();
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sync-localization', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: !!force }),
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '同步失败');
            setBriefStatus(
                statusEl,
                data.skipped ? '已是最新' : '完成 · ' + (data.total_entries != null ? data.total_entries + ' 条' : data.target_version)
            );
            loadScLocalizationStatus();
            loadScUpdateChecklist();
            loadScSources();
            return data;
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '同步失败';
                errEl.hidden = false;
            }
            setBriefStatus(statusEl, (e && e.message) || '失败', true);
            throw e;
        } finally {
            setButtonsDisabled(SC_SYNC_BUTTON_IDS, false);
            stopSyncProgressPoll(true);
        }
    }

    function renderScBlueprintsStatus(data) {
        var el = document.getElementById('scBlueprintsStatus');
        if (!el || !data) return;
        if (!data.ready) {
            el.textContent = '未同步';
            return;
        }
        el.innerHTML =
            '<div><strong>' +
            (data.total || 0) +
            '</strong> 条 · 关联 ' +
            (data.linked_count || 0) +
            ' · ' +
            escHtml(data.game_version || '—') +
            '</div><div>' +
            escHtml(formatAt(data.synced_at)) +
            '</div>';
    }

    async function loadScBlueprintsStatus() {
        var s = loadSess();
        var el = document.getElementById('scBlueprintsStatus');
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/blueprints-status', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '读取失败');
            renderScBlueprintsStatus(data);
            return data;
        } catch (e) {
            if (el) el.textContent = (e && e.message) || '无法读取蓝图状态';
            return null;
        }
    }

    async function runScBlueprintSync() {
        var s = loadSess();
        var errEl = document.getElementById('scBlueprintsSyncErr');
        var statusEl = document.getElementById('scBlueprintsSyncStatus');
        if (errEl) errEl.hidden = true;
        setBriefStatus(statusEl, '');
        setButtonsDisabled(SC_SYNC_BUTTON_IDS, true);
        startSyncProgressPoll();
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sync-blueprints', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '同步失败');
            setBriefStatus(statusEl, '完成 · ' + (data.meta && data.meta.total != null ? data.meta.total + ' 条' : ''));
            loadScBlueprintsStatus();
            loadScUpdateChecklist();
            return data;
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '同步失败';
                errEl.hidden = false;
            }
            setBriefStatus(statusEl, (e && e.message) || '失败', true);
            throw e;
        } finally {
            setButtonsDisabled(SC_SYNC_BUTTON_IDS, false);
            stopSyncProgressPoll(true);
        }
    }

    function renderScUpdateChecklist(data) {
        var summaryEl = document.getElementById('scUpdateSummary');
        var listEl = document.getElementById('scUpdateList');
        if (!summaryEl || !listEl || !data) return;
        var s = data.summary || {};
        if (s.all_clear) {
            summaryEl.innerHTML =
                '<span style="color:var(--ok)">全部就绪</span> · 共检查 ' +
                (s.total || 0) +
                ' 项 · ' +
                escHtml(formatAt(data.checked_at));
        } else {
            summaryEl.innerHTML =
                (s.has_error
                    ? '<span style="color:var(--danger)">' + (s.needs_action || 0) + ' 项需处理</span>'
                    : '<span style="color:#ffd27a">' + (s.needs_action || 0) + ' 项建议更新</span>') +
                ' · 共 ' +
                (s.total || 0) +
                ' 项 · ' +
                escHtml(formatAt(data.checked_at)) +
                (data.active_label_zh ? ' · 前台数据源：' + escHtml(data.active_label_zh) : '');
        }
        if (!data.items || !data.items.length) {
            listEl.innerHTML = '<p class="hint">暂无检查项</p>';
            return;
        }
        listEl.innerHTML = data.items
            .map(function (item, idx) {
                var badgeClass = 'sc-update-badge sc-update-badge--' + (item.status || 'info');
                var actionHtml = '';
                if (item.action && item.action.label) {
                    actionHtml =
                        '<div class="sc-update-card-action"><button type="button" data-update-action="' +
                        idx +
                        '">' +
                        escHtml(item.action.label) +
                        '</button></div>';
                }
                return (
                    '<article class="sc-update-card" data-status="' +
                    escHtml(item.status || 'info') +
                    '">' +
                    '<div class="sc-update-card-head">' +
                    '<h3 class="sc-update-card-title">' +
                    escHtml(item.title || item.id) +
                    '</h3>' +
                    '<span class="' +
                    badgeClass +
                    '">' +
                    escHtml(STATUS_LABELS[item.status] || item.status) +
                    '</span>' +
                    '</div>' +
                    '<p class="sc-update-card-summary">' +
                    escHtml(item.summary || '') +
                    '</p>' +
                    (item.detail
                        ? '<p class="sc-update-card-detail">' + escHtml(item.detail) + '</p>'
                        : '') +
                    actionHtml +
                    '</article>'
                );
            })
            .join('');
        listEl.querySelectorAll('[data-update-action]').forEach(function (btn) {
            btn.onclick = function () {
                var i = parseInt(btn.getAttribute('data-update-action'), 10);
                if (!isNaN(i) && data.items[i]) triggerUpdateAction(data.items[i].action);
            };
        });
    }

    async function loadScUpdateChecklist() {
        var s = loadSess();
        var errEl = document.getElementById('scUpdateErr');
        var summaryEl = document.getElementById('scUpdateSummary');
        if (errEl) errEl.hidden = true;
        if (summaryEl) summaryEl.textContent = '检查中…';
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/update-checklist', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '读取失败');
            renderScUpdateChecklist(data);
            return data;
        } catch (e) {
            if (summaryEl) summaryEl.textContent = '';
            if (errEl) {
                errEl.textContent = (e && e.message) || '读取更新清单失败';
                errEl.hidden = false;
            }
            var listEl = document.getElementById('scUpdateList');
            if (listEl) listEl.innerHTML = '';
            return null;
        }
    }

    function formatSourceVersionLine(src) {
        if (!src) return '';
        var live =
            src.live_api && src.live_api.live_game_version
                ? '线上最新 ' + src.live_api.live_game_version
                : src.live_api_error
                  ? '线上版本获取失败'
                  : '';
        var cached = src.ready
            ? '本地已同步 ' + (src.total_items || 0) + ' 条 · 游戏版本 ' + (src.game_version || '—')
            : '本地尚未同步';
        var apiVer = src.api_version ? 'API v' + src.api_version : '';
        return (
            '<div class="sc-source-version-line"><strong>' +
            escHtml(src.label_zh || src.id) +
            '</strong> · ' +
            escHtml(apiVer) +
            ' · ' +
            escHtml(cached) +
            (live ? ' · ' + escHtml(live) : '') +
            '</div>'
        );
    }

    function renderSourcePanel(data) {
        var sel = document.getElementById('scActiveSource');
        var versionsEl = document.getElementById('scSourceVersions');
        var statusEl = document.getElementById('scSourceStatus');
        if (sel && data.active_source) sel.value = data.active_source;
        if (statusEl) {
            statusEl.textContent = data.active_label_zh
                ? '前台当前：' + data.active_label_zh
                : '';
        }
        if (versionsEl && data.sources) {
            versionsEl.innerHTML =
                formatSourceVersionLine(data.sources.uex) + formatSourceVersionLine(data.sources.wiki);
        }
    }

    async function loadScSources() {
        var s = loadSess();
        var errEl = document.getElementById('scSourceErr');
        if (errEl) errEl.hidden = true;
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sources', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '读取失败');
            renderSourcePanel(data);
            return data;
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '读取数据来源失败';
                errEl.hidden = false;
            }
            return null;
        }
    }

    async function applyScSource() {
        var s = loadSess();
        var sel = document.getElementById('scActiveSource');
        var errEl = document.getElementById('scSourceErr');
        var statusEl = document.getElementById('scSourceStatus');
        if (!sel) return;
        if (errEl) errEl.hidden = true;
        if (statusEl) statusEl.textContent = '切换中…';
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/data-source', {
                method: 'PUT',
                headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: sel.value }),
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '切换失败');
            if (statusEl) statusEl.textContent = '已切换至 ' + (data.active_label_zh || sel.value);
            await loadScSources();
            loadScAdminStatus();
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '切换失败';
                errEl.hidden = false;
            }
            if (statusEl) statusEl.textContent = '';
        }
    }

    function imageReasonLabel(reason) {
        if (reason === 'remote_forbidden') return '远程 CDN 拒绝下载（403）';
        if (reason === 'no_remote_url') return 'Wiki 无图片';
        if (reason === 'download_failed') return '下载失败';
        return reason || '未知';
    }

    function renderScImageStatus(data) {
        var el = document.getElementById('scImageStatus');
        var failedWrap = document.getElementById('scImageFailedWrap');
        var failedList = document.getElementById('scImageFailedList');
        if (!el || !data || !data.totals) return;
        var t = data.totals;
        var lines = [
            '共 ' + t.items + ' 条 · 已本地化 <strong>' + t.local + '</strong> · 手动上传 ' + t.manual,
            '仅远程链接 ' + t.remote_only + ' · Wiki 暂无图 ' + t.missing,
        ];
        if (data.last_run && data.last_run.at) {
            var st = data.last_run.stats || {};
            lines.push(
                '上次任务：' +
                    formatAt(data.last_run.at) +
                    ' · 模式 ' +
                    escHtml(st.mode || '—') +
                    ' · 新增 ' +
                    (st.cached != null ? st.cached : 0) +
                    ' · 更新 ' +
                    (st.refreshed != null ? st.refreshed : 0) +
                    ' · 失败 ' +
                    (st.failed != null ? st.failed : 0)
            );
        }
        if (data.failed_count || data.no_url_count) {
            lines.push('待重试记录：失败 ' + data.failed_count + ' · 无图 ' + data.no_url_count);
        }
        el.innerHTML = lines.map(function (line) {
            return '<div>' + line + '</div>';
        }).join('');
        var sample = []
            .concat(data.failed_sample || [])
            .slice(0, 12);
        if (failedWrap && failedList) {
            if (!sample.length) {
                failedWrap.hidden = true;
                failedList.innerHTML = '';
            } else {
                failedWrap.hidden = false;
                failedList.innerHTML = sample
                    .map(function (row) {
                        return (
                            '<li><strong>' +
                            escHtml(row.name_zh || row.name_en || row.id_item) +
                            '</strong> · ' +
                            escHtml(imageReasonLabel(row.reason)) +
                            (row.slug ? ' · <code>' + escHtml(row.slug) + '</code>' : '') +
                            '</li>'
                        );
                    })
                    .join('');
            }
        }
    }

    async function loadScImageStatus() {
        var s = loadSess();
        var el = document.getElementById('scImageStatus');
        try {
            var r = await fetch(
                scApiBase().replace(/\/$/, '') + '/api/admin/sc/component-image-status?source=wiki',
                { headers: { Authorization: 'Bearer ' + s.token } }
            );
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '读取失败');
            renderScImageStatus(data);
        } catch (e) {
            if (el) el.textContent = (e && e.message) || '无法读取图片状态';
        }
    }

    async function runScImageSync(mode) {
        var s = loadSess();
        var errEl = document.getElementById('scImageSyncErr');
        var statusEl = document.getElementById('scImageSyncStatus');
        if (errEl) errEl.hidden = true;
        setBriefStatus(statusEl, '');
        setButtonsDisabled(SC_SYNC_BUTTON_IDS, true);
        startSyncProgressPoll();
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sync-component-images', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'wiki', mode: mode }),
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '同步失败');
            var st = data.stats || {};
            setBriefStatus(
                statusEl,
                '完成 · 新增 ' + (st.cached != null ? st.cached : 0) + ' · 失败 ' + (st.failed != null ? st.failed : 0)
            );
            loadScImageStatus();
            loadScSyncLog();
            loadScUpdateChecklist();
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '同步失败';
                errEl.hidden = false;
            }
            setBriefStatus(statusEl, (e && e.message) || '失败', true);
        } finally {
            setButtonsDisabled(SC_SYNC_BUTTON_IDS, false);
            stopSyncProgressPoll(true);
        }
    }

    function wireUi() {
        var btnSync = document.getElementById('btnScSync');
        var btnSyncWiki = document.getElementById('btnScSyncWiki');
        var btnLog = document.getElementById('btnReloadScSyncLog');
        var btnManual = document.getElementById('btnReloadScManualLoc');
        var btnApplySource = document.getElementById('btnScApplySource');
        var btnImageMissing = document.getElementById('btnScImageMissing');
        var btnImageRetry = document.getElementById('btnScImageRetry');
        var btnImageForce = document.getElementById('btnScImageForce');
        var btnImageRefresh = document.getElementById('btnScImageRefreshStatus');
        var btnUpdateChecklist = document.getElementById('btnReloadScUpdateChecklist');
        var btnLocSync = document.getElementById('btnScSyncLocalization');
        var btnLocForce = document.getElementById('btnScSyncLocalizationForce');
        var btnBpSync = document.getElementById('btnScSyncBlueprints');
        if (btnUpdateChecklist) btnUpdateChecklist.onclick = loadScUpdateChecklist;
        if (btnLocSync) btnLocSync.onclick = function () { runScLocalizationSync(false); };
        if (btnLocForce) {
            btnLocForce.onclick = function () {
                if (!window.confirm('将强制重新下载汉化包并重建索引，确定继续？')) return;
                runScLocalizationSync(true);
            };
        }
        if (btnBpSync) btnBpSync.onclick = function () { runScBlueprintSync(); };
        if (btnSync) btnSync.onclick = function () { runScSync('uex'); };
        if (btnSyncWiki) btnSyncWiki.onclick = function () { runScSync('wiki'); };
        if (btnLog) btnLog.onclick = loadScSyncLog;
        if (btnManual) btnManual.onclick = loadScManualLoc;
        if (btnApplySource) btnApplySource.onclick = applyScSource;
        if (btnImageMissing) btnImageMissing.onclick = function () { runScImageSync('missing'); };
        if (btnImageRetry) btnImageRetry.onclick = function () { runScImageSync('retry_failed'); };
        if (btnImageForce) {
            btnImageForce.onclick = function () {
                if (!window.confirm('将重新下载 Wiki 配件图（不含手动上传），确定继续？')) return;
                runScImageSync('force');
            };
        }
        if (btnImageRefresh) btnImageRefresh.onclick = loadScImageStatus;
        wireManualLocFilters();
    }

    function wireManualLocFilters() {
        var unmatchedSearch = document.getElementById('scManualUnmatchedSearch');
        var savedSearch = document.getElementById('scManualSavedSearch');
        if (unmatchedSearch) {
            unmatchedSearch.oninput = function () {
                scManualFilters.unmatchedQ = unmatchedSearch.value.trim();
                applyManualLocFilters();
            };
        }
        if (savedSearch) {
            savedSearch.oninput = function () {
                scManualFilters.savedQ = savedSearch.value.trim();
                applyManualLocFilters();
            };
        }
    }

    function countByKind(items) {
        var counts = {};
        (items || []).forEach(function (item) {
            var k = item.kind || 'item_name';
            counts[k] = (counts[k] || 0) + 1;
        });
        return counts;
    }

    function itemSearchHaystack(item, kindLabels) {
        return [
            englishText(item),
            chineseText(item),
            item.slug,
            item.note,
            kindLabel(item, kindLabels),
            item.key,
            item.id_item,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    }

    function matchesManualFilter(item, kind, q, kindLabels) {
        if (kind) {
            var itemKind = item.kind || 'item_name';
            if (itemKind !== kind) return false;
        }
        if (q) {
            var hay = itemSearchHaystack(item, kindLabels);
            if (hay.indexOf(q.toLowerCase()) === -1) return false;
        }
        return true;
    }

    function renderKindChips(containerId, activeKind, counts, kindLabels, onSelect) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var total = 0;
        Object.keys(counts).forEach(function (k) {
            total += counts[k];
        });
        var chips = [
            {
                kind: '',
                label: '全部',
                count: total,
            },
        ];
        MANUAL_KIND_ORDER.forEach(function (kind) {
            if (!counts[kind]) return;
            chips.push({
                kind: kind,
                label: (kindLabels && kindLabels[kind]) || kind,
                count: counts[kind],
            });
        });
        Object.keys(counts).forEach(function (kind) {
            if (MANUAL_KIND_ORDER.indexOf(kind) !== -1) return;
            chips.push({
                kind: kind,
                label: (kindLabels && kindLabels[kind]) || kind,
                count: counts[kind],
            });
        });
        el.innerHTML = chips
            .map(function (chip) {
                var active = chip.kind === activeKind ? ' is-active' : '';
                return (
                    '<button type="button" class="sc-manual-kind-chip' +
                    active +
                    '" data-kind="' +
                    escHtml(chip.kind) +
                    '" role="tab" aria-selected="' +
                    (chip.kind === activeKind ? 'true' : 'false') +
                    '">' +
                    escHtml(chip.label) +
                    ' <span class="sc-manual-kind-count">' +
                    chip.count +
                    '</span></button>'
                );
            })
            .join('');
        el.querySelectorAll('.sc-manual-kind-chip').forEach(function (btn) {
            btn.onclick = function () {
                onSelect(btn.getAttribute('data-kind') || '');
            };
        });
    }

    function wireTableActions(scope) {
        var root = scope || document;
        root.querySelectorAll('.sc-manual-save-btn').forEach(function (btn) {
            btn.onclick = function () {
                var tr = btn.closest('tr');
                if (!tr) return;
                var errEl = document.getElementById('scManualLocErr');
                saveScManualLoc(
                    tr.getAttribute('data-key'),
                    tr.querySelector('.sc-manual-zh-input')?.value || '',
                    tr.querySelector('.sc-manual-note-input')?.value || '',
                    btn
                ).catch(function (e) {
                    if (errEl) {
                        errEl.textContent = (e && e.message) || '保存失败';
                        errEl.hidden = false;
                    }
                });
            };
        });
        root.querySelectorAll('.sc-manual-del-btn').forEach(function (btn) {
            btn.onclick = function () {
                var tr = btn.closest('tr');
                if (!tr) return;
                deleteScManualLoc(tr.getAttribute('data-key')).catch(function (e) {
                    var errEl = document.getElementById('scManualLocErr');
                    if (errEl) {
                        errEl.textContent = (e && e.message) || '删除失败';
                        errEl.hidden = false;
                    }
                });
            };
        });
    }

    function renderUnmatchedRows(items, kindLabels, totalCount) {
        var unmatchedBody = document.getElementById('scManualUnmatchedBody');
        if (!unmatchedBody) return;
        if (!totalCount) {
            unmatchedBody.innerHTML = '<tr><td colspan="6" class="hint">暂无待补译项</td></tr>';
            return;
        }
        if (!items.length) {
            unmatchedBody.innerHTML = '<tr><td colspan="6" class="hint">没有符合筛选条件的项</td></tr>';
            return;
        }
        unmatchedBody.innerHTML = items
            .map(function (item) {
                var rowKey = item.key || item.id_item;
                return (
                    '<tr data-key="' +
                    escHtml(rowKey) +
                    '"><td>' +
                    escHtml(kindLabel(item, kindLabels)) +
                    '</td><td>' +
                    escHtml(englishText(item)) +
                    '</td><td class="sc-manual-slug">' +
                    escHtml(item.kind === 'item_name' ? item.slug || '—' : '—') +
                    '</td><td><input type="text" class="sc-manual-zh-input" placeholder="中文名"></td><td><input type="text" class="sc-manual-note-input" placeholder="可选备注"></td><td class="sc-manual-actions"><button type="button" class="btn-secondary sc-manual-save-btn">保存</button></td></tr>'
                );
            })
            .join('');
        wireTableActions(unmatchedBody);
    }

    function renderSavedRows(items, kindLabels, totalCount) {
        var savedBody = document.getElementById('scManualSavedBody');
        if (!savedBody) return;
        if (!totalCount) {
            savedBody.innerHTML = '<tr><td colspan="6" class="hint">暂无手动补译</td></tr>';
            return;
        }
        if (!items.length) {
            savedBody.innerHTML = '<tr><td colspan="6" class="hint">没有符合筛选条件的项</td></tr>';
            return;
        }
        savedBody.innerHTML = items
            .map(function (entry) {
                var rowKey = entry.key || entry.id_item;
                return (
                    '<tr data-key="' +
                    escHtml(rowKey) +
                    '"><td>' +
                    escHtml(kindLabel(entry, kindLabels)) +
                    '</td><td>' +
                    escHtml(englishText(entry)) +
                    '</td><td><input type="text" class="sc-manual-zh-input" value="' +
                    escHtml(chineseText(entry)) +
                    '"></td><td><input type="text" class="sc-manual-note-input" value="' +
                    escHtml(entry.note || '') +
                    '"></td><td>' +
                    escHtml(formatAt(entry.updated_at)) +
                    '</td><td class="sc-manual-actions"><button type="button" class="btn-secondary sc-manual-save-btn">保存</button> <button type="button" class="btn-secondary sc-manual-del-btn">删除</button></td></tr>'
                );
            })
            .join('');
        wireTableActions(savedBody);
    }

    function applyManualLocFilters(refreshChips) {
        if (!scManualLocData) return;
        var kindLabels = scManualLocData.kind_labels || {};
        var unmatchedAll = scManualLocData.unmatched || [];
        var savedAll = scManualLocData.manual || [];
        var unmatchedCounts = countByKind(unmatchedAll);
        var savedCounts = countByKind(savedAll);
        if (scManualFilters.unmatchedKind && !unmatchedCounts[scManualFilters.unmatchedKind]) {
            scManualFilters.unmatchedKind = '';
            refreshChips = true;
        }
        if (scManualFilters.savedKind && !savedCounts[scManualFilters.savedKind]) {
            scManualFilters.savedKind = '';
            refreshChips = true;
        }
        var unmatchedFiltered = unmatchedAll.filter(function (item) {
            return matchesManualFilter(item, scManualFilters.unmatchedKind, scManualFilters.unmatchedQ, kindLabels);
        });
        var savedFiltered = savedAll.filter(function (item) {
            return matchesManualFilter(item, scManualFilters.savedKind, scManualFilters.savedQ, kindLabels);
        });

        if (refreshChips !== false) {
            renderKindChips('scManualUnmatchedKinds', scManualFilters.unmatchedKind, unmatchedCounts, kindLabels, function (kind) {
                scManualFilters.unmatchedKind = kind;
                applyManualLocFilters(false);
            });
            renderKindChips('scManualSavedKinds', scManualFilters.savedKind, savedCounts, kindLabels, function (kind) {
                scManualFilters.savedKind = kind;
                applyManualLocFilters(false);
            });
        } else {
            document.querySelectorAll('#scManualUnmatchedKinds .sc-manual-kind-chip').forEach(function (btn) {
                var active = (btn.getAttribute('data-kind') || '') === scManualFilters.unmatchedKind;
                btn.classList.toggle('is-active', active);
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            document.querySelectorAll('#scManualSavedKinds .sc-manual-kind-chip').forEach(function (btn) {
                var active = (btn.getAttribute('data-kind') || '') === scManualFilters.savedKind;
                btn.classList.toggle('is-active', active);
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
        }

        var unmatchedMeta = document.getElementById('scManualUnmatchedFilterMeta');
        if (unmatchedMeta) {
            unmatchedMeta.textContent =
                unmatchedFiltered.length === unmatchedAll.length
                    ? '共 ' + unmatchedAll.length + ' 条'
                    : '显示 ' + unmatchedFiltered.length + ' / ' + unmatchedAll.length + ' 条';
        }
        var savedMeta = document.getElementById('scManualSavedFilterMeta');
        if (savedMeta) {
            savedMeta.textContent =
                savedFiltered.length === savedAll.length
                    ? '共 ' + savedAll.length + ' 条'
                    : '显示 ' + savedFiltered.length + ' / ' + savedAll.length + ' 条';
        }

        renderUnmatchedRows(unmatchedFiltered, kindLabels, unmatchedAll.length);
        renderSavedRows(savedFiltered, kindLabels, savedAll.length);
    }

    function kindLabel(item, kindLabels) {
        if (item.kind_label_zh) return item.kind_label_zh;
        if (kindLabels && item.kind && kindLabels[item.kind]) return kindLabels[item.kind];
        if (item.kind === 'item_name') return '配件名';
        return item.kind || '—';
    }

    function englishText(item) {
        return item.text_en || item.name_en || '—';
    }

    function chineseText(item) {
        return item.text_zh || item.name_zh || '';
    }

    function formatUnmatchedByKind(byKind, kindLabels) {
        if (!byKind || !Object.keys(byKind).length) return '';
        return Object.keys(byKind)
            .map(function (k) {
                return ((kindLabels && kindLabels[k]) || k) + ' ' + byKind[k];
            })
            .join(' · ');
    }

    async function saveScManualLoc(rowKey, nameZh, note, btn) {
        var s = loadSess();
        var errEl = document.getElementById('scManualLocErr');
        if (errEl) errEl.hidden = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '保存中…';
        }
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/manual-loc', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: rowKey, name_zh: nameZh, note: note || '' }),
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '保存失败');
            await loadScManualLoc();
            loadScUpdateChecklist();
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '保存';
            }
        }
    }

    async function deleteScManualLoc(rowKey) {
        if (!confirm('确定删除该手动汉化？删除后将恢复为自动汉化结果。')) return;
        var s = loadSess();
        var errEl = document.getElementById('scManualLocErr');
        if (errEl) errEl.hidden = true;
        var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/manual-loc/delete', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: rowKey }),
        });
        var data = await r.json();
        if (!r.ok || !data.ok) throw new Error((data && data.message) || '删除失败');
        await loadScManualLoc();
        loadScUpdateChecklist();
    }

    function renderScManualLocTables(data) {
        scManualLocData = data;
        var metaEl = document.getElementById('scManualLocMeta');
        var kindLabels = data.kind_labels || {};
        if (metaEl && data.stats) {
            var byKind = formatUnmatchedByKind(data.stats.unmatched_by_kind, kindLabels);
            metaEl.textContent =
                '命中率 ' +
                (data.stats.loc_matched_rate != null ? data.stats.loc_matched_rate + '%' : '—') +
                ' · 手动 ' +
                data.stats.manual_count +
                ' 条 · 待补译 ' +
                data.stats.unmatched_count +
                ' 条' +
                (byKind ? '（' + byKind + '）' : '');
        }
        applyManualLocFilters();
    }

    async function loadScManualLoc() {
        var s = loadSess();
        var errEl = document.getElementById('scManualLocErr');
        var unmatchedBody = document.getElementById('scManualUnmatchedBody');
        var savedBody = document.getElementById('scManualSavedBody');
        if (errEl) errEl.hidden = true;
        if (unmatchedBody) unmatchedBody.innerHTML = '<tr><td colspan="6" class="hint">加载中…</td></tr>';
        if (savedBody) savedBody.innerHTML = '<tr><td colspan="6" class="hint">加载中…</td></tr>';
        try {
            var typesRes = await fetch(scApiBase().replace(/\/$/, '') + '/api/sc/components/types', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var typesData = await typesRes.json();
            if (typesData.ok && typesData.types) {
                scTypeLabelsCache = {};
                Object.keys(typesData.types).forEach(function (k) {
                    scTypeLabelsCache[k] = typesData.types[k].label_zh || k;
                });
            }
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/manual-loc', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '读取失败');
            renderScManualLocTables(data);
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '读取失败';
                errEl.hidden = false;
            }
            if (unmatchedBody) unmatchedBody.innerHTML = '';
            if (savedBody) savedBody.innerHTML = '';
        }
    }

    async function loadScAdminStatus() {
        var s = loadSess();
        var hint = document.getElementById('scTokenHint');
        if (!hint) return;
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/status', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error('读取失败');
            if (data.uex_token_configured) {
                hint.innerHTML =
                    '<span style="color:var(--ok)">Token 已配置</span>' +
                    (data.data_ready ? ' · 数据已就绪' : ' · 待同步');
            } else {
                hint.innerHTML =
                    '<span style="color:var(--danger)">Token 未配置</span> — 请在 <code>backend/.env</code> 设置 <code>UEX_API_TOKEN</code>';
            }
        } catch (e) {
            hint.textContent = '无法读取 SC 配置状态';
        }
    }

    async function runScSync(source) {
        var s = loadSess();
        var errEl = document.getElementById('scSyncErr');
        var statusEl = document.getElementById('scSyncStatus');
        var src = source || 'uex';
        if (errEl) errEl.hidden = true;
        setBriefStatus(statusEl, '');
        setButtonsDisabled(SC_SYNC_BUTTON_IDS, true);
        startSyncProgressPoll();
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sync-ship-components', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: src }),
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '同步失败');
            setBriefStatus(
                statusEl,
                '完成 · ' + (data.meta && data.meta.total_items != null ? data.meta.total_items + ' 条' : '')
            );
            loadScSyncLog();
            loadScAdminStatus();
            loadScSources();
            loadScManualLoc();
            loadScUpdateChecklist();
            if (src === 'wiki') loadScImageStatus();
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '同步失败';
                errEl.hidden = false;
            }
            setBriefStatus(statusEl, (e && e.message) || '失败', true);
        } finally {
            setButtonsDisabled(SC_SYNC_BUTTON_IDS, false);
            stopSyncProgressPoll(true);
        }
    }

    async function loadScSyncLog() {
        var s = loadSess();
        var listEl = document.getElementById('scSyncLogList');
        if (!listEl) return;
        listEl.innerHTML = '<li class="hint">加载中…</li>';
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sync-log?limit=5', {
                headers: { Authorization: 'Bearer ' + s.token },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error('读取失败');
            if (!data.logs || !data.logs.length) {
                listEl.innerHTML = '<li class="hint">暂无日志</li>';
                return;
            }
            listEl.innerHTML = data.logs
                .map(function (log) {
                    var sourceLabel =
                        log.source === 'wiki'
                            ? 'Wiki'
                            : log.source === 'uex'
                              ? 'UEX'
                              : log.source === 'wiki-images'
                                ? '图片'
                                : log.source || '';
                    return (
                        '<li style="margin-bottom:0.5rem;padding:0.5rem 0;border-bottom:1px solid rgba(95,184,255,0.12);">' +
                        '<strong style="color:' +
                        (log.ok ? 'var(--ok)' : 'var(--danger)') +
                        '">' +
                        (log.ok ? '成功' : '失败') +
                        '</strong>' +
                        (sourceLabel ? ' · ' + escHtml(sourceLabel) : '') +
                        ' · ' +
                        escHtml(formatAt(log.started_at)) +
                        (log.duration_ms ? ' · ' + Math.round(log.duration_ms / 1000) + 's' : '') +
                        '</li>'
                    );
                })
                .join('');
        } catch (e) {
            listEl.innerHTML = '<li class="err">' + escHtml((e && e.message) || '加载失败') + '</li>';
        }
    }

    async function init() {
        var gate = document.getElementById('gateMsg');
        var app = document.getElementById('app');
        var s = loadSess();
        if (!s || !s.token) {
            gate.textContent = '请先登录后再访问 SC 数据库管理。';
            return;
        }
        try {
            var me = await window.UssAuthApi.me(s.token);
            if (!me.isAdmin) {
                gate.textContent = '您没有管理员权限。';
                return;
            }
            if (!me.isSuperAdmin) {
                gate.textContent = '仅超级管理员可访问 SC 数据库管理。';
                return;
            }
        } catch (e) {
            gate.textContent = (e && e.message) || '会话无效，请重新登录。';
            return;
        }
        gate.textContent = '';
        app.hidden = false;
        wireUi();
        loadScUpdateChecklist();
        loadScLocalizationStatus();
        loadScBlueprintsStatus();
        loadScAdminStatus();
        loadScSources();
        loadScSyncLog();
        loadScImageStatus();
        loadScManualLoc();
        resumeSyncProgressWatch();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
