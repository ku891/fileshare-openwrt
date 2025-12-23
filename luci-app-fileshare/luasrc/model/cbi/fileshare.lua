require("luci.sys")
require("luci.util")

m = Map("fileshare", translate("内网共享配置"))

-- 获取访问URL的函数
local function getAccessURL()
    local uci = require("luci.model.uci").cursor()
    local use_domain_val = uci:get("fileshare", "config", "use_domain")
    local domain_name_val = uci:get("fileshare", "config", "domain_name") or "fileshare.lan"
    local enable_https_val = uci:get("fileshare", "config", "enable_https") or "0"
    
    -- 获取端口配置
    local port_val = uci:get("fileshare", "config", "port") or "3000"
    if type(port_val) == "table" then
        port_val = port_val[1] or "3000"
    end
    port_val = tostring(port_val)
    
    -- 如果启用了 HTTPS，使用 HTTPS 端口
    if enable_https_val == "1" then
        local https_port_val = uci:get("fileshare", "config", "https_port") or "3443"
        if type(https_port_val) == "table" then
            https_port_val = https_port_val[1] or "3443"
        end
        port_val = tostring(https_port_val)
    end
    
    -- 获取路由IP地址
    local ip = luci.sys.exec("uci get network.lan.ipaddr 2>/dev/null | head -1")
    if not ip or ip == "" then
        ip = luci.sys.exec("ifconfig br-lan 2>/dev/null | grep 'inet addr' | awk '{print $2}' | cut -d: -f2 | head -1")
    end
    if not ip or ip == "" then
        ip = "192.168.1.1"
    end
    ip = ip:gsub("%s+", "")
    ip = ip:match("^([^/]+)") or ip
    
    -- 确定协议
    local protocol = (enable_https_val == "1") and "https" or "http"
    
    if use_domain_val == "1" and domain_name_val and domain_name_val ~= "" then
        local host = domain_name_val
        if not host:match("%.") then
            host = host .. ".lan"
        end
        return protocol .. "://" .. host .. ":" .. port_val
    else
        return protocol .. "://" .. ip .. ":" .. port_val
    end
end

-- 在Map的description中添加打开网页按钮
local url = getAccessURL()
local description = translate("配置内网共享服务的参数")
description = description .. string.format(
    ' <a href="%s" target="_blank" class="btn cbi-button cbi-button-add" style="margin-left: 10px;">%s</a>',
    url,
    translate("打开网页")
)
m.description = description

s = m:section(NamedSection, "config", "fileshare", translate("基本设置"))
s.addremove = false

enabled = s:option(Flag, "enabled", translate("启用服务"), translate("启用或禁用内网共享服务"))
enabled.default = "1"
enabled.rmempty = false

use_domain = s:option(Flag, "use_domain", translate("通过本地域名访问"))
use_domain.default = "0"
use_domain.rmempty = false

domain_name = s:option(Value, "domain_name", translate("本地域名"), translate("用于访问文件共享服务的本地域名（默认：fileshare.lan）"))
domain_name.default = "fileshare.lan"
domain_name.placeholder = "fileshare.lan"
domain_name:depends("use_domain", "1")
-- 验证域名格式
function domain_name.validate(self, value, section)
    if value and value ~= "" then
        -- 简单的域名格式验证：允许字母、数字、点、连字符
        if not value:match("^[%w%-%.]+$") then
            return nil, translate("域名格式不正确，只能包含字母、数字、点和连字符")
        end
        -- 不能以点开头或结尾
        if value:match("^%.") or value:match("%.$") then
            return nil, translate("域名格式不正确，不能以点开头或结尾")
        end
        -- 不能包含连续的点
        if value:match("%.%.") then
            return nil, translate("域名格式不正确，不能包含连续的点")
        end
    end
    return value
end

port = s:option(Value, "port", translate("HTTP服务端口"), translate("HTTP服务监听的端口号（默认：3000）"))
port.datatype = "port"
port.default = "3000"
port.rmempty = false

