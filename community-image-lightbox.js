/**
 * 社区图片灯箱：滚轮缩放、按住拖动平移。
 * 首页聊天区与帖子详情页共用。
 */
(function (global) {
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 8;
    const ZOOM_STEP = 0.12;

    const state = {
        scale: 1,
        tx: 0,
        ty: 0,
        dragging: false,
        dragMoved: false,
        lastX: 0,
        lastY: 0,
        wired: false,
        keyHandler: null,
    };

    function getOverlay() {
        return document.getElementById('communityImageLightbox');
    }

    function getImg(overlay) {
        const root = overlay || getOverlay();
        return root ? root.querySelector('.community-image-lightbox-img') : null;
    }

    function notifyChange() {
        try {
            document.dispatchEvent(new CustomEvent('uss-community-lightbox-change'));
        } catch (e) {
            /* ignore */
        }
    }

    function applyTransform(img) {
        if (!img) return;
        img.style.transform = 'translate(' + state.tx + 'px, ' + state.ty + 'px) scale(' + state.scale + ')';
    }

    function resetTransform(img) {
        state.scale = 1;
        state.tx = 0;
        state.ty = 0;
        state.dragging = false;
        state.dragMoved = false;
        if (img) {
            img.style.transform = '';
            img.classList.remove('is-dragging');
        }
    }

    function wireIfNeeded(overlay) {
        if (state.wired || !overlay) return;
        const img = getImg(overlay);
        if (!img) return;
        state.wired = true;

        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) close();
        });

        img.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (!state.dragMoved && state.scale <= 1) close();
        });

        img.addEventListener('mousedown', function (ev) {
            if (ev.button !== 0) return;
            ev.preventDefault();
            state.dragging = true;
            state.dragMoved = false;
            state.lastX = ev.clientX;
            state.lastY = ev.clientY;
            img.classList.add('is-dragging');
        });

        document.addEventListener('mousemove', function (ev) {
            if (!state.dragging || !overlay.classList.contains('is-open')) return;
            const dx = ev.clientX - state.lastX;
            const dy = ev.clientY - state.lastY;
            if (dx !== 0 || dy !== 0) state.dragMoved = true;
            state.tx += dx;
            state.ty += dy;
            state.lastX = ev.clientX;
            state.lastY = ev.clientY;
            applyTransform(img);
        });

        document.addEventListener('mouseup', function () {
            if (!state.dragging) return;
            state.dragging = false;
            img.classList.remove('is-dragging');
        });

        overlay.addEventListener(
            'wheel',
            function (ev) {
                if (!overlay.classList.contains('is-open')) return;
                ev.preventDefault();
                const delta = ev.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
                const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale * (1 + delta)));
                const rect = img.getBoundingClientRect();
                const offsetX = ev.clientX - rect.left - rect.width / 2;
                const offsetY = ev.clientY - rect.top - rect.height / 2;
                const ratio = newScale / state.scale;
                state.tx -= offsetX * (ratio - 1);
                state.ty -= offsetY * (ratio - 1);
                state.scale = newScale;
                applyTransform(img);
            },
            { passive: false }
        );
    }

    function ensureOverlay() {
        let overlay = getOverlay();
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'communityImageLightbox';
            overlay.className = 'community-image-lightbox';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-hidden', 'true');
            const img = document.createElement('img');
            img.className = 'community-image-lightbox-img';
            img.alt = '';
            img.decoding = 'async';
            img.draggable = false;
            overlay.appendChild(img);
            document.body.appendChild(overlay);
        }
        wireIfNeeded(overlay);
        return overlay;
    }

    function open(src) {
        if (!src) return;
        const overlay = ensureOverlay();
        const img = getImg(overlay);
        if (!img) return;
        resetTransform(img);
        img.src = src;
        img.alt = '放大预览';
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        notifyChange();
        if (state.keyHandler) document.removeEventListener('keydown', state.keyHandler);
        state.keyHandler = function (ev) {
            if (ev.key === 'Escape') close();
        };
        document.addEventListener('keydown', state.keyHandler);
    }

    function close() {
        const overlay = getOverlay();
        if (!overlay) return;
        const img = getImg(overlay);
        resetTransform(img);
        if (img) {
            img.removeAttribute('src');
            img.alt = '';
        }
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        notifyChange();
        if (state.keyHandler) {
            document.removeEventListener('keydown', state.keyHandler);
            state.keyHandler = null;
        }
    }

    global.UssCommunityImageLightbox = {
        open: open,
        close: close,
        ensureOverlay: ensureOverlay,
    };
})(typeof window !== 'undefined' ? window : globalThis);
