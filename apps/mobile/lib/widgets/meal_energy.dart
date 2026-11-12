import 'package:flutter/material.dart';
import '../app_theme.dart';
import '../nutrition_reference.dart';
import 'nutrition_widgets.dart';

double? mealEnergyDeficit(num? intake, bool complete, num? expenditure) =>
    intake != null &&
        intake.isFinite &&
        complete &&
        expenditure != null &&
        expenditure.isFinite &&
        expenditure >= 0
    ? (expenditure - intake).toDouble()
    : null;

class MealEnergySummary extends StatelessWidget {
  const MealEnergySummary({
    super.key,
    required this.intake,
    required this.complete,
    required this.expenditure,
    this.includeIntake = true,
  });
  final num? intake, expenditure;
  final bool complete, includeIntake;
  @override
  Widget build(BuildContext context) {
    final deficit = mealEnergyDeficit(intake, complete, expenditure);
    final knownExpenditure =
        expenditure != null && expenditure!.isFinite && expenditure! >= 0
        ? expenditure
        : null;
    final values = [
      if (includeIntake) intake,
      knownExpenditure,
      deficit?.abs(),
    ];
    final labels = [
      if (includeIntake) '摄入',
      '总消耗',
      deficit != null && deficit < 0 ? '热量盈余' : '热量缺口',
    ];
    final colors = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = MediaQuery.textScalerOf(context).scale(12) > 16;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: List.generate(
            values.length,
            (i) => SizedBox(
              width: stacked
                  ? constraints.maxWidth
                  : (constraints.maxWidth - 12 * (values.length - 1)) /
                        values.length,
              child: Tooltip(
                message: i == values.length - 1
                    ? '总消耗 − 已记录摄入；漏记可能使缺口偏大，热量未填全不计算。今天截至当前。'
                    : i == 0 && includeIntake
                    ? '仅含已保存餐食，全天可能未记全。'
                    : 'Garmin 总消耗',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      labels[i],
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      values[i] == null
                          ? '—'
                          : '${values[i]!.round()}${includeIntake && i == 0 && !complete ? '*' : ''}',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        height: 1.2,
                        color: i == 0 && includeIntake
                            ? colors.primary
                            : colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'kcal',
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class MealEnergyDay {
  MealEnergyDay(this.date, List<Map<String, dynamic>> meals, num? consumed) {
    final calories = NutritionReference.assessDay(
      meals,
      null,
    ).metrics['calories']!;
    intake = calories.value;
    partial = intake != null && !calories.complete;
    expenditure = consumed != null && consumed.isFinite && consumed >= 0
        ? consumed.toDouble()
        : null;
  }
  final String date;
  late final double? intake, expenditure;
  late final bool partial;
  double? get deficit => mealEnergyDeficit(intake, !partial, expenditure);
}

class MealEnergyChart extends StatefulWidget {
  const MealEnergyChart({
    super.key,
    required this.days,
    required this.today,
    required this.loading,
    required this.failed,
    required this.onRetry,
  });
  final List<MealEnergyDay> days;
  final String today;
  final bool loading, failed;
  final VoidCallback onRetry;
  @override
  State<MealEnergyChart> createState() => _MealEnergyChartState();
}

class _MealEnergyChartState extends State<MealEnergyChart> {
  String? selectedDate;
  @override
  Widget build(BuildContext context) {
    if (widget.days.isEmpty) return const SizedBox.shrink();
    final selected =
        widget.days.where((d) => d.date == selectedDate).firstOrNull ??
        widget.days.last;
    final colors = [
      adaptiveColor(context, leafGreen),
      adaptiveColor(context, const Color(0xFF4978B8)),
      adaptiveColor(context, const Color(0xFFB06C32)),
    ];
    final values = [selected.intake, selected.expenditure, selected.deficit];
    final labels = ['摄入', '消耗', (selected.deficit ?? 0) < 0 ? '热量盈余' : '热量缺口'];
    return Card.outlined(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('近 7 天热量平衡', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              '${selected.date}${selected.date == widget.today ? ' · 今日暂估' : ''} · kcal',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) => Wrap(
                spacing: 8,
                runSpacing: 12,
                children: List.generate(
                  3,
                  (i) => SizedBox(
                    width: (constraints.maxWidth - 16) / 3,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(labels[i], style: TextStyle(color: colors[i])),
                        Text(
                          values[i] == null
                              ? '—'
                              : '${i == 2 ? values[i]!.abs().round() : values[i]!.round()}',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        if (i == 0 && selected.partial) const Text('部分记录'),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 120,
              width: double.infinity,
              child: CustomPaint(
                painter: _EnergyPainter(
                  widget.days,
                  colors,
                  Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: widget.days
                  .map(
                    (d) => Expanded(
                      child: Semantics(
                        selected: d.date == selected.date,
                        child: InkWell(
                          onTap: () => setState(() => selectedDate = d.date),
                          borderRadius: BorderRadius.circular(8),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              d.date.substring(5).replaceAll('-', '/'),
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: d.date == selected.date
                                    ? FontWeight.bold
                                    : FontWeight.normal,
                                color: d.date == selected.date
                                    ? colors[0]
                                    : null,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
            if (widget.loading)
              const Text('正在读取 Garmin 消耗…')
            else if (widget.failed)
              TextButton.icon(
                onPressed: widget.onRetry,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('消耗读取失败，点击重试'),
              ),
            const Text(
              '消耗来自 Garmin，摄入来自饮食记录。估算缺口 = 总消耗 − 摄入；负值为盈余。漏记会使缺口偏大，热量未填全时不计算，缺失日期不连线。',
              style: TextStyle(fontSize: 11, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}

class _EnergyPainter extends CustomPainter {
  _EnergyPainter(this.days, this.colors, this.grid);
  final List<MealEnergyDay> days;
  final List<Color> colors;
  final Color grid;
  @override
  void paint(Canvas canvas, Size size) {
    final series = [
      days.map((d) => d.intake).toList(),
      days.map((d) => d.expenditure).toList(),
      days.map((d) => d.deficit).toList(),
    ];
    final values = series.expand((s) => s).whereType<double>();
    var min = 0.0, max = 100.0;
    for (final value in values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    final span = max - min;
    double y(double value) => 6 + (max - value) / span * (size.height - 12);
    double x(int i) =>
        6 + i / (days.length > 1 ? days.length - 1 : 1) * (size.width - 12);
    for (final value in [min, 0.0, max]) {
      canvas.drawLine(
        Offset(0, y(value)),
        Offset(size.width, y(value)),
        Paint()..color = grid,
      );
    }
    for (var s = 0; s < series.length; s++) {
      Offset? previous;
      final paint = Paint()
        ..color = colors[s]
        ..strokeWidth = 2;
      for (var i = 0; i < days.length; i++) {
        final value = series[s][i];
        if (value == null) {
          previous = null;
          continue;
        }
        final point = Offset(x(i), y(value));
        if (previous != null) canvas.drawLine(previous, point, paint);
        canvas.drawCircle(point, 3, paint);
        previous = point;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _EnergyPainter oldDelegate) => true;
}