enable_https = s:option(Flag, "enable_https", translate("启用HTTPS"), translate("启用HTTPS加密访问，将自动生成自签名证书"))
enable_https.default = "0"
enable_https.rmempty = false

https_port = s:option(Value, "https_port", translate("HTTPS服务端口"), translate("HTTPS服务监听的端口号（默认：3443）"))
https_port.datatype = "port"
https_port.default = "3443"
https_port.rmempty = true
https_port:depends("enable_https", "1")

password = s:option(Value, "password", translate("访问密码"), translate("外网访问和未授权内网访问所需的密码"))
password.password = true
password.default = "123456"
password.rmempty = false

allowed_hosts = s:option(Value, "allowed_hosts", translate("允许免密码访问的主机"), translate("内网中允许免密码访问的主机IP或域名，多个用逗号分隔（例如：192.168.1.1,192.168.1.100）"))
allowed_hosts.default = "192.168.1.1"
allowed_hosts.placeholder = "192.168.1.1,192.168.1.100"

function m.on_after_commit(self)
    -- 重新加载 fileshare 服务
    luci.sys.call("/etc/init.d/fileshare reload >/dev/null 2>&1")
    
    -- 管理域名配置
    -- 使用 Map 对象的 uci 实例
    local uci = m.uci
    
    -- 读取新配置
    local use_domain_val = uci:get("fileshare", "config", "use_domain")
    local domain_name_val = uci:get("fileshare", "config", "domain_name") or "fileshare.lan"
    
    -- 获取路由IP地址
    local ip = luci.sys.exec("uci get network.lan.ipaddr 2>/dev/null | head -1")
    if not ip or ip == "" then
        ip = luci.sys.exec("ifconfig br-lan 2>/dev/null | grep 'inet addr' | awk '{print $2}' | cut -d: -f2 | head -1")
    end
    if not ip or ip == "" then
        ip = "192.168.1.1"
    end
    ip = ip:gsub("%s+", "")
    ip = ip:match("^([^/]+)") or ip
    
    -- 查找所有指向当前路由器IP的域名记录（可能是之前创建的旧记录）
    local old_domain_sections = {}
    uci:foreach("dhcp", "domain", function(section)
        if section.ip == ip then
            table.insert(old_domain_sections, {
                section_name = section[".name"],
                domain_name = section.name
            })
        end
    end)
    
    if use_domain_val == "1" then
        -- 启用域名访问
        if not domain_name_val or domain_name_val == "" then
            return
        end
        
        -- 查找是否已存在该域名的配置
        local domain_section = nil
        for _, old_domain in ipairs(old_domain_sections) do
            if old_domain.domain_name == domain_name_val then
                domain_section = old_domain.section_name
                break
            end
        end
        
        -- 删除所有指向当前IP但域名不同的旧记录（包括更改域名时留下的旧记录）
        for _, old_domain in ipairs(old_domain_sections) do
            if old_domain.domain_name ~= domain_name_val then
                uci:delete("dhcp", old_domain.section_name)
            end
        end
        
        -- 添加或更新新域名的配置
        if domain_section then
            -- 更新现有配置
            uci:set("dhcp", domain_section, "ip", ip)
        else
            -- 创建新配置
            local new_section = uci:section("dhcp", "domain", nil, {
                name = domain_name_val,
                ip = ip
            })
        end
        uci:commit("dhcp")
        -- 重启 dnsmasq 服务使配置生效
        luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null 2>&1")
    else
        -- 停用域名访问：删除所有指向当前IP的域名记录
        -- 这样可以确保即使配置的域名改变了，也能删除旧的记录
        local has_deleted = false
        for _, old_domain in ipairs(old_domain_sections) do
            uci:delete("dhcp", old_domain.section_name)
            has_deleted = true
        end
        
        if has_deleted then
            uci:commit("dhcp")
            -- 重启 dnsmasq 服务使配置生效
            luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null 2>&1")
        end
    end
end

return m

