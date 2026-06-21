/**
 * Wiki 配件字段：列表列定义与详情页展平（ship-components / ship-component-detail 共用）
 */
(function (global) {
    'use strict';

    function lookupWikiScalarText(s) {
        var locMap = global.WIKI_SCALAR_LOC;
        if (locMap && locMap[s]) return locMap[s];
        if (locMap && locMap[s.toLowerCase()]) return locMap[s.toLowerCase()];
        if (WIKI_SCALAR_ZH[s]) return WIKI_SCALAR_ZH[s];
        if (WIKI_SCALAR_ZH[s.toLowerCase()]) return WIKI_SCALAR_ZH[s.toLowerCase()];
        return null;
    }

    function formatFixedDecimal2(v) {
        var f = global.ScDisplayFormat;
        if (f && f.formatFixedDecimal2) return f.formatFixedDecimal2(v);
        if (v == null || !Number.isFinite(Number(v))) return null;
        return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatWikiScalar(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'boolean') return v ? '是' : '否';
        if (typeof v === 'number' && Number.isFinite(v)) {
            return formatFixedDecimal2(v);
        }
        var s = String(v).trim();
        if (!s) return null;
        if (/^<= PLACEHOLDER =>$/i.test(s)) return null;
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
            var d = new Date(s);
            if (!isNaN(d.getTime())) {
                return d.toLocaleString('zh-CN', { hour12: false });
            }
        }
        var hit = lookupWikiScalarText(s);
        if (hit) return hit;
        return s;
    }

    /** 详情/列表字段值后缀单位（空字符串表示不加单位） */
    var WIKI_FIELD_UNITS = {
        rpm: ' RPM',
        range: ' m',
        effective_range: ' m',
        capacity: ' 发',
        damage_per_shot: '',
        lock_time: ' s',
        lock_range_max: ' m',
        lock_range_min: ' m',
        lock_angle: '°',
        speed: ' m/s',
        explosion_radius_min: ' m',
        explosion_radius_max: ' m',
        optimal_range: ' m',
        maximum_range: ' m',
        collection_point_radius: ' m',
        per_shot: '',
        cooling_delay: ' s',
        cooling_per_second: '/s',
        overheat_max_shots: ' 发',
        overheat_max_time: ' s',
        overheat_cooldown: ' s',
        sustained_60s: '',
        burst: '',
        alpha_total: '',
        damage_total: '',
        min: '°',
        max: '°',
        first_attack: '°',
        per_attack: '°',
        decay: '°',
        module_slots: ' 个',
        extraction_throughput: ' SCU/s',
        volume: ' SCU',
        missile_count: ' 枚',
        max_missiles: ' 枚',
        regen_rate: '/s',
        regen_time: ' s',
        regen_delay: ' s',
        cooldown: ' s',
        cooldown_time: ' s',
        duration: ' s',
        detection_lifetime: ' s',
        fuel_rate: ' SCU/s',
        max_lifetime: ' s',
        boost_speed: ' m/s',
        intercept_speed: ' m/s',
        terminal_speed: ' m/s',
        boost_phase_duration: ' s',
        terminal_phase_engagement_time: ' s',
        terminal_phase_engagement_angle: '°',
        range_max: ' m',
        range_min: ' m',
        angle: '°',
        arm_time: ' s',
        ignite_time: ' s',
        collision_delay_time: ' s',
        safety_distance: ' m',
        proximity: ' m',
        tracking_signal_min: ' dB',
        signal_amplifier: '',
        increase_rate: '/s',
        distance_min_assignment: ' m',
        distance_max_assignment: ' m',
        outside_range_buffer_distance: ' m',
        fuel_tank_size: '',
        radius_min: ' m',
        radius_max: ' m',
        time_to_full_speed: ' s',
        gforce_resistance: '',
    };
    var WIKI_BOOLEAN_NUM_KEYS = {
        enable_lifetime: true,
        allow_dumb_firing: true,
        requires_launcher: true,
        enable_cross_section_occlusion: true,
        is_cluster: true,
        can_be_used_for_take_down: true,
        can_block: true,
        can_dodge: true,
        can_be_used_in_prone: true,
    };

    function isUnlimitedRangeKey(key) {
        return key === 'lock_range_max' || key === 'lock_range_min' || key === 'range_max' || key === 'range_min';
    }

    var ATTACHMENT_SLOT_EXCLUDE_SUB_TYPES = { Magazine: 1 };
    var ATTACHMENT_SLOT_EXCLUDE_POSITIONS = { ITEM_GRAB: 1, MAGAZINE_WELL: 1 };

    function countWeaponAttachmentSlotsFromPorts(ports) {
        if (!Array.isArray(ports) || !ports.length) return null;
        var count = 0;
        for (var i = 0; i < ports.length; i++) {
            var p = ports[i];
            if (!p || typeof p !== 'object') continue;
            var sub = String(p.sub_type || '').trim();
            if (!sub || ATTACHMENT_SLOT_EXCLUDE_SUB_TYPES[sub]) continue;
            var pos = String(p.position || '').toUpperCase();
            if (ATTACHMENT_SLOT_EXCLUDE_POSITIONS[pos]) continue;
            var name = String(p.name || '').toLowerCase();
            if (name === 'item_grab' || name === 'magazine_attach') continue;
            count += 1;
        }
        return count;
    }

    function getWeaponAttachmentSlotCount(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return null;
        if (typeof wf.attachment_slot_count === 'number' && Number.isFinite(wf.attachment_slot_count)) {
            return wf.attachment_slot_count;
        }
        var fromPorts = countWeaponAttachmentSlotsFromPorts(wf.ports);
        return fromPorts != null ? fromPorts : null;
    }

    function formatWikiFieldDisplay(key, val, nestedKey) {
        if (val == null || val === '') return null;
        if (typeof val === 'number' && val < 0 && isUnlimitedRangeKey(key)) {
            return '无限';
        }
        if (WIKI_BOOLEAN_NUM_KEYS[key] && (val === 0 || val === 1)) {
            return val === 1 ? '是' : '否';
        }
        if (/_change$/i.test(String(key)) && typeof val === 'number' && Number.isFinite(val)) {
            if (val === 0) return null;
            return formatFixedDecimal2(Math.abs(val) * 100) + '%';
        }
        if (key === 'gforce_resistance' && typeof val === 'number' && Number.isFinite(val)) {
            return formatGforceSignedDisplay(val);
        }
        var display = formatWikiScalar(val);
        if (display == null) return null;
        return appendWikiFieldUnit(key, display, nestedKey);
    }

    function appendWikiFieldUnit(key, display, nestedKey) {
        if (display == null || display === '') return display;
        if (display === '无限') return display;
        if (nestedKey === 'damage' && key === 'max') return display;
        if (!Object.prototype.hasOwnProperty.call(WIKI_FIELD_UNITS, key)) return display;
        var unit = WIKI_FIELD_UNITS[key];
        if (!unit) return display;
        return display + unit;
    }

    var WIKI_NESTED_FIELD_LABELS = {
        'damage.max': '弹匣总伤害',
    };

    /** Wiki 同义键：渲染时跳过后者，避免重复展示 */
    var WIKI_DUPLICATE_FIELD_SKIP = {
        maximum: 'max',
        minimum: 'min',
        max_shield_health: 'max_health',
        max_shield_regen: 'regen_rate',
        effective_range: 'range',
        rof: 'rpm',
        capacity: 'magazine_size',
    };

    /** 汉化库未收录时的兜底（优先使用 global.WIKI_SCALAR_LOC） */
    var WIKI_SCALAR_ZH = {
        'µSCU': 'µSCU',
        '[AUTO]': '全自动',
        '[SEMI]': '半自动',
        '[CHARGE]': '充能',
        'Plasma Canon': '电浆加农炮',
        Light: '轻甲',
        Medium: '中甲',
        Heavy: '重甲',
    };

    var ARMOR_CLASS_ZH = {
        Light: '轻甲',
        Medium: '中甲',
        Heavy: '重甲',
        light: '轻甲',
        medium: '中甲',
        heavy: '重甲',
    };

    var ARMOR_SLOT_ZH = {
        Helmet: '头盔',
        Torso: '躯干',
        Legs: '腿部',
        Arms: '手臂',
        Backpack: '背包',
        Undersuit: '底衣',
    };

    var ARMOR_TYPE_SLOT_FALLBACK = {
        armor_helmet: '头盔',
        armor_torso: '躯干',
        armor_legs: '腿部',
        armor_arms: '手臂',
        armor_backpack: '背包',
        armor_undersuit: '底衣',
    };

    var WIKI_FIELD_LABELS = {
        shield: '护盾',
        cooler: '散热器',
        power_plant: '发电机',
        quantum_drive: '量子驱动器',
        radar: '雷达',
        jump_drive: '跳跃驱动器',
        max_health: '护盾容量',
        max_shield_health: '护盾容量',
        regen_rate: '回复速率',
        max_shield_regen: '最大回复',
        regen_time: '回复时间',
        decay_ratio: '衰减比',
        reserve_pool: '储备池',
        regen_delay: '回复延迟',
        electrical_charge_damage_resistance: '电荷伤害抗性',
        absorption: '吸收',
        resistance: '抗性',
        coolant_segment_generation: '冷却段生成',
        power_segment_generation: '电力段生成',
        power_output: '输出功率',
        cooldown: '冷却时间',
        sensitivity: '灵敏度',
        ground_vehicle_sensitivity: '地面载具灵敏度',
        piercing: '穿透',
        aim_assist: '瞄准辅助',
        drive_speed_formatted: '驱动速度',
        engage_speed_formatted: '启动速度',
        jump_range_formatted: '跃迁范围',
        disconnect_range_formatted: '断开距离',
        quantum_fuel_requirement: '量子燃料需求',
        fuel_rate: '燃料消耗',
        thermal_energy_draw: '热能消耗',
        standard_jump: '标准跃迁',
        alignment_rate: '对齐速率',
        alignment_decay_rate: '对齐衰减速率',
        tuning_rate: '调校速率',
        tuning_decay_rate: '调校衰减速率',
        fuel_usage_efficiency_multiplier: '燃料效率倍率',
        infrared: '红外',
        cross_section: '横截面',
        electromagnetic: '电磁',
        resource: '资源',
        db: '分贝',
        downed: '击倒延迟',
        damage: '受伤延迟',
        min: '最小',
        max: '最大',
        pre_ramp_up: '爬升前',
        ramp_up: '爬升',
        in_flight: '飞行中',
        ramp_down: '下降',
        post_ramp_down: '下降后',
        updated_at: 'Wiki 更新时间',
        cooldown_time: '冷却时间',
        stage_one_accel_rate: '一阶段加速度',
        stage_one_accel_rate_formatted: '一阶段加速度',
        stage_two_accel_rate: '二阶段加速度',
        stage_two_accel_rate_formatted: '二阶段加速度',
        engage_speed: '启动速度',
        engage_speed_formatted: '启动速度',
        drive_speed: '驱动速度',
        drive_speed_formatted: '驱动速度',
        interdiction_effect_time: '拦截生效时间',
        calibration_rate: '校准速率',
        min_calibration_requirement: '最低校准需求',
        max_calibration_requirement: '最高校准需求',
        calibration_process_angle_limit: '校准过程角度限制',
        calibration_warning_angle_limit: '校准警告角度',
        calibration_delay_in_seconds: '校准延迟',
        spool_up_time: '卷绕时间',
        fuel_consumption_scu_per_gm: '燃料消耗 SCU/Gm',
        fuel_efficiency: '燃料效率',
        travel_time_10gm: '10 Gm 航行时间',
        cooling_rate: '冷却速率',
        suppression_ir_factor: 'IR 抑制系数',
        suppression_heat_factor: '热量抑制系数',
        detection_lifetime: '探测持续时间',
        altitude_ceiling: '高度上限',
        enable_cross_section_occlusion: '横截面遮挡',
        disconnect_range: '断开距离',
        disconnect_range_formatted: '断开距离',
        jump_range: '跃迁范围',
        jump_range_formatted: '跃迁范围',
        type: '类型',
        class: '分类',
        regeneration: '弹药回复',
        sustained_60s: '60秒持续伤害',
        burst: '爆发伤害',
        alpha_total: '阿尔法总伤',
        alpha: '阿尔法伤害',
        dps: '秒伤',
        physical: '物理',
        energy: '能量',
        distortion: '畸变',
        thermal: '热能',
        biochemical: '生化',
        stun: '击晕',
        dps_total: '总 DPS',
        alpha_total: '单发总伤害',
        initial_capacity: '初始弹药',
        max_penetration_thickness: '最大穿透厚度',
        damage_falloff_level_1: '衰减等级 1',
        damage_falloff_level_2: '衰减等级 2',
        damage_falloff_level_3: '衰减等级 3',
        first_attack: '首发散布',
        per_attack: '逐发散布',
        min_change: '最小散布变化',
        max_change: '最大散布变化',
        first_attack_change: '首发散布变化',
        per_attack_change: '逐发散布变化',
        decay_change: '散布衰减变化',
        multiplier: '系数',
        multiplier_change: '系数变化',
        decay_multiplier: '衰减系数',
        ads_spread: '瞄准散布',
        decay: '散布衰减',
        minimum: '最小',
        maximum: '最大',
        damage_per_shot: '单发伤害',
        rpm: '射速',
        range: '射程',
        capacity: '弹匣容量',
        lock_time: '锁定时间',
        lock_range_max: '最大锁定距离',
        lock_range_min: '最小锁定距离',
        lock_angle: '锁定角度',
        speed: '速度',
        explosion_radius_min: '最小爆炸半径',
        explosion_radius_max: '最大爆炸半径',
        missile_count: '导弹数量',
        missile_size: '导弹尺寸',
        max_missiles: '最大导弹数',
        min_size: '最小尺寸',
        max_size: '最大尺寸',
        rotation_style: '旋转方式',
        mounts: '炮位数量',
        time_to_full_speed: '全速时间',
        acceleration_decay: '加速衰减',
        slaved_only: '仅从属模式',
        pitch_axis: '俯仰轴',
        yaw_axis: '偏航轴',
        signal_type: '信号类型',
        fuel_tank_size: '燃料箱容量',
        cluster_size: '集群数量',
        tracking_signal_min: '最小跟踪信号',
        enable_lifetime: '启用寿命限制',
        boost_speed: '加速速度',
        intercept_speed: '拦截速度',
        terminal_speed: '末端速度',
        boost_phase_duration: '加速阶段时长',
        terminal_phase_engagement_time: '末端交战时长',
        terminal_phase_engagement_angle: '末端交战角度',
        signal_resilience_min: '信号抗性下限',
        signal_resilience_max: '信号抗性上限',
        range_max: '最大距离',
        range_min: '最小距离',
        angle: '锁定锥角',
        signal_amplifier: '信号放大',
        increase_rate: '锁定提升速率',
        allow_dumb_firing: '允许盲射',
        arm_time: '引信时间',
        ignite_time: '点火延迟',
        collision_delay_time: '碰撞延迟',
        requires_launcher: '需要发射架',
        safety_distance: '安全距离',
        proximity: '近炸距离',
        is_cluster: '集群弹头',
        shatter_damage: '碎裂伤害',
        overcharge_rate: '过载充能率',
        inert_materials: '惰性物质',
        all_charge_rates: '全部充能速率',
        distance_min_assignment: '最小分配距离',
        distance_max_assignment: '最大分配距离',
        outside_range_buffer_distance: '范围外缓冲距离',
        sub_type: '子类型',
        damages: '伤害分项',
        damage_map: '伤害分布',
        flight: '飞行',
        target_lock: '目标锁定',
        explosion: '爆炸参数',
        delays: '时序延迟',
        radius_min: '最小爆炸半径',
        radius_max: '最大爆炸半径',
        detonation: '爆炸',
        piercing: '穿透',
        aim_assist: '瞄准辅助',
        modifier_map: '属性修正',
        spline_jump: '样条跃迁',
        ground_vehicle_sensitivity: '地面载具灵敏度',
        sensitivity: '灵敏度',
        mining_laser: '采矿激光',
        laser_power: '激光功率',
        module_slots: '模组槽位',
        throttle_lerp_speed: '节流响应',
        throttle_minimum: '最小节流',
        power_transfer: '功率传输',
        optimal_range: '最佳距离',
        maximum_range: '最大距离',
        extraction_throughput: '开采吞吐',
        collection_point_radius: '采集点半径',
        extraction_laser_power: '开采激光功率',
        mining_laser_power: '采矿激光功率',
        width: '宽度',
        height: '高度',
        length: '长度',
        volume: '储物体积',
        cargo_dimension: '货物空间',
        true_dimension: '实际尺寸',
        dimensions: '外形尺寸',
        ui_dimension: '界面尺寸',
        volume_converted: '体积',
        volume_converted_unit: '体积单位',
        health: '生命值',
        lifetime: '寿命',
        max_lifetime: '最大寿命',
        repairable: '可维修',
        salvageable: '可打捞',
        item_type: '物品类型',
        charges: '使用次数',
        duration: '持续时间',
        power_modifier: '功率修正',
        modifier_map: '属性修正',
        laser_instability: '不稳定性',
        cluster_factor: '集群系数',
        optimal_charge_window_size: '充能绿区',
        optimal_charge_rate: '最佳充能率',
        per_shot: '单发热量',
        cooling_delay: '冷却延迟',
        cooling_per_second: '每秒冷却',
        overheat_max_shots: '过热最大发数',
        overheat_max_time: '过热最大时长',
        overheat_cooldown: '过热冷却',
        damage_total: '总伤害',
        tracking_signal_min: '最小跟踪信号',
        collection_type: '采集类型',
        hit_type: '命中类型',
        fire_mode: '开火模式',
        ammo_type: '弹药类型',
        ammo_speed: '弹速',
        ammo_mass: '弹药质量',
        ammo_lifetime: '弹药寿命',
        personal_weapon: '个人武器',
        melee_weapon: '近战武器',
        can_be_used_for_take_down: '可用于制服',
        can_block: '可格挡',
        can_dodge: '可闪避',
        can_be_used_in_prone: '卧姿可用',
        stance_transition_melee_delay: '近战姿态切换延迟',
        attack_modes: '攻击模式',
        attack_impulse: '攻击冲量',
        force_knockdown: '强制击倒',
        stun_recovery_modifier: '眩晕恢复修正',
        block_stun_reduction_modifier: '格挡眩晕减免',
        block_stun_stamina_modifier: '格挡耐力修正',
        ignore_body_part_impulse_scale: '忽略部位冲量缩放',
        category: '攻击类型',
        suit_armor: '护甲',
        magazine: '弹匣',
        ammunition: '弹药',
        clothing: '服装',
        slot: '部位',
        armor_type: '护甲类型',
        garment_type: '服装类型',
        magazine_size: '弹匣容量',
        magazine_type: '弹匣类型',
        attachment_slot_count: '配件槽',
        effective_range: '有效射程',
        damages: '伤害分项',
        damage_resistance_map: '伤害减免',
        physical_change: '物理减伤',
        energy_change: '能量减伤',
        thermal_change: '热能减伤',
        biochemical_change: '生化减伤',
        distortion_change: '畸变减伤',
        stun_change: '击晕减伤',
        radiation_resistance: '辐射防护',
        maximum_radiation_capacity: '辐射容量',
        radiation_dissipation_rate: '辐射清除率',
        temp_resistance_min: '最低适用温度',
        temp_resistance_max: '最高适用温度',
        gforce_resistance: '抗 G 值',
        initial_ammo_count: '初始弹药',
        max_ammo_count: '最大弹药',
        max_restock_count: '最大补给次数',
        zoom_scale: '放大倍率',
        zoom_time_scale: '变焦时间系数',
        zoom_time_change: '变焦时间变化',
        second_zoom_scale: '第二放大倍率',
        hide_weapon_in_ads: '瞄准时隐藏武器',
        fstop_multiplier: '光圈系数',
        range_increment: '射程增量',
        auto_zeroing_time: '自动归零距离',
        default_range: '默认射程',
        max_range: '最大射程',
        spread: '散布',
        spread_change: '散布变化',
        aim_recoil: '后坐力',
        aim_recoil_change: '后坐力变化',
        visual_recoil: '视觉后坐力',
        visual_recoil_change: '视觉后坐力变化',
        projectile_speed: '弹速系数',
        projectile_speed_change: '弹速变化',
        muzzle_flash_multiplier: '枪口焰系数',
        muzzle_flash_change: '枪口焰变化',
        damage_multiplier: '伤害系数',
        damage_change: '伤害变化',
        fire_rate_multiplier: '射速系数',
        fire_rate_change: '射速变化',
        projectile_speed_multiplier: '弹速系数',
        projectile_speed_change: '弹速变化',
        sound_radius_multiplier: '声响系数',
        sound_radius_change: '声响变化',
        heat_generation_multiplier: '热量系数',
        heat_generation_change: '热量变化',
        ammo_cost_multiplier: '弹药消耗系数',
        ammo_cost_change: '弹药消耗变化',
        charge_time_multiplier: '充能时间系数',
        charge_time_change: '充能时间变化',
        activate_on_attach: '挂载激活',
        ignore_wear: '忽略磨损',
        impact_damage: '冲击伤害',
        impact_damage_map: '冲击伤害分布',
        rof: '射速',
        class: '伤害类型',
        pellets_per_shot: '每发弹丸数',
        mode: '模式',
        damage_per_second: '每秒伤害',
        heat_per_shot: '单发热量',
        wear_per_shot: '单发磨损',
        shot_count: '连发数',
        cooldown_time: '冷却时间',
        ammo_per_shot: '每发耗弹',
    };

    var PERSONAL_WEAPON_DAMAGE_LABELS = {
        energy: '能量',
        impact: '冲击',
        thermal: '热能',
        physical: '物理',
        distortion: '畸变',
        biochemical: '生化',
        stun: '击晕',
    };

    var PERSONAL_WEAPON_MODE_LABELS = {
        auto: '全自动',
        fullauto: '全自动',
        full_auto: '全自动',
        'full auto': '全自动',
        semi: '半自动',
        semi_auto: '半自动',
        'semi auto': '半自动',
        burst: '点射',
        single: '单发',
        shotgun: '霰弹',
        charge: '充能',
        heal: '治疗',
        repair: '维修',
        salvage: '打捞',
        mining: '采矿',
        detach: '分离',
        tractorbeam: '牵引',
        tractor: '牵引',
    };

    function normalizePersonalWeaponModeToken(raw) {
        return String(raw || '')
            .trim()
            .replace(/^\[|\]$/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase();
    }

    function formatPersonalWeaponModeLabel(mode) {
        var tokens = [mode && mode.localised, mode && mode.mode, mode && mode.type];
        for (var i = 0; i < tokens.length; i++) {
            var norm = normalizePersonalWeaponModeToken(tokens[i]);
            if (!norm) continue;
            if (PERSONAL_WEAPON_MODE_LABELS[norm]) return PERSONAL_WEAPON_MODE_LABELS[norm];
        }
        var fallback = String((mode && mode.mode) || (mode && mode.type) || '').trim();
        if (fallback) return fallback.replace(/_/g, ' ');
        return '未知模式';
    }

    function wikiFieldLabel(key, itemType, nestedKey) {
        if (nestedKey) {
            var nestedLabel = WIKI_NESTED_FIELD_LABELS[nestedKey + '.' + key];
            if (nestedLabel) return nestedLabel;
        }
        if (key === 'type') {
            if (itemType === 'ship_weapon') return '武器类型';
            if (itemType === 'ship_turret') return '炮台类型';
            if (itemType === 'mining_laser') return '激光类型';
            if (itemType === 'ship_module') return '模组类型';
            if (itemType === 'personal_weapon') return '武器类型';
            if (itemType === 'personal_armor') return '护甲类型';
            if (itemType === 'magazine') return '弹匣类型';
            if (itemType && itemType.indexOf('weapon_') === 0) return '武器类型';
            if (itemType && itemType.indexOf('armor_') === 0) return '护甲类型';
        }
        return WIKI_FIELD_LABELS[key] || String(key || '').replace(/_/g, ' ');
    }

    var SKIP_DETAIL_KEYS = {
        api_link: true,
        web_url: true,
        updated_at: true,
        modes: true,
        uuid: true,
        damage_map: true,
        impact_damage: true,
        impact_damage_map: true,
        classification: true,
        classification_label: true,
        class_name: true,
        manufacturer_description: true,
        position: true,
        sub_type: true,
        sub_type_label: true,
        dimension: true,
        melee_combat_config: true,
    };

    var MELEE_ATTACK_CATEGORY_LABEL = {
        BladeSlash: '挥砍',
        BladeStab: '刺击',
    };

    var TYPE_WIKI_BLOCK_KEY = {
        cooling: 'cooler',
        power: 'power_plant',
        shield: 'shield',
        quantum: 'quantum_drive',
        jump: 'jump_drive',
        radar: 'radar',
        ship_weapon: 'vehicle_weapon',
        ship_turret: 'turret',
        ship_missile: 'missile',
        missile_rack: 'missile_rack',
        mining_laser: 'mining_laser',
        ship_module: 'mining_modifier',
        salvage_scraper: 'weapon_modifier',
        fuel_nozzle: 'resource_network',
        weapon_pistol: 'personal_weapon',
        armor_helmet: 'suit_armor',
        armor_backpack: 'dimension',
        magazine: 'magazine',
        attachment_ironsight: 'iron_sight',
        attachment_barrel: 'weapon_modifier',
        attachment_bottom: 'laser_pointer',
        attachment_utility: 'weapon_modifier',
        attachment_missile: 'weapon_modifier',
        weapon_melee: 'melee_weapon',
        weapon_throwable: 'grenade',
    };

    function resolveWikiBlockKey(typeKey) {
        var key = String(typeKey || '');
        if (TYPE_WIKI_BLOCK_KEY[key]) return TYPE_WIKI_BLOCK_KEY[key];
        if (key.indexOf('weapon_') === 0) return 'personal_weapon';
        if (key === 'armor_backpack') return 'dimension';
        if (key === 'personal_armor') return 'suit_armor';
        if (key.indexOf('armor_') === 0) return 'suit_armor';
        return null;
    }

    function resolveDetailSectionKey(typeKey) {
        var key = String(typeKey || '');
        if (TYPE_DETAIL_SECTIONS[key]) return key;
        if (key === 'weapon_melee') return 'weapon_melee';
        if (key === 'weapon_throwable') return 'weapon_throwable';
        if (key.indexOf('weapon_') === 0) return 'weapon_pistol';
        if (key === 'armor_backpack') return 'armor_backpack';
        if (key.indexOf('armor_') === 0) return 'armor_helmet';
        if (key.indexOf('attachment_') === 0) return key;
        if (key === 'personal_weapon') return 'weapon_pistol';
        if (key === 'personal_armor') return 'armor_helmet';
        return key;
    }

    function resolveEquipmentTypeKey(typeKey) {
        var key = String(typeKey || '');
        if (WIKI_TABLE_COLUMNS[key]) return key;
        if (TYPE_WIKI_BLOCK_KEY[key]) return key;
        if (key === 'weapon_melee') return 'weapon_melee';
        if (key === 'weapon_throwable') return 'weapon_throwable';
        if (key.indexOf('weapon_') === 0) return 'weapon_pistol';
        if (key.indexOf('armor_') === 0) return key === 'armor_backpack' ? 'armor_backpack' : 'armor_helmet';
        if (key === 'personal_weapon') return 'weapon_pistol';
        if (key === 'personal_armor') return 'armor_helmet';
        return key;
    }

    function getSalvageScraperBlock(item) {
        var wm = item && item.wiki_fields && item.wiki_fields.weapon_modifier;
        return wm && wm.salvage ? wm.salvage : null;
    }

    function getFuelNozzleRates(item) {
        var net = item && item.wiki_fields && item.wiki_fields.resource_network;
        var out = { hydrogen: null, quantum: null };
        if (!net || !Array.isArray(net.states)) return out;
        for (var si = 0; si < net.states.length; si++) {
            var deltas = (net.states[si] && net.states[si].deltas) || [];
            for (var di = 0; di < deltas.length; di++) {
                var d = deltas[di];
                if (!d || d.type !== 'Consumption' || d.rate == null) continue;
                if (d.resource === 'Fuel') out.hydrogen = d.rate;
                if (d.resource === 'QuantumFuel') out.quantum = d.rate;
            }
        }
        return out;
    }

    function getItemDurabilityHealth(item) {
        var d = item && item.wiki_fields && item.wiki_fields.durability;
        if (d && d.health != null) return d.health;
        return null;
    }

    var TYPE_DETAIL_SECTIONS = {
        shield: [
            {
                title: '护盾性能',
                fields: [
                    'max_health',
                    'regen_rate',
                    'regen_time',
                    'regen_delay',
                    'decay_ratio',
                    'reserve_pool',
                    'electrical_charge_damage_resistance',
                    'absorption',
                    'resistance',
                ],
            },
        ],
        cooling: [
            {
                title: '散热性能',
                fields: ['coolant_segment_generation', 'cooling_rate', 'suppression_ir_factor', 'suppression_heat_factor'],
            },
        ],
        power: [
            {
                title: '电力段',
                fields: ['power_segment_generation'],
            },
        ],
        jump: [
            {
                title: '跳跃调校',
                fields: [
                    'alignment_rate',
                    'alignment_decay_rate',
                    'tuning_rate',
                    'tuning_decay_rate',
                    'fuel_usage_efficiency_multiplier',
                ],
            },
        ],
        radar: [
            {
                title: '探测性能',
                fields: [
                    'detection_lifetime',
                    'altitude_ceiling',
                    'enable_cross_section_occlusion',
                    'cooldown',
                    'piercing',
                    'aim_assist',
                ],
            },
            { title: '灵敏度', nested: 'sensitivity', fields: ['infrared', 'electromagnetic', 'cross_section', 'resource', 'db'] },
            { title: '地面载具灵敏度', nested: 'ground_vehicle_sensitivity', fields: ['infrared', 'electromagnetic', 'cross_section', 'resource', 'db'] },
            { title: '穿透', nested: 'piercing', fields: ['infrared', 'electromagnetic', 'cross_section', 'resource', 'db'] },
            {
                title: '瞄准辅助',
                nested: 'aim_assist',
                fields: ['distance_min_assignment', 'distance_max_assignment', 'outside_range_buffer_distance'],
            },
        ],
        quantum: [
            {
                title: '跃迁与燃料',
                fields: [
                    'jump_range_formatted',
                    'disconnect_range_formatted',
                    'quantum_fuel_requirement',
                    'fuel_rate',
                    'fuel_consumption_scu_per_gm',
                    'fuel_efficiency',
                    'travel_time_10gm',
                ],
            },
            { title: '标准跃迁', nested: 'standard_jump', fields: [
                'drive_speed_formatted',
                'engage_speed_formatted',
                'cooldown_time',
                'stage_one_accel_rate_formatted',
                'stage_two_accel_rate_formatted',
                'interdiction_effect_time',
                'calibration_rate',
                'min_calibration_requirement',
                'max_calibration_requirement',
                'calibration_process_angle_limit',
                'calibration_warning_angle_limit',
                'calibration_delay_in_seconds',
                'spool_up_time',
            ] },
            { title: '样条跃迁', nested: 'spline_jump', fields: [
                'drive_speed_formatted',
                'engage_speed_formatted',
                'cooldown_time',
                'stage_one_accel_rate_formatted',
                'stage_two_accel_rate_formatted',
                'interdiction_effect_time',
                'calibration_rate',
                'min_calibration_requirement',
                'max_calibration_requirement',
                'calibration_process_angle_limit',
                'calibration_warning_angle_limit',
                'calibration_delay_in_seconds',
                'spool_up_time',
            ] },
            {
                title: '热能消耗',
                nested: 'thermal_energy_draw',
                fields: ['pre_ramp_up', 'ramp_up', 'in_flight', 'ramp_down', 'post_ramp_down'],
            },
        ],
        ship_weapon: [
            {
                title: '武器性能',
                fields: ['type', 'damage_per_shot', 'rpm', 'range', 'capacity'],
            },
            {
                title: '伤害',
                nested: 'damage',
                fields: ['burst', 'sustained_60s', 'max'],
            },
            {
                title: '散布',
                nested: 'spread',
                fields: ['min', 'first_attack', 'per_attack', 'decay', 'max'],
            },
            {
                title: '热量',
                nested: 'heat',
                fields: [
                    'per_shot',
                    'cooling_delay',
                    'cooling_per_second',
                    'overheat_max_shots',
                    'overheat_max_time',
                    'overheat_cooldown',
                ],
            },
        ],
        ship_turret: [
            {
                title: '炮台参数',
                fields: ['rotation_style', 'mounts', 'min_size', 'max_size'],
            },
            {
                title: '俯仰轴',
                nested: 'pitch_axis',
                fields: ['speed', 'time_to_full_speed', 'acceleration_decay', 'slaved_only'],
            },
            {
                title: '偏航轴',
                nested: 'yaw_axis',
                fields: ['speed', 'time_to_full_speed', 'acceleration_decay', 'slaved_only'],
            },
        ],
        ship_missile: [
            {
                title: '导弹性能',
                fields: [
                    'signal_type',
                    'damage_total',
                    'speed',
                    'lock_time',
                    'lock_range_max',
                    'lock_range_min',
                    'lock_angle',
                    'explosion_radius_min',
                    'explosion_radius_max',
                    'tracking_signal_min',
                    'fuel_tank_size',
                ],
            },
            {
                title: '飞行',
                nested: 'flight',
                fields: [
                    'enable_lifetime',
                    'max_lifetime',
                    'range',
                    'boost_speed',
                    'intercept_speed',
                    'terminal_speed',
                    'boost_phase_duration',
                    'terminal_phase_engagement_time',
                    'terminal_phase_engagement_angle',
                ],
            },
            {
                title: '目标锁定',
                nested: 'target_lock',
                fields: [
                    'signal_resilience_min',
                    'signal_resilience_max',
                    'range_max',
                    'range_min',
                    'angle',
                    'signal_amplifier',
                    'increase_rate',
                    'allow_dumb_firing',
                ],
            },
            {
                title: '爆炸参数',
                nested: 'explosion',
                fields: ['is_cluster', 'requires_launcher', 'safety_distance', 'proximity'],
            },
            {
                title: '时序延迟',
                nested: 'delays',
                fields: ['arm_time', 'ignite_time', 'collision_delay_time'],
            },
            {
                title: '伤害分项',
                nested: 'damage_map',
                fields: ['physical', 'energy', 'distortion', 'thermal', 'biochemical', 'stun'],
            },
        ],
        missile_rack: [
            {
                title: '挂架参数',
                fields: ['missile_count', 'missile_size'],
            },
        ],
        mining_laser: [
            {
                title: '采矿性能',
                fields: [
                    'type',
                    'optimal_range',
                    'maximum_range',
                    'extraction_throughput',
                    'module_slots',
                    'power_transfer',
                    'collection_point_radius',
                    'extraction_laser_power',
                    'mining_laser_power',
                ],
            },
            { title: '激光功率', nested: 'laser_power', fields: ['min', 'max'] },
            {
                title: '属性修正',
                nested: 'modifier_map',
                fields: [
                    'laser_instability',
                    'optimal_charge_window_size',
                    'resistance',
                    'optimal_charge_rate',
                    'inert_materials',
                    'all_charge_rates',
                    'overcharge_rate',
                    'shatter_damage',
                ],
            },
        ],
        ship_module: [
            {
                title: '模组参数',
                fields: ['type', 'item_type', 'charges', 'duration', 'power_modifier'],
            },
            { title: '属性修正', nested: 'modifier_map', fields: ['resistance', 'laser_instability', 'overcharge_rate', 'inert_materials', 'optimal_charge_rate', 'optimal_charge_window_size', 'all_charge_rates'] },
        ],
        weapon_pistol: [
            {
                title: '武器参数',
                fields: ['type', 'class', 'magazine_type', 'magazine_size', 'pellets_per_shot', 'range', 'effective_range', 'capacity'],
            },
            {
                title: '伤害分项',
                nested: 'damages',
                fields: [],
            },
            {
                title: '伤害统计',
                nested: 'damage',
                fields: ['alpha_total', 'dps_total'],
            },
            {
                title: '散布',
                nested: 'spread',
                fields: ['min', 'first_attack', 'per_attack', 'decay', 'max'],
            },
            {
                title: '弹药',
                nested: 'ammunition',
                fields: ['speed', 'range', 'lifetime', 'capacity', 'initial_capacity', 'max_penetration_thickness'],
            },
            {
                title: '开火模式',
                nested: 'modes',
                fields: [],
            },
        ],
        weapon_throwable: [
            {
                title: '投掷物参数',
                custom: 'grenade_params',
            },
        ],
        weapon_melee: [
            {
                title: '近战参数',
                fields: [
                    'can_be_used_for_take_down',
                    'can_block',
                    'can_dodge',
                    'can_be_used_in_prone',
                    'stance_transition_melee_delay',
                ],
            },
            {
                title: '攻击模式',
                custom: 'melee_attacks',
            },
        ],
        armor_helmet: [
            {
                title: '防护',
                nested: 'damage_resistance_map',
                fields: ['physical_change', 'energy_change', 'thermal_change', 'biochemical_change', 'distortion_change', 'stun_change'],
            },
            {
                title: '环境耐受',
                fields: ['temp_resistance_min', 'temp_resistance_max', 'gforce_resistance'],
            },
            {
                title: '辐射防护',
                nested: 'radiation_resistance',
                fields: ['maximum_radiation_capacity', 'radiation_dissipation_rate'],
            },
        ],
        armor_backpack: [
            {
                title: '储物参数',
                fields: ['true_dimension'],
            },
        ],
        magazine: [
            {
                title: '弹匣参数',
                fields: ['initial_ammo_count', 'max_restock_count', 'max_ammo_count'],
            },
            {
                title: '弹药',
                nested: 'ammunition',
                fields: ['capacity', 'range', 'lifetime', 'speed'],
            },
            {
                title: '弹药伤害',
                custom: 'magazine_damage',
            },
        ],
        attachment_ironsight: [
            {
                title: '瞄具参数',
                custom: 'ironsight',
            },
        ],
        attachment_barrel: [
            {
                title: '枪口参数',
                custom: 'barrel',
            },
        ],
        attachment_bottom: [
            {
                title: '下挂参数',
                custom: 'bottom',
            },
        ],
        attachment_utility: [
            {
                title: '配件修正',
                custom: 'utility',
            },
        ],
        attachment_missile: [
            {
                title: '发射器导弹',
                custom: 'missile_attachment',
            },
        ],
    };

    function dedupeWikiDetailRows(rows) {
        var seenLabels = Object.create(null);
        return (rows || []).filter(function (row) {
            if (!row || !row.label) return false;
            if (seenLabels[row.label]) return false;
            seenLabels[row.label] = true;
            return true;
        });
    }

    function shouldSkipRawWikiKey(key, obj) {
        if (SKIP_DETAIL_KEYS[key]) return true;
        if (key.endsWith('_formatted')) return false;
        var formatted = obj[key + '_formatted'];
        if (formatted != null && formatted !== '') return true;
        if (key === 'jump_range' && obj.jump_range_formatted) return true;
        if (key === 'disconnect_range' && obj.disconnect_range_formatted) return true;
        if (key === 'drive_speed' && obj.drive_speed_formatted) return true;
        if (key === 'engage_speed' && obj.engage_speed_formatted) return true;
        if (key === 'stage_one_accel_rate' && obj.stage_one_accel_rate_formatted) return true;
        if (key === 'stage_two_accel_rate' && obj.stage_two_accel_rate_formatted) return true;
        return false;
    }

    function formatWikiDimensionBox(val) {
        if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
        var w = val.width;
        var h = val.height;
        var l = val.length;
        if (w == null && h == null && l == null) return null;
        return (
            (w != null ? formatWikiScalar(w) : '—') +
            ' × ' +
            (h != null ? formatWikiScalar(h) : '—') +
            ' × ' +
            (l != null ? formatWikiScalar(l) : '—') +
            ' m'
        );
    }

    function buildRowForWikiField(block, key, itemType, nestedKey) {
        if (!block) return null;
        var val = block[key];
        if (val == null || val === '') return null;
        if (Array.isArray(val)) return null;
        if (typeof val === 'object') {
            if (
                key === 'cargo_dimension' ||
                key === 'true_dimension' ||
                key === 'dimensions' ||
                key === 'ui_dimension'
            ) {
                var box = formatWikiDimensionBox(val);
                if (box) return { label: wikiFieldLabel(key, itemType, nestedKey), value: box };
            }
            if (val.formatted != null && val.formatted !== '') {
                return { label: wikiFieldLabel(key, itemType, nestedKey), value: formatWikiScalar(val.formatted) };
            }
            if (val.seconds != null && val.formatted) {
                return { label: wikiFieldLabel(key, itemType, nestedKey), value: formatWikiScalar(val.formatted) };
            }
            return null;
        }
        var display = formatWikiFieldDisplay(key, val, nestedKey);
        if (display == null) return null;
        return { label: wikiFieldLabel(key, itemType, nestedKey), value: display };
    }

    function shouldSkipDuplicateWikiKey(key, obj) {
        var primary = WIKI_DUPLICATE_FIELD_SKIP[key];
        if (!primary) return false;
        if (obj[primary] == null || obj[primary] === '') return false;
        return true;
    }

    function rowsFromPersonalWeaponDamages(damages, damagePerShot) {
        if (!Array.isArray(damages) || !damages.length) return [];
        var rows = damages
            .map(function (entry, index) {
                if (!entry || typeof entry !== 'object') return null;
                var rawName = String(entry.name || entry.type || '').trim();
                var label =
                    PERSONAL_WEAPON_DAMAGE_LABELS[rawName.toLowerCase()] ||
                    wikiFieldLabel(rawName) ||
                    '伤害 ' + (index + 1);
                var val = entry.damage != null && entry.damage !== '' ? formatWikiScalar(entry.damage) : null;
                if (val == null) return null;
                return { label: label, value: val };
            })
            .filter(Boolean);
        if (
            rows.length === 1 &&
            damagePerShot != null &&
            Number(damages[0].damage) === Number(damagePerShot)
        ) {
            return [];
        }
        return rows;
    }

    function rowsFromPersonalWeaponModes(modes, weaponBlock) {
        if (!Array.isArray(modes) || !modes.length) return [];
        var baseRpm =
            weaponBlock && (weaponBlock.rpm != null ? weaponBlock.rpm : weaponBlock.rof);
        var rows = [];
        modes.forEach(function (mode, index) {
            if (!mode || typeof mode !== 'object') return;
            var modeLabel = formatPersonalWeaponModeLabel(mode);
            var multi = modes.length > 1;
            var prefix = multi ? modeLabel + ' · ' : '';

            if (modeLabel) {
                rows.push({
                    label: multi ? '模式 ' + (index + 1) : '开火方式',
                    value: modeLabel,
                });
            }

            var rpm = mode.rpm != null ? mode.rpm : mode.rof;
            if (rpm != null && rpm !== '' && Number(rpm) !== Number(baseRpm)) {
                rows.push({ label: prefix + '射速', value: formatWikiScalar(rpm) + ' 发/分' });
            }
            if (mode.damage_per_second != null && mode.damage_per_second !== '') {
                rows.push({
                    label: prefix + '每秒伤害',
                    value: formatWikiScalar(mode.damage_per_second),
                });
            }
            if (mode.shot_count != null && mode.shot_count !== '') {
                rows.push({
                    label: prefix + '连发数',
                    value: formatWikiScalar(mode.shot_count) + ' 发/点射',
                });
            }
            if (mode.heat_per_shot != null && Number(mode.heat_per_shot) > 0) {
                rows.push({
                    label: prefix + '单发热量',
                    value: formatWikiScalar(mode.heat_per_shot),
                });
            }
            if (mode.cooldown_time != null && Number(mode.cooldown_time) > 0) {
                rows.push({
                    label: prefix + '点射冷却',
                    value: formatWikiScalar(mode.cooldown_time) + ' 秒',
                });
            }
        });
        return dedupeWikiDetailRows(rows);
    }

    function getArmorGforceResistance(item) {
        var wf = (item && item.wiki_fields) || {};
        var a = wf.suit_armor || {};
        if (a.gforce_resistance != null) return Number(a.gforce_resistance);
        if (wf.clothing && wf.clothing.gforce_resistance != null) return Number(wf.clothing.gforce_resistance);
        if (wf.gforce_resistance != null) return Number(wf.gforce_resistance);
        return null;
    }

    function formatGforceSignedDisplay(val) {
        if (val == null || !Number.isFinite(val) || val === 0) return null;
        return formatFixedDecimal2(val * 100) + '%';
    }

    var ARMOR_SLOT_SUBTYPES = {
        Helmet: true,
        Torso: true,
        Legs: true,
        Arms: true,
        Backpack: true,
        Undersuit: true,
    };

    function getArmorSubcategoryRaw(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return '';
        var raw = String(wf.sub_type_label || wf.sub_type || '').trim();
        if (!raw || ARMOR_SLOT_SUBTYPES[raw] || /^FPS\.Armor\./i.test(raw)) return '';
        return raw;
    }

    function formatArmorClassLabel(item) {
        var raw = getArmorSubcategoryRaw(item);
        if (!raw) {
            var cls = String((item && (item.class_short_zh || item.class_zh)) || '').trim();
            if (/[轻中重]甲/.test(cls)) return cls;
            return null;
        }
        if (ARMOR_CLASS_ZH[raw]) return ARMOR_CLASS_ZH[raw];
        var hit = lookupWikiScalarText(raw);
        if (hit) return hit;
        return formatWikiScalar(raw);
    }

    function formatArmorSlotLabel(item) {
        var armor = item && item.wiki_fields && item.wiki_fields.suit_armor;
        var slot = String((armor && (armor.slot || armor.garment_type || armor.armor_type)) || '').trim();
        if (slot) {
            if (ARMOR_SLOT_ZH[slot]) return ARMOR_SLOT_ZH[slot];
            var localized = formatWikiScalar(slot);
            if (localized) return localized;
        }
        var typeKey = item && item.type;
        if (typeKey && ARMOR_TYPE_SLOT_FALLBACK[typeKey]) {
            return ARMOR_TYPE_SLOT_FALLBACK[typeKey];
        }
        return null;
    }

    function formatArmorSubcategory(item) {
        return formatArmorClassLabel(item);
    }

    function getWeaponModifierBase(item) {
        var wm = item && item.wiki_fields && item.wiki_fields.weapon_modifier;
        return wm && wm.base ? wm.base : null;
    }

    function getBarrelStabilizer(item) {
        return item && item.wiki_fields && item.wiki_fields.stabilizer;
    }

    function getBarrelWeaponModifier(item) {
        return item && item.wiki_fields && item.wiki_fields.weapon_modifier;
    }

    function getBarrelSpreadMultiplier(item) {
        var stab = getBarrelStabilizer(item);
        if (stab && stab.spread != null && stab.spread !== 1) return Number(stab.spread);
        var spread = getBarrelWeaponModifier(item) && getBarrelWeaponModifier(item).spread;
        if (!spread || typeof spread !== 'object') return null;
        var keys = ['max_multiplier', 'min_multiplier', 'first_attack_multiplier', 'per_attack_multiplier'];
        for (var i = 0; i < keys.length; i++) {
            var val = spread[keys[i]];
            if (val != null && val !== 1) return Number(val);
        }
        return null;
    }

    function getBarrelRecoilMultiplier(item) {
        var stab = getBarrelStabilizer(item);
        if (stab && stab.aim_recoil != null && stab.aim_recoil !== 1) return Number(stab.aim_recoil);
        var recoil = getBarrelWeaponModifier(item) && getBarrelWeaponModifier(item).recoil;
        if (!recoil) return null;
        if (recoil.multiplier != null && recoil.multiplier !== 1) return Number(recoil.multiplier);
        if (recoil.multiplier_change != null && recoil.multiplier_change !== 0) {
            return 1 + Number(recoil.multiplier_change);
        }
        return null;
    }

    function getBarrelDamageMultiplier(item) {
        var base = getWeaponModifierBase(item);
        if (!base) return null;
        if (base.damage_multiplier != null && base.damage_multiplier !== 1) return Number(base.damage_multiplier);
        if (base.damage_change != null && base.damage_change !== 0) return 1 + Number(base.damage_change);
        return null;
    }

    function getBarrelFireRateMultiplier(item) {
        var base = getWeaponModifierBase(item);
        if (!base) return null;
        if (base.fire_rate_multiplier != null && base.fire_rate_multiplier !== 1) return Number(base.fire_rate_multiplier);
        if (base.fire_rate_change != null && base.fire_rate_change !== 0) return 1 + Number(base.fire_rate_change);
        return null;
    }

    function getBarrelSoundMultiplier(item) {
        var base = getWeaponModifierBase(item);
        if (!base) return null;
        if (base.sound_radius_multiplier != null && base.sound_radius_multiplier !== 1) {
            return Number(base.sound_radius_multiplier);
        }
        if (base.sound_radius_change != null && base.sound_radius_change !== 0) {
            return 1 + Number(base.sound_radius_change);
        }
        return null;
    }

    function getPersonalWeaponSoundCoefficient() {
        return 1;
    }

    function getPersonalWeaponRecoilCoefficient() {
        return 1;
    }

    function getMeleeWeaponBlock(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return null;
        if (wf.melee_weapon && typeof wf.melee_weapon === 'object') return wf.melee_weapon;
        return null;
    }

    function getMeleeAttackMode(melee, category) {
        var modes = melee && melee.attack_modes;
        if (!Array.isArray(modes)) return null;
        for (var i = 0; i < modes.length; i++) {
            if (modes[i] && modes[i].category === category) return modes[i];
        }
        return null;
    }

    function getMeleeModeDamage(mode) {
        if (!mode) return null;
        if (mode.damage != null && mode.damage !== '') return mode.damage;
        var dm = mode.damages;
        if (!dm || typeof dm !== 'object') return null;
        if (dm.physical != null && dm.physical !== '') return dm.physical;
        var sum = 0;
        var any = false;
        ['physical', 'energy', 'thermal', 'biochemical', 'distortion', 'stun'].forEach(function (key) {
            if (dm[key] == null || dm[key] === '') return;
            var n = Number(dm[key]);
            if (!Number.isFinite(n)) return;
            sum += n;
            any = true;
        });
        return any && sum > 0 ? sum : null;
    }

    function getMeleeCategoryDamage(item, category) {
        return getMeleeModeDamage(getMeleeAttackMode(getMeleeWeaponBlock(item), category));
    }

    function formatMeleeCategoryDamage(item, category) {
        var damage = getMeleeCategoryDamage(item, category);
        return damage != null ? formatWikiScalar(damage) : null;
    }

    function buildMeleeStatTags(item) {
        var slash = formatMeleeCategoryDamage(item, 'BladeSlash');
        var stab = formatMeleeCategoryDamage(item, 'BladeStab');
        var tags = [];
        if (slash) tags.push({ label: '挥砍', text: slash });
        if (stab) tags.push({ label: '刺击', text: stab });
        return tags;
    }

    function grenadeBlock(item) {
        return item && item.wiki_fields && item.wiki_fields.grenade;
    }

    function readGrenadeDescriptionData(wf, name) {
        var arr = wf && wf.description_data;
        if (!Array.isArray(arr)) return null;
        var target = String(name || '').toLowerCase();
        for (var i = 0; i < arr.length; i++) {
            if (String(arr[i].name || '').toLowerCase() === target) return arr[i].value || null;
        }
        return null;
    }

    function formatGrenadeDamageType(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return null;
        var fromDesc = readGrenadeDescriptionData(wf, 'Damage Type');
        if (fromDesc) return formatWikiScalar(fromDesc);
        var g = wf.grenade;
        return g && g.damage_type ? formatWikiScalar(g.damage_type) : null;
    }

    function formatGrenadeDamage(item) {
        var g = grenadeBlock(item);
        return g && g.damage != null && g.damage !== '' ? formatWikiScalar(g.damage) : null;
    }

    function formatGrenadeAreaOfEffect(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return null;
        var fromDesc = readGrenadeDescriptionData(wf, 'Area of Effect');
        if (fromDesc) return formatWikiScalar(fromDesc);
        var g = wf.grenade;
        if (g && g.area_of_effect != null && g.area_of_effect !== '') {
            return formatWikiScalar(g.area_of_effect) + ' m';
        }
        return null;
    }

    function formatGrenadeSubtype(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return null;
        var label = wf.sub_type_label || wf.sub_type;
        return label ? formatWikiScalar(label) : null;
    }

    function rowsFromGrenadeParams(item) {
        var wf = (item && item.wiki_fields) || {};
        var g = wf.grenade || {};
        var rows = [];
        var dmgType = formatGrenadeDamageType(item);
        if (dmgType) rows.push({ label: '伤害类型', value: dmgType });
        var damage = formatGrenadeDamage(item);
        if (damage) rows.push({ label: '伤害', value: damage });
        var aoe = formatGrenadeAreaOfEffect(item);
        if (aoe) rows.push({ label: '作用范围', value: aoe });
        if (g.aoe) {
            var min = g.aoe.min != null ? g.aoe.min : g.aoe.minimum;
            var max = g.aoe.max != null ? g.aoe.max : g.aoe.maximum;
            if (max != null && max !== '') {
                if (min != null && min !== '' && min !== max) {
                    rows.push({
                        label: '爆炸半径',
                        value: formatWikiScalar(min) + ' – ' + formatWikiScalar(max) + ' m',
                    });
                } else {
                    rows.push({ label: '爆炸半径', value: formatWikiScalar(max) + ' m' });
                }
            }
        }
        return rows;
    }

    function rowsFromMeleeAttackModes(melee) {
        if (!melee || !Array.isArray(melee.attack_modes)) return [];
        var rows = [];
        melee.attack_modes.forEach(function (mode) {
            if (!mode) return;
            var cat = String(mode.category || '').trim();
            var catLabel = MELEE_ATTACK_CATEGORY_LABEL[cat] || formatWikiScalar(cat) || cat || '攻击';
            var damage = getMeleeModeDamage(mode);
            if (damage != null && damage !== '') {
                rows.push({ label: catLabel + '伤害', value: formatWikiScalar(damage) });
            }
            if (mode.attack_impulse != null && mode.attack_impulse !== '') {
                rows.push({ label: catLabel + '冲量', value: formatWikiScalar(mode.attack_impulse) });
            }
            if (mode.damages && typeof mode.damages === 'object') {
                Object.keys(mode.damages).forEach(function (key) {
                    var val = mode.damages[key];
                    if (val == null || val === '' || val === 0) return;
                    rows.push({
                        label: catLabel + ' · ' + wikiFieldLabel(key, 'weapon_melee'),
                        value: formatWikiScalar(val),
                    });
                });
            }
        });
        return dedupeWikiDetailRows(rows);
    }

    function formatBarrelDamageDisplay(item) {
        var base = getWeaponModifierBase(item);
        if (base) {
            if (base.damage_change != null && base.damage_change !== 0) {
                return formatWikiFieldDisplay('damage_change', base.damage_change);
            }
            if (base.damage_multiplier != null && base.damage_multiplier !== 1) {
                return formatWikiScalar(base.damage_multiplier);
            }
        }
        var wm = item.wiki_fields && item.wiki_fields.weapon_modifier;
        if (wm && wm.recoil && wm.recoil.multiplier_change != null && wm.recoil.multiplier_change !== 0) {
            return formatWikiFieldDisplay('multiplier_change', wm.recoil.multiplier_change);
        }
        return null;
    }

    function rowsFromMagazineDamage(item) {
        var ammo = item.wiki_fields && item.wiki_fields.ammunition;
        if (!ammo) return [];
        if (Array.isArray(ammo.impact_damage) && ammo.impact_damage.length) {
            return rowsFromPersonalWeaponDamages(ammo.impact_damage);
        }
        var map = ammo.impact_damage_map;
        if (map && typeof map === 'object') {
            return Object.keys(map)
                .filter(function (key) {
                    return map[key] != null && map[key] !== '';
                })
                .map(function (key) {
                    return {
                        label: wikiFieldLabel(key, 'magazine'),
                        value: formatWikiScalar(map[key]),
                    };
                });
        }
        return [];
    }

    function rowsFromIronsightAttachment(item) {
        var wf = item.wiki_fields || {};
        var rows = rowsFromWikiObject(wf.iron_sight, [
            'zoom_scale',
            'zoom_time_scale',
            'zoom_time_change',
            'max_range',
            'default_range',
            'range_increment',
            'auto_zeroing_time',
        ], 'attachment_ironsight');
        var aim = wf.weapon_modifier && wf.weapon_modifier.aim;
        if (aim) {
            rows = rows.concat(
                rowsFromWikiObject(aim, ['second_zoom_scale', 'hide_weapon_in_ads', 'fstop_multiplier'], 'attachment_ironsight')
            );
        }
        return dedupeWikiDetailRows(rows);
    }

    function appendBarrelModifierRows(rows, wm) {
        if (!wm) return rows;
        if (wm.base) {
            rows = rows.concat(
                rowsFromWikiObject(
                    wm.base,
                    [
                        'muzzle_flash_multiplier',
                        'muzzle_flash_change',
                        'damage_multiplier',
                        'damage_change',
                        'sound_radius_multiplier',
                        'sound_radius_change',
                        'fire_rate_multiplier',
                        'fire_rate_change',
                        'projectile_speed_multiplier',
                        'projectile_speed_change',
                        'heat_generation_multiplier',
                        'heat_generation_change',
                        'ammo_cost_multiplier',
                        'charge_time_multiplier',
                    ],
                    'attachment_barrel'
                )
            );
        }
        if (wm.recoil) {
            rows = rows.concat(
                rowsFromWikiObject(
                    wm.recoil,
                    ['multiplier', 'multiplier_change', 'decay_multiplier', 'decay_change'],
                    'attachment_barrel'
                )
            );
        }
        return rows;
    }

    function rowsFromBarrelAttachment(item) {
        var rows = [];
        var stab = getBarrelStabilizer(item);
        if (stab) {
            rows = rows.concat(
                rowsFromWikiObject(
                    stab,
                    [
                        'spread',
                        'spread_change',
                        'aim_recoil',
                        'aim_recoil_change',
                        'projectile_speed',
                        'projectile_speed_change',
                        'visual_recoil',
                        'visual_recoil_change',
                    ],
                    'attachment_barrel'
                )
            );
        }
        var wm = item.wiki_fields && item.wiki_fields.weapon_modifier;
        rows = appendBarrelModifierRows(rows, wm);
        return dedupeWikiDetailRows(rows);
    }

    function rowsFromBottomAttachment(item) {
        var wf = item.wiki_fields || {};
        var rows = rowsFromWikiObject(wf.laser_pointer, ['range'], 'attachment_bottom');
        var wm = wf.weapon_modifier;
        if (wm && wm.spread) {
            rows = rows.concat(
                rowsFromWikiObject(
                    wm.spread,
                    ['min_change', 'max_change', 'first_attack_change', 'per_attack_change', 'decay_change'],
                    'attachment_bottom'
                )
            );
        } else if (wm) {
            rows = rows.concat(
                rowsFromWikiObject(
                    wm,
                    ['activate_on_attach', 'ignore_wear', 'damage_multiplier', 'fire_rate_multiplier', 'sound_radius_multiplier'],
                    'attachment_bottom'
                )
            );
        }
        return dedupeWikiDetailRows(rows);
    }

    function rowsFromUtilityAttachment(item) {
        var wm = item.wiki_fields && item.wiki_fields.weapon_modifier;
        if (!wm) return [];
        return dedupeWikiDetailRows(
            rowsFromWikiObject(
                wm,
                [
                    'damage_multiplier',
                    'fire_rate_multiplier',
                    'projectile_speed_multiplier',
                    'heat_generation_multiplier',
                    'ammo_cost_multiplier',
                    'sound_radius_multiplier',
                    'charge_time_multiplier',
                ],
                'attachment_utility'
            )
        );
    }

    function rowsFromMissileAttachment(item) {
        var wf = item.wiki_fields || {};
        var rows = [];
        if (item.size_label || item.size) {
            rows.push({ label: '尺寸', value: formatWikiScalar(item.size_label || item.size) });
        }
        var sub = wf.sub_type_label || wf.sub_type;
        if (sub) rows.push({ label: '子类型', value: formatWikiScalar(sub) });
        return rows;
    }

    function inferFpsEquipmentGroup(typeKey) {
        var key = String(typeKey || '');
        if (key.indexOf('weapon_') === 0) return 'fps_weapon';
        if (key.indexOf('armor_') === 0) return 'fps_armor';
        if (key === 'magazine' || key.indexOf('attachment_') === 0) return 'fps_magazine';
        return '';
    }

    /** 详情页顶栏摘要已展示的字段标签（下方区块不再重复） */
    var DETAIL_HIGHLIGHT_LABELS = {
        ship_weapon: {
            武器类型: true,
        },
        fps_weapon: {
            单发伤害: true,
            射速: true,
            '射速 RPM': true,
            弹匣容量: true,
            武器类型: true,
        },
        fps_armor: {
            护甲等级: true,
            部位: true,
        },
        fps_magazine: {
            最大弹药: true,
            弹速: true,
            放大倍率: true,
            最大射程: true,
            伤害修正: true,
            声响系数: true,
            散布: true,
        },
        armor_backpack: {
            质量: true,
            储物容量: true,
        },
    };

    function pruneDetailSectionsForItem(item, sections) {
        var fpsGroup = inferFpsEquipmentGroup(item && item.type);
        var skip =
            (item && DETAIL_HIGHLIGHT_LABELS[item.type]) ||
            DETAIL_HIGHLIGHT_LABELS[fpsGroup] ||
            (item && item.type === 'armor_backpack' ? DETAIL_HIGHLIGHT_LABELS.armor_backpack : null);
        if (!skip) return sections;
        return sections
            .map(function (section) {
                var rows = (section.rows || []).filter(function (row) {
                    return row && row.label && !skip[row.label];
                });
                return rows.length ? { title: section.title, rows: rows } : null;
            })
            .filter(Boolean);
    }

    function rowsFromWikiObject(obj, fieldOrder, itemType, nestedKey) {
        var rows = [];
        if (!obj || typeof obj !== 'object') return rows;
        var keys = fieldOrder && fieldOrder.length ? fieldOrder : Object.keys(obj);
        var seenLabels = Object.create(null);
        keys.forEach(function (key) {
            if (shouldSkipRawWikiKey(key, obj)) return;
            if (shouldSkipDuplicateWikiKey(key, obj)) return;
            var row = buildRowForWikiField(obj, key, itemType, nestedKey);
            if (!row) return;
            if (seenLabels[row.label]) return;
            seenLabels[row.label] = true;
            rows.push(row);
        });
        return rows;
    }

    var MODULE_MODIFIER_LIST_ORDER = [
        'overcharge_rate',
        'shatter_damage',
        'optimal_charge_rate',
        'optimal_charge_window_size',
        'all_charge_rates',
        'inert_materials',
    ];

    var MINING_LASER_MODIFIER_ORDER = [
        'laser_instability',
        'optimal_charge_window_size',
        'resistance',
        'optimal_charge_rate',
        'inert_materials',
        'all_charge_rates',
        'overcharge_rate',
        'shatter_damage',
    ];

    var MINING_MODIFIER_META = {
        laser_instability: { label: '不稳定性', beneficialWhen: 'negative' },
        optimal_charge_window_size: { label: '最佳窗口', beneficialWhen: 'positive' },
        resistance: { label: '抗性', beneficialWhen: 'negative' },
        optimal_charge_rate: { label: '充能速率', beneficialWhen: 'positive' },
        inert_materials: { label: '惰性材料过滤', beneficialWhen: 'negative', displayInvert: true },
        all_charge_rates: { label: '全部充能速率', beneficialWhen: 'positive' },
        overcharge_rate: { label: '过载速率', beneficialWhen: 'positive' },
        shatter_damage: { label: '碎裂伤害', beneficialWhen: 'positive' },
    };

    function getModuleModifierMap(item) {
        var m = item && item.wiki_fields && item.wiki_fields.mining_modifier;
        return m && m.modifier_map;
    }

    function getMiningLaserModifierMap(item) {
        var m = item && item.wiki_fields && item.wiki_fields.mining_laser;
        return m && m.modifier_map;
    }

    function formatMiningModifierPercent(key, val) {
        if (val == null || val === '' || !Number.isFinite(Number(val))) return null;
        var meta = MINING_MODIFIER_META[key] || { label: wikiFieldLabel(key) };
        var num = Number(val);
        var displayNum = meta.displayInvert ? Math.abs(num) : num;
        var formatted = formatFixedDecimal2(displayNum);
        if (formatted == null) return null;
        var text =
            (displayNum > 0 ? '+' : displayNum < 0 ? '' : '') + formatted + '%';
        var beneficialWhen = meta.beneficialWhen || 'positive';
        var isGood =
            beneficialWhen === 'negative'
                ? num < 0
                : beneficialWhen === 'positive'
                  ? num > 0
                  : num === 0;
        var tone = num === 0 ? 'neutral' : isGood ? 'good' : 'bad';
        return { label: meta.label || wikiFieldLabel(key), text: text, tone: tone, raw: num };
    }

    function buildMiningModifierTags(item, typeKey) {
        var map =
            typeKey === 'ship_module'
                ? getModuleModifierMap(item)
                : typeKey === 'mining_laser'
                  ? getMiningLaserModifierMap(item)
                  : null;
        if (!map) return [];
        var order =
            typeKey === 'mining_laser' ? MINING_LASER_MODIFIER_ORDER : MODULE_MODIFIER_LIST_ORDER.concat(['resistance', 'laser_instability']);
        var tags = [];
        var seen = Object.create(null);
        order.forEach(function (key) {
            if (seen[key]) return;
            seen[key] = true;
            if (map[key] == null || map[key] === '') return;
            if (key === 'all_charge_rates' && map.optimal_charge_rate != null) return;
            var tag = formatMiningModifierPercent(key, map[key]);
            if (tag) tags.push(tag);
        });
        return tags;
    }

    function formatBarrelStatTag(label, num, beneficialWhen) {
        if (num == null || num === '' || !Number.isFinite(Number(num))) return null;
        var n = Number(num);
        if (n === 1) return null;
        var text = formatWikiScalar(n);
        if (text == null) return null;
        var tone = 'neutral';
        if (beneficialWhen === 'lower') tone = n < 1 ? 'good' : 'bad';
        else if (beneficialWhen === 'higher') tone = n > 1 ? 'good' : 'bad';
        return { label: label, text: text, tone: tone, raw: n };
    }

    function formatBarrelDamageTag(item) {
        var base = getWeaponModifierBase(item);
        if (base) {
            if (base.damage_change != null && base.damage_change !== 0) {
                var change = Number(base.damage_change);
                return {
                    label: '伤害修正',
                    text: formatWikiFieldDisplay('damage_change', change),
                    tone: change > 0 ? 'good' : 'bad',
                    raw: change,
                };
            }
            if (base.damage_multiplier != null && base.damage_multiplier !== 1) {
                return formatBarrelStatTag('伤害修正', base.damage_multiplier, 'higher');
            }
        }
        return null;
    }

    function formatBarrelFireRateTag(item) {
        var base = getWeaponModifierBase(item);
        if (base) {
            if (base.fire_rate_change != null && base.fire_rate_change !== 0) {
                var change = Number(base.fire_rate_change);
                return {
                    label: '射速修正',
                    text: formatWikiFieldDisplay('fire_rate_change', change),
                    tone: change > 0 ? 'good' : 'bad',
                    raw: change,
                };
            }
            if (base.fire_rate_multiplier != null && base.fire_rate_multiplier !== 1) {
                return formatBarrelStatTag('射速系数', base.fire_rate_multiplier, 'higher');
            }
        }
        return null;
    }

    function buildBarrelModifierTags(item) {
        var tags = [];
        var seen = Object.create(null);
        function pushTag(tag) {
            if (!tag || seen[tag.label]) return;
            seen[tag.label] = true;
            tags.push(tag);
        }

        pushTag(formatBarrelDamageTag(item));
        pushTag(formatBarrelFireRateTag(item));

        var stab = getBarrelStabilizer(item);
        if (stab) {
            pushTag(formatBarrelStatTag('散布', stab.spread, 'lower'));
            pushTag(formatBarrelStatTag('后坐力', stab.aim_recoil, 'lower'));
        }

        var spreadMult = getBarrelSpreadMultiplier(item);
        if (spreadMult != null && (!stab || stab.spread == null || stab.spread === 1)) {
            pushTag(formatBarrelStatTag('散布', spreadMult, 'lower'));
        }

        var wm = item && item.wiki_fields && item.wiki_fields.weapon_modifier;
        if (wm && wm.recoil) {
            if (wm.recoil.multiplier != null && wm.recoil.multiplier !== 1) {
                pushTag(formatBarrelStatTag('后坐力', wm.recoil.multiplier, 'lower'));
            } else if (wm.recoil.multiplier_change != null && wm.recoil.multiplier_change !== 0) {
                var rc = Number(wm.recoil.multiplier_change);
                pushTag({
                    label: '后坐力修正',
                    text: formatWikiFieldDisplay('multiplier_change', rc),
                    tone: rc > 0 ? 'bad' : 'good',
                    raw: rc,
                });
            }
        }

        var base = getWeaponModifierBase(item);
        if (base && base.sound_radius_multiplier != null && base.sound_radius_multiplier !== 1) {
            pushTag(formatBarrelStatTag('声响系数', base.sound_radius_multiplier, 'lower'));
        }

        return tags;
    }

    var MINING_MODIFIER_TAGS_PER_ROW = 3;

    function renderMiningModifierTagsMarkup(tags, escapeText) {
        if (!tags || !tags.length) return '';
        var esc =
            escapeText ||
            function (s) {
                return String(s || '');
            };
        var rows = [];
        for (var i = 0; i < tags.length; i += MINING_MODIFIER_TAGS_PER_ROW) {
            rows.push(tags.slice(i, i + MINING_MODIFIER_TAGS_PER_ROW));
        }
        return (
            '<span class="sc-mining-mod-tags">' +
            rows
                .map(function (row) {
                    return (
                        '<span class="sc-mining-mod-tags-row">' +
                        row
                            .map(function (tag) {
                                return (
                                    '<span class="sc-loc-level sc-mining-mod-tag sc-mining-mod-tag--' +
                                    tag.tone +
                                    '">' +
                                    '<span class="sc-mining-mod-tag__label">' +
                                    esc(tag.label) +
                                    '</span>' +
                                    '<span class="sc-mining-mod-tag__value">' +
                                    esc(tag.text) +
                                    '</span></span>'
                                );
                            })
                            .join('') +
                        '</span>'
                    );
                })
                .join('') +
            '</span>'
        );
    }

    function makeModuleModifierColumn(key, mapGetter) {
        return {
            key: 'wiki_mod_' + key,
            label: (MINING_MODIFIER_META[key] && MINING_MODIFIER_META[key].label) || wikiFieldLabel(key),
            get: function (item) {
                var map = mapGetter(item);
                var val = map && map[key];
                if (val == null || val === '') return null;
                var tag = formatMiningModifierPercent(key, val);
                return tag ? tag.text : null;
            },
        };
    }

    function flattenWikiFields(obj, prefix) {
        var rows = [];
        if (!obj || typeof obj !== 'object') return rows;
        Object.keys(obj).forEach(function (key) {
            if (SKIP_DETAIL_KEYS[key]) return;
            if (shouldSkipRawWikiKey(key, obj)) return;
            if (shouldSkipDuplicateWikiKey(key, obj)) return;
            var val = obj[key];
            if (val == null || val === '') return;
            if (Array.isArray(val)) return;
            var label = wikiFieldLabel(key);
            if (typeof val === 'object') {
                rows.push.apply(rows, flattenWikiFields(val, prefix ? prefix + ' · ' + label : label));
            } else {
                var display = formatWikiFieldDisplay(key, val);
                if (display == null) return;
                rows.push({ label: prefix ? prefix + ' · ' + label : label, value: display });
            }
        });
        return dedupeWikiDetailRows(rows);
    }

    function shieldBlock(item) {
        return item && item.wiki_fields && item.wiki_fields.shield;
    }

    var WIKI_TABLE_COLUMNS = {
        shield: [
            {
                key: 'wiki_sh_hp',
                label: '护盾容量',
                get: function (item) {
                    var s = shieldBlock(item);
                    return s ? formatWikiScalar(s.max_health || s.max_shield_health) : null;
                },
            },
            {
                key: 'wiki_sh_regen',
                label: '回复速率',
                get: function (item) {
                    var s = shieldBlock(item);
                    return s && s.regen_rate != null ? formatWikiScalar(s.regen_rate) + '/s' : null;
                },
            },
            {
                key: 'wiki_sh_time',
                label: '回复时间',
                get: function (item) {
                    var s = shieldBlock(item);
                    return s ? formatWikiScalar(s.regen_time) : null;
                },
            },
        ],
        cooling: [
            {
                key: 'wiki_cool_seg',
                label: '冷却段',
                get: function (item) {
                    var c = item.wiki_fields && item.wiki_fields.cooler;
                    return c ? formatWikiScalar(c.coolant_segment_generation) : null;
                },
            },
        ],
        power: [
            {
                key: 'wiki_pwr_seg',
                label: '电力段',
                get: function (item) {
                    var p = item.wiki_fields && item.wiki_fields.power_plant;
                    return p ? formatWikiScalar(p.power_segment_generation) : null;
                },
            },
        ],
        quantum: [
            {
                key: 'wiki_q_speed',
                label: '驱动速度',
                get: function (item) {
                    var q = item.wiki_fields && item.wiki_fields.quantum_drive;
                    var jump = q && q.standard_jump;
                    return jump ? formatWikiScalar(jump.drive_speed_formatted || jump.drive_speed) : null;
                },
            },
            {
                key: 'wiki_q_engage',
                label: '启动速度',
                get: function (item) {
                    var q = item.wiki_fields && item.wiki_fields.quantum_drive;
                    var jump = q && q.standard_jump;
                    return jump ? formatWikiScalar(jump.engage_speed_formatted || jump.engage_speed) : null;
                },
            },
        ],
        jump: [
            {
                key: 'wiki_j_align',
                label: '对齐速率',
                get: function (item) {
                    var j = item.wiki_fields && item.wiki_fields.jump_drive;
                    return j ? formatWikiScalar(j.alignment_rate) : null;
                },
            },
            {
                key: 'wiki_j_tune',
                label: '调校速率',
                get: function (item) {
                    var j = item.wiki_fields && item.wiki_fields.jump_drive;
                    return j ? formatWikiScalar(j.tuning_rate) : null;
                },
            },
        ],
        radar: [
            {
                key: 'wiki_r_cd',
                label: '冷却',
                get: function (item) {
                    var r = item.wiki_fields && item.wiki_fields.radar;
                    return r ? formatWikiScalar(r.cooldown) : null;
                },
            },
            {
                key: 'wiki_r_ir',
                label: 'IR 灵敏度',
                get: function (item) {
                    var r = item.wiki_fields && item.wiki_fields.radar;
                    var sens = r && r.sensitivity;
                    return sens ? formatWikiScalar(sens.infrared) : null;
                },
            },
            {
                key: 'wiki_r_em',
                label: 'EM 灵敏度',
                get: function (item) {
                    var r = item.wiki_fields && item.wiki_fields.radar;
                    var sens = r && r.sensitivity;
                    return sens ? formatWikiScalar(sens.electromagnetic) : null;
                },
            },
            {
                key: 'wiki_r_dist_min',
                label: '最小分配距离',
                get: function (item) {
                    var r = item.wiki_fields && item.wiki_fields.radar;
                    var aim = r && r.aim_assist;
                    return aim
                        ? formatWikiFieldDisplay('distance_min_assignment', aim.distance_min_assignment)
                        : null;
                },
            },
            {
                key: 'wiki_r_dist_max',
                label: '最大分配距离',
                get: function (item) {
                    var r = item.wiki_fields && item.wiki_fields.radar;
                    var aim = r && r.aim_assist;
                    return aim
                        ? formatWikiFieldDisplay('distance_max_assignment', aim.distance_max_assignment)
                        : null;
                },
            },
        ],
        ship_weapon: [
            {
                key: 'wiki_w_type',
                label: '武器类型',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.vehicle_weapon;
                    return w && w.type ? formatWikiScalar(w.type) : null;
                },
            },
            {
                key: 'wiki_w_dmg',
                label: '单发伤害',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.vehicle_weapon;
                    return w && w.damage_per_shot != null ? formatWikiScalar(w.damage_per_shot) : null;
                },
            },
            {
                key: 'wiki_w_rpm',
                label: '射速',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.vehicle_weapon;
                    return w && w.rpm != null ? formatWikiScalar(w.rpm) + ' RPM' : null;
                },
            },
            {
                key: 'wiki_w_range',
                label: '射程',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.vehicle_weapon;
                    return w && w.range != null ? formatWikiScalar(w.range) + ' m' : null;
                },
            },
            {
                key: 'wiki_w_dps',
                label: '爆发 DPS',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.vehicle_weapon;
                    var burst = w && w.damage && w.damage.burst;
                    return burst != null ? formatWikiScalar(burst) : null;
                },
            },
            {
                key: 'wiki_w_cap',
                label: '弹匣',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.vehicle_weapon;
                    return w && w.capacity != null ? formatWikiScalar(w.capacity) + ' 发' : null;
                },
            },
        ],
        ship_turret: [
            {
                key: 'wiki_t_sub',
                label: '炮台类型',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    return wf.sub_type_label || wf.sub_type ? formatWikiScalar(wf.sub_type_label || wf.sub_type) : null;
                },
            },
            {
                key: 'wiki_t_mounts',
                label: '炮位',
                get: function (item) {
                    var t = item.wiki_fields && item.wiki_fields.turret;
                    return t && t.mounts != null ? formatWikiScalar(t.mounts) : null;
                },
            },
            {
                key: 'wiki_t_wsize',
                label: '兼容尺寸',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var t = wf.turret || {};
                    var min = t.min_size != null ? t.min_size : wf.min_size;
                    var max = t.max_size != null ? t.max_size : wf.max_size;
                    if (min == null && max == null) return null;
                    if (min != null && max != null && String(min) !== String(max)) {
                        return 'S' + min + '–S' + max;
                    }
                    var val = min != null ? min : max;
                    return val != null ? 'S' + val : null;
                },
            },
        ],
        ship_missile: [
            {
                key: 'wiki_m_type',
                label: '信号类型',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.missile;
                    return m && m.signal_type ? formatWikiScalar(m.signal_type) : null;
                },
            },
            {
                key: 'wiki_m_dmg',
                label: '总伤害',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.missile;
                    return m && m.damage_total != null ? formatWikiScalar(m.damage_total) : null;
                },
            },
            {
                key: 'wiki_m_speed',
                label: '速度',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.missile;
                    return m && m.speed != null ? formatWikiScalar(m.speed) + ' m/s' : null;
                },
            },
            {
                key: 'wiki_m_locktime',
                label: '锁定时间',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.missile;
                    return m && m.lock_time != null ? formatWikiScalar(m.lock_time) + ' s' : null;
                },
            },
            {
                key: 'wiki_m_lock',
                label: '锁定距离',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.missile;
                    if (!m || m.lock_range_max == null) return null;
                    return formatWikiFieldDisplay('lock_range_max', m.lock_range_max);
                },
            },
            {
                key: 'wiki_m_blast',
                label: '爆炸半径',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.missile;
                    return m && m.explosion_radius_max != null
                        ? formatWikiScalar(m.explosion_radius_max) + ' m'
                        : null;
                },
            },
        ],
        missile_rack: [
            {
                key: 'wiki_r_count',
                label: '导弹数',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var rack = wf.missile_rack || {};
                    var count = rack.missile_count != null ? rack.missile_count : wf.max_missiles;
                    return count != null ? formatWikiScalar(count) : null;
                },
            },
            {
                key: 'wiki_r_size',
                label: '导弹尺寸',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var rack = wf.missile_rack || {};
                    var size = rack.missile_size != null ? rack.missile_size : wf.max_size;
                    return size != null ? 'S' + formatWikiScalar(size) : null;
                },
            },
        ],
        mining_laser: [
            {
                key: 'wiki_ml_type',
                label: '激光类型',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_laser;
                    return m && m.type ? formatWikiScalar(m.type) : null;
                },
            },
            {
                key: 'wiki_m_range',
                label: '最佳距离',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_laser;
                    return m && m.optimal_range != null ? formatWikiScalar(m.optimal_range) + ' m' : null;
                },
            },
            {
                key: 'wiki_ml_maxrange',
                label: '最大距离',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_laser;
                    return m && m.maximum_range != null ? formatWikiScalar(m.maximum_range) + ' m' : null;
                },
            },
            {
                key: 'wiki_m_throughput',
                label: '开采吞吐',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_laser;
                    return m && m.extraction_throughput != null
                        ? formatWikiScalar(m.extraction_throughput) + ' SCU/s'
                        : null;
                },
            },
            {
                key: 'wiki_m_slots',
                label: '模组槽',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_laser;
                    return m && m.module_slots != null ? formatWikiScalar(m.module_slots) : null;
                },
            },
            {
                key: 'wiki_ml_power_transfer',
                label: '功率传输',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_laser;
                    return m && m.power_transfer != null ? formatWikiFieldDisplay('power_transfer', m.power_transfer) : null;
                },
            },
        ],
        ship_module: [
            {
                key: 'wiki_sm_duration',
                label: '持续时间',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_modifier;
                    if (!m || m.duration == null || m.duration === '') return null;
                    return formatWikiFieldDisplay('duration', m.duration);
                },
            },
        ],
        salvage_scraper: [
            {
                key: 'wiki_ss_eff',
                label: '提取效率',
                get: function (item) {
                    var s = getSalvageScraperBlock(item);
                    if (!s || s.extraction_efficiency == null) return null;
                    return formatFixedDecimal2(Number(s.extraction_efficiency) * 100) + '%';
                },
            },
            {
                key: 'wiki_ss_radius',
                label: '作用半径',
                get: function (item) {
                    var s = getSalvageScraperBlock(item);
                    return s && s.radius_multiplier != null
                        ? formatWikiScalar(s.radius_multiplier) + ' m'
                        : null;
                },
            },
            {
                key: 'wiki_ss_speed',
                label: '提取速度',
                get: function (item) {
                    var s = getSalvageScraperBlock(item);
                    return s && s.salvage_speed_multiplier != null
                        ? formatWikiScalar(s.salvage_speed_multiplier)
                        : null;
                },
            },
        ],
        fuel_nozzle: [
            {
                key: 'wiki_fn_h2',
                label: '氢燃料流速',
                get: function (item) {
                    var r = getFuelNozzleRates(item);
                    return r.hydrogen != null ? formatWikiScalar(r.hydrogen) + ' SCU/s' : null;
                },
            },
            {
                key: 'wiki_fn_qf',
                label: '量子燃料流速',
                get: function (item) {
                    var r = getFuelNozzleRates(item);
                    return r.quantum != null ? formatWikiScalar(r.quantum) + ' SCU/s' : null;
                },
            },
            {
                key: 'wiki_fn_hp',
                label: '结构完整性',
                get: function (item) {
                    var h = getItemDurabilityHealth(item);
                    return h != null ? formatWikiScalar(h) : null;
                },
            },
        ],
        weapon_pistol: [
            {
                key: 'wiki_pw_class',
                label: '伤害类型',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.personal_weapon;
                    return w && w.class ? formatWikiScalar(w.class) : null;
                },
            },
            {
                key: 'wiki_pw_dmg',
                label: '单发伤害',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.personal_weapon;
                    return w && w.damage_per_shot != null ? formatWikiScalar(w.damage_per_shot) : null;
                },
            },
            {
                key: 'wiki_pw_rpm',
                label: '射速',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.personal_weapon;
                    var rpm = w && (w.rpm != null ? w.rpm : w.rof);
                    return rpm != null ? formatWikiScalar(rpm) + ' RPM' : null;
                },
            },
            {
                key: 'wiki_pw_range',
                label: '射程',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.personal_weapon;
                    var range = w && (w.effective_range != null ? w.effective_range : w.range);
                    return range != null ? formatWikiScalar(range) + ' m' : null;
                },
            },
            {
                key: 'wiki_pw_sound',
                label: '声响系数',
                get: function () {
                    return formatWikiScalar(getPersonalWeaponSoundCoefficient());
                },
            },
            {
                key: 'wiki_pw_recoil',
                label: '后坐力系数',
                get: function () {
                    return formatWikiScalar(getPersonalWeaponRecoilCoefficient());
                },
            },
            {
                key: 'wiki_pw_cap',
                label: '弹匣容量',
                get: function (item) {
                    var w = item.wiki_fields && item.wiki_fields.personal_weapon;
                    var cap = w && (w.magazine_size != null ? w.magazine_size : w.capacity);
                    return cap != null ? formatWikiScalar(cap) : null;
                },
            },
            {
                key: 'wiki_pw_slots',
                label: '配件槽',
                get: function (item) {
                    var count = getWeaponAttachmentSlotCount(item);
                    return count != null && count > 0 ? formatWikiScalar(count) : null;
                },
            },
        ],
        weapon_throwable: [
            {
                key: 'wiki_wt_dmg_type',
                label: '伤害类型',
                get: function (item) {
                    return formatGrenadeDamageType(item);
                },
            },
            {
                key: 'wiki_wt_damage',
                label: '伤害',
                get: function (item) {
                    return formatGrenadeDamage(item);
                },
            },
            {
                key: 'wiki_wt_aoe',
                label: '作用范围',
                get: function (item) {
                    return formatGrenadeAreaOfEffect(item);
                },
            },
        ],
        weapon_melee: [
            {
                key: 'wiki_mw_subtype',
                label: '武器子类',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var label = wf.sub_type_label || wf.sub_type;
                    return label ? formatWikiScalar(label) : null;
                },
            },
            {
                key: 'wiki_mw_slash',
                label: '挥砍伤害',
                get: function (item) {
                    return formatMeleeCategoryDamage(item, 'BladeSlash');
                },
            },
            {
                key: 'wiki_mw_stab',
                label: '刺击伤害',
                get: function (item) {
                    return formatMeleeCategoryDamage(item, 'BladeStab');
                },
            },
        ],
        armor_backpack: [
            {
                key: 'wiki_bp_cargo',
                label: '储物容量',
                get: function (item) {
                    var dim = item.wiki_fields && item.wiki_fields.dimension;
                    var c = dim && dim.cargo_dimension;
                    if (!c || c.width == null || c.height == null || c.length == null) return null;
                    var scu = Number(c.width) * Number(c.height) * Number(c.length);
                    if (!Number.isFinite(scu) || scu <= 0) return null;
                    return formatFixedDecimal2(scu) + ' SCU';
                },
            },
            {
                key: 'wiki_bp_cargo_dim',
                label: '货物空间',
                get: function (item) {
                    var dim = item.wiki_fields && item.wiki_fields.dimension;
                    var c = dim && dim.cargo_dimension;
                    if (!c || c.width == null || c.height == null || c.length == null) return null;
                    return (
                        formatWikiScalar(c.width) +
                        ' × ' +
                        formatWikiScalar(c.height) +
                        ' × ' +
                        formatWikiScalar(c.length) +
                        ' m'
                    );
                },
            },
        ],
        armor_helmet: [
            {
                key: 'wiki_pa_subtype',
                label: '护甲等级',
                get: function (item) {
                    return formatArmorClassLabel(item);
                },
            },
            {
                key: 'wiki_pa_slot',
                label: '部位',
                get: function (item) {
                    return formatArmorSlotLabel(item);
                },
            },
            {
                key: 'wiki_pa_dr',
                label: '物理减伤',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var a = wf.suit_armor || {};
                    var map = a.damage_resistance_map || {};
                    if (map.physical_change != null) {
                        var pct = Math.abs(Number(map.physical_change));
                        if (pct === 0) return null;
                        return formatFixedDecimal2(pct * 100) + '%';
                    }
                    if (map.physical != null && map.physical < 1) {
                        return formatFixedDecimal2((1 - Number(map.physical)) * 100) + '%';
                    }
                    return null;
                },
            },
            {
                key: 'wiki_pa_gforce',
                label: '抗 G 值',
                get: function (item) {
                    return formatGforceSignedDisplay(getArmorGforceResistance(item));
                },
            },
            {
                key: 'wiki_pa_temp',
                label: '适用温度',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var a = wf.suit_armor || {};
                    var tr = wf.temperature_resistance || {};
                    var min = a.temp_resistance_min != null ? a.temp_resistance_min : tr.min != null ? tr.min : tr.minimum;
                    var max = a.temp_resistance_max != null ? a.temp_resistance_max : tr.max != null ? tr.max : tr.maximum;
                    if (min == null && max == null) return null;
                    if (min != null && max != null) return formatWikiScalar(min) + ' / ' + formatWikiScalar(max) + ' °C';
                    return formatWikiScalar(min != null ? min : max) + ' °C';
                },
            },
            {
                key: 'wiki_pa_rad',
                label: '辐射容量',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var rr = (wf.suit_armor && wf.suit_armor.radiation_resistance) || wf.radiation_resistance || {};
                    return rr.maximum_radiation_capacity != null
                        ? formatWikiScalar(rr.maximum_radiation_capacity) + ' REM'
                        : null;
                },
            },
            {
                key: 'wiki_pa_rad_rate',
                label: '辐射清除',
                get: function (item) {
                    var wf = item.wiki_fields || {};
                    var rr = (wf.suit_armor && wf.suit_armor.radiation_resistance) || wf.radiation_resistance || {};
                    return rr.radiation_dissipation_rate != null
                        ? formatWikiScalar(rr.radiation_dissipation_rate) + ' REM/s'
                        : null;
                },
            },
        ],
        magazine: [
            {
                key: 'wiki_mag_cap',
                label: '容量',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.magazine;
                    if (!m) return null;
                    var cap = m.max_ammo_count != null ? m.max_ammo_count : m.initial_ammo_count;
                    return cap != null ? formatWikiScalar(cap) : null;
                },
            },
            {
                key: 'wiki_mag_ammo_dmg',
                label: '弹药伤害',
                get: function (item) {
                    var ammo = item.wiki_fields && item.wiki_fields.ammunition;
                    if (!ammo) return null;
                    var dmg = ammo.impact_damage_map && ammo.impact_damage_map.physical;
                    if (dmg == null && Array.isArray(ammo.impact_damage) && ammo.impact_damage[0]) {
                        dmg = ammo.impact_damage[0].damage;
                    }
                    return dmg != null ? formatWikiScalar(dmg) : null;
                },
            },
            {
                key: 'wiki_mag_speed',
                label: '弹速',
                get: function (item) {
                    var ammo = item.wiki_fields && item.wiki_fields.ammunition;
                    return ammo && ammo.speed != null ? formatWikiScalar(ammo.speed) + ' m/s' : null;
                },
            },
            {
                key: 'wiki_mag_range',
                label: '射程',
                get: function (item) {
                    var ammo = item.wiki_fields && item.wiki_fields.ammunition;
                    return ammo && ammo.range != null ? formatWikiScalar(ammo.range) + ' m' : null;
                },
            },
        ],
        attachment_ironsight: [
            {
                key: 'wiki_att_zoom',
                label: '放大倍率',
                get: function (item) {
                    var s = item.wiki_fields && item.wiki_fields.iron_sight;
                    return s && s.zoom_scale != null ? formatWikiScalar(s.zoom_scale) + '×' : null;
                },
            },
            {
                key: 'wiki_att_sight_range',
                label: '最大射程',
                get: function (item) {
                    var s = item.wiki_fields && item.wiki_fields.iron_sight;
                    return s && s.max_range != null ? formatWikiScalar(s.max_range) + ' m' : null;
                },
            },
        ],
        attachment_barrel: [
            {
                key: 'wiki_att_damage',
                label: '伤害系数',
                get: function (item) {
                    var val = getBarrelDamageMultiplier(item);
                    return val != null ? formatWikiScalar(val) : null;
                },
            },
            {
                key: 'wiki_att_fire_rate',
                label: '射速系数',
                get: function (item) {
                    var val = getBarrelFireRateMultiplier(item);
                    return val != null ? formatWikiScalar(val) : null;
                },
            },
            {
                key: 'wiki_att_sound',
                label: '声响系数',
                get: function (item) {
                    var val = getBarrelSoundMultiplier(item);
                    return val != null ? formatWikiScalar(val) : null;
                },
            },
            {
                key: 'wiki_att_recoil',
                label: '后坐力系数',
                get: function (item) {
                    var val = getBarrelRecoilMultiplier(item);
                    return val != null ? formatWikiScalar(val) : null;
                },
            },
            {
                key: 'wiki_att_spread',
                label: '散布系数',
                get: function (item) {
                    var val = getBarrelSpreadMultiplier(item);
                    return val != null ? formatWikiScalar(val) : null;
                },
            },
            {
                key: 'wiki_att_proj_speed',
                label: '弹速',
                get: function (item) {
                    var stab = getBarrelStabilizer(item);
                    if (stab && stab.projectile_speed != null) return formatWikiScalar(stab.projectile_speed);
                    var base = getWeaponModifierBase(item);
                    if (base && base.projectile_speed_multiplier != null && base.projectile_speed_multiplier !== 1) {
                        return formatWikiScalar(base.projectile_speed_multiplier);
                    }
                    return null;
                },
            },
            {
                key: 'wiki_att_muzzle',
                label: '枪口焰',
                get: function (item) {
                    var base = getWeaponModifierBase(item);
                    if (!base || base.muzzle_flash_multiplier == null || base.muzzle_flash_multiplier === 1) return null;
                    return formatWikiScalar(base.muzzle_flash_multiplier);
                },
            },
        ],
        attachment_bottom: [
            {
                key: 'wiki_att_laser_range',
                label: '激光射程',
                get: function (item) {
                    var l = item.wiki_fields && item.wiki_fields.laser_pointer;
                    return l && l.range != null ? formatWikiScalar(l.range) + ' m' : null;
                },
            },
        ],
        attachment_utility: [
            {
                key: 'wiki_att_damage_mult',
                label: '伤害系数',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.weapon_modifier;
                    var v = m && (m.base ? m.base.damage_multiplier : m.damage_multiplier);
                    return v != null ? formatWikiScalar(v) : null;
                },
            },
            {
                key: 'wiki_att_fire_rate',
                label: '射速系数',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.weapon_modifier;
                    var v = m && (m.base ? m.base.fire_rate_multiplier : m.fire_rate_multiplier);
                    return v != null ? formatWikiScalar(v) : null;
                },
            },
            {
                key: 'wiki_att_proj_speed',
                label: '弹速系数',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.weapon_modifier;
                    var v = m && (m.base ? m.base.projectile_speed_multiplier : m.projectile_speed_multiplier);
                    return v != null ? formatWikiScalar(v) : null;
                },
            },
        ],
        attachment_missile: [],
    };

    function getWikiTableColumns(typeKey) {
        var resolved = resolveEquipmentTypeKey(typeKey);
        return WIKI_TABLE_COLUMNS[resolved] || [];
    }

    function rowsFromMiningModifierMap(map, fieldOrder) {
        var rows = [];
        if (!map) return rows;
        (fieldOrder || MINING_LASER_MODIFIER_ORDER).forEach(function (key) {
            if (map[key] == null || map[key] === '') return;
            if (key === 'all_charge_rates' && map.optimal_charge_rate != null) return;
            var tag = formatMiningModifierPercent(key, map[key]);
            if (!tag) return;
            rows.push({ label: tag.label, value: tag.text });
        });
        return rows;
    }

    function groupWikiFieldsForDetail(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return [];
        var blockKey = resolveWikiBlockKey(item.type);
        var block = blockKey && wf[blockKey];
        var sectionKey = resolveDetailSectionKey(item.type);
        var sectionDefs = TYPE_DETAIL_SECTIONS[sectionKey];
        var hasCustomSections =
            sectionDefs &&
            sectionDefs.some(function (def) {
                return !!def.custom;
            });
        if (!sectionDefs || (!block && !hasCustomSections)) {
            var flat = flattenWikiFields(wf);
            if (!flat.length) return [];
            return [
                {
                    title: '技术参数',
                    rows: flat.map(function (r) {
                        var label = r.label;
                        var parts = label.split(' · ');
                        return { label: parts[parts.length - 1], value: r.value };
                    }),
                },
            ];
        }
        var sections = [];
        sectionDefs.forEach(function (def) {
            var rows = [];
            if (def.nested === 'modifier_map') {
                rows = rowsFromMiningModifierMap(block[def.nested], def.fields);
            } else if (def.nested === 'damages') {
                rows = rowsFromPersonalWeaponDamages(block[def.nested], block.damage_per_shot);
            } else if (def.nested === 'modes') {
                rows = rowsFromPersonalWeaponModes(block[def.nested], block);
            } else if (def.custom === 'magazine_damage') {
                rows = rowsFromMagazineDamage(item);
            } else if (def.custom === 'ironsight') {
                rows = rowsFromIronsightAttachment(item);
            } else if (def.custom === 'barrel') {
                rows = rowsFromBarrelAttachment(item);
            } else if (def.custom === 'bottom') {
                rows = rowsFromBottomAttachment(item);
            } else if (def.custom === 'utility') {
                rows = rowsFromUtilityAttachment(item);
            } else if (def.custom === 'missile_attachment') {
                rows = rowsFromMissileAttachment(item);
            } else if (def.custom === 'melee_attacks') {
                rows = rowsFromMeleeAttackModes(block);
            } else if (def.custom === 'grenade_params') {
                rows = rowsFromGrenadeParams(item);
            } else if (def.nested) {
                var nestedObj = block[def.nested];
                if (!nestedObj && item.type === 'magazine' && def.nested === 'ammunition') {
                    nestedObj = wf.ammunition;
                }
                rows = rowsFromWikiObject(nestedObj, def.fields, sectionKey, def.nested);
            } else if (def.fields) {
                rows = rowsFromWikiObject(block, def.fields, sectionKey);
            }
            rows = dedupeWikiDetailRows(rows);
            if (rows.length) sections.push({ title: def.title, rows: rows });
        });
        sections = pruneDetailSectionsForItem(item, sections);
        if (item.type === 'weapon_melee' && (wf.sub_type || wf.sub_type_label)) {
            var meleeSubRow = {
                label: '武器子类',
                value: formatWikiScalar(wf.sub_type_label || wf.sub_type),
            };
            if (sections.length) {
                sections[0].rows = dedupeWikiDetailRows([meleeSubRow].concat(sections[0].rows || []));
            } else {
                sections.push({ title: '近战参数', rows: [meleeSubRow] });
            }
        }
        if (item.type && item.type.indexOf('weapon_') === 0) {
            var slotCount = getWeaponAttachmentSlotCount(item);
            if (slotCount != null && slotCount > 0) {
                var slotRow = { label: '配件槽', value: formatWikiScalar(slotCount) };
                var weaponParamSection = null;
                for (var si = 0; si < sections.length; si++) {
                    if (sections[si].title === '武器参数') {
                        weaponParamSection = sections[si];
                        break;
                    }
                }
                if (weaponParamSection) {
                    weaponParamSection.rows = dedupeWikiDetailRows((weaponParamSection.rows || []).concat([slotRow]));
                } else if (sections.length) {
                    sections[0].rows = dedupeWikiDetailRows((sections[0].rows || []).concat([slotRow]));
                } else {
                    sections.push({ title: '武器参数', rows: [slotRow] });
                }
            }
        }
        if (!sections.length && block) {
            var fallbackRows = rowsFromWikiObject(block, ['type', 'class', 'fire_mode'], sectionKey);
            fallbackRows = dedupeWikiDetailRows(fallbackRows);
            if (fallbackRows.length) {
                sections.push({ title: '武器参数', rows: fallbackRows });
            }
        }
        return sections;
    }

    function buildAttachmentModifierTags(item) {
        if (!item) return [];
        var type = item.type || '';
        if (type === 'attachment_barrel' || type === 'attachment_utility') {
            return buildBarrelModifierTags(item);
        }
        if (type === 'attachment_ironsight') {
            var sightTags = [];
            var wf = item.wiki_fields || {};
            var aim = wf.weapon_modifier && wf.weapon_modifier.aim;
            var isBlock = wf.iron_sight;
            var zoom = (aim && aim.second_zoom_scale) || (isBlock && isBlock.second_zoom_scale);
            if (zoom != null && Number(zoom) !== 1) {
                sightTags.push({ label: '变焦', text: formatWikiScalar(zoom) + '×', tone: 'good', raw: zoom });
            }
            if (aim && aim.fstop_multiplier != null && aim.fstop_multiplier !== 1) {
                sightTags.push({
                    label: '景深倍率',
                    text: formatWikiScalar(aim.fstop_multiplier),
                    tone: 'neutral',
                    raw: aim.fstop_multiplier,
                });
            }
            return sightTags;
        }
        if (type === 'attachment_bottom') {
            var bottomTags = [];
            var lp = item.wiki_fields && item.wiki_fields.laser_pointer;
            if (lp && lp.range != null) {
                bottomTags.push({
                    label: '激光射程',
                    text: formatWikiScalar(lp.range) + ' m',
                    tone: 'good',
                    raw: lp.range,
                });
            }
            var bwm = item.wiki_fields && item.wiki_fields.weapon_modifier;
            if (bwm) {
                var dmgTag = formatBarrelDamageTag({ wiki_fields: { weapon_modifier: bwm } });
                if (dmgTag) bottomTags.push(dmgTag);
            }
            return bottomTags;
        }
        return [];
    }

    global.ShipComponentWiki = {
        formatFixedDecimal2: formatFixedDecimal2,
        formatWikiScalar: formatWikiScalar,
        formatGforceSignedDisplay: formatGforceSignedDisplay,
        formatWikiFieldDisplay: formatWikiFieldDisplay,
        formatMiningModifierPercent: formatMiningModifierPercent,
        buildMiningModifierTags: buildMiningModifierTags,
        buildBarrelModifierTags: buildBarrelModifierTags,
        buildAttachmentModifierTags: buildAttachmentModifierTags,
        buildMeleeStatTags: buildMeleeStatTags,
        formatGrenadeDamageType: formatGrenadeDamageType,
        formatGrenadeDamage: formatGrenadeDamage,
        formatGrenadeAreaOfEffect: formatGrenadeAreaOfEffect,
        formatGrenadeSubtype: formatGrenadeSubtype,
        getMeleeCategoryDamage: getMeleeCategoryDamage,
        formatMeleeCategoryDamage: formatMeleeCategoryDamage,
        renderMiningModifierTagsMarkup: renderMiningModifierTagsMarkup,
        formatArmorClassLabel: formatArmorClassLabel,
        formatArmorSlotLabel: formatArmorSlotLabel,
        formatArmorSubcategory: formatArmorSubcategory,
        wikiFieldLabel: wikiFieldLabel,
        flattenWikiFields: flattenWikiFields,
        groupWikiFieldsForDetail: groupWikiFieldsForDetail,
        getWikiTableColumns: getWikiTableColumns,
        getWeaponAttachmentSlotCount: getWeaponAttachmentSlotCount,
        getBarrelRecoilMultiplier: getBarrelRecoilMultiplier,
        getBarrelSpreadMultiplier: getBarrelSpreadMultiplier,
        getBarrelDamageMultiplier: getBarrelDamageMultiplier,
        getBarrelFireRateMultiplier: getBarrelFireRateMultiplier,
        getBarrelSoundMultiplier: getBarrelSoundMultiplier,
        WIKI_TABLE_COLUMNS: WIKI_TABLE_COLUMNS,
    };
})(typeof window !== 'undefined' ? window : global);
