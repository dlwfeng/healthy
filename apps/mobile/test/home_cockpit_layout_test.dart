import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:healthy_mobile/app_theme.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/pages/home_page.dart';
import 'home_connect_test.dart' show connectResponse;
import 'home_dashboard_test.dart' show MemoryStore, jsonResponse;

void main() {
  final preview = Platform.environment['HEALTH_LAYOUT_PREVIEW'];
  setUpAll(() async {
    final path = Platform.environment['HEALTH_LAYOUT_FONT'];
    if (path == null) return;
    final font = FontLoader('HealthPreview')
      ..addFont(
        Future.value(ByteData.sublistView(await File(path).readAsBytes())),
      );
    await font.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(
        Future.value(
          ByteData.sublistView(
            await File(
              '${Platform.environment['HEALTH_LAYOUT_FLUTTER']}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
            ).readAsBytes(),
          ),
        ),
      );
    await icons.load();
  });
  for (final width in [320.0, 390.0, 430.0]) {
    for (final brightness in Brightness.values) {
      for (final scale in [1.0, 1.5]) {
        testWidgets('connect home fits $width $brightness scale $scale', (
          tester,
        ) async {
          await tester.binding.setSurfaceSize(Size(width, 844));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          final client = MockClient(
            (req) async => jsonResponse(
              connectResponse(req.url.path, req.url.queryParameters),
            ),
          );
          final key = GlobalKey();
          await tester.pumpWidget(
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
                home: Scaffold(
                  body: HomeDashboard(
                    garminApi: GarminApi(client: client),
                    storage: MemoryStore(),
                    selectedDate: '2020-01-01',
                    onDateChanged: (_) {},
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          Future<void> shot(String name) async {
            if (preview == null || width != 390 || scale != 1) return;
            final boundary =
                key.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary;
            await tester.runAsync(() async {
              final frame = await boundary.toImage(pixelRatio: 2),
                  bytes = (await frame.toByteData(
                    format: ui.ImageByteFormat.png,
                  ))!;
              await Directory(preview).create(recursive: true);
              await File(
                '$preview/home-$name-${brightness.name}.png',
              ).writeAsBytes(bytes.buffer.asUint8List());
              frame.dispose();
            });
          }

          await shot('top');
          expect(find.byTooltip('前一天'), findsNothing);
          expect(find.byTooltip('展开摘要'), findsNothing);
          expect(tester.takeException(), isNull);
          for (final title in ['训练准备程度', '蛋白质', '身体成分', '日报正文入口']) {
            await tester.scrollUntilVisible(
              find.text(title).hitTestable(),
              350,
              scrollable: find.byType(Scrollable).first,
              maxScrolls: 100,
            );
            await tester.pumpAndSettle();
            expect(
              tester.takeException(),
              isNull,
              reason: '$title at $width $brightness scale $scale',
            );
            await shot(
              title == '蛋白质'
                  ? 'food'
                  : title == '身体成分'
                  ? 'body'
                  : title == '日报正文入口'
                  ? 'reports'
                  : 'exercise',
            );
          }
          expect(find.text('占每日参考上限 120%'), findsOneWidget);
        });
      }
    }
  }
  testWidgets(
    'nutrition zero and partial sums survive Garmin module failures',
    (tester) async {
      final client = MockClient((request) async {
        if (request.url.path == '/api/meals') {
          return jsonResponse({
            'summary': {
              'meals': 2,
              'totals': {
                'calories': {'value': 0, 'complete_meals': 1},
                'protein_g': {'value': 0, 'complete_meals': 1},
              },
            },
            'entries': [],
          });
        }
        return jsonResponse({'error': 'garmin_unavailable'}, 503);
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeDashboard(
            garminApi: GarminApi(client: client),
            storage: MemoryStore(),
            selectedDate: '2020-01-01',
            onDateChanged: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('部分合计'), findsWidgets);
      expect(find.textContaining('0 kcal', findRichText: true), findsOneWidget);
      expect(find.text('每日参考暂不可用'), findsNWidgets(3));
      expect(tester.takeException(), isNull);
    },
  );
}
