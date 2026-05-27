/**
 * 签到滑动拼图人机验证
 * 缺口坐标仅保存在服务端；拼图由 GET /api/checkin/captcha/:id/puzzle 返回
 */
(function (global) {
    'use strict';

    var PUZZLE_W = 300;
    var PUZZLE_H = 150;
    var PIECE = 44;
    var SLIDER_PAD = 8;
    var MIN_DRAG_MS = 50;
    var MIN_MOVE_COUNT = 1;

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

    function loadDataUrlImage(dataUrl) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                resolve(img);
            };
            img.onerror = function () {
                reject(new Error('拼图加载失败'));
            };
            img.src = dataUrl;
        });
    }

    function drawToCanvas(canvas, img) {
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    /**
     * @param {() => Promise<object>} fetchChallenge
     * @param {(captchaId: string) => Promise<object>} fetchPuzzle
     */
    function run(fetchChallenge, fetchPuzzle) {
        return new Promise(function (resolve, reject) {
            var backdrop = ensureModal();
            var state = {
                captchaId: '',
                pieceY: 30,
                sliderX: 0,
                maxSlider: PUZZLE_W - PIECE - SLIDER_PAD * 2,
                dragging: false,
                dragStart: 0,
                dragMeta: { durationMs: 0, moveCount: 0, samples: [] },
            };

            var bgCanvas = backdrop.querySelector('.checkin-captcha-bg');
            var pieceCanvas = backdrop.querySelector('.checkin-captcha-piece');
            var puzzleWrap = backdrop.querySelector('.checkin-captcha-puzzle-wrap');
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
                window.removeEventListener('resize', onPuzzleResize);
            }

            function resetDragMeta() {
                state.dragStart = 0;
                state.dragging = false;
                state.dragMeta = { durationMs: 0, moveCount: 0, samples: [] };
            }

            function getDisplayScales() {
                if (!puzzleWrap) return { scaleX: 1, scaleY: 1 };
                var w = puzzleWrap.clientWidth;
                var h = puzzleWrap.clientHeight;
                return {
                    scaleX: w > 0 ? w / PUZZLE_W : 1,
                    scaleY: h > 0 ? h / PUZZLE_H : 1,
                };
            }

            /** 拼图块在 300px 逻辑坐标系中的 left（与后端 targetX 一致） */
            function logicalCaptchaX() {
                return Math.round(state.sliderX + SLIDER_PAD);
            }

            function beginDrag() {
                state.dragging = true;
                if (!state.dragStart) state.dragStart = Date.now();
                pushSample();
            }

            function pushSample() {
                var t = state.dragStart ? Date.now() - state.dragStart : 0;
                var samples = state.dragMeta.samples;
                if (samples.length >= 60) return;
                samples.push({ t: t, x: logicalCaptchaX() });
            }

            function paintSlider(logicalX) {
                var scales = getDisplayScales();
                var scaleX = scales.scaleX;
                var scaleY = scales.scaleY;
                state.sliderX = Math.max(0, Math.min(state.maxSlider, logicalX));
                pieceCanvas.style.width = PIECE * scaleX + 'px';
                pieceCanvas.style.height = PIECE * scaleY + 'px';
                pieceCanvas.style.left = (state.sliderX + SLIDER_PAD) * scaleX + 'px';
                pieceCanvas.style.top = state.pieceY * scaleY + 'px';
                var knobTravel = track ? Math.max(1, track.clientWidth - (knob ? knob.offsetWidth : PIECE)) : state.maxSlider;
                knob.style.left = (state.sliderX / state.maxSlider) * knobTravel + 'px';
                fill.style.width = (state.sliderX / state.maxSlider) * knobTravel + PIECE * scaleX * 0.45 + 'px';
            }

            function renderFromPuzzle(puzzle) {
                return Promise.all([
                    loadDataUrlImage(puzzle.bgDataUrl),
                    loadDataUrlImage(puzzle.pieceDataUrl),
                ]).then(function (imgs) {
                    drawToCanvas(bgCanvas, imgs[0]);
                    drawToCanvas(pieceCanvas, imgs[1]);
                    state.pieceY = Number(puzzle.pieceY) || state.pieceY;
                    paintSlider(0);
                    resetDragMeta();
                });
            }

            function loadChallenge() {
                showErr('');
                btnSubmit.disabled = true;
                btnRefresh.disabled = true;
                resetDragMeta();
                return fetchChallenge()
                    .then(function (ch) {
                        state.captchaId = ch.captchaId;
                        state.pieceY = Number(ch.pieceY) || 30;
                        if (!state.captchaId) throw new Error('验证初始化失败');
                        return fetchPuzzle(state.captchaId);
                    })
                    .then(function (puzzle) {
                        return renderFromPuzzle(puzzle);
                    })
                    .then(function () {
                        btnSubmit.disabled = false;
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
                var meta = state.dragMeta;
                meta.durationMs = state.dragStart ? Date.now() - state.dragStart : 0;
                pushSample();
                if (state.sliderX < 2) {
                    showErr('请先拖动滑块，将拼图对齐缺口');
                    return;
                }
                if (!state.dragStart) {
                    showErr('请拖动滑块完成验证');
                    return;
                }
                if (meta.moveCount < MIN_MOVE_COUNT) {
                    meta.moveCount = MIN_MOVE_COUNT;
                }
                if (meta.durationMs < MIN_DRAG_MS) {
                    meta.durationMs = MIN_DRAG_MS;
                }
                var captchaX = logicalCaptchaX();
                closeModal();
                resolve({
                    captchaId: state.captchaId,
                    captchaX: captchaX,
                    captchaDrag: meta,
                });
            };
            var track = backdrop.querySelector('.checkin-captcha-slider-track');

            function onPuzzleResize() {
                paintSlider(state.sliderX);
            }

            function dragToClientX(clientX) {
                if (!track) return;
                var rect = track.getBoundingClientRect();
                var knobW = knob ? knob.offsetWidth : PIECE;
                var travel = Math.max(1, rect.width - knobW);
                var ratio = Math.max(0, Math.min(1, (clientX - rect.left - knobW / 2) / travel));
                paintSlider(ratio * state.maxSlider);
                state.dragMeta.moveCount += 1;
                pushSample();
            }

            knob.onpointerdown = function (e) {
                e.preventDefault();
                beginDrag();
                if (knob.setPointerCapture) knob.setPointerCapture(e.pointerId);
            };
            knob.onpointermove = function (e) {
                if (!state.dragging) return;
                dragToClientX(e.clientX);
            };
            track.onpointerdown = function (e) {
                if (e.target === knob) return;
                beginDrag();
                dragToClientX(e.clientX);
            };
            track.onpointermove = function (e) {
                if (!state.dragging) return;
                dragToClientX(e.clientX);
            };
            function endDrag() {
                if (state.dragging) pushSample();
                state.dragging = false;
            }
            knob.onpointerup = endDrag;
            knob.onpointercancel = endDrag;
            track.onpointerup = endDrag;
            track.onpointercancel = endDrag;
            backdrop.onclick = function (e) {
                if (e.target === backdrop) {
                    closeModal();
                    reject(new Error('已取消验证'));
                }
            };

            backdrop.hidden = false;
            window.addEventListener('resize', onPuzzleResize);
            loadChallenge();
        });
    }

    global.CheckinCaptcha = { run: run };
})(typeof window !== 'undefined' ? window : global);
