# 网页本地服务与 Garmin 接口

项目统一通过 Compose 的 `http://localhost:3060/` 访问网页和 `/api/` 代理；`8060` 仅供本机 API 故障定位。服务提供 Garmin 只读接口 `GET /api/health/overview?date=YYYY-MM-DD&days=7`（`days` 还支持 30），以及健康助手对话接口 `POST /api/chat`。请求带 `Accept: application/x-ndjson` 时，对话接口会发送状态、回答文字、Garmin 工具开始/结束和最终回答事件；最终事件与普通 JSON 响应均只返回 `answer` 字符串作为模型回答。事件不包含健康助手思考内容、工具参数或 Garmin 原始返回。健康助手使用 `minimax-cn/MiniMax-M3.1-Flash`（普通对话为低思考强度，报告为中等强度）；MiniMax 密钥只从 API 服务的 `MINIMAX_CN_API_KEY` 环境变量读取。项目根目录被 Git 忽略的 `.env` 可为 Compose 提供一份独立配置，API 不读取 OpenCode 凭据。Agent SDK、模型运行时和对话会话均由本服务独立创建；不会读写终端健康助手的 `~/.pi` 或其他健康助手项目的配置和会话。浏览器不直接连接 MiniMax 或 Garmin，也拿不到密钥。

健康助手会话禁用所有健康助手自带工具，按 Node API 白名单注册 Garmin MCP 当前完整的 81 项工具目录，另加每日状态、饮食和营养工具；参数 schema 与说明在会话创建时从 MCP 工具目录读取。Garmin 活动类型修改、羽毛球类型修正和数据同步工具要求明确用户请求，羽毛球修正先 dry-run；训练创建及排程沿用专门的确认和回读规则。没有通用 MCP 调用路由。用户明确要求记录时，工具调用后台 `POST /api/daily-status`；回顾及网页“生活记录”页调用 `GET /api/daily-status?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`。写入接口需要仅服务进程持有的内部令牌；读取接口供当前网页使用，现阶段网页未设登录鉴权。每次写入新增一条原文记录，同一天可有多条。对话本身只在请求期间保存在内存中。Garmin 概览数据按日期整理并缓存两分钟；网页上的“刷新数据”可以主动重新查询。

## 运行

Compose 和访问方式见根目录 README。每日状态保存在 Compose 的 PostgreSQL `healthy_db` 卷中，日期按上海时区解释。API 镜像只安装 Node 依赖，不包含 Python 或 Garmin MCP 源码。网页饮食回顾和 Flutter 已接入共享记录；训练创建及日历排程已由独立训练模块接入；健康助手可查询 Garmin 数据，但不作健康诊断。

食谱库提供 `/api/recipes`、`/api/recipes/:id` 和 `/api/recipes/:id/images/:index` 三个只读接口，文字、配料与图片均由 PostgreSQL 持久化。

## 网页数据接口

- `GET /api/health/body-status?date=YYYY-MM-DD`：身体状态扩展只读数据，包括训练状态/负荷/重点、HRV 周平均与基线、周强度活动、近一年最近体重及有效目标、身体年龄、喝水、楼层、全天心率、呼吸、血氧、血压、FTP、最大摄氧量、乳酸阈值与上次活动。只返回显式展示字段，按工具缓存五分钟，失败项进入 `unavailable`；`refresh=1` 主动刷新。
- `GET /api/health/body-status/timeline?date=YYYY-MM-DD&metric=hrv`：28 天的 HRV **七天平均**及各日基线；`metric=intensity` 返回本周每日中等强度分钟加高强度分钟双倍后的数值；`metric=floors` 返回本周每日上楼/下楼、各日目标和可空的达标状态。数据串行读取、缓存去重，日期缺失保留 null。这两个接口按需加载，不阻塞原概览。

- `GET /api/health/overview?date=YYYY-MM-DD&days=7`：所选日期的显式字段、日内电量/夜间心率/HRV 观测、睡眠阶段与评分、准备度因素、佳明步数目标、范围内最近运动、体重和课程。`days` 支持 7/30；`refresh=1` 跳过两分钟概览缓存。最近运动使用已有 `get_activities_by_date` 按范围读取，不混入查看日期之后的活动；最多展示 30 条，课程最多 30 条。
- `GET /api/health/history?date=YYYY-MM-DD&days=7&metric=sleep`：明确指标白名单 `sleep`（分钟）、`restingHeartRate`（bpm）、`hrv`（昨夜平均，ms）、`stress`（0–100）、`steps`（步）。逐日读取既有只读工具，保留缺失日期的 `null`，部分失败返回对应日期列表。共享逐日数据缓存五分钟、同一请求去重并串行访问；`refresh=1` 重新查询，浏览器取消后停止后续日期读取。身体电量和体重趋势复用概览中的范围数据。

