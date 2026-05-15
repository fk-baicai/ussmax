/**
 * 认证 API 根地址（先于 auth-api.js 执行）。
 * - localhost / 127.0.0.1 / file://：默认连本机 backend（127.0.0.1:3789）
 * - 其他域名（如 GitHub Pages）：默认连公网后端 http://8.138.237.183:3789
 * 如需强制地址，可在载入本文件之前执行：window.USS_AUTH_API_BASE = 'https://...';
 *
 * 注意：GitHub Pages 站点为 HTTPS 时，浏览器会阻止页面去请求普通的 http:// API（混合内容）。
 * 届时请为后端配置 HTTPS（例如服务器前加 Nginx/Caddy 证书），并把上面公网地址改为 https://你的域名。
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
    window.USS_AUTH_API_BASE = isLocal ? 'http://127.0.0.1:3789' : 'http://8.138.237.183:3789';
})();
