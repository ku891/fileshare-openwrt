#
# Copyright (C) 2024
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-fileshare
PKG_VERSION:=1.1.0
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
	echo "# Empty Makefile for LuCI app" > $(PKG_BUILD_DIR)/Makefile
endef

define Build/Compile
	@find $(PKG_BUILD_DIR)/luasrc -type f -name "*.lua" | while read file; do \
		tr -d '\015' < "$$file" > "$$file.tmp" && \
		mv "$$file.tmp" "$$file"; \
	done || true
endef

define Package/luci-app-fileshare/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi
	
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/controller/fileshare.lua $(1)/usr/lib/lua/luci/controller/fileshare.lua
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/model/cbi/fileshare.lua $(1)/usr/lib/lua/luci/model/cbi/fileshare.lua
endef

$(eval $(call BuildPackage,luci-app-fileshare))

