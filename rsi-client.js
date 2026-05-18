/**
 * 在用户浏览器内请求 RSI 公民页并解析资料（走用户 IP，减轻服务器被 RSI 限流）。
 * 注册时的组织校验仍由后端 server 执行。
 */
(function (global) {
    'use strict';

    var RSI_ORIGIN =
        (typeof global.USS_RSI_ORIGIN === 'string' && global.USS_RSI_ORIGIN) ||
        'https://robertsspaceindustries.com';
    var CITIZEN_PATH = '/en/citizens/';
    var REQUIRED_ORG_HREF = (function () {
        var h = String(global.USS_RSI_REQUIRED_ORG_HREF || '/orgs/5000').trim();
        return h.indexOf('/') === 0 ? h : '/' + h;
    })();

    var RSI_META_LABELS = {
        enlisted: ['Enlisted', '入伍'],
        location: ['Location', '位置', '地点'],
        fluency: ['Fluency', '语言能力', '流利', '流利程度'],
    };

    function normalizeBlockText(s) {
        return String(s || '')
            .replace(/\s+/g, ' ')
            .replace(/\s*,\s*/g, ', ')
            .trim();
    }

    function resolveRsiUrl(src) {
        var s = String(src || '').trim();
        if (!s) return null;
        if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
        if (s.indexOf('//') === 0) return 'https:' + s;
        return RSI_ORIGIN + (s.indexOf('/') === 0 ? s : '/' + s);
    }

    function extractCitizenMeta(doc) {
        var rsiEnlisted = '';
        var rsiLocation = '';
        var rsiFluency = '';
        var rows = doc.querySelectorAll('.profile-content > .left-col:not(.profile) .inner p.entry');
        for (var i = 0; i < rows.length; i++) {
            var e = rows[i];
            var labEl = e.querySelector('span.label');
            var valEl = e.querySelector('strong.value');
            var lab = normalizeBlockText(labEl ? labEl.textContent : '');
            var val = normalizeBlockText(valEl ? valEl.textContent : '');
            if (!lab || !val) continue;
            if (RSI_META_LABELS.enlisted.indexOf(lab) !== -1) rsiEnlisted = val;
            else if (RSI_META_LABELS.location.indexOf(lab) !== -1) rsiLocation = val;
            else if (RSI_META_LABELS.fluency.indexOf(lab) !== -1) rsiFluency = val;
        }
        return { rsiEnlisted: rsiEnlisted, rsiLocation: rsiLocation, rsiFluency: rsiFluency };
    }

    function extractOrgFleetBlock(doc) {
        var empty = {
            rsiOrgName: null,
            rsiOrgHref: null,
            rsiOrgSid: null,
            rsiOrgLogoUrl: null,
            rsiOrgRoleLabel: null,
            rsiOrgRankSlots: 0,
        };
        var orgA = doc.querySelector('a.value[href="' + REQUIRED_ORG_HREF + '"]');
        if (!orgA) return empty;

        var rsiOrgName = normalizeBlockText(orgA.textContent);
        var href = String(orgA.getAttribute('href') || REQUIRED_ORG_HREF).trim();
        if (href.indexOf('/') !== 0) href = '/' + href;
        var rsiOrgHref = href;
        var m = href.match(/\/orgs\/([^/?#]+)/i);
        var rsiOrgSid = m ? m[1] : '';

        var rsiOrgLogoUrl = null;
        if (rsiOrgSid) {
            var imgs = doc.querySelectorAll('img[src*="' + rsiOrgSid + '"]');
            for (var ii = 0; ii < imgs.length; ii++) {
                var s = String(imgs[ii].getAttribute('src') || '');
                if (/logo|heap_infobox|infobox/i.test(s)) {
                    rsiOrgLogoUrl = resolveRsiUrl(s);
                    break;
                }
            }
        }
        if (!rsiOrgLogoUrl) {
            var heaps = doc.querySelectorAll('img[src*="heap_infobox"]');
            for (var hj = 0; hj < heaps.length; hj++) {
                var hs = String(heaps[hj].getAttribute('src') || '');
                if (!rsiOrgSid || hs.indexOf(rsiOrgSid) !== -1) {
                    rsiOrgLogoUrl = resolveRsiUrl(hs);
                    break;
                }
            }
        }

        var rsiOrgRankSlots = 0;
        var rsiOrgRoleLabel = '';
        var cur = orgA;
        var container = null;
        for (var depth = 0; depth < 28 && cur; depth++) {
            var par = cur.parentElement;
            if (!par) break;
            if (par.querySelector('div.ranking')) {
                container = par;
                break;
            }
            cur = par;
        }
        if (!container) {
            container =
                orgA.closest('.box-content') ||
                orgA.closest('.main') ||
                orgA.closest('.tab-content') ||
                orgA.closest('.profile-content') ||
                doc.body;
        }

        var ranking = container.querySelector('div.ranking');
        if (ranking) rsiOrgRankSlots = ranking.querySelectorAll('span.active').length;

        var entries = container.querySelectorAll('p.entry, .entry');
        for (var ei = 0; ei < entries.length; ei++) {
            var ent = entries[ei];
            var labN = normalizeBlockText(
                ent.querySelector('span.label') ? ent.querySelector('span.label').textContent : ''
            );
            if (!labN) continue;
            if (/organization\s+rank|组织.*职|舰队职务|职务/i.test(labN)) {
                var roleEl = ent.querySelector('strong.value');
                var t = roleEl ? roleEl.textContent.trim() : '';
                if (t) rsiOrgRoleLabel = t;
            }
        }

        if (!rsiOrgRoleLabel && container) {
            var vals = container.querySelectorAll('strong.value.data11');
            for (var vi = 0; vi < vals.length; vi++) {
                var vt = vals[vi].textContent.trim();
                if (!vt || vt === rsiOrgName) continue;
                if (/^\d+$/.test(vt)) continue;
                rsiOrgRoleLabel = vt;
                break;
            }
        }

        return {
            rsiOrgName: rsiOrgName || null,
            rsiOrgHref: rsiOrgHref,
            rsiOrgSid: rsiOrgSid || null,
            rsiOrgLogoUrl: rsiOrgLogoUrl,
            rsiOrgRoleLabel: rsiOrgRoleLabel || null,
            rsiOrgRankSlots: rsiOrgRankSlots,
        };
    }

    function extractProfileExtras(doc) {
        var info = doc.querySelector('.profile.left-col .info');
        var rsiProfileHandle = '';
        if (info) {
            var entries = info.querySelectorAll('p.entry');
            for (var i = 0; i < entries.length; i++) {
                var ent = entries[i];
                if (ent.querySelector('strong.value') && !ent.querySelector('span.label')) {
                    var hv = ent.querySelector('strong.value');
                    rsiProfileHandle = hv ? hv.textContent.trim() : '';
                    break;
                }
            }
            if (!rsiProfileHandle) {
                var firstVal = info.querySelector('p.entry strong.value');
                rsiProfileHandle = firstVal ? firstVal.textContent.trim() : '';
            }
        }

        var rsiRankIconUrl = null;
        var rsiRankLabel = '';
        if (info) {
            var rankEntries = info.querySelectorAll('p.entry');
            for (var ri = 0; ri < rankEntries.length; ri++) {
                var re = rankEntries[ri];
                if (!re.querySelector('span.icon img')) continue;
                var icon = re.querySelector('span.icon img');
                rsiRankIconUrl = resolveRsiUrl(icon.getAttribute('src'));
                var valSpan = re.querySelector('span.value');
                rsiRankLabel = valSpan ? valSpan.textContent.trim() : '';
                break;
            }
        }

        var meta = extractCitizenMeta(doc);
        var org = extractOrgFleetBlock(doc);
        return {
            rsiProfileHandle: rsiProfileHandle,
            rsiRankIconUrl: rsiRankIconUrl,
            rsiRankLabel: rsiRankLabel,
            rsiEnlisted: meta.rsiEnlisted,
            rsiLocation: meta.rsiLocation,
            rsiFluency: meta.rsiFluency,
            rsiOrgName: org.rsiOrgName,
            rsiOrgHref: org.rsiOrgHref,
            rsiOrgSid: org.rsiOrgSid,
            rsiOrgLogoUrl: org.rsiOrgLogoUrl,
            rsiOrgRoleLabel: org.rsiOrgRoleLabel,
            rsiOrgRankSlots: org.rsiOrgRankSlots,
        };
    }

    function isLikelyCitizenAvatarUrl(url) {
        var u = String(url || '').toLowerCase();
        if (!u || u.indexOf('data:') === 0) return false;
        if (/\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(u)) return true;
        return /\/media\/|citizen|avatar|thumb|profile|heap_infobox|cloudfront/i.test(u);
    }

    function collectCitizenAvatarCandidates(doc, normalizedHandle) {
        var seen = {};
        var out = [];
        function push(raw) {
            var url = resolveRsiUrl(raw);
            if (!url || seen[url] || !isLikelyCitizenAvatarUrl(url)) return;
            seen[url] = true;
            out.push(url);
        }
        var thumbSels = [
            '.profile.left-col .thumb img',
            '.left-col.profile .thumb img',
            '.profile .thumb img',
            '.citizen-profile .thumb img',
            '#citizen-profile .thumb img',
            '.profile.left-col img',
        ];
        for (var ti = 0; ti < thumbSels.length; ti++) {
            var img = doc.querySelector(thumbSels[ti]);
            if (!img) continue;
            push(img.getAttribute('src'));
            push(img.getAttribute('data-src'));
        }
        var metas = doc.querySelectorAll(
            'meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]'
        );
        for (var mi = 0; mi < metas.length; mi++) {
            push(metas[mi].getAttribute('content'));
        }
        var links = doc.querySelectorAll('link[rel="image_src"]');
        for (var li = 0; li < links.length; li++) {
            push(links[li].getAttribute('href'));
        }
        var imgs = doc.querySelectorAll('img[src*="citizen"], img[src*="/media/"], img[data-src*="citizen"]');
        for (var ii = 0; ii < imgs.length; ii++) {
            push(imgs[ii].getAttribute('src'));
            push(imgs[ii].getAttribute('data-src'));
        }
        var scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (var si = 0; si < scripts.length; si++) {
            try {
                var data = JSON.parse(scripts[si].textContent || '');
                var stack = Array.isArray(data) ? data.slice() : [data];
                while (stack.length) {
                    var node = stack.pop();
                    if (!node || typeof node !== 'object') continue;
                    if (typeof node.image === 'string') push(node.image);
                    else if (node.image && node.image.url) push(node.image.url);
                    for (var k in node) {
                        if (node.hasOwnProperty(k) && node[k] && typeof node[k] === 'object') {
                            stack.push(node[k]);
                        }
                    }
                }
            } catch (eJson) {
                /* ignore */
            }
        }
        var handle = String(normalizedHandle || '').trim().toLowerCase();
        if (handle && doc.documentElement && doc.documentElement.innerHTML) {
            var re = /https?:\/\/[^"'\\\s]+/gi;
            var m;
            var html = doc.documentElement.innerHTML;
            while ((m = re.exec(html))) {
                var u = m[0];
                if (!/citizen|\/media\/|avatar|thumb/i.test(u)) continue;
                if (u.toLowerCase().indexOf(handle) < 0 && !/heap_infobox|profile|thumb/i.test(u)) continue;
                push(u);
            }
        }
        return out;
    }

    function parseCitizenAvatarUrl(doc, normalizedHandle) {
        var list = collectCitizenAvatarCandidates(doc, normalizedHandle);
        return list.length ? list[0] : null;
    }

    function parseCitizenHtml(html, normalizedHandle) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var handle =
            normalizedHandle ||
            (doc.querySelector('.profile.left-col .info strong.value') &&
                doc.querySelector('.profile.left-col .info strong.value').textContent.trim().toLowerCase()) ||
            '';
        var citizenAvatarUrls = collectCitizenAvatarCandidates(doc, handle);
        var citizenAvatarUrl = citizenAvatarUrls.length ? citizenAvatarUrls[0] : null;
        var extras = extractProfileExtras(doc);
        return {
            citizenAvatarUrl: citizenAvatarUrl,
            citizenAvatarUrls: citizenAvatarUrls,
            rsiProfileHandle: extras.rsiProfileHandle,
            rsiRankIconUrl: extras.rsiRankIconUrl,
            rsiRankLabel: extras.rsiRankLabel,
            rsiEnlisted: extras.rsiEnlisted || null,
            rsiLocation: extras.rsiLocation || null,
            rsiFluency: extras.rsiFluency || null,
            rsiOrgName: extras.rsiOrgName,
            rsiOrgHref: extras.rsiOrgHref,
            rsiOrgSid: extras.rsiOrgSid,
            rsiOrgLogoUrl: extras.rsiOrgLogoUrl,
            rsiOrgRoleLabel: extras.rsiOrgRoleLabel,
            rsiOrgRankSlots: extras.rsiOrgRankSlots,
        };
    }

    async function loadCitizenHtml(handle) {
        var normalized = String(handle || '')
            .trim()
            .toLowerCase();
        if (!/^[a-z0-9_-]{2,60}$/.test(normalized)) {
            throw new Error('绑定 ID 无效');
        }
        var pageUrl = RSI_ORIGIN + CITIZEN_PATH + encodeURIComponent(normalized);
        var res;
        try {
            res = await fetch(pageUrl, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                redirect: 'follow',
                headers: {
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
        } catch (e) {
            var err = new Error(
                '无法从本浏览器访问 RSI 公民页（可能被跨域策略拦截）。请确认能直接打开 RSI 官网，或稍后再试。'
            );
            err.cause = e;
            throw err;
        }
        if (res.status === 404) {
            throw new Error('未找到该绑定 ID 对应的 RSI 公民页。');
        }
        if (!res.ok) {
            throw new Error('RSI 页面暂时不可用（HTTP ' + res.status + '）。');
        }
        return res.text();
    }

    async function scrapeCitizenPublicProfile(handle) {
        var normalized = String(handle || '')
            .trim()
            .toLowerCase();
        var html = await loadCitizenHtml(normalized);
        return parseCitizenHtml(html, normalized);
    }

    global.UssRsiClient = {
        RSI_ORIGIN: RSI_ORIGIN,
        REQUIRED_ORG_HREF: REQUIRED_ORG_HREF,
        scrapeCitizenPublicProfile: scrapeCitizenPublicProfile,
        parseCitizenHtml: parseCitizenHtml,
    };
})(typeof window !== 'undefined' ? window : globalThis);
