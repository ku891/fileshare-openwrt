require("luci.sys")
require("luci.util")

m = Map("fileshare", translate("内网共享配置"), translate("配置内网共享服务的参数"))

-- 运行状态部分
status_section = m:section(TypedSection, "status", translate("运行状态"))
status_section.template = "cbi/tblsection"
status_section.addremove = false

-- 检查服务状态
local is_running = false
local pid = luci.sys.exec("pgrep -f 'node.*server.js' | head -1")
if pid and pid ~= "" then
    is_running = true
end

-- 获取端口配置
local port = "3000"
m.uci:foreach("fileshare", "fileshare", function(s)
    port = s.port or "3000"
end)

-- 获取主机地址
local host = luci.http.getenv("HTTP_HOST") or luci.sys.net.hostname()
local protocol = luci.http.getenv("HTTPS") == "on" and "https" or "http"
local url = protocol .. "://" .. host .. ":" .. port

-- 状态显示
local status_text = is_running and '<span style="color: green; font-weight: bold;">● ' .. translate("运行中") .. '</span>' or '<span style="color: red; font-weight: bold;">● ' .. translate("已停止") .. '</span>'
local status_dummy = status_section:option(DummyValue, "status", translate("服务状态"))
status_dummy.value = status_text
status_dummy.rawhtml = true

-- 打开网页按钮
local open_btn = status_section:option(Button, "open_web", translate("打开网页"))
open_btn.inputtitle = translate("在新窗口打开")
open_btn.inputstyle = "add"
function open_btn.write(self, section, value)
    luci.http.write('<script>window.open("' .. url .. '", "_blank");</script>')
    return
end

s = m:section(NamedSection, "config", "fileshare", translate("基本设置"))
s.addremove = false

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