网页接口数据先归一化再返回；健康助手的 MCP 原始工具则按原始返回提供给 Agent。睡眠评分兼容 `dailySleepDTO.sleepScores`，体重兼容 `dailyWeightSummaries`，负值不当作有效健康观测，HRV 周平均不会冒充昨夜平均。服务端过滤网页接口中的活动标识、坐标、账号信息与完整上游响应。健康助手仅能调用 API 端显式登记的 Garmin 工具名，不提供通用 MCP 转发。

## 运动日历与健康助手训练工具

`GET /api/health/calendar?month=YYYY-MM` 合并实际活动与 Garmin 日历训练，允许未来月份；`GET /api/health/workouts/{id}` 按需返回筛选后的训练详情。日历读取不使用身体概览缓存。健康助手新增 `get_calendar`、`get_workout_by_id` 读取与 `create_workout`、`schedule_workout` 写入；没有直接向网页开放 Garmin 写入路由，也不开放任意 MCP 转发。

用户明确要求创建/安排训练或确认草案后，健康助手创建模板、排入日期并回读；回读未确认时报告真实状态。步骤仅支持计时与可选心率区间；

## 饮食记录

`GET /api/nutrition-profile` 从本地缓存返回 Garmin 资料对应的年龄段与性别。服务定时检查并同步出生日期、性别和同步时间到 PostgreSQL；缓存超过 7 天时暂停参考判断。网页不会收到原始出生日期，健康助手也不能调用 Garmin 用户资料工具。

`/api/meals` 提供餐食 CRUD、照片及 MiniMax 识别结果；`get_meals` 为健康助手提供只读记录和逐餐/范围营养汇总。餐食和处理后照片均存 PostgreSQL，初次访问自动建表。照片识别沿用 `MINIMAX_CN_API_KEY`，识别食物后可调用 MiniMax 服务端 `web_search` 查询营养参考并返回来源；客户端需确认估算才可保存，未知营养为 null。

识别默认使用 `MiniMax-M3.1-Flash`；上游返回 429/5xx/529（集群过载）且没有显式配置其他候选模型时，返回 `analysis_overloaded`，客户端提示稍后重试。`MiniMax-M3.1-Flash` 只支持自适应思考，因此按用途分配 token 预算，普通识别、记餐与联网查询显式使用低思考档，联网检索限制为 2 次。当前固定版本 SDK 尚无此模型，服务在独立 runtime 中登记真实模型 ID 和自适应思考参数；运行时 token 上限为 16384，未登记价格的成本估计不代表实际账单。模型顺序可用环境变量 `MINIMAX_MEAL_MODEL`（逗号分隔）覆盖，只接受已登记的模型名。

健康助手额外注册两个只读趋势工具（上海日期，首尾包含，最多31天，不支持未来日期）：

- `get_nutrition_trend(start_date, end_date)`：逐日热量、蛋白质、碳水与脂肪，保留空白日期、单位和已记录餐食字段完整性，不返回照片或餐食备注。
- `get_energy_balance(start_date, end_date)`：逐日摄入、Garmin 总消耗和应用估算缺口，负缺口表示盈余；复用网页历史查询缓存，不重复叠加活动热量。缺失摄入/消耗或已录热量不完整时缺口为 null，今天为暂估。范围合计只使用同组可比过去日期，返回纳入/排除日期和天数；漏记仍可能使缺口偏大。每个会话最多查询62个热量日期。

原 `get_meals` 继续提供逐餐明细。对话系统提示按问题选择对应工具，网页进度分别显示“营养趋势”“热量平衡”。

## 长期记忆（2026-10-29）

健康助手通过原生记忆扩展提供 `memory_add`、`memory_replace`、`memory_remove`、`memory_search`、`session_search`。使用按需检索模式，仅追加通用的短记忆原则；不把食堂、餐具等案例写成触发规则。用户可在聊天中要求纠正或删除记忆。工具调用成功后才可说明已保存。

运行数据与原生聊天会话位于服务专用 `.pi-agent/`，Compose 的 `healthy_memory` 卷保留这些内容；不读取宿主机或开发助手的记忆。扩展配置由 `health-memory.js` 在首次加载时写入，其他后台回顾、纠正检测及压缩前保存参数沿用上游默认。API 每次请求独立创建会话，因此后台回顾计数限于该次请求，不承诺每十条客户端消息都会触发；当轮主动记忆依靠原生工具和通用原则。

普通聊天和显式记餐都进入同一个健康助手入口。显式记餐仅开放记忆工具与 `record_meal`，无需发现 Garmin 工具；后者复用原图文识别流程，接收模型检索出的相关记忆作为参考，仍只生成待用户核对的草稿。旧 `/api/meals/chat` 兼容接口和独立健康报告不自动加载长期记忆。检索由模型按需决定，不保证每次都召回；网页与手机提供“记忆”只读菜单；修改和删除仍通过聊天完成。

`GET /api/memory` 只读展示当前持久化记忆条目（正文、类别、日期），不返回历史聊天或底层路径。未初始化时返回空列表，错误返回 `memory_unavailable`，不接受写请求。网页与手机共用此接口。
