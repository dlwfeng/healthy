import 'package:flutter/material.dart';

String errorText(Object e) => e.toString().replaceFirst('Exception: ', '');
List<Map<String, dynamic>> rows(dynamic value) => (value as List? ?? [])
    .map((e) => Map<String, dynamic>.from(e as Map))
    .toList();
String numberText(dynamic value) => value is num
    ? (value == value.roundToDouble()
          ? value.toInt().toString()
          : value.toStringAsFixed(1))
    : '未记录';

class DataBody extends StatelessWidget {
  const DataBody({
    super.key,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.children,
    this.header = const [],
  });
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;
  final List<Widget> children;
  final List<Widget> header;
  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: onRefresh,
    child: ListView(
      padding: const EdgeInsets.all(16),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        ...header,
        if (loading)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (error != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(error!),
                  TextButton(onPressed: onRefresh, child: const Text('重试')),
                ],
              ),
            ),
          ),
        if (!loading && error == null) ...children,
        const SizedBox(height: 80),
      ],
    ),
  );
}

class SourceNote extends StatelessWidget {
  const SourceNote(this.data, {super.key, this.label = 'Garmin Connect'});
  final Map<String, dynamic>? data;
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Text(
      '来源：$label${data?['syncedAt'] == null ? '' : '\n读取时间：${data!['syncedAt']}'}',
      style: Theme.of(context).textTheme.bodySmall,
    ),
  );
}
