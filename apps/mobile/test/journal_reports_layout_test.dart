import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/app_theme.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/main.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/pages/reports_page.dart';
import 'package:healthy_mobile/widgets/meal_entry_widget.dart';
import 'meal_detail_test.dart' show meal;
import 'widget_test.dart' show MemoryStore;

http.Response response(Object data) => http.Response(
  jsonEncode(data),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  final preview = Platform.environment['HEALTH_LAYOUT_PREVIEW'];
  setUpAll(() async {
    final fontPath = Platform.environment['HEALTH_LAYOUT_FONT'];
    if (fontPath != null) {
      final loader = FontLoader('HealthPreview');
      loader.addFont(
        Future.value(ByteData.sublistView(await File(fontPath).readAsBytes())),
      );
      await loader.load();
      final icons = FontLoader('MaterialIcons');
      icons.addFont(
        Future.value(
          ByteData.sublistView(
            await File(
              '${Platform.environment['HEALTH_LAYOUT_FLUTTER']}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
            ).readAsBytes(),
          ),
        ),
      );
      await icons.load();
    }
  });

  for (final width in [320.0, 390.0, 430.0]) {
    for (final brightness in Brightness.values) {
      for (final scale in [1.0, 1.5]) {
        testWidgets('journal and reports fit $width $brightness text $scale', (
          t,
        ) async {
          await t.binding.setSurfaceSize(Size(width, 844));
          addTearDown(() => t.binding.setSurfaceSize(null));
          final client = MockClient((req) async {
            if (req.url.path == '/api/health-reports') {
              final weekly = req.url.queryParameters['kind'] == 'weekly';
              return response({
                'reports': [
                  {
                    'id': 'ready',
                    'title': weekly ? '这一周，找回身体的节奏' : '保持好状态，从规律的一餐开始',
                    'period_start': '2026-10-26',
                    'state': 'completed',
                    'generated_at': '2026-10-27',
                    'summary': '睡眠、运动与饮食的每日回顾。查看身体数据的变化，了解值得继续保持的习惯。',
                  },
                  {
                    'id': 'pending',
                    'period_start': '2026-10-25',
                    'state': 'queued',
                  },
                ],
                'next_cursor': null,
              });
            }
            if (req.url.path == '/api/nutrition-profile') {
              return response({
                'status': 'ready',
                'profile': {'sex': 'male', 'age_band': '18-49'},
              });
            }
            if (req.url.path == '/api/health/history') {
              return response({
                'points': [
                  {'date': dateText(shanghaiNow()), 'value': 2200},
                ],
              });
            }
            return response({
              'entries': [meal()],
            });
          });
          final key = GlobalKey();
          Future<void> mount(Widget page) async {
            await t.pumpWidget(
              RepaintBoundary(
                key: key,
                child: MaterialApp(
                  debugShowCheckedModeBanner: false,
                  theme: healthTheme(brightness).copyWith(
                    textTheme: healthTheme(brightness).textTheme.apply(
                      fontFamily: preview == null ? null : 'HealthPreview',
                    ),
                  ),
                  builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(
                      context,
                    ).copyWith(textScaler: TextScaler.linear(scale)),
                    child: child!,
                  ),
                  home: page,
                ),
              ),
            );
            await t.pumpAndSettle();
          }

          Future<void> shot(String name) async {
            if (preview == null || width != 390 || scale != 1) return;
            final boundary =
                key.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary;
            await t.runAsync(() async {
              final frame = await boundary.toImage(pixelRatio: 2);
              final bytes = (await frame.toByteData(
                format: ui.ImageByteFormat.png,
              ))!;
              await Directory(preview).create(recursive: true);
              await File(
                '$preview/$name-${brightness.name}.png',
              ).writeAsBytes(bytes.buffer.asUint8List());
              frame.dispose();
            });
          }

          await mount(
            Journal(
              api: MealApi(client: client),
              storage: MemoryStore(),
            ),
          );
          expect(find.text('今日摄入'), findsOneWidget);
          expect(find.text('近 7 天热量平衡'), findsNothing);
          await shot('journal');
          await t.scrollUntilVisible(
            find.byType(MealEntryWidget),
            160,
            scrollable: find.byType(Scrollable).first,
          );
          await t.ensureVisible(find.text('米饭与鸡肉').first);
          await t.pumpAndSettle();
          await t.tap(find.text('米饭与鸡肉').first);
          await t.pumpAndSettle();
          expect(find.text('餐食详情'), findsOneWidget);
          await shot('meal-detail');
          await t.scrollUntilVisible(
            find.text('删除'),
            180,
            scrollable: find.byType(Scrollable).first,
          );
          expect(t.takeException(), isNull);
          // A fresh root avoids reusing journal route and scroll state.
          await t.pumpWidget(const SizedBox());
          await mount(ReportsPage(api: GarminApi(client: client)));
          expect(find.text('阅读报告'), findsOneWidget);
          expect(find.text('保持好状态，从规律的一餐开始'), findsOneWidget);
          await shot('reports');
          await t.tap(find.text('周报'));
          await t.pumpAndSettle();
          expect(find.text('这一周，找回身体的节奏'), findsOneWidget);
          await t.tap(find.byTooltip('选择历史周期生成'));
          await t.pumpAndSettle();
          expect(find.byType(DatePickerDialog), findsOneWidget);
          await t.tap(find.text('Cancel'));
          await t.pumpAndSettle();
          expect(t.takeException(), isNull);
          await t.pumpWidget(const SizedBox());
        });
      }
    }
  }
}
