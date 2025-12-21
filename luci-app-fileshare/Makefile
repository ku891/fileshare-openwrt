#
# Copyright (C) 2024
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-fileshare
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=FileShare Maintainer
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-fileshare
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Support for 内网共享
  DEPENDS:=+luci-base +fileshare
  PKGARCH:=all
endef

define Package/luci-app-fileshare/description
  LuCI interface for FileShare (内网共享) configuration.
  LuCI 界面用于配置内网共享服务。
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) $(CURDIR)/luasrc $(PKG_BUILD_DIR)/ -r
	@echo "# Empty Makefile for LuCI app" > $(PKG_BUILD_DIR)/Makefile
	# 转换所有 Lua 文件为 Unix 格式（移除 Windows CRLF）
	@find $(PKG_BUILD_DIR)/luasrc -type f -name "*.lua" -exec sed -i 's/\r$$//' {} \;
endef

define Build/Compile
	@echo "No compilation needed for Lua files"
endef

define Package/luci-app-fileshare/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi
	
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/controller/fileshare.lua $(1)/usr/lib/lua/luci/controller/fileshare.lua
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/model/cbi/fileshare.lua $(1)/usr/lib/lua/luci/model/cbi/fileshare.lua
endef

$(eval $(call BuildPackage,luci-app-fileshare))

