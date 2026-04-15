# OpenWrt 插件 - 内网共享

本目录包含将 FileShare 编译为 OpenWrt 插件的所有文件，通过 OpenWrt feeds 系统集成。

## 📁 目录结构

```
openwrt/
├── fileshare/              # 主插件包
│   ├── Makefile           # 插件包定义文件
│   ├── server.js          # 主程序
│   ├── package.json       # Node.js 依赖配置
│   ├── public/            # 前端文件
│   └── files/             # 配置和初始化脚本
│       ├── fileshare.init
│       └── fileshare.config
├── luci-app-fileshare/    # LuCI Web 界面配置包
│   ├── Makefile           # LuCI 应用包定义
│   └── luasrc/            # LuCI 源代码
│       ├── controller/
│       └── model/cbi/
├── feeds.conf.example     # feeds 配置示例
└── README.md              # 本文件
```

## 🚀 使用方法

### 第一步：创建 GitHub 仓库

1. 在 GitHub 上创建一个新仓库（例如：`fileshare-openwrt`）
2. 将整个 `openwrt` 目录的内容上传到仓库
3. 确保仓库是公开的（或配置好访问权限）

### 第二步：配置 OpenWrt Feeds

在您的 OpenWrt 源码树中，编辑 `feeds.conf` 或 `feeds.conf.default`：

```bash
cd /path/to/openwrt
vi feeds.conf.default
```

添加以下行（将 URL 替换为您的 GitHub 仓库地址）：

```
src-git fileshare https://github.com/yourusername/fileshare-openwrt.git;main
```

### 第三步：更新和安装 Feeds

```bash
# 更新 feeds
./scripts/feeds update fileshare

# 安装 feeds（将插件添加到编译系统）
./scripts/feeds install -a
```

### 第四步：配置编译选项

```bash
make menuconfig
```

在配置菜单中：
1. 导航到：**Network** → **fileshare**，选择 `[M]` 或 `[*]`
2. 导航到：**LuCI** → **3. Applications** → **luci-app-fileshare**，选择 `[M]` 或 `[*]`
3. 保存并退出

### 第五步：编译

```bash
# 编译插件
make package/fileshare/compile V=s
make package/luci-app-fileshare/compile V=s

# 或编译整个固件
make V=s
```

### 第六步：安装

```bash
# 上传并安装
scp bin/packages/*/base/fileshare_*.ipk root@192.168.1.1:/tmp/
scp bin/packages/*/luci/luci-app-fileshare_*.ipk root@192.168.1.1:/tmp/

ssh root@192.168.1.1
opkg update
opkg install node node-npm
opkg install /tmp/fileshare_*.ipk
opkg install /tmp/luci-app-fileshare_*.ipk
```

### 第七步：配置服务

#### 使用 LuCI Web 界面

1. 登录 LuCI 管理界面
2. 导航到：**服务** → **内网共享**
3. 配置端口、密码、允许的主机、是否启用 HTTPS、HTTPS 端口、域名
4. 启用服务并保存

#### 使用命令行

```bash
# 编辑配置
vi /etc/config/fileshare

# 启动服务
/etc/init.d/fileshare start

# 设置开机自启
/etc/init.d/fileshare enable
```

## 📝 配置说明

配置文件位于 `/etc/config/fileshare`：

```
config fileshare 'config'
    option enabled '1'              # 是否启用服务
    option port '3000'              # HTTP 服务端口
    option https_port '3443'        # HTTPS 服务端口
    option enable_https '0'         # 是否启用 HTTPS（自动生成自签名证书）
    option password '123456'        # 访问密码
    option allowed_hosts '192.168.1.1'  # 免密码访问的主机（内网）
    option use_domain '0'           # 是否启用本地域名
    option domain_name 'fileshare.lan' # 本地域名
```

## 🔧 功能特性

- ✅ 文件上传、下载（单文件上限 10GB）
- ✅ 图片预览 / 视频播放
- ✅ 文本共享与文本文件在线编辑
- ✅ 密码保护、外网强制密码验证
- ✅ 内网免密码访问（可配置）
- ✅ 密码错误锁定保护
- ✅ HTTPS 自签名证书自动生成，域名变化自动重新生成
- ✅ 支持中文/特殊字符文件名

## ⚠️ 已知注意事项

- 下载接口默认未做鉴权，如需严格保护请在 `/api/download/:filename` 加 `checkPassword`
- 允许免密的主机校验若依赖请求头可能被伪造，建议基于源 IP 严格匹配
- 大文件上传前请确认设备存储空间与网络超时，超大文件建议分片/断点续传

## 🔧 功能特性

- ✅ 文件上传、下载
- ✅ 图片预览
- ✅ 视频播放
- ✅ 文本共享
- ✅ 密码保护
- ✅ 内网免密码访问（可配置）
- ✅ 外网强制密码验证
- ✅ 密码错误锁定保护

## 📄 许可证

MIT License

