/**
 * 认证 API 根地址（先于 auth-api.js 执行）。
 * - localhost / 127.0.0.1 / file://：连本机 backend（127.0.0.1:3789）
 * - Netlify（*.netlify.app、ussxc.org 等）：用当前站点 origin，由 netlify.toml 反代 /api → 阿里云 3789
 * - 其它静态托管：http://8.138.237.183:3789（仅 HTTP 预览；HTTPS 站点勿用，会被浏览器拦截）
 * 强制地址：在载入本文件前设置 window.USS_AUTH_API_BASE = 'https://...'
 */
(function () {
    if (typeof window === 'undefined') return;
    if (window.USS_AUTH_API_BASE) return;

    var h = (window.location && window.location.hostname) || '';
    var isLocal =
        h === 'localhost' ||
        h === '127.0.0.1' ||
        /^127\.\d+\.\d+\.\d+$/.test(h) ||
        (window.location && window.location.protocol === 'file:');
    if (isLocal) {
        window.USS_AUTH_API_BASE = 'http://127.0.0.1:3789';
        return;
    }

    /** 与 frontend/netlify.toml 反代配套：这些域名走同源 /api，避免 HTTPS 页面请求 http://IP 被拦截 */
    var NETLIFY_PROXY_HOSTS = ['ussxc.org', 'www.ussxc.org'];
    var isNetlifyProxy =
        /\.netlify\.app$/i.test(h) ||
        NETLIFY_PROXY_HOSTS.indexOf(h.toLowerCase()) !== -1 ||
        window.USS_AUTH_SAME_ORIGIN === true ||
        window.USS_AUTH_SAME_ORIGIN === 1;

    if (isNetlifyProxy) {
        window.USS_AUTH_API_BASE = String(window.location.origin || '').replace(/\/$/, '');
        return;
    }

    window.USS_AUTH_API_BASE = 'http://8.138.237.183:3789';
})();

/** 与后端 RSI_REQUIRED_ORG_HREF 一致，供浏览器端解析公民页组织块 */
(function () {
    if (typeof window === 'undefined') return;
    if (!window.USS_RSI_ORIGIN) {
        window.USS_RSI_ORIGIN = 'https://robertsspaceindustries.com';
    }
    if (!window.USS_RSI_REQUIRED_ORG_HREF) {
        window.USS_RSI_REQUIRED_ORG_HREF = '/orgs/5000';
    }
    if (!window.USS_DEFAULT_AVATAR) {
        window.USS_DEFAULT_AVATAR = 'default-avatar.png';
    }
})();
