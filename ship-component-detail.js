(function () {
    if (typeof document === 'undefined') return;

    var API_BASE = (
        (typeof window !== 'undefined' &&
            (window.USS_SC_COMPONENTS_API_BASE || window.USS_AUTH_API_BASE || window.USS_REGISTER_API_BASE)) ||
        ''
    ).replace(/\/$/, '');

    var els = {
        gate: document.getElementById('scDetailGate'),
        article: document.getElementById('scDetailArticle'),
        typeBadge: document.getElementById('scDetailTypeBadge'),
        titleZh: document.getElementById('scDetailTitleZh'),
        titleEn: document.getElementById('scDetailTitleEn'),
        highlights: document.getElementById('scDetailHighlights'),
        basics: document.getElementById('scDetailBasics'),
        specs: document.getElementById('scDetailSpecs'),
        locations: document.getElementById('scDetailLocations'),
        blueprint: document.getElementById('scDetailBlueprint'),
        footnote: document.getElementById('scDetailFootnote'),
        media: document.getElementById('scDetailMedia'),
        imageBtn: document.getElementById('scDetailImageBtn'),
        image: document.getElementById('scDetailImage'),
        loadout: document.getElementById('scDetailLoadout'),
    };

    var currentImageLightboxSrc = '';
    var currentDetailItem = null;

    function isPlaceholderItemName(s) {
        var v = String(s || '').trim();
        if (!v) return false;
        if (/^@[A-Za-z_][A-Za-z0-9_.]*$/i.test(v)) return true;
        if (/\[(?:PH|WIP|TMP|TBD|TODO)\]/i.test(v)) return true;
        if (/WCPR-Made|XIAN Nox Cooler Name/i.test(v)) return true;
        return false;
    }

    var DISPLAY_NAME_OVERRIDES_BY_SLUG = {
        'pink-quikflare': '粉色 快燃荧光棒',
        'red-quikflarepro': '红色 快燃荧光棒 Pro',
        'cyan-quikflarepro': '青色 快燃荧光棒 Pro',
        'green-quikflarepro': '绿色 快燃荧光棒 Pro',
        'orange-quikflarepro': '橙色 快燃荧光棒 Pro',
        'yellow-quikflarepro': '黄色 快燃荧光棒 Pro',
    };

    function resolveDetailDisplayName(item) {
        var zh = String((item && item.name_zh) || '').trim();
        var en = String((item && item.name_en) || '').trim();
        var slugOverride = DISPLAY_NAME_OVERRIDES_BY_SLUG[String((item && item.slug) || '').toLowerCase()];
        if (slugOverride) zh = slugOverride;
        if (isPlaceholderItemName(zh)) zh = '';
        var primary = zh || en || '—';
        var subtitle = en && en !== primary ? en : '';
        return { primary: primary, subtitle: subtitle };
    }

    var TYPE_LABELS = {
        cooling: '散热',
        power: '电源',
        shield: '护盾',
        quantum: '量子驱动器',
        jump: '跳跃驱动器',
        radar: '雷达',
        ship_weapon: '舰炮',
        ship_turret: '舰船炮台',
        ship_missile: '导弹',
        missile_rack: '导弹架',
        mining_laser: '矿头',
        ship_module: '模组',
        salvage_scraper: '刮削模块',
        fuel_nozzle: '燃料喷嘴',
        personal_weapon: '武器',
        personal_armor: '护甲',
        magazine: '弹匣',
        attachment_ironsight: '瞄具',
        attachment_barrel: '枪口',
        attachment_bottom: '下挂',
        attachment_utility: '实用配件',
        attachment_missile: '发射器导弹',
        weapon_pistol: '手枪',
        weapon_smg: '冲锋枪',
        weapon_rifle: '突击步枪',
        weapon_sniper: '狙击枪',
        weapon_shotgun: '霰弹枪',
        weapon_lmg: '机枪',
        weapon_launcher: '发射器',
        weapon_crossbow: '十字弩',
        weapon_throwable: '投掷物',
        weapon_melee: '近战',
        weapon_misc: '工具/杂项',
        armor_helmet: '头盔',
        armor_torso: '胸甲',
        armor_legs: '腿甲',
        armor_arms: '臂甲',
        armor_backpack: '背包',
        armor_undersuit: '基底服',
    };

    var TYPE_GROUP = {
        ship_weapon: 'weapon',
        ship_turret: 'weapon',
        ship_missile: 'weapon',
        missile_rack: 'weapon',
        mining_laser: 'mining',
        ship_module: 'mining',
        personal_weapon: 'fps_weapon',
        personal_armor: 'fps_armor',
        magazine: 'fps_magazine',
        attachment_ironsight: 'fps_magazine',
        attachment_barrel: 'fps_magazine',
        attachment_bottom: 'fps_magazine',
        attachment_utility: 'fps_magazine',
        attachment_missile: 'fps_magazine',
        salvage_scraper: 'salvage',
        fuel_nozzle: 'fuel_nozzle',
    };

    var FPS_WEAPON_TYPES = {
        weapon_pistol: 1,
        weapon_smg: 1,
        weapon_rifle: 1,
        weapon_sniper: 1,
        weapon_shotgun: 1,
        weapon_lmg: 1,
        weapon_launcher: 1,
        weapon_crossbow: 1,
        weapon_throwable: 1,
        weapon_melee: 1,
        weapon_misc: 1,
    };

    var FPS_ARMOR_TYPES = {
        armor_helmet: 1,
        armor_torso: 1,
        armor_legs: 1,
        armor_arms: 1,
        armor_backpack: 1,
        armor_undersuit: 1,
    };

    function apiUrl(path) {
        return API_BASE + path;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatPrice(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' aUEC';
    }

    function formatMass(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' kg';
    }

    function formatVolume(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        var scu = Number(n) / 1000000;
        if (scu >= 0.001) return scu.toFixed(3) + ' SCU';
        return Number(n).toLocaleString('zh-CN');
    }

    function formatBackpackCargoScu(item) {
        var c =
            item &&
            item.wiki_fields &&
            item.wiki_fields.dimension &&
            item.wiki_fields.dimension.cargo_dimension;
        if (!c || c.width == null || c.height == null || c.length == null) return '—';
        var scu = Number(c.width) * Number(c.height) * Number(c.length);
        if (!Number.isFinite(scu) || scu <= 0) return '—';
        return scu.toFixed(3) + ' SCU';
    }

    function formatSpeed(n) {
        if (n == null || !Number.isFinite(Number(n))) return '—';
        return Number(n).toLocaleString('zh-CN') + ' m/s';
    }

    function getItemIdFromSearch(search) {
        var params = new URLSearchParams(search || '');
        var id = params.get('id') || params.get('id_item') || params.get('uuid') || '';
        return String(id || '').trim();
    }

    function getItemIdFromHash() {
        var hash = String(window.location.hash || '').replace(/^#/, '').trim();
        if (!hash) return '';
        if (hash.indexOf('=') >= 0) return getItemIdFromSearch(hash);
        return hash;
    }

    function getStoredItemId() {
        try {
            var stored = sessionStorage.getItem('scComponentDetailId');
            return stored ? String(stored).trim() : '';
        } catch (e) {
            return '';
        }
    }

    function getItemId() {
        var id = getItemIdFromSearch(window.location.search);
        if (id) return id;
        id = getItemIdFromHash();
        if (id) return id;
        return getStoredItemId();
    }

    function syncDetailUrlId(id) {
        var cid = String(id || '').trim();
        if (!cid) return;
        try {
            var url = new URL(window.location.href);
            if (url.searchParams.get('id') === cid) return;
            url.searchParams.set('id', cid);
            history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (e) {
            /* ignore */
        }
    }

    function showGate(msg, isError) {
        if (!els.gate) return;
        els.gate.textContent = msg;
        els.gate.classList.remove('is-hidden');
        if (isError) els.gate.classList.add('sc-gate--error');
        else els.gate.classList.remove('sc-gate--error');
        if (els.article) els.article.classList.add('is-hidden');
    }

    function hideGate() {
        if (els.gate) els.gate.classList.add('is-hidden');
    }

    var LOCATION_LABEL_OMIT = {
        '舰船配件': 1,
        'ship parts': 1,
        shipparts: 1,
        'ship components': 1,
        '商店终端': 1,
        'shop terminal': 1,
        shopterminal: 1,
    };

    function shouldOmitLocSegment(val) {
        var raw = String(val || '').trim();
        if (!raw) return true;
        var key = raw.toLowerCase();
        if (LOCATION_LABEL_OMIT[key]) return true;
        return !!LOCATION_LABEL_OMIT[key.replace(/\s+/g, '')];
    }

    function getLocationHierarchyParts(loc) {
        if (!loc) return [];
        var parts = [];
        var seen = {};
        function push(val) {
            val = String(val || '').trim();
            if (!val || seen[val] || shouldOmitLocSegment(val)) return;
            seen[val] = true;
            parts.push(val);
        }
        if (loc.star_system_zh || loc.planet_zh || loc.city_zh || loc.moon_zh || loc.outpost_zh || loc.space_station_zh) {
            push(loc.star_system_zh);
            push(loc.planet_zh);
            push(loc.city_zh || loc.moon_zh || loc.outpost_zh || loc.space_station_zh);
            var term = loc.terminal_name_zh || loc.terminal_name || '';
            if (term) {
                term.split(/\s*[·•]\s*/).forEach(function (seg) {
                    push(seg);
                });
            }
        } else {
            var label = loc.location_label_zh || loc.terminal_name_zh || loc.terminal_name || '';
            label.split(/\s*[·•]\s*/).forEach(function (seg) {
                push(seg);
            });
        }
        return parts;
    }

    function renderLocationLevelsHtml(loc) {
        var parts = getLocationHierarchyParts(loc);
        if (!parts.length) return escapeHtml('—');
        return (
            '<span class="sc-loc-path">' +
            parts
                .map(function (part, i) {
                    return '<span class="sc-loc-level sc-loc-level--' + Math.min(i, 4) + '">' + escapeHtml(part) + '</span>';
                })
                .join('') +
            '</span>'
        );
    }

    function renderFieldCell(label, value, emphasis) {
        return (
            '<div class="sc-mission-field' +
            (emphasis ? ' sc-mission-field--emphasis' : '') +
            '"><span class="sc-mission-field-label">' +
            escapeHtml(label) +
            '</span><span class="sc-mission-field-value">' +
            escapeHtml(value) +
            '</span></div>'
        );
    }

    function renderFieldGridHtml(rows) {
        return (rows || [])
            .map(function (row) {
                return renderFieldCell(row.label, row.value, !!row.emphasis);
            })
            .join('');
    }

    function personalWeaponWiki(item) {
        return item && item.wiki_fields && item.wiki_fields.personal_weapon;
    }

    function suitArmorWiki(item) {
        return item && item.wiki_fields && item.wiki_fields.suit_armor;
    }

    function magazineWiki(item) {
        return item && item.wiki_fields && item.wiki_fields.magazine;
    }

    function vehicleWeaponWiki(item) {
        return item && item.wiki_fields && item.wiki_fields.vehicle_weapon;
    }

    function formatLocalizedWikiScalar(val) {
        if (val == null || val === '') return '—';
        var wiki = window.ShipComponentWiki;
        if (wiki && wiki.formatWikiScalar) {
            var localized = wiki.formatWikiScalar(val);
            if (localized != null && localized !== '') return localized;
        }
        return String(val);
    }

    function buildWeaponGroupHighlights(item) {
        var chips = [
            { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
            { label: '尺寸', value: item.size_label || item.size || '—' },
        ];
        var wf = item.wiki_fields || {};
        if (item.type === 'ship_weapon') {
            var weapon = vehicleWeaponWiki(item);
            chips.push({ label: '武器类型', value: formatLocalizedWikiScalar(weapon && weapon.type) });
        } else if (item.type === 'ship_turret') {
            chips.push({
                label: '炮台类型',
                value: formatLocalizedWikiScalar(wf.sub_type_label || wf.sub_type),
            });
        } else if (item.type === 'ship_missile') {
            var missile = wf.missile;
            chips.push({
                label: '信号类型',
                value: formatLocalizedWikiScalar(missile && missile.signal_type),
            });
        } else if (item.type === 'missile_rack') {
            var rack = wf.missile_rack || {};
            var count = rack.missile_count != null ? rack.missile_count : wf.max_missiles;
            chips.push({ label: '导弹数', value: formatWikiChipValue(count) });
        } else {
            chips.push({ label: '等级用途', value: item.class_zh || item.class_short_zh || '—' });
        }
        return chips;
    }

    function formatWikiChipValue(val, suffix) {
        if (val == null || val === '') return '—';
        var text = Number.isFinite(Number(val)) ? Number(val).toLocaleString('zh-CN') : String(val);
        return suffix ? text + suffix : text;
    }

    function renderHighlights(item) {
        if (!els.highlights) return;
        var group = inferGroupFromItemType(item.type) || TYPE_GROUP[item.type] || 'component';
        var chips;
        if (item.type === 'armor_backpack') {
            chips = [
                { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                { label: '质量', value: formatMass(item.mass) },
                { label: '储物容量', value: formatBackpackCargoScu(item) },
            ];
        } else if (group === 'fps_weapon') {
            var weapon = personalWeaponWiki(item);
            var wiki = window.ShipComponentWiki;
            if (item.type === 'weapon_melee' && wiki) {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    {
                        label: '挥砍伤害',
                        value: formatWikiChipValue(
                            wiki.formatMeleeCategoryDamage
                                ? wiki.formatMeleeCategoryDamage(item, 'BladeSlash')
                                : wiki.getMeleeCategoryDamage && wiki.getMeleeCategoryDamage(item, 'BladeSlash')
                        ),
                    },
                    {
                        label: '刺击伤害',
                        value: formatWikiChipValue(
                            wiki.formatMeleeCategoryDamage
                                ? wiki.formatMeleeCategoryDamage(item, 'BladeStab')
                                : wiki.getMeleeCategoryDamage && wiki.getMeleeCategoryDamage(item, 'BladeStab')
                        ),
                    },
                ];
            } else if (item.type === 'weapon_throwable' && wiki) {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '伤害类型', value: formatWikiChipValue(wiki.formatGrenadeDamageType && wiki.formatGrenadeDamageType(item)) },
                    { label: '伤害', value: formatWikiChipValue(wiki.formatGrenadeDamage && wiki.formatGrenadeDamage(item)) },
                    { label: '作用范围', value: formatWikiChipValue(wiki.formatGrenadeAreaOfEffect && wiki.formatGrenadeAreaOfEffect(item)) },
                ];
            } else {
            var hasCombatStats =
                weapon &&
                (weapon.damage_per_shot != null ||
                    weapon.rpm != null ||
                    weapon.rof != null ||
                    weapon.magazine_size != null ||
                    weapon.capacity != null);
            if (hasCombatStats) {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '单发伤害', value: formatWikiChipValue(weapon && weapon.damage_per_shot) },
                    {
                        label: '射速',
                        value: formatWikiChipValue(
                            weapon && (weapon.rpm != null ? weapon.rpm : weapon.rof),
                            ' 发/分'
                        ),
                    },
                    {
                        label: '弹匣容量',
                        value: formatWikiChipValue(
                            weapon &&
                                (weapon.magazine_size != null ? weapon.magazine_size : weapon.capacity)
                        ),
                    },
                ];
            } else {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '武器类型', value: (weapon && weapon.type) || TYPE_LABELS[item.type] || '—' },
                    { label: '质量', value: formatMass(item.mass) },
                ];
            }
            }
        } else if (group === 'fps_armor') {
            var armor = suitArmorWiki(item);
            var wikiScalar = window.ShipComponentWiki && window.ShipComponentWiki.formatWikiScalar;
            function armorHighlightValue(val, fallback) {
                if (val == null || val === '') return fallback || '—';
                if (wikiScalar) {
                    var localized = wikiScalar(val);
                    if (localized != null && localized !== '') return localized;
                }
                return String(val);
            }
            chips = [
                { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                { label: '护甲类型', value: armorHighlightValue(armor && armor.armor_type) },
                {
                    label: '部位',
                    value: armorHighlightValue(armor && armor.slot, TYPE_LABELS[item.type] || '—'),
                },
            ];
        } else if (group === 'fps_magazine') {
            var wf = item.wiki_fields || {};
            var mag = wf.magazine;
            var ammo = wf.ammunition;
            var sight = wf.iron_sight;
            var stab = wf.stabilizer;
            var laser = wf.laser_pointer;
            var mod = wf.weapon_modifier;
            if (item.type === 'magazine') {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    {
                        label: '最大弹药',
                        value: formatWikiChipValue(mag && (mag.max_ammo_count != null ? mag.max_ammo_count : mag.initial_ammo_count)),
                    },
                    { label: '弹速', value: formatWikiChipValue(ammo && ammo.speed, ' m/s') },
                ];
            } else if (item.type === 'attachment_ironsight') {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '放大倍率', value: formatWikiChipValue(sight && sight.zoom_scale, '×') },
                    { label: '最大射程', value: formatWikiChipValue(sight && sight.max_range, ' m') },
                ];
            } else if (item.type === 'attachment_barrel') {
                var barrelBase = mod && mod.base ? mod.base : null;
                var damageChip = '—';
                if (barrelBase && barrelBase.damage_change != null && barrelBase.damage_change !== 0) {
                    damageChip = Math.round(Number(barrelBase.damage_change) * 100) + '%';
                } else if (barrelBase && barrelBase.damage_multiplier != null) {
                    damageChip = formatWikiChipValue(barrelBase.damage_multiplier);
                }
                var soundMult =
                    barrelBase && barrelBase.sound_radius_multiplier != null
                        ? barrelBase.sound_radius_multiplier
                        : null;
                var fireMult =
                    barrelBase && barrelBase.fire_rate_multiplier != null ? barrelBase.fire_rate_multiplier : null;
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '伤害修正', value: damageChip },
                ];
                if (soundMult != null && soundMult !== 1) {
                    chips.push({ label: '声响系数', value: formatWikiChipValue(soundMult) });
                }
                if (fireMult != null && fireMult !== 1) {
                    chips.push({ label: '射速系数', value: formatWikiChipValue(fireMult) });
                }
                if (chips.length < 4 && stab && stab.spread != null) {
                    chips.push({ label: '散布', value: formatWikiChipValue(stab.spread) });
                }
                if (chips.length === 2) {
                    chips.push({ label: '声响系数', value: '—' });
                }
            } else if (item.type === 'attachment_bottom') {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '激光射程', value: formatWikiChipValue(laser && laser.range, ' m') },
                    { label: '质量', value: formatMass(item.mass) },
                ];
            } else if (item.type === 'attachment_utility' || item.type === 'attachment_missile') {
                var modFlat = wf.weapon_modifier || {};
                var dmgMult = modFlat.base ? modFlat.base.damage_multiplier : modFlat.damage_multiplier;
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '伤害修正', value: formatWikiChipValue(dmgMult) },
                    { label: '质量', value: formatMass(item.mass) },
                ];
            } else {
                chips = [
                    { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                    { label: '质量', value: formatMass(item.mass) },
                    { label: '尺寸', value: item.size_label || item.size || '—' },
                ];
            }
        } else if (group === 'weapon') {
            chips = buildWeaponGroupHighlights(item);
        } else {
            chips = [
                { label: '最低买入价', value: formatPrice(item.price_buy_min), accent: true },
                { label: '尺寸', value: item.size_label || item.size || '—' },
                { label: '等级用途', value: item.class_zh || item.class_short_zh || '—' },
            ];
            if (group !== 'mining') {
                chips.splice(1, 0, { label: '等级', value: item.grade || item.grade_letter || '—' });
            }
        }
        els.highlights.className = 'sc-detail-hero-stats sc-detail-hero-stats--' + chips.length;
        els.highlights.innerHTML = chips
            .map(function (chip) {
                return renderFieldCell(chip.label, chip.value, !!chip.accent);
            })
            .join('');

        var oldModifierHost = document.getElementById('scDetailModifierTags');
        if (oldModifierHost) oldModifierHost.remove();
    }

    function renderModifierTagsHtml(item) {
        var wiki = window.ShipComponentWiki;
        if (!wiki || typeof wiki.buildMiningModifierTags !== 'function') return '';
        if (item.type !== 'mining_laser' && item.type !== 'ship_module') return '';
        var tags = wiki.buildMiningModifierTags(item, item.type);
        if (!tags.length) return '';
        var inner =
            typeof wiki.renderMiningModifierTagsMarkup === 'function'
                ? wiki.renderMiningModifierTagsMarkup(tags, escapeHtml)
                : '';
        if (!inner) return '';
        return '<div class="sc-detail-modifier-tags">' + inner + '</div>';
    }

    function renderSpecSectionHtml(section, item) {
        if (
            section.title === '属性修正' &&
            (item.type === 'mining_laser' || item.type === 'ship_module')
        ) {
            var tagsHtml = renderModifierTagsHtml(item);
            if (tagsHtml) {
                return (
                    '<section class="sc-blueprint-mission-section sc-detail-spec-section sc-detail-spec-section--modifiers">' +
                    '<h2 class="sc-blueprint-mission-section-title">' +
                    escapeHtml(section.title) +
                    '</h2>' +
                    tagsHtml +
                    '</section>'
                );
            }
        }
        return (
            '<section class="sc-blueprint-mission-section sc-detail-spec-section">' +
            '<h2 class="sc-blueprint-mission-section-title">' +
            escapeHtml(section.title) +
            '</h2>' +
            '<div class="sc-detail-field-grid">' +
            renderSpecRowsHtml(section.rows) +
            '</div></section>'
        );
    }

    function formatManufacturerLabel(item) {
        var m = (item && (item.manufacturer_zh || item.manufacturer)) || '';
        if (/^<=\s*PLACEHOLDER\s*=>$/i.test(m) || /placeholder/i.test(m)) return '—';
        m = String(m || '').trim();
        var paren = m.match(/^(.+?)\s*[（(][^)）]*[A-Za-z][^)）]*[)）]\s*$/);
        if (paren) m = paren[1].trim();
        if (item && item.manufacturer === 'Virgil') return '维吉尔';
        return m || '—';
    }

    function renderBasics(item) {
        if (!els.basics) return;
        var rows = [
            { label: '类型', value: TYPE_LABELS[item.type] || item.type },
            { label: '制造商', value: formatManufacturerLabel(item) },
        ];
        if (item.type !== 'armor_backpack') {
            rows.push({ label: '质量', value: formatMass(item.mass) });
            rows.push({
                label: '体积',
                value: formatVolume(item.volume),
            });
        }
        if (item.type === 'weapon_throwable' && item.wiki_fields && window.ShipComponentWiki) {
            var wiki = window.ShipComponentWiki;
            var throwCols = wiki.getWikiTableColumns('weapon_throwable');
            (throwCols || []).forEach(function (col) {
                if (!col || col.key.indexOf('wiki_wt_') !== 0) return;
                var val = col.get(item);
                if (val) rows.push({ label: col.label, value: val });
            });
            if (item.size_label) {
                rows.push({ label: '尺寸', value: item.size_label });
            }
        } else if (item.type === 'weapon_melee' && window.ShipComponentWiki) {
            var meleeCols = window.ShipComponentWiki.getWikiTableColumns('weapon_melee');
            (meleeCols || []).forEach(function (col) {
                if (!col || col.key.indexOf('wiki_mw_') !== 0) return;
                var val = col.get(item);
                if (val) rows.push({ label: col.label, value: val });
            });
            if (item.size_label) {
                rows.push({ label: '尺寸', value: item.size_label });
            }
        }
        if (item.max_speed != null && !item.wiki_fields) {
            rows.push({ label: '最高速度', value: formatSpeed(item.max_speed) });
        }

        els.basics.innerHTML = renderFieldGridHtml(rows);
    }

    function renderSpecRowsHtml(rows) {
        return renderFieldGridHtml(rows);
    }

    function renderSpecs(item) {
        if (!els.specs) return;
        var wiki = window.ShipComponentWiki;
        if (!wiki) {
            els.specs.hidden = true;
            els.specs.innerHTML = '';
            return;
        }
        var sections = wiki.groupWikiFieldsForDetail(item);
        if (!sections.length) {
            els.specs.hidden = true;
            els.specs.innerHTML = '';
            return;
        }
        els.specs.hidden = false;
        els.specs.innerHTML = sections
            .map(function (section) {
                return renderSpecSectionHtml(section, item);
            })
            .join('');
    }

    function renderBlueprintMissions(item) {
        if (!els.blueprint) return;
        if (window.ShipComponentBlueprints && window.ShipComponentBlueprints.mount) {
            window.ShipComponentBlueprints.mount(els.blueprint, item);
            updateNavBlueprintCraftLink(item);
            return;
        }
        els.blueprint.innerHTML = '<p class="sc-acquire-empty">蓝图模块未加载</p>';
    }

    function bindNavBlueprintCraftLink(link) {
        if (!link || link.dataset.bpNavBound === '1') return;
        link.dataset.bpNavBound = '1';
        link.addEventListener('click', function () {
            if (window.ShipComponentBlueprints && window.ShipComponentBlueprints.stashDetailReturnForCraft) {
                window.ShipComponentBlueprints.stashDetailReturnForCraft(link);
            }
        });
    }

    async function updateNavBlueprintCraftLink(item) {
        var link = document.querySelector('[data-nav-blueprint-page]');
        if (!link || !item || !window.ShipComponentBlueprints) return;
        bindNavBlueprintCraftLink(link);
        try {
            var bp = await window.ShipComponentBlueprints.fetchCraftBlueprint(item);
            if (!bp || !bp.uuid) {
                link.href = 'blueprint-crafting.html';
                return;
            }
            var href = window.ShipComponentBlueprints.buildBlueprintCraftHref(bp);
            if (href) link.href = href;
        } catch (e) {
            link.href = 'blueprint-crafting.html';
        }
    }

    function renderLocations(item) {
        if (!els.locations) return;
        var locs = item.purchase_locations || [];
        if (!locs.length) {
            els.locations.innerHTML = '<p class="sc-detail-empty">暂无购买地点数据</p>';
            return;
        }
        var html =
            '<table class="sc-loc-table sc-detail-loc-table"><thead><tr><th class="sc-loc-th-location">地点</th><th class="sc-loc-th-price">买入价</th></tr></thead><tbody>';
        locs.forEach(function (loc) {
            html +=
                '<tr><td class="sc-loc-cell">' +
                renderLocationLevelsHtml(loc) +
                '</td><td class="sc-price sc-loc-price-cell">' +
                formatPrice(loc.price_buy) +
                '</td></tr>';
        });
        html += '</tbody></table>';
        els.locations.innerHTML = html;
    }

    function shortSourceLabel(meta) {
        if (!meta) return '—';
        if (meta.data_source === 'wiki') return 'WIKI百科';
        if (meta.data_source === 'uex') return 'UEX';
        if (meta.data_source_label_zh) return meta.data_source_label_zh;
        return '—';
    }

    function absoluteAssetUrl(url) {
        var raw = String(url || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.indexOf('//') === 0) return window.location.protocol + raw;
        var base = API_BASE || (window.location && window.location.origin) || '';
        if (!base) return raw;
        return base.replace(/\/$/, '') + (raw.charAt(0) === '/' ? raw : '/' + raw);
    }

    function componentImageProxyUrl(item) {
        if (!item) return '';
        var id =
            item.id_item != null && String(item.id_item).trim()
                ? String(item.id_item).trim()
                : item.uuid
                  ? String(item.uuid).trim()
                  : '';
        if (!id) return '';
        return absoluteAssetUrl('/api/sc/components/image/' + encodeURIComponent(id));
    }

    function componentImageDirectUrl(item) {
        if (!item || !item.image) return '';
        var raw = item.image.remote_url || item.image.original_url || item.image.url || '';
        return /^https?:\/\//i.test(String(raw).trim()) ? String(raw).trim() : '';
    }

    function hideDetailImage() {
        currentImageLightboxSrc = '';
        if (els.media) els.media.hidden = true;
        if (els.imageBtn) {
            els.imageBtn.hidden = true;
            els.imageBtn.style.width = '';
            els.imageBtn.style.height = '';
        }
        if (els.image) {
            els.image.removeAttribute('src');
            els.image.alt = '';
        }
    }

    function openDetailImageLightbox() {
        if (!currentImageLightboxSrc) return;
        var lb = window.UssCommunityImageLightbox;
        if (lb && typeof lb.open === 'function') {
            lb.open(currentImageLightboxSrc);
            return;
        }
        window.open(currentImageLightboxSrc, '_blank', 'noopener,noreferrer');
    }

    function wireDetailImageLightbox() {
        if (!els.imageBtn || els.imageBtn.dataset.wired === '1') return;
        els.imageBtn.dataset.wired = '1';
        els.imageBtn.addEventListener('click', openDetailImageLightbox);
    }

    function showDetailImage() {
        if (els.media) els.media.hidden = false;
        if (els.imageBtn) els.imageBtn.hidden = false;
        syncHeroImageFrameSize();
    }

    function isHeroImageStackedLayout() {
        return window.matchMedia('(max-width: 820px)').matches;
    }

    function syncHeroImageFrameSize() {
        if (!els.image || !els.imageBtn) return;
        if (els.imageBtn.hidden || isHeroImageStackedLayout()) {
            els.imageBtn.style.width = '';
            els.imageBtn.style.height = '';
            return;
        }
        var nw = els.image.naturalWidth;
        var nh = els.image.naturalHeight;
        if (!nw || !nh) {
            els.imageBtn.style.width = '';
            els.imageBtn.style.height = '';
            return;
        }
        var frameH = parseFloat(getComputedStyle(els.imageBtn).height);
        if (!Number.isFinite(frameH) || frameH <= 0) {
            frameH = els.imageBtn.getBoundingClientRect().height;
        }
        if (!frameH) return;

        var width = Math.round((frameH * nw) / nh);
        var maxW = parseFloat(getComputedStyle(els.imageBtn).maxWidth);
        if (Number.isFinite(maxW) && maxW > 0 && width > maxW) {
            width = maxW;
        }
        els.imageBtn.style.height = frameH + 'px';
        els.imageBtn.style.width = Math.max(1, width) + 'px';
    }

    var heroImageResizeTimer = null;
    function scheduleHeroImageFrameSync() {
        if (heroImageResizeTimer) window.clearTimeout(heroImageResizeTimer);
        heroImageResizeTimer = window.setTimeout(function () {
            heroImageResizeTimer = null;
            syncHeroImageFrameSize();
        }, 80);
    }

    function wireHeroImageFrameSync() {
        if (window.__scDetailHeroImageFrameSyncWired) return;
        window.__scDetailHeroImageFrameSyncWired = true;
        window.addEventListener('resize', scheduleHeroImageFrameSync);
    }

    function renderImage(item) {
        if (!els.media || !els.image) return;
        var proxySrc = componentImageProxyUrl(item);
        var directSrc = componentImageDirectUrl(item);
        var src = proxySrc || directSrc;
        if (!src) {
            hideDetailImage();
            return;
        }
        currentImageLightboxSrc = directSrc || proxySrc;
        wireDetailImageLightbox();
        wireHeroImageFrameSync();
        els.image.loading = 'eager';
        els.image.alt = item.name_zh || item.name_en || '配件图片';
        els.image.referrerPolicy = 'no-referrer';
        els.image.onerror = function () {
            if (directSrc && els.image.src !== directSrc) {
                els.image.src = directSrc;
                currentImageLightboxSrc = directSrc;
                return;
            }
            hideDetailImage();
        };
        els.image.onload = function () {
            showDetailImage();
            syncHeroImageFrameSize();
        };
        showDetailImage();
        els.image.src = src;
        if (els.image.complete && els.image.naturalWidth > 0) {
            showDetailImage();
            syncHeroImageFrameSize();
        }
    }

    function renderFootnote(meta) {
        if (!els.footnote || !meta) return;
        var parts = [shortSourceLabel(meta)];
        if (meta.game_version) parts.push('游戏版本 ' + meta.game_version);
        var apiVer =
            meta.data_source === 'wiki'
                ? meta.wiki_api_version || '3.0'
                : meta.uex_api_version || '2.0';
        if (apiVer) parts.push('API v' + apiVer);
        els.footnote.textContent = parts.join(' · ');
    }

    function renderItem(data, requestedId) {
        var item = data.item;
        var meta = data.meta;
        if (!item) {
            showGate('配件不存在或已下架', true);
            return;
        }
        hideGate();
        if (els.article) els.article.classList.remove('is-hidden');

        var names = resolveDetailDisplayName(item);
        document.title = names.primary + ' · USSXC';

        if (els.typeBadge) {
            els.typeBadge.className = 'sc-type-badge sc-type-badge--' + (item.type || 'unknown');
            els.typeBadge.textContent = TYPE_LABELS[item.type] || item.type || '—';
        }
        if (els.titleZh) els.titleZh.textContent = names.primary;
        if (els.titleEn) els.titleEn.textContent = names.subtitle;

        renderHighlights(item);
        renderBasics(item);
        renderSpecs(item);
        renderLocations(item);
        renderBlueprintMissions(item);
        renderFootnote(meta);
        renderImage(item);
        if (window.ShipComponentWeaponLoadout && els.loadout) {
            window.ShipComponentWeaponLoadout.renderDetailPanel(item, els.loadout);
        } else if (els.loadout) {
            els.loadout.hidden = true;
            els.loadout.innerHTML = '';
        }
        currentDetailItem = item;
        syncDetailUrlId(item.id_item || item.uuid || requestedId);
        updateBackLink(item);
        updateShipNavHighlight(item);
    }

    function updateShipNavHighlight(item) {
        var panel = document.getElementById('navMegaShip');
        if (!panel || !item) return;
        var group = inferGroupFromItemType(item.type) || TYPE_GROUP[item.type] || 'component';
        panel.querySelectorAll('[data-nav-ship-group]').forEach(function (node) {
            node.classList.remove('is-current');
        });
        var link = panel.querySelector('[data-nav-ship-group="' + group + '"]');
        if (link) link.classList.add('is-current');
    }

    var LIST_RETURN_URL_KEY = 'scComponentListReturnUrl';
    var LIST_RETURN_GROUP_KEY = 'scComponentListReturnGroup';
    var LIST_RETURN_TYPE_KEY = 'scComponentListReturnType';
    var LIST_RETURN_PATHNAME_KEY = 'scComponentListReturnPathname';
    var LIST_RETURN_SCROLL_KEY = 'scComponentListReturnScrollY';
    var LIST_RETURN_PAGE_KEY = 'scComponentListReturnPage';
    var LIST_RETURN_EXPANDED_KEY = 'scComponentListReturnExpandedId';
    var LIST_RETURN_FOCUS_ITEM_KEY = 'scComponentListReturnFocusItemId';
    var LIST_RETURN_ARMOR_VARIANTS_KEY = 'scComponentListReturnArmorVariants';
    var BP_CRAFT_RETURN_URL_KEY = 'scBlueprintCraftReturnUrl';
    var BP_CRAFT_RESTORE_FLAG_KEY = 'scBlueprintCraftRestorePending';

    function isBlueprintCraftingListPath(pathname) {
        return /\/blueprint-crafting(?:\.html)?$/i.test(String(pathname || ''));
    }

    function buildBlueprintCraftingReturnHref(searchParams) {
        var params = searchParams || new URLSearchParams(window.location.search || '');
        if (params.get('from') !== 'blueprint-crafting') return '';
        var url = new URL('blueprint-crafting.html', window.location.href);
        var sector = (params.get('from_sector') || params.get('sector') || '').trim();
        var group = (params.get('from_group') || params.get('group') || '').trim();
        var type = (params.get('from_type') || params.get('type') || '').trim();
        var q = (params.get('from_q') || params.get('q') || '').trim();
        var blueprint = (params.get('from_blueprint') || params.get('blueprint') || '').trim();
        if (sector) url.searchParams.set('sector', sector);
        if (group) url.searchParams.set('group', group);
        if (type) url.searchParams.set('type', type);
        if (q) url.searchParams.set('q', q);
        if (blueprint) url.searchParams.set('blueprint', blueprint);
        return url.pathname + url.search;
    }

    function readStoredBlueprintCraftReturnHref() {
        try {
            var stored = sessionStorage.getItem(BP_CRAFT_RETURN_URL_KEY) || '';
            if (!stored) return '';
            var saved = new URL(stored, window.location.href);
            if (!isBlueprintCraftingListPath(saved.pathname)) return '';
            return saved.pathname + saved.search;
        } catch (e) {
            return '';
        }
    }

    function isReturningFromBlueprintCrafting(searchParams) {
        var params = searchParams || new URLSearchParams(window.location.search || '');
        if (params.get('from') === 'blueprint-crafting') return true;
        return !!readStoredBlueprintCraftReturnHref();
    }
    var LIST_RESTORE_FLAG_KEY = 'scComponentListRestorePending';

    var DEFAULT_TYPE_BY_GROUP = {
        component: 'cooling',
        weapon: 'ship_weapon',
        mining: 'mining_laser',
        salvage: 'salvage_scraper',
        fuel_nozzle: 'fuel_nozzle',
        equipment: 'weapon_pistol',
        fps_weapon: 'weapon_pistol',
        fps_armor: 'armor_helmet',
        fps_magazine: 'magazine',
    };

    function isShipComponentsListPath(pathname) {
        return /\/ship-components(?:\.html)?$/i.test(String(pathname || ''));
    }

    function isEquipmentListPath(pathname) {
        return /\/personal-equipment(?:\.html)?$/i.test(String(pathname || ''));
    }

    function isCatalogListPath(pathname) {
        return isShipComponentsListPath(pathname) || isEquipmentListPath(pathname);
    }

    function listPagePathname() {
        try {
            var stored = sessionStorage.getItem(LIST_RETURN_PATHNAME_KEY) || '';
            if (isCatalogListPath(stored)) return stored;
        } catch (e) {
            /* ignore */
        }
        try {
            var group = new URLSearchParams(window.location.search || '').get('group') || '';
            if (group === 'fps_weapon' || group === 'fps_armor' || group === 'fps_magazine' || group === 'equipment') {
                return '/personal-equipment';
            }
        } catch (e) {
            /* ignore */
        }
        return '/ship-components';
    }

    function inferGroupFromItemType(typeKey) {
        var key = String(typeKey || '').trim();
        if (!key) return '';
        if (TYPE_GROUP[key]) return TYPE_GROUP[key];
        if (FPS_WEAPON_TYPES[key] || key.indexOf('weapon_') === 0) return 'fps_weapon';
        if (FPS_ARMOR_TYPES[key] || key.indexOf('armor_') === 0) return 'fps_armor';
        if (key === 'magazine' || key.indexOf('attachment_') === 0) return 'fps_magazine';
        if (
            key === 'cooling' ||
            key === 'power' ||
            key === 'shield' ||
            key === 'quantum' ||
            key === 'jump' ||
            key === 'radar'
        ) {
            return 'component';
        }
        if (key === 'fuel_nozzle') return 'fuel_nozzle';
        return '';
    }

    function defaultListPathForGroup(group) {
        if (group === 'fps_weapon' || group === 'fps_armor' || group === 'fps_magazine') {
            return '/personal-equipment';
        }
        return '/ship-components';
    }

    function readStoredListReturnParts() {
        var group = '';
        var type = '';
        var q = '';
        var href = '';
        try {
            group = sessionStorage.getItem(LIST_RETURN_GROUP_KEY) || '';
            type = sessionStorage.getItem(LIST_RETURN_TYPE_KEY) || '';
            href = sessionStorage.getItem(LIST_RETURN_URL_KEY) || '';
            if (href) {
                var su = new URL(href, window.location.href);
                if (isCatalogListPath(su.pathname)) {
                    group = group || su.searchParams.get('group') || '';
                    type = type || su.searchParams.get('type') || '';
                    q = su.searchParams.get('q') || '';
                }
            }
        } catch (e) {
            /* ignore */
        }
        return { group: group, type: type, q: q, href: href };
    }

    function buildListPageHref(group, type, q) {
        var g = String(group || '').trim();
        if (!g) return listPagePathname();
        var t = String(type || '').trim();
        var query = String(q || '').trim();
        var isFpsGroup = g === 'fps_weapon' || g === 'fps_armor' || g === 'fps_magazine' || g === 'equipment';
        var basePath = isFpsGroup ? defaultListPathForGroup(g) : listPagePathname();
        if (!isFpsGroup && !isShipComponentsListPath(basePath)) basePath = '/ship-components';
        try {
            var url = new URL(basePath, window.location.href);
            url.searchParams.set('group', g === 'equipment' ? inferGroupFromItemType(t) || 'fps_weapon' : g);
            if (t) url.searchParams.set('type', t);
            if (query) url.searchParams.set('q', query);
            else url.searchParams.delete('q');
            return url.pathname + url.search;
        } catch (e) {
            var href = basePath + '?group=' + encodeURIComponent(g);
            if (t) href += '&type=' + encodeURIComponent(t);
            if (query) href += '&q=' + encodeURIComponent(query);
            return href;
        }
    }

    function hasPendingListRestore() {
        try {
            return sessionStorage.getItem(LIST_RESTORE_FLAG_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function resolveListReturnHref(item) {
        var params = new URLSearchParams(window.location.search || '');
        var bpCraftHref = buildBlueprintCraftingReturnHref(params);
        if (bpCraftHref) return bpCraftHref;
        var storedBpCraftHref = readStoredBlueprintCraftReturnHref();
        if (storedBpCraftHref) return storedBpCraftHref;

        var fromUrl = {
            group: (params.get('group') || params.get('from_group') || '').trim(),
            type: (params.get('type') || params.get('from_type') || '').trim(),
            q: (params.get('q') || params.get('from_q') || '').trim(),
        };
        var stored = readStoredListReturnParts();

        if (hasPendingListRestore() && stored.href) {
            try {
                var saved = new URL(stored.href, window.location.href);
                if (isCatalogListPath(saved.pathname)) {
                    return saved.pathname + saved.search;
                }
            } catch (e) {
                /* ignore */
            }
        }

        // 优先级：详情页 URL 参数 → 进入详情前 session 记录 → 配件类型推断
        var group = fromUrl.group || stored.group || '';
        var type = fromUrl.type || stored.type || '';
        var q = fromUrl.q || stored.q || '';

        if (!group && item && item.type) group = inferGroupFromItemType(item.type);
        if (!type && item && item.type) type = item.type;

        if (group === 'equipment') group = inferGroupFromItemType(type) || 'fps_weapon';
        if (!group) group = 'component';
        if (!type) type = DEFAULT_TYPE_BY_GROUP[group] || (item && item.type) || 'cooling';

        if (!fromUrl.group && !fromUrl.type && stored.href) {
            try {
                var su = new URL(stored.href, window.location.href);
                if (isCatalogListPath(su.pathname)) {
                    su.searchParams.set('group', group);
                    su.searchParams.set('type', type);
                    if (q) su.searchParams.set('q', q);
                    else su.searchParams.delete('q');
                    return su.pathname + su.search;
                }
            } catch (e) {
                /* ignore */
            }
        }

        return buildListPageHref(group, type, q);
    }

    function bindBackLinkRestore() {
        var link = document.getElementById('scDetailBackLink');
        if (!link || link.dataset.restoreBound === '1') return;
        link.dataset.restoreBound = '1';
        link.addEventListener('click', function () {
            try {
                if (isReturningFromBlueprintCrafting()) {
                    sessionStorage.setItem(BP_CRAFT_RESTORE_FLAG_KEY, '1');
                }
                sessionStorage.setItem(LIST_RESTORE_FLAG_KEY, '1');
                if (!sessionStorage.getItem(LIST_RETURN_SCROLL_KEY)) {
                    sessionStorage.setItem(LIST_RETURN_SCROLL_KEY, '0');
                }
            } catch (e) {
                /* ignore */
            }
        });
    }

    function updateBackLink(item) {
        var link = document.getElementById('scDetailBackLink');
        if (!link) return;
        link.href = resolveListReturnHref(item);
        link.textContent = isReturningFromBlueprintCrafting()
            ? '← 返回制造蓝图'
            : '← 返回列表';
        bindBackLinkRestore();
    }

    function initBackLinkEarly() {
        var link = document.getElementById('scDetailBackLink');
        if (!link) return;
        link.href = resolveListReturnHref(null);
        link.textContent = isReturningFromBlueprintCrafting()
            ? '← 返回制造蓝图'
            : '← 返回列表';
        bindBackLinkRestore();
    }

    async function load() {
        var id = getItemId();
        if (!id) {
            showGate('缺少配件 ID', true);
            return;
        }
        try {
            var res = await fetch(apiUrl('/api/sc/components/' + encodeURIComponent(id)));
            var data = await res.json();
            if (!res.ok || !data.ok) throw new Error((data && data.message) || '加载失败');
            renderItem(data, id);
            rememberLoadedId(data.item);
        } catch (e) {
            showGate((e && e.message) || '加载失败', true);
        }
    }

    function rememberLoadedId(item) {
        if (!item) return;
        var cid = item.id_item != null && item.id_item !== '' ? String(item.id_item).trim() : '';
        if (!cid && item.uuid) cid = String(item.uuid).trim();
        if (!cid) return;
        try {
            sessionStorage.setItem('scComponentDetailId', cid);
        } catch (e) {
            /* ignore */
        }
    }

    window.addEventListener('uss-weapon-loadout-change', function () {
        if (!currentDetailItem || !els.loadout || !window.ShipComponentWeaponLoadout) return;
        window.ShipComponentWeaponLoadout.refreshDetailPanel(currentDetailItem, els.loadout);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initBackLinkEarly();
            load();
        });
    } else {
        initBackLinkEarly();
        load();
    }
})();
