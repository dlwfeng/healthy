import 'dart:async';
import 'package:flutter/material.dart';
import '../garmin_api.dart';
import '../meal_api.dart';
import '../widgets/data_page.dart';
import 'activity_statistics.dart';

class ActivityPage extends StatefulWidget {
  const ActivityPage({
    super.key,
    required this.api,
    this.initialStats = true,
    this.onModeChanged,
  });
  final GarminApi api;
  final bool initialStats;
  final ValueChanged<bool>? onModeChanged;
  @override
  State<ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends State<ActivityPage> {
  DateTime month = DateTime(shanghaiNow().year, shanghaiNow().month);
  String selected = dateText(shanghaiNow());
  bool loading = true;
  late bool stats = widget.initialStats;
  String? error;
  int request = 0;
  Map<String, dynamic>? data;
  @override
  void initState() {
    super.initState();
    if (!stats) unawaited(load());
  }

  Future<void> load() async {
    final token = ++request;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.api.fetchCalendar(
        dateText(month).substring(0, 7),
      );
      if (mounted && token == request) {
        setState(() {
          data = result;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted && token == request) {
        setState(() {
          loading = false;
          error = errorText(e);
        });
      }
    }
  }

  void shift(int delta) {
    setState(() {
      month = DateTime(month.year, month.month + delta);
      selected = dateText(month);
    });
    unawaited(load());
  }

  Future<void> detail(Map<String, dynamic> item) async {
    await Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => WorkoutDetail(api: widget.api, item: item),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = rows(data?['items']);
    return Scaffold(
      appBar: AppBar(title: const Text('运动训练')),
      body: Column(
        children: [
          if (!stats)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: month.year > 2020 || month.month > 1
                      ? () => shift(-1)
                      : null,
                  tooltip: '上个月',
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('${month.year}年${month.month}月'),
                IconButton(
                  onPressed: month.year < 2099 || month.month < 12
                      ? () => shift(1)
                      : null,
                  tooltip: '下个月',
                  icon: const Icon(Icons.chevron_right),
                ),
                TextButton(
                  onPressed: () {
                    setState(() {
                      month = DateTime(shanghaiNow().year, shanghaiNow().month);
                      selected = dateText(shanghaiNow());
                    });
                    unawaited(load());
                  },
                  child: const Text('本月'),
                ),
              ],
            ),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('活动统计')),
              ButtonSegment(value: false, label: Text('训练计划')),
            ],
            selected: {stats},
            onSelectionChanged: (v) {
              if (widget.onModeChanged != null) {
                widget.onModeChanged!.call(v.first);
                return;
              }
              setState(() {
                stats = v.first;
                if (!v.first) {
                  month = DateTime(shanghaiNow().year, shanghaiNow().month);
                  selected = dateText(shanghaiNow());
                }
              });
              if (!v.first && data == null) unawaited(load());
            },
          ),
          Expanded(
            child: stats
                ? ActivityStatistics(api: widget.api)
                : DataBody(
                    loading: loading,
                    error: error,
                    onRefresh: load,
                    children: [
                      if ((data?['unavailable'] as List? ?? []).isNotEmpty)
                        const Text('部分 Garmin 数据读取失败，以下内容可能不完整。下拉可重试。'),
                      ...[
                        const Text('● 已完成运动    ○ 计划课程'),
                        const SizedBox(height: 12),
                        Row(
                          children: ['一', '二', '三', '四', '五', '六', '日']
                              .map(
                                (d) => Expanded(child: Center(child: Text(d))),
                              )
                              .toList(),
                        ),
                        GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 7,
                                mainAxisExtent: 56,
                              ),
                          itemCount:
                              month.weekday -
                              1 +
                              DateTime(month.year, month.month + 1, 0).day,
                          itemBuilder: (context, index) {
                            final day = index - month.weekday + 2;
                            if (day < 1) return const SizedBox.shrink();
                            final date = dateText(
                              DateTime(month.year, month.month, day),
                            );
                            final entries = items.where(
                              (r) => r['date'] == date,
                            );
                            return InkWell(
                              onTap: () => setState(() {
                                selected = date;
                              }),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: selected == date
                                      ? Theme.of(
                                          context,
                                        ).colorScheme.primaryContainer
                                      : null,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text('$day'),
                                    Text(
                                      '${entries.any((r) => r['kind'] == 'activity') ? '●' : ''}${entries.any((r) => r['kind'] == 'workout') ? '○' : ''}',
                                      style: TextStyle(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.primary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 12),
                        Text(
                          selected,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        if (!items.any((r) => r['date'] == selected))
                          const ListTile(title: Text('当日暂无运动或计划课程')),
                        ...items
                            .where((r) => r['date'] == selected)
                            .map(itemTile),
                      ],
                      SourceNote(data),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget itemTile(Map<String, dynamic> item) => Card.outlined(
    child: ListTile(
      leading: Icon(
        item['kind'] == 'workout' ? Icons.event_outlined : Icons.directions_run,
      ),
      title: Text('${item['name']}'),
      subtitle: Text(
        '${item['date']} · ${item['kind'] == 'workout' ? '计划课程' : '已完成运动'}\n${numberText(item['durationMinutes'])} 分钟 · ${numberText(item['distanceKm'])} km',
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => detail(item),
    ),
  );
}

class WorkoutDetail extends StatefulWidget {
  const WorkoutDetail({super.key, required this.api, required this.item});
  final GarminApi api;
  final Map<String, dynamic> item;
  @override
  State<WorkoutDetail> createState() => _WorkoutDetailState();
}

class _WorkoutDetailState extends State<WorkoutDetail> {
  Map<String, dynamic>? workout;
  bool loading = false;
  String? error;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    if (widget.item['kind'] != 'workout' || widget.item['workoutId'] == null) {
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.fetchWorkout('${widget.item['workoutId']}');
      if (mounted) {
        setState(() {
          workout = Map<String, dynamic>.from(data['workout']);
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = errorText(e);
          loading = false;
        });
      }
    }
  }

  Widget step(Map<String, dynamic> s, int depth) => Padding(
    padding: EdgeInsets.only(left: depth * 12.0),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            '${const {'warmup': '热身', 'cooldown': '放松', 'interval': '运动', 'recovery': '恢复', 'repeat': '重复组', 'rest': '休息'}[s['type']] ?? s['type'] ?? '训练步骤'}${s['iterations'] == null ? '' : ' × ${s['iterations']}'}',
          ),
          subtitle: Text(
            [
              if (s['description'] != null) '${s['description']}',
              if (s['value'] != null)
                s['endCondition'] == 'time'
                    ? '持续 ${numberText((s['value'] as num) / 60)} 分钟'
                    : s['endCondition'] == 'distance'
                    ? '距离 ${numberText(s['value'])} 米'
                    : '${s['endCondition']}: ${s['value']}',
              if (s['target'] != null)
                '目标：${s['target']}${s['zone'] == null ? '' : ' · 区间 ${s['zone']}'}${s['targetLow'] == null ? '' : ' · ${s['targetLow']}–${s['targetHigh'] ?? ''}'}',
            ].join('\n'),
          ),
        ),
        ...rows(s['steps']).map((s) => step(s, depth + 1)),
      ],
    ),
  );
  @override
  Widget build(BuildContext context) => widget.item['kind'] == 'activity'
      ? ActivityDetailPage(api: widget.api, item: widget.item)
      : Scaffold(
          appBar: AppBar(title: Text('${widget.item['name']}')),
          body: DataBody(
            loading: loading,
            error: error,
            onRefresh: load,
            children: [
              Text(
                '${widget.item['date']} · ${sportLabel('${widget.item['sport'] ?? '运动'}')}',
              ),
              const SizedBox(height: 16),
              ...[
                Text(workout?['description'] ?? '计划课程'),
                if (widget.item['workoutId'] == null)
                  const Text('佳明未返回课程编号，无法读取步骤。'),
                ...rows(workout?['steps']).map((s) => step(s, 0)),
              ],
              const SourceNote(null),
            ],
          ),
        );
}
