# Garmin MCP

独立的 Python MCP 服务，通过 `garminconnect` 访问 Garmin Connect 数据。当前提供身体、活动、课程与日历等 MCP 工具，包含 `set_activity_type` 和 `fix_badminton_activity_types` 两个修改活动类型的工具；不能将整个工具集视为只读。源码位于 `src/garmin_mcp/`。

## 目录

```text
src/garmin_mcp/          客户端、MCP 工具和启动入口
config/garmin.example.json  配置模板
config/garmin.json     本机佳明凭据，不提交
pyproject.toml          Python 打包和依赖
Dockerfile              独立 MCP 服务镜像
```

## 本地运行

在本目录执行：

```bash
cp config/garmin.example.json config/garmin.json
python -m pip install -e .
python -m garmin_mcp
```

在 `config/garmin.json` 填写邮箱和密码。中国区使用 `garmin.cn`，其他地区使用 `garmin.com`。也可通过 `GARMIN_CONFIG_PATH` 指定其他配置文件。MCP 客户端需以本目录作为工作目录。项目不要求根目录存在虚拟环境；如需隔离依赖，可在本目录自行创建 `.venv/`。

## Docker

在本目录执行：

```bash
docker build -t garmin-mcp .
docker run --rm -i -v "$PWD/config/garmin.json:/app/config/garmin.json:ro" garmin-mcp
```

镜像默认运行 MCP 标准输入输出服务。配置文件和健康数据不会复制进镜像。

健康应用的 Compose 使用同一镜像，以 `python -m garmin_mcp.http` 启动私有 Streamable HTTP MCP 服务。该入口只暴露应用需要的读取工具及训练创建/日历排程两项写入工具，端口不发布到主机；原有 `python -m garmin_mcp` 标准输入输出入口仍提供完整工具集。

## 与健康应用的关系

本目录仅实现 Garmin MCP，不包含健康助手 Agent、Web 前端、饮食记录、提醒或数据库。

训练相关工具包含 `get_calendar`、`get_workouts`、`get_workout_by_id`、`create_workout` 和 `schedule_workout`。新写入接口仅接受校验后的计时步骤与可选心率区间，创建及排程后回读。已在真实账号验证 `garminconnect 0.2.40` 的上传、排程和日历回读，
