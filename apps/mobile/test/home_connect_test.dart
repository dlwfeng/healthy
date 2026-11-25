import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/pages/home_page.dart';
import 'package:healthy_mobile/pages/reports_page.dart';
import 'home_dashboard_test.dart'
    show MemoryStore, jsonResponse, sampleOverview;

Map<String, dynamic> connectResponse(String path, Map<String, String> query) =>
    switch (path) {
      '/api/health/status' => {'state': 'ready'},
      '/api/health/overview' => sampleOverview,
      '/api/health/body-status' => {
        'training': {
          'status': 4,
          'load': {
            'acute': 616,
            'chronic': 591,
            'ratio': 1,
            'min': 470,
            'max': 880,
          },
          'focus': {
            'feedback': 'AEROBIC_LOW_SHORTAGE',
            'categories': [
              {'label': '低强度有氧', 'value': 102, 'min': 348, 'max': 867},
            ],
          },
        },
        'hrv': {'weeklyAverage': 62, 'baselineLow': 54, 'baselineHigh': 72},
        'intensity': {'total': 87, 'goal': 300, 'moderate': 43, 'vigorous': 22},
        'fitnessAge': {'value': 29, 'chronological': 34, 'achievable': 28},
        'lastActivity': {
          'name': '羽毛球',
          'sport': 'badminton',
          'durationMinutes': 118,
          'calories': 914,
          'averageHeartRate': 131,
        },
      },
      '/api/body/measurements' => {
        'latest': {
          'measuredAt': '2026-10-17T01:00:00Z',
          'weightKg': 71.5,
          'bodyFatPct': 21,
          'bmi': 23.8,
          'bodyWaterPct': 54.2,
          'muscleRatePct': 53.6,
          'boneMassKg': 2.87,
          'basalMetabolismKcal': 1513,
          'visceralFat': 11,
          'proteinPct': 20.8,
          'bodyScore': 86,
        },
        'daily': [],
      },
      '/api/nutrition-profile' => {
        'status': 'ready',
        'profile': {'age_band': '18-49', 'sex': 'male'},
      },
      '/api/meals' => {
        'summary': {
          'meals': 1,
          'totals': {
            'calories': {'value': 900, 'complete_meals': 1},
            'protein_g': {'value': 42, 'complete_meals': 1},
            'carbs_g': {'value': 183, 'complete_meals': 1},
            'fat_g': {'value': 90, 'complete_meals': 1},
          },
        },
        'entries': [
          {
            'time': '12:00',
            'kind': '午餐',
            'name': '午餐记录',
            'items': [
              {'calories': 900, 'protein_g': 42, 'carbs_g': 183, 'fat_g': 90},
            ],
          },
        ],
      },
      '/api/health-reports' => {
        'reports': [
          {
            'id': query['kind'] == 'daily' ? '66' : '63',
            'state': 'completed',
            'period_start': '2026-10-17',
            'period_end_exclusive': '2026-10-18',
            'title': '${query['kind'] == 'daily' ? '日报' : '周报'}正文入口',
            'summary': '根据已记录的数据回顾身体、饮食与运动。',
          },
        ],
      },
      _ => {'entries': [], 'points': []},
    };

void main() {
  testWidgets(
    'home always requests today, shows six regions and daily nutrient references',
    (tester) async {
      final dates = <String>[];
      final api = GarminApi(
        client: MockClient((request) async {
          if (request.url.queryParameters['date'] case final String date) {
            dates.add(date);
          }
          return jsonResponse(
            connectResponse(request.url.path, request.url.queryParameters),
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: HomeDashboard(
            garminApi: api,
            storage: MemoryStore(),
            selectedDate: '2020-01-01',
            onDateChanged: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      for (final title in ['摘要', '运动', '饮食', '身体成分', '报告', '个人记录']) {
        expect(find.text(title), findsOneWidget);
      }
      expect(find.byTooltip('前一天'), findsNothing);
      expect(find.byTooltip('后一天'), findsNothing);
      expect(dates, everyElement(dateText(shanghaiNow())));
      expect(find.text('每日参考 56–84 g'), findsOneWidget);
      expect(find.text('占每日参考上限 50%'), findsNWidgets(2));
      expect(find.text('占每日参考上限 120%'), findsOneWidget);
      expect(find.textContaining('71.5', findRichText: true), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('report card opens its own report instead of the archive', (
    tester,
  ) async {
    final paths = <String>[];
    final api = GarminApi(
      client: MockClient((request) async {
        paths.add(request.url.path);
        if (request.url.path == '/api/health-reports/66') {
          return jsonResponse({'error': 'not_found'}, 404);
        }
        return jsonResponse(
          connectResponse(request.url.path, request.url.queryParameters),
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: HomeDashboard(
          garminApi: api,
          storage: MemoryStore(),
          selectedDate: '2020-01-01',
          onDateChanged: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    final report = find.byKey(const ValueKey('home-report-66'));
    await tester.scrollUntilVisible(
      report.hitTestable(),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(report.hitTestable());
    await tester.pumpAndSettle();
    expect(find.byType(ReportDetail), findsOneWidget);
    expect(tester.widget<ReportDetail>(find.byType(ReportDetail)).id, '66');
    expect(find.byType(ReportsPage), findsNothing);
    expect(paths, contains('/api/health-reports/66'));
    expect(tester.takeException(), isNull);
  });
}
