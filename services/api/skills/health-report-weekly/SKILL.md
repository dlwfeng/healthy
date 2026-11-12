---
name: health-report-weekly
description: 用证据手记方式生成HTML健康周报。
---

# 证据手记

参考 DeepCogNeural/html-artifact-report-skill。

把周报设计成温和、清晰的分析手记。结论先行，证据与解释相互对应，细节自然展开。

配色以暖白和深青绿为主。

内容保留五部分：身体状态与变化、运动活动与消耗、饮食管理与摄入、综合复盘与近期动态、行动指南与关注点。

自行调用原始工具获取资料，根据实际记录写作。通过 submit_health_report 提交完整静态HTML文档，CSS内嵌，图表用SVG，引用工具返回的evidence_id。字体、配色、布局和图表由你设计。
