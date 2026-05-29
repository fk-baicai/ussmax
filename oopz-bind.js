(function () {
    'use strict';

    var openBtn = document.getElementById('oopzBindOpenBtn');
    var backdrop = document.getElementById('oopzBindBackdrop');
    if (!backdrop) return;

    function loadAuthSession() {
        if (window.UssAuthSessionSync && window.UssAuthSessionSync.loadAuthSession) {
            return window.UssAuthSessionSync.loadAuthSession();
        }
        try {
            var raw = sessionStorage.getItem('ussHangzhouAuthSession') || localStorage.getItem('ussHangzhouAuthSession');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function sessionUsesRemember() {
        if (window.UssAuthSessionSync && window.UssAuthSessionSync.saveAuthSession) {
            try {
                return !!localStorage.getItem('ussHangzhouAuthSession') && !sessionStorage.getItem('ussHangzhouAuthSession');
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    function refreshHeadButton(sess) {
        if (!openBtn) return;
        var loggedIn = !!(sess && sess.token);
        openBtn.disabled = false;
        if (!loggedIn) {
            openBtn.textContent = 'OOPZ 绑定';
            openBtn.title = '登录后可绑定 OOPZ ID';
            openBtn.classList.remove('is-bound');
            return;
        }
        var oopzId = sess.oopzId ? String(sess.oopzId) : '';
        if (oopzId) {
            openBtn.textContent = '已绑定 · ' + oopzId;
            openBtn.title = '点击查看 OOPZ 绑定信息';
            openBtn.classList.add('is-bound');
        } else {
            openBtn.textContent = 'OOPZ 绑定';
            openBtn.title = '绑定 OOPZ ID';
            openBtn.classList.remove('is-bound');
        }
    }

    function fillModal(sess) {
        var boundEl = document.getElementById('oopzBindBoundText');
        var rowEl = document.getElementById('oopzBindFormRow');
        var inputEl = document.getElementById('oopzBindIdInput');
        var submitBtn = document.getElementById('oopzBindSubmitBtn');
        var lockedEl = document.getElementById('oopzBindLocked');
        var hintEl = document.getElementById('oopzBindHint');
        if (!boundEl || !rowEl || !inputEl || !submitBtn) return;

        var oopzId = sess && sess.oopzId ? String(sess.oopzId) : '';
        var oopzName = sess && sess.oopzName ? String(sess.oopzName) : '';

        if (oopzId) {
            boundEl.textContent = '已绑定：' + oopzId + (oopzName ? ' · ' + oopzName : '');
            if (lockedEl) {
                lockedEl.textContent = '绑定后不可自行更换或解绑，如需调整请联系管理员。';
                lockedEl.hidden = false;
            }
            if (hintEl) hintEl.hidden = true;
            rowEl.hidden = true;
            submitBtn.hidden = true;
        } else {
            boundEl.textContent = '尚未绑定 OOPZ ID';
            if (lockedEl) lockedEl.hidden = true;
            if (hintEl) hintEl.hidden = false;
            rowEl.hidden = false;
            submitBtn.hidden = false;
            submitBtn.textContent = '确认绑定';
            if (!inputEl.matches(':focus')) inputEl.value = '';
        }
    }

    function openModal() {
        var sess = loadAuthSession();
        if (!sess || !sess.token) {
            if (typeof window.openLoginDrawer === 'function') {
                window.openLoginDrawer();
            } else {
                alert('请先登录后再绑定 OOPZ ID');
            }
            return;
        }
        fillModal(sess);
        backdrop.hidden = false;
        document.body.classList.add('oopz-bind-open');
        var inputEl = document.getElementById('oopzBindIdInput');
        if (inputEl && !inputEl.closest('[hidden]')) setTimeout(function () { inputEl.focus(); }, 50);
    }

    function closeModal() {
        backdrop.hidden = true;
        document.body.classList.remove('oopz-bind-open');
    }

    async function submitBind() {
        var sess = loadAuthSession();
        if (!sess || !sess.token) {
            alert('请先登录');
            return;
        }
        if (sess.oopzId) {
            alert('OOPZ ID 已绑定，无法自行更换或解绑，请联系管理员');
            return;
        }
        var inputEl = document.getElementById('oopzBindIdInput');
        var submitBtn = document.getElementById('oopzBindSubmitBtn');
        var oopzId = inputEl ? String(inputEl.value || '').trim() : '';
        if (!/^\d{5,12}$/.test(oopzId)) {
            alert('请输入 5–12 位数字的 OOPZ ID');
            return;
        }
        if (submitBtn) submitBtn.disabled = true;
        try {
            var data = await window.UssAuthApi.bindOopzId(sess.token, oopzId);
            var merged = window.UssAuthSessionSync
                ? window.UssAuthSessionSync.mergeUserIntoSession(sess.token, data.user || data, sess)
                : Object.assign({}, sess, data.user || data);
            if (window.UssAuthSessionSync) {
                window.UssAuthSessionSync.saveAuthSession(merged, sessionUsesRemember());
            }
            refreshHeadButton(merged);
            fillModal(merged);
            if (typeof window.refreshLoginDrawerView === 'function') {
                window.refreshLoginDrawerView();
            }
            alert('OOPZ ID 绑定成功');
        } catch (e) {
            alert(e.message || '绑定失败');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function refreshAll() {
        var sess = loadAuthSession();
        refreshHeadButton(sess);
        if (typeof window.refreshOopzUserPrefs === 'function') {
            window.refreshOopzUserPrefs();
        }
    }

    openBtn && openBtn.addEventListener('click', openModal);
    backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) closeModal();
    });
    var closeBtn = document.getElementById('oopzBindCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    var submitBtn = document.getElementById('oopzBindSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', submitBind);

    window.openOopzBindModal = openModal;
    window.refreshOopzBindSection = refreshAll;
    refreshAll();

    try {
        var p = new URLSearchParams(window.location.search || '');
        if (p.get('oopzBind') === '1' || p.get('oopzBind') === 'true') {
            openModal();
            p.delete('oopzBind');
            var qs = p.toString();
            var nextUrl = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '');
            window.history.replaceState({}, '', nextUrl);
        }
    } catch (eQuery) {
        /* ignore */
    }
})();
