import 'dart:math';
import 'package:flutter/material.dart';
import '../app_theme.dart';
import '../nutrition_reference.dart';

const leafGreen = Color(0xFF14786C);
const darkGreen = Color(0xFF326B54);
const surfaceBg = Color(0xFFF7FAF8);
const borderLine = Color(0xFFE2EBE5);
const mutedText = Color(0xFF607078);
const warningRed = Color(0xFFB44836);
const trackBg = Color(0xFFE9EFEA);

/// 微型 0~150% 参考标尺组件
class NutritionRangePlot extends StatelessWidget {
  const NutritionRangePlot({
    super.key,
    required this.value,
    required this.range,
    required this.status,
    required this.metricColor,
    this.height = 4,
  });

  final double? value;
  final NutrientRange? range;
  final String status;
  final Color metricColor;
  final double height;

  @override
  Widget build(BuildContext context) {
    if (range == null || range!.max <= 0 || value == null || !value!.isFinite) {
      return SizedBox(
        height: height + 6,
        child: Center(
          child: Container(
            height: height,
            decoration: BoxDecoration(
              color: adaptiveColor(context, trackBg),
              borderRadius: BorderRadius.circular(height / 2),
            ),
          ),
        ),
      );
    }

    final rMin = range!.min;
    final rMax = range!.max;
    final scale = rMax * 1.5;
    final val = value!;

    // 0~1 归一化比例
    final bandLeftRatio = (rMin / scale).clamp(0.0, 1.0);
    final bandWidthRatio = ((rMax - rMin) / scale).clamp(
      0.0,
      1.0 - bandLeftRatio,
    );
    final isOverflow = val > scale;
    final pointRatio = (val / scale).clamp(0.0, 1.0);
    final isHigh = status == 'high' || isOverflow;

    return SizedBox(
      height: height + 8,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final totalWidth = constraints.maxWidth;
          final bandLeft = bandLeftRatio * totalWidth;
          final bandWidth = bandWidthRatio * totalWidth;
          final pointLeft = pointRatio * totalWidth;

          return Stack(
            alignment: Alignment.centerLeft,
            children: [
              // 灰色总轨道
              Container(
                height: height,
                width: totalWidth,
                decoration: BoxDecoration(
                  color: adaptiveColor(context, trackBg),
                  borderRadius: BorderRadius.circular(height / 2),
                ),
              ),
              // 参考范围色带 (浅绿色带)
              Positioned(
                left: bandLeft,
                width: bandWidth,
                child: Container(
                  height: height,
                  decoration: BoxDecoration(
                    color: metricColor.withValues(alpha: 0.28),
                    borderRadius: BorderRadius.circular(height / 2),
                  ),
                ),
              ),
              // 实际摄入指示（圆点或超标向右三角箭头）
              Positioned(
                left: isOverflow
                    ? (totalWidth - 6)
                    : (pointLeft - 3).clamp(0.0, totalWidth - 6),
                child: isOverflow
                    ? Icon(
                        Icons.play_arrow,
                        size: 9,
                        color: adaptiveColor(context, warningRed),
                      )
                    : Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: isHigh ? warningRed : metricColor,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: adaptiveColor(context, Colors.white),
                            width: 0.8,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.15),
                              blurRadius: 1,
                            ),
                          ],
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// 单个营养指标看板列（用于日汇总或单餐汇总）
class NutrientMetricCard extends StatelessWidget {
  const NutrientMetricCard({
    super.key,
    required this.metric,
    required this.evaluation,
    this.compact = false,
  });

  final NutrientMetric metric;
  final MetricEvaluation evaluation;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final state = evaluation.state;
    final val = evaluation.value;
    final valText = val != null
        ? (metric.key == 'calories' ? val.round().toString() : val.toString())
        : null;

    final isHigh = state.isHigh;
    final isLow = state.isLow;
    final symbolColor = isHigh
        ? warningRed
        : isLow
        ? adaptiveColor(context, metric.color)
        : (state.isWithin ? leafGreen : adaptiveColor(context, mutedText));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // 标签行
        Row(
          children: [
            Text(
              metric.label,
              style: TextStyle(
                fontSize: compact ? 11 : 12,
                fontWeight: FontWeight.w600,
                color: adaptiveColor(context, metric.color),
              ),
            ),
            SizedBox(width: 3),
            Text(
              metric.unit,
              style: TextStyle(
                fontSize: 10,
                color: adaptiveColor(context, mutedText),
              ),
            ),
          ],
        ),
        SizedBox(height: 2),
        // 数值 + 状态符号
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.end,
          children: [
            Text(
              valText ?? '未记录',
              style: TextStyle(
                fontSize: compact ? 18 : 22,
                fontWeight: FontWeight.w700,
                color: valText != null
                    ? adaptiveColor(context, metric.color)
                    : adaptiveColor(context, mutedText),
                letterSpacing: -0.5,
              ),
            ),
            if (state.symbol.isNotEmpty) ...[
              SizedBox(width: 4),
              Text(
                state.symbol,
                style: TextStyle(
                  fontSize: compact ? 12 : 13,
                  fontWeight: FontWeight.bold,
                  color: symbolColor,
                ),
              ),
            ],
          ],
        ),
        SizedBox(height: 2),
        // 标尺
        NutritionRangePlot(
          value: val,
          range: evaluation.range,
          status: evaluation.status,
          metricColor: adaptiveColor(context, metric.color),
          height: compact ? 3 : 4,
        ),
        SizedBox(height: 2),
        // 参考区间文字
        Text(
          evaluation.range != null
              ? '${evaluation.range!.text} ${metric.unit}'
              : '暂无参考',
          style: TextStyle(
            fontSize: 10,
            color: adaptiveColor(context, mutedText),
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}

/// Keep the same metric cards and scales, with room for complete values.
class NutrientMetricsGrid extends StatelessWidget {
  const NutrientMetricsGrid({
    super.key,
    required this.metrics,
    this.compact = false,
  });
  final Map<String, MetricEvaluation> metrics;
  final bool compact;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns =
          constraints.maxWidth < 360 ||
              MediaQuery.textScalerOf(context).scale(12) > 15
          ? 2
          : 4;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: mealMetrics
            .map(
              (metric) => SizedBox(
                width: (constraints.maxWidth - 12 * (columns - 1)) / columns,
                child: NutrientMetricCard(
                  metric: metric,
                  evaluation: metrics[metric.key]!,
                  compact: compact,
                ),
              ),
            )
            .toList(),
      );
    },
  );
}

/// 食物明细表格里的单项占比短条
class FoodPortionBar extends StatelessWidget {
  const FoodPortionBar({
    super.key,
    required this.value,
    required this.upperBound,
    required this.metricColor,
  });

