import 'package:flutter/material.dart';

import '../garmin_api.dart';

class MemoryPage extends StatefulWidget {
  const MemoryPage({super.key, required this.api});
  final GarminApi api;
  @override
  State<MemoryPage> createState() => _MemoryPageState();
}

class _MemoryPageState extends State<MemoryPage> {
  List<dynamic> entries = [];
  bool loading = false, failed = false;
  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    if (loading) return;
    setState(() {
      loading = true;
      failed = false;
    });
    try {
      final result = await widget.api.memory();
      if (mounted) {
        setState(() {
          entries = (result['entries'] as List?) ?? [];
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          failed = true;
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('记忆'),
      actions: [
        IconButton(
          onPressed: loading ? null : refresh,
          tooltip: '刷新记忆',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: Builder(
      builder: (context) {
        if (loading) {
          return const Center(
            child: CircularProgressIndicator(semanticsLabel: '正在读取记忆'),
          );
        }
        if (failed) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('暂时无法读取记忆。'),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: loading ? null : refresh,
                    child: const Text('重试'),
                  ),
                ],
              ),
            ),
          );
        }
        return Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 880),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                Text(
                  '健康助手记住的生活习惯、偏好和个人资料。需要修改或忘记某件事，直接在聊天中告诉它。',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.7,
                  ),
                ),
                const SizedBox(height: 24),
                if (entries.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Column(
                      children: [
                        Icon(Icons.psychology_outlined, size: 40),
                        SizedBox(height: 16),
                        Text('还没有保存的记忆'),
                        SizedBox(height: 8),
                        Text('聊天时，健康助手会逐渐了解你。'),
                      ],
                    ),
                  )
                else ...[
                  Text(
                    '共 ${entries.length} 条',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 12),
                  for (final entry in entries) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Wrap(
                            alignment: WrapAlignment.spaceBetween,
                            spacing: 16,
                            runSpacing: 4,
                            children: [
                              Text(
                                const {
                                      'profile': '关于我',
                                      'memory': '日常记忆',
                                      'learning': '经验与纠正',
                                    }[entry['kind']] ??
                                    '日常记忆',
                                style: Theme.of(context).textTheme.labelLarge,
                              ),
                              Text(
                                entry['created_at']?.toString() ?? '',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          SelectableText(
                            entry['content']?.toString() ?? '',
                            style: const TextStyle(fontSize: 16, height: 1.8),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                  ],
                ],
              ],
            ),
          ),
        );
      },
    ),
  );
}
