module("luci.controller.fileshare", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/fileshare") then
        return
    end

    local page = entry({"admin", "services", "fileshare"}, cbi("fileshare"), _("内网共享"), 60)
    page.dependent = true
end

