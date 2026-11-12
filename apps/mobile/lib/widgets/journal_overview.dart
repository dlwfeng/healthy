import 'package:flutter/material.dart';
import '../nutrition_reference.dart';
import 'nutrition_widgets.dart';
import 'meal_energy.dart';

/// A daily reading of saved intake; missing values remain distinct from zero.
class JournalOverview extends StatelessWidget {
  const JournalOverview({
    super.key,
    required this.date,
    required this.today,
    required this.meals,
    required this.profile,
    this.expenditure,
  });
  final String date, today;
  final num? expenditure;
  final List<Map<String, dynamic>> meals;
  final Map<String, dynamic>? profile;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final metrics = NutritionReference.assessDay(meals, profile).metrics;
    final energy = metrics['calories']!;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF183C34) : const Color(0xFFE3F0E9),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.restaurant_rounded, size: 19, color: colors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  date == today
                      ? '今日摄入'
                      : '${date.substring(5).replaceAll('-', '/')} 摄入',
                  style: TextStyle(
                    color: colors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                '${meals.length} 餐已记录',
                style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 16),
          MealEnergySummary(
            intake: energy.value,
            complete: energy.complete,
            expenditure: expenditure,
          ),
          const SizedBox(height: 8),
          Text(
            energy.range == null
                ? '摄入来自已保存的饮食记录'
                : '每日参考 ${energy.range!.text} kcal',
            style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
          ),
          const SizedBox(height: 22),
          LayoutBuilder(
            builder: (context, constraints) => Wrap(
              spacing: 12,
              runSpacing: 14,
              children: mealMetrics.skip(1).map((metric) {
                final evaluation = metrics[metric.key]!;
                final narrow = MediaQuery.textScalerOf(context).scale(13) > 18;
                return SizedBox(
                  width: narrow
                      ? constraints.maxWidth
                      : (constraints.maxWidth - 24) / 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        metric.label,
                        style: TextStyle(
                          fontSize: 12,
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${evaluation.value == null ? '—' : evaluation.value!.toStringAsFixed(1)}${evaluation.complete ? '' : '*'} g',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 6),
                      NutritionRangePlot(
                        value: evaluation.value,
                        range: evaluation.range,
                        status: evaluation.status,
                        metricColor: colors.primary,
                        height: 3,
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
