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

    function formatWikiScalar(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'boolean') return v ? '是' : '否';
        if (typeof v === 'number' && Number.isFinite(v)) {
            if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) {
                return v.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
            }
            return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
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
    };
    var WIKI_BOOLEAN_NUM_KEYS = {
        enable_lifetime: true,
        allow_dumb_firing: true,
        requires_launcher: true,
        enable_cross_section_occlusion: true,
        is_cluster: true,
    };

    function isUnlimitedRangeKey(key) {
        return key === 'lock_range_max' || key === 'lock_range_min' || key === 'range_max' || key === 'range_min';
    }

    function formatWikiFieldDisplay(key, val) {
        if (val == null || val === '') return null;
        if (typeof val === 'number' && val < 0 && isUnlimitedRangeKey(key)) {
            return '无限';
        }
        if (WIKI_BOOLEAN_NUM_KEYS[key] && (val === 0 || val === 1)) {
            return val === 1 ? '是' : '否';
        }
        var display = formatWikiScalar(val);
        if (display == null) return null;
        return appendWikiFieldUnit(key, display);
    }

    function appendWikiFieldUnit(key, display) {
        if (display == null || display === '') return display;
        if (display === '无限') return display;
        if (!Object.prototype.hasOwnProperty.call(WIKI_FIELD_UNITS, key)) return display;
        var unit = WIKI_FIELD_UNITS[key];
        if (!unit) return display;
        return display + unit;
    }

    /** Wiki 同义键：渲染时跳过后者，避免重复展示 */
    var WIKI_DUPLICATE_FIELD_SKIP = {
        maximum: 'max',
        minimum: 'min',
        max_shield_health: 'max_health',
        max_shield_regen: 'regen_rate',
    };

    /** 汉化库未收录时的兜底（优先使用 global.WIKI_SCALAR_LOC） */
    var WIKI_SCALAR_ZH = {
        'µSCU': 'µSCU',
        '[AUTO]': '全自动',
        '[SEMI]': '半自动',
        '[CHARGE]': '充能',
        'Plasma Canon': '电浆加农炮',
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
        first_attack: '首发散布',
        per_attack: '逐发散布',
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
    };

    function wikiFieldLabel(key, itemType) {
        if (key === 'type') {
            if (itemType === 'ship_weapon') return '武器类型';
            if (itemType === 'ship_turret') return '炮台类型';
            if (itemType === 'mining_laser') return '激光类型';
            if (itemType === 'ship_module') return '模组类型';
        }
        return WIKI_FIELD_LABELS[key] || String(key || '').replace(/_/g, ' ');
    }

    var SKIP_DETAIL_KEYS = { api_link: true, web_url: true, updated_at: true, modes: true };

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
    };

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
                fields: ['burst', 'alpha_total', 'sustained_60s', 'max'],
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
        ],
        ship_module: [
            {
                title: '模组参数',
                fields: ['type', 'item_type', 'charges', 'duration', 'power_modifier'],
            },
            { title: '属性修正', nested: 'modifier_map', fields: ['resistance', 'laser_instability', 'overcharge_rate', 'inert_materials', 'optimal_charge_rate', 'optimal_charge_window_size', 'all_charge_rates'] },
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

    function buildRowForWikiField(block, key, itemType) {
        if (!block) return null;
        var val = block[key];
        if (val == null || val === '') return null;
        if (typeof val === 'object' && !Array.isArray(val)) {
            if (val.formatted != null && val.formatted !== '') {
                return { label: wikiFieldLabel(key, itemType), value: formatWikiScalar(val.formatted) };
            }
            if (val.seconds != null && val.formatted) {
                return { label: wikiFieldLabel(key, itemType), value: formatWikiScalar(val.formatted) };
            }
            return null;
        }
        var display = formatWikiFieldDisplay(key, val);
        if (display == null) return null;
        return { label: wikiFieldLabel(key, itemType), value: display };
    }

    function shouldSkipDuplicateWikiKey(key, obj) {
        var primary = WIKI_DUPLICATE_FIELD_SKIP[key];
        if (!primary) return false;
        if (obj[primary] == null || obj[primary] === '') return false;
        return true;
    }

    function rowsFromWikiObject(obj, fieldOrder, itemType) {
        var rows = [];
        if (!obj || typeof obj !== 'object') return rows;
        var keys = fieldOrder && fieldOrder.length ? fieldOrder : Object.keys(obj);
        var seenLabels = Object.create(null);
        keys.forEach(function (key) {
            if (shouldSkipRawWikiKey(key, obj)) return;
            if (shouldSkipDuplicateWikiKey(key, obj)) return;
            var row = buildRowForWikiField(obj, key, itemType);
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

    function getModuleModifierMap(item) {
        var m = item && item.wiki_fields && item.wiki_fields.mining_modifier;
        return m && m.modifier_map;
    }

    function makeModuleModifierColumn(key) {
        return {
            key: 'wiki_mod_' + key,
            label: wikiFieldLabel(key),
            get: function (item) {
                var map = getModuleModifierMap(item);
                var val = map && map[key];
                if (val == null || val === '') return null;
                return formatWikiFieldDisplay(key, val);
            },
        };
    }

    function groupWikiFieldsForDetail(item) {
        var wf = item && item.wiki_fields;
        if (!wf) return [];
        var type = item.type;
        var blockKey = TYPE_WIKI_BLOCK_KEY[type];
        var block = blockKey && wf[blockKey];
        var sectionDefs = TYPE_DETAIL_SECTIONS[type];
        if (!block || !sectionDefs) {
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
            if (def.nested) {
                rows = rowsFromWikiObject(block[def.nested], def.fields, type);
            } else if (def.fields) {
                rows = rowsFromWikiObject(block, def.fields, type);
            }
            rows = dedupeWikiDetailRows(rows);
            if (rows.length) sections.push({ title: def.title, rows: rows });
        });
        return sections;
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
            var label = wikiFieldLabel(key);
            if (typeof val === 'object' && !Array.isArray(val)) {
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
        ship_module: MODULE_MODIFIER_LIST_ORDER.map(makeModuleModifierColumn).concat([
            {
                key: 'wiki_mod_type',
                label: '类型',
                get: function (item) {
                    var m = item.wiki_fields && item.wiki_fields.mining_modifier;
                    return m && m.type ? formatWikiScalar(m.type) : null;
                },
            },
            {
                key: 'wiki_mod_resistance',
                label: '抗性',
                get: function (item) {
                    var map = getModuleModifierMap(item);
                    return map && map.resistance != null ? formatWikiScalar(map.resistance) : null;
                },
            },
            {
                key: 'wiki_mod_instability',
                label: '不稳定性',
                get: function (item) {
                    var map = getModuleModifierMap(item);
                    return map && map.laser_instability != null ? formatWikiScalar(map.laser_instability) : null;
                },
            },
        ]),
    };

    function getWikiTableColumns(typeKey) {
        return WIKI_TABLE_COLUMNS[typeKey] || [];
    }

    global.ShipComponentWiki = {
        formatWikiScalar: formatWikiScalar,
        formatWikiFieldDisplay: formatWikiFieldDisplay,
        wikiFieldLabel: wikiFieldLabel,
        flattenWikiFields: flattenWikiFields,
        groupWikiFieldsForDetail: groupWikiFieldsForDetail,
        getWikiTableColumns: getWikiTableColumns,
        WIKI_TABLE_COLUMNS: WIKI_TABLE_COLUMNS,
    };
})(typeof window !== 'undefined' ? window : global);
