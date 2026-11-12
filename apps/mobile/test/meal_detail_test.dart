import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/app_theme.dart';
import 'package:healthy_mobile/main.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/widgets/meal_energy.dart';
import 'package:healthy_mobile/widgets/meal_entry_widget.dart';
import 'widget_test.dart' show MemoryStore;

Map<String, dynamic> meal({double? calories = 700}) => {
  'id': 'detail-test',
  'version': 1,
  'date': dateText(shanghaiNow()),
  'kind': '午餐',
  'time': '12:30',
  'name': '米饭与鸡肉',
  'note': '少放酱汁',
  'nutrition_source': 'model_estimate',
  'photo_url': null,
  'items': [
    {
      'name': '米饭与鸡肉',
      'portion': '一份',
      'calories': calories,
      'protein_g': 35.0,
      'carbs_g': 80.0,
      'fat_g': 20.0,
    },
  ],
  'analysis': {
    'uncertainty': '按一份估算',
    'sources': [
      {'title': '营养参考', 'url': 'https://example.com/nutrition'},
    ],
  },
};
http.Response json(Object data, [int status = 200]) => http.Response(
  jsonEncode(data),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  test('energy deficit requires complete intake and synced expenditure', () {
    expect(MealEnergyDay('day', [meal()], 2200).deficit, 1500);
    expect(MealEnergyDay('day', [meal()], 600).deficit, -100);
    expect(MealEnergyDay('day', [meal(calories: 0)], 0).deficit, 0);
    expect(MealEnergyDay('day', [], 2200).deficit, isNull);
    expect(
      MealEnergyDay('day', [meal(), meal(calories: null)], 2200).deficit,
      isNull,
    );
    for (final value in [null, -1, double.nan, double.infinity]) {
      expect(MealEnergyDay('day', [meal()], value).deficit, isNull);
    }
  });

  testWidgets(
    'detail navigation, sources, edit refresh, cancel and confirmed deletion',
    (t) async {
      var entries = [meal()];
      final calls = <Uri>[];
      final api = MealApi(
        client: MockClient((req) async {
          calls.add(req.url);
          if (req.url.path == '/api/health/history') {
            return json({
              'points': [
                {'date': dateText(shanghaiNow()), 'value': 2200},
              ],
            });
          }
          if (req.url.path == '/api/nutrition-profile') {
            return json({'status': 'missing'});
          }
          if (req.method == 'PUT') {
            entries = [
              {...jsonDecode(req.body) as Map<String, dynamic>, 'version': 2},
            ];
            return json({'entry': entries.single});
          }
          if (req.method == 'DELETE') {
            entries = [];
            return json({'deleted': true});
          }
          return json({'entries': entries});
        }),
      );
      await t.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          theme: healthTheme(Brightness.light),
          home: Journal(api: api, storage: MemoryStore()),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('近 7 天热量平衡'), findsNothing);
      await t.tap(find.text('饮食趋势'));
      await t.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byType(MealEnergyChart),
          matching: find.text('1500'),
        ),
        findsOneWidget,
      );
      await t.tap(find.text('饮食趋势'));
      await t.pumpAndSettle();
      expect(
        calls.any(
          (u) =>
              u.queryParameters['metric'] == 'calories' &&
              u.queryParameters['days'] == '30',
        ),
        isTrue,
      );
      await t.scrollUntilVisible(
        find.byType(MealEntryWidget),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await t.ensureVisible(find.text('米饭与鸡肉').first);
      await t.pumpAndSettle();
      await t.tap(find.text('米饭与鸡肉').first);
      await t.pumpAndSettle();
      expect(find.text('餐食详情'), findsOneWidget);
      expect(find.text('食物明细'), findsOneWidget);
      await t.scrollUntilVisible(
        find.text('联网参考'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await t.tap(find.text('联网参考'));
      await t.pumpAndSettle();
      expect(find.text('https://example.com/nutrition'), findsOneWidget);
      await t.tapAt(const Offset(20, 100));
      await t.pumpAndSettle();
      await t.tap(find.text('编辑'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).first, '更新后的午餐');
      FocusManager.instance.primaryFocus?.unfocus();
      await t.pumpAndSettle();
      await t.scrollUntilVisible(
        find.byType(CheckboxListTile),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await t.pumpAndSettle();
      await t.tap(find.byType(CheckboxListTile));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(FilledButton, '保存修改'));
      await t.pumpAndSettle();
      expect(find.text('餐食详情'), findsOneWidget);
      await t.scrollUntilVisible(
        find.text('更新后的午餐'),
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('更新后的午餐'), findsOneWidget);
      await t.scrollUntilVisible(
        find.text('删除'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await t.tap(find.text('删除'));
      await t.pumpAndSettle();
      await t.tap(find.text('取消'));
      await t.pumpAndSettle();
      expect(find.text('餐食详情'), findsOneWidget);
      expect(entries, hasLength(1));
      await t.tap(find.text('删除'));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(FilledButton, '删除'));
      await t.pumpAndSettle();
      expect(find.text('餐食详情'), findsNothing);
      expect(entries, isEmpty);
      expect(
        calls
            .lastWhere((u) => u.path.contains('detail-test'))
            .queryParameters['version'],
        '2',
      );
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'failed Garmin request preserves meals and retry restores balance',
    (t) async {
      var failed = true;
      final api = MealApi(
        client: MockClient((req) async {
          if (req.url.path == '/api/health/history') {
            if (failed) return json({'error': 'unavailable'}, 503);
            return json({
              'points': [
                {'date': dateText(shanghaiNow()), 'value': 600},
              ],
            });
          }
          if (req.url.path == '/api/nutrition-profile') {
            return json({'status': 'missing'});
          }
          return json({
            'entries': [meal()],
          });
        }),
      );
      await t.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          home: Journal(api: api, storage: MemoryStore()),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.text('饮食趋势'));
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('消耗读取失败，点击重试'));
      await t.pumpAndSettle();
      expect(find.text('消耗读取失败，点击重试'), findsOneWidget);
      failed = false;
      await t.tap(find.text('消耗读取失败，点击重试'));
      await t.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byType(MealEnergyChart),
          matching: find.text('热量盈余'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(MealEnergyChart),
          matching: find.text('100'),
        ),
        findsOneWidget,
      );
      await t.scrollUntilVisible(
        find.byType(MealEntryWidget),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.byType(MealEntryWidget), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('multi-photo detail opens a swipeable full-screen viewer', (
    t,
  ) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(
      MaterialApp(
        theme: healthTheme(Brightness.light),
        home: Scaffold(
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              MealEntryWidget(
                meal: {
                  ...meal(),
                  'photo_urls': [
                    '/api/meals/detail-test/photos/0',
                    '/api/meals/detail-test/photos/1',
                  ],
                  'photo_url': '/api/meals/detail-test/photos/0',
                },
                baseUrl: 'http://localhost:3060',
                profile: {'sex': 'male', 'age': '18-49'},
                detail: true,
                onEdit: () {},
                onDelete: () {},
              ),
            ],
          ),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    await t.tap(find.byKey(const ValueKey('meal-detail-photo-0')));
    await t.pumpAndSettle();
    expect(find.text('1 / 2'), findsOneWidget);
    await t.drag(find.byType(PageView), const Offset(-320, 0));
    await t.pumpAndSettle();
    expect(find.text('2 / 2'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  for (final width in [320.0, 390.0, 430.0]) {
    for (final brightness in Brightness.values) {
      testWidgets('detail fits $width in $brightness', (t) async {
        await t.binding.setSurfaceSize(Size(width, 844));
        addTearDown(() => t.binding.setSurfaceSize(null));
        await t.pumpWidget(
          MaterialApp(
            theme: healthTheme(brightness),
            home: Scaffold(
              body: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  MealEntryWidget(
                    meal: meal(),
                    baseUrl: 'http://localhost:3060',
                    profile: {'sex': 'male', 'age': '18-49'},
                    detail: true,
                    onEdit: () {},
                    onDelete: () {},
                    onShowSources: () {},
                  ),
                ],
              ),
            ),
          ),
        );
        await t.pumpAndSettle();
        await t.scrollUntilVisible(
          find.text('删除'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        expect(t.takeException(), isNull);
        expect(find.text('合计'), findsOneWidget);
        for (final text in ['编辑', '删除', '联网参考']) {
          final rect = t.getRect(find.text(text));
          expect(rect.left, greaterThanOrEqualTo(16));
          expect(rect.right, lessThanOrEqualTo(width - 16));
        }
      });
    }
  }
}
