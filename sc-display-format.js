/**
 * 全站数值展示：统一保留两位小数（zh-CN）
 * 列表 / 详情 / 蓝图制造等页面共用
 */
(function (global) {
    'use strict';

    function formatFixedDecimal2(v) {
        if (v == null || v === '' || !Number.isFinite(Number(v))) return null;
        return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatDisplayNumber(v, suffix) {
        var hit = formatFixedDecimal2(v);
        if (hit == null) return '—';
        return suffix ? hit + suffix : hit;
    }

    function formatDisplayMass(v) {
        return formatDisplayNumber(v, ' kg');
    }

    function formatDisplayPrice(v) {
        return formatDisplayNumber(v, ' aUEC');
    }

    function formatDisplaySpeed(v) {
        return formatDisplayNumber(v, ' m/s');
    }

    /** raw volume（µSCU 等原始单位）→ SCU，两位小数 */
    function formatDisplayVolumeScuFromRaw(v) {
        if (v == null || !Number.isFinite(Number(v))) return '—';
        return formatDisplayNumber(Number(v) / 1000000, ' SCU');
    }

    /** 已是 SCU 单位 */
    function formatDisplayScu(v) {
        return formatDisplayNumber(v, ' SCU');
    }

    function formatDisplayPercentFromFraction(v, opts) {
        if (v == null || !Number.isFinite(Number(v))) return null;
        var n = Number(v);
        if (!opts || !opts.allowZero) {
            if (n === 0) return null;
        }
        return formatFixedDecimal2(n * 100) + '%';
    }

    function roundDisplay2(v) {
        var n = Number(v);
        if (!Number.isFinite(n)) return null;
        return Math.round(n * 100) / 100;
    }

    global.ScDisplayFormat = {
        formatFixedDecimal2: formatFixedDecimal2,
        formatDisplayNumber: formatDisplayNumber,
        formatDisplayMass: formatDisplayMass,
        formatDisplayPrice: formatDisplayPrice,
        formatDisplaySpeed: formatDisplaySpeed,
        formatDisplayVolumeScuFromRaw: formatDisplayVolumeScuFromRaw,
        formatDisplayScu: formatDisplayScu,
        formatDisplayPercentFromFraction: formatDisplayPercentFromFraction,
        roundDisplay2: roundDisplay2,
    };
})(typeof window !== 'undefined' ? window : global);
