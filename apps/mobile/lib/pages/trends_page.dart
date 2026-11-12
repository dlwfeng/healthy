import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../garmin_api.dart';
import '../meal_api.dart';
import '../widgets/data_page.dart';

const trendMetrics = {
  'bodyBattery': ('身体电量', '/100'),
  'sleep': ('睡眠时长', 'min'),
  'restingHeartRate': ('静息心率', 'bpm'),
  'hrv': ('夜间 HRV', 'ms'),
  'stress': ('平均压力', '/100'),
  'steps': ('步数', '步'),
  'calories': ('总消耗', 'kcal'),
};

class TrendsPage extends StatefulWidget {
  const TrendsPage({
    super.key,
    required this.api,
    required this.date,
    required this.onDateChanged,
    this.initialMetric = 'bodyBattery',
  });
  final GarminApi api;
  final String date;
  final ValueChanged<String> onDateChanged;
  final String initialMetric;
  @override
  State<TrendsPage> createState() => _TrendsPageState();
}

class _TrendsPageState extends State<TrendsPage> {
  late String date = widget.date;
  late String metric = widget.initialMetric;
  int days = 7, request = 0;
  bool loading = true;
  String? error;
  Map<String, dynamic>? data;
  Map<String, dynamic>? weightData;
  String? weightError;
  int weightRequest = 0;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void didUpdateWidget(TrendsPage old) {
    super.didUpdateWidget(old);
    if (old.date != widget.date) {
      date = widget.date;
      weightRequest++;
      weightData = null;
      weightError = null;
      unawaited(load());
    }
  }

