import 'dart:async';
import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../garmin_api.dart';
import '../../meal_api.dart' show dateText;
import '../data_page.dart';
import '../meal_energy.dart';
import 'cockpit_widgets.dart';
import 'home_cards.dart';

class ModuleSummaries extends StatefulWidget {
  const ModuleSummaries({
    super.key,
    required this.api,
    required this.date,
    this.totalCalories,
    this.onFood,
    this.onReports,
    this.signals,
    this.movement,
  });
  final GarminApi api;
  final String date;
  final num? totalCalories;
  final VoidCallback? onFood, onReports;
  final Widget? signals, movement;
  @override
  State<ModuleSummaries> createState() => _ModuleSummariesState();
}

class _ModuleSummariesState extends State<ModuleSummaries> {
  final modules = <String, Map<String, dynamic>>{};
  final errors = <String>{};
  int request = 0;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void didUpdateWidget(ModuleSummaries oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.date != widget.date || oldWidget.api != widget.api) {
      unawaited(load());
    }
  }

  Future<void> load() async {
    final token = ++request;
    modules.clear();
    errors.clear();
    final date = widget.date;
    await Future.wait(
      ['meals', 'daily', 'weekly', 'journal'].map((kind) async {
        try {
          final data = kind == 'meals'
              ? await widget.api.get('/api/meals', {
                  'start_date': date,
                  'end_date': date,
                })
              : kind == 'journal'
              ? await widget.api.get('/api/daily-status', {
                  'start_date': date,
                  'end_date': date,
                })
              : await widget.api.get('/api/health-reports', {
                  'kind': kind,
                  'to': date,
                });
          if (mounted && request == token) setState(() => modules[kind] = data);
        } catch (_) {
          if (mounted && request == token) setState(() => errors.add(kind));
        }
      }),
    );
  }

  String message(String kind, String empty) => errors.contains(kind)
      ? '读取失败，请刷新'
      : modules.containsKey(kind)
      ? empty
      : '';

  Widget status(String kind, String empty) =>
      !modules.containsKey(kind) && !errors.contains(kind)
      ? Semantics(
          label: '读取中',
          child: const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        )
      : Text(
          message(kind, empty),
          style: TextStyle(
            fontSize: 12,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        );

  Widget nutrient(
    BuildContext context,
    Map totals,
    String key,
    String label,
    Color color,
    int count,
  ) {
    final value = totals[key] as Map?;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.only(left: 10, right: 4),
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: adaptiveColor(context, color), width: 3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 4),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: formatNumber(value?['value']),
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const TextSpan(text: ' g', style: TextStyle(fontSize: 11)),
                ],
              ),
            ),
            if (value?['value'] != null && value?['complete_meals'] != count)
              const Tooltip(
                message: '部分合计',
                child: Text(
                  '*',
                  semanticsLabel: '部分合计',
                  style: TextStyle(fontSize: 10),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget food(BuildContext context) {
    final summary = modules['meals']?['summary'] as Map? ?? {};
    final entries = rows(modules['meals']?['entries'])
      ..sort((a, b) => '${a['time']}'.compareTo('${b['time']}'));
    final totals = summary['totals'] as Map? ?? {};
    final count = (summary['meals'] as num?)?.toInt() ?? entries.length;
    final calories = totals['calories'] as Map?;
    return CockpitPanel(
      title: '饮食记录',
      note: modules.containsKey('meals') ? '$count 餐' : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MealEnergySummary(
            intake: calories?['value'] as num?,
            complete: count > 0 && calories?['complete_meals'] == count,
            expenditure: widget.totalCalories,
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                nutrient(
                  context,
                  totals,
                  'protein_g',
                  '蛋白质',
                  coralColor,
                  count,
                ),
                nutrient(context, totals, 'carbs_g', '碳水', cyanColor, count),
                nutrient(context, totals, 'fat_g', '脂肪', orangeColor, count),
              ],
            ),
          ),
          const SizedBox(height: 10),
          if (entries.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: status('meals', '暂无餐食'),
            ),
          for (final meal in entries) mealRow(context, meal),
        ],
      ),
    );
  }

  Widget mealRow(BuildContext context, Map<String, dynamic> meal) {
    final items = rows(meal['items']);
    final known = items.where((i) => i['calories'] is num).toList();
    final calories = known.isEmpty
        ? null
        : known.fold<num>(0, (s, i) => s + (i['calories'] as num));
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
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
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 39,
            child: Text(
              meal['time'] ?? '—',
              style: TextStyle(fontSize: 11, color: muted),
            ),
          ),
          SizedBox(
            width: 34,
            child: Text(
              meal['kind'] ?? '',
              style: TextStyle(fontSize: 11, color: muted),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  meal['name'] ?? items.map((i) => i['name']).join('、'),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatNumber(calories),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                'kcal${known.isNotEmpty && known.length != items.length ? '*' : ''}',
                style: TextStyle(fontSize: 10, color: muted),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget report(BuildContext context, String kind, String label) {
    final reports =
        rows(modules[kind]?['reports'])
            .where(
              (r) =>
                  r['state'] == 'completed' &&
                  r['summary'] != null &&
                  '${r['period_start']}'.compareTo(widget.date) <= 0 &&
                  (r['period_end_exclusive'] == null ||
                      '${r['period_end_exclusive']}'.compareTo(
                            dateText(
                              DateTime.parse(
                                widget.date,
                              ).add(const Duration(days: 1)),
                            ),
                          ) <=
                          0),
            )
            .toList()
          ..sort(
            (a, b) => '${b['period_start']}'.compareTo('${a['period_start']}'),
          );
    final latest = reports.firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.primaryContainer.withValues(alpha: .4),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                latest == null
                    ? ''
                    : '${latest['period_start']}${kind == 'weekly' ? ' 起' : ''}',
                style: TextStyle(
                  fontSize: 11,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (latest != null) ...[
          Text(
            latest['title'] ?? label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 6),
        ],
        if (latest != null)
          CockpitReportExcerpt(
            key: ValueKey(latest['id']),
            text: latest['summary'],
          )
        else
          status(kind, '暂无报告'),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      food(context),
      ?widget.signals,
      CockpitPanel(
        title: '健康报告',
        child: Column(
          children: [
            report(context, 'daily', '日报'),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Divider(),
            ),
            report(context, 'weekly', '周报'),
          ],
        ),
      ),
      ?widget.movement,
      CockpitPanel(
        title: '个人记录',
        note: modules.containsKey('journal')
            ? '${rows(modules['journal']?['entries']).length} 条'
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (rows(modules['journal']?['entries']).isEmpty)
              status('journal', '暂无记录'),
            for (final entry in rows(modules['journal']?['entries']))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  entry['content'] ?? '',
                  style: const TextStyle(fontSize: 12, height: 1.7),
                ),
              ),
          ],
        ),
      ),
    ],
  );
}

class CockpitReportExcerpt extends StatefulWidget {
  const CockpitReportExcerpt({super.key, required this.text});
  final String text;
  @override
  State<CockpitReportExcerpt> createState() => _CockpitReportExcerptState();
}

class _CockpitReportExcerptState extends State<CockpitReportExcerpt> {
  bool expanded = false;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        expanded || widget.text.length <= 160
            ? widget.text
            : '${widget.text.substring(0, 160)}…',
        style: const TextStyle(fontSize: 12, height: 1.85),
      ),
      if (widget.text.length > 160)
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            onPressed: () => setState(() => expanded = !expanded),
            tooltip: expanded ? '收起摘要' : '展开摘要',
            isSelected: expanded,
            icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 20),
            selectedIcon: const Icon(Icons.keyboard_arrow_up_rounded, size: 20),
          ),
        ),
    ],
  );
}
