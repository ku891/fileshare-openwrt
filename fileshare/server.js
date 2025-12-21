const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// 调试：记录实际使用的端口
console.log(`[DEBUG] 环境变量 PORT: ${process.env.PORT}`);
console.log(`[DEBUG] 实际监听端口: ${PORT}`);

// 访问控制配置
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '123456'; // 默认密码
// 允许免密码访问的主机，支持从环境变量读取（逗号分隔）
const ALLOWED_HOSTS_ENV = process.env.ALLOWED_HOSTS || '';
const ALLOWED_HOSTS = ALLOWED_HOSTS_ENV 
  ? ALLOWED_HOSTS_ENV.split(',').map(h => h.trim()).filter(h => h)
  : ['fi.le', '192.168.2.157']; // 默认允许的主机
const MAX_FAILED_ATTEMPTS = 5; // 最大错误次数
const LOCKOUT_DURATION = 24 * 60 * 60 * 1000; // 锁定时长（24小时，毫秒）

// 密码错误记录
const failedAttempts = new Map(); // key: ip, value: { count: number, lockUntil: timestamp }

// 创建上传目录
const uploadDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadDir);

// 文本共享数据存储
const sharedTextFile = path.join(__dirname, 'shared-text.txt');
let sharedText = '';

// 加载共享文本
async function loadSharedText() {
  try {
    if (fs.existsSync(sharedTextFile)) {
      sharedText = await fs.readFile(sharedTextFile, 'utf8');
      console.log('共享文本已加载');
    }
  } catch (error) {
    console.error('加载共享文本失败:', error);
  }
}

// 保存共享文本到文件
async function saveSharedTextToFile(text) {
  try {
    await fs.writeFile(sharedTextFile, text, 'utf8');
    console.log('共享文本已保存到文件');
  } catch (error) {
    console.error('保存共享文本失败:', error);
  }
}

// 启动时加载文本
loadSharedText();

// 创建 public 目录路径
const publicDir = path.join(__dirname, 'public');

// 中间件
app.use(cors());
app.use(express.json());
// 静态文件服务（不需要密码验证）
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

// 根路径路由，确保 index.html 能被正确提供
app.get('/', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found');
  }
});

// 判断是否为内网 IP
function isPrivateIP(ip) {
  if (!ip) return false;
  // 移除 IPv6 前缀（如果有）
  const cleanIP = ip.replace(/^::ffff:/, '');
  
  // 内网 IP 范围：
  // 10.0.0.0 - 10.255.255.255
  // 172.16.0.0 - 172.31.255.255
  // 192.168.0.0 - 192.168.255.255
  // 127.0.0.0 - 127.255.255.255 (localhost)
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./
  ];
  
  return privateRanges.some(range => range.test(cleanIP));
}

