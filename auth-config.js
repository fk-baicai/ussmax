/**
 * 认证 API 根地址（先于 auth-api.js 执行）。
 * - localhost / 127.0.0.1 / file://：连本机 backend（127.0.0.1:3789）
 * - 生产站点（ussxc.org / Netlify）：默认直连 https://api.ussxc.org（Cloudflare 灰云 → 阿里云 Nginx）
 * - 覆盖：window.USS_API_DIRECT_BASE = '' 可退回同源 Netlify 反代；window.USS_AUTH_API_BASE 强制指定
 */
(function () {
    if (typeof window === 'undefined') return;
    if (window.USS_AUTH_API_BASE) return;

    var h = (window.location && window.location.hostname) || '';
    var PRODUCTION_SITE_HOSTS = ['ussxc.org', 'www.ussxc.org'];
    var DEFAULT_API_DIRECT = 'https://api.ussxc.org';

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

    if (window.USS_API_DIRECT_BASE === undefined && isProductionSite) {
        window.USS_API_DIRECT_BASE = DEFAULT_API_DIRECT;
    }

    var directBase = window.USS_API_DIRECT_BASE;
    if (directBase && /^https:\/\//i.test(String(directBase))) {
        window.USS_AUTH_API_BASE = String(directBase).replace(/\/$/, '');
        return;
    }

    if (isProductionSite) {
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
