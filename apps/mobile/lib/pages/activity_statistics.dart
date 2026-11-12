import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../garmin_api.dart';
import '../meal_api.dart';
import '../widgets/data_page.dart';

String sportLabel(String? value) =>
    const {
      'running': '跑步',
      'trail_running': '越野跑',
      'walking': '步行',
      'cycling': '骑行',
      'road_biking': '公路骑行',
      'mountain_biking': '山地骑行',
      'indoor_cycling': '室内骑行',
      'badminton': '羽毛球',
      'indoor_cardio': '室内有氧',
      'strength_training': '力量训练',
      'cardio_training': '有氧训练',
      'swimming': '游泳',
      'lap_swimming': '泳池游泳',
      'open_water_swimming': '开放水域游泳',
      'yoga': '瑜伽',
      'hiking': '徒步',
      'pilates': '普拉提',
      'hiit': 'HIIT',
      'mobility': '灵活性训练',
      'other': '其他运动',
    }[value] ??
    value ??
    '其他运动';

String activityTime(dynamic value) {
  if (value is! num || !value.isFinite || value < 0) return '未记录';
  final seconds = value.round();
  final minutes = (seconds % 3600 ~/ 60).toString().padLeft(2, '0');
  final rest = (seconds % 60).toString().padLeft(2, '0');
  return seconds >= 3600
      ? '${seconds ~/ 3600}:$minutes:$rest'
      : '${seconds ~/ 60}:$rest';
}

String activityNumber(dynamic value, [int digits = 0]) =>
    value is num && value.isFinite ? value.toStringAsFixed(digits) : '未记录';
num? activityValue(dynamic value) =>
    value is num && value.isFinite && value >= 0 ? value : null;

class ActivityTotal {
  ActivityTotal(
    List<Map<String, dynamic>> items,
    String key, [
    num divisor = 1,
  ]) {
    final values = items
        .map((a) => activityValue(a[key]))
        .whereType<num>()
        .toList();
    value = values.isEmpty
        ? (items.isEmpty ? 0 : null)
        : values.fold<num>(0, (a, b) => a + b) / divisor;
    partial = values.length < items.length;
  }
  late final num? value;
  late final bool partial;
}

class ActivityStatistics extends StatefulWidget {
  const ActivityStatistics({super.key, required this.api});
  final GarminApi api;
  @override
  State<ActivityStatistics> createState() => _ActivityStatisticsState();
}

