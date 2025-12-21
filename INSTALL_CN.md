# OpenWrt 插件安装说明

本文件详细说明如何通过 OpenWrt feeds 系统编译并安装 FileShare 作为 OpenWrt 插件。

## 前置要求

1. **OpenWrt 源码树**（用于自编译 OpenWrt）
2. **GitHub 账户**（用于托管插件仓库）
3. **Linux 编译环境**（用于编译插件）
4. **Node.js 和 npm**（将通过 opkg 在设备上安装）

## 第一步：创建 GitHub 仓库

1. 在 GitHub 上创建一个新仓库（例如：`fileshare-openwrt`）
2. 将整个 `openwrt` 目录的内容上传到仓库
3. 确保仓库是公开的（或配置好访问权限）

**仓库结构应该是：**
```
fileshare-openwrt/
├── fileshare/
├── luci-app-fileshare/
├── feeds.conf.example
└── README.md
```

## 第二步：配置 OpenWrt Feeds

在您的 OpenWrt 源码树中，编辑 `feeds.conf` 或 `feeds.conf.default`：

```bash
cd /path/to/openwrt

# 编辑 feeds 配置文件
vi feeds.conf.default
```

添加以下行（将 URL 替换为您的 GitHub 仓库地址）：

```
src-git fileshare https://github.com/yourusername/fileshare-openwrt.git
```

**完整示例：**
```
src-git packages https://git.openwrt.org/feed/packages.git
src-git luci https://git.openwrt.org/project/luci.git
src-git routing https://git.openwrt.org/feed/routing.git
src-git fileshare https://github.com/yourusername/fileshare-openwrt.git
```

## 第三步：更新和安装 Feeds

```bash
# 更新 feeds
./scripts/feeds update fileshare

# 安装 feeds（将插件添加到编译系统）
./scripts/feeds install -a
```

**验证 feeds 是否加载：**
```bash
# 列出所有 feeds
./scripts/feeds list | grep fileshare
```

应该看到：
```
fileshare - fileshare
fileshare - luci-app-fileshare
```

## 第四步：配置编译选项

```bash
# 进入配置菜单
make menuconfig
```

在配置菜单中：

1. **选择主插件：**
   - 导航到：**Network** → **fileshare**
   - 选择 `[M]` 作为模块（推荐）或 `[*]` 作为内置
   - 按 `Space` 切换选择

2. **选择 LuCI 应用（可选）：**
   - 导航到：**LuCI** → **3. Applications** → **luci-app-fileshare**
   - 选择 `[M]` 作为模块（推荐）或 `[*]` 作为内置
   - 按 `Space` 切换选择

3. **保存配置：**
   - 按 `Y` 保存
   - 按 `Enter` 退出

## 第五步：编译

### 方式一：只编译插件（推荐，速度快）

```bash
# 编译主插件
make package/fileshare/compile V=s

# 编译 LuCI 应用（如果选择了）
make package/luci-app-fileshare/compile V=s
```

### 方式二：编译整个固件（包含插件）

```bash
# 编译整个固件（包含所有选中的包）
make V=s
```

**注意**：首次编译可能需要 10-30 分钟，具体取决于系统性能。后续编译会更快。

### 查找编译好的包

编译成功后，`.ipk` 文件位于：
```
bin/packages/<架构>/base/fileshare_1.0.0-1_<架构>.ipk
bin/packages/<架构>/luci/luci-app-fileshare_1.0.0-1_all.ipk
```

示例：
```
bin/packages/x86_64/base/fileshare_1.0.0-1_x86_64.ipk
bin/packages/x86_64/luci/luci-app-fileshare_1.0.0-1_all.ipk
```

## 第六步：安装

### 如果编译为模块（[M]）

```bash
# 1. 上传 .ipk 文件到设备
scp bin/packages/*/base/fileshare_1.0.0-1_*.ipk root@192.168.1.1:/tmp/
scp bin/packages/*/luci/luci-app-fileshare_1.0.0-1_all.ipk root@192.168.1.1:/tmp/

# 2. 在设备上安装
ssh root@192.168.1.1
opkg update
opkg install node node-npm
opkg install /tmp/fileshare_1.0.0-1_*.ipk
opkg install /tmp/luci-app-fileshare_1.0.0-1_all.ipk
```

### 如果编译为内置（[*]）

插件已经包含在固件中，刷入固件后：
1. 登录设备
2. 安装 Node.js（如果固件中没有）：
   ```bash
   opkg update
   opkg install node node-npm
   ```
3. 配置并启动服务

## 第七步：配置服务

### 方法一：使用 LuCI Web 界面（推荐）

1. 登录 LuCI：`http://路由器IP`
2. 导航到：**服务** → **内网共享**
3. 配置参数并保存

### 方法二：使用命令行

```bash
# 编辑配置
vi /etc/config/fileshare
```

