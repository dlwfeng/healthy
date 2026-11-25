import 'dart:async';
import 'package:flutter/material.dart';
import '../meal_api.dart';
import '../garmin_api.dart';
import '../widgets/home/connect_sections.dart';

class HomeDashboard extends StatefulWidget {
  const HomeDashboard({
    super.key,
    required this.garminApi,
    required this.storage,
    required this.selectedDate,
    required this.onDateChanged,
    this.onConfigure,
    this.onNavigateTab,
    this.onMetric,
    this.onStatus,
    this.onReports,
    this.onNavigate,
    this.active = true,
  });
  final GarminApi garminApi;
  // Retained shell parameters do not filter the current-status homepage.
  final MealLocalStore storage;
  final String selectedDate;
  final ValueChanged<String> onDateChanged;
  final VoidCallback? onConfigure, onStatus, onReports;
  final ValueChanged<int>? onNavigateTab;
  final ValueChanged<String>? onMetric, onNavigate;
  final bool active;
  @override
  State<HomeDashboard> createState() => _HomeDashboardState();
}

class _HomeDashboardState extends State<HomeDashboard>
    with WidgetsBindingObserver {
  final modules = <String, Map<String, dynamic>>{};
  final loading = <String>{}, errors = <String>{};
  int request = 0;
  String date = dateText(shanghaiNow()), connection = 'loading';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(load());
  }

  @override
  void dispose() {
    request++;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didUpdateWidget(HomeDashboard old) {
    super.didUpdateWidget(old);
    if ((widget.active && !old.active) || widget.garminApi != old.garminApi) {
      unawaited(load());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        widget.active &&
        date != dateText(shanghaiNow())) {
      unawaited(load());
    }
  }

  Future<void> load({bool refresh = false}) async {
    final token = ++request, today = dateText(shanghaiNow());
    final paths = <String, (String, Map<String, String>)>{
      'body': (
        '/api/health/body-status',
        {'date': today, if (refresh) 'refresh': '1'},
      ),
      'zepp': ('/api/body/measurements', {'days': '3650'}),
      'profile': ('/api/nutrition-profile', {}),
      'meals': ('/api/meals', {'start_date': today, 'end_date': today}),
      'daily': ('/api/health-reports', {'kind': 'daily', 'to': today}),
      'weekly': ('/api/health-reports', {'kind': 'weekly', 'to': today}),
      'journal': (
        '/api/daily-status',
        {'start_date': today, 'end_date': today},
      ),
    };
    setState(() {
      date = today;
      connection = 'loading';
      modules.clear();
      errors.clear();
      loading
        ..clear()
        ..addAll(['overview', ...paths.keys]);
    });
    Future<void> read(
      String key,
      Future<Map<String, dynamic>> Function() fetch,
    ) async {
      try {
        final data = await fetch();
        if (!mounted || token != request) return;
        setState(() => modules[key] = data);
      } catch (_) {
        if (!mounted || token != request) return;
        setState(() {
          errors.add(key);
          if (key == 'overview' && connection == 'loading') {
            connection = 'garmin_unavailable';
          }
        });
      } finally {
        if (mounted && token == request) setState(() => loading.remove(key));
      }
    }

    await Future.wait([
      read('overview', () async {
        final status = await widget.garminApi.fetchStatus();
        if (!mounted || token != request) return {};
        setState(
          () => connection = '${status['state'] ?? 'garmin_unavailable'}',
        );
        if (status['state'] != 'ready') throw StateError('garmin_unavailable');
        return widget.garminApi.fetchOverview(today, refresh: refresh);
      }),
      for (final entry in paths.entries)
        read(
          entry.key,
          () => widget.garminApi.get(entry.value.$1, entry.value.$2),
        ),
    ]);
    if (!mounted || token != request || !modules.containsKey('body')) return;
    unawaited(() async {
      for (final metric in ['hrv', 'floors']) {
        if (!mounted || token != request) return;
        await read(
          metric,
          () => widget.garminApi.get('/api/health/body-status/timeline', {
            'date': today,
            'metric': metric,
            if (refresh) 'refresh': '1',
          }),
        );
      }
    }());
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: () => load(refresh: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 110),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  '健康首页',
                  style: TextStyle(
                    fontSize: 25,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -.6,
                  ),
                ),
              ),
              if (widget.onConfigure != null)
                IconButton(
                  onPressed: widget.onConfigure,
                  tooltip: '连接设置',
                  icon: const Icon(Icons.settings_outlined),
                ),
              IconButton(
                onPressed: loading.isEmpty ? () => load(refresh: true) : null,
                tooltip: '刷新数据',
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          Text(
            connection == 'loading'
                ? '正在读取 Garmin'
                : connection == 'ready'
                ? 'Garmin 已连接'
                : connection == 'not_configured'
                ? '未配置 Garmin'
                : 'Garmin 暂不可用',
            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
          ),
          if (connection == 'not_configured')
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: Text('尚未配置 Garmin 连接'),
            ),
          ConnectSections(
            api: widget.garminApi,
            date: date,
            modules: modules,
            loading: loading,
            errors: errors,
            onRetry: () => load(refresh: true),
            onNavigate: widget.onNavigate,
          ),
        ],
      ),
    );
  }
}
