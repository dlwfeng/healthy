import 'dart:async';

import 'package:flutter/material.dart';

import 'meal_api.dart';
import 'garmin_api.dart';
import 'navigation.dart';
import 'app_theme.dart';
import 'main.dart' show Journal, MealChatRecorder, PiChatState;
import 'widgets/pi_dock.dart';
import 'widgets/healthy_brand.dart';
import 'pages/home_page.dart';
import 'pages/trends_page.dart';
import 'pages/activity_page.dart';
import 'pages/reports_page.dart';
import 'pages/food_page.dart';
import 'pages/status_page.dart';
import 'pages/more_page.dart';
import 'pages/feedback_page.dart';
import 'pages/memory_page.dart';
import 'pages/app_update_page.dart';

class MainShell extends StatefulWidget {
  const MainShell({
    super.key,
    required this.api,
    required this.garminApi,
    required this.storage,
    this.initialIndex = 0,
  });
  final MealApi api;
  final GarminApi garminApi;
  final MealLocalStore storage;
  final int initialIndex;
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  late String page = defaultDock[widget.initialIndex.clamp(0, 3)];
  String date = dateText(shanghaiNow());
  List<String> dock = [...defaultDock];
  final Set<String> loaded = {};
  bool ready = false, more = false;
  int serverVersion = 0, mealRevision = 0;
  GlobalKey<PiChatState> piKey = GlobalKey<PiChatState>();
  void openMealSkill() {
    navigate("pi");
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => piKey.currentState?.startRecording(),
    );
  }

  @override
  void initState() {
    super.initState();
    loaded.add(page);
    unawaited(initialize());
  }

  Future<void> initialize() async {
    final server = await loadServer(widget.storage);
    widget.api.baseUrl = server;
    widget.garminApi.baseUrl = server;
    try {
      final nav = await widget.storage.read('navigation');
      dock = readDock(nav?['dock']);
    } catch (_) {}
    if (mounted) setState(() => ready = true);
  }

  void navigate(String id) {
    setState(() {
      page = id;
      loaded.add(id);
      more = false;
      date = dateText(shanghaiNow());
    });
  }

  void reports() => navigate('reports');
  void metric(String id) => Navigator.push(
    context,
    MaterialPageRoute<void>(
      builder: (_) => TrendsPage(
        api: widget.garminApi,
        date: date,
        initialMetric: id,
        onDateChanged: (d) => setState(() => date = d),
      ),
    ),
  );
  Future<void> configureDock() async {
    final result = await Navigator.push<List<String>>(
      context,
      MaterialPageRoute(
        builder: (_) => DockSettingsPage(dock: dock, storage: widget.storage),
      ),
    );
    if (result != null && mounted) setState(() => dock = result);
  }

  Future<void> configureServer() async {
    final controller = TextEditingController(text: widget.api.baseUrl);
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('连接个人健康服务'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(
            labelText: '服务地址',
            helperText: '手机需能访问部署主机',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('连接'),
          ),
        ],
      ),
    );
    if (value == null || !mounted) return;
    try {
      final server = MealApi.normalizeServer(value);
      await widget.storage.write('settings', {'server': server});
      if (!mounted) return;
      setState(() {
        widget.api.baseUrl = server;
        widget.garminApi.baseUrl = server;
        serverVersion++;
        piKey = GlobalKey<PiChatState>();
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('服务地址已更新')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  Widget buildPage(String id) {
    if (!loaded.contains(id)) return const SizedBox.shrink();
    switch (id) {
      case 'memory':
        return MemoryPage(api: widget.garminApi);
      case 'feedback':
        return FeedbackPage(api: widget.garminApi);
      case 'home':
        return HomeDashboard(
          garminApi: widget.garminApi,
          storage: widget.storage,
          selectedDate: date,
          onDateChanged: (d) => setState(() => date = d),

          onMetric: metric,
          onStatus: () => navigate('journal'),
          onReports: reports,
          onNavigateTab: (i) => navigate(defaultDock[i.clamp(0, 3)]),
        );
      case 'reports':
        return ReportsPage(api: widget.garminApi);
      case 'trends':
        return TrendsPage(
          api: widget.garminApi,
          date: date,
          onDateChanged: (d) => setState(() => date = d),
        );
      case 'journal':
        return StatusPage(api: widget.garminApi);
      case 'activity_stats':
        return ActivityPage(
          key: const ValueKey('stats'),
          api: widget.garminApi,
          onModeChanged: (stats) =>
              navigate(stats ? 'activity_stats' : 'activity'),
        );
      case 'activity':
        return ActivityPage(
          key: const ValueKey('calendar'),
          api: widget.garminApi,
          initialStats: false,
          onModeChanged: (stats) =>
              navigate(stats ? 'activity_stats' : 'activity'),
        );
      case 'food':
        return Journal(
          key: ValueKey(mealRevision),
          api: widget.api,
          storage: widget.storage,
          onRecord: openMealSkill,
        );
      case 'recipes':
        return Scaffold(
          appBar: AppBar(title: const Text('食谱推荐')),
          body: RecipesPage(api: widget.garminApi),
        );
      case 'dietary_guidelines':
        return Scaffold(
          appBar: AppBar(title: const Text('膳食指南')),
          body: const GuidelinesPage(),
        );
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const HealthyBrand(), actions: const [ThemeToggle()]),
    body: !ready
        ? const Center(child: CircularProgressIndicator())
        : IndexedStack(
            key: ValueKey(serverVersion),
            index: more
                ? destinations.length + 1
                : page == "pi"
                ? destinations.length
                : destinations.indexWhere((d) => d.id == page),
            children: [
              ...destinations.map((d) => buildPage(d.id)),
              MealChatRecorder(
                key: piKey,
                api: widget.api,
                selectedDate: date,
                embedded: true,
                onSaved: () => setState(() => mealRevision++),
              ),
              MorePage(
                onAppUpdate: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => AppUpdatePage(baseUrl: widget.api.baseUrl),
                  ),
                ),
                dock: dock,
                onNavigate: navigate,
                onConfigureDock: configureDock,
                onConfigureServer: configureServer,
                onReportSettings: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => ReportSettings(api: widget.garminApi),
                  ),
                ),
              ),
            ],
          ),
    bottomNavigationBar: PiDock(
      dock: dock,
      selected: more || (!dock.contains(page) && page != 'pi') ? 'more' : page,
      onNavigate: !ready
          ? null
          : (id) {
              if (id == 'more') {
                setState(() => more = true);
              } else {
                navigate(id);
              }
            },
    ),
  );
}
