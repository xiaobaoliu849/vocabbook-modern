# VocabBook Cloud Server Deployment

适用场景：
- 你已经有阿里云 ECS
- 域名 DNS 在 Cloudflare
- 现有站点是 `historyai.fun` / `dota2bot.fun`
- 这次新增 `api.historyai.fun` 给 VocabBook 云端会员和订单接口

推荐拓扑：

`Cloudflare DNS -> Nginx(443) -> localhost:8010 -> uvicorn(FastAPI)`

## 1. 域名与端口规划

推荐直接复用你现有域名，不需要新买域名：

- `api.historyai.fun` -> VocabBook Cloud Server

本地端口建议：

- `127.0.0.1:8010` -> `cloud_server`

这样不会和你现有 `historyai.fun` / `dota2bot.fun` 服务冲突。

## 2. Cloudflare 配置

在 Cloudflare 中新增一条 DNS 记录：

- Type: `A`
- Name: `api`
- Content: 你的 ECS 公网 IP
- Proxy status: 建议先 `DNS only` 跑通，再切 `Proxied`

如果你已经有稳定 HTTPS 和反代经验，也可以直接开橙云。

## 3. 服务器目录

建议部署目录：

```bash
/var/www/vocabbook-cloud
```

建议 Python 虚拟环境：

```bash
/var/www/vocabbook-cloud/.venv
```

## 4. 服务器初始化

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx
```

CentOS/Alibaba Cloud Linux 类似环境：

```bash
sudo yum install -y python3 python3-pip nginx
```

## 5. 上传项目

把这几个目录/文件传到服务器即可：

- `cloud_server/`

可选一起传：

- `README.md`
- `docs/deploy/`
- `deploy/nginx/`
- `deploy/systemd/`

## 6. 安装依赖

```bash
cd /var/www/vocabbook-cloud
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r cloud_server/requirements.txt
```

## 7. 环境变量

推荐用 `systemd` 的 `Environment=` 或 `EnvironmentFile=` 注入。

最少需要：

```bash
ENVIRONMENT=production
DATABASE_URL=sqlite+aiosqlite:////var/www/vocabbook-cloud/cloud_server/cloud_app.db
SECRET_KEY=请替换成一长串随机字符串
ADMIN_TOKEN=请替换成另一条长随机字符串
CORS_ORIGINS=https://api.historyai.fun
DEBUG_PAYMENT_MOCKS=false
ALIPAY_APP_ID=你的支付宝应用ID
ALIPAY_PRIVATE_KEY_PATH=/var/www/vocabbook-cloud/secure/alipay_private_key.pem
ALIPAY_PUBLIC_KEY_PATH=/var/www/vocabbook-cloud/secure/alipay_public_key.pem
ALIPAY_NOTIFY_URL=https://api.historyai.fun/api/pay/alipay/notify
```

说明：

- `SECRET_KEY` 不要继续用仓库里的占位符
- `ADMIN_TOKEN` 用于后台管理接口，必须和 `SECRET_KEY` 分开生成
- `ENVIRONMENT=production` 会启用启动期配置校验；支付宝仍指向沙盒、回调不是 HTTPS、mock 支付开启、CORS 为 `*` 时服务会拒绝启动
- 生产环境还会校验 `ALIPAY_APP_ID` 不能使用示例值，且 `ALIPAY_PRIVATE_KEY_PATH` / `ALIPAY_PUBLIC_KEY_PATH` 必须指向真实存在的密钥文件
- 支付宝私钥、公钥不要放在仓库目录中，建议单独放：

```bash
/var/www/vocabbook-cloud/secure/
```

## 8. systemd 启动

参考：

- [deploy/systemd/vocabbook-cloud.service.example](/mnt/d/Projects/vocabbook-modern/deploy/systemd/vocabbook-cloud.service.example)

部署后：

```bash
sudo cp deploy/systemd/vocabbook-cloud.service.example /etc/systemd/system/vocabbook-cloud.service
sudo systemctl daemon-reload
sudo systemctl enable vocabbook-cloud
sudo systemctl start vocabbook-cloud
sudo systemctl status vocabbook-cloud
```

`deploy_cloud_server_remote.sh` 会在覆盖代码前备份当前版本到：

```bash
/var/www/vocabbook-cloud/deploy_backups/
```

如果部署后的健康检查失败，脚本会自动恢复上一版 `cloud_server` / `deploy` / `scripts` / `docs` 并重启服务。默认保留最近 5 份备份，可在远程执行时用 `KEEP_BACKUPS=10` 调整。

## 9. Nginx 反代

参考：

- [deploy/nginx/vocabbook-cloud.conf.example](/mnt/d/Projects/vocabbook-modern/deploy/nginx/vocabbook-cloud.conf.example)

部署后：

```bash
sudo cp deploy/nginx/vocabbook-cloud.conf.example /etc/nginx/conf.d/vocabbook-cloud.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 10. HTTPS