配置示例：
```
config fileshare 'config'
    option enabled '1'          # 启用服务（1=启用，0=禁用）
    option port '3000'         # 服务端口
    option password 'yourpass'  # 访问密码
    option allowed_hosts '192.168.1.1,192.168.1.100'  # 允许免密码访问的主机
```

```bash
# 启用并启动服务
/etc/init.d/fileshare enable
/etc/init.d/fileshare start
```

## 第八步：配置防火墙（可选）

如果需要从外网访问：

```bash
# 使用 UCI 添加防火墙规则
uci add firewall rule
uci set firewall.@rule[-1].name='FileShare'
uci set firewall.@rule[-1].src='wan'
uci set firewall.@rule[-1].dest_port='3000'
uci set firewall.@rule[-1].proto='tcp'
uci set firewall.@rule[-1].target='ACCEPT'
uci commit firewall
/etc/init.d/firewall reload
```

## 访问服务

安装后，在浏览器中访问：
```
http://<路由器IP>:3000
```

例如：`http://192.168.1.1:3000`

## 服务管理

```bash
# 启动服务
/etc/init.d/fileshare start

# 停止服务
/etc/init.d/fileshare stop

# 重启服务
/etc/init.d/fileshare restart

# 查看状态
/etc/init.d/fileshare status

# 查看日志
logread | grep fileshare

# 启用开机自启
/etc/init.d/fileshare enable

# 禁用开机自启
/etc/init.d/fileshare disable
```

## 更新插件

当 GitHub 仓库有更新时：

```bash
# 更新 feeds
./scripts/feeds update fileshare

# 重新安装（如果需要）
./scripts/feeds install -a

# 重新编译
make package/fileshare/compile V=s
make package/luci-app-fileshare/compile V=s
```

## 故障排除

### Feeds 更新失败

**问题：** `./scripts/feeds update fileshare` 失败

**解决：**
1. 检查 GitHub 仓库 URL 是否正确
2. 检查网络连接
3. 检查仓库是否为公开（或配置了正确的访问权限）
4. 尝试手动克隆测试：
   ```bash
   git clone https://github.com/yourusername/fileshare-openwrt.git
   ```

### make menuconfig 中找不到插件

**问题：** 在菜单中找不到 fileshare

**解决：**
```bash
# 1. 确认 feeds 已更新
./scripts/feeds update fileshare

# 2. 确认 feeds 已安装
./scripts/feeds install -a

# 3. 检查 feeds 是否正确加载
./scripts/feeds list | grep fileshare
```

### 编译错误

**问题：** 编译时出现错误

**解决：**
1. 检查依赖是否满足：
   ```bash
   # 查看插件依赖
   cat package/fileshare/Makefile | grep DEPENDS
   ```

2. 确保在 menuconfig 中选择了必要的依赖（node, node-npm, luci-base）

3. 查看详细错误信息：
   ```bash
   make package/fileshare/compile V=s 2>&1 | tee compile.log
   ```

### 服务无法启动

**问题：** 安装后服务无法启动

**解决：**
```bash
# 查看日志
logread | grep fileshare

# 检查 Node.js
which node
node --version

# 检查配置
cat /etc/config/fileshare

# 检查端口占用
netstat -tlnp | grep 3000
```

## 卸载

```bash
# 停止并禁用服务
/etc/init.d/fileshare stop
/etc/init.d/fileshare disable

# 卸载插件
opkg remove fileshare
opkg remove luci-app-fileshare
```

## 依赖说明

### 主插件 (fileshare) 依赖：
- `node` - Node.js 运行时
- `node-npm` - npm 包管理器

### LuCI 应用 (luci-app-fileshare) 依赖：
- `luci-base` - LuCI 基础库
- `fileshare` - 主插件（必须先安装）

## GitHub 仓库设置建议

1. **仓库名称：** 建议使用 `fileshare-openwrt` 或类似名称
2. **分支：** 使用 `main` 或 `master` 分支
3. **文件结构：** 确保 `fileshare/` 和 `luci-app-fileshare/` 在仓库根目录
4. **README：** 可以在仓库根目录添加 README.md 说明如何使用

## 注意事项

1. **存储空间**：OpenWrt 设备通常存储空间有限，注意监控上传目录大小
2. **性能**：低配置设备可能有性能限制，建议限制文件大小
3. **安全性**：
   - 修改默认密码
   - 仅在内网使用，不要暴露到公网
   - 如需公网访问，建议使用反向代理（如 Nginx）并配置 HTTPS
4. **Node.js 版本**：需要 Node.js >= 14.0
5. **内存占用**：Node.js 应用会占用内存，确保设备有足够 RAM

## 支持

如有问题，请参考：
- OpenWrt 官方文档：https://openwrt.org/docs/guide-developer/start
- OpenWrt Feeds 文档：https://openwrt.org/docs/guide-developer/feeds
- Node.js 文档：https://nodejs.org/
