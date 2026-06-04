/** 密码显示/隐藏：RSI Orion 风格双图标切换（内联 SVG，不依赖外网字体） */
(function () {
    var EYE =
        '<path d="M834.2 489.7c-35.9-43.4-83.7-79.5-138.4-104.2-56.3-25.5-119.8-39-183.8-39s-127.6 13.5-183.8 39c-54.7 24.8-102.5 60.8-138.4 104.2-10.7 12.9-10.7 31.7 0 44.6 35.9 43.4 83.7 79.5 138.4 104.2 56.3 25.5 119.8 39 183.8 39s127.6-13.5 183.8-39c54.7-24.8 102.5-60.8 138.4-104.2 10.7-12.9 10.7-31.7 0-44.6zm-23.1 25.5C742.7 598 630.9 647.5 512 647.5S281.3 598 212.9 515.2c-1.5-1.9-1.5-4.5 0-6.4C281.3 426 393.1 376.5 512 376.5S742.7 426 811.1 508.8c1.5 1.9 1.5 4.5 0 6.4z"/>' +
        '<path d="M512 417a95 95 0 1 0 0 190 95 95 0 1 0 0-190z"/>';

    var SLASH =
        '<path fill="none" stroke="currentColor" stroke-width="80" stroke-linecap="round" d="M180 180l664 664"/>';

    function eyeSvg(extraClass, hidden) {
        var hiddenAttr = hidden ? ' hidden' : '';
        return (
            '<svg class="rsi-pw-icon ' +
            extraClass +
            '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true"' +
            hiddenAttr +
            '>' +
            EYE +
            (extraClass.indexOf('--hide') !== -1 ? SLASH : '') +
            '</svg>'
        );
    }

    window.RSI_PW_TOGGLE_ICONS_HTML =
        eyeSvg('rsi-pw-icon--hide', true) + eyeSvg('rsi-pw-icon--show', false);

    function buildPwToggleInner() {
        return (
            '<span class="rsi-pw-btn__bg" aria-hidden="true"></span>' +
            '<span class="rsi-pw-btn__content">' +
            '<span class="rsi-pw-toggle-icon rsi-pw-animated-icon" aria-hidden="true">' +
            window.RSI_PW_TOGGLE_ICONS_HTML +
            '</span></span>'
        );
    }

    function upgradePwToggleButtons() {
        document.querySelectorAll('.rsi-pw-toggle').forEach(function (btn) {
            btn.classList.add('rsi-pw-btn');
            if (btn.getAttribute('data-pw-orion') === '1') return;
            btn.innerHTML = buildPwToggleInner();
            btn.setAttribute('data-pw-orion', '1');
            if (!btn.getAttribute('aria-label') || btn.getAttribute('aria-label') === '显示或隐藏密码') {
                btn.setAttribute('aria-label', '显示密码');
            }
        });
    }

    window.RsiPwToggleIcons = {
        upgrade: upgradePwToggleButtons,
        buildInner: buildPwToggleInner,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', upgradePwToggleButtons);
    } else {
        upgradePwToggleButtons();
    }
})();
