import 'package:healthy_mobile/widgets/pi_dock.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/main.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/pages/home_page.dart';

class MemoryStore extends MealLocalStore {
  final values = <String, Map<String, dynamic>>{};
  @override
  Future<Map<String, dynamic>?> read(String name) async => values[name];
  @override
  Future<void> write(String name, Map<String, dynamic> value) async {
    values[name] = jsonDecode(jsonEncode(value)) as Map<String, dynamic>;
  }

  @override
  Future<void> clear(String name) async {
    values.remove(name);
  }
}

http.Response jsonResponse(Object? data, [int statusCode = 200]) {
  return http.Response(
    jsonEncode(data),
    statusCode,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}

final sampleOverview = {
  'date': '2026-10-18',
  'source': 'Garmin Connect',
  'syncedAt': '2026-10-18T12:00:00.000Z',
  'deviceSyncedAt': '2026-10-18T11:45:00.000Z',
  'hasData': true,
  'metrics': {
    'sleepMinutes': 450,
    'bodyBattery': 78,
    'restingHeartRate': 58,
    'hrv': 45,
    'trainingReadiness': 65,
    'steps': 8420,
    'activityCount': 1,
  },
  'analysis': {
    'sleepScore': 82,
    'sleepQualifier': 'GOOD',
    'hrvStatus': 'BALANCED',
    'readinessLevel': 'WELL_RECOVERED',
    'sleepFeedback': '睡眠充足且深睡比例较高',
    'hrvFeedback': 'HRV 处于平衡区间',
    'readinessFeedback': '身体恢复良好，可以进行正常训练',
  },
  'daily': {
    'stepGoal': 10000,
    'calories': 2150,
    'activeCalories': 420,
    'restingCalories': 1730,
    'distanceKm': 6.2,
    'minHeartRate': 52,
    'maxHeartRate': 165,
    'averageStress': 28,
    'batteryCharged': 65,
    'batteryDrained': 55,
    'stressMinutes': {'rest': 480, 'low': 180, 'medium': 60, 'high': 20},
  },
  'sleep': {
    'start': '2026-10-17T23:15:00.000Z',
    'end': '2026-10-18T06:45:00.000Z',
    'stages': {'deep': 85, 'light': 230, 'rem': 95, 'awake': 40},
    'heartRate': [
      {'at': '2026-10-17T23:30:00.000Z', 'value': 56},
      {'at': '2026-10-18T03:30:00.000Z', 'value': 54},
    ],
  },
  'hrv': {
    'readings': [
      {'at': '2026-10-17T23:45:00.000Z', 'value': 46},
      {'at': '2026-10-18T04:00:00.000Z', 'value': 48},
    ],
  },
  'readiness': {
    'recoveryMinutes': 720,
    'acuteLoad': 350,
    'factors': [
      {'label': '睡眠评分', 'percent': 82, 'feedback': 'GOOD'},
      {'label': '恢复时间', 'percent': 90, 'feedback': 'WELL_RECOVERED'},
    ],
  },
  'batterySeries': [
    {'at': '2026-10-18T00:00:00.000Z', 'value': 85},
    {'at': '2026-10-18T12:00:00.000Z', 'value': 60},
  ],
  'recentActivities': [
    {
      'name': '晨跑 5 公里',
      'date': '2026-10-18',
      'time': '07:15',
      'durationMinutes': 32,
      'distanceKm': 5.02,
      'sport': 'running',
      'calories': 310,
    },
  ],
};

void main() {
  group('GarminApi', () {
    test('normalizeServer validates and strips trailing slash', () {
      expect(
        GarminApi.normalizeServer('http://localhost:3060/'),
        'http://localhost:3060',
      );
      expect(
        () => GarminApi.normalizeServer('ftp://example.com'),
        throwsException,
      );
    });

    test('fetchStatus handles ready response', () async {
      final api = GarminApi(
        client: MockClient((req) async {
          expect(req.url.path, '/api/health/status');
          return jsonResponse({'state': 'ready'});
        }),
      );
      final res = await api.fetchStatus();
      expect(res['state'], 'ready');
    });

    test('fetchOverview handles overview response', () async {
      final api = GarminApi(
        client: MockClient((req) async {
          expect(req.url.path, '/api/health/overview');
          expect(req.url.queryParameters['date'], '2026-10-18');
          expect(req.url.queryParameters['days'], '7');
          return jsonResponse(sampleOverview);
        }),
      );
      final res = await api.fetchOverview('2026-10-18');
      expect(res['hasData'], true);
      expect(res['metrics']['bodyBattery'], 78);
    });
  });

  group('HomeDashboard Widget', () {
    testWidgets(
      'renders a read-only cockpit with body, meals, reports and activity',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(800, 1600));
        addTearDown(() => tester.binding.setSurfaceSize(null));

        final garminClient = MockClient((req) async {
          if (req.url.path == '/api/health/status') {
            return jsonResponse({'state': 'ready'});
          }
          if (req.url.path == '/api/health/overview') {
            return jsonResponse(sampleOverview);
          }
          return jsonResponse({'error': 'not_found'}, 404);
        });

        final garminApi = GarminApi(client: garminClient);
        final storage = MemoryStore();

        await tester.pumpWidget(
          MaterialApp(
            home: HomeDashboard(
              garminApi: garminApi,
              storage: storage,
              selectedDate: '2026-10-18',
              onDateChanged: (_) {},
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Garmin 已连接'), findsOneWidget);
        expect(find.text('身体电量'), findsOneWidget);
        expect(find.text('昨夜睡眠'), findsOneWidget);
        expect(find.text('训练准备度'), findsOneWidget);
        expect(find.text('当日步数'), findsOneWidget);
        expect(find.byType(ActionChip), findsNothing);
        await tester.scrollUntilVisible(
          find.text('身体信号'),
          350,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('静息心率'), findsOneWidget);
        expect(find.text('夜间 HRV'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('健康报告'),
          350,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('日报'), findsOneWidget);
        expect(find.text('周报'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('运动与活动'),
          350,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('晨跑 5 公里'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'shows unconfigured message when Garmin state is not_configured',
      (tester) async {
        final garminClient = MockClient((req) async {
          return jsonResponse({'state': 'not_configured'});
        });

        final garminApi = GarminApi(client: garminClient);
        final storage = MemoryStore();

        await tester.pumpWidget(
          MaterialApp(
            home: HomeDashboard(
              garminApi: garminApi,
              storage: storage,
              selectedDate: '2026-10-18',
              onDateChanged: (_) {},
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('尚未配置 Garmin 连接'), findsOneWidget);
        expect(find.text('未配置 Garmin'), findsOneWidget);
      },
    );
  });

  group('MainShell NavigationBar', () {
    testWidgets(
      'shows configurable Dock and More, with reports accessible from More',
      (tester) async {
        final mockClient = MockClient((req) async {
          if (req.url.path == '/api/health/status') {
            return jsonResponse({'state': 'ready'});
          }
          if (req.url.path == '/api/health/overview') {
            return jsonResponse(sampleOverview);
          }
          if (req.url.path == '/api/nutrition-profile') {
            return jsonResponse({
              'status': 'ready',
              'profile': {'age_band': '18-49', 'sex': 'male'},
            });
          }
          if (req.url.path == '/api/meals') {
            return jsonResponse({'entries': []});
          }
          return jsonResponse({'error': 'not_found'}, 404);
        });

        final mealApi = MealApi(client: mockClient);
        final garminApi = GarminApi(client: mockClient);
        final storage = MemoryStore();

        await tester.pumpWidget(
          ZhixuApp(
            api: mealApi,
            garminApi: garminApi,
            storage: storage,
            initialIndex: 0,
          ),
        );
        await tester.pumpAndSettle();

        // 验证 5 个 M3 NavigationDestination 标签全部存在
        expect(find.text('健康首页'), findsWidgets);
        expect(find.text('生理指标'), findsOneWidget);
        expect(find.text('活动统计'), findsOneWidget);
        expect(find.descendant(of: find.byType(PiDock), matching: find.text('饮食记录')), findsOneWidget);
        expect(find.text('报告'), findsNothing);

        // 当前在 Tab 0: 今日
        expect(find.text('身体电量'), findsOneWidget);

        // 切换至 Tab 1: 趋势
        await tester.tap(find.text('生理指标'));
        await tester.pumpAndSettle();
        expect(find.text('生理指标'), findsWidgets);

        // 切换至 Tab 2: 运动
        await tester.tap(find.text('活动统计'));
        await tester.pumpAndSettle();
        expect(find.text('活动统计'), findsWidgets);

        // 切换至 Tab 3: 饮食
        await tester.tap(
          find.descendant(of: find.byType(PiDock), matching: find.text('饮食记录')),
        );
        await tester.pumpAndSettle();
        expect(find.text('饮食趋势'), findsOneWidget);
        expect(find.text('近 7 天摄入趋势'), findsNothing);

        await tester.tap(
          find.descendant(of: find.byType(PiDock), matching: find.text('健康首页')),
        );
        await tester.pumpAndSettle();
        expect(find.text('身体电量'), findsOneWidget);
        await tester.tap(find.text('更多'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('健康报告'));
        await tester.pumpAndSettle();
        expect(find.text('健康报告'), findsOneWidget);
        expect(find.text('日报'), findsOneWidget);
        await tester.tap(
          find.descendant(of: find.byType(PiDock), matching: find.text('健康首页')),
        );
        await tester.pumpAndSettle();
        expect(find.text('健康首页'), findsWidgets);
        expect(find.text('身体电量'), findsOneWidget);
      },
    );
  });
}
