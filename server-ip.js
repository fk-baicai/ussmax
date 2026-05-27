/**
 * 服务器 IP / 状态页面（需登录）
 */
(function () {
    if (typeof document === 'undefined') return;

    var AUTH_KEY = 'ussHangzhouAuthSession';
    var pollTimer = null;

    var gateEl = document.getElementById('serverIpGate');
    var mainEl = document.getElementById('serverIpMain');
    var valueEl = document.getElementById('serverIpValue');
    var metaEl = document.getElementById('serverIpMeta');
    var detailsEl = document.getElementById('serverIpDetails');
    var errEl = document.getElementById('serverIpError');

    function loadSession() {
        try {
            var raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function isLoggedIn() {
        var sess = loadSession();
        return !!(sess && sess.token);
    }

    function showError(msg) {
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.classList.remove('is-hidden');
    }

    function hideError() {
        if (errEl) errEl.classList.add('is-hidden');
    }

    function formatUpdatedAt(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return '更新于 ' + d.toLocaleString('zh-CN', { hour12: false });
    }

    function formatPercent(n) {
        var v = Number(n);
        if (!isFinite(v)) return '—';
        return v.toFixed(1) + '%';
    }

    function formatBps(bps) {
        var n = Number(bps);
        if (!isFinite(n) || n < 0) return '—';
        if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB/s';
        if (n >= 1024) return (n / 1024).toFixed(1) + ' KB/s';
        return Math.round(n) + ' B/s';
    }

    function joinNames(list, fallback) {
        if (!list || !list.length) return fallback || '—';
        return list.join(' · ');
    }

    function buildDetailCard(title, value, hwName, subLines, opts) {
        opts = opts || {};
        var card = document.createElement('div');
        card.className = 'server-ip-detail-card';
        if (opts.type) card.setAttribute('data-type', opts.type);

        var head = document.createElement('div');
        head.className = 'server-ip-detail-head';

        var titleEl = document.createElement('span');
        titleEl.className = 'server-ip-detail-title';
        titleEl.textContent = title;

        var valueEl = document.createElement('span');
        valueEl.className = 'server-ip-detail-value';
        valueEl.textContent = value;

        head.appendChild(titleEl);
        head.appendChild(valueEl);
        card.appendChild(head);

        if (opts.percent != null && isFinite(Number(opts.percent))) {
            var meter = document.createElement('div');
            meter.className = 'server-ip-meter';
            var fill = document.createElement('span');
            fill.className = 'server-ip-meter-fill';
            fill.style.width = Math.min(100, Math.max(0, Number(opts.percent))) + '%';
            meter.appendChild(fill);
            card.appendChild(meter);
        }

        if (hwName) {
            var hwEl = document.createElement('span');
            hwEl.className = 'server-ip-hw-name';
            hwEl.textContent = hwName;
            card.appendChild(hwEl);
        }

        if (subLines && subLines.length) {
            subLines.forEach(function (line) {
                var sub = document.createElement('span');
                sub.className = 'server-ip-detail-sub';
                sub.textContent = line;
                card.appendChild(sub);
            });
        }

        return card;
    }

    function renderDetails(data) {
        if (!detailsEl) return;
        detailsEl.innerHTML = '';

        var metrics = (data && data.metrics) || {};
        var hw = (data && data.hardware) || {};

        if (!data || !data.ok || !data.ip) {
            detailsEl.hidden = true;
            return;
        }

        detailsEl.hidden = false;

        detailsEl.appendChild(
            buildDetailCard('CPU 占用', formatPercent(metrics.cpuPercent), hw.cpuName || '—', null, {
                type: 'cpu',
                percent: metrics.cpuPercent,
            })
        );
        detailsEl.appendChild(
            buildDetailCard('内存占用', formatPercent(metrics.memPercent), hw.memName || '—', null, {
                type: 'mem',
                percent: metrics.memPercent,
            })
        );
        detailsEl.appendChild(
            buildDetailCard(
                '硬盘传输',
                formatBps(metrics.diskReadBps) + ' ↓',
                joinNames(hw.diskNames, '—'),
                ['写入: ' + formatBps(metrics.diskWriteBps)],
                { type: 'disk' }
            )
        );
        detailsEl.appendChild(
            buildDetailCard(
                '网络传输',
                formatBps(metrics.netDownBps) + ' ↓',
                joinNames(hw.netNames, '—'),
                ['上行: ' + formatBps(metrics.netUpBps)],
                { type: 'net' }
            )
        );
    }

    function render(data) {
        if (!valueEl) return;
        if (data && data.ok && data.ip) {
            valueEl.textContent = data.ip;
            if (metaEl) {
                var parts = [];
                var updated = formatUpdatedAt(data.updatedAt);
                if (updated) parts.push(updated);
                metaEl.textContent = parts.join(' · ') || '已上报';
            }
            renderDetails(data);
            hideError();
        } else {
            valueEl.textContent = '—';
            if (metaEl) metaEl.textContent = '等待本机上报';
            renderDetails(null);
        }
    }

    function fetchServerIp() {
        if (!window.UssAuthApi) {
            showError('认证模块未加载');
            return Promise.resolve();
        }
        var sess = loadSession();
        if (!sess || !sess.token) return Promise.resolve();

        return window.UssAuthApi.getClientPublicIp(sess.token)
            .then(function (data) {
                render(data);
            })
            .catch(function (e) {
                render(null);
                showError(e.message || '加载失败');
            });
    }

    function syncView() {
        var loggedIn = isLoggedIn();
        if (gateEl) gateEl.hidden = loggedIn;
        if (mainEl) mainEl.hidden = !loggedIn;
        if (window.UssNavTools && typeof window.UssNavTools.refresh === 'function') {
            window.UssNavTools.refresh();
        }
        if (loggedIn) fetchServerIp();
    }

    function start() {
        syncView();
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(function () {
            if (isLoggedIn()) fetchServerIp();
        }, 30000);
    }

    window.addEventListener('storage', syncView);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
