(function () {
    'use strict';

    /**
     * 分部页：?unit= 或 #unit= 指定分部；数据为当前分部维度。
     */
    var AUTH_SESSION_KEY = 'ussHangzhouAuthSession';
    var VALID_UNITS = { hq: true, squad1: true, uss: true, ussprod: true };
    var UNIT_TITLES = {
        hq: '总部',
        squad1: '一中队',
        uss: 'USS创伤舰队',
        ussprod: 'USS生产队',
    };

    function readUnitFromLocation() {
        try {
            var p = new URLSearchParams(window.location.search || '');
            var u = String(p.get('unit') || p.get('branch') || '').trim().toLowerCase();
            if (VALID_UNITS[u]) return u;
        } catch (e0) {
            /* ignore */
        }
        try {
            var raw = (window.location.hash || '').replace(/^#/, '');
            if (!raw) return '';
            if (raw.indexOf('=') >= 0) {
                var q = raw.charAt(0) === '?' ? raw.slice(1) : raw;
                var p2 = new URLSearchParams(q);
                var u2 = String(p2.get('unit') || p2.get('branch') || '').trim().toLowerCase();
                if (VALID_UNITS[u2]) return u2;
            } else {
                var plain = raw.trim().toLowerCase();
                if (VALID_UNITS[plain]) return plain;
            }
        } catch (e1) {
            /* ignore */
        }
        return '';
    }

    /** 每次进入页由 init 赋值；支持 ?unit= 与 #unit= */
    var UNIT = '';

    var myHistoryDatesCache = [];
    var myHistoryEmptyMsg = '';
    var historyViewYM = null;
    var historyMonthDropdownDocListeners = false;
    var lastCheckinWindowMsg = '';

    function loadAuthSession() {
        try {
            var raw = sessionStorage.getItem(AUTH_SESSION_KEY);
            if (raw) return JSON.parse(raw);
            raw = localStorage.getItem(AUTH_SESSION_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            return null;
        }
        return null;
    }

    function isLoggedIn() {
        var s = loadAuthSession();
        return !!(s && s.token);
    }

    function isLikelyNetworkError(msg) {
        if (!msg || typeof msg !== 'string') return false;
        var s = msg.toLowerCase();
        return (
            s.indexOf('fetch') !== -1 ||
            s.indexOf('failed') !== -1 ||
            s.indexOf('networkerror') !== -1 ||
            s.indexOf('load failed') !== -1
        );
    }

    function safeUserFacingMessage(msg) {
        if (msg == null || typeof msg !== 'string') return '操作失败，请稍后再试。';
        var t = msg.trim();
        if (!t) return '操作失败，请稍后再试。';
        if (/https?:\/\//i.test(t)) return '操作失败，请稍后再试或联系管理员。';
        if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(t)) return '操作失败，请稍后再试或联系管理员。';
        if (/:\d{2,5}\b/.test(t)) return '操作失败，请稍后再试或联系管理员。';
        return t;
    }

    function setPanelHidden(el, hidden) {
        if (!el) return;
        if (hidden) {
            el.setAttribute('hidden', '');
            el.style.display = 'none';
        } else {
            el.removeAttribute('hidden');
            el.style.display = 'block';
        }
    }

    function shanghaiDateKeyClient() {
        try {
            var parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).formatToParts(new Date());
            var y = parts.find(function (p) {
                return p.type === 'year';
            }).value;
            var m = parts.find(function (p) {
                return p.type === 'month';
            }).value;
            var day = parts.find(function (p) {
                return p.type === 'day';
            }).value;
            return y + '-' + m + '-' + day;
        } catch (e) {
            var d = new Date();
            return (
                d.getFullYear() +
                '-' +
                String(d.getMonth() + 1).padStart(2, '0') +
                '-' +
                String(d.getDate()).padStart(2, '0')
            );
        }
    }

    function shanghaiYearMonthClient() {
        try {
            var parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
            }).formatToParts(new Date());
            return {
                year: Number(
                    parts.find(function (p) {
                        return p.type === 'year';
                    }).value
                ),
                month: Number(
                    parts.find(function (p) {
                        return p.type === 'month';
                    }).value
                ),
            };
        } catch (e) {
            var d = new Date();
            return { year: d.getFullYear(), month: d.getMonth() + 1 };
        }
    }

    var CHECKIN_RANK_ICON_SVG =
        '<svg class="checkin-org-rank-svg" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M512 890.35c-51.06 0-100.62-10.01-147.28-29.75-45.06-19.06-85.52-46.33-120.25-81.07s-62.01-75.2-81.07-120.25c-19.74-46.67-29.75-96.22-29.75-147.28 0-71.37 19.98-140.89 57.79-201.05 36.76-58.5 88.74-105.84 150.32-136.92 15.37-7.76 34.13-1.58 41.89 13.79 7.76 15.37 1.58 34.13-13.79 41.89-51.46 25.97-94.89 65.53-125.62 114.42-31.55 50.21-48.23 108.26-48.23 167.87 0 84.4 32.87 163.76 92.55 223.44S427.6 827.99 512 827.99s163.76-32.87 223.44-92.55c59.68-59.68 92.55-139.04 92.55-223.44s-32.87-163.76-92.55-223.44C675.76 228.88 596.4 196.01 512 196.01c-17.22 0-31.18-13.96-31.18-31.18s13.96-31.18 31.18-31.18c51.06 0 100.62 10.01 147.28 29.75 45.06 19.06 85.52 46.33 120.25 81.07s62.01 75.2 81.07 120.25c19.74 46.67 29.75 96.22 29.75 147.28s-10.01 100.62-29.75 147.28c-19.06 45.06-46.33 85.52-81.07 120.25s-75.2 62.01-120.25 81.07c-46.66 19.74-96.22 29.75-147.28 29.75z"/>' +
        '<path d="M163.25 925.49c-19.55 0-35.3-5.9-47.07-17.67-8.53-8.53-18.52-24.21-17.67-50.47 0.5-15.45 4.55-32.95 12.36-53.5 13.73-36.13 38.74-80.38 74.32-131.53 9.84-14.14 29.27-17.62 43.4-7.79 14.14 9.83 17.62 29.27 7.79 43.4-73.56 105.76-76.13 145.9-75.38 155.08 8.71 0.71 45.41-1.6 140.27-65.28 81.02-54.39 176.51-135.21 268.88-227.58s173.2-187.86 227.59-268.88c63.68-94.86 65.99-131.55 65.28-140.27-9.23-0.75-49.94 1.86-157.45 77.06-14.11 9.87-33.55 6.43-43.42-7.68-9.87-14.11-6.43-33.55 7.68-43.42 51.74-36.19 96.52-61.66 133.09-75.71 20.76-7.98 38.43-12.13 54.02-12.71 26.52-0.99 42.31 9.06 50.9 17.65 19.81 19.81 22.98 50.87 9.43 92.33-10.11 30.93-29.65 68.89-58.07 112.83-56.61 87.53-143.6 191.55-244.94 292.9-101.35 101.35-205.37 188.33-292.9 244.94-43.95 28.42-81.91 47.96-112.83 58.07-16.84 5.49-31.94 8.23-45.28 8.23z"/>' +
        '</svg>';

    function rankIconsHtml(slots) {
        var c = Math.max(0, Math.min(20, Number(slots) || 0));
        if (c === 0) {
            return '<span class="checkin-today-ranks checkin-today-ranks--empty" title="无职阶图标">—</span>';
        }
        var parts = [];
        var k;
        for (k = 0; k < c; k++) {
            parts.push('<span class="checkin-rank-icon-slot">' + CHECKIN_RANK_ICON_SVG + '</span>');
        }
        return '<span class="checkin-today-ranks" title="职阶">' + parts.join('') + '</span>';
    }

    function shanghaiWeekdaySun0(year, month, day) {
        var pad = function (n, w) {
            return String(n).padStart(w, '0');
        };
        var s = pad(year, 4) + '-' + pad(month, 2) + '-' + pad(day, 2) + 'T12:00:00+08:00';
        var d = new Date(s);
        var wd = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Shanghai',
            weekday: 'short',
        }).format(d);
        var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        return map[wd] != null ? map[wd] : 0;
    }

    function daysInCalendarMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    function esc(t) {
        return String(t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function showAlert(message) {
        var modal = document.getElementById('checkinAlertModal');
        var msg = document.getElementById('checkinAlertMsg');
        if (msg) msg.textContent = message;
        if (modal) modal.style.display = 'block';
    }

    function closeAlert() {
        var modal = document.getElementById('checkinAlertModal');
        if (modal) modal.style.display = 'none';
    }

    function renderCalendar(year, month, signedSet, todayKey) {
        var weekRow = document.getElementById('checkinCalWeekRow');
        var grid = document.getElementById('checkinCalGrid');
        if (!weekRow || !grid) return;
        var y = Number(year);
        var m = Number(month);
        if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
            var ym = shanghaiYearMonthClient();
            y = ym.year;
            m = ym.month;
        }
        var labels = ['一', '二', '三', '四', '五', '六', '日'];
        weekRow.innerHTML = labels
            .map(function (t) {
                return '<span class="checkin-cal-wd">' + t + '</span>';
            })
            .join('');
        var sun0 = shanghaiWeekdaySun0(y, m, 1);
        var leading = (sun0 + 6) % 7;
        var dim = daysInCalendarMonth(y, m);
        var parts = String(todayKey || '').split('-').map(Number);
        var ty = parts[0];
        var tm = parts[1];
        var td = parts[2];
        var isThisMonth = ty === y && tm === m;
        var todayNum = isThisMonth ? td : -1;
        var cells = [];
        var i;
        for (i = 0; i < leading; i++) {
            cells.push('<span class="checkin-cal-cell checkin-cal-cell--pad"></span>');
        }
        for (var d = 1; d <= dim; d++) {
            var signed = signedSet.has(d);
            var cls = 'checkin-cal-cell';
            if (isThisMonth) {
                if (d < todayNum) {
                    cls += signed ? ' checkin-cal-cell--signed' : ' checkin-cal-cell--miss';
                } else if (d === todayNum) {
                    cls += signed
                        ? ' checkin-cal-cell--signed checkin-cal-cell--today'
                        : ' checkin-cal-cell--today checkin-cal-cell--pending';
                } else {
                    cls += ' checkin-cal-cell--future';
                }
            } else if (y < ty || (y === ty && m < tm)) {
                cls += signed ? ' checkin-cal-cell--signed' : ' checkin-cal-cell--miss';
            } else {
                cls += ' checkin-cal-cell--future';
            }
            var tip = signed ? '已签' : d === todayNum && isThisMonth ? '未签' : '';
            cells.push(
                '<span class="' +
                    cls +
                    '" title="' +
                    esc(tip) +
                    '"><span class="checkin-cal-daynum">' +
                    d +
                    '</span></span>'
            );
        }
        grid.innerHTML = cells.join('');
    }

    function sortTodayList(list) {
        if (!Array.isArray(list)) return [];
        return list.slice().sort(function (a, b) {
            var pa =
                typeof a.branchPoints === 'number' && !isNaN(a.branchPoints) ? a.branchPoints : 0;
            var pb =
                typeof b.branchPoints === 'number' && !isNaN(b.branchPoints) ? b.branchPoints : 0;
            if (pb !== pa) return pb - pa;
            var sa = typeof a.rsiOrgRankSlots === 'number' && !isNaN(a.rsiOrgRankSlots) ? a.rsiOrgRankSlots : 0;
            var sb = typeof b.rsiOrgRankSlots === 'number' && !isNaN(b.rsiOrgRankSlots) ? b.rsiOrgRankSlots : 0;
            if (sb !== sa) return sb - sa;
            var ida = a.bindingId != null ? String(a.bindingId) : '';
            var idb = b.bindingId != null ? String(b.bindingId) : '';
            return ida.localeCompare(idb, 'en');
        });
    }

    function renderTodayList(list) {
        var ul = document.getElementById('checkinTodayList');
        var cnt = document.getElementById('checkinTodayCount');
        if (cnt) cnt.textContent = String(Array.isArray(list) ? list.length : 0);
        if (!ul) return;
        if (!list || !list.length) {
            ul.innerHTML = '<li class="checkin-today-empty">暂无在本分部签到的成员</li>';
            return;
        }
        ul.innerHTML = list
            .map(function (row) {
                var id =
                    row.oopzDisplay ||
                    (row.oopzName && row.bindingId
                        ? String(row.oopzName) + '（' + String(row.bindingId) + '）'
                        : row.oopzName
                          ? String(row.oopzName)
                          : row.bindingId != null
                            ? String(row.bindingId)
                            : '—');
                var role =
                    row.rsiOrgRoleLabel != null && String(row.rsiOrgRoleLabel).trim() !== ''
                        ? String(row.rsiOrgRoleLabel).trim()
                        : '—';
                var metaInner = rankIconsHtml(row.rsiOrgRankSlots);
                var pts =
                    typeof row.branchPoints === 'number' && !isNaN(row.branchPoints)
                        ? row.branchPoints
                        : 0;
                return (
                    '<li class="checkin-today-row">' +
                    '<div class="checkin-today-left">' +
                    '<span class="checkin-today-id">' +
                    esc(id) +
                    '</span>' +
                    '<div class="checkin-today-meta">' +
                    metaInner +
                    '</div>' +
                    '</div>' +
                    '<div class="checkin-today-rightcol">' +
                    '<span class="checkin-today-duty">' +
                    esc(role) +
                    '</span>' +
                    '<span class="checkin-today-points">总积分 ' +
                    esc(String(pts)) +
                    '</span>' +
                    '</div>' +
                    '</li>'
                );
            })
            .join('');
    }

    function pad2History(n) {
        return String(n).padStart(2, '0');
    }

    function historyMonthKey(y, m) {
        return y + '-' + pad2History(m);
    }

    function shiftHistoryMonth(y, m, delta) {
        var d = new Date(y, m - 1 + delta, 1);
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }

    function historyYmAfterShanghaiNow(y, m) {
        var nowSh = shanghaiYearMonthClient();
        return y > nowSh.year || (y === nowSh.year && m > nowSh.month);
    }

    function setHistoryViewYm(y, m) {
        historyViewYM = { year: y, month: m };
        renderMyHistoryPanel();
    }

    function parseHistoryDateYm(s) {
        var m = String(s).match(/^(\d{4})-(\d{2})-/);
        if (!m) return null;
        return { year: Number(m[1]), month: Number(m[2]) };
    }

    function ymCompare(a, b) {
        if (a.year !== b.year) return a.year < b.year ? -1 : a.year > b.year ? 1 : 0;
        return a.month < b.month ? -1 : a.month > b.month ? 1 : 0;
    }

    function ymMin(a, b) {
        return ymCompare(a, b) <= 0 ? a : b;
    }

    function historyDropdownRange() {
        var nowSh = shanghaiYearMonthClient();
        var oldest = shiftHistoryMonth(nowSh.year, nowSh.month, -60);
        for (var i = 0; i < myHistoryDatesCache.length; i++) {
            var p = parseHistoryDateYm(myHistoryDatesCache[i]);
            if (p) oldest = ymMin(p, oldest);
        }
        if (ymCompare(oldest, nowSh) > 0) oldest = { year: nowSh.year, month: nowSh.month };
        return { oldest: oldest, newest: nowSh };
    }

    function buildMonthRowsNewestFirst(oldest, newest) {
        var rows = [];
        var y = newest.year;
        var mo = newest.month;
        for (var guard = 0; guard < 100; guard++) {
            rows.push({ year: y, month: mo });
            if (y === oldest.year && mo === oldest.month) break;
            var pv = shiftHistoryMonth(y, mo, -1);
            y = pv.year;
            mo = pv.month;
        }
        return rows;
    }

    function fillHistoryMonthDropdown() {
        var dd = document.getElementById('checkinHistoryMonthDropdown');
        if (!dd || !historyViewYM) return;
        var range = historyDropdownRange();
        var rows = buildMonthRowsNewestFirst(range.oldest, range.newest);
        var curY = historyViewYM.year;
        var curM = historyViewYM.month;
        dd.innerHTML = rows
            .map(function (r) {
                var sel = r.year === curY && r.month === curM;
                return (
                    '<button type="button" class="checkin-history-month-option' +
                    (sel ? ' is-selected' : '') +
                    '" role="option" data-y="' +
                    r.year +
                    '" data-m="' +
                    r.month +
                    '" aria-selected="' +
                    (sel ? 'true' : 'false') +
                    '">' +
                    esc(r.year + '年' + r.month + '月') +
                    '</button>'
                );
            })
            .join('');
    }

    function onDocPointerDownClose(e) {
        var strip = document.getElementById('checkinHistoryMonthStrip');
        var dd = document.getElementById('checkinHistoryMonthDropdown');
        var t = e.target;
        if (strip && strip.contains(t)) return;
        if (dd && dd.contains(t)) return;
        setHistoryMonthDropdownOpen(false);
    }

    function onDocKeydownEscape(e) {
        if (e.key === 'Escape') setHistoryMonthDropdownOpen(false);
    }

    function setHistoryMonthDropdownOpen(open) {
        var dd = document.getElementById('checkinHistoryMonthDropdown');
        var strip = document.getElementById('checkinHistoryMonthStrip');
        if (!dd) return;
        if (open) {
            fillHistoryMonthDropdown();
            dd.hidden = false;
            if (strip) strip.setAttribute('aria-expanded', 'true');
            if (!historyMonthDropdownDocListeners) {
                historyMonthDropdownDocListeners = true;
                document.addEventListener('pointerdown', onDocPointerDownClose, true);
                document.addEventListener('keydown', onDocKeydownEscape, true);
            }
            requestAnimationFrame(function () {
                var opt = dd.querySelector('.checkin-history-month-option.is-selected');
                if (opt) opt.scrollIntoView({ block: 'nearest' });
            });
        } else {
            dd.hidden = true;
            if (strip) strip.setAttribute('aria-expanded', 'false');
            if (historyMonthDropdownDocListeners) {
                historyMonthDropdownDocListeners = false;
                document.removeEventListener('pointerdown', onDocPointerDownClose, true);
                document.removeEventListener('keydown', onDocKeydownEscape, true);
            }
        }
    }

    function toggleHistoryMonthDropdown() {
        var dd = document.getElementById('checkinHistoryMonthDropdown');
        if (!dd) return;
        setHistoryMonthDropdownOpen(!!dd.hidden);
    }

    function setupMyHistoryMonthNav() {
        var strip = document.getElementById('checkinHistoryMonthStrip');
        var dd = document.getElementById('checkinHistoryMonthDropdown');
        if (!strip || strip.dataset.checkinHistoryNavBound === '1') return;
        strip.dataset.checkinHistoryNavBound = '1';

        var SWIPE_MIN = 44;
        var TAP_MAX = 16;
        var tracing = false;
        var pid = null;
        var startX = 0;
        var startY = 0;
        var captureEl = null;

        function endTrace(e) {
            if (!tracing || (e && e.pointerId !== pid)) return;
            tracing = false;
            if (captureEl) {
                try {
                    captureEl.releasePointerCapture(pid);
                } catch (err) {
                    /* ignore */
                }
                captureEl = null;
            }
            pid = null;
        }

        strip.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            tracing = true;
            pid = e.pointerId;
            captureEl = strip;
            startX = e.clientX;
            startY = e.clientY;
            try {
                strip.setPointerCapture(pid);
            } catch (err) {
                /* ignore */
            }
        });

        strip.addEventListener('pointerup', function (e) {
            if (!tracing || e.pointerId !== pid) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            endTrace(e);

            if (!historyViewYM) {
                var sh0 = shanghaiYearMonthClient();
                historyViewYM = { year: sh0.year, month: sh0.month };
            }
            var ym = historyViewYM;

            if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) >= Math.abs(dy) * 0.85) {
                if (dx < 0) {
                    var nx = shiftHistoryMonth(ym.year, ym.month, 1);
                    if (historyYmAfterShanghaiNow(nx.year, nx.month)) return;
                    setHistoryViewYm(nx.year, nx.month);
                } else {
                    var pv = shiftHistoryMonth(ym.year, ym.month, -1);
                    setHistoryViewYm(pv.year, pv.month);
                }
                return;
            }

            if (Math.abs(dx) < TAP_MAX && Math.abs(dy) < TAP_MAX) {
                toggleHistoryMonthDropdown();
            }
        });

        strip.addEventListener('pointercancel', function (e) {
            endTrace(e);
        });

        strip.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                setHistoryMonthDropdownOpen(false);
                return;
            }
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            if (!historyViewYM) {
                var shK = shanghaiYearMonthClient();
                historyViewYM = { year: shK.year, month: shK.month };
            }
            var ymk = historyViewYM;
            if (e.key === 'ArrowLeft') {
                var pvK = shiftHistoryMonth(ymk.year, ymk.month, -1);
                setHistoryViewYm(pvK.year, pvK.month);
            } else {
                var nxK = shiftHistoryMonth(ymk.year, ymk.month, 1);
                if (historyYmAfterShanghaiNow(nxK.year, nxK.month)) return;
                setHistoryViewYm(nxK.year, nxK.month);
            }
        });

        if (dd && dd.dataset.checkinHistoryDdBound !== '1') {
            dd.dataset.checkinHistoryDdBound = '1';
            dd.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest && e.target.closest('.checkin-history-month-option');
                if (!btn) return;
                var y = Number(btn.getAttribute('data-y'));
                var m = Number(btn.getAttribute('data-m'));
                if (isNaN(y) || isNaN(m)) return;
                setHistoryMonthDropdownOpen(false);
                setHistoryViewYm(y, m);
            });
        }
    }

    function renderMyHistoryPanel() {
        var strip = document.getElementById('checkinHistoryMonthStrip');
        var label = document.getElementById('checkinHistoryMonthLabel');
        var ul = document.getElementById('checkinMyHistoryList');
        if (!ul) return;

        setHistoryMonthDropdownOpen(false);

        if (!historyViewYM) {
            var sh0 = shanghaiYearMonthClient();
            historyViewYM = { year: sh0.year, month: sh0.month };
        }
        var ym = historyViewYM;
        var key = historyMonthKey(ym.year, ym.month);

        if (strip && label) {
            label.textContent = ym.year + '年' + ym.month + '月';
        }

        if (!myHistoryDatesCache.length) {
            ul.innerHTML =
                '<li class="checkin-today-empty">' +
                esc(myHistoryEmptyMsg || '暂无记录') +
                '</li>';
            return;
        }

        var filtered = myHistoryDatesCache.filter(function (d) {
            return String(d).indexOf(key + '-') === 0;
        });
        filtered.sort(function (a, b) {
            return a < b ? 1 : a > b ? -1 : 0;
        });
        if (!filtered.length) {
            ul.innerHTML = '<li class="checkin-today-empty">本月无签到记录</li>';
            return;
        }
        ul.innerHTML = filtered
            .map(function (d) {
                return '<li class="checkin-my-history-row">' + esc(String(d)) + '</li>';
            })
            .join('');
    }

    function renderMyHistory(dates, emptyMsg) {
        myHistoryDatesCache = Array.isArray(dates) ? dates.slice() : [];
        myHistoryEmptyMsg = emptyMsg != null ? String(emptyMsg) : '';

        var msg = myHistoryEmptyMsg;
        if (msg !== '加载中…' && msg !== '加载失败' && msg !== '请刷新页面。') {
            var sh = shanghaiYearMonthClient();
            historyViewYM = { year: sh.year, month: sh.month };
        } else if (!historyViewYM) {
            var sh2 = shanghaiYearMonthClient();
            historyViewYM = { year: sh2.year, month: sh2.month };
        }
        renderMyHistoryPanel();
    }

    function updateUnitStats(data) {
        var pe = document.getElementById('unitPoints');
        var se = document.getElementById('unitStreak');
        if (pe) pe.textContent = data && data.points != null ? String(data.points) : '0';
        if (se) se.textContent = data && data.streak != null ? String(data.streak) : '0';
    }

    function paintSkeleton() {
        var ym = shanghaiYearMonthClient();
        var today = shanghaiDateKeyClient();
        renderCalendar(ym.year, ym.month, new Set(), today);
        var ulSk = document.getElementById('checkinTodayList');
        var cntSk = document.getElementById('checkinTodayCount');
        if (cntSk) cntSk.textContent = '0';
        if (ulSk) ulSk.innerHTML = '<li class="checkin-today-empty">加载中…</li>';
        renderMyHistory([], '加载中…');
        updateUnitStats(null);
    }

    async function loadSummary() {
        if (!UNIT) return;
        var ym = shanghaiYearMonthClient();
        var today = shanghaiDateKeyClient();

        if (!isLoggedIn() || !window.UssAuthApi) {
            renderCalendar(ym.year, ym.month, new Set(), today);
            var ul0 = document.getElementById('checkinTodayList');
            if (ul0) {
                ul0.innerHTML = '<li class="checkin-today-empty">请刷新页面。</li>';
            }
            var cnt0 = document.getElementById('checkinTodayCount');
            if (cnt0) cnt0.textContent = '0';
            renderMyHistory([], '请刷新页面。');
            updateUnitStats(null);
            applyPrimaryBtnFromSummary(null);
            return;
        }

        var sess = loadAuthSession();
        if (!sess || !sess.token) {
            paintSkeleton();
            applyPrimaryBtnFromSummary(null);
            return;
        }

        try {
            var data = await window.UssAuthApi.checkinUnit(sess.token, UNIT, ym.year, ym.month);
            var signed = new Set(Array.isArray(data.signedDayNumbers) ? data.signedDayNumbers : []);
            var y = data.year != null ? Number(data.year) : ym.year;
            var mo = data.month != null ? Number(data.month) : ym.month;
            renderCalendar(y, mo, signed, data.today || today);
            var rankList = data.memberRanking || data.todayList || [];
            renderTodayList(sortTodayList(rankList));
            updateUnitStats(data);
            renderMyHistory(Array.isArray(data.myHistoryDates) ? data.myHistoryDates : []);
            applyPrimaryBtnFromSummary(data);
        } catch (e) {
            renderCalendar(ym.year, ym.month, new Set(), today);
            var ul = document.getElementById('checkinTodayList');
            if (ul) {
                ul.innerHTML =
                    '<li class="checkin-today-empty">' +
                    (isLikelyNetworkError(e && e.message)
                        ? '连不上服务，请检查 API 地址。'
                        : '数据加载失败。') +
                    '</li>';
            }
            var cnt = document.getElementById('checkinTodayCount');
            if (cnt) cnt.textContent = '0';
            updateUnitStats(null);
            renderMyHistory([], isLikelyNetworkError(e && e.message) ? '连不上服务' : '加载失败');
            applyPrimaryBtnFromSummary(null, true);
        }
    }

    function applyPrimaryBtnFromSummary(data, loadFailed) {
        var btn = document.getElementById('checkinPrimaryBtn');
        if (!btn || !UNIT) return;
        if (!isLoggedIn() || !window.UssAuthApi) {
            btn.textContent = '今日签到';
            btn.disabled = true;
            return;
        }
        var sess = loadAuthSession();
        if (!sess || !sess.token) {
            btn.textContent = '今日签到';
            btn.disabled = true;
            return;
        }
        if (loadFailed) {
            btn.textContent = '今日签到';
            btn.disabled = false;
            return;
        }
        if (data && data.checkinTodayWindow) {
            lastCheckinWindowMsg = data.checkinTodayWindow.message || '';
            if (!data.checkinTodayWindow.allowed) {
                btn.textContent = '未到开放时间';
                btn.disabled = true;
                return;
            }
        } else {
            lastCheckinWindowMsg = '';
        }
        if (data && data.todaySigned) {
            btn.textContent = '今日已签';
            btn.disabled = true;
        } else {
            btn.textContent = '今日签到';
            btn.disabled = false;
        }
    }

    function onPrimaryClick() {
        var btn = document.getElementById('checkinPrimaryBtn');
        if (btn && btn.disabled) {
            if (btn.textContent === '未到开放时间' && lastCheckinWindowMsg) {
                showAlert(lastCheckinWindowMsg);
                return;
            }
            showAlert('今日已签。');
            return;
        }
        doSign();
    }

    async function doSign() {
        if (!isLoggedIn() || !window.UssAuthApi || !UNIT) {
            showAlert('请先登录。');
            return;
        }
        var sess = loadAuthSession();
        if (!sess || !sess.token) {
            showAlert('请先登录。');
            return;
        }
        if (!window.CheckinCaptcha || typeof window.CheckinCaptcha.run !== 'function') {
            showAlert('验证组件未加载，请刷新页面后重试。');
            return;
        }
        var captchaPayload;
        try {
            captchaPayload = await window.CheckinCaptcha.run(
                function () {
                    return window.UssAuthApi.checkinCaptcha(sess.token);
                },
                function (captchaId) {
                    return window.UssAuthApi.checkinCaptchaPuzzle(sess.token, captchaId);
                }
            );
        } catch (e) {
            if (e && e.message && e.message.indexOf('取消') >= 0) return;
            showAlert((e && e.message) || '人机验证失败');
            return;
        }
        try {
            var res = await window.UssAuthApi.checkin(sess.token, {
                branch: UNIT,
                captchaId: captchaPayload.captchaId,
                captchaX: captchaPayload.captchaX,
                captchaDrag: captchaPayload.captchaDrag,
            });
            await loadSummary();
            var label = res && res.branchLabel ? res.branchLabel : '';
            var streak = res && res.streak != null ? res.streak : 0;
            var points = res && res.points != null ? res.points : 0;
            showAlert(
                '签到成功。' +
                    (label ? '「' + label + '」' : '') +
                    '总积分 ' +
                    points +
                    '，连续 ' +
                    streak +
                    ' 天。'
            );
        } catch (e) {
            var msg = e && e.message ? e.message : '';
            await loadSummary();
            showAlert(safeUserFacingMessage(msg) || '签到失败，请稍后再试。');
        }
    }

    async function init() {
        UNIT = readUnitFromLocation();

        var gate = document.getElementById('checkinGateHint');
        var main = document.getElementById('checkinUnitMain');
        var missing = document.getElementById('checkinUnitMissingParam');
        var title = document.getElementById('checkinUnitTitle');

        if (!UNIT) {
            setPanelHidden(missing, false);
            setPanelHidden(gate, true);
            setPanelHidden(main, true);
            return;
        }

        setPanelHidden(missing, true);

        if (title) title.textContent = UNIT_TITLES[UNIT] || '分部';

        if (!isLoggedIn()) {
            setPanelHidden(gate, false);
            setPanelHidden(main, true);
            return;
        }

        setPanelHidden(gate, true);
        setPanelHidden(main, false);

        paintSkeleton();

        setupMyHistoryMonthNav();

        var btn = document.getElementById('checkinPrimaryBtn');
        if (btn) btn.addEventListener('click', onPrimaryClick);

        try {
            var s = loadAuthSession();
            var parallel = [loadSummary()];
            if (s && s.token && window.UssAuthApi) {
                parallel.push(
                    window.UssAuthApi.me(s.token).catch(function () {
                        /* 与原先一致：会话探测失败不阻断分部数据 */
                    })
                );
            }
            await Promise.all(parallel);
        } catch (e) {
            console.error('checkin-unit init', e);
        }
    }

    window.addEventListener('hashchange', function () {
        if (document.body && document.body.classList.contains('checkin-page-body--unit')) {
            window.location.reload();
        }
    });

    window.CheckinUnitPage = {
        closeAlert: closeAlert,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
