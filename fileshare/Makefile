#
# Copyright (C) 2024
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=fileshare
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=FileShare Maintainer
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/fileshare
  SECTION:=net
  CATEGORY:=Network
  TITLE:=内网共享
  DEPENDS:=+node +node-npm
  URL:=https://github.com/yourusername/fileshare
endef

define Package/fileshare/description
  A simple file sharing service for local network based on Node.js and Express.
  Supports file upload, download, image preview and text sharing.
  基于 Node.js 和 Express 的简单内网共享服务。
  支持文件上传、下载、图片预览和文本共享。
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) ./files/* $(PKG_BUILD_DIR)/
	$(CP) ./server.js $(PKG_BUILD_DIR)/
	$(CP) ./package.json $(PKG_BUILD_DIR)/
	$(CP) ./public $(PKG_BUILD_DIR)/ -r
endef


define Package/fileshare/install
	$(INSTALL_DIR) $(1)/usr/lib/fileshare
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/usr/lib/fileshare/public
	$(INSTALL_DIR) $(1)/usr/lib/fileshare/uploads
	
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/fileshare.init $(1)/etc/init.d/fileshare
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/fileshare.config $(1)/etc/config/fileshare
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/server.js $(1)/usr/lib/fileshare/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/package.json $(1)/usr/lib/fileshare/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/public/* $(1)/usr/lib/fileshare/public/
endef

$(eval $(call BuildPackage,fileshare))

