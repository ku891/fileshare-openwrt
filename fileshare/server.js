const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const { execSync } = require('child_process');

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
    allowed_hosts: [],
    enable_https: '0',
    https_port: 3443,
    use_domain: '0',
    domain_name: 'fileshare.lan'
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
          case 'enable_https':
            config.enable_https = value;
            break;
          case 'https_port': {
            const port = parseInt(value, 10);
            if (port >= 1 && port <= 65535) {
              config.https_port = port;
            } else {
              console.warn(`无效的HTTPS端口值: ${value}，使用默认值 3443`);
            }
            break;
          }
          case 'use_domain':
            config.use_domain = value;
            break;
          case 'domain_name':
            if (value) config.domain_name = value;
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
const ENABLE_HTTPS = config.enable_https === '1';
const HTTPS_PORT = config.https_port || 3443;
const USE_DOMAIN = config.use_domain === '1';
const DOMAIN_NAME = config.domain_name || 'fileshare.lan';
// ==================== 配置管理模块结束 ====================

// ==================== 证书管理模块 ====================
const certDir = path.join(__dirname, 'certs');
const certFile = path.join(certDir, 'server.crt');
const keyFile = path.join(certDir, 'server.key');
const certInfoFile = path.join(certDir, 'cert.info'); // 保存证书对应的域名信息

/**
 * 获取路由器IP地址
 */
function getRouterIP() {
  try {
    // 尝试从 UCI 配置读取
    let ip = execSync('uci get network.lan.ipaddr 2>/dev/null', { encoding: 'utf8' }).trim();
    if (!ip || ip === '') {
      // 尝试从 ifconfig 读取
      const ifconfig = execSync('ifconfig br-lan 2>/dev/null | grep "inet addr" | awk \'{print $2}\' | cut -d: -f2 | head -1', { encoding: 'utf8' }).trim();
      if (ifconfig) {
        ip = ifconfig.split('/')[0];
      }
    }
    if (!ip || ip === '') {
      ip = '192.168.1.1';
    }
    return ip.trim();
  } catch (error) {
    console.warn('获取路由器IP失败，使用默认值:', error.message);
    return '192.168.1.1';
  }
}

/**
 * 生成自签名证书
 */
function generateCertificate() {
  try {
    // 确保证书目录存在
    fs.ensureDirSync(certDir);
    
    // 确定证书的 Common Name (CN)
    let cn = DOMAIN_NAME;
    if (!cn || cn === '') {
      cn = getRouterIP();
    }
    
    // 如果域名不包含点，添加 .lan 后缀
    if (USE_DOMAIN && !cn.includes('.')) {
      cn = cn + '.lan';
    }
    
    // 获取路由器IP，添加到 Subject Alternative Name (SAN)
    const routerIP = getRouterIP();
    
    // 生成证书的 Subject Alternative Name
    // 包括域名、IP地址和常见的本地域名变体
    const sanList = [
      `DNS:${cn}`,
      `IP:${routerIP}`,
      `DNS:localhost`,
      `IP:127.0.0.1`,
      `IP:0.0.0.0`
    ];
    
    // 如果域名包含 .lan，也添加不带 .lan 的版本
    if (cn.endsWith('.lan')) {
      sanList.push(`DNS:${cn.replace('.lan', '')}`);
    }
    
    const san = sanList.join(',');
    
    // 生成私钥和证书
    // 使用 openssl 命令生成证书（OpenWrt 通常包含 openssl）
    // 尝试多个可能的 openssl 路径
    const opensslPaths = ['openssl', '/usr/bin/openssl', '/bin/openssl'];
    let opensslCmd = 'openssl';
    
    // 检查 openssl 是否可用
    try {
      execSync('openssl version >/dev/null 2>&1', { stdio: 'ignore', shell: '/bin/sh' });
    } catch (e) {
      // 尝试其他路径
      let found = false;
      for (const path of opensslPaths) {
        try {
          execSync(`${path} version >/dev/null 2>&1`, { stdio: 'ignore', shell: '/bin/sh' });
          opensslCmd = path;
          found = true;
          break;
        } catch (err) {
          // 继续尝试
        }
      }
      if (!found) {
        console.error('未找到 openssl 命令，请安装 openssl-util 包: opkg install openssl-util');
        return false;
      }
    }
    
    try {
      // 生成私钥
      const keyCmd = `${opensslCmd} genrsa -out "${keyFile}" 2048 2>/dev/null`;
      execSync(keyCmd, { stdio: 'ignore', shell: '/bin/sh' });
      
      // 创建临时配置文件用于生成带 SAN 的证书
      const configFile = path.join(certDir, 'cert.conf');
      const configContent = `[req]
distinguished_name=req
[req_distinguished_name]
[v3_req]
subjectAltName=${san}`;
      fs.writeFileSync(configFile, configContent);
      
      // 生成证书（尝试带 SAN 扩展）
      const certCmdWithConfig = `${opensslCmd} req -new -x509 -key "${keyFile}" -out "${certFile}" -days 3650 -subj "/CN=${cn}/O=FileShare/C=CN" -extensions v3_req -config "${configFile}" 2>/dev/null`;
      
      try {
        execSync(certCmdWithConfig, { stdio: 'ignore', shell: '/bin/sh' });
        // 删除临时配置文件
        fs.removeSync(configFile);
        console.log(`证书已生成: CN=${cn}, SAN=${san}`);
        return true;
      } catch (certError) {
        // 如果带扩展的命令失败，尝试不带扩展的简单版本
        const simpleCertCmd = `${opensslCmd} req -new -x509 -key "${keyFile}" -out "${certFile}" -days 3650 -subj "/CN=${cn}/O=FileShare/C=CN" 2>/dev/null`;
        execSync(simpleCertCmd, { stdio: 'ignore', shell: '/bin/sh' });
        fs.removeSync(configFile);
        console.log(`证书已生成（简化版，无SAN扩展）: CN=${cn}`);
        console.warn('注意：证书可能不包含所有域名/IP，某些浏览器可能显示警告');
        return true;
      }
    } catch (error) {
      console.error('openssl 命令执行失败:', error.message);
      return false;
    }
  } catch (error) {
    console.error('生成证书失败:', error);
    return false;
  }
}

