/** 密码显示/隐藏：自定义眼睛 SVG 双图标切换（内联 SVG，不依赖外网字体） */
(function () {
    var EYE_VIEWBOX = '0 0 1707 1024';
    var EYE =
        '<path d="M807.822 318.578c-102.4 0-182.044 79.644-182.044 193.422 0 45.511 22.755 102.4 56.889 136.533 22.755 34.134 68.266 45.511 125.155 45.511 102.4 0 182.045-79.644 182.045-193.422 0-102.4-79.645-182.044-182.045-182.044z"/>' +
        '<path d="M1581.511 477.867C1570.133 466.489 1194.667 0 807.822 0 420.978 0 45.512 455.111 22.756 477.867L0 512l22.756 34.133C45.51 557.511 409.6 1024 807.822 1024c409.6 0 762.311-455.111 785.067-477.867L1615.644 512l-34.133-34.133zM807.822 807.822c-79.644 0-147.91-34.133-193.422-91.022-68.267-56.889-91.022-125.156-91.022-204.8 0-159.289 125.155-295.822 284.444-295.822 159.29 0 284.445 136.533 284.445 295.822 0 159.289-136.534 295.822-284.445 295.822z"/>';

    var SLASH =
        '<path fill="none" stroke="currentColor" stroke-width="88" stroke-linecap="round" d="M220 240l1267 544"/>';

    function eyeSvg(extraClass, hidden) {
        var hiddenAttr = hidden ? ' hidden' : '';
        return (
            '<svg class="rsi-pw-icon ' +
            extraClass +
            '" xmlns="http://www.w3.org/2000/svg" viewBox="' +
            EYE_VIEWBOX +
            '" fill="currentColor" aria-hidden="true"' +
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
            if (btn.getAttribute('data-pw-icon-v') === '2') return;
            btn.innerHTML = buildPwToggleInner();
            btn.setAttribute('data-pw-icon-v', '2');
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
