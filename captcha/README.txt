签到验证底图来源（二选一，缺图时自动用代码生成）：

1) 程序化底图（推荐，无需本目录图片）
   - 后端用 Jimp 按随机 seed 生成科幻风底图
   - 环境变量 USS_CAPTCHA_SOURCE=procedural 强制只用代码
   - 静态图缺失时也会自动回退到程序化

2) 静态图 a/b/c（可选）
   - a.jpg / b.jpg / c.jpg（或 jpeg/png/webp）
   - 环境变量 USS_CAPTCHA_SOURCE=files 强制只用静态图
   - 后端启动时会自动搜寻目录（适配 GitHub 部署路径差异），找到后缓存到内存

推荐放置路径（任选其一，须含 a/b/c 三张）：
  frontend/captcha/     ← 与前端同仓（推荐）
  仓库根 captcha/       ← GitHub 上 ussmax/captcha
  backend/captcha/      ← 仅部署 backend 文件夹时
  环境变量 CHECKIN_CAPTCHA_DIR=绝对路径

若路径不在上述列表，启动时会从项目根浅层自动搜索名为 captcha 且含 a/b/c 的文件夹。

为何不在纯前端生成拼图？
   - 缺口横坐标 targetX 必须只存在服务端，否则可被脚本直接读取
   - 前端只负责显示后端返回的 bgDataUrl / pieceDataUrl

调试：frontend/captcha-art.js 可用 Canvas 预览同风格底图（不参与正式校验）
