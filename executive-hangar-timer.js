/**
 * 行政机库计时器 — 后端基准 + 本地每秒推算（主显示：本轮剩余）
 */
(function () {
    if (typeof document === 'undefined') return;

    var CYCLE_MS = 185 * 60 * 1000;
    var anchorStartTime = null;
    var serverSkewMs = 0;
    var tickTimer = null;
    var pollTimer = null;

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
        access: '插卡窗口还剩',
        discharge: '放电阶段还剩',
        cooldown: '冷却阶段还剩',
    };

    function computeLocal(elapsedMs) {
        var t = modMs(elapsedMs, CYCLE_MS);
        var CHARGE = 120 * 60000;
        var ACCESS = 12 * 60000;
        var DISCHARGE = 48 * 60000;
        var phase;
        var phaseEnd;
        var phaseLabel;
        var greenCount = 0;

        if (t < CHARGE) {
            phase = 'charging';
            phaseLabel = '充电中';
            phaseEnd = CHARGE;
            greenCount = Math.min(5, Math.floor(t / (24 * 60000)));
        } else if (t < CHARGE + ACCESS) {
            phase = 'access';
            phaseLabel = '可插卡窗口';
            phaseEnd = CHARGE + ACCESS;
            greenCount = 5;
        } else if (t < CHARGE + ACCESS + DISCHARGE) {
            phase = 'discharge';
            phaseLabel = '放电中';
            phaseEnd = CHARGE + ACCESS + DISCHARGE;
            var reds = Math.floor((t - CHARGE - ACCESS) / (12 * 60000)) + 1;
            greenCount = Math.max(0, 5 - reds);
        } else {
            phase = 'cooldown';
            phaseLabel = '冷却中';
            phaseEnd = CYCLE_MS;
            greenCount = 0;
        }

        var leds = [];
        for (var i = 0; i < 5; i++) leds.push(i < greenCount);
        var canInsert = greenCount === 5;
        var cycleRemainingMs = CYCLE_MS - t;
        var nextAccessMs =
            phase === 'access' ? null : phase === 'charging' ? CHARGE - t : cycleRemainingMs + CHARGE;

        var nextAccessText;
        var nextAccessLabelText;
        if (phase === 'access') {
            nextAccessText = '窗口进行中';
            nextAccessLabelText = '下次插卡窗口';
        } else {
            nextAccessText = formatMs(nextAccessMs);
            nextAccessLabelText = '距下次插卡窗口';
        }

        return {
            phase: phase,
            phaseLabel: phaseLabel,
            phaseRemainLabel: PHASE_REMAIN_LABEL[phase] || '当前阶段还剩',
            elapsedMs: t,
            elapsedText: formatMs(t),
            cycleRemainingMs: cycleRemainingMs,
            cycleRemainingParts: partsFromMs(cycleRemainingMs),
            phaseRemainingText: formatMs(phaseEnd - t),
            cycleProgress: (t / CYCLE_MS) * 100,
            greenCount: greenCount,
            leds: leds,
            canInsert: canInsert,
            canInsertLabel: canInsert ? '可插卡' : '不可插卡',
            nextAccessText: nextAccessText,
            nextAccessLabelText: nextAccessLabelText,
        };
    }

    function nowAligned() {
        return Date.now() - serverSkewMs;
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

    function renderLeds(leds) {
        if (!ledStrip) return;
        var nodes = ledStrip.querySelectorAll('.exec-led');
        for (var i = 0; i < 5; i++) {
            if (nodes[i]) nodes[i].classList.toggle('is-on', !!leds[i]);
        }
    }

    function render(state) {
        if (!state) return;

        if (board) board.setAttribute('data-phase', state.phase);
        renderPhaseRail(state.phase);
        renderClock(state.cycleRemainingParts);

        if (insertBanner) insertBanner.setAttribute('data-state', state.canInsert ? 'yes' : 'no');
        if (insertText) insertText.textContent = state.canInsertLabel;
        if (phaseRemainLabel) phaseRemainLabel.textContent = state.phaseRemainLabel;
        if (phaseRemainHero) phaseRemainHero.textContent = state.phaseRemainingText;
        if (elapsedHero) elapsedHero.textContent = state.elapsedText;
        if (nextAccessLabel) nextAccessLabel.textContent = state.nextAccessLabelText;
        if (nextAccessHero) nextAccessHero.textContent = state.nextAccessText;
        if (ledCountEl) ledCountEl.textContent = state.greenCount + ' / 5';
        if (cycleMarker) cycleMarker.style.left = state.cycleProgress.toFixed(3) + '%';

        renderLeds(state.leds);
    }

    function tick() {
        if (anchorStartTime == null) return;
        var elapsed = modMs(nowAligned() - anchorStartTime, CYCLE_MS);
        render(computeLocal(elapsed));
    }

    function showError(msg) {
        if (!errBox) return;
        errBox.textContent = msg;
        errBox.classList.remove('is-hidden');
    }

    function hideError() {
        if (errBox) errBox.classList.add('is-hidden');
    }

    function applyServerPayload(data) {
        if (!data || !data.ok) {
            showError((data && data.message) || '无法获取周期状态');
            return;
        }
        hideError();
        anchorStartTime = data.anchorStartTime;
        if (data.cycleDurationMs) CYCLE_MS = data.cycleDurationMs;
        if (data.serverNow) serverSkewMs = Date.now() - data.serverNow;
        tick();
    }

    function fetchState() {
        return fetch(apiBase() + '/api/exec-hangar/state', { cache: 'no-store' })
            .then(function (r) {
                return r.json().then(function (j) {
                    if (!r.ok) throw new Error((j && j.message) || 'HTTP ' + r.status);
                    return j;
                });
            })
            .then(applyServerPayload)
            .catch(function (e) {
                showError(e.message || '连接后端失败');
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
        fetchState();
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(tick, 1000);
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(fetchState, 60000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
