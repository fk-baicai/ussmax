(function () {
    /** 首页舰船宣传视频（本地静态资源，原 B 站 BV1MqVr6KESA / BV1uqVr6KETK） */
    const HERO_SOURCES = ['videos/hero-1.mp4', 'videos/hero-2.mp4'];
    const END_EPSILON = 0.08;
    let started = false;

    function deferHeroStart() {
        if (started) return;
        started = true;
        initHeroVideos();
    }

    function scheduleHeroVideos() {
        if (started) return;
        const run = function () {
            if (window.UssLazyMedia && typeof window.UssLazyMedia.runWhenIdle === 'function') {
                window.UssLazyMedia.runWhenIdle(deferHeroStart, 900);
            } else {
                setTimeout(deferHeroStart, 900);
            }
        };
        if (window.__ussPageReady) {
            run();
            return;
        }
        window.addEventListener(
            'uss:page-ready',
            function onReady() {
                window.removeEventListener('uss:page-ready', onReady);
                run();
            },
            { once: true }
        );
        setTimeout(function () {
            if (!started) run();
        }, 4000);
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

        if (!video1 || !video2 || !HERO_SOURCES.length) return;

        const videos = [video1, video2];
        const sources = HERO_SOURCES.slice(0, videos.length);
        let currentIndex = 0;
        let progressRaf = 0;

        videos.forEach(function (video, index) {
            video.muted = true;
            video.playsInline = true;
            video.loop = false;
            video.preload = 'none';
            video.dataset.heroSrc = sources[index] || sources[0];
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
            const src = video.dataset.heroSrc;
            if (!src || video.dataset.loadedSrc === src) return;
            const source = video.querySelector('source');
            if (source) {
                source.src = src;
            } else {
                video.src = src;
            }
            video.dataset.loadedSrc = src;
            video.load();
        }

        function preloadNextVideo() {
            if (!nextVideo || nextVideo === currentVideo) return;
            if (nextVideo.dataset.loadedSrc) return;
            attachSource(nextVideo);
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
                        if (window.UssLazyMedia) {
                            window.UssLazyMedia.runWhenIdle(preloadNextVideo, 1200);
                        } else {
                            setTimeout(preloadNextVideo, 1200);
                        }
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
            currentIndex = (currentIndex + 1) % sources.length;

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
        document.addEventListener('DOMContentLoaded', scheduleHeroVideos);
    } else {
        scheduleHeroVideos();
    }
})();