class _ActivityStatisticsState extends State<ActivityStatistics> {
  late DateTime end = DateTime.parse(dateText(shanghaiNow()));
  late DateTime start = end.subtract(const Duration(days: 29));
  String range = '30', sport = '', search = '', sort = 'date';
  int page = 1, request = 0;
  bool loading = true;
  String? error;
  Map<String, dynamic>? data;
  final searchController = TextEditingController();
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final token = ++request;
    setState(() {
      loading = true;
      error = null;
      data = null;
      page = 1;
    });
    try {
      final result = await widget.api.fetchActivities(
        dateText(start),
        dateText(end),
      );
      if (!mounted || token != request) return;
      setState(() {
        data = result;
        loading = false;
        if (!rows(data?['items']).any((a) => a['sport'] == sport)) sport = '';
      });
    } catch (e) {
      if (mounted && token == request) {
        setState(() {
          loading = false;
          error = errorText(e);
        });
      }
    }
  }

  Future<void> selectRange(String value) async {
    final today = DateTime.parse(dateText(shanghaiNow()));
    if (value == 'custom') {
      final selected = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2000),
        lastDate: today,
        initialDateRange: DateTimeRange(start: start, end: end),
        helpText: '选择统计日期（最多 366 天）',
        saveText: '确认',
      );
      if (selected == null || !mounted) return;
      if (selected.duration.inDays >= 366) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('请选择 366 天以内的日期范围')));
        return;
      }
      setState(() {
        range = value;
        start = selected.start;
        end = selected.end;
      });
    } else {
      setState(() {
        range = value;
        end = today;
        start = value == 'month'
            ? DateTime(today.year, today.month)
            : today.subtract(Duration(days: int.parse(value) - 1));
      });
    }
    await load();
  }

  List<Map<String, dynamic>> filtered() {
    final query = search.trim().toLowerCase();
    final items = rows(data?['items'])
        .where(
          (a) =>
              (sport.isEmpty || a['sport'] == sport) &&
              (query.isEmpty ||
                  '${a['name'] ?? ''} ${sportLabel(a['sport'])}'
                      .toLowerCase()
                      .contains(query)),
        )
        .toList();
    items.sort((a, b) {
      if (sort != 'date') {
        final key = sort == 'duration' ? 'durationSeconds' : 'distanceMeters';
        final result = (activityValue(b[key]) ?? -1).compareTo(
          activityValue(a[key]) ?? -1,
        );
        if (result != 0) return result;
      }
      return '${b['date']} ${b['time'] ?? ''}'.compareTo(
        '${a['date']} ${a['time'] ?? ''}',
      );
    });
    return items;
  }

  Widget section(String title, List<Widget> children) => Card.outlined(
    margin: const EdgeInsets.only(bottom: 16),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    ),
  );
  Widget metric(String label, String value, String unit, [String? note]) =>
      Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                text: value,
                children: [
                  TextSpan(
                    text: ' $unit',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (note != null)
              Text(note, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
  Widget summary(List<Map<String, dynamic>> items) {
    final minutes = ActivityTotal(items, 'durationSeconds', 60),
        distance = ActivityTotal(items, 'distanceMeters', 1000),
        calories = ActivityTotal(items, 'calories');
    return Card.outlined(
      margin: const EdgeInsets.only(bottom: 16),
      child: LayoutBuilder(
        builder: (context, box) {
          final metrics = [
            metric(
              '活动次数',
              '${items.length}',
              '次',
              '${items.map((a) => a['date']).toSet().length} 天有运动',
            ),
            metric(
              '累计时长',
              activityNumber(minutes.value),
              '分钟',
              minutes.partial ? '部分合计' : null,
            ),
            metric(
              '累计距离',
              activityNumber(distance.value, 2),
              'km',
              distance.partial ? '部分合计' : null,
            ),
            metric(
              '活动热量',
              activityNumber(calories.value),
              'kcal',
              calories.partial ? '部分合计' : '仅运动期间消耗',
            ),
          ];
          return Wrap(
            children: metrics
                .map((m) => SizedBox(width: box.maxWidth / 2, child: m))
                .toList(),
          );
        },
      ),
    );
  }

  Widget trend(List<Map<String, dynamic>> items) {
    final days = end.difference(start).inDays + 1, bucket = days > 60 ? 7 : 1;
    final bins = List.generate((days / bucket).ceil(), (i) {
      final first = start.add(Duration(days: i * bucket)),
          last = start.add(
            Duration(days: math.min(days - 1, (i + 1) * bucket - 1)),
          );
      final group = items
          .where(
            (a) =>
                '${a['date']}'.compareTo(dateText(first)) >= 0 &&
                '${a['date']}'.compareTo(dateText(last)) <= 0,
          )
          .toList();
      return (
        first: first,
        last: last,
        count: group.length,
        total: ActivityTotal(group, 'durationSeconds', 60),
      );
    });
    final max = math.max<num>(
      1,
      bins.fold<num>(0, (value, b) => math.max(value, b.total.value ?? 0)),
    );
    return section('运动节奏', [
      Text(
        '${bucket == 1 ? '每日' : '每 7 天'}运动时长 · 分钟',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      const SizedBox(height: 12),
      SizedBox(
        height: 155,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final bin in bins)
              Expanded(
                child: Tooltip(
                  triggerMode: TooltipTriggerMode.tap,
                  message:
                      '${dateText(bin.first)}${bucket == 1 ? '' : ' 至 ${dateText(bin.last)}'}\n${bin.count} 次 · ${activityNumber(bin.total.value)} 分钟${bin.total.partial ? '（部分合计）' : ''}',
                  child: Semantics(
                    label:
                        '${dateText(bin.first)}，${bin.count} 次，${activityNumber(bin.total.value)} 分钟',
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Container(
                            height:
                                bin.total.value == null || bin.total.value == 0
                                ? 0
                                : math
                                      .max(3, bin.total.value! / max * 130)
                                      .toDouble(),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.primary,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                          const SizedBox(height: 3),
                          Container(
                            height: 1,
                            color: Theme.of(context).colorScheme.outlineVariant,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(dateText(start).substring(5)),
          Text(dateText(end).substring(5)),
        ],
      ),
      const SizedBox(height: 8),
      Text(
        '点按柱形查看数值。未记录时长不计入柱高。',
        style: Theme.of(context).textTheme.bodySmall,
      ),
    ]);
  }

  Widget breakdown(List<Map<String, dynamic>> items) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final a in items) {
      groups.putIfAbsent('${a['sport'] ?? 'other'}', () => []).add(a);
    }
    final keys = groups.keys.toList()
      ..sort((a, b) => groups[b]!.length.compareTo(groups[a]!.length));
    return section('运动构成', [
      if (keys.isEmpty) const Text('有活动后，在这里查看运动分布。'),
      for (final key in keys)
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(child: Text(sportLabel(key))),
                  Text('${groups[key]!.length} 次'),
                ],
              ),
              const SizedBox(height: 6),
              LinearProgressIndicator(
                value: groups[key]!.length / items.length,
                minHeight: 5,
                borderRadius: BorderRadius.circular(4),
              ),
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '${activityNumber(ActivityTotal(groups[key]!, 'durationSeconds', 60).value)} 分钟${ActivityTotal(groups[key]!, 'durationSeconds').partial ? ' · 部分合计' : ''}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ],
          ),
        ),
    ]);
  }

  Widget activityTile(Map<String, dynamic> a) => Card.outlined(
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => ActivityDetailPage(api: widget.api, item: a),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  RegExp('cycl|bik').hasMatch('${a['sport']}')
                      ? Icons.directions_bike
                      : Icons.directions_run,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${a['name'] ?? '未命名活动'}',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      Text(
                        '${a['date']} ${a['time'] ?? ''} · ${sportLabel(a['sport'])}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: [
                Text('时长 ${activityTime(a['durationSeconds'])}'),
                Text(
                  '距离 ${activityNumber(activityValue(a['distanceMeters']) == null ? null : a['distanceMeters'] / 1000, 2)} km',
                ),
                Text('热量 ${activityNumber(a['calories'])} kcal'),
                Text('平均心率 ${activityNumber(a['averageHeartRate'])} bpm'),
              ],
            ),
          ],
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final items = filtered(), all = rows(data?['items']);
    final pageCount = math.max(1, (items.length / 20).ceil());
    final current = page.clamp(1, pageCount),
        visible = items.skip((current - 1) * 20).take(20);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final option in [
                  ('7', '近 7 天'),
                  ('30', '近 30 天'),
                  ('90', '近 90 天'),
                  ('month', '本月'),
                  ('custom', '自定义'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: ChoiceChip(
                      label: Text(option.$2),
                      selected: range == option.$1,
                      onSelected: (_) => unawaited(selectRange(option.$1)),
                    ),
                  ),
              ],
            ),
          ),
        ),
        TextButton.icon(
          onPressed: () => selectRange('custom'),
          icon: const Icon(Icons.date_range, size: 18),
          label: Text('${dateText(start)} 至 ${dateText(end)}'),
        ),
        Expanded(
          child: DataBody(
            loading: loading,
            error: error,
            onRefresh: load,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final key in [
                      '',
                      ...all.map((a) => '${a['sport'] ?? 'other'}').toSet(),
                    ])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(key.isEmpty ? '全部运动' : sportLabel(key)),
                          selected: sport == key,
                          onSelected: (_) => setState(() {
                            sport = key;
                            page = 1;
                          }),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              summary(items),
              trend(items),
              breakdown(items),
              Text(
                '活动详单 · ${items.length} 次',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: searchController,
                maxLength: 120,
                decoration: const InputDecoration(
                  labelText: '搜索活动名称或类型',
                  prefixIcon: Icon(Icons.search),
                  counterText: '',
                ),
                onChanged: (value) => setState(() {
                  search = value;
                  page = 1;
                }),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: sort,
                decoration: const InputDecoration(labelText: '排序'),
                items: const [
                  DropdownMenuItem(value: 'date', child: Text('最近优先')),
                  DropdownMenuItem(value: 'duration', child: Text('时长最多')),
                  DropdownMenuItem(value: 'distance', child: Text('距离最远')),
                ],
                onChanged: (value) => setState(() {
                  sort = value ?? 'date';
                  page = 1;
                }),
              ),
              const SizedBox(height: 12),
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      const Text('没有符合条件的活动'),
                      TextButton(
                        onPressed: () => setState(() {
                          sport = '';
                          search = '';
                          searchController.clear();
                          page = 1;
                        }),
                        child: const Text('清除类型和搜索条件'),
                      ),
                    ],
                  ),
                ),
              ...visible.map(activityTile),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: current > 1
                        ? () => setState(() => page = current - 1)
                        : null,
                    child: const Text('上一页'),
                  ),
                  Text('$current / $pageCount'),
                  TextButton(
                    onPressed: current < pageCount
                        ? () => setState(() => page = current + 1)
                        : null,
                    child: const Text('下一页'),
                  ),
                ],
              ),
              const Text('统计随类型与搜索筛选更新。缺失指标保留空值，部分合计会明确标记。'),
              SourceNote(data),
            ],
          ),
        ),
      ],
    );
  }
}

