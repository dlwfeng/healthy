import 'package:flutter/material.dart';
import '../app_theme.dart';
import '../nutrition_reference.dart';
import 'nutrition_widgets.dart';
import 'meal_energy.dart';

/// 每日汇总 Header：展示大字号日期、星期与当日 4 列宏量营养素看板
class DaySummaryHeader extends StatelessWidget {
  const DaySummaryHeader({
    super.key,
    required this.dateStr,
    required this.meals,
    required this.profile,
    this.expenditure,
  });

  final String dateStr;
  final num? expenditure;
  final List<Map<String, dynamic>> meals;
  final Map<String, dynamic>? profile;

  @override
  Widget build(BuildContext context) {
    final parsedDate = DateTime.tryParse(dateStr) ?? DateTime.now();
    final dayNum = parsedDate.day.toString();
    final monthNum = '${parsedDate.month} 月';
    final weekday = NutritionReference.weekdayLabel(parsedDate);

    final shanghaiNow = DateTime.now().toUtc().add(Duration(hours: 8));
    final todayStr =
        '${shanghaiNow.year}-${shanghaiNow.month.toString().padLeft(2, '0')}-${shanghaiNow.day.toString().padLeft(2, '0')}';
    final isToday = dateStr == todayStr;

    final assessment = NutritionReference.assessDay(meals, profile);

    final colors = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 10),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: 16),
          title: Text(
            '${isToday ? '今天' : '$monthNum$dayNum日'} · $weekday',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${meals.length} 餐',
                style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
              ),
              const SizedBox(height: 10),
              MealEnergySummary(
                intake: assessment.metrics['calories']!.value,
                complete: assessment.metrics['calories']!.complete,
                expenditure: expenditure,
                includeIntake: false,
              ),
            ],
          ),
          children: [NutrientMetricsGrid(metrics: assessment.metrics)],
        ),
      ),
    );
  }
}

/// 月份切换工具栏与图例
class MonthToolbarWidget extends StatelessWidget {
  const MonthToolbarWidget({
    super.key,
    required this.currentMonth,
    required this.onPreviousMonth,
    required this.onNextMonth,
    required this.onToday,
    required this.canGoNext,
    required this.isCurrentMonth,
  });

  final DateTime currentMonth;
  final VoidCallback onPreviousMonth;
  final VoidCallback onNextMonth;
  final VoidCallback onToday;
  final bool canGoNext;
  final bool isCurrentMonth;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        IconButton(
          tooltip: '上个月',
          onPressed: onPreviousMonth,
          icon: const Icon(Icons.chevron_left),
        ),
        Text(
          '${currentMonth.year}年${currentMonth.month}月',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        IconButton(
          tooltip: '下个月',
          onPressed: canGoNext ? onNextMonth : null,
          icon: const Icon(Icons.chevron_right),
        ),
        if (!isCurrentMonth)
          TextButton(onPressed: onToday, child: const Text('回到本月')),
        Text(
          '按日期回顾',
          style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
        ),
      ],
    );
  }
}

/// 参考依据对话框
void showReferenceGuideDialog(
  BuildContext context,
  Map<String, dynamic>? profile,
) {
  final hasProfile = profile != null;
  final age = profile?['age'] ?? '18-49';
  final sex = profile?['sex'] == 'male' ? '男性' : '女性';
  final profileText = hasProfile
      ? 'Garmin 资料：$sex，$age 岁。'
      : 'Garmin 资料暂不可用，暂停高低比较。';

  showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Row(
        children: [
          Icon(Icons.info_outline, color: adaptiveColor(context, leafGreen)),
          SizedBox(width: 8),
          Text('饮食参考依据'),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: adaptiveColor(context, surfaceBg),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: adaptiveColor(context, borderLine)),
              ),
              child: Text(
                '$profileText固定采用低身体活动档。参考范围由应用换算，不是 Garmin 营养分析。',
                style: TextStyle(
                  fontSize: 12,
                  color: adaptiveColor(context, darkGreen),
                ),
              ),
            ),
            SizedBox(height: 12),
            Text(
              '计算标准：',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
            SizedBox(height: 4),
            Text(
              '• 每日热量以标准能量值上下 10% 作为应用比较区间；分餐热量按指南的三餐比例（早餐 25-30%、午餐 30-40%、晚餐 30-35%）换算。\n'
              '• 三大营养素克数根据每日能量、推荐供能占比（蛋白质 10-15%、碳水 50-65%、脂肪 20-30%）和分餐比例换算。\n'
              '• 加餐不设单餐参考范围。',
              style: TextStyle(
                fontSize: 12,
                height: 1.6,
                color: adaptiveColor(context, Colors.black87),
              ),
            ),
            SizedBox(height: 10),
            Text(
              '图表与标尺说明：',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
            SizedBox(height: 4),
            Text(
              '• 饮食趋势中的柱形为每日摄入量，淡色带为参考范围，可点击切换 4 项指标查看。\n'
              '• 每日营养与餐食详情的短色带是参考范围，小圆点是摄入值，标尺从零到参考上限的 1.5 倍；超出标尺时圆点变为向右箭头。\n'
              '• 数值旁箭头（↓ / ↑）表示低于或高于范围，勾号（✓）表示在参考范围内。\n'
              '• 食物短条表示占本餐参考上限，不为单种食物判定不足。\n'
              '• 缺失值不补零，部分合计标 *，估算不一致标 ?。通用参考不代表医学诊断。',
              style: TextStyle(
                fontSize: 12,
                height: 1.6,
                color: adaptiveColor(context, mutedText),
              ),
            ),
          ],
        ),
      ),
      actions: [
        FilledButton(onPressed: () => Navigator.pop(ctx), child: Text('了解')),
      ],
    ),
  );
}
