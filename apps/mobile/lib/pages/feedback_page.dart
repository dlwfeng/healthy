import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:image_picker/image_picker.dart';
import '../garmin_api.dart';
import '../feedback_api.dart';

String feedbackTime(dynamic value) {
  final date = DateTime.tryParse(value?.toString() ?? '');
  if (date == null) return '尚未检查';
  final local = date.toUtc().add(const Duration(hours: 8));
  String pad(int n) => n.toString().padLeft(2, '0');
  return '${local.month}/${local.day} ${pad(local.hour)}:${pad(local.minute)}';
}

String feedbackQuotaLabel(dynamic quota) {
  if (quota is! Map) return '';
  final remaining = quota['remaining_percent'];
  if (quota['stale'] == true || remaining is! num) return 'Gemini 额度待更新';
  final reset = quota['resets_at'];
  if (reset is num) {
    final local = DateTime.fromMillisecondsSinceEpoch(
      reset.toInt() * 1000,
      isUtc: true,
    ).add(const Duration(hours: 8));
    String pad(int n) => n.toString().padLeft(2, '0');
    return 'Gemini 剩余 $remaining%（${pad(local.hour)}:${pad(local.minute)} 重置）';
  }
  return 'Gemini 剩余 $remaining%';
}

(Color, Color) feedbackStatusColors(String status, Brightness brightness) {
  final dark = brightness == Brightness.dark;
  switch (status) {
    case 'done':
      return dark
          ? (const Color(0xFF54BDAD), const Color(0xFF223F3C))
          : (const Color(0xFF178477), const Color(0xFFE9F5F1));
    case 'running':
      return dark
          ? (const Color(0xFF77C6DA), const Color(0xFF243F48))
          : (const Color(0xFF3A96AF), const Color(0xFFEAF5F8));
    case 'ready':
      return dark
          ? (const Color(0xFFAE9FEE), const Color(0xFF332F49))
          : (const Color(0xFF7263C3), const Color(0xFFF0EDFA));
    case 'review':
    case 'needs_info':
      return dark
          ? (const Color(0xFFE9AF70), const Color(0xFF43382C))
          : (const Color(0xFFD38A3D), const Color(0xFFFCF3E8));
    case 'blocked':
      return dark
          ? (const Color(0xFFEC9292), const Color(0xFF462F35))
          : (const Color(0xFFDA6B6B), const Color(0xFFFCEDED));
    case 'queued':
      return dark
          ? (const Color(0xFF60A5FA), const Color(0xFF1E293B))
          : (const Color(0xFF2563EB), const Color(0xFFEFF6FF));
    case 'paused':
    case 'closed':
    default:
      return dark
          ? (const Color(0xFFA0ADB6), const Color(0xFF202E37))
          : (const Color(0xFF6C7B85), const Color(0xFFF8FAFB));
  }
}

