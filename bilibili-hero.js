(function () {
    const HERO_BVIDS = ['BV1MqVr6KESA', 'BV1uqVr6KETK'];
    const END_EPSILON = 0.08;

    function apiBase() {
        const base = (typeof window !== 'undefined' && window.USS_AUTH_API_BASE) || 'http://127.0.0.1:3789';
        return String(base).replace(/\/$/, '');
    }

    function heroStreamUrl(bvid) {
        return `${apiBase()}/api/bilibili/hero-stream?bvid=${encodeURIComponent(bvid)}`;
    }

    function setProgressScale(el, ratio) {
        if (!el) return;
        const clamped = Math.min(1, Math.max(0, ratio));
        el.style.transform = 'scaleX(' + clamped + ')';
    }

    function initHeroVideos() {
        const video1 = document.getElementById('myVideo1');
        const video2 = document.getElementById('myVideo2');
        const progressFill = document.querySelector('.progress-fill');
        const nextVideoBtn = document.querySelector('.next-video');

        if (!video1 || !video2 || !HERO_BVIDS.length) return;

        const videos = [video1, video2];
        const bvids = HERO_BVIDS.slice(0, videos.length);
        let currentIndex = 0;
        let progressRaf = 0;

        videos.forEach(function (video, index) {
            video.muted = true;
            video.playsInline = true;
            video.loop = false;
            video.preload = index === 0 ? 'auto' : 'metadata';
            video.dataset.bvid = bvids[index] || bvids[0];
        });

        let currentVideo = video1;
        let nextVideo = video2;
        let isSwitching = false;

        function stopProgressLoop() {
            if (progressRaf) {
                cancelAnimationFrame(progressRaf);
                progressRaf = 0;
            }
        }

        function shouldAdvanceVideo(video) {
            if (!video || !video.duration || !isFinite(video.duration)) return false;
            if (video.ended) return true;
            return video.currentTime >= Math.max(0, video.duration - END_EPSILON);
        }

        function tickProgress() {
            progressRaf = 0;
            if (!currentVideo || !progressFill) return;

            if (shouldAdvanceVideo(currentVideo)) {
                setProgressScale(progressFill, 1);
                switchVideos();
                return;
            }

            if (currentVideo.duration && isFinite(currentVideo.duration)) {
                setProgressScale(progressFill, currentVideo.currentTime / currentVideo.duration);
            }

            if (!currentVideo.paused) {
                progressRaf = requestAnimationFrame(tickProgress);
            }
        }

        function startProgressLoop() {
            stopProgressLoop();
            progressRaf = requestAnimationFrame(tickProgress);
        }

        function attachSource(video) {
            const bvid = video.dataset.bvid;
            if (!bvid || video.dataset.loadedBvid === bvid) return;
            const source = video.querySelector('source');
            if (source) {
                source.src = heroStreamUrl(bvid);
            } else {
                video.src = heroStreamUrl(bvid);
            }
            video.dataset.loadedBvid = bvid;
            video.load();
        }

        function playCurrentVideo(fromStart) {
            attachSource(currentVideo);
            if (fromStart) {
                currentVideo.dataset.heroSkipIntro = '1';
                try {
                    currentVideo.currentTime = 0;
                } catch (ignore) {}
            }
            setProgressScale(progressFill, 0);
            const playPromise = currentVideo.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(function () {
                        startProgressLoop();
                    })
                    .catch(function () {});
            }
        }

        function switchVideos() {
            if (isSwitching) return;
            isSwitching = true;
            stopProgressLoop();
            currentVideo.classList.remove('active');
            currentVideo.pause();
            try {
                currentVideo.currentTime = 0;
            } catch (ignore) {}

            const temp = currentVideo;
            currentVideo = nextVideo;
            nextVideo = temp;
            currentIndex = (currentIndex + 1) % bvids.length;

            currentVideo.classList.add('active');
            playCurrentVideo(true);
            isSwitching = false;
        }

        function bindVideoProgress(video) {
            video.addEventListener('play', startProgressLoop);
            video.addEventListener('pause', stopProgressLoop);
            video.addEventListener('ended', function () {
                if (video === currentVideo) switchVideos();
            });
            video.addEventListener('seeking', function () {
                if (video !== currentVideo || !progressFill || !video.duration) return;
                setProgressScale(progressFill, video.currentTime / video.duration);
            });
            video.addEventListener('loadedmetadata', function () {
                if (video !== currentVideo || video.duration <= 1) return;
                if (video.dataset.heroSkipIntro === '1') {
                    delete video.dataset.heroSkipIntro;
                    return;
                }
                try {
                    video.currentTime = Math.min(video.duration * 0.3, video.duration - 0.2);
                } catch (ignore) {}
            });
        }

        video1.classList.add('active');
        bindVideoProgress(video1);
        bindVideoProgress(video2);
        playCurrentVideo(false);

        if (nextVideoBtn) {
            nextVideoBtn.addEventListener('click', switchVideos);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeroVideos);
    } else {
        initHeroVideos();
    }
})();
