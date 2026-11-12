# healthy

把 Garmin、体脂秤和三餐记录放进同一个个人健康助手的开源实现。网页端和 Flutter 手机端共用一套 Node API，后台通过 MCP 读取 Garmin 数据，由大模型决定查什么、调哪个工具，再把结果写回页面和对话。

> 个人项目，仍在持续开发。没有账号体系，默认只适合部署在自己的内网或 Tailscale 后面，不要直接暴露到公网。

## 能做什么

- **健康首页**：身体电量、睡眠、准备度、步数、饮食与营养、近期运动、个人记录，桌面和手机自适应
- **身体状态**：睡眠与恢复、HRV、压力、心率、血氧、训练负荷、最大摄氧量等 Garmin 指标，附趋势
- **运动训练**：活动统计、分圈详情、Garmin 训练日历；可以让健康助手创建训练并排进日历，回读确认
- **饮食记录**：拍照或手写记录三餐，模型识别食物并核对营养，按日汇总；手机和网页同步
- **健康助手**：流式对话，只注册白名单工具；可查睡眠、三餐、体重、运动，也能记录每日状态
- **健康报告**：定时生成日报/周报，模型自己写 HTML/CSS/SVG，在 sandbox iframe 中阅读
- **体脂秤同步**：从 Zepp Life 拉取体重与体成分，按来源和测量时刻去重后写入 PostgreSQL
- **长期记忆**：健康助手可保存和检索短记忆，网页与手机只读查看

## 架构

```text
┌──────────────┐   ┌──────────────┐
│  Web (Nginx) │   │ Flutter App  │
└──────┬───────┘   └──────┬───────┘
       │      /api/*       │
       └────────┬──────────┘
                ▼
        ┌───────────────┐        ┌────────────────┐
        │  Node API     │───────▶│  Garmin MCP    │──▶ Garmin Connect
        │  + Pi Agent   │  MCP   │  (Python)      │
        └───┬───────┬───┘        └────────────────┘
            │       │
            ▼       ▼
     PostgreSQL   MiniMax API
```

- `apps/web`：原生 JS 网页端，由 Nginx 提供静态文件并代理 `/api/`
- `apps/mobile`：Flutter 客户端，支持 Android 构建与 APK 自更新
- `services/api`：Node 服务，负责 Garmin 数据归一化、对话、饮食、报告、反馈和数据库
- `services/pi-worker`：隔离的 Pi Agent 运行容器
- `garmin-mcp`：独立 Python MCP 服务，封装 `garminconnect`
- `scripts`：部署、手机打包、品牌资源生成和本地开发辅助脚本

## 快速开始

### 1. 准备配置

```bash
cp .env.example .env
cp garmin-mcp/config/garmin.example.json garmin-mcp/config/garmin.json
```

在 `garmin-mcp/config/garmin.json` 填入 Garmin 账号。中国区 `domain` 用 `garmin.cn`，其他地区用 `garmin.com`。

在 `.env` 中至少填写 `MINIMAX_CN_API_KEY`。不填也能启动，但健康助手和拍照识别不可用。

### 2. 启动

```bash
docker compose up -d --build
```

打开 <http://localhost:3060>。API 直连端口 `127.0.0.1:8060` 仅用于排障。

首次启动会自动建表。Garmin 数据读取失败时，先看 MCP 容器日志：

```bash
docker compose logs -f mcp api
```

### 3. 手机端（可选）

```bash
cd apps/mobile
flutter pub get
flutter build apk --debug --dart-define=HEALTH_API_URL=http://<你的局域网地址>:3060
```

手机需要能访问该地址。正式打包脚本 `scripts/deploy-mobile.py` 会从根目录 `.env` 的 `HEALTH_API_URL` 注入服务地址。

## 配置

| 变量 | 说明 |
|---|---|
| `MINIMAX_CN_API_KEY` | MiniMax API Key，对话与图片识别使用 |
| `MINIMAX_MEAL_MODEL` | 可选，逗号分隔的模型候选，默认 `MiniMax-M3.1-Flash` |
| `HEALTH_DB_PASSWORD` | 本地 PostgreSQL 密码，默认 `healthy_local_dev` |
| `HEALTH_API_URL` | 手机安装包内置的服务地址 |
| `ZEPP_APP_TOKEN` / `ZEPP_USER_ID` | 可选，Zepp Life 体脂秤同步 |
| `ZEPP_BASE_URL` | 可选，默认 `https://api-mifit-cn.huami.com` |
| `PI_HTTP_PROXY` / `PI_HTTPS_PROXY` | 可选，容器访问外网使用的代理 |
| `PI_PROJECT_ROOT` | 可选，Pi worker 看到的项目绝对路径，默认 `/workspace/healthy` |

Garmin 凭据只放在 `garmin-mcp/config/garmin.json`，该文件被 `.gitignore` 忽略。API Key 只放在 `.env`，不会进入镜像或前端。

## 开发与测试

```bash
# Node API（部分测试需要本地 PostgreSQL）
cd services/api && npm install && npm test

# Web
cd apps/web && node --test

# Garmin MCP
cd garmin-mcp && python -m unittest discover -s tests

# Flutter
cd apps/mobile && flutter analyze && flutter test
```

## 数据与隐私

- 仓库不包含任何真实健康数据、餐食照片、Garmin 凭据或模型密钥
- 运行数据放在本地 `data/` 和 PostgreSQL 卷中，均不提交
- 网页接口会过滤 Garmin 返回中的账号、坐标、活动标识和上游原始响应
- 健康助手只能调用 API 显式登记的工具名，没有通用 MCP 转发
- 当前没有登录鉴权，请只在自己可信的网络中运行

## 已知边界

- 体成分数据已入库并展示，但健康助手暂时没有 Zepp 专用查询工具
- 报告只校验引用是否存在，不保证数值和推理正确
- 饮食漏记不会自动记为 0；缺口偏大时按漏记标注
- 完整自适应训练计划、设备同步和提醒尚未实现
- iOS 端未验证，APK 自更新只支持 Android

## License

[MIT](LICENSE)
