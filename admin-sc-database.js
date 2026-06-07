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

    function wireUi() {
        var btnSync = document.getElementById('btnScSync');
        var btnLog = document.getElementById('btnReloadScSyncLog');
        var btnManual = document.getElementById('btnReloadScManualLoc');
        if (btnSync) btnSync.onclick = runScSync;
        if (btnLog) btnLog.onclick = loadScSyncLog;
        if (btnManual) btnManual.onclick = loadScManualLoc;
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
                    'UEX Token：<span style="color:var(--ok)">已配置</span>' +
                    (data.data_ready ? ' · 配件数据已同步' : ' · 配件数据尚未同步，请点击上方按钮');
            } else {
                hint.innerHTML =
                    'UEX Token：<span style="color:var(--danger)">未配置</span> — 请在<strong>配件服务器</strong> <code>sc-components-server/.env</code> 配置 <code>UEX_API_TOKEN</code>。' +
                    (data.remote ? '（远程配件服务模式）' : '');
            }
        } catch (e) {
            hint.textContent = '无法读取 SC 配置状态';
        }
    }

    async function runScSync() {
        var s = loadSess();
        var errEl = document.getElementById('scSyncErr');
        var statusEl = document.getElementById('scSyncStatus');
        if (errEl) errEl.hidden = true;
        if (statusEl) statusEl.textContent = '同步中…（约 1–2 分钟）';
        try {
            var r = await fetch(scApiBase().replace(/\/$/, '') + '/api/admin/sc/sync-ship-components', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
            });
            var data = await r.json();
            if (!r.ok || !data.ok) throw new Error((data && data.message) || '同步失败');
            if (statusEl) {
                statusEl.textContent =
                    '同步成功 · 共 ' + (data.meta && data.meta.total_items != null ? data.meta.total_items : '?') + ' 条';
            }
            loadScSyncLog();
            loadScAdminStatus();
            loadScManualLoc();
        } catch (e) {
            if (errEl) {
                errEl.textContent = (e && e.message) || '同步失败';
                errEl.hidden = false;
            }
            if (statusEl) statusEl.textContent = '';
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
                    return (
                        '<li style="margin-bottom:0.5rem;padding:0.5rem 0;border-bottom:1px solid rgba(95,184,255,0.12);">' +
                        '<strong style="color:' +
                        (log.ok ? 'var(--ok)' : 'var(--danger)') +
                        '">' +
                        (log.ok ? '成功' : '失败') +
                        '</strong> · ' +
                        escHtml(formatAt(log.started_at)) +
                        ' · ' +
                        escHtml(log.message || '') +
                        (log.duration_ms ? ' · ' + log.duration_ms + 'ms' : '') +
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
        loadScAdminStatus();
        loadScSyncLog();
        loadScManualLoc();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
