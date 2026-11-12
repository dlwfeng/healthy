import 'dart:async';
import 'package:flutter/material.dart';
import '../garmin_api.dart';
import '../meal_api.dart';
import '../widgets/data_page.dart';

class StatusPage extends StatefulWidget {
  const StatusPage({super.key, required this.api});
  final GarminApi api;
  @override
  State<StatusPage> createState() => _StatusPageState();
}

class _StatusPageState extends State<StatusPage> {
  DateTime month = DateTime(shanghaiNow().year, shanghaiNow().month);
  bool loading = true;
  String? error;
  int request = 0;
  List<Map<String, dynamic>> entries = [];
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
      final data = await widget.api.get('/api/daily-status', {
        'start_date': dateText(month),
        'end_date': dateText(DateTime(month.year, month.month + 1, 0)),
      });
      if (mounted && token == request) {
        setState(() {
          entries = rows(data['entries']);
          loading = false;
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

  void shift(int delta) {
    setState(() {
      month = DateTime(month.year, month.month + delta);
    });
    unawaited(load());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('个人记录')),
    body: Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              onPressed: () => shift(-1),
              icon: const Icon(Icons.chevron_left),
            ),
            Text('${month.year}年${month.month}月'),
            IconButton(
              onPressed: () => shift(1),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        Expanded(
          child: DataBody(
            loading: loading,
            error: error,
            onRefresh: load,
            children: [
              if (entries.isEmpty) const ListTile(title: Text('本月暂无个人状态记录')),
              ...entries.map(
                (e) => Card.outlined(
                  child: ListTile(
                    title: Text('${e['content']}'),
                    subtitle: Text('${e['date']} · 本人记录'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
