/**
 * 签到验证底图 — Canvas 程序化绘制（与后端 generateProceduralSourceImage 同风格）。
 * 注意：缺口位置 targetX 仅保存在服务端，拼图仍由后端裁剪后以 data URL 下发给前端显示。
 * 本模块可用于预览/调试；正式验证请使用后端 /api/checkin/captcha/:id/puzzle 返回的 bgDataUrl。
 */
(function (global) {
    'use strict';

    function seededRandom(imageSeed) {
        var s = Number(imageSeed) >>> 0;
        if (!s) s = 1;
        return function next() {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {number} imageSeed
     */
    function drawCaptchaBase(ctx, width, height, imageSeed) {
        var rand = seededRandom(imageSeed);
        var w = width || 300;
        var h = height || 150;
        var img = ctx.createImageData(w, h);
        var data = img.data;

        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var t = y / h;
                var wave = Math.sin((x / w) * Math.PI * 2.4 + imageSeed * 0.001) * 0.08;
                var i = (y * w + x) * 4;
                data[i] = Math.min(255, Math.floor(8 + t * 22 + wave * 20 + rand() * 10));
                data[i + 1] = Math.min(255, Math.floor(22 + t * 48 + wave * 28 + rand() * 14));
                data[i + 2] = Math.min(255, Math.floor(42 + t * 72 + wave * 18 + rand() * 18));
                data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);

        var blobCount = 5 + Math.floor(rand() * 4);
        for (var b = 0; b < blobCount; b++) {
            var cx = rand() * w;
            var cy = rand() * h;
            var rad = 28 + rand() * 64;
            var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
            g.addColorStop(0, 'rgba(' + Math.floor(30 + rand() * 90) + ',' + Math.floor(70 + rand() * 120) + ',' + Math.floor(60 + rand() * 110) + ',0.45)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        }

        var starCount = 90 + Math.floor(rand() * 80);
        ctx.fillStyle = '#fff';
        for (var s = 0; s < starCount; s++) {
            var sx = Math.floor(rand() * w);
            var sy = Math.floor(rand() * h);
            var br = 140 + Math.floor(rand() * 115);
            ctx.fillStyle = 'rgb(' + br + ',' + br + ',' + Math.min(255, br + 30) + ')';
            ctx.fillRect(sx, sy, 1, 1);
        }
    }

    global.UssCaptchaArt = {
        drawCaptchaBase: drawCaptchaBase,
        seededRandom: seededRandom,
    };
})(typeof window !== 'undefined' ? window : globalThis);
