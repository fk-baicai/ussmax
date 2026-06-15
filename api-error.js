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
        if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
            return 'NET_E' + String(httpStatus);
        }
        if (fallbackCode) return String(fallbackCode);
        if (httpStatus === 401) return 'AUTH_S001';
        if (httpStatus === 403) return 'ADM_001';
        if (httpStatus === 404) return 'RES_404';
        if (httpStatus === 429) return 'RATE_001';
        if (httpStatus >= 500) return 'SRV_001';
        if (httpStatus >= 400) return 'VAL_001';
        return DEFAULT_CODE;
    }

    var REGISTER_HINTS = {
        AUTH_R001: '请填写绑定 ID、邮箱和密码。',
        AUTH_R002: '密码至少需要 6 位。',
        AUTH_R003: '请填写有效的邮箱地址。',
        AUTH_R004: '该邮箱已在站点注册，请直接登录；或使用其他邮箱注册。',
        AUTH_R005: '该绑定 ID 已被其他账号使用，请更换或联系管理员。',
        AUTH_R006: '注册未通过 RSI 校验，请确认绑定 ID 正确、已加入指定组织，且公民页可正常打开。',
        AUTH_R007: '无法获取 RSI 头像，请稍后重试或联系管理员。',
        AUTH_R008: '绑定 ID 格式无效，请填写正确的 RSI Handle。',
        RSI_E001: 'RSI 资料校验失败，请确认已加入指定组织且公民页资料完整。',
        RSI_CF001: '服务端暂时无法访问 RSI 公民页，请稍后重试。',
        SRV_001: '服务器繁忙，请稍后重试。',
        NET_E001: '网络异常，请检查网络后重试。',
        NET_E502: '注册请求超时（网关等待过久）。若邮箱已能登录说明注册已成功，请直接登录；否则请稍后重试。',
        NET_E503: '服务暂时不可用，请稍后重试。',
        NET_E504: '注册请求超时，请稍后重试；若邮箱已能登录请直接登录。',
        REG_P001: '注册仍在处理中但等待超时，请稍后在登录页尝试；若已能登录说明注册已成功。',
        REG_P002: '注册任务已过期，请重新提交注册。',
    };

    var FORGOT_PW_HINTS = {
        AUTH_P007: '邮件服务未配置，请联系管理员。',
        AUTH_P008: '验证码邮件发送失败，请稍后重试或联系管理员。',
        AUTH_P009: '发送过于频繁，请稍后再试。',
        AUTH_P001: '请填写有效的注册邮箱。',
        AUTH_P002: '请输入 6 位数字验证码。',
        AUTH_P005: '验证码不正确或已过期，请重新获取。',
        NET_E503: '服务暂时不可用，请稍后重试。',
    };

    function forgotPasswordHintForCode(code) {
        var c = String(code || '').trim();
        return FORGOT_PW_HINTS[c] || '';
    }

    /** 用户可见文案（仅错误码） */
    function formatUserError(code) {
        var c = String(code || DEFAULT_CODE).trim() || DEFAULT_CODE;
        return '错误代码：' + c;
    }

    function registerHintForCode(code) {
        var c = String(code || '').trim();
        return REGISTER_HINTS[c] || '';
    }

    function createApiError(httpStatus, data, fallbackCode) {
        var code = pickCode(data, httpStatus, fallbackCode);
        var err = new Error(formatUserError(code));
        err.code = code;
        err.httpStatus = httpStatus;
        if (data && typeof data === 'object') {
            if (data.cooldownSec != null) err.cooldownSec = data.cooldownSec;
            if (data.canChangeAt != null) err.canChangeAt = data.canChangeAt;
            if (data.action != null) err.action = data.action;
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
        registerHintForCode: registerHintForCode,
        forgotPasswordHintForCode: forgotPasswordHintForCode,
        createApiError: createApiError,
        sanitizeUserMessage: sanitizeUserMessage,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.UssApiError = api;
})(typeof window !== 'undefined' ? window : global);
