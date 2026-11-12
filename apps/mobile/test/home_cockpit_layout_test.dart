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
import 'package:healthy_mobile/widgets/home/module_summaries.dart';
import 'home_dashboard_test.dart'
    show MemoryStore, sampleOverview, jsonResponse;

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
        testWidgets(
          'cockpit fits $width $brightness scale $scale and expands reports in place',
          (tester) async {
            await tester.binding.setSurfaceSize(Size(width, 844));
            addTearDown(() => tester.binding.setSurfaceSize(null));
            final client = MockClient((req) async {
              switch (req.url.path) {
                case '/api/health/status':
                  return jsonResponse({'state': 'ready'});
                case '/api/health/overview':
                  return jsonResponse(sampleOverview);
                case '/api/health-reports':
                  return jsonResponse({
                    'reports': [
                      {
                        'id': req.url.queryParameters['kind'],
                        'state': 'completed',
                        'period_start': '2026-10-17',
                        'title': '身体与饮食回顾',
                        'summary': List.filled(
                          8,
                          '今日记录显示睡眠、运动与饮食的变化，保持规律作息并关注身体感受。',
                        ).join(),
                      },
                    ],
                  });
                case '/api/meals':
                  return jsonResponse({
                    'summary': {
                      'meals': 1,
                      'totals': {
                        'calories': {'value': 580, 'complete_meals': 1},
                        'protein_g': {'value': 34.5, 'complete_meals': 1},
                        'carbs_g': {'value': 65.8, 'complete_meals': 1},
                        'fat_g': {'value': null, 'complete_meals': 0},
                      },
                    },
                    'entries': [
                      {
                        'time': '12:30',
                        'kind': '午餐',
                        'name': '米饭、鸡肉与蔬菜',
                        'nutrition_source': 'model_estimate',
                        'items': [
                          {'name': '米饭', 'calories': 250},
                          {'name': '鸡肉与蔬菜', 'calories': 330},
                        ],
                      },
                    ],
                  });
                default:
                  return jsonResponse({'entries': []});
              }
            });
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
                  home: HomeDashboard(
                    garminApi: GarminApi(client: client),
                    storage: MemoryStore(),
                    selectedDate: '2026-10-18',
                    onDateChanged: (_) {},
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
                final frame = await boundary.toImage(pixelRatio: 2);
                final bytes = (await frame.toByteData(
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
            expect(find.byType(ActionChip), findsNothing);
            await tester.scrollUntilVisible(
              find.text('米饭、鸡肉与蔬菜'),
              200,
              scrollable: find.byType(Scrollable).first,
            );
            expect(tester.takeException(), isNull);
            final expand = find.byTooltip('展开摘要').first;
            for (var i = 0; i < 30 && tester.getCenter(expand).dy > 760; i++) {
              await tester.drag(
                find.byType(ListView).first,
                const Offset(0, -180),
              );
              await tester.pumpAndSettle();
            }
            expect(tester.getCenter(expand).dy, lessThan(800));
            await shot('report');
            await tester.tap(find.byTooltip('展开摘要').first);
            await tester.pumpAndSettle();
            expect(find.byTooltip('收起摘要'), findsOneWidget);
            final expandedText = find
                .descendant(
                  of: find.byType(CockpitReportExcerpt).first,
                  matching: find.byType(Text),
                )
                .first;
            expect(
              tester.getTopLeft(find.byTooltip('收起摘要')).dy,
              greaterThanOrEqualTo(tester.getBottomLeft(expandedText).dy),
            );
            expect(find.byType(HomeDashboard), findsOneWidget);
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
  testWidgets(
    'meal partial totals remain visible when Garmin and reports fail',
    (tester) async {
      final client = MockClient((req) async {
        if (req.url.path == '/api/meals') {
          return jsonResponse({
            'summary': {
              'meals': 2,
              'totals': {
                'calories': {'value': 0, 'complete_meals': 1},
              },
            },
            'entries': [],
          });
        }
        return jsonResponse({'error': 'reports_unavailable'}, 503);
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ModuleSummaries(
                api: GarminApi(client: client),
                date: '2026-10-18',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('0*'), findsOneWidget);
      expect(find.text('读取失败，请刷新'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );
}
