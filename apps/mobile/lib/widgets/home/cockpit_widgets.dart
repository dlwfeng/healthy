import 'package:flutter/material.dart';
import '../../app_theme.dart';
import 'home_cards.dart';
import 'spark_line.dart';
import 'phase_bar.dart';

class CockpitPanel extends StatelessWidget {
  const CockpitPanel({
    super.key,
    required this.title,
    this.note,
    required this.child,
  });
  final String title;
  final String? note;
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(
        color: Theme.of(
          context,
        ).colorScheme.outlineVariant.withValues(alpha: .5),
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (note != null)
              Flexible(
                child: Text(
                  note!,
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    fontSize: 11,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        child,
      ],
    ),
  );
}

class CockpitValue extends StatelessWidget {
  const CockpitValue({
    super.key,
    required this.label,
    required this.value,
    this.unit = '',
    this.note,
    this.description,
    this.color,
    this.inverse = false,
  });
  final String label, value, unit;
  final String? note, description;
  final Color? color;
  final bool inverse;
  @override
  Widget build(BuildContext context) {
    final muted = inverse
        ? const Color(0xFFD0E7E0)
        : Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Tooltip(
          message: description ?? label,
          child: Text(label, style: TextStyle(fontSize: 12, color: muted)),
        ),
        const SizedBox(height: 5),
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: value,
                style: TextStyle(
                  fontSize: 28,
                  height: 1.2,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -.7,
                  color: inverse ? Colors.white : color,
                ),
              ),
              TextSpan(
                text: ' $unit',
                style: TextStyle(fontSize: 11, color: muted),
              ),
            ],
          ),
        ),
        if (note != null) ...[
          const SizedBox(height: 4),
          Tooltip(
            message: note == '*' ? '部分合计' : note!,
            child: Text(
              note!,
              semanticsLabel: note == '*' ? '部分合计' : null,
              style: TextStyle(fontSize: 11, color: muted, height: 1.4),
            ),
          ),
        ],
      ],
    );
  }
}

class CockpitVitals extends StatelessWidget {
  const CockpitVitals({super.key, required this.data});
  final Map<String, dynamic> data;
  @override
  Widget build(BuildContext context) {
    final m = (data['metrics'] as Map?) ?? {};
    final d = (data['daily'] as Map?) ?? {};
    final a = (data['analysis'] as Map?) ?? {};
    final sleep = m['sleepMinutes'] as num?;
    final goal = d['stepGoal'] as num?, steps = m['steps'] as num?;
    final values = [
      CockpitValue(
        label: '身体电量',
        value: formatNumber(m['bodyBattery']),
        unit: '/ 100',
        inverse: true,
      ),
      CockpitValue(
        label: '昨夜睡眠',
        value: sleep == null ? '—' : '${sleep ~/ 60}时 ${sleep.toInt() % 60}',
        unit: '分',
        note: a['sleepScore'] == null
            ? null
            : '评分 ${formatNumber(a['sleepScore'])} · ${sleepQuality(a['sleepQualifier'])}',
        inverse: true,
      ),
      CockpitValue(
        label: '训练准备度',
        value: formatNumber(m['trainingReadiness']),
        unit: '/ 100',
        note: a['readinessLevel'] == null
            ? null
            : readinessStatus(a['readinessLevel']),
        inverse: true,
      ),
      CockpitValue(
        label: '当日步数',
        value: formatNumber(steps),
        unit: '步',
        note: goal != null && goal > 0 && steps != null
            ? '目标 ${formatNumber(goal)} · ${(steps / goal * 100).round()}%'
            : null,
        inverse: true,
      ),
    ];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFF163F3A),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          for (var r = 0; r < 2; r++)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var c = 0; c < 2; c++)
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                        decoration: BoxDecoration(
                          border: Border(
                            top: BorderSide(
                              color: r == 1
                                  ? Colors.white.withValues(alpha: .15)
                                  : Colors.transparent,
                            ),
                            left: BorderSide(
                              color: c == 1
                                  ? Colors.white.withValues(alpha: .15)
                                  : Colors.transparent,
                            ),
                          ),
                        ),
                        child: values[r * 2 + c],
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class CockpitSignals extends StatelessWidget {
  const CockpitSignals({super.key, required this.data});
  final Map<String, dynamic> data;
  @override
  Widget build(BuildContext context) {
    final m = (data['metrics'] as Map?) ?? {},
        d = (data['daily'] as Map?) ?? {};
    final sleep = (data['sleep'] as Map?) ?? {};
    final stages = (sleep['stages'] as Map?)?.cast<String, dynamic>() ?? {};
    return CockpitPanel(
      title: '身体信号',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: CockpitValue(
                  label: '静息心率',
                  value: formatNumber(m['restingHeartRate']),
                  unit: 'bpm',
                  color: adaptiveColor(context, coralColor),
                ),
              ),
              Expanded(
                child: CockpitValue(
                  label: '夜间 HRV',
                  value: formatNumber(m['hrv']),
                  unit: 'ms',
                  color: adaptiveColor(context, cyanColor),
                ),
              ),
              Expanded(
                child: CockpitValue(
                  label: '平均压力',
                  value: formatNumber(d['averageStress']),
                  unit: '/ 100',
                  color: adaptiveColor(context, orangeColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            '身体电量    +${formatNumber(d['batteryCharged'])} / −${formatNumber(d['batteryDrained'])}',
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 8),
          SparkLine(
            points:
                (data['batterySeries'] as List?)
                    ?.cast<Map<String, dynamic>>() ??
                [],
            min: 0,
            max: 100,
            height: 72,
            color: adaptiveColor(context, leafGreen),
          ),
          const SizedBox(height: 14),
          Text(
            '睡眠阶段',
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 8),
          PhaseBar(
            segments: stages.map((k, v) => MapEntry(k, (v as num?)?.toInt())),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              for (final e in {
                'deep': '深睡',
                'light': '浅睡',
                'rem': 'REM',
                'awake': '清醒',
              }.entries)
                Text(
                  '${e.value} ${formatNumber(stages[e.key])} 分',
                  style: TextStyle(
                    fontSize: 11,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class CockpitMovement extends StatelessWidget {
  const CockpitMovement({super.key, required this.data});
  final Map<String, dynamic> data;
  @override
  Widget build(BuildContext context) {
    final d = (data['daily'] as Map?) ?? {};
    final activities =
        (data['recentActivities'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    return CockpitPanel(
      title: '运动与活动',
      note: '近 7 天',
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: CockpitValue(
                  label: '活动消耗',
                  value: formatNumber(d['activeCalories']),
                  unit: 'kcal',
                ),
              ),
              Expanded(
                child: CockpitValue(
                  label: '全天距离',
                  value: formatNumber(d['distanceKm']),
                  unit: 'km',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (activities.isEmpty)
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('暂无运动', style: TextStyle(fontSize: 12)),
            ),
          for (final a in activities.take(3))
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: Theme.of(
                      context,
                    ).colorScheme.outlineVariant.withValues(alpha: .5),
                  ),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          a['name'] ?? sportName(a['sport']),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          '${a['date'] ?? ''} · ${a['time'] ?? ''}',
                          style: TextStyle(
                            fontSize: 11,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatDuration(
                            (a['durationMinutes'] as num?)?.round(),
                          ),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          '${formatNumber(a['distanceKm'])} km · ${formatNumber(a['calories'])} kcal',
                          style: TextStyle(
                            fontSize: 11,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