  final double? value;
  final double? upperBound;
  final Color metricColor;

  @override
  Widget build(BuildContext context) {
    if (value == null || upperBound == null || upperBound! <= 0) {
      return SizedBox(height: 3);
    }

    final ratio = (value! / upperBound!).clamp(0.0, 1.5);
    final percent = (ratio * 100).round();
    final isHigh = value! > upperBound!;

    return Tooltip(
      message: '占本餐上限 $percent%',
      child: SizedBox(
        height: 4,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final w = constraints.maxWidth;
            final barWidth = (min(1.0, ratio) * w).clamp(0.0, w);

            return Stack(
              clipBehavior: Clip.none,
              children: [
                // 灰色底槽
                Container(
                  width: w,
                  height: 2,
                  color: adaptiveColor(context, trackBg),
                ),
                // 进度填充
                Container(
                  width: barWidth,
                  height: 2,
                  color: isHigh
                      ? warningRed
                      : metricColor.withValues(alpha: 0.75),
                ),
                // 上限 100% 刻度标记
                Positioned(
                  right: 0,
                  top: -2,
                  bottom: -2,
                  child: Container(
                    width: 1,
                    color: adaptiveColor(context, borderLine),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// 近 7 天趋势对比可视化图表
class TrendChartWidget extends StatelessWidget {
  const TrendChartWidget({
    super.key,
    required this.days,
    required this.dayEntries,
    required this.profile,
    required this.activeMetricKey,
    required this.onSelectMetric,
  });

  final List<String> days;
  final Map<String, List<Map<String, dynamic>>> dayEntries;
  final Map<String, dynamic>? profile;
  final String? activeMetricKey;
  final ValueChanged<String?> onSelectMetric;

  @override
  Widget build(BuildContext context) {
    final activeMetric = activeMetricKey != null
        ? mealMetrics.firstWhere((m) => m.key == activeMetricKey)
        : null;

    // 计算每天的指标评估
    final dayAssessments = days.map((d) {
      final entries = dayEntries[d] ?? [];
      final assessment = NutritionReference.assessDay(entries, profile);
      return {'date': d, 'entries': entries, 'assessment': assessment};
    }).toList();

    // 选中指标的参考范围与最大值
    NutrientRange? activeRange;
    double yMax = 100.0;
    if (activeMetric != null) {
      final firstAssessment =
          dayAssessments.first['assessment'] as DayNutritionAssessment;
      activeRange = firstAssessment.metrics[activeMetric.key]?.range;

      final vals = dayAssessments.map((item) {
        final ass = item['assessment'] as DayNutritionAssessment;
        return ass.metrics[activeMetric.key]?.value ?? 0.0;
      }).toList();

      final refMax = activeRange?.max ?? 0.0;
      final maxVal = ([refMax, ...vals, 10.0]).reduce(max);
      yMax = (maxVal * 1.3).ceilToDouble();
      if (yMax <= 0) yMax = 100.0;
    }

    final todayStr = DateTime.now()
        .toUtc()
        .add(Duration(hours: 8))
        .toIso8601String()
        .substring(0, 10);

    return Container(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
      decoration: BoxDecoration(
        color: adaptiveColor(context, Colors.white),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: adaptiveColor(context, borderLine)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题行
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '近 7 天摄入趋势',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: adaptiveColor(context, Colors.black87),
                ),
              ),
              if (activeMetric != null && activeRange != null)
                Flexible(
                  child: Text(
                    '${activeMetric.label}参考 ${activeRange.text} ${activeMetric.unit}',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: adaptiveColor(context, activeMetric.color),
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
          SizedBox(height: 14),

          // 图表绘制区域
          SizedBox(
            height: 130,
            child: LayoutBuilder(
              builder: (context, constraints) {
                return Stack(
                  children: [
                    // 背景网格线与参考带（当选中指标时）
                    if (activeMetric != null && activeRange != null) ...[
                      // 参考带
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom:
                            24 + (activeRange.min / yMax * 96).clamp(0.0, 96.0),
                        height:
                            ((activeRange.max - activeRange.min) / yMax * 96)
                                .clamp(0.0, 96.0),
                        child: Container(
                          decoration: BoxDecoration(
                            color: adaptiveColor(
                              context,
                              activeMetric.color,
                            ).withValues(alpha: 0.10),
                            border: Border.symmetric(
                              horizontal: BorderSide(
                                color: adaptiveColor(
                                  context,
                                  activeMetric.color,
                                ).withValues(alpha: 0.4),
                                width: 0.8,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                    // 底部分割基线
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 24,
                      child: Container(
                        height: 1,
                        color: adaptiveColor(context, borderLine),
                      ),
                    ),

                    // 各天柱形与日期标签
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: dayAssessments.map((dayData) {
                        final d = dayData['date'] as String;
                        final entries =
                            dayData['entries'] as List<Map<String, dynamic>>;
                        final ass =
                            dayData['assessment'] as DayNutritionAssessment;
                        final isToday = d == todayStr;
                        final dayShort = isToday
                            ? '今天'
                            : '${int.parse(d.substring(5, 7))}/${int.parse(d.substring(8))}';

                        return Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              // 柱形与悬浮数值
                              Expanded(
                                child: Container(
                                  padding: EdgeInsets.only(bottom: 2),
                                  alignment: Alignment.bottomCenter,
                                  child: _buildColumnContent(
                                    context: context,
                                    entries: entries,
                                    assessment: ass,
                                    activeMetric: activeMetric,
                                    yMax: yMax,
                                    onTap: () {
                                      // 快速聚焦
                                      if (activeMetric == null) {
                                        onSelectMetric('calories');
                                      }
                                    },
                                  ),
                                ),
                              ),
                              SizedBox(height: 6),
                              // 日期文字
                              Text(
                                dayShort,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: isToday
                                      ? FontWeight.bold
                                      : FontWeight.normal,
                                  color: isToday
                                      ? leafGreen
                                      : adaptiveColor(context, mutedText),
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                );
              },
            ),
          ),

          SizedBox(height: 14),

          // 指标切换 Tab / 图例按钮
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: mealMetrics.map((m) {
              final isSelected = m.key == activeMetricKey;
              return InkWell(
                onTap: () {
                  onSelectMetric(isSelected ? null : m.key);
                },
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? adaptiveColor(
                            context,
                            m.color,
                          ).withValues(alpha: 0.12)
                        : adaptiveColor(context, surfaceBg),
                    border: Border.all(
                      color: isSelected
                          ? adaptiveColor(context, m.color)
                          : adaptiveColor(context, borderLine),
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: adaptiveColor(context, m.color),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      SizedBox(width: 5),
                      Text(
                        m.label,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isSelected
                              ? FontWeight.bold
                              : FontWeight.normal,
                          color: isSelected
                              ? adaptiveColor(context, m.color)
                              : adaptiveColor(context, mutedText),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildColumnContent({
    required BuildContext context,
    required List<Map<String, dynamic>> entries,
    required DayNutritionAssessment assessment,
    required NutrientMetric? activeMetric,
    required double yMax,
    required VoidCallback onTap,
  }) {
    if (entries.isEmpty) {
      return Padding(
        padding: EdgeInsets.only(bottom: 6),
        child: Text(
          '·',
          style: TextStyle(
            color: adaptiveColor(context, mutedText),
            fontSize: 13,
            fontWeight: FontWeight.bold,
          ),
        ),
      );
    }

    if (activeMetric != null) {
      // 聚焦单指标模式
      final eval = assessment.metrics[activeMetric.key];
      final val = eval?.value;
      if (val == null || val <= 0) {
        return Padding(
          padding: EdgeInsets.only(bottom: 6),
          child: Text(
            '·',
            style: TextStyle(
              color: adaptiveColor(context, mutedText),
              fontSize: 13,
            ),
          ),
        );
      }

      final ratio = (val / yMax).clamp(0.04, 0.95);
      final isPartial = !(eval?.complete ?? true);
      final displayVal = activeMetric.key == 'calories'
          ? val.round()
          : (val * 10).round() / 10;

      return GestureDetector(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            // 数值提示
            Text(
              '$displayVal',
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.bold,
                color: adaptiveColor(context, activeMetric.color),
              ),
              maxLines: 1,
            ),
            SizedBox(height: 2),
            Container(
              height: (72 * ratio).clamp(4.0, 72.0),
              width: 14,
              decoration: BoxDecoration(
                color: isPartial
                    ? adaptiveColor(
                        context,
                        activeMetric.color,
                      ).withValues(alpha: 0.45)
                    : adaptiveColor(context, activeMetric.color),
                borderRadius: BorderRadius.vertical(top: Radius.circular(3)),
              ),
            ),
          ],
        ),
      );
    }

    // 全览模式：展示组合小细柱
    return GestureDetector(
      onTap: onTap,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: mealMetrics.map((m) {
          final eval = assessment.metrics[m.key];
          final val = eval?.value;
          final refMax =
              eval?.range?.max ?? (m.key == 'calories' ? 2200.0 : 100.0);
          final barH = val != null
              ? (val / (refMax * 1.35)).clamp(0.04, 0.88)
              : 0.0;

          if (val == null || val <= 0) {
            return Container(
              width: 3,
              margin: EdgeInsets.symmetric(horizontal: 1),
            );
          }

          return Container(
            width: 3.5,
            margin: EdgeInsets.symmetric(horizontal: 0.8),
            height: 96 * barH,
            decoration: BoxDecoration(
              color: adaptiveColor(context, m.color).withValues(alpha: 0.85),
              borderRadius: BorderRadius.vertical(top: Radius.circular(2)),
            ),
          );
        }).toList(),
      ),
    );
  }
}
