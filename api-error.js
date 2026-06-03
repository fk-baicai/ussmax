/**
 * 前端 API 错误脱敏：用户仅看到「错误代码：XXX」，不展示服务端 message。
 */
(function (global) {
    'use strict';

    var DEFAULT_CODE = 'NET_E001';

    function pickCode(data, httpStatus, fallbackCode) {
        if (data && typeof data.code === 'string' && data.code.trim()) {
            return data.code.trim();
        }
        if (fallbackCode) return String(fallbackCode);
        if (httpStatus === 401) return 'AUTH_S001';
        if (httpStatus === 403) return 'ADM_001';
        if (httpStatus === 404) return 'RES_404';
        if (httpStatus === 429) return 'RATE_001';
        if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
            return 'NET_E' + String(httpStatus);
        }
        if (httpStatus >= 500) return 'SRV_001';
        if (httpStatus >= 400) return 'VAL_001';
        return DEFAULT_CODE;
    }

    /** 用户可见文案（仅错误码） */
    function formatUserError(code) {
        var c = String(code || DEFAULT_CODE).trim() || DEFAULT_CODE;
        return '错误代码：' + c;
    }

    function createApiError(httpStatus, data, fallbackCode) {
        var code = pickCode(data, httpStatus, fallbackCode);
        var err = new Error(formatUserError(code));
        err.code = code;
        err.httpStatus = httpStatus;
        if (data && typeof data === 'object') {
            if (data.cooldownSec != null) err.cooldownSec = data.cooldownSec;
            if (data.canChangeAt != null) err.canChangeAt = data.canChangeAt;
        }
        return err;
    }

    /** 从 Error / 字符串中提取仅错误码展示（兼容旧 message） */
    function sanitizeUserMessage(input) {
        if (input == null) return formatUserError(DEFAULT_CODE);
        if (typeof input === 'object' && input.code) {
            return formatUserError(input.code);
        }
        if (typeof input === 'object' && input.message) {
            return sanitizeUserMessage(input.message);
        }
        var s = String(input).trim();
        if (!s) return formatUserError(DEFAULT_CODE);
        var m = s.match(/^错误代码：([A-Z0-9_]+)$/);
        if (m) return s;
        if (/^[A-Z][A-Z0-9_]{2,}$/.test(s)) return formatUserError(s);
        return formatUserError(DEFAULT_CODE);
    }

    var api = {
        DEFAULT_CODE: DEFAULT_CODE,
        pickCode: pickCode,
        formatUserError: formatUserError,
        createApiError: createApiError,
        sanitizeUserMessage: sanitizeUserMessage,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.UssApiError = api;
})(typeof window !== 'undefined' ? window : global);
