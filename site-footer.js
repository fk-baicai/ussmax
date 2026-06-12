(function () {
    'use strict';
    if (typeof document === 'undefined' || document.getElementById('ussSiteFooter')) return;

    var RSI_LOGO_SVG =
        '<svg class="uss-footer-rsi-logo" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 80 34" aria-hidden="true">' +
        '<path fill="#BCBEC0" fill-rule="evenodd" d="M24.907 25.642a1.35 1.35 0 0 1-1.155-1.005l-1.335-5.699 6.092-3a6.12 6.12 0 0 0 3.15-3.974l2.086-8.053A2.82 2.82 0 0 0 30.91.146H8.403L0 33.14h7.922l2.041-7.993 5.342-2.685 1.905 7.949a3.73 3.73 0 0 0 3.436 2.73h6.362l1.95-7.5zM12.47 15.144l1.89-7.499h9.168c.705 0 1.2.375 1.02.945a2.38 2.38 0 0 1-1.335 1.5l-10.803 5.399z" clip-rule="evenodd"></path>' +
        '<path fill="#FFA000" d="m59.058.146-1.951 7.5h1.41l1.951-7.5z"></path>' +
        '<path fill="#BCBEC0" d="m43.258 10.525 12.724 8.398a4.33 4.33 0 0 1 1.65 4.214l-1.83 7.184a3.87 3.87 0 0 1-3.556 2.76H36.22l1.965-7.5h9.738a1.5 1.5 0 0 0 1.38-1.049 1.35 1.35 0 0 0-.66-1.635l-12.813-8.533a4.3 4.3 0 0 1-1.65-4.274l1.83-7.214A3.78 3.78 0 0 1 39.4.146h18.366l-1.98 7.59v-.09l-11.824.09a1.38 1.38 0 0 0-1.5 1.094 1.5 1.5 0 0 0 .795 1.695M67.07.267s0-.12-8.462 32.874h8.012L75.022.31z"></path>' +
        '<path fill="#FFA000" d="M34.135 25.642 32.17 33.14h-1.32l1.965-7.5zM30.189 25.642v-.06l-2.01 7.558h1.365l1.98-7.498zM35.426 25.642h1.365l-1.95 7.499H33.46zM63.739 7.645l1.95-7.499h-1.275l-1.965 7.5zM63.079.146l-1.95 7.5h-1.291l1.965-7.5z"></path>' +
        '<path fill="#AAB5BB" d="M76.022 2.138c0-1.373.623-1.997 1.99-1.997S80 .768 80 2.138c0 1.372-.622 2-1.989 2s-1.989-.628-1.989-2m3.677 0c0-1.17-.529-1.701-1.692-1.701s-1.692.527-1.692 1.7c0 1.17.53 1.702 1.692 1.702 1.167 0 1.692-.532 1.692-1.701m-.887-.34c0 .393-.103.554-.404.61l.45.717c.022.022.012.043-.02.043h-.373c-.046 0-.064-.01-.082-.046l-.44-.685h-.222v.692c0 .032-.003.036-.032.036h-.361c-.032 0-.036-.008-.036-.036V1.182c0-.022.007-.032.032-.032.24-.022.494-.025.723-.025.569 0 .765.153.765.674m-1.09-.302v.62H78c.287 0 .372-.053.372-.303 0-.257-.085-.317-.372-.317z"></path>' +
        '</svg>';

    var SC_DISCLAIMER_EN =
        'This is an unofficial Star Citizen website and has no affiliation with any companies under the Cloud Imperium group.';
    var SC_DISCLAIMER_ZH = '本网站为星际公民非官方站点，与云帝国集团旗下各公司无任何隶属关系';

    var footer = document.createElement('footer');
    footer.id = 'ussSiteFooter';
    footer.className = 'uss-site-footer';
    footer.setAttribute('role', 'contentinfo');
    footer.setAttribute('data-nosnippet', '');
    footer.innerHTML =
        '<div class="uss-site-footer-main">' +
        '<div class="uss-site-footer-bar">' +
        '<div class="uss-site-footer-seg uss-site-footer-seg--brand">' +
        '<span class="uss-footer-sc-badge" tabindex="0" role="img" aria-label="' +
        SC_DISCLAIMER_EN +
        ' ' +
        SC_DISCLAIMER_ZH +
        '">' +
        '<img class="uss-footer-sc-community-logo" src="sp/png/%E7%A4%BE%E5%8C%BA.png" alt="星际公民非官方站点标识" width="64" height="64" decoding="async">' +
        '<span class="uss-footer-sc-badge-tip" role="tooltip">' +
        '<span class="uss-footer-sc-badge-tip-en">' +
        SC_DISCLAIMER_EN +
        '</span>' +
        '<span class="uss-footer-sc-badge-tip-zh">' +
        SC_DISCLAIMER_ZH +
        '</span>' +
        '</span>' +
        '</span>' +
        '</div>' +
        '<div class="uss-site-footer-vrule" aria-hidden="true"></div>' +
        '<div class="uss-site-footer-seg uss-site-footer-seg--community">' +
        '<nav class="uss-site-footer-seg-body" aria-label="社区链接">' +
        '<ul class="uss-footer-link-list uss-footer-link-list--duo">' +
        '<li><a class="uss-footer-link-row" href="https://apps.microsoft.com/detail/9nf3swfwnkl1?launch=false&amp;mode=mini&amp;hl=zh-CN&amp;gl=CN" target="_blank" rel="noopener noreferrer" aria-label="SC汉化盒子 · Microsoft Store">' +
        '<span class="uss-footer-link-row-icon"><img class="uss-footer-hanghua-logo" src="sp/png/hanghua.png" alt="" width="32" height="32" decoding="async"><span class="uss-footer-link-desc-tip" role="tooltip">Microsoft Store</span></span>' +
        '<span class="uss-footer-link-row-text"><span class="uss-footer-link-title">SC汉化盒子</span></span></a></li>' +
        '<li><a class="uss-footer-link-row uss-footer-link-row--chub" href="https://citizenshub.app/app-settings" target="_blank" rel="noopener noreferrer" aria-label="Citizens\' Hub · CCU 路线规划">' +
        '<span class="uss-footer-link-row-icon"><img class="uss-footer-chub-logo" src="sp/png/citizenshub.png" alt="" width="32" height="32" decoding="async"><span class="uss-footer-link-desc-tip" role="tooltip">CCU 路线规划</span></span>' +
        '<span class="uss-footer-link-row-text"><span class="uss-footer-link-title">Citizens\' Hub</span></span></a></li>' +
        '<li><a class="uss-footer-link-row uss-footer-link-row--erkul" href="https://www.erkul.games/live/calculator" target="_blank" rel="noopener noreferrer" aria-label="DPS 计算器 · Erkul.games">' +
        '<span class="uss-footer-link-row-icon"><img class="uss-footer-erkul-logo" src="sp/png/erkul.png" alt="" width="32" height="32" decoding="async"><span class="uss-footer-link-desc-tip" role="tooltip">Erkul.games</span></span>' +
        '<span class="uss-footer-link-row-text"><span class="uss-footer-link-title">DPS 计算器</span></span></a></li>' +
        '<li><a class="uss-footer-link-row uss-footer-link-row--sctools" href="https://starcitizen.tools/" target="_blank" rel="noopener noreferrer" aria-label="SC Wiki · Star Citizen Wiki">' +
        '<span class="uss-footer-link-row-icon"><img class="uss-footer-sctools-logo" src="sp/svg/sctools-logo.svg" alt="" width="32" height="32" decoding="async"><span class="uss-footer-link-desc-tip" role="tooltip">Star Citizen Wiki</span></span>' +
        '<span class="uss-footer-link-row-text"><span class="uss-footer-link-title">SC Wiki</span></span></a></li>' +
        '</ul>' +
        '</nav>' +
        '</div>' +
        '<div class="uss-site-footer-vrule" aria-hidden="true"></div>' +
        '<div class="uss-site-footer-seg uss-site-footer-seg--official">' +
        '<nav class="uss-site-footer-seg-body" aria-label="官方">' +
        '<ul class="uss-footer-link-list uss-footer-link-list--middle">' +
        '<li><a class="uss-footer-link-row uss-footer-link-row--rsi" href="https://robertsspaceindustries.com/en/" target="_blank" rel="noopener noreferrer" aria-label="星际公民 · Roberts Space Industries">' +
        '<span class="uss-footer-link-row-icon uss-footer-link-row-icon--rsi">' +
        RSI_LOGO_SVG +
        '<span class="uss-footer-link-desc-tip" role="tooltip">Roberts Space Industries</span>' +
        '</span>' +
        '<span class="uss-footer-link-row-text"><span class="uss-footer-link-title">星际公民</span></span>' +
        '</a></li>' +
        '</ul>' +
        '</nav>' +
        '</div>' +
        '<div class="uss-site-footer-vrule" aria-hidden="true"></div>' +
        '<div class="uss-site-footer-seg uss-site-footer-seg--fleet">' +
        '<nav class="uss-site-footer-seg-body" aria-label="舰队活动">' +
        '<ul class="uss-footer-link-list uss-footer-link-list--middle">' +
        '<li><a class="uss-footer-link-row uss-footer-link-row--bc" href="hangzhou-barcitizen.html" aria-label="杭州 BARCITIZEN · U.S.S 杭州线下活动">' +
        '<span class="uss-footer-link-row-icon"><span class="uss-footer-bc-badge" aria-hidden="true">BC</span><span class="uss-footer-link-desc-tip" role="tooltip">U.S.S 杭州线下活动</span></span>' +
        '<span class="uss-footer-link-row-text"><span class="uss-footer-link-title">杭州 BARCITIZEN</span></span></a></li>' +
        '</ul>' +
        '</nav>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="uss-site-footer-bottom">' +
        '<div class="uss-site-footer-bottom-inner">' +
        '<a class="uss-site-footer-copy" href="index.html" aria-label="回到首页">© UMBRELLA FLEET · USSXC</a>' +
        '</div>' +
        '</div>';

    document.body.appendChild(footer);
})();