class FeedbackStatusBadge extends StatelessWidget {
  const FeedbackStatusBadge({super.key, required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, bg) = feedbackStatusColors(
      status,
      Theme.of(context).brightness,
    );
    final label = feedbackStates[status] ?? (status.isEmpty ? '待处理' : status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class FeedbackPage extends StatefulWidget {
  const FeedbackPage({super.key, required this.api});
  final GarminApi api;
  @override
  State<FeedbackPage> createState() => _FeedbackPageState();
}

class _FeedbackPageState extends State<FeedbackPage> {
  late final service = FeedbackApi(widget.api);
  final search = TextEditingController();
  List<dynamic> items = [];
  Map<String, dynamic> worker = {};
  String priority = '', status = '', error = '';
  bool busy = false;
  int page = 1;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    unawaited(load());
    timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted && ModalRoute.of(context)?.isCurrent == true && !busy) {
        unawaited(load(quiet: true));
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    search.dispose();
    super.dispose();
  }

  Future<void> load({bool quiet = false}) async {
    if (!quiet) setState(() => busy = true);
    try {
      final state = await service.request('status');
      List<dynamic> rows = [];
      {
        final q = Uri(
          queryParameters: {
            'priority': priority,
            'status': status,
            'q': search.text,
            'page': '$page',
          },
        ).query;
        rows = (await service.request('topics?$q'))['topics'] as List;
      }
      if (mounted) {
        setState(() {
          worker = state;
          items = rows;
          error = '';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted && !quiet) setState(() => busy = false);
    }
  }

  Future<void> open([Map<String, dynamic>? topic]) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => topic == null
            ? FeedbackCompose(api: service)
            : FeedbackDetail(api: service, id: topic['id'].toString()),
      ),
    );
    if (mounted) await load();
  }

  Widget filter(
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String?> change,
  ) => DropdownButtonFormField<String>(
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(labelText: label),
    items: [
      const DropdownMenuItem(value: '', child: Text('全部')),
      ...options.entries.map(
        (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
      ),
    ],
    onChanged: change,
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('意见反馈'),
      actions: [
        IconButton(
          onPressed: busy ? null : load,
          icon: const Icon(Icons.refresh),
          tooltip: '刷新',
        ),
      ],
    ),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: () => open(),
      icon: const Icon(Icons.add),
      label: const Text('提意见'),
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
        children: [
          if (error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                error,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Icon(
                  Icons.circle,
                  size: 8,
                  color: worker['online'] == true
                      ? Colors.green
                      : Colors.orange,
                ),
                Text(worker['online'] == true ? '开发助手在线' : '开发助手暂未连接'),
                if (worker['quota'] != null)
                  Text(feedbackQuotaLabel(worker['quota'])),
              ],
            ),
            const SizedBox(height: 16),
            filter('紧急程度', priority, feedbackPriorities, (v) {
              priority = v ?? '';
              page = 1;
              unawaited(load());
            }),
            const SizedBox(height: 12),
            filter('处理状态', status, feedbackStates, (v) {
              status = v ?? '';
              page = 1;
              unawaited(load());
            }),
            const SizedBox(height: 12),
            TextField(
              controller: search,
              decoration: InputDecoration(
                labelText: '搜索主题',
                suffixIcon: IconButton(
                  onPressed: () {
                    page = 1;
                    unawaited(load());
                  },
                  icon: const Icon(Icons.search),
                ),
              ),
              onSubmitted: (_) {
                page = 1;
                unawaited(load());
              },
            ),
            if (busy) const LinearProgressIndicator(),
            if (items.isEmpty && !busy)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Text('还没有意见主题。点击“提意见”，记录你的想法。'),
              ),
            ...items.map((raw) {
              final t = raw as Map<String, dynamic>;
              return Column(
                children: [
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    onTap: () => open(t),
                    title: Text(
                      t['title'],
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            FeedbackStatusBadge(
                              status: t['status']?.toString() ?? '',
                            ),
                            Text(
                              '#${t['id']} · ${feedbackPriorities[t['priority']]}',
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          t['body'],
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${t['comment_count']} 条回复${(t['unread_count'] ?? 0) > 0 ? ' · 有新回复' : ''} · ${feedbackTime(t['updated_at'])}',
                        ),
                      ],
                    ),
                    trailing: const Icon(Icons.chevron_right),
                  ),
                  const Divider(height: 1),
                ],
              );
            }),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: page > 1
                      ? () {
                          page--;
                          unawaited(load());
                        }
                      : null,
                  child: const Text('上一页'),
                ),
                Text('第 $page 页'),
                TextButton(
                  onPressed: items.length == 30
                      ? () {
                          page++;
                          unawaited(load());
                        }
                      : null,
                  child: const Text('下一页'),
                ),
              ],
            ),
          ],
        ],
      ),
    ),
  );
}

class FeedbackCompose extends StatefulWidget {
  const FeedbackCompose({super.key, required this.api});
  final FeedbackApi api;
  @override
  State<FeedbackCompose> createState() => _FeedbackComposeState();
}

class _FeedbackComposeState extends State<FeedbackCompose> {
  final title = TextEditingController(), body = TextEditingController();
  late final keyValue = widget.api.requestKey();
  String priority = 'medium', target = 'both', error = '';
  bool busy = false;
  List<Map<String, String>> photos = [];
  @override
  void dispose() {
    title.dispose();
    body.dispose();
    super.dispose();
  }

