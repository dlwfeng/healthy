import 'package:flutter/material.dart';
import '../../app_theme.dart';
import 'score_ring.dart';
import 'spark_line.dart';
import 'phase_bar.dart';

const leafGreen = Color(0xFF14786C);
const darkGreen = Color(0xFF326B54);
const surfaceBg = Color(0xFFF7FAF8);
const borderLine = Color(0xFFE2EBE5);
const mutedText = Color(0xFF607078);
const warningRed = Color(0xFFB44836);
const trackBg = Color(0xFFE9EFEA);
const coralColor = Color(0xFFE06D53);
const cyanColor = Color(0xFF2E94B2);
const orangeColor = Color(0xFFE88732);
const indigoColor = Color(0xFF3F51B5);

// ──────────────────────────────────────────────────────────────
// 辅助函数
// ──────────────────────────────────────────────────────────────

String formatDuration(int? minutes) {
  if (minutes == null || minutes <= 0) return '—';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h > 0 && m > 0) return '$h小时 $m分';
  if (h > 0) return '$h小时';
  return '$m分';
}

String formatNumber(num? v) {
  if (v == null) return '—';
  if (v is int) return v.toString();
  if (v == v.roundToDouble()) return v.toInt().toString();
  return v.toStringAsFixed(1);
}

