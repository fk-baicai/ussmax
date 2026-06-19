(function () {
    if (typeof window === 'undefined') return;

    var API_BASE = (
        window.USS_SC_COMPONENTS_API_BASE || window.USS_AUTH_API_BASE || window.USS_REGISTER_API_BASE || ''
    ).replace(/\/$/, '');

    var listCache = Object.create(null);
    var detailCache = Object.create(null);
    var DETAIL_SCHEMA_VERSION = 14;

    function missionBriefingZh(detail, summary) {
        var zh = detail && detail.description_zh ? String(detail.description_zh).trim() : '';
        if (zh) return zh;
        if (summary && summary.description_zh) return String(summary.description_zh).trim();
        return '';
    }

    function isUsableMissionDetail(detail) {
        if (
            !detail ||
            !Array.isArray(detail.blueprint_pools) ||
            !detail.blueprint_pools.length ||
            detail.__detailSchemaVersion !== DETAIL_SCHEMA_VERSION
        ) {
            return false;
        }
        var descEn = String(detail.description_en || '').trim();
        var descZh = String(detail.description_zh || '').trim();
        if (descEn && !descZh) return false;
        return true;
    }

    function apiUrl(path) {
        return API_BASE + path;
    }

    function looksLikeGzipBody(text) {
        return text && text.length >= 2 && text.charCodeAt(0) === 0x1f && text.charCodeAt(1) === 0x8b;
    }

    function isJsonParseFailureMessage(message) {
        return /json|非 JSON|解析失败|Unexpected token/i.test(String(message || ''));
    }

    async function parseJsonResponse(res, fallbackMessage) {
        var text = await res.text();
        try {
            return JSON.parse(text);
        } catch (parseErr) {
            if (looksLikeGzipBody(text)) {
                throw new Error('蓝图任务响应异常（网络缓存损坏），请强制刷新页面后重试');
            }
            var preview = String(text || '').replace(/\s+/g, ' ').trim();
            if (preview.length > 60) preview = preview.slice(0, 60) + '…';
            var msg = fallbackMessage || '响应解析失败';
            if (preview) msg += '（收到非 JSON 内容: ' + preview + '）';
            msg += '。若持续出现，请强制刷新页面或清除浏览器缓存。';
            throw new Error(msg);
        }
    }

    function itemHasBlueprintHints(item) {
        if (!item) return false;
        if (Number(item.unlocking_missions_count) > 0) return true;
        if (Array.isArray(item.unlocking_missions) && item.unlocking_missions.length) return true;
        var wf = item.wiki_fields;
        if (wf && Array.isArray(wf.blueprint_refs) && wf.blueprint_refs.length) return true;
        if (wf && Array.isArray(wf.blueprint_unlock_missions) && wf.blueprint_unlock_missions.length) return true;
        return false;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatBlueprintDropLabel(chance) {
        if (chance == null || !Number.isFinite(Number(chance))) return '';
        var pct = Number(chance) * 100;
        if (pct >= 99.9) return '';
        var pctText = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);
        return '蓝图掉落 ' + pctText + '%';
    }

    function cssEscape(value) {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
        return String(value || '').replace(/["\\]/g, '\\$&');
    }

    function stripMissionPlaceholders(text) {
        if (!text) return '';
        var raw = String(text).replace(/\\n/g, '\n');
        raw = raw.replace(/~mission\([^)]*\)/gi, '');
        raw = raw.replace(/<\/?EM4>/gi, '');
        raw = raw.replace(/<\/?EM>/gi, '');
        raw = raw.replace(/<\/?BR\s*\/?>/gi, '\n');
        raw = raw.replace(/<[^>]+>/g, '');
        raw = raw.replace(/[ \t]+/g, ' ');
        raw = raw.replace(/\n{3,}/g, '\n\n');
        return raw.trim();
    }

    function formatMissionBody(text) {
        var cleaned = stripMissionPlaceholders(text);
        if (!cleaned) return '';
        var parts = cleaned.split(/\n+/).map(function (p) {
            return p.trim();
        }).filter(Boolean);
        if (parts.length <= 1) {
            return '<p class="sc-mission-para">' + escapeHtml(cleaned) + '</p>';
        }
        return parts
            .map(function (p) {
                return '<p class="sc-mission-para">' + escapeHtml(p) + '</p>';
            })
            .join('');
    }

    var MISSION_FIELD_GROUPS = [
        {
            id: 'prerequisites',
            title: '接取条件',
            labels: ['前置任务', '需要标签', '排除标签'],
            wideLabels: ['前置任务', '需要标签', '排除标签'],
        },
        {
            id: 'location',
            title: '区域地点',
            labels: ['相关星系', '任务地点'],
            wideLabels: ['任务地点'],
        },
        {
            id: 'rewards',
            title: '报酬奖励',
            labels: ['蓝图掉落', '接取费用', '声望扣除'],
            wideLabels: ['蓝图掉落'],
        },
    ];

    var SUPPRESSED_DETAIL_LABELS = ['护送方向'];

    var MISSION_SUMMARY_GROUPS = [
        {
            id: 'overview',
            title: '任务概况',
            labels: ['任务类型', '发布方', '派系', '合法性', '等级要求'],
        },
        {
            id: 'combat',
            title: '作战',
            labels: ['预计时长', '敌人数量', '战斗任务', '防守目标', '实例人数'],
        },
        {
            id: 'rewards',
            title: '报酬',
            labels: ['aUEC 奖励', '物品奖励', '声望报酬'],
        },
        {
            id: 'rules',
            title: '接取规则',
            labels: [
                '可共享',
                '一次性',
                '冷却',
                '有效期',
                '失败可重接',
                '放弃可重接',
                '犯罪即失败',
                '监狱可接',
            ],
        },
    ];

    function fieldsByLabel(fields) {
        var map = Object.create(null);
        (fields || []).forEach(function (row) {
            if (row && row.label) map[row.label] = row;
        });
        return map;
    }

    function shouldSkipHighlight(label, value) {
        if (!value) return true;
        if (label === '战斗任务' && value === '否') return true;
        if (label === '防守目标' && value !== '是') return true;
        if (label === '可共享' && value !== '是') return true;
        if (label === '合法性' && value === '合法') return true;
        if (
            label === '一次性' ||
            label === '失败可重接' ||
            label === '放弃可重接' ||
            label === '犯罪即失败' ||
            label === '监狱可接'
        ) {
            return value !== '是';
        }
        return false;
    }

    function summaryItemKind(label) {
        if (label === 'aUEC 奖励' || label === '声望报酬' || label === '物品奖励' || label === '蓝图掉落') {
            return 'reward';
        }
        if (
            label === '预计时长' ||
            label === '敌人数量' ||
            label === '战斗任务' ||
            label === '防守目标' ||
            label === '实例人数'
        ) {
            return 'combat';
        }
        if (
            label === '可共享' ||
            label === '冷却' ||
            label === '有效期' ||
            label === '一次性' ||
            label === '失败可重接' ||
            label === '放弃可重接' ||
            label === '犯罪即失败' ||
            label === '监狱可接'
        ) {
            return 'rule';
        }
        if (label === '合法性') return 'warn';
        return 'meta';
    }

    function collectSummaryItems(fields, detail) {
        var byLabel = fieldsByLabel(fields);
        var groups = [];

        MISSION_SUMMARY_GROUPS.forEach(function (group) {
            var items = [];
            group.labels.forEach(function (label) {
                var row = byLabel[label];
                if (!row || shouldSkipHighlight(label, row.value)) return;
                if (label === '派系' && byLabel['发布方'] && byLabel['发布方'].value === row.value) return;
                items.push({
                    label: label,
                    value: row.value,
                    kind: summaryItemKind(label),
                });
            });
            if (group.id === 'rewards' && detail && Array.isArray(detail.blueprint_pools) && detail.blueprint_pools.length) {
                var pool = detail.blueprint_pools[0];
                var dropValue =
                    (pool.drop_chance_percent != null ? pool.drop_chance_percent + '%' : '有') + ' 掉落池';
                items.push({ label: '蓝图掉落', value: dropValue, kind: 'reward' });
            }
            if (items.length) groups.push({ id: group.id, title: group.title, items: items });
        });

        return groups;
    }

    function renderSummaryGroupSection(group) {
        if (!group || !group.items || !group.items.length) return '';
        var html =
            '<section class="sc-blueprint-mission-section sc-blueprint-mission-section--' +
            group.id +
            '">';
        html += '<h4 class="sc-blueprint-mission-section-title">' + escapeHtml(group.title) + '</h4>';
        html += '<dl class="sc-mission-summary-grid">';
        group.items.forEach(function (item) {
            html +=
                '<div class="sc-mission-summary-item sc-mission-summary-item--' +
                escapeHtml(item.kind) +
                '">' +
                '<dt class="sc-mission-summary-label">' +
                escapeHtml(item.label) +
                '</dt>' +
                '<dd class="sc-mission-summary-value">' +
                escapeHtml(item.value) +
                '</dd></div>';
        });
        html += '</dl></section>';
        return html;
    }

    var MISSION_SUMMARY_DEFERRED_IDS = ['combat', 'rewards', 'rules'];

    function renderMissionSummarySections(fields, detail, groupIds) {
        var groups = collectSummaryItems(fields, detail);
        if (groupIds && groupIds.length) {
            var allow = Object.create(null);
            groupIds.forEach(function (id) {
                allow[id] = true;
            });
            groups = groups.filter(function (group) {
                return allow[group.id];
            });
        }
        if (!groups.length) return '';

        var sectionClass = 'sc-blueprint-mission-sections sc-blueprint-mission-sections--summary';
        if (groupIds && groupIds.length === 1 && groupIds[0] === 'overview') {
            sectionClass += ' sc-blueprint-mission-sections--summary-top';
        }
        if (
            groupIds &&
            groupIds.length === MISSION_SUMMARY_DEFERRED_IDS.length &&
            groupIds.every(function (id) {
                return MISSION_SUMMARY_DEFERRED_IDS.indexOf(id) >= 0;
            })
        ) {
            sectionClass += ' sc-blueprint-mission-sections--summary-bottom';
        }

        var html = '<div class="' + sectionClass + '">';
        groups.forEach(function (group) {
            html += renderSummaryGroupSection(group);
        });
        html += '</div>';
        return html;
    }

    function formatRepXp(value) {
        if (value == null || !Number.isFinite(Number(value))) return '—';
        return Number(value).toLocaleString('zh-CN');
    }

    function renderReputationLadder(ladder) {
        if (!ladder || !Array.isArray(ladder.tiers) || !ladder.tiers.length) return '';

        var html = '<div class="sc-rep-ladder">';
        html +=
            '<div class="sc-rep-ladder-head">' +
            '<span class="sc-rep-ladder-faction">' +
            escapeHtml(ladder.faction || '派系') +
            '</span>';
        if (ladder.has_requirement) {
            html += '<span class="sc-rep-ladder-range">';
            if (ladder.min_reputation != null && ladder.max_reputation != null) {
                html +=
                    '需声望 ' +
                    escapeHtml(formatRepXp(ladder.min_reputation)) +
                    ' – ' +
                    escapeHtml(formatRepXp(ladder.max_reputation));
            } else if (ladder.min_reputation != null) {
                html += '需声望 ≥ ' + escapeHtml(formatRepXp(ladder.min_reputation));
            } else if (ladder.max_reputation != null) {
                html += '需声望 ≤ ' + escapeHtml(formatRepXp(ladder.max_reputation));
            }
            html += '</span>';
        } else {
            html += '<span class="sc-rep-ladder-range sc-rep-ladder-range--info">声望等级参考</span>';
        }
        html += '</div>';

        html += '<ul class="sc-rep-ladder-list" role="list">';
        ladder.tiers.forEach(function (tier) {
            var cls = 'sc-rep-tier';
            if (tier.required) cls += ' sc-rep-tier--required';

            html += '<li class="' + cls + '">';
            html += '<span class="sc-rep-tier-check" aria-hidden="true"></span>';
            html += '<span class="sc-rep-tier-name">' + escapeHtml(tier.standing_zh || tier.display_name_en || '—') + '</span>';
            html += '<span class="sc-rep-tier-xp">' + escapeHtml(formatRepXp(tier.min_reputation)) + '</span>';
            html += '</li>';
        });
        html += '</ul>';

        if (ladder.hostile && ladder.hostile.standing_zh) {
            html +=
                '<p class="sc-rep-ladder-hostile">' +
                escapeHtml(ladder.hostile.standing_zh) +
                '（负声望）</p>';
        }
        html += '</div>';
        return html;
    }

    function detailPagePathname() {
        var p = window.location.pathname || '';
        if (/ship-component-detail(\.html)?$/i.test(p)) return p;
        if (/ship-components(\.html)?$/i.test(p)) {
            return p.replace(/ship-components(\.html)?$/i, function (_m, ext) {
                return 'ship-component-detail' + (ext || '');
            });
        }
        try {
            var stored = sessionStorage.getItem('scComponentListReturnPathname') || '';
            if (/ship-components(\.html)?$/i.test(stored)) {
                return stored.replace(/ship-components(\.html)?$/i, function (_m, ext) {
                    return 'ship-component-detail' + (ext || '');
                });
            }
        } catch (e) {
            /* ignore */
        }
        return '/ship-component-detail';
    }

    function readNavContext(container) {
        var panel = container && container.closest('[data-blueprint-panel]');
        var group = (panel && panel.dataset.navGroup) || '';
        var type = (panel && panel.dataset.navType) || '';
        if (!group || !type) {
            try {
                var params = new URLSearchParams(window.location.search || '');
                if (!group) group = params.get('group') || '';
                if (!type) type = params.get('type') || '';
            } catch (e) {
                /* ignore */
            }
        }
        return {
            group: group || 'component',
            type: type || '',
        };
    }

    function componentDetailHref(item, navContext) {
        var id = item && (item.component_id || item.uuid);
        if (!id) return '';
        var ctx = navContext || readNavContext();
        var group = (item && item.component_group) || ctx.group || 'component';
        var type = (item && item.component_type) || ctx.type || '';
        try {
            var url = new URL(detailPagePathname(), window.location.href);
            url.searchParams.set('id', String(id));
            url.searchParams.set('group', group);
            if (type) url.searchParams.set('type', type);
            return url.pathname + url.search;
        } catch (e) {
            var href =
                detailPagePathname() +
                '?id=' +
                encodeURIComponent(String(id)) +
                '&group=' +
                encodeURIComponent(group);
            if (type) href += '&type=' + encodeURIComponent(type);
            return href;
        }
    }

    function rememberComponentDetailId(id) {
        var cid = String(id || '').trim();
        if (!cid) return;
        try {
            sessionStorage.setItem('scComponentDetailId', cid);
        } catch (e) {
            /* ignore */
        }
    }

    function stashListReturnForDetailNav() {
        if (
            window.UssScComponentsListNav &&
            typeof window.UssScComponentsListNav.rememberListReturnState === 'function'
        ) {
            window.UssScComponentsListNav.rememberListReturnState();
        }
    }

    function renderBlueprintPoolChip(item, navContext) {
        var label = (item && (item.name_zh || item.name_en)) || '';
        if (!label) return '';
        var href = componentDetailHref(item, navContext);
        if (href) {
            return (
                '<a class="sc-mission-chip sc-mission-chip--link" href="' +
                escapeHtml(href) +
                '" data-component-id="' +
                escapeHtml(item.component_id || item.uuid || '') +
                '">' +
                escapeHtml(label) +
                '</a>'
            );
        }
        var ref = (item && (item.name_zh || item.name_en || item.uuid)) || '';
        if (ref) {
            return (
                '<button type="button" class="sc-mission-chip sc-mission-chip--link sc-mission-chip--resolve" data-pool-item-ref="' +
                escapeHtml(ref) +
                '">' +
                escapeHtml(label) +
                '</button>'
            );
        }
        return '<span class="sc-mission-chip">' + escapeHtml(label) + '</span>';
    }

    async function navigatePoolItemRef(ref, navContext) {
        var key = String(ref || '').trim();
        if (!key) return;
        try {
            var res = await fetch(apiUrl('/api/sc/components/' + encodeURIComponent(key)));
            var data = await res.json();
            if (res.ok && data.ok && data.item) {
                var href = componentDetailHref(
                    {
                        component_id: data.item.id_item || data.item.uuid,
                        component_type: data.item.type,
                        component_group: null,
                    },
                    navContext
                );
                if (href) {
                    rememberComponentDetailId(data.item.id_item || data.item.uuid);
                    stashListReturnForDetailNav();
                    window.location.href = href;
                    return;
                }
            }
        } catch (e) {
            /* fall through */
        }
        try {
            var sugRes = await fetch(apiUrl('/api/sc/components/suggest?q=' + encodeURIComponent(key) + '&limit=12'));
            var sugData = await sugRes.json();
            var items = (sugData && sugData.items) || [];
            var lower = key.toLowerCase();
            var exact = items.find(function (it) {
                return (
                    String(it.name_en || '')
                        .trim()
                        .toLowerCase() === lower ||
                    String(it.name_zh || '')
                        .trim()
                        .toLowerCase() === lower
                );
            });
            if (exact && exact.id_item != null) {
                var hrefExact = componentDetailHref(
                    {
                        component_id: exact.id_item,
                        component_type: exact.type,
                        component_group: null,
                    },
                    navContext
                );
                if (hrefExact) {
                    rememberComponentDetailId(exact.id_item);
                    stashListReturnForDetailNav();
                    window.location.href = hrefExact;
                }
            }
        } catch (e2) {
            /* ignore */
        }
    }

    function renderBlueprintPools(value, pools, navContext) {
        if (Array.isArray(pools) && pools.length) {
            var html = '<div class="sc-mission-pool-list">';
            pools.forEach(function (pool) {
                html += '<div class="sc-mission-pool">';
                if (pool.drop_chance_percent != null) {
                    html += '<div class="sc-mission-pool-head">' + escapeHtml(pool.drop_chance_percent + '% 掉落池') + '</div>';
                }
                html += '<div class="sc-mission-chips">';
                (pool.items || []).forEach(function (item) {
                    html += renderBlueprintPoolChip(item, navContext);
                });
                html += '</div></div>';
            });
            html += '</div>';
            return html;
        }

        var raw = String(value || '').trim();
        if (!raw) return '';
        var poolStrings = raw.split('；').filter(Boolean);
        if (!poolStrings.length) return escapeHtml(raw);
        var htmlLegacy = '<div class="sc-mission-pool-list">';
        poolStrings.forEach(function (pool) {
            var match = pool.match(/^([\d.]+%\s*掉落池)\s*[：:]\s*(.+)$/);
            htmlLegacy += '<div class="sc-mission-pool">';
            if (match) {
                htmlLegacy += '<div class="sc-mission-pool-head">' + escapeHtml(match[1]) + '</div>';
                htmlLegacy += '<div class="sc-mission-chips">';
                match[2].split('、').forEach(function (item) {
                    var t = item.trim();
                    if (!t) return;
                    htmlLegacy += renderBlueprintPoolChip({ name_zh: t }, navContext);
                });
                htmlLegacy += '</div>';
            } else {
                htmlLegacy += '<div class="sc-mission-pool-plain">' + escapeHtml(pool) + '</div>';
            }
            htmlLegacy += '</div>';
        });
        htmlLegacy += '</div>';
        return htmlLegacy;
    }

    function splitLocationNameToParts(name) {
        var text = String(name || '').trim();
        if (!text) return [];
        var parts = text
            .split(/\s*[·•|]\s*/)
            .map(function (seg) {
                return seg.trim();
            })
            .filter(Boolean);
        return parts.length > 1 ? parts : [text];
    }

    function renderLocationPartsHtml(parts) {
        if (!parts || !parts.length) return escapeHtml('—');
        return (
            '<span class="sc-loc-path">' +
            parts
                .map(function (part, i) {
                    var level = Math.min(i, 4);
                    return (
                        '<span class="sc-loc-level sc-loc-level--' +
                        level +
                        '">' +
                        escapeHtml(part) +
                        '</span>'
                    );
                })
                .join('') +
            '</span>'
        );
    }

    function renderLocationNamesRow(names) {
        var list = (names || []).filter(Boolean);
        if (!list.length) return '';
        var html = '<div class="sc-mission-loc-list">';
        list.forEach(function (name) {
            html +=
                '<span class="sc-mission-loc-item">' +
                renderLocationPartsHtml(splitLocationNameToParts(name)) +
                '</span>';
        });
        html += '</div>';
        return html;
    }

    function parseLocationValueString(value) {
        var groups = [];
        String(value || '')
            .split('；')
            .forEach(function (chunk) {
                var text = chunk.trim();
                if (!text) return;
                var idx = text.search(/[：:]/);
                if (idx < 0) return;
                var purpose = text.slice(0, idx).trim();
                var body = text.slice(idx + 1).trim();
                if (!purpose || !body) return;
                groups.push({
                    purpose_zh: purpose,
                    names: body
                        .split('、')
                        .map(function (seg) {
                            return seg.trim();
                        })
                        .filter(Boolean),
                });
            });
        return groups;
    }

    function getMissionLocationGroups(detail, byLabel) {
        if (detail && Array.isArray(detail.location_groups) && detail.location_groups.length) {
            return detail.location_groups;
        }
        var groups = [];
        if (byLabel['相关星系'] && byLabel['相关星系'].value) {
            groups.push({
                purpose_zh: '相关星系',
                names: String(byLabel['相关星系'].value)
                    .split('、')
                    .map(function (seg) {
                        return seg.trim();
                    })
                    .filter(Boolean),
            });
        }
        if (byLabel['任务地点'] && byLabel['任务地点'].value) {
            var parsed = parseLocationValueString(byLabel['任务地点'].value);
            if (parsed.length) groups.push.apply(groups, parsed);
        }
        return groups;
    }

    function renderMissionLocationGroups(groups) {
        if (!groups || !groups.length) return '';
        var html = '<div class="sc-mission-loc-groups">';
        groups.forEach(function (group) {
            if (!group || !group.names || !group.names.length) return;
            html += '<div class="sc-mission-loc-group">';
            html += '<div class="sc-mission-loc-group-label">' + escapeHtml(group.purpose_zh || '地点') + '</div>';
            html += renderLocationNamesRow(group.names);
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    function renderMissionFieldValue(row, wide, detail, valueClass, navContext) {
        var cls = valueClass || 'sc-mission-field-value';
        if (row.label === '蓝图掉落') {
            return renderBlueprintPools(row.value, detail && detail.blueprint_pools, navContext).replace(
                /sc-mission-field-value/g,
                cls
            );
        }
        if (wide) {
            return '<div class="' + cls + ' ' + cls + '--wide">' + escapeHtml(row.value) + '</div>';
        }
        return '<span class="' + cls + '">' + escapeHtml(row.value) + '</span>';
    }

    function renderMissionFieldRow(row, wide, detail, navContext) {
        var valueHtml = renderMissionFieldValue(row, wide, detail, 'sc-mission-kv-value', navContext);
        var highlight =
            row.label === 'aUEC 奖励' ||
            row.label === '声望报酬' ||
            row.label === '物品奖励' ||
            row.label === '蓝图掉落';
        return (
            '<div class="sc-mission-kv' +
            (wide ? ' sc-mission-kv--wide' : '') +
            (highlight ? ' sc-mission-kv--emphasis' : '') +
            '">' +
            '<span class="sc-mission-kv-label">' +
            escapeHtml(row.label) +
            '</span>' +
            valueHtml +
            '</div>'
        );
    }

    function missionHasPrerequisites(detail, rows) {
        if (rows && rows.length) return true;
        var ladder = detail && detail.reputation_ladder;
        return !!(
            ladder &&
            ladder.has_requirement &&
            Array.isArray(ladder.tiers) &&
            ladder.tiers.length
        );
    }

    function renderMissionFieldSections(fields, detail, navContext) {
        if (!fields || !fields.length) {
            if (!(detail && detail.reputation_ladder && detail.reputation_ladder.has_requirement)) return '';
        }
        var byLabel = Object.create(null);
        (fields || []).forEach(function (row) {
            if (row && row.label) byLabel[row.label] = row;
        });
        var html = '<div class="sc-blueprint-mission-sections">';
        MISSION_FIELD_GROUPS.forEach(function (group) {
            var rows = [];
            group.labels.forEach(function (label) {
                if (byLabel[label]) rows.push(byLabel[label]);
            });
            var hasRepLadder =
                group.id === 'prerequisites' &&
                detail &&
                detail.reputation_ladder &&
                detail.reputation_ladder.has_requirement &&
                Array.isArray(detail.reputation_ladder.tiers) &&
                detail.reputation_ladder.tiers.length;
            if (group.id === 'prerequisites' && !missionHasPrerequisites(detail, rows)) return;
            if (group.id === 'location') {
                var locGroups = getMissionLocationGroups(detail, byLabel);
                if (!locGroups.length && !rows.length) return;
            } else if (!rows.length && !hasRepLadder) return;
            var wideSet = Object.create(null);
            (group.wideLabels || []).forEach(function (l) {
                wideSet[l] = true;
            });
            html += '<section class="sc-blueprint-mission-section sc-blueprint-mission-section--' + group.id + '">';
            html += '<h4 class="sc-blueprint-mission-section-title">' + escapeHtml(group.title) + '</h4>';
            if (hasRepLadder) {
                html += renderReputationLadder(detail.reputation_ladder);
            }
            if (group.id === 'location') {
                var locationGroups = getMissionLocationGroups(detail, byLabel);
                if (locationGroups.length) {
                    html += renderMissionLocationGroups(locationGroups);
                } else if (rows.length) {
                    html += '<div class="sc-blueprint-mission-section-grid">';
                    rows.forEach(function (row) {
                        html += renderMissionFieldRow(row, !!wideSet[row.label], detail, navContext);
                    });
                    html += '</div>';
                }
            } else if (rows.length) {
                html += '<div class="sc-blueprint-mission-section-grid">';
                rows.forEach(function (row) {
                    html += renderMissionFieldRow(row, !!wideSet[row.label], detail, navContext);
                });
                html += '</div>';
            }
            html += '</section>';
        });
        var used = Object.create(null);
        MISSION_FIELD_GROUPS.forEach(function (group) {
            group.labels.forEach(function (label) {
                used[label] = true;
            });
        });
        MISSION_SUMMARY_GROUPS.forEach(function (group) {
            group.labels.forEach(function (label) {
                used[label] = true;
            });
        });
        used['蓝图掉落'] = true;
        SUPPRESSED_DETAIL_LABELS.forEach(function (label) {
            used[label] = true;
        });
        var extra = (fields || []).filter(function (row) {
            return row && row.label && !used[row.label] && SUPPRESSED_DETAIL_LABELS.indexOf(row.label) < 0;
        });
        if (extra.length) {
            html += '<section class="sc-blueprint-mission-section sc-blueprint-mission-section--extra">';
            html += '<h4 class="sc-blueprint-mission-section-title">其他</h4>';
            html += '<div class="sc-blueprint-mission-section-grid">';
            extra.forEach(function (row) {
                html += renderMissionFieldRow(row, String(row.value || '').length > 48, detail, navContext);
            });
            html += '</div></section>';
        }
        html += '</div>';
        return html;
    }

    function stripMissionFlowTitleSuffix(text) {
        return String(text || '')
            .replace(/\s*[·•]\s*(驶向|离开)\s*$/, '')
            .trim();
    }

    function missionDisplayTitle(m) {
        var raw = (m && (m.title_zh || m.title_en || m.title)) || '';
        var cleaned = stripMissionPlaceholders(raw);
        return stripMissionFlowTitleSuffix(cleaned || raw) || '—';
    }

    function missionRef(m) {
        if (!m) return '';
        if (m.uuid) return String(m.uuid);
        var url = String(m.web_url || '');
        var match = url.match(/\/missions\/([^/?#]+)/i);
        if (match) return decodeURIComponent(match[1]);
        if (m.debug_name) return String(m.debug_name).trim();
        return '';
    }

    function missionListCacheKey(item) {
        item = item || {};
        var blueprintUuid = String(item.blueprint_uuid || '').trim();
        var useComponent = item.use_component_missions === true;
        var id = item.id_item || item.uuid;
        if (useComponent && id) return 'c:' + String(id);
        if (blueprintUuid) return 'b:' + blueprintUuid;
        if (id) return 'c:' + String(id);
        return '';
    }

    function missionsForContainer(container) {
        var panelRoot = container.closest('[data-blueprint-panel]') || container;
        var cacheKey =
            container.dataset.missionsCacheKey || panelRoot.dataset.missionsCacheKey || '';
        if (cacheKey && listCache[cacheKey]) return listCache[cacheKey];
        if (container._bpMissions && container._bpMissions.length) return container._bpMissions;
        if (panelRoot._bpMissions && panelRoot._bpMissions.length) return panelRoot._bpMissions;
        return [];
    }

    function rememberMissionsOnPanel(container, item, missions) {
        var panelRoot = container.closest('[data-blueprint-panel]') || container;
        var cacheKey = missionListCacheKey(item);
        var list = missions || [];
        container._bpMissions = list;
        if (panelRoot !== container) panelRoot._bpMissions = list;
        if (cacheKey) {
            listCache[cacheKey] = list;
            container.dataset.missionsCacheKey = cacheKey;
            panelRoot.dataset.missionsCacheKey = cacheKey;
        }
    }

    function renderMetaRow(label, value) {
        if (!value) return '';
        return (
            '<div class="sc-blueprint-meta-row">' +
            '<span class="sc-blueprint-meta-label">' +
            escapeHtml(label) +
            '</span>' +
            '<span class="sc-blueprint-meta-value">' +
            escapeHtml(value) +
            '</span></div>'
        );
    }

    function renderMissionSummaryMeta(m) {
        var html = '';
        var dropLabel = formatBlueprintDropLabel(m.chance);
        if (dropLabel) {
            html += '<span class="sc-blueprint-mission-scope">' + escapeHtml(dropLabel) + '</span>';
        }
        if (m.variant_count != null && Number(m.variant_count) > 1) {
            html +=
                '<span class="sc-blueprint-mission-variants">' +
                escapeHtml(String(m.variant_count) + ' 个变体') +
                '</span>';
        }
        return html;
    }

    function renderMissionItem(m, expandedId) {
        var ref = missionRef(m);
        var isOpen = ref && expandedId === ref;

        var html =
            '<li class="sc-blueprint-mission-item' +
            (isOpen ? ' is-open' : '') +
            '">' +
            '<button type="button" class="sc-blueprint-mission-toggle" data-mission-ref="' +
            escapeHtml(ref) +
            '" aria-expanded="' +
            (isOpen ? 'true' : 'false') +
            '">' +
            '<span class="sc-blueprint-mission-toggle-main">' +
            '<span class="sc-blueprint-mission-title">' +
            escapeHtml(missionDisplayTitle(m)) +
            '</span>' +
            renderMissionSummaryMeta(m) +
            '</span>' +
            '<span class="sc-blueprint-mission-chevron" aria-hidden="true"></span>' +
            '</button>';

        html +=
            '<div class="sc-blueprint-mission-detail" id="sc-mission-detail-' +
            escapeHtml(ref) +
            '" data-mission-detail="' +
            escapeHtml(ref) +
            '"' +
            (isOpen ? '' : ' hidden') +
            '>';
        if (isOpen && detailCache[ref] && isUsableMissionDetail(detailCache[ref])) {
            html += renderMissionDetailBody(detailCache[ref], readNavContext(), m);
        } else if (isOpen) {
            html += '<p class="sc-acquire-loading">加载任务详情…</p>';
        }
        html += '</div></li>';
        return html;
    }

    function renderMissionDetailBody(detail, navContext, summary) {
        if (!detail) return '<p class="sc-acquire-empty">暂无任务详情</p>';
        var ctx = navContext || readNavContext();
        var body = missionBriefingZh(detail, summary);
        var html = '<div class="sc-blueprint-mission-detail-inner">';
        html += renderMissionSummarySections(detail.fields, detail, ['overview']);
        if (body) {
            html +=
                '<section class="sc-blueprint-mission-section sc-blueprint-mission-section--briefing">' +
                '<h4 class="sc-blueprint-mission-section-title">任务简报</h4>' +
                '<div class="sc-blueprint-mission-desc">' +
                formatMissionBody(body) +
                '</div></section>';
        } else if (detail.description_en) {
            html +=
                '<section class="sc-blueprint-mission-section sc-blueprint-mission-section--briefing">' +
                '<h4 class="sc-blueprint-mission-section-title">任务简报</h4>' +
                '<p class="sc-acquire-empty">任务简报暂未汉化</p></section>';
        }
        html += renderMissionFieldSections(detail.fields, detail, ctx);
        html += renderMissionSummarySections(detail.fields, detail, MISSION_SUMMARY_DEFERRED_IDS);
        if (!detail.loc_matched && detail.description_en && !detail.description_zh) {
            html += '<p class="sc-blueprint-mission-loc-note">该任务暂未匹配到完整译文</p>';
        }
        html += '</div>';
        return html;
    }

    function flattenUnlockingMissionGroups(groups) {
        if (!Array.isArray(groups) || !groups.length) return [];
        var out = [];
        groups.forEach(function (group) {
            (group.missions || []).forEach(function (m) {
                if (!m || typeof m !== 'object') return;
                var title = m.title || m.debug_name || '';
                var stub = { web_url: m.web_url || null, uuid: m.uuid || null };
                out.push({
                    uuid: m.uuid || missionRef(stub) || null,
                    title_en: title || '未命名任务',
                    title_zh: title || '未命名任务',
                    debug_name: m.debug_name || null,
                    web_url: m.web_url || null,
                    chance: m.chance != null ? m.chance : null,
                    reward_scope: m.reward_scope || null,
                });
            });
        });
        return out;
    }

    function embeddedBlueprintMissions(item) {
        return flattenUnlockingMissionGroups(item && item.unlocking_missions);
    }

    function renderMissionListHtml(missions, expandedId) {
        if (!missions || !missions.length) {
            return '<p class="sc-acquire-empty">暂无蓝图解锁任务</p>';
        }
        var html = '<ul class="sc-blueprint-mission-list">';
        missions.forEach(function (m) {
            html += renderMissionItem(m, expandedId);
        });
        html += '</ul>';
        return html;
    }

    async function fetchBlueprintMissions(item) {
        item = item || {};
        var blueprintUuid = String(item.blueprint_uuid || '').trim();
        var useComponent = item.use_component_missions === true;
        var id = item.id_item || item.uuid;
        var cacheKey;
        var url;
        if (useComponent && id) {
            cacheKey = 'c:' + String(id);
            url = apiUrl('/api/sc/components/' + encodeURIComponent(id) + '/blueprint-missions');
        } else if (blueprintUuid) {
            cacheKey = 'b:' + blueprintUuid;
            url = apiUrl('/api/sc/blueprints/' + encodeURIComponent(blueprintUuid) + '/missions');
        } else if (id) {
            cacheKey = 'c:' + String(id);
            url = apiUrl('/api/sc/components/' + encodeURIComponent(id) + '/blueprint-missions');
        } else {
            return [];
        }
        if (listCache[cacheKey]) return listCache[cacheKey];

        var embedded = embeddedBlueprintMissions(item);
        try {
            var res = await fetch(url + '?_=' + Date.now(), { cache: 'no-store' });
            var data = await parseJsonResponse(res, '蓝图任务响应解析失败');
            if (!res.ok || !data.ok) throw new Error((data && data.message) || '蓝图任务加载失败');
            var missions = data.missions || [];
            if (!missions.length && embedded.length) {
                listCache[cacheKey] = embedded;
                return embedded;
            }
            listCache[cacheKey] = missions;
            return missions;
        } catch (e) {
            if (embedded.length) {
                listCache[cacheKey] = embedded;
                return embedded;
            }
            throw e;
        }
    }

    async function fetchMissionDetail(ref, debugName) {
        var id = String(ref || '').trim();
        if (!id) throw new Error('缺少任务 ID');
        var cacheKey = id + '|' + String(debugName || '') + '|v' + DETAIL_SCHEMA_VERSION;
        if (detailCache[cacheKey] && isUsableMissionDetail(detailCache[cacheKey])) {
            return detailCache[cacheKey];
        }

        var url =
            apiUrl('/api/sc/missions/' + encodeURIComponent(id) + '/detail') +
            '?_sc_detail_v=' +
            DETAIL_SCHEMA_VERSION;
        if (debugName) {
            url += '&debug_name=' + encodeURIComponent(String(debugName));
        }
        var res = await fetch(url, { cache: 'no-store' });
        var data = await parseJsonResponse(res, '任务详情响应解析失败');
        if (!res.ok || !data.ok || !data.mission) {
            throw new Error((data && data.message) || '任务详情加载失败');
        }
        var mission = data.mission;
        if (!Array.isArray(mission.blueprint_pools) || !mission.blueprint_pools.length) {
            throw new Error('任务蓝图数据不完整，请重启后端后重试');
        }
        mission.__detailSchemaVersion = DETAIL_SCHEMA_VERSION;
        detailCache[cacheKey] = mission;
        detailCache[id] = mission;
        return detailCache[cacheKey];
    }

    function findMissionInList(missions, ref) {
        return (missions || []).find(function (m) {
            return missionRef(m) === ref;
        });
    }

    async function loadMissionDetail(container, ref) {
        var panelRoot = container.closest('[data-blueprint-panel]') || container;
        var missions = missionsForContainer(container);
        var detailEl = container.querySelector('[data-mission-detail="' + cssEscape(ref) + '"]');
        if (!detailEl) return;

        var summary = findMissionInList(missions, ref);
        var debugName = summary && summary.debug_name ? summary.debug_name : '';

        if (detailCache[ref] && isUsableMissionDetail(detailCache[ref])) {
            detailEl.hidden = false;
            detailEl.innerHTML = renderMissionDetailBody(detailCache[ref], readNavContext(container), summary);
            return;
        }

        detailEl.hidden = false;
        if (summary && missionBriefingZh(null, summary)) {
            detailEl.innerHTML =
                renderMissionDetailBody(
                    {
                        fields: [],
                        description_zh: summary.description_zh,
                        description_en: summary.description_en || '',
                        loc_matched: summary.loc_matched,
                    },
                    readNavContext(container),
                    summary
                ) + '<p class="sc-acquire-loading">加载完整任务详情…</p>';
        } else {
            detailEl.innerHTML = '<p class="sc-acquire-loading">加载任务详情…</p>';
        }
        try {
            var detail = await fetchMissionDetail(ref, debugName);
            if (!String(detail.description_zh || '').trim() && summary && summary.description_zh) {
                detail.description_zh = summary.description_zh;
            }
            if (panelRoot.dataset.expandedMission !== ref) return;
            detailEl.innerHTML = renderMissionDetailBody(detail, readNavContext(container), summary);
            if (summary && detail.title_zh) {
                summary.title_zh = stripMissionFlowTitleSuffix(detail.title_zh);
                summary.description_zh = detail.description_zh;
                summary.loc_matched = detail.loc_matched;
            }
        } catch (e) {
            if (panelRoot.dataset.expandedMission !== ref) return;
            detailEl.innerHTML =
                '<p class="sc-acquire-empty">' + escapeHtml((e && e.message) || '任务详情加载失败') + '</p>';
        }
    }

    async function toggleMissionDetail(container, ref) {
        var panelRoot = container.closest('[data-blueprint-panel]') || container;
        var expanded = panelRoot.dataset.expandedMission || '';
        var missions = missionsForContainer(container);
        var nextRef = expanded === ref ? '' : ref;
        panelRoot.dataset.expandedMission = nextRef;
        if (typeof container._bpOnExpandedChange === 'function') {
            container._bpOnExpandedChange(nextRef);
        }
        container.innerHTML = renderMissionListHtml(missions, nextRef);

        if (!nextRef) return;
        await loadMissionDetail(container, nextRef);
    }

    function wirePanel(container) {
        if (!container || container.dataset.blueprintWired === '1') return;
        container.dataset.blueprintWired = '1';
        container.addEventListener('mousedown', function (ev) {
            var chipLink = ev.target.closest('.sc-mission-chip--link[href]');
            if (chipLink && container.contains(chipLink)) stashListReturnForDetailNav();
        });
        container.addEventListener('click', function (ev) {
            var chipLink = ev.target.closest('.sc-mission-chip--link[href]');
            if (chipLink && container.contains(chipLink)) {
                var cid = chipLink.getAttribute('data-component-id');
                if (cid) rememberComponentDetailId(cid);
                stashListReturnForDetailNav();
                return;
            }
            var chipResolve = ev.target.closest('.sc-mission-chip--resolve[data-pool-item-ref]');
            if (chipResolve && container.contains(chipResolve)) {
                ev.preventDefault();
                navigatePoolItemRef(chipResolve.getAttribute('data-pool-item-ref'), readNavContext(container));
                return;
            }
            var btn = ev.target.closest('.sc-blueprint-mission-toggle');
            if (!btn || !container.contains(btn)) return;
            var ref = btn.getAttribute('data-mission-ref');
            if (!ref) return;
            ev.preventDefault();
            toggleMissionDetail(container, ref);
        });
    }

    function inferNavGroupFromItemType(typeKey) {
        var key = String(typeKey || '').trim();
        if (!key) return 'component';
        if (key === 'ship_weapon' || key === 'ship_turret' || key === 'ship_missile' || key === 'missile_rack') return 'weapon';
        if (key === 'mining_laser' || key === 'ship_module') return 'mining';
        return 'component';
    }

    async function mount(container, item, options) {
        if (!container || !item) return;
        options = options || {};
        var itemId = String(item.id_item || item.uuid || '');
        container.dataset.itemId = itemId;
        container._bpOnExpandedChange = options.onExpandedChange || null;
        var panelRoot = container.closest('[data-blueprint-panel]') || container;
        panelRoot.dataset.navGroup = inferNavGroupFromItemType(item.type);
        panelRoot.dataset.navType = String(item.type || '');
        container.innerHTML = '<p class="sc-acquire-loading">加载蓝图任务…</p>';
        wirePanel(container);

        try {
            var missions = await fetchBlueprintMissions(item);
            rememberMissionsOnPanel(container, item, missions);
            if (!container.isConnected) return;
            var expandedId = options.expandedId || container.dataset.expandedMission || '';
            if (expandedId) panelRoot.dataset.expandedMission = expandedId;
            container.innerHTML = renderMissionListHtml(missions, expandedId);
            if (expandedId) await loadMissionDetail(container, expandedId);
        } catch (e) {
            if (!container.isConnected) return;
            var embedded = embeddedBlueprintMissions(item);
            if (embedded.length) {
                rememberMissionsOnPanel(container, item, embedded);
                var expandedEmbedded = options.expandedId || container.dataset.expandedMission || '';
                if (expandedEmbedded) panelRoot.dataset.expandedMission = expandedEmbedded;
                container.innerHTML = renderMissionListHtml(embedded, expandedEmbedded);
                if (expandedEmbedded) await loadMissionDetail(container, expandedEmbedded);
                return;
            }
            var expandedId = options.expandedId || container.dataset.expandedMission || '';
            if (!itemHasBlueprintHints(item) && isJsonParseFailureMessage(e && e.message)) {
                container.innerHTML = renderMissionListHtml([], expandedId);
                return;
            }
            if (!itemHasBlueprintHints(item) && e && /Wiki API|蓝图任务加载失败|配件不存在|404/i.test(String(e.message || ''))) {
                container.innerHTML = renderMissionListHtml([], expandedId);
                return;
            }
            container.innerHTML =
                '<p class="sc-acquire-empty">' + escapeHtml((e && e.message) || '蓝图任务加载失败') + '</p>';
        }
    }

    window.ShipComponentBlueprints = {
        mount: mount,
        wirePanel: wirePanel,
        missionListCacheKey: missionListCacheKey,
        rememberMissionsOnPanel: rememberMissionsOnPanel,
        fetchBlueprintMissions: fetchBlueprintMissions,
        fetchMissionDetail: fetchMissionDetail,
        renderMissionListHtml: renderMissionListHtml,
        clearCache: function () {
            listCache = Object.create(null);
            detailCache = Object.create(null);
        },
    };
})();
