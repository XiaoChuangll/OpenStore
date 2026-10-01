/*
 * 文件上传统一入口。
 *
 * 上传目录固定为 server/uploads，文件名用「时间戳 + 随机串」避免撞名，
 * 单文件大小上限由 UPLOAD_MAX_BYTES 控制。
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// /uploads 静态服务用的强制下载扩展名（能执行脚本的类型不当作页面打开）
const UPLOAD_FORCE_DOWNLOAD_EXT = /\.(html?|xhtml|svg|xml|js|mjs|css)$/i;
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
// 单文件大小上限：以前没设限，管理员账号可以往磁盘里灌任意大的文件
const UPLOAD_MAX_BYTES = Math.max(Number(process.env.UPLOAD_MAX_BYTES) || 256 * 1024 * 1024, 1024 * 1024);
const upload = multer({ storage, limits: { fileSize: UPLOAD_MAX_BYTES } });

module.exports = { uploadsDir, UPLOAD_FORCE_DOWNLOAD_EXT, UPLOAD_MAX_BYTES, upload };
