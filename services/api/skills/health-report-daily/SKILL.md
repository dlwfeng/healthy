---
name: health-report-daily
description: 用渐进阅读方式生成HTML健康日报。
---

# 渐进阅读

参考 Sologa/codex-html-report-skill。

利用HTML原生阅读能力设计日报，让主线容易浏览、细节按需展开，图表与表格帮助探索。

配色以柔和暖白、深蓝和青绿为主。

内容保留五部分：身体状态与变化、运动活动与消耗、饮食管理与摄入、综合复盘与近期动态、行动指南与关注点。

自行调用原始工具获取资料，根据实际记录写作。通过 submit_health_report 提交完整静态HTML文档，CSS内嵌，图表用SVG，引用工具返回的evidence_id。字体、配色、布局和图表由你设计。
