# fileshare-openwrt

OpenWrt / ImmortalWrt 内网共享插件。

## v2.0（Go，推荐）

当前版本：**2.0.1**

- **不再依赖** `node`、`node-npm`
- 单二进制 `fileshare`（约 8–12 MB，视架构而定）
- **兼容** 原有 Web 前端与 LuCI（API 路径不变）
- 可选 HTTPS（需 `openssl-util`）

### 编译

```bash
./scripts/feeds update fileshare
./scripts/feeds install fileshare luci-app-fileshare
make package/feeds/fileshare/fileshare/compile V=s
```

### 安装（路由器）

**ImmortalWrt 24.10 x86_64 软路由**：从 GitHub Actions 下载 `immortalwrt-24.10.6-x86_64-ipk` 产物（使用官方 SDK 24.10.6 编译，适配 24.10.x 固件）。

```bash
opkg install /tmp/fileshare_*.ipk /tmp/luci-app-fileshare_*.ipk
# 不再需要: opkg install node node-npm
/etc/init.d/fileshare enable && /etc/init.d/fileshare start
```

## v1.x（Node，已弃用）

旧版 `server.js` 源码在 `fileshare/legacy/`，ImmortalWrt 24.10 上编译 node 易失败，请使用 v2.0。

## 仓库

https://github.com/ku891/fileshare-openwrt