String timeLabel(String? isoTime) {
  if (isoTime == null || isoTime.isEmpty) return '—';
  final dt = DateTime.tryParse(isoTime);
  if (dt == null) return '—';
  final local = dt.toUtc().add(Duration(hours: 8));
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

String sportName(String? sport) => switch (sport) {
  'running' || 'treadmill_running' => '跑步',
  'cycling' || 'indoor_cycling' => '骑行',
  'walking' || 'hiking' => '步行',
  'swimming' || 'lap_swimming' => '游泳',
  'strength_training' => '力量训练',
  'cardio' => '有氧',
  'yoga' => '瑜伽',
  _ => '运动',
};

String readinessStatus(String? level) => switch (level) {
  'PRIME' => '最佳',
  'HIGH' => '高',
  'MODERATE' => '中等',
  'LOW' => '偏低',
  'POOR' => '较差',
  'WELL_RECOVERED' => '恢复良好',
  _ => level ?? '暂无评分',
};

String sleepQuality(String? qualifier) => switch (qualifier) {
  'EXCELLENT' => '优秀',
  'GOOD' => '良好',
  'FAIR' => '一般',
  'POOR' => '较差',
  _ => qualifier ?? '睡眠评分',
};

String hrvStatusText(String? status) => switch (status) {
  'BALANCED' => '平衡',
  'UNBALANCED' => '不平衡',
  'LOW' => '偏低',
  'POOR' => '较差',
  _ => status ?? '暂无评估',
};

// ──────────────────────────────────────────────────────────────
// 1. 身体电量卡片 (BatteryCard)
// ──────────────────────────────────────────────────────────────

class BatteryCard extends StatelessWidget {
  const BatteryCard({super.key, required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final metrics = (data['metrics'] as Map?)?.cast<String, dynamic>() ?? {};
    final daily = (data['daily'] as Map?)?.cast<String, dynamic>() ?? {};
    final battery = metrics['bodyBattery'] as num?;
    final charged = daily['batteryCharged'] as num?;
    final drained = daily['batteryDrained'] as num?;

    final seriesList =
        (data['batterySeries'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Card(
      elevation: 0,
      color: adaptiveColor(context, Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: adaptiveColor(context, borderLine)),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: adaptiveColor(
                          context,
                          leafGreen,
                        ).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.bolt,
                        color: adaptiveColor(context, leafGreen),
                        size: 18,
                      ),
                    ),
                    SizedBox(width: 8),
                    Text(
                      '身体电量',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: adaptiveColor(context, Colors.black87),
                      ),
                    ),
                  ],
                ),
                Text(
                  battery != null ? '当日末次记录' : '暂无数据',
                  style: TextStyle(
                    fontSize: 12,
                    color: adaptiveColor(context, mutedText),
                  ),
                ),
              ],
            ),
            SizedBox(height: 12),

            // 主数值与充放电
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  battery != null ? '$battery' : '—',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: adaptiveColor(context, leafGreen),
                    letterSpacing: -1,
                  ),
                ),
                SizedBox(width: 4),
                Text(
                  '/ 100',
                  style: TextStyle(
                    fontSize: 13,
                    color: adaptiveColor(context, mutedText),
                  ),
                ),
                Spacer(),
                // 充电与消耗标签
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: adaptiveColor(context, surfaceBg),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: adaptiveColor(context, borderLine),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: adaptiveColor(context, leafGreen),
                        ),
                      ),
                      SizedBox(width: 4),
                      Text(
                        '充电 +${formatNumber(charged)}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: adaptiveColor(context, leafGreen),
                        ),
                      ),
                      SizedBox(width: 10),
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: orangeColor,
                        ),
                      ),
                      SizedBox(width: 4),
                      Text(
                        '消耗 −${formatNumber(drained)}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: orangeColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: 12),

            // 日内连续曲线图
            if (seriesList.isNotEmpty) ...[
              Text(
                '日内电量变化',
                style: TextStyle(
                  fontSize: 11,
                  color: adaptiveColor(context, mutedText),
                ),
              ),
              SizedBox(height: 6),
              SparkLine(
                points: seriesList,
                color: adaptiveColor(context, leafGreen),
                height: 80,
                min: 0,
                max: 100,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 2. 睡眠与恢复卡片 (SleepCard)
// ──────────────────────────────────────────────────────────────

class SleepCard extends StatelessWidget {
  const SleepCard({super.key, required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final metrics = (data['metrics'] as Map?)?.cast<String, dynamic>() ?? {};
    final analysis = (data['analysis'] as Map?)?.cast<String, dynamic>() ?? {};
    final sleep = (data['sleep'] as Map?)?.cast<String, dynamic>() ?? {};
    final stages = (sleep['stages'] as Map?)?.cast<String, dynamic>() ?? {};

    final sleepMinutes = metrics['sleepMinutes'] as int?;
    final sleepScore = analysis['sleepScore'] as num?;
    final sleepQualifier = analysis['sleepQualifier'] as String?;
    final startTime = sleep['start'] as String?;
    final endTime = sleep['end'] as String?;

    final stageMap = <String, int?>{
      'deep': stages['deep'] as int?,
      'light': stages['light'] as int?,
      'rem': stages['rem'] as int?,
      'awake': stages['awake'] as int?,
    };

    return Card(
      elevation: 0,
      color: adaptiveColor(context, Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: adaptiveColor(context, borderLine)),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行
            Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: adaptiveColor(
                      context,
                      indigoColor,
                    ).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.bedtime_outlined,
                    color: adaptiveColor(context, indigoColor),
                    size: 18,
                  ),
                ),
                SizedBox(width: 8),
                Text(
                  '昨夜睡眠',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: adaptiveColor(context, Colors.black87),
                  ),
                ),
              ],
            ),
            SizedBox(height: 12),

            // 时长与评分环并列
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        formatDuration(sleepMinutes),
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: adaptiveColor(context, Colors.black87),
                          letterSpacing: -0.5,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        startTime != null && endTime != null
                            ? '${timeLabel(startTime)} 入睡 · ${timeLabel(endTime)} 醒来'
                            : '暂无睡眠时刻记录',
                        style: TextStyle(
                          fontSize: 12,
                          color: adaptiveColor(context, mutedText),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 12),
                ScoreRing(
                  value: sleepScore,
                  maxValue: 100,
                  color: adaptiveColor(context, indigoColor),
                  size: 76,
                  label: sleepQuality(sleepQualifier),
                  strokeWidth: 6,
                ),
              ],
            ),
            SizedBox(height: 14),

            // 四阶段比例条
            PhaseBar(segments: stageMap, kind: 'sleep', height: 10),
            SizedBox(height: 8),

            // 图例行
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: [
                _buildLegendItem(
                  context,
                  '深睡',
                  stageMap['deep'],
                  Color(0xFF4A148C),
                ),
                _buildLegendItem(
                  context,
                  '浅睡',
                  stageMap['light'],
                  Color(0xFF42A5F5),
                ),
                _buildLegendItem(
                  context,
                  'REM',
                  stageMap['rem'],
                  Color(0xFF26A69A),
                ),
                _buildLegendItem(
                  context,
                  '清醒',
                  stageMap['awake'],
                  Color(0xFFFFAB91),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLegendItem(
    BuildContext context,
    String name,
    int? mins,
    Color color,
  ) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(shape: BoxShape.circle, color: color),
        ),
        SizedBox(width: 4),
        Text(
          '$name ${mins != null && mins > 0 ? formatDuration(mins) : '0分'}',
          style: TextStyle(
            fontSize: 11,
            color: adaptiveColor(context, mutedText),
          ),
        ),
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 3. 训练准备度卡片 (ReadinessCard)
// ──────────────────────────────────────────────────────────────

class ReadinessCard extends StatelessWidget {
  const ReadinessCard({super.key, required this.data, this.onAskAgent});

  final Map<String, dynamic> data;
  final VoidCallback? onAskAgent;

  @override
  Widget build(BuildContext context) {
    final metrics = (data['metrics'] as Map?)?.cast<String, dynamic>() ?? {};
    final analysis = (data['analysis'] as Map?)?.cast<String, dynamic>() ?? {};
    final readiness =
        (data['readiness'] as Map?)?.cast<String, dynamic>() ?? {};
    final factors =
        (readiness['factors'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    final score = metrics['trainingReadiness'] as num?;
    final level = analysis['readinessLevel'] as String?;
    final feedback = analysis['readinessFeedback'] as String?;

    return Card(
      elevation: 0,
      color: adaptiveColor(context, Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: adaptiveColor(context, borderLine)),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: adaptiveColor(
                          context,
                          leafGreen,
                        ).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.fitness_center_rounded,
                        color: adaptiveColor(context, leafGreen),
                        size: 18,
                      ),
                    ),
                    SizedBox(width: 8),
                    Text(
                      '训练准备度',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: adaptiveColor(context, Colors.black87),
                      ),
                    ),
                  ],
                ),
                if (onAskAgent != null)
                  IconButton(
                    onPressed: onAskAgent,
                    tooltip: '对话解读恢复情况',
                    icon: Icon(Icons.chat_bubble_outline, size: 18),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            SizedBox(height: 12),

            // 大环形看板与核心建议
            Row(
              children: [
                ScoreRing(
                  value: score,
                  maxValue: 100,
                  color: adaptiveColor(context, leafGreen),
                  size: 88,
                  label: readinessStatus(level),
                  strokeWidth: 7,
                ),
                SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        feedback ?? '暂无恢复反馈',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: adaptiveColor(context, Colors.black87),
                          height: 1.4,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      SizedBox(height: 8),
                      // 关键恢复影响因素
                      ...factors.take(2).map((f) {
                        final label = f['label'] as String? ?? '';
                        final fPercent = f['percent'] as num?;
                        final fFeedback = f['feedback'] as String?;
                        final displayVal = fFeedback != null
                            ? readinessStatus(fFeedback)
                            : (fPercent != null ? '${fPercent.toInt()}%' : '—');
                        return Padding(
                          padding: EdgeInsets.only(bottom: 2),
                          child: Row(
                            children: [
                              Text(
                                label,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: adaptiveColor(context, mutedText),
                                ),
                              ),
                              Spacer(),
                              Text(
                                displayVal,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: adaptiveColor(context, Colors.black87),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 4. 身体信号卡片 (SignalsCard)
// ──────────────────────────────────────────────────────────────

class SignalsCard extends StatelessWidget {
  const SignalsCard({super.key, required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final metrics = (data['metrics'] as Map?)?.cast<String, dynamic>() ?? {};
    final daily = (data['daily'] as Map?)?.cast<String, dynamic>() ?? {};
    final analysis = (data['analysis'] as Map?)?.cast<String, dynamic>() ?? {};
    final sleep = (data['sleep'] as Map?)?.cast<String, dynamic>() ?? {};
    final hrvData = (data['hrv'] as Map?)?.cast<String, dynamic>() ?? {};

    final restingHr = metrics['restingHeartRate'] as num?;
    final hrvVal = metrics['hrv'] as num?;
    final avgStress = daily['averageStress'] as num?;
    final minHr = daily['minHeartRate'] as num?;
    final maxHr = daily['maxHeartRate'] as num?;
    final hrvStatus = analysis['hrvStatus'] as String?;
    final stressMins =
        (daily['stressMinutes'] as Map?)?.cast<String, dynamic>() ?? {};
    final restMins = stressMins['rest'] as int?;

    final hrPoints =
        (sleep['heartRate'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final hrvPoints =
        (hrvData['readings'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    final stressMap = <String, int?>{
      'rest': stressMins['rest'] as int?,
      'low': stressMins['low'] as int?,
      'medium': stressMins['medium'] as int?,
      'high': stressMins['high'] as int?,
    };

    return Card(
      elevation: 0,
      color: adaptiveColor(context, Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: adaptiveColor(context, borderLine)),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '身体信号',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: adaptiveColor(context, Colors.black87),
              ),
            ),
            SizedBox(height: 12),

            // 3 列并排信号指标
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. 静息心率 (Coral)
                Expanded(
                  child: _buildSignalColumn(
                    context: context,
                    title: '静息心率',
                    value: restingHr != null ? '${restingHr.toInt()}' : '—',
                    unit: 'bpm',
                    color: coralColor,
                    chart: SparkLine(
                      points: hrPoints,
                      color: coralColor,
                      height: 38,
                    ),
                    note: minHr != null && maxHr != null
                        ? '全天 ${minHr.toInt()}–${maxHr.toInt()}'
                        : '暂无全天极值',
                  ),
                ),
                SizedBox(width: 8),

                // 2. 夜间 HRV (Cyan)
                Expanded(
                  child: _buildSignalColumn(
                    context: context,
                    title: '夜间 HRV',
                    value: hrvVal != null ? '${hrvVal.toInt()}' : '—',
                    unit: 'ms',
                    color: cyanColor,
                    chart: SparkLine(
                      points: hrvPoints,
                      color: cyanColor,
                      height: 38,
                    ),
                    note: '佳明状态 · ${hrvStatusText(hrvStatus)}',
                  ),
                ),
                SizedBox(width: 8),

                // 3. 平均压力 (Orange)
                Expanded(
                  child: _buildSignalColumn(
                    context: context,
                    title: '平均压力',
                    value: avgStress != null ? '${avgStress.toInt()}' : '—',
                    unit: '/100',
                    color: orangeColor,
                    chart: SizedBox(
                      height: 38,
                      child: Center(
                        child: PhaseBar(
                          segments: stressMap,
                          kind: 'stress',
                          height: 8,
                        ),
                      ),
                    ),
                    note: '休息 ${formatDuration(restMins)}',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSignalColumn({
    required BuildContext context,
    required String title,
    required String value,
    required String unit,
    required Color color,
    required Widget chart,
    required String note,
  }) {
    return Container(
      padding: EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: adaptiveColor(context, surfaceBg),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: adaptiveColor(context, borderLine)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              SizedBox(width: 2),
              Text(
                unit,
                style: TextStyle(
                  fontSize: 10,
                  color: adaptiveColor(context, mutedText),
                ),
              ),
            ],
          ),
          SizedBox(height: 6),
          chart,
          SizedBox(height: 6),
          Text(
            note,
            style: TextStyle(
              fontSize: 10,
              color: adaptiveColor(context, mutedText),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 5. 步数与运动消耗卡片 (MovementCard)
// ──────────────────────────────────────────────────────────────

class MovementCard extends StatelessWidget {
  const MovementCard({super.key, required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final metrics = (data['metrics'] as Map?)?.cast<String, dynamic>() ?? {};
    final daily = (data['daily'] as Map?)?.cast<String, dynamic>() ?? {};

    final steps = metrics['steps'] as num?;
    final stepGoal = daily['stepGoal'] as num?;
    final activeCals = daily['activeCalories'] as num?;
    final distance = daily['distanceKm'] as num?;

    return Card(
      elevation: 0,
      color: adaptiveColor(context, Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: adaptiveColor(context, borderLine)),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: orangeColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.directions_walk_rounded,
                        color: orangeColor,
                        size: 18,
                      ),
                    ),
                    SizedBox(width: 8),
                    Text(
                      '步数与活动',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: adaptiveColor(context, Colors.black87),
                      ),
                    ),
                  ],
                ),
                if (stepGoal != null && stepGoal > 0 && steps != null)
                  Text(
                    '${((steps / stepGoal) * 100).round()}%',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: orangeColor,
                    ),
                  ),
              ],
            ),
            SizedBox(height: 14),

            Row(
              children: [
                ScoreRing(
                  value: steps,
                  maxValue: (stepGoal != null && stepGoal > 0)
                      ? stepGoal
                      : 10000,
                  color: orangeColor,
                  size: 84,
                  label: '步',
                  strokeWidth: 7,
                ),
                SizedBox(width: 20),
                Expanded(
                  child: Column(
                    children: [
                      _buildMetricRow(
                        context,
                        '每日目标',
                        '${formatNumber(stepGoal)} 步',
                      ),
                      Divider(
                        height: 12,
                        color: adaptiveColor(context, borderLine),
                      ),
                      _buildMetricRow(
                        context,
                        '活动消耗',
                        '${formatNumber(activeCals)} kcal',
                      ),
                      Divider(
                        height: 12,
                        color: adaptiveColor(context, borderLine),
                      ),
                      _buildMetricRow(
                        context,
                        '全天距离',
                        '${formatNumber(distance)} km',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricRow(BuildContext context, String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: adaptiveColor(context, mutedText),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: adaptiveColor(context, Colors.black87),
          ),
        ),
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 6. 最近运动动态卡片 (RecentActivitiesCard)
// ──────────────────────────────────────────────────────────────

class RecentActivitiesCard extends StatelessWidget {
  const RecentActivitiesCard({
    super.key,
    required this.activities,
    this.onViewAll,
  });

  final List<Map<String, dynamic>> activities;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    final displayItems = activities.take(3).toList();

    return Card(
      elevation: 0,
      color: adaptiveColor(context, Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: adaptiveColor(context, borderLine)),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '最近运动',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: adaptiveColor(context, Colors.black87),
                  ),
                ),
                if (onViewAll != null)
                  TextButton(
                    onPressed: onViewAll,
                    style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '全部运动',
                          style: TextStyle(
                            fontSize: 12,
                            color: adaptiveColor(context, leafGreen),
                          ),
                        ),
                        Icon(
                          Icons.chevron_right,
                          size: 16,
                          color: adaptiveColor(context, leafGreen),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            SizedBox(height: 8),

            if (displayItems.isEmpty)
              Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: Text(
                    '这段时间没有运动记录',
                    style: TextStyle(
                      fontSize: 13,
                      color: adaptiveColor(context, mutedText),
                    ),
                  ),
                ),
              )
            else
              ...displayItems.map((a) {
                final name = a['name'] as String? ?? '未命名运动';
                final date = a['date'] as String? ?? '';
                final time = a['time'] as String? ?? '';
                final sport = a['sport'] as String?;
                final duration = a['durationMinutes'] as int?;
                final dist = a['distanceKm'] as num?;
                final cals = a['calories'] as num?;

                final isRunning = sport?.contains('run') ?? false;
                final isCycling = sport?.contains('cycl') ?? false;
                final iconColor = isRunning
                    ? orangeColor
                    : isCycling
                    ? cyanColor
                    : leafGreen;

                return Container(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: adaptiveColor(context, borderLine),
                        width: 0.6,
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: iconColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          isRunning
                              ? Icons.directions_run_rounded
                              : isCycling
                              ? Icons.directions_bike_rounded
                              : Icons.fitness_center_rounded,
                          color: iconColor,
                          size: 20,
                        ),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: adaptiveColor(context, Colors.black87),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            SizedBox(height: 2),
                            Text(
                              '$date $time · ${sportName(sport)}',
                              style: TextStyle(
                                fontSize: 11,
                                color: adaptiveColor(context, mutedText),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            formatDuration(duration),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: adaptiveColor(context, Colors.black87),
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            dist != null && dist > 0
                                ? '$dist km'
                                : (cals != null ? '$cals kcal' : ''),
                            style: TextStyle(
                              fontSize: 11,
                              color: adaptiveColor(context, mutedText),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
