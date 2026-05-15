document.addEventListener('DOMContentLoaded', () => {
    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    let lastScrollTop = 0;

    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop) {
            navbar.style.transform = 'translateY(-100%)';
        } else {
            navbar.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
    });

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Add parallax effect to hero section
    const heroContent = document.querySelector('.hero-content');
    window.addEventListener('scroll', () => {
        const scroll = window.pageYOffset;
        heroContent.style.transform = `translateY(${scroll * 0.5}px)`;
    });

    // Animate cards on scroll
    const cards = document.querySelectorAll('.card');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(50px)';
        card.style.transition = 'all 0.6s ease-out';
        observer.observe(card);
    });

    const video1 = document.getElementById('myVideo1');
    const video2 = document.getElementById('myVideo2');
    const progressFill = document.querySelector('.progress-fill');
    const currentVideoText = document.querySelector('.current-video');
    const nextVideoBtn = document.querySelector('.next-video');
    
    let currentVideo = video1;
    let nextVideo = video2;
    
    function switchVideos() {
        currentVideo.classList.remove('active');
        currentVideo.pause();
        
        // 切换视频
        const temp = currentVideo;
        currentVideo = nextVideo;
        nextVideo = temp;
        
        // 更新UI
        currentVideo.classList.add('active');
        currentVideo.currentTime = 0;
        currentVideo.play();
        
        // 修改这里的逻辑，确保第一个视频对应"欢迎登舰"
        const titles = ['欢迎登舰', '登舰成功'];
        nextVideoBtn.textContent = currentVideo === video1 ? '欢迎登舰' : '登舰成功';
    }
    
    // 初始设置时也要确保显示正确的文字
    function initializeVideos() {
        video1.classList.add('active');
        video1.muted = true;
        video2.muted = true;
        
        // 设置初始文字为"登舰成功"，因为当前是第一个视频在播放"欢迎登舰"
        nextVideoBtn.textContent = '登舰成功';
        
        // 设置自动播放
        const playPromise1 = video1.play();
        if (playPromise1 !== undefined) {
            playPromise1.catch(error => {
                console.log("Auto-play was prevented");
            });
        }
        
        // 减少进度条长度
        video1.addEventListener('loadedmetadata', () => {
            video1.currentTime = video1.duration * 0.3;  // 从30%处开始播放
        });
        
        video2.addEventListener('loadedmetadata', () => {
            video2.currentTime = video2.duration * 0.3;  // 从30%处开始播放
        });
    }

    // 调用初始化函数
    initializeVideos();
    
    // 更新进度条
    function updateProgress() {
        // 使用 requestAnimationFrame 使动画更流畅
        requestAnimationFrame(() => {
            const progress = (currentVideo.currentTime / currentVideo.duration) * 100;
            progressFill.style.width = `${progress}%`;
            
            if (currentVideo.ended) {
                switchVideos();
            }
        });
    }
    
    // 增加更新频率
    function addProgressListener(video) {
        video.addEventListener('timeupdate', updateProgress);
        // 添加额外的事件监听以提高更新频率
        video.addEventListener('progress', updateProgress);
        video.addEventListener('seeking', updateProgress);
        video.addEventListener('seeked', updateProgress);
    }

    // 应用到两个视频
    addProgressListener(video1);
    addProgressListener(video2);
    nextVideoBtn.addEventListener('click', switchVideos);
}); 