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

```bash
opkg install /tmp/fileshare_*.ipk
# 不再需要: opkg install node node-npm
```

## v1.x（Node，已弃用）

旧版 `server.js` 源码在 `fileshare/legacy/`，ImmortalWrt 24.10 上编译 node 易失败，请使用 v2.0。

## 仓库

https://github.com/ku891/fileshare-openwrt
