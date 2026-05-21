/**
 * 杭州 BARCITIZEN 活动页：购票提示 / 退票验证
 */
(function () {
    'use strict';

    var whitelistedQQNumbers = ['33009004043', '2418299632', '52640099364'];

    function isQQInWhitelist(qqNumber) {
        return whitelistedQQNumbers.indexOf(qqNumber) !== -1;
    }

    function showAlert(message) {
        var modal = document.getElementById('alertModal');
        var msgEl = document.getElementById('alertMessage');
        var overlay = document.getElementById('overlay');
        if (msgEl) msgEl.textContent = message;
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.classList.add('active');
    }

    function closeAlert() {
        var modal = document.getElementById('alertModal');
        var overlay = document.getElementById('overlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.classList.remove('active');
    }

    function showTicketPurchaseClosedNotice() {
        showAlert('USS HANGZHOU BC 已完美闭幕');
    }

    function verifyRefund() {
        var qqNumber = prompt('请输入你的QQ号进行验证：');
        if (!qqNumber) return;
        if (isQQInWhitelist(qqNumber)) {
            showAlert('请联系主办方发送你的支付信息和备注的手机号\nQQ：330094043');
        } else {
            showAlert('未查询到你的预约！请联系主办方');
        }
    }

    window.showTicketPurchaseClosedNotice = showTicketPurchaseClosedNotice;
    window.verifyRefund = verifyRefund;
    window.closeAlert = closeAlert;

    document.addEventListener('DOMContentLoaded', function () {
        var overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.addEventListener('click', closeAlert);
        }
    });
})();
