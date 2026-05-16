/**
 * 签到滑动拼图人机验证（GET /api/checkin/captcha）
 * 背景：frontend/captcha/a.jpg、b.jpg、c.jpg（缺失时用 Canvas 备用图）
 */
(function (global) {
    'use strict';

    var PUZZLE_W = 300;
    var PUZZLE_H = 150;
    var PIECE = 44;
    var SLIDER_PAD = 8;

    function drawProceduralBg(ctx, w, h, index) {
        var g = ctx.createLinearGradient(0, 0, w, h);
        if (index === 0) {
            g.addColorStop(0, '#0a1628');
            g.addColorStop(0.5, '#123a5c');
            g.addColorStop(1, '#0d2240');
        } else if (index === 1) {
            g.addColorStop(0, '#120a28');
            g.addColorStop(0.45, '#2a1850');
            g.addColorStop(1, '#0f1835');
        } else {
            g.addColorStop(0, '#081820');
            g.addColorStop(0.4, '#0e3d4a');
            g.addColorStop(1, '#102838');
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 0.35;
        for (var i = 0; i < 28; i++) {
            ctx.fillStyle = i % 3 === 0 ? '#5fb8ff' : '#88d4ff';
            ctx.beginPath();
            ctx.arc(Math.random() * w, Math.random() * h, 0.5 + Math.random() * 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function loadBgImage(imageKey, imageIndex) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                resolve(img);
            };
            img.onerror = function () {
                var c = document.createElement('canvas');
                c.width = PUZZLE_W;
                c.height = PUZZLE_H;
                var ctx = c.getContext('2d');
                drawProceduralBg(ctx, PUZZLE_W, PUZZLE_H, imageIndex);
                var fallback = new Image();
                fallback.onload = function () {
                    resolve(fallback);
                };
                fallback.src = c.toDataURL('image/png');
            };
            img.src = 'captcha/' + imageKey + '.jpg';
        });
    }

    function buildPuzzleCanvases(img, targetX, pieceY) {
        var bg = document.createElement('canvas');
        bg.width = PUZZLE_W;
        bg.height = PUZZLE_H;
        var bctx = bg.getContext('2d');
        bctx.drawImage(img, 0, 0, PUZZLE_W, PUZZLE_H);
        bctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        bctx.fillRect(targetX, pieceY, PIECE, PIECE);
        bctx.strokeStyle = 'rgba(95, 184, 255, 0.85)';
        bctx.lineWidth = 2;
        bctx.setLineDash([4, 3]);
        bctx.strokeRect(targetX + 0.5, pieceY + 0.5, PIECE - 1, PIECE - 1);
        bctx.setLineDash([]);

        var piece = document.createElement('canvas');
        piece.width = PIECE;
        piece.height = PIECE;
        var pctx = piece.getContext('2d');
        pctx.drawImage(img, targetX, pieceY, PIECE, PIECE, 0, 0, PIECE, PIECE);
        pctx.strokeStyle = 'rgba(120, 210, 255, 0.9)';
        pctx.lineWidth = 1.5;
        pctx.strokeRect(0.5, 0.5, PIECE - 1, PIECE - 1);

        return { bg: bg, piece: piece };
    }

    function ensureModal() {
        var el = document.getElementById('checkinCaptchaBackdrop');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'checkinCaptchaBackdrop';
        el.className = 'checkin-captcha-backdrop';
        el.hidden = true;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'checkinCaptchaTitle');
        var html = '';
        html += '<div class="checkin-captcha-panel">';
        html += '<div class="checkin-captcha-head">';
        html += '<h3 id="checkinCaptchaTitle">安全验证</h3>';
        html += '<button type="button" class="checkin-captcha-close" aria-label="关闭">×</button>';
        html += '</div>';
        html += '<p class="checkin-captcha-hint">拖动下方滑块，将拼图块移至缺口处对齐</p>';
        html += '<div class="checkin-captcha-puzzle-wrap">';
        html += '<canvas class="checkin-captcha-bg" width="' + PUZZLE_W + '" height="' + PUZZLE_H + '"></canvas>';
        html += '<canvas class="checkin-captcha-piece" width="' + PIECE + '" height="' + PIECE + '"></canvas>';
        html += '</div>';
        html += '<div class="checkin-captcha-slider-row">';
        html += '<div class="checkin-captcha-slider-track">';
        html += '<div class="checkin-captcha-slider-fill"></div>';
        html += '<button type="button" class="checkin-captcha-slider-knob" aria-label="拖动滑块"><span aria-hidden="true">››</span></button>';
        html += '</div></div>';
        html += '<p class="checkin-captcha-err" hidden></p>';
        html += '<div class="checkin-captcha-actions">';
        html += '<button type="button" class="checkin-captcha-refresh">换一张</button>';
        html += '<button type="button" class="checkin-captcha-submit">完成验证</button>';
        html += '</div></div>';
        el.innerHTML = html;
        document.body.appendChild(el);
        return el;
    }

    function run(fetchChallenge) {
        return new Promise(function (resolve, reject) {
            var backdrop = ensureModal();
            var state = {
                captchaId: '',
                targetX: 120,
                pieceY: 30,
                sliderX: 0,
                maxSlider: PUZZLE_W - PIECE - SLIDER_PAD * 2,
                dragging: false,
                img: null,
            };

            var bgCanvas = backdrop.querySelector('.checkin-captcha-bg');
            var pieceCanvas = backdrop.querySelector('.checkin-captcha-piece');
            var knob = backdrop.querySelector('.checkin-captcha-slider-knob');
            var fill = backdrop.querySelector('.checkin-captcha-slider-fill');
            var errEl = backdrop.querySelector('.checkin-captcha-err');
            var btnClose = backdrop.querySelector('.checkin-captcha-close');
            var btnRefresh = backdrop.querySelector('.checkin-captcha-refresh');
            var btnSubmit = backdrop.querySelector('.checkin-captcha-submit');

            function showErr(msg) {
                if (!errEl) return;
                if (msg) {
                    errEl.textContent = msg;
                    errEl.hidden = false;
                } else errEl.hidden = true;
            }

            function closeModal() {
                backdrop.hidden = true;
                state.dragging = false;
            }

            function paintSlider(x) {
                state.sliderX = Math.max(0, Math.min(state.maxSlider, x));
                pieceCanvas.style.left = state.sliderX + SLIDER_PAD + 'px';
                pieceCanvas.style.top = state.pieceY + 'px';
                knob.style.left = state.sliderX + 'px';
                fill.style.width = state.sliderX + PIECE * 0.45 + 'px';
            }

            function renderPuzzle() {
                if (!state.img) return;
                var pair = buildPuzzleCanvases(state.img, state.targetX, state.pieceY);
                bgCanvas.getContext('2d').drawImage(pair.bg, 0, 0);
                var pctx = pieceCanvas.getContext('2d');
                pctx.clearRect(0, 0, PIECE, PIECE);
                pctx.drawImage(pair.piece, 0, 0);
                paintSlider(0);
            }

            function loadChallenge() {
                showErr('');
                btnSubmit.disabled = true;
                btnRefresh.disabled = true;
                return fetchChallenge()
                    .then(function (ch) {
                        state.captchaId = ch.captchaId;
                        state.targetX = Number(ch.targetX);
                        state.pieceY = Number(ch.pieceY) || 30;
                        if (!Number.isFinite(state.targetX)) state.targetX = 120;
                        var idx = ch.imageIndex != null ? Number(ch.imageIndex) : 0;
                        var key = ch.imageKey || ['a', 'b', 'c'][idx] || 'a';
                        return loadBgImage(key, idx).then(function (img) {
                            state.img = img;
                            renderPuzzle();
                            btnSubmit.disabled = false;
                        });
                    })
                    .catch(function (e) {
                        showErr((e && e.message) || '加载验证失败');
                    })
                    .finally(function () {
                        btnRefresh.disabled = false;
                    });
            }

            btnClose.onclick = function () {
                closeModal();
                reject(new Error('已取消验证'));
            };
            btnRefresh.onclick = function () {
                loadChallenge();
            };
            btnSubmit.onclick = function () {
                showErr('');
                var captchaX = Math.round(state.sliderX + SLIDER_PAD);
                closeModal();
                resolve({ captchaId: state.captchaId, captchaX: captchaX });
            };
            knob.onpointerdown = function (e) {
                state.dragging = true;
                if (knob.setPointerCapture) knob.setPointerCapture(e.pointerId);
            };
            knob.onpointermove = function (e) {
                if (!state.dragging) return;
                var track = backdrop.querySelector('.checkin-captcha-slider-track');
                var rect = track.getBoundingClientRect();
                paintSlider(e.clientX - rect.left - PIECE / 2);
            };
            knob.onpointerup = function () {
                state.dragging = false;
            };
            knob.onpointercancel = function () {
                state.dragging = false;
            };
            backdrop.onclick = function (e) {
                if (e.target === backdrop) {
                    closeModal();
                    reject(new Error('已取消验证'));
                }
            };

            backdrop.hidden = false;
            loadChallenge();
        });
    }

    global.CheckinCaptcha = { run: run };
})(typeof window !== 'undefined' ? window : global);
