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
DATABASE_URL=sqlite+aiosqlite:////var/www/vocabbook-cloud/cloud_server/cloud_app.db
SECRET_KEY=请替换成一长串随机字符串
ALIPAY_APP_ID=你的支付宝应用ID
ALIPAY_PRIVATE_KEY_PATH=/var/www/vocabbook-cloud/secure/alipay_private_key.pem
ALIPAY_PUBLIC_KEY_PATH=/var/www/vocabbook-cloud/secure/alipay_public_key.pem
ALIPAY_NOTIFY_URL=https://api.historyai.fun/api/pay/alipay/notify
```

说明：

- `SECRET_KEY` 不要继续用仓库里的占位符
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
curl -sS http://127.0.0.1:8010/
```

预期返回：

```json
{"status":"Cloud Server Running","version":"1.0.0"}
```

公网再测：

```bash
curl -sS https://api.historyai.fun/
```

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