// 密码验证中间件
function checkPassword(req, res, next) {
  const host = req.get('host') || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  
  // 判断是否为外网访问
  const isExternalAccess = !isPrivateIP(ip);
  
  // 外网访问必须提供密码，无论是否在允许列表中
  if (isExternalAccess) {
    // 外网访问，必须验证密码，跳过允许列表检查
  } else {
    // 内网访问，检查是否在允许的主机列表中
    const isAllowedHost = ALLOWED_HOSTS.some(allowed => 
      host.includes(allowed) || ip.includes(allowed)
    );
    
    if (isAllowedHost) {
      // 允许的主机，不需要密码
      return next();
    }
  }
  
  // 检查是否被锁定
  const attemptRecord = failedAttempts.get(ip);
  if (attemptRecord && attemptRecord.lockUntil && Date.now() < attemptRecord.lockUntil) {
    const remainingTime = Math.ceil((attemptRecord.lockUntil - Date.now()) / 1000 / 60 / 60); // 剩余小时数
    return res.status(401).json({ 
      requiresPassword: true,
      message: `密码错误次数过多，账户已被锁定。剩余时间：${remainingTime}小时`,
      locked: true,
      remainingHours: remainingTime
    });
  }
  
  // 如果锁定时间已过，清除记录
  if (attemptRecord && attemptRecord.lockUntil && Date.now() >= attemptRecord.lockUntil) {
    failedAttempts.delete(ip);
  }
  
  // 需要密码验证
  const password = req.headers['x-access-password'] || req.query.password;
  
  if (!password) {
    const message = isExternalAccess 
      ? '外网访问必须提供密码' 
      : '需要密码才能访问';
    return res.status(401).json({ 
      requiresPassword: true,
      message: message,
      isExternalAccess: isExternalAccess
    });
  }
  
  if (password !== ACCESS_PASSWORD) {
    // 密码错误，记录失败次数
    const currentCount = attemptRecord ? attemptRecord.count : 0;
    const newCount = currentCount + 1;
    
    if (newCount >= MAX_FAILED_ATTEMPTS) {
      // 达到最大错误次数，锁定账户
      const lockUntil = Date.now() + LOCKOUT_DURATION;
      failedAttempts.set(ip, { count: newCount, lockUntil });
      
      console.log(`IP ${ip} 因密码错误次数过多被锁定24小时`);
      
      return res.status(401).json({ 
        requiresPassword: true,
        message: `密码错误次数过多，账户已被锁定24小时`,
        locked: true,
        remainingHours: 24
      });
    } else {
      // 记录错误次数
      failedAttempts.set(ip, { count: newCount, lockUntil: null });
      
      const remainingAttempts = MAX_FAILED_ATTEMPTS - newCount;
      return res.status(401).json({ 
        requiresPassword: true,
        message: `密码错误，剩余尝试次数：${remainingAttempts}`,
        remainingAttempts: remainingAttempts
      });
    }
  }
  
  // 密码正确，清除错误记录
  if (attemptRecord) {
    failedAttempts.delete(ip);
  }
  
  next();
}

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => cb(null, true)
});

// 获取文件列表
app.get('/api/files', checkPassword, async (req, res) => {
  try {
    const files = await fs.readdir(uploadDir);
    const fileList = await Promise.all(files.map(async (file) => {
      const filePath = path.join(uploadDir, file);
      const stats = await fs.stat(filePath);
      const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file);
      const isVideo = /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(file);
      return {
        name: file,
        size: stats.size,
        uploadTime: stats.birthtime,
        isImage: isImage,
        isVideo: isVideo
      };
    }));
    
    fileList.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
    res.json(fileList);
  } catch (error) {
    res.status(500).json({ error: '获取文件列表失败' });
  }
});

// 文件上传
app.post('/api/upload', checkPassword, upload.array('files', 10), (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ error: '没有文件被上传' });
    }
    
    const uploadedFiles = req.files.map(file => ({
      name: file.filename,
      originalName: file.originalname,
      size: file.size
    }));
    
    res.json({ message: '文件上传成功', files: uploadedFiles });
  } catch (error) {
    res.status(500).json({ error: '文件上传失败' });
  }
});

// 文件下载
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, req.params.filename);
  } else {
    res.status(404).json({ error: '文件不存在' });
  }
});

// 删除文件
app.delete('/api/delete/:filename', checkPassword, async (req, res) => {
  try {
    const filePath = path.join(uploadDir, req.params.filename);
    
    if (fs.existsSync(filePath)) {
      await fs.remove(filePath);
      res.json({ message: '文件删除成功' });
    } else {
      res.status(404).json({ error: '文件不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: '文件删除失败' });
  }
});

// 获取共享文本
app.get('/api/shared-text', checkPassword, (req, res) => {
  res.json({ text: sharedText });
});

// 更新共享文本
app.post('/api/shared-text', checkPassword, async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text === 'string') {
      sharedText = text;
      // 保存到文件
      await saveSharedTextToFile(text);
      res.json({ message: '文本更新成功', text: sharedText });
    } else {
      res.status(400).json({ error: '无效的文本内容' });
    }
  } catch (error) {
    res.status(500).json({ error: '文本更新失败' });
  }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`文件共享服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`上传目录: ${uploadDir}`);
  console.log(`共享文本文件: ${sharedTextFile}`);
  console.log(`允许免密码访问: ${ALLOWED_HOSTS.join(', ')}`);
  console.log(`访问密码: ${ACCESS_PASSWORD}`);
  console.log(`密码错误限制: ${MAX_FAILED_ATTEMPTS}次后锁定${LOCKOUT_DURATION / 1000 / 60 / 60}小时`);
});
