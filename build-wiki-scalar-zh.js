'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LOC_DIR = path.join(ROOT, 'sc-database', 'data', 'localization', 'categories');
const OUT = path.join(ROOT, 'frontend', 'ship-component-wiki-scalar-zh.js');
const loc = {};
for (const f of fs.readdirSync(LOC_DIR)) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(fs.readFileSync(path.join(LOC_DIR, f), 'utf8'));
    for (const e of d.entries || []) if (e && e.key) loc[e.key] = e.value || '';
}
function v(k) { return loc[k]; }
function sig(s) { return s ? String(s).replace(/信号$/g, '').trim() : ''; }
const map = {};
function set(en, zh) {
    if (!en || !zh) return;
    const s = String(zh).trim();
    if (!s || s.length > 48 || s.includes('\n')) return;
    if (!map[en]) map[en] = s;
    const lower = en.toLowerCase();
    if (lower !== en && !map[lower]) map[lower] = s;
}
function dt(s) { const k = 'item_displayType_' + s; if (v(k)) set(s.replace(/_/g, ' '), v(k)); }
function st(s) { const k = 'item_SubType' + s; if (v(k)) set(s, v(k)); }
function ty(s) {
    for (const k of ['item_Type' + s, 'item_Type' + s + ',P']) {
        if (v(k)) { set(s.replace(/([A-Z])/g, ' $1').trim(), v(k)); break; }
    }
}
['Cooler','Shield','Radar','QuantumDrive','PowerPlant','MiningModifier','MissileLauncher','WeaponGun','WeaponMining','JumpDrive'].forEach(ty);
['Gatling','Repeater','Cannon','ScatterGun','Beam','Rocket','Missile','MissileRack','MiningLaser','ShieldGenerator','QuantumDrive','PowerPlant','Cooler','Neutron'].forEach(dt);
['Gun','Rocket','Missile','MissileRack','NoseMounted','Power','Radar','GunTurret','MissileTurret','ScraperBeam','Heat'].forEach(st);
set('IR', sig(v('mfd_Emission_IR')) || '红外');
set('EM', sig(v('mfd_Emission_EM')) || '电磁');
set('CS', sig(v('mfd_Emission_CS')) || '横截面');
set('Infrared', sig(v('hud_scanning_info_ir_signature')) || '红外');
set('Electromagnetic', sig(v('hud_scanning_info_em_signature')) || '电磁');
set('CrossSection', sig(v('hud_scanning_info_cs_signature')) || '横截面');
set('Cross Section', map.CrossSection || '横截面');
set('Infinite', '无限'); set('infinite', '无限'); set('Unlimited', '无限');
set('Undefined', '—'); set('UNDEFINED', '—');
set('Physical', '物理'); set('physical', '物理');
set('Energy', '能量'); set('energy', '能量');
set('Distortion', '畸变'); set('distortion', '畸变');
set('Thermal', '热能'); set('thermal', '热能');
set('Biochemical', '生化'); set('biochemical', '生化');
set('Stun', '击晕'); set('stun', '击晕');
set('impact', '冲击'); set('detonation', '爆炸');
set('single', v('ui_weapons_firemode_single') || '单发'); set('Single', map.single);
set('rapid', v('ui_weapons_firemode_rapid') || '连发'); set('Rapid', map.rapid);
set('Burst', v('ui_weapons_firemode_burst') || '三连发'); set('burst', map.Burst);
set('charged', '蓄能'); set('Charge', v('ui_weapons_firemode_charge') || '充能');
set('sequence', '序列'); set('Looping', '循环');
set('beam', v('item_displayType_Beam') || '光束'); set('Beam', map.beam);
set('Automatically', '自动');
set('Passive', v('ea_ui_modePassive') || v('hud_mining_consumables_passive') || '被动');
set('Active', '激活');
set('Resistance', v('hud_mining_resistance') || '抗性'); set('resistance', map.Resistance);
set('Extraction', '提取');
set('Instability', v('hud_mining_instability') || '不稳定性'); set('instability', map.Instability);
set('Laser Instability', map.Instability); set('laser_instability', map.Instability);
set('Inert Materials', v('items_commodities_inert_materials') || '惰性物质');
set('inert_materials', map['Inert Materials']);
set('Optimal Charge Rate', '最佳充能率'); set('optimal_charge_rate', '最佳充能率');
set('Optimal Charge Window', '充能绿区'); set('Optimal Charge Window Size', '充能绿区');
set('optimal_charge_window', '充能绿区'); set('optimal_charge_window_size', '充能绿区');
set('Overcharge Rate', '过载充能率'); set('overcharge_rate', '过载充能率');
set('All Charge Rates', '全部充能速率'); set('all_charge_rates', '全部充能速率');
set('Shatter Damage', '碎裂伤害'); set('shatter_damage', '碎裂伤害');
set('Cooler', v('item_TypeCooler') || '冷却器');
set('Shield', v('item_TypeShield') || '护盾生成器');
set('Jump Drive', v('ui_inventory_filter_category_name_vehicle_jumpdrive,P') || '跳跃模块');
set('Quantum Drive', v('item_TypeQuantumDrive') || '量子驱动器');
set('Power', v('item_SubTypePower') || '电源');
set('Main Powerplant', v('port_NamePowerplant') || '发电机');
set('Missile Rack', v('item_SubTypeMissileRack') || '导弹架');
set('MissileRack', map['Missile Rack']);
set('Missile', v('item_SubTypeMissile') || '导弹');
set('Module', '模组');
set('Mining Module', v('item_TypeMiningModifier') || '采矿模组');
set('Mining Module (Active)', '采矿模组（激活）');
set('Mining Module (Passive)', '采矿模组（被动）');
set('Mining.Module', map['Mining Module']);
set('Torpedo', '鱼雷');
set('Ground Vehicle Missile', '地面载具导弹'); set('GroundVehicleMissile', '地面载具导弹');
set('Mid Range Radar', '中距雷达'); set('MidRangeRadar', '中距雷达');
set('Ship.Weapon.Gun', v('item_TypeWeaponGun') || '舰炮');
set('Ship.Weapon.Rocket', v('item_SubTypeRocket') || '火箭');
set('Ship.Weapon.NoseMounted', v('item_SubTypeNoseMounted') || '机头舰炮');
set('Ship.Mining.Gun', v('item_TypeWeaponMining') || '采矿激光器');
set('Ship.Missile.Missile', map.Missile);
set('Ship.Missile.Rocket', map.Rocket);
set('Ship.Missile.Torpedo', '鱼雷');
set('Ship.Missile.GroundVehicleMissile', '地面载具导弹');
set('Ship.MissileLauncher.MissileRack', map['Missile Rack']);
set('Ship.Cooler', map.Cooler);
set('Ship.Shield', map.Shield);
set('Ship.Radar.MidRangeRadar', map['Mid Range Radar']);
set('Ship.PowerPlant.Power', v('item_TypePowerPlant') || '发电机');
set('Ship.QuantumDrive', map['Quantum Drive']);
set('Ship.JumpDrive', map['Jump Drive']);
set('Nose Mounted', map['Ship.Weapon.NoseMounted']);
set('NoseMounted', map['Ship.Weapon.NoseMounted']);
set('Gun', map['Ship.Weapon.Gun']);
set('Rocket', map.Rocket);
set('ElectricArc', '电弧');
set('collectionbeam', '采集光束'); set('CollectionBeam', '采集光束');
const wp = { Ballistic:'实弹', Laser:'激光', Distortion:'畸变', Plasma:'电浆', Neutron:'中子', Tachyon:'快子', 'Mass Driver':'电磁', Gatling:'加特林', Repeater:'速射炮', Cannon:'加农炮', Scattergun:'霰弹炮', ScatterGun:'霰弹炮', Beam:'光束炮', Turret:'炮塔', Gun:'舰炮', Pod:'巢', 'Mining Laser':'采矿激光', 'Rocket Pod':'火箭巢', 'Mass Driver Cannon':'电磁加农炮' };
Object.entries(wp).forEach(([a,b]) => set(a,b));
function compose(en) {
    if (map[en]) return map[en];
    const suffixes = ['Mass Driver Cannon','Mining Laser','Rocket Pod','Scattergun','ScatterGun','Gatling','Repeater','Cannon','Beam','Turret','Gun','Pod'];
    for (const suf of suffixes) {
        const re = new RegExp('\\s*' + suf.replace(/ /g, '\\s+') + '(\\s|$|\\()');
        if (!re.test(en)) continue;
        const prefix = en.replace(re, '').trim();
        const pZh = wp[prefix] || map[prefix];
        const sZh = wp[suf] || map[suf];
        if (pZh && sZh) return pZh + sZh;
    }
    return null;
}
['Ballistic Gatling','Ballistic Repeater','Ballistic Cannon','Ballistic Scattergun','Laser Gatling','Laser Repeater','Laser Cannon','Laser Scattergun','Laser Beam','Distortion Cannon','Distortion Repeater','Distortion Scattergun','Plasma Cannon','Plasma Scattergun','Neutron Cannon','Neutron Repeater','Mass Driver Cannon','Tachyon Cannon','Mining Laser','Rocket Pod','Ballistic Gatling Turret','Ballistic Cannon Turret','Ballistic Gatling Gun','Laser Turret','Plasma Canon'].forEach(t => { const z = compose(t); if (z) set(t, z); });
const keys = Object.keys(map).sort((a,b)=>a.localeCompare(b,'en'));
const body = keys.map(k => '        ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k]) + ',').join('\n');
fs.writeFileSync(OUT, ['/** 由 frontend/build-wiki-scalar-zh.js 从汉化库生成 */','(function (global) {',"    'use strict';",'    global.WIKI_SCALAR_LOC = {', body, '    };','})(typeof window !== \'undefined\' ? window : global);',''].join('\n'), 'utf8');
console.log('Wrote', OUT, keys.length, 'entries');
