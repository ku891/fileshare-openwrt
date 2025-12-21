require("luci.sys")
require("luci.util")

m = Map("fileshare", translate("内网共享配置"), translate("配置内网共享服务的参数"))

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