class ActivityDetailPage extends StatefulWidget {
  const ActivityDetailPage({super.key, required this.api, required this.item});
  final GarminApi api;
  final Map<String, dynamic> item;
  @override
  State<ActivityDetailPage> createState() => _ActivityDetailPageState();
}

class _ActivityDetailPageState extends State<ActivityDetailPage> {
  Map<String, dynamic>? data;
  bool loading = true;
  String? error;
  int request = 0;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    final token = ++request;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final id = '${widget.item['activityId'] ?? widget.item['id'] ?? ''}'
          .replaceFirst('activity:', '');
      if (!RegExp(r'^[1-9]\d{0,15}$').hasMatch(id)) {
        throw Exception('活动编号缺失，请返回刷新活动列表。');
      }
      final result = await widget.api.fetchActivity(id);
      if (!mounted || token != request) return;
      setState(() {
        data = result;
        loading = false;
      });
    } catch (e) {
      if (mounted && token == request) {
        setState(() {
          error = errorText(e);
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = Map<String, dynamic>.from(data?['activity'] ?? {}),
        splits = rows(a['splits']);
    final cycling = RegExp('cycl|bik').hasMatch('${a['sport']}');
    final speed = activityValue(a['averageSpeed']);
    final metrics = <(String, String, String)>[
      ('活动时长', activityTime(a['durationSeconds']), ''),
      ('移动时间', activityTime(a['movingSeconds']), ''),
      ('经过时间', activityTime(a['elapsedSeconds']), ''),
      (
        '距离',
        activityNumber(
          activityValue(a['distanceMeters']) == null
              ? null
              : a['distanceMeters'] / 1000,
          2,
        ),
        'km',
      ),
      ('活动热量', activityNumber(a['calories']), 'kcal'),
      ('平均心率', activityNumber(a['averageHeartRate']), 'bpm'),
      ('最高心率', activityNumber(a['maxHeartRate']), 'bpm'),
      (
        cycling ? '平均速度' : '平均配速',
        cycling
            ? activityNumber(speed == null ? null : speed * 3.6, 1)
            : activityTime(speed == null || speed == 0 ? null : 1000 / speed),
        cycling ? 'km/h' : '/km',
      ),
      (
        '最高速度',
        activityNumber(
          activityValue(a['maxSpeed']) == null ? null : a['maxSpeed'] * 3.6,
          1,
        ),
        'km/h',
      ),
      ('累计爬升', activityNumber(a['elevationGain']), 'm'),
      ('累计下降', activityNumber(a['elevationLoss']), 'm'),
      ('有氧训练效果', activityNumber(a['aerobicEffect'], 1), ''),
      ('无氧训练效果', activityNumber(a['anaerobicEffect'], 1), ''),
      ('平均步频 / 踏频', activityNumber(a['averageCadence']), '/min'),
    ];
    return Scaffold(
      appBar: AppBar(title: Text('${widget.item['name'] ?? '活动详情'}')),
      body: DataBody(
        loading: loading,
        error: error,
        onRefresh: load,
        children: [
          Text(
            '${a['date'] ?? widget.item['date']} ${a['time'] ?? ''} · ${sportLabel(a['sport'] ?? widget.item['sport'])}',
          ),
          const SizedBox(height: 16),
          Card.outlined(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: LayoutBuilder(
                builder: (context, box) => Wrap(
                  children: [
                    for (final metric in metrics)
                      SizedBox(
                        width: box.maxWidth / 2,
                        child: Padding(
                          padding: const EdgeInsets.all(10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                metric.$1,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              const SizedBox(height: 6),
                              Text.rich(
                                TextSpan(
                                  text: metric.$2,
                                  children: [
                                    TextSpan(
                                      text: ' ${metric.$3}',
                                      style: Theme.of(
                                        context,
                                      ).textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text('分圈明细', style: Theme.of(context).textTheme.titleMedium),
          if ((data?['unavailable'] as List? ?? []).contains('splits')) ...[
            const Text('分圈数据暂时读取失败，其他指标仍可查看。'),
            TextButton(onPressed: load, child: const Text('重试分圈')),
          ] else if (splits.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('Garmin 未提供这次活动的分圈记录。'),
            )
          else
            ...splits.map(
              (lap) => Card.outlined(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '第 ${lap['number']} 圈',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 16,
                        runSpacing: 8,
                        children: [
                          Text('时长 ${activityTime(lap['durationSeconds'])}'),
                          Text(
                            '距离 ${activityNumber(activityValue(lap['distanceMeters']) == null ? null : lap['distanceMeters'] / 1000, 2)} km',
                          ),
                          Text(
                            '平均心率 ${activityNumber(lap['averageHeartRate'])} bpm',
                          ),
                          Text(
                            '最高心率 ${activityNumber(lap['maxHeartRate'])} bpm',
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 16),
          const Text('未记录的指标不补零。活动热量不等于全天总消耗。'),
          SourceNote(data),
        ],
      ),
    );
  }
}
