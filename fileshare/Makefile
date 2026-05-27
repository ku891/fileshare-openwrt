#
# fileshare — Go 实现，不依赖 Node.js
#

include $(TOPDIR)/rules.mk

PKG_NAME:=fileshare
PKG_VERSION:=2.0.0
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/ku891/fileshare-openwrt.git
PKG_SOURCE_VERSION:=c07efca94f871d3f7b0076c40a15fe922a977965
PKG_SOURCE_SUBDIR:=$(PKG_NAME)-$(PKG_VERSION)
PKG_MIRROR_HASH:=skip

PKG_MAINTAINER:=ku891
PKG_LICENSE:=MIT

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

# go.mod 位于 fileshare/ 子目录，指向它作为构建目录
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_SOURCE_SUBDIR)/fileshare

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
	$(CP) $(PKG_BUILD_DIR)/public/. $(1)/usr/lib/fileshare/public/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/files/fileshare.init $(1)/etc/init.d/fileshare
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/files/fileshare.config $(1)/etc/config/fileshare
endef

$(eval $(call GoBinPackage,fileshare))
$(eval $(call BuildPackage,fileshare))
