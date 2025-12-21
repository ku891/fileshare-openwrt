const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const app = express();

// ==================== 配置管理模块 ====================
// 统一的配置读取和验证函数
const CONFIG_FILE = '/etc/config/fileshare';

/**
 * 读取 UCI 配置文件
 * @returns {Object} 配置对象
 */
function loadConfig() {
  const defaultConfig = {
    port: 3000,
    password: '123456',
    allowed_hosts: []
  };

  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      console.warn(`配置文件不存在: ${CONFIG_FILE}，使用默认配置`);
      return defaultConfig;
    }

    const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = Object.assign({}, defaultConfig);

    // 解析 UCI 配置文件格式
    // 格式: option key 'value' 或 option key "value"
    const optionRegex = /^\s*option\s+(\w+)\s+['"]([^'"]+)['"]/;
    const lines = configContent.split('\n');

    for (const line of lines) {
      const match = line.match(optionRegex);
      if (match) {
        const key = match[1];
        const value = match[2];

        switch (key) {
          case 'port': {
            const port = parseInt(value, 10);
            if (port >= 1 && port <= 65535) {
              config.port = port;
            } else {
              console.warn(`无效的端口值: ${value}，使用默认值 3000`);
            }
            break;
          }
          case 'password':
            if (value) config.password = value;
            break;
          case 'allowed_hosts':
            if (value) {
              config.allowed_hosts = value.split(',')
                .map(h => h.trim())
                .filter(h => h);
            }
            break;
        }
      }
    }

    console.log(`配置加载: 端口=${config.port}, 密码=${config.password ? '已设置' : '未设置'}, 允许主机=${config.allowed_hosts.length > 0 ? config.allowed_hosts.join(',') : '无'}`);

    return config;
  } catch (error) {
    console.error('读取配置文件失败:', error);
    console.warn('使用默认配置');
    return defaultConfig;
  }
}

// 加载配置
const config = loadConfig();
const PORT = config.port;
const ACCESS_PASSWORD = config.password;
const ALLOWED_HOSTS = config.allowed_hosts;
// ==================== 配置管理模块结束 ====================

// 安全配置（固定值，不需要从配置读取）
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 24 * 60 * 60 * 1000; // 24小时

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
    }
  } catch (error) {
    console.error('加载共享文本失败:', error);
  }
}

// 保存共享文本到文件
async function saveSharedTextToFile(text) {
  try {
    await fs.writeFile(sharedTextFile, text, 'utf8');
  } catch (error) {
    console.error('保存共享文本失败:', error);
  }
}

loadSharedText();

// 创建 public 目录路径
const publicDir = path.join(__dirname, 'public');
fs.ensureDirSync(publicDir);

// 中间件
app.set('trust proxy', true); // 信任代理，正确获取客户端 IP
app.use(cors());
app.use(express.json());

// 根路径路由（必须在静态文件服务之前）
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) res.status(404).send('index.html not found');
  });
});

// 静态文件服务（不需要密码验证）
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

function isPrivateIP(ip) {
  if (!ip) return false;
  const cleanIP = ip.replace(/^::ffff:/, '');
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
  // 获取客户端 IP（支持代理环境）
  const ip = req.ip || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress || 
             '';
  
  const isExternalAccess = !isPrivateIP(ip);
  
  // 外网访问必须提供密码
  if (!isExternalAccess) {
    // 内网访问，检查是否在允许的主机列表中
    const isAllowedHost = ALLOWED_HOSTS.some(allowed => 
      host.includes(allowed) || ip.includes(allowed)
    );
    if (isAllowedHost) {
      return next();
    }
  }
  
  const attemptRecord = failedAttempts.get(ip);
  if (attemptRecord?.lockUntil) {
    if (Date.now() < attemptRecord.lockUntil) {
      const remainingTime = Math.ceil((attemptRecord.lockUntil - Date.now()) / 1000 / 60 / 60);
      return res.status(401).json({ 
        requiresPassword: true,
        message: `密码错误次数过多，账户已被锁定。剩余时间：${remainingTime}小时`,
        locked: true,
        remainingHours: remainingTime
      });
    } else {
      failedAttempts.delete(ip);
    }
  }
  
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
    const currentCount = attemptRecord?.count || 0;
    const newCount = currentCount + 1;
    
    if (newCount >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_DURATION;
      failedAttempts.set(ip, { count: newCount, lockUntil });
      return res.status(401).json({ 
        requiresPassword: true,
        message: `密码错误次数过多，账户已被锁定24小时`,
        locked: true,
        remainingHours: 24
      });
    }
    
    failedAttempts.set(ip, { count: newCount, lockUntil: null });
    const remainingAttempts = MAX_FAILED_ATTEMPTS - newCount;
    return res.status(401).json({ 
      requiresPassword: true,
      message: `密码错误，剩余尝试次数：${remainingAttempts}`,
      remainingAttempts: remainingAttempts
    });
  }
  
  // 密码验证成功，清除失败记录
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
      const stats = await fs.stat(path.join(uploadDir, file));
      return {
        name: file,
        size: stats.size,
        uploadTime: stats.birthtime,
        isImage: /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file),
        isVideo: /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(file)
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
  res.download(filePath, req.params.filename, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: '文件不存在' });
  });
});

// 删除文件
app.delete('/api/delete/:filename', checkPassword, async (req, res) => {
  try {
    const filePath = path.join(uploadDir, req.params.filename);
    await fs.remove(filePath);
    res.json({ message: '文件删除成功' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: '文件不存在' });
    } else {
      res.status(500).json({ error: '文件删除失败' });
    }
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
});