  Future<void> pick() async {
    try {
      final files = await ImagePicker().pickMultiImage(
        maxWidth: 1600,
        imageQuality: 78,
        limit: 3,
      );
      if (files.isEmpty) return;
      if (files.length > 3) throw Exception('最多选择 3 张图片。');
      final values = <Map<String, String>>[];
      for (final f in files) {
        final bytes = await f.readAsBytes();
        if (bytes.length > 1700000) throw Exception('单张图片请小于 1.7 MB。');
        values.add({'data_base64': base64Encode(bytes)});
      }
      if (mounted) setState(() => photos = values);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> save() async {
    if (title.text.trim().isEmpty || body.text.trim().isEmpty) {
      setState(() => error = '请填写主题和意见内容。');
      return;
    }
    setState(() => busy = true);
    try {
      await widget.api.request(
        'topics',
        body: {
          'title': title.text,
          'body': body.text,
          'priority': priority,
          'target': target,
          'photos': photos,
        },
        key: keyValue,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('提意见')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        TextField(
          controller: title,
          maxLength: 160,
          decoration: const InputDecoration(
            labelText: '主题',
            hintText: '用一句话描述希望改善的功能',
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: priority,
          isExpanded: true,
          decoration: const InputDecoration(labelText: '紧急程度'),
          items: feedbackPriorities.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: busy ? null : (v) => setState(() => priority = v!),
        ),
        const SizedBox(height: 20),
        DropdownButtonFormField<String>(
          initialValue: target,
          decoration: const InputDecoration(labelText: '影响端'),
          items: const [
            DropdownMenuItem(value: 'both', child: Text('手机和网页')),
            DropdownMenuItem(value: 'web', child: Text('网页版')),
            DropdownMenuItem(value: 'mobile', child: Text('手机版')),
          ],
          onChanged: busy ? null : (v) => setState(() => target = v!),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: body,
          maxLines: 8,
          maxLength: 12000,
          decoration: const InputDecoration(
            labelText: '意见内容',
            hintText: '现在哪里不方便？你希望改成什么样？',
            alignLabelWithHint: true,
          ),
        ),
        OutlinedButton.icon(
          onPressed: busy ? null : pick,
          icon: const Icon(Icons.add_photo_alternate_outlined),
          label: Text('附图 · 已选 ${photos.length}/3'),
        ),
        if (error.isNotEmpty)
          Text(
            error,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: busy ? null : save,
          child: Text(busy ? '正在提交…' : '提交意见'),
        ),
      ],
    ),
  );
}

List<Map<String, dynamic>> feedbackTimeline(Map<String, dynamic> topic) {
  final supplied = topic['timeline'] as List?;
  if (supplied != null) return supplied.cast<Map<String, dynamic>>();
  final entries = <Map<String, dynamic>>[
    for (final c in topic['comments'] as List? ?? [])
      {...c, 'kind': c['author'] == 'system' ? 'log' : 'reply'},
    for (final l in topic['logs'] as List? ?? [])
      {...l, 'kind': l['node_title'] != null ? 'node' : 'log'},
  ];
  entries.sort(
    (a, b) => DateTime.parse(
      b['created_at'],
    ).compareTo(DateTime.parse(a['created_at'])),
  );
  return entries;
}

class FeedbackTimelineEntry extends StatelessWidget {
  const FeedbackTimelineEntry({super.key, required this.entry, this.onAction});
  final Map<String, dynamic> entry;
  final void Function(String action, String? nodeId)? onAction;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    if (entry['kind'] == 'node') {
      return FeedbackProcessNode(entry: entry, onAction: onAction);
    }
    final isLog = entry['kind'] == 'log';
    final level = entry['level'] ?? 'info';
    final label = {'info': '提示', 'warning': '警告', 'error': '错误'}[level] ?? '提示';
    final accent = level == 'error'
        ? colors.error
        : level == 'warning'
        ? Colors.amber.shade800
        : colors.outline;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 7),
      padding: EdgeInsets.all(isLog ? 12 : 16),
      decoration: BoxDecoration(
        color: isLog ? colors.surfaceContainerLow : colors.surface,
        borderRadius: BorderRadius.circular(isLog ? 8 : 12),
        border: isLog
            ? Border(left: BorderSide(color: accent, width: 3))
            : Border.all(color: colors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 4,
            children: [
              Text(
                isLog
                    ? '系统日志 · $label'
                    : entry['author'] == 'user'
                    ? '我'
                    : '开发助手',
                style: TextStyle(
                  fontSize: isLog ? 12 : 14,
                  fontWeight: FontWeight.w600,
                  color: isLog ? colors.onSurfaceVariant : colors.onSurface,
                ),
              ),
              Text(
                feedbackTime(entry['created_at']),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (isLog)
            SelectableText(
              entry['body'],
              style: TextStyle(fontSize: 13, color: colors.onSurfaceVariant),
            )
          else
            MarkdownBody(data: entry['body'], selectable: true),
        ],
      ),
    );
  }
}

const feedbackChoiceLabels = <String, String>{
  'accept': '完成关闭',
  'rollback': '退回上一版本',
  'deploy': '部署',
  'reply': '补充意见',
  'auto_deploy': '自动部署',
};

class FeedbackProcessNode extends StatelessWidget {
  const FeedbackProcessNode({super.key, required this.entry, this.onAction});
  final Map<String, dynamic> entry;
  final void Function(String action, String? nodeId)? onAction;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final actions = (entry['available_actions'] as List?) ?? [];
    final selected = entry['selected_action'];
    final pending = selected == null && actions.isNotEmpty;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 10),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: pending ? colors.primaryContainer : colors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: pending ? colors.primary : colors.outlineVariant,
          width: pending ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                selected != null
                    ? Icons.check_circle_outline
                    : pending
                    ? Icons.touch_app_outlined
                    : Icons.account_tree_outlined,
                size: 20,
                color: colors.primary,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  pending ? '过程节点 · 需要你操作' : '过程节点',
                  style: TextStyle(
                    color: colors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            feedbackTime(entry['created_at']),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Text(
            entry['node_title'] ?? '处理进展',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          SelectableText(entry['body'] ?? ''),
          if (selected != null) ...[
            const Divider(height: 28),
            Text(
              '已选择：${feedbackChoiceLabels[selected] ?? selected}',
              style: TextStyle(
                color: colors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              feedbackTime(entry['selected_at']),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ] else if (pending) ...[
            const Divider(height: 28),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: actions.map<Widget>((dynamic a) {
                final label = feedbackChoiceLabels[a] ?? a.toString();
                void choose() =>
                    onAction?.call(a.toString(), entry['id']?.toString());
                return a == 'accept'
                    ? FilledButton(
                        onPressed: onAction == null ? null : choose,
                        child: Text(label),
                      )
                    : OutlinedButton(
                        onPressed: onAction == null ? null : choose,
                        child: Text(label),
                      );
              }).toList(),
            ),
          ] else if (((entry['node_actions'] as List?) ?? []).isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              '此节点已结束，请查看后续进展。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class FeedbackDetail extends StatefulWidget {
  const FeedbackDetail({super.key, required this.api, required this.id});
  final FeedbackApi api;
  final String id;
  @override
  State<FeedbackDetail> createState() => _FeedbackDetailState();
}

class _FeedbackDetailState extends State<FeedbackDetail> {
  Map<String, dynamic>? topic;
  String error = '';
  bool busy = false;
  final reply = TextEditingController();
  final replyFocus = FocusNode();
  String? replyKey;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    unawaited(load());
    timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted && !busy) unawaited(load());
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    reply.dispose();
    replyFocus.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final t =
          (await widget.api.request('topics/${widget.id}'))['topic']
              as Map<String, dynamic>;
      if (mounted) {
        setState(() => topic = t);
        final comments = t['comments'] as List;
        if (comments.isNotEmpty) {
          unawaited(
            widget.api
                .request(
                  'topics/${widget.id}/read',
                  body: {'cursor': comments.last['id']},
                )
                .catchError((_) => <String, dynamic>{}),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> action(String action, {String? priority, String? nodeId}) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await widget.api.request(
        'topics/${widget.id}/actions',
        body: {'action': action, 'priority': ?priority, 'node_id': ?nodeId},
      );
      await load();
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> send() async {
    if (busy || reply.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      replyKey ??= widget.api.requestKey();
      await widget.api.request(
        'topics/${widget.id}/comments',
        body: {'body': reply.text},
        key: replyKey,
      );
      reply.clear();
      replyKey = null;
      await load();
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget executionInfo(Map<String, dynamic> topic) {
    final runs = topic['runs'] as List? ?? [];
    if (runs.isEmpty) return const SizedBox.shrink();
    final run = runs.first as Map<String, dynamic>;
    const labels = {
      'none': '无',
      'environment': '环境问题',
      'validation': '验证失败',
      'code': '代码问题',
      'requirement': '需要补充',
      'merge': '合并冲突',
      'quota': '额度不足',
      'connection': '连接失败',
      'timeout': '执行超时',
      'cancelled': '执行中断',
      'unknown': '未分类',
    };
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('执行信息', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          SelectableText('Worktree：${run['worktree_name'] ?? '尚未创建'}'),
          const SizedBox(height: 8),
          Text('错误类型：${labels[run['error_type']] ?? '暂无'}'),
          const SizedBox(height: 8),
          SelectableText(
            '错误原因：${run['error_reason']?.toString().isNotEmpty == true ? run['error_reason'] : '无'}',
          ),
          if (topic['status'] == 'blocked')
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text('自动执行已停止。请在下方补充回复后继续。'),
            ),
        ],
      ),
    );
  }

  Widget attachment(dynamic a) {
    final url = '${widget.api.api.baseUrl}/api/feedback/attachments/${a['id']}';
    final headers = <String, String>{};
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => Scaffold(
            appBar: AppBar(title: const Text('意见附图')),
            body: InteractiveViewer(
              child: Center(child: Image.network(url, headers: headers)),
            ),
          ),
        ),
      ),
      child: Image.network(
        url,
        headers: headers,
        width: 100,
        height: 100,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const SizedBox(
          width: 100,
          height: 100,
          child: Icon(Icons.broken_image_outlined),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = topic;
    return Scaffold(
      appBar: AppBar(
        title: Text('意见 #${widget.id}'),
        actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh))],
      ),
      body: t == null
          ? Center(
              child: error.isEmpty
                  ? const CircularProgressIndicator()
                  : Text(error),
            )
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  t['title'],
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    FeedbackStatusBadge(
                      status: t['status']?.toString() ?? '',
                    ),
                    Text(feedbackPriorities[t['priority']] ?? ''),
                  ],
                ),
                const SizedBox(height: 20),
                MarkdownBody(data: t['body'], selectable: true),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: (t['attachments'] as List)
                      .map<Widget>((a) => attachment(a))
                      .toList(),
                ),
                Text(
                  '最近检查：${feedbackTime(t['last_poll_at'])}\n下次检查：${['done', 'closed'].contains(t['status'])
                      ? '已停止'
                      : t['status'] == 'paused'
                      ? '自动处理已暂停'
                      : ['review', 'blocked', 'needs_info'].contains(t['status'])
                      ? '等待操作'
                      : feedbackTime(t['next_poll_at'])}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (!['done', 'closed'].contains(t['status'])) ...[
                      if (['queued', 'ready'].contains(t['status']))
                        OutlinedButton(
                          onPressed: busy ? null : () => action('now'),
                          child: const Text('立即检查'),
                        ),
                      OutlinedButton(
                        onPressed: busy
                            ? null
                            : () => action(
                                t['status'] == 'paused' ? 'resume' : 'pause',
                              ),
                        child: Text(t['status'] == 'paused' ? '恢复处理' : '暂停处理'),
                      ),
                      OutlinedButton(
                        onPressed: busy ? null : () => action('close'),
                        child: const Text('关闭主题'),
                      ),
                    ] else
                      OutlinedButton(
                        onPressed: busy ? null : () => action('reopen'),
                        child: const Text('重新打开'),
                      ),
                    PopupMenuButton<String>(
                      tooltip: '调整紧急程度',
                      onSelected: (v) => action('priority', priority: v),
                      itemBuilder: (_) => feedbackPriorities.entries
                          .map(
                            (e) => PopupMenuItem(
                              value: e.key,
                              child: Text(e.value),
                            ),
                          )
                          .toList(),
                      child: const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text('调整等级'),
                      ),
                    ),
                  ],
                ),
                executionInfo(t),
                const Divider(height: 32),
                Text(
                  '处理过程 · 最新在前',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                ...feedbackTimeline(t).map<Widget>(
                  (c) => FeedbackTimelineEntry(
                    entry: c,
                    onAction: busy
                        ? null
                        : (a, nodeId) {
                            if (a == 'reply') {
                              replyFocus.requestFocus();
                            } else {
                              action(a, nodeId: nodeId);
                            }
                          },
                  ),
                ),
                if (error.isNotEmpty)
                  Text(
                    error,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                TextField(
                  controller: reply,
                  focusNode: replyFocus,
                  maxLines: 4,
                  maxLength: 12000,
                  decoration: const InputDecoration(
                    labelText: '补充意见',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: busy ? null : send,
                  child: Text(busy ? '发送中…' : '回复'),
                ),
                const SizedBox(height: 28),
              ],
            ),
    );
  }
}
