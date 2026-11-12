import 'package:healthy_mobile/widgets/pi_dock.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/main.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/navigation.dart';
import 'package:healthy_mobile/pages/more_page.dart';
import 'package:healthy_mobile/app_theme.dart';

class Store extends MealLocalStore {
  final data = <String, Map<String, dynamic>>{};
  @override
  Future<void> clear(String name) async {
    data.remove(name);
  }

  @override
  Future<Map<String, dynamic>?> read(String name) async => data[name];
  @override
  Future<void> write(String name, Map<String, dynamic> value) async {
    data[name] = jsonDecode(jsonEncode(value));
  }
}

void main() {
  testWidgets(
    'raised 健康助手 button remains reachable above the bottom safe area',
    (t) async {
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetDevicePixelRatio);
      addTearDown(t.view.resetPhysicalSize);
      for (final width in [320.0, 400.0]) {
        t.view.physicalSize = Size(width, 800);
        for (final brightness in Brightness.values) {
          String? selected;
          await t.pumpWidget(
            MaterialApp(
              theme: healthTheme(brightness),
              home: MediaQuery(
                data: MediaQueryData(
                  size: Size(width, 800),
                  padding: const EdgeInsets.only(bottom: 24),
                ),
                child: Scaffold(
                  bottomNavigationBar: PiDock(
                    dock: defaultDock,
                    selected: 'home',
                    onNavigate: (id) => selected = id,
                  ),
                ),
              ),
            ),
          );
          await t.pumpAndSettle();
          final pi = find.byKey(const ValueKey('dock-pi'));
          final home = find.byKey(const ValueKey('dock-home'));
          final rect = t.getRect(pi);
          expect(rect.width, greaterThanOrEqualTo(56));
          expect(rect.center.dx, width / 2);
          expect(rect.top, lessThan(t.getTopLeft(home).dy));
          expect(rect.bottom, lessThan(800 - 24));
          // The protruding part must itself be clickable, not just its center.
          await t.tapAt(Offset(rect.center.dx, rect.top + 4));
          expect(selected, 'pi');
          await t.tap(find.byKey(const ValueKey('dock-more')));
          expect(selected, 'more');
          expect(t.takeException(), isNull);
        }
      }
    },
  );
  test('invalid saved Dock recovers and unknown IDs are ignored', () {
    expect(readDock([]), defaultDock);
    expect(readDock(['unknown']), defaultDock);
    expect(readDock(['recipes', 'recipes', 'trends', 'unknown']), [
      'recipes',
      'trends',
    ]);
  });
  test(
    'report destination follows home and menu labels and icons are unique',
    () {
      expect(destinations.take(2).map((d) => d.id), ['home', 'reports']);
      expect(destinations.every((d) => d.label.trim().isNotEmpty), isTrue);
      expect(destinations.map((d) => d.label).toSet().length, destinations.length);
      expect(
        destinations.map((d) => d.icon).toSet().length,
        destinations.length,
      );
      expect(readDock(['home', 'reports']), ['home', 'reports']);
    },
  );
  testWidgets('report menu opens and can be selected in the Dock', (t) async {
    final store = Store();
    store.data['navigation'] = {
      'dock': ['home', 'reports'],
    };
    final client = MockClient(
      (r) async => http.Response(
        jsonEncode({'state': 'not_configured', 'entries': [], 'reports': []}),
        200,
      ),
    );
    await t.pumpWidget(
      ZhixuApp(
        api: MealApi(client: client),
        garminApi: GarminApi(client: client),
        storage: store,
      ),
    );
    await t.pumpAndSettle();
    await t.tap(find.text('更多'));
    await t.pumpAndSettle();
    final more = find.byType(MorePage);
    final home = find.descendant(of: more, matching: find.text('健康首页'));
    final report = find.descendant(of: more, matching: find.text('健康报告'));
    expect(t.getTopLeft(report).dy, greaterThan(t.getTopLeft(home).dy));
    await t.tap(report);
    await t.pumpAndSettle();
    expect(t.widget<PiDock>(find.byType(PiDock)).selected, 'reports');
    expect(find.text('健康报告'), findsWidgets);
    expect(t.takeException(), isNull);
  });
  testWidgets('More retains web hierarchy and a non-Dock page is reachable', (
    t,
  ) async {
    final store = Store();
    store.data['navigation'] = {
      'dock': ['food', 'home'],
    };
    final client = MockClient(
      (r) async => http.Response(
        jsonEncode(
          r.url.path == '/api/health/status'
              ? {'state': 'not_configured'}
              : r.url.path == '/api/recipes'
              ? {'recipes': [], 'categories': [], 'total': 0}
              : {'entries': [], 'reports': []},
        ),
        200,
      ),
    );
    await t.pumpWidget(
      ZhixuApp(
        api: MealApi(client: client),
        garminApi: GarminApi(client: client),
        storage: store,
      ),
    );
    await t.pumpAndSettle();
    expect(t.widget<PiDock>(find.byType(PiDock)).dock, ['food', 'home']);
    await t.tap(
      find.descendant(of: find.byType(PiDock), matching: find.text('饮食记录')),
    );
    await t.pumpAndSettle();
    expect(find.byTooltip('连接设置'), findsNothing);
    await t.tap(find.text('更多'));
    await t.pumpAndSettle();
    expect(find.text('身体状态'), findsOneWidget);
    expect(find.text('运动训练'), findsOneWidget);
    await t.drag(find.byType(ListView).last, const Offset(0, -300));
    await t.pumpAndSettle();
    expect(find.text('饮食营养'), findsOneWidget);
    await t.ensureVisible(find.text('食谱推荐'));
    await t.tap(find.text('食谱推荐'));
    await t.pumpAndSettle();
    expect(find.textContaining('尚未提供个性化推荐'), findsOneWidget);
    expect(t.widget<PiDock>(find.byType(PiDock)).selected, 'more');
    expect(t.takeException(), isNull);
  });
  testWidgets('Dock order is saved and survives a new app instance', (t) async {
    final store = Store();
    await t.pumpWidget(
      MaterialApp(
        home: DockSettingsPage(dock: const ['home', 'food'], storage: store),
      ),
    );
    final list = t.widget<ReorderableListView>(
      find.byType(ReorderableListView),
    );
    list.onReorderItem!(1, 0);
    await t.pumpAndSettle();
    await t.tap(find.text('保存'));
    await t.pumpAndSettle();
    expect(store.data['navigation']!['dock'], ['food', 'home']);
    expect(t.takeException(), isNull);
  });
  testWidgets('header toggles Light and Dark, persists and restores choice', (
    t,
  ) async {
    final store = Store();
    final client = MockClient(
      (r) async => http.Response(
        jsonEncode({'state': 'not_configured', 'entries': [], 'reports': []}),
        200,
      ),
    );
    Widget app(Key key) => ZhixuApp(
      key: key,
      api: MealApi(client: client),
      garminApi: GarminApi(client: client),
      storage: store,
    );
    await t.pumpWidget(app(const ValueKey(1)));
    await t.pumpAndSettle();
    expect(find.byTooltip('连接设置'), findsNothing);
    await t.tap(find.byTooltip('切换到 Dark'));
    await t.pumpAndSettle();
    expect(
      Theme.of(t.element(find.byType(PiDock))).brightness,
      Brightness.dark,
    );
    expect(store.data['appearance']!['theme'], 'dark');
    await t.pumpWidget(app(const ValueKey(2)));
    await t.pumpAndSettle();
    expect(
      Theme.of(t.element(find.byType(PiDock))).brightness,
      Brightness.dark,
    );
    await t.tap(find.byTooltip('切换到 Light'));
    await t.pumpAndSettle();
    expect(
      Theme.of(t.element(find.byType(PiDock))).brightness,
      Brightness.light,
    );
    expect(t.takeException(), isNull);
  });
}
