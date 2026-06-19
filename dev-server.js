/**
 * 本地前端开发服务器：静态文件 + 反代 backend 资源（与 netlify.toml 一致）
 * 用法：node dev-server.js
 * 访问：http://127.0.0.1:8080 或 http://localhost:8080
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const API_TARGET = String(process.env.USS_API_TARGET || 'http://127.0.0.1:3789').replace(/\/$/, '');

/** 与生产 Netlify 反代一致：头像、社区图、验证码等由 backend 提供 */
const BACKEND_PROXY_PREFIXES = ['/api/', '/avatars/', '/community-uploads/', '/captcha/'];

function shouldProxyToBackend(url) {
    if (!url) return false;
    const pathOnly = String(url).split('?')[0];
    for (let i = 0; i < BACKEND_PROXY_PREFIXES.length; i++) {
        if (pathOnly.indexOf(BACKEND_PROXY_PREFIXES[i]) === 0) return true;
    }
    return false;
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
};

function safePath(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const rel = decoded.replace(/^\/+/, '');
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT)) return null;
    return filePath;
}

function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}

function proxyApi(req, res) {
    let target;
    try {
        target = new URL(req.url, API_TARGET + '/');
    } catch (e) {
        return sendJson(res, 400, { ok: false, message: '无效 API 路径' });
    }

    const headers = Object.assign({}, req.headers, {
        host: target.host,
    });
    delete headers.connection;

    const proxyReq = http.request(
        {
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: target.pathname + target.search,
            method: req.method,
            headers: headers,
        },
        function (proxyRes) {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
        }
    );

    proxyReq.on('error', function (err) {
        sendJson(res, 502, {
            ok: false,
            code: 'DEV_PROXY_001',
            message:
                '无法连接 backend（' +
                API_TARGET +
                '），请先启动 backend：cd backend && npm start',
            detail: err && err.message,
        });
    });

    req.pipe(proxyReq);
}

function serveStatic(req, res) {
    const pathname = String(req.url || '/').split('?')[0] || '/';
    let urlPath = pathname === '/' ? '/index.html' : pathname;
    let filePath = safePath(urlPath);

    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        if (!pathname.includes('.')) {
            const htmlFallback = path.join(ROOT, pathname.replace(/^\//, '') + '.html');
            if (fs.existsSync(htmlFallback) && fs.statSync(htmlFallback).isFile()) {
                filePath = htmlFallback;
            }
        }
    }

    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(function (req, res) {
    if (shouldProxyToBackend(req.url)) {
        return proxyApi(req, res);
    }
    return serveStatic(req, res);
});

server.listen(PORT, HOST, function () {
    console.log('[dev-server] frontend  http://127.0.0.1:' + PORT);
    console.log('[dev-server] 反代 → ' + API_TARGET + '（/api、/avatars、/community-uploads、/captcha）');
});