如果你已经沿用现有证书管理方式，直接替换证书路径即可。

如果是你现有的 `/etc/nginx/ssl/*.pem/*.key` 方式，建议：

- `/etc/nginx/ssl/api.historyai.fun.pem`
- `/etc/nginx/ssl/api.historyai.fun.key`

## 11. 验证接口

服务器本机先测：

```bash
curl -sS http://127.0.0.1:8010/health
```

预期返回：

```json
{"status":"healthy","database":true,"environment":"production"}
```

部署包内置了更完整的检查脚本。带上后台 token 时，会额外验证支付 readiness：

```bash
/var/www/vocabbook-cloud/.venv/bin/python /var/www/vocabbook-cloud/scripts/cloud_deploy_check.py \
  --base-url http://127.0.0.1:8010 \
  --expect-production \
  --admin-token "$ADMIN_TOKEN"
```

远程部署脚本也支持同样的正向支付检查：

```bash
DEPLOY_ADMIN_TOKEN="$ADMIN_TOKEN" /tmp/deploy_cloud_server_remote.sh
```

公网再测：

```bash
python scripts/cloud_deploy_check.py --base-url https://api.historyai.fun --expect-production
```

生产支付小额联调可以用本地脚本创建真实支付宝订单：

```bash
python scripts/payment_live_drill.py \
  --base-url https://api.historyai.fun \
  --email 你的测试账号邮箱 \
  --password 你的测试账号密码 \
  --admin-token 你的后台管理Token
```

脚本会登录账号、创建 `premium_monthly` 订单、确认订单金额为 29 元并输出支付宝 QR URL。扫码支付后，再用客户端或后台订单列表确认订单从 `PENDING` 变为 `SUCCESS`。

## 12. 手动开会员

在真实支付接通前，你完全可以先手动开会员。

数据库是 SQLite 时，最简单方式：

```bash
sqlite3 /var/www/vocabbook-cloud/cloud_server/cloud_app.db
```

执行：

```sql
UPDATE users
SET tier = 'premium',
    license_expiry = '2026-12-31 23:59:59'
WHERE email = '你的用户邮箱';
```

然后本地/Electron 端登录该账号即可自动识别高级权限。

如果已经有订单号，优先使用后台接口补单，而不是直接改库：

```bash
curl -X POST https://api.historyai.fun/admin/orders/订单号/status \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: 你的后台管理Token" \
  -d '{"status":"SUCCESS","trade_no":"人工补单流水号"}'
```

可用状态：

- `SUCCESS`：确认收款并开通/延长会员，重复执行不会重复延长
- `FAIL`：标记失败订单
- `EXPIRED`：标记过期订单
- `PENDING`：把未支付且未成功的异常订单退回待支付

## 13. 本地项目联动

前端/Electron：

```bash
VITE_CLOUD_API_URL=https://api.historyai.fun
```

本地后端：

```bash
VOCABBOOK_CLOUD_API_URL=https://api.historyai.fun
```

## 14. 当前最稳的上线顺序

1. 先部署 `cloud_server`
2. 先手动开会员，不急着接支付
3. 本地 app 验证 `premium` 权限
4. 再接支付宝回调
5. 最后再考虑“订阅即用 AI 代理”

## 15. 重要安全提醒

不要提交这些文件到公开仓库：

- 支付宝私钥
- 公钥私钥备忘文本
- `.env`
- 线上数据库

尤其是你本地那个：

- `公钥私钥.txt`

虽然现在没被 Git 跟踪，但建议尽快移出项目目录。
