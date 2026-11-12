import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/main_shell.dart';
import 'package:healthy_mobile/pages/trends_page.dart';
import 'package:healthy_mobile/pages/activity_page.dart';
import 'package:healthy_mobile/pages/food_page.dart';
import 'package:healthy_mobile/pages/reports_page.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';
import 'support/report_webview.dart';

http.Response json(Object data, [int status = 200]) => http.Response(
  jsonEncode(data),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
Future<void> phone(WidgetTester t, Widget child) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(MaterialApp(home: child));
  await t.pumpAndSettle();
}

class DelayedStore extends MealLocalStore {
  final ready = Completer<Map<String, dynamic>?>();
  @override
  Future<Map<String, dynamic>?> read(String name) => ready.future;
}

void main() {
  testWidgets('startup waits for saved service address before any request', (
    t,
  ) async {
    final hosts = <String>[];
    final store = DelayedStore();
    final client = MockClient((req) async {
      hosts.add(req.url.host);
      return json({'points': []});
    });
    await t.pumpWidget(
      MaterialApp(
        home: MainShell(
          api: MealApi(client: client),
          garminApi: GarminApi(client: client),
          storage: store,
          initialIndex: 1,
        ),
      ),
    );
    await t.pump();
    expect(hosts, isEmpty);
    store.ready.complete({'server': 'http://saved-host:3060'});
    await t.pumpAndSettle();
    expect(hosts, isNotEmpty);
    expect(hosts.toSet(), {'saved-host'});
  });
  testWidgets(
    'trend metric and range requests preserve null and zero observations',
    (t) async {
      final requests = <Uri>[];
      final api = GarminApi(
        client: MockClient((req) async {
          requests.add(req.url);
          return json({
            'points': [
              {'date': '2026-10-17', 'value': 20},
              {'date': '2026-10-18', 'value': null},
              {'date': '2026-10-19', 'value': 0},
            ],
            'source': 'Garmin Connect',
          });
        }),
      );
      await phone(
        t,
        TrendsPage(api: api, date: '2026-10-19', onDateChanged: (_) {}),
      );
      expect(find.text('有效观测 2/7 天；空缺表示未记录，断点不连线。'), findsOneWidget);
      await t.tap(find.text('近 30 天'));
      await t.pumpAndSettle();
      expect(requests.last.queryParameters['days'], '30');
      await t.tap(find.text('睡眠时长').first);
      await t.pumpAndSettle();
      expect(requests.last.queryParameters['metric'], 'sleep');
      await t.tap(find.text('逐日观测'));
      await t.pumpAndSettle();
      expect(find.text('未记录'), findsOneWidget);
      expect(find.text('0 min'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'calendar stats exclude planned workouts and course steps are readable',
    (t) async {
      final now = shanghaiNow(), today = dateText(shanghaiNow());
      final api = GarminApi(
        client: MockClient((req) async {
          if (req.url.path == '/api/health/activities') {
            return json({
              'items': [
                {
                  'id': '1',
                  'name': '晨跑',
                  'date': today,
                  'sport': 'running',
                  'distanceMeters': 5000,
                  'durationSeconds': 1800,
                },
              ],
            });
          }
          if (req.url.path.contains('/workouts/')) {
            return json({
              'workout': {
                'description': '轻松训练',
                'steps': [
                  {
                    'type': 'repeat',
                    'iterations': 3,
                    'steps': [
                      {
                        'type': 'interval',
                        'endCondition': 'time',
                        'value': 120,
                      },
                    ],
                  },
                ],
              },
            });
          }
          return json({
            'month': '${now.year}-${now.month}',
            'items': [
              {
                'id': 'activity:1',
                'kind': 'activity',
                'name': '晨跑',
                'date': today,
                'sport': 'running',
                'distanceKm': 5,
                'durationMinutes': 30,
              },
              {
                'id': 'workout:2',
                'kind': 'workout',
                'workoutId': '2',
                'name': '间歇课程',
                'date': today,
                'sport': 'running',
                'durationMinutes': 20,
              },
            ],
            'unavailable': ['get_calendar'],
          });
        }),
      );
      await phone(t, ActivityPage(api: api));
      expect(find.text('活动次数'), findsOneWidget);
      expect(find.text('累计距离'), findsOneWidget);
      expect(find.text('间歇课程'), findsNothing);
      await t.tap(find.text('训练计划'));
      await t.pumpAndSettle();
      expect(find.textContaining('部分 Garmin'), findsOneWidget);
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('间歇课程'));
      await t.tap(find.text('间歇课程'));
      await t.pumpAndSettle();
      expect(find.text('重复组 × 3'), findsOneWidget);
      expect(find.text('持续 2 分钟'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'recipe search encodes Chinese and exposes ingredients and steps',
    (t) async {
      String? query;
      final api = GarminApi(
        client: MockClient((req) async {
          if (req.url.path == '/api/recipes/1') {
            return json({
              'recipe': {
                'title': '番茄汤',
                'ingredients': [
                  {'original_text': '番茄 200g'},
                ],
                'steps': ['切块', '煮熟'],
                'source_title': '食谱书',
                'source_page': 3,
              },
            });
          }
          query = req.url.queryParameters['q'];
          return json({
            'recipes': [
              {'id': '1', 'title': '番茄汤', 'category': '汤'},
            ],
            'categories': [
              {'category': '汤'},
            ],
            'total': 1,
          });
        }),
      );
      await phone(t, Scaffold(body: RecipesPage(api: api)));
      await t.enterText(find.byType(TextField), '番茄 & 豆');
      await t.pump(const Duration(milliseconds: 400));
      await t.pumpAndSettle();
      expect(query, '番茄 & 豆');
      await t.tap(find.text('番茄汤'));
      await t.pumpAndSettle();
      expect(find.text('番茄 200g'), findsOneWidget);
      expect(find.text('1. 切块'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('report reader loads web document with its CSS and SVG intact', (
    t,
  ) async {
    const document =
        '<!doctype html><html><head>'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<style>.cards{display:grid;gap:18px;color:#123456}</style>'
        '</head><body><h2>恢复趋势</h2><p>睡眠稳定</p>'
        '<svg viewBox="0 0 100 50"><path d="M0 50 L100 0"/></svg>'
        '<table><tr><td>450 min</td></tr></table>'
        '<details><summary>展开依据</summary>记录</details></body></html>';
    final platform = ReportWebViewPlatform();
    WebViewPlatform.instance = platform;
    final api = GarminApi(
      client: MockClient(
        (req) async => json({
          'report': {
            'title': '一周回顾',
            'period_start': '2026-10-12',
            'html': '<p>不应使用未包装的原始正文</p>',
            'evidence': {'sleep': '原始记录'},
          },
          'render': {'document': document},
        }),
      ),
    );
    await phone(t, ReportDetail(api: api, id: '1'));
    expect(
      platform.controller.document,
      document.replaceFirst('<html>', '<html data-theme="light">'),
    );
    expect(platform.controller.scriptMode, JavaScriptMode.disabled);
    expect(
      await platform.controller.navigation.navigate!(
        const NavigationRequest(url: 'https://example.com', isMainFrame: true),
      ),
      NavigationDecision.prevent,
    );
    expect(find.byType(ListView), findsNothing);
    await t.tap(find.byTooltip('报告操作'));
    await t.pumpAndSettle();
    await t.tap(find.text('报告数据来源'));
    await t.pumpAndSettle();
    expect(find.text('原始记录'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('report document failure offers retry without text fallback', (
    t,
  ) async {
    var requests = 0;
    final api = GarminApi(
      client: MockClient((req) async {
        requests++;
        return json({
          'report': {'html': '<p>旧正文</p>'},
        });
      }),
    );
    await phone(t, ReportDetail(api: api, id: '1'));
    expect(find.text('报告文档不可用，请稍后重试。'), findsOneWidget);
    await t.tap(find.text('重试'));
    await t.pumpAndSettle();
    expect(requests, 2);
    expect(find.text('旧正文'), findsNothing);
  });
  testWidgets(
    'report schedules save only allowed fields and recover from errors',
    (t) async {
      Map<String, dynamic>? saved;
      final api = GarminApi(
        client: MockClient((req) async {
          if (req.method == 'PATCH') {
            saved = jsonDecode(req.body);
            return json({'schedules': []});
          }
          return json({
            'schedules': [
              {
                'kind': 'daily',
                'enabled': true,
                'timezone': 'Asia/Shanghai',
                'local_time': '08:00',
                'weekday': 1,
                'next_run_at': '2026-10-21T00:00:00Z',
              },
            ],
          });
        }),
      );
      await phone(t, ReportSettings(api: api));
      await t.tap(find.byType(Switch));
      await t.tap(find.text('保存设置'));
      await t.pumpAndSettle();
      final schedule = (saved!['schedules'] as List).first as Map;
      expect(schedule['enabled'], false);
      expect(schedule.containsKey('next_run_at'), false);
      expect(find.text('定时报告设置已保存'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('offline reports show retry and reload successfully', (t) async {
    int calls = 0;
    final api = GarminApi(
      client: MockClient((req) async {
        calls++;
        return calls == 1
            ? json({'error': 'reports_unavailable'}, 503)
            : json({'reports': [], 'next_cursor': null});
      }),
    );
    await phone(t, ReportsPage(api: api));
    await t.tap(find.text('重试'));
    await t.pumpAndSettle();
    expect(find.textContaining('暂无报告'), findsOneWidget);
    expect(calls, 2);
  });
  testWidgets(
    'report regeneration confirms the exact period and prevents duplicate submissions',
    (t) async {
      WebViewPlatform.instance = ReportWebViewPlatform();
      Map<String, dynamic>? body;
      final api = GarminApi(
        client: MockClient((req) async {
          if (req.method == 'POST') {
            body = jsonDecode(req.body);
            return json({
              'run': {'state': 'queued'},
            });
          }
          return json({
            'render': {'document': '<html><body>正文</body></html>'},
            'report': {
              'kind': 'weekly',
              'title': '回顾',
              'period_start': '2026-10-12',
              'html': '<p>正文</p>',
            },
          });
        }),
      );
      await phone(t, ReportDetail(api: api, id: '1'));
      await t.tap(find.byTooltip('报告操作'));
      await t.pumpAndSettle();
      await t.tap(find.text('重新生成此报告'));
      await t.pumpAndSettle();
      expect(body, isNull);
      await t.tap(find.text('重新生成'));
      await t.pumpAndSettle();
      expect(body!['kind'], 'weekly');
      expect(body!['period_start'], '2026-10-12');
      expect(body!['regenerate'], true);
      await t.tap(find.byTooltip('报告操作'));
      await t.pumpAndSettle();
      expect(find.text('已提交重新生成'), findsOneWidget);
    },
  );
}