/**
 * 获取当前应该使用的域名（用于证书）
 */
function getCurrentDomainForCert() {
  let cn = DOMAIN_NAME;
  if (!cn || cn === '') {
    cn = getRouterIP();
  }
  
  // 如果启用域名且域名不包含点，添加 .lan 后缀
  if (USE_DOMAIN && !cn.includes('.')) {
    cn = cn + '.lan';
  }
  
  return cn;
}

/**
 * 检查域名是否变化
 */
function hasDomainChanged() {
  try {
    const currentDomain = getCurrentDomainForCert();
    
    // 如果证书信息文件不存在，说明需要生成新证书
    if (!fs.existsSync(certInfoFile)) {
      return true;
    }
    
    // 读取保存的域名信息
    const savedInfo = fs.readFileSync(certInfoFile, 'utf8');
    const savedData = JSON.parse(savedInfo);
    
    // 比较域名是否变化
    if (savedData.domain !== currentDomain) {
      console.log(`域名已变化: ${savedData.domain} -> ${currentDomain}`);
      return true;
    }
    
    return false;
  } catch (error) {
    // 如果读取失败，认为需要重新生成
    console.warn('检查域名变化失败，将重新生成证书:', error.message);
    return true;
  }
}

/**
 * 保存证书信息
 */
function saveCertInfo() {
  try {
    const currentDomain = getCurrentDomainForCert();
    const certInfo = {
      domain: currentDomain,
      generatedAt: new Date().toISOString()
    };
    fs.ensureDirSync(certDir);
    fs.writeFileSync(certInfoFile, JSON.stringify(certInfo, null, 2), 'utf8');
  } catch (error) {
    console.warn('保存证书信息失败:', error.message);
  }
}

/**
 * 删除旧证书
 */
function removeOldCertificates() {
  try {
    if (fs.existsSync(certFile)) {
      fs.removeSync(certFile);
      console.log('已删除旧证书文件');
    }
    if (fs.existsSync(keyFile)) {
      fs.removeSync(keyFile);
      console.log('已删除旧私钥文件');
    }
    if (fs.existsSync(certInfoFile)) {
      fs.removeSync(certInfoFile);
      console.log('已删除旧证书信息文件');
    }
  } catch (error) {
    console.warn('删除旧证书文件失败:', error.message);
  }
}

/**
 * 加载或生成证书
 */