  Future<void> load({bool refresh = false}) async {
    final token = ++request;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.api.fetchHistory(
        date,
        metric,
        days: days,
        refresh: refresh,
      );
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

  Future<void> loadWeight() async {
    final token = ++weightRequest;
    setState(() {
      weightError = null;
    });
    try {
      final result = await widget.api.fetchOverview(date, days: days);
      if (mounted && token == weightRequest) {
        setState(() {
          weightData = result;
        });
      }
    } catch (e) {
      if (mounted && token == weightRequest) {
        setState(() {
          weightError = errorText(e);
        });
      }
    }
  }

  Future<void> pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(date),
      firstDate: DateTime(2020),
      lastDate: shanghaiNow(),
    );
    if (picked != null) {
      weightRequest++;
      weightData = null;
      weightError = null;
      setState(() {
        date = dateText(picked);
      });
      widget.onDateChanged(date);
      unawaited(load());
    }
  }

  @override
  Widget build(BuildContext context) {
    final points = rows(data?['points']);
    final values = points.map((p) => p['value']).whereType<num>().toList();
    final unit = trendMetrics[metric]!.$2;
    return Scaffold(
      appBar: AppBar(
        title: const Text('生理指标'),
        actions: [
          IconButton(
            onPressed: pickDate,
            tooltip: '截止日期',
            icon: const Icon(Icons.calendar_month),
          ),
        ],
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: trendMetrics.entries
                  .map(
                    (e) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(e.value.$1),
                        selected: metric == e.key,
                        onSelected: (_) {
                          setState(() {
                            metric = e.key;
                          });
                          unawaited(load());
                        },
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 7, label: Text('近 7 天')),
                ButtonSegment(value: 30, label: Text('近 30 天')),
              ],
              selected: {days},
              onSelectionChanged: (s) {
                setState(() {
                  days = s.first;
                  weightRequest++;
                  weightData = null;
                  weightError = null;
                });
                unawaited(load());
              },
            ),
          ),
          Expanded(
            child: DataBody(
              loading: loading,
              error: error,
              onRefresh: () => load(refresh: true),
              children: [
                Text('截至 $date · ${trendMetrics[metric]!.$1}'),
                if (values.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('所选周期暂无有效观测'),
                  )
                else
                  Card.outlined(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          Wrap(
                            spacing: 24,
                            runSpacing: 8,
                            children: [
                              Text(
                                '平均 ${numberText(values.reduce((a, b) => a + b) / values.length)} $unit',
                              ),
                              Text('最低 ${numberText(values.reduce(math.min))}'),
                              Text('最高 ${numberText(values.reduce(math.max))}'),
                            ],
                          ),
                          const SizedBox(height: 16),
                          TrendChart(
                            points: points,
                            unit: unit,
                            bounded: unit == '/100',
                          ),
                        ],
                      ),
                    ),
                  ),
                Text('有效观测 ${values.length}/$days 天；空缺表示未记录，断点不连线。'),
                if (rows(data?['points']).isNotEmpty)
                  ExpansionTile(
                    title: const Text('逐日观测'),
                    children: points.reversed
                        .map(
                          (p) => ListTile(
                            title: Text('${p['date']}'),
                            trailing: Text(
                              '${numberText(p['value'])}${p['value'] is num ? ' $unit' : ''}',
                            ),
                          ),
                        )
                        .toList(),
                  ),
                SourceNote(data),
                ExpansionTile(
                  title: const Text('体重记录'),
                  onExpansionChanged: (open) {
                    if (open) unawaited(loadWeight());
                  },
                  children: [
                    if (weightError != null) Text(weightError!),
                    if (weightData == null && weightError == null)
                      const Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(),
                      ),
                    if (weightData != null &&
                        rows(weightData!['weightHistory']).isEmpty)
                      const ListTile(title: Text('所选周期暂无称重记录')),
                    if (rows(weightData?['weightHistory']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: TrendChart(
                          points: rows(weightData?['weightHistory']),
                          unit: 'kg',
                        ),
                      ),
                    ...rows(weightData?['weightHistory']).reversed
                        .take(5)
                        .map(
                          (p) => ListTile(
                            title: Text('${p['date']}'),
                            trailing: Text('${p['value']} kg'),
                          ),
                        ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class TrendChart extends StatefulWidget {
  const TrendChart({
    super.key,
    required this.points,
    required this.unit,
    this.bounded = false,
  });
  final List<Map<String, dynamic>> points;
  final String unit;
  final bool bounded;
  @override
  State<TrendChart> createState() => _TrendChartState();
}

class _TrendChartState extends State<TrendChart> {
  int? selected;
  @override
  Widget build(BuildContext context) {
    final index = selected
        ?.clamp(0, math.max(0, widget.points.length - 1))
        .toInt();
    final p = index == null || widget.points.isEmpty
        ? null
        : widget.points[index];
    return Column(
      children: [
        Text(
          p == null
              ? '触摸图表查看日期与观测值'
              : '${p['date']} · ${numberText(p['value'])} ${p['value'] is num ? widget.unit : ''}',
        ),
        const SizedBox(height: 8),
        LayoutBuilder(
          builder: (context, box) {
            void select(Offset pos) => setState(() {
              selected = ((pos.dx / box.maxWidth) * (widget.points.length - 1))
                  .round()
                  .clamp(0, math.max(0, widget.points.length - 1))
                  .toInt();
            });
            return GestureDetector(
              onTapDown: (d) => select(d.localPosition),
              onHorizontalDragUpdate: (d) => select(d.localPosition),
              child: SizedBox(
                height: 160,
                width: double.infinity,
                child: CustomPaint(
                  painter: _TrendPainter(
                    widget.points,
                    Theme.of(context).colorScheme.primary,
                    widget.bounded,
                    index,
                  ),
                ),
              ),
            );
          },
        ),
        if (widget.points.isNotEmpty)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${widget.points.first['date']}'),
              Text('${widget.points.last['date']}'),
            ],
          ),
      ],
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.points, this.color, this.bounded, this.selected);
  final List<Map<String, dynamic>> points;
  final Color color;
  final bool bounded;
  final int? selected;
  @override
  void paint(Canvas canvas, Size size) {
    final values = points.map((p) => p['value']).whereType<num>().toList();
    if (values.isEmpty) return;
    final low = bounded ? 0 : values.reduce(math.min).toDouble();
    final high = bounded ? 100 : values.reduce(math.max).toDouble();
    Offset position(int i, num v) => Offset(
      6 + (size.width - 12) * i / math.max(1, points.length - 1),
      size.height -
          10 -
          (size.height - 20) * (v - low) / math.max(1, high - low),
    );
    final pen = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    Offset? previous;
    for (var i = 0; i < points.length; i++) {
      final v = points[i]['value'];
      if (v is! num) {
        previous = null;
        continue;
      }
      final p = position(i, v);
      if (previous != null) canvas.drawLine(previous, p, pen);
      canvas.drawCircle(p, i == selected ? 5 : 3, Paint()..color = color);
      previous = p;
    }
  }

  @override
  bool shouldRepaint(_TrendPainter old) => true;
}
