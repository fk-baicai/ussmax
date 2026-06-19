/**
 * 个人武器配件装配：槽位选择、本地持久化、增益展示
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'uss_sc_weapon_loadout_v1';
    var SLOT_DEFS = [
        { id: 'ironsight', label: '瞄具附件', short: '瞄', type: 'attachment_ironsight', subType: 'IronSight' },
        { id: 'barrel', label: '枪管附件', short: '枪', type: 'attachment_barrel', subType: 'Barrel' },
        { id: 'bottom', label: '枪管下挂件', short: '挂', type: 'attachment_bottom', subType: 'BottomAttachment' },
    ];

    var store = readStore();
    var attachmentCache = Object.create(null);
    var itemCache = Object.create(null);
    var overlayEl = null;
    var activeWeapon = null;
    var activeSlotId = null;
    var activeAnchor = null;
    var activeAttachments = [];
    var activeSearchQuery = '';
    var onChangeCallback = null;
    var loadoutPositionWired = false;

    function apiBase() {
        return (
            (global.USS_SC_COMPONENTS_API_BASE || global.USS_AUTH_API_BASE || global.USS_REGISTER_API_BASE || '') + ''
        ).replace(/\/$/, '');
    }

    function apiUrl(path) {
        return apiBase() + path;
    }

    function wiki() {
        return global.ShipComponentWiki;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function readStore() {
        try {
            var raw = global.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : Object.create(null);
        } catch (_) {
            return Object.create(null);
        }
    }

    function writeStore() {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch (_) {
            /* ignore */
        }
    }

    function weaponId(item) {
        if (!item) return '';
        var raw = item.id_item != null && item.id_item !== '' ? item.id_item : item.uuid;
        return raw != null ? String(raw).trim() : '';
    }

    function isWeaponLoadoutEligible(item) {
        if (!item || !item.type) return false;
        var type = String(item.type);
        if (type.indexOf('ship_') === 0) return false;
        if (type !== 'personal_weapon' && type.indexOf('weapon_') !== 0) return false;
        if (
            item.type === 'weapon_melee' ||
            item.type === 'weapon_throwable' ||
            item.type === 'weapon_crossbow' ||
            item.type === 'weapon_misc'
        ) {
            return false;
        }
        var w = wiki();
        if (!w || typeof w.getWeaponAttachmentSlotCount !== 'function') return false;
        var count = w.getWeaponAttachmentSlotCount(item);
        return count != null && count > 0;
    }

    function getSlotDefsForWeapon(item) {
        var w = wiki();
        var count = w && w.getWeaponAttachmentSlotCount ? w.getWeaponAttachmentSlotCount(item) : 0;
        if (!count || count <= 0) return [];
        if (count >= 3) return SLOT_DEFS.slice();
        return SLOT_DEFS.slice(0, 2);
    }

    function getLoadout(weaponItem) {
        var id = weaponId(weaponItem);
        if (!id) return Object.create(null);
        var raw = store[id];
        return raw && typeof raw === 'object' ? raw : Object.create(null);
    }

    function setLoadoutSlot(weaponItem, slotId, attachmentId) {
        var id = weaponId(weaponItem);
        if (!id) return;
        if (!store[id] || typeof store[id] !== 'object') store[id] = Object.create(null);
        if (attachmentId) store[id][slotId] = String(attachmentId);
        else delete store[id][slotId];
        if (!Object.keys(store[id]).length) delete store[id];
        writeStore();
        if (typeof onChangeCallback === 'function') onChangeCallback(id);
        global.dispatchEvent(new CustomEvent('uss-weapon-loadout-change', { detail: { weaponId: id } }));
    }

    function resolveDisplayName(item) {
        if (!item) return '—';
        var zh = String(item.name_zh || '').trim();
        var en = String(item.name_en || '').trim();
        if (zh && en && zh !== en) return zh;
        return zh || en || '—';
    }

    async function fetchComponentById(id) {
        var key = String(id || '').trim();
        if (!key) return null;
        if (itemCache[key]) return itemCache[key];
        var res = await fetch(apiUrl('/api/sc/components/' + encodeURIComponent(key)));
        if (!res.ok) return null;
        var data = await res.json();
        var item = data && data.item;
        if (item) itemCache[key] = item;
        return item || null;
    }

    function isBottomAttachmentSlot(slotDef) {
        return slotDef && slotDef.type === 'attachment_bottom';
    }

    async function fetchAttachmentsForSlot(slotDef, weaponItem) {
        var skipSizeFilter = isBottomAttachmentSlot(slotDef);
        var cacheKey =
            slotDef.type +
            '_' +
            String(weaponItem.size_num || weaponItem.size || '') +
            (skipSizeFilter ? '_all' : '');
        if (attachmentCache[cacheKey]) return attachmentCache[cacheKey];
        var url =
            apiUrl('/api/sc/components?type=' + encodeURIComponent(slotDef.type) + '&limit=500&sort=name');
        var res = await fetch(url);
        if (!res.ok) return [];
        var data = await res.json();
        var weaponSize = weaponItem.size_num != null ? Number(weaponItem.size_num) : Number(weaponItem.size);
        var list = (data.items || []).filter(function (att) {
            if (!att) return false;
            if (skipSizeFilter) return true;
            var attSize = att.size_num != null ? Number(att.size_num) : Number(att.size);
            if (Number.isFinite(weaponSize) && Number.isFinite(attSize) && weaponSize !== attSize) return false;
            return true;
        });
        list.sort(function (a, b) {
            return String(a.name_zh || a.name_en || '').localeCompare(String(b.name_zh || b.name_en || ''), 'zh-CN');
        });
        attachmentCache[cacheKey] = list;
        return list;
    }

    async function resolveEquippedItems(weaponItem) {
        var loadout = getLoadout(weaponItem);
        var slots = getSlotDefsForWeapon(weaponItem);
        var out = [];
        for (var i = 0; i < slots.length; i++) {
            var slot = slots[i];
            var attId = loadout[slot.id];
            if (!attId) continue;
            var att = await fetchComponentById(attId);
            if (att) out.push({ slot: slot, item: att });
        }
        return out;
    }

    function getPersonalWeaponBaseStats(weaponItem) {
        var pw = weaponItem && weaponItem.wiki_fields && weaponItem.wiki_fields.personal_weapon;
        if (!pw) return null;
        return {
            damage: pw.damage_per_shot != null ? Number(pw.damage_per_shot) : null,
            rpm: pw.rpm != null ? Number(pw.rpm) : pw.rof != null ? Number(pw.rof) : null,
            range:
                pw.effective_range != null
                    ? Number(pw.effective_range)
                    : pw.range != null
                      ? Number(pw.range)
                      : null,
        };
    }

    function applyRecoilModifierFromAttachment(recoilVal, att) {
        if (recoilVal == null || !Number.isFinite(recoilVal) || !att) return recoilVal;
        var w = wiki();
        if (w && typeof w.getBarrelRecoilMultiplier === 'function') {
            var mult = w.getBarrelRecoilMultiplier(att);
            if (mult != null && Number.isFinite(mult)) return recoilVal * mult;
        }
        return recoilVal;
    }

    function applyModifierBaseToStat(baseVal, modBase, statKey) {
        if (baseVal == null || !Number.isFinite(baseVal) || !modBase) return baseVal;
        var v = baseVal;
        if (statKey === 'damage') {
            if (modBase.damage_change != null && modBase.damage_change !== 0) {
                v = v * (1 + Number(modBase.damage_change));
            } else if (modBase.damage_multiplier != null && modBase.damage_multiplier !== 1) {
                v = v * Number(modBase.damage_multiplier);
            }
        } else if (statKey === 'rpm') {
            if (modBase.fire_rate_change != null && modBase.fire_rate_change !== 0) {
                v = v * (1 + Number(modBase.fire_rate_change));
            } else if (modBase.fire_rate_multiplier != null && modBase.fire_rate_multiplier !== 1) {
                v = v * Number(modBase.fire_rate_multiplier);
            }
        } else if (statKey === 'sound') {
            if (modBase.sound_radius_change != null && modBase.sound_radius_change !== 0) {
                v = v * (1 + Number(modBase.sound_radius_change));
            } else if (modBase.sound_radius_multiplier != null && modBase.sound_radius_multiplier !== 1) {
                v = v * Number(modBase.sound_radius_multiplier);
            }
        }
        return v;
    }

    function computeAdjustedStatsFromEquipped(weaponItem, equippedPairs) {
        var base = getPersonalWeaponBaseStats(weaponItem);
        if (!base) return null;

        var damage = base.damage;
        var rpm = base.rpm;
        var range = base.range;
        var sound = 1;
        var recoil = 1;

        (equippedPairs || []).forEach(function (pair) {
            var modBase =
                pair.item &&
                pair.item.wiki_fields &&
                pair.item.wiki_fields.weapon_modifier &&
                pair.item.wiki_fields.weapon_modifier.base;
            if (modBase) {
                damage = applyModifierBaseToStat(damage, modBase, 'damage');
                rpm = applyModifierBaseToStat(rpm, modBase, 'rpm');
                sound = applyModifierBaseToStat(sound, modBase, 'sound');
            }
            recoil = applyRecoilModifierFromAttachment(recoil, pair.item);
        });

        function roundStat(key, val) {
            if (val == null || !Number.isFinite(val)) return null;
            if (key === 'damage') return Math.round(val * 10) / 10;
            if (key === 'rpm') return Math.round(val);
            if (key === 'sound') return Math.round(val * 100) / 100;
            if (key === 'recoil') return Math.round(val * 100) / 100;
            return val;
        }

        damage = roundStat('damage', damage);
        rpm = roundStat('rpm', rpm);
        sound = roundStat('sound', sound);
        recoil = roundStat('recoil', recoil);

        return {
            damage: damage,
            rpm: rpm,
            range: range,
            sound: sound,
            recoil: recoil,
            base: {
                damage: base.damage,
                rpm: base.rpm,
                range: base.range,
                sound: 1,
                recoil: 1,
            },
            modified: {
                damage: base.damage != null && damage != null && damage !== base.damage,
                rpm: base.rpm != null && rpm != null && rpm !== base.rpm,
                range: false,
                sound: sound !== 1,
                recoil: recoil !== 1,
            },
        };
    }

    function computeAdjustedStatsSync(weaponItem) {
        var loadout = getLoadout(weaponItem);
        if (!Object.keys(loadout).length) return null;
        var pairs = [];
        var defs = getSlotDefsForWeapon(weaponItem);
        for (var i = 0; i < defs.length; i++) {
            var slot = defs[i];
            var attId = loadout[slot.id];
            if (!attId) continue;
            var att = itemCache[attId];
            if (!att) return null;
            pairs.push({ slot: slot, item: att });
        }
        if (!pairs.length) return null;
        return computeAdjustedStatsFromEquipped(weaponItem, pairs);
    }

    function formatLoadoutStatValue(statKey, value) {
        if (value == null || !Number.isFinite(value)) return null;
        var w = wiki();
        var fmt = w && w.formatWikiScalar ? w.formatWikiScalar : String;
        if (statKey === 'wiki_pw_dmg') return fmt(value);
        if (statKey === 'wiki_pw_rpm') return fmt(value) + ' RPM';
        if (statKey === 'wiki_pw_range') return fmt(value) + ' m';
        if (statKey === 'wiki_pw_sound') return fmt(value);
        if (statKey === 'wiki_pw_recoil') return fmt(value);
        return fmt(value);
    }

    function getLoadoutStatDeltaTone(colKey, baseVal, value) {
        if (value == null || baseVal == null || value === baseVal) return 'neutral';
        if (colKey === 'wiki_pw_sound' || colKey === 'wiki_pw_recoil') return value < baseVal ? 'good' : 'bad';
        return value > baseVal ? 'good' : 'bad';
    }

    function formatLoadoutStatDelta(colKey, delta) {
        if (delta == null || !Number.isFinite(delta)) return null;
        if (colKey === 'wiki_pw_dmg') {
            if (Math.abs(delta) < 0.05) return null;
            var dmgDelta = Math.round(delta * 10) / 10;
            return (dmgDelta > 0 ? '+' : '') + String(dmgDelta);
        }
        if (colKey === 'wiki_pw_rpm') {
            if (Math.abs(delta) < 0.5) return null;
            var rpmDelta = Math.round(delta);
            return (rpmDelta > 0 ? '+' : '') + String(rpmDelta);
        }
        if (colKey === 'wiki_pw_range') {
            if (Math.abs(delta) < 0.5) return null;
            var rangeDelta = Math.round(delta);
            return (rangeDelta > 0 ? '+' : '') + String(rangeDelta);
        }
        if (colKey === 'wiki_pw_sound') {
            if (Math.abs(delta) < 0.005) return null;
            var soundDelta = Math.round(delta * 100) / 100;
            return (soundDelta > 0 ? '+' : '') + String(soundDelta);
        }
        if (colKey === 'wiki_pw_recoil') {
            if (Math.abs(delta) < 0.005) return null;
            var recoilDelta = Math.round(delta * 100) / 100;
            return (recoilDelta > 0 ? '+' : '') + String(recoilDelta);
        }
        return null;
    }

    function renderLoadoutStatCellHtml(colKey, value, baseVal, modified) {
        var main = value != null ? formatLoadoutStatValue(colKey, value) : '—';
        if (!modified || baseVal == null || value == null) return escapeHtml(main);
        var deltaText = formatLoadoutStatDelta(colKey, value - baseVal);
        if (!deltaText) return escapeHtml(main);
        var tone = getLoadoutStatDeltaTone(colKey, baseVal, value);
        return (
            escapeHtml(main) +
            '<span class="sc-stat-loadout-delta sc-stat-loadout-delta--' +
            tone +
            '"> (' +
            escapeHtml(deltaText) +
            ')</span>'
        );
    }

    var LOADOUT_STAT_ROWS = [
        { colKey: 'wiki_pw_dmg', statKey: 'damage', label: '单发伤害' },
        { colKey: 'wiki_pw_rpm', statKey: 'rpm', label: '射速' },
        { colKey: 'wiki_pw_sound', statKey: 'sound', label: '声响系数' },
        { colKey: 'wiki_pw_recoil', statKey: 'recoil', label: '后坐力系数' },
    ];

    function renderDetailLoadoutStatsHtml(stats) {
        if (!stats) {
            return '<p class="sc-loadout-detail__empty">未装配配件</p>';
        }
        var rowsHtml = '';
        LOADOUT_STAT_ROWS.forEach(function (row) {
            var value = stats[row.statKey];
            var baseVal = stats.base[row.statKey];
            var modified = stats.modified[row.statKey];
            if (row.statKey === 'sound' && !modified && value === 1) return;
            if (row.statKey === 'recoil' && !modified && value === 1) return;
            if ((row.statKey === 'damage' || row.statKey === 'rpm') && value == null) return;
            rowsHtml +=
                '<div class="sc-loadout-detail-stat">' +
                '<span class="sc-loadout-detail-stat__label">' +
                escapeHtml(row.label) +
                '</span>' +
                '<span class="sc-loadout-detail-stat__value' +
                (modified ? ' sc-loadout-detail-stat__value--mod' : '') +
                '">' +
                renderLoadoutStatCellHtml(row.colKey, value, baseVal, modified) +
                '</span></div>';
        });
        if (!rowsHtml) {
            return '<p class="sc-loadout-detail__empty">已装配配件，暂无属性变化</p>';
        }
        return (
            '<div class="sc-loadout-detail-stats">' +
            '<h3 class="sc-loadout-detail-stats__title">装配后属性</h3>' +
            '<div class="sc-loadout-detail-stats__grid">' +
            rowsHtml +
            '</div></div>'
        );
    }

    function updateRowLoadoutStats(weaponItem, tr) {
        if (!tr || !weaponItem) return;
        var stats = computeAdjustedStatsSync(weaponItem);
        if (!stats) return;
        var statMap = {
            wiki_pw_dmg: 'damage',
            wiki_pw_rpm: 'rpm',
            wiki_pw_range: 'range',
            wiki_pw_sound: 'sound',
            wiki_pw_recoil: 'recoil',
        };
        Object.keys(statMap).forEach(function (colKey) {
            var td = tr.querySelector('td.sc-col-' + colKey);
            if (!td) return;
            var statName = statMap[colKey];
            var value = stats[statName];
            var baseVal = stats.base[statName];
            var modified = stats.modified[statName];
            td.innerHTML = renderLoadoutStatCellHtml(colKey, value, baseVal, modified);
            if (modified && baseVal != null && value != null) {
                td.classList.add('sc-stat-loadout-mod');
                td.title = '基础 ' + formatLoadoutStatValue(colKey, baseVal);
            } else {
                td.classList.remove('sc-stat-loadout-mod');
                td.removeAttribute('title');
            }
        });
    }

    async function hydrateWeaponLoadoutRow(weaponItem, tr) {
        if (!tr || !weaponItem) return;
        var loadout = getLoadout(weaponItem);
        if (!Object.keys(loadout).length) return;

        await resolveEquippedItems(weaponItem);

        var td = tr.querySelector('td.sc-col-name');
        var mount = td && td.querySelector('.sc-weapon-loadout-tags-mount');
        if (mount) mount.innerHTML = renderListTagsHtml(weaponItem);

        updateRowLoadoutStats(weaponItem, tr);
    }

    function formatPercentDelta(mult) {
        var n = Number(mult);
        if (!Number.isFinite(n) || n === 1) return null;
        var pct = Math.round((n - 1) * 100);
        if (pct === 0) return null;
        return (pct > 0 ? '+' : '') + pct + '%';
    }

    function buildCombinedLoadoutTags(weaponItem, equippedPairs) {
        var tags = [];
        var seen = Object.create(null);
        var combined = {
            damage: 1,
            fire_rate: 1,
            proj_speed: 1,
            sound: 1,
            heat: 1,
        };

        function pushTag(tag) {
            if (!tag || !tag.label || seen[tag.label]) return;
            seen[tag.label] = true;
            tags.push(tag);
        }

        (equippedPairs || []).forEach(function (pair) {
            var att = pair.item;
            var w = wiki();
            if (w && typeof w.buildAttachmentModifierTags === 'function') {
                w.buildAttachmentModifierTags(att).forEach(pushTag);
            }
            var base = att.wiki_fields && att.wiki_fields.weapon_modifier && att.wiki_fields.weapon_modifier.base;
            if (base) {
                if (base.damage_multiplier) combined.damage *= Number(base.damage_multiplier) || 1;
                if (base.fire_rate_multiplier) combined.fire_rate *= Number(base.fire_rate_multiplier) || 1;
                if (base.projectile_speed_multiplier) combined.proj_speed *= Number(base.projectile_speed_multiplier) || 1;
                if (base.sound_radius_multiplier) combined.sound *= Number(base.sound_radius_multiplier) || 1;
                if (base.heat_generation_multiplier) combined.heat *= Number(base.heat_generation_multiplier) || 1;
            }
        });

        var dmgPct = formatPercentDelta(combined.damage);
        if (dmgPct) pushTag({ label: '综合伤害', text: dmgPct, tone: combined.damage >= 1 ? 'good' : 'bad' });
        var rofPct = formatPercentDelta(combined.fire_rate);
        if (rofPct) pushTag({ label: '综合射速', text: rofPct, tone: combined.fire_rate >= 1 ? 'good' : 'bad' });
        var spdPct = formatPercentDelta(combined.proj_speed);
        if (spdPct) pushTag({ label: '弹速', text: spdPct, tone: combined.proj_speed >= 1 ? 'good' : 'bad' });
        var sndPct = formatPercentDelta(combined.sound);
        if (sndPct) pushTag({ label: '声响', text: sndPct, tone: combined.sound <= 1 ? 'good' : 'bad' });

        var pw = weaponItem && weaponItem.wiki_fields && weaponItem.wiki_fields.personal_weapon;
        if (pw && combined.damage !== 1 && pw.damage_per_shot != null) {
            var nextDmg = Math.round(Number(pw.damage_per_shot) * combined.damage * 10) / 10;
            pushTag({ label: '预估伤害', text: String(nextDmg), tone: 'accent' });
        }

        return tags;
    }

    function renderTagsMarkup(tags) {
        var w = wiki();
        if (w && typeof w.renderMiningModifierTagsMarkup === 'function') {
            return w.renderMiningModifierTagsMarkup(tags, escapeHtml);
        }
        if (!tags || !tags.length) return '';
        return (
            '<span class="sc-mining-mod-tags">' +
            tags
                .map(function (tag) {
                    return (
                        '<span class="sc-loc-level sc-mining-mod-tag sc-mining-mod-tag--' +
                        (tag.tone || 'neutral') +
                        '"><span class="sc-mining-mod-tag__label">' +
                        escapeHtml(tag.label) +
                        '</span><span class="sc-mining-mod-tag__value">' +
                        escapeHtml(tag.text) +
                        '</span></span>'
                    );
                })
                .join('') +
            '</span>'
        );
    }

    function ensureOverlay() {
        if (overlayEl) return overlayEl;
        overlayEl = document.createElement('div');
        overlayEl.className = 'sc-loadout-overlay sc-loadout-popover';
        overlayEl.hidden = true;
        overlayEl.setAttribute('role', 'dialog');
        overlayEl.setAttribute('aria-modal', 'false');
        overlayEl.setAttribute('aria-label', '武器配件装配');
        overlayEl.innerHTML =
            '<div class="sc-loadout-modal">' +
            '<header class="sc-loadout-modal__head">' +
            '<div class="sc-loadout-modal__head-copy">' +
            '<h2 class="sc-loadout-modal__title" id="scLoadoutTitle">配件装配</h2>' +
            '<p class="sc-loadout-modal__weapon" id="scLoadoutWeaponName"></p>' +
            '</div>' +
            '<button type="button" class="sc-loadout-modal__close" id="scLoadoutClose" aria-label="关闭">×</button>' +
            '</header>' +
            '<div class="sc-loadout-modal__body">' +
            '<div class="sc-loadout-tabs" id="scLoadoutTabs" role="tablist" aria-label="配件槽位"></div>' +
            '<div class="sc-loadout-toolbar">' +
            '<label class="sc-loadout-search">' +
            '<span class="sc-loadout-search__icon" aria-hidden="true">⌕</span>' +
            '<input type="search" class="sc-loadout-search__input" id="scLoadoutSearch" placeholder="搜索配件名称…" autocomplete="off">' +
            '</label>' +
            '<span class="sc-loadout-toolbar__count" id="scLoadoutCount"></span>' +
            '</div>' +
            '<div class="sc-loadout-picker__list" id="scLoadoutPickerList" role="listbox" aria-label="可选配件"></div>' +
            '<div class="sc-loadout-effects" id="scLoadoutEffectsWrap">' +
            '<h3 class="sc-loadout-effects__title" id="scLoadoutEffectsTitle">配件增益</h3>' +
            '<div class="sc-loadout-effects__tags" id="scLoadoutEffects"></div>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlayEl);

        overlayEl.querySelector('#scLoadoutClose').addEventListener('click', closeModal);
        overlayEl.querySelector('#scLoadoutSearch').addEventListener('input', function (e) {
            activeSearchQuery = String(e.target.value || '').trim().toLowerCase();
            renderPickerList();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlayEl && !overlayEl.hidden) closeModal();
        });
        return overlayEl;
    }

    function closeModal() {
        if (!overlayEl) return;
        overlayEl.hidden = true;
        activeWeapon = null;
        activeSlotId = null;
        activeAnchor = null;
        activeAttachments = [];
        activeSearchQuery = '';
        syncAnchorState();
        var searchEl = overlayEl.querySelector('#scLoadoutSearch');
        if (searchEl) searchEl.value = '';
    }

    function syncAnchorState() {
        var openBtns = document.querySelectorAll('.sc-loadout-btn.is-open, .sc-loadout-detail__open.is-open');
        for (var i = 0; i < openBtns.length; i++) openBtns[i].classList.remove('is-open');
        if (activeAnchor && overlayEl && !overlayEl.hidden) activeAnchor.classList.add('is-open');
    }

    function isModalOpenForWeapon(weaponItem) {
        return (
            overlayEl &&
            !overlayEl.hidden &&
            activeWeapon &&
            weaponId(activeWeapon) === weaponId(weaponItem)
        );
    }

    function positionLoadoutPanel() {
        if (!overlayEl || overlayEl.hidden || !activeAnchor) return;
        var modal = overlayEl.querySelector('.sc-loadout-modal');
        if (!modal) return;
        var rect = activeAnchor.getBoundingClientRect();
        var gap = 8;
        var margin = 10;
        var width = modal.offsetWidth || 400;
        var height = modal.offsetHeight || 360;
        var top = rect.bottom + gap;
        var left = Math.min(rect.left, rect.right - width);

        if (left < margin) left = margin;
        if (left + width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - width - margin);
        }
        if (top + height > window.innerHeight - margin) {
            top = rect.top - height - gap;
        }
        if (top < margin) top = margin;

        modal.style.top = Math.round(top) + 'px';
        modal.style.left = Math.round(left) + 'px';
    }

    function schedulePositionLoadoutPanel() {
        window.requestAnimationFrame(function () {
            positionLoadoutPanel();
            window.requestAnimationFrame(positionLoadoutPanel);
        });
    }

    function wireLoadoutPositionSync() {
        if (loadoutPositionWired) return;
        loadoutPositionWired = true;
        window.addEventListener('resize', positionLoadoutPanel);
        window.addEventListener('scroll', positionLoadoutPanel, true);
    }

    function buildSingleAttachmentTags(item) {
        var w = wiki();
        if (!w || typeof w.buildAttachmentModifierTags !== 'function') return [];
        return w.buildAttachmentModifierTags(item) || [];
    }

    async function refreshEffectsPanel() {
        if (!activeWeapon || !overlayEl) return;
        var effectsEl = overlayEl.querySelector('#scLoadoutEffects');
        var titleEl = overlayEl.querySelector('#scLoadoutEffectsTitle');
        if (!effectsEl) return;

        if (!activeSlotId) {
            if (titleEl) titleEl.textContent = '配件增益';
            effectsEl.innerHTML = '<p class="sc-loadout-effects__empty">请选择配件槽位</p>';
            return;
        }

        var slotDef = null;
        var defs = getSlotDefsForWeapon(activeWeapon);
        for (var i = 0; i < defs.length; i++) {
            if (defs[i].id === activeSlotId) {
                slotDef = defs[i];
                break;
            }
        }
        if (titleEl) {
            titleEl.textContent = slotDef ? slotDef.label + ' · 当前增益' : '配件增益';
        }

        var loadout = getLoadout(activeWeapon);
        var attId = loadout[activeSlotId];
        if (!attId) {
            effectsEl.innerHTML = '<p class="sc-loadout-effects__empty">当前槽位未装配配件</p>';
            return;
        }

        effectsEl.innerHTML = '<p class="sc-loadout-effects__empty">计算中…</p>';
        var att = itemCache[attId] || (await fetchComponentById(attId));
        if (!att) {
            effectsEl.innerHTML = '<p class="sc-loadout-effects__empty">无法读取配件数据</p>';
            return;
        }

        var tags = buildSingleAttachmentTags(att);
        if (!tags.length) {
            effectsEl.innerHTML = '<p class="sc-loadout-effects__empty">该配件无额外增益</p>';
            return;
        }
        effectsEl.innerHTML = renderTagsMarkup(tags);
    }

    async function resolveSlotEquippedName(slotId, loadout) {
        var attId = loadout[slotId];
        if (!attId) return '空';
        var cached = itemCache[attId];
        if (cached) return resolveDisplayName(cached);
        var fetched = await fetchComponentById(attId);
        return fetched ? resolveDisplayName(fetched) : '已装备';
    }

    async function renderTabs() {
        if (!activeWeapon || !overlayEl) return;
        var tabsEl = overlayEl.querySelector('#scLoadoutTabs');
        if (!tabsEl) return;
        var defs = getSlotDefsForWeapon(activeWeapon);
        var loadout = getLoadout(activeWeapon);
        var html = '';
        for (var i = 0; i < defs.length; i++) {
            var slot = defs[i];
            var name = await resolveSlotEquippedName(slot.id, loadout);
            var filled = !!loadout[slot.id];
            html +=
                '<button type="button" class="sc-loadout-tab' +
                (activeSlotId === slot.id ? ' is-active' : '') +
                (filled ? ' is-filled' : '') +
                '" role="tab" aria-selected="' +
                (activeSlotId === slot.id ? 'true' : 'false') +
                '" data-slot-id="' +
                escapeHtml(slot.id) +
                '">' +
                '<span class="sc-loadout-tab__label">' +
                escapeHtml(slot.label) +
                '</span>' +
                '<span class="sc-loadout-tab__value">' +
                escapeHtml(name) +
                '</span>' +
                '</button>';
        }
        tabsEl.innerHTML = html;
        tabsEl.querySelectorAll('.sc-loadout-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectSlot(btn.getAttribute('data-slot-id'));
            });
        });
    }

    function filterAttachments(list) {
        if (!activeSearchQuery) return list;
        return (list || []).filter(function (att) {
            var zh = String(att.name_zh || '').toLowerCase();
            var en = String(att.name_en || '').toLowerCase();
            return zh.indexOf(activeSearchQuery) !== -1 || en.indexOf(activeSearchQuery) !== -1;
        });
    }

    function renderPickerList() {
        if (!overlayEl || !activeWeapon || !activeSlotId) return;
        var listEl = overlayEl.querySelector('#scLoadoutPickerList');
        var countEl = overlayEl.querySelector('#scLoadoutCount');
        if (!listEl) return;

        var loadout = getLoadout(activeWeapon);
        var currentId = loadout[activeSlotId] || '';
        var filtered = filterAttachments(activeAttachments);

        if (countEl) {
            countEl.textContent = filtered.length ? filtered.length + ' 项' : '';
        }

        if (!activeAttachments.length) {
            listEl.innerHTML = '<p class="sc-loadout-picker__empty">暂无可用配件</p>';
            return;
        }
        if (!filtered.length) {
            listEl.innerHTML = '<p class="sc-loadout-picker__empty">没有匹配的配件</p>';
            return;
        }

        var rows =
            '<button type="button" class="sc-loadout-pick sc-loadout-pick--clear' +
            (!currentId ? ' is-selected' : '') +
            '" data-att-id="">' +
            '<span class="sc-loadout-pick__check" aria-hidden="true"></span>' +
            '<span class="sc-loadout-pick__body">' +
            '<span class="sc-loadout-pick__name">卸下配件</span>' +
            '<span class="sc-loadout-pick__meta">恢复空槽</span>' +
            '</span></button>';

        filtered.forEach(function (att) {
            var id = weaponId(att);
            var tags = buildSingleAttachmentTags(att);
            var metaHtml = tags.length
                ? '<span class="sc-loadout-pick__meta">' + renderTagsMarkup(tags) + '</span>'
                : '';
            rows +=
                '<button type="button" class="sc-loadout-pick' +
                (currentId === id ? ' is-selected' : '') +
                '" data-att-id="' +
                escapeHtml(id) +
                '">' +
                '<span class="sc-loadout-pick__check" aria-hidden="true"></span>' +
                '<span class="sc-loadout-pick__body">' +
                '<span class="sc-loadout-pick__name">' +
                escapeHtml(resolveDisplayName(att)) +
                '</span>' +
                metaHtml +
                '</span></button>';
        });
        listEl.innerHTML = rows;
        listEl.querySelectorAll('.sc-loadout-pick').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var attId = btn.getAttribute('data-att-id') || '';
                setLoadoutSlot(activeWeapon, activeSlotId, attId || null);
                if (attId) await fetchComponentById(attId);
                await renderTabs();
                renderPickerList();
                await refreshEffectsPanel();
            });
        });
    }

    async function selectSlot(slotId) {
        if (!activeWeapon) return;
        var slotDef = null;
        var defs = getSlotDefsForWeapon(activeWeapon);
        for (var i = 0; i < defs.length; i++) {
            if (defs[i].id === slotId) {
                slotDef = defs[i];
                break;
            }
        }
        if (!slotDef) return;

        var slotChanged = activeSlotId !== slotId;
        activeSlotId = slotId;
        if (slotChanged) {
            activeSearchQuery = '';
            var searchInput = overlayEl.querySelector('#scLoadoutSearch');
            if (searchInput) searchInput.value = '';
        }
        var listEl = overlayEl.querySelector('#scLoadoutPickerList');
        if (listEl) listEl.innerHTML = '<p class="sc-loadout-picker__loading">加载配件列表…</p>';
        await renderTabs();

        activeAttachments = await fetchAttachmentsForSlot(slotDef, activeWeapon);
        renderPickerList();
        await refreshEffectsPanel();
        schedulePositionLoadoutPanel();

        var searchEl = overlayEl.querySelector('#scLoadoutSearch');
        if (searchEl) searchEl.focus();
    }

    async function openModal(weaponItem, anchorEl, initialSlotId) {
        if (!isWeaponLoadoutEligible(weaponItem)) return;
        if (isModalOpenForWeapon(weaponItem) && !initialSlotId) {
            closeModal();
            return;
        }
        ensureOverlay();
        wireLoadoutPositionSync();
        activeWeapon = weaponItem;
        activeAnchor = anchorEl || activeAnchor || null;
        activeSearchQuery = '';
        var searchEl = overlayEl.querySelector('#scLoadoutSearch');
        if (searchEl) searchEl.value = '';
        overlayEl.querySelector('#scLoadoutWeaponName').textContent = resolveDisplayName(weaponItem);
        overlayEl.hidden = false;

        var defs = getSlotDefsForWeapon(weaponItem);
        var slotToOpen = initialSlotId;
        if (!slotToOpen || !defs.some(function (d) { return d.id === slotToOpen; })) {
            slotToOpen = defs.length ? defs[0].id : null;
        }
        if (slotToOpen) await selectSlot(slotToOpen);
        else await refreshEffectsPanel();

        syncAnchorState();
        schedulePositionLoadoutPanel();
    }

    function renderListTagsHtml(weaponItem) {
        var id = weaponId(weaponItem);
        if (!id || !isWeaponLoadoutEligible(weaponItem)) return '';
        var loadout = getLoadout(weaponItem);
        if (!Object.keys(loadout).length) return '';

        var lines = [];
        var defs = getSlotDefsForWeapon(weaponItem);
        defs.forEach(function (slot) {
            var attId = loadout[slot.id];
            if (!attId) return;
            var att = itemCache[attId];
            var name = att ? resolveDisplayName(att) : '已装备';
            lines.push({ slot: slot.short, name: name });
        });

        if (!lines.length) return '';
        return (
            '<span class="sc-loc-path sc-loc-path--loadout sc-weapon-loadout-names">' +
            lines
                .map(function (line) {
                    return (
                        '<span class="sc-loc-path-row">' +
                        '<span class="sc-loc-level sc-loc-level--0">' +
                        escapeHtml(line.slot) +
                        '</span>' +
                        '<span class="sc-loc-level sc-loc-level--1">' +
                        escapeHtml(line.name) +
                        '</span></span>'
                    );
                })
                .join('') +
            '</span>'
        );
    }

    async function hydrateListTags(weaponItem, container, tr) {
        if (!container) return;
        var id = weaponId(weaponItem);
        if (!id || !isWeaponLoadoutEligible(weaponItem)) return;
        var loadout = getLoadout(weaponItem);
        var ids = Object.keys(loadout)
            .map(function (k) {
                return loadout[k];
            })
            .filter(Boolean);
        if (!ids.length) return;
        await Promise.all(
            ids.map(function (attId) {
                return fetchComponentById(attId);
            })
        );
        container.innerHTML = renderListTagsHtml(weaponItem);
        if (tr) updateRowLoadoutStats(weaponItem, tr);
    }

    function renderDetailPanel(weaponItem, mountEl, options) {
        if (!mountEl) return;
        options = options || {};
        mountEl._loadoutOptions = options;
        if (!isWeaponLoadoutEligible(weaponItem)) {
            mountEl.hidden = true;
            mountEl.innerHTML = '';
            return;
        }
        mountEl.hidden = false;
        var compact = options.compact === true;
        var openAnchor = options.openAnchor || null;

        function resolveOpenAnchor(fallback) {
            return openAnchor || fallback || mountEl;
        }

        if (compact) {
            mountEl.innerHTML =
                '<section class="sc-loadout-detail sc-loadout-detail--compact">' +
                '<div class="sc-loadout-detail__slots" id="scDetailLoadoutSlots"></div>' +
                '</section>';
        } else {
            var slotCount = wiki().getWeaponAttachmentSlotCount(weaponItem);
            mountEl.innerHTML =
                '<section class="sc-loadout-detail sc-panel">' +
                '<div class="sc-loadout-detail__head">' +
                '<div><h2 class="sc-loadout-detail__title">配件装配</h2>' +
                '<p class="sc-loadout-detail__sub">' +
                escapeHtml(String(slotCount)) +
                ' 个配件槽 · 本地保存配置</p></div>' +
                '<button type="button" class="sc-loadout-detail__open" data-loadout-open>配件</button>' +
                '</div>' +
                '<div class="sc-loadout-detail__slots" id="scDetailLoadoutSlots"></div>' +
                '<div class="sc-loadout-detail__effects" id="scDetailLoadoutEffects"></div>' +
                '</section>';

            var openBtn = mountEl.querySelector('[data-loadout-open]');
            if (openBtn) {
                openBtn.addEventListener('click', function (e) {
                    openModal(weaponItem, e.currentTarget);
                });
            }
        }

        var slotsMount = mountEl.querySelector('#scDetailLoadoutSlots');
        if (slotsMount) {
            slotsMount.addEventListener('click', function (e) {
                var chip = e.target.closest('[data-slot-id]');
                if (!chip) return;
                openModal(
                    weaponItem,
                    resolveOpenAnchor(mountEl.querySelector('[data-loadout-open]')),
                    chip.getAttribute('data-slot-id')
                );
            });
        }

        refreshDetailPanel(weaponItem, mountEl);
    }

    async function refreshDetailPanel(weaponItem, mountEl) {
        if (!mountEl || mountEl.hidden) return;
        var options = mountEl._loadoutOptions || {};
        var compact = options.compact === true;
        var slotsEl = mountEl.querySelector('#scDetailLoadoutSlots');
        var effectsEl = mountEl.querySelector('#scDetailLoadoutEffects');
        if (!slotsEl) return;

        var defs = getSlotDefsForWeapon(weaponItem);
        var loadout = getLoadout(weaponItem);
        var slotsHtml = '';
        for (var i = 0; i < defs.length; i++) {
            var slot = defs[i];
            var attId = loadout[slot.id];
            var name = '空';
            if (attId) {
                var att = itemCache[attId] || (await fetchComponentById(attId));
                name = att ? resolveDisplayName(att) : '已装备';
            }
            slotsHtml +=
                '<button type="button" class="sc-loadout-detail-chip' +
                (attId ? ' is-filled' : '') +
                '" data-slot-id="' +
                escapeHtml(slot.id) +
                '"><span class="sc-loadout-detail-chip__label">' +
                escapeHtml(slot.label) +
                '</span><span class="sc-loadout-detail-chip__value">' +
                escapeHtml(name) +
                '</span></button>';
        }
        slotsEl.innerHTML = slotsHtml;

        if (!effectsEl || compact) return;

        if (!Object.keys(loadout).length) {
            effectsEl.innerHTML = '<p class="sc-loadout-detail__empty">未装配配件</p>';
            return;
        }

        var equipped = await resolveEquippedItems(weaponItem);
        var stats = computeAdjustedStatsFromEquipped(weaponItem, equipped);
        effectsEl.innerHTML = renderDetailLoadoutStatsHtml(stats);
    }

    function setOnChange(fn) {
        onChangeCallback = fn;
    }

    global.addEventListener('uss-weapon-loadout-change', function () {
        if (activeWeapon && overlayEl && !overlayEl.hidden) {
            renderTabs();
            renderPickerList();
            refreshEffectsPanel();
        }
    });

    global.ShipComponentWeaponLoadout = {
        isWeaponLoadoutEligible: isWeaponLoadoutEligible,
        openModal: openModal,
        renderListTagsHtml: renderListTagsHtml,
        hydrateListTags: hydrateListTags,
        hydrateWeaponLoadoutRow: hydrateWeaponLoadoutRow,
        updateRowLoadoutStats: updateRowLoadoutStats,
        computeAdjustedStatsSync: computeAdjustedStatsSync,
        renderDetailPanel: renderDetailPanel,
        refreshDetailPanel: refreshDetailPanel,
        getLoadout: getLoadout,
        setOnChange: setOnChange,
        resolveEquippedItems: resolveEquippedItems,
        buildCombinedLoadoutTags: buildCombinedLoadoutTags,
    };
})(typeof window !== 'undefined' ? window : global);
