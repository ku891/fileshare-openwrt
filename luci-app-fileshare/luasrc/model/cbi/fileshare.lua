require("luci.sys")
require("luci.util")

m = Map("fileshare", translate("内网共享配置"), translate("配置内网共享服务的参数"))

-- DNS记录管理函数
local function manageDNSRecord(domain, ip, action)
    if not domain or domain == "" or not ip or ip == "" then
        return false
    end
    
    -- 使用 /etc/hosts 文件管理DNS记录
    -- dnsmasq会自动读取hosts文件
    local hosts_file = "/etc/hosts"
    local marker = "# fileshare-dns-record"
    local temp_file = "/tmp/fileshare_hosts.tmp"
    
    if action == "add" then
        -- 先删除可能存在的旧记录
        manageDNSRecord(domain, ip, "remove")
        
        -- 添加DNS记录到hosts文件（带标记以便识别）
        local add_cmd = string.format('echo "%s %s %s" >> %s', ip, domain, marker, hosts_file)
        luci.sys.call(add_cmd)
        
        -- 重新加载dnsmasq
        luci.sys.call("/etc/init.d/dnsmasq reload >/dev/null 2>&1")
        return true
    elseif action == "remove" then
        -- 读取hosts文件内容
        local hosts_content = luci.sys.exec("cat " .. hosts_file .. " 2>/dev/null") or ""
        if hosts_content == "" then
            return true
        end
        
        -- 创建临时文件，过滤掉包含该域名和标记的行
        local f = io.open(temp_file, "w")
        if f then
            for line in hosts_content:gmatch("[^\r\n]+") do
                -- 检查是否包含域名和标记（fileshare-dns-record）
                if not (line:match(domain) and line:match("fileshare%-dns%-record")) then
                    f:write(line .. "\n")
                end
            end
            f:close()
            
            -- 将临时文件内容复制回hosts文件
            luci.sys.call(string.format("cp %s %s 2>/dev/null", temp_file, hosts_file))
            luci.sys.call(string.format("rm -f %s 2>/dev/null", temp_file))
        end
        
        -- 重新加载dnsmasq
        luci.sys.call("/etc/init.d/dnsmasq reload >/dev/null 2>&1")
        return true
    end
    return false
end

-- 保存旧配置值（在提交前）
local old_domain_value = ""
local old_enabled_value = "1"

-- 初始化时读取旧配置值
m.uci:foreach("fileshare", "fileshare", function(s)
    old_domain_value = s.local_domain or ""
    old_enabled_value = s.enabled or "1"
end)

-- 更新DNS记录
local function updateDNSRecord()
    -- 读取新配置（保存后的值）
    m.uci:load("fileshare")
    local new_domain = m.uci:get("fileshare", "config", "local_domain") or "fileshare.lan"
    local new_enabled = m.uci:get("fileshare", "config", "enabled") or "1"
    
    -- 如果旧域名存在且与新域名不同，删除旧记录
    if old_domain_value ~= "" and old_domain_value ~= new_domain then
        manageDNSRecord(old_domain_value, ip, "remove")
    end
    
    -- 如果服务被禁用，删除DNS记录
    if new_enabled == "0" then
        if old_domain_value ~= "" then
            manageDNSRecord(old_domain_value, ip, "remove")
        end
        if new_domain ~= "" and new_domain ~= old_domain_value then
            manageDNSRecord(new_domain, ip, "remove")
        end
    else
        -- 如果服务启用且新域名存在，添加新记录
        if new_domain ~= "" then
            manageDNSRecord(new_domain, ip, "add")
        end
    end
end

-- 在提交前保存旧值
function m.on_before_save(self)
    -- 重新读取当前配置值（保存前的值）
    m.uci:foreach("fileshare", "fileshare", function(s)
        old_domain_value = s.local_domain or ""
        old_enabled_value = s.enabled or "1"
    end)
    return true
end

s = m:section(NamedSection, "config", "fileshare", translate("基本设置"))
s.addremove = false

-- 获取端口配置
local port = "3000"
local local_domain = "fileshare.lan"
local use_domain = "1"
m.uci:foreach("fileshare", "fileshare", function(s)
    port = s.port or "3000"
    local_domain = s.local_domain or "fileshare.lan"
    use_domain = s.use_domain or "1"
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
-- 移除CIDR格式的掩码（如 /24）
ip = ip:match("^([^/]+)") or ip

-- 构建URL（根据配置选择使用域名或IP）
local url
if use_domain == "1" and local_domain and local_domain ~= "" then
    url = "http://" .. local_domain .. ":" .. port
else
    url = "http://" .. ip .. ":" .. port
end

-- 打开网页按钮
local open_btn = s:option(Button, "open_web", translate("打开网页"), translate("在新窗口打开 fileshare 网页"))
open_btn.inputtitle = translate("打开网页")
open_btn.inputstyle = "add"
function open_btn.write(self, section, value)
    -- 重新读取配置以确保使用最新值
    local current_port = "3000"
    local current_domain = "fileshare.lan"
    local current_use_domain = "1"
    m.uci:foreach("fileshare", "fileshare", function(s)
        current_port = s.port or "3000"
        current_domain = s.local_domain or "fileshare.lan"
        current_use_domain = s.use_domain or "1"
    end)
    
    local current_url
    if current_use_domain == "1" and current_domain and current_domain ~= "" then
        current_url = "http://" .. current_domain .. ":" .. current_port
    else
        current_url = "http://" .. ip .. ":" .. current_port
    end
    
    luci.http.write('<script>window.open("' .. current_url .. '", "_blank");</script>')
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

-- 本地域名配置
local_domain = s:option(Value, "local_domain", translate("本地域名"), translate("用于访问的本地域名（默认：fileshare.lan），保存后会自动配置DNS解析"))
local_domain.default = "fileshare.lan"
local_domain.placeholder = "fileshare.lan"
local_domain.rmempty = false

-- 选择使用域名或IP打开网页
use_domain = s:option(Flag, "use_domain", translate("使用域名打开网页"), translate("启用后，打开网页时将使用配置的本地域名，否则使用IP地址"))
use_domain.default = "1"
use_domain.rmempty = false

function m.on_after_commit(self)
    -- 更新DNS记录
    updateDNSRecord()
    -- 重新加载fileshare服务
    luci.sys.call("/etc/init.d/fileshare reload >/dev/null 2>&1")
end

return m

