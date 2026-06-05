/**
 * 认证 API 根地址（先于 auth-api.js 执行）。
 * - localhost / 127.0.0.1 / file://：连本机 backend（127.0.0.1:3789）
 * - 生产站点（ussxc.org / Netlify）：默认同源 /api（Netlify 反代 → 阿里云）
 * - 可选直连：window.USS_API_DIRECT_BASE = 'https://api.ussxc.org'（须 DNS + HTTPS 就绪）
 */
(function () {
    if (typeof window === 'undefined') return;
    if (window.USS_AUTH_API_BASE) return;

    var h = (window.location && window.location.hostname) || '';
    var PRODUCTION_SITE_HOSTS = ['ussxc.org', 'www.ussxc.org'];

    var isLocal =
        h === 'localhost' ||
        h === '127.0.0.1' ||
        /^127\.\d+\.\d+\.\d+$/.test(h) ||
        (window.location && window.location.protocol === 'file:');

    var isProductionSite =
        /\.netlify\.app$/i.test(h) ||
        PRODUCTION_SITE_HOSTS.indexOf(h.toLowerCase()) !== -1 ||
        window.USS_AUTH_SAME_ORIGIN === true ||
        window.USS_AUTH_SAME_ORIGIN === 1;

    if (isLocal) {
        window.USS_AUTH_API_BASE = 'http://127.0.0.1:3789';
        return;
    }

    /** 仅当显式设置 USS_API_DIRECT_BASE 时才直连 api 子域名（须 Cloudflare 有 api 记录 + 服务器 HTTPS） */
    var directBase = window.USS_API_DIRECT_BASE;
    if (directBase && /^https:\/\//i.test(String(directBase))) {
        window.USS_AUTH_API_BASE = String(directBase).replace(/\/$/, '');
        return;
    }

    if (isProductionSite) {
        /** 登录/签到等走同源 /api（Netlify 反代 → 阿里云），须保证可用 */
        window.USS_AUTH_API_BASE = String(window.location.origin || '').replace(/\/$/, '');
        /**
         * 注册可选直连 api 子域（Nginx 120s，避免 Netlify 反代约 26s 超时）。
         * 须 DNS 已解析 api.ussxc.org；未配置时 register() 会自动回退同源 /api。
         */
        if (!window.USS_REGISTER_API_BASE) {
            window.USS_REGISTER_API_BASE = 'https://api.ussxc.org';
        }
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
    if (!window.USS_HONGHOU_AVATAR) {
        window.USS_HONGHOU_AVATAR = '/avatars/honghou.jpg';
    }
})();

/** 尽早建立 API / RSI 连接，缩短首屏后的 /api/me 等请求 */
(function () {
    if (typeof document === 'undefined' || !document.head) return;
    var origins = [];
    var apiBase = window.USS_AUTH_API_BASE;
    if (apiBase && /^https?:\/\//i.test(String(apiBase))) {
        try {
            var apiOrigin = new URL(String(apiBase)).origin;
            if (!window.location || apiOrigin !== window.location.origin) {
                origins.push({ href: apiOrigin, rel: 'preconnect' });
            }
        } catch (e) {
            /* ignore */
        }
    }
    if (window.USS_RSI_ORIGIN) {
        origins.push({
            href: String(window.USS_RSI_ORIGIN).replace(/\/$/, ''),
            rel: 'dns-prefetch',
        });
    }
    origins.forEach(function (item) {
        if (!item.href || document.querySelector('link[data-uss-preconnect="' + item.href + '"]')) return;
        var link = document.createElement('link');
        link.rel = item.rel || 'preconnect';
        if (link.rel === 'preconnect') link.crossOrigin = 'anonymous';
        link.href = item.href;
        link.setAttribute('data-uss-preconnect', item.href);
        document.head.appendChild(link);
    });
})();
