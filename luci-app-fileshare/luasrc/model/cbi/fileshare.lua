require("luci.sys")
require("luci.util")

m = Map("fileshare", translate("内网共享配置"), translate("配置内网共享服务的参数"))

s = m:section(NamedSection, "config", "fileshare", translate("基本设置"))
s.addremove = false

-- 获取端口配置
local port = "3000"
m.uci:foreach("fileshare", "fileshare", function(s)
    port = s.port or "3000"
end)

-- 获取路由IP地址
local ip = luci.sys.exec("uci get network.lan.ipaddr 2>/dev/null | head -1")
if not ip or ip == "" then
    ip = luci.sys.exec("ifconfig br-lan 2>/dev/null | grep 'inet addr' | awk '{print $2}' | cut -d: -f2 | head -1")
end
if not ip or ip == "" then
    ip = "192.168.1.1"
end
ip = ip:gsub("%s+", "")

-- 构建URL
local url = "http://" .. ip .. ":" .. port

-- 打开网页按钮
local open_btn = s:option(Button, "open_web", translate("打开网页"), translate("在新窗口打开 fileshare 网页"))
open_btn.inputtitle = translate("打开网页")
open_btn.inputstyle = "add"
function open_btn.write(self, section, value)
    luci.http.write('<script>window.open("' .. url .. '", "_blank");</script>')
    return
end

enabled = s:option(Flag, "enabled", translate("启用服务"), translate("启用或禁用内网共享服务"))
enabled.default = "1"
enabled.rmempty = false

port = s:option(Value, "port", translate("服务端口"), translate("服务监听的端口号（默认：3000）"))
port.datatype = "port"
port.default = "3000"
port.rmempty = false

password = s:option(Value, "password", translate("访问密码"), translate("外网访问和未授权内网访问所需的密码"))
password.password = true
password.default = "123456"
password.rmempty = false

allowed_hosts = s:option(Value, "allowed_hosts", translate("允许免密码访问的主机"), translate("内网中允许免密码访问的主机IP或域名，多个用逗号分隔（例如：192.168.1.1,192.168.1.100）"))
allowed_hosts.default = "192.168.1.1"
allowed_hosts.placeholder = "192.168.1.1,192.168.1.100"

function m.on_after_commit(self)
    luci.sys.call("/etc/init.d/fileshare reload >/dev/null 2>&1")
end

return m

