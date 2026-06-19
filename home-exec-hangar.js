/**
 * 首页行政机库（简化版）— 三卡片布局，与 RSI 服务器状态风格一致
 */
(function () {
    'use strict';

    if (typeof document === 'undefined') return;

    var gridEl = document.getElementById('homeExecHangarGrid');
    var errEl = document.getElementById('homeExecHangarError');
    if (!gridEl) return;

    var CYCLE_MS = 185 * 60 * 1000;
    var anchorStartTime = null;
    var calibrationOffsetMs = 0;
    var tickTimer = null;
    var pollTimer = null;
    var calibrateTimer = null;
    var CALIBRATE_POLL_MS = 24 * 60 * 60 * 1000;

    var PHASE_RANGE = {
        charging: '0 – 120 分钟',
        discharge: '120 – 180 分钟',
        cooldown: '180 – 185 分钟',
    };

    var PHASE_REMAIN_LABEL = {
        charging: '充电阶段还剩',
        discharge: '放电阶段还剩',
        cooldown: '冷却阶段还剩',
    };

    var INSERT_WINDOW = 12 * 60000;
    var DISCHARGE = 60 * 60000;

    function apiBase() {
        return (
            (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) ||
            'http://127.0.0.1:3789'
        ).replace(/\/$/, '');
    }

    function modMs(n, d) {
        var x = n % d;
        return x < 0 ? x + d : x;
    }

    function pad2(n) {
        return String(Math.floor(n)).padStart(2, '0');
    }

    function formatMs(ms) {
        var total = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        if (h > 0) return pad2(h) + 'h ' + pad2(m) + 'm ' + pad2(s) + 's';
        if (m > 0) return pad2(m) + 'm ' + pad2(s) + 's';
        return pad2(s) + 's';
    }

    function partsFromMs(ms) {
        var total = Math.max(0, Math.floor(ms / 1000));
        return {
            h: Math.floor(total / 3600),
            m: Math.floor((total % 3600) / 60),
            s: total % 60,
        };
    }

    function formatClockParts(parts) {
        return pad2(parts.h) + 'h ' + pad2(parts.m) + 'm ' + pad2(parts.s) + 's';
    }

    function dischargeOffset(t) {
        return Math.max(0, t - 120 * 60000);
    }

    function computeLocal(elapsedMs) {
        var t = modMs(elapsedMs, CYCLE_MS);
        var CHARGE = 120 * 60000;
        var phase;
        var phaseEnd;
        var phaseLabel;

        if (t < CHARGE) {
            phase = 'charging';
            phaseLabel = '充电中';
            phaseEnd = CHARGE;
        } else if (t < CHARGE + DISCHARGE) {
            phase = 'discharge';
            phaseLabel = '放电中';
            phaseEnd = CHARGE + DISCHARGE;
        } else {
            phase = 'cooldown';
            phaseLabel = '冷却中';
            phaseEnd = CYCLE_MS;
        }

        var greenCount = 0;
        var dt = dischargeOffset(t);
        if (phase === 'charging') {
            greenCount = Math.min(5, Math.floor(t / (24 * 60000)));
        } else if (phase === 'discharge') {
            if (dt < INSERT_WINDOW) greenCount = 5;
            else {
                var extinguished = Math.min(5, Math.floor((dt - INSERT_WINDOW) / (12 * 60000)) + 1);
                greenCount = Math.max(0, 5 - extinguished);
            }
        }

        var canInsert = phase === 'discharge';
        var cycleRemainingMs = CYCLE_MS - t;
        var phaseRemainingMs = phaseEnd - t;
        var indicatorRemainingMs = phaseRemainingMs;

        if (phase === 'charging') {
            var slot = 24 * 60000;
            indicatorRemainingMs = Math.min(CHARGE, Math.ceil((t + 1) / slot) * slot) - t;
        } else if (phase === 'discharge') {
            if (dt < INSERT_WINDOW) {
                indicatorRemainingMs = INSERT_WINDOW - dt;
            } else {
                var base = INSERT_WINDOW;
                var slotD = 12 * 60000;
                var nextDt = Math.min(DISCHARGE, base + Math.ceil((dt - base + 1) / slotD) * slotD);
                indicatorRemainingMs = CHARGE + nextDt - t;
            }
        }

        var nextAccessMs = canInsert ? null : phase === 'charging' ? CHARGE - t : cycleRemainingMs + CHARGE;

        var nextAccessLabelText;
        var nextAccessText;
        if (canInsert) {
            nextAccessLabelText = '距插卡窗口关闭';
            nextAccessText = formatMs(phaseRemainingMs);
        } else {
            nextAccessLabelText = '距下次插卡窗口';
            nextAccessText = formatMs(nextAccessMs);
        }

        var showIndicatorCountdown = phase === 'charging' || phase === 'discharge';
        var indicatorText =
            pad2(Math.floor(indicatorRemainingMs / 60000)) +
            ':' +
            pad2(Math.floor((indicatorRemainingMs / 1000) % 60));

        var phaseRemainLabel = showIndicatorCountdown
            ? '距下次指示灯变化'
            : PHASE_REMAIN_LABEL[phase] || '当前阶段还剩';

        var phaseRemainingDisplayText = showIndicatorCountdown ? indicatorText : formatMs(phaseRemainingMs);

        var insertLabel = canInsert ? '可插卡' : phase === 'cooldown' ? '机库消杀' : '不可插卡';
        var insertTone = canInsert ? 'green' : phase === 'cooldown' ? 'orange' : 'red';

        var pipelineHint = '充电段逐盏点亮，放电段逐盏熄灭';
        if (phase === 'discharge' && dt < INSERT_WINDOW) pipelineHint = '五盏全绿 · 前 12 分钟';
        else if (phase === 'discharge') pipelineHint = '绿灯 ' + greenCount + ' / 5 · 逐盏熄灭中';
        else if (phase === 'charging') pipelineHint = '绿灯 ' + greenCount + ' / 5 · 每 24 分钟亮 1 盏';
        else pipelineHint = '冷却段指示灯全灭';

        var goldenWindow =
            phase === 'discharge' && dt < INSERT_WINDOW && greenCount === 5;

        return {
            phase: phase,
            phaseLabel: phaseLabel,
            phaseRange: PHASE_RANGE[phase] || '',
            phaseRemainingMs: phaseRemainingMs,
            phaseRemainingText: formatMs(phaseRemainingMs),
            phaseRemainLabel: phaseRemainLabel,
            phaseRemainingDisplayText: phaseRemainingDisplayText,
            elapsedText: formatMs(t),
            cycleRemainingMs: cycleRemainingMs,
            cycleRemainingParts: partsFromMs(cycleRemainingMs),
            cycleRemainingText: formatClockParts(partsFromMs(cycleRemainingMs)),
            cycleProgress: Math.round((t / CYCLE_MS) * 100),
            greenCount: greenCount,
            canInsert: canInsert,
            goldenWindow: goldenWindow,
            insertLabel: insertLabel,
            insertTone: insertTone,
            nextAccessMs: canInsert ? phaseRemainingMs : nextAccessMs,
            nextAccessLabelText: nextAccessLabelText,
            nextAccessText: nextAccessText,
            pipelineHint: pipelineHint,
        };
    }

    function localElapsedMs() {
        if (anchorStartTime == null) return 0;
        return modMs(Date.now() - anchorStartTime + calibrationOffsetMs, CYCLE_MS);
    }

    function buildCard(title, sub, badgeText, tone, details, leds, opts) {
        opts = opts || {};
        var card = document.createElement('article');
        card.className = 'rsi-status-card rsi-status-card--' + (tone || 'gray');

        var head = document.createElement('div');
        head.className = 'rsi-status-card-head';

        var h3 = document.createElement('h3');
        h3.className = 'rsi-status-card-title';
        h3.textContent = title;

        var p = document.createElement('p');
        p.className = 'rsi-status-card-sub';
        if (opts.subEmphasis) p.classList.add('is-emphasis-' + opts.subEmphasis);
        p.textContent = sub || '';

        head.appendChild(h3);
        head.appendChild(p);

        if (Array.isArray(details) && details.length) {
            var dl = document.createElement('dl');
            dl.className = 'home-exec-card-details';
            details.forEach(function (row) {
                if (!row || !row.label) return;
                var dt = document.createElement('dt');
                dt.textContent = row.label;
                if (row.emphasis) dt.classList.add('is-' + row.emphasis);
                var dd = document.createElement('dd');
                dd.textContent = row.value || '—';
                if (row.emphasis) dd.classList.add('is-' + row.emphasis);
                if (row.urgent) dd.classList.add('is-urgent');
                dl.appendChild(dt);
                dl.appendChild(dd);
            });
            head.appendChild(dl);
        }

        if (Array.isArray(leds) && leds.length === 5) {
            var ledRow = document.createElement('div');
            ledRow.className = 'home-exec-pipeline';
            ledRow.setAttribute('aria-label', '五盏指示灯 ' + leds.filter(Boolean).length + ' 盏亮');
            leds.forEach(function (on) {
                var dot = document.createElement('span');
                dot.className = 'home-exec-pipeline-dot' + (on ? ' is-on' : '');
                dot.setAttribute('aria-hidden', 'true');
                ledRow.appendChild(dot);
            });
            head.appendChild(ledRow);
        }

        var badge = document.createElement('div');
        badge.className = 'rsi-status-badge rsi-status-badge--' + (tone || 'gray');

        var dot = document.createElement('span');
        dot.className = 'rsi-status-dot';
        dot.setAttribute('aria-hidden', 'true');

        var label = document.createElement('span');
        label.className = 'rsi-status-label';
        label.textContent = badgeText || '—';

        badge.appendChild(dot);
        badge.appendChild(label);
        card.appendChild(head);
        card.appendChild(badge);
        return card;
    }

    function phaseTone(phase, canInsert) {
        if (phase === 'discharge') return canInsert ? 'green' : 'yellow';
        if (phase === 'charging') return 'blue';
        return 'gray';
    }

    function pipelineLeds(greenCount, phase) {
        var leds = [];
        var i;
        for (i = 0; i < 5; i++) {
            if (phase === 'cooldown') leds.push(false);
            else leds.push(i < greenCount);
        }
        return leds;
    }

    function isSoon(ms) {
        return ms != null && ms <= 10 * 60000;
    }

    function insertHint(state) {
        if (state.canInsert) {
            if (state.goldenWindow) return '五盏全绿 · 前 12 分钟黄金窗口，建议优先插卡';
            return '放电段内随时可插卡 · 阶段结束后窗口关闭';
        }
        if (state.phase === 'cooldown') return '冷却 5 分钟后进入充电，期间不可插卡';
        return '充电段结束后进入放电，全程可插卡';
    }

    function render(state) {
        if (!state || !gridEl) return;

        var chargingNote =
            state.phase === 'charging'
                ? '当前充电段进行中'
                : state.cycleRemainingText + ' 后开始（含冷却）';

        var phaseSub = state.phaseLabel + ' · ' + state.phaseRange;
        var leds = pipelineLeds(state.greenCount, state.phase);
        var showIndicator = state.phase === 'charging' || state.phase === 'discharge';
        var insertSoon = !state.canInsert && isSoon(state.nextAccessMs);
        var insertClosing = state.canInsert && isSoon(state.phaseRemainingMs);

        gridEl.innerHTML = '';
        gridEl.appendChild(
            buildCard(
                '当前阶段',
                phaseSub,
                state.phaseLabel,
                phaseTone(state.phase, state.canInsert),
                [
                    {
                        label: state.phaseRemainLabel,
                        value: state.phaseRemainingDisplayText,
                        emphasis: showIndicator ? 'key' : '',
                        urgent: showIndicator && isSoon(state.phaseRemainingMs),
                    },
                    {
                        label: '阶段还剩',
                        value: state.phaseRemainingText,
                        emphasis: 'key',
                        urgent: isSoon(state.phaseRemainingMs),
                    },
                    {
                        label: 'PIPELINE',
                        value: state.greenCount + ' / 5 盏绿灯 · ' + state.pipelineHint,
                        emphasis: state.goldenWindow ? 'key' : 'hint',
                    },
                ],
                leds,
            ),
        );
        gridEl.appendChild(
            buildCard(
                '插卡窗口',
                state.canInsert
                    ? state.goldenWindow
                        ? '黄金窗口 · 五盏全绿，建议立即插卡'
                        : '当前可插卡 · 放电段全程开放'
                    : '当前不可插卡',
                state.insertLabel,
                state.insertTone,
                [
                    {
                        label: state.nextAccessLabelText,
                        value: state.nextAccessText,
                        emphasis: 'key',
                        urgent: insertSoon || insertClosing,
                    },
                    {
                        label: '说明',
                        value: insertHint(state),
                        emphasis: 'hint',
                    },
                ],
                null,
                {
                    subEmphasis: state.canInsert
                        ? state.goldenWindow
                            ? 'open-golden'
                            : 'open'
                        : state.phase === 'cooldown'
                          ? 'cooldown'
                          : 'blocked',
                },
            ),
        );
        gridEl.appendChild(
            buildCard(
                '本轮周期',
                '185 分钟周期 · 进度 ' + state.cycleProgress + '%',
                state.cycleRemainingText,
                state.canInsert ? 'green' : 'blue',
                [
                    { label: '已进行', value: state.elapsedText, emphasis: 'hint' },
                    {
                        label: '距本轮结束',
                        value: state.cycleRemainingText,
                        emphasis: 'key',
                    },
                    { label: '下轮充电', value: chargingNote, emphasis: 'hint' },
                ],
            ),
        );
    }

    function renderLoading() {
        gridEl.innerHTML = '<div class="rsi-status-loading" role="status">正在同步行政机库…</div>';
    }

    function showError(msg) {
        if (errEl) {
            errEl.textContent = msg;
            errEl.classList.remove('is-hidden');
        }
        gridEl.innerHTML =
            '<div class="rsi-status-error" role="alert">' + String(msg || '暂时无法获取状态') + '</div>';
    }

    function hideError() {
        if (errEl) errEl.classList.add('is-hidden');
    }

    function reanchorFromServer(data) {
        if (data.cycleDurationMs) CYCLE_MS = data.cycleDurationMs;
        calibrationOffsetMs = 0;
        if (data.elapsedMs != null && Number.isFinite(Number(data.elapsedMs))) {
            anchorStartTime = Date.now() - modMs(Number(data.elapsedMs), CYCLE_MS);
            return;
        }
        if (data.anchorStartTime != null) {
            var skew =
                data.serverNow != null && Number.isFinite(Number(data.serverNow))
                    ? Date.now() - Number(data.serverNow)
                    : 0;
            anchorStartTime = Number(data.anchorStartTime) + skew;
            calibrationOffsetMs = Number(data.calibrationOffsetMs) || 0;
        }
    }

    function formatErr(data, err, fallback) {
        var code = (data && data.code) || (err && err.code) || fallback || 'SRV_001';
        if (typeof UssApiError !== 'undefined') return UssApiError.formatUserError(code);
        if (err && err.message && /^错误代码：/.test(err.message)) return err.message;
        return '错误代码：' + code;
    }

    function tick() {
        if (anchorStartTime == null) return;
        render(computeLocal(localElapsedMs()));
    }

    function fetchState(fresh) {
        var url = apiBase() + '/api/exec-hangar/state' + (fresh ? '?fresh=1' : '');
        return fetch(url, { cache: 'no-store' })
            .then(function (r) {
                return r.json().then(function (j) {
                    if (!r.ok) {
                        var err = new Error(formatErr(j, null, 'SRV_001'));
                        err.code = (j && j.code) || 'SRV_001';
                        throw err;
                    }
                    return j;
                });
            })
            .then(function (data) {
                if (!data || !data.ok) {
                    showError(formatErr(data, null, 'SRV_001'));
                    return;
                }
                hideError();
                reanchorFromServer(data);
                render(computeLocal(data.elapsedMs != null ? Number(data.elapsedMs) : localElapsedMs()));
            })
            .catch(function (e) {
                showError(formatErr(null, e, 'NET_E001'));
            });
    }

    function start() {
        renderLoading();
        fetchState(true);
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(tick, 1000);
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(function () {
            fetchState(false);
        }, 30000);
        if (calibrateTimer) clearInterval(calibrateTimer);
        calibrateTimer = setInterval(function () {
            fetchState(true);
        }, CALIBRATE_POLL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
