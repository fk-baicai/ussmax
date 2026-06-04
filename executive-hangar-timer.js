/**
 * 行政机库计时器 — exec.xyxyll.com 定期校对 + 访客本机时间每秒推算
 */
(function () {
    if (typeof document === 'undefined') return;

    var CYCLE_MS = 185 * 60 * 1000;
    var anchorStartTime = null;
    var calibrationOffsetMs = 0;
    var tickTimer = null;
    var pollTimer = null;
    var calibrateTimer = null;
    /** 与后端 WEB_CALIBRATE_INTERVAL_MS 一致：每 3 分钟带 fresh 拉一次网站校对 */
    var CALIBRATE_POLL_MS = 24 * 60 * 60 * 1000;

    var board = document.getElementById('execHangarBoard');
    var errBox = document.getElementById('execHangarError');
    var phaseRail = document.getElementById('execPhaseRail');
    var insertBanner = document.getElementById('execInsertBanner');
    var insertText = document.getElementById('execInsertText');
    var ledStrip = document.getElementById('execLedStrip');
    var remH = document.getElementById('execRemH');
    var remM = document.getElementById('execRemM');
    var remS = document.getElementById('execRemS');
    var phaseRemainLabel = document.getElementById('execPhaseRemainLabel');
    var phaseRemainHero = document.getElementById('execPhaseRemainHero');
    var elapsedHero = document.getElementById('execElapsedHero');
    var nextAccessLabel = document.getElementById('execNextAccessLabel');
    var nextAccessHero = document.getElementById('execNextAccessHero');
    var ledCountEl = document.getElementById('execLedCount');
    var cycleMarker = document.getElementById('execCycleMarker');

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

    var PHASE_REMAIN_LABEL = {
        charging: '充电阶段还剩',
        discharge: '放电阶段还剩',
        cooldown: '冷却阶段还剩',
    };

    var INSERT_WINDOW = 12 * 60000;
    var DISCHARGE = 60 * 60000;

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
            phaseEnd = CHARGE + DISCHARGE;
            phaseLabel = dischargeOffset(t) < INSERT_WINDOW ? '放电中（可插卡）' : '放电中';
        } else {
            phase = 'cooldown';
            phaseLabel = '冷却中';
            phaseEnd = CYCLE_MS;
        }

        var greenCount = 0;
        var leds = [];
        var ledDetails = [];
        var i;
        var dt = dischargeOffset(t);
        if (phase === 'charging') {
            greenCount = Math.min(5, Math.floor(t / (24 * 60000)));
            for (i = 0; i < 5; i++) {
                var isGreenCharge = i < greenCount;
                leds.push(isGreenCharge);
                ledDetails.push({ green: isGreenCharge, red: !isGreenCharge });
            }
        } else if (phase === 'discharge') {
            if (dt < INSERT_WINDOW) {
                greenCount = 5;
                for (i = 0; i < 5; i++) {
                    leds.push(true);
                    ledDetails.push({ green: true, red: false });
                }
            } else {
                var extinguished = Math.min(5, Math.floor((dt - INSERT_WINDOW) / (12 * 60000)) + 1);
                greenCount = Math.max(0, 5 - extinguished);
                for (i = 0; i < 5; i++) {
                    var isGreenDischarge = i < greenCount;
                    leds.push(isGreenDischarge);
                    ledDetails.push({ green: isGreenDischarge, red: false });
                }
            }
        } else {
            greenCount = 0;
            for (i = 0; i < 5; i++) {
                leds.push(false);
                ledDetails.push({ green: false, red: true });
            }
        }

        var canInsert = phase === 'discharge' && dt < INSERT_WINDOW;
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

        var nextAccessText;
        var nextAccessLabelText;
        if (canInsert) {
            nextAccessText = '窗口进行中';
            nextAccessLabelText = '插卡窗口关闭';
        } else {
            nextAccessText = formatMs(nextAccessMs);
            nextAccessLabelText = '距下次插卡窗口';
        }

        var showIndicatorCountdown = phase === 'charging' || phase === 'discharge';
        var indicatorText =
            pad2(Math.floor(indicatorRemainingMs / 60000)) +
            ':' +
            pad2(Math.floor((indicatorRemainingMs / 1000) % 60));

        return {
            phase: phase,
            phaseLabel: phaseLabel,
            phaseRemainLabel: showIndicatorCountdown
                ? '距下次指示灯变化'
                : PHASE_REMAIN_LABEL[phase] || '当前阶段还剩',
            elapsedMs: t,
            elapsedText: formatMs(t),
            cycleRemainingMs: cycleRemainingMs,
            cycleRemainingParts: partsFromMs(cycleRemainingMs),
            phaseRemainingText: formatMs(phaseRemainingMs),
            phaseRemainingMs: phaseRemainingMs,
            indicatorRemainingText: indicatorText,
            phaseRemainingDisplayText: showIndicatorCountdown ? indicatorText : formatMs(phaseRemainingMs),
            cycleProgress: (t / CYCLE_MS) * 100,
            greenCount: greenCount,
            leds: leds,
            ledDetails: ledDetails,
            canInsert: canInsert,
            canInsertLabel: canInsert ? '可插卡' : '不可插卡',
            nextAccessText: nextAccessText,
            nextAccessLabelText: nextAccessLabelText,
        };
    }

    function localElapsedMs() {
        if (anchorStartTime == null) return 0;
        return modMs(Date.now() - anchorStartTime + calibrationOffsetMs, CYCLE_MS);
    }

    function renderClock(parts) {
        if (remH) remH.textContent = pad2(parts.h);
        if (remM) remM.textContent = pad2(parts.m);
        if (remS) remS.textContent = pad2(parts.s);
    }

    function renderPhaseRail(phase) {
        if (!phaseRail) return;
        var nodes = phaseRail.querySelectorAll('.exec-phase-node');
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            n.classList.toggle('is-active', n.getAttribute('data-phase') === phase);
        }
    }

    function renderLeds(leds, ledDetails) {
        if (!ledStrip) return;
        var nodes = ledStrip.querySelectorAll('.exec-led');
        var details = ledDetails && ledDetails.length ? ledDetails : null;
        for (var i = 0; i < 5; i++) {
            if (!nodes[i]) continue;
            var d = details ? details[i] : null;
            var on = d ? !!d.green : !!(leds && leds[i]);
            var red = d ? !!d.red && !on : false;
            nodes[i].classList.toggle('is-on', on);
            nodes[i].classList.toggle('is-red', red);
        }
    }

    function renderFromPayload(data) {
        var state = computeLocal(data.elapsedMs != null ? Number(data.elapsedMs) : localElapsedMs());
        if (data.phase) state.phase = data.phase;
        if (data.phaseLabel) state.phaseLabel = data.phaseLabel;
        // 灯态仅由本地 computeLocal 推导，避免 API 缓存/旧后端覆盖导致红灯闪灭
        if (data.canInsert != null) {
            state.canInsert = !!data.canInsert;
            state.canInsertLabel = data.canInsertLabel || (state.canInsert ? '可插卡' : '不可插卡');
        }
        if (data.indicatorRemainingText) {
            state.indicatorRemainingText = data.indicatorRemainingText;
            if (data.phase === 'charging' || data.phase === 'discharge') {
                state.phaseRemainLabel = '距下次指示灯变化';
                state.phaseRemainingDisplayText = data.indicatorRemainingText;
            }
        }
        if (data.phaseRemainingText && data.phase !== 'charging' && data.phase !== 'discharge') {
            state.phaseRemainingDisplayText = data.phaseRemainingText;
        }
        return state;
    }

    function render(state) {
        if (!state) return;

        if (board) {
            board.setAttribute('data-phase', state.phase);
            board.setAttribute('data-can-insert', state.canInsert ? 'yes' : 'no');
        }
        renderPhaseRail(state.phase);
        renderClock(state.cycleRemainingParts);

        if (insertBanner) insertBanner.setAttribute('data-state', state.canInsert ? 'yes' : 'no');
        if (insertText) insertText.textContent = state.canInsertLabel;
        if (phaseRemainLabel) phaseRemainLabel.textContent = state.phaseRemainLabel;
        if (phaseRemainHero) {
            phaseRemainHero.textContent =
                state.phaseRemainingDisplayText || state.indicatorRemainingText || state.phaseRemainingText;
        }
        if (elapsedHero) elapsedHero.textContent = state.elapsedText;
        if (nextAccessLabel) nextAccessLabel.textContent = state.nextAccessLabelText;
        if (nextAccessHero) nextAccessHero.textContent = state.nextAccessText;
        if (ledCountEl) ledCountEl.textContent = state.greenCount + ' / 5';
        if (cycleMarker) cycleMarker.style.left = state.cycleProgress.toFixed(3) + '%';

        renderLeds(state.leds, state.ledDetails);
    }

    function tick() {
        if (anchorStartTime == null) return;
        render(computeLocal(localElapsedMs()));
    }

    function showError(msg) {
        if (!errBox) return;
        errBox.textContent = msg;
        errBox.classList.remove('is-hidden');
    }

    function hideError() {
        if (errBox) errBox.classList.add('is-hidden');
    }

    function reanchorFromServer(data) {
        if (data.cycleDurationMs) CYCLE_MS = data.cycleDurationMs;
        calibrationOffsetMs = 0;

        // 用 API 已进行时间对齐到访客本机时钟，避免服务器 anchor 与浏览器时钟不一致
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

    function applyServerPayload(data) {
        if (!data || !data.ok) {
            showError(formatErr(data, null, 'SRV_001'));
            return;
        }
        hideError();
        reanchorFromServer(data);
        render(renderFromPayload(data));
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
            .then(applyServerPayload)
            .catch(function (e) {
                showError(formatErr(null, e, 'NET_E001'));
            });
    }

    function initLeds() {
        if (!ledStrip || ledStrip.children.length) return;
        for (var i = 0; i < 5; i++) {
            var el = document.createElement('span');
            el.className = 'exec-led';
            el.setAttribute('aria-hidden', 'true');
            ledStrip.appendChild(el);
        }
    }

    function initPhaseInfoCards() {
        var cards = document.querySelectorAll('.exec-phase-info-card');
        if (!cards.length) return;

        cards.forEach(function (card) {
            card.addEventListener('click', function () {
                var phase = card.getAttribute('data-phase');
                var wasPicked = card.classList.contains('is-picked');

                cards.forEach(function (c) {
                    c.classList.remove('is-picked');
                    c.setAttribute('aria-pressed', 'false');
                });
                document.querySelectorAll('.exec-phase-node').forEach(function (n) {
                    n.classList.remove('is-picked');
                });

                if (!wasPicked && phase) {
                    card.classList.add('is-picked');
                    card.setAttribute('aria-pressed', 'true');
                    var node = document.querySelector('.exec-phase-node[data-phase="' + phase + '"]');
                    if (node) node.classList.add('is-picked');
                }
            });
        });
    }

    function start() {
        initLeds();
        initPhaseInfoCards();
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
