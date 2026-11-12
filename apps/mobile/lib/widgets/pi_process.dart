import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

String piToolLabel(dynamic name) =>
    const {
      'get_user_summary': '每日概览',
      'get_sleep_data': '睡眠',
      'get_hrv_data': 'HRV',
      'get_body_battery': '身体电量',
      'get_weigh_ins': '体重',
      'get_training_readiness': '训练准备度',
      'get_activities_by_date': '日期活动',
      'get_activities': '近期活动',
      'get_workouts': '训练课程',
      'get_calendar': '佳明日历',
      'get_workout_by_id': '训练详情',
      'create_workout': '创建佳明训练',
      'schedule_workout': '安排佳明日历',
      'record_daily_status': '保存每日状态',
      'get_daily_status': '每日状态记录',
      'get_meals': '饮食记录',
      'get_nutrition_trend': '营养趋势',
      'get_energy_balance': '热量平衡',
      'copy_meal': '复制餐食到草稿',
      'record_meal': '记餐 · 识别与联网核对',
    }[name] ??
    '$name';

class PiProcessBlock extends StatelessWidget {
  const PiProcessBlock({super.key, required this.block});
  final Map<String, dynamic> block;
  @override
  Widget build(BuildContext context) {
    if (block['type'] == 'text') {
      return MarkdownBody(data: '${block['text'] ?? ''}');
    }
    final state = block['state'];
    final label =
        const {
          'running': '处理中',
          'done': '已完成',
          'pending': '待核对',
          'failed': '调用失败',
          'stopped': '已停止',
        }[state] ??
        '处理中';
    final duration = block['durationMs'] as num?;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            state == 'done'
                ? Icons.check_circle_outline
                : state == 'failed'
                ? Icons.error_outline
                : Icons.more_horiz,
            size: 16,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '${piToolLabel(block['name'])} · $label${duration == null ? '' : ' · ${(duration / 1000).toStringAsFixed(1)} 秒'}',
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