function loadOrGenerateCertificate() {
  if (!ENABLE_HTTPS) {
    return null;
  }
  
  // 检查域名是否变化
  const domainChanged = hasDomainChanged();
  
  // 检查证书是否存在且有效
  const certExists = fs.existsSync(certFile) && fs.existsSync(keyFile);
  
  // 如果域名变化或证书不存在，删除旧证书并重新生成
  if (domainChanged || !certExists) {
    if (domainChanged) {
      console.log('检测到域名变化，删除旧证书并重新生成...');
    } else {
      console.log('证书文件不存在，生成新证书...');
    }
    removeOldCertificates();
  } else {
    // 证书存在且域名未变化，尝试使用现有证书
    try {
      const cert = fs.readFileSync(certFile);
      const key = fs.readFileSync(keyFile);
      if (cert.length > 0 && key.length > 0) {
        console.log('使用现有证书');
        return {
          cert: cert,
          key: key
        };
      }
    } catch (error) {
      console.warn('读取现有证书失败，将重新生成:', error.message);
      removeOldCertificates();
    }
  }
  
  // 生成新证书
  console.log('正在生成新的自签名证书...');
  if (generateCertificate()) {
    try {
      // 保存证书信息
      saveCertInfo();
      
      return {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile)
      };
    } catch (error) {
      console.error('读取生成的证书失败:', error);
      return null;
    }
  }
  
  return null;
}
// ==================== 证书管理模块结束 ====================

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
    // 处理中文/特殊字符文件名：multer 默认按 latin1，需要转成 utf-8
    const originalNameUtf8 = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const timestamp = Date.now();
    const ext = path.extname(originalNameUtf8);
    const name = path.basename(originalNameUtf8, ext);
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage,
  // 单文件大小上限：10GB
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB
  fileFilter: (req, file, cb) => cb(null, true)
});

// 获取文件列表
app.get('/api/files', checkPassword, async (req, res) => {
  try {
    const files = await fs.readdir(uploadDir);
    const fileList = await Promise.all(files.map(async (file) => {
      const stats = await fs.stat(path.join(uploadDir, file));
      // 检测文本文件类型
      const textExtensions = /\.(txt|js|json|html|css|xml|md|log|conf|config|ini|yaml|yml|sh|bat|cmd|py|java|c|cpp|h|hpp|php|rb|go|rs|swift|kt|ts|jsx|tsx|vue|svelte)$/i;
      const isText = textExtensions.test(file);
      
      return {
        name: file,
        size: stats.size,
        uploadTime: stats.birthtime,
        isImage: /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file),
        isVideo: /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(file),
        isText: isText
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

// 读取文本文件内容
app.get('/api/file-content/:filename', checkPassword, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(uploadDir, filename);
    
    // 安全检查：确保文件在 uploads 目录内
    if (!filePath.startsWith(uploadDir)) {
      return res.status(400).json({ error: '无效的文件路径' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 检查文件大小（限制为 5MB，避免加载过大文件）
    const stats = await fs.stat(filePath);
    if (stats.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: '文件过大，无法在线编辑（最大 5MB）' });
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content: content, size: stats.size });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: '文件不存在' });
    } else if (error.code === 'EISDIR') {
      res.status(400).json({ error: '这是一个目录，不是文件' });
    } else {
      res.status(500).json({ error: '读取文件失败: ' + error.message });
    }
  }
});

// 保存文本文件内容
app.post('/api/file-content/:filename', checkPassword, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(uploadDir, filename);
    
    // 安全检查：确保文件在 uploads 目录内
    if (!filePath.startsWith(uploadDir)) {
      return res.status(400).json({ error: '无效的文件路径' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: '无效的文件内容' });
    }
    
    await fs.writeFile(filePath, content, 'utf8');
    const stats = await fs.stat(filePath);
    
    res.json({ 
      message: '文件保存成功', 
      size: stats.size,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: '文件不存在' });
    } else {
      res.status(500).json({ error: '保存文件失败: ' + error.message });
    }
  }
});

// 启动服务器
if (ENABLE_HTTPS) {
  const certOptions = loadOrGenerateCertificate();
  if (certOptions) {
    // 启动 HTTPS 服务器
    https.createServer(certOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`文件共享服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
    });
    
    // 如果 HTTP 端口和 HTTPS 端口不同，也启动 HTTP 服务器（用于重定向或兼容）
    if (PORT !== HTTPS_PORT) {
      // HTTP 服务器重定向到 HTTPS
      const http = require('http');
      http.createServer((req, res) => {
        const host = req.headers.host || '';
        const hostname = host.split(':')[0];
        const httpsUrl = `https://${hostname}:${HTTPS_PORT}${req.url}`;
        res.writeHead(301, { 'Location': httpsUrl });
        res.end();
      }).listen(PORT, '0.0.0.0', () => {
        console.log(`HTTP 重定向服务器运行在 http://0.0.0.0:${PORT} (重定向到 HTTPS)`);
      });
    }
  } else {
    console.error('无法加载证书，HTTPS 启动失败，回退到 HTTP');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`文件共享服务器运行在 http://0.0.0.0:${PORT}`);
    });
  }
} else {
  // 仅启动 HTTP 服务器
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`文件共享服务器运行在 http://0.0.0.0:${PORT}`);
  });
}

