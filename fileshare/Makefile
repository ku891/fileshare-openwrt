#
# fileshare — Go 实现，不依赖 Node.js
# 本地 feed：PKG_BUILD_DIR 指向源码目录（含 go.mod）
#

include $(TOPDIR)/rules.mk

PKG_NAME:=fileshare
PKG_VERSION:=2.0.1
PKG_RELEASE:=1

PKG_MAINTAINER:=ku891
PKG_LICENSE:=MIT

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

# 覆盖构建目录为当前包目录（含 go.mod，无需 PKG_SOURCE 下载）
PKG_BUILD_DIR:=$(CURDIR)

GO_PKG:=github.com/ku891/fileshare
GO_PKG_BUILD_PKG:=$(GO_PKG)
GO_PKG_LDFLAGS_X:=main.version=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/fileshare
	SECTION:=net
	CATEGORY:=Network
	TITLE:=内网共享 (Go)
	DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
	URL:=https://github.com/ku891/fileshare-openwrt
endef

define Package/fileshare/description
	内网/外网文件与文本共享，Go 单二进制实现。
	不依赖 node、node-npm；兼容原有 LuCI 与 Web 前端。
endef

define Package/fileshare/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/usr/lib/fileshare/public
	$(INSTALL_DIR) $(1)/usr/lib/fileshare/uploads
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(CP) $(CURDIR)/public/. $(1)/usr/lib/fileshare/public/
	$(INSTALL_BIN) $(CURDIR)/files/fileshare.init $(1)/etc/init.d/fileshare
	$(INSTALL_CONF) $(CURDIR)/files/fileshare.config $(1)/etc/config/fileshare
endef

$(eval $(call GoBinPackage,fileshare))
$(eval $(call BuildPackage,fileshare))
