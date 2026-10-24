# Komari 接入 Cloudflare：完整配置与重装恢复教程

编写日期：2026-10-24，基于一次真实部署整理。本文已将域名、邮箱、Tunnel ID、节点名和本机路径替换为示例，使用前必须换成自己的值；示例不是预置的可用服务。命令以 Debian/Linux、systemd、root 为前提。Cloudflare 界面名称以后可能变化；重装时先对照实际端口、CPU 架构、Agent 版本。

本文不包含真实密钥。所有 `替换为……` 都必须换成对应值。配置文件里有密钥的部分不要上传 Git、截图公开或贴到群里。

## 1. 这次最终是怎样连接的

浏览器访问：

```text
你的浏览器
  → HTTPS status.example.com
  → Cloudflare Access：只允许指定管理员邮箱，应用会话 14 天
  → Cloudflare Tunnel
  → 建站机 127.0.0.1:25774
  → Komari
```

节点连接：

```text
Komari Agent
  → 本机 http://127.0.0.1:25775
  → 本机 Caddy：自动添加该节点的 Cloudflare Service Token 请求头
  → HTTPS kagent.example.com
  → Cloudflare Access：Service Auth 验证机器令牌
  → Cloudflare Tunnel：只允许指定 Agent 接口路径
  → 建站机 127.0.0.1:25774
  → Komari：继续验证原有节点令牌
```

面板下发任务、节点上报结果使用已建立的连接，双向内容都经过 Cloudflare。这不代表 VPS 的全部网络流量、SSH、Xray 流量都走 Cloudflare；本次接入的是 Komari 通信。

