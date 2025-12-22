#
# Copyright (C) 2024
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=fileshare
PKG_VERSION:=1.1.0
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
	$(CP) $(CURDIR)/files/* $(PKG_BUILD_DIR)/
	$(CP) $(CURDIR)/server.js $(PKG_BUILD_DIR)/
	$(CP) $(CURDIR)/package.json $(PKG_BUILD_DIR)/
	$(CP) $(CURDIR)/public $(PKG_BUILD_DIR)/ -r
endef

define Build/Compile
	cd $(PKG_BUILD_DIR) && \
	npm install --production --no-save --prefix $(PKG_BUILD_DIR)
	-if [ -f $(PKG_BUILD_DIR)/fileshare.init ]; then \
		tr -d '\015' < $(PKG_BUILD_DIR)/fileshare.init > $(PKG_BUILD_DIR)/fileshare.init.tmp && \
		mv $(PKG_BUILD_DIR)/fileshare.init.tmp $(PKG_BUILD_DIR)/fileshare.init; \
	fi
	-if [ -f $(PKG_BUILD_DIR)/fileshare.config ]; then \
		tr -d '\015' < $(PKG_BUILD_DIR)/fileshare.config > $(PKG_BUILD_DIR)/fileshare.config.tmp && \
		mv $(PKG_BUILD_DIR)/fileshare.config.tmp $(PKG_BUILD_DIR)/fileshare.config; \
	fi
	-if [ -f $(PKG_BUILD_DIR)/server.js ]; then \
		tr -d '\015' < $(PKG_BUILD_DIR)/server.js > $(PKG_BUILD_DIR)/server.js.tmp && \
		mv $(PKG_BUILD_DIR)/server.js.tmp $(PKG_BUILD_DIR)/server.js; \
	fi
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
	$(CP) $(PKG_BUILD_DIR)/node_modules $(1)/usr/lib/fileshare/ -r
endef

$(eval $(call BuildPackage,fileshare))

