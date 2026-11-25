import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../garmin_api.dart';
import '../../meal_api.dart' show dateText;
import '../../nutrition_reference.dart';
import '../../pages/reports_page.dart';
import 'connect_cards.dart';
import 'home_glyph.dart';

class ConnectSections extends StatelessWidget {
  const ConnectSections({
    super.key,
    required this.api,
    required this.date,
    required this.modules,
    required this.loading,
    required this.errors,
    required this.onRetry,
    this.onNavigate,
  });
  final GarminApi api;
  final String date;
  final Map<String, Map<String, dynamic>> modules;
  final Set<String> loading, errors;
  final VoidCallback onRetry;
  final ValueChanged<String>? onNavigate;

  Widget section(
    BuildContext context,
    String title,
    String source,
    Widget content, {
    String? page,
  }) => Padding(
    key: ValueKey('home-section-$title'),
    padding: const EdgeInsets.only(top: 26),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -.3,
                    ),
                  ),
                  Text(
                    source,
                    style: TextStyle(
                      fontSize: 10,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (page != null && onNavigate != null)
              IconButton(
                onPressed: () => onNavigate!(page),
                tooltip: '查看$title详情',
                icon: const Icon(Icons.chevron_right, size: 20),
              ),
          ],
        ),
        const SizedBox(height: 12),
        content,
      ],
    ),
  );
  Widget message(
    BuildContext context,
    String key,
    String empty, {
    Widget? child,
  }) {
    if (errors.contains(key)) {
      return Container(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Text(
                '$empty读取失败，其他数据仍可查看。',
                style: const TextStyle(fontSize: 12),
              ),
            ),
            TextButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      );
    }
    if (loading.contains(key)) {
      return const Padding(
        padding: EdgeInsets.all(25),
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    return child ?? homeNote(context, '暂无$empty');
  }

  Widget card(
    BuildContext context,
    String title,
    String glyph,
    Widget content, {
    String? footer,
    Color? color,
    VoidCallback? onTap,
    Key? key,
    double minimumHeight = 225,
  }) => HomeCard(
    key: key,
    title: title,
    glyph: glyph,
    footer: footer,
    color: color,
    onTap: onTap,
    minimumHeight: minimumHeight,
    child: content,
  );
  Widget column(List<Widget> children) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: children,
  );
  Widget pairs(BuildContext context, List<(String, dynamic, String)> values) =>
      Wrap(
        spacing: 22,
        runSpacing: 12,
        children: [
          for (final value in values)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                homeValue(context, value.$2, unit: value.$3, size: 24),
                homeNote(context, value.$1),
              ],
            ),
        ],
      );
  HomeTrend trend(
    BuildContext context,
    dynamic rows,
    String label, {
    String unit = '',
    Color? color,
    double? minimum,
    double? maximum,
  }) => HomeTrend(
    points: homeRows(rows),
    label: label,
    color: color ?? homePalette(context)[0],
    unit: unit,
    minimum: minimum,
    maximum: maximum,
  );
  Widget empty(
    BuildContext context,
    String title,
    String glyph,
    String text,
    String detail,
  ) => card(
    context,
    title,
    glyph,
    Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        children: [
          HomeGlyph(
            glyph,
            size: 37,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 18),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13),
          ),
          homeNote(context, detail),
        ],
      ),
    ),
  );

  Widget summary(BuildContext context) {
    final o = modules['overview'] ?? {},
        m = homeMap(o['metrics']),
        d = homeMap(o['daily']),
        stages = homeMap(homeMap(o['sleep'])['stages']),
        palette = homePalette(context);
    final goal = homeNumber(d['stepGoal']), steps = homeNumber(m['steps']);
    return section(
      context,
      '摘要',
      '一天的关键数据',
      message(
        context,
        'overview',
        '摘要',
        child: HomeGrid(
          children: [
            card(
              context,
              '当日步数',
              'steps',
              HomeDial(
                value: steps,
                maximum: goal ?? 0,
                color: palette[0],
                unit: '步',
              ),
              footer:
                  '目标 ${homeFormat(goal)} 步${goal != null && goal > 0 && steps != null ? ' · ${(steps / goal * 100).round()}%' : ''}',
            ),
            card(
              context,
              '昨夜睡眠',
              'moon',
              column([
                Text(
                  homeDuration(m['sleepMinutes']),
                  style: const TextStyle(
                    fontSize: 27,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                homeNote(
                  context,
                  '睡眠评分 ${homeFormat(homeMap(o['analysis'])['sleepScore'])}',
                ),
                HomeStack(
                  items: [
                    for (final entry in [
                      ('深睡', 'deep'),
                      ('浅睡', 'light'),
                      ('REM', 'rem'),
                      ('清醒', 'awake'),
                    ].indexed)
                      (
                        label: entry.$2.$1,
                        value: homeNumber(stages[entry.$2.$2]),
                        color: palette[entry.$1],
                      ),
                  ],
                  unit: '分',
                ),
              ]),
            ),
            card(
              context,
              '身体电量',
              'battery',
              column([
                homeValue(context, m['bodyBattery'], unit: '/ 100'),
                trend(
                  context,
                  o['batterySeries'],
                  '身体电量',
                  color: palette[2],
                  minimum: 0,
                  maximum: 100,
                ),
              ]),
              footer:
                  '充电 +${homeFormat(d['batteryCharged'])} · 消耗 −${homeFormat(d['batteryDrained'])}',
            ),
            card(
              context,
              '热量消耗',
              'flame',
              column([
                homeValue(context, d['calories'], unit: 'kcal'),
                HomeStack(
                  items: [
                    (
                      label: '活动',
                      value: homeNumber(d['activeCalories']),
                      color: palette[0],
                    ),
                    (
                      label: '静息',
                      value: homeNumber(d['restingCalories']),
                      color: palette[1],
                    ),
                  ],
                  unit: 'kcal',
                ),
              ]),
              footer: '今天截至当前',
            ),
          ],
        ),
      ),
    );
  }

  Widget exercise(BuildContext context) {
    final b = modules['body'] ?? {},
        o = modules['overview'] ?? {},
        m = homeMap(o['metrics']),
        d = homeMap(o['daily']),
        palette = homePalette(context);
    final training = homeMap(b['training']),
        load = homeMap(training['load']),
        focus = homeMap(training['focus']),
        hrv = homeMap(b['hrv']),
        intensity = homeMap(b['intensity']),
        age = homeMap(b['fitnessAge']),
        floors = homeMap(b['floors']),
        heart = homeMap(b['heartRate']),
        resp = homeMap(b['respiration']),
        ftp = homeMap(b['cyclingFtp']),
        lt = homeMap(b['lactateThreshold']),
        vo2 = homeMap(b['vo2Max']),
        hydration = homeMap(b['hydration']),
        last = homeMap(b['lastActivity']);
    final categories = homeRows(focus['categories']);
    final maximum = math.max(
      1.0,
      categories
              .expand(
                (row) => [
                  homeNumber(row['value']) ?? 0,
                  homeNumber(row['max']) ?? 0,
                ],
              )
              .fold(0.0, math.max) *
          1.15,
    );
    final readiness = homeMap(o['analysis'])['readinessLevel'];
    final readyLabel =
        const {
          'POOR': '较差',
          'LOW': '低',
          'MODERATE': '中等',
          'HIGH': '高',
          'PRIME': '极佳',
          'WELL_RECOVERED': '恢复良好',
        }[readiness] ??
        '暂无状态';
    final status =
        const {
          1: '恢复',
          2: '效率下降',
          3: '恢复',
          4: '维持效果',
          5: '有效训练',
          6: '训练过度',
          7: '负荷不足',
          8: '巅峰状态',
        }[training['status']] ??
        '暂无状态';
    final stress = homeMap(d['stressMinutes']);
    final pace = homeNumber(lt['paceSeconds']);
    final sport = '${last['sport'] ?? ''}',
        sportIcon = sport == 'badminton'
            ? 'badminton'
            : sport.contains('cycling')
            ? 'bike'
            : sport.contains('walk')
            ? 'walk'
            : 'run';
    final cards = <Widget>[
      card(
        context,
        '训练准备程度',
        'readiness',
        HomeDial(
          value: homeNumber(m['trainingReadiness']),
          maximum: 100,
          color: Theme.of(context).colorScheme.onSurface,
          segmented: true,
          label: readyLabel,
        ),
        footer:
            '恢复时间 ${homeFormat((homeNumber(homeMap(o['readiness'])['recoveryMinutes']) ?? double.nan) / 60)} 小时',
      ),
      card(
        context,
        '训练负荷',
        'load',
        column([
          if (load['level'] == 'OPTIMAL') homeNote(context, '✓ 最佳范围'),
          pairs(context, [
            ('短期负荷', load['acute'], ''),
            ('长期负荷', load['chronic'], ''),
          ]),
          HomeRange(
            value: homeNumber(load['acute']),
            low: homeNumber(load['min']),
            high: homeNumber(load['max']),
          ),
        ]),
        footer: '负荷比 ${homeFormat(load['ratio'])}',
      ),
      card(
        context,
        '训练负荷重点',
        'focus',
        column([
          Text(
            const {
                  'AEROBIC_LOW_SHORTAGE': '缺乏低强度有氧',
                  'AEROBIC_HIGH_SHORTAGE': '缺乏高强度有氧',
                  'ANAEROBIC_SHORTAGE': '缺乏无氧训练',
                  'BALANCED': '负荷均衡',
                }[focus['feedback']] ??
                '查看负荷分布',
            style: const TextStyle(fontSize: 15, height: 1.5),
          ),
          for (final entry in categories.indexed) ...[
            const SizedBox(height: 12),
            Text(
              '${entry.$2['label']}  ${homeFormat(entry.$2['value'])}',
              style: const TextStyle(fontSize: 11),
            ),
            HomeRange(
              value: homeNumber(entry.$2['value']),
              low: homeNumber(entry.$2['min']),
              high: homeNumber(entry.$2['max']),
              scale: maximum,
              color: palette[entry.$1 % palette.length],
            ),
          ],
        ]),
        footer: '目标区间由 Garmin 提供',
      ),
      card(
        context,
        'HRV 状态',
        'hrv',
        column([
          homeValue(context, hrv['weeklyAverage'], unit: 'ms'),
          homeNote(
            context,
            '7 天平均${hrv['status'] == 'BALANCED' ? ' · 平衡' : ''}',
          ),
          homeNote(
            context,
            '个人基线 ${homeFormat(hrv['baselineLow'])}–${homeFormat(hrv['baselineHigh'])} ms',
          ),
          trend(
            context,
            modules['hrv']?['points'],
            'HRV 7 天平均',
            unit: 'ms',
            color: palette[2],
          ),
        ]),
        footer: '昨夜 ${homeFormat(hrv['lastNight'])} ms · 近 4 周',
      ),
      card(
        context,
        '强度活动时间',
        'intensity',
        HomeDial(
          value: homeNumber(intensity['total']),
          maximum: homeNumber(intensity['goal']) ?? 0,
          color: palette[1],
          unit: '分钟',
        ),
        footer:
            '每周目标 ${homeFormat(intensity['goal'])} 分钟\n中强度 ${homeFormat(intensity['moderate'])} · 高强度 ${homeFormat(intensity['vigorous'])} × 2',
      ),
      card(
        context,
        '训练状态',
        'training',
        column([
          Align(
            alignment: Alignment.centerLeft,
            child: CircleAvatar(
              backgroundColor: palette[3].withValues(alpha: .15),
              child: HomeGlyph('run', color: palette[3]),
            ),
          ),
          const SizedBox(height: 15),
          Text(
            status,
            style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w500),
          ),
          homeNote(context, 'Garmin 训练状态'),
        ]),
        footer: '更新于 ${training['date'] ?? '—'}',
      ),
      card(
        context,
        '身体年龄',
        'person',
        column([
          homeValue(context, age['value'], unit: '岁'),
          const SizedBox(height: 20),
          pairs(context, [
            ('实际年龄', age['chronological'], '岁'),
            ('可达目标', age['achievable'], '岁'),
          ]),
        ]),
        footer: 'Garmin 估算',
      ),
      card(
        context,
        '楼层',
        'stairs',
        column([
          homeValue(context, floors['ascended'], unit: '层'),
          homeNote(context, '每日目标 ${homeFormat(floors['goal'])} 层'),
          trend(
            context,
            modules['floors']?['points'],
            '楼层',
            unit: '层',
            minimum: 0,
          ),
        ]),
      ),
      card(
        context,
        '压力',
        'stress',
        column([
          homeValue(context, d['averageStress'], unit: '/ 100'),
          homeNote(context, '全天平均'),
          HomeStack(
            items: [
              for (final entry in [
                ('休息', 'rest', palette[0]),
                ('低', 'low', const Color(0xffe8ba43)),
                ('中', 'medium', const Color(0xffed9134)),
                ('高', 'high', const Color(0xffd94c4c)),
              ])
                (
                  label: entry.$1,
                  value: homeNumber(stress[entry.$2]),
                  color: entry.$3,
                ),
            ],
            unit: '分',
          ),
        ]),
        footer: '最高压力 ${homeFormat(homeMap(b['stress'])['max'])}',
      ),
      card(
        context,
        '心率',
        'heart',
        column([
          homeValue(
            context,
            heart['resting'] ?? m['restingHeartRate'],
            unit: 'bpm',
          ),
          homeNote(context, '静息心率'),
          trend(
            context,
            heart['points'],
            '心率',
            unit: 'bpm',
            color: const Color(0xffd15b67),
          ),
        ]),
        footer:
            '最低 / 最高 ${homeFormat(heart['min'])} / ${homeFormat(heart['max'])} bpm',
      ),
      card(
        context,
        '呼吸',
        'lungs',
        column([
          pairs(context, [
            ('清醒平均', resp['waking'], '次/分'),
            ('睡眠平均', resp['sleep'], '次/分'),
          ]),
          trend(context, resp['points'], '呼吸频率', unit: '次/分'),
        ]),
        footer:
            '最低 / 最高 ${homeFormat(resp['min'])} / ${homeFormat(resp['max'])}',
      ),
      card(
        context,
        '骑行 FTP',
        'bike',
        column([
          homeValue(
            context,
            ftp['wattsPerKg'],
            unit: 'W/kg',
            digits: 2,
            size: 35,
          ),
          const SizedBox(height: 20),
          homeValue(context, ftp['value'], unit: 'W'),
          homeNote(context, '功能阈值功率'),
        ]),
        footer:
            '${ftp['source'] == 'MANUAL' ? '手动记录' : 'Garmin 记录'} · ${ftp['date'] ?? '—'}',
      ),
      card(
        context,
        '跑步乳酸阈值',
        'run',
        column([
          Text(
            pace == null
                ? '—'
                : '${pace.toInt() ~/ 60}′${(pace.toInt() % 60).toString().padLeft(2, '0')}″ / km',
            style: const TextStyle(fontSize: 30, letterSpacing: -1),
          ),
          const SizedBox(height: 18),
          homeNote(
            context,
            '心率 ${homeFormat(lt['heartRate'])} bpm\n功率 ${homeFormat(lt['power'])} W\n功体比 ${homeFormat(lt['powerToWeight'], digits: 2)} W/kg',
          ),
        ]),
        footer: '更新于 ${lt['date'] ?? '—'}',
      ),
      card(
        context,
        '跑步最大摄氧量',
        'vo2',
        column([
          HomeGlyph('vo2', size: 42, color: palette[2]),
          const SizedBox(height: 16),
          homeValue(context, homeMap(vo2['generic'])['value'], size: 43),
          homeNote(context, 'ml/kg/min · 有氧运动能力'),
        ]),
        footer: '最近测量 ${homeMap(vo2['generic'])['date'] ?? '—'}',
      ),
      card(
        context,
        '上一次活动',
        sportIcon,
        column([
          Text(
            '${last['name'] ?? '暂无活动'}',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
          homeNote(context, '${last['date'] ?? ''} ${last['time'] ?? ''}'),
          const SizedBox(height: 14),
          Text(
            homeDuration(last['durationMinutes']),
            style: const TextStyle(fontSize: 24),
          ),
          homeNote(
            context,
            '${homeFormat(last['calories'])} kcal\n平均心率 ${homeFormat(last['averageHeartRate'])} bpm',
          ),
        ]),
        onTap: onNavigate == null ? null : () => onNavigate!('activity_stats'),
      ),
      if (homeNumber(hydration['value']) != null)
        card(
          context,
          '喝水',
          'drop',
          HomeDial(
            value: homeNumber(hydration['value']),
            maximum: homeNumber(hydration['goal']) ?? 0,
            color: palette[0],
            unit: 'ml',
          ),
          footer: '目标 ${homeFormat(hydration['goal'])} ml',
        )
      else
        empty(
          context,
          '喝水',
          'drop',
          '还没有饮水记录',
          '每日目标 ${homeFormat(hydration['goal'])} ml',
        ),
      if (homeNumber(homeMap(vo2['cycling'])['value']) != null)
        card(
          context,
          '骑车最大摄氧量',
          'bike',
          homeValue(
            context,
            homeMap(vo2['cycling'])['value'],
            unit: 'ml/kg/min',
          ),
        )
      else
        empty(context, '骑车最大摄氧量', 'bike', '等待一次有效骑行', '记录包含心率与功率的骑行后查看'),
      if (homeNumber(homeMap(b['spo2'])['average']) != null)
        card(
          context,
          '脉搏血氧',
          'oxygen',
          homeValue(context, homeMap(b['spo2'])['average'], unit: '%'),
        )
      else
        empty(context, '脉搏血氧', 'oxygen', '当天暂无读数', '开启设备测量并同步后查看'),
    ];
    return section(
      context,
      '运动',
      'Garmin Connect',
      message(context, 'body', '运动指标', child: HomeGrid(children: cards)),
      page: 'trends',
    );
  }

  Widget food(BuildContext context) {
    final data = modules['meals'] ?? {},
        summary = homeMap(data['summary']),
        totals = homeMap(summary['totals']),
        count = homeNumber(summary['meals']) ?? 0,
        palette = homePalette(context);
    final profile = modules['profile'],
        details = profile?['status'] == 'ready'
            ? homeMap(profile?['profile'])
            : null;
    final dailyEnergy = NutritionReference.getDailyEnergy(details);
    final intake = homeMap(totals['calories']),
        expenditure = homeNumber(
          homeMap(modules['overview']?['daily'])['calories'],
        );
    final calories = homeNumber(intake['value']);
    final balance =
        count > 0 &&
            intake['complete_meals'] == count &&
            calories != null &&
            expenditure != null
        ? expenditure - calories
        : null;
    String partial(String key) =>
        homeNumber(homeMap(totals[key])['value']) != null &&
            homeMap(totals[key])['complete_meals'] != count
        ? '部分合计'
        : '已记录合计';
    final macros = [
      ('protein_g', '蛋白质', 'protein'),
      ('carbs_g', '碳水化合物', 'carbs'),
      ('fat_g', '脂肪', 'fat'),
    ];
    final macroValues = [
      for (final item in macros)
        (homeNumber(homeMap(totals[item.$1])['value']) ?? 0) *
            (NutritionReference.macroConfigs[item.$1]!['kcalPerGram']!),
    ];
    final complete =
        count > 0 &&
        macros.every(
          (item) =>
              homeNumber(homeMap(totals[item.$1])['value']) != null &&
              homeMap(totals[item.$1])['complete_meals'] == count,
        );
    final entries = homeRows(data['entries'])
      ..sort((a, b) => '${a['time']}'.compareTo('${b['time']}'));
    return section(
      context,
      '饮食',
      '已保存的饮食记录',
      message(
        context,
        'meals',
        '饮食',
        child: column([
          HomeGrid(
            children: [
              card(
                context,
                '能量摄入',
                'food',
                column([
                  homeValue(context, calories, unit: 'kcal', size: 34),
                  homeNote(context, '${count.toInt()} 餐已记录'),
                  const SizedBox(height: 15),
                  homeNote(
                    context,
                    balance != null && balance < 0 ? '热量盈余' : '热量缺口',
                  ),
                  homeValue(context, balance?.abs(), unit: 'kcal', size: 24),
                ]),
                footer: partial('calories'),
              ),
              for (final entry in macros.indexed)
                Builder(
                  builder: (context) {
                    final (key, label, glyph) = entry.$2;
                    final config = NutritionReference.macroConfigs[key]!,
                        value = homeNumber(homeMap(totals[key])['value']);
                    final low = dailyEnergy == null
                            ? null
                            : (dailyEnergy *
                                      config['min']! /
                                      100 /
                                      config['kcalPerGram']!)
                                  .round(),
                        high = dailyEnergy == null
                            ? null
                            : (dailyEnergy *
                                      config['max']! /
                                      100 /
                                      config['kcalPerGram']!)
                                  .round();
                    final percentage = value != null && high != null && high > 0
                        ? value / high * 100
                        : null;
                    return card(
                      context,
                      label,
                      glyph,
                      column([
                        homeValue(context, value, unit: 'g'),
                        homeNote(
                          context,
                          high == null ? '每日参考暂不可用' : '每日参考 $low–$high g',
                        ),
                        const SizedBox(height: 15),
                        LinearProgressIndicator(
                          value: percentage == null
                              ? 0
                              : (percentage / 100).clamp(0, 1),
                          color: palette[entry.$1],
                          backgroundColor: Theme.of(
                            context,
                          ).colorScheme.outlineVariant.withValues(alpha: .4),
                          minHeight: 6,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        if (percentage != null)
                          homeNote(context, '占每日参考上限 ${percentage.round()}%'),
                      ]),
                      footer: partial(key),
                    );
                  },
                ),
            ],
          ),
          const SizedBox(height: 10),
          card(
            context,
            '今日餐食',
            'food',
            column([
              if (entries.isEmpty) homeNote(context, '当天还没有饮食记录'),
              for (final entry in entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 13),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${entry['time'] ?? ''}',
                        style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '${entry['name'] ?? homeRows(entry['items']).map((r) => r['name']).join('、')}',
                          style: const TextStyle(fontSize: 12, height: 1.6),
                        ),
                      ),
                    ],
                  ),
                ),
            ]),
            minimumHeight: 150,
          ),
          const SizedBox(height: 10),
          card(
            context,
            '营养供能分布',
            'nutrition',
            complete && macroValues.fold(0.0, (a, b) => a + b) > 0
                ? HomeDonut(
                    values: macroValues,
                    labels: macros.map((row) => row.$2).toList(),
                  )
                : homeNote(context, '餐食营养信息记全后展示供能分布'),
            footer: '按蛋白质 / 碳水 4、脂肪 9 kcal/g 估算',
          ),
        ]),
      ),
      page: 'food',
    );
  }

  Widget body(BuildContext context) {
    final data = modules['zepp'] ?? {},
        unique = <String, Map<String, dynamic>>{};
    for (final row in [homeMap(data['latest']), ...homeRows(data['daily'])]) {
      final at = DateTime.tryParse('${row['measuredAt']}');
      if (at != null &&
          dateText(at.toUtc().add(const Duration(hours: 8))).compareTo(date) <=
              0) {
        unique['${row['measuredAt']}'] = row;
      }
    }
    final measurements = unique.values.toList()
      ..sort((a, b) => '${a['measuredAt']}'.compareTo('${b['measuredAt']}'));
    final latest = measurements.lastOrNull ?? <String, dynamic>{},
        previous = measurements.length > 1
            ? measurements[measurements.length - 2]
            : <String, dynamic>{};
    final palette = homePalette(context);
    String delta(String key, String unit) {
      final a = homeNumber(latest[key]), b = homeNumber(previous[key]);
      return a != null && b != null
          ? '较上次 ${a - b > 0 ? '+' : ''}${homeFormat(a - b, digits: 2)} $unit'
          : '暂无上次测量';
    }

    List<Map<String, dynamic>> history(String key) => measurements
        .skip(math.max(0, measurements.length - 14))
        .map(
          (row) => {
            'at': row['measuredAt'],
            'date': dateText(
              DateTime.parse(
                '${row['measuredAt']}',
              ).toUtc().add(const Duration(hours: 8)),
            ),
            'value': row[key],
          },
        )
        .toList();
    final measuredAt = DateTime.tryParse('${latest['measuredAt']}');
    return section(
      context,
      '身体成分',
      'Zepp Life',
      message(
        context,
        'zepp',
        '身体成分',
        child: column([
          if (measuredAt != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                '最近测量 ${dateText(measuredAt.toUtc().add(const Duration(hours: 8)))}',
                style: TextStyle(
                  fontSize: 11,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          card(
            context,
            '体重',
            'scale',
            column([
              homeValue(context, latest['weightKg'], unit: 'kg', size: 37),
              homeNote(context, delta('weightKg', 'kg')),
              trend(context, history('weightKg'), '体重', unit: 'kg'),
            ]),
            footer: '最近 14 次测量',
          ),
          const SizedBox(height: 10),
          HomeGrid(
            children: [
              card(
                context,
                'BMI',
                'bmi',
                column([
                  homeValue(context, latest['bmi']),
                  const SizedBox(height: 20),
                  homeNote(
                    context,
                    '体重 ${homeFormat(latest['weightKg'])} kg\n身高 ${homeFormat(latest['heightCm'])} cm',
                  ),
                ]),
                footer: delta('bmi', ''),
              ),
              card(
                context,
                '体脂率',
                'fat',
                HomeDial(
                  value: homeNumber(latest['bodyFatPct']),
                  maximum: 100,
                  color: palette[1],
                  unit: '%',
                ),
                footer: delta('bodyFatPct', '个百分点'),
              ),
              card(
                context,
                '肌肉率',
                'muscle',
                column([
                  homeValue(context, latest['muscleRatePct'], unit: '%'),
                  trend(
                    context,
                    history('muscleRatePct'),
                    '肌肉率',
                    unit: '%',
                    color: palette[2],
                  ),
                ]),
                footer: delta('muscleRatePct', '个百分点'),
              ),
              card(
                context,
                '体水分',
                'drop',
                column([
                  Row(
                    children: [
                      HomeGlyph('drop', size: 39, color: palette[0]),
                      const SizedBox(width: 8),
                      Expanded(
                        child: homeValue(
                          context,
                          latest['bodyWaterPct'],
                          unit: '%',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  LinearProgressIndicator(
                    value: ((homeNumber(latest['bodyWaterPct']) ?? 0) / 100)
                        .clamp(0, 1),
                    color: palette[0],
                    minHeight: 10,
                    borderRadius: BorderRadius.circular(5),
                  ),
                  homeNote(context, '体重中的水分占比'),
                ]),
                footer: delta('bodyWaterPct', '个百分点'),
              ),
              card(
                context,
                '内脏脂肪',
                'waist',
                column([
                  homeValue(
                    context,
                    latest['visceralFat'],
                    unit: '级',
                    size: 38,
                  ),
                  const SizedBox(height: 20),
                  homeNote(
                    context,
                    '上次测量 ${homeFormat(previous['visceralFat'])} 级',
                  ),
                ]),
                footer: delta('visceralFat', '级'),
              ),
              card(
                context,
                '骨量',
                'bone',
                column([
                  homeValue(
                    context,
                    latest['boneMassKg'],
                    unit: 'kg',
                    digits: 2,
                  ),
                  const SizedBox(height: 25),
                  HomeGlyph(
                    'bone',
                    size: 33,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ]),
                footer: delta('boneMassKg', 'kg'),
              ),
              card(
                context,
                '基础代谢',
                'bolt',
                column([
                  homeValue(
                    context,
                    latest['basalMetabolismKcal'],
                    unit: 'kcal / 天',
                  ),
                  const SizedBox(height: 15),
                  homeNote(context, '静息状态下的基础能量消耗估算'),
                ]),
                footer: delta('basalMetabolismKcal', 'kcal / 天'),
              ),
              card(
                context,
                '蛋白质率',
                'protein',
                column([
                  homeValue(context, latest['proteinPct'], unit: '%'),
                  const SizedBox(height: 25),
                  LinearProgressIndicator(
                    value: ((homeNumber(latest['proteinPct']) ?? 0) / 100)
                        .clamp(0, 1),
                    color: palette[0],
                    minHeight: 6,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ]),
                footer: delta('proteinPct', '个百分点'),
              ),
              card(
                context,
                '身体评分',
                'score',
                HomeDial(
                  value: homeNumber(latest['bodyScore']),
                  maximum: 100,
                  color: palette[2],
                  unit: '/ 100',
                ),
                footer: 'Zepp Life 评分',
              ),
            ],
          ),
          homeNote(context, '身体成分为体脂秤估算。'),
        ]),
      ),
    );
  }

  Widget report(BuildContext context, String kind) {
    final rows =
        homeRows(modules[kind]?['reports'])
            .where(
              (row) =>
                  row['state'] == 'completed' &&
                  row['summary'] is String &&
                  '${row['period_start']}'.compareTo(date) <= 0 &&
                  ('${row['period_end_exclusive'] ?? date}').compareTo(
                        dateText(
                          DateTime.parse(date).add(const Duration(days: 1)),
                        ),
                      ) <=
                      0,
            )
            .toList()
          ..sort(
            (a, b) => '${b['period_start']}'.compareTo('${a['period_start']}'),
          );
    final latest = rows.firstOrNull;
    final id = '${latest?['id'] ?? ''}';
    return message(
      context,
      kind,
      kind == 'daily' ? '日报' : '周报',
      child: card(
        context,
        kind == 'daily' ? '健康日报' : '健康周报',
        kind == 'daily' ? 'sun' : 'calendar',
        column([
          Text(
            '${latest?['title'] ?? '暂无报告'}',
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '${latest?['summary'] ?? '完成的健康报告会显示在这里。'}',
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              height: 1.8,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ]),
        footer: '${latest?['period_start'] ?? ''}',
        key: ValueKey('home-report-${id.isEmpty ? kind : id}'),
        onTap: RegExp(r'^[1-9]\d{0,17}$').hasMatch(id)
            ? () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => ReportDetail(api: api, id: id),
                ),
              )
            : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final journal = homeRows(modules['journal']?['entries']);
    return column([
      summary(context),
      exercise(context),
      food(context),
      body(context),
      section(
        context,
        '报告',
        '健康助手',
        column([
          report(context, 'daily'),
          const SizedBox(height: 10),
          report(context, 'weekly'),
        ]),
        page: 'reports',
      ),
      section(
        context,
        '个人记录',
        '感受、状态与日常',
        message(
          context,
          'journal',
          '个人记录',
          child: card(
            context,
            journal.isEmpty ? '今天感觉怎么样？' : '今天的记录',
            'journal',
            column([
              if (journal.isEmpty)
                homeNote(context, '记下疲劳、心情或身体感受，给数据补充一点生活的线索。'),
              for (final row in journal)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    '${row['content'] ?? row['text'] ?? ''}',
                    style: const TextStyle(fontSize: 12, height: 1.8),
                  ),
                ),
            ]),
            onTap: onNavigate == null ? null : () => onNavigate!('journal'),
            minimumHeight: 130,
          ),
        ),
        page: 'journal',
      ),
    ]);
  }
}