为什么需要 Caddy：本次使用本机代理给 Agent 请求补充 Access 认证头，无须改 Komari Agent 源码。Caddy 支持 WebSocket 升级和双向传输。外部 HTTPS 证书正常验证，没有使用 `tls_insecure_skip_verify`。本机 Agent 到 Caddy、建站机 Tunnel 到 Komari 使用回环地址 HTTP，不经过公网。[Caddy 官方说明](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

### 当前配置表

| 项目 | 本次实际配置 |
|---|---|
| 面板域名 | `status.example.com` |
| Agent 域名 | `kagent.example.com` |
| 面板 Access 应用 | `Komari Panel` |
| 面板策略 | `komari-admin-only`，Allow，指定邮箱 |
| 允许邮箱 | `admin@example.com` |
| 面板应用会话 | `2 weeks`，即 14 天 |
| Agent Access 应用 | `Komari Agent` |
| Agent 策略 | `komari-agent-only`，Service Auth |
| Agent Service Token | 每台一枚，Non-expiring |
| 已迁移节点 | VPS-A、VPS-B、VPS-C、NAT 节点 |
| Tunnel | `example_tunnel` |
| Tunnel UUID | `00000000-0000-0000-0000-000000000000` |
| Tunnel CNAME 目标 | `00000000-0000-0000-0000-000000000000.cfargotunnel.com` |
| 建站机 Komari 端口 | `127.0.0.1:25774` |
| 各节点本机代理端口 | `127.0.0.1:25775` |
| 本次面板镜像 | `ghcr.io/komari-monitor/komari:1.6.0` |
| 本次代理版本 | Caddy `2.11.7`，Linux amd64 |

现有 Tunnel 中原有的 memos、1Panel、password 路由保持原配置，只追加 Komari 两条路由。Xray 应用、DNS、缓存规则保持原配置。

## 2. 密钥文件要不要留

**建议保留一份加密备份。删除电脑上的备份不会让正在运行的 Agent 断线，也不会撤销 Cloudflare 令牌。**

服务端正在使用的凭据保存在各节点：

```text
/etc/komari-cf-proxy/credentials.env
```

个人部署时可将汇总文件保存到受控位置，例如：

```text
C:\Users\YOUR_USER\Desktop\komari-cloudflare-service-tokens.json
```

汇总文件应保存各节点的 Cloudflare Client ID、Client Secret。应限制为当前 Windows 用户访问；这属于访问权限保护，不等于文件已经加密。放入你的密码管理器、加密存储或加密备份后，可以删除桌面上的这份明文。

如果备份丢了，但旧节点还活着，可以通过 SSH 取回该节点的 `credentials.env`。如果节点也重装了，且没有密钥备份，最直接的恢复方式是：重新创建该节点的 Service Token，加入 Agent 策略、配置新凭据，然后禁用或删除旧令牌。创建时就保存 Secret，不要依赖以后从控制台找回。[Cloudflare Service Token 文档](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

### 三种令牌不要混用

| 凭据 | 用处 | 从哪里取得 |
|---|---|---|
| Cloudflare Service Token：Client ID + Client Secret | 让某台 Agent 通过 Cloudflare Access | 桌面 JSON 或该节点 `credentials.env` |
| Komari 节点 Token | 让 Komari 识别具体节点 | Komari 节点安装命令、原 Agent 配置或服务文件 |
| Cloudflare Tunnel 连接 Token | 让建站机 cloudflared 连接指定 Tunnel | Cloudflare 对应 Tunnel 的安装连接器界面 |

**桌面 JSON 不能代替后两种凭据。** 永不过期只代表没有预设到期日，不代表不能撤销。若文件泄露，应轮换涉及的 Service Token，而不仅仅是删文件。

## 3. 重装前最值得备份的东西

1. 桌面 Service Token JSON，放到加密备份中。
2. Komari 完整数据目录，包括数据库、主题、插件及其配置。
3. Komari compose 文件、环境配置、各节点原有安装参数与 Token。
4. 每台 Agent 的 Caddyfile、代理服务文件、Agent 覆盖文件、凭据文件。
5. DNS、Tunnel、Access、缓存规则的参数。本教程已记录关键内容。
6. 如果使用了自定义脚本或定时任务，也一并备份。

建站机当前路径：

```text
/opt/1panel/apps/komari/komari/docker-compose.yml
/opt/1panel/apps/komari/komari/data/
/opt/1panel/www/conf.d/status.example.com.conf
/opt/1panel/www/sites/status.example.com/proxy/
```

数据库运行中不要只复制一个 `.db` 文件而忽略 WAL。可以使用 SQLite 在线 backup，或者安排短暂停止 Komari 后复制完整数据目录；在线 backup 只负责数据库，主题、插件和其他文件仍要备份。

本次已有建站机备份：

```text
/root/komari-cf-migration-YYYYMMDDTHHMMSSZ
```

其中包含 `komari.db`、`metrics.db` 的在线备份、compose、容器信息、原网站配置和 9 个网站配置文件的哈希基线。它是本次迁移时的快照，不包含此后新增的全部监控记录。重装前仍应做新的备份，并复制到其他机器。

## 4. 先准备建站机的 Komari

### 4.1 在 1Panel 安装或恢复 Komari

恢复原数据并使用兼容版本启动。先确认本机接口可以访问：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:25774/
docker ps --format '{{.Names}} {{.Ports}}'
ss -lntp | grep ':25774'
```

容器端口发布应当是：

```yaml
ports:
  - "127.0.0.1:25774:25774"
```

这是需要合并到实际 compose 对应服务中的片段，不是完整 compose。不要覆盖整个原文件，也不要把已有数据卷删掉。

不要配置成 `0.0.0.0:25774`、`[::]:25774` 或裸写 `25774:25774`。如果保留公网后端端口，外部就可能绕过 Access 直接找 Komari。

### 4.2 确认 cloudflared 在哪个网络环境

本次 cloudflared 是建站机上的现有服务，因此可以访问建站机的 `127.0.0.1:25774`。

如果重装后改成 Docker 容器运行 cloudflared，容器里的 `127.0.0.1` 是容器自身，不能照抄本教程的回环地址。应当重新选择明确的网络连接方式，例如让连接器使用宿主机网络，或与 Komari 接入受控的同一 Docker 网络，并调整 Tunnel 回源地址。不要为图省事开放 Komari 公网端口。

## 5. 在 Cloudflare 建好 Access，再开放域名

建议顺序：Access 应用 → Tunnel 路由 → DNS。这样可以减少新域名暂时裸露的时间。

### 5.1 为四台节点分别创建 Service Token

Cloudflare One → Access controls → Service credentials / Service tokens → Create Service Token。

本次实际使用：

| 节点 | 当前令牌名 |
|---|---|
| VPS-A | `komari-agent-node-a` |
| VPS-B | `komari-agent-node-b-v2` |
| VPS-C | `komari-agent-node-c` |
| NAT 节点 | `komari-agent-nat` |

Duration 选 `Non-expiring`，创建后立即保存 Client ID、Client Secret，并标注对应节点。API 中的非到期值为 `forever`。[Cloudflare API 字段说明](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/service_tokens/)

本次最初的 VPS-B 令牌由于创建页面响应异常，没有拿到完整 Secret，因此已禁用；最终实际使用的是 `komari-agent-node-b-v2`。恢复时不要把这个禁用的旧令牌加入策略。

### 5.2 创建 Agent 专用应用

Access controls → Applications → 新建 Self-hosted 应用：

```text
Name: Komari Agent
Hostname: kagent.example.com
Path: 留空
```

创建并只绑定一条策略：

```text
Policy name: komari-agent-only
Action: Service Auth
Include: Service Token
Value: 明确选中本次四枚 Komari 专用令牌
```

不要选 `Bypass`，不要添加 Everyone，也不要用“任意 Service Token”让 Xray 等其他凭据自动通用。Agent App 不需要给浏览器邮箱添加 Allow。

这一层把机器与人分开；后面的 Tunnel 路径限制进一步避免机器凭据进入完整管理面板。

### 5.3 创建面板专用应用

再新建 Self-hosted 应用：

```text
Name: Komari Panel
Hostname: status.example.com
Path: 留空，保护整个网站
Session Duration: 2 weeks
```

唯一策略：

```text
Policy name: komari-admin-only
Action: Allow
Include: Emails
Value: admin@example.com
Policy Session Duration: Same as application session timeout
```

如果以后换管理员邮箱，改成自己的实际邮箱；不要只填整个邮箱域名。不要给面板添加 Service Auth、Bypass 或公开首页例外。

保留现有可用登录方式。本次没有开启 WARP 自动认证，也没有修改全局 Access 设置。Komari 原有账号、2FA 等登录保护继续保留。

### 5.4 为什么是 14 天，还有哪些情况会要求重新登录

关键是应用设置 `2 weeks`，策略继承应用，而不是被更短的策略会话覆盖。本次保存并重新打开核实过这个值。全局、策略、应用及 WARP 会话之间存在不同作用范围，不要为了一个应用盲目修改整个账户的设置。[Cloudflare 会话说明](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)

14 天是 Access 的应用会话时长，不是保证任何设备、任何情况下都不再登录。清除 Cookie、换浏览器、撤销会话、身份提供商变化，以及 Komari 自身登录到期，都可能需要再次认证。Cloudflare Access 和 Komari 登录是两层，前者不会自动延长后者。

## 6. 安装或恢复 Tunnel 连接器

### 已有 Tunnel 的情况

本次复用了 `example_tunnel`，UUID：

```text
00000000-0000-0000-0000-000000000000
```

如果只是建站机重装、Cloudflare 配置还在，打开这个 Tunnel 的连接器安装界面，选择新系统和架构，按界面显示的官方命令安装 cloudflared，并使用该 Tunnel 的连接 Token。不要把 Service Token 当成这里的 Token。

确认：

```bash
systemctl is-enabled cloudflared
systemctl is-active cloudflared
```

Cloudflare 控制台连接状态应为 Healthy。不要输出或公开带完整 Token 的 cloudflared 服务参数。

官方安装流程以当时控制台命令为准：[创建和安装 Tunnel 连接器](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)。如果选择新建 Tunnel，后续所有 DNS CNAME 目标都必须换成新 UUID。

### 追加两条 Published application 路由

| 域名 | Path | Service |
|---|---|---|
| `kagent.example.com` | `^/api/clients/(v2/rpc\|terminal\|transfer/[^/]+)$` | `http://127.0.0.1:25774` |
| `status.example.com` | 留空 | `http://127.0.0.1:25774` |

上表为了 Markdown 表格显示，竖线带了转义；**实际填写下方代码块里的原始表达式，不要带反斜杠**：

```regex
^/api/clients/(v2/rpc|terminal|transfer/[^/]+)$
```

不要为 `kagent` 再添加一个无限制兜底路由，否则会破坏路径限制。未匹配的请求应返回 404。现有其他域名路由不要删除、改顺序或改回源参数。

这些接口是本次 Agent 使用的 RPC、终端和文件传输路径。以后升级 Komari 如果新增接口，应先查官方实现、测试，再只补必要路径，不要直接改成允许全部路径。

## 7. DNS 切换到 Tunnel，注意 IPv6

在 `example.com` 的 DNS 中，最终只需要：

| 类型 | 名称 | 目标 | 代理 |
|---|---|---|---|
| CNAME | status | `00000000-0000-0000-0000-000000000000.cfargotunnel.com` | Proxied，橙云 |
| CNAME | kagent | 同上 | Proxied，橙云 |

如果 Tunnel 自动创建 DNS 成功，不要重复建记录。本次 `status` 之前已有 A 和 AAAA，Tunnel 路由创建成功，但自动创建 DNS 失败；处理方式是先备份旧值，删除旧 AAAA，将 status 的 A 替换成上述 CNAME 并打开橙云。

旧 A、AAAA 都要处理，不能只改 IPv4。不要改 `xpanel`、`xagent`、`xsub` 或其他服务记录。

迁移前请把旧记录保存到自己的私有 DNS 回滚记录中。DNS 记录是一个绕行入口来源，但删 DNS 并不能防止别人用历史 IP 直连，因此还需要第 10 节的源站封堵。

## 8. 每台普通 VPS 配置本机 Caddy

VPS-A、VPS-B、VPS-C 使用下面的普通 systemd 方案。**NAT 节点 改用第 9 节的服务文件，不要照抄普通服务的隔离选项。**

### 8.1 备份原 Agent

在对应节点以 root 操作：

```bash
umask 077
backup_dir="/root/komari-cf-manual-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$backup_dir"
cp -a /etc/systemd/system/komari-agent.service "$backup_dir/"
cp -a /opt/komari/agent "$backup_dir/"
install -d -m 755 /opt/komari-cf-proxy /etc/komari-cf-proxy
printf '%s\n' "$backup_dir" > /opt/komari-cf-proxy/backup-path
chmod 600 /opt/komari-cf-proxy/backup-path
```

已有迁移配置的机器先检查、备份，不要覆盖现成的 `90-cloudflare.conf` 或凭据。新装 Agent 应先在 Komari 中使用正确节点 Token 安装；恢复旧数据库时尽量恢复原节点身份，避免生成重复节点。

### 8.2 安装官方 Caddy 独立二进制

本次使用独立路径，不接管系统已有的 `caddy.service`，也不占 80/443。

先检查架构：

```bash
uname -m
```

下面命令只适用于 `x86_64`。本次固定版本 2.11.7；以后换版本需要同时替换文件名、URL、校验文件，并重新测试。

```bash
cd /opt/komari-cf-proxy
curl -fL -o caddy_2.11.7_linux_amd64.tar.gz \
  https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_linux_amd64.tar.gz
curl -fL -o caddy_2.11.7_checksums.txt \
  https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_checksums.txt
awk '$2 == "caddy_2.11.7_linux_amd64.tar.gz" {print}' \
  caddy_2.11.7_checksums.txt > selected-checksum.txt
test -s selected-checksum.txt && sha512sum -c selected-checksum.txt
```

必须看到校验 `OK` 才继续；本次官方清单是 SHA-512，不是 SHA-256。不要忽略校验失败。

```bash
tar -xzf caddy_2.11.7_linux_amd64.tar.gz caddy
chmod 755 /opt/komari-cf-proxy/caddy
/opt/komari-cf-proxy/caddy version
```

官方来源：[Caddy releases](https://github.com/caddyserver/caddy/releases)。ARM 机器要换对应架构的官方资产，不能执行 amd64 二进制。

### 8.3 保存该节点的 Cloudflare 凭据

使用编辑器创建 `/etc/komari-cf-proxy/credentials.env`，避免将真实 Secret 写到一条会被 Shell 历史记录的命令里：

```bash
install -d -m 755 /etc/komari-cf-proxy
touch /etc/komari-cf-proxy/credentials.env
chmod 600 /etc/komari-cf-proxy/credentials.env
chown root:root /etc/komari-cf-proxy/credentials.env
nano /etc/komari-cf-proxy/credentials.env
```

文件内容（填当前这台机器对应的值）：

```dotenv
KOMARI_CF_CLIENT_ID=替换为该节点的ClientID
KOMARI_CF_CLIENT_SECRET=替换为该节点的ClientSecret
```

这里是 systemd EnvironmentFile 格式，不需要 `export`。不要额外加入空格，不要把 VPS-A 的凭据复制给所有节点。

### 8.4 完整 Caddyfile

创建 `/etc/komari-cf-proxy/Caddyfile`：

```caddyfile
{
 admin off
 auto_https off
 persist_config off
 log {
  format filter {
   wrap json
   fields {
    request>uri delete
    request>headers delete
   }
  }
 }
}
http://127.0.0.1:25775 {
 bind 127.0.0.1
 route {
  @health path /healthz
  respond @health "ok" 200
  @agent path /api/clients/v2/rpc /api/clients/terminal /api/clients/transfer/*
  reverse_proxy @agent https://kagent.example.com {
   header_up Host kagent.example.com
   header_up CF-Access-Client-Id {$KOMARI_CF_CLIENT_ID}
   header_up CF-Access-Client-Secret {$KOMARI_CF_CLIENT_SECRET}
  }
  respond "Not found" 404
 }
}
```

```bash
chmod 755 /opt/komari-cf-proxy /etc/komari-cf-proxy
chmod 644 /etc/komari-cf-proxy/Caddyfile
chmod 600 /etc/komari-cf-proxy/credentials.env
```

Caddyfile 没有真实密钥，所以可供非 root 服务账户读取；Secret 只在 root 的凭据文件中，由 systemd 传入进程。日志过滤去掉请求 URI 和请求头，减少节点 Token、Access Secret 被意外写日志的机会。不要临时开启包含完整头部/URL 的调试记录后忘记关闭。

### 8.5 普通 VPS 服务文件

创建 `/etc/systemd/system/komari-cf-proxy.service`：

```ini
[Unit]
Description=Komari Cloudflare Access loopback proxy
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
DynamicUser=yes
EnvironmentFile=/etc/komari-cf-proxy/credentials.env
ExecStart=/opt/komari-cf-proxy/caddy run --config /etc/komari-cf-proxy/Caddyfile --adapter caddyfile
Restart=on-failure
RestartSec=3
StateDirectory=komari-cf-proxy
WorkingDirectory=/var/lib/komari-cf-proxy
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryMax=128M
TasksMax=64
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

然后先启动代理，不急着改 Agent：

```bash
systemctl daemon-reload
systemctl enable --now komari-cf-proxy
systemctl is-active komari-cf-proxy
curl -fsS http://127.0.0.1:25775/healthz
curl -sS -A 'Go-http-client/1.1' -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:25775/api/clients/v2/rpc
```

预期：服务 `active`，健康检查 `ok`，最后是 **401**。这是故意没有提交 Komari 节点 Token 的请求：它说明 Cloudflare 机器认证已通过，请求到达了 Komari 自身的认证层。若返回 302、403、502，不要继续切换 Agent，先排错。

### 8.6 只改变 Agent 的连接地址

本次保留了原 `/etc/systemd/system/komari-agent.service`，增加一个覆盖文件。先在自己终端查看原服务参数；其中可能包含节点 Token，不要公开输出：

```bash
systemctl cat komari-agent
```

创建目录和文件：

```bash
install -d -m 755 /etc/systemd/system/komari-agent.service.d
touch /etc/systemd/system/komari-agent.service.d/90-cloudflare.conf
chmod 600 /etc/systemd/system/komari-agent.service.d/90-cloudflare.conf
nano /etc/systemd/system/komari-agent.service.d/90-cloudflare.conf
```

内容模板：

```ini
[Unit]
Wants=komari-cf-proxy.service
After=komari-cf-proxy.service

[Service]
ExecStart=
ExecStart=/opt/komari/agent -e http://127.0.0.1:25775 -t 替换为原Komari节点Token --disable-auto-update --month-rotate 替换为原账期日
```

**应复制原 ExecStart 的全部参数，只把 `-e` / `--endpoint` 后的地址改为 `http://127.0.0.1:25775`。** 上面只是示例。原有网卡、挂载点、内存、轮询等参数都保留；原先没有的参数不要生搬硬加。本次三台普通 VPS 的账期日为 VPS-A 22、VPS-B 11、VPS-C 10；NAT 节点 保留它原有参数。

空的 `ExecStart=` 用于清除旧命令，下一行设置新命令。不要把 Cloudflare Client Secret 填到 `-t`，这里需要的是原 Komari 节点 Token。

### 8.7 带自动回滚保护切换

本次迁移使用了 5 分钟回滚计时器，先 VPS-A，确认后再其他节点。手工恢复时也可以保留这个保护。以下适用于原 Agent 能在旧入口工作的迁移阶段；如果旧入口已封堵，单独回滚 Agent 不能恢复旧连接。

```bash
cat > "$backup_dir/rollback.sh" <<'EOF'
#!/bin/sh
set -eu
rm -f /etc/systemd/system/komari-agent.service.d/90-cloudflare.conf
systemctl daemon-reload
systemctl restart komari-agent
EOF
chmod 700 "$backup_dir/rollback.sh"
systemd-run --unit=komari-cf-rollback --on-active=5m "$backup_dir/rollback.sh"
systemctl daemon-reload
systemctl restart komari-agent
```

若前面的终端会话已断开，先从 `/opt/komari-cf-proxy/backup-path` 找回实际备份路径并重新设置 `backup_dir`，不能使用空变量。

检查：

```bash
systemctl is-active komari-agent komari-cf-proxy
ss -ntp | grep '127.0.0.1:25775'
journalctl -u komari-agent -n 30 --no-pager
```

在自己的终端看日志即可，分享前遮蔽 Token。还要在面板确认当前节点在线、数据持续刷新，不能只凭 `systemctl active` 判断连接成功。确认后取消计时器：

```bash
systemctl stop komari-cf-rollback.timer
```

如果服务是全新重装后的最终部署，不存在可用旧入口，也可以不设置这个“回退旧地址”计时器；失败时按诊断步骤修复新链路。

## 9. NAT 节点：Podman / NAT 环境的特殊处理

### 9.1 本次实际遇到的问题

NAT 节点 是受限 Podman 环境。普通 VPS 的 systemd 强隔离选项在这里不能直接使用：

| 表现 | 本次原因 | 处理 |
|---|---|---|
| `226/NAMESPACE` | systemd 创建隔离命名空间受限 | NAT 节点 专用服务去掉相关命名空间隔离项 |
| `217/USER`、CAP_SYS_ADMIN 相关报错 | systemd 直接切用户在此容器中受限 | 由 `setpriv` 降权启动 Caddy |
| 配置或程序路径 Permission denied | `umask 077` 导致非 root 账户无法穿过目录 | 新代理目录 755、无密钥配置 644；凭据仍 600 |

这些尝试都在切换 Agent 前检查，代理不可用就没有贸然切换 Agent。最后没有修改 Podman 特权模式、NAT 映射或其他服务配置。

### 9.2 创建专用非登录账户

仍然完成第 8 节的二进制、凭据、Caddyfile；**仅替换服务方案**。确认 `setpriv` 可用：

```bash
command -v setpriv
```

在 Debian 中它属于 util-linux。若缺失，先通过系统包管理器安装对应官方包。

```bash
id komaricf >/dev/null 2>&1 || useradd --system --user-group \
  --home-dir /var/lib/komari-cf-proxy-compat \
  --shell /usr/sbin/nologin komaricf
install -d -m 700 -o komaricf -g komaricf /var/lib/komari-cf-proxy-compat
install -d -m 700 -o komaricf -g komaricf \
  /var/lib/komari-cf-proxy-compat/config /var/lib/komari-cf-proxy-compat/data
chmod 755 /opt/komari-cf-proxy /etc/komari-cf-proxy
chmod 755 /opt/komari-cf-proxy/caddy
chmod 644 /etc/komari-cf-proxy/Caddyfile
chmod 600 /etc/komari-cf-proxy/credentials.env
chown root:root /etc/komari-cf-proxy/credentials.env
```

只调整新代理的目录，不要递归修改 `/etc`、`/opt` 或其他服务目录权限。

### 9.3 NAT 节点 最终兼容服务文件

`/etc/systemd/system/komari-cf-proxy.service`：

```ini
[Unit]
Description=Komari Cloudflare Access loopback proxy (Podman compatible)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/komari-cf-proxy/credentials.env
Environment=XDG_CONFIG_HOME=/var/lib/komari-cf-proxy-compat/config
Environment=XDG_DATA_HOME=/var/lib/komari-cf-proxy-compat/data
ExecStart=/usr/bin/setpriv --reuid=komaricf --regid=komaricf --clear-groups --no-new-privs /opt/komari-cf-proxy/caddy run --config /etc/komari-cf-proxy/Caddyfile --adapter caddyfile
WorkingDirectory=/var/lib/komari-cf-proxy-compat
NoNewPrivileges=true
UMask=0077
Restart=on-failure
RestartSec=3
MemoryMax=128M
TasksMax=64
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

不要再添加普通 VPS 示例中的 `DynamicUser`、`PrivateTmp`、`ProtectHome`、`ProtectSystem`，也不要再加 systemd `User=komaricf`。systemd 以 root 读取 600 凭据，然后 `setpriv` 将实际 Caddy 进程降权为 `komaricf`。

之后按第 8 节先启动代理、预检 401，再修改 Agent 覆盖文件和重启。NAT 节点 是 NAT 并不妨碍该方案：Agent/Caddy 主动向外建立 HTTPS 连接，不需要给 25775 添加公网端口映射。

最终检查：

```bash
systemctl is-active komari-agent komari-cf-proxy
systemctl is-enabled komari-agent komari-cf-proxy
ps -o user,rss,args -p "$(systemctl show komari-cf-proxy -p MainPID --value)"
stat -c '%a %U %n' /etc/komari-cf-proxy/credentials.env
ss -ntp | grep '127.0.0.1:25775'
```

本次确认进程账户是 `komaricf`、凭据 `600 root`、连接已建立。验证时 NAT 节点 Caddy RSS 约 54 MiB；普通 VPS 曾测到约十几 MiB，使用量会变化。`MemoryMax=128M` 是上限配置，不是始终占用 128 MiB；资源过紧时查看实际内存和服务日志。

## 10. 源站封堵：只允许 Tunnel 进入 Komari

必须同时做到两件事：后端只监听本机、旧网站入口不能反代到 Komari。

### 10.1 处理旧 1Panel 网站

当前旧网站文件：

```text
/opt/1panel/www/conf.d/status.example.com.conf
```

先备份此文件。在它对应 `status.example.com` 的 `server { ... }` 中靠前加入：

```nginx
# Komari is reachable only through Cloudflare Tunnel.
return 403;
```

本次实际是在 `server {` 后加入。若重建后的配置有多个 status 的 server 块，应分别检查所有 IPv4/IPv6、HTTP/HTTPS 入口，不要只改其中一个。只处理 Komari 的 server，**不要放入全局配置、其他站点或默认 server**。

Tunnel 直接连接 `127.0.0.1:25774`，因此该网站的 403 不会拦住正常 Tunnel 回源。

### 10.2 先测试，再平滑重载

先找当前 OpenResty 容器名称：

```bash
docker ps --format '{{.Names}} {{.Image}}'
```

使用实际名称，例如本次 `YOUR_OPENRESTY_CONTAINER`：

```bash
docker exec YOUR_OPENRESTY_CONTAINER nginx -t
# 只有上一条成功才执行：
docker exec YOUR_OPENRESTY_CONTAINER nginx -s reload
```

容器名重装后可能不同，不要照抄旧容器 ID。本次检查通过后进行了平滑重载，9 个站点配置中只有 Komari 这一份发生变化。

不要关闭整个建站机的 80/443，因为博客等其他服务还需要它们；也不要为了 Komari 改全局 SSL、WAF、Access 或 Tunnel 配置。

**以后在 1Panel 编辑、保存、重建这个 Komari 网站，可能会重新生成配置。每次都要复查 `return 403` 和后端回环监听。**

### 10.3 历史 IP 与其他域名的边界

Tunnel 可以避免 Komari 通过自己的 DNS 继续直接指向源站，但你的建站机还承载其他服务、历史 DNS 也可能留存，因此不应把它理解为源站 IP 从此绝对保密。真正关键的是：即使知道历史 IP，也无法绕过保护进入 Komari。

还要检查是否存在其他旧域名、默认网站或额外反代指向 Komari；若有，应一起封堵这些具体入口，不能只检查 status 这一个域名。

## 11. 添加 Komari 专用缓存绕过

Cloudflare → `example.com` → Caching → Cache Rules → 新建规则：

```text
Name: bypass komari cache
Custom filter expression:
(http.host in {"status.example.com" "kagent.example.com"})
Cache eligibility: Bypass cache
Order: Last
Deploy
```

只匹配这两个域名。原有 `bypass xray cache` 保持不变。本次部署后，两条规则均 Active。不要把整个域名区域的所有服务都设成绕过缓存。

## 12. 最后怎样验收

### 12.1 检查访问隔离

在一个没有登录 Cookie 的终端中：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://status.example.com/
curl -sS -o /dev/null -w '%{http_code}\n' https://kagent.example.com/api/clients/v2/rpc
```

本次结果如下：

| 测试 | 实际结果 | 含义 |
|---|---|---|
| 未登录访问面板 | 302 → Cloudflare Access 登录 | 整站受到保护 |
| Agent 域名不带机器凭据 | 403 | 未授权机器不能进入 |
| 本机代理访问 RPC，不带 Komari Token | 401 | 已过 Access，仍需 Komari 节点认证 |
| 有效机器凭据访问 Agent `/admin` | 404 | Agent 域名无法进入管理页面 |
| 机器凭据访问面板域名 | 302 → 登录 | 机器凭据没有面板访问权限 |
| 直接访问旧源站 IPv4/IPv6，携带 status 域名 | 403 | 旧源站入口已封堵 |

不同 Cloudflare 设置或版本可能返回不同的拒绝状态，因此同时检查响应来源、Location 和是否实际泄露页面；不能把任何 302 都当作成功。健康检查 `ok` 仅说明本机代理活着，不能代替完整链路测试。

### 12.2 外部验证源站 IPv4 和 IPv6

在另一台有相应网络的机器执行，换成重装后的实际源站 IP：

```bash
curl --max-time 15 --resolve 'status.example.com:443:替换为源站IPv4' \
  -sS -o /dev/null -w '%{http_code}\n' https://status.example.com/
curl --max-time 15 --resolve 'status.example.com:443:[替换为源站IPv6]' \
  -sS -o /dev/null -w '%{http_code}\n' https://status.example.com/
```

不要加 `-k`，让证书也受到验证。若旧源站不再提供有效证书，TLS 失败本身不等于完成了 HTTP 403 验证；应另外在源站本机核对网站监听和配置。若没有 IPv6 网络，IPv6 测试不能视为通过。

### 12.3 验证正常功能

1. 用允许的邮箱通过 Access，打开首页和后台。
2. Dashboard 显示 4/4 在线，CPU、网络流量等持续变化。
3. 检查 VPS-A、VPS-B、VPS-C、NAT 节点 的本机代理连接。
4. 检查主题历史图表、延迟数据和插件管理页。
5. 确认代理及 Agent 都是 `enabled`，避免重启后掉线。
6. 升级后若依赖终端、文件传输、远程命令，应单独做受控功能测试；不要只看在线图标。Komari 自身的 2FA 仍按原流程验证。
7. 核对其他服务网站、Xray 等状态，没有改动无关站点配置。

本次确认首页和后台实时数据正常，4 台在线，在线率历史、IPQA 告警、Telegram、流量定期报告四个插件均 Running。本次未为验收额外发送 Telegram 测试消息；“插件 Running”也不能替代未来每一次定时通知送达的验证。

## 13. 重装后的最短恢复路线

### 情况 A：只重装一台 Agent 机器

1. Cloudflare 中的 DNS、Tunnel、Access 不需要重建。
2. 用恢复后的 Komari 面板取得该节点的安装参数与节点 Token，安装兼容 Agent。
3. 安装 Caddy 独立二进制。
4. 从加密备份恢复该节点的 Service Token 到 `credentials.env`。
5. 写 Caddyfile、代理服务；NAT 节点 使用 Podman 专用版本。
6. 先启动代理，通过 `healthz` 和 401 预检。
7. 设置 Agent 覆盖文件，连接 `http://127.0.0.1:25775`。
8. 启动并启用两项服务，确认面板实时在线。

如果该节点 Service Token 已撤销或丢失，新建一枚，仅把它加入 `komari-agent-only`，配置新值；通过后移除旧值。其他节点不用一起换。

### 情况 B：只重装建站机，Agent 没动

1. 恢复 Komari 数据和兼容面板版本，包括节点身份、插件、主题。
2. 确认面板后端只发布 `127.0.0.1:25774`。
3. 用 Cloudflare 现有 Tunnel 的安装命令恢复 cloudflared，确认 Healthy。
4. 检查两个域名路由仍回源到正确端口；保留其他路由。
5. 现有 Tunnel UUID 未变时，通常不需要改 DNS 或 Access。
6. 恢复旧 status 网站的 403 封堵，检查 IPv4 和 IPv6。
7. 检查 Agent 自动重连、历史数据与插件。

不要为了重装建站机把四台节点全部卸载重装；只要节点身份及入口没变，它们可以继续重试并恢复连接。

### 情况 C：Cloudflare Tunnel 也重建了

除了情况 B，还要：新建连接器、添加两条路由、把两个 CNAME 改为新 UUID 的 `.cfargotunnel.com`。Access 应用按域名保护，仍需核对启用和策略。不要误删原 Tunnel 中其他服务的路由；共享 Tunnel 的迁移应协调其余服务。

### 情况 D：连 Komari 数据库也丢失

只有 Service Token JSON 无法恢复监控历史和 Komari 节点身份。需要重建 Komari 节点、获得新的节点 Token 并更新各 Agent；Cloudflare Service Token 可以继续用，但它不负责恢复 Komari 数据。这是为什么数据库备份同样重要。

## 14. 故障排查与这次踩过的坑

| 现象 | 先检查什么 |
|---|---|
| 面板 / Agent 502、Tunnel 回源失败 | cloudflared Healthy、本机 25774、容器网络与回源地址 |
| 代理启动但 Agent 不在线 | 代理 RPC 预检、原 Komari Token、覆盖文件、WebSocket 日志 |
| Agent 连接被 302 重定向到登录 | 是否用了面板域名、Agent 应用是否 Service Auth、请求头是否注入 |
| Agent 403 | Service Token 是否启用、是否在明确允许列表中、是否取错节点 Secret |
| 代理预检 401 | 本次预检的正常结果；真实 Agent 仍须携带有效 Komari Token |
| `kagent /admin` 404 | 本次设计的正常拒绝；不要为此放宽路径 |
| Python 测试 Cloudflare 报 1010 | 本次默认 urllib UA 曾被拦；用实际 Go Agent UA 或 curl 复测，不要关闭全局安全保护 |
| NAT 节点 226 / 217 | 按第 9 节用 Podman 兼容服务，别升级成特权容器 |
| NAT 节点 Permission denied | 检查程序和父目录可遍历、Caddyfile 可读、状态目录归属；Secret 仍 600 |
| 只在 IPv6 能绕过 | 旧 AAAA、IPv6 监听或其他网站反代遗漏 |
| 1Panel 保存网站后直连恢复 | 自动生成覆盖了 403；重新处理该网站并测试重载 |
| Agent 更新后重新直连 status | 安装/更新脚本覆盖了服务或丢掉 drop-in；复查最终启动参数 |
| 重装后又出现重复节点 | Komari 节点 Token/数据库没有按原身份恢复 |
| 不到 14 天又登录 | 区分 Access 与 Komari 自身登录；检查 Cookie、策略会话、WARP 与身份提供商 |

本次没有通过关闭 TLS 验证、放宽全局 WAF、公开全部 API、增加 NAT 入站端口来解决连接问题。未来出现问题也应先确定是哪一层失败。

升级 Komari/Caddy/cloudflared 前保留配置与兼容版本，先测试一台节点，再扩展到其他节点。当前路径匹配基于本次实际版本，不应假设未来所有版本接口完全相同。

## 15. 回滚和当前备份位置

### 本次节点备份

| 节点 | 备份目录 |
|---|---|
| VPS-A | `/root/komari-cf-migration-YYYYMMDDTHHMMSSZ` |
| VPS-B | `/root/komari-cf-migration-YYYYMMDDTHHMMSSZ` |
| VPS-C | `/root/komari-cf-migration-YYYYMMDDTHHMMSSZ` |
| NAT 节点 | `/root/komari-cf-migration-YYYYMMDDTHHMMSSZ` |

节点也可以读取 `/opt/komari-cf-proxy/backup-path` 找到备份。原 Agent unit 保持未改，`rollback.sh` 的核心动作是移除新增 drop-in、重载 systemd、重启 Agent。

**但是现在旧入口已经封堵，单独运行节点 rollback.sh 会让 Agent 回到不可达旧入口，不能当作独立恢复手段。** 通常优先修复代理；若确实决定完整回退，应协调以下部分：

1. 备份当前状态，安排维护窗口。
2. 恢复可供旧 Agent 使用的旧入口，并根据需要协调 Access 策略；不要在仍只有邮箱登录的 status 上期待原 Agent 直连成功。
3. 按旧 DNS 记录恢复 status 的 A/AAAA，或设计明确的新回退入口。
4. 从建站机备份恢复原 status 网站配置，先 `nginx -t` 再平滑重载。
5. 各节点运行对应回滚脚本并核实连接。
6. 确认不再使用后再停止 Komari 专用代理、移除 Komari 专用规则；共享 Tunnel 和其他服务规则保持不变。

完整回退会改变安全边界，因此发生故障时不要一边盲目关 Access 一边删除配置。先区分是连接器、源站、机器凭据还是本机代理问题，通常修复一处即可。

## 16. 长期维护清单

- 加密保存桌面 JSON，并把数据库和配置做独立、定期的异机备份。
- 每台独立 Service Token；丢失或泄露只轮换对应令牌，不共用所有节点凭据。
- 机器令牌永久有效不代表永远不需要维护；升级、重装、令牌撤销、策略变更都会影响连接。
- 继续保留 Komari 自身认证、2FA；不要因为有 Access 就公开危险功能。
- 1Panel 重建网站、Agent 重装更新、Tunnel 更换后，重新做第 12 节的验收。
- 不在聊天记录、公开仓库或截图中展示 Client Secret、节点 Token、Tunnel Token。
- 全部通信依赖 Cloudflare、Tunnel 和建站机可用性，代理也有额外内存成本；发生外部服务故障时不能保证监控入口仍然可用。

这份教程与实际配置记录配套使用。配置文件可恢复连接，数据库备份才能恢复节点身份和历史数据；两类备份都要留。
