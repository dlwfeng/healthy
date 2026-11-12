import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../garmin_api.dart';
import '../meal_api.dart';
import '../widgets/data_page.dart';
import '../widgets/report_document.dart';

String requestKey() {
  final r = Random.secure();
  final bytes = List.generate(16, (_) => r.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.api});
  final GarminApi api;
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String kind = 'daily';
  bool loading = true, submitting = false;
  String? error, cursor;
  int request = 0;
  List<Map<String, dynamic>> reports = [];
  Timer? poll;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    poll?.cancel();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    poll?.cancel();
    final token = ++request;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.get('/api/health-reports', {
        'kind': kind,
        if (more && cursor != null) 'cursor': cursor!,
      });
      if (!mounted || token != request) return;
      setState(() {
        reports = [if (more) ...reports, ...rows(data['reports'])];
        cursor = data['next_cursor']?.toString();
        loading = false;
      });
      if (reports.any(
        (r) => ['queued', 'running', 'retrying'].contains(r['state']),
      )) {
        poll = Timer(const Duration(seconds: 5), () {
          if (mounted) unawaited(load());
        });
      }
    } catch (e) {
      if (mounted && token == request) {
        setState(() {
          error = errorText(e);
          loading = false;
        });
      }
    }
  }

  Future<void> generate() async {
    final requestedKind = kind;
    final now = shanghaiNow();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(2020),
      lastDate: now,
    );
    if (picked == null || !mounted) return;
    final start = requestedKind == 'weekly'
        ? picked.subtract(Duration(days: picked.weekday - 1))
        : picked;
    final end = start.add(Duration(days: requestedKind == 'weekly' ? 7 : 1));
    if (requestedKind == 'weekly' &&
        end.isAfter(DateTime(now.year, now.month, now.day))) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('该周尚未结束，请选择更早的一周。')));
      return;
    }
    final accepted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('生成健康报告'),
        content: Text(
          '${requestedKind == 'daily' ? '日报' : '周报'} · ${dateText(start)}\n将使用已有健康与饮食数据生成应用分析。已有报告将被复用。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('生成'),
          ),
        ],
      ),
    );
    if (accepted != true || !mounted) return;
    setState(() {
      submitting = true;
    });
    try {
      await widget.api.send('POST', '/api/health-reports/generate', {
        'kind': requestedKind,
        'period_start': dateText(start),
        'request_key': requestKey(),
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('已提交，生成进度将自动刷新')));
        await load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(errorText(e))));
      }
    } finally {
      if (mounted) {
        setState(() {
          submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('健康报告'),
        actions: [
          IconButton(
            tooltip: '定时报告设置',
            icon: const Icon(Icons.schedule_outlined),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => ReportSettings(api: widget.api),
              ),
            ),
          ),
        ],
      ),
      body: DataBody(
        loading: loading && reports.isEmpty,
        error: error,
        onRefresh: load,
        header: [
          Text(
            '读懂身体的每一天',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: -.6,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '健康、运动与饮食，在这里一起回顾。',
            style: TextStyle(color: colors.onSurfaceVariant, height: 1.5),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: SegmentedButton<String>(
                  showSelectedIcon: false,
                  style: SegmentedButton.styleFrom(
                    side: BorderSide.none,
                    backgroundColor: colors.surface,
                    selectedBackgroundColor: colors.primary,
                    selectedForegroundColor: colors.onPrimary,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 12,
                    ),
                  ),
                  segments: const [
                    ButtonSegment(value: 'daily', label: Text('日报')),
                    ButtonSegment(value: 'weekly', label: Text('周报')),
                  ],
                  selected: {kind},
                  onSelectionChanged: (s) {
                    setState(() {
                      kind = s.first;
                      reports = [];
                      cursor = null;
                    });
                    unawaited(load());
                  },
                ),
              ),
              const SizedBox(width: 12),
              IconButton.filled(
                tooltip: '选择历史周期生成',
                onPressed: submitting ? null : generate,
                icon: submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add),
              ),
            ],
          ),
          const SizedBox(height: 20),
        ],
        children: [
          if (reports.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  Icon(
                    Icons.auto_stories_outlined,
                    size: 40,
                    color: colors.primary,
                  ),
                  const SizedBox(height: 20),
                  Text('暂无报告', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text(
                    '选择一个已结束的日期，回顾那段时间的身体状态。',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: colors.onSurfaceVariant,
                      height: 1.6,
                    ),
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: submitting ? null : generate,
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('生成第一份报告'),
                  ),
                ],
              ),
            ),
          ...reports.asMap().entries.map(
            (entry) => _ReportCard(
              report: entry.value,
              kind: kind,
              featured: entry.key == 0,
              onOpen: entry.value['generated_at'] == null
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => ReportDetail(
                          api: widget.api,
                          id: '${entry.value['id']}',
                        ),
                      ),
                    ),
            ),
          ),
          if (cursor != null)
            TextButton(
              onPressed: () => load(more: true),
              child: const Text('加载更多'),
            ),
          const SizedBox(height: 8),
          Text(
            '由健康助手根据已保存的健康与饮食数据分析',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({
    required this.report,
    required this.kind,
    required this.featured,
    this.onOpen,
  });
  final Map<String, dynamic> report;
  final String kind;
  final bool featured;
  final VoidCallback? onOpen;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final date = DateTime.tryParse('${report['period_start']}');
    final pending = ['queued', 'running', 'retrying'].contains(report['state']);
    final failed = report['state'] == 'failed' || report['error_code'] != null;
    final statusColor = failed ? colors.error : colors.primary;
    final summary =
        '${report['summary'] ?? (pending ? '正在整理这段时间的健康与饮食数据…' : '暂无报告摘要')}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: colors.surface,
        borderRadius: BorderRadius.circular(24),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: colors.primary.withValues(alpha: .08),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        kind == 'daily'
                            ? Icons.wb_sunny_outlined
                            : Icons.date_range_outlined,
                        size: 20,
                        color: colors.primary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        date == null
                            ? '${report['period_start']}'
                            : '${date.year}.${date.month.toString().padLeft(2, '0')}.${date.day.toString().padLeft(2, '0')} · ${kind == 'daily' ? '日报' : '周报'}',
                        style: TextStyle(
                          fontSize: 13,
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                    ),
                    if (pending)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: Icon(
                          Icons.hourglass_top_rounded,
                          size: 14,
                          color: statusColor,
                        ),
                      ),
                    Flexible(
                      child: Text(
                        reportState(report['state']),
                        style: TextStyle(fontSize: 12, color: statusColor),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text(
                  '${report['title'] ?? '${kind == 'daily' ? '每日' : '每周'}健康回顾'}',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: featured ? 22 : 19,
                    height: 1.4,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -.4,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  summary,
                  maxLines: featured ? 4 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.7,
                    color: colors.onSurfaceVariant,
                  ),
                ),
                if (failed)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(
                      '生成未成功，可稍后重试。',
                      style: TextStyle(fontSize: 12, color: colors.error),
                    ),
                  ),
                if (onOpen != null) ...[
                  const SizedBox(height: 18),
                  Divider(
                    height: 1,
                    color: colors.outlineVariant.withValues(alpha: .5),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Text(
                        '阅读报告',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.primary,
                        ),
                      ),
                      const Spacer(),
                      Icon(
                        Icons.arrow_forward_rounded,
                        size: 18,
                        color: colors.primary,
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String reportState(dynamic state) =>
    const {
      'queued': '排队中',
      'running': '生成中',
      'retrying': '重试中',
      'failed': '生成失败',
      'insufficient_data': '数据不足',
      'published': '已发布',
      'succeeded': '已完成',
      'completed': '已完成',
    }[state] ??
    '暂无正文';

class ReportDetail extends StatefulWidget {
  const ReportDetail({super.key, required this.api, required this.id});
  final GarminApi api;
  final String id;
  @override
  State<ReportDetail> createState() => _ReportDetailState();
}

class _ReportDetailState extends State<ReportDetail> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? report;
  String? document;
  bool regenerating = false, regenerationSubmitted = false;
  String? regenerationKey;
  Future<void> regenerate() async {
    if (report == null || regenerating) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('重新生成报告？'),
        content: const Text('重新分析同一周期。成功后会替换当前报告，失败时仍保留原报告。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('重新生成'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() => regenerating = true);
    regenerationKey ??= requestKey();
    try {
      await widget.api.send('POST', '/api/health-reports/generate', {
        'kind': report!['kind'],
        'period_start': report!['period_start'],
        'regenerate': true,
        'request_key': regenerationKey,
      });
      if (mounted) {
        setState(() => regenerationSubmitted = true);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('已提交重新生成，后台完成后更新报告。')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(errorText(e))));
      }
    } finally {
      if (mounted) setState(() => regenerating = false);
    }
  }

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.get('/api/health-reports/${widget.id}');
      final rendered = (data['render'] as Map?)?['document'];
      if (rendered is! String || rendered.trim().isEmpty) {
        throw Exception('报告文档不可用，请稍后重试。');
      }
      if (mounted) {
        setState(() {
          report = Map<String, dynamic>.from(data['report']);
          document = rendered;
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

  void showEvidence() {
    final evidence = report?['evidence'];
    if (evidence is! Map) return;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .7,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('报告数据来源', style: Theme.of(context).textTheme.titleLarge),
              ...evidence.entries.map(
                (e) => ListTile(
                  title: Text('${e.key}'),
                  subtitle: SelectableText('${e.value}'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('报告详情'),
      actions: [
        IconButton(
          tooltip: '刷新报告',
          onPressed: loading ? null : load,
          icon: const Icon(Icons.refresh),
        ),
        PopupMenuButton<String>(
          tooltip: '报告操作',
          onSelected: (action) {
            if (action == 'evidence') showEvidence();
            if (action == 'regenerate') unawaited(regenerate());
          },
          itemBuilder: (_) => [
            if (report?['evidence'] is Map)
              const PopupMenuItem(value: 'evidence', child: Text('报告数据来源')),
            if (report != null)
              PopupMenuItem(
                value: 'regenerate',
                enabled: !regenerating && !regenerationSubmitted,
                child: Text(
                  regenerationSubmitted
                      ? '已提交重新生成'
                      : regenerating
                      ? '提交中…'
                      : '重新生成此报告',
                ),
              ),
          ],
        ),
      ],
    ),
    body: loading || error != null
        ? DataBody(
            loading: loading,
            error: error,
            onRefresh: load,
            children: const [],
          )
        : SafeArea(
            top: false,
            child: ReportDocument(document!, key: ValueKey(document)),
          ),
  );
}

class ReportSettings extends StatefulWidget {
  const ReportSettings({super.key, required this.api});
  final GarminApi api;
  @override
  State<ReportSettings> createState() => _ReportSettingsState();
}

class _ReportSettingsState extends State<ReportSettings> {
  bool loading = true, saving = false;
  String? error;
  List<Map<String, dynamic>> schedules = [];
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.get('/api/health-report-settings');
      if (mounted) {
        setState(() {
          schedules = rows(data['schedules']);
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

  Future<void> save() async {
    setState(() {
      saving = true;
    });
    try {
      await widget.api.send('PATCH', '/api/health-report-settings', {
        'schedules': schedules
            .map(
              (s) => {
                for (final k in [
                  'kind',
                  'enabled',
                  'timezone',
                  'local_time',
                  'weekday',
                ])
                  k: s[k],
              },
            )
            .toList(),
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('定时报告设置已保存')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(errorText(e))));
      }
    } finally {
      if (mounted) {
        setState(() {
          saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('定时报告设置')),
    body: DataBody(
      loading: loading,
      error: error,
      onRefresh: load,
      children: [
        ...schedules.map(
          (s) => Card.outlined(
            child: Column(
              children: [
                SwitchListTile(
                  title: Text(s['kind'] == 'daily' ? '日报' : '周报'),
                  subtitle: Text('${s['timezone']} · ${s['local_time']}'),
                  value: s['enabled'] == true,
                  onChanged: saving
                      ? null
                      : (v) => setState(() {
                          s['enabled'] = v;
                        }),
                ),
                ListTile(
                  title: const Text('生成时间'),
                  trailing: Text('${s['local_time']}'),
                  onTap: saving
                      ? null
                      : () async {
                          final parts = '${s['local_time']}'.split(':');
                          final time = await showTimePicker(
                            context: context,
                            initialTime: TimeOfDay(
                              hour: int.parse(parts[0]),
                              minute: int.parse(parts[1]),
                            ),
                          );
                          if (time != null && mounted) {
                            setState(() {
                              s['local_time'] =
                                  '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
                            });
                          }
                        },
                ),
                if (s['kind'] == 'weekly')
                  DropdownButtonFormField<int>(
                    initialValue: s['weekday'] as int,
                    decoration: const InputDecoration(labelText: '周报生成日'),
                    items: List.generate(
                      7,
                      (i) => DropdownMenuItem(
                        value: i,
                        child: Text(
                          ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][i],
                        ),
                      ),
                    ),
                    onChanged: saving
                        ? null
                        : (v) => setState(() {
                            s['weekday'] = v;
                          }),
                  ),
              ],
            ),
          ),
        ),
        if (schedules.isNotEmpty)
          DropdownButtonFormField<String>(
            initialValue: '${schedules.first['timezone']}',
            decoration: const InputDecoration(labelText: '时区'),
            items:
                {
                      ...schedules.map((s) => '${s['timezone']}'),
                      'Asia/Shanghai',
                      'Asia/Tokyo',
                      'Europe/London',
                      'America/New_York',
                      'UTC',
                    }
                    .map(
                      (zone) =>
                          DropdownMenuItem(value: zone, child: Text(zone)),
                    )
                    .toList(),
            onChanged: saving
                ? null
                : (zone) => setState(() {
                    for (final s in schedules) {
                      s['timezone'] = zone;
                    }
                  }),
          ),
        const Text('日报回顾前一天，周报回顾上一完整周；服务在线时后台自动生成。'),
        FilledButton(
          onPressed: saving ? null : save,
          child: Text(saving ? '保存中…' : '保存设置'),
        ),
      ],
    ),
  );
}
